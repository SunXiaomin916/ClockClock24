'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shade, frameAt, MATERIALS, FRAMES } = require('../js/metal.js');
const { THEMES } = require('../js/config.js');

test('metal reflection changes with orientation under a stationary light', () => {
  for (const metal of Object.keys(MATERIALS)) {
    const brightness = [];
    for (let angle = 0; angle < 360; angle += 15) {
      let sum = 0, minimum = 255, maximum = 0;
      for (let u = .05; u < 1; u += .1) for (let v = -.9; v < 1; v += .2) {
        const color = shade(metal, angle, u, v);
        assert.equal(color[3], 255);
        if (metal === 'gold') assert.ok(color[0] >= color[1] && color[1] >= color[2]);
        const mean = (color[0] + color[1] + color[2]) / 3;
        sum += mean; minimum = Math.min(minimum, mean); maximum = Math.max(maximum, mean);
      }
      // A metallic surface contains both dark environment reflections and
      // bright light reflections, unlike a uniformly tinted plastic strip.
      assert.ok(maximum - minimum > 100);
      brightness.push(sum / 100);
    }
    assert.ok(Math.max(...brightness) - Math.min(...brightness) > 35);
  }
});

test('reflection is deterministic, periodic and continuous at a complete turn', () => {
  for (const metal of Object.keys(MATERIALS)) for (const angle of [-720, -.01, 0, 47.25, 359.99, 360, 1440]) {
    assert.deepEqual(shade(metal, angle, .7, .5), shade(metal, angle + 360, .7, .5));
    const a = frameAt(angle), b = frameAt(angle + 360);
    assert.equal(a.first, b.first); assert.equal(a.second, b.second);
    assert.ok(Math.abs(a.mix - b.mix) < 1e-10);
    assert.ok(a.first >= 0 && a.first < FRAMES && a.second >= 0 && a.second < FRAMES);
  }
  const before = shade('silver', 359.999, .8, -.4), after = shade('silver', .001, .8, -.4);
  assert.ok(before.every((v, i) => Math.abs(v - after[i]) <= 1));
});

test('all metallic editions use supported materials, with matte partner hands preserved', () => {
  for (const theme of Object.values(THEMES)) for (const metal of theme.metals || []) {
    assert.ok(metal === null || Object.hasOwn(MATERIALS, metal));
  }
  assert.deepEqual(THEMES.gold.metals, ['gold', 'gold']);
  assert.deepEqual(THEMES.pinakin_neela.metals, [null, 'silver']);
  assert.deepEqual(THEMES.pinakin_hara.metals, [null, 'gold']);
  assert.deepEqual(THEMES.decade.metals, [null, 'gold']);
});
