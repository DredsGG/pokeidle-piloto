// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-farm');
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
  pedrasEvolucao: { FIRE: { itemId: 300, nome: 'Fire Stone' } },
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


// 1.47.0: Modo farm
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await sleep(1500);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(800);
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(500);
const base = { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 };
const iv = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const charm = { id: 3, slot: 0, level: 30, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], poder: 3000, stats: base, ivs: iv, quality: 1.2, potencia: 1, maxHp: 1720, hp: 1720 };
let lista = [charm];
const mandar = async (extra = {}) => { srv({ t: 'estado', estado: { level: 30, pokemons: lista, ...extra } }); await sleep(900); };
// o motor de mentira: XP/h por espécie (exemplar típico, id < 0) e pelos seus (id > 0)
await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  window.__xpEsp = { 4: 500, 5: 1000, 7: 600, 19: 300 };
  window.__xpSeu = { 3: 950 };
  P.engine.analisar = (pk, ctx) => ({ linhas: (ctx.hunts || []).map((h) => ({ slug: h.slug, nome: h.nome, nivel: h.nivel || 10, liberada: true, inviavel: false, umHit: false, mortesH: 0, hitPct: 0.1, kph: 100, xpTreinadorH: (pk.id < 0 ? window.__xpEsp[pk.speciesId] : window.__xpSeu[pk.id] ?? 100) || 0, xpPokemonH: 0 })) });
  const R = P.rotina; const c = R._interno.cfg();
  for (const k of ['passe', 'xpshare', 'outland', 'chocadeira']) c[k].ligado = false;
  c.depot.modo = 'off'; c.pvp.time = c.pvp.fila = false; c.autoColecao.ligado = false; c.evoluir.ligado = false;
  R.definir('rodizio.ligado', true);
  if (P.auto._interno.cfg().hunt.ligado) P.auto.definir('hunt.ligado', false);
});
const F = (fn) => page.evaluate(fn);
const estado = () => F(() => { const P = window.__pokeidleHunt; const I = P.farm._interno; const c = I.cfg(); return { ligado: c.ligado, alvo: c.alvo, pkId: c.pkId, motivo: I.st.motivo, rodizio: P.rotina._interno.cfg().rodizio.ligado, hunt: P.auto._interno.cfg().hunt.ligado, diario: JSON.stringify(P.cofre.ultimos(40)) }; });
const tique = () => F(async () => { await window.__pokeidleHunt.farm._interno.tique(); });

ok(await F(() => window.__pokeidleHunt.farm.ativo() === false), 'começa desligado');
// A) o seu Charmander rende 950 contra 1000 do melhor (≥ 90%): ele mesmo é o farmador, nada é capturado
await F(() => window.__pokeidleHunt.farm.definir('ligado', true)); await sleep(1500);
let e = await estado();
ok(e.ligado && e.alvo && e.alvo.seu === true && e.pkId === 3, `o seu (95% do melhor) já serve: ${JSON.stringify(e.alvo && { n: e.alvo.nome, seu: e.alvo.seu })} pk ${e.pkId}`);
ok(e.rodizio === false && /rodízio desligado \(volta quando o Modo farm desligar\)/.test(e.diario), 'ligar desliga o rodízio');
await tique(); await sleep(500); e = await estado();
ok(e.hunt === true && /farmando com Charmander/.test(e.motivo), `farmando, Troca de hunt ligada (${e.motivo})`);
// ligar o rodízio desliga o Modo farm
await F(() => window.__pokeidleHunt.rotina.definir('rodizio.ligado', true)); await sleep(300);
e = await estado();
ok(!e.ligado && /desligado \(o rodízio foi ligado\)/.test(e.diario), 'ligar o rodízio desliga o Modo farm');
ok(e.hunt === false, 'a Troca de hunt volta como estava (desligada)');

// B) o melhor é o Charmeleon (1000) e o seu Charmander rende 400: você já tem a família → o Charmander vira o principal e evolui
await F(() => { window.__xpSeu[3] = 400; });
const n0 = recebidos.length;
await F(() => window.__pokeidleHunt.farm.definir('ligado', true)); await sleep(1500);
e = await estado();
ok(e.ligado && e.alvo && e.alvo.speciesId === 5 && e.alvo.seu === false && e.pkId === 3, `melhor Charmeleon, já tem o Charmander: ele vira o principal (${JSON.stringify(e.alvo && { n: e.alvo.nome, id: e.alvo.speciesId })} pk ${e.pkId})`);
ok(/o melhor farmador é Charmeleon .* você já tem Charmander: ele vira o principal/.test(e.diario), 'Diário: melhor farmador e já tem');
await F(async () => { const R = window.__pokeidleHunt.rotina; R._interno.marcas().evoluir = 0; for (let i = 0; i < 3; i++) { await R._interno.tique(); await new Promise((r) => setTimeout(r, 1200)); } });
const evo = recebidos.slice(n0).filter((m) => m.t === 'pokemon.evoluir');
ok(evo.length === 1 && evo[0].pokemonId === 3 && evo[0].alvoId === 5, `evolui só o farmador, com o Evoluir da Rotina desligado (${JSON.stringify(evo)})`);

