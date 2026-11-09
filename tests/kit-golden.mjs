// 1.51.1: a Golden Potion no kit. Observado na conta em 2026-11-06 (cliente 1.408.7): o welcome manda a
// Golden Potion sem priceGold (a loja do jogo vende poção pelo npcPrice), o hook recusava o auto.set
// ("fora da lista fechada"), o auto.js anotava "ok" mesmo assim e tentava de novo a cada volta. O jogo
// ficava com a Ultimate Potion marcada e estoque zero.
//   node kit-golden.mjs [pasta-da-extensao]
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
// como o welcome real manda (2026-11-06): sem priceGold
const GOLDEN = { id: 70070, name: 'Golden Potion', icon: '/img/itens/golden-potion.png', category: 'heal', rare: true, npcPrice: 2500, healPct: 0.5 };
const SEM_PRECO = { id: 70071, name: 'Teste sem preço', category: 'heal', npcPrice: 0, healPct: 0.5 };
const NAO_CURA = { id: 70072, name: 'Teste não cura', category: 'loot', npcPrice: 100, healPct: 0.5 };
const automacaoBase = () => ({ ballIds: [1], potionIds: [204], reviveIds: [206], hpLimiar: 0.3, autoPotion: true, autoRevive: true });
let automacao = automacaoBase();
const welcome = () => ({
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, GRASS: 2 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }],
  itensNossos: [GOLDEN, SEM_PRECO, NAO_CURA],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 500_000_000, level: 1200, xp: 1, activeId: 1, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: automacao, balls: { 1: 500 }, items: { 204: 0, 70070: 53, 205: 92, 206: 18 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [{ id: 1, slot: 0, level: 1200, xp: 1, nome: 'Charmeleon', speciesId: 5, tipos: ['FIRE'], quality: 1.3, potencia: 2, poder: 90000, ivs, stats: { hp: 2363, atk: 2000, def: 1800, spAtk: 2000, spDef: 1800, speed: 900 }, maxHp: 28356, hp: 28356 }],
  },
});
const recebidos = [];
let wsAtual = null;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  wsAtual = ws;
  ws.onMessage((m) => {
    const o = JSON.parse(m);
    recebidos.push(o);
    if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    if (o.t === 'auto.set') { const { t, ...resto } = o; automacao = { ...automacao, ...resto }; ws.send(JSON.stringify({ t: 'estado', estado: { automation: automacao, servidorAgora: Date.now() } })); }
  });
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); if (localStorage.getItem('teste:pausar')) { const id = setInterval(() => { const P = window.__pokeidleHunt; if (P && P.pausarUrgente) { P.pausarUrgente('9.9.9'); clearInterval(id); } }, 2); } } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
const srv = (o) => wsAtual.send(JSON.stringify(o));
const sets = () => recebidos.filter((m) => m.t === 'auto.set');
const conferir = () => page.evaluate(async () => { await window.__pokeidleHunt.auto._interno.conferirKit(false); });
const linhas = () => page.evaluate(() => window.__pokeidleHunt.auto.diario().filter((d) => /automações do jogo/.test(d.txt)).map((d) => `${d.tipo}: ${d.txt}`));
const vigiados = () => page.evaluate(() => window.__pokeidleHunt.auto._interno.itensVigiados().map((i) => i.chave));
const abrir = async () => {
  await page.goto('https://pokeidle.io/app');
  await sleep(4000);
  await page.locator('button.plt-barra').click(); await sleep(800);
  await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1500);
  await page.keyboard.press('Escape'); await sleep(500);
};

// ---- carga 1: a troca sai de verdade ----------------------------------------------------------
await abrir();
const kit = await page.evaluate(() => { const k = window.__pokeidleHunt.auto._interno.escolherKit({ ouroH: 0, livre: 1e12 }); return k && { pocao: k.pocao.id, revive: k.revive.id, bola: k.bola.id }; });
ok(kit && kit.pocao === 70070, `o kit escolhe a Golden Potion, vinda sem priceGold (${JSON.stringify(kit)})`);
await conferir(); await sleep(2500); await conferir(); await sleep(1500);
const s1 = sets();
ok(s1.length === 1 && s1[0].potionIds[0] === 70070, `um auto.set sai com a Golden Potion (${JSON.stringify(s1.map((m) => m.potionIds))})`);
ok(s1.length === 1 && s1[0].autoPotion === true && s1[0].hpLimiar === 0.3, 'o auto.set só troca os itens; o resto da automação vem do estado');
ok(automacao.potionIds[0] === 70070, `o jogo falso ficou com a Golden Potion marcada (${JSON.stringify(automacao.potionIds)})`);
for (let i = 0; i < 3; i++) { await conferir(); await sleep(300); }
ok(sets().length === 1, `já marcada: não manda de novo (${sets().length} envios)`);
let ls = await linhas();
ok(ls.length === 1 && ls[0].startsWith('ok: '), `uma linha "ok" no Diário (${ls.length})`);

