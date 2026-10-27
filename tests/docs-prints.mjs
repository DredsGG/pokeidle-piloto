// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-docs');
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'en'); localStorage.removeItem('piloto:dev:manual'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} if (location.hostname === 'pokeidle.io') window.__plateiaPonte = true; });
await ctx.route(/https:\/\/(www\.twitch\.tv|kick\.com|github\.com)\/.*/, (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);


const r = {};
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
const lista = () => page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return e.pokemons; });
globalThis.__aoMsg = async (o) => {
  if (o.t === 'team.move') { const ps = await lista(); for (const p of ps) if (p.id === o.pokemonId) p.slot = o.slot; srv({ t: 'estado', estado: { pokemons: ps } }); }
  if (o.t === 'centro.ir') srv({ t: 'estado', estado: { noCentro: true } });
  if (o.t === 'hunt.select') srv({ t: 'estado', estado: { noCentro: false, huntSlug: o.slug } });
  if (o.t === 'team.active') srv({ t: 'estado', estado: { activeId: o.pokemonId } });
};
const J = () => page.locator('.plt-janela:not(.plt-janela-time)');
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(2000);
// meta: 5 perfis do topo (para a aba Meta e os do meta no time)
await page.evaluate(async () => {
  const P = window.__pokeidleHunt; await P.meta.familia.pronta();
  const s = P.meta._interno.estado();
  const k = (id, nome, tipos, poder, level) => ({ speciesId: id, nome, tipos, poder, level, nota: 4.2 });
  s.placar = { linhas: ['a', 'b', 'c', 'd', 'e'].map((n) => ({ nick: n })), em: Date.now() };
  const times = [
    [k(5, 'Charmeleon', ['FIRE'], 28000, 2800), k(7, 'Squirtle', ['WATER'], 21000, 2700), k(19, 'Rattata', ['NORMAL'], 12000, 2250)],
    [k(5, 'Charmeleon', ['FIRE'], 27000, 2750), k(7, 'Squirtle', ['WATER'], 20000, 2600), k(4, 'Charmander', ['FIRE'], 9000, 1900)],
    [k(5, 'Charmeleon', ['FIRE'], 29000, 2900), k(19, 'Rattata', ['NORMAL'], 11000, 2100), k(7, 'Squirtle', ['WATER'], 22000, 2800)],
    [k(7, 'Squirtle', ['WATER'], 23000, 2900), k(5, 'Charmeleon', ['FIRE'], 26000, 2600), k(4, 'Charmander', ['FIRE'], 9500, 2000)],
    [k(5, 'Charmeleon', ['FIRE'], 30000, 3000), k(7, 'Squirtle', ['WATER'], 21000, 2700), k(19, 'Rattata', ['NORMAL'], 11500, 2200)],
  ];
  ['a', 'b', 'c', 'd', 'e'].forEach((n, i) => { s.perfis[n] = { nick: n, em: Date.now(), time: times[i] }; });
});
// Caçar (hero)
await page.locator('.plt-cats [data-aba="hunts"]').click(); await sleep(3500);
await J().screenshot({ path: `${SAIDA}/hunt-tab.png` });
await page.locator('.plt-cats [data-aba="rotina"]').click(); await sleep(1500);
await J().screenshot({ path: `${SAIDA}/routine-tab.png` });
// Mercado: uma oferta 60% abaixo aparece e o automático compra
ofertaFake.libera = Date.now() + 15000; ofertaFake.on = true;
await page.locator('.plt-cats [data-aba="mercado"]').click();
for (let i = 0; i < 60 && !recebidos.some((m) => m.t === 'market.comprar'); i++) await sleep(1000);
await sleep(6000);
await J().screenshot({ path: `${SAIDA}/market-tab.png` });
await page.locator('.plt-cats [data-aba="cofre"]').click(); await sleep(1500);
{ const b = await J().boundingBox(); await page.screenshot({ path: `${SAIDA}/vault-tab.png`, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 470) } }); }
// Relatar bug
await page.locator('.plt-cats [data-aba="resumo"]').click(); await sleep(1000);
await page.locator('.plt-janela [data-sup="bug"]').click(); await sleep(1200);
await page.locator('.plt-janela textarea').first().fill('The hunt switch did not move after the rotation').catch(() => {});
await sleep(500);
await J().screenshot({ path: `${SAIDA}/bug-report.png` });
await page.keyboard.press('Escape'); await sleep(400);
// janela Time: time do meta e ordem
await page.evaluate(() => { const t = window.__pokeidleHunt.time._interno; t.st.ultimaTroca = 0; t.st.sessaoFalhouEm = 0; });
await page.locator('#p-equipe .plt-time-bt').click(); await sleep(1500);
for (let i = 0; i < 40; i++) { const ok = await page.evaluate(() => { const T = window.__pokeidleHunt.time; return !T.emSessao() && T.alvoPrincipal().every((id) => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return e.pokemons.find((p) => p.id === id).slot != null; }); }); if (ok) break; await page.evaluate(() => window.__pokeidleHunt.time._interno.tarefaCampo()); await sleep(1500); }
await sleep(2500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/team-window.png` });
await page.evaluate(() => window.__pokeidleHunt.time.abrirAba('meta')); await sleep(2500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/meta-tab.png` });
await page.locator('.plt-janela-time [data-acao="fechar"]').click().catch(() => {}); await sleep(500);
// painel Equipe do jogo: o ⏱ e o cartão
await page.evaluate(async () => {
  let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; });
  const T = window.__pokeidleHunt.time._interno.turnos(); const h = 3_600_000; const n = Date.now();
  T.hist.push({ pkId: 13, nome: 'Squirtle', onde: 'squirtle_1', desde: n - 2.2 * h, ate: n - 1.15 * h, motivo: 'rotation' }, { pkId: 3, nome: 'Charmander', onde: 'rattata_1', desde: n - 1.15 * h, ate: n - 0.35 * h, motivo: 'rotation' });
  if (T.atual) { T.atual.desde = n - 0.35 * h; T.atual.inicio = n - 0.35 * h; T.atual.motivo = 'rodízio'; }
  const t = document.getElementById('time'); t.innerHTML = '';
  for (const p of e.pokemons.filter((k) => k.slot != null).sort((a, b) => a.slot - b.slot)) { const d = document.createElement('div'); d.className = 'poke-linha' + (p.id === e.activeId ? ' ativo' : ''); d.dataset.id = p.id; d.style.cssText = 'padding:6px 8px;margin:4px 0;border-radius:8px;background:#2a2230'; d.innerHTML = `<div class="pl-info"><div class="pl-cabeca"><b style="color:#fff">${p.nome}</b> <span style="color:#d6a7e8">Lv${p.level}</span></div></div>`; t.append(d); }
});
await sleep(1500);
await page.locator('#time .plt-eq-bt').first().click(); await sleep(800);
await page.locator('.plt-eqc').screenshot({ path: `${SAIDA}/turn-card.png` }).catch(() => {});
await page.keyboard.press('Escape'); await sleep(300);
await page.locator('#p-equipe').screenshot({ path: `${SAIDA}/team-panel.png` }).catch(() => {});
// Plateia na janela do bônus da Twitch
await page.evaluate(() => { const m = document.createElement('div'); m.id = 'modal-fake'; m.style.cssText = 'position:fixed;left:40px;top:40px;width:560px;padding:16px;background:#3b2a3f;border:2px solid #7a4a6f;border-radius:12px;z-index:9;color:#fff;font:14px Barlow,sans-serif'; m.innerHTML = '<h3 style="margin:0 0 10px">Twitch</h3><div class="vt-modal tw-modal" id="tw-corpo"><p style="opacity:.8;margin:0">Official channels live now: watch one to get the XP bonus.</p></div>'; document.body.append(m); });
await sleep(1000);
await page.locator('#modal-fake').screenshot({ path: `${SAIDA}/plateia-banner.png` }).catch(() => {});
// 1.31: o Manual (aba Caçar com os ajustes)
await page.evaluate(() => document.getElementById('modal-fake')?.remove());
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela [data-sup="bug-fechar"]').click().catch(() => {}); await sleep(300);
await page.locator('.plt-janela .plt-modo-bt[data-modo="manual"]').click(); await sleep(1500);
await page.locator('.plt-cats [data-aba="hunts"]').click(); await sleep(2500);
{ const b = await J().boundingBox(); await page.screenshot({ path: `${SAIDA}/manual-hunt-tab.png`, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 820) } }); }
r.ok = true;
r.erros = erros.filter((e) => /error|Error/.test(e) && !/404/.test(e));
console.log(JSON.stringify(r));
setTimeout(() => process.exit(0), 500); await ctx.close();
