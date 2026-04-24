# Observability Stack Fix — Complete Implementation

## Executive Summary

**Problem:** Grafana dashboards showed "No data" for all application metrics (API, AI, LangGraph, business) while system metrics (CPU/Memory) worked. 

**Root causes:**
1. **Missing `middleware.ts`** → HTTP request metrics never recorded
2. **Prometheus targeting production hostnames** → couldn't scrape localhost/docker services  
3. **Docker network isolation** → monitoring stack couldn't reach app containers
4. **Business metrics undefined** → never incremented in API routes
5. **No itinerary/auth/chat instrumentation** → business events never tracked

**Status:** ✅ **FIXED** — All files patched, ready for verification

---

## Files Changed

### 1. **Created `src/middleware.ts`** ✅
- **Why:** Next.js requires `middleware.ts` (not just `proxy.ts`) to run request interception
- **Impact:** Enables HTTP metrics (`http_requests_total`, `http_request_duration_seconds`, `http_errors_total`)
- **Verification:** After restart, `/api/metrics` should show `http_requests_total` increasing

### 2. **Created `monitoring/prometheus.local.yml`** ✅
- **Why:** Original `prometheus.yml` hardcoded production placeholders (`NEXTJS_PROD_HOST`, `LANGGRAPH_PROD_HOST`)
- **Fix:** Local config targets `host.docker.internal:3000` (Next.js) and `:8000` (LangGraph)
- **Verification:** Prometheus `/targets` page should show `nextjs` and `langgraph` jobs **UP**

### 3. **Updated `monitoring/docker-compose.yml`** ✅
- **Why:** Wasn't using local config
- **Fix:** Changed volume mount to use `prometheus.local.yml` instead of `prometheus.yml`
- **Verification:** Container uses correct config on startup

### 4. **Instrumented Trip CRUD** ✅
- **Files:** `src/app/api/trips/route.ts`, `src/app/api/trips/[id]/route.ts`
- **Metrics added:**
  - `plannerTripCreatedTotal` (POST /api/trips)
  - `plannerTripUpdatedTotal` (PATCH /api/trips/[id])
  - `plannerTripDeletedTotal` (DELETE /api/trips/[id])
- **Verification:** Create/update/delete a trip → check `/api/metrics` for `planner_trip_*_total`

### 5. **Instrumented Auth Events** ✅
- **Files:** `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts`
- **Metrics added:**
  - `plannerAuthTotal{event="login_success|login_failed|register_success", method="password"}`
- **Verification:** Login/register → check `/api/metrics` for `planner_auth_total`

### 6. **Instrumented Chat Messages** ✅
- **File:** `src/app/api/auth/ai/chat/route.ts`
- **Metrics added:**
  - `plannerChatMessagesTotal{direction="incoming|outgoing"}`
- **Verification:** Send chat message → check `/api/metrics` for `planner_chat_messages_total`

### 7. **Instrumented Itinerary Generation** ✅
- **File:** `src/app/api/ai/itinerary-flow/save/route.ts`
- **Metrics added:**
  - `plannerItineraryGeneratedTotal{status="success", source="flow"}`
  - `plannerItineraryDurationSeconds{source="flow", status="success"}` (histogram)
- **Verification:** Complete itinerary flow → check metrics

---

## Metrics Coverage Matrix

