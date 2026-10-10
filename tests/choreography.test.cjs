'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MotionEngine,shortest,sampleSegment}=require('../js/motion');
const {PATTERNS,MEDIUM_PATTERNS}=require('../js/choreography');
const {targetAngles,position}=require('../js/glyphs');
const engineFor=(pattern,mode='active')=>{
  const engine=new MotionEngine(targetAngles('2359'));
  engine.animate(targetAngles('0000'),0,mode,0,pattern);return engine;
};
test('Active cycles twelve scores and Medium cycles its five gentle scores',()=>{
  const engine=new MotionEngine(targetAngles('0935'));
  for(const [mode,pool] of [['active',PATTERNS],['medium',MEDIUM_PATTERNS]]) {
    const seen=[];
    for(let i=0;i<=pool.length;i++) {engine.snap(targetAngles('0935'));engine.animate(targetAngles('0935'),0,mode,i);seen.push(engine.pattern);}
    assert.deepEqual(seen,[...pool,pool[0]]);
  }
  assert.equal(PATTERNS.length,12);assert.equal(MEDIUM_PATTERNS.length,5);
});
test('every selected score has distinct intermediate formations and exact final digits',()=>{
  const fingerprints=new Set();
  for(const pattern of PATTERNS) {
    const engine=engineFor(pattern), phases=engine.timeline;
    assert.equal(engine.pattern,pattern);assert.equal(phases.length,4);assert.ok(engine.endAt<14000);
    const poses=[];
    for(const phase of phases.slice(0,-1)) {
      engine.update(phase.until+.01);poses.push(engine.angles.map(x=>Math.round(x)));
    }
    fingerprints.add(JSON.stringify(poses));engine.update(engine.endAt+1);
    assert.deepEqual(engine.angles,targetAngles('0000'));assert.equal(engine.moving,false);
    const medium=engineFor(pattern,'medium');assert.equal(medium.timeline.length,2);
    medium.update(medium.endAt+1);assert.deepEqual(medium.angles,targetAngles('0000'));
  }
  assert.equal(fingerprints.size,12);
});
test('score stages have no angle jumps, overlap or unexpected velocity spikes',()=>{
  for(const pattern of PATTERNS) {
    const engine=engineFor(pattern);
    for(const hand of engine.hands) for(let i=0;i<hand.segments.length;i++) {
      const s=hand.segments[i], previous=hand.segments[i-1];
      if(previous) {assert.ok(s.at>=previous.at+previous.ms);assert.ok(Math.abs(shortest(previous.end,s.start))<1e-8);}
      for(let step=0;step<=100;step++) {
        const p=sampleSegment(s,s.at+s.ms*step/100);
        assert.ok(Math.abs(p.velocity)<=280.001);assert.ok(Math.abs(p.acceleration)<=400.001);
      }
    }
  }
});
test('wave holds parallel pairs; iris opens and closes; checker alternates neighbours',()=>{
  const wave=engineFor('wave'), travel=wave.timeline[1];
  for(let t=travel.at;t<=travel.until;t+=83) {
    wave.update(t);const a=wave.angles;
    for(let i=0;i<48;i+=2) assert.ok(Math.abs(Math.abs(shortest(a[i],a[i+1]))-180)<1e-7);
  }
  const iris=engineFor('iris');
  for(const [j,width] of [[0,16],[1,156],[2,16]]) {
    iris.update(iris.timeline[j].until+.01);
    for(let i=0;i<48;i+=2) assert.ok(Math.abs(Math.abs(shortest(iris.angles[i],iris.angles[i+1]))-width)<1e-7);
  }
  const checker=engineFor('checker');checker.update(checker.timeline[0].until+.01);
  const cells=new Map();checker.angles.forEach((angle,i)=>{const p=position(i);if(!p.hand)cells.set(`${p.col},${p.row}`,angle);});
  for(let row=0;row<3;row++) for(let col=0;col<7;col++) assert.equal(Math.abs(shortest(cells.get(`${col},${row}`),cells.get(`${col+1},${row}`))),90);
});
test('every multi-stage score can be interrupted during motion, a hold, and return',()=>{
  for(const pattern of PATTERNS) for(const fraction of [.18,.55,.9]) {
    const engine=engineFor(pattern), now=engine.endAt*fraction;
    engine.update(now);const before=engine.hands.map(h=>({...h}));
    engine.animate(targetAngles('1234'),now,'active',5,'scatter');
    engine.hands.forEach((h,i)=>{
      assert.ok(Math.abs(shortest(before[i].angle,h.angle))<1e-8);
      assert.ok(Math.abs(before[i].velocity-h.velocity)<1e-8);
      assert.ok(Math.abs(before[i].acceleration-h.acceleration)<1e-8);
    });
    engine.update(engine.endAt+1);assert.deepEqual(engine.angles,targetAngles('1234'));
  }
});
