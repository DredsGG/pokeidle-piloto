// 1.51.0: o ranking de hunts considera o Dia Sazonal do jogo (o "Bônus do Dia" do Discord).
// Todo dia às 18:00 de Brasília o servidor sorteia uma tipagem (estado.diaSazonal { tipo, fim } e a
// mensagem { t: 'diaSazonal', tipo } na virada). Nas hunts do Mapa, quem é dessa tipagem causa ×2
// e recebe ×¼ de dano (shared/dia-sazonal.mjs do jogo: multDanoSazonal, danoSazonal).
// Parte 1: o motor sozinho (Node, sem navegador). Parte 2: o jogo falso, com o módulo do jogo
// servido aqui (cópia das funções do cliente v1.401.2, só para o teste) e o creatures.json do jogo
// falso com Combee, Pidgey, Flareon, Pinsir e Scizor a mais.
//   node ranking-sazonal.mjs [pasta-da-extensao]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(process.argv[2] || path.join(AQUI, '../extension'));
const FAKE = path.resolve(AQUI, 'fake');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);

// as funções do módulo do jogo (shared/dia-sazonal.mjs, cliente v1.401.2), só para o teste
const MODULO_JOGO = `
export const TIPOS_SAZONAIS = Object.freeze(['NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'FIGHTING', 'POISON', 'GROUND',
  'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY']);
export const MULT_SAZONAL = 2;
export const ehDoTipoSazonal = (tipos, tipo) => !!tipo && Array.isArray(tipos) && tipos.includes(tipo);
export function multDanoSazonal(tipo, tiposAtacante, tiposDefensor) {
  if (!tipo) return 1;
  const ataca = ehDoTipoSazonal(tiposAtacante, tipo) ? MULT_SAZONAL : 1;
  const apanha = ehDoTipoSazonal(tiposDefensor, tipo) ? MULT_SAZONAL * MULT_SAZONAL : 1;
  return ataca / apanha;
}
export const danoSazonal = (dano, mult) => (mult === 1 ? dano : Math.max(dano > 0 ? 1 : 0, Math.round(dano * mult)));
`;
const MODULO_QUEBRADO = 'export const TIPOS_SAZONAIS = [\'BUG\']; export const multDanoSazonal = 2;\n';

