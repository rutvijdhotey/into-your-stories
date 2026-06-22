-- Itinerary creation from blog (0c): structured day-by-day itinerary stored
-- alongside the narrative on a blog post. Nullable: null means "no itinerary"
-- (trip too sparse, or the itinerary failed to parse). The narrative is never
-- affected by the itinerary's presence.
alter table public.blog_posts add column itinerary jsonb;
