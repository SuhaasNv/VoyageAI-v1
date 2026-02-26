# VoyageAI — Technical Implementation Blueprint

> **Version:** 1.3 · **Date:** 2026-02-25 · **Architect:** Senior SaaS AI Platform  
> **Status:** ✅ Architecture Locked — Ready for Implementation

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Client["🖥️ Client (Next.js 14 / App Router)"]
        LP[Landing Page]
        Auth[Auth Pages]
        Onboard[Travel DNA Onboarding]
        Dashboard[Trip Dashboard]
        Chat[AI Chat Companion]
        Map[Map View]
        Budget[Budget Tracker]
        Sim[Trip Simulator]
    end

    subgraph Edge["⚡ Edge Layer (Vercel Edge)"]
        MW[Next.js Middleware]
        RateL[Rate Limit Headers]
    end

    subgraph API["🔧 Backend API (FastAPI + Python 3.12)"]
        AuthSvc[Auth Service]
        TripSvc[Trip Service]
        ItinSvc[Itinerary Service]
        ChatSvc[Chat Service]
        BudgetSvc[Budget Service]
        UserSvc[User / DNA Service]
    end

    subgraph AI["🤖 AI Orchestration Layer"]
        Orch[Voyage Orchestrator]
        LC[LangChain Chains]
        VDB[Supabase pgvector]
        LLM["Groq LLaMA-3.3 / Gemini Fallback"]
        Stream[SSE / Streaming]
    end

    subgraph Data["💾 Data Layer"]
        PG[(PostgreSQL 16 — Supabase)]
        Redis[(Redis — Upstash)]
        FS[(Local Volume / S3-ready Interface)]
    end

    Client -->|HTTPS / REST + SSE| Edge
    Edge --> API
    API --> AI
    API --> Data
    AI --> Data
```

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript | RSC, streaming, SEO |
| **Styling** | TailwindCSS + shadcn/ui | DX speed + accessible components |
| **Animation** | Framer Motion | Premium micro-interactions |
| **State** | Zustand + TanStack Query v5 | Local state + server cache |
| **Maps** | Mapbox GL JS | Custom styling + 3D terrain |
| **Charts** | Recharts | Budget viz |
| **Backend** | FastAPI (Python 3.12) | Async, type-safe, OpenAPI out-of-box |
| **Auth** | JWT + httpOnly refresh tokens + **Google OAuth 2.0 (SSO)** | Stateless + social login |
| **Database** | PostgreSQL 16 via **Supabase** (free tier) | Managed, PGVECTOR ready |
| **Cache / Rate Limit** | **Upstash Redis** (free tier, serverless) | Edge-compatible, 10K cmds/day free |
| **AI / LLM** | **Groq** (LLaMA-3.3-70b) primary + **Google Gemini 1.5 Flash** fallback | Ultra-low latency inference; free tier generous |
| **Vector Store** | **Supabase pgvector** (same Postgres DB, zero extra service) | Free, HNSW indexed, SQL-native — Supabase explicitly endorses this over Pinecone |
| **File Storage** | **Local Docker volume** (dev) → abstract `StorageBackend` interface (swap to S3/R2 when ready) | No vendor lock-in; mirrors real files locally |
| **Deployment** | **Vercel (frontend project) + Vercel Serverless Python (backend project)** | 100% free, two projects one account |
| **Monitoring** | Sentry (free tier) + Vercel logs | Error tracking, zero cost |

---

## 3. Folder Structure

### Frontend — `/` (monorepo root)
```
voyageai/
├── apps/
│   ├── web/                          # Next.js 14 App
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── (app)/
│   │   │   │   ├── dashboard/page.tsx
│   │   │   │   ├── trips/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── [tripId]/page.tsx
│   │   │   │   │   └── [tripId]/map/page.tsx
│   │   │   │   ├── chat/page.tsx
│   │   │   │   ├── budget/[tripId]/page.tsx
│   │   │   │   └── simulate/[tripId]/page.tsx
│   │   │   ├── onboarding/
│   │   │   │   └── page.tsx
│   │   │   ├── api/
│   │   │   │   └── auth/[...nextauth]/route.ts   # optional NextAuth bridge
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx                          # Landing
│   │   ├── components/
│   │   │   ├── ui/                               # shadcn primitives
│   │   │   ├── landing/
│   │   │   ├── auth/
│   │   │   ├── onboarding/
│   │   │   ├── trips/
│   │   │   ├── chat/
│   │   │   ├── map/
│   │   │   ├── budget/
│   │   │   └── simulator/
│   │   ├── lib/
│   │   │   ├── api.ts                            # Axios / fetch client
│   │   │   ├── auth.ts                           # Token management
│   │   │   ├── hooks/
│   │   │   └── utils.ts
│   │   ├── stores/                               # Zustand stores
│   │   │   ├── authStore.ts
│   │   │   ├── tripStore.ts
│   │   │   └── chatStore.ts
│   │   ├── middleware.ts                         # JWT verification at edge
│   │   ├── tailwind.config.ts
│   │   └── next.config.ts
│
├── apps/
│   └── api/                          # FastAPI Backend
│       ├── app/
│       │   ├── main.py
│       │   ├── core/
│       │   │   ├── config.py          # Pydantic Settings
│       │   │   ├── security.py        # JWT / hashing
│       │   │   ├── database.py        # SQLAlchemy async engine
│       │   │   └── redis.py           # Upstash Redis client
│       │   ├── api/v1/
│       │   │   ├── auth.py
│       │   │   ├── users.py
│       │   │   ├── trips.py
│       │   │   ├── itinerary.py
│       │   │   ├── chat.py
│       │   │   └── budget.py
│       │   ├── models/                # SQLAlchemy ORM models
│       │   ├── schemas/               # Pydantic request/response schemas
│       │   ├── services/              # Business logic
│       │   ├── ai/
│       │   │   ├── orchestrator.py    # Voyage Orchestrator
│       │   │   ├── chains/
│       │   │   │   ├── itinerary_chain.py
│       │   │   │   ├── chat_chain.py
│       │   │   │   └── simulation_chain.py
│       │   │   ├── tools/             # LangChain tools
│       │   │   └── memory.py          # Pinecone vector memory
│       │   ├── middleware/
│       │   │   ├── rate_limit.py
│       │   │   └── auth_middleware.py
│       │   └── workers/               # Celery background tasks
│       ├── alembic/                   # DB migrations
│       ├── tests/
│       ├── Dockerfile
│       └── pyproject.toml
│
├── packages/
│   └── shared-types/                  # Shared TS types (optional)
├── turbo.json                         # Turborepo
└── package.json
```

---

## 4. Database Schema

### Users
```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  hashed_pw   TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Travel DNA (Onboarding)
```sql
CREATE TABLE travel_dna (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  travel_style    TEXT[],         -- ["adventure", "luxury", "budget"]
  pace            TEXT,           -- "slow" | "moderate" | "fast"
  interests       TEXT[],         -- ["food", "history", "nature"]
  budget_range    TEXT,           -- "budget" | "mid" | "luxury"
  typical_group   TEXT,           -- "solo" | "couple" | "family" | "group"
  dietary_needs   TEXT[],
  mobility_needs  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Trips
```sql
CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  destination     TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  status          TEXT DEFAULT 'planning', -- planning | active | completed | archived
  cover_image_url TEXT,
  total_budget    NUMERIC(12,2),
  currency        TEXT DEFAULT 'USD',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trips_user_id ON trips(user_id);
