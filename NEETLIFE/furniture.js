// NEETLIFE — furniture: every movable piece in the apartment, moving it around, and the Nestly furniture store.
// Each piece is built in local space (origin = min corner of its footprint, w × d, front facing +z) and placed with
// NEET.withXF (offset + quarter turns). The whole layout is baked into one mesh (NEET.setFurniture) and rebuilt
// whenever something moves. Kitchen, bathroom, poster and lights stay fixed.
// Must load right after game.js: cooking.js customises the trash bin's prompt, so the bin has to exist first.
(() => {
'use strict';
const N = window.NEET;
if (!N) return;
const { box, prism, GLOW } = N;

// ---------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------
const dayNow = () => N.dayOf(N.S.t);
const tid = (p, act) => `f:${p.uid}:${act}`;
const thirsty = p => dayNow() - (p.water || dayNow()) >= 3;
const BOOK_COLS = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085', '#d35400'];

const DEFS = {
  // ---- what came with the apartment ----
  bed: { name: 'Bed', icon: '🛏', w: 1.05, d: 2.2, h: 1.0, essential: true, resale: 0,
    build() {
      box(0.02, 0, 0.15, 1.0, 0.3, 2.05, '#5b4636'); box(0.05, 0.3, 0.2, 0.94, 0.18, 1.98, '#ece8e0');
      box(0.04, 0.46, 0.75, 0.96, 0.08, 1.45, '#3d5a8a'); box(0.04, 0.42, 0.7, 0.96, 0.06, 0.1, '#344d78');
      box(0.18, 0.48, 0.25, 0.66, 0.12, 0.38, '#f6f3ec'); box(0.02, 0, 0.0, 1.0, 1.0, 0.15, '#4a382b');
    },
    things: () => [['bed', 'Sleep', [0, 0, 0.15, 1.05, 0.7, 2.2]]] },
  nightstand: { name: 'Nightstand + lamp', icon: '💡', w: 0.47, d: 0.47, h: 1.0, resale: 30,
    build() {
      box(0.03, 0, 0.05, 0.42, 0.5, 0.4, '#6b5240'); box(0.05, 0.5, 0.07, 0.38, 0.02, 0.36, '#7a5e4a');
      prism(0.24, 0.52, 0.25, 0.08, 0.02, '#333', 8); prism(0.24, 0.54, 0.25, 0.015, 0.28, '#333', 6);
      prism(0.24, 0.8, 0.25, 0.12, 0.16, '#f2d9a6', 8, GLOW.LAMP);
    },
    things: () => [['lamp', () => N.S.lampOn === false ? 'Turn the lamp on' : 'Turn the lamp off', [0.1, 0.5, 0.1, 0.38, 0.98, 0.4]]],
    lamp: [0.24, 0.95, 0.25] },
  desk: { name: 'Desk + PC', icon: '🖥', w: 1.5, d: 0.72, h: 1.45, essential: true, resale: 0,
    build() {
      box(0, 0.72, 0.02, 1.5, 0.04, 0.7, '#3b3a44');
      for (const [x, z] of [[0.03, 0.06], [1.42, 0.06], [0.03, 0.62], [1.42, 0.62]]) box(x, 0, z, 0.05, 0.72, 0.05, '#222');
      box(0.68, 0.76, 0.18, 0.14, 0.02, 0.12, '#1d1d22'); box(0.72, 0.78, 0.22, 0.06, 0.18, 0.04, '#1d1d22');
      box(0.33, 0.9, 0.16, 0.84, 0.5, 0.04, '#141418'); box(0.36, 0.93, 0.2, 0.78, 0.44, 0.005, '#ffffff', GLOW.MONITOR);
      box(1.2, 0.76, 0.12, 0.2, 0.42, 0.42, '#1f1f26'); box(1.21, 1.0, 0.54, 0.02, 0.1, 0.005, '#7cf5ff', GLOW.MONITOR);
      box(0.45, 0.76, 0.42, 0.6, 0.02, 0.18, '#2a2a30'); box(1.15, 0.76, 0.46, 0.06, 0.02, 0.1, '#2a2a30');
      prism(0.15, 0.76, 0.45, 0.033, 0.12, '#3ad66b', 8); prism(0.24, 0.76, 0.52, 0.033, 0.12, '#3ad66b', 8);
      prism(0.1, 0.76, 0.58, 0.033, 0.12, '#d63a3a', 8); box(0.05, 0.76, 0.1, 0.28, 0.06, 0.22, '#c9a36b');
    },
    things: () => [['pc', 'Use computer', [0.3, 0.72, 0, 1.2, 1.45, 0.72]]],
    mon: [0.75, 1.15, 0.45] },
  chair: { name: 'Desk chair', icon: '🪑', w: 0.56, d: 0.58, h: 1.2, resale: 40,
    build() {
      const cx = 0.28, cz = 0.28;
      prism(cx, 0, cz, 0.28, 0.04, '#222', 5); prism(cx, 0.04, cz, 0.03, 0.4, '#333', 6);
      box(cx - 0.25, 0.44, cz - 0.25, 0.5, 0.08, 0.5, '#b03030'); box(cx - 0.24, 0.52, cz + 0.2, 0.48, 0.65, 0.07, '#b03030');
    } },
  rug: { name: 'Purple rug', icon: '🟪', w: 1.9, d: 1.4, h: 0.02, flat: true, resale: 20,
    build() { box(0, 0.0, 0, 1.9, 0.01, 1.4, '#5a3a5e'); box(0.08, 0.01, 0.08, 1.74, 0.005, 1.24, '#6b4870'); } },
  beanbag: { name: 'Green beanbag', icon: '🫘', w: 0.7, d: 0.7, h: 0.65, resale: 30,
    build() { box(0, 0, 0, 0.7, 0.3, 0.7, '#2f6b5a'); box(0.08, 0.3, 0.07, 0.54, 0.16, 0.55, '#327562'); box(0.04, 0.3, 0.5, 0.62, 0.35, 0.2, '#2f6b5a'); },
    things: p => [[tid(p, 'flop'), 'Flop onto the beanbag', [0, 0, 0, 0.7, 0.65, 0.7]]] },
  pizza: { name: 'Pizza box stack', icon: '🍕', w: 0.45, d: 0.46, h: 0.16, solid: false, resale: 0,
    build() { box(0.01, 0, 0.02, 0.42, 0.05, 0.42, '#c9a36b'); box(0.03, 0.05, 0.04, 0.42, 0.05, 0.42, '#bf9860'); box(0, 0.1, 0, 0.42, 0.05, 0.42, '#c9a36b'); } },
  laundry: { name: 'Laundry pile', icon: '🧺', w: 0.5, d: 0.4, h: 0.3, solid: false, resale: 0,
    build() { box(0, 0, 0, 0.5, 0.18, 0.4, '#6d7a8c'); box(0.1, 0.18, 0.06, 0.32, 0.12, 0.28, '#8c5a5a'); } },
  trash: { name: 'Trash bin', icon: '🗑', w: 0.34, d: 0.38, h: 0.5, essential: true, resale: 0,
    build() { prism(0.17, 0, 0.19, 0.16, 0.45, '#3a3a40', 8); prism(0.17, 0.45, 0.19, 0.17, 0.03, '#2c2c32', 8); },
    things: () => [['trash', 'Trash', [-0.02, 0, 0, 0.36, 0.6, 0.38]]] },

  // ---- the Nestly catalogue ----
  couch: { name: 'Couch', icon: '🛋', price: 450, w: 2.0, d: 0.85, h: 0.9, shop: true,
    desc: 'Seats three, or one NEET lying down. Sit and watch TV if you have one.',
    build() {
      const c = '#4a6fa5';
      box(0.05, 0, 0.05, 1.9, 0.1, 0.75, '#2b2b30'); box(0, 0.1, 0, 2.0, 0.3, 0.85, '#3f5f8f');
      box(0, 0.4, 0, 2.0, 0.48, 0.22, c); box(0, 0.4, 0.22, 0.18, 0.22, 0.63, c); box(1.82, 0.4, 0.22, 0.18, 0.22, 0.63, c);
      for (let i = 0; i < 3; i++) box(0.2 + i * 0.54, 0.4, 0.22, 0.52, 0.1, 0.6, '#5b80b8');
      box(0.26, 0.5, 0.24, 0.32, 0.26, 0.1, '#e0b04a');
    },
    things: p => [[tid(p, 'couch'), () => anyTvOn() ? 'Sit and watch TV (1 h)' : 'Sit and zone out (30 min)', [0, 0, 0, 2.0, 0.9, 0.85]]] },
  coffee: { name: 'Coffee table', icon: '☕', price: 120, w: 1.0, d: 0.55, h: 0.48, shop: true,
    desc: 'Somewhere to put your feet and your drinks.',
    build() {
      box(0, 0.38, 0, 1.0, 0.05, 0.55, '#7a5236');
      for (const [x, z] of [[0.04, 0.04], [0.91, 0.04], [0.04, 0.46], [0.91, 0.46]]) box(x, 0, z, 0.05, 0.38, 0.05, '#5a3a24');
      box(0.15, 0.43, 0.12, 0.25, 0.01, 0.18, '#d94f6a'); prism(0.75, 0.43, 0.3, 0.04, 0.08, '#f2f2f2', 8);
    } },
  tv: { name: 'TV + stand', icon: '📺', price: 600, w: 1.4, d: 0.45, h: 1.25, shop: true,
    desc: 'A 55" screen and a console you will never finish the backlog on.',
    build() {
      box(0, 0, 0, 1.4, 0.45, 0.45, '#2c2c33'); box(0.15, 0.08, 0.28, 0.35, 0.07, 0.16, '#e8e8e8');
      box(0.6, 0.45, 0.15, 0.2, 0.05, 0.12, '#111'); box(0.12, 0.5, 0.12, 1.16, 0.68, 0.06, '#111');
      box(0.15, 0.53, 0.18, 1.1, 0.62, 0.005, '#ffffff', GLOW.TV);
    },
    things: p => [[tid(p, 'tv'), () => N.S.furn.tvOn ? 'Turn the TV off' : 'Turn the TV on', [0.1, 0.45, 0.05, 1.3, 1.2, 0.3]]] },
  bookshelf: { name: 'Bookshelf', icon: '📚', price: 180, w: 0.9, d: 0.35, h: 1.8, shop: true,
    desc: 'Full of books. You might even read one.',
    build() {
      const wood = '#6e4b32';
      box(0, 0, 0, 0.04, 1.8, 0.35, wood); box(0.86, 0, 0, 0.04, 1.8, 0.35, wood); box(0, 1.76, 0, 0.9, 0.04, 0.35, wood);
      box(0.04, 0, 0, 0.82, 1.76, 0.02, '#5a3d28');
      for (let s = 0; s < 4; s++) {
        const y = s * 0.44; box(0.04, y, 0.02, 0.82, 0.03, 0.33, wood);
        let x = 0.06, k = s * 7;
        while (x < 0.8) { const bw = 0.035 + ((k * 37) % 4) * 0.01, bh = 0.24 + ((k * 13) % 5) * 0.03; if (x + bw > 0.84) break;
          box(x, y + 0.03, 0.06, bw, bh, 0.24, BOOK_COLS[k % BOOK_COLS.length]); x += bw + 0.004; k++; }
      }
    },
    things: p => [[tid(p, 'read'), 'Read a book (30 min)', [0, 0, 0, 0.9, 1.8, 0.4]]] },
  plant: { name: 'Houseplant', icon: '🪴', price: 35, w: 0.4, d: 0.4, h: 1.0, shop: true,
    desc: 'Water it every couple of days or it gets sad.',
    build(p) {
      prism(0.2, 0, 0.2, 0.14, 0.27, '#b5651d', 8); prism(0.2, 0.26, 0.2, 0.155, 0.04, '#a0561a', 8);
      prism(0.2, 0.29, 0.2, 0.13, 0.01, '#4a3020', 8); prism(0.2, 0.29, 0.2, 0.02, 0.35, '#3a6b2a', 6);
      const dry = thirsty(p), col = dry ? '#9a8a40' : '#3f9a3a', col2 = dry ? '#857634' : '#57b84e', dy = dry ? -0.13 : 0;
      const L = [[0.04, 0.55, 0.12, 0.16, 0.04, 0.12], [0.2, 0.62, 0.04, 0.12, 0.04, 0.16], [0.2, 0.72, 0.22, 0.15, 0.04, 0.12], [0.05, 0.8, 0.2, 0.13, 0.04, 0.14], [0.14, 0.88, 0.12, 0.12, 0.05, 0.12]];
      L.forEach((l, i) => box(l[0], l[1] + dy * (0.5 + i * 0.15), l[2], l[3], l[4], l[5], i % 2 ? col : col2));
    },
    things: p => [[tid(p, 'water'), () => thirsty(p) ? 'Water the plant (it looks thirsty)' : 'Water the plant', [0, 0, 0, 0.4, 1.0, 0.4]]] },
  floorlamp: { name: 'Floor lamp', icon: '🛋️', price: 90, w: 0.4, d: 0.4, h: 1.7, shop: true,
    desc: 'Warm light for a dark corner. Actually lights up the room.',
    build() {
      prism(0.2, 0, 0.2, 0.16, 0.03, '#222', 10); prism(0.2, 0.03, 0.2, 0.015, 1.42, '#333', 6);
      prism(0.2, 1.42, 0.2, 0.17, 0.24, '#f5e6c4', 10, GLOW.FLOORLAMP);
    },
    things: p => [[tid(p, 'flamp'), () => N.S.furn.floorOn ? 'Turn the floor lamp off' : 'Turn the floor lamp on', [0, 0, 0, 0.4, 1.7, 0.4]]],
    light: [0.2, 1.5, 0.2] },
  arcade: { name: 'Arcade cabinet', icon: '🕹', price: 900, w: 0.7, d: 0.75, h: 1.85, shop: true,
    desc: 'A real coin-op. Free play. Beat your own high score.',
    build() {
      box(0, 0, 0, 0.7, 1.85, 0.6, '#3b1f6b'); box(0, 0.3, 0, 0.7, 0.05, 0.6, '#ff4fb0');
      box(0.04, 0.92, 0.6, 0.62, 0.08, 0.15, '#2a1450'); prism(0.2, 1.0, 0.67, 0.012, 0.08, '#111', 6); prism(0.2, 1.08, 0.67, 0.03, 0.03, '#e33', 6);
      [['#ff4f4f', 0.4], ['#4fd1ff', 0.48], ['#ffd34f', 0.56]].forEach(([c, x]) => prism(x, 1.0, 0.68, 0.025, 0.015, c, 8));
      box(0.08, 1.08, 0.6, 0.54, 0.42, 0.005, '#ffffff', GLOW.ARCADE); box(0.04, 1.6, 0.6, 0.62, 0.18, 0.005, '#ffffff', GLOW.ARCADE);
    },
    things: p => [[tid(p, 'arcade'), 'Play the arcade (20 min)', [0, 0, 0, 0.7, 1.85, 0.75]]] },
  fishtank: { name: 'Fish tank', icon: '🐠', price: 250, w: 0.9, d: 0.45, h: 1.2, shop: true,
    desc: 'Three fish with no names yet. Feed them once a day.',
    build() {
      box(0, 0, 0, 0.9, 0.7, 0.45, '#3a2a20'); box(0.02, 0.7, 0.03, 0.86, 0.45, 0.39, '#ffffff', GLOW.TANK);
      box(0.02, 0.7, 0.42, 0.86, 0.05, 0.004, '#c9b38a'); box(0.7, 0.75, 0.421, 0.02, 0.2, 0.003, '#2f8f4a'); box(0.12, 0.75, 0.421, 0.02, 0.14, 0.003, '#2f8f4a');
      box(0.25, 0.85, 0.422, 0.06, 0.03, 0.004, '#ff8a1a'); box(0.55, 0.95, 0.422, 0.05, 0.025, 0.004, '#ffd23a'); box(0.4, 1.03, 0.422, 0.06, 0.03, 0.004, '#ff5a5a');
      box(0, 1.15, 0.01, 0.9, 0.03, 0.43, '#222');
    },
    things: p => [[tid(p, 'feed'), 'Feed the fish', [0, 0, 0, 0.9, 1.2, 0.45]]] },
  lava: { name: 'Lava lamp table', icon: '🌋', price: 70, w: 0.45, d: 0.45, h: 0.95, shop: true,
    desc: 'A little side table with a lava lamp. Very 1970s, very you.',
    build() {
      box(0, 0.5, 0, 0.45, 0.04, 0.45, '#5a3d2a'); prism(0.225, 0, 0.225, 0.04, 0.5, '#3a2a20', 6); prism(0.225, 0, 0.225, 0.15, 0.02, '#3a2a20', 8);
      prism(0.225, 0.54, 0.225, 0.06, 0.08, '#c0c0c0', 8); prism(0.225, 0.62, 0.225, 0.045, 0.24, '#ffffff', 8, GLOW.LAVA); prism(0.225, 0.86, 0.225, 0.03, 0.05, '#c0c0c0', 8);
    },
    things: p => [[tid(p, 'lava'), () => N.S.furn.lavaOn ? 'Turn the lava lamp off' : 'Turn the lava lamp on', [0, 0, 0, 0.45, 0.95, 0.45]]] },
  beanbag2: { name: 'Purple beanbag', icon: '🟣', price: 80, w: 0.7, d: 0.7, h: 0.65, shop: true,
    desc: 'A second beanbag, for the friend you will definitely have over.',
    build() { box(0, 0, 0, 0.7, 0.3, 0.7, '#6a3f8f'); box(0.08, 0.3, 0.07, 0.54, 0.16, 0.55, '#7a4aa3'); box(0.04, 0.3, 0.5, 0.62, 0.35, 0.2, '#6a3f8f'); },
    things: p => [[tid(p, 'flop'), 'Flop onto the beanbag', [0, 0, 0, 0.7, 0.65, 0.7]]] },
  rug2: { name: 'Blue rug', icon: '🟦', price: 60, w: 1.6, d: 1.2, h: 0.02, flat: true, shop: true,
    desc: 'Ties the room together.',
    build() { box(0, 0, 0, 1.6, 0.012, 1.2, '#2f5d8a'); box(0.1, 0.012, 0.1, 1.4, 0.004, 1.0, '#3f77a8'); box(0.35, 0.016, 0.35, 0.9, 0.003, 0.5, '#e8d27a'); } },
};
const sellValue = t => { const d = DEFS[t]; return d.price ? Math.floor(d.price / 2) : d.resale || 0; };

// what the apartment came with: [type, x, z, quarter turns]
const DEFAULT = [['bed', 0, 0, 0], ['nightstand', 1.05, 0, 0], ['desk', 2.7, 0, 0], ['chair', 3.17, 0.87, 0], ['rug', 1.6, 1.5, 0],
  ['beanbag', 1.7, 2.55, 0], ['pizza', 3.69, 2.88, 0], ['laundry', 0.2, 2.6, 0], ['trash', 4.58, 3.46, 0]];

// ---------------------------------------------------------------------
// State: S.furn = { pieces: [{uid, type, x, z, r, ...}], store: [{uid, type}], next, tvOn, floorOn, lavaOn, arcadeBest }
// ---------------------------------------------------------------------
function ensure(S) {
  if (!S.furn || S.furn.v !== 1) {
    S.furn = { v: 1, pieces: DEFAULT.map(([type, x, z, r], i) => ({ uid: i + 1, type, x, z, r })), store: [], next: DEFAULT.length + 1,
      tvOn: false, floorOn: true, lavaOn: true, arcadeBest: 0 };
  }
  cancelMove(true);
  rebuild();
}
const F = () => N.S.furn;
const anyTvOn = () => F().tvOn && F().pieces.some(p => p.type === 'tv' && !isMoving(p));

// footprint + transform
const dims = p => { const d = DEFS[p.type]; return p.r % 2 ? [d.d, d.w] : [d.w, d.d]; };
const rect = (p, x = p.x, z = p.z, r = p.r) => { const d = DEFS[p.type], [w, dd] = r % 2 ? [d.d, d.w] : [d.w, d.d]; return [x, z, x + w, z + dd]; };
const xfOf = (p, tint) => ({ ox: p.x, oz: p.z, w: DEFS[p.type].w, d: DEFS[p.type].d, r: p.r, tint });
function xfPt(p, lx, lz) {
  const { w, d } = DEFS[p.type], r = p.r;
  const q = r === 1 ? [d - lz, lx] : r === 2 ? [w - lx, d - lz] : r === 3 ? [lz, w - lx] : [lx, lz];
  return [p.x + q[0], p.z + q[1]];
}
function xfBox(p, b) { const [ax, az] = xfPt(p, b[0], b[2]), [bx, bz] = xfPt(p, b[3], b[5]); return [Math.min(ax, bx), b[1], Math.min(az, bz), Math.max(ax, bx), b[4], Math.max(az, bz)]; }

// ---------------------------------------------------------------------
// Bake the layout: mesh, collision, interactables, lights
// ---------------------------------------------------------------------
let mySolids = [], myThings = [];
const thingCache = {}; // keep the same thing objects across rebuilds (cooking.js customises the trash bin's prompt)
let moving = null;
const isMoving = p => moving && moving.p === p;
const handsFull = () => !!(N.S.kitchen && N.S.kitchen.held);
function rebuild() {
  if (!N.S || !N.S.furn) return;
  const geo = { pos: [], nor: [], col: [], glow: [] };
  const placed = F().pieces.filter(p => !isMoving(p));
  N.intoGeometry(geo, () => { for (const p of placed) N.withXF(xfOf(p), () => DEFS[p.type].build(p)); });
  N.setFurniture(geo);
  for (const r of mySolids) { const i = N.solids.indexOf(r); if (i >= 0) N.solids.splice(i, 1); }
  for (const t of myThings) { const i = N.things.indexOf(t); if (i >= 0) N.things.splice(i, 1); }
  mySolids = []; myThings = [];
  N.env.lampPos = null; N.env.monPos = null; N.env.extraLight = null;
  for (const p of placed) {
    const d = DEFS[p.type];
    if (d.solid !== false && !d.flat) { const r = rect(p); N.solids.push(r); mySolids.push(r); }
    for (const [id, prompt, b] of d.things ? d.things(p) : []) {
      const key = p.uid + '|' + id; let t = thingCache[key];
      if (!t) t = thingCache[key] = { id, prompt, box: xfBox(p, b) }; else t.box = xfBox(p, b);
      N.things.push(t); myThings.push(t);
    }
    const at = l => { const [x, z] = xfPt(p, l[0], l[2]); return [x, l[1], z]; };
    if (d.lamp && !N.env.lampPos) N.env.lampPos = at(d.lamp);
    if (d.mon && !N.env.monPos) N.env.monPos = at(d.mon);
    if (d.light && F().floorOn && !N.env.extraLight) N.env.extraLight = { pos: at(d.light), col: [0.62, 0.5, 0.32] };
  }
}

// ---------------------------------------------------------------------
// Moving furniture: F to pick up, R to rotate, E / click to place, Q to cancel, X to put in storage
// ---------------------------------------------------------------------
const KEEP_CLEAR = [
  { r: [0.5, 3.3, 1.5, 4.0], why: 'Keep the front door clear' },
  { r: [2.55, 3.3, 3.45, 4.0], why: 'Keep the bathroom door clear' },
  { r: [3.95, 0.9, 4.38, 3.42], why: "Leave room to use the kitchen" },
];
const overlap = (a, b) => a[0] < b[2] - 0.001 && a[2] > b[0] + 0.001 && a[1] < b[3] - 0.001 && a[3] > b[1] + 0.001;
function fixedSolids() { return N.solids.filter(s => !mySolids.includes(s)); }
function why(p, x, z, r) {
  const d = DEFS[p.type], R = rect(p, x, z, r);
  if (R[0] < -0.001 || R[1] < -0.001 || R[2] > N.ROOM.w + 0.001 || R[3] > N.ROOM.d + 0.001) return 'Too close to the wall';
  if (!d.flat && d.solid !== false) for (const k of KEEP_CLEAR) if (overlap(R, k.r)) return k.why;
  if (!d.flat) for (const s of fixedSolids()) if (overlap(R, s)) return "Something's in the way";
  for (const q of F().pieces) {
    if (q === p || isMoving(q)) continue;
    const qd = DEFS[q.type];
    if (!!qd.flat !== !!d.flat) continue; // rugs go under things
    if (overlap(R, rect(q))) return `It would hit the ${qd.name.toLowerCase()}`;
  }
  if (!d.flat && d.solid !== false) {
    const P = N.P, cx = Math.max(R[0], Math.min(P.x, R[2])), cz = Math.max(R[1], Math.min(P.z, R[3]));
    if (Math.hypot(P.x - cx, P.z - cz) < P.r) return "You're standing there";
  }
  return null;
}
function aimRay() {
  const P = N.P, cp = Math.cos(P.pitch);
  return { o: [P.x, P.y, P.z], d: [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp] };
}
function aimedPiece() {
  const { o, d } = aimRay(); let best = null, bt = 2.6;
  for (const p of F().pieces) {
    if (isMoving(p)) continue;
    const R = rect(p), h = Math.max(0.05, DEFS[p.type].h), lo = [R[0], 0, R[1]], hi = [R[2], h, R[3]];
    let t0 = 0, t1 = bt, ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-6) { if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; } continue; }
      let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < bt) { bt = t0; best = p; }
  }
  return best;
}
function ghostTarget() {
  const { o, d } = aimRay(), p = moving.p, [w, dd] = dims(p);
  let hx, hz;
  const t = d[1] < -0.08 ? o[1] / -d[1] : Infinity;
  if (t < 3.2) { hx = o[0] + d[0] * t; hz = o[2] + d[2] * t; }
  else { const k = Math.hypot(d[0], d[2]) || 1; hx = o[0] + d[0] / k * 1.9; hz = o[2] + d[2] / k * 1.9; }
  const snap = v => Math.round(v / 0.05) * 0.05;
  const x = Math.max(0, Math.min(N.ROOM.w - w, snap(hx - w / 2))), z = Math.max(0, Math.min(N.ROOM.d - dd, snap(hz - dd / 2)));
  return [+x.toFixed(3), +z.toFixed(3)];
}
function startMove(p, from) {
  if (moving) cancelMove();
  if (from !== 'room') { const i = F().store.indexOf(p); if (i >= 0) F().store.splice(i, 1); p.r = p.r || 0; p.x = p.x || 0; p.z = p.z || 0; F().pieces.push(p); }
  moving = { p, from, orig: { x: p.x, z: p.z, r: p.r }, gx: p.x, gz: p.z, why: null };
  rebuild(); thud(300); showHint();
}
function cancelMove(silent) {
  if (!moving) return;
  const { p, from, orig } = moving;
  if (from === 'room') Object.assign(p, orig);
  else { F().pieces.splice(F().pieces.indexOf(p), 1); F().store.push(p); if (!silent) N.toast(`${DEFS[p.type].name} is in storage. Place it from the Nestly app.`); }
  moving = null; if (!silent) { rebuild(); N.save(); } showHint();
}
function placeMove() {
  if (!moving) return;
  if (moving.why) { N.toast(moving.why, 'bad', 1600); thud(120); return; }
  const p = moving.p; p.x = moving.gx; p.z = moving.gz;
  moving = null; rebuild(); N.save(); thud(200); showHint();
}
function storeMove() {
  if (!moving) return;
  const p = moving.p;
  if (DEFS[p.type].essential) { N.toast(`You need your ${DEFS[p.type].name.toLowerCase()}. It can be moved, not stored.`, 'bad', 2400); return; }
  F().pieces.splice(F().pieces.indexOf(p), 1); F().store.push(p);
  moving = null; rebuild(); N.save(); showHint();
  N.toast(`${DEFS[p.type].name} put in storage.`);
}
function thud(f) {
  try { const a = thud.ctx = thud.ctx || new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.08, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.15);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.16); } catch (e) {}
}

