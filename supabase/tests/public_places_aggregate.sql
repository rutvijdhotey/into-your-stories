-- Integration scenarios for the trip-completion community aggregation.
-- Each scenario runs inside begin/rollback so the dev DB is left untouched.
-- A failed assertion raises an exception (which aborts the run); success emits
-- a NOTICE. Run the whole file via execute_sql.

-- ── TASK 5: happy path ──────────────────────────────────────────────────────
-- One trip, four notes: eligible rated food (with coords), eligible unrated
-- activity (no coords), excluded general, excluded to-visit. Complete → assert.
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

-- ── TASK 6a: idempotency ────────────────────────────────────────────────────
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

-- ── TASK 6b: opt-out ────────────────────────────────────────────────────────
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

-- ── TASK 6c: multi-user merge + coordinate average ──────────────────────────
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
