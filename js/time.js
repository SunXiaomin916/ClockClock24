(function (root) {
  'use strict';
  function formatTime(date, format = '24') {
    const hours = format === '12' ? date.getHours() % 12 || 12 : date.getHours();
    return String(hours).padStart(2, '0') + String(date.getMinutes()).padStart(2, '0');
  }
  // Both wall time and monotonic time are sampled: Windows sleep / NTP / manual
  // changes can affect them differently. Long gaps are resynchronized instantly.
  class TimeSync {
    constructor() { this.previous = null; }
    sample(wall, mono, format, force = false) {
      const text = formatTime(new Date(wall), format);
      const previous = this.previous;
      const gap = previous ? wall - previous.wall : 0;
      const jump = !!previous && (Math.abs(gap - (mono - previous.mono)) > 2000 || gap > 90000 || gap < 0);
      this.previous = { wall, mono, text };
      return { text, changed: !previous || previous.text !== text, snap: force || !previous || jump };
    }
  }
  function nextWake(wall) {
    const remainder = ((wall % 60000) + 60000) % 60000;
    return Math.min(5000, 60000 - remainder + 10);
  }
  const api = { formatTime, TimeSync, nextWake };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClockClockTime = api;
})(typeof window !== 'undefined' ? window : globalThis);
