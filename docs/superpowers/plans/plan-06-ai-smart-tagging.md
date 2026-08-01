# Module 6 — AI Smart Tagging
**App:** Notebound
**Status:** Design doc — pending approval before execution
**Depends on:** Module 3 (notes, offline queue), Module 5 (photo descriptions, EXIF)

---

## Purpose

Every saved note gets Claude-assigned metadata: category, place name (if a specific location is mentioned), and city (if not already GPS-tagged). This happens automatically — no manual tagging required. Notes saved offline are tagged once connectivity returns.

After this module: notes have category badges, place names, and cities. The `places` table starts being populated. NoteCards show real tags instead of shimmers.

---

## What Claude Tags

For each note, Claude receives:
- The note's text content
- GPS coordinates (if available from device or EXIF)
- City (if already resolved from GPS reverse geocoding)
- Photo descriptions (if vision analysis has completed for attached photos)

Claude returns:
- **Category** — one of: `Food`, `Stay`, `Activity`, `Shopping`, `To-Visit`, `General`
- **Place name** — specific named location if mentioned (e.g., "Ichiran Ramen", "Park Hyatt Tokyo"); null if content is general
- **City** — city name if derivable from GPS, content, or photo descriptions; null if unresolvable

Claude uses a tightly scoped system prompt. The response is structured (JSON output). No free-form generation — just classification and extraction.

---

## Location Resolution (Three-Fallback Strategy)

City assignment follows the same priority order established in Module 5:

1. **Device GPS reverse geocoded** (Module 3) — most accurate
2. **EXIF GPS reverse geocoded** (Module 5) — reliable for travel photos
3. **Claude content extraction** — if neither GPS source is available, Claude reads the note text and photo descriptions and infers the city from mentioned landmarks, restaurant names, neighborhoods, etc.

If none of the three resolve to a city, the city field stays null. This is acceptable — some notes are genuinely location-agnostic.

---

## Place Record Creation

When Claude returns a non-null `place_name` **and** coordinates are available (from GPS, EXIF, or Claude's best estimate from content):

→ Upsert a row into the `places` table: name, category, lat, lng, city, note_id, trip_id, user_id.

The place is then pinned on the trip map (Module 7). If coordinates are unavailable but a place name is returned, the place name is stored on the note but no `places` row is created (can't pin it without coords).

---

## Tag Worker

A background worker that processes the tagging queue. Shared infrastructure with the vision queue from Module 5 — both drain from the same connectivity-aware worker.

**Trigger:** Same as Module 3's offline queue drain — on foreground, on reconnect, on app start if queue non-empty.

**Processing order per note:**
1. Check if vision analysis is complete (photo descriptions available). If photos are still being analyzed, defer tagging for that note — descriptions improve tag quality.
2. Send note content + available metadata to Claude.
3. Write returned tags to the `notes` table (`category`, `place_name`, `city`, `tagging_status = 'done'`).
4. If place_name + coords are available, upsert `places` row.

**Failure handling:** If Claude API call fails (network error, rate limit), re-queue the note. Retry on next drain. `tagging_status` stays `pending`.

---

## NoteCard Updates

NoteCard (Module 3) reacts to tag arrival via Supabase Realtime:

- `tagging_status = 'pending'` → category badge shows shimmer (no text)
- `tagging_status = 'done'` → shimmer replaced by real category badge (colored pill) + place name below content (if set)

No user action required. Tags appear as soon as they arrive.

---

## File Structure

```
src/
  services/
    taggingService.ts       ← calls Claude API; returns { category, placeName, city }
    placeService.ts         ← upsert place from tag result
  workers/
    tagWorker.ts            ← drains tagging queue; coordinates with vision worker
  components/
    NoteCard.tsx            ← update: real category badge + place name on tag arrival
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Tag on save (not on-demand) | Yes — automatic on every save | Zero manual effort; tags appear organically |
| Defer tagging until vision complete | Yes | Photo descriptions significantly improve place name accuracy |
| Place creation gated on coords | Yes | A place without coordinates can't be mapped; name stored on note anyway |
| Shared worker with vision | Yes | Single connectivity-aware drain; no duplicate retry logic |
| Claude output format | Structured JSON | Predictable parsing; no hallucination risk on classification |
| Category user can override | Not in V1 | Keeps scope tight; Claude accuracy is sufficient |
