// Rank do PvP dos amigos (1.49.1): a extensão de verdade num Chromium, na imitação do pokeidle.io,
// com a janela Amigos do jogo montada como no app.js (#amigos-rol > .amigo-linha[data-id], nick em
// .amigo-meta b). Confere: nada sai com o Piloto em Off; ligado, a primeira leitura sai em segundos,
// 1 perfil por vez e sem rajada; o selo mostra tier + divisão, PR e #N do top 100; "sem rank" com menos
// de 5 partidas ou sem pvpRank; reabrir e redesenhar a lista mostram o guardado na hora, sem pedir de
// novo; em segundo plano, amigos.info e o amigo novo da lista devagar; em inglês.
//   node amigos-rank.mjs [pasta-da-extensao]
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

// o módulo shared/pvp-rank.mjs do jogo (mínimo: só o que o Piloto usa)
const PVP_RANK = `
export const PVP_PARTIDAS_POSICIONAMENTO = 5;
const TIERS = [['bronze', 0], ['prata', 300], ['ouro', 600], ['platina', 900], ['diamante', 1200], ['mestre', 1500], ['challenger', 1800]];
export function rankDePontos(p) {
  let i = 0; for (let k = 0; k < TIERS.length; k++) if (p >= TIERS[k][1]) i = k;
  const [tierId, base] = TIERS[i];
  if (tierId === 'challenger') return { tierId, divisaoNum: null };
  const d = Math.min(2, Math.floor((p - base) / 100));
  return { tierId, divisaoNum: ['III', 'II', 'I'][d] };
}
export function iconeDoRank(tierId) { return '/img/ranks/' + tierId + '.webp'; }
`;

// emblema de 1×1 px (o Piloto tira o emblema que não carrega)
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
const recebidos = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/shared/pvp-rank.mjs') return route.fulfill({ status: 200, contentType: 'text/javascript', body: PVP_RANK });
  if (u.pathname.startsWith('/img/ranks/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX });
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});

const welcome = {
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, GRASS: 2 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true }],
  itensNossos: [],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'andre', gold: 1_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [], reviveIds: [] }, balls: { 1: 50 }, items: {},
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [{ id: 3, slot: 0, level: 30, xp: 9000, nome: 'Rattata', speciesId: 19, tipos: ['NORMAL'], quality: 1.2, potencia: 1, poder: 3000, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 160, atk: 90, def: 75, spAtk: 95, spDef: 80, speed: 100 }, hp: 160 }],
  },
};
// os perfis públicos que o servidor devolve (ranking.perfil)
const PERFIS = {
  befoin: { pontos: 750, tierId: 'ouro', partidas: 40, vitorias: 25, derrotas: 15 },
  Zaxa: { pontos: 1310, tierId: 'diamante', partidas: 3, vitorias: 2, derrotas: 1 }, // menos de 5 partidas: sem rank
  badboy: null, // nunca jogou o Ranqueado
  novato: { pontos: 420, tierId: 'prata', partidas: 9, vitorias: 5, derrotas: 4 },
};
const LISTA_AMIGOS = ['befoin', 'Zaxa', 'badboy', 'novato'];
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    o._em = Date.now();
    recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'ranking.perfil' && o.nick in PERFIS) setTimeout(() => ws.send(JSON.stringify({ t: 'perfil', perfil: { nick: o.nick, level: 900, pvpRank: PERFIS[o.nick], pvpTime: [], vitrine: [] } })), 120);
    if (o.t === 'amigos.info') setTimeout(() => ws.send(JSON.stringify({ t: 'amigos', lista: LISTA_AMIGOS.map((nick, i) => ({ id: 50 + i, nick, online: i % 2 === 0 })) })), 120);
  });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
  setInterval(() => ws.send(JSON.stringify({ t: 'estado', estado: { servidorAgora: Date.now() } })), 1000);
});

await ctx.addInitScript(() => {
  try {
    localStorage.setItem('piloto:dev:manual', '1'); localStorage.setItem('piloto:dev:semGuia', '1'); localStorage.setItem('piloto:idioma', 'pt');
    // o placar dos 100 primeiros que a aba Meta guarda: befoin é o #3
    if (!localStorage.getItem('piloto:meta:v1')) localStorage.setItem('piloto:meta:v1', JSON.stringify({ placar: { linhas: [{ pos: 1, nick: 'Sekhmarra' }, { pos: 3, nick: 'befoin' }] } }));
  } catch {}
});
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => erros.push('pageerror: ' + String(e)));
await page.goto('https://pokeidle.io/app');
await sleep(3500);

