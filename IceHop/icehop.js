// Pogey Life — Ice Hop: a PogeyCasino game. Bet, then hop your penguin from ice floe to ice floe. Every floe carries a
// bigger multiplier, and every hop has a fixed chance that the ice breaks and the penguin goes for a swim (bet lost).
// Cash out on any floe you're standing on. Odds: each multiplier = 0.97 / (survival chance ^ hops), so every cash-out
// point is worth the same on average (a 3% house edge), whatever difficulty you pick.
//
// One file, two homes:
//   - inside Pogey Life (loaded by NEETLIFE/index.html as ../IceHop/icehop.js): a PogeyCasino game using in-game money
//   - stand-alone (IceHop/index.html): its own play-money wallet saved in the browser
(() => {
'use strict';
const N = window.POGEY && window.POGEY.casinoAddGame ? window.POGEY : null;
const STANDALONE = !N && !!document.getElementById('iceHopApp');
if (!N && !STANDALONE) return;

// ---------------------------------------------------------------------
// Rules + odds
// ---------------------------------------------------------------------
const BETS = [10, 25, 50, 100, 250, 500];
const RTP = 0.97;
const MODES = {
  easy:   { name: 'Easy',   p: 0.9,      steps: 24, odds: '1 in 10', col: '#3ad66b' },
  medium: { name: 'Medium', p: 0.8,      steps: 16, odds: '1 in 5',  col: '#ffc23a' },
  hard:   { name: 'Hard',   p: 2 / 3,    steps: 10, odds: '1 in 3',  col: '#ff5a4a' },
};
const multAt = (mode, n) => n <= 0 ? 1 : Math.floor(RTP / Math.pow(MODES[mode].p, n) * 100) / 100;
const usd = n => '$' + Math.round(n).toLocaleString();
// custom bets: any whole amount from $1 to $MAX_BET (and no more than you have)
const MAX_BET = 500;
function customBetBox(chosen, presets) {
  const c = !presets.includes(chosen);
  return `<label class="cbet ${c ? 'on' : ''}" title="Any amount from $1 to $${MAX_BET}">Custom $<input type="number" min="1" max="${MAX_BET}" step="1" inputmode="numeric" value="${c ? chosen : ''}" placeholder="1–${MAX_BET}"></label><span class="cbet-msg"></span>`;
}
function wireCustomBet(root, money, apply) {
  const inp = root.querySelector('.cbet input'), msg = root.querySelector('.cbet-msg'); if (!inp) return;
  const check = () => {
    const raw = inp.value.trim(); if (!raw) { msg.textContent = ''; return null; }
    const v = Math.floor(+raw), have = Math.floor(money());
    const err = !(v >= 1) ? 'The smallest bet is $1.' : v > MAX_BET ? `The biggest bet is $${MAX_BET}.` : v > have ? `You only have $${have.toLocaleString()}.` : '';
    msg.textContent = err; return err ? null : v;
  };
  inp.oninput = check;
  let done = false; // Enter and the blur that follows both fire: apply once
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
  inp.onchange = () => { const v = check(); if (v && !done) { done = true; setTimeout(() => apply(v), 0); } };
}
const fmtM = m => '×' + (m >= 100 ? Math.round(m).toLocaleString() : m >= 10 ? m.toFixed(1) : m.toFixed(2));
// the "host": where money, stats and saving live
const START_CHIPS = 1000;
const host = N ? {
  money: () => N.S.money,
  add: (amt, desc) => N.addMoney(amt, desc),
  store: () => N.S,
  save: () => N.save(),
  passTime: mins => { N.advance(mins); N.updateHUD(); },
  toast: (msg, kind) => N.toast(msg, kind),
  lobby: () => N.casinoLobby(),
  visible: () => body && body.closest('.win') && body.closest('.win').classList.contains('show') && N.casinoView === 'icehop' && document.getElementById('pc').classList.contains('show'),
  paused: () => N.paused,
} : (() => {
  const KEY = 'icehop_wallet_v1';
  let w = null; try { w = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!w || typeof w.money !== 'number') w = { money: START_CHIPS };
  const show = () => { const el = document.getElementById('ihBalance'); if (el) el.textContent = usd(w.money); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch (e) {} show(); };
  setTimeout(show, 0);
  return {
    money: () => w.money, add: amt => { w.money = Math.round(w.money + amt); save(); }, store: () => w, save, passTime: () => {},
    toast: (msg, kind) => { const t = document.createElement('div'); t.className = 'ih-toast ' + (kind || ''); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); },
    lobby: null, visible: () => !!body && document.body.contains(body), paused: () => document.hidden,
    newGame: () => { w.money = START_CHIPS; w.games = (w.games || 1) + 1; save(); },
  };
})();
function fairRoll() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }

