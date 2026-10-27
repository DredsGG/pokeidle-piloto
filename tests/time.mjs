// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-time');
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); } catch {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);


const r = {};
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
// o servidor falso aplica o team.move na lista inteira
const lista = () => page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return e.pokemons; });
globalThis.__aoMsg = async (o) => {
  if (o.t === 'team.move') { const ps = await lista(); for (const p of ps) if (p.id === o.pokemonId) p.slot = o.slot; srv({ t: 'estado', estado: { pokemons: ps } }); }
  if (o.t === 'centro.ir') srv({ t: 'estado', estado: { noCentro: true } });
  if (o.t === 'hunt.select') srv({ t: 'estado', estado: { noCentro: false, huntSlug: o.slug } });
  if (o.t === 'team.active') srv({ t: 'estado', estado: { activeId: o.pokemonId } });
};
await sleep(1500);
r.botao = await page.locator('#p-equipe .plt-time-bt').count();
await page.locator('#p-equipe').screenshot({ path: `${SAIDA}/0-botao.png` }).catch(() => {});
await page.locator('#p-equipe .plt-time-bt').click();
await sleep(2500);
r.janela = await page.evaluate(() => { const j = document.querySelector('.plt-janela-time'); return j && { pos: getComputedStyle(j).position, cards: j.querySelectorAll('.plt-pk').length, canvas: j.querySelectorAll('.plt-pk-arte canvas, .plt-pk-arte span').length }; });
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/1-campo.png` });
// liga montar sozinho (modo Manual)
const antes = recebidos.length;
await page.locator('.plt-janela-time [data-alternar="time:principalAuto"]').click();
await page.evaluate(() => window.__pokeidleHunt.time._interno.tarefaCampo());
await sleep(5000);
r.trocas = recebidos.slice(antes).filter((m) => m.t === 'team.move' || m.t === 'colecao.mover').map((m) => `${m.t}:${m.pokemonId}:${m.slot ?? m.para}`);
await sleep(1500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/2-campo-auto.png` });
// cadeado
await page.locator('.plt-janela-time [data-travar^="time:"]').first().click(); await sleep(500);
r.travados = await page.evaluate(() => window.__pokeidleHunt.time.travados());
r.pvpAlvo = await page.evaluate(() => window.__pokeidleHunt.rotina.equipePvpAlvo());
r.campo = await page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return e.pokemons.filter((p) => p.slot != null).map((p) => p.id); });
r.pvpLigado = await page.evaluate(() => window.__pokeidleHunt.rotina._interno.cfg().pvp.time);
// rodízio: um de cada vez (com a Troca de hunt ligada, não precisa matar aqui)
for (let i = 0; i < 30 && await page.evaluate(() => window.__pokeidleHunt.time.emSessao() || !!window.__pokeidleHunt.auto.rotinaAtual()); i++) await sleep(1000);
const antesR = recebidos.length;
await page.evaluate(async () => { const R = window.__pokeidleHunt.rotina; R.definir('rodizio.ligado', true); R._interno.marcas().rodizio = 0; const T = window.__pokeidleHunt.time._interno.turnos(); if (T.atual) { T.atual.inicio = Date.now() - 2 * 3_600_000; T.atual.desde = T.atual.inicio; } window.__pokeidleHunt.auto._interno.cfg().hunt.ligado = true; await R._interno.TAREFAS.find((f) => f.name === 'tarefaRodizio')(); });
for (let i = 0; i < 15 && !recebidos.slice(antesR).some((m) => m.t === 'hunt.select'); i++) await sleep(1000);
r.rodizio = recebidos.slice(antesR).filter((m) => m.t === 'team.active').map((m) => m.pokemonId);
// 1.28: com a Troca de hunt ligada, o rodízio troca no Centro e sai direto para a melhor hunt do que entrou
r.rodizioSeq = recebidos.slice(antesR).filter((m) => ['centro.ir', 'team.active', 'hunt.select'].includes(m.t)).map((m) => m.t + ':' + (m.pokemonId ?? m.slug ?? ''));
await sleep(1500);
r.turnos = await page.evaluate(() => { const t = window.__pokeidleHunt.time._interno.turnos(); return { atual: t.atual && `${t.atual.nome}@${t.atual.onde}:${t.atual.motivo}`, n: t.hist.length, ult: t.hist.slice(-3).map((h) => `${h.nome}@${h.onde}`) }; });
r.chipAgora = await page.evaluate(() => (document.querySelector('.plt-janela-time .plt-turno-agora') || {}).textContent || null);
// 1.28.1: o timer no painel Equipe do jogo (linhas no formato do jogo: #time > .poke-linha[data-id] > .pl-info > .pl-cabeca)
r.equipeJogo = await page.evaluate(async () => {
  let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; });
  const montar = () => { const t = document.getElementById('time'); t.innerHTML = ''; for (const p of e.pokemons.filter((k) => k.slot != null)) { const d = document.createElement('div'); d.className = 'poke-linha'; d.dataset.id = p.id; d.innerHTML = `<div class="pl-info"><div class="pl-cabeca"><b>${p.nome}</b><span>P1</span></div><div class="mini-hp"></div></div>`; t.append(d); } };
  montar(); await new Promise((r) => setTimeout(r, 16000));
  const antes = [...document.querySelectorAll('#time .plt-eq-turno')].map((x) => (x.classList.contains('agora') ? '*' : '') + x.textContent);
  montar(); await new Promise((r) => setTimeout(r, 600)); // o jogo refez as linhas: volta sozinho
  const depois = document.querySelectorAll('#time .plt-eq-turno').length;
  const prox = window.__pokeidleHunt.rotina.proximoRodizio();
  window.__cliqueNaLinha = 0; for (const l of document.querySelectorAll('#time .poke-linha')) l.addEventListener('click', () => { window.__cliqueNaLinha++; });
  return { antes, depois, prox };
});
// 1.29: o botãozinho ⏱ abre o cartão com tudo, sem trocar o ativo (o clique não chega na linha do jogo)
await page.locator('#time .plt-eq-bt').nth(1).click(); await sleep(600);
r.cartao = await page.evaluate(() => ({ aberto: !!document.querySelector('.plt-eqc'), txt: (document.querySelector('.plt-eqc') || {}).innerText || '', linha: window.__cliqueNaLinha }));
await page.locator('.plt-eqc').screenshot({ path: `${SAIDA}/9-cartao-turno.png` }).catch(() => {});
await page.locator('#p-equipe').screenshot({ path: `${SAIDA}/8-equipe-jogo.png` }).catch(() => {});
await page.evaluate(() => {
  const t = window.__pokeidleHunt.time._interno.turnos(); const h = 3_600_000; const n = Date.now();
  t.hist.push({ pkId: 3, nome: 'Charmander', onde: 'squirtle_1', desde: n - 3.2 * h, ate: n - 2.1 * h, motivo: 'rodízio' }, { pkId: 13, nome: 'Squirtle', onde: 'rattata_1', desde: n - 2.1 * h, ate: n - 1.05 * h, motivo: 'rodízio' }, { pkId: 3, nome: 'Charmander', onde: 'rattata_1', desde: n - 1.05 * h, ate: n - 0.6 * h, motivo: 'o jogo ou você (desmaiou?)' });
  t.atual.desde = n - 0.6 * h;
  window.__pokeidleHunt.time.abrirAba('time');
});
await sleep(2500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/6-turnos-topo.png` });
await page.evaluate(() => { const c = document.querySelector('.plt-janela-time .cfg-linhas') || document.querySelector('.plt-janela-time [data-conteudo]'); if (c) c.scrollTop = c.scrollHeight; }); await sleep(800);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/7-turnos-fim.png` });
r.proximo = await page.evaluate(() => window.__pokeidleHunt.rotina.proximoRodizio());
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/3-time.png` });
// 1.26: a aba Analisar saiu da janela; a análise segue por dentro (para a venda automática)
r.abaAnalisar = await page.locator('.plt-janela-time .cfg-cat[data-aba="analisar"]').count();
await page.evaluate(() => window.__pokeidleHunt.time.analisar());
await sleep(4000);
r.analise = await page.evaluate(() => { const a = window.__pokeidleHunt.time._interno.st.analise; return a && { n: a.n, farm: a.farmTop.map((l) => l.p.nome + ':' + Math.round(l.farm)), pvp: a.pvpTop.map((l) => l.p.nome), treinar: a.treinar.map((l) => `${l.p.nome}:${l.poder}->${Math.round(l.pot.v)}:${l.pot.como}`), erro: a.erro }; });
// 1.26: os do meta que você tem entram primeiro (Mega X conta como X), mesmo com menos Poder
r.meta = await page.evaluate(async () => {
  const P = window.__pokeidleHunt;
  await P.meta.familia.pronta();
  let e = null; P.on('estado', (x) => { e = x; });
  const meus = e.pokemons.filter((p) => p.stats && p.poder > 0);
  const fraco = meus.slice().sort((a, b) => a.poder - b.poder)[0];
  const antes = P.time.alvoPrincipal();
  P.meta.agregar = () => ({ n: 5, lista: [], comp: [{ speciesId: 3000 + fraco.speciesId, nome: 'Mega ' + fraco.nome }] });
  return { fraco: fraco.id + ':' + fraco.nome, antesTinha: antes.includes(fraco.id), doMeta: P.time.doMeta(), depois: P.time.alvoPrincipal(), temNoAlvo: P.time.alvoPrincipal().includes(fraco.id) };
});
await page.evaluate(() => window.__pokeidleHunt.time.abrirAba('time')); await sleep(1500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/4-time-meta.png` });
// 1.26: quem completou o Caçar o meta na 1.24/1.25 (5 no cadeado, Troca de hunt desligada):
// depois do recarregar, o cadeado sai, o time segue os do meta e a Troca de hunt liga.
await page.evaluate(() => {
  const ids = window.__pokeidleHunt.time.alvoPrincipal().slice(0, 3);
  localStorage.setItem('piloto:metacaca:v1', JSON.stringify({ ligado: false, recorte: 'topo', alvos: [], vistos: [], desde: 1, fim: { em: Date.now(), ids } }));
  const t = JSON.parse(localStorage.getItem('piloto:time:v1') || '{}'); t.travados = { time: ids }; localStorage.setItem('piloto:time:v1', JSON.stringify(t));
  localStorage.removeItem('piloto:migr:meta126');
  const a = JSON.parse(localStorage.getItem('pokeidle-hunt:auto:v1') || '{}'); a.hunt = { ...(a.hunt || {}), ligado: false }; localStorage.setItem('pokeidle-hunt:auto:v1', JSON.stringify(a));
});
await page.reload(); await sleep(26_000);
r.migracao = await page.evaluate(() => ({ travados: window.__pokeidleHunt.time.travados(), doMeta: window.__pokeidleHunt.time._interno.cfg().doMeta, hunt: window.__pokeidleHunt.auto._interno.cfg().hunt.ligado, marca: localStorage.getItem('piloto:migr:meta126') }));
// 1.26.3: serve para o meta quem é ou EVOLUI até ele (o Pupitar do Tyranitar), Mega conta como base
r.serve = await page.evaluate(() => { const F = window.__pokeidleHunt.meta.familia; return {
  charmanderParaMegaCharmeleon: F.serve({ speciesId: 4, nome: 'Charmander' }, { speciesId: 3005, nome: 'Mega Charmeleon' }),
  charmeleonParaCharmander: F.serve({ speciesId: 5, nome: 'Charmeleon' }, { speciesId: 4, nome: 'Charmander' }),
  megaParaBase: F.serve({ speciesId: 3005, nome: 'Mega Charmeleon' }, { speciesId: 5, nome: 'Charmeleon' }),
  membros: F.membrosDoMeta({ speciesId: 3005, nome: 'Mega Charmeleon' }).map((m) => m.nome + ':' + m.estagio) }; });