// hint bar at the bottom of the screen
const hint = document.createElement('div');
hint.id = 'furnHint';
hint.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:6;pointer-events:none;display:none;' +
  'background:#0b0d17dd;color:#eee;border:1px solid #ffffff26;border-radius:10px;padding:7px 12px;font:600 13px system-ui,sans-serif;text-align:center;white-space:nowrap';
document.body.appendChild(hint);
let hintKey = '';
function showHint(aim) {
  let html = '';
  if (moving) {
    const d = DEFS[moving.p.type];
    html = `Placing <b>${d.icon} ${d.name}</b> · <kbd>R</kbd> rotate · <kbd>E</kbd>/click place · <kbd>Q</kbd> cancel${d.essential ? '' : ' · <kbd>X</kbd> storage'}` +
      (moving.why ? `<br><span style="color:#ff8a8a">${moving.why}</span>` : '<br><span style="color:#8affb0">Fits here</span>');
  } else if (aim) html = `<kbd>F</kbd> Move ${DEFS[aim.type].name.toLowerCase()}`;
  if (html === hintKey) return;
  hintKey = html; hint.innerHTML = html; hint.style.display = html ? 'block' : 'none';
}

N.hooks.key.push(code => {
  if (!N.S || !N.S.furn) return;
  if (moving) {
    if (code === 'KeyR') { moving.p.r = (moving.p.r + 1) % 4; thud(420); }
    else if (code === 'KeyE' || code === 'Enter') placeMove();
    else if (code === 'KeyQ') cancelMove();
    else if (code === 'KeyX' || code === 'Delete' || code === 'Backspace') storeMove();
    return;
  }
  if (code === 'KeyF' && !handsFull()) { const p = aimedPiece(); if (p) startMove(p, 'room'); } // F also eats a held dish (cooking.js)
});
document.addEventListener('mousedown', e => {
  if (!moving || !N.active || !N.locked) return;
  if (e.button === 0) placeMove(); else if (e.button === 2) cancelMove();
});
document.addEventListener('contextmenu', e => { if (moving) e.preventDefault(); });
document.addEventListener('wheel', e => { if (moving && N.active) { moving.p.r = (moving.p.r + (e.deltaY > 0 ? 1 : 3)) % 4; thud(420); } }, { passive: true });

