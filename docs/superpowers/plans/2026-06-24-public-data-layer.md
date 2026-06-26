# Public Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a trip flips to `completed`, fold its visited places (food/stay/activity/shopping) into an anonymized, public-read `public_places` aggregate, idempotently and add-only.

**Architecture:** Pure logic lives in Postgres. A `SECURITY DEFINER` trigger on `trips` (fired only on `active → completed`) calls an aggregation function that upserts into `public_places` and records a contribution per note in a private `public_place_contributions` ledger. The ledger's unique `note_id` guarantees a note is counted at most once. No JS/TS logic in this layer — only regenerated DB types.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Supabase MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`) against project id **`dcejrbyujfcxartywpis`**. TypeScript types in `src/lib/database.types.ts`. JS tests via `npx jest`, types via `npx tsc --noEmit`.

## Spec

`docs/superpowers/specs/2026-06-24-public-data-layer-design.md`

## Conventions for this plan

- **Migrations** are new files in `supabase/migrations/`. Next free number is **017**. Apply each via Supabase MCP `apply_migration({ project_id: 'dcejrbyujfcxartywpis', name, query })`, then **also** keep the `.sql` file in the repo and commit it (matches the existing migration set 001–016).
- **SQL tests** are committed under `supabase/tests/` and run by passing their contents to Supabase MCP `execute_sql({ project_id: 'dcejrbyujfcxartywpis', query })`. There is no automated SQL runner; "run the test" = execute the script and read the result.
- **TDD for SQL:** the "failing test" is running the test script *before* the migration exists and seeing the relation/function error; the "passing test" is re-running it after applying the migration and seeing all assertions return true (or no exception).
- All `SECURITY DEFINER` functions set `search_path = public` (matches `handle_new_user` in `002_profiles.sql` and `set_updated_at` in `003_trips.sql`).

## File Structure

- Create `supabase/migrations/017_public_places.sql` — `public_places` table, indexes, RLS (public read only), `updated_at` trigger.
- Create `supabase/migrations/018_public_place_contributions.sql` — private ledger table, RLS locked (no policies).
- Create `supabase/migrations/019_profiles_contribute_optout.sql` — `profiles.contribute_to_community` column.
- Create `supabase/migrations/020_place_text_functions.sql` — `normalize_place_text`, `build_place_key`, `pick_dominant_category` (pure `immutable` functions).
- Create `supabase/migrations/021_community_aggregate.sql` — `aggregate_trip_for_community` + `trips_community_aggregate` trigger function + the trigger.
- Create `supabase/tests/public_places_functions.sql` — unit asserts for the pure functions.
- Create `supabase/tests/public_places_aggregate.sql` — rolled-back integration scenarios.
- Modify `src/lib/database.types.ts` — regenerated (Task 7).

---

### Task 1: `public_places` table

**Files:**
- Create: `supabase/migrations/017_public_places.sql`

- [ ] **Step 1: Write the failing test**

Run via `execute_sql`:

```sql
select count(*) from public.public_places;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: error `relation "public.public_places" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/017_public_places.sql`:

```sql
-- public_places: anonymized, public-read aggregate of visited places.
-- Holds NO user_id, NO visit timestamps, NO note prose — only place identity,
-- averaged coordinates, popularity + rating counts, and a category tally.
-- Written ONLY by the SECURITY DEFINER aggregate function (migration 021);
-- clients can read but never write.
create table public.public_places (
  id uuid primary key default gen_random_uuid(),

  -- dedupe identity: normalize(place_name) || '|' || normalize(coalesce(city,''))
  place_key text not null unique,
  place_name text not null,
  city text,

  -- running-average coordinates (null until a contribution carries coords)
  lat double precision,
  lng double precision,
  coord_count integer not null default 0 check (coord_count >= 0),

  visit_count integer not null default 0 check (visit_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),

  -- per-category tally, e.g. {"food":3,"activity":1}; dominant_category derived from it
  category_counts jsonb not null default '{}'::jsonb,
  dominant_category text
    check (dominant_category is null
           or dominant_category in ('food','stay','activity','shopping')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Explore reads sort by popularity and filter by city.
create index public_places_visit_count_idx on public.public_places (visit_count desc);
create index public_places_city_idx on public.public_places (city);

-- reuse the hardened set_updated_at function (defined in migration 003)
create trigger public_places_set_updated_at
  before update on public.public_places
  for each row execute function public.set_updated_at();

-- RLS: public read for everyone (incl. anon). NO write policies — only the
-- SECURITY DEFINER aggregate function (runs as table owner, bypassing RLS) writes.
alter table public.public_places enable row level security;

create policy "public_places_select_all"
  on public.public_places
  for select
  using (true);
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ project_id: 'dcejrbyujfcxartywpis', name: '017_public_places', query: <file contents> })`.
Re-run the Step 1 query via `execute_sql`. Expected: returns `0` (no error).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/017_public_places.sql
git commit -m "feat(db): public_places aggregate table (public data layer)"
```

