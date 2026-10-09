// Pogey Life — weather and the view out the window.
// Each day rolls a weather type from the save's seed (so it's the same on reload): clear, cloudy, rain or a
// thunderstorm, with the rain arriving and leaving during the day. Draws the sun, moon, stars, clouds, city
// lights, rain, drops on the glass and lightning; drives lightning flashes, thunder, rain audio and power flickers.
(() => {
'use strict';
const N = window.POGEY;
if (!N) return;
const { GLOW } = N;

// window opening (matches game.js) and the backdrop plane behind it
const WX0 = 1.25, WX1 = 2.35, WY0 = 1.0, WY1 = 2.0, SKY_Z = -0.84, BLD_Z = -0.749;

// ---------------------------------------------------------------------
// Deterministic weather from the save seed
// ---------------------------------------------------------------------
function ensure(S) { if (typeof S.weatherSeed !== 'number') S.weatherSeed = Math.floor(Math.random() * 1e9); }
N.hooks.fresh.push(ensure);
if (N.S) ensure(N.S);

function hash(a, b) { // 0..1
  let h = (Math.imul(a ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const TYPES = ['clear', 'cloudy', 'rain', 'storm'];
function dayWeather(day) {
  const seed = N.S.weatherSeed;
  if (day <= 1) return { type: 'clear', start: 0, end: 0 };     // a gentle first day
  const r = hash(seed, day * 7 + 1);
  const type = r < 0.45 ? 'clear' : r < 0.65 ? 'cloudy' : r < 0.87 ? 'rain' : 'storm';
  const start = 3 + hash(seed, day * 7 + 2) * 15;               // rain begins between 3 AM and 6 PM
  const len = 2.5 + hash(seed, day * 7 + 3) * (type === 'storm' ? 4 : 7);
  return { type, start, end: start + len };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// continuous weather parameters at game time t (minutes)
function weatherAt(t) {
  const day = Math.floor(t / 1440) + 1, h = (t % 1440) / 60;
  const w = dayWeather(day);
  const base = { clear: 0.08, cloudy: 0.72, rain: 0.55, storm: 0.6 }[w.type];
  const inRain = (w.type === 'rain' || w.type === 'storm') ? smooth(w.start - 0.75, w.start, h) * (1 - smooth(w.end, w.end + 0.75, h)) : 0;
  let cloud = base + (1 - base) * inRain * 0.95;
  // blend from yesterday's clouds over the first two hours of the day
  if (h < 2) { const y = dayWeather(day - 1), yb = { clear: 0.08, cloudy: 0.72, rain: 0.55, storm: 0.6 }[y.type]; cloud = cloud + (yb - cloud) * (1 - smooth(0, 2, h)); }
  return { type: w.type, cloud, rain: inRain * (w.type === 'storm' ? 1 : 0.7), storm: w.type === 'storm' ? inRain : 0, w };
}
const hourStr = h => { const hh = Math.floor(h) % 24, ap = hh < 12 ? 'AM' : 'PM'; return `${(hh % 12) || 12} ${ap}`; };

// ---------------------------------------------------------------------
// Audio: rain loop, thunder
// ---------------------------------------------------------------------
let ac = null, noise = null, rainGain = null;
function audio() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noise = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = noise.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
  } catch (e) { ac = null; }
  return ac;
}
document.addEventListener('pointerdown', audio, { once: true });
document.addEventListener('keydown', audio, { once: true });
function setRain(v) {
  const a = ac; if (!a) return;
  if (!rainGain) {
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 1400; g.gain.value = 0;
    s.connect(f).connect(g).connect(a.destination); s.start(); rainGain = g;
  }
  rainGain.gain.setTargetAtTime(v * 0.18, a.currentTime, 0.4);
}
function thunder(power) {
  const a = ac; if (!a) return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.25 * power, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + 3.3);
}

// ---------------------------------------------------------------------
// Particles & lightning
// ---------------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const streaks = Array.from({ length: 110 }, () => ({ x: rand(-0.6, 4.2), y: rand(-0.5, 3.4), z: rand(-0.72, -0.16), v: rand(5, 7.5), on: Math.random() }));
let drops = [];
let bolt = null, nextBolt = 6, flashT = 0, flashPhase = 0, thunderQueue = [], flicker = 0;
const stars = Array.from({ length: 60 }, (_, i) => ({ x: hash(i, 11) * 3.4 + 0.1, y: 1.7 + hash(i, 12) * 1.8, s: 0.008 + hash(i, 13) * 0.01, tw: hash(i, 14) * 6 }));
const cityWindows = [];
// building silhouettes from game.js (x offset from WX0, height); light up some of their windows at night
const BLD = [[-1.6, 0.9], [-1.3, 0.6], [-1.0, 0.75], [-0.65, 0.5], [-0.3, 0.55], [0.0, 0.8], [0.25, 0.45], [0.45, 0.95], [0.7, 0.6], [0.95, 0.75], [1.15, 0.5], [1.35, 0.85], [1.6, 0.7], [1.9, 1.0], [2.2, 0.55]];
BLD.forEach(([bx, bh], bi) => {
  for (let r = 0; r < Math.floor(bh / 0.09); r++) for (let c = 0; c < 3; c++) {
    if (hash(bi * 31 + r, c) < 0.45) cityWindows.push({ x: WX0 + bx + 0.035 + c * 0.065, y: WY0 - 0.6 + 0.05 + r * 0.09, on: hash(bi, r * 3 + c), warm: hash(r, bi + c) });
  }
});
const CLOUD_ORDER = [4, 1, 7, 2, 6, 0, 8, 3, 5];
const clouds = Array.from({ length: 9 }, (_, i) => ({ x: -0.5 + i * 0.52 + hash(i, 21) * 0.3, y: 1.2 + hash(i, 22) * 0.95, w: 0.5 + hash(i, 23) * 0.6, sp: 0.01 + hash(i, 24) * 0.02 }));

function makeBolt() {
  const pts = []; let x = rand(WX0 - 0.3, WX1 + 0.3), y = 3.3;
  while (y > WY0 - 0.6) { const nx = x + rand(-0.12, 0.12), ny = y - rand(0.07, 0.16); pts.push([x, y, nx, ny]); x = nx; y = ny;
    if (Math.random() < 0.12) { let bx = x, by = y; for (let k = 0; k < 4; k++) { const ax = bx + rand(-0.1, 0.1), ay = by - rand(0.05, 0.12); pts.push([bx, by, ax, ay, 1]); bx = ax; by = ay; } } }
  return { pts, life: 0.32 };
}

let W = { cloud: 0, rain: 0, storm: 0, type: 'clear' };
function update(dt) {
  const S = N.S; if (!S || typeof S.weatherSeed !== 'number') return;
  W = weatherAt(S.t);
  N.env.cloud = W.cloud; N.env.rain = W.rain;
  setRain(W.rain);
  // rain streaks fall; drops slide down the glass
  for (const s of streaks) { s.y -= s.v * dt * (1 + W.storm * 0.4); if (s.y < WY0 - 0.7) { s.y = 3.4; s.x = rand(-0.6, 4.2); s.on = Math.random(); } }
  if (W.rain > 0.05 && Math.random() < dt * 14 * W.rain && drops.length < 40)
    drops.push({ x: rand(WX0 + 0.03, WX1 - 0.03), y: rand(WY0 + 0.3, WY1 - 0.03), v: 0, s: rand(0.01, 0.018), life: rand(3, 7) });
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.life -= dt;
    if (Math.random() < dt * 0.8) d.v = rand(0.05, 0.25); d.v *= Math.exp(-dt * 1.5); d.y -= d.v * dt;
    if (d.life <= 0 || d.y < WY0 + 0.01) drops.splice(i, 1);
  }
  // lightning
  if (W.storm > 0.3) {
    nextBolt -= dt;
    if (nextBolt <= 0) {
      nextBolt = rand(4, 13) / W.storm;
      bolt = makeBolt(); flashT = 0.45; flashPhase = 0;
      const delay = rand(0.25, 2.2); thunderQueue.push({ t: delay, p: 1 - delay / 3 });
      if (Math.random() < 0.3) flicker = 0.5;
      N.hooks.lightning && N.hooks.lightning.forEach(fn => fn());
    }
  } else nextBolt = Math.max(nextBolt, 3);
  if (bolt) { bolt.life -= dt; if (bolt.life <= 0) bolt = null; }
  if (flashT > 0) { flashT -= dt; flashPhase += dt; }
  // flash flickers twice, then fades
  N.env.flash = flashT > 0 ? Math.max(0, (flashPhase < 0.06 ? 1 : flashPhase < 0.12 ? 0.25 : flashPhase < 0.18 ? 0.85 : flashT / 0.27 * 0.6)) * 0.85 : 0;
  for (let i = thunderQueue.length - 1; i >= 0; i--) { thunderQueue[i].t -= dt; if (thunderQueue[i].t <= 0) { thunder(Math.max(0.35, thunderQueue[i].p)); thunderQueue.splice(i, 1); } }
  if (flicker > 0) { flicker -= dt; N.env.power = (flicker > 0.38 || (flicker < 0.25 && flicker > 0.18)) ? 0.08 : 1; } else N.env.power = 1;

  // glow colours for the outside view
  const h = (S.t / 60) % 24, day = N.daylight(h), night = 1 - day, sunUp = Math.sin(Math.PI * (h - 6) / 13);
  const vis = 1 - W.cloud;
  const g = N.env.glow;
  // everything in the sky fades into the sky colour rather than going dark
  const sky = N.env.skyColor || [0.5, 0.6, 0.7];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const sunC = sunUp > 0 ? [1.0, 0.97 - 0.25 * Math.max(0, 1 - sunUp * 2), 0.85 - 0.45 * Math.max(0, 1 - sunUp * 2)] : [0.93, 0.94, 1.0];
  g[GLOW.SUN] = mix(sky, sunC, Math.pow(vis, 1.5) * (sunUp > 0 ? 1 : night));
  g[GLOW.STARS] = mix(sky, [1, 1, 1], night * vis * vis);
  g[GLOW.CITY] = [1.0, 0.82, 0.5].map(v => v * (0.3 + 0.7 * night));
  const cloudC = mix(mix(sky, [1, 1, 1], 0.25 + 0.4 * day).map(v => v * (0.55 + 0.45 * day)), sky.map(v => v * 0.6), Math.min(1, W.rain * 1.3)); // fluffy white by day, dark when raining
  g[GLOW.CLOUD] = cloudC.map(v => Math.min(1, v + N.env.flash * 0.5));
  g[GLOW.RAIN] = mix(sky, [0.85, 0.9, 1.0], 0.55).map(v => v + N.env.flash * 0.4);
  g[GLOW.BOLT] = [0.95, 0.95, 1.0];
}
N.hooks.update.push(update);

// ---------------------------------------------------------------------
// Drawing (dynamic geometry; everything sits between the sky plane and the window)
// ---------------------------------------------------------------------
const flat = (x, y, z, w, h, col, glow) => N.box(x - w / 2, y - h / 2, z, w, h, 0.004, col, glow, 'nwetb');
function draw() {
  const S = N.S; if (!S || typeof S.weatherSeed !== 'number') return;
  const h = (S.t / 60) % 24, sunUp = Math.sin(Math.PI * (h - 6) / 13), night = 1 - N.daylight(h);
  // stars
  if (N.env.glow[GLOW.STARS] && night > 0.05) for (const s of stars) { const tw = 0.6 + 0.4 * Math.sin(performance.now() / 700 + s.tw); flat(s.x, s.y, SKY_Z, s.s * tw, s.s * tw, '#ffffff', GLOW.STARS); }
  // sun or moon on an arc (rises from behind the buildings on the right, sets on the left)
  if (sunUp > -0.05) {
    const sx = 1.8 + (12.5 - h) * 0.2, sy = 0.75 + Math.max(0, sunUp) * 1.25;
    flat(sx, sy, SKY_Z + 0.002, 0.14, 0.14, '#ffffff', GLOW.SUN); flat(sx, sy, SKY_Z + 0.003, 0.1, 0.18, '#ffffff', GLOW.SUN); flat(sx, sy, SKY_Z + 0.003, 0.18, 0.1, '#ffffff', GLOW.SUN);
  } else {
    const mh = (h + 12) % 24, mu = Math.sin(Math.PI * (mh - 6) / 13);
    if (mu > 0) { const mx = 1.8 + (12.5 - mh) * 0.2, my = 0.85 + mu * 1.1;
      flat(mx, my, SKY_Z + 0.002, 0.09, 0.09, '#ffffff', GLOW.SUN); flat(mx, my, SKY_Z + 0.003, 0.06, 0.12, '#ffffff', GLOW.SUN); flat(mx, my, SKY_Z + 0.003, 0.12, 0.06, '#ffffff', GLOW.SUN);
      flat(mx + 0.025, my + 0.015, SKY_Z + 0.004, 0.02, 0.02, '#c8c8d0', GLOW.SUN); }
  }
  // clouds: more and bigger the cloudier it is, drifting slowly
  const n = Math.round(W.cloud * clouds.length);
  for (let j = 0; j < n; j++) {
    const i = CLOUD_ORDER[j], c = clouds[i], x = ((c.x + performance.now() / 1000 * c.sp) % 4.6) - 0.5, w = c.w * (0.6 + W.cloud * 0.6), z = SKY_Z + 0.006 + i * 0.002;
    flat(x, c.y, z, w, 0.14 + W.cloud * 0.1, '#ffffff', GLOW.CLOUD);
    flat(x - w * 0.22, c.y + 0.08, z, w * 0.5, 0.12, '#ffffff', GLOW.CLOUD);
    flat(x + w * 0.18, c.y + 0.06, z, w * 0.45, 0.1, '#f4f4f4', GLOW.CLOUD);
  }
  // lightning bolt
  if (bolt) for (const [x0, y0, x1, y1, br] of bolt.pts) {
    const w = br ? 0.012 : 0.022;
    N.box(Math.min(x0, x1) - w / 2, y1, SKY_Z + 0.012, Math.abs(x1 - x0) + w, y0 - y1, 0.004, '#ffffff', GLOW.BOLT, 'nwetb');
  }
  // city windows (on the building fronts)
  for (const w of cityWindows) if (w.on < 0.8 * night - 0.05) flat(w.x, w.y, BLD_Z, 0.03, 0.045, w.warm > 0.7 ? '#bcd8ff' : '#ffffff', GLOW.CITY);
  // rain streaks
  if (W.rain > 0.02) for (const s of streaks) if (s.on < W.rain) N.box(s.x, s.y, s.z, 0.006, 0.11 + W.storm * 0.06, 0.006, '#ffffff', GLOW.RAIN);
  // drops on the glass
  for (const d of drops) N.box(d.x - d.s / 2, d.y, -0.07, d.s, d.s * 1.4, 0.004, '#dfe8f2', GLOW.RAIN, 'nwetb');
}
N.hooks.draw.push(draw);

// ---------------------------------------------------------------------
// HUD + looking out the window
// ---------------------------------------------------------------------
const chip = document.createElement('div'); chip.className = 'chip'; document.getElementById('hud').insertBefore(chip, document.getElementById('hudMoney'));
const ICON = { clear: ['☀', '☾'], cloudy: ['☁', '☁'], rain: ['🌧', '🌧'], storm: ['⛈', '⛈'] };
function label() {
  const h = (N.S.t / 60) % 24, night = N.daylight(h) < 0.2;
  if (W.storm > 0.3) return ['⛈', 'Thunderstorm'];
  if (W.rain > 0.15) return ['🌧', 'Rain'];
  if (W.cloud > 0.5) return ['☁', 'Cloudy'];
  return [night ? '☾' : '☀', night ? 'Clear night' : 'Sunny'];
}
N.hooks.hud.push(() => { if (!N.S || typeof N.S.weatherSeed !== 'number') return; const [i, t] = label(); chip.textContent = `${i} ${t}`; });

N.hooks.interact.push(id => {
  if (id !== 'window') return false;
  const S = N.S, h = (S.t / 60) % 24, day = Math.floor(S.t / 1440) + 1, w = dayWeather(day), [, now] = label();
  let lookLine;
  if (W.storm > 0.3) lookLine = 'Lightning splits the sky over the city. Perfect excuse to stay in.';
  else if (W.rain > 0.15) lookLine = 'Rain streaks down the glass. Nobody expects you to go out in this.';
  else if (h < 6 || h >= 20) lookLine = W.cloud > 0.5 ? 'A starless night. The city hums.' : 'City lights twinkle. Everyone out there has a job.';
  else if (h < 9) lookLine = 'Morning commuters shuffle to work. Couldn\'t be you.';
  else if (h < 17) lookLine = W.cloud > 0.5 ? 'A flat grey sky. Matches your vibe.' : 'Broad daylight. Way too bright.';
  else lookLine = 'The sun is going down. Prime gambling hours approach.';
  let forecast = '';
  if ((w.type === 'rain' || w.type === 'storm') && h < w.start) forecast = ` Forecast: ${w.type === 'storm' ? 'thunderstorms' : 'rain'} around ${hourStr(w.start)}.`;
  else if ((w.type === 'rain' || w.type === 'storm') && h < w.end) forecast = ` Should clear up around ${hourStr(w.end)}.`;
  else { const t = dayWeather(day + 1).type; forecast = ` Tomorrow: ${({ clear: 'sunny', cloudy: 'cloudy', rain: 'rain', storm: 'thunderstorms' })[t]}.`; }
  N.toast(`${lookLine} (${now}.)${forecast}`, '', 6000);
  return true;
});

// test hook
window.__weather = { weatherAt, dayWeather, get W() { return W; }, strike() { nextBolt = 0; } };
})();
