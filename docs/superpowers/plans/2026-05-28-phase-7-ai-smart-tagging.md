# AI Smart Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-orchestrated tagger that drains `pending` notes through a `tag-note` Claude edge function, merges the result without overriding user/GPS data, and flips `tagging_status` to `complete` — feeding the shimmer already wired into `NoteCard`.

**Architecture:** A stateless Supabase Edge Function (`tag-note`) classifies a note via Claude Haiku and returns `{ category, place_name, city }` as JSON. The client (`taggingService`) calls it, normalizes + merges the result against the note's existing values (keep user category / GPS city; always take AI place_name), and writes the row back under the user's RLS auth. Realtime `UPDATE` (already subscribed in `useNotes`) swaps the shimmer for the real badge. Draining is wired into the existing `MainStack` lifecycle triggers plus a prompt pass after each online save.

**Tech Stack:** React Native (Expo), TypeScript, Supabase (Edge Functions on Deno, Postgres, Realtime), Anthropic Claude Haiku, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-28-phase-7-ai-smart-tagging-design.md`

---

## Refinement vs. Spec

The spec listed `parseClaudeJson` as a client helper. During planning it became clear the raw-text fence-stripping + `JSON.parse` belongs in the **edge function** (where the raw Claude text lives, exactly as `detect-intent` does it). The client receives already-structured `data` from `supabase.functions.invoke`, so the client helper is `normalizeSuggestion(data)` — it validates/coerces the structured response into a safe `TagSuggestion`. Same intent ("never trust malformed output"), correct location.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `src/services/taggingHelpers.ts` | Pure functions: `validateCategory`, `normalizeSuggestion`, `mergeTags`. No I/O. | New |
| `src/services/__tests__/taggingHelpers.test.ts` | Unit tests for the pure helpers. | New |
| `supabase/functions/tag-note/index.ts` | Deno edge function: Claude classifier, JSON-only, non-200 on failure. | New |
| `src/services/taggingService.ts` | `tagNote(note)` + `drainTagging()`: invoke function, merge, write row. | New |
| `src/services/__tests__/taggingService.test.ts` | Unit tests for the service (supabase mocked). | New |
| `src/services/noteService.ts` | `trySync` returns `boolean`; `createNote` kicks `drainTagging()` on successful online sync. | Modify |
| `src/navigation/MainStack.tsx` | Run `drainTagging()` after `drainQueue()` at the 3 existing triggers. | Modify |
| `src/components/NoteCard.tsx` | Render `note.place_name` under the content when set. | Modify |

No migration: `category`, `place_name`, `city`, `tagging_status` already exist (migration 004) and are present in `database.types.ts`.

---

## Task 1: Pure tagging helpers

**Files:**
- Create: `src/services/taggingHelpers.ts`
- Test: `src/services/__tests__/taggingHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/taggingHelpers.test.ts`:

```typescript
import { validateCategory, normalizeSuggestion, mergeTags } from '../taggingHelpers';

describe('validateCategory', () => {
  it('returns the value for each valid category', () => {
    for (const c of ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general']) {
      expect(validateCategory(c)).toBe(c);
    }
  });

  it('lowercases mixed-case input', () => {
    expect(validateCategory('Food')).toBe('food');
    expect(validateCategory('TO-VISIT')).toBe('to-visit');
  });

  it('falls back to general for junk or non-strings', () => {
    expect(validateCategory('nightlife')).toBe('general');
    expect(validateCategory('')).toBe('general');
    expect(validateCategory(null)).toBe('general');
    expect(validateCategory(42)).toBe('general');
  });
});

