# Email Delivery, Auth Verification & Invites — Implementation Plan

> **Status:** E0–E5 done (email track complete for v1). Future: F1 SES, F2 summaries.  
> **Related:** Groups invites (`docs/groups-and-threads-plan.md` Batch 3 — invite *logic* done; real send is stub).  
> **Provider path:** Nodemailer (SMTP) first → swap to AWS SES later without changing callers.

---

## 0. Current state (confirmed)

| Flow | Status today | What exists |
|------|----------------|-------------|
| **Group invite email** | **Stub only** | Invite token + accept URL stored; `sendGroupInviteEmail` **logs** the link to the console. No SMTP/SES. Recipient cannot receive mail unless they see the logged URL / UI `inviteUrl`. |
| **Signup OTP / email confirmation** | **Missing** | `POST /auth/signup` creates the account immediately. No `emailVerified`, no OTP, no confirm endpoint. |
| **Forgot / reset password** | **Missing** | No forgot-password or reset-password routes/UI. Login is email + password only. |

So: invite *workflow* works in-app if someone has the link; **we are not actually emailing anyone**. Auth has no verification or reset mail either.

---

## 1. Goals

1. One **transport-agnostic mailer** that accepts destination + subject + body (and optional HTML).
2. Feature services (invites, OTP, reset, summaries) only build content and call the mailer — never talk to Nodemailer/SES directly.
3. Ship real mail with **Nodemailer + SMTP** now; switch to **AWS SES** later via config + one provider class.
4. Cover invite / signup confirm / password reset now; leave hooks for monthly summaries and other transactional mail.

---

## 2. Architecture (locked)

```text
Feature services                    Email module
─────────────────                   ────────────
groupInviteService ──┐
authOtpService ──────┼──► emailService.send(MailMessage)
authPasswordReset ───┤              │
(future) summaryJob ─┘              ▼
                            EmailProvider (interface)
                              ├── NodemailerSmtpProvider  (now)
                              ├── SesProvider             (later)
                              └── ConsoleProvider         (test / local fallback)
```

### 2.1 Core contract

```ts
type MailAddress = string | { address: string; name?: string };

type MailMessage = {
  to: MailAddress | MailAddress[];
  subject: string;
  text: string;          // plain-text required
  html?: string;         // optional HTML twin
  replyTo?: MailAddress;
  headers?: Record<string, string>;
};

interface EmailProvider {
  send(message: MailMessage): Promise<void>;
}

// Application facade used everywhere:
emailService.send(message: MailMessage): Promise<void>
```

- **No** feature-specific methods on the provider (`sendInvite`, `sendOtp`, …).
- Templates live in `src/services/email/templates/` (or `src/emails/`) and return `{ subject, text, html }`.
- `emailService` picks the provider from `EMAIL_PROVIDER=console|smtp|ses`.

### 2.2 Why this shape

- Monthly expense summary later = new template + `emailService.send({ to, subject, text, html })`.
- SES migration = new `SesProvider` + env vars; invite/OTP/reset code unchanged.
- Tests inject `ConsoleProvider` or a mock implementing `EmailProvider`.

### 2.3 Env (planned)

```env
# Shared
EMAIL_PROVIDER=console          # console | smtp | ses
EMAIL_FROM="Flux Team <noreply@example.com>"
FRONTEND_URL=http://localhost:3000

# Nodemailer SMTP (EMAIL_PROVIDER=smtp)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=

# AWS SES (EMAIL_PROVIDER=ses) — future
AWS_REGION=ap-south-1
# Prefer IAM role in prod; optional static keys for local:
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
SES_CONFIGURATION_SET=          # optional
```

`.env.example` should document all of the above; production must not default to `console`.

---

## 3. Product rules for auth + invites

### 3.1 Group invite (upgrade stub → real send)

