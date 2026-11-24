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
 * else; every other way out goes back that same step.
 */
export function Sheet({ title, close, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);
  closed.current = onClose;
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    history.pushState({ sheet: true }, '');
    // Closed while it is still in the page: that is what hands the focus back.
    const back = () => {
      el.close();
      closed.current();
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  }, []);
  const back = () => history.back();
  return (
    <dialog
      ref={dialog}
      class={css.sheet}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        back();
      }}
      // A tap on the page behind lands on the dialog itself, never on what is inside it.
      onClick={(event) => event.target === dialog.current && back()}
    >
      <div class={css.inside}>
        <header class={css.head}>
          {/* The focus lands on the name, not in a field: on a phone a field would raise the keyboard. */}
          <h2 tabIndex={-1} autofocus>
            {title}
          </h2>
          <Button kind="small" onClick={back}>
            {close}
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
