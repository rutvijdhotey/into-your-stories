import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// The photo-selection pass downsizes each candidate to this longest-edge size
// before sending it to Claude. The model only needs to judge which shot is
// strongest — not read fine detail — so ~1536px is ample and keeps image-token
// cost ~3x lower than full resolution. The blog itself always embeds the
// ORIGINAL full-resolution URLs; this resized copy is judgment input only.
const VISION_LONGEST_EDGE = 1536;
const VISION_JPEG_QUALITY = 80;

// Cap how many photos we decode+send in one generation, to bound edge-function
// memory/time. A blog features only a handful of photos, so this is plenty for
// an informed choice; any photos beyond the cap are still referenced by URL
// (text-only) so they remain selectable, just not visually judged.
const MAX_VISION_PHOTOS = 30;

type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
type TextBlock = { type: 'text'; text: string };
type ContentBlock = TextBlock | ImageBlock;

/**
 * Downloads a photo and downsizes it to a small JPEG suitable for vision
 * judgment. Returns a base64 image block, or null if the photo can't be
 * fetched/decoded (e.g. an unsupported format like HEIC) — callers fall back to
 * a text-only URL reference so the photo stays selectable.
 */
async function fetchResizedImageBlock(url: string): Promise<ImageBlock | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const img = await Image.decode(bytes);
    const longest = Math.max(img.width, img.height);
    if (longest > VISION_LONGEST_EDGE) {
      const scale = VISION_LONGEST_EDGE / longest;
      img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    }
    const jpeg = await img.encodeJPEG(VISION_JPEG_QUALITY);
    return {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64Encode(jpeg) },
    };
  } catch (_e) {
    return null;
  }
}

// Supabase injects EdgeRuntime; declare it so the editor doesn't complain.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SYSTEM_PROMPT = `You are a skilled travel writer. You turn a traveler's raw, timestamped notes
from a single trip into one polished, engaging blog post in clear, warm, first-person travel-writing
voice. You never invent places, food, or events that are not supported by the notes.

