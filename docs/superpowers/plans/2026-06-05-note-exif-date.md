# Note Date from Photo EXIF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a note has photos, derive `occurred_at` from the earliest photo's `DateTimeOriginal` EXIF timestamp and use that date to sort the feed, so notes appear chronologically by when the moment happened rather than when the note was typed.

**Architecture:** `extractExifDate` is added to `photoHelpers.ts`; `PickedPhoto` gains `exifDate`; a new nullable `occurred_at` column is added to the `notes` table; the value flows from `usePhotoPicker` → `NoteCaptureSheet` → `createNote` → `drainQueue` → Supabase; `mergeFeed` in `useNotes` sorts by `occurred_at ?? captured_at`.

**Tech Stack:** Supabase (PostgreSQL migration), TypeScript, React Native, expo-image-picker (EXIF already requested with `exif: true`)

---

### Task 1: Add `extractExifDate` helper to `photoHelpers.ts`

**Files:**
- Modify: `src/services/photoHelpers.ts`
- Modify: `src/services/__tests__/photoHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `src/services/__tests__/photoHelpers.test.ts`, before the final blank line:

```ts
describe('extractExifDate', () => {
  it('parses a valid EXIF DateTimeOriginal string to ISO 8601', () => {
    const exif = { DateTimeOriginal: '2024:08:15 14:32:00' };
    const result = extractExifDate(exif);
    expect(result).toBe('2024-08-15T14:32:00.000Z');
  });

  it('returns null when DateTimeOriginal is absent', () => {
    expect(extractExifDate({})).toBeNull();
  });

  it('returns null when DateTimeOriginal is not a string', () => {
    expect(extractExifDate({ DateTimeOriginal: 1234567890 })).toBeNull();
  });

  it('returns null when the string does not match EXIF format', () => {
    expect(extractExifDate({ DateTimeOriginal: '2024-08-15T14:32:00' })).toBeNull();
  });

  it('returns null when the date is invalid (month 13)', () => {
    expect(extractExifDate({ DateTimeOriginal: '2024:13:01 00:00:00' })).toBeNull();
  });
});
```

Also update the import line at the top of the test file to include `extractExifDate`:

```ts
import { parseDMS, extractExifLocation, validatePhotoCount, ensureMediaLibraryPermission, extractExifDate } from '../photoHelpers';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories"
npx jest src/services/__tests__/photoHelpers.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `extractExifDate is not a function` or similar.

- [ ] **Step 3: Implement `extractExifDate` in `photoHelpers.ts`**

Add the following export at the bottom of `src/services/photoHelpers.ts` (after the existing `ensureMediaLibraryPermission` function):

```ts
export function extractExifDate(exif: Record<string, unknown>): string | null {
  const raw = exif['DateTimeOriginal'];
  if (typeof raw !== 'string') return null;
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match;
  const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/services/__tests__/photoHelpers.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git checkout -b backlog/note-exif-date
git add src/services/photoHelpers.ts src/services/__tests__/photoHelpers.test.ts
git commit -m "feat: add extractExifDate helper to photoHelpers"
```

---

### Task 2: Surface `exifDate` in `PickedPhoto` via `usePhotoPicker`

**Files:**
- Modify: `src/hooks/usePhotoPicker.ts`
- Modify: `src/hooks/__tests__/usePhotoPicker.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new test at the bottom of `src/hooks/__tests__/usePhotoPicker.test.ts`, before the closing `});` of the outer `describe`:

```ts
  it('extracts EXIF date from assets that have DateTimeOriginal', async () => {
    const fakeExif = { DateTimeOriginal: '2024:08:15 14:32:00' };
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: fakeExif }],
    } as never);
    mockExtractExifDate.mockReturnValueOnce('2024-08-15T14:32:00.000Z');

    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });

    expect(mockExtractExifDate).toHaveBeenCalledWith(fakeExif);
    expect(result.current.photos[0].exifDate).toBe('2024-08-15T14:32:00.000Z');
  });

  it('sets exifDate to null when asset has no DateTimeOriginal', async () => {
    mockLaunchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 100, height: 100, exif: null }],
    } as never);

    const { result } = renderHook(() => usePhotoPicker());
    await act(async () => { await result.current.pick(); });

    expect(result.current.photos[0].exifDate).toBeNull();
  });
