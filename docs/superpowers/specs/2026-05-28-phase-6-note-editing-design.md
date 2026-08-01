# Phase 6 — Note Editing Design Spec
**App:** Notebound
**Date:** 2026-05-28
**Status:** Approved for implementation planning

---

## Summary

Users can edit any saved note: update its text, change its category, add photos from the camera roll, and delete existing photos. They can also delete a note entirely. Tapping a NoteCard opens a `NoteEditSheet` modal — the same pattern as note capture, pre-populated with the note's current data.

---

## User Flow

1. Tap a NoteCard in the TripFeedScreen.
2. A `NoteEditSheet` modal slides up, pre-populated with the note's text, category, and photo thumbnails.
3. The user edits as needed:
   - Type or edit the text content
   - Change the category via the existing CategoryPicker
   - Delete a photo by tapping × on any thumbnail
   - Add photos by tapping the `+` tile at the end of the photo row
4. Tap **Save** → photos are uploaded/deleted, note record is updated, sheet dismisses, feed refreshes.
5. Tap **Delete Note** at the bottom → confirmation alert → note and all its photos are deleted → feed updates.
6. Tap **Cancel** → no changes are written or deleted.

---

## Components

### New: `NoteEditSheet`

A modal sheet pre-populated from an existing note. Structurally mirrors `NoteCaptureSheet` with these differences:

- Receives a `note: Note` prop instead of starting blank
- No voice recording — editing is text-only
- No trip selector — notes cannot be re-assigned
- Shows existing photo thumbnails with × delete badges
- Save calls `updateNote()` instead of `createNote()`
- Delete Note button at the bottom with a confirmation alert

### Modified: `NoteCard`

Wrapped in a `Pressable`. `onPress` opens `NoteEditSheet` with the tapped note.

### Modified: `TripFeedScreen`

Manages `editingNote: Note | null` state. Renders `NoteEditSheet` when a note is selected.

### Modified: `noteService.ts`

Adds two functions:
- `updateNote(id, patch)` — updates `content`, `category`, `photo_urls`, and resets `tagging_status` to `'pending'`
- `deleteNote(id)` — deletes the note record; callers handle photo cleanup separately

### `photoService.ts`

No changes. `deletePhotos()` and `uploadPhoto()` are reused as-is.

---

## Photo Management

**Existing photos** render as a horizontal scroll of thumbnails, each with a × badge. Tapping × removes the photo from the local list immediately (optimistic). The Storage deletion is deferred to Save — nothing is deleted if the user cancels.

**Adding photos** uses the existing `usePhotoPicker` hook. New photos are staged locally and uploaded on Save.

**Save sequence:**
1. Upload staged photos → collect new URLs
2. Delete removed photos from Supabase Storage
3. Call `updateNote()` with updated `content`, `category`, merged `photo_urls`, and `tagging_status = 'pending'`

If any upload fails, show an inline error and keep the sheet open. The note is not partially saved.

---

## Re-tagging

On every save, `tagging_status` is reset to `'pending'`. When Phase 7 (AI Smart Tagging) ships, the tag worker will automatically re-process any edited note. No additional work is required in this phase.

---

## Database

No schema changes. The `notes` table already has all required columns.

---

## File Structure

```
src/
  components/
    NoteEditSheet.tsx     ← new
    NoteCard.tsx          ← add Pressable + onPress
  screens/trip/
    TripFeedScreen.tsx    ← add editingNote state + render NoteEditSheet
  services/
    noteService.ts        ← add updateNote(), deleteNote()
```

---

## Out of Scope

- Re-assigning a note to a different trip
- Editing GPS/location data
- Voice re-recording
- Taking a new photo from camera (camera roll only)
