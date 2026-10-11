# Local Setup Readiness

> **Nothing in this document has been executed.** No packages were installed, no services started, and no env files created. The sequence below is a proposal for the next task.

## Host facts observed (read-only checks, 2026-10-10)

| Tool | Found | Required |
|---|---|---|
| Node.js | v24.14.1 | **≥ 20** (frontend `react-router-dom@7.8.1` declares `engines.node >=20`). The README's "18+" is outdated. Server deps need ≥ 16.20.1. Server Dockerfile uses Node 20. |
| Python | 3.12.3 | README says 3.11+; agent Dockerfile uses 3.11. 3.12 is expected to work with the pinned versions (unverified). |
| Docker | **not available** in this WSL distro | Optional. There is no compose file anyway. |
| MongoDB | **no `mongod` on PATH** | Required for running the API, not the tests. Use a native install, Docker Desktop with WSL integration, or Atlas. |

## Required runtimes and services

| Component | Runtime | Install command | External services |
|---|---|---|---|
| API | Node ≥ 20, npm (lockfile v3 → npm ≥ 7) | `cd server && npm ci` | MongoDB (any recent version; Mongoose 8 / driver 6.18) |
| Agent | Python 3.11/3.12 + venv | `cd agent && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt` | Gemini **only** if `STUB_MODE=false` (not needed; avoid charges) |
| Frontend | Node ≥ 20 | `cd frontend && npm ci` | API on `localhost:8080` |

