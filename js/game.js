// Sea of Thieves Fan Game: the world, the ships and the crew.
// Solo, this tab runs everything. In a crew, the host's tab runs the world
// (ghost ships, the Kraken, skulls, barrels and the crew's gold) and every
// player steers their own ship and decides when their own hull is hit.
(function () {
'use strict';
const $ = id => document.getElementById(id);
let rng = Math.random;
const rand = (a, b) => a + rng() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const wrapA = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLASHK = REDUCED ? 0.35 : 1;
// every crewmate builds the same islands from the voyage's seed
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function fail(msg) { const e = $('err'); e.hidden = false; e.textContent = msg; ['startBtn', 'hostBtn', 'joinOpenBtn'].forEach(id => { $(id).disabled = true; }); }
if (!window.THREE) { fail("The 3D engine didn't load. Keep the js folder next to index.html, or open dist/game.html instead."); return; }

let BEST = 0;
try { BEST = +localStorage.getItem('cursedTideBest') || 0; } catch (e) {}
function showBest() { $('bestNote').textContent = BEST > 0 ? `Play with headphones for the full fright. Your best haul so far: ${BEST} gold.` : 'Play with headphones for the full fright.'; }
showBest();

// ---------- renderer ----------
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance' }); }
catch (e) { fail("This browser couldn't start 3D graphics. On a Chromebook, open Settings, search for “hardware acceleration”, turn it on, then reload."); return; }
let DPR = Math.min(window.devicePixelRatio || 1, 1.25);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
const FOG_NIGHT = new THREE.Color(0x0a171b), FOG_KRAKEN = new THREE.Color(0x170a1a), FOG_DAWN = new THREE.Color(0xa58276), FOG_FLASH = new THREE.Color(0x90a5b5);
scene.background = FOG_NIGHT.clone();
scene.fog = new THREE.FogExp2(FOG_NIGHT.clone(), 0.021);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 700);
camera.position.set(-14, 9, -18);

const AMB_NIGHT = new THREE.Color(0x2f4650), AMB_DAWN = new THREE.Color(0x9a7468);
const ambient = new THREE.AmbientLight(AMB_NIGHT.clone(), 0.85); scene.add(ambient);
scene.add(new THREE.HemisphereLight(0x3d5a6c, 0x040607, 0.45));
const moonLight = new THREE.DirectionalLight(0xa6bed4, 0.5); moonLight.position.set(30, 50, 60); scene.add(moonLight);

// ---------- textures ----------
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
function blob(g, cx, cy, r, jag) { g.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = r * (1 - jag + Math.random() * jag * 2), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.fill(); }
function disc(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function sailTex(kind) {
  const ghost = kind === 'ghost';
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = ghost ? '#cfffe8' : '#463d34'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) { g.fillStyle = ghost ? `rgba(0,60,40,${rand(0.05, 0.22)})` : `rgba(10,6,3,${rand(0.08, 0.3)})`; blob(g, rand(0, w), rand(0, h), rand(6, 40), 0.3); }
    g.strokeStyle = ghost ? 'rgba(0,80,50,.35)' : 'rgba(0,0,0,.4)'; g.lineWidth = 2;
    for (let x = 28; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rand(-5, 5), h); g.stroke(); }
    if (kind === 'skull') {
      const cx = w / 2, cy = h * 0.4; g.fillStyle = '#d6ccb2';
      g.save(); g.translate(cx, cy + 30);
      for (const r of [0.62, -0.62]) { g.save(); g.rotate(r); g.fillRect(-74, -6, 148, 12); for (const s of [-1, 1]) { disc(g, s * 76, -7, 9); disc(g, s * 76, 7, 9); } g.restore(); }
      g.restore();
      disc(g, cx, cy, 36); g.fillRect(cx - 21, cy + 18, 42, 26);
      g.fillStyle = '#463d34'; disc(g, cx - 14, cy + 2, 10); disc(g, cx + 14, cy + 2, 10);
      g.beginPath(); g.moveTo(cx, cy + 13); g.lineTo(cx - 6, cy + 24); g.lineTo(cx + 6, cy + 24); g.closePath(); g.fill();
      for (let i = -1; i <= 1; i++) g.fillRect(cx + i * 11 - 1.5, cy + 32, 3, 12);
    }
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h - rand(2, ghost ? 70 : 26)); g.lineTo(w, h); g.closePath(); g.fill();
    for (let i = 0; i < (ghost ? 16 : 5); i++) blob(g, rand(14, w - 14), rand(14, h - 40), rand(3, ghost ? 22 : 9), 0.5);
    if (ghost) { g.lineWidth = 3; for (let i = 0; i < 6; i++) { const x = rand(20, w - 20); g.beginPath(); g.moveTo(x, h); g.lineTo(x + rand(-20, 20), h - rand(60, 160)); g.stroke(); } }
    g.globalCompositeOperation = 'source-over';
  });
}
const TEX = {
  glow: canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
  moon: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 38, 64, 64, 62); gr.addColorStop(0, 'rgba(232,236,226,1)'); gr.addColorStop(1, 'rgba(232,236,226,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(110,122,118,.4)'; for (let i = 0; i < 9; i++) blob(g, rand(36, 92), rand(36, 92), rand(4, 12), 0.3); }),
  sail: sailTex('plain'), skullSail: sailTex('skull'), ghostSail: sailTex('ghost'),
  wraith: canvasTex(256, 512, (g) => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 18);
    g.bezierCurveTo(175, 18, 196, 70, 192, 130); g.bezierCurveTo(225, 150, 238, 190, 236, 240); g.bezierCurveTo(240, 300, 250, 360, 246, 420);
    let x = 246; while (x > 14) { g.lineTo(x - 9, 470 + Math.random() * 40); x -= 18; g.lineTo(x, 452 + Math.random() * 30); }
    g.bezierCurveTo(6, 360, 16, 300, 20, 240); g.bezierCurveTo(18, 190, 31, 150, 64, 130); g.bezierCurveTo(60, 70, 81, 18, 128, 18); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(108, 112, 8, 4, 0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(148, 112, 8, 4, -0.3, 0, TAU); g.fill();
  }),
};
function glowSprite(color, scale, opacity, fog) {
  const m = new THREE.SpriteMaterial({ map: TEX.glow, color, transparent: true, opacity: opacity === undefined ? 1 : opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: fog !== false });
  const s = new THREE.Sprite(m); s.scale.set(scale, scale, 1); return s;
}

// ---------- ocean ----------
const WAVES = [[0.55, 0.15, 0.35, 1.05], [0.36, 0.26, 2.0, 1.55], [0.22, 0.43, -1.0, 2.05], [0.11, 0.78, 2.6, 2.9]]
  .map(([a, k, d, s]) => ({ a, kx: Math.sin(d) * k, kz: Math.cos(d) * k, s }));
let storm = 1;
function waveH(x, z, t) {
  let h = 0;
  for (let i = 0; i < 4; i++) { const w = WAVES[i]; h += w.a * Math.sin(x * w.kx + z * w.kz + t * w.s); }
  return h * storm;
}
const OS = 280, ON = 110, CELL = OS / ON;
const oceanGeo = new THREE.PlaneGeometry(OS, OS, ON, ON); oceanGeo.rotateX(-Math.PI / 2);
const oPos = oceanGeo.attributes.position, oCount = oPos.count;
const oBX = new Float32Array(oCount), oBZ = new Float32Array(oCount);
for (let i = 0; i < oCount; i++) { oBX[i] = oPos.getX(i); oBZ[i] = oPos.getZ(i); }
const oCol = new Float32Array(oCount * 3); oceanGeo.setAttribute('color', new THREE.BufferAttribute(oCol, 3));
const ocean = new THREE.Mesh(oceanGeo, new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x2a4a50, shininess: 28, flatShading: true }));
ocean.frustumCulled = false; scene.add(ocean);
const SEA = { deep: new THREE.Color(0x061417), crest: new THREE.Color(0x2b5b5e), inkDeep: new THREE.Color(0x0b0412), inkCrest: new THREE.Color(0x3c1a44), dawnDeep: new THREE.Color(0x1b2a33), dawnCrest: new THREE.Color(0x86727a) };
const cDeep = new THREE.Color(), cCrest = new THREE.Color();
function updateOcean(t, cx, cz) {
  const ox = Math.round(cx / CELL) * CELL, oz = Math.round(cz / CELL) * CELL;
  ocean.position.set(ox, 0, oz);
  cDeep.copy(SEA.deep).lerp(SEA.inkDeep, krakenMix).lerp(SEA.dawnDeep, S.dawn);
  cCrest.copy(SEA.crest).lerp(SEA.inkCrest, krakenMix).lerp(SEA.dawnCrest, S.dawn);
  const dr = cCrest.r - cDeep.r, dg = cCrest.g - cDeep.g, db = cCrest.b - cDeep.b;
  const arr = oPos.array, inv = 1 / storm;
  for (let i = 0; i < oCount; i++) {
    const h = waveH(oBX[i] + ox, oBZ[i] + oz, t);
    arr[i * 3 + 1] = h;
    let c = (h * inv + 1.2) / 2.4; c = c < 0 ? 0 : c > 1 ? 1 : c; c *= c;
    const j = i * 3; oCol[j] = cDeep.r + dr * c; oCol[j + 1] = cDeep.g + dg * c; oCol[j + 2] = cDeep.b + db * c;
  }
  oPos.needsUpdate = true; oceanGeo.attributes.color.needsUpdate = true;
}

// ---------- rain ----------
const RN = 800, rainPos = new Float32Array(RN * 6), rainD = new Float32Array(RN * 3);
for (let i = 0; i < RN; i++) { rainD[i * 3] = rand(-24, 24); rainD[i * 3 + 1] = rand(-4, 30); rainD[i * 3 + 2] = rand(-24, 24); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb3bb, transparent: true, opacity: 0.28 }));
rain.frustumCulled = false; scene.add(rain);
function updateRain(dt) {
  rain.position.copy(camera.position);
  for (let i = 0; i < RN; i++) {
    const k = i * 3; let y = rainD[k + 1] - 34 * dt;
    if (y < -4) { y += 34; rainD[k] = rand(-24, 24); rainD[k + 2] = rand(-24, 24); }
    rainD[k + 1] = y;
    const j = i * 6; rainPos[j] = rainD[k]; rainPos[j + 1] = y; rainPos[j + 2] = rainD[k + 2]; rainPos[j + 3] = rainD[k] + 0.25; rainPos[j + 4] = y + 1.1; rainPos[j + 5] = rainD[k + 2] + 0.1;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// ---------- particles ----------
const PN = 700, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), parts = [];
for (let i = 0; i < PN; i++) { pPos[i * 3 + 1] = -9999; parts.push({ life: 0 }); }
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.6, map: TEX.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
pts.frustumCulled = false; scene.add(pts);
let pI = 0;
function emit(x, y, z, n, o) {
  const sp = o.spread || 0.3;
  for (let k = 0; k < n; k++) {
    const p = parts[pI]; pI = (pI + 1) % PN;
    p.x = x + rand(-sp, sp); p.y = y + rand(-sp, sp); p.z = z + rand(-sp, sp);
    p.vx = rand(-1, 1) * o.spd + (o.dx || 0); p.vy = rand(0.2, 1) * o.up; p.vz = rand(-1, 1) * o.spd + (o.dz || 0);
    p.max = p.life = o.life * rand(0.6, 1); p.g = o.grav === undefined ? 9 : o.grav; p.c = o.col;
  }
}
function updateParts(dt) {
  for (let i = 0; i < PN; i++) {
    const p = parts[i], j = i * 3;
    if (p.life > 0) {
      p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = Math.max(0, p.life / p.max);
      pPos[j] = p.x; pPos[j + 1] = p.y; pPos[j + 2] = p.z; pCol[j] = p.c[0] * f; pCol[j + 1] = p.c[1] * f; pCol[j + 2] = p.c[2] * f;
    } else if (pPos[j + 1] !== -9999) { pPos[j + 1] = -9999; pCol[j] = pCol[j + 1] = pCol[j + 2] = 0; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
const FX = {
  splinter: { col: [0.55, 0.36, 0.2], spd: 5, up: 6, life: 1, grav: 14, spread: 1.2 },
  splash: { col: [0.45, 0.6, 0.66], spd: 2, up: 7, life: 0.9, grav: 16, spread: 0.6 },
  ghost: { col: [0.3, 1, 0.65], spd: 3, up: 4, life: 1.1, grav: 3, spread: 0.8 },
  fire: { col: [1, 0.55, 0.15], spd: 1.5, up: 1.5, life: 0.35, grav: 0 },
  smoke: { col: [0.22, 0.22, 0.24], spd: 1, up: 1.2, life: 1.4, grav: -1.2, spread: 0.5 },
  ichor: { col: [0.7, 0.15, 0.55], spd: 4, up: 4, life: 0.8, grav: 10 },
  gold: { col: [1, 0.78, 0.3], spd: 3, up: 6, life: 1, grav: 9 },
};

// ---------- ships ----------
function hullShape(sx, sz) {
  const s = new THREE.Shape();
  s.moveTo(-1.6 * sx, -5 * sz); s.lineTo(1.6 * sx, -5 * sz);
  s.quadraticCurveTo(2.15 * sx, -2 * sz, 2.05 * sx, 1.2 * sz);
  s.quadraticCurveTo(1.75 * sx, 4.2 * sz, 0, 6.3 * sz);
  s.quadraticCurveTo(-1.75 * sx, 4.2 * sz, -2.05 * sx, 1.2 * sz);
  s.quadraticCurveTo(-2.15 * sx, -2 * sz, -1.6 * sx, -5 * sz);
  return s;
}
function extrudeY(shape, depth, top) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 }); g.rotateX(Math.PI / 2); g.translate(0, top, 0); return g; }
const SG = {};
(function () {
  SG.lower = extrudeY(hullShape(1, 1), 1.9, 0.6);
  const bw = hullShape(1, 1); bw.holes.push(new THREE.Path(hullShape(0.86, 0.93).getPoints(5)));
  SG.bulwark = extrudeY(bw, 0.55, 1.15);
  SG.edges = new THREE.EdgesGeometry(SG.lower, 25);
  SG.castle = new THREE.BoxGeometry(3.1, 1.1, 2.3);
  SG.cyl = new THREE.CylinderGeometry(0.13, 0.2, 1, 6);
  SG.cannon = new THREE.CylinderGeometry(0.15, 0.2, 1.1, 6); SG.cannon.rotateZ(Math.PI / 2);
  SG.wheel = new THREE.TorusGeometry(0.45, 0.06, 4, 10);
  SG.lantern = new THREE.BoxGeometry(0.34, 0.48, 0.34);
  SG.post = new THREE.BoxGeometry(0.1, 1, 0.1);
  SG.flag = new THREE.PlaneGeometry(1.8, 1.1); SG.flag.translate(-0.9, 0, 0);
  SG.body = new THREE.CylinderGeometry(0.22, 0.32, 1.1, 6); SG.head = new THREE.SphereGeometry(0.24, 8, 6);
  SG.sails = {};
})();
function sailGeo(w, h) {
  const k = w + 'x' + h; if (SG.sails[k]) return SG.sails[k];
  const g = new THREE.PlaneGeometry(w, h, 6, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2); p.setZ(i, (1 - x * x) * (0.75 - 0.25 * y)); }
  g.translate(0, -h / 2, 0); g.computeVertexNormals();
  return (SG.sails[k] = g);
}
const PM = {
  hull: new THREE.MeshLambertMaterial({ color: 0x3a281c, side: THREE.DoubleSide }),
  deck: new THREE.MeshLambertMaterial({ color: 0x5e4733, side: THREE.DoubleSide }),
  dark: new THREE.MeshLambertMaterial({ color: 0x211812 }),
  iron: new THREE.MeshLambertMaterial({ color: 0x17191b }),
  sail: new THREE.MeshLambertMaterial({ map: TEX.sail, side: THREE.DoubleSide, alphaTest: 0.5 }),
  skullSail: new THREE.MeshLambertMaterial({ map: TEX.skullSail, side: THREE.DoubleSide, alphaTest: 0.5 }),
  flag: new THREE.MeshBasicMaterial({ color: 0x060606, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffb060 }),
};
// each crewmate's sails are tinted their colour, so friends are easy to spot
const CREW_HEX = ['#e4dbc4', '#6fb7ff', '#c58bff', '#ff8fc8'];
const CREW_X = [0, 14, -14, 28];
const sailTint = c => new THREE.Color(0xffffff).lerp(new THREE.Color(CREW_HEX[c] || CREW_HEX[0]), c ? 0.75 : 0);
function crewMats(c) {
  const m = Object.assign({}, PM, { sail: PM.sail.clone(), skullSail: PM.skullSail.clone() });
  m.sail.color.copy(sailTint(c)); m.skullSail.color.copy(sailTint(c));
  return m;
}
function ghostMats() {
  const base = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 };
  const mk = (M, o, b) => { const m = new M(Object.assign({}, base, o)); m.userData.base = b; return m; };
  const hull = mk(THREE.MeshBasicMaterial, { color: 0x1d9e70 }, 0.3);
  const sail = mk(THREE.MeshBasicMaterial, { color: 0x7affc8, map: TEX.ghostSail }, 0.5);
  const line = mk(THREE.LineBasicMaterial, { color: 0x9affd8 }, 0.75);
  const glow = mk(THREE.MeshBasicMaterial, { color: 0xb8ffe0 }, 0.9);
  return { hull, deck: hull, dark: hull, iron: hull, sail, skullSail: sail, flag: hull, glow, line, list: [hull, sail, line, glow] };
}
function buildShip(m, ghost) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  add(SG.lower, [m.deck, m.hull], 0, 0, 0);
  add(SG.bulwark, m.hull, 0, 0, 0);
  add(SG.castle, m.hull, 0, 1.15, -3.75);
  add(SG.cyl, m.dark, 0, 6.1, 0.6).scale.y = 11;
  add(SG.cyl, m.dark, 0, 4.6, 3.8).scale.y = 8;
  const sails = [];
  const addSail = (z, yTop, w, h, mat) => {
    const piv = new THREE.Group(); piv.position.set(0, yTop, z + 0.22); g.add(piv);
    const yard = new THREE.Mesh(SG.cyl, m.dark); yard.scale.set(0.55, w + 0.5, 0.55); yard.rotation.z = Math.PI / 2; piv.add(yard);
    piv.add(new THREE.Mesh(sailGeo(w, h), mat));
    sails.push(piv);
  };
  addSail(0.6, 10.7, 5.4, 4.4, m.skullSail);
  addSail(0.6, 6.2, 6.0, 3.6, m.sail);
  addSail(3.8, 8.1, 4.2, 3.4, m.sail);
  const flag = add(SG.flag, m.flag, 0, 12.0, 0.6); flag.rotation.y = -Math.PI / 2;
  add(SG.post, m.dark, 0, 2.2, -4.85);
  add(SG.lantern, m.glow, 0, 2.75, -4.85);
  const wheel = add(SG.wheel, m.dark, 0, 2.35, -2.9);
  add(SG.post, m.dark, 0, 1.95, -2.9).scale.y = 0.6;
  const cannons = [];
  for (const side of [1, -1]) for (const z of [-1.5, 0.3, 2.1]) { add(SG.cannon, m.iron, side * 1.98, 0.95, z); cannons.push({ side, local: new THREE.Vector3(side * 2.5, 0.95, z) }); }
  const crew = [];
  if (ghost) {
    g.add(new THREE.LineSegments(SG.edges, m.line));
    for (const [x, z] of [[0.8, 1.6], [-0.9, -0.8], [0.4, -2.0]]) {
      const c = new THREE.Group(); c.position.set(x, 1.15, z);
      const b = new THREE.Mesh(SG.body, m.hull); b.position.y = 0.55; const h = new THREE.Mesh(SG.head, m.glow); h.position.y = 1.3;
      c.add(b, h); g.add(c); crew.push(c);
    }
  }
  g.userData = { sails, cannons, flag, wheel, crew };
  return g;
}
function floatObj(grp, x, z, h, t, sink) {
  const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
  const hf = waveH(x + fx * 4, z + fz * 4, t), hb = waveH(x - fx * 4, z - fz * 4, t);
  const hl = waveH(x + lx * 1.8, z + lz * 1.8, t), hr = waveH(x - lx * 1.8, z - lz * 1.8, t);
  grp.position.set(x, (hf + hb + hl + hr) / 4 - sink, z);
  grp.rotation.set(Math.atan2(hb - hf, 8) * 0.8, h, Math.atan2(hl - hr, 3.6) * 0.6);
}
function nameLabel(text, css) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '56px "Pirata One", "IM Fell English", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 256, 50); g.fillStyle = css; g.fillText(text, 256, 50);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, fog: false }));
  s.scale.set(10, 1.9, 1); s.renderOrder = 10;
  return s;
}

