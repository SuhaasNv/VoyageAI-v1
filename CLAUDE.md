# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build (required before all commits)
npm run type-check   # TypeScript check without emitting
npm run test         # Run Vitest tests
npm run lint         # ESLint
```

**Database / scripts:**
```bash
npm run copy-db-data         # Copy Postgres data between environments
npm run clear-image-cache    # Clear Pexels destination image cache
npm run measure-perf         # Measure dashboard performance
```

Tests are run with **Vitest** (`vitest run`). There is no watch-mode test command configured.

---

## Architecture Overview

VoyageAI is a Next.js 15 full-stack AI-powered travel planning app. The codebase uses the App Router with a clear separation between marketing pages, authenticated dashboard, and admin panel.

### Path Aliases

```
@/components/* → src/ui/components/*
@/*            → src/*
```

So `@/components/ui/button` resolves to `src/ui/components/ui/button`.

### App Directory Layout

```
src/app/
├── (auth)/           # Login, signup (no layout wrapper)
├── (marketing)/      # Landing page, blog, destinations, tutorials
├── dashboard/        # Authenticated user app
│   ├── trip/[id]/    # Trip detail with map and AI chat
│   ├── compare/      # Side-by-side trip comparison
│   ├── destination/  # Destination details
│   └── settings/     # User preferences
├── admin/            # Admin panel
├── share/[token]/    # Public (unauthenticated) trip sharing
└── api/              # All API routes
```

### Source Layout

```
src/
├── agents/           # Individual agent logic (planner, research, logistics, budget, safety)
├── orchestrator/     # agentOrchestrator.ts — wires agents into a pipeline
├── tools/            # Tool functions agents can call (chat, itinerary, packing, etc.)
├── services/         # Business logic (ai/, auth/, admin/, geo/, logging/)
├── lib/              # Core utilities, AI helpers, Prisma client, error classes
├── stores/           # Zustand (single file: authStore.ts)
├── hooks/            # React hooks (e.g. useTrips)
├── infrastructure/   # env validation, logger, LLM client init, CSRF secret
├── security/         # rateLimiter, csrf, safety guard
├── middleware/       # Next.js middleware
├── memory/           # LLM context/memory management
└── ui/components/    # All React components
    ├── ui/           # Shared primitives (globe, hero, animations, navbar)
    ├── dashboard/    # Dashboard-specific (sidebar, modals, cards, providers)
    ├── itinerary-flow/ # Multi-stage trip creation flow
    ├── trip/         # Trip detail view components
    ├── maps/         # Mapbox integration
    ├── chat/         # Chat UI
    └── marketing/    # Landing page sections
```

---

## State Management

**Single Zustand store**: `src/stores/authStore.ts` (`useAuthStore`)

Manages only auth state:
- `user: AuthUser | null`, `accessToken: string | null`, `isLoading`, `error`, `_hasHydrated`
- Persisted to **`sessionStorage`** (not localStorage)
- Key actions: `setAuth`, `refreshAccessToken`, `hydrateUser`, `logout`, `updateUser`, `setOnboarded`

All other state is local (`useState`) or passed via React Context (e.g. `DashboardTripsProvider`). There is no global store for trips, UI state, or settings.

---

## Agent Pipeline

The AI itinerary creation runs a sequential multi-agent pipeline:

```
User Input
  → Planner Agent   (create day themes)
  → Research Agent  (find activities & hotels)
  → Logistics Agent (schedule & book)
  → Budget Agent    (estimate costs, optimize)
  → Safety Agent    (fatigue & safety check)
  → Output
```

Entry point: `src/orchestrator/agentOrchestrator.ts`  
Agent definitions: `src/agents/{planner,research,logistics,budget,safety}/`  
Shared types: `src/agents/shared/tripPipelineTypes.ts`

The pipeline transforms: `TripContext → EnrichedTripContext → OptimizedTripContext → SafeTripContext`

All LLM outputs are validated with **Zod schemas** in `src/lib/ai/schemas/`.

---

## LLM Integration

**Primary provider**: Groq → fallback Gemini → fallback OpenAI  
**Model routing**: `src/lib/ai/modelSelector.ts` (routes by complexity, token budget, availability)  
**Caching**: Upstash Redis, 24h TTL, keyed by request hash (`src/lib/ai/cache.ts`)  
**Prompts**: `src/lib/ai/prompts/`  
**Personalization**: `src/lib/ai/travelDNARules.ts` — applies user Travel DNA to prompt context

LLM calls go through `src/lib/ai/llm.ts`. Never call LLM providers directly from API routes.

---

## API Routes

### Response Format (always use this shape)

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, details?: unknown } }
```

Use `formatErrorResponse()` from `src/lib/errors.ts` for errors. Use `AppError` for typed throws.

### Route Groups

| Prefix | Purpose |
|--------|---------|
| `/api/auth/` | JWT login, register, refresh, logout, Google OAuth, CSRF, onboarding |
| `/api/trips/` | CRUD trips, chat history, itinerary save, share link, PDF upload |
| `/api/ai/` | LLM features: itinerary gen, packing, chat, compare, export, flow stages |
| `/api/preferences/` | Travel DNA (user preference profile) |
| `/api/profile/` | User profile read/update |
| `/api/admin/` | Admin-only: metrics, agent replay, auto-heal, system health |

### Auth & CSRF Pattern

All mutating API calls from the client must go through `src/lib/api.ts`:
- `ensureCsrfToken()` — fetches and caches the CSRF token from cookie
- `mutatingFetchOptions()` — adds CSRF header to POST/PATCH/DELETE requests

Never bypass `mutatingFetchOptions()` for state-changing requests.

---

## Authentication

- **Access tokens**: JWT, short-lived (~15m), in-memory via `authStore`
- **Refresh tokens**: httpOnly cookies, 7 days, rotated on each use
- **Token family revocation**: Detects reuse attacks, revokes entire family
- **CSRF**: Double Submit Cookie + HMAC, verified on all mutations
- **Rate limiting**: DB-backed or Redis-backed, per-user/per-IP/per-endpoint

Admin access is controlled by `ADMIN_EMAILS` env var — no DB role column.

---

## Database

**Prisma** with PostgreSQL. Client singleton at `src/lib/prisma.ts` (HMR-safe via lazy proxy).

- Prisma config: `prisma.config.ts` (connection pool: 10 max, 30s idle, `@prisma/adapter-pg`)
- Run migrations: `npx prisma migrate dev`
- Generate client: `npx prisma generate`

---

## Animation Library

Uses **`framer-motion` v12** (imported as `framer-motion`, not `motion/react`).

Key animation components in `src/ui/components/ui/`:
- `container-scroll-animation.tsx` — scroll-triggered scale/rotate transforms
- `cobe-globe.tsx` — 3D interactive globe (Cobe library), respects `useReducedMotion()`

---

## Environment Variables

**Required for any feature to work:**
- `DATABASE_URL` — Postgres connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`
- `LLM_PROVIDER` + corresponding key (`GEMINI_API_KEY` or `OPENAI_API_KEY`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth

**Optional but expected in production:**
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — LLM caching, rate limiting
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Map views
- `PEXELS_API_KEY` — Destination images
- `BRIGHT_DATA_API_KEY` — Web search for research agent
- `INTERNAL_AGENT_SECRET` + `LANGGRAPH_SERVICE_URL` — Python LangGraph service

All env vars are validated at startup via Zod in `src/infrastructure/env.ts`. Missing required vars throw at boot, not at runtime.
