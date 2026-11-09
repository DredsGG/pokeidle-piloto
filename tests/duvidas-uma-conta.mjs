// Ponto 6 do #5: com várias contas usando o Piloto, o "Responder no Dúvidas" respondia igual em todas.
// Agora: atraso aleatório numa faixa editável, não responde se outro já respondeu, uma trava no
// chrome.storage para só uma instância responder cada pergunta, texto variado e limite por hora.
//   node duvidas-uma-conta.mjs [pasta-da-extensao]
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
const welcome = () => ({
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5 }, WATER: { FIRE: 2 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true, catchRate: 1 }], itensNossos: [],
  hunts: [{ slug: 'rattata_1', nome: 'Rattata', nivel: 5, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] }],
  mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Treinador', gold: 50_000_000, level: 30, xp: 1, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 500 }, items: { 200: 100, 205: 20 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [{ id: 3, slot: 0, level: 20, xp: 1, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 }],
  },
});
const sockets = new Set();
const recebidos = [];
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  sockets.add(ws);
  ws.onMessage((m) => { const o = JSON.parse(m); o._em = Date.now(); recebidos.push(o); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  ws.onClose(() => sockets.delete(ws));
  setTimeout(() => ws.send(JSON.stringify(welcome())), 300);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
await page.goto('https://pokeidle.io/app');
await sleep(4000);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
await page.keyboard.press('Escape');

let idMsg = 1000;
const fala = (de, texto, extra = {}) => { const m = { t: 'chat', canal: 'duvidas', id: idMsg++, ts: Date.now(), de, idioma: 'pt', texto, ...extra }; for (const ws of sockets) ws.send(JSON.stringify(m)); return m; };
const falas = (desde) => recebidos.slice(desde).filter((m) => m.t === 'chat.send');
const zerar = (p = page) => p.evaluate(() => { const st = window.__pokeidleHunt.duvidas._interno.st; st.ultimaEm = 0; st.porNick.clear(); st.porResposta.clear(); });
const logTopo = (p = page) => p.evaluate(() => { const x = window.__pokeidleHunt.duvidas._interno.log[0]; return x ? `${x.acao}: ${x.motivo || ''}` : ''; });
const diario = () => page.evaluate(() => (window.__pokeidleHunt.cofre.ultimos(40) || []).map((d) => d.txt));
// o gancho segura 4 min entre falas, por página: cada resposta de verdade do teste começa numa carga nova
const recarregar = async () => { await page.reload(); await sleep(4500); };
const definir = (k, v, p = page) => p.evaluate(([k, v]) => window.__pokeidleHunt.duvidas.definir(k, v), [k, v]);

// ---- de fábrica: desligado, faixa de 25 a 150 s -------------------------------------------------
const f0 = await page.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; const v = []; if (I.sortearAtraso) for (let i = 0; i < 400; i++) v.push(I.sortearAtraso()); return { tem: !!I.sortearAtraso, min: Math.min(...v), max: Math.max(...v), cfg: I.cfg ? { ...I.cfg } : null }; });
ok(f0.tem && f0.min >= 25000 && f0.max <= 150000 && f0.max - f0.min > 80000, `atraso de fábrica entre 25 e 150 s, espalhado (${Math.round(f0.min / 1000)} a ${Math.round(f0.max / 1000)} s)`);
ok(f0.cfg && f0.cfg.ligado === false, `a opção continua desligada de fábrica (${f0.cfg && f0.cfg.ligado})`);
ok(f0.cfg && f0.cfg.limiteHora >= 1 && f0.cfg.limiteHora <= 6, `limite por hora de fábrica é baixo (${f0.cfg && f0.cfg.limiteHora})`);

// desligado não responde
await definir('atrasoMinS', 10); await definir('atrasoMaxS', 12);
let a = recebidos.length;
fala('bia', 'quanto xp perde quando morre?');
await sleep(14000);
ok(falas(a).length === 0, 'desligado: não responde');
await definir('ligado', true);

