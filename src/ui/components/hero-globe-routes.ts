import type { GlobeArc, GlobeMarker } from "@/ui/components/ui/cobe-globe";

/** Stable refs for <Globe markers={...} arcs={...} /> — avoids effect churn on parent re-render */
export const HERO_GLOBE_MARKERS: GlobeMarker[] = [
    { id: "nyc", location: [40.7128, -74.006], label: "New York" },
    { id: "london", location: [51.5074, -0.1278], label: "London" },
    { id: "sydney", location: [-33.8688, 151.2093], label: "Sydney" },
    { id: "tokyo", location: [35.6762, 139.6503], label: "Tokyo" },
    { id: "sf", location: [37.7749, -122.4194], label: "San Francisco" },
    { id: "dubai", location: [25.2048, 55.2708], label: "Dubai" },
    { id: "mumbai", location: [19.076, 72.8777], label: "India" },
];

export const HERO_GLOBE_ARCS: GlobeArc[] = [
    {
        id: "nyc-london",
        from: [40.7128, -74.006],
        to: [51.5074, -0.1278],
        label: "NYC → London",
    },
    {
        id: "sydney-tokyo",
        from: [-33.8688, 151.2093],
        to: [35.6762, 139.6503],
        label: "Sydney → Tokyo",
    },
    {
        id: "tokyo-sf",
        from: [35.6762, 139.6503],
        to: [37.7749, -122.4194],
        label: "Tokyo → SF",
    },
    {
        id: "dubai-india",
        from: [25.2048, 55.2708],
        to: [19.076, 72.8777],
        label: "Dubai → India",
    },
];
