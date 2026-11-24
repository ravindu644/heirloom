// Route C: ripening. The calyx is the only drawing; it is generated so its leaves are uneven.
(function () {
  const rand = i => { const x = Math.sin(i * 91.17 + 3.7) * 43758.5453; return x - Math.floor(x); };
  window.calyx = function (size, seed = 2) {
    const c = size / 2; let d = '';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (rand(seed + i) - 0.5) * 0.35 - Math.PI / 2;
      const len = c * (0.72 + rand(seed + i * 3) * 0.26), wd = c * (0.2 + rand(seed + i * 5) * 0.08);
      const tx = c + Math.cos(a) * len, ty = c + Math.sin(a) * len;
      const curl = (rand(seed + i * 7) - 0.5) * 0.5;
      const lx = c + Math.cos(a - 0.55 + curl) * wd * 1.6, ly = c + Math.sin(a - 0.55 + curl) * wd * 1.6;
      const rx = c + Math.cos(a + 0.55 + curl) * wd * 1.6, ry = c + Math.sin(a + 0.55 + curl) * wd * 1.6;
      d += `M${c},${c} Q${lx.toFixed(1)},${ly.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} Q${rx.toFixed(1)},${ry.toFixed(1)} ${c},${c}Z`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${d}" fill="var(--calyx)"/><circle cx="${c}" cy="${c}" r="${size * 0.07}" fill="var(--calyx)"/></svg>`;
  };
  window.fruit = (t, running, big) => `<span class="fruit${big ? ' big' : ''}">${Array.from({ length: t.est }, (_, i) => `<i class="${i < t.done ? 'r' : running && i === t.done ? 'h' : ''}"></i>`).join('')}</span>`;
  window.C = { name: 'truss', mark: () => calyx(20, 5), proj: id => window.D.projects.find(p => p.id === id).name };
})();
