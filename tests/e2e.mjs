// Prova de fogo: a extensão de verdade num Chromium, numa imitação do pokeidle.io com WebSocket simulado.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const EXT = path.resolve(AQUI, '../extension');
const FAKE = path.resolve(AQUI, 'fake');
const SAIDA = path.resolve(AQUI, 'telas');
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
    const tipo = p.endsWith('.webp') ? 'image/webp' : p.endsWith('.gif') ? 'image/gif' : p.endsWith('.png') ? 'image/png' : p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : 'text/html';
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

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || /radar|piloto/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push(String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(4000);

const r = {};
r.pih = await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  return P ? { hook: !!P.hookInstalado, cofre: !!P.cofre, rotina: !!P.rotina, auto: !!P.auto, engine: !!P.engine, comandos: P.COMANDOS_DO_PILOTO.length, bloqueados: P.BLOQUEADOS.size } : null;
});
r.botao = await page.locator('button.plt-barra').count();
r.barrasRadar = await page.locator('#radar-mercado-barra').count();
await page.locator('#p-ativo').screenshot({ path: `${SAIDA}/0-barra.png` }).catch(() => {});
await page.screenshot({ path: `${SAIDA}/1-jogo.png` });

// painel "Onde caçar"
await page.locator('button.plt-barra').click();
await sleep(1500);
await page.screenshot({ path: `${SAIDA}/2-resumo.png` });
await sleep(1800); await page.locator('.plt-cats').screenshot({ path: `${SAIDA}/2-nav.png`, scale: 'device' }).catch(() => {});
await ctx.route('https://github.com/**', (rota) => rota.fulfill({ status: 200, contentType: 'text/html', body: '<title>GitHub DredsGG</title>ok' }));
await page.hover('.plt-assinatura'); await sleep(300);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/2-painel-assinatura.png` }).catch(() => {});
{
  const [aba] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), page.click('.plt-assinatura')]);
  await aba.waitForLoadState().catch(() => {});
  r.assinaturaAbriu = aba.url(); await aba.close();
  r.painelSeguiuAberto = await page.locator('.plt-janela').isVisible().catch(() => false);
  r.versaoNaPlaca = await page.locator('.plt-assinatura [data-versao]').textContent().catch(() => null);
}
r.janelaFixa = await page.evaluate(() => { const j = document.querySelector('.plt-janela'); return getComputedStyle(j).position === 'fixed' && document.documentElement.scrollHeight <= innerHeight + 2; });
// idioma e tema (1.12)
await page.click('.plt-idiomas [data-idioma="en"]'); await sleep(900);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/11-en-resumo.png` });
r.textoEn = (await page.locator('.plt-corpo-aba[data-conteudo]').innerText()).slice(0, 220).replace(/\s+/g, ' ');
await page.click('.plt-cats [data-aba="mercado"]'); await sleep(1800);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/12-en-mercado.png` });
await page.click('.plt-idiomas [data-idioma="es"]'); await sleep(900);
await page.click('.plt-cats [data-aba="rotina"]'); await sleep(1200);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/13-es-rotina.png` });
r.textoEs = (await page.locator('.plt-corpo-aba[data-conteudo]').innerText()).slice(0, 220).replace(/\s+/g, ' ');
await page.click('.plt-janela [data-acao="tema"]'); await sleep(600);
await page.click('.plt-cats [data-aba="resumo"]'); await sleep(900);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/14-claro-resumo.png` });
await page.click('.plt-cats [data-aba="mercado"]'); await sleep(1500);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/15-claro-mercado.png` });
await page.click('.plt-cats [data-aba="cofre"]'); await sleep(900);
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/16-claro-cofre.png` });
r.tema = await page.evaluate(() => document.documentElement.dataset.pilotoTema);
await page.click('.plt-idiomas [data-idioma="pt"]'); await sleep(700);
r.textoPtDeVolta = (await page.locator('.plt-corpo-aba[data-conteudo]').innerText()).slice(0, 120).replace(/\s+/g, ' ');
await page.click('.plt-janela [data-acao="tema"]'); await sleep(400);
await page.click('.plt-cats [data-aba="resumo"]'); await sleep(500);
// Cofre ao vivo (1.12.2): com o foco no botão da aba (sem clicar fora), muda sozinho em ~1 s.
await page.click('.plt-cats [data-aba="cofre"]'); await sleep(600);
await page.evaluate(() => { window.__pokeidleHunt.cofre._interno.estado().gasto.mercado = 777777; });
await sleep(1600);
r.cofreAoVivo = await page.locator('[data-conteudo] .plt-k.k-gasto strong').innerText().catch(() => null);
await page.evaluate(() => { const st = window.__pokeidleHunt.cofre._interno.estado(); st.dia = '2000-01-01'; });
await sleep(1600);
r.cofreVirouDia = await page.locator('[data-conteudo] .plt-k.k-gasto strong').innerText().catch(() => null);
await page.click('.plt-cats [data-aba="resumo"]'); await sleep(500);
r.resumo = (await page.locator('.plt-corpo-aba[data-conteudo]').innerText()).slice(0, 300).replace(/\s+/g, ' ');
await page.locator('.plt-cats [data-aba="hunts"]').click();
await sleep(2500);
await page.screenshot({ path: `${SAIDA}/2-onde-cacar.png` });
r.linhas = await page.locator('.plt-janela .pih-lista tbody tr').count();
r.melhor = (await page.locator('.plt-janela .pih-melhor').innerText().catch(() => '')).replace(/\s+/g, ' ');
// ouro/h
await page.locator('.plt-janela [data-escolha="ui:ordem"][data-valor="ouro"]').click();
await sleep(1500);
r.melhorOuro = (await page.locator('.plt-janela .pih-melhor').innerText().catch(() => '')).replace(/\s+/g, ' ');
await page.screenshot({ path: `${SAIDA}/3-ouro.png` });
for (const aba of ['meta', 'rotina', 'cofre', 'mercado']) {
  await page.locator(`.plt-cats [data-aba="${aba}"]`).click();
  await sleep(1200);
  r[`aba_${aba}`] = (await page.locator('.plt-corpo-aba[data-conteudo]').innerText().catch(() => '')).slice(0, 160).replace(/\s+/g, ' ');
  await page.screenshot({ path: `${SAIDA}/4-${aba}.png` });
}
r.radarEncaixado = await page.evaluate(() => !!document.querySelector('#piloto-slot-mercado #radar-mercado-tela'));
// volta da aba Mercado: o radar sai do slot
await page.locator('.plt-cats [data-aba="resumo"]').click();
await sleep(500);
r.radarSoltou = await page.evaluate(() => !document.querySelector('#piloto-slot-mercado') && !!document.querySelector('body > #radar-mercado-tela'));
// liga o Passe pela UI e confere que o comando sai
await page.locator('.plt-cats [data-aba="rotina"]').click();
await sleep(600);
await page.locator('.plt-janela [data-alternar="rotina:passe.ligado"]').click();
await page.evaluate(() => window.__pokeidleHunt.rotina._interno.tique());
await sleep(1500);
r.passeSaiu = recebidos.some((m) => m.t === 'passe.resgatar');
r.tiposRecebidos = [...new Set(recebidos.map((m) => m.t))];

// botão único: Automático
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click();
await sleep(2500);
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
r.radarCfg = await sw.evaluate(async () => { const c = (await chrome.storage.local.get('radar:config'))['radar:config'] || {}; return { radarLigado: c.radarLigado, compraAutomatica: c.compraAutomatica, compraAutomaticaPokemon: c.compraAutomaticaPokemon, revendaAutomatica: c.revendaAutomatica, ajusteAutomatico: c.ajusteAutomatico }; });
r.pilotoAuto = await page.evaluate(() => ({ modo: localStorage.getItem('piloto:modo:v1'), auto: JSON.parse(localStorage.getItem('pokeidle-hunt:auto:v1') || '{}').hunt?.ligado, repor: JSON.parse(localStorage.getItem('pokeidle-hunt:auto:v1') || '{}').repor?.ligado, rotina: JSON.parse(localStorage.getItem('piloto:rotina:v1') || '{}').cfg?.passe?.ligado, cofre: window.__pokeidleHunt.cofre.resumo().ligado }));
for (let i = 0; i < 40 && !recebidos.some((m) => m.t === 'market.criar'); i++) await sleep(1000);
r.tiposAteAgora = [...new Set(recebidos.map((m) => m.t))];
r.revendaCriou = recebidos.filter((m) => m.t === 'market.criar').map((m) => ({ itemId: m.itemId, qtd: m.qtd, preco: m.preco, moeda: m.moeda }));
// oferta 60% abaixo aparece: o automático tem que comprar sozinho
await page.keyboard.press('Escape');
ofertaFake.libera = Date.now() + 40000; // as duas liberam no mesmo instante
ofertaFake.on = true;
page.waitForSelector('.plt-toast', { timeout: 120000 }).then(async () => { await sleep(400); await page.screenshot({ path: `${SAIDA}/7-toast.png` }); r.toastVisto = true; }).catch(() => {});
const desde = recebidos.length;
for (let i = 0; i < 130 && recebidos.filter((m) => m.t === 'market.comprar').length < 2; i++) await sleep(1000);
await sleep(600);
await page.screenshot({ path: `${SAIDA}/7-mini.png` });
r.toasts = await page.locator('.plt-toast').count();
r.fichas = await page.locator('.plt-ficha').count();
await page.locator('.plt-ficha').first().hover();
await sleep(1500);
await page.screenshot({ path: `${SAIDA}/9-pop.png` });
r.popVisivel = await page.locator('.plt-pop:not([hidden])').count();
r.popMesmoNo = await page.evaluate(() => { const f = document.querySelector('.plt-ficha'); const a = f; return new Promise((ok) => setTimeout(() => ok(document.querySelector('.plt-ficha') === a), 2200)); });
await sleep(4500);
await page.screenshot({ path: `${SAIDA}/8-mini-fim.png` });
r.fichasEstados = await page.locator('.plt-ficha').evaluateAll((els) => els.map((e) => e.dataset.estado));
r.painelAbriuSozinho = await page.locator('.plt-janela').count();
await page.locator('button.plt-barra').click();
await sleep(1000);
r.comprasParalelas = recebidos.filter((m) => m.t === 'market.comprar').map((m) => ({ id: m.id, em: m._em }));
r.depoisDaOferta = recebidos.slice(desde).map((m) => m.t + (m.itemId ? ':' + m.itemId : '')).join(',');
r.compraAuto = recebidos.filter((m) => m.t === 'market.comprar').map((m) => ({ id: m.id, qtd: m.qtd, preco: m.preco, moeda: m.moeda }));
const antesItens = recebidos.filter((m) => m.t === 'market.itens').length;
await sleep(12000);
r.varredurasEm12s = recebidos.filter((m) => m.t === 'market.itens').length - antesItens;
const ultimos = recebidos.filter((m) => m._em > Date.now() - 12000 && /^market\.(itens|item|listar|meus|historico)/.test(m.t));
r.leiturasEm12s = ultimos.length;
r.leiturasPorSegundoMax = Math.max(0, ...ultimos.map((m) => ultimos.filter((x) => Math.abs(x._em - m._em) < 1000).length));
await ctx.route('https://topidle.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>TopIdle</title>voto' }));
await page.evaluate(() => { window.__ev = []; document.addEventListener('piloto:voto-abrir', (e) => window.__ev.push(e.detail)); });
sw.on('console', (m) => erros.push('sw: ' + m.text()));
await page.evaluate(() => {
  const b = document.createElement('button'); b.id = 'btn-votar'; b.className = 'tem-voto';
  b.onclick = () => {
    window.__votoAberto = (window.__votoAberto || 0) + 1;
    const m = document.createElement('div'); m.className = 'modal-caixa'; m.id = 'modal-voto-fake';
    m.innerHTML = '<div class="modal-topo"><h2>Vote</h2><button>x</button></div><div id="vt-corpo"></div>';
    m.querySelector('button').onclick = () => m.remove();
    document.body.append(m);
    setTimeout(() => { const a = document.createElement('a'); a.id = 'vt-ir'; a.href = 'https://topidle.com/votar/pokeidle-io-5f9969?nick=Dreds'; a.target = '_blank'; m.querySelector('#vt-corpo').append(a); }, 600);
  };
  document.body.append(b);
});
let abaVoto = null;
await sleep(15000);

r.eventosVoto = await page.evaluate(() => ({ ev: window.__ev, cliques: window.__votoAberto, temBtn: !!document.getElementById('btn-votar'), ls: localStorage.getItem('piloto:voto:v1') }));
r.paginas = ctx.pages().map((pg) => pg.url());
r.votoAbriuAba = await (ctx.serviceWorkers()[0]).evaluate(async () => ({ abas: (await chrome.tabs.query({})).map((t) => t.url || t.pendingUrl), sess: await chrome.storage.session.get('voto:aba') }));
r.modalFechou = await page.evaluate(() => !document.getElementById('modal-voto-fake'));
await page.evaluate(() => document.getElementById('btn-votar').classList.remove('tem-voto'));
await sleep(8000);
r.abaVotoFechou = await (ctx.serviceWorkers()[0]).evaluate(async () => { const s = await chrome.storage.session.get('voto:aba'); return { sess: s['voto:aba'] ?? null, abas: (await chrome.tabs.query({})).length }; });
if (!(await page.locator('.plt-janela').count())) { await page.locator('button.plt-barra').click(); await sleep(1000); }
r.semPopup = await sw.evaluate(() => !chrome.runtime.getManifest().action.default_popup && !chrome.runtime.getManifest().options_ui);
await page.locator('.plt-cats [data-aba="resumo"]').click();
await sleep(800);
await page.screenshot({ path: `${SAIDA}/5-automatico.png` });
const fotoAbas = async (pref) => {
  for (const aba of ['resumo', 'hunts', 'meta', 'rotina', 'mercado', 'cofre']) {
    await page.locator(`.plt-cats [data-aba="${aba}"]`).click();
    await sleep(aba === 'mercado' ? 1800 : 900);
    await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/${pref}-${aba}.png` }).catch(() => {});
  }
};
await fotoAbas('20-auto');
// Auto: a faixa do Radar tem os 4 interruptores e a aba Ajustes some
await page.locator('.plt-cats [data-aba="mercado"]').click();
await sleep(1500);
r.autoFaixa = await page.evaluate(() => { const sh = document.querySelector('#radar-mercado-tela').shadowRoot; const f = sh.querySelector('.faixa'); return { visivel: !f.hidden, n: f.querySelectorAll('.cfg-toggle').length, ajustesEscondida: sh.querySelector('.aba[data-aba="ajustes"]').hidden }; });
await page.locator('#radar-mercado-tela .faixa [data-cfg="compraAutomaticaPokemon"]').click();
await sleep(1500);
r.autoDesligouUm = await sw.evaluate(async () => { const g = await chrome.storage.local.get(['radar:config', 'radar:auto-escolhas']); return { pk: g['radar:config'].compraAutomaticaPokemon, itens: g['radar:config'].compraAutomatica, escolhas: g['radar:auto-escolhas'] }; });
r.autoContinua = await page.evaluate(() => localStorage.getItem('piloto:modo:v1'));
await page.locator('.plt-janela .plt-modo-bt[data-modo="manual"]').click();
await sleep(1500);
await fotoAbas('21-manual');
await page.locator('.plt-cats [data-aba="mercado"]').click();
await sleep(1200);
await page.locator('#radar-mercado-tela .aba[data-aba="ajustes"]').click();
await sleep(1500);
r.ajustes = (await page.locator('#radar-mercado-tela .ajustes').innerText().catch(() => '')).slice(0, 700).replace(/\s+/g, ' ');
await page.locator('.plt-janela').screenshot({ path: `${SAIDA}/6-ajustes.png` }).catch(() => {});
await page.locator('.plt-janela .plt-modo-bt[data-modo="desligado"]').click();
await sleep(1500);
await fotoAbas('22-off');
r.offTravado = await page.evaluate(() => [...document.querySelectorAll('.plt-janela .plt-corpo-aba .cfg-toggle')].filter((b) => !b.disabled).length);

r.erros = erros;
console.log(JSON.stringify(r, null, 2));
await ctx.close();
