# Note Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional whole-star 1–5 rating to notes, surfaced only for rateable categories (food/stay/activity/shopping), input in both the capture and edit sheets and shown read-only on the feed card.

**Architecture:** A new `rating smallint` column on `notes` (nullable, 1–5, DB-constrained to rateable categories only). A single `StarRating` component drives input in `NoteCaptureSheet`/`NoteEditSheet` and read-only display in `NoteCard`. A shared `isRateable()` helper is the single source of truth for which categories may carry a rating; switching to a non-rateable category clears the rating in component state before save.

**Tech Stack:** React Native (Expo), TypeScript, Jest + @testing-library/react-native, Supabase (Postgres) via MCP migrations + generated types.

**Spec:** `docs/superpowers/specs/2026-06-22-note-ratings-design.md`

---

## File Structure

- `supabase/migrations/016_notes_rating.sql` — new column + constraint (create)
- `src/lib/database.types.ts` — regenerated to include `rating` (modify)
- `src/services/noteHelpers.ts` — `rating` on `Note`/`NoteInsert`, `RATEABLE_CATEGORIES`, `isRateable()` (modify)
- `src/services/__tests__/noteHelpers.test.ts` — `isRateable` tests (modify)
- `src/components/StarRating.tsx` — shared star control (create)
- `src/components/__tests__/StarRating.test.tsx` — component tests (create)
- `src/services/offlineQueue.ts` — `rating` on `PendingNote` (modify)
- `src/services/noteService.ts` — `rating` through `CreateNoteInput`, `drainQueue`, `UpdateNoteInput` (modify)
- `src/components/NoteCaptureSheet.tsx` — rating state + conditional `StarRating` (modify)
- `src/components/NoteEditSheet.tsx` — rating state + conditional `StarRating` (modify)
- `src/components/__tests__/NoteEditSheet.test.tsx` — clear-on-switch + payload tests (modify)
- `src/components/NoteCard.tsx` — read-only rating in header row (modify)

---

## Task 1: Migration + regenerated types

**Files:**
- Create: `supabase/migrations/016_notes_rating.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/016_notes_rating.sql`:

```sql
-- Optional 1–5 star rating on a note. Whole numbers only; null = unrated.
alter table public.notes
  add column rating smallint
    check (rating is null or rating between 1 and 5);

-- Safety net mirroring the app rule: a rating may only exist on a rateable
-- category. Enforces "clear rating on category switch" at the DB level so bad
-- data cannot slip in through any path, including the future public aggregate.
alter table public.notes
  add constraint notes_rating_requires_rateable_category
    check (rating is null or category in ('food','stay','activity','shopping'));
```

- [ ] **Step 2: Apply the migration to Supabase**

Apply via the Supabase MCP `apply_migration` tool with name `016_notes_rating` and the SQL body above. Expected: success, no error.

- [ ] **Step 3: Regenerate generated DB types**

Call the Supabase MCP `generate_typescript_types` tool. In the returned `types` string, copy the `notes` table block verbatim into `src/lib/database.types.ts`, overwriting the existing file. Verify the `notes` `Row` and `Insert` now include `rating: number | null`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors; `rating` now exists on the generated `notes` types).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/016_notes_rating.sql src/lib/database.types.ts
git commit -m "feat(notes): add rating column + regenerate types"
```

---

## Task 2: `isRateable` helper + Note types

**Files:**
- Modify: `src/services/noteHelpers.ts`
- Test: `src/services/__tests__/noteHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/services/__tests__/noteHelpers.test.ts`:

```typescript
import { isRateable, RATEABLE_CATEGORIES } from '../noteHelpers';

