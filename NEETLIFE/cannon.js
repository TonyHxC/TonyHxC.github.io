// Updated 2026-10-09: Cannon Crash release.
// Pogey Life — Cannon Crash: a PogeyCasino game. A cannon on the left, structures of wood, glass, stone and TNT on the
// right. Click and drag to aim (angle + power, with a short arc preview), then Fire. Blocks break when they take enough
// damage, or when they get knocked down onto the ground. Do enough damage before you run out of cannonballs to clear
// the level. Casino rules like Duel: bet once, every level cleared raises the payout, cash out between levels.
// Physics: physics2d.js (loaded first).
(() => {
'use strict';
const N = window.POGEY, PH = window.Physics2D;
if (!N || !N.casinoAddGame || !PH) return;

// ---------------------------------------------------------------------
// Rules + payouts
// ---------------------------------------------------------------------
const BETS = [10, 25, 50, 100, 250, 500];
const MULT = [0, 1.3, 1.7, 2.2, 2.9, 3.8, 5, 6.5, 8.5, 11, 15]; // after N levels; past 10 each level ×1.3
const mult = n => n < MULT.length ? MULT[n] : +(MULT[MULT.length - 1] * Math.pow(1.3, n - MULT.length + 1)).toFixed(1);
const shotsFor = lv => lv <= 2 ? 3 : 4;
const targetFor = lv => Math.min(0.75, 0.6 + (lv - 1) * 0.017);
const usd = n => '$' + Math.round(n).toLocaleString();

// ---------------------------------------------------------------------
// World constants (metres; the canvas shows 26 m across, y down). Structures go between ZX0 and ZX1.
// ---------------------------------------------------------------------
const W = 960, H = 540, WORLD_W = 26, PX = W / WORLD_W, GY = 13.4, ZX0 = 12.4, ZX1 = 25.3;
const PIVOT = { x: 1.9, y: GY - 1.05 }, BARREL = 1.25, BALL_R = 0.3;
const MAT = {
  wood: { density: 0.8, friction: 0.7, restitution: 0.08, hp: 70, pts: 300, fill: '#c8914f', edge: '#7a5226' },
  glass: { density: 0.6, friction: 0.35, restitution: 0.05, hp: 22, pts: 260, fill: 'rgba(170,220,255,0.55)', edge: '#e8f6ff' },
  stone: { density: 2.2, friction: 0.85, restitution: 0.04, hp: 260, pts: 450, fill: '#8f929c', edge: '#55575f' },
  tnt: { density: 0.8, friction: 0.7, restitution: 0.08, hp: 18, pts: 150, fill: '#d23a2f', edge: '#7a1a14' },
};
const DMG = { min: 1.0, ball: 6, block: 5 }; // damage = (impact energy - min) × factor
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

// ---------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------
let AC = null;
const ac = () => (AC = AC || new (window.AudioContext || window.webkitAudioContext)());
function tone(f, dur, type = 'square', vol = 0.05, slide) {
  try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02); } catch (e) {}
}
function noise(dur, vol, freq = 1200) {
  try { const a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start(); } catch (e) {}
}
let lastHitSfx = 0;
const sfx = {
  fire: () => { noise(0.5, 0.35, 700); tone(90, 0.3, 'sawtooth', 0.08, 40); },
  hit: e => { const now = performance.now(); if (now - lastHitSfx < 40) return; lastHitSfx = now; noise(0.08 + Math.min(0.15, e / 200), Math.min(0.25, 0.04 + e / 150), 900); },
  break: m => { lastHitSfx = performance.now(); if (m === 'glass') { for (let i = 0; i < 4; i++) setTimeout(() => tone(1800 + Math.random() * 1600, 0.12, 'triangle', 0.03), i * 25); } else noise(0.25, m === 'stone' ? 0.3 : 0.22, m === 'stone' ? 500 : 1500); },
  boom: () => { noise(0.9, 0.5, 400); tone(60, 0.6, 'sawtooth', 0.1, 30); },
  clear: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.06), i * 110)),
  fail: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.05), i * 180)),
};

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let body = null, cv = null, g = null, raf = 0, lastT = 0;
let chosenBet = 10, run = null, lvl = null;
function stats() { const S = N.S; if (!S.cannonStats) S.cannonStats = { runs: 0, best: 0, wagered: 0, won: 0 }; return S.cannonStats; }

