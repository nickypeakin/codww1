'use strict';
// The arena: level geometry, collision, ray casts and bot navigation.
// Everything solid is an axis-aligned box, which keeps physics and hit
// detection simple and fast enough for school laptops.

const World = (() => {
  const boxes = [];
  const smokes = []; // { x, y, z, r, scale } - blocks sight, not bullets

  function addBox(cx, cz, sx, sz, h, y0, mat) {
    boxes.push({
      min: [cx - sx / 2, y0, cz - sz / 2],
      max: [cx + sx / 2, y0 + h, cz + sz / 2],
      mat,
    });
  }

  // The map is point-symmetric: every piece on the west half has a twin
  // rotated 180 degrees on the east half, so neither spawn has an edge.
  function twin(cx, cz, sx, sz, h, y0, mat) {
    addBox(cx, cz, sx, sz, h, y0, mat);
    addBox(-cx, -cz, sx, sz, h, y0, mat);
  }

  addBox(0, 0, 66, 42, 1, -1, 'floor');
  addBox(0, -20.5, 66, 1, 8, 0, 'outer');
  addBox(0, 20.5, 66, 1, 8, 0, 'outer');
  addBox(-32.5, 0, 1, 42, 8, 0, 'outer');
  addBox(32.5, 0, 1, 42, 8, 0, 'outer');

  // Mid platform, with stairs up both sides
  addBox(0, 0, 4, 4, 1.8, 0, 'platform');
  twin(-2.4, 0, 0.8, 2, 1.35, 0, 'step');
  twin(-3.2, 0, 0.8, 2, 0.9, 0, 'step');
  twin(-4.0, 0, 0.8, 2, 0.45, 0, 'step');

  // Spawn
  twin(-24, 0, 1, 12, 4.5, 0, 'wall');
  twin(-26, -9, 2, 2, 1.4, 0, 'crate');
  twin(-27, 8, 1.5, 3, 2.2, 0, 'accent');

  // Lane dividers (the south one has a window to peek through)
  twin(-13, -10, 14, 1, 5, 0, 'wall');
  twin(-17.5, 10, 5, 1, 5, 0, 'wall');
  twin(-14, 10, 2, 1, 1.1, 0, 'wall');
  twin(-14, 10, 2, 1, 2.9, 2.1, 'wall');
  twin(-11.5, 10, 3, 1, 5, 0, 'wall');

  // Mid cover
  twin(-10, -4, 2, 2, 1.2, 0, 'crate');
  twin(-10.3, -3.7, 1.2, 1.2, 0.9, 1.2, 'crate2');
  twin(-15, 3, 1.6, 1.6, 1.6, 0, 'crate');
  twin(-6, 5, 3, 1, 1.0, 0, 'concrete');

  // A lane (north side of your half)
  twin(-15, -15, 2, 2, 1.0, 0, 'crate');
  twin(-9, -17.5, 2, 5, 3, 0, 'accent');
  twin(-3, -13, 1.2, 1.2, 5, 0, 'pillar');
  twin(-21, -16, 1.6, 1.6, 1.6, 0, 'crate2');

  // B lane (south side of your half)
  twin(-18, 15, 2, 2, 1.0, 0, 'crate');
  twin(-12, 17, 1.6, 1.6, 1.6, 0, 'crate2');
  twin(-6, 15.5, 1, 5, 3.5, 0, 'accent');
  twin(-2, 12.5, 2.5, 1, 1.1, 0, 'concrete');

  // ---------------------------------------------------------------- rays

  let rayAxis = 0, raySign = 0;

  // Slab test. Returns the entry distance, or -1 for a miss (or when the
  // ray starts inside the box). Sets rayAxis/raySign for the hit normal.
  // (Unrolled per axis: this runs thousands of times a frame and must not
  // allocate.)
  function rayBox(ox, oy, oz, dx, dy, dz, mn, mx, maxT) {
    let tmin = 0, tmax = maxT, axis = -1, sign = 0, t1, t2, s, tt;
    if (dx === 0) {
      if (ox < mn[0] || ox > mx[0]) return -1;
    } else {
      t1 = (mn[0] - ox) / dx; t2 = (mx[0] - ox) / dx; s = -1;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (dy === 0) {
      if (oy < mn[1] || oy > mx[1]) return -1;
    } else {
      t1 = (mn[1] - oy) / dy; t2 = (mx[1] - oy) / dy; s = -1;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (dz === 0) {
      if (oz < mn[2] || oz > mx[2]) return -1;
    } else {
      t1 = (mn[2] - oz) / dz; t2 = (mx[2] - oz) / dz; s = -1;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (axis < 0) return -1;
    rayAxis = axis;
    raySign = sign;
    return tmin;
  }

  const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, box: null };

  // Nearest wall/floor hit along a normalized direction. The result object
  // is reused, so copy anything you need before the next call.
  function raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, found = null, axis = 0, sign = 0;
    for (const b of boxes) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.min, b.max, best);
      if (t >= 0 && t < best) {
        best = t;
        found = b;
        axis = rayAxis;
        sign = raySign;
      }
    }
    if (!found) return null;
    hit.t = best;
    hit.box = found;
    hit.x = ox + dx * best;
    hit.y = oy + dy * best;
    hit.z = oz + dz * best;
    hit.nx = axis === 0 ? sign : 0;
    hit.ny = axis === 1 ? sign : 0;
    hit.nz = axis === 2 ? sign : 0;
    return hit;
  }

  function smokeBlocks(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
    for (const s of smokes) {
      const r = s.r * s.scale;
      if (r < 0.5) continue;
      let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t - s.x, cy = ay + dy * t - s.y, cz = az + dz * t - s.z;
      if (cx * cx + cy * cy + cz * cz < r * r) return true;
    }
    return false;
  }

  function lineOfSight(ax, ay, az, bx, by, bz, ignoreSmoke) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    if (raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.02)) return false;
    return ignoreSmoke || !smokeBlocks(ax, ay, az, bx, by, bz);
  }

  function groundHeight(x, z, fromY) {
    const h = raycast(x, fromY, z, 0, -1, 0, 50);
    return h ? h.y : 0;
  }

  // ------------------------------------------------------------- physics

  function bodyOverlaps(f, b, h) {
    const r = MOVE.radius;
    return f.pos.x - r < b.max[0] && f.pos.x + r > b.min[0] &&
      f.pos.y < b.max[1] && f.pos.y + h > b.min[1] &&
      f.pos.z - r < b.max[2] && f.pos.z + r > b.min[2];
  }

  function bodyBlocked(f, h) {
    for (const b of boxes) if (bodyOverlaps(f, b, h)) return true;
    return false;
  }

  function resolveHorizontal(f, axis, delta) {
    const h = f.height, key = axis === 0 ? 'x' : 'z';
    for (const b of boxes) {
      if (!bodyOverlaps(f, b, h)) continue;
      // Walk up stairs and small ledges
      const rise = b.max[1] - f.pos.y;
      if (f.onGround && rise > 0 && rise <= MOVE.stepUp) {
        const oldY = f.pos.y;
        f.pos.y = b.max[1] + 1e-4;
        if (!bodyBlocked(f, h)) continue;
        f.pos.y = oldY;
      }
      f.pos[key] = delta > 0 ? b.min[axis] - MOVE.radius - 1e-4 : b.max[axis] + MOVE.radius + 1e-4;
      f.vel[key] = 0;
    }
  }

  // Moves a fighter by its velocity, axis by axis, sliding along walls.
  function moveBody(f, dt) {
    const dx = f.vel.x * dt;
    if (dx) { f.pos.x += dx; resolveHorizontal(f, 0, dx); }
    const dz = f.vel.z * dt;
    if (dz) { f.pos.z += dz; resolveHorizontal(f, 2, dz); }

    f.vel.y -= MOVE.gravity * dt;
    const dy = f.vel.y * dt;
    f.pos.y += dy;
    const wasGround = f.onGround;
    f.onGround = false;
    const h = f.height;
    for (const b of boxes) {
      if (!bodyOverlaps(f, b, h)) continue;
      if (dy <= 0) {
        f.pos.y = b.max[1];
        if (!wasGround && f.vel.y < -6) f.landed = true;
        f.vel.y = 0;
        f.onGround = true;
      } else {
        f.pos.y = b.min[1] - h - 1e-4;
        f.vel.y = 0;
      }
    }
  }

  // ---------------------------------------------------------- navigation
  // A 1m grid over the floor, A* on top, then string-pulled into straight
  // segments. Only used by the bot.

  const NAV = { ox: -32, oz: -20, nx: 64, nz: 40 };
  const obstacles = boxes.filter(b => b.mat !== 'floor' && b.min[1] < 1.6);
  const walk = new Uint8Array(NAV.nx * NAV.nz);
  for (let j = 0; j < NAV.nz; j++) {
    for (let i = 0; i < NAV.nx; i++) {
      const cx = NAV.ox + i + 0.5, cz = NAV.oz + j + 0.5;
      const blocked = obstacles.some(b =>
        cx + 0.45 > b.min[0] && cx - 0.45 < b.max[0] && cz + 0.45 > b.min[2] && cz - 0.45 < b.max[2]);
      walk[j * NAV.nx + i] = blocked ? 0 : 1;
    }
  }

  function cellOf(x, z) {
    const i = Math.floor(x - NAV.ox), j = Math.floor(z - NAV.oz);
    if (i < 0 || j < 0 || i >= NAV.nx || j >= NAV.nz) return -1;
    return j * NAV.nx + i;
  }

  function nearestWalkable(x, z) {
    const c = cellOf(x, z);
    if (c >= 0 && walk[c]) return c;
    const ci = Math.floor(x - NAV.ox), cj = Math.floor(z - NAV.oz);
    for (let r = 1; r < 6; r++) {
      let best = -1, bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= NAV.nx || j >= NAV.nz) continue;
          const k = j * NAV.nx + i;
          if (!walk[k]) continue;
          const d = (i + 0.5 + NAV.ox - x) ** 2 + (j + 0.5 + NAV.oz - z) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  function clearLine2D(ax, az, bx, bz, r) {
    const dx = bx - ax, dz = bz - az;
    for (const b of obstacles) {
      let t0 = 0, t1 = 1;
      const mnx = b.min[0] - r, mxx = b.max[0] + r, mnz = b.min[2] - r, mxz = b.max[2] + r;
      if (Math.abs(dx) < 1e-9) {
        if (ax <= mnx || ax >= mxx) continue;
      } else {
        let ta = (mnx - ax) / dx, tb = (mxx - ax) / dx;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 >= t1) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (az <= mnz || az >= mxz) continue;
      } else {
        let ta = (mnz - az) / dz, tb = (mxz - az) / dz;
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 >= t1) continue;
      }
      return false;
    }
    return true;
  }

  function heapPush(h, f, i) {
    h.push([f, i]);
    let k = h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (h[p][0] <= h[k][0]) break;
      [h[p], h[k]] = [h[k], h[p]];
      k = p;
    }
  }

  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === k) break;
        [h[m], h[k]] = [h[k], h[m]];
        k = m;
      }
    }
    return top;
  }

  // Returns [{x, z}, ...] from (sx, sz) to (tx, tz), or null.
  function findPath(sx, sz, tx, tz) {
    const s = nearestWalkable(sx, sz), t = nearestWalkable(tx, tz);
    if (s < 0 || t < 0) return null;
    const N = NAV.nx * NAV.nz;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const ti = t % NAV.nx, tj = (t / NAV.nx) | 0;
    const hfn = k => {
      const dx = Math.abs(k % NAV.nx - ti), dz = Math.abs(((k / NAV.nx) | 0) - tj);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const open = [];
    g[s] = 0;
    heapPush(open, hfn(s), s);
    while (open.length) {
      const [, cur] = heapPop(open);
      if (cur === t) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % NAV.nx, cj = (cur / NAV.nx) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= NAV.nx || nj >= NAV.nz) continue;
          const nk = nj * NAV.nx + ni;
          if (!walk[nk] || closed[nk]) continue;
          // no cutting corners diagonally
          if (di && dj && (!walk[cj * NAV.nx + ni] || !walk[nj * NAV.nx + ci])) continue;
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if (ng < g[nk]) {
            g[nk] = ng;
            came[nk] = cur;
            heapPush(open, ng + hfn(nk), nk);
          }
        }
      }
    }
    if (came[t] < 0 && s !== t) return null;

    const pts = [];
    for (let k = t; k >= 0; k = came[k]) {
      pts.push({ x: NAV.ox + (k % NAV.nx) + 0.5, z: NAV.oz + ((k / NAV.nx) | 0) + 0.5 });
      if (k === s) break;
    }
    pts.reverse();
    pts[0] = { x: sx, z: sz };
    if (cellOf(tx, tz) === t) pts.push({ x: tx, z: tz });

    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !clearLine2D(pts[i].x, pts[i].z, pts[j].x, pts[j].z, 0.4)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  function randomPoint(minX, maxX, minZ, maxZ) {
    for (let n = 0; n < 60; n++) {
      const x = minX + Math.random() * (maxX - minX), z = minZ + Math.random() * (maxZ - minZ);
      const c = cellOf(x, z);
      if (c >= 0 && walk[c]) return { x: NAV.ox + (c % NAV.nx) + 0.5, z: NAV.oz + ((c / NAV.nx) | 0) + 0.5 };
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  }

  // ------------------------------------------------------------- visuals

  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function speckle(g, s, n, light, dark) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? light : dark;
      const w = 1 + Math.random() * 3;
      g.fillRect(Math.random() * s, Math.random() * s, w, w);
    }
  }

  function panelTex(base, line, opts = {}) {
    return canvasTex(256, (g, s) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      speckle(g, s, 900, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.06)');
      g.strokeStyle = line;
      g.lineWidth = opts.lineWidth || 3;
      const rows = opts.rows || 2, cols = opts.cols || 2;
      for (let r = 0; r <= rows; r++) {
        g.beginPath(); g.moveTo(0, r * s / rows); g.lineTo(s, r * s / rows); g.stroke();
      }
      for (let r = 0; r < rows; r++) {
        const off = opts.brick && r % 2 ? s / cols / 2 : 0;
        for (let c = 0; c <= cols; c++) {
          const x = c * s / cols + off;
          g.beginPath(); g.moveTo(x, r * s / rows); g.lineTo(x, (r + 1) * s / rows); g.stroke();
        }
      }
      if (opts.extra) opts.extra(g, s);
    });
  }

  function crateTex(base) {
    return canvasTex(256, (g, s) => {
      g.fillStyle = base;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 2;
      for (let y = 0; y < s; y += s / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
      speckle(g, s, 600, 'rgba(255,230,200,0.06)', 'rgba(60,30,10,0.08)');
      g.strokeStyle = 'rgba(40,20,5,0.55)';
      g.lineWidth = 18;
      g.strokeRect(9, 9, s - 18, s - 18);
      g.lineWidth = 14;
      g.beginPath(); g.moveTo(16, 16); g.lineTo(s - 16, s - 16); g.stroke();
    });
  }

  function makeMaterials() {
    const lam = (map, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
    return {
      floor: lam(panelTex('#b9aa8f', 'rgba(70,55,40,0.35)', { rows: 2, cols: 2, lineWidth: 2 })),
      outer: lam(panelTex('#c7b28f', 'rgba(90,68,45,0.3)', { rows: 4, cols: 2, brick: true })),
      wall: lam(panelTex('#e1d4bb', 'rgba(110,90,60,0.22)', { rows: 1, cols: 1 })),
      accent: lam(panelTex('#3f8c88', 'rgba(15,40,40,0.45)', {
        rows: 2, cols: 1,
        extra: (g, s) => {
          g.fillStyle = 'rgba(255,255,255,0.18)';
          for (const y of [s * 0.25, s * 0.75]) for (const x of [12, s - 12]) g.fillRect(x - 3, y - 3, 6, 6);
        },
      })),
      crate: lam(crateTex('#b5743f')),
      crate2: lam(crateTex('#8e5a33')),
      concrete: lam(panelTex('#a29f98', 'rgba(50,50,50,0.25)', { rows: 1, cols: 2 })),
      pillar: lam(panelTex('#38767e', 'rgba(10,30,35,0.4)', { rows: 1, cols: 4 })),
      platform: lam(panelTex('#8f8a80', 'rgba(40,35,30,0.35)', {
        rows: 2, cols: 2,
        extra: (g, s) => {
          g.fillStyle = '#e8b931';
          g.fillRect(0, 0, s, 10);
        },
      })),
      step: lam(panelTex('#a7a196', 'rgba(40,35,30,0.35)', { rows: 2, cols: 2 })),
    };
  }

  // BoxGeometry maps each face to 0..1; rescale so textures keep the same
  // size in metres on every box.
  function worldUVs(geo, sx, sy, sz, tile) {
    const uv = geo.attributes.uv;
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
      }
    }
  }

  function labelTex(text, color) {
    const t = canvasTex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = color;
      g.font = 'bold 200px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, s / 2, s / 2 + 10);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  function barrierTex(color) {
    const t = canvasTex(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = color;
      g.lineWidth = 10;
      for (let i = -s; i < s * 2; i += 32) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke();
      }
    });
    return t;
  }

  function build(scene) {
    const mats = makeMaterials();
    const meshes = [];
    for (const b of boxes) {
      const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      worldUVs(geo, sx, sy, sz, 2);
      const m = new THREE.Mesh(geo, mats[b.mat]);
      m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      m.castShadow = b.mat !== 'floor';
      m.receiveShadow = true;
      scene.add(m);
      meshes.push(m);
    }

    // Sky dome
    const skyTex = canvasTex(64, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s);
      grad.addColorStop(0, '#4f86c6');
      grad.addColorStop(0.45, '#9cc3e6');
      grad.addColorStop(0.5, '#f1dcc0');
      grad.addColorStop(1, '#d9c4a5');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
    skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);

    // Lane letters painted on the outer walls
    const letters = [
      ['A', 0, -19.98, 0], ['B', 0, 19.98, Math.PI],
      ['A', -30, -19.98, 0], ['B', 30, 19.98, Math.PI],
    ];
    for (const [txt, x, z, ry] of letters) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({ map: labelTex(txt, 'rgba(255,255,255,0.85)'), transparent: true, depthWrite: false }));
      m.position.set(x, 4.2, z);
      m.rotation.y = ry;
      scene.add(m);
    }

    // Spawn floor markings
    for (const [x, color] of [[-28, '#3ce3c4'], [28, '#ff4655']]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 11),
        new THREE.MeshBasicMaterial({
          map: barrierTex(color), transparent: true, opacity: 0.25, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2,
        }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, 0);
      scene.add(m);
    }

    // Buy-phase barriers
    const barriers = [];
    for (const [x, color] of [[-RULES.barrierX, '#3ce3c4'], [RULES.barrierX, '#ff4655']]) {
      const tex = barrierTex(color);
      tex.repeat.set(20, 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 8),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.y = Math.PI / 2;
      m.position.set(x, 4, 0);
      scene.add(m);
      barriers.push(m);
    }
    return { meshes, barriers };
  }

  return {
    boxes, smokes, obstacles,
    rayBox, raycast, lineOfSight, groundHeight,
    moveBody, bodyBlocked,
    findPath, randomPoint, clearLine2D,
    build,
  };
})();
