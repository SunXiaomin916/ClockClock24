import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {extractFile,getRawHeader} from '@electron/asar';
import plist from 'plist';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
const runtime=['index.html',...fs.readdirSync(path.join(root,'js')).map(f=>'js/'+f),'css/style.css','desktop/main.cjs','desktop/preload.cjs','desktop/autostart.cjs'];
for(const platform of ['win32-x64','darwin-arm64','darwin-x64']){
  const folder=path.join(root,'build','packages','ClockClock 24-'+platform);
  const resources=platform.startsWith('win')?path.join(folder,'resources'):path.join(folder,'ClockClock 24.app','Contents','Resources');
  const asar=path.join(resources,'app.asar');
  for(const file of runtime)if(hash(extractFile(asar,file))!==hash(fs.readFileSync(path.join(root,file))))throw new Error(`${platform}: stale file ${file}`);
  const packageJson=JSON.parse(extractFile(asar,'package.json').toString());
  if(packageJson.version!==JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version)throw new Error('Version mismatch');
  if(platform.startsWith('darwin')){
    const info=plist.parse(fs.readFileSync(path.join(folder,'ClockClock 24.app','Contents','Info.plist'),'utf8'));
    if(info.ElectronAsarIntegrity['Resources/app.asar'].hash!==hash(getRawHeader(asar).headerString))throw new Error('macOS asar header integrity mismatch');
    const binary=fs.readFileSync(path.join(folder,'ClockClock 24.app','Contents','MacOS',info.CFBundleExecutable));
    const cpu=binary.readUInt32LE(4),expected=platform.endsWith('arm64')?0x0100000c:0x01000007;
    if(cpu!==expected)throw new Error('Wrong macOS CPU architecture');
    if(info.LSMinimumSystemVersion!=='13.0'||!info.LSUIElement)throw new Error('macOS app metadata mismatch');
  }else if(!fs.existsSync(path.join(resources,'window-layer.exe')))throw new Error('Missing Windows desktop helper');
  console.log('PASS '+platform+': runtime matches source and package metadata is consistent');
}
for(const file of runtime.filter(f=>!f.startsWith('desktop/'))){
  if(hash(fs.readFileSync(path.join(root,'build','WallpaperEngine','ClockClock24',file)))!==hash(fs.readFileSync(path.join(root,file))))throw new Error('Stale wallpaper resource '+file);
}
console.log('PASS Wallpaper Engine: isolated content matches current web source');
