// Pogey Life — crypto mining. Buy parts and miners (HashParts), build rigs (CPU towers, open-air GPU frames), put them
// in the apartment, and run them on the coins CoinDen trades. Mined coins pay out into your CoinDen wallet every hour;
// every watt goes on the electricity meter (game.js bills it weekly).
//
// Semi-realistic economics, sped up for game time:
//  - each algorithm has a "hash price" ($ per unit of hashrate per day) that follows its coin's CoinDen price
//  - network difficulty chases the price with a lag (≈12%/day) and creeps up over time, so a price spike is a short
//    gold rush, a crash means losses until difficulty catches down, and old gear slowly becomes unprofitable
//  - ASICs earn; CPUs are OK on Monero (RandomX); graphics cards barely pay on these coins (like real life since 2022)
//  - the room's circuit trips if you draw too much; an electrician can add bigger circuits
(() => {
'use strict';
const N = window.POGEY;
if (!N || !N.furn || !N.cryptoApi) return;
const { box, GLOW } = N;
const CX = N.cryptoApi;

// ---------------------------------------------------------------------
// Algorithms + coins (only coins CoinDen trades)
// ---------------------------------------------------------------------
// base = $ earned per unit of hashrate per day at the starting price and difficulty
const ALGOS = {
  sha256:   { name: 'SHA-256',  unit: 'TH/s',   base: 0.36,  coins: ['BTC', 'BCH'] },
  scrypt:   { name: 'Scrypt',   unit: 'GH/s',   base: 8.0,   coins: ['LTC'] },          // merge-mined: pays LTC + DOGE
  equihash: { name: 'Equihash', unit: 'kSol/s', base: 0.09,  coins: ['ZEC'] },
  randomx:  { name: 'RandomX',  unit: 'kH/s',   base: 0.42,  coins: ['XMR'] },
};
const PAYS = { BTC: { BTC: 1 }, BCH: { BCH: 1 }, LTC: { LTC: 0.7, DOGE: 0.3 }, ZEC: { ZEC: 1 }, XMR: { XMR: 1 } };
const COIN_ALGO = { BTC: 'sha256', BCH: 'sha256', LTC: 'scrypt', ZEC: 'equihash', XMR: 'randomx' };
const COIN_LABEL = { BTC: 'Bitcoin', BCH: 'Bitcoin Cash', LTC: 'Litecoin + Doge', ZEC: 'Zcash', XMR: 'Monero' };
const POOL_FEE = 0.015, DIFF_CHASE = 0.12, DIFF_DRIFT = 0.003; // per game day

// ---------------------------------------------------------------------
// Parts. w = watts. hash = units per algorithm.
// ---------------------------------------------------------------------
const PARTS = {
  // the shells
  case1:   { kind: 'case',  name: 'Mid-tower PC case',            price: 75,   slots: 1, desc: 'A normal PC case. One graphics card. Makes a tidy CPU miner.' },
  frame6:  { kind: 'frame', name: 'Open-air rig frame',           price: 65,   slots: 6, desc: 'Aluminium frame for up to six graphics cards. Loud, hot, glorious.' },
  // boards + CPUs
  mbatx:   { kind: 'board', name: 'Desktop motherboard',          price: 130,  slots: 1, fits: 'case',  w: 25, desc: 'One graphics card slot. Goes in a PC case.' },
  mb6:     { kind: 'board', name: '6-slot mining motherboard',    price: 150,  slots: 6, fits: 'frame', w: 15, desc: 'Six riser slots for a frame rig. Barely any CPU power.' },
  cpu2:    { kind: 'cpu',   name: '2-core budget CPU',            price: 55,   w: 35,  hash: { randomx: 0.6 },  desc: 'Enough to boot a GPU rig. Mines next to nothing.' },
  cpu8:    { kind: 'cpu',   name: '8-core CPU',                   price: 190,  w: 65,  hash: { randomx: 7.5 },  desc: 'Decent Monero miner for the power it uses.' },
  cpu16:   { kind: 'cpu',   name: '16-core CPU',                  price: 520,  w: 140, hash: { randomx: 20 },   desc: 'The best Monero miner you can buy for an apartment.' },
  // graphics cards
  gpuU:    { kind: 'gpu',   name: 'Used ex-mining card (8 GB)',   price: 95,   w: 120, hash: { randomx: 1.2, equihash: 0.08 }, desc: 'Ran 24/7 in a warehouse for three years. Probably fine.' },
  gpuM:    { kind: 'gpu',   name: 'Mid-range graphics card (12 GB)', price: 330, w: 170, hash: { randomx: 2.2, equihash: 0.13 }, desc: 'Great for games. On these coins, a heater that pays a little.' },
  gpuH:    { kind: 'gpu',   name: 'High-end graphics card (24 GB)', price: 1250, w: 320, hash: { randomx: 4.4, equihash: 0.24 }, desc: 'The fastest card around. Still loses to a CPU on Monero per watt.' },
  // power supplies
  psu650:  { kind: 'psu',   name: '650 W power supply (Bronze)',  price: 75,   cap: 650,  eff: 0.86, desc: '86% efficient.' },
  psu1000: { kind: 'psu',   name: '1000 W power supply (Gold)',   price: 150,  cap: 1000, eff: 0.90, desc: '90% efficient.' },
  psu1600: { kind: 'psu',   name: '1600 W power supply (Platinum)', price: 330, cap: 1600, eff: 0.93, desc: '93% efficient. For full frame rigs.' },
};
// ready-made miners: bought straight into the room
const ASICS = {
  s9:   { name: 'S-9 SHA-256 miner (used, 2016)',   price: 110,  algo: 'sha256',   hash: 13.5, w: 1350, size: 'l', desc: 'A legend, now mostly a space heater. Barely profitable on a good day.' },
  s19:  { name: 'S-19j SHA-256 miner (used, 2021)', price: 1650, algo: 'sha256',   hash: 100,  w: 3050, size: 'l', desc: 'Solid Bitcoin miner. Needs more power than a normal outlet gives.' },
  s21:  { name: 'S-21 SHA-256 miner (new)',         price: 3900, algo: 'sha256',   hash: 200,  w: 3500, size: 'l', desc: 'Top of the line. Twice the hashrate of an S-19 for barely more power.' },
  mini: { name: 'Goldfin Mini Scrypt miner',        price: 450,  algo: 'scrypt',   hash: 1.1,  w: 230,  size: 's', desc: 'Small, quiet, home-friendly. Mines Litecoin and Doge at the same time.' },
  l7:   { name: 'Goldfin L-7 Scrypt miner',         price: 4200, algo: 'scrypt',   hash: 9.5,  w: 3400, size: 'l', desc: 'A serious Litecoin + Doge miner. Very loud.' },
  z15:  { name: 'Z-15 Equihash miner',              price: 1900, algo: 'equihash', hash: 420,  w: 1510, size: 'l', desc: 'Mines Zcash. Graphics cards don\'t stand a chance against it.' },
};
const UPGRADES = {
  c240: { name: 'Dedicated 240 V circuit', price: 1200, adds: 4800, desc: 'An electrician runs a 30 A dryer-style circuit to your room. +4,800 W.' },
  panel: { name: 'Mining sub-panel', price: 3800, adds: 9600, needs: 'c240', desc: 'A small sub-panel with several big circuits. +9,600 W. The landlord does not need to know.' },
};
const BASE_CAP = 1500; // watts the room's outlets can spare for mining
const SHELF_PRICE = 60;

// ---------------------------------------------------------------------
// State: S.mining = { v, inv {part: n}, net {sym: {p0, D}}, pending {sym}, life {sym}, usd, kwh, upg {}, tripped, lastT, payT, nextRig }
// Rigs are furniture pieces (types below) with p.rig = { name, on, coin, parts | asic }
// ---------------------------------------------------------------------
const M = () => N.S.mining;
function ensure(S) {
  if (!S.mining || S.mining.v !== 1) S.mining = { v: 1, inv: {}, net: {}, pending: {}, life: {}, usd: 0, kwh: 0, upg: {}, tripped: false, lastT: S.t, payT: 0, nextRig: 1 };
  const m = S.mining;
  for (const sym of Object.keys(PAYS)) if (!m.net[sym]) m.net[sym] = { p0: priceOf(sym, S) || 1, D: 1 };
  if (typeof m.lastT !== 'number') m.lastT = S.t;
}
const priceOf = (sym, S) => (S && S.crypto ? S.crypto.p[sym] : CX.price(sym)) || 0;
N.hooks.fresh.push(ensure);

const RIG_TYPES = ['mine_pc', 'mine_rig', 'mine_asic_l', 'mine_asic_s'];
const isRig = p => RIG_TYPES.includes(p.type) && p.rig;
const allRigs = () => [...N.furn.F().pieces, ...N.furn.F().store].filter(isRig);
const placed = p => N.furn.F().pieces.includes(p) && !N.furn.isMoving(p);
const capacity = () => BASE_CAP + Object.keys(M().upg).reduce((a, k) => a + (M().upg[k] ? UPGRADES[k].adds : 0), 0);

// what a rig can do
function spec(p) {
  const r = p.rig;
  if (r.asic) { const a = ASICS[r.asic]; return { hash: { [a.algo]: a.hash }, watts: a.w, coins: ALGOS[a.algo].coins.slice() }; }
  const P = r.parts, hash = {};
  let dc = (PARTS[P.board].w || 0) + PARTS[P.cpu].w;
  const add = part => { for (const [k, v] of Object.entries(part.hash || {})) hash[k] = (hash[k] || 0) + v; };
  add(PARTS[P.cpu]);
  for (const gid of P.gpus) { dc += PARTS[gid].w; add(PARTS[gid]); }
  const coins = Object.keys(hash).flatMap(a => ALGOS[a].coins);
  return { hash, watts: Math.round(dc / PARTS[P.psu].eff), coins, dc, psuCap: PARTS[P.psu].cap };
}
const running = p => !!(N.S && N.S.mining && p.rig && p.rig.on && placed(p) && !M().tripped && !N.powerCut);
// $ per day for one rig on its coin right now
function econ(p, coin) {
  const s = spec(p), sym = coin || p.rig.coin, algo = COIN_ALGO[sym], h = s.hash[algo] || 0;
  const rev = h * hashPrice(sym) * (1 - POOL_FEE), cost = s.watts / 1000 * 24 * N.POWER.rate;
  return { rev, cost, net: rev - cost, h, algo, watts: s.watts };
}
// $ per unit of hashrate per day for a coin (its algorithm's base, scaled by price moves and difficulty)
function hashPrice(sym) {
  const n = M().net[sym]; if (!n) return 0;
  return ALGOS[COIN_ALGO[sym]].base * (priceOf(sym, N.S) / n.p0) / n.D;
}
// hardware prices follow how profitable mining is
function marketIndex(algo) { const syms = ALGOS[algo].coins; return syms.reduce((a, s) => a + hashPrice(s) / ALGOS[algo].base, 0) / syms.length; }
const asicPrice = id => Math.round(ASICS[id].price * Math.max(0.55, Math.min(1.8, 0.6 + 0.4 * marketIndex(ASICS[id].algo))) / 5) * 5;
const partPrice = id => { const P = PARTS[id]; return P.kind === 'gpu' ? Math.round(P.price * Math.max(0.85, Math.min(1.25, 0.9 + 0.1 * marketIndex('randomx'))) / 5) * 5 : P.price; };
const SELL = 0.55;

// ---------------------------------------------------------------------
// The clock: difficulty, earnings, power, payouts (works off game time, so sleeping/skipping counts too)
// ---------------------------------------------------------------------
let sig = '';
N.hooks.update.push(() => {
  const S = N.S; if (!S || !S.mining || !S.furn) return;
  const m = M(), dtMin = S.t - m.lastT; m.lastT = S.t;
  if (dtMin <= 0) return;
  const days = Math.min(dtMin, 1440 * 60) / 1440;
  // network difficulty chases price, and creeps up
  for (const [sym, n] of Object.entries(m.net)) {
    const target = Math.pow(priceOf(sym, S) / n.p0, 0.85) * Math.pow(1 + DIFF_DRIFT, (S.t - (S.mining.born ?? (S.mining.born = S.t))) / 1440);
    n.D += (target - n.D) * (1 - Math.exp(-days * DIFF_CHASE * 7 / 7));
  }
  // rigs
  let load = 0;
  const live = allRigs().filter(running);
  for (const p of live) load += spec(p).watts;
  if (live.length && load > capacity()) { trip(load); return; }
  for (const p of live) {
    const e = econ(p), price = priceOf(p.rig.coin, S);
    for (const [sym, share] of Object.entries(PAYS[p.rig.coin])) {
      const ps = priceOf(sym, S); if (!ps) continue;
      m.pending[sym] = (m.pending[sym] || 0) + e.rev * share * days / ps;
    }
    m.usd += e.rev * days; void price;
  }
  const kwh = load / 1000 * days * 24; m.kwh += kwh; N.addKwh(kwh);
  // coins stream straight into the CoinDen wallet as they're mined
  for (const [sym, q] of Object.entries(m.pending)) if (q > 0 && CX.credit(sym, q)) { m.life[sym] = (m.life[sym] || 0) + q; m.pending[sym] = 0; }
  // redraw the rigs when what's running changes (fan glow on/off)
  const now = live.map(p => p.uid).join(',');
  if (now !== sig) { sig = now; N.furn.rebuild(); }
});
function trip(load) {
  const m = M(); if (m.tripped) return;
  m.tripped = true; sig = '#'; N.furn.rebuild(); N.save();
  N.toast(`💥 Breaker tripped! Your rigs were pulling ${fmtW(load)} on a ${fmtW(capacity())} circuit. Switch some off, then reset the breaker in MineOS.`, 'bad', 8000);
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = 70; g.gain.setValueAtTime(0.12, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.32); } catch (e) {}
}
function resetBreaker() {
  const m = M(), load = allRigs().filter(p => p.rig.on && placed(p)).reduce((a, p) => a + spec(p).watts, 0);
  if (load > capacity()) { N.toast(`Still ${fmtW(load)} switched on. The circuit handles ${fmtW(capacity())}. Switch something off first.`, 'bad', 5000); return; }
  m.tripped = false; sig = '#'; N.toast('Breaker reset. The fans spin back up.', 'good'); N.save();
}
const fmtW = w => w >= 1000 ? (w / 1000).toFixed(w >= 10000 ? 0 : 1) + ' kW' : Math.round(w) + ' W';
const fmtH = (h, algo) => `${h >= 100 ? Math.round(h).toLocaleString() : h >= 10 ? h.toFixed(1) : h.toFixed(2)} ${ALGOS[algo].unit}`;
const usd = n => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(Math.abs(n) < 10 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// glow: GPU / tower fans, ASIC status LEDs
(function glowLoop() {
  requestAnimationFrame(glowLoop);
  const t = performance.now() / 1000, pw = N.env.power;
  N.env.glow[GLOW.MINER] = [0.3 + 0.25 * Math.sin(t * 1.3), 0.45 + 0.2 * Math.sin(t * 1.7 + 2), 1.0].map(v => v * pw);
  N.env.glow[GLOW.ASIC] = (Math.sin(t * 9) > 0 ? [0.25, 1.0, 0.4] : [0.05, 0.35, 0.1]).map(v => v * pw);
})();

// ---------------------------------------------------------------------
// The pieces in the room
// ---------------------------------------------------------------------
const tid = (p, a) => `f:${p.uid}:${a}`;
const rigPrompt = p => () => {
  if (M().tripped && p.rig.on) return `${p.rig.name}: breaker tripped (reset it in MineOS)`;
  return p.rig.on ? `${p.rig.name}: mining ${p.rig.coin}. Switch off` : `${p.rig.name}: off. Switch on (${p.rig.coin})`;
};
function useRig(p) {
  p.rig.on = !p.rig.on; N.furn.thud(p.rig.on ? 520 : 260);
  if (p.rig.on && !M().tripped) {
    const load = allRigs().filter(q => q.rig.on && placed(q)).reduce((a, q) => a + spec(q).watts, 0);
    if (load > capacity()) { trip(load); return; }
  }
  sig = '#'; N.save();
}
const fanGlow = p => running(p) ? GLOW.MINER : 0;
const DEFS = N.furn.DEFS;
DEFS.mine_pc = { name: 'Mining PC', icon: '🖥', w: 0.22, d: 0.46, h: 0.48, stack: true, resale: 0, noSell: 'Take it apart in MineOS', use: useRig,
  build(p) {
    box(0, 0, 0, 0.22, 0.48, 0.46, '#1b1c22');
    box(0.01, 0.04, 0.461, 0.2, 0.4, 0.004, running(p) ? '#2a3550' : '#20222a'); // glass
    for (let i = 0; i < 3; i++) box(0.065, 0.06 + i * 0.125, 0.462, 0.09, 0.09, 0.003, '#ffffff', fanGlow(p)); // front fans light up while mining
    box(0.02, 0.44, 0.462, 0.18, 0.012, 0.003, '#ffffff', fanGlow(p));
  },
  things: p => [[tid(p, 'rig'), rigPrompt(p), [0, 0, 0, 0.22, 0.48, 0.46]]] };
DEFS.mine_rig = { name: 'GPU mining rig', icon: '⛏', w: 0.62, d: 0.4, h: 0.52, resale: 0, noSell: 'Take it apart in MineOS', use: useRig,
  build(p) {
    const al = '#b8bcc4';
    for (const [x, z] of [[0, 0], [0.6, 0], [0, 0.38], [0.6, 0.38]]) box(x, 0, z, 0.02, 0.5, 0.02, al);
    box(0, 0.24, 0, 0.62, 0.02, 0.4, al); box(0, 0.5, 0, 0.62, 0.02, 0.4, al); box(0, 0.02, 0, 0.62, 0.02, 0.4, al);
    box(0.05, 0.04, 0.05, 0.25, 0.08, 0.15, '#1e1e24'); // PSU
    box(0.34, 0.26, 0.04, 0.24, 0.01, 0.2, '#1d5a3a'); // board on the middle shelf
    const n = p.rig && p.rig.parts ? p.rig.parts.gpus.length : 0, gap = 0.58 / 6;
    for (let i = 0; i < n; i++) {
      const x = 0.03 + i * gap, gid = p.rig.parts.gpus[i], col = gid === 'gpuH' ? '#2a2a30' : gid === 'gpuM' ? '#3a3f4a' : '#4a3a30';
      box(x, 0.27, 0.06, 0.045, 0.21, 0.3, col);
      for (const zz of [0.12, 0.26]) box(x + 0.045, 0.33, zz, 0.004, 0.09, 0.09, '#ffffff', fanGlow(p)); // fan faces glow while mining
    }
  },
  things: p => [[tid(p, 'rig'), rigPrompt(p), [0, 0, 0, 0.62, 0.52, 0.4]]] };
DEFS.mine_asic_l = { name: 'ASIC miner', icon: '📦', w: 0.2, d: 0.4, h: 0.29, stack: true, resale: 0, noSell: 'Sell it in MineOS', use: useRig,
  build(p) {
    box(0, 0, 0, 0.2, 0.29, 0.4, '#a9adb5'); box(0.005, 0.005, 0.4, 0.19, 0.28, 0.004, '#8a8e96');
    for (const z of [-0.004, 0.404]) { box(0.03, 0.03, z, 0.14, 0.23, 0.004, '#2a2c32'); }
    box(0.02, 0.24, 0.405, 0.03, 0.02, 0.003, '#ffffff', running(p) ? GLOW.ASIC : 0);
    box(0.06, 0.24, 0.405, 0.03, 0.02, 0.003, running(p) ? '#ff5a3a' : '#3a2a2a');
  },
  things: p => [[tid(p, 'rig'), rigPrompt(p), [0, 0, 0, 0.2, 0.29, 0.4]]] };
DEFS.mine_asic_s = { name: 'Mini miner', icon: '📦', w: 0.14, d: 0.2, h: 0.12, stack: true, resale: 0, noSell: 'Sell it in MineOS', use: useRig,
  build(p) {
    box(0, 0, 0, 0.14, 0.12, 0.2, '#2f5fa8'); box(0.02, 0.02, 0.201, 0.1, 0.08, 0.003, '#1a2a44');
    box(0.11, 0.095, 0.202, 0.02, 0.012, 0.003, '#ffffff', running(p) ? GLOW.ASIC : 0);
  },
  things: p => [[tid(p, 'rig'), rigPrompt(p), [0, 0, 0, 0.14, 0.12, 0.2]]] };
DEFS.mine_shelf = { name: 'Wire shelf', icon: '🗄', w: 0.9, d: 0.45, h: 1.0, resale: 25, surface: { y: 1.0, r: [0.02, 0.02, 0.88, 0.43] },
  build() {
    const c = '#c8ccd2';
    for (const [x, z] of [[0, 0], [0.88, 0], [0, 0.43], [0.88, 0.43]]) box(x, 0, z, 0.02, 1.0, 0.02, c);
    for (const y of [0.08, 0.52, 0.98]) { box(0, y, 0, 0.9, 0.02, 0.45, '#9aa0a8'); for (let i = 1; i < 9; i++) box(i * 0.1, y + 0.02, 0, 0.004, 0.004, 0.45, c); }
  } };

// ---------------------------------------------------------------------
// MineOS: the app
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .mn { color: #1b1a22; } .mn h3 { margin: 0; } .mn-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .mn-tabs { display: flex; gap: 6px; margin: 12px 0; flex-wrap: wrap; }
  .mn-tabs button { font: inherit; font-weight: 800; font-size: 13px; border: 2px solid #24223a; background: #fff; color: #24223a; border-radius: 99px; padding: 6px 14px; cursor: pointer; }
  .mn-tabs button.on { background: #24223a; color: #6fe39a; }
  .mn-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
  .mn-card { background: #fff; border: 1px solid #ddd9cf; border-radius: 12px; padding: 10px 12px; } .mn-card span { display: block; font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #7a7790; }
  .mn-card b { font-size: 19px; } .mn-card small { display: block; font-size: 11px; color: #7a7790; margin-top: 2px; }
  .mn .pos { color: #1b8a4a; font-weight: 800; } .mn .neg { color: #c43a3a; font-weight: 800; }
  .mn-bar { height: 10px; background: #e6e2d8; border-radius: 5px; overflow: hidden; margin-top: 6px; } .mn-bar i { display: block; height: 100%; }
  .mn table { width: 100%; border-collapse: collapse; font-size: 13px; } .mn th { text-align: left; font-size: 11px; color: #7a7790; text-transform: uppercase; letter-spacing: .5px; padding: 6px; border-bottom: 1px solid #ddd9cf; }
  .mn td { padding: 7px 6px; border-bottom: 1px solid #eee9de; vertical-align: middle; } .mn td.num, .mn th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mn select { font: inherit; font-size: 12px; padding: 4px; border-radius: 6px; border: 1px solid #ccc7ba; background: #fff; }
  .mn .wbtn { padding: 5px 10px; font-size: 12px; } .mn .tag { font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
  .mn .tag.on { background: #d6f5e1; color: #1b8a4a; } .mn .tag.off { background: #eee; color: #777; } .mn .tag.bad { background: #ffd9d9; color: #b02a2a; } .mn .tag.store { background: #fff1c9; color: #8a6510; }
  .mn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .mn-item { background: #fff; border: 1px solid #ddd9cf; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 5px; }
  .mn-item .nm { font-weight: 800; } .mn-item .ds { font-size: 12px; color: #6a6880; flex: 1; } .mn-item .sp { font-size: 12px; color: #3b3a44; } .mn-item .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .mn-item .pr { font-weight: 900; font-size: 16px; }
  .mn-h4 { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #7a7790; }
  .mn-wallet { background: #fff; border: 1px solid #ddd9cf; border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; }
  .mn-whead { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-size: 14px; }
  .mn-total td { border-top: 2px solid #ddd9cf; }
  .mn-note { font-size: 12px; color: #6a6880; margin: 4px 0 10px; line-height: 1.5; }
  .mn-build { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } @media (max-width: 760px) { .mn-build { grid-template-columns: 1fr; } }
  .mn-field { margin-bottom: 10px; } .mn-field label { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #7a7790; margin-bottom: 4px; }
  .mn-field select, .mn-field input { width: 100%; font: inherit; padding: 7px; border-radius: 8px; border: 1px solid #ccc7ba; background: #fff; }
  .mn-gpus { display: flex; flex-direction: column; gap: 6px; } .mn-gpus div { display: flex; align-items: center; gap: 8px; font-size: 13px; } .mn-gpus input { width: 60px; }
  .mn-sum { background: #fff; border: 1px solid #ddd9cf; border-radius: 12px; padding: 12px; font-size: 13px; } .mn-sum div { display: flex; justify-content: space-between; padding: 3px 0; }
  .mn-err { color: #c43a3a; font-weight: 700; font-size: 12px; margin-top: 6px; }`;
document.head.appendChild(css);

let tab = 'rigs', bodyEl = null, draft = { kind: 'case', board: '', cpu: '', psu: '', gpus: {} }, app = null;
const inv = () => M().inv;
const have = id => inv()[id] || 0;
const take = id => { inv()[id] = have(id) - 1; if (!inv()[id]) delete inv()[id]; };
const give = (id, n = 1) => { inv()[id] = have(id) + n; };

function render(body) {
  bodyEl = body; const S = N.S, m = M();
  const rigs = allRigs(), live = rigs.filter(running);
  const load = rigs.filter(p => p.rig.on && placed(p)).reduce((a, p) => a + spec(p).watts, 0), cap = capacity();
  let rev = 0, cost = 0; for (const p of live) { const e = econ(p); rev += e.rev; cost += e.cost; }
  let html = `<div class="mn"><div class="mn-head"><h3>⛏ MineOS</h3><span>Balance <b class="pos">${N.money(S.money)}</b></span></div>
    <div class="mn-tabs">${[['rigs', `My rigs (${rigs.length})`], ['build', 'Build'], ['shop', 'HashParts shop'], ['net', 'Network']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (tab === 'rigs') html += rigsTab(rigs, live, load, cap, rev, cost);
  else if (tab === 'build') html += buildTab();
  else if (tab === 'shop') html += shopTab();
  else html += netTab();
  body.innerHTML = html + '</div>';
  body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(body); });
  wire(body);
}
function rigsTab(rigs, live, load, cap, rev, cost) {
  const m = M(), pw = N.S.power || { kwh: 0 };
  const pct = Math.min(100, load / cap * 100), pend = Object.entries(m.pending).filter(([, q]) => q > 1e-12);
  let h = `<div class="mn-cards">
    <div class="mn-card"><span>Mining income</span><b class="pos">${usd(rev)}</b><small>per day, after pool fee</small></div>
    <div class="mn-card"><span>Power cost</span><b class="neg">${usd(cost)}</b><small>per day at $${N.POWER.rate.toFixed(2)}/kWh</small></div>
    <div class="mn-card"><span>Net</span><b class="${rev - cost >= 0 ? 'pos' : 'neg'}">${usd(rev - cost)}</b><small>per day, at today's prices</small></div>
    <div class="mn-card"><span>Circuit</span><b>${fmtW(load)}</b><small>of ${fmtW(cap)}${m.tripped ? ' · <b class="neg">TRIPPED</b>' : ''}</small><div class="mn-bar"><i style="width:${pct}%;background:${pct > 90 ? '#c43a3a' : pct > 70 ? '#e6b23a' : '#3ad66b'}"></i></div></div>
  </div>`;
  if (m.tripped) h += `<p class="mn-note"><b class="neg">💥 The breaker tripped.</b> Switch some rigs off so you're under ${fmtW(cap)}, then <button class="wbtn gold" id="mnReset">Reset breaker</button></p>`;
  if (N.powerCut) h += `<p class="mn-note"><b class="neg">⚡ Your power is cut off</b> for an unpaid electricity bill. Nothing mines until it's paid (Bills app).</p>`;
  h += `<p class="mn-note">Electricity since the last bill: <b>${pw.kwh.toFixed(1)} kWh</b> (~${N.money(N.POWER.base + pw.kwh * N.POWER.rate)} so far, mining used ${m.kwh.toFixed(0)} kWh in total).
    Mined coins go straight into your CoinDen wallet as they're found${pend.length ? ` (waiting for CoinDen: ${pend.map(([s, q]) => `${q.toPrecision(3)} ${s}`).join(', ')})` : ''}. Mined so far: ${usd(m.usd)} worth.</p>`;
  h += walletBox();
  if (!rigs.length) return h + `<p class="mn-note">No rigs yet. Buy a miner in the <b>HashParts shop</b>, or buy parts and put a rig together in <b>Build</b>.</p>`;
  h += `<table><tr><th>Rig</th><th>Status</th><th>Mining</th><th class="num">Hashrate</th><th class="num">Power</th><th class="num">$/day</th><th></th></tr>`;
  for (const p of rigs) {
    const s = spec(p), e = econ(p), st = !placed(p) ? (N.furn.F().store.includes(p) ? ['store', 'In storage'] : ['store', 'Being placed']) : m.tripped && p.rig.on ? ['bad', 'Breaker'] : N.powerCut && p.rig.on ? ['bad', 'No power'] : p.rig.on ? ['on', 'Mining'] : ['off', 'Off'];
    h += `<tr><td><b>${p.rig.name}</b><br><small style="color:#7a7790">${p.rig.asic ? ASICS[p.rig.asic].name : `${PARTS[p.rig.parts.cpu].name}${p.rig.parts.gpus.length ? ' + ' + p.rig.parts.gpus.length + ' GPU' : ''}`}</small></td>
      <td><span class="tag ${st[0]}">${st[1]}</span></td>
      <td><select data-coin="${p.uid}">${s.coins.map(c => `<option value="${c}" ${c === p.rig.coin ? 'selected' : ''}>${COIN_LABEL[c]}</option>`).join('')}</select></td>
      <td class="num">${fmtH(e.h, e.algo)}</td><td class="num">${fmtW(s.watts)}</td>
      <td class="num"><span class="${e.net >= 0 ? 'pos' : 'neg'}">${usd(e.net)}</span><br><small style="color:#7a7790">${usd(e.rev)} − ${usd(e.cost)}</small></td>
      <td class="num">${placed(p) ? `<button class="wbtn ${p.rig.on ? '' : 'gold'}" data-toggle="${p.uid}">${p.rig.on ? 'Turn off' : 'Turn on'}</button>` : `<button class="wbtn gold" data-place="${p.uid}">Place</button>`}
        <button class="wbtn" data-apart="${p.uid}" title="${p.rig.asic ? 'Sell to the used market' : 'Parts go back to your inventory'}">${p.rig.asic ? 'Sell ' + usd(asicPrice(p.rig.asic) * SELL) : 'Take apart'}</button></td></tr>`;
  }
  return h + `</table><p class="mn-note">Tip: look at a rig in your room and press <b>E</b> to switch it on or off, or <b>F</b> to move it. ASICs and mining PCs fit on desks, tables and wire shelves.</p>`;
}
const fcoin = q => q >= 1000 ? q.toFixed(2) : q >= 1 ? q.toFixed(4) : q.toPrecision(4);
const fprice = p => p >= 1 ? usd(p) : '$' + p.toPrecision(4);
function walletBox() {
  const m = M(), rows = (CX.holdings ? CX.holdings() : []).sort((a, b) => b.value - a.value);
  let h = `<div class="mn-wallet"><div class="mn-whead"><b>🪙 Your coins</b><button class="wbtn gold" data-cx="">Open CoinDen ↗</button></div>`;
  if (!rows.length) return h + `<p class="mn-note" style="margin:6px 0 0">Your CoinDen wallet is empty. Coins your rigs mine show up here as they come in.</p></div>`;
  let tv = 0, tn = 0, tc = 0;
  h += `<table><tr><th>Coin</th><th class="num">Amount</th><th class="num">Price</th><th class="num">Value</th><th class="num">If sold now</th><th class="num">Profit if sold</th><th class="num">You mined</th><th></th></tr>`;
  for (const r of rows) {
    const pnl = r.sellNet - r.cost; tv += r.value; tn += r.sellNet; tc += r.cost;
    h += `<tr><td><b>${r.sym}</b></td>
      <td class="num">${fcoin(r.q)}${r.locked ? `<br><small style="color:#7a7790">${fcoin(r.locked)} in sell orders</small>` : ''}</td>
      <td class="num">${fprice(r.price)}</td><td class="num">${usd(r.value)}</td><td class="num">${usd(r.sellNet)}</td>
      <td class="num"><span class="${pnl >= 0 ? 'pos' : 'neg'}">${pnl >= 0 ? '+' : ''}${usd(pnl)}</span>${r.cost > 0 ? `<br><small style="color:#7a7790">${pnl >= 0 ? '+' : ''}${(pnl / r.cost * 100).toFixed(1)}%</small>` : ''}</td>
      <td class="num">${m.life[r.sym] ? fcoin(m.life[r.sym]) : '<span style="color:#aaa">-</span>'}</td>
      <td class="num"><button class="wbtn" data-cx="${r.sym}">Trade</button></td></tr>`;
  }
  const tp = tn - tc;
  h += `<tr class="mn-total"><td><b>Total</b></td><td></td><td></td><td class="num"><b>${usd(tv)}</b></td><td class="num"><b>${usd(tn)}</b></td><td class="num"><b class="${tp >= 0 ? 'pos' : 'neg'}">${tp >= 0 ? '+' : ''}${usd(tp)}</b></td><td></td><td></td></tr></table>
    <p class="mn-note" style="margin:6px 0 0">"If sold now" is what a market sell on CoinDen would pay after the spread and 0.6% fee. Profit compares that with what the coins cost you: what you paid for coins you bought, and what mined coins were worth when they were mined. So for mined coins, it shows how much the price has moved since.</p></div>`;
  return h;
}
function buildTab() {
  const owned = Object.entries(inv()).filter(([, n]) => n > 0);
  const opts = kind => Object.entries(PARTS).filter(([id, P]) => P.kind === kind && have(id) > 0);
  const shell = draft.kind === 'case' ? 'case1' : 'frame6';
  const boards = opts('board').filter(([, P]) => P.fits === draft.kind);
  if (!boards.some(([id]) => id === draft.board)) draft.board = boards[0] ? boards[0][0] : '';
  if (!opts('cpu').some(([id]) => id === draft.cpu)) draft.cpu = opts('cpu')[0] ? opts('cpu')[0][0] : '';
  if (!opts('psu').some(([id]) => id === draft.psu)) draft.psu = opts('psu').sort((a, b) => b[1].cap - a[1].cap)[0] ? opts('psu').sort((a, b) => b[1].cap - a[1].cap)[0][0] : '';
  const v = checkDraft();
  let h = `<p class="mn-note">Pick a shell, then the parts you own. The builder checks that everything fits and that the power supply can handle it. Buy parts in the HashParts shop.</p>
  <div class="mn-build"><div>
    <div class="mn-field"><label>Shell</label><select data-d="kind"><option value="case" ${draft.kind === 'case' ? 'selected' : ''}>PC case (1 GPU) · you have ${have('case1')}</option><option value="frame" ${draft.kind === 'frame' ? 'selected' : ''}>Open-air frame (6 GPUs) · you have ${have('frame6')}</option></select></div>
    <div class="mn-field"><label>Motherboard</label><select data-d="board">${boards.length ? boards.map(([id, P]) => `<option value="${id}" ${id === draft.board ? 'selected' : ''}>${P.name} (${have(id)})</option>`).join('') : '<option value="">none that fits: buy one</option>'}</select></div>
    <div class="mn-field"><label>CPU</label><select data-d="cpu">${opts('cpu').length ? opts('cpu').map(([id, P]) => `<option value="${id}" ${id === draft.cpu ? 'selected' : ''}>${P.name} (${have(id)})</option>`).join('') : '<option value="">none: buy one</option>'}</select></div>
    <div class="mn-field"><label>Power supply</label><select data-d="psu">${opts('psu').length ? opts('psu').map(([id, P]) => `<option value="${id}" ${id === draft.psu ? 'selected' : ''}>${P.name} (${have(id)})</option>`).join('') : '<option value="">none: buy one</option>'}</select></div>
    <div class="mn-field"><label>Graphics cards</label><div class="mn-gpus">${Object.entries(PARTS).filter(([, P]) => P.kind === 'gpu').map(([id, P]) => `<div><input type="number" min="0" max="${Math.min(have(id), PARTS[shell].slots)}" value="${draft.gpus[id] || 0}" data-gpu="${id}"> ${P.name} <small>(have ${have(id)})</small></div>`).join('')}</div></div>
  </div><div>
    <div class="mn-sum"><b>This build</b>
      <div><span>Draw at the wall</span><b>${v.watts ? fmtW(v.watts) : '-'}</b></div>
      <div><span>Power supply load</span><b class="${v.load > 0.9 ? 'neg' : ''}">${v.cap ? Math.round(v.load * 100) + '% of ' + v.cap + ' W' : '-'}</b></div>
      ${Object.entries(v.hash || {}).map(([a, hsh]) => `<div><span>${ALGOS[a].name} (${ALGOS[a].coins.join(', ')})</span><b>${fmtH(hsh, a)}</b></div>`).join('')}
      ${v.best ? `<div><span>Best coin today</span><b class="${v.best.net >= 0 ? 'pos' : 'neg'}">${v.best.coin}: ${usd(v.best.net)}/day</b></div>` : ''}
    </div>
    ${v.err ? `<div class="mn-err">${v.err}</div>` : ''}
    <div class="mn-field" style="margin-top:10px"><label>Name</label><input id="mnName" value="${draft.name || (draft.kind === 'case' ? 'Mining PC' : 'GPU rig') + ' #' + M().nextRig}" maxlength="24"></div>
    <button class="wbtn gold" id="mnAssemble" ${v.err ? 'disabled' : ''} style="font-size:15px;padding:10px 18px">Assemble and place</button>
  </div></div>
  <div class="mn-h4">Your parts</div>`;
  h += owned.length ? `<table>${owned.map(([id, n]) => `<tr><td>${PARTS[id].name}</td><td class="num">× ${n}</td><td class="num"><button class="wbtn" data-sellpart="${id}">Sell one ${usd(partPrice(id) * SELL)}</button></td></tr>`).join('')}</table>` : '<p class="mn-note">No loose parts.</p>';
  return h;
}
function checkDraft() {
  const shell = draft.kind === 'case' ? 'case1' : 'frame6', gpus = [];
  for (const [id, n] of Object.entries(draft.gpus)) for (let i = 0; i < n; i++) gpus.push(id);
  let err = '';
  if (!have(shell)) err = `You need a ${PARTS[shell].name}.`;
  else if (!draft.board) err = `You need a ${draft.kind === 'case' ? 'desktop motherboard' : '6-slot mining motherboard'}.`;
  else if (!draft.cpu) err = 'You need a CPU.';
  else if (!draft.psu) err = 'You need a power supply.';
  else if (gpus.length > PARTS[draft.board].slots) err = `That board only has ${PARTS[draft.board].slots} GPU slot${PARTS[draft.board].slots > 1 ? 's' : ''}.`;
  else if (Object.entries(draft.gpus).some(([id, n]) => n > have(id))) err = "You don't have that many of those cards.";
  else if (draft.kind === 'frame' && !gpus.length) err = 'A frame rig needs at least one graphics card. (For a CPU-only miner, use a PC case.)';
  if (!draft.board || !draft.cpu || !draft.psu) return { err };
  const fake = { rig: { parts: { board: draft.board, cpu: draft.cpu, psu: draft.psu, gpus } } }, s = spec(fake), load = s.dc / s.psuCap;
  if (!err && load > 1) err = `The ${PARTS[draft.psu].name} can't power this (${Math.round(s.dc)} W needed). Use a bigger one.`;
  let best = null;
  for (const coin of s.coins) { const e = econ(fake, coin); if (!best || e.net > best.net) best = { coin, net: e.net }; }
  return { err, watts: s.watts, cap: s.psuCap, load, hash: s.hash, best, gpus };
}
function assemble() {
  const v = checkDraft(); if (v.err) return;
  const shell = draft.kind === 'case' ? 'case1' : 'frame6';
  take(shell); take(draft.board); take(draft.cpu); take(draft.psu); for (const g of v.gpus) take(g);
  const name = (bodyEl.querySelector('#mnName').value || '').trim().slice(0, 24) || 'Rig #' + M().nextRig;
  M().nextRig++;
  const rig = { name, on: true, coin: v.best ? v.best.coin : 'XMR', parts: { shell, board: draft.board, cpu: draft.cpu, psu: draft.psu, gpus: v.gpus } };
  const type = draft.kind === 'case' ? 'mine_pc' : 'mine_rig';
  draft = { kind: draft.kind, board: '', cpu: '', psu: '', gpus: {} };
  N.toast(`${name} is built! Find a spot for it.`, 'good');
  N.furn.place(type, { rig, label: name });
}
function shopTab() {
  const money = N.S.money, row = (id, name, desc, spec2, price, btn) => `<div class="mn-item"><div class="nm">${name}</div><div class="ds">${desc}</div>${spec2 ? `<div class="sp">${spec2}</div>` : ''}
    <div class="row"><span class="pr">${usd(price)}</span><button class="wbtn ${money >= price ? 'gold' : ''}" ${money >= price ? '' : 'disabled'} ${btn}>Buy</button></div></div>`;
  let h = `<p class="mn-note">Miner prices go up when mining is profitable and down when it isn't, just like the real used market. Parts you buy go into your inventory (Build tab); miners and shelves are delivered straight to your room.</p>`;
  h += `<div class="mn-h4">ASIC miners (plug in and go)</div><div class="mn-grid">${Object.entries(ASICS).map(([id, a]) => {
    const e = econ({ rig: { asic: id } }, ALGOS[a.algo].coins[0]);
    return row(id, a.name, a.desc, `${fmtH(a.hash, a.algo)} · ${fmtW(a.w)} · ${ALGOS[a.algo].name}<br>Today: <span class="${e.net >= 0 ? 'pos' : 'neg'}">${usd(e.net)}/day</span> after power`, asicPrice(id), `data-buyasic="${id}"`);
  }).join('')}</div>`;
  for (const [kind, title] of [['case', 'Cases + frames'], ['board', 'Motherboards'], ['cpu', 'CPUs'], ['gpu', 'Graphics cards'], ['psu', 'Power supplies']]) {
    h += `<div class="mn-h4">${title}</div><div class="mn-grid">${Object.entries(PARTS).filter(([, P]) => P.kind === kind || (kind === 'case' && P.kind === 'frame')).map(([id, P]) => row(id, P.name, P.desc,
      P.hash ? Object.entries(P.hash).map(([a, x]) => fmtH(x, a)).join(' · ') + ` · ${P.w} W` : P.cap ? `${P.cap} W, ${Math.round(P.eff * 100)}% efficient` : P.w ? `${P.w} W` : '', partPrice(id), `data-buypart="${id}"`)).join('')}</div>`;
  }
  h += `<div class="mn-h4">Furniture + electrical</div><div class="mn-grid">${row('shelf', 'Wire shelf', 'Holds a row of miners on top. Desks and tables work too.', '0.9 m wide', SHELF_PRICE, 'data-buyshelf="1"')}
    ${Object.entries(UPGRADES).map(([id, u]) => M().upg[id] ? `<div class="mn-item"><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="row"><span class="pos">Installed</span></div></div>`
      : u.needs && !M().upg[u.needs] ? `<div class="mn-item"><div class="nm">${u.name}</div><div class="ds">${u.desc}</div><div class="row"><span class="mn-note" style="margin:0">Needs the ${UPGRADES[u.needs].name} first</span></div></div>`
      : row(id, u.name, u.desc, `Circuit now: ${fmtW(capacity())}`, u.price, `data-buyupg="${id}"`)).join('')}</div>`;
  return h;
}
function netTab() {
  let h = `<p class="mn-note">What a unit of hashrate earns per day on each coin. It moves with the coin's price; network difficulty follows the price a few days behind, and creeps up over time as the world adds more miners.</p>
    <table><tr><th>Coin</th><th>Algorithm</th><th class="num">Price</th><th class="num">vs start</th><th class="num">Difficulty</th><th class="num">Earns per day</th></tr>`;
  for (const sym of Object.keys(PAYS)) {
    const n = M().net[sym], a = ALGOS[COIN_ALGO[sym]], hp = hashPrice(sym), chg = priceOf(sym, N.S) / n.p0 - 1;
    h += `<tr><td><b>${COIN_LABEL[sym]}</b></td><td>${a.name}</td><td class="num">${usd(priceOf(sym, N.S))}</td><td class="num ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${(chg * 100).toFixed(1)}%</td>
      <td class="num">${(n.D * 100).toFixed(0)}%</td><td class="num">${usd(hp)} per ${a.unit}</td></tr>`;
  }
  return h + `</table><p class="mn-note">Litecoin miners also earn Dogecoin (merged mining): 70% of the value comes as LTC and 30% as DOGE. Pool fee: ${POOL_FEE * 100}%.</p>`;
}
function wire(body) {
  const q = (sel, fn) => body.querySelectorAll(sel).forEach(el => fn(el));
  const byUid = u => allRigs().find(p => p.uid === +u);
  q('[data-cx]', b => b.onclick = () => CX.open && CX.open(b.dataset.cx));
  q('[data-toggle]', b => b.onclick = () => { const p = byUid(b.dataset.toggle); if (p) useRig(p); render(body); });
  q('[data-place]', b => b.onclick = () => { const p = byUid(b.dataset.place); if (p) N.furn.move(p); });
  q('[data-coin]', s => s.onchange = () => { const p = byUid(s.dataset.coin); if (p) { p.rig.coin = s.value; N.save(); render(body); } });
  q('[data-apart]', b => b.onclick = () => {
    const p = byUid(b.dataset.apart); if (!p) return;
    if (p.rig.asic) { const amt = Math.round(asicPrice(p.rig.asic) * SELL); N.addMoney(amt, `HashParts: sold ${ASICS[p.rig.asic].name}`); N.toast(`Sold for ${usd(amt)}.`); }
    else { const P = p.rig.parts; for (const id of [P.shell, P.board, P.cpu, P.psu, ...P.gpus]) give(id); N.toast(`${p.rig.name} taken apart. The parts are in your inventory.`); }
    N.furn.remove(p); render(body);
  });
  q('#mnReset', b => b.onclick = () => { resetBreaker(); render(body); });
  q('[data-buypart]', b => b.onclick = () => { const id = b.dataset.buypart, pr = partPrice(id); if (N.S.money < pr) return; N.addMoney(-pr, `HashParts: ${PARTS[id].name}`); give(id); N.save(); N.toast(`${PARTS[id].name} added to your parts.`, 'good', 2000); render(body); });
  q('[data-buyasic]', b => b.onclick = () => {
    const id = b.dataset.buyasic, pr = asicPrice(id), a = ASICS[id]; if (N.S.money < pr) return;
    N.addMoney(-pr, `HashParts: ${a.name}`);
    const rig = { name: a.name.split(' (')[0].replace(' miner', ''), on: true, coin: ALGOS[a.algo].coins[0], asic: id };
    N.toast(`${a.name} delivered! Put it on a desk, table, shelf or the floor.`, 'good');
    N.furn.place(a.size === 's' ? 'mine_asic_s' : 'mine_asic_l', { rig, label: rig.name });
  });
  q('[data-buyshelf]', b => b.onclick = () => { if (N.S.money < SHELF_PRICE) return; N.addMoney(-SHELF_PRICE, 'HashParts: wire shelf'); N.furn.place('mine_shelf'); });
  q('[data-buyupg]', b => b.onclick = () => { const id = b.dataset.buyupg, u = UPGRADES[id]; if (N.S.money < u.price) return; N.addMoney(-u.price, `Electrician: ${u.name}`); M().upg[id] = true; N.advance(120); N.updateHUD(); N.save(); N.toast(`An electrician spent two hours in your room. Circuit capacity: ${fmtW(capacity())}.`, 'good', 5000); render(body); });
  q('[data-sellpart]', b => b.onclick = () => { const id = b.dataset.sellpart; if (!have(id)) return; const amt = Math.round(partPrice(id) * SELL); take(id); N.addMoney(amt, `HashParts: sold ${PARTS[id].name}`); render(body); });
  // builder
  q('[data-d]', s => s.onchange = () => { draft[s.dataset.d] = s.value; if (s.dataset.d === 'kind') draft.gpus = {}; draft.name = (body.querySelector('#mnName') || {}).value; render(body); });
  q('[data-gpu]', i => i.onchange = () => { draft.gpus[i.dataset.gpu] = Math.max(0, Math.floor(+i.value || 0)); draft.name = (body.querySelector('#mnName') || {}).value; render(body); });
  q('[data-gpu], #mnName', i => i.addEventListener('keydown', e => e.stopPropagation()));
  q('#mnAssemble', b => b.onclick = assemble);
}
setTimeout(() => { app = N.pcAddApp('mine', '⛏', 'MineOS', 'linear-gradient(135deg,#3ad66b,#1b5a3a)', render); }, 0);
// keep the numbers fresh while the app is open
setInterval(() => { if (bodyEl && bodyEl.closest('.win') && bodyEl.closest('.win').classList.contains('show') && tab === 'rigs' && !bodyEl.contains(document.activeElement)) render(bodyEl); }, 3000);

if (N.S) ensure(N.S);
window.__mining = { PARTS, ASICS, ALGOS, UPGRADES, spec, econ, hashPrice, capacity, allRigs, running, assemble, get draft() { return draft; }, set draft(d) { draft = d; }, resetBreaker, render: () => bodyEl && render(bodyEl) };
})();
