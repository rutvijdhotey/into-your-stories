# Phase 4 — Voice + Intent Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 🎙️ mic button in `NoteCaptureSheet` to iOS speech recognition and Claude intent detection so users can dictate notes or voice-search by speaking.

**Architecture:** Tap mic to start recording → `expo-speech-recognition` transcribes via iOS `SFSpeechRecognizer` → on stop, call the `detect-intent` Supabase Edge Function (which calls Claude) → if intent is `save`, transcript fills the text input for the user to review and save; if intent is `search`, close the sheet and navigate to the Search tab. This phase moves the project from Expo Go to a Development Build (required for the native STT module). The edge function keeps the Anthropic API key server-side. The mic UX is tap-to-start / tap-to-stop.

**Tech Stack:** `expo-speech-recognition` (Expo Modules API, New Architecture compatible, wraps iOS `SFSpeechRecognizer`), Supabase Edge Function (Deno), Claude API `claude-haiku-3-5` (fast binary classification), `supabase.functions.invoke()` client call. Dev build via `npx expo prebuild` + `npx expo run:ios`.

**Model choice:** `claude-haiku-3-5` instead of `claude-sonnet-4-6` for intent detection specifically — it's a binary classification with a fixed schema output, and Haiku is 10× cheaper and faster with no quality loss at this task. Sonnet is still the choice for blog generation (Phase 9).

---

## File Map

**Create:**
- `supabase/functions/detect-intent/index.ts` — Edge Function: receives transcript, calls Claude, returns `{intent, text}`
- `src/hooks/useVoiceRecording.ts` — state machine wrapping `expo-speech-recognition`
- `src/hooks/__tests__/useVoiceRecording.test.ts` — unit tests for hook state transitions
- `src/services/voiceService.ts` — client wrapper for `detect-intent` edge function
- `src/services/__tests__/voiceService.test.ts` — unit tests for voiceService parsing + fallback

**Modify:**
- `app.json` — add `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`, `expo-speech-recognition` plugin
- `src/components/NoteCaptureSheet.tsx` — wire mic button, handle recording states, add `onSearchIntent` prop
- `src/navigation/MainStack.tsx` — implement `onSearchIntent` to navigate to Search tab

---

## Task 1: Install expo-speech-recognition + dev build

**Files:**
- Modify: `app.json`
- Modify: `package.json` (via install)

### Why dev build?
`expo-speech-recognition` contains native code and cannot run in Expo Go. The project already has `ios/` and `android/` in `.gitignore` (from Phase 1). After this task, always launch with `npx expo run:ios` instead of `npx expo start`.

- [ ] **Step 1: Install the package**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx expo install expo-speech-recognition -- --legacy-peer-deps
```

Expected: `expo-speech-recognition` added to `package.json` dependencies.

- [ ] **Step 2: Update app.json — add permissions and plugin**

Open `app.json`. The current `expo.ios.infoPlist` has `NSLocationWhenInUseUsageDescription`. Add two more keys to it, and add the plugin to `plugins`. Result:

```json
{
  "expo": {
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Into Your Stories tags notes with the city you captured them in.",
        "NSMicrophoneUsageDescription": "Into Your Stories uses your microphone to capture voice notes.",
        "NSSpeechRecognitionUsageDescription": "Into Your Stories transcribes your voice using on-device speech recognition."
      }
    },
    "plugins": [
      "@react-native-community/datetimepicker",
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Into Your Stories tags notes with the city you captured them in."
        }
      ],
      "expo-speech-recognition"
    ]
  }
}
```

(Keep all existing keys; only add the two `infoPlist` entries and the `"expo-speech-recognition"` plugin entry.)

- [ ] **Step 3: Prebuild and launch**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx expo prebuild --clean 2>&1 | tail -5
```

Expected: ends with `✔ Build dependencies configured` or similar success message. `ios/` folder is generated (it is gitignored).

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx expo run:ios 2>&1 | tail -10
```

Expected: builds and opens the app in the iOS simulator. Sign-in screen appears. The app behaves identically to before — this task changes the build system only.

- [ ] **Step 4: Verify all existing tests still pass**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest --no-coverage 2>&1 | tail -8
```

