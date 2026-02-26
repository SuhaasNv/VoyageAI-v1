# **🚀 VoyageAI – Product Roadmap Checklist**

---

## **🧠 1. AI Assistant (Core Experience)**

- AI Assistant embedded directly in the Dashboard
- Natural language trip creation
    
    *Example: “Plan a trip to Dubai from March 12 to March 30”*
    
- Automatically creates trip from AI prompt
- Newly created trip appears in **Active Trips**
- AI Assistant powered by RAG (Retrieval-Augmented Generation)
- AI suggestions contextual to user’s existing trips
- AI Assistant accessible globally (Dashboard + Trip View)

---

## **💰 2. Budget & Financial Logic**

- Budget Overview card fully functional
- Budget automatically calculated from itinerary
- Trip creation flow includes:
    - Budget input
    - Trip style selection (Relaxed / Creative / Exciting / Luxury / Budget)
- Budget dynamically updates after itinerary generation
- Pricing tiers defined
- Stripe subscription implementation
- Upgrade / Downgrade flows working

---

## **🎉 3. New User Onboarding**

- Confetti animation on first login
- Welcome onboarding flow
- Ask for travel preferences:
    - Budget range
    - Preferred trip style
    - Favorite destinations
    - Travel pace (Slow / Moderate / Fast)
- Store preferences for personalization

---

## **🗺 4. Map & Animation Experience**

- Mapbox full implementation (production-grade)
- 3D cinematic map mode
- Animated flight paths matching trip itinerary
- Dashboard flight animations synced with actual trips
- Smooth “Generate Itinerary” animation:
    - Route draws progressively
    - AI loading animation
    - Then itinerary reveals smoothly
- Dynamic trip map reflects itinerary changes

---

## **📅 5. Calendar & Trip Timeline**

- Dashboard calendar fully dynamic
- Trip dates auto-filled on calendar
- Active trip days highlighted
- Clicking a date shows relevant itinerary
- Calendar syncs with trip edits

---

## **🖼 6. Images & Suggestions**

- Destination images match actual country/city
- Suggestions are context-aware
- Suggestions align with:
    - User preferences
    - Existing trips
    - Budget level
- Suggestions use correct country visuals
- No incorrect image mismatches

---

## **✈️ 7. Smart Trip Creation**

- Upload flight ticket PDF
- Extract trip details via AI:
    - Destination
    - Departure date
    - Return date
    - Airline
- Auto-create trip from PDF
- Prompt user for:
    - Budget
    - Trip style
- Automatically generate itinerary

---

## **🧾 8. Settings & Profile**

- Modern, innovative Settings page
- Update profile details
- Travel preferences editable
- Subscription management section
- Billing history (if Stripe active)
- Security section (logout everywhere, etc.)

---

## **📂 9. Navigation & UX Improvements**

- “View All Trips” in sidebar
- No freezing during logout
- Fix logout state flicker (“Welcome back” issue)
- Proper loading states
- Remove UI blocking during auth transitions

---

## **🏗 10. Performance & Stability**

- Smooth itinerary generation animations
- No blocking UI during API calls
- Proper loading skeletons
- Optimized API calls (no unnecessary refetch)
- Proper error boundaries

---

## **📊 11. Observability & Hardening (Pre-Launch)**

- AI rate limiting hardened
- Structured logging implemented
- AI usage tracking
- Image fetch analytics
- Error tracking
- Graceful fallbacks everywhere

---

# **🌟 Vision Layer**

- Cinematic Dark Travel Intelligence experience
- Not a travel blog — a Travel OS
- Intelligence-first UX
- Map-driven storytelling
- AI-native product feel

---

# **⚠ Immediate Bug to Fix**

- Logout freeze issue
    
    → Likely auth state mismatch or blocking async call
    
    → Needs non-blocking logout + proper state reset
    

---

# **🧠 Big Picture**

You are building:

Not just a trip planner.

You are building a:

**Travel Intelligence Platform**

This checklist is already startup-level.
