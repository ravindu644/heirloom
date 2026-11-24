// Route A: the tally. A gate is four pomodoros and the slash is the long break that closes them,
// so a gate counts four, not five.
(function () {
  const rand = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  // One drawn stroke: a pen line with a slight bend and round ends, never a ruler line.
  function stroke(x0, y0, x1, y1, w, color, k) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const bend = (rand(k + 3) - 0.5) * len * 0.06;
    const mx = (x0 + x1) / 2 + nx * bend, my = (y0 + y1) / 2 + ny * bend;
    return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w.toFixed(2)}" stroke-linecap="round"/>`;
  }

  // marks: array of 'ink' | 'pencil' | number (0..1, a stroke being written). slashes: per gate 'ink' | 'pencil' | null.
  window.tally = function (marks, { h = 48, gap = 11, w = 3.4, groupGap = 22, slashes = [], seed = 1 } = {}) {
    let x = w * 1.5 + 2, out = '', groups = Math.ceil(marks.length / 4);
    const pad = w + 1, top = pad, bot = h - pad;
    for (let g = 0; g < groups; g++) {
      const gx = x;
      for (let i = 0; i < 4 && g * 4 + i < marks.length; i++) {
        const m = marks[g * 4 + i], k = seed * 100 + g * 7 + i;
        const lean = (rand(k) - 0.4) * h * 0.06, shrink = rand(k + 1) * h * 0.06;
        const xb = x, xt = x + lean, yb = bot - shrink * 0.3, yt = top + shrink;
        if (m === 'ink') out += stroke(xb, yb, xt, yt, w, 'var(--stroke)', k);
        else if (m === 'pencil') out += stroke(xb, yb, xt, yt, w * 0.7, 'var(--pencil)', k);
        else {
          out += stroke(xb, yb, xt, yt, w * 0.7, 'var(--pencil)', k);
          out += stroke(xb, yb, xb + (xt - xb) * m, yb + (yt - yb) * m, w, 'var(--stroke)', k);
        }
        x += gap;
      }
      const s = slashes[g];
      if (s) {
        const k = seed * 100 + g * 7 + 5, x0 = gx - gap * 0.55, x1 = gx + gap * 3.55;
        out += stroke(x0, bot - h * 0.18 + rand(k) * 3, x1, top + h * 0.22, s === 'ink' ? w * 1.05 : w * 0.7, s === 'ink' ? 'var(--stroke)' : 'var(--pencil)', k);
      }
      x += groupGap - gap;
    }
    const width = Math.ceil(x - groupGap + gap + w * 2 + 4);
    return `<svg class="tally" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" aria-hidden="true">${out}</svg>`;
  };

  // Marks for a task: done in ink, the running one growing, the rest in pencil.
  window.taskMarks = (t, running, p = 0.25) => Array.from({ length: t.est }, (_, i) => i < t.done ? 'ink' : (running && i === t.done ? p : 'pencil'));
  window.A = { name: 'fourstroke', mark: '', proj: id => window.D.projects.find(p => p.id === id).name };
})();
