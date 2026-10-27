import path from 'node:path';
// Banco de testes do PokeIdle Piloto: roda os scripts do mundo MAIN num "navegador" falso.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const AQUI = path.dirname(new URL(import.meta.url).pathname);

const RAIZ = path.resolve(AQUI, '../extension/src');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
async function caso(nome, fn) {
  try { await fn(); console.log(`✅ ${nome}`); } catch (e) { falhas++; console.log(`❌ ${nome}\n   ${e.stack.split('\n').slice(0, 3).join('\n   ')}`); }
}

// ---- o navegador falso -----------------------------------------------------------------------
const armazenado = new Map();
globalThis.localStorage = { getItem: (k) => armazenado.get(k) ?? null, setItem: (k, v) => armazenado.set(k, String(v)), removeItem: (k) => armazenado.delete(k) };
globalThis.location = { origin: 'file://' + path.resolve(AQUI, 'stub'), href: 'https://pokeidle.io/app', host: 'pokeidle.io' };
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
for (const f of ['hook.js', 'piloto/kit.js', 'piloto/cofre.js', 'hunt/game.js', 'hunt/engine.js', 'hunt/geo.js', 'hunt/nivel.js', 'hunt/auto.js', 'piloto/rotina.js', 'piloto/captura.js']) carregar(f);
const PIH = globalThis.__pokeidleHunt;
PIH.carregarJogo = async () => ({
  itensPorId: new Map([[205, { id: 205, name: 'Revive', category: 'revive', priceGold: 40 }], [201, { id: 201, name: 'Potion', category: 'potion', priceGold: 50 }], [300, { id: 300, name: 'Fire Stone', category: 'stone' }]]),
  especies: new Map([[4, { pokeId: 4, name: 'Charmander', type1: 'FIRE', evolvesToId: 5, evolveLevel: 16 }], [5, { pokeId: 5, name: 'Charmeleon', type1: 'FIRE' }]]),
  mod: {}, precoItem: new Map(),
});

// O Auto Coleção no ponto tem teste próprio (no fim); nos outros fica desligado.
PIH.rotina._interno.cfg().autoColecao.ligado = false;
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

await caso('cofre 1.20: teto do dia = o maior entre o ganho e 15% do saldo acima da reserva', async () => {
  const st = PIH.cofre._interno.estado();
  const guard = { ouroH: st.ouroH, ouroHDia: st.ouroHDia, saldoDia: st.saldoDia };
  st.ouroH = 0; st.ouroHDia = 0; st.saldoDia = 146_600_000; // ganho sem medida: 10 mi
  assert.equal(PIH.cofre.resumo().teto, Math.floor(0.15 * (146_600_000 - 5_000_000)));
  st.saldoDia = 20_000_000; // 15% de 15 mi = 2,25 mi < 10 mi do ganho
  assert.equal(PIH.cofre.resumo().teto, 10_000_000);
  st.ouroH = 3_000_000; st.ouroHDia = 3_000_000; st.saldoDia = 146_600_000; // ganho 36 mi > 15% de (146,6 − 6) mi
  assert.equal(PIH.cofre.resumo().teto, 36_000_000);
  st.saldoDia = 0; // sem saldo conhecido: só o ganho
  assert.equal(PIH.cofre.resumo().teto, 36_000_000);
  Object.assign(st, guard);
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

await caso('rotina: Depot vende igual ao botão do jogo (sem exigir nota), pula a Exp. Share e a Oferenda segue exigindo a nota', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = cfg.evoluir.ligado = false;
  cfg.pvp.time = cfg.pvp.fila = false;
  cfg.depot.modo = 'vender'; cfg.depot.limiar = 2; cfg.depot.horas = 1;
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
  const muitos = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, slot: null, level: 5, nome: 'X', speciesId: 1 }));
  muitos.push({ id: 999, slot: null, level: 5, nome: 'Com XP Share', speciesId: 1, heldItemId: 70050 });
  muitos.push({ id: 500, slot: 0, level: 50, nome: 'Na equipe', speciesId: 1 });
  msg({ t: 'estado', estado: { pokemons: muitos, automation: {} } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  const vendas = enviados.filter((m) => m.t === 'shop.sellAllPokemons');
  assert.equal(vendas.length, 1, `esperava 1 venda, veio: ${enviados.map((m) => m.t)}`);
  assert.equal(vendas[0].ateId, 104, 'ateId = maior id do Depot sem contar quem segura a Exp. Share');
  // Já vendeu: não repete antes do intervalo.
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 0);
  // Oferenda sem nota mínima: não manda.
  cfg.depot.modo = 'oferenda';
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'oferenda.tudo').length, 0);
  cfg.depot.modo = 'off';
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
});

