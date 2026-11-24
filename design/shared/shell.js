// The frame every screen sits in: a labelled sidebar on a laptop, a bottom bar on a phone.
// Each route styles it; the structure stays the same so the routes compare like for like.
(function () {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.theme = q.get('theme') || 'light';
  const NAV = ['Focus', 'Today', 'Progress', 'Habits', 'Room'];
  window.shell = function ({ active, main, side = '', mark = '', name = '' }) {
    const items = NAV.map(n => `<a class="nav-i${n === active ? ' on' : ''}" href="#">${n}</a>`).join('');
    document.body.innerHTML = `
      <div class="app">
        <aside class="side">
          <div class="brand">${mark}<span>${name}</span></div>
          <nav class="nav">${items}</nav>
          <div class="side-foot">${side}</div>
        </aside>
        <header class="top"><div class="brand">${mark}<span>${name}</span></div></header>
        <main class="main">${main}</main>
        <nav class="tabbar">${items}</nav>
      </div>`;
  };
  window.esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
})();
