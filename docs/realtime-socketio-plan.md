# Realtime messaging (Socket.IO) — Implementation Plan

> **Confirmed (2026-08-27)**  
> 1. In-process Socket.IO + `realtime` module (not a separate service)  
> 2. Publish-after-persist via a gateway (SSE can plug in later)  
> 3. Create stays REST; socket is **notify-only** for v1  
> 4. First event: `message.created` to room `thread:{threadId}`  
> Polling is out of scope.

Related: chat today loads via REST only — other clients only see new messages after refresh.

---

## Architecture

```
POST /threads/:id/messages
  → messageService.create (persist)
  → realtime.publish({ type: "message.created", threadId, payload })
       → SocketIoAdapter → emit to room thread:{threadId}
       → (later) SseAdapter → same event shape
```

| Layer | Responsibility |
|--------|----------------|
| `messageService` | Persist only; call `realtime.publish` after success (no Socket.IO imports) |
| `realtime/publisher` | Fan-out to registered adapters |
| `realtime/adapters/socketio` | JWT handshake, join/leave rooms, emit |
| Frontend `realtimeClient` | Connect, join thread, handle `message.created` |

**Rooms:** `thread:{threadId}` — join only after membership / personal-thread ownership check.  
**Auth:** same JWT as REST, passed on Socket.IO handshake (`auth.token` or `Authorization`).  
**Idempotency (FE):** ignore events whose `message.id` is already in the list (covers own POST echo).

### Future SSE (no domain rewrite)

Add `SseAdapter` implementing the same publish API + `GET /threads/:id/events` (or `/realtime/sse`).  
`messageService` unchanged. Frontend can subscribe via SSE client behind the same event handlers.

### Multi-instance later

Keep the gateway; add Socket.IO **Redis adapter** when running >1 API process. Still not a separate realtime microservice unless ops demand it.

---

## Batches

### R0 — Contract + docs (this file)

- Event payload shape for `message.created` (align with `SafeMessage` + optional sender display fields if needed)
- Room naming, handshake auth rule, FE client interface sketch
- Mark this plan as the source of truth

### R1 — Backend realtime gateway + Socket.IO adapter ✅ done

- Add `socket.io` dependency
- `src/realtime/types.ts` — `RealtimeEvent` union starting with `message.created`
- `src/realtime/publisher.ts` — register adapters; `publish(event)`
- `src/realtime/adapters/socketio.adapter.ts` — attach to existing `http.Server` in `server.ts`
- Handshake: verify JWT → `socket.data.userId`
- Client event `thread:join` / `thread:leave` with access check via `threadService.requireAccessibleThread`
- Noop / no-op adapter in tests so unit tests do not need a live socket

**Done when:** authenticated client can connect, join an accessible thread room, and receive a test emit.

### R2 — Publish after message persist ✅ done

- After successful `messageService.create` (user + system messages that go through the same path), `realtime.publish({ type: "message.created", … })`
- Ensure group system messages also publish if they create `Message` rows
- Do **not** change create HTTP request/response contract

**Done when:** two sockets in the same thread room both receive `message.created` after REST create (manual or integration test).

### R3 — Frontend realtime client + chat workspace ✅ done

- Env: `NEXT_PUBLIC_WS_URL` (default same origin / API host)
- `lib/realtime/client.ts` — connect with token, join/leave on thread change, reconnect
- `chat-workspace`: on `message.created`, append if not duplicate; update read cursor / sidebar last-message if cheap
- Disconnect / leave on unmount or thread switch

**Done when:** two browsers in the same group thread see each other’s messages without refresh.

### R4 — Hardening + docs polish ✅ done

- CORS / origins for Socket.IO aligned with `FRONTEND_URL`
- Rate-limit or throttle join attempts (light)
- README: how to run locally, env vars, event list
- Optional: vitest/socket.io-client smoke for join + emit
- Explicitly document SSE as Batch **R5** (not started)

### R5 — SSE adapter (later, not v1)

- `SseAdapter` + HTTP route; same `RealtimeEvent` payloads
- FE transport switch or dual support behind one hook

---

## Event contract (v1)

```ts
// Client ← server
{
  type: "message.created";
  threadId: string;
  message: SafeMessage; // same shape as REST create response data
}
```

Client → server (control only):

- `thread:join` `{ threadId }`
- `thread:leave` `{ threadId }`

No `message:send` over the socket in v1.

---

## Non-goals (v1)

- Separate realtime microservice
- Polling fallback
- Typing indicators, presence, read receipts
- Sending messages over Socket.IO
- Redis adapter (defer until multi-instance)

---

## Suggested implementation order

`R0` (done with this doc) → `R1` → `R2` → `R3` → `R4` → (`R5` when needed)
