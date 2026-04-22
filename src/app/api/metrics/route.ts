/**
 * GET /api/metrics
 *
 * Prometheus scrape endpoint. Exposes all registered metrics in the standard
 * text exposition format.
 *
 * Security: restricted to internal/infrastructure callers only.
 * In production, protect this route at the load-balancer / reverse-proxy
 * layer (e.g. only allow the Prometheus pod's IP, or require a bearer token
 * via the METRICS_SCRAPE_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { registry } from "@/lib/monitoring/registry";

// Eagerly import all metric modules so their instruments are registered
// before the first scrape even if no request has triggered them yet.
import "@/lib/monitoring/apiMetrics";
import "@/lib/monitoring/llmMetrics";
import "@/lib/monitoring/businessMetrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCRAPE_SECRET = process.env.METRICS_SCRAPE_SECRET;

export async function GET(req: NextRequest): Promise<NextResponse> {
    // Optional bearer-token auth for the scrape endpoint.
    if (SCRAPE_SECRET) {
        const auth = req.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token !== SCRAPE_SECRET) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
    }

    try {
        const metrics = await registry.metrics();
        return new NextResponse(metrics, {
            status: 200,
            headers: { "Content-Type": registry.contentType },
        });
    } catch (err) {
        return new NextResponse(`Error collecting metrics: ${(err as Error).message}`, {
            status: 500,
        });
    }
}
