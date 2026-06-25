-- Optional 1–5 star rating on a note. Whole numbers only; null = unrated.
alter table public.notes
  add column rating smallint
    check (rating is null or rating between 1 and 5);

-- Safety net mirroring the app rule: a rating may only exist on a rateable
-- category. Enforces "clear rating on category switch" at the DB level so bad
-- data cannot slip in through any path, including the future public aggregate.
alter table public.notes
  add constraint notes_rating_requires_rateable_category
    check (rating is null or category in ('food','stay','activity','shopping'));
