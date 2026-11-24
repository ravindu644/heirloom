import { useState } from 'preact/hooks';

/**
 * A text that is saved as it is typed. While the field has the focus it shows what the person
 * typed and never what was stored: the stored text is trimmed, and pushed back into the field it
 * would eat the space just typed. Leaving the field shows the stored text again.
 */
export function useTyped(stored: string, save: (text: string) => void) {
  const [typed, setTyped] = useState<string | null>(null);
  return {
    value: typed ?? stored,
    onInput: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      setTyped(event.currentTarget.value);
      save(event.currentTarget.value);
    },
    onBlur: () => setTyped(null),
  };
}
