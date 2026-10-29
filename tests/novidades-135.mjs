// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas-135');
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
    id: 7, nick: 'Trainer', gold: 60000, level: 50, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [4], potionIds: [201], reviveIds: [205], autoPotion: true, autoRevive: true, autoVoltarHunt: true, hpLimiar: 0.5, pokemonTravado: [100] }, balls: { 4: 1424 }, items: { 201: 1562, 205: 50 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
      { id: 4, slot: 1, level: 12, xp: 2000, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.0, potencia: 1, ivs: { hp: 10, atk: 10, def: 10, spAtk: 10, spDef: 10, speed: 10 }, stats: { hp: 30, atk: 12, def: 15, spAtk: 13, spDef: 15, speed: 10 }, maxHp: 360, hp: 360 },
      { id: 10, slot: null, level: 28, xp: 1, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 3100, ivs: { hp: 20, atk: 22, def: 18, spAtk: 24, spDef: 18, speed: 20 }, stats: { hp: 95, atk: 60, def: 50, spAtk: 70, spDef: 55, speed: 66 }, maxHp: 1140, hp: 1140 },
      { id: 11, slot: null, level: 9, xp: 1, nome: 'Rattata', speciesId: 19, tipos: ['NORMAL'], quality: 0.9, potencia: 1, poder: 300, ivs: { hp: 8, atk: 8, def: 8, spAtk: 8, spDef: 8, speed: 8 }, stats: { hp: 24, atk: 14, def: 10, spAtk: 8, spDef: 10, speed: 20 }, maxHp: 288, hp: 288 },
      { id: 12, slot: null, level: 6, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.5, potencia: 4, poder: 420, shiny: true, ivs: { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 30, speed: 30 }, stats: { hp: 22, atk: 13, def: 11, spAtk: 14, spDef: 12, speed: 15 }, maxHp: 264, hp: 264 },
      { id: 100, slot: null, level: 20, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.6, potencia: 3, poder: 900, ivs: { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 30, speed: 30 }, stats: { hp: 40, atk: 20, def: 25, spAtk: 22, spDef: 25, speed: 18 }, maxHp: 480, hp: 480 },
      { id: 13, slot: null, level: 33, xp: 1, nome: 'Squirtle', speciesId: 7, tipos: ['WATER'], quality: 1.1, potencia: 1, poder: 2200, ivs: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, speed: 15 }, stats: { hp: 80, atk: 40, def: 50, spAtk: 42, spDef: 50, speed: 33 }, maxHp: 960, hp: 960 },
    ],
  },
};

const meusFake = [];
const inv = { balls: { 4: 1424 }, items: { 201: 1562 } };
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
      auto.ballIds = (auto.ballIds || []).filter((id) => (inv.balls[id] || 0) > 0);
      auto.potionIds = (auto.potionIds || []).filter((id) => (inv.items[id] || 0) > 0);
      auto.reviveIds = (auto.reviveIds || []).filter((id) => (inv.items[id] || 0) > 0);
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




