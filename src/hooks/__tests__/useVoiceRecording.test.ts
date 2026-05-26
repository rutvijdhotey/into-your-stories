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