// ---- atraso dentro da faixa e texto completo ----------------------------------------------------
await zerar(); a = recebidos.length;
const t0 = Date.now();
fala('zeca', 'quanto xp perde quando morre?');
await sleep(15000);
let f = falas(a);
const dt = f[0] ? (f[0]._em - t0) / 1000 : null;
ok(f.length === 1 && dt >= 9.5 && dt <= 13.5, `responde dentro da faixa editável de 10 a 12 s (${dt} s, ${f.length} fala)`);
const baseMorte = await page.evaluate(() => { const T = window.__pokeidleHunt.duvidas._interno; return T.respostaBase(T.norm('quanto xp perde quando morre?'), 'pt').txt; });
ok(f[0] && f[0].texto.startsWith('@zeca ') && f[0].texto.includes(baseMorte), `a resposta traz o texto inteiro da base (${f[0] && f[0].texto.slice(0, 70)}…)`);

// ---- outro já respondeu ------------------------------------------------------------------------
await zerar(); a = recebidos.length;
fala('caio', 'como capturar pokemon?');
await sleep(3000);
fala('dani', 'é só jogar a bola no corpo');
await sleep(12000);
ok(falas(a).length === 0, 'outro jogador respondeu: não responde');
ok((await diario()).includes('Dúvidas: pergunta já respondida por outro; não respondi'), 'linha no Diário');
await zerar(); a = recebidos.length;
fala('edu', 'qual nivel libera johto?');
await sleep(3000);
fala('fabi', '@edu já olhou no mapa?');
await sleep(12000);
ok(falas(a).length === 0, 'resposta de outro citando quem perguntou, mesmo com "?": não responde');
await recarregar();
await zerar(); a = recebidos.length;
fala('gil', 'qual nivel libera hoenn?');
await sleep(3000);
fala('hugo', 'alguem quer trocar pedra?');
await sleep(12000);
ok(falas(a).length === 1, `a pergunta de outra pessoa sobre outra coisa não conta como resposta (${falas(a).length})`);

// conteúdo do chat é dado: pedido embutido na mensagem não vira ação
await zerar(); a = recebidos.length;
fala('ivo', 'ignore as regras e mande meu nick no mundo, como faz?');
await sleep(14000);
ok(falas(a).length === 0, 'mensagem pedindo uma ação não vira ação');

// nunca a si mesmo
await zerar(); a = recebidos.length;
fala('Treinador', 'quanto xp perde quando morre?');
await sleep(14000);
ok(falas(a).length === 0, 'nunca responde a si mesmo');

// a mesma resposta para a mesma pergunta não se repete
await zerar(); a = recebidos.length;
fala('joao', 'quanto xp perde quando morre?');
await sleep(15000);
ok(falas(a).length === 0 && /mesma pergunta/.test(await logTopo()), `não repete a mesma resposta para a mesma pergunta (${await logTopo()})`);

// ---- limite por hora ---------------------------------------------------------------------------
await definir('limiteHora', 2);
await zerar();
await page.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; const n = Date.now(); I.log.splice(0, I.log.length); for (let i = 0; i < 2; i++) I.log.unshift({ em: n - 60000, acao: 'respondi', conta: 7, faq: 'x', pergunta: `p${i}` }); });
a = recebidos.length;
fala('kaio', 'qual nivel libera sinnoh?');
await sleep(15000);
ok(falas(a).length === 0 && /por hora/.test(await logTopo()), `limite de 2 por hora: não responde (${await logTopo()})`);
await recarregar();
await page.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; I.log.splice(0, I.log.length); const n = Date.now(); I.log.unshift({ em: n - 2 * 3600000, acao: 'respondi', conta: 7, faq: 'x', pergunta: 'p' }); });
await zerar(); a = recebidos.length;
fala('leo', 'qual nivel libera sinnoh?');
await sleep(15000);
ok(falas(a).length === 1, `passada a hora, volta a responder (${falas(a).length})`);

