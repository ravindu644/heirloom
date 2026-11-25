// Invite links, for an admin or the owner (protocol section 10). A member's device never asks.
// The lead wrote the interface; the screens build against it, core makes it over engine.request.
import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

export interface InviteView {
  /** The invite itself: the last part of its link, and what `renew` and `takeBack` name it by. */
  invite: string;
  /** The whole link to give away: `<server>/#/join/<invite>`. */
  link: string;
  /** Server time in ms. */
  created: number;
  expires: number;
}

/** `error` is a code from protocol section 10 (`forbidden`, `full`, `unknown`, `slow_down`, `server`) or `offline`. */
export type InviteResult = { ok: true; invite?: InviteView } | { ok: false; error: string; retry_after?: number };

export interface Invites {
  /**
   * The invites still open, oldest first. Null until the server has answered once since the app
   * started; `'forbidden'` once the server has said this account may not ask (its role changed).
   */
  readonly open: ReadonlySignal<readonly InviteView[] | null | 'forbidden'>;
  /** Asks the server again. Called when the panel comes on screen; `make`, `renew` and `takeBack` keep `open` right by themselves. */
  refresh(): Promise<void>;
  /** Makes one, good for 7 days. `invite` in the answer is the new one. */
  make(): Promise<InviteResult>;
  /** 7 days from now. One that had run out comes back under a new link: `invite` in the answer. */
  renew(invite: string): Promise<InviteResult>;
  takeBack(invite: string): Promise<InviteResult>;
}

export function createInvites(engine: Pick<Engine, 'request' | 'server' | 'account' | 'role' | 'roleSaid'>): Invites & { close(): void } {
  const open = signal<readonly InviteView[] | null | 'forbidden'>(null);
  const stops = [
    // Another account, or another role for this one: what was heard no longer holds, and may be asked again.
    effect(() => {
      void engine.account.value;
      void engine.role.value;
      open.value = null;
    }),
    // The server has said the role since it said no. The same role, perhaps: lowered and raised
    // again between two welcomes looks like no change from here, and the no is out of date all the same.
    effect(() => {
      void engine.roleSaid.value;
      if (open.peek() === 'forbidden') open.value = null;
    }),
  ];

  const view = (said: any): InviteView | null =>
    typeof said?.invite === 'string' && typeof said.created === 'number' && typeof said.expires === 'number'
      ? { invite: said.invite, link: `${engine.server}/#/join/${said.invite}`, created: said.created, expires: said.expires }
      : null;

  async function ask(what: string, body: object = {}) {
    // The server said no: nothing is made, renewed or taken back until it has said the role again.
    // Asking for the list is how a person looks again, and that always goes to the server.
    if (what !== 'list' && open.peek() === 'forbidden') return { ok: false as const, error: 'forbidden' };
    const who = engine.account.peek();
    const answer = await engine.request(`/api/invites/${what}`, body);
    // Answered for someone who has since signed out: it says nothing of whoever is here now.
    if (engine.account.peek() !== who) return { ok: false as const, error: 'offline' };
    if (!answer.ok && answer.error === 'forbidden') open.value = 'forbidden';
    return answer;
  }

  // Changes the list when there is one. Before the first answer there is nothing to keep right: `refresh` brings it whole.
  function put(change: (list: readonly InviteView[]) => InviteView[]) {
    const list = open.peek();
    // The server's order: oldest first, the invite itself between two made in the same ms.
    if (list && list !== 'forbidden') open.value = change(list).sort((a, b) => a.created - b.created || (a.invite < b.invite ? -1 : 1));
  }
  const without = (invite?: string) => (list: readonly InviteView[]) => list.filter((it) => it.invite !== invite);

  async function gives(what: string, old?: string): Promise<InviteResult> {
    const answer = await ask(what, old === undefined ? {} : { invite: old });
    // Used or taken back on another device: it is not open, whatever this list said.
    if (!answer.ok && answer.error === 'unknown') put(without(old));
    if (!answer.ok) return answer;
    const invite = view(answer.data.invite);
    // A 200 that names no invite is the server's own fault, and is said as one.
    if (!invite) return { ok: false, error: 'server' };
    put((list) => [...without(old)(list), invite]);
    return { ok: true, invite };
  }

  return {
    open,
    async refresh() {
      const answer = await ask('list');
      if (answer.ok) open.value = (Array.isArray(answer.data.invites) ? answer.data.invites : []).flatMap((said: unknown) => view(said) ?? []);
    },
    make: () => gives('create'),
    renew: (invite) => gives('renew', invite),
    async takeBack(invite) {
      const answer = await ask('revoke', { invite });
      if (!answer.ok) return answer;
      put(without(invite));
      return { ok: true };
    },
    close: () => stops.forEach((stop) => stop()),
  };
}
