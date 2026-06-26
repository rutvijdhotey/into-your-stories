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
