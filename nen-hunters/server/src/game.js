'use strict';
// Mundo autoritativo: o servidor decide movimento, dano, drops e spins.
const crypto = require('crypto');
const { WORLD, zoneAt, CATS, CAT_IDS, SPIN_ODDS, SPIN_PRICE, VOWS, MOBS, GEAR, gearPrice } = require('./data');

const TICK = 20, DT = 1 / TICK, VIEW = 900, LEVEL_CAP = 50;
const HATSU_COST = 35, HATSU_CD = 6, ATK_CD = 0.5;
let nextId = 1;
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

class Game {
  constructor(store) {
    this.store = store;
    this.players = new Map();
    this.mobs = [];
    this.projs = [];
    this.events = [];
    for (const [type, def] of Object.entries(MOBS)) {
      for (let i = 0; i < def.count; i++) this.mobs.push(this.newMob(type));
    }
  }

  // ---------- fábricas ----------
  newMob(type) {
    const def = MOBS[type];
    const a = rnd(0, Math.PI * 2), d = rnd(def.ring[0], def.ring[1]);
    const x = clamp(WORLD.cx + Math.cos(a) * d, 40, WORLD.w - 40);
    const y = clamp(WORLD.cy + Math.sin(a) * d, 40, WORLD.h - 40);
    return { id: nextId++, type, x, y, hx: x, hy: y, hp: def.hp, maxHp: def.hp, atkCd: 0, target: null, stun: 0, dead: false, respawnAt: 0 };
  }

  addPlayer(ws, token, name) {
    const saved = this.store.get(token);
    const a = rnd(0, Math.PI * 2), d = rnd(40, 200);
    const p = {
      id: nextId++, ws, token, name,
      x: WORLD.cx + Math.cos(a) * d, y: WORLD.cy + Math.sin(a) * d,
      ix: 0, iy: 0, fx: 1, fy: 0, aim: null,
      lvl: 1, xp: 0, cat: null, jenny: 0, spins: 1, buys: 0, vow: 'nenhum', history: [],
      nen: 'ten', aura: 60, atkCd: 0, hatsuCd: 0, shield: 0, shieldUntil: 0, buffUntil: 0, buffPower: 1,
      dead: false, respawnAt: 0, lastChat: 0,
      wp: 0, ar: 0, quest: null, lastHurt: 0, homeCd: 0,
    };
    if (saved) {
      p.lvl = clamp(saved.lvl | 0 || 1, 1, LEVEL_CAP); p.xp = num(saved.xp);
      p.cat = CATS[saved.cat] ? saved.cat : null; p.jenny = Math.max(0, num(saved.jenny) | 0);
      p.spins = Math.max(0, num(saved.spins) | 0); p.buys = Math.max(0, num(saved.buys) | 0);
      p.vow = VOWS[saved.vow] ? saved.vow : 'nenhum'; p.history = Array.isArray(saved.history) ? saved.history.slice(0, 10) : [];
      p.wp = clamp(saved.wp | 0, 0, GEAR.wp.max); p.ar = clamp(saved.ar | 0, 0, GEAR.ar.max);
      const q = saved.quest;
      if (q && MOBS[q.ty] && q.need > 0) p.quest = { ty: q.ty, need: q.need | 0, have: clamp(q.have | 0, 0, q.need | 0), rj: q.rj | 0, rx: q.rx | 0 };
    }
    if (!p.quest) p.quest = this.newQuest(p);
    p.hp = this.maxHp(p); p.aura = this.maxAura(p);
    this.players.set(p.id, p);
    return p;
  }

  removePlayer(p) { this.save(p); this.players.delete(p.id); }

  save(p) {
    this.store.set(p.token, { name: p.name, lvl: p.lvl, xp: Math.round(p.xp), cat: p.cat, jenny: p.jenny, spins: p.spins, buys: p.buys, vow: p.vow, history: p.history, wp: p.wp, ar: p.ar, quest: p.quest });
  }
  saveAll() { for (const p of this.players.values()) this.save(p); return this.store.flush(); }

