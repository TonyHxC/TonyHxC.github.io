// Pogey Life — CoinDen: a crypto exchange on the PC.
// Prices start from the real market (CoinGecko, fetched by the player's browser) and then move in game time:
// a random walk using each coin's real volatility, a shared "market" shock (alts follow BTC), volatility regimes,
// random news events, and a slow pull back toward the latest real price so the sim never drifts off forever.
(() => {
'use strict';
const N = window.POGEY;
if (!N) return;

// sym, CoinGecko id, name, colour, fallback price (Oct 2026), annual volatility, correlation with the market
const COINS = [
  ['BTC', 'bitcoin', 'Bitcoin', '#f7931a', 82070, 0.50, 0.95],
  ['ETH', 'ethereum', 'Ethereum', '#7b8ff0', 2486.7, 0.65, 0.88],
  ['BNB', 'binancecoin', 'BNB', '#f3ba2f', 738.25, 0.45, 0.70],
  ['XRP', 'ripple', 'XRP', '#a3aebb', 1.39, 0.75, 0.72],
  ['SOL', 'solana', 'Solana', '#19d38f', 110.02, 0.85, 0.82],
  ['TRX', 'tron', 'TRON', '#ff4a4f', 0.33, 0.40, 0.50],
  ['ZEC', 'zcash', 'Zcash', '#ecb244', 1219.29, 1.10, 0.45],
  ['HYPE', 'hyperliquid', 'Hyperliquid', '#62e3c8', 84.97, 1.00, 0.60],
  ['DOGE', 'dogecoin', 'Dogecoin', '#c9a93b', 0.083, 0.90, 0.75],
  ['XMR', 'monero', 'Monero', '#ff7a1a', 544.1, 0.65, 0.50],
  ['LINK', 'chainlink', 'Chainlink', '#4f7cf0', 12.78, 0.85, 0.80],
  ['ADA', 'cardano', 'Cardano', '#5a8cf0', 0.23, 0.80, 0.80],
  ['XLM', 'stellar', 'Stellar', '#c8d2de', 0.19, 0.75, 0.72],
  ['BCH', 'bitcoin-cash', 'Bitcoin Cash', '#8dc351', 277.81, 0.70, 0.78],
  ['LTC', 'litecoin', 'Litecoin', '#b8c0cc', 63.41, 0.70, 0.80],
].map(([sym, id, name, color, seed, vol, rho]) => ({ sym, id, name, color, seed, vol, rho }));
const BY = Object.fromEntries(COINS.map(c => [c.sym, c]));

const STEP = 5;           // game minutes per price tick (~2.5 real seconds)
const REC = 6;            // record a history point every 6 ticks (30 game minutes)
const HLEN = 7 * 48;      // 7 game days of history
const FEE = 0.006;        // 0.6% trading fee
const SPREAD = 0.001;     // you buy 0.1% above and sell 0.1% below the mid price
const REV = 0.25;         // pull toward the real price, per game day (half-life ~3 days)
const EVENT_DAYS = 1.4;   // a news event every ~1.4 game days on average
const MAX_ORDERS = 12;
const LIVE_KEY = 'pogeylife_crypto_live_v1';
const LIVE_TTL = 5 * 60e3, LIVE_EVERY = 10 * 60e3;
const LIVE_URL = 'https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=' + COINS.map(c => c.id).join(',');

// ---------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const shock = () => gauss() * (Math.random() < 0.04 ? 2.4 : 0.95); // fat tails: the odd big candle
const sig6 = x => +x.toPrecision(6);

// ---------------------------------------------------------------------
// Live prices (the player's browser fetches them; cached so reloads don't hammer the API)
// ---------------------------------------------------------------------
let live = null, liveErr = false, fetching = false;
try { live = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); } catch (e) {}
function fetchLive(force) {
  if (fetching || (!force && live && Date.now() - live.at < LIVE_TTL)) return;
  fetching = true;
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 9000);
  fetch(LIVE_URL, { signal: ac.signal }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => {
    const p = {}, chg = {};
    for (const c of COINS) if (d[c.id] && d[c.id].usd > 0) { p[c.sym] = d[c.id].usd; chg[c.sym] = d[c.id].usd_24h_change || 0; }
    if (Object.keys(p).length < 10) throw new Error('partial');
    live = { at: Date.now(), p, chg }; liveErr = false;
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(live)); } catch (e) {}
    applyLive();
  }).catch(() => { liveErr = true; refreshUI(); }).finally(() => { clearTimeout(to); fetching = false; });
}
function applyLive() {
  const S = N.S, c = S && S.crypto;
  if (!c || !live) return;
  for (const k of COINS) if (live.p[k.sym]) c.a[k.sym] = live.p[k.sym];
  // a brand new life that started on fallback prices: snap to the real market before anything has been traded
  if (c.src !== 'live' && !c.trades.length && !c.orders.length && S.t - c.born < 240) seedPrices(c, live);
  c.src = 'live';
  refreshUI();
}

// ---------------------------------------------------------------------
// State (S.crypto)
// ---------------------------------------------------------------------
function backfill(coin, p0, chg24) {
  // walk backwards from today's price with the same volatility, then bend the last day to match the real 24h move
  const sig = coin.vol / Math.sqrt(365) * Math.sqrt(30 / 1440);
  const h = new Array(HLEN); let p = p0;
  for (let i = HLEN - 1; i >= 0; i--) { h[i] = p; p *= Math.exp(-sig * shock()); }
  if (chg24 && isFinite(chg24)) {
    const want = Math.log(p0 / (p0 / (1 + chg24 / 100))), have = Math.log(h[HLEN - 1] / h[HLEN - 49]);
    for (let j = 0; j < 48; j++) { const f = (j + 1) / 48; h[HLEN - 48 + j] *= Math.exp(-(want - have) * (1 - f)); }
    for (let i = 0; i < HLEN - 48; i++) h[i] *= Math.exp(-(want - have));
  }
  h[HLEN - 1] = p0;
  return h.map(sig6);
}
function seedPrices(c, src) {
  for (const k of COINS) {
    const p0 = (src && src.p[k.sym]) || k.seed;
    c.p[k.sym] = p0; c.a[k.sym] = p0;
    c.h[k.sym] = backfill(k, p0, src && src.chg[k.sym]);
  }
}
function ensure(S) {
  if (S.crypto && S.crypto.v === 1) return;
  const c = S.crypto = { v: 1, t: S.t, k: 0, born: S.t, src: live ? 'live' : 'seed', vm: 1,
    p: {}, a: {}, h: {}, hold: {}, orders: [], trades: [], news: [], realized: 0, nextId: 1 };
  seedPrices(c, live);
}
N.hooks.fresh.push(ensure);
if (N.S) ensure(N.S);
const C = () => N.S.crypto;

