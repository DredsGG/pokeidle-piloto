// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-guia');
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
    const tipo = p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.webp') ? 'image/webp' : p.endsWith('.gif') ? 'image/gif' : p.endsWith('.png') ? 'image/png' : p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : 'text/html';
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
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
      { id: 10, slot: null, level: 28, xp: 1, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 3100, ivs: { hp: 20, atk: 22, def: 18, spAtk: 24, spDef: 18, speed: 20 }, stats: { hp: 95, atk: 60, def: 50, spAtk: 70, spDef: 55, speed: 66 }, maxHp: 1140, hp: 1140 },
      { id: 11, slot: null, level: 9, xp: 1, nome: 'Rattata', speciesId: 19, tipos: ['NORMAL'], quality: 0.9, potencia: 1, poder: 300, ivs: { hp: 8, atk: 8, def: 8, spAtk: 8, spDef: 8, speed: 8 }, stats: { hp: 24, atk: 14, def: 10, spAtk: 8, spDef: 10, speed: 20 }, maxHp: 288, hp: 288 },
      { id: 12, slot: null, level: 6, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.5, potencia: 4, poder: 420, shiny: true, ivs: { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 30, speed: 30 }, stats: { hp: 22, atk: 13, def: 11, spAtk: 14, spDef: 12, speed: 15 }, maxHp: 264, hp: 264 },
      { id: 13, slot: null, level: 33, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.1, potencia: 1, poder: 2200, ivs: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, speed: 15 }, stats: { hp: 80, atk: 40, def: 50, spAtk: 42, spDef: 50, speed: 33 }, maxHp: 960, hp: 960 },
    ],
  },
};

const meusFake = [];
const ofertaFake = { on: false };
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  globalThis.__ws = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    o._em = Date.now();
    recebidos.push(o);
    globalThis.__aoMsg?.(o);
    if (o.t === 'market.itens') ws.send(JSON.stringify({ t: 'market', aba: 'itens', resumo: { 300: { minGold: ofertaFake.on ? 2000 : 4000, anuncios: 3, unidades: 9 }, 301: { minGold: ofertaFake.on ? 2000 : 5000, anuncios: 2, unidades: 4 } }, medias: { 300: { gold: { media: 6000, unidades: 900 } }, 301: { gold: { media: 6000, unidades: 900 } } } }));
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'market.listar') ws.send(JSON.stringify({ t: 'market', aba: 'vitrine', ordem: o.ordem, pagina: o.pagina ?? 0, seq: o.seq, linhas: [], total: 0 }));
    if (o.t === 'market.historico') ws.send(JSON.stringify({ t: 'market', aba: 'historico', seq: o.seq, linhas: [] }));
    if (o.t === 'market.meus') ws.send(JSON.stringify({ t: 'market', aba: 'meus', linhas: meusFake }));
    if (o.t === 'market.historicoCompras') ws.send(JSON.stringify({ t: 'market', aba: 'historicoCompras', seq: o.seq, linhas: [] }));
    if (o.t === 'market.item' && Number(o.itemId) === 300) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 300, moeda: 'gold', linhas: [...(ofertaFake.on ? [{ id: 950, preco: 2000, qtd: 30, vendedorId: 60, estado: 'aberto', compravelEm: ofertaFake.libera }] : []), { id: 901, preco: 5000, qtd: 3, vendedorId: 55, estado: 'aberto' }, { id: 902, preco: 5200, qtd: 2, vendedorId: 56, estado: 'aberto' }, ...meusFake] }));
    if (o.t === 'market.item' && Number(o.itemId) === 301) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 301, moeda: 'gold', linhas: [...(ofertaFake.on ? [{ id: 960, preco: 2000, qtd: 30, vendedorId: 61, estado: 'aberto', compravelEm: ofertaFake.libera }] : []), { id: 911, preco: 5000, qtd: 3, vendedorId: 57, estado: 'aberto' }, { id: 912, preco: 5300, qtd: 2, vendedorId: 58, estado: 'aberto' }] }));
    if (o.t === 'market.comprar') {
      const id = o.id;
      ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'entrou', total: id === 950 ? 3 : 9, quem: ['Trainer', 'Rival'] }] }));
      setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: id === 950
        ? [{ k: 'mktSorteio', id, fase: 'fim', ok: true, descricao: '30× Fire Stone', total: 3, levaram: [{ nick: 'Trainer', sobra: 0 }] }, { k: 'marketComprado', descricao: '30× Fire Stone', valor: 60000, moeda: 'gold' }]
        : [{ k: 'mktSorteio', id, fase: 'fim', perdeu: true, total: 9, levaram: [{ nick: 'Rival', sobra: 0 }] }] })), 3500);
    }
    if (o.t === 'market.criar') meusFake.push({ id: 777, tipo: 'item', itemId: o.itemId, nome: 'Fire Stone', qtd: o.qtd, preco: o.preco, moeda: 'gold', estado: 'aberto', vendedorId: 7, compravelEm: Date.now() + 120000, editavelEm: Date.now() + 1800000 });
  });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.removeItem('piloto:dev:manual'); } catch {} if (location.hostname === 'pokeidle.io') window.__plateiaPonte = true; });
