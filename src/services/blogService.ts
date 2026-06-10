import { supabase } from '../lib/supabase';
import type { BlogPost } from './blogHelpers';

/**
 * Kicks off generation via the generate-blog edge function. The function inserts
 * a `generating` row and returns its id immediately; the heavy Claude work runs
 * in the background and flips the row to `draft` (surfaced live via Realtime).
 * The user identity is derived server-side from the verified JWT, so only the
 * trip id is sent. Returns the new post id, or null if the invoke failed.
 */
export async function generateBlog(tripId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('generate-blog', {
    body: { trip_id: tripId },
  });
  if (error || !data) return null;
  return (data as { id?: string }).id ?? null;
}

export async function listBlogPosts(userId: string): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

export async function getBlogPostByTrip(tripId: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as BlogPost | null;
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as BlogPost | null;
}

export async function publishPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_posts')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function unpublish(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_posts')
    .update({ status: 'draft', published_at: null })
    .eq('id', id);

  if (error) throw error;
}

export async function discardDraft(id: string): Promise<void> {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) throw error;
}
