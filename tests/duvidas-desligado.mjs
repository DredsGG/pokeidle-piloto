// 1.54.3 (issue #8: banimento do chat do jogo): o Piloto NÃO escreve mais no chat. Prova que
//  (a) com a opção salva como LIGADA (e espera curta, o pior caso) nenhum envio acontece, o valor salvo é ignorado e a chave é apagada;
//  (b) o comando de chat não está na lista fechada do gancho e um pedido de envio é recusado sem sair para o jogo;
//  (c) nenhuma string da interface, do dicionário ou das Novidades promete resposta automática, e a aba/opção sumiram da tela.
//   node duvidas-desligado.mjs [pasta-da-extensao]
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
  channel: 'msedge', headless: true, viewport: { width: 1280, height: 860 },
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
// o estado que a 1.52/1.54.2 deixava salvo: opção LIGADA, espera curta, registro de respostas antigas
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1');
    if (!sessionStorage.getItem('piloto:teste:semeado')) {
      localStorage.setItem('piloto:teste:duvidas:v1', JSON.stringify({ ligado: true, atrasoMinS: 10, atrasoMaxS: 12, limiteHora: 12 }));
      localStorage.setItem('piloto:teste:duvidas:log', JSON.stringify([{ em: Date.now() - 86400000, acao: 'respondi', de: 'x', pergunta: 'p', resposta: 'r' }]));
      sessionStorage.setItem('piloto:teste:semeado', '1');
    }
  } catch {}
});
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));
await page.goto('https://pokeidle.io/app');
await sleep(4500);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
await page.keyboard.press('Escape');
let idMsg = 1000;
const fala = (de, texto, extra = {}) => { const m = { t: 'chat', canal: 'duvidas', id: idMsg++, ts: Date.now(), de, idioma: 'pt', texto, ...extra }; for (const ws of sockets) ws.send(JSON.stringify(m)); return m; };
const envios = (desde = 0) => recebidos.slice(desde).filter((m) => m.t === 'chat.send' || /^chat\./.test(m.t || ''));
const lerExt = (rel) => fs.readFileSync(path.join(EXT, rel), 'utf8');

// ---- (a) opção salva como ligada: nada é enviado --------------------------------------------------
const c = await page.evaluate(() => {
  const I = window.__pokeidleHunt.duvidas && window.__pokeidleHunt.duvidas._interno;
  return { cfgLigado: I && I.cfg ? I.cfg.ligado : 'sem módulo', chave: localStorage.getItem('piloto:teste:duvidas:v1'), logAntigo: (JSON.parse(localStorage.getItem('piloto:teste:duvidas:log') || '[]')).length, testeDuvidas: typeof window.__pokeidleHunt.testeDuvidas };
});
ok(c.cfgLigado === false, `a opção salva como ligada é ignorada: cfg.ligado = ${c.cfgLigado}`);
ok(c.chave === null, `a chave salva da opção foi apagada (${c.chave})`);
ok(c.logAntigo === 1, `o registro antigo não foi mexido (${c.logAntigo} linha)`);
ok(c.testeDuvidas === 'undefined', 'o módulo não expõe mais a aba nem o "definir" (testeDuvidas)');
const a = recebidos.length;
fala('zeca', 'quanto xp perde quando morre?');
fala('bia', 'como funciona a evolucao do eevee?');
fala('leo', 'quantos pokemons cabem no depot?');
await sleep(20000);
ok(envios(a).length === 0, `perguntas conhecidas no Dúvidas, espera de 10 a 12 s: nenhum envio ao chat (${envios(a).length})`);
await page.reload(); await sleep(4500);
const c2 = await page.evaluate(() => ({ cfgLigado: window.__pokeidleHunt.duvidas._interno.cfg.ligado, chave: localStorage.getItem('piloto:teste:duvidas:v1') }));
ok(c2.cfgLigado === false && c2.chave === null, 'depois de recarregar continua desligado e sem a chave');
const b = recebidos.length;
fala('maria', 'onde compro pokebola?');
await sleep(16000);
ok(envios(b).length === 0, 'nenhum envio também depois de recarregar');

