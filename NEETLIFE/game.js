// Pogey Life — a tiny first-person life sim.
// Rendering is a small hand-rolled WebGL engine (no dependencies): the room is built from
// boxes merged into one static mesh, lit by a few point lights plus a time-of-day ambient.
(() => {
'use strict';

const $ = id => document.getElementById(id);

// =====================================================================
// Math
// =====================================================================
const M4 = {
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  },
  mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  // view matrix from position, yaw (around Y) and pitch (around X)
  view(px, py, pz, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // camera basis: forward f, right r, up u
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    const rx = cy, ry = 0, rz = -sy;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    return [rx, ux, -fx, 0, ry, uy, -fy, 0, rz, uz, -fz, 0,
      -(rx * px + ry * py + rz * pz), -(ux * px + uy * py + uz * pz), (fx * px + fy * py + fz * pz), 1];
  },
};
const hex = h => { let x = h.slice(1); if (x.length === 3) x = x.replace(/./g, c => c + c); const n = parseInt(x, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// =====================================================================
// Geometry builder: boxes / prisms with flat normals, per-vertex colour and a "glow group"
// (0 = lit normally, 1 = sky, 2 = monitor, 3 = ceiling bulb, 4 = lamp bulb, 5 = fridge light)
// =====================================================================
let G = { pos: [], nor: [], col: [], glow: [] };   // current build target (static room by default)
const STATIC_G = G;
function intoGeometry(target, fn) { const prev = G; G = target; try { fn(); } finally { G = prev; } }
// Furniture is built in its own local space (origin = min corner of its footprint, w×d) and placed with a
// transform: offset (ox, oz), lift oy (sitting on another piece) + quarter turns r (0..3, clockwise from above). Boxes stay axis-aligned under 90° turns.
// `tint` blends every colour (the green/red ghost while you move a piece).
let XF = null;
function withXF(xf, fn) { const prev = XF; XF = xf; try { fn(); } finally { XF = prev; } }
function xfPt(lx, lz) {
  const { w, d, r, ox, oz } = XF;
  const q = r === 1 ? [d - lz, lx] : r === 2 ? [w - lx, d - lz] : r === 3 ? [lz, w - lx] : [lx, lz];
  return [ox + q[0], oz + q[1]];
}
const FACE_TURN = { n: 'e', e: 's', s: 'w', w: 'n', t: 't', b: 'b' };
function xfColor(c) { return XF && XF.tint ? lerp3(c, XF.tint, 0.55) : c; }
function quad(p0, p1, p2, p3, n, c, g) {
  for (const p of [p0, p1, p2, p0, p2, p3]) { G.pos.push(p[0], p[1], p[2]); G.nor.push(n[0], n[1], n[2]); G.col.push(c[0], c[1], c[2]); G.glow.push(g); }
}
// axis-aligned box from min corner (x,y,z) and size (w,h,d). `skip` lists faces to omit.
function box(x, y, z, w, h, d, color, glow = 0, skip = '') {
  let c = typeof color === 'string' ? hex(color) : color;
  if (XF) {
    const [ax, az] = xfPt(x, z), [bx, bz] = xfPt(x + w, z + d);
    x = Math.min(ax, bx); z = Math.min(az, bz); w = Math.abs(bx - ax); d = Math.abs(bz - az); y += XF.oy || 0;
    for (let i = 0; i < XF.r; i++) skip = skip.split('').map(f => FACE_TURN[f] || f).join('');
    c = xfColor(c); if (XF.tint) glow = 0;
  }
  const X = x + w, Y = y + h, Z = z + d;
  // small per-face shade variation gives the low-poly look some life
  const sh = (k) => [c[0] * k, c[1] * k, c[2] * k];
  if (!skip.includes('t')) quad([x, Y, z], [x, Y, Z], [X, Y, Z], [X, Y, z], [0, 1, 0], sh(1), glow);
  if (!skip.includes('b')) quad([x, y, z], [X, y, z], [X, y, Z], [x, y, Z], [0, -1, 0], sh(0.9), glow);
  if (!skip.includes('n')) quad([X, y, z], [x, y, z], [x, Y, z], [X, Y, z], [0, 0, -1], sh(0.96), glow);
  if (!skip.includes('s')) quad([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z], [0, 0, 1], sh(0.96), glow);
  if (!skip.includes('w')) quad([x, y, Z], [x, Y, Z], [x, Y, z], [x, y, z], [-1, 0, 0], sh(0.93), glow);
  if (!skip.includes('e')) quad([X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z], [1, 0, 0], sh(0.93), glow);
}
// vertical n-sided prism (cans, lamp stems, bins)
function prism(cx, y, cz, r, h, color, sides = 8, glow = 0) {
  let c = typeof color === 'string' ? hex(color) : color;
  if (XF) { [cx, cz] = xfPt(cx, cz); y += XF.oy || 0; c = xfColor(c); if (XF.tint) glow = 0; }
  for (let i = 0; i < sides; i++) {
    const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2, am = (a0 + a1) / 2;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    quad([x0, y, z0], [x0, y + h, z0], [x1, y + h, z1], [x1, y, z1], [Math.cos(am), 0, Math.sin(am)], c, glow);
    G.pos.push(cx, y + h, cz, x1, y + h, z1, x0, y + h, z0);
    for (let k = 0; k < 3; k++) { G.nor.push(0, 1, 0); G.col.push(c[0], c[1], c[2]); G.glow.push(glow); }
  }
}

// =====================================================================
// The apartment (metres). x: 0..5 west→east, z: 0..4 north→south, y: 0..2.6
// =====================================================================
const ROOM = { w: 5, d: 4, h: 2.6 };
const solids = [];       // XZ rectangles the player can't walk through: [x0,z0,x1,z1]
const things = [];       // interactables: {id, prompt, box:[x0,y0,z0,x1,y1,z1]}
const solid = (x0, z0, x1, z1) => solids.push([x0, z0, x1, z1]);
const thing = (id, prompt, b) => things.push({ id, prompt, box: b });

// Bathroom behind the south wall: x 2.0..4.3, z 4.12..6.0
const BATH = { x0: 2.0, x1: 4.3, z0: 4.12, z1: 6.0 };
// Player settings (per browser, not per save)
// The game used to be called NEETLIFE: carry old saves, settings, templates etc. over to the new names (once; old keys are left alone)
try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('neetlife_')) { const nk = 'pogey' + k.slice(4); if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k)); } } } catch (e) {}
const SETTINGS_KEY = 'pogeylife_settings_v1';
const settings = Object.assign({ mirror: 'full', pcSize: 75, sens: 1 }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} };
const BATH_G = { pos: [], nor: [], col: [], glow: [] }, DOORFILL_G = { pos: [], nor: [], col: [], glow: [] };   // bathroom geometry lives in its own mesh so "partial" mirrors can reflect just it
// full-length mirror on the bathroom's west wall (glass faces +x)
const MIRROR = { x: 2.045, z0: 4.5, z1: 5.2, y0: 0.18, y1: 1.92, stand: { x: 3.0, z: 4.85, yaw: Math.PI / 2 } };
const MIRROR_G = { pos: [], nor: [], col: [], glow: [] };
function buildBathroom(T) {
  const { x0, x1, z0, z1 } = BATH, H = ROOM.h;
  // floor tiles + ceiling
  for (let i = 0; x0 + i * 0.3 < x1; i++) for (let j = 0; z0 + j * 0.3 < z1; j++) {
    const w = Math.min(0.3, x1 - (x0 + i * 0.3)), d = Math.min(0.3, z1 - (z0 + j * 0.3));
    box(x0 + i * 0.3, -0.1, z0 + j * 0.3, w, 0.1, d, (i + j) % 2 ? '#d8dde2' : '#eef1f3');
  }
  // everything starts at z0 (behind the living-room wall), never at ROOM.d: faces at z = ROOM.d
  // would sit on top of the living-room wall face and z-fight through it as pale stripes
  box(x0, H, z0, x1 - x0, 0.1, z1 - z0, '#eceae4');
  // walls (west, east, south) + tiled lower half
  box(x0 - T, 0, z0, T, H, z1 - z0 + T, '#e4ebee', 0, 'n');
  box(x1, 0, z0, T, H, z1 - z0 + T, '#e4ebee', 0, 'n');
  box(x0, 0, z1, x1 - x0, H, T, '#e4ebee');
  for (const [a, b] of [[x0, 2.6], [3.4, x1]]) box(a, 0, z0 + 0.001, b - a, H, 0.002, '#e4ebee', 0, 'nwetb'); // north wall, inside face
  box(2.6, 2.1, z0 + 0.001, 0.8, H - 2.1, 0.002, '#e4ebee', 0, 'nwetb');
  intoGeometry(DOORFILL_G, () => { box(2.62, 0, z0 - 0.06, 0.76, 2.08, 0.06, '#efe8da'); prism(2.7, 1.0, z0 + 0.0, 0.03, 0.03, '#bbbbbb', 6); });
  box(x0, 0, z0, 0.012, 1.15, z1 - z0, '#e6eef2'); box(x1 - 0.012, 0, z0, 0.012, 1.15, z1 - z0, '#e6eef2');
  box(x0, 0, z1 - 0.012, x1 - x0, 1.15, 0.012, '#e6eef2');
  box(x0, 0, z0, 0.6, 1.15, 0.012, '#e6eef2'); box(3.4, 0, z0, x1 - 3.4, 1.15, 0.012, '#e6eef2');
  for (const [a, b] of [[x0, 2.6], [3.4, x1]]) box(a, 1.15, z0, b - a, 0.03, 0.02, '#9fb4c0'); // tile trim (not across the doorway)
  box(x0, 1.15, z0, 0.02, 0.03, z1 - z0, '#9fb4c0'); box(x1 - 0.02, 1.15, z0, 0.02, 0.03, z1 - z0, '#9fb4c0'); box(x0, 1.15, z1 - 0.02, x1 - x0, 0.03, 0.02, '#9fb4c0');
  // full-length mirror: wooden frame; the glass is a separate mesh (MIRROR_G) so it can hold the reflection
  const M = MIRROR;
  box(x0, M.y0 - 0.05, M.z0 - 0.05, 0.04, M.y1 - M.y0 + 0.1, M.z1 - M.z0 + 0.1, '#6b4a33');
  intoGeometry(MIRROR_G, () => box(M.x - 0.004, M.y0, M.z0, 0.004, M.y1 - M.y0, M.z1 - M.z0, '#7d8790', 0, 'nwstb'));
  thing('mirror', 'Full-length mirror (change your look)', [x0, M.y0, M.z0, x0 + 0.25, M.y1, M.z1]);
  // shower (east side): tray, walls, curtain, rod, head
  box(3.45, 0, 5.1, x1 - 3.45, 0.1, z1 - 5.1, '#f4f6f7');
  box(3.47, 0.1, 5.12, x1 - 3.49, 0.005, z1 - 5.14, '#c9d3d9');
  box(3.45, 2.02, 5.08, x1 - 3.45, 0.025, 0.025, '#b8bec4');
  box(3.6, 0.32, 5.085, x1 - 3.62, 1.7, 0.012, '#4fb3a9');              // curtain, half drawn
  for (let k = 0; k < 6; k++) box(3.62 + k * 0.11, 0.32, 5.083, 0.02, 1.7, 0.016, '#45a196');
  box(x1 - 0.06, 1.85, 5.5, 0.06, 0.04, 0.04, '#b8bec4'); prism(x1 - 0.1, 1.82, 5.52, 0.05, 0.03, '#d0d5da', 8);
  solid(3.45, 5.1, x1, z1);
  thing('shower', 'Take a shower', [3.45, 0, 5.05, x1, 2.0, z1]);
  // toilet (south wall, west)
  box(2.17, 0, 5.55, 0.3, 0.38, 0.32, '#f6f6f4'); box(2.13, 0.38, 5.5, 0.38, 0.05, 0.4, '#ffffff');
  box(2.12, 0.38, 5.86, 0.4, 0.42, 0.14, '#f6f6f4'); box(2.16, 0.8, 5.85, 0.32, 0.03, 0.15, '#ececea');
  box(2.47, 0.72, 5.9, 0.04, 0.02, 0.02, '#c0c0c0');
  solid(2.1, 5.48, 2.55, z1);
  thing('toilet', 'Toilet', [2.1, 0, 5.45, 2.55, 0.85, z1]);
  // vanity + sink + medicine cabinet (south wall, middle)
  box(2.65, 0, 5.62, 0.66, 0.8, 0.38, '#7a5a42'); box(2.63, 0.8, 5.6, 0.7, 0.04, 0.4, '#e9e9e6');
  box(2.78, 0.82, 5.68, 0.4, 0.03, 0.26, '#b9c3c9'); prism(2.98, 0.84, 5.93, 0.015, 0.16, '#c0c0c0', 6);
  box(2.75, 1.25, z1 - 0.1, 0.46, 0.55, 0.1, '#f0efe9'); box(2.78, 1.28, z1 - 0.105, 0.4, 0.49, 0.006, '#a8b4bd');
  solid(2.6, 5.58, 3.35, z1);
  thing('sink', 'Sink', [2.6, 0, 5.55, 3.35, 1.0, z1]);
  // towel rack (east wall) + bath mat + ceiling light + light switch
  box(x1 - 0.05, 1.25, 4.35, 0.04, 0.02, 0.42, '#c0c0c0');
  box(x1 - 0.06, 0.7, 4.38, 0.03, 0.56, 0.36, '#e07a3a');
  box(3.5, 0.001, 4.8, 0.6, 0.01, 0.26, '#3a7fb0');
  prism(3.15, H - 0.05, 5.05, 0.18, 0.05, '#ddd', 10); prism(3.15, H - 0.1, 5.05, 0.15, 0.05, '#fff6dc', 10, GLOW.BATHCEIL);
  box(2.42, 1.15, z0, 0.08, 0.12, 0.02, '#f4f0e6');
  thing('bathswitch', () => S.bathLight === false ? 'Turn the bathroom light on' : 'Turn the bathroom light off', [2.36, 1.0, z0, 2.56, 1.4, z0 + 0.14]);
}
function buildRoom() {
  const T = 0.12; // wall thickness
  const wall = '#d9cfbd', wall2 = '#cfc4b0', trim = '#efe8da';
  // floor (planks) and ceiling
  for (let i = 0; i < 10; i++) box(0, -0.1, i * 0.4, ROOM.w, 0.1, 0.4, i % 2 ? '#8a6544' : '#94704d');
  box(0, ROOM.h, 0, ROOM.w, 0.1, ROOM.d, '#e9e4da');
  // north wall with a window hole (x 1.25..2.35, y 1.0..2.0)
  const wx0 = 1.25, wx1 = 2.35, wy0 = 1.0, wy1 = 2.0;
  box(0, 0, -T, wx0, ROOM.h, T, wall);
  box(wx1, 0, -T, ROOM.w - wx1, ROOM.h, T, wall);
  box(wx0, 0, -T, wx1 - wx0, wy0, T, wall);
  box(wx0, wy1, -T, wx1 - wx0, ROOM.h - wy1, T, wall);
  // window frame + sill + sky panel behind
  box(wx0 - 0.05, wy0 - 0.06, -0.02, wx1 - wx0 + 0.1, 0.06, 0.12, trim);
  box(wx0 - 0.05, wy1, -0.02, wx1 - wx0 + 0.1, 0.05, 0.06, trim);
  box(wx0 - 0.05, wy0, -0.02, 0.05, wy1 - wy0, 0.06, trim);
  box(wx1, wy0, -0.02, 0.05, wy1 - wy0, 0.06, trim);
  box((wx0 + wx1) / 2 - 0.02, wy0, -0.03, 0.04, wy1 - wy0, 0.04, trim);
  box(wx0, (wy0 + wy1) / 2 - 0.02, -0.03, wx1 - wx0, 0.04, 0.04, trim);
  box(wx0 - 2.5, wy0 - 1.5, -0.9, wx1 - wx0 + 5, wy1 - wy0 + 3, 0.05, '#ffffff', 1, 'nwetb'); // sky
  // city silhouette in front of the sky (dark boxes, lit by sky ambient only)
  const bld = [[-1.6, 0.9], [-1.3, 0.6], [-1.0, 0.75], [-0.65, 0.5], [-0.3, 0.55], [0.0, 0.8], [0.25, 0.45], [0.45, 0.95], [0.7, 0.6], [0.95, 0.75], [1.15, 0.5], [1.35, 0.85], [1.6, 0.7], [1.9, 1.0], [2.2, 0.55]];
  for (const [bx, bh] of bld) box(wx0 + bx, wy0 - 0.6, -0.8, 0.22, bh, 0.05, '#2a2a38', 0, 'nwetb');
  thing('window', 'Look outside', [wx0, wy0, -0.15, wx1, wy1, 0.1]);
  // other walls
  box(-T, 0, 0, T, ROOM.h, ROOM.d, wall2);
  box(ROOM.w, 0, 0, T, ROOM.h, ROOM.d, wall2);
  // south wall with front door (x 0.55..1.45) and bathroom door (x 2.6..3.4)
  box(0, 0, ROOM.d, 0.55, ROOM.h, T, wall);
  box(1.45, 0, ROOM.d, 1.15, ROOM.h, T, wall);
  box(3.4, 0, ROOM.d, ROOM.w - 3.4, ROOM.h, T, wall);
  box(0.55, 2.1, ROOM.d, 0.9, ROOM.h - 2.1, T, wall);
  box(2.6, 2.1, ROOM.d, 0.8, ROOM.h - 2.1, T, wall);
  // front door
  box(0.57, 0, ROOM.d - 0.03, 0.86, 2.08, 0.06, '#6b4a33');
  box(0.62, 0.9, ROOM.d - 0.05, 0.76, 0.02, 0.02, '#5a3d2a');
  prism(1.32, 1.0, ROOM.d - 0.07, 0.03, 0.03, '#d4b25a', 6);
  box(0.95, 1.55, ROOM.d - 0.05, 0.1, 0.03, 0.02, '#c9c9c9'); // peephole plate
  box(0.75, 0.4, ROOM.d - 0.06, 0.5, 0.12, 0.03, '#a8a8a8');   // mail slot
  thing('door', 'Front door', [0.55, 0, ROOM.d - 0.15, 1.45, 2.1, ROOM.d]);
  // bathroom door (drawn each frame: it swings open) + the bathroom itself
  thing('bath', () => S.bathDoor ? 'Close the bathroom door' : 'Open the bathroom door', [2.6, 0, ROOM.d - 0.15, 3.4, 2.1, ROOM.d + 0.15]);
  intoGeometry(BATH_G, () => buildBathroom(T));
  // baseboards
  box(0, 0, 0, ROOM.w, 0.08, 0.02, trim); box(0, 0, 0, 0.02, 0.08, ROOM.d, trim); box(ROOM.w - 0.02, 0, 0, 0.02, 0.08, ROOM.d, trim);

  // bed, nightstand + lamp, desk + PC, chair, rug, beanbag, clutter and the trash bin are movable furniture:
  // they live in furniture.js and are drawn into their own mesh (FURN_G).

  // ---- kitchenette (east wall) ----
  const kx = 4.38;
  box(kx, 0, 0.95, ROOM.w - kx, 0.86, 1.6, '#e7e2d6');             // cabinets
  box(kx - 0.02, 0.86, 0.93, ROOM.w - kx + 0.02, 0.04, 1.64, '#4a4a52'); // counter top
  for (let i = 0; i < 3; i++) box(kx - 0.01, 0.1, 1.0 + i * 0.52, 0.01, 0.7, 0.48, '#ddd6c6');
  // stove top (z 0.98..1.52) with 4 burners; the front-left burner is the working one (see cooking.js)
  box(kx + 0.04, 0.9, 0.98, 0.54, 0.014, 0.54, '#2b2b2b');
  for (const [a, b] of [[0.42, 1.12], [0.42, 1.38], [0.2, 1.38]]) prism(kx + a, 0.914, b, 0.075, 0.004, '#555', 10);
  // control panel + knob on the front face of the counter
  box(kx - 0.035, 0.7, 1.0, 0.02, 0.12, 0.5, '#d9d3c4');
  // cutting board (z 1.58..1.98)
  box(kx + 0.06, 0.9, 1.6, 0.4, 0.025, 0.36, '#c89a62');
  box(kx + 0.06, 0.905, 1.6, 0.4, 0.02, 0.01, '#b5884f');
  box(kx + 0.3, 0.925, 1.66, 0.02, 0.008, 0.2, '#cfd3d8');          // knife blade
  box(kx + 0.3, 0.925, 1.86, 0.025, 0.012, 0.09, '#2a2a2a');        // knife handle
  // sink (z 2.06..2.5)
  box(kx + 0.08, 0.9, 2.04, 0.44, 0.006, 0.48, '#b9c0c6');
  box(kx + 0.12, 0.902, 2.08, 0.36, 0.006, 0.4, '#7d868e');
  prism(kx + 0.55, 0.9, 2.28, 0.02, 0.25, '#bbb', 6);
  box(kx + 0.05, 1.4, 0.95, ROOM.w - kx - 0.05, 0.6, 1.6, '#e7e2d6'); // upper cabinets
  solid(kx - 0.03, 0.93, ROOM.w, 2.57);
  thing('pan', 'Pan', [kx - 0.02, 0.88, 0.98, kx + 0.36, 1.05, 1.32]);
  thing('knob', 'Stove knob', [kx - 0.07, 0.66, 1.0, kx + 0.0, 0.86, 1.5]);
  thing('board', 'Cutting board', [kx - 0.02, 0.88, 1.56, ROOM.w, 1.0, 2.0]);
  // fridge
  box(kx - 0.02, 0, 2.7, ROOM.w - kx + 0.02, 1.8, 0.7, '#f1f1f1');
  box(kx - 0.04, 1.2, 2.72, 0.02, 0.01, 0.66, '#cfcfcf');
  box(kx - 0.05, 0.75, 2.75, 0.03, 0.35, 0.04, '#aaaaaa');
  box(kx - 0.05, 1.3, 2.75, 0.03, 0.3, 0.04, '#aaaaaa');
  solid(kx - 0.05, 2.7, ROOM.w, 3.4);
  thing('fridge', 'Fridge', [kx - 0.06, 0, 2.7, ROOM.w, 1.8, 3.4]);

  // ---- living bits ----
  // (the poster above the bed is wall art now: furniture.js)
  // ceiling light
  prism(2.5, ROOM.h - 0.05, 2.0, 0.3, 0.05, '#ddd', 10);
  prism(2.5, ROOM.h - 0.11, 2.0, 0.25, 0.06, '#fff6dc', 10, 3);
  // light switch
  box(1.55, 1.15, ROOM.d - 0.02, 0.08, 0.12, 0.02, '#f4f0e6');
  thing('switch', () => S.lightOn ? 'Turn the lights off' : 'Turn the lights on', [1.47, 1.0, ROOM.d - 0.14, 1.71, 1.4, ROOM.d]);
}

