// Updated 2026-10-09: Cannon Crash release.
// Pogey Life — a small 2D rigid-body physics engine (used by Cannon Crash).
// Convex polygons and circles; SAT + edge clipping for contacts; sequential impulses with warm starting
// (the Box2D-lite approach), restitution, friction, sleeping, and impact events for damage.
// Units are metres and seconds, y points DOWN (screen space), gravity is +y.
(() => {
'use strict';

function polyMass(vs, density) { // area + moment of inertia about the centroid (verts are centroid-relative)
  let area = 0, I = 0;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length], cr = Math.abs(a[0] * b[1] - a[1] * b[0]);
    area += cr / 2; I += cr * (a[0] * a[0] + a[0] * b[0] + b[0] * b[0] + a[1] * a[1] + a[1] * b[1] + b[1] * b[1]) / 12;
  }
  return { m: area * density, I: I * density, area };
}
function centre(vs) { // centroid of a polygon, and the verts moved so it's the origin
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < vs.length; i++) { const a = vs[i], b = vs[(i + 1) % vs.length], c = a[0] * b[1] - b[0] * a[1]; A += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  return { c: [cx, cy], vs: vs.map(v => [v[0] - cx, v[1] - cy]) };
}

function World(opts = {}) {
  this.g = opts.gravity ?? 9.8;
  this.iterations = opts.iterations ?? 8;
  this.substeps = opts.substeps ?? 4; // small steps keep tall stacks from creeping over
  this.bodies = []; this.arbs = new Map(); this.events = []; this.nextId = 1;
}
// o: { shape: 'poly' | 'circle', verts (centroid-relative) | r, x, y, a, density, friction, restitution, static, ...anything else }
World.prototype.add = function (o) {
  const b = Object.assign({ a: 0, vx: 0, vy: 0, w: 0, density: 1, friction: 0.6, restitution: 0.1, sleeping: false, sleepT: 0 }, o);
  b.id = this.nextId++;
  if (b.shape === 'poly') {
    b.lv = b.verts; const n = b.lv.length;
    b.ln = b.lv.map((v, i) => { const u = b.lv[(i + 1) % n], dx = u[0] - v[0], dy = u[1] - v[1], L = Math.hypot(dx, dy); let nx = dy / L, ny = -dx / L;
      const mx = (v[0] + u[0]) / 2, my = (v[1] + u[1]) / 2; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } return [nx, ny]; });
    b.wv = b.lv.map(() => [0, 0]); b.wn = b.ln.map(() => [0, 0]);
    const mp = polyMass(b.lv, b.density); b.mass = mp.m; b.inertia = mp.I; b.area = mp.area;
    b.rad = Math.max(...b.lv.map(v => Math.hypot(v[0], v[1])));
  } else {
    b.area = Math.PI * b.r * b.r; b.mass = b.area * b.density; b.inertia = 0.5 * b.mass * b.r * b.r; b.rad = b.r;
  }
  b.invM = b.static ? 0 : 1 / b.mass; b.invI = b.static ? 0 : 1 / b.inertia;
  updateWorld(b);
  this.bodies.push(b);
  return b;
};
World.prototype.remove = function (b) {
  const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1);
  for (const [k, a] of this.arbs) if (a.A === b || a.B === b) this.arbs.delete(k);
  b.removed = true;
};
World.prototype.wakeAll = function () { for (const b of this.bodies) { b.sleeping = false; b.sleepT = 0; } };
World.prototype.wakeNear = function (x, y, r) { for (const b of this.bodies) if (!b.static && Math.hypot(b.x - x, b.y - y) < r + b.rad) { b.sleeping = false; b.sleepT = 0; } };

function updateWorld(b) {
  if (b.shape !== 'poly') return;
  const c = Math.cos(b.a), s = Math.sin(b.a);
  for (let i = 0; i < b.lv.length; i++) {
    const v = b.lv[i], n = b.ln[i];
    b.wv[i][0] = b.x + c * v[0] - s * v[1]; b.wv[i][1] = b.y + s * v[0] + c * v[1];
    b.wn[i][0] = c * n[0] - s * n[1]; b.wn[i][1] = s * n[0] + c * n[1];
  }
}

