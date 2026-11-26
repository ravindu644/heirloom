// Accessibility (roadmap section 10) against the real app with seeded data, with nothing but
// Playwright: its accessibility tree for names, headings and dialogs, and computed styles for
// contrast, the focus ring and motion. Each check collects every fault it finds and fails with
// the list, so one run says all that is wrong.
import type { Page } from '@playwright/test';
import { localDay } from '../../client/src/core/stats.ts';
import type { Device as Node } from '../sync/harness.ts';
import { until } from '../sync/harness.ts';
import { accountWith, go, ready, signIn, startButton, startNow, taskRow, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const MIN = 60000;
const DAY = 86400000;
const OFF = -new Date().getTimezoneOffset();
const LAP = 8000;

// An account with something on every screen: tasks with a project and estimates, last week's
// laps, a habit with check-ins, and laps of eight seconds so a lap can ring inside a test.
async function seeded(d: Device, tag: string) {
  const name = username(tag);
  const node: Node = await accountWith(name, { work_ms: LAP, short_ms: 60000 });
  node.engine.write('project', 'thesis', { name: 'Thesis', color: 'you', order: 'V' });
  node.engine.write('task', 't1', { title: 'chapter 2 draft', estimate: 4, project: 'thesis', order: 'V' });
  node.engine.write('task', 't2', { title: 'read two papers', estimate: 2, order: 'W' });
  for (let back = 1; back <= 10; back++) {
    const day = localDay(Date.now() - back * DAY, OFF);
    const noon = Date.parse(`${day}T12:00:00Z`) - OFF * MIN;
    node.engine.write('session', `past-${back}`, { kind: 'work', task: 't1', started: noon, ended: noon + 25 * MIN, planned_ms: 25 * MIN, paused_ms: 0, outcome: 'rang', device: node.engine.device });
    node.engine.write('checkin', `c-${back}`, { habit: 'read', day, at: noon });
  }
  node.engine.write('habit', 'read', { title: 'read 20 pages', days: 127, target: 1, order: 'V' });
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await signIn(d.page, name);
  await ready(d.page);
  return name;
}

// The states of every screen, reached as a person reaches them. Each returns when its state shows.
const states: Record<string, (page: Page, name: string) => Promise<void>> = {
  'Focus, idle': async (page) => {
    await go(page, 'Focus');
    await ready(page);
  },
  'Focus, running': async (page) => {
    await go(page, 'Focus');
    await startButton(page).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  },
  'Focus, result': async (page) => {
    await expect(startNow(page)).toBeVisible({ timeout: LAP + 4000 });
  },
  Today: async (page) => {
    await go(page, 'Today');
    await expect(page.getByLabel('Add a task', { exact: true })).toBeVisible();
  },
  'Today, task sheet': async (page) => {
    await page.getByRole('button', { name: /read two papers/ }).click();
    await expect(page.getByRole('dialog', { name: 'Task' })).toBeVisible();
  },
  Progress: async (page) => {
    await page.keyboard.press('Escape');
    await go(page, 'Progress');
    await expect(page.getByRole('slider')).toBeVisible();
  },
  Habits: async (page) => {
    await go(page, 'Habits');
    await expect(page.getByRole('checkbox', { name: 'Check in: read 20 pages' })).toBeVisible();
  },
  'Habits, habit sheet': async (page) => {
    await page.getByRole('button', { name: /read 20 pages/ }).click();
    await expect(page.getByRole('dialog', { name: 'Habit' })).toBeVisible();
  },
  'Room, none': async (page) => {
    await page.keyboard.press('Escape');
    await go(page, 'Room');
    await expect(page.getByRole('heading', { name: 'You are not in a room yet.' })).toBeVisible();
  },
  'Room, one': async (page) => {
    await page.getByLabel('Its name').fill('study hall');
    await page.getByRole('button', { name: 'Make the room' }).click();
    await expect(page.getByText(/^study hall, kept by /)).toBeVisible();
  },
  'Room, sheet': async (page) => {
    await page.getByRole('button', { name: 'Code and settings' }).click();
    await expect(page.getByRole('dialog', { name: 'This room' })).toBeVisible();
  },
  Settings: async (page, name) => {
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  },
};

// The accessibility tree as Playwright reads it, one node a line.
type Node_ = { depth: number; role: string; name: string; level: number | null };
async function tree(page: Page): Promise<Node_[]> {
  const yaml = await page.locator('body').ariaSnapshot();
  return yaml.split('\n').flatMap((line) => {
    const m = line.match(/^(\s*)- ([a-z]+)(?: "((?:[^"\\]|\\.)*)")?(.*)$/);
    if (!m) return [];
    return [{ depth: m[1]!.length, role: m[2]!, name: (m[3] ?? '').replace(/\\"/g, '"'), level: Number(m[4]!.match(/\[level=(\d)\]/)?.[1]) || null }];
  });
}

const CONTROLS = new Set(['button', 'link', 'checkbox', 'textbox', 'spinbutton', 'slider', 'radio', 'combobox', 'switch', 'searchbox', 'tab', 'menuitem']);

// Names, fields, headings, one main, named dialogs.
async function structure(page: Page, where: string): Promise<string[]> {
  const nodes = await tree(page);
  const faults: string[] = [];
  const dialogs = nodes.filter((n) => n.role === 'dialog');
  const inDialog = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (nodes[j]!.role === 'dialog' && nodes[j]!.depth < nodes[i]!.depth) return j;
    return -1;
  };
  if (nodes.filter((n) => n.role === 'main').length !== 1) faults.push(`${where}: ${nodes.filter((n) => n.role === 'main').length} main landmarks`);
  for (const d of dialogs) if (!d.name) faults.push(`${where}: a dialog without a name`);
  const seen = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (!CONTROLS.has(n.role)) return;
    if (!n.name.trim()) faults.push(`${where}: a ${n.role} with no name`);
    else if (/^[+−\-×x↑↓←→•·…]$|^(up|down|more|less|ok|go)$/i.test(n.name.trim())) faults.push(`${where}: a ${n.role} named only "${n.name}"`);
    const key = `${inDialog(i)}|${n.role}|${n.name}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  for (const [key, count] of seen) {
    const [, role, name] = key.split('|');
    // Links to the same place under one name are one thing; buttons and fields are not.
    if (count > 1 && role !== 'link' && name) faults.push(`${where}: ${count} ${role}s named "${name}"`);
  }
  // Headings: the page from h1, each dialog from its own first, never a skip.
  const scopes = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    if (n.role !== 'heading' || n.level === null) return;
    const scope = inDialog(i);
    scopes.set(scope, [...(scopes.get(scope) ?? []), n.level]);
  });
  for (const [scope, levels] of scopes) {
    const label = scope < 0 ? where : `${where}, dialog "${nodes[scope]!.name}"`;
    if (scope < 0 && levels[0] !== 1) faults.push(`${label}: the first heading is h${levels[0]}`);
    for (let i = 1; i < levels.length; i++) if (levels[i]! > levels[i - 1]! + 1) faults.push(`${label}: h${levels[i - 1]} then h${levels[i]}`);
  }
  if (scopes.get(-1) === undefined && !dialogs.length) faults.push(`${where}: no heading`);
  return faults;
}

// Every visible text, field border, box and placeholder against what is drawn behind it.
const still = (page: Page) => page.evaluate(async () => {
  await Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {})));
  await new Promise((r) => setTimeout(r, 50));
});
const contrast = async (page: Page, where: string) => (await still(page), measure(page, where));
const measure = (page: Page, where: string) =>
  page.evaluate((where) => {
    const faults: string[] = [];
    const parse = (c: string): number[] => {
      const m = c.match(/rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      const s = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      return s ? [Number(s[1]) * 255, Number(s[2]) * 255, Number(s[3]) * 255, s[4] === undefined ? 1 : Number(s[4])] : [0, 0, 0, 0];
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((k) => top[k]! * top[3]! + under[k]! * (1 - top[3]!)).concat(1);
    // What is drawn behind an element: its own and its ancestors' backgrounds, composited down to the page's.
    const behind = (el: Element | null): number[] => {
      const layers: number[][] = [];
      for (let n = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg[3]! > 0) layers.push(bg);
        if (bg[3] === 1) break;
      }
      let base = parse(getComputedStyle(document.body).backgroundColor);
      if (base[3]! < 1) base = [255, 255, 255, 1];
      for (const layer of layers.reverse()) base = over(layer, base);
      return base;
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const alphaOf = (el: Element) => {
      let a = 1;
      for (let n: Element | null = el; n; n = n.parentElement) a *= Number(getComputedStyle(n).opacity);
      return a;
    };
    const what = (el: Element) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const said = new Set<string>();
    const fault = (line: string) => said.has(line) || (said.add(line), faults.push(line));

    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('[disabled], [aria-disabled="true"]')) continue;
      const s = getComputedStyle(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (own) {
        const fg = parse(s.color);
        fg[3] = fg[3]! * alphaOf(el);
        const bg = behind(el);
        const size = parseFloat(s.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
        const need = large ? 3 : 4.5;
        const got = ratio(over(fg, bg), bg);
        if (got < need) fault(`${where}: text ${what(el)} at ${got.toFixed(2)}:1, needs ${need}:1 (${s.color} on rgb(${bg.slice(0, 3).map(Math.round).join(', ')}), ${size}px)`);
      }
      // The edge of a field, and of the app's one box, is what says "type here" or "tick this".
      const field = el.matches('input:not([type=hidden]):not([type=file]), textarea');
      const box = el.matches('[role="checkbox"] > i');
      if (field || box) {
        const edge = parse(s.borderTopColor);
        const bg = behind(el.parentElement);
        if (parseFloat(s.borderTopWidth) > 0 && ratio(over(edge, bg), bg) < 3) {
          fault(`${where}: the edge of ${field ? `the field "${el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? ''}"` : 'a box'} at ${ratio(over(edge, bg), bg).toFixed(2)}:1, needs 3:1 (${s.borderTopColor})`);
        }
        if (field && (el as HTMLInputElement).placeholder && !(el as HTMLInputElement).value) {
          const ph = parse(getComputedStyle(el, '::placeholder').color);
          const pbg = behind(el);
          if (ratio(over(ph, pbg), pbg) < 4.5) fault(`${where}: the hint "${(el as HTMLInputElement).placeholder.slice(0, 30)}" at ${ratio(over(ph, pbg), pbg).toFixed(2)}:1`);
        }
      }
    }
    // The focus ring is ink, outside the element, on whatever the element stands on. A token is
    // read through an element that wears it, so whatever form it is written in comes back as rgb.
    const token = (name: string) => {
      const probe = document.body.appendChild(document.createElement('i'));
      probe.style.backgroundColor = `var(${name})`;
      const c = parse(getComputedStyle(probe).backgroundColor);
      probe.remove();
      return c;
    };
    const ink = token('--ink');
    for (const name of ['--ground', '--surface', '--raised']) {
      const bg = token(name);
      if (ratio(ink, bg) < 3) fault(`${where}: the focus ring on ${name} at ${ratio(ink, bg).toFixed(2)}:1`);
    }
    return faults;
  }, where);

test('every screen and sheet: named controls, labelled fields, headings without a skip, one main, named dialogs', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  const signedOut: string[] = [];
  await a.page.goto('/');
  signedOut.push(...(await structure(a.page, 'Sign in')));
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  signedOut.push(...(await structure(a.page, 'Join')));
  await a.page.getByRole('button', { name: 'I have an account' }).click();
  const name = await seeded(a, 'a11yname');
  const faults = [...signedOut];
  for (const [where, reach] of Object.entries(states)) {
    await reach(a.page, name);
    faults.push(...(await structure(a.page, where)));
  }
  expect(faults, faults.join('\n')).toEqual([]);
});

test('contrast of every text, field edge, box and focus ring, light and dark', async ({ deviceA: a }) => {
  test.setTimeout(120000);
  const faults: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await a.page.emulateMedia({ colorScheme: scheme });
    await a.page.goto('/');
    await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    faults.push(...(await contrast(a.page, `Sign in, ${scheme}`)));
  }
  const name = await seeded(a, 'a11ycontrast');
  for (const [where, reach] of Object.entries(states)) {
    await reach(a.page, name);
    for (const scheme of ['light', 'dark'] as const) {
      await a.page.emulateMedia({ colorScheme: scheme });
      faults.push(...(await contrast(a.page, `${where}, ${scheme}`)));
    }
    await a.page.emulateMedia({ colorScheme: 'light' });
  }
  // Grouped: the same fault on many screens is one line with every place it shows.
  const grouped = new Map<string, string[]>();
  for (const f of faults) {
    const [where, rest] = [f.slice(0, f.indexOf(': ')), f.slice(f.indexOf(': ') + 2)];
    grouped.set(rest, [...(grouped.get(rest) ?? []), where]);
  }
  const lines = [...grouped].map(([rest, places]) => `${rest}  [${places.join('; ')}]`);
  expect(lines, lines.join('\n')).toEqual([]);
});

// Tab from the top: every control is reached once, in the order of the page, each with a visible
// ring, and the walk comes round again instead of getting stuck.
async function walk(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea, select, [tabindex]:not([tabindex="-1"])';
    const all = [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => {
      if (el.closest('[inert], dialog:not([open])')) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]');
    });
    all.forEach((el, i) => (el.dataset.a11y = String(i)));
    // Tab starts from the last place focus or a click was; a marker at the very top makes it the top.
    const start = document.createElement('span');
    start.tabIndex = -1;
    start.dataset.a11yStart = '';
    document.body.prepend(start);
    start.focus();
    return { count: all.length, positive: all.filter((el) => el.tabIndex > 0).map((el) => el.outerHTML.slice(0, 60)) };
  });
}

test('keyboard only: Tab reaches every control once in page order with a visible ring, nothing traps, and Enter, Space, Escape and the arrows work', async ({ deviceA: a }) => {
  test.setTimeout(120000);
  const name = await seeded(a, 'a11ykeys');
  const faults: string[] = [];
  for (const [where, reach] of Object.entries({ Focus: states['Focus, idle']!, Today: states.Today!, Progress: states.Progress!, Habits: states.Habits!, Settings: states.Settings! })) {
    await reach(a.page, name);
    const { count, positive } = await walk(a.page);
    if (positive.length) faults.push(`${where}: tabindex above 0 breaks the order: ${positive.join(', ')}`);
    const order: string[] = [];
    for (let i = 0; i < count + 3; i++) {
      await a.page.keyboard.press('Tab');
      const at = await a.page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.dataset.a11yStart !== undefined) return null;
        const s = getComputedStyle(el);
        const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
        // Something the list did not hold still gets an identity, so a loop through it is seen.
        el.dataset.a11y ??= `x${document.querySelectorAll('[data-a11y^="x"]').length}`;
        return { i: el.dataset.a11y, ring, what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"` };
      });
      if (!at) break;
      if (order.includes(at.i)) break;
      order.push(at.i);
      if (!at.ring) faults.push(`${where}: no visible ring on ${at.what}`);
      if (at.i.startsWith('x')) faults.push(`${where}: Tab reaches ${at.what}, which is not drawn as a control`);
    }
    const missed = Array.from({ length: count }, (_, i) => String(i)).filter((i) => !order.includes(i));
    if (missed.length) {
      const names = await a.page.evaluate((ids) => ids.map((id) => {
        const el = document.querySelector(`[data-a11y="${id}"]`);
        return `${el?.tagName.toLowerCase()} "${(el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim().slice(0, 30)}"`;
      }), missed);
      faults.push(`${where}: ${missed.length} of ${count} controls never reached by Tab: ${names.join(', ')}`);
    }
    const listed = order.filter((i) => !i.startsWith('x')).map(Number);
    if (JSON.stringify(listed) !== JSON.stringify([...listed].sort((x, y) => x - y))) faults.push(`${where}: Tab order is not the page's order`);
    await a.page.evaluate(() => document.querySelector('[data-a11y-start]')?.remove());
  }
  expect(faults, faults.join('\n')).toEqual([]);

  // Operating: Enter starts a lap, Space pauses it; Today's quick line by keys; Enter opens a task,
  // Escape closes it and gives the focus back; the arrows move the year.
  await states['Focus, idle']!(a.page, name);
  await startButton(a.page).focus();
  await a.page.keyboard.press('Enter');
  await expect(a.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await a.page.getByRole('button', { name: 'Pause', exact: true }).focus();
  await a.page.keyboard.press('Space');
  await expect(a.page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await states.Today!(a.page, name);
  await a.page.getByLabel('Add a task', { exact: true }).focus();
  await a.page.keyboard.type('by keys only ~2');
  await a.page.keyboard.press('Enter');
  const opener = a.page.getByRole('button', { name: /by keys only/ });
  await expect(opener).toBeVisible();
  await opener.focus();
  await a.page.keyboard.press('Enter');
  const sheet = a.page.getByRole('dialog', { name: 'Task' });
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate((el) => el.contains(document.activeElement)), 'the sheet did not take the focus').toBe(true);
  await a.page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
  await a.page.getByRole('checkbox', { name: 'Done: by keys only' }).focus();
  await a.page.keyboard.press('Space');
  // The row moves to Done; the one it left behind stays a moment, inert.
  await expect(taskRow(a.page, 'by keys only').getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await states.Progress!(a.page, name);
  const year = a.page.getByRole('slider');
  await year.focus();
  const was = await year.getAttribute('aria-valuenow');
  await a.page.keyboard.press('ArrowUp');
  await expect(year).not.toHaveAttribute('aria-valuenow', was!);
});