---

### Task 2: `public_place_contributions` ledger

**Files:**
- Create: `supabase/migrations/018_public_place_contributions.sql`

- [ ] **Step 1: Write the failing test**

Run via `execute_sql`:

```sql
select count(*) from public.public_place_contributions;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: error `relation "public.public_place_contributions" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/018_public_place_contributions.sql`:

```sql
-- public_place_contributions: PRIVATE idempotency ledger. One row per note that
-- has contributed to a public place. The unique note_id guarantees a note is
-- counted at most once across trip re-completions. Never publicly readable — it
-- links user-owned notes to public places. Only the SECURITY DEFINER aggregate
-- function (migration 021) touches it.
create table public.public_place_contributions (
  id uuid primary key default gen_random_uuid(),
  public_place_id uuid not null references public.public_places (id) on delete cascade,
  -- unique = the idempotency guard. on delete cascade: if a note is deleted its
  -- ledger row goes too, but public_places counts are NOT decremented (add-only V1).
  note_id uuid not null unique references public.notes (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  rating smallint check (rating is null or rating between 1 and 5),
  category text,
  created_at timestamptz not null default now()
);

create index public_place_contributions_place_idx
  on public.public_place_contributions (public_place_id);

-- RLS on, INTENTIONALLY no policies: fully locked to anon/authenticated. The
-- SECURITY DEFINER aggregate function (runs as table owner) bypasses RLS.
alter table public.public_place_contributions enable row level security;
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ ..., name: '018_public_place_contributions', query: <file contents> })`.
Re-run Step 1. Expected: returns `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_public_place_contributions.sql
git commit -m "feat(db): public_place_contributions ledger (private, idempotency guard)"
```

---

### Task 3: `profiles` opt-out column

**Files:**
- Create: `supabase/migrations/019_profiles_contribute_optout.sql`

- [ ] **Step 1: Write the failing test**

Run via `execute_sql`:

```sql
select contribute_to_community from public.profiles limit 1;
```

- [ ] **Step 2: Run it to verify it fails**

Expected: error `column "contribute_to_community" does not exist` (the query may return 0 rows if `profiles` is empty, but the column reference must error first).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/019_profiles_contribute_optout.sql`:

```sql
-- Global opt-out for the community map, default ON
-- ("Contribute my places to the community map"). Checked at aggregation time.
alter table public.profiles
  add column contribute_to_community boolean not null default true;
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ ..., name: '019_profiles_contribute_optout', query: <file contents> })`.
Re-run Step 1. Expected: no error (returns `true` or 0 rows).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/019_profiles_contribute_optout.sql
git commit -m "feat(db): profiles.contribute_to_community opt-out column"
```

---

### Task 4: Pure place-text functions

**Files:**
- Create: `supabase/migrations/020_place_text_functions.sql`
- Test: `supabase/tests/public_places_functions.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/public_places_functions.sql`:

```sql
-- Pure-function unit tests. Run via execute_sql; every column must be true.
select
  public.normalize_place_text('  Tartine   Bakery ') = 'tartine bakery'        as norm_trim_collapse,
  public.normalize_place_text(null) = ''                                        as norm_null_to_empty,
  public.build_place_key('Blue Bottle', 'San Francisco') = 'blue bottle|san francisco' as key_with_city,
  public.build_place_key('Blue Bottle', null) = 'blue bottle|'                  as key_null_city,
  public.pick_dominant_category('{"food":3,"activity":1}'::jsonb) = 'food'      as dom_max,
  public.pick_dominant_category('{"food":1,"activity":1}'::jsonb) = 'activity'  as dom_tie_alpha,
  public.pick_dominant_category('{}'::jsonb) is null                            as dom_empty_null;
