import { useCallback, useRef, useState } from 'react';
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
  // Track whether we received a final result before the `end` event fires
  const hasFinalRef = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    const top = event.results[0];
    if (!top) return;
    if (event.isFinal) {
      hasFinalRef.current = true;
      setFinalTranscript(top.transcript);
      setPartialTranscript('');
      setStatus('done');
    } else {
      setPartialTranscript(top.transcript);
    }
  });

  // If the session ends without ever producing a final result (user tapped stop
  // before speaking, or iOS auto-stopped on silence) return to idle so the mic
  // button is tappable again rather than staying stuck on "Listening…".
  useSpeechRecognitionEvent('end', () => {
    setStatus((prev) => (prev === 'recording' && !hasFinalRef.current ? 'idle' : prev));
    hasFinalRef.current = false;
  });

  // iOS fires nomatch when speech was heard but couldn't be transcribed.
  useSpeechRecognitionEvent('nomatch', () => {
    setStatus((prev) => (prev === 'recording' ? 'idle' : prev));
    setPartialTranscript('');
    hasFinalRef.current = false;
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.message ?? event.error ?? 'Speech recognition failed');
    setStatus('error');
    hasFinalRef.current = false;
  });

  const start = useCallback(async () => {
    if (status === 'recording') return;
    // Show the ring immediately — don't wait for the async permission round-trip.
    setStatus('recording');
    setPartialTranscript('');
    setFinalTranscript('');
    setError(null);
    hasFinalRef.current = false;
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone or speech recognition permission denied');
      setStatus('error');
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', continuous: false, interimResults: true });
  }, [status]);

  const stop = useCallback(() => {
    if (status !== 'recording') return;
    ExpoSpeechRecognitionModule.stop();
  }, [status]);

  const reset = useCallback(() => {
    setStatus('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setError(null);
    hasFinalRef.current = false;
  }, []);

  return { status, partialTranscript, finalTranscript, error, start, stop, reset };
}
