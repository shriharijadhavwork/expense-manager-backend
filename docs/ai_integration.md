# FLUX Agentic AI Integration — Phase 0 Architecture Audit

We are introducing an Agentic AI layer into the existing FLUX backend.

**IMPORTANT: DO NOT IMPLEMENT EVERYTHING IN ONE GO.**

We will work in explicit phases.

Complete **ONLY Phase 0** in this prompt.

After completing Phase 0, **STOP and wait for my explicit approval** before implementing Phase 1.

Do not write implementation code in Phase 0.

---

# 1. EXISTING FLUX BACKEND

FLUX is an existing Node.js + TypeScript backend.

The current structure is approximately:

```text
src/
├── config/
├── constants/
├── controllers/
├── jobs/
├── middlewares/
├── migrations/
├── models/
├── realtime/
├── repositories/
├── routes/
├── schemas/
├── services/
├── types/
└── utils/
```

The backend already follows a layered architecture:

```text
Routes
   ↓
Controllers
   ↓
Services
   ↓
Repositories
   ↓
MongoDB
```

There is already working functionality for:

* authentication
* users
* threads/conversations
* messages
* expenses
* realtime communication
* background jobs
* database access
* error handling
* logging

Do NOT replace this architecture.

Do NOT reorganize existing folders unnecessarily.

Do NOT rewrite working code.

The goal is to **integrate Agentic AI into the existing FLUX architecture**, not redesign the entire backend.

---

# 2. FLUX AI GOAL

FLUX is a conversational personal-finance application.

The AI should eventually be able to understand natural-language financial events and interact with the application's existing business functionality.

Examples:

```text
"I spent 860 for dinner"

"I spent ₹860 for dinner with Adarsh, Suraj,
Himanshu and Astha."

"Adarsh and Suraj had biryani,
Himanshu and Astha had veg."

"How much did I spend this month?"

"How much did I spend on food?"

"Show me my expenses from last week."

"Split this expense with my friends."

"Update that expense to ₹950."
```

Eventually the AI should also support:

* expense creation
* expense updates
* expense queries
* spending analysis
* income/outgoing queries
* group expenses
* expense splitting
* financial insights
* conversational follow-up questions
* receipt/invoice/bill images
* extracting expense information from uploaded images
* contextual conversation
* tool-based access to FLUX data

---

# 3. AI TECHNOLOGY

The initial AI stack will be:

* LangGraph.js
* Gemini
* TypeScript
* MongoDB

MongoDB is intentionally being used initially because it is currently the project's available/free database option.

Do NOT introduce another database for AI unless the existing architecture genuinely requires it.

Do NOT introduce Pinecone/vector databases during Phase 0 unless the audit demonstrates a concrete requirement.

If vector search is eventually required, evaluate whether MongoDB's available capabilities are sufficient before introducing another infrastructure dependency.

---

# 4. CORE ARCHITECTURAL PRINCIPLE

AI is an **orchestration layer**, not a replacement for business logic.

The AI must NOT directly bypass existing application services.

Preferred:

```text
LangGraph Agent
      ↓
AI Tool
      ↓
Existing Service
      ↓
Existing Repository
      ↓
MongoDB
```

NOT:

```text
LangGraph Agent
      ↓
MongoDB directly
```

If an existing expense service already knows how to create an expense, the AI tool should call that service.

For example:

```text
createExpenseTool
      ↓
expenseService
      ↓
expenseRepository
      ↓
MongoDB
```

Do NOT duplicate expense business rules inside LangGraph nodes.

Existing business logic must remain reusable by:

* HTTP controllers
* background jobs
* realtime flows
* AI tools

---

# 5. IMPORTANT: DO NOT CALL THE LLM FOR EVERY USER MESSAGE

The conversational AI must NOT blindly execute an LLM call for every incoming message.

We need a **trailing-edge debounce + message aggregation** mechanism.

For the initial POC/prototype, the intended behavior is approximately:

