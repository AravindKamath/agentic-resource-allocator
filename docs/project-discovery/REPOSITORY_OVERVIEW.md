# Repository Overview

> Discovery snapshot taken 2026-10-10 from the local checkout at `/home/kamath/agentic-helpdesk`
> (upstream: https://github.com/tlokeshkumar1/Smart-Helpdesk-with-Agentic).
> The local repo has **no commits and no git remote**; every file is untracked. Findings refer to the files as they exist on disk.

## What the application actually does

The app is a support-ticket helpdesk with three roles (`user`, `agent`, `admin`):

- A **user** submits a ticket. The API **synchronously** calls a Python "agent worker" over HTTP. The worker classifies the ticket into `billing | tech | shipping | other`, ranks KB articles by keyword overlap, and builds a draft reply **from a fixed template** that pastes in the numbered steps of the top-ranked article. It also returns a heuristic confidence score.
- The API stores the result as an `AgentSuggestion` and moves the ticket to `waiting_human` (low confidence) or `resolved` (high confidence, with **no reply sent**).
- An **agent** reviews the draft (accept / edit / reject), which creates a customer-visible reply. The agent can also reply directly, close or reopen the ticket.
- An **admin** manages KB articles and three runtime settings (auto-close flag, confidence threshold, SLA hours).
- In-app notifications are rows in MongoDB that the frontend **polls every 30 s**. Audit events are rows in an `AuditLog` collection.

The "LLM" is used for **classification only**, and only when `STUB_MODE=false` and `GEMINI_API_KEY` are set. Drafting never calls an LLM ([agent/app/llm_provider.py:189-243](../../agent/app/llm_provider.py#L189-L243)). The default and documented mode is deterministic keyword matching.

There is **no job queue, background worker, scheduler, WebSocket/SSE, email or cache** anywhere in the code.

## Directory structure

| Path | Purpose |
|---|---|
| [server/](../../server/) | Node.js / Express REST API (ESM, `"type": "module"`). This is the system of record. |
| [server/src/index.js](../../server/src/index.js) | Process entry: connect to MongoDB, then `app.listen`. |
| [server/src/app.js](../../server/src/app.js) | Express app factory: middleware and route mounting. |
| [server/src/routes/](../../server/src/routes/) | `auth`, `tickets`, `agent`, `kb`, `config`, `audit`, `notifications`, `replies`, `health`. |
| [server/src/models/](../../server/src/models/) | 9 Mongoose models (see below). |
| [server/src/services/](../../server/src/services/) | `agentService` (triage HTTP call), `kbService` (KB search), `notificationService`, `pendingTicketService` (**unused**). |
| [server/src/middleware/](../../server/src/middleware/) | JWT auth, role guard, Joi validation, rate limits, error handler, pino-http logger. |
| [server/src/seed/](../../server/src/seed/) | Destructive seed script: 4 users, 6 KB articles, 1 Config. |
| [server/src/tests/](../../server/src/tests/) | 5 Jest + Supertest integration tests using mongodb-memory-server. |
| [agent/](../../agent/) | Python FastAPI "agent worker" that runs the triage pipeline. Stateless. |
| [agent/app/](../../agent/app/) | `main.py` (FastAPI), `pipeline.py`, `llm_provider.py`, `search.py`, `schemas.py`, `config.py`, `test_agent.py`. |
| [agent/test_enhanced_kb.py](../../agent/test_enhanced_kb.py) | Print-only smoke script (no assertions). |
| [frontend/](../../frontend/) | React 18 + TypeScript SPA (Vite 5, Tailwind, Zustand, Axios, react-router 7). |
| [frontend/src/pages/](../../frontend/src/pages/) | Login, Register, TicketsList, TicketDetail, CreateTicket, KnowledgeBase, KBEditor, Settings, AgentDashboard, Notifications (**not routed**). |
| [frontend/src/stores/](../../frontend/src/stores/) | Zustand stores: `auth` (persisted to localStorage), `tickets`, `kb`, `config`, `notifications`. |
| [frontend/src/__tests__/](../../frontend/src/__tests__/) | 5 test files written against the **Jest** API but run by **Vitest**. |

## Technology summary

| Concern | Frontend | API server | Agent worker |
|---|---|---|---|
| Language / runtime | TypeScript, browser | Node.js (ESM) | Python |
| Framework | React 18.3, react-router-dom 7.8.1 | Express 4.21 | FastAPI 0.111, Starlette 0.37, uvicorn 0.30 |
| Build / dev tool | Vite 5.4 (`vite`, `vite build`) | nodemon (dev) | uvicorn `--reload` |
| Validation | zod 4 + react-hook-form | Joi 17 | Pydantic 2.8 |
| Persistence | localStorage (auth tokens only) | MongoDB via Mongoose 8.17 | none |
| External calls | API server only (via `/api` proxy) | Agent worker (HTTP) | Google Gemini (optional, `google-generativeai` 0.8.3) |
| Tests | Vitest 3.2 + RTL (jsdom) | Jest 29 + Supertest + mongodb-memory-server 10 | none (print-only scripts) |
| Lint | ESLint 9 flat config | none | none |
| Manifest / lock | `package.json` + `package-lock.json` (v3) | `package.json` + `package-lock.json` (v3) | `requirements.txt` (**UTF-16 LE, CRLF**, partial pin list, no lock) |
| Container | none | [server/dockerfile](../../server/dockerfile) (node:20-alpine) | [agent/dockerfile](../../agent/dockerfile) (python:3.11-slim) |

## Data models (MongoDB)

| Model | File | Key fields / notes |
|---|---|---|
| `User` | [User.js](../../server/src/models/User.js) | `email` unique; `role ∈ {admin, agent, user}`; bcrypt (cost 10) `passwordHash`. |
| `Ticket` | [Ticket.js](../../server/src/models/Ticket.js) | `status ∈ {open, triaged, waiting_human, resolved, closed}`; `category ∈ {billing, tech, shipping, other}`; `createdBy`, `assignee`, `agentSuggestionId`. |
| `AgentSuggestion` | [AgentSuggestion.js](../../server/src/models/AgentSuggestion.js) | AI output: `predictedCategory`, `draftReply`, `confidence`, `articleIds`, `modelInfo`, review fields. |
| `TicketReply` | [TicketReply.js](../../server/src/models/TicketReply.js) | Conversation thread; `authorType`, `isInternal`, `citations`. |
| `PendingTicket` | [PendingTicket.js](../../server/src/models/PendingTicket.js) | Agent review record; **`status` is an array of strings** (e.g. `['accepted','pending']`). |
| `AuditLog` | [AuditLog.js](../../server/src/models/AuditLog.js) | `ticketId`, `traceId`, `actor`, free-form `action` + `meta`. Append-only by convention only. |
| `Notification` | [Notification.js](../../server/src/models/Notification.js) | Per-user in-app notifications; `type` is an enum of 6 values. |
| `Article` | [Article.js](../../server/src/models/Article.js) | KB article; `status ∈ {unpublish, publish, published}` (two "published" spellings); text index on `title` (unused). |
| `Config` | [Config.js](../../server/src/models/Config.js) | Singleton-by-convention: `autoCloseEnabled`, `confidenceThreshold`, `slaHours`. |

There are no migrations. Indexes are created by Mongoose `autoIndex: true` at connect time ([db.js:6](../../server/src/db.js#L6)). Initial data comes from `npm run seed`.

## Ticket lifecycle (as implemented)

The status enum is `open → triaged → waiting_human → resolved → closed`, but transitions are set ad hoc per endpoint, with no central state machine. See [EXECUTION_FLOWS.md §6](EXECUTION_FLOWS.md#6-human-review-assignment-and-status-changes) for the full transition table.

## Existing documentation

| Document | Accuracy notes |
|---|---|
| [README.md](../../README.md) | Good high-level map. **Out of date or incorrect** on: Docker Compose (the file does not exist and is gitignored), Node "18+" (frontend needs ≥20), "AI draft reply generation" (drafts are templated), and required env vars (several listed as required are unused). |
| [server/README.md](../../server/README.md) | Mostly accurate route list. Claims "Real-time Processing", which means synchronous inline triage. |
| [agent/README.md](../../agent/README.md) | Describes the `/triage` contract accurately. Its start command `uvicorn app.main:app` **fails** because of the import style (see [LOCAL_SETUP.md](LOCAL_SETUP.md#known-setup-blockers)). The keyword list omits `500`, which is not in `TECH`. |
| [frontend/README.md](../../frontend/README.md) | Says `npm run test`, but there is **no `test` script** in `package.json`. |

## Related discovery documents

- [ARCHITECTURE.md](ARCHITECTURE.md): components, diagrams, state ownership, single points of failure
- [EXECUTION_FLOWS.md](EXECUTION_FLOWS.md): eight traced workflows
- [CONFIGURATION_INVENTORY.md](CONFIGURATION_INVENTORY.md): every environment variable
- [LOCAL_SETUP.md](LOCAL_SETUP.md): runtimes, startup sequence, blockers
- [RELIABILITY_ASSESSMENT.md](RELIABILITY_ASSESSMENT.md): classified findings
- [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md): unresolved questions