// ---------- skulls, trees, islands ----------
const boneMat = new THREE.MeshLambertMaterial({ color: 0xcfc4a6, emissive: 0x1a2a20 });
const eyeGlowMat = new THREE.MeshBasicMaterial({ color: 0x7dffc4 });
const skullGeo = { cran: new THREE.SphereGeometry(0.7, 12, 9), jaw: new THREE.BoxGeometry(0.75, 0.32, 0.6), eye: new THREE.SphereGeometry(0.19, 8, 6) };
function makeSkull() {
  const s = new THREE.Group();
  const c = new THREE.Mesh(skullGeo.cran, boneMat); c.scale.set(1, 0.92, 1.08); s.add(c);
  const j = new THREE.Mesh(skullGeo.jaw, boneMat); j.position.set(0, -0.55, 0.22); s.add(j);
  for (const x of [-0.25, 0.25]) { const e = new THREE.Mesh(skullGeo.eye, eyeGlowMat); e.position.set(x, -0.02, 0.6); s.add(e); }
  return s;
}
const rockMat = new THREE.MeshPhongMaterial({ color: 0x2c312c, flatShading: true, shininess: 4 });
const sandMat = new THREE.MeshLambertMaterial({ color: 0x48443a });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x1b1714 });
const treeGeo = { trunk: new THREE.CylinderGeometry(0.1, 0.3, 1, 5), branch: new THREE.CylinderGeometry(0.03, 0.09, 1, 4), rock: new THREE.DodecahedronGeometry(1, 0) };
treeGeo.trunk.translate(0, 0.5, 0); treeGeo.branch.translate(0, 0.5, 0);
function deadTree() {
  const t = new THREE.Group(), h = rand(3, 6);
  const tr = new THREE.Mesh(treeGeo.trunk, woodMat); tr.scale.y = h; t.add(tr);
  for (let i = 0; i < 3; i++) {
    const piv = new THREE.Group(); piv.position.y = h * rand(0.45, 0.92); piv.rotation.y = rand(0, TAU);
    const b = new THREE.Mesh(treeGeo.branch, woodMat); b.scale.y = rand(1, 2.4); b.rotation.z = rand(0.6, 1.2); piv.add(b); t.add(piv);
  }
  t.rotation.set(rand(-0.18, 0.18), 0, rand(-0.18, 0.18));
  return t;
}
const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 80, 8, 1, true);
const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0), tmpV = new THREE.Vector3();
function groundY(mesh, x, z) { ray.set(tmpV.set(x, 200, z), DOWN); const hit = ray.intersectObject(mesh, false)[0]; return hit ? hit.point.y : 0; }
function noise3(x, y, z) { return Math.sin(x * 1.7 + z * 2.3) * 0.5 + Math.sin(z * 3.1 - y * 2.7 + x * 0.7) * 0.3 + Math.sin(x * 5.3 + y * 4.1 + z * 4.7) * 0.15; }
const islands = [];
function buildIsland(I) {
  const { r, skull } = I;
  const g = new THREE.Group(); I.geos = [];
  const geo = new THREE.IcosahedronGeometry(1, r > 9 ? 3 : 2), p = geo.attributes.position, seed = rand(0, 100);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + noise3(x * 2.2 + seed, y * 2.2, z * 2.2 - seed) * 0.2;
    x *= n * r; z *= n * r; y *= n * r * (skull ? 0.42 : 0.75); if (y < 0) y *= 0.25;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals(); I.geos.push(geo);
  const rock = new THREE.Mesh(geo, rockMat); rock.position.y = -0.6; g.add(rock);
  for (let k = 0; k < (skull ? 5 : 2); k++) { const a = rand(0, TAU), d = r * rand(0.82, 1.0), s = rand(0.8, 2.2); const rk = new THREE.Mesh(treeGeo.rock, rockMat); rk.position.set(Math.cos(a) * d, rand(-0.6, 0.2), Math.sin(a) * d); rk.scale.set(s, s * rand(0.6, 1.4), s); rk.rotation.set(rand(0, 3), rand(0, 3), 0); g.add(rk); }
  g.updateMatrixWorld(true);
  if (skull) {
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.12, 1.6, 18), sandMat); beach.position.y = -0.75; g.add(beach); I.geos.push(beach.geometry);
    for (let i = 0; i < Math.round(r / 2.5); i++) { const a = rand(0, TAU), d = r * rand(0.1, 0.6), x = Math.cos(a) * d, z = Math.sin(a) * d; const t = deadTree(); t.position.set(x, groundY(rock, x, z) - 0.2, z); g.add(t); }
    const a = rand(0, TAU), sx = Math.cos(a) * r * 0.78, sz = Math.sin(a) * r * 0.78, sy = groundY(rock, sx, sz);
    const shrine = new THREE.Group(); shrine.position.set(sx, sy, sz); shrine.rotation.y = Math.atan2(sx, sz); g.add(shrine);
    const pole = new THREE.Mesh(SG.cyl, woodMat); pole.scale.set(0.8, 3.2, 0.8); pole.position.y = 1.6; shrine.add(pole);
    const bar = new THREE.Mesh(SG.post, woodMat); bar.scale.set(16, 1.2, 1.2); bar.position.y = 2.5; shrine.add(bar);
    I.flames = [];
    for (const fx of [-1.5, 1.5]) {
      const tp = new THREE.Mesh(SG.cyl, woodMat); tp.scale.set(0.5, 2, 0.5); tp.position.set(fx, 1, 0.3); shrine.add(tp);
      const fl = glowSprite(0x5dffa8, 1.6, 0.9); fl.position.set(fx, 2.2, 0.3); shrine.add(fl); I.flames.push(fl);
    }
    const sk = makeSkull(); sk.position.y = 3.6; shrine.add(sk);
    const glow = glowSprite(0x6dffb8, 7, 0.5); glow.position.y = 3.6; shrine.add(glow);
    I.skullMesh = sk; I.glow = glow;
    I.sx = I.x + sx; I.sy = sy + 3.6; I.sz = I.z + sz;
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x5dffb0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
    beam.position.set(I.sx, I.sy + 40, I.sz); scene.add(beam); I.beam = beam;
  }
  I.col = r * 1.05 + (skull ? 4.5 : 4);
  g.position.set(I.x, 0, I.z); scene.add(g); I.grp = g;
}
function placeIslands(seed) {
  rng = seeded(seed);
  try {
    const spots = [{ x: rand(-25, 25), z: rand(92, 110), r: rand(12, 15), skull: true }];
    let tries = 0;
    while (spots.filter(s => s.skull).length < 5 && tries++ < 800) {
      const a = rand(0, TAU), d = rand(110, 270), x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (spots.every(s => Math.hypot(s.x - x, s.z - z) > 85)) spots.push({ x, z, r: rand(11, 17), skull: true });
    }
    while (spots.length < 10 && tries++ < 1600) {
      const a = rand(0, TAU), d = rand(45, 290), x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (spots.every(s => Math.hypot(s.x - x, s.z - z) > s.r + 40)) spots.push({ x, z, r: rand(4, 7), skull: false });
    }
    spots.forEach((s, i) => { s.idx = i; buildIsland(s); islands.push(s); });
  } finally { rng = Math.random; }
}

// ---------- sky, lightning, the thing in the storm ----------
const MOON_DIR = new THREE.Vector3(0.45, 0.17, 0.88).normalize();
const moonHalo = glowSprite(0xb9c8cc, 90, 0.28, false), moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.moon, color: 0xdfe6e2, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
moonDisc.scale.set(22, 22, 1); scene.add(moonHalo, moonDisc);
const sunGlow = glowSprite(0xffb27a, 160, 0, false); scene.add(sunGlow);
const BOLT_N = 22, boltPos = new Float32Array(BOLT_N * 6);
const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
const bolt = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xe6eeff, transparent: true, opacity: 0, fog: false }));
bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
const wraith = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.wraith, color: 0x000000, transparent: true, opacity: 0, fog: false, depthWrite: false }));
wraith.scale.set(23, 46, 1); wraith.visible = false; scene.add(wraith);
function makeBolt(x, z) {
  let px = x, py = 75, pz = z;
  for (let i = 0; i < BOLT_N; i++) { const nx = px + rand(-3.5, 3.5), ny = py - 75 / BOLT_N, nz = pz + rand(-3.5, 3.5); boltPos.set([px, py, pz, nx, ny, nz], i * 6); px = nx; py = ny; pz = nz; }
  boltGeo.attributes.position.needsUpdate = true;
}

