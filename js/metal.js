(function (root) {
  'use strict';
  // A small, local image-based lighting model for a shallow crowned, bevelled
  // metal strip. The studio stays in world space while its surface rotates.
  // This is a 2.5D approximation, not a path tracer or a moving light effect.
  const FRAMES = 128, COLUMNS = 16;
  const WARM = [1.12, 1, .86], COOL = [.97, .99, 1];
  const MATERIALS = Object.freeze({
    silver: { f0: [.93, .95, .98] },
    gold: { f0: [1, .66, .25] }
  });
  const tone = new Uint8ClampedArray(8192);
  for (let i = 0; i < tone.length; i++) tone[i] = 255 * Math.pow(1 - Math.exp(-i / 2048), 1 / 2.2);
  function box(x, y, cx, cy, width, height) {
    const a = (x - cx) / width, b = (y - cy) / height;
    // Soft rectangle, with enough falloff for angular interpolation.
    return Math.exp(-(a * a * a * a + b * b * b * b));
  }
  function surface(u, v) {
    const edge = Math.pow(Math.abs(v), 12);
    const end = Math.max(0, 1 - Math.min(u, 1 - u) / .018);
    // Slight crown on the face, a wider bevel at the long edges and short
    // bevels on the ends. The strip is still visually flat, not cylindrical.
    const nx = (u - .5) * .075 + Math.sign(u - .5) * end * .65;
    const ny = v * .24 + Math.sign(v) * edge * .8;
    const nz = 1 / Math.hypot(nx, ny, 1);
    return { x: nx * nz, y: ny * nz, z: nz,
      grain: .986 + .010 * Math.sin(v * 510 + u * 9) + .004 * Math.sin(v * 1271 - u * 31) };
  }
  function shadeBasis(material, cosine, sine, normal, output, offset = 0) {
    const n = normal, x = n.x * cosine - n.y * sine, y = n.x * sine + n.y * cosine;
    // reflect(-V, N), V=(0,0,1). Off-axis bevels reflect different parts of
    // the room. No sin(time) shimmer: equal angles have equal illumination.
    const rx = 2 * x * n.z, ry = 2 * y * n.z;
    const key = 3.2 * box(rx, ry, -.34, -.42, .30, .56);
    const strip = 1.55 * box(rx, ry, .49, .13, .11, .68);
    const ceiling = 1.4 * box(rx, ry, -.08, -.79, .85, .15);
    const room = .035 + .065 * Math.max(0, ry);
    // Brushed anisotropic GGX lobe under a stationary studio light. Unlike a
    // painted gradient, even the broad face changes as its tangent rotates.
    // T is orthogonal to N; B=N×T. H is a fixed light/view half vector.
    const hx = -.28 * cosine - .34 * sine, hy = .28 * sine - .34 * cosine, hz = .897775;
    const tx = 1 / Math.hypot(1, n.x / n.z), tz = -n.x / n.z * tx;
    const th = hx * tx + hz * tz;
    const bh = hx * n.y * tz + hy * (n.z * tx - n.x * tz) - hz * n.y * tx;
    const nh = hx * n.x + hy * n.y + hz * n.z;
    const denominator = (th / .16) ** 2 + (bh / .45) ** 2 + nh * nh;
    const brushed = .44 / (Math.PI * .16 * .45 * denominator * denominator);
    const f0 = MATERIALS[material].f0, fresnel = Math.pow(1 - n.z, 5);
    for (let c = 0; c < 3; c++) {
      // Cool softbox and warm room bounce, with conductor-tinted reflection.
      const light = room * WARM[c] + (key + brushed) * COOL[c] + strip + ceiling;
      const value = light * (f0[c] + (1 - f0[c]) * fresnel) * n.grain;
      output[offset + c] = tone[Math.min(tone.length - 1, Math.max(0, Math.round(value * 2048)))];
    }
    output[offset + 3] = 255;
    return output;
  }
  function shade(material, angle, u, v) {
    const radians = (angle - 90) * Math.PI / 180;
    return shadeBasis(material, Math.cos(radians), Math.sin(radians), surface(u, v), new Uint8ClampedArray(4));
  }
  function frameAt(angle) {
    const position = ((angle % 360 + 360) % 360) / 360 * FRAMES;
    const first = Math.floor(position);
    return { first, second: (first + 1) % FRAMES, mix: position - first };
  }
  function createAtlas(material, scale, document) {
    const width = Math.max(56, Math.ceil(55.2 * scale)), height = Math.max(8, Math.ceil(7.4 * scale));
    // One replicated pixel around every tile prevents adjacent angles leaking
    // into the sampling footprint at rotations or fractional display scales.
    const tileWidth = width + 2, tileHeight = height + 2;
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth * COLUMNS; canvas.height = tileHeight * FRAMES / COLUMNS;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(canvas.width, canvas.height);
    const normals = [];
    for (let y = 0; y < tileHeight; y++) for (let x = 0; x < tileWidth; x++) {
      const u = (Math.max(0, Math.min(width - 1, x - 1)) + .5) / width;
      const v = (Math.max(0, Math.min(height - 1, y - 1)) + .5) / height * 2 - 1;
      normals.push(surface(u, v));
    }
    for (let frame = 0; frame < FRAMES; frame++) {
      const radians = (frame * 360 / FRAMES - 90) * Math.PI / 180;
      const cosine = Math.cos(radians), sine = Math.sin(radians);
      const left = frame % COLUMNS * tileWidth, top = Math.floor(frame / COLUMNS) * tileHeight;
      for (let y = 0; y < tileHeight; y++) for (let x = 0; x < tileWidth; x++) {
        shadeBasis(material, cosine, sine, normals[y * tileWidth + x], pixels.data,
          ((top + y) * canvas.width + left + x) * 4);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    return { canvas, width, height, tileWidth, tileHeight };
  }
  function draw(ctx, atlas, angle) {
    const { first, second, mix } = frameAt(angle);
    const blit = frame => ctx.drawImage(atlas.canvas,
      frame % COLUMNS * atlas.tileWidth + 1, Math.floor(frame / COLUMNS) * atlas.tileHeight + 1,
      atlas.width, atlas.height, -3.6, -3.7, 55.2, 7.4);
    // The first opaque body establishes alpha=1. Source-over with the next
    // angle is then a true colour interpolation, including the 360° seam.
    blit(first);
    if (mix > .001) { ctx.globalAlpha = mix; blit(second); ctx.globalAlpha = 1; }
  }
  const api = { MATERIALS, FRAMES, shade, frameAt, createAtlas, draw };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClockClockMetal = api;
})(typeof window !== 'undefined' ? window : globalThis);
