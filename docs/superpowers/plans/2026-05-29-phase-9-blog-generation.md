# Phase 9 — Blog Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a completed trip into a polished, read-only blog draft the user can review, publish (locally), and export — making the Blog tab functional for the first time.

**Architecture:** Three thin layers, mirroring Phases 7/8. (1) Pure helpers in `src/services/blogHelpers.ts` (place collection, response validation, Markdown→HTML, formatters) — no Supabase/native imports, fully unit-tested. (2) A thin Supabase wrapper `src/services/blogService.ts` (generate/list/get/publish/discard/unpublish), unit-tested with Supabase mocked. (3) A stateless **service-role** Deno edge function `supabase/functions/generate-blog/index.ts` that inserts a `generating` row, returns its id immediately, and finishes the ~60s Claude generation via `EdgeRuntime.waitUntil`. A Realtime hook flips the card from `generating → draft` live. New `blog_posts` table (migration 008).

**Tech Stack:** TypeScript, React Native (Expo), Supabase (Postgres + RLS + Realtime + Edge Functions/Deno), Claude `claude-sonnet-4-6`, Jest + jest-expo. New deps: `react-native-markdown-display`, `expo-sharing`, `expo-file-system`. Supabase project id: `dcejrbyujfcxartywpis`.

**Design spec:** `docs/superpowers/specs/2026-05-28-phase-9-blog-generation-design.md`

---

## File Structure

- **Create** `supabase/migrations/008_blog_posts.sql` — the `blog_posts` table, RLS, `updated_at` trigger, partial unique index, Realtime.
- **Modify** `src/lib/database.types.ts` — add the `blog_posts` table entry (Row/Insert/Update/Relationships).
- **Create** `src/services/blogHelpers.ts` — pure: types (`BlogStatus`, `BlogPost`, `BlogResult`, `Place`), `collectPlaces`, `validateBlogResult`, `markdownToHtml`, `statusLabel`, `formatBlogDate`. Imports only `import type` — no Supabase, no native modules.
- **Create** `src/services/__tests__/blogHelpers.test.ts` — unit tests for every helper.
- **Create** `src/services/blogService.ts` — thin Supabase wrapper: `generateBlog`, `listBlogPosts`, `getBlogPost`, `publishPost`, `discardDraft`, `unpublish`.
- **Create** `src/services/__tests__/blogService.test.ts` — unit tests with Supabase mocked (lazy-closure pattern).
- **Create** `supabase/functions/generate-blog/index.ts` — Deno, service-role edge function.
- **Create** `src/hooks/useBlogPosts.ts` — Realtime hook over `blog_posts`.
- **Create** `src/components/BlogPostCard.tsx` — cover thumbnail + title + date + status label.
- **Create** `src/screens/blog/BlogPostScreen.tsx` — status-driven read-only post screen + actions + export.
- **Rewrite** `src/screens/BlogScreen.tsx` — real Drafts/Published sections + completed-trip picker.
- **Modify** `src/screens/trip/TripDetailScreen.tsx` — wire the "Generate Blog" button (completed trips only) to `generateBlog` + navigate.
- **Modify** `src/navigation/types.ts` — add `BlogPost: { postId: string }` to `MainStackParamList`.
- **Modify** `src/navigation/MainStack.tsx` — register the `BlogPost` route.
- **Modify** `package.json` / `ios/` — add the three new deps and rebuild pods.

`blogHelpers.ts` holds every bit of logic that runs without Supabase or native modules (so it is unit-testable in isolation, per the Phase 8 gotcha). `blogService.ts` stays a thin DB wrapper. The edge function does all privileged AI work server-side.

---

## Reference: existing shapes and patterns (do not redefine — reuse)

From `src/services/noteHelpers.ts`:
```ts
export type Category = 'food' | 'stay' | 'activity' | 'shopping' | 'to-visit' | 'general';
export type Note = /* notes Row, with category: Category | null, tagging_status: TaggingStatus */;
```

From `src/services/tripHelpers.ts`:
```ts
export type Trip = /* trips Row, with status: 'active' | 'completed' */;
export function splitByStatus(trips: Trip[]): { active: Trip[]; completed: Trip[] };
```

From `src/contexts/AuthContext.tsx` — the only source of the current user id:
```ts
const { session } = useAuth();           // session?.user.id is the userId
```

From `src/hooks/useTrips.ts` — the Realtime hook pattern to mirror (per-instance random channel suffix to avoid the Phase 3 channel-collision gotcha):
```ts
const instanceId = useRef(Math.random().toString(36).slice(2)).current;
const channel = supabase.channel(`trips:${userId}:${instanceId}`).on('postgres_changes', { ... }).subscribe();
```

From `src/services/__tests__/taggingService.test.ts` — the lazy-closure Supabase mock pattern (mock consts referenced inside closures so the hoisted `jest.mock` factory works).

From `supabase/functions/tag-note/index.ts` — edge function conventions: `serve`, `Authorization` header check, `fetch` to `https://api.anthropic.com/v1/messages` with `x-api-key` + `anthropic-version: 2023-06-01`, and the fence-strip regex `(/```(?:json)?\s*([\s\S]*?)```/)` before `JSON.parse`.

From `src/theme/index.ts`: `Colors` (`accent: '#C8703A'`, `error: '#FF453A'`, `surface`, `border`, `textPrimary`, `textSecondary`, `background`), `Spacing` (`xs:4 sm:8 md:16 lg:24 xl:32`), `Typography`, `BorderRadius` (`card:16 button:13`), `Shadows.card`.

---

## Task 1: Migration `008_blog_posts.sql` + database types

**Files:**
- Create: `supabase/migrations/008_blog_posts.sql`
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/008_blog_posts.sql`:

```sql
-- blog_posts: a generated, reviewable travel write-up for a completed trip.
-- Phase 9 scope: Generate -> Review -> Export. "Published" is a local status
-- marker only (no public web URL yet — that waits for the web-layer phase).
-- The generate-blog edge function writes via the service role (bypasses RLS);
-- the client reads/mutates its own rows under RLS.

