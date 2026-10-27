// 1.33.9 (pedido do André): o que ele compra À MÃO nunca é revendido sozinho; as pedras que o time
// vai gastar também não. O que veio sozinho (drop, compra automática do radar) segue na revenda.
const path = require('path');
const LIB = process.argv[2] || path.resolve(__dirname, '../extension/src/lib');
const Rv = require(path.join(LIB, 'revenda.js'));
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const t = 1_790_000_000_000;
const historico = [
  { id: 1, descricao: '1× Rock Stone', bruto: 900000, em: t, moeda: 'gold' },          // à mão
  { id: 2, descricao: '10× Fire Stone', bruto: 50000, em: t + 1000, moeda: 'gold' },   // automática do radar
  { id: 3, descricao: '5× Leaf Stone', bruto: 25000, em: t + 2000, moeda: 'gold' },    // clique no radar (à mão)
  { id: 4, descricao: 'Larvitar', pokemonId: 555, bruto: 3000000, em: t + 3000, moeda: 'gold' }, // pokémon à mão
  { id: 5, descricao: 'Pupitar', pokemonId: 777, bruto: 2000000, em: t + 4000, moeda: 'gold' },  // pokémon do radar
  { id: 6, descricao: '2× Rock Stone', bruto: 900, em: t + 5000, moeda: 'gema' },      // à mão, em Gema
];
const registro = [
  { nome: 'Fire Stone', qtd: 10, preco: 5000, resultado: 'ganhou', automatica: true, em: t + 900 },
  { nome: 'Leaf Stone', qtd: 5, preco: 5000, resultado: 'ganhou', automatica: false, em: t + 1900 },
  { nome: 'Pupitar', categoria: 'pokemon', pokemonId: 777, qtd: 1, preco: 2000000, resultado: 'ganhou', automatica: true, em: t + 3900 },
];
const inv = { 'Rock Stone': 3, 'Fire Stone': 10, 'Leaf Stone': 5 };
let r = Rv.atualizarManuais(null, { registro, historico, inventarioPorNome: inv });
ok(r.livro.itens['Rock Stone'] === 3, `Rock Stone à mão (1 em ouro + 2 em Gema) protegida: ${r.livro.itens['Rock Stone']}`);
ok(!r.livro.itens['Fire Stone'], 'Fire Stone da compra automática do radar: revendável');
ok(r.livro.itens['Leaf Stone'] === 5, 'Leaf Stone comprada com clique: é sua, protegida');
ok(r.livro.pokemons.includes(555) && !r.livro.pokemons.includes(777), 'pokémon comprado à mão protegido; o do radar não');
// a mesma linha não conta duas vezes
const r2 = Rv.atualizarManuais(r.livro, { registro, historico, inventarioPorNome: inv });
ok(r2.livro.itens['Rock Stone'] === 3 && !r2.mudou, 'reler o histórico não soma de novo');
// usou 2 Rock Stones na mão: a proteção baixa junto
const r3 = Rv.atualizarManuais(r2.livro, { registro, historico, inventarioPorNome: { ...inv, 'Rock Stone': 1 } });
ok(r3.livro.itens['Rock Stone'] === 1, 'gastou na mão: a proteção nunca passa do que tem');
// o inventário da revenda automática
const catalogo = new Map([[10, { nome: 'Rock Stone' }], [11, { nome: 'Fire Stone' }], [12, { nome: 'Leaf Stone' }], [13, { nome: 'Water Stone' }]]);
const rev = Rv.inventarioRevendavel({ 10: 4, 11: 10, 12: 5, 13: 7 }, catalogo, { manuais: r.livro, pedrasDoTime: { 11: 1, 13: 0 } });
ok(rev[10] === 1 && rev[11] === 9 && rev[12] === 0 && rev[13] === 7, `revendável: Rock 4-3=1, Fire 10-1 do time=9, Leaf 0, Water (drop) 7 → ${JSON.stringify(rev)}`);
// custo: a compra com clique não conta como "do radar"
const compras = Rv.juntarCompras(registro, historico);
ok(compras.filter((c) => c.nome === 'Leaf Stone' && c.doRadar).length === 0, 'juntarCompras: clique não é doRadar');
console.log(falhas ? `FALHARAM ${falhas}` : 'TUDO PASSOU');
process.exit(falhas ? 1 : 0);
