# Move Notes Between Trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user reassign a single note to any other trip they own, from the note's edit sheet, as an immediate atomic action.

**Architecture:** A new migration keeps `trips.note_count` correct on a `trip_id` change and tightens the notes UPDATE RLS to forbid moving onto a non-owned trip. A thin `moveNote` service writes only `trip_id`. A new `MoveToTripSheet` modal lists the user's other trips; `NoteEditSheet` gains a "Move to trip…" button and an `onMoved` callback, wired in both feed/map hosts to refresh the source feed.

**Tech Stack:** React Native (Expo), TypeScript, Supabase (Postgres + RLS + triggers), Jest (jest-expo).

**Spec:** `docs/superpowers/specs/2026-06-21-move-notes-between-trips-design.md`

**Branch:** `backlog/move-notes-between-trips` (already created; spec already committed).

---

### Task 1: Migration — `note_count` UPDATE trigger + RLS hardening

**Files:**
- Create: `supabase/migrations/012_notes_move_between_trips.sql`

This task has no Jest test — it is verified directly against Supabase via MCP in Task 2's verification step and in final QA. The migration must be **idempotent-safe to author** (uses `create or replace` for the function, `drop ... if exists` for the policy/trigger before recreating).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/012_notes_move_between_trips.sql`:

```sql
-- Moving a note between trips: keep trips.note_count correct and tighten RLS.
--
-- 005_trips_note_count.sql maintained note_count only on INSERT/DELETE. An
-- UPDATE that changes notes.trip_id (a "move") adjusted neither trip's count.
-- Here we add an UPDATE branch (guarded so all other note edits are no-ops),
-- and we tighten the notes UPDATE policy so a note can only be moved onto a
-- trip the user owns (the INSERT policy already enforced this; UPDATE did not).

-- 1. Extend the counter function with an UPDATE branch.
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
  elsif (tg_op = 'UPDATE') then
    if (new.trip_id is distinct from old.trip_id) then
      update public.trips
        set note_count = greatest(0, note_count - 1)
        where id = old.trip_id;
      update public.trips
        set note_count = note_count + 1
        where id = new.trip_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_trip_note_count() from public;
revoke execute on function public.bump_trip_note_count() from anon;
revoke execute on function public.bump_trip_note_count() from authenticated;

-- 2. Fire the function on UPDATE too. The `is distinct from` guard inside the
--    function makes this a cheap no-op for content/location/tagging edits.
drop trigger if exists notes_bump_count_update on public.notes;
create trigger notes_bump_count_update
  after update on public.notes
  for each row execute function public.bump_trip_note_count();

-- 3. Tighten the notes UPDATE policy: the target trip must belong to the user.
--    Mirrors the INSERT policy's WITH CHECK; closes a cross-trip move hole.
drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration to Supabase via MCP**

Use the Supabase MCP `apply_migration` tool (project `dcejrbyujfcxartywpis`), name `notes_move_between_trips`, with the SQL body above.
Expected: success, no error.

- [ ] **Step 3: Verify the trigger and policy exist**

Use the Supabase MCP `execute_sql` tool:

```sql
select tgname from pg_trigger where tgrelid = 'public.notes'::regclass and tgname = 'notes_bump_count_update';
select pg_get_expr(polwithcheck, polrelid) from pg_policy where polname = 'notes_update_own';
```
Expected: the trigger row is returned, and the policy's WITH CHECK expression includes the `exists (... from trips t where t.id = trip_id and t.user_id = ...)` clause.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_notes_move_between_trips.sql
git commit -m "feat: migration for moving notes between trips (note_count + RLS)"
```

---

### Task 2: `moveNote` service

**Files:**
- Modify: `src/services/noteService.ts` (add `moveNote` near `updateNote`/`deleteNote`, ~line 135)
- Test: `src/services/__tests__/noteService.test.ts` (add a `describe('moveNote', ...)` block)

- [ ] **Step 1: Write the failing test**

Add to `src/services/__tests__/noteService.test.ts`. The file already mocks `supabase` with `mockFrom`/`mockUpdate`/`mockEq` (see top of file) and imports from `../noteService`. Extend the import line to include `moveNote`, then add:

```ts
describe('moveNote', () => {
  it('updates only trip_id and resolves on success', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(moveNote('note-1', 'trip-2')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).toHaveBeenCalledWith({ trip_id: 'trip-2' });
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('rls denied') });

    await expect(moveNote('note-1', 'trip-2')).rejects.toThrow('rls denied');
  });
});
```

Update the existing import in the test file:

