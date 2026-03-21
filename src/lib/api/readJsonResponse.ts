export type ReadJsonApiResult =
    | { ok: true; status: number; data: Record<string, unknown> }
    | { ok: false; status: number; userMessage: string };

/**
 * Parse a fetch Response as JSON for internal API routes.
 * Surfaces HTTP status and non-JSON bodies instead of a generic "network error".
 */
export async function readJsonApiResponse(res: Response): Promise<ReadJsonApiResult> {
    const status = res.status;
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) {
        return {
            ok: false,
            status,
            userMessage:
                status === 0
                    ? "No response from server. Is the dev server running on port 3000?"
                    : `Empty response (HTTP ${status}). Check the terminal running Next.js for errors.`,
        };
    }
    try {
        const data = JSON.parse(trimmed) as unknown;
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
            return {
                ok: false,
                status,
                userMessage: `Unexpected response (HTTP ${status}).`,
            };
        }
        return { ok: true, status, data: data as Record<string, unknown> };
    } catch {
        return {
            ok: false,
            status,
            userMessage: `Server returned non-JSON (HTTP ${status}). Often a database or env issue—check the Next.js server terminal.`,
        };
    }
}