```

Also update the mock at the top of `usePhotoPicker.test.ts` to include `extractExifDate`:

Replace:
```ts
jest.mock('../../services/photoHelpers', () => ({
  extractExifLocation: jest.fn(),
  ensureMediaLibraryPermission: jest.fn(),
}));
```
With:
```ts
jest.mock('../../services/photoHelpers', () => ({
  extractExifLocation: jest.fn(),
  extractExifDate: jest.fn(),
  ensureMediaLibraryPermission: jest.fn(),
}));
```

And add the mock typed variable after `mockExtractExif`:
```ts
import { extractExifLocation, extractExifDate, ensureMediaLibraryPermission } from '../../services/photoHelpers';

const mockExtractExifDate = extractExifDate as jest.MockedFunction<typeof extractExifDate>;
```

And add `mockExtractExifDate.mockReturnValue(null);` in `beforeEach`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/hooks/__tests__/usePhotoPicker.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `exifDate` is not on `PickedPhoto` yet.

- [ ] **Step 3: Update `usePhotoPicker.ts` to include `exifDate`**

In `src/hooks/usePhotoPicker.ts`, update the import and type, then populate `exifDate` when mapping assets.

Change the import line:
```ts
import { ensureMediaLibraryPermission, extractExifLocation, extractExifDate } from '../services/photoHelpers';
```

Update the `PickedPhoto` type:
```ts
export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  exifLocation: { lat: number; lng: number } | null;
  exifDate: string | null;
};
```

Update the mapping inside `pick()`:
```ts
const picked: PickedPhoto[] = result.assets.map((asset) => ({
  uri: asset.uri,
  width: asset.width,
  height: asset.height,
  exifLocation: asset.exif
    ? extractExifLocation(asset.exif as Record<string, unknown>)
    : null,
  exifDate: asset.exif
    ? extractExifDate(asset.exif as Record<string, unknown>)
    : null,
}));
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/hooks/__tests__/usePhotoPicker.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePhotoPicker.ts src/hooks/__tests__/usePhotoPicker.test.ts
git commit -m "feat: add exifDate field to PickedPhoto"
```

---

### Task 3: Add `occurred_at` column to Supabase + update generated types

**Files:**
- Create: `supabase/migrations/010_notes_occurred_at.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/services/__tests__/noteHelpers.test.ts` (fixture update only)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/010_notes_occurred_at.sql`:

```sql
-- occurred_at: the moment the experience happened, derived from photo EXIF
-- DateTimeOriginal. Null when no photos have EXIF or note has no photos.
-- Feed sorts by this when present, falling back to captured_at.
alter table public.notes
  add column occurred_at timestamptz;

-- Index so ORDER BY COALESCE(occurred_at, captured_at) DESC is fast per-trip.
create index notes_trip_occurred_idx
  on public.notes (trip_id, occurred_at desc nulls last);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with the content above. (If working locally, run `supabase db push` instead.)

- [ ] **Step 3: Update `database.types.ts` to include `occurred_at`**

In `src/lib/database.types.ts`, inside the `notes` table definition, add `occurred_at` to `Row`, `Insert`, and `Update`:

In `Row` (line ~72), add after `offline_id: string`:
```ts
          occurred_at: string | null
```

In `Insert` (line ~89), add after `offline_id: string`:
```ts
          occurred_at?: string | null
```

In `Update` (line ~105), add after `offline_id?: string`:
```ts
          occurred_at?: string | null
```

- [ ] **Step 4: Update the `note()` fixture in `noteHelpers.test.ts`**

In `src/services/__tests__/noteHelpers.test.ts`, the `note()` factory constructs a `Note` manually. Since `Note` now includes `occurred_at: string | null` (inherited from `NoteRow`), add it to the factory:

```ts
const note = (overrides: Partial<Note> = {}): Note => ({
  id: 'n1',
  user_id: 'u1',
  trip_id: 't1',
  content: 'Hello',
  category: null,
  lat: null,
  lng: null,
  city: null,
  place_name: null,
  photo_urls: [],
  tagging_status: 'pending',
  offline_id: 'o1',
  occurred_at: null,
  captured_at: '2026-05-22T12:00:00Z',
  created_at: '2026-05-22T12:00:00Z',
  updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});
