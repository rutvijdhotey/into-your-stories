// Supabase query-builder mock: from('notes').update({...}).eq('id', id) and
// from('notes').delete().eq('id', id) both resolve to { error }.
const mockEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockDelete = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate, delete: mockDelete }));

// `from` is referenced lazily so the mock-prefixed const is initialized by the
// time noteService actually calls it (imports are hoisted above these consts).
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

import { updateNote, deleteNote, type UpdateNoteInput } from '../noteService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateNote', () => {
  const patch: UpdateNoteInput = {
    content: 'Updated text',
    category: 'food',
    photo_urls: ['https://x/photos/u/n/0.jpg'],
  };

  it('updates the note and resets tagging_status to pending', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(updateNote('note-1', patch)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockUpdate).toHaveBeenCalledWith({
      content: 'Updated text',
      category: 'food',
      photo_urls: ['https://x/photos/u/n/0.jpg'],
      tagging_status: 'pending',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('persists a null category', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await updateNote('note-2', { ...patch, category: null });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ category: null }),
    );
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('update failed') });

    await expect(updateNote('note-1', patch)).rejects.toThrow('update failed');
  });
});

describe('deleteNote', () => {
  it('deletes the note by id', async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await expect(deleteNote('note-1')).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith('notes');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'note-1');
  });

  it('throws when supabase returns an error', async () => {
    mockEq.mockResolvedValueOnce({ error: new Error('delete failed') });

    await expect(deleteNote('note-1')).rejects.toThrow('delete failed');
  });
});