test('every sheet takes the focus when it opens and gives it back when it closes', async ({ deviceA: a }) => {
  const name = await seeded(a, 'a11ysheets');
  const faults: string[] = [];
  const check = async (where: string, opener: ReturnType<Page['getByRole']>, dialog: string) => {
    await opener.focus();
    await a.page.keyboard.press('Enter');
    const sheet = a.page.getByRole('dialog', { name: dialog });
    await expect(sheet).toBeVisible();
    if (!(await sheet.evaluate((el) => el.contains(document.activeElement)))) faults.push(`${where}: the sheet did not take the focus`);
    await a.page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    if (!(await opener.evaluate((el) => el === document.activeElement))) faults.push(`${where}: the focus did not come back to what opened the sheet`);
  };
  await states.Today!(a.page, name);
  await check('Today', a.page.getByRole('button', { name: /read two papers/ }), 'Task');
  await states.Habits!(a.page, name);
  await check('Habits', a.page.getByRole('button', { name: /read 20 pages/ }), 'Habit');
  await states['Room, none']!(a.page, name);
  await states['Room, one']!(a.page, name);
  await check('Room', a.page.getByRole('button', { name: 'Code and settings' }), 'This room');
  expect(faults, faults.join('\n')).toEqual([]);
});

test('reduced motion: nothing animates on a start, the lap-done moment or a sheet; without it nothing loops or runs past DESIGN.md\'s longest', async ({ deviceA: a, deviceB: b }) => {
  const running = (page: Page) =>
    page.evaluate(() => document.getAnimations().filter((x) => x.playState === 'running').map((x) => `${(x as CSSAnimation).animationName ?? (x as CSSTransition).transitionProperty ?? 'animation'}`));
  const faults: string[] = [];
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const name = await seeded(a, 'a11ymotion');
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  for (let i = 0; i < 4; i++) faults.push(...(await running(a.page)).map((x) => `on a start: ${x}`));
  await expect(startNow(a.page)).toBeVisible({ timeout: LAP + 4000 });
  for (let i = 0; i < 4; i++) faults.push(...(await running(a.page)).map((x) => `at the lap-done moment: ${x}`));
  await states.Today!(a.page, name);
  await a.page.getByRole('button', { name: /read two papers/ }).click();
  faults.push(...(await running(a.page)).map((x) => `on a sheet: ${x}`));
  expect([...new Set(faults)], [...new Set(faults)].join('\n')).toEqual([]);

  // Without the setting, on an account of its own: the moment runs, within the longest token and never on a loop.
  await seeded(b, 'a11ymotion2');
  await startButton(b.page).click();
  await expect(startNow(b.page)).toBeVisible({ timeout: LAP + 4000 });
  const timing = await b.page.evaluate(() => document.getAnimations().map((x) => x.effect?.getComputedTiming()).map((t) => ({ duration: Number(t?.duration ?? 0), iterations: t?.iterations ?? 1, delay: Number(t?.delay ?? 0) })));
  for (const t of timing) {
    expect(t.iterations, 'an animation on a loop').not.toBe(Infinity);
    expect(t.duration + t.delay, 'longer than set-done, 1200ms').toBeLessThanOrEqual(1200);
  }
});

