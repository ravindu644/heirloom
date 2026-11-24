// The one door to the platform for main.tsx: the right Notifier, and on the phone the back button.

import type { Channels } from './capacitor.ts';
import type { Notifier } from './notifier.ts';
import { webNotifier } from './web.ts';

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
