(function (root) {
  'use strict';
  const { position } = typeof module === 'object' && module.exports ? require('./glyphs.js') : root.ClockClockGlyphs;
  // Our descriptive names and scores, not the manufacturer's unpublished programs.
  const LABELS = Object.freeze({
    wave:'行进波浪', pendulum:'同步钟摆', spiral:'同心螺旋', iris:'花瓣开合',
    cascade:'逐行瀑布', checker:'棋盘翻转', symmetry:'镜像对开', orbit:'四组风车',
    counterflow:'双针逆流', weave:'交织流线', stagger:'交错剪刀', scatter:'散开重聚'
  });
  const PATTERNS = Object.keys(LABELS);
  const MEDIUM_PATTERNS = ['wave','pendulum','cascade','symmetry','weave'];
  const SPIRAL = [0,1,2,3,4,5,6,7,15,23,22,21,20,19,18,17,16,8,9,10,11,12,13,14];
  const layouts = Array.from({length:48}, (_, index) => {
    const p=position(index);
    return {...p,index,side:p.hand ? 1 : -1,parity:(p.col+p.row)%2 ? 1 : -1,
      radial:Math.atan2(p.row-1,(p.col-3.5)*.72)*180/Math.PI+90,
      orbit:Math.atan2(p.row-1,p.col%2-.5)*180/Math.PI+90,
      spiral:SPIRAL.indexOf(p.row*8+p.col)};
  });
  const resolve = (value, p) => typeof value === 'function' ? value(p) : value;
  const phase = (name, pose, options={}) => ({name,pose,delay:0,direction:0,turns:0,minimum:1850,hold:180,...options});
  const line = a => p => a+p.hand*180;
  function buildScore(pattern, mode='active') {
    let phases;
    switch(pattern) {
      case 'wave': phases=[
        phase('平行列阵',line(45),{delay:p=>(7-p.col)*65}),
        phase('波峰行进',line(45),{direction:1,turns:1,delay:p=>p.col*150,minimum:3400}),
        phase('回波',line(135),{direction:-1,delay:p=>(7-p.col)*115})];break;
      case 'pendulum': phases=[
        phase('向左摆',line(315)),
        phase('向右摆',line(45),{minimum:2200}),
        phase('回摆',line(315),{minimum:2200})];break;
      case 'spiral': phases=[
        phase('同心环阵',p=>p.radial+90+p.hand*180,{delay:p=>p.spiral*30}),
        phase('旋涡',p=>p.radial+180+p.hand*180,{direction:1,turns:1,delay:p=>p.spiral*55}),
        phase('螺旋收拢',p=>45+p.hand*180,{delay:p=>(23-p.spiral)*40})];break;
      case 'iris': phases=[
        phase('花苞',p=>p.radial+180+p.side*8,{delay:p=>Math.abs(p.col-3.5)*70}),
        phase('花瓣展开',p=>p.radial+180+p.side*78,{minimum:2350,hold:360}),
        phase('花瓣闭合',p=>p.radial+180+p.side*8,{minimum:2350})];break;
      case 'cascade': phases=[
        phase('水平列阵',line(90)),
        phase('瀑布落下',line(270),{direction:1,delay:p=>p.row*460+p.col*55}),
        phase('反向涌起',line(90),{direction:-1,delay:p=>(2-p.row)*460+(7-p.col)*55})];break;
      case 'checker': phases=[
        phase('棋盘',p=>(p.parity>0?90:0)+p.hand*180,{hold:350}),
        phase('翻面',p=>(p.parity>0?0:90)+p.hand*180,{direction:p=>p.parity,minimum:2100}),
        phase('棋盘交换',p=>(p.parity>0?90:0)+p.hand*180,{direction:p=>-p.parity,minimum:2100})];break;
      case 'symmetry': phases=[
        phase('向外展开',p=>(p.col<4?270:90)+p.side*45,{delay:p=>Math.abs(p.col-3.5)*100}),
        phase('镜面对转',p=>(p.col<4?90:270)+p.side*45,{direction:p=>p.col<4?1:-1,minimum:2550}),
        phase('合拢',p=>(p.col<4?90:270)+p.side*8,{minimum:1850})];break;
      case 'orbit': phases=[
        phase('四个轮心',p=>p.orbit+p.hand*180,{delay:p=>Math.floor(p.col/2)*100}),
        phase('风车旋转',p=>p.orbit+180+p.hand*180,{direction:1,turns:1,minimum:4400}),
        phase('风车展平',line(90),{delay:p=>Math.floor(p.col/2)*150})];break;
      case 'counterflow': phases=[
        phase('双针相迎',p=>p.hand?315:45),
        phase('双向穿行',p=>p.hand?135:225,{direction:p=>-p.side,turns:1,minimum:4000}),
        phase('双针交汇',line(90),{direction:p=>p.side,delay:p=>p.col*65})];break;
      case 'weave': phases=[
        phase('斜纹',p=>90+Math.sin(p.col*.75+p.row)*55+p.hand*180),
        phase('交织',p=>90+Math.sin(p.col*.75+p.row+Math.PI)*55+p.hand*180,{minimum:2800}),
        phase('流线回转',p=>90+Math.sin(p.col*.75+p.row)*55+p.hand*180,{minimum:2800})];break;
      case 'stagger': phases=[
        phase('交错张开',p=>90+p.parity*45+p.side*45,{delay:p=>p.parity>0?350:0}),
        phase('剪刀合拢',p=>90+p.parity*45+p.side*6,{minimum:1800}),
        phase('剪刀换向',p=>90-p.parity*45+p.side*50,{delay:p=>p.parity<0?350:0})];break;
      default: phases=[
        phase('散开',p=>((p.index*137+53)%24)*15,{direction:p=>p.parity,delay:p=>(p.index*73)%550}),
        phase('错速旋转',p=>((p.index*97+11)%24)*15,{direction:p=>p.side,delay:p=>(p.index*113)%650}),
        phase('重归秩序',line(0),{delay:p=>p.col*110,hold:400})];
    }
    // The quiet selection retains the character of each score without its
    // longer multi-turn passages. Quiet mode itself is handled by the engine.
    return mode==='medium' ? [ {...phases[0],minimum:2200,hold:200} ] : phases;
  }
  const api={LABELS,PATTERNS,MEDIUM_PATTERNS,layouts,resolve,buildScore};
  if (typeof module==='object'&&module.exports) module.exports=api;
  else root.ClockClockChoreography=api;
})(typeof window!=='undefined'?window:globalThis);
