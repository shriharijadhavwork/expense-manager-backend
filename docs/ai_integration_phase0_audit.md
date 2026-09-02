# FLUX Agentic AI — Phase 0 Architecture Audit

> **Status:** Complete. Awaiting explicit approval before Phase 1.
>
> **Scope:** Repository inspection + architecture proposal only. No LangGraph, Gemini, or AI packages installed.

---

## 1. Current Architecture Assessment

### Layering

FLUX backend follows a consistent layered architecture:

```text
HTTP (Express 5)
  → routes/          (mount paths, auth, validation)
  → controllers/     (request/response mapping)
  → services/        (business rules, orchestration)
  → repositories/    (MongoDB access)
  → models/          (Mongoose schemas)
```

Supporting layers:

| Layer | Role |
| --- | --- |
| `schemas/` | Zod validation for HTTP inputs |
| `middlewares/` | Auth (`authenticate`), rate limits, error handling |
| `realtime/` | Socket.IO publisher for `message.created` events |
| `jobs/` | Background tasks (e.g. recycle-bin purge) |
| `migrations/` | Idempotent data backfills |
| `config/` | Env, DB, constants |
| `utils/` | Shared helpers (`api-error`, thread title, message window) |

### Request flow (example: create message)

```text
POST /api/v1/threads/:id/messages
  → authenticate middleware (JWT)
  → validateRequest (Zod)
  → messageController.create
  → messageService.create
      → threadService.requireAccessibleThread (ownership)
      → assertThreadAcceptsUserMessage (24h + 100-msg rules)
      → messageRepository.create
      → threadRepository.incrementMessageCounts
      → threadRepository.updateById (lastActivityAt)
      → publishMessageCreated (Socket.IO)
```

### Database

- **MongoDB** via Mongoose 9
- Connection in `config/database.ts`
- In-memory MongoDB used in Vitest integration tests

### Realtime

- Socket.IO adapter in `realtime/adapters/socketio.adapter.ts`
- `publishMessageCreated` emits after message persist
- Thread rooms joined on client connect (see `realtime-socketio-plan.md`)

### Jobs

- `jobs/purge-recycle-bin.ts` — soft-deleted thread cleanup (cron-ready, not in-process scheduled)
- No job queue (Bull, SQS, etc.) today

### Error handling

- `ApiError` with HTTP status codes
- Global `errorHandler` middleware
- Zod validation errors → 400

### Logging

- `console.warn` / `console.error` in a few places (group system messages)
- No structured logging or APM yet

---

## 2. Existing Thread/Message Architecture

### Thread model (`models/thread.model.ts`)

| Field | Purpose |
| --- | --- |
| `type` | `personal` \| `group` |
| `userId` / `groupId` | Ownership scope |
| `createdBy` | Creator |
| `dayKey` + `sequence` | Daily thread numbering per user/group |
| `title` | Display title |
| `status` | `active` \| `archived` |
| `deletedAt` | Soft delete (recycle bin) |
| `lastActivityAt` | Sorting + unread |
| `readAt` | Per-user read cursor (personal) |
| **`messageWindowEndsAt`** | **Creation + 24h — user messages allowed until this time** |
| **`userMessageCount`** | **Count of `role: user` messages (incremented on create)** |
| **`assistantMessageCount`** | **Reserved for FLUX agent replies (default 0)** |

### Message model (`models/message.model.ts`)

| Field | Purpose |
| --- | --- |
| `threadId` | Parent thread |
| `userId` | Author |
| `role` | `user` \| `assistant` \| `system` \| `tool` |
| `content` | Text (max 10k) |
| `attachmentIds` | File refs |
| `expenseIds` | Linked expenses |

### Relationships

```text
User ──owns──► personal Thread ──has many──► Message
Group ──has──► group Thread ──has many──► Message
Message ──may link──► Expense (via expenseIds + sourceThreadId/sourceMessageId)
```

### Ownership enforcement

- Personal: `thread.userId === authenticated user`
- Group: active `groupMember` record required
- `threadService.requireAccessibleThread` is the single gate used by message and expense flows

### Message limits (implemented pre-AI)

Constants in `config/thread.constants.ts`:

- `THREAD_MESSAGE_WINDOW_HOURS = 24`
- `THREAD_MAX_USER_MESSAGES = 100`

Enforcement in `messageService.create` via `assertThreadAcceptsUserMessage` (`utils/thread-message-window.ts`):

- Rejects if `now > messageWindowEndsAt`
- Rejects if `userMessageCount >= 100`
- Only **user** messages increment `userMessageCount`
- System/assistant/tool messages do not count toward the limit

