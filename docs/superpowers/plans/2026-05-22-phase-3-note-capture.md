# Phase 3 — Note Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the text-capture loop end-to-end. A user taps a global floating button → writes a note (with optional category + auto-tagged GPS/city) → saves → the note appears instantly in the trip Feed. Notes saved without network queue locally and drain on reconnect. Voice mic and photo picker are present as inert stubs (functional code lands in Phases 4 + 5). AI smart tagging is deferred to Phase 6 — notes save with `tagging_status = 'pending'` and the NoteCard shows a shimmer where the category badge will appear.

**Architecture:**
- **Schema slice:** one new table `notes` (Migration 004) with RLS that limits inserts to the user's own trips, an `offline_id UNIQUE` constraint so the queue can retry without duplicates, and realtime publication. A second migration (005) keeps `trips.note_count` in sync via insert/delete triggers so Home cards reflect reality.
- **Offline-first capture:** noteService writes to an AsyncStorage queue first, then immediately tries Supabase. On failure the note stays in the queue; drains fire on app start, NetInfo reconnect, and AppState foreground.
- **Reactive merge:** `useNotes(tripId)` merges Supabase rows with queued-but-not-yet-acked entries, deduped by `offline_id`. Realtime subscription handles inserts from other devices or queue drains.
- **Global capture surface:** MainStack renders `<FloatingCaptureButton>` + `<NoteCaptureSheet>` as siblings to the inner navigator so they overlay every authenticated screen (tabs + TripDetail).
- **Pure helpers + TDD:** `noteHelpers` (categories, relative-time, content validation) and `offlineQueue` (AsyncStorage CRUD + subscriber) are unit-tested. UI verified manually in the iOS simulator at the end.

**Tech Stack additions:**
| Concern | Library | Notes |
|---|---|---|
| GPS + reverse geocode | `expo-location` | Permission prompt; `reverseGeocodeAsync` for city. |
| Connectivity | `@react-native-community/netinfo` | `fetch()` + `addEventListener`; drain trigger. |
| UUID generation | `expo-crypto` | `Crypto.randomUUID()` for `offline_id`. |
| Persistence | `@react-native-async-storage/async-storage` | Already installed (Supabase session uses it). Single key holds the queue. |
| Sheet | RN built-in `Modal presentationStyle="pageSheet"` | Same pattern as Phase 2's CreateTripSheet — no new sheet lib. |
| Realtime | `supabase.channel(...).on('postgres_changes', ...)` | Same pattern as `useTrips` / `useTripDetail`. |

**Verification gates (per task, where applicable):**
- `npx tsc --noEmit` — must pass clean after every code change.
- `npm test -- --watchAll=false` — must pass clean for tasks that add unit tests.
- After `npx expo install ...`, always run `git status` and stage any `app.json` config-plugin edits (Phase 2 follow-up).
- Manual iOS-simulator verification at the end (Task 22).

**Schema scope reminder:** Minimal slice — `notes` + the `note_count` trigger only. `places`, `note_photos`, `embeddings`, etc. ship with the phases that need them. `pgvector` is already enabled but no vector column lands until Phase 8.

**Locked-down trigger functions:** Every new function created in this phase must follow the Phase 2 hardening pattern from the start: `set search_path = ''` in the body + `revoke execute ... from public, anon, authenticated`. Skipping this triggers Supabase advisor warnings (the same ones we cleaned up with 002a / 003a).

**Out of scope (deferred consciously):**
- Voice / push-to-talk and intent detection — Phase 4. Mic button rendered as an inert icon; tap is a no-op.
- Photo picker + EXIF extraction + storage upload — Phase 5. Photo icon rendered as inert.
- AI smart tagging (category / place_name / city-from-content) — Phase 6. Notes save with `tagging_status = 'pending'`; UI shows a shimmer in the category-badge slot.
- Public NavigatorPublicNavigator (logged-out browsing of Explore) — Phase 10 / 12. FAB and capture sheet are mounted inside MainStack so they only render once authenticated.
- Search-intent path from voice — Phase 4 (defaults to save in this phase since voice is stubbed).
- Pull-to-refresh on the feed — keep V1 minimal; realtime + queue drain already cover the “did my note save” question. Add if manual verify shows it's missing.

---

## File Structure

**Create:**
- `supabase/migrations/004_notes.sql`
- `supabase/migrations/005_trips_note_count.sql`
- `src/services/noteHelpers.ts`
- `src/services/noteService.ts`
- `src/services/offlineQueue.ts`
- `src/services/locationService.ts`
- `src/services/__tests__/noteHelpers.test.ts`
- `src/services/__tests__/offlineQueue.test.ts`
- `src/hooks/useConnectivity.ts`
- `src/hooks/useLocation.ts`
- `src/hooks/useNotes.ts`
- `src/components/CategoryPicker.tsx`
- `src/components/TripSelector.tsx`
- `src/components/NoteCard.tsx`
- `src/components/NoteCaptureSheet.tsx`
- `src/components/FloatingCaptureButton.tsx`

**Modify:**
- `src/lib/database.types.ts` — regenerated after migration 004 + 005.
- `src/screens/trip/TripFeedScreen.tsx` — replace placeholder with the real feed.
- `src/navigation/MainStack.tsx` — overlay FAB + capture sheet above the inner navigator; mount the connectivity-driven drain hook here.
- `package.json` — add `expo-location`, `@react-native-community/netinfo`, `expo-crypto`.
- `app.json` — add iOS location usage description + any config-plugin entries `expo install` registers.
- `docs/progress.md` — mark Phase 3 complete, log any new follow-ups.

---

## Task 1: Create the Phase 3 branch + verify Supabase + install dependencies

**Files:**
- Modify: `package.json` (via `npx expo install`)
- Modify: `app.json` (config-plugin entries / iOS Info.plist key)

- [ ] **Step 1: Create the phase branch off main**

```bash
git checkout main
git pull --ff-only
git checkout -b phase-3/note-capture
```

- [ ] **Step 2: Confirm Supabase project is awake**

