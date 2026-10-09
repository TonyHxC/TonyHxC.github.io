// Pogey Life — your character: creator, saved templates, bathroom mirror, and the third-person view (V).
// The model is built from rotated boxes in the same blocky style as the room, re-posed every frame.
(() => {
'use strict';
const N = window.POGEY;
if (!N) return;

// ---------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------
const OPT = {
  gender: [['male', 'Male'], ['female', 'Female'], ['nonbinary', 'Non-binary']],
  build: [['slim', 'Slim'], ['average', 'Average'], ['broad', 'Broad']],
  height: [['short', 'Short'], ['average', 'Average'], ['tall', 'Tall']],
  chest: [['flat', 'Flat'], ['curvy', 'Curvy']],
  facial: [['none', 'None'], ['stubble', 'Stubble'], ['mustache', 'Mustache'], ['goatee', 'Goatee'], ['beard', 'Full beard'], ['chinstrap', 'Chin strap']],
  hair: [['bald', 'Bald'], ['buzz', 'Buzz cut'], ['short', 'Short'], ['sidepart', 'Side part'], ['spiky', 'Spiky'], ['mohawk', 'Mohawk'], ['afro', 'Afro'],
         ['bob', 'Bob'], ['long', 'Long'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['pigtails', 'Pigtails'], ['mullet', 'Mullet']],
  top: [['tshirt', 'T-shirt'], ['tank', 'Tank top'], ['hoodie', 'Hoodie'], ['button', 'Button-up'], ['sweater', 'Sweater'], ['jersey', 'Jersey'], ['jacket', 'Leather jacket']],
  bottom: [['jeans', 'Jeans'], ['shorts', 'Shorts'], ['underwear', 'Underwear'], ['sweats', 'Sweatpants'], ['cargo', 'Cargo pants'], ['skirt', 'Skirt']],
  hat: [['none', 'None'], ['beanie', 'Beanie'], ['cap', 'Baseball cap'], ['bucket', 'Bucket hat'], ['cowboy', 'Cowboy hat'], ['tophat', 'Top hat'], ['crown', 'Crown']],
  glasses: [['none', 'None'], ['sunnies', 'Sunglasses'], ['aviators', 'Aviators'], ['round', 'Round glasses'], ['shutter', 'Shutter shades'], ['3d', '3D glasses']],
  neck: [['none', 'None'], ['silver', 'Silver chain'], ['gold', 'Gold chain'], ['medallion', 'Bling medallion'], ['pearls', 'Pearl necklace']],
};
// Shop catalogue (shop.js renders it). Base clothes are free and always owned.
const BASE_ITEMS = ['tshirt', 'tank', 'hoodie', 'jeans', 'shorts', 'underwear', 'none'];
const CATALOG = [
  { id: 'button', cat: 'clothes', slot: 'top', name: 'Button-up shirt', price: 35, icon: '👔', desc: 'Long sleeves, collar, real buttons. Job-interview energy.' },
  { id: 'sweater', cat: 'clothes', slot: 'top', name: 'Sweater', price: 45, icon: '🧶', desc: 'Cosy crew-neck knit.' },
  { id: 'jersey', cat: 'clothes', slot: 'top', name: 'Jersey', price: 60, icon: '🎽', desc: 'Number 1. At something.' },
  { id: 'jacket', cat: 'clothes', slot: 'top', name: 'Leather jacket', price: 120, icon: '🧥', desc: 'Over a white tee. Instantly cooler.' },
  { id: 'sweats', cat: 'clothes', slot: 'bottom', name: 'Sweatpants', price: 25, icon: '🩳', desc: 'The official uniform of staying in.' },
  { id: 'cargo', cat: 'clothes', slot: 'bottom', name: 'Cargo pants', price: 40, icon: '👖', desc: 'Pockets for days.' },
  { id: 'skirt', cat: 'clothes', slot: 'bottom', name: 'Skirt', price: 30, icon: '👗', desc: 'Swishy.' },
  { id: 'beanie', cat: 'hats', slot: 'hat', name: 'Beanie', price: 15, icon: '🧢', desc: 'With a pom-pom. Any colour.' },
  { id: 'cap', cat: 'hats', slot: 'hat', name: 'Baseball cap', price: 20, icon: '🧢', desc: 'Brim forward, like a normal person.' },
  { id: 'bucket', cat: 'hats', slot: 'hat', name: 'Bucket hat', price: 25, icon: '👒', desc: 'Festival-ready.' },
  { id: 'cowboy', cat: 'hats', slot: 'hat', name: 'Cowboy hat', price: 45, icon: '🤠', desc: 'Yeehaw, from your desk chair.' },
  { id: 'tophat', cat: 'hats', slot: 'hat', name: 'Top hat', price: 60, icon: '🎩', desc: 'For the high roller.' },
  { id: 'crown', cat: 'hats', slot: 'hat', name: 'Crown', price: 1000, icon: '👑', desc: 'Solid gold (allegedly). King of the bachelor pad.' },
  { id: 'sunnies', cat: 'glasses', slot: 'glasses', name: 'Sunglasses', price: 15, icon: '🕶', desc: 'Hide the eye bags.' },
  { id: 'aviators', cat: 'glasses', slot: 'glasses', name: 'Aviators', price: 40, icon: '🕶', desc: 'Gold frames, mirrored attitude.' },
  { id: 'round', cat: 'glasses', slot: 'glasses', name: 'Round glasses', price: 25, icon: '👓', desc: 'Look smart. Be smart? Optional.' },
  { id: 'shutter', cat: 'glasses', slot: 'glasses', name: 'Shutter shades', price: 10, icon: '😎', desc: 'Peak 2007.' },
  { id: '3d', cat: 'glasses', slot: 'glasses', name: '3D glasses', price: 12, icon: '🥽', desc: 'Everything looks the same. Still worth it.' },
  { id: 'silver', cat: 'chains', slot: 'neck', name: 'Silver chain', price: 50, icon: '⛓', desc: 'Understated drip.' },
  { id: 'gold', cat: 'chains', slot: 'neck', name: 'Gold chain', price: 90, icon: '📿', desc: 'Chunky links.' },
  { id: 'medallion', cat: 'chains', slot: 'neck', name: 'Bling medallion', price: 250, icon: '🏅', desc: 'Gold chain with a huge ruby medallion.' },
  { id: 'pearls', cat: 'chains', slot: 'neck', name: 'Pearl necklace', price: 70, icon: '🦪', desc: 'Classic.' },
  { id: 'pin_star', cat: 'pins', pin: 'star', name: 'Star pin', price: 5, icon: '⭐', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_heart', cat: 'pins', pin: 'heart', name: 'Heart pin', price: 5, icon: '❤️', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_smiley', cat: 'pins', pin: 'smiley', name: 'Smiley pin', price: 6, icon: '🙂', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_flower', cat: 'pins', pin: 'flower', name: 'Flower pin', price: 6, icon: '🌸', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_bolt', cat: 'pins', pin: 'bolt', name: 'Lightning pin', price: 8, icon: '⚡', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_skull', cat: 'pins', pin: 'skull', name: 'Skull pin', price: 8, icon: '💀', desc: 'Stick it anywhere at the mirror.' },
  { id: 'pin_plinko', cat: 'pins', pin: 'plinko', name: 'Plinko ball pin', price: 12, icon: '🔮', desc: 'Show your loyalty to the house.' },
];
const PIN_TYPES = CATALOG.filter(i => i.pin).map(i => i.pin);
const HAT_COLORS = ['#2a2a2e', '#c43a3a', '#2f5fae', '#3a8a5a', '#e0b23a', '#8a4fb0', '#e9e6df', '#5a3a2a', '#f08ab0', '#e07a3a'];
const SKIN = ['#f6d7c3', '#eac0a2', '#d9a27e', '#c68863', '#a86b48', '#8a5236', '#6a3d26', '#4a2a1a'];
const HAIRC = ['#1b1512', '#3b2618', '#6b4226', '#a4703f', '#d9b56a', '#e8dcc0', '#9a9a9a', '#b8452c', '#2f6fd6', '#d24fa0', '#3fae6a'];
const EYES = ['#5a3a22', '#2f6db0', '#3f8a4a', '#7a8a96', '#b08a3a', '#222222'];
const CLOTH = ['#e9e6df', '#2a2a2e', '#7a7f87', '#c43a3a', '#2f5fae', '#3a8a5a', '#e0b23a', '#8a4fb0', '#e07a3a', '#2f3b52', '#5a3a2a', '#f08ab0'];
const DEFAULT = { gender: 'nonbinary', build: 'average', height: 'average', chest: 'flat', skin: '#d9a27e', eyes: '#5a3a22',
  facial: 'none', hair: 'short', hairColor: '#3b2618', top: 'tshirt', topColor: '#7a7f87', bottom: 'jeans', bottomColor: '#2f3b52', shoes: '#2a2a2e',
  hat: 'none', hatColor: '#2a2a2e', glasses: 'none', neck: 'none', pins: [] };
const TPL_KEY = 'pogeylife_templates_v1';

const pick = a => a[Math.floor(Math.random() * a.length)];
function randomChar() {
  const c = {};
  for (const k of ['gender', 'build', 'height', 'chest', 'facial', 'hair']) c[k] = pick(OPT[k])[0];
  c.top = pick(['tshirt', 'tank', 'hoodie']); c.bottom = pick(['jeans', 'shorts', 'underwear']);
  Object.assign(c, { hat: 'none', hatColor: '#2a2a2e', glasses: 'none', neck: 'none', pins: [] });
  if (Math.random() < 0.4) c.facial = 'none';
  if (c.bottom === 'underwear' && Math.random() < 0.7) c.bottom = pick(['jeans', 'shorts']);
  return Object.assign(c, { skin: pick(SKIN), eyes: pick(EYES), hairColor: pick(HAIRC.slice(0, 8)), topColor: pick(CLOTH), bottomColor: pick(CLOTH), shoes: pick(['#2a2a2e', '#e9e6df', '#c43a3a', '#2f5fae']) });
}

// what the player owns (per life). Base clothes are always owned.
function ensureWardrobe(S) { if (!S.wardrobe) S.wardrobe = { owned: {}, pins: {} }; if (!S.wardrobe.pins) S.wardrobe.pins = {}; }
const owns = (W, id) => BASE_ITEMS.includes(id) || !!(W && W.owned[id]);
// drop anything this wardrobe doesn't own (used for templates and new lives)
function sanitize(ch, W) {
  const out = { ...DEFAULT, ...ch };
  for (const k of ['top', 'bottom', 'hat', 'glasses', 'neck']) if (!owns(W, out[k])) out[k] = DEFAULT[k];
  const left = { ...((W && W.pins) || {}) };
  out.pins = (out.pins || []).filter(p => { if ((left[p.t] || 0) > 0) { left[p.t]--; return true; } return false; });
  return out;
}
function ensure(S) { ensureWardrobe(S); if (!S.char) S.char = { ...DEFAULT }; S.char = { ...DEFAULT, ...S.char }; if (!Array.isArray(S.char.pins)) S.char.pins = []; if (S.view !== 'first' && S.view !== 'third') S.view = 'first'; }
N.hooks.fresh.push(ensure);
if (N.S) ensure(N.S);

// ---------------------------------------------------------------------
// Rotated-box drawing
// ---------------------------------------------------------------------
const hex = h => { let x = h.slice(1); if (x.length === 3) x = x.replace(/./g, c => c + c); const n = parseInt(x, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const mixC = (a, b, t) => { const A = hex(a), B = hex(b); return A.map((v, i) => v + (B[i] - v) * t); };
const shade = (c, k) => (typeof c === 'string' ? hex(c) : c).map(v => Math.min(1, v * k));
// pose context: origin (x,z), yaw, uniform scale; parts may rotate about a pivot around local X (limb swing)
let X0 = 0, Y0 = 0, Z0 = 0, YAW = 0, SC = 1, LIMB = null, BONE = 'body', RECORD = null, NOPIN = false;
const POSE = {}; // bone -> current limb rotation, so pins follow arms/legs
function toWorld(lx, ly, lz) {
  if (LIMB) { const [px, py, pz, a, oy = 0, oz = 0] = LIMB, dy = ly - py, dz = lz - pz, c = Math.cos(a), s = Math.sin(a); ly = py + dy * c - dz * s + oy; lz = pz + dy * s + dz * c + oz; }
  lx *= SC; ly *= SC; lz *= SC; ly += Y0;
  // local x = right, local z = forward (where the face points)
  const cy = Math.cos(YAW), sy = Math.sin(YAW);
  return [X0 + lx * cy - lz * sy, ly, Z0 - lx * sy - lz * cy];
}
function toWorldN(nx, ny, nz) {
  if (LIMB) { const a = LIMB[3], c = Math.cos(a), s = Math.sin(a); const y = ny * c - nz * s, z = ny * s + nz * c; ny = y; nz = z; }
  const cy = Math.cos(YAW), sy = Math.sin(YAW);
  return [nx * cy - nz * sy, ny, -nx * sy - nz * cy];
}
// local box from min corner (x,y,z) and size; colour hex or rgb
function rb(x, y, z, w, h, d, col) {
  const c = typeof col === 'string' ? hex(col) : col, X = x + w, Y = y + h, Z = z + d;
  if (RECORD && !NOPIN) RECORD.push({ bone: BONE, limb: LIMB ? LIMB.slice() : null, b: [x, y, z, X, Y, Z] });
  const F = (a, b, cc, dd, n, k) => {
    const pa = toWorld(...a), pb = toWorld(...b), pc = toWorld(...cc), pd = toWorld(...dd);
    N.quad(pd, pc, pb, pa, toWorldN(...n), c.map(v => v * k), 0); // reversed: the local→world map mirrors handedness
  };
  F([x, Y, z], [x, Y, Z], [X, Y, Z], [X, Y, z], [0, 1, 0], 1);
  F([x, y, z], [X, y, z], [X, y, Z], [x, y, Z], [0, -1, 0], 0.88);
  F([X, y, z], [x, y, z], [x, Y, z], [X, Y, z], [0, 0, -1], 0.94);
  F([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z], [0, 0, 1], 0.97);
  F([x, y, Z], [x, Y, Z], [x, Y, z], [x, y, z], [-1, 0, 0], 0.92);
  F([X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z], [1, 0, 0], 0.92);
}
const cb = (cx, y, cz, w, h, d, col) => rb(cx - w / 2, y, cz - d / 2, w, h, d, col);

// ---------------------------------------------------------------------
// The model (local units ≈ metres for an average-height character; feet at y = 0, face toward +z)
// ---------------------------------------------------------------------
const HEIGHT = { short: 0.92, average: 1, tall: 1.08 };
const BUILD = { slim: 0.86, average: 1, broad: 1.16 };
function drawCharacter(ch, x, z, yaw, walk, opts = {}) {
  X0 = x; Z0 = z; YAW = yaw; SC = HEIGHT[ch.height] || 1; LIMB = null; BONE = 'body';
  const sit = opts.sit; // { y: seat height, legs: 'bent' | 'out' } — lowers the body so the hips rest on the seat
  Y0 = sit ? sit.y - 0.8 * SC : 0;
  const b = BUILD[ch.build] || 1, skin = ch.skin, hc = ch.hairColor, top = ch.topColor, bot = ch.bottomColor;
  const swing = Math.sin(walk) * 0.55 * (opts.moving ? 1 : 0), hold = !!opts.holding;
  const B = ch.bottom, T = ch.top;
  const fullLeg = ['jeans', 'sweats', 'cargo'].includes(B), shorts = B === 'shorts', undies = B === 'underwear', skirt = B === 'skirt';

  // legs (swing about the hip). Sitting: 'out' = straight legs forward (beanbag); 'bent' = thighs forward, shins down (chair)
  for (const side of [-1, 1]) {
    const lx = side * 0.085, a = side * swing;
    BONE = side < 0 ? 'legL' : 'legR';
    const upper = sit ? [lx, 0.82, 0, sit.legs === 'out' ? -1.42 : -Math.PI / 2] : [lx, 0.82, 0, a];
    const lower = sit && sit.legs !== 'out' ? [lx, 0, 0, 0, 0.37, 0.32] : upper;
    LIMB = POSE[BONE] = lower;
    cb(lx, 0.0, 0.035, 0.14, 0.075, 0.25, ch.shoes);                         // shoe
    cb(lx, 0.07, 0, 0.125, 0.38, 0.14, fullLeg ? bot : skin);                 // shin
    if (B === 'jeans') cb(lx, 0.07, 0, 0.13, 0.02, 0.145, shade(bot, 0.8));   // cuff
    if (B === 'sweats') cb(lx, 0.07, 0, 0.12, 0.04, 0.135, shade(bot, 0.8));  // elastic cuff
    LIMB = POSE[BONE] = upper;
    cb(lx, 0.45, 0, 0.13, 0.13, 0.145, fullLeg ? bot : skin);                 // knee
    cb(lx, 0.58, 0, 0.135, 0.18, 0.15, fullLeg || shorts ? bot : skin);       // thigh
    cb(lx, 0.76, 0, 0.14, 0.07, 0.155, skirt ? skin : bot);                   // top of leg
    if (shorts) cb(lx, 0.57, 0, 0.145, 0.025, 0.16, shade(bot, 0.85));        // hem
    if (B === 'sweats') cb(lx + side * 0.064, sit ? 0.47 : 0.12, 0, 0.006, sit ? 0.35 : 0.7, 0.03, '#efefef'); // side stripe
    if (B === 'cargo') cb(lx + side * 0.07, 0.5, 0, 0.02, 0.13, 0.1, shade(bot, 0.85));   // side pocket
  }
  LIMB = null; BONE = 'body';
  // pelvis + belt / waistband
  cb(0, 0.8, 0, 0.34 * b, 0.13, 0.2, bot);
  if (B === 'jeans' || B === 'cargo' || B === 'shorts') cb(0, 0.9, 0, 0.345 * b, 0.03, 0.205, '#2a1e16');
  else cb(0, 0.9, 0, 0.345 * b, 0.025, 0.205, shade(bot, 1.15));
  if (B === 'sweats') for (const s of [-1, 1]) cb(s * 0.03, 0.86, 0.104, 0.008, 0.05, 0.006, '#efefef'); // drawstring
  if (skirt) { cb(0, 0.52, 0, 0.42 * b, 0.4, 0.27, bot); cb(0, 0.52, 0, 0.425 * b, 0.025, 0.275, shade(bot, 0.85)); }
  // torso
  const tw = 0.38 * b, td = 0.21;
  const sleeveFull = ['hoodie', 'button', 'sweater', 'jacket'].includes(T), sleeveShort = T === 'tshirt' || T === 'jersey';
  cb(0, 0.92, 0, tw, 0.44, td, top);
  if (T === 'tank') {
    cb(0, 1.36, 0, tw, 0.06, td * 0.96, skin);                               // shoulders/neckline bare
    for (const s of [-1, 1]) cb(s * tw * 0.27, 1.36, 0, 0.05, 0.06, td + 0.004, top); // straps
    cb(0, 1.3, td / 2, tw * 0.45, 0.06, 0.006, skin);                         // scoop neck
  } else {
    cb(0, 1.36, 0, tw, 0.06, td, top);
    cb(0, 1.39, td / 2, 0.11, 0.03, 0.006, T === 'hoodie' || T === 'sweater' ? shade(top, 0.8) : skin); // collar opening
  }
  if (ch.chest === 'curvy') cb(0, 1.16, td / 2 + 0.02, tw * 0.78, 0.13, 0.05, T === 'jacket' ? '#ecebe6' : top);
  if (T === 'hoodie') {
    cb(0, 0.98, td / 2 + 0.006, tw * 0.6, 0.12, 0.012, shade(top, 0.82));     // front pocket
    cb(0, 1.33, -td / 2 - 0.04, tw * 0.7, 0.16, 0.08, shade(top, 0.9));       // hood (down)
    for (const s of [-1, 1]) cb(s * 0.035, 1.22, td / 2 + 0.008, 0.012, 0.14, 0.008, '#efefef'); // drawstrings
    cb(0, 0.92, 0, tw + 0.006, 0.04, td + 0.006, shade(top, 0.85));           // waistband
  }
  if (T === 'button') {
    cb(0, 0.92, td / 2 + 0.002, 0.03, 0.47, 0.006, shade(top, 0.88));          // placket
    for (let k = 0; k < 5; k++) cb(0, 0.98 + k * 0.085, td / 2 + 0.006, 0.014, 0.014, 0.004, '#f4f4f0');
    for (const s of [-1, 1]) cb(s * 0.05, 1.38, td / 2 - 0.005, 0.07, 0.045, 0.03, shade(top, 1.08)); // collar points
    cb(0, 1.4, -0.01, 0.13, 0.04, td * 0.9, shade(top, 1.05));
  }
  if (T === 'sweater') { cb(0, 0.92, 0, tw + 0.008, 0.05, td + 0.008, shade(top, 0.85)); cb(0, 1.38, 0, 0.13, 0.035, 0.13, shade(top, 0.85)); }
  if (T === 'jersey') {
    cb(0, 1.02, td / 2 + 0.003, 0.03, 0.2, 0.006, '#f4f4f0'); cb(-0.02, 1.19, td / 2 + 0.003, 0.03, 0.03, 0.006, '#f4f4f0'); // a big "1" on the front
    cb(0, 1.0, -td / 2 - 0.004, 0.035, 0.28, 0.006, '#f4f4f0');                                                        // and on the back
    cb(0, 1.39, 0, 0.14, 0.03, td * 0.75, '#f4f4f0');                                                                  // collar trim
  }
  if (T === 'jacket') {
    cb(0, 0.95, td / 2 + 0.002, 0.11, 0.44, 0.006, '#ecebe6');                // white tee showing through
    for (const s of [-1, 1]) cb(s * 0.07, 1.18, td / 2 + 0.006, 0.05, 0.2, 0.01, shade(top, 1.25)); // lapels
    cb(0.03, 0.95, td / 2 + 0.008, 0.008, 0.38, 0.006, '#b8b8b8');           // zip
    cb(0, 0.92, 0, tw + 0.01, 0.05, td + 0.01, shade(top, 0.8));
  }
  // arms (swing opposite to legs; forward when holding something)
  for (const side of [-1, 1]) {
    const ax = side * (tw / 2 + 0.055), a = hold ? -1.15 : sit ? -0.55 : -side * swing * 0.9;
    BONE = side < 0 ? 'armL' : 'armR'; LIMB = POSE[BONE] = [ax, 1.4, 0, a];
    cb(ax, 1.2, 0, 0.1, 0.22, 0.11, sleeveFull || sleeveShort ? top : skin);  // upper arm
    if (sleeveShort) cb(ax, 1.2, 0, 0.108, 0.03, 0.118, T === 'jersey' ? '#f4f4f0' : shade(top, 0.88)); // sleeve hem / jersey stripe
    cb(ax, 0.86, 0, 0.09, 0.34, 0.1, sleeveFull ? top : skin);                // forearm
    if (sleeveFull) cb(ax, 0.86, 0, 0.095, 0.035, 0.105, T === 'button' ? '#f4f4f0' : shade(top, 0.85)); // cuff
    cb(ax, 0.77, 0, 0.085, 0.09, 0.09, skin);                                 // hand
    cb(ax, 1.36, 0, 0.11, 0.06, 0.12, T === 'tank' ? skin : top);            // shoulder
  }
  LIMB = null; BONE = 'body';
  drawNeck(ch, td);
  // neck + head
  cb(0, 1.42, 0, 0.1, 0.09, 0.1, skin);
  const HY = 1.5, HW = 0.25, HH = 0.28, HD = 0.26, FZ = HD / 2;
  BONE = 'head';
  cb(0, HY, 0, HW, HH, HD, skin);
  for (const s of [-1, 1]) cb(s * (HW / 2 + 0.012), HY + 0.1, 0, 0.025, 0.06, 0.05, shade(skin, 0.95)); // ears
  // face
  for (const s of [-1, 1]) {
    cb(s * 0.055, HY + 0.13, FZ + 0.002, 0.05, 0.032, 0.004, '#f6f6f2');
    cb(s * 0.052, HY + 0.133, FZ + 0.005, 0.022, 0.026, 0.004, ch.eyes);
    cb(s * 0.052, HY + 0.141, FZ + 0.008, 0.01, 0.01, 0.003, '#111');
    cb(s * 0.058, HY + 0.178, FZ + 0.003, 0.06, 0.013, 0.006, ch.hair === 'bald' ? shade(skin, 0.7) : hc); // brows
  }
  cb(0, HY + 0.085, FZ, 0.035, 0.05, 0.03, shade(skin, 0.95));                // nose
  cb(0, HY + 0.05, FZ + 0.002, 0.065, 0.012, 0.004, mixC(skin, '#7a2a2a', 0.45)); // mouth
  drawFacialHair(ch, HY, HW, HD, FZ, skin, hc);
  // big hairstyles get squashed under a hat
  const hatOn = ch.hat && ch.hat !== 'none';
  drawHair(hatOn && ['afro', 'mohawk', 'spiky', 'bun'].includes(ch.hair) ? { ...ch, hair: 'short' } : ch, HY, HW, HH, HD, hc);
  if (hatOn) drawHat(ch, HY + HH, HW, HD);
  drawGlasses(ch, HY, FZ, HW);
  BONE = 'body';
  drawPins(ch);
}

// ---- necklaces ----
function drawNeck(ch, td) {
  const n = ch.neck; if (!n || n === 'none') return;
  const curvy = ch.chest === 'curvy';
  const col = n === 'silver' ? '#d6dbe0' : n === 'pearls' ? '#f6f2ea' : '#e8b53a';
  const bead = n === 'pearls' ? 0.022 : n === 'gold' || n === 'medallion' ? 0.02 : 0.014;
  const depth = n === 'medallion' ? 0.2 : n === 'pearls' ? 0.13 : 0.16;
  for (let i = 0; i <= 10; i++) {                                              // a U hanging from the neck
    const t = i / 10, x = (t - 0.5) * 0.17, y = 1.41 - depth * Math.sin(t * Math.PI);
    const front = td / 2 + 0.008 + (curvy && y < 1.3 ? 0.045 : 0);
    const back = Math.abs(t - 0.5) > 0.42;                                     // ends tuck toward the neck
    cb(x, y, back ? front - 0.03 : front, bead, bead, bead, i % 2 && n === 'gold' ? shade(col, 0.82) : col);
  }
  if (n === 'medallion') {
    const z = td / 2 + 0.012 + (curvy ? 0.045 : 0);
    cb(0, 1.15, z, 0.075, 0.075, 0.012, '#f0c040'); cb(0, 1.17, z + 0.008, 0.035, 0.035, 0.008, '#c41e3a');
  }
}

// ---- hats ----
function drawHat(ch, T, HW, HD) {
  const h = ch.hat, col = ch.hatColor || '#2a2a2e', dk = shade(col, 0.8);
  if (h === 'beanie') {
    cb(0, T - 0.07, 0, HW + 0.05, 0.12, HD + 0.05, col);
    cb(0, T - 0.08, 0, HW + 0.06, 0.045, HD + 0.06, dk);                      // folded brim
    cb(0, T + 0.05, 0, 0.06, 0.05, 0.06, '#f4f4f0');                          // pom-pom
  } else if (h === 'cap') {
    cb(0, T - 0.05, 0, HW + 0.04, 0.09, HD + 0.04, col);
    cb(0, T - 0.04, HD / 2 + 0.07, HW, 0.015, 0.14, dk);                       // brim forward
    cb(0, T + 0.04, 0, 0.03, 0.012, 0.03, dk);
  } else if (h === 'bucket') {
    cb(0, T - 0.05, 0, HW + 0.05, 0.11, HD + 0.05, col);
    cb(0, T - 0.06, 0, HW + 0.16, 0.018, HD + 0.16, dk);
  } else if (h === 'cowboy') {
    cb(0, T - 0.04, 0, HW + 0.02, 0.14, HD, col);
    cb(0, T + 0.07, 0, 0.05, 0.03, HD - 0.04, dk);                            // crease
    cb(0, T - 0.045, 0, HW + 0.3, 0.018, HD + 0.2, col);                      // wide brim
    for (const s of [-1, 1]) cb(s * (HW / 2 + 0.13), T - 0.04, 0, 0.05, 0.04, HD + 0.16, col); // curled sides
    cb(0, T - 0.03, 0, HW + 0.025, 0.025, HD + 0.005, '#5a3a2a');             // band
  } else if (h === 'tophat') {
    cb(0, T - 0.03, 0, HW + 0.12, 0.016, HD + 0.12, col);
    cb(0, T - 0.02, 0, HW - 0.01, 0.26, HD - 0.02, col);
    cb(0, T - 0.01, 0, HW - 0.005, 0.04, HD - 0.015, '#c43a3a');              // band
  } else if (h === 'crown') {
    const g = '#f0c040';
    cb(0, T - 0.03, 0, HW + 0.02, 0.06, HD + 0.02, g);
    for (const [x, z] of [[-0.11, 0.12], [0, 0.13], [0.11, 0.12], [-0.11, -0.12], [0.11, -0.12], [0, -0.13], [-0.13, 0], [0.13, 0]]) cb(x, T + 0.03, z, 0.035, 0.05, 0.02, g);
    for (const x of [-0.07, 0.07]) cb(x, T - 0.012, HD / 2 + 0.012, 0.025, 0.025, 0.006, '#c41e3a');
    cb(0, T - 0.012, HD / 2 + 0.012, 0.025, 0.025, 0.006, '#2f6fd6');
  }
}

// ---- glasses ----
function drawGlasses(ch, HY, FZ, HW) {
  const g = ch.glasses; if (!g || g === 'none') return;
  const y = HY + 0.125, z = FZ + 0.012;
  const arms = col => { for (const s of [-1, 1]) cb(s * (HW / 2 + 0.004), y + 0.03, 0.02, 0.008, 0.01, HD_ARM, col); };
  if (g === 'sunnies') {
    for (const s of [-1, 1]) cb(s * 0.056, y, z, 0.075, 0.048, 0.01, '#141418');
    cb(0, y + 0.03, z, 0.04, 0.012, 0.01, '#141418'); arms('#141418');
  } else if (g === 'aviators') {
    for (const s of [-1, 1]) { cb(s * 0.056, y + 0.008, z, 0.07, 0.042, 0.008, '#3a3f4a'); cb(s * 0.056, y - 0.004, z, 0.05, 0.014, 0.008, '#3a3f4a');
      cb(s * 0.056, y + 0.048, z + 0.001, 0.074, 0.006, 0.01, '#d8b44a'); }
    cb(0, y + 0.04, z, 0.04, 0.006, 0.01, '#d8b44a'); arms('#d8b44a');
  } else if (g === 'round') {
    for (const s of [-1, 1]) { const cx = s * 0.056;
      cb(cx, y + 0.046, z, 0.06, 0.008, 0.008, '#1c1c20'); cb(cx, y - 0.004, z, 0.06, 0.008, 0.008, '#1c1c20');
      cb(cx - 0.028, y, z, 0.008, 0.05, 0.008, '#1c1c20'); cb(cx + 0.028, y, z, 0.008, 0.05, 0.008, '#1c1c20'); }
    cb(0, y + 0.03, z, 0.03, 0.007, 0.008, '#1c1c20'); arms('#1c1c20');
  } else if (g === 'shutter') {
    const c = '#ff4fa0';
    for (const s of [-1, 1]) { cb(s * 0.056, y - 0.006, z, 0.075, 0.008, 0.01, c); cb(s * 0.056, y + 0.046, z, 0.075, 0.008, 0.01, c);
      for (let k = 1; k < 4; k++) cb(s * 0.056, y - 0.006 + k * 0.013, z, 0.075, 0.005, 0.01, c); }
    arms(c);
  } else if (g === '3d') {
    cb(-0.056, y, z, 0.07, 0.045, 0.008, '#e0303a'); cb(0.056, y, z, 0.07, 0.045, 0.008, '#30c8e0');
    cb(0, y + 0.045, z + 0.001, 0.19, 0.01, 0.01, '#f4f4f0'); cb(0, y - 0.006, z + 0.001, 0.19, 0.008, 0.01, '#f4f4f0'); arms('#f4f4f0');
  }
}
const HD_ARM = 0.13;

// ---- pins: stuck to a body part at a local spot, facing out of the surface they were placed on ----
const PIN_ART = {
  star: ['#f0c030', '#fff3a0'], heart: ['#e0304a', '#ff8095'], smiley: ['#f6d030', '#1a1a1a'], flower: ['#f08ab0', '#f6d030'],
  bolt: ['#1e1e24', '#f6d030'], skull: ['#f4f4f0', '#1a1a1a'], plinko: ['#8a4fb0', '#7cf5ff'],
};
function drawPins(ch) {
  NOPIN = true;
  for (const p of ch.pins || []) {
    BONE = p.bone; LIMB = p.bone.startsWith('leg') || p.bone.startsWith('arm') ? POSE[p.bone] || null : null;
    const [base, mark] = PIN_ART[p.t] || PIN_ART.star;
    const S = 0.068, T = 0.01, o = p.s * 0.004;
    const dims = [S, S, S]; dims[p.ax] = T;
    const c = [p.x, p.y, p.z]; c[p.ax] += o;
    rb(c[0] - dims[0] / 2, c[1] - dims[1] / 2, c[2] - dims[2] / 2, dims[0], dims[1], dims[2], base);
    const m = [S * 0.45, S * 0.45, S * 0.45]; m[p.ax] = T;
    const mc = [p.x, p.y, p.z]; mc[p.ax] += o + p.s * 0.003;
    if (p.t === 'smiley') { // two eyes and a mouth
      for (const dx of [-0.009, 0.009]) { const e = mc.slice(), d = [0.006, 0.006, 0.006]; d[p.ax] = T; const side = p.ax === 0 ? 2 : 0; e[side] += dx; e[1] += 0.006; rb(e[0] - d[0] / 2, e[1] - d[1] / 2, e[2] - d[2] / 2, d[0], d[1], d[2], mark); }
      const mm = mc.slice(), d = [0.02, 0.005, 0.02]; d[p.ax] = T; mm[1] -= 0.008; rb(mm[0] - d[0] / 2, mm[1] - d[1] / 2, mm[2] - d[2] / 2, d[0], d[1], d[2], mark);
    } else rb(mc[0] - m[0] / 2, mc[1] - m[1] / 2, mc[2] - m[2] / 2, m[0], m[1], m[2], mark);
  }
  NOPIN = false; LIMB = null; BONE = 'body';
}

function drawFacialHair(ch, HY, HW, HD, FZ, skin, hc) {
  const f = ch.facial;
  const mus = () => cb(0, HY + 0.062, FZ + 0.004, 0.085, 0.016, 0.008, hc);
  if (f === 'stubble') {
    const c = mixC(skin, hc, 0.4);
    cb(0, HY, FZ - 0.02, HW + 0.004, 0.075, 0.026, c);
    for (const s of [-1, 1]) cb(s * (HW / 2 - 0.01), HY, 0.02, 0.024, 0.11, 0.18, c);
    cb(0, HY + 0.062, FZ + 0.003, 0.08, 0.014, 0.004, c);
  } else if (f === 'mustache') mus();
  else if (f === 'goatee') { mus(); cb(0, HY - 0.012, FZ - 0.01, 0.075, 0.06, 0.03, hc); for (const s of [-1, 1]) cb(s * 0.036, HY + 0.035, FZ + 0.002, 0.012, 0.035, 0.008, hc); }
  else if (f === 'beard') {
    mus();
    cb(0, HY - 0.035, FZ - 0.03, HW + 0.012, 0.085, 0.05, hc);
    for (const s of [-1, 1]) cb(s * (HW / 2 - 0.004), HY - 0.01, 0.0, 0.03, 0.15, 0.22, hc);
    cb(0, HY + 0.03, FZ + 0.002, 0.03, 0.02, 0.006, mixC(skin, '#7a2a2a', 0.4));
  } else if (f === 'chinstrap') {
    cb(0, HY - 0.012, FZ - 0.012, HW * 0.75, 0.025, 0.03, hc);
    for (const s of [-1, 1]) cb(s * (HW / 2 - 0.004), HY - 0.005, 0.02, 0.022, 0.13, 0.17, hc);
  }
}

function drawHair(ch, HY, HW, HH, HD, hc) {
  const s = ch.hair, T = HY + HH, W = HW + 0.024, D = HD + 0.024, dark = shade(hc, 0.85);
  const cap = (th = 0.03) => {                                           // top + sides + back
    cb(0, T, 0, W, th, D, hc);
    for (const x of [-1, 1]) cb(x * (HW / 2 + 0.006), HY + 0.14, -0.015, 0.014, HH - 0.12, HD - 0.02, hc);
    cb(0, HY + 0.08, -HD / 2 - 0.006, W, HH - 0.06, 0.014, hc);
  };
  const fringe = (h = 0.06, off = 0) => cb(off, T - h + 0.01, HD / 2 + 0.004, W - Math.abs(off) * 2, h, 0.016, hc);
  if (s === 'bald') return;
  if (s === 'buzz') { cb(0, T, 0, HW + 0.01, 0.012, HD + 0.01, dark); for (const x of [-1, 1]) cb(x * (HW / 2 + 0.002), HY + 0.16, -0.01, 0.006, HH - 0.15, HD - 0.03, dark); cb(0, HY + 0.1, -HD / 2 - 0.002, HW + 0.01, HH - 0.09, 0.006, dark); return; }
  if (s === 'short') { cap(0.04); fringe(0.05); return; }
  if (s === 'sidepart') { cap(0.045); cb(-0.03, T - 0.05, HD / 2 + 0.004, W - 0.06, 0.07, 0.018, hc); cb(-0.04, T + 0.03, 0.02, W - 0.08, 0.025, D - 0.06, hc); return; }
  if (s === 'spiky') { cap(0.03); for (const [x, z, h] of [[-0.08, 0.06, 0.07], [0, 0.08, 0.09], [0.08, 0.05, 0.07], [-0.05, -0.04, 0.08], [0.05, -0.05, 0.08], [0, -0.09, 0.06]]) cb(x, T + 0.02, z, 0.05, h, 0.05, hc); fringe(0.04); return; }
  if (s === 'mohawk') { cb(0, T, 0, HW + 0.01, 0.008, HD + 0.01, shade(hc, 0.6)); cb(0, T, -0.005, 0.07, 0.12, HD + 0.02, hc); cb(0, HY + 0.12, -HD / 2 - 0.02, 0.07, HH - 0.02, 0.04, hc); return; }
  if (s === 'afro') { cb(0, T - 0.08, -0.02, HW + 0.12, 0.2, HD + 0.1, hc); for (const x of [-1, 1]) cb(x * (HW / 2 + 0.03), HY + 0.08, -0.03, 0.06, 0.14, HD + 0.04, hc); cb(0, HY + 0.06, -HD / 2 - 0.04, HW + 0.1, 0.18, 0.08, hc); return; }
  if (s === 'bob') { cap(0.04); for (const x of [-1, 1]) cb(x * (HW / 2 + 0.018), HY + 0.02, 0.0, 0.035, HH - 0.01, HD + 0.01, hc); cb(0, HY + 0.01, -HD / 2 - 0.018, W + 0.03, HH - 0.01, 0.035, hc); fringe(0.07); return; }
  if (s === 'long') { cap(0.04); fringe(0.05, 0.03); for (const x of [-1, 1]) cb(x * (HW / 2 + 0.018), HY - 0.12, -0.03, 0.035, HH + 0.1, HD - 0.04, hc); cb(0, 1.12, -HD / 2 - 0.035, W + 0.02, T - 1.12 - 0.02, 0.05, hc); return; }
  if (s === 'ponytail') { cap(0.035); fringe(0.035); cb(0, HY + 0.15, -HD / 2 - 0.03, 0.06, 0.05, 0.04, shade(hc, 0.6)); cb(0, HY - 0.15, -HD / 2 - 0.06, 0.07, 0.3, 0.06, hc); return; }
  if (s === 'bun') { cap(0.035); fringe(0.035); cb(0, T + 0.01, -0.06, 0.11, 0.09, 0.11, hc); return; }
  if (s === 'pigtails') { cap(0.035); fringe(0.06); for (const x of [-1, 1]) { cb(x * (HW / 2 + 0.03), HY + 0.12, -0.04, 0.04, 0.05, 0.05, shade(hc, 0.6)); cb(x * (HW / 2 + 0.05), HY - 0.18, -0.04, 0.07, 0.32, 0.07, hc); } return; }
  if (s === 'mullet') { cap(0.04); fringe(0.04); cb(0, 1.36, -HD / 2 - 0.02, W, HY - 1.36 + 0.12, 0.04, hc); for (const x of [-1, 1]) cb(x * (HW / 2 + 0.012), HY - 0.04, -0.07, 0.024, 0.16, 0.1, hc); return; }
}

// ---------------------------------------------------------------------
// Third person
// ---------------------------------------------------------------------
let mode = 'play';            // 'play' | 'creator' (new life, staged in the main room) | 'mirror' (bathroom)
let walkPhase = 0, lastX = null, lastZ = null, moving = false;
const third = () => N.S && N.S.view === 'third' && mode === 'play';
const EYE = () => 1.62 * (HEIGHT[(N.S && N.S.char && N.S.char.height) || 'average'] || 1);
function thirdCam() {
  const P = N.P, cp = Math.cos(P.pitch);
  const fx = -Math.sin(P.yaw) * cp, fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * cp;
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const want = 1.9, eyeY = P.y + 0.15, SH = 0.55;
  // pull in if the wall is close behind
  let dist = want;
  for (let d = want; d > 0.4; d -= 0.05) {
    const x = P.x - fx * d + rx * SH, z = P.z - fz * d + rz * SH;
    dist = d; if (N.walkable(x, z, 0.12)) break;
  }
  let x = P.x - fx * dist + rx * SH, z = P.z - fz * dist + rz * SH;
  if (!N.walkable(x, z, 0.05)) { x = P.x - fx * 0.3; z = P.z - fz * 0.3; }
  const y = Math.max(0.25, Math.min(2.45, eyeY - fy * dist));
  return { x, y, z, yaw: P.yaw, pitch: P.pitch, reach: dist };
}
N.hooks.camera.push(() => mode === 'creator' ? creatorCam() : mode === 'mirror' ? mirrorCam() : third() ? thirdCam() : null);
N.heldAnchor = () => {
  if (!third()) return null;
  const P = N.P, s = HEIGHT[N.S.char.height] || 1, f = 0.32 * s;
  return { x: P.x - Math.sin(P.yaw) * f, y: 1.0 * s, z: P.z - Math.cos(P.yaw) * f };
};
N.hooks.update.push(dt => {
  const P = N.P;
  P.y = EYE();
  if (lastX !== null) { const d = Math.hypot(P.x - lastX, P.z - lastZ); moving = d > 0.0005; if (moving) walkPhase += d * 7.5; }
  lastX = P.x; lastZ = P.z;
});
let lastPose = null;
function recordDraw(ch, x, z, yaw) {
  RECORD = []; drawCharacter(ch, x, z, yaw, 0, {}); lastHits = RECORD; RECORD = null;
  lastPose = { x, z, yaw, sc: HEIGHT[ch.height] || 1 };
}
N.hooks.drawSelf.push(() => {
  const S = N.S; if (!S || !S.char) return;
  N.env.selfVisible = mode === 'creator' || third() || (mode === 'mirror' && N.settings.mirror === 'simple');
  if (mode === 'creator') return recordDraw(draft, STAGE.x, STAGE.z, stageYaw);
  if (mode === 'mirror') return recordDraw(draft, N.MIRROR.stand.x, N.MIRROR.stand.z, stageYaw);
  const sit = N.sitPose && N.sitPose(); // sitting on a chair / beanbag / couch (furniture.js)
  if (N.started) drawCharacter(S.char, sit ? sit.x : N.P.x, sit ? sit.z : N.P.z, sit ? sit.yaw : N.P.yaw, walkPhase, { moving: moving && !sit, holding: !!(S.kitchen && S.kitchen.held), sit });
});
N.hooks.key.push(code => {
  if (code === 'KeyV') { N.S.view = third() ? 'first' : 'third'; N.toast(N.S.view === 'third' ? 'Third person (press V to switch back).' : 'First person.', '', 2000); N.save(); }
});

// ---------------------------------------------------------------------
// Creator UI
// ---------------------------------------------------------------------
const STAGE = { x: 3.05, z: 1.5 };
let stageYaw = Math.PI, draft = { ...DEFAULT }, onDone = null, dragX = null;
// in front of the bathroom mirror: just behind your own head, looking at the glass
function mirrorCam() {
  const st = N.MIRROR.stand, s = HEIGHT[draft.height] || 1;
  // "simple" mirrors don't reflect: look back at you from beyond the glass (everything behind it is clipped away)
  if (N.settings.mirror === 'simple') return { x: st.x - 1.72, y: 1.02 * s, z: st.z - 0.26, yaw: -Math.PI / 2, pitch: 0.0, clip: [1, 0, 0, -(N.MIRROR.x + 0.01)], bathOnly: true };
  return { x: st.x + 0.3, y: 1.5 * s, z: st.z + 0.1, yaw: Math.PI / 2 + 0.3, pitch: -0.18 };
}
function creatorCam() { const s = HEIGHT[draft.height] || 1; return { x: STAGE.x - 0.62, y: 0.98 * s + 0.02, z: STAGE.z + 2.3, yaw: 0.0, pitch: -0.05 }; }

const css = document.createElement('style');
css.textContent = `
  #creator { position: fixed; inset: 0; display: none; z-index: 12; pointer-events: none; }
  #creator.show { display: block; }
  #creator .panel { pointer-events: all; position: absolute; left: 14px; top: 14px; bottom: 14px; width: min(370px, calc(100vw - 28px)); background: #17151fee;
    border: 1px solid #34304a; border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px #000a; backdrop-filter: blur(4px); }
  #creator .head { padding: 16px 18px 8px; } #creator .head h2 { margin: 0; font-size: 22px; } #creator .head p { margin: 4px 0 0; color: #a39db8; font-size: 13px; }
  #creator .scroll { flex: 1; overflow-y: auto; padding: 4px 18px 10px; }
  #creator .sec { margin: 12px 0; } #creator .sec > b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #a39db8; margin-bottom: 6px; }
  #creator .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  #creator .chips button { font: inherit; font-size: 13px; font-weight: 700; color: #f1eee6; background: #221f2e; border: 1px solid #34304a; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
  #creator .chips button.on { border-color: #ffcf5a; color: #ffcf5a; background: #2c2738; }
  #creator .sw { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  #creator .sw button { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #ffffff22; cursor: pointer; padding: 0; }
  #creator .sw button.on { border-color: #fff; box-shadow: 0 0 0 2px #ffcf5a; }
  #creator .sw label { width: 26px; height: 26px; border-radius: 50%; position: relative; overflow: hidden; cursor: pointer; border: 2px solid #ffffff22;
    background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
  #creator .sw label input { position: absolute; inset: -6px; opacity: 0; width: 40px; height: 40px; cursor: pointer; }
  #creator .foot { padding: 12px 18px 16px; border-top: 1px solid #34304a; display: flex; flex-wrap: wrap; gap: 8px; }
  #creator .foot .btn { margin: 0; flex: 1; }
  #creator .tpl { display: flex; gap: 6px; align-items: center; }
  #creator select, #creator input[type=text] { font: inherit; font-size: 13px; color: #f1eee6; background: #221f2e; border: 1px solid #34304a; border-radius: 8px; padding: 7px 9px; flex: 1; min-width: 0; user-select: text; }
  #creator .mini { font: inherit; font-size: 12px; font-weight: 800; color: #f1eee6; background: #2c2738; border: 1px solid #34304a; border-radius: 8px; padding: 7px 10px; cursor: pointer; white-space: nowrap; }
  #creator .rot { position: absolute; right: 18px; bottom: 18px; display: flex; gap: 8px; pointer-events: all; }
  #creator .rot button { font: inherit; font-size: 18px; font-weight: 900; width: 44px; height: 44px; border-radius: 50%; border: 1px solid #ffffff33; background: #0d0c14cc; color: #fff; cursor: pointer; }
  #creator .hint { position: absolute; right: 18px; top: 18px; background: #0d0c14cc; border: 1px solid #ffffff22; border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #a39db8; }
  @media (max-width: 760px) { #creator .panel { top: auto; height: 58vh; } }`;
document.head.appendChild(css);
const root = document.createElement('div'); root.id = 'creator';
root.innerHTML = `<div class="panel"><div class="head"><h2 id="crTitle">Create your character</h2><p id="crSub">Everything is mix and match.</p></div>
  <div class="scroll" id="crBody"></div>
  <div class="foot"><button class="btn ghost" id="crRandom">🎲 Randomize</button><button class="btn" id="crDone">Start life</button></div></div>
  <div class="hint">Drag to spin</div><div class="rot"><button id="crL">⟲</button><button id="crR">⟳</button></div>`;
document.body.appendChild(root);

const templates = () => { try { return JSON.parse(localStorage.getItem(TPL_KEY)) || []; } catch (e) { return []; } };
const saveTemplates = t => { try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch (e) {} };

let W = null, armPin = null, lastHits = [];  // W = wardrobe in use (null for a new life = base clothes only)
const GATED = ['top', 'bottom', 'hat', 'glasses', 'neck'];
function chips(key, label) {
  const list = GATED.includes(key) ? OPT[key].filter(([v]) => owns(W, v)) : OPT[key];
  return `<div class="sec"><b>${label}</b><div class="chips">${list.map(([v, l]) => `<button data-k="${key}" data-v="${v}" class="${draft[key] === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}
function swatches(key, list) {
  return `<div class="sw">${list.map(c => `<button data-c="${key}" data-v="${c}" style="background:${c}" class="${draft[key] === c ? 'on' : ''}"></button>`).join('')}
    <label title="Custom colour"><input type="color" data-cc="${key}" value="${draft[key]}"></label></div>`;
}
function render() {
  const tpl = templates();
  const tplOpts = tpl.length ? tpl.map((t, i) => `<option value="${i}">${t.name.replace(/</g, '&lt;')}</option>`).join('') : '<option value="">No saved templates</option>';
  document.getElementById('crBody').innerHTML = `
    <div class="sec"><b>Templates</b>
      <div class="tpl"><select id="crTpl" ${tpl.length ? '' : 'disabled'}>${tplOpts}</select><button class="mini" id="crLoad" ${tpl.length ? '' : 'disabled'}>Load</button><button class="mini" id="crDel" ${tpl.length ? '' : 'disabled'}>Delete</button></div>
      <div class="tpl" style="margin-top:6px"><input type="text" id="crName" maxlength="24" placeholder="Template name"><button class="mini" id="crSave">Save as template</button></div></div>
    ${chips('gender', 'Gender')}
    ${chips('build', 'Build')}${chips('height', 'Height')}${chips('chest', 'Chest')}
    <div class="sec"><b>Skin tone</b>${swatches('skin', SKIN)}</div>
    <div class="sec"><b>Eyes</b>${swatches('eyes', EYES)}</div>
    ${chips('hair', 'Hair')}<div class="sec" style="margin-top:-4px">${swatches('hairColor', HAIRC)}</div>
    ${chips('facial', 'Facial hair')}
    ${chips('top', 'Top')}<div class="sec" style="margin-top:-4px">${swatches('topColor', CLOTH)}</div>
    ${chips('bottom', 'Bottom')}<div class="sec" style="margin-top:-4px">${swatches('bottomColor', CLOTH)}</div>
    <div class="sec"><b>Shoes</b>${swatches('shoes', ['#2a2a2e', '#e9e6df', '#c43a3a', '#2f5fae', '#5a3a2a', '#e0b23a'])}</div>
    ${accessoriesHTML()}`;
  const body = document.getElementById('crBody');
  body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { draft[b.dataset.k] = b.dataset.v; keepScroll(render); });
  body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { draft[b.dataset.c] = b.dataset.v; keepScroll(render); });
  body.querySelectorAll('[data-cc]').forEach(i => i.oninput = () => { draft[i.dataset.cc] = i.value; });
  body.querySelectorAll('[data-cc]').forEach(i => i.onchange = () => keepScroll(render));
  document.getElementById('crSave').onclick = () => {
    const name = document.getElementById('crName').value.trim() || `Character ${templates().length + 1}`;
    const t = templates().filter(x => x.name !== name); t.push({ name, char: { ...draft } }); saveTemplates(t);
    N.toast(`Saved template "${name}".`, 'good'); keepScroll(render);
  };
  document.getElementById('crLoad').onclick = () => { const t = templates()[+document.getElementById('crTpl').value]; if (t) { draft = sanitize(t.char, W); keepScroll(render); } };
  body.querySelectorAll('[data-arm]').forEach(b => b.onclick = () => { armPin = armPin === b.dataset.arm ? null : b.dataset.arm; keepScroll(render); });
  body.querySelectorAll('[data-unpin]').forEach(b => b.onclick = () => { draft.pins.splice(+b.dataset.unpin, 1); keepScroll(render); });
  const clr = document.getElementById('crClearPins'); if (clr) clr.onclick = () => { draft.pins = []; keepScroll(render); };
  document.getElementById('crDel').onclick = () => { const i = +document.getElementById('crTpl').value, t = templates(); if (t[i]) { N.toast(`Deleted "${t[i].name}".`); t.splice(i, 1); saveTemplates(t); keepScroll(render); } };
}
const PIN_ICON = Object.fromEntries(CATALOG.filter(i => i.pin).map(i => [i.pin, i.icon]));
const PIN_NAME = Object.fromEntries(CATALOG.filter(i => i.pin).map(i => [i.pin, i.name]));
const BONE_NAME = { body: 'body', head: 'head', armL: 'left arm', armR: 'right arm', legL: 'left leg', legR: 'right leg' };
function pinsLeft(t) { return ((W && W.pins[t]) || 0) - draft.pins.filter(p => p.t === t).length; }
function accessoriesHTML() {
  const anyExtras = W && (Object.keys(W.owned).length || Object.values(W.pins).some(n => n > 0));
  if (!anyExtras) return `<div class="sec"><b>Accessories</b><p style="color:#a39db8;font-size:13px;margin:0">${W ? 'Buy hats, glasses, chains, pins and more clothes in the PogeyMart app on your PC.' : 'Hats, glasses, chains and pins can be bought in-game from PogeyMart on your PC.'}</p></div>`;
  let h = '';
  if (OPT.hat.some(([v]) => v !== 'none' && owns(W, v))) {
    h += chips('hat', 'Hat');
    if (draft.hat !== 'none' && draft.hat !== 'crown') h += `<div class="sec" style="margin-top:-4px">${swatches('hatColor', HAT_COLORS)}</div>`;
  }
  if (OPT.glasses.some(([v]) => v !== 'none' && owns(W, v))) h += chips('glasses', 'Glasses');
  if (OPT.neck.some(([v]) => v !== 'none' && owns(W, v))) h += chips('neck', 'Chain');
  const types = PIN_TYPES.filter(t => (W.pins[t] || 0) > 0);
  if (types.length) {
    h += `<div class="sec"><b>Pins</b><p style="color:#a39db8;font-size:12px;margin:0 0 6px">${armPin ? `Click anywhere on your character to stick the ${PIN_NAME[armPin].toLowerCase()} there.` : 'Pick a pin, then click on your character to place it.'}</p>
      <div class="chips">${types.map(t => `<button data-arm="${t}" class="${armPin === t ? 'on' : ''}" ${pinsLeft(t) <= 0 ? 'disabled style="opacity:.4"' : ''}>${PIN_ICON[t]} ${pinsLeft(t)} left</button>`).join('')}</div>
      ${draft.pins.length ? `<div class="chips" style="margin-top:8px">${draft.pins.map((p, i) => `<button data-unpin="${i}" title="Remove">${PIN_ICON[p.t]} ${BONE_NAME[p.bone]} ✕</button>`).join('')}<button id="crClearPins">Remove all</button></div>` : ''}</div>`;
  }
  return h;
}
function keepScroll(fn) { const sc = document.getElementById('crBody'), y = sc.scrollTop; fn(); sc.scrollTop = y; }

function openCreator(kind) {
  const isNew = kind === 'new';
  mode = isNew ? 'creator' : 'mirror'; stageYaw = isNew ? Math.PI : N.MIRROR.stand.yaw;
  if (!isNew) { const P = N.P, st = N.MIRROR.stand; P.x = st.x; P.z = st.z; P.yaw = st.yaw; P.pitch = -0.1; } // step in front of the mirror
  W = isNew ? null : N.S.wardrobe; armPin = null;
  draft = isNew ? (templates().length ? sanitize(templates()[templates().length - 1].char, null) : randomChar()) : sanitize(N.S.char, W);
  draft.pins = (draft.pins || []).map(p => ({ ...p }));
  document.getElementById('crTitle').textContent = isNew ? 'Create your character' : 'Full-length mirror';
  document.getElementById('crSub').textContent = isNew ? 'Everything is mix and match. Save a template to reuse a look.' : 'Change your look. Click your reflection to place pins.';
  document.getElementById('crDone').textContent = isNew ? 'Start life' : 'Done';
  onDone = isNew
    ? () => { N.begin(null); N.S.char = sanitize(draft, N.S.wardrobe); N.save(); }
    : () => { N.S.char = { ...draft }; N.save(); N.closeModal(); };
  if (!isNew) N.openModal();
  render();
  root.classList.add('show');
}
function closeCreator(commit) {
  root.classList.remove('show'); mode = 'play'; armPin = null;
  if (commit && onDone) onDone();
  else if (!commit) N.closeModal();
}
document.getElementById('crDone').onclick = () => closeCreator(true);
document.getElementById('crRandom').onclick = () => { draft = randomChar(); keepScroll(render); };
document.getElementById('crL').onclick = () => { stageYaw -= 0.6; };
document.getElementById('crR').onclick = () => { stageYaw += 0.6; };
// drag anywhere outside the panel to spin the character
let dragDist = 0;
const editing = () => mode === 'creator' || mode === 'mirror';
window.addEventListener('pointerdown', e => { if (editing() && e.target.tagName === 'CANVAS') { dragX = e.clientX; dragDist = 0; } });
window.addEventListener('pointermove', e => { if (editing() && dragX !== null) { dragDist += Math.abs(e.clientX - dragX); stageYaw += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
window.addEventListener('pointerup', e => {
  if (editing() && dragX !== null && dragDist < 6 && armPin && e.target.tagName === 'CANVAS') placePinAt(e.clientX, e.clientY);
  dragX = null;
});
// cast a ray from the creator camera through the click and find the nearest body box
function placePinAt(cx, cy) {
  if (pinsLeft(armPin) <= 0) return;
  const cv = document.getElementById('gl'), r = cv.getBoundingClientRect();
  const nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
  const cam = mode === 'mirror' ? mirrorCam() : creatorCam(), th = Math.tan(0.6), asp = r.width / r.height;
  const cp = Math.cos(cam.pitch), f = [-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
  const rt = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
  const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
  const d = [0, 1, 2].map(i => f[i] + rt[i] * nx * th * asp + up[i] * ny * th);
  let org = [cam.x, cam.y, cam.z];
  if (mode === 'mirror' && N.settings.mirror !== 'simple') { // the click lands on the glass: reflect the ray back into the room
    const M = N.MIRROR; if (d[0] >= 0) return;
    const t = (M.x - org[0]) / d[0], hy = org[1] + d[1] * t, hz = org[2] + d[2] * t;
    if (hy < M.y0 || hy > M.y1 || hz < M.z0 || hz > M.z1) return;
    org = [M.x, hy, hz]; d[0] = -d[0];
  }
  if (!lastPose) return;
  const sc = lastPose.sc, cy0 = Math.cos(lastPose.yaw), sy0 = Math.sin(lastPose.yaw);
  const toLocal = (p, isDir, limb) => {               // inverse of toWorld
    let x = p[0] - (isDir ? 0 : lastPose.x), y = p[1], z = p[2] - (isDir ? 0 : lastPose.z);
    let lx = (cy0 * x - sy0 * z) / sc, ly = y / sc, lz = (-sy0 * x - cy0 * z) / sc;
    if (limb) { const [, py, pz, a] = limb, c = Math.cos(-a), s = Math.sin(-a), dy = ly - (isDir ? 0 : py), dz = lz - (isDir ? 0 : pz);
      ly = (isDir ? 0 : py) + dy * c - dz * s; lz = (isDir ? 0 : pz) + dy * s + dz * c; }
    return [lx, ly, lz];
  };
  let best = null;
  for (const h of lastHits) {
    const o = toLocal(org, false, h.limb), dl = toLocal(d, true, h.limb);
    let t0 = -Infinity, t1 = Infinity, ax = -1, sg = 0;
    for (let a = 0; a < 3; a++) {
      const lo = h.b[a], hi = h.b[a + 3];
      if (Math.abs(dl[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) { t0 = Infinity; break; } continue; }
      let ta = (lo - o[a]) / dl[a], tb = (hi - o[a]) / dl[a], s = -1;
      if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; }
      if (ta > t0) { t0 = ta; ax = a; sg = s; }
      t1 = Math.min(t1, tb);
    }
    if (t0 <= t1 && t0 > 0 && ax >= 0 && (!best || t0 < best.t)) best = { t: t0, h, p: [0, 1, 2].map(i => o[i] + dl[i] * t0), ax, sg };
  }
  if (!best) return;
  const p = best.p; p[best.ax] = best.sg > 0 ? best.h.b[best.ax + 3] : best.h.b[best.ax];
  draft.pins.push({ t: armPin, bone: best.h.bone, x: +p[0].toFixed(4), y: +p[1].toFixed(4), z: +p[2].toFixed(4), ax: best.ax, s: best.sg });
  if (pinsLeft(armPin) <= 0) armPin = null;
  keepScroll(render);
}
document.addEventListener('keydown', e => { if (mode === 'mirror' && e.code === 'Escape' && document.getElementById('crDone').textContent === 'Done') closeCreator(false); });

N.hooks.newLife.push(() => openCreator('new'));
N.hooks.interact.push(id => { if (id !== 'mirror') return false; openCreator('mirror'); return true; });

// keys list on the title screen
const keysEl = document.querySelector('.keys');
if (keysEl) keysEl.insertAdjacentHTML('beforeend', '<b>V</b><span>First / third person</span>');

// ---- wardrobe API (shop.js) ----
N.wardrobe = {
  CATALOG, owns: id => owns(N.S && N.S.wardrobe, id),
  pinCount: t => (N.S.wardrobe.pins[t] || 0),
  give(item) {
    const Wd = N.S.wardrobe;
    if (item.pin) Wd.pins[item.pin] = (Wd.pins[item.pin] || 0) + 1;
    else { Wd.owned[item.id] = true; if (['hat', 'glasses', 'neck'].includes(item.slot)) N.S.char[item.slot] = item.id; }
    N.save();
  },
};

// test hooks
window.__char = { get draft() { return draft; }, set draft(v) { draft = v; }, openCreator, closeCreator, randomChar, drawCharacter, OPT, templates, get mode() { return mode; }, get hits() { return lastHits; }, placePinAt, set armPin(v) { armPin = v; }, sanitize };
})();
