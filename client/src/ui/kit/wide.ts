import { useEffect, useState } from 'preact/hooks';

/**
 * True from the width where two columns stand side by side. A screen that sets its panels in
 * columns there writes the page in that order, and in reading order on a phone, so a screen
 * reader and the Tab key follow what is seen.
 */
export const useWide = () => useMedia('(min-width: 1280px)');

/** True from the width where the bottom bar becomes the sidebar. */
export const useSidebar = () => useMedia('(min-width: 720px)');

function useMedia(media: string) {
  const query = matchMedia(media);
  const [matches, setMatches] = useState(query.matches);
  useEffect(() => {
    const change = () => setMatches(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return matches;
}
