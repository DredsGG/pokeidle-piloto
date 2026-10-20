// Estatística básica usada pela análise da Fase 0 e, depois, pelo preço de referência.
// Funções puras; valores não numéricos ou não finitos são ignorados.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarEstatistica = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const numero = (v) => typeof v === 'number' && Number.isFinite(v);

  function ordenados(valores) {
    return valores.filter(numero).sort((a, b) => a - b);
  }

  // Quantil com interpolação linear (q entre 0 e 1). null se não houver valores.
  function quantil(valores, q) {
    const v = ordenados(valores);
    if (!v.length) return null;
    const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
    const base = Math.floor(pos);
    const resto = pos - base;
    return base + 1 < v.length ? v[base] + resto * (v[base + 1] - v[base]) : v[base];
  }

  function mediana(valores) {
    return quantil(valores, 0.5);
  }

  // [{ valor, peso }]: média ponderada. Pesos não positivos ficam de fora.
  function mediaPonderada(itens) {
    let soma = 0;
    let pesos = 0;
    for (const it of itens) {
      if (!it || !numero(it.valor) || !numero(it.peso) || it.peso <= 0) continue;
      soma += it.valor * it.peso;
      pesos += it.peso;
    }
    return pesos > 0 ? soma / pesos : null;
  }

  // Mediana ponderada: o valor onde o peso acumulado passa da metade.
  function medianaPonderada(itens) {
    const v = itens.filter((it) => it && numero(it.valor) && numero(it.peso) && it.peso > 0).sort((a, b) => a.valor - b.valor);
    if (!v.length) return null;
    const total = v.reduce((s, it) => s + it.peso, 0);
    let acumulado = 0;
    for (const it of v) {
      acumulado += it.peso;
      if (acumulado >= total / 2) return it.valor;
    }
    return v[v.length - 1].valor;
  }

  // Diferença relativa de a para b (0,1 = 10%). null se b for zero ou faltar.
  function diferenca(a, b) {
    if (!numero(a) || !numero(b) || b === 0) return null;
    return (a - b) / b;
  }

  return { quantil, mediana, mediaPonderada, medianaPonderada, diferenca };
});
