// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-outland');
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
    { slug: 'outland_brave', nome: 'Outland Brave', nivel: 5, regiao: 'outland', area: 'outland', especies: [{ pokeId: 2004, pontos: 50 }, { pokeId: 4, pontos: 2 }] },
    { slug: 'charmander_1', nome: 'Charmander', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 4, pontos: 5 }] },
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 30, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, poder: 3000, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 }, maxHp: 1720, hp: 1720 },
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
// o ritmo real é 1 perfil a cada 2 min: no teste, força as leituras

// 1.31: pokémon da Outland não evolui — fica fora do "serve para o meta" e da hunt do Caçar o meta
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await page.evaluate(() => window.__pokeidleHunt.meta.familia.pronta());
const f = await page.evaluate(() => {
  const F = window.__pokeidleHunt.meta.familia;
  return {
    outlandServe: F.serve({ speciesId: 2004, nome: 'Brave Charmander' }, { speciesId: 5, nome: 'Charmeleon' }),
    normalServe: F.serve({ speciesId: 4, nome: 'Charmander' }, { speciesId: 5, nome: 'Charmeleon' }),
    outlandMesma: F.serve({ speciesId: 2004, nome: 'Brave Charmander' }, { speciesId: 2004, nome: 'Brave Charmander' }),
    membros: F.membrosDoMeta({ speciesId: 5, nome: 'Charmeleon' }).map((m) => m.id),
    ehOutland: [F.ehOutland(2004), F.ehOutland(4)],
  };
});
ok(f.outlandServe === false, `Brave Charmander (Outland) não serve para o Charmeleon do meta (${f.outlandServe})`);
ok(f.normalServe === true, 'Charmander normal serve para o Charmeleon do meta');
ok(f.outlandMesma === true, 'se o meta usa a própria variante Outland, ela serve');
ok(!f.membros.includes(2004) && f.membros.includes(4) && f.membros.includes(5), `família do meta sem a Outland (${f.membros})`);
ok(f.ehOutland[0] === true && f.ehOutland[1] === false, 'reconhece a Outland pelo módulo do jogo');
// alvo antigo (congelado antes da 1.31) com a Outland nos membros: a hunt escolhida é a normal
const h = await page.evaluate(async () => {
  const P = window.__pokeidleHunt;
  let e = null; P.on('estado', (x) => { e = x; });
  const pk = e.pokemons.find((p) => p.id === 3) || e.pokemons[0];
  const alvo = { meta: 'Charmeleon', metaId: 5, raiz: 4, membros: [{ id: 2004, nome: 'Brave Charmander', estagio: 0 }, { id: 4, nome: 'Charmander', estagio: 0 }, { id: 5, nome: 'Charmeleon', estagio: 1 }] };
  const r = await P.metaCaca._interno.escolherHunt(alvo, pk);
  return r && { slug: r.slug, especie: r.especie && r.especie.id };
});
ok(h && h.slug === 'charmander_1' && h.especie === 4, `Caçar o meta vai para a hunt normal, não a da Outland (${JSON.stringify(h)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
