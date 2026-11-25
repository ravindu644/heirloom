import { Fragment, createContext, toChildArray } from 'preact';
import type { ComponentChildren, HTMLAttributes, VNode } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { cx } from './cx.ts';
import css from './fold.module.css';
import { motion } from './ms.ts';
import { keep, staying, wasPlacedByHand } from './parts.ts';
import type { Part as Kind } from './parts.ts';

const Going = createContext(false);
/** True while what you are in is on its way out: a sheet closes itself, the bar fades. */
export const useGoing = () => useContext(Going);

type Part = Kind<VNode>;

// The page asks for no motion: nothing is kept past its time, and nothing is slid.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The elements among some children, with a fragment's own children in its place: `a ? <p /> :
// <>...</>` gives parts either way, never one part that holds three blocks with no gap.
const elements = (children: ComponentChildren): VNode[] =>
  toChildArray(children).flatMap((child) => (typeof child !== 'object' ? [] : child.type === Fragment && child.key == null ? elements((child.props as { children?: ComponentChildren }).children) : [child]));

// A child with no key is known by what it is and which of its kind it is: the first `p`, the
// second. One symbol per place, so the same place is the same part from draw to draw.
const places = new Map<unknown, unknown[]>();
const place = (type: unknown, nth: number) => {
  const list = places.get(type) ?? places.set(type, []).get(type)!;
  return (list[nth] ??= nth ? Symbol() : type);
};

/**
 * DESIGN.md, Motion, in one place: whatever comes and goes among these children does so in
 * time. A child that is no longer given stays, inert, until its leaving has played, and is then
 * dropped: no screen keeps a node alive by hand. `fold` draws the children as a column in which
 * a part opens and closes its height, so what is under it glides, and a part that changes its
 * place slides there. `list` draws that column as a list of items, so a screen reader still
 * hears one. Without `fold` nothing is drawn around the children and they move themselves (a
 * sheet, the bar), told by `useGoing`. Children are elements: a bare word among them is not drawn.
 */
function Parts({ children, fold, list, gap, class: extra, ...rest }: Omit<HTMLAttributes<HTMLElement>, 'children'> & { children: ComponentChildren; fold?: boolean; list?: boolean; gap?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const parts = useRef<Part[]>([]);
  const drawn = useRef(false);
  const nodes = useRef(new Map<unknown, HTMLElement>());
  const leaving = useRef(new Set<Part>());
  const [, redraw] = useState(0);

  const was = parts.current;
  // Drawn as it is, with nothing in time: the page asks for no motion, or a hand has just set the rows where they go.
  const plain = still() || wasPlacedByHand();
  const kinds = new Map<unknown, number>();
  const now = elements(children).map((vnode): Part => {
    const nth = kinds.get(vnode.type) ?? 0;
    kinds.set(vnode.type, nth + 1);
    const key = vnode.key ?? place(vnode.type, nth);
    const old = was.find((part) => part.key === key);
    return { key, vnode, fresh: old && !old.going ? old.fresh : drawn.current && !plain, going: false, life: (old?.life ?? 0) + (old?.going ? 1 : 0) };
  });
  // What was here and is not given any more stays where it stood, until it has gone.
  const next = plain ? now : keep(was, now);
  // The same parts in another order: where each stood is read before the page is redrawn.
  const before = staying(was, next);
  const moved = fold && !plain && staying(next, was).some((key, at) => key !== before[at]);
  const tops = moved ? new Map(before.map((key) => [key, nodes.current.get(key)?.getBoundingClientRect().top])) : null;
  parts.current = next;

  useLayoutEffect(() => {
    drawn.current = true;
    for (const [key, top] of tops ?? []) {
      const node = nodes.current.get(key);
      const by = node && top !== undefined ? top - node.getBoundingClientRect().top : 0;
      if (!by) continue;
      node!.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], { duration: motion(node!, '--motion-fill'), easing: getComputedStyle(node!).getPropertyValue('--motion-ease') });
    }
    for (const part of next) {
      if (!part.going || leaving.current.has(part)) continue;
      leaving.current.add(part);
      // A frame on, when what is inside has heard that it is going and begun its own leaving
      // (a sheet closes itself): its own and anything inside that is still moving, all of it.
      requestAnimationFrame(() => {
        const moving = nodes.current.get(part.key)?.getAnimations({ subtree: true }) ?? [];
        void Promise.allSettled(moving.map((one) => one.finished)).then(() => {
          leaving.current.delete(part);
          // Given again in the meantime (an Undo): it is no longer this part that stands there.
          if (!parts.current.includes(part)) return;
          parts.current = parts.current.filter((other) => other !== part);
          redraw((n) => n + 1);
        });
      });
    }
  });

  const Outer = list ? 'ul' : 'div';
  const Item = list ? 'li' : 'div';
  const drawnParts = next.map((part) => (
    <Item
      key={part.key as string}
      ref={(node: HTMLElement | null) => void (node ? nodes.current.set(part.key, node) : nodes.current.delete(part.key))}
      class={fold ? cx(css.part, part.fresh && css.arriving, part.going && css.going) : css.bare}
      inert={part.going}
    >
      {/* Keyed by its life: given again while it was going, it is not the one that was leaving
          (which has closed itself and let its step of history go) but a new one. */}
      <Going.Provider value={part.going}>
        <Fragment key={part.life}>{fold ? <div>{part.vnode}</div> : part.vnode}</Fragment>
      </Going.Provider>
    </Item>
  ));
  if (!fold) return <>{drawnParts}</>;
  return (
    // The role is said outright: without its bullets a `ul` is not a list to every screen reader.
    // The gap is always set here: a column inside another must not take the outer one's.
    <Outer role={list ? 'list' : undefined} {...(rest as object)} class={cx(css.fold, extra)} style={`--gap:${gap ? `var(--space-${gap})` : '0px'}`}>
      {drawnParts}
    </Outer>
  );
}

/** A column whose parts open, close and change places in time. `gap` is the space between them. */
export const Fold = (props: Omit<Parameters<typeof Parts>[0], 'fold'>) => <Parts {...props} fold />;

/** Children that move themselves (a sheet, the bar), kept until their leaving has played. */
export const Kept = ({ children }: { children: ComponentChildren }) => <Parts>{children}</Parts>;
