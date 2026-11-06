// Relato #5, ponto 1 (ZaryImortal): no Automático, upando o Magikarp, o Piloto marcou Ultra Potion em
// vez de Small Potion (lucro negativo). Causa: a poção era escolhida pelo HP MÉDIO do time, não pelo
// HP de quem luta. Com time forte (HP médio ~1.000), só Ultra para cima passava no filtro "cura pelo
// menos 1/3 do que falta"; o Magikarp (150 de HP) gastava Ultra para curar 105.
// Preços da loja (npcPrice) do jogo falso: Small 60 HP/50, Great 150/150, Ultra 400/400,
// Hyper 1000/800, Ultimate 3000/1500.
//   node pocao-luta.mjs [pasta-da-extensao]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = require('playwright');

const EXT = path.resolve(process.argv[2] || path.join(AQUI, '../extension'));
const FAKE = path.resolve(AQUI, 'fake');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const forte = (id, slot, nome, speciesId) => ({ id, slot, level: 300, xp: 1, nome, speciesId, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 30000, ivs, stats: { hp: 101, atk: 120, def: 100, spAtk: 120, spDef: 100, speed: 100 }, maxHp: 1212, hp: 1212 });
const welcome = {
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, GRASS: 2 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }],
  itensNossos: [],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 50_000_000, level: 400, xp: 1, activeId: 129, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [202], reviveIds: [205], hpLimiar: 0.3 }, balls: { 1: 500 }, items: { 202: 100, 205: 20 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      // quem luta: o Magikarp subindo de nível (HP máximo 150)
      { id: 129, slot: 0, level: 20, xp: 1, nome: 'Magikarp', speciesId: 19, tipos: ['NORMAL'], quality: 1, potencia: 1, poder: 200, ivs, stats: { hp: 12, atk: 5, def: 10, spAtk: 5, spDef: 8, speed: 30 }, maxHp: 150, hp: 150 },
      forte(201, 1, 'Charizard', 4), forte(202, 2, 'Blastoise', 7), forte(203, 3, 'Arcanine', 4), forte(204, 4, 'Gyarados', 7),
    ],
  },
};
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => { const o = JSON.parse(m); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(2000);
await page.keyboard.press('Escape');

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };
// escolhe o kit com o estado do jogo; muda quem luta e os HP antes, se pedido
const kit = (o = {}) => page.evaluate(async (o) => {
  const P = window.__pokeidleHunt;
  let e = null; P.on('estado', (x) => { e = x; });
  if (o.ativo != null) e.activeId = o.ativo;
  if (o.hp) for (const [id, hp] of Object.entries(o.hp)) { const p = e.pokemons.find((x) => x.id === Number(id)); p.maxHp = hp; p.hp = hp; }
  if (o.precos) { const j = await P.carregarJogo(); for (const [id, v] of Object.entries(o.precos)) { const i = j.itensPorId.get(Number(id)); if (i) i.npcPrice = v; } }
  const k = P.auto._interno.escolherKit({ ouroH: 0, livre: 1e9 });
  return k && { pocao: k.pocao.name, revive: k.revive.name, hp: k.hpLuta, medio: k.hpMedio };
}, o);

// 1) o caso do relato: o Magikarp luta, time forte
let k = await kit();
ok(k && k.pocao === 'Small Potion', `Magikarp (150 de HP) lutando num time forte (HP médio ~1.000): Small Potion → ${k && k.pocao} (HP de quem luta ${k && k.hp}, médio ${k && k.medio})`);
// 2) quem luta é um dos fortes (1.212 de HP): uma poção que segura a luta, não a Small
k = await kit({ ativo: 201 });
ok(k && k.pocao !== 'Small Potion' && ['Ultra Potion', 'Hyper Potion'].includes(k.pocao), `Charizard (1.212 de HP) lutando: poção que cura pelo menos 1/3 do que falta → ${k && k.pocao}`);
// 3) nunca uma que cura muito mais do que falta quando outra menor cura o suficiente: a Hyper
//    (1.000 HP) fica barata (100), mas para o Magikarp (falta 105) a Great (150 HP) já basta
k = await kit({ ativo: 129, precos: { 203: 100 } });
ok(k && k.pocao !== 'Hyper Potion' && k.pocao !== 'Ultimate Potion', `Magikarp com a Hyper barata (100): não marca uma poção de 1.000 HP para curar 105 → ${k && k.pocao}`);
// 4) Hyper de volta ao preço da loja: Small de novo
k = await kit({ precos: { 203: 800 } });
ok(k && k.pocao === 'Small Potion', `de volta ao preço da loja: Small Potion → ${k && k.pocao}`);
const errosPag = erros.filter((x) => /TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