test('live regions: the timer speaks at most once a minute; what a tap did, a bell and an error are announced once', async ({ deviceA: a }) => {
  // Every change of every live region's text, from now on.
  const listen = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __said: string[]; __ear?: MutationObserver };
      w.__ear?.disconnect();
      w.__said = [];
      const regions = () => [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="timer"], [role="log"]')];
      const last = new Map<Element, string>();
      const look = () => {
        for (const r of regions()) {
          const text = (r.textContent ?? '').trim();
          if (text && last.get(r) !== text) w.__said.push(`${r.getAttribute('role') ?? 'live'}: ${text}`);
          last.set(r, text);
        }
      };
      look();
      w.__said = [];
      w.__ear = new MutationObserver(look);
      w.__ear.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  const heard = (page: Page) => page.evaluate(() => (window as unknown as { __said: string[] }).__said);

  // An error, on a wrong password: once.
  const name = username('a11ylive');
  await accountWith(name, { work_ms: LAP, short_ms: 60000 });
  await a.page.goto('/');
  await listen(a.page);
  await signIn(a.page, name, 'not the password');
  await a.page.waitForTimeout(1500);
  const error = (await heard(a.page)).filter((x) => x.includes('do not match'));
  expect(error, error.join('\n')).toHaveLength(1);

  await signIn(a.page, name);
  await ready(a.page);
  await startButton(a.page).click();
  await listen(a.page);
  // Five seconds of a running lap: the timer has nothing new to say.
  await a.page.waitForTimeout(5000);
  const timer = (await heard(a.page)).filter((x) => x.startsWith('timer'));
  expect(timer.length, timer.join('\n')).toBeLessThanOrEqual(1);
  // The bell: the result is said once.
  await expect(startNow(a.page)).toBeVisible({ timeout: LAP + 4000 });
  await a.page.waitForTimeout(1500);
  const said = await heard(a.page);
  const counts = new Map<string, number>();
  for (const x of said) counts.set(x, (counts.get(x) ?? 0) + 1);
  const twice = [...counts].filter(([, n]) => n > 1).map(([x, n]) => `${n} times: ${x}`);
  expect(twice, twice.join('\n')).toEqual([]);

  // What a tap did: Today's line about it, once.
  await go(a.page, 'Today');
  await listen(a.page);
  const box = a.page.getByLabel('Add a task', { exact: true });
  await box.fill('one announcement');
  await box.press('Enter');
  await a.page.waitForTimeout(1500);
  const added = (await heard(a.page)).filter((x) => x.includes('one announcement'));
  expect(added, added.join('\n')).toHaveLength(1);
});