// ---------------------------------------------------------------------
// Level generation
// ---------------------------------------------------------------------
function pickMat(lv, rnd) {
  const pool = lv <= 1 ? ['wood'] : lv === 2 ? ['wood', 'wood', 'glass'] : lv <= 4 ? ['wood', 'wood', 'glass', 'stone'] : ['wood', 'glass', 'stone', 'stone'];
  return pool[Math.floor(rnd() * pool.length)];
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
// Each template returns its blocks as { m: material, v: verts, x, y } (x, y = centroid) on a floor at height `fy`.
const T = {
  hut(cx, fy, lv, rnd, floors) {
    const out = [], m = pickMat(lv, rnd), pm = pickMat(lv, rnd);
    for (let f = 0; f < floors; f++) {
      const y0 = fy - f * 1.32;
      out.push({ m, v: rect(0.22, 1.1), x: cx - 0.7, y: y0 - 0.55 }, { m, v: rect(0.22, 1.1), x: cx + 0.7, y: y0 - 0.55 });
      if (lv >= 3 && rnd() < 0.3) out.push({ m: 'tnt', v: rect(0.42, 0.42), x: cx, y: y0 - 0.21 });
      else if (rnd() < 0.4) out.push({ m: 'glass', v: rect(0.4, 0.4), x: cx, y: y0 - 0.2 });
      out.push({ m: pm, v: rect(1.9, 0.22), x: cx, y: y0 - 1.21 });
    }
    const top = fy - floors * 1.32;
    out.push(triangle(m, cx, top, 1.2, 0.6));
    return { w: 1.9, blocks: out };
  },
  pyramid(cx, fy, lv, rnd, rows) {
    const out = [], s = 0.52;
    for (let r = 0; r < rows; r++) for (let k = 0; k < rows - r; k++) {
      const tnt = lv >= 3 && r === 0 && k === Math.floor(rows / 2) && rnd() < 0.5;
      out.push({ m: tnt ? 'tnt' : pickMat(lv, rnd), v: rect(s, s), x: cx + (k - (rows - 1 - r) / 2) * (s + 0.01), y: fy - s / 2 - r * s });
    }
    return { w: rows * (s + 0.01), blocks: out };
  },
  wall(cx, fy, lv, rnd, rows) { // running-bond bricks
    const out = [], bw = 0.62, bh = 0.3, n = 4, m = pickMat(lv, rnd);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0, cnt = r % 2 ? n - 1 : n;
      for (let k = 0; k < cnt; k++) out.push({ m: r % 3 === 2 && lv >= 2 ? pickMat(lv, rnd) : m, v: rect(bw - 0.01, bh), x: cx - (n - 1) * bw / 2 + off + k * bw, y: fy - bh / 2 - r * bh });
    }
    return { w: n * bw, blocks: out };
  },
  tower(cx, fy, lv, rnd, levels) { // pairs of posts with a slab on each, getting narrower
    const out = [], m = pickMat(lv, rnd);
    let y = fy;
    for (let l = 0; l < levels; l++) {
      const half = 0.55 - l * 0.08, ph = 0.8;
      out.push({ m, v: rect(0.2, ph), x: cx - half, y: y - ph / 2 }, { m, v: rect(0.2, ph), x: cx + half, y: y - ph / 2 });
      out.push({ m: l % 2 ? pickMat(lv, rnd) : m, v: rect(half * 2 + 0.4, 0.2), x: cx, y: y - ph - 0.1 });
      y -= ph + 0.2;
    }
    out.push({ m: lv >= 3 && rnd() < 0.4 ? 'tnt' : 'glass', v: rect(0.4, 0.4), x: cx, y: y - 0.2 });
    return { w: 1.5, blocks: out };
  },
};
function triangle(m, cx, baseY, w, h) {
  const c = PH.centre([[cx - w / 2, baseY], [cx + w / 2, baseY], [cx, baseY - h]]);
  return { m, v: c.vs, x: c.c[0], y: c.c[1] };
}
function plan(lv, seed) {
  const rnd = rng(seed), out = { blocks: [], ledges: [] };
  const want = Math.min(4, 2 + Math.floor((lv - 1) / 3));
  let x = ZX0 + rnd() * 1.0;
  for (let i = 0; i < want && x < ZX1 - 1.6; i++) {
    const kinds = lv <= 1 ? ['hut', 'pyramid', 'wall'] : ['hut', 'pyramid', 'wall', 'tower'];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const size = kind === 'hut' ? 1 + Math.floor(rnd() * Math.min(3, 1 + lv / 2)) : kind === 'pyramid' ? 3 + Math.floor(rnd() * Math.min(3, lv)) : kind === 'wall' ? 4 + Math.floor(rnd() * Math.min(4, lv + 1)) : 2 + Math.floor(rnd() * Math.min(3, lv));
    // sometimes up on a rock ledge (falling off it counts as hitting the ground)
    let fy = GY, ledge = null;
    const probe = T[kind](0, 0, lv, rng(1), size).w;
    if (lv >= 3 && rnd() < 0.35 && x + probe + 0.4 < ZX1) { const hgt = 1.2 + rnd() * 1.8; fy = GY - hgt; ledge = { x0: x - 0.3, x1: x + probe + 0.3, y: fy }; }
    const s = T[kind](x + probe / 2, fy, lv, rnd, size);
    if (x + s.w > ZX1) break;
    out.blocks.push(...s.blocks); if (ledge) out.ledges.push(ledge);
    x += s.w + 0.9 + rnd() * 1.4;
  }
  return out;
}