Before writing, judge whether the notes actually contain enough real substance to write a genuine
post — concrete places, moments, or experiences, not just a few empty fragments. If they do NOT,
do not pad or invent to reach a length. Instead respond with ONLY this JSON and nothing else:
{"insufficient": true, "reason": string}
where reason is one warm, specific sentence the traveler will see (e.g. "These notes are a little
sparse — jot down a few more moments and I'll have plenty to work with.").

Otherwise, write the post as Markdown with this structure:
- An evocative opening paragraph that sets the scene.
- The narrative body, organized by city (and roughly by day where the timestamps make that natural),
  weaving the notes into flowing prose — not a bullet list.
- Length should fit the material, not a fixed template: aim for roughly 600–1200 words for a typical
  trip, expanding toward ~2000 only for rich, many-noted trips, and staying shorter for a brief one.
  Never stretch thin material to hit a word count.
- Inline photos: the actual photos are provided to you as images, each labeled with its exact URL.
  LOOK at them and judge them on what you can see — composition, clarity, and how well each one
  represents its moment. For any note with several photos, prefer its single strongest shot. Across
  the whole trip, feature only a handful of the best, most representative photos overall (not one
  per note, even if every note has a photo). Place them with Markdown image syntax on their own
  line, e.g. ![short caption](THE_EXACT_URL), using ONLY the labeled URLs, copied exactly. A few
  photos may be referenced by URL without an image shown (unsupported format) — you may still use
  those, just judge them by their note context.
- A "## Places" section near the end that groups the named places by their category
  (Food, Stay, Activity, Shopping, To-Visit), as a short list under each heading that appears.
- Itinerary: when asked to produce one (see the instruction in the notes), build a day-by-day
  plan grounded ONLY in the located, named places from the notes — never invent stops. Group stops
  by trip day in order. For each day give a 1-based "day" number, the ISO "date" (yyyy-mm-dd) when
  the notes make it clear (else null), and a short evocative "title". For each stop give:
  "time_of_day" as exactly "morning", "afternoon", or "evening" (or null if unclear — do not
  fabricate precise times), "place_name", "category" (food/stay/activity/shopping/to-visit/general
  or null), a one-line "description" grounded in the notes, and "lat"/"lng" copied from that note.
  When told NOT to produce an itinerary, set "itinerary" to null.
- A brief closing paragraph.

Respond with ONLY valid JSON — no markdown fences, no commentary:
{"title": string, "content_markdown": string, "cover_photo_url": string | null, "selected_photo_urls": string[], "itinerary": ItineraryDay[] | null}

- title: a short, evocative title for the trip.
- content_markdown: the full post described above.
- cover_photo_url: the single best hero photo URL — the most striking, representative image of the
  whole trip based on what you see — or null if the trip has no photos.
- selected_photo_urls: every photo URL you actually used inline (may be empty).
- itinerary: a day-by-day itinerary as described above, or null when not requested or not applicable.`;

type NoteRow = {
  content: string;
  category: string | null;
  place_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  occurred_at: string | null;
  photo_urls: string[] | null;
};

function noteMeta(n: NoteRow): string {
  return [
    n.created_at,
    n.occurred_at ? `date: ${n.occurred_at}` : '',
    n.city ? `city: ${n.city}` : '',
    n.place_name ? `place: ${n.place_name}` : '',
    n.category ? `category: ${n.category}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

const MIN_ITINERARY_DAYS = 3;

/**
 * A note is an itinerary "stop candidate" when it is both located and named.
 * The trip warrants an itinerary when at least MIN_ITINERARY_DAYS distinct
 * calendar days (by occurred_at, falling back to created_at) contain such a
 * note. Deterministic so the decision is predictable and spends no output
 * tokens on trips too sparse for a real itinerary.
 */
function isItineraryEligible(notes: NoteRow[]): boolean {
  const days = new Set<string>();
  for (const n of notes) {
    if (!n.place_name || n.place_name.trim().length === 0) continue;
    if (n.lat === null || n.lng === null) continue;
    const iso = n.occurred_at ?? n.created_at;
    days.add(iso.slice(0, 10)); // yyyy-mm-dd
  }
  return days.size >= MIN_ITINERARY_DAYS;
}

/**
 * Builds the multimodal user message: chronological notes interleaved with each
 * note's actual photos (downsized, base64) so Claude can see and judge them.
 * Every photo is labeled with its exact original URL so the model can reference
 * it in its output. Photos beyond MAX_VISION_PHOTOS, or ones that fail to
 * decode, are listed by URL only.
 */
async function buildUserContent(
  trip: { name: string; destinations: string[] } | null,
  notes: NoteRow[],
  eligible: boolean,
): Promise<ContentBlock[]> {
  const allPhotos = notes.flatMap((n) => n.photo_urls ?? []);
  const content: ContentBlock[] = [];

  const header: string[] = [`Trip name: ${trip?.name ?? 'Untitled trip'}`];
  if (trip?.destinations?.length) header.push(`Destinations: ${trip.destinations.join(', ')}`);
  header.push('');
  header.push('Notes (chronological). Photos for each note follow it as labeled images:');
  content.push({ type: 'text', text: header.join('\n') });

  let imageBudget = MAX_VISION_PHOTOS;
  let i = 0;
  for (const n of notes) {
    i += 1;
    content.push({ type: 'text', text: `${i}. [${noteMeta(n)}] ${n.content}` });
    for (const url of n.photo_urls ?? []) {
      const block = imageBudget > 0 ? await fetchResizedImageBlock(url) : null;
      if (block) {
        imageBudget -= 1;
        content.push({ type: 'text', text: `Photo — url: ${url}` });
        content.push(block);
      } else {
        content.push({ type: 'text', text: `Photo (not shown) — url: ${url}` });
      }
    }
  }

  content.push({
    type: 'text',
    text: allPhotos.length
      ? `Available photo URLs (use ONLY these, copied exactly):\n${allPhotos.join('\n')}`
      : 'This trip has no photos. Use null for cover_photo_url and [] for selected_photo_urls.',
  });

  content.push({
    type: 'text',
    text: eligible
      ? 'Produce a day-by-day itinerary in the "itinerary" field as described in the system prompt.'
      : 'Do NOT produce an itinerary. Set "itinerary" to null.',
  });
  return content;
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
      .select('content, category, place_name, city, lat, lng, occurred_at, created_at, photo_urls')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    const noteRows: NoteRow[] = notes ?? [];
    if (noteRows.length === 0) throw new Error('no_notes');

    const eligible = isItineraryEligible(noteRows);
    const userContent = await buildUserContent(trip, noteRows, eligible);

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
          model: 'claude-opus-4-8',
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
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

    // The model judged the notes too thin to write a genuine post. This is not a
    // failure — surface it as a calm "not enough yet" message via its own status.
    if (parsed?.insufficient === true) {
      const reason =
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'There isn’t quite enough in these notes yet — add a few more details and try again.';
      await admin
        .from('blog_posts')
        .update({ status: 'insufficient', error_message: reason })
        .eq('id', postId);
      return;
    }

    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : (trip?.name ?? 'Untitled Trip');
    const content_markdown = typeof parsed.content_markdown === 'string' ? parsed.content_markdown : '';
    const cover_photo_url = typeof parsed.cover_photo_url === 'string' ? parsed.cover_photo_url : null;
    const selected_photo_urls = Array.isArray(parsed.selected_photo_urls)
      ? parsed.selected_photo_urls.filter((u: unknown) => typeof u === 'string')
      : [];

    if (content_markdown.trim().length === 0) throw new Error('empty_content');

    let itinerary: unknown = null;
    if (eligible && Array.isArray(parsed.itinerary)) {
      const days = parsed.itinerary
        .map((d: unknown) => {
          if (typeof d !== 'object' || d === null) return null;
          const obj = d as Record<string, unknown>;
          if (typeof obj.day !== 'number' || !Array.isArray(obj.stops)) return null;
          const stops = obj.stops.filter(
            (s: unknown) =>
              typeof s === 'object' &&
              s !== null &&
              typeof (s as Record<string, unknown>).place_name === 'string' &&
              ((s as Record<string, unknown>).place_name as string).trim().length > 0,
          );
          if (stops.length === 0) return null;
          return { ...obj, stops };
        })
        .filter((d: unknown) => d !== null);
      itinerary = days.length > 0 ? days : null;
    }

    await admin
      .from('blog_posts')
      .update({ status: 'draft', title, content_markdown, cover_photo_url, selected_photo_urls, itinerary })
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