Expected: 38 tests pass, 4 suites.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && git add app.json package.json package-lock.json && git commit -m "feat: install expo-speech-recognition and migrate to dev build"
```

---

## Task 2: useVoiceRecording hook (TDD)

**Files:**
- Create: `src/hooks/__tests__/useVoiceRecording.test.ts`
- Create: `src/hooks/useVoiceRecording.ts`

### State machine

```
idle ──start()──► recording ──result(isFinal)──► done
                      │                           │
                      └──error event──► error      └──reset()──► idle
                      └──stop() (no speech)──► idle         error ──reset()──► idle
```

Status values: `'idle' | 'recording' | 'done' | 'error'`

- [ ] **Step 1: Create the test file**

Create `src/hooks/__tests__/useVoiceRecording.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useVoiceRecording } from '../useVoiceRecording';

// Capture event callbacks so tests can fire them manually
const capturedCallbacks: Record<string, (event: unknown) => void> = {};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    start: jest.fn(),
    stop: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn((event: string, handler: (e: unknown) => void) => {
    capturedCallbacks[event] = handler;
  }),
}));

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
const mockModule = ExpoSpeechRecognitionModule as jest.Mocked<typeof ExpoSpeechRecognitionModule>;

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(capturedCallbacks).forEach((k) => delete capturedCallbacks[k]);
  mockModule.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
});

