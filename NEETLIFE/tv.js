// Pogey Life — the TV plays YouTube. Press E on the TV for the remote: power, channels up / down, pause, skip ±10 s,
// next / previous video in playlists, add your own links, volume.
// The player is a normal YouTube embed laid over the 3D screen with a CSS perspective transform, so it sits on the
// TV as you walk around. It gets quieter the further away you are and pauses when the game is paused.
// Note: YouTube refuses to play inside a page opened straight from disk (file://): the browser sends no Referer and
// YouTube answers with "Error 153". Play from the website, or double-click NEETLIFE/play-local.bat to run a little
// local server. On file:// the TV shows a message saying so instead of YouTube's error.
(() => {
'use strict';
const N = window.POGEY;
if (!N || !N.furn) return;

// ---------------------------------------------------------------------
// Built-in channels. Paste YouTube links here: videos, Shorts, youtu.be links and playlists all work.
//   { name: 'Lofi radio', url: 'https://www.youtube.com/watch?v=...' },
// Players can also add their own links from the remote in-game (saved with their game).
// ---------------------------------------------------------------------
const TV_CHANNELS = [
];

// ---------------------------------------------------------------------
// YouTube links -> embed URLs
// ---------------------------------------------------------------------
function parseT(t) { // "90", "1m30s", "1h2m3s"
  if (/^\d+$/.test(t)) return +t;
  const m = String(t).match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function parseYT(raw) {
  const url = String(raw || '').trim(); if (!url) return null;
  let id = null, list = null, start = 0;
  if (/^[\w-]{11}$/.test(url)) id = url;
  else try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url), h = u.hostname.replace(/^(www|m|music)\./, '');
    let m;
    if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if ((m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/))) id = m[2];
      list = u.searchParams.get('list');
    } else return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start'); if (t) start = parseT(t);
  } catch (e) { return null; }
  if (id && !/^[\w-]{11}$/.test(id)) id = null;
  if (list && !/^[\w-]+$/.test(list)) list = null;
  if (id === 'videoseries') id = null;
  return id || list ? { id, list, start } : null;
}
function embedSrc(v) {
  const q = new URLSearchParams({ autoplay: 1, controls: 0, rel: 0, playsinline: 1, enablejsapi: 1, iv_load_policy: 3, disablekb: 1, fs: 0, modestbranding: 1 });
  if (/^https?:$/.test(location.protocol)) { q.set('origin', location.origin); q.set('widget_referrer', location.href.split('#')[0]); }
  if (v.list) q.set('list', v.list); else q.set('loop', 1), q.set('playlist', v.id);
  if (v.start) q.set('start', v.start);
  return `https://www.youtube.com/embed/${v.id || 'videoseries'}?${q}`;
}

// ---------------------------------------------------------------------
// State lives in S.furn: tvOn (existing), tvCh (url on air), tvChannels (player-added), tvVol (0..100)
// ---------------------------------------------------------------------
const F = () => N.S.furn;
const channels = () => [...TV_CHANNELS.map(c => ({ ...c, builtin: true })), ...(F().tvChannels || [])];
const current = () => { const f = F(); if (!f.tvOn) return null; const all = channels(); return all.find(c => c.url === f.tvCh) || null; };
const tvPiece = () => F().pieces.find(p => p.type === 'tv' && !N.furn.isMoving(p));
N.tvNow = () => { const c = current(); return c && tvPiece() ? `"${c.name}"` : null; };