Notes:
- `agent/requirements.txt` is **UTF-16 LE with CRLF** and looks like a Windows `pip freeze` subset (e.g. `colorama`). pip decodes BOM-marked UTF-16 requirement files, so this should work, but it is **unverified**. Transitive dependencies of `google-generativeai` (grpcio, protobuf, google-api-core, …) are not pinned and will float.
- `requests` (used by `agent/app/test_agent.py`) is **not** in requirements.
- `google-generativeai` is imported unconditionally ([llm_provider.py:2](../../agent/app/llm_provider.py#L2)), so it must be installed even in stub mode.
- `server` tests need `nock`, which is **not** in `package.json` or the lockfile.
- `mongodb-memory-server` downloads a MongoDB binary (~100 MB) on first test run, which needs network access.

## Environment configuration steps

See [CONFIGURATION_INVENTORY.md](CONFIGURATION_INVENTORY.md) for every variable.

1. `server/.env` from `server/.env.example`, with these changes for a **non-Docker** run:
   - `MONGO_URI=mongodb://localhost:27017/helpdesk` (the example uses the Docker hostname `mongo`)
   - `AGENT_BASE_URL=http://localhost:9000` (the example uses `agent`)
   - `JWT_SECRET` / `REFRESH_SECRET`: two distinct random strings, generated locally and never committed
2. `agent/.env` from `agent/.env.example`: keep `STUB_MODE=true` and leave `GEMINI_API_KEY` empty.
3. `frontend/.env` from `frontend/.env.example`: `VITE_API_BASE=/api` (default; optional).

## Database initialization

- No migrations. Indexes are auto-built on connect (`autoIndex: true`).
- `cd server && npm run seed` **deletes all `users`, `articles`, `tickets`, `configs`** and inserts 4 users, 6 KB articles and 1 Config ([seed/seed.js](../../server/src/seed/seed.js)). It does **not** clear `agentsuggestions`, `auditlogs`, `notifications`, `pendingtickets` or `ticketreplies`, so re-seeding leaves orphans. Point it at a dedicated local DB only.

## Proposed local startup sequence (not executed)

```bash
# 0. Start MongoDB on localhost:27017 (native mongod, Docker Desktop, or use an Atlas URI)

# 1. API
cd server
npm ci
# create .env as described above
npm run seed
npm run dev                     # → http://localhost:8080 ; check GET /api/healthz

# 2. Agent worker (new terminal)
cd agent
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
# create .env (STUB_MODE=true)
uvicorn app.main:app --host 127.0.0.1 --port 9000 --reload   # run from agent/ (B1 fixed)
# check GET http://localhost:9000/healthz

# 3. Frontend (new terminal)
cd frontend
npm ci
npm run dev                     # → http://localhost:5173 (proxies /api → :8080)
```

Order matters: **MongoDB → API** (the API exits if Mongo is unreachable). The agent can start before or after the API, but must be up before any ticket is created. The frontend comes last.

## Ports and URLs

| Service | URL | Health |
|---|---|---|
| Frontend (Vite dev) | http://localhost:5173 | page loads |
| API | http://localhost:8080/api | `GET /api/healthz` → `{ok:true}`, `GET /api/readyz` → `{ready:true}` (**static**, they don't check DB) |
| Agent | http://localhost:9000 | `GET /healthz` → `{ok:true}` (static); FastAPI docs at `/docs` |
| MongoDB | mongodb://localhost:27017 | — |

## Smoke test (proposed)

1. `GET /api/healthz` and `GET :9000/healthz` both return OK.
2. Log in as the seeded `user` account and create a ticket **with a category selected**. Expect `201` and status `waiting_human` or `resolved`.
3. `GET /api/tickets/:id/audit` shows `TICKET_CREATED … TRIAGE_COMPLETED`.
4. Log in as the seeded agent. The ticket appears on TicketDetail with an AI suggestion; accept it. A reply is created.
5. As the user, the notification bell shows unread notifications within about 30 s.
6. Stop the agent and create a ticket. Expect a **500 after ~24 s**; the ticket exists with status `open` (documents the current failure mode).

`python agent/test_enhanced_kb.py` runs the pipeline in-process (no server needed) and only prints output; it has no assertions.

## Test, lint and build commands

| Component | Command | Expected status (from static reading; **not run**) |
|---|---|---|
| Server tests | `cd server && npm test` (`NODE_ENV=test jest --runInBand`) | **Likely fails before running tests**: (a) `nock` missing; (b) package is ESM (`"type":"module"`) with no Babel config and no `--experimental-vm-modules`, so Jest 29 is expected to reject `import` syntax; (c) `JWT_SECRET` is unset unless `server/.env` exists, so login returns 500; (d) `audit-log.test.js` expects an array, but the route returns an object (see [RELIABILITY_ASSESSMENT.md](RELIABILITY_ASSESSMENT.md)). |
| Server coverage | `npm test -- --coverage` | as above |
| Frontend tests | `cd frontend && npx vitest run` (**no `test` script** despite the frontend README) | **Likely fails**: all 5 test files use `jest.mock`/`jest.fn`, and Vitest provides `vi`, not `jest`, even with `globals: true`. |
| Frontend lint | `cd frontend && npm run lint` | unknown |
| Frontend type-check | `cd frontend && npx tsc -b` (not wired into `build`) | unknown |
| Frontend build | `cd frontend && npm run build` (`vite build`, no type-check) | unknown |
| Server lint | none configured | — |
| Agent tests | `python agent/test_enhanced_kb.py` (in-process, prints only); `python agent/app/test_agent.py` (needs running worker + `requests`) | no assertions; always "passes" |

## Known setup blockers

| # | Blocker | Evidence | Workaround (without code changes) |
|---|---|---|---|
| B1 | **Fixed.** `uvicorn app.main:app` used to raise `ModuleNotFoundError: schemas` because modules used bare imports and `app/` was not a package. `app/` now has `__init__.py` and uses `from app.<module> import …`, so the documented command and the Dockerfile `CMD` work when run from `agent/`. | [main.py:2-3](../../agent/app/main.py#L2-L3) | Run from the `agent/` directory. |
| B2 | `docker-compose.yml` referenced by the READMEs does not exist (and is gitignored). No Mongo container definition anywhere. | [.gitignore](../../.gitignore) last lines | Run services natively, or write a compose file in a later task. |
| B3 | `.env.example` hostnames `mongo` and `agent` only resolve inside Docker. | [server/.env.example](../../server/.env.example) | Use `localhost`. |
| B4 | No startup validation of `JWT_SECRET`/`REFRESH_SECRET`. The server boots but auth returns 500. | [utils/jwt.js](../../server/src/utils/jwt.js) | Set both. |
| B5 | MongoDB and Docker are not installed on this host. | host check above | Install MongoDB or enable Docker Desktop WSL integration. |
| B6 | Creating a ticket without choosing a category returns 400 (`category` is `''`). | [CreateTicket.tsx:42](../../frontend/src/pages/CreateTicket.tsx#L42), [tickets.js:22](../../server/src/routes/tickets.js#L22) | Always pick a category during smoke tests. |
| B7 | Server and frontend test suites are expected to fail for tooling reasons (above). | see table | Address in a dedicated "make tests runnable" task. |
| B8 | npm scripts use POSIX `NODE_ENV=… cmd` syntax, while the root README uses Windows `copy`/`.venv\Scripts\activate`. | [server/package.json](../../server/package.json) | Use WSL/Linux/macOS shells (fine on this host). |
| B9 | The Dockerfiles are named lowercase `dockerfile`. Docker usually accepts this as a fallback, but it's worth confirming with the Docker version you use. | [server/dockerfile](../../server/dockerfile), [agent/dockerfile](../../agent/dockerfile) | `docker build -f dockerfile .` |
| B10 | There is no frontend Dockerfile or production static-hosting configuration. | — | n/a for local dev |
