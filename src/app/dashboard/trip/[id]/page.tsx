import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyAccessToken } from "@/services/auth/tokens";
import { ACCESS_TOKEN_COOKIE } from "@/services/auth/cookies";
import { serializeTrip, parseStoredItinerary } from "@/lib/services/trips";
import { ItinerarySchema, type Itinerary } from "@/lib/ai/schemas";
import type { ChatMessageDTO } from "@/app/api/trips/[id]/chat/route";
import { logError } from "@/infrastructure/logger";
import { TripViewClient } from "@/ui/components/trip/TripViewClient";

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

    const itinerary = itineraryRow ? parseStoredItinerary(itineraryRow) : [];
    const trip = serializeTrip(dbTrip, itinerary);

    const initialMessages: ChatMessageDTO[] = dbMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt.toISOString(),
    }));

    let rawItinerary: Itinerary | null = null;
    if (itineraryRow?.rawJson) {
        const parsed = ItinerarySchema.safeParse(itineraryRow.rawJson);
        if (parsed.success) {
            rawItinerary = parsed.data;
        } else {
            logError("[trip] Invalid rawItinerary in DB", { tripId: id, errors: parsed.error.flatten() });
        }
    }

    return <TripViewClient trip={trip} rawItinerary={rawItinerary} initialMessages={initialMessages} />;
}