```

- [ ] **Step 2: Run it to verify it fails**

Run the file contents via `execute_sql`. Expected: error `function public.normalize_place_text(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/020_place_text_functions.sql`:

```sql
-- Pure helpers used by the aggregate function (migration 021) AND directly by
-- tests. Single source of truth for place identity + dominant-category logic.

-- lowercase, trim, collapse internal whitespace; null -> ''
create or replace function public.normalize_place_text(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(btrim(lower(coalesce(t, ''))), '\s+', ' ', 'g');
$$;

-- dedupe identity: normalized name + '|' + normalized city
create or replace function public.build_place_key(place_name text, city text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.normalize_place_text(place_name) || '|' || public.normalize_place_text(city);
$$;

-- key with the highest count; ties broken by category name ascending (deterministic).
-- returns null for an empty tally.
create or replace function public.pick_dominant_category(category_counts jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select e.key
  from jsonb_each_text(category_counts) as e(key, val)
  order by e.val::int desc, e.key asc
  limit 1;
$$;
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ ..., name: '020_place_text_functions', query: <file contents> })`.
Re-run `supabase/tests/public_places_functions.sql` via `execute_sql`.
Expected: one row, every column `true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_place_text_functions.sql supabase/tests/public_places_functions.sql
git commit -m "feat(db): place-text + dominant-category SQL helpers with unit tests"
```

---

### Task 5: Aggregation function + trigger (happy path)

**Files:**
- Create: `supabase/migrations/021_community_aggregate.sql`
- Test: `supabase/tests/public_places_aggregate.sql`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/public_places_aggregate.sql`. This is a single rolled-back scenario; a failed assertion raises and aborts. Seed a throwaway user (the `on_auth_user_created` trigger auto-creates its profile), one trip, four notes (an eligible rated food note, an eligible unrated activity note, an excluded `general` note, an excluded `to-visit` note), complete the trip, then assert.

```sql
begin;
do $$
declare
  v_uid uuid;
  v_trip uuid;
  v_key text;
  v_visit int;
  v_rcount int;
  v_rsum int;
  v_dom text;
  v_rows int;
begin
  insert into auth.users (instance_id, id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
          'authenticated', 'authenticated', 'pubtest1@example.com',
          '', now(), now(), now())
  returning id into v_uid;

  insert into public.trips (id, user_id, name, status)
  values (gen_random_uuid(), v_uid, 'Test Trip', 'active')
  returning id into v_trip;

  -- eligible: rated food note with coords
  insert into public.notes (user_id, trip_id, content, category, place_name, city, lat, lng, rating, offline_id)
  values (v_uid, v_trip, 'n1', 'food', 'Tartine Bakery', 'San Francisco', 37.0, -122.0, 5, gen_random_uuid());
  -- eligible: unrated activity note, no coords
  insert into public.notes (user_id, trip_id, content, category, place_name, city, rating, offline_id)
  values (v_uid, v_trip, 'n2', 'activity', 'Dolores Park', 'San Francisco', null, gen_random_uuid());
  -- excluded: general
  insert into public.notes (user_id, trip_id, content, category, place_name, city, offline_id)
  values (v_uid, v_trip, 'n3', 'general', 'Some Street', 'San Francisco', gen_random_uuid());
  -- excluded: to-visit
  insert into public.notes (user_id, trip_id, content, category, place_name, city, offline_id)
  values (v_uid, v_trip, 'n4', 'to-visit', 'Future Cafe', 'San Francisco', gen_random_uuid());

  update public.trips set status = 'completed' where id = v_trip;

  -- food place: 1 visit, 1 rating sum 5, dominant food, coords folded
  v_key := public.build_place_key('Tartine Bakery', 'San Francisco');
  select visit_count, rating_count, rating_sum, dominant_category
    into v_visit, v_rcount, v_rsum, v_dom
    from public.public_places where place_key = v_key;
  if v_visit is distinct from 1 then raise exception 'food visit_count: got %', v_visit; end if;
  if v_rcount is distinct from 1 then raise exception 'food rating_count: got %', v_rcount; end if;
  if v_rsum is distinct from 5 then raise exception 'food rating_sum: got %', v_rsum; end if;
  if v_dom is distinct from 'food' then raise exception 'food dominant: got %', v_dom; end if;

  -- activity place: 1 visit, 0 ratings (unrated note bumps visit only), no coords
  select visit_count, rating_count, coord_count
    into v_visit, v_rcount, v_rows
    from public.public_places where place_key = public.build_place_key('Dolores Park', 'San Francisco');
  if v_visit is distinct from 1 then raise exception 'activity visit_count: got %', v_visit; end if;
  if v_rcount is distinct from 0 then raise exception 'activity rating_count: got %', v_rcount; end if;
  if v_rows is distinct from 0 then raise exception 'activity coord_count: got %', v_rows; end if;

  -- general + to-visit excluded entirely
  select count(*) into v_rows from public.public_places
    where place_key in (public.build_place_key('Some Street','San Francisco'),
                        public.build_place_key('Future Cafe','San Francisco'));
  if v_rows <> 0 then raise exception 'excluded categories leaked: % rows', v_rows; end if;

  -- one contribution per eligible note (2)
  select count(*) into v_rows from public.public_place_contributions where trip_id = v_trip;
  if v_rows <> 2 then raise exception 'expected 2 contributions, got %', v_rows; end if;

  raise notice 'TASK5 OK';
end $$;
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run the file contents via `execute_sql`. Expected: error mentioning that completing the trip does nothing because the trigger/function is missing — concretely, the first assertion raises `food visit_count: got <NULL>` (no `public_places` row was created). This confirms aggregation is not yet wired.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/021_community_aggregate.sql`:

```sql
-- Aggregate a completed trip's visited places into public_places, add-only and
-- idempotent. Eligible note = category in (food,stay,activity,shopping), non-empty
-- place_name, and not already in the contributions ledger. SECURITY DEFINER so it
-- can write the public/locked tables regardless of the caller's RLS.
create or replace function public.aggregate_trip_for_community(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_opted_in boolean;
  r record;
  v_key text;
  v_place_id uuid;
  v_counts jsonb;
  v_new_count int;
  v_has_coords boolean;
begin
  select user_id into v_user_id from public.trips where id = p_trip_id;
  if v_user_id is null then
    return;
  end if;

  select contribute_to_community into v_opted_in
  from public.profiles where id = v_user_id;
  if coalesce(v_opted_in, true) = false then
    return;  -- user opted out: contribute nothing
  end if;

  for r in
    select n.id, btrim(n.place_name) as place_name, n.city, n.lat, n.lng,
           n.category, n.rating
    from public.notes n
    where n.trip_id = p_trip_id
      and n.category in ('food','stay','activity','shopping')
      and n.place_name is not null
      and btrim(n.place_name) <> ''
      and not exists (
        select 1 from public.public_place_contributions c where c.note_id = n.id
      )
  loop
    v_key := public.build_place_key(r.place_name, r.city);
    v_has_coords := r.lat is not null and r.lng is not null;

    select id, category_counts into v_place_id, v_counts
    from public.public_places
    where place_key = v_key
    for update;

    if found then
      v_new_count := coalesce((v_counts ->> r.category)::int, 0) + 1;
      v_counts := jsonb_set(v_counts, array[r.category], to_jsonb(v_new_count));

      update public.public_places p set
        visit_count = p.visit_count + 1,
        rating_sum = p.rating_sum + coalesce(r.rating, 0),
        rating_count = p.rating_count + case when r.rating is not null then 1 else 0 end,
        lat = case
                when not v_has_coords then p.lat
                when p.coord_count = 0 then r.lat
                else (p.lat * p.coord_count + r.lat) / (p.coord_count + 1)
              end,
        lng = case
                when not v_has_coords then p.lng
                when p.coord_count = 0 then r.lng
                else (p.lng * p.coord_count + r.lng) / (p.coord_count + 1)
              end,
        coord_count = p.coord_count + case when v_has_coords then 1 else 0 end,
        category_counts = v_counts,
        dominant_category = public.pick_dominant_category(v_counts)
      where p.id = v_place_id;
    else
      insert into public.public_places (
        place_key, place_name, city,
        lat, lng, coord_count,
        visit_count, rating_sum, rating_count,
        category_counts, dominant_category
      )
      values (
        v_key, r.place_name, r.city,
        case when v_has_coords then r.lat else null end,
        case when v_has_coords then r.lng else null end,
        case when v_has_coords then 1 else 0 end,
        1,
        coalesce(r.rating, 0),
        case when r.rating is not null then 1 else 0 end,
        jsonb_build_object(r.category, 1),
        r.category
      )
      returning id into v_place_id;
    end if;

    insert into public.public_place_contributions (
      public_place_id, note_id, trip_id, rating, category
    )
    values (v_place_id, r.id, p_trip_id, r.rating, r.category);
  end loop;
end;
$$;

-- Trigger wrapper: fire aggregation only on the active -> completed transition.
create or replace function public.trips_community_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.aggregate_trip_for_community(new.id);
  return new;
end;
$$;

-- These definer functions never need REST exposure (same reasoning as
-- set_updated_at in migration 003).
revoke execute on function public.aggregate_trip_for_community(uuid) from public, anon, authenticated;
revoke execute on function public.trips_community_aggregate() from public, anon, authenticated;

create trigger trips_community_aggregate
  after update on public.trips
  for each row
  when (old.status = 'active' and new.status = 'completed')
  execute function public.trips_community_aggregate();
```

- [ ] **Step 4: Apply and verify it passes**

Apply via `apply_migration({ ..., name: '021_community_aggregate', query: <file contents> })`.
Re-run `supabase/tests/public_places_aggregate.sql` via `execute_sql`.
Expected: completes without exception and emits `NOTICE: TASK5 OK`. (The scenario rolls back, so the dev DB is left untouched.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/021_community_aggregate.sql supabase/tests/public_places_aggregate.sql
git commit -m "feat(db): trip-completion community aggregation trigger + happy-path test"
```

---

### Task 6: Idempotency, opt-out, and multi-user merge tests

These exercise behavior already implemented in Task 5 — no new migration. Append three more rolled-back scenarios to `supabase/tests/public_places_aggregate.sql`.

**Files:**
- Modify: `supabase/tests/public_places_aggregate.sql`

- [ ] **Step 1: Add the idempotency scenario**

Append to `supabase/tests/public_places_aggregate.sql`:

```sql
-- Re-completing a trip must not double-count; notes added on reopen ARE counted.
begin;
do $$
declare
  v_uid uuid; v_trip uuid; v_key text; v_visit int; v_contribs int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'pubtest2@example.com', '', now(), now(), now())
  returning id into v_uid;
  insert into public.trips (id, user_id, name, status) values (gen_random_uuid(), v_uid, 'T', 'active') returning id into v_trip;
  insert into public.notes (user_id, trip_id, content, category, place_name, city, rating, offline_id)
  values (v_uid, v_trip, 'a', 'food', 'Cafe X', 'Lisbon', 4, gen_random_uuid());

  update public.trips set status = 'completed' where id = v_trip;
  -- reopen, add a new note for the SAME place, complete again
  update public.trips set status = 'active' where id = v_trip;
  insert into public.notes (user_id, trip_id, content, category, place_name, city, rating, offline_id)
  values (v_uid, v_trip, 'b', 'food', 'Cafe X', 'Lisbon', 2, gen_random_uuid());
  update public.trips set status = 'completed' where id = v_trip;

  v_key := public.build_place_key('Cafe X', 'Lisbon');
  select visit_count into v_visit from public.public_places where place_key = v_key;
  select count(*) into v_contribs from public.public_place_contributions where trip_id = v_trip;
  -- the first note counted once, the second counted once = 2; never 3+ from re-completion
  if v_visit is distinct from 2 then raise exception 'idempotency visit_count: got %', v_visit; end if;
  if v_contribs <> 2 then raise exception 'idempotency contributions: got %', v_contribs; end if;
  raise notice 'TASK6 IDEMPOTENCY OK';
end $$;
rollback;
```

- [ ] **Step 2: Add the opt-out scenario**

Append:

```sql
-- Opted-out user contributes nothing.
begin;
do $$
declare v_uid uuid; v_trip uuid; v_rows int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'pubtest3@example.com', '', now(), now(), now())
  returning id into v_uid;
  update public.profiles set contribute_to_community = false where id = v_uid;
  insert into public.trips (id, user_id, name, status) values (gen_random_uuid(), v_uid, 'T', 'active') returning id into v_trip;
  insert into public.notes (user_id, trip_id, content, category, place_name, city, rating, offline_id)
  values (v_uid, v_trip, 'a', 'food', 'Secret Spot', 'Tokyo', 5, gen_random_uuid());

  update public.trips set status = 'completed' where id = v_trip;

  select count(*) into v_rows from public.public_places where place_key = public.build_place_key('Secret Spot','Tokyo');
  if v_rows <> 0 then raise exception 'opt-out leaked % rows', v_rows; end if;
  select count(*) into v_rows from public.public_place_contributions where trip_id = v_trip;
  if v_rows <> 0 then raise exception 'opt-out wrote % contributions', v_rows; end if;
  raise notice 'TASK6 OPTOUT OK';
end $$;
rollback;
```

- [ ] **Step 3: Add the multi-user merge + coordinate-average scenario**

Append:

```sql
-- Two users' notes for the same place merge into one row (visit_count 2) with
-- averaged coordinates; different city stays separate.
begin;
do $$
declare
  v_uid1 uuid; v_uid2 uuid; v_t1 uuid; v_t2 uuid;
  v_key text; v_visit int; v_lat double precision; v_other int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'pubtest4a@example.com', '', now(), now(), now())
  returning id into v_uid1;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'pubtest4b@example.com', '', now(), now(), now())
  returning id into v_uid2;

  insert into public.trips (id, user_id, name, status) values (gen_random_uuid(), v_uid1, 'T1', 'active') returning id into v_t1;
  insert into public.trips (id, user_id, name, status) values (gen_random_uuid(), v_uid2, 'T2', 'active') returning id into v_t2;

  insert into public.notes (user_id, trip_id, content, category, place_name, city, lat, lng, offline_id)
  values (v_uid1, v_t1, 'a', 'stay', 'Grand Hotel', 'Paris', 10.0, 20.0, gen_random_uuid());
  insert into public.notes (user_id, trip_id, content, category, place_name, city, lat, lng, offline_id)
  values (v_uid2, v_t2, 'b', 'stay', 'grand   hotel', 'paris', 12.0, 22.0, gen_random_uuid());
  -- same name, different city -> separate row
  insert into public.notes (user_id, trip_id, content, category, place_name, city, offline_id)
  values (v_uid2, v_t2, 'c', 'stay', 'Grand Hotel', 'Rome', gen_random_uuid());

  update public.trips set status = 'completed' where id = v_t1;
  update public.trips set status = 'completed' where id = v_t2;

  v_key := public.build_place_key('Grand Hotel', 'Paris');
  select visit_count, lat into v_visit, v_lat from public.public_places where place_key = v_key;
  if v_visit is distinct from 2 then raise exception 'merge visit_count: got %', v_visit; end if;
  -- running average of 10.0 and 12.0 = 11.0
  if v_lat is distinct from 11.0 then raise exception 'merge avg lat: got %', v_lat; end if;

  select count(*) into v_other from public.public_places where place_key = public.build_place_key('Grand Hotel','Rome');
  if v_other <> 1 then raise exception 'different city should be separate row, got %', v_other; end if;
  raise notice 'TASK6 MERGE OK';
