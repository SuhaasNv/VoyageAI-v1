# VoyageAI Performance Report (JMeter CLI)

## Scope and Goal
This report provides viva-defensible load evidence for the Next.js staging deployment using Apache JMeter (non-GUI) and safe, non-destructive traffic only.

- Target: `https://voyageai-nextjs-staging-clhvq.ondigitalocean.app`
- Test plan: `performance/voyageai-load-test.jmx`
- Raw results: `performance/results/results.jtl`
- HTML dashboard: `performance/report/report/index.html`

---

## Step 1 — Discovered Endpoint Surface

### `/api/ai/itinerary-flow/*`
| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/ai/itinerary-flow/planner` | POST | Stage 1 plan from natural-language trip input | Yes (`getAuthContext`) |
| `/api/ai/itinerary-flow/research` | POST | Stage 2 enrichment (activities/hotels, external data fallback) | Yes |
| `/api/ai/itinerary-flow/logistics` | POST | Stage 3 deterministic scheduling/routing | Yes |
| `/api/ai/itinerary-flow/budget` | POST | Stage 4 deterministic budget ledger and optimization | Yes |
| `/api/ai/itinerary-flow/safety` | POST | Stage 5 safety/fatigue checks (+ LLM tips on warnings) | Yes |
| `/api/ai/itinerary-flow/apply-plan` | POST | Apply budget optimization plan to context | Yes |
| `/api/ai/itinerary-flow/save` | POST | Persist flow output | Yes (excluded from load to avoid DB mutation) |

### `/api/auth/*`
| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/auth/csrf` | GET | Issue CSRF token (double-submit cookie pattern) | No |
| `/api/auth/login` | POST | Credential login + token issuance | No |
| `/api/auth/register` | POST | New account creation | No (excluded: mutating) |
| `/api/auth/refresh` | POST | Refresh access token | Refresh token required |
| `/api/auth/logout` | POST | Session logout | Optional auth context |
| `/api/auth/onboard` | POST | Initial user onboarding data | Yes |
| `/api/auth/google` | GET | Start OAuth flow | No |
| `/api/auth/google/callback` | GET | OAuth callback completion | No |
| `/api/auth/oauth-config` | GET | OAuth client config | No |

### `/api/trips/*`
| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/trips` | GET | List current user trips | Yes |
| `/api/trips` | POST | Create trip | Yes (excluded: mutating) |
| `/api/trips/[id]` | GET | Read trip detail | Yes |
| `/api/trips/[id]` | PATCH | Update trip | Yes (excluded: mutating) |
| `/api/trips/[id]` | DELETE | Delete trip | Yes (excluded: destructive) |
| `/api/trips/[id]/chat` | GET | Trip chat history | Yes |
| `/api/trips/[id]/itinerary` | POST | Save itinerary | Yes (excluded: mutating) |
| `/api/trips/[id]/share` | POST/DELETE | Share link management | Yes (excluded: mutating) |
| `/api/trips/from-ticket` | POST | Ticket import trip creation | Yes (excluded: mutating) |

### `/api/admin/*` (safe read endpoints only)
| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/api/admin/system-health` | GET | Ops health snapshot | Admin auth required |
| `/api/admin/predictions` | GET | Forecast/read analytics | Admin auth required |
| `/api/admin/ai-metrics` | GET | AI metrics aggregation | Admin auth required |
| `/api/admin/explanations` | GET | Explainability records | Admin auth required |
| `/api/admin/agent-replay` | GET | Request replay details | Admin auth required |
| `/api/admin/auto-heal` | GET | Auto-heal status | Admin auth required |
| `/api/admin/autonomous` | GET | Autonomous mode status | Admin auth required |

### Public dashboard-facing GET routes used in UI
| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/dashboard` | GET | Main app shell (redirects to auth if unauthenticated) | Session-gated UI |
| `/dashboard/trips` | GET | Trips listing page | Session-gated UI |
| `/dashboard/settings` | GET | User settings page | Session-gated UI |
| `/dashboard/trip/[id]` | GET | Trip detail page | Session-gated UI |
| `/dashboard/destination/[name]` | GET | Destination view (tested with Petra) | Session-gated UI |

---

## Step 2 — Scenario Design
Three sequential scenarios were implemented in one JMX with realistic pacing:

1. **Light Load**: 10 users, 30s ramp, 2 minutes.
2. **Moderate Load**: 50 users, 60s ramp, 5 minutes.
3. **Stress Load**: 100 users, 120s ramp, 5 minutes.

Design details:
- Think time: Uniform Random Timer (`1s + up to 2s`).
- Headers:
  - `Authorization: Bearer <JWT>` for protected APIs.
  - `x-csrf-token` + `Cookie: voyageai_csrf=...` for mutating POST calls.
- Realistic payload:
  - Planner POST input: `"5 days in Tokyo, sightseeing and food, moderate budget"`.
- Non-destructive route set only.

---

## Step 3 — JMeter Test Plan Artifact
Created: `performance/voyageai-load-test.jmx`

Contains:
- 3 thread groups (Light/Moderate/Stress)
- HTTP samplers for representative API + dashboard routes
- Think-time timer
- Assertions allowing expected statuses (2xx/3xx and 401 for protected/admin checks)
- Summary + Aggregate listeners in plan (CLI still writes JTL + HTML report)

---

## Step 4 — CLI Execution
Executed (non-GUI):

```bash
jmeter -n -t performance/voyageai-load-test.jmx \
  -l performance/results/results.jtl \
  -e -o performance/report/report \
  -JHOST=voyageai-nextjs-staging-clhvq.ondigitalocean.app \
  -JPORT=443 -JPROTOCOL=https \
  -JJWT="<minted token>" -JCSRF_TOKEN="<minted csrf>"
```

Execution status: **Completed successfully**.

---

## Step 5 — Computed Metrics
Computed from `performance/results/results.jtl`.

### Scenario table
| Scenario | Users | Avg Latency (ms) | P95 (ms) | Throughput (req/s) | Error Rate |
|---|---:|---:|---:|---:|---:|
| Light Load (10u,2m) | 10 | 584.0 | 3370.0 | 4.81 | 15.90% |
| Moderate Load (50u,5m) | 50 | 443.5 | 2447.0 | 26.18 | 21.91% |
| Stress Load (100u,5m) | 100 | 441.7 | 2398.0 | 46.67 | 22.88% |

### APDEX (T=500ms)
- Light: **0.839**
- Moderate: **0.905**
- Stress: **0.903**

### Endpoint-level highlights
- Slowest endpoint: **`POST /api/auth/login (dummy)`** — avg **3020.8 ms**, p95 **5862.0 ms**.
- Most unstable endpoint: **`POST /api/auth/login (dummy)`** — **100%** failures in this run.
- Planner endpoint: **`POST /api/ai/itinerary-flow/planner`** — avg **813.4 ms**, p95 **2531.0 ms**, **76.68%** failures under heavy mixed load.

Failure code mix:
- `500`: 1840
- `401`: 1774
- `429`: 1358

Interpretation note:
- `401` on admin endpoint checks is expected without admin credentials.
- `429` indicates rate limiting under concurrency.
- `500` concentration on login suggests server-side degradation under high auth load in this specific profile.

---

## Step 6 — AI/System Interpretation

Why planner/research-style APIs can be slower:
- They invoke multi-step AI processing and external dependencies (LLM provider, optional web/data enrichment), which adds variable remote latency and queueing effects.

Staged flow vs single-shot tradeoff:
- Staged pipeline (planner → research → logistics → budget → safety) improves controllability, explainability, and partial retries.
- It increases end-to-end latency versus a single-shot response because each stage has its own network + compute overhead.

Dependency impact:
- **LLM provider latency/rate limits** contributes to p95 spikes and `429` under stress.
- **Mapbox/Bright Data/networked services** add tail-latency variance.
- Deterministic stages are usually faster but can still be impacted by upstream data quality and service contention.

---

## Step 7 — Key Insights and Bottlenecks
- Primary bottlenecks in this suite are auth and AI-heavy endpoints under concurrency.
- Throughput scales from light to stress, but error rate rises materially (~16% → ~23%).
- Tail latency remains high (p95 ~2.4–3.4s), indicating queueing and/or dependency saturation at higher loads.
- System limit (for this profile) is reached before zero-error operation at high concurrency; backoff/retry + tighter admission control are advisable.

**Viva-ready explanation:**
The system behaves this way because request cost is not uniform: lightweight GET endpoints stay stable, while stateful authentication and AI-assisted planning involve higher compute and external dependency latency. As concurrency increases, queueing and rate limiting dominate tail latency and error rate, so throughput rises but quality-of-service degrades unless we add capacity controls, smarter retries, and endpoint-level isolation.

---

## Step 8 — Safety Constraints Applied
- No DELETE endpoints were exercised.
- No admin mutation endpoints were called.
- Trip creation/update/save endpoints were excluded to avoid DB state corruption.
- Test data used synthetic user/token context only.

---

## Step 9 — Final Deliverables
- JMeter test plan: `performance/voyageai-load-test.jmx`
- Raw JTL: `performance/results/results.jtl`
- HTML dashboard: `performance/report/report/index.html`
- Computed metrics: `performance/results/metrics-20260424-215513.md`
- Executive report: `performance/REPORT.md`