  // ---------- fórmulas ----------
  maxHp(p) { return Math.round((100 + (p.lvl - 1) * 15) * (p.cat ? CATS[p.cat].hp : 1)); }
  maxAura(p) { return 60 + (p.lvl - 1) * 5; }
  xpNeed(l) { return Math.round(40 * Math.pow(l, 1.55)); }
  spinPrice(p) { return Math.min(SPIN_PRICE.max, Math.round(SPIN_PRICE.base * Math.pow(SPIN_PRICE.mult, p.buys))); }
  dmgOf(p, t) {
    const c = p.cat ? CATS[p.cat].dano : 1;
    const ren = p.nen === 'ren' ? 1.4 : 1;
    const buff = t > p.buffUntil ? 1 : p.buffPower;
    return (8 + p.lvl * 2.2) * c * ren * buff * (1 + 0.15 * p.wp);
  }
  speedOf(p, t) {
    const c = p.cat ? CATS[p.cat].vel : 1;
    return 180 * c * (t < p.buffUntil ? 1.4 : 1) * (p.nen === 'zetsu' ? 0.85 : 1);
  }

  // ---------- comunicação ----------
  send(p, obj) { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }
  toast(p, msg) { this.send(p, { t: 'toast', msg }); }
  fx(x, y, r, c) { this.events.push({ k: 'fx', x: Math.round(x), y: Math.round(y), r, c }); }
  dmgText(x, y, v, c) { this.events.push({ k: 'd', x: Math.round(x), y: Math.round(y), v: Math.round(v), c: c || '#fff' }); }

