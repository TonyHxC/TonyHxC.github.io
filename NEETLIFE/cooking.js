// NEETLIFE — cooking.
// Self-contained module: fridge, cutting board, stove + pan, trash, eating, a Food meter,
// and a Groceries app on the PC. It plugs into game.js through window.NEET (hooks + helpers).
(() => {
'use strict';
const N = window.NEET;
if (!N) return;

// ---------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------
const KX = 4.38;                                  // front edge of the kitchen counter (see game.js)
const PAN = { x: KX + 0.2, y: 0.914, z: 1.12, r: 0.13 };
const BOARD = { x: KX + 0.24, y: 0.925, z: 1.76 };
const KNOB = { x: KX - 0.045, y: 0.76, z: 1.12 };
const PAN_MAX = 3;
const CHOPS = 5;
const START_FRIDGE = { egg: 6, bread: 4, onion: 2 };
const FOOD_START = 70;
const FOOD_PER_GAME_MIN = 100 / (36 * 60);        // an empty stomach in ~36 game hours

// Ingredient definitions. times = seconds on a lit burner to reach [cooked, overcooked, burnt].
const ING = {
  egg:           { name: 'Egg',           panName: 'egg',           times: [7, 13, 20] },
  bread:         { name: 'Bread slice',   panName: 'bread',         times: [5, 9, 14] },
  onion:         { name: 'Onion',         chopTo: 'onion_chopped' },
  onion_chopped: { name: 'Chopped onion', panName: 'onion',         times: [6, 11, 17] },
};
// colour ramps: raw → cooked → overcooked → burnt
const RAMP = {
  egg:   ['#f3efe6', '#ffffff', '#e9c98f', '#352617'],
  yolk:  ['#ffb52e', '#ffc23d', '#dc951c', '#24160a'],
  bread: ['#ecd5a2', '#c98b42', '#8a5222', '#2b1a10'],
  onion_chopped: ['#efe6f2', '#e8c27a', '#a8692e', '#2a1a10'],
};
const GROCERIES = [
  { id: 'egg',   label: 'Eggs (6)',         qty: 6, price: 5, icon: '🥚' },
  { id: 'bread', label: 'Bread (6 slices)', qty: 6, price: 4, icon: '🍞' },
  { id: 'onion', label: 'Onions (3)',       qty: 3, price: 3, icon: '🧅' },
];
// Recipes: sorted pan contents → dish name
const RECIPES = {
  'egg': 'Fried egg', 'egg,egg': 'Two fried eggs', 'egg,egg,egg': 'Triple fried eggs',
  'bread': 'Toast', 'bread,bread': 'Two slices of toast', 'bread,bread,bread': 'A stack of toast',
  'onion_chopped': 'Fried onions', 'onion_chopped,onion_chopped': 'Caramelized onions',
  'egg,onion_chopped': 'Onion omelette', 'egg,egg,onion_chopped': 'Big onion omelette',
  'bread,egg': 'Egg on toast', 'bread,egg,egg': 'Eggs on toast',
  'bread,egg,onion_chopped': 'Breakfast sandwich', 'bread,onion_chopped': 'Onion toast',
  'bread,bread,egg': 'Egg sandwich',
};

// ---------------------------------------------------------------------
// State (lives in the save as S.kitchen / S.food)
// ---------------------------------------------------------------------
function ensure(S) {
  if (!S.kitchen) S.kitchen = { fridge: { ...START_FRIDGE }, held: null, board: null, pan: [], burner: false, chops: 0 };
  if (typeof S.food !== 'number') S.food = FOOD_START;
}
N.hooks.fresh.push(ensure);
if (N.S) ensure(N.S);
const K = () => N.S.kitchen;

function stage(item) {
  const d = ING[item.k]; if (!d || !d.times) return 'raw';
  const [a, b, c] = d.times, t = item.cook || 0;
  return t >= c ? 'burnt' : t >= b ? 'over' : t >= a ? 'cooked' : t > a * 0.35 ? 'cooking' : 'raw';
}
const itemName = it => it.k === 'dish' ? it.name : (ING[it.k].name + (it.cook > 0 ? ` (${({ raw: 'raw', cooking: 'half-cooked', cooked: 'cooked', over: 'overcooked', burnt: 'burnt' })[stage(it)]})` : ''));

// ---------------------------------------------------------------------
// Audio (own context, created on first interaction)
// ---------------------------------------------------------------------
let ac = null, noise = null, sizzle = null;
function audio() {
  if (ac) return ac;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; }
  return ac;
}
function beep(freq, dur, type = 'square', vol = 0.06) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur + 0.02);
}
function chopSound() { const a = audio(); if (!a) return; const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = 'bandpass'; f.frequency.value = 2500; g.gain.setValueAtTime(0.25, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.07);
  s.connect(f).connect(g).connect(a.destination); s.start(); s.stop(a.currentTime + 0.08); beep(180, 0.05, 'triangle', 0.08); }
