// A aba Mercado do painel: os itens vigiados com anúncio em ouro, com a revenda estimada e o
// desconto, montados com o que o radar já recebe a cada ciclo (nenhum pedido a mais).
// Funções puras.
(function (raiz, fabrica) {
  const m = fabrica(typeof module === 'object' && module.exports ? require('./precos.js') : raiz.RadarPrecos);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarVitrine = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';

  const CONFERIDO_VALE_MS = 10 * 60 * 1000;

  // amostras: as do ciclo (historico.amostraDoResumo); historico: itemId -> resumo de antes;
  // O que identifica o estado do livro de um item no resumo: menor preço e número de anúncios.
  // Mudou, a conferência anterior (anúncio barato, próximo da fila) não vale mais.
  function assinatura(amostra) {
    return `${amostra.minGold}:${amostra.anuncios}`;
  }

  // conferidos: itemId -> { em, assinatura, proximo, candidato, motivos } da última
  // conferência (market.item).
  function linhasDoMercado({ amostras, historico, conferidos, catalogo, config, agora }) {
    const linhas = [];
    for (const a of amostras || []) {
      const item = catalogo && catalogo.get ? catalogo.get(a.itemId) : null;
      const hist = (historico && historico[a.itemId]) || null;
      const conf = conferidos && conferidos.get ? conferidos.get(a.itemId) : null;
      // A conferência só vale com o resumo igual ao da hora em que foi feita: anúncio comprado
      // ou retirado muda o resumo, e a linha volta a mostrar o preço de agora.
      const conferido = Boolean(conf && typeof conf.proximo === 'number' && agora - conf.em <= CONFERIDO_VALE_MS && conf.assinatura === assinatura(a));
      const ref = P.referencia({ proximo: conferido ? conf.proximo : null, mediana24h: hist && hist.mediana24h, media7d: a.mediaGold });
      // O resumo do jogo conta os anúncios do próprio jogador. Item conferido mostra o menor
      // anúncio de outro jogador.
      const menor = conferido && typeof conf.candidato === 'number' ? conf.candidato : a.minGold;
      const desconto = ref ? 1 - menor / ref.valor : null;
      const iliquido = !(typeof a.volume7d === 'number' && a.volume7d >= config.volumeMinimo);
      linhas.push({
        itemId: a.itemId,
        nome: item ? item.nome : `item ${a.itemId}`,
        categoria: item ? item.categoria : null,
        minGold: menor,
        anuncios: a.anuncios,
        unidades: a.unidades,
        volume7d: a.volume7d,
        revenda: ref ? ref.valor : null,
        fonteRevenda: ref ? ref.fontes[0] : null,
        conferido,
        // Só de item conferido: o que a avaliação completa disse para não avisar, por que a
        // compra automática (se ligada) não comprou, e a quantidade e o lucro do anúncio.
        motivos: conferido && Array.isArray(conf.motivos) ? conf.motivos : null,
        motivoAuto: conferido && conf.motivoAuto ? conf.motivoAuto : null,
        qtdAnuncio: conferido && typeof conf.qtdAnuncio === 'number' ? conf.qtdAnuncio : null,
        lucroTotal: conferido && typeof conf.lucroTotal === 'number' ? conf.lucroTotal : null,
        desconto,
        iliquido,
        destaque: desconto !== null && desconto >= config.descontoMinimo && !iliquido,
      });
    }
    // Maior desconto primeiro; sem referência vai para o fim; empate pelo volume.
    return linhas.sort((x, y) => (y.desconto ?? -Infinity) - (x.desconto ?? -Infinity) || (y.volume7d ?? 0) - (x.volume7d ?? 0));
  }

  return { CONFERIDO_VALE_MS, assinatura, linhasDoMercado };
});
