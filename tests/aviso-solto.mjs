// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-solto');
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

// 1.34: conta os pedidos de "procurar atualização" que a página faz
await ctx.addInitScript(() => { window.__checar = 0; document.addEventListener('piloto:upd-pedir', (ev) => { try { if (JSON.parse(ev.detail).acao === 'checar') window.__checar++; } catch {} }); });
// 1.33.6: imitar a aba escondida (janela minimizada) quando o teste pede
await ctx.addInitScript(() => {
  try {
    if (localStorage.getItem('teste:escondida') !== '1') return;
    window.__vis = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis !== 'visible' });
  } catch {}
});
await ctx.addInitScript(() => { try { if (!localStorage.getItem('piloto:idioma')) localStorage.setItem('piloto:idioma', 'pt'); localStorage.removeItem('piloto:dev:manual'); } catch {} if (location.hostname === 'pokeidle.io') window.__plateiaPonte = true; });
await ctx.route(/https:\/\/(www\.twitch\.tv|kick\.com|github\.com)\/.*/, (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
// o fundo procura o Release de verdade (ao abrir, a cada 30 min): no teste a rede do GitHub falha, e a
// falha só grava o erro (o aviso falso do teste fica) — antes, uma procura real no meio apagava o aviso
await ctx.route(/https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\/.*/, (rota) => rota.abort());
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
// Regra 14: guia, novidades e versão nova aparecem SOZINHOS no meio da página do jogo, sem abrir o painel.
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
// o ctx.route não pega o fetch do service worker da extensão: corta ali mesmo a procura real no GitHub
const cortarGithub = () => sw.evaluate(() => { if (self.__fetchOrig) return; self.__fetchOrig = self.fetch; self.fetch = (u, o) => (/api\.github\.com|raw\.githubusercontent\.com/.test(String(u && u.url || u)) ? Promise.reject(new Error('teste: sem GitHub')) : self.__fetchOrig(u, o)); });
await cortarGithub();
const aberto = () => page.evaluate(() => window.__pokeidleHunt.guia && window.__pokeidleHunt.guia.aberto());
const janelaAberta = () => page.evaluate(() => !!document.querySelector('.plt-janela:not(.plt-janela-time)'));
const caixa = () => page.locator('.plt-guia-solto .plt-guia-caixa');
const st = (k) => sw.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k] || null), k);
// o fundo não procura no GitHub de verdade durante o teste (o alarme sobrescreveria o Release simulado)
await sw.evaluate(() => chrome.alarms.clear('piloto-upd'));
const pedidosChecar = () => page.evaluate(() => window.__checar || 0);
const esperar = async (cond, ms = 15000) => { const fim = Date.now() + ms; let a = null; while (Date.now() < fim) { a = await aberto().catch(() => null); if (cond(a)) return a; await sleep(400); } return a; };
const VER = JSON.parse(fs.readFileSync(`${EXT}/manifest.json`, 'utf8')).version;
const updFalso = async (ultima, extra = {}) => { await cortarGithub().catch(() => {}); return updFalso0(ultima, extra); };
const updFalso0 = (ultima, extra = {}) => sw.evaluate(([u, ver, ex]) => chrome.storage.local.set({ 'piloto:update': { checadoEm: Date.now(), atual: ver, instalacao: 'development', disponivel: true, ultima: u, pagina: 'https://github.com/DredsGG/pokeidle-piloto/releases/tag/v' + u, zip: 'https://github.com/DredsGG/pokeidle-piloto/releases/download/v' + u + '/x.zip',
  mudancas: { pt: ['Coisa nova em português.', 'Outra mudança.'], en: ['New thing in English.', 'Another change.'], es: ['Cosa nueva en español.', 'Otro cambio.'] }, notas: '- Release note', ...ex } }), [ultima, VER, extra]);

// 1) instalação nova: o guia aparece sozinho, sem clicar em nada
await page.goto('https://pokeidle.io/app');
await sleep(7000);
let a = await aberto();
ok(a && a.tipo === 'tutorial' && a.solto, `instalação nova: guia sozinho no meio da página (${JSON.stringify(a)})`);
ok(!(await janelaAberta()), 'sem abrir o painel do Piloto');
const bb = await caixa().boundingBox();
const vp = page.viewportSize();
ok(bb && Math.abs(bb.x + bb.width / 2 - vp.width / 2) < 4 && Math.abs(bb.y + bb.height / 2 - vp.height / 2) < 4, `no meio da tela (${bb && Math.round(bb.x)},${bb && Math.round(bb.y)} ${bb && Math.round(bb.width)}×${bb && Math.round(bb.height)})`);
await page.screenshot({ path: `${SAIDA}/1-guia-solto.png` });
// não cobre o resto: clique fora da caixa chega no jogo
const fora = await page.evaluate(() => { const el = document.elementFromPoint(20, innerHeight - 20); return el && !el.closest('.plt-guia'); });
ok(fora, 'fora da caixa o jogo continua clicável (sem fundo que pegue clique)');
// a automação não para: o jogo continua trocando mensagens
await page.evaluate(() => { window.__nEstado = 0; window.__pokeidleHunt.on('estado', () => { window.__nEstado++; }); });
await sleep(2500);
const nEst = await page.evaluate(() => window.__nEstado);
ok(nEst >= 2, `o Piloto segue recebendo o jogo com o quadro aberto (${nEst} estados em 2,5 s)`);
await page.keyboard.press('Escape'); await sleep(500);
ok(!(await aberto()), 'Esc fecha');
ok((await st('piloto:guia'))?.tutorial === true, 'guia visto gravado');
await page.reload(); await sleep(7000);
ok(!(await aberto()), 'recarregar: não volta');