function setSizzle(level) { // 0..1, continuous
  const a = audio(); if (!a) return;
  if (!sizzle) {
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noise; s.loop = true; f.type = 'highpass'; f.frequency.value = 3500; g.gain.value = 0;
    s.connect(f).connect(g).connect(a.destination); s.start(); sizzle = g;
  }
  sizzle.gain.setTargetAtTime(level * 0.05, a.currentTime, 0.1);
}

// ---------------------------------------------------------------------
// UI: held-item bar, Food chip, fridge panel
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  #heldBar { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); background: #0d0c14dd; border: 1px solid #ffffff22;
    border-radius: 10px; padding: 8px 14px; font-weight: 700; font-size: 14px; display: none; pointer-events: none; white-space: nowrap; }
  #heldBar kbd { background: #ffcf5a; color: #111; border-radius: 4px; padding: 0 6px; margin: 0 4px; font-family: inherit; }
  #heldBar .q { font-weight: 800; }
  .chip.food { min-width: 108px; position: relative; overflow: hidden; }
  .chip.food .bar { position: absolute; left: 0; bottom: 0; height: 3px; background: #6fe39a; }
  #chopBar { position: fixed; left: 50%; top: calc(50% + 60px); transform: translateX(-50%); width: 160px; height: 8px; background: #0008; border-radius: 99px; display: none; overflow: hidden; }
  #chopBar div { height: 100%; background: #ffcf5a; width: 0; transition: width .1s; }
  #fridgePanel { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: #000a; z-index: 15; }
  #fridgePanel.show { display: flex; }
  #fridgePanel .fr { width: min(420px, 92vw); background: linear-gradient(180deg, #f6f7f8, #e3e6ea); color: #1b1a22; border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px #000c, inset 0 0 0 3px #fff; }
  #fridgePanel h3 { margin: 0 0 4px; } #fridgePanel p { margin: 0 0 12px; color: #666; font-size: 13px; }
  #fridgePanel .shelf { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 12px; background: #dfe9f0; border-radius: 10px; box-shadow: inset 0 -4px 0 #c5d3dd; }
  #fridgePanel .it { background: #fff; border-radius: 10px; padding: 10px 6px; text-align: center; border: 2px solid transparent; cursor: pointer; font-weight: 700; font-size: 13px; }
  #fridgePanel .it:hover { border-color: #e6b23a; }
  #fridgePanel .it .e { font-size: 30px; display: block; }
  #fridgePanel .it.none { opacity: .35; cursor: not-allowed; }
  #fridgePanel .row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
  #fridgePanel button.close { font: inherit; font-weight: 800; border: 0; border-radius: 8px; padding: 9px 16px; background: #24223a; color: #fff; cursor: pointer; }
  .gro td .wbtn { min-width: 70px; }`;
document.head.appendChild(css);
const held = document.createElement('div'); held.id = 'heldBar'; document.body.appendChild(held);
const chopBar = document.createElement('div'); chopBar.id = 'chopBar'; chopBar.innerHTML = '<div></div>'; document.body.appendChild(chopBar);
const foodChip = document.createElement('div'); foodChip.className = 'chip food'; foodChip.innerHTML = '<span></span><div class="bar"></div>';
document.getElementById('hud').appendChild(foodChip);
const fridge = document.createElement('div'); fridge.id = 'fridgePanel';
fridge.innerHTML = `<div class="fr"><h3>Fridge</h3><p>Take one thing at a time. It's cold in here.</p><div class="shelf" id="frShelf"></div>
  <div class="row"><span id="frNote" style="font-size:13px;color:#666"></span><button class="close" id="frClose">Close</button></div></div>`;
document.body.appendChild(fridge);
const ICON = { egg: '🥚', bread: '🍞', onion: '🧅' };

function openFridge() {
  const k = K(); const shelf = document.getElementById('frShelf'); shelf.innerHTML = '';
  for (const id of ['egg', 'bread', 'onion']) {
    const n = k.fridge[id] || 0, el = document.createElement('div');
    el.className = 'it' + (n ? '' : ' none');
    el.innerHTML = `<span class="e">${ICON[id]}</span>${ING[id].name}<br><small>× ${n}</small>`;
    el.onclick = () => { if (!n) return; k.fridge[id]--; k.held = { k: id, cook: 0 }; closeFridge(); N.toast(`You grab ${id === 'egg' ? 'an egg' : id === 'onion' ? 'an onion' : 'a slice of bread'}.`); N.save(); };
    shelf.appendChild(el);
  }
  const total = Object.values(k.fridge).reduce((a, b) => a + b, 0);
  document.getElementById('frNote').textContent = total ? '' : 'Empty. Order groceries on the PC.';
  fridge.classList.add('show'); N.openModal();
}
function closeFridge() { fridge.classList.remove('show'); N.closeModal(); hud(); }
document.getElementById('frClose').onclick = closeFridge;
document.addEventListener('keydown', e => { if (fridge.classList.contains('show') && (e.code === 'Escape' || e.code === 'KeyE')) { e.stopPropagation(); closeFridge(); } }, true);

function hud() {
  const S = N.S; if (!S || !S.kitchen) return;
  const f = Math.max(0, Math.round(S.food));
  foodChip.querySelector('span').textContent = `Food ${f}%`;
  const bar = foodChip.querySelector('.bar'); bar.style.width = f + '%';
  bar.style.background = f > 50 ? '#6fe39a' : f > 25 ? '#ffcf5a' : '#ff6b6b';
  foodChip.style.color = f > 25 ? '' : '#ff6b6b';
  const h = K().held;
  if (h && N.active) {
    held.style.display = 'block';
    held.innerHTML = h.k === 'dish'
      ? `Holding <b>${h.name}</b> <span class="q" style="color:${QCOL[h.q]}">${QLABEL[h.q]}</span> · <kbd>F</kbd>eat`
      : `Holding <b>${itemName(h)}</b>`;
  } else held.style.display = 'none';
}
N.hooks.hud.push(hud);

// ---------------------------------------------------------------------
// Dishes
// ---------------------------------------------------------------------
const QLABEL = { perfect: '★★★ perfect', over: '★★ overcooked', under: '★ undercooked', burnt: '☠ burnt' };
const QCOL = { perfect: '#6fe39a', over: '#ffcf5a', under: '#ffb070', burnt: '#ff6b6b' };
function makeDish(items) {
  const keys = items.map(i => i.k).sort();
  const stages = items.map(stage);
  const q = stages.some(s => s === 'burnt') ? 'burnt' : stages.some(s => s === 'raw' || s === 'cooking') ? 'under' : stages.some(s => s === 'over') ? 'over' : 'perfect';
  const base = RECIPES[keys.join(',')] || 'Mystery fry-up';
  const prefix = { perfect: '', over: 'Overcooked ', under: 'Undercooked ', burnt: 'Burnt ' }[q];
  const name = prefix ? prefix + base.charAt(0).toLowerCase() + base.slice(1) : base;
  const value = Math.round((22 + 16 * (items.length - 1)) * { perfect: 1.45, over: 1.0, under: 0.6, burnt: 0.2 }[q]);
  return { k: 'dish', name, q, value, parts: items.map(i => ({ k: i.k, cook: i.cook })) };
}
function eat() {
  const k = K(), d = k.held;
  if (!d || d.k !== 'dish') return;
  N.S.food = Math.min(100, N.S.food + d.value);
  k.held = null;
  const lines = {
    perfect: [`${d.name}. Honestly? Restaurant quality.`, `You savour every bite of the ${d.name.toLowerCase()}.`],
    over: [`${d.name}. A bit dry, but food is food.`],
    under: [`${d.name}. Your stomach gurgles ominously.`, `${d.name}. Probably fine. Probably.`],
    burnt: [`You choke down ${d.name.toLowerCase()}. It tastes like regret and charcoal.`],
  }[d.q];
  N.toast(`${lines[Math.floor(Math.random() * lines.length)]} (+${d.value} food)`, d.q === 'perfect' ? 'good' : d.q === 'burnt' ? 'bad' : '');
  beep(520, 0.08, 'triangle', 0.05); setTimeout(() => beep(660, 0.1, 'triangle', 0.05), 90);
  N.save(); hud();
}

// ---------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------
const byId = id => N.things.find(t => t.id === id);
const P = (id, fn) => { const t = byId(id); if (t) t.prompt = fn; };
P('fridge', () => { const h = K().held; return h && !h.cook && ING[h.k] && h.k !== 'onion_chopped' ? `Put back ${ING[h.k].name.toLowerCase()}` : 'Open fridge'; });
P('board', () => {
  const k = K(), h = k.held, b = k.board;
  if (h && !b) return `Put ${itemName(h).toLowerCase()} on the board`;
  if (h && b) return 'Board is full';
  if (b && ING[b.k] && ING[b.k].chopTo) return `Chop ${ING[b.k].name.toLowerCase()} (${k.chops}/${CHOPS})`;
  if (b) return `Pick up ${itemName(b).toLowerCase()}`;
  return 'Cutting board';
});
P('pan', () => {
  const k = K(), h = k.held;
  if (h) {
    if (h.k === 'dish') return 'Already cooked';
    if (ING[h.k].chopTo) return 'Chop it first';
    if (k.pan.length >= PAN_MAX) return 'Pan is full';
    return `Add ${ING[h.k].panName} to the pan`;
  }
  if (k.pan.length) return `Take it out: ${makeDish(k.pan).name}`;
  return 'Pan (empty)';
});
P('knob', () => K().burner ? 'Turn the burner off' : 'Turn the burner on');
P('trash', () => K().held ? `Throw away ${itemName(K().held).toLowerCase()}` : 'Trash');

function interact(id) {
  const k = K(); audio();
  if (id === 'fridge') {
    if (k.held && !k.held.cook && ING[k.held.k] && k.held.k !== 'onion_chopped') {
      k.fridge[k.held.k] = (k.fridge[k.held.k] || 0) + 1; k.held = null; N.toast('Back in the fridge it goes.'); N.save(); return true;
    }
    if (k.held) { N.toast('Your hands are full.'); return true; }
    openFridge(); return true;
  }
  if (id === 'board') {
    if (k.held) {
      if (k.board) { N.toast('The cutting board is already in use.'); return true; }
      k.board = k.held; k.held = null; k.chops = 0; beep(240, 0.04, 'triangle', 0.05); N.save(); return true;
    }
    if (!k.board) { N.toast('A cutting board and a suspiciously sharp knife.'); return true; }
    const d = ING[k.board.k];
    if (d && d.chopTo) {
      k.chops++; chopSound(); chopFlash = 0.2;
      if (k.chops >= CHOPS) { k.board = { k: d.chopTo, cook: 0 }; k.chops = 0; N.toast(`${ING[d.chopTo].name}, done. Your eyes are watering.`); N.save(); }
      return true;
    }
    k.held = k.board; k.board = null; N.save(); return true;
  }
  if (id === 'pan') {
    const h = k.held;
    if (h) {
      if (h.k === 'dish') { N.toast("That's already cooked."); return true; }
      if (ING[h.k].chopTo) { N.toast(`You can't fry a whole ${ING[h.k].name.toLowerCase()}. Chop it on the board first.`); return true; }
      if (k.pan.length >= PAN_MAX) { N.toast('The pan is full.'); return true; }
      k.pan.push(h); k.held = null; beep(300, 0.05, 'triangle', 0.04);
      if (!k.burner) N.toast('Turn the burner on with the knob below the counter.', '', 3500);
      N.save(); return true;
    }
    if (!k.pan.length) { N.toast('The pan is empty.'); return true; }
    k.held = makeDish(k.pan); k.pan = []; N.save();
    N.toast(`${k.held.name} — ${QLABEL[k.held.q]}. Press F to eat.`, k.held.q === 'perfect' ? 'good' : k.held.q === 'burnt' ? 'bad' : '');
    return true;
  }
  if (id === 'knob') {
    k.burner = !k.burner; beep(k.burner ? 900 : 600, 0.05, 'square', 0.03);
    N.toast(k.burner ? 'Click-click-whoosh. Burner on.' : 'Burner off.'); N.save(); return true;
  }
  if (id === 'trash') {
    if (!k.held) { N.toast('The trash. Smells like last week.'); return true; }
    N.toast(`You throw away the ${itemName(k.held).toLowerCase()}.`); k.held = null; N.save(); return true;
  }
  return false;
}
N.hooks.interact.push(interact);
N.hooks.key.push(code => { if (code === 'KeyF') eat(); });
N.hooks.speed.push(() => (N.S && N.S.food <= 0 ? 0.55 : 1));

