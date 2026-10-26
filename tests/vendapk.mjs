// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-vendapk');
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
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 20, slot: null, level: 60, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.6, potencia: 4, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 }, stats: { hp: 90, atk: 50, def: 60, spAtk: 50, spDef: 60, speed: 45 }, maxHp: 900, hp: 900 },
      { id: 21, slot: null, level: 60, xp: 1, nome: 'Mewtwo', speciesId: 150, tipos: ['PSYCHIC'], quality: 1.6, potencia: 4, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 }, stats: { hp: 90, atk: 50, def: 60, spAtk: 50, spDef: 60, speed: 45 }, maxHp: 900, hp: 900 },
      { id: 22, slot: null, level: 60, xp: 1, nome: 'Squirtle', speciesId: 7, shiny: true, tipos: ['WATER'], quality: 1.6, potencia: 4, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 }, stats: { hp: 90, atk: 50, def: 60, spAtk: 50, spDef: 60, speed: 45 }, maxHp: 900, hp: 900 },
      { id: 23, slot: null, level: 60, xp: 1, nome: 'Squirtle', speciesId: 7, heldItemId: 900, tipos: ['WATER'], quality: 1.6, potencia: 4, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 }, stats: { hp: 90, atk: 50, def: 60, spAtk: 50, spDef: 60, speed: 45 }, maxHp: 900, hp: 900 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
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
    if (o.t === 'market.listar' && o.especieId !== 7) ws.send(JSON.stringify({ t: 'market', aba: 'vitrine', ordem: o.ordem, pagina: o.pagina ?? 0, seq: o.seq, linhas: [], total: 0 }));
    if (o.t === 'market.historico') ws.send(JSON.stringify({ t: 'market', aba: 'historico', seq: o.seq, linhas: [] }));
    if (o.t === 'market.meus') ws.send(JSON.stringify({ t: 'market', aba: 'meus', linhas: meusFake }));
    if (o.t === 'market.historicoCompras') ws.send(JSON.stringify({ t: 'market', aba: 'historicoCompras', seq: o.seq, linhas: [] }));
    if (o.t === 'market.item' && Number(o.itemId) === 300) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 300, moeda: 'gold', linhas: [...(ofertaFake.on ? [{ id: 950, preco: 2000, qtd: 30, vendedorId: 60, estado: 'aberto', compravelEm: ofertaFake.libera }] : []), { id: 901, preco: 5000, qtd: 3, vendedorId: 55, estado: 'aberto' }, { id: 902, preco: 5200, qtd: 2, vendedorId: 56, estado: 'aberto' }, ...meusFake] }));
    if (o.t === 'market.item' && Number(o.itemId) === 301) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 301, moeda: 'gold', linhas: [...(ofertaFake.on ? [{ id: 960, preco: 2000, qtd: 30, vendedorId: 61, estado: 'aberto', compravelEm: ofertaFake.libera }] : []), { id: 911, preco: 5000, qtd: 3, vendedorId: 57, estado: 'aberto' }, { id: 912, preco: 5300, qtd: 2, vendedorId: 58, estado: 'aberto' }] }));
    if (o.t === 'market.comprar') {
      const id = o.id;
      ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'entrou', total: id === 950 ? 3 : 9, quem: ['andre', 'zeca'] }] }));
      setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: id === 950
        ? [{ k: 'mktSorteio', id, fase: 'fim', ok: true, descricao: '30× Fire Stone', total: 3, levaram: [{ nick: 'andre', sobra: 0 }] }, { k: 'marketComprado', descricao: '30× Fire Stone', valor: 60000, moeda: 'gold' }]
        : [{ k: 'mktSorteio', id, fase: 'fim', perdeu: true, total: 9, levaram: [{ nick: 'zeca', sobra: 0 }] }] })), 3500);
    }
    if (o.t === 'market.historicoGlobal') {
      const linhas = o.tipo === 'pokemon' && /squirtle/i.test(o.busca) ? [5e6, 6e6, 6.5e6, 7e6, 8e6, 9e6].map((p, i) => ({ tipo: 'pokemon', pokemonId: 500 + i, bruto: p, moeda: 'gold', em: Date.now() - i * 864e5, ficha: { speciesId: 7, nome: 'Squirtle', level: 60, nota: 4.05, potencia: 4, quality: 1.6, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 } } })) : [];
      ws.send(JSON.stringify({ t: 'market', aba: 'historicoGlobal', seq: o.seq, pagina: o.pagina, linhas, temMais: false }));
    }
    if (o.t === 'market.listar' && o.tipo === 'pokemon' && o.especieId === 7) {
      ws.send(JSON.stringify({ t: 'market', aba: 'vitrine', ordem: o.ordem, pagina: o.pagina ?? 0, seq: o.seq, total: 2, linhas: [6e6, 7e6].map((p, i) => ({ id: 800 + i, tipo: 'pokemon', pokemonId: 600 + i, preco: p, moeda: 'gold', estado: 'aberto', vendedorId: 70 + i, ficha: { speciesId: 7, nome: 'Squirtle', level: 62, nota: 4.06, potencia: 4, quality: 1.6, ivTotal: 186, ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, speed: 31 } } })) }));
    }
    if (o.t === 'market.criar' && o.tipo === 'pokemon') {
      meusFake.push({ id: 990, tipo: 'pokemon', pokemonId: o.pokemonId, preco: o.preco, moeda: o.moeda, estado: 'aberto', vendedorId: 7, compravelEm: Date.now() + 120000, ficha: { speciesId: 7, nome: 'Squirtle', level: 60, nota: 4.03, potencia: 4 } });
      setTimeout(() => ws.send(JSON.stringify({ t: 'market', aba: 'criado' })), 300);
      return;
    }
    if (o.t === 'market.criar') meusFake.push({ id: 777, tipo: 'item', itemId: o.itemId, nome: 'Fire Stone', qtd: o.qtd, preco: o.preco, moeda: 'gold', estado: 'aberto', vendedorId: 7, compravelEm: Date.now() + 120000, editavelEm: Date.now() + 1800000 });
  });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);




