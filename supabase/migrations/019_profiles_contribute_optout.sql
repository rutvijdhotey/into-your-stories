-- Global opt-out for the community map, default ON
-- ("Contribute my places to the community map"). Checked at aggregation time.
alter table public.profiles
  add column contribute_to_community boolean not null default true;
