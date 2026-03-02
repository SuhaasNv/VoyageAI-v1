/**
 * Session-scoped short-term conversational memory.
 *
 * Stores the last N user ↔ assistant exchanges per session in an in-memory
 * Map. When a session fills up, the two oldest messages are compressed into
 * a compact preamble string so recent context is always preserved without
 * an extra LLM call.
 *
 * Lifetime: process-scoped (Node.js server lifetime). In serverless
 * environments, sessions persist while the function instance is warm.
 * Stale sessions are pruned lazily every PRUNE_EVERY writes.
 *
 * No DB writes. No external dependencies.
 */

type Role = "user" | "assistant";

export interface MemoryMessage {
    role: Role;
    content: string;
}

interface Session {
    messages: MemoryMessage[];
    /** Compact one-liner representing exchanges that were trimmed off the front. */
    preamble?: string;
    lastTouchedMs: number;
}

const MAX_EXCHANGES = 5;                    // 5 user+assistant pairs in full
const MAX_MESSAGES = MAX_EXCHANGES * 2;     // = 10 raw messages max
const MSG_CONTENT_CAP = 1_000;             // chars stored per individual message
const SESSION_TTL_MS = 30 * 60 * 1_000;   // 30-minute inactivity TTL
const PREAMBLE_MAX_CHARS = 400;            // hard cap on the compressed preamble
const PRUNE_EVERY = 30;                    // prune stale sessions every N writes

/**
 * Hard cap for the final rendered context string.
 * ~2 000 chars ≈ 500 tokens — keeps memory overhead small.
 */
const MAX_CONTEXT_CHARS = 2_000;

let writeCount = 0;
const store = new Map<string, Session>();

// ─────────────────────────────────────────
//  Internal helpers
// ─────────────────────────────────────────

function pruneExpiredSessions(): void {
    const threshold = Date.now() - SESSION_TTL_MS;
    for (const [key, session] of store) {
        if (session.lastTouchedMs < threshold) store.delete(key);
    }
}

/** Compress two messages into a single short sentence. */
function compressPair(a: MemoryMessage, b: MemoryMessage): string {
    const fmt = (m: MemoryMessage): string => {
        const tag = m.role === "user" ? "User" : "AI";
        const snippet = m.content.replace(/\n+/g, " ").slice(0, 100);
        return `${tag}: ${snippet}${m.content.length > 100 ? "…" : ""}`;
    };
    return `${fmt(a)} | ${fmt(b)}`;
}

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────

/**
 * Push a new message into the session.
 *
 * When the session is at capacity (MAX_MESSAGES), the two oldest messages
 * are compressed into the session preamble and removed. This preserves
 * a rolling window of recent context without unbounded growth.
 */
export function updateMemory(sessionId: string, role: Role, content: string): void {
    if (++writeCount % PRUNE_EVERY === 0) pruneExpiredSessions();

    const now = Date.now();
    const session: Session = store.get(sessionId) ?? { messages: [], lastTouchedMs: now };

    session.messages.push({ role, content: content.slice(0, MSG_CONTENT_CAP) });
    session.lastTouchedMs = now;

    // When over the cap, compress the oldest exchange (user + assistant = 2 messages)
    // into the session preamble and drop them from the live list.
    while (session.messages.length > MAX_MESSAGES) {
        const pair = session.messages.splice(0, 2);
        // Guard: splice may return fewer than 2 if messages are somehow unpaired.
        if (pair.length < 2 || !pair[0] || !pair[1]) break;
        const oldest = pair as [MemoryMessage, MemoryMessage];
        const snippet = compressPair(oldest[0], oldest[1]);
        const separator = session.preamble ? " … " : "";
        const combined = (session.preamble ?? "") + separator + snippet;
        // Keep only the tail so the preamble never grows beyond its cap.
        session.preamble =
            combined.length > PREAMBLE_MAX_CHARS
                ? combined.slice(combined.length - PREAMBLE_MAX_CHARS)
                : combined;
    }

    store.set(sessionId, session);
}

/**
 * Return a formatted context block for injection above a user prompt.
 * Returns an empty string when the session has no prior history.
 *
 * The block includes:
 *   - A compact preamble for older exchanges (if any were trimmed).
 *   - The most recent MAX_EXCHANGES turns in full.
 */
export function buildMemoryContext(sessionId: string): string {
    const session = store.get(sessionId);
    if (!session) return "";

    const hasContent = session.messages.length > 0 || !!session.preamble;
    if (!hasContent) return "";

    const lines: string[] = ["### Conversation Context (this session)"];

    if (session.preamble) {
        lines.push(`_Earlier:_ ${session.preamble}`, "");
    }

    for (const msg of session.messages) {
        const label = msg.role === "user" ? "User" : "Assistant";
        const snippet =
            msg.content.length > 300 ? msg.content.slice(0, 300) + "…" : msg.content;
        lines.push(`**${label}:** ${snippet}`);
    }

    return trimToTokenLimit(lines.join("\n"), MAX_CONTEXT_CHARS);
}

/**
 * Hard-cap a string to `maxChars` characters, keeping the most recent tail.
 * Trims to the nearest line boundary when possible so the output starts
 * at a clean line rather than mid-sentence.
 */
export function trimToTokenLimit(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const tail = text.slice(text.length - maxChars);
    const boundary = tail.indexOf("\n");
    return boundary > 0 ? tail.slice(boundary + 1) : tail;
}

/** Remove a specific session from the store. Exposed for testing. */
export function clearMemory(sessionId: string): void {
    store.delete(sessionId);
}
