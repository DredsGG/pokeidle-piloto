// Decisão de oportunidade. Funções puras, testadas com as fixtures da Fase 0.
//
// Quem compra no mercado pega o mais barato, então revender exige ficar abaixo do próximo
// anúncio da fila. A referência de revenda é o menor entre esse próximo anúncio, a mediana de
// 24 h dos menores preços que o radar viu e a média de 7 dias do servidor (decisão 3 da
// Fase 0). Vender a R rende R × 0,85 (taxa de 15%); o radar só avisa com desconto mínimo sobre
// R (25% por padrão), lucro total mínimo e item líquido.
(function (raiz, fabrica) {
  const m = fabrica(typeof module === 'object' && module.exports ? require('./config.js') : raiz.RadarConfig);
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarPrecos = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';

  const TAXA = Config.TAXA_VENDA;
  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  // Só anúncio aberto conta (nas gravações todos vinham "aberto"; outro estado, se aparecer,
  // não é comprável).
  function ordenar(linhas) {
    return [...(linhas || [])]
      .filter((l) => l && positivo(l.preco) && (l.estado === undefined || l.estado === null || l.estado === 'aberto'))
      .sort((a, b) => a.preco - b.preco || (a.criadoEm ?? 0) - (b.criadoEm ?? 0));
  }

  // O anúncio de um aviso ainda está no mercado? Com os anúncios do item (market.item), a
  // resposta é exata. Só com o resumo: se o menor preço do item subiu acima do preço do aviso
  // (ou o item ficou sem anúncio em ouro), o anúncio saiu (comprado ou retirado).
  function anuncioSaiu({ alerta, minGold, linhas }) {
    if (Array.isArray(linhas)) return !linhas.some((l) => l && l.id === alerta.anuncioId && (l.estado === undefined || l.estado === null || l.estado === 'aberto'));
    if (minGold === null || minGold === undefined) return true;
    return minGold > alerta.preco;
  }

  function ehMeu(linha, meuId) {
    return meuId !== null && meuId !== undefined && linha.vendedorId === meuId;
  }

  // O anúncio mais barato que não é meu (retido ou não: o retido entra no sorteio quando liberar).
  function escolherCandidato(linhas, meuId) {
    return ordenar(linhas).find((l) => !ehMeu(l, meuId)) || null;
  }

  // O próximo da fila depois do candidato: é com ele que a revenda vai concorrer. Conta os
  // retidos (vão liberar logo) e ignora os meus.
  function proximoNaFila(linhas, candidatoId, meuId) {
    return ordenar(linhas).find((l) => l.id !== candidatoId && !ehMeu(l, meuId)) || null;
  }

  function referencia({ proximo, mediana24h, media7d }) {
    const partes = { proximo: positivo(proximo) ? proximo : null, mediana24h: positivo(mediana24h) ? mediana24h : null, media7d: positivo(media7d) ? media7d : null };
    const valores = Object.values(partes).filter((v) => v !== null);
    if (!valores.length) return null;
    const valor = Math.min(...valores);
    const fontes = Object.keys(partes).filter((k) => partes[k] === valor);
    return { valor, fontes, partes };
  }

  function quantidadeCompravel({ qtdAnuncio, preco, saldo, gastoMaximo }) {
    if (!positivo(preco) || !positivo(qtdAnuncio)) return 0;
    let q = Math.floor(qtdAnuncio);
    if (typeof saldo === 'number' && Number.isFinite(saldo)) q = Math.min(q, Math.floor(saldo / preco));
    if (positivo(gastoMaximo)) q = Math.min(q, Math.floor(gastoMaximo / preco));
    return Math.max(0, q);
  }

  function lucro({ referencia: ref, preco, qtd }) {
    const porUnidade = ref * (1 - TAXA) - preco;
    return {
      porUnidade,
      total: porUnidade * qtd,
      desconto: 1 - preco / ref,
      retorno: porUnidade / preco, // lucro líquido sobre o que se paga
    };
  }

  // Filtro barato antes de gastar um market.item: o menor preço do resumo já está abaixo da
  // referência que dá para saber sem abrir o item?
  function preFiltro({ minGold, media7d, mediana24h, volume7d, config }) {
    if (!positivo(minGold)) return { passa: false, descontoEstimado: null };
    const ref = Math.min(...[media7d, mediana24h].filter(positivo));
    if (!Number.isFinite(ref)) return { passa: false, descontoEstimado: null };
    const liquido = positivo(volume7d) && volume7d >= config.volumeMinimo;
    const descontoEstimado = 1 - minGold / ref;
    return { passa: descontoEstimado >= config.descontoMinimo && (liquido || config.alertarIliquidos), descontoEstimado };
  }

  // Avaliação completa com os anúncios do item (resposta aba=item).
  function avaliar({ linhas, meuId, mediana24h, media7d, volume7d, saldo, config }) {
    const motivos = [];
    const candidato = escolherCandidato(linhas, meuId);
    if (!candidato) return { alerta: false, motivos: ['sem anúncio de outro jogador'] };
    const proximo = proximoNaFila(linhas, candidato.id, meuId);
    const ref = referencia({ proximo: proximo ? proximo.preco : null, mediana24h, media7d });
    if (!ref) return { alerta: false, candidato, proximo, motivos: ['sem referência'] };
    const qtd = quantidadeCompravel({ qtdAnuncio: candidato.qtd, preco: candidato.preco, saldo, gastoMaximo: config.gastoMaximoPorCompra });
    const l = lucro({ referencia: ref.valor, preco: candidato.preco, qtd });
    const iliquido = !(positivo(volume7d) && volume7d >= config.volumeMinimo);
    // Sem próximo na fila a revenda sai só do histórico e da média de 7 dias: pouco confiável.
    // As horas de histórico não seguram aviso; a mediana de 24 h entra quando existir.
    const poucoConfiavel = !proximo;

    if (l.desconto < config.descontoMinimo) motivos.push('desconto abaixo do mínimo');
    if (qtd < 1) motivos.push(typeof saldo === 'number' ? 'saldo não paga uma unidade' : 'quantidade zero');
    if (l.total < config.lucroMinimo) motivos.push('lucro abaixo do mínimo');
    if (iliquido && !config.alertarIliquidos) motivos.push('item ilíquido');
    if (poucoConfiavel && !config.alertarPoucoConfiaveis) motivos.push('referência pouco confiável');

    return {
      alerta: motivos.length === 0,
      motivos,
      candidato,
      proximo,
      referencia: ref,
      qtd,
      lucroPorUnidade: l.porUnidade,
      lucroTotal: l.total,
      desconto: l.desconto,
      retorno: l.retorno,
      iliquido,
      poucoConfiavel,
      volume7d: positivo(volume7d) ? volume7d : null,
    };
  }

  return { TAXA, ordenar, ehMeu, escolherCandidato, proximoNaFila, referencia, quantidadeCompravel, lucro, preFiltro, avaliar, anuncioSaiu };
});
