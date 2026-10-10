# Smart Helpdesk with Agentic AI

A full-stack AI-powered helpdesk platform that combines a modern React frontend, a secure Node.js API, and a Python FastAPI agent worker for intelligent ticket triage.

The system classifies incoming tickets, suggests draft responses with knowledge base citations, and routes tickets to human agents with role-based workflows and complete audit trails.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933)
![Express](https://img.shields.io/badge/Express-4+-000000)
![React](https://img.shields.io/badge/React-18+-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6)
![FastAPI](https://img.shields.io/badge/FastAPI-Agent-009688)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248)
![Gemini](https://img.shields.io/badge/Google-Gemini%202.0%20Flash-4285F4)

---

## Architecture

```text
                    +-----------------------------------+
                    |           Frontend UI             |
                    |         React + TypeScript        |
                    +-----------------+-----------------+
                                      |
                                      | HTTPS / REST
                                      v
                      +--------------------------------+
                      |     API Server (Express)       |
                      |   Auth, Tickets, KB, Audit     |
                      +------------+-------------------+
                                   |
              +--------------------+--------------------+
              |                                         |
              v                                         v
   +-----------------------------+          +-----------------------------+
   | MongoDB (Mongoose Models)  |          | AI Agent Worker (FastAPI)   |
   | Users, Tickets, KB, Replies|          | /triage, /healthz           |
   | Suggestions, Audit, Notify |          | classify -> retrieve -> draft|
   +-----------------------------+          +-----------------------------+
                                                        |
                                                        v
                                         Gemini 2.0 Flash (or Stub Mode)
```

---

## Features

| Feature | Description |
|---------|-------------|
| JWT Authentication | Access + refresh token authentication with role-based authorization |
| Role-Based Access | User, Agent, and Admin workflows across UI and API |
| AI Ticket Triage | Auto category prediction, confidence scoring, and draft reply generation |
| Knowledge Base Integration | Citation-aware article retrieval for better agent responses |
| Human-in-the-Loop Review | Agent review, edit, accept/reject flow before customer-visible resolution |
| Ticket Replies & Threading | Structured ticket conversations with internal/public reply controls |
| Notification System | Per-user notifications and unread counters |
| Audit Timeline | End-to-end traceable action logs with trace IDs |
| Configurable Automation | Thresholds, SLA hours, timeout/retry, and auto-close settings |
| Dockerized Services | API + Agent orchestration with Docker Compose |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI layer and typed components |
| Vite | Dev/build tooling |
| Tailwind CSS | Utility-first styling |
| Zustand | Client state management |
| Axios | API client with token refresh interception |
| React Hook Form + Zod | Form handling and validation |
| Vitest + RTL | Frontend tests |

### API Server

| Technology | Purpose |
|------------|---------|
| Node.js + Express | REST API |
| MongoDB + Mongoose | Data persistence |
| JWT | Access/refresh auth |
| Joi | Request validation |
| Helmet + CORS + Rate Limit | API hardening |
| Pino + Morgan | Structured and request logging |
| Jest + Supertest | API testing |

### Agent Worker

| Technology | Purpose |
|------------|---------|
| Python + FastAPI | AI microservice |
| Pydantic | Schema validation |
| Gemini 2.0 Flash | AI model target |
| Stub/LLM Provider Mode | Local deterministic testing vs model-backed execution |

---

## Project Structure

```text
Smart Helpdesk with Agentic/
├── docker-compose.yml
├── server/                      # Express API
│   ├── src/
│   │   ├── routes/              # auth, tickets, kb, config, audit, agent, replies, notifications
│   │   ├── models/              # Ticket, User, Article, AuditLog, AgentSuggestion, etc.
│   │   ├── services/            # triage integration, KB search, notifications
│   │   ├── middleware/          # auth, role checks, validation, error, rate limits
│   │   └── seed/                # seed users + KB articles
│   └── tests/                   # Jest integration tests
├── agent/                       # FastAPI AI worker
│   ├── app/
│   │   ├── main.py
│   │   ├── pipeline.py
│   │   ├── llm_provider.py
│   │   ├── search.py
│   │   └── schemas.py
│   └── test_enhanced_kb.py
└── frontend/                    # React + TypeScript client
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   ├── stores/
    │   ├── lib/
    │   └── __tests__/
    └── ...
```

---

## Data Flow

```text
1) User creates ticket in frontend
2) API stores ticket, emits notification, writes initial audit event
3) API calls Agent Worker /triage with ticket + KB context
4) Agent classifies category, retrieves KB matches, drafts response, returns confidence
5) API stores AgentSuggestion + audit steps
6) Ticket is routed to agent review queue (human approval flow)
7) Agent accepts/edits/rejects suggestion and replies
8) Notifications + complete traceable audit timeline are updated
```

---

## Installation and Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB local or Atlas
- Docker (optional, recommended for quick start)

### 1) Clone Repository

```bash
git clone https://github.com/tlokeshkumar1/Smart-Helpdesk-with-Agentic.git
cd "Smart Helpdesk with Agentic"
```

### 2) API Server Setup

```bash
cd server
npm install
copy .env.example .env
npm run seed
npm run dev
```

API runs on http://localhost:8080 by default.

### 3) Agent Worker Setup

Open a new terminal:

```bash
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload
```

Agent runs on http://localhost:9000.

### 4) Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Frontend runs on http://localhost:5173.

---

## Docker Quick Start

From repository root:

```bash
docker-compose up --build
```

Services:

- API: http://localhost:8080
- Agent: http://localhost:9000

---

## Environment Variables

### API Server (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | API port | Yes |
| MONGO_URI | MongoDB connection URI | Yes |
| JWT_SECRET | Access token signing secret | Yes |
| REFRESH_SECRET | Refresh token signing secret | Yes |
| AGENT_BASE_URL | Agent worker URL | Yes |
| AGENT_TIMEOUT_MS | Agent request timeout | Yes |
| AGENT_RETRY | Agent retry count | Yes |
| AUTO_CLOSE_ENABLED | Auto close flag | Yes |
| CONFIDENCE_THRESHOLD | AI confidence threshold | Yes |
| SLA_HOURS | Default SLA hours | Yes |
| CORS_ORIGIN | Allowed frontend origin | Yes |
| NODE_ENV | Runtime mode | Yes |

### Agent Worker (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| STUB_MODE | Enable deterministic local triage | Yes |
| GEMINI_MODEL | Model identifier (default gemini-2.0-flash) | Yes |
| MAX_ARTICLES | Max KB articles in context | Yes |
| GEMINI_API_KEY | Required when STUB_MODE=false | Conditional |
| HOST | Agent host | Yes |
| PORT | Agent port | Yes |

### Frontend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| VITE_API_BASE | API base path or URL (default /api) | Yes |

---

## API Endpoints

Base URL: /api

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /healthz | Liveness probe |
| GET | /readyz | Readiness probe |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Register user |
| POST | /auth/login | Login |
| POST | /auth/refresh | Refresh access token |

### Tickets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /tickets | List tickets |
| POST | /tickets | Create ticket + trigger triage |
| GET | /tickets/:id | Get ticket detail |
| GET | /tickets/:id/audit | Ticket timeline |
| GET | /tickets/:id/replies | List replies for ticket |
| POST | /tickets/:id/reply | Agent reply workflow |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /kb | Search/list KB articles |
| GET | /kb/:id | Get article |
| POST | /kb | Create article (admin) |
| PUT | /kb/:id | Update article (admin) |
| DELETE | /kb/:id | Delete article (admin) |
| PATCH | /kb/:id/toggle-status | Publish/unpublish toggle |

### Agent and Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /agent/triage | Trigger triage manually |
| GET | /agent/dashboard | Agent metrics + pending queue |
| GET | /agent/tickets/:id | Agent ticket detail + citations |
| GET | /notifications | User notifications |
| PUT | /notifications/:id/read | Mark one as read |
| PUT | /notifications/read-all | Mark all as read |
| GET | /notifications/unread-count | Unread counter |
| GET | /replies/ticket/:ticketId | Ticket thread fetch |
| POST | /replies | Create reply |

### Agent Worker Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /healthz | Worker health |
| POST | /triage | AI triage pipeline endpoint |

---

## Testing

### API Tests

```bash
cd server
npm test
```

### Frontend Tests

```bash
cd frontend
npx vitest run
```

### Agent Smoke Test

```bash
cd agent
python test_enhanced_kb.py
```

---

## Seed Data

The API includes seed scripts for demo users and knowledge base content.

```bash
cd server
npm run seed
```

Default roles in seed data:

- admin
- agent
- user

---

## Security and Reliability

| Capability | Implementation |
|------------|----------------|
| Password Security | Hashed password storage with bcrypt |
| Session Security | JWT access and refresh tokens |
| Request Validation | Joi middleware on API routes |
| Abuse Protection | Authentication and write rate limits |
| HTTP Hardening | Helmet + controlled CORS |
| Traceability | Audit logs with trace IDs |

---

## Deployment Options

| Option | Notes |
|--------|-------|
| Docker Compose | Easiest full-stack local deployment |
| Cloud Containers | Deploy API and Agent as separate services |
| Static Frontend Hosting | Build frontend and host on static/CDN platform |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for your changes
4. Run lint/tests locally
5. Open a pull request

---

## Author

Lokesh Kumar T

GitHub: https://github.com/tlokeshkumar1

---

## Acknowledgments

- React and Vite ecosystem
- Express and FastAPI communities
- MongoDB open-source ecosystem
- Google Gemini model family

---

Made to streamline support operations with practical AI + human collaboration.
