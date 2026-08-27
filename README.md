# Expense Manager Backend

Frontend-agnostic REST API for a multi-user expense management application. Supports authentication, personal and group chat threads, shared groups/membership, expenses (including chat-linked), and file attachments. Agentic AI responses are not implemented yet; an AI context payload shape is documented below for the next stage.

## Technology stack

- Node.js
- TypeScript
- Express
- MongoDB + Mongoose
- Zod (validation)
- bcrypt (password hashing)
- jsonwebtoken (stateless access tokens)
- helmet, cors, express-rate-limit

## Prerequisites

- Node.js 20+
- A MongoDB Atlas cluster (or any reachable MongoDB instance)
- npm

## Environment variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (default `5050`; avoid `5000` on macOS AirPlay Receiver) |
| `NODE_ENV` | `development`, `test`, or `production` |
| `MONGODB_URI` | MongoDB Atlas (or other) connection string; database name should be `expense-manager` in the path |
| `JWT_SECRET` | Secret used to sign JWTs (min 16 characters) |
| `JWT_EXPIRES_IN` | Access token lifetime (for example `7d`) |
| `FRONTEND_URL` | Allowed CORS origin for the frontend |

`.env` is gitignored and must never be committed.

## Installation

```bash
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## Lint / typecheck / test

```bash
npm run lint
npm run typecheck
npm test
```

## API endpoints

Base path: `/api/v1`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Process health (includes DB connectivity status) |
| `POST` | `/auth/signup` | No | Create account, send email OTP, return access token |
| `POST` | `/auth/login` | No | Login and return access token |
| `POST` | `/auth/logout` | No | Client-side logout hint |
| `GET` | `/auth/me` | Bearer JWT | Current user (includes `emailVerified` + preferences) |
| `POST` | `/auth/verify-email` | Bearer JWT | Confirm signup with 6-digit OTP |
| `POST` | `/auth/resend-otp` | Bearer JWT | Resend signup OTP (rate-limited) |
| `POST` | `/auth/forgot-password` | No | Request password reset email (generic response) |
| `POST` | `/auth/reset-password` | No | Set a new password with reset token |
| `PATCH` | `/auth/me` | Bearer JWT | Update preferences |
| `POST` | `/threads` | Bearer JWT | Create a **personal** thread (dayKey/sequence title) |
| `GET` | `/threads` | Bearer JWT | List personal active threads |
| `GET` | `/threads/recycle-bin` | Bearer JWT | Soft-deleted personal + accessible group threads (7 days) |
| `GET` | `/threads/:id` | Bearer JWT | Get one accessible thread (personal or group member) |
| `PATCH` | `/threads/:id` | Bearer JWT | Rename thread |
| `DELETE` | `/threads/:id` | Bearer JWT | Soft-delete (recycle bin); group: creator or group owner |
| `POST` | `/threads/:id/restore` | Bearer JWT | Restore from recycle bin |
| `DELETE` | `/threads/:id/permanent` | Bearer JWT | Permanently delete from recycle bin |
| `POST` | `/threads/:id/read` | Bearer JWT | Mark personal thread read |
| `GET` | `/threads/:id/messages` | Bearer JWT | List messages (group: all members’ messages) |
| `POST` | `/threads/:id/messages` | Bearer JWT | Create user message (blocked if thread is in recycle bin) |
| `POST` | `/groups` | Bearer JWT | Create group (creator = owner) |
| `POST` | `/groups/resolve` | Bearer JWT | Find-or-create by emails (or memberIds) + new thread |
| `GET` | `/groups` | Bearer JWT | List groups for current user |
| `GET` | `/groups/:id` | Bearer JWT | Group detail + members |
| `PATCH` | `/groups/:id` | Bearer JWT | Rename group (owner) |
| `POST` | `/groups/:id/members` | Bearer JWT | Add member by email (owner) |
| `DELETE` | `/groups/:id/members/:userId` | Bearer JWT | Remove member (owner) |
| `POST` | `/groups/:id/leave` | Bearer JWT | Leave group |
| `POST` | `/groups/:id/transfer` | Bearer JWT | Transfer ownership |
| `POST` | `/groups/:id/invites` | Bearer JWT | Create email invite (owner) |
| `GET` | `/groups/:id/invites` | Bearer JWT | List invites (owner) |
| `DELETE` | `/groups/:id/invites/:inviteId` | Bearer JWT | Revoke invite (owner) |
| `POST` | `/groups/:id/threads` | Bearer JWT | Create group thread |
| `GET` | `/groups/:id/threads` | Bearer JWT | List active group threads |
| `POST` | `/invites/:token/accept` | Bearer JWT | Accept invite (email must match) |
| `GET` | `/invites/:token` | No | Public invite preview (email, group name, status) |
| `POST` | `/expenses` | Bearer JWT | Create an expense |
| `GET` | `/expenses` | Bearer JWT | List the current user's expenses (no query filters) |
| `POST` | `/expenses/search` | Bearer JWT | Search/filter expenses via request body |
| `GET` | `/expenses/:id` | Bearer JWT | Get one expense |
| `PATCH` | `/expenses/:id` | Bearer JWT | Update one expense |
| `DELETE` | `/expenses/:id` | Bearer JWT | Delete one expense |
| `POST` | `/files` | Bearer JWT | Upload a file (multipart) |
| `GET` | `/files/:id` | Bearer JWT | Get file metadata |
| `DELETE` | `/files/:id` | Bearer JWT | Delete file |

### Signup

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Me

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Create thread

```http
POST /api/v1/threads
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Paradise lunch"
}
```

Omit `title` to use a server-generated personal title such as `26 Aug 2026 · Thread 1` (from the user’s timezone preference; `auto` uses UTC). Creates `type: "personal"` only. Soft-delete moves a thread to the recycle bin for 7 days (`GET /threads/recycle-bin`). Group chats use `/groups/.../threads` and `/groups/resolve`.

Membership changes (add / remove / leave / transfer / invite accept) append a `role: "system"` message to the group’s latest active thread when one exists.

Group invite, signup OTP, and password-reset mail all go through the shared `emailService` (`docs/email-and-auth-plan.md`):

- `EMAIL_PROVIDER=console` — logs only (**development/test default**; **blocked in production**)
- `EMAIL_PROVIDER=smtp` — Nodemailer + `SMTP_*` (see `.env.example`)
- `EMAIL_PROVIDER=ses` — planned (Batch F1)

Invite links open at `{FRONTEND_URL}/invites/:token` (public preview; accept requires matching signed-in email).

**Realtime (planned):** group chat messages are still REST-only today. Socket.IO notify-after-persist is tracked in `docs/realtime-socketio-plan.md` (batches R0–R4; SSE later as R5).

### Email configuration (SMTP)

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM="Flux Team <noreply@yourdomain.com>"
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
```

