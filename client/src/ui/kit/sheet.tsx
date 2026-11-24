import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Button } from './button.tsx';
import css from './sheet.module.css';

interface Props {
  /** Its name, for the heading and for a screen reader. */
  title: string;
  /** The word on the button that closes it. */
  close: string;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * What floats: up from the bottom on the phone, a centred panel on the laptop. A native dialog, so
 * the browser keeps the focus inside, closes it on Escape and hands the focus back to where it
 * came from. It is also one step of history, so the back button of a phone closes it and nothing
 * else. However it goes, that step goes with it: left behind, it would eat the next back press.
 */
let sheets = 0;

export function Sheet({ title, close, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);
  closed.current = onClose;
  // Closed while it is still in the page: that is what hands the focus back.
  const shut = () => {
    dialog.current?.close();
    closed.current();
  };
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
    return () => {
      removeEventListener('popstate', back);
      // Closed any other way, by its own button or by the screen behind taking it away (the task
      // was deleted elsewhere, midnight passed): take the step back, if it is still the one we are on.
      if (!wentBack && history.state?.sheet === mine) history.back();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class={css.sheet}
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
