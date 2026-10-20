// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas');
fs.mkdirSync(SAIDA, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
const recebidos = [];

await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  let arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p)) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});

const welcome = {
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, FIRE: 0.5, GRASS: 2 }, WATER: { FIRE: 2, WATER: 0.5 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true }],
  itensNossos: [],
  hunts: [
    { slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] },
    { slug: 'squirtle_1', nome: 'Squirtle', nivel: 10, regiao: 'kanto', especies: [{ pokeId: 7, pontos: 8 }] },
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
    ],
  },
};

await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    recebidos.push(o);
    if (o.t === 'market.itens') ws.send(JSON.stringify({ t: 'market', aba: 'itens', resumo: { 300: { minGold: 4000, anuncios: 3, unidades: 9 } }, medias: { 300: { gold: { media: 6000, unidades: 900 } } } }));
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
  });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);

const r = {};
r.pih = await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  return P ? { hook: !!P.hookInstalado, cofre: !!P.cofre, rotina: !!P.rotina, auto: !!P.auto, engine: !!P.engine, comandos: P.COMANDOS_DO_PILOTO.length, bloqueados: P.BLOQUEADOS.size } : null;
});
r.botao = await page.locator('button.pih-btn.pih-barra').count();
await page.screenshot({ path: `${SAIDA}/1-jogo.png` });

// painel "Onde caçar"
await page.locator('button.pih-btn.pih-barra').click();
await sleep(2500);
await page.screenshot({ path: `${SAIDA}/2-onde-cacar.png` });
r.linhas = await page.locator('.pih-painel .pih-lista tbody tr').count();
r.melhor = (await page.locator('.pih-painel .pih-melhor').innerText().catch(() => '')).replace(/\s+/g, ' ');
// ouro/h
await page.locator('.pih-painel [data-ordem="ouro"]').click();
await sleep(1500);
r.melhorOuro = (await page.locator('.pih-painel .pih-melhor').innerText().catch(() => '')).replace(/\s+/g, ' ');
await page.screenshot({ path: `${SAIDA}/3-ouro.png` });
for (const aba of ['rotina', 'cofre', 'auto']) {
  await page.locator(`.pih-painel [data-aba="${aba}"]`).click();
  await sleep(1200);
  r[`aba_${aba}`] = (await page.locator('.pih-painel').innerText()).slice(0, 160).replace(/\s+/g, ' ');
  await page.screenshot({ path: `${SAIDA}/4-${aba}.png` });
}
// liga o Passe pela UI e confere que o comando sai
await page.locator('.pih-painel [data-aba="rotina"]').click();
await sleep(600);
await page.locator('.pih-painel [data-rot="passe.ligado"]').check();
await page.evaluate(() => window.__pokeidleHunt.rotina._interno.tique());
await sleep(1500);
r.passeSaiu = recebidos.some((m) => m.t === 'passe.resgatar');
r.tiposRecebidos = [...new Set(recebidos.map((m) => m.t))];

// popup e opções
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const op = await ctx.newPage();
op.on('pageerror', (e) => erros.push(`opcoes: ${e}`));
await op.goto(`chrome-extension://${id}/src/opcoes.html`);
await sleep(1200);
r.opcoesRevenda = await op.locator('#revendaAutomatica').count();
await op.screenshot({ path: `${SAIDA}/5-opcoes.png`, fullPage: true });
const pp = await ctx.newPage();
pp.on('pageerror', (e) => erros.push(`popup: ${e}`));
await pp.goto(`chrome-extension://${id}/src/popup.html`);
await sleep(1000);
await pp.screenshot({ path: `${SAIDA}/6-popup.png` });

r.erros = erros;
console.log(JSON.stringify(r, null, 2));
await ctx.close();