// =====================================================================
// WebGL renderer
// =====================================================================
const canvas = $('gl');
const gl = canvas.getContext('webgl', { antialias: true, stencil: true }) || canvas.getContext('experimental-webgl', { stencil: true });
let prog, attr = {}, uni = {}, vertCount = 0, burnerGlow = [0.2, 0.2, 0.2];
function drawCoreDynamic() {
  if (settings.mirror === 'simple') {
    const M = MIRROR, x = M.x + 0.001;
    box(x, M.y0, M.z0, 0.002, M.y1 - M.y0, M.z1 - M.z0, '#a9bcc8', 0, 'nwstb');            // brighter glass
    for (const [z0, w, y0, len] of [[M.z0 + 0.12, 0.05, 1.05, 0.75], [M.z0 + 0.26, 0.022, 0.95, 0.55], [M.z0 + 0.46, 0.035, 0.3, 0.6]])
      for (let k = 0; k < 10; k++) box(x + 0.001, y0 + k * len / 10, z0 + k * 0.012, 0.002, len / 10, w, '#eef5f9', 0, 'nwstb'); // diagonal shine
  }
  box(1.575, S.lightOn ? 1.215 : 1.175, ROOM.d - 0.035, 0.03, 0.03, 0.02, '#e2ddd0'); // light switch toggle
  box(2.445, S.bathLight === false ? 1.175 : 1.215, BATH.z0 + 0.02, 0.03, 0.03, 0.02, '#e2ddd0'); // bathroom switch
  // bathroom door: closed in the doorway, or swung into the bathroom on its hinge at x 3.38
  if (S.bathDoor) { box(3.33, 0, BATH.z0, 0.05, 2.08, 0.76, '#efe8da'); prism(3.31, 1.0, BATH.z0 + 0.68, 0.03, 0.03, '#bbbbbb', 6); }
  else { box(2.62, 0, ROOM.d - 0.03, 0.76, 2.08, 0.06, '#efe8da'); prism(2.7, 1.0, ROOM.d - 0.07, 0.03, 0.03, '#bbbbbb', 6); prism(2.7, 1.0, ROOM.d + 0.07, 0.03, 0.03, '#bbbbbb', 6); }
}
// Environment knobs (weather.js writes these every frame). glow[] holds colours for glow groups 6..11.
// lampPos / monPos follow the nightstand and desk when they're moved (null = not in the room); extraLight = a floor lamp
const env = { cloud: 0, rain: 0, flash: 0, power: 1, glow: {}, selfVisible: false, lampPos: [1.29, 0.95, 0.25], monPos: [3.45, 1.15, 0.45], extraLight: null };
// Glow groups: 1 sky, 2 monitor, 3 ceiling bulb, 4 lamp, 5 burner, 6 sun/moon, 7 stars, 8 city lights, 9 clouds, 10 rain, 11 lightning
const GLOW = { SKY: 1, MONITOR: 2, CEIL: 3, LAMP: 4, BURNER: 5, SUN: 6, STARS: 7, CITY: 8, CLOUD: 9, RAIN: 10, BOLT: 11, BATHCEIL: 12, TV: 13, LAVA: 14, TANK: 15, FLOORLAMP: 16, ARCADE: 17, MINER: 18, ASIC: 19 };
// module hooks (cooking.js etc. register into these)
const hooks = { interact: [], update: [], draw: [], drawSelf: [], key: [], hud: [], fresh: [], speed: [], camera: [], newLife: [], beforeSave: [] };
// the active camera: first person by default; modules (character.js) may return {x,y,z,yaw,pitch,reach}
function getCamera() { let c = null; for (const fn of hooks.camera) c = fn() || c; return c; }
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aGlow;
uniform mat4 uVP;
varying vec3 vPos; varying vec3 vNor; varying vec3 vCol; varying float vGlow;
void main() { vPos = aPos; vNor = aNor; vCol = aCol; vGlow = aGlow; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FS = `
precision mediump float;
varying vec3 vPos; varying vec3 vNor; varying vec3 vCol; varying float vGlow;
uniform vec3 uAmbSky; uniform vec3 uAmbGround;
uniform vec3 uLP[5]; uniform vec3 uLC[5];
uniform vec3 uGlow[24];
uniform vec4 uClip; uniform float uTint;
uniform vec3 uWinPos; uniform vec3 uWinCol;
uniform vec3 uSunDir; uniform vec3 uSunCol;
// window opening on the north wall (z = 0): x 1.25..2.35, y 1.0..2.0, mullions at the centre lines
const vec4 WIN = vec4(1.25, 2.35, 1.0, 2.0);
void main() {
  if (dot(vPos, uClip.xyz) + uClip.w < 0.0) discard;
  if (vGlow > 0.5) {
    vec3 g = vec3(1.0);
    for (int i = 1; i < 24; i++) { if (abs(vGlow - float(i)) < 0.5) g = uGlow[i]; }
    gl_FragColor = vec4(g * mix(vec3(1.0), vCol, 0.25) * uTint, 1.0); return;
  }
  vec3 n = normalize(vNor);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  // fake ambient occlusion: darker near floor and in corners
  float ao = 0.72 + 0.28 * smoothstep(0.0, 0.9, vPos.y);
  // the bathroom (z > 4.08) has no window: dim ambient, and lights mostly stay in their own room
  float inBath = step(4.08, vPos.z);
  vec3 lit = amb * ao * mix(1.0, 0.55, inBath);
  for (int i = 0; i < 5; i++) {
    vec3 L = uLP[i] - vPos; float d = length(L); L /= d;
    float wrap = max(dot(n, L) * 0.8 + 0.2, 0.0);
    float room = i == 3 ? mix(0.06, 1.0, inBath) : mix(1.0, 0.1, inBath);
    lit += uLC[i] * wrap * room / (1.0 + 0.9 * d * d);
  }
  // window light: a soft area light from the north wall
  vec3 W = uWinPos - vPos; float wd = length(W); W /= wd;
  lit += uWinCol * max(dot(n, W), 0.0) * (1.0 - inBath) / (1.0 + 0.6 * wd * wd);
  // direct sun: trace from this point toward the sun; lit if the ray leaves through the window glass
  if (uSunDir.z < -0.01 && vPos.z > 0.001 && vPos.z < 4.0) {
    float t = -vPos.z / uSunDir.z;
    vec3 q = vPos + uSunDir * t;
    if (q.x > WIN.x && q.x < WIN.y && q.y > WIN.z && q.y < WIN.w) {
      float mull = step(0.022, abs(q.x - 1.8)) * step(0.022, abs(q.y - 1.5));
      float edge = smoothstep(0.0, 0.04, min(min(q.x - WIN.x, WIN.y - q.x), min(q.y - WIN.z, WIN.w - q.y)));
      lit += uSunCol * max(dot(n, uSunDir), 0.0) * mull * edge;
    }
  }
  vec3 c = vCol * lit;
  c = c / (1.0 + c * 0.35);                 // soft tone map
  gl_FragColor = vec4(pow(c, vec3(0.92)) * uTint, 1.0);
}`;
function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const ATTRS = [['aPos', 3], ['aNor', 3], ['aCol', 3], ['aGlow', 1]];
const KEYS = { aPos: 'pos', aNor: 'nor', aCol: 'col', aGlow: 'glow' };
let staticBufs, dynBufs, selfBufs, mirrorBufs, bathBufs, doorFillBufs, furnBufs = null;
let FURN_G = { pos: [], nor: [], col: [], glow: [] }, furnDirty = true;
function setFurniture(geo) { FURN_G = geo; furnDirty = true; }
function makeBufs(geo, usage) {
  const o = {};
  for (const [name] of ATTRS) { o[name] = gl.createBuffer(); if (geo) { gl.bindBuffer(gl.ARRAY_BUFFER, o[name]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo[KEYS[name]]), usage); } }
  return o;
}
function bindBufs(bufs) {
  for (const [name] of ATTRS) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.vertexAttribPointer(attr[name].loc, attr[name].size, gl.FLOAT, false, 0, 0); }
}
function initGL() {
  prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const [name, size] of ATTRS) { attr[name] = { loc: gl.getAttribLocation(prog, name), size }; gl.enableVertexAttribArray(attr[name].loc); }
  staticBufs = makeBufs(STATIC_G, gl.STATIC_DRAW);
  dynBufs = makeBufs(null, gl.DYNAMIC_DRAW);
  selfBufs = makeBufs(null, gl.DYNAMIC_DRAW);
  mirrorBufs = makeBufs(MIRROR_G, gl.STATIC_DRAW);
  bathBufs = makeBufs(BATH_G, gl.STATIC_DRAW);
  doorFillBufs = makeBufs(DOORFILL_G, gl.STATIC_DRAW);
  vertCount = STATIC_G.pos.length / 3;
  for (const n of ['uVP', 'uAmbSky', 'uAmbGround', 'uGlow', 'uWinPos', 'uWinCol', 'uSunDir', 'uSunCol', 'uClip', 'uTint']) uni[n] = gl.getUniformLocation(prog, n);
  uni.uLP = gl.getUniformLocation(prog, 'uLP'); uni.uLC = gl.getUniformLocation(prog, 'uLC');
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);

