// Runs before first paint and applies the last used theme, so a dark-mode
// user does not see a white flash while the profile loads.
(function () {
  try {
    var t = JSON.parse(localStorage.getItem('sudoku:theme'));
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
