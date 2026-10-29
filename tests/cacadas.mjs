// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-cacadas');
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
    { slug: 'charmander_1', nome: 'Charmander', nivel: 8, regiao: 'kanto', especies: [{ pokeId: 4, pontos: 6 }, { pokeId: 19, pontos: 4 }] },
  ],
  mercado: { catalogo: [{ id: 300, nome: 'Fire Stone', categoria: 'stone' }, { id: 301, nome: 'Leaf Stone', categoria: 'stone' }], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] }, pokedex: { 4: { k: 10, c: 1 }, 7: { k: 3, c: 0 } },
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

await ctx.addInitScript(() => { try { localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); } catch {} });
await page.goto('https://pokeidle.io/app');
await sleep(4000);


const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
await sleep(1500);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(800);
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(500);
const base = { tipos: ['FIRE'], stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 85 }, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, maxHp: 1720, hp: 1720 };
const time = [{ ...base, id: 3, slot: 0, level: 30, nome: 'Charmander', speciesId: 4, quality: 1.2, potencia: 1, poder: 3000 }, { ...base, id: 4, slot: 1, level: 28, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.1, potencia: 1, poder: 2500 }];
srv({ t: 'estado', estado: { activeId: 3, huntSlug: 'rattata_1', pokemons: time } }); await sleep(1200);
// motor de hunt previsível: toda hunt é segura
await page.evaluate(() => { const P = window.__pokeidleHunt; window.__origAnalisar = P.engine.analisar; P.engine.analisar = (pk, ctx) => ({ linhas: (ctx.hunts || []).map((h) => ({ slug: h.slug, nome: h.nome, kph: 100, inviavel: false, umHit: false, mortesH: 0, hitPct: 0.1, liberada: true })) }); });
await page.evaluate(() => { window.__pokeidleHunt.auto.definir('hunt.ligado', true); window.__pokeidleHunt.rotina.definir('rodizio.ligado', true); });
await sleep(300);
const C = () => page.evaluate(() => { const P = window.__pokeidleHunt; const c = P.cacadas._interno.cfg(); return { modo: c.modo, i: c.i, alvos: c.alvos.map((a) => ({ nome: a.nome, membros: a.membros.map((m) => m.id), melhorId: a.melhorId, feito: a.feito })), promessas: c.promessas, huntDepois: c.huntDepois, rodizioDepois: c.rodizioDepois, dexPegos: c.dexPegos, motivo: P.cacadas._interno.st.motivo, escolha: P.cacadas._interno.st.escolha && P.cacadas._interno.st.escolha.slug, troca: P.auto._interno.cfg().hunt.ligado, rodizio: P.rotina._interno.cfg().rodizio.ligado }; });
const tique = async (n = 1) => { for (let i = 0; i < n; i++) { await page.evaluate(() => window.__pokeidleHunt.cacadas._interno.tique()); await sleep(900); } };

// ---- Melhorar o time ----
let rl = await page.evaluate(() => window.__pokeidleHunt.cacadas.definir('melhorar', true));
let c = await C();
ok(rl && rl.ok && c.modo === 'melhorar' && c.alvos.length === 2 && c.alvos[0].membros.includes(4) && c.alvos[0].membros.includes(5), `liga: um alvo por pokémon do time, com a família (${JSON.stringify(c.alvos)})`);
ok(!c.troca && !c.rodizio && c.huntDepois && c.rodizioDepois, `desliga a Troca de hunt e o rodízio e lembra de religar (${c.troca}, ${c.rodizio})`);
const n0 = recebidos.length;
await tique(2);
c = await C();
ok(c.escolha === 'charmander_1', `vai à hunt onde a família do Charmander aparece (${c.escolha}, ${c.motivo})`);
ok(recebidos.slice(n0).some((m) => /hunt|centro/.test(m.t)), `pediu para ir à hunt (${recebidos.slice(n0).map((m) => m.t).join(',')})`);
// chegou e capturou: um pior e um melhor
srv({ t: 'estado', estado: { huntSlug: 'charmander_1', noCentro: false, pokemons: [...time, { ...base, id: 50, slot: null, level: 8, nome: 'Charmander', speciesId: 4, quality: 1.0, potencia: 1, poder: 500 }, { ...base, id: 51, slot: null, level: 8, nome: 'Charmander', speciesId: 4, quality: 1.5, potencia: 3, poder: 900 }] } });
await sleep(1200);
const n1 = recebidos.length;
await tique(2);
c = await C();
ok(c.alvos[0].melhorId === 51 && c.promessas.includes(51) && !c.promessas.includes(50), `o melhor (qualidade 1,5, P3) vira promessa; o pior não (${JSON.stringify(c.alvos[0])}, ${c.promessas})`);
ok(recebidos.slice(n1).some((m) => m.t === 'colecao.mover' && m.pokemonId === 51 && m.para === 'colecao'), 'o melhor vai para a Coleção');
const prot = await page.evaluate(() => ({ p: window.__pokeidleHunt.cacadas.protegidos(), f: window.__pokeidleHunt.cacadas.especiesAlvo(), t: window.__pokeidleHunt.cacadas.treinar().map((p) => p.id) }));
ok(prot.p.includes(51) && prot.t.includes(51), `protegido da venda e na fila do XP Share (${JSON.stringify(prot)})`);
ok(c.i === 1 || c.alvos[0].feito, `achou: passa para o próximo (${c.i})`);
// o segundo alvo passa 1 h sem achar: termina, religa a Troca de hunt e o rodízio
await page.evaluate(() => { const c = window.__pokeidleHunt.cacadas._interno.cfg(); c.alvos[1].naHuntMs = 61 * 60_000; });
await tique(2);
c = await C();
ok(c.modo === null && c.troca && c.rodizio, `terminou o time: desliga e religa a Troca de hunt e o rodízio (${c.modo}, ${c.troca}, ${c.rodizio})`);
const diar = await page.evaluate(() => JSON.stringify(window.__pokeidleHunt.cofre.ultimos(40)));
ok(/melhorar o time: terminou: achou 1 melhor/.test(diar), 'resumo no Diário');

