# FLUX AI — Implementation Reference

> **Status:** Current as of Batch 7 (multi-expense pipeline, observability, precise watermark).  
> **Historical design specs:** [`ai_integration.md`](ai_integration.md) (Phase 0 prompt), [`ai_integration_phase0_audit.md`](ai_integration_phase0_audit.md) (Phase 0 output).

This document is the **living source of truth** for what is implemented in `src/ai/`. For API env vars and endpoint tables, see [`../README.md`](../README.md).

---

## Batch status

| Batch | Deliverable | Key files |
| --- | --- | --- |
| **1** | Gemini provider, Zod schemas, health check, debounce config | `provider/gemini.provider.ts`, `config.ts` |
| **2** | LangGraph dry-run via `POST /ai/run`; intent + single expense extraction | `graph/flux.graph.ts`, `graph-runner.service.ts` |
| **3** | `createExpenseTool` wired into graph; expenses persisted from chat | `tools/create-expense.tool.ts`, `nodes/create-expense.node.ts` |
| **4** | Automatic chat: debounce → orchestrator → assistant message + Socket.IO | `debounce.service.ts`, `orchestrator.service.ts` |
| **5** | `conversation_ai_states` persistence; draft survives across turns | `conversation-ai-state.service.ts` |
| **6** | Query/update intents; `searchExpensesTool`, `spendingSummaryTool`, `updateExpenseTool` | `nodes/query-expenses.node.ts`, `nodes/update-expense.node.ts` |
| **7** | Multi-expense extraction/create, grounded replies, precise watermark, observability | `schemas/expense-extractions.schema.ts`, `utils/compute-last-processed-message-id.ts`, `services/ai-execution.service.ts` |
| **A / A.1** | Fixed category taxonomy; free-text `subCategory`; `categoryLabel` on API | `constants/expense-categories.ts`, `services/expense.service.ts` |
| **B** | Extraction + replies use slug storage, display titles in chat | `prompts/extract-expense.prompt.ts`, `utils/format-created-expenses-reply.ts` |

Tests: `tests/multi-expense-integration.test.ts`, `tests/ai-graph.test.ts`, `tests/ai-orchestrator.test.ts`, `tests/compute-last-processed-message-id.test.ts`.

---

## End-to-end chat flow

```text
POST /threads/:id/messages
  → messageService.create (user message)
  → publishMessageCreated (Socket.IO)
  → aiDebounceService.scheduleUserMessage (trailing-edge timer, AI_DEBOUNCE_MS)

After quiet period:
  → orchestratorService.processTurn
      → conversationAiStateService.resolveMessageBatch (watermark + DB re-fetch + cap)
      → graphRunnerService.run (LangGraph)
      → messageService.createAssistant (role: assistant, expenseIds[])
      → publishMessageCreated (Socket.IO)
      → conversationAiStateService.recordSuccessfulTurn (watermark + draft)
```

**Requirements:** `GEMINI_API_KEY` must be set. If unset, debounce still runs but orchestrator returns early.

**Manual override:** `POST /ai/run` runs the graph without persisting an assistant message (useful for debugging).

---

## LangGraph pipeline

```text
load_context
  → classify_intent          (LLM — lite tier)
  → extract_expense            (LLM — standard tier)   [create_expense intent]
  → extract_query              (LLM — standard tier)   [query_expenses intent]
  → extract_update             (LLM — standard tier)   [update_expense intent]
  → create_expense             (0 LLM — loops createExpenseTool)
  → query_expenses / update_expense (0 LLM — service tools)
  → build_reply                (deterministic or LLM — lite tier)
  → END
```

### Intents

| Intent | Extract node | Action node | Reply |
| --- | --- | --- | --- |
| `create_expense` | `extract_expense` | `create_expense` (if creatable) | Deterministic if 2+ created; LLM if single/clarification |
| `query_expenses` | `extract_query` | `query_expenses` | LLM summary of results |
| `update_expense` | `extract_update` | `update_expense` | LLM confirmation |
| `general_chat` | — | — | LLM |
| `clarification` | — | — | LLM ack |
| `unknown` | — | — | LLM fallback |

---

## Multi-expense pipeline (Batch 7)

One user turn can produce **multiple expenses** from one or more messages in the debounced batch.

### Extraction contract

`extract_expense` returns (via `expenseExtractionsSchema`):

```json
{
  "expenses": [
    {
      "sourceMessageId": "<messageId from batch>",
      "amount": 50,
      "category": "food_and_dining",
      "subCategory": "Snacks",
      "direction": "debit",
      "note": "snack",
      "dateHint": "today"
    }
  ],
  "skippedMessageIds": ["<non-expense message ids>"]
}
```

- `category` — canonical slug (aliases like `food` → `food_and_dining` are normalized on save)
- `subCategory` — optional free-text label (e.g. `"WiFi Recharge"`); not validated against suggestions
- `direction` — `"debit"` (spent, default) or `"credit"` (received)

Legacy single-expense and flat-array shapes are normalized for backward compatibility.

### Normalization (`normalizeExtractedExpenses`)

- Merges persisted draft when continuing a clarification turn
- Resolves `sourceMessageId` from LLM hint or message content heuristics
- Applies defaults: currency from user prefs, date from `dateHint` / message timestamp (UTC)
- Computes `missingFields` per item (`amount`, `category`)
- **Dedupes** identical expenses (amount, category, subCategory, direction, note, date)
- Outputs `ExtractedExpenseItem[]` with `{ draft, sourceMessageId, missingFields }`

### Create loop (`createExpenseNode`)