// ---- espécies (stats-base e golpes do jogo) ---------------------------------------------------
const at = (s) => s.split(',').map((x) => { const [name, type, power, category, l, cd] = x.split(':'); return { name, type, power: +power, category, learnLevel: +l, cooldownMs: +cd }; });
const NOVAS = [
  { pokeId: 415, name: 'Combee', baseHp: 30, baseAtk: 30, baseDef: 42, baseSpAtk: 30, baseSpDef: 42, baseSpeed: 70, type1: 'BUG', type2: 'FLYING', attacks: at('Bug Bite:BUG:60:PHYSICAL:1:19600,Gust:FLYING:40:SPECIAL:1:15900') },
  { pokeId: 16, name: 'Pidgey', baseHp: 40, baseAtk: 45, baseDef: 40, baseSpAtk: 35, baseSpDef: 35, baseSpeed: 56, type1: 'NORMAL', type2: 'FLYING', attacks: at('Tackle:NORMAL:40:PHYSICAL:1:15900,Gust:FLYING:40:SPECIAL:1:15900') },
  { pokeId: 136, name: 'Flareon', baseHp: 65, baseAtk: 130, baseDef: 60, baseSpAtk: 95, baseSpDef: 110, baseSpeed: 65, type1: 'FIRE', type2: null, attacks: at('Ember:FIRE:40:SPECIAL:1:15900,Fire Fang:FIRE:65:PHYSICAL:1:19600') },
  { pokeId: 127, name: 'Pinsir', baseHp: 65, baseAtk: 125, baseDef: 100, baseSpAtk: 55, baseSpDef: 70, baseSpeed: 85, type1: 'BUG', type2: null, attacks: at('X-Scissor:BUG:80:PHYSICAL:1:22900,Tackle:NORMAL:40:PHYSICAL:1:15900') },
  { pokeId: 212, name: 'Scizor', baseHp: 70, baseAtk: 130, baseDef: 100, baseSpAtk: 55, baseSpDef: 80, baseSpeed: 65, type1: 'BUG', type2: 'STEEL', attacks: at('X-Scissor:BUG:80:PHYSICAL:1:22900,Metal Claw:STEEL:50:PHYSICAL:1:18200') },
];
const TABELA = { FIRE: { BUG: 2, STEEL: 2, WATER: 0.5, FIRE: 0.5 }, BUG: { FIRE: 0.5, FLYING: 0.5, STEEL: 0.5 }, FLYING: { BUG: 2, STEEL: 0.5 }, STEEL: { FIRE: 0.5, STEEL: 0.5 }, NORMAL: { STEEL: 0.5 } };
const st = (b, lv, iv = 16) => (b + 2 * iv) * lv / 100;
const fichaDe = (esp, id, lv, slot = null) => ({
  id, slot, level: lv, xp: 1, nome: esp.name, speciesId: esp.pokeId, tipos: [esp.type1, esp.type2].filter(Boolean), quality: 1, potencia: 1, poder: 5000,
  ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 },
  stats: { hp: st(esp.baseHp, lv), atk: st(esp.baseAtk, lv), def: st(esp.baseDef, lv), spAtk: st(esp.baseSpAtk, lv), spDef: st(esp.baseSpDef, lv), speed: st(esp.baseSpeed, lv) },
});
const E_ = Object.fromEntries(NOVAS.map((e) => [e.name, e]));
const NV_PK = 150;
const flareon = fichaDe(E_.Flareon, 1, NV_PK, 0);
const pinsir = fichaDe(E_.Pinsir, 2, NV_PK, 1);
const scizor = fichaDe(E_.Scizor, 3, NV_PK, 2);
const NV_HUNT = 120;
const HUNTS = [
  { slug: 'combee_1', nome: 'Combee', nivel: NV_HUNT, regiao: 'sinnoh', especies: [{ pokeId: 415, pontos: 12 }] },
  { slug: 'pidgey_1', nome: 'Pidgey', nivel: NV_HUNT, regiao: 'kanto', especies: [{ pokeId: 16, pontos: 12 }] },
];
const WELCOME_CONSTS = { tabelaTipos: TABELA, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [] };

// =============================================================================================
console.log('== parte 1: o motor sozinho');
const ctxVm = { console, performance, URL, setTimeout, clearTimeout }; ctxVm.globalThis = ctxVm; vm.createContext(ctxVm);
for (const f of ['src/hunt/game.js', 'src/hunt/engine.js']) vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), ctxVm, { filename: f });
const PIH = ctxVm.__pokeidleHunt;
const E = PIH.engine;
const xpDoNivel = (n) => (n <= 150 ? Math.floor(0.6 * n * n) + 8 : 13500 * (n / 150) ** 1.25);
const mod = { cooldown: { cooldownGolpeComSpeed: (cd) => cd }, recompensa: { xpPorDerrota: (h, n) => xpDoNivel(n), ouroPorDerrotaHunt: (h, n) => n }, analyser: {} };
const especies = new Map(NOVAS.map((e) => [e.pokeId, e]));
const welcomeLike = { ...WELCOME_CONSTS, hunts: HUNTS };
const temAjudante = typeof PIH.constsDoRanking === 'function' && !!PIH.sazonal?._interno?.definir;
ok(temAjudante, `ajudante único do consts (PIH.constsDoRanking) e o estado do Dia Sazonal (PIH.sazonal) existem (${typeof PIH.constsDoRanking}, ${typeof PIH.sazonal})`);
const moduloJogo = await import(`data:text/javascript,${encodeURIComponent(MODULO_JOGO)}`);
const moduloQuebrado = await import(`data:text/javascript,${encodeURIComponent(MODULO_QUEBRADO)}`);
const V = temAjudante ? PIH.sazonal._interno.validar(moduloJogo) : null;
ok(!!V, 'o módulo do jogo (formato v1.401.2) passa na validação');
const definir = (tipo, m) => { if (temAjudante) PIH.sazonal._interno.definir(tipo, m); };
const consts = (opcoes) => (temAjudante ? PIH.constsDoRanking(welcomeLike, opcoes) : { ...WELCOME_CONSTS });
const analisar = (pk, c, hunts = HUNTS) => E.analisar(pk, { mod, especies, hunts, consts: c, eu: { level: 400 } }, { pocao: null });
const porSlug = (r) => Object.fromEntries(r.linhas.map((l) => [l.slug, l]));
const limpa = (r) => JSON.stringify(r.linhas.map(({ hunt, ...l }) => l));