// =====================================================================
// Lighting by time of day
// =====================================================================
// sky colours keyed by hour
const SKY = [[0, '#0b1026'], [5, '#141a3a'], [6.5, '#e8956a'], [8, '#9fc7ef'], [12, '#8ec1f2'], [17, '#a9c6e8'], [18.7, '#f08a5d'], [20, '#2a2350'], [21.5, '#0f1430'], [24, '#0b1026']];
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    if (h >= h0 && h <= h1) return lerp3(hex(c0), hex(c1), (h - h0) / (h1 - h0));
  }
  return hex(SKY[0][1]);
}
// sun direction (pointing from the room toward the sun) and colour by hour. Morning sun comes from the east (+x).
function sunState(h) {
  const up = Math.sin(Math.PI * (h - 6) / 13);           // 0 at 6:00 and 19:00
  if (up <= 0) return { dir: [0, 1, 0], col: [0, 0, 0], k: 0 };
  const dir = [(12.5 - h) * 0.2, 0.25 + up * 1.0, -1];
  const l = Math.hypot(dir[0], dir[1], dir[2]); dir[0] /= l; dir[1] /= l; dir[2] /= l;
  const warm = 1 - Math.min(1, up * 1.6);                 // golden near sunrise/sunset
  return { dir, col: [1.0, 0.92 - 0.2 * warm, 0.78 - 0.38 * warm], k: Math.min(1, up * 3) * 1.5 };
}
function daylight(h) { // 0 at night, 1 at noon
  if (h < 5.5 || h > 20) return 0;
  if (h < 8) return (h - 5.5) / 2.5;
  if (h > 17.5) return 1 - (h - 17.5) / 2.5;
  return 1;
}

const lastView = { vp: null, eye: null };
function render() {
  const h = (S.t / 60) % 24, day = daylight(h), sky = skyAt(h);
  gl.clearColor(0.02, 0.02, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  const bob = Math.sin(P.bob) * 0.025;
  const cam = titleMode ? titleCam() : getCamera();
  const eye = cam || { x: P.x, y: P.y + bob, z: P.z, yaw: P.yaw, pitch: P.pitch };
  const vp = M4.mul(M4.persp(1.2, aspect, 0.03, 50), M4.view(eye.x, eye.y, eye.z, eye.yaw, eye.pitch));
  lastView.vp = vp; lastView.eye = eye; // tv.js pins the YouTube player onto the TV screen with this
  // weather: clouds grey out and darken the sky; lightning flashes everything
  const cl = env.cloud, fl = env.flash;
  const lum = sky[0] * 0.3 + sky[1] * 0.55 + sky[2] * 0.15;
  let skyC = lerp3(sky, [lum * 0.85, lum * 0.88, lum * 0.95], cl * 0.85).map(v => v * (1 - 0.35 * cl * cl));
  skyC = lerp3(skyC, [0.9, 0.92, 1.0], fl);
  env.skyColor = skyC;
  const dayK = day * (1 - 0.45 * cl);
  const ambK = 0.16 + 0.32 * dayK;
  gl.uniform3fv(uni.uAmbSky, lerp3([0.12, 0.12, 0.2], [0.62, 0.62, 0.66], dayK).map(v => v * (0.6 + ambK) + fl * 0.45));
  gl.uniform3fv(uni.uAmbGround, lerp3([0.06, 0.05, 0.07], [0.36, 0.3, 0.26], dayK).map(v => v + fl * 0.2));
  // lights: ceiling + bedside lamp (switchable; storms can flicker the power), monitor glow
  const ceilOn = S.lightOn ? env.power : 0, lampOn = S.lampOn === false || !env.lampPos ? 0 : env.power;
  const mon = pcOpen ? [0.45, 0.6, 1.0] : [0.25, 0.35, 0.7];
  const bathOn = S.bathLight === false ? 0 : env.power;
  const xl = env.extraLight;
  gl.uniform3fv(uni.uLP, [2.5, 2.35, 2.0, ...(env.lampPos || [0, -5, 0]), ...(env.monPos || [0, -5, 0]), 3.15, 2.4, 5.05, ...(xl ? xl.pos : [0, -5, 0])]);
  gl.uniform3fv(uni.uLC, [
    1.25 * ceilOn, 1.12 * ceilOn, 0.92 * ceilOn,
    0.55 * lampOn, 0.42 * lampOn, 0.25 * lampOn,
    ...(env.monPos ? [mon[0] * 0.5 * env.power, mon[1] * 0.5 * env.power, mon[2] * 0.5 * env.power] : [0, 0, 0]),
    1.9 * bathOn, 1.85 * bathOn, 1.75 * bathOn,
    ...(xl ? xl.col.map(v => v * env.power) : [0, 0, 0]),
  ]);
  gl.uniform3fv(uni.uWinPos, [1.8, 1.5, -0.4]);
  gl.uniform3fv(uni.uWinCol, skyC.map((v, i) => v * (0.25 + 1.4 * dayK) + fl * 1.6));
  // the sun: comes in through the window as a patch of light when it's up and not hidden by cloud
  const sun = sunState(h);
  gl.uniform3fv(uni.uSunDir, sun.dir);
  gl.uniform3fv(uni.uSunCol, sun.col.map(v => v * sun.k * Math.pow(1 - cl, 2.2)));
  const glow = new Array(72).fill(0);
  const setG = (i, c) => { glow[i * 3] = c[0]; glow[i * 3 + 1] = c[1]; glow[i * 3 + 2] = c[2]; };
  setG(GLOW.SKY, skyC.map(v => Math.min(1, v * 1.15)));
  setG(GLOW.MONITOR, (internetOn() ? [0.42, 0.62, 1.0] : [0.55, 0.2, 0.2]).map(v => v * (0.2 + 0.8 * env.power)));
  setG(GLOW.CEIL, ceilOn ? [1.0, 0.96, 0.85] : [0.45, 0.43, 0.4].map(v => v * (0.4 + dayK)));
  setG(GLOW.LAMP, lampOn ? [1.0, 0.82, 0.55] : [0.5, 0.42, 0.32].map(v => v * (0.4 + dayK)));
  setG(GLOW.BURNER, burnerGlow);
  setG(GLOW.BATHCEIL, bathOn ? [1.0, 0.98, 0.92] : [0.4, 0.4, 0.38]);
  for (const [k, c] of Object.entries(env.glow)) setG(+k, c);
  gl.uniform3fv(uni.uGlow, glow);
  // geometry rebuilt every frame: the world's moving bits (D) and the player model (SELF)
  const D = { pos: [], nor: [], col: [], glow: [] }, SELF = { pos: [], nor: [], col: [], glow: [] };
  intoGeometry(D, () => { drawCoreDynamic(); for (const fn of hooks.draw) fn(); });
  intoGeometry(SELF, () => { for (const fn of hooks.drawSelf) fn(); });
  const upload = (bufs, geo) => { for (const [name] of ATTRS) { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo[KEYS[name]]), gl.DYNAMIC_DRAW); } };
  if (D.pos.length) upload(dynBufs, D);
  if (furnDirty) { furnBufs = furnBufs || makeBufs(null, gl.STATIC_DRAW); upload(furnBufs, FURN_G); furnDirty = false; }
  if (SELF.pos.length) upload(selfBufs, SELF);
  // partial = only the bathroom and yourself (the cheap reflection)
  const drawWorld = (withSelf, partial) => {
    if (!partial) { bindBufs(staticBufs); gl.drawArrays(gl.TRIANGLES, 0, vertCount); }
    if (!partial && FURN_G.pos.length) { bindBufs(furnBufs); gl.drawArrays(gl.TRIANGLES, 0, FURN_G.pos.length / 3); }
    bindBufs(bathBufs); gl.drawArrays(gl.TRIANGLES, 0, BATH_G.pos.length / 3);
    if (!partial && D.pos.length) { bindBufs(dynBufs); gl.drawArrays(gl.TRIANGLES, 0, D.pos.length / 3); }
    if (withSelf && SELF.pos.length) { bindBufs(selfBufs); gl.drawArrays(gl.TRIANGLES, 0, SELF.pos.length / 3); }
  };
  // 1) the normal view (a camera may carry a clip plane, e.g. the "simple" mirror view looking out of the glass)
  gl.uniformMatrix4fv(uni.uVP, false, vp);
  gl.uniform4fv(uni.uClip, eye.clip || [0, 0, 0, 1]); gl.uniform1f(uni.uTint, 1);
  drawWorld(env.selfVisible, !!eye.bathOnly);
  if (eye.bathOnly) { bindBufs(doorFillBufs); gl.drawArrays(gl.TRIANGLES, 0, DOORFILL_G.pos.length / 3); }
  if (!eye.clip) { bindBufs(mirrorBufs); gl.drawArrays(gl.TRIANGLES, 0, MIRROR_G.pos.length / 3); }
  // 2) the mirror: mark the visible glass in the stencil, reset its depth, then draw the scene reflected across x = MIRROR.x
  const seesMirror = settings.mirror !== 'simple' && !eye.clip && eye.x > MIRROR.x + 0.05 && (eye.z > BATH.z0 || (S.bathDoor && eye.z > 2.2));
  if (seesMirror) {
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
    gl.drawArrays(gl.TRIANGLES, 0, MIRROR_G.pos.length / 3);
    gl.stencilFunc(gl.EQUAL, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.depthMask(true); gl.depthFunc(gl.ALWAYS); gl.depthRange(1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, MIRROR_G.pos.length / 3);
    gl.depthRange(0, 1); gl.depthFunc(gl.LESS); gl.colorMask(true, true, true, true);
    const R = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2 * MIRROR.x, 0, 0, 1];
    gl.uniformMatrix4fv(uni.uVP, false, M4.mul(vp, R));
    gl.uniform4fv(uni.uClip, [1, 0, 0, -(MIRROR.x + 0.006)]); gl.uniform1f(uni.uTint, 0.9);
    gl.frontFace(gl.CW);
    drawWorld(true, settings.mirror === 'partial');
    gl.frontFace(gl.CCW);
    gl.disable(gl.STENCIL_TEST);
  }
}

