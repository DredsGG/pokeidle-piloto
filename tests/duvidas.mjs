// 1.33.8 (build de teste): o respondedor do canal Dúvidas. Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-duvidas');
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


await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  globalThis.__ws = ws;
  ws.onMessage((m) => { const o = JSON.parse(m); o._em = Date.now(); recebidos.push(o); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); if (o.t && o.t.startsWith('market.')) ws.send(JSON.stringify({ t: 'market', aba: 'itens', resumo: {}, medias: {} })); });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); localStorage.setItem('piloto:idioma', 'pt'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
let idMsg = 1;
const fala = (de, texto, extra = {}) => srv({ t: 'chat', canal: 'duvidas', id: idMsg++, ts: Date.now(), de, idioma: 'pt', texto, ...extra });
const falas = (desde) => recebidos.slice(desde).filter((m) => m.t === 'chat.send');
// liga o Piloto (Auto): o cofre só deixa sair com o Piloto ligado
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1500);

// a base, sem rede
const base = await page.evaluate(async () => {
  const T = window.__pokeidleHunt.testeDuvidas._interno;
  const q = (s) => T.respostaBase(T.norm(s), 'pt');
  return {
    morte: q('quanto xp perde quando morre?'),
    regiao: q('qual nivel libera johto?'),
    nada: q('alguém quer trocar um shiny?'),
    pergunta1: T.ehPergunta(T.norm('como faço pra capturar')),
    pergunta2: T.ehPergunta(T.norm('bom dia galera')),
    evo: await T.respostaEvo(T.norm('qual pedra pra evoluir o charmander?'), 'pt'),
  };
});
ok(base.morte && base.morte.id === 'xp-morte', `base: perder XP ao morrer (${JSON.stringify(base.morte)})`);
ok(base.regiao && base.regiao.id === 'regioes', 'base: nível das regiões');
ok(!base.nada, 'base: o que não é dúvida conhecida não tem resposta');
ok(base.pergunta1 && !base.pergunta2, 'detecta pergunta (e "bom dia" não é)');
ok(base.evo && /Charmeleon/.test(base.evo.txt) && /Fire Stone/.test(base.evo.txt), `evolução pelos módulos do jogo: "${base.evo && base.evo.txt}"`);

// 0) 1.37.0: na versão pública vem DESLIGADO de fábrica — uma pergunta conhecida não é respondida
let a = recebidos.length;
fala('bia', 'quanto xp perde quando morre?');
await sleep(23000);
ok(!falas(a).length, 'desligado de fábrica: não responde');
await page.evaluate(() => window.__pokeidleHunt.duvidas.definir('ligado', true));
await page.evaluate(() => { const st = window.__pokeidleHunt.duvidas._interno.st; st.ultimaEm = 0; st.porNick.clear(); st.porResposta.clear(); });

// 1) ligado: pergunta conhecida responde depois de 20 s, no Dúvidas, marcando a pessoa
a = recebidos.length;
fala('zeca', 'quanto xp perde quando morre?');
await sleep(23000);
let f = falas(a);
console.log('LOG', await page.evaluate(() => JSON.stringify(window.__pokeidleHunt.testeDuvidas._interno.log.slice(0, 3))));
ok(f.length === 1 && f[0].canal === 'duvidas' && /^@zeca desmaiar/.test(f[0].texto) && f[0].idioma === 'pt', `respondeu: ${JSON.stringify(f.map((x) => x.texto))}`);

// 2) logo depois: segura 5 min (não responde outra)
a = recebidos.length;
fala('bia', 'qual nivel libera johto?');
await sleep(22000);
ok(falas(a).length === 0, 'menos de 5 min da última: não responde');

// 3) outra pessoa falou antes dos 20 s: não responde (zera a trava de 5 min para testar)
await page.evaluate(() => { window.__pokeidleHunt.testeDuvidas._interno.st.ultimaEm = 0; });
a = recebidos.length;
fala('caio', 'como capturar pokemon?');
await sleep(3000);
fala('dani', 'é só jogar a bola no corpo');
await sleep(21000);
ok(falas(a).length === 0, 'alguém respondeu antes: não responde');

// 4) histórico antigo (ts de 5 min atrás): ignora
await page.evaluate(() => { window.__pokeidleHunt.testeDuvidas._interno.st.ultimaEm = 0; });
a = recebidos.length;
fala('edu', 'qual nivel libera hoenn?', { ts: Date.now() - 5 * 60_000 });
await sleep(22000);
ok(falas(a).length === 0, 'mensagem antiga (histórico ao entrar): não responde');

// 5) o gancho: só o Dúvidas, nada de link
const g = await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  return { mundo: P.pedir({ t: 'chat.send', canal: 'mundo', idioma: 'pt', texto: 'oi' }, 'duvidas').ok, link: P.pedir({ t: 'chat.send', canal: 'duvidas', idioma: 'pt', texto: 'veja https://x.com' }, 'duvidas').ok };
});
ok(!g.mundo && !g.link, 'gancho recusa outro canal e link');

// 6) 1.36.2: a aba Dúvidas (entre as principais) mostra só pergunta + resposta; o resto fica guardado
await page.locator('.plt-cats [data-aba="duvidas"]').click(); await sleep(1200);
const aba = await page.evaluate(() => ({ txt: document.querySelector('.plt-janela [data-conteudo]').innerText, qa: document.querySelectorAll('.plt-janela .plt-tdu-qa').length, outras: document.querySelectorAll('.plt-janela .plt-tdu-l').length, log: window.__pokeidleHunt.testeDuvidas._interno.log.filter((x) => x.acao !== 'respondi').length }));
ok(/Responder no Dúvidas/.test(aba.txt) && aba.qa >= 1 && aba.outras === 0 && aba.log >= 1, `aba Dúvidas: só as respondidas na tela (${aba.qa}), o resto guardado (${aba.log})`);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/1-aba-duvidas.png` });
ok(!erros.length, `sem erro de página (${erros.join(' | ').slice(0, 200)})`);
console.log(falhas ? `FALHARAM ${falhas}` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