// ---------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------
let smoke = [], smokeAcc = 0, alarmT = 0, burntFor = 0, lastT = null, chopFlash = 0, warnedHungry = false, warnedStarving = false;
function update(dt) {
  const S = N.S, k = K();
  // hunger follows the game clock (so sleeping and long sessions count too)
  if (lastT === null || S.t < lastT) lastT = S.t;
  const gm = S.t - lastT; lastT = S.t;
  S.food = Math.max(0, S.food - gm * FOOD_PER_GAME_MIN);
  if (S.food < 25 && !warnedHungry) { warnedHungry = true; N.toast("You're getting hungry. The fridge is calling.", 'bad'); }
  if (S.food > 30) warnedHungry = false;
  if (S.food <= 0 && !warnedStarving) { warnedStarving = true; N.toast("You're starving. Everything feels slow.", 'bad', 6000); }
  if (S.food > 5) warnedStarving = false;

  // cooking
  let worst = 0; // 0 nothing, 1 cooking, 2 over, 3 burnt
  if (k.burner) for (const it of k.pan) {
    const before = stage(it);
    it.cook = (it.cook || 0) + dt;
    const st = stage(it);
    if (st !== before) {
      if (st === 'cooked') { N.toast(`The ${ING[it.k].panName} is ready.`, 'good', 2500); beep(880, 0.06, 'triangle', 0.04); }
      if (st === 'over') N.toast(`Something's getting crispy… (${ING[it.k].panName})`, '', 2500);
      if (st === 'burnt') N.toast(`The ${ING[it.k].panName} is burning!`, 'bad', 3500);
    }
    worst = Math.max(worst, st === 'burnt' ? 3 : st === 'over' ? 2 : 1);
  }
  setSizzle(k.burner && k.pan.length ? (worst >= 3 ? 1 : 0.7) : 0);
  N.setBurnerGlow(k.burner ? [1.0, 0.45 + 0.08 * Math.sin(S.t * 3 + performance.now() / 90), 0.15] : [0.18, 0.18, 0.2]);

  // smoke: wisps when overcooked, plumes when burnt
  const rate = worst >= 3 ? 14 : worst === 2 ? 3 : 0;
  smokeAcc += dt * rate;
  while (smokeAcc > 1) {
    smokeAcc--;
    smoke.push({ x: PAN.x + (Math.random() - 0.5) * 0.15, y: PAN.y + 0.05, z: PAN.z + (Math.random() - 0.5) * 0.15,
      vx: (Math.random() - 0.5) * 0.05, vy: 0.25 + Math.random() * 0.2, s: 0.03 + Math.random() * 0.03, life: 2.5 + Math.random(), dark: worst >= 3 });
  }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += dt * 0.05;
    if (p.y > 2.5) { p.vy *= 0.9; p.x -= dt * 0.15; } // spreads along the ceiling
    if (p.life <= 0) smoke.splice(i, 1);
  }
  // smoke alarm after burning for a bit
  burntFor = worst >= 3 && k.burner ? burntFor + dt : 0;
  if (burntFor > 2) { alarmT -= dt; if (alarmT <= 0) { alarmT = 0.55; beep(3100, 0.22, 'square', 0.035); } }
  if (chopFlash > 0) chopFlash -= dt;
  const b = k.board, showChop = b && ING[b.k] && ING[b.k].chopTo && k.chops > 0;
  chopBar.style.display = showChop ? 'block' : 'none';
  if (showChop) chopBar.firstChild.style.width = (k.chops / CHOPS * 100) + '%';
}
N.hooks.update.push(update);