  // ---------- mensagens do cliente ----------
  handle(p, m) {
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'input': {
        let dx = num(m.dx), dy = num(m.dy); const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        p.ix = dx; p.iy = dy; break;
      }
      case 'attack': this.setAim(p, m); this.basicAttack(p); break;
      case 'hatsu': this.setAim(p, m); this.hatsu(p); break;
      case 'nen':
        if (['ten', 'zetsu', 'ren'].includes(m.mode) && !p.dead) {
          if (m.mode === 'ren' && p.aura < 10) return this.toast(p, 'Aura insuficiente para o Ren.');
          p.nen = m.mode;
        }
        break;
      case 'vow':
        if (VOWS[m.id]) { p.vow = m.id; this.toast(p, 'Juramento: ' + VOWS[m.id].nome); }
        break;
      case 'spin': this.spin(p); break;
      case 'buySpin': this.buySpin(p); break;
      case 'buyGear': this.buyGear(p, m.slot); break;
      case 'home': this.home(p); break;
      case 'chat': this.chat(p, m.text); break;
    }
  }
  setAim(p, m) {
    const ax = num(m.ax), ay = num(m.ay), l = Math.hypot(ax, ay);
    p.aim = l > 0.01 ? { x: ax / l, y: ay / l } : null;
  }
  chat(p, text) {
    const t = Date.now();
    if (typeof text !== 'string' || t - p.lastChat < 800) return;
    text = text.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
    if (!text) return;
    p.lastChat = t;
    const msg = { t: 'chat', n: p.name, text };
    for (const q of this.players.values()) this.send(q, msg);
  }

  // ---------- spin e economia ----------
  spin(p) {
    if (p.spins <= 0) return this.toast(p, 'Você não tem spins. Compre um com Jenny.');
    p.spins--;
    let roll = crypto.randomInt(0, 10000) / 100, acc = 0, cat = SPIN_ODDS[0][0];
    for (const [id, pct] of SPIN_ODDS) { acc += pct; if (roll < acc) { cat = id; break; } }
    p.cat = cat;
    p.history.unshift(cat); p.history.length = Math.min(p.history.length, 10);
    p.hp = this.maxHp(p);
    this.send(p, { t: 'spinResult', cat });
    if (cat === 'especializacao') {
      const msg = { t: 'chat', n: 'Sistema', text: p.name + ' tirou Especialização!' };
      for (const q of this.players.values()) this.send(q, msg);
    }
    this.save(p);
  }
  buySpin(p) {
    const price = this.spinPrice(p);
    if (p.jenny < price) return this.toast(p, 'Jenny insuficiente (' + price + ').');
    p.jenny -= price; p.spins++; p.buys++;
    this.toast(p, 'Spin comprado!');
    this.save(p);
  }

  buyGear(p, slot) {
    if (!GEAR[slot]) return;
    if (p.dead || !zoneAt(p.x, p.y).seguro) return this.toast(p, 'A loja fica na vila (centro do mapa).');
    const price = gearPrice(slot, p[slot]);
    if (!price) return this.toast(p, GEAR[slot].nome + ' já está no nível máximo.');
    if (p.jenny < price) return this.toast(p, 'Jenny insuficiente (' + price + ').');
    p.jenny -= price; p[slot]++;
    this.toast(p, GEAR[slot].names[p[slot]] + '!');
    this.save(p);
  }
  home(p) {
    const now = Date.now();
    if (p.dead) return;
    if (now - p.lastHurt < 5000) return this.toast(p, 'Você levou dano agora há pouco. Espere 5 segundos.');
    if (now < p.homeCd) return this.toast(p, 'Aguarde ' + Math.ceil((p.homeCd - now) / 1000) + 's para voltar à vila.');
    p.homeCd = now + 30000;
    p.x = WORLD.cx + rnd(-80, 80); p.y = WORLD.cy + rnd(-80, 80);
    this.fx(p.x, p.y, 70, '#ffffff');
  }
  newQuest(p) {
    const pool = Object.entries(MOBS).filter(([, d]) => p.lvl >= d.minLvl);
    const [ty, d] = pool[Math.floor(Math.random() * pool.length)];
    const avg = (d.jenny[0] + d.jenny[1]) / 2;
    return { ty, need: d.questNeed, have: 0, rj: Math.round(d.questNeed * avg * 1.5), rx: Math.round(d.questNeed * d.xp) };
  }

  // ---------- combate ----------
  basicAttack(p) {
    const t = Date.now() / 1000;
    if (p.dead || p.nen === 'zetsu' || t < p.atkCd) return;
    p.atkCd = t + ATK_CD;
    const dir = p.aim || { x: p.fx, y: p.fy };
    p.fx = dir.x; p.fy = dir.y;
    const dmg = this.dmgOf(p, Date.now());
    if (p.cat && CATS[p.cat].ranged) {
      this.projs.push({ id: nextId++, x: p.x, y: p.y, vx: dir.x * 520, vy: dir.y * 520, life: 0.75, dmg: dmg * 0.9, owner: p.id, c: CATS[p.cat].cor });
    } else {
      this.fx(p.x + dir.x * 40, p.y + dir.y * 40, 34, p.cat ? CATS[p.cat].cor : '#ffffff');
      for (const m of this.mobs) {
        if (m.dead) continue;
        const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
        if (d < 78 + MOBS[m.type].r && (d < 1 || (dx * dir.x + dy * dir.y) / d > 0.3)) this.hurtMob(m, dmg, p);
      }
    }
  }

  hatsu(p) {
    const now = Date.now(), t = now / 1000;
    if (p.dead) return;
    if (!p.cat) return this.toast(p, 'Gire sua categoria de Nen primeiro (menu Spin).');
    if (p.nen === 'zetsu') return this.toast(p, 'Não é possível usar Hatsu em Zetsu.');
    if (t < p.hatsuCd) return;
    const vow = VOWS[p.vow] || VOWS.nenhum;
    if (vow.req && p.nen !== vow.req) return this.toast(p, 'Juramento: ' + vow.nome + '.');
    if (p.aura < HATSU_COST) return this.toast(p, 'Aura insuficiente.');
    p.aura -= HATSU_COST;
    if (vow.hpCost) p.hp = Math.max(1, p.hp - this.maxHp(p) * vow.hpCost);
    p.hatsuCd = t + HATSU_CD * (vow.cdMult || 1);
    const pw = vow.mult, base = this.dmgOf(p, now), dir = p.aim || { x: p.fx, y: p.fy };
    const cor = CATS[p.cat].cor;
    const around = (rad, fn) => { for (const m of this.mobs) if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < rad + MOBS[m.type].r) fn(m); };
    switch (p.cat) {
      case 'intensificacao': this.fx(p.x, p.y, 120, cor); around(120, (m) => this.hurtMob(m, base * 3 * pw, p)); break;
      case 'emissao':
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(dir.y, dir.x) + i * 0.17;
          this.projs.push({ id: nextId++, x: p.x, y: p.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, life: 0.9, dmg: base * 1.3 * pw, owner: p.id, c: cor });
        }
        break;
      case 'transformacao': p.buffUntil = now + 5000; p.buffPower = 1 + 0.5 * pw; this.fx(p.x, p.y, 60, cor); break;
      case 'materializacao': p.shield = 40 * pw + p.lvl * 5; p.shieldUntil = now + 8000; this.fx(p.x, p.y, 50, cor); break;
      case 'manipulacao': this.fx(p.x, p.y, 260, cor); around(260, (m) => { m.stun = 2.5 * pw; this.hurtMob(m, base * 0.6, p); }); break;
      case 'especializacao': {
        this.fx(p.x, p.y, 170, cor);
        around(170, (m) => this.hurtMob(m, base * 2.5 * pw, p));
        p.hp = Math.min(this.maxHp(p), p.hp + this.maxHp(p) * 0.2);
        break;
      }
    }
  }

  hurtMob(m, dmg, p) {
    if (m.dead) return;
    m.hp -= dmg; m.target = p.id;
    this.dmgText(m.x, m.y - 20, dmg, '#ffe08a');
    if (m.hp > 0) return;
    const def = MOBS[m.type];
    m.dead = true; m.respawnAt = Date.now() + (def.respawn || 10000); m.target = null;
    const jenny = rint(def.jenny[0], def.jenny[1]);
    p.jenny += jenny;
    this.addXp(p, def.xp);
    this.dmgText(m.x, m.y - 40, jenny, '#f2c14e');
    const q = p.quest;
    if (q && q.ty === m.type && ++q.have >= q.need) {
      p.jenny += q.rj; this.addXp(p, q.rx);
      this.toast(p, 'Caçada concluída! +' + q.rj + ' J');
      p.quest = this.newQuest(p); this.save(p);
    }
    if (def.boss) {
      const msg = { t: 'chat', n: 'Sistema', text: p.name + ' derrotou ' + def.nome + '!' };
      for (const o of this.players.values()) this.send(o, msg);
    }
  }
  addXp(p, v) {
    if (p.lvl >= LEVEL_CAP) return;
    p.xp += v;
    while (p.lvl < LEVEL_CAP && p.xp >= this.xpNeed(p.lvl)) {
      p.xp -= this.xpNeed(p.lvl); p.lvl++;
      p.hp = this.maxHp(p); p.aura = this.maxAura(p);
      this.toast(p, 'Nível ' + p.lvl + '!');
    }
  }
  hurtPlayer(p, dmg) {
    if (p.dead) return;
    dmg *= (p.nen === 'ren' ? 1.25 : p.nen === 'ten' ? 0.9 : 1) * (1 - 0.06 * p.ar);
    p.lastHurt = Date.now();
    if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; }
    if (dmg <= 0) return;
    p.hp -= dmg;
    this.dmgText(p.x, p.y - 24, dmg, '#ff8a8a');
    if (p.hp <= 0) {
      p.dead = true; p.hp = 0; p.respawnAt = Date.now() + 4000; p.nen = 'ten';
      p.jenny -= Math.floor(p.jenny * 0.05);
    }
  }

  // ---------- simulação ----------
  tick() {
    const now = Date.now();
    for (const p of this.players.values()) this.updatePlayer(p, now);
    for (const m of this.mobs) this.updateMob(m, now);
    this.updateProjs(now);
    for (const p of this.players.values()) this.snapshot(p);
    this.events.length = 0;
  }

  updatePlayer(p, now) {
    if (p.dead) {
      if (now >= p.respawnAt) { p.dead = false; p.hp = this.maxHp(p); p.aura = this.maxAura(p); p.x = WORLD.cx + rnd(-60, 60); p.y = WORLD.cy + rnd(-60, 60); }
      return;
    }
    const sp = this.speedOf(p, now);
    p.x = clamp(p.x + p.ix * sp * DT, 20, WORLD.w - 20);
    p.y = clamp(p.y + p.iy * sp * DT, 20, WORLD.h - 20);
    if (p.ix || p.iy) { const l = Math.hypot(p.ix, p.iy); p.fx = p.ix / l; p.fy = p.iy / l; }
    const ma = this.maxAura(p), mh = this.maxHp(p), safe = zoneAt(p.x, p.y).seguro;
    if (p.nen === 'ren') { p.aura -= 6 * DT; if (p.aura <= 0) { p.aura = 0; p.nen = 'ten'; } }
    else p.aura = Math.min(ma, p.aura + (p.nen === 'zetsu' ? 10 : 4) * DT);
    p.hp = Math.min(mh, p.hp + (safe ? 8 : 0.5) * DT);
    if (p.shield > 0 && now > p.shieldUntil) p.shield = 0;
  }

  updateMob(m, now) {
    const def = MOBS[m.type];
    if (m.dead) {
      if (now >= m.respawnAt) { m.dead = false; m.x = m.hx; m.y = m.hy; m.hp = m.maxHp; m.stun = 0; }
      return;
    }
    if (m.stun > 0) { m.stun -= DT; return; }
    m.atkCd -= DT;
    let tgt = m.target ? this.players.get(m.target) : null;
    const ok = (q) => q && !q.dead && !zoneAt(q.x, q.y).seguro && Math.hypot(q.x - m.hx, q.y - m.hy) < 520;
    if (!ok(tgt)) {
      tgt = null; m.target = null;
      let best = 1e9;
      for (const q of this.players.values()) {
        if (!ok(q)) continue;
        const rng = def.aggro * (q.nen === 'zetsu' ? 0.3 : 1), d = Math.hypot(q.x - m.x, q.y - m.y);
        if (d < rng && d < best) { best = d; tgt = q; }
      }
      if (tgt) m.target = tgt.id;
    }
    let tx = m.hx, ty = m.hy, chase = false;
    if (tgt) { tx = tgt.x; ty = tgt.y; chase = true; }
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
    if (chase && d < def.r + 22) {
      if (m.atkCd <= 0) { m.atkCd = 1.1; this.hurtPlayer(tgt, def.dano); }
    } else if (d > 6) {
      const sp = def.vel * (chase ? 1 : 0.8) * DT;
      m.x += (dx / d) * Math.min(sp, d); m.y += (dy / d) * Math.min(sp, d);
    }
    if (!chase && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + 5 * DT);
  }

  updateProjs() {
    const keep = [];
    for (const j of this.projs) {
      j.x += j.vx * DT; j.y += j.vy * DT; j.life -= DT;
      let hit = false;
      if (j.life > 0) {
        for (const m of this.mobs) {
          if (m.dead) continue;
          if (Math.hypot(m.x - j.x, m.y - j.y) < MOBS[m.type].r + 10) {
            const o = this.players.get(j.owner);
            if (o) this.hurtMob(m, j.dmg, o);
            hit = true; break;
          }
        }
      }
      if (!hit && j.life > 0) keep.push(j);
    }
    this.projs = keep;
  }

  snapshot(p) {
    const R2 = VIEW * VIEW;
    const near = (o) => { const dx = o.x - p.x, dy = o.y - p.y; return dx * dx + dy * dy < R2; };
    const pl = [];
    for (const q of this.players.values()) {
      if (q === p || !near(q)) continue;
      if (q.nen === 'zetsu' && Math.hypot(q.x - p.x, q.y - p.y) > 150) continue;
      pl.push({ id: q.id, n: q.name, x: r1(q.x), y: r1(q.y), c: q.cat, hp: Math.round(q.hp), mh: this.maxHp(q), l: q.lvl, nen: q.nen, d: q.dead ? 1 : 0, sh: q.shield > 0 ? 1 : 0 });
    }
    const mb = [];
    for (const m of this.mobs) if (!m.dead && near(m)) mb.push({ id: m.id, ty: m.type, x: r1(m.x), y: r1(m.y), hp: Math.round(m.hp), mh: m.maxHp, st: m.stun > 0 ? 1 : 0 });
    const pj = [];
    for (const j of this.projs) if (near(j)) pj.push({ x: Math.round(j.x), y: Math.round(j.y), c: j.c });
    const ev = this.events.filter(near);
    const t = Date.now() / 1000, z = zoneAt(p.x, p.y);
    this.send(p, {
      t: 's',
      me: {
        x: r1(p.x), y: r1(p.y), hp: Math.round(p.hp), mh: this.maxHp(p), au: Math.round(p.aura), ma: this.maxAura(p),
        lvl: p.lvl, xp: Math.round(p.xp), xn: this.xpNeed(p.lvl), cat: p.cat, jenny: p.jenny, spins: p.spins, price: this.spinPrice(p),
        vow: p.vow, nen: p.nen, dead: p.dead ? 1 : 0, sh: Math.round(p.shield), hcd: Math.max(0, r1(p.hatsuCd - t)), zone: z.nome, safe: z.seguro ? 1 : 0, hist: p.history,
        sp: Math.round(this.speedOf(p, Date.now())), wp: p.wp, ar: p.ar, gp: [gearPrice('wp', p.wp), gearPrice('ar', p.ar)], q: p.quest ? { ty: p.quest.ty, need: p.quest.need, have: p.quest.have, rj: p.quest.rj } : null, hm: Math.max(0, Math.ceil((p.homeCd - Date.now()) / 1000)),
      },
      p: pl, m: mb, j: pj, e: ev,
    });
  }
}

module.exports = { Game, TICK };
