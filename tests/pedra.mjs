// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-pedra');
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
  pedrasEvolucao: { FIRE: { itemId: 300, nome: 'Fire Stone' } },
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 0 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
    ],
  },
};

const meusFake = [];
const ofertaFake = { on: false };
const servidor = { ws: null, enviar: (o) => servidor.ws && servidor.ws.send(JSON.stringify(o)) };
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  servidor.ws = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    o._em = Date.now();
    recebidos.push(o);
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
      ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'entrou', total: id === 950 ? 3 : 9, quem: ['andre', 'zeca'] }] }));
      if (id === 901 || id === 902) { // 1.33.5: a pedra do time sai no sorteio e chega na mochila
        setTimeout(() => { ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'fim', ok: true, descricao: '1× Fire Stone', total: 9, levaram: [{ nick: 'andre', sobra: 0 }] }, { k: 'marketComprado', descricao: '1× Fire Stone', valor: 5000, moeda: 'gold' }] })); ws.send(JSON.stringify({ t: 'estado', estado: { items: { 200: 10, 205: 2, 300: 1 } } })); }, 3500);
        return;
      }
      setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: id === 950
        ? [{ k: 'mktSorteio', id, fase: 'fim', ok: true, descricao: '30× Fire Stone', total: 3, levaram: [{ nick: 'andre', sobra: 0 }] }, { k: 'marketComprado', descricao: '30× Fire Stone', valor: 60000, moeda: 'gold' }]
        : [{ k: 'mktSorteio', id, fase: 'fim', perdeu: true, total: 9, levaram: [{ nick: 'zeca', sobra: 0 }] }] })), 3500);
    }
    if (o.t === 'market.criar') meusFake.push({ id: 777, tipo: 'item', itemId: o.itemId, nome: 'Fire Stone', qtd: o.qtd, preco: o.preco, moeda: 'gold', estado: 'aberto', vendedorId: 7, compravelEm: Date.now() + 120000, editavelEm: Date.now() + 1800000 });
  });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);

const r = {};
// liga o Piloto (Auto) para o cofre autorizar a compra automática
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1500);
const a0 = recebidos.length;
// 1.27: a Rotina pede a pedra de um pokémon do time → o Radar compra UMA, em ouro, a mais barata que não é sua
await page.evaluate(() => document.dispatchEvent(new CustomEvent('piloto:pedra-precisa', { detail: JSON.stringify({ itemId: 300, nome: 'Fire Stone', para: 'Vulpix → Ninetales' }) })));
for (let i = 0; i < 25 && !recebidos.slice(a0).some((m) => m.t === 'market.comprar'); i++) await sleep(1000);
r.leu = recebidos.slice(a0).filter((m) => m.t === 'market.item').map((m) => m.itemId);
r.comprou = recebidos.slice(a0).filter((m) => m.t === 'market.comprar').map((m) => ({ id: m.id, qtd: m.qtd, preco: m.preco, moeda: m.moeda }));
// o mesmo pedido de novo logo depois não compra outra
const a1 = recebidos.length;
await page.evaluate(() => document.dispatchEvent(new CustomEvent('piloto:pedra-precisa', { detail: JSON.stringify({ itemId: 300, nome: 'Fire Stone', para: 'x' }) })));
await sleep(4000);
r.repetiu = recebidos.slice(a1).filter((m) => m.t === 'market.comprar' || m.t === 'market.item').length;
r.diario = await page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos ? window.__pokeidleHunt.cofre.ultimos(10) : []).map((d) => d.txt || d).filter((t) => /pedra/.test(String(t))));
// 1.33.5: o caminho inteiro — a Rotina vê o Charmander Nv 20 pronto e sem Fire Stone, o Radar compra a mais
// barata, a pedra NÃO entra na reserva de revenda e o Evoluir manda o pokemon.evoluir.
await sleep(4500);
r.reservaDepois = await page.evaluate(() => JSON.parse(localStorage.getItem('piloto:itensDoRadar:v1') || '{}')[300] || 0);
const a2 = recebidos.length;
await page.evaluate(async () => {
  const R = window.__pokeidleHunt.rotina; const c = R._interno.cfg();
  for (const k of ['passe', 'xpshare', 'outland', 'chocadeira', 'rodizio']) c[k].ligado = false;
  c.depot.modo = 'off'; c.pvp.time = c.pvp.fila = false; c.autoColecao.ligado = false;
  c.evoluir.ligado = true; c.evoluir.comprarPedra = true; R._interno.marcas().evoluir = 0;
  for (let i = 0; i < 4; i++) { await R._interno.tique(); await new Promise((res) => setTimeout(res, 1500)); }
});
r.evoluiu = recebidos.slice(a2).filter((m) => m.t === 'pokemon.evoluir').map((m) => ({ pokemonId: m.pokemonId, alvoId: m.alvoId }));
const okFluxo = r.comprou.length === 1 && r.comprou[0].id === 901 && r.reservaDepois === 0 && r.evoluiu.length === 1 && r.evoluiu[0].pokemonId === 3 && r.evoluiu[0].alvoId === 5;
console.log(okFluxo ? 'ok   evolução: compra a pedra mais barata em ouro, ela não vai para a revenda e o pokémon evolui' : 'FALHOU evolução ' + JSON.stringify({ c: r.comprou, res: r.reservaDepois, ev: r.evoluiu }));
if (!okFluxo) process.exitCode = 1;
// 1.36.0: tudo sozinho, sem tique forçado — o inicial do time sobe para o Nv 16 sem a pedra: a Rotina pede,
// o Radar compra, a pedra chega e o pokémon evolui, em segundos.
const a3 = recebidos.length;
await page.evaluate(() => { const c = window.__pokeidleHunt.rotina._interno.cfg(); c.evoluir.ligado = true; c.evoluir.comprarPedra = true; });
const t0 = Date.now();
r.estadoNovo = await page.evaluate(() => typeof window.__pokeidleHunt.rotina._interno.tique === 'function');
servidor.enviar({ t: 'estado', estado: { items: { 200: 10, 205: 2, 300: 0 }, pokemons: [
  { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
  { id: 9, slot: 1, level: 16, xp: 2000, nome: 'Charmander', speciesId: 4, starter: true, tipos: ['FIRE'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
] } });
for (let i = 0; i < 90 && !recebidos.slice(a3).some((m) => m.t === 'pokemon.evoluir'); i++) await sleep(1000);
const seq = recebidos.slice(a3).filter((m) => ['market.item', 'market.comprar', 'pokemon.evoluir'].includes(m.t));
r.sozinho = { seg: Math.round((Date.now() - t0) / 1000), seq: seq.map((m) => m.t + (m.pokemonId ? ':' + m.pokemonId : '') + (m.id ? ':' + m.id : '')) };
const okSozinho = seq.some((m) => m.t === 'market.comprar') && seq.some((m) => m.t === 'pokemon.evoluir' && m.pokemonId === 9 && m.alvoId === 5) && r.sozinho.seg <= 90;
console.log(okSozinho ? `ok   1.36.0: inicial sobe de nível sem pedra → compra e evolui sozinho em ${r.sozinho.seg} s` : 'FALHOU 1.36.0 sozinho ' + JSON.stringify(r.sozinho));
if (!okSozinho) process.exitCode = 1;
r.diagEvo = await page.evaluate(() => JSON.parse(localStorage.getItem('piloto:diag:evo') || '[]').map((d) => d.txt));
r.erros = erros.filter((e) => /error|Error/.test(e) && !/404/.test(e));
console.log(JSON.stringify(r, null, 1));
setTimeout(() => process.exit(0), 500); await ctx.close();
