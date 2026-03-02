/**
 * middleware.ts  (Next.js Edge Middleware)
 *
 * Runs on every matched request BEFORE it reaches route handlers.
 *
 * Responsibilities:
 *  1. CSRF validation on state-mutating API routes (POST / PUT / PATCH / DELETE)
 *  2. Add security response headers on every response
 *
 * Token validation is performed in API routes and page layouts using verifyAccessToken().
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/middleware/csrf";

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest): Promise<NextResponse> {
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
    const scriptSrc = isProduction
        ? "'self'"
        : "'self' 'unsafe-inline' 'unsafe-eval'";
    const styleSrc = isProduction
        ? "'self' https://fonts.googleapis.com"
        : "'self' 'unsafe-inline' https://fonts.googleapis.com";

    response.headers.set(
        "Content-Security-Policy",
        [
            "default-src 'self'",
            `script-src ${scriptSrc}`,
            `style-src ${styleSrc}`,
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https://images.pexels.com https://images.unsplash.com https://i.pravatar.cc https://lh3.googleusercontent.com",
            "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://generativelanguage.googleapis.com https://api.groq.com https://api.pexels.com",
            "worker-src blob:",
            "child-src blob:",
            "frame-ancestors 'none'",
        ].join("; ")
    );

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
