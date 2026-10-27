const assert = require('assert');
const Pk = require(process.argv[2]);
const cfg = { compraAutomaticaPokemon: true, gastoMaximoPokemon: 20_000_000, gastoMaximoDia: 0, calibrada: true };
const av = (n, min, p25) => ({ aviso: true, ref: { n, min, valor: p25, p25 } });
const caso = (nome, f) => { f(); console.log('ok', nome); };
// Vespiquen: 6 parecidas de 5 mi a 180 mi, p25 10 mi, à venda por 3 mi
caso('Vespiquen 3 mi com a mais barata a 5 mi: compra', () => {
  const d = Pk.decidirAuto({ avaliacao: av(6, 5e6, 10e6), anuncio: { preco: 3e6 }, config: cfg, saldo: 146.6e6 });
  assert.deepEqual(d, { comprar: true, motivo: null });
});
caso('5 parecidas, preço que só empata na mais barata (4,2 mi com mínimo 5 mi): não compra', () => {
  // 5 mi × 0,85 − 0,1 mi = 4,15 mi < 4,2 mi
  const d = Pk.decidirAuto({ avaliacao: av(5, 5e6, 10e6), anuncio: { preco: 4.2e6 }, config: cfg, saldo: 1e9 });
  assert.equal(d.comprar, false); assert.match(d.motivo, /mais barata/);
});
caso('4 parecidas: nunca', () => {
  const d = Pk.decidirAuto({ avaliacao: av(4, 50e6, 60e6), anuncio: { preco: 1e6 }, config: cfg, saldo: 1e9 });
  assert.equal(d.comprar, false);
});
caso('8+ parecidas: segue só aviso + cofre', () => {
  const d = Pk.decidirAuto({ avaliacao: av(9, 1e6, 10e6), anuncio: { preco: 3e6 }, config: cfg, saldo: 1e9 });
  assert.equal(d.comprar, true);
});
caso('o cofre ainda manda: acima do ouro livre não compra', () => {
  const d = Pk.decidirAuto({ avaliacao: av(6, 5e6, 10e6), anuncio: { preco: 3e6 }, config: { ...cfg, gastoMaximoPokemon: 2e6 }, saldo: 1e9 });
  assert.equal(d.comprar, false); assert.match(d.motivo, /ouro livre/);
});
caso('saldo não paga', () => {
  const d = Pk.decidirAuto({ avaliacao: av(6, 5e6, 10e6), anuncio: { preco: 3e6 }, config: cfg, saldo: 2e6 });
  assert.equal(d.motivo, 'saldo não paga');
});
caso('Charizard Nv 197 a 100 mil (mais barata 30 mi): continua comprando', () => {
  assert.equal(Pk.decidirAuto({ avaliacao: av(6, 30e6, 40e6), anuncio: { preco: 1e5 }, config: cfg, saldo: 1e9 }).comprar, true);
});
console.log('TUDO PASSOU');
