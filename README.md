# VoyageAI

<p align="center">
  <strong>Smart & Simple Trip Planning</strong>
</p>
<p align="center">
  AI-powered travel planning that turns your ideas into complete itineraries in seconds.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React" />
</p>

---

## 📖 About the Project

**VoyageAI** is a full-stack travel planning application that leverages AI to help users create personalized trip itineraries, get packing recommendations, simulate travel scenarios, and chat with an intelligent companion—all in one place. Built with Next.js 16, React 19, and a modern TypeScript stack, it offers a seamless experience from landing page to trip management.

### What Makes It Special

- **Natural language input** — Describe your dream trip in plain English (e.g., "Create a 5-day trip to Bali") and get a full itinerary
- **AI chat companion** — Ask questions, reoptimize plans, and get recommendations within each trip context
- **Interactive Mapbox maps** — Visualize your itinerary with markers, routes, and 3D terrain
- **Travel DNA** — Onboarding captures your preferences (pace, style, budget) for personalized suggestions
- **Flight ticket parsing** — Upload a PDF ticket to auto-create a trip with dates and destination
- **Trip comparison** — Compare two trips side-by-side with AI-powered analysis
- **Shareable trips** — Generate public links to share itineraries with friends

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **AI Itinerary** | Generate day-by-day plans from destination, dates, and travel style |
| **AI Chat** | Trip-specific companion for questions, suggestions, and reoptimization |
| **Smart Packing** | AI-generated packing lists based on destination and duration |
| **Trip Simulation** | Preview scenarios (weather, costs, alternatives) before you go |
| **Interactive Map** | Mapbox-powered map with markers, routes, and 3D terrain |
| **Budget Tracking** | Track spending and compare against your plan |
| **Google OAuth** | Sign in with Google or email/password |
| **Travel DNA** | Onboarding to capture preferences (pace, style, budget) |
| **Flight Ticket Import** | Upload PDF tickets to auto-create trips |
| **Trip Comparison** | Compare two trips with AI analysis |
| **Shareable Links** | Public share tokens for itineraries |
| **Favorites** | Save favorite destinations |
| **Notifications** | In-app notification system |
| **Admin Panel** | User management, AI metrics, image cache control |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **UI** | React 19 |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL (Supabase or any Postgres) |
| **ORM** | Prisma 7 |
| **Auth** | JWT + httpOnly refresh tokens, Google OAuth 2.0 |
| **AI / LLM** | Groq (LLaMA) or Google Gemini |
| **Maps** | Mapbox GL JS |
| **Images** | Pexels, Unsplash |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Framer Motion |
| **State** | Zustand (persisted) |
| **Drag & Drop** | @dnd-kit |
| **Validation** | Zod |
| **Cache / Rate Limit** | Upstash Redis (optional) |

---

## 📁 Project Structure

```
voyageai_1/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # SQL migrations
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login, signup
│   │   ├── (marketing)/       # Landing, about, blog, destinations, etc.
│   │   ├── dashboard/         # Protected app
│   │   │   ├── page.tsx       # Trip list, budget overview, AI suggestions
│   │   │   ├── compare/       # Trip comparison
│   │   │   ├── settings/      # User settings
│   │   │   └── trip/[id]/     # Trip detail + map + AI chat
│   │   ├── admin/             # Admin panel (users, AI metrics)
│   │   ├── share/[token]/     # Public trip sharing
│   │   └── api/               # API routes
│   │       ├── auth/          # Login, register, refresh, Google OAuth, CSRF
│   │       ├── profile/       # GET/PATCH user profile
│   │       ├── trips/         # Trip CRUD, chat, share, from-ticket
│   │       ├── ai/            # Itinerary, packing, reoptimize, simulation, landing, compare, export
│   │       ├── preferences/   # Travel DNA
│   │       ├── favorites/     # Favorite destinations
│   │       ├── notifications/
│   │       └── admin/         # Clear cache, AI metrics
│   ├── components/
│   │   ├── dashboard/         # Dashboard UI, modals, sidebar
│   │   ├── trip/              # Map, itinerary, chat drawer
│   │   ├── marketing/         # Landing page sections
│   │   └── ui/                # Shared UI components
│   ├── lib/                   # Utilities, auth, Prisma, env, API helpers
│   ├── services/              # AI services (chat, packing, simulation, create-trip)
│   ├── stores/                # Zustand (auth store)
│   ├── hooks/                 # useTrips, etc.
│   └── middleware.ts          # CSRF, security headers
├── scripts/                   # clear-image-cache, measure-perf
├── docs/                      # Architecture, audits
└── public/
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** or **pnpm**
- **PostgreSQL** (or [Supabase](https://supabase.com) account)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/voyageai_1.git
cd voyageai_1
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host:5432/voyageai?sslmode=require"
DIRECT_URL="postgresql://user:pass@host:5432/voyageai?sslmode=require"

# ── JWT ─────────────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET="your-64-byte-hex-access-secret"
JWT_REFRESH_SECRET="your-64-byte-hex-refresh-secret"

# ── CSRF ────────────────────────────────────────────────────────────────────
CSRF_SECRET="your-32-byte-hex-csrf-secret"

# ── App ────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# ── Google OAuth ───────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# ── LLM ─────────────────────────────────────────────────────────────────────
LLM_PROVIDER="groq"
GROQ_API_KEY="your-groq-api-key"

# Optional: Gemini fallback
# GEMINI_API_KEY="your-gemini-api-key"
# GEMINI_MODEL="gemini-1.5-flash"

# ── Mapbox ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_MAPBOX_TOKEN="your-mapbox-token"

# ── Pexels (destination images) ────────────────────────────────────────────
PEXELS_API_KEY="your-pexels-api-key"

# ── Optional: Upstash Redis (rate limiting, caching) ────────────────────────
# UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
# UPSTASH_REDIS_REST_TOKEN="your-token"
```

