'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,screen,powerMonitor,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const {sanitize,DEFAULT}=require('../js/config.js');
const {ID,createAutostart}=require('./autostart.cjs');
const root=path.join(__dirname,'..');
// A separate profile is used only by packaged-app QA; normal launches share one instance.
if(process.env.CC24_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.CC24_TEST_PROFILE));
app.setName('ClockClock 24');
if(process.platform==='win32')app.setAppUserModelId(ID);
const preferencesFile=path.join(app.getPath('userData'),'desktop-settings.json');
let preferences={appearance:{...DEFAULT},wallpaper:true};
try{const saved=JSON.parse(fs.readFileSync(preferencesFile,'utf8'));preferences={appearance:sanitize(saved.appearance),wallpaper:typeof saved.wallpaper==='boolean'?saved.wallpaper:true};}catch{}
let tray,settingsWindow,wallpaperWindow,autostart,quitting=false,pausedByUser=false,suspended=false,desktopError='',attachTimer,refreshTimer,creating=false,wallpaperReady=false,displayKey='',rebuildPromise=null,pendingRefresh=false;
const save=()=>{fs.mkdirSync(path.dirname(preferencesFile),{recursive:true});fs.writeFileSync(preferencesFile+'.tmp',JSON.stringify(preferences,null,2));fs.renameSync(preferencesFile+'.tmp',preferencesFile);};
const log=error=>{try{fs.appendFileSync(path.join(app.getPath('userData'),'desktop.log'),new Date().toISOString()+' '+String(error)+'\n');}catch{}};
const startupState=()=>{try{return autostart.get();}catch(error){log(error);return{enabled:false,available:false,detail:'无法读取系统启动项，请检查文件权限'};}};
const state=()=>({appearance:preferences.appearance,wallpaper:preferences.wallpaper,paused:pausedByUser||suspended,
  startup:startupState(),platform:process.platform,version:app.getVersion(),desktopError,wallpaperReady});
