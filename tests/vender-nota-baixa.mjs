// "Vender os de nota baixa" (ideia aprovada pelo André em 2026-11-09; pedida também no #5). Desligado de
// fábrica, com simulação e um segundo interruptor para vender de verdade. O jogo tem venda de um por um
// (shop.sellPokemon); o que está na Coleção precisa antes voltar ao Depot.
// O jogo falso usa a nota de mentira do stub: qualidade × 2,5 (0,6 → 1,5).
//   node vender-nota-baixa.mjs [pasta-da-extensao]
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
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  if (arq === 'shared/sell-value.mjs') return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export const precoVendaDoPokemon = (pk) => (pk.level || 1) * 10;\n' });
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const base = { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 };
const PK = (id, speciesId, nome, extra = {}) => ({ id, slot: null, level: 20, xp: 1, nome, speciesId, tipos: ['NORMAL'], quality: 0.6, potencia: 1, poder: 100, ivs, stats: base, maxHp: 500, hp: 500, ...extra });
const listaBase = () => [
  PK(3, 4, 'Charmander', { slot: 0, quality: 1.2 }), // o ativo
  PK(4, 19, 'Rattata', { slot: 1 }), // no time, nota baixa
  PK(101, 19, 'Rattata', { quality: 0.6 }), // VENDE: nota 1,5
  PK(102, 19, 'Rattata', { quality: 0.7 }), // VENDE: nota 1,75
  PK(103, 19, 'Rattata', { quality: 0.9 }), // nota 2,25: acima do corte de 2,0
  PK(104, 19, 'Rattata', { quality: 1.4 }), // nota 3,5: nunca
  PK(110, 7, 'Squirtle', { shiny: true }),
  PK(111, 7, 'Squirtle', { potencia: 5 }),
  PK(112, 7, 'Squirtle', { heldItemId: 70050 }),
  PK(113, 7, 'Squirtle', {}), // a Guarda protege
  PK(115, 7, 'Squirtle', { starter: true }),
  PK(120, 19, 'Rattata', {}), // na Coleção desde antes: guardado
  PK(121, 19, 'Rattata', { level: 60 }), // na Coleção, Nv 60
  PK(130, 5, 'Charmeleon', {}), // único da espécie
  PK(140, 16000, 'Sem Catalogo', {}), // sem nota
];
let eu;
const novoEstado = () => { eu = { id: 7, nick: 'Treinador', gold: 50_000_000, level: 400, xp: 1, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(), automation: { ballIds: [1], potionIds: [200], reviveIds: [205], pokemonTravado: [120, 121] }, balls: { 1: 500 }, items: { 200: 100, 205: 20 }, casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] }, pokemons: listaBase() }; };
novoEstado();
const welcome = () => ({ t: 'welcome', tabelaTipos: { NORMAL: {} }, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [], catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [], hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }], mercado: { catalogo: [], taxaDiaria: 100000 }, estado: eu });
const recebidos = [];
let wsAtual = null;
const mandarEstado = () => wsAtual.send(JSON.stringify({ t: 'estado', estado: { pokemons: eu.pokemons, automation: eu.automation, gold: eu.gold, servidorAgora: Date.now() } }));
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  wsAtual = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m); recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'shop.sellPokemon') { const p = eu.pokemons.find((x) => x.id === o.pokemonId); if (p) { eu.gold += p.level * 10; eu.pokemons = eu.pokemons.filter((x) => x.id !== o.pokemonId); mandarEstado(); } }
    if (o.t === 'colecao.mover' && o.para === 'depot') { eu.automation.pokemonTravado = eu.automation.pokemonTravado.filter((id) => id !== o.pokemonId); mandarEstado(); }
  });
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
const vendas = () => recebidos.filter((m) => m.t === 'shop.sellPokemon').map((m) => m.pokemonId);
const movidos = () => recebidos.filter((m) => m.t === 'colecao.mover' && m.para === 'depot').map((m) => m.pokemonId);
const diario = () => page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos(80) || []).map((d) => d.txt).filter((t) => /nota baixa/.test(t)));
const V = (f) => page.evaluate(f);
const tem = await (async () => {
  await page.goto('https://pokeidle.io/app');
  await sleep(4000);
  await page.locator('button.plt-barra').click(); await sleep(800);
  await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
  await page.keyboard.press('Escape');
  // a Guarda da janela Time pronta (no jogo falso não há análise), protegendo só o 113
  await page.evaluate(() => { window.__pokeidleHunt.guarda.resumo = () => ({ pronto: true, ids: [113], motivo: '' }); });
  return page.evaluate(() => !!window.__pokeidleHunt.vendaNota);
})();
ok(tem, 'o módulo existe');
const rodada = (forcar = true) => page.evaluate(async (f) => { const P = window.__pokeidleHunt; if (P.vendaNota) await P.vendaNota._interno.rodada(f); }, forcar);
const definir = (k, v) => page.evaluate(([k, v]) => { const P = window.__pokeidleHunt; if (P.vendaNota) P.vendaNota.definir(k, v); }, [k, v]);
const cfg = () => V(() => { const P = window.__pokeidleHunt; return P.vendaNota ? { ...P.vendaNota._interno.cfg() } : null; });

