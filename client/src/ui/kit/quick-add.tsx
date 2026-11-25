import { useState } from 'preact/hooks';
import { Button } from './button.tsx';
import css from './quick-add.module.css';

/**
 * One line that makes something: type, press Enter or the button, and the thing is on the list.
 * `onAdd` says whether it took the line; taken, the field empties and keeps the focus for the
 * next one. The button stands in the field's box from the first character until the field is
 * empty again: a field never depends on a key the phone's keyboard may not show.
 */
export function QuickAdd({ name, label, hint, go, onAdd }: { name: string; label: string; hint?: string; go: string; onAdd: (text: string) => boolean }) {
  const [typed, setTyped] = useState(false);
  return (
    <form
      class={css.add}
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem(name) as HTMLInputElement;
        if (!onAdd(field.value)) return;
        field.value = '';
        setTyped(false);
        // The button was what had the focus, and it has just gone: the next line is typed here.
        field.focus({ preventScroll: true });
      }}
    >
      <input name={name} aria-label={label} placeholder={hint} autocomplete="off" enterkeyhint="done" onInput={(event) => setTyped(event.currentTarget.value.trim() !== '')} />
      <Button type="submit" disabled={!typed}>
        {go}
      </Button>
    </form>
  );
}
