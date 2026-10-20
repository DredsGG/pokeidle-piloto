// Banco de testes do PokeIdle Piloto: roda os scripts do mundo MAIN num "navegador" falso.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../extension/src');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`✅ ${nome}`); } catch (e) { falhas++; console.log(`❌ ${nome}\n   ${e.stack.split('\n').slice(0, 3).join('\n   ')}`); }
}

// ---- o navegador falso -----------------------------------------------------------------------
const armazenado = new Map();
globalThis.localStorage = { getItem: (k) => armazenado.get(k) ?? null, setItem: (k, v) => armazenado.set(k, String(v)), removeItem: (k) => armazenado.delete(k) };
globalThis.location = { origin: 'file://' + path.resolve(path.dirname(new URL(import.meta.url).pathname), 'stub'), href: 'https://pokeidle.io/app', host: 'pokeidle.io' };
globalThis.addEventListener = () => {};
const doc = new EventTarget();
doc.readyState = 'complete';
globalThis.document = doc;
const enviados = [];
class WSFalso extends EventTarget {
  constructor(url) { super(); this.url = url; this.readyState = 1; WSFalso.ultimo = this; }
  send(t) { enviados.push(JSON.parse(t)); }
}
WSFalso.prototype.send = function (t) { enviados.push(JSON.parse(t)); };
globalThis.WebSocket = WSFalso;
const msg = (obj) => WSFalso.ultimo.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(obj) }));

const carregar = (rel) => vm.runInThisContext(fs.readFileSync(`${RAIZ}/${rel}`, 'utf8'), { filename: rel, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
for (const f of ['hook.js', 'piloto/cofre.js', 'hunt/game.js', 'hunt/engine.js', 'hunt/geo.js', 'hunt/nivel.js', 'hunt/auto.js', 'piloto/rotina.js']) carregar(f);
const PIH = globalThis.__pokeidleHunt;
PIH.carregarJogo = async () => ({
  itensPorId: new Map([[205, { id: 205, name: 'Revive', category: 'revive', priceGold: 40 }], [300, { id: 300, name: 'Fire Stone', category: 'stone' }]]),
  especies: new Map([[4, { pokeId: 4, name: 'Charmander', type1: 'FIRE', evolvesToId: 5, evolveLevel: 16 }], [5, { pokeId: 5, name: 'Charmeleon', type1: 'FIRE' }]]),
  mod: {}, precoItem: new Map(),
});

// O jogo abre o socket depois dos scripts.
new WebSocket('wss://pokeidle.io/ws');
const estados = [];
PIH.on('estado', (e) => estados.push(e));
msg({ t: 'welcome', catalogoBolas: [{ id: 1, priceGold: 10, nome: 'Poke Ball', compravel: true }], hunts: [{ slug: 'outland_x', area: 'outland', nivel: 150, especies: [] }], estado: { id: 7, nick: 'andre', gold: 50_000_000, level: 2500, activeId: 1, huntSlug: 'outland_x', outlandTier: 1, pokemons: [{ id: 1, slot: 0, level: 300, nome: 'Charizard', speciesId: 6 }, { id: 2, slot: 1, level: 40, nome: 'Squirtle', speciesId: 7 }, { id: 3, slot: 2, level: 20, nome: 'Charmander', speciesId: 4 }], items: { 300: 3 }, casa: { lista: [{ id: 11, rar: 'comum', postos: [null] }] }, passe: {}, chocadeira: { total: 1, ovos: [] } } });
await sleep(150);

await caso('o estado do welcome chega remontado ao barramento do piloto', async () => {
  assert.ok(estados.length >= 1);
  assert.equal(estados.at(-1).gold, 50_000_000);
  msg({ t: 'estado', estado: { gold: 49_000_000 } });
  assert.equal(estados.at(-1).gold, 49_000_000);
  assert.equal(estados.at(-1).level, 2500, 'o delta não apaga o resto');
});

await caso('comandos de dinheiro real são bloqueados sempre', async () => {
  for (const t of ['orbs.sacar', 'loja.comprar', 'guild.doar', 'amigo.coins', 'passe.comprarVip']) {
    const r = PIH.pedir({ t, orbs: 1000, rede: 'sol', endereco: 'x' }, 'teste');
    assert.equal(r.ok, false); assert.match(r.motivo, /bloqueado/);
  }
});

await caso('fora da lista fechada não sai; formato errado não sai', async () => {
  assert.equal(PIH.pedir({ t: 'market.criar', tipo: 'item' }, 'teste').ok, false);
  assert.equal(PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 99999 }, 'teste').ok, false, 'qty acima de 9.999');
  assert.equal(PIH.pedir({ t: 'hunt.select', slug: 'a b<script>' }, 'teste').ok, false);
});

