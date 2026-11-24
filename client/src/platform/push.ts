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
  words: Words;
  warn(error: unknown): void;
}

// PushManager takes the key as bytes everywhere; not every browser takes the base64url string.
const bytes = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function createPush(env: PushEnv) {
  // One step at a time: "ring here" off and on again quickly must end subscribed, not in between.
  let queue: Promise<unknown> = Promise.resolve();
  const run = (step: () => Promise<unknown>) => {
    queue = queue.then(step).catch(env.warn);
    return queue;
  };

  return {
    /** Subscribes if it can, and tells the server only what it does not already have. */
    subscribe: () =>
      run(async () => {
        const manager = await env.manager();
        if (!manager) return;
        const subscription =
          (await manager.getSubscription()) ??
          (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(await env.key()) }));
        const body = { subscription: subscription.toJSON(), words: env.words };
        const sent = JSON.stringify(body);
        if (sent === env.remembered()) return;
        // Offline or signed out: nothing is remembered, so the next start tries again.
        if ((await env.request('/api/push/subscribe', body)).ok) env.remember(sent);
      }),
    /** Stops push to this browser. `server` too while signed in; at sign out the server drops the row with the token. */
    unsubscribe: (server: boolean) =>
      run(async () => {
        env.remember(null);
        if (server) await env.request('/api/push/unsubscribe', {});
        const subscription = await (await env.manager())?.getSubscription();
        await subscription?.unsubscribe();
      }),
  };
}
