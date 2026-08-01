# Module 2 — Trip Management
**App:** Notebound
**Status:** Design doc — pending approval before execution
**Depends on:** Module 0 (schema), Module 1 (auth + nav shell)

---

## Purpose

Make the Home tab functional. Users can create trips, view them in a list, navigate into a trip, and end a trip when they're done traveling. The Trip Detail screen is a shell with placeholder Feed and Map tabs — those are filled by Modules 3 and 7 respectively.

After this module: the app is navigable and trip-shaped, but notes and maps are empty.

---

## Trip Lifecycle

```
Create → Active → Completed → [Blog generated in Module 9] → Published or Discarded
```

- **Active:** User is currently traveling. Notes can be added. Multiple trips can be active simultaneously.
- **Completed:** User has tapped "End Trip." No more notes can be added. "Generate Blog" becomes available.
- **Deleted:** Hard delete in V1 — cascades to all notes, places, and photos for that trip. No soft delete to keep scope tight.

---

## Screens & Components

### HomeScreen

The first screen after login. Shows the user's trips.

**Layout:**
- Header: "My Trips" title + link to personal Destinations view (secondary, not a tab)
- Active trips section — cards sorted by `created_at` descending
- Completed trips section — same sort; collapsed by default if more than 3 (expand on tap)
- "Start new trip" primary CTA button — fixed at bottom, always visible
- Empty state (no trips): centered illustration + "Start your first trip" heading + CTA button

**TripCard:**
- Full-width card on dark surface (`#1C1C1E`)
- Cover photo (blurred placeholder gradient if no photo yet)
- Trip name (large, bold)
- Destination(s) — comma-separated city names
- Date range — e.g., "Apr 12 – Apr 20" or "Apr 12 – ongoing" if no end date
- Note count badge — e.g., "24 notes"
- Status badge — amber "Active" or muted "Completed"
- Tap → navigates to TripDetailScreen

---

### CreateTripSheet

Bottom sheet modal triggered by the "Start new trip" button.

**Fields:**
- Trip name — required text field (e.g., "Japan 2024")
- Destination(s) — text input; allows multiple cities as comma-separated or tag-style chips
- Start date — optional date picker (defaults to today)
- End date — optional date picker

**Behavior:**
- Tapping Create immediately creates the trip in Supabase and adds it to the top of the Active section
- Sheet dismisses on success
- Trip name is the only required field — user can fill in dates later (or never)

---

### TripDetailScreen

Accessible by tapping a TripCard. Top-level screen for a single trip.

**Header:**
- Trip name
- Destination(s) + date range
- Status badge
- "End Trip" button — visible only when status is `active`; tapping shows a confirmation alert before marking completed
- "Generate Blog" button — visible only when status is `completed` and no blog draft exists yet (wired in Module 9; placeholder tap handler here)

**Tab switcher (segmented control, not bottom tabs):**
- Feed — placeholder in this module; filled by Module 3
- Map — placeholder in this module; filled by Module 7

---

## Data Flow

**Create trip:**
`CreateTripSheet` → `tripService.createTrip()` → insert into `trips` → `useTrips` hook reacts → HomeScreen re-renders with new card at top.

**End trip:**
Confirmation alert → `tripService.endTrip(id)` → update `status = 'completed'` → card moves to Completed section.

**Delete trip:**
Long-press on TripCard → action sheet with "Delete Trip" destructive option → confirmation alert → `tripService.deleteTrip(id)` → hard delete cascades to notes + places.

**Load trips:**
`useTrips` hook subscribes to Supabase realtime on the `trips` table for the current user. Changes (create, update, delete) reflect immediately without a manual refresh.

---

## File Structure

```
src/
  services/
    tripService.ts          ← createTrip, getTrips, getTripById, endTrip, deleteTrip
  hooks/
    useTrips.ts             ← reactive trip list with loading/error state
    useTripDetail.ts        ← single trip by ID
  screens/
    HomeScreen.tsx          ← replaces placeholder from Module 1
    trip/
      TripDetailScreen.tsx  ← shell with tab switcher
      TripFeedScreen.tsx    ← placeholder (Module 3)
      TripMapScreen.tsx     ← placeholder (Module 7)
  components/
    TripCard.tsx
    CreateTripSheet.tsx
    TripStatusBadge.tsx
    EmptyState.tsx          ← reusable; used across the app
  navigation/
    types.ts                ← add TripDetail + TripFeed + TripMap route params
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Multiple active trips | Allowed | Real travel is messy; users overlap trips |
| Trip deletion | Hard delete | Cascade is clean; no orphaned notes; V1 scope |
| Cover photo source | Set from first note photo; or manually later | Zero friction on create; fills naturally through use |
| note_count | Denormalized column updated by DB trigger | Avoids COUNT(*) on every Home load |
| Completed section | Collapsed if > 3 | Keeps active trips prominent; completed is reference material |
| Realtime subscription | Supabase realtime on trips table | Instant UI updates; no pull-to-refresh required |
| "Generate Blog" button | Placeholder tap in this module | Wired fully in Module 9; presence here sets navigation contract |