// ---------- your ship ----------
const player = { x: 0, z: 0, h: 0, speed: 0, sink: 0 };
player.grp = buildShip(PM, false); scene.add(player.grp);
const lanternLight = new THREE.PointLight(0xff9440, 1.3, 16, 2); lanternLight.position.set(0, 3.6, -4.2); player.grp.add(lanternLight);
const lanternGlow = glowSprite(0xffa04a, 3.4, 0.85); lanternGlow.position.set(0, 2.75, -4.85); player.grp.add(lanternGlow);
const bilgeGeo = new THREE.ShapeGeometry(hullShape(0.84, 0.9), 5); bilgeGeo.rotateX(Math.PI / 2);
const bilge = new THREE.Mesh(bilgeGeo, new THREE.MeshLambertMaterial({ color: 0x123c44, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
bilge.visible = false; player.grp.add(bilge);
const cargo = [[-0.9, -4.3], [0.9, -4.3], [-0.9, -3.3], [0.9, -3.3], [0, -3.8], [0, -4.6]].map(([x, z]) => { const s = makeSkull(); s.scale.setScalar(0.32); s.position.set(x, 1.95, z); s.rotation.y = Math.PI; s.visible = false; player.grp.add(s); return s; });

// ---------- shot, kraken, loot, eyes ----------
const GRAV = 18, BALL_V = 36, GHOST_V = 30, COOL = 2, MAX_SPEED = 11, HAUL_R = 19;
const ballGeo = new THREE.SphereGeometry(0.28, 8, 6), ballMat = new THREE.MeshBasicMaterial({ color: 0x0d0d0d });
const emberMat = new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff8a3a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
const ghostShotMat = new THREE.SpriteMaterial({ map: TEX.glow, color: 0x6dffbf, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const TSEG = 15, SEG_LEN = 0.78;
const tentGeo = new THREE.SphereGeometry(1, 9, 7);
const tentMat = new THREE.MeshPhongMaterial({ color: 0x40162f, emissive: 0x14040c, specular: 0x3a2030, shininess: 30 });
const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 8); barrelGeo.rotateZ(Math.PI / 2);
const barrelMat = new THREE.MeshLambertMaterial({ color: 0x4a3524 });
const ghosts = [], balls = [], loot = [], eyes = [];
const kraken = { active: false, tg: null, tentacles: [], noReward: false, removed: new Set() };

// ---------- sound: everything is synthesized ----------
const Snd = {
  ac: null, on: true,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ac = new AC(); } catch (e) { return; }
    const ac = this.ac, sr = ac.sampleRate;
    this.master = ac.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(ac.destination);
    const buf = (secs, ch, fill) => { const b = ac.createBuffer(ch, Math.floor(sr * secs), sr); for (let c = 0; c < ch; c++) fill(b.getChannelData(c)); return b; };
    this.white = buf(2, 1, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = buf(4, 1, d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.verb = ac.createConvolver();
    this.verb.buffer = buf(3.2, 2, d => { for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.8); });
    const vg = ac.createGain(); vg.gain.value = 0.5; this.verb.connect(vg); vg.connect(this.master);
    this.ambience();
  },
  now() { return this.ac.currentTime; },
  src(b, loop) { const s = this.ac.createBufferSource(); s.buffer = b; s.loop = !!loop; return s; },
  filt(type, f, q) { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; },
  gain(v) { const g = this.ac.createGain(); g.gain.value = v; return g; },
  osc(type, f, t) { const o = this.ac.createOscillator(); o.type = type; o.frequency.value = f; if (t !== undefined) o.frequency.setValueAtTime(f, t); return o; },
  out(node, pan, wet) {
    let n = node;
    if (this.ac.createStereoPanner) { const p = this.ac.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); n.connect(p); n = p; }
    n.connect(this.master);
    if (wet > 0) { const s = this.gain(wet); n.connect(s); s.connect(this.verb); }
  },
  env(g, t0, a, peak, d) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); },
  ambience() {
    const t = this.now();
    const sea = this.src(this.brown, true), sl = this.filt('lowpass', 380), sg = this.gain(0.42);
    const lfo = this.osc('sine', 0.11), lg = this.gain(0.2); lfo.connect(lg); lg.connect(sg.gain);
    sea.connect(sl); sl.connect(sg); this.out(sg, 0, 0.05); sea.start(t); lfo.start(t);
    const rn = this.src(this.white, true), rh = this.filt('highpass', 3000), rg = this.gain(0.035);
    rn.connect(rh); rh.connect(rg); this.out(rg, 0, 0); rn.start(t, 0.3); this.rainG = rg;
    const wn = this.src(this.white, true), wb = this.filt('bandpass', 520, 5), wg = this.gain(0.09);
    const wl = this.osc('sine', 0.07), wlg = this.gain(260); wl.connect(wlg); wlg.connect(wb.frequency);
    wn.connect(wb); wb.connect(wg); this.out(wg, 0, 0.2); wn.start(t, 1.1); wl.start(t);
    const dl = this.filt('lowpass', 170, 2), dg = this.gain(0.05);
    for (const f of [41.2, 41.7, 61.9]) { const o = this.osc('sawtooth', f); o.connect(dl); o.start(t); }
    dl.connect(dg); this.out(dg, 0, 0.3); this.droneG = dg;
    const hg = this.gain(0.008);
    for (const f of [622.3, 659.3]) { const o = this.osc('sine', f); o.connect(hg); o.start(t); }
    const tl = this.osc('sine', 0.3), tlg = this.gain(0.006); tl.connect(tlg); tlg.connect(hg.gain); tl.start(t);
    this.out(hg, 0, 0.8); this.highG = hg;
  },
  setMood(danger, rainAmt) {
    if (!this.ac) return; const t = this.now();
    this.droneG.gain.setTargetAtTime(0.045 + 0.12 * danger, t, 0.8);
    this.highG.gain.setTargetAtTime(0.008 + 0.02 * danger, t, 1);
    this.rainG.gain.setTargetAtTime(0.035 * rainAmt, t, 1);
  },
  mute(on) { this.on = on; if (this.ac) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.now(), 0.05); },
  cannon(pan, vol, wet) {
    if (!this.ac) return; const t = this.now();
    const n = this.src(this.white, true), f = this.filt('lowpass', 1400, 0.7), g = this.gain(0);
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(140, t + 0.7);
    n.connect(f); f.connect(g); this.env(g, t, 0.005, 0.9 * vol, 0.8); this.out(g, pan, wet || 0.35); n.start(t, Math.random()); n.stop(t + 1);
    const o = this.osc('sine', 90, t), og = this.gain(0); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    o.connect(og); this.env(og, t, 0.005, 0.9 * vol, 0.45); this.out(og, pan, 0.1); o.start(t); o.stop(t + 0.6);
  },
  thunder(vol, pan) {
    if (!this.ac) return; const t = this.now();
    const n = this.src(this.brown, true), f = this.filt('lowpass', 900), g = this.gain(0);
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.06); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.5);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    n.connect(f); f.connect(g); this.out(g, pan, 0.5); n.start(t, Math.random() * 2); n.stop(t + 4);
  },
  crack(pan, vol) {
    if (!this.ac) return; const t = this.now();
    for (const [f, d, v] of [[2200, 0.12, 0.7], [650, 0.3, 0.6]]) { const n = this.src(this.white, true), b = this.filt('bandpass', f, 1.2), g = this.gain(0); n.connect(b); b.connect(g); this.env(g, t, 0.003, v * vol, d); this.out(g, pan, 0.25); n.start(t, Math.random()); n.stop(t + d + 0.1); }
  },
  splash(pan, vol) {
    if (!this.ac) return; const t = this.now();
    const n = this.src(this.white, true), b = this.filt('bandpass', 1800, 0.8), g = this.gain(0);
    b.frequency.setValueAtTime(1800, t); b.frequency.exponentialRampToValueAtTime(400, t + 0.5); n.connect(b); b.connect(g); this.env(g, t, 0.02, vol, 0.55); this.out(g, pan, 0.2); n.start(t, Math.random()); n.stop(t + 0.7);
  },
  bell(pan, vol) {
    if (!this.ac) return;
    for (let k = 0; k < 3; k++) { const t = this.now() + k * 1.7; for (const [r, v, d] of [[1, 1, 4], [2.01, 0.5, 3], [2.76, 0.35, 2.4], [5.4, 0.15, 1.2]]) { const o = this.osc('sine', 196 * r), g = this.gain(0); o.connect(g); this.env(g, t, 0.004, v * vol, d); this.out(g, pan, 0.8); o.start(t); o.stop(t + d + 0.1); } }
  },
  wail(pan, vol) {
    if (!this.ac) return; const t = this.now(), g = this.gain(0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    for (const det of [0, 7]) {
      const o = this.osc('sine', 330 + det); o.frequency.setValueAtTime(330 + det, t); o.frequency.linearRampToValueAtTime(560 + det, t + 1.0); o.frequency.linearRampToValueAtTime(240 + det, t + 3.2);
      const v = this.osc('sine', 5.5), vg = this.gain(14); v.connect(vg); vg.connect(o.frequency); o.connect(g); o.start(t); v.start(t); o.stop(t + 3.3); v.stop(t + 3.3);
    }
    this.out(g, pan, 0.9);
  },
  whisper(pan, vol) {
    if (!this.ac) return; const t = this.now(), dur = 1.8;
    const n = this.src(this.white, true), b1 = this.filt('bandpass', 2600, 7), b2 = this.filt('bandpass', 1300, 5), g = this.gain(0);
    const curve = new Float32Array(48); for (let i = 0; i < 48; i++) curve[i] = Math.max(0.0001, Math.sin(Math.PI * i / 47) * vol * (Math.random() < 0.55 ? Math.random() : 0.05));
    g.gain.setValueCurveAtTime(curve, t, dur);
    n.connect(b1); n.connect(b2); b1.connect(g); b2.connect(g); this.out(g, pan, 0.7); n.start(t, Math.random()); n.stop(t + dur + 0.1);
  },
  notes(list, type, vol, step, dec, wet) {
    if (!this.ac) return;
    list.forEach((f, i) => { const t = this.now() + i * step, o = this.osc(type, f), g = this.gain(0); o.connect(g); this.env(g, t, 0.005, vol, dec); this.out(g, 0, wet); o.start(t); o.stop(t + dec + 0.1); });
  },
  chime() { this.notes([880, 1046.5, 1318.5, 1244.5, 987.8], 'triangle', 0.22, 0.16, 1.4, 0.6); },
  coin() { this.notes([1318.5, 1760], 'triangle', 0.16, 0.08, 0.5, 0.3); },
  dawn() {
    if (!this.ac) return; const t = this.now();
    for (const f of [220, 277.18, 329.63, 440, 554.37]) { const o = this.osc('triangle', f), g = this.gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 7); o.connect(g); this.out(g, 0, 0.7); o.start(t); o.stop(t + 7.2); }
  },
  roar(vol) {
    if (!this.ac) return; const t = this.now(), d = 2.6;
    const ws = this.ac.createWaveShaper(), c = new Float32Array(256); for (let i = 0; i < 256; i++) c[i] = Math.tanh((i / 128 - 1) * 4); ws.curve = c;
    const f = this.filt('lowpass', 700, 3), g = this.gain(0);
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(200, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const [a, b] of [[85, 52], [61, 38]]) { const o = this.osc('sawtooth', a, t); o.frequency.linearRampToValueAtTime(b, t + d); o.connect(ws); o.start(t); o.stop(t + d + 0.1); }
    const n = this.src(this.brown, true); n.connect(ws); n.start(t); n.stop(t + d);
    ws.connect(f); f.connect(g); this.out(g, 0, 0.6);
  },
  squelch(pan) {
    if (!this.ac) return; const t = this.now();
    const o = this.osc('sine', 220, t), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(55, t + 0.25); o.connect(g); this.env(g, t, 0.01, 0.5, 0.3); this.out(g, pan, 0.2); o.start(t); o.stop(t + 0.4);
    const n = this.src(this.white, true), b = this.filt('bandpass', 500, 2), ng = this.gain(0); n.connect(b); b.connect(ng); this.env(ng, t, 0.01, 0.35, 0.2); this.out(ng, pan, 0.2); n.start(t, Math.random()); n.stop(t + 0.3);
  },
  creak(pan, vol) {
    if (!this.ac) return; const t = this.now(), d = rand(0.6, 1.2), f0 = rand(90, 140);
    const o = this.osc('sawtooth', f0); for (let k = 1; k < 8; k++) o.frequency.setValueAtTime(f0 * rand(0.9, 1.1), t + k * d / 8);
    const b = this.filt('bandpass', 700, 9), g = this.gain(0); o.connect(b); b.connect(g); this.env(g, t, d * 0.3, vol, d * 0.7); this.out(g, pan, 0.3); o.start(t); o.stop(t + d + 0.1);
  },
  laugh(pan, vol) {
    if (!this.ac) return;
    for (let k = 0; k < 5; k++) { const t = this.now() + 0.25 + k * 0.17, o = this.osc('sawtooth', 210 - k * 12), b = this.filt('bandpass', 900, 4), g = this.gain(0); o.connect(b); b.connect(g); this.env(g, t, 0.02, vol * (1 - k * 0.12), 0.13); this.out(g, pan, 0.9); o.start(t); o.stop(t + 0.2); }
  },
  thump(vol) {
    if (!this.ac) return;
    for (const [dt, v] of [[0, 1], [0.22, 0.7]]) { const t = this.now() + dt, o = this.osc('sine', 60, t), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(38, t + 0.15); o.connect(g); this.env(g, t, 0.005, vol * v, 0.2); this.out(g, 0, 0); o.start(t); o.stop(t + 0.3); }
  },
  knock() {
    if (!this.ac) return; const t = this.now();
    const o = this.osc('sine', 420, t), g = this.gain(0); o.frequency.exponentialRampToValueAtTime(200, t + 0.06); o.connect(g); this.env(g, t, 0.002, 0.35, 0.08); this.out(g, 0, 0.1); o.start(t); o.stop(t + 0.15);
  },
};

// ---------- game state ----------
const fresh = () => ({ mode: 'title', live: false, won: false, seed: 0, gold: 0, skulls: 0, total: 5, holes: 0, water: 0, sail: 0.35, rudder: 0, repairP: 0, haulP: 0, coolL: 0, coolR: 0, ghostT: 32, krakenT: rand(100, 140), lootT: 4, eyesT: 10, creakT: 4, whisperT: 28, moanT: 14, beatT: 0, groundCD: 0, sinkT: 0, ferryT: 0, dawn: 0, playTime: 0, knockT: 0, bailT: 0, endT: 0, moodT: 0, lightT: 5 });
let S = fresh();
let T = 0, flash = 0, flashT = 0, flashQ = [], thunderT = -1, thunderV = 0, thunderPan = 0, wraithOn = false, hurt = 0, krakenMix = 0, camYaw = 0;
const keys = Object.create(null);
let touchMode = false;

// the crew: NET is null when sailing solo
let NET = null, AUTH = true, myId = 'h', myColor = 0, myName = 'Pirate', pvp = false, menuOpen = false, crewCode = '';
const crewInfo = new Map();   // id -> { name, color }, everyone including you
const remotes = new Map();    // id -> a crewmate's ship as this tab sees it
let ghostSeq = 1, lootSeq = 1;
const lootGrabbed = new Set();
const crewName = id => (crewInfo.get(id) || {}).name || 'A crewmate';

const panFor = (x, z) => clamp(-Math.sin(wrapA(Math.atan2(x - camera.position.x, z - camera.position.z) - camYaw)), -1, 1);
const distTo = (x, z) => Math.hypot(x - player.x, z - player.z);
const volFor = (x, z, near) => clamp(1.2 - distTo(x, z) / (near || 60), 0.15, 1);
const sailing = () => S.mode === 'play' || S.mode === 'won';

let bannerT = 0, toastT = 0;
function banner(title, sub, dur, red) { $('bTitle').textContent = title; $('bSub').textContent = sub || ''; $('banner').classList.toggle('red', !!red); $('banner').classList.add('show'); bannerT = dur || 3; }
function toast(txt) { const t = $('toast'); t.textContent = txt; t.classList.add('show'); toastT = 1.8; }
let lastPrompt = null;
function setPrompt(txt, prog) {
  const p = $('prompt');
  if (txt !== lastPrompt) { lastPrompt = txt; p.hidden = !txt; $('pText').textContent = txt || ''; }
  $('pBarWrap').hidden = !(prog >= 0);
  if (prog >= 0) $('pBar').style.width = (clamp(prog, 0, 1) * 100).toFixed(1) + '%';
}
const holdKey = (k, label) => touchMode ? `Hold ${label}` : `Hold ${k}`;