API exposes computed `acceptsUserMessages` on `SafeThread` responses.

### Lifecycle

```text
Create thread → messageWindowEndsAt = createdAt + 24h, counts = 0
User sends message → persist → increment userMessageCount
After 24h or 100 user messages → new user messages rejected (start new thread)
Soft delete → recycle bin (7 days) → optional permanent delete
```

### Conversational APIs

| Endpoint | Purpose |
| --- | --- |
| `POST /threads` | Create personal thread |
| `GET /threads` | List with last message |
| `POST /threads/:id/messages` | Create user message |
| `GET /threads/:id/messages` | Paginated history |

Group threads created via `groupService` → `threadService.createForGroup`.

---

## 3. Existing Expense Architecture

### Model (`models/expense.model.ts`)

| Field | Required | Notes |
| --- | --- | --- |
| `userId` | Yes | Owner |
| `amount` | Yes | Positive number |
| `currency` | Yes | ISO 4217 (default INR) |
| `category` | Yes | Lowercase string |
| `note` | Yes | Default `""` |
| `date` | Yes | UTC date-only |
| `groupId` | No | Set for group-linked expenses |
| `sourceThreadId` | No | Chat provenance |
| `sourceMessageId` | No | Chat provenance |

### Service (`services/expense.service.ts`)

- `create` — standard REST CRUD
- `createFromChat` — **already exists for AI tools**; links expense to thread/message, sets `groupId` for group threads
- `list`, `getById`, `update`, `search` — query/filter

### Validation (`schemas/expense.schema.ts`)

Required to create: `amount`, `category`, `date`, `currency` (defaulted). `note` optional (defaults empty).

### Splitting logic

**Not implemented.** No participant splits, paid-by, or balance tracking in expense model. Group expenses only store `groupId` — no per-person allocation.

### AI implications

| Field | AI must extract | Safe default | Must clarify | Never guess |
| --- | --- | --- | --- | --- |
| `amount` | Yes | — | If ambiguous | Yes |
| `category` | Yes | — | If unclear | Yes |
| `date` | Yes | Today (user TZ) | If relative date unclear | No — ask |
| `currency` | Yes | User preference / INR | If mixed currencies | Yes |
| `note` | Optional | From user text | — | — |
| `groupId` | From thread context | — | — | Never from LLM alone |
| Splits / participants | N/A today | — | Future phase | Yes |

---

## 4. Proposed AI Integration Point

### Where debounce + agent should hook in

**After** `messageService.create` succeeds, **before** any LLM call:

```text
messageController.create
  → messageService.create          (persist + enforce limits + realtime)
  → aiDebounceService.schedule(threadId, userId)   ← NEW (Phase 4)
       ↓ (after ~2s inactivity)
  → aiOrchestrator.processTurn(threadId, userId)   ← NEW (Phase 4)
       ↓
  → LangGraph graph.invoke
       ↓
  → tools → existing services
       ↓
  → messageService.createAssistant (Phase 4) → increment assistantMessageCount
```

**Do not** call the LLM inside `messageController` synchronously.

**Do not** bypass `messageService` for user messages.

### Recommended file (Phase 4)

```text
src/services/ai/
  debounce.service.ts      # in-process setTimeout map per threadId
  orchestrator.service.ts  # loads context, invokes graph, persists assistant reply
```

Hook from `message.service.ts` at the end of `create` (fire-and-forget schedule) or via an event emitter if we want looser coupling later.

---

## 5. Proposed AI Directory (minimum for Phase 1+)

Only add when Phase 1 is approved:

```text
src/
  ai/
    config.ts                 # GEMINI_API_KEY, DEBOUNCE_MS, model name
    provider/
      gemini.provider.ts      # LLM abstraction
    graph/
      flux.graph.ts           # LangGraph definition (Phase 2)
      state.ts                # Runtime state types (Phase 2)
    tools/
      create-expense.tool.ts  # Phase 3 — calls expenseService.createFromChat
    schemas/
      agent-output.schema.ts  # Zod for structured LLM JSON
    services/
      debounce.service.ts     # Phase 4
      orchestrator.service.ts # Phase 4
      conversation-ai-state.service.ts  # Phase 5
```

**Do not create these folders in Phase 0.**

---

## 6. LangGraph State Proposal

### Runtime state (in-memory per graph invocation)

```typescript
type FluxGraphState = {
  threadId: string;
  userId: string;
  messageBatchIds: string[];       // IDs from debounced window
  recentMessages: SafeMessage[];   // last N for context
  aiState: ConversationAiState;    // loaded from DB
  intent?: string;
  expenseDraft?: Partial<CreateExpenseInput>;
  missingFields?: string[];
  toolResults?: unknown[];
  assistantReply?: string;
  error?: string;
};
```