Run:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://dcejrbyujfcxartywpis.supabase.co/auth/v1/health
```

Expected: `HTTP 200` or `HTTP 401` (either means the project is alive). If you get a timeout or 5xx, the project auto-paused — restore from https://supabase.com/dashboard → project `dcejrbyujfcxartywpis` → "Restore project" and re-run the curl.

Then sanity-check via MCP:

```
mcp__supabase__list_projects
```

Expected: project ref `dcejrbyujfcxartywpis` ("Travel Diary App") in the result. If it isn't, the Supabase MCP plugin is pointed at the wrong account — fix that before continuing (see `docs/progress.md` Next-Session checklist for the recipe).

- [ ] **Step 3: Install runtime deps via `expo install` so SDK 54 versions are picked**

```bash
npx expo install expo-location expo-crypto @react-native-community/netinfo --legacy-peer-deps
```

`--legacy-peer-deps` is required in this repo (see Phase 1 setup notes — `react@19.1.0` vs `react-test-renderer@19.2.0`).

- [ ] **Step 4: Capture any config-plugin edits**

```bash
git status
```

Expected: `package.json`, `package-lock.json`, and likely `app.json` are modified. `expo install` typically registers `expo-location` as a config plugin and may add iOS Info.plist defaults. Open `app.json` to verify the location plugin entry exists; if missing, add it:

`app.json` (under `expo.plugins`):

```json
[
  "expo-location",
  {
    "locationWhenInUsePermission": "Notebound tags notes with the city you captured them in."
  }
]
```

Also add `expo.ios.infoPlist.NSLocationWhenInUseUsageDescription` if `expo install` didn't:

```json
"ios": {
  "infoPlist": {
    "NSLocationWhenInUseUsageDescription": "Notebound tags notes with the city you captured them in."
  }
}
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add package.json package-lock.json app.json
git commit -m "chore(phase-3): install expo-location, netinfo, expo-crypto"
```

Expected: `tsc` passes clean (no type errors expected from dep additions alone).

---

## Task 2: Migration 004 — notes table, RLS, realtime, updated_at trigger

**Files:**
- Create: `supabase/migrations/004_notes.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/004_notes.sql`:

```sql
-- notes: the primary content unit captured during a trip.
-- Phase 3 saves text-only notes; photo + voice fields land in later phases.
-- AI fields (place_name, embeddings) populated in Phase 6 + 8.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,

  -- content
  content text not null check (char_length(content) between 1 and 8000),
  category text
    check (category is null or category in
      ('food','stay','activity','shopping','to-visit','general')),

  -- location captured at save time (null if permission denied or GPS unavailable)
  lat double precision,
  lng double precision,
  city text,

  -- AI fields (populated in later phases)
  place_name text,
  tagging_status text not null default 'pending'
    check (tagging_status in ('pending','complete','failed')),

  -- offline sync — client generates this UUID before insert. Unique constraint
  -- lets the queue retry with upsert(onConflict: 'offline_id', ignoreDuplicates).
  offline_id uuid not null unique,

  -- timestamps
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Feed query: notes for a trip, newest first.
create index notes_trip_captured_idx
  on public.notes (trip_id, captured_at desc);

-- updated_at trigger reuses the already-hardened set_updated_at function.
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- RLS: notes are fully private to their owner AND must belong to one of the
-- owner's own trips. The trip ownership check stops a malicious client from
-- attaching a note to someone else's trip while still passing auth.uid().
alter table public.notes enable row level security;

create policy "notes_select_own"
  on public.notes
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notes_insert_own"
  on public.notes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = auth.uid()
    )
  );

create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notes_delete_own"
  on public.notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime so the feed updates instantly on queue drain or multi-device save.
alter publication supabase_realtime add table public.notes;
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with:
- `name`: `004_notes`
- `query`: the SQL above

- [ ] **Step 3: Verify**

Call `mcp__supabase__list_tables` and confirm `public.notes` appears with the columns above.

Call `mcp__supabase__execute_sql` with:

```sql
select policyname from pg_policies where schemaname='public' and tablename='notes' order by policyname;
```

Expected: 4 rows — `notes_delete_own`, `notes_insert_own`, `notes_select_own`, `notes_update_own`.