// sem dado: o mesmo consts de antes e o mesmo ranking
definir(null, V);
const antigo = analisar(flareon, { ...WELCOME_CONSTS });
const semDia = analisar(flareon, consts());
ok(limpa(antigo) === limpa(semDia), '(b) sem diaSazonal: o ranking é idêntico ao do consts antigo');
ok(JSON.stringify(consts()) === JSON.stringify(WELCOME_CONSTS), `(b) sem diaSazonal: o consts é o mesmo de antes (${JSON.stringify(Object.keys(consts()))})`);
const A = porSlug(antigo);
console.log(`   Flareon sem dia: ${antigo.linhas.map((l) => `${l.slug} kph ${r2(l.kph)} ttk ${r2(l.ttk)}`).join(' · ')}`);

// (a) dia de Inseto: a hunt de Combee cai para o Flareon (abate ~4× mais demorado)
definir('BUG', V);
const bugFl = analisar(flareon, consts());
const B = porSlug(bugFl);
console.log(`   Flareon dia BUG: ${bugFl.linhas.map((l) => `${l.slug} kph ${r2(l.kph)} ttk ${r2(l.ttk)}`).join(' · ')}`);
const razTtk = B.combee_1.ttk / A.combee_1.ttk;
const razKph = B.combee_1.kph / A.combee_1.kph;
ok(antigo.linhas[0].slug === 'combee_1', `(a) sem dia, o 1º do Flareon é a hunt de Combee (${antigo.linhas[0].slug})`);
ok(razTtk > 3.6 && razTtk < 4.4, `(a) dia BUG: o abate de Combee leva ~4× mais para o Flareon (ttk ×${r2(razTtk)})`);
ok(razKph > 0.2 && razKph < 0.35, `(a) dia BUG: abates/h de Combee perto de ¼ para o Flareon (×${r2(razKph)})`);
ok(bugFl.linhas[0].slug === 'pidgey_1', `(a) dia BUG: a hunt de Combee cai no ranking do Flareon (1º ${bugFl.linhas[0].slug})`);
ok(B.combee_1.hitPct > A.combee_1.hitPct * 1.9, `(a) dia BUG: o Combee bate 2× mais forte no Flareon (risco ${r2(A.combee_1.hitPct)} → ${r2(B.combee_1.hitPct)})`);
ok(limpa({ linhas: [B.pidgey_1] }) === limpa({ linhas: [A.pidgey_1] }), '(a) dia BUG: na hunt de Pidgey (ninguém é Inseto) o Flareon fica igual');

