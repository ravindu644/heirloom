// A way back in (protocol section 10): the owner makes a link that sets a new password for one
// account, once; whoever holds the link uses it, signed out. Nothing here reads a password back.
import { effect, signal } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import type { AccountResult, Engine } from './engine.ts';

/** A reset that is still open, as the owner's list has it: never with the link, which is shown once, when it is made. */
export interface ResetView {
  username: string;
  /** Server time in ms. It is good for 24 hours. */
  created: number;
  expires: number;
}

/** What `create` gives, and gives once: the server keeps only a hash of `reset`. */
export interface ResetLink extends ResetView {
  /** The last part of the link. */
  reset: string;
  /** The whole link to give away: `<server>/#/reset/<reset>`. */
  link: string;
}

/** `error` is a code from protocol section 10 or `offline`, as the invite and admin calls give it. */
type Refusal = { ok: false; error: string; retry_after?: number };

export interface Resets {
  /**
   * For the owner. The resets still open, oldest first. Null until the server has answered once
   * since the app started, and again when another account signs in.
   */
  readonly open: ReadonlySignal<readonly ResetView[] | null>;
  /** Asks the server for the list again. Called when the panel comes on screen; `create` and `revoke` keep `open` right by themselves. */
  refresh(): Promise<void>;
  /**
   * Makes a link for that account; one it already had is dead from this moment. `unknown`: nobody
   * by that name. `bad_request`: the owner, whose way back is the server's own command.
   * `forbidden`: this account is not the owner. `offline`: no connection.
   */
  create(username: string): Promise<{ ok: true; reset: ResetLink } | Refusal>;
  /** Takes an open reset back. None open for that name is fine too; `unknown` is a name the server does not have. */
  revoke(username: string): Promise<{ ok: true } | Refusal>;

  /**
   * For whoever holds the link, signed out. Whose password it sets, to say so before asking for
   * one. `reset`: the link is unknown, used, taken back or run out, and the server says no more.
   */
  look(reset: string): Promise<{ ok: true; username: string } | Refusal>;
  /**
   * Sets the new password and signs this device in, exactly as a sign in does: the account's
   * own database on this device is opened, and what it had not yet sent is sent. Every other
   * device of the account is signed out by the server. Errors: `reset`, `bad_request` (the
   * password breaks the rule), `slow_down`, `unsaved`, `offline`.
   */
  use(reset: string, password: string): Promise<AccountResult>;
}

// The server's order: oldest first, the name between two made in the same ms.
const order = (a: ResetView, b: ResetView) => a.created - b.created || (a.username < b.username ? -1 : 1);

export function createResets(engine: Pick<Engine, 'request' | 'server' | 'account' | 'resetLook' | 'resetUse'>): Resets & { close(): void } {
  const open = signal<readonly ResetView[] | null>(null);
  // Each account hears its own answer: the last one's list is not shown to the next.
  const close = effect(() => {
    void engine.account.value;
    open.value = null;
  });

  const view = (said: any): ResetView | null =>
    typeof said?.username === 'string' && typeof said.created === 'number' && typeof said.expires === 'number'
      ? { username: said.username, created: said.created, expires: said.expires }
      : null;

  // Changes the list when there is one. Before the first answer `refresh` brings it whole.
  function put(username: string, made?: ResetView) {
    const list = open.peek();
    if (list) open.value = [...list.filter((it) => it.username !== username), ...(made ? [made] : [])].sort(order);
  }

  return {
    open,

    async refresh() {
      const who = engine.account.peek();
      const answer = await engine.request('/api/resets/list', {});
      // Not when it was answered for someone who has since signed out.
      if (!answer.ok || engine.account.peek() !== who) return;
      open.value = (Array.isArray(answer.data.resets) ? answer.data.resets : []).flatMap((said: unknown) => view(said) ?? []).sort(order);
    },

    async create(username) {
      // The server holds names in lower case, and the list here names them as it does.
      const name = username.trim().toLowerCase();
      const answer = await engine.request('/api/resets/create', { username: name });
      if (!answer.ok) return answer;
      const made = view(answer.data.reset);
      const reset = answer.data.reset?.reset;
      // A 200 that carries no link is the server's own fault, and is said as one.
      if (!made || typeof reset !== 'string' || !reset) return { ok: false, error: 'server' };
      put(made.username, made);
      return { ok: true, reset: { ...made, reset, link: `${engine.server}/#/reset/${reset}` } };
    },

    async revoke(username) {
      const name = username.trim().toLowerCase();
      const answer = await engine.request('/api/resets/revoke', { username: name });
      if (!answer.ok) return answer;
      put(name);
      return { ok: true };
    },

    look: (reset) => engine.resetLook(reset),
    use: (reset, password) => engine.resetUse(reset, password),
    close,
  };
}