test('at 200% zoom on a 412 phone (206 CSS px), nothing on Focus and Today is cut off or overlaps', async ({ deviceA: a }) => {
  // A name as short as the helper makes (10 characters): the person chip is where a name goes wide.
  const name = await seeded(a, 'z');
  await a.page.setViewportSize({ width: 206, height: 457 });
  const faults: string[] = [];
  for (const [where, reach] of Object.entries({ Focus: states['Focus, idle']!, 'Focus, running': states['Focus, running']!, Today: states.Today! })) {
    await reach(a.page, name);
    await a.page.waitForTimeout(150);
    faults.push(
      ...(await a.page.evaluate((where) => {
        const out: string[] = [];
        const doc = document.documentElement;
        if (doc.scrollWidth > doc.clientWidth) {
          // Name what spills: the innermost element whose content runs past the page's edge.
          const edge = doc.clientWidth + 1;
          const spills = [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().left + el.scrollWidth > edge && ![...el.children].some((c) => c.getBoundingClientRect().left + c.scrollWidth > edge))
            .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" (${Math.round(el.getBoundingClientRect().width)} px drawn, ${el.scrollWidth} px of content)`);
          out.push(`${where}: the page scrolls sideways (${doc.scrollWidth} in ${doc.clientWidth}), spilled by ${spills.join(', ') || 'nothing found'}`);
        }
        const shown = (el: Element) => {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          for (let n: Element | null = el; n; n = n.parentElement) if (getComputedStyle(n).visibility === 'hidden' || getComputedStyle(n).display === 'none') return false;
          return !el.closest('.sr, [aria-hidden="true"] [aria-hidden="true"]');
        };
        // Cut off: text in a box that hides what does not fit, and does not fit.
        for (const el of document.querySelectorAll('body *')) {
          if (!shown(el) || !el.textContent?.trim()) continue;
          const s = getComputedStyle(el);
          if (/hidden|clip/.test(s.overflowX + s.overflowY) && s.textOverflow !== 'ellipsis' && s.webkitLineClamp === 'none' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && el.clientWidth > 1) {
            if (!el.matches('[role="slider"] *, [role="img"] *')) out.push(`${where}: "${el.textContent.trim().slice(0, 40)}" is cut off`);
          }
        }
        // Overlap: two controls, or a control and a text, drawn over each other.
        // A bar fixed to the screen's edge has the page scroll under it, by design: it is left out.
        const pinned = (el: Element) => {
          for (let n: Element | null = el; n; n = n.parentElement) if (/fixed|sticky/.test(getComputedStyle(n).position)) return true;
          return false;
        };
        const items = [...document.querySelectorAll('button, a[href], input, h1, h2, p, [role="checkbox"]')].filter((el) => shown(el) && !pinned(el));
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const [x, y] = [items[i]!, items[j]!];
            if (x.contains(y) || y.contains(x)) continue;
            const [p, q] = [x.getBoundingClientRect(), y.getBoundingClientRect()];
            const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
            const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
            // Drawn over each other only if, at the middle of the overlap, both are really there:
            // one scrolled out of its own box is clipped, not under the other.
            const cx = Math.max(p.left, q.left) + w / 2;
            const cy = Math.max(p.top, q.top) + h / 2;
            const there = document.elementsFromPoint(cx, cy);
            const drawn = (el: Element) => there.some((t) => el === t || el.contains(t));
            if (w > 2 && h > 2 && drawn(x) && drawn(y)) out.push(`${where}: ${x.tagName.toLowerCase()} "${(x.textContent ?? '').trim().slice(0, 24)}" over ${y.tagName.toLowerCase()} "${(y.textContent ?? '').trim().slice(0, 24)}"`);
          }
        }
        return out;
      }, where)),
    );
  }
  expect(faults, faults.join('\n')).toEqual([]);
});

