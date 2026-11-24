import { useEffect, useState } from 'preact/hooks';
import type { Focus } from '../sync/focus.ts';

/**
 * Draws the calling screen again exactly when the shown second changes, so two devices side by
 * side turn over together. With nothing counting down only the ghost moves, and half a minute is
 * often enough. Returns a function that draws again now.
 */
export function useTick(focus: Focus): () => void {
  const [, tick] = useState(0);
  useEffect(() => {
    const v = focus.view();
    const counting = v.ends_at !== null && !v.over;
    const timer = setTimeout(() => tick((n) => n + 1), counting ? v.left_ms % 1000 || 1000 : 30000);
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    // A hidden tab's timers are throttled; be right the moment someone looks again.
    const look = () => tick((n) => n + 1);
    document.addEventListener('visibilitychange', look);
    return () => document.removeEventListener('visibilitychange', look);
  }, []);
  return () => tick((n) => n + 1);
}
