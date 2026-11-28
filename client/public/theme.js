// Applies the light or dark picked in Settings before the first paint, so a reload or a cold start
// never shows a frame of the other theme. A plain script in <head>, not inline: the page's policy
// allows scripts from this server only. main.tsx (ui/theme.ts) writes the same key and keeps it in step.
try {
  var picked = localStorage.getItem('heirloom-theme');
  if (picked === 'light' || picked === 'dark') {
    document.documentElement.dataset.theme = picked;
    // The window's bar too: both of the page's pair take the picked theme's own value.
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    var own = document.querySelector('meta[name="theme-color"][media*="' + picked + '"]');
    for (var i = 0; own && i < metas.length; i++) metas[i].content = own.content;
  }
} catch (e) {}
