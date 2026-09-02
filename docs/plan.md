# Backend + Agentic AI Implementation Plan

> **Status:** 70% implementation plan — expected to evolve as the product is built.
>
> **Important:** Backend and Agentic AI will initially live in the **same repository and same Node.js service**. They are separated logically into modules so the AI layer can be extracted later if necessary.
>
> **Frontend (FLUX):** Public landing page and app routes are documented in [`docs/frontend-integration.md`](frontend-integration.md) and `../frontend/docs/landing-page.md`.

---

# 1. Goal

Build a frontend-agnostic Node.js + TypeScript backend that:

- Provides APIs for the Next.js web application
- Can later serve a Flutter mobile application
- Owns authentication and authorization
- Stores conversations and permanent expense data
- Runs the LangGraph agent
- Communicates with Gemini
- Processes receipt/document uploads
- Maintains persistent agent state
- Handles expense calculations and validation
- Supports integrations such as Slack
- Can initially run on Railway Hobby and later move to AWS

The backend is the **core application layer**.

```text
                    ┌──────────────────┐
                    │   Next.js Web    │
                    │    TypeScript    │
                    └────────┬─────────┘
                             │
                             │ HTTPS / REST
                             ↓
                    ┌──────────────────┐
                    │   Node.js API    │
                    │   TypeScript     │
                    │                  │
                    │ ┌──────────────┐ │
                    │ │ LangGraph    │ │
                    │ │ Agent        │ │
                    │ └──────────────┘ │
                    └────────┬─────────┘
                             │
             ┌───────────────┼────────────────┐
             ↓               ↓                ↓
        MongoDB Atlas      Gemini          Integrations
                                             │
                                            Slack
```

---

# 2. Stack

## Backend

- Node.js
- TypeScript
- REST API initially
- Zod
- MongoDB Atlas

## Agentic AI

- LangGraph.js
- Gemini initially
- Structured output
- Tool/function calling
- Persistent checkpoints

## Storage

- MongoDB Atlas
- Private object storage for receipts/documents

## Deployment

### Initial

```text
GitHub
   ↓
Railway Hobby
   ↓
Node.js API
```

### Later if required

```text
GitHub
   ↓
Docker
   ↓
AWS
   ↓
EC2 / ECS
```

The application should not depend on Railway-specific functionality.

---

# 3. Repository Structure

Backend and Agentic AI remain in the same repository.

Suggested structure:

```text
backend/
│
├── src/
│   │
│   ├── server.ts
│   │
│   ├── config/
│   │
│   ├── routes/
│   │
│   ├── controllers/
│   │
│   ├── services/
│   │
│   ├── agents/
│   │   ├── expense/
│   │   │   ├── graph.ts
│   │   │   ├── state.ts
│   │   │   ├── nodes/
│   │   │   ├── tools/
│   │   │   └── prompts/
│   │   │
│   │   └── shared/
│   │
│   ├── integrations/
│   │   └── slack/
│   │
│   ├── models/
│   │
│   ├── schemas/
│   │
│   ├── db/
│   │
│   ├── middleware/
│   │
│   └── utils/
│
├── package.json
├── tsconfig.json
└── .env
```

This structure can change later.

---

# 4. Architectural Principle

The backend and agent are **one service initially**, but they have different responsibilities.

```text
Node.js Backend
│
├── Application Layer
│   ├── API
│   ├── Authentication
│   ├── Authorization
│   ├── Expenses
│   ├── Settlements
│   └── Database
│
├── Agent Layer
│   ├── LangGraph
│   ├── Gemini
│   ├── Agent state
│   ├── Agent nodes
│   └── Agent tools
│
└── Integration Layer
    ├── Slack
    └── Future integrations
```

The agent should not become a completely separate service unless there is a real reason.

---

# 5. Phase 1 — Node.js + TypeScript Foundation

- [ ] Create Node.js project
- [ ] Configure TypeScript
- [ ] Configure development scripts
- [ ] Configure build scripts
- [ ] Configure environment variables
- [ ] Create server entry point
- [ ] Create health endpoint
- [ ] Add logging
- [ ] Add centralized error handling
- [ ] Add request validation

Basic flow:

```text
HTTP Request
     ↓
Route
     ↓
Controller
     ↓
Service
     ↓
Database / Agent / Integration
     ↓
Response
```

---

# 6. Phase 2 — Environment Configuration