// =====================================================================
// Player, input, collision, picking
// =====================================================================
const P = { x: 3.1, y: 1.6, z: 2.2, yaw: 0.25, pitch: -0.08, bob: 0, r: 0.24 };
const keys = {};
let locked = false, pcOpen = false, paused = true, started = false, sleeping = false;
// "active" = the player is in the room and can move/look, with or without pointer lock.
// If the browser refuses pointer lock (embedded previews, some settings), we fall back to drag-to-look.
let lockFailed = false, dragging = false;
let modalOpen = false;
const active = () => started && !paused && !pcOpen && !modalOpen && !sleeping && S && !S.evicted;

// is a point inside the walkable space? (m = margin from walls)
function walkable(x, z, m) {
  if (x > m && x < ROOM.w - m && z > m && z < ROOM.d - m) return true;
  if (S && S.bathDoor && x > 2.62 + m && x < 3.38 - m && z > 3.5 && z < 4.6) return true;
  return x > BATH.x0 + m && x < BATH.x1 - m && z > BATH.z0 + m && z < BATH.z1 - m;
}
function collide(nx, nz) {
  const r = P.r;
  if (!walkable(nx, nz, r) && walkable(P.x, P.z, r)) return null;
  const inside = (x, z, [x0, z0, x1, z1]) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r;
  for (const s of solids) {
    // only block if the step enters furniture; if we're already overlapping (bad spawn/old save), let us walk out
    if (inside(nx, nz, s) && !inside(P.x, P.z, s)) return null;
  }
  if (S && S.bathDoor && nx > 3.33 - r && nx < 3.38 + r && nz > BATH.z0 && nz < BATH.z0 + 0.76 + r && !(P.x > 3.33 - r && P.x < 3.38 + r && P.z > BATH.z0 && P.z < BATH.z0 + 0.76 + r)) return null; // the open door
  return [nx, nz];
}
function movePlayer(dt) {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (!f && !s) return;
  let speedK = 1; for (const fn of hooks.speed) speedK *= fn();
  const len = Math.hypot(f, s), sp = 2.1 * speedK * dt / len;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const dx = (fx * f + rx * s) * sp, dz = (fz * f + rz * s) * sp;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.01)); // sub-steps so we stop flush against furniture
  for (let i = 0; i < n; i++) {
    let c = collide(P.x + dx / n, P.z); if (c) P.x = c[0];
    c = collide(P.x, P.z + dz / n); if (c) P.z = c[1];
  }
  P.bob += dt * 9;
}
function pick() {
  const cam = getCamera() || { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, reach: 0 };
  const cp = Math.cos(cam.pitch);
  const d = [-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
  const o = [cam.x, cam.y, cam.z];
  let best = null, bt = 2.3 + (cam.reach || 0);
  for (const th of things) {
    let t0 = 0, t1 = bt, ok = true;
    for (let a = 0; a < 3; a++) {
      const lo = th.box[a], hi = th.box[a + 3];
      if (Math.abs(d[a]) < 1e-6) { if (o[a] < lo || o[a] > hi) { ok = false; break; } continue; }
      let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < bt) {
      const crossZ = 4.06, ez = o[2] + d[2] * t0;
      if ((o[2] - crossZ) * (ez - crossZ) < 0 && th.id !== 'bath') {   // the ray passes the wall between the rooms
        const tc = (crossZ - o[2]) / d[2], cx = o[0] + d[0] * tc;
        if (!S.bathDoor || cx < 2.62 || cx > 3.38) continue;
      }
      if (cam.reach) { const hx = o[0] + d[0] * t0 - P.x, hz = o[2] + d[2] * t0 - P.z; if (Math.hypot(hx, hz) > 2.0) continue; }
      bt = t0; best = th;
    }
  }
  return best;
}

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && active() && hovered) interact(hovered.id);
  if (active()) for (const fn of hooks.key) fn(e.code);
  if (e.code === 'Escape') { if (handleEsc()) e.preventDefault(); }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && active()) e.preventDefault();
});
// ESC: menu closed -> open it (walking or on the PC). Menu open -> close it and go back to what you were doing.
// It never logs you off the PC; that's the "Leave PC" button on the PC itself.
let lockLostAt = 0;
function menuUp() { return ['scPause', 'scSettings'].some(id => { const el = $(id); return el && el.classList.contains('show'); }); }
function handleEsc() {
  if (!started || !S || S.evicted || sleeping || modalOpen) return false;
  if (locked) return false;                                  // the browser drops pointer lock itself; pointerlockchange opens the menu
  if (performance.now() - lockLostAt < 250) return false;    // same ESC press that just released the mouse (Firefox sends both)
  if (menuUp()) resumeGame(); else pauseGame();
  return true;
}
function pauseGame() {
  paused = true; showScreen('scPause'); renderPauseCode(); save(); cloud.flush();
  plinkoMsg('pogeyPause');
  if (locked) document.exitPointerLock && document.exitPointerLock();
}
function resumeGame() {
  plinkoMsg('pogeyResume');
  if (pcOpen) { paused = false; showScreen(null); return; } // back to the PC screen, mouse stays free
  lockPointer(true);
}
function plinkoMsg(type) { try { if (atTable) $('plinkoFrame').contentWindow.postMessage({ src: 'pogeylife', type }, '*'); } catch (e) {} }
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => { if (!locked && active()) { dragging = true; dragMoved = 0; } });
window.addEventListener('mouseup', () => { dragging = false; });
let dragMoved = 0;
document.addEventListener('mousemove', e => {
  if (!locked && !(dragging && active())) return;
  if (!locked) dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
  let k = locked ? 0.0022 : 0.005;
  k *= Math.max(0.1, Math.min(4, +settings.sens || 1)); // Settings > Mouse sensitivity
  P.yaw -= e.movementX * k; P.pitch -= e.movementY * k;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
});
canvas.addEventListener('click', () => {
  if (!started || pcOpen || modalOpen || sleeping) return;
  if (!locked && !lockFailed) { lockPointer(); return; }
  if (!locked && dragMoved > 6) return; // that was a look-drag, not a click
  if (hovered && active()) interact(hovered.id);
});
let softUntil = 0, softToasted = false;
function lockPointer(soft) {
  paused = false; showScreen(null);
  if (lockFailed || !canvas.requestPointerLock) { useFallback(); return; }
  softUntil = soft ? performance.now() + 1500 : 0; softToasted = false;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(lockError); } catch (e) { lockError(); }
}
// A "soft" lock (resuming from the menu) can be refused for ~1s after ESC released the mouse.
// Then we just carry on unlocked and the next click on the game captures the mouse again.
function lockError() {
  if (performance.now() < softUntil) { if (!softToasted && !locked) toast('Click to look around.', '', 2500); softToasted = true; return; }
  useFallback();
}
function useFallback() {
  if (!lockFailed) toast('Mouse capture isn\'t available here, so hold the mouse button and drag to look around. WASD still moves.', '', 7000);
  lockFailed = true; paused = false; showScreen(null);
  $('crosshair').style.display = '';
}
document.addEventListener('pointerlockerror', lockError);
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === canvas;
  if (locked) { softUntil = 0; paused = false; showScreen(null); }
  else if (was && started && !pcOpen && !modalOpen && !sleeping && !S.evicted && !lockFailed && !menuUp()) { lockLostAt = performance.now(); pauseGame(); }
  $('crosshair').style.display = locked || lockFailed ? '' : 'none';
});
document.addEventListener('visibilitychange', () => { if (document.hidden && started && !pcOpen) { paused = true; } });

// =====================================================================
// GAME STATE — exposed later in this file
// =====================================================================
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAME_MIN_PER_SEC = 2;          // 1 real second = 2 in-game minutes (a day is ~12 real minutes)
const START_MONEY = 300;
const BILL_DEFS = {
  rent:     { name: 'Rent',     amount: 250, every: 7, firstDue: 7, late: 25, grace: 2 },
  internet: { name: 'Internet', amount: 40,  every: 7, firstDue: 4, late: 10, grace: 0 },
  power:    { name: 'Electricity', amount: 0, every: 7, firstDue: 6, late: 15, grace: 3, metered: true },
};
// Electricity is metered: a connection fee plus every kWh used since the last bill. The bill is worked out on its due
// day; pay it within `grace` days of that or the power gets cut off until you do. Mining rigs (mining.js) add to the meter.
const POWER = { rate: 0.14, base: 15, house: 0.45 }; // $/kWh, $/bill, average household draw in kW (fridge, lights, PC...)
function ensurePower(S) {
  if (!S.power) S.power = { kwh: 0, cut: false, last: 0 };
  if (!S.bills.some(b => b.id === 'power')) S.bills.push({ id: 'power', due: dayOf(S.t) + BILL_DEFS.power.firstDue, paid: false, late: false });
}
hooks.fresh.unshift(ensurePower);
const powerEstimate = () => Math.round(POWER.base + (S.power ? S.power.kwh : 0) * POWER.rate);
const BETS = [10, 25, 50, 100, 250, 500];
// cash-out multiplier after clearing N floors (index = floors cleared). Beyond the table: ×1.25 per floor.
const CASH_TABLE = [0, 1.1, 1.3, 1.6, 2, 2.8, 3.3, 4, 5, 6.2, 8];
const SAVE_KEY = 'pogeylife_save_v1';

