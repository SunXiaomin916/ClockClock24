'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GLYPHS, targetAngles, position } = require('../js/glyphs.js');
const { MotionEngine, mod, shortest, travel, PATTERNS, segment, sampleSegment, duration } = require('../js/motion.js');
const { formatTime, TimeSync, nextWake } = require('../js/time.js');
const { sanitize, DEFAULT } = require('../js/config.js');
// Independent compass fixtures, transcribed by visible corners, not by hand ID.
const EXPECTED = [
  'ES SW NS NS NE NW', '_ SS _ NS _ NN', 'EE SW ES NW NE WW',
  'EE SW EE NW EE NW', 'SS SS NE NS _ NN', 'ES WW NE SW EE NW',
  'ES WW NS SW NE NW', 'EE SW _ NS _ NN', 'ES SW NE SW NE NW', 'ES SW NE NS EE NW'
];
const DIRECTIONS = {0:'N',90:'E',180:'S',270:'W'};
const compass = pair => pair[0] === 225 && pair[1] === 225 ? '_' : pair.map(a => DIRECTIONS[a]).sort().join('');
for (let d = 0; d < 10; d++) test(`digit ${d}: six independent clock corner fixtures`, () => {
  assert.equal(GLYPHS[d].map(compass).join(' '), EXPECTED[d].split(' ').map(s => s.split('').sort().join('')).join(' '));
  assert.equal(targetAngles(String(d).repeat(4)).length, 48);
});
test('physical layout visits all 24 cells twice, in digit-major storage order', () => {
  const cells = new Map();
  for (let i = 0; i < 48; i++) { const {col,row,hand} = position(i); assert.ok(col >= 0 && col < 8 && row >= 0 && row < 3); const key = `${col},${row}`; cells.set(key, (cells.get(key)||0) + 1); assert.equal(hand,i%2); }
  assert.equal(cells.size,24); assert.ok([...cells.values()].every(n => n === 2));
  assert.deepEqual(targetAngles('0123').slice(12,24),GLYPHS[1].flat());
  assert.throws(() => targetAngles('1:23')); assert.throws(() => targetAngles('abc0'));
});

