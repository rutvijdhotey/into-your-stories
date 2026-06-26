-- One row per city: place count, total community visits, and the distinct
-- categories present (for the Explore card's color dots). Drives the Explore
-- grid. security_invoker so it honors public_places' public-read RLS.
create view public.public_destinations
  with (security_invoker = on) as
select city,
       count(*)::int          as place_count,
       sum(visit_count)::int   as total_visits,
       coalesce(
         array_agg(distinct dominant_category)
           filter (where dominant_category is not null),
         '{}'
       )                       as categories
from public.public_places
where city is not null
group by city;
