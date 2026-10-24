# Deployment readiness and operations

This repository is a three-service monorepo:

```text
frontend/  React + Vite application (Vercel)
server/    Express API, MongoDB models, Gmail poller (Render Web Service)
agent/     FastAPI extraction/triage worker (Render Web Service)
```

MongoDB Atlas is the database. The server remains the only service that talks
to Gmail and MongoDB. The browser talks to the server through `VITE_API_BASE`.
No credentials or OAuth tokens belong in the frontend.

## Readiness report

### Verified in source

- Resource requests, inventory, assignments, authentication, and Gmail
  ingestion are persisted through MongoDB models.
- Gmail ingestion validates the sender against registered users and uses
  `EmailMessage.gmailMessageId` plus an outbox uniqueness key for
  idempotency.
- Completed or ignored Gmail messages are marked read. Failed messages remain
  unread for retry, and concurrent poll calls share one in-flight operation.
- The server starts only after MongoDB connects, exposes `/api/healthz` and a
  MongoDB-aware `/api/readyz`, and drains Gmail polling on `SIGTERM`/`SIGINT`.
- The Python service exposes `/healthz` and `/resource-extract`.
- The frontend has a Vercel SPA fallback and a production-configurable API
  base URL. Development continues to use the Vite proxy.

### Requires live credentials or deployment verification

- Gmail OAuth authorization, refresh-token validity, mailbox access, and
  outgoing delivery.
- Atlas network access, credentials, replica-set transactions, and free-tier
  availability in the selected region.
- Cross-origin login and authenticated requests between the deployed Vercel
  origin and Render API.
- A deployed Python extraction request through the Render API.

Automatic allocation has a known outstanding business issue. Deployment
configuration does not claim to solve it; verify and monitor it separately.

## Vercel frontend settings

Create a Vercel project with:

- Root directory: `frontend`
- Framework preset: Vite
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE=https://<render-api-host>/api`

The committed [frontend/vercel.json](../frontend/vercel.json) keeps nested
React Router URLs working after refresh. Set the exact Vercel origin in the
backend `CORS_ORIGIN`.

## Render Node.js API settings

Use a Web Service with:

- Root directory: `server`
- Runtime: Node
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/api/readyz`
- One instance while Gmail polling is enabled

The service must bind to Render's injected `PORT`. Set `MONGO_URI` to an Atlas
`mongodb+srv://` URI, and set `AGENT_BASE_URL` to the deployed agent service
URL. Configure `CORS_ORIGIN` to the exact public Vercel origin, not `*`.

Render free Web Services sleep after inactivity. Gmail polling therefore pauses
while the API is asleep, and an incoming message may not be processed until
the service wakes. Polling is not continuous or guaranteed on the free tier.

## Render Python service settings

Use a second Web Service with:

