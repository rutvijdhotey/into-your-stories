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