| **Panel Name** | **Metric** | **Status** | **Source** |
|----------------|------------|------------|------------|
| **System Health** ||||
| Next.js Up | `up{job="nextjs"}` | ✅ Fixed | Prometheus scrape |
| LangGraph Up | `up{job="langgraph"}` | ✅ Fixed | Prometheus scrape |
| CPU Usage | `node_cpu_seconds_total` | ✅ Already working | node-exporter |
| Memory Usage | `node_memory_*` | ✅ Already working | node-exporter |
| API RPS | `http_requests_total` | ✅ Fixed | middleware.ts |
| API Error Rate | `http_errors_total` | ✅ Fixed | middleware.ts |
| API Latency p50/p95/p99 | `http_request_duration_seconds_bucket` | ✅ Fixed | middleware.ts |
| HTTP Requests by Route | `http_requests_total{route}` | ✅ Fixed | middleware.ts |
| API Errors by Route | `http_errors_total{route}` | ✅ Fixed | middleware.ts |
| **AI Performance** ||||
| AI Request Latency | `ai_request_duration_seconds_bucket` | ✅ Already instrumented | `src/lib/ai/llm.ts` |
| Token Usage by Provider | `ai_tokens_total{provider}` | ✅ Already instrumented | `src/lib/ai/llm.ts` |
| AI Requests by Agent | `ai_requests_total{agent}` | ✅ Already instrumented | `src/lib/ai/llm.ts` |
| LLM Fallbacks | `ai_fallback_total` | ✅ Already instrumented | `src/lib/ai/llm.ts` |
| AI Latency by Model | `ai_request_duration_seconds_bucket{model}` | ✅ Already instrumented | `src/lib/ai/llm.ts` |
| **LangGraph Workflow** ||||
| Total Executions | `langgraph_executions_total` | ✅ Already instrumented | Python service |
| Success Rate | `langgraph_executions_total{status}` | ✅ Already instrumented | Python service |
| Active Executions | `langgraph_active_executions` | ✅ Already instrumented | Python service |
| Requires Human | `langgraph_executions_total{outcome="requires_human"}` | ✅ Already instrumented | Python service |
| Repair Iterations | `langgraph_repair_iterations_total` | ✅ Already instrumented | Python service |
| Early Terminations | `langgraph_early_termination_total` | ✅ Already instrumented | Python service |
| Graph Execution Duration | `langgraph_execution_duration_seconds_bucket` | ✅ Already instrumented | Python service |
| Node Duration p95 | `langgraph_node_duration_seconds_bucket` | ✅ Already instrumented | Python service |
| Node Success vs Failure | `langgraph_node_executions_total{status}` | ✅ Already instrumented | Python service |
| Branch Path Usage | `langgraph_branch_path_total` | ✅ Already instrumented | Python service |
| **Business Metrics** ||||
| Itineraries Generated | `planner_itinerary_generated_total` | ✅ Fixed | save/route.ts |
| Plan Success Rate | `planner_itinerary_generated_total{status}` | ✅ Fixed | save/route.ts |
| Trips Created | `planner_trip_created_total` | ✅ Fixed | trips/route.ts |
| Trips Deleted | `planner_trip_deleted_total` | ✅ Fixed | trips/[id]/route.ts |
| Plan Regenerations | `planner_regenerated_total` | ⚠️ Not yet wired | (requires frontend tracking) |
| AI Dissatisfaction Rate | `planner_regenerated_total` ratio | ⚠️ Depends on above | |
| Auth Events | `planner_auth_total{event, method}` | ✅ Fixed | auth/login, register |
| Chat Messages | `planner_chat_messages_total{direction}` | ✅ Fixed | ai/chat/route.ts |
| Trip CRUD Operations | `planner_trip_*_total` | ✅ Fixed | trips routes |

---

## Verification Steps

### 1. Start Monitoring Stack

```bash
cd monitoring
docker compose up -d
```

**Verify:**
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin / admin)
- Alertmanager: http://localhost:9093

### 2. Start Application Stack

```bash
# From workspace root
npm run dev  # or docker compose up if using containers
```

**Verify Next.js:**
- App: http://localhost:3000
- Metrics endpoint: http://localhost:3000/api/metrics
  - Should return Prometheus text format
  - Should include `http_requests_total`, `nodejs_*`, `ai_*`, `planner_*`

**Verify LangGraph:**
- Health: http://localhost:8000/health
- Metrics: http://localhost:8000/metrics
  - Should return `langgraph_*` metrics

### 3. Check Prometheus Targets

Go to **http://localhost:9090/targets**

Expected status:
```
prometheus       UP
nextjs           UP (host.docker.internal:3000)
langgraph        UP (host.docker.internal:8000)
node_exporter    UP (node-exporter:9100)
```

If `nextjs` or `langgraph` show **DOWN**:
- Check app is running: `curl http://localhost:3000/api/metrics`
- Check Docker host gateway: `docker exec -it voyageai-prometheus ping host.docker.internal`
- Check Prometheus logs: `docker logs voyageai-prometheus`

### 4. Generate Test Traffic

Run the test script:

```bash
cd monitoring
node test-traffic.js
```

Or manually:

```bash
# Test API metrics
curl http://localhost:3000/api/health
curl http://localhost:3000/api/trips  # (requires auth token)

# Test business metrics
# 1. Register a new user at http://localhost:3000
# 2. Create a trip
# 3. Start itinerary generation flow
# 4. Send a chat message
```