// ---------- the crew's ships ----------
function addRemote(id) {
  const info = crewInfo.get(id) || { name: 'Pirate', color: 1 };
  const mats = crewMats(info.color);
  const grp = buildShip(mats, false);
  const glow = glowSprite(0xffa04a, 3.4, 0.85); glow.position.set(0, 2.75, -4.85); grp.add(glow);
  const label = nameLabel(info.name, CREW_HEX[info.color] || CREW_HEX[0]); label.position.set(0, 14.5, 0); grp.add(label);
  grp.visible = false; scene.add(grp);
  const R = { id, grp, mats, label, x: 0, z: 0, h: 0, tx: 0, tz: 0, th: 0, sp: 0, sl: 0.35, rd: 0, ho: 0, wa: 0, st: 'sail', sink: 0, seen: false, raw: null };
  remotes.set(id, R);
  return R;
}
function removeRemote(id) {
  const R = remotes.get(id); if (!R) return;
  scene.remove(R.grp); R.mats.sail.dispose(); R.mats.skullSail.dispose(); R.label.material.map.dispose(); R.label.material.dispose();
  remotes.delete(id);
}
function applyShip(s) {
  if (!s || s.id === myId || !crewInfo.has(s.id)) return;
  const R = remotes.get(s.id) || addRemote(s.id);
  R.raw = { id: s.id, x: s.x, z: s.z, h: s.h, sp: s.sp, sl: s.sl, rd: s.rd, ho: s.ho, wa: s.wa, st: s.st };
  R.tx = s.x; R.tz = s.z; R.th = s.h; R.sp = s.sp; R.sl = s.sl; R.rd = s.rd; R.ho = s.ho; R.wa = s.wa;
  if (s.st === 'sail') R.sink = 0;
  R.st = s.st;
  if (!R.seen || Math.hypot(R.x - s.x, R.z - s.z) > 30) { R.x = s.x; R.z = s.z; R.h = s.h; R.seen = true; }
}
function stepRemotes(dt) {
  const k = 1 - Math.pow(0.02, dt);
  for (const R of remotes.values()) {
    R.grp.visible = R.seen && R.st !== 'ferry' && S.mode !== 'title';
    if (!R.seen) continue;
    R.tx += Math.sin(R.th) * R.sp * dt; R.tz += Math.cos(R.th) * R.sp * dt;
    R.x += (R.tx - R.x) * k; R.z += (R.tz - R.z) * k; R.h += wrapA(R.th - R.h) * k;
    if (R.st === 'sinking') R.sink += dt * 0.9;
    floatObj(R.grp, R.x, R.z, R.h, T, R.sink);
    const ud = R.grp.userData;
    for (const s of ud.sails) s.scale.y += (0.12 + 0.88 * R.sl - s.scale.y) * Math.min(1, dt * 3);
    ud.flag.rotation.y = -Math.PI / 2 + Math.sin(T * 3.1 + R.x) * 0.28;
    ud.wheel.rotation.z = -R.rd * 2.2;
  }
}
function myState() {
  const st = S.mode === 'sinking' ? 'sinking' : S.mode === 'ferry' ? 'ferry' : 'sail';
  return { id: myId, x: r2(player.x), z: r2(player.z), h: r3(player.h), sp: r2(player.speed), sl: r2(S.sail), rd: r2(S.rudder), ho: S.holes, wa: Math.round(S.water), st };
}
// every ship still afloat: yours (if you're sailing) and your crewmates'
function crewShips() {
  const out = [];
  if (sailing()) out.push({ id: myId, x: player.x, z: player.z, h: player.h, sp: player.speed });
  for (const R of remotes.values()) if (R.seen && R.st === 'sail') out.push({ id: R.id, x: R.x, z: R.z, h: R.h, sp: R.sp });
  return out;
}
function shipPose(id) {
  if (id === myId) return { x: player.x, z: player.z, h: player.h, alive: sailing() };
  const R = remotes.get(id);
  return R && R.seen ? { x: R.x, z: R.z, h: R.h, alive: R.st === 'sail' } : null;
}
function safeSpot(x, z, h) {
  for (const I of islands) {
    const d = Math.hypot(x - I.x, z - I.z) || 0.01;
    if (d < I.col + 3) { x = I.x + (x - I.x) / d * (I.col + 3); z = I.z + (z - I.z) / d * (I.col + 3); }
  }
  return { x: r2(x), z: r2(z), h: r3(h) };
}
// a spot behind and beside a ship that's still sailing
function spotNear(s) { return safeSpot(s.x - Math.sin(s.h) * 30 + Math.cos(s.h) * 12, s.z - Math.cos(s.h) * 30 - Math.sin(s.h) * 12, s.h); }

// ---------- cannons ----------
function aim(ox, oz, tx, tz, tvx, tvz, V) {
  let px = tx, pz = tz, el = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.hypot(px - ox, pz - oz);
    el = 0.5 * Math.asin(clamp(d * GRAV / (V * V), 0, 0.999));
    const tt = d / (V * Math.cos(el)); px = tx + tvx * tt; pz = tz + tvz * tt;
  }
  return { yaw: Math.atan2(px - ox, pz - oz), el };
}
const ballOf = (p, a, V) => { const ce = Math.cos(a.el); return [r2(p.x), r2(p.y), r2(p.z), r2(Math.sin(a.yaw) * ce * V), r2(Math.sin(a.el) * V), r2(Math.cos(a.yaw) * ce * V)]; };
function spawnBall(a, owner) {
  let mesh;
  if (owner === 'ghost') { mesh = new THREE.Sprite(ghostShotMat); mesh.scale.set(1.8, 1.8, 1); }
  else { mesh = new THREE.Mesh(ballGeo, ballMat); const e = new THREE.Sprite(emberMat); e.scale.set(1.1, 1.1, 1); mesh.add(e); }
  mesh.position.set(a[0], a[1], a[2]); scene.add(mesh);
  balls.push({ mesh, vx: a[3], vy: a[4], vz: a[5], owner, life: 0 });
}
// a volley: a list of [x, y, z, vx, vy, vz] cannonballs fired together
function spawnVolley(by, b) {
  if (!b || !b.length) return;
  const ghost = by === 'ghost';
  for (const a of b) {
    spawnBall(a, by);
    emit(a[0], a[1], a[2], ghost ? 10 : 12, Object.assign({}, ghost ? FX.ghost : FX.fire, { dx: a[3] * 0.17, dz: a[5] * 0.17 }));
    if (!ghost) emit(a[0], a[1], a[2], 6, Object.assign({}, FX.smoke, { dx: a[3] * 0.06, dz: a[5] * 0.06 }));
  }
  const f = b[0];
  if (by !== myId) Snd.cannon(panFor(f[0], f[2]), clamp(1.2 - distTo(f[0], f[2]) / 60, 0.2, 0.9), ghost ? 0.7 : 0.35);
}
function sendVolley(b) {
  if (!NET) return;
  if (NET.isHost) NET.broadcast({ t: 'vol', by: myId, b });
  else NET.send({ t: 'vol', b });
}
function targets() {
  const out = [];
  for (const G of ghosts) if (!G.sinking && G.fade > 0.4) out.push({ x: G.x, z: G.z, vx: Math.sin(G.h) * G.speed, vz: Math.cos(G.h) * G.speed });
  if (kraken.active) for (const Tn of kraken.tentacles) if (Tn.alive && Tn.rise > 0.6) out.push({ x: Tn.pts[5].x, z: Tn.pts[5].z, vx: 0, vz: 0 });
  if (pvp) for (const R of remotes.values()) if (R.seen && R.st === 'sail') out.push({ x: R.x, z: R.z, vx: Math.sin(R.h) * R.sp, vz: Math.cos(R.h) * R.sp });
  return out;
}
function fire(side, lockMin) {
  if (S.mode !== 'play' || menuOpen) return;
  if (side > 0 ? S.coolL > 0 : S.coolR > 0) return;
  if (side > 0) S.coolL = COOL; else S.coolR = COOL;
  const lx = Math.cos(player.h) * side, lz = -Math.sin(player.h) * side;
  let best = null, bestScore = Infinity;
  for (const t of targets()) {
    const dx = t.x - player.x, dz = t.z - player.z, d = Math.hypot(dx, dz);
    if (d > 72 || d < 3) continue;
    const c = (dx * lx + dz * lz) / d; if (c < (lockMin === undefined ? 0.55 : lockMin)) continue;
    const score = d * (2 - c); if (score < bestScore) { best = t; bestScore = score; }
  }
  player.grp.updateMatrixWorld();
  const b = [];
  for (const c of player.grp.userData.cannons) {
    if (c.side !== side) continue;
    const wp = c.local.clone().applyMatrix4(player.grp.matrixWorld);
    const a = best ? aim(wp.x, wp.z, best.x, best.z, best.vx, best.vz, BALL_V) : { yaw: Math.atan2(lx, lz), el: 0.16 };
    a.yaw += rand(-0.025, 0.025); a.el += rand(-0.01, 0.01);
    b.push(ballOf(wp, a, BALL_V));
  }
  spawnVolley(myId, b);
  sendVolley(b);
  Snd.cannon(-side * 0.55, 0.9);
  cam.shake = Math.max(cam.shake, 0.35);
}
function fireAuto() {
  if (S.mode !== 'play' || menuOpen) return;
  let best = null, bd = 1e9;
  for (const t of targets()) { const d = distTo(t.x, t.z); if (d < bd) { bd = d; best = t; } }
  if (!best || bd > 75) { fire(1); fire(-1); return; }
  const side = ((best.x - player.x) * Math.cos(player.h) - (best.z - player.z) * Math.sin(player.h)) >= 0 ? 1 : -1;
  fire(side, 0.2);
}
function inShip(p, sx, sz, sh, sy, halfW, topY) {
  const dx = p.x - sx, dz = p.z - sz;
  const lz = dx * Math.sin(sh) + dz * Math.cos(sh), lx = dx * Math.cos(sh) - dz * Math.sin(sh), ly = p.y - sy;
  return Math.abs(lx) < halfW && lz > -5.6 && lz < 6.6 && ly > -1.6 && ly < topY;
}
function damage(n) {
  if (S.mode !== 'play') return;
  S.holes = Math.min(9, S.holes + n); hurt = 1; cam.shake = Math.max(cam.shake, 0.8);
  Snd.crack(0, 1);
  const p = player.grp.position; emit(p.x, p.y + 1.2, p.z, 26, FX.splinter);
}

// ---------- one-off happenings, shared with the crew ----------
// The host (or a solo tab) decides these and every tab plays them.
function fireEvent(ev) {
  if (NET && NET.isHost) NET.broadcast(Object.assign({ t: 'ev' }, ev));
  onEvent(ev);
}
const LINES = ['The dead want it back.', 'The fog is getting thicker.', 'Something enormous stirs below.', 'One more. They know exactly where you are.'];
function onEvent(m) {
  switch (m.e) {
    case 'ghost':
      Snd.bell(panFor(m.x, m.z), 0.35 * volFor(m.x, m.z, 140));
      banner('A ghost ship tolls its bell', 'Sink it with your cannons, or outrun it', 3.4);
      break;
    case 'ghostSunk':
      banner('Ghost ship destroyed', m.by === myId || !NET ? '+50 gold' : `${crewName(m.by)} sank it. +50 gold`, 2.4);
      Snd.wail(panFor(m.x, m.z), 0.3 * volFor(m.x, m.z, 100));
      emit(m.x, 3, m.z, 60, Object.assign({}, FX.ghost, { spd: 5, up: 8, spread: 3 }));
      break;
    case 'kraken':
      if (m.tg === myId) { Snd.roar(0.7); cam.shake = 1.4; banner('The Kraken', 'Shoot the tentacles before they smash the hull', 4.2, true); }
      else { Snd.roar(0.3); banner(`The Kraken has ${crewName(m.tg)}`, 'Sail over and help shoot the tentacles off', 4.2, true); }
      break;
    case 'cut': toast('Tentacle severed'); Snd.roar(0.25); break;
    case 'slam': {
      const Tn = kraken.tentacles.find(t => t.n === m.n);
      if (Tn) { const p = Tn.pts[TSEG - 1]; emit(p.x, p.y, p.z, 24, FX.splinter); emit(p.x, p.y, p.z, 18, FX.splash); Snd.splash(panFor(p.x, p.z), 0.4 * volFor(p.x, p.z)); }
      if (m.tg === myId) { damage(1); cam.shake = 1; Snd.thump(0.6); }
      break;
    }
    case 'krakenEnd':
      if (m.won) banner('The Kraken sinks back into the deep', '+150 gold', 3.4);
      break;
    case 'skull':
      if (takeSkull(m.i)) {
        const I = islands[m.i];
        emit(I.sx, I.sy, I.sz, 60, Object.assign({}, FX.ghost, { spd: 4, up: 5, life: 1.6 }));
        Snd.chime(); Snd.laugh(panFor(I.sx, I.sz), 0.22);
        if (S.skulls < S.total) {
          const line = LINES[S.skulls - 1] || '';
          banner(`Cursed skull ${S.skulls} of ${S.total}`, m.by === myId || !NET ? line : `${crewName(m.by)} hauled it aboard. ${line}`, 3.6);
        }
      }
      break;
    case 'win': win(); break;
  }
}

