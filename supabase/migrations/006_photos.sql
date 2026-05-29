-- Prerequisite: create a public 'photos' bucket in Supabase Storage dashboard
ALTER TABLE notes ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