// de fábrica
let c = await cfg();
ok(c && c.ligado === false && c.real === false, `desligada de fábrica e sem venda de verdade (${c && [c.ligado, c.real]})`);
ok(c && c.corte === 2 && c.limite >= 1 && c.limite <= 10, `corte conservador de 2,0 e limite baixo (${c && [c.corte, c.limite]})`);
await rodada();
await sleep(500);
ok(vendas().length === 0 && movidos().length === 0 && (await diario()).length === 0, 'desligada: não faz nada');

// só vale em Automático
await definir('ligado', true);
await page.evaluate(() => window.__pokeidleHunt.modo.definir('manual')); await sleep(300);
await rodada(); await sleep(300);
ok((await diario()).length === 0, 'em Manual: não faz nada');
await page.evaluate(() => window.__pokeidleHunt.modo.definir('automatico')); await sleep(800);
await page.evaluate(() => { window.__pokeidleHunt.guarda.resumo = () => ({ pronto: true, ids: [113], motivo: '' }); });

// sem a Guarda pronta, espera
await page.evaluate(() => { window.__pokeidleHunt.__g = window.__pokeidleHunt.guarda.resumo; window.__pokeidleHunt.guarda.resumo = () => ({ pronto: false, ids: [], motivo: 'x' }); });
await rodada(); await sleep(300);
ok(!(await diario()).some((t) => /venderia/.test(t)), 'sem a Guarda pronta: não lista nem vende');
await page.evaluate(() => { window.__pokeidleHunt.guarda.resumo = window.__pokeidleHunt.__g; });

// simulação
await rodada(); await sleep(500);
let d = await diario();
console.log(d.map((x) => `   ${x}`).join('\n'));
const sim = d.find((t) => /venderia/.test(t)) || '';
ok(/venderia 2 pokémon/.test(sim) && /Rattata Nv 20 nota 1,45/.test(sim) && /nota 1,7[)]/.test(sim) && /= 400 de ouro/.test(sim), `simulação lista só os certos, com o ouro: ${sim}`);
ok(vendas().length === 0 && movidos().length === 0, 'simulação: nada é enviado ao jogo');
const motivo = (re) => d.some((t) => re.test(t));
ok(motivo(/fica.*é shiny/), 'trava no Diário: shiny');
ok(motivo(/fica.*é P5/), 'trava no Diário: P5');
ok(motivo(/fica.*está no time/), 'trava no Diário: time');
ok(motivo(/fica.*é o ativo/), 'trava no Diário: ativo');
ok(motivo(/fica.*segura item/), 'trava no Diário: quem segura item');
ok(motivo(/fica.*a Guarda protege/), 'trava no Diário: Guarda');
ok(motivo(/fica.*é o inicial/), 'trava no Diário: inicial');
ok(motivo(/fica.*na Coleção: Nv 50\+/), 'trava no Diário: Nv 50+ na Coleção');
ok(motivo(/fica.*na Coleção: guardado por você/), 'trava no Diário: quem está na Coleção desde antes');
ok(motivo(/fica.*único da espécie/), 'trava no Diário: único exemplar da espécie');
ok(motivo(/fica.*sem nota/), 'trava no Diário: sem nota, não vende');
ok(motivo(/fica.*nota no corte ou acima/), 'trava no Diário: nota no corte ou acima');

// a opção aparece na aba Rotina, com o segundo interruptor separado e travado enquanto a opção está desligada
const h = await page.evaluate(() => { const P = window.__pokeidleHunt; if (!P.vendaNota) return { lig: '', des: '' }; const lig = P.vendaNota.linha('automatico'); P.vendaNota.definir('ligado', false); const des = P.vendaNota.linha('automatico'); P.vendaNota.definir('ligado', true); return { lig, des }; });
ok(/Vender os de nota baixa/.test(h.lig) && /Vender de verdade/.test(h.lig) && /vendanota:real/.test(h.lig) && /só simulando/.test(h.lig), 'a opção e o segundo interruptor aparecem');
ok(/desligada/.test(h.des) && /vendanota:real[^>]*disabled|disabled[^>]*vendanota:real/.test(h.des), 'com a opção desligada, o "Vender de verdade" fica travado');

// o corte nunca chega a 3,5
await definir('corte', 9);
c = await cfg();
ok(c && c.corte === 3.4, `o corte não passa de 3,4: nota 3,5+ nunca vende (${c && c.corte})`);
await definir('corte', 2);

