// Route B pieces shared by its screens.
(function () {
  const D = window.D;
  window.B = {
    mark: '<span class="mark" aria-hidden="true"><i></i><i></i></span>',
    name: 'heirloom',
    proj: id => D.projects.find(p => p.id === id).name,
    sq(t, running) {
      return '<span class="sq">' + Array.from({ length: t.est }, (_, i) =>
        `<i class="${i < t.done ? 'done' : (running && i === t.done ? 'now' : '')}"></i>`).join('') + '</span>';
    },
    laps(inSet, p) {
      return '<div class="laps">' + [1, 2, 3, 4].map(i =>
        `<i class="${i < inSet ? 'done' : i === inSet ? 'now' : ''}" style="--p:${i === inSet ? p : 0}%"></i>`).join('') + '</div>';
    },
    // The day as a track from 08:00 to midnight: your pomodoros filled, last Tuesday's hollow.
    dayLane(tall, finished) {
      const x = hm => { const [h, m] = hm.split(':').map(Number); return ((h - 8) * 60 + m) / 960 * 100; };
      const w = 25 / 960 * 100;
      const you = ['10:20', '10:50', '11:20', '11:50', '15:30', ...(finished ? ['16:34'] : [])];
      const now = finished ? '16:59' : '16:40';
      const ghost = ['09:00', '09:30', '10:00', '10:35', '14:00', '14:30', '19:30', '20:00'];
      const ticks = ['08', '12', '16', '20', '24'];
      return `<div class="day${tall ? ' tall' : ''}">
        <div class="dl"><span class="who">You</span><div class="track">${you.map(t => `<i style="left:${x(t)}%;width:${w}%"></i>`).join('')}${finished ? '' : `<i class="run" style="left:${x('16:34')}%;width:${6 / 960 * 100}%"></i>`}<b class="now" style="left:${x(now)}%"></b></div></div>
        <div class="dl"><span class="who">Last Tue</span><div class="track g">${ghost.map(t => `<i style="left:${x(t)}%;width:${w}%"></i>`).join('')}<b class="now" style="left:${x(now)}%"></b></div></div>
        <div class="dl"><span></span><div class="ticks">${ticks.map((t, i) => `<span style="left:${i * 25}%">${t}:00</span>`).join('')}</div></div>
      </div>`;
    },
    room: `<div class="roommini">
        <div class="sub" style="font-size:13px;margin-bottom:10px">Room: Sachi and me</div>
        <div class="rm"><span class="avatar">S</span><div><div style="font-weight:500">Sachi</div><div class="sub" style="font-size:13px"><span class="dot"></span> Focusing, 11:05 left</div></div></div>
        <div class="rm"><span class="avatar">D</span><div><div style="font-weight:500">Dilan</div><div class="sub" style="font-size:13px"><span class="dot rest"></span> Short break, 3:20</div></div></div>
      </div>`,
    roomLate: `<div class="roommini">
        <div class="sub" style="font-size:13px;margin-bottom:10px">Room: Sachi and me</div>
        <div class="rm"><span class="avatar">S</span><div><div style="font-weight:500">Sachi</div><div class="sub" style="font-size:13px"><span class="dot rest"></span> Short break, 0:52</div></div></div>
        <div class="rm"><span class="avatar">D</span><div><div style="font-weight:500">Dilan</div><div class="sub" style="font-size:13px"><span class="dot"></span> Focusing, 9:40 left</div></div></div>
      </div>`,
  };
  const st = document.createElement('style');
  st.textContent = `.day{display:grid;gap:6px}.dl{display:grid;grid-template-columns:64px 1fr;align-items:center;gap:10px}.dl .who{font:500 13px var(--font-label);color:var(--muted)}.track{position:relative;height:22px;background:var(--raised)}.day.tall .track{height:30px}.track i{position:absolute;top:0;bottom:0;background:var(--you)}.track.g i{background:none;border:1.5px dashed var(--ghost)}.track .now{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink)}.ticks{position:relative;height:16px;font:500 12px var(--font-label);color:var(--muted)}.ticks span{position:absolute;transform:translateX(-50%)}.ticks span:first-child{transform:none}.ticks span:last-child{transform:translateX(-100%)}.rm{display:flex;gap:10px;align-items:center;padding:6px 8px}.roommini{padding:0 0 4px}`;
  document.head.appendChild(st);
})();