Development:

```env
NODE_ENV=development

PORT=5000

MONGODB_URI=...

GEMINI_API_KEY=...

JWT_SECRET=...

STORAGE_ENDPOINT=...
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
```

Production secrets must be stored through the hosting platform's secret/environment-variable system.

Never commit:

```text
.env
API keys
Database passwords
JWT secrets
Slack credentials
Storage credentials
```

---

# 7. Phase 3 — API Structure

Initial API areas:

```text
/auth
/threads
/messages
/files
/expenses
/settlements
/integrations
```

Initial endpoints:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me

POST /threads
GET  /threads
GET  /threads/:threadId
DELETE /threads/:threadId

GET  /threads/:threadId/messages
POST /threads/:threadId/messages

POST /files/upload

GET    /expenses
GET    /expenses/:expenseId
POST   /expenses
PATCH  /expenses/:expenseId
DELETE /expenses/:expenseId

GET   /settlements
POST  /settlements
PATCH /settlements/:id

GET    /integrations
POST   /integrations/slack
DELETE /integrations/slack
```

These endpoints are an initial design and can change.

---

# 8. Phase 4 — Authentication

Implement:

- [ ] Registration
- [ ] Login
- [ ] Logout
- [ ] Session/token handling
- [ ] Authentication middleware
- [ ] Current-user endpoint
- [ ] Password hashing
- [ ] Authentication error handling

Basic flow:

```text
Client
  ↓
Login
  ↓
Node.js
  ↓
Verify credentials
  ↓
Create session/token
  ↓
Client
```

Passwords should be **hashed**, not encrypted.

---

# 9. Phase 5 — Multi-User Authorization

This application must support multiple users from the beginning.

Every protected request should conceptually follow:

```text
Request
   ↓
Authenticate user
   ↓
Get authenticated userId
   ↓
Authorize requested resource
   ↓
Business logic
   ↓
Database
```

Do not trust:

```text
userId
```

sent by the frontend.

Instead:

```text
Authenticated session
       ↓
Backend determines userId
```

Example:

```text
GET /expenses/:expenseId
        ↓
Does expense belong to authenticated user?
        ↓
YES → return
NO  → reject
```

---

# 10. Phase 6 — MongoDB

Initial collections:

```text
users
threads
messages
expenses
settlements
integrations
```

Potential future collections:

```text
workspaces
workspace_members
audit_logs
notifications
```

Do not create collections just because they might be useful later.

---

# 11. Data Model Principle

Keep these concepts separate.

```text
Messages
    ↓
What the user and AI said

LangGraph State
    ↓
What the agent currently knows / needs

Expenses
    ↓
Permanent financial truth

Settlements
    ↓
Permanent settlement information
```

Do not store everything as one giant thread document.

---

# 12. Thread

A thread represents a conversation/workflow.

Conceptually:

```text
Thread
├── id
├── userId
├── title
├── status
├── createdAt
└── updatedAt
```

A thread can have:

```text
many messages
```

and may create:

```text
one or more expenses
```

The expense can store:

```text
threadId
```

to identify where it originated.

However:

> An expense should not depend on the conversation existing forever.

---

# 13. Messages

Messages represent conversation history.

Conceptually:

```text
Message
├── id
├── threadId
├── role
├── content
├── attachments
└── createdAt
```

Possible roles:

```text
user
assistant
system
tool
```

Exact implementation can evolve.

---

# 14. Expense

Expense is the permanent financial domain object.

Conceptually:

```text
Expense
├── id
├── userId
├── threadId
├── merchant
├── date
├── total
├── currency
├── category
├── items
├── participants
├── paidBy
├── status
└── createdAt
```

The exact schema will evolve as the product becomes clearer.

---

# 15. Expense Lifecycle

Initial conceptual lifecycle:

```text
DRAFT
   ↓
EXTRACTED
   ↓
NEEDS_CLARIFICATION
   ↓
READY_FOR_CONFIRMATION
   ↓
CONFIRMED
   ↓
RECORDED
   ↓
SETTLED
```

The exact states may change.

---

# 16. Phase 7 — Validation

Use:

```text
TypeScript
+
Zod
```

TypeScript provides compile-time safety.

Zod provides runtime validation.

Flow:

```text
External Data
      ↓
Zod
      ↓
Validated Data
      ↓
TypeScript
      ↓
