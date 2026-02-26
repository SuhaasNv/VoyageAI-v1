/**
 * POST /api/trips/from-ticket
 *
 * Accepts PDF file upload, extracts text, uses LLM to parse trip details, creates Trip.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from "@/lib/api/response";
import { getAuthContext } from "@/lib/api/request";
import { runWithRequestContext } from "@/lib/requestContext";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimiter";
import { formatErrorResponse } from "@/lib/errors";
import { serializeTrip, type TripDTO } from "@/lib/services/trips";
import { getDestinationImage } from "@/lib/services/image.service";
import { extractTripFromTicket } from "@/services/ai/extract-trip-from-ticket.service";
import { PDFParse } from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        await parser.destroy();
        return result.text?.trim() ?? "";
    } catch (err) {
        await parser.destroy().catch(() => {});
        throw err;
    }
}

export async function POST(req: NextRequest) {
    return runWithRequestContext(req, async () => {
        const auth = getAuthContext(req);
        if (!auth) return unauthorizedResponse();

        try {
            await checkRateLimit(`ai:${auth.user.sub}:create-trip`);

            const formData = await req.formData();
            const file = formData.get("file");
            if (!file || !(file instanceof Blob)) {
                return errorResponse("INVALID_INPUT", "Missing or invalid file upload", 400);
            }

            const contentType = file.type;
            if (contentType !== "application/pdf") {
                return errorResponse("INVALID_INPUT", "File must be a PDF", 400);
            }

            if (file.size > MAX_FILE_SIZE) {
                return errorResponse("INVALID_INPUT", "File too large (max 10MB)", 400);
            }

            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const text = await extractTextFromPdf(buffer);

            if (!text || text.length < 10) {
                return errorResponse("INVALID_INPUT", "Could not extract text from PDF", 400);
            }

            const extracted = await extractTripFromTicket(text);

            let imageUrl: string | null = null;
            try {
                imageUrl = await getDestinationImage(extracted.destination);
            } catch {
                imageUrl = null;
            }

            const trip = await prisma.trip.create({
                data: {
                    userId: auth.user.sub,
                    destination: extracted.destination,
                    startDate: new Date(extracted.departureDate),
                    endDate: new Date(extracted.returnDate),
                    imageUrl: imageUrl ?? undefined,
                },
            });

            return successResponse<TripDTO>(serializeTrip(trip), 201);
        } catch (err) {
            logError("[POST /api/trips/from-ticket] Error", err);
            return formatErrorResponse(err);
        }
    });
}