await ctx.route(/https:\/\/(www\.twitch\.tv|kick\.com|github\.com)\/.*/, (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);



let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const guiaNoStorage = () => sw.evaluate(() => chrome.storage.local.get('piloto:guia').then((r) => r['piloto:guia'] || null));
const aberto = () => page.evaluate(() => window.__pokeidleHunt.guia && window.__pokeidleHunt.guia.aberto());
const J = () => page.locator('.plt-janela:not(.plt-janela-time)');
ok((await guiaNoStorage())?.tutorial === false, `instalação nova marcada pelo fundo (${JSON.stringify(await guiaNoStorage())})`);
ok(await page.evaluate(() => document.querySelector('.plt-barra')?.dataset.modo || JSON.parse(localStorage.getItem('piloto:modo:v1') || 'null')) !== 'automatico', 'instalação nova não liga nada sozinha');
// 1) primeira abertura: o guia
await page.locator('button.plt-barra').click(); await sleep(1800);
ok(await page.evaluate(() => document.querySelector('.plt-janela').dataset.modo) === 'desligado', 'instalação nova começa no Off');
let a = await aberto();
ok(a && a.tipo === 'tutorial' && a.passo === 0, `primeira abertura mostra o guia (${JSON.stringify(a)})`);
ok(await page.locator('.plt-guia [data-guia="pular"]').count() === 1 && await page.locator('.plt-guia [data-guia="proximo"]').count() === 1, 'tem Pular e Próximo');
await J().screenshot({ path: `${SAIDA}/1-guia-pt.png` });
const passos = await page.evaluate(() => window.__pokeidleHunt.guiaTextos.pt.tutorial.length);
for (let i = 1; i < passos; i++) { await page.locator('.plt-guia [data-guia="proximo"]').click(); await sleep(150); }
ok(await page.locator('.plt-guia [data-guia="entendi"]').count() === 1, `último passo tem Entendi (${passos} passos)`);
// a automação continua: a janela por trás segue desenhando
ok(await page.evaluate(() => !!document.querySelector('.plt-janela [data-conteudo]')?.children.length), 'a janela continua viva por trás');
await page.locator('.plt-guia [data-guia="entendi"]').click(); await sleep(500);
ok(!(await aberto()), 'Entendi fecha');
ok((await guiaNoStorage())?.tutorial === true, `"já viu" gravado no storage.local (${JSON.stringify(await guiaNoStorage())})`);
// 2) fechar e abrir de novo: não volta
await page.keyboard.press('Escape'); await sleep(400);
await page.locator('button.plt-barra').click(); await sleep(1500);
ok(!(await aberto()), 'não aparece de novo');
// 3) o ? reabre; Esc fecha só o quadro
await page.locator('.plt-janela [data-guia-abrir]').click(); await sleep(400);
ok((await aberto())?.tipo === 'tutorial', 'o ? do topo reabre o guia');
await page.keyboard.press('Escape'); await sleep(400);
ok(!(await aberto()) && await J().count() === 1, 'Esc fecha o quadro e a janela fica');
// 4) atualização: novidades uma vez
await page.keyboard.press('Escape'); await sleep(300);
await sw.evaluate(() => chrome.storage.local.set({ 'piloto:guia': { tutorial: true, novidades: '1.29.1' } }));
await page.reload(); await sleep(4500);
await page.locator('button.plt-barra').click(); await sleep(1800);
a = await aberto();
ok(a && a.tipo === 'novidades', `depois de atualizar: novidades (${JSON.stringify(a)})`);
const itens = await page.locator('.plt-guia-lista li').count();
ok(itens >= 1, `lista de novidades (${itens} itens)`);
ok(/Novidades da v\d+\.\d+\.\d+/.test(await page.locator('.plt-guia-h').innerText()), 'título "Novidades da vX.Y.Z"');
await J().screenshot({ path: `${SAIDA}/2-novidades-pt.png` });
await page.locator('.plt-guia [data-guia="fechar"]').click(); await sleep(400);
ok(!(await aberto()) && (await guiaNoStorage())?.novidades === (await page.evaluate(() => document.documentElement.dataset.pilotoVersao)), 'X fecha e marca a versão vista');
await page.keyboard.press('Escape'); await sleep(300);
await page.locator('button.plt-barra').click(); await sleep(1500);
ok(!(await aberto()), 'novidades só uma vez por versão');
// 5) inglês: os textos vêm do arquivo do idioma
await page.click('.plt-idiomas [data-idioma="en"]'); await sleep(600);
await page.locator('.plt-janela [data-guia-abrir]').click(); await sleep(500);
const tit = await page.locator('.plt-guia-h').innerText();
ok(/Welcome to the Pilot/.test(tit), `guia em inglês (${tit})`);
ok(await page.locator('.plt-janela [data-guia-abrir]').getAttribute('title') === 'How to use the Pilot', 'o ? traduzido');
await J().screenshot({ path: `${SAIDA}/3-guide-en.png` });
await page.click('.plt-guia [data-guia="proximo"]'); await sleep(200);
await page.evaluate(() => window.__pokeidleHunt.idioma.definir('es')); await sleep(600);
ok(/Off, Manual y Auto/.test(await page.locator('.plt-guia-h').innerText()), 'troca de idioma com o quadro aberto');
await page.keyboard.press('Escape'); await sleep(300);
await page.click('.plt-idiomas [data-idioma="pt"]'); await sleep(400);
ok(erros.filter((e) => /TypeError|ReferenceError|pageerror/.test(e)).length === 0, `sem erro de página (${erros.filter((e) => /Error/.test(e)).slice(0, 2).join(' | ')})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