```text
User message
     ↓
Save message
     ↓
Wait for user inactivity
     ↓
If another message arrives:
    reset timer
     ↓
After inactivity window expires:
    process the accumulated messages together
     ↓
LangGraph
     ↓
LLM
```

Initial POC target:

```text
DEBOUNCE_WINDOW = approximately 2 seconds
```

This value must be configurable.

Do NOT implement the debounce mechanism in Phase 0.

Instead, inspect the existing architecture and explain where it should live.

The final production architecture may later replace the in-process timer with infrastructure such as EventBridge Scheduler/Kinesis-based processing, but **do not introduce that infrastructure during Phase 0**.

For the POC, an in-process Node.js timer such as `setTimeout()` may be considered.

---

# 6. MESSAGE BURST EXAMPLE

The AI should treat these as one conversational turn if they arrive within the debounce window:

```text
User:
I spent 860 for dinner

User:
me, Adarsh, Suraj, Himanshu and Astha

User:
Adarsh and Suraj had biryani

User:
Himanshu and Astha had veg
```

Instead of:

```text
LLM call 1
LLM call 2
LLM call 3
LLM call 4
```

we want:

```text
M1
M2
M3
M4
 ↓
debounce
 ↓
single AI processing turn
```

The individual messages must still remain persisted as normal messages.

Do NOT merge them permanently into one database message.

The AI processing layer can treat them as one batch/turn.

---

# 7. EXPENSE-CAPTURE WORKFLOW

One of the first real AI capabilities will be conversational expense capture.

Example:

```text
User:
I spent 860 for dinner
```

The AI should determine whether the information is sufficient to create an expense.

The AI should NOT invent missing information.

If required information is missing or ambiguous, it should ask the user for the **minimum necessary clarification**.

Example:

```text
User:
I spent 860 for dinner with Adarsh and Suraj.
```

Potentially sufficient if the application's default splitting rule supports equal splitting.

But:

```text
User:
I spent 860 for dinner.
Adarsh and Suraj had biryani.
Himanshu and Astha had veg.
```

may still be ambiguous if item prices or the user's own consumption/share are required to calculate the split.

The AI should ask only what is necessary.

Do NOT force the user through a large form-like conversation.

The goal is:

```text
Natural language
      ↓
Extract what is known
      ↓
Identify missing required information
      ↓
Ask minimum clarification
      ↓
Complete expense
      ↓
Validate
      ↓
Save using existing expense service
```

---

# 8. MINIMUM EXPENSE INFORMATION

During Phase 0, inspect the existing expense model/schema/business rules and determine what information is actually required by FLUX to persist an expense.

Potential concepts include:

```text
amount
reason/description
paidBy
individual vs group
participants
split method
split amounts
```

For a group expense, determine what the existing system requires to calculate/store:

```text
who participated
how the expense should be split
```

Do NOT assume these fields are final.

The existing expense implementation is the source of truth.

The Phase 0 report must identify:

1. Existing required expense fields.
2. Existing optional expense fields.
3. Which fields the AI must extract.
4. Which fields can have safe application defaults.
5. Which fields require clarification from the user.
6. Which fields must NEVER be guessed by the AI.

---

# 9. EXAMPLE EXPENSE

Consider:

```text
I spent ₹860 for dinner.
Me, Adarsh, Suraj, Himanshu and Astha were there.
Adarsh and Suraj had biryani.
Himanshu and Astha had veg.
```

The AI may understand:

```text
amount = 860
reason = dinner

participants:
- user
- Adarsh
- Suraj
- Himanshu
- Astha

Adarsh → biryani
Suraj → biryani
Himanshu → veg
Astha → veg
```

But it must determine whether this is sufficient according to FLUX's expense rules.

If it cannot safely calculate the split:

```text
DO NOT GUESS
```

Ask the smallest clarification necessary.

The exact clarification strategy should be determined during later implementation phases after inspecting the existing expense model/business logic.

---

# 10. CONVERSATION / THREAD MODEL

FLUX already has threads and messages.

Do NOT create a completely separate conversation system for AI.

A thread represents the user's conversational context.

The intended conceptual relationship is:

