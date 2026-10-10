'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {ID,launchAgent,createAutostart}=require('../desktop/autostart.cjs');
test('Windows startup reads back the exact executable and arguments, and detects OS rejection',()=>{
  let enabled=false,accepted=true;
  const app={isPackaged:true,getPath:()=>'',setLoginItemSettings:s=>{assert.equal(s.name,ID);assert.equal(s.path,'"C:\\Clock 24\\ClockClock 24.exe"');assert.deepEqual(s.args,['--autostart']);enabled=accepted&&s.openAtLogin;},
    getLoginItemSettings:s=>{assert.deepEqual(s,{path:'"C:\\Clock 24\\ClockClock 24.exe"',args:['--autostart']});return{openAtLogin:enabled,executableWillLaunchAtLogin:enabled};}};
  const startup=createAutostart({app,platform:'win32',executable:'C:\\Clock 24\\ClockClock 24.exe'});
  assert.equal(startup.get().enabled,false);assert.equal(startup.set(true).enabled,true);assert.equal(startup.set(false).enabled,false);
  accepted=false;assert.throws(()=>startup.set(true),/系统未接受/);
});
test('macOS startup writes a user LaunchAgent with safe paths, detects moves and removes only its own file',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'cc24-agent-'));
  const app={isPackaged:true,getPath:()=>home};
  try{
    const executable='/Users/test/Applications/Clock & "24".app/Contents/MacOS/ClockClock 24';
    const startup=createAutostart({app,platform:'darwin',executable,home});
    assert.equal(startup.get().enabled,false);assert.equal(startup.set(true).enabled,true);
    const xml=fs.readFileSync(path.join(home,'Library','LaunchAgents',ID+'.plist'),'utf8');
    assert.match(xml,/Clock &amp; &quot;24&quot;/);assert.match(xml,/<key>RunAtLoad<\/key><true\/>/);assert.match(xml,/--autostart/);assert.doesNotMatch(xml,/KeepAlive/);
    const moved=createAutostart({app,platform:'darwin',executable:'/new/path',home});assert.equal(moved.get().enabled,false);assert.match(moved.get().detail,/位置/);
    const unrelated=path.join(home,'Library','LaunchAgents','other.plist');fs.writeFileSync(unrelated,'retain');
    assert.equal(startup.set(false).enabled,false);assert.equal(startup.set(false).enabled,false);assert.equal(fs.readFileSync(unrelated,'utf8'),'retain');
  }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('development app cannot register login items; startup input is boolean only',()=>{
  const app={isPackaged:false,getPath:()=>'',setLoginItemSettings:()=>assert.fail('must not write')};
  const startup=createAutostart({app,platform:'win32'});
  assert.equal(startup.get().available,false);assert.throws(()=>startup.set(true));assert.throws(()=>startup.set('true'));
});
