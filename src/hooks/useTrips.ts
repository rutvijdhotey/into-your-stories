import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { listTrips } from '../services/tripService';
import type { Trip } from '../services/tripHelpers';

type UseTripsState = {
  trips: Trip[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  optimisticRemove: (id: string) => void;
};

export function useTrips(userId: string | undefined): UseTripsState {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTrips([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listTrips(userId);
      setTrips(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`trips:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `user_id=eq.${userId}` },
        (payload) => {
          setTrips((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as Trip;
              if (prev.some((t) => t.id === next.id)) return prev;
              return [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as Trip;
              return prev.map((t) => (t.id === next.id ? next : t));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<Trip>;
              return prev.filter((t) => t.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const optimisticRemove = useCallback((id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { trips, loading, error, refresh, optimisticRemove };
}
