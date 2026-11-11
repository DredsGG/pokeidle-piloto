// 1.54.0: busca na aba Caçar (pedido no #5). O campo filtra a tabela "Onde render mais" por nome da
// hunt, espécie que aparece nela ou região, sem acento e sem diferença de maiúscula. Cada linha mantém
// a posição dela no ranking, o 👑 continua sendo o destino de verdade, o foco e o texto não se perdem
// com o redesenho de cada segundo, Esc limpa a busca antes de fechar o painel, e o texto digitado
// nunca vira HTML.
//   node busca-cacar.mjs [pasta-da-extensao]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(process.argv[2] || path.join(AQUI, '../extension'));
const FAKE = path.resolve(AQUI, 'fake');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };

const at = (name, type, power) => [{ name, type, power, category: 'PHYSICAL', cooldownMs: 15900, learnLevel: 1 }];
const NOVAS = [
  { pokeId: 16, name: 'Pidgey', type1: 'NORMAL', type2: 'FLYING', baseHp: 40, baseAtk: 45, baseDef: 40, baseSpAtk: 35, baseSpDef: 35, baseSpeed: 56, attacks: at('Tackle', 'NORMAL', 40), loot: [] },
  { pokeId: 669, name: 'Flabébé', type1: 'FAIRY', baseHp: 255, baseAtk: 38, baseDef: 230, baseSpAtk: 61, baseSpDef: 230, baseSpeed: 42, attacks: at('Tackle', 'NORMAL', 40), loot: [] },
];
const HUNTS = [
  { slug: 'rattata_1', nome: 'Rattata', nivel: 10, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 10 }] },
  { slug: 'squirtle_1', nome: 'Squirtle', nivel: 12, regiao: 'kanto', especies: [{ pokeId: 7, pontos: 8 }] },
  { slug: 'charmander_1', nome: 'Charmander', nivel: 11, regiao: 'kanto', especies: [{ pokeId: 4, pontos: 8 }] },
  { slug: 'pidgey_1', nome: 'Pidgey', nivel: 13, regiao: 'kanto', especies: [{ pokeId: 16, pontos: 10 }] },
  { slug: 'rota_mista', nome: 'Rota Mista', nivel: 14, regiao: 'kanto', especies: [{ pokeId: 19, pontos: 6 }, { pokeId: 16, pontos: 6 }, { pokeId: 7, pontos: 3 }] },
  { slug: 'bosque_1', nome: 'Bosque Sereno', nivel: 9, regiao: 'johto', especies: [{ pokeId: 16, pontos: 6 }, { pokeId: 19, pontos: 6 }] },
  { slug: 'ruinas_1', nome: 'Ruínas', nivel: 8, regiao: 'johto', especies: [{ pokeId: 4, pontos: 6 }] },
  { slug: 'jardim_1', nome: 'Jardim', nivel: 10, regiao: 'kalos', especies: [{ pokeId: 669, pontos: 6 }] },
];