Business Logic
```

Validate data coming from:

- Frontend
- Flutter later
- Gemini
- External APIs
- File metadata
- User input

Do not blindly trust LLM output.

---

# 17. Phase 8 — File Handling

Support initially:

```text
image/jpeg
image/png
application/pdf
```

Flow:

```text
Client
   ↓
Upload
   ↓
Backend / Upload Service
   ↓
Private Object Storage
   ↓
Agent
   ↓
Gemini
```

Receipts should not be stored as publicly accessible files.

Prefer private object storage and controlled access.

Do not build a complicated OCR pipeline initially.

---

# 18. Phase 9 — Gemini Service

Keep Gemini behind an internal service abstraction.

Example conceptual structure:

```text
services/
   gemini/
      client.ts
      extraction.ts
      formatting.ts
```

Avoid scattering Gemini API calls throughout the application.

Instead:

```text
Agent
   ↓
Gemini Service
   ↓
Gemini API
```

This makes it easier to change providers later.

Potential future:

```text
Gemini
   ↓
OpenAI
```

without rewriting the whole agent.

---

# 19. Phase 10 — LangGraph

The agent lives inside:

```text
src/agents/
```

Initial structure:

```text
agents/
└── expense/
    ├── graph.ts
    ├── state.ts
    ├── nodes/
    ├── tools/
    └── prompts/
```

The agent's job is to:

- Understand user intent
- Extract information
- Track missing information
- Ask clarification questions
- Interpret receipts
- Validate information
- Request confirmation
- Trigger controlled backend operations

---

# 20. LangGraph State

Initial conceptual state:

```ts
{
  threadId,

  intent,

  receipt,

  expenseDraft,

  participants,

  assignments,

  missingInformation,

  status,

  response
}
```

This is **working state**.

It is not the permanent financial database.

The exact state structure will evolve as the agent is developed.

---

# 21. Basic Agent Graph

Initial graph:

```text
START
  ↓
Intent Router
  │
  ├──────────────→ General Question
  │                      ↓
  │                   Respond
  │
  └──────────────→ Expense
                         ↓
                   Extract Data
                         ↓
                  Missing Information?
                     /           \
                   YES            NO
                    ↓              ↓
               Ask User         Validate
                                   ↓
                                Confirm
                                   ↓
                            Create Expense
                                   ↓
                                  END
```

Start with a controlled workflow.

Do not build a huge autonomous agent immediately.

---

# 22. Expense Conversation Example

User:

```text
I uploaded a lunch receipt.
```

Agent:

```text
I found a restaurant bill for ₹1,240.
Is this an individual or group expense?
```

User:

```text
Group.
```

Agent state updates:

```text
expenseType = group
```

Agent:

```text
Who was included?
```

User:

```text
Me, Rahul and Aman.
```

The agent continues from existing state.

The user should not need to repeat information already established.

---

# 23. Receipt Extraction

Flow:

```text
Receipt
   ↓
Gemini multimodal input
   ↓
Structured extraction
   ↓
Zod validation
   ↓
Expense Draft
   ↓
LangGraph
```

Possible extracted information:

```text
Merchant
Date
Total
Currency
Tax
Discount
Line Items
Quantity
Price
```

Not every receipt will contain every field.

---

# 24. Missing Information

The agent should determine what information is actually required.

Example:

```text
Receipt extracted
      ↓
Total = ₹1,240
Items = available
      ↓
Group expense
      ↓
Participants missing
      ↓
Ask user
```

Avoid asking unnecessary questions.

---

# 25. Confirmation

Before creating a permanent expense:

```text
Agent
   ↓
Summarize interpretation
   ↓
Ask for confirmation
   ↓
User confirms
   ↓
Backend validates
   ↓
Create expense
```

Example:

```text
Paradise

Total: ₹1,240

Harry:  ₹360
Rahul:  ₹300
Aman:   ₹280
Vikram: ₹300

Confirm?
```

The exact confirmation UX may change.

---

# 26. Financial Calculations

Do not rely purely on the LLM for arithmetic.

Use deterministic backend code for:

- Splitting amounts
- Adding totals
- Validating totals
- Calculating shares
- Calculating balances
- Creating settlements

Example:

```text
LLM
 ↓
"Rahul had biryani and Coke."
 ↓
Structured interpretation

Backend
 ↓
