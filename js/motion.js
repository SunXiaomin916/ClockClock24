(function (root) {
  'use strict';
  const { PATTERNS, MEDIUM_PATTERNS, layouts, resolve, buildScore } = typeof module==='object'&&module.exports ? require('./choreography.js') : root.ClockClockChoreography;
  const mod = value => ((value % 360) + 360) % 360;
  const shortest = (from, to) => mod(to - from + 180) - 180;
  function travel(from, to, direction = 0, turns = 0) {
    if (!direction) return shortest(from, to);
    return direction * (mod(direction * (to - from)) + turns * 360);
  }
  function choreography(index, pattern) {
    const phase=buildScore(pattern)[0], p=layouts[index];
    return {delay:resolve(phase.delay,p),direction:resolve(phase.direction,p),pose:resolve(phase.pose,p)};
  }
  // Quintic Hermite segment, time in seconds internally. Position, velocity and
  // acceleration are continuous, including when a live animation is interrupted.
  function segment(start, end, at, ms, velocity = 0, acceleration = 0) {
    const seconds = ms / 1000, v = velocity * seconds, a = acceleration * seconds * seconds;
    const d = end - start;
    return { at, ms, start, end, c: [start, v, a / 2, 10*d - 6*v - 1.5*a, -15*d + 8*v + 1.5*a, 6*d - 3*v - .5*a] };
  }
  function sampleSegment(s, now) {
    if (now < s.at) return { angle: s.start, velocity: 0, acceleration: 0 };
    if (now >= s.at + s.ms) return { angle: s.end, velocity: 0, acceleration: 0 };
    const u = (now - s.at) / s.ms, c = s.c, seconds = s.ms / 1000;
    return {
      angle: c[0] + u * (c[1] + u * (c[2] + u * (c[3] + u * (c[4] + u * c[5])))),
      velocity: (c[1] + u * (2*c[2] + u * (3*c[3] + u * (4*c[4] + u * 5*c[5])))) / seconds,
      acceleration: (2*c[2] + u * (6*c[3] + u * (12*c[4] + u * 20*c[5]))) / (seconds * seconds)
    };
  }
  // Bounds for a rest-to-rest quintic: max v = 1.875*d/T,
  // max a = (10/sqrt(3))*d/T². Limits are independent for each hand.
  function duration(distance, speed, acceleration, minimum) {
    return Math.max(minimum, 1875 * Math.abs(distance) / speed, 1000 * Math.sqrt(5.773503 * Math.abs(distance) / acceleration));
  }
  class MotionEngine {
    constructor(angles) {
      this.hands = angles.map(angle => ({ angle: mod(angle), target: mod(angle), velocity: 0, acceleration: 0, segments: [] }));
      this.pattern = 'quiet'; this.endAt = 0; this.timeline=[];
    }
    sample(hand, now) {
      while (hand.segments.length && now >= hand.segments[0].at + hand.segments[0].ms) hand.segments.shift();
      if (!hand.segments.length) return { angle: hand.target, velocity: 0, acceleration: 0 };
      return sampleSegment(hand.segments[0], now);
    }
    update(now) {
      let moving = false;
      for (const h of this.hands) { Object.assign(h, this.sample(h, now)); moving = moving || h.segments.length > 0; }
      return moving;
    }
    snap(targets) {
      this.hands.forEach((h,i) => Object.assign(h, { angle: mod(targets[i]), target: mod(targets[i]), velocity: 0, acceleration: 0, segments: [] }));
      this.endAt = 0; this.timeline=[];
    }
    animate(targets, now, mode = 'medium', generation = 0, selection = 'auto') {
      const pool=mode==='medium'?MEDIUM_PATTERNS:PATTERNS;
      this.pattern=mode==='quiet'?'quiet':PATTERNS.includes(selection)?selection:pool[((generation%pool.length)+pool.length)%pool.length];
      this.endAt=now;this.timeline=[];
      const starts=[], queues=[];
      let cursor=now;
      // Take one consistent snapshot before replacing any hand's score.
      this.hands.forEach((h, index) => {
        const state=this.sample(h,now); let start=mod(state.angle);
        const segments = [];
        // Brake in the current direction before accepting a new choreography.
        // It preserves the current derivative instead of restarting easing at zero.
        if (Math.abs(state.velocity) > .01 || Math.abs(state.acceleration) > .01) {
          const seconds = .45;
          const end = start + state.velocity * seconds / 2 + state.acceleration * seconds * seconds / 12;
          segments.push(segment(start, end, now, seconds * 1000, state.velocity, state.acceleration));
          start=end;cursor=Math.max(cursor,now+seconds*1000);
        }
        starts[index]=start;queues[index]=segments;
      });
      const phases=mode==='quiet'?[]:buildScore(this.pattern,mode);
      phases.push({name:'回到时间',pose:p=>targets[p.index],direction:0,turns:0,
        delay:mode==='quiet'?0:p=>p.col*35,minimum:mode==='quiet'?1100:1900,hold:0});
      for(const phase of phases) {
        const distances=layouts.map((p,i)=>travel(starts[i],resolve(phase.pose,p),resolve(phase.direction,p),resolve(phase.turns,p)));
        const delays=layouts.map(p=>resolve(phase.delay,p));
        const moving=distances.some(d=>Math.abs(d)>1e-8);
        // A common duration preserves parallel pairs and mirror relationships;
        // each hand still follows its own signed distance, speed and delay.
        const ms=moving?Math.max(...distances.map(d=>duration(d,mode==='quiet'?200:280,mode==='quiet'?450:400,phase.minimum))):0;
        const finish=cursor+ms+(moving?Math.max(...delays):0);
        this.timeline.push({name:phase.name,at:cursor,until:finish,holdUntil:finish+phase.hold});
        starts.forEach((start,i)=>{
          const end=start+distances[i];
          // Keep zero-distance segments as explicit holds so stationary hands
          // do not jump ahead to a later phase while their peers are moving.
          if(ms>0) queues[i].push(segment(start,end,cursor+delays[i],ms));
          starts[i]=end;
        });
        cursor=finish+phase.hold;
      }
      this.endAt=cursor;
      this.hands.forEach((h,index)=>{
        h.target=mod(targets[index]);h.segments=queues[index];
        Object.assign(h,this.sample(h,now));
      });
    }
    get moving() { return this.hands.some(h => h.segments.length); }
    get angles() { return this.hands.map(h => mod(h.angle)); }
  }
  const api = { mod, shortest, travel, PATTERNS, choreography, segment, sampleSegment, duration, MotionEngine };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClockClockMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
