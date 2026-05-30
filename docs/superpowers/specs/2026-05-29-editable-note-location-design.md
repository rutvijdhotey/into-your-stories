# Editable Location on Notes — Design

**Date:** 2026-05-29
**Backlog item:** QA #2 — "Editable location on note capture"
**Branch:** `backlog/editable-note-location`

## Problem

Capture auto-fills a note's location from GPS or from the photo's EXIF, then shows it
**read-only** (`📍 {city}` pill in `NoteCaptureSheet`). When the source is wrong, the
user cannot fix it.

Concrete failure (from device QA): an *edited* photo carries the wrong EXIF GPS — e.g. a
photo of a Paris trip resolves to **Mountain View, CA**. The note then shows "Mountain
View", and its pin lands in California on the trip map. There is no way to correct it,
either at capture time or afterward (`NoteEditSheet` has no location field at all, and
`updateNote` never patches location).

## Goal

Let the user type the correct location ("Paris") and have the note's **label, map pin,
and destination grouping** all follow — at capture time *and* when editing an existing
note.

## Non-goals (YAGNI)

- No map / drag-a-pin coordinate picker.
- No separate "place" vs "city" inputs — one field.
- No reverse-geocode-as-you-type; geocoding happens once, on save.
- No change to the offline note queue or photo-upload flow.

## Data model (already exists, no migration)

`notes` has: `lat`, `lng`, `city`, `place_name`. Display precedence today:
- `NoteCard` shows `place_name`.
- Map callout title is `place_name ?? city`.
- `city` drives destination grouping.

So a correct fix must touch `place_name` (what's shown), `lat`/`lng` (map pin), and
`city` (grouping) together.

## Design

### 1. One shared `LocationField` component

A single **"Location"** text input, pre-filled with what the user currently sees for the
note (`place_name ?? city ?? ''`). The user overwrites it ("Paris"). Built once and reused:

- **`NoteCaptureSheet`** — replaces the read-only `📍 {city}` pill with this editable
  field, still pre-filled from the auto-resolved location (GPS / EXIF reverse-geocode).
  While locating, it shows the existing "Locating…" affordance.
- **`NoteEditSheet`** — a new field (none today), pre-filled from the saved note.

### 2. Save behavior — only acts if the field was edited

Track whether the user actually changed the field (`wasEdited`). If untouched, location
persistence is **unchanged** from today (capture uses EXIF-over-GPS coords + resolved
city; edit leaves location alone).

If edited:

1. Forward-geocode the typed text via `expo-location` `geocodeAsync`.
2. **Success** → `lat`/`lng` = geocoded coords; `place_name` = the typed text verbatim;
   `city` = clean city name from a reverse-geocode of the new coords (falls back to the
   typed text if reverse-geocode yields nothing).
3. **Failure / offline / empty result** → keep the typed `place_name`, but **clear**
   `lat`/`lng` and `city` (drop the bad pin rather than keep a stale one).

If the user clears the field entirely → `place_name`, `city`, `lat`, `lng` all become
`null`.

### 3. Stop AI tagging from re-clobbering a manual location

Today `mergeTags` **always** takes the AI's `place_name`, and `updateNote` re-flags every
edit as `tagging_status='pending'` (triggering a re-tag). That would overwrite a manual
"Paris" on the next tag pass.

Fix: **`mergeTags` keeps an existing `place_name` if one is already set** — the same rule
it already applies to `city`. After this, a re-tag only fills blanks, so a manually-set
location survives. This is the only change outside the two sheets and the service layer.

### 4. Logic placement (testability)

- `locationService.geocodeLocation(text): Promise<{ lat: number; lng: number } | null>` —
  thin `expo-location` wrapper; returns `null` on empty input, no result, or throw.
- `locationService.reverseCity(lat, lng): Promise<string | null>` — wrapper around
  `reverseGeocodeAsync` returning a city/district or `null`. (Capture already inlines this
  for EXIF; extract so both paths share it.)
- **Pure helper** `resolveLocationEdit(args): { lat, lng, city, place_name }` — given the
  typed text, `wasEdited`, the auto-resolved coords/city, and the geocode/reverse results,
  returns the column patch. All branching lives here, unit-tested, no native calls. The
  sheets call `geocodeLocation` / `reverseCity` then pass results into this helper.
- `CreateNoteInput` and `UpdateNoteInput` extended to carry `place_name` and (for
  `updateNote`) `lat`/`lng`/`city`. Capture does not send `place_name` today.

## Edge cases

- **Not edited:** zero behavior change; no geocode call.
- **Offline + edited:** geocode fails → typed label kept, pin dropped (no crash, no block).
- **Edited to empty:** all four location columns null.
- **Geocode returns multiple hits:** take the first (expo returns best match first).
- **Edit re-tag:** `updateNote` keeps setting `tagging_status='pending'`; the `mergeTags`
  change ensures the manual `place_name`/`city` are preserved on the subsequent tag pass.

## Tests

- `resolveLocationEdit` — edited+geocode-success, edited+geocode-fail (drop pin),
  not-edited passthrough, edited-to-empty (all null).
- `geocodeLocation` — mocked `expo-location`: coords / empty array / throws.
- `reverseCity` — mocked: city present / absent.
- `mergeTags` — new case: an already-set `place_name` is preserved over the AI suggestion.

## Files touched

- `src/components/LocationField.tsx` (new)
- `src/components/NoteCaptureSheet.tsx`
- `src/components/NoteEditSheet.tsx`
- `src/services/locationService.ts`
- `src/services/locationHelpers.ts` (new, pure — holds `resolveLocationEdit`)
- `src/services/noteService.ts` (`CreateNoteInput`, `UpdateNoteInput`, `updateNote`)
- `src/services/taggingHelpers.ts` (`mergeTags`)
- Matching `__tests__` files.

No migration. No new dependencies (`expo-location` already installed).
