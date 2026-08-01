# Module 5 — Photos & Vision
**App:** Notebound
**Status:** Design doc — pending approval before execution
**Depends on:** Module 0 (storage buckets + notes schema), Module 3 (NoteCaptureSheet + NoteCard)

---

## Purpose

Activate the photo picker stub in NoteCaptureSheet. Users select photos from their camera roll; the app extracts EXIF metadata (GPS coordinates + timestamp) as a fallback location source, uploads photos to Supabase Storage, and sends each photo to Claude Vision for semantic description. These descriptions power contextual photo placement in blog generation (Module 9) and image-based search later.

After this module: notes can have photos. NoteCards show thumbnails. Claude has described every photo semantically.

---

## Photo Picker

Uses `expo-image-picker` with camera roll access.

**Selection:** Multiple photos per note. No fixed maximum in V1 — user judgment.

**Trigger:** Tapping the photo picker stub icon in NoteCaptureSheet opens the system photo picker. Selected photos are shown as a horizontal thumbnail strip within the capture sheet before saving.

**Permissions:** Camera roll read permission requested on first tap, before picker opens.

---

## EXIF Extraction

Every selected photo's EXIF metadata is read immediately after selection using `expo-media-library`.

**What's extracted:**
- GPS coordinates (lat + lng) — if present in photo metadata
- Creation timestamp — photo's actual taken-at time, not the file modification date

**Usage as fallback:**
- If the note has no GPS from device location (Module 3) and the photo has EXIF coordinates → use photo EXIF coords as the note's `lat`/`lng`
- If multiple photos have EXIF coords → use the first one
- Timestamp is stored alongside the photo description for blog generation's day-by-day itinerary logic (Module 9)

**Priority order for note location:**
1. Device GPS at time of save (Module 3) — most accurate
2. EXIF GPS from photo — good fallback for photos taken at the location
3. AI extraction from note content (Module 6) — last resort

---

## Upload to Supabase Storage

Photos upload to the private `photos/` bucket under a path of `{user_id}/{note_id}/{filename}`.

**Timing:** Upload happens after the note is saved to Supabase (or added to the offline queue). The note's `photo_urls` column is updated with the uploaded URLs once upload completes.

**Offline behavior:** If offline, photos are held locally (temporary URI from expo-image-picker). The offline queue entry includes the local photo URIs. When the queue drains and the note syncs, photos upload at that point and `photo_urls` is updated.

**Progress:** A subtle upload indicator on the NoteCard (small progress bar or spinner on the photo thumbnail) while upload is in-flight. Disappears on completion.

---

## Claude Vision Analysis

After each photo uploads, it is sent to Claude Vision (Claude API with image input) for semantic description.

**What Claude is asked:** Describe what this photo shows — the type of place or moment, the mood, what's notable. Concise, one to two sentences.

**Output stored in:** `notes.photo_descriptions` (JSONB array):
```
[
  { "url": "...", "description": "A steaming bowl of tonkotsu ramen at a narrow counter restaurant, dimly lit, late evening." },
  { "url": "...", "description": "Street view of a covered shopping arcade lined with paper lanterns, busy with afternoon foot traffic." }
]
```

**Timing:** Vision analysis is queued after upload — it does not block note save or photo upload. Notes appear in the feed with photos immediately; descriptions arrive asynchronously.

**Offline behavior:** Vision analysis is queued (same worker as AI tagging in Module 6). Runs when connectivity is available.

**Use in later modules:**
- **Module 9 (Blog Generation):** Claude reads all photo descriptions to select representative photos and place them contextually within the narrative
- **Module 9 (Itinerary tab):** EXIF timestamps + GPS from photos contribute to day-by-day itinerary reconstruction
- **Module 8 (Search):** Photo descriptions are searchable — "find photos of the ramen stall" works because the description is embedded

---

## NoteCard Updates

NoteCard (from Module 3) gains a horizontal photo thumbnail strip:

- Shown below note content
- Small square thumbnails (3–4 visible, horizontally scrollable if more)
- Tapping a thumbnail opens a full-screen photo viewer (simple `ImageViewer` modal)
- Upload spinner overlaid on thumbnail while uploading
- No photo = no strip (no empty space)

---

## File Structure

```
src/
  services/
    photoService.ts         ← picker, EXIF extraction, Storage upload, URL update
    visionService.ts        ← calls Claude Vision API; returns description per photo
  components/
    PhotoPicker.tsx         ← replaces stub in NoteCaptureSheet
    PhotoStrip.tsx          ← horizontal thumbnail row in NoteCard + capture sheet
    PhotoViewer.tsx         ← full-screen modal on thumbnail tap
  hooks/
    usePhotoUpload.ts       ← manages upload state + progress per note
```

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Photo limit | None (user judgment) | Removing friction; blog generation selects the best subset anyway |
| EXIF extraction timing | Immediately after selection | Before upload; ensures data is captured even if upload fails |
| Location priority | Device GPS > EXIF > AI extraction | Device GPS is most precise; EXIF is reliable for deliberate travel photos |
| Upload path | `{user_id}/{note_id}/{filename}` | Clear ownership; enables user-scoped RLS |
| Vision analysis timing | Async after upload | Never blocks the user; descriptions arrive quietly |
| Vision analysis offline | Queued (same worker as tagging) | Consistent with tagging approach; no separate queue needed |
| Photo descriptions format | JSONB array with url + description | URL ties description to specific photo; needed for blog photo selection |
| Full-screen viewer | Simple modal | Standard UX expectation; no editing in V1 |
