#!/usr/bin/env bash
# Run health + landing + planner against DigitalOcean staging and emit a one-page slide summary HTML.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${STAMP_HOST:-voyageai-nextjs-staging-clhvq.ondigitalocean.app}"
PROTOCOL="https"
PORT="443"

if ! command -v jmeter >/dev/null 2>&1; then
  echo "jmeter not found. Install Apache JMeter or use Docker (see jmeter/README.md)."
  exit 1
fi

# JWT + CSRF: mint from .env if JWT_ACCESS_TOKEN not set (only works when secrets match the deployment).
eval "$(node <<'NODE'
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const acc = process.env.JWT_ACCESS_SECRET;
const csrf = process.env.CSRF_SECRET;
if (!acc || !csrf) {
  console.error("Missing JWT_ACCESS_SECRET or CSRF_SECRET in .env (needed to mint tokens for staging).");
  process.exit(1);
}
let tok = process.env.JWT_ACCESS_TOKEN;
if (!tok) {
  tok = jwt.sign(
    {
      sub: "jmeter-staging-suite",
      email: "jmeter@voyageai.internal",
      role: "USER",
      jti: crypto.randomBytes(16).toString("hex"),
    },
    acc,
    { algorithm: "HS256", expiresIn: 900 }
  );
}
console.log("export JWT_ACCESS_TOKEN=" + JSON.stringify(tok));
console.log("export CSRF_SECRET=" + JSON.stringify(csrf));
NODE
)"

mkdir -p jmeter/results
STAMP="$(date +%Y%m%d-%H%M%S)"
H_JTL="jmeter/results/staging-health-${STAMP}.jtl"
H_HTML="jmeter/results/staging-health-report-${STAMP}"
L_JTL="jmeter/results/staging-landing-${STAMP}.jtl"
L_HTML="jmeter/results/staging-landing-report-${STAMP}"
P_JTL="jmeter/results/staging-planner-${STAMP}.jtl"
P_HTML="jmeter/results/staging-planner-report-${STAMP}"
SLIDE="jmeter/results/staging-load-slide-${STAMP}.html"

echo "=== Health ==="
jmeter -n -t jmeter/health-smoke.jmx -l "$H_JTL" -e -o "$H_HTML" \
  -JHOST="$HOST" -JPORT="$PORT" -JPROTOCOL="$PROTOCOL" \
  -JTHREADS="${THREADS_HEALTH:-10}" -JRAMP_SEC="${RAMP_HEALTH:-15}" -JLOOPS="${LOOPS_HEALTH:-20}"

echo "=== Landing ==="
jmeter -n -t jmeter/landing-smoke.jmx -l "$L_JTL" -e -o "$L_HTML" \
  -JHOST="$HOST" -JPORT="$PORT" -JPROTOCOL="$PROTOCOL" \
  -JTHREADS="${THREADS_LANDING:-10}" -JRAMP_SEC="${RAMP_LANDING:-15}" -JLOOPS="${LOOPS_LANDING:-20}"

echo "=== Planner (LLM — keep THREADS_PLANNER/LOOPS_PLANNER low) ==="
jmeter -n -t jmeter/planner-smoke.jmx -l "$P_JTL" -e -o "$P_HTML" \
  -JHOST="$HOST" -JPORT="$PORT" -JPROTOCOL="$PROTOCOL" \
  -JJWT="$JWT_ACCESS_TOKEN" -JCSRF_SECRET="$CSRF_SECRET" \
  -JTHREADS="${THREADS_PLANNER:-3}" -JRAMP_SEC="${RAMP_PLANNER:-15}" -JLOOPS="${LOOPS_PLANNER:-2}"

node jmeter/generate-slide-report.mjs "$SLIDE" \
  "$H_JTL" "GET /api/health" \
  "$L_JTL" "GET / (landing)" \
  "$P_JTL" "POST /api/ai/.../planner (LLM)"

echo ""
echo "Slide summary (screenshot this): $SLIDE"
echo "Full JMeter dashboards:"
echo "  $H_HTML/index.html"
echo "  $L_HTML/index.html"
echo "  $P_HTML/index.html"
