// Supabase mock. from() exposes select/update/delete chains:
//   .select('*').eq(col, val).order(...)        -> listBlogPosts  (resolves { data, error })
//   .select('*').eq('id', id).maybeSingle()     -> getBlogPost    (resolves { data, error })
//   .update({...}).eq('id', id)                 -> publish/unpublish (resolves { error })
//   .delete().eq('id', id)                      -> discardDraft   (resolves { error })
// functions.invoke -> generateBlog.
// `mock*` consts are referenced lazily inside the factory closures.
const mockInvoke = jest.fn();
const mockOrder = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ order: mockOrder, maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockDeleteEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));
const mockFrom = jest.fn((_table: string) => ({
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => (mockInvoke as jest.Mock)(...args) },
    from: (table: string) => mockFrom(table),
  },
}));

import {
  generateBlog,
  listBlogPosts,
  getBlogPost,
  publishPost,
  discardDraft,
  unpublish,
} from '../blogService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateBlog', () => {
  it('invokes generate-blog and returns the new post id', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { id: 'post-1' }, error: null });

    const id = await generateBlog('trip-1');

    expect(mockInvoke).toHaveBeenCalledWith('generate-blog', {
      body: { trip_id: 'trip-1' },
    });
    expect(id).toBe('post-1');
  });

  it('returns null when the function errors', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    expect(await generateBlog('trip-1')).toBeNull();
  });
});

describe('listBlogPosts', () => {
  it('selects the user rows newest first', async () => {
    mockOrder.mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null });

    const rows = await listBlogPosts('user-1');

    expect(mockFrom).toHaveBeenCalledWith('blog_posts');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockSelectEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rows).toHaveLength(2);
  });

  it('throws when the query errors', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: new Error('db') });
    await expect(listBlogPosts('user-1')).rejects.toThrow('db');
  });
});

describe('getBlogPost', () => {
  it('returns a single row by id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'post-1' }, error: null });

    const row = await getBlogPost('post-1');

    expect(mockSelectEq).toHaveBeenCalledWith('id', 'post-1');
    expect(row).toEqual({ id: 'post-1' });
  });

  it('throws when the query errors', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('not found') });
    await expect(getBlogPost('post-1')).rejects.toThrow('not found');
  });
});

describe('publishPost', () => {
  it('sets status published and a published_at timestamp', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await publishPost('post-1');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const patch = (mockUpdate.mock.calls as unknown[][])[0]?.[0] as { status: string; published_at: unknown };
    expect(patch.status).toBe('published');
    expect(typeof patch.published_at).toBe('string');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('throws when the update errors', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: new Error('conflict') });
    await expect(publishPost('post-1')).rejects.toThrow('conflict');
  });
});

describe('unpublish', () => {
  it('reverts to draft and clears published_at', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    await unpublish('post-1');

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'draft', published_at: null });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('throws when the update errors', async () => {
    mockUpdateEq.mockResolvedValueOnce({ error: new Error('conflict') });
    await expect(unpublish('post-1')).rejects.toThrow('conflict');
  });
});

describe('discardDraft', () => {
  it('deletes the row by id', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: null });

    await discardDraft('post-1');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('throws when the delete errors', async () => {
    mockDeleteEq.mockResolvedValueOnce({ error: new Error('nope') });
    await expect(discardDraft('post-1')).rejects.toThrow('nope');
  });
});
