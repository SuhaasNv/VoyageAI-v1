#!/usr/bin/env node
/**
 * One-page HTML summary from JMeter .jtl files (CSV) for deck screenshots.
 * Usage:
 *   node jmeter/generate-slide-report.mjs <output.html> <jtl1> <title1> [<jtl2> <title2> ...]
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function parseJtl(path) {
    const raw = readFileSync(path, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    if (lines.length < 2) {
        return { samples: 0, errors: 0, elapsed: [], codes: [], label: "" };
    }
    const elapsed = [];
    const codes = [];
    let errors = 0;
    let label = "";
    const ts = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const parts = line.split(",");
        const t = Number(parts[0]);
        const e = Number(parts[1]);
        const lbl = parts[2] ?? "";
        const code = parts[3] ?? "";
        const success = parts[7] === "true";
        if (!label && lbl) label = lbl;
        if (!Number.isNaN(t)) ts.push(t);
        if (!Number.isNaN(e)) elapsed.push(e);
        codes.push(code);
        if (!success) errors += 1;
    }
    const n = elapsed.length;
    const sorted = [...elapsed].sort((a, b) => a - b);
    const pct = (p) => {
        if (!sorted.length) return 0;
        const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
        return sorted[idx];
    };
    const durationMs = ts.length >= 2 ? Math.max(1, ts[ts.length - 1] - ts[0]) : 1;
    const throughput = (n / durationMs) * 1000;
    return {
        samples: n,
        errors,
        errorPct: n ? (100 * errors) / n : 0,
        avg: n ? elapsed.reduce((a, b) => a + b, 0) / n : 0,
        min: n ? sorted[0] : 0,
        max: n ? sorted[sorted.length - 1] : 0,
        p90: n ? pct(90) : 0,
        throughput,
        label,
    };
}

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const argv = process.argv.slice(2);
if (argv.length < 3 || argv.length % 2 === 0) {
    console.error(
        "Usage: node jmeter/generate-slide-report.mjs <out.html> <jtl> <title> [<jtl> <title> ...]"
    );
    process.exit(1);
}

const outPath = resolve(argv[0]);
const scenarios = [];
for (let i = 1; i < argv.length; i += 2) {
    scenarios.push({ jtl: resolve(argv[i]), title: argv[i + 1] });
}

const rows = scenarios.map(({ jtl, title }) => {
    const m = parseJtl(jtl);
    return { title, ...m, jtl };
});

const when = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VoyageAI — staging load summary</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(160deg, #0f172a 0%, #1e293b 45%, #0f172a 100%);
      color: #e2e8f0;
      min-height: 100vh;
      padding: 48px 56px;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      color: #f8fafc;
    }
    .sub {
      font-size: 1rem;
      color: #94a3b8;
      margin-bottom: 36px;
      line-height: 1.5;
    }
    .sub a { color: #38bdf8; text-decoration: none; }
    .sub a:hover { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(15, 23, 42, 0.6);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45);
    }
    th, td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    }
    th {
      background: rgba(51, 65, 85, 0.5);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      font-weight: 600;
    }
    tr:last-child td { border-bottom: none; }
    td.num { font-variant-numeric: tabular-nums; text-align: right; }
    td.scene { font-weight: 600; color: #f1f5f9; }
    .foot {
      margin-top: 28px;
      font-size: 0.85rem;
      color: #64748b;
    }
    .ok { color: #4ade80; }
    .warn { color: #fbbf24; }
  </style>
</head>
<body>
  <h1>VoyageAI staging — load test summary</h1>
  <p class="sub">
    Target: <a href="https://voyageai-nextjs-staging-clhvq.ondigitalocean.app/">voyageai-nextjs-staging-clhvq.ondigitalocean.app</a><br />
    Generated: ${esc(when)} · JMeter CSV (.jtl) aggregates (approx. throughput from sample window)
  </p>
  <table>
    <thead>
      <tr>
        <th>Scenario</th>
        <th class="num">Samples</th>
        <th class="num">Throughput / s</th>
        <th class="num">Avg ms</th>
        <th class="num">p90 ms</th>
        <th class="num">Min / max ms</th>
        <th class="num">Errors</th>
      </tr>
    </thead>
    <tbody>
${rows
    .map(
        (r) => `      <tr>
        <td class="scene">${esc(r.title)}</td>
        <td class="num">${r.samples}</td>
        <td class="num">${r.throughput.toFixed(2)}</td>
        <td class="num">${Math.round(r.avg)}</td>
        <td class="num">${Math.round(r.p90)}</td>
        <td class="num">${Math.round(r.min)} / ${Math.round(r.max)}</td>
        <td class="num ${r.errors ? "warn" : "ok"}">${r.errors} (${r.errorPct.toFixed(1)}%)</td>
      </tr>`
    )
    .join("\n")}
    </tbody>
  </table>
  <p class="foot">
    Open the full JMeter HTML dashboards next to this file (<code>staging-*-report-*/index.html</code>) for charts and response-time percentiles.
    Planner scenario includes real LLM latency; keep concurrency low to control cost and rate limits.
  </p>
</body>
</html>
`;

writeFileSync(outPath, html, "utf8");
console.log("Wrote", outPath);