describe('normalizeSuggestion', () => {
  it('validates category and coerces place_name/city to nullable strings', () => {
    expect(
      normalizeSuggestion({ category: 'Food', place_name: 'Ichiran Ramen', city: 'Tokyo' }),
    ).toEqual({ category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' });
  });

  it('maps empty strings and missing fields to null', () => {
    expect(normalizeSuggestion({ category: 'bogus', place_name: '   ', city: undefined })).toEqual({
      category: 'general',
      place_name: null,
      city: null,
    });
  });

  it('returns a safe suggestion for non-object input', () => {
    expect(normalizeSuggestion(null)).toEqual({ category: 'general', place_name: null, city: null });
    expect(normalizeSuggestion('oops')).toEqual({ category: 'general', place_name: null, city: null });
  });
});

describe('mergeTags', () => {
  const suggestion = { category: 'food' as const, place_name: 'Ichiran Ramen', city: 'Tokyo' };

  it('keeps an existing user category and existing GPS city', () => {
    expect(
      mergeTags({ category: 'stay', city: 'Kyoto' }, suggestion),
    ).toEqual({ category: 'stay', place_name: 'Ichiran Ramen', city: 'Kyoto' });
  });

  it('fills category and city from the suggestion when both are blank', () => {
    expect(
      mergeTags({ category: null, city: null }, suggestion),
    ).toEqual({ category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' });
  });

  it('always takes the suggested place_name', () => {
    expect(
      mergeTags({ category: 'stay', city: 'Kyoto' }, { ...suggestion, place_name: 'Park Hyatt' }),
    ).toMatchObject({ place_name: 'Park Hyatt' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts`
Expected: FAIL — "Cannot find module '../taggingHelpers'".

- [ ] **Step 3: Implement the helpers**

Create `src/services/taggingHelpers.ts`:

```typescript
import { CATEGORIES, type Category } from './noteHelpers';

export type TagSuggestion = {
  category: Category;
  place_name: string | null;
  city: string | null;
};

export type ExistingTags = {
  category: Category | null;
  city: string | null;
};

export function validateCategory(value: unknown): Category {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    const match = CATEGORIES.find((c) => c === lower);
    if (match) return match;
  }
  return 'general';
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSuggestion(data: unknown): TagSuggestion {
  const obj = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    category: validateCategory(obj.category),
    place_name: toNullableString(obj.place_name),
    city: toNullableString(obj.city),
  };
}

export function mergeTags(existing: ExistingTags, suggestion: TagSuggestion): TagSuggestion {
  return {
    category: existing.category ?? suggestion.category,
    place_name: suggestion.place_name,
    city: existing.city ?? suggestion.city,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/services/__tests__/taggingHelpers.test.ts`
Expected: PASS — all three describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/services/taggingHelpers.ts src/services/__tests__/taggingHelpers.test.ts
git commit -m "feat(phase-7): pure tagging helpers (validate, normalize, merge)"
```

---

## Task 2: `tag-note` edge function

**Files:**
- Create: `supabase/functions/tag-note/index.ts`

No unit test — Deno edge functions follow the existing `detect-intent` precedent (verified manually + via deploy). The `ANTHROPIC_API_KEY` secret is already configured in the project (used by `detect-intent`).

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/tag-note/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const CATEGORIES = ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general'];

const SYSTEM_PROMPT = `You are a metadata tagger for a travel notes app. Given a single note
(and optional location context), assign:
- category: exactly one of food, stay, activity, shopping, to-visit, general
- place_name: the specific named venue/landmark if one is clearly mentioned (e.g. "Ichiran Ramen",
  "Park Hyatt Tokyo"); otherwise null
- city: the city the note is about, but ONLY if you can confidently infer it AND no city was already
  provided in the context; otherwise null

Rules:
- "to-visit" means a place the user wants to go later, not somewhere they are. "general" is the
  catch-all when nothing fits.
- Do not invent a place_name or city. When unsure, use null.

Respond with ONLY valid JSON — no markdown, no explanation:
{"category":"food","place_name":"Ichiran Ramen","city":"Tokyo"}`;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const { content, lat, lng, city } = (await req.json()) as {
    content?: string;
    lat?: number | null;
    lng?: number | null;
    city?: string | null;
  };

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'empty_content' }), { status: 400, headers: JSON_HEADERS });
  }

  const contextLines = [
    `Note: "${content.trim()}"`,
    city ? `Known city: ${city} (do not change it; return null for city).` : 'No city is known.',
    lat != null && lng != null ? `Coordinates: ${lat}, ${lng}.` : '',
  ].filter(Boolean);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contextLines.join('\n') }],
    }),
  });

  // Non-200 → the client leaves the note 'pending' and retries on the next drain.
  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'claude_error' }), { status: 502, headers: JSON_HEADERS });
  }

  const claudeData = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const rawText = claudeData.content[0]?.text ?? '';
  const jsonText = (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText).trim();

  let parsed: { category?: unknown; place_name?: unknown; city?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return new Response(JSON.stringify({ error: 'parse_error' }), { status: 502, headers: JSON_HEADERS });
  }

  const rawCategory = typeof parsed.category === 'string' ? parsed.category.toLowerCase() : 'general';
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'general';
  const place_name = typeof parsed.place_name === 'string' && parsed.place_name.trim() ? parsed.place_name.trim() : null;
  const resolvedCity = typeof parsed.city === 'string' && parsed.city.trim() ? parsed.city.trim() : null;

  return new Response(JSON.stringify({ category, place_name, city: resolvedCity }), { headers: JSON_HEADERS });
});
```

- [ ] **Step 2: Deploy the function**

Run: `npx supabase functions deploy tag-note`
Expected: "Deployed Function tag-note". (If the CLI prompts for a project link, it is already linked — see `supabase/.temp/linked-project.json`.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tag-note/index.ts
git commit -m "feat(phase-7): tag-note edge function (Claude category/place/city classifier)"
```

