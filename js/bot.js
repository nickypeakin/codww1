'use strict';
// The bot: sight + hearing, a few tactical states (hold an angle, push a
// lane, search where it last saw or heard you, fight) and aim that starts
// a little off and settles onto you, like a human flicking.

const BOT_HOLDS = [
  { x: 20, z: -13, look: [-1, 0], lane: 'A' },
  { x: 11, z: -12, look: [-1, -0.15], lane: 'A' },
  { x: 14, z: -8.5, look: [0, -1], lane: 'A', crouch: true },
  { x: 17, z: -2.5, look: [-1, 0], lane: 'mid', crouch: true },
  { x: 12.2, z: 4.5, look: [-1, 0], lane: 'mid' },
  { x: 16, z: 13, look: [-1, 0.25], lane: 'B' },
  { x: 10.6, z: 13.5, look: [-1, 0], lane: 'B' },
];

// Routes into your half for each lane (A* fills in the gaps).
const BOT_PUSHES = {
  A: [{ x: -2, z: -15.5 }, { x: -14, z: -12.5 }, { x: -22, z: -13 }, { x: -28, z: -4 }],
  mid: [{ x: -6, z: -7 }, { x: -12, z: -1 }, { x: -20, z: -2 }, { x: -28, z: 3 }],
  B: [{ x: 4, z: 17 }, { x: -9, z: 13 }, { x: -20, z: 12.5 }, { x: -28, z: 5 }],
};

const wrapAngle = a => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const randRange = (a, b) => a + Math.random() * (b - a);
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

class BotBrain {
  constructor(bot, game) {
    this.b = bot;
    this.g = game;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.path = null;
    this.pathI = 0;
    this.pathGoal = null;
    this.repathT = 0;
    this.known = null;
    this.knownAge = 99;
    this.visible = false;
    this.lostT = 0;
    this.thinkT = 0;
    this.react = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.aimPart = 'body';
    this.phase = 'shoot';
    this.phaseT = 0;
    this.strafeDir = 1;
    this.burst = 0;
    this.burstPause = 0;
    this.hold = null;
    this.holdT = 0;
    this.lane = 'mid';
    this.stage = 0;
    this.searchWait = 0;
    this.flashPlan = null;
    this.walk = false;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.engageT = 0;
    this.wish = { x: 0, z: 0, speed: 0, jump: false };
  }

  get D() { return this.g.diff; }

  startRound() {
    this.reset();
    const D = this.D;
    this.lastPos.copy(this.b.pos);
    if (Math.random() < D.aggression) {
      // Hold briefly in a lane, then push through it
      this.lane = pick(['A', 'mid', 'B']);
      this.hold = pick(BOT_HOLDS.filter(h => h.lane === this.lane));
      this.holdT = randRange(2, 10);
    } else {
      this.hold = pick(BOT_HOLDS);
      this.lane = this.hold.lane;
      this.holdT = randRange(14, 32);
    }
    this.state = 'hold';
  }

  // Called by the game whenever you make noise.
  hear(pos, kind) {
    const b = this.b;
    if (!b.alive || this.state === 'idle') return;
    if (this.state === 'engage' && this.visible) return;
    const blur = kind === 'shot' ? 0.5 : kind === 'step' ? 2 : 1;
    this.known = new THREE.Vector3(pos.x + randRange(-blur, blur), pos.y, pos.z + randRange(-blur, blur));
    this.knownAge = 0;
    if (this.state === 'engage' || this.state === 'search') return;
    if (this.state === 'hold' && Math.random() < this.D.walkChance) {
      // Good bots stay put and swing their crosshair toward the noise
      const dx = this.known.x - b.pos.x, dz = this.known.z - b.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      this.hold = { x: b.pos.x, z: b.pos.z, look: [dx / l, dz / l], crouch: this.hold && this.hold.crouch };
      this.holdT = Math.max(this.holdT, randRange(2, 5));
      return;
    }
    this.beginSearch(kind === 'shot' ? randRange(0.2, 0.8) : randRange(0.4, 1.5));
  }

  // Called when you damage the bot.
  hurt(from) {
    if (this.state !== 'engage') {
      this.known = from.pos.clone();
      this.knownAge = 0;
      // Snap toward the attacker a bit faster than a normal spot
      this.spot(0.7);
    }
  }

