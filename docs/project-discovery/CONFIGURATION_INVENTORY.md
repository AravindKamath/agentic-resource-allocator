# Configuration Inventory

Sources inspected: [server/src/config.js](../../server/src/config.js), [server/src/logger.js](../../server/src/logger.js), [server/.env.example](../../server/.env.example), [server/package.json](../../server/package.json) scripts, [server/dockerfile](../../server/dockerfile), [agent/app/config.py](../../agent/app/config.py), [agent/.env.example](../../agent/.env.example), [agent/dockerfile](../../agent/dockerfile), [frontend/.env.example](../../frontend/.env.example), [frontend/vite.config.ts](../../frontend/vite.config.ts), [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts). `grep -rn "process.env\|os.getenv\|import.meta.env"` across all three components returns only the variables listed below.

**No secret values are recorded here.** The `.env.example` files contain placeholders only. No real `.env` files exist in the checkout.

## Loading mechanism

| Component | How config is loaded | When |
|---|---|---|
| API server | `import 'dotenv/config'` reads `./.env` relative to **CWD** | Once, at module import ([config.js:1](../../server/src/config.js#L1)) |
| Agent worker | `load_dotenv()` reads `.env` from CWD (searching upward) | Once, at import ([config.py:4](../../agent/app/config.py#L4)); class attributes are evaluated at import |
| Frontend | Vite `import.meta.env.VITE_*` from `frontend/.env*` | Build or dev-server start (baked into the bundle) |
| Runtime settings (auto-close, threshold, SLA) | MongoDB `configs` collection, first document | Read per triage ([agentService.js:140](../../server/src/services/agentService.js#L140)); edited via `PUT /api/config` (admin) |

There is **no validation of required variables at startup**. Missing values surface as runtime errors (see "Behaviour if missing").

## API server (`server/`)

| Variable | Purpose | Required? | Default in code | Example value (`.env.example`) | Source of value | Secret? | Behaviour if missing / notes |
|---|---|---|---|---|---|---|---|
| `MONGO_URI` | MongoDB connection string | **Required** | none | `mongodb://mongo:27017/helpdesk` (Docker hostname) | Local Mongo or Atlas; operator-provided | **Yes**, if it contains credentials (Atlas) | `mongoose.connect(undefined)` throws → `exit(1)`. Use `localhost`, not `mongo`, for non-Docker local runs. |
| `JWT_SECRET` | HMAC key for access tokens | **Required** | none | placeholder | Generate a random value locally | **Yes** | `jwt.sign` throws "secretOrPrivateKey must have a value", so **login/register return 500**. The server still starts. |
| `REFRESH_SECRET` | HMAC key for refresh tokens | **Required** | none | placeholder | Generate a random value; must differ from `JWT_SECRET` | **Yes** | Same as above. |
| `JWT_EXPIRES_IN` | Access token TTL | Optional | `15m` | `15m` | — | No | |
| `REFRESH_EXPIRES_IN` | Refresh token TTL | Optional | `7d` | `7d` | — | No | |
| `PORT` | Listen port | Optional | `8080` | `8080` | — | No | The frontend Vite proxy hardcodes `localhost:8080`. |
| `CORS_ORIGIN` | Allowed CORS origin | Optional | **`*`** | `http://localhost:5173` | Frontend origin | No | Defaults to wide-open CORS. With the Vite proxy, dev requests are same-origin anyway. |
| `AGENT_BASE_URL` | Agent worker base URL | Optional | `http://localhost:9000` | `http://agent:9000` (Docker hostname) | Wherever the worker runs | No | For local non-Docker runs, use `http://localhost:9000` or remove the line. The example value breaks local runs. |
| `AGENT_TIMEOUT_MS` | Per-attempt HTTP timeout to the worker | Optional | `8000` | `8000` | — | No | |
| `AGENT_RETRY` | Extra attempts after the first | Optional | `2` (= 3 total) | `2` | — | No | |
| `AUTO_CLOSE_ENABLED` | Intended default for auto-close | **Unused** | `false` unless the string is `'true'` | `true` | — | No | Parsed into `config.defaults` but **never read**. The effective value comes from the `Config` document (schema default `true`). |
| `CONFIDENCE_THRESHOLD` | Intended auto-close threshold | **Unused** | `0.78` | `0.78` | — | No | Same: the effective value comes from `Config` (schema default `0.78`). |
| `SLA_HOURS` | Intended SLA | **Unused** | `24` | `24` | — | No | SLA is **never enforced anywhere**, whether from env or from DB. |
| `NODE_ENV` | Runtime mode | Optional | `development` | `development` | npm scripts set it (`dev`, `test`); Dockerfile sets `production` | No | Read into `config.env` but **never used**. No behaviour differs by environment. |
| `LOG_LEVEL` | pino log level | Optional | `info` | *(not in example)* | — | No | Read in [logger.js:4](../../server/src/logger.js#L4). |

Test-only (implicit): `mongodb-memory-server` honours `MONGOMS_*` variables (e.g. `MONGOMS_VERSION`, `MONGOMS_DOWNLOAD_DIR`) if set. The repo sets none. It downloads a `mongod` binary on first use, which **requires network access**.

## Agent worker (`agent/`)

| Variable | Purpose | Required? | Default | Example | Source | Secret? | Notes |
|---|---|---|---|---|---|---|---|
| `STUB_MODE` | Use keyword classifier instead of Gemini | Optional | `true` | `true` | — | No | **Forced to `true` whenever `GEMINI_API_KEY` is empty** ([config.py:8](../../agent/app/config.py#L8)). |
| `GEMINI_API_KEY` | Google Generative AI key | Conditional (only for `STUB_MODE=false`) | `""` | placeholder | Google AI Studio / GCP; **do not create one for discovery** | **Yes** | Using it **incurs API charges**. Used only for classification. |
| `GEMINI_MODEL` | Model id | Optional | `gemini-2.0-flash` | `gemini-2.0-flash` | — | No | Whether this model id is still served by Google is **unverified** (no external calls made). |
| `MAX_ARTICLES` | Top-k articles to retrieve | Optional | `3` | `3` | — | No | Raised to `min(5, MAX_ARTICLES+2)` for text longer than 500 characters. |
| `ENHANCED_SEARCH_ENABLED` | Use enhanced vs simple scoring | Optional | `true` | — | — | No | Not in the example. |
| `RELEVANCE_THRESHOLD` | Minimum score to keep an article | Optional | `1.0` | — | — | No | Not in the example. |
| `SEMANTIC_WEIGHT` | Jaccard weight | Optional | `0.3` | — | — | No | Not in the example. |
| `KEYWORD_WEIGHT` | Keyword weight | Optional | `0.7` | — | — | No | Not in the example. |
| `AUTO_CLOSE_ENABLED` | — | **Unused** | `true` | — | — | No | Never read. The decision is made in the API. |
| `CONFIDENCE_THRESHOLD` | — | **Unused** | `0.78` | — | — | No | Never read. |
| `STRICT_FORMATTING`, `MAX_RESPONSE_WORDS`, `MIN_RESPONSE_WORDS`, `REQUIRE_NUMBERED_STEPS`, `REQUIRE_CITATIONS` | Draft formatting knobs | **Unused** | various | — | — | No | Never read. |
| `HOST`, `PORT` | Bind address | **Unused by code** | — | `0.0.0.0`, `9000` | — | No | Only the uvicorn CLI flags matter. The Dockerfile sets `ENV HOST/PORT` but its `CMD` hardcodes `--port 9000`. |
| `LOG_LEVEL` | — | **Unused** | — | `info` | — | No | The worker has no logging. |

## Frontend (`frontend/`)

| Variable | Purpose | Required? | Default | Example | Secret? | Notes |
|---|---|---|---|---|---|---|
| `VITE_API_BASE` | Axios base URL | Optional | `/api` | `/api` | No (public, baked into the bundle) | With `/api`, dev requests go through the Vite proxy to `http://localhost:8080` (**hardcoded** in [vite.config.ts:11](../../frontend/vite.config.ts#L11)). For a static production build, set this to an absolute API URL and set `CORS_ORIGIN` on the API. |

## Runtime settings stored in MongoDB (`configs` collection)

| Field | Default (schema) | Used by | Editable via |
|---|---|---|---|
| `autoCloseEnabled` | `true` | [agentService.js:141](../../server/src/services/agentService.js#L141) | `PUT /api/config` (admin), [Settings.tsx](../../frontend/src/pages/Settings.tsx) |
| `confidenceThreshold` | `0.78` | [agentService.js:141](../../server/src/services/agentService.js#L141) | same |
| `slaHours` | `24` | **nothing** | same |

`GET /api/config` evaluates `await (Config.findOne() || new Config({}).save())`. The `||` is applied to the Query object (always truthy), so with an empty collection it returns `null` instead of creating defaults ([routes/config.js:12](../../server/src/routes/config.js#L12)). The seed script creates the document, so this only shows up on unseeded DBs.

## Seed credentials

[server/src/seed/data.js](../../server/src/seed/data.js) contains four demo accounts (one admin, two agents, one user, all on `@example.com`) with **plaintext demo passwords committed to source**. They are not reproduced here; read the file locally when needed. They must never be used outside local development.

## Confirmed vs assumed

| Item | Status |
|---|---|
| `MONGO_URI`, `JWT_SECRET`, `REFRESH_SECRET` are functionally required | **Confirmed** from code paths |
| Example `MONGO_URI`/`AGENT_BASE_URL` use Docker service names `mongo`/`agent` | **Confirmed**. This implies a compose file that is **not in the repo**. |
| `AUTO_CLOSE_ENABLED`/`CONFIDENCE_THRESHOLD`/`SLA_HOURS` env vars have no effect | **Confirmed** by grep |
| `GEMINI_MODEL=gemini-2.0-flash` is currently valid | **Unverified** (no external calls permitted) |
| Production secret management approach | **Unknown**. Nothing in the repo (no vault, no k8s manifests). |
