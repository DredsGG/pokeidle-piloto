// As abas Compras e Vendas: o histórico do próprio jogador (market.historico e
// market.historicoCompras, formato confirmado ao vivo em 2026-10-15), os anúncios abertos
// (market.meus, lido de forma tolerante até o formato ser confirmado) e as vendas que chegam
// ao vivo (batalha marketVendido). Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarPessoal = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const JANELA_MESMA_VENDA_MS = 2 * 60 * 1000;
  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // "3× Fire Stone" (o jogo usa o sinal de multiplicação; aceita x também).
  function lerDescricao(descricao) {
    const m = typeof descricao === 'string' && /^\s*(\d[\d.]*)\s*[x×]\s*(.+?)\s*$/iu.exec(descricao);
    if (!m) return null;
    return { qtd: Number(m[1].replace(/\./g, '')), nome: m[2] };
  }

  // tipo: 'venda' (market.historico) ou 'compra' (market.historicoCompras).
  // Na venda, bruto é o total e valor o que entrou depois da taxa. Na compra, bruto é o que
  // foi pago.
  function normalizarHistorico(linhas, tipo) {
    return (linhas || []).filter(Boolean).map((l) => {
      const d = lerDescricao(l.descricao);
      const qtd = d ? d.qtd : 1;
      const bruto = numero(l.bruto);
      return {
        id: l.id ?? null,
        em: numero(l.em),
        nome: d ? d.nome : (l.ficha && l.ficha.nome) || l.descricao || '',
        qtd,
        bruto,
        liquido: tipo === 'venda' ? numero(l.valor) : null,
        unitario: bruto !== null && qtd > 0 ? bruto / qtd : null,
        moeda: l.moeda || 'gold',
        contraparte: (tipo === 'venda' ? l.comprador : l.vendedor) || null,
        tipoItem: l.tipo || null,
      };
    }).sort((a, b) => (b.em ?? 0) - (a.em ?? 0));
  }

  function nomeDoAnuncio(l) {
    return (l.ficha && (l.ficha.nome || l.ficha.apelido)) || l.nome || l.descricao || (l.itemId ? `item ${l.itemId}` : 'anúncio');
  }

  // Anúncios abertos. agoraServidor diz se ainda está na retenção.
  function normalizarMeus(linhas, agoraServidor) {
    return (linhas || []).filter(Boolean).map((l) => {
      const compravelEm = numero(l.compravelEm);
      return {
        id: l.id ?? null,
        nome: nomeDoAnuncio(l),
        tipoItem: l.tipo || null,
        itemId: numero(l.itemId),
        qtd: numero(l.qtd),
        preco: numero(l.preco),
        moeda: l.moeda || 'gold',
        compravelEm,
        expiraEm: numero(l.expiraEm),
        // v1.305: item muda de preço no máximo a cada 30 min; o servidor manda até quando espera.
        editavelEm: numero(l.editavelEm),
        retido: compravelEm !== null && agoraServidor !== null && agoraServidor !== undefined && compravelEm > agoraServidor,
        estado: l.estado || null,
      };
    }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }

  // Vendas do histórico + as que chegaram ao vivo, sem contar a mesma duas vezes: o evento ao
  // vivo some quando o histórico já tem a mesma venda (nome e quantidade) perto do mesmo
  // horário.
  function juntarVendas(historico, eventos) {
    const lista = [...(historico || [])];
    for (const ev of eventos || []) {
      const d = lerDescricao(ev.descricao);
      const nome = d ? d.nome : ev.descricao || '';
      const qtd = d ? d.qtd : 1;
      const repetida = lista.some((h) => h.nome === nome && h.qtd === qtd && h.em !== null && Math.abs(h.em - ev.em) <= JANELA_MESMA_VENDA_MS);
      if (repetida) continue;
      lista.push({ id: null, em: ev.em, nome, qtd, bruto: null, liquido: numero(ev.valor), unitario: null, moeda: ev.moeda || 'gold', contraparte: null, aoVivo: true });
    }
    return lista.sort((a, b) => (b.em ?? 0) - (a.em ?? 0));
  }

  // O anúncio de um aviso saiu do mercado: foi você que comprou pelo próprio jogo? Procura,
  // entre as compras que chegaram ao vivo sem ser do radar ("N× nome"), uma do mesmo item,
  // depois do aviso e que caiba no anúncio. Devolve a compra ou null.
  function compraNoJogo({ alerta, compras }) {
    if (!alerta || !alerta.nome) return null;
    const desde = (numero(alerta.em) ?? 0) - 5000;
    const maximo = numero(alerta.qtdAnuncio) ?? Infinity;
    return (compras || []).find((ev) => {
      const d = lerDescricao(ev && ev.descricao);
      return d && d.nome === alerta.nome && d.qtd <= maximo && numero(ev.em) !== null && ev.em >= desde;
    }) || null;
  }

  // Depois de uma compra sem resposta: ela está na primeira página do histórico de compras?
  // compra: { nome, qtd, preco, enviadoEm }; linhas: as de market.historicoCompras ("N× nome",
  // bruto = total pago, que pode ser menor se o preço caiu). Devolve a linha ou null.
  function compraNoHistorico({ compra, linhas }) {
    if (!compra || !compra.nome) return null;
    // O em do histórico é do servidor (o relógio do PC anda uns segundos à frente).
    const desde = (numero(compra.enviadoEm) ?? 0) - 120000;
    const teto = numero(compra.preco) !== null && numero(compra.qtd) !== null ? compra.preco * compra.qtd : Infinity;
    return (linhas || []).find((l) => {
      if (!l || numero(l.em) === null || l.em < desde) return false;
      if (numero(l.bruto) !== null && l.bruto > teto) return false;
      // Pokémon: a linha não traz "N× nome", e o pokemonId diz qual é.
      if (numero(compra.pokemonId) !== null) return numero(l.pokemonId) === compra.pokemonId;
      const d = lerDescricao(l.descricao);
      return Boolean(d && d.nome === compra.nome && d.qtd >= 1 && d.qtd <= (numero(compra.qtd) ?? Infinity));
    }) || null;
  }

  function totais(vendas) {
    const ouro = vendas.filter((v) => v.moeda === 'gold');
    return {
      vendas: ouro.length,
      unidades: ouro.reduce((s, v) => s + (v.qtd || 0), 0),
      liquido: ouro.reduce((s, v) => s + (v.liquido || 0), 0),
    };
  }

  return { JANELA_MESMA_VENDA_MS, lerDescricao, normalizarHistorico, normalizarMeus, juntarVendas, compraNoJogo, compraNoHistorico, totais };
});