For a local catcher (e.g. Mailpit on `1025`), set `EMAIL_PROVIDER=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, and omit `SMTP_USER` / `SMTP_PASS`.

**Production:** `EMAIL_PROVIDER=console` fails boot. Use a verified sending domain.

**Delivery policy (fail-soft):** creating an invite / issuing OTP / requesting a password reset still succeeds if the SMTP send fails. The invite/token/OTP is persisted; errors are logged. Users can retry (resend OTP / forgot-password again) or use a copied invite link.

**Rate limits (per IP, 15‑minute window):** signup 10, OTP verify/resend 20, password reset 10, invite create 30, general auth 100.

**DNS / reputation (ops):** before go-live on a real domain, publish SPF and DKIM (and ideally DMARC) for the `EMAIL_FROM` domain so providers accept mail. With AWS SES later, use SES domain verification + DKIM; with SMTP, follow your provider’s DNS instructions.

### AI context payload (for future agents)

Do **not** parse thread titles for structure. Build agent context from IDs and preferences:

```json
{
  "threadType": "personal",
  "threadId": "<objectId>",
  "userId": "<objectId>",
  "actingUserId": "<objectId>",
  "defaultCurrency": "INR"
}
```

Group example:

```json
{
  "threadType": "group",
  "threadId": "<objectId>",
  "groupId": "<objectId>",
  "groupName": "Alice & Bob",
  "actingUserId": "<objectId>",
  "defaultCurrency": "INR"
}
```

Notes:
- `userId` is set for personal threads only; `groupId` / `groupName` for group threads.
- Expenses created from a group thread may include `groupId` on the expense record.
- Per-user read receipts for group threads are not implemented yet (`readAt` remains personal-thread scoped).

### List thread messages

Cursor-based pagination (newest page first; items returned in chronological order):

```http
GET /api/v1/threads/:id/messages?limit=30&before=<messageId>
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "hasMore": true,
    "nextCursor": "<oldestMessageIdInThisPage>"
  }
}
```

`limit` defaults to `30` (max `50`). Omit `before` for the latest page. Pass `before` with `nextCursor` to load older messages.

### Create thread message

Persists a user message only (no AI/agent response yet):

```http
POST /api/v1/threads/:id/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Split the lunch bill from yesterday"
}
```

Creating a message updates the thread's `lastActivityAt`. Messages cannot be added to archived threads. Pass `attachmentIds` from the upload endpoint to attach files to a message.

### Upload chat attachment

Files are uploaded to **Cloudinary** and metadata is stored in MongoDB. Allowed types match the frontend policy: JPG, PNG, WebP, HEIC, PDF, DOC/DOCX (max 8 MB). GIF, video, and audio are rejected.

Required env vars: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

```http
POST /api/v1/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file=<binary>
```

Response metadata:

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "receipt.jpg",
    "mimeType": "image/jpeg",
    "size": 12345,
    "kind": "image",
    "url": "https://res.cloudinary.com/...",
    "createdAt": "2026-08-24T12:00:00.000Z"
  }
}
```