// ---------------------------------------------------------------------
// Market simulation
// ---------------------------------------------------------------------
const MARKET_NEWS = [
  [1, 'Spot ETF inflows hit a record. Crypto rallies.'],
  [1, 'Central bank hints at rate cuts. Risk assets pump.'],
  [1, 'A big tech company adds Bitcoin to its balance sheet.'],
  [1, 'Short squeeze! Over-leveraged bears get liquidated.'],
  [1, 'A major country announces a crypto-friendly framework.'],
  [-1, 'A major exchange pauses withdrawals. Panic selling across crypto.'],
  [-1, 'Regulators announce a crackdown on crypto lending.'],
  [-1, 'A whale dumps 20,000 BTC on the market.'],
  [-1, 'Hundreds of millions in leveraged longs liquidated in an hour.'],
  [-1, 'Hot inflation report. Traders flee risk assets.'],
];
const COIN_NEWS = [
  [1, '{n} ships a major network upgrade.'],
  [1, '{n} gets listed on a huge new exchange.'],
  [1, 'An influencer won\'t stop posting about {n}. Retail piles in.'],
  [1, 'Rumour: {n} partnership with a payments giant.'],
  [1, 'Big fund discloses a large {n} position.'],
  [-1, '{n} network outage drags on for hours.'],
  [-1, 'Exploit drains a {n} bridge.'],
  [-1, 'A large {n} holder moves coins onto an exchange.'],
  [-1, '{n} delisted from a regional exchange.'],
  [-1, 'Developers of {n} feud in public. Holders get nervous.'],
];
const pick = a => a[Math.floor(Math.random() * a.length)];
function involved(c, sym) { return (c.hold[sym] && c.hold[sym].q > 0) || c.orders.some(o => o.sym === sym); }

function newsEvent(c) {
  const S = N.S;
  if (Math.random() < 0.45) {
    const [dir, txt] = pick(MARKET_NEWS), size = dir * (0.025 + Math.random() * 0.06);
    for (const k of COINS) c.p[k.sym] *= Math.exp(size * (0.4 + k.rho * 0.6) * (k.vol / 0.6) * (0.75 + Math.random() * 0.5));
    c.news.unshift({ t: S.t, txt, dir, sym: null, move: size });
    if (Object.keys(c.hold).length || c.orders.length) N.toast('📰 ' + txt, dir > 0 ? 'good' : 'bad', 5500);
  } else {
    const k = pick(COINS), [dir, tpl] = pick(COIN_NEWS), size = dir * (0.05 + Math.random() * 0.15);
    c.p[k.sym] *= Math.exp(size);
    const txt = tpl.replace('{n}', k.name);
    c.news.unshift({ t: S.t, txt, dir, sym: k.sym, move: size });
    if (involved(c, k.sym)) N.toast(`📰 ${txt} ${k.sym} ${size > 0 ? '+' : ''}${(Math.expm1(size) * 100).toFixed(1)}%`, dir > 0 ? 'good' : 'bad', 5500);
  }
  if (c.news.length > 30) c.news.length = 30;
}

function step(c) {
  c.t += STEP;
  const dd = STEP / 1440;
  c.vm = Math.min(2.5, Math.max(0.55, Math.exp(Math.log(c.vm) * 0.996 + gauss() * 0.035))); // calm and wild stretches
  const m = shock();
  for (const k of COINS) {
    const s = k.sym, sig = k.vol / Math.sqrt(365) * Math.sqrt(dd) * c.vm;
    const e = k.rho * m + Math.sqrt(1 - k.rho * k.rho) * shock();
    const pull = REV * dd * Math.log(c.a[s] / c.p[s]);
    c.p[s] *= Math.exp(pull + sig * e - 0.5 * sig * sig);
  }
  if (Math.random() < dd / EVENT_DAYS) newsEvent(c);
  c.k++;
  if (c.k % REC === 0) for (const k of COINS) { const h = c.h[k.sym]; h.push(sig6(c.p[k.sym])); if (h.length > HLEN) h.splice(0, h.length - HLEN); }
  fillOrders(c);
}

let uiTimer = 0;
N.hooks.update.push(dt => {
  const S = N.S, c = S && S.crypto; if (!c) return;
  let n = Math.floor((S.t - c.t) / STEP);
  if (n > 0) {
    if (n > HLEN * REC) { c.t = S.t - HLEN * REC * STEP; n = HLEN * REC; } // slept for a week? just simulate the last week
    for (let i = 0; i < n; i++) step(c);
    refreshUI();
  }
  uiTimer += dt; if (uiTimer > 30) { uiTimer = 0; refreshUI(); } // keeps "synced Xm ago" honest
});
setInterval(() => { if (N.started) fetchLive(true); }, LIVE_EVERY);
fetchLive(false);

