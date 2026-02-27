/**
 * RAG context store — stub for future embeddings.
 * storeTravelDNA / getTravelDNA for Travel DNA persistence.
 */

import type { TravelDNA } from "./schemas";
import { prisma } from "@/lib/prisma";
import { buildTravelDNARules } from "./travelDNARules";

export async function storeTravelDNA(userId: string, preferences: TravelDNA): Promise<void> {
  // Stub: no embeddings yet
}

export async function getTravelDNA(userId: string): Promise<TravelDNA | null> {
  // Stub
  return null;
}

export async function getTravelPreferenceContext(userId: string): Promise<string> {
  try {
    const preference = await prisma.travelPreference.findUnique({
      where: { userId }
    });

    if (!preference || !preference.data) return "";

    const data = preference.data as Record<string, unknown>;
    const rules = buildTravelDNARules(data);
    return rules ? rules + "\n" : "";
  } catch {
    return "";
  }
}