let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
// os perfis que o Piloto pediu desde um instante (só dos amigos: a aba Meta também lê o placar)
const perfisPedidos = (desde = 0) => recebidos.filter((o) => o.t === 'ranking.perfil' && o._em >= desde && o.nick in PERFIS);
// a janela Amigos como o jogo desenha (o jogo redesenha a lista inteira a cada mudança)
const abrirAmigos = (nicks) => page.evaluate((ns) => {
  let j = document.getElementById('amigos-janela');
  if (!j) { j = document.createElement('div'); j.id = 'amigos-janela'; j.style.cssText = 'position:fixed;right:20px;bottom:20px;width:360px;background:#222;color:#eee;z-index:5'; j.innerHTML = '<div id="amigos-rol"></div>'; document.body.appendChild(j); }
  document.getElementById('amigos-rol').innerHTML = ns.map((n, i) => `<div class="amigo-linha" data-id="${50 + i}"><span class="amigo-meta"><b>${n}</b><small>online</small></span><span class="amigo-badge">1</span></div>`).join('');
}, nicks);
const fecharAmigos = () => page.evaluate(() => { const j = document.getElementById('amigos-janela'); if (j) j.remove(); });
const selos = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#amigos-rol .amigo-linha')].map((l) => {
  const c = l.querySelector(':scope > .plt-ar-caixa');
  return [l.querySelector('.amigo-meta b').textContent, c ? { txt: c.innerText.replace(/\s+/g, ' ').trim(), antesDoBadge: c.nextElementSibling && c.nextElementSibling.classList.contains('amigo-badge'), img: (c.querySelector('img') || {}).getAttribute ? c.querySelector('img').getAttribute('src') : null } : null];
})));

// ---- 1) Piloto em Off: mostra só o que já sabe e não pede nada ----
// o interruptor geral do cofre (o mesmo do botão Desligado da janela do Piloto)
await page.evaluate(() => window.__pokeidleHunt.cofre.definirLigado(false));
const ligado = await page.evaluate(() => window.__pokeidleHunt.cofre.ligado());
await page.evaluate(() => window.__pokeidleHunt.amigosRank._interno.comecarJa());
let t0 = Date.now();
await abrirAmigos(['befoin', 'Zaxa', 'badboy']);
await sleep(3500);
let s = await selos();
ok(!ligado, `Piloto em Off antes do teste (ligado=${ligado})`);
ok(perfisPedidos(t0).length === 0 && !recebidos.some((o) => o.t === 'amigos.info' && o._em >= t0), `Off: nenhum ranking.perfil nem amigos.info (${perfisPedidos(t0).length})`);
ok(s.befoin && /…/.test(s.befoin.txt) && s.befoin.antesDoBadge, `Off: o selo fica "…" antes do contador de mensagens (${JSON.stringify(s.befoin)})`);

