// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-idioma');
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
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : 'text/html';
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
    ],
  },
};

const meusFake = [];
const ofertaFake = { on: false };
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    o._em = Date.now();
    recebidos.push(o);
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
await page.goto('https://pokeidle.io/app');
await sleep(4000);


const r = {};
await page.locator('button.plt-barra').click();
await sleep(1500);
const restos = new Map();
const PT = /[ãõçáéíóúâêôà]|\b(de|do|da|dos|das|para|com|não|sem|hoje|quando|cada|ligado|desligado|agora|vender|comprar|até|ou|em|no|na|ao|só|por|todos|todas|quem|pedra|proibida|categoria|análise|entra|ordenar|livre|vez|mais|menos|tudo|nada|ainda|ver|abrir|fechar|vel)\b/i;
const coletar = async (onde, sel = '.plt-janela') => {
  const lista = await page.evaluate((sel) => {
    const out = [];
    const raizes = [...document.querySelectorAll(sel)];
    for (const h of document.querySelectorAll('radar-mercado-tela, #radar-mercado-tela')) if (h.shadowRoot) raizes.push(h.shadowRoot);
    for (const j of raizes) {
      const w = document.createTreeWalker(j, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const p = n.parentElement; if (p && p.closest('script,style')) continue; const t = n.nodeValue.trim(); if (t) out.push(t); }
      for (const el of j.querySelectorAll('[title],[placeholder],[aria-label]')) for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v) out.push(v.trim()); }
      for (const el of j.querySelectorAll('option')) out.push(el.textContent.trim());
    }
    return out;
  }, sel);
  for (const t of lista) if (PT.test(t) && !/^(Pokémon|Poké Ball|Plateia|Dreds|Piloto)$/i.test(t)) { if (!restos.has(t)) restos.set(t, onde); }
};
for (const idi of (process.env.IDI || 'en,es').split(',')) {
  await page.click(`.plt-idiomas [data-idioma="${idi}"]`); await sleep(700);
  for (const modo of (process.env.MODOS || 'manual,automatico,desligado').split(',')) {
    await page.locator(`.plt-janela .plt-modo-bt[data-modo="${modo}"]`).click(); await sleep(900);
    for (const aba of ['resumo', 'hunts', 'meta', 'rotina', 'mercado', 'cofre']) {
      await page.locator(`.plt-cats [data-aba="${aba}"]`).click(); await sleep(900);
      for (const aj of await page.locator('.plt-janela .cfg-ajuda').all()) await aj.click().catch(() => {});
      await sleep(300);
      await coletar(`${idi}/${modo}/${aba}`);
      if (aba === 'mercado') {
        // as sub-abas do Radar (Avisos, Ofertas, Compras, Vendas, Revenda, Lucro, Ajustes)
        const subs = await page.evaluate(() => { const out = []; const raizes = [document, ...[...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot)]; for (const r of raizes) for (const b of r.querySelectorAll('[data-aba-radar], .rm-abas button, [data-sub], .abas button')) out.push(b.textContent.trim()); return out; });
        for (let k = 0; k < subs.length; k++) {
          await page.evaluate((k) => { const raizes = [document, ...[...document.querySelectorAll('*')].filter((e) => e.shadowRoot).map((e) => e.shadowRoot)]; const bs = []; for (const r of raizes) for (const b of r.querySelectorAll('[data-aba-radar], .rm-abas button, [data-sub], .abas button')) bs.push(b); bs[k] && bs[k].click(); }, k);
          await sleep(500);
          await coletar(`${idi}/${modo}/mercado:${subs[k]}`);
        }
      }
    }
  }
  // a janela Time e a aba Meta
  await page.keyboard.press('Escape'); await sleep(300);
  if (await page.locator('#p-equipe .plt-time-bt').count()) {
    await page.locator('#p-equipe .plt-time-bt').click(); await sleep(1500);
    for (const aj of await page.locator('.plt-janela-time .cfg-ajuda').all()) await aj.click().catch(() => {});
    await coletar(`${idi}/time`, '.plt-janela-time');
    await page.evaluate(() => window.__pokeidleHunt.time.abrirAba('meta')); await sleep(1200);
    await coletar(`${idi}/time-meta`, '.plt-janela-time');
    await page.keyboard.press('Escape'); await sleep(300);
  }
  await page.locator('button.plt-barra').click(); await sleep(1200);
}
console.log(JSON.stringify([...restos].map(([t, o]) => `${o} | ${t}`), null, 1));
setTimeout(() => process.exit(0), 200);
await ctx.close();