// ---------------------------------------------------------------------
// The player: one iframe, transformed onto the TV's glass every frame
// ---------------------------------------------------------------------
const IW = 960, IH = 540;
const wrap = document.createElement('div');
wrap.id = 'tvVideo';
wrap.style.cssText = `position:fixed;left:0;top:0;width:${IW}px;height:${IH}px;transform-origin:0 0;pointer-events:none;visibility:hidden;background:#000;overflow:hidden`;
document.getElementById('gl').after(wrap); // just above the 3D canvas, under every bit of UI
let frame = null, frameSrc = '', showing = false;
N.tvShowing = () => showing;
function setSource(src) {
  if (src === frameSrc) return;
  frameSrc = src;
  if (frame) { frame.remove(); frame = null; }
  lastVol = -1; lastPlay = null; userPaused = false; yt = freshYT();
  if (!src) return;
  if (location.protocol === 'file:') { // YouTube would only show "Error 153" here: say what's actually wrong
    frame = document.createElement('div');
    frame.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:60px;box-sizing:border-box;background:#101018;color:#fff;font:700 34px system-ui,sans-serif';
    frame.innerHTML = '<div style="font-size:80px">📡</div><div>YouTube can\'t play when the game is opened as a file.</div><div style="font-size:26px;color:#aab;font-weight:600">Double-click <b style="color:#ffcf5a">play-local.bat</b> in the NEETLIFE folder, or play on the website.</div>';
    wrap.appendChild(frame); return;
  }
  frame = document.createElement('iframe');
  frame.width = IW; frame.height = IH; frame.title = 'TV';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.style.cssText = 'border:0;width:100%;height:100%;display:block;pointer-events:none';
  frame.src = src;
  frame.onload = () => { lastVol = -1; lastPlay = null; listen(); };
  wrap.appendChild(frame);
}
// what the player tells us (YouTube's iframe API over postMessage): time, length, title, playlist position
const freshYT = () => ({ got: false, t: 0, at: 0, state: -1, dur: 0, title: '', list: null, idx: -1, asked: 0 });
let yt = freshYT(), userPaused = false;
function listen() { yt.asked = performance.now(); try { frame && frame.contentWindow && frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) {} }
window.addEventListener('message', e => {
  if (!frame || !frame.contentWindow || e.source !== frame.contentWindow) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (er) { return; }
  const i = d && d.info; if (!i || typeof i !== 'object') return;
  yt.got = true;
  if (typeof i.currentTime === 'number') { yt.t = i.currentTime; yt.at = performance.now(); }
  if (typeof i.playerState === 'number') yt.state = i.playerState;
  if (i.duration) yt.dur = i.duration;
  if (i.videoData && i.videoData.title) yt.title = i.videoData.title;
  if (Array.isArray(i.playlist)) yt.list = i.playlist;
  if (typeof i.playlistIndex === 'number') yt.idx = i.playlistIndex;
});
const ytNow = () => yt.state === 1 ? yt.t + (performance.now() - yt.at) / 1000 : yt.t;
const isPlaylist = () => { const c = current(), v = c && parseYT(c.url); return !!(v && v.list) || (yt.list && yt.list.length > 1); };
function seek(dt) {
  if (!frame || !frame.contentWindow) return;
  const t = Math.max(0, Math.min(yt.dur ? yt.dur - 0.5 : 1e9, ytNow() + dt));
  cmd('seekTo', [t, true]); yt.t = t; yt.at = performance.now();
  flash(dt > 0 ? `+${dt} s` : `${dt} s`);
}
function togglePause() { if (!current()) return; userPaused = !userPaused; flash(userPaused ? 'Paused' : 'Playing'); }
function skipVideo(dir) { if (!isPlaylist()) return; cmd(dir > 0 ? 'nextVideo' : 'previousVideo'); userPaused = false; lastPlay = null; flash(dir > 0 ? 'Next video' : 'Previous video'); }
function channelStep(dir) {
  const all = channels(); if (!all.length) { N.toast('No channels yet. Add a YouTube link first.', '', 2200); return; }
  const cur = current(), i = cur ? all.findIndex(c => c.url === cur.url) : (dir > 0 ? -1 : 0);
  tune(all[(i + dir + all.length) % all.length]);
}
function cmd(func, args = []) { try { frame && frame.contentWindow && frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch (e) {} }

// projective transform that maps the IW x IH box onto 4 screen points (tl, tr, br, bl)
const adj = m => [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4], m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5], m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
const mm = (a, b) => { const c = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s; } return c; };
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function basis(p) { const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1], v = mv(adj(m), [p[3][0], p[3][1], 1]); return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]); }
function quadMatrix(dst) {
  const t = mm(basis([dst[0], dst[1], dst[3], dst[2]]), adj(basis([[0, 0], [IW, 0], [0, IH], [IW, IH]])));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}
