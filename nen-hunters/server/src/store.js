'use strict';
// Persistência simples em arquivo JSON (a Etapa 6 troca isto por Supabase).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'players.json');

class Store {
  constructor() {
    this.db = {};
    this.dirty = false;
    try { fs.mkdirSync(DIR, { recursive: true }); } catch (_) {}
    try { this.db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { this.db = {}; }
  }
  key(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
  get(token) { return this.db[this.key(token)] || null; }
  set(token, rec) { this.db[this.key(token)] = rec; this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    try {
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db));
      fs.renameSync(tmp, FILE);
      this.dirty = false;
    } catch (e) { console.error('Falha ao salvar:', e.message); }
  }
}
module.exports = { Store };
