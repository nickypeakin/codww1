'use strict';
// Fighters (you and the bot), their hitboxes, and the blocky 3D models
// for agents and guns.

function newGun(id) {
  const w = WEAPONS[id];
  return { id, w, mag: w.mag || 0, reserve: w.reserve || 0 };
}

class Fighter {
  constructor(name, isBot) {
    this.name = name;
    this.isBot = isBot;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.fire = { cd: 0, reload: 0, equip: 0, shot: 0, recoilP: 0, recoilY: 0, bloom: 0, lastShot: -9, seed: 0 };
    this.resetMatch();
    this.resetRound();
  }

  resetMatch() {
    this.credits = ECON.start;
    this.lossStreak = 0;
    this.primary = null;
    this.secondary = newGun('classic');
    this.knife = newGun('knife');
    this.shield = 0;
    this.abil = { flash: 0, smoke: 0, dash: 1 };
    this.stats = { kills: 0, deaths: 0, head: 0, hits: 0, shots: 0, dmg: 0 };
    this.slot = 2;
  }

  resetRound() {
    this.hp = 100;
    this.alive = true;
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.landed = false;
    this.crouch = 0;
    this.wantCrouch = false;
    this.walking = false;
    this.ads = false;
    this.adsT = 0;
    this.dashT = 0;
    this.stepT = 0;
    this.blind = 0;
    this.abil.dash = 1;
    this.slot = this.primary ? 1 : 2;
    for (const g of [this.primary, this.secondary]) {
      if (g) { g.mag = g.w.mag; g.reserve = g.w.reserve; }
    }
    Object.assign(this.fire, { cd: 0, reload: 0, equip: 0, shot: 0, recoilP: 0, recoilY: 0, bloom: 0 });
    // What was bought this round, so it can be sold back during the buy phase
    this.bought = { primary: null, secondary: null, shield: null, flash: 0, smoke: 0 };
    this.prev = { primary: this.primary, secondary: this.secondary, shield: this.shield };
    this.round = { dealt: 0, taken: 0 };
  }

  // Dying drops your gun and shields (survivors keep theirs, like Valorant).
  loseGear() {
    this.primary = null;
    this.secondary = newGun('classic');
    this.shield = 0;
    this.slot = 2;
  }

  get height() { return MOVE.stand - (MOVE.stand - MOVE.crouchH) * this.crouch; }
  get eyeY() { return this.pos.y + MOVE.eye - (MOVE.eye - MOVE.crouchEye) * this.crouch; }

  gun() {
    if (this.slot === 1 && this.primary) return this.primary;
    if (this.slot === 3) return this.knife;
    return this.secondary;
  }
}

// Head / body / legs boxes, reused between calls.
const _hitboxes = [
  { part: 'head', min: [0, 0, 0], max: [0, 0, 0] },
  { part: 'body', min: [0, 0, 0], max: [0, 0, 0] },
  { part: 'legs', min: [0, 0, 0], max: [0, 0, 0] },
];
function hitboxes(f) {
  const x = f.pos.x, y = f.pos.y, z = f.pos.z, s = f.height / MOVE.stand;
  const set = (hb, r, y0, y1) => {
    hb.min[0] = x - r; hb.min[1] = y + y0 * s; hb.min[2] = z - r;
    hb.max[0] = x + r; hb.max[1] = y + y1 * s; hb.max[2] = z + r;
  };
  set(_hitboxes[0], 0.16, 1.47, 1.8);
  set(_hitboxes[1], 0.27, 0.85, 1.47);
  set(_hitboxes[2], 0.22, 0, 0.85);
  return _hitboxes;
}