- Root directory: `agent`
- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/healthz`

The checked-in `requirements.txt` is UTF-8 and suitable for pip installation.
Use `STUB_MODE=true` for a deterministic demo, or provide `GEMINI_API_KEY` and
the documented model settings for model-backed extraction.

## MongoDB Atlas setup

1. Create an Atlas free-tier cluster in a region supported by the account.
2. Create a least-privilege database user for the application database.
3. Allow Render outbound access using the Atlas network-access policy available
   to the account; do not commit the URI.
4. Use the Atlas URI as `MONGO_URI` in Render only.
5. Start the API once. Mongoose initializes model indexes in non-production;
   production uses `autoIndex=false`, so run the application's index
   initialization in a controlled maintenance process before go-live if the
   database is not empty.
6. Seed demo data only when desired:

   ```bash
   cd server
   npm run seed:inventory
   npm run set-role -- --email <email> --role admin
   ```

   These operations are additive and do not wipe existing data. Registration
   always creates a `user`.

Allocation transactions require an Atlas replica set. Treat a standalone
MongoDB deployment as unsupported for assignment operations.

## Environment-variable matrix

| Variable | Service | Required | Example / where configured | Secret |
|---|---|---:|---|---:|
| `VITE_API_BASE` | Vercel frontend | yes | `https://<api-host>/api` | no |
| `PORT` | Render API / agent | platform | injected by Render | no |
| `NODE_ENV` | Render API | yes | `production` | no |
| `MONGO_URI` | Render API | yes | `mongodb+srv://<user>:<password>@<cluster>/<db>` | yes |
| `JWT_SECRET` | Render API | yes | generated unique secret | yes |
| `JWT_EXPIRES_IN` | Render API | no | `15m` | no |
| `REFRESH_SECRET` | Render API | yes | generated unique secret | yes |
| `REFRESH_EXPIRES_IN` | Render API | no | `7d` | no |
| `CORS_ORIGIN` | Render API | yes | `https://<vercel-domain>` | no |
| `AGENT_BASE_URL` | Render API | yes | `https://<agent-host>` | no |
| `AGENT_TIMEOUT_MS` | Render API | no | `8000` | no |
| `AGENT_RETRY` | Render API | no | `2` | no |
| `RESOURCE_AUTOMATION_ENABLED` | Render API | no | `true` or `false` | no |
| `GMAIL_ENABLED` | Render API | yes for email workflow | `true` | no |
| `ADMIN_EMAIL` | Render API | email workflow | `<admin-email>` | no |
| `IT_SUPPORT_EMAIL` | Render API | requester email footer | `ADMIN_EMAIL` or no address | no |
| `ORGANIZATION_NAME` | Render API | branded email header/footer | `IT Resource Team` | no |
| `ORGANIZATION_LOGO_URL` | Render API | branded email header | empty; text brand is used | no |
| `GMAIL_CLIENT_ID` | Render API | Gmail | Google OAuth client ID | no |
| `GMAIL_CLIENT_SECRET` | Render API | Gmail | Google OAuth client secret | yes |
| `GMAIL_REDIRECT_URI` | Render API | Gmail | `https://<api-host>/api/gmail/oauth/callback` | no |
| `GMAIL_REFRESH_TOKEN` | Render API | Gmail | obtained through OAuth | yes |
| `GMAIL_USER_EMAIL` | Render API | Gmail | configured mailbox address | no |
| `GMAIL_WRITE_REFRESH_TOKEN` | Render API | no | `false` in Render | no |
| `GMAIL_POLL_INTERVAL_MS` | Render API | no | `30000` (minimum `10000`) | no |
| `GMAIL_LABEL` | Render API | no | `INBOX` | no |
| `AUTO_CLOSE_ENABLED` | Render API | no | `true` | no |
| `CONFIDENCE_THRESHOLD` | Render API | no | `0.78` | no |
| `SLA_HOURS` | Render API | no | `24` | no |
| `STUB_MODE` | Render agent | no | `true` for demo | no |
| `GEMINI_MODEL` | Render agent | no | `gemini-2.0-flash` | no |
| `GEMINI_API_KEY` | Render agent | no | provider key when not stubbed | yes |
| `MAX_ARTICLES` | Render agent | no | `3` | no |
| `AUTO_CLOSE_ENABLED` | Render agent | no | `true` | no |
| `CONFIDENCE_THRESHOLD` | Render agent | no | `0.78` | no |
| `ENHANCED_SEARCH_ENABLED` | Render agent | no | `true` | no |
| `RELEVANCE_THRESHOLD` | Render agent | no | `1.0` | no |
| `SEMANTIC_WEIGHT` | Render agent | no | `0.3` | no |
| `KEYWORD_WEIGHT` | Render agent | no | `0.7` | no |
| `STRICT_FORMATTING` | Render agent | no | `true` | no |
| `MAX_RESPONSE_WORDS` | Render agent | no | `400` | no |
| `MIN_RESPONSE_WORDS` | Render agent | no | `50` | no |
| `REQUIRE_NUMBERED_STEPS` | Render agent | no | `true` | no |
| `REQUIRE_CITATIONS` | Render agent | no | `true` | no |

Local names and defaults are also listed in
[server/.env.example](../server/.env.example),
[frontend/.env.example](../frontend/.env.example), and
[agent/.env.example](../agent/.env.example).

## Gmail OAuth and polling

The OAuth flow uses Gmail `modify` and `send` access through
`GMAIL_REDIRECT_URI`. Register the exact HTTPS callback URL in Google Cloud:
`https://<api-host>/api/gmail/oauth/callback`. Configure the OAuth consent
screen and authorized mailbox; do not commit the client secret or refresh
token. Authorize through `/api/gmail/oauth` after the API is reachable, then
copy the returned refresh token into Render's secret environment variable.

The API polls every `GMAIL_POLL_INTERVAL_MS` milliseconds. A single-flight
guard prevents overlap. A successful or ignored inbound message is marked read;
failed processing remains retryable. Outbox records are unique per request and
kind, so normal retries do not enqueue duplicate acknowledgements.

## Local verification

```bash
cd server && npm ci && npm test
cd ../frontend && npm ci && npm run lint && npm run build
cd ../agent && python -m pip install -r requirements.txt && python -m pytest
```

The frontend repository contains Jest-style tests but does not currently
provide a compatible test script; the verified frontend checks are lint and
production build. The Python tests may require the local environment's
optional model/test dependencies. A live Gmail or Atlas test is not part of
local verification.

## Deployment smoke-test checklist

- [ ] Vercel loads the app and nested routes survive refresh.
- [ ] Registration and login work against the Render API.
- [ ] Authenticated requests succeed cross-origin.
- [ ] `/api/readyz` and agent `/healthz` are healthy.
- [ ] Data persists across an API restart.
- [ ] Requests, inventory, and assignments load correctly.
- [ ] Python extraction succeeds through the API.
- [ ] Gmail OAuth callback and token refresh succeed.
- [ ] A registered sender creates exactly one request.
- [ ] An unregistered sender is ignored according to policy.
- [ ] Expected acknowledgement/result mail is delivered once.
- [ ] The frontend displays the request and later status.
- [ ] Gmail/API/agent failures do not terminate future polling.

The live deployment, OAuth, mailbox, and provider checks remain pending until
real credentials and deployed URLs are supplied.