```text
Thread
  │
  ├── Messages
  │
  └── Conversation AI State
```

One thread should have one active `conversation_ai_state`.

The thread and messages remain the canonical conversational history.

The AI state is a compact structured representation of the information needed to continue the current AI workflow.

---

# 11. THREAD 24-HOUR RULE

There is an application-level conversational rule:

A user can continue adding messages to a thread only within the configured 24-hour conversational window from the thread's creation/start boundary.

The existing thread/message implementation must be inspected first to determine the exact current semantics.

The intended behavior is:

```text
Thread created
     ↓
24-hour conversational window
     ↓
messages allowed
     ↓
after 24 hours
     ↓
new thread/conversation context required
```

Do NOT assume the implementation details.

During Phase 0 determine:

1. How threads are currently created.
2. How thread ownership is enforced.
3. How messages reference threads.
4. Whether the 24-hour rule already exists.
5. Where this rule should be enforced.
6. Whether the rule should be implemented in the existing thread/message service rather than AI-specific code.

Do NOT duplicate this rule inside LangGraph.

---

# 12. MESSAGE LIMIT

A single thread should support a maximum of:

```text
100 user messages
```

The existing message architecture must be inspected.

Determine:

* whether a message limit already exists
* where it should be enforced
* whether the limit counts only user messages or all messages
* how AI-generated assistant messages are treated
* how the limit interacts with the 24-hour thread lifetime

Do NOT implement this during Phase 0.

---

# 13. CONVERSATION AI STATE

We need a persistent structured AI state associated with the thread.

However:

**Do NOT copy the entire conversation into AI state.**

Do NOT create a giant JSON document containing every message.

The distinction must remain:

```text
Messages
→ canonical conversation history

Thread
→ conversation container

Conversation AI State
→ compact structured information needed by the AI workflow

Financial records
→ canonical business data
```

Potential AI state concepts include:

```text
threadId
userId
currentIntent
currentExpenseDraft
missingRequiredFields
extractedEntities
pendingClarification
lastProcessedMessageId
tool execution information
workflow/execution status
```

These are examples only.

The Phase 0 audit must determine the minimum useful state.

---

# 14. WHO DEFINES AI STATE FIELDS?

The application owns the AI state schema.

The LLM must NOT dynamically invent persistent database fields.

Conceptually:

```text
Application
    ↓
defines state schema
    ↓
LangGraph
    ↓
LLM proposes/extracts values
    ↓
runtime/schema validation
    ↓
application updates state
```

For example, if FLUX defines:

```text
currentIntent
currentExpenseDraft
missingRequiredFields
```

the LLM may populate/update those fields.

It must not arbitrarily create:

```text
customerMood
favoriteColor
randomMemory
```

unless the application explicitly adds those concepts later.

During Phase 0 determine the appropriate state schema and whether MongoDB should store it as a document/object field.

---

# 15. AI STATE PERSISTENCE

The AI state should survive application restarts and user logout/login.

Therefore determine how:

```text
Thread
   ↓
Conversation AI State
```

should be persisted in MongoDB.

The preferred conceptual model is:

```text
threads
messages
conversation_ai_state
expenses
users
```

or an equivalent structure that fits the existing MongoDB architecture.

Do NOT automatically create a separate collection if an existing model can safely own the state.

During Phase 0 determine whether:

```text
conversation_ai_state
```

should be:

* a separate MongoDB collection/document, or
* embedded into an existing thread document.

Choose based on the current FLUX data model, update frequency, document size, concurrency, and access patterns.

---

# 16. AI STATE VS DATABASE

Clearly distinguish:

### LangGraph runtime state

Temporary state required to execute an AI workflow.

Examples:

```text
current message batch
retrieved records
current tool results
current reasoning workflow status
temporary structured extraction
current response
```

### MongoDB persistent state

Information that must survive:

```text
server restart
deployment
logout/login
future conversations
```

Examples:

```text
threads
messages
expenses
users
persistent conversation AI state
```

Do not duplicate entire MongoDB records inside LangGraph state.

