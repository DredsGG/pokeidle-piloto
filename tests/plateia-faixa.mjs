// 1.54.1: a faixa "Farme este bônus com a Plateia" da janela do bônus da Twitch (#tw-corpo) descreve a compra
// automática do bônus de 10 h (Plateia 0.9.4+) em PT/EN/ES, sem o texto velho ("te vê assistindo", "no chat de
// todos os canais"). A faixa da Kick e o botão "Abrir a sala" não mudam.
//   node plateia-faixa.mjs [pasta-da-extensao]
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

const NOVO = {
  pt: 'A sala da Plateia toca as lives dos canais oficiais, junta os pontos do canal e compra sozinha o bônus de 10 h (XP, Capture, Secret Lure) quando o saldo do canal cobre. Precisa da Plateia 0.9.4 ou mais nova. Deixe a sala aberta.',
  en: "The Plateia room plays the official channels' lives, collects the channel points and buys the 10 h bonus by itself (XP, Capture, Secret Lure) when the channel balance covers it. Needs Plateia 0.9.4 or newer. Keep the room open.",
  es: 'La sala de Plateia reproduce las lives de los canales oficiales, junta los puntos del canal y compra sola el bono de 10 h (XP, Capture, Secret Lure) cuando el saldo del canal lo cubre. Requiere Plateia 0.9.4 o más nueva. Deja la sala abierta.',
};
const TITULO = { pt: 'Farme este bônus com a Plateia', en: 'Farm this bonus with Plateia', es: 'Farmea este bono con Plateia' };
const BOTAO = { pt: 'Abrir a sala da Twitch', en: 'Open the Twitch room', es: 'Abrir la sala de Twitch' };
const KICK = {
  pt: 'A sala da Plateia toca os canais oficiais e resgata o pacote de XP sozinha. Deixe a janela aberta.',
  en: 'The Plateia room plays the official channels and redeems the XP pack by itself. Keep the window open.',
  es: 'La sala de Plateia reproduce los canales oficiales y canjea el paquete de XP sola. Deja la ventana abierta.',
};
const BOTAO_KICK = { pt: 'Abrir a sala da Kick', en: 'Open the Kick room', es: 'Abrir la sala de Kick' };
const VELHOS = [/te vê assistindo/i, /no chat de todos os canais/i, /sees you watching|the game sees you/i, /el juego te ve/i, /chat of every bonus channel/i, /chat de todos los canales/i];

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 };
const stats = { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 };
const pk = (id, slot) => ({ id, slot, level: 20, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs, stats, maxHp: 720, hp: 720 });
const HUNTS = [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }];
const eu = { id: 7, nick: 'Treinador', gold: 25_000_000, level: 60, xp: 1, activeId: 1, huntSlug: 'rattata_1', noCentro: false, centroLivreEm: 0, servidorAgora: Date.now(), automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 500 }, items: { 200: 500, 205: 200 }, casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] }, pokemons: [1, 2, 3, 4, 5].map((id, i) => pk(id, i)) };
const welcome = () => ({ t: 'welcome', tabelaTipos: { NORMAL: {}, FIRE: {} }, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [], catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [], hunts: HUNTS, mercado: { catalogo: [], taxaDiaria: 100000 }, estado: eu });
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => { const o = JSON.parse(m); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});

await ctx.addInitScript(() => { try { if (!localStorage.getItem('piloto:idioma')) localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));

// monta as duas janelas de bônus do jogo (#tw-corpo e #kk-corpo) e pinta as faixas
const faixas = (plateia) => page.evaluate(async (tem) => {
  window.__plateiaPonte = tem;
  document.querySelectorAll('.plt-teste-janela').forEach((n) => n.remove());
  for (const id of ['tw-corpo', 'kk-corpo']) {
    const w = document.createElement('div'); w.className = 'plt-teste-janela';
    const c = document.createElement('div'); c.id = id; w.appendChild(c);
    document.body.appendChild(w);
  }
  window.__pokeidleHunt.plateia._interno.pintarFaixas();
  await new Promise((r) => setTimeout(r, 900));
  const ler = (p) => {
    const f = document.querySelector(`.plt-plateia-faixa[data-plateia="${p}"]`);
    if (!f) return null;
    const b = f.querySelector('button, a');
    return { titulo: f.querySelector('b')?.textContent.trim(), texto: f.querySelector('span')?.textContent.trim(), botao: b?.textContent.trim(), tag: b?.tagName, href: b?.getAttribute('href') || null };
  };
  return { twitch: ler('twitch'), kick: ler('kick'), SALA: window.__pokeidleHunt.plateia.abrirSala ? true : false };
}, plateia);

await page.goto('https://pokeidle.io/app');
await sleep(3500);

for (const l of ['pt', 'en', 'es']) {
  await page.evaluate((idioma) => { localStorage.setItem('piloto:idioma', idioma); }, l);
  await page.reload();
  await sleep(3500);
  const r = await faixas(true);
  console.log(`   [${l}] Twitch: ${JSON.stringify(r.twitch)}`);
  ok(!!r.twitch, `[${l}] a faixa da Twitch aparece com a Plateia instalada`);
  ok(r.twitch && r.twitch.texto === NOVO[l], `[${l}] texto novo da Twitch`);
  ok(r.twitch && VELHOS.every((re) => !re.test(r.twitch.texto || '')), `[${l}] sem "te vê assistindo" nem "no chat de todos os canais"`);
  ok(r.twitch && r.twitch.titulo === TITULO[l], `[${l}] título da Twitch não mudou (${r.twitch && r.twitch.titulo})`);
  ok(r.twitch && r.twitch.botao === BOTAO[l] && r.twitch.tag === 'BUTTON', `[${l}] botão da sala da Twitch não mudou (${r.twitch && r.twitch.botao})`);
  ok(r.kick && r.kick.texto === KICK[l], `[${l}] texto da Kick não mudou`);
  ok(r.kick && r.kick.titulo === TITULO[l] && r.kick.botao === BOTAO_KICK[l], `[${l}] título e botão da Kick não mudaram`);
}

// sem a Plateia: continua o convite para baixar (PT)
await page.evaluate(() => { localStorage.setItem('piloto:idioma', 'pt'); });
await page.reload(); await sleep(3500);
const sem = await faixas(false);
ok(sem.twitch && /Baixar a Plateia/.test(sem.twitch.botao || '') && /assiste as lives com bônus por você/.test(sem.twitch.texto || ''), `sem a Plateia a faixa continua pedindo para baixar (${sem.twitch && sem.twitch.botao})`);

// o botão da Twitch continua abrindo a janela "plateia" na URL da sala
await page.reload(); await sleep(3500);
await faixas(true);
const alvo = await page.evaluate(() => {
  const chamadas = [];
  const w = { location: { href: 'about:blank' }, focus() {} };
  window.open = (u, nome) => { chamadas.push(nome); return w; };
  document.querySelector('.plt-plateia-faixa[data-plateia="twitch"] button').click();
  return { chamadas, href: w.location.href };
});
ok(alvo.chamadas[0] === 'plateia' && alvo.href === 'https://www.twitch.tv/drops/inventory#plateia', `botão abre a janela "plateia" na sala da Twitch (${JSON.stringify(alvo)})`);
const marca = await page.evaluate(() => window.__plateiaPonte === true);
ok(marca === true, 'detecção da Plateia por window.__plateiaPonte === true segue valendo');

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
await ctx.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