const { chromium } = require('playwright');
const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const erros = [];
await ctx.route('https://pokeidle.io/**', async (route) => {
  const u = new URL(route.request().url());
  const arq = u.pathname === '/app' ? 'app.html' : u.pathname.slice(1);
  if (arq === 'assets/creatures.json') {
    const base = JSON.parse(fs.readFileSync(path.join(FAKE, arq), 'utf8'));
    base.creatures = [...base.creatures.filter((c) => !NOVAS.some((n) => n.pokeId === c.pokeId)), ...NOVAS];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(base) });
  }
  const p = path.join(FAKE, arq);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const tipo = p.endsWith('.mjs') || p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : p.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: tipo, body: fs.readFileSync(p) });
  }
  return route.fulfill({ status: 404, body: 'nao tem' });
});
const welcome = {
  t: 'welcome',
  tabelaTipos: { FIRE: { WATER: 0.5, FIRE: 0.5, GRASS: 2 }, WATER: { FIRE: 2, WATER: 0.5 }, NORMAL: {} },
  ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [],
  catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true }],
  itensNossos: [], hunts: HUNTS, mercado: { catalogo: [], taxaDiaria: 100000 },
  estado: {
    id: 7, nick: 'Trainer', gold: 80_000_000, level: 30, xp: 400000, activeId: 3, huntSlug: 'rattata_1', servidorAgora: Date.now(),
    automation: { ballIds: [1], potionIds: [200], reviveIds: [205] }, balls: { 1: 50 }, items: { 200: 10, 205: 2 },
    casa: { lista: [] }, passe: {}, chocadeira: { total: 1, ovos: [] },
    pokemons: [
      { id: 3, slot: 0, level: 20, xp: 9000, nome: 'Charmander', speciesId: 4, tipos: ['FIRE'], quality: 1.2, potencia: 1, ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 }, stats: { hp: 60, atk: 30, def: 25, spAtk: 35, spDef: 30, speed: 35 }, maxHp: 720, hp: 720 },
    ],
  },
};
await ctx.routeWebSocket('wss://pokeidle.io/ws', (ws) => {
  ws.onMessage((m) => { const o = JSON.parse(m); if (o.t === 'ping') ws.send(JSON.stringify({ t: 'pong' })); });
  setTimeout(() => ws.send(JSON.stringify(welcome)), 300);
});
await ctx.addInitScript(() => { try { localStorage.setItem('piloto:idioma', 'pt'); localStorage.setItem('piloto:dev:semGuia', '1'); } catch {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push(`pageerror ${String(e)}`));

const campo = '.plt-janela [data-conteudo] [data-busca]';
const leTabela = () => page.evaluate(() => {
  const al = document.querySelector('.plt-janela [data-conteudo]');
  if (!al) return null;
  const linhas = [...al.querySelectorAll('.pih-tab tbody tr')].map((tr) => ({
    pos: tr.querySelector('.pih-pos')?.textContent.trim(),
    nome: tr.querySelector('.pih-hunt b')?.childNodes[0]?.textContent.trim(),
    small: tr.querySelector('.pih-hunt small')?.textContent.trim(),
    top: tr.classList.contains('pih-top'),
  }));
  const c = al.querySelector('[data-busca]');
  return {
    linhas,
    coroa: al.querySelector('.pih-melhor strong')?.textContent.trim() ?? null,
    n: al.querySelector('.pih-busca-n')?.textContent.trim() ?? null,
    nada: al.querySelector('.pih-busca-nada')?.textContent.trim() ?? null,
    temCampo: !!c,
    valor: c ? c.value : null,
    foco: !!c && document.activeElement === c,
    placeholder: c ? c.getAttribute('placeholder') : null,
    limpar: !!al.querySelector('[data-acao="limpar-busca"]'),
    imgs: al.querySelectorAll('img[src="x"]').length,
  };
});
const esperar = async (f, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(200); } return false; };
const buscar = async (texto) => {
  await page.locator(campo).click();
  await page.locator(campo).fill('');
  await page.keyboard.type(texto, { delay: 40 });
  await sleep(1200);
  return leTabela();
};
const abrirPainel = async () => {
  await page.evaluate(() => { if (!document.querySelector('.plt-janela')) document.querySelector('button.plt-barra').click(); });
  await sleep(900);
  await page.evaluate(() => { const b = document.querySelector('.plt-cats [data-aba="hunts"]'); b && b.click(); });
  await esperar(async () => ((await leTabela())?.linhas.length ?? 0) > 0, 8000);
};

await page.goto('https://pokeidle.io/app');
await sleep(4000);
await page.locator('button.plt-barra').click(); await sleep(800);
await page.locator('.plt-janela .plt-modo-bt[data-modo="automatico"]').click(); await sleep(1200);
await abrirPainel();

// ---- sem busca: igual a antes -------------------------------------------------------------------
const t0 = await leTabela();
ok(t0 && t0.temCampo, `a aba Caçar tem o campo de busca (${t0 && t0.temCampo})`);
ok(t0 && t0.linhas.length === 5, `sem busca, no Automático, a tabela mostra as 5 de sempre (${t0 && t0.linhas.length})`);
const coroa0 = t0 && t0.coroa;
ok(!!coroa0, `o 👑 aparece (${coroa0})`);
ok(t0 && !t0.linhas.some((l) => l.nome === 'Jardim'), `a hunt de Flabébé (Jardim, muito resistente) fica fora das 5 primeiras (${t0 && t0.linhas.map((l) => l.nome).join(', ')})`);
ok(t0 && t0.n === null && !t0.limpar, 'sem busca não há contador nem ×');
if (!t0 || !t0.temCampo) {
  console.log(`${falhas} FALHA(S)`);
  await ctx.close();
  process.exit(1);
}

// ---- por espécie, sem acento: acha a que estava escondida, com a posição dela no ranking ------------
let t = await buscar('flabebe');
ok(t.linhas.length === 1 && t.linhas[0].nome === 'Jardim', `"flabebe" acha só Jardim (${t.linhas.map((l) => l.nome).join(', ')})`);
ok(t.linhas[0] && Number(t.linhas[0].pos) > 5, `Jardim mantém a posição dele no ranking (#${t.linhas[0] && t.linhas[0].pos})`);
ok(t.linhas[0] && /tem Flabébé/.test(t.linhas[0].small), `a linha diz qual espécie casou (${t.linhas[0] && t.linhas[0].small})`);
ok(t.linhas[0] && !t.linhas[0].top, 'Jardim não ganha o destaque de 1º só por ser o único que aparece');
ok(t.coroa === coroa0, `o 👑 continua sendo o destino de verdade (${t.coroa})`);
ok(t.n === '1/8' && t.limpar, `contador e × aparecem (${t.n})`);
ok(t.foco && t.valor === 'flabebe', `o foco e o texto ficam no campo depois do filtro (${t.foco}, "${t.valor}")`);

// ---- espécie em mais de uma hunt, maiúscula ---------------------------------------------------------
t = await buscar('SQUIR');
const nomesSq = t.linhas.map((l) => l.nome).sort().join(',');
ok(nomesSq === 'Rota Mista,Squirtle', `"SQUIR" acha Squirtle e Rota Mista (${nomesSq})`);
ok(t.linhas.every((l) => /tem Squirtle/.test(l.small)), `as duas dizem "tem Squirtle" (${t.linhas.map((l) => l.small).join(' | ')})`);
ok(t.n === '2/8', `contador 2/8 (${t.n})`);
const posSq = t.linhas.map((l) => Number(l.pos));
ok(posSq[0] < posSq[1], `na ordem do ranking (${posSq.join(', ')})`);

// ---- nome da hunt sem acento e região --------------------------------------------------------------
t = await buscar('ruinas');
ok(t.linhas.length === 1 && t.linhas[0].nome === 'Ruínas', `"ruinas" acha Ruínas (${t.linhas.map((l) => l.nome).join(', ')})`);
ok(t.linhas[0] && !/tem /.test(t.linhas[0].small), 'casou pelo nome da hunt: sem "tem"');
t = await buscar('johto');
ok(t.linhas.map((l) => l.nome).sort().join(',') === 'Bosque Sereno,Ruínas', `"johto" acha as 2 hunts de Johto (${t.linhas.map((l) => l.nome).join(', ')})`);

// ---- nada encontrado e texto que parece HTML -----------------------------------------------------
t = await buscar('zzz');
ok(t.linhas.length === 0 && t.nada === 'Nenhuma hunt com “zzz”.', `sem resultado: aviso (${t.nada})`);
ok(t.coroa === coroa0, 'sem resultado, o 👑 continua lá');
await page.evaluate(() => { window.__xss = 0; });
t = await buscar('<img src=x onerror="window.__xss=1">');
const xss = await page.evaluate(() => window.__xss);
ok(t.imgs === 0 && xss === 0, `o texto digitado não vira HTML (img ${t.imgs}, xss ${xss})`);
ok(t.nada && t.nada.includes('<img src=x'), `o aviso mostra o texto como texto (${t.nada})`);

// ---- o redesenho de cada segundo não apaga o que foi digitado ------------------------------------
await page.locator(campo).click();
await page.locator(campo).fill('');
await page.keyboard.type('pid', { delay: 120 });
await sleep(3500);
t = await leTabela();
ok(t.foco && t.valor === 'pid', `digitando devagar: foco e texto intactos (${t.foco}, "${t.valor}")`);
ok(t.linhas.map((l) => l.nome).sort().join(',') === 'Bosque Sereno,Pidgey,Rota Mista', `"pid" filtra as 3 com Pidgey (${t.linhas.map((l) => l.nome).join(', ')})`);
// digitar logo depois do filtro: a letra não some
await page.keyboard.type('g', { delay: 0 });
await sleep(260);
await page.keyboard.type('e', { delay: 0 });
await sleep(1200);
t = await leTabela();
ok(t.valor === 'pidge', `letras digitadas durante o redesenho não somem ("${t.valor}")`);
// sai do campo: o painel volta a atualizar sozinho e a busca continua
await page.locator('.plt-janela [data-titulo]').click();
await sleep(3000);
t = await leTabela();
ok(!t.foco && t.valor === 'pidge' && t.linhas.length === 3, `fora do campo, depois de 3 s de atualização: busca mantida (${t.valor}, ${t.linhas.length} linhas)`);

// ---- × e Esc ---------------------------------------------------------------------------------------
await page.locator('.plt-janela [data-acao="limpar-busca"]').click();
await sleep(1000);
t = await leTabela();
ok(t.valor === '' && t.linhas.length === 5 && t.n === null, `× limpa e volta às 5 (${t.linhas.length}, "${t.valor}")`);
t = await buscar('kalos');
ok(t.linhas.length === 1, `"kalos" filtra (${t.linhas.length})`);
await page.keyboard.press('Escape'); await sleep(1000);
const aberto1 = await page.evaluate(() => !!document.querySelector('.plt-janela'));
t = await leTabela();
ok(aberto1 && t && t.valor === '' && t.linhas.length === 5, `Esc com texto limpa a busca e o painel fica aberto (${aberto1}, ${t && t.linhas.length})`);
ok(t && t.foco, 'o foco fica no campo depois do Esc');
await page.keyboard.press('Escape'); await sleep(600);
const aberto2 = await page.evaluate(() => !!document.querySelector('.plt-janela'));
ok(!aberto2, `Esc com o campo vazio fecha o painel, como antes (${aberto2})`);

// ---- reabrir: busca vazia -------------------------------------------------------------------------
await abrirPainel();
t = await buscar('rota');
await page.locator('.plt-janela [data-titulo]').click(); await sleep(400);
await page.evaluate(() => document.querySelector('.plt-janela [data-acao="fechar"]').click()); await sleep(600);
await abrirPainel();
t = await leTabela();
ok(t.valor === '' && t.linhas.length === 5, `ao reabrir o painel a busca começa vazia (${t.linhas.length}, "${t.valor}")`);

// ---- inglês -----------------------------------------------------------------------------------------
await page.evaluate(() => document.querySelector('.plt-janela [data-idioma="en"]').click());
await sleep(1200);
t = await buscar('flab');
await sleep(800);
t = await leTabela();
ok(t.placeholder === 'Search hunt, Pokémon or region', `placeholder em inglês (${t.placeholder})`);
ok(t.linhas[0] && /has Flabébé/.test(t.linhas[0].small), `"tem" em inglês (${t.linhas[0] && t.linhas[0].small})`);
t = await buscar('qqq');
await sleep(800);
t = await leTabela();
ok(t.nada === 'No hunt matches “qqq”.', `aviso sem resultado em inglês (${t.nada})`);
await page.evaluate(() => document.querySelector('.plt-janela [data-idioma="pt"]').click());

const errosPag = erros.filter((x) => /pageerror|TypeError|ReferenceError/.test(x));
ok(!errosPag.length, `sem erro de página (${errosPag.join(' | ').slice(0, 300)})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
setTimeout(() => process.exit(falhas ? 1 : 0), 200);
await ctx.close();
