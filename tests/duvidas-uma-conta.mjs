// Ponto 6 do #5 (várias contas respondendo igual) e issue #8 (banimento do chat). Era o teste do atraso aleatório,
// da trava entre abas e do limite por hora; desde a 1.54.3 o Piloto não envia nada, então o esperado é: com a opção
// salva como ligada, em DUAS abas ao mesmo tempo e com várias perguntas, nenhuma das duas escreve no chat.
//   node duvidas-uma-conta.mjs [pasta-da-extensao]
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

const p2 = await ctx.newPage();
p2.on('pageerror', (e) => erros.push(`pageerror p2 ${String(e)}`));
await p2.goto('https://pokeidle.io/app'); await sleep(4500);
const a = recebidos.length;
const t0 = Date.now();
fala('zeca', 'quanto xp perde quando morre?');
fala('bia', 'qual o melhor jeito de pegar shiny?');
await sleep(2000);
fala('leo', 'quanto xp perde quando morre?');
await sleep(18000);
ok(envios(a).length === 0, `duas abas, três perguntas, espera de 10 a 12 s: nenhuma fala no chat (${envios(a).length} em ${Math.round((Date.now() - t0) / 1000)} s)`);
const est = await Promise.all([page, p2].map((p) => p.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; return { ligado: I.cfg.ligado, pendente: !!I.st.pendente, log: I.log.length, chave: localStorage.getItem('piloto:teste:duvidas:v1') }; })));
ok(est.every((x) => x.ligado === false && x.pendente === false && x.chave === null), `as duas abas desligadas, sem pergunta na espera e sem a chave (${JSON.stringify(est)})`);
ok(est.every((x) => x.log === 1), 'o registro antigo continua com 1 linha: nada novo foi anotado');
const dic = fs.readFileSync(path.join(EXT, 'src/piloto/duvidas.js'), 'utf8');
ok(!/sortearAtraso\(\)\)/.test(dic.replace(/^\s*\/\/.*$/gm, '')) && !/setTimeout\(async/.test(dic), 'não sobrou espera agendada para responder');

ok(!erros.length, `sem erro de página (${erros.join(' | ').slice(0, 200)})`);
await ctx.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
