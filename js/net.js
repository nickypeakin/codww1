// How browsers in a crew talk to each other. The host's browser runs the
// world (ghost ships, the Kraken, skulls, gold) and friends connect straight
// to it over a WebRTC data channel. The free PeerJS service is only used to
// find the host by its 5-letter crew code.
(function () {
'use strict';

const PREFIX = 'sea-of-thieves-fan-';
const PROTOCOL = 1;              // bump whenever messages change: mismatched copies refuse to mix
const MAX_CREW = 4;
const SERVER_TIMEOUT = 12000;    // to reach the matchmaking server
const JOIN_TIMEOUT = 25000;      // from finding the crew to being in it
const SILENCE = 20000;           // pings flow every 2 s, so this means they're gone
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// STUN works on most home networks; the TURN relays carry the game when a
// network (often school Wi-Fi) won't allow a direct connection.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

const BLOCKED = "Found the crew, but couldn't open a connection to the host's computer. Some school and work networks block this. Try a different Wi-Fi network or a phone hotspot (it only needs to work on one side).";
const NO_SERVER = "The matchmaking server (0.peerjs.com) didn't answer. Your network may be blocking it, or it may be busy. Try again in a moment.";

// ?peer=host:port points at a self-hosted PeerJS server (used by tests)
function peerOptions() {
  const v = new URLSearchParams(location.search).get('peer');
  const opts = { debug: 1, config: { iceServers: ICE_SERVERS } };
  if (v) {
    const [host, port] = v.split(':');
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return opts;
}

// Browsers slow timers in background tabs, which would drop friends when
// someone switches tabs to send the invite link. Timers in a worker keep
// their pace.
function workerTicker(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch (e) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Pirate';

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t).add(fn);
  }
  emit(msg) { for (const fn of this.handlers.get(msg.t) || []) fn(msg); }
}

// ------------------------------------------------------------------ host --
class Host extends Emitter {
  constructor(name) {
    super();
    this.isHost = true;
    this.id = 'h';
    this.name = cleanName(name);
    this.guests = new Set();
    this.nextId = 2;
  }

  status(text) { this.emit({ t: 'status', text }); }

  // Resolves with the crew code once friends can find us.
  async open() {
    this.status('Contacting the matchmaking server...');
    if (!window.Peer) throw new Error('The multiplayer library is missing. Reload the page and try again.');
    for (let attempt = 0; attempt < 5 && !this.closed; attempt++) {
      const code = makeCode();
      try {
        await this.listen(code);
        this.code = code;
        this.stopPinger = workerTicker(() => this.heartbeat(), 2000);
        this.status('Your crew is open. Send your friends the invite link.');
        return code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        throw new Error(e && e.type === 'timeout' ? NO_SERVER : `Couldn't reach the matchmaking server (${(e && e.type) || 'error'}). Try again, or sail solo.`);
      }
    }
    throw new Error("Couldn't get a crew code. Try again in a moment.");
  }

  listen(code) {
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(PREFIX + code, peerOptions());
      let open = false;
      const timer = setTimeout(() => { if (!open) { peer.destroy(); reject({ type: 'timeout' }); } }, SERVER_TIMEOUT);
      peer.on('open', () => { open = true; clearTimeout(timer); this.peer = peer; resolve(); });
      peer.on('error', (e) => {
        if (!open) { clearTimeout(timer); peer.destroy(); reject(e); return; }
        console.warn('peer error', e.type);
      });
      // keep the code registered so more friends can still find us
      peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) peer.reconnect(); });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  usedColors() { const s = new Set([0]); for (const g of this.guests) if (g.id) s.add(g.color); return s; }

  accept(conn) {
    const g = { conn, id: null, color: 0, last: performance.now() };
    this.guests.add(g);
    this.status('Someone is connecting...');
    const drop = () => {
      if (!this.guests.has(g)) return;
      this.guests.delete(g);
      if (g.id) this.emit({ t: 'leave', id: g.id });
      else this.status("A friend found your crew but couldn't connect. One of your networks is blocking the connection; a phone hotspot on either side usually fixes it.");
      try { conn.close(); } catch (e) { /* already closed */ }
    };
    g.drop = drop;
    conn.on('data', (msg) => {
      g.last = performance.now();
      if (!msg || typeof msg !== 'object' || msg.t === 'ping') return;
      if (g.id == null) {
        if (msg.t !== 'hello') return;
        if (msg.v !== PROTOCOL) {
          conn.send({ t: 'refused', text: "Your copy of the game is a different version from the host's. Both of you: refresh the page (Ctrl+Shift+R) and try again." });
          setTimeout(drop, 1000);
          return;
        }
        const used = this.usedColors();
        const color = [1, 2, 3].find(c => !used.has(c));
        if (color === undefined) {
          conn.send({ t: 'refused', text: `This crew is full. A crew holds ${MAX_CREW} pirates.` });
          setTimeout(drop, 1000);
          return;
        }
        g.id = 'p' + this.nextId++;
        g.color = color;
        conn.send({ t: 'welcome', id: g.id, color });
        this.status('A friend joined the crew.');
        this.emit({ t: 'join', id: g.id, name: cleanName(msg.name), color });
        return;
      }
      msg.from = g.id;
      this.emit(msg);
    });
    conn.on('close', drop);
    conn.on('error', drop);
  }

  send(id, msg) {
    for (const g of this.guests) if (g.id === id && g.conn.open) g.conn.send(msg);
  }

  broadcast(msg, except) {
    for (const g of this.guests) if (g.id && g.id !== except && g.conn.open) g.conn.send(msg);
  }

  heartbeat() {
    const now = performance.now();
    for (const g of [...this.guests]) {
      if (now - g.last > (g.id ? SILENCE : JOIN_TIMEOUT)) g.drop();
      else if (g.conn.open) g.conn.send({ t: 'ping' });
    }
  }

  close() {
    this.closed = true;
    if (this.stopPinger) this.stopPinger();
    for (const g of this.guests) try { g.conn.close(); } catch (e) { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}

// ----------------------------------------------------------------- guest --
class Guest extends Emitter {
  constructor(name, code) {
    super();
    this.isHost = false;
    this.name = cleanName(name);
    this.code = cleanCode(code);
  }

  status(text) { this.emit({ t: 'status', text }); }

  // Resolves with { id, color } once we're in the host's crew. Each stage
  // reports progress and fails with a reason, so a blocked network doesn't
  // look like a hang.
  connect() {
    return new Promise((resolve, reject) => {
      let stage = 'server';
      let timer = null;
      const fail = (text) => {
        if (this.closed) return;
        clearTimeout(timer);
        this.close();
        reject(new Error(text));
      };
      const wait = (ms, text) => { clearTimeout(timer); timer = setTimeout(() => fail(text), ms); };
      if (!window.Peer) { fail('The multiplayer library is missing. Reload the page and try again.'); return; }
      this.status('Contacting the matchmaking server...');
      wait(SERVER_TIMEOUT, NO_SERVER);
      const peer = (this.peer = new window.Peer(peerOptions()));
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fail(`There's no crew with code ${this.code}. Check the code. The host needs to keep the game open.`);
        else if (stage !== 'in') fail(stage === 'server' ? `Couldn't reach the matchmaking server (${e.type}).` : `Couldn't connect to crew ${this.code} (${e.type}).`);
      });
      peer.on('open', () => {
        stage = 'host';
        this.status(`Found the matchmaking server. Looking for crew ${this.code}...`);
        wait(JOIN_TIMEOUT, BLOCKED);
        const conn = (this.conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' }));
        conn.on('iceStateChanged', (st) => {
          if (st === 'checking') this.status("Crew found. Opening a connection to the host's computer...");
          if (st === 'failed' && stage !== 'in') fail(BLOCKED);
        });
        conn.on('error', (e) => { if (stage !== 'in') fail(e && e.type === 'negotiation-failed' ? BLOCKED : `Couldn't connect to crew ${this.code} (${(e && e.type) || 'error'}).`); });
        conn.on('open', () => {
          stage = 'hello';
          this.status('Connected. Joining the crew...');
          this.last = performance.now();
          conn.send({ t: 'hello', name: this.name, v: PROTOCOL });
          this.stopPinger = workerTicker(() => {
            if (performance.now() - this.last > SILENCE) this.lost();
            else if (conn.open) conn.send({ t: 'ping' });
          }, 2000);
        });
        conn.on('data', (msg) => {
          this.last = performance.now();
          if (!msg || typeof msg !== 'object' || msg.t === 'ping') return;
          if (msg.t === 'welcome') { this.id = msg.id; stage = 'in'; clearTimeout(timer); resolve({ id: msg.id, color: msg.color }); return; }
          if (msg.t === 'refused') { fail(msg.text); return; }
          if (stage === 'in') this.emit(msg);
        });
        conn.on('close', () => { if (stage === 'in') this.lost(); else fail(`The host closed the connection to crew ${this.code}.`); });
      });
    });
  }

  lost() {
    if (this.closed) return;
    this.close();
    this.emit({ t: 'closed', text: 'Lost the connection to the host. They may have closed the game.' });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    if (this.stopPinger) this.stopPinger();
    try { if (this.conn) this.conn.close(); } catch (e) { /* gone */ }
    if (this.peer) this.peer.destroy();
  }
}

window.SeaNet = { Host, Guest, MAX_CREW, cleanCode, cleanName, workerTicker };
})();
