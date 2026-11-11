// #5: "achado: Shiny na hunt! Weavile Nv 2602 apareceu shiny em Caterpie." A lista de mobs do campo não
// traz só selvagens: na casa vêm os pokémon em treino (ti), na praça do Centro os treinadores (tr) e os
// bonecos (bn). O huntSlug continua sendo o da última hunt, daí o "em Caterpie".
//   node shiny-cena.mjs [pasta-da-extensao]
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
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };
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
const stats = { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 };
const welcome = {
  t: 'welcome', tabelaTipos: { NORMAL: {} }, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: { id: 7, nick: 'Treinador', gold: 1000, level: 3000, xp: 1, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(), automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2 }, casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [{ id: 3, slot: 0, level: 2602, xp: 1, nome: 'Weavile', speciesId: 4, tipos: ['DARK'], quality: 1.2, potencia: 1, shiny: true, ivs, stats, maxHp: 720, hp: 720 }] },
};
let wsAtual = null;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => { wsAtual = ws; ws.onMessage((m) => { const o = JSON.parse(m); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); }); setTimeout(() => ws.send(JSON.stringify(welcome)), 300); });
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
await page.goto('https://pokeidle.io/app');
await sleep(4000);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1000);
await page.keyboard.press('Escape');
const srv = (o) => wsAtual.send(JSON.stringify(o));
const achados = () => page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos(40) || []).map((d) => d.txt).filter((t) => /Shiny na hunt/.test(t)));
const tem = async (nome) => (await achados()).some((t) => t.includes(nome));

// na casa, um pokémon em treino (o caso do relato: Nv alto, "em <última hunt>")
srv({ t: 'campo.init', casa: true, mobs: [{ s: 1, n: 'Weavile', nv: 2602, sh: true, ti: 0 }] });
await sleep(500);
ok(!(await tem('Weavile')), `casa: pokémon em treino não é "apareceu shiny" (${await achados()})`);
srv({ t: 'campo', mobs: [{ s: 1, n: 'Weavile', nv: 2602, sh: true, ti: 0 }] });
await sleep(400);
ok(!(await tem('Weavile')), 'casa: nem no pacote seguinte');
// na praça do Centro
srv({ t: 'campo.init', centro: true, sala: 1, mobs: [{ s: 2, n: 'Charizard', nv: 1890, sh: true }, { s: 3, n: 'Fulano', nv: 900, sh: true, tr: true }] });
await sleep(400);
srv({ t: 'campo', mobs: [{ s: 4, n: 'Mega Feraligatr', nv: 3314, sh: true }] });
await sleep(400);
ok(!(await tem('Charizard')) && !(await tem('Fulano')) && !(await tem('Mega Feraligatr')), `praça do Centro: nada vira achado (${await achados()})`);
// o estado já diz que está fora da hunt, mesmo sem a bandeira no campo.init
srv({ t: 'estado', estado: { noCentro: true, servidorAgora: Date.now() } }); await sleep(400);
srv({ t: 'campo.init', mobs: [{ s: 5, n: 'Lucario', nv: 2000, sh: true }] }); await sleep(400);
ok(!(await tem('Lucario')), 'estado no Centro: nada vira achado');
srv({ t: 'estado', estado: { noCentro: false, servidorAgora: Date.now() } }); await sleep(400);

// de volta à hunt: o selvagem shiny avisa
srv({ t: 'campo.init', mobs: [{ s: 6, n: 'Rattata', nv: 5, sh: true }, { s: 7, n: 'Rattata', nv: 5 }] });
await sleep(500);
let a = await achados();
ok(a.length === 1 && /Rattata Nv 5 apareceu shiny em Rattata/.test(a[0]), `na hunt: o selvagem shiny avisa (${a})`);
srv({ t: 'campo', mobs: [{ s: 6, n: 'Rattata', nv: 5, sh: true }] }); await sleep(300);
ok((await achados()).length === 1, 'o mesmo selvagem: um aviso só');
// o seu pokémon, com o nome e o nível do time, numa lista de mobs da hunt: não avisa
srv({ t: 'campo', mobs: [{ s: 8, n: 'Weavile', nv: 2602, sh: true }] }); await sleep(400);
ok(!(await tem('Weavile')), 'na hunt: um shiny SEU (mesmo nome e nível do time) não vira achado');
// entidades que não são selvagens, mesmo numa hunt
srv({ t: 'campo', mobs: [{ s: 9, n: 'Dono', nv: 10, sh: true, dn: 'alguem' }, { s: 10, n: 'Boneco', nv: 10, sh: true, bn: true }, { s: 11, n: 'Lado', nv: 10, sh: true, eq: 1 }] }); await sleep(400);
ok(!(await tem('Dono')) && !(await tem('Boneco')) && !(await tem('Lado')), 'dono, boneco e PvP: não são selvagens');
// a bola que revela um shiny num corpo selvagem continua avisando
srv({ t: 'campo', mobs: [{ s: 12, n: 'Pidgey', nv: 12, x: 1, xr: 20000 }] }); await sleep(300);
srv({ t: 'batalha', ev: [{ k: 'bola', slot: 12, shiny: true }] }); await sleep(500);
ok(await tem('Pidgey'), `bola revela o shiny do corpo selvagem (${await achados()})`);
// os outros achados seguem
srv({ t: 'batalha', ev: [{ k: 'capturado', paraDepot: false, pokemon: { id: 80, nome: 'Pidgey', level: 12, shiny: true, speciesId: 19, quality: 1, potencia: 1 } }] }); await sleep(500);
ok((await page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos(40) || []).map((d) => d.txt))).some((t) => /Shiny capturado/.test(t)), 'Shiny capturado continua avisando');
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
