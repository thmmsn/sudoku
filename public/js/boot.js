// Runs before first paint and applies the last used palette and brightness,
// so the screen never flashes brighter than the player chose.
(function () {
  try {
    var look = JSON.parse(localStorage.getItem('sudoku:look'));
    var root = document.documentElement;
    if (look && /^[a-z]+$/.test(look.palette)) root.setAttribute('data-palette', look.palette);
    if (look && look.brightness >= 0.2 && look.brightness <= 1) root.style.setProperty('--brightness', look.brightness);
    if (look && (look.style === 'flat' || look.style === 'glow')) root.setAttribute('data-style', look.style);
    // Sizes, lines and colours from the appearance page (look.js).
    if (look && look.vars) {
      for (var k in look.vars) {
        if (/^--[a-z-]+$/.test(k) && /^[#\w.%-]{1,24}$/.test(String(look.vars[k]))) root.style.setProperty(k, look.vars[k]);
      }
    }
  } catch (e) {}
})();

// The view is locked: no pinch zoom and no dragging the page around. Double-
// tap zoom is off through touch-action in style.css, and scrollable pages
// scroll inside their own box.
(function () {
  var stop = function (e) {
    e.preventDefault();
  };
  document.addEventListener('gesturestart', stop, { passive: false }); // Safari pinch
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener(
    'touchmove',
    function (e) {
      if (e.touches.length > 1) return e.preventDefault(); // pinch
      // One finger: sliders and text fields keep their gestures, and only
      // boxes that really scroll may move.
      var el = e.target;
      if (el.closest && el.closest('input, textarea')) return;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1) {
          var o = getComputedStyle(el).overflowY;
          if (o === 'auto' || o === 'scroll') return;
        }
        el = el.parentElement;
      }
      e.preventDefault();
    },
    { passive: false },
  );
})();
