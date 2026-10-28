// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-kitfraco');
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
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }, { id: 2, nome: 'Great Ball', priceGold: 60, compravel: true, catchRate: 1.5 }, { id: 3, nome: 'Super Ball', priceGold: 150, compravel: true, catchRate: 2 }, { id: 4, nome: 'Ultra Ball', priceGold: 400, compravel: true, catchRate: 2.5 }, { id: 9, nome: 'Beast Ball', priceGold: 5, compravel: true, catchRate: 5 }],
  itensNossos: [],
  hunts: [
    { slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] },
    { slug: 'squirtle_1', nome: 'Squirtle', nivel: 10, regiao: 'kanto', especies: [{ pokeId: 7, pontos: 8 }] },
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 4000, level: 20, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [202], reviveIds: [205], autoPotion: true, autoRevive: true, autoVoltarHunt: true, hpLimiar: 0.5 }, balls: { 1: 300 }, items: { 202: 0, 205: 6 },
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
const inv = { balls: { 1: 300 }, items: { 202: 0, 205: 6 } };
const setsVistos = [];
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
    // 1.34 (amigo do André, Nv 50): o jogo NÃO deixa marcado um revive/poção/bola que a conta não tem
    // (hipótese do print: 0 revive e nenhum marcado, bola e poção com estoque marcadas)
    if (o.t === 'auto.set') {
      const { t, ...auto } = o;
      setsVistos.push(auto);
      setTimeout(() => ws.send(JSON.stringify({ t: 'estado', estado: { automation: auto } })), 300);
    }
    if (o.t === 'shop.buy') {
      const alvo = o.kind === 'ball' ? inv.balls : inv.items;
      alvo[o.id] = (alvo[o.id] || 0) + Number(o.qty || 0);
      setTimeout(() => ws.send(JSON.stringify({ t: 'estado', estado: { balls: { ...inv.balls }, items: { ...inv.items } } })), 200);
    }
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




