import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueuePhotos,
  peekAllPhotos,
  removePhotosByKey,
  updatePhotoAttempt,
  subscribe,
  type PendingPhotoUpload,
} from '../photoUploadQueue';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const item = (overrides: Partial<PendingPhotoUpload> = {}): PendingPhotoUpload => ({
  id: 'item-1',
  offline_note_id: 'note-offline-1',
  user_id: 'u1',
  index: 0,
  local_uri: 'file:///photo.jpg',
  attempts: 0,
  status: 'pending',
  ...overrides,
});

describe('photoUploadQueue', () => {
  it('starts empty', async () => {
    expect(await peekAllPhotos()).toEqual([]);
  });

  it('enqueuePhotos adds one item per URI with correct shape', async () => {
    await enqueuePhotos(['file:///a.jpg', 'file:///b.jpg'], {
      user_id: 'u1',
      offline_note_id: 'note-1',
    });
    const items = await peekAllPhotos();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      user_id: 'u1',
      offline_note_id: 'note-1',
      local_uri: 'file:///a.jpg',
      index: 0,
      attempts: 0,
      status: 'pending',
    });
    expect(items[0].note_db_id).toBeUndefined();
    expect(items[1]).toMatchObject({
      local_uri: 'file:///b.jpg',
      index: 1,
    });
    // Items are distinct objects
    expect(items[0].local_uri).toBe('file:///a.jpg');
    expect(items[1].local_uri).toBe('file:///b.jpg');
  });

  it('enqueuePhotos with note_db_id stores db key', async () => {
    await enqueuePhotos(['file:///a.jpg'], {
      user_id: 'u1',
      note_db_id: 'db-note-1',
    });
    const [item] = await peekAllPhotos();
    expect(item.note_db_id).toBe('db-note-1');
    expect(item.offline_note_id).toBeUndefined();
  });

  it('is a no-op when enqueuing empty uris', async () => {
    await enqueuePhotos([], { user_id: 'u1', offline_note_id: 'note-1' });
    expect(await peekAllPhotos()).toEqual([]);
  });

  it('removePhotosByKey (offline_note_id) removes only matching items', async () => {
    await enqueuePhotos(['file:///a.jpg'], { user_id: 'u1', offline_note_id: 'note-A' });
    await enqueuePhotos(['file:///b.jpg'], { user_id: 'u1', offline_note_id: 'note-B' });

    await removePhotosByKey({ offline_note_id: 'note-A' });

    const remaining = await peekAllPhotos();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].offline_note_id).toBe('note-B');
  });

  it('removePhotosByKey (note_db_id) removes only matching items', async () => {
    await enqueuePhotos(['file:///a.jpg'], { user_id: 'u1', note_db_id: 'db-A' });
    await enqueuePhotos(['file:///b.jpg'], { user_id: 'u1', note_db_id: 'db-B' });

    await removePhotosByKey({ note_db_id: 'db-A' });

    const remaining = await peekAllPhotos();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].note_db_id).toBe('db-B');
  });

  it('removePhotosByKey is a no-op for an unknown key', async () => {
    await enqueuePhotos(['file:///a.jpg'], { user_id: 'u1', offline_note_id: 'note-A' });
    await removePhotosByKey({ offline_note_id: 'note-X' });
    expect(await peekAllPhotos()).toHaveLength(1);
  });

  it('updatePhotoAttempt increments attempts', async () => {
    await enqueuePhotos(['file:///a.jpg'], { user_id: 'u1', offline_note_id: 'note-1' });
    const before = (await peekAllPhotos())[0];
    expect(before.attempts).toBe(0);

    await updatePhotoAttempt(before.id);

    const after = (await peekAllPhotos())[0];
    expect(after.attempts).toBe(1);
    expect(after.status).toBe('pending');
  });

  it('updatePhotoAttempt marks item as failed at MAX_ATTEMPTS (5)', async () => {
    await enqueuePhotos(['file:///a.jpg'], { user_id: 'u1', offline_note_id: 'note-1' });
    const { id } = (await peekAllPhotos())[0];

    // Simulate 5 failures
    for (let i = 0; i < 5; i++) await updatePhotoAttempt(id);

    const item = (await peekAllPhotos())[0];
    expect(item.attempts).toBe(5);
    expect(item.status).toBe('failed');
  });

  it('notifies subscribers on enqueue and remove', async () => {
    const counts: number[] = [];
    const unsubscribe = subscribe((items) => counts.push(items.length));

    await enqueuePhotos(['file:///a.jpg', 'file:///b.jpg'], { user_id: 'u1', offline_note_id: 'note-1' });
    await removePhotosByKey({ offline_note_id: 'note-1' });

    unsubscribe();
    await enqueuePhotos(['file:///c.jpg'], { user_id: 'u1', offline_note_id: 'note-2' });

    expect(counts).toEqual([2, 0]);
  });
});