Do not use LangGraph state as the primary financial database.

---

# 17. CONVERSATION SUMMARY

Evaluate whether FLUX actually needs a persistent AI summary.

If required, determine whether the summary belongs:

```text
inside conversation_ai_state
```

or:

```text
as a separate persisted field/document
```

Do NOT create a separate summary system unless justified.

The summary should never replace canonical messages.

Messages remain the source of truth.

---

# 18. THREAD CONTEXT

When the agent runs, the system may need:

```text
recent messages
+
conversation AI state
+
relevant financial records
+
relevant customer information
+
tool results
```

Do not blindly send all historical messages to the LLM.

During Phase 0 propose how context should be assembled.

The context system should eventually support:

```text
Current message batch
        +
Recent conversation context
        +
Structured AI state
        +
Relevant database information
```

rather than:

```text
Entire database
```

or:

```text
Entire conversation forever
```

---

# 19. AI TOOLS

Eventually create tools such as:

```text
createExpense
updateExpense
getExpense
listExpenses
getSpendingSummary
getIncome
getOutgoing
splitExpense
```

But Phase 0 must only identify which tools are required initially.

The first real tool should probably be the minimum tool required to complete the first expense workflow.

Every tool must follow:

```text
AI Tool
   ↓
Existing Service
   ↓
Existing Repository
   ↓
MongoDB
```

Do NOT allow tools to directly manipulate MongoDB when a suitable service already exists.

---

# 20. TOOL INPUT VALIDATION

AI tool inputs must be runtime validated.

The eventual architecture should use something such as:

```text
LLM structured output
      ↓
schema validation
      ↓
business validation
      ↓
existing service
```

Use the project's existing validation conventions where possible.

If Zod is already used, reuse it.

If not, determine the least disruptive validation approach.

Do NOT add dependencies during Phase 0.

---

# 21. OUTBOUND AI RESPONSE PIPELINE

Eventually, AI-generated responses should follow a controlled pipeline:

```text
LLM
 ↓
Structured output
 ↓
Schema validation
 ↓
Business validation
 ↓
Capability validation
 ↓
Content validation
 ↓
Deterministic response builder
 ↓
Channel renderer
 ↓
Provider schema validation
 ↓
API
```

During Phase 0 determine which parts of this can reuse existing FLUX infrastructure.

The LLM must not directly decide arbitrary outbound provider payloads.

---

# 22. MODEL / PROVIDER ARCHITECTURE

The initial model provider is Gemini.

However, avoid hard-coding Gemini throughout the entire application.

Propose a small provider abstraction so that later providers/models can be introduced without rewriting the agent.

Conceptually:

```text
AI Service
    ↓
Model Provider
    ↓
Gemini
```

The exact abstraction should remain minimal.

Do NOT create a generic AI framework.

Do NOT over-engineer provider switching.

---

# 23. LANGGRAPH

LangGraph.js will eventually orchestrate the AI workflow.

The graph should not contain duplicated business logic.

A conceptual future graph may look like:

```text
START
  ↓
Load Context
  ↓
Understand User Request
  ↓
Determine Intent
  ↓
Extract Structured Information
  ↓
Determine Missing Information
  ↓
Need Clarification?
  ├── YES → Generate Clarification → END
  │
  └── NO
        ↓
     Select Tool
        ↓
     Execute Tool
        ↓
     Validate Result
        ↓
     Generate Response
        ↓
       END
```

This is only conceptual.

Phase 0 must determine the minimum initial graph rather than implementing a large graph.

---

# 24. IMAGE / RECEIPT / BILL SUPPORT

Eventually users should be able to upload:

* invoices
* receipts
* bills
* screenshots/images containing expense information

The AI should eventually be able to extract structured expense information from these files.

Potential future flow:

```text
Image
 ↓
Storage
 ↓
AI vision/model
 ↓
Structured extraction
 ↓
Validation
 ↓
Expense workflow
```

Do NOT implement image processing during Phase 0.

During Phase 0 determine where image metadata/file references should integrate with:

```text
messages
threads
expenses
AI state
```

