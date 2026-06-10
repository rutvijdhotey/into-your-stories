import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  QUEUE_KEY,
  enqueue,
  peekAll,
  removeByOfflineId,
  subscribe,
  type PendingNote,
} from '../offlineQueue';

beforeEach(async () => {
  await AsyncStorage.clear();
});

const pending = (overrides: Partial<PendingNote> = {}): PendingNote => ({
  offline_id: 'o1',
  user_id: 'u1',
  trip_id: 't1',
  content: 'hello',
  category: null,
  lat: null,
  lng: null,
  city: null,
  place_name: null,
  captured_at: '2026-05-22T12:00:00Z',
  occurred_at: null,
  photo_uris: [],
  ...overrides,
});

describe('offlineQueue', () => {
  it('starts empty', async () => {
    expect(await peekAll()).toEqual([]);
  });

  it('persists items in insertion order', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    const items = await peekAll();
    expect(items.map((x) => x.offline_id)).toEqual(['a', 'b']);
  });

  it('removes by offline_id without touching siblings', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    await enqueue(pending({ offline_id: 'c' }));
    await removeByOfflineId('b');
    const items = await peekAll();
    expect(items.map((x) => x.offline_id)).toEqual(['a', 'c']);
  });

  it('is a no-op when removing an unknown offline_id', async () => {
    await enqueue(pending({ offline_id: 'a' }));
    await removeByOfflineId('does-not-exist');
    expect((await peekAll()).map((x) => x.offline_id)).toEqual(['a']);
  });

  it('notifies subscribers on enqueue and remove', async () => {
    const events: number[] = [];
    const unsubscribe = subscribe((items) => events.push(items.length));
    await enqueue(pending({ offline_id: 'a' }));
    await enqueue(pending({ offline_id: 'b' }));
    await removeByOfflineId('a');
    unsubscribe();
    await enqueue(pending({ offline_id: 'c' }));
    expect(events).toEqual([1, 2, 1]);
  });

  it('uses a stable storage key', () => {
    expect(QUEUE_KEY).toBe('iys.offlineQueue.v1');
  });
});