function project(vp, x, y, z) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw < 0.05) return null;
  const c = document.getElementById('gl');
  return [(cx / cw + 1) / 2 * c.clientWidth, (1 - cy / cw) / 2 * c.clientHeight];
}
// is anything solid between the eye and the screen? (furniture boxes, and the wall to the bathroom)
function blocked(eye, pt, tv) {
  const d = [pt[0] - eye.x, pt[1] - eye.y, pt[2] - eye.z], o = [eye.x, eye.y, eye.z];
  const cz = 4.06; // wall between the rooms
  if ((o[2] - cz) * (pt[2] - cz) < 0) { const t = (cz - o[2]) / d[2], x = o[0] + d[0] * t, y = o[1] + d[1] * t; if (!N.S.bathDoor || x < 2.62 || x > 3.38 || y > 2.1) return true; }
  for (const p of F().pieces) {
    const def = N.furn.DEFS[p.type];
    if (p === tv || def.flat || def.wall || N.furn.isMoving(p) || (N.furn.sitting && N.furn.sitting.p === p)) continue;
    const R = N.furn.rect(p), y0 = p.y || 0, lo = [R[0], y0, R[1]], hi = [R[2], y0 + def.h * 0.85, R[3]];
    let t0 = 0, t1 = 0.97, ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; } continue; }
      let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

