import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { Button } from './button.tsx';
import { cx } from './cx.ts';
import { useGoing } from './fold.tsx';
import css from './sheet.module.css';

interface Props {
  /** Its name, for the heading and for a screen reader. */
  title: string;
  /** The word on the button that closes it. */
  close: string;
  onClose: () => void;
  /** Something can open inside it (a form, a line, an editor): on a phone it is then as tall as a sheet may be whatever it holds, so what opens moves only what is under it. */
  grows?: boolean;
  children: ComponentChildren;
}

/**
 * What floats: up from the bottom on the phone, a centred panel on the laptop. A native dialog, so
 * the browser keeps the focus inside, closes it on Escape and hands the focus back to where it
 * came from. It is also one step of history, so the back button of a phone closes it and nothing
 * else. However it goes, that step goes with it: left behind, it would eat the next back press.
 * Whoever shows a sheet wraps it in `Kept`: taken away, it closes itself and slides out before
 * it is dropped, whichever way it was closed.
 */
let sheets = 0;

export function Sheet({ title, close, onClose, grows, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);
  closed.current = onClose;
  const shut = () => closed.current();
  const leave = useRef(() => {});
  useEffect(() => {
    dialog.current!.showModal();
    const mine = ++sheets;
    history.pushState({ sheet: mine }, '');
    // The person went back themselves: the step is already behind them.
    let wentBack = false;
    const back = () => {
      wentBack = true;
      shut();
    };
    addEventListener('popstate', back);
    leave.current = () => {
      leave.current = () => {};
      removeEventListener('popstate', back);
      // Closed any other way, by its own button or by the screen behind taking it away (the task
      // was deleted elsewhere, midnight passed): take the step back, if it is still the one we are on.
      if (!wentBack && history.state?.sheet === mine) history.back();
    };
    return () => leave.current();
  }, []);
  // Taken away without a leaving (reduced motion keeps nothing): closed while it is still in the
  // page all the same, which is what hands the focus back. A layout effect, because its way out
  // runs before the dialog is taken from the page; a plain effect's runs after.
  useLayoutEffect(() => {
    const box = dialog.current!;
    return () => box.close();
  }, []);
  // On its way out: closed while it is still in the page, which is what hands the focus back and
  // lets the styles slide it away. The step of history goes now, not when the slide is over, or a
  // sheet opened in that moment would find it in the way.
  const going = useGoing();
  useLayoutEffect(() => {
    if (!going) return;
    dialog.current?.close();
    leave.current();
  }, [going]);
  return (
    <dialog
      ref={dialog}
      class={cx(css.sheet, grows && css.grows)}
      aria-label={title}
      onCancel={(event) => {
        // A date field inside has a cancel of its own, for its picker, and it comes up through
        // here. Only the dialog's own is a way out: one Escape, one step back.
        if (event.target !== dialog.current) return;
        event.preventDefault();
        shut();
      }}
      // A tap on the page behind lands on the dialog itself, never on what is inside it.
      onClick={(event) => event.target === dialog.current && shut()}
    >
      <div class={css.inside}>
        <header class={css.head}>
          {/* The focus lands on the name, not in a field: on a phone a field would raise the keyboard. */}
          <h2 tabIndex={-1} autofocus>
            {title}
          </h2>
          <Button kind="link" onClick={shut}>
            {close}
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
