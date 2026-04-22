/**
 * Prometheus metrics registry — singleton, HMR-safe.
 *
 * Uses the Node.js global to survive Next.js hot-module reloads in dev,
 * preventing "metric already registered" errors on each file change.
 */

import { Registry, collectDefaultMetrics } from "prom-client";

declare global {
    // eslint-disable-next-line no-var
    var __promRegistry: Registry | undefined;
}

function createRegistry(): Registry {
    const reg = new Registry();
    reg.setDefaultLabels({ app: "voyageai", service: "nextjs" });
    collectDefaultMetrics({ register: reg, prefix: "nodejs_" });
    return reg;
}

export const registry: Registry =
    globalThis.__promRegistry ?? (globalThis.__promRegistry = createRegistry());