let S = null; // game state
function freshState() {
  return {
    t: 8 * 60,             // minutes since Day 1 00:00
    money: START_MONEY,
    lightOn: true, lampOn: true, bathLight: true, bathDoor: false,
    bills: Object.entries(BILL_DEFS).map(([id, d]) => ({ id, due: d.firstDue, paid: false, late: false })),
    tx: [{ t: 8 * 60, desc: 'Opening balance', amt: START_MONEY }],
    stats: { runs: 0, wins: 0, busts: 0, best: 0, wagered: 0, won: 0 },
    pos: null, evicted: false, lastDay: 1, code: newCode(), power: { kwh: 0, cut: false, last: 0 },
  };
}
// ---- player codes: every character has one (e.g. K7QM-3XRP-9FHT). Saves are kept per code in this browser and,
// when online saving is set up, in the Supabase table pogey_saves, so the code loads the character on any computer.
// Anyone with the code can load (and keep playing) that character: it's the key to the save.
const SLOT_PREFIX = 'pogeylife_save_v1:';   // one save per code
const ACTIVE_KEY = 'pogeylife_active_v1';   // the code Continue loads
const CODE_ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L
function newCode() { const r = new Uint32Array(12); crypto.getRandomValues(r); let c = ''; for (let i = 0; i < 12; i++) c += (i && i % 4 === 0 ? '-' : '') + CODE_ABC[r[i] % CODE_ABC.length]; return c; }
function normCode(raw) { const x = String(raw || '').toUpperCase().replace(/[\s-]/g, ''); if (x.length !== 12 || [...x].some(ch => !CODE_ABC.includes(ch))) return null; return x.slice(0, 4) + '-' + x.slice(4, 8) + '-' + x.slice(8); }
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function migrateLegacy() { // the single save from before player codes becomes a coded one
  const v = lsGet(SAVE_KEY); if (!v) return;
  try { const s = JSON.parse(v); if (!s.code) s.code = newCode(); lsSet(SLOT_PREFIX + s.code, JSON.stringify(s)); if (!lsGet(ACTIVE_KEY)) lsSet(ACTIVE_KEY, s.code); localStorage.removeItem(SAVE_KEY); } catch (e) {}
}
function save() {
  if (!S || !started) return;
  if (!S.code) S.code = newCode();
  S.pos = { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch }; S.savedAt = Date.now();
  for (const fn of hooks.beforeSave) fn(S);
  const json = JSON.stringify(S);
  lsSet(SLOT_PREFIX + S.code, json); lsSet(ACTIVE_KEY, S.code);
  cloud.queue(S.code, json);
}
function load(code) { migrateLegacy(); code = code || lsGet(ACTIVE_KEY); if (!code) return null; try { const v = lsGet(SLOT_PREFIX + code); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function localProfiles() { // characters saved in this browser, most recent first
  migrateLegacy();
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !k.startsWith(SLOT_PREFIX)) continue;
    try { const s = JSON.parse(localStorage.getItem(k)); out.push({ code: k.slice(SLOT_PREFIX.length), day: dayOf(s.t), money: s.money, evicted: !!s.evicted, at: s.savedAt || 0 }); } catch (e) {} } } catch (e) {}
  return out.sort((a, b) => b.at - a.at);
}
// ---- online copies (same Supabase project as the Plinko leaderboard). See NEETLIFE/online-saves.sql.
const CLOUD_URL = 'https://hkfyyhnujjuktqovnsby.supabase.co', CLOUD_KEY = 'sb_publishable_f2J4z9X9m_ex2G_vIuHqQw_rE9MKl3r';
const cloud = {
  ready: null,      // null = don't know yet, true = works, false = the online-save table isn't set up
  state: 'idle',    // 'saved' | 'offline' | 'local' | 'idle'
  pending: null, lastUp: 0, busy: false,
  headers() { const h = { apikey: CLOUD_KEY, 'Content-Type': 'application/json' }; if (CLOUD_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + CLOUD_KEY; return h; },
  async rpc(fn, body, keepalive) {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(`${CLOUD_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), keepalive: !!keepalive, signal: keepalive ? undefined : ac.signal });
      if (r.status === 404 || r.status === 400 && /function|schema cache/i.test(await r.clone().text())) { this.ready = false; this.state = 'local'; throw new Error('not set up'); }
      if (!r.ok) throw new Error('http ' + r.status);
      this.ready = true; const t = await r.text(); return t ? JSON.parse(t) : null;
    } finally { clearTimeout(to); }
  },
  queue(code, json) { if (!CLOUD_URL) return; this.pending = { code, json }; if (performance.now() - this.lastUp > 20000) this.flush(); },
  flush(keepalive) {
    if (!this.pending || this.busy || this.ready === false) return;
    const p = this.pending; this.pending = null; this.busy = true;
    this.rpc('pogey_save', { p_code: p.code, p_data: JSON.parse(p.json) }, keepalive)
      .then(() => { this.state = 'saved'; this.lastUp = performance.now(); })
      .catch(() => { if (!this.pending) this.pending = p; if (this.ready !== false) this.state = 'offline'; })
      .finally(() => { this.busy = false; if (paused) renderPauseCode(); });
  },
  async load(code) { if (!CLOUD_URL || this.ready === false) return undefined; try { return await this.rpc('pogey_load', { p_code: code }); } catch (e) { return undefined; } }, // undefined = couldn't ask
};
setInterval(() => cloud.flush(), 20000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); cloud.flush(true); } });

const dayOf = t => Math.floor(t / 1440) + 1;
function clockStr(t) {
  const d = dayOf(t), m = Math.floor(t % 1440), hh = Math.floor(m / 60), mm = m % 60;
  const h12 = (hh % 12) || 12, ap = hh < 12 ? 'AM' : 'PM';
  return `${DAYS[(d - 1) % 7]} · Day ${d} · ${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const dueLabel = due => { const d = due - dayOf(S.t); return d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due ${DAYS[(due - 1) % 7]} (Day ${due})`; };
function bill(id) { return S.bills.find(b => b.id === id); }
function internetOn() { if (!S) return true; const b = bill('internet'); return !(b && !b.paid && b.late); }
function billCost(b) { const d = BILL_DEFS[b.id]; return (d.metered ? (b.issued ? b.amount : powerEstimate()) : d.amount) + (b.late ? d.late : 0); }

function addMoney(amt, desc) {
  S.money += amt;
  S.tx.unshift({ t: S.t, desc, amt });
  if (S.tx.length > 60) S.tx.length = 60;
  updateHUD(); save();
}

// ---- time ----
function advance(mins) {
  const before = dayOf(S.t);
  if (S.power && !S.power.cut) S.power.kwh += POWER.house * mins / 60;
  S.t += mins;
  const after = dayOf(S.t);
  for (let d = before + 1; d <= after && !S.evicted; d++) newDay(d);
}
function newDay(d) {
  S.lastDay = d;
  for (const b of S.bills) {
    const def = BILL_DEFS[b.id];
    if (b.paid) continue;
    if (def.metered && !b.issued && d >= b.due) { // the electricity bill arrives: freeze the amount, start a new meter
      b.issued = true; b.amount = powerEstimate(); b.kwh = Math.round(S.power.kwh); S.power.kwh = 0;
      toast(`Electricity bill: ${money(b.amount)} for ${b.kwh} kWh. Due today.`, b.amount > 60 ? 'bad' : '', 7000);
    }
    if (def.metered && b.issued && d > b.due + def.grace && !S.power.cut) { S.power.cut = true; toast('The power company cut you off for an unpaid electricity bill. Pay it to get the lights back.', 'bad', 8000); }
    if (d > b.due && !b.late) {
      b.late = true;
      toast(`${def.name} is overdue. +${money(def.late)} late fee.` + (b.id === 'internet' ? ' Your internet has been cut off.' : b.id === 'power' ? ` Pay within ${def.grace} days or the power gets cut off.` : ` Pay within ${def.grace} days or you're out.`), 'bad', 7000);
    }
    if (b.id === 'rent' && d > b.due + def.grace) { evict(); return; }
  }
  for (const b of S.bills) {
    if (!b.paid && b.due === d) toast(`${BILL_DEFS[b.id].name} (${money(billCost(b))}) is due today.`, 'bad', 6000);
    else if (!b.paid && b.due === d + 1) toast(`${BILL_DEFS[b.id].name} (${money(billCost(b))}) is due tomorrow.`, '', 6000);
  }
  save();
}
function payBill(id) {
  const b = bill(id), cost = billCost(b);
  if (b.paid || S.money < cost || (BILL_DEFS[id].metered && !b.issued)) return;
  addMoney(-cost, `${BILL_DEFS[id].name} payment`);
  const def = BILL_DEFS[id];
  const wasLate = b.late;
  b.paid = true;
  // queue next cycle immediately so there's always one bill per type
  Object.assign(b, { due: b.due + def.every, paid: false, late: false, issued: false, amount: undefined, kwh: undefined });
  const restored = id === 'power' && S.power.cut; if (restored) S.power.cut = false;
  toast(`${def.name} paid.` + (id === 'internet' && wasLate ? ' Internet restored.' : '') + (restored ? ' The power is back on.' : ''), 'good');
  renderBills(); updateHUD(); save();
}
function evict() {
  if (S.evicted) return;
  S.evicted = true; save(); updateHUD();
  paused = true; closePC(true);
  document.exitPointerLock && document.exitPointerLock();
  const st = S.stats;
  $('evStats').innerHTML = `
    <div class="stat"><b>${dayOf(S.t)}</b><span>Days survived</span></div>
    <div class="stat"><b>${money(S.money)}</b><span>Money left</span></div>
    <div class="stat"><b>${st.runs}</b><span>Plinko runs</span></div>
    <div class="stat"><b>${money(st.best)}</b><span>Biggest win</span></div>`;
  showScreen('scEvicted');
}

// ---- HUD / UI helpers ----
function updateHUD() {
  if (!S) return;
  for (const fn of hooks.hud) fn();
  $('hudClock').textContent = clockStr(S.t);
  $('hudMoney').textContent = money(S.money);
  $('tbClock').textContent = clockStr(S.t);
  $('tbMoney').textContent = money(S.money);
  const warn = S.bills.filter(b => !b.paid && b.due - dayOf(S.t) <= 1 && !(BILL_DEFS[b.id].metered && !b.issued && b.due > dayOf(S.t))).map(b => `${BILL_DEFS[b.id].name} ${dueLabel(b.due)}`);
  if (S.power && S.power.cut) warn.unshift('⚡ Power cut off');
  $('hudWarn').style.display = warn.length ? '' : 'none';
  $('hudWarn').textContent = warn.join(' · ');
}
function toast(msg, kind = '', ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('toasts').prepend(el);
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 450); }, ms);
}
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id); }

// ---- interactions ----
let hovered = null;
const QUIPS = {
  door: ['You peek through the peephole. The hallway is empty. Outside can wait.', 'You put your hand on the doorknob, then think better of it.', 'There might be people out there. Hard pass.'],
  toilet: ['You use the toilet. Riveting content.', 'You sit and scroll your phone for twenty minutes. Classic.', 'Flushed. The pipes groan ominously.'],
  sink: ['You wash your hands. Look at you, being hygienic.', 'The tap sputters, then gives up and runs normally.', 'You splash water on your face. Still you.'],
  fridge: ['One energy drink, half a lemon and a mystery container. Living the dream.', 'The fridge hums at you judgementally.'],
};
let clickCtx = null;
function clickSound() {
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    const a = clickCtx, o = a.createOscillator(), gn = a.createGain();
    o.type = 'square'; o.frequency.value = 1800; gn.gain.setValueAtTime(0.04, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.03);
    o.connect(gn).connect(a.destination); o.start(); o.stop(a.currentTime + 0.04);
  } catch (e) {}
}
function interact(id) {
  if (paused || sleeping) return;
  for (const fn of hooks.interact) if (fn(id)) return;
  if (id === 'switch') { S.lightOn = !S.lightOn; clickSound(); save(); return; }
  if (id === 'bathswitch') { S.bathLight = S.bathLight === false; clickSound(); save(); return; }
  if (id === 'bath') {
    if (S.bathDoor && P.x > 3.33 - P.r - 0.02 && P.x < 3.4 + P.r && P.z > BATH.z0 - 0.05 && P.z < BATH.z0 + 0.8 + P.r) { toast("You're standing in the way of the door."); return; }
    if (S.bathDoor && !walkable(P.x, P.z, 0) ) { toast("Step out of the doorway first."); return; }
    if (S.bathDoor && P.x > 2.62 && P.x < 3.38 && P.z > 3.75 && P.z < 4.4) { toast("Step out of the doorway first."); return; }
    S.bathDoor = !S.bathDoor; doorSound(S.bathDoor); save(); return;
  }
  if (id === 'shower') return shower();
  if (id === 'lamp') { S.lampOn = S.lampOn === false; clickSound(); save(); return; }
  if (id === 'pc') return openPC();
  if (id === 'bed') return sleep();
  if (id === 'window') {
    const h = (S.t / 60) % 24;
    return toast(h < 6 || h >= 20 ? 'City lights twinkle. Everyone out there has a job.' : h < 9 ? 'Morning commuters shuffle to work. Couldn\'t be you.' : h < 17 ? 'Broad daylight. Way too bright.' : 'The sun is setting. Prime gambling hours approach.');
  }
  if (id === 'door') {
    const r = bill('rent');
    if (!r.paid && r.late) return toast('A notice is taped to the door: "PAY YOUR RENT OR GET OUT." — Management', 'bad', 6000);
  }
  const q = QUIPS[id]; if (q) toast(q[Math.floor(Math.random() * q.length)]);
}
function shower() {
  sleeping = true;
  document.exitPointerLock && document.exitPointerLock();
  const fade = $('fade'); fade.textContent = 'Splish splash…'; fade.classList.add('on');
  setTimeout(() => {
    advance(15); updateHUD(); save();
    fade.classList.remove('on'); sleeping = false;
    if (!S.evicted) { toast(['Fresh as a daisy. A daisy that gambles.', 'You emerge from the steam a new person. Same bills though.', 'The hot water ran out halfway. Typical.'][Math.floor(Math.random() * 3)]); lockPointer(); }
  }, 1300);
}
function doorSound(open) {
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    const a = clickCtx, o = a.createOscillator(), gn = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(open ? 220 : 160, a.currentTime); o.frequency.exponentialRampToValueAtTime(open ? 120 : 90, a.currentTime + 0.18);
    gn.gain.setValueAtTime(0.06, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.22);
    o.connect(gn).connect(a.destination); o.start(); o.stop(a.currentTime + 0.25);
  } catch (e) {}
}
function sleep() {
  const h = (S.t / 60) % 24;
  sleeping = true;
  document.exitPointerLock && document.exitPointerLock();
  const fade = $('fade');
  const target = (h < 8 ? 0 : 1) * 1440 + 8 * 60; // next 8 AM
  fade.textContent = 'Zzz…'; fade.classList.add('on');
  setTimeout(() => {
    const now = S.t % 1440, mins = target - now;
    advance(mins);
    updateHUD(); save();
    fade.textContent = clockStr(S.t).split(' · ').slice(0, 2).join(' · ');
    setTimeout(() => {
      fade.classList.remove('on'); sleeping = false;
      if (!S.evicted) { toast(h >= 6 && h < 18 ? 'You napped until morning. No regrets.' : 'You slept until 8 AM.'); lockPointer(); }
    }, 1100);
  }, 900);
}

// =====================================================================
// PC
// =====================================================================
let tableBet = 0, atTable = false, frameReady = false, pendingStart = null;
function openPC() {
  pcOpen = true;
  document.exitPointerLock && document.exitPointerLock();
  $('pc').classList.add('show');
  hideWins(); updateHUD(); pcSizer.place();
}
function closePC(force) {
  if (atTable && !force) { confirmLeaveTable(true); return; }
  if (atTable) endTable();
  pcOpen = false; $('pc').classList.remove('show');
  if (!force && started && !S.evicted) lockPointer();
}
function hideWins() { for (const w of document.querySelectorAll('.win')) w.classList.remove('show'); }
function openWin(id) { hideWins(); $(id).classList.add('show'); }
for (const ic of document.querySelectorAll('.icon[data-app], .taskbar [data-app]')) ic.onclick = () => {
  if (atTable) { confirmLeaveTable(); return; }
  const a = ic.dataset.app;
  if (a === 'casino') { casinoView = 'lobby'; renderCasino(); openWin('winCasino'); }
  if (a === 'bank') { renderBank(); openWin('winBank'); }
  if (a === 'bills') { renderBills(); openWin('winBills'); }
};
for (const b of document.querySelectorAll('[data-close]')) b.onclick = hideWins;
$('iconLogoff').onclick = () => closePC();
$('btnLogoff').onclick = () => closePC();

