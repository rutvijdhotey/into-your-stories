import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listBlogPosts } from '../services/blogService';
import type { BlogPost } from '../services/blogHelpers';

type State = {
  posts: BlogPost[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

export function useBlogPosts(userId: string | undefined): State {
  // Per-instance random suffix avoids the Phase 3 channel-collision gotcha.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listBlogPosts(userId);
      setPosts(rows);
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
      .channel(`blog_posts:${userId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blog_posts', filter: `user_id=eq.${userId}` },
        (payload) => {
          setPosts((prev) => {
            if (payload.eventType === 'INSERT') {
              const next = payload.new as BlogPost;
              if (prev.some((p) => p.id === next.id)) return prev;
              return [next, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const next = payload.new as BlogPost;
              return prev.map((p) => (p.id === next.id ? next : p));
            }
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<BlogPost>;
              return prev.filter((p) => p.id !== old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId]);

  return { posts, loading, error, refresh };
}
