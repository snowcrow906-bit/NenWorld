'use strict';
// Testa a v0.3: itens, drops, Exame Hunter, chefe coletivo, ranking e nome do Hatsu.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'nen-v3-' + Date.now());
const { Game } = require('../src/game');
const { Store } = require('../src/store');
const { EXAM } = require('../src/data');
const fail = (m) => { console.error('FALHOU:', m); process.exit(1); };
const ok = (m) => console.log('ok -', m);
const sent = [];
const mk = () => ({ readyState: 1, send: (d) => sent.push(JSON.parse(d)) });
const g = new Game(new Store());
const p = g.addPlayer(mk(), 'token-v3-aaaaaaaaaaaaaaaa', 'Ana');
const kill = (type, who) => { const m = g.mobs.find((x) => x.type === type); m.dead = false; m.hp = m.maxHp; g.hurtMob(m, 1e9, who); };

// itens: comprar, usar, limites
p.x = 1600; p.y = 1600; p.jenny = 1000;
g.handle(p, { t: 'buyItem', id: 'pocao' });
if (p.inv.pocao !== 1 || p.jenny !== 940) fail('compra de poção'); ok('comprar poção na vila (60 J)');
p.hp = 10; g.handle(p, { t: 'use', id: 'pocao' });
if (p.inv.pocao !== 0 || p.hp < 10 + g.maxHp(p) * 0.39) fail('poção deveria curar 40%'); ok('poção cura 40% da vida e é consumida');
p.lastItem = 0; p.inv.cristal = 1; p.aura = 0; g.handle(p, { t: 'use', id: 'cristal' });
if (p.aura < g.maxAura(p) * 0.59 || p.inv.cristal !== 0) fail('cristal'); ok('cristal restaura 60% da aura');
p.lastItem = 0; p.inv.pocao = 1; p.hp = g.maxHp(p); g.handle(p, { t: 'use', id: 'pocao' });
if (p.inv.pocao !== 1) fail('não deveria gastar poção com vida cheia'); ok('poção não é gasta com a vida cheia');
p.x = 100; p.y = 100; p.jenny = 999; g.handle(p, { t: 'buyItem', id: 'pocao' });
if (p.inv.pocao !== 1) fail('loja fora da vila'); ok('itens só são vendidos na vila');
p.x = 1600; p.y = 1600; p.jenny = 5000; p.vow = 'nenhum';
for (const bad of ['__proto__', 'constructor', 'toString', 'invalido', 42, null]) {
  g.handle(p, { t: 'use', id: bad }); g.handle(p, { t: 'buyItem', id: bad }); g.handle(p, { t: 'buyGear', slot: bad }); g.handle(p, { t: 'vow', id: bad });
}
if (p.jenny !== 5000 || p.vow !== 'nenhum' || !Number.isFinite(p.inv.pocao)) fail('nomes inválidos corromperam o estado');
ok('nomes inválidos (__proto__, constructor...) não corrompem Jenny, itens nem juramento');

// drops (chefe sempre dropa)
p.inv = { pocao: 0, cristal: 0 }; kill('guardiao', p);
if (p.inv.pocao !== 3 || p.inv.cristal !== 3) fail('chefe deveria dropar 3+3'); ok('chefe dropa 3 poções e 3 cristais');

// Exame Hunter
p.lvl = 3; p.exam = { n: 1, have: 0 }; p.quest = { ty: 'urso', need: 99, have: 0, rj: 0, rx: 0 };
for (let i = 0; i < EXAM[0].need; i++) kill('lobo', p);
if (!p.exam || p.exam.n !== 2) fail('deveria ir para a prova 2'); ok('prova 1 concluída avança para a prova 2');
p.lvl = 1; p.exam = { n: 2, have: 0 };
for (let i = 0; i < 10; i++) kill('urso', p);
if (p.exam.have !== 0) fail('não deveria contar abaixo do nível mínimo'); ok('prova não conta abaixo do nível mínimo');

// chefe coletivo + licença
const q = g.addPlayer(mk(), 'token-v3-bbbbbbbbbbbbbbbb', 'Beto');
p.lvl = 25; q.lvl = 25; p.exam = { n: 4, have: 0 }; q.exam = { n: 4, have: 0 };
const boss = g.mobs.find((m) => m.type === 'guardiao'); boss.dead = false; boss.hp = boss.maxHp;
const spins0 = p.spins, qs0 = q.spins;
g.hurtMob(boss, 100, q); g.hurtMob(boss, 1e9, p);
if (!p.hunter || !q.hunter || p.exam || q.exam) fail('os dois deveriam virar Hunter'); ok('quem ajuda a derrotar o chefe também recebe a recompensa');
if (p.spins < spins0 + 2 || q.spins < qs0 + 2) fail('+2 spins da licença'); ok('Licença Hunter dá +2 spins');
if (!sent.some((m) => m.t === 'chat' && /Licença Hunter/.test(m.text))) fail('anúncio da licença'); ok('anúncio global da licença');

// ranking
sent.length = 0; p.lastRank = 0; g.handle(p, { t: 'rank' });
const r = sent.find((m) => m.t === 'rank');
if (!r || r.list.length !== 2 || !r.list[0].h) fail('ranking'); ok('ranking mostra jogadores online com estrela de Hunter');
sent.length = 0; g.handle(p, { t: 'rank' });
if (sent.some((m) => m.t === 'rank')) fail('ranking deveria ter limite de frequência'); ok('ranking tem limite de frequência');

// nome do Hatsu
g.handle(p, { t: 'hname', text: '  <b>Chamas</b> do Leste!!!  ' });
if (/[<>!]/.test(p.hname)) fail('caracteres especiais deveriam sair'); ok('nome do Hatsu é filtrado: "' + p.hname + '"');

// persistência
g.save(p); const g2 = new Game(g.store); const p2 = g2.addPlayer(mk(), 'token-v3-aaaaaaaaaaaaaaaa', 'Ana');
if (!p2.hunter || p2.exam !== null || p2.inv.pocao !== p.inv.pocao || p2.hname !== p.hname) fail('persistência'); ok('licença, itens e nome do Hatsu persistem');
process.exit(0);
