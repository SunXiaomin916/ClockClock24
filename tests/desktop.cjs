'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {_electron:electron}=require('playwright');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const executablePath=process.env.CC24_EXE||path.join(root,'build','packages','ClockClock 24-win32-x64','ClockClock24.exe');
const output=process.env.CC24_DESKTOP_QA_DIR||path.join(os.tmpdir(),'cc24-desktop-qa');
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cc24-profile-'));
(async()=>{
  let application,settings,startupChanged=false;
  const results=[],errors=[];
  const check=name=>{results.push(name);console.log('PASS',name);};
  try{
    application=await electron.launch({executablePath,env:{...process.env,CC24_TEST_PROFILE:profile}});
    for(let i=0;i<200&&!settings;i++){
      settings=application.windows().find(page=>page.url().includes('desktop=settings'));
      if(!settings)await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(settings,'settings window opens');await settings.waitForFunction(()=>window.CC24&&window.clockDesktop);
    for(const page of application.windows())page.on('pageerror',e=>errors.push(e.message));
    await settings.waitForFunction(()=>!document.getElementById('desktop-controls').hidden);
    await settings.waitForFunction(async()=>{const s=await clockDesktop.getState();return s.wallpaperReady||s.desktopError;});
    const initial=await settings.evaluate(()=>clockDesktop.getState());
    assert.equal(initial.startup.enabled,false,'Refusing to alter an existing enabled startup registration');
    assert.equal(initial.appearance.fps,'60');assert.equal(initial.wallpaper,true);
    assert.equal(initial.desktopError,'',initial.desktopError);
    assert.equal(await settings.evaluate(()=>typeof window.require),'undefined');
    check('packaged EXE loads settings, isolated preload, 60 FPS default, desktop attached');
    let wallpaper=application.windows().find(page=>page.url().includes('desktop=wallpaper'));
    assert.ok(wallpaper);
    await wallpaper.waitForFunction(()=>CC24.getDiagnostics().frames>0);
    const native=await application.evaluate(({BrowserWindow})=>{
      const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('desktop=wallpaper'));
      return {handle:win.getNativeWindowHandle().readBigUInt64LE().toString(),visible:win.isVisible(),bounds:win.getBounds()};
    });
    const status=JSON.parse(execFileSync(path.join(path.dirname(executablePath),'resources','window-layer.exe'),[native.handle,'check'],{encoding:'utf8',windowsHide:true}));
    assert.equal(status.attached,true,JSON.stringify({status,native,current:await settings.evaluate(()=>clockDesktop.getState())}));check('native HWND parent verified as Windows desktop layer');
    await settings.selectOption('#theme','porcelain');
    await wallpaper.waitForFunction(()=>CC24.getSettings().theme==='porcelain');
    await settings.selectOption('#fps','120');await wallpaper.waitForFunction(()=>CC24.getSettings().fps==='120');
    check('settings synchronize to live wallpaper');
    startupChanged=true;await settings.locator('#desktop-startup').click();
    await settings.waitForFunction(async()=>(await clockDesktop.getState()).startup.enabled);
    const login=await application.evaluate(({app})=>app.getLoginItemSettings({path:`"${process.execPath}"`,args:['--autostart']}));
    assert.equal(login.openAtLogin,true);assert.equal(login.executableWillLaunchAtLogin,true);
    assert.ok(login.launchItems.some(item=>item.name==='local.clockclock24.desktop'&&item.path===executablePath));
    await settings.screenshot({path:path.join(output,'startup-enabled.png')});
    await settings.locator('#desktop-startup').uncheck();
    await settings.waitForFunction(async()=>!(await clockDesktop.getState()).startup.enabled);startupChanged=false;
    check('startup UI writes actual HKCU registration with correct path/args and removes it');
    await settings.locator('#desktop-paused').check();
    await wallpaper.waitForFunction(()=>CC24.getDiagnostics().paused);
    const paused=await wallpaper.evaluate(()=>CC24.getDiagnostics());
    assert.equal(paused.pendingRAF,false);assert.equal(paused.pendingTimer,false);
    await settings.locator('#desktop-paused').uncheck();
    await wallpaper.waitForFunction(()=>!CC24.getDiagnostics().paused);check('pause cancels timers and resume synchronizes');
    await settings.locator('#desktop-wallpaper').uncheck();
    await settings.waitForFunction(async()=>!(await clockDesktop.getState()).wallpaper);
    assert.equal(application.windows().filter(p=>p.url().includes('desktop=wallpaper')).length,0);
    await settings.locator('#desktop-wallpaper').check();
    await settings.waitForFunction(async()=>{const s=await clockDesktop.getState();return s.wallpaperReady||s.desktopError;});
    assert.equal((await settings.evaluate(()=>clockDesktop.getState())).desktopError,'');
    for(let i=0;i<120;i++){
      wallpaper=application.windows().find(page=>page.url().includes('desktop=wallpaper'));
      if(wallpaper&&await wallpaper.evaluate(()=>!!window.CC24&&CC24.getDiagnostics().frames>0))break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(wallpaper);check('wallpaper switch destroys and recreates the desktop layer');
    await wallpaper.screenshot({path:path.join(output,'wallpaper.png')});
    await settings.screenshot({path:path.join(output,'settings.png')});
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('desktop=settings')).close());
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('desktop=settings')).isVisible()),false);
    assert.equal(await wallpaper.evaluate(()=>CC24.getDiagnostics().paused),false);check('closing settings leaves wallpaper running');
    await application.evaluate(({powerMonitor})=>powerMonitor.emit('suspend'));
    await wallpaper.waitForFunction(()=>CC24.getDiagnostics().paused);
    await application.evaluate(({powerMonitor})=>powerMonitor.emit('resume'));
    await wallpaper.waitForFunction(()=>!CC24.getDiagnostics().paused);
    check('simulated OS suspend/resume propagates to wallpaper timers');
    await settings.evaluate(async()=>{await Promise.all([clockDesktop.setWallpaper(false),clockDesktop.setWallpaper(true),clockDesktop.setWallpaper(false)]);});
    assert.equal((await settings.evaluate(()=>clockDesktop.getState())).wallpaper,false);
    assert.equal(application.windows().filter(p=>p.url().includes('desktop=wallpaper')).length,0);
    await settings.evaluate(()=>clockDesktop.setWallpaper(true));
    assert.equal((await settings.evaluate(()=>clockDesktop.getState())).wallpaperReady,true);
    check('rapid wallpaper changes settle in the last requested state');
    await application.close();settings=null;
    application=await electron.launch({executablePath,args:['--autostart'],env:{...process.env,CC24_TEST_PROFILE:profile}});
    const startupPage=await application.firstWindow();
    await startupPage.waitForFunction(()=>window.clockDesktop&&window.CC24);
    await startupPage.waitForFunction(async()=>(await clockDesktop.getState()).wallpaperReady);
    assert.equal(application.windows().length,1);
    assert.match(startupPage.url(),/desktop=wallpaper/);
    const restored=await startupPage.evaluate(()=>clockDesktop.getState());
    assert.equal(restored.appearance.theme,'porcelain');assert.equal(restored.appearance.fps,'120');assert.equal(restored.startup.enabled,false);
    check('login launch argument opens only wallpaper/tray and preserves settings across restart');
    assert.deepEqual(errors,[]);check('no renderer runtime errors');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({executablePath,profile,native,results,errors},null,2));
  }catch(error){
    if(settings&&!settings.isClosed()){
      console.error('Desktop state:',await settings.evaluate(async()=>({state:await clockDesktop.getState(),message:document.getElementById('desktop-message').textContent})));
      await settings.screenshot({path:path.join(output,'failure.png')});
      console.error('Login settings:',await application.evaluate(({app})=>app.getLoginItemSettings({path:`"${process.execPath}"`,args:['--autostart']})));
    }
    throw error;
  }finally{
    if(application){
      if(startupChanged)await application.evaluate(({app})=>app.setLoginItemSettings({name:'local.clockclock24.desktop',path:process.execPath,args:['--autostart'],openAtLogin:false,enabled:false}));
      await application.close();
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
