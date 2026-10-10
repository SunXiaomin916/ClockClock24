'use strict';
// Optional Playwright regression. High-frequency RAF below is test-only:
// simulated draws establish limiter behavior, not physical display performance.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const {targetAngles}=require('../js/glyphs.js');
const rates=['30','60','120','180','240','360'];
const base=process.env.CC24_URL||'http://127.0.0.1:8765';
const out=process.env.CC24_QA_DIR||path.join(os.tmpdir(),'cc24-fps');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const errors=[],results=[];
  const check=(name,details)=>{results.push({name,details,pass:true});console.log('PASS',name,details||'');};
  const watch=page=>{
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(['error','warning'].includes(e.type()))errors.push(e.text());});
  };
  try {
    const page=await browser.newPage({viewport:{width:1280,height:720}});watch(page);
    await page.clock.install({time:new Date(2026,9,11,9,35,20)});
    await page.goto(base+'/?dev=1&digits=0935');await page.clock.runFor(100);
    assert.match(await page.title(),/ClockClock 24/);assert.equal(page.url(),base+'/?dev=1&digits=0935');
    assert.equal(await page.locator('canvas').count(),2);
    assert.match(await page.locator('#installation').getAttribute('aria-label'),/09:35/);
    await page.click('#gear');
    assert.deepEqual(await page.locator('#fps option').evaluateAll(os=>os.map(o=>o.value)),rates);
    for(const fps of rates) {
      await page.selectOption('#fps',fps);
      assert.equal(await page.evaluate(()=>CC24.getSettings().fps),fps);
      assert.equal(await page.evaluate(()=>CC24.getDiagnostics().effectiveFps),Number(fps));
    }
    check('six selectable browser FPS caps without implicit 60 FPS ceiling',rates.join(', '));
    await page.reload();await page.clock.runFor(100);
    assert.equal(await page.evaluate(()=>CC24.getSettings().fps),'360');
    await page.click('#gear');await page.click('#demo');await page.clock.runFor(500);
    await page.screenshot({path:path.join(out,'fps-desktop.png')});
    check('saved 360 FPS restores after reload and demo renders');
    await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);
    const select=await page.locator('#fps').boundingBox();
    assert.ok(select&&select.x>=0&&select.x+select.width<=390);
    await page.screenshot({path:path.join(out,'fps-mobile.png')});
    check('desktop and mobile settings fit','1280x720 / 390x844');
    for(const fps of rates) {
      await page.evaluate(f=>wallpaperPropertyListener.applyUserProperties({fps:{value:Number(f)}}),fps);
      assert.equal(await page.evaluate(()=>CC24.getSettings().fps),fps);
    }
    await page.evaluate(()=>wallpaperPropertyListener.applyGeneralProperties({fps:360}));
    assert.equal(await page.evaluate(()=>CC24.getDiagnostics().effectiveFps),360);
    await page.evaluate(()=>wallpaperPropertyListener.applyGeneralProperties({fps:144}));
    assert.equal(await page.evaluate(()=>CC24.getDiagnostics().effectiveFps),144);
    await page.evaluate(()=>wallpaperPropertyListener.applyGeneralProperties({fps:15}));
    assert.equal(await page.evaluate(()=>CC24.getDiagnostics().effectiveFps),15);
    check('native property callbacks and global caps','360, 144 and 15; no hidden 240 cap');
    await page.close();

    const high=await browser.newPage({viewport:{width:640,height:360}});watch(high);
    await high.clock.install({time:new Date(2026,9,11,9,35,20)});
    await high.addInitScript(()=>{
      // 500 synthetic callbacks/s give every selectable cap enough headroom.
      window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),2);
      window.cancelAnimationFrame=id=>clearTimeout(id);
    });
    await high.goto(base+'/?dev=1&digits=0935');await high.clock.runFor(100);
    let duration;
    for(const fps of [...rates,'global15']) {
      await high.evaluate(f=>{
        CC24.debug.setDigits('0935');CC24.setSetting('choreography','pendulum');
        CC24.setSetting('fps',f==='global15'?'360':f);
        wallpaperPropertyListener.applyGeneralProperties({fps:f==='global15'?15:360});
      },fps);
      await high.clock.runFor(100);await high.evaluate(()=>CC24.showDemo());
      const timeline=await high.evaluate(()=>CC24.debug.getTimeline());
      const length=timeline.at(-1).until-timeline[0].at;
      if(duration===undefined)duration=length;else assert.equal(length,duration);
      await high.clock.runFor(200);
      const before=await high.evaluate(()=>CC24.getDiagnostics().frames);
      await high.clock.runFor(1000);
      const count=await high.evaluate(()=>CC24.getDiagnostics().frames)-before;
      const expected=fps==='global15'?15:Number(fps);
      assert.ok(Math.abs(count-expected)<=1,`${fps}: ${count} draws`);
      // The cadence sample above needs every callback; the endpoint check only
      // needs the next callback at the final time, as after a stalled frame.
      await high.clock.fastForward(14000);
      assert.deepEqual(await high.evaluate(()=>CC24.getAngles()),targetAngles('0935'));
      const idle=await high.evaluate(()=>CC24.getDiagnostics());assert.equal(idle.pendingRAF,false);
      await high.clock.runFor(1100);
      assert.equal(await high.evaluate(()=>CC24.getDiagnostics().frames),idle.frames);
      check(`${fps} simulated render cap`,`${count} draws/second; duration ${duration} ms; exact return; idle 0 draws`);
    }
    assert.deepEqual(errors,[]);check('console health','0 errors/warnings');
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),simulation:true,results,errors},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