let lastVol = -1, lastPlay = null, volT = 0;
function tick() {
  requestAnimationFrame(tick);
  const S = N.S;
  const on = S && S.furn && N.started && !N.titleMode ? current() : null, tv = on && tvPiece();
  const v = tv ? parseYT(on.url) : null;
  setSource(v ? embedSrc(v) : '');
  showing = false;
  if (!frame) { wrap.style.visibility = 'hidden'; return; }
  // where the glass is
  const view = N.view, eye = view.eye, sc = N.furn.DEFS.tv.screen, y = tv.y || 0;
  const corner = (lx, ly) => { const [x, z] = N.furn.xfPt(tv, lx, sc[4]); return [x, y + ly, z]; };
  const W = [corner(sc[0], sc[3]), corner(sc[2], sc[3]), corner(sc[2], sc[1]), corner(sc[0], sc[1])];
  const mid = W.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
  if (view.vp && eye) {
    const [nx, nz] = (() => { const [ax, az] = N.furn.xfPt(tv, 0.7, 0), [bx, bz] = N.furn.xfPt(tv, 0.7, 1); return [bx - ax, bz - az]; })(); // which way the screen faces
    const facing = (eye.x - mid[0]) * nx + (eye.z - mid[2]) * nz > 0.02;
    const pts = facing ? W.map(p => project(view.vp, ...p)) : [];
    if (facing && pts.every(Boolean) && !blocked(eye, mid, tv)) {
      wrap.style.transform = quadMatrix(pts);
      showing = true;
    }
  }
  wrap.style.visibility = showing && !N.pcOpen ? 'visible' : 'hidden';
  if (frame.tagName === 'IFRAME' && !yt.got && performance.now() - yt.asked > 1500) listen(); // keep asking until the player answers
  if (open && performance.now() - stT > 250) status();
  // play / pause with the game (and the remote's pause button)
  const play = !N.paused && !userPaused;
  if (play !== lastPlay) { lastPlay = play; cmd(play ? 'playVideo' : 'pauseVideo'); }
  // volume: full next to it, fading across the room, muffled through the bathroom wall
  const now = performance.now();
  if (now - volT > 200 && eye) {
    volT = now;
    const d = Math.hypot(eye.x - mid[0], eye.z - mid[2]), muffled = eye.z > 4.06 && !S.bathDoor;
    const vol = Math.round((F().tvVol ?? 60) * Math.min(1, 1.8 / Math.max(1.8, d)) * (muffled ? 0.25 : 1));
    if (vol !== lastVol) { lastVol = vol; cmd('setVolume', [vol]); cmd('unMute'); }
  }
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------
// The remote
// ---------------------------------------------------------------------
const css = document.createElement('style');
css.textContent = `
  #tvRemote .flash.on { opacity:1; }
  #tvRemote { position:fixed; right:24px; top:50%; transform:translateY(-50%); z-index:25; width:min(360px, calc(100vw - 32px)); max-height:calc(100vh - 32px); overflow:auto;
    background:#15131d; color:#f1eee6; border:1px solid #34304a; border-radius:18px; padding:18px; box-shadow:0 20px 60px #000c; display:none; font:14px system-ui, sans-serif; }
  #tvRemote.show { display:block; }
  #tvRemote h3 { margin:0; font-size:18px; display:flex; align-items:center; gap:8px; }
  #tvRemote .top { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
  #tvRemote .pw { border:0; border-radius:99px; padding:8px 14px; font:800 13px system-ui; cursor:pointer; background:#2a2638; color:#f1eee6; }
  #tvRemote .pw.on { background:#3ad66b; color:#0d2414; }
  #tvRemote .lbl { font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#a39db8; margin:14px 0 6px; }
  #tvRemote .chs { display:flex; flex-direction:column; gap:6px; }
  #tvRemote .ch { display:flex; align-items:center; gap:8px; background:#221f2e; border:1px solid #34304a; border-radius:10px; padding:8px 10px; cursor:pointer; }
  #tvRemote .ch:hover { border-color:#ffcf5a88; }
  #tvRemote .ch.on { border-color:#ffcf5a; background:#2c2633; }
  #tvRemote .ch .n { flex:1; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #tvRemote .ch .num { font:800 12px ui-monospace, monospace; color:#ffcf5a; width:22px; }
  #tvRemote .ch .air { font-size:10px; font-weight:900; color:#ff5a5a; letter-spacing:1px; }
  #tvRemote .ch .x { border:0; background:none; color:#a39db8; cursor:pointer; font-size:15px; padding:0 2px; }
  #tvRemote .ch .x:hover { color:#ff6b6b; }
  #tvRemote .empty { color:#a39db8; font-size:13px; line-height:1.5; margin:0; }
  #tvRemote input[type=text] { width:100%; box-sizing:border-box; background:#0d0c14; color:#f1eee6; border:1px solid #34304a; border-radius:8px; padding:9px 10px; font:inherit; margin-bottom:6px; user-select:text; }
  #tvRemote input[type=text]:focus { outline:none; border-color:#ffcf5a; }
  #tvRemote .add { width:100%; border:0; border-radius:8px; padding:9px; font:800 14px system-ui; background:#ffcf5a; color:#17130a; cursor:pointer; }
  #tvRemote .err { color:#ff8a8a; font-size:12px; min-height:16px; margin-top:4px; }
  #tvRemote .vol { display:flex; align-items:center; gap:10px; } #tvRemote .vol input { flex:1; accent-color:#ffcf5a; } #tvRemote .vol b { width:36px; text-align:right; }
  #tvRemote .foot { display:flex; justify-content:space-between; align-items:center; margin-top:16px; color:#a39db8; font-size:12px; }
  #tvRemote .close { border:0; border-radius:10px; padding:9px 16px; font:800 14px system-ui; background:#2a2638; color:#f1eee6; cursor:pointer; }
  #tvRemote .now { background:#0d0c14; border:1px solid #34304a; border-radius:12px; padding:10px 12px; }
  #tvRemote .np { display:flex; justify-content:space-between; gap:10px; font-size:13px; } #tvRemote .np b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #tvRemote .np span { color:#a39db8; font:600 12px ui-monospace, monospace; white-space:nowrap; }
  #tvRemote .sub { color:#a39db8; font-size:11px; margin-top:2px; min-height:13px; }
  #tvRemote .bar { height:4px; background:#2a2638; border-radius:2px; margin:8px 0 10px; overflow:hidden; } #tvRemote .bar i { display:block; height:100%; width:0; background:#ff4d4d; }
  #tvRemote .tp { display:flex; gap:6px; justify-content:center; }
  #tvRemote .tp button, #tvRemote .chud button { border:0; border-radius:10px; background:#2a2638; color:#f1eee6; font:800 13px system-ui; padding:9px 0; cursor:pointer; flex:1; }
  #tvRemote .tp button:hover:not(:disabled), #tvRemote .chud button:hover { background:#3a3450; }
  #tvRemote .tp button:disabled { opacity:.3; cursor:default; }
  #tvRemote .tp button { display:flex; align-items:center; justify-content:center; gap:2px; } #tvRemote .tp svg { width:17px; height:17px; fill:currentColor; }
  #tvRemote .tp .pp { flex:1.4; background:#ffcf5a; color:#17130a; font-size:15px; } #tvRemote .tp .pp:hover { background:#ffd97a !important; }
  #tvRemote .chud { display:flex; align-items:center; gap:8px; margin-top:8px; } #tvRemote .chud b { font:800 13px ui-monospace, monospace; color:#ffcf5a; min-width:64px; text-align:center; }
  #tvRemote .flash { position:absolute; left:50%; top:12px; transform:translateX(-50%); background:#ffcf5a; color:#17130a; font:800 12px system-ui; padding:4px 10px; border-radius:99px; opacity:0; transition:opacity .3s; pointer-events:none; }
  #tvRemote .warn { background:#3a2020; border:1px solid #ff6b6b55; color:#ffb0b0; border-radius:8px; padding:8px 10px; font-size:12px; line-height:1.4; margin-bottom:10px; }`;
document.head.appendChild(css);
const el = document.createElement('div');
el.id = 'tvRemote';
document.body.appendChild(el);
let open = false;
function render() {
  const f = F(), all = channels(), cur = current();
  el.innerHTML = `<div class="top"><h3>📺 TV remote</h3><button class="pw ${f.tvOn ? 'on' : ''}" data-act="power">${f.tvOn ? '⏻ On' : '⏻ Off'}</button></div>
    <div class="flash" id="tvFlash"></div>
    ${f.tvOn && cur ? `<div class="now">
      <div class="np"><b id="tvNP">${esc(cur.name)}</b><span id="tvTime"></span></div>
      <div class="sub" id="tvSub"></div>
      <div class="bar"><i id="tvBar"></i></div>
      <div class="tp">
        <button data-act="prevv" title="Previous video (,)">${ICON.prev}</button>
        <button data-act="back" title="Back 10 seconds (←)">${ICON.back}10</button>
        <button data-act="pause" class="pp" id="tvPP" title="Pause / play (Space)">${ICON.pause}</button>
        <button data-act="fwd" title="Forward 10 seconds (→)">10${ICON.fwd}</button>
        <button data-act="nextv" title="Next video (.)">${ICON.next}</button>
      </div></div>` : ''}
    <div class="chud"><button data-act="chdn" title="Channel down (↓)">CH ▼</button><b>${cur ? 'CH ' + String(all.findIndex(c => c.url === cur.url) + 1).padStart(2, '0') : f.tvOn ? 'NO CH' : 'OFF'}</b><button data-act="chup" title="Channel up (↑)">CH ▲</button></div>
    ${location.protocol === 'file:' ? '<div class="warn">YouTube won\'t play when the game is opened as a file (that\'s the "Error 153"). Double-click <b>play-local.bat</b> in the NEETLIFE folder to start the game from a local server, or play on the website.</div>' : ''}
    <div class="lbl">Channels</div>
    ${all.length ? `<div class="chs">${all.map((c, i) => `<div class="ch ${cur && cur.url === c.url ? 'on' : ''}" data-ch="${i}">
        <span class="num">${String(i + 1).padStart(2, '0')}</span><span class="n" title="${esc(c.url)}">${esc(c.name)}</span>
        ${cur && cur.url === c.url ? '<span class="air">ON AIR</span>' : ''}${c.builtin ? '' : `<button class="x" data-del="${i}" title="Remove channel">✕</button>`}</div>`).join('')}</div>`
      : '<p class="empty">No channels yet. Paste a YouTube link below to add one.</p>'}
    <div class="lbl">Add a channel</div>
    <input type="text" id="tvUrl" placeholder="YouTube link (video, Short or playlist)" spellcheck="false">
    <input type="text" id="tvName" placeholder="Name (optional)" spellcheck="false">
    <button class="add" data-act="add">Add channel</button>
    <div class="err" id="tvErr"></div>
    <div class="lbl">Volume</div>
    <div class="vol"><span>🔈</span><input type="range" id="tvVol" min="0" max="100" step="5" value="${f.tvVol ?? 60}"><b id="tvVolV">${f.tvVol ?? 60}</b></div>
    <div class="foot"><span>Space pause · ←→ skip · ↑↓ channel · Esc close</span><button class="close" data-act="close">Close</button></div>`;
  el.querySelector('[data-act=power]').onclick = () => { power(!f.tvOn); };
  el.querySelector('[data-act=close]').onclick = close;
  const on = (a, fn) => { const b = el.querySelector(`[data-act=${a}]`); if (b) b.onclick = () => { fn(); b.blur(); }; };
  on('pause', togglePause); on('back', () => seek(-10)); on('fwd', () => seek(10)); on('prevv', () => skipVideo(-1)); on('nextv', () => skipVideo(1));
  on('chup', () => channelStep(1)); on('chdn', () => channelStep(-1));
  status();
  el.querySelector('[data-act=add]').onclick = add;
  el.querySelectorAll('[data-ch]').forEach(r => r.onclick = e => { if (e.target.closest('[data-del]')) return; tune(all[+r.dataset.ch]); });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = all[+b.dataset.del], list = f.tvChannels || []; const i = list.findIndex(x => x.url === c.url);
    if (i >= 0) list.splice(i, 1); if (f.tvCh === c.url) f.tvCh = null; N.save(); render();
  });
  const vol = el.querySelector('#tvVol');
  vol.oninput = () => { f.tvVol = +vol.value; el.querySelector('#tvVolV').textContent = vol.value; lastVol = -1; };
  vol.onchange = () => N.save();
  for (const id of ['tvUrl', 'tvName']) el.querySelector('#' + id).onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') add(); if (e.key === 'Escape') close(); };
}
// remote button icons (drawn, so they look the same in every font)
const ICON = {
  prev: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="2.6" height="14" rx="1"/><path d="M19 5.5v13L8.5 12z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><rect x="16.4" y="5" width="2.6" height="14" rx="1"/><path d="M5 5.5v13L15.5 12z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 6v12L3 12zM21 6v12l-9-6z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 6v12l9-6zM3 6v12l9-6z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>',
};
// the live bits of the remote (time, progress, title, pause icon), refreshed a few times a second
let stT = 0, flashT = 0;
const clock = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function status() {
  stT = performance.now();
  const np = el.querySelector('#tvNP'); if (!np) return;
  const cur = current(), t = ytNow();
  if (yt.title) np.textContent = yt.title; else if (cur) np.textContent = cur.name;
  np.title = np.textContent;
  el.querySelector('#tvTime').textContent = yt.dur ? `${clock(t)} / ${clock(yt.dur)}` : yt.got ? clock(t) : '';
  el.querySelector('#tvBar').style.width = yt.dur ? Math.min(100, t / yt.dur * 100) + '%' : '0';
  const pl = isPlaylist();
  el.querySelector('#tvSub').textContent = [cur && yt.title && yt.title !== cur.name ? cur.name : '', pl && yt.list && yt.idx >= 0 ? `Video ${yt.idx + 1} of ${yt.list.length}` : pl ? 'Playlist' : ''].filter(Boolean).join(' · ');
  const pp = el.querySelector('#tvPP'), want = userPaused ? 'play' : 'pause'; if (pp.dataset.icon !== want) { pp.dataset.icon = want; pp.innerHTML = ICON[want]; }
  for (const a of ['prevv', 'nextv']) el.querySelector(`[data-act=${a}]`).disabled = !pl;
}
function flash(msg) {
  const fl = el.querySelector('#tvFlash'); if (!fl) return;
  fl.textContent = msg; fl.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => fl.classList.remove('on'), 900);
  status();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function power(on) {
  const f = F(); f.tvOn = on; N.furn.thud(on ? 500 : 250);
  if (on && !current() && channels().length) f.tvCh = channels()[0].url;
  if (on && !f.pieces.some(q => q.type === 'couch')) N.toast('Get a couch from Nestly to really settle in.', '', 2400);
  N.save(); render();
}
function tune(c) { const f = F(); f.tvOn = true; f.tvCh = c.url; userPaused = false; N.furn.thud(440); N.save(); render(); }
async function add() {
  const url = el.querySelector('#tvUrl').value.trim(), nameIn = el.querySelector('#tvName').value.trim(), err = el.querySelector('#tvErr');
  const v = parseYT(url);
  if (!v) { err.textContent = "That doesn't look like a YouTube link."; return; }
  const f = F(); f.tvChannels = f.tvChannels || [];
  if (channels().some(c => { const o = parseYT(c.url); return o && o.id === v.id && o.list === v.list; })) { err.textContent = 'That one is already a channel.'; return; }
  const ch = { name: nameIn || (v.list && !v.id ? 'Playlist' : 'YouTube video'), url };
  f.tvChannels.push(ch); tune(ch);
  if (!nameIn) { // ask YouTube for the real title
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(v.id ? 'https://www.youtube.com/watch?v=' + v.id : 'https://www.youtube.com/playlist?list=' + v.list)}`);
      if (r.ok) { const j = await r.json(); if (j.title) { ch.name = j.title.slice(0, 80); N.save(); if (open) render(); } }
    } catch (e) {}
  }
}
function show(p) {
  if (open) return;
  open = true; N.openModal(); render(); el.classList.add('show');
}
function close() {
  if (!open) return;
  open = false; el.classList.remove('show'); N.closeModal();
}
N.tvRemote = show;
document.addEventListener('keydown', e => {
  if (!open) return;
  const typing = e.target && e.target.tagName === 'INPUT' && e.target.type === 'text';
  if (e.code === 'Escape' || (e.code === 'KeyE' && !typing)) { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (typing) return;
  const keys = { Space: togglePause, ArrowLeft: () => seek(-10), ArrowRight: () => seek(10), ArrowUp: () => channelStep(1), ArrowDown: () => channelStep(-1),
    PageUp: () => channelStep(1), PageDown: () => channelStep(-1), Comma: () => skipVideo(-1), Period: () => skipVideo(1) };
  if (keys[e.code]) { e.preventDefault(); e.stopPropagation(); keys[e.code](); return; }
  const n = e.key >= '1' && e.key <= '9' ? +e.key : e.key === '0' ? 10 : 0;
  if (n && channels()[n - 1]) tune(channels()[n - 1]);
}, true);
N.hooks.fresh.push(() => { if (open) close(); setSource(''); });

window.__tv = { parseYT, embedSrc, channels, current, get showing() { return showing; }, show, close, TV_CHANNELS, get yt() { return yt; }, get userPaused() { return userPaused; }, seek, togglePause, skipVideo, channelStep };
})();
