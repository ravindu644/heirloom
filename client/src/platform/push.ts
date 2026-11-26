// This browser's Web Push subscription (protocol.md section 17): the server rings a tab that is
// closed or asleep in the background. It rides on the notification permission the person gave
// from a tap on start, and never asks for one itself.

/** What the server's push will say, in the app's own voice: four of each list, one `break`. */
export interface Words {
  lap: string[];
  take: string[];
  next: string[];
  break: string;
}

/** The parts of the browser's PushSubscription and PushManager used here. */
export interface Subscription {
  /** The key it was made with: a server that made itself a new key cannot push to an old one. */
  readonly options: { readonly applicationServerKey: ArrayBuffer | null };
  toJSON(): object;
  unsubscribe(): Promise<boolean>;
}
export interface Manager {
  getSubscription(): Promise<Subscription | null>;
  subscribe(options: PushSubscriptionOptionsInit): Promise<Subscription>;
}

export interface PushEnv {
  /** The page's push manager, or undefined where there is no service worker (dev, the phone). */
  manager(): Promise<Manager | undefined>;
  /** The server's VAPID public key, base64url (GET /api/push/key). */
  key(): Promise<string>;
  /** engine.request: the token and device go in, `offline` comes back when it cannot. */
  request(path: string, body: object): Promise<{ ok: boolean }>;
  /** What was last sent, kept with the account, so a sign in to another account sends again. */
  remembered(): unknown;
  remember(sent: string | null): void;
  /** Asked at each subscribe, so the break lengths they state are the ones in force then. */
  words(): Words;
  warn(error: unknown): void;
}

// PushManager takes the key as bytes everywhere; not every browser takes the base64url string.
const bytes = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export function createPush(env: PushEnv) {
  // One step at a time: "ring here" off and on again quickly must end subscribed, not in between.
  let queue: Promise<unknown> = Promise.resolve();
  const run = (step: () => Promise<unknown>) => {
    queue = queue.then(step).catch(env.warn);
    return queue;
  };
  // Set when the server may have dropped this browser's row: at an unsubscribe, and at a new
  // session (the row goes with the old token). What is remembered cannot be trusted then: at sign
  // out remember(null) lands after the account's database has closed, and a token the server
  // refused is replaced by a sign in that never goes out at all.
  let gone = false;

  return {
    /** Subscribes if it can, and tells the server only what it does not already have. */
    subscribe: () =>
      run(async () => {
        const manager = await env.manager();
        if (!manager) return;
        const key = bytes(await env.key());
        let subscription = await manager.getSubscription();
        // Made with another key (the server's data was recreated): its pushes would be refused
        // with 403 for ever, so it is replaced.
        const made = subscription?.options.applicationServerKey;
        if (subscription && !(made && same(new Uint8Array(made), key))) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const body = { subscription: subscription.toJSON(), words: env.words() };
        const sent = JSON.stringify(body);
        if (!gone && sent === env.remembered()) return;
        // Offline or signed out: nothing is remembered, so the next start tries again.
        if ((await env.request('/api/push/subscribe', body)).ok) {
          env.remember(sent);
          gone = false;
        }
      }),
    /** A new session: the next subscribe tells the server whatever is remembered. In the queue, so an earlier subscribe does not clear it. */
    renew: () => run(async () => void (gone = true)),
    /** Stops push to this browser. `server` too while signed in; at sign out the server drops the row with the token. */
    unsubscribe: (server: boolean) =>
      run(async () => {
        gone = true;
        env.remember(null);
        if (server) await env.request('/api/push/unsubscribe', {});
        const subscription = await (await env.manager())?.getSubscription();
        await subscription?.unsubscribe();
      }),
  };
}
