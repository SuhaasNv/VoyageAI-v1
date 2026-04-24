#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROTOCOL="${1:-http}"
HOST="${2:-localhost}"
PORT="${3:-3000}"

eval "$(node <<'NODE'
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const acc = process.env.JWT_ACCESS_SECRET;
const csrf = process.env.CSRF_SECRET;
if (!acc || !csrf) {
  console.error("Missing JWT_ACCESS_SECRET or CSRF_SECRET in .env.");
  process.exit(1);
}
let tok = process.env.JWT_ACCESS_TOKEN;
if (!tok) {
  tok = jwt.sign(
    { sub: "jmeter-planner", email: "jmeter@voyageai.internal", role: "USER", jti: crypto.randomBytes(16).toString("hex") },
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
JTL="jmeter/results/planner-smoke-${STAMP}.jtl"
HTML="jmeter/results/planner-smoke-report-${STAMP}"

if ! command -v jmeter >/dev/null 2>&1; then
  echo "jmeter not found. Install Apache JMeter or use Docker (see jmeter/README.md)."
  exit 1
fi

jmeter -n -t jmeter/planner-smoke.jmx -l "$JTL" -e -o "$HTML" \
  -JPROTOCOL="$PROTOCOL" \
  -JHOST="$HOST" \
  -JPORT="$PORT" \
  -JJWT="$JWT_ACCESS_TOKEN" \
  -JCSRF_SECRET="$CSRF_SECRET"

echo "Wrote: $JTL"
echo "HTML report: $HTML/index.html"
