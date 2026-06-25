# Venue-Name Precedence — Design

**Date:** 2026-06-24
**Backlog item:** 3.5 — Venue-name resolution fix (precursor to the public layer)
**Branch:** `backlog/venue-name-precedence`

## Problem

A note's `place_name` is the only public free-text field and the dedupe key for
the future `public_places` community map. Today it is usually a street/area
label, not the venue, so it would dedupe poorly and read badly.

The flow:

1. **Capture** — `reverseGeocodePlace` (`locationService.ts`) collapses the
   device reverse-geocode into `place_name = r.name ?? r.street ?? city ?? …`.
   On iOS this is usually a street or area, rarely a clean venue.
2. **Tagging** — `tagNote` (`taggingService.ts`) calls the `tag-note` edge
   function, which *does* extract the real venue from the note text. It then
   calls `mergeTags` (`taggingHelpers.ts`), whose rule is
   `existing.place_name ?? suggestion.place_name`. Because the geocoder's
   `place_name` is almost always non-null, Claude's venue is discarded.

`location_source` (`'gps' | 'exif' | 'manual' | 'inferred'`) records how the
location was resolved, but `mergeTags` never receives it, so it cannot tell a
user-typed name from a geocoder guess.

## Decision

Precedence for `place_name`: **manual user-typed name > AI-extracted venue >
geocoder label.**

The AI venue beats *any* non-manual geocoder value (decided 2026-06-24). We do
not try to protect a "real" geocoder POI from being overridden — iOS rarely
returns a clean POI, and Claude reads the actual note text, so it is the better
source whenever it finds a venue. This avoids a new column and a POI-vs-street
detector. The geocoder label is kept only as a fallback when the AI found no
venue.

## Changes

### `src/services/taggingHelpers.ts`

- `ExistingTags` gains `location_source?: LocationSource | null` (imported from
  `./locationHelpers`).
- `mergeTags` `place_name` resolution becomes:

  ```ts
  // Manual user-typed names are authoritative; otherwise the AI-extracted
  // venue wins over the geocoder's street/area label, which only fills in
  // when the AI found no venue.
  place_name:
    existing.location_source === 'manual'
      ? existing.place_name ?? null
      : suggestion.place_name ?? existing.place_name ?? null,
  ```

- `category` and `city` resolution are unchanged
  (`existing.category ?? suggestion.category`,
  `existing.city ?? suggestion.city`). The geocoder's city is reliable; only
  `place_name` was wrong. Explicitly out of scope.

### `src/services/taggingService.ts`

- Pass `location_source: note.location_source` into the existing-tags object
  handed to `mergeTags`. One line.

### Out of scope

- No migration. No `tag-note` edge-function change — it already extracts the
  venue. `reverseGeocodePlace` is left as-is; the geocoder label remains the
  pre-tagging and no-venue fallback, which is acceptable.
- The `public_places` aggregate and what to do with venueless notes are the
  later public-layer task's concern.

## Testing (`src/services/__tests__/taggingHelpers.test.ts`)

- **Update** the existing "preserves a manually-set place_name" test to set
  `location_source: 'manual'` on the existing tags — this preserves its intent
  under the new rule (without it, the name is no longer treated as manual).
- **Add:** a non-manual (`location_source: 'gps'`) existing `place_name` IS
  overridden by the AI suggestion's venue.
- **Add:** when the AI suggestion's `place_name` is null, the geocoder
  `place_name` is kept (fallback), regardless of source.
- **Add:** `location_source: 'manual'` with a non-null venue suggestion keeps
  the manual name (explicit manual-wins case).

## Forward-compatibility

This makes `place_name` carry the venue, so the future `public_places` dedupe
(normalized `place_name` + city) groups real venues instead of street labels.