// ---- (b) o comando de chat não existe mais -----------------------------------------------------------
const hook = lerExt('src/hook.js');
ok(!/'chat\.send'\s*:\s*\(/.test(hook), "hook.js: o comando 'chat.send' saiu da lista fechada");
ok(/BLOQUEADOS = Object\.freeze\(new Set\(\[[^\]]*'chat\.send'/.test(hook), "hook.js: 'chat.send' está em BLOQUEADOS (recusa mesmo se alguém pedir)");
const duv = lerExt('src/piloto/duvidas.js');
ok(!/PIH\.pedir\s*\(/.test(duv) && !/PIH\.on\(\s*'chat'/.test(duv) && !/chat\.send/.test(duv.replace(/^\s*\/\/.*$/gm, '')), 'duvidas.js: sem PIH.pedir, sem ouvinte do chat e sem comando de envio (fora dos comentários)');
const e = recebidos.length;
const r = await page.evaluate(() => {
  const P = window.__pokeidleHunt;
  const v = (t) => { try { const x = P.pedir({ t: 'chat.send', canal: 'duvidas', idioma: 'pt', texto: t }, 'duvidas'); return { ok: x.ok, motivo: x.motivo || null }; } catch (er) { return { ok: false, motivo: 'excecao ' + er }; } };
  return { duvidas: v('oi, tudo bem por aqui?'), mundo: (() => { try { return P.pedir({ t: 'chat.send', canal: 'mundo', idioma: 'pt', texto: 'oi' }, 'duvidas').ok; } catch { return false; } })(), cmd: (() => { try { return P.pedir({ t: 'chat.comando', texto: '/x' }, 'duvidas').ok; } catch { return false; } })() };
});
await sleep(1500);
ok(r.duvidas.ok === false, `pedir chat.send no Dúvidas é recusado (${r.duvidas.motivo})`);
ok(r.mundo === false && r.cmd === false, 'chat.send no mundo e chat.comando também são recusados');
ok(envios(e).length === 0, 'nada desses pedidos chegou ao jogo');

// ---- (c) nenhuma string promete resposta automática -----------------------------------------------------
const PROMETE = /(responde|responder|respondes|respond|answer|answers)[^"'`]{0,60}(d[uú]vidas|dudas|questions|chat)|(d[uú]vidas|dudas|questions)[^"'`]{0,50}(responde|respond|answer)/i;
const NEGA = /remov|elimin|sa[ií]ram|are gone|desapare|no longer|n[aã]o escreve|ya no escribe|n[aã]o responde mais|ya no responde/i;
const arquivos = ['src/piloto/idioma-dic.js', 'src/piloto/guia-pt.js', 'src/piloto/guia-en.js', 'src/piloto/guia-es.js', 'src/hunt/ui.js', 'src/hunt/janela.css'];
const achados = [];
for (const rel of arquivos) {
  lerExt(rel).split(/\r?\n/).forEach((l, i) => { if (!/^\s*\/\//.test(l) && PROMETE.test(l) && !NEGA.test(l)) achados.push(`${rel}:${i + 1}: ${l.trim().slice(0, 110)}`); });
}
ok(achados.length === 0, `nenhuma linha de interface/dicionário/Novidades promete resposta no chat (${achados.length} achado(s)) ${achados.join(' || ')}`);
const ui = await page.evaluate(async () => {
  document.querySelector('button.plt-barra').click(); await new Promise((r) => setTimeout(r, 900));
  const abas = [...document.querySelectorAll('.plt-janela .cfg-cat[data-aba]')].map((b) => (b.dataset.aba + ':' + b.textContent.trim()));
  return { abas, texto: document.querySelector('.plt-janela').innerText };
});
ok(!ui.abas.some((x) => /duvidas|Dúvidas|Questions/i.test(x)), `a aba Dúvidas não aparece (${ui.abas.join(', ')})`);
ok(!/Responder no D[uú]vidas|Answer in Questions/i.test(ui.texto), 'a opção "Responder no Dúvidas" não aparece na janela');
const novidade = lerExt('src/piloto/guia-pt.js');
ok(/'1\.54\.3'\s*:\s*\[\s*"Removido: o Piloto não escreve mais no chat do jogo/.test(novidade), 'a Novidade da 1.54.3 diz que o Piloto não escreve mais no chat');

ok(!erros.length, `sem erro de página (${erros.join(' | ').slice(0, 200)})`);
await ctx.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
