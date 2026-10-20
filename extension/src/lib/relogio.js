// Relógio do servidor. compravelEm vem no relógio do servidor, e o do Allan está 1 s adiantado
// (Fase 0). O desvio é o menor (hora local da chegada − servidorAgora): a amostra com menos
// atraso de rede. Usar esse desvio para converter servidor em local faz o envio sair um pouco
// depois, nunca antes. Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarRelogio = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_AMOSTRAS = 20;

  // amostras: [{ local, servidor }] em ms. null sem amostra válida.
  function estimarDesvio(amostras, max = MAX_AMOSTRAS) {
    const validas = (amostras || []).filter((a) => a && Number.isFinite(a.local) && Number.isFinite(a.servidor)).slice(-max);
    if (!validas.length) return null;
    return Math.min(...validas.map((a) => a.local - a.servidor));
  }

  function agoraNoServidor(local, desvio) {
    return local - desvio;
  }

  function horaLocalDeEnvio(compravelEm, desvio, margemMs) {
    return compravelEm + desvio + margemMs;
  }

  return { MAX_AMOSTRAS, estimarDesvio, agoraNoServidor, horaLocalDeEnvio };
});
