// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-colbaixa');
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
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }, { id: 2, nome: 'Great Ball', priceGold: 60, compravel: true, catchRate: 1.5 }, { id: 3, nome: 'Super Ball', priceGold: 150, compravel: true, catchRate: 2 }, { id: 4, nome: 'Ultra Ball', priceGold: 400, compravel: true, catchRate: 2.5 }, { id: 9, nome: 'Beast Ball', priceGold: 5, compravel: true, catchRate: 5 }],
  itensNossos: [],
  hunts: [
    { slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] },
    { slug: 'squirtle_1', nome: 'Squirtle', nivel: 10, regiao: 'kanto', especies: [{ pokeId: 7, pontos: 8 }] },
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 60000, level: 50, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [4], potionIds: [201], reviveIds: [205], autoPotion: true, autoRevive: true, autoVoltarHunt: true, hpLimiar: 0.5, pokemonTravado: [100] }, balls: { 4: 1424 }, items: { 201: 1562, 205: 50 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
      { id: 10, slot: null, level: 28, xp: 1, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 3100, ivs: { hp: 20, atk: 22, def: 18, spAtk: 24, spDef: 18, speed: 20 }, stats: { hp: 95, atk: 60, def: 50, spAtk: 70, spDef: 55, speed: 66 }, maxHp: 1140, hp: 1140 },
      { id: 11, slot: null, level: 9, xp: 1, nome: 'Rattata', speciesId: 19, tipos: ['NORMAL'], quality: 0.9, potencia: 1, poder: 300, ivs: { hp: 8, atk: 8, def: 8, spAtk: 8, spDef: 8, speed: 8 }, stats: { hp: 24, atk: 14, def: 10, spAtk: 8, spDef: 10, speed: 20 }, maxHp: 288, hp: 288 },
      { id: 12, slot: null, level: 6, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.5, potencia: 4, poder: 420, shiny: true, ivs: { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 30, speed: 30 }, stats: { hp: 22, atk: 13, def: 11, spAtk: 14, spDef: 12, speed: 15 }, maxHp: 264, hp: 264 },
      { id: 100, slot: null, level: 20, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.6, potencia: 3, poder: 900, ivs: { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 30, speed: 30 }, stats: { hp: 40, atk: 20, def: 25, spAtk: 22, spDef: 25, speed: 18 }, maxHp: 480, hp: 480 },
      { id: 13, slot: null, level: 33, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.1, potencia: 1, poder: 2200, ivs: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, speed: 15 }, stats: { hp: 80, atk: 40, def: 50, spAtk: 42, spDef: 50, speed: 33 }, maxHp: 960, hp: 960 },
    ],
  },
};