// C) agora o melhor é o Squirtle (2000) e você não tem: captura, entra no time e vira o ativo
const n1 = recebidos.length;
await F(() => { window.__xpEsp[7] = 2000; const I = window.__pokeidleHunt.farm._interno; I.st.recalcularJa = true; });
await tique(); await sleep(800); e = await estado();
ok(e.alvo && e.alvo.speciesId === 7 && e.pkId == null, `recalculou: melhor Squirtle, não tem (${JSON.stringify(e.alvo && e.alvo.nome)} pk ${e.pkId})`);
await tique(); await sleep(800); e = await estado();
ok(/indo para Squirtle capturar Squirtle/.test(e.motivo) && e.hunt === false, `vai à hunt do Squirtle com a Troca de hunt parada (${e.motivo})`);
await sleep(300);
ok(recebidos.slice(n1).some((m) => m.t === 'hunt.select' && m.slug === 'squirtle_1'), 'manda o hunt.select da hunt de captura');
await mandar({ huntSlug: 'squirtle_1', noCentro: false });
await tique(); e = await estado();
ok(/capturando Squirtle em Squirtle/.test(e.motivo), `capturando (${e.motivo})`);
lista = [charm, { id: 60, slot: null, level: 8, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], poder: 200, stats: base, ivs: iv, quality: 1.0, potencia: 1, maxHp: 300, hp: 300 }];
await mandar({ huntSlug: 'squirtle_1' });
await tique(); e = await estado();
ok(e.pkId === 60 && /capturou Squirtle \(Nv 8\) — ele vira o principal agora/.test(e.diario), 'capturou: ele vira o principal');
ok(/Squirtle entrando no time/.test(e.motivo) && (await F(() => window.__pokeidleHunt.time.alvoPrincipal())).includes(60), 'entra no time principal (a janela Time faz a troca)');
ok(await F(() => window.__pokeidleHunt.time.campoAuto()), '"Montar o time principal sozinho" ligado para isso');
const n2 = recebidos.length;
lista = [charm, { ...lista[1], slot: 1 }];
await mandar();
await tique(); await sleep(400);
ok(recebidos.slice(n2).some((m) => m.t === 'team.active' && m.pokemonId === 60), 'no time: vira o ativo');
await mandar({ activeId: 60 });
const emSessao = await F(() => window.__pokeidleHunt.time.emSessao());
await F(() => { window.__pokeidleHunt.time._interno.st.sessao = null; }); // a troca no Centro acabou
await tique(); await sleep(300); e = await estado();
console.log('   (a janela Time estava trocando no Centro:', emSessao, ')');
ok(e.hunt === true && /farmando com Squirtle/.test(e.motivo), `farmando com o capturado e a Troca de hunt ligada (${e.motivo})`);
ok((await F(() => window.__pokeidleHunt.farm.protegidos())).includes(60), 'o farmador é protegido de venda');
// a linha na aba Caçar
const html = await F(() => window.__pokeidleHunt.farm.linha('automatico'));
ok(/data-alternar="farm:ligado"/.test(html) && /Modo farm/.test(html) && /Squirtle · ~2 mil XP\/h/.test(html), 'linha na aba Caçar com o escolhido e o XP/h');
await F(() => window.__pokeidleHunt.idioma.definir('en'));
ok(/Farm mode/.test(await F(() => window.__pokeidleHunt.farm.linha('automatico'))), 'em inglês');
await F(() => window.__pokeidleHunt.idioma.definir('pt'));
// desligar: o rodízio volta (estava ligado antes) e a Troca de hunt volta como estava
await F(() => window.__pokeidleHunt.farm.definir('ligado', false)); await sleep(300);
e = await estado();
ok(!e.ligado && e.rodizio === true && e.hunt === false, `desligar devolve o rodízio e a Troca de hunt (rodízio ${e.rodizio}, hunt ${e.hunt})`);
// na aba Caçar, o interruptor liga
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela [data-aba="hunts"]').click().catch(() => {}); await sleep(1200);
await page.locator('.plt-janela [data-alternar="farm:ligado"]').click().catch(() => {}); await sleep(2000);
ok(await F(() => window.__pokeidleHunt.farm.ativo()), 'o interruptor da aba Caçar liga o Modo farm');
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/1-farm.png` }).catch(() => {});
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 300)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
