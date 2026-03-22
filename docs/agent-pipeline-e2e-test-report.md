# Agent pipeline E2E test report

## 1. Agent status

| Agent    | Status |
| -------- | ------ |
| Planner  | PASS   |
| Research | PASS   |
| Logistics| PASS   |
| Budget   | PASS   |
| Safety   | PASS   |

## 2. Issues found

None. Only a pre-existing setup issue: `vitest` and `vite-tsconfig-paths` were listed in `package.json` but not installed in `node_modules`. Ran `npm install` — resolved.

## 3. Data flow status: PASS

Pipeline executed in exact order on every run: **Planner → Research → Logistics → Budget → Safety**. Log confirms each agent receives and passes context correctly:

- **Planner** outputs `destination`: Tokyo, `durationDays`: 5
- **Research** outputs `days`: 2, `hotels`: 1
- **Logistics** outputs `selectedHotel`: Hotel A
- **Budget** outputs `totalCost`: 400, `isOverBudget`: false
- **Safety** outputs `riskLevel`: low

All edge cases also verified:

- Over-budget loop with `reoptimize_budget` → resolves in 2nd pass
- Dense schedule with `rerun_logistics` → resolves in 2nd pass
- `ask_user` → immediate human-in-the-loop return
- `proceed` override → returns `ok: true`
- Loop exhaustion after 3 iterations → `requiresHuman: true`
- LLM decision layer failure → fallback to `reoptimize_budget`, no crash
- All individual agent failure paths return `ok: false` with correct `stage` field
- `executionLog` resets between runs

## 4. Overall result: WORKING

**48 / 48** tests passed in **672ms**. The full agent pipeline is functioning correctly end-to-end.
