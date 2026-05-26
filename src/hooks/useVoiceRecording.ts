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
