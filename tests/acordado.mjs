// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-acordado');
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
      { id: 40, slot: null, level: 30, xp: 9000, nome: 'Rattata', speciesId: 19, tipos: ['FIRE'], quality: 1.2, potencia: 1, poder: 90000, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 }, maxHp: 1720, hp: 1720 },
      { id: 41, slot: null, level: 30, xp: 9000, nome: 'Squirtle', speciesId: 7, tipos: ['FIRE'], quality: 1.2, potencia: 1, poder: 5000, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 }, maxHp: 1720, hp: 1720 },
    ],
  },
};

const meusFake = [];
const ofertaFake = { on: false };
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  if (globalThis.__mudo) { ws.close({ code: 4001 }).catch(() => {}); return; }
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
await page.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); } catch {} });
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

// 1.40.0: manter o PC acordado
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const abasSw = () => sw.evaluate(async () => (await chrome.storage.session.get('piloto:acordado:abas'))['piloto:acordado:abas'] || {});
const pulsar = async () => { await page.evaluate(() => window.__pokeidleHunt.acordado._interno.pulso()); await sleep(800); };
await pulsar();
let a = await abasSw();
let resp = await page.evaluate(() => window.__pokeidleHunt.acordado._interno.resposta());
ok(Object.keys(a).length === 1 && Object.values(a)[0] > Date.now() + 2 * 60_000, `Auto com o jogo aberto: o fundo segura o PC acordado (${JSON.stringify(a)})`);
ok(resp && resp.suportado && resp.acordado, `a resposta volta para a página (${JSON.stringify(resp)})`);
ok(await sw.evaluate(() => !!chrome.power && typeof chrome.power.requestKeepAwake === 'function'), 'chrome.power existe no Chromium (permissão power)');
// Off: solta na hora
await page.evaluate(() => window.__pokeidleHunt.modo.definir('desligado')); await sleep(1200);
a = await abasSw();
resp = await page.evaluate(() => window.__pokeidleHunt.acordado._interno.resposta());
ok(!Object.keys(a).length && resp && !resp.acordado, `Off: solta na hora (${JSON.stringify(a)}, ${JSON.stringify(resp)})`);
const stOff = await page.evaluate(() => window.__pokeidleHunt.acordado.status());
ok(/só com o Piloto em Manual ou Auto/.test(stOff), `status no Off (${stOff})`);
// volta ao Auto, desliga a opção: solta
await page.evaluate(() => window.__pokeidleHunt.modo.definir('automatico')); await sleep(1200);
ok(Object.keys(await abasSw()).length === 1, 'de volta ao Auto: segura de novo');
await page.evaluate(() => window.__pokeidleHunt.acordado.definir('ligado', false)); await sleep(1200);
ok(!Object.keys(await abasSw()).length, 'opção desligada: solta');
await page.evaluate(() => window.__pokeidleHunt.acordado.definir('ligado', true)); await sleep(1200);
// prazo vencido (aba sumiu sem avisar): o alarme de 1 min solta
await sw.evaluate(async () => { const k = 'piloto:acordado:abas'; const s = await chrome.storage.session.get(k); const a = s[k] || {}; for (const x of Object.keys(a)) a[x] = Date.now() - 1000; await chrome.storage.session.set({ [k]: a }); });
const rv = await sw.evaluate(() => aplicarAcordado());
ok(rv && rv.acordado === false && !Object.keys(await abasSw()).length, `prazo vencido: solta (${JSON.stringify(rv)})`);
// fechar a aba do jogo: tira a aba da lista
await pulsar();
const p2 = await ctx.newPage(); await p2.goto('https://pokeidle.io/app'); await sleep(5000);
await p2.evaluate(() => window.__pokeidleHunt.acordado._interno.pulso()); await sleep(800);
ok(Object.keys(await abasSw()).length === 2, 'duas abas do jogo pedindo');
await p2.close(); await sleep(1000);
ok(Object.keys(await abasSw()).length === 1, 'fechou uma aba: só ela sai da lista');
// a linha na aba Caçar
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .cfg-cat[data-aba="hunts"]').click().catch(() => {}); await sleep(1500);
const lin = await page.evaluate(() => (document.querySelector('[data-linha="acordado"]') || {}).innerText || '');
ok(/Manter o PC acordado/.test(lin) && /o PC não vai dormir/.test(lin), `linha na aba Caçar (${lin.replace(/\s+/g, ' ').slice(0, 120)})`);
await page.locator('[data-linha="acordado"]').screenshot({ path: `${SAIDA}/1-linha.png` }).catch(() => {});
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(400);
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
