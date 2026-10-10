'use strict';
// Optional QA dependency: install Playwright separately, or expose an existing
// installation with NODE_PATH. Wallpaper Engine and npm test need no packages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { targetAngles } = require('../js/glyphs.js');
const base = process.env.CC24_URL || 'http://127.0.0.1:8765';
const output = process.env.CC24_QA_DIR || path.join(os.tmpdir(),'cc24-qa-20261010');
fs.mkdirSync(output,{recursive:true});
(async () => {
  const browser = await chromium.launch({ channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true });
  const errors = [], external = [], results = [];
  const page = await browser.newPage({viewport:{width:1920,height:1080}});
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', e=>{if(['error','warning'].includes(e.type()))errors.push(e.text());});
  page.on('request', req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(base))external.push(req.url());});
  const check = (name, details = '') => {results.push({name,pass:true,details});console.log('PASS',name,details);};
  const state = () => page.evaluate(()=>CC24.getDiagnostics());
  const settle = async () => {await page.clock.runFor(14000);assert.equal((await state()).moving,false);};
  const screenshot = async name => page.screenshot({path:path.join(output,name+'.png'),style:'#gear,#status { visibility:hidden !important; }'});
  try {
    await page.clock.install({time:new Date(2026,9,10,9,35,20)});
    await page.goto(base+'/?dev=1');
    await page.clock.runFor(100);
    assert.match(await page.title(),/ClockClock 24/);assert.equal(await page.locator('canvas').count(),2);
    assert.match(await page.locator('#installation').getAttribute('aria-label'),/09:35/);
    const pixels=await page.evaluate(()=>{const c=document.getElementById('stage');const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<p.length;i+=4)if(p[i])count++;return count;});
    assert.ok(pixels>10000);check('page identity, nonblank canvas, no framework overlay',`${pixels} opaque hand pixels`);
    await screenshot('noir-1080');
    await page.click('#gear'); await page.selectOption('#mode','quiet'); await page.selectOption('#theme','porcelain');
    await page.selectOption('#format','12');await page.clock.runFor(100);
    assert.equal(await page.evaluate(()=>CC24.getSettings().theme),'porcelain');
    await page.click('#dev-controls summary');
    await page.fill('#preview-time','23:59:59'); await page.click('#apply-time'); await page.clock.runFor(1500);
    assert.equal(await page.evaluate(()=>CC24.getTime()),'1200'); await settle();
    assert.deepEqual(await page.evaluate(()=>CC24.getAngles()),targetAngles('1200'));
    check('UI configuration and normal 12-hour midnight transition','23:59:59 → 12:00, exact final angles');
    await page.selectOption('#format','24');
    await page.evaluate(()=>CC24.debug.setTime('23:59:59',false));await page.clock.runFor(1500);await settle();
    assert.equal(await page.evaluate(()=>CC24.getTime()),'0000');check('24-hour midnight','23:59 → 00:00');
    await page.evaluate(()=>CC24.debug.setTime('10:59:59',false));await page.clock.runFor(1500);await settle();
    assert.equal(await page.evaluate(()=>CC24.getTime()),'1100');check('hour rollover','10:59 → 11:00');
    await page.click('#close');
    for(let digit=0;digit<10;digit++) {
      await page.evaluate(d=>CC24.debug.setDigits(String(d).repeat(4)),digit);await page.clock.runFor(80);
      assert.deepEqual(await page.evaluate(()=>CC24.getAngles()),targetAngles(String(digit).repeat(4)));
      await screenshot('digit-'+digit);
    }
    check('all ten glyphs rendered and captured','0–9, four positions each');
    const patterns=await page.evaluate(()=>ClockClockChoreography.PATTERNS);
    assert.deepEqual(await page.locator('#choreography option').evaluateAll(options=>options.map(o=>o.value)),['auto',...patterns]);
    const scores=[];
    for(const pattern of patterns) {
      await page.click('#gear');await page.selectOption('#choreography',pattern);
      await page.evaluate(()=>CC24.debug.setDigits('0935'));await page.click('#demo');await page.click('#close');
      assert.equal((await state()).pattern,pattern);
      const timeline=await page.evaluate(()=>CC24.debug.getTimeline());assert.equal(timeline.length,4);
      const now=await page.evaluate(()=>performance.now());
      await page.clock.runFor(Math.ceil(timeline[1].until-now+60));
      await screenshot('score-'+pattern);
      await page.clock.runFor(8000);assert.equal((await state()).moving,false);
      assert.deepEqual(await page.evaluate(()=>CC24.getAngles()),targetAngles('0935'));
      scores.push({pattern,durationMs:timeline.at(-1).until-timeline[0].at});
    }
    await page.evaluate(()=>CC24.setSetting('choreography','auto'));
    check('all twelve choreography controls and exact return',JSON.stringify(scores));
    await page.evaluate(()=>{CC24.debug.setDigits('0935');CC24.setSetting('theme','porcelain');}); await page.clock.runFor(100);
    await screenshot('porcelain-1080');
    const idleBefore=await state();await page.clock.runFor(21000);const idleAfter=await state();
    assert.equal(idleAfter.frames,idleBefore.frames);assert.equal(idleAfter.staticDraws,idleBefore.staticDraws);assert.equal(idleAfter.pendingRAF,false);
    check('idle stops painting and requestAnimationFrame','21 seconds: 0 extra frames');
    await page.evaluate(()=>CC24.setSetting('drift',true));const driftBefore=await page.locator('#installation').getAttribute('style');
    await page.clock.runFor(12000);assert.notEqual(await page.locator('#installation').getAttribute('style'),driftBefore);
    assert.equal((await state()).frames,idleBefore.frames);await page.evaluate(()=>CC24.setSetting('drift',false));
    check('optional drift moves both layers without repainting');
    await page.evaluate(()=>{CC24.showDemo();window.wallpaperPropertyListener.setPaused(true);});
    const stopped=await state();assert.equal(stopped.pendingRAF,false);assert.equal(stopped.pendingTimer,false);
    await page.clock.runFor(60000);assert.equal((await state()).frames,stopped.frames);
    await page.evaluate(()=>{CC24.debug.live();window.wallpaperPropertyListener.applyUserProperties({theme:{value:'gold'},mode:{value:'medium'}});});
    assert.equal((await state()).frames,stopped.frames);
    await page.clock.fastForward(3600000);await page.evaluate(()=>window.wallpaperPropertyListener.setPaused(false));await page.clock.runFor(100);
    assert.equal((await state()).moving,false);assert.equal(await page.evaluate(()=>CC24.getTime()),await page.evaluate(()=>ClockClockTime.formatTime(new Date(),CC24.getSettings().format)));
    check('native pause, config while paused and one-hour resume','no timers/RAF while paused; immediate current time');
    await page.evaluate(()=>{CC24.showDemo();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal((await state()).pendingTimer,false);await page.clock.runFor(6000);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(100);
    assert.equal((await state()).moving,false);check('visibility lifecycle (simulated document.hidden)','suspends and resynchronizes');
    for (const fps of [30,60]) {
      await page.evaluate(f=>{CC24.setSetting('fps',String(f));window.wallpaperPropertyListener.applyGeneralProperties({fps:60});CC24.showDemo();},fps);
      const before=(await state()).frames;await page.clock.runFor(3000);const frames=(await state()).frames-before;
      assert.ok(frames>=fps*2.7&&frames<=fps*3.1,`${fps} FPS: ${frames} frames`);check(`${fps} FPS animation cap`,`${frames} draws / 3 simulated seconds`);await settle();
    }
    await page.evaluate(()=>{CC24.setSetting('fps','60');window.wallpaperPropertyListener.applyGeneralProperties({fps:15});CC24.showDemo();});
    let before=(await state()).frames;await page.clock.runFor(3000);let frames=(await state()).frames-before;
    assert.ok(frames>=40&&frames<=46);check('Wallpaper Engine global FPS cap',`${frames} draws / 3 simulated seconds at 15 FPS`);await settle();
    await page.evaluate(()=>{window.wallpaperPropertyListener.applyGeneralProperties({fps:60});CC24.setSetting('theme','noir');CC24.debug.setDigits('0935');});
    for(const size of [{width:3840,height:2160},{width:2560,height:1440},{width:3440,height:1440},{width:390,height:844},{width:1280,height:300}]) {
      await page.setViewportSize(size);
      // Chromium dispatches real viewport changes independently of the virtual
      // clock. Wait for the resulting layout, not a fixed amount of fake time.
      let rect, fits=false;
      for(let attempt=0;attempt<10&&!fits;attempt++) {
        await page.clock.runFor(100);rect=await page.locator('#installation').boundingBox();
        fits=rect.x>=0&&rect.y>=0&&rect.x+rect.width<=size.width+1&&rect.y+rect.height<=size.height+1&&Math.abs(rect.width-Math.min(size.width*.86,size.height*1.94))<1;
        if(!fits) await page.waitForTimeout(50);
      }
      assert.ok(fits,JSON.stringify({size,rect,diagnostics:await state()}));
      if(size.width===3840) {await screenshot('noir-4k');await page.evaluate(()=>CC24.showDemo());await page.clock.runFor(3000);await screenshot('motion-4k');await settle();check('4K draw diagnostics',JSON.stringify(await state()));}
      if(size.width===390) {await page.click('#gear');assert.ok(await page.locator('#sheet').isVisible());await screenshot('mobile-settings');await page.click('#close');}
    }
    check('resize and aspect ratios','4K, 1440p, ultrawide, 390×844, 1280×300');
    await page.setViewportSize({width:1920,height:1080});
    const themes=await page.evaluate(()=>Object.keys(ClockClockConfig.THEMES));
    assert.deepEqual(await page.locator('#theme option').evaluateAll(options=>options.map(o=>o.value)),themes);
    for(const theme of themes) {
      await page.selectOption('#theme',theme,{force:true});
      await page.evaluate(()=>CC24.setSetting('size','96'));await page.clock.runFor(100);
      assert.equal(await page.evaluate(()=>CC24.getSettings().theme),theme);
      await screenshot('theme-'+theme);
    }
    await page.evaluate(()=>CC24.setSetting('theme','oled'));await page.clock.runFor(100);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(0, 0, 0)');
    await screenshot('oled-1080');check('all theme controls and OLED pure black background',`${themes.length} themes`);
    await page.evaluate(()=>CC24.setSetting('theme','porcelain'));await page.reload();await page.clock.runFor(100);
    assert.equal(await page.evaluate(()=>CC24.getSettings().theme),'porcelain');check('browser settings persist across reload');
    await page.goto(base+'/');await page.clock.runFor(100);assert.equal(await page.evaluate(()=>!!CC24.debug),false);check('production has no simulated-time API');
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.clock.runFor(100);
    assert.equal(await page.locator('canvas').count(),2);assert.equal(await page.evaluate(()=>CC24.getAngles().length),48);
    check('offline file:// entry loads without module/CORS dependencies');
    const hidpi=await browser.newPage({viewport:{width:3840,height:2160},deviceScaleFactor:2});
    await hidpi.goto(base+'/');await hidpi.waitForTimeout(200);
    const hi=await hidpi.evaluate(()=>CC24.getDiagnostics());assert.ok(hi.backingMiB<46);await hidpi.close();check('4K high-DPI memory budget',`${hi.backingMiB} MiB of canvas backing storage`);
    const early=await browser.newPage();early.on('pageerror',e=>errors.push(e.message));
    await early.route('**/js/bridge.js',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text())+'\nwallpaperPropertyListener.applyUserProperties({theme:{value:"oled"},format:{value:12},size:{value:72}});wallpaperPropertyListener.applyGeneralProperties({fps:20});wallpaperPropertyListener.setPaused(true);'});
    });
    await early.goto(base+'/');
    assert.deepEqual(await early.evaluate(()=>[CC24.getSettings().theme,CC24.getSettings().format,CC24.getSettings().size,CC24.getDiagnostics().effectiveFps]),['oled','12','72',20]);
    assert.equal(await early.evaluate(()=>CC24.getDiagnostics().pendingTimer),false);
    await early.evaluate(()=>wallpaperPropertyListener.setPaused(false));await early.waitForTimeout(100);
    assert.equal(await early.evaluate(()=>CC24.getDiagnostics().paused),false);await early.close();check('early native callbacks survive resource loading','properties, FPS and paused state buffered before app.js');
    const corrupt=await browser.newPage({reducedMotion:'reduce'});corrupt.on('pageerror',e=>errors.push(e.message));
    await corrupt.addInitScript(()=>localStorage.setItem('cc24_settings',JSON.stringify({theme:'unknown',fps:0,drift:'false',size:null})));
    await corrupt.goto(base+'/');assert.equal(await corrupt.evaluate(()=>CC24.getSettings().fps),'60');
    await corrupt.evaluate(()=>CC24.showDemo());assert.equal(await corrupt.evaluate(()=>CC24.getDiagnostics().pattern),'quiet');
    await corrupt.close();check('invalid browser storage and reduced-motion preference','safe defaults; demo honors Quiet');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);check('console health and offline requests','0 errors/warnings, 0 external requests');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({browser:await browser.version(),base,results,errors,external},null,2));
    console.log(`Evidence: ${output}`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
