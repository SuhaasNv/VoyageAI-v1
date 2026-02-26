export const tokyoTripData = {
    id: "tokyo-5-day",
    title: "Tokyo Tech & Culture Immersive",
    destination: "Tokyo, Japan",
    dates: "Oct 15 - Oct 20, 2026",
    status: "upcoming",
    budget: {
        total: 3000,
        spent: 1250,
        currency: "USD",
    },
    fatigueLevel: "medium", // 'low', 'medium', 'high'
    itinerary: [
        {
            day: 1,
            date: "Oct 15",
            title: "Arrival & Shinjuku Neon Lights",
            events: [
                { id: "e1", time: "14:00", title: "Arrive at Haneda Airport", type: "transit", location: "Haneda", cost: 0 },
                { id: "e2", time: "16:00", title: "Check-in at Shinjuku Granbell", type: "hotel", location: "Shinjuku", cost: 800 },
                { id: "e3", time: "19:00", title: "Dinner at Omoide Yokocho", type: "food", location: "Shinjuku", cost: 30 },
            ]
        },
        {
            day: 2,
            date: "Oct 16",
            title: "Asakusa Tradition & Akihabara Tech",
            events: [
                { id: "e4", time: "09:00", title: "Senso-ji Temple", type: "sightseeing", location: "Asakusa", cost: 0 },
                { id: "e5", time: "12:30", title: "Sushi Zanmai Lunch", type: "food", location: "Tsukiji", cost: 45 },
                { id: "e6", time: "15:00", title: "Akihabara Electronics Town", type: "exploration", location: "Akihabara", cost: 100 },
                { id: "e7", time: "20:00", title: "Robot Restaurant (Alt)", type: "entertainment", location: "Shinjuku", cost: 75 },
            ]
        },
        {
            day: 3,
            date: "Oct 17",
            title: "Shibuya Energy & Harajuku",
            events: [
                { id: "e8", time: "10:00", title: "Meiji Shrine", type: "sightseeing", location: "Harajuku", cost: 0 },
                { id: "e9", time: "13:00", title: "Takeshita Street & Crepes", type: "food", location: "Harajuku", cost: 15 },
                { id: "e10", time: "16:00", title: "Shibuya Crossing & Hachiko", type: "sightseeing", location: "Shibuya", cost: 0 },
                { id: "e11", time: "19:30", title: "Izakaya Hopping", type: "food", location: "Shibuya", cost: 60 },
            ]
        },
        {
            day: 4,
            date: "Oct 18",
            title: "TeamLab & Odaiba Views",
            events: [
                { id: "e12", time: "10:30", title: "teamLab Planets", type: "entertainment", location: "Toyosu", cost: 35 },
                { id: "e13", time: "13:30", title: "Ramen Street Lunch", type: "food", location: "Tokyo Station", cost: 15 },
                { id: "e14", time: "16:00", title: "Odaiba Seaside Park", type: "exploration", location: "Odaiba", cost: 0 },
                { id: "e15", time: "19:00", title: "Dinner with Bay View", type: "food", location: "Odaiba", cost: 80 },
            ]
        },
        {
            day: 5,
            date: "Oct 19",
            title: "Ueno Park & Departure",
            events: [
                { id: "e16", time: "09:30", title: "Ueno Park & National Museum", type: "sightseeing", location: "Ueno", cost: 10 },
                { id: "e17", time: "13:00", title: "Last Minute Shopping", type: "exploration", location: "Ginza", cost: 0 },
                { id: "e18", time: "17:00", title: "Depart for Haneda", type: "transit", location: "Haneda", cost: 5 },
            ]
        }
    ]
};

export const upcomingTripsData = [
    tokyoTripData,
    {
        id: "paris-weekend",
        title: "Paris Weekend Getaway",
        destination: "Paris, France",
        dates: "Nov 10 - Nov 13, 2026",
        status: "upcoming",
        budget: { total: 1500, spent: 400, currency: "USD" },
        fatigueLevel: "low",
        itinerary: []
    },
    {
        id: "iceland-roadtrip",
        title: "Iceland Ring Road",
        destination: "Reykjavik, Iceland",
        dates: "Dec 05 - Dec 15, 2026",
        status: "planning",
        budget: { total: 4000, spent: 0, currency: "USD" },
        fatigueLevel: "high",
        itinerary: []
    }
];