### Persistent AI state (`conversation_ai_state` — Phase 5)

Separate document, 1:1 with thread:

```typescript
type ConversationAiState = {
  threadId: ObjectId;
  userId: ObjectId;
  currentIntent?: string;
  expenseDraft?: {
    amount?: number;
    category?: string;
    note?: string;
    date?: string;
    currency?: string;
  };
  missingRequiredFields?: string[];
  lastProcessedMessageId?: ObjectId;
  lastProcessedAt?: Date;
  summary?: string;              // optional rolling summary
  version: number;               // optimistic concurrency
};
```

### Canonical records (unchanged)

- **Messages** = full conversation history (source of truth)
- **Thread** = container + window/count metadata
- **Expense** = financial records via existing service

---

## 7. MongoDB Persistence Strategy

### Recommendation: separate `conversation_ai_states` collection

| Approach | Pros | Cons |
| --- | --- | --- |
| Embedded in Thread | Fewer queries | Thread doc grows; mixed concerns |
| **Separate collection** | Clean separation; versioned updates; AI can evolve independently | Extra lookup |

**Chosen:** `conversation_ai_states` collection with unique index on `threadId`.

Survives logout/login/restart/deployment — stored in MongoDB like all other data.

Thread fields (`messageWindowEndsAt`, `userMessageCount`, `assistantMessageCount`) already on Thread for fast enforcement without loading AI state.

---

## 8. 24-Hour Thread + 100 User Message Rule

### Where rules live

| Layer | Responsibility |
| --- | --- |
| `config/thread.constants.ts` | `THREAD_MESSAGE_WINDOW_HOURS`, `THREAD_MAX_USER_MESSAGES` |
| `utils/thread-message-window.ts` | Pure check functions |
| `messageService.create` | **Enforcement** (application layer) |
| `threadRepository.create` | Sets `messageWindowEndsAt` at creation |
| `threadRepository.incrementMessageCounts` | Atomic `$inc` on user/assistant counts |

### AI interaction

- LangGraph **must not** re-implement these rules
- AI orchestrator calls `messageService` paths that already enforce limits
- When window closed, user must create a new thread — AI state starts fresh on new thread (Phase 5)
- Assistant messages use `assistantMessageCount` (increment when Phase 4 adds assistant persist helper)

### Counting rules

| Role | Counts toward 100? |
| --- | --- |
| `user` | Yes |
| `assistant` | No (tracked separately) |
| `system` | No |
| `tool` | No |

---

## 9. Debounce / Message Aggregation

### POC location

`src/ai/services/debounce.service.ts` (Phase 4):

```typescript
// Per-thread trailing-edge timer
const timers = new Map<string, NodeJS.Timeout>();

function schedule(threadId: string, userId: string) {
  clearTimeout(timers.get(threadId));
  timers.set(threadId, setTimeout(() => {
    void orchestrator.processTurn(threadId, userId);
  }, env.AI_DEBOUNCE_MS)); // default 2000
}
```

### Flow

1. Each user message persisted immediately (normal `messageService.create`)
2. Debounce timer reset on every new user message in same thread
3. After 2s quiet, orchestrator loads all unprocessed user messages since `lastProcessedMessageId`
4. Single LangGraph invocation for the batch
5. Assistant reply persisted as one `role: assistant` message

### Production migration path

```text
POC: in-process setTimeout (single Node instance)
  ↓
Scale: Redis-backed debounce OR
       EventBridge Scheduler one-shot per thread OR
       SQS delay queue per thread
```

Existing `jobs/` pattern can host a worker; no new infra required for POC.

---

## 10. Expense AI Workflow

```text
Natural language (user message batch)
  ↓
LangGraph: classify intent → extract_expense
  ↓
Structured JSON (Zod validate)
  ↓
Check required fields: amount, category, date, currency
  ↓
Missing? → assistant asks minimum clarification (no expense write)
  ↓
Complete? → expenseService.createFromChat(userId, threadId, messageId, input)
  ↓
Link expense to message (already implemented)
  ↓
Deterministic assistant reply builder (not raw LLM prose to DB)
```

Ambiguous splits: **ask** — splitting not in expense model yet.

---

## 11. Tool Architecture

### First tool (Phase 3): `createExpenseTool`

```text
createExpenseTool(args, context)
  → validates context.userId, context.threadId from auth (not LLM)
  → expenseService.createFromChat(context.userId, context.threadId, context.messageId, args)
  → returns SafeExpense
```

### Future tools (Phase 6+)

