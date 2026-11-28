// The one door to the platform for main.tsx: the right Notifier, the back button on the phone, the
// theme for the phone's bars, and a way to hear that the app is in front again.

import type { Channels } from './capacitor.ts';
import type { Notifier } from './notifier.ts';
import type { Theme } from '../sync/settings.ts';
import { webNotifier, whenVisible } from './web.ts';
import type { PushFrom } from './web.ts';

// The phone's WebView has window.Capacitor before any script of ours runs. Reading it here, rather
// than importing @capacitor/core, keeps the browser's first load free of native code: the phone's
// half is a separate chunk only the phone fetches.
const native = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

/**
 * Call once at start. `channels` names the phone's two notification channels; the browser ignores
 * them. `push` is what the browser needs for Web Push; the phone ignores it, it has its own alarm.
 */
export async function startPlatform(channels: Channels, push?: PushFrom): Promise<Notifier> {
  if (!native) return webNotifier(push);
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

/**
 * Light or dark for what the page does not draw: on the phone, the status and navigation bars and
 * the activity around the WebView. The page sets its own `data-theme`. Call at start and on every
 * change; the same theme twice does nothing. The browser has nothing else to set.
 */
export function setNight(theme: Theme): void {
  if (native) void import('./capacitor.ts').then((phone) => phone.setNight(theme));
}
