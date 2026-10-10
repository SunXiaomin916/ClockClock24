import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {packager} from '@electron/packager';
import plist from 'plist';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const build=path.join(root,'build'),release=path.join(root,'release'),stage=path.join(build,'app');
const selected=process.argv[2]||'all';
async function packageApp(options){
  for(let attempt=0;;attempt++){
    try{return await packager(options);}catch(error){
      if(attempt>=2||!['EPERM','EACCES'].includes(error.code)||error.syscall!=='rename')throw error;
      console.log('Temporary packaging file lock; retrying…');await new Promise(resolve=>setTimeout(resolve,1500));
    }
  }
}
if(!['all','windows','macos','wallpaper','source'].includes(selected))throw new Error('Expected all, windows, macos, wallpaper or source');
await fs.mkdir(release,{recursive:true});
async function reset(target){
  const resolved=path.resolve(target);
  if(!resolved.startsWith(build+path.sep)||resolved===build)throw new Error('Refusing to clear outside build staging: '+resolved);
  await fs.rm(resolved,{recursive:true,force:true});await fs.mkdir(resolved,{recursive:true});
}
async function copy(name,into=stage){await fs.cp(path.join(root,name),path.join(into,name),{recursive:true});}
const python=process.env.CC24_PYTHON || (process.platform==='win32'?'python':'python3');
async function zip(folder,name){
  if(process.env.CC24_SKIP_ARCHIVES==='1')return;
  await new Promise((resolve,reject)=>{const child=spawn(python,[path.join(root,'tools','zip-release.py'),folder,path.join(release,name+'.zip')],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Archive failed: '+code)));});
}
const runtime=['index.html','js','css','preview.jpg'];
if(!['wallpaper','source'].includes(selected)){
  await reset(stage);
  for(const name of [...runtime,'desktop'])await copy(name);
  await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,productName:pkg.productName,version:pkg.version,main:pkg.main,description:pkg.description},null,2));
  // Keep the native Windows attachment helper outside the application archive.
  const common={dir:stage,out:path.join(build,'packages'),overwrite:true,name:'ClockClock 24',executableName:'ClockClock24',
    appBundleId:'local.clockclock24.desktop',appVersion:pkg.version,buildVersion:pkg.version,
    electronVersion:pkg.devDependencies.electron,asar:true,prune:false,
    win32metadata:{CompanyName:'ClockClock24 Independent Project',FileDescription:'ClockClock 24 Desktop Wallpaper'},
    darwinDarkModeSupport:true,extendInfo:{LSUIElement:true,LSMinimumSystemVersion:'13.0'}};
  if(selected==='all'||selected==='windows'){
    console.log('Building Windows x64…');
    const helper=path.join(build,'native','window-layer.exe');await fs.mkdir(path.dirname(helper),{recursive:true});
    const compiler=process.env.CC24_CSC||path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
    await new Promise((resolve,reject)=>{const child=spawn(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/out:'+helper,path.join(root,'desktop','windows-wallpaper.cs')],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Native helper compile failed: '+code)));});
    const [folder]=await packageApp({...common,platform:'win32',arch:'x64',icon:path.join(root,'desktop','assets','icon.ico'),extraResource:[helper]});
    await fs.copyFile(path.join(root,'docs','Windows使用说明.txt'),path.join(folder,'使用说明.txt'));
    await zip(folder,`ClockClock24-${pkg.version}-Windows-x64`);
  }
  if(selected==='all'||selected==='macos'){
    for(const arch of ['arm64','x64']){
      console.log('Building macOS '+arch+'…');
      const [folder]=await packageApp({...common,platform:'darwin',arch,icon:path.join(root,'desktop','assets','icon.icns')});
      if(process.platform!=='darwin'){
        // Packager uses posix.relative on Windows paths here; normalize the key
        // for Electron's macOS resource integrity lookup before local signing.
        const file=path.join(folder,'ClockClock 24.app','Contents','Info.plist');
        const info=plist.parse(await fs.readFile(file,'utf8'));
        if(info.ElectronAsarIntegrity){const [value]=Object.values(info.ElectronAsarIntegrity);info.ElectronAsarIntegrity={'Resources/app.asar':value};}
        await fs.writeFile(file,plist.build(info));
      }
      await fs.copyFile(path.join(root,'desktop','macos-install.command'),path.join(folder,'安装到应用程序.command'));
      await fs.copyFile(path.join(root,'desktop','entitlements.plist'),path.join(folder,'entitlements.plist'));
      await fs.copyFile(path.join(root,'docs','macOS使用说明.txt'),path.join(folder,'使用说明.txt'));
      await zip(folder,`ClockClock24-${pkg.version}-macOS-${arch}`);
    }
  }
}
if(selected==='all'||selected==='wallpaper'){
  const folder=path.join(build,'WallpaperEngine'),content=path.join(folder,'ClockClock24');await reset(folder);await fs.mkdir(content);
  for(const name of [...runtime,'project.json'])await copy(name,content);
  await fs.copyFile(path.join(root,'docs','WallpaperEngine使用说明.txt'),path.join(folder,'使用说明.txt'));
  await zip(folder,`ClockClock24-${pkg.version}-WallpaperEngine`);
}
if(selected==='all'||selected==='source'){
  const folder=path.join(build,'ClockClock24-Source');await reset(folder);
  for(const name of [...runtime,'project.json','desktop','tests','tools','docs','README.md','README.zh-CN.md','使用说明.txt','package.json','package-lock.json','.gitignore','.gitattributes'])await copy(name,folder);
  await zip(folder,`ClockClock24-${pkg.version}-Source`);
}
console.log('Release output: '+release);
