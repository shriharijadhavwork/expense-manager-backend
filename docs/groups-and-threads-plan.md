# Groups, Shared Threads & Soft Delete — Implementation Plan

> **Status:** Locked for implementation (v1). Execute **one batch at a time** in order.  
> **Out of scope here:** Agentic AI runtime (but schema/context fields are AI-ready).  
> **Related:** Existing personal threads, recycle bin (7 days), user preferences, expenses.

---

## 1. Goals

- Multiple people share expenses via **Groups** (not one shared login).
- **Personal threads** stay private forever (WhatsApp-like).
- **Group threads** are shared conversations inside a group.
- Inviting someone never rewrites personal history.
- Soft delete + 7-day recycle; no messages while deleted.
- Clear classification for future AI (`type`, `userId` | `groupId`, `createdBy`, `authorId`).

---

## 2. Locked product rules

### 2.1 Containers

```text
User
 └── personal Threads          (type=personal, parent=userId)

Group
 ├── GroupMember(s)
 ├── GroupInvite(s)             (email invite for users not yet in app)
 └── group Threads             (type=group, parent=groupId)
```

- **No `householdId`.** Group is the shared unit. Any users can be members.
- Thread has **exactly one parent**: `userId` XOR `groupId`.

### 2.2 Titles (display only; IDs stay ObjectIds)

| Entity | Default title |
|--------|----------------|
| Group | Renamable name, e.g. `Family` / `A & B` |
| Personal thread | `26 Aug 2026 · Thread 1` |
| Group thread | `26 Aug 2026 · Thread 1` (sequence per group + day) |

Store: `dayKey: "2026-08-26"`, `sequence: number`, `title: string` (renamable).  
Timezone for “today” comes from the acting user’s preferences.

### 2.3 Personal vs group access

| Thread type | Who can read/write |
|-------------|-------------------|
| `personal` | Only `thread.userId` |
| `group` | Active `GroupMember` rows for `thread.groupId` |

Personal threads **never** gain members.

### 2.4 Starting shared chat / inviting

**Do not** “add user into this personal thread.”

Action is always: **resolve or create Group → create/open Thread**.

**Find-or-create group by exact member set:**

1. User selects people `[B]` or `[B, C, …]`.
2. Look up a non-deleted group whose **active members exactly match** `{actingUser} ∪ selected`.
3. If found → use it; create a **new thread** for today (next sequence).
4. If not → create group + members → create first thread.

### 2.5 Adding C from an existing group AB

UI must ask:

1. **Add C to this group** (AB becomes ABC) — owner only; warn that C will see prior group history; set `addedBy`.
2. **Start new group with A, B, C** — AB untouched; find-or-create exact set `{A,B,C}`.

**v1:** No multi-member consent votes. Owner/admin adds with warning.  
**v2 (optional later):** `memberAddPolicy: "owner_only" | "requires_member_approval"`.

Email **`GroupInvite`** is for people not registered yet (different from “ask B if C may join”).

### 2.6 Roles, leave, remove

| Action | Who (v1) |
|--------|----------|
| Create group | Any authenticated user |
| Add member | Group **owner** only |
| Remove member | Group **owner** only |
| Leave group | Any member (self) |
| Owner leaves | Must **transfer ownership** first, or dissolve if last member |
| Rename group | Owner |
| Soft-delete thread | Thread `createdBy` **or** group owner (for group threads) |
| Restore thread | Same as delete permission |

Track on membership: `addedBy`, `joinedAt`. Prefer soft leave via `leftAt` or remove row + optional audit/system message.

Do **not** hard-delete past messages when someone leaves; keep `authorId`.

### 2.7 Soft delete / recycle

| Rule | v1 |
|------|-----|
| Field | `deletedAt` on **Thread** (primary) |
| Window | 7 days, then purge job |
| While deleted | **Block new messages**; show note (“In Recycle Bin — restore to continue”) |
| Group soft-delete | Defer whole-group delete; soft-delete **threads** first |
| Personal recycle | Owner only |
| Group thread recycle | Visible to members who could access it; restore per permission above |