```ts
import { updateNote, deleteNote, drainQueue, moveNote, type UpdateNoteInput } from '../noteService';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/noteService.test.ts -t moveNote`
Expected: FAIL — `moveNote is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

In `src/services/noteService.ts`, add after `updateNote` (before `deleteNote`):

```ts
/**
 * Reassign a note to a different trip. Touches only trip_id — deliberately NOT
 * routed through updateNote, so it does not reset tagging_status or re-resolve
 * location. RLS (notes_update_own) enforces that newTripId belongs to the user.
 */
export async function moveNote(noteId: string, newTripId: string): Promise<void> {
  const { error } = await supabase
    .from('notes')
    .update({ trip_id: newTripId })
    .eq('id', noteId);

  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/noteService.test.ts -t moveNote`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/noteService.ts src/services/__tests__/noteService.test.ts
git commit -m "feat: moveNote service (single-column trip_id reassignment)"
```

---

### Task 3: `MoveToTripSheet` component

**Files:**
- Create: `src/components/MoveToTripSheet.tsx`
- Test: `src/components/__tests__/MoveToTripSheet.test.tsx`

The sheet is a `pageSheet` Modal. On show it loads the user's trips via `listTrips(userId)`, filters out `currentTripId`, and renders a `FlatList`. Tapping a row shows an `Alert` confirm; confirming calls `moveNote(noteId, target.id)`, then `onMoved()`, then `onClose()`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/MoveToTripSheet.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MoveToTripSheet from '../MoveToTripSheet';
import { listTrips } from '../../services/tripService';
import { moveNote } from '../../services/noteService';
import type { Trip } from '../../services/tripHelpers';

jest.mock('../../services/tripService', () => ({ listTrips: jest.fn() }));
jest.mock('../../services/noteService', () => ({ moveNote: jest.fn() }));

const mockListTrips = listTrips as jest.MockedFunction<typeof listTrips>;
const mockMoveNote = moveNote as jest.MockedFunction<typeof moveNote>;

const trip = (id: string, name: string): Trip =>
  ({
    id,
    user_id: 'u1',
    name,
    destinations: ['Paris'],
    status: 'active',
    note_count: 0,
    cover_photo_url: null,
    start_date: null,
    end_date: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }) as unknown as Trip;

beforeEach(() => {
  jest.clearAllMocks();
  mockListTrips.mockResolvedValue([trip('t1', 'Current Trip'), trip('t2', 'Other Trip')]);
});

function renderSheet(overrides: Partial<{ onClose: jest.Mock; onMoved: jest.Mock }> = {}) {
  const onClose = overrides.onClose ?? jest.fn();
  const onMoved = overrides.onMoved ?? jest.fn();
  const utils = render(
    <MoveToTripSheet
      visible
      userId="u1"
      currentTripId="t1"
      noteId="n1"
      onClose={onClose}
      onMoved={onMoved}
    />,
  );
  return { ...utils, onClose, onMoved };
}

it('lists the user trips excluding the current trip', async () => {
  const { queryByText, getByText } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  expect(queryByText('Current Trip')).toBeNull();
});

it('moves the note and calls onMoved after confirmation', async () => {
  // Auto-confirm the Alert by invoking the "Move" button's onPress.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const move = (buttons ?? []).find((b) => b.text === 'Move');
    move?.onPress?.();
  });
  mockMoveNote.mockResolvedValue(undefined);

  const { getByText, onMoved } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  fireEvent.press(getByText('Other Trip'));

  await waitFor(() => expect(mockMoveNote).toHaveBeenCalledWith('n1', 't2'));
  expect(onMoved).toHaveBeenCalled();
});

it('does nothing when the confirmation is cancelled', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {}); // user dismisses
  const { getByText, onMoved } = renderSheet();
  await waitFor(() => expect(getByText('Other Trip')).toBeTruthy());
  fireEvent.press(getByText('Other Trip'));

  expect(mockMoveNote).not.toHaveBeenCalled();
  expect(onMoved).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/MoveToTripSheet.test.tsx`
Expected: FAIL — cannot find module `../MoveToTripSheet`.

- [ ] **Step 3: Write the component**

Create `src/components/MoveToTripSheet.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { listTrips } from '../services/tripService';
import { moveNote } from '../services/noteService';
import type { Trip } from '../services/tripHelpers';
import TripStatusBadge from './TripStatusBadge';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  userId: string;
  currentTripId: string;
  noteId: string;
  onClose: () => void;
  onMoved: () => void;
};