// ---------------------------------------------------------------------
// Narrow phase. Every contact: { x, y, nx, ny (from A to B), depth, id }
// ---------------------------------------------------------------------
function maxSep(A, B) {
  let best = -Infinity, bi = 0;
  for (let i = 0; i < A.wv.length; i++) {
    const n = A.wn[i], v = A.wv[i]; let s = Infinity;
    for (const p of B.wv) { const d = n[0] * (p[0] - v[0]) + n[1] * (p[1] - v[1]); if (d < s) s = d; }
    if (s > best) { best = s; bi = i; }
  }
  return [best, bi];
}
function polyPoly(A, B) {
  const [sa, ea] = maxSep(A, B); if (sa > 0) return null;
  const [sb, eb] = maxSep(B, A); if (sb > 0) return null;
  let R, I, e, flip;
  if (sb > sa * 0.98 + 0.001) { R = B; I = A; e = eb; flip = true; } else { R = A; I = B; e = ea; flip = false; }
  const n = R.wn[e], v1 = R.wv[e], v2 = R.wv[(e + 1) % R.wv.length];
  let ie = 0, md = Infinity;
  for (let i = 0; i < I.wn.length; i++) { const d = I.wn[i][0] * n[0] + I.wn[i][1] * n[1]; if (d < md) { md = d; ie = i; } }
  let pts = [[I.wv[ie][0], I.wv[ie][1], 0], [I.wv[(ie + 1) % I.wv.length][0], I.wv[(ie + 1) % I.wv.length][1], 1]];
  const tx = v2[0] - v1[0], ty = v2[1] - v1[1], tl = Math.hypot(tx, ty), t = [tx / tl, ty / tl];
  pts = clip(pts, -t[0], -t[1], -(t[0] * v1[0] + t[1] * v1[1])); if (pts.length < 2) return null;
  pts = clip(pts, t[0], t[1], t[0] * v2[0] + t[1] * v2[1]); if (pts.length < 2) return null;
  const out = [], nx = flip ? -n[0] : n[0], ny = flip ? -n[1] : n[1];
  for (const p of pts) {
    const sep = n[0] * (p[0] - v1[0]) + n[1] * (p[1] - v1[1]);
    if (sep <= 0.002) out.push({ x: p[0] - n[0] * sep * 0.5, y: p[1] - n[1] * sep * 0.5, nx, ny, depth: -sep, id: (flip ? 1000 : 0) + e * 100 + ie * 10 + p[2] });
  }
  return out.length ? out : null;
}
function clip(pts, nx, ny, off) { // keep the part of segment pts with n·p <= off
  const out = [], d0 = nx * pts[0][0] + ny * pts[0][1] - off, d1 = nx * pts[1][0] + ny * pts[1][1] - off;
  if (d0 <= 0) out.push(pts[0]); if (d1 <= 0) out.push(pts[1]);
  if (d0 * d1 < 0) { const k = d0 / (d0 - d1); out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * k, pts[0][1] + (pts[1][1] - pts[0][1]) * k, d0 > 0 ? pts[0][2] : pts[1][2]]); }
  return out;
}
function circlePoly(C, P) { // normal from P to C
  let best = -Infinity, bi = 0;
  for (let i = 0; i < P.wv.length; i++) { const n = P.wn[i], v = P.wv[i], s = n[0] * (C.x - v[0]) + n[1] * (C.y - v[1]); if (s > C.r) return null; if (s > best) { best = s; bi = i; } }
  const v1 = P.wv[bi], v2 = P.wv[(bi + 1) % P.wv.length];
  if (best < 1e-6) { const n = P.wn[bi]; return [{ x: C.x - n[0] * C.r, y: C.y - n[1] * C.r, nx: n[0], ny: n[1], depth: C.r - best, id: bi }]; }
  const ex = v2[0] - v1[0], ey = v2[1] - v1[1], L2 = ex * ex + ey * ey;
  const k = Math.max(0, Math.min(1, ((C.x - v1[0]) * ex + (C.y - v1[1]) * ey) / L2)), qx = v1[0] + ex * k, qy = v1[1] + ey * k;
  const dx = C.x - qx, dy = C.y - qy, d = Math.hypot(dx, dy);
  if (d > C.r || d < 1e-9) return null;
  return [{ x: qx, y: qy, nx: dx / d, ny: dy / d, depth: C.r - d, id: bi + (k <= 0 ? 50 : k >= 1 ? 60 : 0) }];
}
function circleCircle(A, B) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy); if (d > A.r + B.r || d < 1e-9) return null;
  const nx = dx / d, ny = dy / d; return [{ x: A.x + nx * A.r, y: A.y + ny * A.r, nx, ny, depth: A.r + B.r - d, id: 0 }];
}
function collide(A, B) {
  if (A.shape === 'poly' && B.shape === 'poly') return polyPoly(A, B);
  if (A.shape === 'circle' && B.shape === 'circle') return circleCircle(A, B);
  if (A.shape === 'circle') { const c = circlePoly(A, B); if (c) for (const k of c) { k.nx = -k.nx; k.ny = -k.ny; } return c; } // circlePoly gives poly→circle; we want A→B
  return circlePoly(B, A);
}