Do not store unnecessary binary data inside AI state.

---

# 25. OBSERVABILITY

AI execution must eventually be observable.

We need to answer:

```text
Which request triggered the agent?
Which user?
Which thread?
Which AI execution?
Which LangGraph node?
Which tool?
Which model?
How long?
Success/failure?
Where did the error occur?
```

First inspect the existing:

```text
logging
error handling
request IDs
trace IDs
job logging
metrics
```

Reuse existing infrastructure wherever possible.

Do NOT build a large observability platform in Phase 0.

Never log:

* passwords
* API keys
* bearer tokens
* secrets
* unnecessary financial information
* entire conversations by default

If appropriate, propose an eventual structure such as:

```text
AI execution ID
request ID
thread ID
user ID
model
node
tool
duration
status
error
token usage
```

but do not implement it yet.

---

# 26. CONCURRENCY

The conversational system must eventually handle:

```text
User:
Show me dinner expenses

50ms later:

User:
Only this month
```

We must prevent incorrect concurrent AI processing for the same thread.

The existing backend already has asynchronous processing infrastructure.

Inspect:

* jobs
* realtime
* message processing
* database transactions
* locking mechanisms
* queues/event systems

During Phase 0 propose how conversation-level serialization should work.

For the POC, an in-process debounce mechanism is acceptable.

For production, evaluate the existing infrastructure before introducing Redis/Kafka/RabbitMQ/etc.

Do NOT add those technologies simply because they are common in AI systems.

---

# 27. EXISTING INFRASTRUCTURE FIRST

Before proposing new infrastructure, inspect the repository for existing capabilities.

Specifically search for:

```text
queues
workers
jobs
events
locks
transactions
message processing
retries
logging
metrics
MongoDB sessions/transactions
```

Reuse what already exists.

---

# 28. TYPESCRIPT

The repository is already Node.js + TypeScript.

Continue using TypeScript.

Do not convert unrelated existing code.

Do not rewrite existing JavaScript or unrelated modules.

The AI layer should be implemented in TypeScript following the existing project's conventions.

---

# 29. PROPOSED AI DIRECTORY

The eventual AI area may look like:

```text
src/
└── ai/
    ├── agents/
    ├── tools/
    ├── prompts/
    ├── models/
    ├── memory/
    ├── state/
    └── ai.service.ts
```

But:

**DO NOT create all of these folders during Phase 0.**

Only recommend the minimum folders/files required.

Preserve the existing architecture.

---

# 30. PHASES

The implementation will happen in these phases.

## PHASE 0 — Architecture Audit

Current phase.

No implementation.

Inspect the repository and produce the architecture proposal.

---

## PHASE 1 — AI Foundation

After explicit approval:

* create minimal AI directory structure
* provider abstraction
* Gemini integration
* AI service
* environment configuration
* basic validation foundation

Do not build full agent capabilities yet.

---

## PHASE 2 — LangGraph State + Initial Graph

After explicit approval:

* define FLUX LangGraph state
* create minimal graph
* context loading
* intent/extraction workflow
* structured outputs

---

## PHASE 3 — First Real FLUX Tool

After explicit approval:

Implement the first real expense-related AI tool.

Expected flow:

```text
Agent
 ↓
Tool
 ↓
Existing Expense Service
 ↓
Existing Repository
 ↓
MongoDB
```

No duplicated business logic.

---

## PHASE 4 — Conversational API Integration

After explicit approval:

Connect:

```text
message
 ↓
debounce
 ↓
message aggregation
 ↓
agent
 ↓
response
```

For the POC:

```text
Node.js setTimeout()
```

with a configurable debounce period, initially around:

```text
2 seconds
```

Do not call the LLM for every message.

---

## PHASE 5 — Persistent Conversation Context

After explicit approval:

Implement:

```text
thread
 ↓
messages
 ↓
conversation_ai_state
```

including:

* persistent state
* recent context
* message processing tracking
* 24-hour thread rules
* 100 user-message limit
* summary if justified

---

