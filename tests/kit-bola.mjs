// Item 3 da auditoria de 2026-11-06: a Ultra Ball marcada chegou a 0 e a Reposição não repôs.
// O extrato da conta mostra 06/11 sem nenhuma compra de loja das 06:33 às 21:13. Hipótese testada aqui:
// na 1.51.0, com o kit recusado pelo hook (Golden Potion) e a poção marcada sem estoque, o conferirKit
// deixava um pedido "pendente" a cada volta e a avaliarReposicao saía antes de comprar qualquer coisa.
//   node kit-bola.mjs [pasta-da-extensao]
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
let reviveExtra = false; // um revive que o hook não aceita: recusa natural do kit
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (arq === 'assets/items.json' && reviveExtra) {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    (j.items || j).push({ id: 210, name: 'Teste Revive', category: 'revive', npcPrice: 1, revivePct: 1 });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  }
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
// como o welcome real manda (2026-11-06): a bola tem priceGold no catalogoBolas; a Golden Potion só npcPrice
const GOLDEN = { id: 70070, name: 'Golden Potion', icon: '/img/itens/golden-potion.png', category: 'heal', rare: true, npcPrice: 2500, healPct: 0.5 };
const BOLAS = [{ id: 1, nome: 'Poke Ball', priceGold: 5, compravel: true, catchRate: 1 }, { id: 4, nome: 'Ultra Ball', priceGold: 130, compravel: true, catchRate: 4 }];
let eu = null;
let ignoraAutoSet = false; // o servidor aceita o auto.set calado e não muda nada
const estadoBase = (extra = {}) => ({
  id: 7, nick: 'Trainer', gold: 236_000_000, level: 1211, xp: 1, activeId: 1, huntSlug: 'rattata_1', servidorAgora: Date.now(),
  automation: { ballIds: [4], potionIds: [204], reviveIds: [206], hpLimiar: 0.3, autoPotion: true, autoRevive: true },
  balls: { 4: 0 }, items: { 204: 0, 70070: 53, 205: 92, 206: 18 },
  casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
  pokemons: [{ id: 1, slot: 0, level: 1203, xp: 1, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 90000, ivs, stats: { hp: 2363, atk: 2000, def: 1800, spAtk: 2000, spDef: 1800, speed: 900 }, maxHp: 28356, hp: 28356 }],
  ...extra,
});
const welcome = () => ({
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, GRASS: 2 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: BOLAS, itensNossos: [GOLDEN],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: eu,
});
const recebidos = [];
let wsAtual = null;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  wsAtual = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'auto.set' && !ignoraAutoSet) { const { t, ...r } = o; eu.automation = { ...eu.automation, ...r }; ws.send(JSON.stringify({ t: 'estado', estado: { automation: eu.automation, servidorAgora: Date.now() } })); }
    if (o.t === 'shop.buy') {
      const preco = o.kind === 'ball' ? BOLAS.find((b) => b.id === o.id).priceGold : ({ 204: 1500, 205: 600, 206: 2500, 70070: 2500 })[o.id] ?? 1;
      eu.gold -= preco * o.qty;
      if (o.kind === 'ball') eu.balls[o.id] = (eu.balls[o.id] || 0) + o.qty; else eu.items[o.id] = (eu.items[o.id] || 0) + o.qty;
      ws.send(JSON.stringify({ t: 'estado', estado: { gold: eu.gold, balls: eu.balls, items: eu.items, servidorAgora: Date.now() } }));
    }
  });
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
  setInterval(() => { try { ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })); } catch { /* fechou */ } }, 2000);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); localStorage.removeItem('pokeidle-hunt:consumo:v1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
const compras = () => recebidos.filter((m) => m.t === 'shop.buy');
const dasBolas = () => compras().filter((m) => m.kind === 'ball' && m.id === 4);
const linhasKit = () => page.evaluate(() => window.__pokeidleHunt.auto.diario().filter((d) => /automações do jogo/.test(d.txt)).map((d) => d.txt));
const rodada = async (extra, antesDeLigar, espera = 22000) => {
  eu = estadoBase(extra); recebidos.length = 0;
  await page.goto('https://pokeidle.io/app');
  await sleep(4000);
  if (antesDeLigar) await page.evaluate(antesDeLigar);
  const auto = await page.evaluate(() => window.__pokeidleHunt.modo.atual());
  if (auto !== 'automatico') {
    await page.locator('button.plt-barra').click(); await sleep(800);
    await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(800);
    await page.keyboard.press('Escape');
  }
  await sleep(espera);
};
const resumo = () => compras().map((m) => `${m.kind}${m.id}×${m.qty}`).join(' ') || 'nenhuma';

// 1) o caso da conta: caçando, Ultra Ball 0, Ultimate Potion (marcada) 0, o kit pede a Golden Potion
await rodada({});
console.log(`   caçando: compras ${resumo()} · linhas do kit ${(await linhasKit()).length}`);
ok(dasBolas().length >= 1, `caçando, bola marcada em 0: a Reposição compra a Ultra Ball (${resumo()})`);
ok((await linhasKit()).length === 1, `o kit é aplicado uma vez só (${(await linhasKit()).length} linhas)`);

// 2) o mesmo, parado no Centro
await rodada({ noCentro: true });
console.log(`   no Centro: compras ${resumo()}`);
ok(dasBolas().length >= 1, `no Centro: compra a Ultra Ball (${resumo()})`);

// 3) com o Caçar o meta ligado (H4)
await rodada({}, () => {
  const c = window.__pokeidleHunt.metaCaca._interno.cfg();
  c.alvos = [{ meta: 'Rattata', metaId: 19, raiz: 19, membros: [{ id: 19, nome: 'Rattata', estagio: 0 }], capturadoId: null, tinhaId: null, tinha: false, espera: null }];
  c.ligado = true; c.fim = null; c.soBom = true; c.notaMin = 5;
});
const meta = await page.evaluate(() => window.__pokeidleHunt.metaCaca.ativo());
console.log(`   Caçar o meta ativo: ${meta} · compras ${resumo()}`);
ok(meta === true && dasBolas().length >= 1, `Caçar o meta ligado: compra a Ultra Ball (meta ${meta}, ${resumo()})`);
await page.evaluate(() => { const c = window.__pokeidleHunt.metaCaca._interno.cfg(); c.ligado = false; c.alvos = []; });

// 4) o kit recusado de verdade (um revive que o hook não aceita) não pode travar a compra da bola
reviveExtra = true;
await rodada({ items: { 204: 500, 70070: 53, 205: 92, 206: 0 } });
const kit4 = await page.evaluate(() => { const k = window.__pokeidleHunt.auto._interno.escolherKit({ ouroH: 0, livre: 1e12 }); return k && k.revive.id; });
const ls4 = await linhasKit();
console.log(`   kit recusado: revive do kit ${kit4} · compras ${resumo()} · ${ls4.length} linhas`);
ok(kit4 === 210, `o kit quer o revive que o hook recusa (${kit4})`);
ok(dasBolas().length >= 1, `kit recusado: a bola em 0 é comprada mesmo assim (${resumo()})`);
ok(recebidos.filter((m) => m.t === 'auto.set').length === 0, 'kit recusado: nada de auto.set sai');
reviveExtra = false;

// 4b) o pedido passa pelo hook, mas o servidor não aplica: a compra não pode travar nem o pedido repetir
ignoraAutoSet = true;
await rodada({}, null, 75000);
const envios = recebidos.filter((m) => m.t === 'auto.set').length;
const ls4b = await linhasKit();
console.log(`   servidor não aplica: ${envios} auto.set · compras ${resumo()} · ${JSON.stringify(ls4b).slice(0, 260)}`);
ok(dasBolas().length >= 1, `servidor não aplica o kit: a bola em 0 é comprada mesmo assim (${resumo()})`);
ok(envios === 1, `servidor não aplica o kit: o pedido não fica repetindo (${envios} envios em 75 s)`);
ok(ls4b.filter((t) => /não aplicou/.test(t)).length === 1, `servidor não aplica o kit: uma linha de aviso no Diário (${ls4b.length} linhas do kit)`);
const vig4b = await page.evaluate(() => window.__pokeidleHunt.auto._interno.itensVigiados().map((i) => i.chave));
ok(vig4b.includes('i204') && !vig4b.includes('i70070'), `servidor não aplica o kit: a Reposição volta a seguir o que está marcado (${vig4b})`);
ignoraAutoSet = false;

// 5) o Cofre segue como trava final: sem ouro, não compra
await rodada({ gold: 100 });
console.log(`   sem ouro: compras ${resumo()}`);
ok(dasBolas().length === 0, `sem ouro, o Cofre não deixa comprar a bola (${resumo()})`);

ok(!recebidos.some((m) => /diamante|gema|loja\.comprar/i.test(JSON.stringify(m))), 'nenhum pedido com Diamante ou Gema');
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