// ---------------------------------------------------------------------
// 3D drawing (rebuilt every frame into the dynamic buffer)
// ---------------------------------------------------------------------
const hexToRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
function ramp(name, it) {
  const r = RAMP[name].map(hexToRgb), d = ING[it.k] || ING.egg, [a, b, c] = d.times || [1, 2, 3], t = it.cook || 0;
  let i, f;
  if (t < a) { i = 0; f = t / a; } else if (t < b) { i = 1; f = (t - a) / (b - a); } else if (t < c) { i = 2; f = (t - b) / (c - b); } else { i = 3; f = 0; }
  const A = r[i], B = r[Math.min(3, i + 1)];
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
}
const cbox = (cx, y, cz, w, h, d, col, glow) => N.box(cx - w / 2, y, cz - d / 2, w, h, d, col, glow || 0);

// draw an item centred on (x, y, z) sitting on a surface at y. `where`: 'pan' | 'board' | 'hand'
function drawItem(it, x, y, z, where, slot = 0) {
  if (it.k === 'dish') {
    cbox(x, y, z, 0.2, 0.012, 0.2, '#f4f4f2'); cbox(x, y + 0.012, z, 0.16, 0.004, 0.16, '#e6e6e2');
    it.parts.forEach((p, i) => drawItem(p, x + (i - (it.parts.length - 1) / 2) * 0.05, y + 0.016, z, 'pan', i));
    return;
  }
  if (it.k === 'egg') {
    if (where === 'pan') {
      cbox(x, y, z, 0.11, 0.008, 0.09, ramp('egg', it));
      cbox(x + 0.01, y + 0.008, z - 0.005, 0.035, 0.012, 0.035, ramp('yolk', it));
    } else { cbox(x, y, z, 0.045, 0.055, 0.045, '#f1e6d2'); cbox(x, y + 0.055, z, 0.03, 0.012, 0.03, '#f1e6d2'); }
    return;
  }
  if (it.k === 'bread') { cbox(x, y, z, 0.1, 0.018, 0.1, ramp('bread', it)); cbox(x, y + 0.018, z, 0.084, 0.002, 0.084, it.cook ? ramp('bread', it) : '#f6ead0'); return; }
  if (it.k === 'onion') { cbox(x, y, z, 0.07, 0.065, 0.07, '#9a5aa8'); cbox(x, y + 0.065, z, 0.02, 0.025, 0.02, '#c9a36b'); return; }
  if (it.k === 'onion_chopped') {
    const col = ramp('onion_chopped', it);
    for (let i = 0; i < 7; i++) { const a = i * 2.4 + slot, rr = 0.012 + (i % 3) * 0.014; cbox(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, 0.018, 0.012, 0.018, col); }
  }
}
function draw() {
  const S = N.S; if (!S || !S.kitchen) return;
  const k = K();
  // burner ring (glow group 5 follows N.setBurnerGlow) + pan + handle
  N.prism(PAN.x, PAN.y, PAN.z, 0.1, 0.005, '#ffffff', 12, 5);            // glowing burner ring
  N.prism(PAN.x, PAN.y + 0.008, PAN.z, PAN.r + 0.012, 0.022, '#1e1e23', 14); // skillet body
  N.prism(PAN.x, PAN.y + 0.03, PAN.z, PAN.r, 0.002, '#34343b', 14);        // cooking surface
  N.box(PAN.x - PAN.r - 0.21, PAN.y + 0.022, PAN.z - 0.016, 0.21, 0.016, 0.032, '#141417'); // handle toward the room
  // pan contents
  k.pan.forEach((it, i) => { const a = i / Math.max(1, k.pan.length) * Math.PI * 2 + 0.6, rr = k.pan.length > 1 ? 0.05 : 0;
    drawItem(it, PAN.x + Math.cos(a) * rr, PAN.y + 0.032, PAN.z + Math.sin(a) * rr, 'pan', i); });
  // knob on the counter front + indicator light
  N.box(KNOB.x - 0.02, KNOB.y - 0.025, KNOB.z - 0.025, 0.02, 0.05, 0.05, '#222');
  N.box(KNOB.x - 0.03, KNOB.y + (k.burner ? -0.005 : 0.012), KNOB.z - 0.005, 0.012, 0.01, 0.01, '#ddd');
  N.box(KNOB.x - 0.005, KNOB.y + 0.04, KNOB.z + 0.04, 0.01, 0.012, 0.012, k.burner ? '#ffffff' : '#552222', k.burner ? 5 : 0);
  // board item
  if (k.board) {
    const jig = chopFlash > 0 ? (Math.random() - 0.5) * 0.01 : 0;
    drawItem(k.board, BOARD.x + jig, BOARD.y, BOARD.z, 'board');
    if (ING[k.board.k] && ING[k.board.k].chopTo && k.chops) for (let i = 0; i < k.chops; i++) cbox(BOARD.x + 0.06, BOARD.y, BOARD.z - 0.05 + i * 0.022, 0.03, 0.01, 0.015, '#efe6f2');
  }
  // held item floats in front of the camera, lower right
  if (k.held && N.active) {
    const p = N.P, cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const x = p.x + fx * 0.42 + rx * 0.17, y = p.y + fy * 0.42 - 0.2, z = p.z + fz * 0.42 + rz * 0.17;
    drawItem(k.held, x, y, z, 'hand');
  }
  // smoke puffs
  for (const s of smoke) { const g = s.dark ? 0.28 : 0.62, fade = Math.min(1, s.life); cbox(s.x, s.y, s.z, s.s, s.s, s.s, [g * fade + 0.2 * (1 - fade), g * fade + 0.2 * (1 - fade), g * fade + 0.22 * (1 - fade)]); }
}
N.hooks.draw.push(draw);