```

### Itinerary Days + Activities
```sql
CREATE TABLE itinerary_days (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id  UUID REFERENCES trips(id) ON DELETE CASCADE,
  day_num  INT NOT NULL,
  date     DATE NOT NULL,
  summary  TEXT
);

CREATE TABLE itinerary_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id        UUID REFERENCES itinerary_days(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  start_time    TIME,
  end_time      TIME,
  location_name TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  category      TEXT,             -- "food" | "activity" | "transport" | "accommodation"
  estimated_cost NUMERIC(10,2),
  booking_url   TEXT,
  order_index   INT DEFAULT 0
);
```

### Budget
```sql
CREATE TABLE budget_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID REFERENCES trips(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,        -- "food" | "transport" | "accommodation" | "activity" | "other"
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  currency    TEXT DEFAULT 'USD',
  date        DATE,
  receipt_url TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Chat Messages
```sql
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES trips(id) ON DELETE SET NULL,
  role        TEXT NOT NULL,        -- "user" | "assistant"
  content     TEXT NOT NULL,
  metadata    JSONB,                -- tool calls, citations, etc.
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_user_trip ON chat_messages(user_id, trip_id, created_at DESC);
```

### Refresh Tokens
```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,  -- hashed, never store raw
  family      UUID NOT NULL,         -- for token rotation / reuse detection
  is_revoked  BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ip_address  INET,
  user_agent  TEXT
);
```

---

## 5. API Route Definitions

### Auth — `/api/v1/auth`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `POST` | `/register` | Create user account | ❌ |
| `POST` | `/login` | Return access + set refresh cookie | ❌ |
| `POST` | `/refresh` | Rotate refresh token, return new access | ❌ (cookie) |
| `POST` | `/logout` | Revoke refresh token family | ✅ |
| `POST` | `/logout-all` | Revoke all sessions | ✅ |
| `POST` | `/verify-email` | Verify email token | ❌ |

### Users — `/api/v1/users`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/me` | Get current user profile | ✅ |
| `PATCH` | `/me` | Update profile | ✅ |
| `PUT` | `/me/dna` | Upsert Travel DNA | ✅ |
| `GET` | `/me/dna` | Get Travel DNA | ✅ |
| `DELETE` | `/me` | Delete account (GDPR) | ✅ |

### Trips — `/api/v1/trips`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | List user trips (paginated) | ✅ |
| `POST` | `/` | Create trip | ✅ |
| `GET` | `/{tripId}` | Get trip detail | ✅ |
| `PATCH` | `/{tripId}` | Update trip metadata | ✅ |
| `DELETE` | `/{tripId}` | Soft-delete trip | ✅ |
| `POST` | `/{tripId}/duplicate` | Clone a trip | ✅ |

### Itinerary — `/api/v1/trips/{tripId}/itinerary`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | Get full itinerary | ✅ |
| `POST` | `/generate` | AI generate itinerary (SSE stream) | ✅ |
| `PUT` | `/days/{dayId}` | Update day summary | ✅ |
| `POST` | `/days/{dayId}/activities` | Add activity | ✅ |
| `PATCH` | `/activities/{actId}` | Update activity | ✅ |
| `DELETE` | `/activities/{actId}` | Remove activity | ✅ |
| `POST` | `/activities/reorder` | Drag-and-drop reorder | ✅ |

### Chat — `/api/v1/chat`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/history` | Get conversation history | ✅ |
| `POST` | `/message` | Send message, stream response (SSE) | ✅ |
| `DELETE` | `/history` | Clear chat history | ✅ |

### Budget — `/api/v1/trips/{tripId}/budget`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | Get all budget items + summary | ✅ |
| `POST` | `/` | Add budget item | ✅ |
| `PATCH` | `/{itemId}` | Update budget item | ✅ |
| `DELETE` | `/{itemId}` | Remove budget item | ✅ |
| `GET` | `/summary` | Category breakdown + vs-plan delta | ✅ |

### Simulation — `/api/v1/trips/{tripId}/simulate`
| Method | Path | Description | Auth Required |
|---|---|---|---|
| `POST` | `/` | Generate simulation (AI + weather + cost) | ✅ |
| `GET` | `/{simId}` | Get simulation result | ✅ |

---

## 6. Authentication Flow

### 6a. Email/Password + JWT (with refresh rotation)

```mermaid
sequenceDiagram
    participant C as Client (Browser)
    participant MW as Next.js Middleware
    participant API as FastAPI
    participant DB as PostgreSQL

    Note over C,DB: Email/Password Login
    C->>API: POST /auth/login {email, password}
    API->>DB: Verify hashed_pw (bcrypt)
    API->>DB: Create refresh_token row (hashed + family UUID)
    API-->>C: { access_token } + Set-Cookie: refresh_token (httpOnly, Secure, SameSite=Strict)

    Note over C,DB: Authenticated Request
    C->>MW: GET /dashboard (Authorization: Bearer <access_token>)
    MW->>MW: Verify JWT signature + expiry — no DB call
    MW-->>C: Allow or Redirect /login

    Note over C,DB: Token Reuse Attack
    C->>API: POST /auth/refresh (replayed revoked token)
    API->>DB: token_hash found, is_revoked=TRUE
    API->>DB: Revoke ENTIRE token family
    API-->>C: 401 — all sessions logged out
```

### 6b. Google SSO Flow (OAuth 2.0 / PKCE)

```mermaid
sequenceDiagram
    participant C as Client (Browser)
    participant API as FastAPI
    participant G as Google OAuth
    participant DB as PostgreSQL

    C->>API: GET /auth/google/login
    API-->>C: Redirect → Google consent screen (with state + PKCE code_challenge)
    C->>G: User approves scopes (email, profile)
    G-->>C: Redirect to /auth/google/callback?code=xxx&state=yyy
    C->>API: GET /auth/google/callback?code=xxx
    API->>G: Exchange code → { id_token, access_token }
    API->>G: Verify id_token signature (Google JWKS)
    API->>DB: UPSERT user WHERE google_id = sub (create if new, link if existing email)
    API->>DB: Create refresh_token (same family mechanism)
    API-->>C: { access_token } + Set-Cookie: refresh_token
    note over C: User is now fully logged in — same JWT flow as email/password
```

**Key SSO rules:**
- If email already exists (email/password account) → **auto-link** Google provider to existing account
- `users` table gains `google_id TEXT UNIQUE` + `auth_provider TEXT[]` columns
- **No separate password required** for Google-SSO users (`hashed_pw` is NULL)
- Existing JWT/refresh rotation flow is **identical** post-SSO — no special handling needed downstream

**New API routes needed:**
| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google/login` | Generate OAuth URL + PKCE, redirect |
| `GET` | `/auth/google/callback` | Exchange code, upsert user, issue tokens |

**Token Configuration:**
- **Access token:** JWT, 15-minute TTL, RS256 signed
- **Refresh token:** 30-day TTL, stored hashed (SHA-256) in DB
- **Rotation:** Single-use; each refresh issues a new pair
- **Family tracking:** Replayed revoked token → entire family revoked (all devices)

---

## 7. AI Orchestration Design

```mermaid
graph LR
    UserReq[User Request] --> Orch[Voyage Orchestrator]
    Orch --> Classifier{Intent Classifier}
    
    Classifier -->|itinerary gen| IChain[Itinerary Chain]
    Classifier -->|chat / Q&A| CChain[Chat Chain]
    Classifier -->|simulation| SChain[Simulation Chain]
    
    IChain --> Tools[LangChain Tools]
    CChain --> Memory[Pinecone Vector Memory]
    SChain --> WeatherAPI[Weather API]
    
    Tools --> PlacesAPI[Google Places API]
    Tools --> FlightAPI[Amadeus Flight API]
    Tools --> WebSearch[Tavily Web Search]
    
    IChain --> LLM["Groq LLaMA-3.3-70b"]
    CChain --> LLM
    SChain --> LLM
    LLM -->|quota exceeded / error| Fallback["Gemini 1.5 Flash"]
    
    LLM -->|stream| SSE[SSE Response]
    Fallback -->|stream| SSE
    SSE --> Client[Browser]
```

### LLM Stack — Groq Primary + Gemini Fallback

| Role | Provider | Model | Why |
|---|---|---|---|
| **Primary** | Groq | `llama-3.3-70b-versatile` | ~300 tok/s, near-zero latency, generous free tier |
| **Fallback** | Google Gemini | `gemini-1.5-flash` | 1M context, reliable, cheap at scale |

```python
# apps/api/app/ai/llm_factory.py
class LLMFactory:
    """Returns LangChain-compatible LLM. Falls back to Gemini on Groq errors."""

    @staticmethod
    def get_llm(streaming: bool = True) -> BaseChatModel:
        try:
            return ChatGroq(
                model="llama-3.3-70b-versatile",
                streaming=streaming,
                temperature=0.7,
                max_retries=2,
            )
        except (GroqError, RateLimitError):
            logger.warning("Groq unavailable — falling back to Gemini")
            return ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                streaming=streaming,
            )
