'use strict';
// Optional deterministic visual capture, with no runtime dependencies.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.CC24_URL||'http://127.0.0.1:8765';
const out=process.env.CC24_QA_DIR||path.join(os.tmpdir(),'cc24-choreography');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.clock.install({time:new Date(2026,9,11,9,35,20)});
    await page.goto(base+'/?dev=1&digits=0935');await page.clock.runFor(100);
    await page.click('#gear');await page.selectOption('#theme','porcelain');await page.selectOption('#size','96');await page.selectOption('#fps','60');
    await page.click('#close');await page.clock.runFor(100);
    for(const pattern of ['wave','iris','checker','spiral']) {
      await page.click('#gear');await page.selectOption('#choreography',pattern);await page.click('#demo');await page.click('#close');
      for(let i=0;i<70;i++) {
        await page.clock.runFor(200);
        await page.screenshot({path:path.join(out,`${pattern}-${String(i).padStart(2,'0')}.png`),style:'#gear,#status{visibility:hidden!important}'});
      }
      assert.equal(await page.evaluate(()=>CC24.getDiagnostics().moving),false);
      console.log('PASS',pattern,'70 motion frames; returns to time');
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