// ---------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------
const usd = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fp(p) { // price
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return '$' + p.toFixed(p >= 100 ? 2 : 3);
  return '$' + p.toPrecision(4);
}
function fq(q) { // quantity
  if (q >= 1000) return q.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (q >= 1) return (+q.toFixed(4)).toString();
  return (+q.toPrecision(6)).toString();
}
const pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
const holding = sym => C().hold[sym] || { q: 0, cost: 0 };
function addHold(sym, q, cost) { const c = C(), h = c.hold[sym] || (c.hold[sym] = { q: 0, cost: 0 }); h.q += q; h.cost += cost; }
// for mining.js: read prices, and pay mined coins into the wallet (cost basis = what they were worth when mined)
N.cryptoApi = { coins: COINS, price: sym => N.S && N.S.crypto ? N.S.crypto.p[sym] : (BY[sym] || {}).seed,
  credit(sym, q) { if (q > 0 && N.S && N.S.crypto) { addHold(sym, q, q * N.S.crypto.p[sym]); return true; } return false; },
  // what you hold (incl. coins locked in sell orders), and what a market sell would pay after spread + fee
  holdings() { const c = N.S && N.S.crypto; if (!c) return []; const out = {};
    for (const [s, h] of Object.entries(c.hold)) if (h.q > 0) out[s] = { sym: s, q: h.q, cost: h.cost, locked: 0 };
    for (const o of c.orders) if (o.side === 'sell') { const r = out[o.sym] || (out[o.sym] = { sym: o.sym, q: 0, cost: 0, locked: 0 }); r.q += o.q; r.cost += o.cost; r.locked += o.q; }
    return Object.values(out).map(r => ({ ...r, price: c.p[r.sym], value: r.q * c.p[r.sym], sellNet: r.q * c.p[r.sym] * (1 - SPREAD) * (1 - FEE) })); },
  open(sym) { if (sym && BY[sym]) ui.sel = sym; ui.tab = 'hold'; if (cxApp) cxApp.open(); } };
let cxApp = null;
function takeHold(sym, q) { // returns cost basis removed
  const c = C(), h = c.hold[sym]; if (!h) return 0;
  const frac = Math.min(1, q / h.q), cost = h.cost * frac;
  h.q -= q; h.cost -= cost;
  if (h.q < 1e-10) delete c.hold[sym];
  return cost;
}
function logTrade(t) { const c = C(); c.trades.unshift({ t: N.S.t, ...t }); if (c.trades.length > 60) c.trades.length = 60; }
const online = () => !N.internetOn || N.internetOn();

function marketBuy(sym, amt) {
  const S = N.S, c = C();
  amt = Math.floor(amt * 100) / 100;
  if (!online() || !(amt >= 1) || amt > S.money + 1e-9) return false;
  const ask = c.p[sym] * (1 + SPREAD), fee = amt * FEE, q = (amt - fee) / ask;
  addHold(sym, q, amt);
  logTrade({ sym, side: 'buy', q, price: ask, total: amt, fee });
  N.addMoney(-amt, `CoinDen: bought ${fq(q)} ${sym}`);
  return q;
}
function marketSell(sym, q) {
  const c = C(), h = holding(sym);
  if (h.q - q < 1e-9 * Math.max(1, h.q)) q = Math.min(q, h.q);
  if (!online() || !(q > 0) || q > h.q) return false;
  const bid = c.p[sym] * (1 - SPREAD), gross = q * bid, fee = gross * FEE, net = gross - fee;
  const cost = takeHold(sym, q);
  c.realized += net - cost;
  logTrade({ sym, side: 'sell', q, price: bid, total: net, fee, pnl: net - cost });
  N.addMoney(net, `CoinDen: sold ${fq(q)} ${sym}`);
  return net;
}
function placeLimit(sym, side, limit, amount) {
  const S = N.S, c = C();
  if (!online() || c.orders.length >= MAX_ORDERS || !(limit > 0)) return false;
  if (side === 'buy') {
    amount = Math.floor(amount * 100) / 100;
    if (!(amount >= 1) || amount > S.money + 1e-9) return false;
    c.orders.push({ id: c.nextId++, sym, side, limit, usd: amount, t: S.t });
    N.addMoney(-amount, `CoinDen: limit buy ${sym} @ ${fp(limit)} (held)`);
  } else {
    const h = holding(sym); if (!(amount > 0) || amount > h.q + 1e-12) return false;
    amount = Math.min(amount, h.q);
    const cost = takeHold(sym, amount);
    c.orders.push({ id: c.nextId++, sym, side, limit, q: amount, cost, t: S.t });
  }
  return true;
}
function cancelOrder(id) {
  const c = C(), i = c.orders.findIndex(o => o.id === id); if (i < 0) return;
  const o = c.orders.splice(i, 1)[0];
  if (o.side === 'buy') N.addMoney(o.usd, `CoinDen: cancelled limit buy ${o.sym}`);
  else addHold(o.sym, o.q, o.cost);
}
function fillOrders(c) {
  for (let i = c.orders.length - 1; i >= 0; i--) {
    const o = c.orders[i], p = c.p[o.sym];
    if (o.side === 'buy' && p <= o.limit) {
      const fee = o.usd * FEE, q = (o.usd - fee) / o.limit;
      c.orders.splice(i, 1); addHold(o.sym, q, o.usd);
      logTrade({ sym: o.sym, side: 'buy', q, price: o.limit, total: o.usd, fee, limit: true });
      N.toast(`Limit buy filled: ${fq(q)} ${o.sym} @ ${fp(o.limit)}`, 'good', 5000); N.save();
    } else if (o.side === 'sell' && p >= o.limit) {
      const gross = o.q * o.limit, fee = gross * FEE, net = gross - fee;
      c.orders.splice(i, 1); c.realized += net - o.cost;
      logTrade({ sym: o.sym, side: 'sell', q: o.q, price: o.limit, total: net, fee, pnl: net - o.cost, limit: true });
      N.addMoney(net, `CoinDen: limit sell ${fq(o.q)} ${o.sym} filled`);
      N.toast(`Limit sell filled: ${fq(o.q)} ${o.sym} for ${usd(net)}`, 'good', 5000);
    }
  }
}
function portfolio() {
  const c = C(); let val = 0, cost = 0;
  for (const [s, h] of Object.entries(c.hold)) { val += h.q * c.p[s]; cost += h.cost; }
  for (const o of c.orders) { if (o.side === 'buy') { val += o.usd; cost += o.usd; } else { val += o.q * c.p[o.sym]; cost += o.cost; } }
  return { val, cost, unreal: val - cost };
}
const change = (sym, pts) => { const c = C(), h = c.h[sym], ref = h[Math.max(0, h.length - pts)]; return c.p[sym] / ref - 1; };

