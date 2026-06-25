# Venue-Name Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `mergeTags` from discarding the AI-extracted venue name in favour of the geocoder's street/area label, while keeping manual user-typed names authoritative.

**Architecture:** Give `mergeTags` the note's `location_source` so it can apply the precedence manual > AI venue > geocoder. Only `place_name` resolution changes; `category` and `city` stay as-is. No migration, no edge-function change.

**Tech Stack:** TypeScript, Jest (jest-expo), Supabase client.

**Spec:** `docs/superpowers/specs/2026-06-24-venue-name-precedence-design.md`

---

## File Structure

- `src/services/taggingHelpers.ts` — `ExistingTags` gains `location_source`; `mergeTags` `place_name` precedence (modify)
- `src/services/__tests__/taggingHelpers.test.ts` — update one test, add three (modify)
- `src/services/taggingService.ts` — pass `note.location_source` into `mergeTags` (modify)

---

## Task 1: Precedence in `mergeTags` (TDD)

**Files:**
- Modify: `src/services/taggingHelpers.ts`
- Test: `src/services/__tests__/taggingHelpers.test.ts`

- [ ] **Step 1: Update + add the failing tests**

In `src/services/__tests__/taggingHelpers.test.ts`, inside the existing
`describe('mergeTags', …)` block (the `suggestion` const is already defined at
the top of that block as `{ category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' }`):

1. **Replace** the existing test `'preserves a manually-set place_name over the suggestion'` (currently passing existing `{ category: null, city: null, place_name: 'Paris' }`) with this version that declares the source:

```typescript
  it('preserves a manually-set place_name over the suggestion', () => {
    expect(
      mergeTags(
        { category: null, city: null, place_name: 'Paris', location_source: 'manual' },
        { category: 'activity', place_name: 'Googleplex', city: 'Mountain View' },
      ),
    ).toEqual({ category: 'activity', place_name: 'Paris', city: 'Mountain View' });
  });
```

2. **Add** these three new tests in the same block:

```typescript
  it('overrides a geocoder (gps) place_name with the AI venue', () => {
    expect(
      mergeTags(
        { category: 'food', city: 'Tokyo', place_name: 'Shibuya Crossing', location_source: 'gps' },
        suggestion,
      ),
    ).toMatchObject({ place_name: 'Ichiran Ramen' });
  });

  it('keeps the geocoder place_name when the AI suggestion has none', () => {
    expect(
      mergeTags(
        { category: 'food', city: 'Tokyo', place_name: '1-2-3 Dogenzaka', location_source: 'gps' },
        { ...suggestion, place_name: null },
      ),
    ).toMatchObject({ place_name: '1-2-3 Dogenzaka' });
  });

  it('keeps a manual place_name even when the AI suggests a venue', () => {
    expect(
      mergeTags(
        { category: null, city: null, place_name: 'Grandma’s house', location_source: 'manual' },
        suggestion,
      ),
    ).toMatchObject({ place_name: 'Grandma’s house' });
  });
```

- [ ] **Step 2: Run the tests, verify the new/updated ones FAIL**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts`
Expected: FAIL — the "overrides a geocoder (gps) place_name" test fails (current
code returns `'Shibuya Crossing'` because `existing.place_name ?? suggestion.place_name`
keeps the existing value), and the updated "preserves a manually-set" test fails
to typecheck/compile until `location_source` is added to `ExistingTags`.

- [ ] **Step 3: Implement the precedence**

In `src/services/taggingHelpers.ts`:

a. Add the import at the top (after the existing `noteHelpers` import):

```typescript
import type { LocationSource } from './locationHelpers';
```

b. Add `location_source` to the `ExistingTags` type:

```typescript
export type ExistingTags = {
  category: Category | null;
  city: string | null;
  place_name?: string | null;
  location_source?: LocationSource | null;
};
```

c. Change the `place_name` line in `mergeTags` from
`place_name: existing.place_name ?? suggestion.place_name,` to:

```typescript
    // Manual user-typed names are authoritative; otherwise the AI-extracted
    // venue wins over the geocoder's street/area label, which only fills in
    // when the AI found no venue.
    place_name:
      existing.location_source === 'manual'
        ? existing.place_name ?? null
        : suggestion.place_name ?? existing.place_name ?? null,
```

Leave `category` and `city` lines unchanged.

- [ ] **Step 4: Run the tests, verify PASS**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts`
Expected: PASS — all mergeTags tests green (the three unchanged tests at the top
still pass: existing with no `place_name` still takes the suggestion's venue).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/taggingHelpers.ts src/services/__tests__/taggingHelpers.test.ts
git commit -m "fix(tagging): prefer AI venue over geocoder place_name"
```

---

## Task 2: Pass `location_source` from the tagging service

**Files:**
- Modify: `src/services/taggingService.ts`

No new test — the existing `taggingService` tests plus the typechecker cover
this one-line wiring change. (If a `taggingService` test constructs the
`mergeTags` existing-tags object and now needs `location_source`, add it; report
what you touched.)

- [ ] **Step 1: Pass the source into mergeTags**

In `src/services/taggingService.ts`, the `tagNote` function calls:

```typescript
  const merged = mergeTags(
    { category: note.category, city: note.city, place_name: note.place_name },
    normalizeSuggestion(data),
  );
```

Change the existing-tags object to include the source:

```typescript
  const merged = mergeTags(
    {
      category: note.category,
      city: note.city,
      place_name: note.place_name,
      location_source: note.location_source,
    },
    normalizeSuggestion(data),
  );
```

- [ ] **Step 2: Typecheck + run service tests**

Run: `npx tsc --noEmit && npx jest src/services`
Expected: PASS (`note.location_source` exists on the `Note` type via migration 011).

- [ ] **Step 3: Commit**

```bash
git add src/services/taggingService.ts
git commit -m "fix(tagging): pass location_source into mergeTags"
```

---

## Task 3: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npx jest`
Expected: PASS (all suites green).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Update the backlog memory**

Mark backlog item 3.5 (venue-name resolution fix) done in `backlog_priority.md`
and note the next item is the public layer (#3 Explore + #4 privacy).

---

## Self-Review Notes

- **Spec coverage:** `ExistingTags.location_source` + precedence (Task 1);
  `category`/`city` unchanged (Task 1, left untouched); service passes
  `location_source` (Task 2); test updates + three additions (Task 1); backlog
  update (Task 3). No migration / edge-function change, matching the spec's
  out-of-scope section.
- **Type consistency:** `LocationSource` imported from `./locationHelpers`
  (where it is defined as `'gps' | 'exif' | 'manual' | 'inferred'`).
  `mergeTags` signature unchanged; only `ExistingTags` gains an optional field,
  so existing callers/tests that omit `location_source` still compile and behave
  as the non-manual branch.
- **Out of scope (confirmed not in any task):** `reverseGeocodePlace` changes,
  `public_places`, any migration.