### 2.8 Expenses (group-aware)

```text
Expense {
  createdBy          // real user who logged it
  groupId?           // null = personal; set = shared with that group
  amount, currency, category, note, date
  sourceThreadId?
  sourceMessageId?
}
```

Derive visibility: `groupId == null` → personal, else shared.

### 2.9 AI-ready context (do not parse titles)

```text
{
  threadType: "personal" | "group",
  threadId,
  userId?,          // personal only
  groupId?,         // group only
  groupName?,
  actingUserId,
  defaultCurrency
}
```

---

## 3. Data model (key names)

### `Group`
```text
id
name
createdBy          // userId of creator/owner
deletedAt?         // optional later
createdAt
updatedAt
```

### `GroupMember`
```text
id
groupId
userId
role               // "owner" | "member"
addedBy?           // userId who added them; null for creator
joinedAt
leftAt?            // optional soft-leave
```

Unique index: `(groupId, userId)` among active members.

### `GroupInvite`
```text
id
groupId
email
invitedBy          // userId
token
status             // "pending" | "accepted" | "revoked" | "expired"
expiresAt
createdAt
```

### `Thread` (extend existing)
```text
id
type               // "personal" | "group"
userId?            // REQUIRED if personal; omit if group
groupId?           // REQUIRED if group; omit if personal
createdBy          // who created the thread
dayKey             // "YYYY-MM-DD"
sequence           // 1, 2, ...
title              // default "DD Mon YYYY · Thread N"; renamable
status             // active | archived (existing)
deletedAt?
lastActivityAt
readAt?            // personal read state; group read may need per-user later
createdAt
updatedAt
```

**Invariant:** personal ⇒ `userId` set & `groupId` null; group ⇒ `groupId` set & `userId` null.

Indexes:
- personal today: `(type, userId, dayKey, sequence)`
- group today: `(type, groupId, dayKey, sequence)`
- list: `(userId, deletedAt, lastActivityAt)` / membership-driven group thread list

### `Message` (extend)
```text
id
threadId
authorId           // rename from userId when migrating (or keep userId as author — pick one in Batch 1 and stick to it)
content
attachmentIds
expenseIds
createdAt
```

Recommendation: introduce `authorId` as the message sender field going forward; migrate existing `userId` → `authorId` in the message migration batch.

### System messages (optional but useful)
```text
role: "system"
content: "A added C to the group"
```

---

## 4. API sketch (target)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/groups` | Create group with member userIds (exact set includes self) |
| `POST` | `/groups/resolve` | Find-or-create by exact member set; return group + optional new thread |
| `GET` | `/groups` | List groups for current user |
| `GET` | `/groups/:id` | Group detail + members |
| `PATCH` | `/groups/:id` | Rename (owner) |
| `POST` | `/groups/:id/members` | Add member (owner); body `{ userId }` or invite email |
| `DELETE` | `/groups/:id/members/:userId` | Remove member (owner) |
| `POST` | `/groups/:id/leave` | Current user leaves |
| `POST` | `/groups/:id/transfer` | Transfer ownership |
| `POST` | `/groups/:id/invites` | Email invite |
| `POST` | `/invites/:token/accept` | Accept invite |
| `POST` | `/groups/:id/threads` | Create group thread (dayKey/sequence/title server-side) |
| `GET` | `/groups/:id/threads` | List group threads |
| Extend | `/threads` | Personal threads only; enforce `type=personal` |
| Extend | messages | Membership checks for group threads; block if `thread.deletedAt` |

Exact paths can follow existing `/api/v1` prefix and layering (routes → controllers → services → repositories).

---

## 5. Default UX behavior

