// Ponto 7 do #5: "time: análise: 5 pokémon em 0,0 s | parece que não conseguiu ler o time e travou, iniciar uma
// hunt manualmente desbuga". A vigia do Centro só voltava para uma hunt vista NESTA sessão: com a página aberta
// já no Centro, ela não sabia para onde ir e a conta ficava parada.
//   node centro-ao-abrir.mjs [pasta-da-extensao]
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
let eu;
const inicial = (extra) => { eu = { id: 7, nick: 'Treinador', gold: 25_000_000, level: 60, xp: 1, activeId: 1, huntSlug: 'rattata_1', noCentro: true, centroLivreEm: 0, servidorAgora: Date.now(), automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 500 }, items: { 200: 500, 205: 200 }, casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] }, pokemons: [1, 2, 3, 4, 5].map((id, i) => pk(id, i)), ...extra }; };
inicial({});
const welcome = () => ({ t: 'welcome', tabelaTipos: { NORMAL: {}, FIRE: {} }, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [], catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [], hunts: HUNTS, mercado: { catalogo: [], taxaDiaria: 100000 }, estado: eu });
const recebidos = [];
let wsAtual = null;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  wsAtual = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m); recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'centro.curar') ws.send(JSON.stringify({ t: 'estado', estado: { centroLivreEm: 0, servidorAgora: Date.now() } }));
    if (o.t === 'hunt.select') { eu.noCentro = false; eu.huntSlug = o.slug; ws.send(JSON.stringify({ t: 'estado', estado: { noCentro: false, huntSlug: o.slug, servidorAgora: Date.now() } })); }
  });
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
const abrir = async (reload) => {
  recebidos.length = 0;
  if (reload) await page.reload(); else await page.goto('https://pokeidle.io/app');
  await sleep(4000);
};
// a vigia espera 90 s no Centro e 60 s sem a pessoa mexer: o teste adianta o relógio dela
const vigia = () => page.evaluate(() => { const I = window.__pokeidleHunt.auto._interno; const n = Date.now(); I.vigiaCentro(n + 100_000); I.vigiaCentro(n + 300_000); I.passo(); return I.rotina() ? { destino: I.rotina().destino, motivo: I.rotina().motivo } : null; });
const avisos = () => page.evaluate(() => window.__pokeidleHunt.auto.diario().filter((d) => /Centro/.test(d.txt)).map((d) => `${d.tipo}: ${d.txt}`));

// 1) a página abre com a conta já no Centro: o caso do relato
await abrir(false);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
await page.keyboard.press('Escape');
const an = await page.evaluate(async () => { const P = window.__pokeidleHunt; await P.time.analisar?.(); await new Promise((r) => setTimeout(r, 400)); return (P.cofre.ultimos(40) || []).map((d) => d.txt).find((t) => /análise:/.test(t)) || null; });
console.log(`   Diário: ${an}`);
ok(/análise: 5 pokémon em 0,\d s/.test(an || ''), `"0,0 s" é só uma análise rápida de 5 pokémon, não falta de dados (${an})`);
const an2 = await page.evaluate(() => { const P = window.__pokeidleHunt; const s = P.time._interno.st; return { analisando: s.analisando, erro: s.analise && s.analise.erro, n: s.analise && s.analise.n }; });
ok(an2.analisando === false && !an2.erro && an2.n === 5, `depois da análise a flag solta e não há erro (${JSON.stringify(an2)})`);
await page.evaluate(() => { window.__pokeidleHunt.auto._interno.cfg().hunt.ligado = true; });
const r = await vigia();
await sleep(1500);
console.log(`   rotina: ${JSON.stringify(r)} · envios: ${recebidos.filter((m) => /hunt\.select|centro\./.test(m.t)).map((m) => m.t)}`);
ok(r && r.destino === 'rattata_1', `abriu já no Centro: a vigia volta para a hunt do estado (${JSON.stringify(r)})`);
// ela cura antes de voltar: o relógio de 2 s do módulo leva a rotina até o fim
for (let i = 0; i < 40 && !recebidos.some((m) => m.t === 'hunt.select'); i++) await sleep(1000);
let sairam = recebidos.filter((m) => m.t === 'hunt.select');
ok(sairam.length >= 1 && sairam[0].slug === 'rattata_1', `pede a volta à hunt (${JSON.stringify(sairam.map((m) => m.slug))})`);

// 2) sem hunt conhecida: não inventa destino e diz no Diário
inicial({ huntSlug: null });
await abrir(true);
await page.evaluate(() => { window.__pokeidleHunt.auto._interno.cfg().hunt.ligado = true; });
const r2 = await vigia();
await sleep(600);
let av = await avisos();
ok(r2 === null && recebidos.filter((m) => m.t === 'hunt.select').length === 0, `sem hunt no estado: não inventa destino (${JSON.stringify(r2)})`);
ok(av.some((t) => /aviso: parado no Centro: não sei para qual hunt voltar/.test(t)), `e o Diário diz por que parou (${JSON.stringify(av)})`);
await vigia(); await sleep(300);
ok((await avisos()).filter((t) => /não sei para qual hunt/.test(t)).length === 1, 'a linha não repete a cada volta');

// 3) hunt que não existe mais no welcome: idem, não manda slug inválido
inicial({ huntSlug: 'hunt_que_sumiu' });
await abrir(true);
await page.evaluate(() => { window.__pokeidleHunt.auto._interno.cfg().hunt.ligado = true; });
const r3 = await vigia();
await sleep(500);
ok(r3 === null && recebidos.filter((m) => m.t === 'hunt.select').length === 0, `hunt fora do welcome: não vai (${JSON.stringify(r3)})`);

// 4) Troca de hunt e Reposição desligadas: a vigia não age (como sempre foi)
inicial({});
await abrir(true);
await page.evaluate(() => { const c = window.__pokeidleHunt.auto._interno.cfg(); c.hunt.ligado = false; c.repor.ligado = false; });
const r4 = await vigia();
await sleep(500);
ok(r4 === null && recebidos.filter((m) => m.t === 'hunt.select').length === 0, `Troca de hunt e Reposição desligadas: fica no Centro (${JSON.stringify(r4)})`);

// 5) Desligado: não age
await page.evaluate(() => { const P = window.__pokeidleHunt; const c = P.auto._interno.cfg(); c.hunt.ligado = true; c.repor.ligado = true; P.modo.definir('desligado'); });
await sleep(400);
const r5 = await vigia();
await sleep(500);
ok(r5 === null && recebidos.filter((m) => m.t === 'hunt.select').length === 0, `Piloto Desligado: não sai do Centro (${JSON.stringify(r5)})`);
const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
