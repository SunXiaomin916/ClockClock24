(function () {
  'use strict';
  const desktop=window.clockDesktop;
  if(!desktop)return;
  const $=id=>document.getElementById(id);
  const wallpaper=new URLSearchParams(location.search).get('desktop')==='wallpaper';
  let lastPaused;
  document.body.classList.toggle('desktop-wallpaper',wallpaper);
  if(!wallpaper)$('desktop-controls').hidden=false;
  function report(error){$('desktop-message').textContent=error.message||String(error);}
  function receive(state){
    window.CC24.applyDesktopSettings(state.appearance);
    if(wallpaper){
      if(lastPaused!==state.paused){lastPaused=state.paused;window.wallpaperPropertyListener.setPaused(state.paused);}
    }
    else{
      $('desktop-wallpaper').checked=state.wallpaper;
      $('desktop-paused').checked=state.paused;
      $('desktop-startup').checked=state.startup.enabled;
      $('desktop-startup').disabled=!state.startup.available;
      $('desktop-message').textContent=state.desktopError||state.startup.detail||(state.wallpaper&&!state.wallpaperReady?'正在准备桌面壁纸…':'壁纸显示在主显示器。关闭此窗口后，应用继续在托盘／菜单栏运行。');
    }
  }
  desktop.onState(receive);desktop.onDemo(()=>window.CC24.showDemo());
  desktop.getState().then(receive).catch(report);
  window.addEventListener('cc24-appearance',event=>desktop.setAppearance(event.detail).catch(report));
  for(const [id,method] of [['desktop-startup','setStartup'],['desktop-wallpaper','setWallpaper'],['desktop-paused','setPaused']]){
    $(id).addEventListener('change',async()=>{
      const control=$(id);control.disabled=true;let failure;
      try{await desktop[method](control.checked);receive(await desktop.getState());}
      catch(error){failure=error;}
      finally{
        try{receive(await desktop.getState());if(id!=='desktop-startup')control.disabled=false;}catch(error){failure=error;control.disabled=false;}
        if(failure)report(failure);
      }
    });
  }
  $('desktop-quit').addEventListener('click',()=>desktop.quit().catch(report));
  if(!wallpaper){
    $('gear').click();
    $('demo').addEventListener('click',()=>desktop.demo().catch(report));
  }
})();
