# Expense Manager Backend

Frontend-agnostic REST API for a multi-user expense management application. This repository currently provides authentication and authenticated expense CRUD/search. AI features are intentionally out of scope for this stage.

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
| `POST` | `/auth/signup` | No | Create account and return access token |
| `POST` | `/auth/login` | No | Authenticate and return access token |
| `POST` | `/auth/logout` | No | Client-oriented logout contract |
| `GET` | `/auth/me` | Bearer JWT | Current authenticated user |
| `POST` | `/expenses` | Bearer JWT | Create an expense |
| `GET` | `/expenses` | Bearer JWT | List the current user's expenses (no query filters) |
| `POST` | `/expenses/search` | Bearer JWT | Search/filter expenses via request body |
| `GET` | `/expenses/:id` | Bearer JWT | Get one expense |
| `PATCH` | `/expenses/:id` | Bearer JWT | Update one expense |
| `DELETE` | `/expenses/:id` | Bearer JWT | Delete one expense |

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