// família do alvo do Caçar o meta
await page.evaluate(() => { const P = window.__pokeidleHunt; const k = P.metaCaca._interno.cfg(); k.alvos = [{ meta: 'Rattata', metaId: 19, raiz: 19, membros: [{ id: 19, nome: 'Rattata', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null }]; k.ligado = true; k.fim = null; });
const n1 = (await diario()).length;
await rodada(); await sleep(400);
d = (await diario()).slice(0, (await diario()).length - n1);
ok(!d.some((t) => /venderia [1-9]/.test(t)) && d.some((t) => /fica.*família do alvo/.test(t)), `Caçar o meta ligado: a família do alvo fica (${d.find((t) => /família/.test(t))})`);
await page.evaluate(() => { const k = window.__pokeidleHunt.metaCaca._interno.cfg(); k.ligado = false; k.alvos = []; });

// o hook é a segunda trava: um protegido nunca sai como comando de venda
const a0 = recebidos.length;
const hook = await page.evaluate(() => { const P = window.__pokeidleHunt; const v = (id) => P.pedir({ t: 'shop.sellPokemon', pokemonId: id }, 'vendanota').ok; return { shiny: v(110), p5: v(111), item: v(112), inicial: v(115), time: v(4), ativo: v(3), colecao: v(120), inexistente: v(999999) }; });
await sleep(1500);
ok(Object.values(hook).every((x) => x === false), `hook recusa shiny, P5, item, inicial, time, ativo, Coleção e id inexistente (${JSON.stringify(hook)})`);
ok(!recebidos.slice(a0).some((m) => m.t === 'shop.sellPokemon'), 'nenhum protegido foi para o fio');

// vender de verdade, com limite por rodada e o de nota mais baixa primeiro
await definir('real', true); await definir('limite', 1);
await rodada(); await sleep(3500);
ok(JSON.stringify(vendas()) === '[101]', `vender de verdade, limite 1: só o de nota mais baixa (${vendas()})`);
ok((await diario()).some((t) => /vendi Rattata Nv 20/.test(t)), 'linha da venda no Diário');
await rodada(false); await sleep(1500);
ok(vendas().length === 1, `uma vez por hora: a rodada seguinte não vende (${vendas()})`);

// quem entrou sozinho na Coleção volta ao Depot antes (em rodada própria) e o Nv 50+ fica
eu.pokemons = [...eu.pokemons, PK(150, 19, 'Rattata', {})]; eu.automation.pokemonTravado = [...eu.automation.pokemonTravado, 150];
mandarEstado(); await sleep(1500);
await definir('limite', 5);
await rodada(); await sleep(7000);
ok(vendas().includes(102) && movidos().includes(150) && !vendas().includes(150), `da Coleção: quem entrou sozinho volta ao Depot e não é vendido na mesma rodada (vendas ${vendas()}, movidos ${movidos()})`);
ok(!movidos().includes(120) && !movidos().includes(121), 'quem estava guardado na Coleção e o Nv 50+ ficam');
const proibidos = [3, 4, 103, 104, 110, 111, 112, 113, 115, 120, 121, 130, 140];
ok(!vendas().some((id) => proibidos.includes(id)), `nenhum protegido vendido (${vendas()})`);

// parada de emergência no meio da rodada
for (let i = 0; i < 6; i++) eu.pokemons.push(PK(200 + i, 19, 'Rattata', {}));
mandarEstado(); await sleep(1200);
const antes = vendas().length;
const corrida = rodada();
await sleep(1000);
await page.evaluate(() => document.dispatchEvent(new CustomEvent('piloto:emergencia')));
await corrida; await sleep(4000);
const saiu = vendas().length - antes;
ok(saiu >= 0 && saiu <= 1, `parada de emergência: para no meio da rodada (${saiu} de 5 saíram)`);

// desligar a opção apaga o "vender de verdade"
await definir('ligado', false);
c = await cfg();
ok(c && c.ligado === false && c.real === false, 'desligar a opção também desliga o vender de verdade');

ok(!recebidos.some((m) => /diamante|gema|loja\.comprar|market\.criar/i.test(JSON.stringify(m))), 'nenhum pedido com Diamante, Gema ou Mercado');
const tr = await page.evaluate(() => { const I = window.__pokeidleHunt.idioma; const a = 'venda de nota baixa (simulação): venderia 2 pokémon (Rattata Nv 20 nota 1,5; Rattata Nv 20 nota 1,75) = 400 de ouro'; const b = 'venda de nota baixa: 3 ficam: é shiny'; const c = 'Vender os de nota baixa'; return [I.traduzir(a, 'en'), I.traduzir(a, 'es'), I.traduzir(b, 'en'), I.traduzir(b, 'es'), I.traduzir(c, 'en'), I.traduzir(c, 'es')]; });
ok(/^low-grade sale \(simulation\): would sell 2/.test(tr[0]) && /^venta de nota baja \(simulación\): vendería 2/.test(tr[1]) && /are shiny|shiny/.test(tr[2]) && tr[3] !== 'venda de nota baixa: 3 ficam: é shiny' && tr[4] !== 'Vender os de nota baixa' && tr[5] !== 'Vender os de nota baixa', `Diário e opção em EN/ES: ${tr[0]} | ${tr[2]}`);
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