Call `mcp__supabase__get_advisors` with `type: "security"`. Expected: no new errors / warnings against `public.notes`. (Existing warnings about `pgvector` in `public` schema are pre-existing and out of scope for Phase 3.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_notes.sql
git commit -m "feat(db): add notes table with RLS, offline_id unique, realtime"
```

---

## Task 3: Migration 005 — auto-maintain trips.note_count

**Files:**
- Create: `supabase/migrations/005_trips_note_count.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/005_trips_note_count.sql`:

```sql
-- Keep public.trips.note_count in sync with public.notes via row-level triggers.
-- The note_count column exists since Migration 003 but has never been touched.
-- Maintaining it in-db keeps TripCard / Home accurate without a count query per render.

create or replace function public.bump_trip_note_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    update public.trips
      set note_count = note_count + 1
      where id = new.trip_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.trips
      set note_count = greatest(0, note_count - 1)
      where id = old.trip_id;
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_trip_note_count() from public;
revoke execute on function public.bump_trip_note_count() from anon;
revoke execute on function public.bump_trip_note_count() from authenticated;

create trigger notes_bump_count_insert
  after insert on public.notes
  for each row execute function public.bump_trip_note_count();

create trigger notes_bump_count_delete
  after delete on public.notes
  for each row execute function public.bump_trip_note_count();
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase__apply_migration` with `name: "005_trips_note_count"` and the SQL above.

- [ ] **Step 3: Verify**

Call `mcp__supabase__execute_sql` with:

```sql
select tgname from pg_trigger
where tgrelid = 'public.notes'::regclass
order by tgname;
```

Expected: rows include `notes_bump_count_insert`, `notes_bump_count_delete`, `notes_set_updated_at`. (You'll also see internal `RI_*` constraint triggers — ignore those.)

Call `mcp__supabase__get_advisors` with `type: "security"`. Expected: no new warnings on `bump_trip_note_count`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_trips_note_count.sql
git commit -m "feat(db): auto-maintain trips.note_count via triggers on notes"
```

---

## Task 4: Regenerate `database.types.ts`

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Regenerate via MCP**

Call `mcp__supabase__generate_typescript_types`. Copy the returned `types` string verbatim into `src/lib/database.types.ts`, overwriting the existing file.

- [ ] **Step 2: Verify the new types**

Confirm the file now exposes `Database['public']['Tables']['notes']['Row']` with these columns: `id`, `user_id`, `trip_id`, `content`, `category`, `lat`, `lng`, `city`, `place_name`, `tagging_status`, `offline_id`, `captured_at`, `created_at`, `updated_at`.

Run:

```bash
npx tsc --noEmit
```

Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore(types): regenerate database.types.ts for notes table"
```

---

## Task 5: `noteHelpers` — categories, relative time, content validation (TDD)

**Files:**
- Create: `src/services/noteHelpers.ts`
- Create: `src/services/__tests__/noteHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/services/__tests__/noteHelpers.test.ts`:

```ts
import {
  CATEGORIES,
  categoryLabel,
  validateContent,
  formatRelativeTime,
  type Note,
} from '../noteHelpers';

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
  tagging_status: 'pending',
  offline_id: 'o1',
  captured_at: '2026-05-22T12:00:00Z',
  created_at: '2026-05-22T12:00:00Z',
  updated_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

describe('CATEGORIES', () => {
  it('lists the six categories in design-spec order', () => {
    expect(CATEGORIES).toEqual([
      'food',
      'stay',
      'activity',
      'shopping',
      'to-visit',
      'general',
    ]);
  });
});

describe('categoryLabel', () => {
  it('renders a title-cased label per category', () => {
    expect(categoryLabel('food')).toBe('Food');
    expect(categoryLabel('to-visit')).toBe('To-Visit');
    expect(categoryLabel('general')).toBe('General');
  });
  it('returns empty string when no category set', () => {
    expect(categoryLabel(null)).toBe('');
  });
});

describe('validateContent', () => {
  it('trims and accepts non-empty within length', () => {
    expect(validateContent('  hi  ')).toEqual({ ok: true, value: 'hi' });
  });
  it('rejects empty / whitespace-only', () => {
    expect(validateContent('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateContent('   ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects content over 8000 chars', () => {
    const long = 'a'.repeat(8001);
    expect(validateContent(long)).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-22T12:00:00Z');
  it('returns "Just now" within the last 60 seconds', () => {
    expect(formatRelativeTime('2026-05-22T11:59:30Z', now)).toBe('Just now');
  });
  it('returns "X minutes ago" between 1 and 59 minutes', () => {
    expect(formatRelativeTime('2026-05-22T11:58:00Z', now)).toBe('2 minutes ago');
    expect(formatRelativeTime('2026-05-22T11:01:00Z', now)).toBe('59 minutes ago');
  });
  it('returns "X hours ago" between 1 and 23 hours', () => {
    expect(formatRelativeTime('2026-05-22T10:00:00Z', now)).toBe('2 hours ago');
  });
  it('returns "Yesterday" for 1 calendar day ago', () => {
    expect(formatRelativeTime('2026-05-21T08:00:00Z', now)).toBe('Yesterday');
  });
  it('returns "X days ago" for 2–6 days ago', () => {
    expect(formatRelativeTime('2026-05-19T12:00:00Z', now)).toBe('3 days ago');
  });
  it('falls back to a short date for older entries', () => {
    expect(formatRelativeTime('2026-04-12T12:00:00Z', now)).toBe('Apr 12');
  });
  it('handles "1 minute ago" (singular) correctly', () => {
    expect(formatRelativeTime('2026-05-22T11:59:00Z', now)).toBe('1 minute ago');
  });
  it('handles "1 hour ago" (singular) correctly', () => {
    expect(formatRelativeTime('2026-05-22T11:00:00Z', now)).toBe('1 hour ago');
  });
});

// Used elsewhere just to assert the Note type compiles; the variable itself isn't
// asserted on but referencing it ensures the export stays public.
test('Note type is exported', () => {
  expect(note().id).toBe('n1');
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- --watchAll=false noteHelpers
```

Expected: FAIL with module-not-found / undefined export errors.

- [ ] **Step 3: Implement `noteHelpers.ts`**

`src/services/noteHelpers.ts`:

```ts
import type { Database } from '../lib/database.types';

type NoteRow = Database['public']['Tables']['notes']['Row'];
type NoteInsertRow = Database['public']['Tables']['notes']['Insert'];

export type Category = 'food' | 'stay' | 'activity' | 'shopping' | 'to-visit' | 'general';
export type TaggingStatus = 'pending' | 'complete' | 'failed';

// Narrow the DB's looser string types to our enums.
export type Note = Omit<NoteRow, 'category' | 'tagging_status'> & {
  category: Category | null;
  tagging_status: TaggingStatus;
};
export type NoteInsert = Omit<NoteInsertRow, 'category' | 'tagging_status'> & {
  category?: Category | null;
  tagging_status?: TaggingStatus;
};

export const CATEGORIES: Category[] = [
  'food',
  'stay',
  'activity',
  'shopping',
  'to-visit',
  'general',
];

const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food',
  stay: 'Stay',
  activity: 'Activity',
  shopping: 'Shopping',
  'to-visit': 'To-Visit',
  general: 'General',
};

export function categoryLabel(category: Category | null): string {
  if (!category) return '';
  return CATEGORY_LABELS[category];
}

export type ContentValidation =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too_long' };

const MAX_CONTENT_LEN = 8000;

export function validateContent(input: string): ContentValidation {
  const value = input.trim();
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (value.length > MAX_CONTENT_LEN) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const calendarDelta = Math.floor(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (calendarDelta === 1) return 'Yesterday';
  if (calendarDelta >= 2 && calendarDelta <= 6) return `${calendarDelta} days ago`;

  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -- --watchAll=false noteHelpers
```

Expected: PASS (all tests green).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/services/noteHelpers.ts src/services/__tests__/noteHelpers.test.ts
git commit -m "feat(notes): add noteHelpers (categories, validation, relative time) with tests"
```

---

## Task 6: `offlineQueue` — AsyncStorage-backed pending-notes queue (TDD)

**Files:**
- Create: `src/services/offlineQueue.ts`
- Create: `src/services/__tests__/offlineQueue.test.ts`

The queue is a single AsyncStorage key holding a JSON array of pending payloads ordered by insertion. Consumers can subscribe to changes so `useNotes` re-renders when items are added or drained.

- [ ] **Step 1: Write the failing tests**

`src/services/__tests__/offlineQueue.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  QUEUE_KEY,
  enqueue,
  peekAll,
  removeByOfflineId,
  subscribe,
  type PendingNote,
} from '../offlineQueue';

// jest-expo provides an in-memory AsyncStorage mock by default, but reset it
// between tests to keep state isolated.
beforeEach(async () => {
  await AsyncStorage.clear();
});

const pending = (overrides: Partial<PendingNote> = {}): PendingNote => ({
  offline_id: 'o1',
  user_id: 'u1',
  trip_id: 't1',
  content: 'hello',
  category: null,
  lat: null,
  lng: null,
  city: null,
  captured_at: '2026-05-22T12:00:00Z',
  ...overrides,
});

describe('offlineQueue', () => {
  it('starts empty', async () => {
    expect(await peekAll()).toEqual([]);
  });

  it('persists items in insertion order', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    const items = await peekAll();
    expect(items.map((x) => x.offline_id)).toEqual(['a', 'b']);
  });

  it('removes by offline_id without touching siblings', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    await enqueue(pending({ offline_id: 'c' }));
    await removeByOfflineId('b');
    const items = await peekAll();
    expect(items.map((x) => x.offline_id)).toEqual(['a', 'c']);
  });

  it('is a no-op when removing an unknown offline_id', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await removeByOfflineId('does-not-exist');
    expect((await peekAll()).map((x) => x.offline_id)).toEqual(['a']);
  });

  it('notifies subscribers on enqueue and remove', async () => {
    const events: number[] = [];
    const unsubscribe = subscribe((items) => events.push(items.length));
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    await removeByOfflineId('a');
    unsubscribe();
    await enqueue(pending({ offline_id: 'c' })); // post-unsubscribe, no event
    expect(events).toEqual([1, 2, 1]);
  });

  it('uses a stable storage key', () => {
    expect(QUEUE_KEY).toBe('iys.offlineQueue.v1');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- --watchAll=false offlineQueue
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `offlineQueue.ts`**

`src/services/offlineQueue.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from './noteHelpers';

export const QUEUE_KEY = 'iys.offlineQueue.v1';

// PendingNote is the client-side payload before Supabase has acknowledged it.
// Mirrors the columns the server will accept on insert.
export type PendingNote = {
  offline_id: string;
  user_id: string;
  trip_id: string;
  content: string;
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
  captured_at: string; // ISO timestamp set when Save was tapped
};

type Listener = (items: PendingNote[]) => void;
const listeners = new Set<Listener>();

async function readAll(): Promise<PendingNote[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingNote[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingNote[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  for (const fn of listeners) fn(items);
}

export async function enqueue(note: PendingNote): Promise<void> {
  const items = await readAll();
  items.push(note);
  await writeAll(items);
}

export async function peekAll(): Promise<PendingNote[]> {
  return readAll();
}

export async function removeByOfflineId(offlineId: string): Promise<void> {
  const items = await readAll();
  const next = items.filter((n) => n.offline_id !== offlineId);
  if (next.length === items.length) return; // no-op when not present
  await writeAll(next);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm test -- --watchAll=false offlineQueue
```

Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add src/services/offlineQueue.ts src/services/__tests__/offlineQueue.test.ts
git commit -m "feat(notes): add AsyncStorage-backed offlineQueue with subscriber"
```

---

## Task 7: `noteService` — createNote, listNotes, drainQueue

**Files:**
- Create: `src/services/noteService.ts`

This module wraps Supabase calls behind named functions. `createNote` writes to the queue first, then attempts a server insert via `upsert` with `onConflict: 'offline_id', ignoreDuplicates: true`. `drainQueue` does the same for all pending entries.

- [ ] **Step 1: Implement `noteService.ts`**

`src/services/noteService.ts`:

```ts
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { Note, NoteInsert, Category } from './noteHelpers';
import {
  enqueue,
  peekAll,
  removeByOfflineId,
  type PendingNote,
} from './offlineQueue';

export type CreateNoteInput = {
  userId: string;
  tripId: string;
  content: string; // already validated by caller
  category: Category | null;
  lat: number | null;
  lng: number | null;
  city: string | null;
};

// createNote always enqueues locally first; the server insert is best-effort.
// Returns the PendingNote synchronously so the caller can render it instantly.
export async function createNote(input: CreateNoteInput): Promise<PendingNote> {
  const pending: PendingNote = {
    offline_id: Crypto.randomUUID(),
    user_id: input.userId,
    trip_id: input.tripId,
    content: input.content,
    category: input.category,
    lat: input.lat,
    lng: input.lng,
    city: input.city,
    captured_at: new Date().toISOString(),
  };

  await enqueue(pending);
  // Fire-and-forget the server insert; queue retries on next drain if this fails.
  void trySync(pending);
  return pending;
}

// Try the server insert. On success, remove from queue. On failure, leave it.
async function trySync(pending: PendingNote): Promise<void> {
  const row: NoteInsert = {
    user_id: pending.user_id,
    trip_id: pending.trip_id,
    content: pending.content,
    category: pending.category ?? null,
    lat: pending.lat,
    lng: pending.lng,
    city: pending.city,
    offline_id: pending.offline_id,
    captured_at: pending.captured_at,
  };

  const { error } = await supabase
    .from('notes')
    .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });

  if (!error) {
    await removeByOfflineId(pending.offline_id);
  }
  // No throw: caller treats createNote as fire-and-forget after enqueue.
}

export async function listNotes(tripId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('trip_id', tripId)
    .order('captured_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Note[];
}

// Drains the queue in insertion order. Each item is attempted exactly once
// per drain pass; failures stay in the queue. Returns the number of items
// successfully synced so callers can log or surface progress.
export async function drainQueue(): Promise<number> {
  const items = await peekAll();
  let synced = 0;
  for (const item of items) {
    const row: NoteInsert = {
      user_id: item.user_id,
      trip_id: item.trip_id,
      content: item.content,
      category: item.category ?? null,
      lat: item.lat,
      lng: item.lng,
      city: item.city,
      offline_id: item.offline_id,
      captured_at: item.captured_at,
    };
    const { error } = await supabase
      .from('notes')
      .upsert(row, { onConflict: 'offline_id', ignoreDuplicates: true });
    if (!error) {
      await removeByOfflineId(item.offline_id);
      synced += 1;
    }
  }
  return synced;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/noteService.ts
git commit -m "feat(notes): add noteService (createNote, listNotes, drainQueue)"
```

---

## Task 8: `locationService` — GPS + reverse geocode wrapper

**Files:**
- Create: `src/services/locationService.ts`

`expo-location` requires a runtime permission prompt and may return null when the user denies. Wrap it so callers get a single function that returns `{ lat, lng, city } | null`.

- [ ] **Step 1: Implement `locationService.ts`**

`src/services/locationService.ts`:

```ts
import * as Location from 'expo-location';

export type LocationFix = {
  lat: number;
  lng: number;
  city: string | null;
};

// Requests permission if not already granted. Returns null on denial or any error.
export async function getCurrentLocation(): Promise<LocationFix | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const city = await reverseGeocodeCity(lat, lng);
    return { lat, lng, city };
  } catch {
    return null;
  }
}

// Best-effort city lookup. Returns null if the device returns no result.
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!results.length) return null;
    const r = results[0];
    return r.city ?? r.subregion ?? r.region ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/services/locationService.ts
git commit -m "feat(notes): add locationService (expo-location wrapper)"
```

---

## Task 9: `useConnectivity` hook

**Files:**
- Create: `src/hooks/useConnectivity.ts`

Wraps `@react-native-community/netinfo` to expose `isOnline: boolean` and an `onReconnect` registration helper that fires the drain.

- [ ] **Step 1: Implement `useConnectivity.ts`**

`src/hooks/useConnectivity.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export function useConnectivity(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((s) => {
      if (mounted) setIsOnline(deriveOnline(s));
    });
    const unsubscribe = NetInfo.addEventListener((s) => {
      setIsOnline(deriveOnline(s));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { isOnline };
}

// useOnReconnect fires `onReconnect` only on the offline→online edge,
// not on every NetInfo event.
export function useOnReconnect(onReconnect: () => void): void {
  const prevOnline = useRef<boolean>(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((s) => {
      const next = deriveOnline(s);
      if (!prevOnline.current && next) onReconnect();
      prevOnline.current = next;
    });
    return unsubscribe;
  }, [onReconnect]);
}

function deriveOnline(s: NetInfoState): boolean {
  // isInternetReachable can be null on iOS until the first probe — treat null as
  // "probably online" so we don't show a phantom offline indicator at app start.
  return Boolean(s.isConnected) && s.isInternetReachable !== false;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/hooks/useConnectivity.ts
git commit -m "feat(notes): add useConnectivity + useOnReconnect hooks"
```

---

## Task 10: `useLocation` hook

**Files:**
- Create: `src/hooks/useLocation.ts`

Wraps `locationService.getCurrentLocation` with lazy fetching when the capture sheet asks for it. Exposes `{ fix, loading, fetch }`.

- [ ] **Step 1: Implement `useLocation.ts`**

`src/hooks/useLocation.ts`:

```ts
import { useCallback, useState } from 'react';
import { getCurrentLocation, type LocationFix } from '../services/locationService';

type UseLocationState = {
  fix: LocationFix | null;
  loading: boolean;
  fetch: () => Promise<LocationFix | null>;
};

export function useLocation(): UseLocationState {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCurrentLocation();
      setFix(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fix, loading, fetch };
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/hooks/useLocation.ts
git commit -m "feat(notes): add useLocation hook"
```

---

## Task 11: `useNotes` hook — merge server + pending queue (with realtime)

**Files:**
- Create: `src/hooks/useNotes.ts`

`useNotes(tripId)` exposes a list of "feed items" — each is either a confirmed `Note` or a `PendingNote` that hasn't synced yet. The merge dedupes by `offline_id` (a confirmed note carrying the same `offline_id` as a pending entry wins, hiding the pending one).

- [ ] **Step 1: Implement `useNotes.ts`**

`src/hooks/useNotes.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listNotes } from '../services/noteService';
import { peekAll, subscribe, type PendingNote } from '../services/offlineQueue';
import type { Note } from '../services/noteHelpers';

export type FeedItem =
  | { kind: 'note'; note: Note }
  | { kind: 'pending'; pending: PendingNote };

type State = {
  items: FeedItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useNotes(tripId: string | undefined): State {
  const [notes, setNotes] = useState<Note[]>([]);
  const [pending, setPending] = useState<PendingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!tripId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listNotes(tripId);
      setNotes(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime: react to inserts / updates / deletes on the notes table for this trip.
  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`notes:${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setNotes((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as Note;
              if (prev.some((n) => n.id === next.id)) return prev;
              return [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as Note;
              return prev.map((n) => (n.id === next.id ? next : n));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<Note>;
              return prev.filter((n) => n.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId]);

  // Subscribe to the offline queue so newly-enqueued notes show instantly,
  // and removed (= synced) entries disappear from the feed without flicker.
  useEffect(() => {
    let cancelled = false;

    void peekAll().then((items) => {
      if (!cancelled) setPending(items);
    });

    const unsubscribe = subscribe((items) => {
      setPending(items);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const filteredPending = tripId ? pending.filter((p) => p.trip_id === tripId) : [];

  const items: FeedItem[] = mergeFeed(notes, filteredPending);

  return { items, loading, error, refresh };
}

// mergeFeed: confirmed notes win over pending entries with the same offline_id.
// Output is sorted by captured_at desc.
function mergeFeed(notes: Note[], pending: PendingNote[]): FeedItem[] {
  const noteIds = new Set(notes.map((n) => n.offline_id));
  const stillPending = pending.filter((p) => !noteIds.has(p.offline_id));

  const merged: FeedItem[] = [
    ...notes.map((note) => ({ kind: 'note' as const, note })),
    ...stillPending.map((pending) => ({ kind: 'pending' as const, pending })),
  ];

  merged.sort((a, b) => {
    const ta = a.kind === 'note' ? a.note.captured_at : a.pending.captured_at;
    const tb = b.kind === 'note' ? b.note.captured_at : b.pending.captured_at;
    return tb.localeCompare(ta);
  });

  return merged;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/hooks/useNotes.ts
git commit -m "feat(notes): add useNotes hook merging server rows with pending queue"
```

---

## Task 12: `CategoryPicker` component

**Files:**
- Create: `src/components/CategoryPicker.tsx`

Horizontal scrollable row of pills. Pressing a pill toggles it (single-select). Reused by `NoteCaptureSheet` here and later by Module 8 search filters.

- [ ] **Step 1: Implement `CategoryPicker.tsx`**

`src/components/CategoryPicker.tsx`:

```tsx
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';
import { CATEGORIES, categoryLabel, type Category } from '../services/noteHelpers';
import { Colors, Spacing, Typography } from '../theme';

type Props = {
  value: Category | null;
  onChange: (next: Category | null) => void;
};

export default function CategoryPicker({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {CATEGORIES.map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onChange(selected ? null : c)}
            style={[styles.pill, selected && styles.pillSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Category ${categoryLabel(c)}`}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {categoryLabel(c)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Spacing.md, gap: Spacing.sm, paddingVertical: Spacing.sm },
  pill: {
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  label: { ...Typography.body, color: Colors.textSecondary },
  labelSelected: { color: Colors.background, fontWeight: '600' },
});
```

> **Theme token check:** open `src/theme/index.ts` and confirm `Colors.border` and `Colors.textSecondary` exist (they did at end of Phase 2). If a token is missing, either add it to the theme or substitute the closest existing one — do not introduce a hardcoded hex.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/CategoryPicker.tsx
git commit -m "feat(notes): add CategoryPicker pill row component"
```

---

## Task 13: `TripSelector` component

**Files:**
- Create: `src/components/TripSelector.tsx`

Renders one of three states depending on the user's active trips:
- Zero active trips → inline prompt with a `Start one →` link.
- One active trip → non-interactive label with the trip name.
- Multiple active trips → horizontal row of selectable chips.

- [ ] **Step 1: Implement `TripSelector.tsx`**

`src/components/TripSelector.tsx`:

```tsx
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import type { Trip } from '../services/tripHelpers';

type Props = {
  activeTrips: Trip[];
  selectedTripId: string | null;
  onSelect: (tripId: string) => void;
  onStartTrip: () => void;
};

export default function TripSelector({
  activeTrips,
  selectedTripId,
  onSelect,
  onStartTrip,
}: Props) {
  if (activeTrips.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyLabel}>No active trips.</Text>
        <Pressable onPress={onStartTrip} accessibilityRole="button">
          <Text style={styles.link}>Start one →</Text>
        </Pressable>
      </View>
    );
  }

  if (activeTrips.length === 1) {
    return (
      <View style={styles.singleRow}>
        <Text style={styles.singleLabel}>{activeTrips[0].name}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {activeTrips.map((trip) => {
        const selected = trip.id === selectedTripId;
        return (
          <Pressable
            key={trip.id}
            onPress={() => onSelect(trip.id)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
              {trip.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyLabel: { ...Typography.body, color: Colors.textSecondary },
  link: { ...Typography.body, color: Colors.accent, fontWeight: '600' },
  singleRow: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  singleLabel: { ...Typography.heading, color: Colors.textPrimary },
  chips: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipLabel: { ...Typography.body, color: Colors.textSecondary },
  chipLabelSelected: { color: Colors.background, fontWeight: '600' },
});
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/TripSelector.tsx
git commit -m "feat(notes): add TripSelector (single / multi / empty states)"
```

---

## Task 14: `NoteCard` component

**Files:**
- Create: `src/components/NoteCard.tsx`

One feed item. Two render modes:
1. `kind: 'note'` — confirmed server note. Show category badge if set; otherwise an animated shimmer where the badge will appear (because `tagging_status === 'pending'`).
2. `kind: 'pending'` — queue entry. Show a `⏳ Syncing` indicator and any category the user picked manually.

- [ ] **Step 1: Implement `NoteCard.tsx`**

`src/components/NoteCard.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { categoryLabel, formatRelativeTime, type Note, type Category } from '../services/noteHelpers';
import type { PendingNote } from '../services/offlineQueue';
import type { FeedItem } from '../hooks/useNotes';

type Props = { item: FeedItem };

export default function NoteCard({ item }: Props) {
  if (item.kind === 'note') return <ServerNoteCard note={item.note} />;
  return <PendingNoteCard pending={item.pending} />;
}

function ServerNoteCard({ note }: { note: Note }) {
  const showShimmer = note.tagging_status === 'pending' && !note.category;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {note.category ? (
          <CategoryBadge category={note.category} />
        ) : showShimmer ? (
          <ShimmerBadge />
        ) : null}
        <Text style={styles.meta}>
          {[note.city, formatRelativeTime(note.captured_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content}>{note.content}</Text>
    </View>
  );
}

function PendingNoteCard({ pending }: { pending: PendingNote }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {pending.category ? <CategoryBadge category={pending.category} /> : null}
        <Text style={[styles.meta, styles.syncing]}>
          {[pending.city, '⏳ Syncing'].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.content}>{pending.content}</Text>
    </View>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{categoryLabel(category)}</Text>
    </View>
  );
}

function ShimmerBadge() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.badge, styles.shimmer, { opacity }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  badge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    minHeight: 18,
    minWidth: 56,
  },
  badgeLabel: { ...Typography.caption, color: Colors.background, fontWeight: '600' },
  shimmer: { backgroundColor: Colors.border },
  meta: { ...Typography.caption, color: Colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  syncing: { color: Colors.accent },
  content: { ...Typography.body, color: Colors.textPrimary },
});
```

> **Theme tokens:** `Typography.caption` is expected to exist; if it's missing, add `caption: { fontSize: 12, lineHeight: 16 }` to `src/theme/index.ts` before this task compiles.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/NoteCard.tsx
git commit -m "feat(notes): add NoteCard with shimmer + sync indicator"
```

---

## Task 15: `NoteCaptureSheet` component

**Files:**
- Create: `src/components/NoteCaptureSheet.tsx`

A pageSheet modal (same pattern as `CreateTripSheet`) that composes `TripSelector`, the text input, `CategoryPicker`, the GPS indicator, and the Save button. Voice mic and photo picker render as inert icons.

- [ ] **Step 1: Implement `NoteCaptureSheet.tsx`**

`src/components/NoteCaptureSheet.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { createNote } from '../services/noteService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, Typography } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void; // user tapped "Start one →" with no active trips
};

export default function NoteCaptureSheet({ visible, onClose, onStartTrip }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-select the most recent active trip whenever the sheet opens or
  // active trips change. Single-trip case the picker shows it as a label.
  useEffect(() => {
    if (!visible) return;
    if (activeTrips.length === 0) setSelectedTripId(null);
    else if (!selectedTripId || !activeTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(activeTrips[0].id);
    }
  }, [visible, activeTrips, selectedTripId]);

  // Reset content + start the GPS fetch when the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setContent('');
    setCategory(null);
    void fetchLocation();
  }, [visible, fetchLocation]);

  const canSave =
    !saving && selectedTripId !== null && validateContent(content).ok;

  const handleSave = async () => {
    if (!userId || !selectedTripId) return;
    const validation = validateContent(content);
    if (!validation.ok) {
      Alert.alert(
        'Cannot save note',
        validation.reason === 'empty' ? 'Add some text first.' : 'Note is too long (max 8000 chars).',
      );
      return;
    }
    setSaving(true);
    try {
      // Always fetch a fresh GPS reading at the moment of Save — accounts for
      // long-form typing where the user may have moved.
      const latest = await fetchLocation();
      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: latest?.lat ?? fix?.lat ?? null,
        lng: latest?.lng ?? fix?.lng ?? null,
        city: latest?.city ?? fix?.city ?? null,
      });
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const locationLabel = locating
    ? '📍 Locating…'
    : fix?.city
    ? `📍 ${fix.city}`
    : '📍 No location';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <TripSelector
          activeTrips={activeTrips}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          onStartTrip={() => {
            onClose();
            onStartTrip();
          }}
        />

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <View style={styles.actionRow}>
          <View style={styles.actionLeft}>
            <InertIcon symbol="🎙️" accessibilityLabel="Voice (coming in Phase 4)" />
            <InertIcon symbol="📷" accessibilityLabel="Photo (coming in Phase 5)" />
            <Text style={styles.locationLabel}>{locationLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function InertIcon({ symbol, accessibilityLabel }: { symbol: string; accessibilityLabel: string }) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.inertIcon}>
      <Text style={styles.inertIconLabel}>{symbol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    minHeight: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  inertIcon: { opacity: 0.4, padding: Spacing.xs },
  inertIconLabel: { fontSize: 20 },
  locationLabel: { ...Typography.caption, color: Colors.textSecondary, marginLeft: Spacing.sm },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { ...Typography.body, color: Colors.background, fontWeight: '600' },
});
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat(notes): add NoteCaptureSheet (text-only capture with GPS)"
```

---

## Task 16: `FloatingCaptureButton` component

**Files:**
- Create: `src/components/FloatingCaptureButton.tsx`

A circular FAB that sits above the tab bar. It owns nothing — just renders the icon and calls `onPress`.

- [ ] **Step 1: Implement `FloatingCaptureButton.tsx`**

`src/components/FloatingCaptureButton.tsx`:

```tsx
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../theme';

type Props = {
  onPress: () => void;
};

// Tab bar height heuristic: RN @react-navigation/bottom-tabs renders a ~49pt
// bar on iOS plus the bottom safe-area inset. Stacking the FAB ~16pt above
// that keeps it well-clear of the tab labels.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
const FAB_GAP = 16;

export default function FloatingCaptureButton({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Capture a note"
      style={({ pressed }) => [
        styles.fab,
        { bottom },
        pressed && styles.fabPressed,
      ]}
    >
      <Text style={styles.icon}>＋</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPressed: { opacity: 0.85 },
  icon: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '600' },
});
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/FloatingCaptureButton.tsx
git commit -m "feat(notes): add FloatingCaptureButton FAB"
```

---

## Task 17: Replace `TripFeedScreen` placeholder with real feed

**Files:**
- Modify: `src/screens/trip/TripFeedScreen.tsx`

The screen receives `tripId` from `TripDetailScreen`. Render a `FlatList` of `NoteCard`s.

- [ ] **Step 1: Open `TripDetailScreen.tsx` and confirm it passes `tripId` to `TripFeedScreen`.**

If it currently renders `<TripFeedScreen />` with no props, change it to `<TripFeedScreen tripId={trip.id} />`. (Edit `src/screens/trip/TripDetailScreen.tsx` minimally; do not introduce a navigation push.)

- [ ] **Step 2: Replace `TripFeedScreen.tsx` content**

`src/screens/trip/TripFeedScreen.tsx`:

```tsx
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNotes } from '../../hooks/useNotes';
import NoteCard from '../../components/NoteCard';
import { Colors, Spacing, Typography } from '../../theme';

type Props = { tripId: string };

export default function TripFeedScreen({ tripId }: Props) {
  const { items, loading, error } = useNotes(tripId);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load notes: {error.message}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No notes yet.</Text>
        <Text style={styles.emptyBody}>
          Tap the + button to capture your first memory.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) =>
        item.kind === 'note' ? `note:${item.note.id}` : `pending:${item.pending.offline_id}`
      }
      renderItem={({ item }) => <NoteCard item={item} />}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  list: { paddingTop: Spacing.md, paddingBottom: 96 /* clear of FAB */ },
  emptyTitle: { ...Typography.heading, color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyBody: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  error: { ...Typography.body, color: Colors.error, textAlign: 'center' },
});
```

> **Theme tokens:** `Colors.error` is already defined in `src/theme/index.ts` (`#FF453A`). No theme additions needed for this task.

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add src/screens/trip/TripFeedScreen.tsx src/screens/trip/TripDetailScreen.tsx
git commit -m "feat(notes): wire TripFeedScreen to useNotes with FlatList"
```

---

## Task 18: Mount FAB + sheet + connectivity-driven drain in `MainStack`

**Files:**
- Modify: `src/navigation/MainStack.tsx`

`MainStack` is the right place because (a) it sits inside the authed gate, so the FAB only renders when a user is logged in; (b) it wraps the inner navigator, so an overlay sibling persists across tabs and TripDetail.

The current file (end of Phase 2) is:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import { Colors } from '../theme';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/trip/TripDetailScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTitleStyle: { color: Colors.textPrimary },
        headerTintColor: Colors.accent,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="TripDetail"
        component={TripDetailScreen}
        options={{ title: '', headerBackTitle: 'Home' }}
      />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 1: Replace the file with the version below**

`src/navigation/MainStack.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { View, AppState, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import { Colors } from '../theme';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/trip/TripDetailScreen';
import FloatingCaptureButton from '../components/FloatingCaptureButton';
import NoteCaptureSheet from '../components/NoteCaptureSheet';
import { useOnReconnect } from '../hooks/useConnectivity';
import { drainQueue } from '../services/noteService';

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  const [captureOpen, setCaptureOpen] = useState(false);

  // Drain on mount — covers app-restart resume of any queued notes.
  useEffect(() => {
    void drainQueue();
  }, []);

  // Drain on offline→online edge.
  useOnReconnect(
    useCallback(() => {
      void drainQueue();
    }, []),
  );

  // Drain on background→foreground transition.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTitleStyle: { color: Colors.textPrimary },
          headerTintColor: Colors.accent,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen
          name="TripDetail"
          component={TripDetailScreen}
          options={{ title: '', headerBackTitle: 'Home' }}
        />
      </Stack.Navigator>
      <FloatingCaptureButton onPress={() => setCaptureOpen(true)} />
      <NoteCaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onStartTrip={() => {
          // No global "start trip" route exists yet; defer to the Home screen's
          // CTA. Closing the sheet drops the user back on whatever tab they
          // were on — Home is the default, where the "Start new trip" button
          // lives. A dedicated cross-screen route can land in a later phase.
          setCaptureOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/navigation/MainStack.tsx
git commit -m "feat(notes): overlay FAB + capture sheet in MainStack with drain triggers"
```

---

## Task 19: Smoke-test the database round-trip without UI

**Files:** none (verification only)

Before opening the iOS simulator, prove the schema accepts inserts via MCP. This catches RLS / FK / constraint issues without React Native noise.

- [ ] **Step 1: Pick an active trip**

Call `mcp__supabase__execute_sql`:

```sql
select id, user_id, name from public.trips
where status='active'
order by created_at desc
limit 1;
```

Save the returned `id` and `user_id` as `TRIP_ID` and `USER_ID` for the next step.

- [ ] **Step 2: Insert a note as the trip's owner**

Because MCP runs under a service role, RLS isn't enforced for this insert — that's fine for a smoke test. Use:

```sql
insert into public.notes (user_id, trip_id, content, category, offline_id)
values ('<USER_ID>', '<TRIP_ID>', 'smoke test note', 'general', gen_random_uuid())
returning id, captured_at, tagging_status;
```

Expected: one row returned with `tagging_status = 'pending'` and a fresh UUID `id`.

- [ ] **Step 3: Confirm note_count incremented on the trip**

```sql
select note_count from public.trips where id='<TRIP_ID>';
```

Expected: `note_count` is 1 higher than before the insert.

- [ ] **Step 4: Delete the smoke-test note**

```sql
delete from public.notes where content='smoke test note' and trip_id='<TRIP_ID>';
```

- [ ] **Step 5: Confirm note_count decremented**

```sql
select note_count from public.trips where id='<TRIP_ID>';
```

Expected: back to the original value.

If any step fails, **stop and debug the migration**, not the app code. (The most likely failures are RLS on insert — the policy in 004 requires the trip belong to the same `auth.uid()`, but MCP uses service role and bypasses RLS, so RLS should not be the issue here. Foreign-key violations point at wrong UUIDs.)

---

## Task 20: Manual iOS simulator verification

**Files:** none (verification only)

The plan is unverified until the full loop works in the simulator.

- [ ] **Step 1: Boot the app**

```bash
npx expo start --ios
```

Wait for Metro and the simulator to attach. If the simulator runtime is missing, install it via Xcode → Settings → Platforms (one-time setup; same as Phase 1).

- [ ] **Step 2: Log in with the dev account** (the one created during Phase 1 verify). Confirm Home shows the existing trips.

- [ ] **Step 3: Capture a text note end-to-end**

1. Tap the FAB. Confirm `NoteCaptureSheet` slides up.
2. Confirm the trip selector shows the active trip (or a chip row if multiple).
3. Type a short note (`"Lunch at Ichiran"`). Tap `Food`.
4. Confirm the location indicator shows `📍 Locating…` then a city name (or `📍 No location` if you denied permission — both are valid outcomes; verify the deny path at least once).
5. Tap **Save**.

Expected: sheet dismisses immediately. Open the trip detail → Feed tab. The note appears at the top with the `Food` badge, the city, and a relative time.

- [ ] **Step 4: Verify the note hit Supabase**

Call `mcp__supabase__execute_sql`:

```sql
select id, content, category, city, tagging_status, offline_id, captured_at
from public.notes
where content = 'Lunch at Ichiran'
order by created_at desc
limit 1;
```

Expected: one row, `category='food'`, `tagging_status='pending'`, `offline_id` non-null. If `city` is null, that's fine — depends on whether you granted location permission.

- [ ] **Step 5: Verify the trip's note_count updated on Home**

Go back to Home. The trip card should show an incremented note count.

- [ ] **Step 6: Test the offline path**

1. In the simulator, enable Airplane mode (`Settings → Airplane Mode` inside the simulator).
2. Capture another note (`"Offline captured"`).

Expected: the note appears in the Feed with a `⏳ Syncing` indicator.

3. Turn Airplane mode off.

Expected within ~5 seconds: the syncing indicator disappears, the note now shows a clean relative time (and shimmer in the badge slot if no category was set, since AI tagging is deferred).

Verify in MCP:

```sql
select content, offline_id from public.notes where content = 'Offline captured';
```

Expected: one row.

- [ ] **Step 7: Test multi-trip selector**

If you only have one active trip, create a second active trip via Home → Start new trip. Then open the capture sheet again — the trip selector should now be a chip row, and the most recently used trip should be preselected. Switch chips and confirm a saved note lands on the right trip.

- [ ] **Step 8: Test the empty-trips path**

End all active trips (Home → trip → End Trip). Open the capture sheet — it should show the `No active trips. [Start one →]` prompt. Tapping the link should close the sheet.

- [ ] **Step 9: Test FAB persistence across tabs**

Switch to Explore / Search / Blog. The FAB should remain visible. Push into TripDetail. The FAB should remain visible there too.

- [ ] **Step 10: Record any deviations**

If anything fails, fix the source file(s), re-verify, then move on. Do not check off this step until all 9 sub-steps pass.

---

## Task 21: Update `docs/progress.md`

**Files:**
- Modify: `docs/progress.md`

- [ ] **Step 1: Add a Phase 3 section + flip status**

At the top of the file, change the `Status:` line to:

```
**Status:** Phase 3 merged ✅ — PR #<N>; manual sim verified <YYYY-MM-DD>. Next: Phase 4 (Voice + Intent).
```

In the `What's Been Built So Far` table, append rows for:
- Migration 004 — notes (`supabase/migrations/004_notes.sql`)
- Migration 005 — note_count triggers (`supabase/migrations/005_trips_note_count.sql`)
- noteHelpers + tests (`src/services/noteHelpers.ts`)
- offlineQueue + tests (`src/services/offlineQueue.ts`)
- noteService (`src/services/noteService.ts`)
- locationService (`src/services/locationService.ts`)
- useNotes / useConnectivity / useLocation (`src/hooks/`)
- CategoryPicker / TripSelector / NoteCard / NoteCaptureSheet / FloatingCaptureButton (`src/components/`)
- TripFeedScreen (real feed)
- MainStack overlay (FAB + sheet + drain)

Add a **`## Phase 3 task summary`** section listing each task with a ✅. Mirror the Phase 2 summary table.

Record any new follow-ups under `### Phase 3 follow-ups noticed during execution` — e.g., theme tokens that needed to be added, deprecation warnings from `expo-location`, or any UI rough edges deferred to later phases.

Update `Next session checklist` to point at Phase 4 (Voice + Intent), with:

```
1. Plan exists at docs/superpowers/plans/plan-04-voice-intent.md — same prep pattern: freshness-check + numbered execution plan + new branch phase-4/voice-intent.
2. Phase 3 left these stubs in NoteCaptureSheet: mic button + photo picker icon. Phase 4 wires the mic to iOS Native STT + Claude intent detection.
```

- [ ] **Step 2: Commit**

```bash
git add docs/progress.md
git commit -m "docs(progress): mark Phase 3 complete; queue Phase 4 follow-ups"
```

---

## Task 22: Open PR into `main`

**Files:** none (git only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin phase-3/note-capture
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "Phase 3 — Note Capture (text + GPS + offline queue)" --body "$(cat <<'EOF'
## Summary
- Adds the `notes` table (Migration 004) with RLS that scopes inserts to the user's own trips, plus an `offline_id` unique constraint for safe queue retries.
- Migration 005 auto-maintains `trips.note_count` via row-level triggers (locked-down search_path per Phase 2 follow-ups).
- Global FAB + `NoteCaptureSheet` mounted in `MainStack`. Capture supports text + category + GPS auto-tagging. Voice mic and photo picker are inert stubs (Phases 4 + 5).
- Offline-first: notes enqueue to AsyncStorage on Save and Supabase-upsert in the background. Drains fire on app start, NetInfo reconnect, and AppState foreground.
- `useNotes` merges server rows with pending queue items, deduped by `offline_id`, with realtime updates.
- `TripFeedScreen` replaces the Phase 2 placeholder with a real `FlatList` of `NoteCard`s; pending notes show a `⏳ Syncing` chip; confirmed notes with `tagging_status='pending'` show a shimmer where the AI category badge will land in Phase 6.

## Test plan
- [x] `npm test -- --watchAll=false` (noteHelpers + offlineQueue) passes
- [x] `npx tsc --noEmit` passes
- [x] Manual sim: capture a text note (with + without location permission)
- [x] Manual sim: airplane-mode capture, then reconnect drains within seconds
- [x] Manual sim: trip selector handles 0 / 1 / multiple active trips
- [x] Manual sim: FAB visible from every tab and inside TripDetail
- [x] MCP: smoke-test insert/delete round-trip + note_count trigger
EOF
)"
```

- [ ] **Step 3: Wait for the PR to be reviewed + merged**, then sync `main` locally:

```bash
git checkout main
git pull --ff-only
git branch -d phase-3/note-capture
```

(Leave the remote branch deletion to GitHub's PR settings, or run `git push origin --delete phase-3/note-capture` once merged.)

---

## Done criteria

Phase 3 is complete when:
- All 22 tasks above are checked off.
- The dev account in the iOS simulator can capture a note end-to-end with the FAB and see it persist on relaunch.
- `mcp__supabase__get_advisors` returns no new warnings against `public.notes` or `public.bump_trip_note_count`.
- `docs/progress.md` is updated and the PR is merged into `main`.

Phase 4 picks up at `docs/superpowers/plans/plan-04-voice-intent.md` — same prep pattern: freshness-check first, then convert to a numbered plan, then execute on `phase-4/voice-intent`.