Fetch metadata (owner only):

```http
GET /api/v1/files/:id
Authorization: Bearer <token>
```

Use the returned `url` to display or open the file in the client. For images, `url` uses Cloudinary auto-format and auto-quality (`f_auto`, `q_auto`), and `thumbnailUrl` provides a size-limited preview for chat. Message attachments reference file ids via `attachmentIds`.

### Create expense

```http
POST /api/v1/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 500,
  "category": "food",
  "note": "Lunch",
  "date": "2026-08-24"
}
```

### Search expenses

Filtering is body-based only (not query params):

```http
POST /api/v1/expenses/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "category": "food",
  "from": "2026-08-01",
  "to": "2026-08-24"
}
```

## Authentication flow

1. Client signs up or logs in.
2. Server validates input, hashes/verifies the password with bcrypt, and returns a JWT access token plus safe user data (`id`, `name`, `email`).
3. Client sends `Authorization: Bearer <token>` on protected routes.
4. Auth middleware verifies the JWT and attaches `{ sub: userId }` to the request. It does not hit the database on every request.

### Logout behavior

This foundation uses **stateless bearer JWTs**. `POST /api/v1/auth/logout` returns a success response and instructs the client to discard the token. The server cannot invalidate an already-issued access token without a revocation mechanism (for example a refresh-token store or denylist). That can be added later without changing the public logout route.

## Response format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

## Project structure

```text
src/
├── config/          # Env + database
├── controllers/     # HTTP adapters
├── middlewares/     # Auth, validation, errors
├── models/          # Mongoose models
├── repositories/    # Database access
├── routes/          # Route wiring
├── schemas/         # Zod schemas
├── services/        # Business logic
├── types/           # Shared types
├── utils/           # Helpers
├── app.ts           # Express app
└── server.ts        # Process bootstrap
```

## Architecture and design patterns

This backend follows a deliberate **layered architecture** combined with the **repository pattern**. The goal is a clear separation of concerns, predictable dependency direction, and services that can later be reused by non-HTTP callers (for example agent tools) without rewriting business logic.

### Primary pattern: layered architecture

Every request flows through the same layers:

```text
HTTP request
    ↓
Route            (path + middleware wiring only)
    ↓
Controller       (HTTP adapter: req/res/status codes)
    ↓
Service          (business / application logic)
    ↓
Repository       (database access)
    ↓
Mongoose Model   (schema definition)
    ↓
MongoDB
```

#### Layer responsibilities

| Layer | Location | Responsibility | Must not do |
| --- | --- | --- | --- |
| **Routes** | `src/routes/` | Declare endpoints, attach auth/validation middleware, map to controllers | Business rules, DB queries, response shaping beyond wiring |
| **Controllers** | `src/controllers/` | Read authenticated user + validated input, call services, return HTTP responses | Business rules, direct Mongoose/DB access |
| **Services** | `src/services/` | Application rules (ownership, hashing, token creation, expense rules) | Depend on Express `req`/`res`, contain raw query details |
| **Repositories** | `src/repositories/` | Encapsulate MongoDB/Mongoose queries | HTTP concerns, business policy, agent/LangGraph logic |
| **Models** | `src/models/` | Define Mongoose schemas/indexes/transforms | HTTP or orchestration logic |
| **Schemas** | `src/schemas/` | Zod contracts for external input | Persist data or enforce auth |
| **Middlewares** | `src/middlewares/` | Cross-cutting HTTP concerns (auth, validation, errors) | Domain workflows |