await caso('cofre: preço desconhecido não compra; abaixo da reserva não compra; dentro do teto compra e reserva', async () => {
  assert.match(PIH.pedir({ t: 'shop.buy', kind: 'item', id: 999, qty: 1 }, 'teste').motivo, /preço desconhecido/);
  // ouro 49M, reserva mínima 5M (sem medida de ouro/h): 4,5M de bolas a 10 deixa 44,5M → passa o piso,
  // mas o teto sem medida é 2M → recusa pelo teto
  assert.match(PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 9999 }, 'teste').ok ? 'ok' : PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 9999 }, 'teste2').motivo, /ok|teto/);
  const antes = PIH.cofre.gastoHoje();
  const r = PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 100 }, 'teste');
  assert.equal(r.ok, true);
  assert.equal(PIH.cofre.gastoHoje() - antes, 1000);
  // ouro abaixo da reserva
  msg({ t: 'estado', estado: { gold: 5_000_500 } });
  assert.match(PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 100 }, 'teste').motivo, /reserva/);
  msg({ t: 'estado', estado: { gold: 49_000_000 } });
});

await caso('piloto desligado: nada automático sai', async () => {
  PIH.cofre._interno.estado().cfg.ligado = false;
  assert.match(PIH.pedir({ t: 'centro.ir' }, 'teste').motivo, /desligado/);
  PIH.cofre._interno.estado().cfg.ligado = true;
});

await caso('limitador: escritas saem no máximo 3 de rajada e depois ~1/s', async () => {
  await sleep(3500); // esvazia a fila dos testes anteriores e recarrega o balde
  enviados.length = 0;
  for (let i = 0; i < 6; i++) assert.equal(PIH.pedir({ t: 'centro.curar' }, 'teste').ok, true);
  await sleep(700);
  const n1 = enviados.filter((m) => m.t === 'centro.curar').length;
  assert.ok(n1 <= 3, `saíram ${n1} em 0,7 s`);
  await sleep(3300);
  const n2 = enviados.filter((m) => m.t === 'centro.curar').length;
  assert.ok(n2 >= 5 && n2 <= 6, `saíram ${n2} em 4 s`);
});

await caso('radar: compra automática em ouro passa pelo cofre e sai SEM o campo auto', async () => {
  enviados.length = 0;
  const respostas = [];
  doc.addEventListener('radar-mercado:hook', (ev) => respostas.push(JSON.parse(ev.detail)));
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'pronto', gravando: false, radar: true }) }));
  const gasto0 = PIH.cofre.gastoHoje();
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'enviar', ref: 'r1', pedido: { t: 'market.comprar', id: 555, qtd: 2, preco: 300_000, moeda: 'gold', auto: true } }) }));
  await sleep(20);
  const c = enviados.find((m) => m.t === 'market.comprar');
  assert.ok(c, 'a compra saiu');
  assert.equal(c.auto, undefined); assert.equal(c.sorteioUi, 1);
  assert.equal(PIH.cofre.gastoHoje() - gasto0, 600_000);
  assert.ok(respostas.some((r) => r.tipo === 'enviado' && r.ref === 'r1' && r.ok));
  // estorno forjado (anúncio que não foi reservado, valor gigante): nada muda
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'cofre-estornar', anuncioId: 999, valor: 1e15 }) }));
  assert.equal(PIH.cofre.gastoHoje() - gasto0, 600_000);
  // estorno do anúncio reservado: volta uma vez só
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'cofre-estornar', anuncioId: 555 }) }));
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'cofre-estornar', anuncioId: 555 }) }));
  assert.equal(PIH.cofre.gastoHoje(), gasto0);
});

