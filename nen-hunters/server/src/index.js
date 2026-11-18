'use strict';
// Servidor HTTP + WebSocket. Também serve o cliente (../client) para facilitar o deploy em um único serviço.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game, TICK } = require('./game');
const { Store } = require('./store');
const { WORLD, ZONES, CATS, SPIN_ODDS, VOWS, MOBS } = require('./data');

const PORT = process.env.PORT || 3000;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const CLIENT_DIR = path.join(__dirname, '..', '..', 'client');
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 100);

const store = new Store();
const game = new Game(store);

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  const file = path.join(CLIENT_DIR, 'index.html');
  fs.readFile(file, (err, data) => {
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
  let p = null;
  let tokens = 80; // limite de mensagens: balde de 80, recarrega 40/s
  const refill = setInterval(() => { tokens = Math.min(80, tokens + 40); }, 1000);

  ws.on('message', (raw) => {
    if (--tokens < 0) return;
    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!p) {
      if (m.t !== 'join') return;
      const token = typeof m.token === 'string' ? m.token : '';
      if (token.length < 16 || token.length > 64) return ws.close(4000, 'token inválido');
      if (game.players.size >= MAX_PLAYERS) return ws.close(4001, 'servidor cheio');
      const old = byToken.get(token);
      if (old) { try { old.ws.close(4002, 'login em outro lugar'); } catch (_) {} game.removePlayer(old); }
      const name = String(m.name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14) || 'Caçador';
      p = game.addPlayer(ws, token, name);
      byToken.set(token, p);
      game.send(p, {
        t: 'welcome', id: p.id, world: WORLD, zones: ZONES,
        cats: CATS, odds: SPIN_ODDS, vows: VOWS, mobs: MOBS,
      });
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
setInterval(() => game.saveAll(), 20000);
function bye() { game.saveAll(); process.exit(0); }
process.on('SIGINT', bye);
process.on('SIGTERM', bye);

server.listen(PORT, () => console.log('Nen Hunters rodando em http://localhost:' + PORT));
