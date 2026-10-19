'use strict';
const DEG = Math.PI / 180;

// Gameplay tuning. Weapon numbers are loosely based on Valorant's (prices,
// damage, fire rate, magazine sizes) so the guns feel familiar.

// falloff rows: [up to this range in metres, head, body, legs]
// spread values are in degrees.
const WEAPONS = {
  knife: {
    id: 'knife', name: 'Knife', type: 'melee', slot: 3, cost: 0,
    auto: true, rate: 1.6, damage: 50, range: 2.4, equip: 0.4, speed: 1.0, zoom: 1,
    model: 'knife', sound: 'knife',
  },
  classic: {
    id: 'classic', name: 'Classic', type: 'sidearm', slot: 2, cost: 0,
    auto: false, rate: 6.75, mag: 12, reserve: 36, reload: 1.75, equip: 0.75,
    falloff: [[30, 78, 26, 22], [999, 66, 22, 18]],
    spread: 0.4, moveSpread: 2.4, airSpread: 5, bloom: 0.55,
    recoil: { up: 0.7, max: 3, side: 0.25, sideStart: 2, recover: 14 },
    speed: 1.0, zoom: 1, model: 'classic', sound: 'classic', tint: 0x6d737c,
  },
  ghost: {
    id: 'ghost', name: 'Ghost', type: 'sidearm', slot: 2, cost: 500,
    auto: false, rate: 6.75, mag: 15, reserve: 45, reload: 1.5, equip: 0.75,
    falloff: [[30, 105, 30, 25], [999, 88, 25, 21]],
    spread: 0.3, moveSpread: 2.2, airSpread: 5, bloom: 0.45,
    recoil: { up: 0.6, max: 3, side: 0.2, sideStart: 3, recover: 14 },
    speed: 1.0, zoom: 1, model: 'ghost', sound: 'ghost', tint: 0x3a3f47,
  },
  sheriff: {
    id: 'sheriff', name: 'Sheriff', type: 'sidearm', slot: 2, cost: 800,
    auto: false, rate: 4, mag: 6, reserve: 24, reload: 2.25, equip: 1.0,
    falloff: [[30, 159, 55, 46], [999, 145, 50, 42]],
    spread: 0.25, moveSpread: 3.5, airSpread: 7, bloom: 1.2,
    recoil: { up: 2.6, max: 6, side: 0.4, sideStart: 1, recover: 9 },
    speed: 1.0, zoom: 1, model: 'sheriff', sound: 'sheriff', tint: 0x8a8f99,
  },
  spectre: {
    id: 'spectre', name: 'Spectre', type: 'smg', slot: 1, cost: 1600,
    auto: true, rate: 13.33, mag: 30, reserve: 90, reload: 2.25, equip: 0.75,
    falloff: [[20, 78, 26, 22], [999, 66, 22, 18]],
    spread: 0.4, moveSpread: 1.6, airSpread: 5, bloom: 0.12,
    recoil: { up: 0.35, max: 3.5, side: 0.35, sideStart: 6, recover: 12 },
    speed: 1.0, zoom: 1.15, model: 'spectre', sound: 'spectre', tint: 0x2f3540,
  },
  vandal: {
    id: 'vandal', name: 'Vandal', type: 'rifle', slot: 1, cost: 2900,
    auto: true, rate: 9.75, mag: 25, reserve: 50, reload: 2.5, equip: 1.0,
    falloff: [[999, 160, 40, 34]],
    spread: 0.25, moveSpread: 5.0, airSpread: 9, bloom: 0.18,
    recoil: { up: 0.75, max: 6.5, side: 0.6, sideStart: 5, recover: 10 },
    speed: 0.95, zoom: 1.25, model: 'vandal', sound: 'vandal', tint: 0x2b2a2c,
  },
  phantom: {
    id: 'phantom', name: 'Phantom', type: 'rifle', slot: 1, cost: 2900,
    auto: true, rate: 11, mag: 30, reserve: 60, reload: 2.5, equip: 1.0,
    falloff: [[15, 156, 39, 33], [30, 140, 35, 29], [999, 124, 31, 26]],
    spread: 0.2, moveSpread: 4.5, airSpread: 9, bloom: 0.15,
    recoil: { up: 0.65, max: 5.5, side: 0.5, sideStart: 6, recover: 11 },
    speed: 0.95, zoom: 1.25, model: 'phantom', sound: 'phantom', tint: 0x24282f,
  },
  operator: {
    id: 'operator', name: 'Operator', type: 'sniper', slot: 1, cost: 4700,
    auto: false, rate: 0.75, mag: 5, reserve: 10, reload: 3.7, equip: 1.5,
    falloff: [[999, 255, 150, 120]],
    spread: 4.5, scopedSpread: 0, moveSpread: 6, airSpread: 12, bloom: 0,
    recoil: { up: 3, max: 3, side: 0, sideStart: 99, recover: 6 },
    speed: 0.85, zoom: 2.5, model: 'operator', sound: 'operator', tint: 0x3b4a3c,
  },
};

