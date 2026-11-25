/**
 * The colour the app's own picker stands on, as `#rrggbb`: `hue` is the place round the colour
 * wheel in degrees, `depth` runs from 0 (pale) to 100 (deep). One strength of colour throughout,
 * so every answer is a colour and none is a grey: Grey and Ink are among the twelve.
 */
// Pale is this light and deep is this much darker; in between it runs straight.
const PALE = 0.82;
const SPAN = 0.54;

export function hueHex(hue: number, depth: number) {
  const saturation = 0.7;
  const light = PALE - (Math.min(100, Math.max(0, depth)) / 100) * SPAN;
  const chroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const part = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = light - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, '0');
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

/**
 * Where the two sliders stand for a colour written as `#rrggbb`: the nearest hue and depth the
 * picker has. For a colour the picker made, that is where it was made.
 */
export function toneOf(hex: string) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const most = Math.max(r, g, b);
  const spread = most - Math.min(r, g, b);
  const turn = !spread ? 0 : most === r ? ((g - b) / spread) % 6 : most === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  const light = (most + Math.min(r, g, b)) / 2;
  return { hue: Math.round(turn * 60 + 360) % 360, depth: Math.round(Math.min(100, Math.max(0, ((PALE - light) / SPAN) * 100))) };
}