// per frame: ghost position, hint, plant droop on a new day, animated glows
let lastDay = 0;
N.hooks.update.push(() => {
  if (!N.S || !N.S.furn) return;
  if (moving) {
    [moving.gx, moving.gz] = ghostTarget();
    moving.why = why(moving.p, moving.gx, moving.gz, moving.p.r);
    showHint();
  } else showHint(N.active && !N.hovered && !handsFull() ? aimedPiece() : null);
  const day = dayNow();
  if (day !== lastDay) { const had = lastDay; lastDay = day; if (had && F().pieces.some(p => p.type === 'plant')) rebuild(); }
});
N.hooks.draw.push(() => {
  if (!moving || !N.S) return;
  const p = moving.p, ghost = { ...p, x: moving.gx, z: moving.gz };
  N.withXF(xfOf(ghost, moving.why ? [1, 0.25, 0.25] : [0.3, 1, 0.45]), () => DEFS[p.type].build(p));
});
// glow groups for TV / lava / tank / floor lamp / arcade (animated in render time)
(function glowLoop() {
  requestAnimationFrame(glowLoop);
  if (!N.active && hintKey) { hintKey = ''; hint.style.display = 'none'; } // paused, PC open, etc.
  if (!N.S || !N.S.furn) return;
  const t = performance.now() / 1000, pw = N.env.power, f = F(), g = N.env.glow;
  g[GLOW.TV] = f.tvOn ? [0.35 + 0.25 * Math.sin(t * 2.3), 0.45 + 0.2 * Math.sin(t * 3.1 + 1), 0.75 + 0.2 * Math.sin(t * 1.7 + 2)].map(v => v * pw) : [0.04, 0.04, 0.05];
  g[GLOW.LAVA] = f.lavaOn ? [1.0 * pw, (0.42 + 0.15 * Math.sin(t * 0.9)) * pw, (0.3 + 0.12 * Math.sin(t * 0.6 + 2)) * pw] : [0.25, 0.1, 0.08];
  g[GLOW.TANK] = [0.22, 0.58 + 0.04 * Math.sin(t * 1.3), 0.82].map(v => v * (0.35 + 0.65 * pw));
  g[GLOW.FLOORLAMP] = f.floorOn ? [1.0, 0.86, 0.6].map(v => v * pw) : [0.42, 0.38, 0.32];
  const hue = t * 0.4; g[GLOW.ARCADE] = [0.5 + 0.5 * Math.sin(hue), 0.5 + 0.5 * Math.sin(hue + 2.1), 0.5 + 0.5 * Math.sin(hue + 4.2)].map(v => (0.3 + 0.7 * v) * pw);
})();