await caso('rotina: Depot na hora — 1 pokémon já vende; a próxima venda só depois de 15 s', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = cfg.evoluir.ligado = false;
  cfg.pvp.time = cfg.pvp.fila = false;
  cfg.depot.modo = 'vender';
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
  PIH.rotina._interno.marcas().depot = 0; // a venda do teste anterior foi há segundos
  msg({ t: 'estado', estado: { pokemons: [{ id: 300, slot: null, level: 5, nome: 'Um só', speciesId: 1 }, { id: 500, slot: 0, level: 50, nome: 'Na equipe', speciesId: 1 }], automation: {} } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 1, 'um pokémon no Depot já vende');
  enviados.length = 0;
  msg({ t: 'estado', estado: { pokemons: [{ id: 301, slot: null, level: 5, nome: 'Outro', speciesId: 1 }, { id: 500, slot: 0, level: 50, nome: 'Na equipe', speciesId: 1 }] } });
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 0, 'segura 15 s entre vendas');
  PIH.rotina._interno.marcas().depot = Date.now() - 16_000;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.deepEqual(enviados.filter((m) => m.t === 'shop.sellAllPokemons').map((m) => m.ateId), [301]);
  cfg.depot.modo = 'off';
  localStorage.setItem('piloto:rotina:v1', JSON.stringify({ cfg, marcas: {} }));
});

await caso('rotina: o perfil Automático liga a venda do Depot', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.depot.modo = 'off'; cfg.depot.limiar = 100; cfg.depot.horas = 6;
  PIH.rotina.aplicar({ depotVender: true });
  const c2 = PIH.rotina._interno.cfg();
  assert.equal(c2.depot.modo, 'vender'); assert.equal(c2.depot.limiar, 50); assert.equal(c2.depot.horas, 1);
  c2.depot.modo = 'off';
});