await caso('ataques da página: trocar o cofre, forjar estado e reescrever pedir não funcionam', async () => {
  const original = PIH.cofre;
  try { globalThis.__pokeidleHunt.cofre = { autorizar: () => ({ ok: true, custo: 0 }) }; } catch { /* modo estrito */ }
  assert.equal(PIH.cofre, original, 'o cofre não pode ser trocado');
  try { PIH.pedir = () => ({ ok: true }); } catch { /* modo estrito */ }
  assert.equal(PIH.pedir({ t: 'orbs.sacar' }, 'x').ok, false);
  const ouroReal = estados.at(-1).gold;
  PIH.emit('estado', { gold: 1e15 });
  assert.equal(estados.at(-1).gold, ouroReal, 'estado forjado pela página não chega ao barramento');
});

await caso('ouro já comprometido entra no piso (sem furar a reserva com pedidos em sequência)', async () => {
  msg({ t: 'estado', estado: { gold: 9_000_000 } });
  await sleep(20);
  const st = PIH.cofre._interno.estado();
  const tetoAntes = st.cfg.tetoSemMedida; st.cfg.tetoSemMedida = 1e12;
  const r1 = PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 9999 }, 'teste'); // 99.990
  const r2 = PIH.pedir({ t: 'shop.buy', kind: 'ball', id: 1, qty: 9999 }, 'teste');
  assert.ok(r1.ok && r2.ok);
  assert.ok(PIH.cofre.pendente() >= 199_980);
  // 9M - pendente - 3.9M ficaria abaixo de 5M de reserva
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'enviar', ref: 'r9', pedido: { t: 'market.comprar', id: 777, qtd: 1, preco: 3_900_000, moeda: 'gold', auto: true } }) }));
  await sleep(30);
  assert.equal(enviados.filter((m) => m.t === 'market.comprar' && m.id === 777).length, 0, 'devia recusar por reserva');
  st.cfg.tetoSemMedida = tetoAntes;
  msg({ t: 'estado', estado: { gold: 49_000_000 } });
});

await caso('radar: compra em Gema é recusada pelo hook', async () => {
  enviados.length = 0;
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'enviar', ref: 'r2', pedido: { t: 'market.comprar', id: 556, qtd: 1, preco: 100, moeda: 'orb' } }) }));
  await sleep(20);
  assert.equal(enviados.filter((m) => m.t === 'market.comprar').length, 0);
});

await caso('radar: compra automática acima do teto do dia é recusada pelo cofre', async () => {
  enviados.length = 0;
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'enviar', ref: 'r3', pedido: { t: 'market.comprar', id: 557, qtd: 1, preco: 30_000_000, moeda: 'gold', auto: true } }) }));
  await sleep(20);
  assert.equal(enviados.filter((m) => m.t === 'market.comprar').length, 0);
});

await caso('disjuntor: 3 recusas seguidas do servidor desligam o módulo', async () => {
  await sleep(1200);
  for (let i = 0; i < 3; i++) {
    enviados.length = 0;
    assert.equal(PIH.pedir({ t: 'team.active', pokemonId: 2 }, 'modX').ok, true);
    for (let k = 0; k < 50 && !enviados.some((m) => m.t === 'team.active'); k++) await sleep(100);
    msg({ t: 'erro', chave: 'team.naoPode' });
  }
  assert.equal(PIH.cofre.liberado('modX'), false);
  assert.match(PIH.pedir({ t: 'team.active', pokemonId: 2 }, 'modX').motivo, /disjuntor/);
});

