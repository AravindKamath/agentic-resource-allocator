# Reliability, Quality and Scalability Assessment

## Classification key

- **Confirmed**: the defect follows deterministically from the code as written (verified by reading the code paths and, where relevant, library defaults). **No code was executed** in this task. "Confirmed" means certain from static analysis, not reproduced at runtime.
- **Potential**: plausible risk that depends on load, timing, environment or library behaviour; needs validation.
- **Unknown**: insufficient evidence.

Severity: **H** = data integrity, security or availability impact on a core workflow; **M** = degraded behaviour or operational pain; **L** = hygiene.

---

## 1. Tests and coverage of critical workflows

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| T1 | Server test suite references `nock`, which is in neither `package.json` nor `package-lock.json`. | Confirmed | H (blocks CI) | [tests/agent-decision.test.js:2](../../server/src/tests/agent-decision.test.js#L2) |
| T2 | Server is ESM (`"type":"module"`). Jest 29 runs without Babel config or `--experimental-vm-modules`, so it is expected to fail parsing `import`. | Potential (high likelihood) | H | [server/package.json](../../server/package.json), [jest.config.js](../../server/jest.config.js) |
| T3 | `audit-log.test.js` asserts `audit.body.some(...)` (an array), but `GET /api/tickets/:id/audit` is served by the tickets router, which returns an object `{timeline,…}`. The array-returning route in `audit.js` is shadowed. | Confirmed | M | [audit-log.test.js:42](../../server/src/tests/audit-log.test.js#L42), [tickets.js:145-182](../../server/src/routes/tickets.js#L145-L182), [app.js:32,37](../../server/src/app.js#L32) |
| T4 | Tests rely on `JWT_SECRET`/`REFRESH_SECRET` coming from a developer `.env`; `setup.js` sets none. | Confirmed | M | [tests/setup.js](../../server/src/tests/setup.js), [utils/jwt.js](../../server/src/utils/jwt.js) |
| T5 | All 5 frontend test files use the Jest API (`jest.mock`, `jest.fn`) while the runner is Vitest. | Confirmed (API mismatch); runtime failure is Potential | M | `grep -c "jest\." frontend/src/__tests__/*` → 7–16 hits each, 0 uses of `vi` |
| T6 | No `test` script in `frontend/package.json`, although the frontend README says `npm run test`. | Confirmed | L | [frontend/package.json](../../frontend/package.json) |
| T7 | Agent has **no automated tests**. `test_enhanced_kb.py` and `app/test_agent.py` print results without assertions; `test_agent.py` needs `requests` (not installed) and a running server. | Confirmed | M | [agent/test_enhanced_kb.py](../../agent/test_enhanced_kb.py), [agent/app/test_agent.py](../../agent/app/test_agent.py) |
| T8 | Untested critical paths: triage failure/retry/timeout, review-draft, respond-to-draft, reopen/close, RBAC/ownership, notifications, re-triage. Only 5 happy-path API tests exist. | Confirmed | H | [server/src/tests/](../../server/src/tests/) |
| T9 | No CI configuration in the repo (no `.github/`, no pipeline files). | Confirmed | M | directory listing |

## 2. Error handling and timeout behaviour

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| E1 | Triage runs **inline** in `POST /api/tickets`. Worker failure becomes a 500 to the user **after** the ticket, audit row and notifications are committed. The ticket is left `open` with no suggestion and no automatic retry or re-drive. | Confirmed | H | [tickets.js:30-72](../../server/src/routes/tickets.js#L30-L72), [agentService.js:118-133](../../server/src/services/agentService.js#L118-L133) |
| E2 | Worst-case request latency is ≈ `(AGENT_RETRY+1) × AGENT_TIMEOUT_MS` (≈ 24 s default) with **no backoff or jitter**. It also retries non-retryable 4xx/422 responses. | Confirmed | M | [agentService.js:67-135](../../server/src/services/agentService.js#L67-L135) |
| E3 | Gemini call has no client timeout. The worker can keep working after the API has aborted, so the work is wasted and may be billed. | Potential | M | [llm_provider.py:120-121](../../agent/app/llm_provider.py#L120-L121) |
| E4 | Global error handler maps Mongoose `ValidationError`/`CastError`, regex `SyntaxError` and similar to **500 "Something went wrong"** instead of 4xx. | Confirmed | M | [middleware/error.js](../../server/src/middleware/error.js) |
| E5 | `emitNotification` swallows all errors, so callers cannot detect lost notifications. | Confirmed | M | [notificationService.js:21-24](../../server/src/services/notificationService.js#L21-L24) |
| E6 | Notification types `user_replied` and `ticket_reopened` are not in the schema enum, so these notifications are **always** dropped silently. | Confirmed | M | [tickets.js:439](../../server/src/routes/tickets.js#L439), [tickets.js:812](../../server/src/routes/tickets.js#L812), [Notification.js:7](../../server/src/models/Notification.js#L7) |
| E7 | Joi allows category `yourNewCategory`, which the Mongoose enum rejects, producing a 500. The frontend default category `''` produces a 400. | Confirmed | M | [tickets.js:22](../../server/src/routes/tickets.js#L22), [Ticket.js:6](../../server/src/models/Ticket.js#L6), [CreateTicket.tsx:42](../../frontend/src/pages/CreateTicket.tsx#L42) |
| E8 | `POST /tickets/:id/assign` writes `status: 'assigned'`, which is not in the enum. `findByIdAndUpdate` doesn't run validators by default, so the invalid state is persisted. Later `save()` calls on that document may then fail validation. | Confirmed (write); Potential (downstream failure) | M | [tickets.js:468-472](../../server/src/routes/tickets.js#L468-L472) |
| E9 | `GET /api/config` returns `null` on an empty collection (`Query \|\| …` precedence bug). | Confirmed | L | [routes/config.js:12](../../server/src/routes/config.js#L12) |
| E10 | No startup retry for Mongo, no graceful shutdown (SIGTERM), no `unhandledRejection` handler. | Confirmed | M | [index.js](../../server/src/index.js) |
| E11 | Worker swallows exceptions into a generic 500 **without logging**, so failures can't be diagnosed. | Confirmed | M | [main.py:17-18](../../agent/app/main.py#L17-L18) |

## 3. AI provider failures and rate limiting

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| A1 | Any Gemini exception (quota/429, auth, network, parsing) silently falls back to keyword classification. `modelInfo.provider` still reports `gemini`, so the audit trail misattributes results. | Confirmed | M | [llm_provider.py:169-187](../../agent/app/llm_provider.py#L169-L187), [pipeline.py:370-371](../../agent/app/pipeline.py#L370-L371) |
| A2 | No client-side rate limiting, concurrency cap or circuit breaker for Gemini. Each ticket can cause up to 3 Gemini calls (API retries). | Confirmed (absence) | M | — |
| A3 | Drafts are template-generated, not LLM-generated, despite README claims. This limits AI cost exposure today, but the "AI draft" feature is not actually an LLM. | Confirmed | — (expectation gap) | [llm_provider.py:189-243](../../agent/app/llm_provider.py#L189-L243) |
| A4 | Confidence is heuristic and **not calibrated**. Formatting checks feed into it (e.g. presence of `**`, `Note:`), and it decides auto-resolution. | Confirmed | M | [pipeline.py:168-324](../../agent/app/pipeline.py#L168-L324) |
| A5 | Auto-resolve sets status `resolved` without sending any reply to the customer. | Confirmed (behaviour); intent **Unknown** | M | [agentService.js:160-181](../../server/src/services/agentService.js#L160-L181) |
| A6 | Whether `gemini-2.0-flash` / `google-generativeai==0.8.3` still works against the current Google API. | Unknown | — | not testable without external calls |

## 4. Duplicate job / request handling

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| D1 | No idempotency key on `POST /api/tickets`. A client retry after a timeout or 500 creates duplicate tickets (and duplicate notifications to every agent). | Confirmed | H | [tickets.js:27-98](../../server/src/routes/tickets.js#L27-L98) |
| D2 | `POST /api/agent/triage` can be called repeatedly by **any role, including `user`**, on **any** ticket. Each call creates a new `AgentSuggestion`, overwrites `ticket.status` (re-opening closed tickets), and can trigger more Gemini calls. | Confirmed | H | [agent.js:27-35](../../server/src/routes/agent.js#L27-L35) |
| D3 | A late success after an API-side timeout (worker finishes after abort) isn't reconciled. The next retry produces a second full pipeline run. | Potential | L | [httpClient.js](../../server/src/utils/httpClient.js) |

## 5. Concurrent ticket updates

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| C1 | Every status change is read → mutate → `save()` with no optimistic concurrency (`optimisticConcurrency` not enabled) and no conditional update on the current status. Concurrent agent actions are last-write-wins. | Confirmed (pattern); lost update under concurrency is Potential | H | e.g. [tickets.js:285-308](../../server/src/routes/tickets.js#L285-L308), [tickets.js:543-674](../../server/src/routes/tickets.js#L543-L674) |
| C2 | `respond-to-draft` "already accepted" guard is check-then-act (racy) **and** checks `status:'accepted'`, which that endpoint never writes (`'pending'`). Two agents can both accept. | Confirmed (guard ineffective) | M | [agent.js:500-505](../../server/src/routes/agent.js#L500-L505), [agent.js:537-565](../../server/src/routes/agent.js#L537-L565) |
| C3 | Multi-document workflows (review-draft: ~7–9 writes; ticket create: 4+N writes) have no transactions. A crash mid-way leaves inconsistent `PendingTicket`/`AgentSuggestion`/`Ticket`/`TicketReply` state. | Confirmed (no transactions); inconsistency on failure is Potential | M | [tickets.js:534-772](../../server/src/routes/tickets.js#L534-L772) |
| C4 | Triage writes `ticket.status` after a long external call using a document loaded beforehand. An agent action during triage can be overwritten. | Potential | M | [agentService.js:26](../../server/src/services/agentService.js#L26), [agentService.js:204](../../server/src/services/agentService.js#L204) |
| C5 | `PendingTicket.status` is an array (e.g. `['accepted','pending']`), which makes state queries ambiguous; dashboard counts may double-count. | Confirmed (modelling); metric correctness is Potential | L | [PendingTicket.js:12](../../server/src/models/PendingTicket.js#L12), [agent.js:69-90](../../server/src/routes/agent.js#L69-L90) |

## 6. Database query patterns

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| Q1 | `GET /api/tickets` is unbounded (no pagination or limit) and returns all tickets. | Confirmed | M | [tickets.js:100-111](../../server/src/routes/tickets.js#L100-L111) |
| Q2 | Every triage loads **all** published articles with full bodies and sends them over HTTP to the worker, so payload and CPU grow linearly with KB size. | Confirmed | M | [agentService.js:29-60](../../server/src/services/agentService.js#L29-L60) |
| Q3 | KB search uses unanchored, case-insensitive `$regex` (no index use). The `title` text index is never used. | Confirmed | M | [kbService.js](../../server/src/services/kbService.js), [Article.js:4](../../server/src/models/Article.js#L4) |
| Q4 | User input is compiled directly into regexes (`new RegExp(term)`). Special characters cause a 500, and crafted patterns risk ReDoS on the DB or Node side. | Confirmed (500 on invalid regex); ReDoS is Potential | M | [kbService.js:33,44](../../server/src/services/kbService.js#L33), [agent.js:441](../../server/src/routes/agent.js#L441) |
| Q5 | Agent fan-out notification: `User.find({role:'agent'})` followed by **sequential** inserts inside the create request. | Confirmed | M | [tickets.js:60-69](../../server/src/routes/tickets.js#L60-L69) |
| Q6 | `agents-summary` is N+1 (5 queries per agent). | Confirmed | L | [agent.js:688-727](../../server/src/routes/agent.js#L688-L727) |
| Q7 | `requireAuth` does a `User.findById` on every request (no caching). | Confirmed | L | [middleware/auth.js:12](../../server/src/middleware/auth.js#L12) |
| Q8 | `req.query.status` goes into the Mongo filter unvalidated. Express's `qs` parser allows objects, e.g. `?status[$ne]=x`, so operator injection is possible. Impact is limited to read filtering. | Potential | L | [tickets.js:103](../../server/src/routes/tickets.js#L103) |
| Q9 | `/agent/kb-articles` filters `status:'published'` and a non-existent `category`. Seeded articles use `'publish'`, so it returns nothing for seed data. | Confirmed | L | [agent.js:435-447](../../server/src/routes/agent.js#L435-L447), [seed/data.js](../../server/src/seed/data.js) |
| Q10 | Seed wipes 4 of 9 collections, leaving orphans in the other 5. | Confirmed | L | [seed/seed.js:10-15](../../server/src/seed/seed.js#L10-L15) |

## 7. Authentication and authorization boundaries

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| S1 | **Self-registration as `admin` or `agent`.** Joi accepts the client-supplied `role`, and the UI exposes a role picker. | Confirmed | **H** | [auth.js:15](../../server/src/routes/auth.js#L15), [Register.tsx:18](../../frontend/src/pages/Register.tsx#L18) |
| S2 | **IDOR / data exposure**: `GET /tickets` (without `mine=true`), `GET /tickets/:id` and `GET /tickets/:id/audit` have no ownership check. Any authenticated user can read every ticket, AI draft and audit meta (which includes reply content and agent names). | Confirmed | **H** | [tickets.js:100-182](../../server/src/routes/tickets.js#L100-L182) |
| S3 | `respond-to-draft` trusts `agentId`/`agentName` from the request body, so an agent can record actions as another agent. `dashboard` trusts `agentId` from the query string. | Confirmed | M | [agent.js:465-492](../../server/src/routes/agent.js#L465-L492), [agent.js:40](../../server/src/routes/agent.js#L40) |
| S4 | Agents can act on any ticket (no assignment check) for reply/close/review. | Confirmed (design); whether that is intended is **Unknown** | M | [tickets.js](../../server/src/routes/tickets.js) |
| S5 | `/replies` routes exclude `admin` from the role-based access check (inconsistent with `/tickets/:id/replies`) and always store `authorType:'user'`. | Confirmed | L | [replies.js:38-40](../../server/src/routes/replies.js#L38-L40), [replies.js:99](../../server/src/routes/replies.js#L99) |
| S6 | Access and refresh tokens are stored in `localStorage` (XSS-exposed). Refresh tokens are never rotated or revocable; logout is client-side only. | Confirmed | M | [stores/auth.ts:104-111](../../frontend/src/stores/auth.ts#L104-L111), [auth.js:74-88](../../server/src/routes/auth.js#L74-L88) |
| S7 | `CORS_ORIGIN` defaults to `*`. | Confirmed | L | [config.js:11](../../server/src/config.js#L11) |
| S8 | Rate limiting: auth endpoints get 50 per 10 min; `/api/tickets` (including GETs) gets 120/min. `/api/agent`, `/api/kb`, `/api/replies`, `/api/notifications` and `/api/config` are **unlimited**. The memory store is per process, and `trust proxy` is unset, so all clients behind a proxy share one bucket. | Confirmed (config); proxy impact is Potential | M | [rateLimit.js](../../server/src/middleware/rateLimit.js), [app.js](../../server/src/app.js) |
| S9 | Worker `/triage` has **no authentication**. Anything that can reach port 9000 can invoke it (and spend Gemini quota when enabled). | Confirmed | M | [main.py](../../agent/app/main.py) |
| S10 | Demo plaintext passwords are committed in the seed data. | Confirmed | L (dev only) | [seed/data.js](../../server/src/seed/data.js) |

## 8. Logging and observability

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| O1 | Two request loggers (pino-http and morgan) log each request twice in different formats. | Confirmed | L | [app.js:26-27](../../server/src/app.js#L26-L27) |
| O2 | Heavy `console.log` in routes and services (unstructured, bypasses pino levels), including user IDs and ticket titles in notification logs. | Confirmed | L | [notificationService.js:19](../../server/src/services/notificationService.js#L19), [tickets.js:536-666](../../server/src/routes/tickets.js#L536-L666) |
| O3 | `traceId` is generated per operation and sent to the worker, but **not** attached to pino logs, response headers or worker logs. Correlation exists only inside `AuditLog`. | Confirmed | M | [utils/trace.js](../../server/src/utils/trace.js) |
| O4 | Health and readiness probes are static (they don't check DB or worker). No metrics endpoint, tracing or alerting. | Confirmed | M | [routes/health.js](../../server/src/routes/health.js), [main.py:7-9](../../agent/app/main.py#L7-L9) |
| O5 | The worker has no logging at all. | Confirmed | M | `grep logging agent/app` → none |

## 9. Scalability bottlenecks

| ID | Finding | Class | Sev | Evidence |
|---|---|---|---|---|
| P1 | Synchronous AI in the request path couples user-facing latency and availability to worker and LLM latency. This is the main motivation for an async queue. | Confirmed | H | E1/E2 |
| P2 | The worker's `/triage` is a sync `def`, so FastAPI runs it in a bounded threadpool (AnyIO default 40 threads). Slow Gemini calls are expected to cap worker concurrency. | Potential | M | [main.py:11-12](../../agent/app/main.py#L11-L12) |
| P3 | Notifications use 30 s polling per open tab, so load grows with active users. There is no push channel. | Confirmed | M | [stores/notifications.ts:85-95](../../frontend/src/stores/notifications.ts) |
| P4 | Full-KB-per-request plus in-memory O(N·terms) scoring in the worker. | Confirmed | M | Q2, [search.py:129-145](../../agent/app/search.py#L129-L145) |
| P5 | `AuditLog` grows by about 15 rows per ticket creation (Node audit + 6 worker stepLogs + retries), with no TTL or retention. | Confirmed | L | [agentService.js](../../server/src/services/agentService.js), [pipeline.py](../../agent/app/pipeline.py) |
| P6 | Horizontal scaling of the API is possible (no in-process state except rate limits), but no deployment manifests exist. | Confirmed | L | — |

## Highest-priority items (by impact on the project's goals)

1. **P1/E1/D1**: synchronous triage inside `POST /tickets`, with partial commits and no idempotency. This is the core target for an async job design.
2. **S1/S2**: role self-escalation and missing ownership checks. These need fixing before any real users or shared deployment.
3. **T1–T5/T8**: neither test suite is runnable as-is, and critical paths are uncovered. A safety net is needed before refactoring.
4. **C1/C2/C3**: last-write-wins status updates and no transactions. This matters as soon as async workers and real-time updates are introduced.
5. **B1** (see [LOCAL_SETUP.md](LOCAL_SETUP.md)): the agent start command and Dockerfile are broken.
