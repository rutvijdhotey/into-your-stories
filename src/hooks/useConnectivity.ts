import { useEffect, useRef, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export function useConnectivity(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((s) => {
      if (mounted) setIsOnline(deriveOnline(s));
    });
    const unsubscribe = NetInfo.addEventListener((s) => {
      setIsOnline(deriveOnline(s));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return { isOnline };
}

export function useOnReconnect(onReconnect: () => void): void {
  const prevOnline = useRef<boolean>(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((s) => {
      const next = deriveOnline(s);
      if (!prevOnline.current && next) onReconnect();
      prevOnline.current = next;
    });
    return unsubscribe;
  }, [onReconnect]);
}

function deriveOnline(s: NetInfoState): boolean {
  return Boolean(s.isConnected) && s.isInternetReachable !== false;
}