// ---- 2) Piloto ligado (Auto), janela aberta: a primeira leitura sai em segundos ----
const AMIGOS = ['befoin', 'Zaxa', 'badboy'];
t0 = Date.now();
await page.locator('button.plt-barra').click(); await sleep(600);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(400);
await page.locator('.plt-janela [data-acao="fechar"]').click().catch(() => {}); await sleep(200);
ok(await page.evaluate(() => window.__pokeidleHunt.cofre.ligado()), 'Auto: Piloto ligado');
let pronto = 0;
for (let i = 0; i < 40; i++) { await sleep(250); s = await selos(); if (AMIGOS.every((n) => s[n] && !/…/.test(s[n].txt))) { pronto = Date.now() - t0; break; } }
// só os perfis dos amigos (a aba Meta também lê perfis do placar quando o Piloto liga)
const pp = perfisPedidos(t0).filter((o) => AMIGOS.includes(o.nick));
ok(pronto > 0 && pronto < 8000, `3 amigos com rank em ${(pronto / 1000).toFixed(1)} s (menos de 8 s)`);
ok(pp.length === 3 && new Set(pp.map((o) => o.nick)).size === 3, `1 ranking.perfil por amigo (${pp.map((o) => o.nick).join(', ')})`);
const gaps = pp.slice(1).map((o, i) => o._em - pp[i]._em);
ok(gaps.every((g) => g >= 400), `sem rajada: intervalos de ${gaps.join(' / ')} ms entre os pedidos (o balde de leitura junta no máximo 2 seguidos)`);
ok(/Ouro II/.test(s.befoin.txt) && /750 PR/.test(s.befoin.txt) && /#3/.test(s.befoin.txt), `befoin: tier + divisão, PR e #3 do top 100 (${s.befoin.txt})`);
ok(s.befoin.img === '/img/ranks/ouro.webp', `emblema do jogo (${s.befoin.img})`);
ok(/sem rank/.test(s.Zaxa.txt), `menos de 5 partidas: "sem rank" (${s.Zaxa.txt})`);
ok(/sem rank/.test(s.badboy.txt), `sem pvpRank: "sem rank" (${s.badboy.txt})`);
const guard = await page.evaluate(() => JSON.parse(localStorage.getItem('piloto:amigosRank:v1') || '{}'));
ok(guard.befoin && guard.befoin.pontos === 750 && guard.badboy && guard.badboy.semRank, 'guardado em piloto:amigosRank:v1');

// ---- 3) fechar e reabrir: o guardado aparece na hora, sem pedir de novo ----
await fecharAmigos(); await sleep(800);
t0 = Date.now();
await abrirAmigos(['befoin', 'Zaxa', 'badboy']);
await sleep(700);
s = await selos();
ok(/Ouro II/.test(s.befoin.txt) && /sem rank/.test(s.Zaxa.txt), `reabrir: o rank aparece em menos de 1 s (${s.befoin.txt})`);
await sleep(2500);
ok(perfisPedidos(t0).length === 0, `reabrir: nenhum pedido novo para quem foi lido agora (${perfisPedidos(t0).length})`);

// ---- 4) o jogo redesenha a lista: o selo volta na hora ----
await abrirAmigos(['badboy', 'befoin', 'Zaxa']);
await sleep(150);
s = await selos();
ok(s.befoin && /Ouro II/.test(s.befoin.txt) && s.badboy && /sem rank/.test(s.badboy.txt), 'redesenho da lista: selo de volta em 150 ms');
const contagem = await page.evaluate(() => [...document.querySelectorAll('#amigos-rol .amigo-linha')].map((l) => l.querySelectorAll('.plt-ar-caixa').length));
ok(contagem.every((n) => n === 1), `um selo só por amigo (${contagem.join(',')})`);

// ---- 5) segundo plano (janela fechada): amigos.info e o amigo novo devagar ----
await fecharAmigos();
t0 = Date.now();
await page.evaluate(() => window.__pokeidleHunt.amigosRank._interno.comecarJa());
for (let i = 0; i < 20 && !recebidos.some((o) => o.t === 'amigos.info' && o._em >= t0); i++) await sleep(250);
ok(recebidos.some((o) => o.t === 'amigos.info' && o._em >= t0), 'segundo plano: pede a lista de amigos (amigos.info)');
await sleep(800);
const lista = await page.evaluate(() => window.__pokeidleHunt.amigosRank._interno.lista());
ok(lista.join(',') === LISTA_AMIGOS.join(','), `a lista que o servidor mandou chegou ao módulo (${lista.join(',')})`);
for (let i = 0; i < 44 && !perfisPedidos(t0).some((o) => o.nick === 'novato'); i++) await sleep(250);
const pn = perfisPedidos(t0);
ok(pn.length === 1 && pn[0].nick === 'novato', `segundo plano: lê só quem não tem rank (o novato) (${pn.map((o) => o.nick).join(',')})`);
await sleep(3000);
ok(perfisPedidos(t0).length === 1, 'segundo plano: sem pedido extra logo depois (ritmo de 8 s, e os outros estão em dia)');
const gNov = await page.evaluate(() => (JSON.parse(localStorage.getItem('piloto:amigosRank:v1') || '{}').novato || null));
ok(gNov && gNov.tierId === 'prata', 'o novato ficou guardado sem a janela aberta');

// ---- 6) em inglês ----
await page.evaluate(() => window.__pokeidleHunt.idioma.definir('en'));
await abrirAmigos(['befoin', 'Zaxa', 'novato']);
await sleep(700);
s = await selos();
ok(/Gold II/.test(s.befoin.txt) && /unranked/.test(s.Zaxa.txt) && /Silver/.test(s.novato.txt), `em inglês (${s.befoin.txt} · ${s.Zaxa.txt} · ${s.novato.txt})`);

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