```

- [ ] **Step 5: Run type-check and tests**

```bash
npx tsc --noEmit 2>&1 | head -30
npx jest src/services/__tests__/noteHelpers.test.ts --no-coverage 2>&1 | tail -10
```

Expected: No type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_notes_occurred_at.sql src/lib/database.types.ts src/services/__tests__/noteHelpers.test.ts
git commit -m "feat: add occurred_at column to notes (EXIF timestamp)"
```

---

### Task 4: Thread `occurred_at` through `PendingNote`, `CreateNoteInput`, `createNote`, and `drainQueue`

**Files:**
- Modify: `src/services/offlineQueue.ts`
- Modify: `src/services/noteService.ts`
- Modify: `src/services/__tests__/noteService.test.ts`

- [ ] **Step 1: Write/update failing tests in `noteService.test.ts`**

The existing mock at the top of `noteService.test.ts` only covers `update` and `delete`. We need to add an `upsert` mock path for `drainQueue`. Update the mock at the top:

Replace the entire mock + import block at the top of `src/services/__tests__/noteService.test.ts`:

```ts
const mockEq = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({
  update: mockUpdate,
  delete: mockDelete,
  upsert: mockUpsert,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('../../services/offlineQueue', () => ({
  peekAll: jest.fn().mockResolvedValue([]),
  removeByOfflineId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/photoUploadService', () => ({
  drainPhotoUploads: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/taggingService', () => ({
  drainTagging: jest.fn().mockResolvedValue(undefined),
}));

import { updateNote, deleteNote, drainQueue, type UpdateNoteInput } from '../noteService';
import { peekAll } from '../../services/offlineQueue';

const mockPeekAll = peekAll as jest.MockedFunction<typeof peekAll>;
```

Then add a new `describe('drainQueue')` block before the existing `describe('updateNote')`:

