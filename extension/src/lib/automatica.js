// Compra automática (Fase 2): decide se um anúncio conferido é comprado sem clique, conta o gasto
// do dia e as falhas seguidas. Desligada por padrão; com limites próprios, mais exigentes que os
// do aviso. A hora do envio e a fila continuam as da compra com clique (compra.js). Funções puras.
(function (raiz, fabrica) {
  const node = typeof module === 'object' && module.exports;
  const m = fabrica(node ? require('./precos.js') : raiz.RadarPrecos, node ? require('./config.js') : raiz.RadarConfig);
  if (node) module.exports = m;
  else raiz.RadarAutomatica = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, Config) {
  'use strict';

  const FALHAS_PARA_DESLIGAR = 3;
  // O servidor não respondeu ou recusou com erro: o caminho da compra falhou. Perder o sorteio,
  // o anúncio sair ou o preço mudar são o mercado funcionando, e zeram a conta.
  const FALHAS = new Set(['sem-resposta', 'erro']);
  const SEM_EFEITO = new Set(['cancelada', 'nao-enviada', 'pendente']);

  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const finito = (v) => typeof v === 'number' && Number.isFinite(v);

  // Dia no relógio do PC (a virada é à meia-noite local), como AAAA-MM-DD.
  // O dia do Radar vira junto com o do Cofre e o do jogo: 00:00 de Brasília (UTC−3), qualquer
  // que seja o fuso do computador.
  function diaLocal(ms) {
    return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  }

  // gasto: { dia, total } guardado no storage. De outro dia vale zero.
  function gastoDeHoje(gasto, agora) {
    return gasto && gasto.dia === diaLocal(agora) && positivo(gasto.total) ? gasto.total : 0;
  }

  function somarGasto(gasto, valor, agora) {
    return { dia: diaLocal(agora), total: gastoDeHoje(gasto, agora) + (positivo(valor) ? valor : 0) };
  }

  function contarFalhas(falhas, resultado) {
    if (FALHAS.has(resultado)) return (falhas || 0) + 1;
    if (SEM_EFEITO.has(resultado) || !resultado) return falhas || 0;
    return 0;
  }

  const deveDesligar = (falhas) => falhas >= FALHAS_PARA_DESLIGAR;

  // avaliacao: o P.avaliar do anúncio conferido agora. gastoHoje: o que o automático já gastou
  // hoje mais o que está reservado na fila; saldo: o saldo menos o reservado.
  // Devolve { comprar, qtd, gasto, lucro, motivo }.
  function decidir({ avaliacao: av, config, gastoHoje = 0, saldo }) {
    const nao = (motivo) => ({ comprar: false, qtd: 0, gasto: 0, lucro: 0, motivo });
    if (!config || !config.compraAutomatica) return nao('compra automática desligada');
    if (!av || !av.candidato || !av.referencia) return nao('sem anúncio conferido');
    // Revenda só pelo histórico e pela média de 7 dias: o automático não arrisca.
    if (av.poucoConfiavel || !av.proximo) return nao('sem próximo na fila');
    if (av.iliquido) return nao('item ilíquido');
    if (!finito(saldo)) return nao('saldo desconhecido');
    const exigido = Config.descontoAutoPara(av, config);
    if (!(av.desconto >= exigido)) return nao('desconto abaixo do mínimo do automático');
    const preco = av.candidato.preco;
    if (!positivo(preco)) return nao('sem preço');
    const restanteDia = positivo(config.gastoMaximoDia) ? config.gastoMaximoDia - (gastoHoje || 0) : Infinity;
    if (restanteDia < preco) return nao('teto do dia atingido');
    const teto = Math.min(positivo(config.gastoMaximoAuto) ? config.gastoMaximoAuto : Infinity, restanteDia);
    let qtd = P.quantidadeCompravel({ qtdAnuncio: av.candidato.qtd, preco, saldo, gastoMaximo: Number.isFinite(teto) ? teto : 0 });
    if (qtd < 1) return nao(saldo < preco ? 'saldo não paga uma unidade' : config.calibrada ? 'o cofre não tem ouro livre para uma unidade (reserva ou teto do dia)' : 'teto por compra não paga uma unidade');
    const lucro = av.lucroPorUnidade * qtd;
    if (!(lucro >= config.lucroMinimoAuto)) return nao('lucro abaixo do mínimo do automático');
    return { comprar: true, qtd, gasto: qtd * preco, lucro, motivo: null };
  }

  return { FALHAS_PARA_DESLIGAR, diaLocal, gastoDeHoje, somarGasto, contarFalhas, deveDesligar, decidir };
});