const r = {};
await page.evaluate(() => { window.__rd = []; document.addEventListener('piloto:radar-diario', (e) => window.__rd.push(e.detail)); document.addEventListener('piloto:pk-guardados', (e) => { window.__pg = e.detail; }); });
await page.locator('button.plt-barra').click(); await sleep(1000);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1500);
// a análise da janela Time (no jogo de mentira não há o que comparar): nenhum "vale treinar"
await page.evaluate(() => { window.__pokeidleHunt.time._interno.st.analise = { em: Date.now(), farmTop: [], pvpTop: [], treinar: [], semNota: false }; });
await page.evaluate(() => window.__pokeidleHunt.guarda.publicar()); await sleep(1500);
r.guarda = await page.evaluate(() => { const g = window.__pokeidleHunt.guarda.resumo(); return { pronto: g.pronto, ids: g.ids.sort((a, b) => a - b), por: g.por, motivo: g.motivo }; });
const gasto0 = await page.evaluate(() => window.__pokeidleHunt.cofre.resumo().gastoPorCategoria.mercado || 0);
const fim = Date.now() + 150000;
while (Date.now() < fim && !recebidos.some((m) => m.t === 'market.criar' && m.tipo === 'pokemon')) { await page.evaluate(() => { window.__pokeidleHunt.time._interno.st.analise = { em: Date.now(), farmTop: [], pvpTop: [], treinar: [], semNota: false }; }); await sleep(2000); }
await sleep(4000);
r.criados = recebidos.filter((m) => m.t === 'market.criar' && m.tipo === 'pokemon').map((m) => ({ pokemonId: m.pokemonId, preco: m.preco, dias: m.dias, moeda: m.moeda }));
r.leituras = [...new Set(recebidos.filter((m) => /historicoGlobal|listar|meus/.test(m.t)).map((m) => `${m.t}:${m.especieId ?? m.busca ?? ''}`))];
r.radar = await page.evaluate(() => { try { return JSON.parse(document.documentElement.dataset.x || 'null'); } catch { return null; } });
r.gastoMercado = (await page.evaluate(() => window.__pokeidleHunt.cofre.resumo().gastoPorCategoria.mercado || 0)) - gasto0;
await page.click('.plt-cats [data-aba="resumo"]').catch(() => {}); await sleep(1500);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/resumo.png` });
r.radarDiario = await page.evaluate(() => window.__rd);
r.pg = await page.evaluate(() => window.__pg);
r.erros = erros.filter((e) => !/404/.test(e)).slice(-12);
console.log(JSON.stringify(r, null, 1));
setTimeout(() => process.exit(0), 300); await ctx.close();
