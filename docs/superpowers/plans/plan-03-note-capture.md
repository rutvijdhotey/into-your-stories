# Module 3 — Note Capture
**App:** Notebound
**Status:** Design doc — pending approval before execution
**Depends on:** Module 0 (schema), Module 1 (auth + nav), Module 2 (trip management)

---

## Purpose

Implement the core capture loop: tap the floating button → write a note → save it. The note is immediately visible in the trip feed. Everything is offline-first — a note saved in airplane mode is never lost.

Voice input (Module 4) and photos (Module 5) are stubs here — the capture sheet has mic and photo picker elements but they don't function yet. AI tagging (Module 6) is also deferred — notes save with `tagging_status = 'pending'` and the NoteCard shows a shimmer until tags arrive.

After this module: the full text-capture loop works end-to-end. Trip feeds show real notes.

---

## NoteCaptureSheet

A bottom sheet modal, globally accessible from the FloatingCaptureButton on every screen in the authenticated app. Uses a sliding bottom sheet (not a full modal screen) to feel lightweight and fast.

### Layout (top to bottom)

**Drag handle** — visual affordance at top; swipe down to dismiss.

**Trip selector row** — immediately below the handle:
- **One active trip:** displays trip name as a non-interactive label. User doesn't need to choose.
- **Multiple active trips:** horizontal scrollable row of trip name chips; the most recently used trip is pre-selected; user taps to switch.
- **No active trips:** inline prompt — "No active trips. [Start one →]" tapping the link dismisses the sheet and opens CreateTripSheet.

**Text input** — primary input. Multi-line, auto-expanding (no fixed height). Placeholder: *"What's on your mind?"*. Keyboard auto-focuses on sheet open.

**Category selector** — horizontal scrollable row of pills below the text input:
`Food · Stay · Activity · Shopping · To-Visit · General`
Default: none selected (note saves as uncategorized until AI tags it in Module 6). User can optionally pre-select.

**Bottom action row:**
- Left: mic button — stub (placeholder icon; no-op tap; wired in Module 4)
- Left: photo picker icon — stub (placeholder; wired in Module 5)
- Right: location indicator — shows "📍 Locating..." while GPS resolves, then city name once available
- Far right: "Save" button — amber, always visible

---

## Capture & Save Flow

```
User taps FloatingCaptureButton
  → NoteCaptureSheet opens
  → GPS request fires in background (non-blocking)
  → User types note, selects optional category
  → Taps Save
    → Generate offline_id (UUID) on client
    → Write note to AsyncStorage queue immediately
    → Optimistically add note to TripFeedScreen (with "Syncing..." indicator)
    → Attempt Supabase insert
      → Success: remove from queue, update note with server ID, clear indicator
      → Failure (offline): stays in queue, indicator persists
  → Sheet dismisses
```

The note appears in the feed **before** Supabase confirms. The user is never blocked waiting for a network response.

---

## Offline Queue

Backed by AsyncStorage. A simple ordered list of pending note payloads.

**Drain trigger:** Fires when:
1. App moves from background to foreground
2. NetInfo reports connectivity restored
3. App starts and queue is non-empty

**Drain behavior:** Process items in insertion order. Each item attempts a Supabase insert. On success: remove from queue, update the optimistic note in the feed with the real server ID. On failure: leave in queue, retry on next drain.

**Deduplication:** Each note carries a client-generated `offline_id`. The Supabase insert uses an `ON CONFLICT (offline_id) DO NOTHING` clause. Safe to retry as many times as needed.

---

## GPS Tagging

Location permission requested the first time the capture sheet opens. Uses `expo-location`.

**On save:**
- If permission granted and GPS available: attach `lat`, `lng` to the note. City name derived from reverse geocoding (Expo's built-in `reverseGeocodeAsync`).
- If permission denied or GPS unavailable: note saves without coordinates. City stays null. Module 6's AI tagging will attempt to extract location from note content as a fallback.

GPS is captured **at the moment of Save**, not when the sheet opens — accounts for long typing sessions where the user has moved.

---

## TripFeedScreen

The Feed tab of TripDetailScreen. Shows all notes for the trip in reverse chronological order (most recent first — matches the mental model of a real-time diary).

**NoteCard layout:**
- Category badge (colored pill) — if set; empty space if uncategorized (tags pending)
- Note content — full text, no truncation in feed (notes are typically short)
- Place name — empty until Module 6; no placeholder text shown (badge appears organically)
- City + relative timestamp — e.g., "Tokyo · 2 hours ago"
- Photo thumbnails row — empty until Module 5
- **Tagging shimmer:** a subtle animated shimmer bar in the category badge position while `tagging_status = 'pending'`. Disappears when Module 6 writes the tags. Fully inert here — just a UI state.
- **Sync indicator:** small "⏳ Syncing" label on the card while the note is still in the offline queue.

**Feed behavior:**
- Pull to refresh — re-fetches from Supabase
- Supabase realtime subscription on `notes` for the trip — new notes from other devices appear instantly
- Empty state: centered icon + "No notes yet. Tap the button below to capture your first memory."

---

## File Structure

```
src/
  services/
    noteService.ts          ← createNote (with offline fallback), getNotes
    offlineQueue.ts         ← enqueue, dequeue, drain, peek
    locationService.ts      ← getCurrentLocation, reverseGeocode, permission handling
  hooks/
    useNotes.ts             ← reactive note list per trip; merges queue + server data
    useConnectivity.ts      ← boolean isOnline + onReconnect callback
    useLocation.ts          ← current coords + permission state
  screens/
    trip/
      TripFeedScreen.tsx    ← replaces placeholder from Module 2
  components/
    FloatingCaptureButton.tsx   ← update: now opens NoteCaptureSheet
    NoteCaptureSheet.tsx
    NoteCard.tsx
    CategoryPicker.tsx      ← reusable pill selector (used again in Module 8 search filters)
    TripSelector.tsx        ← trip chip row within capture sheet
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Note visibility | Optimistic (before server confirms) | User sees their note instantly; never feels like it failed |
| Offline storage | AsyncStorage queue | Simple, reliable, no extra dependencies |
| Retry strategy | Drain-on-reconnect + drain-on-foreground | Covers both connectivity restore and app restart |
| Dedup mechanism | `offline_id` + DB unique constraint | Safe to retry; no manual dedup logic needed |
| GPS timing | At Save, not at sheet open | More accurate; handles long-form typing |
| Category default | None (unselected) | AI will assign; user pre-selection is optional override |
| Feed order | Reverse chronological | Most recent memories are most relevant |
| Voice/photo stubs | Present but no-op | Locks in the UI layout now; avoids rework in Modules 4 + 5 |
| Tagging shimmer | Rendered always while pending | Sets expectation that tags are coming; not jarring when they appear |
