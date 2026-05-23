import { useCallback, useState } from 'react';
import { getCurrentLocation, type LocationFix } from '../services/locationService';

type UseLocationState = {
  fix: LocationFix | null;
  loading: boolean;
  fetch: () => Promise<LocationFix | null>;
};

export function useLocation(): UseLocationState {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getCurrentLocation();
      setFix(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fix, loading, fetch };
}