const Models = (() => {
  const cache = {};
  function mat(color, emissive = 0) {
    const k = color + ':' + emissive;
    return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({ color, emissive }));
  }
  const DARK = 0x1f2228, METAL = 0x5a606a, LIGHT = 0xc9d0d8, WOOD = 0x7a4b2a, RED = 0xff4655, TEAL = 0x3ce3c4;

  function flashTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,230,1)');
    grad.addColorStop(0.3, 'rgba(255,200,90,0.9)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const flashTex = flashTexture();

  function muzzleSprite(size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    s.scale.set(size, size, size);
    s.visible = false;
    return s;
  }

  // Guns are built pointing down -Z with the grip at the origin.
  function gun(id) {
    const W = WEAPONS[id];
    const g = new THREE.Group();
    const tint = W.tint || DARK;
    const part = (w, h, d, x, y, z, color, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      m.rotation.x = rx;
      g.add(m);
      return m;
    };
    const tube = (r, len, x, y, z, color) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat(color));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    let muzzle = -0.2, muzzleY = 0.06, hand2 = null;
    switch (W.model) {
      case 'knife':
        part(0.03, 0.035, 0.12, 0, 0, 0.02, DARK);
        part(0.06, 0.015, 0.02, 0, 0, -0.045, METAL);
        part(0.008, 0.045, 0.22, 0, 0.006, -0.16, LIGHT);
        part(0.009, 0.006, 0.2, 0, 0.03, -0.15, TEAL);
        muzzle = -0.27; muzzleY = 0;
        break;
      case 'classic':
        part(0.045, 0.065, 0.21, 0, 0.055, -0.06, tint);
        part(0.04, 0.035, 0.16, 0, 0.01, -0.05, DARK);
        part(0.042, 0.13, 0.055, 0, -0.05, 0.02, DARK, 0.2);
        muzzle = -0.17; muzzleY = 0.055;
        break;
      case 'ghost':
        part(0.045, 0.065, 0.2, 0, 0.055, -0.05, tint);
        part(0.04, 0.035, 0.16, 0, 0.01, -0.05, DARK);
        part(0.042, 0.13, 0.055, 0, -0.05, 0.02, DARK, 0.2);
        tube(0.022, 0.18, 0, 0.055, -0.24, 0x2a2d33);
        muzzle = -0.33; muzzleY = 0.055;
        break;
      case 'sheriff':
        part(0.04, 0.045, 0.22, 0, 0.075, -0.14, METAL);
        part(0.065, 0.075, 0.08, 0, 0.055, -0.01, tint);
        part(0.04, 0.03, 0.1, 0, 0.015, -0.02, DARK);
        part(0.045, 0.14, 0.06, 0, -0.05, 0.04, WOOD, 0.3);
        part(0.012, 0.02, 0.012, 0, 0.105, -0.24, METAL);
        muzzle = -0.25; muzzleY = 0.075;
        break;
      case 'spectre':
        part(0.06, 0.09, 0.34, 0, 0.05, -0.12, tint);
        tube(0.025, 0.2, 0, 0.06, -0.38, DARK);
        part(0.035, 0.16, 0.05, 0, -0.06, -0.12, DARK, -0.1);
        part(0.04, 0.11, 0.05, 0, -0.03, 0.04, DARK, 0.25);
        part(0.025, 0.03, 0.2, 0, 0.05, 0.13, METAL);
        part(0.02, 0.03, 0.04, 0, 0.105, -0.05, DARK);
        muzzle = -0.48; hand2 = [0, -0.01, -0.24];
        break;
      case 'vandal':
        part(0.06, 0.1, 0.42, 0, 0.05, -0.1, tint);
        part(0.066, 0.07, 0.24, 0, 0.045, -0.42, WOOD);
        tube(0.014, 0.2, 0, 0.065, -0.62, DARK);
        part(0.04, 0.14, 0.07, 0, -0.07, -0.17, DARK, 0.25);
        part(0.04, 0.1, 0.07, 0, -0.16, -0.13, DARK, 0.55);
        part(0.04, 0.11, 0.05, 0, -0.03, 0.05, DARK, 0.25);
        part(0.05, 0.09, 0.28, 0, 0.02, 0.24, WOOD);
        part(0.01, 0.045, 0.01, 0, 0.11, -0.5, METAL);
        part(0.064, 0.012, 0.12, 0, 0.102, -0.08, RED);
        muzzle = -0.72; muzzleY = 0.065; hand2 = [0, 0, -0.42];
        break;
      case 'phantom':
        part(0.065, 0.1, 0.4, 0, 0.05, -0.1, tint);
        part(0.07, 0.075, 0.22, 0, 0.045, -0.4, 0x343a44);
        tube(0.028, 0.26, 0, 0.06, -0.63, DARK);
        part(0.04, 0.18, 0.07, 0, -0.08, -0.15, DARK, 0.12);
        part(0.04, 0.11, 0.05, 0, -0.03, 0.05, DARK, 0.25);
        part(0.04, 0.07, 0.26, 0, 0.03, 0.22, 0x343a44);
        part(0.04, 0.05, 0.1, 0, 0.125, -0.1, DARK);
        part(0.072, 0.012, 0.1, 0, 0.085, -0.4, TEAL);
        muzzle = -0.77; hand2 = [0, 0, -0.4];
        break;
      case 'operator':
        part(0.07, 0.11, 0.55, 0, 0.05, -0.08, tint);
        tube(0.018, 0.55, 0, 0.07, -0.62, DARK);
        tube(0.035, 0.34, 0, 0.17, -0.1, DARK);
        part(0.02, 0.06, 0.03, 0, 0.12, -0.2, DARK);
        part(0.02, 0.06, 0.03, 0, 0.12, 0.0, DARK);
        part(0.045, 0.1, 0.08, 0, -0.04, -0.12, DARK);
        part(0.04, 0.11, 0.05, 0, -0.03, 0.08, DARK, 0.25);
        part(0.06, 0.12, 0.34, 0, 0.03, 0.32, tint);
        muzzle = -0.9; muzzleY = 0.07; hand2 = [0, 0, -0.38];
        break;
    }
    g.userData.muzzle = new THREE.Vector3(0, muzzleY, muzzle);
    g.userData.hand2 = hand2;
    return g;
  }

  // A blocky agent with an enemy-highlight outline (inverted hull).
  function agent(highlightColor) {
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const suit = mat(0x2a2e38), suit2 = mat(0x41475a), skin = mat(0xc2916f);
    const boots = mat(0x15171c), accent = mat(RED, 0x7a1520);
    const meshes = [];
    const box = (parent, w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
      return mesh;
    };

    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.11, 0.85, 0);
    legR.position.set(0.11, 0.85, 0);
    root.add(legL, legR);
    for (const leg of [legL, legR]) {
      box(leg, 0.17, 0.8, 0.2, 0, -0.4, 0, suit2);
      box(leg, 0.19, 0.1, 0.27, 0, -0.8, -0.03, boots);
    }

    const upper = new THREE.Group();
    root.add(upper);
    box(upper, 0.5, 0.62, 0.3, 0, 1.16, 0, suit);
    box(upper, 0.52, 0.08, 0.32, 0, 0.88, 0, boots);
    box(upper, 0.3, 0.06, 0.02, 0, 1.3, -0.16, accent);
    box(upper, 0.36, 0.4, 0.12, 0, 1.18, 0.2, suit2);

    const head = new THREE.Group();
    head.position.set(0, 1.47, 0);
    upper.add(head);
    box(head, 0.27, 0.3, 0.27, 0, 0.15, 0, skin);
    box(head, 0.3, 0.12, 0.3, 0, 0.29, 0.01, suit);
    box(head, 0.24, 0.07, 0.03, 0, 0.17, -0.145, accent);

    const arms = new THREE.Group();
    arms.position.set(0, 1.32, 0);
    upper.add(arms);
    box(arms, 0.12, 0.12, 0.36, 0.22, -0.02, -0.16, suit2);
    const left = box(arms, 0.11, 0.11, 0.44, -0.1, -0.03, -0.26, suit2);
    left.rotation.y = -0.45;

    const mount = new THREE.Group();
    mount.position.set(0.12, -0.04, -0.34);
    arms.add(mount);

    const outlineMat = new THREE.MeshBasicMaterial({ color: highlightColor, side: THREE.BackSide });
    for (const m of meshes) {
      const o = new THREE.Mesh(m.geometry, outlineMat);
      o.position.copy(m.position);
      o.rotation.copy(m.rotation);
      o.scale.setScalar(1.12);
      m.parent.add(o);
    }

    const flash = muzzleSprite(0.45);
    root.userData = { legL, legR, upper, head, arms, mount, gunId: null, gun: null, flash, outlineMat, phase: 0, deadT: -1 };
    return root;
  }

  function setAgentGun(model, id) {
    const u = model.userData;
    if (u.gunId === id) return;
    if (u.gun) u.mount.remove(u.gun);
    u.gun = gun(id);
    u.gun.traverse(m => { m.castShadow = true; });
    u.mount.add(u.gun);
    u.gun.add(u.flash);
    u.flash.position.copy(u.gun.userData.muzzle);
    u.gunId = id;
  }

  function animateAgent(model, f, dt) {
    const u = model.userData;
    model.position.copy(f.pos);
    model.rotation.y = f.yaw;
    if (u.deadT >= 0) {
      u.deadT += dt;
      const k = Math.min(1, u.deadT / 0.45);
      model.rotation.x = k * k * Math.PI / 2;
      return;
    }
    model.rotation.x = 0;
    const speed = Math.hypot(f.vel.x, f.vel.z);
    u.phase += dt * speed * 1.7;
    const swing = Math.sin(u.phase) * Math.min(1, speed / 5) * 0.6;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    const c = f.crouch;
    u.upper.position.y = -0.42 * c;
    const legLen = (0.85 - 0.42 * c) / 0.85;
    u.legL.position.y = u.legR.position.y = 0.85 - 0.42 * c;
    u.legL.scale.y = u.legR.scale.y = legLen;
    u.arms.rotation.x = f.pitch;
    u.head.rotation.x = f.pitch * 0.6;
  }

  return { gun, agent, setAgentGun, animateAgent, muzzleSprite, mat, flashTex };
})();
