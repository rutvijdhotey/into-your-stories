// Supabase query-builder mock: from('trips').update({...}).eq('id', id) resolves to { error }.
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { updateCoverPhoto } from '../tripService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateCoverPhoto', () => {
  it('writes the cover_photo_url for the given trip', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(updateCoverPhoto('trip1', 'https://x/photos/u/trip-covers/trip1.jpg?v=1')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('trips');
    expect(mockUpdate).toHaveBeenCalledWith({
      cover_photo_url: 'https://x/photos/u/trip-covers/trip1.jpg?v=1',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'trip1');
  });

  it('writes null when removing the cover', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await updateCoverPhoto('trip1', null);

    expect(mockUpdate).toHaveBeenCalledWith({ cover_photo_url: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'trip1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('DB error') });

    await expect(updateCoverPhoto('trip1', null)).rejects.toThrow('DB error');
  });
});
