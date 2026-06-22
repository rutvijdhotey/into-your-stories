# Itinerary Creation from Blog (0c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a structured day-by-day itinerary alongside the blog narrative and render it as a toggleable view on `BlogPostScreen`, only when a trip has enough multi-day located material.

**Architecture:** A new nullable `itinerary jsonb` column on `blog_posts`. The `generate-blog` edge function produces the itinerary in the same Claude call as the narrative, gated by a deterministic "≥3 located-and-named days" check; a malformed itinerary degrades to `null` and never fails the narrative. The client parses/validates the jsonb with a TDD-tested `parseItinerary` helper and renders it via a `Story / Itinerary` segmented toggle.

**Tech Stack:** Supabase (Postgres jsonb, edge function on Deno), React Native (Expo), TypeScript, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-06-21-itinerary-from-blog-design.md`

**Branch:** `feature/itinerary-from-blog` (already created from `main`; the spec is already committed here).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/014_blog_posts_itinerary.sql` | Adds the nullable `itinerary jsonb` column | Create |
| `src/lib/database.types.ts` | Add `itinerary` to `blog_posts` Row/Insert/Update | Modify |
| `src/services/blogHelpers.ts` | `Itinerary*` types + `parseItinerary` validator; extend `BlogPost` view | Modify |
| `src/services/__tests__/blogHelpers.test.ts` | `parseItinerary` unit tests | Modify |
| `src/components/ItineraryView.tsx` | Renders day cards with part-of-day–grouped stops | Create |
| `src/components/__tests__/ItineraryView.render.test.tsx` | Render test for the itinerary view | Create |
| `src/screens/blog/BlogPostScreen.tsx` | Story/Itinerary segmented toggle + view state | Modify |
| `supabase/functions/generate-blog/index.ts` | Load `occurred_at`, eligibility gate, prompt + output handling | Modify |

---

## Task 1: Migration + generated types

**Files:**
- Create: `supabase/migrations/014_blog_posts_itinerary.sql`
- Modify: `src/lib/database.types.ts:17-59` (the `blog_posts` Row/Insert/Update blocks)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/014_blog_posts_itinerary.sql`:

```sql
-- Itinerary creation from blog (0c): structured day-by-day itinerary stored
-- alongside the narrative on a blog post. Nullable: null means "no itinerary"
-- (trip too sparse, or the itinerary failed to parse). The narrative is never
-- affected by the itinerary's presence.
alter table public.blog_posts add column itinerary jsonb;
```

- [ ] **Step 2: Apply the migration to Supabase**

Use the Supabase MCP `apply_migration` tool (project `dcejrbyujfcxartywpis`) with name `blog_posts_itinerary` and the SQL above. Verify success (no error returned).

- [ ] **Step 3: Add `itinerary` to the generated types**

In `src/lib/database.types.ts`, in the `blog_posts` block, add the field to all three shapes. In `Row` (after `id: string` on line 23):

```ts
          itinerary: Json | null
