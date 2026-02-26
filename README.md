# VoyageAI

**Smart & Simple Trip Planning** — AI-powered travel planning that turns your ideas into complete itineraries.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **AI Itinerary** | Generate day-by-day plans from destination, dates, and travel style |
| **AI Chat** | Trip-specific companion for questions, suggestions, and reoptimization |
| **Smart Packing** | AI-generated packing lists based on destination and duration |
| **Trip Simulation** | Preview your trip with weather, costs, and alternatives |
| **Interactive Map** | Mapbox-powered map with trip locations |
| **Budget Tracking** | Track spending and compare against your plan |
| **Google OAuth** | Sign in with Google or email/password |
| **Travel DNA** | Onboarding to capture preferences (pace, style, budget) |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, React 19) |
| **Language** | TypeScript |
| **Database** | PostgreSQL (Supabase) |
| **ORM** | Prisma 7 |
| **Auth** | JWT + httpOnly refresh tokens, Google OAuth 2.0 |
| **AI / LLM** | Groq (LLaMA) |
| **Maps** | Mapbox GL JS |
| **Images** | Pexels, Unsplash |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Framer Motion |
| **State** | Zustand (persisted) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** or **pnpm**
- **PostgreSQL** (or Supabase account)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/voyageai.git
cd voyageai
npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# ── Database (Supabase) ────────────────────────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host:6543/postgres?pgbouncer=true&sslmode=require"
DIRECT_URL="postgresql://user:pass@host:5432/postgres?sslmode=require"

# ── JWT ────────────────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET="your-64-byte-hex-access-secret"
JWT_REFRESH_SECRET="your-64-byte-hex-refresh-secret"

# ── CSRF ────────────────────────────────────────────────────────────────────────
CSRF_SECRET="your-32-byte-hex-csrf-secret"

# ── App ────────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# ── Google OAuth ───────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# ── LLM ────────────────────────────────────────────────────────────────────────
LLM_PROVIDER="groq"
GROQ_API_KEY="your-groq-api-key"

# ── Mapbox ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_MAPBOX_TOKEN="your-mapbox-token"

# ── Pexels (destination images) ────────────────────────────────────────────────
PEXELS_API_KEY="your-pexels-api-key"
```

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

## 📁 Project Structure

```
voyageai/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # SQL migrations
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login, signup
│   │   ├── (marketing)/       # Landing, about, blog, etc.
│   │   ├── dashboard/         # Protected app
│   │   │   ├── page.tsx       # Trip list
│   │   │   ├── settings/      # User settings
│   │   │   └── trip/[id]/     # Trip detail + AI chat
│   │   └── api/               # API routes
│   │       ├── auth/          # Login, register, refresh, Google OAuth
│   │       ├── profile/       # GET/PATCH user profile
│   │       ├── trips/         # Trip CRUD, chat
│   │       └── ai/            # Itinerary, packing, reoptimize, simulation
│   ├── components/
│   │   ├── dashboard/         # Dashboard UI
│   │   └── trip/              # Trip-specific (map, itinerary, chat)
│   ├── lib/                   # Utilities, auth, Prisma client
│   ├── services/              # AI services, trip logic
│   └── stores/                # Zustand auth store
├── docs/                      # Architecture, audits
└── scripts/                   # Dev utilities
```

---

## 🔌 API Overview

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Email/password login |
| `/api/auth/register` | POST | Create account |
| `/api/auth/refresh` | POST | Rotate tokens (cookie) |
| `/api/auth/logout` | POST | Revoke session |
| `/api/auth/google` | GET | Google OAuth redirect |
| `/api/auth/google/callback` | GET | OAuth callback |
| `/api/profile` | GET, PATCH | User profile |
| `/api/trips` | GET, POST | List/create trips |
| `/api/trips/[id]` | GET, PATCH, DELETE | Trip CRUD |
| `/api/trips/[id]/chat` | POST | AI chat (streaming) |
| `/api/ai/itinerary` | POST | Generate itinerary |
| `/api/ai/packing` | POST | Generate packing list |
| `/api/ai/reoptimize` | POST | Reoptimize itinerary |
| `/api/ai/simulation` | POST | Trip simulation |

---

## 🔒 Security

- **JWT access tokens** (15 min) + **httpOnly refresh cookies** (7 days)
- **CSRF protection** on state-mutating requests (Double Submit Cookie)
- **Token rotation** with reuse detection (family revocation)
- **Rate limiting** on auth endpoints
- **Secure headers** (CSP, HSTS, X-Frame-Options)

---

## 📜 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run clear-image-cache` | Clear destination image cache |

---

## 🚢 Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

### Database

Use **Supabase** (free tier) or any PostgreSQL host. Set `DATABASE_URL` and `DIRECT_URL` for Prisma.

### Required Services

| Service | Purpose |
|---------|---------|
| **Supabase** | PostgreSQL |
| **Groq** | LLM (itinerary, chat, packing) |
| **Mapbox** | Maps |
| **Pexels** | Destination images |
| **Google Cloud** | OAuth credentials |

---

## 📄 License

MIT