- Keep existing token, 7-day expiry, email-must-match-on-accept.
- After creating/refreshing invite, call mailer with invite template (link to `/app/invites/:token`).
- If recipient has no account: accept page should guide **signup → then accept** (same email). Optional later: deep-link `?invite=` on register.
- Failure policy (v1): **persist invite even if send fails**; return invite + surface a soft warning / retry send endpoint later. Never lose the invite record because SMTP is down.

### 3.2 Signup email confirmation (OTP)

**Recommended v1: 6-digit OTP (not magic link only)** — works well on mobile later; email still carries the code + optional link.

| Rule | Choice |
|------|--------|
| When | After signup (or “resend OTP”) |
| Store | Hash of OTP + `expiresAt` + attempt count on user (or `EmailVerification` collection) |
| TTL | ~10 minutes |
| Login before verify | **Block** sensitive actions or **block login** until verified (prefer: allow signup response with `emailVerified: false`, require verify before full use — pick one in Batch E2 and stick to it) |
| Resend | Rate-limit (e.g. 1/min, max N/hour) |
| Change email | Out of scope v1 |

**Locked rule (Batch E2):** User is created on signup; JWT is issued with `emailVerified: false`; OTP email is sent via `emailService`. Login is allowed so the user can call verify/resend. Frontend blocks `/app/*` until verified (`/verify-email`). Legacy users without `emailVerified` are treated as verified.

### 3.3 Password reset

| Rule | Choice |
|------|--------|
| Request | `POST /auth/forgot-password` `{ email }` — **always** return generic success (no email enumeration) |
| Token | Cryptographically random; store **hash only**; TTL ~1 hour; single use |
| Email | Link to `FRONTEND_URL/reset-password?token=…` |
| Complete | `POST /auth/reset-password` `{ token, newPassword }` |
| Sessions | Invalidate not applicable if JWT-only (optional: bump `passwordChangedAt` and reject older tokens later) |

### 3.4 Future (document only; not in near batches)

- Monthly / weekly expense summary emails
- “You were added to group X” (in addition to in-app system message)
- Digest of unread group activity
- Admin / billing notices

All of these should only add templates + a caller — no new mailer APIs.

---

## 4. Suggested folder layout

```text
src/services/email/
  email.service.ts              # facade → provider
  types.ts                      # MailMessage, EmailProvider
  providers/
    console.provider.ts
    nodemailer-smtp.provider.ts
    ses.provider.ts             # stub or unimplemented until Batch F
  templates/
    layout.ts                   # shared shell — table-based, Mercury/Cobalt branded, every template goes through it
    group-invite.ts
    signup-otp.ts
    password-reset.ts
    # monthly-summary.ts        # future
  invite-email.service.ts       # thin wrapper → template + emailService (migrate existing)
```

Deprecate direct console logging inside invite as soon as Batch E1 lands.

