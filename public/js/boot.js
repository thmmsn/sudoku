// Runs before first paint and applies the last used palette and brightness,
// so the screen never flashes brighter than the player chose.
(function () {
  try {
    var look = JSON.parse(localStorage.getItem('sudoku:look'));
    var root = document.documentElement;
    if (look && /^[a-z]+$/.test(look.palette)) root.setAttribute('data-palette', look.palette);
    if (look && look.brightness >= 0.2 && look.brightness <= 1) root.style.setProperty('--brightness', look.brightness);
  } catch (e) {}
})();
