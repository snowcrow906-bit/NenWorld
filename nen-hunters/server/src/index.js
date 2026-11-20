'use strict';
// Servidor HTTP + WebSocket. Também serve o cliente (../client) para facilitar o deploy em um único serviço.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game, TICK } = require('./game');
const { Store } = require('./store');
const { WORLD, ZONES, CATS, SPIN_ODDS, VOWS, MOBS, GEAR, ITEMS, EXAM } = require('./data');

const PORT = process.env.PORT || 3000;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const CLIENT_DIR = path.join(__dirname, '..', '..', 'client');
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 100);

const store = new Store();
const game = new Game(store);

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  const url = String(req.url || '/').split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.startsWith('/assets/')) { // arquivos de arte/áudio em client/assets (só o nome do arquivo, sem subpastas)
    let name = '';
    try { name = path.basename(decodeURIComponent(url)); } catch (_) {}
    const type = MIME[path.extname(name).toLowerCase()];
    if (!type || name.startsWith('.')) { res.writeHead(404); return res.end(); }
    return fs.readFile(path.join(CLIENT_DIR, 'assets', name), (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
  }
  fs.readFile(path.join(CLIENT_DIR, 'index.html'), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Cliente não encontrado'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({
  server,
  maxPayload: 2048,
  verifyClient: (info) => !ORIGINS.length || !info.origin || ORIGINS.includes(info.origin),
});

const byToken = new Map();

wss.on('connection', (ws) => {
  let p = null, joining = false;
  let tokens = 80; // limite de mensagens: balde de 80, recarrega 40/s
  const refill = setInterval(() => { tokens = Math.min(80, tokens + 40); }, 1000);

  async function join(m) {
    const token = typeof m.token === 'string' ? m.token : '';
    if (token.length < 16 || token.length > 64) return ws.close(4000, 'token inválido');
    if (game.players.size >= MAX_PLAYERS) return ws.close(4001, 'servidor cheio');
    await store.ensure(token);
    if (ws.readyState !== 1) return;
    const old = byToken.get(token);
    if (old) { try { old.ws.close(4002, 'login em outro lugar'); } catch (_) {} game.removePlayer(old); }
    const name = String(m.name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14) || 'Caçador';
    p = game.addPlayer(ws, token, name);
    byToken.set(token, p);
    game.send(p, {
      t: 'welcome', id: p.id, world: WORLD, zones: ZONES,
      cats: CATS, odds: SPIN_ODDS, vows: VOWS, mobs: MOBS, gear: GEAR, items: ITEMS, exam: EXAM,
    });
  }

  ws.on('message', (raw) => {
    if (--tokens < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!p) {
      if (m.t !== 'join' || joining) return;
      joining = true;
      join(m).catch((e) => { console.error('join falhou:', e.message); try { ws.close(4003, 'Banco de dados indisponível. Tente de novo em instantes.'); } catch (_) {} });
      return;
    }
    game.handle(p, m);
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (p && game.players.has(p.id)) { game.removePlayer(p); if (byToken.get(p.token) === p) byToken.delete(p.token); }
  });
  ws.on('error', () => {});
});

setInterval(() => game.tick(), 1000 / TICK);
setInterval(() => { game.saveAll().catch(() => {}); }, 20000);
async function bye() { try { await game.saveAll(); } catch (_) {} process.exit(0); }
process.on('SIGINT', bye);
process.on('SIGTERM', bye);

server.listen(PORT, () => console.log('Nen Hunters rodando em http://localhost:' + PORT + ' (save: ' + store.mode + ')'));
