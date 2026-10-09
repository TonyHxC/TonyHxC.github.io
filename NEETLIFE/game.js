// NEETLIFE — a tiny first-person life sim.
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
function quad(p0, p1, p2, p3, n, c, g) {
  for (const p of [p0, p1, p2, p0, p2, p3]) { G.pos.push(p[0], p[1], p[2]); G.nor.push(n[0], n[1], n[2]); G.col.push(c[0], c[1], c[2]); G.glow.push(g); }
}
// axis-aligned box from min corner (x,y,z) and size (w,h,d). `skip` lists faces to omit.
function box(x, y, z, w, h, d, color, glow = 0, skip = '') {
  const c = typeof color === 'string' ? hex(color) : color;
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
  const c = typeof color === 'string' ? hex(color) : color;
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
const SETTINGS_KEY = 'neetlife_settings_v1';
const settings = Object.assign({ mirror: 'full' }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
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

  // ---- bed (west wall) ----
  box(0.02, 0, 0.15, 1.0, 0.3, 2.05, '#5b4636');          // frame
  box(0.05, 0.3, 0.2, 0.94, 0.18, 1.98, '#ece8e0');       // mattress
  box(0.04, 0.46, 0.75, 0.96, 0.08, 1.45, '#3d5a8a');     // blanket
  box(0.04, 0.42, 0.7, 0.96, 0.06, 0.1, '#344d78');       // blanket fold
  box(0.18, 0.48, 0.25, 0.66, 0.12, 0.38, '#f6f3ec');     // pillow
  box(0.02, 0, 0.0, 1.0, 1.0, 0.15, '#4a382b');           // headboard
  solid(0, 0, 1.05, 2.2);
  thing('bed', 'Sleep', [0, 0, 0.15, 1.05, 0.7, 2.2]);
  // nightstand + lamp
  box(1.08, 0, 0.05, 0.42, 0.5, 0.4, '#6b5240');
  box(1.1, 0.5, 0.07, 0.38, 0.02, 0.36, '#7a5e4a');
  prism(1.29, 0.52, 0.25, 0.08, 0.02, '#333', 8);
  prism(1.29, 0.54, 0.25, 0.015, 0.28, '#333', 6);
  prism(1.29, 0.8, 0.25, 0.12, 0.16, '#f2d9a6', 8, 4); // lampshade glows
  solid(1.05, 0, 1.52, 0.47);

  // ---- desk + PC (north wall, right of window) ----
  const dx = 2.7, dw = 1.5;
  box(dx, 0.72, 0.02, dw, 0.04, 0.7, '#3b3a44');           // top
  box(dx + 0.03, 0, 0.06, 0.05, 0.72, 0.05, '#222'); box(dx + dw - 0.08, 0, 0.06, 0.05, 0.72, 0.05, '#222');
  box(dx + 0.03, 0, 0.62, 0.05, 0.72, 0.05, '#222'); box(dx + dw - 0.08, 0, 0.62, 0.05, 0.72, 0.05, '#222');
  // monitor
  box(dx + 0.68, 0.76, 0.18, 0.14, 0.02, 0.12, '#1d1d22');
  box(dx + 0.72, 0.78, 0.22, 0.06, 0.18, 0.04, '#1d1d22');
  box(dx + 0.33, 0.9, 0.16, 0.84, 0.5, 0.04, '#141418');
  box(dx + 0.36, 0.93, 0.2, 0.78, 0.44, 0.005, '#ffffff', 2);      // screen
  // tower
  box(dx + dw - 0.3, 0.76, 0.12, 0.2, 0.42, 0.42, '#1f1f26');
  box(dx + dw - 0.29, 1.0, 0.54, 0.02, 0.1, 0.005, '#7cf5ff', 2);
  // keyboard + mouse + clutter
  box(dx + 0.45, 0.76, 0.42, 0.6, 0.02, 0.18, '#2a2a30');
  box(dx + 1.15, 0.76, 0.46, 0.06, 0.02, 0.1, '#2a2a30');
  prism(dx + 0.15, 0.76, 0.45, 0.033, 0.12, '#3ad66b', 8);   // energy drinks
  prism(dx + 0.24, 0.76, 0.52, 0.033, 0.12, '#3ad66b', 8);
  prism(dx + 0.1, 0.76, 0.58, 0.033, 0.12, '#d63a3a', 8);
  box(dx + 0.05, 0.76, 0.1, 0.28, 0.06, 0.22, '#c9a36b');    // pizza box
  solid(dx, 0, dx + dw, 0.72);
  thing('pc', 'Use computer', [dx + 0.3, 0.72, 0, dx + 1.2, 1.45, 0.72]);
  // chair
  const cx = dx + 0.75, cz = 1.15;
  prism(cx, 0, cz, 0.28, 0.04, '#222', 5);
  prism(cx, 0.04, cz, 0.03, 0.4, '#333', 6);
  box(cx - 0.25, 0.44, cz - 0.25, 0.5, 0.08, 0.5, '#b03030');
  box(cx - 0.24, 0.52, cz + 0.2, 0.48, 0.65, 0.07, '#b03030');
  solid(cx - 0.28, cz - 0.28, cx + 0.28, cz + 0.3);

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
  // trash bin
  prism(4.75, 0, 3.65, 0.16, 0.45, '#3a3a40', 8);
  prism(4.75, 0.45, 3.65, 0.17, 0.03, '#2c2c32', 8);
  solid(4.58, 3.48, 4.92, 3.82);
  thing('trash', 'Trash', [4.56, 0, 3.46, 4.94, 0.6, 3.84]);

  // ---- living bits ----
  box(1.6, 0.0, 1.5, 1.9, 0.01, 1.4, '#5a3a5e');                 // rug
  box(1.68, 0.01, 1.58, 1.74, 0.005, 1.24, '#6b4870');
  // beanbag (stacked boxes) + game console
  box(1.7, 0, 2.55, 0.7, 0.3, 0.7, '#2f6b5a'); box(1.78, 0.3, 2.62, 0.54, 0.16, 0.55, '#327562'); box(1.74, 0.3, 3.05, 0.62, 0.35, 0.2, '#2f6b5a');
  solid(1.7, 2.55, 2.4, 3.25);
  // pizza boxes + laundry pile
  box(3.7, 0, 2.9, 0.42, 0.05, 0.42, '#c9a36b'); box(3.72, 0.05, 2.92, 0.42, 0.05, 0.42, '#bf9860'); box(3.69, 0.1, 2.88, 0.42, 0.05, 0.42, '#c9a36b');
  box(0.2, 0, 2.6, 0.5, 0.18, 0.4, '#6d7a8c'); box(0.3, 0.18, 2.66, 0.32, 0.12, 0.28, '#8c5a5a');
  // poster above bed
  box(0.0, 1.25, 0.6, 0.02, 0.8, 0.6, '#1d1730');
  box(0.02, 1.32, 0.66, 0.01, 0.66, 0.48, '#b98cff');
  box(0.03, 1.5, 0.76, 0.01, 0.3, 0.28, '#7cf5ff');
  // ceiling light
  prism(2.5, ROOM.h - 0.05, 2.0, 0.3, 0.05, '#ddd', 10);
  prism(2.5, ROOM.h - 0.11, 2.0, 0.25, 0.06, '#fff6dc', 10, 3);
  // light switch
  box(1.55, 1.15, ROOM.d - 0.02, 0.08, 0.12, 0.02, '#f4f0e6');
  thing('switch', () => S.lightOn ? 'Turn the lights off' : 'Turn the lights on', [1.47, 1.0, ROOM.d - 0.14, 1.71, 1.4, ROOM.d]);
  thing('lamp', () => S.lampOn === false ? 'Turn the lamp on' : 'Turn the lamp off', [1.15, 0.5, 0.1, 1.43, 0.98, 0.4]);
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
const env = { cloud: 0, rain: 0, flash: 0, power: 1, glow: {}, selfVisible: false };
// Glow groups: 1 sky, 2 monitor, 3 ceiling bulb, 4 lamp, 5 burner, 6 sun/moon, 7 stars, 8 city lights, 9 clouds, 10 rain, 11 lightning
const GLOW = { SKY: 1, MONITOR: 2, CEIL: 3, LAMP: 4, BURNER: 5, SUN: 6, STARS: 7, CITY: 8, CLOUD: 9, RAIN: 10, BOLT: 11, BATHCEIL: 12 };
// module hooks (cooking.js etc. register into these)
const hooks = { interact: [], update: [], draw: [], drawSelf: [], key: [], hud: [], fresh: [], speed: [], camera: [], newLife: [] };
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
uniform vec3 uLP[4]; uniform vec3 uLC[4];
uniform vec3 uGlow[14];
uniform vec4 uClip; uniform float uTint;
uniform vec3 uWinPos; uniform vec3 uWinCol;
uniform vec3 uSunDir; uniform vec3 uSunCol;
// window opening on the north wall (z = 0): x 1.25..2.35, y 1.0..2.0, mullions at the centre lines
const vec4 WIN = vec4(1.25, 2.35, 1.0, 2.0);
void main() {
  if (dot(vPos, uClip.xyz) + uClip.w < 0.0) discard;
  if (vGlow > 0.5) {
    vec3 g = vec3(1.0);
    for (int i = 1; i < 14; i++) { if (abs(vGlow - float(i)) < 0.5) g = uGlow[i]; }
    gl_FragColor = vec4(g * mix(vec3(1.0), vCol, 0.25) * uTint, 1.0); return;
  }
  vec3 n = normalize(vNor);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  // fake ambient occlusion: darker near floor and in corners
  float ao = 0.72 + 0.28 * smoothstep(0.0, 0.9, vPos.y);
  // the bathroom (z > 4.08) has no window: dim ambient, and lights mostly stay in their own room
  float inBath = step(4.08, vPos.z);
  vec3 lit = amb * ao * mix(1.0, 0.55, inBath);
  for (int i = 0; i < 4; i++) {
    vec3 L = uLP[i] - vPos; float d = length(L); L /= d;
    float wrap = max(dot(n, L) * 0.8 + 0.2, 0.0);
    float room = i < 3 ? mix(1.0, 0.1, inBath) : mix(0.06, 1.0, inBath);
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
let staticBufs, dynBufs, selfBufs, mirrorBufs, bathBufs, doorFillBufs;
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

function render() {
  const h = (S.t / 60) % 24, day = daylight(h), sky = skyAt(h);
  gl.clearColor(0.02, 0.02, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  const bob = Math.sin(P.bob) * 0.025;
  const cam = getCamera();
  const eye = cam || { x: P.x, y: P.y + bob, z: P.z, yaw: P.yaw, pitch: P.pitch };
  const vp = M4.mul(M4.persp(1.2, aspect, 0.03, 50), M4.view(eye.x, eye.y, eye.z, eye.yaw, eye.pitch));
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
  const ceilOn = S.lightOn ? env.power : 0, lampOn = S.lampOn === false ? 0 : env.power;
  const mon = pcOpen ? [0.45, 0.6, 1.0] : [0.25, 0.35, 0.7];
  const bathOn = S.bathLight === false ? 0 : env.power;
  gl.uniform3fv(uni.uLP, [2.5, 2.35, 2.0, 1.29, 0.95, 0.25, 3.45, 1.15, 0.45, 3.15, 2.4, 5.05]);
  gl.uniform3fv(uni.uLC, [
    1.25 * ceilOn, 1.12 * ceilOn, 0.92 * ceilOn,
    0.55 * lampOn, 0.42 * lampOn, 0.25 * lampOn,
    mon[0] * 0.5 * env.power, mon[1] * 0.5 * env.power, mon[2] * 0.5 * env.power,
    1.9 * bathOn, 1.85 * bathOn, 1.75 * bathOn,
  ]);
  gl.uniform3fv(uni.uWinPos, [1.8, 1.5, -0.4]);
  gl.uniform3fv(uni.uWinCol, skyC.map((v, i) => v * (0.25 + 1.4 * dayK) + fl * 1.6));
  // the sun: comes in through the window as a patch of light when it's up and not hidden by cloud
  const sun = sunState(h);
  gl.uniform3fv(uni.uSunDir, sun.dir);
  gl.uniform3fv(uni.uSunCol, sun.col.map(v => v * sun.k * Math.pow(1 - cl, 2.2)));
  const glow = new Array(42).fill(0);
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
  if (SELF.pos.length) upload(selfBufs, SELF);
  // partial = only the bathroom and yourself (the cheap reflection)
  const drawWorld = (withSelf, partial) => {
    if (!partial) { bindBufs(staticBufs); gl.drawArrays(gl.TRIANGLES, 0, vertCount); }
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
  if (e.code === 'Escape' && !locked && active()) { paused = true; showScreen('scPause'); }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && active()) e.preventDefault();
  if (e.code === 'Escape' && pcOpen) { e.preventDefault(); closePC(); }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => { if (!locked && active()) { dragging = true; dragMoved = 0; } });
window.addEventListener('mouseup', () => { dragging = false; });
let dragMoved = 0;
document.addEventListener('mousemove', e => {
  if (!locked && !(dragging && active())) return;
  if (!locked) dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
  const k = locked ? 0.0022 : 0.005;
  P.yaw -= e.movementX * k; P.pitch -= e.movementY * k;
  P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
});
canvas.addEventListener('click', () => {
  if (!started || pcOpen || modalOpen || sleeping) return;
  if (!locked && !lockFailed) { lockPointer(); return; }
  if (!locked && dragMoved > 6) return; // that was a look-drag, not a click
  if (hovered && active()) interact(hovered.id);
});
function lockPointer() {
  paused = false; showScreen(null);
  if (lockFailed || !canvas.requestPointerLock) { useFallback(); return; }
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(useFallback); } catch (e) { useFallback(); }
}
function useFallback() {
  if (!lockFailed) toast('Mouse capture isn\'t available here, so hold the mouse button and drag to look around. WASD still moves.', '', 7000);
  lockFailed = true; paused = false; showScreen(null);
  $('crosshair').style.display = '';
}
document.addEventListener('pointerlockerror', useFallback);
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { paused = false; showScreen(null); }
  else if (started && !pcOpen && !modalOpen && !sleeping && !S.evicted && !lockFailed) { paused = true; showScreen('scPause'); }
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
};
const BETS = [10, 25, 50, 100, 250, 500];
// cash-out multiplier after clearing N floors (index = floors cleared). Beyond the table: ×1.25 per floor.
const CASH_TABLE = [0, 1.1, 1.3, 1.6, 2, 2.8, 3.3, 4, 5, 6.2, 8];
const SAVE_KEY = 'neetlife_save_v1';

let S = null; // game state
function freshState() {
  return {
    t: 8 * 60,             // minutes since Day 1 00:00
    money: START_MONEY,
    lightOn: true, lampOn: true, bathLight: true, bathDoor: false,
    bills: Object.entries(BILL_DEFS).map(([id, d]) => ({ id, due: d.firstDue, paid: false, late: false })),
    tx: [{ t: 8 * 60, desc: 'Opening balance', amt: START_MONEY }],
    stats: { runs: 0, wins: 0, busts: 0, best: 0, wagered: 0, won: 0 },
    pos: null, evicted: false, lastDay: 1,
  };
}
function save() { if (!S || !started) return; try { S.pos = { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch }; localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { const v = localStorage.getItem(SAVE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

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
function billCost(b) { return BILL_DEFS[b.id].amount + (b.late ? BILL_DEFS[b.id].late : 0); }

function addMoney(amt, desc) {
  S.money += amt;
  S.tx.unshift({ t: S.t, desc, amt });
  if (S.tx.length > 60) S.tx.length = 60;
  updateHUD(); save();
}

// ---- time ----
function advance(mins) {
  const before = dayOf(S.t);
  S.t += mins;
  const after = dayOf(S.t);
  for (let d = before + 1; d <= after && !S.evicted; d++) newDay(d);
}
function newDay(d) {
  S.lastDay = d;
  for (const b of S.bills) {
    const def = BILL_DEFS[b.id];
    if (b.paid) continue;
    if (d > b.due && !b.late) {
      b.late = true;
      toast(`${def.name} is overdue. +${money(def.late)} late fee.` + (b.id === 'internet' ? ' Your internet has been cut off.' : ` Pay within ${def.grace} days or you're out.`), 'bad', 7000);
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
  if (b.paid || S.money < cost) return;
  addMoney(-cost, `${BILL_DEFS[id].name} payment`);
  const def = BILL_DEFS[id];
  const wasLate = b.late;
  b.paid = true;
  // queue next cycle immediately so there's always one bill per type
  Object.assign(b, { due: b.due + def.every, paid: false, late: false });
  toast(`${def.name} paid.` + (id === 'internet' && wasLate ? ' Internet restored.' : ''), 'good');
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
  const warn = S.bills.filter(b => !b.paid && b.due - dayOf(S.t) <= 1).map(b => `${BILL_DEFS[b.id].name} ${dueLabel(b.due)}`);
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
  hideWins(); updateHUD();
}
function closePC(force) {
  if (atTable && !force) { confirmLeaveTable(); return; }
  if (atTable) endTable();
  pcOpen = false; $('pc').classList.remove('show');
  if (!force && started && !S.evicted) lockPointer();
}
function hideWins() { for (const w of document.querySelectorAll('.win')) w.classList.remove('show'); }
function openWin(id) { hideWins(); $(id).classList.add('show'); }
for (const ic of document.querySelectorAll('.icon[data-app], .taskbar [data-app]')) ic.onclick = () => {
  if (atTable) { confirmLeaveTable(); return; }
  const a = ic.dataset.app;
  if (a === 'casino') { renderCasino(); openWin('winCasino'); }
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
  $('billsBody').innerHTML = `<h3>Bills</h3><p>Rent and internet come every week. Late internet gets cut off; rent more than ${BILL_DEFS.rent.grace} days late gets you evicted.</p>
    <table><tr><th>Bill</th><th>Status</th><th class="num">Amount</th><th></th></tr>
    ${S.bills.map(b => {
      const def = BILL_DEFS[b.id], cost = billCost(b), d = b.due - dayOf(S.t);
      const pill = b.late ? `<span class="pill late">${dueLabel(b.due)}</span>` : d <= 1 ? `<span class="pill due">${dueLabel(b.due)}</span>` : `<span class="pill ok">${dueLabel(b.due)}</span>`;
      return `<tr><td><b>${def.name}</b></td><td>${pill}</td><td class="num">${money(cost)}${b.late ? ` <small>(incl. ${money(def.late)} late fee)</small>` : ''}</td>
        <td class="num"><button class="wbtn" data-pay="${b.id}" ${S.money < cost ? 'disabled' : ''}>Pay</button></td></tr>`;
    }).join('')}</table>`;
  for (const b of document.querySelectorAll('[data-pay]')) b.onclick = () => payBill(b.dataset.pay);
}
const cashMult = n => n <= 0 ? 0 : n < CASH_TABLE.length ? CASH_TABLE[n] : CASH_TABLE[CASH_TABLE.length - 1] * Math.pow(1.25, n - CASH_TABLE.length + 1);
let chosenBet = 25;
function renderCasino() {
  const body = $('casinoBody');
  if (!internetOn()) {
    body.innerHTML = `<div class="offline"><div class="big">📡✕</div><h3>No internet connection</h3><p>Your internet was cut off for an unpaid bill. Pay it in the Bills app to get back online.</p><button class="wbtn" id="goBills">Open Bills</button></div>`;
    $('goBills').onclick = () => { renderBills(); openWin('winBills'); };
    return;
  }
  if (chosenBet > S.money) chosenBet = BETS.filter(b => b <= S.money).pop() || BETS[0];
  body.innerHTML = `<div class="casino"><h3>Plinko Casino</h3>
    <p>Place a bet and play a run. After each floor you clear you can <b>cash out</b> at the multiplier below, or pick an upgrade and push on. Bust before cashing out and the house keeps your bet.</p>
    <div class="bets">${BETS.map(b => `<button data-bet="${b}" class="${b === chosenBet ? 'on' : ''}" ${b > S.money ? 'disabled' : ''}>$${b}</button>`).join('')}</div>
    <div class="ladder">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<div class="rung">Floor ${n}${n % 5 === 0 ? ' ☠' : ''}<b>×${cashMult(n)}</b>${money(chosenBet * cashMult(n))}</div>`).join('')}</div>
    <p style="font-size:12px">☠ boss floor. Past floor 10 each floor adds another ×1.25.</p>
    <button class="wbtn gold" id="btnPlaceBet" ${S.money < chosenBet ? 'disabled' : ''} style="font-size:16px;padding:12px 20px">Bet ${money(chosenBet)} and play</button>
    ${S.money < BETS[0] ? '<p class="neg">You can\'t afford the minimum bet.</p>' : ''}</div>`;
  for (const b of body.querySelectorAll('[data-bet]')) b.onclick = () => { chosenBet = +b.dataset.bet; renderCasino(); };
  $('btnPlaceBet').onclick = () => startTable(chosenBet);
}
function startTable(bet) {
  if (S.money < bet || !internetOn()) return;
  addMoney(-bet, `Plinko bet`);
  S.stats.runs++; S.stats.wagered += bet; save();
  tableBet = bet; atTable = true;
  $('tableBet').textContent = `Bet ${money(bet)}`;
  $('result').classList.remove('show');
  openWin('winTable');
  pendingStart = { type: 'neetStart', bet, table: CASH_TABLE };
  const fr = $('plinkoFrame');
  if (frameReady) sendStart(); else if (!fr.src) fr.src = '../Plinko/index.html?neet=1';
}
function sendStart() {
  if (!pendingStart) return;
  $('plinkoFrame').contentWindow.postMessage(Object.assign({ src: 'neetlife' }, pendingStart), '*');
  pendingStart = null;
  setTimeout(() => { try { $('plinkoFrame').contentWindow.focus(); } catch (e) {} }, 50);
}
function endTable() { atTable = false; tableBet = 0; }
window.addEventListener('message', e => {
  const fr = $('plinkoFrame');
  if (!fr || e.source !== fr.contentWindow) return;
  const d = e.data || {};
  if (d.src !== 'plinko') return;
  if (d.type === 'neetReady') { frameReady = true; sendStart(); }
  if (d.type === 'neetCashOut' && atTable) {
    const win = Math.round(tableBet * cashMult(d.cleared));
    addMoney(win, `Plinko cash-out (floor ${d.cleared})`);
    S.stats.wins++; S.stats.won += win; S.stats.best = Math.max(S.stats.best, win - tableBet);
    advance(15 * d.cleared); updateHUD(); save();
    showResult(true, win, d.cleared);
  }
  if (d.type === 'neetBust' && atTable) {
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
function confirmLeaveTable() {
  $('resultBox').innerHTML = `<h3>Leave the table?</h3><p>Walking away mid-run forfeits your ${money(tableBet)} bet.</p>
    <button class="wbtn" id="btnStay">Keep playing</button> <button class="wbtn" id="btnLeave" style="background:#c43a3a">Leave</button>`;
  $('result').classList.add('show');
  $('btnStay').onclick = () => $('result').classList.remove('show');
  $('btnLeave').onclick = () => {
    S.stats.busts++; endTable(); save();
    $('result').classList.remove('show');
    $('plinkoFrame').src = '../Plinko/index.html?neet=1'; frameReady = false; // reset the table
    renderCasino(); openWin('winCasino');
  };
}
$('btnForfeit').onclick = () => { if (atTable) confirmLeaveTable(); else { renderCasino(); openWin('winCasino'); } };

// =====================================================================
// Title / pause / boot
// =====================================================================
function renderTitle() {
  const saved = load();
  const box = $('titleBtns'); box.innerHTML = '';
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); };
  if (saved && !saved.evicted) mk(`Continue · Day ${dayOf(saved.t)} · ${money(saved.money)}`, '', () => begin(saved));
  mk(saved && !saved.evicted ? 'New life' : 'Start', saved && !saved.evicted ? 'ghost' : '', newLife);
  mk('Settings', 'ghost', () => openSettings('scTitle'));
}
function newLife() { if (hooks.newLife.length) { showScreen(null); hooks.newLife[0](); } else begin(null); }
function begin(saved) {
  S = saved || freshState();
  for (const fn of hooks.fresh) fn(S);
  if (S.pos) Object.assign(P, { x: S.pos.x, z: S.pos.z, yaw: S.pos.yaw, pitch: S.pos.pitch });
  else Object.assign(P, { x: 3.1, z: 2.2, yaw: 0.25, pitch: -0.08 });
  started = true; paused = false;
  showScreen(null); updateHUD(); save();
  lockPointer();
  if (!saved) setTimeout(() => toast('Your PC is on the desk. Rent is due Sunday.', '', 6000), 600);
}
$('btnResume').onclick = () => lockPointer();
$('btnQuitTitle').onclick = () => { save(); started = false; paused = true; renderTitle(); showScreen('scTitle'); };
$('btnNewLife').onclick = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} newLife(); };

let last = performance.now(), saveTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started && !paused && !sleeping && S && !S.evicted) {
    if (!pcOpen && !modalOpen) movePlayer(dt);
    advance(dt * GAME_MIN_PER_SEC);
    for (const fn of hooks.update) fn(dt);
    saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; save(); }
    updateHUD();
  }
  hovered = active() ? pick() : null;
  $('crosshair').classList.toggle('hot', !!hovered);
  const pr = $('prompt');
  if (hovered) { pr.style.display = 'block'; pr.innerHTML = `<kbd>E</kbd>${typeof hovered.prompt === 'function' ? hovered.prompt() : hovered.prompt}`; } else pr.style.display = 'none';
  if (S || !started) render();
  requestAnimationFrame(frame);
}

// boot
buildRoom();
if (!gl) { document.body.innerHTML = '<p style="padding:30px">Your browser doesn\'t support WebGL, which NEETLIFE needs.</p>'; return; }
initGL(); resize();
if (matchMedia('(pointer: coarse)').matches) $('mobileNote').style.display = '';
S = freshState(); // background state for the title screen render
for (const fn of hooks.fresh) fn(S);
renderTitle();
window.addEventListener('beforeunload', save);
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
    <b style="display:block;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin:16px 0 8px">Mirror reflections</b>
    ${MIRROR_OPTS.map(([v, l, d]) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:6px;
        background:${settings.mirror === v ? 'var(--panel2)' : 'transparent'};border:1px solid ${settings.mirror === v ? 'var(--accent)' : 'var(--line)'}">
        <input type="radio" name="mirrorOpt" value="${v}" ${settings.mirror === v ? 'checked' : ''} style="margin-top:3px;accent-color:#ffcf5a">
        <span><b>${l}</b><br><span style="color:var(--muted);font-size:13px">${d}</span></span></label>`).join('')}
    <div style="text-align:center;margin-top:14px"><button class="btn" id="btnSettingsBack">Back</button></div></div>`;
  settingsEl.querySelectorAll('input[name=mirrorOpt]').forEach(r => r.onchange = () => { settings.mirror = r.value; saveSettings(); renderSettings(); });
  $('btnSettingsBack').onclick = () => showScreen(settingsBack);
}
function openSettings(from) { settingsBack = from; renderSettings(); showScreen('scSettings'); }
{ const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Settings'; b.onclick = () => openSettings('scPause'); $('btnQuitTitle').before(b); }

// ---- module API (see cooking.js) ----
window.NEET = {
  hooks, box, prism, quad, thing, things, env, MIRROR, BATH, walkable, settings, begin, showScreen, renderTitle, lockPointer,
  get started() { return started; }, GLOW, sunState, daylight, toast, money, addMoney, save, updateHUD, GAME_MIN_PER_SEC,
  get S() { return S; }, get P() { return P; }, get time() { return S ? S.t : 0; },
  get active() { return active(); },
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
window.__neet = {
  get S() { return S; }, P, things, interact, advance, openPC, closePC, startTable, renderCasino,
  look(x, z, yaw, pitch) { Object.assign(P, { x, z, yaw, pitch }); },
  forceLock(v) { locked = v; paused = !v; showScreen(null); },
  get hovered() { return hovered; },
};
})();
