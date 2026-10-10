# Open Questions

Items that could not be resolved from the source alone. Each one notes why it matters and how to resolve it.

## Repository and provenance

| # | Question | Why it matters | How to resolve |
|---|---|---|---|
| R1 | The local checkout has **no commits and no remote**. Is it identical to the upstream `main` of `tlokeshkumar1/Smart-Helpdesk-with-Agentic`, and at which commit? | Findings may not match upstream; no baseline to diff against | Compare with upstream (needs network); make an initial baseline commit before any changes |
| R2 | Did a `docker-compose.yml` exist upstream (gitignored locally) and what did it contain (Mongo version, service names, env)? | READMEs depend on it; `.env.example` hostnames (`mongo`, `agent`) imply it | Ask the upstream author or check upstream history |
| R3 | Is the agent Dockerfile known to work somewhere (e.g. with an injected `PYTHONPATH`)? As written it should fail with `ModuleNotFoundError` | Deployment readiness | Build and run the image in Task 2 |

## Product and behaviour intent

| # | Question | Why it matters |
|---|---|---|
| P1 | Is self-registration with `admin`/`agent` roles intentional (demo convenience) or a defect? | Security baseline; affects test fixtures |
| P2 | Should ordinary users be able to list or view **all** tickets (`GET /tickets`, `/tickets/:id`, `/audit`)? | Data exposure; the frontend `TicketsList` may depend on it |
| P3 | Is "auto-resolve without sending a reply" (status `resolved`, draft unsent) the intended behaviour? The code comment says auto-resolution was "disabled", yet `autoCloseEnabled` defaults to `true` | Customer-visible correctness |
| P4 | What is the intended ticket state machine? `triaged`, `open` after an agent reply, and `waiting_human` after an agent reply all look inconsistent | Required before introducing async status updates |
| P5 | Which review path is canonical: `POST /tickets/:id/review-draft` (TicketDetail) or `POST /agent/respond-to-draft` (AgentDashboard)? They write `PendingTicket` differently | Duplicate logic; metrics correctness |
| P6 | Should admins have agent capabilities? `requireRole` is an exact match | RBAC design |
| P7 | Is SLA (`slaHours`) meant to drive anything (escalation, overdue flags)? It is currently stored only | Scope of async/scheduled work |
| P8 | Should Gemini be used for drafting too (README claims "AI-generated drafts")? Today drafts are templated | Cost, latency and queue design |
| P9 | What should happen to a ticket whose triage permanently fails: stay `open`, go to `waiting_human`, or be retried later? | Core design input for async processing |

## Technical unknowns requiring execution

| # | Question | Validation step |
|---|---|---|
| X1 | Does `pip install -r requirements.txt` accept the UTF-16 file on Python 3.12? | Install in a venv in Task 2 |
| X2 | Do server tests fail at ESM parse, at missing `nock`, or both? | `npm ci && npm test` |
| X3 | Do all frontend tests fail on `jest is not defined`? | `npx vitest run` |
| X4 | Does `vite build` and `tsc -b` pass? | Run both |
| X5 | Does a ticket whose status was set to `'assigned'` fail on later `save()`? | Targeted integration test |
| X6 | Actual triage latency in stub mode, and AnyIO threadpool saturation under concurrent load | Measure locally |
| X7 | Is `gemini-2.0-flash` with `google-generativeai==0.8.3` still functional? | Only with explicit approval to use a key and incur cost |
| X8 | Which MongoDB server version is targeted? There are no transactions today, but async/outbox designs may need a replica set | Decide when choosing the queue/outbox approach |

## Environment and blockers on this host

| # | Item |
|---|---|
| H1 | MongoDB is not installed and Docker is not available in this WSL distro. Choose native `mongod`, Docker Desktop WSL integration, or Atlas before Task 2. |
| H2 | `mongodb-memory-server` needs to download a MongoDB binary for the server tests (network access). |