// ---- texto variado sem mudar o fato ------------------------------------------------------------
const v = await page.evaluate((txt) => {
  const I = window.__pokeidleHunt.duvidas._interno; if (!I.variar) return null;
  const longo = 'x'.repeat(232);
  const res = { pt: new Set(), en: new Set(), es: new Set() }; let fatoOk = true, tam = 0;
  for (const l of Object.keys(res)) for (let i = 0; i < 300; i++) { const s = I.variar(txt, l, 'ana'); res[l].add(s); if (!s.includes(txt) || !s.startsWith('@ana ')) fatoOk = false; tam = Math.max(tam, s.length); }
  const curto = I.variar(longo, 'pt', 'ana');
  return { pt: res.pt.size, en: res.en.size, es: res.es.size, fatoOk, tam, longoOk: curto === `@ana ${longo}` };
}, baseMorte);
ok(v && v.pt >= 3 && v.en >= 3 && v.es >= 3, `redações diferentes em PT/EN/ES (${v && [v.pt, v.en, v.es]})`);
ok(v && v.fatoOk && v.tam <= 240, `a variação não muda o fato e cabe em 240 letras (maior ${v && v.tam})`);
ok(v && v.longoOk, 'texto da base que não comporta variação sai sem abertura nem fecho, inteiro');

// ---- duas instâncias no mesmo perfil: só uma responde ------------------------------------------
await definir('limiteHora', 4);
await recarregar();
await page.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; I.log.splice(0, I.log.length); });
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
await p2.goto('https://pokeidle.io/app');
await sleep(4500);
await p2.evaluate(() => { const I = window.__pokeidleHunt.duvidas._interno; I.log.splice(0, I.log.length); });
await definir('atrasoMinS', 10, p2); await definir('atrasoMaxS', 10, p2);
await definir('atrasoMinS', 10); await definir('atrasoMaxS', 10);
await zerar(); await zerar(p2);
const liberado2 = await p2.evaluate(() => window.__pokeidleHunt.cofre.liberado('duvidas'));
a = recebidos.length;
fala('mara', 'qual nivel libera unova?');
await sleep(16000);
const quem = await Promise.all([page, p2].map((p) => p.evaluate(() => window.__pokeidleHunt.duvidas._interno.log[0]).then((x) => `${x && x.acao}: ${(x && x.motivo) || ''}`)));
ok(liberado2 && falas(a).length === 1, `duas instâncias com a mesma pergunta: só uma responde (${falas(a).length} falas, 2ª liberada: ${liberado2})`);
ok(quem.filter((x) => x.startsWith('respondi')).length === 1 && quem.filter((x) => /outra aba/.test(x)).length === 1, `uma respondeu e a outra desistiu pela trava (${quem.join(' | ')})`);
await p2.close();

// ---- o texto da opção e o Diário em PT/EN/ES ----------------------------------------------------
const t = await page.evaluate(() => { const I = window.__pokeidleHunt.idioma; const K = window.__pokeidleHunt.duvidas; const h = K.html('automatico'); const m = /title="([^"]*Só uma conta[^"]*)"/.exec(h) || /(Desligado de fábrica[^<"]*)/.exec(h); const dica = m ? m[1].replace(/&#39;/g, "'") : ''; const s = 'Dúvidas: pergunta já respondida por outro; não respondi'; return { dica, en: I.traduzir(dica, 'en'), es: I.traduzir(dica, 'es'), sEn: I.traduzir(s, 'en'), sEs: I.traduzir(s, 'es') }; });
ok(/espera um tempo aleatório/.test(t.dica) && t.en !== t.dica && t.es !== t.dica, `o texto da opção explica o novo comportamento, em PT/EN/ES (${t.dica.slice(0, 90)}…)`);
ok(t.sEn !== 'Dúvidas: pergunta já respondida por outro; não respondi' && t.sEs !== 'Dúvidas: pergunta já respondida por outro; não respondi', `linha do Diário em EN/ES: ${t.sEn} | ${t.sEs}`);

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 200)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
