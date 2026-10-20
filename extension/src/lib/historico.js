// Histórico próprio de preços: uma amostra por item a cada 5 min (o menor preço visto no
// balde), resumida em medianas de 24 h e 7 dias. Funções puras; o service worker guarda em
// IndexedDB.
(function (raiz, fabrica) {
  const m = fabrica(typeof module === 'object' && module.exports ? require('./estatistica.js') : raiz.RadarEstatistica);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarHistorico = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  const BALDE_MS = 5 * 60 * 1000;
  const DIA_MS = 24 * 3600 * 1000;
  const GUARDAR_DIAS = 8;

  const numero = (v) => typeof v === 'number' && Number.isFinite(v);

  function balde(t) {
    return Math.floor(t / BALDE_MS) * BALDE_MS;
  }

  // Uma amostra a partir da resposta aba=itens. null se o item não tem anúncio em ouro.
  function amostraDoResumo(itemId, resumo, medias, agora) {
    const r = resumo && resumo[itemId];
    if (!r || !numero(r.minGold)) return null;
    const m = medias && medias[itemId] && medias[itemId].gold;
    return {
      itemId: Number(itemId),
      balde: balde(agora),
      minGold: r.minGold,
      anuncios: numero(r.anuncios) ? r.anuncios : null,
      unidades: numero(r.unidades) ? r.unidades : null,
      mediaGold: m && numero(m.media) ? m.media : null,
      volume7d: m && numero(m.unidades) ? m.unidades : null,
    };
  }

  // Duas leituras no mesmo balde: fica o menor preço e os números mais recentes.
  function mesclarAmostra(existente, nova) {
    if (!existente) return nova;
    return { ...nova, minGold: Math.min(existente.minGold, nova.minGold) };
  }

  // amostras de um item (qualquer ordem). horasDeHistorico conta só os últimos 7 dias.
  function resumir(amostras, agora) {
    const validas = (amostras || []).filter((a) => a && numero(a.balde) && numero(a.minGold) && agora - a.balde <= 7 * DIA_MS && a.balde <= agora);
    const dia = validas.filter((a) => agora - a.balde <= DIA_MS);
    const maisAntiga = validas.length ? Math.min(...validas.map((a) => a.balde)) : null;
    return {
      mediana24h: E.mediana(dia.map((a) => a.minGold)),
      mediana7d: E.mediana(validas.map((a) => a.minGold)),
      amostras24h: dia.length,
      amostras7d: validas.length,
      horasDeHistorico: maisAntiga === null ? 0 : (agora - maisAntiga) / 3600000,
    };
  }

  function velha(amostra, agora, dias = GUARDAR_DIAS) {
    return !amostra || agora - amostra.balde > dias * DIA_MS;
  }

  return { BALDE_MS, DIA_MS, GUARDAR_DIAS, balde, amostraDoResumo, mesclarAmostra, resumir, velha };
});