await caso('PvP: lê, monta a equipe com os 5 de maior Poder, liga a fila automática (VIP) e entra na fila', async () => {
  const cfg = PIH.rotina._interno.cfg();
  for (const k of ['passe', 'xpshare', 'outland', 'chocadeira', 'evoluir', 'rodizio']) cfg[k].ligado = false;
  cfg.depot.modo = 'off';
  cfg.pvp.time = true; cfg.pvp.fila = true;
  const pks = [[1, 900], [2, 50], [3, 400], [4, 1200], [5, 700], [6, 300], [7, 650]].map(([id, poder]) => ({ id, slot: id <= 3 ? id - 1 : null, level: 100, nome: `P${id}`, speciesId: 1, poder }));
  msg({ t: 'estado', estado: { pokemons: pks, loja: { vip: true }, automation: { ballIds: [1], potionIds: [200], pvpAutoFila: false } } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.ok(enviados.some((m) => m.t === 'pvp.info'), `faltou pvp.info: ${enviados.map((m) => m.t)}`);
  msg({ t: 'pvp', time: [1, 2], fila: { na: false } });
  await PIH.rotina._interno.tique(); await sleep(1300);
  const ts = enviados.find((m) => m.t === 'pvp.time.salvar');
  assert.deepEqual(ts && ts.pokemonIds, [4, 1, 5, 7, 3], `equipe por Poder: ${JSON.stringify(ts)}`);
  msg({ t: 'pvp', timeSalvo: [4, 1, 5, 7, 3] });
  await PIH.rotina._interno.tique(); await sleep(1300);
  const au = enviados.find((m) => m.t === 'auto.set');
  assert.ok(au && au.pvpAutoFila === true && Array.isArray(au.ballIds) && au.ballIds[0] === 1, `auto.set tem que manter o resto da automação: ${JSON.stringify(au)}`);
  msg({ t: 'estado', estado: { automation: { ballIds: [1], potionIds: [200], pvpAutoFila: true } } });
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.ok(enviados.some((m) => m.t === 'pvp.fila.entrar'), `faltou entrar na fila: ${enviados.map((m) => m.t)}`);
  // segurança: auto.set não mexe em outra coisa; equipe com pokémon de outro jogador não sai
  assert.equal(PIH.pedir({ t: 'auto.set', autoBallSemParar: true }, 'teste').ok, false);
  assert.equal(PIH.pedir({ t: 'pvp.time.salvar', pokemonIds: [4, 999999] }, 'teste').ok, false);
  assert.equal(PIH.pedir({ t: 'pvp.time.salvar', pokemonIds: [4, 4] }, 'teste').ok, false);
  // Sem roleta: alguém de fora só entra com 2%+ de Poder acima do mais fraco da equipe.
  const marcas = PIH.rotina._interno.marcas();
  const pks2 = pks.map((p) => (p.id === 6 ? { ...p, poder: 405 } : p)); // 405 vs 400 (P3): +1,25%, não troca
  msg({ t: 'estado', estado: { pokemons: pks2 } });
  delete marcas.pvpTime; enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'pvp.time.salvar').length, 0, `trocou por 1%: ${JSON.stringify(enviados)}`);
  const pks3 = pks.map((p) => (p.id === 6 ? { ...p, poder: 450 } : p)); // 450 vs 400: +12,5%, troca o P3
  msg({ t: 'estado', estado: { pokemons: pks3 } });
  delete marcas.pvpTime; enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  const ts2 = enviados.find((m) => m.t === 'pvp.time.salvar');
  assert.deepEqual(ts2 && ts2.pokemonIds, [4, 1, 5, 7, 6], `o melhor novo entra no lugar do mais fraco: ${JSON.stringify(ts2)}`);
  msg({ t: 'pvp', timeSalvo: [4, 1, 5, 7, 6] });
  // Mesmo time com Poder mexendo um pouco: não salva de novo.
  const pks4 = pks3.map((p) => (p.id === 1 ? { ...p, poder: 905 } : p));
  msg({ t: 'estado', estado: { pokemons: pks4 } });
  delete marcas.pvpTime; enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'pvp.time.salvar').length, 0);
  cfg.pvp.time = false; cfg.pvp.fila = false;
});