// ---- Completar a Pokédex ----
rl = await page.evaluate(() => window.__pokeidleHunt.cacadas.definir('dex', true));
c = await C();
const falt = await page.evaluate(() => window.__pokeidleHunt.cacadas._interno.faltamNaDex());
ok(rl.ok && c.modo === 'dex' && falt.includes(7) && falt.includes(19) && !falt.includes(4), `liga: faltam o Squirtle e o Rattata (o Charmander já foi capturado) (${falt})`);
await tique(2);
c = await C();
ok(['charmander_1', 'rattata_1', 'squirtle_1'].includes(c.escolha), `escolheu uma hunt com espécie faltando (${c.escolha}, ${c.motivo})`);
// capturou um Rattata (evento da batalha): sai da lista
srv({ t: 'batalha', ev: [{ k: 'capturado', pokemon: { id: 60, nome: 'Rattata', level: 5, shiny: false, speciesId: 19, quality: 1, potencia: 1 } }] });
await sleep(800);
const falt2 = await page.evaluate(() => window.__pokeidleHunt.cacadas._interno.faltamNaDex());
ok(!falt2.includes(19) && falt2.includes(7), `captura conta na hora (${falt2})`);
// a Pokédex do jogo atualiza com o Squirtle: acabou, desliga sozinho
srv({ t: 'estado', estado: { pokedex: { 4: { k: 10, c: 1 }, 7: { k: 4, c: 1 }, 19: { k: 1, c: 1 } } } }); await sleep(800);
await tique(1);
c = await C();
ok(c.modo === null && c.troca, `todas na Pokédex: desliga sozinho e religa a Troca de hunt (${c.modo}, ${c.troca})`);

// ---- só um por vez; a Troca de hunt desliga ----
await page.evaluate(() => window.__pokeidleHunt.cacadas.definir('melhorar', true)); await sleep(300);
await page.evaluate(() => window.__pokeidleHunt.auto.definir('hunt.ligado', true)); await sleep(300);
c = await C();
ok(c.modo === null, `ligar a Troca de hunt desliga a caçada (${c.modo})`);
// o Caçar o meta ligado: a caçada desliga ele e fica com a volta da Troca de hunt
await page.evaluate(() => { const m = window.__pokeidleHunt.metaCaca._interno.cfg(); m.ligado = true; window.__pokeidleHunt.auto.definir('hunt.ligado', false); });
await page.evaluate(() => window.__pokeidleHunt.cacadas.definir('melhorar', true)); await sleep(300);
c = await C();
const meta = await page.evaluate(() => window.__pokeidleHunt.metaCaca.ativo());
ok(c.modo === 'melhorar' && !meta && c.huntDepois, `ligar desliga o Caçar o meta e guarda a volta da Troca de hunt (${meta}, ${c.huntDepois})`);
await page.evaluate(() => window.__pokeidleHunt.cacadas.definir('melhorar', false)); await sleep(300);
// a linha na aba Caçar
await page.evaluate(() => { window.__pokeidleHunt.engine.analisar = window.__origAnalisar; });
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .cfg-cat[data-aba="hunts"]').click().catch(() => {}); await sleep(1500);
const lin = await page.evaluate(() => [...document.querySelectorAll('[data-linha^="cacadas"]')].map((e) => e.innerText.replace(/\s+/g, ' ')));
ok(lin.length === 2 && /Melhorar o time/.test(lin[0]) && /Completar a Pokédex/.test(lin[1]), `as duas linhas na aba Caçar (${lin.join(' | ').slice(0, 160)})`);
await page.locator('[data-linha="cacadas-melhorar"]').screenshot({ path: `${SAIDA}/1-linhas.png` }).catch(() => {});
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