### 5. Verify Metrics Appear

**Check raw metrics:**
```bash
curl http://localhost:3000/api/metrics | grep http_requests_total
curl http://localhost:3000/api/metrics | grep planner_trip_created_total
curl http://localhost:8000/metrics | grep langgraph_executions_total
```

**Check Prometheus expression browser:**

Go to **http://localhost:9090/graph** and test queries:

```promql
# System health
up{job="nextjs"}
up{job="langgraph"}

# API metrics
rate(http_requests_total[5m])
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Business metrics
planner_trip_created_total
rate(planner_chat_messages_total[5m])
planner_itinerary_generated_total

# LangGraph metrics
langgraph_active_executions
rate(langgraph_executions_total[5m])
```

### 6. Check Grafana Dashboards

Go to **http://localhost:3001** (login: admin / admin)

Navigate to each dashboard:

1. **System Health** (should show):
   - Next.js Up = **UP** (green)
   - LangGraph Up = **UP** (green)
   - API RPS > 0 after test traffic
   - API Latency timeseries
   - HTTP Requests by Route

2. **AI Performance** (after AI requests):
   - AI Request Latency
   - Token Usage by Provider
   - AI Requests by Agent

3. **LangGraph Workflow** (after running pipeline):
   - Total Executions
   - Success Rate
   - Graph Execution Duration

4. **Business Metrics** (after user actions):
   - Itineraries Generated
   - Trips Created
   - Auth Events
   - Chat Messages

---

## Troubleshooting

### Problem: `nextjs` target shows DOWN in Prometheus

**Solution 1:** Verify Next.js `/api/metrics` is accessible
```bash
curl http://localhost:3000/api/metrics
```
If this fails, Next.js isn't running or middleware isn't working.

**Solution 2:** Check Prometheus can resolve `host.docker.internal`
```bash
docker exec -it voyageai-prometheus ping host.docker.internal
```
If this fails:
- On Windows: Update Docker Desktop settings → ensure "host.docker.internal" is enabled
- On Linux: Add `--add-host=host.docker.internal:host-gateway` to Prometheus container

**Solution 3:** Check Prometheus config is loaded
```bash
docker exec -it voyageai-prometheus cat /etc/prometheus/prometheus.yml | grep nextjs
```
Should show `targets: ["host.docker.internal:3000"]`

### Problem: Metrics show 0 or "No data" in Grafana

**Check scrape is working:**
```bash
# In Prometheus expression browser
up{job="nextjs"}  # Should return 1
```

**Check metric exists:**
```bash
curl http://localhost:3000/api/metrics | grep http_requests_total
```

**Check time range:**
- Grafana defaults to "Last 1h" — if you just started, change to "Last 5m"

**Check query syntax:**
- Use Prometheus expression browser first to validate PromQL
- Copy working queries into Grafana

### Problem: Business metrics never increment

**Verify instrumentation:**
```bash
# Check metric is registered
curl http://localhost:3000/api/metrics | grep planner_trip_created_total

# Trigger the action (e.g. create a trip)
# Then check again
curl http://localhost:3000/api/metrics | grep planner_trip_created_total
```

If counter doesn't increase after action:
- Check API route completed successfully (no errors)
- Check metric import statement exists in route file
- Check metric `.inc()` call executes after DB write

### Problem: LangGraph metrics missing

**Check Python service health:**
```bash
curl http://localhost:8000/health
curl http://localhost:8000/metrics
```

**Check Prometheus can scrape it:**
```bash
curl -H "Accept: text/plain" http://localhost:9090/api/v1/query?query=up{job="langgraph"}
```

If DOWN:
- Check LangGraph is running: `docker ps | grep langgraph` or `curl http://localhost:8000/health`
- Check Prometheus targets page for error message

---

## Production Deployment Notes

### For CI/CD (GitHub Actions, etc.)

1. **Use production `prometheus.yml`** (not `.local.yml`)
   - Substitute `NEXTJS_PROD_HOST` and `LANGGRAPH_PROD_HOST` with real hostnames
   - Add `METRICS_SCRAPE_SECRET` to Prometheus config:
     ```yaml
     authorization:
       credentials: "${METRICS_SCRAPE_SECRET}"
     ```

2. **Set environment variable:**
   ```bash
   export METRICS_SCRAPE_SECRET="your-secret-here"
   ```
   Next.js `/api/metrics` endpoint checks this bearer token.

