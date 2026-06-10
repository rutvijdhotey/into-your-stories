import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listNotes } from '../services/noteService';
import { peekAll, subscribe, type PendingNote } from '../services/offlineQueue';
import {
  peekAllPhotos,
  subscribe as subscribePhotos,
  type PendingPhotoUpload,
} from '../services/photoUploadQueue';
import type { Note } from '../services/noteHelpers';

export type PhotoStatus = 'uploading' | 'failed' | null;

export type FeedItem =
  | { kind: 'note'; note: Note; photoStatus: PhotoStatus }
  | { kind: 'pending'; pending: PendingNote };

type State = {
  items: FeedItem[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

function derivePhotoStatus(uploads: PendingPhotoUpload[], noteId: string, isOfflineId: boolean): PhotoStatus {
  const group = isOfflineId
    ? uploads.filter((p) => p.offline_note_id === noteId)
    : uploads.filter((p) => p.note_db_id === noteId);

  if (group.length === 0) return null;
  if (group.some((p) => p.status === 'pending')) return 'uploading';
  if (group.some((p) => p.status === 'failed')) return 'failed';
  return null;
}

export function useNotes(tripId: string | undefined): State {
  const [notes, setNotes] = useState<Note[]>([]);
  const [pending, setPending] = useState<PendingNote[]>([]);
  const [photoUploads, setPhotoUploads] = useState<PendingPhotoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!tripId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listNotes(tripId);
      setNotes(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`notes:${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setNotes((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as Note;
              if (prev.some((n) => n.id === next.id)) return prev;
              return [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as Note;
              return prev.map((n) => (n.id === next.id ? next : n));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<Note>;
              return prev.filter((n) => n.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;

    void peekAll().then((items) => {
      if (!cancelled) setPending(items);
    });

    const unsubscribe = subscribe((items) => {
      setPending(items);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void peekAllPhotos().then((items) => {
      if (!cancelled) setPhotoUploads(items);
    });

    const unsubscribe = subscribePhotos((items) => {
      setPhotoUploads(items);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const filteredPending = tripId ? pending.filter((p) => p.trip_id === tripId) : [];

  const items: FeedItem[] = mergeFeed(notes, filteredPending, photoUploads);

  return { items, loading, error, refresh };
}

function mergeFeed(
  notes: Note[],
  pending: PendingNote[],
  photoUploads: PendingPhotoUpload[],
): FeedItem[] {
  const noteIds = new Set(notes.map((n) => n.offline_id));
  const stillPending = pending.filter((p) => !noteIds.has(p.offline_id));

  const merged: FeedItem[] = [
    ...notes.map((note) => ({
      kind: 'note' as const,
      note,
      photoStatus: derivePhotoStatus(photoUploads, note.offline_id ?? note.id, Boolean(note.offline_id)),
    })),
    ...stillPending.map((p) => ({ kind: 'pending' as const, pending: p })),
  ];

  merged.sort((a, b) => {
    const ta =
      a.kind === 'note'
        ? (a.note.occurred_at ?? a.note.captured_at)
        : (a.pending.occurred_at ?? a.pending.captured_at);
    const tb =
      b.kind === 'note'
        ? (b.note.occurred_at ?? b.note.captured_at)
        : (b.pending.occurred_at ?? b.pending.captured_at);
    return tb.localeCompare(ta);
  });

  return merged;
}
