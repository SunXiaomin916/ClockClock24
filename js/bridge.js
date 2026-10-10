// Register before other resources load so initial host properties are never lost.
(function () {
  'use strict';
  const pending = [];
  let sink = null;
  window.wallpaperPropertyListener = {};
  for (const name of ['applyUserProperties', 'applyGeneralProperties', 'setPaused']) {
    window.wallpaperPropertyListener[name] = value => sink ? sink(name, value) : pending.push([name, value]);
  }
  window.ClockClockBridge = { bind(handler) { sink = handler; pending.splice(0).forEach(args => sink(...args)); } };
})();