// (a) o pokémon de Inseto: as hunts que não são de Inseto sobem (ele bate ×2 e apanha ¼)
definir(null, V);
const pinAntes = porSlug(analisar(pinsir, consts()));
definir('BUG', V);
const pinBug = porSlug(analisar(pinsir, consts()));
const subiu = pinBug.pidgey_1.kph / pinAntes.pidgey_1.kph;
console.log(`   Pinsir: pidgey kph ${r2(pinAntes.pidgey_1.kph)} → ${r2(pinBug.pidgey_1.kph)} · combee kph ${r2(pinAntes.combee_1.kph)} → ${r2(pinBug.combee_1.kph)}`);
ok(subiu > 1.5, `(a) dia BUG: para o Pinsir (Inseto), a hunt de Pidgey sobe (abates/h ×${r2(subiu)}, ttk ×${r2(pinBug.pidgey_1.ttk / pinAntes.pidgey_1.ttk)})`);
ok(pinBug.pidgey_1.hitPct < pinAntes.pidgey_1.hitPct * 0.3, `(a) dia BUG: o Pidgey tira ¼ do Pinsir (risco ${r2(pinAntes.pidgey_1.hitPct)} → ${r2(pinBug.pidgey_1.hitPct)})`);

// (f) os dois lados da tipagem: Scizor (BUG/STEEL) contra Combee (BUG/FLYING) — ×2 × ¼ = ×½ de cada lado
definir(null, V);
const scAntes = porSlug(analisar(scizor, consts()));
definir('BUG', V);
const scBug = porSlug(analisar(scizor, consts()));
const fTtk = scBug.combee_1.ttk / scAntes.combee_1.ttk;
const fHit = scBug.combee_1.hitPct / scAntes.combee_1.hitPct;
ok(fTtk > 1.8 && fTtk < 2.2, `(f) Scizor (BUG/STEEL) × Combee (BUG/FLYING), dia BUG: o dano dele sai ×½ (ttk ×${r2(fTtk)})`);
ok(fHit > 0.45 && fHit < 0.55, `(f) e o do Combee nele também ×½ (risco ×${r2(fHit)})`);

// (c) fora do Mapa: hunt marcada como boss, arena, Safari ou Mística fica sem fator
const fora = ['boss', 'arena', 'safari', 'mistico'].map((k) => ({ ...HUNTS[0], slug: `combee_${k}`, [k]: true }));
definir('BUG', V);
const foraBug = analisar(flareon, consts(), fora);
definir(null, V);
const foraSem = analisar(flareon, consts(), fora);
ok(limpa(foraBug) === limpa(foraSem), `(c) boss, arena, Safari e Mística: dia BUG não muda nada (${foraBug.linhas.map((l) => r2(l.kph)).join(', ')})`);
// (c) quem chama sem o fator (Caçar o meta, Melhorar o time, rodízio): idêntico mesmo com o dia lido
definir('BUG', V);
ok(limpa(analisar(flareon, consts({ sazonal: false }))) === limpa(antigo), '(c) consts sem o Dia Sazonal ({ sazonal: false }): idêntico ao de antes com o dia BUG lido');

// (e) módulo ausente ou com outro formato: ranking antigo
definir('BUG', null);
ok(limpa(analisar(flareon, consts())) === limpa(antigo), '(e) módulo do jogo ausente: ranking antigo');
const val = temAjudante ? PIH.sazonal._interno.validar(moduloQuebrado) : 'sem';
ok(val === null, `(e) módulo com outro formato não passa na validação (${val === null ? 'null' : typeof val})`);
definir('BUG', val);
ok(limpa(analisar(flareon, consts())) === limpa(antigo), '(e) módulo com outro formato: ranking antigo');
// o tipo tem que ser um dos 18 do módulo
definir('XYZ', temAjudante ? PIH.sazonal._interno.validar(moduloJogo) : null);
ok(limpa(analisar(flareon, consts())) === limpa(antigo), '(e) tipo que não é uma das 18 tipagens: ranking antigo');
// o piso do jogo: o golpe que acertava continua tirando pelo menos 1
const vj = temAjudante ? PIH.sazonal._interno.validar(moduloJogo) : null;
ok(!!vj && vj.dano(1, 0.25) === 1 && vj.dano(0, 0.25) === 0 && vj.dano(10, 2) === 20, `piso de 1: danoSazonal do jogo (1×¼ = ${vj ? vj.dano(1, 0.25) : '-'}, 0×¼ = ${vj ? vj.dano(0, 0.25) : '-'})`);