function renderBank() {
  const st = S.stats;
  $('bankBody').innerHTML = `<h3>Balance: <span class="${S.money >= 0 ? 'pos' : 'neg'}">${money(S.money)}</span></h3>
    <p>Plinko: ${st.runs} runs · ${st.wins} cash-outs · ${st.busts} busts · wagered ${money(st.wagered)} · paid out ${money(st.won)}</p>
    <table><tr><th>When</th><th>Description</th><th class="num">Amount</th></tr>
    ${S.tx.map(x => `<tr><td>${clockStr(x.t).split(' · ').slice(1).join(' · ')}</td><td>${x.desc}</td><td class="num ${x.amt >= 0 ? 'pos' : 'neg'}">${x.amt >= 0 ? '+' : ''}${money(x.amt)}</td></tr>`).join('')}</table>`;
}
function renderBills() {
  const pw = S.power || { kwh: 0 };
  $('billsBody').innerHTML = `<h3>Bills</h3><p>Rent, internet and electricity come every week. Late internet gets cut off, the power gets cut ${BILL_DEFS.power.grace} days after a missed electricity bill, and rent more than ${BILL_DEFS.rent.grace} days late gets you evicted.</p>
    <p style="font-size:13px">⚡ Electricity: ${money(POWER.base)} connection + $${POWER.rate.toFixed(2)} per kWh. Used since the last bill: <b>${pw.kwh.toFixed(1)} kWh</b> (about ${money(pw.kwh * POWER.rate)}).${pw.cut ? ' <b class="neg">Your power is cut off.</b>' : ''}</p>
    <table><tr><th>Bill</th><th>Status</th><th class="num">Amount</th><th></th></tr>
    ${S.bills.map(b => {
      const def = BILL_DEFS[b.id], cost = billCost(b), d = b.due - dayOf(S.t);
      const pill = b.late ? `<span class="pill late">${dueLabel(b.due)}</span>` : d <= 1 ? `<span class="pill due">${dueLabel(b.due)}</span>` : `<span class="pill ok">${dueLabel(b.due)}</span>`;
      const pending = def.metered && !b.issued;
      return `<tr><td><b>${def.name}</b>${def.metered && b.issued ? `<br><small>${b.kwh} kWh</small>` : ''}</td><td>${pending ? `<span class="pill ok">bill comes ${dueLabel(b.due).replace('due ', '')}</span>` : pill}</td>
        <td class="num">${pending ? `~${money(cost)} so far` : money(cost)}${b.late ? ` <small>(incl. ${money(def.late)} late fee)</small>` : ''}</td>
        <td class="num"><button class="wbtn" data-pay="${b.id}" ${S.money < cost || pending ? 'disabled' : ''}>Pay</button></td></tr>`;
    }).join('')}</table>`;
  for (const b of document.querySelectorAll('[data-pay]')) b.onclick = () => payBill(b.dataset.pay);
}
const cashMult = n => n <= 0 ? 0 : n < CASH_TABLE.length ? CASH_TABLE[n] : CASH_TABLE[CASH_TABLE.length - 1] * Math.pow(1.25, n - CASH_TABLE.length + 1);
let chosenBet = 25;
// ---- PogeyCasino: a lobby of games. Plinko is the first; more can be added with POGEY.casinoAddGame ----
let casinoView = 'lobby';
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
const CASINO_GAMES = [
  { id: 'plinko', icon: '◉', name: 'Plinko', desc: 'Roguelite Plinko. Bet, clear floors, cash out before you bust.', grad: 'linear-gradient(135deg,#7b5cff,#2fc4d6)', render: renderPlinkoBet },
  { id: 'blackjack', icon: '🂡', name: 'Blackjack', desc: 'Beat the dealer to 21.', grad: 'linear-gradient(135deg,#1f7a4c,#0f3d27)', soon: true },
  { id: 'slots', icon: '🎰', name: 'Slots', desc: 'Pull the lever. Lose money with style.', grad: 'linear-gradient(135deg,#ff5f9e,#ff9a3c)', soon: true },
  { id: 'roulette', icon: '🎡', name: 'Roulette', desc: 'Red or black? Let it ride.', grad: 'linear-gradient(135deg,#b3202f,#1b1a22)', soon: true },
];
function renderCasino() {
  const body = $('casinoBody');
  if (!internetOn()) {
    body.innerHTML = `<div class="offline"><div class="big">📡✕</div><h3>No internet connection</h3><p>Your internet was cut off for an unpaid bill. Pay it in the Bills app to get back online.</p><button class="wbtn" id="goBills">Open Bills</button></div>`;
    $('goBills').onclick = () => { renderBills(); openWin('winBills'); };
    return;
  }
  const g = CASINO_GAMES.find(x => x.id === casinoView && !x.soon);
  if (g) return g.render(body);
  casinoView = 'lobby';
  const st = S.stats;
  body.innerHTML = `<div class="lobby"><div class="lobby-head"><h3>PogeyCasino 🎰</h3><span class="bal">Balance ${money(S.money)}</span></div>
    <p>Pick a game. Please gamble irresponsibly (it's a video game).</p>
    <div class="games">${CASINO_GAMES.map(x => `<button class="game" data-game="${x.id}" style="background:${x.grad}" ${x.soon ? 'disabled' : ''}>
      <span class="gi">${x.icon}</span><span class="gn">${x.name}</span><span class="gd">${x.desc}</span><span class="gt">${x.soon ? 'Coming soon' : 'Play'}</span></button>`).join('')}</div>
    <div class="lobby-stats"><span>Plinko runs <b>${st.runs}</b></span><span>Cashed out <b>${st.wins}</b></span><span>Busted <b>${st.busts}</b></span><span>Wagered <b>${money(st.wagered)}</b></span><span>Won <b>${money(st.won)}</b></span></div></div>`;
  for (const b of body.querySelectorAll('[data-game]')) b.onclick = () => { casinoView = b.dataset.game; renderCasino(); };
}
function renderPlinkoBet(body) {
  if (chosenBet > S.money) chosenBet = S.money >= 1 ? (BETS.filter(x => x <= S.money).pop() || Math.floor(S.money)) : BETS[0];
  body.innerHTML = `<div class="casino"><button class="back" id="btnLobby">← All games</button><h3>◉ Plinko</h3>
    <p>Place a bet and play a run. After each floor you clear you can <b>cash out</b> at the multiplier below, or pick an upgrade and push on. Bust before cashing out and the house keeps your bet.</p>
    <div class="bets">${BETS.map(b => `<button data-bet="${b}" class="${b === chosenBet ? 'on' : ''}" ${b > S.money ? 'disabled' : ''}>$${b}</button>`).join('')}${customBetBox(chosenBet, BETS)}</div>
    <div class="ladder">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<div class="rung">Floor ${n}${n % 5 === 0 ? ' ☠' : ''}<b>×${cashMult(n)}</b>${money(chosenBet * cashMult(n))}</div>`).join('')}</div>
    <p style="font-size:12px">☠ boss floor. Past floor 10 each floor adds another ×1.25.</p>
    <button class="wbtn gold" id="btnPlaceBet" ${S.money < chosenBet ? 'disabled' : ''} style="font-size:16px;padding:12px 20px">Bet ${money(chosenBet)} and play</button>
    ${S.money < 1 ? '<p class="neg">You can\'t afford the minimum bet.</p>' : ''}</div>`;
  for (const b of body.querySelectorAll('[data-bet]')) b.onclick = () => { chosenBet = +b.dataset.bet; renderCasino(); };
  wireCustomBet(body, () => S.money, v => { chosenBet = v; renderCasino(); });
  $('btnPlaceBet').onclick = () => startTable(chosenBet);
  $('btnLobby').onclick = () => { casinoView = 'lobby'; renderCasino(); };
}
function startTable(bet) {
  if (S.money < bet || !internetOn() || !(bet >= 1 && bet <= MAX_BET)) return;
  addMoney(-bet, `Plinko bet`);
  S.stats.runs++; S.stats.wagered += bet; save();
  tableBet = bet; atTable = true;
  $('tableBet').textContent = `Bet ${money(bet)}`;
  $('result').classList.remove('show');
  openWin('winTable');
  pendingStart = { type: 'pogeyStart', bet, table: CASH_TABLE };
  const fr = $('plinkoFrame');
  if (frameReady) sendStart(); else if (!fr.src) fr.src = '../Plinko/index.html?pogey=1';
}
function sendStart() {
  if (!pendingStart) return;
  $('plinkoFrame').contentWindow.postMessage(Object.assign({ src: 'pogeylife' }, pendingStart), '*');
  pendingStart = null;
  setTimeout(() => { try { $('plinkoFrame').contentWindow.focus(); } catch (e) {} }, 50);
}
function endTable() { atTable = false; tableBet = 0; }
window.addEventListener('message', e => {
  const fr = $('plinkoFrame');
  if (!fr || e.source !== fr.contentWindow) return;
  const d = e.data || {};
  if (d.src !== 'plinko') return;
  if (d.type === 'pogeyReady') { frameReady = true; sendStart(); }
  if (d.type === 'pogeyEsc') handleEsc();
  if (d.type === 'pogeyCashOut' && atTable) {
    const win = Math.round(tableBet * cashMult(d.cleared));
    addMoney(win, `Plinko cash-out (floor ${d.cleared})`);
    S.stats.wins++; S.stats.won += win; S.stats.best = Math.max(S.stats.best, win - tableBet);
    advance(15 * d.cleared); updateHUD(); save();
    showResult(true, win, d.cleared);
  }
  if (d.type === 'pogeyBust' && atTable) {
    S.stats.busts++;
    advance(15 * Math.max(1, d.floor - 1)); updateHUD(); save();
    setTimeout(() => showResult(false, 0, d.floor - 1), 1400);
  }
});
function showResult(won, amt, cleared) {
  const bet = tableBet; endTable();
  $('resultBox').innerHTML = won
    ? `<p>Cashed out after floor ${cleared}</p><div class="big pos">+${money(amt)}</div><p>Profit ${money(amt - bet)} on a ${money(bet)} bet.</p>`
    : `<p>Busted on floor ${cleared + 1}</p><div class="big neg">-${money(bet)}</div><p>The house thanks you for your business.</p>`;
  $('resultBox').innerHTML += `<button class="wbtn gold" id="btnAgain">Back to casino</button>`;
  $('result').classList.add('show');
  $('btnAgain').onclick = () => { $('result').classList.remove('show'); renderCasino(); openWin('winCasino'); };
}
function forfeitTable() {
  S.stats.busts++; endTable(); save();
  $('result').classList.remove('show');
  $('plinkoFrame').src = '../Plinko/index.html?pogey=1'; frameReady = false; // reset the table
}
function confirmLeaveTable(thenLeavePC) {
  $('resultBox').innerHTML = `<h3>Leave the table?</h3><p>Walking away mid-run forfeits your ${money(tableBet)} bet.</p>
    <button class="wbtn" id="btnStay">Keep playing</button> <button class="wbtn" id="btnLeave" style="background:#c43a3a">${thenLeavePC ? 'Leave PC' : 'Leave'}</button>`;
  $('result').classList.add('show');
  $('btnStay').onclick = () => $('result').classList.remove('show');
  $('btnLeave').onclick = () => {
    forfeitTable();
    renderCasino(); openWin('winCasino');
    if (thenLeavePC) closePC();
  };
}
$('btnForfeit').onclick = () => { if (atTable) confirmLeaveTable(); else { renderCasino(); openWin('winCasino'); } };

// =====================================================================
// Title / pause / boot
// =====================================================================
const DISCORD_URL = ''; // paste the Discord invite link here when the server is ready
let titleView = 'main', titleConfirm = false;
const DISCORD_SVG = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm4.5 6.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm7 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>';
// The title menu. Views: main -> start (Continue / New life / Select character / Enter code) -> select | code | replace.
// A computer keeps up to MAX_LOCAL characters; making or loading one more asks which to replace.
const MAX_LOCAL = 3;
let pendingReplace = null, codeMsg = '', armed = null; // armed = the row that needs a second click to confirm
const PARENT = { start: 'main', chars: 'main', replace: 'start' };
function charLine(p) { return `${p.evicted ? 'Evicted' : 'Day ' + p.day + ' · ' + money(p.money)}${p.at ? ' · ' + new Date(p.at).toLocaleDateString() : ''}`; }
function deleteLocal(code) {
  try { localStorage.removeItem(SLOT_PREFIX + code); } catch (e) {}
  if (lsGet(ACTIVE_KEY) === code) { const rest = localProfiles(); if (rest[0]) lsSet(ACTIVE_KEY, rest[0].code); else try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {} }
}
function pickChar(code, note, view = 'chars') { lsSet(ACTIVE_KEY, code); titleScene(); renderTitle(view); if (note) toast(note, 'good', 3500); }
// New life, unless the computer is full: then choose who to replace first
function startNewLife() {
  if (localProfiles().length >= MAX_LOCAL) { pendingReplace = { kind: 'new' }; renderTitle('replace'); }
  else newLife();
}
function renderTitle(view) {
  if (view) { titleView = view; armed = null; }
  const saved = load(), has = saved && !saved.evicted, chars = localProfiles();
  const box = $('titleBtns'); box.innerHTML = '';
  $('scTitle').classList.toggle('chars', titleView === 'chars' || (titleView === 'replace' && !!pendingReplace && pendingReplace.kind === 'code'));
  const mk = (html, fn, cls = '') => { const b = document.createElement('button'); b.className = cls; b.innerHTML = `<span class="ar">▸</span>${html}`; if (fn) b.onclick = fn; else b.disabled = true; box.appendChild(b); return b; };
  const note = html => { const d = document.createElement('div'); d.className = 'tnote'; d.innerHTML = html; box.appendChild(d); };
  // characters on this computer as rows: click to pick, ✕ to delete (opts.confirm: picking needs a second click)
  const charRows = (onPick, opts = {}) => {
    const act = lsGet(ACTIVE_KEY), list = document.createElement('div'); list.className = 'tclist';
    for (const p of chars) {
      const isArmed = armed && armed.code === p.code, row = document.createElement('div');
      row.className = 'tcrow' + (p.code === act && !opts.confirm ? ' sel' : '') + (isArmed && armed.what === 'pick' ? ' armed' : '');
      row.innerHTML = `<button class="tcpick" data-code="${p.code}"><b>${isArmed && armed.what === 'pick' ? (opts.confirmText || 'Click again') : p.code}</b><span>${charLine(p)}</span></button>` +
        (opts.del ? `<button class="tc-del${isArmed && armed.what === 'del' ? ' armed' : ''}" title="Delete from this computer">${isArmed && armed.what === 'del' ? 'Delete?' : '✕'}</button>` : '');
      row.querySelector('.tcpick').onclick = () => { if (opts.confirm && !(isArmed && armed.what === 'pick')) { armed = { code: p.code, what: 'pick' }; renderTitle(); focusRow(p.code); return; } onPick(p); };
      const del = row.querySelector('.tc-del');
      if (del) del.onclick = () => {
        if (!(isArmed && armed.what === 'del')) { armed = { code: p.code, what: 'del' }; renderTitle(); return; }
        deleteLocal(p.code); armed = null;
        toast(cloud.ready ? `Deleted ${p.code} from this computer. It's still saved online: enter the code to bring it back.` : `Deleted ${p.code}.`, '', 4500);
        titleScene(); renderTitle();
      };
      list.appendChild(row);
    }
    box.appendChild(list);
  };
  if (titleView === 'main') {
    mk('Start game', () => renderTitle('start'));
    mk('Character', () => renderTitle('chars'));
    mk('Settings', () => openSettings('scTitle'));
    mk(`${DISCORD_SVG}Discord`, () => { if (DISCORD_URL) window.open(DISCORD_URL, '_blank', 'noopener'); else toast('The Pogey Life Discord is coming soon.', '', 3000); });
  } else if (titleView === 'start') {
    if (has) mk(`Continue <span class="sub">${saved.code || ''} · Day ${dayOf(saved.t)} · ${money(saved.money)}</span>`, () => continueGame(saved));
    else mk(`Continue <span class="sub">${saved && saved.evicted ? 'this character was evicted' : 'no save yet'}</span>`, null);
    mk('New life', startNewLife);
    mk('← Back', () => renderTitle('main'), 'back');
  } else if (titleView === 'chars') {
    renderCodeForm(box);
    const lbl = document.createElement('div'); lbl.className = 'tcode-lbl'; lbl.style.marginTop = '22px';
    lbl.textContent = `Your characters · ${chars.length} of ${MAX_LOCAL} on this computer`; box.appendChild(lbl);
    if (chars.length) charRows(p => pickChar(p.code), { del: true });
    else note('No characters yet. Start a <b>New life</b> from Start game, or enter a player code above.');
    mk('← Back', () => renderTitle('main'), 'back');
  } else if (titleView === 'replace') {
    const pr = pendingReplace || { kind: 'new' };
    note(`<b>This computer already has ${MAX_LOCAL} characters.</b> ${pr.kind === 'new' ? 'Starting a new life' : `Loading ${pr.code}`} will replace one of them. Pick which one:`);
    charRows(p => {
      deleteLocal(p.code); pendingReplace = null;
      if (pr.kind === 'new') newLife();
      else { lsSet(SLOT_PREFIX + pr.code, JSON.stringify(pr.data)); pickChar(pr.code, `Replaced ${p.code} with ${pr.code}.`, 'chars'); }
    }, { confirm: true, confirmText: 'Replace this one? Click again' });
    note(cloud.ready ? 'The replaced character stays saved online, so its code can still bring it back later.' : 'The replaced character is deleted from this computer.');
    mk('← Cancel', () => { const back = pr.kind === 'code' ? 'chars' : 'start'; pendingReplace = null; renderTitle(back); }, 'back');
  }
  renderCharCard();
}
function focusRow(code) { const b = $('titleBtns').querySelector(`[data-code="${code}"]`); if (b) b.focus({ preventScroll: true }); }
// the player code box at the top of the Character screen
function renderCodeForm(box) {
  const form = document.createElement('div'); form.className = 'tcode';
  form.innerHTML = `<div class="tcode-lbl">Enter a player code</div>
    <div class="tcode-row"><input id="codeIn" maxlength="16" placeholder="XXXX-XXXX-XXXX" spellcheck="false" autocomplete="off"><button id="codeGo">Load</button></div>
    <div class="tcode-msg" id="codeMsg">${codeMsg}</div>`;
  box.appendChild(form); codeMsg = '';
  const inp = form.querySelector('#codeIn'), msg = form.querySelector('#codeMsg');
  inp.oninput = () => { const x = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12); inp.value = x.replace(/(.{4})(?=.)/g, '$1-'); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') inp.blur(); };
  async function go() {
    const code = normCode(inp.value);
    if (!code) { msg.className = 'tcode-msg bad'; msg.textContent = 'Codes are 12 letters and numbers, like K7QM-3XRP-9FHT.'; return; }
    if (load(code)) { pickChar(code, 'Character selected.'); return; }
    msg.className = 'tcode-msg'; msg.textContent = 'Looking it up…'; form.querySelector('#codeGo').disabled = true;
    const online = await cloud.load(code);
    form.querySelector('#codeGo').disabled = false;
    if (online && typeof online === 'object') {
      online.code = code;
      if (localProfiles().length >= MAX_LOCAL) { pendingReplace = { kind: 'code', code, data: online }; renderTitle('replace'); return; }
      lsSet(SLOT_PREFIX + code, JSON.stringify(online)); pickChar(code, 'Character loaded from your online save.'); return;
    }
    msg.className = 'tcode-msg bad';
    msg.textContent = online === null ? 'No character found with that code.' : cloud.ready === false ? "That code isn't on this computer, and online saving isn't switched on yet." : "Couldn't reach the online saves. Check your connection and try again.";
  }
  form.querySelector('#codeGo').onclick = go;
}
// the stats card under the character on the Character screen (positioned every frame in placeCharCard)
function renderCharCard() {
  const card = $('charCard'), saved = load();
  const show = titleView === 'chars' && saved && saved.char;
  card.classList.toggle('show', !!show);
  if (!show) return;
  const st = saved.stats || {}, d = dayOf(saved.t), rent = (saved.bills || []).find(b => b.id === 'rent'), furn = saved.furn ? saved.furn.pieces.length : 0;
  const row = (k, v) => `<div class="cc-stat"><span>${k}</span><b>${v}</b></div>`;
  card.innerHTML = `<div class="cc-head"><div><div class="cc-code">${saved.code}</div>
      <div class="cc-day">${saved.evicted ? '<span class="cc-ev">Evicted</span>' : `${DAYS[(d - 1) % 7]} · Day ${d}`}${saved.savedAt ? ' · played ' + new Date(saved.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</div></div>
      <div class="cc-money ${saved.money < 0 ? 'neg' : ''}">${money(saved.money)}</div></div>
    <div class="cc-grid">
      ${row('Days survived', d)}
      ${row('Plinko', `${st.runs || 0} runs · ${st.wins || 0} won`)}
      ${row('Biggest win', money(st.best || 0))}
      ${row('Furniture', `${furn} piece${furn === 1 ? '' : 's'}`)}
      ${rent && !saved.evicted ? row('Rent', rent.paid ? 'paid' : `${money(billCost(rent))} ${dueLabelFor(rent.due, saved.t)}`) : ''}
    </div>
    ${saved.evicted ? '' : '<button class="cc-play" id="ccPlay">Play</button>'}`;
  const play = $('ccPlay'); if (play) play.onclick = () => continueGame(saved);
}
function dueLabelFor(due, t) { const d = due - dayOf(t); return d < 0 ? 'overdue' : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days`; }
function placeCharCard() {
  const card = $('charCard'), c = titleCam.base; if (!card.classList.contains('show') || !c) return;
  const s = TITLE_STAND, gl = canvas, vp = M4.mul(M4.persp(1.2, gl.width / gl.height, 0.03, 50), M4.view(c.x, c.y, c.z, c.yaw, c.pitch));
  const pr = (x, y, z) => { const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    return cw > 0.05 ? [(cx / cw + 1) / 2 * gl.clientWidth, (1 - cy / cw) / 2 * gl.clientHeight] : null; };
  const feet = pr(s.x, 0, s.z); if (!feet) return;
  const w = card.offsetWidth, h = card.offsetHeight;
  card.style.left = Math.round(Math.max(12, Math.min(innerWidth - w - 12, feet[0] - w / 2))) + 'px';
  card.style.top = Math.round(Math.max(12, Math.min(innerHeight - h - 12, feet[1] + 6))) + 'px';
}
// arrow keys / Enter / Esc on the title menu (nothing is highlighted until you use the keys or the mouse)
document.addEventListener('keydown', e => {
  if (started || !$('scTitle').classList.contains('show')) return;
  const bs = [...$('titleBtns').querySelectorAll('button:not(:disabled)')];
  const i = bs.indexOf(document.activeElement);
  if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); const n = bs.length; bs[((i < 0 ? (e.code === 'ArrowDown' ? -1 : 0) : i) + (e.code === 'ArrowDown' ? 1 : -1) + n) % n].focus(); }
  if (e.code === 'Escape' && PARENT[titleView] && document.activeElement.id !== 'codeIn') { if (titleView === 'replace') pendingReplace = null; renderTitle(PARENT[titleView]); }
});
document.addEventListener('focusin', e => { for (const b of $('titleBtns').querySelectorAll('button')) b.classList.toggle('on', b === e.target && b.matches(':focus-visible')); });
document.addEventListener('focusout', e => { if (e.target.classList) e.target.classList.remove('on'); });
// the title background: your own apartment if there's a save (a throwaway copy; nothing here is saved), in the evening
let titleChar = false; // is there a saved character to stand on the rug?
function titleScene() {
  const saved = load();
  S = saved ? JSON.parse(JSON.stringify(saved)) : freshState();
  titleChar = !!(saved && saved.char);
  for (const fn of hooks.fresh) fn(S);
  Object.assign(S, { t: (dayOf(S.t) - 1) * 1440 + TITLE_SHOT.hour * 60, lightOn: TITLE_SHOT.light, lampOn: true, bathLight: true, bathDoor: true });
}
const TITLE_SHOT = { x: 0.35, z: 3.75, yaw: -0.5, pitch: -0.08, y: 1.55, hour: 19.4, light: true }; // corner by the door, looking at the desk + dusk window
// the Character screen glides in closer, with the character on the left half of the screen
const CHAR_SHOT = { x: 3.0, z: 3.92, yaw: 0.15, pitch: -0.16, y: 1.2 };
const TITLE_STAND = { x: 2.35, z: 1.62 }; // on the rug
let camMix = 0, camT = 0;
function titleCam() {
  const now = performance.now(), k = now / 1000, dt = Math.min(0.1, (now - (camT || now)) / 1000); camT = now;
  const want = titleView === 'chars' || (titleView === 'replace' && pendingReplace && pendingReplace.kind === 'code') ? 1 : 0;
  camMix += (want - camMix) * (1 - Math.exp(-dt * 3.5));
  const e = camMix * camMix * (3 - 2 * camMix), a = TITLE_SHOT, b = CHAR_SHOT, mix = (u, v) => u + (v - u) * e;
  titleCam.base = { x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z), yaw: mix(a.yaw, b.yaw), pitch: mix(a.pitch, b.pitch) }; // without the drift: the stats card hangs off this so it doesn't wobble
  return { x: mix(a.x, b.x) + Math.sin(k * 0.05) * 0.08, y: mix(a.y, b.y) + Math.sin(k * 0.13) * 0.015, z: mix(a.z, b.z) + Math.cos(k * 0.05) * 0.06,
    yaw: mix(a.yaw, b.yaw) + Math.sin(k * 0.06) * 0.09 * (1 - e * 0.6), pitch: mix(a.pitch, b.pitch) + Math.sin(k * 0.09) * 0.02 };
}
// where the character stands on the title screen, turned to face the camera (character.js draws them)
function titlePose() {
  if (!titleMode || !titleChar) return null;
  const eye = lastView.eye || TITLE_SHOT, s = TITLE_STAND;
  return { x: s.x, z: s.z, yaw: Math.atan2(-(eye.x - s.x), -(eye.z - s.z)) };
}
function titleStamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  $('titleStamp').textContent = `${p(d.getMonth() + 1)} ${p(d.getDate())} '${String(d.getFullYear()).slice(2)}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}
let titleMode = false;
function showTitle() { titleMode = true; $('toasts').innerHTML = ''; titleScene(); renderTitle('main'); titleStamp(); showScreen('scTitle'); }
function newLife() {
  titleMode = false; S = freshState(); for (const fn of hooks.fresh) fn(S);
  if (hooks.newLife.length) { showScreen(null); hooks.newLife[0](); } else begin(null); }
function begin(saved) {
  titleMode = false;
  S = saved || freshState();
  for (const fn of hooks.fresh) fn(S);
  if (S.pos) Object.assign(P, { x: S.pos.x, z: S.pos.z, yaw: S.pos.yaw, pitch: S.pos.pitch });
  else Object.assign(P, { x: 3.1, z: 2.2, yaw: 0.25, pitch: -0.08 });
  started = true; paused = false;
  showScreen(null); updateHUD(); save();
  lockPointer();
  if (!saved) setTimeout(() => toast('Your PC is on the desk. Rent is due Sunday.', '', 6000), 600);
  if (!saved) setTimeout(() => toast(`Your player code is ${S.code}. It's in the pause menu (Esc) any time: use it to load this character again.`, 'good', 9000), 1400);
}
// Continue: if this character was played more recently on another computer, use that copy
async function continueGame(saved) {
  const online = await cloud.load(saved.code);
  if (online && typeof online === 'object' && (online.savedAt || 0) > (saved.savedAt || 0)) { saved = online; lsSet(SLOT_PREFIX + saved.code, JSON.stringify(saved)); toast('Loaded your latest online save.', '', 3000); }
  begin(saved);
}
$('btnResume').onclick = () => resumeGame();
function renderPauseCode() {
  const el = $('pauseCode'); if (!el || !S || !S.code) return;
  el.textContent = S.code;
  $('pauseCloud').textContent = cloud.state === 'saved' ? '✓ Saved online. Use this code on the title screen (Enter player code) to play this character on any computer.'
    : cloud.ready === false ? 'Saved on this computer. Online saving isn\'t switched on yet, so the code only works in this browser for now.'
    : cloud.state === 'offline' ? 'Saved on this computer. Couldn\'t reach the online save right now; it\'ll retry.'
    : 'Use this code on the title screen (Enter player code) to come back to this character.';
}
$('btnCopyCode').onclick = () => {
  const done = () => { $('btnCopyCode').textContent = 'Copied!'; setTimeout(() => { $('btnCopyCode').textContent = 'Copy'; }, 1500); };
  try { navigator.clipboard.writeText(S.code).then(done, () => { const r = document.createRange(); r.selectNodeContents($('pauseCode')); getSelection().removeAllRanges(); getSelection().addRange(r); }); } catch (e) {}
};
$('btnQuitTitle').onclick = () => {
  if (pcOpen) { if (atTable) forfeitTable(); closePC(true); }
  save(); cloud.flush(); started = false; paused = true; showTitle();
};
$('btnNewLife').onclick = () => { // the evicted character stays saved under its code (and counts towards the 3)
  if (localProfiles().length >= MAX_LOCAL) { started = false; paused = true; pendingReplace = { kind: 'new' }; showTitle(); renderTitle('replace'); }
  else newLife();
};

let last = performance.now(), saveTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started && !paused && !sleeping && S && !S.evicted) {
    if (!pcOpen && !modalOpen) movePlayer(dt);
    advance(dt * GAME_MIN_PER_SEC);
    for (const fn of hooks.update) fn(dt);
    if (S.power && S.power.cut) env.power = 0;
    saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; save(); }
    updateHUD();
  }
  hovered = active() ? pick() : null;
  $('crosshair').classList.toggle('hot', !!hovered);
  const pr = $('prompt');
  if (hovered) { pr.style.display = 'block'; pr.innerHTML = `<kbd>E</kbd>${typeof hovered.prompt === 'function' ? hovered.prompt() : hovered.prompt}`; } else pr.style.display = 'none';
  document.body.classList.toggle('titlemode', titleMode);
  if (titleMode && now - (titleStamp.t || 0) > 15000) { titleStamp.t = now; titleStamp(); }
  if (titleMode) placeCharCard();
  if (S || !started) render();
  requestAnimationFrame(frame);
}