create table public.blog_posts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  trip_id             uuid not null references public.trips (id) on delete cascade,
  status              text not null default 'generating'
                        check (status in ('generating','draft','published','error')),
  title               text,
  content_markdown    text,
  cover_photo_url     text,
  selected_photo_urls text[] not null default '{}',
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  published_at        timestamptz
);

-- Blog tab query: a user's posts, newest first.
create index blog_posts_user_created_idx
  on public.blog_posts (user_id, created_at desc);

-- At most one in-flight/draft post per trip; regenerating replaces the prior
-- non-published row. Published posts are exempt so history can accumulate.
create unique index blog_posts_one_active_per_trip
  on public.blog_posts (trip_id)
  where status <> 'published';

-- updated_at maintained by the already-hardened set_updated_at trigger function
-- (search_path = '' + revoked EXECUTE; established in Phases 2-3).
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- RLS: posts are fully private to their owner.
alter table public.blog_posts enable row level security;

create policy "blog_posts_select_own"
  on public.blog_posts for select to authenticated
  using (auth.uid() = user_id);

create policy "blog_posts_insert_own"
  on public.blog_posts for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = auth.uid()
    )
  );

create policy "blog_posts_update_own"
  on public.blog_posts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "blog_posts_delete_own"
  on public.blog_posts for delete to authenticated
  using (auth.uid() = user_id);

-- Realtime so a 'generating' card flips to 'draft' live (replaces push notifications).
alter publication supabase_realtime add table public.blog_posts;
```

- [ ] **Step 2: Apply the migration to the remote project**

Use the Supabase MCP `apply_migration` tool with `project_id: "dcejrbyujfcxartywpis"`, `name: "008_blog_posts"`, and `query` set to the full SQL above.

Expected: success, no error.

- [ ] **Step 3: Verify the table and index exist**

Use the Supabase MCP `execute_sql` tool with `project_id: "dcejrbyujfcxartywpis"`:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'blog_posts'
order by ordinal_position;
```

Expected: 12 rows including `selected_photo_urls` (`ARRAY`) and `status` (`text`, `NO`).

- [ ] **Step 4: Add the `blog_posts` entry to generated DB types**

In `src/lib/database.types.ts`, inside `public.Tables`, add a `blog_posts` entry **before** the existing `notes:` entry (line 17):

```ts
      blog_posts: {
        Row: {
          content_markdown: string | null
          cover_photo_url: string | null
          created_at: string
          error_message: string | null
          id: string
          published_at: string | null
          selected_photo_urls: string[]
          status: string
          title: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_markdown?: string | null
          cover_photo_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          published_at?: string | null
          selected_photo_urls?: string[]
          status?: string
          title?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_markdown?: string | null
          cover_photo_url?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          published_at?: string | null
          selected_photo_urls?: string[]
          status?: string
          title?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/008_blog_posts.sql src/lib/database.types.ts
git commit -m "feat(phase-9): blog_posts table, RLS, realtime + DB types"
```

---

## Task 2: `blogHelpers` — types, `statusLabel`, `formatBlogDate`

**Files:**
- Create: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/blogHelpers.test.ts`:

```ts
import { statusLabel, formatBlogDate } from '../blogHelpers';

describe('statusLabel', () => {
  it('maps each status to a human label', () => {
    expect(statusLabel('generating')).toBe('Generating…');
    expect(statusLabel('draft')).toBe('Ready to review');
    expect(statusLabel('published')).toBe('Published');
    expect(statusLabel('error')).toBe('Failed');
  });
});

