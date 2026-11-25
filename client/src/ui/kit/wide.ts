import { useEffect, useState } from 'preact/hooks';

/**
 * True from the width where two columns stand side by side. A screen that sets its panels in
 * columns there writes the page in that order, and in reading order on a phone, so a screen
 * reader and the Tab key follow what is seen.
 */
export function useWide() {
  const query = matchMedia('(min-width: 1280px)');
  const [wide, setWide] = useState(query.matches);
  useEffect(() => {
    const change = () => setWide(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return wide;
}