export default function MoveToTripSheet({
  visible,
  userId,
  currentTripId,
  noteId,
  onClose,
  onMoved,
}: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);

  const handleShow = async () => {
    setLoading(true);
    try {
      const all = await listTrips(userId);
      setTrips(all.filter((t) => t.id !== currentTripId));
    } catch (e) {
      Alert.alert('Could not load trips', (e as Error).message);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  };

  // Reset when the sheet hides so a stale list never flashes on reopen.
  useEffect(() => {
    if (!visible) setTrips([]);
  }, [visible]);

  const confirmMove = (trip: Trip) => {
    if (moving) return;
    Alert.alert('Move note', `Move this note to "${trip.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: async () => {
          setMoving(true);
          try {
            await moveNote(noteId, trip.id);
            onMoved();
          } catch (e) {
            Alert.alert('Could not move note', (e as Error).message);
          } finally {
            setMoving(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
      onShow={handleShow}
    >
      <View style={styles.flex}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Move to Trip</Text>
          <Pressable onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
        ) : trips.length === 0 ? (
          <Text style={styles.empty}>No other trips to move this note to.</Text>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const dest = item.destinations.length > 0 ? item.destinations[0] : null;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => confirmMove(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${item.name}`}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {dest ? <Text style={styles.rowDest}>{dest}</Text> : null}
                  </View>
                  <TripStatusBadge status={item.status} />
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  cancelButton: { padding: 4 },
  cancelLabel: { fontSize: 16, color: Colors.accent },
  empty: { color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.lg },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowText: { flex: 1, marginRight: Spacing.sm },
  rowName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  rowDest: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
```

> **Note for executor:** confirm `BorderRadius.input` and `Colors.border`/`Colors.textSecondary` exist in `src/theme/index.ts` (they are used by `NoteEditSheet`, so they do). If `TripStatusBadge`'s import path or `status` prop differs, match its actual signature (`status: TripStatus`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/MoveToTripSheet.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/MoveToTripSheet.tsx src/components/__tests__/MoveToTripSheet.test.tsx
git commit -m "feat: MoveToTripSheet modal trip picker"
```

---

### Task 4: Wire "Move to trip…" into `NoteEditSheet`

**Files:**
- Modify: `src/components/NoteEditSheet.tsx`
- Test: `src/components/__tests__/NoteEditSheet.test.tsx`

`NoteEditSheet` gains an `onMoved: () => void` prop, local `showMove` state, a "Move to trip…" button above "Delete Note", and renders `MoveToTripSheet`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/__tests__/NoteEditSheet.test.tsx`. The file's `renderSheet` helper currently passes only `onClose`/`onDeleted`; add a sibling test that passes `onMoved` and opens the move sheet:

```tsx
describe('NoteEditSheet — move to trip', () => {
  it('opens the move sheet when "Move to trip…" is pressed', () => {
    const { getByLabelText, getByText } = render(
      <NoteEditSheet
        note={baseNote}
        visible
        onClose={jest.fn()}
        onDeleted={jest.fn()}
        onMoved={jest.fn()}
      />,
    );
    fireEvent.press(getByLabelText('Move note to another trip'));
    expect(getByText('Move to Trip')).toBeTruthy();
  });
});
```

> The test relies on `MoveToTripSheet` rendering its "Move to Trip" title once visible. `listTrips` is called inside it on show — mock it at the top of this test file if not already mocked: `jest.mock('../../services/tripService', () => ({ listTrips: jest.fn().mockResolvedValue([]) }));`. If the file already mocks `tripService`, extend that mock instead of adding a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/NoteEditSheet.test.tsx -t "move to trip"`
Expected: FAIL — no element labelled "Move note to another trip".

- [ ] **Step 3: Implement the wiring**

In `src/components/NoteEditSheet.tsx`:

1. Add the import near the other component imports:

```tsx
import MoveToTripSheet from './MoveToTripSheet';
```

2. Extend the `Props` type:

```tsx
type Props = {
  note: Note;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onMoved: () => void;
};
```

3. Update the destructure and add state:

```tsx
export default function NoteEditSheet({ note, visible, onClose, onDeleted, onMoved }: Props) {
  const [showMove, setShowMove] = useState(false);
```

4. Add a "Move to trip…" button directly above the existing Delete button (the `<Pressable onPress={handleDelete} ...>`):

```tsx
        <Pressable
          onPress={() => setShowMove(true)}
          accessibilityRole="button"
          accessibilityLabel="Move note to another trip"
          style={styles.moveButton}
        >
          <Text style={styles.moveLabel}>Move to trip…</Text>
        </Pressable>
```

5. Render the move sheet just before the closing `</KeyboardAvoidingView>`:

```tsx
        <MoveToTripSheet
          visible={showMove}
          userId={note.user_id}
          currentTripId={note.trip_id}
          noteId={note.id}
          onClose={() => setShowMove(false)}
          onMoved={() => {
            setShowMove(false);
            onMoved();
          }}
        />
```

6. Add styles to the `StyleSheet.create` block:

```tsx
  moveButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  moveLabel: { fontSize: 15, color: Colors.accent },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/NoteEditSheet.test.tsx`
Expected: PASS — the new "move to trip" test passes and all existing NoteEditSheet tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/components/NoteEditSheet.tsx src/components/__tests__/NoteEditSheet.test.tsx
git commit -m "feat: Move to trip button in NoteEditSheet"
```

---

### Task 5: Wire `onMoved` in the two `NoteEditSheet` hosts

**Files:**
- Modify: `src/screens/trip/TripFeedScreen.tsx` (the `<NoteEditSheet ...>` around line 65)
- Modify: `src/screens/trip/TripMapScreen.tsx` (the `<NoteEditSheet ...>` around line 107)

Both screens already use `useNotes(tripId)`, which returns a `refresh` function. After a move, close the sheet and refresh so the moved note drops out of the current feed.

- [ ] **Step 1: Confirm `refresh` is destructured in both screens**

In each file, find the `useNotes(...)` call. Ensure `refresh` is destructured, e.g.:

```tsx
const { items, loading, error, refresh } = useNotes(tripId);
```
If `refresh` is not currently destructured, add it.

- [ ] **Step 2: Add the `onMoved` prop to both `NoteEditSheet` usages**

`TripFeedScreen.tsx` — update the existing `<NoteEditSheet>`:

```tsx
        <NoteEditSheet
          note={editingNote}
          visible={editingNote !== null}
          onClose={() => setEditingNote(null)}
          onDeleted={() => setEditingNote(null)}
          onMoved={() => {
            setEditingNote(null);
            refresh();
          }}
        />
```

`TripMapScreen.tsx` — update the existing `<NoteEditSheet>` the same way:

```tsx
        <NoteEditSheet
          note={editingNote}
          visible={editingNote !== null}
          onClose={() => setEditingNote(null)}
          onDeleted={() => setEditingNote(null)}
          onMoved={() => {
            setEditingNote(null);
            refresh();
          }}
        />
```

> Match each file's actual `note`/`visible` prop expressions — only `onMoved` is being added. Do not change the existing `onClose`/`onDeleted` behavior.

- [ ] **Step 3: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: clean (no errors). A missing `onMoved` prop anywhere would surface here, since it is now required.

Run: `npx jest`
Expected: all tests pass (previous green count + the new `moveNote` and `MoveToTripSheet` and `NoteEditSheet` move tests).

- [ ] **Step 4: Commit**

```bash
git add src/screens/trip/TripFeedScreen.tsx src/screens/trip/TripMapScreen.tsx
git commit -m "feat: refresh feed after moving a note between trips"
```

---

### Task 6: Final verification + migration integrity check

**Files:** none (verification only).

- [ ] **Step 1: Full type-check + suite**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean; full Jest suite green.

- [ ] **Step 2: Verify `note_count` integrity against Supabase via MCP**

Pick a real user with at least two trips (or create two throwaway trips + one note via `execute_sql`). Using the Supabase MCP `execute_sql` tool, record both trips' `note_count`, move the note, and re-check:

```sql
-- before: note on trip A
select id, note_count from public.trips where id in ('<TRIP_A>', '<TRIP_B>');
update public.notes set trip_id = '<TRIP_B>' where id = '<NOTE_ID>';
-- after: A decremented by 1, B incremented by 1
select id, note_count from public.trips where id in ('<TRIP_A>', '<TRIP_B>');
```
Expected: trip A's `note_count` drops by 1 and trip B's rises by 1. Clean up any throwaway rows afterward.

- [ ] **Step 3: On-device QA checklist (manual, `npm run ios`)**

Verify on device:
- Open a note's edit sheet → "Move to trip…" appears → lists other trips, excludes the current one.
- Move a note → confirm dialog → note disappears from the current feed, both trips' counts update on Home.
- The moved note appears in the destination trip's feed with its photos/location/timestamp intact.
- Cancelling the confirm leaves the note in place.

- [ ] **Step 4: Final whole-branch review + update progress doc**

Update `docs/progress.md`: mark "Move notes between trips" done (date, branch, test count, migration `012` applied). Then proceed to the `superpowers:finishing-a-development-branch` skill to merge.

---

## Notes for the executor

- **No `database.types.ts` regeneration needed** — the migration adds a trigger and a policy, no columns.
- **`moveNote` is intentionally separate from `updateNote`** — do not consolidate; `updateNote` resets `tagging_status` and we must not re-tag on a move.
- **Source-feed removal is via `refresh()`, not realtime** — the source channel's `trip_id` filter won't deliver an UPDATE that moves the row out of the filter.
- **RLS is the security boundary** — the client passes any `trip_id`, but the tightened `notes_update_own` WITH CHECK rejects a move onto a non-owned trip (Postgres error → surfaced via the `Alert` in `MoveToTripSheet`).
