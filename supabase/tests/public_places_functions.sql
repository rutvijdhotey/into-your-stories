-- Pure-function unit tests. Run via execute_sql; every column must be true.
select
  public.normalize_place_text('  Tartine   Bakery ') = 'tartine bakery'        as norm_trim_collapse,
  public.normalize_place_text(null) = ''                                        as norm_null_to_empty,
  public.build_place_key('Blue Bottle', 'San Francisco') = 'blue bottle|san francisco' as key_with_city,
  public.build_place_key('Blue Bottle', null) = 'blue bottle|'                  as key_null_city,
  public.pick_dominant_category('{"food":3,"activity":1}'::jsonb) = 'food'      as dom_max,
  public.pick_dominant_category('{"food":1,"activity":1}'::jsonb) = 'activity'  as dom_tie_alpha,
  public.pick_dominant_category('{}'::jsonb) is null                            as dom_empty_null;
