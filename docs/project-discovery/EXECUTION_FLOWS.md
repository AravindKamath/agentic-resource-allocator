# Execution Flows

Legend: **[S]** = synchronous within the HTTP request; **[A]** = asynchronous / decoupled from the request. There are almost no [A] operations in this codebase. The only ones are client-side timers in the browser.

All API paths are prefixed `/api`. Route mounting is in [server/src/app.js:29-37](../../server/src/app.js#L29-L37).

---

## 1. User authentication and authorization

| Step | Where | Notes |
|---|---|---|
| Register `POST /auth/register` [S] | [routes/auth.js:10-40](../../server/src/routes/auth.js#L10-L40) | `authLimiter` (50 req / 10 min / IP). Joi accepts **`role ∈ {admin, agent, user}` from the client**, and the UI offers that choice ([pages/Register.tsx:18](../../frontend/src/pages/Register.tsx#L18)). Hashes with bcrypt and returns access and refresh tokens. |
| Login `POST /auth/login` [S] | [routes/auth.js:42-72](../../server/src/routes/auth.js#L42-L72) | `User.findOne({email})` → `comparePassword`. Returns `{token, refreshToken, user}`. |
| Refresh `POST /auth/refresh` [S] | [routes/auth.js:74-88](../../server/src/routes/auth.js#L74-L88) | Verifies the refresh JWT and issues a new access token. **No rotation, no revocation list.** Role is copied from the refresh payload, though it is unused downstream. |
| Token signing | [utils/jwt.js](../../server/src/utils/jwt.js) | HS256 via `jsonwebtoken`; secrets `JWT_SECRET` and `REFRESH_SECRET`; expiry 15m / 7d by default. |
| Authenticate each request | [middleware/auth.js](../../server/src/middleware/auth.js) `requireAuth` | Reads the Bearer token, verifies it, and runs **`User.findById` on every authenticated request** (role is always current). |
| Authorize | [middleware/requireRole.js](../../server/src/middleware/requireRole.js) | Exact-match role list. `admin` is **not** a superset. For example, admins cannot use `requireRole('agent')` routes and agents cannot create tickets. |
| Client storage and refresh | [stores/auth.ts](../../frontend/src/stores/auth.ts), [lib/api.ts:25-72](../../frontend/src/lib/api.ts#L25-L72) | Zustand `persist` saves both tokens to localStorage. An Axios interceptor retries once on 401 after `/auth/refresh`. |
| Client route guards | [components/ProtectedRoute.tsx](../../frontend/src/components/ProtectedRoute.tsx), [App.tsx](../../frontend/src/App.tsx) | UX only. Server checks are the real boundary. |

**Resource-level authorization (ownership)** is only enforced on `GET /tickets/:id/replies`, `POST /tickets/:id/user-reply` and `/replies/*`. `GET /tickets`, `GET /tickets/:id` and `GET /tickets/:id/audit` have **no ownership check** (see [RELIABILITY_ASSESSMENT.md](RELIABILITY_ASSESSMENT.md)).

## 2. Ticket creation and persistence

`POST /tickets`, defined in [routes/tickets.js:27-98](../../server/src/routes/tickets.js#L27-L98). Middleware chain: `writeLimiter` (120/min/IP, applied to **all** `/api/tickets` methods) → `requireAuth` → `requireRole('user')` → Joi `createSchema`.

1. [S] `Ticket.create({... status: 'open'})`. Joi allows category `'yourNewCategory'`, which the Mongoose enum rejects, causing a 500. An empty `category: ''` (the frontend default when nothing is selected) fails Joi with a 400.
2. [S] `AuditLog.create(TICKET_CREATED)`.
3. [S] `emitNotification` to the creator.
4. [S] `User.find({role:'agent'})`, then **sequential** `emitNotification` per agent (N inserts in the request path).
5. [S] `await triageTicket(...)` (flow 3/4).
6. [S] Re-read the ticket with `populate('agentSuggestionId')` and reshape it to `agentSuggestion`.
7. Respond `201 {ticket, traceId}`.

There is no transaction across these writes. If step 5 throws, steps 1–4 are already committed, the client gets a 500, and a retry creates a **duplicate ticket**. There is no idempotency key.

Frontend: [pages/CreateTicket.tsx:84-111](../../frontend/src/pages/CreateTicket.tsx#L84-L111) → [stores/tickets.ts](../../frontend/src/stores/tickets.ts) `createTicket`. The UI awaits the full triage before navigating. `customCategory` is sent but stripped by Joi (`stripUnknown`), so it is never persisted on create.

## 3. Ticket classification / AI-assisted triage

Server side: [services/agentService.js](../../server/src/services/agentService.js) `triageTicket({ticketId, traceId})`

| Step | Lines | Notes |
|---|---|---|
| Load ticket and **all** published articles (`status ∈ {publish, published}`) | 26-31 | Unbounded `find`, full bodies. |
| Audit `TRIAGE_ENQUEUED` | 34-45 | Nothing is queued. |
| Build payload `{traceId, ticket{id,title,description}, kb[]}` | 47-60 | |
| Retry loop `while (attempt <= AGENT_RETRY)` | 67-135 | `httpPostJson` with `AbortController` timeout. **No backoff**; retries on every error, including 4xx. Each failure writes `TRIAGE_RETRY`; the final failure writes `TRIAGE_FAILED` and rethrows. |
| Persist worker `stepLogs` as `actor:'system'` audit rows | 138 | `insertMany`. |
| Read `Config` (create default if missing) | 140 | |
| `shouldAutoClose = cfg.autoCloseEnabled && confidence >= cfg.confidenceThreshold` | 141 | Defaults come from the Config schema (`true`, `0.78`), **not** from env. |
| `AgentSuggestion.create` | 144-154 | |
| Set `ticket.category = predicted`; status `resolved` (auto-close) or `waiting_human` | 157-204 | Auto-close marks the ticket resolved **without sending any reply** (audit action `TICKET_AUTO_RESOLVED_WITHOUT_REPLY`). |
| Audit `TRIAGE_COMPLETED` | 207-221 | |

Entry points that call `triageTicket`:
- `POST /tickets` (inline) at [tickets.js:72](../../server/src/routes/tickets.js#L72)
- `POST /agent/triage` at [routes/agent.js:27-35](../../server/src/routes/agent.js#L27-L35), allowed for `admin`, `agent` **and `user`**, on **any** ticket ID. Each call creates a new `AgentSuggestion` and overwrites the ticket status, even if the ticket is closed. The frontend never calls this.

## 4. AI worker invocation and result handling

Worker: [agent/app/main.py](../../agent/app/main.py), `POST /triage` (declared as a sync `def`, so FastAPI runs it in its threadpool).

1. Pydantic validates `TriageRequest` ([schemas.py:15-18](../../agent/app/schemas.py#L15-L18)).
2. `run_pipeline(traceId, ticket, kb)` ([pipeline.py:81-399](../../agent/app/pipeline.py#L81-L399)):
   - `TriagePlanner.plan()` builds a descriptive "plan" (static metadata, not executed dynamically).
   - **Classify**: `provider.classify(text)` ([llm_provider.py:14-187](../../agent/app/llm_provider.py#L14-L187)).
     - Stub (default): weighted substring keyword counts; confidence 0.3–0.95.
     - Gemini: `genai.GenerativeModel(MODEL).generate_content(prompt)`, line-parsing `Category:` and `Confidence:`. **Any exception** falls back to keyword scoring. `modelInfo.provider` is still reported as `gemini`.
   - **Retrieve**: `search.top_k(text, kb, k)` ([search.py](../../agent/app/search.py)), lexical scoring plus Jaccard similarity, filtered by `RELEVANCE_THRESHOLD`.
   - **Draft**: `provider.draft(text, articles)` ([llm_provider.py:189-243](../../agent/app/llm_provider.py#L189-L243)) is a **template**. It extracts numbered lines from the top article and adds a greeting, a note, `[Article #<id>]` and a sign-off. If no articles match, a canned "we'll respond in 24 h" message is used. **No LLM call.**
   - **Score**: classification confidence ± heuristic boosts and penalties (retrieval quality, draft formatting, KB coverage, text length, `other` category), clamped to [0.1, 1].
3. Returns `TriageResponse` with `stepLogs` (PIPELINE_STARTED, AGENT_CLASSIFIED, KB_RETRIEVED, DRAFT_GENERATED, DECISION_COMPUTED, PIPELINE_COMPLETED).
4. Any exception becomes `HTTPException(500, "Agent error")`. **The exception is not logged.**

API handling of the response: see flow 3. The response is trusted. There is no schema validation on the Node side, and Mongoose validation on `AgentSuggestion.create` is the only guard (`predictedCategory` enum, required `draftReply` and `confidence`).

## 5. Knowledge-base retrieval and response generation

There are **three separate KB search implementations**:

| Purpose | Implementation | Notes |
|---|---|---|
| UI search `GET /kb?query=` | [services/kbService.js](../../server/src/services/kbService.js) `searchKB` | Aggregation with `$regex` built from **raw user input** (`new RegExp(term)`). Admins see all statuses; others see published only. Limit 20. |
| Agent citation picker `GET /agent/kb-articles` | [routes/agent.js:430-462](../../server/src/routes/agent.js#L430-L462) | Filters `status: 'published'` only. Seed data uses `'publish'`, so **seeded articles never appear**. Also selects and filters a non-existent `category` field. Not called by the frontend. |
| AI retrieval | [agent/app/search.py](../../agent/app/search.py) `top_k` | In-memory scoring over the full KB sent by the API. |

KB CRUD (`POST/PUT/DELETE /kb`, `PATCH /kb/:id/toggle-status`) is admin-only ([routes/kb.js:74-125](../../server/src/routes/kb.js#L74-L125)). `PUT` uses `findByIdAndUpdate` without `runValidators`.

"Response generation" is the template in flow 4. There is no embedding or vector store, and no LLM drafting.

## 6. Human review, assignment and status changes

### Endpoints

| Endpoint | Role | File:lines | Effect |
|---|---|---|---|
| `POST /tickets/:id/review-draft` | agent | [tickets.js:534-772](../../server/src/routes/tickets.js#L534-L772) | Main review path used by [TicketDetail.tsx](../../frontend/src/pages/TicketDetail.tsx) / [AgentReview.tsx](../../frontend/src/components/AgentReview.tsx). Requires status `waiting_human` or `resolved`. Upserts `PendingTicket`, writes an audit row, marks `AgentSuggestion` reviewed (and overwrites `draftReply` on edit). On accept or edit: assigns the agent, `waiting_human → triaged`, creates a customer-visible `TicketReply`, and if `sendImmediately` sets status to `resolved` (`closeTicket`) or `open`. Notifies the creator. About 7–9 sequential writes, no transaction. |
| `POST /agent/respond-to-draft` | agent | [agent.js:479-606](../../server/src/routes/agent.js#L479-L606) | Used by [AgentDashboard.tsx:150-170](../../frontend/src/pages/AgentDashboard.tsx). **`agentId`/`agentName` come from the request body.** Accept: assign, `status = triaged`. Reject: `status = open`. The "already accepted" guard checks `status: 'accepted'`, which this endpoint never writes (it writes `'pending'`). |
| `POST /tickets/:id/reply` | agent | [tickets.js:283-368](../../server/src/routes/tickets.js#L283-L368) | Optional reply; status → `closed` if `close`, else **`waiting_human`**. |
| `POST /tickets/:id/user-reply` | user (owner) | [tickets.js:381-455](../../server/src/routes/tickets.js#L381-L455) | `resolved → open`, `waiting_human → triaged`. Notifies the assignee with type `user_replied`, which is **not in the Notification enum**, so it is silently dropped. |
| `POST /tickets/:id/assign` | agent, admin | [tickets.js:466-518](../../server/src/routes/tickets.js#L466-L518) | `findByIdAndUpdate({assignee, status:'assigned'})`. **`'assigned'` is not a valid status**, and update validators are off by default, so the invalid value is persisted. The assignee is not checked to be an agent. Not called by the frontend. |
| `POST /tickets/:id/reopen` | agent | [tickets.js:783-828](../../server/src/routes/tickets.js#L783-L828) | Only from `closed` → `waiting_human`. Notification type `ticket_reopened` is **not in the enum**, so it is dropped. |
| `POST /tickets/:id/close` | agent | [tickets.js:839-890](../../server/src/routes/tickets.js#L839-L890) | Any non-closed → `closed`; marks all PendingTickets `['accepted','closed']`. |
| `POST /agent/send-reply` | agent | [agent.js:343-427](../../server/src/routes/agent.js#L343-L427) | Reply with citations; status → `resolved` or `open`. Not called by the frontend. |
| `POST /replies` | any (owner/assignee/agent) | [replies.js:69-122](../../server/src/routes/replies.js#L69-L122) | `authorType` is always `'user'` even for agents. `resolved → open` if the creator replies. Not called by the frontend. |

### Status transition table (who can move a ticket where)

| From \ Trigger | Triage | review-draft accept/edit | respond-to-draft | reply | user-reply | reopen | close | send-reply | assign |
|---|---|---|---|---|---|---|---|---|---|
| `open` | → `resolved`/`waiting_human` | ✗ (400) | → `triaged`/`open` | → `closed`/`waiting_human` | stays `open` | ✗ | → `closed` | → `resolved`/`open` | → `assigned`⚠ |
| `waiting_human` | (re-triage) | → `triaged` then optional `resolved`/`open` | → `triaged`/`open` | → `closed`/`waiting_human` | → `triaged` | ✗ | → `closed` | → `resolved`/`open` | → `assigned`⚠ |
| `resolved` | (re-triage) | stays `resolved`, then optional `resolved`/`open` | → `triaged`/`open` | → `closed`/`waiting_human` | → `open` | ✗ | → `closed` | → `resolved`/`open` | → `assigned`⚠ |
| `closed` | (re-triage → reopens!) | ✗ (400) | → `triaged`/`open` | → `closed`/`waiting_human` | ✗ (400) | → `waiting_human` | ✗ (400) | → `resolved`/`open` | → `assigned`⚠ |

⚠ = writes a value outside the schema enum. There is no central state machine, and most endpoints don't guard the current status.

## 7. Notifications and audit events

**Notifications**: [services/notificationService.js](../../server/src/services/notificationService.js)
- `emitNotification` [S] inserts a `Notification` row. **Errors are caught and only `console.error`ed**, so the caller never knows. Invalid types (`user_replied`, `ticket_reopened`) are therefore silently lost.
- Delivery = the frontend `NotificationBell` polls `GET /notifications` every 30 s ([stores/notifications.ts:85-95](../../frontend/src/stores/notifications.ts), [NotificationBell.tsx:10-18](../../frontend/src/components/ui/NotificationBell.tsx)). This is the only [A] behaviour in the system and it is client-driven. There is no email, push, WebSocket or SSE.
- Read APIs: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all` ([routes/notifications.js](../../server/src/routes/notifications.js)). They are correctly scoped to `req.user._id`. `:id` is not validated, so a malformed ID makes the service catch and return `null`, which the route turns into a 404.
- [pages/Notifications.tsx](../../frontend/src/pages/Notifications.tsx) exists but is **not routed** in `App.tsx`.

**Audit**: `AuditLog.create` is called inline from route handlers and `agentService`. `traceId` (uuid v4) is generated per operation and groups the rows.
- Read: `GET /tickets/:id/audit` is served by the **tickets router** ([tickets.js:145-182](../../server/src/routes/tickets.js#L145-L182)), which returns `{timeline, totalEvents, uniqueTraces}`. The duplicate in [routes/audit.js](../../server/src/routes/audit.js), which returns a raw array, is **shadowed** because `/api/tickets` is mounted first ([app.js:32,37](../../server/src/app.js#L32)).
- No immutability guarantees, retention policy or actor ID, apart from what is placed in `meta`.

## 8. Error handling and recovery

| Layer | Behaviour | Evidence |
|---|---|---|
| Validation | Joi → 400 with joined messages | [middleware/validate.js](../../server/src/middleware/validate.js) |
| Global handler | `status = err.status \|\| 500`. Logs ≥500 with pino. Response is `{error: err.name, message: err.publicMessage \|\| 'Something went wrong'}`. Mongoose `ValidationError`/`CastError` and bad regex `SyntaxError` all become **500**. | [middleware/error.js](../../server/src/middleware/error.js) |
| Triage failure | Retries with no backoff, then rethrows. The ticket stays `open` with no suggestion. **No automatic recovery or re-drive**; the only manual path is `POST /agent/triage`. | [agentService.js:100-133](../../server/src/services/agentService.js#L100-L133) |
| Partial multi-write failure | No transactions or compensations anywhere. | all route handlers |
| Worker | Catch-all becomes 500 `"Agent error"`, with no logging. Gemini errors silently fall back to keywords. | [main.py:13-18](../../agent/app/main.py#L13-L18), [llm_provider.py:169-187](../../agent/app/llm_provider.py#L169-L187) |
| Process | No `unhandledRejection` handler and no graceful shutdown. Mongo connect failure calls `exit(1)`. | [index.js](../../server/src/index.js) |
| Client | 401 triggers one refresh attempt, then logout. Other errors are toasted. | [lib/api.ts](../../frontend/src/lib/api.ts) |

## Unused / dead code paths (verified by grep)

- [services/pendingTicketService.js](../../server/src/services/pendingTicketService.js): none of its 3 exports is imported anywhere.
- `config.defaults.*` and `config.env` in [config.js](../../server/src/config.js) are never read.
- Agent settings `AUTO_CLOSE_ENABLED`, `CONFIDENCE_THRESHOLD`, `STRICT_FORMATTING`, `MAX/MIN_RESPONSE_WORDS`, `REQUIRE_NUMBERED_STEPS`, `REQUIRE_CITATIONS` and `PROVIDER` are never read. `_ensure_proper_formatting` and `_extract_citations` are never called.
- Backend endpoints not called by the frontend: `/agent/triage`, `/agent/tickets/:id`, `/agent/draft-reply`, `/agent/send-reply`, `/agent/kb-articles`, `/agent/metrics/:agentId`, `/agent/agents-summary`, `/tickets/:id/assign`, `/replies/*`, `/notifications/unread-count`.
- [frontend/src/utils/apiTest.ts](../../frontend/src/utils/apiTest.ts) is imported for side effects in `App.tsx` and calls the non-existent `/api/health`.