## PHASE 6 — Additional Financial Capabilities

Add tools for:

* expense queries
* updates
* summaries
* income/outgoing
* group splits
* insights
* other financial workflows

---

## PHASE 7 — Observability

Add:

* AI execution tracking
* tracing
* metrics
* latency
* tool execution tracking
* model usage
* structured errors
* monitoring

---

## PHASE 8 — Production Hardening

Evaluate:

* concurrency
* retries
* idempotency
* security
* rate limits
* prompt injection
* data isolation
* performance
* token usage
* model fallback
* failure recovery
* deployment
* scaling
* cost

---

# 31. PHASE 0 — REQUIRED REPOSITORY INSPECTION

Before giving recommendations, inspect the actual repository.

Inspect at minimum:

```text
package.json
tsconfig
environment/configuration
models
schemas
repositories
services
controllers
routes
middlewares
jobs
realtime
tests
database configuration
authentication
error handling
logging
thread implementation
message implementation
expense implementation
```

Search for existing implementations rather than assuming they do not exist.

---

# 32. PHASE 0 OUTPUT

Do NOT modify implementation code.

Do NOT create the AI implementation.

Do NOT install packages.

Return a detailed architecture audit containing:

## 1. Current Architecture Assessment

Explain:

```text
routes
controllers
services
repositories
models
jobs
realtime
database
```

and how they currently interact.

---

## 2. Existing Thread/Message Architecture

Explain:

* thread model
* message model
* relationships
* ownership
* message limits
* lifecycle
* existing conversational APIs

---

## 3. Existing Expense Architecture

Explain:

* expense model
* expense service
* expense repository
* expense validation
* required fields
* optional fields
* splitting logic
* existing business rules

---

## 4. Proposed AI Integration Point

Show exactly where:

```text
message
 ↓
debounce
 ↓
agent
```

should integrate.

---

## 5. Proposed AI Directory

Show only the folders/files that are actually necessary.

---

## 6. LangGraph State Proposal

Define the proposed runtime state.

Separate:

```text
runtime state
```

from:

```text
persistent AI state
```

and:

```text
canonical database records
```

Explain every proposed state field and why it exists.

---

## 7. MongoDB Persistence Strategy

Explain whether:

```text
conversation_ai_state
```

should be:

* a separate collection/document, or
* embedded in thread

and why.

Also explain how state should survive:

```text
logout
login
restart
deployment
```

---

## 8. 24-Hour Thread + 100 User Message Rule

Explain exactly where these rules should live and how they interact with AI.

Do not duplicate application rules inside LangGraph.

---

## 9. Debounce / Message Aggregation

Explain where the POC's:

```text
trailing-edge debounce
```

should live.

Initial target:

```text
~2 seconds after the latest user message
```

Explain how individual messages remain persisted while being processed as one AI turn.

Also explain the future production migration path from:

```text
setTimeout()
```

to the existing asynchronous infrastructure / AWS scheduling approach.

---

## 10. Expense AI Workflow

Explain the proposed flow:

```text
Natural language
 ↓
Extraction
 ↓
Minimum required fields check
 ↓
Clarification if required
 ↓
Structured expense
 ↓
Validation
 ↓
Existing expense service
 ↓
MongoDB
```

Explain what the AI should do when the user provides ambiguous information.

---

## 11. Tool Architecture

Identify the first tool to implement and how it will reuse existing services.

---

## 12. Model / Provider Architecture

Explain the minimum Gemini integration abstraction required.

---

## 13. Conversation Context Architecture

Explain how:

```text
message batch
+
recent messages
+
conversation AI state
+
relevant database information
+
tool results
```

should eventually be assembled for the LLM.

---

## 14. Image / Receipt Future Architecture

Explain where future:

```text
receipt
invoice
bill
image
```

processing should fit without implementing it.

---

## 15. Observability Audit

Identify what logging/error/metrics infrastructure already exists.

Then identify what AI-specific observability is missing.

---

## 16. Security / Multi-Tenant Isolation

Verify that AI tools cannot cross:

```text
user
thread
tenant
```