1. App open → load **today’s latest personal thread** (`dayKey` + timezone); if none, local draft; persist on first message.
2. Groups section → list groups; open group → today’s latest **group** thread or draft.
3. “Chat with…” / “Add people” → resolve/create group → new thread (never mutate personal).
4. From group AB, “Add C” → modal: add to this group **or** new group ABC.

---

## 6. Implementation batches

Execute **in order**. Each batch is a mergeable unit (backend ± frontend as noted). Do not start batch N+1 until batch N is done and verified.

### Batch 0 — Baseline & migration strategy (docs/checklist only)
**Scope:** Confirm current Thread/Message/Expense shapes; decide message field rename (`userId` → `authorId`); list backward-compat steps for existing personal threads.  
**Deliverable:** Short checklist in PR / this doc “Batch 0 notes” if anything changes.  
**Independent?** Yes — planning only.  
**Verify:** Existing tests still green; no schema change yet.

---

### Batch 1 — Group core (backend)
**Scope:**
- Models: `Group`, `GroupMember`
- Repositories + services + routes for:
  - create group
  - list my groups
  - get group
  - rename group (owner)
- On create: creator is `role: owner`, `addedBy: null`
- Tests for create/list/authz

**Not in this batch:** invites, add/remove/leave, threads under group.  
**Verify:** API tests pass; personal threads unchanged.

---

### Batch 2 — Membership mutations (backend)
**Scope:**
- Add member (owner only) + `addedBy`
- Remove member (owner only)
- Leave group
- Transfer ownership + leave rules
- Optional system message helper (can stub)
- Tests for permissions and edge cases (cannot remove last owner without transfer)

**Not in this batch:** email invites, group threads.  
**Verify:** Membership tests pass.

---

### Batch 3 — Email invites (backend)
**Scope:**
- `GroupInvite` model
- Create invite, accept by token, expire/revoke
- On accept: create `GroupMember`
- Tests (can mock email send; log link in dev)

**Depends on:** Batch 1–2.  
**Verify:** Invite accept joins group.

---

### Batch 4 — Thread model evolution (backend)
**Scope:**
- Extend `Thread`: `type`, `groupId?`, `createdBy`, `dayKey`, `sequence`
- Migrate existing threads → `type: "personal"`, set `createdBy = userId`, backfill `dayKey`/`sequence`/`title` where possible
- Enforce XOR parent invariant in schema/service
- Title helper: `formatThreadTitle(dayKey, sequence)`
- Next-sequence helpers for personal and group
- Soft-delete: block `messageService.create` when `deletedAt` set (note-ready error)
- Update thread list/create APIs for personal path only still working
- Tests + recycle behavior preserved

**Depends on:** Batch 1 (for groupId FK validity); can land before UI uses groups.  
**Verify:** All existing thread/message/file tests pass; new personal title/sequence tests pass.

---

### Batch 5 — Group threads API (backend)
**Scope:**
- `POST/GET /groups/:id/threads`
- Access only if active member
- Create uses dayKey/sequence/title rules
- `POST /groups/resolve` (find-or-create exact member set + create thread)
- Message create/list authorization for `type=group`
- Expense optional `groupId` on create when sourced from group thread (minimal wiring)
- Tests

**Depends on:** Batch 1, 2, 4.  
**Verify:** A+B resolve creates one group; second resolve reuses group and new thread; C cannot read AB personal threads.

---

### Batch 6 — Frontend: groups list & navigation
**Scope:**
- API client for groups
- UI: list groups; open group; create “Chat with…” (select users — may start with user id/email search stub)
- Keep personal chat default behavior
- Types updated (`Thread.type`, etc.)

**Depends on:** Batch 1, 5 (for resolve/threads).  
**Verify:** Can create/open group from UI.

---

### Batch 7 — Frontend: add-member modal & membership UI
**Scope:**
- From group AB: modal — “Add to this group” vs “Start new group with A,B,C”
- Members list; leave group; owner remove; transfer ownership UI (minimal)
- History warning copy when adding to same group
- Invite-by-email UI (if Batch 3 done)