**Visual design:** all three templates render through `buildTransactionalEmail` in `layout.ts` — a table-based layout (not divs, for reliable Outlook rendering) using the same Onyx/Graphite/Cobalt palette as the app (hardcoded as literal hex — email HTML can't read CSS custom properties; see `frontend/docs/design-system.md`). A new template should call `buildTransactionalEmail` + the `htmlParagraph`/`htmlCta`/`htmlCode`/`htmlMuted` helpers rather than hand-rolling markup, so it inherits the card shell, the pill CTA button, and the hidden preheader text for free.

---

## 5. Batches

Execute in order. Groups foundation is already done; this track starts at **E0**.

| Batch | Focus | Status |
|-------|--------|--------|
| **E0** | Docs + env contract + provider interface + `emailService` + ConsoleProvider; wire invite stub through facade (behavior unchanged: still logs) | **done** |
| **E1** | Nodemailer SMTP provider; real group-invite emails; config validation; tests with mock provider | **done** |
| **E2** | Signup OTP: model fields, send/verify/resend APIs, FE verify UI after register | **done** |
| **E3** | Forgot/reset password APIs + FE pages; reset email template | **done** |
| **E4** | Invite accept UX for unauthenticated users (signup/login then accept); optional invite query on register | **done** |
| **E5** | Hardening: rate limits, HTML+text templates, production `EMAIL_PROVIDER` checks, README | **done** |
| **F1** *(future)* | AWS `SesProvider` + IAM/env docs; feature-flag switch from SMTP | **future** |
| **F2** *(future)* | Monthly summary job + template using same `emailService.send` | **future** |
| **F3** *(future)* | Optional: membership notification emails, unread digests | **future** |

### Batch E0 — Mailer foundation (no behavior change)

- Add `EmailProvider` + `MailMessage` types
- `ConsoleProvider` + `emailService.send`
- Env: `EMAIL_PROVIDER`, `EMAIL_FROM` (optional until E1)
- Refactor `invite-email.service` to build template then call `emailService` (console still used when `EMAIL_PROVIDER=console`)
- Unit test: message shape passed to provider

**Not in this batch:** real SMTP, OTP, reset.

### Batch E1 — Nodemailer + live invites

- Implement `NodemailerSmtpProvider`
- Require SMTP env when `EMAIL_PROVIDER=smtp`
- Group invite sends real email (subject/body/link)
- Integration test with mocked transporter / provider
- Update README + `.env.example`

**Not in this batch:** OTP, password reset, SES.

### Batch E2 — Signup OTP

- User (or collection): `emailVerified`, OTP hash, expiry, resend/attempt counters
- `POST /auth/resend-otp`, `POST /auth/verify-email` `{ code }`
- Send OTP mail via `emailService`
- FE: post-signup verification step; gate UX as decided in §3.2
- Tests: verify success/fail/expiry/rate limit

**Not in this batch:** password reset, SES.

### Batch E3 — Password reset

- Token model/fields; forgot + reset endpoints
- Reset email template + FE forgot/reset pages
- Tests: enumeration-safe forgot; single-use token; expiry

**Not in this batch:** SES, summaries.

### Batch E4 — Invite + auth handoff

- Logged-out invite link → login/register → return to accept
- Ensure email on account matches invite email
- FE copy: “use the same email this invite was sent to”

### Batch E5 — Polish

- Rate limiting on auth email endpoints
- Consistent HTML/text templates
- Fail-soft vs fail-loud policy documented
- Ops notes (SPF/DKIM when on real domain)

### Future F1 — AWS SES

- `SesProvider` using AWS SDK v3 `@aws-sdk/client-ses` (or SESv2)
- Same `MailMessage` input
- Docs for IAM `ses:SendEmail` and moving off SMTP

### Future F2 — Monthly summary

- Cron/job builds summary → template → `emailService.send`
- Proves the generic contract; no mailer changes

### Future F3 — Extra notifications

- Optional emails for add-to-group, etc., without changing provider

---

## 6. Frontend batches (paired)

| Batch | Focus | Status |
|-------|--------|--------|
| **FE-E1** | No UI required if invite already shows link; optional “Email sent” toast once SMTP works | with E1 |
| **FE-E2** | Verify-email page / OTP input after register; resend control | with E2 |
| **FE-E3** | Forgot password + reset password pages | with E3 |
| **FE-E4** | Invite accept when logged out → auth → accept | **done** (with E4) |

Canonical backend plan remains this file; frontend may keep a short pointer (see `frontend/docs/email-and-auth-plan.md`).

---

## 7. Testing strategy

- Prefer injecting a mock `EmailProvider` in Vitest (assert `send` called with expected `to` / `subject` / body containing token or OTP).
- Do **not** hit real SMTP in CI.
- Optional: local Mailpit / Ethereal SMTP for manual E1 checks.

---

## 8. Non-goals (v1)

- Marketing / bulk newsletter platform
- Changing primary login to magic-link-only
- Multi-brand email themes
- Guaranteeing delivery / bounce webhooks (can add with SES later)

---

## 9. Execution

Ask for one batch at a time, e.g.:

> Implement **Batch E0** per `docs/email-and-auth-plan.md`

Do not combine E2+E3 unless explicitly requested.
