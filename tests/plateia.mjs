// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-plateia');
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
    twitch: { login: 'dreds', pct: 20, lives: [], oficiais: [] }, kick: { vinculado: true, login: 'dreds', oficiais: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
    ],
  },
};

const meusFake = [];
const ofertaFake = { on: false };
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} if (location.hostname === 'pokeidle.io' && !/semplateia/.test(location.search)) window.__plateiaPonte = true; });
await ctx.route(/https:\/\/(www\.twitch\.tv|kick\.com)\/.*/, (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: '<title>sala</title>sala falsa' }));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);

const r = {};
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1000);
// 1. ao entrar no jogo (Piloto ligado, Plateia instalada, Twitch e Kick vinculadas): abre as duas salas uma vez
await sleep(14000);
r.janelasAntes = await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length);
r.salasAbertas = await ctx.serviceWorkers()[0].evaluate(async () => { const s = await chrome.storage.local.get(null); const out = []; for (const p of ['twitch', 'kick']) { const id = s[`plateia:janela:${p}`]; if (typeof id === 'number') { const w = await chrome.windows.get(id, { populate: true }).catch(() => null); out.push(p + ':' + (w ? w.type + ':' + (w.focused ? 'foco' : 'sem-foco') : 'sumiu')); } } return out; });
// recarregar o jogo não abre de novo (uma vez por sessão do Chrome)
await page.reload(); await sleep(14000);
r.depoisDoF5 = await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length);
// 1.32.2: a extensão recarregou (o storage.session zera) e o jogo voltou: as salas abertas continuam valendo
await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.session.clear());
await page.reload(); await sleep(14000);
r.depoisDeRecarregarExtensao = await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length);
// fechou a sala da Kick: só ela abre de novo
await ctx.serviceWorkers()[0].evaluate(async () => { const { 'plateia:janela:kick': id } = await chrome.storage.local.get('plateia:janela:kick'); await chrome.windows.remove(id); });
await sleep(500);
const antesKick = await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length);
await page.reload(); await sleep(14000);
r.soAFaltante = (await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length)) - antesKick;
// atualização vinda da 1.32.1 (ids no storage.session, que zerou) com a escala do Windows: as janelas
// das salas existem, mas o Piloto não conhece os ids e o tamanho não é 1440×900 → adota, não abre outra
await ctx.serviceWorkers()[0].evaluate(async () => {
  const s = await chrome.storage.local.get(null);
  for (const p of ['twitch', 'kick']) { const id = s[`plateia:janela:${p}`]; if (typeof id === 'number') await chrome.windows.update(id, { width: 1200, height: 760 }).catch(() => {}); }
  await chrome.storage.local.remove(['plateia:janela:twitch', 'plateia:janela:kick']); await chrome.storage.session.clear();
});
const antesMigr = await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length);
await page.reload(); await sleep(14000);
r.migracao = (await ctx.serviceWorkers()[0].evaluate(async () => (await chrome.windows.getAll()).length)) - antesMigr;
r.migracaoIds = await ctx.serviceWorkers()[0].evaluate(async () => { const s = await chrome.storage.local.get(['plateia:janela:twitch', 'plateia:janela:kick']); return Object.values(s).filter((x) => typeof x === 'number').length; });
let falhasP = 0;
const okP = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhasP++; };
okP(r.depoisDoF5 === r.janelasAntes, `F5 no jogo não abre de novo (${r.janelasAntes} → ${r.depoisDoF5})`);
okP(r.depoisDeRecarregarExtensao === r.janelasAntes, `extensão recarregada não abre de novo (${r.depoisDeRecarregarExtensao})`);
okP(r.soAFaltante === 1, `fechou a Kick: só ela volta (+${r.soAFaltante})`);
okP(r.migracao === 0 && r.migracaoIds === 2, `depois de atualizar (ids perdidos, janela de outro tamanho): adota as abertas, não abre outra (+${r.migracao}, ${r.migracaoIds} adotadas)`);
if (falhasP) process.exitCode = 1;
// 2. a faixa na janela do bônus da Twitch do jogo
await page.evaluate(() => { const m = document.createElement('div'); m.className = 'modal-caixa'; m.innerHTML = '<div class="vt-modal tw-modal" id="tw-corpo">canais...</div>'; document.body.append(m); });
await sleep(800);
r.faixa = await page.evaluate(() => { const f = document.querySelector('.plt-plateia-faixa'); return f && { p: f.dataset.plateia, txt: f.textContent.trim().slice(0, 80), bt: f.querySelector('.plt-plateia-bt').textContent }; });
await page.locator('.plt-plateia-faixa').screenshot({ path: `${SAIDA}/1-faixa-twitch.png` }).catch(() => {});
const n0 = ctx.pages().length;
await page.click('.plt-plateia-faixa .plt-plateia-bt'); await sleep(1500);
r.cliqueAbriu = ctx.pages().length - n0;
// 3. a linha na aba Rotina
await page.evaluate(() => { if (!document.querySelector('.plt-janela:not(.plt-janela-time)')) document.querySelector('button.plt-barra').click(); }); await sleep(800);
await page.locator('.plt-cats [data-aba="rotina"]').click(); await sleep(1200);
r.linhaRotina = await page.evaluate(() => { const l = document.querySelector('.cfg-linha[data-linha="plateia"]'); return l && l.textContent.replace(/\s+/g, ' ').trim().slice(0, 140); });
await page.locator('.cfg-linha[data-linha="plateia"]').screenshot({ path: `${SAIDA}/2-linha-rotina.png` }).catch(() => {});
// 4. sem a Plateia: a faixa vira o link para baixar
const p2 = await ctx.newPage();
await p2.goto('https://pokeidle.io/app?semplateia=1'); await sleep(4000);
await p2.evaluate(() => { const m = document.createElement('div'); m.innerHTML = '<div id="kk-corpo">kick</div>'; document.body.append(m); }); await sleep(800);
r.semPlateia = await p2.evaluate(() => { const f = document.querySelector('.plt-plateia-faixa'); return f && { p: f.dataset.plateia, href: f.querySelector('a') && f.querySelector('a').href }; });
await p2.locator('.plt-plateia-faixa').screenshot({ path: `${SAIDA}/3-faixa-sem-plateia.png` }).catch(() => {});
r.erros = erros.filter((e) => /error|Error/.test(e) && !/404/.test(e));
console.log(JSON.stringify(r, null, 1));
setTimeout(() => process.exit(0), 500); await ctx.close();