// =============================================================================================
console.log('== parte 2: o jogo falso');
const { chromium } = require('playwright');
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
let modoModulo = 'ok';
let pedidosModulo = 0;
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  if (arq === 'shared/dia-sazonal.mjs') {
    pedidosModulo++;
    if (modoModulo === 'ausente') return route.fulfill({ status: 404, body: 'nao tem' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: modoModulo === 'quebrado' ? MODULO_QUEBRADO : MODULO_JOGO });
  }
  if (arq === 'assets/creatures.json') {
    const base = JSON.parse(fs.readFileSync(path.join(FAKE, arq), 'utf8'));
    base.creatures = [...base.creatures.filter((c) => !NOVAS.some((n) => n.pokeId === c.pokeId)), ...NOVAS];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(base) });
  }
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const estadoBase = (extra = {}) => ({
  id: 7, nick: 'Trainer', gold: 50_000_000, level: 400, xp: 1, activeId: 1, huntSlug: 'pidgey_1', servidorAgora: Date.now(),
  automation: { ballIds: [1], potionIds: [200], reviveIds: [205], hpLimiar: 0.3 }, balls: { 1: 500 }, items: { 200: 100, 205: 20 },
  casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
  pokemons: [{ ...flareon, maxHp: 1500, hp: 1500 }, { ...pinsir, maxHp: 1500, hp: 1500 }],
  ...extra,
});
let welcomeAtual = null;
const welcomeCom = (extra) => ({
  t: 'welcome', ...WELCOME_CONSTS,
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }],
  itensNossos: [], hunts: HUNTS, mercado: { catalogo: [], taxaDiaria: 100000 }, estado: estadoBase(extra),
});
let wsAtual = null;
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  wsAtual = ws;
  ws.onMessage((m) => { const o = JSON.parse(m); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  const w = welcomeAtual;
  setTimeout(() => ws.send(JSON.stringify(w)), 300);
});
const srv = (o) => wsAtual && wsAtual.send(JSON.stringify(o));
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
// espia o motor: cada análise guarda o tipo do dia que chegou no consts e os abates/h de cada hunt
const espiar = () => page.evaluate(() => {
  const P = window.__pokeidleHunt;
  window.__chamadas = [];
  if (P.engine.__espiado) return;
  const orig = P.engine.analisar;
  P.engine.analisar = (pk, c, op) => {
    const r = orig(pk, c, op);
    window.__chamadas.push({ em: Date.now(), pk: pk.id, tipo: (c && c.consts && c.consts.sazonal && c.consts.sazonal.tipo) || null, kph: Object.fromEntries(r.linhas.map((l) => [l.slug, l.kph])), ordem: r.linhas.map((l) => l.slug) });
    return r;
  };
  P.engine.__espiado = true;
});
const chamadas = () => page.evaluate(() => window.__chamadas);
const melhor = (id) => page.evaluate(async (id) => (await window.__pokeidleHunt.auto.melhorHuntPara(id))?.slug ?? null, id);
const ultimaDoFlareon = async () => (await chamadas()).filter((c) => c.pk === 1).pop() || null;
const diario = () => page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos(80) || []).map((d) => d.txt));
const linhasDia = async () => (await diario()).filter((t) => /^Dia Sazonal/.test(t));
const tipoLido = () => page.evaluate(() => (window.__pokeidleHunt.sazonal ? window.__pokeidleHunt.sazonal.tipo() : 'sem PIH.sazonal'));
const esperar = async (f, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(250); } return false; };
const abrir = async (w) => {
  welcomeAtual = w;
  await page.goto('https://pokeidle.io/app');
  await sleep(4000);
  await espiar();
};

