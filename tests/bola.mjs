// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-bola');
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

// 1.33.4: imita a janela minimizada há mais de 5 min — o Chrome freia o relógio repetido de 250 ms
// para um por minuto. A bola tem de sair mesmo assim (pela mensagem do campo).
await ctx.addInitScript(() => {
  const orig = window.setInterval;
  window.__freados = 0;
  window.setInterval = function (fn, ms, ...a) { if (ms === 250) { window.__freados++; return orig.call(window, fn, 60_000, ...a); } return orig.call(window, fn, ms, ...a); };
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);


const r = {};
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
await page.locator('button.plt-barra').click();
await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click();
await sleep(1500);
await page.locator('.plt-cats [data-aba="hunts"]').click();
await sleep(1200);
// um corpo no chão: a bola sai sozinha
srv({ t: 'campo.init', slug: 'rattata_1', mobs: [] });
const antes = recebidos.length;
srv({ t: 'campo', mobs: [{ s: 77, x: 1, xr: 30000, n: 'Rattata', nv: 5, sh: 0, lt: 19 }] });
await sleep(2500);
r.bola = recebidos.slice(antes).filter((m) => m.t === 'ball.throw').map(({ t, ballId, slot }) => ({ t, ballId, slot }));
// dois corpos juntos: a segunda bola espera o intervalo mínimo (1,3 s) e sai sem o relógio repetido
await page.evaluate(() => { window.__envios = []; window.__pokeidleHunt.on('piloto.enviado', (m) => { if (m && m.t === 'ball.throw') window.__envios.push({ slot: m.slot, em: Date.now() }); }); });
const antes2 = recebidos.length;
srv({ t: 'campo', mobs: [{ s: 78, x: 1, xr: 30000, n: 'Rattata', nv: 5, sh: 0, lt: 19 }, { s: 79, x: 1, xr: 30000, n: 'Rattata', nv: 6, sh: 0, lt: 19 }] });
for (let k = 0; k < 16 && recebidos.slice(antes2).filter((m) => m.t === 'ball.throw').length < 2; k++) await sleep(500);
const th = recebidos.slice(antes2).filter((m) => m.t === 'ball.throw');
r.freados = await page.evaluate(() => window.__freados);
r.envios = await page.evaluate(() => window.__envios); r.capSt = await page.evaluate(() => { const c = window.__pokeidleHunt.captura; return { st: c.status(), corpos: [...c._interno.corpos.keys()] }; }); r.diag = await page.evaluate(() => JSON.parse(localStorage.getItem("piloto:diag:envios") || "null"));
r.minimizada = { bolas: th.map((m) => m.slot), gap: r.envios.length > 1 ? r.envios[1].em - r.envios[0].em : null };
console.log(r.freados > 0 && r.bola.length === 1 && th.length === 2 && r.minimizada.gap >= 1250 ? 'ok   janela minimizada: a bola sai pela mensagem do campo, com o intervalo mínimo' : 'FALHOU minimizada ' + JSON.stringify({ f: r.freados, b: r.bola, m: r.minimizada }));
await sleep(1200);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/1-auto-cacar.png` });
await page.locator('.plt-cats [data-aba="resumo"]').click(); await sleep(1200);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/2-auto-resumo.png` });
await page.locator('.plt-janela .plt-modo-bt[data-modo="manual"]').click(); await sleep(800);
await page.locator('.plt-cats [data-aba="hunts"]').click(); await sleep(1200);
await page.locator('.plt-janela [data-linha="captura"] .cfg-ajuda').click(); await sleep(400);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/3-manual-cacar.png` });
// com VIP: bloqueada
srv({ t: 'estado', estado: { loja: { vip: true, vipAte: Date.now() + 3 * 86400000 } } });
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1800);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/4-vip-bloqueada.png` });
r.vipTravado = await page.evaluate(() => document.querySelector('.plt-janela [data-linha="captura"] .cfg-toggle')?.disabled);
console.log(JSON.stringify(r));
setTimeout(() => process.exit(0), 500); await ctx.close();
