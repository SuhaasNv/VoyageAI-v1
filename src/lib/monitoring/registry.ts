/**
 * Prometheus metrics registry — singleton, HMR-safe.
 *
 * Uses the Node.js global to survive Next.js hot-module reloads in dev AND
 * the two-pass build (SSR + page-data collection) that Next.js 15+ performs,
 * preventing "metric already registered" errors on each reload/rebuild.
 */

import {
    Registry,
    collectDefaultMetrics,
    Counter, Histogram, Gauge,
    type CounterConfiguration,
    type HistogramConfiguration,
    type GaugeConfiguration,
} from "prom-client";

declare global {
    var __promRegistry: Registry | undefined; // eslint-disable-line no-var
}

function createRegistry(): Registry {
    const reg = new Registry();
    reg.setDefaultLabels({ app: "voyageai", service: "nextjs" });
    collectDefaultMetrics({ register: reg, prefix: "nodejs_" });
    return reg;
}

export const registry: Registry =
    globalThis.__promRegistry ?? (globalThis.__promRegistry = createRegistry());

// ── "Get or create" helpers ───────────────────────────────────────────────────
// These prevent "metric already registered" errors when the module is evaluated
// more than once (Next.js SSR + page-data collection during `next build`, HMR
// in dev, etc.).  They look up an existing metric by name in the global registry
// before constructing a new one.

export function getOrCreateCounter<L extends string>(
    config: CounterConfiguration<L>,
): Counter<L> {
    return (
        (registry.getSingleMetric(config.name) as Counter<L> | undefined) ??
        new Counter<L>({ ...config, registers: [registry] })
    );
}

export function getOrCreateHistogram<L extends string>(
    config: HistogramConfiguration<L>,
): Histogram<L> {
    return (
        (registry.getSingleMetric(config.name) as Histogram<L> | undefined) ??
        new Histogram<L>({ ...config, registers: [registry] })
    );
}

export function getOrCreateGauge<L extends string>(
    config: GaugeConfiguration<L>,
): Gauge<L> {
    return (
        (registry.getSingleMetric(config.name) as Gauge<L> | undefined) ??
        new Gauge<L>({ ...config, registers: [registry] })
    );
}