const meusFake = [];
const inv = { balls: { 4: 1424 }, items: { 201: 1562 } };
const setsVistos = [];
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
    // 1.34 (amigo do André, Nv 50): o jogo NÃO deixa marcado um revive/poção/bola que a conta não tem
    // (hipótese do print: 0 revive e nenhum marcado, bola e poção com estoque marcadas)
    if (o.t === 'auto.set') {
      const { t, ...auto } = o;
      auto.ballIds = (auto.ballIds || []).filter((id) => (inv.balls[id] || 0) > 0);
      auto.potionIds = (auto.potionIds || []).filter((id) => (inv.items[id] || 0) > 0);
      auto.reviveIds = (auto.reviveIds || []).filter((id) => (inv.items[id] || 0) > 0);
      setsVistos.push(auto);
      setTimeout(() => ws.send(JSON.stringify({ t: 'estado', estado: { automation: auto } })), 300);
    }
    if (o.t === 'shop.buy') {
      const alvo = o.kind === 'ball' ? inv.balls : inv.items;
      alvo[o.id] = (alvo[o.id] || 0) + Number(o.qty || 0);
      setTimeout(() => ws.send(JSON.stringify({ t: 'estado', estado: { balls: { ...inv.balls }, items: { ...inv.items } } })), 200);
    }
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'en'); localStorage.removeItem('piloto:dev:manual'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} if (location.hostname === 'pokeidle.io') window.__plateiaPonte = true; });
await ctx.route(/https:\/\/(www\.twitch\.tv|kick\.com|github\.com)\/.*/, (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);




// 1.34.1 (pedido do André, 28/10): o que o Auto Coleção guardou na captura abaixo do Nv 50 (o Mercado
// só aceita a partir dele) volta para o Depot; o que já estava na Coleção, o que entrou à mão, shiny,
// P5, Nv 50+ e o que a Guarda protege ficam.
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await page.locator('button.plt-barra').click(); await sleep(1000);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(2500);
await page.keyboard.press('Escape');
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
const estadoAgora = () => page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return JSON.parse(JSON.stringify(e)); });
let e = await estadoAgora();
const novo = (id, o) => ({ id, slot: null, xp: 1, nome: 'Rattata', speciesId: 19, tipos: ['NORMAL'], quality: 1.5, potencia: 2, poder: 400, ivs: { hp: 28, atk: 28, def: 28, spAtk: 28, spDef: 28, speed: 28 }, stats: { hp: 24, atk: 14, def: 10, spAtk: 8, spDef: 10, speed: 20 }, maxHp: 288, hp: 288, ...o });
// capturas novas: 500 (Nv 20, a regra trava na hora), 501 (Nv 60), 502 (shiny Nv 10), 504 (Nv 15, protegido pela Guarda)
const lista = [...e.pokemons, novo(500, { level: 20 }), novo(501, { level: 60 }), novo(502, { level: 10, shiny: true }), novo(504, { level: 15 }), novo(503, { level: 18 })];
srv({ t: 'estado', estado: { pokemons: lista } });
await sleep(400);
srv({ t: 'estado', estado: { automation: { ...e.automation, pokemonTravado: [100, 500, 501, 502, 504] } } });
await sleep(17000);
// 503 entra na Coleção 17 s depois (à mão): fica
srv({ t: 'estado', estado: { automation: { ...e.automation, pokemonTravado: [100, 500, 501, 502, 504, 503] } } });
await sleep(1500);
const regra = await page.evaluate(() => [...window.__pokeidleHunt.rotina._interno.colRegra().keys()].sort());
ok(JSON.stringify(regra) === JSON.stringify([500, 501, 502, 504]), `vistos entrando sozinhos na Coleção: ${JSON.stringify(regra)} (o 100 já estava; o 503 entrou à mão)`);
// Guarda pronta protegendo o 504; análise da janela Time depois das capturas
const antes = recebidos.length;
const movidos = await page.evaluate(async () => {
  const P = window.__pokeidleHunt;
  P.guarda.resumo = () => ({ pronto: true, ids: [504], motivo: '' });
  P.time._interno.st.analise = { em: Date.now(), farmTop: [], pvpTop: [], treinar: [] };
  const R = P.rotina._interno; const f = R.TAREFAS.find((x) => x.name === 'tarefaColecaoBaixa');
  const out = [];
  for (let i = 0; i < 4; i++) { R.marcas().colBaixa = 0; out.push(await f()); }
  return out;
});
await sleep(1500);
const mv = recebidos.slice(antes).filter((m) => m.t === 'colecao.mover');
ok(mv.length === 1 && mv[0].pokemonId === 500 && mv[0].para === 'depot', `só o 500 volta para o Depot: ${JSON.stringify(mv.map((m) => [m.pokemonId, m.para]))} (${JSON.stringify(movidos)})`);
// a trava do gancho: nunca shiny, Nv 50+, fora da Coleção, P5
const recusas = await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  return [502, 501, 11, 100].map((id) => P.pedir({ t: 'colecao.mover', pokemonId: id, para: 'depot' }, 'rotina').ok);
});
await sleep(800);
ok(JSON.stringify(recusas) === JSON.stringify([false, false, false, true]), `gancho: shiny, Nv 60 e fora da Coleção recusados; Nv 20 na Coleção aceito (${JSON.stringify(recusas)})`);
const diario = await page.evaluate(() => (window.__pokeidleHunt.cofre && window.__pokeidleHunt.cofre.diario ? [] : []));
void diario;
const errosReais = erros.filter((x) => !/Failed to load resource/.test(x) && /error|Error/.test(x));
ok(!errosReais.length, `sem erro de página (${errosReais.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
