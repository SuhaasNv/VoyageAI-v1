# Dashboard Performance Audit

**Targets:** Cold < 1.5s, Warm < 500ms

---

## Changes Made

### 1. Background revalidation (stale-while-revalidate)

`GET /api/trips` no longer blocks on Pexels when the image cache misses:

- **Cache hit:** Return trips with image URLs immediately (Redis lookup only).
- **Cache miss:** Return trips with `imageUrl: null` immediately; fire-and-forget background fetch populates cache and DB. Next request gets images.

This keeps response time under targets regardless of Pexels latency.

### 2. Cache-only lookup

`getDestinationImageCachedOnly()` in `src/lib/services/image.service.ts`:

- Checks Redis only; never calls Pexels.
- Returns `{ type: "hit", url }` or `{ type: "miss" }`.

### 3. Server-Timing header

`GET /api/trips` adds `Server-Timing` with `db`, `cache`, and `total` durations for debugging.

---

## Measuring Performance

1. Start dev server: `npm run dev`
2. Log in at http://localhost:3000/login
3. Copy `voyageai_at` cookie from DevTools → Application → Cookies
4. Run:

```bash
COOKIE="voyageai_at=<your-token>" npm run measure-perf
```

For **cold cache** test: run `npm run clear-image-cache` first, then `npm run measure-perf`.

---

## Expected Results

| Scenario | Target | Notes |
|---------|--------|-------|
| Cold (no Redis hit) | < 1.5s | DB + Redis checks; images return null, background revalidate |
| Warm (Redis hit) | < 500ms | DB + Redis; images included |
