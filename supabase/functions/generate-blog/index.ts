import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Supabase injects EdgeRuntime; declare it so the editor doesn't complain.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SYSTEM_PROMPT = `You are a skilled travel writer. You turn a traveler's raw, timestamped notes
from a single trip into one polished, engaging blog post in clear, warm, first-person travel-writing
voice. You never invent places, food, or events that are not supported by the notes.

Write the post as Markdown with this structure:
- An evocative opening paragraph that sets the scene.
- The narrative body, organized by city (and roughly by day where the timestamps make that natural),
  weaving the notes into flowing prose — not a bullet list.
- Inline photos: choose only a handful of the strongest, most representative photos overall (not
  one per note, even if every note has a photo) and place them with Markdown image syntax on their
  own line, e.g. ![short caption](THE_EXACT_URL). Use ONLY URLs that appear in the provided notes,
  copied exactly.
- A "## Places" section near the end that groups the named places by their category
  (Food, Stay, Activity, Shopping, To-Visit), as a short list under each heading that appears.
- A brief closing paragraph.

Respond with ONLY valid JSON — no markdown fences, no commentary:
{"title": string, "content_markdown": string, "cover_photo_url": string | null, "selected_photo_urls": string[]}

- title: a short, evocative title for the trip.
- content_markdown: the full post described above.
- cover_photo_url: the single best hero photo URL from the notes, or null if the trip has no photos.
- selected_photo_urls: every photo URL you actually used inline (may be empty).`;

type NoteRow = {
  content: string;
  category: string | null;
  place_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  photo_urls: string[] | null;
};

function buildUserPrompt(
  trip: { name: string; destinations: string[] } | null,
  notes: NoteRow[],
): string {
  const allPhotos = notes.flatMap((n) => n.photo_urls ?? []);
  const lines: string[] = [];
  lines.push(`Trip name: ${trip?.name ?? 'Untitled trip'}`);
  if (trip?.destinations?.length) lines.push(`Destinations: ${trip.destinations.join(', ')}`);
  lines.push('');
  lines.push('Notes (chronological):');
  notes.forEach((n, i) => {
    const meta = [
      n.created_at,
      n.city ? `city: ${n.city}` : '',
      n.place_name ? `place: ${n.place_name}` : '',
      n.category ? `category: ${n.category}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    lines.push(`${i + 1}. [${meta}] ${n.content}`);
    for (const url of n.photo_urls ?? []) lines.push(`   photo: ${url}`);
  });
  lines.push('');
  lines.push(
    allPhotos.length
      ? `Available photo URLs (use only these, copied exactly):\n${allPhotos.join('\n')}`
      : 'This trip has no photos. Use null for cover_photo_url and [] for selected_photo_urls.',
  );
  return lines.join('\n');
}

// deno-lint-ignore no-explicit-any
async function generate(admin: any, postId: string, tripId: string) {
  try {
    const { data: trip } = await admin
      .from('trips')
      .select('name, destinations')
      .eq('id', tripId)
      .single();

    const { data: notes } = await admin
      .from('notes')
      .select('content, category, place_name, city, lat, lng, created_at, photo_urls')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    const noteRows: NoteRow[] = notes ?? [];
    if (noteRows.length === 0) throw new Error('no_notes');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 140_000);
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(trip, noteRows) }],
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) throw new Error(`claude_error_${response.status}`);

    const claudeData = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const rawText = claudeData.content?.[0]?.text ?? '';
    const jsonText = (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText).trim();
    const parsed = JSON.parse(jsonText);

    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : (trip?.name ?? 'Untitled Trip');
    const content_markdown = typeof parsed.content_markdown === 'string' ? parsed.content_markdown : '';
    const cover_photo_url = typeof parsed.cover_photo_url === 'string' ? parsed.cover_photo_url : null;
    const selected_photo_urls = Array.isArray(parsed.selected_photo_urls)
      ? parsed.selected_photo_urls.filter((u: unknown) => typeof u === 'string')
      : [];

    if (content_markdown.trim().length === 0) throw new Error('empty_content');

    await admin
      .from('blog_posts')
      .update({ status: 'draft', title, content_markdown, cover_photo_url, selected_photo_urls })
      .eq('id', postId);
  } catch (e) {
    await admin
      .from('blog_posts')
      .update({ status: 'error', error_message: String((e as Error)?.message ?? e) })
      .eq('id', postId);
  }
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const { trip_id } = (await req.json()) as { trip_id?: string };
  if (!trip_id) {
    return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: JSON_HEADERS });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Authoritative user id from the verified JWT — never trust a client-supplied id,
  // since the service-role client bypasses RLS.
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user_id = userData?.user?.id;
  if (userError || !user_id) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  // Authorize the trip: the service-role client bypasses RLS, so we must confirm
  // the requested trip belongs to the authenticated user before reading its notes
  // or writing a post for it. Without this, any authenticated user could generate
  // a blog from another user's private trip.
  const { data: tripOwner, error: tripOwnerError } = await admin
    .from('trips')
    .select('user_id')
    .eq('id', trip_id)
    .single();
  if (tripOwnerError || !tripOwner || tripOwner.user_id !== user_id) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: JSON_HEADERS });
  }

  // One active post per trip: drop any prior non-published row before inserting
  // the fresh generating row (the partial unique index would otherwise reject it).
  await admin.from('blog_posts').delete().eq('trip_id', trip_id).neq('status', 'published');

  const { data: inserted, error: insertError } = await admin
    .from('blog_posts')
    .insert({ user_id, trip_id, status: 'generating' })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return new Response(JSON.stringify({ error: 'insert_failed' }), { status: 500, headers: JSON_HEADERS });
  }

  const postId = inserted.id as string;

  // Heavy work continues after the response so the client isn't blocked ~60s.
  EdgeRuntime.waitUntil(generate(admin, postId, trip_id));

  return new Response(JSON.stringify({ id: postId }), { headers: JSON_HEADERS });
});
