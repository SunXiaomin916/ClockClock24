'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('clockDesktop',{
  getState:()=>ipcRenderer.invoke('cc24:state'),
  setAppearance:patch=>ipcRenderer.invoke('cc24:appearance',patch),
  setStartup:enabled=>ipcRenderer.invoke('cc24:startup',enabled),
  setWallpaper:enabled=>ipcRenderer.invoke('cc24:wallpaper',enabled),
  setPaused:enabled=>ipcRenderer.invoke('cc24:paused',enabled),
  demo:()=>ipcRenderer.invoke('cc24:demo'),
  quit:()=>ipcRenderer.invoke('cc24:quit'),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('cc24:changed',listener);return()=>ipcRenderer.removeListener('cc24:changed',listener);},
  onDemo:callback=>{ipcRenderer.on('cc24:demo',()=>callback());}
});