Calculate Rahul's exact amount
```

The LLM interprets.

The application calculates.

---

# 27. LangGraph Persistence

Requirement:

```text
User closes browser
        ↓
Logs in later
        ↓
Opens same thread
        ↓
Agent continues
```

Therefore LangGraph state must be persisted.

Conceptually:

```text
threadId
   ↓
LangGraph checkpoint
   ↓
Persistent storage
```

Messages and checkpoints remain separate concepts.

```text
messages
    =
conversation history

checkpoint
    =
agent workflow state
```

---

# 28. Agent + Database Boundary

The LLM should not directly receive unrestricted database access.

Use controlled tools/actions.

Example:

```text
get_thread_context()
get_expense()
calculate_split()
create_expense()
update_expense()
get_settlements()
```

Flow:

```text
User
 ↓
LangGraph
 ↓
LLM decides tool
 ↓
Backend tool
 ↓
Authorization + validation
 ↓
Database
```

The backend controls what the agent is actually allowed to do.

---

# 29. Tool Calling

Initial tools:

```text
get_thread_context
get_expense
calculate_split
create_expense
update_expense
get_settlements
```

Later:

```text
send_slack_notification
```

Important:

> Tool calls must be validated and authorized just like normal API requests.

---

# 30. Slack Integration

Build this after the core expense workflow works.

Flow:

```text
Confirmed Expense
       ↓
Integration Service
       ↓
Slack Adapter
       ↓
Formatted Message
       ↓
Slack
```

Architecture:

```text
IntegrationService
       ↓
IntegrationAdapter
       ↓
SlackAdapter
```

This allows future integrations:

```text
Slack
Discord
Email
Teams
Webhook
...
```

without coupling the entire application to Slack.

---

# 31. Slack Formatting

Possible user preference:

```text
Default format
Custom format
Let AI decide
```

If user specifies a format:

```text
Use user's format
```

If no format is specified:

```text
LLM determines sensible format
```

The LLM should generate structured message content.

It should not be allowed to generate arbitrary HTTP requests.

---

# 32. Security

Initial security foundation:

- [ ] HTTPS
- [ ] Authentication
- [ ] Authorization
- [ ] Password hashing
- [ ] Input validation
- [ ] Rate limiting
- [ ] Secure secrets
- [ ] MongoDB Atlas encryption at rest
- [ ] Private object storage
- [ ] Encrypted integration credentials
- [ ] Safe logging
- [ ] Error handling without leaking sensitive information

Application-level encryption can be introduced selectively for genuinely sensitive fields.

Do not assume database encryption protects against a fully compromised running backend.

---

# 33. Multi-User Security

Every protected operation should follow:

```text
Request
   ↓
Authenticate
   ↓
Get authenticated user
   ↓
Authorize resource
   ↓
Execute operation
```

Never:

```text
Frontend sends userId
       ↓
Backend trusts it
```

Instead:

```text
Authenticated session
       ↓
Backend determines userId
```

This is critical for a multi-user application.

---

# 34. Reliability

Add gradually:

- [ ] Request validation
- [ ] LLM output validation
- [ ] Tool validation
- [ ] Authorization checks
- [ ] Retry handling
- [ ] Idempotency for important operations
- [ ] Error states
- [ ] Logging
- [ ] Monitoring
- [ ] Agent tracing
- [ ] Evaluation tests

Important financial operations should be safe if requests are retried.

---

# 35. Agent Evaluation

Create test scenarios such as:

```text
Simple expense
Group expense
Receipt with tax
Receipt with discount
Poor-quality receipt
Missing participant
Ambiguous item
Multiple receipts
Correction after confirmation
Natural-language expense
```

Evaluate:

```text
Extraction accuracy
Clarification quality
Calculation correctness
Tool selection
Incorrect assumptions
Failure rate
```

Do not assume that a working demo means the agent is reliable.

---

# 36. Deployment

## Initial

```text
GitHub
   ↓
Railway Hobby
   ↓
Node.js API
```

Frontend:

```text
GitHub
   ↓
Vercel
   ↓
Next.js
```

Database:

```text
MongoDB Atlas
```

Overall:

```text
                Vercel
                  │
                  │ HTTPS
                  ↓
               Railway
                  │
        ┌─────────┼─────────┐
        ↓         ↓         ↓
     MongoDB    Gemini    Storage
                  │
                  ↓
              LangGraph
                  │
                  ↓
               Slack
