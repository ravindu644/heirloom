// Which server the app keeps step with, where the app is not served by one: the phone app. In a
// browser the page's own origin is the server and none of this is used.
// The lead wrote the interface; the screens build against it, core makes it (protocol section 10).
import type { OpenStore } from '../store/store.ts';
import { INSTALL_DB } from './engine.ts';
import { health } from './transport.ts';
import type { Wire } from './transport.ts';

/**
 * Why an address was not taken: `invalid` (not an address or an invite link), `unreachable`
 * (nothing answered over https or http), `not-heirloom` (something answered, but not a heirloom
 * server), `signed-in` (an account is open here: sign out first, so nothing unsent is stranded).
 */
export type ServerRefusal = 'invalid' | 'unreachable' | 'not-heirloom' | 'signed-in';

export interface ServerChoice {
  /** The server in use, as an origin (`http://192.168.1.20:8787`), or null before one is chosen. */
  readonly address: string | null;
  /** True when `address` is plain http to anything but this device itself: what is sent can be read on the way. */
  readonly plain: boolean;
  /**
   * Takes what was typed: an address, with or without a scheme (none: https is tried, then http),
   * or an invite link, which carries the address and the invite. If a heirloom server answers
   * there, the address is kept and the app starts again on it; this then never resolves. It
   * resolves only with why not, and nothing is changed.
   */
  choose(typed: string): Promise<ServerRefusal>;
  /**
   * The invite a pasted link carried into the `choose` that started the app. It is held, across
   * restarts of the app, until `forgetInvite`: a person may leave for their password manager and
   * come back to a page that started again.
   */
  heldInvite(): string | null;
  /** Lets the held invite go: it made an account, or the server refused it. */
  forgetInvite(): void;
}

export interface ServerEnv extends Pick<Wire, 'fetch' | 'schedule'> {
  openStore: OpenStore;
  /** Starts the app again: it then finds the address that was kept. */
  reload(): void;
  /** The address the build was made with. Only what `address` is until one has been kept. */
  first?: string;
}

// A host with or without a port, a scheme before it or not, a slash after it or not, and
// perhaps the rest of an invite link, ending as `inviteIn` lets one end. No path, no query
// before that, no name and password.
const TYPED = /^(https?:\/\/)?([^\s/?#@]+)\/?(?:#\/join\/([A-Za-z0-9_-]+)\/?(?:\?\S*)?)?$/i;

/**
 * The invite in what a person pasted: a whole link, with or without a slash or a query after
 * it, or the invite by itself. Null for anything else, and never an empty string: a fresh server
 * reads an empty invite as its own setting up.
 */
export const inviteIn = (pasted: string): string | null => /(?:^|#\/join\/)([A-Za-z0-9_-]+)\/?(?:\?\S*)?$/.exec(pasted.trim())?.[1] ?? null;

// What was typed as the origins to try, in order, and the invite it carried. Null when it is not an address.
function read(typed: string): { origins: string[]; invite: string | null } | null {
  const [, scheme, host, invite] = TYPED.exec(typed.trim()) ?? [];
  if (!host) return null;
  try {
    // URL is the judge of what a host and a port are, and gives the origin in one spelling.
    return { origins: (scheme ? [scheme] : ['https://', 'http://']).map((tried) => new URL(tried + host).origin), invite: invite ?? null };
  } catch {
    return null;
  }
}

/**
 * Whether an origin (`http://192.168.1.20:8787`, or the page's own `location.origin`) is plain
 * http to anything but this device itself, by any of its three names. The one place that is decided.
 */
export const isPlain = (origin: string | null): boolean => /^http:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$))/i.test(origin ?? '');

/**
 * Reads the choice from this install's own storage, where the session is: it is there before the
 * engine is made, and a sign out, which deletes only the account's database, leaves it.
 */
export async function createServerChoice(env: ServerEnv): Promise<ServerChoice> {
  const store = await env.openStore(INSTALL_DB);
  const kept = (await store.load()).meta;
  // The build's address is read as a typed one is: a slash left on its end would be in every request and every link.
  const address = typeof kept.server === 'string' ? kept.server : (read(env.first ?? '')?.origins[0] ?? null);
  let invite = typeof kept.invite === 'string' ? kept.invite : null;

  return {
    address,
    plain: isPlain(address),

    async choose(typed) {
      // Asked of the store, not remembered: the engine signs in and out through the same store.
      if ((await store.load()).meta.session) return 'signed-in';
      const found = read(typed);
      if (!found) return 'invalid';
      let refusal: ServerRefusal = 'unreachable';
      for (const origin of found.origins) {
        const said = await health(env, origin).catch(() => undefined);
        if (said === undefined) continue;
        refusal = 'not-heirloom';
        if (said?.ok !== true || typeof said.version !== 'string') continue;
        // The invite is written even when there is none, so one from an older link is not offered on this server.
        await store.write({ meta: { server: origin, invite: found.invite } });
        env.reload();
        return new Promise<never>(() => {});
      }
      return refusal;
    },

    heldInvite: () => invite,

    forgetInvite() {
      invite = null;
      // If the store refuses, it is held once more after the next start, and the server refuses it there.
      store.write({ meta: { invite: null } }).catch(() => {});
    },
  };
}