---

## Task 3: `taggingService` (tagNote + drainTagging)

**Files:**
- Create: `src/services/taggingService.ts`
- Test: `src/services/__tests__/taggingService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/taggingService.test.ts`:

```typescript
// Supabase mock: functions.invoke for the edge call; from('notes') supports both
// .select('*').eq(...)  (drainTagging query, resolves { data, error }) and
// .update({...}).eq('id', id)  (tagNote write, resolves { error }).
const mockInvoke = jest.fn();
const mockSelectEq = jest.fn();
const mockUpdateEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect, update: mockUpdate }));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (table: string) => mockFrom(table),
  },
}));

import { tagNote, drainTagging } from '../taggingService';
import type { Note } from '../noteHelpers';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    user_id: 'user-1',
    trip_id: 'trip-1',
    content: 'Amazing ramen at Ichiran',
    category: null,
    lat: null,
    lng: null,
    city: null,
    place_name: null,
    tagging_status: 'pending',
    photo_urls: [],
    offline_id: 'off-1',
    captured_at: '2026-05-28T00:00:00.000Z',
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    ...overrides,
  } as Note;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tagNote', () => {
  it('tags a blank note from the suggestion and marks it complete', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' },
      error: null,
    });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    const ok = await tagNote(makeNote());

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('tag-note', {
      body: { content: 'Amazing ramen at Ichiran', lat: null, lng: null, city: null },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      category: 'food',
      place_name: 'Ichiran Ramen',
      city: 'Tokyo',
      tagging_status: 'complete',
    });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('keeps the user category and GPS city, still sets place_name', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { category: 'food', place_name: 'Ichiran Ramen', city: 'Tokyo' },
      error: null,
    });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await tagNote(makeNote({ category: 'stay', city: 'Kyoto' }));

    expect(mockUpdate).toHaveBeenCalledWith({
      category: 'stay',
      place_name: 'Ichiran Ramen',
      city: 'Kyoto',
      tagging_status: 'complete',
    });
  });

  it('leaves the note pending (no write) when the function errors', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('502') });

    const ok = await tagNote(makeNote());

    expect(ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('drainTagging', () => {
  it('tags every pending note and returns the count', async () => {
    mockSelectEq.mockResolvedValueOnce({
      data: [makeNote({ id: 'a' }), makeNote({ id: 'b' })],
      error: null,
    });
    mockInvoke.mockResolvedValue({
      data: { category: 'general', place_name: null, city: null },
      error: null,
    });
    mockUpdateEq.mockResolvedValue({ error: null });

    const count = await drainTagging();

    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockSelectEq).toHaveBeenCalledWith('tagging_status', 'pending');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it('returns 0 when the query errors', async () => {
    mockSelectEq.mockResolvedValueOnce({ data: null, error: new Error('db down') });

    const count = await drainTagging();

    expect(count).toBe(0);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/services/__tests__/taggingService.test.ts`
