import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/services/auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "@/services/auth/cookies";
import {
    serializeTrip,
    parseStoredItinerary,
    safeTripContextToItinerary,
    looksLikeSafeTripContext,
} from "@/lib/services/trips";
import { ItinerarySchema, type Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";
import { logError, logInfo } from "@/infrastructure/logger";
import { TripViewClient } from "@/ui/components/trip/TripViewClient";
import { getDestinationImage } from "@/lib/services/image.service";

export default async function TripViewPage({ params }: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) redirect("/login");

    let userId: string;
    try {
        const payload = verifyAccessToken(token);
        userId = payload.sub;
    } catch {
        redirect("/login");
    }

    const { id } = await params;

    // Load trip, latest itinerary, and chat history in parallel.
    const [dbTrip, itineraryRow, dbMessages] = await Promise.all([
        prisma.trip.findUnique({ where: { id } }),
        prisma.itinerary.findFirst({
            where: { tripId: id },
            orderBy: { createdAt: "desc" },
        }),
        prisma.chatMessage.findMany({
            where: { tripId: id },
            orderBy: { createdAt: "asc" },
        }),
    ]);

    if (!dbTrip || dbTrip.userId !== userId) notFound();

    // If the trip has no destination image (Pexels fetch failed at creation or
    // pre-dates the feature), fetch it now and persist so subsequent loads are instant.
    let resolvedTrip = dbTrip;
    if (!resolvedTrip.imageUrl) {
        try {
            const fetched = await getDestinationImage(resolvedTrip.destination);
            if (fetched) {
                await prisma.trip.update({ where: { id }, data: { imageUrl: fetched } });
                resolvedTrip = { ...resolvedTrip, imageUrl: fetched };
                logInfo("[trip] Backfilled imageUrl", { tripId: id });
            }
        } catch {
            // Non-fatal — trip page still renders with gradient placeholder.
        }
    }

    const itinerary = itineraryRow ? parseStoredItinerary(itineraryRow) : [];
    const trip = serializeTrip(resolvedTrip, itinerary);

    const initialMessages: ChatMessageDTO[] = dbMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
    }));

    let rawItinerary: Itinerary | null = null;
    if (itineraryRow?.rawJson) {
        // 1. Try parsing as canonical ItinerarySchema (new saves after the fix).
        const parsed = ItinerarySchema.safeParse(itineraryRow.rawJson);
        if (parsed.success) {
            rawItinerary = parsed.data;
        } else {
            // 2. Fallback: legacy trips saved before the fix stored SafeTripContext directly.
            //    Detect and transform on-the-fly so the page still renders correctly.
            if (looksLikeSafeTripContext(itineraryRow.rawJson)) {
                try {
                    rawItinerary = safeTripContextToItinerary(id, itineraryRow.rawJson);
                    logInfo("[trip] Legacy SafeTripContext adapted to Itinerary", { tripId: id });
                } catch (adaptErr) {
                    logError("[trip] Failed to adapt legacy rawItinerary", { tripId: id, error: adaptErr });
                }
            } else {
                // Unknown format — log field-level errors to aid debugging.
                logError("[trip] Invalid rawItinerary in DB", {
                    tripId: id,
                    errors: parsed.error.flatten(),
                });
            }
        }
    }

    return <TripViewClient trip={trip} rawItinerary={rawItinerary} initialMessages={initialMessages} />;
}
