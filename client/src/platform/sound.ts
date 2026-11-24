// The bell, drawn with Web Audio so there is no file to fetch or cache. Section 8 brings the
// licensed set; until then this is the one sound.

// A small struck bell: a few inharmonic partials, the high ones dying first so the strike is bright
// and the tail is round. The second partial sits 4 Hz off the first, which gives the slow shimmer
// a real bell has. Peaks sum to 0.5, so even all in phase they stay clear of clipping.
// [frequency in Hz, peak, seconds to fade by 80 dB]
const PARTIALS: [number, number, number][] = [
  [880, 0.16, 1.2],
  [884, 0.08, 1.0],
  [1760, 0.1, 0.8],
  [2429, 0.08, 0.5],
  [3582, 0.05, 0.3],
  [4752, 0.03, 0.18],
];

/** Schedules one strike on `ctx`, starting at its `when`. Works on an `OfflineAudioContext` too. */
export function strike(ctx: BaseAudioContext, when: number = ctx.currentTime): void {
  for (const [hz, peak, fade] of PARTIALS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = hz;
    // 3 ms up rather than a jump: a step from silence clicks.
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(peak * 1e-4, when + fade);
    // The exponential never reaches zero; the last step does, so the oscillator stops in silence.
    gain.gain.linearRampToValueAtTime(0, when + fade + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + fade + 0.05);
  }
}

export interface Bell {
  /** Rings once. Before `unlock`, or where the browser still refuses audio, it does nothing. */
  play(): void;
  /** Call from inside a tap or key handler: browsers start audio only from a gesture. */
  unlock(): void;
}

/** How long the audio stays open after a strike: the bell's 1.25 s and a little over. */
export const REST_MS = 2000;

/**
 * A bell that opens audio only to ring, for the phone, where the WebView needs no gesture to play
 * and Android rings the bell itself whenever it can. A context left running keeps an audio stream
 * open for as long as the app lives; suspended, the stream is let go.
 */
export function bellOnDemand(make: () => AudioContext, schedule: (run: () => void, ms: number) => () => void): () => void {
  let ctx: AudioContext | undefined;
  let rest = () => {};
  return () => {
    try {
      ctx ??= make();
    } catch {
      return; // no audio here
    }
    const c = ctx;
    c.resume()
      .then(() => {
        strike(c);
        rest();
        rest = schedule(() => void c.suspend().catch(() => {}), REST_MS);
      })
      .catch(() => {});
  };
}

/** `make` builds the audio context; it may be missing or throw, as in Node or an old browser. */
export function createBell(make: () => AudioContext): Bell {
  let ctx: AudioContext | undefined;
  return {
    play() {
      if (ctx?.state === 'running') strike(ctx);
    },
    unlock() {
      try {
        ctx ??= make();
        // Also wakes a context the system suspended later, as iOS does after a call.
        ctx.resume().catch(() => {});
      } catch {
        // No audio here; the bell stays silent and the notification still says it.
      }
    },
  };
}