// ---------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------
const SLOP = 0.008, BAUM = 0.2;
World.prototype.step = function (dt) { for (let k = 0; k < this.substeps; k++) this.substep(dt / this.substeps); };
World.prototype.substep = function (dt) {
  const bs = this.bodies, g = this.g;
  for (const b of bs) if (!b.static && !b.sleeping) { b.vy += g * dt; b.vx *= 0.9995; b.vy *= 0.9995; b.w *= 0.995; }
  // contacts (bodies are kept in id order, so A.id < B.id and the key is stable)
  const seen = new Set();
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A = bs[i], B = bs[j];
    if ((A.static || A.sleeping) && (B.static || B.sleeping)) continue;
    if (A.ghost || B.ghost) continue;
    const dx = A.x - B.x, dy = A.y - B.y, rr = A.rad + B.rad + 0.05; if (dx * dx + dy * dy > rr * rr) continue;
    const cs = collide(A, B); if (!cs) continue;
    const key = A.id + ',' + B.id; let arb = this.arbs.get(key);
    if (!arb) { arb = { A, B, cs: [] }; this.arbs.set(key, arb); }
    for (const c of cs) { const o = arb.cs.find(q => q.id === c.id); if (o) { c.Pn = o.Pn; c.Pt = o.Pt; c.fresh = false; } else { c.Pn = 0; c.Pt = 0; c.fresh = arb.cs.length === 0; } }
    arb.cs = cs; seen.add(key);
  }
  for (const k of this.arbs.keys()) if (!seen.has(k)) this.arbs.delete(k);
  // wake sleepers that something moving runs into
  for (const arb of this.arbs.values()) {
    const { A, B } = arb, sp = b => b.vx * b.vx + b.vy * b.vy + b.w * b.w * 0.25;
    if (A.sleeping && !B.static && !B.sleeping && sp(B) > 0.15) { A.sleeping = false; A.sleepT = 0; }
    if (B.sleeping && !A.static && !A.sleeping && sp(A) > 0.15) { B.sleeping = false; B.sleepT = 0; }
  }
  const im = b => b.sleeping ? 0 : b.invM, ii = b => b.sleeping ? 0 : b.invI;
  // pre-step: effective masses, bias, bounce, impact events, warm start
  for (const arb of this.arbs.values()) {
    const { A, B } = arb, mu = Math.sqrt(A.friction * B.friction), e = Math.max(A.restitution, B.restitution);
    for (const c of arb.cs) {
      const rax = c.x - A.x, ray = c.y - A.y, rbx = c.x - B.x, rby = c.y - B.y; c.rax = rax; c.ray = ray; c.rbx = rbx; c.rby = rby;
      const rnA = rax * c.ny - ray * c.nx, rnB = rbx * c.ny - rby * c.nx;
      c.mN = 1 / (im(A) + im(B) + ii(A) * rnA * rnA + ii(B) * rnB * rnB);
      const tx = -c.ny, ty = c.nx, rtA = rax * ty - ray * tx, rtB = rbx * ty - rby * tx;
      c.mT = 1 / (im(A) + im(B) + ii(A) * rtA * rtA + ii(B) * rtB * rtB);
      c.mu = mu;
      const dvx = B.vx - B.w * rby - (A.vx - A.w * ray), dvy = B.vy + B.w * rbx - (A.vy + A.w * rax), vn = dvx * c.nx + dvy * c.ny;
      c.bias = BAUM / dt * Math.max(0, c.depth - SLOP) + (vn < -1 ? -e * vn : 0);
      if (c.fresh && vn < -1.2) { const mStar = 1 / ((A.static ? 0 : A.invM) + (B.static ? 0 : B.invM)); this.events.push({ A, B, x: c.x, y: c.y, vn: -vn, energy: 0.5 * mStar * vn * vn }); }
      // warm start
      const px = c.nx * c.Pn + tx * c.Pt, py = c.ny * c.Pn + ty * c.Pt;
      A.vx -= px * im(A); A.vy -= py * im(A); A.w -= (rax * py - ray * px) * ii(A);
      B.vx += px * im(B); B.vy += py * im(B); B.w += (rbx * py - rby * px) * ii(B);
    }
  }
  // impulses (alternating the order each pass so no side of a stack is favoured)
  const list = [...this.arbs.values()];
  for (let it = 0; it < this.iterations; it++) {
    for (let q = 0; q < list.length; q++) {
      const arb = list[it % 2 ? list.length - 1 - q : q];
      const { A, B } = arb, iA = im(A), iB = im(B), jA = ii(A), jB = ii(B);
      for (const c of arb.cs) {
        let dvx = B.vx - B.w * c.rby - (A.vx - A.w * c.ray), dvy = B.vy + B.w * c.rbx - (A.vy + A.w * c.rax);
        const vn = dvx * c.nx + dvy * c.ny;
        let dPn = c.mN * (-vn + c.bias); const P0 = c.Pn; c.Pn = Math.max(P0 + dPn, 0); dPn = c.Pn - P0;
        let px = c.nx * dPn, py = c.ny * dPn;
        A.vx -= px * iA; A.vy -= py * iA; A.w -= (c.rax * py - c.ray * px) * jA;
        B.vx += px * iB; B.vy += py * iB; B.w += (c.rbx * py - c.rby * px) * jB;
        dvx = B.vx - B.w * c.rby - (A.vx - A.w * c.ray); dvy = B.vy + B.w * c.rbx - (A.vy + A.w * c.rax);
        const tx = -c.ny, ty = c.nx, vt = dvx * tx + dvy * ty, maxF = c.mu * c.Pn;
        let dPt = -c.mT * vt; const T0 = c.Pt; c.Pt = Math.max(-maxF, Math.min(maxF, T0 + dPt)); dPt = c.Pt - T0;
        px = tx * dPt; py = ty * dPt;
        A.vx -= px * iA; A.vy -= py * iA; A.w -= (c.rax * py - c.ray * px) * jA;
        B.vx += px * iB; B.vy += py * iB; B.w += (c.rbx * py - c.rby * px) * jB;
      }
    }
  }
  // integrate + sleep
  for (const b of bs) {
    if (b.static || b.sleeping) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; updateWorld(b);
    if (b.vx * b.vx + b.vy * b.vy < 0.006 && Math.abs(b.w) < 0.06) { b.sleepT += dt; if (b.sleepT > 0.5 && this.canSleep !== false) { b.sleeping = true; b.vx = b.vy = b.w = 0; } }
    else b.sleepT = 0;
  }
};
// bodies currently touching body b (and the contact normal, pointing away from b)
World.prototype.touching = function (b) {
  const out = [];
  for (const a of this.arbs.values()) { if (a.A === b) out.push({ other: a.B, nx: a.cs[0].nx, ny: a.cs[0].ny }); else if (a.B === b) out.push({ other: a.A, nx: -a.cs[0].nx, ny: -a.cs[0].ny }); }
  return out;
};

window.Physics2D = { World, centre, polyMass };
})();