// ---------- ghost ships ----------
function makeGhost(id, x, z, h) {
  const mats = ghostMats(), grp = buildShip(mats, true);
  const aura = glowSprite(0x22ff99, 1, 0); aura.scale.set(24, 16, 1); aura.position.y = 4; aura.material.userData.base = 0.2; grp.add(aura); mats.list.push(aura.material);
  const lamp = glowSprite(0x7affc8, 4, 0); lamp.position.set(0, 2.75, -4.85); lamp.material.userData.base = 0.9; grp.add(lamp); mats.list.push(lamp.material);
  scene.add(grp);
  const G = { id, grp, mats, x, z, h, tx: x, tz: z, th: h, speed: 8, hp: 3 + Math.ceil(S.skulls / 2) + (crewInfo.size > 2 ? 1 : 0), fade: 0, tfade: 0, sinking: false, dismissed: false, gone: false, sink: 0, cool: rand(5, 8), side: Math.random() < 0.5 ? 1 : -1, flash: 0 };
  floatObj(grp, x, z, h, T, 0);
  ghosts.push(G);
  return G;
}
function spawnGhost(near) {
  const a = near.h + rand(-1.3, 1.3) + (Math.random() < 0.35 ? Math.PI : 0), d = rand(68, 82);
  const x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
  const G = makeGhost(ghostSeq++, x, z, Math.atan2(near.x - x, near.z - z));
  fireEvent({ e: 'ghost', id: G.id, x: r2(x), z: r2(z) });
}
function removeGhost(G) { scene.remove(G.grp); G.mats.list.forEach(m => m.dispose()); }
function ghostVolley(G, side, tgt, d) {
  G.grp.updateMatrixWorld();
  const pvx = Math.sin(tgt.h) * tgt.sp, pvz = Math.cos(tgt.h) * tgt.sp;
  const err = Math.max(1.5, 5 - S.skulls * 0.6), max = 2 + (S.skulls >= 3 ? 1 : 0);
  const b = [];
  for (const c of G.grp.userData.cannons) {
    if (c.side !== side || b.length >= max) continue;
    const wp = c.local.clone().applyMatrix4(G.grp.matrixWorld);
    b.push(ballOf(wp, aim(wp.x, wp.z, tgt.x + rand(-err, err), tgt.z + rand(-err, err), pvx, pvz, GHOST_V), GHOST_V));
  }
  spawnVolley('ghost', b);
  if (NET) NET.broadcast({ t: 'vol', by: 'ghost', b });
}
function hitGhost(G, p, by) {
  G.flash = 1;
  emit(p.x, p.y, p.z, 20, FX.ghost); emit(p.x, p.y, p.z, 10, FX.splinter);
  Snd.crack(panFor(p.x, p.z), volFor(p.x, p.z) * 0.8);
  if (!AUTH) return;
  G.hp--;
  if (G.hp <= 0) {
    G.sinking = true; S.gold += 50;
    fireEvent({ e: 'ghostSunk', id: G.id, by, x: r2(G.x), z: r2(G.z) });
  }
}
function stepGhosts(dt) {
  const ships = AUTH ? crewShips() : null;
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const G = ghosts[i];
    if (AUTH) {
      if (G.sinking) {
        G.fade -= dt * 0.33; G.sink += dt * 1.1; G.speed *= Math.pow(0.3, dt);
        if (G.fade <= 0) { removeGhost(G); ghosts.splice(i, 1); continue; }
      } else {
        G.fade = Math.min(1, G.fade + dt * 0.3);
        let tgt = null, d = Infinity;
        for (const s of ships) { const dd = Math.hypot(s.x - G.x, s.z - G.z); if (dd < d) { d = dd; tgt = s; } }
        let want = G.h, spd = 6;
        if (tgt && S.won) want = Math.atan2(G.x - tgt.x, G.z - tgt.z);
        else if (tgt) {
          const dx = tgt.x - G.x, dz = tgt.z - G.z, ang = Math.atan2(dx, dz);
          if (d > 30) { want = ang; spd = 9.5; } else { want = ang + G.side * (Math.PI / 2 - clamp((d - 20) * 0.07, -0.6, 0.6)); spd = 7.5; }
          G.cool -= dt;
          const sd = (dx * Math.cos(G.h) - dz * Math.sin(G.h)) / (d || 1);
          if (G.cool <= 0 && d < 50 && d > 8 && Math.abs(sd) > 0.78 && G.fade > 0.85) { ghostVolley(G, sd > 0 ? 1 : -1, tgt, d); G.cool = Math.max(2.4, rand(3.6, 5.4) - S.skulls * 0.3); }
        }
        G.h += clamp(wrapA(want - G.h), -0.75 * dt, 0.75 * dt);
        G.speed += (spd - G.speed) * Math.min(1, dt * 0.6);
        if (d > 170) { G.sinking = true; G.dismissed = true; }
      }
      G.x += Math.sin(G.h) * G.speed * dt; G.z += Math.cos(G.h) * G.speed * dt;
    } else {
      G.tx += Math.sin(G.th) * G.speed * dt; G.tz += Math.cos(G.th) * G.speed * dt;
      const k = 1 - Math.pow(0.03, dt);
      G.x += (G.tx - G.x) * k; G.z += (G.tz - G.z) * k; G.h += wrapA(G.th - G.h) * k;
      if (G.gone) G.tfade = 0;
      G.fade += (G.tfade - G.fade) * Math.min(1, dt * 3);
      if (G.sinking) G.sink += dt * 1.1;
      if (G.gone && G.fade < 0.02) { removeGhost(G); ghosts.splice(i, 1); continue; }
    }
    if (G.sinking && Math.random() < dt * 25) emit(G.x + rand(-2, 2), G.grp.position.y + rand(0, 6), G.z + rand(-2, 2), 1, { col: [0.3, 1, 0.65], spd: 0.6, up: 1.5, life: 1.6, grav: -1.2 });
    floatObj(G.grp, G.x, G.z, G.h, T, G.sink);
    G.flash = Math.max(0, G.flash - dt * 3);
    const flick = (0.82 + 0.18 * Math.sin(T * 2.7 + G.id * 1.3)) * Math.max(0, G.fade) * (1 + G.flash);
    for (const m of G.mats.list) m.opacity = m.userData.base * flick;
    G.grp.userData.flag.rotation.y = -Math.PI / 2 + Math.sin(T * 2.6 + G.id) * 0.4;
    G.grp.userData.crew.forEach((c, k) => { c.position.y = 1.15 + Math.sin(T * 2 + k * 2) * 0.12; });
  }
}

// ---------- the Kraken ----------
function makeTentacle(n, angle, r0, curl, phase, rise, slamT) {
  const segs = [];
  for (let i = 0; i < TSEG; i++) { const m = new THREE.Mesh(tentGeo, tentMat), s = i / (TSEG - 1); m.scale.setScalar(0.95 * (1 - s * 0.8) + 0.07); m.position.set(0, -60, 0); scene.add(m); segs.push(m); }
  return { n, angle, r0, hp: 2, rise, alive: true, phase, slamT, slamP: -1, recoil: 0, curl, segs, pts: segs.map(() => new THREE.Vector3(0, -60, 0)) };
}
function startKraken(tg) {
  clearKraken();
  kraken.active = true; kraken.tg = tg; kraken.noReward = false;
  const angs = [0.6, 1.55, 2.45, -0.6, -1.55, -2.45].sort(() => Math.random() - 0.5).slice(0, S.skulls >= 3 ? 5 : 4);
  kraken.tentacles = angs.map((a, k) => makeTentacle(k, a, rand(7, 8.6), rand(0.45, 0.85), rand(0, TAU), -k * 0.35, rand(4, 7) + k * 1.5));
  fireEvent({ e: 'kraken', tg });
}
function clearKraken() { kraken.tentacles.forEach(t => t.segs.forEach(s => scene.remove(s))); kraken.tentacles = []; kraken.active = false; kraken.removed.clear(); }
function hitTentacle(Tn, p) {
  Tn.recoil = 1;
  emit(p.x, p.y, p.z, 22, FX.ichor);
  Snd.squelch(panFor(p.x, p.z));
  if (!AUTH) return;
  Tn.hp--;
  if (Tn.hp <= 0) { Tn.alive = false; fireEvent({ e: 'cut', n: Tn.n }); }
}
function updateTentacle(Tn, dt, P) {
  Tn.rise = Tn.alive ? Math.min(1, Tn.rise + dt * 0.55) : Tn.rise - dt * 0.6;
  Tn.recoil = Math.max(0, Tn.recoil - dt * 2.5);
  if (AUTH) {
    if (Tn.alive && P && P.alive && Tn.rise > 0.9) {
      if (Tn.slamP < 0) { Tn.slamT -= dt; if (Tn.slamT <= 0) { Tn.slamP = 0; Snd.creak(0, 0.12); } }
      else { const prev = Tn.slamP; Tn.slamP += dt / 1.7; if (prev < 0.55 && Tn.slamP >= 0.55) fireEvent({ e: 'slam', tg: kraken.tg, n: Tn.n }); if (Tn.slamP >= 1) { Tn.slamP = -1; Tn.slamT = rand(7, 12); } }
    } else if (!Tn.alive) Tn.slamP = -1;
  } else if (Tn.slamP >= 0) Tn.slamP = Math.min(1, Tn.slamP + dt / 1.7);
  if (!P) return;
  const slam = Tn.slamP >= 0 ? Math.sin(Tn.slamP * Math.PI) : 0;
  const ca = P.h + Tn.angle, ux = Math.sin(ca), uz = Math.cos(ca), tx = Math.cos(ca), tz = -Math.sin(ca);
  const bx = P.x + ux * Tn.r0, bz = P.z + uz * Tn.r0;
  const curl = Tn.curl + slam * 2.0 - Tn.recoil * 0.6;
  let radial = 0, y = -2.4 - (1 - Tn.rise) * 10;
  for (let i = 0; i < TSEG; i++) {
    const s = i / (TSEG - 1);
    if (i > 0) { const th = curl * Math.pow(s, 1.4) + Math.sin(T * 1.6 + Tn.phase + s * 3) * 0.2 * s; radial -= Math.sin(th) * SEG_LEN; y += Math.cos(th) * SEG_LEN; }
    const lat = Math.sin(T * 1.25 + Tn.phase * 2 + s * 4) * 1.3 * s * (1 - slam * 0.8);
    Tn.pts[i].set(bx + ux * radial + tx * lat, y, bz + uz * radial + tz * lat);
    Tn.segs[i].position.copy(Tn.pts[i]);
  }
}
function stepKraken(dt) {
  const P = shipPose(kraken.tg);
  // the Kraken lets go of a ship that sank or left
  if (AUTH && (!P || !P.alive) && !kraken.noReward) { kraken.noReward = true; kraken.tentacles.forEach(t => { t.alive = false; }); }
  for (let i = kraken.tentacles.length - 1; i >= 0; i--) {
    const Tn = kraken.tentacles[i];
    updateTentacle(Tn, dt, P);
    if (!Tn.alive && Tn.rise < -0.35) { Tn.segs.forEach(s => scene.remove(s)); kraken.tentacles.splice(i, 1); kraken.removed.add(Tn.n); }
  }
  if (!kraken.tentacles.length) {
    kraken.active = false;
    if (AUTH) {
      S.krakenT = rand(150, 210);
      const won = !kraken.noReward && !S.won;
      if (won) S.gold += 150;
      fireEvent({ e: 'krakenEnd', won });
    }
  }
}

// ---------- cannonballs ----------
function stepBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], p = b.mesh.position, own = b.owner, ghost = own === 'ghost';
    b.life += dt; b.vy -= GRAV * dt; p.x += b.vx * dt; p.y += b.vy * dt; p.z += b.vz * dt;
    if (Math.random() < 0.6) emit(p.x, p.y, p.z, 1, ghost ? { col: [0.2, 0.8, 0.5], spd: 0.2, up: 0.2, life: 0.5, grav: 0, spread: 0.1 } : { col: [0.35, 0.22, 0.1], spd: 0.2, up: 0.3, life: 0.5, grav: 0, spread: 0.1 });
    let hit = false;
    const harmful = ghost || pvp;
    // your own hull: you decide when you're hit
    if (harmful && own !== myId && S.mode === 'play' && inShip(p, player.x, player.z, player.h, player.grp.position.y, 2.4, 3.4)) {
      damage(1); emit(p.x, p.y, p.z, 20, ghost ? FX.ghost : FX.splinter);
      toast(ghost ? 'Hull breached' : `${crewName(own)} hit your ship`);
      hit = true;
    }
    // a crewmate's hull: just the splinters, their tab counts the damage
    if (!hit && harmful) for (const R of remotes.values()) {
      if (R.id === own || !R.seen || R.st !== 'sail') continue;
      if (inShip(p, R.x, R.z, R.h, R.grp.position.y, 2.4, 3.4)) { emit(p.x, p.y, p.z, 18, ghost ? FX.ghost : FX.splinter); Snd.crack(panFor(p.x, p.z), volFor(p.x, p.z) * 0.6); hit = true; break; }
    }
    if (!hit && !ghost) {
      for (const G of ghosts) if (!G.sinking && G.fade > 0.3 && inShip(p, G.x, G.z, G.h, G.grp.position.y, 3, 9)) { hitGhost(G, p, own); hit = true; break; }
      if (!hit && kraken.active) {
        outer: for (const Tn of kraken.tentacles) {
          if (!Tn.alive || Tn.rise < 0.4) continue;
          for (let k = 0; k < TSEG; k++) { const r = Tn.segs[k].scale.x + 0.55; if (p.distanceToSquared(Tn.pts[k]) < r * r) { hitTentacle(Tn, p); hit = true; break outer; } }
        }
      }
    }
    if (!hit && p.y < waveH(p.x, p.z, T) - 0.3) { emit(p.x, p.y + 0.3, p.z, 14, FX.splash); Snd.splash(panFor(p.x, p.z), 0.35 * volFor(p.x, p.z, 50)); hit = true; }
    if (hit || b.life > 6) { scene.remove(b.mesh); balls.splice(i, 1); }
  }
}

// ---------- barrels and the eyes in the fog ----------
function makeLoot(id, x, z) {
  const g = new THREE.Group(); g.add(new THREE.Mesh(barrelGeo, barrelMat));
  const gl = glowSprite(0xffc35a, 4, 0.6); gl.position.y = 0.6; g.add(gl); scene.add(g);
  const L = { id, grp: g, x, z, spin: rand(0, TAU) };
  loot.push(L);
  return L;
}
function spawnLoot(near) {
  const a = near.h + rand(-1, 1), d = rand(38, 70), x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
  if (islands.some(I => Math.hypot(I.x - x, I.z - z) < I.col + 4)) return;
  makeLoot(lootSeq++, r2(x), r2(z));
}
function removeLoot(L) { scene.remove(L.grp); const i = loot.indexOf(L); if (i >= 0) loot.splice(i, 1); }
function grabLoot(L, by) { removeLoot(L); S.gold += 25; }
function stepLoot(dt) {
  if (AUTH && S.live && !S.won) {
    S.lootT -= dt;
    if (S.lootT <= 0) { const ships = crewShips(); if (ships.length && loot.length < 3 + crewInfo.size) spawnLoot(ships[Math.floor(Math.random() * ships.length)]); S.lootT = rand(7, 14) / Math.max(1, crewShips().length * 0.7); }
  }
  for (let i = loot.length - 1; i >= 0; i--) {
    const L = loot[i]; L.spin += dt * 0.6;
    L.grp.position.set(L.x, waveH(L.x, L.z, T) - 0.1, L.z);
    L.grp.rotation.set(Math.sin(T * 1.3 + L.spin) * 0.25, L.spin, Math.sin(T * 1.7 + L.spin) * 0.2);
    if (distTo(L.x, L.z) < 5.5 && S.mode === 'play') {
      Snd.coin(); emit(L.x, 1, L.z, 26, FX.gold); toast('+25 gold');
      if (AUTH) grabLoot(L, myId);
      else { NET.send({ t: 'grab', id: L.id }); lootGrabbed.add(L.id); removeLoot(L); }
    } else if (AUTH && crewShips().every(s => Math.hypot(L.x - s.x, L.z - s.z) > 150)) removeLoot(L);
  }
}
function spawnEyes() {
  const a = camYaw + rand(-0.8, 0.8), d = rand(24, 40), x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
  if (islands.some(I => Math.hypot(I.x - x, I.z - z) < I.col)) return;
  const mat = new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
  const s = [0, 1].map(() => { const sp = new THREE.Sprite(mat); sp.scale.set(0.75, 0.5, 1); scene.add(sp); return sp; });
  eyes.push({ s, mat, x, z, px: Math.cos(a) * 0.5, pz: -Math.sin(a) * 0.5, t: 0, dur: rand(3, 5.5), blink: rand(0.8, 2) });
  Snd.whisper(panFor(x, z), 0.28);
}
function stepEyes(dt) {
  for (let i = eyes.length - 1; i >= 0; i--) {
    const e = eyes[i]; e.t += dt; e.blink -= dt;
    if (distTo(e.x, e.z) < 12 && e.t < e.dur) e.dur = e.t;
    let o = Math.min(1, e.t / 1.2) * (e.t > e.dur ? Math.max(0, 1 - (e.t - e.dur) / 0.8) : 1);
    if (e.blink < 0) { o = 0; if (e.blink < -0.13) e.blink = rand(0.9, 2.2); }
    const y = waveH(e.x, e.z, T) + 0.7 - (e.t > e.dur ? (e.t - e.dur) * 1.2 : 0);
    e.s[0].position.set(e.x + e.px, y, e.z + e.pz); e.s[1].position.set(e.x - e.px, y, e.z - e.pz);
    e.mat.opacity = o * 0.95;
    if (e.t > e.dur + 0.8) { e.s.forEach(sp => scene.remove(sp)); e.mat.dispose(); eyes.splice(i, 1); }
  }
}

