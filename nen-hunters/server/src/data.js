'use strict';
// Dados de design do jogo. Tudo que é balanceamento fica aqui.

const WORLD = { w: 3200, h: 3200, cx: 1600, cy: 1600 };

// Zonas por distância do centro
const ZONES = [
  { id: 'vila', nome: 'Vila de Partida', r: 350, cor: '#2d4a3a', seguro: true },
  { id: 'floresta', nome: 'Floresta Sombria', r: 1000, cor: '#1c3326' },
  { id: 'pantano', nome: 'Pântano Úmido', r: 1500, cor: '#2a3a2f' },
  { id: 'ruinas', nome: 'Ruínas do Norte', r: 99999, cor: '#3a3530' },
];
function zoneAt(x, y) {
  const d = Math.hypot(x - WORLD.cx, y - WORLD.cy);
  return ZONES.find((z) => d < z.r);
}

// Categorias de Nen (nomes de habilidade são originais)
const CATS = {
  intensificacao: { nome: 'Intensificação', cor: '#e8553d', hp: 1.25, dano: 1.25, vel: 1.0, ranged: false, hatsu: 'Punho Reforçado', desc: 'Corpo e golpes mais fortes. Hatsu: explosão corpo a corpo em área.' },
  emissao: { nome: 'Emissão', cor: '#f2b632', hp: 0.9, dano: 1.0, vel: 1.0, ranged: true, hatsu: 'Rajada de Aura', desc: 'Dispara aura à distância. Hatsu: leque de projéteis.' },
  transformacao: { nome: 'Transformação', cor: '#9b6bf0', hp: 1.0, dano: 1.1, vel: 1.15, ranged: false, hatsu: 'Aura Elétrica', desc: 'Muda a natureza da aura. Hatsu: velocidade e dano em alta por alguns segundos.' },
  materializacao: { nome: 'Materialização', cor: '#33b5a5', hp: 1.1, dano: 1.0, vel: 1.0, ranged: false, hatsu: 'Escudo Materializado', desc: 'Cria objetos de aura. Hatsu: escudo que absorve dano.' },
  manipulacao: { nome: 'Manipulação', cor: '#4a8fe0', hp: 0.95, dano: 0.95, vel: 1.0, ranged: false, hatsu: 'Controle de Aura', desc: 'Controla alvos. Hatsu: paralisa inimigos próximos.' },
  especializacao: { nome: 'Especialização', cor: '#f4efff', hp: 1.3, dano: 1.35, vel: 1.1, ranged: false, hatsu: 'Habilidade Única', desc: 'Rara. Hatsu: explosão de área que também cura você.' },
};
const CAT_IDS = Object.keys(CATS);

// Chances do spin (somam 100)
const SPIN_ODDS = [
  ['intensificacao', 21], ['emissao', 21], ['transformacao', 20],
  ['materializacao', 18], ['manipulacao', 18], ['especializacao', 2],
];

// Preço do spin em Jenny: cresce a cada compra
const SPIN_PRICE = { base: 500, mult: 1.35, max: 25000 };

// Juramentos: condição que aumenta o poder do Hatsu
const VOWS = {
  nenhum: { nome: 'Sem juramento', mult: 1, desc: 'Sem risco, sem bônus.' },
  ren: { nome: 'Só com Ren ativo', mult: 1.5, req: 'ren', desc: 'Hatsu exige Ren ligado. +50% de poder.' },
  sangue: { nome: 'Paga 15% da vida', mult: 1.6, hpCost: 0.15, desc: 'Gasta vida ao usar. +60% de poder.' },
  espera: { nome: 'Recarga dobrada', mult: 1.5, cdMult: 2, desc: 'Recarga 2x maior. +50% de poder.' },
};

const MOBS = {
  lobo: { nome: 'Lobo Sombrio', minLvl: 1, questNeed: 6, hp: 40, dano: 6, vel: 115, xp: 12, jenny: [6, 14], r: 14, aggro: 230, ring: [380, 980], count: 16, cor: '#7d8798' },
  urso: { nome: 'Urso Rochoso', minLvl: 5, questNeed: 5, hp: 130, dano: 15, vel: 90, xp: 42, jenny: [22, 42], r: 22, aggro: 210, ring: [1020, 1480], count: 11, cor: '#8a6a4a' },
  golem: { nome: 'Golem das Ruínas', minLvl: 12, questNeed: 4, hp: 320, dano: 30, vel: 70, xp: 120, jenny: [65, 125], r: 30, aggro: 200, ring: [1520, 1700], count: 7, cor: '#a89f90' },
  guardiao: { nome: 'Guardião das Ruínas', boss: true, respawn: 90000, minLvl: 20, questNeed: 1, hp: 2200, dano: 45, vel: 85, xp: 700, jenny: [450, 900], r: 46, aggro: 300, ring: [1560, 1680], count: 1, cor: '#c9503a' },
};

// Equipamentos comprados na vila com Jenny (7 níveis: 0 a 6)
const GEAR = {
  wp: { nome: 'Arma', bonus: '+15% de dano por nível', max: 6, base: 250, mult: 2.1,
    names: ['Punhos nus', 'Luvas de treino', 'Luvas reforçadas', 'Manoplas de aço', 'Manoplas de Nen', 'Manoplas lendárias', 'Manoplas do Mestre'] },
  ar: { nome: 'Armadura', bonus: '-6% de dano recebido por nível', max: 6, base: 250, mult: 2.1,
    names: ['Roupa simples', 'Roupa de viagem', 'Colete de couro', 'Cota de malha', 'Armadura leve', 'Armadura pesada', 'Armadura do Caçador'] },
};
const gearPrice = (slot, lvl) => (lvl >= GEAR[slot].max ? 0 : Math.round(GEAR[slot].base * Math.pow(GEAR[slot].mult, lvl)));

module.exports = { WORLD, ZONES, zoneAt, CATS, CAT_IDS, SPIN_ODDS, SPIN_PRICE, VOWS, MOBS, GEAR, gearPrice };
