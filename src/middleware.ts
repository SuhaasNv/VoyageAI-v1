/**
 * middleware.ts
 *
 * Next.js middleware entry point. Delegates to proxy.ts for the actual logic.
 *
 * This file MUST be named "middleware.ts" and live in src/ (or root) for
 * Next.js to recognize and run it on matched requests.
 */

export { proxy as middleware, config } from "./proxy";