// ---------- skulls, winning, sinking ----------
// the host decides who got the skull; every tab then takes it off its island
function collectSkull(i, by) {
  const I = islands[i]; if (!I || !I.skull || I.taken) return;
  S.gold += 100;
  fireEvent({ e: 'skull', i, by });
  if (islands.every(J => !J.skull || J.taken)) fireEvent({ e: 'win' });
  else { S.ghostT = Math.min(S.ghostT, 5); if (S.skulls === 3) S.krakenT = Math.min(S.krakenT, 25); }
}
function takeSkull(i) {
  const I = islands[i]; if (!I || !I.skull || I.taken) return false;
  I.taken = true; I.pending = false;
  I.skullMesh.visible = false; I.glow.visible = false; I.beam.visible = false; I.flames.forEach(f => { f.visible = false; });
  S.skulls = islands.filter(J => J.skull && J.taken).length;
  cargo.forEach((c, k) => { c.visible = k < S.skulls; });
  return true;
}
const takenList = () => islands.filter(I => I.taken).map(I => I.idx);
function saveBest() { if (S.gold > BEST) { BEST = S.gold; try { localStorage.setItem('cursedTideBest', String(BEST)); } catch (e) {} } }
function win() {
  if (S.won) return;
  if (S.mode === 'ferry' || S.mode === 'sinking') respawn(true);
  S.won = true; S.mode = 'won'; S.endT = 0;
  banner('The curse is lifted', 'Dawn breaks over the Shroud', 6);
  if (AUTH) {
    ghosts.forEach(G => { if (!G.sinking) { G.sinking = true; G.dismissed = true; } });
    kraken.noReward = true; kraken.tentacles.forEach(t => { t.alive = false; });
  }
  Snd.dawn(); saveBest();
}
function sinkShip() {
  S.mode = 'sinking'; S.sinkT = 0;
  banner("She's going down", NET ? 'The Ferry of the Damned is coming for you' : 'The black water takes the ship', 4, true);
  Snd.wail(0, 0.3); Snd.laugh(0, 0.3); saveBest();
}
// in a crew, a sunk pirate waits on the Ferry of the Damned, then sails again
function toFerry() { S.mode = 'ferry'; S.ferryT = 10; player.grp.visible = false; $('ferry').hidden = false; setPrompt(''); }
function respawn(quiet) {
  const ships = [...remotes.values()].filter(R => R.seen && R.st === 'sail');
  const at = ships.length ? spotNear(ships[Math.floor(Math.random() * ships.length)]) : safeSpot(CREW_X[myColor] || 0, 0, 0);
  Object.assign(player, { x: at.x, z: at.z, h: at.h, speed: 0, sink: 0 });
  Object.assign(S, { holes: 0, water: 0, sail: 0.35, repairP: 0, haulP: 0, sinkT: 0, mode: 'play' });
  player.grp.visible = true; $('ferry').hidden = true;
  if (!quiet) banner('Back from the Ferry of the Damned', 'Your crew needs you', 3);
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function showEnd(won) {
  S.mode = 'over';
  $('endEyebrow').textContent = won ? 'Dawn over the Shroud' : 'Lost at sea';
  $('endTitle').textContent = won ? 'The Curse Is Lifted' : 'Claimed by the Deep';
  $('endText').textContent = won
    ? (NET ? `Your crew hauled all ${S.total} cursed skulls aboard and the dead let go of the sea.` : `You hauled all ${S.total} cursed skulls aboard and the dead let go of the sea. The ghost ships went down with the night.`)
    : S.skulls ? `You hauled ${S.skulls} of ${S.total} cursed skulls aboard before the sea took your ship. The dead keep what they catch.`
    : 'Your ship filled with black water and slid under the waves. The dead keep what they catch.';
  $('stSkulls').textContent = `${S.skulls}/${S.total}`; $('stGold').textContent = S.gold; $('stTime').textContent = fmtTime(S.playTime);
  const guest = NET && !NET.isHost;
  $('againBtn').hidden = guest;
  $('againBtn').textContent = NET ? 'Sail again with your crew' : 'Sail again';
  $('endLeave').hidden = !NET;
  $('endBest').textContent = guest ? 'Waiting for the captain to sail again.' : S.gold > 0 && S.gold >= BEST ? 'A new best haul.' : `Your best haul: ${BEST} gold.`;
  $('end').hidden = false; $('hud').classList.add('off'); $('touch').hidden = true; setPrompt('');
  (guest ? $('endLeave') : $('againBtn')).focus();
}

// ---------- per-frame game logic ----------
function stepGame(dt) {
  const play = S.mode === 'play', ctl = sailing() && !menuOpen;
  if (play) S.playTime += dt;
  if (ctl) {
    if (keys.w) S.sail = Math.min(1, S.sail + dt * 0.5);
    if (keys.s) S.sail = Math.max(0, S.sail - dt * 0.5);
    const want = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
    S.rudder += (want - S.rudder) * Math.min(1, dt * 3.5);
    if (keys.q) fire(1);
    if (keys.e) fire(-1);
  } else S.rudder *= Math.pow(0.1, dt);
  S.coolL = Math.max(0, S.coolL - dt); S.coolR = Math.max(0, S.coolR - dt);

  if (S.mode !== 'ferry') {
    const held = kraken.active && kraken.tg === myId && kraken.tentacles.some(t => t.alive);
    const target = S.mode === 'sinking' ? 0 : S.sail * MAX_SPEED * (1 - 0.5 * S.water / 100) * (held ? 0.04 : 1);
    player.speed += (target - player.speed) * Math.min(1, dt * (held ? 1.6 : 0.4));
    player.h += S.rudder * (0.24 + 0.5 * Math.min(1, player.speed / 7)) * (held ? 0.3 : 1) * dt;
    player.x += Math.sin(player.h) * player.speed * dt;
    player.z += Math.cos(player.h) * player.speed * dt;
    S.groundCD -= dt;
    for (const I of islands) {
      const dx = player.x - I.x, dz = player.z - I.z, d = Math.hypot(dx, dz) || 0.001;
      if (d < I.col) {
        player.x = I.x + dx / d * I.col; player.z = I.z + dz / d * I.col;
        if (player.speed > 3.5 && S.groundCD <= 0 && play) { damage(1); S.groundCD = 2.5; banner('Ran aground', 'The rocks tore a hole in the hull', 2.4); }
        player.speed *= Math.pow(0.05, dt);
      }
    }
  }

  let near = null;
  if (play) for (const I of islands) if (I.skull && !I.taken && !I.pending && Math.hypot(player.x - I.sx, player.z - I.sz) < HAUL_R) near = I;
  if (near && ctl && keys.f) {
    S.haulP += dt / 2.4;
    if (Math.random() < dt * 20) emit(near.sx, near.sy, near.sz, 1, { col: [0.3, 1, 0.7], spd: 1, up: 2, life: 0.8, grav: -1 });
    if (S.haulP >= 1) {
      S.haulP = 0;
      if (AUTH) collectSkull(near.idx, myId);
      else { near.pending = true; NET.send({ t: 'haul', i: near.idx }); }
    }
  } else if (near) S.haulP = Math.max(0, S.haulP - dt * 0.8);
  else S.haulP = 0;

  if (play && ctl && keys.r) {
    if (S.holes > 0) {
      S.repairP += dt / 1.2; S.knockT -= dt;
      if (S.knockT <= 0) { Snd.knock(); S.knockT = 0.3; }
      if (S.repairP >= 1) { S.holes--; S.repairP = 0; if (!S.holes) toast('Hull patched'); }
    } else if (S.water > 0) {
      S.water = Math.max(0, S.water - dt * 9); S.bailT -= dt;
      if (S.bailT <= 0) { Snd.splash(rand(-0.3, 0.3), 0.15); S.bailT = 0.55; }
    }
  }
  if (play) S.water = clamp(S.water + (S.holes ? S.holes * 1.05 : -0.2) * dt, 0, 100);
  if (play && S.water >= 100) sinkShip();

  let pt = '', pp = -1;
  if (play && !menuOpen) {
    if (near) { pt = `${holdKey('F', 'Haul')} to haul the cursed skull aboard`; pp = S.haulP; }
    else if (S.holes > 0) { pt = keys.r ? 'Patching the hull' : `${holdKey('R', 'Patch')} to patch ${S.holes === 1 ? 'the hole' : S.holes + ' holes'}`; pp = keys.r ? S.repairP : -1; }
    else if (S.water > 25) { pt = keys.r ? 'Bailing out the water' : `${holdKey('R', 'Patch')} to bail out the water`; }
  }
  setPrompt(pt, pp);

  // things only you hear and see
  if (play) {
    S.eyesT -= dt; if (S.eyesT <= 0) { spawnEyes(); S.eyesT = rand(9, 20); }
    S.creakT -= dt; if (S.creakT <= 0) { Snd.creak(rand(-0.4, 0.4), 0.08); S.creakT = rand(4, 9); }
    const nearSkull = islands.some(I => I.skull && !I.taken && Math.hypot(player.x - I.sx, player.z - I.sz) < 45);
    S.whisperT -= dt * (nearSkull ? 4 : 1); if (S.whisperT <= 0) { Snd.whisper(rand(-1, 1), 0.22); S.whisperT = rand(25, 45); }
    const liveG = ghosts.find(g => !g.sinking);
    if (liveG) { S.moanT -= dt; if (S.moanT <= 0) { Snd.wail(panFor(liveG.x, liveG.z), 0.1 * volFor(liveG.x, liveG.z, 80)); S.moanT = rand(12, 22); } }
    if (S.water > 55) { S.beatT -= dt; if (S.beatT <= 0) { Snd.thump(0.5); S.beatT = lerp(1.0, 0.55, (S.water - 55) / 45); } }
  }

  if (S.mode === 'sinking') { S.sinkT += dt; player.sink += dt * (0.4 + S.sinkT * 0.35); if (S.sinkT > 5) { if (NET) toFerry(); else showEnd(false); } }
  if (S.mode === 'ferry') { S.ferryT -= dt; setText($('ferryText'), `Back at sea in ${Math.max(1, Math.ceil(S.ferryT))}`); if (S.ferryT <= 0) respawn(false); }
  if (S.mode === 'won') { S.dawn = Math.min(1, S.dawn + dt / 9); S.endT += dt; if (S.endT > 8) showEnd(true); }

  S.moodT -= dt;
  if (S.moodT <= 0) {
    S.moodT = 0.5;
    let danger = 0;
    for (const G of ghosts) if (!G.sinking) danger = Math.max(danger, 1 - distTo(G.x, G.z) / 90);
    if (kraken.active) danger = Math.max(danger, kraken.tg === myId ? 1 : 0.4);
    danger = Math.max(danger, S.water / 140) * (1 - S.dawn);
    Snd.setMood(danger, 1 - S.dawn);
  }
}

// the world: run by the host (or a solo tab)
function stepWorldRules(dt) {
  if (!AUTH || !S.live || S.won) return;
  S.ghostT -= dt;
  if (S.ghostT <= 0) {
    const ships = crewShips();
    const cap = Math.min(4, 1 + Math.floor(S.skulls / 2) + (crewInfo.size > 1 ? 1 : 0));
    if (ships.length && ghosts.filter(g => !g.sinking).length < cap && !kraken.active) spawnGhost(ships[Math.floor(Math.random() * ships.length)]);
    S.ghostT = rand(38, 55) - S.skulls * 5;
  }
  if (!kraken.active) {
    S.krakenT -= dt;
    if (S.krakenT <= 0) {
      const c = crewShips().filter(s => !islands.some(I => Math.hypot(s.x - I.x, s.z - I.z) < I.col + 25));
      if (c.length && ghosts.filter(g => !g.sinking).length <= 1) startKraken(c[Math.floor(Math.random() * c.length)].id); else S.krakenT = 8;
    }
  }
}

function stepEntities(dt) {
  stepGhosts(dt);
  stepBalls(dt);
  if (kraken.active) stepKraken(dt);
  stepLoot(dt);
  stepEyes(dt);
}

const tmpC = new THREE.Color();
function stepWorld(dt) {
  floatObj(player.grp, player.x, player.z, player.h, T, player.sink);
  if (S.mode === 'sinking' || (S.mode === 'over' && player.sink > 0)) { player.grp.rotation.x += Math.min(0.5, S.sinkT * 0.08); player.grp.rotation.z += Math.min(0.35, S.sinkT * 0.05); }
  const ud = player.grp.userData;
  for (const s of ud.sails) { const k = 0.12 + 0.88 * S.sail; s.scale.y += (k - s.scale.y) * Math.min(1, dt * 3); }
  ud.flag.rotation.y = -Math.PI / 2 + Math.sin(T * 3.3) * 0.28;
  ud.wheel.rotation.z = -S.rudder * 2.2;
  lanternLight.intensity = 1.2 + Math.sin(T * 13) * 0.08 + Math.random() * 0.12;
  bilge.visible = S.water > 1; bilge.position.y = 0.62 + S.water / 100 * 0.5;

  if (S.dawn < 0.2) { S.lightT -= dt; if (S.lightT <= 0) { strike(); S.lightT = rand(7, 16) / (1 + S.skulls * 0.15); } }
  flashT += dt;
  for (const q of flashQ) if (!q.done && flashT >= q.at) { q.done = true; flash = Math.max(flash, q.v); }
  flash = Math.max(0, flash - dt * 6);
  bolt.visible = flash > 0.2; bolt.material.opacity = Math.min(1, flash * 1.4);
  wraith.material.opacity = wraithOn ? Math.min(1, flash * 1.6) : 0; wraith.visible = wraith.material.opacity > 0.01;
  if (thunderT >= 0) { thunderT -= dt; if (thunderT < 0) Snd.thunder(thunderV, thunderPan); }

  let km = 0;
  if (kraken.active) { const P = shipPose(kraken.tg); km = kraken.tg === myId ? 1 : P ? clamp(1.2 - distTo(P.x, P.z) / 120, 0, 1) : 0; }
  krakenMix += (km - krakenMix) * Math.min(1, dt * 0.8);
  const fl = Math.min(1, flash * 0.7 * FLASHK);
  tmpC.copy(FOG_NIGHT).lerp(FOG_KRAKEN, krakenMix).lerp(FOG_DAWN, S.dawn).lerp(FOG_FLASH, fl);
  scene.fog.color.copy(tmpC); scene.background.copy(tmpC);
  scene.fog.density = lerp(0.021 + S.skulls * 0.0016 + krakenMix * 0.006, 0.0135, S.dawn);
  ambient.color.copy(AMB_NIGHT).lerp(AMB_DAWN, S.dawn);
  ambient.intensity = 0.85 + flash * 2.2 * FLASHK + S.dawn * 0.7;
  moonLight.intensity = 0.5 + flash * 1.6 * FLASHK + S.dawn * 0.5;
  storm = 1 + krakenMix * 0.35 - S.dawn * 0.4;
  rain.material.opacity = 0.28 * (1 - S.dawn);
  moonDisc.position.copy(camera.position).addScaledVector(MOON_DIR, 320); moonHalo.position.copy(moonDisc.position);
  moonDisc.material.opacity = 0.55 * (1 - S.dawn); moonHalo.material.opacity = 0.28 * (1 - S.dawn);
  sunGlow.position.copy(camera.position).add(tmpV.set(-MOON_DIR.x, 0.06, -MOON_DIR.z).normalize().multiplyScalar(320)); sunGlow.material.opacity = S.dawn * 0.8;

  const f = focus();
  updateOcean(T, f.x, f.z);
  updateRain(dt);
  for (const I of islands) {
    if (!I.skull || I.taken) continue;
    I.beam.material.opacity = 0.07 + 0.04 * Math.sin(T * 2 + I.x);
    const shake = (S.haulP > 0 && Math.hypot(player.x - I.sx, player.z - I.sz) < HAUL_R) ? S.haulP : 0;
    I.skullMesh.position.set(Math.sin(T * 40) * 0.06 * shake, 3.6 + Math.sin(T * 1.5) * 0.15 + shake * 0.8, 0);
    I.skullMesh.rotation.y = Math.sin(T * 0.5) * 0.4;
    I.flames.forEach((fl2, k) => { const s = 1.4 + Math.random() * 0.5 + Math.sin(T * 9 + k) * 0.2; fl2.scale.set(s, s * 1.3, 1); });
  }
  updateParts(dt);

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  hurt = Math.max(0, hurt - dt * 1.4); $('hurt').style.opacity = hurt.toFixed(2);
}
function strike() {
  const a = camYaw + rand(-1.1, 1.1), d = rand(60, 120);
  makeBolt(camera.position.x + Math.sin(a) * d, camera.position.z + Math.cos(a) * d);
  flashT = 0; flashQ = [{ at: 0, v: rand(0.7, 1) }, { at: rand(0.08, 0.12), v: rand(0.5, 0.9) }, { at: rand(0.2, 0.3), v: rand(0.4, 1) }];
  wraithOn = S.mode === 'play' && Math.random() < 0.3;
  if (wraithOn) { const sa = camYaw + rand(-0.5, 0.5); wraith.position.set(camera.position.x + Math.sin(sa) * 110, 13, camera.position.z + Math.cos(sa) * 110); }
  thunderT = rand(0.3, 1.6); thunderV = clamp(1.3 - d / 120, 0.35, 1); thunderPan = clamp(-Math.sin(wrapA(a - camYaw)), -0.8, 0.8);
}

// ---------- camera ----------
const cam = { yawOff: 0, pitch: 0.3, dist: 19, drag: false, lx: 0, ly: 0, idle: 0, shake: 0 };
const camT = new THREE.Vector3(), look = new THREE.Vector3();
// what the camera follows: your ship, or a crewmate's while you ride the Ferry
function focus() {
  if (S.mode === 'ferry') for (const R of remotes.values()) if (R.seen && R.st === 'sail') return { x: R.x, z: R.z, h: R.h, y: R.grp.position.y };
  return { x: player.x, z: player.z, h: player.h, y: player.grp.position.y };
}
function updateCamera(dt) {
  const f = focus();
  let pitch = cam.pitch, dist = cam.dist;
  if (S.mode === 'title') { camYaw = f.h + 2.4 + T * 0.05; pitch = 0.2; dist = 24; }
  else { if (!cam.drag) { cam.idle += dt; if (cam.idle > 2.5) cam.yawOff *= Math.pow(0.35, dt); } camYaw = f.h + cam.yawOff; }
  const py = Math.max(f.y, -1) + 3, cd = Math.cos(pitch) * dist;
  camT.set(f.x - Math.sin(camYaw) * cd, py + Math.sin(pitch) * dist, f.z - Math.cos(camYaw) * cd);
  camera.position.lerp(camT, 1 - Math.pow(0.0015, dt));
  const wy = waveH(camera.position.x, camera.position.z, T) + 1.5; if (camera.position.y < wy) camera.position.y = wy;
  look.set(f.x + Math.sin(f.h) * 3, py + 0.5, f.z + Math.cos(f.h) * 3);
  camera.lookAt(look);
  if (cam.shake > 0 && !REDUCED) { const k = cam.shake * 0.25; camera.position.x += rand(-k, k); camera.position.y += rand(-k, k); camera.position.z += rand(-k, k); }
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
}

// ---------- HUD ----------
const EL = {}; ['gold', 'skulls', 'sailBar', 'waterBar', 'waterWrap', 'holes', 'gunL', 'gunR', 'gunLW', 'gunRW', 'dist', 'compass', 'crew'].forEach(id => { EL[id] = $(id); });
const CSS = getComputedStyle(document.documentElement), tok = n => CSS.getPropertyValue(n).trim();
const COL = { bone: tok('--bone') || '#e4dbc4', spectre: tok('--spectre') || '#7affc8', ember: tok('--ember') || '#ffa552', blood: tok('--blood') || '#e0483e', abyss: tok('--abyss') || '#05090b' };
const SKULL_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2C5.6 2 3 5 3 8.6c0 2.2 1 3.6 2.4 4.4V16h2v-1.6h1.2V16h2.8v-1.6h1.2V16h2v-3c1.4-.8 2.4-2.2 2.4-4.4C17 5 14.4 2 10 2z"/><circle class="eye" cx="7.3" cy="9" r="1.6"/><circle class="eye" cx="12.7" cy="9" r="1.6"/></svg>';
const cache = {};
function setText(el, v) { if (el._t !== v) { el._t = v; el.textContent = v; } }
function setW(el, f) { const v = Math.round(clamp(f, 0, 1) * 1000) / 10; if (el._w !== v) { el._w = v; el.style.width = v + '%'; } }
const cg = EL.compass.getContext('2d');
function sizeCompass() { const r = EL.compass.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); EL.compass.width = Math.max(1, Math.round(r.width * d)); EL.compass.height = Math.max(1, Math.round(r.height * d)); }
function drawCompass() {
  const W = EL.compass.width, H = EL.compass.height, k = H / 38, span = 1.7, base = H * 0.6;
  const f = focus();
  cg.clearRect(0, 0, W, H);
  const toX = rel => W / 2 + rel / span * W;
  cg.lineWidth = k; cg.strokeStyle = 'rgba(228,219,196,.35)'; cg.beginPath(); cg.moveTo(0, base); cg.lineTo(W, base); cg.stroke();
  cg.textAlign = 'center'; cg.font = `${15 * k}px "IM Fell English SC", Georgia, serif`;
  for (let deg = 0; deg < 360; deg += 15) {
    const rel = wrapA(camYaw + deg * Math.PI / 180);
    if (Math.abs(rel) > span / 2) continue;
    const x = toX(rel), major = deg % 90 === 0;
    cg.strokeStyle = major ? COL.bone : 'rgba(228,219,196,.4)';
    cg.beginPath(); cg.moveTo(x, base); cg.lineTo(x, H * (major ? 0.4 : 0.48)); cg.stroke();
    if (major) { cg.fillStyle = deg === 0 ? COL.ember : COL.bone; cg.fillText('NESW'[deg / 90], x, H * 0.34); }
  }
  cg.fillStyle = COL.bone; cg.beginPath(); cg.moveTo(W / 2, base + 2 * k); cg.lineTo(W / 2 - 4 * k, base + 8 * k); cg.lineTo(W / 2 + 4 * k, base + 8 * k); cg.closePath(); cg.fill();
  const mark = (x, z, col, kind) => {
    let rel = wrapA(camYaw - Math.atan2(x - f.x, z - f.z));
    const edge = Math.abs(rel) > span / 2; if (edge) rel = Math.sign(rel) * span / 2;
    const px = clamp(toX(rel), 7 * k, W - 7 * k), py = H * 0.82;
    cg.fillStyle = col; cg.globalAlpha = edge ? 0.6 : 1;
    if (kind === 'skull') { cg.beginPath(); cg.arc(px, py - k, 5 * k, 0, TAU); cg.fill(); cg.fillRect(px - 3 * k, py + 2 * k, 6 * k, 3 * k); cg.fillStyle = COL.abyss; cg.beginPath(); cg.arc(px - 2 * k, py - k, 1.4 * k, 0, TAU); cg.arc(px + 2 * k, py - k, 1.4 * k, 0, TAU); cg.fill(); }
    else if (kind === 'crew') { cg.beginPath(); cg.moveTo(px, py - 5 * k); cg.lineTo(px + 4 * k, py + 3 * k); cg.lineTo(px - 4 * k, py + 3 * k); cg.closePath(); cg.fill(); }
    else { cg.beginPath(); cg.arc(px, py, (kind === 'ghost' ? 3.2 : 2.4) * k, 0, TAU); cg.fill(); }
    cg.globalAlpha = 1;
  };
  for (const L of loot) mark(L.x, L.z, COL.ember, 'loot');
  for (const G of ghosts) if (!G.sinking) mark(G.x, G.z, COL.blood, 'ghost');
  for (const R of remotes.values()) if (R.seen && R.st !== 'ferry') mark(R.x, R.z, CREW_HEX[(crewInfo.get(R.id) || {}).color] || COL.bone, 'crew');
  for (const I of islands) if (I.skull && !I.taken) mark(I.sx, I.sz, COL.spectre, 'skull');
}
function statusOf(st, holes) { return st === 'ferry' ? 'on the Ferry' : st === 'sinking' ? 'sinking' : holes ? `${holes} ${holes === 1 ? 'hole' : 'holes'}` : ''; }
function crewHud() {
  if (!NET) { EL.crew.hidden = true; return; }
  const rows = [];
  for (const [id, c] of crewInfo) {
    let st = '';
    if (id === myId) st = statusOf(S.mode === 'ferry' ? 'ferry' : S.mode === 'sinking' ? 'sinking' : 'sail', S.holes);
    else { const R = remotes.get(id); if (R && R.seen) st = statusOf(R.st, R.ho); }
    rows.push([c.name + (id === myId ? ' (you)' : ''), c.color, st]);
  }
  const sig = JSON.stringify(rows);
  if (cache.crew === sig) return;
  cache.crew = sig;
  EL.crew.hidden = false;
  EL.crew.replaceChildren(...rows.map(([name, color, st]) => {
    const li = document.createElement('li');
    const dot = document.createElement('i'); dot.className = 'dot'; dot.style.background = CREW_HEX[color] || CREW_HEX[0];
    const nm = document.createElement('span'); nm.textContent = name;
    li.append(dot, nm);
    if (st) { const em = document.createElement('em'); em.textContent = st; li.append(em); }
    return li;
  }));
}
function hud() {
  if (S.mode === 'title') return;
  $('hud').classList.toggle('ferrying', S.mode === 'ferry');
  setText(EL.gold, String(S.gold));
  const sk = S.skulls + '/' + S.total;
  if (cache.sk !== sk) { cache.sk = sk; EL.skulls.innerHTML = Array.from({ length: S.total }, (_, i) => SKULL_SVG.replace('<svg', `<svg class="${i < S.skulls ? 'got' : ''}"`)).join(''); }
  setW(EL.sailBar, S.sail); setW(EL.waterBar, S.water / 100);
  EL.waterWrap.classList.toggle('danger', S.water > 60);
  setText(EL.holes, S.holes ? `${S.holes} ${S.holes === 1 ? 'hole' : 'holes'} below the waterline` : 'Hull is sound');
  EL.holes.classList.toggle('bad', S.holes > 0);
  setW(EL.gunL, 1 - S.coolL / COOL); setW(EL.gunR, 1 - S.coolR / COOL);
  EL.gunLW.classList.toggle('ready', S.coolL <= 0); EL.gunRW.classList.toggle('ready', S.coolR <= 0);
  let nd = Infinity; for (const I of islands) if (I.skull && !I.taken) nd = Math.min(nd, distTo(I.sx, I.sz));
  setText(EL.dist, S.mode === 'ferry' ? '' : nd < Infinity ? (nd < HAUL_R ? 'The cursed skull is within reach' : `Nearest cursed skull: ${Math.round(nd)} yards`) : '');
  drawCompass();
  crewHud();
}

