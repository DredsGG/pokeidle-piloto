// Barramento de eventos do mundo isolado: a ponte publica o que o hook escutou e o radar e o
// painel assinam, sem depender um do outro.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarBarramento = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function criarBarramento(prefixo = '[radar-mercado]', registrarErro = (...a) => console.error(...a)) {
    const ouvintes = new Map();
    function on(tipo, fn) {
      if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set());
      ouvintes.get(tipo).add(fn);
      return () => ouvintes.get(tipo).delete(fn);
    }
    function emit(tipo, dado) {
      for (const fn of [...(ouvintes.get(tipo) || [])]) {
        try { fn(dado); } catch (e) { registrarErro(prefixo, e); }
      }
    }
    return { on, emit };
  }

  return { criarBarramento };
});
