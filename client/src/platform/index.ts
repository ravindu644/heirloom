// The one door to the platform for main.tsx: the right Notifier, the back button on the phone, and
// a way to hear that the app is in front again.

import type { Channels } from './capacitor.ts';
import type { Notifier } from './notifier.ts';
import { webNotifier, whenVisible } from './web.ts';

// The phone's WebView has window.Capacitor before any script of ours runs. Reading it here, rather
// than importing @capacitor/core, keeps the browser's first load free of native code: the phone's
// half is a separate chunk only the phone fetches.
const native = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

/** Call once at start. `channels` names the phone's two notification channels; the browser ignores them. */
export async function startPlatform(channels: Channels): Promise<Notifier> {
  if (!native) return webNotifier();
  const phone = await import('./capacitor.ts');
  phone.backButton();
  return phone.capacitorNotifier(channels);
}

/**
 * Runs `run` each time the app is in front again, for what the clock passed while nothing ran (the
 * connection, the day). The browser: the page comes back into view. The phone: Capacitor's resume,
 * because its WebView reports `visible` even with the screen off and never fires visibilitychange.
 */
export function onFront(run: () => void): void {
  if (!native) return whenVisible(document)(run);
  void import('./capacitor.ts').then((phone) => phone.onFront(run));
}