describe('formatBlogDate', () => {
  it('formats an ISO timestamp as "Mon D, YYYY"', () => {
    expect(formatBlogDate('2026-05-29T10:00:00.000Z')).toBe('May 29, 2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts`
Expected: FAIL — `Cannot find module '../blogHelpers'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/blogHelpers.ts`:

```ts
import type { Database } from '../lib/database.types';
import type { Category, Note } from './noteHelpers';

type BlogPostRow = Database['public']['Tables']['blog_posts']['Row'];

export type BlogStatus = 'generating' | 'draft' | 'published' | 'error';

// Narrow the DB row's `status: string` to the literal union the CHECK enforces.
export type BlogPost = Omit<BlogPostRow, 'status'> & { status: BlogStatus };

export type BlogResult = {
  title: string;
  content_markdown: string;
  cover_photo_url: string | null;
  selected_photo_urls: string[];
};

export type Place = { place_name: string; category: Category | null; city: string | null };

export function statusLabel(status: BlogStatus): string {
  switch (status) {
    case 'generating':
      return 'Generating…';
    case 'draft':
      return 'Ready to review';
    case 'published':
      return 'Published';
    case 'error':
      return 'Failed';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatBlogDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat(phase-9): blogHelpers types + statusLabel + formatBlogDate"
```

---

## Task 3: `collectPlaces`

**Files:**
- Modify: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/__tests__/blogHelpers.test.ts`:

```ts
import { collectPlaces } from '../blogHelpers';
import type { Note } from '../noteHelpers';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    user_id: 'u1',
    trip_id: 't1',
    content: 'x',
    category: null,
    lat: null,
    lng: null,
    city: null,
    place_name: null,
    tagging_status: 'complete',
    photo_urls: [],
    offline_id: 'o1',
    captured_at: '2026-05-28T00:00:00.000Z',
    created_at: '2026-05-28T00:00:00.000Z',
    updated_at: '2026-05-28T00:00:00.000Z',
    ...overrides,
  } as Note;
}

describe('collectPlaces', () => {
  it('returns one entry per named place, skipping notes without a place_name', () => {
    const places = collectPlaces([
      makeNote({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' }),
      makeNote({ place_name: null }),
      makeNote({ place_name: 'Senso-ji', category: 'activity', city: 'Tokyo' }),
    ]);
    expect(places).toEqual([
      { place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' },
      { place_name: 'Senso-ji', category: 'activity', city: 'Tokyo' },
    ]);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    const places = collectPlaces([
      makeNote({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' }),
      makeNote({ place_name: 'ichiran ramen', category: 'general', city: 'Osaka' }),
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]).toEqual({ place_name: 'Ichiran Ramen', category: 'food', city: 'Tokyo' });
  });

  it('returns an empty array when no notes have places', () => {
    expect(collectPlaces([makeNote(), makeNote()])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t collectPlaces`
Expected: FAIL — `collectPlaces is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/blogHelpers.ts`:

```ts
export function collectPlaces(notes: Note[]): Place[] {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const note of notes) {
    if (!note.place_name) continue;
    const name = note.place_name.trim();
    const key = name.toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    places.push({ place_name: name, category: note.category, city: note.city });
  }
  return places;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t collectPlaces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat(phase-9): collectPlaces helper"
```

---

## Task 4: `validateBlogResult`

**Files:**
- Modify: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/__tests__/blogHelpers.test.ts`:

```ts
import { validateBlogResult } from '../blogHelpers';

describe('validateBlogResult', () => {
  const valid = {
    title: 'Five Days in Tokyo',
    content_markdown: '# Tokyo\n\nWhat a trip.',
    cover_photo_url: 'https://x/p.jpg',
    selected_photo_urls: ['https://x/p.jpg'],
  };

  it('returns the typed result for a well-formed object', () => {
    expect(validateBlogResult(valid)).toEqual(valid);
  });

  it('accepts a null cover_photo_url and empty photo list', () => {
    const r = validateBlogResult({ ...valid, cover_photo_url: null, selected_photo_urls: [] });
    expect(r).not.toBeNull();
    expect(r!.cover_photo_url).toBeNull();
    expect(r!.selected_photo_urls).toEqual([]);
  });

  it('returns null when title is missing', () => {
    const { title: _omit, ...rest } = valid;
    expect(validateBlogResult(rest)).toBeNull();
  });

  it('returns null when content_markdown is not a string', () => {
    expect(validateBlogResult({ ...valid, content_markdown: 123 })).toBeNull();
  });

  it('returns null when selected_photo_urls contains a non-string', () => {
    expect(validateBlogResult({ ...valid, selected_photo_urls: ['ok', 5] })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(validateBlogResult(null)).toBeNull();
    expect(validateBlogResult('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t validateBlogResult`
Expected: FAIL — `validateBlogResult is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/blogHelpers.ts`:

```ts
export function validateBlogResult(data: unknown): BlogResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.title !== 'string') return null;
  if (typeof obj.content_markdown !== 'string') return null;
  if (!(obj.cover_photo_url === null || typeof obj.cover_photo_url === 'string')) return null;
  if (!Array.isArray(obj.selected_photo_urls)) return null;
  if (!obj.selected_photo_urls.every((u) => typeof u === 'string')) return null;
  return {
    title: obj.title,
    content_markdown: obj.content_markdown,
    cover_photo_url: obj.cover_photo_url as string | null,
    selected_photo_urls: obj.selected_photo_urls as string[],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t validateBlogResult`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat(phase-9): validateBlogResult type guard"
```

---

## Task 5: `markdownToHtml`

**Files:**
- Modify: `src/services/blogHelpers.ts`
- Test: `src/services/__tests__/blogHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/__tests__/blogHelpers.test.ts`:

```ts
import { markdownToHtml } from '../blogHelpers';

describe('markdownToHtml', () => {
  it('wraps output in a full HTML document', () => {
    const html = markdownToHtml('Hello');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<body>');
    expect(html).toContain('</html>');
  });

  it('converts #/##/### into h1/h2/h3', () => {
    const html = markdownToHtml('# Title\n\n## Section\n\n### Sub');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<h3>Sub</h3>');
  });

  it('wraps plain lines in a paragraph', () => {
    expect(markdownToHtml('Just some prose.')).toContain('<p>Just some prose.</p>');
  });

  it('converts a standalone image line to an <img> (URL untouched)', () => {
    const html = markdownToHtml('![A photo](https://x/p.jpg?token=a&b=1)');
    expect(html).toContain('<img alt="A photo" src="https://x/p.jpg?token=a&b=1" />');
  });

  it('converts **bold** to <strong>', () => {
    expect(markdownToHtml('This is **important** stuff.')).toContain('<strong>important</strong>');
  });

  it('escapes HTML-significant characters in prose', () => {
    expect(markdownToHtml('2 < 3 & 4 > 1')).toContain('2 &lt; 3 &amp; 4 &gt; 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts -t markdownToHtml`
Expected: FAIL — `markdownToHtml is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/services/blogHelpers.ts`:

```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function boldify(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// Render inline content: images become <img> (their URLs kept raw so query
// strings survive), surrounding text is escaped then bolded.
function renderInline(text: string): string {
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let result = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(text)) !== null) {
    result += boldify(escapeHtml(text.slice(lastIndex, m.index)));
    result += `<img alt="${escapeHtml(m[1])}" src="${m[2].trim()}" />`;
    lastIndex = imgRe.lastIndex;
  }
  result += boldify(escapeHtml(text.slice(lastIndex)));
  return result;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const blocks: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length > 0) {
      blocks.push(`<p>${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      blocks.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(line)) {
      flush();
      blocks.push(renderInline(line));
      continue;
    }
    para.push(line);
  }
  flush();

  const body = blocks.join('\n');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body { font-family: -apple-system, system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #111; }
img { max-width: 100%; border-radius: 12px; margin: 12px 0; }
h1 { font-size: 28px; } h2 { font-size: 22px; } h3 { font-size: 18px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/blogHelpers.test.ts`
Expected: PASS (all `blogHelpers` describes).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/services/blogHelpers.ts src/services/__tests__/blogHelpers.test.ts
git commit -m "feat(phase-9): markdownToHtml export converter"
```

---

## Task 6: `blogService` (Supabase mocked)

**Files:**
- Create: `src/services/blogService.ts`
- Test: `src/services/__tests__/blogService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/blogService.test.ts`:

```ts
// Supabase mock. from() exposes select/update/delete chains:
//   .select('*').eq(col, val).order(...)        -> listBlogPosts  (resolves { data, error })
//   .select('*').eq('id', id).maybeSingle()     -> getBlogPost    (resolves { data, error })
//   .update({...}).eq('id', id)                 -> publish/unpublish (resolves { error })
//   .delete().eq('id', id)                      -> discardDraft   (resolves { error })
// functions.invoke -> generateBlog.
// `mock*` consts are referenced lazily inside the factory closures.
const mockInvoke = jest.fn();
const mockOrder = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ order: mockOrder, maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockDeleteEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));
const mockFrom = jest.fn((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => (mockInvoke as jest.Mock)(...args) },
    from: (table: string) => mockFrom(table),
  },
}));

import {
  generateBlog,
  listBlogPosts,
  getBlogPost,
  publishPost,
  discardDraft,
  unpublish,
} from '../blogService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateBlog', () => {
  it('invokes generate-blog and returns the new post id', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { id: 'post-1' }, error: null });

    const id = await generateBlog('trip-1', 'user-1');

    expect(mockInvoke).toHaveBeenCalledWith('generate-blog', {
      body: { trip_id: 'trip-1', user_id: 'user-1' },
    });
    expect(id).toBe('post-1');
  });

  it('returns null when the function errors', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    expect(await generateBlog('trip-1', 'user-1')).toBeNull();
  });
});

describe('listBlogPosts', () => {
  it('selects the user rows newest first', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null });

    const rows = await listBlogPosts('user-1');

    expect(mockFrom).toHaveBeenCalledWith('blog_posts');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockSelectEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rows).toHaveLength(2);
  });

  it('throws when the query errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('db') });
    await expect(listBlogPosts('user-1')).rejects.toThrow('db');
  });
});

describe('getBlogPost', () => {
  it('returns a single row by id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'post-1' }, error: null });

    const row = await getBlogPost('post-1');

    expect(mockSelectEq).toHaveBeenCalledWith('id', 'post-1');
    expect(row).toEqual({ id: 'post-1' });
  });
});

describe('publishPost', () => {
  it('sets status published and a published_at timestamp', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await publishPost('post-1');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = mockUpdate.mock.calls[0][0];
    expect(patch.status).toBe('published');
    expect(typeof patch.published_at).toBe('string');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'post-1');
  });
});

describe('unpublish', () => {
  it('reverts to draft and clears published_at', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await unpublish('post-1');

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'draft', published_at: null });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'post-1');
  });
});

describe('discardDraft', () => {
  it('deletes the row by id', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: null });

    await discardDraft('post-1');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('throws when the delete errors', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: new Error('nope') });
    await expect(discardDraft('post-1')).rejects.toThrow('nope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/__tests__/blogService.test.ts`
Expected: FAIL — `Cannot find module '../blogService'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/services/blogService.ts`:

```ts
import { supabase } from '../lib/supabase';
import type { BlogPost } from './blogHelpers';

/**
 * Kicks off generation via the generate-blog edge function. The function inserts
 * a `generating` row and returns its id immediately; the heavy Claude work runs
 * in the background and flips the row to `draft` (surfaced live via Realtime).
 * Returns the new post id, or null if the invoke failed.
 */
export async function generateBlog(tripId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('generate-blog', {
    body: { trip_id: tripId, user_id: userId },
  });
  if (error || !data) return null;
  return (data as { id?: string }).id ?? null;
}

export async function listBlogPosts(userId: string): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as BlogPost | null;
}

export async function publishPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_posts')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function unpublish(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_posts')
    .update({ status: 'draft', published_at: null })
    .eq('id', id);

  if (error) throw error;
}

export async function discardDraft(id: string): Promise<void> {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/__tests__/blogService.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/services/blogService.ts src/services/__tests__/blogService.test.ts
git commit -m "feat(phase-9): blogService (generate/list/get/publish/unpublish/discard)"
```

---

## Task 7: Edge function `generate-blog` (Deno, service role)

**Files:**
- Create: `supabase/functions/generate-blog/index.ts`

> Not unit-tested (consistent with `detect-intent` / `tag-note`); smoke-tested via MCP after deploy. The project `tsconfig` excludes `supabase/functions` (those use Deno URL imports), so `npx tsc --noEmit` does not type-check this file — do not worry about Deno globals failing the project typecheck.

- [ ] **Step 1: Write the edge function**

Create `supabase/functions/generate-blog/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Supabase injects EdgeRuntime; declare it so the editor doesn't complain.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SYSTEM_PROMPT = `You are a skilled travel writer. You turn a traveler's raw, timestamped notes
from a single trip into one polished, engaging blog post in clear, warm, first-person travel-writing
voice. You never invent places, food, or events that are not supported by the notes.

Write the post as Markdown with this structure:
- An evocative opening paragraph that sets the scene.
- The narrative body, organized by city (and roughly by day where the timestamps make that natural),
  weaving the notes into flowing prose — not a bullet list.
- Inline photos: when a note has photo URLs, place them with Markdown image syntax on their own line,
  e.g. ![short caption](THE_EXACT_URL). Use ONLY URLs that appear in the provided notes, copied exactly.
- A "## Places" section near the end that groups the named places by their category
  (Food, Stay, Activity, Shopping, To-Visit), as a short list under each heading that appears.
- A brief closing paragraph.

Respond with ONLY valid JSON — no markdown fences, no commentary:
{"title": string, "content_markdown": string, "cover_photo_url": string | null, "selected_photo_urls": string[]}

- title: a short, evocative title for the trip.
- content_markdown: the full post described above.
- cover_photo_url: the single best hero photo URL from the notes, or null if the trip has no photos.
- selected_photo_urls: every photo URL you actually used inline (may be empty).`;

type NoteRow = {
  content: string;
  category: string | null;
  place_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  photo_urls: string[] | null;
};

function buildUserPrompt(
  trip: { name: string; destinations: string[] } | null,
  notes: NoteRow[],
): string {
  const allPhotos = notes.flatMap((n) => n.photo_urls ?? []);
  const lines: string[] = [];
  lines.push(`Trip name: ${trip?.name ?? 'Untitled trip'}`);
  if (trip?.destinations?.length) lines.push(`Destinations: ${trip.destinations.join(', ')}`);
  lines.push('');
  lines.push('Notes (chronological):');
  notes.forEach((n, i) => {
    const meta = [
      n.created_at,
      n.city ? `city: ${n.city}` : '',
      n.place_name ? `place: ${n.place_name}` : '',
      n.category ? `category: ${n.category}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    lines.push(`${i + 1}. [${meta}] ${n.content}`);
    for (const url of n.photo_urls ?? []) lines.push(`   photo: ${url}`);
  });
  lines.push('');
  lines.push(
    allPhotos.length
      ? `Available photo URLs (use only these, copied exactly):\n${allPhotos.join('\n')}`
      : 'This trip has no photos. Use null for cover_photo_url and [] for selected_photo_urls.',
  );
  return lines.join('\n');
}

// deno-lint-ignore no-explicit-any
async function generate(admin: any, postId: string, tripId: string) {
  try {
    const { data: trip } = await admin
      .from('trips')
      .select('name, destinations')
      .eq('id', tripId)
      .single();

    const { data: notes } = await admin
      .from('notes')
      .select('content, category, place_name, city, lat, lng, created_at, photo_urls')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    const noteRows: NoteRow[] = notes ?? [];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(trip, noteRows) }],
      }),
    });

    if (!response.ok) throw new Error(`claude_error_${response.status}`);

    const claudeData = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const rawText = claudeData.content?.[0]?.text ?? '';
    const jsonText = (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText).trim();
    const parsed = JSON.parse(jsonText);

    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : (trip?.name ?? 'Untitled Trip');
    const content_markdown = typeof parsed.content_markdown === 'string' ? parsed.content_markdown : '';
    const cover_photo_url = typeof parsed.cover_photo_url === 'string' ? parsed.cover_photo_url : null;
    const selected_photo_urls = Array.isArray(parsed.selected_photo_urls)
      ? parsed.selected_photo_urls.filter((u: unknown) => typeof u === 'string')
      : [];

    if (content_markdown.trim().length === 0) throw new Error('empty_content');

    await admin
      .from('blog_posts')
      .update({ status: 'draft', title, content_markdown, cover_photo_url, selected_photo_urls })
      .eq('id', postId);
  } catch (e) {
    await admin
      .from('blog_posts')
      .update({ status: 'error', error_message: String((e as Error)?.message ?? e) })
      .eq('id', postId);
  }
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const { trip_id, user_id } = (await req.json()) as { trip_id?: string; user_id?: string };
  if (!trip_id || !user_id) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: JSON_HEADERS });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // One active post per trip: drop any prior non-published row before inserting
  // the fresh generating row (the partial unique index would otherwise reject it).
  await admin.from('blog_posts').delete().eq('trip_id', trip_id).neq('status', 'published');

  const { data: inserted, error: insertError } = await admin
    .from('blog_posts')
    .insert({ user_id, trip_id, status: 'generating' })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return new Response(JSON.stringify({ error: 'insert_failed' }), { status: 500, headers: JSON_HEADERS });
  }

  const postId = inserted.id as string;

  // Heavy work continues after the response so the client isn't blocked ~60s.
  EdgeRuntime.waitUntil(generate(admin, postId, trip_id));

  return new Response(JSON.stringify({ id: postId }), { headers: JSON_HEADERS });
});
```

- [ ] **Step 2: Deploy the function**

Use the Supabase MCP `deploy_edge_function` tool with `project_id: "dcejrbyujfcxartywpis"`, `name: "generate-blog"`, and the file contents above.

Expected: deploy succeeds.

- [ ] **Step 3: Confirm the secret is present**

The function relies on `ANTHROPIC_API_KEY` (already set for `tag-note`/`detect-intent`) plus the auto-injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. No new secret needed. (If deploy reports a missing secret, set `ANTHROPIC_API_KEY` via the Supabase dashboard before smoke testing.)

- [ ] **Step 4: Smoke test against a real completed trip**

Find a completed trip with notes:

```sql
select t.id, t.name, count(n.id) as notes
from public.trips t join public.notes n on n.trip_id = t.id
where t.status = 'completed'
group by t.id, t.name
order by notes desc
limit 5;
```

Then invoke the function (substitute a real `trip_id` and that trip's `user_id`). Use the Supabase MCP / a curl with the project anon key + a valid user JWT, or invoke from the app in Step (manual). After ~60s, verify the row landed:

```sql
select id, status, title, cover_photo_url, array_length(selected_photo_urls, 1) as photos, error_message
from public.blog_posts order by created_at desc limit 3;
```

Expected: the newest row transitions `generating → draft` with a non-empty `title` and `content_markdown` (or `status = 'error'` with a populated `error_message` — which is still correct behavior, retriable from the UI).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-blog/index.ts
git commit -m "feat(phase-9): generate-blog edge function (service role, background generation)"
```

---

## Task 8: New deps + `BlogPost` navigation route

**Files:**
- Modify: `package.json` (+ `ios/` via pods)
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/MainStack.tsx`

- [ ] **Step 1: Install the three new dependencies**

Run: `npx expo install react-native-markdown-display expo-sharing expo-file-system`
Expected: all three added to `package.json` dependencies.

- [ ] **Step 2: Rebuild iOS pods (native modules: expo-sharing, expo-file-system)**

Run: `npm run pods`
Expected: pod install completes and the pbxproj patch script runs without error.

- [ ] **Step 3: Add the `BlogPost` route to the param list**

In `src/navigation/types.ts`, change `MainStackParamList`:

```ts
export type MainStackParamList = {
  Tabs: undefined;
  TripDetail: { tripId: string };
  BlogPost: { postId: string };
};
```

- [ ] **Step 4: Register the screen on the stack**

In `src/navigation/MainStack.tsx`, add the import after the `TripDetailScreen` import (line 9):

```ts
import BlogPostScreen from '../screens/blog/BlogPostScreen';
```

And add the screen after the `TripDetail` `<Stack.Screen>` (after line 63):

```tsx
        <Stack.Screen
          name="BlogPost"
          component={BlogPostScreen}
          options={{ title: '', headerBackTitle: 'Back' }}
        />
```

> This import will not resolve until Task 11 creates `BlogPostScreen`. To keep the tree compiling between tasks, create a temporary stub now and replace it in Task 11:

Create `src/screens/blog/BlogPostScreen.tsx` (temporary stub — fully implemented in Task 11):

```tsx
import { View, Text } from 'react-native';

export default function BlogPostScreen() {
  return (
    <View>
      <Text>Blog post</Text>
    </View>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json ios src/navigation/types.ts src/navigation/MainStack.tsx src/screens/blog/BlogPostScreen.tsx
git commit -m "feat(phase-9): add markdown/sharing/file-system deps + BlogPost route (stub screen)"
```

---

## Task 9: `useBlogPosts` Realtime hook

**Files:**
- Create: `src/hooks/useBlogPosts.ts`

> No unit test (consistent with the other Realtime hooks `useTrips`/`useNotes`, which are not unit-tested). Verified via the full suite + tsc and on-device QA.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useBlogPosts.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listBlogPosts } from '../services/blogService';
import type { BlogPost } from '../services/blogHelpers';

type State = {
  posts: BlogPost[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useBlogPosts(userId: string | undefined): State {
  // Per-instance random suffix avoids the Phase 3 channel-collision gotcha.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listBlogPosts(userId);
      setPosts(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`blog_posts:${userId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blog_posts', filter: `user_id=eq.${userId}` },
        (payload) => {
          setPosts((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as BlogPost;
              if (prev.some((p) => p.id === next.id)) return prev;
              return [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as BlogPost;
              return prev.map((p) => (p.id === next.id ? next : p));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<BlogPost>;
              return prev.filter((p) => p.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId]);

  return { posts, loading, error, refresh };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/hooks/useBlogPosts.ts
git commit -m "feat(phase-9): useBlogPosts realtime hook"
```

---

## Task 10: `BlogPostCard` component

**Files:**
- Create: `src/components/BlogPostCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/BlogPostCard.tsx`:

```tsx
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../theme';
import { statusLabel, formatBlogDate, type BlogPost } from '../services/blogHelpers';

type Props = {
  post: BlogPost;
  onPress: () => void;
};

function statusColor(status: BlogPost['status']): string {
  if (status === 'error') return Colors.error;
  if (status === 'published') return Colors.stay; // green
  return Colors.textSecondary;
}

export default function BlogPostCard({ post, onPress }: Props) {
  const date = post.published_at ?? post.created_at;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      {post.cover_photo_url ? (
        <Image source={{ uri: post.cover_photo_url }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title ?? 'Untitled'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.status, { color: statusColor(post.status) }]}>
            {statusLabel(post.status)}
          </Text>
          <Text style={styles.date}>{formatBlogDate(date)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Shadows.card,
  },
  pressed: { opacity: 0.85 },
  cover: { width: 96, height: 96 },
  coverFallback: { backgroundColor: Colors.border },
  body: { flex: 1, padding: Spacing.md, justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  status: { fontSize: 12, fontWeight: '700' },
  date: { fontSize: 12, color: Colors.textSecondary },
});
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/components/BlogPostCard.tsx
git commit -m "feat(phase-9): BlogPostCard component"
```

---

## Task 11: `BlogPostScreen` (status-driven, read-only, + export)

**Files:**
- Replace: `src/screens/blog/BlogPostScreen.tsx` (replaces the Task 8 stub)

- [ ] **Step 1: Write the screen**

Replace the contents of `src/screens/blog/BlogPostScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../navigation/types';
import { Colors, Spacing, BorderRadius } from '../../theme';
import { getBlogPost, publishPost, unpublish, discardDraft } from '../../services/blogService';
import { markdownToHtml, statusLabel, type BlogPost } from '../../services/blogHelpers';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<MainStackParamList, 'BlogPost'>;

export default function BlogPostScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const row = await getBlogPost(postId);
    setPost(row);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live updates so a 'generating' post flips to 'draft' on this screen too.
  useEffect(() => {
    const channel = supabase
      .channel(`blog_post:${postId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blog_posts', filter: `id=eq.${postId}` },
        (payload) => setPost(payload.new as BlogPost),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [postId]);

  const handlePublish = async () => {
    setBusy(true);
    try {
      await publishPost(postId);
      await load();
    } catch (e) {
      Alert.alert('Could not publish', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnpublish = async () => {
    setBusy(true);
    try {
      await unpublish(postId);
      await load();
    } catch (e) {
      Alert.alert('Could not unpublish', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert('Discard draft?', 'This permanently deletes the draft.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await discardDraft(postId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not discard', (e as Error).message);
          }
        },
      },
    ]);
  };

  const handleExport = () => {
    if (!post?.content_markdown) return;
    Alert.alert('Export', 'Choose a format', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Markdown', onPress: () => exportMarkdown(post) },
      { text: 'HTML', onPress: () => exportHtml(post) },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This post is no longer available.</Text>
      </View>
    );
  }

  if (post.status === 'generating') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
        <Text style={styles.muted}>Writing your story… this takes about a minute.</Text>
      </View>
    );
  }

  if (post.status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Generation failed</Text>
        <Text style={styles.muted}>{post.error_message ?? 'Something went wrong.'}</Text>
        <Text style={styles.muted}>Open the trip and tap Generate Blog to try again.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {post.cover_photo_url ? (
          <Image source={{ uri: post.cover_photo_url }} style={styles.hero} />
        ) : null}
        <View style={styles.content}>
          <Text style={styles.statusPill}>{statusLabel(post.status)}</Text>
          <Text style={styles.title}>{post.title ?? 'Untitled'}</Text>
          <Markdown style={markdownStyles}>{post.content_markdown ?? ''}</Markdown>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {post.status === 'draft' ? (
          <>
            <Pressable
              style={[styles.primaryButton, busy && styles.disabled]}
              onPress={handlePublish}
              disabled={busy}
            >
              <Text style={styles.primaryLabel}>Publish</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleExport}>
              <Text style={styles.secondaryLabel}>Export</Text>
            </Pressable>
            <Pressable style={styles.destructiveButton} onPress={handleDiscard}>
              <Text style={styles.destructiveLabel}>Discard</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.secondaryButton, busy && styles.disabled]}
              onPress={handleUnpublish}
              disabled={busy}
            >
              <Text style={styles.secondaryLabel}>Unpublish</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleExport}>
              <Text style={styles.secondaryLabel}>Export</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

async function exportMarkdown(post: BlogPost) {
  try {
    await Share.share({ message: post.content_markdown ?? '' });
  } catch (e) {
    Alert.alert('Could not export', (e as Error).message);
  }
}

async function exportHtml(post: BlogPost) {
  try {
    const html = markdownToHtml(post.content_markdown ?? '');
    const safeName = (post.title ?? 'post').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const uri = `${FileSystem.cacheDirectory}${safeName}.html`;
    await FileSystem.writeAsStringAsync(uri, html);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'text/html', UTI: 'public.html' });
    } else {
      Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
    }
  } catch (e) {
    Alert.alert('Could not export', (e as Error).message);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  muted: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.error },
  scroll: { paddingBottom: Spacing.xl },
  hero: { width: '100%', height: 240 },
  content: { padding: Spacing.md },
  statusPill: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.background,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  secondaryButton: {
    flex: 1,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  destructiveButton: {
    flex: 1,
    borderColor: Colors.error,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  destructiveLabel: { fontSize: 15, fontWeight: '700', color: Colors.error },
  disabled: { opacity: 0.5 },
});

const markdownStyles = {
  body: { color: Colors.textPrimary, fontSize: 16, lineHeight: 26 },
  heading1: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: Spacing.md },
  heading2: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: Spacing.md },
  heading3: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: Spacing.sm },
  image: { borderRadius: BorderRadius.card, marginVertical: Spacing.sm },
  paragraph: { marginTop: 0, marginBottom: Spacing.sm },
} as const;
```

> `react-native-markdown-display` ships its own TypeScript types. If `npx tsc --noEmit` complains that the `style` prop type rejects `markdownStyles`, cast it: `style={markdownStyles as any}` with a `// eslint-disable-next-line` — but try without the cast first.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/blog/BlogPostScreen.tsx
git commit -m "feat(phase-9): BlogPostScreen — read-only post, publish/unpublish/discard/export"
```

---

## Task 12: `BlogScreen` rewrite (Drafts/Published + completed-trip picker)

**Files:**
- Replace: `src/screens/BlogScreen.tsx`

- [ ] **Step 1: Write the screen**

Replace the contents of `src/screens/BlogScreen.tsx`:

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../navigation/types';
import { Colors, Spacing, Typography, BorderRadius } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { useTrips } from '../hooks/useTrips';
import { splitByStatus, formatDateRange } from '../services/tripHelpers';
import { generateBlog } from '../services/blogService';
import BlogPostCard from '../components/BlogPostCard';

type Nav = NativeStackNavigationProp<MainStackParamList, 'Tabs'>;

export default function BlogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { posts, loading } = useBlogPosts(userId);
  const { trips } = useTrips(userId);
  const completed = splitByStatus(trips).completed;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const drafts = posts.filter((p) => p.status !== 'published');
  const published = posts.filter((p) => p.status === 'published');

  const openPost = (postId: string) => navigation.navigate('BlogPost', { postId });

  const handlePickTrip = async (tripId: string) => {
    if (!userId) return;
    setPickerOpen(false);
    setGenerating(true);
    try {
      const id = await generateBlog(tripId, userId);
      if (id) {
        openPost(id);
      } else {
        Alert.alert('Could not start generation', 'Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePress = () => {
    if (completed.length === 0) {
      Alert.alert('No completed trips', 'End a trip first, then generate its blog.');
      return;
    }
    setPickerOpen(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>BLOG</Text>
        <Text style={styles.heading}>Your Stories</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>DRAFTS</Text>
            {drafts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No drafts yet</Text>
              </View>
            ) : (
              drafts.map((p) => <BlogPostCard key={p.id} post={p} onPress={() => openPost(p.id)} />)
            )}

            <Text style={styles.sectionLabel}>PUBLISHED</Text>
            {published.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>Nothing published yet</Text>
              </View>
            ) : (
              published.map((p) => (
                <BlogPostCard key={p.id} post={p} onPress={() => openPost(p.id)} />
              ))
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable
          style={[styles.generateButton, generating && styles.disabled]}
          onPress={handleGeneratePress}
          disabled={generating}
        >
          <Text style={styles.generateButtonLabel}>
            {generating ? 'Starting…' : 'Generate Blog'}
          </Text>
        </Pressable>
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Choose a completed trip</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {completed.map((t) => (
                <Pressable key={t.id} style={styles.tripRow} onPress={() => handlePickTrip(t.id)}>
                  <Text style={styles.tripName}>{t.name}</Text>
                  <Text style={styles.tripDates}>{formatDateRange(t.start_date, t.end_date)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: Colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heading: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sectionLabel: {
    ...Typography.label,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 14, color: '#555555' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  generateButton: {
    backgroundColor: Colors.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.button,
    alignItems: 'center',
  },
  generateButtonLabel: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  disabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.sheet,
    borderTopRightRadius: BorderRadius.sheet,
    padding: Spacing.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  tripRow: {
    paddingVertical: Spacing.md,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tripName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  tripDates: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/BlogScreen.tsx
git commit -m "feat(phase-9): BlogScreen — drafts/published lists + completed-trip picker"
```

---

## Task 13: Wire `TripDetailScreen` "Generate Blog" button

**Files:**
- Modify: `src/screens/trip/TripDetailScreen.tsx`

The button already renders only for non-active (completed) trips (`trip.status === 'active' ? End : Generate`, lines 94-102). Replace the stub `handleGenerateBlog` with a real call that generates and navigates.

- [ ] **Step 1: Add navigation + auth + service imports**

In `src/screens/trip/TripDetailScreen.tsx`, the `Props` already provides `navigation`. Update the component signature (line 18) and add imports.

Add after the existing imports (after line 12 `import TripMapScreen ...`):

```ts
import { useAuth } from '../../contexts/AuthContext';
import { generateBlog } from '../../services/blogService';
```

Change the component signature (line 18) from:

```tsx
export default function TripDetailScreen({ route }: Props) {
```

to:

```tsx
export default function TripDetailScreen({ route, navigation }: Props) {
```

- [ ] **Step 2: Add auth + generating state**

Immediately after `const [ending, setEnding] = useState(false);` (line 22), add:

```tsx
  const { session } = useAuth();
  const [generatingBlog, setGeneratingBlog] = useState(false);
```

- [ ] **Step 3: Replace the stub handler**

Replace the whole `handleGenerateBlog` function (lines 69-71):

```tsx
  const handleGenerateBlog = async () => {
    const userId = session?.user.id;
    if (!userId) return;
    setGeneratingBlog(true);
    try {
      const postId = await generateBlog(trip.id, userId);
      if (postId) {
        navigation.navigate('BlogPost', { postId });
      } else {
        Alert.alert('Could not start generation', 'Please try again.');
      }
    } finally {
      setGeneratingBlog(false);
    }
  };
```

- [ ] **Step 4: Reflect the generating state on the button**

Replace the completed-trip button branch (lines 98-102):

```tsx
            ) : (
              <Pressable
                style={styles.generateButton}
                onPress={handleGenerateBlog}
                disabled={generatingBlog}
              >
                <Text style={styles.generateButtonLabel}>
                  {generatingBlog ? 'Starting…' : 'Generate Blog'}
                </Text>
              </Pressable>
            )}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/trip/TripDetailScreen.tsx
git commit -m "feat(phase-9): TripDetail Generate Blog button -> generate + navigate"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx jest`
Expected: all suites pass, including the new `blogHelpers` and `blogService` tests; no regressions.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Manual on-device QA checklist (document results; do not auto-check if unable to run a device)**

- End an active trip with several notes (some with photos) → it moves to completed.
- On Trip Detail, tap **Generate Blog** → routed to a generating post; within ~60s it flips to a draft with a title, narrative, inline photos, and a Places section.
- The Blog tab shows the same draft card live (Realtime), under DRAFTS.
- Open the draft → **Publish** moves it to PUBLISHED; **Unpublish** moves it back.
- **Export → Markdown** opens the share sheet with raw markdown; **Export → HTML** opens the share sheet with an `.html` file.
- **Discard** on a draft deletes it and pops back.
- Generating again for the same trip replaces the prior non-published draft (no duplicates).

- [ ] **Step 4: Update progress docs**

Update `docs/progress.md` to mark Phase 9 code-complete (on-device QA pending), mirroring the Phase 8 entry style. Update the spec status line in `docs/superpowers/specs/2026-05-28-phase-9-blog-generation-design.md` from "Approved design — pending implementation plan" to reference this plan / code-complete.

- [ ] **Step 5: Commit**

```bash
git add docs/progress.md docs/superpowers/specs/2026-05-28-phase-9-blog-generation-design.md
git commit -m "docs: Phase 9 (Blog Generation) code complete; on-device QA pending"
```

---

## Self-Review

**Spec coverage:**
- Pure helpers `collectPlaces` / `validateBlogResult` / `markdownToHtml` / formatters → Tasks 2-5. ✓
- `blogService` (generate/list/get/publish/discard/unpublish) → Task 6. ✓
- Edge function (insert generating row, return id, `EdgeRuntime.waitUntil`, load trip+notes, Claude `claude-sonnet-4-6`, fence-strip+parse, draft/error) → Task 7. ✓
- Migration `008_blog_posts.sql` (columns, RLS, updated_at trigger, partial unique index, Realtime) → Task 1. ✓
- `useBlogPosts` Realtime hook (per-instance suffix) → Task 9. ✓
- `BlogScreen` rewrite (Drafts/Published + completed-trip picker) → Task 12. ✓
- `TripDetailScreen` button (completed trips only) → Task 13 (gating already present). ✓
- `BlogPostScreen` (status-driven read-only + publish/unpublish/discard/export) → Task 11. ✓
- `BlogPostCard` → Task 10. ✓
- Markdown rendering dep + export (Share for MD, file-system + sharing for HTML) → Tasks 8, 11. ✓
- `BlogPost` route on MainStack → Task 8. ✓
- Testing (TDD helpers, mocked service, edge fn smoke only, full Jest + tsc green) → Tasks 2-6, 7, 14. ✓
- Out-of-scope items (web URL, community, style onboarding, photo-override, push) → intentionally not built. ✓
- Itinerary is post-MVP → intentionally not built. ✓

**Type consistency:** `BlogPost`, `BlogStatus`, `BlogResult`, `Place` defined once in `blogHelpers` (Task 2) and imported everywhere. Service method names (`generateBlog`, `listBlogPosts`, `getBlogPost`, `publishPost`, `unpublish`, `discardDraft`) match between Task 6 definition and all callers (Tasks 9, 11, 12, 13). Edge function response shape `{ id }` matches `generateBlog`'s reader. ✓

**Placeholder scan:** every code step contains complete code; commands have expected output. No TBD/TODO. ✓
