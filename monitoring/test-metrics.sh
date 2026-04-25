#!/bin/bash
#
# test-metrics.sh
#
# Quick verification script for the observability stack.
# Run after starting monitoring stack and Next.js app.
#

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROM_URL="${PROM_URL:-http://localhost:9090}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  VoyageAI Observability Stack — Verification Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ── 1. Check Prometheus targets ──────────────────────────────────────────────

echo "[1/6] Checking Prometheus targets..."
TARGETS=$(curl -s "${PROM_URL}/api/v1/targets" | jq -r '.data.activeTargets[] | select(.labels.job=="nextjs" or .labels.job=="langgraph") | "\(.labels.job): \(.health)"')

if echo "$TARGETS" | grep -q "nextjs: up" && echo "$TARGETS" | grep -q "langgraph: up"; then
  echo "✅ Prometheus targets OK"
  echo "$TARGETS" | sed 's/^/   /'
else
  echo "❌ Prometheus targets not healthy:"
  echo "$TARGETS" | sed 's/^/   /'
  echo
  echo "Troubleshooting:"
  echo "  - Check Next.js is running: curl ${BASE_URL}/api/health"
  echo "  - Check LangGraph is running: curl http://localhost:8000/health"
  echo "  - Check Prometheus config: docker exec -it voyageai-prometheus cat /etc/prometheus/prometheus.yml"
  exit 1
fi
echo

# ── 2. Check Next.js metrics endpoint ────────────────────────────────────────

echo "[2/6] Checking Next.js /api/metrics endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/metrics")
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ Next.js metrics endpoint responding (HTTP $HTTP_CODE)"
else
  echo "❌ Next.js metrics endpoint failed (HTTP $HTTP_CODE)"
  echo "   Check app is running: ${BASE_URL}"
  exit 1
fi
echo

# ── 3. Verify HTTP request metrics exist ─────────────────────────────────────

echo "[3/6] Checking HTTP request metrics..."
HTTP_REQ_COUNT=$(curl -s "${BASE_URL}/api/metrics" | grep -c "^http_requests_total" || true)
if [ "$HTTP_REQ_COUNT" -gt 0 ]; then
  echo "✅ http_requests_total metric found ($HTTP_REQ_COUNT lines)"
else
  echo "❌ http_requests_total NOT found"
  echo "   Middleware may not be running. Check src/middleware.ts exists."
  exit 1
fi
echo

# ── 4. Verify business metrics are registered ────────────────────────────────

echo "[4/6] Checking business metrics registration..."
BUSINESS_METRICS=$(curl -s "${BASE_URL}/api/metrics" | grep -E "^(planner_|langgraph_)" | cut -d' ' -f1 | sort -u)
EXPECTED_METRICS=(
  "planner_trip_created_total"
  "planner_trip_updated_total"
  "planner_trip_deleted_total"
  "planner_auth_total"
  "planner_chat_messages_total"
  "planner_itinerary_generated_total"
)

MISSING=()
for metric in "${EXPECTED_METRICS[@]}"; do
  if ! echo "$BUSINESS_METRICS" | grep -q "^${metric}"; then
    MISSING+=("$metric")
  fi
done

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✅ All business metrics registered"
  echo "$BUSINESS_METRICS" | head -6 | sed 's/^/   /'
else
  echo "⚠️  Some metrics missing:"
  printf '   %s\n' "${MISSING[@]}"
  echo "   (This is OK if no traffic has been generated yet)"
fi
echo

# ── 5. Generate test traffic ─────────────────────────────────────────────────

echo "[5/6] Generating test traffic..."
echo "   → GET /api/health"
curl -s "${BASE_URL}/api/health" > /dev/null
echo "   → GET / (home page)"
curl -s "${BASE_URL}/" > /dev/null
echo "   → GET /api/metrics (trigger middleware)"
curl -s "${BASE_URL}/api/metrics" > /dev/null
echo "✅ Test requests sent"
echo

# ── 6. Verify metrics incremented ────────────────────────────────────────────

echo "[6/6] Verifying metrics incremented in Prometheus..."
sleep 3  # Wait for scrape
HTTP_REQ_RATE=$(curl -s "${PROM_URL}/api/v1/query?query=rate(http_requests_total[1m])" | jq -r '.data.result[0].value[1] // "0"')
if [ "$(echo "$HTTP_REQ_RATE > 0" | bc -l)" -eq 1 ]; then
  echo "✅ http_requests_total rate > 0 in Prometheus"
else
  echo "⚠️  http_requests_total rate = 0 (may need more time for scrape)"
fi

UP_NEXTJS=$(curl -s "${PROM_URL}/api/v1/query?query=up{job=\"nextjs\"}" | jq -r '.data.result[0].value[1] // "0"')
if [ "$UP_NEXTJS" = "1" ]; then
  echo "✅ up{job=\"nextjs\"} = 1"
else
  echo "❌ up{job=\"nextjs\"} = $UP_NEXTJS"
fi
echo

# ── Summary ──────────────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Observability stack verification complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Next steps:"
echo "  1. Open Grafana: http://localhost:3001 (admin / admin)"
echo "  2. Check 'System Health' dashboard"
echo "  3. Generate more traffic (register, create trip, chat)"
echo "  4. Verify business metrics panels populate"
echo
echo "Useful links:"
echo "  - Prometheus targets: ${PROM_URL}/targets"
echo "  - Prometheus expression browser: ${PROM_URL}/graph"
echo "  - Next.js metrics: ${BASE_URL}/api/metrics"
echo "  - LangGraph metrics: http://localhost:8000/metrics"
echo
