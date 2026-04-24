# JMeter load tests

## Prerequisites

- [Apache JMeter](https://jmeter.apache.org/download_jmeter.cgi) 5.6+ on your `PATH` (`jmeter` command), **or** run via Docker (see below).
- **App running** locally or deployed: `npm run dev` / `npm run start` (default `http://localhost:3000`).

## 1. Health endpoint (no auth)

Baseline latency / throughput for `GET /api/health`. Safe for CI-style smoke load; does not call the LLM.

```bash
# Defaults: host=localhost, port=3000, protocol=http, 20 threads, 30s ramp, 50 loops each
./jmeter/run-health-smoke.sh

# Custom target (e.g. staging)
jmeter -n -t jmeter/health-smoke.jmx \
  -l jmeter/results/health-smoke.jtl \
  -e -o jmeter/results/health-smoke-report \
  -JHOST=api.example.com -JPORT=443 -JPROTOCOL=https
```

**Note:** If `LANGGRAPH_SERVICE_URL` is set, `/api/health` may return **503** when LangGraph is down; JMeter still treats **200 and 503** as success (server handled the request).

## 2. Planner endpoint (requires JWT)

**Warning:** Each request runs the real planner (LLM) unless your server uses `LLM_PROVIDER=mock`. This burns tokens and may hit **rate limits** (`429`).

1. Obtain a valid **access** JWT (same as the app uses in `Authorization: Bearer …`).
2. Run:

```bash
export JWT_ACCESS_TOKEN="eyJ..."
./jmeter/run-planner-smoke.sh
```

Override host/port if needed:

```bash
JWT_ACCESS_TOKEN="..." ./jmeter/run-planner-smoke.sh https staging.example.com 443
```

## Docker (no local JMeter install)

```bash
docker run --rm -v "$PWD:/work" -w /work justb4/jmeter:latest \
  jmeter -n -t jmeter/health-smoke.jmx -l jmeter/results/health.jtl \
  -e -o jmeter/results/health-report -JHOST=host.docker.internal -JPORT=3000
```

On Linux, replace `host.docker.internal` with your machine IP or use `--network host`.

## Artifacts

- `*.jtl` — raw samples (open in JMeter GUI or aggregate with `JMeterPluginsCMD` if installed).
- HTML report folder from `-e -o` — summary tables and graphs for slides.

## Interpreting results

- **Health test:** measures app + optional LangGraph probe overhead — **not** full pipeline cost.
- **Planner test:** end-to-end stage latency under concurrency; expect **429** if Redis rate limiting is enabled and load is high — that is a valid finding, not a “failed” test definition.
