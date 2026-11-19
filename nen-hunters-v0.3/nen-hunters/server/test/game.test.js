'use strict';
// Testa regras do jogo direto na lógica (sem rede): loja, missões, chefe, armadura e spin.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'nen-game-' + Date.now());
const { Game } = require('../src/game');
const { Store } = require('../src/store');
const { MOBS, gearPrice } = require('../src/data');
const fail = (m) => { console.error('FALHOU:', m); process.exit(1); };
const ok = (m) => console.log('ok -', m);
const sent = [];
const ws = { readyState: 1, send: (d) => sent.push(JSON.parse(d)) };
const g = new Game(new Store());
const p = g.addPlayer(ws, 'token-de-teste-1234567890', 'T');

// loja
p.jenny = gearPrice('wp', 0);
g.handle(p, { t: 'buyGear', slot: 'wp' });
if (p.wp !== 1 || p.jenny !== 0) fail('compra de arma'); ok('compra de arma na vila');
const d0 = g.dmgOf(p, Date.now());
p.wp = 0; const d1 = g.dmgOf(p, Date.now());
if (!(d0 > d1 * 1.14 && d0 < d1 * 1.16)) fail('bônus de arma 15%'); ok('arma dá +15% de dano');
p.x = 100; p.y = 100; p.jenny = 99999;
g.handle(p, { t: 'buyGear', slot: 'ar' });
if (p.ar !== 0) fail('loja não deveria funcionar fora da vila'); ok('loja só funciona na vila');
p.x = 1600; p.y = 1600;
for (let i = 0; i < 8; i++) g.handle(p, { t: 'buyGear', slot: 'ar' });
if (p.ar !== 6) fail('armadura deveria parar no nível 6'); ok('armadura respeita nível máximo (6)');

// armadura reduz dano
p.nen = 'zetsu'; p.hp = 100; p.shield = 0;
g.hurtPlayer(p, 100);
if (Math.round(100 - p.hp) !== 64) fail('armadura nv6 deveria reduzir 36%: ' + (100 - p.hp)); ok('armadura nv6 reduz 36% do dano');

// missão: completa matando lobos
p.hp = 100; p.nen = 'ten'; p.quest = { ty: 'lobo', need: 2, have: 0, rj: 500, rx: 50 };
const j0 = p.jenny;
const lobos = g.mobs.filter((m) => m.type === 'lobo').slice(0, 2);
for (const m of lobos) g.hurtMob(m, 99999, p);
if (p.jenny < j0 + 500) fail('recompensa da missão'); if (p.quest.have !== 0) fail('nova missão não foi sorteada');
ok('missão concluída dá recompensa e sorteia outra');

// chefe: só aparece e dá missão em nível alto
const boss = g.mobs.find((m) => m.type === 'guardiao');
if (!boss || MOBS.guardiao.hp < 1000) fail('chefe não existe'); ok('chefe Guardião existe nas Ruínas');
g.hurtMob(boss, 999999, p);
if (!boss.dead || boss.respawnAt - Date.now() < 80000) fail('respawn do chefe deveria ser ~90s'); ok('chefe morre e renasce em ~90s');
if (!sent.some((m) => m.t === 'chat' && /derrotou/.test(m.text))) fail('anúncio do chefe'); ok('anúncio global ao derrotar o chefe');

// missões respeitam o nível
p.lvl = 1; for (let i = 0; i < 40; i++) if (g.newQuest(p).ty !== 'lobo') fail('nível 1 só pega lobos'); ok('nível 1 só recebe missões de lobo');
// salvar e recarregar mantém equipamento e missão
g.save(p); const g2 = new Game(g.store); const p2 = g2.addPlayer(ws, 'token-de-teste-1234567890', 'T');
if (p2.ar !== 6 || !p2.quest) fail('persistência de equipamento/missão'); ok('equipamento e missão persistem ao reconectar');
process.exit(0);
