/**
 * POST /api/ai/extract-ticket
 *
 * Phase 1 of the flight-ticket wizard.
 * Accepts a PDF upload, extracts readable text, and uses the LLM to parse
 * structured trip details from it.
 *
 * NO DB writes — purely ephemeral extraction.
 *
 * Returns: ExtractTripFromTicketOutput
 *   { destination, departureCity, departureDate, returnDate, airline?, flightNumber? }
 */

import { NextRequest } from "next/server";

// pdf-parse requires the full Node.js runtime (not Edge).
export const runtime = "nodejs";

import { extractTripFromTicket } from "@/services/ai/extract-trip-from-ticket.service";
import { extractTextFromPdf } from "@/lib/pdf/extractText";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/infrastructure/logger";
import { checkRateLimit } from "@/security/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { successResponse, errorResponse, unauthorizedResponse } from "@/lib/api/response";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse("Authentication required");

        try {
            await checkRateLimit(`ai:${auth.user.sub}:extract-ticket`);

            const formData = await req.formData();
            const file = formData.get("file");

            if (!file || !(file instanceof Blob)) {
                return errorResponse("INVALID_INPUT", "Missing file — attach a PDF as form field 'file'", 400);
            }

            if (file.type !== "application/pdf") {
                return errorResponse("INVALID_INPUT", "File must be a PDF (application/pdf)", 400);
            }

            if (file.size > MAX_FILE_SIZE) {
                return errorResponse("INVALID_INPUT", "File too large — max 10 MB", 400);
            }

            let text: string;
            try {
                const buffer = Buffer.from(await file.arrayBuffer());
                text = await extractTextFromPdf(buffer);
            } catch (parseErr) {
                logError("[POST /api/ai/extract-ticket] PDF parse error", parseErr);
                return errorResponse(
                    "INVALID_INPUT",
                    "Could not read this PDF. It may be corrupted, encrypted, or image-based (scanned). Try a text-based e-ticket.",
                    422
                );
            }

            if (!text || text.length < 20) {
                return errorResponse(
                    "INVALID_INPUT",
                    "Could not extract readable text from this PDF. Use a text-based e-ticket (not a scanned image).",
                    422
                );
            }

            const extracted = await extractTripFromTicket(text);

            return successResponse(extracted, 200);
        } catch (err) {
            logError("[POST /api/ai/extract-ticket]", err);
            return formatErrorResponse(err);
        }
    });
}
