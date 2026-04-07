/**
 * Session-scoped short-term conversational memory.
 *
 * Stores the last N user ↔ assistant exchanges per session. When a session
 * fills up, the two oldest messages are compressed into a compact preamble
 * so recent context is always preserved without an extra LLM call.
 *
 * Storage strategy:
 *   Production (REDIS_URL set): Redis.
 *     Each session is a JSON blob stored with a 30-minute EX TTL.
 *     This is safe across serverless cold starts and multiple instances.
 *
 *   Development / no Redis: In-process Map with lazy TTL pruning.
 *     Sessions are lost on cold starts (acceptable for local dev).
 *
 * Redis access uses a shared server-side client configured via REDIS_URL.
 */

import { logError } from "@/infrastructure/logger";
import { getRedisClient } from "@/lib/redis";

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
const SESSION_TTL_SEC = 30 * 60;           // 30-minute inactivity TTL (Redis EX)
const SESSION_TTL_MS = SESSION_TTL_SEC * 1_000;
const PREAMBLE_MAX_CHARS = 400;            // hard cap on the compressed preamble
const PRUNE_EVERY = 30;                    // in-memory fallback: prune every N writes

/**
 * Hard cap for the final rendered context string.
 * ~2 000 chars ≈ 500 tokens — keeps memory overhead small.
 */
const MAX_CONTEXT_CHARS = 2_000;

// ─── Redis client (optional) ──────────────────────────────────────────────────

// ─── In-memory fallback store ─────────────────────────────────────────────────

let writeCount = 0;
const memoryStore = new Map<string, Session>();

function pruneExpiredSessions(): void {
    const threshold = Date.now() - SESSION_TTL_MS;
    for (const [key, session] of memoryStore) {
        if (session.lastTouchedMs < threshold) memoryStore.delete(key);
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Compress two messages into a single short sentence. */
function compressPair(a: MemoryMessage, b: MemoryMessage): string {
    const fmt = (m: MemoryMessage): string => {
        const tag = m.role === "user" ? "User" : "AI";
        const snippet = m.content.replace(/\n+/g, " ").slice(0, 100);
        return `${tag}: ${snippet}${m.content.length > 100 ? "…" : ""}`;
    };
    return `${fmt(a)} | ${fmt(b)}`;
}

function applyCapAndCompress(session: Session): Session {
    while (session.messages.length > MAX_MESSAGES) {
        const pair = session.messages.splice(0, 2);
        if (pair.length < 2 || !pair[0] || !pair[1]) break;
        const snippet = compressPair(pair[0] as MemoryMessage, pair[1] as MemoryMessage);
        const separator = session.preamble ? " … " : "";
        const combined = (session.preamble ?? "") + separator + snippet;
        session.preamble =
            combined.length > PREAMBLE_MAX_CHARS
                ? combined.slice(combined.length - PREAMBLE_MAX_CHARS)
                : combined;
    }
    return session;
}

// ─── Redis-backed read/write ──────────────────────────────────────────────────

async function redisGet(sessionId: string): Promise<Session | null> {
    try {
        const redis = getRedisClient();
        if (!redis) return null;
        const raw = await redis.get(`mem:${sessionId}`);
        if (!raw) return null;
        return JSON.parse(raw) as Session;
    } catch (err) {
        logError("[memory] Redis GET failed, using in-memory fallback", err);
        return null;
    }
}

async function redisSet(sessionId: string, session: Session): Promise<void> {
    try {
        const redis = getRedisClient();
        if (!redis) return;
        await redis.set(`mem:${sessionId}`, JSON.stringify(session), "EX", SESSION_TTL_SEC);
    } catch (err) {
        logError("[memory] Redis SET failed, falling back to in-memory store", err);
        // Persist to in-memory store so the session is not lost for this instance.
        memoryStore.set(sessionId, session);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Push a new message into the session.
 *
 * When the session is at capacity (MAX_MESSAGES), the two oldest messages are
 * compressed into the session preamble so recent context is always preserved.
 */
export async function updateMemory(sessionId: string, role: Role, content: string): Promise<void> {
    const redis = getRedisClient();
    const now = Date.now();

    let session: Session;

    if (redis) {
        session = (await redisGet(sessionId)) ?? { messages: [], lastTouchedMs: now };
    } else {
        if (++writeCount % PRUNE_EVERY === 0) pruneExpiredSessions();
        session = memoryStore.get(sessionId) ?? { messages: [], lastTouchedMs: now };
    }

    session.messages.push({ role, content: content.slice(0, MSG_CONTENT_CAP) });
    session.lastTouchedMs = now;
    applyCapAndCompress(session);

    if (redis) {
        await redisSet(sessionId, session);
    } else {
        memoryStore.set(sessionId, session);
    }
}

/**
 * Return a formatted context block for injection above a user prompt.
 * Returns an empty string when the session has no prior history.
 */
export async function buildMemoryContext(sessionId: string): Promise<string> {
    const redis = getRedisClient();
    let session: Session | null = null;

    if (redis) {
        session = await redisGet(sessionId);
    } else {
        session = memoryStore.get(sessionId) ?? null;
    }

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
 * Trims to the nearest line boundary when possible.
 */
export function trimToTokenLimit(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const tail = text.slice(text.length - maxChars);
    const boundary = tail.indexOf("\n");
    return boundary > 0 ? tail.slice(boundary + 1) : tail;
}

/** Remove a specific session from both Redis and the in-memory fallback. */
export async function clearMemory(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.del(`mem:${sessionId}`);
        } catch {
            // ignore
        }
    }
    memoryStore.delete(sessionId);
}