// 1.36.1 (amigo do André, conta baixa): a poção marcada (Ultra Potion) acabou e o kit agora prefere a
// Great Potion, mais barata por HP útil. Antes: a marcada não estava no kit candidato e o candidato não
// estava marcado — nenhuma das duas era comprada por 10 a 40 min e o pokémon morria.
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await page.locator('button.plt-barra').click(); await sleep(1000);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(2500);
await page.keyboard.press('Escape');
const t0 = recebidos.length;
await page.evaluate(() => window.__pokeidleHunt.auto.acoes['testar-repor']());
await sleep(8000);
await page.evaluate(() => window.__pokeidleHunt.auto.acoes['testar-repor']());
await sleep(8000);
console.log('DIARIO1', JSON.stringify(await page.evaluate(() => window.__pokeidleHunt.auto.diario().map((d) => d.txt).slice(0, 12).reverse())));
const sets = recebidos.filter((m) => m.t === 'auto.set');
const compras = recebidos.slice(t0).filter((m) => m.t === 'shop.buy');
ok(sets.some((m) => (m.potionIds || [])[0] === 201) && !sets.some((m) => (m.potionIds || [])[0] === 200), `troca na hora para a poção nova (sem esperar 10 min) e não desce para a mais fraca depois de comprar: ${JSON.stringify(sets.map((m) => m.potionIds))}`);
const gastoBolas = compras.filter((m) => m.kind === 'ball').reduce((s, m) => s + m.qty * 10, 0);
const gastoVida = compras.filter((m) => m.kind === 'item').reduce((s, m) => s + m.qty * ({ 201: 10, 205: 40 }[m.id] || 0), 0);
ok(gastoVida >= 1000 && gastoVida + gastoBolas <= 3600, `sobrevivência primeiro: poções/revives ${gastoVida}, bolas ${gastoBolas}`);
ok(compras.some((m) => m.kind === 'item' && m.id === 201 && m.qty >= 20), `comprou a poção nova: ${JSON.stringify(compras.map((m) => [m.kind, m.id, m.qty]))}`);
ok(!compras.some((m) => m.id === 202), 'não gastou com a poção antiga');
ok(compras.reduce((s, m) => s + m.qty * ({ 201: 10, 205: 40, 1: 10 }[m.id] || 0), 0) <= 4000, 'cabe no ouro da conta');
// recarregar a página com o kit já aplicado (um de cada marcado): a poção marcada zerada é comprada
inv.items[201] = 0;
welcome.estado.automation = { ...welcome.estado.automation, potionIds: [201] };
welcome.estado.items = { 201: 0, 205: 6 };
const t1 = recebidos.length;
await page.reload(); await sleep(5000);
await page.evaluate(() => window.__pokeidleHunt.auto.acoes['testar-repor']());
await sleep(8000);
const compras2 = recebidos.slice(t1).filter((m) => m.t === 'shop.buy');
ok(compras2.some((m) => m.id === 201), `depois de recarregar, compra a poção marcada que zerou: ${JSON.stringify(compras2.map((m) => [m.kind, m.id, m.qty]))}`);
// ---- 1.36.1: a mesma lógica de ponta a ponta, da conta nova à conta topo -------------------------
// Para cada faixa: o jogo manda o estado (ouro, nível, HP do time, mochila vazia); o Piloto escolhe o
// kit e calcula a compra. Regras que valem para todas: revive e poção chegam ao mínimo antes de bola;
// o total cabe no ouro livre; a bola nunca leva o fôlego da próxima poção; conta maior → itens maiores.
const faixas = [
  { nome: 'Nv 5', gold: 600, level: 5, hp: 120 },
  { nome: 'Nv 30', gold: 6000, level: 30, hp: 600 },
  { nome: 'Nv 100', gold: 300_000, level: 100, hp: 3000 },
  { nome: 'Nv 300', gold: 15_000_000, level: 300, hp: 12000 },
  { nome: 'Nv 1000', gold: 600_000_000, level: 1000, hp: 50000 },
];
const PRECO = { b1: 10, b2: 60, b3: 150, b4: 400, i200: 5, i201: 10, i202: 22, i203: 55, i204: 135, i205: 40, i206: 350 };
const ordemPocao = ['Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion'];
let antesPocao = -1;
for (const f of faixas) {
  for (const k of Object.keys(inv.items)) inv.items[k] = 0;
  for (const k of Object.keys(inv.balls)) inv.balls[k] = 0;
  globalThis.__ws.send(JSON.stringify({ t: 'estado', estado: { gold: f.gold, level: f.level, balls: {}, items: {}, automation: { ballIds: [1], potionIds: [201], reviveIds: [205], autoPotion: true, autoRevive: true, autoBallSemParar: true, hpLimiar: 0.5 } } }));
  await sleep(800);
  const r = await page.evaluate(async (f) => {
    const P = window.__pokeidleHunt; const A = P.auto._interno;
    let e = null; const off = P.on('estado', (x) => { e = x; });
    await new Promise((res) => setTimeout(res, 1200));
    for (const p of e.pokemons) if (p.slot != null) { p.maxHp = f.hp; p.hp = f.hp; }
    const c = A.cfg(); c.repor.ligado = true; c.repor.kitAuto = true; c.repor.alvos = {}; c.repor.reservaOuro = 0;
    const k = await A.conferirKit(true);
    await new Promise((res) => setTimeout(res, 900));
    const lista = A.comprasPendentes();
    const livre = Math.min(e.gold, P.cofre.livre('repor'));
    return { kit: k && { bola: k.bola.nome, pocao: k.pocao.name, revive: k.revive.name }, livre, lista: lista.map((x) => ({ chave: x.chave, cat: x.cat, qty: x.qty, preco: x.preco, nome: x.nome })) };
  }, f);
  const custo = (cat) => r.lista.filter((x) => cat ? x.cat === cat : true).reduce((s, x) => s + x.qty * x.preco, 0);
  const q = (cat) => r.lista.filter((x) => x.cat === cat).reduce((s, x) => s + x.qty, 0);
  console.log(`  ${f.nome}: kit ${JSON.stringify(r.kit)} · livre ${r.livre} · compra ${JSON.stringify(r.lista.map((x) => `${x.qty}× ${x.nome}`))}`);
  ok(custo() <= r.livre + 1, `${f.nome}: o total cabe no ouro livre (${custo()} de ${r.livre})`);
  const pocaoP = r.lista.find((x) => x.cat === 'pocao'); const reviveP = r.lista.find((x) => x.cat === 'revive');
  const cabeMinVida = r.livre >= 20 * (pocaoP ? pocaoP.preco : 5) + 3 * (reviveP ? reviveP.preco : 40);
  ok(!cabeMinVida || (q('pocao') >= 20 && q('revive') >= 3), `${f.nome}: poção e revive no mínimo (${q('pocao')} poções, ${q('revive')} revives)`);
  ok(custo('bola') === 0 || q('pocao') >= 20, `${f.nome}: bola só depois da sobrevivência (bolas ${custo('bola')})`);
  const iP = ordemPocao.indexOf(r.kit && r.kit.pocao);
  ok(iP >= antesPocao, `${f.nome}: a poção não piora quando a conta sobe (${r.kit && r.kit.pocao})`);
  antesPocao = Math.max(antesPocao, iP);
}

const errosReais = erros.filter((e) => !/Failed to load resource/.test(e) && /error|Error/.test(e));
ok(!errosReais.length, `sem erro de página (${errosReais.join(' | ').slice(0, 200)})`);
const diario = await page.evaluate(() => window.__pokeidleHunt.auto.diario().map((d) => d.txt).slice(0, 8));
console.log(diario.join(' | '));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
