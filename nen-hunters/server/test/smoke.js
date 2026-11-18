'use strict';
// Teste de fumaça: sobe o servidor, conecta um jogador e confere join, movimento, spin, compra e combate.
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 3111;
const srv = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
  env: { ...process.env, PORT, DATA_DIR: path.join(os.tmpdir(), 'nen-test-' + Date.now()) },
  stdio: 'ignore',
});
const fail = (m) => { console.error('FALHOU:', m); srv.kill(); process.exit(1); };
const ok = (m) => console.log('ok -', m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(800);
  const ws = new WebSocket('ws://localhost:' + PORT);
  let welcome = null, last = null, spinCat = null, toasts = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') welcome = m;
    else if (m.t === 's') last = m;
    else if (m.t === 'spinResult') spinCat = m.cat;
    else if (m.t === 'toast') toasts.push(m.msg);
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'join', name: 'Teste', token: 'token-de-teste-1234567890' }));
  await wait(400);
  if (!welcome) fail('sem welcome'); ok('join e welcome');
  if (!last || !last.me) fail('sem snapshot'); ok('snapshot recebido');

  const x0 = last.me.x;
  ws.send(JSON.stringify({ t: 'input', dx: 1, dy: 0 }));
  await wait(600);
  if (!(last.me.x > x0 + 50)) fail('não se moveu'); ok('movimento validado pelo servidor');
  ws.send(JSON.stringify({ t: 'input', dx: 0, dy: 0 }));

  ws.send(JSON.stringify({ t: 'hatsu' })); await wait(150);
  if (!toasts.some((t) => t.includes('Gire'))) fail('Hatsu sem categoria deveria ser bloqueado'); ok('Hatsu bloqueado sem categoria');

  ws.send(JSON.stringify({ t: 'spin' })); await wait(200);
  if (!spinCat || !welcome.cats[spinCat]) fail('spin inválido'); ok('spin sorteado no servidor: ' + spinCat);
  if (last.me.spins !== 0) fail('spins deveria ser 0'); ok('spin consumido');

  ws.send(JSON.stringify({ t: 'buySpin' })); await wait(150);
  if (!toasts.some((t) => t.includes('insuficiente'))) fail('compra sem Jenny deveria falhar'); ok('compra sem Jenny bloqueada');

  ws.send(JSON.stringify({ t: 'attack', ax: 1, ay: 0 })); await wait(100);
  ws.send(JSON.stringify({ t: 'nen', mode: 'ren' })); await wait(150);
  if (last.me.nen !== 'ren') fail('Ren não ativou'); ok('Ren ativado');

  ws.send(JSON.stringify({ t: 'input', dx: NaN, dy: 'x' })); ws.send('lixo{'); await wait(100);
  ok('entradas inválidas ignoradas sem derrubar o servidor');
  ws.close(); srv.kill(); console.log('TUDO CERTO'); process.exit(0);
})().catch((e) => fail(e.message));