- Creates all items where `missingFields.length === 0` via `createExpenseTool`
- Partial failure: logs warning; returns successfully created expenses
- Links each expense to its `sourceMessageId`

### Watermark (`computeLastProcessedMessageId`)

For `create_expense` intent, `lastProcessedMessageId` advances only through **handled** messages in batch order:

| Message situation | Handled? |
| --- | --- |
| In `skippedMessageIds` (small talk) | Yes |
| Extracted with missing fields (clarification pending) | Yes |
| Duplicate content of an earlier handled message | Yes |
| Expense extracted and created (matches `createdExpenses`) | Yes |
| Expense message not yet extracted/created | **No — watermark stops here** |

For non-`create_expense` intents, watermark advances to the last message in the batch.

### Batch cap

`AI_MAX_BATCH_MESSAGES` (default `10`, max `50`) caps messages per turn via `capMessageBatch`. Excess messages remain for the next debounced turn.

### Persisted draft after partial create

`resolvePersistedExpenseDraft` keeps the **first incomplete** extracted expense when some items were created but others need clarification. Cleared when all creatable items are created.

---

## Reply generation

| Outcome | Mode | Source |
| --- | --- | --- |
| 2+ expenses created | **Deterministic** | `formatCreatedExpensesReply` — no LLM |
| 1 expense created | LLM | Grounded on serialized expense only (no raw batch text) |
| Needs clarification | LLM | Asks for one missing field |
| Query / update / chat | LLM | Grounded on tool results |

Deterministic multi-create example (uses `categoryLabel`, never slugs):

```text
All set — here's what I logged:
- **₹50.00** for Food & Dining · Snacks (snack)
- **₹100.00** for Food & Dining · Groceries (grocery)
```

Orchestrator **does not** persist an assistant message if `assistantReply` is empty.

---

## Assistant message persistence

```text
orchestratorService.processTurn
  → messageService.createAssistant(userId, threadId, content, expenseIds?)
      → messageRepository.create (role: assistant)
      → addExpenseId for each created expense
      → increment assistantMessageCount
      → publishMessageCreated (Socket.IO message.created)
```

Assistant messages use the **thread owner's `userId`** on the message document. The frontend must filter realtime events by `role`, not `userId` alone (see `frontend/docs/chat.md`).

---

## Model selection and fallback

| Call site | Tier | Default env var |
| --- | --- | --- |
| `classify_intent`, `build_reply` | lite | `GEMINI_MODEL_LITE` |
| `extract_expense`, `extract_query`, `extract_update` | standard | `GEMINI_MODEL_STANDARD` (falls back to `GEMINI_MODEL`) |

When `AI_MODEL_FALLBACK_ENABLED=true`, failed **retryable** errors advance through `GEMINI_MODEL_FALLBACK` chain via `generateWithModelFallback`.

**Note:** Logging event `ai_llm_model_fallback_success` fires whenever the model used differs from `GEMINI_MODEL`, including intentional lite-tier routing — not only true fallbacks.

---

## Observability

| Feature | Env / access |
| --- | --- |
| Structured logs (`aiLogger`) | Always on in dev |
| Persist executions to MongoDB | `AI_PERSIST_EXECUTIONS=true` |
| List executions for thread | `GET /api/v1/ai/executions?threadId=&limit=` |
| Error events | `ERROR_LOG_Persist=true` → `error_events` collection |
| Full LLM response text | Logged at info on every call; parsed payload when `AI_LOG_LLM_PAYLOADS=true` |

Key log events: `ai_execution_started`, `ai_llm_raw_response`, `ai_llm_call`, `ai_build_reply_generated`, `ai_execution_complete`, `ai_orchestrator_failed`.

Execution summary `model` field reflects the **first successful** LLM call, not every step.

---

## Environment variables

See `.env.example` for the full list. AI-specific:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required for AI chat |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Default / health ping model |
| `GEMINI_MODEL_LITE` | — | classify + build_reply |
| `GEMINI_MODEL_STANDARD` | `GEMINI_MODEL` | extraction calls |
| `GEMINI_MODEL_FALLBACK` | comma-separated | Fallback chain |
| `AI_MODEL_FALLBACK_ENABLED` | `true` | Enable model chain on retryable errors |
| `AI_DEBOUNCE_MS` | `1500` | Trailing-edge debounce before AI turn |
| `AI_MAX_BATCH_MESSAGES` | `10` | Max messages per orchestrator batch |
| `AI_REPLY_MAX_CHARS` | `500` | Reply length cap |
| `AI_LOG_LLM_PAYLOADS` | `false` | Debug parsed LLM JSON |
| `AI_PERSIST_EXECUTIONS` | `true` | Store runs in `ai_executions` |
| `ERROR_LOG_PERSIST` | `true` | Store AI errors in `error_events` |

---

## `conversation_ai_states` document

One document per thread:

| Field | Purpose |
| --- | --- |
| `lastProcessedMessageId` | Watermark — only unprocessed user messages are batched next turn |
| `expenseDraft` | Partial expense awaiting clarification |
| `missingRequiredFields` | Fields still needed |
| `currentIntent` | Active intent while draft is open |
| `version` | Optimistic concurrency on updates |

---

## Known limitations

- **In-process debounce only** — no distributed lock; multiple API instances could double-process (future: Redis lock or queue).
- **No orchestrator user-facing message** on total LLM failure (errors logged; no assistant bubble).
- **Validation/JSON errors** may retry through the full model chain even when non-retryable (planned fix).
- **Group read receipts** not implemented; watermark is per-thread, not per-user.