describe('isRateable', () => {
  it('is true for food, stay, activity, shopping', () => {
    expect(isRateable('food')).toBe(true);
    expect(isRateable('stay')).toBe(true);
    expect(isRateable('activity')).toBe(true);
    expect(isRateable('shopping')).toBe(true);
  });

  it('is false for to-visit, general, and null', () => {
    expect(isRateable('to-visit')).toBe(false);
    expect(isRateable('general')).toBe(false);
    expect(isRateable(null)).toBe(false);
  });

  it('RATEABLE_CATEGORIES contains exactly the four rateable categories', () => {
    expect(RATEABLE_CATEGORIES).toEqual(['food', 'stay', 'activity', 'shopping']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/noteHelpers.test.ts -t isRateable`
Expected: FAIL — `isRateable`/`RATEABLE_CATEGORIES` is not exported.

- [ ] **Step 3: Add the helper and rating to the types**

In `src/services/noteHelpers.ts`, add `rating` to the derived types. Change the `Note` type to:

```typescript
export type Note = Omit<NoteRow, 'category' | 'tagging_status' | 'location_source'> & {
  category: Category | null;
  tagging_status: TaggingStatus;
  location_source: LocationSource | null;
};
```

(No change needed if `rating` is already on `NoteRow` via Task 1 — it flows through `Omit`. Same for `NoteInsert` via `NoteInsertRow`.)

Then add, just after the `CATEGORIES` constant:

```typescript
// Categories that may carry a 1–5 star rating. Single source of truth — used by
// the capture sheet, edit sheet, and feed card. Excludes 'to-visit' and 'general'.
export const RATEABLE_CATEGORIES: Category[] = ['food', 'stay', 'activity', 'shopping'];

export function isRateable(category: Category | null): boolean {
  return category !== null && RATEABLE_CATEGORIES.includes(category);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/noteHelpers.test.ts -t isRateable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/noteHelpers.ts src/services/__tests__/noteHelpers.test.ts
git commit -m "feat(notes): add isRateable helper + RATEABLE_CATEGORIES"
```

---

## Task 3: `StarRating` component

**Files:**
- Create: `src/components/StarRating.tsx`
- Test: `src/components/__tests__/StarRating.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/StarRating.test.tsx`:

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import StarRating from '../StarRating';

describe('StarRating', () => {
  it('renders 5 star buttons', () => {
    const { getAllByRole } = render(<StarRating value={3} onChange={() => {}} />);
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('calls onChange with the tapped star value', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<StarRating value={null} onChange={onChange} />);
    fireEvent.press(getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clears to null when the current value is tapped again', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<StarRating value={4} onChange={onChange} />);
    fireEvent.press(getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not fire onChange when readOnly', () => {
    const onChange = jest.fn();
    const { queryAllByRole, getAllByText } = render(
      <StarRating value={3} readOnly />,
    );
    // readOnly renders plain Text stars, not buttons
    expect(queryAllByRole('button')).toHaveLength(0);
    expect(getAllByText('★').length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/StarRating.test.tsx`
Expected: FAIL — `StarRating` module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/StarRating.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../theme';

type Props = {
  value: number | null;
  onChange?: (value: number | null) => void;
  readOnly?: boolean;
  size?: 'small' | 'medium';
};

const STARS = [1, 2, 3, 4, 5];

export default function StarRating({ value, onChange, readOnly = false, size = 'medium' }: Props) {
  const fontSize = size === 'small' ? 13 : 26;
  const filled = value ?? 0;

  if (readOnly) {
    return (
      <View style={styles.row}>
        {STARS.map((n) => (
          <Text key={n} style={[styles.star, { fontSize }, n <= filled ? styles.on : styles.off]}>
            ★
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {STARS.map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${n} stars`}
          hitSlop={6}
          // Tapping the current rating clears it (undo without a separate button).
          onPress={() => onChange?.(value === n ? null : n)}
        >
          <Text style={[styles.star, { fontSize }, n <= filled ? styles.on : styles.off]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  star: { },
  on: { color: Colors.accent },
  off: { color: Colors.border },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/StarRating.test.tsx`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/StarRating.tsx src/components/__tests__/StarRating.test.tsx
git commit -m "feat(notes): add StarRating component"
```

---

## Task 4: Thread `rating` through the note service

**Files:**
- Modify: `src/services/offlineQueue.ts`
- Modify: `src/services/noteService.ts`

No new test here — coverage comes from the existing `NoteEditSheet` test (Task 6) asserting the update payload, and the typechecker. This is a plumbing task.

- [ ] **Step 1: Add `rating` to `PendingNote`**

In `src/services/offlineQueue.ts`, add to the `PendingNote` type (next to `occurred_at`):

```typescript
  rating: number | null;
```

- [ ] **Step 2: Add `rating` to `CreateNoteInput` and the pending note**

In `src/services/noteService.ts`, add to `CreateNoteInput` (after `occurred_at`):

```typescript
  rating?: number | null;
```

In `createNote`, add to the `pending` object (after `occurred_at`):

```typescript
    rating: input.rating ?? null,
```

- [ ] **Step 3: Write `rating` in the drain insert**

In `drainQueue`, add to the `row` object (after `occurred_at`):

```typescript
      rating: item.rating ?? null,
```

- [ ] **Step 4: Add `rating` to `UpdateNoteInput` and the update payload**

In `src/services/noteService.ts`, add to `UpdateNoteInput` (after `location_source`):

```typescript
  rating: number | null;
```

In `updateNote`, add to the `.update({ ... })` object (after `location_source`):

```typescript
      rating: patch.rating,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/offlineQueue.ts src/services/noteService.ts
git commit -m "feat(notes): thread rating through create/update note service"
```

---

## Task 5: Wire rating into `NoteCaptureSheet`

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`

- [ ] **Step 1: Add rating state and the category-clear handler**

In `src/components/NoteCaptureSheet.tsx`, add the import near the other `noteHelpers` import:

```typescript
import { validateContent, type Category, isRateable } from '../services/noteHelpers';
import StarRating from './StarRating';
```

Add state next to the existing `category` state (`const [category, setCategory] = useState<Category | null>(null);`):

```typescript
  const [rating, setRating] = useState<number | null>(null);
```

Add a handler that clears the rating when the new category is not rateable:

```typescript
  const handleCategoryChange = (next: Category | null) => {
    setCategory(next);
    if (!isRateable(next)) setRating(null);
  };
```

- [ ] **Step 2: Reset rating where category resets**

Find the reset that runs `setCategory(null);` (around line 194) and add directly after it:

```typescript
    setRating(null);
```

- [ ] **Step 3: Render the conditional StarRating and use the new handler**

Replace the existing picker line `<CategoryPicker value={category} onChange={setCategory} />` with:

```tsx
        <CategoryPicker value={category} onChange={handleCategoryChange} />
        {isRateable(category) && (
          <View style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
            <StarRating value={rating} onChange={setRating} />
          </View>
        )}
```

(`View` and `Spacing` are already imported in this file.)

- [ ] **Step 4: Pass rating into createNote**

In the `createNote({ ... })` call, add after `location_source: locPatch.location_source,`:

```typescript
        rating,
```

- [ ] **Step 5: Typecheck + run the capture sheet's existing tests**

Run: `npx tsc --noEmit && npx jest NoteCaptureSheet`
Expected: PASS (typecheck clean; if no NoteCaptureSheet test file exists, jest prints "No tests found" — that is acceptable, the typecheck is the gate).

- [ ] **Step 6: Commit**

```bash
git add src/components/NoteCaptureSheet.tsx
git commit -m "feat(notes): rating input in capture sheet"
```

---

## Task 6: Wire rating into `NoteEditSheet`

**Files:**
- Modify: `src/components/NoteEditSheet.tsx`
- Test: `src/components/__tests__/NoteEditSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/components/__tests__/NoteEditSheet.test.tsx`. First inspect the existing test file for how it mocks `updateNote` and renders the sheet, and reuse that exact setup. The two new behaviors to assert:

```typescript
// 1. Saving a rateable note includes rating in the updateNote payload.
it('includes rating in the update payload', async () => {
  // render NoteEditSheet with a note that has category 'food', rating 4
  // press a star to set rating to 5, press Save
  // expect updateNote mock called with an object containing rating: 5
});

// 2. Switching to a non-rateable category clears the rating before save.
it('clears rating when category switches to a non-rateable one', async () => {
  // render NoteEditSheet with note category 'food', rating 4
  // change category to 'general' via the CategoryPicker
  // press Save
  // expect updateNote mock called with rating: null
});
```

Fill in the bodies using the existing file's render helper and the `getByLabelText('Rate N stars')` / category-picker query patterns already present in the test file. Use the `updateNote` mock the file already sets up.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/components/__tests__/NoteEditSheet.test.tsx -t rating`
Expected: FAIL — rating not wired into the sheet yet.

- [ ] **Step 3: Wire rating into the sheet**

In `src/components/NoteEditSheet.tsx`:

Update the import line:

```typescript
import { validateContent, type Category, type Note, isRateable } from '../services/noteHelpers';
import StarRating from './StarRating';
```

Add state next to the existing `category` state (line ~40):

```typescript
  const [rating, setRating] = useState<number | null>(note.rating);
```

In `handleShow` (the reset path, after `setCategory(note.category);`):

```typescript
    setRating(note.rating);
```

Add the category-change handler:

```typescript
  const handleCategoryChange = (next: Category | null) => {
    setCategory(next);
    if (!isRateable(next)) setRating(null);
  };
```

Replace `<CategoryPicker value={category} onChange={setCategory} />` (line ~210) with:

```tsx
        <CategoryPicker value={category} onChange={handleCategoryChange} />
        {isRateable(category) && (
          <View style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}>
            <StarRating value={rating} onChange={setRating} />
          </View>
        )}
```

In the `updateNote(note.id, { ... })` call, add after `location_source: locPatch.location_source,`:

```typescript
        rating,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/NoteEditSheet.test.tsx`
Expected: PASS (existing tests still green + the two new rating tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/NoteEditSheet.tsx src/components/__tests__/NoteEditSheet.test.tsx
git commit -m "feat(notes): rating input in edit sheet with clear-on-category-switch"
```

---

## Task 7: Read-only rating on the feed card

**Files:**
- Modify: `src/components/NoteCard.tsx`

- [ ] **Step 1: Import StarRating**

In `src/components/NoteCard.tsx`, add near the `CategoryBadge` import:

```typescript
import StarRating from './StarRating';
```

- [ ] **Step 2: Render the read-only stars in the header row**

In `ServerNoteCard`, inside the existing `headerRow` `<View>` (the block around lines 39–47 that renders the `CategoryBadge`), add, immediately after the `CategoryBadge` conditional:

```tsx
        {note.rating != null && <StarRating value={note.rating} readOnly size="small" />}
```

- [ ] **Step 3: Typecheck + render test**

Run: `npx tsc --noEmit && npx jest NoteCard`
Expected: PASS (typecheck clean; jest "No tests found" is acceptable if no NoteCard test exists).

- [ ] **Step 4: Manual smoke (device)**

Run the app (`npm run ios`). On a trip feed: create/edit a food note, set 4 stars, save. Expect 4 filled stars next to the category badge on the card. Switch the note's category to General in the edit sheet — the star row disappears and on save the card shows no stars.

- [ ] **Step 5: Commit**

```bash
git add src/components/NoteCard.tsx
git commit -m "feat(notes): show read-only rating on feed card"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npx jest`
Expected: PASS (all suites green).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint` (skip if no lint script).
Expected: PASS.

- [ ] **Step 4: Update the backlog memory**

Mark backlog item #8 (Ratings) done in `backlog_priority.md` and note that the next item is the venue-name resolution fix (3.5), then the public layer.

---

## Self-Review Notes

- **Spec coverage:** migration + constraint (Task 1), types + `isRateable` (Task 2), `StarRating` component with interactive/read-only/clear behaviors (Task 3), service plumbing (Task 4), capture-sheet input (Task 5), edit-sheet input + clear-on-switch (Task 6), read-only feed display (Task 7), verification + backlog update (Task 8). All spec sections covered.
- **Type consistency:** `rating: number | null` used consistently across `PendingNote`, `CreateNoteInput`, `UpdateNoteInput`, `StarRating` props, and the `Note` type (via generated `NoteRow`). Handler named `handleCategoryChange` in both sheets.
- **Out of scope (confirmed not in any task):** `public_places`, `avg_rating`/`rating_count`, venue-name fix.