3. **Deploy monitoring stack separately:**
   - Use managed Prometheus (e.g. AWS Managed Prometheus, GCP Managed Prometheus)
   - Or deploy Prometheus/Grafana on separate infra (EC2, Cloud Run, etc.)

4. **Network configuration:**
   - Prometheus must reach Next.js and LangGraph over HTTPS
   - Use internal DNS or service discovery
   - Firewall: allow Prometheus IP → app metrics endpoints

---

## Testing Runbook

### Minimal Acceptance Test

Run these commands in order:

```bash
# 1. Start monitoring
cd monitoring && docker compose up -d && cd ..

# 2. Wait for Prometheus to be ready
sleep 10

# 3. Start app
npm run dev &
sleep 15

# 4. Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="nextjs" or .labels.job=="langgraph") | {job: .labels.job, health: .health}'

# Expected:
# {"job":"nextjs","health":"up"}
# {"job":"langgraph","health":"up"}

# 5. Generate test traffic
curl -s http://localhost:3000/api/health | jq '.success'
# Expected: true

# 6. Verify metrics exist
curl -s http://localhost:3000/api/metrics | grep -c http_requests_total
# Expected: >0 (multiple lines)

# 7. Check Grafana renders data
# Open http://localhost:3001 → System Health dashboard
# Verify "Next.js Up" panel shows "UP" (green)
```

### Full Integration Test

1. **Register new user** → check `planner_auth_total{event="register_success"}`
2. **Login** → check `planner_auth_total{event="login_success"}`
3. **Create trip** → check `planner_trip_created_total`
4. **Generate itinerary** → check `planner_itinerary_generated_total`, `langgraph_executions_total`
5. **Send chat message** → check `planner_chat_messages_total`
6. **Delete trip** → check `planner_trip_deleted_total`

After each action, query Prometheus:
```bash
curl -s "http://localhost:9090/api/v1/query?query=METRIC_NAME" | jq '.data.result[0].value[1]'
```

---

## Next Steps (Optional Enhancements)

### 1. Add "Plan Regeneration" Tracking

**Frontend:** When user clicks "Regenerate itinerary":
```typescript
// In itinerary UI component
await fetch('/api/metrics/regenerate', { method: 'POST' });
```

**Backend:** Add new route `/api/metrics/regenerate`:
```typescript
import { plannerRegeneratedTotal } from "@/lib/monitoring/businessMetrics";
export async function POST() {
  plannerRegeneratedTotal.inc();
  return Response.json({ ok: true });
}
```

### 2. Add Postgres Exporter (Optional)

If you want DB metrics (connections, query latency, etc.):

1. Add `postgres-exporter` to `docker-compose.yml`:
```yaml
postgres-exporter:
  image: prometheuscommunity/postgres-exporter
  environment:
    DATA_SOURCE_NAME: "postgresql://user:pass@db:5432/voyageai?sslmode=disable"
  ports:
    - "9187:9187"
```

2. Uncomment Postgres job in `prometheus.local.yml`

### 3. Add Alerts

Edit `monitoring/alert_rules.yml` to add custom alerts:
```yaml
groups:
  - name: VoyageAI
    rules:
      - alert: HighErrorRate
        expr: rate(http_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "API error rate > 5% for 5 minutes"
```

### 4. Add Distributed Tracing (Optional)

Consider adding OpenTelemetry for request tracing across Next.js → LangGraph → agents.

---

## Summary

✅ **All root causes fixed**
✅ **Metrics instrumented end-to-end**
✅ **Prometheus targets configured for local dev**
✅ **Grafana dashboards will show data after test traffic**

**What to do now:**
1. Restart monitoring stack: `cd monitoring && docker compose restart`
2. Restart app: Stop dev server, run `npm run dev`
3. Run verification steps above
4. Check Grafana dashboards: http://localhost:3001

**If any panel still shows "No data":**
- Check "Troubleshooting" section above
- Verify Prometheus targets are UP: http://localhost:9090/targets
- Check raw metrics exist: `curl http://localhost:3000/api/metrics`
- Validate PromQL query in Prometheus expression browser before blaming Grafana

**Expected result:** After generating test traffic (register, create trip, chat, etc.), all dashboards should display real data. System Health panels (Next.js Up, LangGraph Up, API RPS, latency) should show data immediately.
