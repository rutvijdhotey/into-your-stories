import { supabase } from '../lib/supabase';

export type VoiceIntent = 'save' | 'search';

export type IntentResult = {
  intent: VoiceIntent;
  text: string;
};

const INTENT_TIMEOUT_MS = 6000;

export async function detectIntent(transcript: string): Promise<IntentResult> {
  const fallback: IntentResult = { intent: 'save', text: transcript };

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), INTENT_TIMEOUT_MS),
    );

    const { data, error } = await Promise.race([
      supabase.functions.invoke('detect-intent', { body: { transcript } }),
      timeout,
    ]);

    if (error || !data) return fallback;

    const intent = data.intent === 'search' ? 'search' : 'save';
    return { intent, text: data.text ?? transcript };
  } catch {
    return fallback;
  }
}