// 1.35 (pedidos do André, 28/10): Atualizar time pelo meta, Extrato, PvP ao vivo nos cantos.
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const srv = (o) => globalThis.__ws.send(JSON.stringify(o));
await page.evaluate(() => { try { localStorage.removeItem('piloto:extrato:v1'); } catch {} });
await page.evaluate(() => {
  if (!document.querySelector('#p-equipe .painel-cab-equipe')) { const p = document.createElement('div'); p.id = 'p-equipe'; p.innerHTML = '<div class="painel-cab-equipe"><b>Equipe</b><button id="btn-equipe-toggle">v</button></div>'; document.body.prepend(p); }
});
await sleep(3000);
await page.locator('button.plt-barra').click(); await sleep(1000);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(2000);
await page.keyboard.press('Escape'); await sleep(500);
// ---- E: Atualizar o time pelo meta ----
// meta de agora: Charizard (família 4-5-6), Blastoise (7-8-9), Pikachu (que você não tem)
await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  const fam = (id) => ({ 4: 4, 5: 4, 6: 4, 7: 7, 8: 7, 9: 7, 25: 25, 26: 25, 19: 19, 20: 19 })[id] ?? id;
  P.meta.agregar = () => ({ n: 20, comp: [{ speciesId: 6, nome: 'Charizard' }, { speciesId: 9, nome: 'Blastoise' }, { speciesId: 26, nome: 'Raichu' }], lista: [] });
  P.meta.familia = { ...P.meta.familia, serve: (x, a) => fam(x.speciesId) === fam(a.speciesId), raizDePk: (x) => fam(x.speciesId), raizDoMeta: (a) => fam(a.speciesId), pronta: async () => true };
  P.time.abrirAba('meta');
});
await sleep(2000);
const prev = await page.evaluate(() => { const j = document.querySelector('.plt-janela-time'); const lin = [...j.querySelectorAll('.plt-am-lin')].map((l) => [l.querySelector('b').textContent, [...l.querySelectorAll('.plt-am-pk small')].map((x) => x.textContent)]); return { lin, bt: !!j.querySelector('[data-acao="atualizar-meta"]'), cacar: !!j.querySelector('[data-acao="cacar-faltam"]') }; });
const L = Object.fromEntries(prev.lin);
ok(prev.bt && prev.cacar && L['Still to catch'] && L['Still to catch'].includes('Raichu'), `prévia: botões e "Falta caçar" Raichu (${JSON.stringify(prev.lin)})`);
ok((L['In'] || []).includes('Charmeleon') && (L['Out'] || []).includes('Charmander'), `entra o Charmeleon (o melhor da família do Charizard), sai o Charmander (${JSON.stringify(L)})`);
await page.locator('.plt-janela-time').screenshot({ path: `${SAIDA}/1-atualizar-meta.png` }).catch(() => {});
const antesA = recebidos.length;
await page.locator('.plt-janela-time [data-acao="atualizar-meta"]').click();
await sleep(1500);
const est = await page.evaluate(() => ({ comp: window.__pokeidleHunt.time._interno.cfg().compEstavel, sessao: !!window.__pokeidleHunt.time.emSessao(), status: (document.querySelector('.plt-janela-time [data-linha="atualizar-meta"] .plt-l-status') || {}).textContent }));
ok(est.comp && est.comp.topo && est.comp.topo.lista.map((x) => x.nome).join(',') === 'Charizard,Blastoise,Raichu', `a comp do time virou a do meta de agora (${JSON.stringify(est.comp && est.comp.topo && est.comp.topo.lista)})`);
ok(est.sessao || /Centro|time já|nada para trocar/.test(est.status || ''), `troca no Centro começou ou não havia o que trocar (${est.status})`);
await page.keyboard.press('Escape'); await sleep(400);
// ---- F: Extrato ----
await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  // a loja pelo cofre (uma compra de bola e uma de poção)
  const r1 = P.cofre.autorizar({ t: 'shop.buy', kind: 'ball', id: 1, qty: 200 }, 'hunt');
  const r2 = P.cofre.autorizar({ t: 'shop.buy', kind: 'item', id: 201, qty: 50 }, 'hunt');
  // uma reserva devolvida some do extrato
  const r3 = P.cofre.autorizar({ t: 'shop.buy', kind: 'item', id: 205, qty: 3 }, 'hunt');
  P.cofre.estornar(r3.reserva);
  // o Radar: compra dele, e a mesma compra no histórico do jogo (gêmeas), e uma venda
  const agora = Date.now();
  document.dispatchEvent(new CustomEvent('piloto:extrato', { detail: JSON.stringify({ lista: [{ id: 'r:900', em: agora - 60000, tipo: 'gasto', fonte: 'mercado', origem: 'radar', nome: 'Fire Stone', qtd: 3, valor: 6000, itemId: 300 }] }) }));
  document.dispatchEvent(new CustomEvent('piloto:extrato', { detail: JSON.stringify({ lista: [{ id: 'hc:55', em: agora - 50000, tipo: 'gasto', fonte: 'mercado', origem: 'mercado', nome: 'Fire Stone', qtd: 3, valor: 6000, itemId: 300 }, { id: 'hv:56', em: agora - 7200000, tipo: 'entrada', fonte: 'mercado', origem: 'mercado', nome: 'Leaf Stone', qtd: 2, valor: 9300, itemId: 301 }, { id: 'hc:57', em: agora - 90000000, tipo: 'gasto', fonte: 'mercado', origem: 'mercado', nome: 'Charmander', qtd: 1, valor: 120000, speciesId: 4 }] }) }));
  P.extrato.depotVendido(12);
});
// a venda do Depot: o ouro sobe logo depois
const ouro = await page.evaluate(() => { let e = null; window.__pokeidleHunt.on('estado', (x) => { e = x; }); return e.gold; });
srv({ t: 'estado', estado: { gold: ouro + 4321 } });
await sleep(1200);
const lista = await page.evaluate(() => window.__pokeidleHunt.extrato.lista().map((e) => `${e.id.split(':')[0]}|${e.fonte}|${e.nome}|${e.qtd}|${e.valor}|${e.origem}`));
ok(lista.some((x) => /^c\|loja\|Poke Ball\|200\|2000\|/.test(x)) && lista.some((x) => /^c\|loja\|Great Potion\|50\|7500\|/.test(x)), `loja pelo cofre (${JSON.stringify(lista)})`);
ok(!lista.some((x) => /Revive/.test(x)), 'reserva devolvida saiu do extrato');
ok(lista.filter((x) => /Fire Stone/.test(x)).length === 1 && lista.some((x) => /^hc\|mercado\|Fire Stone\|3\|6000\|radar$/.test(x)), 'a compra do Radar virou a linha do jogo (uma só, com a origem Radar)');
ok(lista.some((x) => /^d\|depot\|.*\|12\|4321\|/.test(x)), 'venda do Depot pela diferença de ouro');
// a bola chegou à mochila; a poção não (o servidor recusou): só a bola fica
srv({ t: 'estado', estado: { balls: { 1: 50 + 200 } } });
await sleep(23000);
const lista2 = await page.evaluate(() => window.__pokeidleHunt.extrato.lista().map((e) => `${e.fonte}|${e.nome}`));
ok(lista2.includes('loja|Poke Ball') && !lista2.includes('loja|Great Potion'), `compra da loja que não chegou à mochila sai do extrato (${JSON.stringify(lista2)})`);
await page.locator('button.plt-barra').click(); await sleep(1000);
await page.locator('.plt-janela [data-aba="extrato"], .plt-janela .cfg-cat[data-aba="extrato"]').first().click(); await sleep(2500);
const tela = await page.evaluate(() => { const j = document.querySelector('.plt-janela'); return { linhas: j.querySelectorAll('.plt-ex-l').length, kpis: [...j.querySelectorAll('.plt-ex-kpis strong')].map((x) => x.textContent), dias: [...j.querySelectorAll('.plt-ex-dia')].map((x) => x.textContent) }; });
ok(tela.linhas >= 4 && tela.kpis.length === 3, `aba Extrato desenhada (${JSON.stringify(tela)})`);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/2-extrato-hoje.png` }).catch(() => {});
await page.locator('.plt-janela [data-escolha="extrato:periodo"][data-valor="7d"]').click(); await sleep(1500);
const tela7 = await page.evaluate(() => ({ linhas: document.querySelectorAll('.plt-janela .plt-ex-l').length, dias: [...document.querySelectorAll('.plt-janela .plt-ex-dia')].map((x) => x.textContent) }));
ok(tela7.linhas > tela.linhas && tela7.dias.length >= 2, `7 dias mostra mais (${JSON.stringify(tela7)})`);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/3-extrato-7d.png` }).catch(() => {});
await page.keyboard.press('Escape'); await sleep(400);
// ---- G: PvP ao vivo nos cantos ----
const temPlayer = await page.evaluate(async () => window.__pokeidleHunt.pvpVivo && await window.__pokeidleHunt.pvpVivo.ligar());
ok(temPlayer, 'o Piloto ligou no player da fita do jogo');
await page.evaluate(async () => {
  const m = document.createElement('div'); m.id = 'pvp-mini'; m.style.cssText = 'position:fixed;left:20px;bottom:20px;width:300px;height:190px;background:#3a5a3a;z-index:50';
  m.innerHTML = '<div class="pvp-mini-palco" style="width:100%;height:100%"><canvas id="pvp-mini-campo" width="300" height="190"></canvas></div>';
  document.body.append(m);
  const { ReplayGuerra } = await import(`${location.origin}/replay.mjs`);
  const at = (s, g, n, lt, dono) => ({ s, g, n, lt, dono, nv: 100, hp: 1000, mhp: 1000 });
  // 1.36.0: como o ranqueado é de verdade — um em campo de cada lado e as trocas na fita (q.c)
  const c = (s, n, lt) => ({ s, n, lt, nv: 100, hp: 1000, mhp: 1000 });
  const rep = { guilds: [{ nome: 'Dreds' }, { nome: 'Gotta' }], atores: [at(1, 0, 'Charizard', 6, 'Dreds'), at(4, 1, 'Pikachu', 25, 'Gotta'), { s: 9, g: 0, n: 'Dreds', tr: true }],
    quadros: [{ t: 1000, c: [c(1, 'Blastoise', 9)] }, { t: 1500, c: [c(4, 'Gengar', 94)] }, { t: 2000, c: [c(1, 'Venusaur', 3)] }] };
  const pl = new ReplayGuerra(document.getElementById('pvp-mini-campo'), rep, { mini: true });
  window.__pl = pl; await pl.iniciar();
});
await sleep(1200);
const v1 = await page.evaluate(() => { const e = document.querySelector('#pvp-mini .plt-pvv'); return e && { lados: [...e.querySelectorAll('.plt-pvv-lado')].map((l) => [l.querySelector('b').textContent, l.querySelectorAll('.plt-pvv-pk').length]) }; });
ok(v1 && v1.lados.length === 2 && v1.lados[0][1] === 3 && v1.lados[1][1] === 2, `desde o começo, todos de cada lado (${JSON.stringify(v1)})`);
const ativo0 = await page.evaluate(() => [...document.querySelectorAll('#pvp-mini .plt-pvv-pk.ativo')].map((p) => p.title));
ok(ativo0.length === 2 && ativo0.some((t) => /Charizard/.test(t)) && ativo0.some((t) => /Pikachu/.test(t)), `moldura em quem está lutando (${JSON.stringify(ativo0)})`);
await page.evaluate(() => { const pl = window.__pl; pl.estado.get(4).hp = 300; pl.estado.get(1).fora = true; pl.estado.get(1).hp = 0; pl.tv = 900; });
await sleep(800);
// a fita troca o Charizard caído pelo Blastoise (mesma vaga)
await page.evaluate(() => { const pl = window.__pl; Object.assign(pl.atores.get(1), { n: 'Blastoise', lt: 9 }); pl.estado.set(1, { hp: 1000, mhp: 1000, fora: false }); pl.tv = 1100; });
await sleep(1000);
const v2 = await page.evaluate(() => [...document.querySelectorAll('#pvp-mini .plt-pvv-pk')].map((p) => [p.title, Number(p.style.opacity), p.classList.contains('fora'), p.classList.contains('ativo')]));
ok(v2.some((x) => /Pikachu/.test(x[0]) && x[1] < 0.7 && !x[2] && x[3]) && v2.some((x) => /Charizard/.test(x[0]) && x[2] && !x[3]) && v2.some((x) => /Blastoise/.test(x[0]) && x[3]), `HP baixo apaga, quem caiu fica cinza, a moldura passa para quem entrou (${JSON.stringify(v2)})`);
await page.locator('#pvp-mini').screenshot({ path: `${SAIDA}/4-pvp-mini.png` }).catch(() => {});
await page.evaluate(() => window.__pl.destruir());
await sleep(800);
ok(!(await page.evaluate(() => !!document.querySelector('#pvp-mini .plt-pvv'))), 'a fita acabou: os cantos saem');
const errosReais = erros.filter((x) => !/Failed to load resource/.test(x) && /error|Error/.test(x));
ok(!errosReais.length, `sem erro de página (${errosReais.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 300); await ctx.close();