### Repository pattern

Database access is centralized in `src/repositories/` (for example `user.repository.ts`, `expense.repository.ts`).

Why:

- Services stay focused on business behavior.
- Query details (filters, sorting, `userId` scoping) live in one place.
- Future callers (REST controllers today; agent tools later) can share the same service → repository path.
- Naming stays consistent as more repositories are added (`thread`, `message`, `settlement`, etc.).

Example conceptual flow for expenses:

```text
expense.routes.ts
  → expense.controller.ts
    → expense.service.ts
      → expense.repository.ts
        → expense.model.ts
          → MongoDB
```

### Dependency direction

Dependencies point **downward / inward** only:

- Routes depend on controllers + middlewares + schemas
- Controllers depend on services
- Services depend on repositories (+ utils)
- Repositories depend on models
- Models depend on Mongoose

Lower layers must not import Express routes/controllers. Services must not import `req`/`res`.

This keeps the domain reusable:

```text
REST API path:
  Route → Controller → Service → Repository → MongoDB

Future agent path (not implemented yet):
  LangGraph tool → Service → Repository → MongoDB
```

### Middleware pipeline pattern

Cross-cutting HTTP concerns are implemented as Express middleware, not mixed into services:

1. **Security / platform middleware** in `app.ts` (`helmet`, `cors`, JSON body parser)
2. **Authentication middleware** (`auth.middleware.ts`) — verifies Bearer JWT and attaches `req.user`
3. **Validation middleware** (`validate.middleware.ts`) — runs Zod schemas before controllers
4. **Error middleware** (`error.middleware.ts`) — maps `ApiError` and unexpected errors to a consistent JSON shape

Typical protected route chain:

```text
authenticate → validateRequest(schema) → controller
```

### Input validation / DTO pattern (Zod)

External input is treated as untrusted. Zod schemas in `src/schemas/` define request contracts:

- Auth: signup, login
- Expenses: create, update, id params, search body

Validation happens **before** business logic. Invalid input returns a consistent `VALIDATION_ERROR` response and never reaches repositories.

### Application bootstrap split (`app.ts` vs `server.ts`)

- **`app.ts`**: builds the Express application (middleware + routes + error handler). Useful for tests via `createApp()` without binding a port.
- **`server.ts`**: process entrypoint — loads env, connects MongoDB, starts HTTP server, handles graceful shutdown.

This is a common **composition root / bootstrap** split.

### Auth and multi-tenant scoping pattern

- Authentication uses **stateless Bearer JWTs** returned in the JSON body on signup/login.
- Protected handlers read the authenticated user id from the token (`req.user.sub`), never from a client-supplied `userId`.
- Expense repository queries are always scoped by authenticated `userId` (for example `findOne({ _id, userId })`), so User A cannot read/update/delete User B’s data by guessing an id.

### Error-handling pattern

- Domain/HTTP failures use a shared `ApiError` class (`src/utils/api-error.ts`).
- Controllers/services throw `ApiError`; the centralized error middleware formats responses.
- Production responses do not expose stack traces or internal details.

### Patterns intentionally not used (yet)

To keep the codebase pragmatic at this stage, the project does **not** currently use:

- Full Domain-Driven Design (bounded contexts, aggregates as formal packages)
- CQRS / event sourcing
- A dependency-injection container
- Formal hexagonal “ports and adapters” package boundaries
- Microservices or message queues

Those can be introduced later if complexity justifies them. The current layered + repository style is the standard for this API.

### Practical rules for new features

When adding a new domain capability:

1. Add/extend a **Zod schema** for input.
2. Add/extend a **Mongoose model** if persistence is needed.
3. Put queries in a **repository**.
4. Put business rules in a **service** (no Express types).
5. Keep the **controller** thin.
6. Wire the **route** with auth + validation middleware.
7. Ensure user-owned resources are always queried with the authenticated `userId`.
