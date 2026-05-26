import { supabase } from '../lib/supabase';

export type VoiceIntent = 'save' | 'search';

export type IntentResult = {
  intent: VoiceIntent;
  text: string;
};

export async function detectIntent(transcript: string): Promise<IntentResult> {
  const fallback: IntentResult = { intent: 'save', text: transcript };

  const { data, error } = await supabase.functions.invoke('detect-intent', {
    body: { transcript },
  });

  if (error || !data) return fallback;

  const intent = data.intent === 'search' ? 'search' : 'save';
  return { intent, text: data.text ?? transcript };
}
