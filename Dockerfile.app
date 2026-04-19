# ─────────────────────────────────────────────────────────────────────────────
#  VoyageAI — Next.js Production Dockerfile
#
#  Multi-stage build using Next.js standalone output mode.
#  Produces a minimal runtime image (~200 MB) with only:
#    • The standalone server (node server.js)
#    • Static assets  (.next/static, public/)
#    • Runtime node_modules (only what Next.js standalone needs)
#
#  Prerequisites:
#    next.config.ts must have  output: 'standalone'
#    Prisma schema lives at    prisma/schema.prisma
#
#  Build args:
#    NEXT_PUBLIC_MAPBOX_TOKEN — public; baked into the client bundle (default: empty)
#    DATABASE_URL — passed in CI from GitHub Actions secrets for prisma.config.ts
#      during `prisma generate` only (no DB connection). Default is a harmless
#      placeholder for local builds. A real URL may appear in image layer metadata;
#      prefer the placeholder unless you need an exact connection string at build time.
#
#  Runtime secrets are still injected via App Platform / docker-compose — not required
#  in the final image ENV for a typical deploy.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# ci install — uses package-lock.json for reproducible builds
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# prisma.config.ts requires a URL; .env is not in the build context.
# CI passes DATABASE_URL from secrets; local/docker uses the default below.
ARG DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/prisma"
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client (schema-only; no DB connection required)
RUN npx prisma generate

# Public build-time token — baked into client JS bundle
ARG NEXT_PUBLIC_MAPBOX_TOKEN=""
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Suppress env-validation at build time (secrets injected at runtime)
ENV SKIP_ENV_VALIDATION=1

RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Drop root — run as dedicated non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Static assets served directly from the container (or a CDN)
COPY --from=builder /app/public ./public

# Standalone server + compiled routes
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static files must live at .next/static relative to the standalone root
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# next.config.ts output:standalone generates a self-contained server.js
CMD ["node", "server.js"]