await caso('rotina: antes de vender o Depot, guarda na Coleção a equipe do PvP, shiny e P5', async () => {
  const cfg = PIH.rotina._interno.cfg();
  for (const k of ['passe', 'xpshare', 'outland', 'chocadeira', 'evoluir', 'rodizio']) cfg[k].ligado = false;
  cfg.pvp.time = false; cfg.pvp.fila = false;
  cfg.depot.modo = 'vender'; cfg.depot.limiar = 2; cfg.depot.horas = 1;
  const marcas = PIH.rotina._interno.marcas();
  for (const k of Object.keys(marcas)) delete marcas[k];
  const pks = [
    { id: 1, slot: 0, level: 900, nome: 'Charizard', speciesId: 6, poder: 3000 },
    ...[11, 12, 13, 14].map((id) => ({ id, slot: null, level: 100, nome: 'Shedinja', speciesId: 292, poder: 50 })),
    { id: 15, slot: null, level: 100, nome: 'Brilhante', speciesId: 1, poder: 10, shiny: true },
    { id: 16, slot: null, level: 100, nome: 'Pfive', speciesId: 1, poder: 10, potencia: 5 },
  ];
  msg({ t: 'estado', estado: { level: 900, activeId: 1, pokemons: pks, automation: { pokemonTravado: [] } } });
  msg({ t: 'pvp', time: [1, 11, 12] });
  enviados.length = 0;
  for (let i = 0; i < 4; i++) { await PIH.rotina._interno.tique(); await sleep(1300); }
  const movidos = enviados.filter((m) => m.t === 'colecao.mover').map((m) => m.pokemonId).sort((a, b) => a - b);
  assert.deepEqual(movidos, [11, 12, 15, 16], `guardados: ${JSON.stringify(enviados)}`);
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 0, 'não vende com protegido fora da Coleção');
  assert.ok(enviados.every((m) => m.para !== 'depot'));
  msg({ t: 'estado', estado: { automation: { pokemonTravado: [11, 12, 15, 16] } } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  const v = enviados.find((m) => m.t === 'shop.sellAllPokemons');
  assert.ok(v && v.ateId === 14, `vende o resto, ateId sem os guardados: ${JSON.stringify(enviados)}`);
  assert.equal(PIH.pedir({ t: 'colecao.mover', pokemonId: 11, para: 'depot' }, 'teste').ok, false);
  assert.equal(PIH.pedir({ t: 'colecao.mover', pokemonId: 999999, para: 'colecao' }, 'teste').ok, false);
  cfg.depot.modo = 'off';
});

await caso('hook: nada do protótipo passa pela lista fechada (constructor, __proto__, toString)', async () => {
  for (const t of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(PIH.pedir({ t }, 'teste').ok, false, t);
});

await caso('cofre: o dia vira sozinho às 00:00 de Brasília e zera o gasto', async () => {
  const st = PIH.cofre._interno.estado();
  st.dia = '2000-01-01'; st.gasto = { repor: 123456 };
  assert.equal(PIH.cofre.gastoHoje(), 0);
  assert.notEqual(st.dia, '2000-01-01');
  assert.deepEqual(st.gasto, {});
});

await caso('engine: ouro/h não soma mais o loot antigo do creatures.json', async () => {
  const E = PIH.engine._interno;
  assert.equal(typeof E.dano, 'function');
  const src = fs.readFileSync(`${RAIZ}/hunt/engine.js`, 'utf8');
  assert.ok(!/lootKill \+=/.test(src), 'não pode haver soma de lootKill');
  assert.ok(/ouroDoAbate\(nivel, bonusLoot\)/.test(src));
});

await caso('captura: já vem ligada sem VIP; bola de ouro no corpo, shiny primeiro, 1 a cada 1,3 s; bloqueada com VIP', async () => {
  PIH.cofre.definirLigado?.(true);
  assert.equal(PIH.captura._interno.cfg().ligado, true, 'sem VIP, já vem ligada');
  msg({ t: 'estado', estado: { balls: { 1: 5, 9: 5 }, automation: { ballIds: [9, 1] }, loja: { vip: false } } });
  msg({ t: 'campo.init', slug: 'outland_x', mobs: [] });
  const antes = enviados.length;
  msg({ t: 'campo', mobs: [{ s: 50, x: 1, xr: 30000, n: 'Rattata', nv: 5, sh: 0 }, { s: 51, x: 1, xr: 30000, n: 'Pidgey', nv: 5, sh: 1 }] });
  await sleep(900);
  let bolas = enviados.slice(antes).filter((m) => m.t === 'ball.throw');
  assert.equal(bolas.length, 1, 'uma bola só, e não as duas juntas');
  assert.deepEqual(bolas[0], { t: 'ball.throw', ballId: 1, slot: 51 }, 'shiny primeiro, e a bola 9 (fora do catálogo de ouro) nunca');
  await sleep(1900);
  bolas = enviados.slice(antes).filter((m) => m.t === 'ball.throw');
  assert.equal(bolas.length, 2);
  assert.equal(bolas[1].slot, 50);
  // o gancho recusa corpo que não existe, bola que não é de ouro e corpo repetido
  assert.equal(PIH.pedir({ t: 'ball.throw', ballId: 1, slot: 999 }, 'captura').ok, false);
  msg({ t: 'campo', mobs: [{ s: 60, x: 1, xr: 30000, n: 'Zubat', nv: 5, sh: 0 }] });
  assert.equal(PIH.pedir({ t: 'ball.throw', ballId: 9, slot: 60 }, 'captura').ok, false, 'Beast Ball / bola sem preço em ouro');
  // VIP lançando: fica parada
  msg({ t: 'estado', estado: { loja: { vip: true }, automation: { ballIds: [1], autoBallSemParar: false } } });
  const meio = enviados.length;
  msg({ t: 'campo', mobs: [{ s: 61, x: 1, xr: 30000, n: 'Zubat', nv: 5, sh: 0 }] });
  await sleep(1800);
  assert.equal(enviados.slice(meio).filter((m) => m.t === 'ball.throw').length, 0);
  assert.match(PIH.captura.resumo().motivo, /VIP/);
  assert.match(PIH.captura.linha('automatico'), /cfg-toggle[^>]*disabled/, 'com VIP o interruptor fica travado');
  // guardar: com 5 bolas e guardar 5, não lança
  msg({ t: 'estado', estado: { loja: { vip: false }, automation: { ballIds: [1], autoBallSemParar: false } } });
  PIH.captura.definir('guardar', 5);
  msg({ t: 'campo', mobs: [{ s: 62, x: 1, xr: 30000, n: 'Zubat', nv: 5, sh: 0 }] });
  await sleep(1800);
  assert.equal(enviados.slice(meio).filter((m) => m.t === 'ball.throw').length, 0);
  PIH.captura.definir('ligado', false);
});

await caso('time: team.move só com pokémon seu, vaga livre, nível que o treinador usa; nunca tira quem luta', async () => {
  msg({ t: 'estado', estado: { level: 30, activeId: 1, pokemons: [{ id: 1, slot: 0, level: 30, nome: 'A' }, { id: 2, slot: 1, level: 20, nome: 'B' }, { id: 5, slot: null, level: 35, nome: 'C' }, { id: 6, slot: null, level: 36, nome: 'D' }, { id: 7, slot: null, level: 99, nome: 'E', starter: true }] } });
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 5, slot: 2 }, 'time').ok, true, 'nível 35 = treinador + 5');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 6, slot: 2 }, 'time').ok, false, 'nível 36 passa do limite');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 7, slot: 3 }, 'time').ok, true, 'o inicial não tem limite');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 5, slot: 1 }, 'time').ok, false, 'vaga ocupada');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 5, slot: 7 }, 'time').ok, false, 'vaga fora de 0 a 4');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 999, slot: 2 }, 'time').ok, false, 'pokémon que não é seu');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 1, slot: null }, 'time').ok, false, 'quem está lutando não sai');
  assert.equal(PIH.pedir({ t: 'team.move', pokemonId: 2, slot: null }, 'time').ok, true);
});

