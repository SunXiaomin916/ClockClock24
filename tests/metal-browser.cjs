'use strict';
// Optional real-browser material test. Evidence stays outside the project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.CC24_URL || 'http://127.0.0.1:8765';
const output = process.env.CC24_QA_DIR || path.join(os.tmpdir(), 'cc24-metal');
fs.mkdirSync(output, { recursive:true });
(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true});
  const errors = [], external = [];
  const page = await browser.newPage({viewport:{width:3840,height:2160}});
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', e=>{if (['error','warning'].includes(e.type())) errors.push(e.text());});
  page.on('request', r=>{if (/^https?:/.test(r.url())&&!r.url().startsWith(base)) external.push(r.url());});
  try {
    await page.goto(base+'/?dev=1&digits=0935');
    await page.click('#gear'); await page.selectOption('#theme','sunset_dune');
    await page.selectOption('#fps','60'); await page.click('#close');
    await page.waitForFunction(()=>CC24.getDiagnostics().materialMiB > 2);
    // Compare actual rendered texels in the hand's local space. Geometry does
    // not rotate in this check: a difference proves the reflection changed.
    const pixels = await page.evaluate(() => {
      const atlas = ClockClockMetal.createAtlas('silver', 3, document);
      const c = document.createElement('canvas'); c.width=180; c.height=30;
      const ctx = c.getContext('2d', {willReadFrequently:true});
      const raster = angle => {
        ctx.clearRect(0,0,180,30); ctx.save();ctx.scale(3,3);ctx.translate(4,5);
        ClockClockMetal.draw(ctx,atlas,angle);ctx.restore();
        return ctx.getImageData(16,7,140,16).data;
      };
      const a=raster(0), b=raster(45), wrap=raster(360), left=raster(359.99), right=raster(.01);
      const diff=(x,y)=>Array.from(x).reduce((sum,v,i)=>sum+Math.abs(v-y[i]),0)/x.length;
      const opaque=Array.from(a).filter((_,i)=>i%4===3).every(v=>v===255);
      return {angleDifference:diff(a,b),wrapDifference:diff(a,wrap),seamDifference:diff(left,right),opaque};
    });
    assert.ok(pixels.angleDifference>15,JSON.stringify(pixels));
    assert.equal(pixels.wrapDifference,0);assert.ok(pixels.seamDifference<1);assert.ok(pixels.opaque);
    console.log('PASS material pixels',JSON.stringify(pixels));
    const start = await page.evaluate(() => {CC24.showDemo();return CC24.getDiagnostics();});
    await page.waitForTimeout(4000);
    const moving = await page.evaluate(()=>CC24.getDiagnostics());
    assert.ok(moving.frames>start.frames);assert.ok(moving.materialMiB<10);
    await page.waitForFunction(()=>!CC24.getDiagnostics().moving);
    const settled = await page.evaluate(()=>CC24.getDiagnostics());
    await page.waitForTimeout(2100);
    const idle = await page.evaluate(()=>CC24.getDiagnostics());
    assert.equal(idle.frames,settled.frames); assert.equal(idle.pendingRAF,false);
    console.log('PASS 4K metallic motion and idle',JSON.stringify({framesIn4s:moving.frames-start.frames,
      drawP95Ms:moving.drawP95Ms,materialMiB:moving.materialMiB,backingMiB:moving.backingMiB,idleExtraFrames:idle.frames-settled.frames}));
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(output,'metal-results.json'),JSON.stringify({browser:await browser.version(),pixels,moving,idle,errors,external},null,2));
    if (process.env.CC24_CAPTURE_MOTION==='1') {
      // Deterministic frames for visual review; these are not a timing benchmark.
      const capture = await browser.newPage({viewport:{width:1280,height:720}});
      await capture.clock.install({time:new Date(2026,9,11,9,35,20)});
      await capture.goto(base+'/?dev=1&digits=0935');await capture.clock.runFor(100);
      for (const theme of ['white_sterling','white_gold']) {
        await capture.evaluate(theme=>{CC24.setSetting('theme',theme);CC24.setSetting('size','96');},theme);
        await capture.clock.runFor(100);await capture.evaluate(()=>CC24.showDemo());
        for (let frame=0;frame<64;frame++) {
          await capture.clock.runFor(125);
          await capture.screenshot({path:path.join(output,`${theme}-${String(frame).padStart(2,'0')}.png`),
            style:'#gear,#status {visibility:hidden!important}'});
        }
      }
      await capture.close();console.log('PASS motion evidence: 64 frames each for silver and gold');
    }
    console.log('PASS console health and offline requests');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