end $$;
rollback;
```

- [ ] **Step 4: Run all scenarios and verify they pass**

Run the full `supabase/tests/public_places_aggregate.sql` via `execute_sql`.
Expected: no exception; notices `TASK5 OK`, `TASK6 IDEMPOTENCY OK`, `TASK6 OPTOUT OK`, `TASK6 MERGE OK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/public_places_aggregate.sql
git commit -m "test(db): idempotency, opt-out, multi-user merge aggregation scenarios"
```

---

### Task 7: Regenerate types, full verification, backlog note

**Files:**
- Modify: `src/lib/database.types.ts`
- Reference: `/Users/rutvijdhotey/.claude/projects/-Users-rutvijdhotey-Documents-Personal-Projects-Into-Your-Stories/memory/backlog_priority.md`

- [ ] **Step 1: Regenerate TypeScript types**

Call `generate_typescript_types({ project_id: 'dcejrbyujfcxartywpis' })` and write the result to `src/lib/database.types.ts` (overwrite). Confirm it now contains `public_places` and `public_place_contributions` table types and the `contribute_to_community` field on `profiles`.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the JS suite is still green**

Run: `npx jest`
Expected: all suites pass (no JS behavior changed; this confirms the regenerated types didn't break existing service/type code).

- [ ] **Step 4: Correct the backlog model note**

In `backlog_priority.md`, under "Public/community model (decided 2026-06-21)", change the "Category-gated" bullet so it reads that **food/stay/activity/shopping go public; `general` AND `to-visit` stay private** (remove `to-visit` from the public list), with a one-line note: "to-visit is aspirational/un-visited per the tag-note prompt, so it is excluded from the visited-places aggregate (see 2026-06-24-public-data-layer spec)."

- [ ] **Step 5: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore(db): regenerate types for public data layer"
```