// ---------------------------------------------------------------------
// Groceries app on the PC
// ---------------------------------------------------------------------
const app = N.pcAddApp('groceries', '🛒', 'Groceries', 'linear-gradient(135deg,#ff9a6b,#e0573a)', body => {
  const k = K();
  body.innerHTML = `<h3>FreshCart Groceries</h3><p>Delivered to your door in minutes. You don't even have to see anyone.</p>
    <table class="gro"><tr><th></th><th>Item</th><th>In fridge</th><th class="num">Price</th><th></th></tr>
    ${GROCERIES.map(g => `<tr><td style="font-size:22px">${g.icon}</td><td><b>${g.label}</b></td><td>${k.fridge[g.id] || 0}</td><td class="num">$${g.price}</td>
      <td class="num"><button class="wbtn" data-buy="${g.id}" ${N.S.money < g.price ? 'disabled' : ''}>Buy</button></td></tr>`).join('')}</table>`;
  for (const b of body.querySelectorAll('[data-buy]')) b.onclick = () => {
    const g = GROCERIES.find(x => x.id === b.dataset.buy);
    if (N.S.money < g.price) return;
    N.addMoney(-g.price, `Groceries: ${g.label}`);
    k.fridge[g.id] = (k.fridge[g.id] || 0) + g.qty;
    N.toast(`${g.label} delivered and put in the fridge.`, 'good');
    N.save(); app.refresh();
  };
});

// test hook
window.__cook = { get K() { return K(); }, interact, eat, update, stage, makeDish };
})();
