/**
 * proxy.ts  (Next.js 16+ request proxy, formerly middleware)
 *
 * Runs on every matched request BEFORE it reaches route handlers (Node.js runtime).
 *
 * Responsibilities:
 *  1. CSRF validation on state-mutating API routes (POST / PUT / PATCH / DELETE)
 *  2. Add security response headers on every response
 *
 * Token validation is performed in API routes and page layouts using verifyAccessToken().
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/middleware/csrf";
import { recordRequest, normaliseRoute } from "@/lib/monitoring/apiMetrics";

// ─────────────────────────────────────────────────────────────────────────────
// Proxy
// ─────────────────────────────────────────────────────────────────────────────

export async function proxy(req: NextRequest): Promise<NextResponse> {
    const proxyStart = performance.now();
    const { pathname } = req.nextUrl;

    // ── 1. CSRF validation for state-mutating API routes ──────────────────────
    const csrfResult = await checkCsrf(req);
    if (csrfResult) return csrfResult;

    // ── 2. Request ID and pathname (for server components) ─────────────────────
    const requestId = crypto.randomUUID();
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", requestId);
    requestHeaders.set("x-pathname", pathname);

    // ── 3. Security headers ───────────────────────────────────────────────────
    // Generate a per-request nonce for CSP script-src allowlisting.
    // Next.js App Router reads x-nonce from the request headers and
    // automatically applies it to the inline hydration scripts it emits.
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });

    response.headers.set("X-Request-ID", requestId);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
    );
    response.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload"
    );

    const isProduction = process.env.NODE_ENV === "production";

    // 'strict-dynamic' lets the nonce-allowed scripts (Next.js runtime) load
    // additional trusted scripts without needing individual allowlisting.
    const scriptSrc = isProduction
        ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
        : "'self' 'unsafe-inline' 'unsafe-eval'";

    // framer-motion applies animation values as element style="" attributes —
    // not <style> tags — so nonces cannot cover them. 'unsafe-inline' is the
    // only viable option here; it carries minimal risk (CSS can't exfiltrate
    // tokens or run code the way inline scripts can).
    const styleSrc = `'self' 'unsafe-inline' https://fonts.googleapis.com`;

    const csp = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        `style-src ${styleSrc}`,
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://images.pexels.com https://images.unsplash.com https://lh3.googleusercontent.com",
        "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://generativelanguage.googleapis.com https://api.openai.com https://api.pexels.com",
        "worker-src 'self' blob:",
        "child-src blob:",
        "frame-ancestors 'none'",
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);

    // ── Metrics: record this request after headers are set ────────────────────
    // We hook into the response here; the actual duration is measured from the
    // start of the proxy function via a timing header injected by Next.js, or
    // we use the monotonic clock. For middleware, we capture wall-clock delta.
    const durationMs = Math.round(performance.now() - proxyStart);
    const statusCode = response.status ?? 200;
    recordRequest({
        method: req.method,
        route:  normaliseRoute(pathname),
        statusCode,
        durationMs,
    });

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         *  - _next/static (static files)
         *  - _next/image (image optimization)
         *  - favicon.ico
         *  - public folder files
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)",
    ],
};
