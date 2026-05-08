# Module 7 — Maps & Places
**App:** Into Your Stories
**Status:** Design doc — pending approval before execution
**Depends on:** Module 6 (places table populated), Module 2 (TripDetailScreen shell)

---

## Purpose

Make the Map tab in Trip Detail functional. Display all Places from a trip as color-coded pins on Apple Maps. Implement the personal Destinations screen — a cross-trip view of every city the user has visited, filterable by category.

After this module: users can spatially review a trip and browse their full personal travel history.

---

## Maps: Technical Approach

**Library:** `react-native-maps` with `PROVIDER_DEFAULT` (Apple Maps on iOS — free, native, no API key required).

**Map style:** Dark map style to match the app's `#111111` background. Apple Maps supports this via `userInterfaceStyle: 'dark'`.

---

## TripMapScreen

Replaces the Map tab placeholder in TripDetailScreen (Module 2).

**Map behavior:**
- Centers on the bounding box of all Places in the trip on load. If no places yet: centers on the first destination city using a geocoded coordinate (stored when trip is created or first note is saved).
- Pins are rendered for every `places` row belonging to the trip.
- Each pin is color-coded by category:
  - Food: `#FF9F0A` (amber-orange)
  - Stay: `#30D158` (green)
  - Activity: `#0A84FF` (blue)
  - Shopping: `#FF375F` (pink)
  - To-Visit: `#BF5AF2` (purple)
  - General: `#8E8E93` (muted grey)

**PlaceCallout:**
Tapping a pin opens a native callout with:
- Place name (bold)
- Category badge (colored)
- Note content snippet (first 80 chars of the linked note)
- Tapping the callout navigates to the full NoteCard / note detail (simple screen showing full note content + photos)

**Category filter:**
A horizontal filter row above the map (not overlaid). Selecting a category hides pins of other categories. "All" resets. Uses the same `CategoryPicker` component built in Module 3.

**Empty state:**
No places yet → map renders centered on destination city with a subtle banner: "Places appear here as you capture notes with locations."

---

## Destinations Screen (Personal)

Accessible from: the link in HomeScreen's header and from TripDetailScreen's header.

**What it shows:**
Every city the user has logged at least one Place in, across all trips — their personal travel history.

**Layout:**
- Alphabetically sorted list of city names, each with a count of total places
- Tapping a city → city detail view: all the user's Places in that city across all their trips, filterable by category
- Category filter (same `CategoryPicker`) across the top
- Each place shown as a list row: name, category badge, trip name it came from, date

**No map on Destinations screen:**
Personal Destinations is a reference list, not a map. The goal is quick lookup — "what was that restaurant I liked in Kyoto?" A list is faster to scan than a map for this use case. A map could be added in V2.

**Distinction from Explore:**
- Destinations = your own places from your own notes (private)
- Explore → Destination Page = community places from all published posts (public)
These are completely separate data sources with different access patterns.

---

## File Structure

```
src/
  screens/
    trip/
      TripMapScreen.tsx       ← replaces placeholder from Module 2
    DestinationsScreen.tsx    ← replaces placeholder from Module 1
    destinations/
      CityDetailScreen.tsx    ← places list for one city, filterable
  components/
    PlacePin.tsx              ← custom map marker with category color
    PlaceCallout.tsx          ← tap-to-show note snippet
    CategoryFilter.tsx        ← reused from Module 3's CategoryPicker
  services/
    placeService.ts           ← getPlacesForTrip, getPlacesByCity (already started in Module 6)
  navigation/
    types.ts                  ← add CityDetail route param
```

**New dep:** `react-native-maps`

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Map provider | Apple Maps (PROVIDER_DEFAULT) | Free, no API key, native iOS look |
| Map style | Dark mode | Matches app aesthetic |
| Pin colors | 6 fixed colors per category | Consistent, learnable; matches theme colors defined in Module 0 |
| Category filter | Above map, not overlaid | Overlaid controls obscure the map; row above keeps map clean |
| Destinations | List, not map | Lookup use case favors scan-ability over spatial orientation |
| Community map | Deferred to Module 10 | Community destination pages are part of Explore, not this module |
| Note detail from callout | Navigate to note detail screen | Tapping callout should open full note, not try to show it in a tiny callout |
