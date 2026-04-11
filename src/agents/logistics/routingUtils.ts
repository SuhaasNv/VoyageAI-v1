import type { Activity, ScheduledActivity } from "@/agents/shared/tripPipelineTypes";
import { logStructured } from "@/infrastructure/logger";
import type { GeoCoordinate } from "@/services/mapbox";

export interface MatrixLookup {
    matrix: number[][];
    indexMap: Map<string, number>; 
}

const DEFAULT_STAY_MINS: Record<Activity["type"], number> = {
    experience: 150,
    attraction: 120,
    restaurant: 90
};

export function buildScheduledDay(
    hotel: GeoCoordinate & { id: string },
    activitiesToSchedule: (Activity & { id: string })[],
    matrixData: MatrixLookup
): ScheduledActivity[] {
    
    if (activitiesToSchedule.length === 0) return [];
    
    const scheduled: ScheduledActivity[] = [];
    const unvisited = new Set(activitiesToSchedule);
    
    let currentMins = 9 * 60; // Start at 09:00
    const DAY_END_MINS = 19 * 60; // 19:00
    let currentLocId = hotel.id;

    while (unvisited.size > 0) {
        // Fallback natively to index 0 (hotel) if an ID somehow mapped illegally
        const matrixIndexFrom = matrixData.indexMap.get(currentLocId) ?? 0;

        let nearestAct: (Activity & { id: string }) | null = null;
        let shortestTravelMins = Infinity;

        // Nearest neighbor sweep
        for (const candidate of unvisited) {
            let travelMins = 20; // safe arbitrary distance
            const matrixIndexTo = matrixData.indexMap.get(candidate.id);
            
            if (matrixIndexTo !== undefined && matrixData.matrix[matrixIndexFrom]?.[matrixIndexTo] !== undefined) {
                travelMins = matrixData.matrix[matrixIndexFrom][matrixIndexTo] as number;
            } else {
                // Not in matrix (e.g. truncated), skip/penalize heavily
                travelMins = 999; 
            }

            if (travelMins < shortestTravelMins) {
                shortestTravelMins = travelMins;
                nearestAct = candidate;
            }
        }

        if (!nearestAct) {
            // Technically should not happen unless unvisited is 0 or all acts have issues, 
            // but breaks loop safely
            break; 
        }

        // Apply transit & evaluate end
        currentMins += shortestTravelMins;
        const stayDuration = DEFAULT_STAY_MINS[nearestAct.type] || 120;
        const endBlockMins = currentMins + stayDuration;
        
        if (endBlockMins > DAY_END_MINS && scheduled.length > 0) {
             const droppedCount = unvisited.size;
             logStructured({ layer: "service", service: "routing", step: "activities_dropped", data: { droppedCount, dayLimiter: "19:00" } });
             break; 
        }

        const startStr = `${String(Math.floor(currentMins/60)).padStart(2, '0')}:${String(currentMins%60).padStart(2,'0')}`;
        const endStr = `${String(Math.floor(endBlockMins/60)).padStart(2, '0')}:${String(endBlockMins%60).padStart(2,'0')}`;
        const timeSlot = currentMins < 12 * 60 ? "morning" : (currentMins < 17 * 60 ? "afternoon" : "evening");

        scheduled.push({
            ...nearestAct,
            timeSlot,
            startTime: startStr,
            endTime: endStr,
            travelTimeFromPrevMs: shortestTravelMins * 60000
        });

        currentMins = endBlockMins + 15; // 15 min bumper
        currentLocId = nearestAct.id;
        unvisited.delete(nearestAct);
    }
    
    logStructured({ layer: "service", service: "routing", step: "route_built", data: { totalScheduled: scheduled.length } });
    return scheduled;
}
