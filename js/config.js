(function(root) {
'use strict';
const {PATTERNS} = typeof module==='object'&&module.exports ? require('./choreography.js') : root.ClockClockChoreography;
const THEMES = {
 noir: {bg:'#0d0e12', halo:'#25282c', panel:'#17191d', panelHi:'#22252a', ring:'#303237', hole:'#101216', center:'#0e1014', hand:'#ebe9e3', hand2:'#e1ded7', tip:'#aaa8a3', glow:'rgba(255,255,255,.13)', bright:false},
 porcelain: {bg:'#e9e8e5', halo:'#f3f2ee', panel:'#eeeae7', panelHi:'#fffefd', ring:'#ffffff', hole:'#e4e2df', center:'#dedcd9', hand:'#26282c', hand2:'#33353a', tip:'#222327', glow:'rgba(0,0,0,.10)', bright:true},
 gold: {bg:'#0d0c0d', halo:'#26201a', panel:'#151313', panelHi:'#1e1a18', ring:'#292422', hole:'#0b0a0a', center:'#0b0909', hand:'#cfaa78', hand2:'#b98f59', tip:'#f9db9e', glow:'rgba(238,171,75,.16)', bright:false},
 stone: {bg:'#24262a', halo:'#393b3e', panel:'#d4d3d0', panelHi:'#eceae6', ring:'#f1efeb', hole:'#c3c2be', center:'#bcbab6', hand:'#27282a', hand2:'#353638', tip:'#171717', glow:'rgba(0,0,0,.1)', bright:true},
 oled: {bg:'#000000', halo:'#000000', panel:'#020202', panelHi:'#060606', ring:'#121212', hole:'#050505', center:'#050505', hand:'#999d9e', hand2:'#868a8b', tip:'#aeb1b2', glow:'rgba(255,255,255,.045)', bright:false}
};
// Photo-derived approximations of the official editions. Existing theme IDs
// remain unchanged so saved browser and Wallpaper Engine settings still load.
const SILVER = 'silver';
const GOLD = 'gold';
THEMES.gold.metals = [GOLD, GOLD];
Object.assign(THEMES, {
 white_gold: {...THEMES.porcelain, hand:'#c09348', hand2:'#c09348', metals:[GOLD,GOLD]},
 white_sterling: {...THEMES.porcelain, hand:'#8d969f', hand2:'#8d969f', metals:[SILVER,SILVER]},
 black_sterling: {...THEMES.noir, panel:'#171717', panelHi:'#252525', hole:'#101010', hand:'#bbc1c6', hand2:'#bbc1c6', metals:[SILVER,SILVER]},
 dada_blue: {bg:'#d4d9e1',halo:'#eef0f3',panel:'#26396c',panelHi:'#324a82',ring:'#456096',hole:'#243665',hand:'#f5f5f2',hand2:'#e8edf2',bright:false,rimShadow:'#152346',rimLight:'#486292',faceLight:'#334d81',faceShadow:'#122044',edge:'rgba(123,157,215,.18)'},
 pinakin_neela: {...THEMES.porcelain,hand:'#1739b5',hand2:'#929ba4',metals:[null,SILVER]},
 pinakin_hara: {...THEMES.porcelain,hand:'#087c4d',hand2:'#c09348',metals:[null,GOLD]},
 decade: {...THEMES.porcelain,hand:'#25262a',hand2:'#c09348',metals:[null,GOLD]},
 sunset_dune: {bg:'#d1c3b3',halo:'#eee5d8',panel:'#a3593c',panelHi:'#bb7049',ring:'#dca877',hole:'#aa6142',hand:'#ddc0a2',hand2:'#ddc0a2',bright:true,rimShadow:'#663924',rimLight:'#e1ae7f',faceLight:'#cd946c',faceShadow:'#603924',edge:'rgba(255,213,161,.24)',metals:[GOLD,SILVER],texture:'travertine'},
 pari_dust: {...THEMES.porcelain,bg:'#dbd6cf',halo:'#f3f0ea',panel:'#e2ddd4',panelHi:'#f5f2eb',hole:'#d5d0c7',hand:'#93948e',hand2:'#93948e',rimShadow:'#aea99d',rimLight:'#fcf8ed',faceLight:'#f1eee5',faceShadow:'#a49f92',metals:[SILVER,SILVER],texture:'marble'}
});
const THEME_LABELS = Object.freeze({
 noir:'曜石黑 · Noir',porcelain:'瓷白 · Porcelain',gold:'黑金 · Black Gold',stone:'岩灰 · Stone',oled:'OLED 纯黑',
 white_gold:'白金 · White Gold',white_sterling:'白银 · White Sterling',black_sterling:'黑银 · Black Sterling',
 dada_blue:'达达蓝 · Dada Blue',pinakin_neela:'蓝银 · Pinakin Neela',pinakin_hara:'绿金 · Pinakin Hara',
 decade:'黑金双针 · Decade',sunset_dune:'落日洞石 · Sunset Dune',pari_dust:'暖白石纹 · Pari Dust'
});
const DEFAULT = Object.freeze({theme:'noir',mode:'active',choreography:'auto',format:'24',fps:'60',size:'86',drift:false});
const OPTIONS = {theme:Object.keys(THEMES),mode:['quiet','medium','active'],choreography:['auto',...PATTERNS],format:['12','24'],fps:['30','60','120','180','240','360'],size:['72','86','96']};
function sanitize(patch, base = DEFAULT) {
 const result = {...base};
 if (!patch || typeof patch !== 'object') return result;
 for (const key of Object.keys(DEFAULT)) {
  const value = patch[key];
  if (key === 'drift') { if (typeof value === 'boolean') result[key] = value; }
  else if ((typeof value === 'string' || typeof value === 'number') && OPTIONS[key].includes(String(value))) result[key] = String(value);
 }
 return result;
}
const api = {THEMES,THEME_LABELS,DEFAULT,OPTIONS,sanitize};
if (typeof module === 'object' && module.exports) module.exports=api;
else root.ClockClockConfig=api;
})(typeof window !== 'undefined' ? window : globalThis);
