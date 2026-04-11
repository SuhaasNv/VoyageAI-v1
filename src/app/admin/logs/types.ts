/** Shared types for the admin/logs route — imported by both page.tsx and _client.tsx. */

export interface LogEntry {
    id: string;
    ts: string;          // ISO
    layer: "auth" | "ai" | "system";
    action: string;      // e.g. "LOGIN", "REGISTER", "AI_CALL"
    email: string | null;
    requestId: string | null;
    meta: string;        // JSON snippet
}
