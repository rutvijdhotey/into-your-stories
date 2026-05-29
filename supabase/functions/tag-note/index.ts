import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const CATEGORIES = ['food', 'stay', 'activity', 'shopping', 'to-visit', 'general'];

const SYSTEM_PROMPT = `You are a metadata tagger for a travel notes app. Given a single note
(and optional location context), assign:
- category: exactly one of food, stay, activity, shopping, to-visit, general
- place_name: the specific named venue/landmark if one is clearly mentioned (e.g. "Ichiran Ramen",
  "Park Hyatt Tokyo"); otherwise null
- city: the city the note is about, but ONLY if you can confidently infer it AND no city was already
  provided in the context; otherwise null

Rules:
- "to-visit" means a place the user wants to go later, not somewhere they are. "general" is the
  catch-all when nothing fits.
- Do not invent a place_name or city. When unsure, use null.

Respond with ONLY valid JSON — no markdown, no explanation:
{"category":"food","place_name":"Ichiran Ramen","city":"Tokyo"}`;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }

  const { content, lat, lng, city } = (await req.json()) as {
    content?: string;
    lat?: number | null;
    lng?: number | null;
    city?: string | null;
  };

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'empty_content' }), { status: 400, headers: JSON_HEADERS });
  }

  const contextLines = [
    `Note: "${content.trim()}"`,
    city ? `Known city: ${city} (do not change it; return null for city).` : 'No city is known.',
    lat != null && lng != null ? `Coordinates: ${lat}, ${lng}.` : '',
  ].filter(Boolean);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contextLines.join('\n') }],
    }),
  });

  // Non-200 → the client leaves the note 'pending' and retries on the next drain.
  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'claude_error' }), { status: 502, headers: JSON_HEADERS });
  }

  const claudeData = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const rawText = claudeData.content[0]?.text ?? '';
  const jsonText = (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText).trim();

  let parsed: { category?: unknown; place_name?: unknown; city?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return new Response(JSON.stringify({ error: 'parse_error' }), { status: 502, headers: JSON_HEADERS });
  }

  const rawCategory = typeof parsed.category === 'string' ? parsed.category.toLowerCase() : 'general';
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'general';
  const place_name = typeof parsed.place_name === 'string' && parsed.place_name.trim() ? parsed.place_name.trim() : null;
  const resolvedCity = typeof parsed.city === 'string' && parsed.city.trim() ? parsed.city.trim() : null;

  return new Response(JSON.stringify({ category, place_name, city: resolvedCity }), { headers: JSON_HEADERS });
});
