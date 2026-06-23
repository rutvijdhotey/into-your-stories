-- Server-side backstop for stuck blog generations. A photo-heavy generate-blog
-- run can be killed by the platform wall-clock before it writes a status,
-- orphaning the row in 'generating' forever. The client already recovers
-- (isStaleGenerating), but nothing server-side resolves the row. A pg_cron job
-- fails any 'generating' post older than 5 minutes - safely beyond any
-- legitimate run (preprocessing + the 140s Claude call is well under 3 min), so
-- it never touches a live generation.
create extension if not exists pg_cron;

-- Idempotent: cron.schedule upserts a job by name (pg_cron 1.6).
select cron.schedule(
  'sweep-stale-blog-posts',
  '*/5 * * * *',
  $$update public.blog_posts
      set status = 'error',
          error_message = 'Generation timed out.'
    where status = 'generating'
      and created_at < now() - interval '5 minutes'$$
);
