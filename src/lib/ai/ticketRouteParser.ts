/**
 * Heuristic parser for extracting flight route segments from raw ticket text.
 *
 * Goal:
 * - Handle multi-segment tickets by looking at all detected legs.
 * - Avoid grabbing irrelevant routes (e.g. baggage routing, past trips) by
 *   preferring the main "itinerary" / "flight" section when present.
 *
 * This does NOT try to be a full ticket parser — it only focuses on
 * origin/destination inference that we can safely layer on top of LLM output.
 */

export interface RouteSegment {
    from: string; // IATA code (e.g. DXB)
    to: string;   // IATA code (e.g. SIN)
}

export interface InferredRoute {
    origin: string;
    destination: string;
    segments: RouteSegment[];
}

/**
 * Attempt to narrow down to the itinerary / flight section of the ticket,
 * which usually sits between headers like "FLIGHT / ITINERARY" and
 * "BAGGAGE", "PAYMENT", etc.
 */
function extractItinerarySection(text: string): string {
    const upper = text.toUpperCase();

    const sectionStarts = [
        "FLIGHT / ITINERARY",
        "FLIGHT/ITINERARY",
        "ITINERARY",
        "FLIGHT DETAILS",
        "FLIGHT INFORMATION",
    ];

    const sectionEnds = [
        "BAGGAGE",
        "PAYMENT",
        "FARE CALCULATION",
        "TICKET REMARKS",
        "IMPORTANT INFORMATION",
    ];

    let startIdx = 0;
    for (const marker of sectionStarts) {
        const idx = upper.indexOf(marker);
        if (idx !== -1) {
            startIdx = idx;
            break;
        }
    }

    let endIdx = upper.length;
    for (const marker of sectionEnds) {
        const idx = upper.indexOf(marker, startIdx + 1);
        if (idx !== -1) {
            endIdx = idx;
            break;
        }
    }

    return text.slice(startIdx, endIdx);
}

/**
 * Extract all IATA-based route segments in a given slice of text.
 *
 * Examples matched:
 * - DXB → SIN
 * - DXB - SIN
 * - DXB–SIN
 * - Dubai (DXB) → Singapore (SIN)
 */
function extractRouteSegments(text: string): RouteSegment[] {
    const segments: RouteSegment[] = [];

    const searchSpace = extractItinerarySection(text);

    // 1) Patterns with city names and IATA codes in parentheses:
    //    "Dubai (DXB) → Singapore (SIN)" or "Dubai (DXB) - Singapore (SIN)"
    const cityIataPattern =
        /[A-Za-z\s]+?\(\s*([A-Z]{3})\s*\)\s*[→\-–]\s*[A-Za-z\s]+?\(\s*([A-Z]{3})\s*\)/g;

    let match: RegExpExecArray | null;
    while ((match = cityIataPattern.exec(searchSpace)) !== null) {
        const from = match[1];
        const to = match[2];
        if (from && to) {
            segments.push({ from, to });
        }
    }

    // 2) Plain IATA → IATA patterns, e.g. "DXB → SIN", "JFK - NRT"
    const iataOnlyPattern =
        /\b([A-Z]{3})\b\s*[→\-–]\s*\b([A-Z]{3})\b/g;

    while ((match = iataOnlyPattern.exec(searchSpace)) !== null) {
        const from = match[1];
        const to = match[2];
        if (from && to) {
            segments.push({ from, to });
        }
    }

    // Deduplicate consecutive identical segments
    const deduped: RouteSegment[] = [];
    for (const seg of segments) {
        const last = deduped[deduped.length - 1];
        if (!last || last.from !== seg.from || last.to !== seg.to) {
            deduped.push(seg);
        }
    }

    return deduped;
}

/**
 * Infer the overall journey as:
 *   first segment origin  →  last segment destination
 *
 * If we can't reliably detect at least one segment, returns null.
 */
export function inferRouteFromTicketText(text: string): InferredRoute | null {
    const segments = extractRouteSegments(text);
    if (!segments.length) return null;

    const first = segments[0];
    const last = segments[segments.length - 1];

    return {
        origin: first.from,
        destination: last.to,
        segments,
    };
}

