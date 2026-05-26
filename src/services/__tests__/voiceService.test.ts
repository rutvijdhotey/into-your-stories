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
