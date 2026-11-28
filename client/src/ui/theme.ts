import type { Theme } from '../sync/settings.ts';

// DESIGN.md, Light or dark. The choice is kept on the device by the engine, and mirrored here so
// the very first frame of a reload or a cold start, before the engine has loaded, is already in it.
const KEY = 'heirloom-theme';

// The page's own pair, one for a light system and one for a dark: what "System" puts back.
const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => [meta, meta.content] as const);

/** The theme this device last chose, from before the engine is up: 'system' when none or unreadable. */
export function keptTheme(): Theme {
  try {
    const kept = localStorage.getItem(KEY);
    return kept === 'light' || kept === 'dark' ? kept : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Puts the page in a theme: tokens.css follows `data-theme` on `<html>`, none for the system's.
 * The browser's bar colour follows too: for a picked theme both of the page's pair say that
 * theme's ground, read from the tokens, so they can never disagree with the page.
 */
export function applyTheme(theme: Theme, keep = true) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const ground = theme === 'system' ? null : getComputedStyle(root).getPropertyValue('--ground').trim();
  for (const [meta, own] of metas) meta.content = ground || own;
  // The demo shows a theme without choosing it: on the dev server it shares the app's storage.
  if (!keep) return;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // A private window or blocked storage: the engine still keeps the choice; a reload may start in the system's.
  }
}