**Development fallbacks:** In dev mode, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CSRF_SECRET` fall back to defaults if unset. Production requires all values.

### 3. Database Setup

```bash
npx prisma generate
npx prisma migrate dev
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 🔌 API Overview

### Auth

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Email/password login |
| `/api/auth/register` | POST | Create account |
| `/api/auth/refresh` | POST | Rotate tokens (httpOnly cookie) |
| `/api/auth/logout` | POST | Revoke session |
| `/api/auth/google` | GET | Google OAuth redirect |
| `/api/auth/google/callback` | GET | OAuth callback |
| `/api/auth/csrf` | GET | Get CSRF token |
| `/api/auth/onboard` | POST | Complete Travel DNA onboarding |

### User

| Route | Method | Description |
|-------|--------|-------------|
| `/api/profile` | GET, PATCH | User profile |
| `/api/preferences` | GET, POST | Travel preferences (DNA) |
| `/api/notifications` | GET | List notifications |
| `/api/notifications/[id]/read` | PATCH | Mark as read |

### Trips

| Route | Method | Description |
|-------|--------|-------------|
| `/api/trips` | GET, POST | List/create trips |
| `/api/trips/[id]` | GET, PATCH, DELETE | Trip CRUD |
| `/api/trips/[id]/chat` | GET | Chat history |
| `/api/trips/[id]/itinerary` | POST | Save itinerary |
| `/api/trips/[id]/share` | POST, DELETE | Create/revoke share link |
| `/api/trips/from-ticket` | POST | Create trip from PDF ticket |

### AI

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ai/landing` | POST | Landing page prompt (create trip, chat, hotel search) |
| `/api/ai/itinerary` | POST | Generate itinerary |
| `/api/ai/packing` | POST | Generate packing list |
| `/api/ai/reoptimize` | POST | Reoptimize itinerary |
| `/api/ai/simulation` | POST | Trip simulation |
| `/api/ai/chat` | POST | AI chat (streaming) |
| `/api/ai/compare` | POST | Compare two trips |
| `/api/ai/create-trip` | POST | Create trip with params |
| `/api/ai/create-trip-from-text` | POST | Create trip from natural language |
| `/api/ai/extract-ticket` | POST | Extract data from ticket PDF |
| `/api/ai/export` | POST | Export trip (e.g. PDF) |

### Other

| Route | Method | Description |
|-------|--------|-------------|
| `/api/favorites` | GET, POST, DELETE | Favorite destinations |
| `/api/suggestions` | GET | AI destination suggestions |
| `/api/itinerary/optimize` | POST | Optimize itinerary order |
| `/api/admin/clear-image-cache` | POST | Clear destination image cache |
| `/api/admin/ai-metrics` | GET | AI usage metrics |

---

## 🗄 Database Schema (Overview)

| Model | Purpose |
|-------|---------|
| **User** | Accounts, OAuth, preferences |
| **RefreshToken** | Session rotation, reuse detection |
| **AuditLog** | Login, logout, register events |
| **RateLimitEntry** | DB-backed rate limiting |
| **AiUsageLog** | LLM token usage, cost tracking |
| **Trip** | Trips with destination, dates, budget |
| **Itinerary** | AI-generated itinerary JSON |
| **ChatMessage** | Trip chat history |
| **TravelPreference** | Travel DNA data |
| **Notification** | In-app notifications |
| **FavoriteDestination** | User favorites |

---

## 🔒 Security

- **JWT access tokens** (short-lived) + **httpOnly refresh cookies** (7 days)
- **CSRF protection** on state-mutating requests (Double Submit Cookie + HMAC)
- **Token rotation** with reuse detection (family revocation)
- **Rate limiting** on auth endpoints (DB or Upstash Redis)
- **Secure headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **Server-only API keys** (Pexels, Groq, Gemini never exposed to client)

---

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run type-check` | TypeScript check |
| `npm run lint` | Run ESLint |
| `npm run clear-image-cache` | Clear destination image cache |
| `npm run measure-perf` | Measure dashboard performance |

---

## 🚢 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add all environment variables
4. Deploy

### Required Services

| Service | Purpose |
|---------|---------|
| **Supabase** (or Postgres) | Database |
| **Groq** or **Google AI** | LLM (itinerary, chat, packing) |
| **Mapbox** | Maps |
| **Pexels** | Destination images |
| **Google Cloud** | OAuth credentials |
| **Upstash Redis** (optional) | Rate limiting, caching |

### Production Checklist

- Set `NODE_ENV=production`
- Configure `NEXT_PUBLIC_APP_URL` for your domain
- Ensure `LLM_PROVIDER` and corresponding API key
- Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for production rate limiting
- Configure Google OAuth redirect URIs for your domain

---

## 📄 License

MIT