function buildLevel(lvNum) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const L = makeLevel(lvNum, Math.floor(Math.random() * 1e9));
    if (L) return L;
  }
  return makeLevel(lvNum, 12345, true);
}
function makeLevel(lvNum, seed, force) {
  const world = new PH.World();
  const ground = world.add({ shape: 'poly', verts: rect(80, 2), x: WORLD_W / 2, y: GY + 1, static: true, friction: 0.9, restitution: 0.05, kind: 'ground' });
  const moundC = PH.centre([[-0.5, GY], [4.3, GY], [3.3, GY - 0.75], [-0.5, GY - 0.75]]);
  const mound = world.add({ shape: 'poly', verts: moundC.vs, x: moundC.c[0], y: moundC.c[1], static: true, friction: 0.9, kind: 'ground' });
  const p = plan(lvNum, seed), blocks = [];
  for (const l of p.ledges) {
    const c = PH.centre([[l.x0, l.y], [l.x1, l.y], [l.x1 - 0.25, GY], [l.x0 + 0.25, GY]]);
    world.add({ shape: 'poly', verts: c.vs, x: c.c[0], y: c.c[1], static: true, friction: 0.9, kind: 'ledge' });
  }
  for (const b of p.blocks) {
    const M = MAT[b.m];
    blocks.push(world.add({ shape: 'poly', verts: b.v, x: b.x, y: b.y, density: M.density, friction: M.friction, restitution: M.restitution, kind: 'block', mat: b.m, hp: M.hp, dmg: 0 }));
  }
  // let it settle without anything counting, and throw away layouts that don't stand up by themselves
  const start = blocks.map(b => [b.x, b.y]);
  world.canSleep = false; // stay awake so the contacts below are known
  for (let i = 0; i < 90; i++) world.step(1 / 60);
  world.events = [];
  const moved = blocks.some((b, i) => Math.hypot(b.x - start[i][0], b.y - start[i][1]) > 0.08);
  if (moved && !force) return null;
  let total = 0;
  for (const b of blocks) b.onGround = world.touching(b).some(t => t.other.kind === 'ground');
  world.canSleep = true;
  for (const b of blocks) {
    b.sleeping = true; b.vx = b.vy = b.w = 0; b.a0 = b.a; b.y0 = b.y;
    b.pts = Math.max(10, Math.round(MAT[b.mat].pts * b.area / 10) * 10); total += b.pts;
  }
  return { n: lvNum, world, ground, mound, blocks, total, destroyed: 0, shots: shotsFor(lvNum), target: targetFor(lvNum), phase: 'aim',
    ball: null, trail: [], t: 0, calmT: 0, parts: [], texts: [], shake: 0, booms: [], aim: { ang: 0.62, pow: 0.62 }, dragging: false, msgT: 0, msg: '' };
}
const progress = L => { let part = 0; for (const b of L.blocks) if (!b.removed) part += b.pts * Math.min(1, b.dmg / b.hp); return Math.min(1, (L.destroyed + part * 0.4) / L.total); };

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .cannon canvas { width: 100%; aspect-ratio: 16 / 9; display: block; margin: 0 auto; border-radius: 12px; background: #8fc7ff; cursor: crosshair; touch-action: none; user-select: none; }
  .cannon-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .cannon-top .info { font-weight: 800; font-size: 14px; color: #3b3a44; } .cannon-top .info b { color: #1b8a4a; }
  .cannon-btns { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; min-height: 42px; }
  .cannon-btns .wbtn { font-size: 15px; padding: 10px 18px; }
  .cannon-btns .fire { font-size: 17px; padding: 10px 34px; background: #d23a2f; color: #fff; letter-spacing: 1px; }
  .cannon-btns .fire:disabled { opacity: .45; }
  .cannon-help { font-size: 12px; color: #6a6880; text-align: center; margin-top: 6px; }`;
document.head.appendChild(css);

function render(b) { body = b; if (run) return renderTable(); renderBetScreen(); }
function renderBetScreen() {
  stopLoop();
  const S = N.S, st = stats();
  if (chosenBet > S.money) chosenBet = BETS.filter(x => x <= S.money).pop() || BETS[0];
  body.innerHTML = `<div class="casino cannon"><button class="back" id="caBack">← All games</button><h3>💣 Cannon Crash</h3>
    <p>Knock it all down. <b>Click and drag</b> on the screen to aim the cannon (direction and power), then hit <b>Fire</b>. Blocks break when they take enough damage or get knocked down onto the ground. <b style="color:#c43a3a">TNT</b> goes off when hit. Do enough damage (the line on the bar) before your cannonballs run out to clear the level.</p>
    <div class="bets">${BETS.map(x => `<button data-bet="${x}" class="${x === chosenBet ? 'on' : ''}" ${x > S.money ? 'disabled' : ''}>$${x}</button>`).join('')}</div>
    <div class="ladder">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<div class="rung">Level ${n}<b>×${mult(n)}</b>${usd(chosenBet * mult(n))}<br><span style="font-size:10px">${Math.round(targetFor(n) * 100)}% · ${shotsFor(n)} shots</span></div>`).join('')}</div>
    <p style="font-size:12px">Under each rung: damage needed and cannonballs you get. Cash out after any level, or keep going for a bigger payout. Run out of shots short of the target and the house keeps your bet. Past level 10, each level adds ×1.3.</p>
    <button class="wbtn gold" id="caGo" ${S.money < chosenBet ? 'disabled' : ''} style="font-size:16px;padding:12px 20px">Bet ${usd(chosenBet)} and play</button>
    <p style="font-size:12px;margin-top:12px">Runs <b>${st.runs}</b> · Best <b>${st.best} level${st.best === 1 ? '' : 's'}</b> · Wagered <b>${usd(st.wagered)}</b> · Won <b>${usd(st.won)}</b></p></div>`;
  body.querySelectorAll('[data-bet]').forEach(x => x.onclick = () => { chosenBet = +x.dataset.bet; renderBetScreen(); });
  body.querySelector('#caBack').onclick = () => N.casinoLobby();
  body.querySelector('#caGo').onclick = () => startRun(chosenBet);
}
function startRun(bet) {
  const S = N.S; if (S.money < bet) return;
  N.addMoney(-bet, 'Cannon Crash bet');
  const st = stats(); st.runs++; st.wagered += bet; N.save();
  run = { bet, cleared: 0 };
  lvl = buildLevel(1);
  renderTable();
}
function renderTable() {
  body.innerHTML = `<div class="cannon"><div class="cannon-top"><span class="info" id="caInfo"></span><button class="wbtn" id="caLeave" style="background:#ff5f57">Walk away</button></div>
    <canvas id="caCanvas" width="${W}" height="${H}"></canvas><div class="cannon-btns" id="caBtns"></div>
    <div class="cannon-help">Click and drag to aim (further = more power) · <b>Space</b> or the button to fire · arrow keys fine-tune</div></div>`;
  cv = body.querySelector('#caCanvas'); g = cv.getContext('2d');
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  body.querySelector('#caLeave').onclick = leave;
  updateInfo(); updateButtons(true);
  startLoop();
}
function updateInfo() {
  const el = body && body.querySelector('#caInfo'); if (!el || !run) return;
  el.innerHTML = `Level ${lvl.n} · Bet ${usd(run.bet)} · ${run.cleared ? `Cash out now: <b>${usd(run.bet * mult(run.cleared))}</b>` : 'Nothing cleared yet'}`;
}
function updateButtons(force) {
  const el = body && body.querySelector('#caBtns'); if (!el || !lvl) return;
  const key = lvl.phase + lvl.shots + run.cleared;
  if (!force && el.dataset.key === key) return; // only rebuild when something changed, or clicks get eaten
  el.dataset.key = key;
  if (lvl.phase === 'aim') { el.innerHTML = `<button class="wbtn fire" id="caFire">FIRE</button>`; el.querySelector('#caFire').onclick = fire; }
  else if (lvl.phase === 'clear') {
    el.innerHTML = `<button class="wbtn gold" id="caCash">Cash out ${usd(run.bet * mult(run.cleared))}</button><button class="wbtn" id="caNext">Next level (×${mult(run.cleared + 1)})</button>`;
    el.querySelector('#caCash').onclick = cashOut; el.querySelector('#caNext').onclick = nextLevel;
  } else if (lvl.phase === 'fail') {
    el.innerHTML = `<button class="wbtn gold" id="caAgain">Play again</button><button class="wbtn" id="caBets">Back to bets</button>`;
    el.querySelector('#caAgain').onclick = () => { run = null; lvl = null; const b = Math.min(chosenBet, N.S.money) >= BETS[0] ? chosenBet : BETS[0]; if (N.S.money >= b) startRun(b); else renderBetScreen(); };
    el.querySelector('#caBets').onclick = () => { run = null; lvl = null; renderBetScreen(); };
  } else el.innerHTML = `<button class="wbtn fire" disabled>FIRE</button>`;
}
function endRun() { const st = stats(); st.best = Math.max(st.best, run.cleared); N.advance(10 * Math.max(1, run.cleared)); N.updateHUD(); N.save(); }
function cashOut() {
  const amt = Math.round(run.bet * mult(run.cleared)), st = stats();
  N.addMoney(amt, `Cannon Crash: cashed out after level ${run.cleared}`);
  st.won += amt; endRun();
  N.toast(`You walk away ${usd(amt)} richer.`, 'good');
  run = null; lvl = null; renderBetScreen();
}
function nextLevel() { lvl = buildLevel(run.cleared + 1); updateInfo(); updateButtons(true); }
function leave() {
  if (!run) return renderBetScreen();
  if (lvl && lvl.phase === 'clear') return cashOut();
  if (lvl && lvl.phase === 'fail') { run = null; lvl = null; return renderBetScreen(); }
  N.toast('You walk away from the cannon. The house keeps your bet.', 'bad');
  endRun(); run = null; lvl = null; renderBetScreen();
}

// ---------------------------------------------------------------------
// Aiming + firing
// ---------------------------------------------------------------------
function canvasXY(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
function aimAt(px, py) {
  const dx = px - PIVOT.x * PX, dy = PIVOT.y * PX - py;
  lvl.aim.ang = Math.max(-0.15, Math.min(1.45, Math.atan2(dy, Math.max(1, dx))));
  lvl.aim.pow = Math.max(0.05, Math.min(1, (Math.hypot(dx, dy) - 40) / 520));
}
function onDown(e) { if (!lvl || lvl.phase !== 'aim' || e.button !== 0) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); lvl.dragging = true; aimAt(...canvasXY(e)); }
function onMove(e) { if (lvl && lvl.dragging) aimAt(...canvasXY(e)); }
function onUp() { if (lvl) lvl.dragging = false; }
const speedOf = pow => 7 + 15 * pow; // m/s
function muzzle() { const a = lvl.aim.ang; return { x: PIVOT.x + Math.cos(a) * BARREL, y: PIVOT.y - Math.sin(a) * BARREL }; }
function fire() {
  if (!lvl || lvl.phase !== 'aim' || lvl.shots <= 0) return;
  const m = muzzle(), v = speedOf(lvl.aim.pow), a = lvl.aim.ang;
  const ball = lvl.world.add({ shape: 'circle', r: BALL_R, x: m.x, y: m.y, density: 6, friction: 0.5, restitution: 0.3, kind: 'ball' });
  ball.vx = Math.cos(a) * v; ball.vy = -Math.sin(a) * v;
  lvl.ball = ball; lvl.trail = []; lvl.shots--; lvl.phase = 'flying'; lvl.t = 0; lvl.calmT = 0; lvl.recoil = 1; lvl.smoke = 1;
  sfx.fire(); updateButtons();
}
document.addEventListener('keydown', e => {
  if (!lvl || !cv || !document.body.contains(cv) || !visible()) return;
  if (e.code === 'Space' || e.code === 'Enter') { if (lvl.phase === 'aim') fire(); e.preventDefault(); e.stopPropagation(); return; }
  if (lvl.phase !== 'aim') return;
  const k = { ArrowUp: [0.02, 0], ArrowDown: [-0.02, 0], ArrowRight: [0, 0.01], ArrowLeft: [0, -0.01] }[e.code];
  if (k) { lvl.aim.ang = Math.max(-0.15, Math.min(1.45, lvl.aim.ang + k[0])); lvl.aim.pow = Math.max(0.05, Math.min(1, lvl.aim.pow + k[1])); e.preventDefault(); e.stopPropagation(); }
}, true);

// ---------------------------------------------------------------------
// Simulation: damage, breaking, TNT, end of turn
// ---------------------------------------------------------------------
function destroy(b, why) {
  if (b.removed) return;
  const L = lvl; L.world.remove(b); L.world.wakeAll();
  if (b.kind !== 'block') return;
  L.destroyed += b.pts;
  L.texts.push({ x: b.x, y: b.y, s: '+' + b.pts, t: 0, c: why === 'ground' ? '#ffe28a' : '#fff' });
  const M = MAT[b.mat], n = b.mat === 'glass' ? 14 : 9;
  for (let i = 0; i < n; i++) L.parts.push({ x: b.x + (Math.random() - 0.5) * 0.5, y: b.y + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 6 + b.vx * 0.3, vy: -Math.random() * 5 + b.vy * 0.3,
    r: 0.05 + Math.random() * 0.1, a: Math.random() * 6, w: (Math.random() - 0.5) * 12, c: b.mat === 'glass' ? '#cfeaff' : M.fill, t: 0, life: 0.8 + Math.random() * 0.6 });
  sfx.break(b.mat);
  if (b.mat === 'tnt') explode(b.x, b.y);
}
function explode(x, y) {
  const L = lvl, R = 2.8;
  L.booms.push({ x, y, t: 0 }); L.shake = Math.max(L.shake, 14); sfx.boom();
  for (const o of L.world.bodies) {
    if (o.static) continue;
    const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy); if (d > R || d < 1e-3) continue;
    const k = 1 - d / R; o.sleeping = false; o.sleepT = 0;
    o.vx += dx / d * 11 * k; o.vy += dy / d * 11 * k - 2 * k; o.w += (Math.random() - 0.5) * 8 * k;
    if (o.kind === 'block') { o.dmg += 140 * k; if (o.dmg >= o.hp) setTimeout(() => lvl === L && destroy(o, 'boom'), o.mat === 'tnt' ? 120 : 0); }
  }
}
function update(dt) {
  const L = lvl, w = L.world;
  L.t += dt; L.recoil = Math.max(0, (L.recoil || 0) - dt * 4); L.smoke = Math.max(0, (L.smoke || 0) - dt * 1.5); L.shake = Math.max(0, L.shake - dt * 40);
  w.step(dt);
  // impacts -> damage
  for (const ev of w.events) {
    if (ev.energy > 2) sfx.hit(ev.energy);
    for (const b of [ev.A, ev.B]) {
      if (b.kind !== 'block' || b.removed) continue;
      const hitByBall = ev.A.kind === 'ball' || ev.B.kind === 'ball';
      b.dmg += Math.max(0, ev.energy - DMG.min) * (hitByBall ? DMG.ball : DMG.block);
      if (b.dmg >= b.hp) destroy(b, 'hit');
    }
  }
  w.events = [];
  // knocked down onto the ground (or off the map)
  for (const b of L.blocks) {
    if (b.removed) continue;
    if (b.y > GY + 3 || b.x < -3 || b.x > WORLD_W + 4) { destroy(b, 'ground'); continue; }
    if (b.sleeping) continue;
    // knocked down = it's on the ground now and either tipped over or fell a fair way to get there
    const onGround = w.touching(b).some(t => t.other.kind === 'ground');
    if (onGround && (Math.abs(b.a - b.a0) > 0.6 || b.y - b.y0 > 0.9)) destroy(b, 'ground');
  }
  // the ball
  const ball = L.ball;
  if (ball && !ball.removed) {
    L.trail.push([ball.x, ball.y]); if (L.trail.length > 26) L.trail.shift();
    const sp = Math.hypot(ball.vx, ball.vy);
    ball.slowT = sp < 0.6 ? (ball.slowT || 0) + dt : 0;
    if (ball.x > WORLD_W + 3 || ball.x < -3 || ball.y > GY + 4 || ball.slowT > 1.0 || L.t > 9) { w.remove(ball); }
  }
  // particles + floating texts
  for (const p of L.parts) { p.t += dt; p.vy += 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.w * dt; if (p.y > GY) { p.y = GY; p.vy *= -0.3; p.vx *= 0.6; } }
  L.parts = L.parts.filter(p => p.t < p.life);
  for (const t of L.texts) t.t += dt; L.texts = L.texts.filter(t => t.t < 1.3);
  for (const b of L.booms) b.t += dt; L.booms = L.booms.filter(b => b.t < 0.6);
  // end of a shot: the ball is gone and everything has (nearly) stopped
  if (L.phase === 'flying') {
    const calm = (!L.ball || L.ball.removed) && L.blocks.every(b => b.removed || b.sleeping || b.vx * b.vx + b.vy * b.vy < 0.04);
    L.calmT = calm ? L.calmT + dt : 0;
    if (L.calmT > 0.6 || L.t > 14) endShot();
  }
}
function endShot() {
  const L = lvl, p = progress(L);
  if (p >= L.target) {
    L.phase = 'clear'; L.t = 0; run.cleared++;
    // unused cannonballs: a little bonus flourish
    if (L.shots > 0) L.msg = `${L.shots} cannonball${L.shots > 1 ? 's' : ''} to spare!`;
    sfx.clear(); updateInfo();
  } else if (L.shots <= 0) {
    L.phase = 'fail'; L.t = 0; sfx.fail(); endRun();
  } else { L.phase = 'aim'; L.ball = null; }
  updateButtons();
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const visible = () => body && body.closest('.win') && body.closest('.win').classList.contains('show') && N.casinoView === 'cannon' && document.getElementById('pc').classList.contains('show');
function startLoop() { stopLoop(); lastT = performance.now(); const tick = now => { raf = requestAnimationFrame(tick); frame(Math.min(1 / 30, (now - lastT) / 1000)); lastT = now; }; raf = requestAnimationFrame(tick); }
function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
function frame(dt) {
  if (!lvl || !cv || !document.body.contains(cv)) { stopLoop(); return; }
  if (!visible()) { // closed the PC / left the casino mid-run
    if (run && lvl.phase === 'clear') cashOut(); else if (run && lvl.phase !== 'fail') leave(); else { run = null; lvl = null; }
    stopLoop(); return;
  }
  fit();
  if (!N.paused) update(dt);
  draw();
}
function fit() {
  const avail = body.clientHeight - 36 - 110, w = Math.max(320, Math.min(body.clientWidth - 36, avail * 16 / 9));
  if (Math.abs(cv.offsetWidth - w) > 2) cv.style.width = w + 'px';
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function sky(n) {
  const k = ((n - 1) % 10) / 9;
  return { top: mix('#7cc3ff', '#3a2a6a', k), bot: mix('#dff2ff', '#ffb27a', Math.min(1, k * 1.3)), sunY: 90 + k * 230, sunC: mix('#fff7c8', '#ff8a4a', k), k };
}
function mix(a, b, t) { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t)).join(',')})`; }
function draw() {
  const L = lvl, sk = sky(L.n);
  g.save();
  if (L.shake) g.translate((Math.random() - 0.5) * L.shake, (Math.random() - 0.5) * L.shake);
  // sky, sun, clouds, far hills
  let gr = g.createLinearGradient(0, 0, 0, GY * PX); gr.addColorStop(0, sk.top); gr.addColorStop(1, sk.bot); g.fillStyle = gr; g.fillRect(-20, -20, W + 40, H + 40);
  g.fillStyle = sk.sunC; g.beginPath(); g.arc(W * 0.72, sk.sunY, 34, 0, 7); g.fill();
  const tt = performance.now() / 1000;
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [cx, cy, s] of [[150, 80, 1], [520, 60, 1.3], [820, 120, 0.9]]) { const x = (cx + tt * 6 * s) % (W + 200) - 100; g.beginPath(); g.arc(x, cy, 22 * s, 0, 7); g.arc(x + 26 * s, cy - 8 * s, 26 * s, 0, 7); g.arc(x + 54 * s, cy, 20 * s, 0, 7); g.fill(); }
  g.fillStyle = mix('#7fb06a', '#3a4a3a', sk.k);
  g.beginPath(); g.moveTo(-20, GY * PX); for (let x = -20; x <= W + 20; x += 40) g.lineTo(x, GY * PX - 60 - Math.sin(x * 0.006 + 1) * 30 - Math.sin(x * 0.017) * 12); g.lineTo(W + 20, GY * PX); g.fill();
  // ground
  gr = g.createLinearGradient(0, GY * PX, 0, H); gr.addColorStop(0, '#6a4a2e'); gr.addColorStop(1, '#3e2a1a'); g.fillStyle = gr; g.fillRect(-20, GY * PX, W + 40, H - GY * PX + 20);
  g.fillStyle = '#5aa04a'; g.fillRect(-20, GY * PX - 3, W + 40, 7);
  // static bits: the cannon's mound and rock ledges
  for (const b of L.world.bodies) if (b.static && b.kind !== 'ground' || b === L.mound) poly(b, b === L.mound ? '#7a5a36' : '#7d6f62', b === L.mound ? '#5aa04a' : '#5a4e44');
  // blocks
  for (const b of L.world.bodies) if (b.kind === 'block') drawBlock(b);
  // trajectory preview
  if (L.phase === 'aim') {
    const m = muzzle(), v = speedOf(L.aim.pow), a = L.aim.ang;
    let x = m.x, y = m.y, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
    for (let i = 0; i < 26; i++) { x += vx / 30; y += vy / 30; vy += 9.8 / 30; if (y > GY) break; g.fillStyle = `rgba(255,255,255,${0.9 - i / 30})`; g.beginPath(); g.arc(x * PX, y * PX, 3.2 - i * 0.07, 0, 7); g.fill(); }
  }
  // ball + trail
  if (L.ball && !L.ball.removed) {
    L.trail.forEach(([x, y], i) => { g.fillStyle = `rgba(60,60,70,${i / L.trail.length * 0.35})`; g.beginPath(); g.arc(x * PX, y * PX, BALL_R * PX * (0.3 + 0.7 * i / L.trail.length), 0, 7); g.fill(); });
    const b = L.ball; g.fillStyle = '#26262c'; g.beginPath(); g.arc(b.x * PX, b.y * PX, BALL_R * PX, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(b.x * PX - 3, b.y * PX - 3, BALL_R * PX * 0.35, 0, 7); g.fill();
  }
  drawCannon(L);
  // particles, explosions, texts
  for (const p of L.parts) { g.save(); g.globalAlpha = Math.max(0, 1 - p.t / p.life); g.translate(p.x * PX, p.y * PX); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r * PX, -p.r * PX * 0.6, p.r * PX * 2, p.r * PX * 1.2); g.restore(); }
  for (const b of L.booms) { const k = b.t / 0.6; g.fillStyle = `rgba(255,${Math.round(200 - 150 * k)},60,${1 - k})`; g.beginPath(); g.arc(b.x * PX, b.y * PX, (0.6 + 2.6 * k) * PX, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.font = '900 18px system-ui, sans-serif';
  for (const t of L.texts) { g.globalAlpha = Math.max(0, 1 - t.t / 1.3); g.fillStyle = '#0008'; g.fillText(t.s, t.x * PX + 1, t.y * PX - t.t * 40 + 1); g.fillStyle = t.c; g.fillText(t.s, t.x * PX, t.y * PX - t.t * 40); }
  g.globalAlpha = 1;
  g.restore();
  drawHUD(L);
}
function poly(b, fill, edge) {
  g.beginPath(); b.wv.forEach((v, i) => i ? g.lineTo(v[0] * PX, v[1] * PX) : g.moveTo(v[0] * PX, v[1] * PX)); g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = edge; g.stroke();
}
function drawBlock(b) {
  const M = MAT[b.mat];
  poly(b, M.fill, M.edge);
  g.save(); g.translate(b.x * PX, b.y * PX); g.rotate(b.a);
  g.beginPath(); b.lv.forEach((v, i) => i ? g.lineTo(v[0] * PX, v[1] * PX) : g.moveTo(v[0] * PX, v[1] * PX)); g.closePath(); g.clip();
  const xs = b.lv.map(v => v[0] * PX), ys = b.lv.map(v => v[1] * PX), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (b.mat === 'wood') { g.strokeStyle = 'rgba(110,70,30,0.35)'; g.lineWidth = 1; const horiz = x1 - x0 >= y1 - y0; for (let k = 1; k < 4; k++) { g.beginPath(); if (horiz) { const y = y0 + (y1 - y0) * k / 4; g.moveTo(x0, y); g.lineTo(x1, y); } else { const x = x0 + (x1 - x0) * k / 4; g.moveTo(x, y0); g.lineTo(x, y1); } g.stroke(); } }
  else if (b.mat === 'stone') { g.fillStyle = 'rgba(60,62,70,0.35)'; for (let k = 0; k < 6; k++) { const r = ((b.id * 97 + k * 37) % 100) / 100, s = ((b.id * 53 + k * 71) % 100) / 100; g.fillRect(x0 + r * (x1 - x0), y0 + s * (y1 - y0), 3, 3); } }
  else if (b.mat === 'glass') { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 4, y1 - 6); g.lineTo(x0 + (x1 - x0) * 0.5, y0 + 4); g.stroke(); }
  else if (b.mat === 'tnt') { g.fillStyle = '#fff'; g.font = `900 ${Math.max(7, Math.min(13, (x1 - x0) * 0.32))}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TNT', 0, 1); }
  // cracks as it takes damage
  const d = b.dmg / b.hp;
  if (d > 0.25) {
    g.strokeStyle = b.mat === 'glass' ? 'rgba(255,255,255,0.9)' : 'rgba(30,20,10,0.6)'; g.lineWidth = 1.5;
    const n = d > 0.6 ? 3 : 1;
    for (let k = 0; k < n; k++) { const sx = x0 + ((b.id * 31 + k * 47) % 100) / 100 * (x1 - x0), sy = y0 + ((b.id * 17 + k * 29) % 100) / 100 * (y1 - y0);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 8, sy + 5); g.lineTo(sx + 4, sy + 12); g.moveTo(sx, sy); g.lineTo(sx - 7, sy + 3); g.stroke(); }
  }
  g.restore();
}
function drawCannon(L) {
  const px = PIVOT.x * PX, py = PIVOT.y * PX, a = L.aim.ang, rec = (L.recoil || 0) * 10;
  // barrel
  g.save(); g.translate(px, py); g.rotate(-a);
  g.fillStyle = '#2a2a30'; g.fillRect(-12 - rec, -11, BARREL * PX + 4, 22); g.fillStyle = '#3c3c44'; g.fillRect(-12 - rec, -11, BARREL * PX + 4, 6);
  g.fillStyle = '#1b1b20'; g.fillRect(BARREL * PX - 10 - rec, -13, 12, 26);
  g.restore();
  // carriage + wheel
  g.fillStyle = '#6b4424'; g.beginPath(); g.moveTo(px - 26, py + 24); g.lineTo(px + 22, py + 24); g.lineTo(px + 8, py - 4); g.lineTo(px - 16, py - 4); g.closePath(); g.fill();
  g.fillStyle = '#4a2e18'; g.beginPath(); g.arc(px - 4, py + 22, 13, 0, 7); g.fill(); g.fillStyle = '#c9a25a'; g.beginPath(); g.arc(px - 4, py + 22, 4, 0, 7); g.fill();
  if (L.smoke) { const m = muzzle(); g.fillStyle = `rgba(230,230,230,${L.smoke * 0.7})`; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(m.x * PX + i * 10 * (1 - L.smoke), m.y * PX - i * 8 * (1 - L.smoke), 10 + i * 6 * (1 - L.smoke), 0, 7); g.fill(); } }
  // power gauge while aiming
  if (L.phase === 'aim') {
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 7; g.beginPath(); g.arc(px, py, 52, Math.PI * 0.95, Math.PI * 1.55); g.stroke();
    g.strokeStyle = L.aim.pow > 0.8 ? '#ff5a3a' : L.aim.pow > 0.5 ? '#ffc23a' : '#6fe39a'; g.beginPath(); g.arc(px, py, 52, Math.PI * 0.95, Math.PI * (0.95 + 0.6 * L.aim.pow)); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 12px system-ui'; g.textAlign = 'center'; g.fillText(`${Math.round(L.aim.pow * 100)}%  ${Math.round(L.aim.ang * 180 / Math.PI)}°`, px, py - 62);
  }
}
function drawHUD(L) {
  const p = progress(L);
  // shots
  g.fillStyle = 'rgba(15,14,22,0.6)'; g.beginPath(); g.roundRect(14, 12, 150, 34, 10); g.fill();
  g.fillStyle = '#fff'; g.font = '800 13px system-ui'; g.textAlign = 'left'; g.fillText('SHOTS', 24, 34);
  const total = shotsFor(L.n);
  for (let i = 0; i < total; i++) { g.fillStyle = i < L.shots ? '#26262c' : 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(84 + i * 20, 29, 7, 0, 7); g.fill(); if (i < L.shots) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(82 + i * 20, 27, 2.4, 0, 7); g.fill(); } }
  // destruction bar with the target line
  const bx = W - 324, by = 14, bw = 300, bh = 28;
  g.fillStyle = 'rgba(15,14,22,0.6)'; g.beginPath(); g.roundRect(bx - 10, by - 4, bw + 20, bh + 8, 10); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, by + 14, bw, 10);
  g.fillStyle = p >= L.target ? '#6fe39a' : '#ffb03a'; g.fillRect(bx, by + 14, bw * p, 10);
  g.fillStyle = '#fff'; g.fillRect(bx + bw * L.target - 1.5, by + 10, 3, 18);
  g.font = '800 12px system-ui'; g.textAlign = 'left'; g.fillText(`DAMAGE ${Math.round(p * 100)}%`, bx, by + 9);
  g.textAlign = 'right'; g.fillText(`NEED ${Math.round(L.target * 100)}%`, bx + bw, by + 9);
  g.textAlign = 'center'; g.font = '900 15px system-ui'; g.fillStyle = 'rgba(15,14,22,0.6)'; g.beginPath(); g.roundRect(W / 2 - 60, 12, 120, 30, 10); g.fill(); g.fillStyle = '#ffcf5a'; g.fillText(`LEVEL ${L.n}`, W / 2, 33);
  // banners
  if (L.phase === 'clear' || L.phase === 'fail') {
    const k = Math.min(1, L.t / 0.35);
    g.fillStyle = `rgba(10,8,18,${0.55 * k})`; g.fillRect(0, H / 2 - 70, W, 140);
    g.globalAlpha = k; g.textAlign = 'center'; g.fillStyle = L.phase === 'clear' ? '#6fe39a' : '#ff6b6b'; g.font = '950 44px system-ui';
    g.fillText(L.phase === 'clear' ? 'LEVEL CLEARED!' : 'OUT OF CANNONBALLS', W / 2, H / 2 - 8);
    g.fillStyle = '#fff'; g.font = '700 17px system-ui';
    g.fillText(L.phase === 'clear' ? `${Math.round(p * 100)}% destroyed${L.msg ? ' · ' + L.msg : ''} · cash out ${usd(run.bet * mult(run.cleared))} or go for ×${mult(run.cleared + 1)}`
      : `${Math.round(p * 100)}% destroyed, needed ${Math.round(L.target * 100)}%. The house keeps your ${usd(run.bet)}.`, W / 2, H / 2 + 26);
    g.globalAlpha = 1;
  }
}

N.casinoAddGame({ id: 'cannon', icon: '💣', name: 'Cannon Crash', desc: 'Aim, fire, knock it all down. Clear levels to climb the payout ladder.', grad: 'linear-gradient(135deg,#3a7bd5,#1b2a4a)', render });

window.__cannon = { DMG, update, endShot, setLevel(L, r) { lvl = L; run = r || { bet: 10, cleared: 0 }; }, get lvl() { return lvl; }, get run() { return run; }, buildLevel, fire, progress, destroy, plan, MAT, T, startRun, cashOut, nextLevel };
})();
