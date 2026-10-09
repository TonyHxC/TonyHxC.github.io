// Pogey Life — Duel: a PogeyCasino game. Two gunslingers face off; you have a six-shooter and ONE bullet.
// The empty cylinder spins at the bottom of the screen. Click a chamber to load your bullet into it:
// the chamber lined up with the barrel (green ring) fires on the first trigger pull, its neighbours (yellow) on the
// second, the rest (red) on the third / fourth. Each pull = cock the hammer, then pull the trigger (click, click).
// Fire before the other gunslinger does. Every level is a new opponent with less time (10 s → 6 s by level 10).
// Casino rules like Plinko: bet once, beat duels to climb the payout ladder, cash out after any win, die and lose the bet.
(() => {
'use strict';
const N = window.POGEY;
if (!N || !N.casinoAddGame) return;

// ---------------------------------------------------------------------
// Opponents
// ---------------------------------------------------------------------
const FOES = [
  { name: 'Dusty Pete', title: 'Nervous rookie', hat: 'cowboy', hatC: '#8a5a32', skin: '#e8b48a', shirt: '#c9a46b', vest: '#6b4a2a', pants: '#4a5a7a', face: ['stubble'] },
  { name: 'Sheriff Hayes', title: 'The law, mostly', hat: 'cowboy', hatC: '#e8e0cc', skin: '#d9a07a', shirt: '#7a8fa8', vest: '#3b3b44', pants: '#3a3a40', face: ['mustache', 'badge'] },
  { name: 'Rattlesnake Rosa', title: 'Bites first', hat: 'bandana', hatC: '#c0303a', skin: '#c88a62', shirt: '#2f2f38', vest: '#8a2a30', pants: '#3b2a24', face: ['braid'] },
  { name: 'One-Eye Jack', title: 'Only needs one', hat: 'cowboy', hatC: '#2a2a2a', skin: '#e0a882', shirt: '#9a3a2a', vest: '#2a2a30', pants: '#4a4036', face: ['patch', 'beard'] },
  { name: 'El Coyote', title: 'Quick as the desert wind', hat: 'sombrero', hatC: '#d8b36a', skin: '#b07850', shirt: '#e8e0cc', vest: '#c0503a', pants: '#3a3a40', face: ['mustache', 'poncho'] },
  { name: 'The Parson', title: 'Says a prayer for you', hat: 'flat', hatC: '#141414', skin: '#e8c0a0', shirt: '#f0f0f0', vest: '#141414', pants: '#141414', face: ['collar'] },
  { name: 'Big Bart', title: 'Too big to miss', hat: 'cowboy', hatC: '#5a3a22', skin: '#d89a70', shirt: '#4a6a3a', vest: '#7a5a3a', pants: '#3a3028', face: ['beard'], big: 1.15 },
  { name: 'Lady Lucky', title: 'Never loses at cards', hat: 'feather', hatC: '#5a2a6a', skin: '#f0c8a8', shirt: '#7a3a8a', vest: '#2a1a30', pants: '#2a1a30', face: ['lips'] },
  { name: 'Doc Hollow', title: 'Coughs, never flinches', hat: 'top', hatC: '#1a1a1e', skin: '#e8d0b8', shirt: '#d8d0c0', vest: '#5a1a1a', pants: '#2a2a2e', face: ['mustache'] },
  { name: 'The Stranger', title: 'Nobody knows his name', hat: 'cowboy', hatC: '#3a3026', skin: '#c89070', shirt: '#4a4036', vest: '#7a6a4a', pants: '#3a3a3a', face: ['stubble', 'poncho', 'cigar'] },
];
const foeFor = lv => {
  const f = FOES[(lv - 1) % FOES.length];
  return lv > FOES.length ? { ...f, name: 'Ghost of ' + f.name, title: 'Back for revenge', ghost: true } : f;
};

// ---------------------------------------------------------------------
// Rules + payouts
// ---------------------------------------------------------------------
const BETS = [10, 25, 50, 100, 250, 500];
const MULT = [0, 1.3, 1.7, 2.2, 2.9, 3.8, 5, 6.5, 8.5, 11, 15]; // after N wins; past 10 each win ×1.3
const mult = n => n < MULT.length ? MULT[n] : +(MULT[MULT.length - 1] * Math.pow(1.3, n - MULT.length + 1)).toFixed(1);
const timeLimit = lv => lv <= 10 ? 10 - (lv - 1) * 4 / 9 : Math.max(3.5, 6 - (lv - 10) * 0.25);
const spinSpeed = lv => Math.min(11, 4.6 + (lv - 1) * 0.5); // chambers per second: ~0.8 turns/s at duel 1, 1.5 turns/s by duel 10
const usd = n => '$' + Math.round(n).toLocaleString();

// ---------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------
let AC = null;
const ac = () => (AC = AC || new (window.AudioContext || window.webkitAudioContext)());
function tone(f, dur, type = 'square', vol = 0.06, slide) {
  try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02); } catch (e) {}
}
function noise(dur, vol, freq = 1200) {
  try { const a = ac(), n = a.sampleRate * dur, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start(); } catch (e) {}
}
const sfx = {
  load: () => { tone(900, 0.04, 'square', 0.05); setTimeout(() => tone(500, 0.06, 'triangle', 0.05), 40); },
  cock: () => { tone(1400, 0.025, 'square', 0.05); setTimeout(() => tone(900, 0.04, 'square', 0.05), 70); },
  click: () => tone(2200, 0.03, 'square', 0.05),
  bang: () => { noise(0.6, 0.5, 2400); tone(90, 0.3, 'sawtooth', 0.12, 40); },
  far: () => { noise(0.5, 0.35, 1400); tone(70, 0.3, 'sawtooth', 0.08, 35); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.07), i * 110)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.07), i * 160)); },
  tick: () => tone(1800, 0.02, 'square', 0.03),
};

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let run = null;     // { bet, level, wins }
let duel = null;    // the current standoff
let chosenBet = 25, body = null, cv = null, g = null, raf = 0, lastT = 0;
const W = 960, H = 540, GROUND = 395, CYL = { x: 330, y: 468, r: 50 };
// the gun controls along the bottom: cylinder (left of centre), hammer (centre), trigger (right of centre)
const HAMMER = { x: 480, y: 506, box: [436, 412, 528, 530] }, TRIGGER = { x: 632, y: 474, box: [584, 440, 694, 532] };
const inBox = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function stats() { const S = N.S; if (!S.duelStats) S.duelStats = { runs: 0, best: 0, wagered: 0, won: 0 }; return S.duelStats; }