// ---- carga 1: sem diaSazonal, depois o dia lido e a virada ------------------------------------
await abrir(welcomeCom({}));
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1500);
// a aba Caçar fica aberta: é o ranking que a pessoa vê (a análise contínua e o Modo farm ouvem o mesmo aviso)
await page.evaluate(() => { const b = document.querySelector('.plt-cats [data-aba="hunts"]'); b && b.click(); }); await sleep(2500);
await espiar();
await page.evaluate(() => { window.__mudou = []; window.__pokeidleHunt.on('sazonal.mudou', (x) => window.__mudou.push(x && x.tipo)); });
const mudou = () => page.evaluate(() => window.__mudou);
const top0 = await melhor(1);
const c0 = await ultimaDoFlareon();
ok(top0 === 'combee_1' && c0 && c0.tipo === null, `(b) no jogo falso, sem diaSazonal: 1º do Flareon ${top0}, sem tipo no consts (${c0 && c0.tipo})`);
ok(pedidosModulo === 0, `(b) sem diaSazonal o Piloto nem pede o módulo do jogo (${pedidosModulo} pedidos)`);
ok((await linhasDia()).length === 0, '(b) sem diaSazonal: nenhuma linha de Dia Sazonal no Diário');

// o dia chega no estado (como na 1ª leitura depois de abrir o jogo)
await page.evaluate(() => { window.__chamadas = []; });
const fim = Date.now() + 3 * 3_600_000;
srv({ t: 'estado', estado: { diaSazonal: { tipo: 'BUG', fim }, servidorAgora: Date.now() } });
await esperar(async () => (await tipoLido()) === 'BUG');
ok((await tipoLido()) === 'BUG', `dia lido do estado: ${await tipoLido()}`);
const refez1 = await esperar(async () => (await chamadas()).some((c) => c.tipo === 'BUG'));
ok(refez1, '1ª leitura: a aba Caçar refaz o ranking sozinha com o dia BUG (sem recarregar)');
ok(JSON.stringify(await mudou()) === '["BUG"]', `1ª leitura: aviso sazonal.mudou para a análise contínua e o Modo farm (${JSON.stringify(await mudou())})`);
let dl = await linhasDia();
ok(dl.includes('Dia Sazonal: Inseto (2× dano causado, ¼ recebido nas hunts do Mapa); ranking ajustado'), `linha no Diário: ${JSON.stringify(dl)}`);
const top1 = await melhor(1);
const c1 = await ultimaDoFlareon();
ok(top1 === 'pidgey_1', `(a) no jogo falso, dia BUG: o 1º do Flareon passa a ser ${top1}`);
const razPag = c1 && c0 ? c1.kph.combee_1 / c0.kph.combee_1 : NaN;
ok(razPag > 0.2 && razPag < 0.35, `(a) no jogo falso: abates/h de Combee do Flareon ×${r2(razPag)} (perto de ¼)`);
ok(pedidosModulo === 1, `o módulo do jogo pedido uma vez (${pedidosModulo})`);

