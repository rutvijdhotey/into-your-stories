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
