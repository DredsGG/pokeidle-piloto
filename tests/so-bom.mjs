// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
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

// 1.45.0: Caçar o meta com "Só aceitar um bom" (nota do jogo acima do corte; shiny e P5 passam)
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await sleep(1500);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(800);
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(500);
const base = { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 };
const iv = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const charm = { id: 3, slot: 0, level: 30, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], poder: 3000, stats: base, ivs: iv, quality: 1.2, potencia: 1, maxHp: 1720, hp: 1720 };
const fora = (id, speciesId, nome, extra) => ({ id, slot: null, level: 20, nome, speciesId, tipos: ['NORMAL'], poder: 900, stats: base, ivs: iv, quality: 1.0, potencia: 1, maxHp: 500, hp: 500, ...extra });
let lista = [charm];
const mandar = async () => { srv({ t: 'estado', estado: { activeId: 3, level: 30, pokemons: lista } }); await sleep(900); };
const tique = () => page.evaluate(async () => { const I = window.__pokeidleHunt.metaCaca._interno; await I.tique(); });
const estado = () => page.evaluate(() => { const P = window.__pokeidleHunt; const I = P.metaCaca._interno; const c = I.cfg(); return { ligado: c.ligado, fim: c.fim, alvos: c.alvos.map((a) => ({ meta: a.meta, cap: a.capturadoId, pego: I.pego(a) })), motivo: I.st.motivo, alvoAtual: I.st.alvoAtual && I.st.alvoAtual.meta, diario: JSON.stringify(P.cofre.ultimos(40)) }; });
const preparar = (soBom) => page.evaluate((soBom) => {
  const P = window.__pokeidleHunt; if (P.auto._interno.cfg().hunt.ligado) P.auto.definir('hunt.ligado', false);
  const I = P.metaCaca._interno; const c = I.cfg();
  c.alvos = [
    { meta: 'Rattata', metaId: 19, raiz: 19, membros: [{ id: 19, nome: 'Rattata', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null },
    { meta: 'Squirtle', metaId: 7, raiz: 7, membros: [{ id: 7, nome: 'Squirtle', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null },
    { meta: 'Charmeleon', metaId: 5, raiz: 4, membros: [{ id: 4, nome: 'Charmander', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null },
  ];
  c.vistos = [3]; c.ligado = true; c.fim = null; c.soBom = soBom; c.notaMin = 4; I.st.escolha = null;
}, soBom);

// 1) desligada (o padrão): o primeiro serve, como sempre
ok(await page.evaluate(() => window.__pokeidleHunt.metaCaca._interno.cfg().soBom === false), 'a opção começa desligada');
await preparar(false);
lista = [charm, fora(50, 19, 'Rattata', { quality: 1.2 })]; await mandar();
await tique(); let e = await estado();
ok(e.alvos[0].cap === 50 && e.alvos[0].pego && e.alvos[2].pego, `desligada: Rattata de nota 3,0 e o Charmander que já tinha contam (${JSON.stringify(e.alvos)})`);

await esperar(() => recebidos.some((m) => m.t === 'colecao.mover' && m.pokemonId === 50));
// 2) ligada: nota 3,0 fica de reserva e o Piloto continua no Raticate
lista = [charm]; await mandar();
await preparar(true);
const nOn = recebidos.length;
lista = [charm, fora(50, 19, 'Rattata', { quality: 1.2 })]; await mandar();
await tique(); await tique(); e = await estado();
ok(e.alvos[0].cap === 50 && !e.alvos[0].pego && e.alvoAtual === 'Rattata' && e.ligado, `ligada: Rattata nota 3,0 fica de reserva, segue no Raticate (${JSON.stringify(e.alvos[0])}, atual ${e.alvoAtual})`);
ok(/capturou Rattata \(Nv 20, nota [23],\d\) — abaixo de 4,0, continua caçando Rattata/.test(e.diario), 'Diário: abaixo do corte, continua caçando');
ok(!e.alvos[2].pego, 'o Charmander de nota 3,0 que já tinha não fecha o Charizard');
const htmlPt = await page.evaluate(() => window.__pokeidleHunt.metaCaca.html({ modo: 'automatico', arte: () => '' }));
ok(/data-alternar="metacaca:soBom"/.test(htmlPt) && /Só aceitar um bom/.test(htmlPt) && /nota 4,0\+/.test(htmlPt) && /tem Rattata nota [23],\d · caçando um 4,0\+/.test(htmlPt), 'linha: interruptor, corte e "tem Rattata nota 3,0 · caçando um 4,0+"');
// nota 3,5 (ainda abaixo) com mais Poder: vira a reserva, mas não fecha
lista = [...lista, fora(51, 19, 'Rattata', { quality: 1.4 })]; await mandar();
await tique(); e = await estado();
ok(e.alvos[0].cap === 51 && !e.alvos[0].pego, `nota 3,5: troca a reserva, não fecha (${e.alvos[0].cap})`);
// veio o bom (nota 4,25): fecha o Raticate e vai para o próximo
const n0 = recebidos.length;
lista = [...lista, fora(52, 19, 'Rattata', { quality: 1.7 })]; await mandar();
await tique(); await tique(); e = await estado();
ok(e.alvos[0].cap === 52 && e.alvos[0].pego && e.alvoAtual === 'Squirtle', `nota 4,25: fecha o Raticate e vai para o Wartortle (${JSON.stringify(e.alvos[0])}, atual ${e.alvoAtual})`);
ok(/capturou um bom: Rattata \(Nv 20, nota 4,\d\) — Rattata do meta, guardado na Coleção/.test(e.diario), 'Diário: capturou um bom');
await esperar(() => recebidos.slice(n0).some((m) => m.t === 'colecao.mover' && m.pokemonId === 52));
ok(recebidos.slice(n0).some((m) => m.t === 'colecao.mover' && m.pokemonId === 52) && !recebidos.slice(nOn).some((m) => m.t === 'colecao.mover' && (m.pokemonId === 50 || m.pokemonId === 51)), `só o bom vai para a Coleção (${JSON.stringify(recebidos.slice(nOn).filter((m) => m.t === 'colecao.mover').map((m) => m.pokemonId))})`);
// um ruim depois do bom não toma o lugar
lista = [...lista, fora(53, 19, 'Rattata', { quality: 1.5, level: 60, poder: 9000 })]; await mandar();
await tique(); e = await estado();
ok(e.alvos[0].cap === 52, 'um ruim depois do bom não toma o lugar (mesmo com mais Poder)');
// P5 passa sempre
lista = [...lista, fora(60, 7, 'Squirtle', { quality: 1.0, potencia: 5 })]; await mandar();
await tique(); e = await estado();
ok(e.alvos[1].cap === 60 && e.alvos[1].pego, 'P5 de nota baixa passa');
// mudar o corte com a caça andando
await page.evaluate(() => window.__pokeidleHunt.metaCaca.definir('notaMin', '3.5'));
e = await estado();
ok(/só aceitar um bom: nota 3,5\+/.test(e.diario), 'mudar o corte para 3,5+ anota no Diário');
await page.evaluate(() => window.__pokeidleHunt.metaCaca.definir('notaMin', '4'));
// shiny passa: fecha o Charizard e, com os 3, conclui como sempre
lista = [...lista, fora(70, 4, 'Charmander', { quality: 1.0, shiny: true })]; await mandar();
await tique(); await sleep(300); e = await estado();
ok(e.alvos[2].cap === 70 && !e.ligado && e.fim && JSON.stringify(e.fim.ids) === '[52,60,70]', `shiny passa e, com todos bons, conclui (${JSON.stringify(e.fim)})`);
// inglês
await page.evaluate(() => window.__pokeidleHunt.idioma.definir('en'));
const htmlEn = await page.evaluate(() => window.__pokeidleHunt.metaCaca.html({ modo: 'automatico', arte: () => '' }));
ok(/Only accept a good one/.test(htmlEn) && /grade 4,0\+/.test(htmlEn), 'em inglês');
// desligar a opção pelo interruptor da janela Time
await page.evaluate(() => window.__pokeidleHunt.idioma.definir('pt'));
await page.locator('#p-equipe .plt-time-bt').click(); await sleep(1500);
await page.locator('.plt-janela-time .cfg-cat[data-aba="meta"]').click(); await sleep(1500);
await page.locator('.plt-janela-time [data-alternar="metacaca:soBom"]').click(); await sleep(500);
ok(await page.evaluate(() => window.__pokeidleHunt.metaCaca._interno.cfg().soBom === false), 'o interruptor da janela Time desliga a opção');
await page.locator('.plt-janela-time [data-alternar="metacaca:soBom"]').click(); await sleep(500);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/1-meta-sobom.png` });
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