```

### Voyage Orchestrator (`orchestrator.py`)
```python
class VoyageOrchestrator:
    """
    Routes user intents to the correct LangChain chain.
    Injects user Travel DNA + trip context into system prompt.
    Handles streaming via SSE.
    """
    async def run(
        self, 
        intent: str, 
        user_dna: TravelDNA, 
        trip_context: Trip | None,
        message: str,
        stream: bool = True
    ) -> AsyncGenerator[str, None]: ...
```

### LangChain Chains

| Chain | Description | Tools Available |
|---|---|---|
| `ItineraryChain` | Generates full day-by-day itinerary from trip metadata + DNA | Google Places, Amadeus, Tavily |
| `ChatChain` | Conversational AI companion with trip context | **Supabase pgvector** retrieval, Google Places |
| `SimulationChain` | Simulates trip: weather forecasts, cost estimates, alternatives | OpenWeather API, Amadeus |

### Why pgvector over Pinecone (Decision Log)

Research verdict: **pgvector wins** for your setup.

| Factor | pgvector (Supabase) | Pinecone |
|---|---|---|
| Cost | ✅ Free (already in your DB) | Free tier limited (1 index, 2GB) |
| Complexity | ✅ Zero — same Postgres, same connection string | Extra SDK, extra API key, extra service |
| SQL joins | ✅ Vector search + relational filters in one query | ❌ No SQL, needs separate fetch |
| Supabase support | ✅ First-class, official AI toolkit | ❌ External |
| Scale ceiling | 10M+ vectors (HNSW index) | Unlimited (managed) |
| When to switch | Only if >10M vectors AND latency SLAs are sub-10ms | — |

```sql
-- pgvector: semantic search on chat memory (LangChain compatible)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  trip_id    UUID REFERENCES trips(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  embedding  VECTOR(1536),        -- OpenAI / Groq embedding dimensions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast ANN search
CREATE INDEX idx_embeddings_hnsw 
  ON embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 8. Security Model

| Threat | Mitigation |
|---|---|
| **XSS** | httpOnly refresh cookies; CSP headers via `next.config.ts` |
| **CSRF** | `SameSite=Strict` cookies; custom header check (`X-Requested-With`) |
| **SQL Injection** | SQLAlchemy ORM params only; no raw string interpolation |
| **IDOR** | All queries filter by `user_id` (extracted from JWT, not from request body) |
| **Token Theft** | Short-lived access tokens (15min); rotating refresh tokens with family tracking |
| **Mass Assignment** | Pydantic schemas explicitly declare allowed fields per endpoint |
| **Secrets** | env vars only; never committed; Vercel + Railway environment management |
| **Input Validation** | Pydantic v2 strict mode on all request schemas |
| **AI Prompt Injection** | System prompt hardening; user input html-escaped before injection |
| **GDPR** | `/users/me DELETE` endpoint fully wipes all user data + cascades |

### Security Headers (`next.config.ts`)
```ts
headers: [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; ..." },
]
```

---

## 9. Rate Limiting Strategy

**Library:** `slowapi` (FastAPI) backed by Upstash Redis

### Tiers

| Endpoint Group | Limit | Window | Strategy |
|---|---|---|---|
| `/auth/login` | 5 requests | 15 min per IP | Fixed window + lockout |
| `/auth/register` | 3 requests | 1 hour per IP | Fixed window |
| `/auth/refresh` | 20 requests | 1 hour per user | Sliding window |
| `/chat/message` | 30 requests | 1 hour per user | Sliding window |
| `/itinerary/generate` | 10 requests | 24 hours per user | Sliding window |
| All other API | 200 requests | 1 min per user | Token bucket |

### Implementation
```python
# Redis sliding window (pseudo)
async def check_rate_limit(key: str, limit: int, window_secs: int) -> bool:
    now = time.time()
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_secs)
    pipe.zadd(key, {str(now): now})
    pipe.zcard(key)
    pipe.expire(key, window_secs)
    results = await pipe.execute()
    count = results[2]
    return count <= limit
```

**Headers returned on limit:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708890000
Retry-After: 3600
```

---

## 10. Docker & Containerization

### Philosophy
- **Every service runs in a container** — frontend build, backend API, workers, local dependencies
- **Multi-stage Dockerfiles** — build stage is never shipped to production
- **Minimal attack surface** — non-root user, distroless/slim base images, read-only filesystem where possible
- **Layer cache optimized** — dependencies installed before source code copy
- **12-Factor compliant** — all config via environment variables, no secrets baked into images

---

### Backend Dockerfile (`apps/api/Dockerfile`)

```dockerfile
# ── Stage 1: Builder ──────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools (not carried into final image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast pip replacement)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install deps first (cache layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ── Stage 2: Runtime ─────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Security: non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser

WORKDIR /app

# Copy only the venv, not the whole build env
COPY --from=builder /build/.venv /app/.venv

# Copy application source
COPY --chown=appuser:appgroup ./app ./app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

**Key practices:**
- 2-stage build keeps final image ~180MB vs ~900MB with dev tools
- `uv` resolves deps 10–100× faster than pip
- Non-root UID 1001 — never run as root in production
- `PYTHONDONTWRITEBYTECODE` + `PYTHONUNBUFFERED` prevent `.pyc` files and log buffering

---

### Frontend Dockerfile (`apps/web/Dockerfile`)

```dockerfile
# ── Stage 1: Deps ────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ── Stage 2: Builder ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── Stage 3: Runner (standalone Next.js output) ──────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --gid 1001 nodejs && \
    adduser --uid 1001 --ingroup nodejs --disabled-password nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

> [!TIP]
> Next.js `output: 'standalone'` in `next.config.ts` bundles only what's needed — final image drops from ~1GB to ~150MB.

---

### Docker Compose — Local Development (`docker-compose.yml`)

```yaml
version: '3.9'

services:
  # PostgreSQL (local dev only — use Supabase in staging/prod)
  postgres:
    image: postgres:16-alpine
    container_name: voyageai_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: voyageai
      POSTGRES_PASSWORD: voyage_dev_pw
      POSTGRES_DB: voyageai_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U voyageai']
      interval: 10s
      retries: 5

  # Redis (Upstash in prod)
  redis:
    image: redis:7-alpine
    container_name: voyageai_redis
    restart: unless-stopped
    command: redis-server --requirepass voyage_redis_pw
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s

  # FastAPI Backend
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: runtime             # use runtime stage only
    container_name: voyageai_api
    restart: unless-stopped
    env_file: ./apps/api/.env.local
    environment:
      DATABASE_URL: postgresql+asyncpg://voyageai:voyage_dev_pw@postgres:5432/voyageai_dev
      REDIS_URL: redis://:voyage_redis_pw@redis:6379/0
    ports:
      - '8000:8000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./apps/api/app:/app/app   # hot-reload in dev only
      - uploads_data:/app/uploads  # local asset storage (dev)

  # Next.js Frontend
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      target: runner
    container_name: voyageai_web
    restart: unless-stopped
    env_file: ./apps/web/.env.local
    environment:
      NEXT_PUBLIC_API_URL: http://api:8000
    ports:
      - '3000:3000'
    depends_on:
      - api

  # Celery Worker (background tasks: itinerary generation)
  worker:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
      target: runtime
    container_name: voyageai_worker
    restart: unless-stopped
    command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
    env_file: ./apps/api/.env.local
    environment:
      DATABASE_URL: postgresql+asyncpg://voyageai:voyage_dev_pw@postgres:5432/voyageai_dev
      REDIS_URL: redis://:voyage_redis_pw@redis:6379/0
    depends_on:
      - redis
      - postgres

  # Flower (Celery monitoring UI — dev only)
  flower:
    image: mher/flower:2.0
    container_name: voyageai_flower
    environment:
      CELERY_BROKER_URL: redis://:voyage_redis_pw@redis:6379/0
    ports:
      - '5555:5555'
    depends_on:
      - redis
    profiles: ['debug']           # only starts with: docker compose --profile debug up

volumes:
  postgres_data:
  uploads_data:         # local file storage (mirrors S3 interface)
```

**Usage:**
```bash
# Start all services
docker compose up -d

# Start with debug tools (Flower)
docker compose --profile debug up -d

# Run DB migrations
docker compose exec api alembic upgrade head

# View logs
docker compose logs -f api

# Teardown
docker compose down -v    # -v removes volumes (wipes DB)
```

---

### `.dockerignore` (Backend)
```
**/__pycache__
**/*.pyc
.git
.env*
!.env.example
tests/
alembic/versions/    # migrations run separately
*.md
.venv
```

### `.dockerignore` (Frontend)
```
node_modules
.next
.git
.env*
!.env.example
*.md
coverage
```

---

### Container Security Hardening

| Practice | Applied Where |
|---|---|
| Non-root user (UID 1001) | All app containers |
| Read-only root filesystem | API + Web (via `read_only: true` in compose) |
| No privileged mode | All containers |
| No new privileges flag | `security_opt: no-new-privileges:true` |
| Image vulnerability scanning | GitHub Actions → `docker scout cves` on every PR |
| Signed images | Docker Content Trust enabled in CI |
| Secret injection | Docker secrets / env files, never baked in |
| Distroless consideration | Switch API base to `gcr.io/distroless/python3` post-MVP |

---

### Image Size Targets

| Service | Base Image | Final Size Target |
|---|---|---|
| `voyageai-api` | python:3.12-slim | ~180 MB |
| `voyageai-web` | node:20-alpine (standalone) | ~150 MB |
| `voyageai-worker` | same as api | ~180 MB |

---

## 11. Deployment Strategy — 100% Free on Vercel

> [!IMPORTANT]
> **Zero cost strategy.** Frontend = one Vercel project. Backend = second Vercel project running FastAPI as Python Serverless Functions. Both on the Vercel Hobby plan (free forever). No Railway, no credit card needed.

---

### How FastAPI runs on Vercel (the student hack)

Vercel supports Python runtime natively. You create an `api/` folder in the backend project with a single entry file and a `vercel.json` that rewrites all routes to your FastAPI app.

**`apps/api/vercel.json`**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "app/main.py",
      "use": "@vercel/python",
      "config": { "maxLambdaSize": "50mb" }
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "app/main.py" }
  ]
}
```

**`apps/api/app/main.py`** — expose the FastAPI `app` object at module level (Vercel imports it directly):
```python
from fastapi import FastAPI
from mangum import Mangum   # ASGI → AWS Lambda / Vercel adapter

app = FastAPI(title="VoyageAI API")

# ... include all routers ...

# Vercel entry point
handler = Mangum(app, lifespan="off")
```

> [!TIP]
> `mangum` is the bridge between ASGI (FastAPI) and serverless function handlers. It's the standard solution used by thousands of student projects and startups on Vercel/AWS Lambda.

---

### Project Structure on Vercel

```
Vercel Account (free Hobby)
├── Project 1: voyageai-web        → voyageai.vercel.app (or custom domain)
│     Source: apps/web/
│     Framework: Next.js
│     Runtime: Node.js 20.x
│
└── Project 2: voyageai-api        → voyageai-api.vercel.app
      Source: apps/api/
      Framework: Other (Python)
      Runtime: @vercel/python
      Entry: app/main.py
```

**Frontend calls backend via env var:**
```bash
# apps/web/.env.production
NEXT_PUBLIC_API_URL=https://voyageai-api.vercel.app
```

**CORS config in FastAPI — only allow your frontend origin:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://voyageai.vercel.app",
        "http://localhost:3000",           # local dev
    ],
    allow_credentials=True,               # required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Serverless Cold Start Mitigation

Vercel serverless functions have cold starts (~400–800ms on first request). Mitigations:

| Technique | How |
|---|---|
| Lazy imports | Move heavy imports (`langchain`, `pinecone`) inside route handlers, not top-level |
| Keep DB connections warm | Use `asyncpg` connection pool with `min_size=1` |
| Vercel Fluid Compute | Enable in Vercel dashboard — keeps functions warm between requests |
| Skip Celery on Vercel | Celery workers can't run on serverless. Use **background tasks** (`BackgroundTasks` in FastAPI) for short jobs, or trigger async jobs via Supabase Edge Functions for long-running AI generation |

> [!WARNING]
> Vercel serverless functions have a **60-second execution timeout** on the free Hobby plan. AI itinerary generation can be slow — use **SSE streaming** so the response starts immediately and tokens stream to the client within the timeout window. Never wait for the full LLM response before returning.

---

### CI/CD — GitHub Actions (Free)
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_API_PROJECT_ID }}
          working-directory: ./apps/api
          vercel-args: '--prod'

  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_WEB_PROJECT_ID }}
          working-directory: ./apps/web
          vercel-args: '--prod'
```

---

### Environment Separation
| Environment | Frontend | Backend | DB |
|---|---|---|---|
| **Development** | `localhost:3000` | `localhost:8000` | Local Docker Postgres |
| **Preview** | Vercel preview URL | Vercel preview URL | Supabase dev project |
| **Production** | `voyageai.vercel.app` | `voyageai-api.vercel.app` | Supabase prod project |

> [!NOTE]
> Docker Compose is for **local development only**. Vercel handles all cloud deployments. Supabase + Upstash are external managed services — no containers needed in the cloud.

---

## 11b. 💸 Complete Free-Tier Stack (Zero Cost)

Every service below has a **permanently free tier** — no credit card surprise bills.

| Service | What It Does | Free Tier Limit | Link |
|---|---|---|---|
| **Vercel** (×2 projects) | Frontend + Backend hosting | 100GB bandwidth/mo, 100K function invocations/mo | vercel.com |
| **Supabase** | PostgreSQL + Auth (Google SSO built-in!) | 500MB DB, 50K MAU auth, 2 projects | supabase.com |
| **Upstash Redis** | Rate limiting + caching | 10,000 commands/day, 256MB | upstash.com |
| **Groq** | Primary LLM (LLaMA 3.3) | 14,400 requests/day, 30 req/min | console.groq.com |
| **Google Gemini API** | LLM Fallback | 1,500 requests/day, 1M tokens/min | ai.google.dev |
| **Pinecone** | Vector memory | 1 index, 2GB free (serverless) | pinecone.io |
| **Mapbox** | Map view | 50,000 map loads/month | mapbox.com |
| **Sentry** | Error monitoring | 5,000 errors/month | sentry.io |
| **GitHub Actions** | CI/CD | 2,000 min/month (public repos: unlimited) | github.com |
| **Google OAuth** | SSO provider | Free forever | console.cloud.google.com |

**Monthly cost: $0.00** ✅

> [!TIP]
> **Pro-tip on Supabase Auth:** Supabase has Google OAuth built directly into its Auth module. You can use Supabase Auth for the Google SSO flow (it handles the OAuth dance, token exchange, and user UPSERT automatically) and still use your own FastAPI JWT system for app-level auth. This saves you ~100 lines of OAuth boilerplate.

---

## 12. Cloud Scalability & Migration Path (AWS / DigitalOcean)

> [!IMPORTANT]
> Every architectural decision in this plan is made to be **cloud-agnostic and horizontally scalable**. The current Railway + Vercel stack is the **MVP launchpad** only. Migration to AWS or DigitalOcean requires zero code changes — only infrastructure changes.

---

### Scalability Principles Applied Throughout

| Principle | How It's Applied |
|---|---|
| **Stateless API servers** | JWT auth — no server-side session; any pod handles any request |
| **Externalized state** | DB (Postgres), cache (Redis), files (volume/S3) are always external to app containers |
| **Storage abstraction** | `StorageBackend` interface: swap local volume → S3 with one env var |
| **DB connection pooling** | SQLAlchemy async + PgBouncer (added at scale) |
| **Queue-based workers** | Celery + Redis broker — workers scale independently of API pods |
| **12-Factor config** | All config via env vars — no hardcoded infra assumptions |
| **Health endpoints** | `GET /health` + `GET /ready` on every service for load balancer probes |
| **Structured logging** | JSON logs via `loguru` — ingested by any log aggregator (CloudWatch, Loki, Datadog) |
| **OpenTelemetry traces** | Instrumented from day 1 — plug in any APM (Datadog, Grafana Tempo) |

---

### Storage Backend Abstraction

```python
# apps/api/app/core/storage.py
from abc import ABC, abstractmethod

class StorageBackend(ABC):
    @abstractmethod
    async def upload(self, key: str, data: bytes, content_type: str) -> str: ...
    @abstractmethod
    async def get_url(self, key: str) -> str: ...
    @abstractmethod
    async def delete(self, key: str) -> None: ...

class LocalStorageBackend(StorageBackend):
    """Writes to /app/uploads — mounted as Docker volume in dev."""
    BASE_PATH = Path("/app/uploads")
    async def upload(self, key, data, content_type) -> str:
        path = self.BASE_PATH / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"/uploads/{key}"

class S3StorageBackend(StorageBackend):
    """Drop-in for AWS S3, Cloudflare R2, DigitalOcean Spaces — all S3-compatible."""
    def __init__(self): self.client = boto3.client("s3", ...)
    async def upload(self, key, data, content_type) -> str: ...

def get_storage() -> StorageBackend:
    if settings.STORAGE_BACKEND == "s3":
        return S3StorageBackend()
    return LocalStorageBackend()   # default in dev
```

**Migration to cloud storage = set `STORAGE_BACKEND=s3` + bucket credentials. Zero code changes.**

---

### Target Cloud Architectures

#### Option A — AWS (Enterprise scale)

```mermaid
graph TB
    subgraph CF["CloudFront CDN"]
        CFD[Edge Cache]
    end
    subgraph ALB["Application Load Balancer"]
        LB[ALB + WAF]
    end
    subgraph ECS["AWS ECS Fargate (auto-scale)"]
        API1[API Pod 1]
        API2[API Pod 2]
        APIx[API Pod N...]
        W1[Worker Pod 1]
        W2[Worker Pod 2]
    end
    subgraph Data["Managed Data Layer"]
        RDS["RDS Aurora PostgreSQL (Multi-AZ)"]
        EC["ElastiCache Redis (Cluster Mode)"]
        S3B["S3 Bucket (assets)"]
    end
    subgraph Obs["Observability"]
        CW[CloudWatch Logs]
        XR[X-Ray Traces]
    end

    CF --> LB
    LB --> API1 & API2 & APIx
    API1 & API2 & APIx --> RDS & EC & S3B
    W1 & W2 --> RDS & EC
    API1 --> CW & XR
```

| AWS Service | Replaces | Notes |
|---|---|---|
| ECS Fargate | Railway containers | Auto-scaling, no server management |
| RDS Aurora PostgreSQL | Supabase | Multi-AZ, automated failover |
| ElastiCache Redis | Upstash | Cluster mode, 99.99% SLA |
| S3 | Local volume | Set `STORAGE_BACKEND=s3` |
| ALB + WAF | Vercel edge | DDoS protection, IP filtering |
| CloudFront | Vercel CDN | Global edge caching |
| ECR | Docker Hub | Private image registry |
| CloudWatch + X-Ray | Sentry + Logfire | Full observability |
| Secrets Manager | Railway env vars | Rotation, audit trail |

#### Option B — DigitalOcean (Cost-optimised)

| DO Service | Replaces | Notes |
|---|---|---|
| App Platform / Kubernetes (DOKS) | Railway | Managed K8s, cheaper than EKS |
| Managed PostgreSQL | Supabase | DO-native, easy backups |
| Managed Redis | Upstash | DO-native |
| Spaces (S3-compatible) | Local volume | Set `STORAGE_BACKEND=s3` + DO endpoint |
| Load Balancer | Railway routing | Health-check based |
| Container Registry | Docker Hub | Private, cheap |

---

### Kubernetes Migration Path (Post-MVP)

When traffic justifies it, move from Railway → DOKS (DigitalOcean) or EKS (AWS):

```yaml
# k8s/api-deployment.yaml (illustrative)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voyageai-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: voyageai-api }
  template:
    metadata:
      labels: { app: voyageai-api }
    spec:
      containers:
      - name: api
        image: registry/voyageai-api:latest
        resources:
          requests: { cpu: "250m", memory: "512Mi" }
          limits:   { cpu: "1",    memory: "1Gi" }
        readinessProbe:
          httpGet: { path: /ready, port: 8000 }
        livenessProbe:
          httpGet: { path: /health, port: 8000 }
        envFrom:
        - secretRef: { name: voyageai-secrets }  # from Secrets Manager
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: voyageai-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: voyageai-api
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target: { type: Utilization, averageUtilization: 70 }
```

---

### Scaling Milestones

| Traffic Level | Architecture | Approximate Cost/mo |
|---|---|---|
| 0–1K users | Railway + Vercel + Supabase + Upstash | ~$20–50 |
| 1K–10K users | Above + vertical scale, connection pooling | ~$50–150 |
| 10K–100K users | Migrate API to ECS/DOKS, Redis cluster, RDS read replicas | ~$300–800 |
| 100K+ users | Full K8s, CDN for assets, DB sharding consideration | $1K+ |

---

### Observability Stack (Production-Ready)

```
Metrics:  Prometheus + Grafana (self-hosted) OR Datadog
Logs:     Structured JSON → CloudWatch / Grafana Loki
Traces:   OpenTelemetry → Grafana Tempo / AWS X-Ray
Alerts:   PagerDuty / Opsgenie integration
Uptime:   Checkly or Better Uptime (synthetic monitoring)
Errors:   Sentry (already in tech stack)
```

---

## 13. 📈 Growth Tiers & Paid Launch Strategy

> The architecture is already built to support this progression. Moving between tiers is **infrastructure-only** — no code rewrites.

---

### Tier Progression

```
Tier 0: $0/mo    ── Student Launch (Current)     → Vercel + Supabase + free APIs
Tier 1: ~$50/mo  ── Indie Launch                 → Custom domain + paid Supabase + Vercel Pro
Tier 2: ~$200/mo ── Growth Stage                 → DigitalOcean App Platform + managed DB
Tier 3: ~$800/mo ── Scale Stage                  → AWS ECS Fargate + Aurora + CloudFront
Tier 4: Custom   ── Enterprise                   → Multi-region AWS, dedicated infra
```

---

### Tier 1 — Indie Launch (~$50/month) 🚀

*First revenue. First real users. Look professional.*

| What | Service | Est. Cost |
|---|---|---|
| **Custom domain** | Namecheap / Cloudflare Registrar | $8–14/year |
| **DNS + DDoS protection** | Cloudflare (free plan) | $0 |
| **SSL/TLS** | Cloudflare auto-SSL (Let's Encrypt) | $0 |
| **Frontend** | Vercel Pro | $20/mo |
| **Backend** | Vercel Pro (same account) | included |
| **Database** | Supabase Pro | $25/mo |
| **Redis** | Upstash Pay-as-you-go | ~$0–5/mo |
| **Email** | Resend (free tier: 3K emails/mo) | $0 |
| **Total** | | **~$45–60/mo** |

**Domain Strategy at Tier 1:**
```
voyageai.app          → Main app (Vercel)
api.voyageai.app      → Vercel backend project (CNAME to vercel backend)
www.voyageai.app      → Redirect to apex
```
> Configure via Cloudflare DNS. Vercel auto-provisions SSL for custom domains.

---

### Tier 2 — Growth Stage (~$200/month) 📈

*Consistent revenue. Need reliability, faster cold starts gone.*

| What | Service | Est. Cost |
|---|---|---|
| **Frontend** | Vercel Pro (keep) | $20/mo |
| **Backend** | **DigitalOcean App Platform** (Basic ×2 containers) | $24/mo |
| **Database** | **DO Managed PostgreSQL** (1GB RAM, 25GB) | $15/mo |
| **Redis** | **DO Managed Redis** (1GB) | $15/mo |
| **CDN** | Cloudflare Pro | $20/mo |
| **Object Storage** | DO Spaces (250GB) | $5/mo |
| **Monitoring** | Better Uptime + Sentry Team | $20/mo |
| **Email** | Resend Starter | $20/mo |
| **Domain** | Cloudflare Registrar | ~$1/mo |
| **Total** | | **~$120–180/mo** |

**Why DigitalOcean at Tier 2?**
- Predictable flat pricing (no AWS bill shock)
- App Platform handles Docker deploys without Kubernetes complexity
- Managed Postgres + Redis: backups, failover, monitoring built in
- `STORAGE_BACKEND=s3` + DO Spaces endpoint = local files → cloud with 1 env var change

**Architecture at Tier 2:**
```mermaid
graph LR
    CF["Cloudflare CDN + WAF"] --> Vercel["Vercel (Next.js)"]
    CF --> DO["DO App Platform (FastAPI)"]
    DO --> DOPG["DO Managed PostgreSQL"]
    DO --> DOR["DO Managed Redis"]
    DO --> DOS["DO Spaces (S3)"]
    Vercel --> DO
```

---

### Tier 3 — Scale Stage (~$800/month) ⚡

*Product-market fit confirmed. Thousands of users. Needs SLA.*

| What | AWS Service | Est. Cost |
|---|---|---|
| **Frontend** | Vercel Enterprise OR S3 + CloudFront | $50–400/mo |
| **Backend** | **ECS Fargate** (2 tasks, auto-scale to 10) | $80–200/mo |
| **Database** | **RDS Aurora PostgreSQL** (Multi-AZ, 2 vCPU) | $150–250/mo |
| **Cache** | **ElastiCache Redis** (r6g.large cluster) | $80–120/mo |
| **CDN** | **CloudFront** + WAF | $20–50/mo |
| **Storage** | **S3** (100GB assets) | $5/mo |
| **Secrets** | **AWS Secrets Manager** | $5–10/mo |
| **Monitoring** | **CloudWatch + Datadog** | $50–150/mo |
| **Email** | **AWS SES** ($0.10/1K emails) | $10–30/mo |
| **Total** | | **~$500–1,100/mo** |

**AWS Decision Matrix:**

| Service | Choose AWS if... | Choose DO instead if... |
|---|---|---|
| Compute | Need >10 auto-scaling pods, global regions | Single region, simple autoscale |
| DB | Need Multi-AZ failover, read replicas | Single-region is fine |
| Storage | Need lifecycle policies, versioning, Glacier archival | Simple static file storage |
| CDN | Need Lambda@Edge, advanced routing rules | Cloudflare Pro handles it |

**Migration Steps (Tier 2 → Tier 3):**
1. Push Docker image to **ECR** (replaces DO Container Registry)
2. Create ECS cluster + task definition (use existing Dockerfile, zero changes)
3. Swap `DATABASE_URL` to RDS Aurora endpoint
4. Swap `REDIS_URL` to ElastiCache endpoint
5. Set `STORAGE_BACKEND=s3` + `AWS_BUCKET_NAME`
6. Point Route 53 to ALB; CloudFront distribution in front
7. Migrate secrets from env vars → Secrets Manager

**Zero code changes. Pure infra swap.**

---

### Tier 4 — Enterprise (Custom Pricing) 🏢

| Capability | Implementation |
|---|---|
| Multi-region active-active | Aurora Global Database + CloudFront geo-routing |
| 99.99% SLA | Multi-AZ ECS + RDS failover + Route 53 health checks |
| SOC 2 / GDPR compliance | AWS Config + CloudTrail + GuardDuty |
| Enterprise SSO | SAML 2.0 via AWS IAM Identity Center |
| Dedicated tenancy | VPC isolation per enterprise customer |
| Custom domain per tenant | Wildcard SSL + per-tenant subdomains |

---

### Domain & Brand Setup (Tier 1+)

**Recommended registrar:** Cloudflare Registrar (at-cost pricing, no markup)

```
Buy: voyageai.app  (or .io / .co)
Register these too if available (brand protection):
  voyageai.com, voyageai.net, getvoyageai.com

DNS Setup (Cloudflare):
  voyageai.app          A      76.76.21.21     (Vercel IP)
  api.voyageai.app      CNAME  cname.vercel-dns.com
  www.voyageai.app      CNAME  voyageai.app    (redirect)
```

**SSL:** Cloudflare Universal SSL = auto-provisioned, auto-renewed, free at all tiers

---

### Email Infrastructure

| Tier | Service | Free Limit | Cost |
|---|---|---|---|
| 0 (student) | Resend | 3,000/month | $0 |
| 1–2 (indie/growth) | Resend Starter | 50,000/month | $20/mo |
| 3+ (scale) | AWS SES | No limit | $0.10/1,000 |

Emails needed: verification, password reset, trip share, weekly digest

---

### Summary: When to Move Between Tiers

| Signal | Action |
|---|---|
| Vercel free limits hit (100K invocations/mo) | Upgrade to Vercel Pro |
| Supabase free DB is 80% full (400MB) | Upgrade to Supabase Pro |
| Cold starts hurting UX consistently | Move backend to DO App Platform (Tier 2) |
| Monthly revenue > $500 | Move to Tier 2 full stack |
| Monthly revenue > $3,000 | Begin Tier 3 AWS migration |
| Funding raised / enterprise customers | Tier 4 |

| # | Decision | Status | Notes |
|---|---|---|---|
| 1 | Next.js 14 App Router | ✅ **Locked** | App Router, RSC, streaming |
| 2 | Vercel Serverless Python (2nd project) | ✅ **Locked** | Free Hobby plan, `mangum` adapter |
| 3 | ~~Pinecone~~ → **Supabase pgvector** | ✅ **Locked** | Same DB, HNSW index, free, SQL joins — see Section 7 |
| 4 | Refresh token + Google SSO | ✅ **Locked** | httpOnly cookie + OAuth 2.0/PKCE |
| 5 | **Turborepo monorepo** | ✅ **Locked** | Single repo, two Vercel projects from subdirs |
| 6 | Groq LLaMA-3.3 + Gemini fallback | ✅ **Locked** | Both free tiers, `LLMFactory` pattern |
| 7 | Mapbox for maps | ✅ **Locked** | 50K loads/month free |
| 8 | FastAPI BackgroundTasks (no Celery on serverless) | ✅ **Locked** | Vercel serverless constraint |
| 9 | Local Docker volume + `StorageBackend` abstraction | ✅ **Locked** | Dev: local volume; prod: 1 env var swap to S3 |
| 10 | Alembic for DB migrations | ✅ **Locked** | Run locally or in CI before deploy |
| 11 | Docker multi-stage builds | ✅ **Locked** | Local dev only; ~180MB images |
| 12 | Docker Compose for local dev | ✅ **Locked** | Postgres + Redis + API + Web |
| 13 | AWS / DO cloud migration path | ✅ **Locked** | Section 12 — ECS Fargate or DOKS |
| 14 | Google SSO via OAuth 2.0 + PKCE | ✅ **Locked** | Section 6b, Supabase Auth handles it |
| 15 | Zero-cost free tier stack | ✅ **Locked** | Section 11b — $0/month |
| 16 | 4-Tier paid growth path | ✅ **Locked** | Section 13 — $0 → $50 → $200 → $800/mo |

---

## ✅ When Ready

Click **"Proceed with Implementation"** to begin scaffolding. Implementation will be done in phases:

1. **Phase 1:** Project scaffold + Auth system  
2. **Phase 2:** Travel DNA onboarding + Trip CRUD  
3. **Phase 3:** AI itinerary generation + Chat companion  
4. **Phase 4:** Map view + Budget tracker  
5. **Phase 5:** Trip simulator + Dashboard  
6. **Phase 6:** Production hardening + Deployment  