Expected: FAIL — "Cannot find module '../taggingService'".

- [ ] **Step 3: Implement the service**

Create `src/services/taggingService.ts`:

```typescript
import { supabase } from '../lib/supabase';
import type { Note } from './noteHelpers';
import { mergeTags, normalizeSuggestion } from './taggingHelpers';

/**
 * Tags a single note via the tag-note edge function. Returns true if the note
 * was tagged and written; false if the function failed (note stays 'pending').
 */
export async function tagNote(note: Note): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('tag-note', {
    body: { content: note.content, lat: note.lat, lng: note.lng, city: note.city },
  });

  if (error || !data) return false;

  const merged = mergeTags(
    { category: note.category, city: note.city },
    normalizeSuggestion(data),
  );

  const { error: updateError } = await supabase
    .from('notes')
    .update({
      category: merged.category,
      place_name: merged.place_name,
      city: merged.city,
      tagging_status: 'complete',
    })
    .eq('id', note.id);

  return !updateError;
}

/**
 * Drains every pending note for the current user (RLS scopes to own rows) and
 * tags it. Idempotent and safe to call often. Returns the count tagged.
 */
export async function drainTagging(): Promise<number> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('tagging_status', 'pending');

  if (error || !data) return 0;

  let tagged = 0;
  for (const note of data as Note[]) {
    const ok = await tagNote(note);
    if (ok) tagged += 1;
  }
  return tagged;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/services/__tests__/taggingService.test.ts`
Expected: PASS — both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/services/taggingService.ts src/services/__tests__/taggingService.test.ts
git commit -m "feat(phase-7): taggingService — tagNote + drainTagging"
```

---

## Task 4: Trigger tagging on online save

**Files:**
- Modify: `src/services/noteService.ts`

This is wiring around the already-tested `tagNote`/`drainTagging`. Verified by the full suite still passing + the Task 7 manual check.

- [ ] **Step 1: Import drainTagging**

In `src/services/noteService.ts`, add to the imports near the top (after the existing `offlineQueue` import):

```typescript
import { drainTagging } from './taggingService';
```

- [ ] **Step 2: Make `trySync` report success and kick tagging from `createNote`**

In `src/services/noteService.ts`, change the end of `createNote` from:

```typescript
  await enqueue(pending);
  void trySync(pending, input.photo_urls ?? []);
  return pending;
```

to:

```typescript
  await enqueue(pending);
  void trySync(pending, input.photo_urls ?? []).then((synced) => {
    if (synced) void drainTagging();
  });
  return pending;
```

Then change the `trySync` signature and its tail. From:

```typescript
async function trySync(pending: PendingNote, photoUrls: string[] = []): Promise<void> {
```

to:

```typescript
async function trySync(pending: PendingNote, photoUrls: string[] = []): Promise<boolean> {
```

And change its final block from:

```typescript
  if (!error) {
    await removeByOfflineId(pending.offline_id);
  }
}
```

to:

```typescript
  if (!error) {
    await removeByOfflineId(pending.offline_id);
    return true;
  }
  return false;
}
```

- [ ] **Step 3: Run the existing noteService tests to verify no regression**

Run: `npx jest src/services/__tests__/noteService.test.ts`
Expected: PASS — `updateNote` and `deleteNote` suites unchanged (they don't touch `createNote`/`trySync`).

- [ ] **Step 4: Commit**

```bash
git add src/services/noteService.ts
git commit -m "feat(phase-7): trigger tagging drain after a successful online save"
```

---

## Task 5: Wire drainTagging into MainStack lifecycle

**Files:**
- Modify: `src/navigation/MainStack.tsx`

- [ ] **Step 1: Import drainTagging**

In `src/navigation/MainStack.tsx`, change the import on line 13 from:

```typescript
import { drainQueue } from '../services/noteService';
```

to:

```typescript
import { drainQueue } from '../services/noteService';
import { drainTagging } from '../services/taggingService';
```

- [ ] **Step 2: Run drainTagging after each drainQueue**

In the three trigger sites, replace each `void drainQueue();` so tagging runs after the queue drain completes (newly-synced rows become visible to the tag query).

In the mount effect:

```typescript
  useEffect(() => {
    void drainQueue().then(() => drainTagging());
  }, []);