describe('useVoiceRecording', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoiceRecording());
    expect(result.current.status).toBe('idle');
    expect(result.current.partialTranscript).toBe('');
    expect(result.current.finalTranscript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('transitions to recording after start() with granted permissions', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => {
      await result.current.start();
    });
    expect(mockModule.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockModule.start).toHaveBeenCalledWith({ lang: 'en-US', continuous: false });
    expect(result.current.status).toBe('recording');
  });

  it('transitions to error when permissions are denied', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/permission/i);
    expect(mockModule.start).not.toHaveBeenCalled();
  });

  it('updates partialTranscript on partial result events', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    act(() => {
      capturedCallbacks['result']?.({ results: [{ transcript: 'hello wor', isFinal: false }] });
    });
    expect(result.current.partialTranscript).toBe('hello wor');
    expect(result.current.status).toBe('recording');
  });

  it('transitions to done with finalTranscript on final result event', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    act(() => {
      capturedCallbacks['result']?.({ results: [{ transcript: 'Hello world', isFinal: true }] });
    });
    expect(result.current.status).toBe('done');
    expect(result.current.finalTranscript).toBe('Hello world');
  });

  it('transitions to error on speech recognition error', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    act(() => {
      capturedCallbacks['error']?.({ error: 'no-speech', message: 'No speech detected' });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('No speech detected');
  });

  it('calls stop() on the module when stop() is called while recording', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    act(() => { result.current.stop(); });
    expect(mockModule.stop).toHaveBeenCalledTimes(1);
  });

  it('reset() returns to idle from done state', async () => {
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    act(() => {
      capturedCallbacks['result']?.({ results: [{ transcript: 'test', isFinal: true }] });
    });
    expect(result.current.status).toBe('done');
    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.finalTranscript).toBe('');
  });

  it('reset() returns to idle from error state', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    const { result } = renderHook(() => useVoiceRecording());
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe('error');
    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest src/hooks/__tests__/useVoiceRecording.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `useVoiceRecording` does not exist yet.

- [ ] **Step 3: Create src/hooks/useVoiceRecording.ts**

```ts
import { useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type RecordingStatus = 'idle' | 'recording' | 'done' | 'error';

export type UseVoiceRecordingReturn = {
  status: RecordingStatus;
  partialTranscript: string;
  finalTranscript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

export function useVoiceRecording(): UseVoiceRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const top = event.results[0];
    if (!top) return;
    if (top.isFinal) {
      setFinalTranscript(top.transcript);
      setPartialTranscript('');
      setStatus('done');
    } else {
      setPartialTranscript(top.transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.message ?? event.error ?? 'Speech recognition failed');
    setStatus('error');
  });

  const start = async () => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition permission denied');
      setStatus('error');
      return;
    }
    setPartialTranscript('');
    setFinalTranscript('');
    setError(null);
    setStatus('recording');
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', continuous: false });
  };

  const stop = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const reset = () => {
    setStatus('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setError(null);
  };

  return { status, partialTranscript, finalTranscript, error, start, stop, reset };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest src/hooks/__tests__/useVoiceRecording.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run full test suite**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest --no-coverage 2>&1 | tail -8
```

Expected: all 46 tests pass (38 existing + 8 new).

- [ ] **Step 6: Commit**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && git add src/hooks/useVoiceRecording.ts src/hooks/__tests__/useVoiceRecording.test.ts && git commit -m "feat: add useVoiceRecording hook with state machine"
```

---

## Task 3: Supabase Edge Function detect-intent

**Files:**
- Create: `supabase/functions/detect-intent/index.ts`

**Before starting:** Confirm you have your Anthropic API key ready (`sk-ant-...`). You'll set it as a Supabase secret in Step 3. The Supabase project ref is `dcejrbyujfcxartywpis`.

- [ ] **Step 1: Create the function file**

Create directory and file:
```bash
mkdir -p "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories/supabase/functions/detect-intent"
```

Create `supabase/functions/detect-intent/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  // Verify auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
      model: 'claude-haiku-3-5',
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

  let result: { intent: string; text: string };
  try {
    result = JSON.parse(rawText);
  } catch {
    // Parse error → default to save
    result = { intent: 'save', text: transcript.trim() };
  }

  const intent = result.intent === 'search' ? 'search' : 'save';
  return new Response(JSON.stringify({ intent, text: result.text ?? transcript.trim() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Set the Anthropic API key as a Supabase secret**

Replace `sk-ant-YOUR-KEY-HERE` with your actual key:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE --project-ref dcejrbyujfcxartywpis
```

Expected: `Finished supabase secrets set.`

- [ ] **Step 3: Deploy the function**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx supabase functions deploy detect-intent --project-ref dcejrbyujfcxartywpis
```

Expected: `Deployed Function detect-intent on project dcejrbyujfcxartywpis`

- [ ] **Step 4: Smoke-test the function via curl**

Replace `<ANON_KEY>` with the value of `EXPO_PUBLIC_SUPABASE_ANON_KEY` from your `.env` file:

```bash
curl -s -X POST \
  "https://dcejrbyujfcxartywpis.supabase.co/functions/v1/detect-intent" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"There is an amazing rooftop bar on the corner"}' | python3 -m json.tool
```

Expected output:
```json
{
  "intent": "save",
  "text": "There is an amazing rooftop bar on the corner"
}
```

Then test a search:
```bash
curl -s -X POST \
  "https://dcejrbyujfcxartywpis.supabase.co/functions/v1/detect-intent" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Find that rooftop bar I mentioned yesterday"}' | python3 -m json.tool
```

Expected: `{"intent": "search", ...}`

- [ ] **Step 5: Commit**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && git add supabase/functions/detect-intent/index.ts && git commit -m "feat: add detect-intent edge function with Claude intent classification"
```

---

## Task 4: voiceService (TDD)

**Files:**
- Create: `src/services/__tests__/voiceService.test.ts`
- Create: `src/services/voiceService.ts`

- [ ] **Step 1: Create the test file**

Create `src/services/__tests__/voiceService.test.ts`:

```ts
import { detectIntent } from '../voiceService';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from '../../lib/supabase';
const mockInvoke = supabase.functions.invoke as jest.MockedFunction<
  typeof supabase.functions.invoke
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('detectIntent', () => {
  it('returns save intent when edge function returns save', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { intent: 'save', text: 'Great view from the hotel' },
      error: null,
    } as never);
    const result = await detectIntent('Great view from the hotel');
    expect(result).toEqual({ intent: 'save', text: 'Great view from the hotel' });
    expect(mockInvoke).toHaveBeenCalledWith('detect-intent', {
      body: { transcript: 'Great view from the hotel' },
    });
  });

  it('returns search intent when edge function returns search', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { intent: 'search', text: 'Find the rooftop bar' },
      error: null,
    } as never);
    const result = await detectIntent('Find the rooftop bar');
    expect(result).toEqual({ intent: 'search', text: 'Find the rooftop bar' });
  });

  it('falls back to save intent when edge function returns an error', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('Network error'),
    } as never);
    const result = await detectIntent('some transcript');
    expect(result).toEqual({ intent: 'save', text: 'some transcript' });
  });

  it('falls back to save intent when response has unknown intent value', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { intent: 'unknown', text: 'some transcript' },
      error: null,
    } as never);
    const result = await detectIntent('some transcript');
    expect(result).toEqual({ intent: 'save', text: 'some transcript' });
  });

  it('falls back to save intent when response data is null', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: null,
    } as never);
    const result = await detectIntent('fallback test');
    expect(result).toEqual({ intent: 'save', text: 'fallback test' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest src/services/__tests__/voiceService.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `detectIntent` does not exist yet.

- [ ] **Step 3: Create src/services/voiceService.ts**

```ts
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest src/services/__tests__/voiceService.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run full test suite**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest --no-coverage 2>&1 | tail -8
```

Expected: all 51 tests pass (46 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && git add src/services/voiceService.ts src/services/__tests__/voiceService.test.ts && git commit -m "feat: add voiceService with detectIntent and safe fallback"
```

---

## Task 5: Wire mic button in NoteCaptureSheet + MainStack search navigation

**Files:**
- Modify: `src/components/NoteCaptureSheet.tsx`
- Modify: `src/navigation/MainStack.tsx`

### Visual states for the mic button

| Status | Mic button appearance | Hint text |
|---|---|---|
| `idle` | Amber gradient, opacity 0.5 | "Hold to record" |
| `recording` | Amber gradient, opacity 1.0, red pulsing ring | Partial transcript (or "Listening…") |
| `done` | Amber gradient, opacity 0.5 (reset after handling) | — |
| `error` | Amber gradient, opacity 0.5 | Error message in red below |

The red pulsing ring uses a `useRef(new Animated.Value(1))` that loops `1 → 1.2 → 1` on the `recording` status.

### Flow

1. Tap mic (status `idle`) → `voice.start()`
2. Tap mic again (status `recording`) → `voice.stop()`
3. Status becomes `done` → call `detectIntent(finalTranscript)`
4. If `save`: `setContent(intentResult.text)` + `voice.reset()` (user sees transcript in input, edits if needed, saves normally)
5. If `search`: `voice.reset()` + call `onSearchIntent(intentResult.text)` prop + `onClose()`

- [ ] **Step 1: Replace NoteCaptureSheet.tsx**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTrips } from '../hooks/useTrips';
import { useLocation } from '../hooks/useLocation';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { createNote } from '../services/noteService';
import { detectIntent } from '../services/voiceService';
import { validateContent, type Category } from '../services/noteHelpers';
import CategoryPicker from './CategoryPicker';
import TripSelector from './TripSelector';
import { Colors, Spacing, BorderRadius } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onStartTrip: () => void;
  onSearchIntent: (query: string) => void;
};

export default function NoteCaptureSheet({
  visible,
  onClose,
  onStartTrip,
  onSearchIntent,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { trips } = useTrips(userId);
  const { fix, loading: locating, fetch: fetchLocation } = useLocation();
  const voice = useVoiceRecording();

  const activeTrips = useMemo(() => trips.filter((t) => t.status === 'active'), [trips]);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [intentLoading, setIntentLoading] = useState(false);

  // Pulsing ring animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (voice.status === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [voice.status, pulseAnim]);

  // Handle completed transcription
  useEffect(() => {
    if (voice.status !== 'done' || !voice.finalTranscript) return;
    const transcript = voice.finalTranscript;
    voice.reset();
    setIntentLoading(true);
    detectIntent(transcript)
      .then((result) => {
        if (result.intent === 'search') {
          onClose();
          onSearchIntent(result.text);
        } else {
          setContent(result.text);
        }
      })
      .catch(() => {
        // On any error, treat as save
        setContent(transcript);
      })
      .finally(() => setIntentLoading(false));
  }, [voice.status, voice.finalTranscript, voice.reset, onClose, onSearchIntent]);

  useEffect(() => {
    if (!visible) return;
    if (activeTrips.length === 0) setSelectedTripId(null);
    else if (!selectedTripId || !activeTrips.some((t) => t.id === selectedTripId)) {
      setSelectedTripId(activeTrips[0].id);
    }
  }, [visible, activeTrips, selectedTripId]);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setCategory(null);
    voice.reset();
    void fetchLocation();
  }, [visible, fetchLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !saving && !intentLoading && selectedTripId !== null && validateContent(content).ok;

  const handleSave = async () => {
    if (!userId || !selectedTripId) return;
    const validation = validateContent(content);
    if (!validation.ok) {
      Alert.alert(
        'Cannot save note',
        validation.reason === 'empty' ? 'Add some text first.' : 'Note is too long (max 8000 chars).',
      );
      return;
    }
    setSaving(true);
    try {
      const latest = await fetchLocation();
      await createNote({
        userId,
        tripId: selectedTripId,
        content: validation.value,
        category,
        lat: latest?.lat ?? fix?.lat ?? null,
        lng: latest?.lng ?? fix?.lng ?? null,
        city: latest?.city ?? fix?.city ?? null,
      });
      onClose();
    } catch (e) {
      Alert.alert('Could not save note', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMicPress = async () => {
    if (intentLoading) return;
    if (voice.status === 'recording') {
      voice.stop();
    } else if (voice.status === 'idle' || voice.status === 'error') {
      await voice.start();
    }
  };

  const locationLabel = locating
    ? '📍 Locating…'
    : fix?.city
    ? `📍 ${fix.city}`
    : '📍 No location';

  const isRecording = voice.status === 'recording';
  const micLabel =
    intentLoading
      ? 'Thinking…'
      : isRecording
      ? (voice.partialTranscript || 'Listening…')
      : voice.status === 'error'
      ? (voice.error ?? 'Try again')
      : 'Hold to record';
  const micLabelColor =
    voice.status === 'error' ? Colors.error : isRecording ? Colors.accent : '#555555';

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <TripSelector
          activeTrips={activeTrips}
          selectedTripId={selectedTripId}
          onSelect={setSelectedTripId}
          onStartTrip={() => {
            onClose();
            onStartTrip();
          }}
        />

        <View style={styles.micSection}>
          <Pressable
            onPress={handleMicPress}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start voice recording'}
            style={styles.micOuter}
          >
            {isRecording && (
              <Animated.View
                style={[styles.micRing, { transform: [{ scale: pulseAnim }] }]}
              />
            )}
            <LinearGradient
              colors={['#E08040', '#C0581A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.micButton, !isRecording && styles.micButtonIdle]}
            >
              {intentLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.micEmoji}>{isRecording ? '⏹' : '🎙️'}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={[styles.micHint, { color: micLabelColor }]} numberOfLines={2}>
            {micLabel}
          </Text>
        </View>

        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="What's on your mind?"
          placeholderTextColor={Colors.textSecondary}
          multiline
          autoFocus={!isRecording}
          style={styles.input}
        />

        <CategoryPicker value={category} onChange={setCategory} />

        <View style={styles.actionRow}>
          <View
            accessibilityLabel="Photo (coming in Phase 5)"
            style={styles.inertIcon}
          >
            <Text style={styles.inertIconLabel}>📷</Text>
          </View>
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>{locationLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  handleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  micSection: { alignItems: 'center', paddingVertical: Spacing.md },
  micOuter: { alignItems: 'center', justifyContent: 'center', width: 80, height: 80 },
  micRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,69,58,0.7)',
  },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonIdle: { opacity: 0.5 },
  micEmoji: { fontSize: 28 },
  micHint: { marginTop: Spacing.sm, fontSize: 11, textAlign: 'center', paddingHorizontal: Spacing.lg },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#444444' },
  orText: { fontSize: 11, color: '#444444', fontWeight: '700' },
  input: {
    fontSize: 16,
    color: Colors.textPrimary,
    flex: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  inertIcon: { opacity: 0.4, padding: Spacing.xs },
  inertIconLabel: { fontSize: 20 },
  locationPill: {
    flex: 1,
    marginHorizontal: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  locationPillText: { fontSize: 12, color: Colors.textSecondary },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.button,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveLabel: { fontSize: 16, color: Colors.background, fontWeight: '800' },
});
```

- [ ] **Step 2: Update MainStack.tsx to handle onSearchIntent**

The current `MainStack.tsx` mounts `NoteCaptureSheet` without `onSearchIntent`. Add a `useNavigation`-based handler that switches to the Search tab. Replace the entire file:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, AppState, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from './types';
import { Colors } from '../theme';
import TabNavigator from './TabNavigator';
import TripDetailScreen from '../screens/trip/TripDetailScreen';
import FloatingCaptureButton from '../components/FloatingCaptureButton';
import NoteCaptureSheet from '../components/NoteCaptureSheet';
import { useOnReconnect } from '../hooks/useConnectivity';
import { drainQueue } from '../services/noteService';

const Stack = createNativeStackNavigator<MainStackParamList>();

function MainStackInner() {
  const [captureOpen, setCaptureOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  useEffect(() => {
    void drainQueue();
  }, []);

  useOnReconnect(
    useCallback(() => {
      void drainQueue();
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainQueue();
    });
    return () => sub.remove();
  }, []);

  const handleSearchIntent = useCallback(
    (_query: string) => {
      // Navigate to the Search tab — query pre-fill wired in Phase 7
      navigation.navigate('Tabs', { screen: 'Search' });
    },
    [navigation],
  );

  return (
    <View style={styles.root}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: Colors.background },
          headerTitleStyle: { color: Colors.textPrimary },
          headerTintColor: Colors.accent,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen
          name="TripDetail"
          component={TripDetailScreen}
          options={{ title: '', headerBackTitle: 'Home' }}
        />
      </Stack.Navigator>
      <FloatingCaptureButton onPress={() => setCaptureOpen(true)} />
      <NoteCaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onStartTrip={() => setCaptureOpen(false)}
        onSearchIntent={handleSearchIntent}
      />
    </View>
  );
}

export default function MainStack() {
  return <MainStackInner />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
```

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx jest --no-coverage 2>&1 | tail -8
```

Expected: all 51 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && git add src/components/NoteCaptureSheet.tsx src/navigation/MainStack.tsx && git commit -m "feat: wire mic button with voice recording, intent detection, and pulsing ring"
```

- [ ] **Step 6: Rebuild and manually verify on simulator**

```bash
cd "/Users/rutvijdhotey/Documents/Personal Projects/Into Your Stories" && npx expo run:ios
```

Manual checklist:
- [ ] Tap 🎙️ → iOS prompts for microphone permission (first run)
- [ ] iOS prompts for speech recognition permission (first run)
- [ ] Mic button goes full opacity, ⏹ icon appears, red ring pulses
- [ ] Partial transcript text appears below mic as you speak
- [ ] Tap ⏹ to stop → "Thinking…" spinner shows
- [ ] Dictating a note (e.g. "Great pasta place near the Colosseum") → text fills the input, status badge turns green → tap Save → note appears in feed
- [ ] Dictating a search (e.g. "Find that pasta place I mentioned") → sheet closes → Search tab opens

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by |
|---|---|
| iOS Native STT (SFSpeechRecognizer) via `expo-speech-recognition` | Task 1 + Task 2 |
| Tap-to-start / tap-to-stop UX | Task 5 |
| Real-time partial transcript display | Task 2 (`useVoiceRecording` partial events) + Task 5 (micLabel) |
| Pulsing recording indicator | Task 5 (Animated ring) |
| Claude intent detection (save vs. search) | Task 3 (edge function) + Task 4 (voiceService) |
| Default to save on ambiguity / API error | Task 3 (edge function fallback) + Task 4 (voiceService fallback) |
| Save path: transcript fills text input | Task 5 (`setContent(result.text)`) |
| Search path: navigate to Search tab | Task 5 (`onSearchIntent` + MainStack handler) |
| Microphone + speech recognition permissions | Task 1 (app.json) + Task 2 (requestPermissionsAsync) |
| Permission denied → error state | Task 2 test + implementation |
| Dev build migration | Task 1 |
| All existing tests still pass | Tasks 1, 2, 4, 5 each run full suite |

### Placeholder scan

No TBD, TODO, "similar to task N", or "add appropriate error handling" in any step. Every code block is complete and runnable. ✓

### Type consistency check

- `useVoiceRecording()` returns `{ status, partialTranscript, finalTranscript, error, start, stop, reset }` — used as `voice.status`, `voice.finalTranscript`, `voice.partialTranscript`, `voice.start()`, `voice.stop()`, `voice.reset()` in Task 5. ✓
- `detectIntent(transcript: string): Promise<IntentResult>` — `IntentResult = { intent: VoiceIntent, text: string }` — used as `result.intent`, `result.text` in Task 5. ✓
- `NoteCaptureSheet` props now include `onSearchIntent: (query: string) => void` — added in Task 5 Step 1 and consumed in MainStack Task 5 Step 2. ✓
- `RecordingStatus = 'idle' | 'recording' | 'done' | 'error'` — used consistently across hook and NoteCaptureSheet (`isRecording`, `voice.status === 'done'`, `voice.status === 'error'`). ✓