for (let slot = 0; slot < 4; slot++) test(`position ${slot + 1}: digits 0–9 keep their physical cells and settle in all three modes`, () => {
  const engines = ['quiet','medium','active'].map(mode => ({mode, engine:new MotionEngine(targetAngles('6789'))}));
  let now = 0;
  for (let digit = 0; digit < 10; digit++) {
    const text = Array.from('6789'); text[slot] = String(digit);
    const targets = targetAngles(text.join(''));
    const verify = angles => {
      // Check every slot, including the three that must retain their own digits.
      for (let s = 0; s < 4; s++) for (let cell = 0; cell < 6; cell++) {
        const index = s * 12 + cell * 2;
        const expected = EXPECTED[Number(text[s])].split(' ')[cell].split('').sort().join('');
        assert.equal(compass(angles.slice(index,index+2)),expected,`${text.join('')} / slot ${s+1} / cell ${cell}`);
        for (let hand = 0; hand < 2; hand++) assert.deepEqual(position(index+hand), {
          col:s*2+[0,1,0,1,0,1][cell], row:[0,0,1,1,2,2][cell], hand
        });
      }
    };
    verify(targets);
    for (const {mode,engine} of engines) {
      engine.animate(targets,now,mode,digit);
      engine.update(engine.endAt+1);
      assert.equal(engine.moving,false);
      verify(engine.angles);
    }
    now += 20000;
  }
});
test('direction and wrapping accept negative angles and thousands of turns', () => {
  assert.equal(shortest(-725,5),10); assert.equal(shortest(355,5),10); assert.equal(shortest(5,355),-10);
  assert.equal(travel(350,10,1,2),740); assert.equal(travel(10,350,-1,2),-740);
  assert.equal(mod(360*100000+90),90); assert.equal(mod(-360*100000-90),270);
});
test('quintic rest-to-rest endpoints have zero velocity and acceleration', () => {
  const s = segment(20,780,100,4000);
  assert.deepEqual(sampleSegment(s,100), {angle:20,velocity:0,acceleration:0});
  assert.deepEqual(sampleSegment(s,4100), {angle:780,velocity:0,acceleration:0});
  assert.equal(sampleSegment(s,2100).angle,400);
});
test('speed and acceleration limits are respected by rest-to-rest segments', () => {
  for (const distance of [1,90,180,360,1080,-720]) {
    const s = segment(0,distance,0,duration(distance,240,380,1100));
    for(let i=0;i<=1000;i++) { const p=sampleSegment(s,s.ms*i/1000); assert.ok(Math.abs(p.velocity)<=240.001);assert.ok(Math.abs(p.acceleration)<=380.001); }
  }
});
for (const mode of ['quiet','medium','active']) test(`${mode}: every choreography settles exactly for all 1,440 minutes`, () => {
  const engine = new MotionEngine(targetAngles('0000')); let now = 0;
  for (let minute = 0; minute < 1440; minute++) {
    const time = String(Math.floor(minute/60)).padStart(2,'0') + String(minute%60).padStart(2,'0');
    const targets=targetAngles(time); engine.animate(targets,now,mode,minute);
    const end = engine.endAt; assert.ok(end-now<14000);
    engine.update(now+500); assert.ok(engine.angles.every(Number.isFinite));
    engine.update(end+1); assert.deepEqual(engine.angles,targets); assert.equal(engine.moving,false);
    assert.ok(engine.hands.every(h=>h.angle>=0&&h.angle<360&&h.velocity===0&&h.acceleration===0)); now+=60000;
  }
});
test('retargets preserve angle, velocity and acceleration during a live spin', () => {
  const engine=new MotionEngine(targetAngles('2359')); engine.animate(targetAngles('0000'),0,'active',4); engine.update(1250);
  const before=engine.hands.map(h=>({angle:mod(h.angle),velocity:h.velocity,acceleration:h.acceleration}));
  engine.animate(targetAngles('1234'),1250,'medium',3);
  engine.hands.forEach((h,i)=>{ assert.ok(Math.abs(shortest(before[i].angle,h.angle))<1e-8);assert.ok(Math.abs(before[i].velocity-h.velocity)<1e-8);assert.ok(Math.abs(before[i].acceleration-h.acceleration)<1e-8); });
  engine.update(engine.endAt+1);assert.deepEqual(engine.angles,targetAngles('1234'));
});
test('repeated interruptions and all patterns stay finite and settle', () => {
  const engine=new MotionEngine(targetAngles('8888'));const patterns=new Set();
  for(let i=0;i<120;i++){ engine.animate(targetAngles('0123'),i*137,'active',i); patterns.add(engine.pattern); engine.update(i*137+1);assert.ok(engine.hands.every(h=>Number.isFinite(h.angle)&&Number.isFinite(h.velocity))); }
  assert.equal(patterns.size,PATTERNS.length);engine.update(engine.endAt+1);assert.deepEqual(engine.angles,targetAngles('0123'));
});
test('12/24 hour formatting covers midnight, noon, hour and day rollovers', () => {
  assert.equal(formatTime(new Date(2026,9,10,0,0),'24'),'0000');assert.equal(formatTime(new Date(2026,9,10,0,0),'12'),'1200');
  assert.equal(formatTime(new Date(2026,9,10,12,0),'12'),'1200');assert.equal(formatTime(new Date(2026,9,10,23,59),'12'),'1159');
  const d=new Date(2026,9,10,23,59); d.setMinutes(d.getMinutes()+1);assert.equal(formatTime(d),'0000');
});
test('normal boundary animates, backward jumps and sleep/resume snap', () => {
  const sync=new TimeSync(), wall=new Date(2026,9,10,23,59,59).getTime();
  assert.equal(sync.sample(wall,0,'24').snap,true);
  assert.deepEqual(sync.sample(wall+1000,1000,'24'),{text:'0000',changed:true,snap:false});
  assert.equal(sync.sample(wall+3600000,1500,'24').snap,true);
  assert.equal(sync.sample(wall+10000,2500,'24').snap,true);
  assert.equal(sync.sample(wall+10000,2500,'12',true).snap,true);
});
test('wall-clock watcher wakes at minute boundary or within five seconds', () => {assert.equal(nextWake(59999),11);assert.equal(nextWake(0),5000);assert.ok(nextWake(-1)>0);});
test('malformed saved settings and partial host updates cannot poison state', () => {
  assert.deepEqual(sanitize({fps:0,theme:'invalid',drift:'false',size:null,format:[],mode:{}}),DEFAULT);
  assert.deepEqual(sanitize({fps:60,drift:true,unknown:'x'}),{...DEFAULT,fps:'60',drift:true});
  for (const fps of [30,60,120,180,240,360]) assert.equal(sanitize({fps}).fps,String(fps));
  assert.equal(sanitize({fps:144},{...DEFAULT,fps:'360'}).fps,'360');
  assert.deepEqual(sanitize(null),DEFAULT);
});
test('project.json native property schema and defaults match the application', () => {
  const project=require('../project.json');assert.equal(project.file,'index.html');assert.equal(project.type,'web');
  for(const [key,value] of Object.entries(DEFAULT)) assert.equal(project.general.properties[key].value,value);
  assert.deepEqual(project.general.properties.theme.options.map(o=>o.value),Object.keys(require('../js/config.js').THEMES));
  assert.deepEqual(project.general.properties.choreography.options.map(o=>o.value),['auto',...PATTERNS]);
  assert.deepEqual(project.general.properties.fps.options.map(o=>o.value),require('../js/config.js').OPTIONS.fps);
});
