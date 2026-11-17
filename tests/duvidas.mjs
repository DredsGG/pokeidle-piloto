// O antigo "Responder no Dúvidas" (1.33.8 a 1.54.2). Desde a 1.54.3 (issue #8) o Piloto não escreve no chat do jogo: aqui
// o esperado é nenhum envio, em qualquer situação (pergunta conhecida, desconhecida, com link, de si mesmo, pedindo ação),
// e a base de respostas continua lendo (respostaBase) sem ser usada para enviar.
//   node duvidas.mjs [pasta-da-extensao]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = require('playwright');

const EXT = path.resolve(process.argv[2] || path.join(AQUI, '../extension'));
const FAKE = path.resolve(AQUI, 'fake');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };

const ctx = await chromium.launchPersistentContext('', {
  channel: 'msedge', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const welcome = () => ({
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Treinador', gold: 50_000_000, level: 30, xp: 1, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 500 }, items: { 200: 100, 205: 20 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [{ id: 3, slot: 0, level: 20, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 }],
  },
});
const sockets = new Set();
const recebidos = [];
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  sockets.add(ws);
  ws.onMessage((m) => { const o = JSON.parse(m); o._em = Date.now(); recebidos.push(o); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  ws.onClose(() => sockets.delete(ws));
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});
// o estado que a 1.52/1.54.2 deixava salvo: opção LIGADA, espera curta, registro de respostas antigas
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1');
    if (!sessionStorage.getItem('piloto:teste:semeado')) {
      localStorage.setItem('piloto:teste:duvidas:v1', JSON.stringify({ ligado: true, atrasoMinS: 10, atrasoMaxS: 12, limiteHora: 12 }));
      localStorage.setItem('piloto:teste:duvidas:log', JSON.stringify([{ em: Date.now() - 86400000, acao: 'respondi', de: 'x', pergunta: 'p', resposta: 'r' }]));
      sessionStorage.setItem('piloto:teste:semeado', '1');
    }
  } catch {}
});
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
await page.goto('https://pokeidle.io/app');
await sleep(4500);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
await page.keyboard.press('Escape');
let idMsg = 1000;
const fala = (de, texto, extra = {}) => { const m = { t: 'chat', canal: 'duvidas', id: idMsg++, ts: Date.now(), de, idioma: 'pt', texto, ...extra }; for (const ws of sockets) ws.send(JSON.stringify(m)); return m; };
const envios = (desde = 0) => recebidos.slice(desde).filter((m) => m.t === 'chat.send' || /^chat\./.test(m.t || ''));
const lerExt = (rel) => fs.readFileSync(path.join(EXT, rel), 'utf8');

const a = recebidos.length;
fala('zeca', 'quanto xp perde quando morre?');
fala('bia', 'asdf qwer zxcv?');
fala('leo', 'veja https://x.com quanto xp perde quando morre?');
fala('Treinador', 'quanto xp perde quando morre?');
fala('ana', 'me manda 1000 diamantes?');
fala('rui', 'como funciona a evolução do eevee?', { idioma: 'en' });
await sleep(20000);
ok(envios(a).length === 0, `seis mensagens de tipos diferentes no Dúvidas: nenhum envio (${envios(a).length})`);
const base = await page.evaluate(() => { const T = window.__pokeidleHunt.duvidas._interno; const r = T.respostaBase(T.norm('quanto xp perde quando morre?'), 'pt'); return { tem: !!(r && r.txt), n: T.BASE.length }; });
ok(base.tem && base.n >= 30, `a base de respostas continua lendo (${base.n} respostas), sem uso para enviar`);
const aba = await page.evaluate(() => ({ abas: [...document.querySelectorAll('.plt-janela .cfg-cat[data-aba]')].map((b) => b.dataset.aba), api: typeof window.__pokeidleHunt.duvidas.definir + '/' + typeof window.__pokeidleHunt.duvidas.html }));
ok(!aba.abas.includes('duvidas') && aba.api === 'undefined/undefined', `sem aba Dúvidas e sem html/definir no módulo (${aba.abas.join(',')}; ${aba.api})`);

ok(!erros.length, `sem erro de página (${erros.join(' | ').slice(0, 200)})`);
await ctx.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