// 1.26.2: troca com o time cheio, na ordem do jogo — marca quem sai na Coleção, tira, põe o do meta
let recusar = false;
globalThis.__aoMsg = async (o) => {
  if (o.t === 'team.move') {
    if (recusar) { srv({ t: 'erro', msg: 'teste: o servidor recusou' }); return; }
    const ps = await lista(); for (const p of ps) if (p.id === o.pokemonId) p.slot = o.slot; srv({ t: 'estado', estado: { pokemons: ps } });
  }
  if (o.t === 'centro.ir') srv({ t: 'estado', estado: { noCentro: true } });
  if (o.t === 'hunt.select') srv({ t: 'estado', estado: { noCentro: false, huntSlug: o.slug } });
  if (o.t === 'colecao.mover') {
    const col = await page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return (e.automation && e.automation.pokemonTravado) || []; });
    srv({ t: 'estado', estado: { automation: { pokemonTravado: [...new Set([...col, o.pokemonId])] } } });
  }
};
{
  const ps = await lista();
  const slots = { 3: 0, 4: 1, 10: 2, 12: 3, 13: 4 };
  for (const p of ps) p.slot = p.id in slots ? slots[p.id] : null;
  srv({ t: 'estado', estado: { pokemons: ps, activeId: 3, automation: { pokemonTravado: [] } } });
  await sleep(800);
  srv({ t: 'estado', estado: { noCentro: false, huntSlug: 'rattata_1', centroLivreEm: 0 } });
  await sleep(500);
  await page.evaluate(() => { const P = window.__pokeidleHunt; P.meta.agregar = () => ({ n: 5, lista: [], comp: [{ speciesId: 3019, nome: 'Mega Rattata' }] }); P.time._interno.st.ultimaTroca = 0; P.time._interno.st.motivo = ''; P.time._interno.st.sessaoFalhouEm = 0; P.auto.definir('hunt.ligado', true); });
  const a0 = recebidos.length;
  await page.evaluate(() => window.__pokeidleHunt.time._interno.tarefaCampo());
  await sleep(1500);
  r.sessaoNoMeio = await page.evaluate(() => ({ sessao: window.__pokeidleHunt.time.emSessao(), hunt: window.__pokeidleHunt.auto._interno.cfg().hunt.ligado }));
  await sleep(9000);
  r.trocaCheia = recebidos.slice(a0).filter((m) => ['team.move', 'colecao.mover', 'centro.ir', 'centro.curar', 'hunt.select'].includes(m.t)).map((m) => `${m.t}:${m.pokemonId ?? m.slug ?? ''}:${m.slot ?? m.para ?? ''}`);
  r.poll = [];
  for (let k = 0; k < 4; k++) { r.poll.push(await page.evaluate(() => { const st = window.__pokeidleHunt.time._interno.st; let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return JSON.stringify({ et: st.sessao && st.sessao.etapa, tr: !!st.troca, nc: e.noCentro, m: st.motivo }); })); await sleep(1000); }
  r.sessaoFim = await page.evaluate(() => ({ sessao: window.__pokeidleHunt.time.emSessao(), hunt: window.__pokeidleHunt.auto._interno.cfg().hunt.ligado, rotina: window.__pokeidleHunt.auto.rotinaAtual() }));
  r.campoDepois = (await lista()).filter((p) => p.slot != null).map((p) => p.id).sort((x, y) => x - y);
  // recusa do servidor: aparece o motivo e espera 2 min
  const ps2 = await lista();
  const fora = ps2.find((p) => p.slot == null && p.stats);
  recusar = true;
  await page.evaluate((id) => { const P = window.__pokeidleHunt; P.time._interno.st.ultimaTroca = 0; P.time._interno.st.motivo = ''; P.meta.agregar = () => ({ n: 5, lista: [], comp: [{ speciesId: 3019, nome: 'Mega Rattata' }, { speciesId: 9999, nome: 'x' }] }); }, fora && fora.id);
  r.recusa = await page.evaluate(async () => {
    const T = window.__pokeidleHunt.time._interno;
    // força uma troca qualquer para ver a recusa
    let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; });
    const fora = e.pokemons.find((p) => p.slot == null && p.stats);
    const dentro = e.pokemons.find((p) => p.slot != null && p.id !== e.activeId && p.id !== 11);
    T.st.troca = { entra: fora.id, nomeEntra: fora.nome, sai: dentro.id, etapa: 'sair', desde: Date.now(), em: Date.now() - 9000 };
    window.__pokeidleHunt.pedir({ t: 'team.move', pokemonId: dentro.id, slot: null }, 'time');
    await new Promise((r) => setTimeout(r, 2500));
    T.st.troca.desde = Date.now() - 46_000;
    T.andarTroca();
    return { motivo: T.st.motivo, troca: T.st.troca };
  });
  recusar = false;
}
r.erros = erros.filter((e) => /error|Error/.test(e) && !/404/.test(e));
console.log(JSON.stringify(r));
setTimeout(() => process.exit(0), 500); await ctx.close();