// 2) atualização simulada: novidades sozinhas, uma vez
await sw.evaluate(() => chrome.storage.local.set({ 'piloto:guia': { tutorial: true, novidades: '1.29.1' } }));
// 1.33.6: com a aba escondida não aparece (ninguém veria); aparece quando a pessoa volta
await page.evaluate(() => localStorage.setItem('teste:escondida', '1'));
await page.reload(); await sleep(9000);
ok(!(await aberto()), 'aba escondida: as Novidades esperam');
await page.evaluate(() => { localStorage.removeItem('teste:escondida'); window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
await sleep(2500);
a = await aberto();
ok(a && a.tipo === 'novidades', `a pessoa voltou para a aba: as Novidades aparecem (${JSON.stringify(a)})`);
await page.reload(); await sleep(7000);
a = await aberto();
ok(a && a.tipo === 'novidades' && a.solto, `depois de atualizar: Novidades sozinhas (${JSON.stringify(a)})`);
ok(new RegExp(`Novidades da v${VER.replace(/\./g, '\\.')}`).test(await page.locator('.plt-guia-h').innerText()), `título Novidades da v${VER}`);
await page.screenshot({ path: `${SAIDA}/2-novidades-solto.png` });
await page.locator('.plt-guia-solto [data-guia="fechar"]').click(); await sleep(500);
ok((await st('piloto:guia'))?.novidades === VER, 'X marca a versão vista');
await page.reload(); await sleep(7000);
ok(!(await aberto()), 'novidades só uma vez');

// 3) Release mais novo simulado: "Nova versão" sozinho, em cada idioma
for (const [idi, tit, item] of [['pt', /Nova versão v9\.9\.9/, 'Coisa nova em português.'], ['en', /New version v9\.9\.9/, 'New thing in English.'], ['es', /Nueva versión v9\.9\.9/, 'Cosa nueva en español.']]) {
  await updFalso('9.9.9');
  await page.evaluate((i) => localStorage.setItem('piloto:idioma', i), idi);
  await page.reload();
  a = await esperar((x) => x && x.tipo === 'versao');
  const h = a ? await page.locator('.plt-guia-h').innerText() : '';
  const li = a ? await page.locator('.plt-guia-solto .plt-guia-lista li').first().innerText() : '';
  ok(a && a.tipo === 'versao' && a.solto && tit.test(h) && li === item, `${idi}: versão nova sozinha ("${h}" · "${li}")`);
  await page.screenshot({ path: `${SAIDA}/3-versao-${idi}.png` });
}
await page.evaluate(() => localStorage.setItem('piloto:idioma', 'pt'));
await updFalso('9.9.9');
await page.reload();
ok((await esperar((x) => x && x.tipo === 'versao'))?.tipo === 'versao', 'aparece de novo a cada abertura enquanto não atualiza');
// Atualizar: leva ao jeito certo (por pasta: baixa o zip do Release)
const abas = ctx.pages().length;
await page.locator('.plt-guia-solto [data-guia="atualizar"]').click(); await sleep(2500);
const msg = await page.locator('.plt-guia-solto .plt-guia-msg').innerText().catch(() => '');
ok(/zip novo foi baixado/.test(msg), `Atualizar: instrução do navegador ("${msg.slice(0, 60)}")`);
ok(ctx.pages().length > abas || (await st('piloto:update'))?.baixadoEm, 'Atualizar abriu o download do Release');
await page.screenshot({ path: `${SAIDA}/4-atualizar.png` });
// X esconde até sair uma mais nova
await page.locator('.plt-guia-solto [data-guia="fechar"]').click(); await sleep(800);
ok(!(await aberto()), 'X fecha (só adia: 1 h ou a próxima abertura)');
await updFalso('9.9.9'); // o fundo pode ter procurado de verdade no GitHub depois do "Atualizar"
await page.reload();
const dbgA = await esperar((x) => x && x.tipo === 'versao');
if (!(dbgA && dbgA.tipo === 'versao')) console.log('DBG', JSON.stringify(await page.evaluate(() => ({ a: window.__pokeidleHunt.guia.aberto(), vn: window.__pokeidleHunt.guia.versaoNova(), est: window.__pokeidleHunt.guia.estado(), ver: document.documentElement.dataset.pilotoVersao }))), JSON.stringify(await st('piloto:update')).slice(0, 400));
ok(dbgA?.tipo === 'versao', 'X só adia: na próxima abertura volta (regra 14 de 27/10)');
await sleep(2200); await page.keyboard.press('Escape'); await sleep(800);
await updFalso('9.9.10', { dispensada: '9.9.9' });
await page.reload();
ok((await esperar((x) => x && x.tipo === 'versao'))?.tipo === 'versao', 'versão mais nova: volta a aparecer');
// 1.33.6: Esc logo que o quadro aparece era para outra coisa — não fecha nem marca como visto
await page.keyboard.press('Escape'); await sleep(200);
ok((await aberto())?.tipo === 'versao', 'Esc nos primeiros 2 s não fecha o quadro que acabou de aparecer');
await sleep(2200);
await page.keyboard.press('Escape'); await sleep(2000); // o X/Esc grava a versão escondida no fundo: espera antes de simular a próxima
ok(!(await aberto()), 'depois de 2 s o Esc fecha');
// Firefox pelo .xpi (atualiza sozinho): não aparece
await updFalso('9.9.11', { autoAtualiza: true });
await page.reload(); await sleep(7000);
ok(!(await aberto()), 'Firefox assinado (atualiza sozinho): sem aviso');
// sem changelog no Release (antigo): usa as notas
await updFalso('9.9.12', { mudancas: null, notas: '## Changes\n- Old style note' });
await page.reload(); await sleep(7000);
ok(await page.locator('.plt-guia-solto .plt-guia-lista li').first().innerText().catch(() => '') === 'Old style note', 'sem changelog.json: as notas do Release');
await page.keyboard.press('Escape'); await sleep(300);
// 1.34 (regra 14, 27/10): com a página JÁ aberta, Release novo aparece sem recarregar; o X só adia
// (volta depois de 1 h e na próxima abertura); URGENTE não tem X e pausa a automação.
await page.evaluate(() => localStorage.setItem('piloto:idioma', 'pt'));
await updFalso('9.9.19', { autoAtualiza: false });
await page.reload(); await sleep(7000);
if (await aberto()) { await page.keyboard.press('Escape'); await sleep(2500); }
ok((await pedidosChecar()) >= 1, `ao abrir a página, pede a checagem do GitHub (${await pedidosChecar()})`);
await updFalso('9.9.20');
a = await esperar((x) => x && x.tipo === 'versao');
ok(a && a.tipo === 'versao', 'Release novo com a página aberta: aparece sem recarregar');
await sleep(2200);
await page.locator('.plt-guia-solto [data-guia="fechar"]').click(); await sleep(800);
ok(!(await aberto()), 'X fecha');
const adiado = await page.evaluate(() => window.__pokeidleHunt.guia._interno.adiadoAte() - Date.now());
ok(adiado > 59 * 60_000 && adiado <= 60 * 60_000, `X adia 1 h (${Math.round(adiado / 60000)} min)`);
ok((await st('piloto:update'))?.dispensada !== '9.9.20', 'X não esconde a versão para sempre');
await page.evaluate(() => window.__pokeidleHunt.guia._interno.voltarJa());
a = await esperar((x) => x && x.tipo === 'versao', 40000);
ok(a && a.tipo === 'versao', 'passada 1 h: o aviso volta sozinho');
await sleep(2200);
await page.locator('.plt-guia-solto [data-guia="fechar"]').click(); await sleep(800);
await page.reload();
ok((await esperar((x) => x && x.tipo === 'versao'))?.tipo === 'versao', 'próxima abertura: o aviso volta');
await sleep(2200); await page.keyboard.press('Escape'); await sleep(800);
// voltar para a aba pede a checagem (no máximo 1 a cada 10 min: quem segura é o fundo)
const antesVis = await pedidosChecar();
await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
await sleep(500);
ok((await pedidosChecar()) > antesVis, 'voltar para a aba pede a checagem');
// URGENTE
await updFalso('9.9.21', { urgente: true, titulo: 'v9.9.21 URGENTE' });
a = await esperar((x) => x && x.tipo === 'versao');
await sleep(2500);
const temX = await page.locator('.plt-guia-solto [data-guia="fechar"]').count();
const tituloU = await page.locator('.plt-guia-h').innerText().catch(() => '');
ok(a && a.tipo === 'versao' && temX === 0 && /urgente/i.test(tituloU), `URGENTE: quadro sem X ("${tituloU}")`);
await page.keyboard.press('Escape'); await sleep(800);
ok((await aberto())?.tipo === 'versao', 'URGENTE: Esc não fecha');
const ped = await page.evaluate(() => window.__pokeidleHunt.pedir({ t: 'centro.ir' }, 'teste'));
ok(!ped.ok && /urgente/.test(ped.motivo), `URGENTE: a automação pausa (${ped.motivo})`);
await page.screenshot({ path: `${SAIDA}/5-urgente.png` });
// fora da página do jogo (ex.: /terms, que a vigia usa): nada aparece
await updFalso('9.9.13');
await page.goto('https://pokeidle.io/terms'); await sleep(6000);
ok(!(await page.evaluate(() => !!document.querySelector('.plt-guia-solto'))), 'fora do /app: nada aparece');
ok(erros.filter((e) => /TypeError|ReferenceError|pageerror/.test(e)).length === 0, `sem erro de página (${erros.filter((e) => /Error/.test(e)).slice(0, 2).join(' | ')})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