boundaries.

AI tools must use the authenticated user/thread/tenant context.

Never trust IDs supplied by the LLM.

---

## 17. Minimum Architecture

Give the smallest architecture required to start Phase 1 without overengineering.

Explicitly identify technologies that should **NOT** be introduced yet.

For example, if not required:

```text
Kafka
RabbitMQ
Redis
Pinecone
separate AI microservice
vector database
```

should not be introduced merely for architectural fashion.

---

# 33. FINAL RULE

After completing the Phase 0 audit:

**STOP.**

Do not implement Phase 1.

Do not install packages.

Do not create the AI agent.

Do not create tools.

Do not modify existing business logic.

Wait for explicit approval before continuing.


# 23A. AI OUTPUT FORMAT vs CHAT MESSAGE FORMAT

Keep **machine-readable AI output** separate from **human-readable conversational messages**.

The LLM must NOT directly generate arbitrary database records or provider-specific message payloads.

The intended architecture is:

```text
User Message
    ↓
LangGraph
    ↓
Gemini
    ↓
Structured JSON
    ↓
Schema Validation
    ↓
Business Validation
    ↓
Business Action / Existing Service
    ↓
Deterministic Response Builder
    ↓
Markdown / Structured Message
    ↓
Messages Collection
    ↓
Frontend
```

---

## 23A.1 Structured JSON for AI → Application

When the AI needs to understand or modify application data, use structured JSON.

For example, an expense extraction result may conceptually look like:

```json
{
  "intent": "create_expense",
  "status": "complete",
  "expense": {
    "amount": 860,
    "currency": "INR",
    "reason": "Dinner",
    "paidBy": "user",
    "participants": [
      "user",
      "Adarsh",
      "Suraj",
      "Himanshu",
      "Astha"
    ],
    "splitMethod": "equal"
  },
  "missingFields": []
}
```

This is an example only.

The actual schema must be derived from the existing FLUX expense model and business rules.

The application, NOT the LLM, owns the schema.

The LLM can populate values within the schema, but must not arbitrarily invent persistent fields.

---

## 23A.2 JSON Must Be Validated

The AI output must pass through:

```text
Gemini
 ↓
Structured Output
 ↓
Runtime Schema Validation
 ↓
Business Validation
 ↓
Existing Service
```

Use the project's existing validation conventions.

If Zod is already used, reuse it.

Schema validation should verify that the structure and data types are valid.

Business validation should verify that the information actually makes sense according to FLUX rules.

For example:

```text
amount > 0

participants exist

paidBy exists

split method is supported

split amounts are valid

sum of split amounts == expense amount
```

Never trust the LLM simply because it returned valid JSON.

---

# 23A.3 Minimum Required Expense Information

When creating an expense conversationally, the AI must distinguish between:

```text
Information provided by user
```

and:

```text
Information inferred safely
```

and:

```text
Information that is missing
```

The AI must NOT guess financially significant information.

For example:

```text
User:
I spent ₹860 for dinner.
```

The agent should determine whether FLUX can safely create the expense using existing defaults.

If required information is missing:

```text
LLM
 ↓
status = needs_clarification
 ↓
missingRequiredFields
 ↓
generate minimal clarification
```

The AI should ask for the **minimum information necessary** to complete the expense.

Potential required concepts include:

```text
amount
reason/description
paidBy
individual vs group
participants
split method
split amounts / item allocation when required
```

These are not automatically final fields.

Inspect the existing expense implementation and determine the actual required fields.

Do NOT force the user to provide information that FLUX can safely derive or default.

Do NOT guess information that could change the financial result.

---

# 23A.4 Clarification Example

For example:

```text
User:

I spent ₹860 for dinner with Adarsh and Suraj.
```

If the existing FLUX rules allow equal splitting by default, the agent may be able to complete the expense.

If the split cannot safely be determined, the AI should ask a minimal clarification.

Conceptually:

```json
{
  "intent": "create_expense",
  "status": "needs_clarification",
  "missingFields": [
    "splitMethod"
  ]
}
```

