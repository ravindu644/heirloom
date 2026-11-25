/**
 * Copies, and says whether it could. On a plain http address (a server on the home network) a
 * browser has no clipboard at all: that is the same answer as a clipboard that refuses.
 */
export const copyText = (text: string): Promise<boolean> =>
  (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
    () => true,
    () => false,
  );