(The `backlog_priority.md` edit is in the auto-memory directory, outside the repo, so it is not part of this commit.)

---

## Self-Review

**Spec coverage:**
- `public_places` schema (all columns, derived `avg_rating`, running-avg coords, `category_counts`/`dominant_category`) → Task 1. ✓
- `public_place_contributions` private ledger + `note_id` unique idempotency guard → Task 2. ✓
- `profiles.contribute_to_community` opt-out, default ON → Task 3. ✓
- Place-key normalization, dominant-category pick → Task 4 (functions) + tested. ✓
- Trip-completion trigger gated on `active → completed`, eligibility filter (categories, non-empty place_name, not-already-contributed), upsert with running-avg coords + rating sums + category tally, contribution insert → Task 5. ✓
- Add-only / no reversal → encoded by "not already contributed" filter + cascade note on `note_id` FK (counts not decremented); covered by idempotency test → Task 6. ✓
- Opt-out stops contributions → Task 6 opt-out scenario. ✓
- `general` and `to-visit` excluded → Task 5 assertions. ✓
- Dedupe across users + null-city bucketing + different-city separation → Task 6 merge scenario + Task 4 `key_null_city`. ✓
- Anonymity (no user_id/timestamps/prose on public table; contributions locked) → Task 1 + Task 2 RLS. ✓
- Backlog note correction (to-visit) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every SQL block and test is complete and runnable. ✓

**Type consistency:** Function names (`normalize_place_text`, `build_place_key`, `pick_dominant_category`, `aggregate_trip_for_community`, `trips_community_aggregate`) and column names (`place_key`, `coord_count`, `category_counts`, `dominant_category`, `rating_sum`, `rating_count`, `contribute_to_community`) are used identically across Tasks 1–7 and both test files. ✓