// ---------- voyages ----------
function resetGame(seed) {
  ghosts.forEach(removeGhost); ghosts.length = 0;
  balls.forEach(b => scene.remove(b.mesh)); balls.length = 0;
  loot.forEach(L => scene.remove(L.grp)); loot.length = 0; lootGrabbed.clear();
  eyes.forEach(e => { e.s.forEach(sp => scene.remove(sp)); e.mat.dispose(); }); eyes.length = 0;
  clearKraken();
  islands.forEach(I => { scene.remove(I.grp); I.geos.forEach(g => g.dispose()); if (I.beam) { scene.remove(I.beam); I.beam.material.dispose(); } }); islands.length = 0;
  placeIslands(seed);
  Object.assign(player, { x: 0, z: 0, h: 0, speed: 0, sink: 0 });
  player.grp.visible = true;
  S = fresh(); S.seed = seed; S.total = islands.filter(I => I.skull).length;
  cargo.forEach(c => { c.visible = false; });
  parts.forEach(p => { p.life = 0; });
  for (const R of remotes.values()) { R.seen = false; R.sink = 0; }
  krakenMix = 0; flash = 0; hurt = 0; cache.sk = null; cache.crew = null;
  cam.yawOff = 0; cam.pitch = 0.3; cam.dist = 19;
}
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const newSeed = () => Math.floor(Math.random() * 2147483647);
function startVoyage(m) {
  Snd.init();
  resetGame(m.seed);
  pvp = !!m.pvp;
  PM.sail.color.copy(sailTint(myColor)); PM.skullSail.color.copy(sailTint(myColor));
  for (const i of m.tk || []) takeSkull(i);
  S.gold = m.g || 0;
  S.mode = 'play'; S.live = true; menuOpen = false;
  const at = m.at || safeSpot(CREW_X[myColor] || 0, 0, 0);
  Object.assign(player, { x: at.x, z: at.z, h: at.h });
  ['title', 'end', 'paused', 'lobby'].forEach(id => { $(id).hidden = true; });
  $('ferry').hidden = true;
  $('hud').classList.remove('off'); $('touch').hidden = !touchMode;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  banner(m.at ? 'You joined the voyage' : `Find the ${WORDS[S.total] || S.total} cursed skulls`, NET ? 'Follow the green skulls on your compass. The triangles are your crew.' : 'Follow the green skulls on your compass', 4.5);
  sizeCompass();
}
// the host (or a solo player) sets sail; the crew follows
function launchVoyage() {
  const seed = newSeed();
  if (NET && NET.isHost) NET.broadcast({ t: 'start', seed, pvp, tk: [], g: 0 });
  startVoyage({ seed, pvp });
  if (NET && NET.isHost) sendLobby();
}
function startSolo() { leaveCrew(); readName(); launchVoyage(); }
function showTitle(note) {
  ['end', 'paused', 'lobby'].forEach(id => { $(id).hidden = true; });
  $('title').hidden = false; $('hud').classList.add('off'); $('touch').hidden = true; $('ferry').hidden = true; setPrompt('');
  const n = $('netNote'); n.hidden = !note; n.textContent = note || '';
  showBest();
}
function backToTitle(note) {
  leaveCrew();
  resetGame(newSeed());
  showTitle(note);
}