```

---

# 37. Railway → AWS Migration

Do not write Railway-specific application logic.

Current:

```text
Node.js
   ↓
Railway
```

Later:

```text
Node.js
   ↓
Docker
   ↓
AWS EC2 / ECS
```

The application should remain essentially the same.

Only infrastructure/deployment should change.

---

# 38. When to Split Agent Into a Separate Service

Do **not** split initially.

Current:

```text
Node.js Backend
│
├── API
├── Services
├── Database
├── LangGraph
└── Integrations
```

Later, if AI processing becomes:

- Long-running
- Resource-intensive
- Asynchronous
- Independently scalable
- Expensive enough to require separate infrastructure

then consider:

```text
                 API
                  │
          ┌───────┴────────┐
          ↓                ↓
      API Service       AI Worker
                           │
                       LangGraph
                           │
                         Gemini
```

Potentially introduce:

```text
Queue
+
Worker
```

Only when actually needed.

---

# 39. Not Yet

Do not initially build:

- [ ] Microservices
- [ ] Separate AI repository
- [ ] Kubernetes
- [ ] Kafka
- [ ] Complex event-driven architecture
- [ ] Custom OCR pipeline
- [ ] Custom ML models
- [ ] Multiple LLM providers
- [ ] Multi-agent swarm
- [ ] Vector database without a real use case
- [ ] Autonomous financial actions without confirmation
- [ ] Complex queue infrastructure

Start simple.

---

# 40. MVP Definition

The backend + agent MVP is complete when this works reliably:

```text
User
 ↓
Create thread
 ↓
Send message
 ↓
Upload receipt
 ↓
Backend stores file
 ↓
Gemini extracts receipt information
 ↓
LangGraph understands the task
 ↓
Agent asks clarification if necessary
 ↓
User provides missing information
 ↓
Agent creates a proposed expense
 ↓
User confirms
 ↓
Backend validates
 ↓
Expense stored in MongoDB
 ↓
User closes browser
 ↓
User logs in later
 ↓
Thread reopened
 ↓
Conversation + agent state restored
 ↓
User continues
```

---

# 41. Final Architecture

For the initial version:

```text
                         ┌──────────────────┐
                         │     Next.js      │
                         │    TypeScript    │
                         │     Vercel       │
                         └────────┬─────────┘
                                  │
                              HTTPS/REST
                                  │
                                  ↓
                  ┌────────────────────────────┐
                  │     Node.js + TypeScript   │
                  │          Railway           │
                  │                            │
                  │  ┌──────────────────────┐  │
                  │  │      LangGraph       │  │
                  │  │                      │  │
                  │  │      Gemini          │  │
                  │  │      Tools           │  │
                  │  │      State           │  │
                  │  └──────────────────────┘  │
                  │                            │
                  │  API / Services / Auth     │
                  │  Expenses / Settlements    │
                  │  Integrations               │
                  └─────────────┬──────────────┘
                                │
                ┌───────────────┼───────────────┐
                ↓               ↓               ↓
          MongoDB Atlas      Storage         Slack
```

Future:

```text
                         ┌── Next.js
                         │
Clients ─────────────────┼── Flutter
                         │
                         └── Future clients
                                  │
                                  ↓
                         Node.js Backend
                                  │
                    ┌─────────────┴─────────────┐
                    ↓                           ↓
             Application                  Agent / Worker
                                             │
                                         LangGraph
                                             │
                                           Gemini
```

---

# 42. Core Principles

1. **Backend is frontend-agnostic.**
2. **Next.js is only one client.**
3. **Flutter can be added later without rewriting the backend.**
4. **Backend + Agentic AI stay in one repository initially.**
5. **LangGraph is a component of the backend, not the entire backend.**
6. **MongoDB is the permanent source of truth for confirmed expenses.**
7. **Messages and LangGraph checkpoints are separate concepts.**
8. **TypeScript provides compile-time safety.**
9. **Zod provides runtime validation.**
10. **LLMs interpret; deterministic code performs critical calculations.**
11. **LLMs should use controlled tools rather than unrestricted database access.**
12. **Railway is the initial deployment platform, not an architectural dependency.**
13. **AWS can replace Railway later if needed.**
14. **Start with one controlled agent before considering multi-agent architecture.**
15. **The remaining 30% of the architecture should be decided from real product requirements and failures.**
```̀