// (d) a virada: a mensagem chega, o estado vem logo atrás
await page.evaluate(() => { window.__chamadas = []; });
srv({ t: 'diaSazonal', tipo: 'FIRE' });
await esperar(async () => (await tipoLido()) === 'FIRE');
ok((await tipoLido()) === 'FIRE', `(d) virada pela mensagem do servidor: ${await tipoLido()}`);
const refez2 = await esperar(async () => (await chamadas()).some((c) => c.tipo === 'FIRE'));
ok(refez2, '(d) na virada a aba Caçar refaz o ranking sozinha, sem recarregar');
srv({ t: 'estado', estado: { diaSazonal: { tipo: 'FIRE', fim: fim + 86_400_000 }, servidorAgora: Date.now() } });
await sleep(1500);
dl = await linhasDia();
ok(dl.filter((t) => t.startsWith('Dia Sazonal: Fogo')).length === 1, `(d) uma linha só para a virada, mesmo com o estado repetindo o tipo (${JSON.stringify(dl)})`);
ok(JSON.stringify(await mudou()) === '["BUG","FIRE"]', `(d) um aviso sazonal.mudou por virada (${JSON.stringify(await mudou())})`);
await melhor(1);
const c2 = await ultimaDoFlareon();
ok(c2 && c2.tipo === 'FIRE' && c2.kph.combee_1 > c0.kph.combee_1 * 1.3, `(d) dia FIRE: o Flareon bate ×2, Combee sobe (${r2(c0.kph.combee_1)} → ${c2 && r2(c2.kph.combee_1)})`);
// a mensagem do servidor só passa o tipo; algo fora das 18 tipagens não muda nada
srv({ t: 'diaSazonal', tipo: '<b>x</b>', nick: 'alguem', chat: 'oi' });
await sleep(1200);
ok((await tipoLido()) === 'FIRE', `mensagem com tipo inválido é ignorada (${await tipoLido()})`);
// a página não consegue fingir o tipo do dia
await page.evaluate(() => { window.__pokeidleHunt.emit('diaSazonal', { tipo: 'WATER' }); });
await sleep(800);
ok((await tipoLido()) === 'FIRE', `a página não finge a virada (PIH.emit): ${await tipoLido()}`);
// idiomas: a linha do Diário no dicionário
const tr = await page.evaluate(() => {
  const I = window.__pokeidleHunt.idioma;
  const s = 'Dia Sazonal: Inseto (2× dano causado, ¼ recebido nas hunts do Mapa); ranking ajustado';
  const f = 'Dia Sazonal: Inseto — o módulo do jogo (dia-sazonal) não carregou ou mudou de formato; ranking sem o ajuste do dia';
  return { en: I.traduzir(s, 'en'), es: I.traduzir(s, 'es'), fen: I.traduzir(f, 'en'), fes: I.traduzir(f, 'es') };
});
ok(tr.en === 'Seasonal Day: Bug (2× damage dealt, ¼ taken in Map hunts); ranking adjusted' && tr.es === 'Día Estacional: Bicho (2× daño causado, ¼ recibido en las hunts del Mapa); ranking ajustado', `Diário em EN/ES: ${tr.en} | ${tr.es}`);
ok(/^Seasonal Day: Bug — /.test(tr.fen) && /^Día Estacional: Bicho — /.test(tr.fes), `linha de módulo ausente em EN/ES: ${tr.fen} | ${tr.fes}`);

// ---- carga 2: o dia já no welcome, módulo do jogo ausente --------------------------------------
modoModulo = 'ausente'; pedidosModulo = 0;
await abrir(welcomeCom({ diaSazonal: { tipo: 'BUG', fim } }));
await esperar(async () => (await linhasDia()).some((t) => t.includes('não carregou')));
dl = await linhasDia();
ok(dl.some((t) => t === 'Dia Sazonal: Inseto — o módulo do jogo (dia-sazonal) não carregou ou mudou de formato; ranking sem o ajuste do dia'), `(e) módulo ausente: linha no Diário (${JSON.stringify(dl)})`);
ok((await tipoLido()) === null, `(e) módulo ausente: sem tipo para o ranking (${await tipoLido()})`);
const top3 = await melhor(1);
const c3 = await ultimaDoFlareon();
ok(top3 === 'combee_1' && c3 && c3.tipo === null && JSON.stringify(c3.kph) === JSON.stringify(c0.kph), `(e) módulo ausente: o ranking de antes (${top3}, ${JSON.stringify(c3 && c3.kph)})`);

// ---- carga 3: módulo do jogo com outro formato ---------------------------------------------------
modoModulo = 'quebrado'; pedidosModulo = 0;
await abrir(welcomeCom({ diaSazonal: { tipo: 'BUG', fim } }));
await esperar(async () => (await linhasDia()).some((t) => t.includes('não carregou')));
dl = await linhasDia();
ok(dl.some((t) => t.includes('mudou de formato')), `(e) módulo com outro formato: linha no Diário (${JSON.stringify(dl)})`);
const top4 = await melhor(1);
const c4 = await ultimaDoFlareon();
ok(top4 === 'combee_1' && c4 && c4.tipo === null && JSON.stringify(c4.kph) === JSON.stringify(c0.kph), `(e) módulo com outro formato: o ranking de antes (${top4})`);

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 300)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
