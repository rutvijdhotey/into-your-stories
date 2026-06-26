// Supabase query-builder mocks.
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { listDestinations, listPlacesByCity } from '../publicPlacesService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listDestinations', () => {
  it('reads the view ordered by total_visits desc and maps rows', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ city: 'Paris', place_count: 3, total_visits: 7, categories: ['food'] }],
      error: null,
    });
    mockSelect.mockReturnValueOnce({ order: mockOrder });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const result = await listDestinations();

    expect(mockFrom).toHaveBeenCalledWith('public_destinations');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('total_visits', { ascending: false });
    expect(result).toEqual([
      { city: 'Paris', place_count: 3, total_visits: 7, categories: ['food'] },
    ]);
  });

  it('throws when supabase errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    mockSelect.mockReturnValueOnce({ order: mockOrder });
    mockFrom.mockReturnValueOnce({ select: mockSelect });
    await expect(listDestinations()).rejects.toThrow('boom');
  });
});

describe('listPlacesByCity', () => {
  it('reads public_places filtered by city', async () => {
    mockEq.mockResolvedValueOnce({
      data: [{ id: 'p1', place_name: 'Cafe', city: 'Paris', visit_count: 2 }],
      error: null,
    });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const result = await listPlacesByCity('Paris');

    expect(mockFrom).toHaveBeenCalledWith('public_places');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockEq).toHaveBeenCalledWith('city', 'Paris');
    expect(result).toHaveLength(1);
    expect(result[0].place_name).toBe('Cafe');
  });

  it('throws when supabase errors', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: new Error('nope') });
    mockSelect.mockReturnValueOnce({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ select: mockSelect });
    await expect(listPlacesByCity('Paris')).rejects.toThrow('nope');
  });
});
