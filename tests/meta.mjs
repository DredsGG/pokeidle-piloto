// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-meta');
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
      ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'entrou', total: id === 950 ? 3 : 9, quem: ['andre', 'zeca'] }] }));
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
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
const pk = (speciesId, nome, level, poder, tipos) => ({ id: speciesId * 100 + level, speciesId, nome, level, poder, nota: 4.2, tipos, potencia: 2, quality: 1.3, tmElemental: null, shiny: false });
const TIMES = {
  befoin: [pk(5, 'Charmeleon', 3000, 30000, ['FIRE']), pk(7, 'Squirtle', 2800, 22000, ['WATER']), pk(19, 'Rattata', 2500, 15000, ['NORMAL']), pk(4, 'Charmander', 2000, 12000, ['FIRE']), pk(3005, 'Mega Charmeleon', 3200, 36000, ['FIRE', 'DRAGON'])],
  Sekhmarra: [pk(5, 'Charmeleon', 2900, 29000, ['FIRE']), pk(7, 'Squirtle', 2700, 21000, ['WATER']), pk(3005, 'Mega Charmeleon', 3000, 34000, ['FIRE', 'DRAGON'])],
  Zaxa: [pk(7, 'Squirtle', 2600, 20000, ['WATER']), pk(19, 'Rattata', 2000, 9000, ['NORMAL']), pk(5, 'Charmeleon', 2500, 25000, ['FIRE'])],
  badboy: [pk(4, 'Charmander', 900, 2500, ['FIRE']), pk(19, 'Rattata', 950, 1800, ['NORMAL'])],
};
globalThis.__aoMsg = (o) => {
  if (o.t === 'pvp.info') srv({ t: 'pvp', rank: { posicao: 1452, pontos: 1334 }, ladder: ['befoin', 'Sekhmarra', 'Zaxa'].map((nick, i) => ({ pos: i + 1, posicao: i + 1, pontos: 5900 - i * 50, tierId: 'challenger', nick })), historico: [{ id: 1, oponente: 'badboy', oponentePontos: 1315, criadoEm: new Date().toISOString() }], time: [3] });
  if (o.t === 'ranking.perfil') { const t = TIMES[o.nick]; if (t) setTimeout(() => srv({ t: 'perfil', perfil: { nick: o.nick, level: 3000, pvpTime: t, vitrine: [] } }), 200); }
};
await sleep(1500);
// Auto, para o Piloto ler (cofre ligado)
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(800);
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(500);
await page.evaluate(() => { window.__perfisJogo = []; window.__jogoWs.addEventListener('message', (e) => { if (String(e.data).includes('"t":"perfil"')) window.__perfisJogo.push(JSON.parse(e.data).perfil.nick); }); });
// o ritmo real é 1 perfil a cada 2 min: no teste, força as leituras
const M = () => page.evaluate(() => window.__pokeidleHunt.meta._interno);
await page.evaluate(() => { const m = window.__pokeidleHunt.meta._interno; m.st.ultimoPlacar = 0; m.tique(); });
await sleep(1500);
for (let i = 0; i < 7; i++) { await page.evaluate(() => { const m = window.__pokeidleHunt.meta._interno; m.st.ultimoPerfil = 0; m.tique(); }); await sleep(2500); }
srv({ t: 'perfil', perfil: { nick: 'cliqueDoAndre', level: 10, pvpTime: [], vitrine: [] } }); await sleep(800);
r.perfisQueOJogoViu = await page.evaluate(() => window.__perfisJogo);
// 1.28.1: nick com outra caixa e perfil que chega sem casar o nick (pedido do Piloto em aberto, sem clique) → escondidos; com clique seu → abre
await page.evaluate(() => { window.__perfisJogo = []; window.__pokeidleHunt.pedir({ t: 'ranking.perfil', nick: 'Fulano' }, 'meta'); }); await sleep(4000);
srv({ t: 'perfil', perfil: { nick: 'FULANO', level: 10, pvpTime: [], vitrine: [] } }); await sleep(600);
await page.evaluate(() => window.__pokeidleHunt.pedir({ t: 'ranking.perfil', nick: 'Ciclano' }, 'meta')); await sleep(4000);
srv({ t: 'perfil', perfil: { guild: { nick: 'x' }, nick: 'outroNome', level: 10, pvpTime: [], vitrine: [] } }); await sleep(600);
await page.evaluate(() => window.__pokeidleHunt.pedir({ t: 'ranking.perfil', nick: 'Beltrano' }, 'meta')); await sleep(4000);
await page.mouse.click(5, 5); srv({ t: 'perfil', perfil: { nick: 'perfilQueVoceClicou', level: 10, pvpTime: [], vitrine: [] } }); await sleep(600);
r.perfisEscondidos = await page.evaluate(() => window.__perfisJogo);
r.enviados = recebidos.filter((m) => /pvp.info|ranking.perfil/.test(m.t)).map((m) => m.t + (m.nick ? ':' + m.nick : ''));
r.topo = await page.evaluate(() => { const a = window.__pokeidleHunt.meta.agregar('topo'); return { n: a.n, comp: a.comp.map((x) => `${x.nome}:${Math.round(x.uso * 100)}%`) }; });
r.faixa = await page.evaluate(() => { const a = window.__pokeidleHunt.meta.agregar('faixa'); return { n: a.n, comp: a.comp.map((x) => `${x.nome}:${Math.round(x.uso * 100)}%`) }; });
await page.locator('#p-equipe .plt-time-bt').click(); await sleep(1500);
await page.locator('.plt-janela-time .cfg-cat[data-aba="meta"]').click(); await sleep(2500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/1-meta-topo.png` });
await page.locator('.plt-janela-time [data-escolha="meta:recorte"][data-valor="faixa"]').click(); await sleep(1500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/2-meta-faixa.png` });
r.erros = erros.filter((e) => /error|Error/.test(e) && !/404/.test(e));
// 1.27: a ordem do PvP copiada do topo — quem o topo põe para abrir abre
r.ordem = await page.evaluate(async () => {
  const P = window.__pokeidleHunt; await P.meta.familia.pronta();
  const s = P.meta._interno.estado();
  const k = (id, nome) => ({ speciesId: id, nome, tipos: [], poder: 1000, level: 50, nota: 4 });
  s.placar = { linhas: ['a', 'b', 'c', 'd', 'e'].map((n) => ({ nick: n })), em: Date.now() };
  for (const n of ['a', 'b', 'c', 'd', 'e']) s.perfis[n] = { nick: n, em: Date.now(), time: [k(19, 'Rattata'), k(7, 'Squirtle'), k(5, 'Charmeleon')] };
  const meus = [{ id: 1, speciesId: 4, nome: 'Charmander', poder: 900 }, { id: 2, speciesId: 7, nome: 'Squirtle', poder: 500 }, { id: 3, speciesId: 19, nome: 'Rattata', poder: 100 }, { id: 4, speciesId: 999, nome: 'Outro', poder: 5000 }];
  const o = P.meta.ordemPvp(meus, 'topo');
  return { comMeta: o.comMeta, ordem: o.ordem.map((p) => p.nome) };
});
console.log(JSON.stringify(r, null, 1));
setTimeout(() => process.exit(0), 500); await ctx.close();