// ---------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------
let AC = null;
const ac = () => (AC = AC || new (window.AudioContext || window.webkitAudioContext)());
function tone(f, dur, type = 'triangle', vol = 0.05, slide) {
  try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02); } catch (e) {}
}
function noise(dur, vol, freq = 1200) {
  try { const a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start(); } catch (e) {}
}
const sfx = {
  hop: () => tone(520, 0.12, 'square', 0.035, 900),
  land: k => { tone(330 + k * 25, 0.1, 'triangle', 0.05); noise(0.06, 0.05, 2500); },
  crack: () => { noise(0.25, 0.25, 3000); setTimeout(() => noise(0.15, 0.2, 1800), 90); },
  splash: () => { noise(0.7, 0.3, 900); tone(200, 0.4, 'sine', 0.05, 80); },
  cash: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.035), i * 70)),
};

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
const W = 960, H = 540, SEA = 360, GAP = 210, PENG_X = 250;
let body = null, cv = null, g = null, raf = 0, lastT = 0;
let chosenBet = 10, mode = 'medium', run = null;
function stats() { const S = host.store(); if (!S.iceStats) S.iceStats = { runs: 0, best: 0, wagered: 0, won: 0, bestMult: 1 }; return S.iceStats; }
// run: { bet, mode, step (floe you're on), phase: 'ready' | 'hop' | 'sink' | 'lost' | 'cashed', t, cam, sinkFloe, parts, coins }

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .icehop canvas { width: 100%; aspect-ratio: 16 / 9; display: block; margin: 0 auto; border-radius: 12px; background: #9fd3f0; user-select: none; }
  .ih-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .ih-top .info { font-weight: 800; font-size: 14px; color: #3b3a44; } .ih-top .info b { color: #1b8a4a; }
  .ih-btns { display: flex; gap: 10px; justify-content: center; margin-top: 10px; flex-wrap: wrap; min-height: 46px; }
  .ih-btns .wbtn { font-size: 16px; padding: 11px 22px; }
  .ih-btns .hop { background: #2a8bd8; color: #fff; min-width: 190px; letter-spacing: .5px; }
  .ih-btns .cash { min-width: 190px; }
  .ih-help { font-size: 12px; color: #6a6880; text-align: center; margin-top: 6px; }
  .ih-modes { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .ih-modes button { font: inherit; font-weight: 800; font-size: 13px; border: 2px solid #24223a; background: #fff; color: #24223a; border-radius: 10px; padding: 8px 14px; cursor: pointer; text-align: left; line-height: 1.3; }
  .ih-modes button span { display: block; font-size: 11px; font-weight: 700; color: #6a6880; }
  .ih-modes button.on { background: #24223a; color: #fff; } .ih-modes button.on span { color: #c9c4dd; }`;
document.head.appendChild(css);

function render(b) { body = b; if (run) return renderTable(); renderBetScreen(); }
function renderBetScreen() {
  stopLoop();
  if (!N && host.money() < 1) return renderGameOver();
  const S = { money: host.money() }, st = stats();
  if (chosenBet > S.money) chosenBet = S.money >= 1 ? (BETS.filter(x => x <= S.money).pop() || Math.floor(S.money)) : BETS[0];
  const ladder = Array.from({ length: 10 }, (_, i) => i + 1);
  body.innerHTML = `<div class="casino icehop"><button class="back" id="ihBack">← All games</button><h3>🐧 Ice Hop</h3>
    <p>Place a bet, then hop your penguin across the ice floes. Each floe pays a bigger multiplier, but every hop is a gamble: the ice might crack, and then it's a cold swim and the house keeps your bet. <b>Cash out</b> whenever you like, at the multiplier you're standing on.</p>
    <div class="ih-modes">${Object.entries(MODES).map(([k, m]) => `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${m.name}<span>${m.odds} floes break · up to ${fmtM(multAt(k, m.steps))}</span></button>`).join('')}</div>
    <div class="bets">${BETS.map(x => `<button data-bet="${x}" class="${x === chosenBet ? 'on' : ''}" ${x > S.money ? 'disabled' : ''}>$${x}</button>`).join('')}${customBetBox(chosenBet, BETS)}</div>
    <div class="ladder">${ladder.map(n => `<div class="rung">Floe ${n}<b>${fmtM(multAt(mode, n))}</b>${usd(chosenBet * multAt(mode, n))}</div>`).join('')}</div>
    <p style="font-size:12px">Chance of making it to floe 5 on ${MODES[mode].name}: ${Math.round(Math.pow(MODES[mode].p, 5) * 100)}% · floe 10: ${Math.round(Math.pow(MODES[mode].p, 10) * 100)}%. Every cash-out spot has the same 3% house edge.</p>
    <button class="wbtn gold" id="ihGo" ${S.money < chosenBet ? 'disabled' : ''} style="font-size:16px;padding:12px 20px">Bet ${usd(chosenBet)} and hop</button>

    <p style="font-size:12px;margin-top:12px">Runs <b>${st.runs}</b> · Furthest <b>${st.best} floe${st.best === 1 ? '' : 's'}</b> · Best cash-out <b>${fmtM(st.bestMult)}</b> · Wagered <b>${usd(st.wagered)}</b> · Won <b>${usd(st.won)}</b></p></div>`;
  body.querySelectorAll('[data-bet]').forEach(x => x.onclick = () => { chosenBet = +x.dataset.bet; renderBetScreen(); });
  body.querySelectorAll('[data-mode]').forEach(x => x.onclick = () => { mode = x.dataset.mode; renderBetScreen(); });
  if (host.lobby) body.querySelector('#ihBack').onclick = host.lobby; else body.querySelector('#ihBack').remove();
  wireCustomBet(body, host.money, v => { chosenBet = v; renderBetScreen(); });
  body.querySelector('#ihGo').onclick = () => startRun(chosenBet);
}
// stand-alone only: out of chips = game over, and a fresh wallet
function renderGameOver() {
  const st = stats();
  body.innerHTML = `<div class="casino" style="text-align:center;padding-top:40px"><div style="font-size:64px">🐧💦</div><h3 style="font-size:34px;margin:10px 0 4px">Game over</h3>
    <p>You're out of chips. Every penguin swims eventually.</p>
    <p style="font-size:13px">This wallet: <b>${st.runs}</b> runs · furthest <b>${st.best} floe${st.best === 1 ? '' : 's'}</b> · best cash-out <b>${fmtM(st.bestMult)}</b></p>
    <button class="wbtn gold" id="ihNewGame" style="font-size:17px;padding:12px 24px;margin-top:8px">Start a new game with ${usd(START_CHIPS)}</button></div>`;
  body.querySelector('#ihNewGame').onclick = newGame;
}
function newGame() {
  host.newGame(); const S = host.store(); S.iceStats = null; host.save();
  run = null; chosenBet = BETS[0]; host.toast(`New game! ${usd(START_CHIPS)} in your wallet.`, 'good'); renderBetScreen();
}
function startRun(bet) {
  if (host.money() < bet || !(bet >= 1 && bet <= MAX_BET)) return;
  host.add(-bet, `Ice Hop bet (${MODES[mode].name})`);
  const st = stats(); st.runs++; st.wagered += bet; host.save();
  run = { bet, mode, step: 0, phase: 'ready', t: 0, cam: 0, parts: [], coins: [], hop: null, sinkT: 0, shake: 0 };
  renderTable();
}
function renderTable() {
  body.innerHTML = `<div class="icehop"><div class="ih-top"><span class="info" id="ihInfo"></span><button class="wbtn" id="ihLeave" style="background:#ff5f57">Walk away</button></div>
    <canvas id="ihCanvas" width="${W}" height="${H}"></canvas><div class="ih-btns" id="ihBtns"></div>
    <div class="ih-help"><b>Space</b> or <b>H</b> hops · <b>C</b> cashes out</div></div>`;
  cv = body.querySelector('#ihCanvas'); g = cv.getContext('2d');
  body.querySelector('#ihLeave').onclick = leave;
  updateInfo(); updateButtons(true); startLoop();
}
const cur = () => multAt(run.mode, run.step);
function updateInfo() {
  const el = body && body.querySelector('#ihInfo'); if (!el || !run) return;
  const tail = run.phase === 'lost' || run.phase === 'sink' ? `<span style="color:#c43a3a">Splash! Lost ${usd(run.bet)}</span>` : run.phase === 'cashed' ? `Cashed out <b>${usd(run.won)}</b>` : run.step ? `Cash out now: <b>${usd(run.bet * cur())}</b>` : 'On the shore';
  el.innerHTML = `${MODES[run.mode].name} · Bet ${usd(run.bet)} · Floe ${run.step}/${MODES[run.mode].steps} · ${tail}`;
}
function updateButtons(force) {
  const el = body && body.querySelector('#ihBtns'); if (!el || !run) return;
  const key = run.phase + run.step;
  if (!force && el.dataset.key === key) return; // only rebuild when something changed, or clicks get eaten
  el.dataset.key = key;
  const M = MODES[run.mode];
  if (run.phase === 'ready' || run.phase === 'hop') {
    const busy = run.phase === 'hop', next = multAt(run.mode, run.step + 1);
    el.innerHTML = `<button class="wbtn hop" id="ihHop" ${busy ? 'disabled' : ''}>🐧 Hop → ${fmtM(next)}</button>
      <button class="wbtn gold cash" id="ihCash" ${busy || !run.step ? 'disabled' : ''}>${run.step ? `Cash out ${usd(run.bet * cur())}` : 'Cash out'}</button>`;
    el.querySelector('#ihHop').onclick = hop; el.querySelector('#ihCash').onclick = cashOut;
  } else if (run.phase === 'lost' && run.gameOver) {
    el.innerHTML = `<button class="wbtn gold" id="ihNewGame">Start a new game with ${usd(START_CHIPS)}</button>`;
    el.querySelector('#ihNewGame').onclick = newGame;
  } else if (run.phase === 'lost' || run.phase === 'cashed') {
    el.innerHTML = `<button class="wbtn gold" id="ihAgain">Play again (${usd(run.bet)})</button><button class="wbtn" id="ihBets">Change bet</button>`;
    el.querySelector('#ihAgain').onclick = () => { const b = run.bet, m = run.mode; run = null; mode = m; if (host.money() >= b) startRun(b); else renderBetScreen(); };
    el.querySelector('#ihBets').onclick = () => { run = null; renderBetScreen(); };
  } else el.innerHTML = `<button class="wbtn hop" disabled>🐧 …</button>`;
  void M;
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------
function hop() {
  if (!run || run.phase !== 'ready') return;
  const M = MODES[run.mode];
  run.hop = { from: run.step, to: run.step + 1, t: 0, safe: fairRoll() < M.p }; // decided the moment you jump
  run.phase = 'hop'; sfx.hop(); updateButtons();
}
function landed() {
  const h = run.hop;
  run.step = h.to;
  if (h.safe) {
    run.phase = 'ready'; sfx.land(run.step); run.squash = 1;
    for (let i = 0; i < 8; i++) run.parts.push({ x: floeX(run.step) + (Math.random() - 0.5) * 50, y: SEA - 8, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 80, t: 0, life: 0.5, c: '#ffffff', r: 2 + Math.random() * 2 });
    if (run.step >= MODES[run.mode].steps) { cashOut(true); return; } // end of the ice: take the lot
    updateInfo(); updateButtons();
  } else {
    run.phase = 'sink'; run.sinkT = 0; run.shake = 8; sfx.crack();
    updateInfo(); updateButtons();
  }
}
function cashOut(auto) {
  if (!run || run.phase !== 'ready' || !run.step) return;
  const m = cur(), amt = Math.round(run.bet * m), st = stats();
  host.add(amt, `Ice Hop: cashed out ${fmtM(m)} on floe ${run.step}`);
  st.won += amt; st.best = Math.max(st.best, run.step); st.bestMult = Math.max(st.bestMult, m);
  host.passTime(5 + run.step * 2); host.save();
  run.phase = 'cashed'; run.t = 0; run.won = amt; sfx.cash();
  for (let i = 0; i < 26; i++) run.coins.push({ x: PENG_X, y: SEA - 60, vx: (Math.random() - 0.5) * 420, vy: -250 - Math.random() * 260, t: 0, a: Math.random() * 6 });
  if (auto === true) host.toast(`You reached the last floe! Cashed out ${usd(amt)}.`, 'good');
  updateInfo(); updateButtons();
}
function lose() {
  const st = stats(); st.best = Math.max(st.best, run.step - 1);
  host.passTime(5 + run.step * 2); host.save();
  run.phase = 'lost'; run.t = 0; run.gameOver = !N && host.money() < 1; updateInfo(); updateButtons();
}
function leave() {
  if (!run) return renderBetScreen();
  if (run.phase === 'ready' && run.step) { cashOut(); run = null; return renderBetScreen(); }
  if (run.phase === 'ready' && !run.step) { // haven't hopped yet: get your bet back
    host.add(run.bet, 'Ice Hop: bet returned'); const st = stats(); st.runs--; st.wagered -= run.bet; host.save();
    run = null; return renderBetScreen();
  }
  if (run.phase === 'hop' || run.phase === 'sink') return; // mid-air: too late now
  run = null; renderBetScreen();
}
document.addEventListener('keydown', e => {
  if (!run || !cv || !document.body.contains(cv) || !visible()) return;
  if (e.code === 'Space' || e.code === 'KeyH') { hop(); e.preventDefault(); e.stopPropagation(); }
  else if (e.code === 'KeyC') { cashOut(); e.preventDefault(); e.stopPropagation(); }
}, true);

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const visible = () => host.visible();
function startLoop() { stopLoop(); lastT = performance.now(); const tick = now => { raf = requestAnimationFrame(tick); frame(Math.min(0.05, (now - lastT) / 1000)); lastT = now; }; raf = requestAnimationFrame(tick); }
function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
function frame(dt) {
  if (!run || !cv || !document.body.contains(cv)) { stopLoop(); return; }
  if (!visible()) { // closed the PC / left the casino: standing on a floe = cash out; mid-hop = let it play out then settle
    if (run.phase === 'hop') { landed(); if (run.phase === 'sink') lose(); }
    else if (run.phase === 'sink') lose();
    if (run && run.phase === 'ready') { if (run.step) cashOut(); else { host.add(run.bet, 'Ice Hop: bet returned'); host.save(); } }
    run = null; stopLoop(); return;
  }
  fit();
  if (!host.paused()) update(dt);
  draw();
}
function fit() {
  const avail = body.clientHeight - 36 - 110, w = Math.max(320, Math.min(body.clientWidth - 36, avail * 16 / 9));
  if (Math.abs(cv.offsetWidth - w) > 2) cv.style.width = w + 'px';
}
const floeX = i => PENG_X + i * GAP; // world x of floe i (0 = the shore)
function update(dt) {
  const r = run; r.t += dt; r.shake = Math.max(0, r.shake - dt * 30); r.squash = Math.max(0, (r.squash || 0) - dt * 5);
  // camera keeps the penguin about a quarter of the way in
  const pos = r.hop ? r.hop.from + (r.hop.to - r.hop.from) * Math.min(1, r.hop.t / 0.5) : r.step;
  r.cam += (pos * GAP - r.cam) * Math.min(1, dt * 4);
  if (r.phase === 'hop') { r.hop.t += dt; if (r.hop.t >= 0.5) { r.hop.t = 0.5; landed(); } }
  if (r.phase === 'sink') {
    r.sinkT += dt;
    if (r.sinkT > 0.3 && !r.splashed) {
      r.splashed = true; sfx.splash();
      for (let i = 0; i < 30; i++) r.parts.push({ x: floeX(r.step) + (Math.random() - 0.5) * 40, y: SEA, vx: (Math.random() - 0.5) * 260, vy: -150 - Math.random() * 260, t: 0, life: 0.9, c: Math.random() < 0.5 ? '#e8f8ff' : '#8fd0f2', r: 2 + Math.random() * 3 });
    }
    if (r.sinkT > 1.4) lose();
  }
  for (const p of r.parts) { p.t += dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  r.parts = r.parts.filter(p => p.t < p.life);
  for (const c of r.coins) { c.t += dt; c.vy += 700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += dt * 10; }
  r.coins = r.coins.filter(c => c.t < 2);
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------
function draw() {
  const r = run, t = performance.now() / 1000, cam = r.cam;
  g.save();
  if (r.shake) g.translate((Math.random() - 0.5) * r.shake, (Math.random() - 0.5) * r.shake);
  // sky with a low polar sun
  let gr = g.createLinearGradient(0, 0, 0, SEA); gr.addColorStop(0, '#6fb8e8'); gr.addColorStop(0.7, '#cfe9f7'); gr.addColorStop(1, '#ffe6d0'); g.fillStyle = gr; g.fillRect(-20, -20, W + 40, SEA + 20);
  g.fillStyle = '#fff4d6'; g.beginPath(); g.arc(760, 120, 46, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,244,214,0.25)'; g.beginPath(); g.arc(760, 120, 80, 0, 7); g.fill();
  // far glaciers (slow parallax)
  for (const [k, col, hgt, step] of [[0.15, '#d9eef9', 120, 260], [0.35, '#bfe0f2', 80, 190]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(-20, SEA);
    const off = -(cam * k) % step;
    for (let x = -step + off; x <= W + step; x += step / 4) { const i = Math.round((x - off) / (step / 4)); g.lineTo(x, SEA - hgt * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.7 + 0.3)))); }
    g.lineTo(W + 20, SEA); g.fill();
  }
  // sea
  gr = g.createLinearGradient(0, SEA, 0, H); gr.addColorStop(0, '#2f8fc9'); gr.addColorStop(1, '#0d3d66'); g.fillStyle = gr; g.fillRect(-20, SEA, W + 40, H - SEA + 20);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  for (let row = 0; row < 5; row++) { const y = SEA + 16 + row * 30, sp = 0.6 + row * 0.25; g.beginPath(); for (let x = -20; x <= W + 20; x += 12) g.lineTo(x, y + Math.sin(x * 0.03 + t * 2 * sp + row + cam * 0.02 * sp) * (2 + row)); g.stroke(); }
  // floes: shore (0) to the last one
  const M = MODES[r.mode], first = Math.max(0, Math.floor((cam - 300) / GAP)), last = Math.min(M.steps, Math.ceil((cam + W) / GAP));
  for (let i = first; i <= last; i++) drawFloe(i, floeX(i) - cam, t);
  // penguin
  drawPenguin(t);
  // particles + coins
  for (const p of r.parts) { g.globalAlpha = Math.max(0, 1 - p.t / p.life); g.fillStyle = p.c; g.beginPath(); g.arc(p.x - cam, p.y, p.r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  for (const c of r.coins) { g.save(); g.translate(c.x, c.y); g.scale(Math.cos(c.a), 1); g.fillStyle = '#ffcf3a'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.fillStyle = '#e0a020'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); g.restore(); }
  g.restore();
  drawHUD();
}
function drawFloe(i, x, t) {
  const r = run, M = MODES[r.mode], bob = Math.sin(t * 1.6 + i * 1.3) * 3, w = i === 0 ? 200 : 128 + (i * 37 % 3) * 10;
  let sink = 0, crack = 0, tilt = 0;
  if (r.phase === 'sink' || r.phase === 'lost') if (i === r.step) { const k = r.phase === 'lost' ? 1.4 : r.sinkT; crack = Math.min(1, k / 0.25); sink = Math.max(0, k - 0.15) * 110; tilt = Math.min(0.5, Math.max(0, k - 0.15)); }
  const y = SEA - 6 + bob + sink;
  g.save(); g.translate(x, y);
  if (i === 0) { // the shore: a big snowy shelf
    g.fillStyle = '#eaf6fc'; g.beginPath(); g.moveTo(-400, 0); g.lineTo(w / 2, 0); g.lineTo(w / 2 + 16, 14); g.lineTo(w / 2 - 10, 40); g.lineTo(-400, 40); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(-400, -10, 400 + w / 2, 12);
    g.fillStyle = '#a9d4ea'; g.fillRect(-400, 14, 400 + w / 2 + 10, 26);
  } else {
    for (const side of crack ? [-1, 1] : [0]) { // breaks into two halves that tip into the sea
      g.save(); if (side) { g.translate(side * crack * 10, 0); g.rotate(side * tilt); }
      g.beginPath();
      const x0 = side === 1 ? 0 : -w / 2, x1 = side === -1 ? 0 : w / 2;
      g.moveTo(x0, -10); g.lineTo(x1, -10); g.lineTo(x1 + (side === -1 ? 0 : 12), 10); g.lineTo(x1 - (side === -1 ? 0 : 8), 46); g.lineTo(x0 + (side === 1 ? 0 : 10), 46); g.lineTo(x0 - (side === 1 ? 0 : 12), 10); g.closePath();
      const ig = g.createLinearGradient(0, -10, 0, 46); ig.addColorStop(0, '#d6f0fb'); ig.addColorStop(0.35, '#9fd3ee'); ig.addColorStop(1, 'rgba(70,150,200,0.5)'); g.fillStyle = ig; g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x0 - (side === 1 ? 0 : 6), -20, (x1 - x0) + (side ? 6 : 12), 16, 6); g.fill();
      g.fillStyle = 'rgba(200,232,248,0.9)'; g.fillRect(x0 - (side === 1 ? 0 : 6), -6, (x1 - x0) + (side ? 6 : 12), 3);
      g.restore();
    }
    if (crack && crack < 1) { g.strokeStyle = '#3a7aa8'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(-6, 4); g.lineTo(4, 14); g.lineTo(-2, 34); g.stroke(); }
    // multiplier sign
    const m = multAt(r.mode, i), done = i <= r.step && !(i === r.step && (r.phase === 'sink' || r.phase === 'lost')), next = i === r.step + 1 && (r.phase === 'ready' || r.phase === 'hop');
    const label = fmtM(m); g.font = '900 18px system-ui, sans-serif'; const tw = g.measureText(label).width + 22;
    g.translate(0, -122 - (next ? Math.sin(t * 4) * 3 : 0));
    g.fillStyle = next ? '#ffcf3a' : done ? 'rgba(40,120,70,0.9)' : 'rgba(20,40,70,0.75)';
    g.beginPath(); g.roundRect(-tw / 2, -16, tw, 30, 9); g.fill();
    g.fillStyle = next ? '#2a1a00' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 0);
    g.fillStyle = next ? '#ffcf3a' : done ? 'rgba(40,120,70,0.9)' : 'rgba(20,40,70,0.75)'; g.beginPath(); g.moveTo(-6, 14); g.lineTo(6, 14); g.lineTo(0, 21); g.fill();
    if (i === M.steps) { g.font = '800 11px system-ui'; g.fillStyle = '#fff'; g.fillText('FINISH', 0, -26); }
  }
  g.restore();
}
function drawPenguin(t) {
  const r = run; let x, y, rot = 0, sx = 1, sy = 1;
  const baseY = i => SEA - 25 + Math.sin(t * 1.6 + i * 1.3) * 3;
  if (r.phase === 'hop') {
    const h = r.hop, k = h.t / 0.5, x0 = floeX(h.from) - r.cam, x1 = floeX(h.to) - r.cam;
    x = x0 + (x1 - x0) * k; y = baseY(h.from) + (baseY(h.to) - baseY(h.from)) * k - Math.sin(k * Math.PI) * 110;
    rot = (k - 0.5) * 0.5; sy = 1 + Math.sin(k * Math.PI) * 0.08; sx = 2 - sy;
  } else {
    x = floeX(r.step) - r.cam; y = baseY(r.step);
    if (r.phase === 'sink' || r.phase === 'lost') { const k = r.phase === 'lost' ? 1.4 : r.sinkT; y += Math.max(0, k - 0.2) * 160; rot = Math.min(1.2, Math.max(0, k - 0.2) * 2); }
    const sq = r.squash || 0; sy = 1 - sq * 0.15 + Math.sin(t * 3) * 0.015; sx = 1 + sq * 0.15;
  }
  g.save();
  if (r.phase === 'sink' || r.phase === 'lost') { g.beginPath(); g.rect(-20, -20, W + 40, SEA + 26); g.clip(); } // goes under the water line
  g.translate(x, y); g.rotate(rot); g.scale(sx * 1.3, sy * 1.3);
  // feet
  g.fillStyle = '#ff9a2a'; g.beginPath(); g.ellipse(-10, 0, 9, 4, 0, 0, 7); g.ellipse(10, 0, 9, 4, 0, 0, 7); g.fill();
  // body
  g.fillStyle = '#20232e'; g.beginPath(); g.ellipse(0, -34, 24, 34, 0, 0, 7); g.fill();
  g.fillStyle = '#f7f7f2'; g.beginPath(); g.ellipse(0, -28, 16, 26, 0, 0, 7); g.fill();
  // flippers (flap while hopping)
  const flap = r.phase === 'hop' ? Math.sin(r.hop.t * 30) * 0.6 : Math.sin(t * 2) * 0.08;
  g.fillStyle = '#20232e';
  g.save(); g.translate(-21, -40); g.rotate(0.4 + flap); g.beginPath(); g.ellipse(0, 12, 6, 16, 0, 0, 7); g.fill(); g.restore();
  g.save(); g.translate(21, -40); g.rotate(-0.4 - flap); g.beginPath(); g.ellipse(0, 12, 6, 16, 0, 0, 7); g.fill(); g.restore();
  // head: a little scarf, eyes, beak
  g.fillStyle = '#d23a5a'; g.fillRect(-18, -50, 36, 7); g.fillRect(8, -50, 7, 18);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-7, -60, 6, 7, 0, 0, 7); g.ellipse(7, -60, 6, 7, 0, 0, 7); g.fill();
  const lookX = r.phase === 'ready' || r.phase === 'hop' ? 2 : 0, scared = r.phase === 'sink' || r.phase === 'lost';
  g.fillStyle = '#111'; g.beginPath(); g.arc(-6 + lookX, -59, scared ? 1.6 : 3, 0, 7); g.arc(8 + lookX, -59, scared ? 1.6 : 3, 0, 7); g.fill();
  g.fillStyle = '#ffa23a'; g.beginPath(); g.moveTo(-6, -52); g.lineTo(6, -52); g.lineTo(0, -45); g.closePath(); g.fill();
  if (r.phase === 'cashed') { g.fillStyle = '#ffcf3a'; g.font = '20px system-ui'; g.textAlign = 'center'; g.fillText('😎', 0, -82); }
  g.restore();
}
function drawHUD() {
  const r = run, M = MODES[r.mode], m = cur();
  // current multiplier + winnings
  g.fillStyle = 'rgba(10,30,55,0.6)'; g.beginPath(); g.roundRect(16, 14, 250, 64, 12); g.fill();
  g.textAlign = 'left'; g.fillStyle = '#bfe3f7'; g.font = '800 12px system-ui'; g.fillText(r.step ? `FLOE ${r.step} OF ${M.steps}` : 'ON THE SHORE', 30, 36);
  const gone = r.phase === 'sink' || r.phase === 'lost';
  g.fillStyle = gone ? '#ff8a7a' : '#fff'; g.font = '950 26px system-ui'; g.fillText(gone ? 'LOST' : fmtM(m), 30, 66);
  g.fillStyle = gone ? '#ff8a7a' : '#6fe39a'; g.font = '900 18px system-ui'; g.textAlign = 'right'; g.fillText(gone ? '−' + usd(r.bet) : usd(r.bet * m), 252, 64);
  // odds
  g.fillStyle = 'rgba(10,30,55,0.6)'; g.beginPath(); g.roundRect(W - 230, 14, 214, 40, 12); g.fill();
  g.fillStyle = M.col; g.beginPath(); g.arc(W - 212, 34, 6, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = '800 13px system-ui'; g.textAlign = 'left'; g.fillText(`${M.name}: ${M.odds} floes break`, W - 200, 39);
  // banners
  if (r.phase === 'lost' || r.phase === 'cashed') {
    const k = Math.min(1, r.t / 0.3);
    g.fillStyle = `rgba(8,20,40,${0.6 * k})`; g.fillRect(0, 170, W, 120);
    g.globalAlpha = k; g.textAlign = 'center';
    g.fillStyle = r.phase === 'cashed' ? '#6fe39a' : '#ff8a7a'; g.font = '950 42px system-ui';
    g.fillText(r.phase === 'cashed' ? `CASHED OUT ${usd(r.won)}` : r.gameOver ? 'GAME OVER' : 'SPLASH!', W / 2, 224);
    g.fillStyle = '#fff'; g.font = '700 17px system-ui';
    g.fillText(r.phase === 'cashed' ? `${fmtM(m)} on floe ${r.step} · profit ${usd(r.won - r.bet)}` : r.gameOver ? `The ice gave way and took your last chips. Start a new game with ${usd(START_CHIPS)}.` : `The ice gave way on floe ${r.step}. The house keeps your ${usd(r.bet)}.`, W / 2, 258);
    g.globalAlpha = 1;
  }
}

if (STANDALONE) render(document.getElementById('iceHopApp'));
else N.casinoAddGame({ id: 'icehop', icon: '🐧', name: 'Ice Hop', desc: 'Hop floe to floe for bigger multipliers. Cash out before the ice cracks.', grad: 'linear-gradient(135deg,#5fc3f0,#1d4f8a)', render });

window.__icehop = { get run() { return run; }, MODES, multAt, hop, cashOut, startRun, set mode(m) { mode = m; } };
})();
