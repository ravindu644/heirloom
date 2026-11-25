// Who may invite, decided by the owner (protocol section 10). Only the owner's device asks.
// The lead wrote the interface; the screens build against it, core makes it over engine.request.
import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

export interface AdminView {
  username: string;
  role: 'owner' | 'admin';
}

/** `error` is a code from protocol section 10 (`forbidden`, `unknown`, `bad_request`, `slow_down`, `server`) or `offline`. */
export type AdminResult = { ok: true } | { ok: false; error: string; retry_after?: number };

export interface Admins {
  /** The owner first, then the admins by name. Null until the server has answered once since the app started. */
  readonly list: ReadonlySignal<readonly AdminView[] | null>;
  /** Asks the server again. Called when the panel comes on screen; `raise` and `lower` keep `list` right by themselves. */
  refresh(): Promise<void>;
  /** Makes the member with this username an admin. `unknown`: nobody by that name on this server. */
  raise(username: string): Promise<AdminResult>;
  /** Makes an admin a member again. */
  lower(username: string): Promise<AdminResult>;
}

// The server's order: the owner first, then the admins by name.
const order = (a: AdminView, b: AdminView) => (a.role === b.role ? (a.username < b.username ? -1 : 1) : a.role === 'owner' ? -1 : 1);

export function createAdmins(engine: Pick<Engine, 'request' | 'account'>): Admins & { close(): void } {
  const list = signal<readonly AdminView[] | null>(null);
  // Each account hears its own answer: the last one's list is not shown to the next.
  const close = effect(() => {
    void engine.account.value;
    list.value = null;
  });

  async function set(username: string, role: 'admin' | 'member'): Promise<AdminResult> {
    // The server holds names in lower case, and the list here names them as it does.
    const name = username.trim().toLowerCase();
    const answer = await engine.request('/api/admins/set', { username: name, role });
    if (!answer.ok) return answer;
    const held = list.peek();
    // Before the first answer there is no list to keep right: `refresh` brings it whole.
    if (held) list.value = [...held.filter((it) => it.username !== name), ...(role === 'admin' ? [{ username: name, role }] : [])].sort(order);
    return { ok: true };
  }

  return {
    list,
    async refresh() {
      const who = engine.account.peek();
      const answer = await engine.request('/api/admins/list', {});
      // Not when it was answered for someone who has since signed out.
      if (!answer.ok || engine.account.peek() !== who) return;
      const said: unknown[] = Array.isArray(answer.data.admins) ? answer.data.admins : [];
      list.value = said.filter((it: any): it is AdminView => typeof it?.username === 'string' && (it.role === 'owner' || it.role === 'admin')).sort(order);
    },
    raise: (username) => set(username, 'admin'),
    lower: (username) => set(username, 'member'),
    close,
  };
}