```

In `Insert` and in `Update`:

```ts
          itinerary?: Json | null
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/014_blog_posts_itinerary.sql src/lib/database.types.ts
git commit -m "feat: add itinerary jsonb column to blog_posts (0c)"
```

---

## Task 2: Itinerary types + `parseItinerary` helper (TDD)

**Files:**
- Modify: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the top imports of `src/services/__tests__/blogHelpers.test.ts` (extend the existing import from `../blogHelpers`):

```ts
import { parseItinerary } from '../blogHelpers';
```

Append these describe blocks at the end of the file:

```ts
describe('parseItinerary', () => {
  const validStop = {
    time_of_day: 'morning',
    place_name: 'Café Aurora',
    category: 'food',
    description: 'Pastries and strong coffee.',
    lat: 41.1,
    lng: -8.6,
  };
  const validDay = { day: 1, date: '2026-05-12', title: 'Old town', stops: [validStop] };

  it('returns null for non-arrays and empty arrays', () => {
    expect(parseItinerary(null)).toBeNull();
    expect(parseItinerary(undefined)).toBeNull();
    expect(parseItinerary('nope')).toBeNull();
    expect(parseItinerary([])).toBeNull();
  });

  it('parses a valid itinerary', () => {
    const result = parseItinerary([validDay]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].day).toBe(1);
    expect(result![0].title).toBe('Old town');
    expect(result![0].stops[0].place_name).toBe('Café Aurora');
    expect(result![0].stops[0].time_of_day).toBe('morning');
    expect(result![0].stops[0].category).toBe('food');
    expect(result![0].stops[0].lat).toBe(41.1);
  });

  it('drops stops without a place_name and days left with no stops', () => {
    const result = parseItinerary([
      { day: 1, date: null, title: 'Day one', stops: [{ ...validStop, place_name: '' }] },
      validDay,
    ]);
    expect(result).toHaveLength(1);
    expect(result![0].day).toBe(1);
    expect(result![0].title).toBe('Old town');
  });

  it('coerces unknown time_of_day and category to null', () => {
    const result = parseItinerary([
      { ...validDay, stops: [{ ...validStop, time_of_day: 'midnight', category: 'wat' }] },
    ]);
    expect(result![0].stops[0].time_of_day).toBeNull();
    expect(result![0].stops[0].category).toBeNull();
  });

  it('coerces non-numeric coords and missing description to safe values', () => {
    const result = parseItinerary([
      { ...validDay, stops: [{ place_name: 'A Place', lat: 'x', lng: null }] },
    ]);
    expect(result![0].stops[0].lat).toBeNull();
    expect(result![0].stops[0].lng).toBeNull();
    expect(result![0].stops[0].description).toBe('');
    expect(result![0].stops[0].category).toBeNull();
  });

  it('returns null when no day has any valid stop', () => {
    expect(parseItinerary([{ day: 1, date: null, title: 'x', stops: [] }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t parseItinerary`
Expected: FAIL with "parseItinerary is not a function" / import error.

- [ ] **Step 3: Implement the types and helper**

In `src/services/blogHelpers.ts`, add after the `Place` type (around line 18):

```ts
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export type ItineraryStop = {
  time_of_day: TimeOfDay | null;
  place_name: string;
  category: Category | null;
  description: string;
  lat: number | null;
  lng: number | null;
};

export type ItineraryDay = {
  day: number;
  date: string | null;
  title: string;
  stops: ItineraryStop[];
};

export type Itinerary = ItineraryDay[];

const TIME_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
const CATEGORY_VALUES: Category[] = ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general'];

function coerceNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseStop(value: unknown): ItineraryStop | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const place_name = typeof obj.place_name === 'string' ? obj.place_name.trim() : '';
  if (place_name.length === 0) return null;
  const time_of_day =
    typeof obj.time_of_day === 'string' && (TIME_OF_DAY as string[]).includes(obj.time_of_day)
      ? (obj.time_of_day as TimeOfDay)
      : null;
  const category =
    typeof obj.category === 'string' && (CATEGORY_VALUES as string[]).includes(obj.category)
      ? (obj.category as Category)
      : null;
  return {
    time_of_day,
    place_name,
    category,
    description: typeof obj.description === 'string' ? obj.description : '',
    lat: coerceNumber(obj.lat),
    lng: coerceNumber(obj.lng),
  };
}

/**
 * Narrows the stored `itinerary` jsonb into a typed Itinerary. Drops malformed
 * stops (no place_name) and days left with no valid stops. Returns null when
 * the value is not an array, is empty, or has no valid day — callers treat null
 * as "no itinerary". The edge function does its own inline validation; this is
 * the client's defensive parse of whatever ended up in the column.
 */
export function parseItinerary(value: unknown): Itinerary | null {
  if (!Array.isArray(value)) return null;
  const days: ItineraryDay[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.day !== 'number' || !Array.isArray(obj.stops)) continue;
    const stops = obj.stops.map(parseStop).filter((s): s is ItineraryStop => s !== null);
    if (stops.length === 0) continue;
    days.push({
      day: obj.day,
      date: typeof obj.date === 'string' ? obj.date : null,
      title: typeof obj.title === 'string' ? obj.title : '',
      stops,
    });
  }
  return days.length > 0 ? days : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t parseItinerary`
Expected: PASS (all parseItinerary tests green).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat: parseItinerary helper + itinerary types (0c)"
```

---

## Task 3: `ItineraryView` component (TDD render test)

**Files:**
- Create: `src/components/ItineraryView.tsx`
- Test: `src/components/__tests__/ItineraryView.render.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `src/components/__tests__/ItineraryView.render.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import ItineraryView from '../ItineraryView';
import type { Itinerary } from '../../services/blogHelpers';

const itinerary: Itinerary = [
  {
    day: 1,
    date: '2026-05-12',
    title: 'Old town & the river',
    stops: [
      {
        time_of_day: 'morning',
        place_name: 'Café Aurora',
        category: 'food',
        description: 'Pastries and strong coffee.',
        lat: 41.1,
        lng: -8.6,
      },
      {
        time_of_day: 'evening',
        place_name: 'Riverside walk',
        category: 'activity',
        description: 'Sunset along the water.',
        lat: null,
        lng: null,
      },
    ],
  },
];

describe('ItineraryView', () => {
  it('renders day header, title, and stops', () => {
    const { getByText } = render(<ItineraryView itinerary={itinerary} />);
    expect(getByText('Day 1')).toBeTruthy();
    expect(getByText('Old town & the river')).toBeTruthy();
    expect(getByText('Café Aurora')).toBeTruthy();
    expect(getByText('Riverside walk')).toBeTruthy();
    expect(getByText('Pastries and strong coffee.')).toBeTruthy();
  });

  it('shows part-of-day labels for stops that have them', () => {
    const { getByText } = render(<ItineraryView itinerary={itinerary} />);
    expect(getByText('Morning')).toBeTruthy();
    expect(getByText('Evening')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/__tests__/ItineraryView.render.test.tsx`
Expected: FAIL — cannot find module `../ItineraryView`.

- [ ] **Step 3: Implement the component**

Create `src/components/ItineraryView.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';
import CategoryBadge from './CategoryBadge';
import { formatBlogDate, type Itinerary, type TimeOfDay } from '../services/blogHelpers';

const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export default function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  return (
    <View style={styles.container}>
      {itinerary.map((day) => (
        <View key={day.day} style={styles.card}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayNumber}>Day {day.day}</Text>
            {day.date ? <Text style={styles.dayDate}>{formatBlogDate(day.date)}</Text> : null}
          </View>
          {day.title ? <Text style={styles.dayTitle}>{day.title}</Text> : null}
          {day.stops.map((stop, i) => (
            <View key={i} style={styles.stop}>
              {stop.time_of_day ? (
                <Text style={styles.timeLabel}>{TIME_LABELS[stop.time_of_day]}</Text>
              ) : null}
              <View style={styles.stopHeader}>
                <Text style={styles.placeName}>{stop.place_name}</Text>
                <CategoryBadge category={stop.category} />
              </View>
              {stop.description ? <Text style={styles.description}>{stop.description}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  dayNumber: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: Colors.accent, textTransform: 'uppercase' },
  dayDate: { fontSize: 12, color: Colors.textSecondary },
  dayTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  stop: {
    gap: 2,
    paddingTop: Spacing.sm,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timeLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  placeName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  description: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/__tests__/ItineraryView.render.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItineraryView.tsx src/components/__tests__/ItineraryView.render.test.tsx
git commit -m "feat: ItineraryView component (0c)"
```

---

## Task 4: Story / Itinerary toggle on `BlogPostScreen`

**Files:**
- Modify: `src/screens/blog/BlogPostScreen.tsx`

- [ ] **Step 1: Add imports and parse the itinerary**

In `src/screens/blog/BlogPostScreen.tsx`, extend the helpers import (line 21) to add `parseItinerary`:

```ts
import { markdownToHtml, statusLabel, parseItinerary, type BlogPost } from '../../services/blogHelpers';
```

Add the `ItineraryView` import below the `GradientButton` import (after line 19):

```ts
import ItineraryView from '../../components/ItineraryView';
```

- [ ] **Step 2: Add view state**

Inside the component, alongside the other `useState` calls (after line 30, `const [busy, setBusy] = useState(false);`), add:

```ts
  const [view, setView] = useState<'story' | 'itinerary'>('story');
```

- [ ] **Step 3: Render the toggle and switch views**

Replace the final `return (...)` block's content area. Change the `<View style={styles.content}>` block (lines 182-189) to compute the itinerary and conditionally show the toggle + chosen view:

```tsx
        <View style={styles.content}>
          <Text style={styles.statusPill}>{statusLabel(post.status)}</Text>
          <Text style={styles.title}>{post.title ?? 'Untitled'}</Text>
          {itinerary ? (
            <View style={styles.segmented}>
              <Pressable
                style={[styles.segment, view === 'story' && styles.segmentActive]}
                onPress={() => setView('story')}
              >
                <Text style={[styles.segmentLabel, view === 'story' && styles.segmentLabelActive]}>Story</Text>
              </Pressable>
              <Pressable
                style={[styles.segment, view === 'itinerary' && styles.segmentActive]}
                onPress={() => setView('itinerary')}
              >
                <Text style={[styles.segmentLabel, view === 'itinerary' && styles.segmentLabelActive]}>Itinerary</Text>
              </Pressable>
            </View>
          ) : null}
          {itinerary && view === 'itinerary' ? (
            <ItineraryView itinerary={itinerary} />
          ) : (
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            <Markdown style={markdownStyles as any} rules={markdownRules}>
              {post.content_markdown ?? ''}
            </Markdown>
          )}
        </View>
```

Note: the cover image (lines 179-181) stays above this block and shows in both views. Compute `itinerary` just before the `return`, after the status guards (after line 174, the `error` guard):

```ts
  const itinerary = parseItinerary(post.itinerary);
```

- [ ] **Step 4: Add the segmented-control styles**

In the `StyleSheet.create({...})` for `styles` (starts line 286), add these entries (e.g. after `title`):

```ts
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.button,
    padding: 3,
    marginBottom: Spacing.md,
  },
  segment: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.button },
  segmentActive: { backgroundColor: Colors.accent },
  segmentLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  segmentLabelActive: { color: '#FFFFFF' },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `npx jest`
Expected: PASS (all existing tests + the new Task 2/3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/screens/blog/BlogPostScreen.tsx
git commit -m "feat: Story/Itinerary toggle on BlogPostScreen (0c)"
```

---

## Task 5: Edge function — generate the itinerary

**Files:**
- Modify: `supabase/functions/generate-blog/index.ts`

No unit test (project convention: the edge function is smoke-tested via MCP, and the Deno build is its type-check). All changes below are in `supabase/functions/generate-blog/index.ts`.

- [ ] **Step 1: Add `occurred_at` to the note type and query**

Add `occurred_at: string | null;` to the `NoteRow` type (after `created_at: string;`, line 109). Add `occurred_at` to the `notes` select string (line 181), e.g.:

```ts
      .select('content, category, place_name, city, lat, lng, occurred_at, created_at, photo_urls')
```

In `noteMeta` (lines 113-122), include the effective date so Claude can number days. Add to the array (after `n.created_at`):

```ts
    n.occurred_at ? `date: ${n.occurred_at}` : '',
```

- [ ] **Step 2: Add the deterministic eligibility helper**

Add near the top-level helpers (e.g. after `noteMeta`):

```ts
const MIN_ITINERARY_DAYS = 3;

/**
 * A note is an itinerary "stop candidate" when it is both located and named.
 * The trip warrants an itinerary when at least MIN_ITINERARY_DAYS distinct
 * calendar days (by occurred_at, falling back to created_at) contain such a
 * note. Deterministic so the decision is predictable and spends no output
 * tokens on trips too sparse for a real itinerary.
 */
function isItineraryEligible(notes: NoteRow[]): boolean {
  const days = new Set<string>();
  for (const n of notes) {
    if (!n.place_name || n.place_name.trim().length === 0) continue;
    if (n.lat === null || n.lng === null) continue;
    const iso = n.occurred_at ?? n.created_at;
    days.add(iso.slice(0, 10)); // yyyy-mm-dd
  }
  return days.size >= MIN_ITINERARY_DAYS;
}
```

- [ ] **Step 3: Extend the system prompt**

In `SYSTEM_PROMPT`, add an itinerary rule to the structure list (after the "## Places" bullet, before the closing-paragraph bullet) and extend the output JSON. Add this bullet:

```
- Itinerary: when asked to produce one (see the instruction in the notes), build a day-by-day
  plan grounded ONLY in the located, named places from the notes — never invent stops. Group stops
  by trip day in order. For each day give a 1-based "day" number, the ISO "date" (yyyy-mm-dd) when
  the notes make it clear (else null), and a short evocative "title". For each stop give:
  "time_of_day" as exactly "morning", "afternoon", or "evening" (or null if unclear — do not
  fabricate precise times), "place_name", "category" (food/stay/activity/shopping/to-visit/general
  or null), a one-line "description" grounded in the notes, and "lat"/"lng" copied from that note.
  When told NOT to produce an itinerary, set "itinerary" to null.
```

Change the output JSON line (line 94) to:

```
{"title": string, "content_markdown": string, "cover_photo_url": string | null, "selected_photo_urls": string[], "itinerary": ItineraryDay[] | null}
```

And add a final bullet describing the field:

```
- itinerary: a day-by-day itinerary as described above, or null when not requested or not applicable.
```

- [ ] **Step 4: Pass the per-request itinerary instruction**

In `buildUserContent`, add a parameter `eligible: boolean` and append an instruction block before the final `return content;` (after the "Available photo URLs" push, line 166):

```ts
  content.push({
    type: 'text',
    text: eligible
      ? 'Produce a day-by-day itinerary in the "itinerary" field as described in the system prompt.'
      : 'Do NOT produce an itinerary. Set "itinerary" to null.',
  });
```

Update the signature: `async function buildUserContent(trip: ..., notes: NoteRow[], eligible: boolean)`.

- [ ] **Step 5: Wire eligibility into `generate` and the output**

In `generate` (around line 188), compute eligibility and pass it:

```ts
    const eligible = isItineraryEligible(noteRows);
    const userContent = await buildUserContent(trip, noteRows, eligible);
```

After the existing `selected_photo_urls` parse (line 239), add itinerary extraction — supplementary, defensive, forced null when ineligible:

```ts
    let itinerary: unknown = null;
    if (eligible && Array.isArray(parsed.itinerary)) {
      const days = parsed.itinerary
        .map((d: unknown) => {
          if (typeof d !== 'object' || d === null) return null;
          const obj = d as Record<string, unknown>;
          if (typeof obj.day !== 'number' || !Array.isArray(obj.stops)) return null;
          const stops = obj.stops.filter(
            (s: unknown) =>
              typeof s === 'object' &&
              s !== null &&
              typeof (s as Record<string, unknown>).place_name === 'string' &&
              ((s as Record<string, unknown>).place_name as string).trim().length > 0,
          );
          if (stops.length === 0) return null;
          return { ...obj, stops };
        })
        .filter((d: unknown) => d !== null);
      itinerary = days.length > 0 ? days : null;
    }
```

Add `itinerary` to the `draft` update (line 245):

```ts
      .update({ status: 'draft', title, content_markdown, cover_photo_url, selected_photo_urls, itinerary })
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-blog/index.ts
git commit -m "feat: generate day-by-day itinerary in generate-blog (0c)"
```

---

## Task 6: Deploy, smoke-test, and verify

**Files:** none (deployment + verification only).

- [ ] **Step 1: Deploy the edge function**

Use the Supabase MCP `deploy_edge_function` tool to deploy `generate-blog` (project `dcejrbyujfcxartywpis`) with the updated `index.ts`. A successful Deno build is the type-check for the edge function. Confirm the new version is ACTIVE.

- [ ] **Step 2: Confirm the column exists**

Use the Supabase MCP `execute_sql` tool:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'blog_posts' and column_name = 'itinerary';
```

Expected: one row, `itinerary | jsonb`.

- [ ] **Step 3: Full local verification**

Run: `npx jest`
Expected: PASS (full suite).

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: On-device QA (manual)**

Build/run the app (`npm run ios`). Verify:
- A trip with ≥3 distinct located+named days generates a post that shows the **Story / Itinerary** toggle; the Itinerary view shows day cards with part-of-day–grouped stops.
- A 1–2 day or sparse trip generates a post with **no** toggle (`itinerary` is null).
- Regenerating replaces the itinerary (or clears it when the trip no longer qualifies).

- [ ] **Step 5: Update progress doc**

Update `docs/progress.md`: mark 0c done with the merge details, mirroring the format of the existing entries (status line at top + a feature-summary paragraph + backlog row). Commit:

```bash
git add docs/progress.md
git commit -m "docs: mark itinerary-from-blog (0c) done"
```

- [ ] **Step 6: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR. (Per project memory: branch from `main`, no worktrees.)

---

## Notes for the implementer

- **TDD surfaces are Tasks 2 and 3 only.** The edge function (Task 5) follows the project convention of no unit tests — it is smoke-tested via MCP after deploy, and its Deno build is the type-check.
- **The itinerary is supplementary.** A malformed/missing itinerary must store `null` and never fail the narrative. Only the existing narrative checks (`empty_content`, etc.) fail a post.
- **Day grouping uses `occurred_at ?? created_at`** everywhere (eligibility gate + Claude's date assignment).
- **No map in this slice.** `lat`/`lng` are stored per stop but not rendered; the mini-map is a deferred follow-up.
- **Export is unchanged** — it still exports the narrative markdown only.
```