```ts
describe('drainQueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes occurred_at to the upserted row when present in PendingNote', async () => {
    mockPeekAll.mockResolvedValueOnce([
      {
        offline_id: 'off-1',
        user_id: 'u1',
        trip_id: 't1',
        content: 'Test',
        category: null,
        lat: null,
        lng: null,
        city: null,
        place_name: null,
        captured_at: '2026-06-01T10:00:00.000Z',
        occurred_at: '2024-08-15T14:32:00.000Z',
        photo_uris: [],
      },
    ]);
    mockUpsert.mockResolvedValueOnce({ error: null });

    await drainQueue();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: '2024-08-15T14:32:00.000Z' }),
      expect.anything(),
    );
  });

  it('writes null for occurred_at when not set in PendingNote', async () => {
    mockPeekAll.mockResolvedValueOnce([
      {
        offline_id: 'off-2',
        user_id: 'u1',
        trip_id: 't1',
        content: 'Test',
        category: null,
        lat: null,
        lng: null,
        city: null,
        place_name: null,
        captured_at: '2026-06-01T10:00:00.000Z',
        occurred_at: null,
        photo_uris: [],
      },
    ]);
    mockUpsert.mockResolvedValueOnce({ error: null });

    await drainQueue();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: null }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/services/__tests__/noteService.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `occurred_at` not in `PendingNote` or not passed through.

- [ ] **Step 3: Add `occurred_at` to `PendingNote` in `offlineQueue.ts`**

In `src/services/offlineQueue.ts`, update `PendingNote`:

```ts
export type PendingNote = {
  offline_id: string;
  user_id: string;
  trip_id: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name: string | null;
  captured_at: string;
  occurred_at: string | null;
  photo_uris: string[];
};
```

- [ ] **Step 4: Thread `occurred_at` through `noteService.ts`**

In `src/services/noteService.ts`:

Update `CreateNoteInput`:
```ts
export type CreateNoteInput = {
  userId: string;
  tripId: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  place_name?: string | null;
  photo_uris?: string[];
  offline_id?: string;
  occurred_at?: string | null;
};
```

Update the `pending` object inside `createNote`:
```ts
const pending: PendingNote = {
  offline_id: input.offline_id ?? Crypto.randomUUID(),
  user_id: input.userId,
  trip_id: input.tripId,
  content: input.content,
  category: input.category,
  lat: input.lat,
  lng: input.lng,
  city: input.city,
  place_name: input.place_name ?? null,
  captured_at: new Date().toISOString(),
  occurred_at: input.occurred_at ?? null,
  photo_uris: input.photo_uris ?? [],
};
```

Update the `row` object inside `drainQueue`:
```ts
const row: NoteInsert = {
  user_id: item.user_id,
  trip_id: item.trip_id,
  content: item.content,
  category: item.category ?? null,
  lat: item.lat,
  lng: item.lng,
  city: item.city,
  place_name: item.place_name ?? null,
  offline_id: item.offline_id,
  captured_at: item.captured_at,
  occurred_at: item.occurred_at ?? null,
  photo_urls: [],
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest src/services/__tests__/noteService.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/offlineQueue.ts src/services/noteService.ts src/services/__tests__/noteService.test.ts
git commit -m "feat: thread occurred_at through PendingNote and drainQueue"
```

---

### Task 5: Pick earliest EXIF date in `NoteCaptureSheet` and pass to `createNote`

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

No new tests needed here — this is pure UI wiring that reads from `photoPicker.photos` (already tested) and calls `createNote` (already tested). Correctness is verified by the existing unit tests on both sides.

- [ ] **Step 1: Derive `earliestExifDate` from picked photos**

In `src/components/NoteCaptureSheet.tsx`, add a `useMemo` that picks the earliest non-null `exifDate` from the photos array. Place it right after the existing `exifLocation` memo (~line 88):

```ts
const earliestExifDate = useMemo(() => {
  const dates = photos
    .map((p) => p.exifDate)
    .filter((d): d is string => d !== null);
  if (dates.length === 0) return null;
  return dates.reduce((min, d) => (d < min ? d : min));
}, [photos]);
```

- [ ] **Step 2: Pass `occurred_at` to `createNote`**

Inside `handleSave`, update the `createNote` call (around line 216):

```ts
await createNote({
  userId,
  tripId: selectedTripId,
  content: validation.value,
  category,
  lat: locPatch.lat,
  lng: locPatch.lng,
  city: locPatch.city,
  place_name: locPatch.place_name,
  photo_uris: photos.map((p) => p.uri),
  occurred_at: earliestExifDate,
});
```

- [ ] **Step 3: Run type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat: derive occurred_at from earliest photo EXIF date in NoteCaptureSheet"
```

---

### Task 6: Sort feed by `occurred_at ?? captured_at` in `mergeFeed`

**Files:**
- Modify: `src/hooks/useNotes.ts`

- [ ] **Step 1: Check if there are existing tests for `mergeFeed`**

```bash
grep -r "mergeFeed\|useNotes" "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories/src" --include="*.test.*" -l
```

If no test file exists, skip to Step 3 (the sort is covered implicitly by the feed rendering correctly in the app).

- [ ] **Step 2: Update the sort in `mergeFeed`**

In `src/hooks/useNotes.ts`, update the sort comparator inside `mergeFeed` (around line 156):

Replace:
```ts
merged.sort((a, b) => {
  const ta = a.kind === 'note' ? a.note.captured_at : a.pending.captured_at;
  const tb = b.kind === 'note' ? b.note.captured_at : b.pending.captured_at;
  return tb.localeCompare(ta);
});
```

With:
```ts
merged.sort((a, b) => {
  const ta =
    a.kind === 'note'
      ? (a.note.occurred_at ?? a.note.captured_at)
      : (a.pending.occurred_at ?? a.pending.captured_at);
  const tb =
    b.kind === 'note'
      ? (b.note.occurred_at ?? b.note.captured_at)
      : (b.pending.occurred_at ?? b.pending.captured_at);
  return tb.localeCompare(ta);
});
```

- [ ] **Step 3: Run the full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass. Any failures are type mismatches from `occurred_at` not being present in test fixtures — fix those by adding `occurred_at: null` to any `Note` or `PendingNote` literals in failing tests.

- [ ] **Step 4: Run final type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotes.ts
git commit -m "feat: sort feed by occurred_at (EXIF) falling back to captured_at"
```

---

## Wrap-up

After all tasks are complete, open a PR from `backlog/note-exif-date` to `main`.

**Manual verification checklist:**
1. Capture a note with no photos → `occurred_at` is null → feed sort unchanged.
2. Capture a note with a photo that has `DateTimeOriginal` EXIF → note shows up in chronological order in feed.
3. Capture a note with a photo that has no EXIF → `occurred_at` is null → falls back to `captured_at`.
4. Capture two notes with old photos (e.g., from a past holiday) → they sort before newer notes in the feed.
