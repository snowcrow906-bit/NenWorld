'use strict';
// Testa o salvamento no Supabase contra um servidor falso que imita a API REST (PostgREST).
const http = require('http');
const rows = {};
let down = false, vistoBearer = false;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    if (req.headers.authorization) vistoBearer = true;
    if (req.headers.apikey !== 'sb_secret_teste') { res.writeHead(401); return res.end('{}'); }
    if (req.method === 'POST') {
      if (!req.url.includes('on_conflict=token_hash') || !String(req.headers.prefer).includes('merge-duplicates')) { res.writeHead(400); return res.end('{}'); }
      for (const r of JSON.parse(body)) rows[r.token_hash] = r.data;
      res.writeHead(201); return res.end();
    }
    if (down) { res.writeHead(503); return res.end('{}'); }
    const m = /token_hash=eq\.([0-9a-f]+)/.exec(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(m && rows[m[1]] ? [{ data: rows[m[1]] }] : []));
  });
});
mock.listen(0, async () => {
  process.env.SUPABASE_URL = 'http://localhost:' + mock.address().port + '/';
  process.env.SUPABASE_KEY = 'sb_secret_teste';
  const { Store } = require('../src/store');
  const fail = (m) => { console.error('FALHOU:', m); process.exit(1); };
  const a = new Store();
  if (a.mode !== 'supabase') fail('modo deveria ser supabase');
  a.set('token-de-teste-1234567890', { name: 'X', lvl: 7, jenny: 123 });
  await a.flush();
  const b = new Store(); // "servidor reiniciado": memória vazia
  await b.ensure('token-de-teste-1234567890');
  const rec = b.get('token-de-teste-1234567890');
  if (!rec || rec.lvl !== 7 || rec.jenny !== 123) fail('registro não voltou do banco');
  if (vistoBearer) fail('chave sb_secret_ não deve ir no cabeçalho Authorization');
  console.log('ok - save e carga via Supabase (servidor simulado), chave nova só no apikey');
  const c = new Store(); await c.ensure('token-inexistente-0000000000');
  if (c.get('token-inexistente-0000000000') !== null) fail('jogador novo deveria vir vazio');
  console.log('ok - jogador novo começa vazio');
  down = true; // banco fora do ar: entrar NÃO pode virar "jogador novo"
  const d = new Store(); let erro = null;
  try { await d.ensure('token-de-teste-1234567890'); } catch (e) { erro = e; }
  if (!erro) fail('com o banco fora do ar, ensure deveria falhar');
  console.log('ok - banco fora do ar bloqueia a entrada em vez de criar jogador novo');
  mock.close(); process.exit(0);
});
