import { useId, useState } from 'preact/hooks';
import { Button } from './button.tsx';
import { Fold } from './fold.tsx';
import { useKeyboard } from './keyboard.ts';
import css from './quick-add.module.css';

/**
 * One line that makes something: type, press Enter or the button, and the thing is on the list.
 * `onAdd` says whether it took the line; taken, the field empties. Where the caller says the bar
 * speaks of what was made (`said`), with a keyboard on the screen the field then lets go of the
 * focus, so the keyboard goes and the bar is read. Otherwise it keeps the focus for the next one:
 * on a laptop always, and on a phone where several are typed in a row and each lands in sight. The button stands in the field's box from the
 * first character until the field is empty again: a field never depends on a key the phone's
 * keyboard may not show. `example` is a line under the field while it is in use.
 */
export function QuickAdd({ name, label, hint, example, go, said, onAdd }: { name: string; label: string; hint?: string; example?: string; go: string; said?: boolean; onAdd: (text: string) => boolean }) {
  const [typed, setTyped] = useState(false);
  const [using, setUsing] = useState(false);
  const keyboard = useKeyboard();
  const described = useId();
  return (
    <form
      class={css.add}
      onFocusIn={() => setUsing(true)}
      onFocusOut={() => setUsing(false)}
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem(name) as HTMLInputElement;
        if (!onAdd(field.value)) return;
        field.value = '';
        setTyped(false);
        if (said && keyboard) field.blur();
        // A button reached by Tab had the focus, and it has just gone: the next line is typed here.
        else field.focus({ preventScroll: true });
      }}
    >
      <input name={name} aria-label={label} aria-describedby={example && using ? described : undefined} placeholder={hint} autocomplete="off" enterkeyhint="done" onInput={(event) => setTyped(event.currentTarget.value.trim() !== '')} />
      {/* A press on the button leaves the focus in the field: were it to take it, the phone would
          put the keyboard away before the add, and nothing here could tell there had been one. */}
      <Button type="submit" disabled={!typed} onMouseDown={(event) => event.preventDefault()}>
        {go}
      </Button>
      {example && (
        <Fold>
          {using && (
            <p key="example" id={described} class={css.example}>
              {example}
            </p>
          )}
        </Fold>
      )}
    </form>
  );
}