```

In the reconnect callback:

```typescript
  useOnReconnect(
    useCallback(() => {
      void drainQueue().then(() => drainTagging());
    }, []),
  );
```

In the AppState effect:

```typescript
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue().then(() => drainTagging());
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/MainStack.tsx
git commit -m "feat(phase-7): drain tagging after queue drain on mount/reconnect/foreground"
```

---

## Task 6: Show place_name on NoteCard

**Files:**
- Modify: `src/components/NoteCard.tsx`

- [ ] **Step 1: Render place_name under the content**

In `src/components/NoteCard.tsx`, inside `ServerNoteCard`, change the content/photo block from:

```tsx
      <Text style={styles.content} numberOfLines={3}>{note.content}</Text>
      {note.photo_urls.length > 0 && <PhotoStrip urls={note.photo_urls} />}
```

to:

```tsx
      <Text style={styles.content} numberOfLines={3}>{note.content}</Text>
      {note.place_name ? (
        <Text style={styles.placeName}>📍 {note.place_name}</Text>
      ) : null}
      {note.photo_urls.length > 0 && <PhotoStrip urls={note.photo_urls} />}
```

- [ ] **Step 2: Add the placeName style**

In the same file's `StyleSheet.create({...})`, add after the `content` style:

```typescript
  placeName: {
    fontSize: 11,
    color: Colors.accent,
    marginTop: 4,
  },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (`note.place_name` is `string | null` on the `Note` type).

- [ ] **Step 4: Commit**

```bash
git add src/components/NoteCard.tsx
git commit -m "feat(phase-7): show AI place_name on note cards"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass, including the new `taggingHelpers` and `taggingService` tests.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (run the app)**

Launch with `npm run ios` and confirm:
- Save a text-only note while online → a category-badge shimmer appears, then resolves to a real colored badge within a moment.
- Save a note that names a venue (e.g. "great ramen at Ichiran") → `📍 Ichiran Ramen` renders under the content.
- Pick a category in the capture sheet before saving → after tagging, that category is unchanged.
- Save a note while a GPS city is shown → the city in the card meta is not overwritten.
- Turn airplane mode on, save a note, turn it off → the note syncs, then a shimmer→badge transition follows.
- Edit a note's content (Phase 6 edit sheet) → it returns to a shimmer and re-tags.

- [ ] **Step 4: Final commit (if any manual-fix tweaks were needed)**

```bash
git add -A
git commit -m "test(phase-7): verify AI smart tagging end-to-end"
```

(Skip if Steps 1–3 required no changes.)

---

## Self-Review Notes

- **Spec coverage:** edge function (Task 2) ✓; client-orchestrated drain + triggers (Tasks 3–5) ✓; merge rules never overriding user/GPS (Task 1 `mergeTags` + Task 3 `tagNote`) ✓; non-200 → stays pending (Task 2 + `tagNote` returning false) ✓; place_name display (Task 6) ✓; no migration (already exists) ✓; deferred places/vision — not in any task by design ✓.
- **Type consistency:** `TagSuggestion`/`ExistingTags` defined in Task 1 and consumed unchanged in Task 3; `tagNote`/`drainTagging` signatures match between definition (Task 3) and callers (Tasks 4–5); `Category` reused from `noteHelpers`.
- **Placeholder scan:** none — every code step shows full content.
```