- `searchExpensesTool` → `expenseService.search`
- `updateExpenseTool` → `expenseService.update`
- `getMonthlyTotalTool` → new query method on expense service

All tools receive `ToolContext { userId, threadId, messageId }` from orchestrator — never from LLM output.

---

## 12. Model / Provider Architecture

### Minimum abstraction (Phase 1)

```typescript
interface LlmProvider {
  generateStructured<T>(input: {
    system: string;
    messages: ChatMessage[];
    schema: ZodSchema<T>;
  }): Promise<T>;
}
```

Single implementation: `GeminiProvider` using `@google/generative-ai`.

Env: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.0-flash`).

No multi-model routing in Phase 1.

---

## 13. Conversation Context Architecture

Context assembly for each AI turn (Phase 5):

```text
1. messageBatch        — user messages since lastProcessedMessageId
2. recentMessages      — last 20 messages from messageRepository (roles all)
3. conversationAiState — from conversation_ai_states collection
4. userPreferences     — currency, timezone from userPreferencesRepository
5. thread metadata     — type, groupId, messageWindowEndsAt, counts
6. toolResults         — from current graph step only (runtime)
```

Token budget: prioritize message batch + draft state + last 10 messages; summarize older if needed (Phase 5 optional).

---

## 14. Image / Receipt Future Architecture

Fit without implementing now:

```text
User uploads file → fileService (existing Cloudinary)
  → message with attachmentIds
  → debounce → orchestrator
  → graph node: extract_receipt (Gemini vision)
  → structured fields → same expense draft flow
```

`attachmentIds` already on Message model. Vision node is Phase 6+.

---

## 15. Observability Audit

### Existing

- Vitest integration tests (threads, messages, expenses, groups)
- `ApiError` with codes
- Health endpoint (`GET /api/v1/health`)
- Socket.IO for realtime message delivery

### Missing for AI

- AI execution ID / correlation ID per turn
- LLM latency + token usage logging
- Tool call audit trail
- Structured JSON logs
- Metrics (Prometheus/Datadog)
- Graph step tracing
- Failed extraction / validation counters

Phase 7 should add `ai_executions` collection or structured log events.

---

## 16. Security / Multi-Tenant Isolation

### Existing guarantees

- JWT auth on all thread/message/expense routes
- `requireAccessibleThread` enforces user/group membership
- Repositories scope by `userId` on personal data
- Expense queries filter by `userId`

### AI-specific rules

1. **Tool context** built from authenticated `req.user.id` — never from LLM
2. **Thread/message IDs** in tool calls validated against `requireAccessibleThread`
3. **Never trust** LLM-supplied `userId`, `threadId`, or `groupId`
4. **Prompt injection**: system prompt instructs tools-only for mutations; structured output schema
5. **Rate limiting**: existing `express-rate-limit` on auth; add per-user AI turn limits in Phase 8

---

## 17. Minimum Architecture to Start Phase 1

### Do in Phase 1

- `src/ai/config.ts` + env vars
- `GeminiProvider` abstraction
- Basic `ai.service.ts` health check / echo structured call
- Zod output schemas foundation

### Do NOT introduce yet

| Technology | Reason |
| --- | --- |
| LangGraph | Phase 2 |
| Redis | In-process debounce sufficient for POC |
| Kafka / RabbitMQ | No async pipeline need yet |
| Pinecone / vector DB | No RAG requirement identified |
| Separate AI microservice | Monolith layering is sufficient |
| EventBridge / Kinesis | Phase 4 POC uses setTimeout |

### Prerequisites complete

- Thread message window + count fields ✅
- `expenseService.createFromChat` ✅
- Message roles including `assistant` ✅
- Realtime publish path ✅

---

## Pre-Phase-1 Implementation Note

The following was implemented **before** this audit per product requirements (not part of Phase 0 doc scope, but required for AI rules):

| Change | Location |
| --- | --- |
| `messageWindowEndsAt`, `userMessageCount`, `assistantMessageCount` on Thread | `models/thread.model.ts` |
| Constants `THREAD_MESSAGE_WINDOW_HOURS`, `THREAD_MAX_USER_MESSAGES` | `config/thread.constants.ts` |
| Enforcement + increment on user message | `message.service.ts` |
| `assertThreadAcceptsUserMessage` | `utils/thread-message-window.ts` |
| Tests | `tests/thread-message-window.test.ts`, `tests/message.test.ts` |

New threads created after this change get window/count fields automatically at creation time.

---

## STOP — Awaiting Approval

Phase 0 is complete. **Do not proceed to Phase 1** until explicitly approved.

Next step when approved: Phase 1 — AI foundation (provider abstraction, Gemini, env config, minimal `src/ai/` directory).
