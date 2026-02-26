/**
 * RAG context store — stub for future embeddings.
 * storeTravelDNA / getTravelDNA for Travel DNA persistence.
 */

import type { TravelDNA } from "./schemas";

export async function storeTravelDNA(userId: string, preferences: TravelDNA): Promise<void> {
  // Stub: no embeddings yet
}

export async function getTravelDNA(userId: string): Promise<TravelDNA | null> {
  // Stub
  return null;
}
