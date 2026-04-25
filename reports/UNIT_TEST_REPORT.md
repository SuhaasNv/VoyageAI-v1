# Unit test report (Vitest)

Generated from the same command you can re-run anytime (see below).

**Scope:** Per `vitest.config.ts`, `tests/e2e/**` is **excluded** from this run. This report is **unit + integration-style** tests only (agents, API routes, lib, services, security, etc.). E2E must be run separately with the server up.

## Summary

| Metric | Value |
|--------|--------|
| **Runner** | Vitest 4.x (TypeScript) |
| **Test files** | 35 passed |
| **Tests** | 785 passed, 1 skipped |
| **Failures** | 0 |

## Coverage (all instrumented files)

| Metric | Coverage |
|--------|----------|
| **Statements** | 72.35% |
| **Branches** | 60.27% |
| **Functions** | 79.43% |
| **Lines** | 73.90% |

> Coverage includes `src/`, `tests/fixtures`, and other matched globs per `vitest` config. For slide copy, cite these numbers together with the run date.

## Artifact files (this folder)

| File | Purpose |
|------|---------|
| `vitest-unit-report.json` | Machine-readable full results (Vitest JSON reporter) |
| `vitest-unit-report.xml` | JUnit XML (CI tools, Jenkins, GitLab, etc.) |
| `vitest-unit-console.txt` | Full terminal output including per-file coverage table |
| `UNIT_TEST_REPORT.md` | This summary |

## Regenerate

From the repo root:

```bash
mkdir -p reports
npx vitest run \
  --reporter=default \
  --reporter=json \
  --reporter=junit \
  --outputFile.json=reports/vitest-unit-report.json \
  --outputFile.junit=reports/vitest-unit-report.xml \
  --coverage \
  2>&1 | tee reports/vitest-unit-console.txt
```

HTML coverage: after the command above, open **`coverage/index.html`** in a browser (generated at repo root by `@vitest/coverage-v8`).

## Scope note

- **Unit + integration-style tests** under `tests/` (except `tests/e2e/`) and `src/**` test files are run by default `vitest run`.
- **E2E** (`tests/e2e/`) requires a **live Next.js server**; use your CI E2E job or `npm run dev` plus a dedicated vitest command that does not exclude e2e.