await caso('rotina: Auto Coleção no ponto — salva a regra do Mercado e só depois vende o Depot', async () => {
  const cfg = PIH.rotina._interno.cfg();
  cfg.passe.ligado = cfg.xpshare.ligado = cfg.outland.ligado = cfg.chocadeira.ligado = cfg.evoluir.ligado = false;
  cfg.pvp.time = cfg.pvp.fila = false;
  cfg.depot.modo = 'vender';
  cfg.autoColecao.ligado = true;
  PIH.rotina._interno.marcas().depot = 0;
  PIH.rotina._interno.marcas().autoColecao = 0;
  msg({ t: 'estado', estado: { pokemons: [{ id: 400, slot: null, level: 5, nome: 'Qualquer', speciesId: 1 }, { id: 500, slot: 0, level: 50, nome: 'Na equipe', speciesId: 1 }], automation: {} } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  const regra = enviados.find((m) => m.t === 'shop.autoColecao');
  assert.ok(regra, `esperava a regra, veio: ${enviados.map((m) => m.t)}`);
  assert.deepEqual({ l: regra.regra.lendario.on, s: regra.regra.shiny.on, p: [regra.regra.pot.on, regra.regra.pot.min], q: regra.regra.qual.on, n: [regra.regra.nota.on, regra.regra.nota.min] }, { l: true, s: true, p: [true, 5], q: false, n: [true, 3.5] });
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 0, 'não vende antes de a regra estar salva');
  // o jogo confirma a regra: agora vende
  msg({ t: 'estado', estado: { automation: { autoColecao: regra.regra } } });
  enviados.length = 0;
  await PIH.rotina._interno.tique(); await sleep(1300);
  assert.equal(enviados.filter((m) => m.t === 'shop.autoColecao').length, 0, 'regra igual: não manda de novo');
  assert.equal(enviados.filter((m) => m.t === 'shop.sellAllPokemons').length, 1);
  // o gancho só deixa passar a forma do jogo
  assert.equal(PIH.pedir({ t: 'shop.autoColecao', regra: { ...regra.regra, pot: { on: true, min: 7 } } }, 'rotina').ok, false);
  assert.equal(PIH.pedir({ t: 'shop.autoColecao', regra: { ...regra.regra, nota: { on: true, min: 'x' } } }, 'rotina').ok, false);
  cfg.depot.modo = 'off'; cfg.autoColecao.ligado = false;
});

await caso('reposição 1.25.1: pouco ouro não vai todo em bola — revive e poção chegam ao mínimo e o resto é repartido', async () => {
  const A = PIH.auto._interno;
  const c = A.cfg();
  c.repor.ligado = true;
  msg({ t: 'estado', estado: { automation: { ballIds: [1], potionIds: [201], reviveIds: [205] }, balls: { 1: 0 }, items: { 300: 3 } } });
  const ouro = Number(estados.at(-1).gold);
  c.repor.reservaOuro = ouro - 30_000; // 30 mil livres
  const lista = A.comprasPendentes();
  const q = Object.fromEntries(lista.map((x) => [x.chave, x.qty]));
  assert.ok(q.i205 >= 20, `revive ${q.i205}`);
  assert.ok(q.i201 >= 200, `poção ${q.i201}`);
  assert.ok(q.b1 >= 1000 && q.b1 < 3000, `bola ${q.b1}`);
  const gasto = lista.reduce((s, x) => s + x.qty * x.preco, 0);
  assert.ok(gasto <= 30_000 && gasto > 25_000, `gasto ${gasto}`);
  // ouro de sobra: cada um até o alvo
  c.repor.reservaOuro = 0;
  const cheio = Object.fromEntries(A.comprasPendentes().map((x) => [x.chave, x.qty]));
  assert.deepEqual(cheio, { i205: 100, i201: 1000, b1: 9999 });
  c.repor.ligado = false; c.repor.reservaOuro = 5_000_000;
});

await caso('Centro 1.25.1: parado no Centro, o Piloto cura, espera o time levantar e volta para a última hunt', async () => {
  const A = PIH.auto._interno;
  const c = A.cfg();
  c.hunt.ligado = true;
  await sleep(3500);
  msg({ t: 'estado', estado: { huntSlug: 'outland_x', noCentro: false, centroLivreEm: 0 } });
  assert.equal(A.centro().ultimaHunt, 'outland_x');
  msg({ t: 'estado', estado: { noCentro: true, pokemons: [{ id: 1, slot: 0, level: 300, nome: 'Charizard', speciesId: 6, hp: 0 }] } });
  enviados.length = 0;
  A.forcarCentro({ centroDesde: Date.now() - 100_000, mexeuEm: 0 });
  A.vigiaCentro(Date.now());
  assert.ok(A.rotina(), 'a vigia começou a rotina');
  await sleep(1200);
  assert.ok(enviados.some((m) => m.t === 'centro.curar'), `esperava a cura, veio: ${enviados.map((m) => m.t)}`);
  await sleep(4500);
  assert.equal(enviados.filter((m) => m.t === 'hunt.select').length, 0, 'não sai com o time desmaiado');
  assert.ok(enviados.filter((m) => m.t === 'centro.curar').length >= 2, 'cura de novo');
  msg({ t: 'estado', estado: { pokemons: [{ id: 1, slot: 0, level: 300, nome: 'Charizard', speciesId: 6, hp: 500 }] } });
  await sleep(3000);
  const sel = enviados.find((m) => m.t === 'hunt.select');
  assert.ok(sel && sel.slug === 'outland_x', `esperava voltar para outland_x, veio: ${JSON.stringify(sel)}`);
  msg({ t: 'estado', estado: { noCentro: false, huntSlug: 'outland_x' } });
  A.passo();
  assert.equal(A.rotina(), null);
  c.hunt.ligado = false;
});

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO PASSOU');
process.exit(falhas ? 1 : 0);