// boot
buildRoom();
if (!gl) { document.body.innerHTML = '<p style="padding:30px">Your browser doesn\'t support WebGL, which Pogey Life needs.</p>'; return; }
initGL(); resize();
if (matchMedia('(pointer: coarse)').matches) $('mobileNote').style.display = '';
showTitle();
window.addEventListener('beforeunload', () => { save(); cloud.flush(true); });
requestAnimationFrame(frame);

// ---- settings screen ----
const settingsEl = document.createElement('div');
settingsEl.className = 'screen'; settingsEl.id = 'scSettings';
document.body.appendChild(settingsEl);
let settingsBack = 'scTitle';
const MIRROR_OPTS = [
  ['full', 'Full', 'Reflects everything: you, the bathroom, the room through the door, the weather. Looks best, costs the most.'],
  ['partial', 'Partial', 'Reflects only you and the bathroom. Much lighter on slower computers.'],
  ['simple', 'Simple', 'No real reflection, just a shiny surface. Fastest. At the mirror you see yourself through the glass instead.'],
];
function renderSettings() {
  settingsEl.innerHTML = `<div class="card" style="text-align:left;max-width:520px">
    <h2 style="margin:0 0 4px;text-align:center">Settings</h2>
    <p style="text-align:center;margin-top:0">Saved in this browser.</p>
    <b style="display:block;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:16px 0 8px">Mouse sensitivity</b>
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px">
      <span style="font-size:12px;color:var(--muted)">Slow</span>
      <input type="range" id="setSens" min="0.2" max="3" step="0.05" value="${settings.sens}" style="flex:1;accent-color:#ffcf5a">
      <span style="font-size:12px;color:var(--muted)">Fast</span>
      <b id="setSensVal" style="min-width:44px;text-align:right;font-variant-numeric:tabular-nums">${(+settings.sens).toFixed(2)}×</b>
      <button class="btn ghost" id="setSensReset" style="margin:0;padding:6px 10px;font-size:12px;box-shadow:none" title="Back to default">Reset</button></div>
    <b style="display:block;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:18px 0 8px">Mirror reflections</b>
    ${MIRROR_OPTS.map(([v, l, d]) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:6px;
        background:${settings.mirror === v ? 'var(--panel2)' : 'transparent'};border:1px solid ${settings.mirror === v ? 'var(--accent)' : 'var(--line)'}">
        <input type="radio" name="mirrorOpt" value="${v}" ${settings.mirror === v ? 'checked' : ''} style="margin-top:3px;accent-color:#ffcf5a">
        <span><b>${l}</b><br><span style="color:var(--muted);font-size:13px">${d}</span></span></label>`).join('')}
    <b style="display:block;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:18px 0 8px">PC screen size</b>
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px">
      <input type="range" id="setPcSize" min="25" max="100" step="5" value="${settings.pcSize}" style="flex:1;accent-color:#ffcf5a">
      <b id="setPcSizeVal" style="min-width:44px;text-align:right;font-variant-numeric:tabular-nums">${settings.pcSize}%</b></div>
    <p style="font-size:12px;margin:6px 2px 0">How much of the window the computer takes up. You can also drag the slider on the PC's taskbar.</p>
    <div style="text-align:center;margin-top:14px"><button class="btn" id="btnSettingsBack">Back</button></div></div>`;
  settingsEl.querySelectorAll('input[name=mirrorOpt]').forEach(r => r.onchange = () => { settings.mirror = r.value; saveSettings(); renderSettings(); });
  $('setPcSize').oninput = e => { pcSizer.set(+e.target.value); $('setPcSizeVal').textContent = settings.pcSize + '%'; };
  $('setPcSize').onchange = () => saveSettings();
  const sens = v => { settings.sens = Math.round(v * 100) / 100; $('setSens').value = settings.sens; $('setSensVal').textContent = settings.sens.toFixed(2) + '×'; };
  $('setSens').oninput = e => sens(+e.target.value);
  $('setSens').onchange = () => saveSettings();
  $('setSensReset').onclick = () => { sens(1); saveSettings(); };
  $('btnSettingsBack').onclick = () => showScreen(settingsBack);
}
// PC monitor size = settings.pcSize % of the window. Below ~960x600 the whole screen is zoomed down instead of
// squeezing the apps, so they keep their layout at any size.
function applyPcSize() {
  const m = document.querySelector('#pc .monitor'); if (!m) return;
  const f = Math.max(25, Math.min(100, settings.pcSize || 75)) / 100;
  const W = innerWidth * f, H = innerHeight * f, z = Math.min(1, W / 960, H / 600);
  m.style.width = W / z + 'px'; m.style.height = H / z + 'px'; m.style.zoom = z;
  m.style.borderRadius = f === 1 ? '0' : ''; m.style.padding = f === 1 ? '6px' : '';
  const tb = document.querySelector('.taskbar'); if (tb) tb.classList.toggle('compact', W / z < 1250); // icon-only app buttons when the screen is narrow
  if (typeof pcSizer !== 'undefined') pcSizer.place();
}
window.addEventListener('resize', applyPcSize);
// size slider on the PC taskbar (bottom right). Dragging works from where you grabbed it rather than from the
// track's live position, because the track itself moves and shrinks as the monitor resizes under the cursor.
const pcSizer = (() => {
  const st = document.createElement('style');
  st.textContent = `.tbsize { position:fixed; z-index:21; display:flex; align-items:center; gap:8px; height:30px; padding:0 10px; border-radius:8px; background:#0b0f1b; border:1px solid #ffffff22; color:var(--text); font-size:13px; font-weight:800; user-select:none; touch-action:none; }
    .tbsize .ic { font-size:14px; opacity:.75; }
    .tbsize .trk { position:relative; width:96px; height:18px; cursor:pointer; }
    .tbsize .trk::before { content:''; position:absolute; left:0; right:0; top:7px; height:4px; border-radius:2px; background:#ffffff26; }
    .tbsize .fill { position:absolute; left:0; top:7px; height:4px; border-radius:2px; background:var(--accent); }
    .tbsize .knob { position:absolute; top:2px; width:14px; height:14px; margin-left:-7px; border-radius:50%; background:#fff; box-shadow:0 1px 4px #0008; }
    .tbsize b { min-width:36px; text-align:right; font-variant-numeric:tabular-nums; }`;
  document.head.appendChild(st);
  const el = document.createElement('div'); el.className = 'tbsize'; el.title = 'Screen size: drag or scroll';
  el.innerHTML = '<span class="ic">⤢</span><div class="trk"><div class="fill"></div><div class="knob"></div></div><b></b>';
  $('pc').appendChild(el); // not inside the monitor, so it stays full size when the monitor is zoomed down
  const trk = el.querySelector('.trk');
  const show = () => { const f = (settings.pcSize - 25) / 75 * 100; el.querySelector('.fill').style.width = f + '%'; el.querySelector('.knob').style.left = f + '%'; el.querySelector('b').textContent = settings.pcSize + '%'; };
  const set = v => { v = Math.round(Math.max(25, Math.min(100, v))); if (v !== settings.pcSize) { settings.pcSize = v; applyPcSize(); } show(); };
  let drag = null;
  trk.addEventListener('pointerdown', e => {
    const r = trk.getBoundingClientRect();
    set(25 + 75 * (e.clientX - r.left) / r.width);
    drag = { x: e.clientX, v: settings.pcSize, w: r.width };
    trk.setPointerCapture(e.pointerId); e.preventDefault();
  });
  trk.addEventListener('pointermove', e => { if (drag) set(drag.v + (e.clientX - drag.x) / drag.w * 75); });
  const end = () => { if (drag) { drag = null; saveSettings(); } };
  trk.addEventListener('pointerup', end); trk.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { e.preventDefault(); set(Math.round(settings.pcSize / 5) * 5 + (e.deltaY < 0 ? 5 : -5)); saveSettings(); }, { passive: false });
  // sit on the right end of the taskbar; the taskbar keeps that much room free
  const place = () => {
    const tb = document.querySelector('.taskbar'), z = parseFloat(document.querySelector('#pc .monitor').style.zoom) || 1;
    tb.style.paddingRight = (el.offsetWidth + 18) / z + 'px';
    const r = tb.getBoundingClientRect(); if (!r.width) return;
    el.style.left = r.right - el.offsetWidth - 8 + 'px'; el.style.top = r.top + (r.height - el.offsetHeight) / 2 + 'px';
  };
  show();
  return { show, set, place };
})();
applyPcSize();
function openSettings(from) { settingsBack = from; renderSettings(); showScreen('scSettings'); }
{ const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Settings'; b.onclick = () => openSettings('scPause'); $('btnQuitTitle').before(b); }

// ---- module API (see cooking.js) ----
window.POGEY = {
  hooks, box, prism, quad, thing, things, env, MIRROR, BATH, walkable, settings, begin, showScreen, renderTitle, lockPointer,
  get started() { return started; }, GLOW, sunState, daylight, toast, money, addMoney, save, updateHUD, GAME_MIN_PER_SEC, internetOn, clockStr, dayOf,
  casinoLobby() { casinoView = 'lobby'; renderCasino(); },
  get casinoView() { return casinoView; },
  casinoAddGame(g) { CASINO_GAMES.splice(CASINO_GAMES.findIndex(x => x.soon), 0, g); }, // {id, icon, name, desc, grad, render(body)}
  solids, ROOM, withXF, intoGeometry, setFurniture, advance, closePC, openPC, get hovered() { return hovered; }, get locked() { return locked; },
  get S() { return S; }, get P() { return P; }, get time() { return S ? S.t : 0; },
  get active() { return active(); },
  get view() { return lastView; }, POWER, get powerCut() { return !!(S && S.power && S.power.cut); },
  addKwh(k) { if (S && S.power && !S.power.cut) S.power.kwh += k; }, payBill, renderBills, titlePose, get paused() { return paused || sleeping; }, get titleMode() { return titleMode; }, get pcOpen() { return pcOpen; },
  setBurnerGlow(c) { burnerGlow = c; },
  openModal() { modalOpen = true; document.exitPointerLock && document.exitPointerLock(); },
  closeModal() { modalOpen = false; if (started && !S.evicted) lockPointer(); },
  pcAddApp(id, icon, label, gradient, onOpen) {
    const ic = document.createElement('div');
    ic.className = 'icon'; ic.innerHTML = `<div class="ico" style="background:${gradient}">${icon}</div>${label}`;
    $('desk').insertBefore(ic, $('iconLogoff'));
    const tb = document.createElement('button'); tb.textContent = `${icon} ${label.split(' ')[0]}`;
    document.querySelector('.taskbar').insertBefore(tb, $('tbClock'));
    const win = document.createElement('div'); win.className = 'win'; win.id = 'win_' + id;
    win.innerHTML = `<div class="bar">${icon} ${label} <button class="x">✕</button></div><div class="body"></div>`;
    document.querySelector('.screen-area').insertBefore(win, document.querySelector('.taskbar'));
    win.querySelector('.x').onclick = hideWins;
    const open = () => { if (atTable) { confirmLeaveTable(); return; } onOpen(win.querySelector('.body')); openWin(win.id); };
    ic.onclick = open; tb.onclick = open;
    return { body: win.querySelector('.body'), refresh: () => { if (win.classList.contains('show')) onOpen(win.querySelector('.body')); } };
  },
};

// test hooks
window.__pogey = {
  get S() { return S; }, P, things, interact, advance, openPC, closePC, startTable, renderCasino,
  look(x, z, yaw, pitch) { Object.assign(P, { x, z, yaw, pitch }); },
  forceLock(v) { locked = v; paused = !v; showScreen(null); },
  TITLE_SHOT, titleScene, cloud, newCode, normCode, localProfiles,
  get hovered() { return hovered; },
};
})();