test('on a phone, Tab follows the eye: the header line (the mark, then the person) before anything on the screen', async ({ deviceA: a }) => {
  const name = await seeded(a, 'a11yorder');
  await a.page.setViewportSize({ width: 412, height: 915 });
  await states.Today!(a.page, name);
  await a.page.evaluate(() => {
    const start = document.createElement('span');
    start.tabIndex = -1;
    document.body.prepend(start);
    start.focus();
  });
  const seq: { what: string; top: number; inMain: boolean }[] = [];
  for (let i = 0; i < 80 && !(seq.some((x) => x.what.startsWith('Settings, signed in as')) && seq.some((x) => x.inMain)); i++) {
    await a.page.keyboard.press('Tab');
    seq.push(await a.page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return { what: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), top: Math.round(el.getBoundingClientRect().top), inMain: !!el.closest('main') };
    }));
  }
  const person = seq.findIndex((x) => x.what.startsWith('Settings, signed in as'));
  const screen = seq.findIndex((x) => x.inMain);
  expect(person, `the order was: ${seq.map((x) => `${x.what} (${x.top}px)`).join(', ')}`).toBeGreaterThanOrEqual(0);
  expect(screen, `Tab never reached the screen: ${seq.map((x) => `${x.what} (${x.top}px)`).join(', ')}`).toBeGreaterThanOrEqual(0);
  expect(person, `the person in the top right comes after the screen: ${seq.map((x) => `${x.what} (${x.top}px)`).join(', ')}`).toBeLessThan(screen);
});

