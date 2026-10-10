(function (root) {
  'use strict';
  // Six clocks per digit, row-major. Degrees clockwise from north.
  // Two hands cannot form a three-way junction: open half-stems are intentional.
  const B = [225, 225];
  const GLYPHS = [
    [[90,180],[180,270],[0,180],[0,180],[0,90],[0,270]],
    [B,[180,180],B,[0,180],B,[0,0]],
    [[90,90],[180,270],[90,180],[0,270],[0,90],[270,270]],
    [[90,90],[180,270],[90,90],[0,270],[90,90],[0,270]],
    [[180,180],[180,180],[0,90],[0,180],B,[0,0]],
    [[90,180],[270,270],[0,90],[180,270],[90,90],[0,270]],
    [[90,180],[270,270],[0,180],[180,270],[0,90],[0,270]],
    [[90,90],[180,270],B,[0,180],B,[0,0]],
    [[90,180],[180,270],[0,90],[180,270],[0,90],[0,270]],
    [[90,180],[180,270],[0,90],[0,180],[90,90],[0,270]]
  ];
  for (const glyph of GLYPHS) { glyph.forEach(Object.freeze); Object.freeze(glyph); }
  Object.freeze(GLYPHS);
  function targetAngles(time) {
    if (!/^\d{4}$/.test(time)) throw new RangeError('Expected four digits');
    return Array.from(time).flatMap(d => GLYPHS[Number(d)].flat());
  }
  function position(index) {
    const clock = Math.floor(index / 2);
    return { col: Math.floor(clock / 6) * 2 + clock % 2, row: Math.floor(clock % 6 / 2), hand: index % 2 };
  }
  const api = { GLYPHS, targetAngles, position };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClockClockGlyphs = api;
})(typeof window !== 'undefined' ? window : globalThis);