Then the application can generate a conversational response such as:

```markdown
I have the **₹860 dinner expense** with you, Adarsh and Suraj.

How should I split it?

1. **Equally**
2. **Custom amounts**
3. **By item/share**
```

The exact wording is not fixed and can be generated by the model where appropriate, but the underlying action/state must remain structured and validated.

---

# 23A.5 Markdown for Human-Readable Responses

When the AI needs to communicate with the user, the final conversational content should be human-readable.

Use Markdown as the initial message representation.

For example:

```markdown
### Expense recorded

**Dinner — ₹860**

Split equally between:

- You — ₹172
- Adarsh — ₹172
- Suraj — ₹172
- Himanshu — ₹172
- Astha — ₹172
```

The message can conceptually be stored as:

```json
{
  "content": "### Expense recorded\n\n**Dinner — ₹860**...",
  "contentType": "markdown"
}
```

Follow the existing FLUX message model conventions rather than blindly introducing these exact field names.

---

# 23A.6 BlockNote Is a Frontend Concern

The backend should NOT make its internal AI architecture dependent on BlockNote.

The intended flow is:

```text
Backend
   ↓
Markdown
   ↓
Frontend
   ↓
BlockNote / renderer
```

BlockNote is a presentation/rendering concern.

Do NOT make Gemini generate BlockNote-specific internal JSON unless there is a concrete frontend requirement that justifies it.

The backend should remain capable of changing the frontend renderer later.

Reference:

https://www.blocknotejs.org/

---

# 23A.7 Do Not Let the LLM Generate Final Database Messages Directly

Prefer:

```text
Gemini
 ↓
Structured AI result
 ↓
Validation
 ↓
Business action
 ↓
Deterministic response builder
 ↓
Markdown
 ↓
Message persistence
```

rather than:

```text
Gemini
 ↓
arbitrary Markdown
 ↓
database
```

For important application actions, the application should know what actually happened before generating the final response.

For example:

```text
Gemini:
create expense

        ↓

createExpenseTool

        ↓

expenseService

        ↓

MongoDB

        ↓

expense created successfully

        ↓

response builder

        ↓

"Expense recorded..."
```

The response should be based on the actual successful business operation, not merely the LLM's assumption that the operation succeeded.

---

# 23A.8 Structured UI Actions — Future Extension

Do not implement this unless required in the current phase, but keep the architecture extensible for structured UI actions.

Eventually a response may conceptually contain:

```json
{
  "contentType": "markdown",
  "content": "Expense recorded for **₹860**.",
  "actions": [
    {
      "type": "view_expense",
      "expenseId": "exp_123"
    }
  ]
}
```

This is preferable to encoding application actions entirely inside Markdown links.

The exact schema should be designed later based on FLUX frontend requirements.

---

# 23A.9 Content Types

Inspect the existing FLUX message model before adding or changing content types.

The architecture should eventually be able to support content such as:

```text
text
markdown
image
structured UI/action content
```

but do NOT introduce all of these immediately.

Only add what is required for the current phase.

Future receipt/invoice/bill uploads should be represented through appropriate file/image metadata and references rather than storing binary data inside LangGraph state.

---

# 23A.10 Separation of Responsibilities

Maintain this separation:

```text
                GEMINI
                  │
                  │ understands
                  ▼
          STRUCTURED AI RESULT
                  │
                  ▼
             VALIDATION
                  │
                  ▼
           BUSINESS SERVICE
                  │
                  ▼
              MONGODB
                  │
                  ▼
         ACTUAL OPERATION RESULT
                  │
                  ▼
       DETERMINISTIC RESPONSE BUILDER
                  │
                  ▼
               MARKDOWN
                  │
                  ▼
              CHAT MESSAGE
                  │
                  ▼
              FRONTEND/UI
```

The key rule is:

**JSON is primarily for machine-to-machine/application processing.**

**Markdown is primarily for human-readable conversational output.**

**The database stores canonical structured business data.**

**Messages store the conversational representation.**

**BlockNote remains a frontend rendering concern.**