**Depends on:** Batch 2, 3, 5, 6.  
**Verify:** Both add paths work; personal threads remain private.

---

### Batch 8 — Soft delete / recycle for group threads (full stack)
**Scope:**
- Ensure group threads appear in recycle per rules
- Block composer when deleted; show note
- Restore permissions for group threads
- Purge job note / existing 7-day behavior extended
- Tests + UI

**Depends on:** Batch 4–7.  
**Verify:** Deleted group thread rejects messages; restore works.

---

### Batch 9 — Polish & AI readiness (optional before agent)
**Scope:**
- System messages on add/leave
- Per-user read state for group threads (if needed)
- Document AI context payload in README
- Expense UI: show group badge when `groupId` set
- README API section update

**Depends on:** prior batches as needed.  
**Verify:** Manual checklist + tests green.

---

## 7. Batch dependency graph

```text
Batch 0
   ↓
Batch 1 (Group core)
   ↓
Batch 2 (Membership) ──→ Batch 3 (Invites)
   ↓
Batch 4 (Thread evolution)
   ↓
Batch 5 (Group threads API)
   ↓
Batch 6 (FE groups nav) ──→ Batch 7 (FE add-member UI)
   ↓
Batch 8 (Recycle group threads)
   ↓
Batch 9 (Polish / AI prep)
```

Batches **1→2→3** are backend membership track.  
Batch **4** can start after **1** (does not need 2–3).  
Batch **5** needs **1+2+4**.  
Frontend **6–7** need **5**.

---

## 8. Explicit non-goals (v1)

- Household entity
- Multi-member approval voting to add C
- Converting personal thread → group
- Join-time message visibility filtering
- Settlements / splits UI
- Agentic AI execution (schema only)

---

## 9. How to execute with the agent

When ready, ask to run a single batch, e.g.:

> Implement **Batch 1 — Group core (backend)** per `docs/groups-and-threads-plan.md`

Do not combine batches unless you explicitly ask.

---

## 10. Confirmation checklist (plan complete)

- [x] Group as shared unit (no householdId)
- [x] Personal vs group thread XOR parent
- [x] Title/sequence rules
- [x] Find-or-create by exact member set
- [x] Add C: same group vs new group UI
- [x] Owner add/remove; member leave; owner transfer
- [x] `addedBy` tracking
- [x] Soft delete / recycle / block messages
- [x] Expense `createdBy` + optional `groupId`
- [x] AI context shape
- [x] Ordered independent-enough batches 0–9

### Batch execution log

| Batch | Status | Notes |
|-------|--------|--------|
| 0 | pending | |
| 1 | **done** | Group + GroupMember models; create/list/get/rename; owner rename authz |
| 2 | **done** | Add/remove member, leave, transfer ownership; soft leave; dissolve solo owner; system message stub |
| 3 | **done** | GroupInvite model; create/list/revoke; accept by token; **email send is still a console stub** (see `docs/email-and-auth-plan.md` for real delivery) |
| 4 | **done** | Thread type/XOR parent; dayKey/sequence/title; personal create path; backfill; recycle message block |
| 5 | **done** | Group threads create/list; resolve exact member set; group message auth; expense groupId from chat |
| 6 | **done** | Frontend groups list, Chat with…, group thread open; Thread types; personal default unchanged |
| 7 | **done** | Add-member modal (same vs new group); members/leave/remove/transfer; email invites + accept page |
| 8 | **done** | Group thread soft-delete/restore/recycle; composer recycle note; purge job helper |
| 9 | **done** | System messages; AI context README; expense group badge; groups API docs; deferred group readAt |

---

## Follow-on: real email + auth mail

Groups invite **logic** is done; **SMTP/SES delivery**, signup OTP, and password-reset mail are tracked separately:

→ **`docs/email-and-auth-plan.md`** (batches E0–E5, future SES + monthly summary)

**Plan documentation is ready.** You can request **Batch 0** or **Batch 1** next.