const BUY_SECTIONS = [
  { title: 'Sidearms', items: ['classic', 'ghost', 'sheriff'] },
  { title: 'SMG', items: ['spectre'] },
  { title: 'Rifles', items: ['vandal', 'phantom'] },
  { title: 'Sniper', items: ['operator'] },
];

const SHIELDS = {
  light: { name: 'Light Shield', cost: 400, amount: 25 },
  heavy: { name: 'Heavy Shield', cost: 1000, amount: 50 },
};

const ABILITIES = {
  flash: { key: 'Q', name: 'Flash', cost: 250, max: 2, desc: 'Throw a flashbang that blinds anyone looking at it' },
  dash: { key: 'E', name: 'Dash', cost: 0, max: 1, desc: 'Free every round. Dash in the direction you are moving' },
  smoke: { key: 'C', name: 'Smoke', cost: 200, max: 1, desc: 'Drop a smoke where you aim. Blocks vision, not bullets' },
};

// reaction: seconds before first shot after spotting you
// aimErr: starting aim error in degrees, settle: how fast it shrinks
// turn: max flick speed (deg/s), hs: chance to aim for the head
const DIFFICULTIES = {
  iron: { name: 'Iron', reaction: 0.62, aimErr: 7, settle: 1.6, turn: 170, hs: 0.1, spreadMul: 1.6, burst: [5, 9], strafe: false, flash: 0, walkChance: 0.1, aggression: 0.45 },
  gold: { name: 'Gold', reaction: 0.42, aimErr: 4.5, settle: 2.6, turn: 260, hs: 0.22, spreadMul: 1.25, burst: [3, 6], strafe: true, flash: 0.25, walkChance: 0.3, aggression: 0.55 },
  diamond: { name: 'Diamond', reaction: 0.29, aimErr: 2.6, settle: 4, turn: 420, hs: 0.38, spreadMul: 1.0, burst: [2, 4], strafe: true, flash: 0.5, walkChance: 0.55, aggression: 0.6 },
  radiant: { name: 'Radiant', reaction: 0.2, aimErr: 1.4, settle: 6, turn: 650, hs: 0.55, spreadMul: 0.9, burst: [1, 3], strafe: true, flash: 0.7, walkChance: 0.75, aggression: 0.65 },
};

const ECON = { start: 800, win: 3000, loss: 1900, lossBonus: 500, lossMax: 2900, kill: 200, max: 9000 };
const RULES = { buyTime: 15, roundTime: 100, endTime: 4.5, barrierX: 22.5 };

// Distances in metres, speeds in metres per second.
const MOVE = {
  run: 6.75, walk: 3.0, crouch: 2.2,
  accel: 55, airAccel: 10, gravity: 22, jump: 7.0, stepUp: 0.5,
  radius: 0.35, stand: 1.8, crouchH: 1.35, eye: 1.62, crouchEye: 1.15,
};