function broadcast(){
  const value=state();
  for(const win of [wallpaperWindow,settingsWindow])if(win&&!win.isDestroyed())win.webContents.send('cc24:changed',value);
  updateMenu();
}
function protect(win){
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  win.webContents.on('render-process-gone',(_event,details)=>{log(details.reason);if(!quitting&&details.reason!=='clean-exit')win.reload();});
}
function options(){return {preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true};}
function openSettings(){
  if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}
  settingsWindow=new BrowserWindow({width:1100,height:860,minWidth:600,minHeight:640,title:'ClockClock 24',backgroundColor:'#101114',
    show:false,autoHideMenuBar:true,icon:path.join(__dirname,'assets','icon.png'),webPreferences:options()});
  protect(settingsWindow);
  settingsWindow.loadFile(path.join(root,'index.html'),{query:{desktop:'settings'}});
  settingsWindow.once('ready-to-show',()=>{settingsWindow.show();settingsWindow.focus();});
  settingsWindow.on('close',event=>{if(!quitting){event.preventDefault();settingsWindow.hide();}});
  settingsWindow.on('focus',()=>broadcast());
}
function destroyWallpaper(){
  wallpaperReady=false;
  clearInterval(attachTimer);attachTimer=null;
  if(wallpaperWindow&&!wallpaperWindow.isDestroyed())wallpaperWindow.destroy();
  wallpaperWindow=null;
}
async function windowsLayer(check=false){
  if(!wallpaperWindow||wallpaperWindow.isDestroyed())return;
  const handle=wallpaperWindow.getNativeWindowHandle().readBigUInt64LE().toString();
  const helper=app.isPackaged?path.join(process.resourcesPath,'window-layer.exe'):path.join(root,'build','native','window-layer.exe');
  const bounds=screen.dipToScreenRect(null,screen.getPrimaryDisplay().bounds);
  const {stdout}=await run(helper,[handle,...(check?['check']:['attach',String(bounds.x),String(bounds.y),String(bounds.width),String(bounds.height)])],{windowsHide:true,timeout:12000});
  return JSON.parse(stdout.trim());
}
function createWallpaper(){
  pendingRefresh=true;
  if(!rebuildPromise)rebuildPromise=(async()=>{
    while(pendingRefresh&&!quitting){pendingRefresh=false;await rebuildWallpaper();}
  })().finally(()=>{rebuildPromise=null;});
  return rebuildPromise;
}
async function rebuildWallpaper(){
  if(quitting)return;
  creating=true;destroyWallpaper();desktopError='';
  try{
    if(!preferences.wallpaper)return;
    const display=screen.getPrimaryDisplay(),bounds=display.bounds;
    displayKey=JSON.stringify([display.id,display.bounds,display.scaleFactor]);
    const win=wallpaperWindow=new BrowserWindow({...bounds,frame:false,show:false,opacity:process.platform==='win32'?0:1,skipTaskbar:true,focusable:false,resizable:false,
      movable:false,hasShadow:false,roundedCorners:false,thickFrame:false,backgroundColor:'#101114',
      ...(process.platform==='darwin'?{type:'desktop'}:{}),webPreferences:{...options(),backgroundThrottling:false}});
    protect(win);win.setIgnoreMouseEvents(true);
    if(process.platform==='darwin')win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:false});
    await win.loadFile(path.join(root,'index.html'),{query:{desktop:'wallpaper'}});
    if(win.isDestroyed()||quitting)return;
    if(process.platform==='win32'){
      win.showInactive();
      await windowsLayer();
      win.setOpacity(1);
      attachTimer=setInterval(async()=>{
        if(suspended||creating||quitting)return;
        try{
          if(!wallpaperWindow||wallpaperWindow.isDestroyed()){await createWallpaper();return;}
          const result=await windowsLayer(true);if(result&&!result.attached)await createWallpaper();
        }catch(e){log(e);}
      },60000);
    }else win.showInactive();
    wallpaperReady=true;
    broadcast();
  }catch(error){
    if(quitting)return;
    log(error);desktopError='桌面挂载失败，可继续使用时钟窗口，或从托盘重试。';destroyWallpaper();broadcast();openSettings();
  }finally{creating=false;}
}
async function setWallpaper(enabled){
  if(typeof enabled!=='boolean')throw new Error('无效的开关值');
  preferences.wallpaper=enabled;save();await createWallpaper();broadcast();return state();
}
async function setStartup(enabled){const result=autostart.set(enabled);broadcast();return result;}
function updateMenu(){
  if(!tray)return;
  let startup;try{startup=autostart.get();}catch(e){log(e);startup={enabled:false,available:false};}
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'ClockClock 24',enabled:false},{type:'separator'},
    {label:'打开设置 / 时钟窗口',click:openSettings},
    {label:'桌面壁纸',type:'checkbox',checked:preferences.wallpaper,click:item=>setWallpaper(item.checked).catch(log)},
    {label:'暂停动画',type:'checkbox',checked:pausedByUser,click:item=>{pausedByUser=item.checked;broadcast();}},
    {label:'开机启动',type:'checkbox',checked:startup.enabled,enabled:startup.available,click:item=>{try{setStartup(item.checked).catch(showError);}catch(e){showError(e);}}},
    {label:'重新挂载桌面',enabled:preferences.wallpaper,click:()=>createWallpaper()},
    {type:'separator'},{label:'退出 ClockClock 24',click:()=>app.quit()}
  ]));
}
function showError(error){log(error);dialog.showMessageBox({type:'error',message:'无法更新设置',detail:String(error.message||error)});}
function trusted(event){
  if(![wallpaperWindow,settingsWindow].some(win=>win&&!win.isDestroyed()&&win.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame)throw new Error('Unknown window');
}
function handle(channel,callback){ipcMain.handle(channel,(event,...args)=>{trusted(event);return callback(...args);});}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',(_event,args)=>{if(!args.includes('--autostart'))openSettings();});
  app.whenReady().then(async()=>{
    autostart=createAutostart({app});
    Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:'ClockClock 24',submenu:[{label:'设置',click:openSettings},{role:'quit'}]},{role:'editMenu'}]):null);
    if(process.platform==='darwin')app.dock.hide();
    const icon=nativeImage.createFromPath(path.join(__dirname,'assets',process.platform==='darwin'?'trayTemplate.png':'tray.png'));
    if(process.platform==='darwin')icon.setTemplateImage(true);
    tray=new Tray(icon);tray.setToolTip('ClockClock 24');tray.on('double-click',openSettings);updateMenu();
    handle('cc24:state',state);
    handle('cc24:appearance',patch=>{preferences.appearance=sanitize(patch,preferences.appearance);save();broadcast();return state();});
    handle('cc24:startup',setStartup);handle('cc24:wallpaper',setWallpaper);
    handle('cc24:paused',enabled=>{if(typeof enabled!=='boolean')throw new Error('Invalid value');pausedByUser=enabled;broadcast();return state();});
    handle('cc24:demo',()=>{if(wallpaperWindow&&!wallpaperWindow.isDestroyed())wallpaperWindow.webContents.send('cc24:demo');});
    handle('cc24:quit',()=>setImmediate(()=>app.quit()));
    for(const event of ['suspend','lock-screen'])powerMonitor.on(event,()=>{suspended=true;broadcast();});
    for(const event of ['resume','unlock-screen'])powerMonitor.on(event,()=>{suspended=false;broadcast();});
    const refresh=()=>{
      const display=screen.getPrimaryDisplay();
      if(JSON.stringify([display.id,display.bounds,display.scaleFactor])===displayKey)return;
      clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>createWallpaper(),500);
    };
    for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,refresh);
    await createWallpaper();
    if(!process.argv.includes('--autostart'))openSettings();
    app.on('activate',openSettings);
  }).catch(error=>{log(error);dialog.showErrorBox('ClockClock 24',String(error));app.quit();});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;clearTimeout(refreshTimer);destroyWallpaper();if(tray)tray.destroy();});