// o hook continua sendo lista fechada
const hook = await page.evaluate(() => {
  const P = window.__pokeidleHunt; const pede = (potionId) => P.pedir({ t: 'auto.set', ballIds: [1], potionIds: [potionId], reviveIds: [205] }, 'hunt');
  return { semPreco: pede(70071), naoCura: pede(70072), desconhecida: pede(99999) };
});
ok(!hook.semPreco.ok, `hook: item nosso sem preço na loja é recusado (${hook.semPreco.motivo})`);
ok(!hook.naoCura.ok, `hook: item nosso que não é cura é recusado (${hook.naoCura.motivo})`);
ok(!hook.desconhecida.ok, `hook: id fora do catálogo é recusado (${hook.desconhecida.motivo})`);
await sleep(1500);
ok(sets().length === 1, `nenhum desses saiu para o jogo (${sets().length} envios)`);

// o consumo da Golden Potion entra na conta da Reposição
const consumo = await page.evaluate(() => {
  const P = window.__pokeidleHunt; const I = P.auto._interno; const base = Date.now() + 3_600_000;
  const e = (q) => ({ huntSlug: 'rattata_1', noCentro: false, balls: {}, items: { 70070: q } });
  I.registrarConsumo(e(53), base); I.registrarConsumo(e(50), base + 60_000);
  const c = I.consumo(); return c.baldes.reduce((s, b) => s + (Number(b.q.i70070) || 0), 0);
});
ok(consumo === 3, `a Reposição mede o consumo da Golden Potion (${consumo})`);

// ---- carga 2: pedido recusado não finge que foi ------------------------------------------------
automacao = automacaoBase();
recebidos.length = 0;
// a recusa fica armada desde o início da página: o ciclo automático da Reposição já roda sozinho
await page.evaluate(() => localStorage.setItem('teste:pausar', '1'));
await abrir();
await conferir(); await sleep(400);
for (let i = 0; i < 4; i++) { await conferir(); await sleep(300); }
ls = await linhas();
ok(sets().length === 0, `recusado: nada sai para o jogo (${sets().length})`);
ok(!ls.some((x) => x.startsWith('ok: ')), `recusado: nenhuma linha "ok" (${JSON.stringify(ls).slice(0, 220)})`);
ok(ls.length === 1 && ls[0].startsWith('aviso: ') && /não troquei/.test(ls[0]) && /pausado/.test(ls[0]), `recusado: uma linha de aviso com o motivo, sem repetir (${ls.length})`);
const vg = await vigiados();
ok(!vg.includes('i70070') && vg.includes('i204'), `recusado: a Reposição segue o que está marcado no jogo (${vg})`);
// passado o intervalo, tenta de novo
await page.evaluate(() => { const o = Date.now.bind(Date); Date.now = () => o() + 11 * 60_000; });
await conferir(); await sleep(300);
ls = await linhas();
ok(ls.length === 2, `depois de 10 min tenta de novo (${ls.length} linhas)`);
// EN/ES no dicionário: a linha do kit (formato desde a 1.50.0) e a da recusa
const tr = await page.evaluate(() => {
  const I = window.__pokeidleHunt.idioma;
  const a = 'automações do jogo: Ultra Ball, Golden Potion e Revive (um de cada, pela conta: HP de quem luta 28.356, médio do time 9.062, até 196.638 de ouro por bola)';
  const b = 'automações do jogo: não troquei para Ultra Ball, Golden Potion e Revive (pausado: atualização urgente (v9.9.9)); tento de novo em 10 min';
  return { aEn: I.traduzir(a, 'en'), aEs: I.traduzir(a, 'es'), bEn: I.traduzir(b, 'en'), bEs: I.traduzir(b, 'es') };
});
ok(/^game automations: Ultra Ball, Golden Potion and Revive/.test(tr.aEn) && /fighting/.test(tr.aEn) && /^automatizaciones del juego/.test(tr.aEs), `linha do kit em EN/ES: ${tr.aEn} | ${tr.aEs}`);
ok(/didn't switch/.test(tr.bEn) && /no cambié/.test(tr.bEs), `linha da recusa em EN/ES: ${tr.bEn} | ${tr.bEs}`);

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
