import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTripById } from '../services/tripService';
import type { Trip } from '../services/tripHelpers';

type UseTripDetailState = {
  trip: Trip | null;
  loading: boolean;
  error: Error | null;
};

export function useTripDetail(tripId: string): UseTripDetailState {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const row = await getTripById(tripId);
        if (!cancelled) {
          setTrip(row);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`trip:${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setTrip(null);
          } else {
            setTrip(payload.new as Trip);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [tripId]);

  return { trip, loading, error };
}
