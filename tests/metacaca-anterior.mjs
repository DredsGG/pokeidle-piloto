// Relato #5, ponto 4 (ZaryImortal): no Caçar o meta, quando vem um melhor, o anterior não saía da Coleção;
// e, tirado à mão e mandado para o Depot, ele "voltava". A extensão de verdade num Chromium, na imitação
// do pokeidle.io (cabeçalho igual ao so-bom.mjs).
//   node metacaca-anterior.mjs [pasta-da-extensao]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = require('playwright');

const EXT = path.resolve(process.argv[2] || path.join(AQUI, '../extension'));
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-sobom');
fs.mkdirSync(SAIDA, { recursive: true });
const esperar = async (f, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
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
    { slug: 'charmander_1', nome: 'Charmander', nivel: 10, regiao: 'kanto', especies: [{ pokeId: 4, pontos: 8 }] }, // 1.45.0: o Charmeleon tem hunt (sem ela, vira "não aparece em hunt" e conclui com o que tem)
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 30, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, poder: 3000, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 }, maxHp: 1720, hp: 1720 },
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
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

// ---- relato #5, ponto 4: o anterior sai da Coleção quando vem um melhor ----
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await sleep(1500);
const base = { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 };
const iv = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const charm = { id: 3, slot: 0, level: 30, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], poder: 3000, stats: base, ivs: iv, quality: 1.2, potencia: 1, maxHp: 1720, hp: 1720 };
const fora = (id, speciesId, nome, extra) => ({ id, slot: null, level: 20, nome, speciesId, tipos: ['NORMAL'], poder: 900, stats: base, ivs: iv, quality: 1.0, potencia: 1, maxHp: 500, hp: 500, ...extra });
let lista = [charm];
let colecao = [];
const mandar = async () => { srv({ t: 'estado', estado: { activeId: 3, level: 30, pokemons: lista, automation: { ballIds: [1], potionIds: [200], reviveIds: [205], pokemonTravado: colecao } } }); await sleep(900); };
const tique = () => page.evaluate(async () => { await window.__pokeidleHunt.metaCaca._interno.tique(); });
const descartar = () => page.evaluate(async () => { const I = window.__pokeidleHunt.metaCaca._interno; return I.descartarUm ? I.descartarUm() : 'sem descartarUm'; });
const diario = () => page.evaluate(() => JSON.stringify(window.__pokeidleHunt.cofre.ultimos(60)));
const movidos = (desde) => recebidos.slice(desde).filter((m) => m.t === 'colecao.mover').map((m) => `${m.pokemonId}:${m.para}`);
// a Guarda pronta (sem a análise da janela Time no jogo falso), protegendo só quem o teste disser
const guarda = (ids) => page.evaluate((ids) => { window.__pokeidleHunt.guarda.resumo = () => ({ pronto: true, ids, motivo: '' }); }, ids);
const preparar = () => page.evaluate(() => {
  const P = window.__pokeidleHunt; if (P.auto._interno.cfg().hunt.ligado) P.auto.definir('hunt.ligado', false);
  const I = P.metaCaca._interno; const c = I.cfg();
  c.alvos = [
    { meta: 'Rattata', metaId: 19, raiz: 19, membros: [{ id: 19, nome: 'Rattata', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null },
    { meta: 'Squirtle', metaId: 7, raiz: 7, membros: [{ id: 7, nome: 'Squirtle', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null },
  ];
  c.vistos = [3]; c.ligado = true; c.fim = null; c.soBom = false; c.notaMin = 4; c.descartar = []; c.descartados = []; I.st.escolha = null;
});
await guarda([]);
await preparar();

// 1) o primeiro Rattata (nota 3,0) vai para a Coleção
let n0 = recebidos.length;
lista = [charm, fora(50, 19, 'Rattata', { quality: 1.2 })]; await mandar();
await tique();
await esperar(() => movidos(n0).includes('50:colecao'));
ok(movidos(n0).includes('50:colecao'), `o primeiro Rattata vai para a Coleção (${movidos(n0)})`);
colecao = [50]; await mandar();

// 2) vem um melhor (mais Poder): ele fica no lugar e o anterior sai da Coleção para o Depot
n0 = recebidos.length;
lista = [...lista, fora(51, 19, 'Rattata', { quality: 1.2, poder: 5000, level: 40, stats: { ...base, atk: 300, spAtk: 300 } })]; await mandar();
await tique();
let cap = await page.evaluate(() => window.__pokeidleHunt.metaCaca._interno.cfg().alvos[0].capturadoId);
ok(cap === 51, `o melhor fica no lugar (capturado ${cap})`);
await esperar(() => movidos(n0).includes('51:colecao'));
colecao = [50, 51]; await mandar();
for (let i = 0; i < 3 && !/sai da Coleção/.test(await diario()); i++) { await descartar(); await sleep(700); }
await esperar(() => movidos(n0).includes('50:depot'), 8000);
ok(movidos(n0).includes('50:depot'), `o anterior (50, nota 3,0) sai da Coleção para o Depot (${movidos(n0)})`);
ok(/o anterior Rattata Nv 20 sai da Coleção para o Depot \(veio um melhor\)/.test(await diario()), 'linha no Diário');
colecao = [51]; await mandar();

// 3) no Depot, a rotina não o guarda de novo na Coleção (a proteção "família do alvo")
const depot = () => page.evaluate(async () => {
  const R = window.__pokeidleHunt.rotina._interno; R.cfg().depot.modo = 'vender'; R.cfg().autoColecao.ligado = false;
  const f = R.TAREFAS.find((x) => x.name === 'tarefaDepot'); const m = R.marcas(); m.depot = 0; for (const k of Object.keys(m)) if (k.startsWith('col:')) m[k] = 0;
  return f();
});
n0 = recebidos.length;
await depot();
await esperar(() => recebidos.slice(n0).some((m) => m.t === 'shop.sellAllPokemons'), 8000);
ok(!movidos(n0).includes('50:colecao'), `no Depot, o descartado não volta para a Coleção (${movidos(n0)})`);
const venda = recebidos.slice(n0).find((m) => m.t === 'shop.sellAllPokemons');
ok(!!venda, `e sai na venda do Depot (${JSON.stringify(venda || null)})`);

// 4) o "volta" do relato: um Rattata da família tirado da Coleção à mão (não descartado) a rotina
//    ainda guarda de novo enquanto caça — é a proteção da família, de propósito; o descartado não
lista = [...lista.filter((p) => p.id !== 50), fora(55, 19, 'Rattata', { quality: 1.1 })]; colecao = [51]; await mandar();
await page.evaluate(() => { const c = window.__pokeidleHunt.metaCaca._interno.cfg(); c.vistos = [...c.vistos, 55]; });
n0 = recebidos.length;
await depot();
await esperar(() => movidos(n0).includes('55:colecao'), 8000);
ok(movidos(n0).includes('55:colecao'), `da família, no Depot e não descartado: a rotina guarda na Coleção antes de vender (${movidos(n0)})`);
lista = lista.filter((p) => p.id !== 55); await mandar();

// 5) travas: shiny, nota alta (3,5+), Guarda, time e Nv 50+ na Coleção nunca saem
const troca = async (velho, novo, prot = []) => {
  await guarda(prot);
  // cada troca começa limpa: só o Charmander, o Rattata do meta e o anterior (nenhum Squirtle de antes disputa a vaga)
  lista = [charm, ...lista.filter((p) => p.id === 51), velho]; colecao = [51, velho.id];
  await page.evaluate((id) => { const I = window.__pokeidleHunt.metaCaca._interno; const c = I.cfg(); c.ligado = true; c.fim = null; c.alvos[1].capturadoId = id; c.vistos = [...new Set([...c.vistos, id])]; }, velho.id);
  await mandar();
  const n = recebidos.length;
  lista = [...lista, novo]; await mandar();
  // a volta automática de 10 s do módulo pode estar andando junto (aí a do teste sai na hora) ou já ter
  // concluído (as 2 vagas preenchidas desligam a caça): religa e repete
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { const c = window.__pokeidleHunt.metaCaca._interno.cfg(); c.ligado = true; c.fim = null; }); await tique(); await sleep(500); if (await page.evaluate((id) => window.__pokeidleHunt.metaCaca._interno.cfg().alvos[1].capturadoId === id, novo.id)) break; }
  colecao = [...new Set([...colecao, novo.id])]; await mandar();
  for (let i = 0; i < 3; i++) { await descartar(); await sleep(500); }
  await esperar(() => movidos(n).includes(`${velho.id}:depot`), 3000);
  const cap = await page.evaluate(() => window.__pokeidleHunt.metaCaca._interno.cfg().alvos[1].capturadoId);
  ok(cap === novo.id, `troca ${velho.id} → ${novo.id}: o novo ficou na vaga (${cap})`);
  return movidos(n);
};
const forte = (id) => fora(id, 7, 'Squirtle', { poder: 9000, level: 60, quality: 1.6 });
let mv = await troca(fora(60, 7, 'Squirtle', { shiny: true }), forte(61));
ok(!mv.includes('60:depot'), `shiny anterior fica (${mv})`);
mv = await troca(fora(62, 7, 'Squirtle', { quality: 1.4 }), forte(63));
ok(!mv.includes('62:depot'), `nota alta (3,5) fica (${mv})`);
mv = await troca(fora(64, 7, 'Squirtle', {}), forte(65), [64]);
ok(!mv.includes('64:depot'), `o que a Guarda protege fica (${mv})`);
mv = await troca(fora(66, 7, 'Squirtle', { slot: 1 }), forte(67));
ok(!mv.includes('66:depot'), `quem está no time fica (${mv})`);
mv = await troca(fora(68, 7, 'Squirtle', { level: 55 }), forte(69));
ok(!mv.includes('68:depot'), `Nv 50+ na Coleção fica (${mv})`);
mv = await troca(fora(70, 7, 'Squirtle', {}), forte(71));
ok(mv.includes('70:depot'), `um comum de nota baixa sai (${mv})`);
const dj = await diario();
ok(/fica: é shiny/.test(dj) && /fica: nota alta/.test(dj) && /fica: a Guarda protege/.test(dj) && /fica: está no time/.test(dj) && /fica: na Coleção: Nv 50\+/.test(dj), 'o Diário diz por que cada um ficou');
// nada de Gema ou Diamante: só colecao.mover e a venda do Depot ao NPC
const gasto = recebidos.filter((m) => /gema|diamante|diamond|gem/i.test(JSON.stringify(m)));
ok(!gasto.length, `nenhum pedido com Gema ou Diamante (${gasto.length})`);
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
