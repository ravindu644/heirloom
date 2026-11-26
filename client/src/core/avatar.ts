// A person with no picture, drawn from their username alone: the same on every device and in
// every version. contracts/protocol.md section 15, Pictures; contracts/fixtures/avatar.json.

export const HUES = ['amber', 'olive', 'teal', 'sky', 'indigo', 'plum', 'clay', 'heat-2'] as const;
export type Hue = (typeof HUES)[number];

/** The hue (FNV-1a 32 over the UTF-8 of the lowercased name, modulo 8) and one letter, or two for a name in parts. */
export function avatar(username: string): { hue: Hue; letters: string } {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(username.toLowerCase())) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  const parts = username.split(/[_.-]/).filter(Boolean);
  // By code point, so a name that starts with an emoji or a letter outside the BMP keeps it whole.
  const first = (part: string) => [...part][0] ?? '';
  const letters = parts.length > 1 ? first(parts[0]!) + first(parts[1]!) : first(parts[0] ?? username);
  return { hue: HUES[hash % 8]!, letters: letters.toUpperCase() };
}
