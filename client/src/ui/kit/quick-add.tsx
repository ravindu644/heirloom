import css from './quick-add.module.css';

/**
 * One line at the head of a list: type, press Enter, and the thing is on the list. `onAdd` says
 * whether it took the line; taken, the field empties and keeps the focus for the next one.
 */
export function QuickAdd({ name, label, hint, onAdd }: { name: string; label: string; hint: string; onAdd: (text: string) => boolean }) {
  return (
    <form
      class={css.add}
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem(name) as HTMLInputElement;
        if (onAdd(field.value)) field.value = '';
      }}
    >
      <input name={name} aria-label={label} placeholder={hint} autocomplete="off" enterkeyhint="done" />
    </form>
  );
}