// ---------------------------------------------------------------------
// Using furniture
// ---------------------------------------------------------------------
const pick = a => a[Math.floor(Math.random() * a.length)];
const SHOWS = ['a cooking show where nobody is allowed to use salt', 'three episodes of a anime you swore you would stop watching', 'a documentary about competitive lawn mowing',
  'a reality show about people who also never leave the house', 'the news. You turn it off after the weather', 'a let\'s-play of a game you own but never played'];
const BOOKS = ['a self-help book. You feel judged', 'half a fantasy novel with a 9-page map', 'a cookbook. You are now hungry', 'a book about stocks. Crypto seems easier', 'a comic. Twice'];
function pass(mins, msg, kind = '') { N.advance(mins); N.updateHUD(); N.save(); N.toast(msg, kind, 3400); }
N.hooks.interact.push(id => {
  if (moving) return true; // E places while moving (handled in the key hook)
  if (!id.startsWith('f:')) return false;
  const [, uid, act] = id.split(':'), p = F().pieces.find(q => q.uid === +uid), f = F();
  if (!p) return true;
  if (act === 'couch') { if (anyTvOn()) pass(60, `You watched ${pick(SHOWS)}.`); else pass(30, 'You sat on the couch and stared at nothing for half an hour. Bliss.'); }
  else if (act === 'flop') pass(15, 'You flop onto the beanbag. It sighs. So do you.');
  else if (act === 'tv') { f.tvOn = !f.tvOn; thud(f.tvOn ? 500 : 250); N.save(); if (f.tvOn && !f.pieces.some(q => q.type === 'couch')) N.toast('Get a couch from Nestly to actually watch it.', '', 2600); }
  else if (act === 'read') pass(30, `You read ${pick(BOOKS)}.`);
  else if (act === 'water') { if (p.water === dayNow() && !thirsty(p)) N.toast("It's had enough water today."); else { p.water = dayNow(); rebuild(); N.save(); N.toast('Glug glug. The plant perks up.', 'good'); } }
  else if (act === 'flamp') { f.floorOn = !f.floorOn; rebuild(); N.save(); thud(600); }
  else if (act === 'lava') { f.lavaOn = !f.lavaOn; N.save(); thud(600); }
  else if (act === 'feed') { if (p.fed === dayNow()) N.toast("They've eaten today. Overfeeding is how you lose fish."); else { p.fed = dayNow(); N.save(); N.toast('The fish do a happy little lap.', 'good'); } }
  else if (act === 'arcade') {
    const score = Math.round((2000 + Math.random() * Math.random() * 98000) / 10) * 10, best = f.arcadeBest || 0;
    f.arcadeBest = Math.max(best, score);
    pass(20, score > best ? `NEW HIGH SCORE: ${score.toLocaleString()}! You type your initials: N E E T.` : `You scored ${score.toLocaleString()}. High score is still ${best.toLocaleString()}.`, score > best ? 'good' : '');
  }
  return true;
});

