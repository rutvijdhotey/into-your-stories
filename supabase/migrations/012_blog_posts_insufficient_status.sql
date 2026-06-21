-- Add an 'insufficient' blog status: the trip's notes passed the client-side
-- floor but were still too thin for Claude to write a genuine, non-fabricated
-- post. This is distinct from 'error' (nothing failed — there just wasn't
-- enough to work with) so the UI can show a calm "not enough yet" message
-- rather than a failure. The reason text is stored in error_message.
--
-- The inline column CHECK from 008_blog_posts.sql is auto-named
-- blog_posts_status_check.
alter table blog_posts drop constraint blog_posts_status_check;

alter table blog_posts add constraint blog_posts_status_check
  check (status in ('generating', 'draft', 'published', 'error', 'insufficient'));
