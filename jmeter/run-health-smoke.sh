#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p jmeter/results
STAMP="$(date +%Y%m%d-%H%M%S)"
JTL="jmeter/results/health-smoke-${STAMP}.jtl"
HTML="jmeter/results/health-smoke-report-${STAMP}"

if ! command -v jmeter >/dev/null 2>&1; then
  echo "jmeter not found. Install Apache JMeter or use Docker (see jmeter/README.md)."
  exit 1
fi

jmeter -n -t jmeter/health-smoke.jmx -l "$JTL" -e -o "$HTML" \
  -JHOST="${JMETER_HOST:-localhost}" \
  -JPORT="${JMETER_PORT:-3000}" \
  -JPROTOCOL="${JMETER_PROTOCOL:-http}"

echo "Wrote: $JTL"
echo "HTML report: $HTML/index.html"
