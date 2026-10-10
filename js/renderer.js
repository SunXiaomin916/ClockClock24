(function (root) {
  'use strict';
  const { THEMES } = root.ClockClockConfig;
  const { position } = root.ClockClockGlyphs;
  const Metal = root.ClockClockMetal;
  const DEG = Math.PI / 180;
  const WIDTH = 1080, HEIGHT = 480;
  const center = (col, row) => ({ x: 100 + col * 118 + Math.floor(col / 2) * 18, y: 120 + row * 120 });
  function circle(ctx, x, y, radius) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); }
  class Renderer {
    constructor(board, faces, hands) {
      this.board = board; this.faces = faces; this.hands = hands;
      this.base = faces.getContext('2d', { alpha: false });
      this.ctx = hands.getContext('2d');
      this.previous = []; this.staticDraws = 0; this.frames = 0; this.drawnClocks = 0;
      this.samples = []; this.ratio = 1; this.metalAtlases = new Map();
    }
    configure(config) {
      this.config = config; this.theme = THEMES[config.theme];
      const t = this.theme;
      if (this.textureKind !== t.texture) {
        this.textureKind = t.texture;
        this.texture = t.texture ? this.createTexture(t.texture) : null;
      }
      document.body.style.background = config.theme === 'oled' ? '#000' : `radial-gradient(ellipse at 50% 43%, ${t.halo}, ${t.bg} 78%)`;
      this.board.style.boxShadow = config.theme === 'oled' ? 'none' : `0 22px 60px ${t.bright ? 'rgba(0,0,0,.19)' : 'rgba(0,0,0,.42)'}`;
      this.resize();
    }
    resize() {
      const width = Math.min(innerWidth * Number(this.config.size) / 100, innerHeight * 1.94);
      const height = width * HEIGHT / WIDTH;
      // Budget is per layer: at most 12 million RGBA pixels across both canvases.
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(6000000 / Math.max(1, width * height)));
      this.ratio = width / WIDTH * dpr;
      this.board.style.width = width + 'px'; this.board.style.height = height + 'px';
      for (const canvas of [this.faces, this.hands]) {
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
      }
      this.width = width; this.height = height; this.dpr = dpr;
      // Only two metal types, and only at the current resolution. Reuse them
      // when switching editions without keeping a history of resized atlases.
      const metalScale = Math.max(1, this.ratio);
      const metalKey = `${Math.ceil(55.2 * metalScale)}:${Math.ceil(7.4 * metalScale)}`;
      if (metalKey !== this.metalKey) { this.metalAtlases.clear(); this.metalKey = metalKey; }
      for (const metal of this.theme.metals || []) if (metal && !this.metalAtlases.has(metal)) {
        this.metalAtlases.set(metal, Metal.createAtlas(metal, metalScale, document));
      }
      this.handSprites = [this.createHandSprite(true), this.createHandSprite(false)];
      this.metalShadow = this.createMetalShadow();
      this.previous = []; this.drawFaces(); this.drift(Date.now());
    }
    createTexture(kind) {
      // Seeded procedural material, generated once per theme. No external assets
      // and no texture work in the animation loop. Fixed 1080x480 (~2 MiB).
      const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d'); let seed = 1982;
      const random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      if (kind === 'travertine') {
        for (let y = -18; y < HEIGHT + 20; y += 1.4 + random() * 4) {
          const phase = random() * 6.28;
          ctx.beginPath();
          for (let x = 0; x <= WIDTH; x += 10) {
            const yy = y + Math.sin(x / 125 + phase) * 2.8 + Math.sin(x / 43 + phase) * .9 + x * .009;
            if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
          }
          ctx.strokeStyle = random() > .45 ? `rgba(247,207,154,${.10+random()*.27})` : `rgba(66,32,18,${.07+random()*.15})`;
          ctx.lineWidth = .35 + random() * 3; ctx.stroke();
        }
        for (let i = 0; i < 11000; i++) {
          ctx.fillStyle = i % 3 ? 'rgba(255,226,185,.18)' : 'rgba(53,28,19,.16)';
          ctx.fillRect(random()*WIDTH,random()*HEIGHT,.3+random()*2.2,.3+random());
        }
      } else {
        for (let i = 0; i < 38; i++) {
          let x = random()*WIDTH, y = random()*HEIGHT;
          ctx.beginPath(); ctx.moveTo(x,y);
          for (let j = 0; j < 16; j++) {
            const nextX = x + 7 + random()*18, nextY = y + 3 + random()*13;
            ctx.quadraticCurveTo(x+random()*30,y-8+random()*25,nextX,nextY); x=nextX;y=nextY;
          }
          ctx.strokeStyle = `rgba(134,108,77,${.06+random()*.1})`; ctx.lineWidth = .4+random()*1.4;ctx.stroke();
        }
        for (let i = 0; i < 5500; i++) {
          ctx.fillStyle = i%2 ? 'rgba(137,112,82,.08)' : 'rgba(255,255,255,.22)';
          ctx.fillRect(random()*WIDTH,random()*HEIGHT,random()*2.5,random()*1.5);
        }
      }
      return canvas;
    }
    createHandSprite(primary) {
      const t = this.theme, canvas = document.createElement('canvas');
      const scale = Math.max(1, this.ratio);
      canvas.width = Math.ceil(66*scale); canvas.height = Math.ceil(20*scale);
      const ctx = canvas.getContext('2d'); ctx.scale(canvas.width/66,canvas.height/20);ctx.translate(7,10);
      ctx.shadowColor = t.bright ? 'rgba(0,0,0,.20)' : 'rgba(0,0,0,.65)';
      ctx.shadowBlur = 1.6;ctx.shadowOffsetX = .6;ctx.shadowOffsetY = 1.4;
      ctx.fillStyle = primary ? t.hand : t.hand2;
      ctx.fillRect(-3.6,-3.7,55.2,7.4);ctx.shadowColor = 'transparent';
      ctx.fillStyle = t.bright ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.13)';
      ctx.fillRect(1,-3.1,48.5,.6);
      return canvas;
    }
    createMetalShadow() {
      const canvas = document.createElement('canvas'), scale = Math.max(1, this.ratio);
      canvas.width = Math.ceil(66 * scale); canvas.height = Math.ceil(20 * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(canvas.width / 66, canvas.height / 20); ctx.translate(7, 10);
      ctx.shadowColor = this.theme.bright ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 1.4 * scale;
      ctx.fillStyle = this.theme.bright ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,.7)';
      ctx.fillRect(-3.6,-3.7,55.2,7.4);
      return canvas;
    }
    drawFaces() {
      const ctx = this.base, t = this.theme;
      ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
      const plate = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      plate.addColorStop(0, t.panelHi); plate.addColorStop(.55, t.panel); plate.addColorStop(1, t.panel);
      ctx.fillStyle = plate; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (this.texture) ctx.drawImage(this.texture, 0, 0);
      ctx.strokeStyle = t.bright ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.05)';
      ctx.lineWidth = 1; ctx.strokeRect(.5, .5, WIDTH - 1, HEIGHT - 1);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
        const { x, y } = center(col, row);
        const rim = ctx.createLinearGradient(x - 35, y - 58, x + 30, y + 58);
        rim.addColorStop(0, t.rimShadow || (t.bright ? '#b9b8b4' : '#0a0b0d'));
        rim.addColorStop(1, t.rimLight || (t.bright ? '#fffefa' : t.ring));
        circle(ctx, x, y, 57.3); ctx.fillStyle = rim; ctx.fill();
        const face = ctx.createRadialGradient(x + 19, y + 22, 1, x + 6, y + 7, 69);
        face.addColorStop(0, t.faceLight || (t.bright ? t.panelHi : t.hole));
        face.addColorStop(.64, t.hole); face.addColorStop(1, t.faceShadow || (t.bright ? '#b3b2af' : '#070809'));
        circle(ctx, x, y, 56.4); ctx.fillStyle = face; ctx.fill();
        if (this.texture) { ctx.save();ctx.clip();ctx.globalAlpha=.65;ctx.drawImage(this.texture,0,0);ctx.restore(); }
        // Recessed edge, with light arriving from the upper left.
        ctx.beginPath(); ctx.arc(x, y, 55.5, .1, Math.PI * 1.15);
        ctx.lineWidth = .9; ctx.strokeStyle = t.edge || (t.bright ? 'rgba(255,255,255,.48)' : 'rgba(255,255,255,.025)'); ctx.stroke();
      }
      this.staticDraws++;
    }
    drawHand(ctx, angle, primary) {
      const metal = this.theme.metals && this.theme.metals[primary ? 0 : 1];
      if (metal) {
        // The cast shadow follows a fixed world-space light, not the rotating
        // hand's local axes. Draw it before the reflective body.
        ctx.save(); ctx.translate(.65,1.25); ctx.rotate((angle - 90) * DEG);
        ctx.drawImage(this.metalShadow, -7, -10, 66, 20); ctx.restore();
        ctx.save(); ctx.rotate((angle - 90) * DEG);
        Metal.draw(ctx, this.metalAtlases.get(metal), angle); ctx.restore();
      } else {
        ctx.save(); ctx.rotate((angle - 90) * DEG);
        ctx.drawImage(this.handSprites[primary ? 0 : 1], -7, -10, 66, 20); ctx.restore();
      }
    }
    draw(angles, force = false) {
      const started = performance.now(), ctx = this.ctx;
      ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
      let painted = false;
      for (let i = 0; i < 48; i += 2) {
        if (!force && this.previous[i] === angles[i] && this.previous[i + 1] === angles[i + 1]) continue;
        const { col, row } = position(i), { x, y } = center(col, row);
        ctx.clearRect(x - 58, y - 58, 116, 116);
        ctx.save(); ctx.translate(x, y);
        this.drawHand(ctx, angles[i + 1], false); this.drawHand(ctx, angles[i], true);
        if (!this.theme.metals || !this.theme.metals[0]) {
          circle(ctx, 0, 0, 3.2); ctx.fillStyle = this.theme.hand; ctx.fill();
        }
        ctx.restore(); this.drawnClocks++; painted = true;
      }
      this.previous = angles.slice();
      if (painted) {
        this.frames++; this.samples.push(performance.now() - started);
        if (this.samples.length > 240) this.samples.shift();
      }
    }
    drift(wall) {
      // A subpixel-sized step every 10 s. No continuously running CSS animation.
      const x = this.config.drift ? Math.sin(wall / 175000) * Math.min(18, innerWidth * .012) : 0;
      const y = this.config.drift ? Math.cos(wall / 208000) * Math.min(14, innerHeight * .012) : 0;
      this.board.style.transform = `translate(calc(-50% + ${x.toFixed(3)}px), calc(-50% + ${y.toFixed(3)}px))`;
    }
    stats() {
      const sorted = this.samples.slice().sort((a,b) => a-b);
      return { frames: this.frames, staticDraws: this.staticDraws, drawnClocks: this.drawnClocks,
        width: this.hands.width, height: this.hands.height, dpr: this.dpr,
        backingMiB: +(this.hands.width * this.hands.height * 8 / 1048576).toFixed(2),
        materialMiB: +(((this.texture ? WIDTH*HEIGHT*4 : 0) +
          [...(this.handSprites || []), this.metalShadow, ...Array.from(this.metalAtlases.values(), a=>a.canvas)]
            .filter(Boolean).reduce((n,c)=>n+c.width*c.height*4,0))/1048576).toFixed(2),
        drawP95Ms: sorted.length ? +sorted[Math.floor((sorted.length - 1) * .95)].toFixed(3) : 0 };
    }
  }
  root.ClockClockRenderer = { Renderer, center };
})(window);
