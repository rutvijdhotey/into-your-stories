import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireUser } from '../_shared/auth.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

const SYSTEM_PROMPT = `You are a voice intent classifier for a travel notes app.
The user has spoken into their phone. Classify the input as either:
- "save": they want to capture a note, memory, or observation (default)
- "search": they want to find something they previously noted

Rules:
- Default to "save" when ambiguous
- Search phrases: "find", "where did I", "what was", "search for", "look up", "remind me of"
- Save phrases: anything descriptive, observational, or declarative

Respond with ONLY valid JSON — no markdown, no explanation:
{"intent":"save","text":"<cleaned transcript>"}
or
{"intent":"search","text":"<cleaned transcript>"}`;

serve(async (req) => {
  // Real verification, not a presence check — this endpoint spends the Anthropic key.
  const { error: authError } = await requireUser(req);
  if (authError) return authError;

  const { transcript } = await req.json() as { transcript: string };

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    return new Response(JSON.stringify({ intent: 'save', text: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript.trim() }],
    }),
  });

  if (!response.ok) {
    // On Claude API error, fall back to save intent
    return new Response(JSON.stringify({ intent: 'save', text: transcript.trim() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const claudeData = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const rawText = claudeData.content[0]?.text ?? '';

  // Strip markdown code fences if Claude wraps the JSON
  const jsonText = (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText).trim();

  let result: { intent: string; text: string };
  try {
    result = JSON.parse(jsonText);
  } catch {
    // Parse error → default to save
    result = { intent: 'save', text: transcript.trim() };
  }

  const intent = result.intent === 'search' ? 'search' : 'save';
  return new Response(JSON.stringify({ intent, text: result.text ?? transcript.trim() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