// ---------------------------------------------------------------------
// Nestly: the furniture store (PC app)
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  .fu-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; } .fu-head h3 { margin:0; }
  .fu-bal { font-weight:800; color:#1b8a4a; }
  .fu-tabs { display:flex; gap:6px; margin:12px 0; } .fu-tabs button { font:inherit; font-weight:800; font-size:13px; border:2px solid #24223a; background:#fff; color:#24223a; border-radius:99px; padding:6px 14px; cursor:pointer; }
  .fu-tabs button.on { background:#24223a; color:#ffcf5a; }
  .fu-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:10px; }
  .fu-card { background:#fff; border:1px solid #ddd9cf; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:6px; }
  .fu-card .ic { font-size:34px; line-height:1; } .fu-card .nm { font-weight:800; font-size:15px; } .fu-card .ds { font-size:12px; color:#6a6880; flex:1; }
  .fu-card .row { display:flex; align-items:center; justify-content:space-between; gap:6px; } .fu-card .pr { font-weight:900; font-size:16px; }
  .fu-card .sz { font-size:11px; color:#9a98a8; }
  .fu-list { display:flex; flex-direction:column; gap:6px; } .fu-item { display:flex; align-items:center; gap:10px; background:#fff; border:1px solid #ddd9cf; border-radius:10px; padding:8px 10px; }
  .fu-item .ic { font-size:22px; width:28px; text-align:center; } .fu-item .nm { flex:1; font-weight:700; } .fu-item .wbtn { padding:5px 10px; font-size:12px; }
  .fu-note { font-size:12px; color:#6a6880; margin:4px 0 10px; } .fu-h4 { margin:14px 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.6px; color:#7a7790; }`;
document.head.appendChild(css);
let tab = 'shop';
function render(body) {
  const S = N.S, f = F();
  const shopItems = Object.entries(DEFS).filter(([, d]) => d.shop);
  let html = `<div class="fu-head"><h3>Nestly 🛋</h3><span class="fu-bal">Balance ${N.money(S.money)}</span></div>
    <p>Flat-pack furniture, delivered same minute. Assembly not required. Somehow.</p>
    <div class="fu-tabs"><button data-tab="shop" class="${tab === 'shop' ? 'on' : ''}">Shop</button><button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">My furniture${f.store.length ? ` (${f.store.length} in storage)` : ''}</button></div>`;
  if (tab === 'shop') {
    html += `<div class="fu-grid">${shopItems.map(([type, d]) => `<div class="fu-card"><div class="ic">${d.icon}</div><div class="nm">${d.name}</div><div class="ds">${d.desc}</div>
      <div class="sz">${d.w.toFixed(1)} × ${d.d.toFixed(1)} m</div>
      <div class="row"><span class="pr">$${d.price.toLocaleString()}</span><button class="wbtn ${S.money >= d.price ? 'gold' : ''}" data-buy="${type}" ${S.money >= d.price ? '' : 'disabled'}>Buy &amp; place</button></div></div>`).join('')}</div>`;
  } else {
    html += `<p class="fu-note">Tip: in your room, look at any piece and press <b>F</b> to move it. <b>R</b> rotates, <b>E</b> or click places it.</p>`;
    html += `<div class="fu-h4">Storage</div>` + (f.store.length ? `<div class="fu-list">${f.store.map(p => { const d = DEFS[p.type], v = sellValue(p.type);
      return `<div class="fu-item"><span class="ic">${d.icon}</span><span class="nm">${d.name}</span><button class="wbtn gold" data-place="${p.uid}">Place</button><button class="wbtn" data-sell="${p.uid}">${v ? 'Sell $' + v : 'Throw out'}</button></div>`; }).join('')}</div>`
      : '<p class="fu-note">Nothing in storage.</p>');
    html += `<div class="fu-h4">In your apartment</div><div class="fu-list">${f.pieces.map(p => { const d = DEFS[p.type];
      return `<div class="fu-item"><span class="ic">${d.icon}</span><span class="nm">${d.name}</span><button class="wbtn" data-move="${p.uid}">Move</button>${d.essential ? '' : `<button class="wbtn" data-stash="${p.uid}">Store</button>`}</div>`; }).join('')}</div>`;
  }
  body.innerHTML = html;
  body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(body); });
  body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy));
  const byUid = (arr, u) => arr.find(p => p.uid === +u);
  body.querySelectorAll('[data-place]').forEach(b => b.onclick = () => { const p = byUid(f.store, b.dataset.place); if (p) { N.closePC(); startMove(p, 'store'); } });
  body.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { const p = byUid(f.pieces, b.dataset.move); if (p) { N.closePC(); startMove(p, 'room'); } });
  body.querySelectorAll('[data-stash]').forEach(b => b.onclick = () => { const p = byUid(f.pieces, b.dataset.stash); if (p && !DEFS[p.type].essential) { f.pieces.splice(f.pieces.indexOf(p), 1); f.store.push(p); rebuild(); N.save(); render(body); } });
  body.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => {
    const p = byUid(f.store, b.dataset.sell); if (!p) return;
    const v = sellValue(p.type); f.store.splice(f.store.indexOf(p), 1);
    if (v) N.addMoney(v, `Nestly: sold ${DEFS[p.type].name.toLowerCase()}`); else N.save();
    N.toast(v ? `Sold the ${DEFS[p.type].name.toLowerCase()} for $${v}.` : `Threw out the ${DEFS[p.type].name.toLowerCase()}.`); render(body);
  });
}
function buy(type) {
  const d = DEFS[type], f = F();
  if (!d || N.S.money < d.price) return;
  N.addMoney(-d.price, `Nestly: ${d.name}`);
  const p = { uid: f.next++, type, x: 0, z: 0, r: 0 };
  if (type === 'plant') p.water = dayNow();
  f.store.push(p); N.save();
  N.closePC();
  startMove(p, 'store');
  N.toast(`${d.name} delivered! Find a spot for it.`, 'good', 3000);
}
setTimeout(() => N.pcAddApp('furni', '🛋', 'Nestly', 'linear-gradient(135deg,#f6a65a,#e0533d)', render), 0); // after the other apps

N.hooks.fresh.push(ensure);
if (N.S) ensure(N.S);

window.__furn = { DEFS, get F() { return F(); }, get moving() { return moving; }, startMove, placeMove, cancelMove, storeMove, rebuild, why, aimedPiece, buy, render };
})();