function newDuel(level) {
  duel = { level, foe: foeFor(level), phase: 'intro', t: 0, limit: timeLimit(level), spin: spinSpeed(level),
    rot: Math.random() * 6, green: (Math.random() * 6) | 0, settle: null, loaded: -1, pulls: 0, cocked: false, hammer: 0, step: 0, stepFrom: 0, stepTo: 0,
    aiDraw: 0, meDraw: 0, meDead: 0, foeDead: 0, flash: 0, foeFlash: 0, msg: '', msgT: 0, shake: 0, tumble: -100, ticked: 0 };
}

// ---------------------------------------------------------------------
// Screens (DOM)
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .duel { max-width: 980px; margin: 0 auto; }
  .duel canvas { width: 100%; aspect-ratio: 16 / 9; display: block; margin: 0 auto; border-radius: 12px; background: #1b1410; cursor: crosshair; touch-action: none; user-select: none; }
  .duel-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .duel-top .info { font-weight: 800; font-size: 14px; color: #3b3a44; } .duel-top .info b { color: #1b8a4a; }
  .duel-btns { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; min-height: 42px; }
  .duel-btns .wbtn { font-size: 15px; padding: 10px 18px; }
  .duel-help { font-size: 12px; color: #6a6880; text-align: center; margin-top: 6px; }
  .duel .ladder .rung.on { border-color: #e6b23a; background: #fff8e1; }`;
document.head.appendChild(css);

function render(b) {
  body = b;
  if (run) return renderTable();
  renderBetScreen();
}
function renderBetScreen() {
  stopLoop();
  const S = N.S, st = stats();
  if (chosenBet > S.money) chosenBet = BETS.filter(x => x <= S.money).pop() || BETS[0];
  body.innerHTML = `<div class="casino duel"><button class="back" id="duBack">← All games</button><h3>🤠 Duel</h3>
    <p>High noon. You get a six-shooter and <b>one bullet</b>. The empty cylinder spins: click a chamber as it whips past to drop your bullet in. Catch the <span style="color:#1b8a4a;font-weight:800">green</span> chamber and it fires on the first trigger pull; a <span style="color:#b8860b;font-weight:800">yellow</span> one next to it takes two; <span style="color:#c43a3a;font-weight:800">red</span> ones take three or four. Once loaded, the cylinder always stops with the green chamber under the hammer. Then click the <b>hammer</b> to cock and the <b>trigger</b> to fire, again and again until it goes bang. Shoot before they do.</p>
    <div class="bets">${BETS.map(x => `<button data-bet="${x}" class="${x === chosenBet ? 'on' : ''}" ${x > S.money ? 'disabled' : ''}>$${x}</button>`).join('')}</div>
    <div class="ladder">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<div class="rung">Win ${n}<b>×${mult(n)}</b>${usd(chosenBet * mult(n))}<br><span style="font-size:10px">${timeLimit(n).toFixed(1)}s</span></div>`).join('')}</div>
    <p style="font-size:12px">Each opponent draws faster (the seconds under each rung). Cash out after any win, or keep dueling for a bigger payout. Lose a duel and the house keeps your bet. Past 10 wins, each win adds ×1.3.</p>
    <button class="wbtn gold" id="duGo" ${S.money < chosenBet ? 'disabled' : ''} style="font-size:16px;padding:12px 20px">Bet ${usd(chosenBet)} and duel</button>
    <p style="font-size:12px;margin-top:12px">Duels played <b>${st.runs}</b> · Best streak <b>${st.best}</b> · Wagered <b>${usd(st.wagered)}</b> · Won <b>${usd(st.won)}</b></p></div>`;
  body.querySelectorAll('[data-bet]').forEach(x => x.onclick = () => { chosenBet = +x.dataset.bet; renderBetScreen(); });
  body.querySelector('#duBack').onclick = () => N.casinoLobby();
  body.querySelector('#duGo').onclick = () => startRun(chosenBet);
}
function startRun(bet) {
  const S = N.S; if (S.money < bet) return;
  N.addMoney(-bet, 'Duel bet');
  const st = stats(); st.runs++; st.wagered += bet; N.save();
  run = { bet, level: 1, wins: 0 };
  newDuel(1);
  renderTable();
}
function renderTable() {
  body.innerHTML = `<div class="duel"><div class="duel-top"><span class="info" id="duInfo"></span><button class="wbtn" id="duLeave" style="background:#ff5f57">Walk away</button></div>
    <canvas id="duCanvas" width="${W}" height="${H}"></canvas><div class="duel-btns" id="duBtns"></div>
    <div class="duel-help">Click the green chamber to load · click the <b>hammer</b> (or <b>C</b> / right-click) to cock · click the <b>trigger</b> (or <b>Space</b>) to fire</div></div>`;
  cv = body.querySelector('#duCanvas'); g = cv.getContext('2d');
  cv.addEventListener('pointerdown', onPointer);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  body.querySelector('#duLeave').onclick = leave;
  updateInfo(); updateButtons();
  startLoop();
}
function updateInfo() {
  const el = body && body.querySelector('#duInfo'); if (!el || !run) return;
  el.innerHTML = `Duel ${run.level} · Bet ${usd(run.bet)} · ${run.wins ? `Cash out now: <b>${usd(run.bet * mult(run.wins))}</b>` : 'No wins yet'}`;
}
function updateButtons() {
  const el = body && body.querySelector('#duBtns'); if (!el) return;
  const key = duel ? duel.phase + (duel.phase === 'won' ? duel.t > 1.2 : duel.phase === 'dead' ? duel.t > 1.6 : '') + run?.wins : 'none';
  if (el.dataset.key === key) return; // only rebuild when something changed, or clicks get eaten
  el.dataset.key = key;
  if (duel && duel.phase === 'won' && duel.t > 1.2) {
    el.innerHTML = `<button class="wbtn gold" id="duCash">Cash out ${usd(run.bet * mult(run.wins))}</button><button class="wbtn" id="duNext">Next duel (×${mult(run.wins + 1)}, ${timeLimit(run.level + 1).toFixed(1)}s)</button>`;
    el.querySelector('#duCash').onclick = cashOut; el.querySelector('#duNext').onclick = nextDuel;
  } else if (duel && duel.phase === 'dead' && duel.t > 1.6) {
    el.innerHTML = `<button class="wbtn gold" id="duAgain">Play again</button><button class="wbtn" id="duBack2">Back to bets</button>`;
    el.querySelector('#duAgain').onclick = () => { run = null; startRun(Math.min(chosenBet, N.S.money) >= BETS[0] ? chosenBet : BETS[0]); };
    el.querySelector('#duBack2').onclick = () => { run = null; duel = null; renderBetScreen(); };
  } else el.innerHTML = '';
}
function cashOut() {
  const amt = Math.round(run.bet * mult(run.wins)), st = stats();
  N.addMoney(amt, `Duel: cashed out after ${run.wins} win${run.wins > 1 ? 's' : ''}`);
  st.won += amt; st.best = Math.max(st.best, run.wins); N.save();
  N.toast(`You walk away ${usd(amt)} richer.`, 'good');
  run = null; duel = null; renderBetScreen();
}
function nextDuel() { run.level++; newDuel(run.level); updateInfo(); updateButtons(); }
function leave() {
  if (!run) return renderBetScreen();
  if (duel && duel.phase === 'won') return cashOut();
  if (duel && duel.phase === 'dead') { run = null; duel = null; return renderBetScreen(); }
  // walking away mid-standoff = you lose the bet
  N.toast('You turn your back on a duel. The house keeps your bet.', 'bad');
  const st = stats(); st.best = Math.max(st.best, run.wins); N.save();
  run = null; duel = null; renderBetScreen();
}

// ---------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------
function canvasXY(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
const chamberPos = (i, rot) => { const a = (i * 60 + rot * 60) * Math.PI / 180; return [CYL.x + Math.sin(a) * CYL.r, CYL.y - Math.cos(a) * CYL.r]; };
// how many trigger pulls a chamber at this angle needs: 0 steps from the barrel = 1 pull
// the colours belong to the chambers, not the barrel: one chamber is green, its neighbours yellow, the rest red.
// pulls needed = how far your chamber is from the green one + 1 (the cylinder always stops with green at the barrel)
function ringK(i) { const k = ((i - duel.green) % 6 + 6) % 6; return Math.min(k, 6 - k); }
function onPointer(e) {
  if (!duel) return;
  e.preventDefault();
  if (duel.phase !== 'duel') return;
  if (e.button === 2) return cock();
  const [x, y] = canvasXY(e);
  if (duel.loaded < 0) {
    for (let i = 0; i < 6; i++) { const [cx, cy] = chamberPos(i, duel.rot); if (Math.hypot(x - cx, y - cy) < 24) return load(i); }
  }
  if (inBox(x, y, HAMMER.box)) return cock();
  if (inBox(x, y, TRIGGER.box)) { if (!duel.cocked && duel.loaded >= 0) { duel.msg = 'Cock the hammer first'; duel.msgT = 0.7; } return fire(); }
}
document.addEventListener('keydown', e => {
  if (!duel || duel.phase !== 'duel' || !cv || !document.body.contains(cv) || !visible()) return;
  if (e.code === 'KeyC') { cock(); e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'KeyF') { if (duel.loaded >= 0) { if (duel.cocked) fire(); else cock(); } e.preventDefault(); e.stopPropagation(); }
}, true);
function load(i) {
  const k = ringK(i);
  duel.loaded = i; duel.pulls = k + 1;
  // spin on and coast to a stop with the green chamber under the barrel (at least most of a turn)
  const base = -duel.green; let to = base + 6 * Math.ceil((duel.rot - base) / 6);
  if (to - duel.rot < 3) to += 6;
  duel.settle = { from: duel.rot, to, t: 0, dur: 0.35 + (to - duel.rot) * 0.05 };
  const slot = ((i - duel.green) % 6 + 6) % 6; // where the bullet ends up relative to the barrel
  duel.dir = slot <= 3 ? -1 : 1;
  duel.msg = k === 0 ? 'Perfect!' : k === 1 ? 'Close: 2 pulls' : `${k + 1} pulls…`; duel.msgT = 1.1;
  sfx.load();
}
function cock() {
  if (duel.loaded < 0) { duel.msg = 'Load the bullet first'; duel.msgT = 0.8; return; }
  if (duel.cocked || duel.step > 0 || duel.settle) return; // can't cock while the cylinder is still spinning down
  duel.cocked = true; duel.hammer = 1; sfx.cock();
  if (!duel.meDraw) duel.meDraw = 0.001;
}
function fire() {
  if (!duel.cocked || duel.step > 0 || duel.settle) return;
  duel.cocked = false; duel.hammer = 0; duel.pulls--; duel.pullAnim = 1;
  if (duel.pulls <= 0) {
    duel.phase = 'won'; duel.t = 0; duel.flash = 1; duel.shake = 14; sfx.bang();
    run.wins++; setTimeout(sfx.win, 650); updateInfo();
  } else {
    sfx.click(); duel.msg = 'click'; duel.msgT = 0.5;
    duel.step = 0.0001; duel.stepFrom = duel.rot; duel.stepTo = duel.rot + duel.dir; // turn the next chamber toward the barrel
  }
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const visible = () => body && body.closest('.win') && body.closest('.win').classList.contains('show') && N.casinoView === 'duel' && document.getElementById('pc').classList.contains('show');
function startLoop() { stopLoop(); lastT = performance.now(); const tick = now => { raf = requestAnimationFrame(tick); frame(Math.min(0.05, (now - lastT) / 1000)); lastT = now; }; raf = requestAnimationFrame(tick); }
function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
function frame(dt) {
  if (!duel || !cv || !document.body.contains(cv)) { stopLoop(); return; }
  if (!visible()) { // closed the PC / left the casino mid-standoff
    if (run && duel.phase === 'won') cashOut(); else if (run && duel.phase !== 'dead') leave(); else { run = null; duel = null; }
    stopLoop(); return;
  }
  fit(); update(dt); draw();
}
// keep the whole board on screen: as wide as fits without pushing the buttons out of the window
function fit() {
  const avail = body.clientHeight - 36 - 110, w = Math.max(320, Math.min(body.clientWidth - 36, avail * 16 / 9));
  if (Math.abs(cv.offsetWidth - w) > 2) cv.style.width = w + 'px';
}
function update(dt) {
  const d = duel; d.t += dt; d.msgT = Math.max(0, d.msgT - dt); d.flash = Math.max(0, d.flash - dt * 4); d.foeFlash = Math.max(0, d.foeFlash - dt * 4); d.shake = Math.max(0, d.shake - dt * 30); d.pullAnim = Math.max(0, (d.pullAnim || 0) - dt * 5); d.hamAnim = (d.hamAnim || 0) + ((d.cocked ? 1 : 0) - (d.hamAnim || 0)) * Math.min(1, dt * 22);
  d.tumble += dt * 90; if (d.tumble > W + 120) d.tumble = -120 - Math.random() * 600;
  if (d.phase === 'intro' && d.t > 2.0) { d.phase = 'count'; d.t = 0; }
  else if (d.phase === 'count') {
    const k = Math.floor(d.t / 0.7); if (k > d.ticked && k < 3) { d.ticked = k; sfx.tick(); }
    if (d.t > 2.1) { d.phase = 'duel'; d.t = 0; tone(220, 0.25, 'sawtooth', 0.06); }
  } else if (d.phase === 'duel') {
    if (d.loaded < 0) d.rot += d.spin * dt;
    if (d.settle) { const st = d.settle; st.t += dt / st.dur; const k = Math.min(1, st.t), e = 1 - Math.pow(1 - k, 3); d.rot = st.from + (st.to - st.from) * e; if (k >= 1) { d.rot = st.to; d.settle = null; } }
    if (d.step > 0) { d.step += dt / 0.12; const k = Math.min(1, d.step); d.rot = d.stepFrom + (d.stepTo - d.stepFrom) * k; if (k >= 1) d.step = 0; }
    if (d.meDraw) d.meDraw = Math.min(1, d.meDraw + dt * 6);
    if (d.t > d.limit - 0.45) d.aiDraw = Math.min(1, d.aiDraw + dt * 4);
    if (d.t >= d.limit) { // they fire first
      d.phase = 'dead'; d.t = 0; d.foeFlash = 1; d.shake = 12; sfx.far(); setTimeout(sfx.lose, 700);
      const st = stats(); st.best = Math.max(st.best, run.wins); N.save();
    }
  } else if (d.phase === 'won') { d.foeDead = Math.min(1, d.foeDead + dt * 1.6); d.meDraw = 1; if (d.t > 1.2) updateButtons(); }
  else if (d.phase === 'dead') { d.meDead = Math.min(1, d.meDead + dt * 1.6); d.aiDraw = 1; if (d.t > 1.6) updateButtons(); }
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function sky(level) {
  const k = ((level - 1) % 10) / 9; // noon → sunset → dusk as you climb
  const top = mix('#6fb6ff', '#2a1d4a', k), bot = mix('#ffe7b0', '#ff7a4a', Math.min(1, k * 1.4));
  return { top, bot, sunY: 120 + k * 200, sunC: mix('#fff6c8', '#ff8a3a', k), k };
}
function mix(a, b, t) { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const c = [16, 8, 0].map(s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t)); return `rgb(${c.join(',')})`; }
function draw() {
  const d = duel, sk = sky(d.level);
  g.save();
  if (d.shake) g.translate((Math.random() - 0.5) * d.shake, (Math.random() - 0.5) * d.shake);
  // sky, sun, mesas, ground
  let gr = g.createLinearGradient(0, 0, 0, GROUND); gr.addColorStop(0, sk.top); gr.addColorStop(1, sk.bot); g.fillStyle = gr; g.fillRect(-20, -20, W + 40, GROUND + 20);
  g.fillStyle = sk.sunC; g.beginPath(); g.arc(W / 2, sk.sunY, 42, 0, 7); g.fill();
  g.fillStyle = mix('#b8643a', '#3a2030', sk.k);
  g.beginPath(); g.moveTo(-20, GROUND); g.lineTo(-20, 300); g.lineTo(60, 300); g.lineTo(80, 270); g.lineTo(190, 270); g.lineTo(215, 310); g.lineTo(260, 330); g.lineTo(340, 330); g.lineTo(360, GROUND); g.fill();
  g.beginPath(); g.moveTo(600, GROUND); g.lineTo(640, 320); g.lineTo(700, 320); g.lineTo(720, 285); g.lineTo(860, 285); g.lineTo(880, 312); g.lineTo(W + 20, 312); g.lineTo(W + 20, GROUND); g.fill();
  gr = g.createLinearGradient(0, GROUND, 0, H); gr.addColorStop(0, mix('#d9a066', '#6a4030', sk.k)); gr.addColorStop(1, mix('#b07840', '#3a2418', sk.k)); g.fillStyle = gr; g.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
  cactus(150, GROUND + 4, 0.8, sk.k); cactus(830, GROUND + 2, 1.0, sk.k);
  tumbleweed(d.tumble, GROUND - 8, d.t);
  // the two gunslingers
  const me = myLook();
  slinger(250, GROUND + 6, 1, me, { draw: d.meDraw, dead: d.meDead, flash: d.flash });
  slinger(710, GROUND + 6, -1, d.foe, { draw: d.aiDraw, dead: d.foeDead, flash: d.foeFlash });
  g.restore();
  // UI
  if (d.phase === 'intro') { card(`DUEL ${d.level}`, d.foe.name, `"${d.foe.title}" · ${d.limit.toFixed(1)} seconds`); }
  else if (d.phase === 'count') { bigText(d.t < 0.7 ? 'Ready…' : d.t < 1.4 ? 'Steady…' : '', '#fff'); }
  else if (d.phase === 'duel') { if (d.t < 0.6) bigText('DRAW!', '#ffdd55'); timer(d); }
  else if (d.phase === 'won') { bigText(d.t > 0.4 ? 'YOU WIN' : '', '#7dff9a'); }
  else if (d.phase === 'dead') { bigText(d.t > 0.4 ? 'TOO SLOW' : '', '#ff6b6b'); }
  panel(); cylinder(d);
  if (d.msgT > 0) { g.globalAlpha = Math.min(1, d.msgT * 2); g.font = '800 18px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#0008'; g.lineWidth = 4; g.strokeText(d.msg, CYL.x, CYL.y - CYL.r - 46); g.fillText(d.msg, CYL.x, CYL.y - CYL.r - 46); g.globalAlpha = 1; }
}
function myLook() {
  const c = (N.S && N.S.char) || {};
  return { hat: 'cowboy', hatC: '#6b4426', skin: c.skin || '#e0b090', shirt: c.topColor || '#3a6ea5', vest: '#4a3626', pants: c.bottomColor || '#3a3a50', face: [], me: true };
}
function card(top, name, sub) {
  g.fillStyle = '#000a'; g.fillRect(W / 2 - 230, 118, 460, 120);
  g.strokeStyle = '#e6b23a'; g.lineWidth = 2; g.strokeRect(W / 2 - 230, 118, 460, 120);
  g.textAlign = 'center'; g.fillStyle = '#e6b23a'; g.font = '900 16px system-ui, sans-serif'; g.fillText(top, W / 2, 146);
  g.fillStyle = '#fff'; g.font = '900 34px Georgia, serif'; g.fillText(name, W / 2, 190);
  g.fillStyle = '#ddd'; g.font = 'italic 15px Georgia, serif'; g.fillText(sub, W / 2, 220);
}
function bigText(t, col) { if (!t) return; g.textAlign = 'center'; g.font = '900 64px Georgia, serif'; g.lineWidth = 8; g.strokeStyle = '#000a'; g.strokeText(t, W / 2, 190); g.fillStyle = col; g.fillText(t, W / 2, 190); }
function timer(d) {
  const left = Math.max(0, d.limit - d.t), f = left / d.limit, w = 300;
  g.fillStyle = '#0008'; g.fillRect(W / 2 - w / 2 - 4, 20, w + 8, 22);
  g.fillStyle = f > 0.5 ? '#7dff9a' : f > 0.25 ? '#ffd23a' : '#ff5050'; g.fillRect(W / 2 - w / 2, 24, w * f, 14);
  g.fillStyle = '#fff'; g.font = '800 13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`${left.toFixed(1)}s`, W / 2, 60);
}
const RING = ['#3ddc84', '#ffd23a', '#ff5050', '#ff5050'];
function panel() {
  g.fillStyle = '#2a1a10cc'; g.strokeStyle = '#7a5530'; g.lineWidth = 2;
  g.beginPath(); g.roundRect ? g.roundRect(232, 408, 496, 126, 14) : g.rect(232, 408, 496, 126); g.fill(); g.stroke();
}
// which control you should be pressing right now glows
function glow(on) { if (on) { g.shadowColor = '#ffd23a'; g.shadowBlur = 14 + 8 * Math.sin(performance.now() / 120); } else g.shadowBlur = 0; }
function controls(d) {
  const live = d.phase === 'duel', loaded = d.loaded >= 0, ready = live && loaded && !d.settle;
  // ---- hammer (side profile, gun points right; cocking pulls it back) ----
  const hx = HAMMER.x, hy = HAMMER.y;
  g.fillStyle = '#4a4c52'; g.fillRect(hx - 44, hy - 4, 88, 22); g.fillStyle = '#3a3c42'; g.fillRect(hx + 30, hy - 14, 18, 32); // frame
  g.save(); g.translate(hx, hy); g.rotate(-0.95 * (d.hamAnim || 0));
  glow(ready && !d.cocked);
  g.fillStyle = d.cocked ? '#c9cbd1' : '#8a8d94';
  g.beginPath(); g.moveTo(-8, 4); g.lineTo(8, 4); g.lineTo(10, -40); g.quadraticCurveTo(6, -62, -14, -70); g.lineTo(-30, -66); g.quadraticCurveTo(-12, -58, -10, -42); g.closePath(); g.fill();
  g.shadowBlur = 0; g.strokeStyle = '#2a2c30'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#5a5c62'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-26 + i * 4, -66 + i * 1); g.lineTo(-18 + i * 4, -72 + i * 1); g.stroke(); } // knurled spur
  g.fillStyle = '#2a2c30'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill();
  g.restore();
  label(hx, 528, d.cocked ? 'COCKED' : 'HAMMER', ready && !d.cocked);
  // ---- trigger + guard ----
  const tx = TRIGGER.x, ty = TRIGGER.y;
  g.fillStyle = '#4a4c52'; g.fillRect(tx - 52, ty - 16, 104, 18); // frame
  g.strokeStyle = '#6a6c72'; g.lineWidth = 6; g.beginPath(); g.moveTo(tx + 40, ty); g.quadraticCurveTo(tx + 44, ty + 50, tx - 4, ty + 48); g.quadraticCurveTo(tx - 40, ty + 46, tx - 44, ty + 2); g.stroke(); // guard
  g.save(); g.translate(tx + 6, ty); g.rotate(-0.4 * (d.pullAnim || 0)); // pulled back toward the grip when fired
  glow(ready && d.cocked);
  g.fillStyle = d.cocked ? '#e6c25a' : '#9a9da4';
  g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.quadraticCurveTo(6, 22, -6, 38); g.quadraticCurveTo(-12, 36, -10, 32); g.quadraticCurveTo(-2, 20, -5, 0); g.closePath(); g.fill();
  g.shadowBlur = 0; g.strokeStyle = '#2a2c30'; g.lineWidth = 2; g.stroke();
  g.restore();
  label(tx, 528, 'TRIGGER', ready && d.cocked);
  // status line under the cylinder
  g.font = '800 13px system-ui, sans-serif'; g.textAlign = 'center';
  if (live && !loaded) { g.fillStyle = '#7dff9a'; g.fillText('Click the green chamber!', CYL.x, 528); }
  else if (live && loaded) { g.fillStyle = '#ffd23a'; g.fillText(d.settle ? 'Spinning…' : `${d.pulls} pull${d.pulls > 1 ? 's' : ''} to go`, CYL.x, 528); }
}
function label(x, y, t, on) { g.font = '900 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = on ? '#ffd23a' : '#c8b8a0'; g.fillText(t, x, y); }
function cylinder(d) {
  const { x, y, r } = CYL;
  g.save();
  // barrel marker
  g.fillStyle = '#2a2a2e'; g.fillRect(x - 9, y - r - 38, 18, 20);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x - 7, y - r - 15); g.lineTo(x + 7, y - r - 15); g.lineTo(x, y - r - 6); g.closePath(); g.fill();
  // cylinder body
  g.fillStyle = '#5c5f66'; g.strokeStyle = '#2a2c30'; g.lineWidth = 3;
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * 60 + 30 + d.rot * 60) * Math.PI / 180; g.arc(x + Math.sin(a) * r * 0.86, y - Math.cos(a) * r * 0.86, r * 0.42, 0, 7); } g.fill();
  g.beginPath(); g.arc(x, y, r + 6, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#3a3c42'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
  for (let i = 0; i < 6; i++) {
    const [cx, cy] = chamberPos(i, d.rot), k = ringK(i), loaded = d.loaded === i;
    g.fillStyle = '#141416'; g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.fill();
    if (loaded) { g.fillStyle = '#d9a640'; g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.fill(); g.fillStyle = '#b07a20'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill(); }
    if (d.phase === 'duel' || d.phase === 'count') { g.strokeStyle = RING[k]; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 19, 0, 7); g.stroke(); }
  }
  g.restore();
  controls(d);

}
function cactus(x, y, s, k) {
  g.fillStyle = mix('#4a8a3a', '#1f3a22', k);
  g.fillRect(x - 8 * s, y - 70 * s, 16 * s, 70 * s);
  g.fillRect(x - 26 * s, y - 50 * s, 10 * s, 26 * s); g.fillRect(x - 26 * s, y - 30 * s, 20 * s, 8 * s);
  g.fillRect(x + 16 * s, y - 60 * s, 10 * s, 24 * s); g.fillRect(x + 6 * s, y - 40 * s, 20 * s, 8 * s);
}
function tumbleweed(x, y, t) {
  g.save(); g.translate(x, y + Math.abs(Math.sin(t * 4)) * -10); g.rotate(t * 5);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(0, 0, 14, 7, i * 0.45, 0, 7); g.stroke(); }
  g.restore();
}
// side-profile gunslinger. dir 1 = faces right. s.draw 0..1 (arm comes up), s.dead 0..1 (falls back)
function slinger(x, y, dir, c, s) {
  const sc = 1.32 * (c.big || 1);
  g.save(); g.translate(x, y); g.scale(dir * sc, sc);
  g.rotate(-s.dead * 1.45); // fall backwards
  if (c.ghost) g.globalAlpha = 0.82;
  const P = (col, ...r) => { g.fillStyle = col; g.fillRect(...r); };
  // shadow
  g.save(); g.rotate(s.dead * 1.45); g.fillStyle = '#0003'; g.beginPath(); g.ellipse(0, 0, 34, 6, 0, 0, 7); g.fill(); g.restore();
  // legs + boots
  P(c.pants, -12, -72, 11, 68); P(shade(c.pants, 0.85), 2, -72, 11, 68);
  P('#3a2416', -14, -8, 18, 9); P('#2e1c10', 0, -8, 20, 9); P('#b8b8b8', 18, -4, 3, 3);
  // torso + vest / poncho
  P(c.shirt, -15, -128, 30, 60);
  if (c.face.includes('poncho')) { g.fillStyle = c.vest; g.beginPath(); g.moveTo(-22, -122); g.lineTo(22, -122); g.lineTo(28, -78); g.lineTo(-28, -78); g.closePath(); g.fill();
    g.fillStyle = shade(c.vest, 1.3); for (let i = 0; i < 4; i++) g.fillRect(-26 + i * 14, -92, 8, 4); }
  else { P(c.vest, -15, -126, 12, 54); P(c.vest, 5, -126, 10, 54); }
  if (c.face.includes('collar')) P('#ffffff', 10, -128, 6, 6);
  if (c.face.includes('badge')) { g.fillStyle = '#e6b23a'; star(8, -110, 6); }
  P('#3a2416', -16, -76, 32, 7); P('#c9a24a', 8, -75, 6, 5); // belt + buckle
  // holster at the hip
  P('#5a3a22', 6, -74, 9, 22);
  // back arm (hangs)
  P(shade(c.shirt, 0.8), -10, -124, 10, 44); P(c.skin, -10, -82, 9, 9);
  // gun arm: from hanging at the hip to straight out
  const a = (1 - s.draw) * Math.PI / 2;
  g.save(); g.translate(4, -120); g.rotate(a * 1.05); // a = π/2 hangs down by the holster, 0 = aimed straight ahead
  P(c.shirt, 0, -6, 34, 12); P(c.skin, 32, -5, 9, 10);
  if (s.draw > 0.05) { P('#2a2a2e', 36, -10, 26, 7); P('#3a3a40', 34, -6, 8, 12); P('#6a4a2a', 33, -1, 6, 10); } // revolver in hand
  if (s.flash > 0) { g.fillStyle = `rgba(255,220,90,${s.flash})`; g.beginPath(); g.moveTo(62, -7); g.lineTo(92, -18); g.lineTo(84, -6); g.lineTo(96, 4); g.lineTo(62, -3); g.closePath(); g.fill(); }
  g.restore();
  if (s.draw <= 0.05) P('#2a2a2e', 8, -66, 6, 14); // gun still holstered
  // head (profile) + face
  P(c.skin, -6, -146, 7, 10); // neck
  g.fillStyle = c.skin; g.beginPath(); g.ellipse(0, -158, 13, 15, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(11, -160); g.lineTo(18, -154); g.lineTo(11, -151); g.closePath(); g.fill(); // nose
  if (c.face.includes('patch')) { P('#111', 2, -166, 9, 7); P('#111', -12, -168, 22, 2); } else { P('#111', 5, -164, 3, 3); P('#0006', 3, -168, 8, 2); }
  if (c.face.includes('mustache')) P(c.me ? '#4a3020' : '#3a2416', 6, -150, 12, 4);
  if (c.face.includes('beard')) { g.fillStyle = '#4a3020'; g.beginPath(); g.moveTo(-6, -152); g.lineTo(14, -150); g.lineTo(6, -136); g.lineTo(-6, -140); g.closePath(); g.fill(); }
  if (c.face.includes('stubble')) { g.fillStyle = '#0002'; g.fillRect(-2, -152, 14, 8); }
  if (c.face.includes('lips')) P('#c0304a', 9, -149, 5, 3);
  if (c.face.includes('cigar')) { P('#6a4a2a', 12, -149, 12, 3); P('#ff6a2a', 24, -149, 2, 3); }
  if (c.face.includes('braid')) { g.fillStyle = '#2a1a10'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-12, -150 + i * 9, 4, 0, 7); g.fill(); } }
  hat(c);
  g.restore();
}
function hat(c) {
  const P = (col, ...r) => { g.fillStyle = col; g.fillRect(...r); };
  const h = c.hatC;
  if (c.hat === 'cowboy') { g.fillStyle = h; g.beginPath(); g.ellipse(0, -170, 27, 5, 0, 0, 7); g.fill(); P(h, -12, -190, 24, 20); P(shade(h, 0.7), -12, -176, 24, 4); g.fillStyle = shade(h, 0.85); g.fillRect(-4, -192, 8, 5); }
  else if (c.hat === 'sombrero') { g.fillStyle = h; g.beginPath(); g.ellipse(0, -170, 42, 7, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(-12, -170); g.lineTo(-6, -200); g.lineTo(6, -200); g.lineTo(12, -170); g.closePath(); g.fill(); P('#c0503a', -12, -178, 24, 4); }
  else if (c.hat === 'top') { g.fillStyle = h; g.beginPath(); g.ellipse(0, -170, 20, 4, 0, 0, 7); g.fill(); P(h, -11, -206, 22, 36); P('#5a1a1a', -11, -178, 22, 5); }
  else if (c.hat === 'flat') { g.fillStyle = h; g.beginPath(); g.ellipse(0, -170, 30, 4, 0, 0, 7); g.fill(); P(h, -12, -182, 24, 12); }
  else if (c.hat === 'feather') { g.fillStyle = h; g.beginPath(); g.ellipse(0, -170, 24, 5, 0, 0, 7); g.fill(); P(h, -11, -186, 22, 16); g.strokeStyle = '#ff6ac0'; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, -184); g.quadraticCurveTo(-26, -206, -12, -214); g.stroke(); }
  else if (c.hat === 'bandana') { P(h, -14, -174, 27, 8); g.fillStyle = h; g.beginPath(); g.moveTo(-14, -170); g.lineTo(-24, -162); g.lineTo(-14, -164); g.closePath(); g.fill(); g.fillStyle = '#2a1a10'; g.beginPath(); g.ellipse(-2, -168, 14, 6, 0, Math.PI, 0); g.fill(); }
}
function star(x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.min(255, Math.round(((n >> s) & 255) * k))).join(',')})`; }

N.casinoAddGame({ id: 'duel', icon: '🤠', name: 'Duel', desc: 'High-noon showdowns. One bullet, a spinning cylinder, and no time to think.', grad: 'linear-gradient(135deg,#d9822b,#5a2a12)', render });

window.__duel = { get duel() { return duel; }, get run() { return run; }, load, cock, fire, ringK, FOES, timeLimit };
})();
