(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { DEFAULT, THEME_LABELS, sanitize } = window.ClockClockConfig;
  const {LABELS} = window.ClockClockChoreography;
  for (const [value, label] of Object.entries(THEME_LABELS)) {
    const option = document.createElement('option'); option.value = value; option.textContent = label;
    $('theme').appendChild(option);
  }
  for (const [value,label] of Object.entries({auto:'自动轮播（12 / 5 组）',...LABELS})) {
    const option=document.createElement('option');option.value=value;option.textContent=label;$('choreography').appendChild(option);
  }
  const { targetAngles } = window.ClockClockGlyphs;
  const { MotionEngine } = window.ClockClockMotion;
  const { TimeSync, nextWake, formatTime } = window.ClockClockTime;
  const params = new URLSearchParams(location.search), dev = params.get('dev') === '1';
  let config = { ...DEFAULT };
  try { config = sanitize(JSON.parse(localStorage.getItem('cc24_settings')), DEFAULT); } catch (_) { /* Storage can be disabled in a wallpaper host. */ }
  let virtualWall = null, virtualMono = 0, previewDigits = null;
  const wallNow = () => virtualWall === null ? Date.now() : virtualWall + performance.now() - virtualMono;
  const sync = new TimeSync();
  let displayMinute = formatTime(new Date(wallNow()), config.format);
  const motion = new MotionEngine(targetAngles(displayMinute));
  const renderer = new window.ClockClockRenderer.Renderer($('installation'), $('faces'), $('stage'));
  let generation = 0, raf = null, timer = null, pausedByHost = false, host = false;
  let iconTimer = null, lastIconActivity = 0;
  const ICON_IDLE_MS = 10000;
  // Until the host supplies a limit, use the selected cap and browser RAF cadence.
  let globalFps = Infinity, lastFrame = -Infinity, lastCallback = 0, lastDrift = 0, needsLayout = false;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paused = () => pausedByHost || document.hidden;
  const effectiveFps = () => Math.min(Number(config.fps), globalFps);
  function cancelIconTimer() { clearTimeout(iconTimer); iconTimer = null; }
  function hideIdleIcon() {
    iconTimer = null;
    if (paused() || (host && !dev) || !$('sheet').hidden) return;
    const remaining = ICON_IDLE_MS - (performance.now() - lastIconActivity);
    if (remaining > 0) iconTimer = setTimeout(hideIdleIcon, remaining);
    else $('gear').classList.add('idle');
  }
  function showSettingsIcon() {
    if (paused() || (host && !dev)) return;
    lastIconActivity = performance.now();
    $('gear').classList.remove('idle');
    // Keep one timeout while the pointer moves, rather than recreating one
    // for every mouse event. No animation frames or polling are needed.
    if (iconTimer === null && $('sheet').hidden) iconTimer = setTimeout(hideIdleIcon, ICON_IDLE_MS);
  }
  const save = () => { try { localStorage.setItem('cc24_settings', JSON.stringify(config)); } catch (_) {} };
  function controls() {
    for (const key of Object.keys(DEFAULT)) {
      if ($(key).type === 'checkbox') $(key).checked = config[key]; else $(key).value = config[key];
    }
  }
  function status() {
    $('installation').setAttribute('aria-label', `ClockClock 24，${displayMinute.slice(0,2)}:${displayMinute.slice(2)}，${config.format} 小时制`);
    if (dev) {
      const stats = renderer.stats();
      $('status').textContent = `${displayMinute.slice(0,2)}:${displayMinute.slice(2)} · ${previewDigits ? '数字检查' : virtualWall === null ? '系统时间' : '模拟时间'} · ${LABELS[motion.pattern] || '静谧'} · ${effectiveFps()} FPS 上限 · ${stats.frames} 帧 · ${stats.backingMiB} MiB`;
    }
  }
  function requestDraw() {
    if (raf === null && !paused()) raf = requestAnimationFrame(render);
  }
  function render(now) {
    raf = null;
    if (paused()) return;
    if (lastCallback && now - lastCallback > 2000) synchronize(false);
    lastCallback = now;
    const interval = 1000 / effectiveFps();
    if (now - lastFrame < interval - .5) { requestDraw(); return; }
    // A frame admitted by the rounding tolerance must advance the deadline too;
    // modulo alone can otherwise admit the next RAF a second time at 30 FPS.
    lastFrame = Number.isFinite(lastFrame) ? lastFrame + interval * Math.max(1, Math.floor((now - lastFrame + .5) / interval)) : now;
    if (needsLayout) { renderer.configure(config); needsLayout = false; }
    const moving = motion.update(now);
    renderer.draw(motion.angles); status();
    if (moving) requestDraw();
  }
  function transition(text, snap = false, demo = false) {
    displayMinute = text;
    const targets = targetAngles(text), now = performance.now();
    if (snap) motion.snap(targets);
    else motion.animate(targets, now, reducedMotion ? 'quiet' : demo ? 'active' : config.mode, generation++, config.choreography);
    requestDraw(); status();
  }
  function synchronize(force) {
    const result = sync.sample(wallNow(), performance.now(), config.format, force);
    if (previewDigits) return;
    if (result.snap || result.changed || displayMinute !== result.text) transition(result.text, result.snap);
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (!paused()) timer = setTimeout(tick, nextWake(wallNow()));
  }
  function tick() {
    timer = null;
    if (paused()) return;
    synchronize(false);
    if (config.drift && performance.now() - lastDrift >= 10000) { renderer.drift(Date.now()); lastDrift = performance.now(); }
    schedule();
  }
  function stop() {
    cancelIconTimer();
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; clearTimeout(timer); timer = null;
  }
  function resume() {
    stop();
    if (paused()) return;
    if (needsLayout) { renderer.configure(config); needsLayout = false; }
    lastFrame = -Infinity; lastCallback = 0;
    if (previewDigits) transition(previewDigits, true); else synchronize(true);
    renderer.drift(Date.now()); requestDraw(); schedule(); showSettingsIcon();
  }
  function applyPatch(patch, persist = true) {
    const old = config; config = sanitize(patch, config); renderer.config = config; controls();
    if (persist) {
      save();
      if (window.clockDesktop) window.dispatchEvent(new CustomEvent('cc24-appearance',{detail:{...config}}));
    }
    if (old.theme !== config.theme || old.size !== config.size) needsLayout = true;
    if (!paused()) {
      if (old.drift !== config.drift) renderer.drift(Date.now());
      if (old.format !== config.format && !previewDigits) transition(formatTime(new Date(wallNow()), config.format));
      if (old.fps !== config.fps) lastFrame = -Infinity;
      if (needsLayout) requestDraw();
    }
    status();
  }
  function toggleSettings(open = $('sheet').hidden) {
    $('sheet').hidden = !open; $('gear').setAttribute('aria-expanded', String(open));
    cancelIconTimer(); showSettingsIcon();
    if (open) $('close').focus({ preventScroll: true }); else $('gear').focus({ preventScroll: true });
  }
  function demo() {
    if (paused()) return;
    transition(previewDigits || formatTime(new Date(wallNow()), config.format), false, true);
  }
  function setVirtualTime(value, animate = true) {
    const date = typeof value === 'number' ? new Date(value) : new Date();
    if (typeof value === 'string') {
      if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return false;
      const [h,m,s = 0] = value.split(':').map(Number); date.setHours(h,m,s,0);
    }
    if (!Number.isFinite(date.getTime())) return false;
    virtualWall = date.getTime(); virtualMono = performance.now(); previewDigits = null;
    sync.sample(wallNow(), performance.now(), config.format);
    transition(formatTime(date, config.format), !animate); schedule(); return true;
  }
  for (const key of Object.keys(DEFAULT)) $(key).addEventListener('change', () => applyPatch({ [key]: $(key).type === 'checkbox' ? $(key).checked : $(key).value }));
  $('gear').setAttribute('aria-controls', 'sheet'); $('gear').setAttribute('aria-expanded', 'false');
  $('gear').addEventListener('click', () => toggleSettings());
  $('close').addEventListener('click', () => toggleSettings(false));
  window.addEventListener('pointermove', showSettingsIcon, { passive:true });
  window.addEventListener('pointerdown', showSettingsIcon, { passive:true });
  document.addEventListener('click', e => {
    if (!$('sheet').hidden && !$('sheet').contains(e.target) && !$('gear').contains(e.target)) toggleSettings(false);
  });
  $('demo').addEventListener('click', demo);
  $('fullscreen').addEventListener('click', () => {
    const result = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    if (result && result.catch) result.catch(() => {});
    toggleSettings(false);
  });
  window.addEventListener('keydown', e => {
    if (host && !dev) return;
    showSettingsIcon();
    if (e.key === 'Escape') toggleSettings(false);
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key.toLowerCase() === 'c') toggleSettings();
    if (e.key.toLowerCase() === 'd') demo();
    if (e.key.toLowerCase() === 'f') $('fullscreen').click();
  });
  window.addEventListener('resize', () => { needsLayout = true; requestDraw(); });
  document.addEventListener('visibilitychange', () => paused() ? stop() : resume());
  window.addEventListener('pageshow', e => { if (e.persisted) resume(); });
  window.addEventListener('pagehide', stop);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = e => { reducedMotion = e.matches; };
  if (media.addEventListener) media.addEventListener('change', reduce); else media.addListener(reduce);
  renderer.configure(config); controls();
  window.ClockClockBridge.bind((name, value) => {
    if (name === 'setPaused') { pausedByHost = !!value; if (paused()) stop(); else resume(); return; }
    if (name === 'applyGeneralProperties') {
      if (value && Number.isFinite(value.fps) && value.fps > 0) { globalFps = Math.max(1, value.fps); lastFrame = -Infinity; }
      status(); return;
    }
    if (!value || typeof value !== 'object') return;
    const patch = {};
    if (!host) { Object.assign(patch, DEFAULT); host = true; document.body.classList.toggle('wallpaper', !dev); $('sheet').hidden = true; cancelIconTimer(); showSettingsIcon(); }
    for (const key of Object.keys(DEFAULT)) if (Object.prototype.hasOwnProperty.call(value, key) && value[key]) patch[key] = value[key].value;
    applyPatch(patch, false);
  });
  window.CC24 = {
    getSettings: () => ({ ...config }), getTime: () => displayMinute, getAngles: () => motion.angles,
    showDemo: demo, setSetting: (name, value) => applyPatch({ [name]: value }),
    getDiagnostics: () => ({ ...renderer.stats(), moving: motion.moving, pattern: motion.pattern, paused: paused(),
      effectiveFps: effectiveFps(), pendingRAF: raf !== null, pendingTimer: timer !== null, dev, host })
  };
  if (window.clockDesktop) window.CC24.applyDesktopSettings = patch => applyPatch(patch, false);
  if (dev) {
    document.body.classList.add('debug'); $('dev-controls').hidden = false;
    for (let digit = 0; digit < 10; digit++) { const option = document.createElement('option'); option.value = String(digit); option.textContent = `${digit} · ${String(digit).repeat(4)}`; $('preview-digits').appendChild(option); }
    window.CC24.debug = {
      setTime: setVirtualTime,
      setDigits(text, animate = false) { if (!/^\d{4}$/.test(text)) return false; previewDigits = text; transition(text, !animate); return true; },
      live() { virtualWall = null; previewDigits = null; synchronize(true); schedule(); },
      getMotion: () => motion.hands.map(h => ({ angle:h.angle, target:h.target, velocity:h.velocity, acceleration:h.acceleration })),
      getTimeline: () => motion.timeline.map(phase=>({...phase}))
    };
    $('apply-time').addEventListener('click', () => setVirtualTime($('preview-time').value));
    $('live-time').addEventListener('click', window.CC24.debug.live);
    $('preview-digits').addEventListener('change', () => { if ($('preview-digits').value !== '') window.CC24.debug.setDigits($('preview-digits').value.repeat(4)); });
    if (params.has('time')) setVirtualTime(params.get('time'), false);
    if (params.has('digits')) window.CC24.debug.setDigits(params.get('digits'));
  }
  resume();
})();