test('the status line does not say "No connection" while the app starts with a connection', async ({ deviceA: a }) => {
  const name = await seeded(a, 'a11yflash');
  await a.context.addInitScript(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    new MutationObserver(() => {
      for (const r of document.querySelectorAll('[role="status"]')) {
        const text = (r.textContent ?? '').trim();
        if (text.startsWith('No connection') && !w.__said.includes(text)) w.__said.push(text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  void name;
  for (let i = 0; i < 3; i++) {
    await a.page.reload();
    await ready(a.page);
    await a.page.waitForTimeout(500);
    const said = await a.page.evaluate(() => (window as unknown as { __said: string[] }).__said);
    expect(said, `load ${i + 1}: a live region said "${said[0]}" with the server up`).toEqual([]);
  }
});

test('at 320 by 568, no screen and no sheet scrolls sideways', async ({ deviceA: a }) => {
  test.setTimeout(90000);
  await a.page.setViewportSize({ width: 320, height: 568 });
  const faults: string[] = [];
  const sideways = async (where: string) => {
    await a.page.waitForTimeout(100);
    const { scroll, view } = await a.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    if (scroll > view) faults.push(`${where}: ${scroll} px of page in ${view}`);
  };
  await a.page.goto('/');
  await sideways('Sign in');
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  await sideways('Join');
  await a.page.getByRole('button', { name: 'I have an account' }).click();
  // The longest username there can be: the header's person chip is where a name goes wide.
  const name = `w${'x'.repeat(23)}_${Math.random().toString(36).slice(2, 9)}`.slice(0, 32);
  const node = await accountWith(name, { work_ms: LAP, short_ms: 60000 });
  // What the states below open: two tasks, a habit, and a lap yesterday so the year has a day.
  node.engine.write('task', 't1', { title: 'chapter 2 draft', estimate: 4, order: 'V' });
  node.engine.write('task', 't2', { title: 'read two papers', estimate: 2, order: 'W' });
  node.engine.write('habit', 'read', { title: 'read 20 pages', days: 127, target: 1, order: 'V' });
  const yesterday = localDay(Date.now() - DAY, OFF);
  const noon = Date.parse(`${yesterday}T12:00:00Z`) - OFF * MIN;
  node.engine.write('session', 'past', { kind: 'work', task: 't1', started: noon, ended: noon + 25 * MIN, planned_ms: 25 * MIN, paused_ms: 0, outcome: 'rang', device: node.engine.device });
  await until(() => node.engine.unsent.value === 0, 10000, 'not sent');
  await signIn(a.page, name);
  await ready(a.page);
  for (const [where, reach] of Object.entries(states)) {
    await reach(a.page, name);
    await sideways(where);
  }
  expect(faults, faults.join('\n')).toEqual([]);
});