// ---------- crews ----------
const NAMES = ['Captain Bones', 'Salty Meg', 'One-Eyed Jo', 'Barnacle Bill', 'Stormy Kate', 'Bilge Rat Ben', 'Mad Molly', 'Old Rattlebones'];
function readName() {
  let v = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!v) { v = NAMES[Math.floor(Math.random() * NAMES.length)]; $('nameIn').value = v; }
  try { localStorage.setItem('seaName', v); } catch (e) {}
  myName = v;
  return v;
}
function leaveCrew() {
  if (NET) { const n = NET; NET = null; n.close(); }
  AUTH = true; myId = 'h'; myColor = 0; pvp = false; menuOpen = false; crewCode = '';
  for (const id of [...remotes.keys()]) removeRemote(id);
  crewInfo.clear();
  PM.sail.color.set(0xffffff); PM.skullSail.color.set(0xffffff);
}
function inviteLink() {
  if (!crewCode || !/^https?:$/.test(location.protocol)) return '';
  const u = new URL(location.href); u.hash = ''; u.searchParams.set('join', crewCode);
  return u.href;
}
function lobbyStatus(text, bad) { const s = $('lobbyStatus'); s.textContent = text || ''; s.classList.toggle('err', !!bad); }
function renderLobby() {
  const host = NET && NET.isHost;
  $('lobbyCode').textContent = crewCode || '·····';
  const link = inviteLink();
  $('inviteRow').hidden = !host || !link;
  $('inviteIn').value = link;
  $('lobbyLede').textContent = host
    ? (link ? 'Send your friends the link. They open it, type a name and press Join. Or they can open the game, press Join a crew and type the code.' : 'Friends open the game, press Join a crew and type this code.')
    : 'Waiting for the captain to set sail.';
  const list = $('crewList');
  list.replaceChildren(...[...crewInfo].map(([id, c]) => {
    const li = document.createElement('li');
    const dot = document.createElement('i'); dot.className = 'dot'; dot.style.background = CREW_HEX[c.color] || CREW_HEX[0];
    const nm = document.createElement('span'); nm.textContent = c.name;
    li.append(dot, nm);
    const tags = [id === 'h' ? 'captain' : '', id === myId ? 'you' : ''].filter(Boolean).join(', ');
    if (tags) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tags; li.append(t); }
    return li;
  }));
  $('pvpIn').checked = pvp; $('pvpIn').disabled = !host;
  $('launchBtn').hidden = !host;
  $('pauseCrew').hidden = !NET;
  $('pauseCode').textContent = crewCode;
  $('pauseInvite').hidden = !host || !link;
  $('pauseLink').value = link;
}
function sendLobby() {
  if (!NET || !NET.isHost) return;
  NET.broadcast({ t: 'lobby', code: crewCode, crew: [...crewInfo].map(([id, c]) => ({ id, name: c.name, c: c.color })), pvp });
  renderLobby();
}
function showLobby() {
  ['title', 'end', 'paused'].forEach(id => { $(id).hidden = true; });
  $('lobby').hidden = false;
  renderLobby();
}
async function hostCrew() {
  if (!window.SeaNet) { showTitle("Multiplayer couldn't load. Reload the page and try again."); return; }
  readName(); Snd.init();
  leaveCrew();
  const net = new SeaNet.Host(myName);
  NET = net; AUTH = true; myId = 'h'; myColor = 0;
  crewInfo.set('h', { name: myName, color: 0 });
  net.on('status', m => { if (!$('lobby').hidden) lobbyStatus(m.text); });
  net.on('join', m => {
    crewInfo.set(m.id, { name: m.name, color: m.color });
    sendLobby();
    if (S.live) {
      const ships = crewShips();
      net.send(m.id, { t: 'start', seed: S.seed, pvp, tk: takenList(), g: S.gold, at: ships.length ? spotNear(ships[0]) : null });
      if (S.mode !== 'over') toast(`${m.name} joined the crew`);
    }
  });
  net.on('leave', m => {
    const name = crewName(m.id);
    crewInfo.delete(m.id); removeRemote(m.id); sendLobby();
    if (S.live && S.mode !== 'over') toast(`${name} left the crew`);
  });
  net.on('me', m => applyShip(Object.assign({}, m, { id: m.from })));
  net.on('vol', m => { net.broadcast({ t: 'vol', by: m.from, b: m.b }, m.from); spawnVolley(m.from, m.b); });
  net.on('haul', m => { if (S.live && !S.won) collectSkull(m.i, m.from); });
  net.on('grab', m => { const L = loot.find(l => l.id === m.id); if (L) grabLoot(L, m.from); });
  showLobby();
  lobbyStatus('Contacting the matchmaking server...');
  try {
    const code = await net.open();
    if (NET !== net) return;
    crewCode = code;
    sendLobby();
  } catch (e) {
    if (NET !== net) return;
    backToTitle(e.message);
  }
}
async function joinCrew(code) {
  if (!window.SeaNet) { showTitle("Multiplayer couldn't load. Reload the page and try again."); return; }
  code = SeaNet.cleanCode(code);
  if (code.length !== 5) { showTitle('A crew code is 5 letters. Check it with the captain and try again.'); $('joinForm').hidden = false; return; }
  readName(); Snd.init();
  leaveCrew();
  const net = new SeaNet.Guest(myName, code);
  NET = net; AUTH = false; crewCode = code;
  net.on('status', m => { if (!$('lobby').hidden) lobbyStatus(m.text); });
  net.on('lobby', m => {
    const before = new Map(crewInfo);
    crewInfo.clear();
    for (const c of m.crew) crewInfo.set(c.id, { name: c.name, color: c.c });
    for (const id of [...remotes.keys()]) if (!crewInfo.has(id)) removeRemote(id);
    pvp = !!m.pvp;
    if (S.live && S.mode !== 'over' && before.size) {
      for (const [id, c] of crewInfo) if (!before.has(id) && id !== myId) toast(`${c.name} joined the crew`);
      for (const [id, c] of before) if (!crewInfo.has(id)) toast(`${c.name} left the crew`);
    }
    renderLobby();
  });
  net.on('start', m => startVoyage(m));
  net.on('snap', m => { if (S.live) applySnap(m); });
  net.on('vol', m => spawnVolley(m.by, m.b));
  net.on('ev', m => { if (S.live) onEvent(m); });
  net.on('closed', m => { if (NET === net) backToTitle(m.text); });
  showLobby();
  lobbyStatus('Contacting the matchmaking server...');
  try {
    const w = await net.connect();
    if (NET !== net) return;
    myId = w.id; myColor = w.color;
    lobbyStatus("You're in the crew. The captain sets sail when everyone's ready.");
    renderLobby();
  } catch (e) {
    if (NET !== net) return;
    backToTitle(e.message);
  }
}
// what the host sends ten times a second
function snapMsg() {
  const s = [];
  if (S.mode !== 'title') s.push(myState());
  for (const R of remotes.values()) if (R.raw) s.push(R.raw);
  return {
    t: 'snap', s, g: S.gold, tk: takenList(),
    gh: ghosts.map(G => [G.id, r2(G.x), r2(G.z), r3(G.h), r2(G.speed), r2(Math.max(0, G.fade)), G.sinking ? (G.dismissed ? 2 : 1) : 0]),
    k: kraken.active ? { tg: kraken.tg, ts: kraken.tentacles.map(Tn => [Tn.n, r3(Tn.angle), r2(Tn.r0), Tn.hp, Tn.alive ? 1 : 0, r2(Tn.rise), r2(Tn.slamP), r2(Tn.curl), r2(Tn.phase)]) } : null,
    lo: loot.map(L => [L.id, L.x, L.z]),
  };
}
function applySnap(m) {
  for (const s of m.s) applyShip(s);
  S.gold = m.g;
  for (const i of m.tk) takeSkull(i);
  // ghost ships
  const seen = new Set();
  for (const [id, x, z, h, sp, fade, sinking] of m.gh) {
    seen.add(id);
    let G = ghosts.find(g => g.id === id);
    if (!G) G = makeGhost(id, x, z, h);
    else if (Math.hypot(G.x - x, G.z - z) > 25) { G.x = x; G.z = z; G.h = h; }
    G.tx = x; G.tz = z; G.th = h; G.speed = sp; G.tfade = fade;
    if (sinking && !G.sinking) { G.sinking = true; G.dismissed = sinking === 2; }
  }
  for (const G of ghosts) if (!seen.has(G.id)) G.gone = true;
  // the Kraken
  const k = m.k;
  if (!k) kraken.tentacles.forEach(t => { t.alive = false; });
  else {
    if (!kraken.active || kraken.tg !== k.tg) { clearKraken(); kraken.active = true; kraken.tg = k.tg; }
    const tseen = new Set();
    for (const [n, a, r0, hp, al, rise, slamP, curl, phase] of k.ts) {
      tseen.add(n);
      if (kraken.removed.has(n)) continue;
      let Tn = kraken.tentacles.find(t => t.n === n);
      if (!Tn) { Tn = makeTentacle(n, a, r0, curl, phase, rise, 99); kraken.tentacles.push(Tn); }
      Tn.hp = hp; Tn.alive = !!al; Tn.slamP = slamP;
      if (Math.abs(Tn.rise - rise) > 0.25) Tn.rise = rise;
    }
    for (const t of kraken.tentacles) if (!tseen.has(t.n)) t.alive = false;
  }
  // barrels
  const lseen = new Set();
  for (const [id, x, z] of m.lo) { lseen.add(id); if (!lootGrabbed.has(id) && !loot.some(L => L.id === id)) makeLoot(id, x, z); }
  for (const L of [...loot]) if (!lseen.has(L.id)) removeLoot(L);
}
let netAcc = 0;
function netTick(dt) {
  if (!NET || !S.live) return;
  netAcc += dt;
  if (NET.isHost) { if (netAcc >= 0.1) { netAcc = 0; NET.broadcast(snapMsg()); } }
  else if (netAcc >= 0.083) { netAcc = 0; if (S.mode !== 'over') NET.send(Object.assign({ t: 'me' }, myState())); }
}

// ---------- menus and input ----------
let prevMode = 'play';
function setPaused(p) {
  if (NET) {
    // a crew's sea doesn't stop: this just opens the menu over the game
    if (p && !menuOpen && S.live && S.mode !== 'over') { menuOpen = true; for (const k in keys) keys[k] = false; $('pauseTitle').textContent = 'Menu'; $('pauseLede').textContent = 'Your crew is still sailing. So are the ghosts.'; $('pauseLeave').hidden = false; renderLobby(); $('paused').hidden = false; $('resumeBtn').focus(); }
    else if (!p && menuOpen) { menuOpen = false; $('paused').hidden = true; }
    return;
  }
  if (p && S.mode !== 'paused' && sailing()) { prevMode = S.mode; S.mode = 'paused'; $('pauseTitle').textContent = 'Paused'; $('pauseLede').textContent = 'The fog waits for you.'; $('pauseLeave').hidden = true; $('pauseCrew').hidden = true; $('paused').hidden = false; for (const k in keys) keys[k] = false; $('resumeBtn').focus(); if (Snd.ac) Snd.ac.suspend(); }
  else if (!p && S.mode === 'paused') { S.mode = prevMode; $('paused').hidden = true; if (Snd.ac) Snd.ac.resume(); last = performance.now(); }
}
const isPaused = () => NET ? menuOpen : S.mode === 'paused';
function toggleMute() { Snd.mute(!Snd.on); $('muteBtn').textContent = Snd.on ? 'Mute' : 'Unmute'; }
function copyLink(input, btn) {
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1800); };
  const fallback = () => { input.focus(); input.select(); btn.textContent = 'Press Ctrl+C'; };
  try { navigator.clipboard.writeText(input.value).then(done, fallback); } catch (e) { fallback(); }
}

$('startBtn').addEventListener('click', startSolo);
$('hostBtn').addEventListener('click', hostCrew);
$('joinOpenBtn').addEventListener('click', () => { const f = $('joinForm'); f.hidden = !f.hidden; if (!f.hidden) $('codeIn').focus(); });
$('joinForm').addEventListener('submit', e => { e.preventDefault(); joinCrew($('codeIn').value); });
$('codeIn').addEventListener('input', () => { const v = $('codeIn').value, c = window.SeaNet ? SeaNet.cleanCode(v) : v; if (c !== v) $('codeIn').value = c; });
$('launchBtn').addEventListener('click', () => { if (NET && NET.isHost) launchVoyage(); });
$('leaveBtn').addEventListener('click', () => backToTitle(''));
$('pvpIn').addEventListener('change', () => { if (NET && NET.isHost) { pvp = $('pvpIn').checked; sendLobby(); } });
$('copyBtn').addEventListener('click', () => copyLink($('inviteIn'), $('copyBtn')));
$('pauseCopy').addEventListener('click', () => copyLink($('pauseLink'), $('pauseCopy')));
$('againBtn').addEventListener('click', () => { if (NET && NET.isHost) launchVoyage(); else if (!NET) startSolo(); });
$('endLeave').addEventListener('click', () => backToTitle(''));
$('pauseLeave').addEventListener('click', () => backToTitle(''));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('pauseBtn').addEventListener('click', () => setPaused(!isPaused()));
$('muteBtn').addEventListener('click', toggleMute);
$('fsBtn').addEventListener('click', () => {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  try {
    if (!document.fullscreenElement && req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  } catch (e) {}
});

const KEYMAP = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', ' ': 'space', spacebar: 'space' };
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  let k = (e.key || '').toLowerCase(); k = KEYMAP[k] || k;
  const inGame = S.live && ['play', 'won', 'sinking', 'ferry', 'paused'].includes(S.mode);
  if (inGame && (k === 'space' || ('wasdqerf'.includes(k) && k.length === 1) || (e.key || '').startsWith('Arrow'))) e.preventDefault();
  if (!inGame) return;
  if (k === 'p' || k === 'escape') { setPaused(!isPaused()); return; }
  if (k === 'm') { toggleMute(); return; }
  if (e.repeat || isPaused()) return;
  keys[k] = true;
  if (k === 'space') fireAuto();
});
addEventListener('keyup', e => { let k = (e.key || '').toLowerCase(); k = KEYMAP[k] || k; keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// solo pauses when you switch tabs; a crew keeps sailing
document.addEventListener('visibilitychange', () => { if (document.hidden && !NET && S.mode === 'play') setPaused(true); });

const canvas = $('c');
canvas.addEventListener('pointerdown', e => { cam.drag = true; cam.lx = e.clientX; cam.ly = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
canvas.addEventListener('pointermove', e => {
  if (!cam.drag) return;
  cam.yawOff -= (e.clientX - cam.lx) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - cam.ly) * 0.004, 0.06, 1.1);
  cam.lx = e.clientX; cam.ly = e.clientY; cam.idle = 0;
});
const endDrag = () => { cam.drag = false; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.08 : 0.93), 10, 34); }, { passive: false });

function enableTouch() { if (touchMode) return; touchMode = true; document.body.classList.add('touch'); if (sailing()) $('touch').hidden = false; }
if (matchMedia('(pointer: coarse)').matches) enableTouch();
addEventListener('touchstart', enableTouch, { passive: true, once: true });
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) {} };
  const off = () => { keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', e => e.preventDefault());
});

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); sizeCompass(); }
addEventListener('resize', resize);

// ---------- main loop ----------
function simulate(dt) {
  T += dt;
  if (S.live && ['play', 'won', 'sinking', 'ferry'].includes(S.mode)) stepGame(dt);
  stepWorldRules(dt);
  if (S.mode !== 'title') stepEntities(dt);
  stepRemotes(dt);
  stepWorld(dt);
  netTick(dt);
}
let last = performance.now(), perfAcc = 0, perfN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, Math.max(0, raw));
  if (raw < 0.25) { perfAcc += raw; perfN++; }
  if (perfN >= 90) { if (perfAcc / perfN > 0.028 && DPR > 0.6) { DPR = Math.max(0.6, DPR - 0.2); renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight, false); } perfAcc = 0; perfN = 0; }
  if (S.mode !== 'paused') simulate(dt);
  updateCamera(dt);
  hud();
  renderer.render(scene, camera);
}
// Browsers stop drawing hidden tabs. In a crew the sea has to keep moving
// (the host runs it for everyone), so a worker keeps it ticking.
const hiddenTick = () => {
  if (!document.hidden || !NET) return;
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  simulate(dt);
};
if (window.SeaNet) SeaNet.workerTicker(hiddenTick, 50); else setInterval(hiddenTick, 50);

// ---------- start ----------
try { $('nameIn').value = localStorage.getItem('seaName') || ''; } catch (e) {}
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam && window.SeaNet) {
  $('codeIn').value = SeaNet.cleanCode(joinParam);
  $('joinForm').hidden = false;
  $('netNote').hidden = false;
  $('netNote').textContent = `You've been invited to crew ${SeaNet.cleanCode(joinParam)}. Type your pirate name, then press Join.`;
}
if (!window.SeaNet || !window.Peer) { $('hostBtn').disabled = true; $('joinOpenBtn').disabled = true; }
placeIslands(newSeed()); S.total = islands.filter(I => I.skull).length;
sizeCompass();
requestAnimationFrame(frame);
})();
