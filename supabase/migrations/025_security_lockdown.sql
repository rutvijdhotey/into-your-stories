-- Security lockdown (audit 2026-08-07).
--
-- Two policies written permissively for the public-blog feature that was later
-- deferred to V2. The feature never arrived; the permissions stayed. Both grant
-- the *anon* role, and the anon key ships inside the app bundle — so together
-- they let any stranger dump the user list and then walk each named user's
-- photo folder. Neither is needed by any V1 code path.

-- ---------------------------------------------------------------------------
-- 1. profiles: own row only
-- ---------------------------------------------------------------------------
-- "profiles_select_all" used `using (true)` with no role clause, so anon could
-- read every row: user UUID, display_name (a real name, as typed at signup),
-- signup timestamp, community opt-out flag.
--
-- Nothing in V1 renders another user's display_name — blogs are private and the
-- community aggregate is anonymous. aggregate_trip_for_community reads profiles
-- but is SECURITY DEFINER, so it is unaffected by this policy.

drop policy if exists "profiles_select_all" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. photos bucket: owner reads only
-- ---------------------------------------------------------------------------
-- SELECT on storage.objects is what backs the storage *list* API, so
-- `TO public USING (bucket_id = 'photos')` did not merely expose unguessable
-- URLs — it let anyone holding the anon key enumerate the bucket: root listing
-- yields every user's UUID folder, then note IDs, then filenames.
--
-- Replaced with the same owner scope the INSERT/UPDATE/DELETE policies already
-- use. Creating a signed URL requires SELECT under RLS, so owners can still
-- sign their own objects; the client now uses createSignedUrl instead of
-- getPublicUrl.

drop policy if exists "photos: public read" on storage.objects;

create policy "photos: authenticated users can read own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Flip the bucket itself to private. Without this, /object/public/photos/...
-- keeps serving bytes regardless of the policies above.
update storage.buckets set public = false where id = 'photos';