// ---------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .cx { --bg:#0e1017; --pan:#161924; --pan2:#1d2130; --line:#272c3d; --tx:#e8eaf2; --mu:#8a90a6; --up:#2fcf7f; --dn:#ff5c6c; --ac:#f0b90b;
    display:grid; grid-template-columns:260px 1fr; grid-template-rows:auto 1fr; height:100%; background:var(--bg); color:var(--tx); font-size:13px; }
  .cx * { box-sizing:border-box; }
  .cx-top { grid-column:1/3; display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  .cx-brand { font-weight:950; font-size:17px; letter-spacing:.5px; margin-right:6px; } .cx-brand span { color:var(--ac); }
  .cx-tile { background:var(--pan); border:1px solid var(--line); border-radius:9px; padding:5px 11px; }
  .cx-tile small { display:block; color:var(--mu); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; }
  .cx-tile b { font-size:15px; font-variant-numeric:tabular-nums; }
  .cx-src { margin-left:auto; font-size:11px; color:var(--mu); text-align:right; line-height:1.35; }
  .cx-src i { font-style:normal; font-weight:800; } .cx-src .on { color:var(--up); } .cx-src .off { color:var(--ac); }
  .cx-list { overflow:auto; border-right:1px solid var(--line); }
  .cx-row { display:grid; grid-template-columns:28px 1fr 56px auto; gap:8px; align-items:center; padding:8px 10px; cursor:pointer; border-bottom:1px solid #ffffff08; }
  .cx-row:hover { background:var(--pan); } .cx-row.on { background:var(--pan2); box-shadow:inset 3px 0 0 var(--ac); }
  .cx-ic { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:10px; color:#0e1017; }
  .cx-row .nm b { display:block; font-size:13px; } .cx-row .nm span { color:var(--mu); font-size:11px; }
  .cx-row .pr { text-align:right; font-variant-numeric:tabular-nums; } .cx-row .pr b { display:block; } .cx-row .pr span { font-size:11px; font-weight:800; }
  .cx-row canvas { width:56px; height:22px; }
  .up { color:var(--up); } .dn { color:var(--dn); }
  .cx-main { overflow:auto; padding:14px 16px; display:flex; flex-direction:column; gap:12px; min-width:0; }
  .cx-head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .cx-head .cx-ic { width:38px; height:38px; font-size:12px; }
  .cx-head h2 { margin:0; font-size:20px; } .cx-head h2 span { color:var(--mu); font-size:14px; font-weight:700; }
  .cx-big { font-size:26px; font-weight:900; font-variant-numeric:tabular-nums; }
  .cx-stats { display:flex; gap:16px; color:var(--mu); font-size:12px; flex-wrap:wrap; } .cx-stats b { color:var(--tx); font-variant-numeric:tabular-nums; }
  .cx-seg { display:inline-flex; background:var(--pan); border:1px solid var(--line); border-radius:8px; padding:2px; gap:2px; }
  .cx-seg button { font:inherit; font-size:12px; font-weight:800; border:0; background:transparent; color:var(--mu); padding:5px 11px; border-radius:6px; cursor:pointer; }
  .cx-seg button.on { background:var(--pan2); color:var(--tx); }
  .cx-chartbox { position:relative; background:var(--pan); border:1px solid var(--line); border-radius:12px; padding:8px 8px 4px; }
  .cx-chartbox canvas { width:100%; height:230px; display:block; }
  .cx-tip { position:absolute; pointer-events:none; background:#0b0d13ee; border:1px solid var(--line); border-radius:7px; padding:5px 8px; font-size:12px; white-space:nowrap; display:none; }
  .cx-tip b { display:block; font-size:13px; font-variant-numeric:tabular-nums; } .cx-tip span { color:var(--mu); }
  .cx-chartbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .cx-grid2 { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); gap:12px; }
  .cx-card { background:var(--pan); border:1px solid var(--line); border-radius:12px; padding:12px; }
  .cx-card h4 { margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.7px; color:var(--mu); }
  .cx-sides { display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:10px; }
  .cx-sides button { font:inherit; font-weight:900; border:1px solid var(--line); background:var(--pan2); color:var(--mu); padding:7px; border-radius:8px; cursor:pointer; }
  .cx-sides button.on.buy { background:var(--up); color:#06210f; border-color:var(--up); }
  .cx-sides button.on.sell { background:var(--dn); color:#2a0509; border-color:var(--dn); }
  .cx-f { display:flex; align-items:center; background:var(--bg); border:1px solid var(--line); border-radius:8px; margin:6px 0; }
  .cx-f label { color:var(--mu); font-size:11px; font-weight:800; padding:0 10px; min-width:76px; }
  .cx-f input { flex:1; min-width:0; font:inherit; font-size:15px; font-weight:800; background:transparent; border:0; color:var(--tx); padding:8px 4px; outline:none; font-variant-numeric:tabular-nums; }
  .cx-f em { font-style:normal; color:var(--mu); font-weight:800; padding:0 10px; }
  .cx-quick { display:flex; gap:4px; margin:6px 0; } .cx-quick button { flex:1; font:inherit; font-size:11px; font-weight:800; background:var(--pan2); border:1px solid var(--line); color:var(--tx); border-radius:6px; padding:5px 0; cursor:pointer; }
  .cx-prev { color:var(--mu); font-size:12px; min-height:34px; line-height:1.4; } .cx-prev b { color:var(--tx); }
  .cx-go { width:100%; font:inherit; font-size:14px; font-weight:900; border:0; border-radius:9px; padding:10px; cursor:pointer; margin-top:4px; }
  .cx-go.buy { background:var(--up); color:#06210f; } .cx-go.sell { background:var(--dn); color:#2a0509; } .cx-go:disabled { opacity:.35; cursor:not-allowed; }
  .cx-kv { display:grid; grid-template-columns:1fr auto; gap:6px 10px; font-size:13px; } .cx-kv span { color:var(--mu); } .cx-kv b { text-align:right; font-variant-numeric:tabular-nums; }
  .cx-tabs { display:flex; gap:4px; margin-bottom:8px; }
  .cx table { width:100%; border-collapse:collapse; font-size:12px; margin:0; }
  .cx th, .cx td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); }
  .cx th { color:var(--mu); font-size:10px; text-transform:uppercase; letter-spacing:.6px; }
  .cx td.n, .cx th.n { text-align:right; font-variant-numeric:tabular-nums; }
  .cx .x { font:inherit; font-size:11px; font-weight:800; background:var(--pan2); color:var(--dn); border:1px solid var(--line); border-radius:6px; padding:3px 8px; cursor:pointer; }
  .cx-empty { color:var(--mu); padding:14px 4px; text-align:center; }
  .cx-banner { background:#3a1218; border:1px solid #6a2430; color:#ffc2c9; border-radius:10px; padding:9px 12px; font-weight:700; }
  .cx-note { color:var(--mu); font-size:11px; line-height:1.45; }
  @media (max-width: 900px) { .cx { grid-template-columns:200px 1fr; } .cx-grid2 { grid-template-columns:1fr; } .cx-row { grid-template-columns:28px 1fr auto; } .cx-row canvas { display:none; } }`;
document.head.appendChild(css);

const ui = { body: null, sel: 'BTC', range: '1D', side: 'buy', type: 'market', tab: 'hold', hover: null, built: false };
const RANGES = { '1D': 48, '3D': 144, '1W': 336 };
const ic = (k, cls = '') => `<div class="cx-ic ${cls}" style="background:${k.color}">${k.sym.length > 3 ? k.sym.slice(0, 3) : k.sym}</div>`;
const q = sel => ui.body.querySelector(sel);
const ago = (t, now) => { const m = Math.max(0, Math.round((now - t) / 30) * 30), d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60); return m === 0 ? 'now' : (d ? d + 'd' + (h ? ' ' + h + 'h' : '') : h + 'h') + ' ago'; };
const shortTime = t => { const d = N.dayOf(t), m = Math.floor(t % 1440), h = Math.floor(m / 60); return `Day ${d} ${(h % 12) || 12}${String(m % 60).padStart(2, '0') === '00' ? '' : ':' + String(m % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };

function build(body) {
  ui.body = body; ui.built = true;
  body.parentElement.classList.add('dark');
  body.innerHTML = `<div class="cx">
    <div class="cx-top">
      <div class="cx-brand">Coin<span>Den</span></div>
      <div class="cx-tile"><small>Portfolio</small><b id="cxVal"></b></div>
      <div class="cx-tile"><small>Cash</small><b id="cxCash"></b></div>
      <div class="cx-tile"><small>Unrealized P&amp;L</small><b id="cxUnr"></b></div>
      <div class="cx-tile"><small>Realized P&amp;L</small><b id="cxReal"></b></div>
      <div class="cx-src" id="cxSrc"></div>
    </div>
    <div class="cx-list" id="cxList">${COINS.map(k => `<div class="cx-row" data-sym="${k.sym}">${ic(k)}
      <div class="nm"><b>${k.sym}</b><span>${k.name}</span></div><canvas width="112" height="44"></canvas>
      <div class="pr"><b></b><span></span></div></div>`).join('')}</div>
    <div class="cx-main">
      <div id="cxBanner"></div>
      <div class="cx-head"><span id="cxHic"></span><h2 id="cxName"></h2><div class="cx-big" id="cxPrice"></div><b id="cxChg"></b></div>
      <div class="cx-stats" id="cxStats"></div>
      <div class="cx-chartbox">
        <div class="cx-chartbar"><div class="cx-seg" id="cxRange">${Object.keys(RANGES).map(r => `<button data-r="${r}">${r}</button>`).join('')}</div>
          <span class="cx-note" id="cxRangeNote"></span></div>
        <canvas id="cxChart"></canvas><div class="cx-tip" id="cxTip"></div>
      </div>
      <div class="cx-grid2">
        <div class="cx-card">
          <div class="cx-sides"><button class="buy" data-side="buy">Buy</button><button class="sell" data-side="sell">Sell</button></div>
          <div class="cx-seg" id="cxType"><button data-type="market">Market</button><button data-type="limit">Limit</button></div>
          <div class="cx-f" id="cxLimRow"><label>Limit price</label><input id="cxLim" inputmode="decimal" autocomplete="off"><em>USD</em></div>
          <div class="cx-f"><label id="cxAmtLab"></label><input id="cxAmt" inputmode="decimal" placeholder="0" autocomplete="off"><em id="cxAmtUnit"></em></div>
          <div class="cx-quick">${[0.25, 0.5, 0.75, 1].map(f => `<button data-f="${f}">${f === 1 ? 'Max' : f * 100 + '%'}</button>`).join('')}</div>
          <div class="cx-prev" id="cxPrev"></div>
          <button class="cx-go" id="cxGo"></button>
        </div>
        <div class="cx-card"><h4>Your position</h4><div class="cx-kv" id="cxPos"></div>
          <p class="cx-note" style="margin-top:10px">Fee 0.6% per trade. Market orders fill instantly at the ask/bid (0.1% spread). Limit orders wait until the price hits your number; buy orders hold your cash until then.</p></div>
      </div>
      <div class="cx-card">
        <div class="cx-tabs cx-seg" id="cxTabs"><button data-tab="hold">Holdings</button><button data-tab="orders">Open orders</button><button data-tab="trades">Trade history</button><button data-tab="news">News</button></div>
        <div id="cxTable"></div>
      </div>
    </div></div>`;

  q('#cxList').onclick = e => { const r = e.target.closest('[data-sym]'); if (r) { ui.sel = r.dataset.sym; q('#cxLim').value = ''; q('#cxAmt').value = ''; refreshUI(); } };
  q('#cxRange').onclick = e => { const b = e.target.closest('[data-r]'); if (b) { ui.range = b.dataset.r; refreshUI(); } };
  q('.cx-sides').onclick = e => { const b = e.target.closest('[data-side]'); if (b) { ui.side = b.dataset.side; q('#cxAmt').value = ''; q('#cxLim').value = ''; refreshUI(); } };
  q('#cxType').onclick = e => { const b = e.target.closest('[data-type]'); if (b) { ui.type = b.dataset.type; q('#cxLim').value = ''; refreshUI(); } };
  q('#cxTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { ui.tab = b.dataset.tab; refreshUI(); } };
  q('.cx-quick').onclick = e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const f = +b.dataset.f;
    if (ui.side === 'buy') q('#cxAmt').value = (Math.floor(N.S.money * f * 100) / 100).toFixed(2);
    else { const hq = holding(ui.sel).q; q('#cxAmt').value = f === 1 ? String(hq) : String(Math.floor(hq * f * 1e8) / 1e8); }
    preview();
  };
  q('#cxAmt').oninput = preview; q('#cxLim').oninput = preview;
  for (const inp of [q('#cxAmt'), q('#cxLim')]) inp.onkeydown = e => { if (e.code !== 'Escape') e.stopPropagation(); if (e.key === 'Enter') submit(); };
  q('#cxGo').onclick = submit;
  q('#cxTable').onclick = e => { const b = e.target.closest('[data-cancel]'); if (b) { cancelOrder(+b.dataset.cancel); refreshUI(); } };
  const cv = q('#cxChart');
  cv.onmousemove = e => { const r = cv.getBoundingClientRect(); ui.hover = (e.clientX - r.left) / r.width; drawChart(); };
  cv.onmouseleave = () => { ui.hover = null; drawChart(); };
  window.addEventListener('resize', () => { if (visible()) drawChart(); });
}

function amounts() {
  const c = C(), p = c.p[ui.sel];
  const amt = parseFloat(q('#cxAmt').value.replace(/[$,]/g, ''));
  const lim = ui.type === 'limit' ? parseFloat(q('#cxLim').value.replace(/[$,]/g, '')) : NaN;
  return { c, p, amt, lim };
}
function preview() {
  const { c, p, amt, lim } = amounts(), k = BY[ui.sel], S = N.S, h = holding(ui.sel);
  const el = q('#cxPrev'), go = q('#cxGo');
  let msg = '', ok = false;
  const limOk = ui.type === 'market' || lim > 0;
  if (ui.type === 'limit' && !(lim > 0)) msg = 'Set the price you want to ' + ui.side + ' at.';
  else if (!(amt > 0)) msg = ui.side === 'buy' ? `Available: <b>${usd(S.money)}</b>` : `Available: <b>${fq(h.q)} ${k.sym}</b>`;
  else if (ui.side === 'buy') {
    const px = ui.type === 'limit' ? lim : p * (1 + SPREAD), fee = amt * FEE;
    if (amt < 1) msg = 'Minimum order is $1.';
    else if (amt > S.money + 1e-9) msg = `Not enough cash. You have <b>${usd(S.money)}</b>.`;
    else { ok = true; msg = `You get ≈ <b>${fq((amt - fee) / px)} ${k.sym}</b> at ${fp(px)}<br>Fee ${usd(fee)}`; }
  } else {
    const px = ui.type === 'limit' ? lim : p * (1 - SPREAD), gross = amt * px, fee = gross * FEE;
    if (amt > h.q + 1e-12) msg = `You only have <b>${fq(h.q)} ${k.sym}</b>.`;
    else { ok = true; const pnl = gross - fee - (h.q ? h.cost * amt / h.q : 0);
      msg = `You receive ≈ <b>${usd(gross - fee)}</b> at ${fp(px)}<br>Fee ${usd(fee)} · P&amp;L on these <b class="${pnl >= 0 ? 'up' : 'dn'}">${usd(pnl)}</b>`; }
  }
  if (ui.type === 'limit' && lim > 0 && ok) {
    const hit = ui.side === 'buy' ? lim >= p : lim <= p;
    msg += hit ? `<br><span class="up">This would fill right away (price is already ${ui.side === 'buy' ? 'below' : 'above'} it).</span>` : `<br>Fills when ${k.sym} ${ui.side === 'buy' ? 'drops to' : 'rises to'} ${fp(lim)} (${pct(lim / p - 1)}).`;
    if (c.orders.length >= MAX_ORDERS) { ok = false; msg = `Max ${MAX_ORDERS} open orders.`; }
  }
  if (!online()) ok = false;
  el.innerHTML = msg;
  go.disabled = !ok || !limOk;
}
function submit() {
  const { p, amt, lim } = amounts(), k = BY[ui.sel];
  if (q('#cxGo').disabled) return;
  let done = false;
  if (ui.type === 'market') {
    if (ui.side === 'buy') { const got = marketBuy(ui.sel, amt); if (got) { N.toast(`Bought ${fq(got)} ${k.sym}`, 'good'); done = true; } }
    else { const got = marketSell(ui.sel, amt); if (got) { N.toast(`Sold ${fq(amt)} ${k.sym} for ${usd(got)}`, 'good'); done = true; } }
  } else {
    if ((ui.side === 'buy' && lim >= p) || (ui.side === 'sell' && lim <= p)) { // marketable limit: just trade now
      const got = ui.side === 'buy' ? marketBuy(ui.sel, amt) : marketSell(ui.sel, amt);
      if (got) { N.toast(ui.side === 'buy' ? `Bought ${fq(got)} ${k.sym}` : `Sold ${fq(amt)} ${k.sym} for ${usd(got)}`, 'good'); done = true; }
    } else if (placeLimit(ui.sel, ui.side, lim, amt)) { N.toast(`Limit ${ui.side} placed: ${k.sym} @ ${fp(lim)}`, ''); done = true; ui.tab = 'orders'; }
  }
  if (done) { q('#cxAmt').value = ''; N.save(); refreshUI(); }
}

function spark(cv, h, now) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, pts = h.slice(-48).concat([now]);
  const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
  g.clearRect(0, 0, W, H); g.lineWidth = 2; g.strokeStyle = now >= pts[0] ? '#2fcf7f' : '#ff5c6c'; g.beginPath();
  pts.forEach((v, i) => { const x = i / (pts.length - 1) * (W - 2) + 1, y = H - 3 - (v - lo) / r * (H - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}
function niceStep(range) { const m = Math.pow(10, Math.floor(Math.log10(range / 4))), f = range / 4 / m; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m; }
function drawChart() {
  const c = C(), cv = q('#cxChart'), box = cv.parentElement, dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const h = c.h[ui.sel], n = Math.min(RANGES[ui.range], h.length);
  const pts = h.slice(-n).concat([c.p[ui.sel]]);
  const tLast = c.t - (c.k % REC) * STEP, times = pts.map((_, i) => i === pts.length - 1 ? c.t : tLast - (n - 1 - i) * REC * STEP);
  let lo = Math.min(...pts), hi = Math.max(...pts); const pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
  const L = 6, R = 70, T = 8, B = 22, pw = W - L - R, ph = H - T - B;
  const X = i => L + i / (pts.length - 1) * pw, Y = v => T + (hi - v) / (hi - lo) * ph;
  const up = pts[pts.length - 1] >= pts[0], col = up ? '#2fcf7f' : '#ff5c6c';
  // grid + y labels
  g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
  const st = niceStep(hi - lo);
  for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) {
    const y = Math.round(Y(v)) + 0.5; g.strokeStyle = '#ffffff10'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.fillStyle = '#8a90a6'; g.textAlign = 'left'; g.fillText(fp(v), L + pw + 8, y);
  }
  // x labels
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const every = Math.max(1, Math.round((pts.length - 1) / 4));
  for (let i = 0; i < pts.length - 1; i += every) if (i > 0) g.fillText(ago(times[i], c.t), X(i), H - 6);
  // area + line
  const grad = g.createLinearGradient(0, T, 0, T + ph); grad.addColorStop(0, up ? '#2fcf7f33' : '#ff5c6c33'); grad.addColorStop(1, '#00000000');
  g.beginPath(); pts.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
  g.lineTo(X(pts.length - 1), T + ph); g.lineTo(X(0), T + ph); g.closePath(); g.fillStyle = grad; g.fill();
  g.beginPath(); pts.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)));
  g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  // last price tag
  const ly = Y(pts[pts.length - 1]);
  g.fillStyle = col; g.beginPath(); g.arc(X(pts.length - 1), ly, 4, 0, 7); g.fill();
  g.fillRect(L + pw + 2, ly - 9, R - 4, 18); g.fillStyle = '#0e1017'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'bold 11px system-ui, sans-serif';
  g.fillText(fp(pts[pts.length - 1]), L + pw + 6, ly);
  // your limit orders as dashed lines
  for (const o of c.orders) if (o.sym === ui.sel && o.limit > lo && o.limit < hi) {
    const y = Y(o.limit); g.setLineDash([4, 4]); g.strokeStyle = o.side === 'buy' ? '#2fcf7f99' : '#ff5c6c99'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#8a90a6'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`your ${o.side} ${fp(o.limit)}`, L + 4, y - 7);
  }
  // hover crosshair + tooltip
  const tip = q('#cxTip');
  if (ui.hover != null) {
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((ui.hover * W - L) / pw * (pts.length - 1))));
    const x = X(i), y = Y(pts[i]);
    g.strokeStyle = '#ffffff40'; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(x) + 0.5, T); g.lineTo(Math.round(x) + 0.5, T + ph); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = '#161924'; g.lineWidth = 2; g.stroke();
    tip.style.display = 'block';
    tip.innerHTML = `<b>${fp(pts[i])}</b><span>${times[i] >= 0 ? N.clockStr(times[i]) : ago(times[i], c.t)}</span>`;
    const tw = tip.offsetWidth; tip.style.left = Math.min(W - tw - 4, Math.max(4, x + 12 + (x + 12 + tw > W - R ? -tw - 24 : 0))) + 8 + 'px'; tip.style.top = Math.max(4, y - 44) + 8 + 'px';
  } else tip.style.display = 'none';
  q('#cxRangeNote').textContent = `${pct(pts[pts.length - 1] / pts[0] - 1)} over ${ui.range === '1D' ? '1 day' : ui.range === '3D' ? '3 days' : '1 week'} (game time)`;
}

function table() {
  const c = C(), el = q('#cxTable');
  const row = (cells) => `<tr>${cells.join('')}</tr>`;
  if (ui.tab === 'hold') {
    const rows = Object.entries(c.hold).map(([s, h]) => {
      const v = h.q * c.p[s], pnl = v - h.cost;
      return row([`<td><b>${s}</b></td>`, `<td class="n">${fq(h.q)}</td>`, `<td class="n">${fp(h.cost / h.q)}</td>`, `<td class="n">${fp(c.p[s])}</td>`, `<td class="n">${usd(v)}</td>`, `<td class="n ${pnl >= 0 ? 'up' : 'dn'}">${usd(pnl)} (${pct(pnl / h.cost)})</td>`]);
    });
    el.innerHTML = rows.length ? `<table><tr><th>Coin</th><th class="n">Amount</th><th class="n">Avg cost</th><th class="n">Price</th><th class="n">Value</th><th class="n">P&amp;L</th></tr>${rows.join('')}</table>` : '<div class="cx-empty">You don\'t own any crypto yet.</div>';
  } else if (ui.tab === 'orders') {
    const rows = c.orders.map(o => row([`<td><b class="${o.side === 'buy' ? 'up' : 'dn'}">${o.side.toUpperCase()}</b> ${o.sym}</td>`, `<td class="n">${fp(o.limit)}</td>`, `<td class="n">${o.side === 'buy' ? usd(o.usd) : fq(o.q) + ' ' + o.sym}</td>`, `<td class="n">${pct(o.limit / c.p[o.sym] - 1)}</td>`, `<td>${shortTime(o.t)}</td>`, `<td class="n"><button class="x" data-cancel="${o.id}">Cancel</button></td>`]));
    el.innerHTML = rows.length ? `<table><tr><th>Order</th><th class="n">Limit</th><th class="n">Size</th><th class="n">Distance</th><th>Placed</th><th></th></tr>${rows.join('')}</table>` : '<div class="cx-empty">No open orders. Pick "Limit" to set a price and wait for it.</div>';
  } else if (ui.tab === 'trades') {
    const rows = c.trades.map(t => row([`<td>${shortTime(t.t)}</td>`, `<td><b class="${t.side === 'buy' ? 'up' : 'dn'}">${t.side.toUpperCase()}</b> ${t.sym}${t.limit ? ' <span class="cx-note">limit</span>' : ''}</td>`, `<td class="n">${fq(t.q)}</td>`, `<td class="n">${fp(t.price)}</td>`, `<td class="n">${usd(t.total)}</td>`, `<td class="n">${usd(t.fee)}</td>`, `<td class="n ${t.pnl == null ? '' : t.pnl >= 0 ? 'up' : 'dn'}">${t.pnl == null ? '–' : usd(t.pnl)}</td>`]));
    el.innerHTML = rows.length ? `<table><tr><th>Time</th><th>Trade</th><th class="n">Amount</th><th class="n">Price</th><th class="n">Total</th><th class="n">Fee</th><th class="n">P&amp;L</th></tr>${rows.join('')}</table>` : '<div class="cx-empty">No trades yet.</div>';
  } else {
    const rows = c.news.map(nw => row([`<td style="white-space:nowrap">${shortTime(nw.t)}</td>`, `<td>${nw.txt}</td>`, `<td class="n ${nw.dir > 0 ? 'up' : 'dn'}">${nw.sym || 'Market'} ${pct(Math.expm1(nw.move))}</td>`]));
    el.innerHTML = rows.length ? `<table>${rows.join('')}</table>` : '<div class="cx-empty">Quiet market. Headlines that move prices show up here.</div>';
  }
}

const visible = () => ui.built && ui.body && ui.body.closest('.win').classList.contains('show');
function refreshUI() {
  if (!visible() || !N.S || !N.S.crypto) return;
  const c = C(), k = BY[ui.sel], p = c.p[ui.sel], pf = portfolio(), S = N.S;
  // top bar
  q('#cxVal').textContent = usd(pf.val + S.money);
  q('#cxCash').textContent = usd(S.money);
  const unr = q('#cxUnr'); unr.textContent = usd(pf.unreal); unr.className = pf.unreal >= 0 ? 'up' : 'dn';
  const rl = q('#cxReal'); rl.textContent = usd(c.realized); rl.className = c.realized >= 0 ? 'up' : 'dn';
  const ago = live ? Math.round((Date.now() - live.at) / 60000) : null;
  q('#cxSrc').innerHTML = c.src === 'live' && live
    ? `<i class="on">● Based on the real market</i><br>Last real-price sync ${ago < 1 ? 'just now' : ago + 'm ago'} · Powered by CoinGecko`
    : `<i class="off">○ Offline prices</i><br>${liveErr ? "Couldn't reach CoinGecko" : 'Connecting to CoinGecko…'} · using Oct 2026 prices`;
  // list
  for (const r of q('#cxList').children) {
    const s = r.dataset.sym, ch = change(s, 48);
    r.classList.toggle('on', s === ui.sel);
    r.querySelector('.pr b').textContent = fp(c.p[s]);
    const sp = r.querySelector('.pr span'); sp.textContent = pct(ch); sp.className = ch >= 0 ? 'up' : 'dn';
    spark(r.querySelector('canvas'), c.h[s], c.p[s]);
  }
  // header
  q('#cxHic').innerHTML = ic(k); q('#cxName').innerHTML = `${k.name} <span>${k.sym}</span>`;
  q('#cxPrice').textContent = fp(p);
  const ch = change(ui.sel, 48), chEl = q('#cxChg'); chEl.textContent = pct(ch) + ' 24h'; chEl.className = ch >= 0 ? 'up' : 'dn';
  const d1 = c.h[ui.sel].slice(-48).concat([p]), w1 = c.h[ui.sel].concat([p]);
  q('#cxStats').innerHTML = `<span>24h high <b>${fp(Math.max(...d1))}</b></span><span>24h low <b>${fp(Math.min(...d1))}</b></span><span>7d <b class="${change(ui.sel, HLEN) >= 0 ? 'up' : 'dn'}">${pct(change(ui.sel, HLEN))}</b></span><span>7d range <b>${fp(Math.min(...w1))} – ${fp(Math.max(...w1))}</b></span>`
    + (live && live.p[ui.sel] ? `<span>Real price <b>${fp(live.p[ui.sel])}</b></span>` : '');
  for (const b of q('#cxRange').children) b.classList.toggle('on', b.dataset.r === ui.range);
  drawChart();
  // trade box
  for (const b of q('.cx-sides').children) b.classList.toggle('on', b.dataset.side === ui.side);
  for (const b of q('#cxType').children) b.classList.toggle('on', b.dataset.type === ui.type);
  q('#cxLimRow').style.display = ui.type === 'limit' ? '' : 'none';
  if (ui.type === 'limit' && !q('#cxLim').value) q('#cxLim').value = String(+(p * (ui.side === 'buy' ? 0.98 : 1.02)).toPrecision(5));
  q('#cxAmtLab').textContent = ui.side === 'buy' ? 'Spend' : 'Amount';
  q('#cxAmtUnit').textContent = ui.side === 'buy' ? 'USD' : k.sym;
  const go = q('#cxGo'); go.className = 'cx-go ' + ui.side; go.textContent = `${ui.type === 'limit' ? 'Place limit ' : ''}${ui.side === 'buy' ? 'Buy' : 'Sell'} ${k.sym}`;
  q('#cxBanner').innerHTML = online() ? '' : '<div class="cx-banner">📡 No internet. Your connection was cut off for an unpaid bill, so you can\'t trade until it\'s paid. Open orders still fill.</div>';
  preview();
  // position
  const h = holding(ui.sel), v = h.q * p, pnl = v - h.cost, locked = c.orders.filter(o => o.sym === ui.sel);
  q('#cxPos').innerHTML = h.q > 0
    ? `<span>Amount</span><b>${fq(h.q)} ${k.sym}</b><span>Value</span><b>${usd(v)}</b><span>Avg buy price</span><b>${fp(h.cost / h.q)}</b><span>Cost</span><b>${usd(h.cost)}</b><span>P&amp;L</span><b class="${pnl >= 0 ? 'up' : 'dn'}">${usd(pnl)} (${pct(pnl / h.cost)})</b>`
    : `<span>Amount</span><b>0 ${k.sym}</b><span>Value</span><b>$0.00</b>`;
  if (locked.length) q('#cxPos').innerHTML += `<span>In open orders</span><b>${locked.length}</b>`;
  for (const b of q('#cxTabs').children) b.classList.toggle('on', b.dataset.tab === ui.tab);
  table();
}

function open(body) {
  if (!ui.built || ui.body !== body) build(body);
  fetchLive(false);
  requestAnimationFrame(refreshUI);
  refreshUI();
}

cxApp = N.pcAddApp('crypto', '₿', 'CoinDen', 'linear-gradient(135deg,#f0b90b,#e5711d)', open);

// test hooks
window.__crypto = { COINS, get c() { return C(); }, step: n => { for (let i = 0; i < n; i++) step(C()); N.S.t = Math.max(N.S.t, C().t); refreshUI(); },
  marketBuy, marketSell, placeLimit, cancelOrder, portfolio, ui, refreshUI, setLive(d) { live = d; applyLive(); }, newsEvent: () => newsEvent(C()) };
})();