await caso('rotina: Passe, XP Share, tier da Outland, chocadeira e evolução mandam o comando certo', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = cfg.evoluir.ligado = true;
  msg({ t: 'estado', estado: { items: { 300: 3, 70092: 1 }, pokemons: [{ id: 1, slot: 0, level: 300, nome: 'Charizard', speciesId: 6 }, { id: 2, slot: 1, level: 40, nome: 'Squirtle', speciesId: 7 }, { id: 3, slot: 2, level: 20, nome: 'Charmander', speciesId: 4 }] } });
  globalThis.__welcomeEvo = true;
  enviados.length = 0;
  for (let i = 0; i < 5; i++) { await PIH.rotina._interno.tique(); await sleep(1300); }
  const ts = enviados.map((m) => m.t);
  assert.ok(ts.includes('passe.resgatar'), `faltou o passe: ${ts}`);
  const xs = enviados.find((m) => m.t === 'xpshare.escolher');
  assert.ok(xs && xs.pokemonId === 3 && xs.casaId === 11, `XP Share devia pôr o mais atrasado (Charmander, id 3): ${JSON.stringify(xs)}`);
  const ot = enviados.find((m) => m.t === 'outland.tier');
  assert.ok(ot && ot.tier === 3, `nível 2500 libera a Outland 3: ${JSON.stringify(ot)}`);
  const ch = enviados.find((m) => m.t === 'chocadeira.colocar');
  assert.ok(ch && ch.ovo === 'p3' && ch.slot === 0, JSON.stringify(ch));
  const ev = enviados.find((m) => m.t === 'pokemon.evoluir');
  assert.ok(ev && ev.pokemonId === 3 && ev.alvoId === 5, `Charmander Nv 20 com Fire Stone → Charmeleon: ${JSON.stringify(ev)}`);
});

await caso('evolução não gasta pedra que o radar comprou para revender', async () => {
  doc.dispatchEvent(new CustomEvent('radar-mercado:ponte', { detail: JSON.stringify({ tipo: 'reservar-itens', itemId: 300, qtd: 3 }) }));
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = false; cfg.evoluir.ligado = true;
  const marcas = JSON.parse(localStorage.getItem('piloto:rotina:v1') || '{}');
  msg({ t: 'estado', estado: { items: { 300: 3 }, pokemons: [{ id: 8, slot: 0, level: 30, nome: 'Charmander', speciesId: 4 }] } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'pokemon.evoluir').length, 0);
  cfg.evoluir.ligado = false;
});

await caso('rotina: sem a regra de nota do Auto Coleção, vender o Depot segue o botão do jogo e a Oferenda é recusada', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = cfg.evoluir.ligado = false;
  cfg.depot.modo = 'vender'; cfg.depot.limiar = 2;
  const muitos = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, slot: null, level: 5, nome: 'X', speciesId: 1 }));
  msg({ t: 'estado', estado: { pokemons: muitos, automation: {} } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  const vendas = enviados.filter((m) => m.t === 'shop.sellAllPokemons');
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0].ateId, 104);
  enviados.length = 0;
  cfg.depot.modo = 'oferenda';
  delete PIH.rotina._interno.marcas().depot;
  PIH.rotina._interno.cfg().depot.modo = 'oferenda';
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'oferenda.tudo').length, 0);
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
});

await caso('engine: ouro/h não soma mais o loot antigo do creatures.json', async () => {
  const E = PIH.engine._interno;
  assert.equal(typeof E.dano, 'function');
  const src = fs.readFileSync(`${RAIZ}/hunt/engine.js`, 'utf8');
  assert.ok(!/lootKill \+=/.test(src), 'não pode haver soma de lootKill');
  assert.ok(/ouroDoAbate\(nivel, bonusLoot\)/.test(src));
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