  beginSearch(wait) {
    this.state = 'search';
    this.searchWait = wait;
    this.walk = Math.random() < this.D.walkChance;
    this.path = null;
    this.flashPlan = null;
    const b = this.b;
    if (this.known && b.abil.flash > 0 && Math.random() < this.D.flash) {
      const d = Math.hypot(this.known.x - b.pos.x, this.known.z - b.pos.z);
      if (d > 5 && d < 28) this.flashPlan = { t: wait * 0.5 + 0.1 };
    }
  }

  spot(reactScale = 1) {
    const D = this.D, b = this.b, p = this.g.player;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
    const ang = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - b.yaw)) / DEG;
    // Slower to react to things at the edge of vision or while flashed
    this.react = (D.reaction * randRange(0.85, 1.25) + (ang > 40 ? 0.12 : 0) + (b.blind > 0 ? 0.3 : 0)) * reactScale;
    if (this.state === 'engage' && this.lostT < 1.2) this.react *= 0.5;
    const e = D.aimErr * randRange(0.6, 1.3), a = Math.random() * Math.PI * 2;
    this.errYaw = Math.cos(a) * e;
    this.errPitch = Math.sin(a) * e * 0.6;
    this.aimPart = Math.random() < D.hs ? 'head' : 'body';
    if (this.state !== 'engage') {
      this.phase = 'shoot';
      this.burst = randInt(D.burst);
      this.engageT = 0;
    }
    this.state = 'engage';
    this.lostT = 0;
    this.path = null;
  }

  update(dt) {
    const b = this.b, p = this.g.player;
    this.wish.x = this.wish.z = 0;
    this.wish.speed = 0;
    this.wish.jump = false;
    if (!b.alive || this.state === 'idle') return;
    if (b.blind > 0) b.blind -= dt;
    this.knownAge += dt;

    // Perception, a few times a second like a real reaction loop
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.08;
      const vis = b.blind < 0.25 && p.alive && this.g.canSee(b, p, 120);
      if (vis) {
        if (!this.visible || this.state !== 'engage') this.spot();
        this.known = p.pos.clone();
        this.knownAge = 0;
      }
      this.visible = vis;
    }
    if (this.state === 'engage' && !p.alive) this.state = 'hold';

    switch (this.state) {
      case 'engage': this.engage(dt); break;
      case 'hold': this.doHold(dt); break;
      case 'push': this.doPush(dt); break;
      case 'search': this.doSearch(dt); break;
      case 'hunt': this.doHunt(dt); break;
    }

    const best = b.primary ? 1 : 2;
    if (this.state !== 'engage' && b.slot !== best && b.fire.reload <= 0) this.g.switchSlot(b, best);
    // Reload in quiet moments
    const gun = b.gun();
    if (this.state !== 'engage' && gun.w.mag && gun.mag < gun.w.mag * 0.5 && gun.reserve > 0) this.g.startReload(b);
  }

  // ----------------------------------------------------------- fighting

  engage(dt) {
    const b = this.b, p = this.g.player, D = this.D;
    this.engageT += dt;
    const gun = b.gun(), w = gun.w;
    const tgt = this.visible ? p.pos : this.known || p.pos;
    let ty;
    if (this.visible) ty = this.aimPart === 'head' ? p.eyeY + 0.04 : p.pos.y + p.height * 0.62;
    else ty = tgt.y + 1.3;

    const ex = b.pos.x, ey = b.eyeY, ez = b.pos.z;
    const dx = tgt.x - ex, dy = ty - ey, dz = tgt.z - ez;
    const hd = Math.hypot(dx, dz);
    const k = Math.exp(-D.settle * dt);
    this.errYaw *= k;
    this.errPitch *= k;
    const wob = b.blind > 0 ? 6 : 0.25;
    const yaw = Math.atan2(-dx, -dz) + (this.errYaw + Math.sin(this.g.time * 7.3) * wob) * DEG;
    const pitch = Math.atan2(dy, hd) + (this.errPitch + Math.cos(this.g.time * 6.1) * wob * 0.5) * DEG;
    const onTarget = this.turnToward(yaw, pitch, D.turn, dt) < 1.6;

    if (!this.visible) {
      this.lostT += dt;
      if (this.lostT > 0.7) {
        this.beginSearch(randRange(0.6, 2.2));
        return;
      }
    }
    this.react -= dt;

    if (gun.mag === 0 && gun.reserve > 0) this.g.startReload(b);
    if (gun.mag === 0 && gun.reserve === 0 && b.slot === 1) this.g.switchSlot(b, 2);

    // Strafe, stop, shoot - the Valorant rhythm
    const speed = Math.hypot(b.vel.x, b.vel.z);
    let canShoot = this.visible && this.react <= 0 && onTarget;
    const precise = w.type === 'rifle' || w.type === 'sniper' || w.id === 'sheriff';
    if (D.strafe && w.type !== 'sniper') {
      this.phaseT -= dt;
      if (this.phase === 'strafe') {
        const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
        this.wish.x = rx * this.strafeDir;
        this.wish.z = rz * this.strafeDir;
        this.wish.speed = MOVE.run * w.speed;
        if (this.phaseT <= 0 || !this.visible && this.lostT > 0.3) {
          this.phase = 'shoot';
          this.burst = randInt(D.burst);
          b.wantCrouch = Math.random() < 0.15;
        }
        canShoot = canShoot && w.type === 'smg' && Math.random() < 0.3;
      } else if (b.fire.reload > 0) {
        this.phase = 'strafe';
        this.phaseT = randRange(0.3, 0.7);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      if (precise && speed > 1.6) canShoot = false;
    } else {
      b.wantCrouch = false;
      if (w.type === 'sniper' && speed > 1) canShoot = false;
    }

    if (this.burstPause > 0) {
      this.burstPause -= dt;
      canShoot = false;
    }

    if (canShoot && this.g.tryFire(b)) {
      if (!w.auto) b.fire.cd += randRange(0.04, 0.18);
      if (--this.burst <= 0) {
        if (D.strafe && w.type !== 'sniper') {
          this.phase = 'strafe';
          this.phaseT = randRange(0.18, 0.45);
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          b.wantCrouch = false;
        } else {
          this.burst = randInt(D.burst);
          this.burstPause = randRange(0.15, 0.4);
        }
        // Each burst re-rolls where it aims, with a smaller error
        this.aimPart = Math.random() < D.hs ? 'head' : 'body';
        const e = D.aimErr * 0.35, a = Math.random() * Math.PI * 2;
        this.errYaw += Math.cos(a) * e;
        this.errPitch += Math.sin(a) * e * 0.5;
      }
    }
  }

  // Rotates the view toward a yaw/pitch; returns the remaining error (deg).
  turnToward(yaw, pitch, rate, dt) {
    const b = this.b;
    const maxStep = rate * DEG * dt;
    const dy = wrapAngle(yaw - b.yaw), dp = pitch - b.pitch;
    const ease = Math.min(1, dt * 14);
    b.yaw = wrapAngle(b.yaw + Math.max(-maxStep, Math.min(maxStep, dy * ease)));
    b.pitch += Math.max(-maxStep, Math.min(maxStep, dp * ease));
    b.pitch = Math.max(-1.4, Math.min(1.4, b.pitch));
    return Math.hypot(wrapAngle(yaw - b.yaw), pitch - b.pitch) / DEG;
  }

  // -------------------------------------------------------- moving around

  moveTo(x, z, dt, speedScale = 1) {
    const b = this.b;
    this.repathT -= dt;
    if (!this.path || !this.pathGoal || this.repathT <= 0 ||
        Math.hypot(this.pathGoal.x - x, this.pathGoal.z - z) > 1.5) {
      this.path = World.findPath(b.pos.x, b.pos.z, x, z);
      this.pathI = 1;
      this.pathGoal = { x, z };
      this.repathT = 3;
    }
    if (!this.path) return true;
    while (this.pathI < this.path.length) {
      const n = this.path[this.pathI];
      if (Math.hypot(n.x - b.pos.x, n.z - b.pos.z) < 0.45) this.pathI++;
      else break;
    }
    if (this.pathI >= this.path.length) return true;
    const n = this.path[this.pathI];
    const dx = n.x - b.pos.x, dz = n.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
    this.wish.x = dx / l;
    this.wish.z = dz / l;
    const gunSpeed = b.gun().w.speed;
    this.wish.speed = (this.walk ? MOVE.walk : MOVE.run * gunSpeed) * speedScale;

    // Unstick: if we're barely moving, re-plan
    if (b.pos.distanceTo(this.lastPos) < 0.02 * 60 * dt) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.lastPos.copy(b.pos);
    if (this.stuckT > 1.2) {
      this.stuckT = 0;
      this.path = null;
      this.wish.jump = true;
    }
    return false;
  }

  lookAlongPath(dt) {
    const b = this.b;
    let yaw = b.yaw;
    if (this.known && this.knownAge < 6) {
      yaw = Math.atan2(-(this.known.x - b.pos.x), -(this.known.z - b.pos.z));
    } else if (this.wish.speed > 0) {
      yaw = Math.atan2(-this.wish.x, -this.wish.z);
    }
    this.turnToward(yaw, 0, this.D.turn * 0.6, dt);
  }

  doHold(dt) {
    const b = this.b, h = this.hold;
    const arrived = Math.hypot(h.x - b.pos.x, h.z - b.pos.z) < 0.6 || this.moveTo(h.x, h.z, dt);
    if (!arrived) {
      b.wantCrouch = false;
      this.lookAlongPath(dt);
      return;
    }
    this.wish.speed = 0;
    b.wantCrouch = !!h.crouch;
    const base = Math.atan2(-h.look[0], -h.look[1]);
    this.turnToward(base + Math.sin(this.g.time * 0.7) * 0.25, 0, this.D.turn * 0.4, dt);
    this.holdT -= dt;
    if (this.holdT <= 0) {
      this.state = 'push';
      this.stage = 0;
      this.walk = false;
      b.wantCrouch = false;
    }
  }

  doPush(dt) {
    const route = BOT_PUSHES[this.lane];
    const goal = route[this.stage];
    if (this.moveTo(goal.x, goal.z, dt)) {
      this.stage++;
      this.path = null;
      // Maybe sneak (silent walk) once past the halfway point
      if (this.stage === 1) this.walk = Math.random() < this.D.walkChance;
      if (this.stage >= route.length) this.state = 'hunt';
    }
    this.lookAlongPath(dt);
  }

  doSearch(dt) {
    const b = this.b;
    if (!this.known) { this.state = 'hunt'; return; }
    if (this.flashPlan) {
      this.flashPlan.t -= dt;
      if (this.flashPlan.t <= 0) {
        this.throwFlashToward(this.known);
        this.flashPlan = null;
        this.searchWait = Math.min(this.searchWait, 0.25);
        this.walk = false;
      }
    }
    if (this.searchWait > 0) {
      this.searchWait -= dt;
      const dx = this.known.x - b.pos.x, dz = this.known.z - b.pos.z;
      this.turnToward(Math.atan2(-dx, -dz), 0, this.D.turn * 0.7, dt);
      return;
    }
    if (this.moveTo(this.known.x, this.known.z, dt)) {
      this.known = null;
      this.state = 'hunt';
      this.path = null;
    }
    this.lookAlongPath(dt);
  }

  doHunt(dt) {
    if (!this.huntGoal || this.moveTo(this.huntGoal.x, this.huntGoal.z, dt)) {
      this.huntGoal = World.randomPoint(-31, 4, -19, 19);
      this.path = null;
      this.walk = Math.random() < this.D.walkChance;
    }
    this.lookAlongPath(dt);
  }

  // Pick a spot along the route to the target that we can see, a bit past
  // the corner, and lob the flash so it pops there.
  throwFlashToward(target) {
    const b = this.b;
    const path = World.findPath(b.pos.x, b.pos.z, target.x, target.z);
    if (!path || path.length < 2) return;
    const ey = b.eyeY;
    let pop = null;
    for (let i = 1; i < path.length; i++) {
      const n = path[i];
      if (Math.hypot(n.x - b.pos.x, n.z - b.pos.z) > 16) break;
      if (!World.lineOfSight(b.pos.x, ey, b.pos.z, n.x, 1.8, n.z, true)) break;
      const next = path[i + 1] || target;
      const dx = next.x - n.x, dz = next.z - n.z, l = Math.hypot(dx, dz) || 1;
      pop = { x: n.x + dx / l * Math.min(2, l), y: 2, z: n.z + dz / l * Math.min(2, l) };
    }
    if (!pop) return;
    this.g.throwFlash(b, pop);
  }
}
