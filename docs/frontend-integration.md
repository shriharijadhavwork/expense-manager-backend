# Frontend integration (FLUX)

> **Status:** Current as of the FLUX landing page (v1).

The web client lives in `frontend/` (Next.js 16, App Router). Product name in the UI: **FLUX** (configured via `appConfig` / email brand).

## URLs and CORS

| Surface | URL (local dev) | Auth |
| --- | --- | --- |
| Landing / marketing | `http://localhost:3000/` | Public |
| Register / login | `/register`, `/login` | Guest |
| App | `/app`, `/app/chat`, … | Bearer JWT required |
| Invite preview | `/invites/:token` | Public preview; accept requires login |

Backend must allow the frontend origin:

```env
FRONTEND_URL=http://localhost:3000
```

Frontend API base:

```env
NEXT_PUBLIC_API_URL=http://localhost:5050/api/v1
```

Optional WebSocket host (defaults to API host):

```env
NEXT_PUBLIC_WS_URL=http://localhost:5050
```

Invite emails link to `{FRONTEND_URL}/invites/:token`. Password reset links use `{FRONTEND_URL}/reset-password?token=…`.

## What the landing page can honestly claim

The trust section on `/` reflects **implemented** backend behavior. Maintain this alignment when changing either side.

| Claim | Backend support |
| --- | --- |
| Data scoped to signed-in account | Yes — routes use `auth` middleware; expenses/threads filtered by membership/user |
| Passwords hashed (bcrypt) | Yes — `auth` signup/login |
| API requires authentication for private data | Yes — Bearer JWT on protected routes |
| Email verification before app use | Yes — `emailVerified` on user; frontend `AuthGuard` / `GuestGuard` |
| Rate limiting on auth endpoints | Yes — `express-rate-limit` (see README) |
| Security headers | Yes — `helmet` |

**Do not** add landing copy for: E2E encryption, bank-level security, SOC2, or “we never see your data” — user data is stored in MongoDB on the server.

## What the landing page illustrates but does not implement yet

These are **marketing demos only** or **partially live** — do not overclaim in copy:

- **Partially live:** Natural-language expense extraction — backend AI creates expenses from chat when `GEMINI_API_KEY` is set; landing hero animations remain stylized/illustrative
- Income, transfers, or running balance aggregation APIs
- Automated comparative insights (e.g. “dining up 24% vs last month”) — query summaries exist but not comparative analytics
- Settlement / owe/owed balances (`/app/settlements` is a shell)

See `frontend/docs/landing-page.md` for the full capability matrix and component map.

## Implemented features the app uses

| Feature | API / notes |
| --- | --- |
| Auth (signup, login, OTP, forgot/reset password) | `/auth/*` |
| Personal + group threads, messages | `/threads/*`, `/groups/*` |
| Realtime message delivery | Socket.IO `message.created` (user, system, and assistant messages) |
| Expenses CRUD + search | `/expenses`, `/expenses/search`, `GET /expenses/categories` |
| Expense fields | `direction` (debit/credit), `category` (slug), `categoryLabel` (UI title), `subCategory` (free text) |
| File attachments | `/files` (Cloudinary) |
| User preferences (theme, timezone, currency) | `PATCH /auth/me` |
| FLUX AI assistant (chat) | Debounced LangGraph turn after user message; `role: "assistant"` persisted + pushed over Socket.IO when `GEMINI_API_KEY` set. See `docs/ai-implementation.md` and `frontend/docs/chat.md`. |

Conversational Q&A and expense updates via chat are **live** for supported intents (`query_expenses`, `update_expense`). Landing-page “ask FLUX” demos may show capabilities not yet in the app UI.

## Local full-stack dev

```bash
# Terminal 1 — backend (port 5050)
cd expense-manager-backend
cp .env.example .env   # set MONGODB_URI, JWT_SECRET, FRONTEND_URL
npm run dev

# Terminal 2 — frontend (port 3000)
cd frontend
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/` for the landing page, `/register` to create an account, `/app` after sign-in.

## Related docs

- API reference: `../README.md`
- AI implementation: `ai-implementation.md`
- Landing page implementation: `../../frontend/docs/landing-page.md`
- Chat UI (frontend): `../../frontend/docs/chat.md`
- Realtime: `realtime-socketio-plan.md`
- Email/auth: `email-and-auth-plan.md`
