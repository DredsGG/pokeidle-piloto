// 1.34 (pedido de um amigo do André): Alvos de compra no Manual — teto em ouro e quantidade por item; limites editáveis. Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-alvos');
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
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2, 300: 1, 301: 2 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
    ],
  },
};



const meusFake = [];
let ganhar = true;
let pkOn = false;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => {
    const o = JSON.parse(m); o._em = Date.now(); recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'market.itens') ws.send(JSON.stringify({ t: 'market', aba: 'itens', resumo: { 300: { minGold: 9000, anuncios: 3, unidades: 9 }, 301: { minGold: 5000, anuncios: 2, unidades: 5 } }, medias: { 300: { gold: { media: 9000, unidades: 900 } }, 301: { gold: { media: 6000, unidades: 900 } } } }));
    if (o.t === 'market.listar') {
      const ivs = { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, speed: 20 };
      const linhas = pkOn && o.tipo === 'pokemon' && o.moeda === 'gold' ? [
        { id: 850, tipo: 'pokemon', pokemonId: 650, preco: 4e6, moeda: 'gold', estado: 'aberto', vendedorId: 71, ficha: { speciesId: 7, nome: 'Squirtle', level: 60, nota: 3.0, potencia: 5, quality: 1.2, ivTotal: 120, ivs } },
        { id: 851, tipo: 'pokemon', pokemonId: 651, preco: 9e6, moeda: 'gold', estado: 'aberto', vendedorId: 72, ficha: { speciesId: 7, nome: 'Squirtle', level: 60, nota: 3.0, potencia: 5, quality: 1.2, ivTotal: 120, ivs } },
      ] : [];
      ws.send(JSON.stringify({ t: 'market', aba: 'vitrine', ordem: o.ordem, pagina: o.pagina ?? 0, seq: o.seq, linhas, total: linhas.length }));
    }
    if (o.t === 'market.historico') ws.send(JSON.stringify({ t: 'market', aba: 'historico', seq: o.seq, linhas: [] }));
    if (o.t === 'market.meus') ws.send(JSON.stringify({ t: 'market', aba: 'meus', linhas: meusFake }));
    if (o.t === 'market.historicoCompras') ws.send(JSON.stringify({ t: 'market', aba: 'historicoCompras', seq: o.seq, linhas: [] }));
    if (o.t === 'market.item' && Number(o.itemId) === 300) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 300, moeda: 'gold', linhas: [{ id: 901, preco: 9000, qtd: 3, vendedorId: 55, estado: 'aberto' }] }));
    if (o.t === 'market.item' && Number(o.itemId) === 301) ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: 301, moeda: 'gold', linhas: [{ id: 911, preco: 5000, qtd: 3, vendedorId: 57, estado: 'aberto' }, { id: 912, preco: 5300, qtd: 2, vendedorId: 58, estado: 'aberto' }] }));
    if (o.t === 'market.comprar') {
      const id = o.id;
      ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'mktSorteio', id, fase: 'entrou', total: 2, quem: ['andre'] }] }));
      setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: ganhar ? [{ k: 'mktSorteio', id, fase: 'fim', ok: true, descricao: `${o.qtd}× Leaf Stone`, total: 2, levaram: [{ nick: 'andre', sobra: 0 }] }, { k: 'marketComprado', descricao: `${o.qtd}× Leaf Stone`, valor: o.qtd * o.preco, moeda: 'gold' }] : [{ k: 'mktSorteio', id, fase: 'fim', perdeu: true, total: 2, levaram: [{ nick: 'zeca', sobra: 0 }] }] })), 1500);
    }
  });
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
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
// Manual: o Piloto avisa o radar
await page.locator('button.plt-barra').click(); await sleep(1200);
await page.locator('.plt-janela .plt-modo-bt[data-modo="manual"]').click(); await sleep(1500);
// a aba Mercado do Piloto: o radar encaixado, com a aba Alvos (só no Manual)
await page.locator('.plt-cats [data-aba="mercado"]').click(); await sleep(2500);
const raiz = () => page.locator('#radar-mercado-painel, [id^="radar-mercado"]').first();
const sr = (sel) => page.evaluate((s) => { for (const h of document.querySelectorAll('*')) if (h.shadowRoot && h.shadowRoot.querySelector(s)) return true; return false; }, sel);
const clicarSr = (sel) => page.evaluate((s) => { for (const h of document.querySelectorAll('*')) { const e = h.shadowRoot && h.shadowRoot.querySelector(s); if (e) { e.click(); return true; } } return false; }, sel);
const valorSr = (sel, v) => page.evaluate(([s, val]) => { for (const h of document.querySelectorAll('*')) { const e = h.shadowRoot && h.shadowRoot.querySelector(s); if (e) { e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; } } return false; }, [sel, v]);
ok(await sr('[data-aba="alvos"]:not([hidden])'), 'aba Alvos aparece no Manual');
await clicarSr('[data-aba="alvos"]'); await sleep(1500);
ok(await sr('[data-alvo-campo="item"]'), 'formulário do alvo');
await valorSr('[data-alvo-campo="item"]', 'Leaf Stone');
await valorSr('[data-alvo-campo="teto"]', '5000');
await valorSr('[data-alvo-campo="max"]', '4');
await clicarSr('[data-alvo-salvar]'); await sleep(1500);
const cfg = await sw.evaluate(async () => (await chrome.storage.local.get('radar:config'))['radar:config']);
ok(cfg && cfg.alvos && cfg.alvos.length === 1 && cfg.alvos[0].itemId === 301 && cfg.alvos[0].teto === 5000 && cfg.alvos[0].max === 4, `alvo salvo: ${JSON.stringify(cfg && cfg.alvos)}`);
await page.screenshot({ path: `${SAIDA}/1-alvos.png` });
// o radar compra no teto (Leaf Stone a 5000, 3 unidades), e nunca o de 5300
for (let i = 0; i < 90 && !recebidos.some((m) => m.t === 'market.comprar'); i++) await sleep(1000);
const compras = () => recebidos.filter((m) => m.t === 'market.comprar');
await sleep(4000);
ok(compras().length >= 1 && compras()[0].id === 911 && compras()[0].qtd === 3 && compras()[0].moeda === 'gold', `comprou pelo alvo: ${JSON.stringify(compras().map((c) => ({ id: c.id, qtd: c.qtd, preco: c.preco, moeda: c.moeda })))}`);
ok(!compras().some((c) => c.id === 912 || c.id === 901), 'nada acima do teto nem fora dos alvos');
const conta = await sw.evaluate(async () => (await chrome.storage.local.get('radar:alvos-contagem'))['radar:alvos-contagem']);
ok(conta && conta.a301 === 3, `contador do alvo: ${JSON.stringify(conta)}`);
await sleep(1500);
await page.screenshot({ path: `${SAIDA}/2-alvos-contador.png` });
ok(await page.evaluate(() => { for (const h of document.querySelectorAll('*')) { const e = h.shadowRoot && h.shadowRoot.querySelector('.alv-l small'); if (e) return /comprou 3 \/ 4/.test(e.textContent); } return false; }), 'a lista mostra "comprou 3 / 4"');
// pokémon: alvo P5 até 5 mi — compra o de 4 mi, não o de 9 mi
await page.evaluate(() => { for (const h of document.querySelectorAll('*')) { const e = h.shadowRoot && h.shadowRoot.querySelector('[data-alvo-pk-ligar="p5.ligado"]'); if (e) { e.click(); return; } } });
await sleep(800);
await valorSr('[data-alvo-pk="p5.teto"]', '5000000');
await sleep(800);
pkOn = true;
for (let i = 0; i < 120 && !compras().some((c) => c.id === 850); i++) await sleep(1000);
ok(compras().some((c) => c.id === 850) && !compras().some((c) => c.id === 851), `alvo P5: comprou o de 4 mi e não o de 9 mi (${JSON.stringify(compras().map((c) => c.id))})`);
pkOn = false;
// limites editáveis: desliga "Calcular os limites sozinho" e digita o lucro mínimo
await clicarSr('[data-aba="ajustes"]'); await sleep(1200);
await clicarSr('.cfg-toggle[data-cfg="ajusteAutomatico"]'); await sleep(1500);
ok(await sr('input[data-lim="lucroMinimo"]'), 'Manual sem cálculo automático: os limites viram campos');
await valorSr('input[data-lim="lucroMinimo"]', '123456');
await valorSr('input[data-lim="descontoMinimo"]', '30');
await sleep(1200);
const cfg2 = await sw.evaluate(async () => (await chrome.storage.local.get('radar:config'))['radar:config']);
ok(cfg2.lucroMinimo === 123456 && cfg2.lucroMinimoAuto === 123456 && Math.abs(cfg2.descontoMinimo - 0.3) < 1e-9 && cfg2.ajusteAutomatico === false, `limites salvos: ${cfg2.lucroMinimo} · ${cfg2.descontoMinimo} · auto ${cfg2.ajusteAutomatico}`);
await page.screenshot({ path: `${SAIDA}/3-limites.png` });
// recarregar no Manual não religa o cálculo automático
await page.reload(); await sleep(6000);
const cfg3 = await sw.evaluate(async () => (await chrome.storage.local.get('radar:config'))['radar:config']);
ok(cfg3.ajusteAutomatico === false && cfg3.lucroMinimo === 123456, 'F5 no Manual mantém os seus limites');
ok(!erros.length, `sem erro de página (${erros.join(' | ').slice(0, 200)})`);
console.log(falhas ? `FALHARAM ${falhas}` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
