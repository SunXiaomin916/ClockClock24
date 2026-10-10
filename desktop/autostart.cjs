'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ID = 'local.clockclock24.desktop';
const escapeXML = text => String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function launchAgent(executable) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${ID}</string><key>ProgramArguments</key><array><string>${escapeXML(executable)}</string><string>--autostart</string></array><key>RunAtLoad</key><true/><key>ProcessType</key><string>Interactive</string></dict></plist>\n`;
}
function createAutostart({app, platform=process.platform, executable=process.execPath, home=app.getPath('home')}) {
  const file = path.join(home,'Library','LaunchAgents',ID+'.plist');
  // Electron's Windows launch-item enumeration parses path as a command line;
  // quote it so installation folders containing spaces are matched in full.
  const options = {path:platform==='win32'?`"${executable}"`:executable,args:['--autostart']};
  function get() {
    if (!app.isPackaged) return {enabled:false,available:false,detail:'开发模式不注册开机启动'};
    if (platform === 'win32') {
      const state=app.getLoginItemSettings(options);
      return {available:true,enabled:state.openAtLogin && state.executableWillLaunchAtLogin !== false,
        detail:state.openAtLogin && state.executableWillLaunchAtLogin === false ? '已被 Windows 启动应用设置禁用' : ''};
    }
    if (platform === 'darwin') {
      let contents='';try {contents=fs.readFileSync(file,'utf8');} catch(e) {if(e.code!=='ENOENT')throw e;}
      return {available:true,enabled:contents===launchAgent(executable),detail:contents && contents!==launchAgent(executable)?'安装位置已改变，请重新开启':''};
    }
    return {enabled:false,available:false,detail:'当前系统不支持'};
  }
  function set(enabled) {
    if (typeof enabled !== 'boolean' || !app.isPackaged) throw new Error('只能在已打包的应用中更改开机启动');
    if (platform === 'win32') app.setLoginItemSettings({...options,name:ID,openAtLogin:enabled,enabled});
    else if (platform === 'darwin') {
      if (enabled) {
        fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file+'.tmp',launchAgent(executable),{mode:0o600});fs.renameSync(file+'.tmp',file);
      } else {try {fs.unlinkSync(file);} catch(e) {if(e.code!=='ENOENT')throw e;}}
    } else throw new Error('当前系统不支持');
    const state=get();
    if (state.enabled!==enabled) throw new Error(state.detail || '系统未接受开机启动设置');
    return state;
  }
  return {get,set};
}
module.exports={ID,escapeXML,launchAgent,createAutostart};
