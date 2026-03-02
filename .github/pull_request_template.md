## Summary

<!-- What does this PR do? Why is it needed? 1-3 sentences. -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor / tech debt (no user-visible change)
- [ ] Performance improvement
- [ ] Documentation update

## What changed?

<!-- Bullet points are fine. Link to relevant files or line numbers. -->

-
-

## How to test

<!-- Steps a reviewer can follow to verify this works. -->

1.
2.

## Checklist

### Code Quality
- [ ] `npx tsc --noEmit` passes locally
- [ ] `npm run lint` passes locally
- [ ] No `console.log` / `console.error` left in — use structured logger (`logInfo` / `logError`)
- [ ] No hardcoded secrets, API keys, or personal data

### Database (skip if no DB changes)
- [ ] Created a Prisma migration (`npx prisma migrate dev --name <description>`)
- [ ] Migration is backwards-compatible (no destructive column drops without a transition period)
- [ ] `npx prisma validate` passes

### AI / LLM (skip if no AI changes)
- [ ] Prompt changes reviewed for injection risks (system override phrases sanitised)
- [ ] Rate limiting is in place for any new public-facing endpoint
- [ ] Errors return structured JSON, not stack traces

### Security
- [ ] New API routes that mutate data require CSRF + authentication checks
- [ ] Public endpoints that don't mutate data are added to `EXEMPT_PATHS` in `csrf.ts`
- [ ] Input is validated with Zod before use

### Environment Variables
- [ ] No new required env vars, OR they are documented below

**New env vars** (if applicable):

| Variable | Description | Required? | Example |
|----------|-------------|-----------|---------|
| `VAR_NAME` | What it does | Yes/No | `some-value` |

## Screenshots (if UI changed)

<!-- Before / after, or a short screen recording. -->
