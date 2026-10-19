'use strict';
// Game loop, input, rounds/economy, shooting, abilities, effects and HUD.

(() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  const smooth = t => t * t * (3 - 2 * t);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------ settings

  const SETTINGS_KEY = 'onetap.settings.v1';
  const settings = Object.assign({
    sens: 1.0, volume: 0.6, quality: 'high', autoQuality: true, fov: 103,
    crosshair: '#00ffb0', highlight: '#ff4655',
    difficulty: 'gold', firstTo: 7,
  }, loadSettings());

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }

  // ------------------------------------------------------- scene set-up

  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance' });
  renderer.autoClear = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8dde2, 70, 160);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
  camera.rotation.order = 'YXZ';

  // The gun is drawn in its own pass so it never clips into walls.
  const vmScene = new THREE.Scene();
  const vmCamera = new THREE.PerspectiveCamera(56, 1, 0.01, 10);

  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x8a7458, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
  sun.position.set(22, 40, 14);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  vmScene.add(new THREE.HemisphereLight(0xe6eeff, 0x705c48, 1.6));
  const vmSun = new THREE.DirectionalLight(0xfff0d8, 1.8);
  vmSun.position.set(-1, 2, 1);
  vmScene.add(vmSun);

  const { barriers } = World.build(scene);

  // ------------------------------------------------------------ fighters

  const player = new Fighter('You', false);
  const bot = new Fighter('Bot', true);
  const botModel = Models.agent(settings.highlight);
  scene.add(botModel);
  const PROJ_G = 12;

  const game = {
    state: 'menu', // menu | buy | combat | roundEnd | matchEnd
    paused: false,
    frozen: false, // tests drive the simulation by hand when set
    time: 0,
    round: 0,
    score: [0, 0],
    timer: 0,
    firstTo: 7,
    diff: DIFFICULTIES.gold,
    player, bot,
    buyOpen: false,
    zoom: 1,
    fovKick: 0,
    flashT: 0,
    hurtT: 0,
    deathT: 0,
    streak: 0,
    botSeen: false,
    botSeenT: 0,
    botShotT: 0,
    canSee, tryFire, startReload, switchSlot, throwFlash,
  };
  const brain = new BotBrain(bot, game);
  const inMatch = () => game.state === 'buy' || game.state === 'combat' || game.state === 'roundEnd';

  // ------------------------------------------------------------- display

  function applyQuality() {
    const q = settings.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.7 : q === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 1.5));
    const shadows = q === 'high';
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      scene.traverse(o => {
        if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; });
      });
    }
    resize();
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = vmCamera.aspect = w / h;
    vmCamera.updateProjectionMatrix();
    updateFov();
  }

  // Valorant measures FOV horizontally (103 degrees).
  function updateFov() {
    const half = Math.tan(settings.fov * DEG / 2) / camera.aspect / game.zoom;
    camera.fov = Math.min(110, 2 * Math.atan(half) / DEG) + game.fovKick;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);

  // -------------------------------------------------------------- input

  const keys = Object.create(null);
  let fireHeld = false, fireQueued = 0, adsHeld = false;
  const locked = () => document.pointerLockElement === canvas;

  function lock() {
    const fallback = () => {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch { /* ignore */ }
    };
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(fallback);
    } catch {
      fallback();
    }
  }

  document.addEventListener('mousemove', e => {
    if (!locked() || !inMatch() || game.paused) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    if (Math.abs(dx) > 500 || Math.abs(dy) > 500) return; // pointer-lock glitch spikes
    // 0.07 deg per count at sensitivity 1, same scale as Valorant
    const k = settings.sens * 0.07 * DEG / game.zoom;
    player.yaw -= dx * k;
    player.pitch = clamp(player.pitch - dy * k, -1.55, 1.55);
    vm.swayX += dx;
    vm.swayY += dy;
  });

  canvas.addEventListener('mousedown', e => {
    if (!inMatch()) return;
    if (!locked()) {
      if (game.buyOpen) closeBuy(true);
      else lock();
      return;
    }
    if (e.button === 0) { fireHeld = true; fireQueued = 0.12; }
    if (e.button === 2) adsHeld = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) fireHeld = false;
    if (e.button === 2) adsHeld = false;
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => {
    if (!locked() || !inMatch() || game.paused || !player.alive) return;
    const order = [1, 2, 3].filter(s => s !== 1 || player.primary);
    const i = order.indexOf(player.slot);
    switchSlot(player, order[(i + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length]);
  }, { passive: true });

  document.addEventListener('pointerlockerror', () => {
    if (inMatch() && !game.buyOpen) setPaused(true);
  });
  document.addEventListener('pointerlockchange', () => {
    fireHeld = adsHeld = false;
    if (locked()) {
      setPaused(false);
    } else if (inMatch() && !game.buyOpen) {
      setPaused(true);
    }
  });

  document.addEventListener('keydown', e => {
    if (!inMatch()) return;
    const c = e.code;
    // Keep browser shortcuts (Ctrl+S, Ctrl+D, Tab focus, space scroll) out of the way.
    if ((locked() || game.buyOpen) && c !== 'F11' && c !== 'F5') e.preventDefault();
    keys[c] = true;
    if (e.repeat) return;
    if (c === 'Escape') {
      if (game.buyOpen) closeBuy(true);
      else if (locked()) document.exitPointerLock();
      return;
    }
    if (game.paused) return;
    switch (c) {
      case 'KeyR': startReload(player); break;
      case 'Digit1': switchSlot(player, 1); break;
      case 'Digit2': switchSlot(player, 2); break;
      case 'Digit3': switchSlot(player, 3); break;
      case 'KeyQ': useFlash(); break;
      case 'KeyE': useDash(); break;
      case 'KeyC': useSmoke(); break;
      case 'KeyB': toggleBuy(); break;
      case 'Tab': $('scoreboard').classList.remove('hidden'); renderScoreboard(); break;
      case 'Enter': if (game.state === 'buy') beginCombat(); break;
    }
  });
  document.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    fireHeld = adsHeld = false;
  });
  // Ctrl+W closes the tab and can't be blocked, so at least ask first.
  window.addEventListener('beforeunload', e => {
    if (inMatch()) { e.preventDefault(); e.returnValue = ''; }
  });

  function setPaused(p) {
    game.paused = p;
    $('pauseMenu').classList.toggle('hidden', !p);
    if (p) {
      for (const k in keys) keys[k] = false;
      $('scoreboard').classList.add('hidden');
    }
  }

  // ------------------------------------------------------------- rounds

  function startMatch() {
    Sfx.init();
    game.diff = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.gold;
    game.firstTo = settings.firstTo;
    game.score = [0, 0];
    game.round = 0;
    game.streak = 0;
    player.resetMatch();
    bot.resetMatch();
    $('menu').classList.add('hidden');
    $('endScreen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('diffTag').textContent = game.diff.name.toUpperCase() + ' BOT';
    startRound();
    lock();
  }

  function startRound() {
    game.round++;
    clearEffects();
    player.resetRound();
    bot.resetRound();
    player.pos.set(-29, 0, rand(-3, 3));
    player.yaw = -Math.PI / 2;
    player.pitch = 0;
    bot.pos.set(29, 0, rand(-3, 3));
    bot.yaw = Math.PI / 2;
    bot.pitch = 0;
    botModel.userData.deadT = -1;
    botModel.rotation.x = 0;
    brain.reset();
    botBuy();
    Models.setAgentGun(botModel, bot.gun().id);
    setViewmodel(player.gun().id);
    game.state = 'buy';
    game.timer = RULES.buyTime;
    game.flashT = game.hurtT = game.deathT = 0;
    barriers.forEach(b => { b.visible = true; });
    $('deathPanel').classList.add('hidden');
    const matchPoint = game.score.some(v => v === game.firstTo - 1);
    banner(`ROUND ${game.round}`, matchPoint ? 'Match point' : 'Buy phase', '#ece8e1', 1.8);
    centerMsg('Press <b>B</b> to buy · <b>ENTER</b> to start early');
    Sfx.roundStart();
  }

  function beginCombat() {
    if (game.state !== 'buy') return;
    game.state = 'combat';
    game.timer = RULES.roundTime;
    if (game.buyOpen) closeBuy(true);
    barriers.forEach(b => { b.visible = false; });
    brain.startRound();
    centerMsg('');
    banner('', 'Fight', '#ece8e1', 0.9);
    Sfx.roundStart();
  }

  // winner: 0 = you, 1 = bot, -1 = draw (time ran out)
  function endRound(winner, reason) {
    if (game.state !== 'combat') return;
    game.state = 'roundEnd';
    game.timer = RULES.endTime;
    brain.state = 'idle';
    if (winner >= 0) game.score[winner]++;
    [player, bot].forEach((f, i) => {
      if (winner === i) {
        f.credits += ECON.win;
        f.lossStreak = 0;
      } else {
        if (winner >= 0) f.lossStreak++;
        f.credits += Math.min(ECON.lossMax, ECON.loss + ECON.lossBonus * Math.max(0, f.lossStreak - 1));
      }
      f.credits = Math.min(ECON.max, f.credits);
    });
    const title = winner === 0 ? 'ROUND WON' : winner === 1 ? 'ROUND LOST' : 'ROUND DRAW';
    const color = winner === 0 ? '#3ce3c4' : winner === 1 ? '#ff4655' : '#ece8e1';
    banner(title, reason, color, RULES.endTime - 0.5);
    Sfx.roundEnd(winner === 0);
    if (game.buyOpen) closeBuy(false);
  }

  function endMatch() {
    game.state = 'matchEnd';
    if (locked()) document.exitPointerLock();
    setPaused(false);
    const won = game.score[0] > game.score[1];
    $('endTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    $('endTitle').style.color = won ? '#3ce3c4' : '#ff4655';
    $('endScore').textContent = `${game.score[0]} – ${game.score[1]}`;
    $('endSub').textContent = `vs ${game.diff.name} bot · first to ${game.firstTo}`;
    const s = player.stats, rounds = Math.max(1, game.round);
    $('endStats').innerHTML = [
      ['Kills', s.kills], ['Deaths', s.deaths],
      ['Headshot %', s.hits ? Math.round(s.head / s.hits * 100) + '%' : '–'],
      ['Avg damage / round', Math.round(s.dmg / rounds)],
      ['Accuracy', s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '–'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('hud').classList.add('hidden');
    $('endScreen').classList.remove('hidden');
    Sfx.roundEnd(won);
  }

  function quitToMenu() {
    game.state = 'menu';
    setPaused(false);
    if (game.buyOpen) closeBuy(false);
    if (locked()) document.exitPointerLock();
    clearEffects();
    bot.resetRound();
    bot.pos.set(28, 0, 0);
    bot.yaw = Math.PI / 2;
    bot.pitch = 0;
    botModel.userData.deadT = -1;
    botModel.rotation.x = 0;
    $('hud').classList.add('hidden');
    $('endScreen').classList.add('hidden');
    $('menu').classList.remove('hidden');
    barriers.forEach(b => { b.visible = true; });
  }

  function updatePhase(dt) {
    if (game.state === 'buy') {
      const before = Math.ceil(game.timer);
      game.timer -= dt;
      if (Math.ceil(game.timer) !== before && game.timer < 3 && game.timer > 0) Sfx.tick();
      if (game.timer <= 0) beginCombat();
    } else if (game.state === 'combat') {
      game.timer -= dt;
      if (game.timer <= 0) endRound(-1, 'Time ran out');
    } else if (game.state === 'roundEnd') {
      game.timer -= dt;
      if (game.timer <= 0) {
        if (game.score[0] >= game.firstTo || game.score[1] >= game.firstTo) endMatch();
        else startRound();
      }
    }
  }

  // ------------------------------------------------------------- buying

  function buyWeapon(f, id) {
    const w = WEAPONS[id], key = w.slot === 1 ? 'primary' : 'secondary';
    const cur = f[key];
    if (cur && cur.id === id) {
      if (f.bought[key] !== id) return false;
      // Sell it back
      f.credits += w.cost;
      f[key] = f.prev[key] || (key === 'secondary' ? newGun('classic') : null);
      f.bought[key] = null;
      switchSlot(f, f.primary ? 1 : 2, true);
      return 'sold';
    }
    const refund = f.bought[key] ? WEAPONS[f.bought[key]].cost : 0;
    if (f.credits + refund < w.cost) return false;
    f.credits += refund - w.cost;
    f[key] = newGun(id);
    f.bought[key] = id;
    switchSlot(f, w.slot, true);
    return 'bought';
  }

  function buyShield(f, kind) {
    const s = SHIELDS[kind];
    if (f.bought.shield === kind) {
      f.credits += s.cost;
      f.shield = f.prev.shield;
      f.bought.shield = null;
      return 'sold';
    }
    const refund = f.bought.shield ? SHIELDS[f.bought.shield].cost : 0;
    if (!f.bought.shield && f.shield >= s.amount) return false;
    if (f.credits + refund < s.cost) return false;
    f.credits += refund - s.cost;
    f.shield = s.amount;
    f.bought.shield = kind;
    return 'bought';
  }

  function buyAbility(f, key, sell) {
    const a = ABILITIES[key];
    if (sell) {
      if (f.bought[key] <= 0) return false;
      f.bought[key]--;
      f.abil[key]--;
      f.credits += a.cost;
      return 'sold';
    }
    if (a.cost === 0 || f.abil[key] >= a.max || f.credits < a.cost) return false;
    f.credits -= a.cost;
    f.abil[key]++;
    f.bought[key]++;
    return 'bought';
  }

  function botBuy() {
    const b = bot, D = game.diff, c = () => b.credits;
    const rifle = () => pick(['vandal', 'vandal', 'phantom']);
    if (!b.primary) {
      if (c() >= 3900) {
        const op = (D === DIFFICULTIES.diamond || D === DIFFICULTIES.radiant) && c() >= 5700 && Math.random() < 0.2;
        buyWeapon(b, op ? 'operator' : rifle());
        buyShield(b, 'heavy');
      } else if (c() >= 3300) {
        buyWeapon(b, rifle());
        buyShield(b, 'light');
      } else if (game.round === 1) {
        const r = Math.random();
        if (r < 0.35) buyWeapon(b, 'ghost');
        else if (r < 0.6) buyShield(b, 'light');
        else buyWeapon(b, 'sheriff');
      } else if (c() >= 2900 && (b.lossStreak >= 2 || Math.random() < 0.3)) {
        buyWeapon(b, rifle());
      } else if (c() >= 2000 && Math.random() < 0.5) {
        buyWeapon(b, 'spectre');
        buyShield(b, 'light');
      } else if (c() >= 1300 && Math.random() < 0.5) {
        buyWeapon(b, 'sheriff');
        buyShield(b, 'light');
      }
    } else if (b.shield < 50 && c() >= 1000) {
      buyShield(b, 'heavy');
    } else if (b.shield < 25 && c() >= 400) {
      buyShield(b, 'light');
    }
    if (D.flash > 0 && c() >= 250 && b.abil.flash < 1) buyAbility(b, 'flash');
    b.slot = b.primary ? 1 : 2;
    b.fire.equip = 0;
  }

  // ------------------------------------------------------------ weapons

  const _dir = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  function forwardVec(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  function switchSlot(f, slot, force) {
    if (slot === 1 && !f.primary) return;
    if (f.slot === slot && !force) return;
    f.slot = slot;
    const st = f.fire;
    st.reload = 0;
    st.autoReload = false;
    st.equip = f.gun().w.equip;
    st.shot = 0;
    st.recoilP = st.recoilY = st.bloom = 0;
    f.ads = false;
    if (f === player) {
      setViewmodel(f.gun().id);
      Sfx.equip();
    } else {
      Models.setAgentGun(botModel, f.gun().id);
    }
  }

  function startReload(f) {
    const g = f.gun(), st = f.fire;
    if (!f.alive || !g.w.mag || st.reload > 0 || g.mag >= g.w.mag || g.reserve <= 0) return;
    st.reload = st.reloadTotal = g.w.reload;
    st.autoReload = false;
    if (f === player) Sfx.reload(g.w.reload);
  }

  function weaponTick(f, dt) {
    const st = f.fire, g = f.gun(), w = g.w;
    st.cd = Math.max(0, st.cd - dt);
    st.equip = Math.max(0, st.equip - dt);
    if (st.reload > 0) {
      st.reload -= dt;
      if (st.reload <= 0) {
        st.reload = 0;
        const take = Math.min(w.mag - g.mag, g.reserve);
        g.mag += take;
        g.reserve -= take;
      }
    }
    if (st.autoReload && st.cd <= 0) startReload(f);
    const since = game.time - st.lastShot;
    if (w.recoil && since > 1 / w.rate + 0.03) {
      const rec = w.recoil.recover * dt;
      st.recoilP = Math.max(0, st.recoilP - rec);
      st.recoilY = approach(st.recoilY, 0, rec);
      if (st.recoilP < 0.2) st.shot = 0;
    }
    if (since > 0.1) st.bloom *= Math.exp(-dt * 6);
  }

  function spreadOf(f) {
    const w = f.gun().w;
    let s = w.type === 'sniper' && f.adsT > 0.9 ? w.scopedSpread : w.spread;
    const hs = Math.hypot(f.vel.x, f.vel.z);
    s += w.moveSpread * clamp((hs - 0.5) / (MOVE.run - 0.5), 0, 1);
    if (!f.onGround) s += w.airSpread;
    s += f.fire.bloom;
    if (f.crouch > 0.5 && f.onGround) s *= 0.85;
    if (f.adsT > 0.5 && w.type !== 'sniper') s *= 0.85;
    return s;
  }

  function damageAt(w, part, dist) {
    const row = w.falloff.find(r => dist <= r[0]) || w.falloff[w.falloff.length - 1];
    return part === 'head' ? row[1] : part === 'body' ? row[2] : row[3];
  }

  function tryFire(f) {
    if (!f.alive || game.state === 'buy') return false;
    const g = f.gun(), w = g.w, st = f.fire;
    if (st.cd > 0 || st.equip > 0 || st.reload > 0) return false;
    if (w.type === 'melee') {
      st.cd = 1 / w.rate;
      melee(f);
      return true;
    }
    if (g.mag <= 0) {
      if (g.reserve > 0) startReload(f);
      else if (f === player) { Sfx.dry(); st.cd = 0.25; }
      return false;
    }
    g.mag--;
    st.cd = 1 / w.rate;
    st.lastShot = game.time;
    f.stats.shots++;

    const spread = spreadOf(f) * (f.isBot ? game.diff.spreadMul : 1);
    const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const yaw = f.yaw + (st.recoilY + Math.cos(a) * r) * DEG;
    const pitch = f.pitch + (st.recoilP + Math.sin(a) * r) * DEG;

    // Recoil applies to the *next* shot, so first shots are always accurate
    const rc = w.recoil;
    st.shot++;
    if (st.shot === 1) st.seed = Math.random() * 6;
    st.recoilP = Math.min(rc.max, st.recoilP + rc.up * (st.shot <= 2 ? 0.5 : 1));
    st.recoilY = st.shot > rc.sideStart ? rc.side * 3 * Math.sin((st.shot - rc.sideStart) * 0.7 + st.seed) : st.recoilY * 0.5;
    st.bloom = Math.min(w.bloom * 5, st.bloom + w.bloom);

    fireRay(f, yaw, pitch, w);

    if (f === player) {
      vm.kick = Math.min(0.09, vm.kick + (w.type === 'sniper' ? 0.08 : w.type === 'sidearm' ? 0.035 : 0.022));
      vm.flashT = 0.045;
      Sfx.shot(w.sound);
    } else {
      game.botShotT = 0.6;
      botModel.userData.flash.visible = true;
      botModel.userData.flashT = 0.05;
      Sfx.shot(w.sound, spatial(f.pos.x, f.eyeY, f.pos.z));
    }
    makeNoise(f, 'shot');
    if (g.mag === 0 && g.reserve > 0) st.autoReload = true;
    return true;
  }

  function muzzleWorld(f, out) {
    if (f === player) {
      return out.set(0.16, -0.13, -0.6).applyQuaternion(camera.quaternion).add(camera.position);
    }
    return botModel.userData.flash.getWorldPosition(out);
  }

  function fireRay(f, yaw, pitch, w) {
    const d = forwardVec(yaw, pitch, _dir);
    const ox = f.pos.x, oy = f.eyeY, oz = f.pos.z;
    const wall = World.raycast(ox, oy, oz, d.x, d.y, d.z, 250);
    let tEnd = wall ? wall.t : 250;
    const wallHit = wall && { x: wall.x, y: wall.y, z: wall.z, nx: wall.nx, ny: wall.ny, nz: wall.nz };
    const target = f === player ? bot : player;
    let part = null;
    if (target.alive) {
      for (const hb of hitboxes(target)) {
        const t = World.rayBox(ox, oy, oz, d.x, d.y, d.z, hb.min, hb.max, tEnd);
        if (t >= 0 && t < tEnd) { tEnd = t; part = hb.part; }
      }
    }
    const ex = ox + d.x * tEnd, ey = oy + d.y * tEnd, ez = oz + d.z * tEnd;
    addTracer(muzzleWorld(f, _v2), ex, ey, ez);
    if (part) {
      particles(ex, ey, ez, -d.x, -d.y, -d.z, part === 'head' ? 10 : 6, 'hit');
      applyDamage(target, f, damageAt(w, part, tEnd), part, w);
    } else if (wallHit) {
      addDecal(wallHit);
      particles(wallHit.x, wallHit.y, wallHit.z, wallHit.nx, wallHit.ny, wallHit.nz, 5, 'dust');
    }
    // Near misses whizz past your head
    if (f === bot && !part && player.alive) {
      const px = player.pos.x - ox, py = player.eyeY - oy, pz = player.pos.z - oz;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t > 1 && t < tEnd) {
        const mx = ox + d.x * t, my = oy + d.y * t, mz = oz + d.z * t;
        if (Math.hypot(mx - player.pos.x, my - player.eyeY, mz - player.pos.z) < 1.6) Sfx.whizz(spatial(mx, my, mz));
      }
    }
  }

  function melee(f) {
    const w = f.gun().w;
    if (f === player) { vm.swing = 1; Sfx.knife(); }
    const d = forwardVec(f.yaw, f.pitch, _dir);
    const ox = f.pos.x, oy = f.eyeY, oz = f.pos.z;
    const wall = World.raycast(ox, oy, oz, d.x, d.y, d.z, w.range);
    let tEnd = wall ? wall.t : w.range, part = null;
    const target = f === player ? bot : player;
    if (!target.alive) return;
    for (const hb of hitboxes(target)) {
      const t = World.rayBox(ox, oy, oz, d.x, d.y, d.z, hb.min, hb.max, tEnd);
      if (t >= 0 && t < tEnd) { tEnd = t; part = hb.part; }
    }
    if (!part) return;
    // Backstabs hurt a lot more
    const tf = forwardVec(target.yaw, 0, _v);
    const back = tf.x * d.x + tf.z * d.z > 0.4;
    applyDamage(target, f, back ? 150 : w.damage, part, w);
  }

  function applyDamage(target, attacker, dmg, part, w) {
    if (!target.alive || game.state !== 'combat') return;
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    const before = target.hp;
    target.hp = Math.max(0, target.hp - (dmg - absorbed));
    const dealt = absorbed + before - target.hp;
    attacker.stats.dmg += dealt;
    attacker.stats.hits++;
    if (part === 'head') attacker.stats.head++;
    attacker.round.dealt += dealt;
    target.round.taken += dealt;
    target.tagT = 0.3; // getting shot slows you down ("tagging")
    if (target === player) {
      game.hurtT = 0.45;
      showDamageDir(attacker);
      Sfx.hurt();
    } else {
      brain.hurt(attacker);
      hitmarker(part === 'head');
      if (part === 'head') Sfx.headshot(); else Sfx.hit();
    }
    if (target.hp <= 0) kill(target, attacker, w, part === 'head');
  }

  function kill(target, killer, w, head) {
    target.alive = false;
    target.hp = 0;
    target.stats.deaths++;
    killer.stats.kills++;
    killer.credits = Math.min(ECON.max, killer.credits + ECON.kill);
    addKillfeed(killer, target, w, head);
    if (target === bot) {
      botModel.userData.deadT = 0;
      game.streak++;
      Sfx.kill(game.streak);
    } else {
      game.streak = 0;
      game.deathT = 0;
      showDeathPanel(killer, w, head);
    }
    target.loseGear();
    endRound(killer === player ? 0 : 1, killer === player ? 'Enemy eliminated' : 'You were eliminated');
  }

  // Can `a` see `t`? Checks a few points on the body against walls/smokes.
  function canSee(a, t, fovDeg) {
    const ex = a.pos.x, ey = a.eyeY, ez = a.pos.z;
    const dx = t.pos.x - ex, dz = t.pos.z - ez, d = Math.hypot(dx, dz);
    if (d > 2.5) {
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      if ((dx * fx + dz * fz) / d < Math.cos(fovDeg / 2 * DEG)) return false;
    }
    const rx = d > 0.01 ? -dz / d * 0.24 : 0, rz = d > 0.01 ? dx / d * 0.24 : 0;
    const chest = t.pos.y + t.height * 0.6;
    const pts = [
      [t.pos.x, t.eyeY, t.pos.z],
      [t.pos.x, chest, t.pos.z],
      [t.pos.x + rx, chest, t.pos.z + rz],
      [t.pos.x - rx, chest, t.pos.z - rz],
      [t.pos.x, t.pos.y + 0.35, t.pos.z],
    ];
    for (const p of pts) if (World.lineOfSight(ex, ey, ez, p[0], p[1], p[2])) return true;
    return false;
  }

  // ----------------------------------------------------------- movement

  function moveInput() {
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (!fwd && !str) return { x: 0, z: 0 };
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const x = -sy * fwd + cy * str, z = -cy * fwd - sy * str;
    const l = Math.hypot(x, z);
    return { x: x / l, z: z / l };
  }

  function stepFighter(f, wx, wz, speed, jump, dt) {
    if (f.wantCrouch) {
      f.crouch = Math.min(1, f.crouch + dt * 8);
    } else if (f.crouch > 0) {
      const old = f.crouch;
      f.crouch = Math.max(0, f.crouch - dt * 8);
      if (World.bodyBlocked(f, f.height)) f.crouch = old; // no room to stand
    }
    if (f.tagT > 0) {
      f.tagT -= dt;
      speed *= 0.35;
    }
    if (f.dashT > 0) {
      f.dashT -= dt;
      f.vel.x = f.dashX;
      f.vel.z = f.dashZ;
      if (f.vel.y < 0) f.vel.y *= 0.5;
      if (f.dashT <= 0) { f.vel.x *= 0.35; f.vel.z *= 0.35; }
    } else if (f.onGround || wx || wz) {
      // Snappy acceleration so counter-strafing works like Valorant
      const tx = wx * speed, tz = wz * speed;
      const accel = f.onGround ? MOVE.accel : MOVE.airAccel;
      const dx = tx - f.vel.x, dz = tz - f.vel.z, dl = Math.hypot(dx, dz), mx = accel * dt;
      if (dl <= mx) { f.vel.x = tx; f.vel.z = tz; } else { f.vel.x += dx / dl * mx; f.vel.z += dz / dl * mx; }
    }
    if (jump && f.onGround && f.crouch < 0.6) {
      f.vel.y = MOVE.jump;
      f.onGround = false;
    }
    const n = Math.ceil(dt / 0.008);
    for (let i = 0; i < n; i++) World.moveBody(f, dt / n);
    if (f.landed) {
      f.landed = false;
      makeNoise(f, 'land');
    }
    if (game.state === 'buy') {
      const bx = RULES.barrierX - MOVE.radius;
      if (f === player && f.pos.x > -bx) { f.pos.x = -bx; f.vel.x = Math.min(0, f.vel.x); }
      if (f === bot && f.pos.x < bx) { f.pos.x = bx; f.vel.x = Math.max(0, f.vel.x); }
    }
    if (f.pos.y < -10) { f.pos.set(f === player ? -29 : 29, 0, 0); f.vel.set(0, 0, 0); }
    // Running is loud; walking (shift) and crouching are silent
    const hs = Math.hypot(f.vel.x, f.vel.z);
    if (f.onGround && hs > 4.2 && f.dashT <= 0) {
      f.stepT -= dt * hs / MOVE.run;
      if (f.stepT <= 0) {
        f.stepT = 0.36;
        makeNoise(f, 'step');
      }
    } else {
      f.stepT = Math.min(f.stepT, 0.12);
    }
  }

  const HEAR_RANGE = { step: 24, land: 24, shot: 999, ability: 16 };
  function makeNoise(f, kind) {
    if (f === player) {
      if (kind === 'step') Sfx.step(undefined, 0.45);
      else if (kind === 'land') Sfx.land();
      if (player.pos.distanceTo(bot.pos) < HEAR_RANGE[kind]) brain.hear(player.pos, kind);
    } else if (kind === 'step' || kind === 'land') {
      const sp = spatial(f.pos.x, f.pos.y + 0.2, f.pos.z);
      sp.gain *= 1.8; // enemy footsteps are deliberately easy to hear
      if (kind === 'step') Sfx.step(sp, 1); else Sfx.land(sp);
    }
  }

  // Pan/volume/muffle for a sound at a world position, heard by you.
  function spatial(x, y, z) {
    const c = camera.position;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const d = Math.hypot(dx, dy, dz);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const pan = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85 : 0;
    const occluded = !World.lineOfSight(c.x, c.y, c.z, x, y, z, true);
    return { pan, gain: 1 / (1 + d * 0.06), lowpass: occluded ? 900 : 0 };
  }

  function updatePlayer(dt) {
    const p = player;
    if (!p.alive) return;
    const w = p.gun().w;
    const mv = moveInput();
    p.walking = !!(keys.ShiftLeft || keys.ShiftRight);
    p.wantCrouch = !!(keys.ControlLeft || keys.ControlRight);
    let speed = MOVE.run * w.speed;
    if (p.crouch > 0.5) speed = MOVE.crouch;
    else if (p.walking) speed = MOVE.walk;
    if (p.adsT > 0.5) speed = Math.min(speed, w.type === 'sniper' ? 2.6 : MOVE.run * 0.76);
    stepFighter(p, mv.x, mv.z, speed, !!keys.Space && !game.paused, dt);

    // aim down sights / scope
    const st = p.fire;
    p.ads = adsHeld && w.zoom > 1 && st.reload <= 0 && st.equip <= 0;
    p.adsT = approach(p.adsT, p.ads ? 1 : 0, dt / 0.18);

    weaponTick(p, dt);
    if (fireQueued > 0) fireQueued -= dt;
    if (locked() && (fireHeld && w.auto || fireQueued > 0)) {
      if (tryFire(p)) fireQueued = 0;
    }
  }

  function updateBot(dt) {
    if (bot.alive) {
      brain.update(dt);
      const wish = brain.wish;
      const w = bot.gun().w;
      bot.ads = brain.state === 'engage' && w.type === 'sniper';
      bot.adsT = approach(bot.adsT, bot.ads ? 1 : 0, dt / 0.25);
      stepFighter(bot, wish.x, wish.z, wish.speed, wish.jump, dt);
      weaponTick(bot, dt);
    } else {
      bot.vel.x = bot.vel.z = 0;
    }
    const u = botModel.userData;
    if (u.flashT > 0) {
      u.flashT -= dt;
      u.flash.material.rotation = Math.random() * 6;
      if (u.flashT <= 0) u.flash.visible = false;
    }
    Models.animateAgent(botModel, bot, dt);
    game.botShotT -= dt;
  }

  // ---------------------------------------------------------- abilities

  const orbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const flashOrbMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
  const smokeOrbMat = new THREE.MeshBasicMaterial({ color: 0x9d8cd6 });
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x8e80c4, emissive: 0x2a2245, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
  const smokeGeo = new THREE.SphereGeometry(1, 28, 18);
  const projectiles = [];

  function useFlash() {
    const p = player;
    if (game.state !== 'combat' || !p.alive || p.abil.flash <= 0) return;
    p.abil.flash--;
    const d = forwardVec(p.yaw, p.pitch, _v);
    const start = new THREE.Vector3(p.pos.x + d.x * 0.4, p.eyeY + d.y * 0.4, p.pos.z + d.z * 0.4);
    spawnFlash(p, start, new THREE.Vector3(d.x * 18, d.y * 18 + 2.5, d.z * 18));
  }

  // Bot version: lob it so it pops at `target`.
  function throwFlash(f, target) {
    if (f.abil.flash <= 0) return;
    f.abil.flash--;
    const T = 0.55;
    const start = new THREE.Vector3(f.pos.x, f.eyeY, f.pos.z);
    const vel = new THREE.Vector3((target.x - start.x) / T, (target.y - start.y) / T + 0.5 * PROJ_G * T, (target.z - start.z) / T);
    spawnFlash(f, start, vel);
  }

  function spawnFlash(owner, pos, vel) {
    const mesh = new THREE.Mesh(orbGeo, flashOrbMat);
    mesh.position.copy(pos);
    scene.add(mesh);
    projectiles.push({ kind: 'flash', owner, pos, vel, t: 0, fuse: 0.55, mesh });
    if (owner === player) {
      Sfx.throwIt();
      makeNoise(player, 'ability');
    } else {
      Sfx.throwIt(spatial(pos.x, pos.y, pos.z));
    }
  }

  function useSmoke() {
    const p = player;
    if (game.state !== 'combat' || !p.alive || p.abil.smoke <= 0) return;
    const d = forwardVec(p.yaw, p.pitch, _v);
    const ex = p.pos.x, ey = p.eyeY, ez = p.pos.z;
    const h = World.raycast(ex, ey, ez, d.x, d.y, d.z, 35);
    let tx, ty, tz;
    if (h) {
      tx = h.x - d.x * 0.6 + h.nx * 0.6;
      ty = h.y + h.ny * 0.6;
      tz = h.z - d.z * 0.6 + h.nz * 0.6;
    } else {
      tx = ex + d.x * 35; ty = ey + d.y * 35; tz = ez + d.z * 35;
    }
    tx = clamp(tx, -31, 31);
    tz = clamp(tz, -19, 19);
    const gy = World.groundHeight(tx, tz, Math.max(ty, 0.3) + 0.3);
    p.abil.smoke--;
    const mesh = new THREE.Mesh(orbGeo, smokeOrbMat);
    const from = new THREE.Vector3(ex, ey - 0.2, ez);
    mesh.position.copy(from);
    scene.add(mesh);
    const to = new THREE.Vector3(tx, gy + 0.9, tz);
    projectiles.push({ kind: 'smoke', from, to, t: 0, dur: Math.max(0.25, from.distanceTo(to) / 40), mesh });
    Sfx.throwIt();
    makeNoise(p, 'ability');
  }

  function deploySmoke(pos) {
    const mesh = new THREE.Mesh(smokeGeo, smokeMat);
    mesh.position.copy(pos);
    scene.add(mesh);
    World.smokes.push({ x: pos.x, y: pos.y, z: pos.z, r: 3.3, scale: 0.1, life: 15, mesh });
    Sfx.smoke(spatial(pos.x, pos.y, pos.z));
  }

  function useDash() {
    const p = player;
    if (game.state !== 'combat' || !p.alive || p.abil.dash <= 0) return;
    let mv = moveInput();
    if (!mv.x && !mv.z) mv = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    p.abil.dash--;
    p.dashT = 0.16;
    p.dashX = mv.x * 21;
    p.dashZ = mv.z * 21;
    game.fovKick = 8;
    Sfx.dash();
    makeNoise(p, 'ability');
  }

  function pointInWorld(x, y, z) {
    for (const b of World.boxes) {
      if (x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]) return true;
    }
    return false;
  }

  function flashDuration(f, pos) {
    const ex = f.pos.x, ey = f.eyeY, ez = f.pos.z;
    if (!World.lineOfSight(ex, ey, ez, pos.x, pos.y, pos.z)) return 0;
    const dx = pos.x - ex, dy = pos.y - ey, dz = pos.z - ez, d = Math.hypot(dx, dy, dz) || 1;
    const fw = forwardVec(f.yaw, f.pitch, _v);
    const ang = Math.acos(clamp((dx * fw.x + dy * fw.y + dz * fw.z) / d, -1, 1)) / DEG;
    let dur = ang < 50 ? 2.2 : ang < 100 ? 1.0 : 0.3;
    if (d > 25) dur *= 0.6;
    return dur;
  }

  function popFlash(pr) {
    scene.remove(pr.mesh);
    addFlare(pr.pos);
    if (player.alive) {
      const d = flashDuration(player, pr.pos);
      if (d > 0) game.flashT = Math.max(game.flashT, d);
      Sfx.flashPop(spatial(pr.pos.x, pr.pos.y, pr.pos.z), d > 0.9 ? d : 0);
    }
    if (bot.alive) {
      const d = flashDuration(bot, pr.pos);
      bot.blind = Math.max(bot.blind, d);
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.t += dt;
      if (pr.kind === 'flash') {
        pr.vel.y -= PROJ_G * dt;
        // Move axis by axis and bounce off whatever we hit
        for (const ax of ['x', 'y', 'z']) {
          const old = pr.pos[ax];
          pr.pos[ax] += pr.vel[ax] * dt;
          if (pointInWorld(pr.pos.x, pr.pos.y, pr.pos.z)) {
            pr.pos[ax] = old;
            pr.vel[ax] *= -0.4;
            pr.vel.multiplyScalar(0.8);
          }
        }
        pr.mesh.position.copy(pr.pos);
        if (pr.t >= pr.fuse) {
          popFlash(pr);
          projectiles.splice(i, 1);
        }
      } else {
        const k = Math.min(1, pr.t / pr.dur);
        pr.mesh.position.lerpVectors(pr.from, pr.to, k);
        pr.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) {
          scene.remove(pr.mesh);
          deploySmoke(pr.to);
          projectiles.splice(i, 1);
        }
      }
    }
    for (let i = World.smokes.length - 1; i >= 0; i--) {
      const s = World.smokes[i];
      s.life -= dt;
      s.scale = Math.min(1, s.scale + dt * 2.5);
      const fade = s.life < 1 ? Math.max(0.01, s.life) : 1;
      s.mesh.scale.setScalar(s.r * s.scale * (s.life < 1 ? 0.6 + 0.4 * fade : 1));
      if (s.life <= 0) {
        scene.remove(s.mesh);
        World.smokes.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ effects

  const fx = { tracers: [], decals: [], decalI: 0, parts: [], flares: [] };
  (function initFx() {
    for (let i = 0; i < 24; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      fx.tracers.push({ line, t: 0 });
    }
    const decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x1d1813, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      scene.add(m);
      fx.decals.push(m);
    }
    const partGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    const mats = { dust: new THREE.MeshBasicMaterial({ color: 0xd9c9a8 }), hit: new THREE.MeshBasicMaterial({ color: 0xff4655 }) };
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(partGeo, mats.dust);
      m.visible = false;
      scene.add(m);
      fx.parts.push({ m, v: new THREE.Vector3(), life: 0, mats });
    }
  })();

  function addTracer(from, ex, ey, ez) {
    const tr = fx.tracers.find(t => t.t <= 0) || fx.tracers[0];
    const a = tr.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, ex, ey, ez);
    a.needsUpdate = true;
    tr.t = 0.07;
    tr.line.visible = true;
  }

  function addDecal(h) {
    const m = fx.decals[fx.decalI++ % fx.decals.length];
    m.position.set(h.x + h.nx * 0.005, h.y + h.ny * 0.005, h.z + h.nz * 0.005);
    _v.set(m.position.x + h.nx, m.position.y + h.ny, m.position.z + h.nz);
    m.lookAt(_v);
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
  }

  function particles(x, y, z, nx, ny, nz, n, kind) {
    for (let i = 0; i < n; i++) {
      const p = fx.parts.find(q => q.life <= 0);
      if (!p) return;
      p.m.material = p.mats[kind];
      p.m.position.set(x, y, z);
      p.v.set(nx * rand(1, 3) + rand(-1.5, 1.5), ny * rand(1, 3) + rand(0, 2.5), nz * rand(1, 3) + rand(-1.5, 1.5));
      p.life = rand(0.25, 0.5);
      p.m.visible = true;
    }
  }

  const flareMat = new THREE.SpriteMaterial({ map: Models.flashTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  function addFlare(pos) {
    const s = new THREE.Sprite(flareMat.clone());
    s.position.copy(pos);
    scene.add(s);
    fx.flares.push({ s, t: 0 });
  }

  function updateEffects(dt) {
    for (const tr of fx.tracers) {
      if (tr.t <= 0) continue;
      tr.t -= dt;
      tr.line.material.opacity = Math.max(0, tr.t / 0.07) * 0.8;
      if (tr.t <= 0) tr.line.visible = false;
    }
    for (const p of fx.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(Math.max(0.1, p.life * 2.5));
      if (p.life <= 0) p.m.visible = false;
    }
    for (let i = fx.flares.length - 1; i >= 0; i--) {
      const f = fx.flares[i];
      f.t += dt;
      const k = f.t / 0.35;
      f.s.scale.setScalar(1 + k * 7);
      f.s.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        scene.remove(f.s);
        fx.flares.splice(i, 1);
      }
    }
  }

  function clearEffects() {
    for (const pr of projectiles) scene.remove(pr.mesh);
    projectiles.length = 0;
    for (const s of World.smokes) scene.remove(s.mesh);
    World.smokes.length = 0;
    for (const d of fx.decals) d.visible = false;
    for (const t of fx.tracers) { t.t = 0; t.line.visible = false; }
    for (const p of fx.parts) { p.life = 0; p.m.visible = false; }
    for (const f of fx.flares) scene.remove(f.s);
    fx.flares.length = 0;
  }

  // ---------------------------------------------------------- viewmodel

  const vm = {
    root: new THREE.Group(), model: null, id: null,
    flash: Models.muzzleSprite(0.2), flashT: 0,
    kick: 0, bob: 0, swayX: 0, swayY: 0, swing: 0,
  };
  vmScene.add(vm.root);
  const VM_SCALE = 0.62;
  const VM_POS = {
    rifle: [0.15, -0.155, -0.36], smg: [0.14, -0.15, -0.35], sniper: [0.16, -0.16, -0.36],
    sidearm: [0.12, -0.12, -0.34], melee: [0.14, -0.14, -0.3],
  };
  const VM_ADS = { rifle: [0, -0.098, -0.3], smg: [0, -0.09, -0.3] };

  function setViewmodel(id) {
    if (vm.model) vm.root.remove(vm.model);
    const g = Models.gun(id);
    const glove = Models.mat(0x2b2f3a), sleeve = Models.mat(0x41475a), cuff = Models.mat(0xff4655, 0x5a1018);
    const box = (w, h, d, x, y, z, m, rx = 0, ry = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.rotation.set(rx, ry, 0);
      g.add(b);
    };
    box(0.065, 0.08, 0.1, 0, -0.035, 0.03, glove);
    box(0.09, 0.09, 0.42, 0.04, -0.1, 0.26, sleeve, 0.35, 0.12);
    box(0.095, 0.03, 0.095, 0.02, -0.065, 0.1, cuff, 0.35, 0.12);
    const h2 = g.userData.hand2;
    if (h2) {
      box(0.07, 0.07, 0.11, h2[0] - 0.01, h2[1] - 0.05, h2[2], glove);
      box(0.09, 0.09, 0.5, -0.15, -0.13, h2[2] + 0.24, sleeve, 0.25, -0.55);
    }
    g.add(vm.flash);
    vm.flash.position.copy(g.userData.muzzle);
    g.scale.setScalar(VM_SCALE);
    vm.root.add(g);
    vm.model = g;
    vm.id = id;
  }

  function updateViewmodel(dt) {
    const p = player, st = p.fire, w = p.gun().w;
    if (!vm.model) return;
    vm.root.visible = p.alive && inMatch() && !(w.type === 'sniper' && p.adsT > 0.9);
    const base = VM_POS[w.type] || VM_POS.rifle;
    const adsPos = VM_ADS[w.type];
    const ads = adsPos ? smooth(p.adsT) : 0;
    let x = base[0], y = base[1], z = base[2];
    if (adsPos) { x = lerp(x, adsPos[0], ads); y = lerp(y, adsPos[1], ads); z = lerp(z, adsPos[2], ads); }
    let rx = 0, ry = 0, rz = 0;

    const speed = Math.hypot(p.vel.x, p.vel.z);
    vm.bob += dt * speed * 1.5;
    const bobAmt = p.onGround ? Math.min(1, speed / MOVE.run) * (1 - ads * 0.85) : 0.3;
    x += Math.sin(vm.bob) * 0.011 * bobAmt;
    y += -Math.abs(Math.cos(vm.bob)) * 0.012 * bobAmt;
    if (!p.onGround) y += clamp(p.vel.y * 0.004, -0.03, 0.03);

    vm.swayX = lerp(vm.swayX, 0, Math.min(1, dt * 10));
    vm.swayY = lerp(vm.swayY, 0, Math.min(1, dt * 10));
    x -= clamp(vm.swayX * 0.0003, -0.03, 0.03) * (1 - ads);
    y += clamp(vm.swayY * 0.0003, -0.03, 0.03) * (1 - ads);
    ry -= clamp(vm.swayX * 0.0012, -0.08, 0.08) * (1 - ads);

    vm.kick = approach(vm.kick, 0, dt * 0.5);
    z += vm.kick;
    rx += vm.kick * 2.2;

    if (st.equip > 0) {
      const e = st.equip / w.equip;
      y -= e * 0.25;
      rx -= e * 0.7;
    }
    if (st.reload > 0) {
      const k = Math.sin((1 - st.reload / st.reloadTotal) * Math.PI);
      y -= k * 0.07;
      rx += k * 0.25;
      rz += k * 0.55;
    }
    if (w.type === 'melee') {
      rx += 0.25;
      rz += 0.2;
      if (vm.swing > 0) {
        vm.swing = Math.max(0, vm.swing - dt * 4);
        const s = Math.sin((1 - vm.swing) * Math.PI);
        x -= s * 0.18;
        ry += s * 1.0;
        rz -= s * 0.6;
      }
    }
    if (p.crouch > 0) y += p.crouch * 0.01;

    vm.model.position.set(x, y, z);
    vm.model.rotation.set(rx, ry, rz);
    vm.flashT -= dt;
    vm.flash.visible = vm.flashT > 0;
    if (vm.flash.visible) vm.flash.material.rotation = Math.random() * 6;
  }

  // -------------------------------------------------------------- camera

  function updateCamera(dt) {
    if (game.state === 'menu') {
      const t = game.time * 0.06;
      camera.position.set(Math.cos(t) * 30, 15, Math.sin(t) * 19);
      camera.lookAt(0, 0, 0);
      game.zoom = 1;
      game.fovKick = 0;
      updateFov();
      return;
    }
    const p = player;
    if (p.alive || game.state === 'matchEnd') {
      camera.position.set(p.pos.x, p.eyeY, p.pos.z);
      const st = p.fire;
      camera.rotation.set(p.pitch + st.recoilP * 0.3 * DEG, p.yaw + st.recoilY * 0.3 * DEG, 0);
    } else {
      game.deathT += dt;
      const k = Math.min(1, game.deathT / 0.6);
      camera.position.set(p.pos.x, p.pos.y + lerp(MOVE.eye, 0.35, k * k), p.pos.z);
      camera.rotation.set(p.pitch * (1 - k), p.yaw, k * 0.45);
    }
    const w = p.gun().w;
    game.zoom = p.alive ? 1 + ((w.zoom || 1) - 1) * smooth(p.adsT) : 1;
    game.fovKick = approach(game.fovKick, 0, dt * 30);
    updateFov();
  }

  // ----------------------------------------------------------------- HUD

  const ui = {};
  ['scoreYou', 'scoreBot', 'timer', 'phase', 'roundLabel', 'hp', 'shield', 'mag', 'reserve', 'weaponName',
    'credits', 'banner', 'bannerTitle', 'bannerSub', 'centerMsg', 'killfeed', 'hitmarker', 'dmgDir',
    'flashOverlay', 'smokeOverlay', 'hurtOverlay', 'scope', 'crosshair', 'reloadBar', 'reloadFill',
    'ammoSep', 'pipsQ', 'pipsE', 'pipsC', 'abQ', 'abE', 'abC', 'slot1', 'slot2', 'slot3', 'minimap', 'deathPanel'].forEach(id => { ui[id] = $(id); });
  const _text = new Map();
  function setText(el, v) {
    if (_text.get(el) !== v) { _text.set(el, v); el.textContent = v; }
  }

  let bannerT = 0;
  function banner(title, sub, color, dur) {
    ui.bannerTitle.textContent = title;
    ui.bannerTitle.style.color = color;
    ui.bannerSub.textContent = sub;
    ui.banner.classList.remove('show');
    void ui.banner.offsetWidth; // restart the CSS animation
    ui.banner.classList.add('show');
    bannerT = dur;
  }

  function centerMsg(html) {
    ui.centerMsg.innerHTML = html;
  }

  function hitmarker(head) {
    ui.hitmarker.classList.remove('show', 'head');
    void ui.hitmarker.offsetWidth;
    ui.hitmarker.classList.add('show');
    if (head) ui.hitmarker.classList.add('head');
  }

  function showDamageDir(from) {
    const dx = from.pos.x - player.pos.x, dz = from.pos.z - player.pos.z;
    const rel = Math.atan2(-dx, -dz) - player.yaw;
    const el = document.createElement('div');
    el.className = 'dmg-arc';
    el.style.transform = `rotate(${-rel / DEG}deg)`;
    ui.dmgDir.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  function addKillfeed(killer, victim, w, head) {
    const el = document.createElement('div');
    el.className = 'kf' + (killer === player ? ' mine' : '');
    const name = f => `<span class="${f === player ? 'ally' : 'enemy'}">${f === player ? 'YOU' : 'BOT'}</span>`;
    el.innerHTML = `${name(killer)}<span class="wpn">${w.name.toUpperCase()}</span>${head ? '<span class="hs">◉</span>' : ''}${name(victim)}`;
    ui.killfeed.prepend(el);
    setTimeout(() => el.remove(), 6000);
  }

  function showDeathPanel(killer, w, head) {
    ui.deathPanel.innerHTML = `
      <div class="dp-top">ELIMINATED BY <b class="enemy">BOT</b></div>
      <div class="dp-wpn">${w.name}${head ? ' · headshot' : ''}</div>
      <div class="dp-row"><span>Enemy health left</span><b>${Math.ceil(killer.hp)} HP${killer.shield > 0 ? ' + ' + Math.ceil(killer.shield) + ' shield' : ''}</b></div>
      <div class="dp-row"><span>Damage you dealt</span><b>${Math.round(player.round.dealt)}</b></div>`;
    ui.deathPanel.classList.remove('hidden');
  }

  function formatTime(t) {
    t = Math.max(0, Math.ceil(t));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  function pips(el, n, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += i < n ? '●' : '○';
    setText(el, s);
  }

  function updateHUD(dt) {
    const p = player, g = p.gun(), w = g.w, st = p.fire;
    setText(ui.scoreYou, String(game.score[0]));
    setText(ui.scoreBot, String(game.score[1]));
    setText(ui.roundLabel, `ROUND ${game.round}`);
    setText(ui.timer, game.state === 'roundEnd' ? '–:––' : formatTime(game.timer));
    setText(ui.phase, game.state === 'buy' ? 'BUY PHASE' : game.state === 'combat' ? `FIRST TO ${game.firstTo}` : '');
    ui.timer.classList.toggle('low', game.state === 'combat' && game.timer < 10);
    setText(ui.hp, String(Math.ceil(p.hp)));
    setText(ui.shield, String(Math.ceil(p.shield)));
    ui.hp.classList.toggle('low', p.hp <= 30);
    setText(ui.mag, w.mag ? String(g.mag) : '–');
    setText(ui.reserve, w.mag ? String(g.reserve) : '');
    ui.ammoSep.style.display = w.mag ? '' : 'none';
    ui.mag.classList.toggle('low', !!w.mag && g.mag <= w.mag * 0.25);
    setText(ui.weaponName, w.name.toUpperCase());
    setText(ui.credits, `◈ ${p.credits}`);
    ui.credits.classList.toggle('big', game.state === 'buy');
    pips(ui.pipsQ, p.abil.flash, ABILITIES.flash.max);
    pips(ui.pipsE, p.abil.dash, ABILITIES.dash.max);
    pips(ui.pipsC, p.abil.smoke, ABILITIES.smoke.max);
    ui.abQ.classList.toggle('empty', p.abil.flash <= 0);
    ui.abE.classList.toggle('empty', p.abil.dash <= 0);
    ui.abC.classList.toggle('empty', p.abil.smoke <= 0);
    setText(ui.slot1, p.primary ? '1  ' + p.primary.w.name.toUpperCase() : '1  —');
    setText(ui.slot2, '2  ' + p.secondary.w.name.toUpperCase());
    ui.slot1.classList.toggle('on', p.slot === 1);
    ui.slot2.classList.toggle('on', p.slot === 2);
    ui.slot3.classList.toggle('on', p.slot === 3);

    const scoped = w.type === 'sniper' && p.adsT > 0.9 && p.alive;
    ui.scope.classList.toggle('hidden', !scoped);
    ui.crosshair.style.display = scoped || !p.alive ? 'none' : '';
    ui.reloadBar.classList.toggle('hidden', !(st.reload > 0));
    if (st.reload > 0) ui.reloadFill.style.width = `${(1 - st.reload / st.reloadTotal) * 100}%`;

    game.flashT = Math.max(0, game.flashT - dt);
    ui.flashOverlay.style.opacity = String(clamp(game.flashT / 0.8, 0, 1));
    game.hurtT = Math.max(0, game.hurtT - dt);
    ui.hurtOverlay.style.opacity = String(clamp(game.hurtT / 0.45, 0, 1) * 0.8);
    let inSmoke = 0;
    for (const s of World.smokes) {
      const d = camera.position.distanceTo(s.mesh.position);
      const r = s.r * s.scale * 0.98;
      if (d < r) inSmoke = Math.max(inSmoke, clamp((r - d) / 0.6, 0, 1));
    }
    ui.smokeOverlay.style.opacity = String(inSmoke * 0.92);

    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) ui.banner.classList.remove('show');
    }
    if (game.state !== 'buy' && ui.centerMsg.innerHTML) centerMsg('');
    if (game.buyOpen) refreshBuy();
  }

  // ------------------------------------------------------------ minimap

  const MM = { s: 3, pad: 4 };
  const mmCtx = ui.minimap.getContext('2d');
  const mmBg = document.createElement('canvas');
  mmBg.width = ui.minimap.width;
  mmBg.height = ui.minimap.height;
  const mmX = x => MM.pad + (x + 32) * MM.s;
  const mmY = z => MM.pad + (z + 20) * MM.s;
  (function drawMinimapBg() {
    const g = mmBg.getContext('2d');
    g.fillStyle = 'rgba(15,25,35,0.75)';
    g.fillRect(0, 0, mmBg.width, mmBg.height);
    const spawnW = (32 - RULES.barrierX) * MM.s;
    g.fillStyle = 'rgba(60,227,196,0.15)';
    g.fillRect(mmX(-32), mmY(-20), spawnW, 40 * MM.s);
    g.fillStyle = 'rgba(255,70,85,0.15)';
    g.fillRect(mmX(RULES.barrierX), mmY(-20), spawnW, 40 * MM.s);
    for (const b of World.boxes) {
      if (b.mat === 'floor') continue;
      g.fillStyle = b.max[1] > 2 ? 'rgba(236,232,225,0.85)' : 'rgba(236,232,225,0.4)';
      g.fillRect(mmX(b.min[0]), mmY(b.min[2]), (b.max[0] - b.min[0]) * MM.s, (b.max[2] - b.min[2]) * MM.s);
    }
    g.fillStyle = 'rgba(236,232,225,0.6)';
    g.font = 'bold 11px Arial';
    g.fillText('A', mmX(-1), mmY(-16));
    g.fillText('B', mmX(-1), mmY(18));
  })();

  let mmT = 0;
  function drawMinimap(dt) {
    mmT -= dt;
    if (mmT > 0) return;
    mmT = 1 / 20;
    const g = mmCtx;
    g.clearRect(0, 0, ui.minimap.width, ui.minimap.height);
    g.drawImage(mmBg, 0, 0);
    for (const s of World.smokes) {
      g.fillStyle = 'rgba(157,140,214,0.6)';
      g.beginPath();
      g.arc(mmX(s.x), mmY(s.z), s.r * s.scale * MM.s, 0, Math.PI * 2);
      g.fill();
    }
    // Enemy shows up while you can see it, or briefly when it shoots
    if (game.state !== 'buy' && (game.botSeen || game.botShotT > 0 || !bot.alive)) {
      const x = mmX(bot.pos.x), y = mmY(bot.pos.z);
      g.fillStyle = '#ff4655';
      if (bot.alive) {
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      } else {
        g.font = 'bold 10px Arial';
        g.fillText('✕', x - 4, y + 4);
      }
    }
    const px = mmX(player.pos.x), py = mmY(player.pos.z);
    const fx_ = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    g.fillStyle = 'rgba(60,227,196,0.18)';
    g.beginPath();
    g.moveTo(px, py);
    const a0 = Math.atan2(fz, fx_);
    g.arc(px, py, 26, a0 - 0.75, a0 + 0.75);
    g.closePath();
    g.fill();
    g.save();
    g.translate(px, py);
    g.rotate(a0 + Math.PI / 2);
    g.fillStyle = '#3ce3c4';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4.5, 4.5); g.lineTo(-4.5, 4.5);
    g.closePath();
    g.fill();
    g.restore();
  }

  // ----------------------------------------------------------- buy menu

  function buildBuyMenu() {
    const grid = $('buyGrid');
    let html = '';
    for (const sec of BUY_SECTIONS) {
      html += `<section><h3>${sec.title}</h3>`;
      for (const id of sec.items) {
        const w = WEAPONS[id], r = w.falloff[0];
        html += `<button class="item" data-kind="weapon" data-id="${id}">
          <span class="nm">${w.name}</span><span class="cost">${w.cost ? '◈ ' + w.cost : 'FREE'}</span>
          <span class="st">HEAD ${r[1]} · BODY ${r[2]} · ${w.auto ? 'AUTO' : 'SEMI'} · MAG ${w.mag}</span></button>`;
      }
      html += '</section>';
    }
    html += '<section><h3>Shields</h3>';
    for (const k of Object.keys(SHIELDS)) {
      const s = SHIELDS[k];
      html += `<button class="item" data-kind="shield" data-id="${k}"><span class="nm">${s.name}</span><span class="cost">◈ ${s.cost}</span><span class="st">+${s.amount} SHIELD</span></button>`;
    }
    html += '</section><section><h3>Abilities</h3>';
    for (const k of Object.keys(ABILITIES)) {
      const a = ABILITIES[k];
      html += `<button class="item" data-kind="ability" data-id="${k}"><span class="nm"><kbd>${a.key}</kbd> ${a.name} <i class="cnt"></i></span><span class="cost">${a.cost ? '◈ ' + a.cost : 'FREE'}</span><span class="st">${a.desc}</span></button>`;
    }
    html += '</section>';
    grid.innerHTML = html;
    grid.addEventListener('click', e => onBuyClick(e, false));
    grid.addEventListener('contextmenu', e => onBuyClick(e, true));
  }

  function onBuyClick(e, sell) {
    const btn = e.target.closest('.item');
    if (!btn || game.state !== 'buy') return;
    e.preventDefault();
    const { kind, id } = btn.dataset;
    let r;
    if (kind === 'weapon') r = buyWeapon(player, id);
    else if (kind === 'shield') r = buyShield(player, id);
    else r = buyAbility(player, id, sell || player.abil[id] >= ABILITIES[id].max && player.bought[id] > 0);
    if (r) Sfx.buy(); else Sfx.deny();
    refreshBuy();
  }

  function refreshBuy() {
    setText($('buyCredits'), String(player.credits));
    for (const btn of $('buyGrid').querySelectorAll('.item')) {
      const { kind, id } = btn.dataset;
      let owned = false, cost = 0, refund = 0;
      if (kind === 'weapon') {
        const w = WEAPONS[id], key = w.slot === 1 ? 'primary' : 'secondary';
        owned = !!player[key] && player[key].id === id;
        cost = w.cost;
        refund = player.bought[key] ? WEAPONS[player.bought[key]].cost : 0;
      } else if (kind === 'shield') {
        owned = player.bought.shield === id || (!player.bought.shield && player.shield >= SHIELDS[id].amount);
        cost = SHIELDS[id].cost;
        refund = player.bought.shield ? SHIELDS[player.bought.shield].cost : 0;
      } else {
        const a = ABILITIES[id];
        owned = player.abil[id] >= a.max;
        cost = a.cost;
        btn.querySelector('.cnt').textContent = `${player.abil[id]}/${a.max}`;
      }
      btn.classList.toggle('owned', owned);
      btn.classList.toggle('cant', !owned && player.credits + refund < cost);
    }
  }

  function toggleBuy() {
    if (game.buyOpen) closeBuy(true);
    else if (game.state === 'buy' && player.alive) openBuy();
  }

  function openBuy() {
    game.buyOpen = true;
    refreshBuy();
    $('buyMenu').classList.remove('hidden');
    fireHeld = adsHeld = false;
    if (locked()) document.exitPointerLock();
  }

  function closeBuy(relock) {
    game.buyOpen = false;
    $('buyMenu').classList.add('hidden');
    if (relock && inMatch()) lock();
    else if (inMatch() && !locked()) setPaused(true);
  }

  // --------------------------------------------------------- scoreboard

  function renderScoreboard() {
    const row = (f, cls) => {
      const s = f.stats, rounds = Math.max(1, game.round - (game.state === 'buy' ? 1 : 0));
      const loadout = [f.primary && f.primary.w.name, f.secondary.w.name].filter(Boolean).join(' / ');
      return `<tr class="${cls}"><td>${f === player ? 'YOU' : 'BOT (' + game.diff.name + ')'}</td><td>${s.kills}</td><td>${s.deaths}</td>
        <td>${s.hits ? Math.round(s.head / s.hits * 100) + '%' : '–'}</td><td>${Math.round(s.dmg / rounds)}</td>
        <td>${f === player ? '◈ ' + f.credits : '?'}</td><td>${f === player || game.state !== 'combat' ? loadout : '?'}</td></tr>`;
    };
    $('sbBody').innerHTML = row(player, 'ally') + row(bot, 'enemy');
  }

  // --------------------------------------------------------------- menus

  function buildMenu() {
    const seg = (el, opts, key, fmt = v => v) => {
      el.innerHTML = opts.map(o => `<button data-v="${o}">${fmt(o)}</button>`).join('');
      const mark = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[key]) === b.dataset.v));
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        settings[key] = typeof settings[key] === 'number' ? Number(b.dataset.v) : b.dataset.v;
        if (key === 'quality') {
          settings.autoQuality = false; // the player picked one, so stop adjusting it
          applyQuality();
        }
        saveSettings();
        mark();
      });
      mark();
    };
    seg($('optDifficulty'), Object.keys(DIFFICULTIES), 'difficulty', k => DIFFICULTIES[k].name);
    seg($('optRounds'), [3, 5, 7, 13], 'firstTo');
    seg($('optQuality'), ['low', 'medium', 'high'], 'quality', q => q[0].toUpperCase() + q.slice(1));

    const slider = (key, fmt, onChange) => {
      for (const el of document.querySelectorAll(`[data-setting="${key}"]`)) {
        el.value = settings[key];
        const label = el.parentElement.querySelector('output');
        if (label) label.textContent = fmt(settings[key]);
        el.addEventListener('input', () => {
          settings[key] = Number(el.value);
          document.querySelectorAll(`[data-setting="${key}"]`).forEach(o => {
            o.value = el.value;
            const l = o.parentElement.querySelector('output');
            if (l) l.textContent = fmt(settings[key]);
          });
          if (onChange) onChange();
          saveSettings();
        });
      }
    };
    slider('sens', v => v.toFixed(2));
    slider('volume', v => Math.round(v * 100) + '%', () => Sfx.setVolume(settings.volume));
    slider('fov', v => v + '°', () => updateFov());

    const swatches = (el, key, colors, onChange) => {
      el.innerHTML = colors.map(c => `<button data-v="${c}" style="--c:${c}"></button>`).join('');
      const mark = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', settings[key] === b.dataset.v));
      el.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        settings[key] = b.dataset.v;
        saveSettings();
        mark();
        onChange();
      });
      mark();
    };
    const applyColors = () => {
      document.documentElement.style.setProperty('--ch', settings.crosshair);
      botModel.userData.outlineMat.color.set(settings.highlight);
    };
    swatches($('optCrosshair'), 'crosshair', ['#00ffb0', '#ffffff', '#ffff00', '#ff4fd8', '#00e5ff', '#ff4655'], applyColors);
    swatches($('optHighlight'), 'highlight', ['#ff4655', '#ffd400', '#c64bff'], applyColors);
    applyColors();

    $('playBtn').addEventListener('click', startMatch);
    $('againBtn').addEventListener('click', startMatch);
    $('menuBtn').addEventListener('click', quitToMenu);
    $('resumeBtn').addEventListener('click', () => lock());
    $('quitBtn').addEventListener('click', quitToMenu);
    $('fullBtn').addEventListener('click', () => {
      const el = document.documentElement;
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      const p = el.requestFullscreen && el.requestFullscreen();
      // In fullscreen, keyboard lock stops Ctrl+W & friends from closing the tab
      if (p && p.then) p.then(() => navigator.keyboard && navigator.keyboard.lock && navigator.keyboard.lock().catch(() => {})).catch(() => {});
    });
    Sfx.setVolume(settings.volume);
  }

  // ------------------------------------------------------------ main loop

  function update(dt) {
    game.time += dt;
    if (game.state === 'menu') {
      Models.animateAgent(botModel, bot, dt);
      return;
    }
    if (inMatch()) {
      updatePhase(dt);
      updatePlayer(dt);
      updateBot(dt);
      updateProjectiles(dt);
      game.botSeenT -= dt;
      if (game.botSeenT <= 0) {
        game.botSeenT = 0.1;
        game.botSeen = bot.alive && player.alive && canSee(player, bot, 140);
      }
    }
    updateEffects(dt);
    updateCamera(dt);
    updateViewmodel(dt);
    if (inMatch()) {
      updateHUD(dt);
      drawMinimap(dt);
    }
  }

  function render() {
    renderer.clear();
    renderer.render(scene, camera);
    if (vm.root.visible && inMatch()) {
      renderer.clearDepth();
      renderer.render(vmScene, vmCamera);
    }
  }

  // Steps graphics down if a school laptop can't keep up.
  const perf = { t: 0, frames: 0 };
  function autoQuality(realDt) {
    if (!settings.autoQuality || game.state !== 'combat' || game.paused || game.frozen || document.hidden) {
      perf.t = perf.frames = 0;
      return;
    }
    perf.t += realDt;
    perf.frames++;
    if (perf.t < 3) return;
    const fps = perf.frames / perf.t;
    perf.t = perf.frames = 0;
    if (fps < 38 && settings.quality !== 'low') {
      settings.quality = settings.quality === 'high' ? 'medium' : 'low';
      applyQuality();
      saveSettings();
      document.querySelectorAll('#optQuality button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.quality));
      toast(`Graphics lowered to ${settings.quality} for smoother play`);
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = (now - last) / 1000;
    last = now;
    if (!game.paused && !game.frozen) update(Math.min(0.05, realDt));
    render();
    autoQuality(realDt);
  }

  bot.pos.set(28, 0, 0);
  bot.yaw = Math.PI / 2;
  Models.setAgentGun(botModel, 'vandal');
  setViewmodel('classic');
  buildBuyMenu();
  buildMenu();
  applyQuality();
  requestAnimationFrame(frame);

  // Handy for debugging from the console
  window.GAME = {
    game, player, bot, brain, settings, startMatch, beginCombat, endRound, setPaused, World,
    camera, render,
    step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); render(); },
  };
})();
