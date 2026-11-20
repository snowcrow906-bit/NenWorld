'use strict';
// Persistência dos jogadores.
// - Sem configuração: arquivo JSON local (bom para testar; o Render gratuito apaga em cada deploy).
// - Com SUPABASE_URL e SUPABASE_KEY: salva no Supabase (tabela "players"), que não se perde em deploys.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'players.json');

class Store {
  constructor() {
    this.db = {};
    this.dirtyKeys = new Set();
    const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_KEY || '';
    // Chaves novas (sb_secret_...) não são JWT: vão só no cabeçalho apikey. Chaves antigas (service_role, começam com eyJ) também usam Authorization.
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
    this.remote = url && key ? { url, headers } : null;
    if (!this.remote) {
      try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {}
      try { this.db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { this.db = {}; }
    }
  }
  get mode() { return this.remote ? 'supabase' : 'arquivo'; }
  key(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

  // Garante que o registro do jogador esteja em memória (busca no Supabase se preciso).
  // Se o banco não responder, LANÇA erro: nunca tratamos um jogador antigo como novo (isso apagaria o progresso dele).
  async ensure(token) {
    const k = this.key(token);
    if (this.db[k] || !this.remote) return;
    const r = await fetch(this.remote.url + '/rest/v1/players?token_hash=eq.' + k + '&select=data', { headers: this.remote.headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('Supabase leitura HTTP ' + r.status);
    const rows = await r.json();
    if (rows[0] && rows[0].data) this.db[k] = rows[0].data;
  }
  get(token) { return this.db[this.key(token)] || null; }
  set(token, rec) { const k = this.key(token); this.db[k] = rec; this.dirtyKeys.add(k); }

  async flush() {
    if (!this.dirtyKeys.size) return;
    const keys = [...this.dirtyKeys]; this.dirtyKeys.clear();
    if (!this.remote) {
      try {
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.db));
        fs.renameSync(tmp, FILE);
      } catch (e) { console.error('Falha ao salvar:', e.message); keys.forEach((k) => this.dirtyKeys.add(k)); }
      return;
    }
    try {
      const rows = keys.map((k) => ({ token_hash: k, data: this.db[k], updated_at: new Date().toISOString() }));
      const r = await fetch(this.remote.url + '/rest/v1/players?on_conflict=token_hash', {
        method: 'POST', headers: { ...this.remote.headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows), signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } catch (e) { console.error('Supabase gravação falhou:', e.message); keys.forEach((k) => this.dirtyKeys.add(k)); }
  }
}
module.exports = { Store };
