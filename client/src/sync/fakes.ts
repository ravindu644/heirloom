// Stand-ins for the environment, for tests here and for the qa lane's scenarios: a clock that
// only moves when told, so a 25 s ping or a 30 s backoff takes no time at all.

import type { Socket } from './transport.ts';

/** 2026-11-24T04:30:00.000Z, the moment the contract fixtures use. */
export const T0 = 1795494600000;

export function fakeTime(start: number = T0) {
  let t = start;
  let ids = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => t,
    schedule(run: () => void, ms: number) {
      const id = ids++;
      timers.set(id, { at: t + ms, run });
      return () => void timers.delete(id);
    },
    /** Moves the clock, running each timer that comes due at its own time, in order. */
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].run();
      }
      t = end;
    },
    /** Moves the clock without running anything: the device's clock was set, or it slept. */
    jump(ms: number) {
      t += ms;
    },
  };
}

/** Lets promises that are ready run: a fake reply has been "received" after this. */
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A WebSocket the test plays the server for. `all` lists every socket made, newest last. */
export function fakeSockets() {
  const all: FakeSocket[] = [];
  class FakeSocket implements Socket {
    url: string;
    sent: any[] = [];
    closed = false;
    onopen: ((event: any) => any) | null = null;
    onmessage: ((event: any) => any) | null = null;
    onclose: ((event: any) => any) | null = null;
    onerror: ((event: any) => any) | null = null;
    constructor(url: string) {
      this.url = url;
      all.push(this);
    }
    send(data: string) {
      if (this.closed) throw new Error('socket is closed');
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.closed = true;
    }
    // The server's side:
    accept() {
      this.onopen?.({});
    }
    say(msg: object) {
      this.onmessage?.({ data: JSON.stringify(msg) });
    }
    fail() {
      this.onclose?.({});
    }
  }
  return { all, FakeSocket, last: () => all.at(-1)! };
}
