import { supabase } from '../lib/supabase';
import type { Note } from './noteHelpers';
import { mergeTags, normalizeSuggestion } from './taggingHelpers';

/**
 * Tags a single note via the tag-note edge function. Returns true if the note
 * was tagged and written; false if the function failed (note stays 'pending').
 */
export async function tagNote(note: Note): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('tag-note', {
    body: { content: note.content, lat: note.lat, lng: note.lng, city: note.city },
  });

  if (error || !data) return false;

  const merged = mergeTags(
    { category: note.category, city: note.city, place_name: note.place_name },
    normalizeSuggestion(data),
  );

  const { error: updateError } = await supabase
    .from('notes')
    .update({
      category: merged.category,
      place_name: merged.place_name,
      city: merged.city,
      tagging_status: 'complete',
    })
    .eq('id', note.id);

  return !updateError;
}

/**
 * Drains every pending note for the current user (RLS scopes to own rows) and
 * tags it. Idempotent and safe to call often. Returns the count tagged.
 */
export async function drainTagging(): Promise<number> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('tagging_status', 'pending');

  if (error || !data) return 0;

  let tagged = 0;
  for (const note of data as Note[]) {
    const ok = await tagNote(note);
    if (ok) tagged += 1;
  }
  return tagged;
}
