// Configuração do radar: padrões, limites e o que entra no escopo. Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarConfig = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHAVE = 'radar:config';
  const TAXA_VENDA = 0.15; // comissão do vendedor em ouro (Termos, seção 11)

  // Peças numeradas: cada uma é única, então "preço normal" não existe.
  const CATEGORIAS_PROIBIDAS = Object.freeze(['box', 'casa', 'bicicleta']);

  const PADRAO = Object.freeze({
    radarLigado: false,
    intervaloS: 30,
    variacao: 0.2,
    pausarOculta: false,
    minutosOculta: 10,
    descontoMinimo: 0.25,
    lucroMinimo: 200000,
    volumeMinimo: 500,
    margemEnvioMs: 300,
    gastoMaximoPorCompra: 0, // 0: sem teto além do saldo
    som: true,
    notificacoes: true,
    alertarIliquidos: false,
    alertarPoucoConfiaveis: false,
    abrirPainelNoAviso: false, // 1.6: o aviso vira notificação curta; abrir o painel é opcional
    // Compra automática (Fase 2): desligada até o Allan ligar. Limites próprios, mais exigentes
    // que os do aviso; o gasto do dia conta só o que o automático comprou.
    compraAutomatica: false,
    descontoMinimoAuto: 0.3,
    lucroMinimoAuto: 50000,
    gastoMaximoAuto: 3000000, // por compra; 0: sem teto além do saldo
    gastoMaximoDia: 6000000, // por dia (meia-noite do PC); 0: sem teto
    // Pokémon (Fase 4): avisos ligados; a compra automática de pokémon tem caixa própria e divide
    // o teto do dia com os itens.
    pokemon: true,
    descontoMinimoPokemon: 0.7,
    lucroMinimoPokemon: 1000000, // depois dos 15% e de um dia de diária (100.000)
    compraAutomaticaPokemon: false,
    gastoMaximoPokemon: 10000000, // por pokémon; 0: sem teto além do saldo
    // Pokémon em Gemas: só análise (registro e CSV), nunca compra.
    pokemonGemas: true,
    lucroMinimoGemas: 100, // em Gemas (1 Gema = 0,01 USDT), já sem a comissão
    // Revenda automática de ITENS (piloto, 2026-10-19): anuncia sozinho, 1 abaixo do menor anúncio
    // de outro jogador e nunca abaixo do custo + 15%. Item não paga diária. Pokémon segue no clique.
    revendaAutomatica: false,
    revendaSoDoRadar: true, // só o que o radar comprou (desligado: também os seus drops vigiados)
    lucroMinimoRevenda: 20000,
    // Limites calculados sozinhos (Piloto 1.1): lucro mínimo pelo ouro/h, gasto pelo teto do cofre,
    // desconto do automático pela volatilidade de cada item. Desligado, valem os números acima.
    ajusteAutomatico: true,
    // Vigia contínua (1.7): varreduras seguidas, sem intervalo e sem pausa (o freio é o limitador).
    vigiaContinua: true,
    categorias: Object.freeze(['stone', 'fragment', 'boss', 'ticket', 'tm', 'mega']),
    itensBloqueados: Object.freeze([]), // desligados à mão dentro de categoria ligada
    itensLiberados: Object.freeze([]), // ligados à mão em categoria desligada
  });

  const LIMITES = Object.freeze({
    intervaloS: [20, 3600],
    minutosOculta: [1, 240],
    // Abaixo de 15% a taxa come tudo: 16% é o mínimo que ainda dá algum lucro.
    descontoMinimo: [0.16, 0.9],
    lucroMinimo: [0, 1e12],
    volumeMinimo: [0, 1e9],
    margemEnvioMs: [100, 2000],
    gastoMaximoPorCompra: [0, 1e13],
    descontoMinimoAuto: [0.16, 0.9],
    lucroMinimoAuto: [0, 1e12],
    gastoMaximoAuto: [0, 1e13],
    gastoMaximoDia: [0, 1e13],
    descontoMinimoPokemon: [0.5, 0.9],
    lucroMinimoPokemon: [0, 1e12],
    gastoMaximoPokemon: [0, 1e13],
    lucroMinimoGemas: [0, 1e9],
    lucroMinimoRevenda: [0, 1e12],
  });

  function prender(v, [min, max], padrao) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return padrao;
    return Math.min(max, Math.max(min, n));
  }

  function listaDeIds(v) {
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  }

  // Junta o que veio do storage (ou da tela de opções) com os padrões, dentro dos limites.
  function validar(parcial) {
    const p = parcial && typeof parcial === 'object' ? parcial : {};
    const c = { ...PADRAO };
    for (const chave of ['radarLigado', 'pausarOculta', 'som', 'notificacoes', 'alertarIliquidos', 'alertarPoucoConfiaveis', 'abrirPainelNoAviso', 'compraAutomatica', 'pokemon', 'compraAutomaticaPokemon', 'pokemonGemas', 'revendaAutomatica', 'revendaSoDoRadar', 'ajusteAutomatico', 'vigiaContinua']) {
      if (typeof p[chave] === 'boolean') c[chave] = p[chave];
    }
    for (const [chave, limite] of Object.entries(LIMITES)) c[chave] = prender(p[chave], limite, PADRAO[chave]);
    c.intervaloS = Math.round(c.intervaloS);
    c.minutosOculta = Math.round(c.minutosOculta);
    c.margemEnvioMs = Math.round(c.margemEnvioMs);
    c.variacao = c.vigiaContinua ? 0.1 : PADRAO.variacao;
    if (Array.isArray(p.categorias)) c.categorias = [...new Set(p.categorias.filter((x) => typeof x === 'string' && !CATEGORIAS_PROIBIDAS.includes(x)))];
    else c.categorias = [...PADRAO.categorias];
    c.itensBloqueados = listaDeIds(p.itensBloqueados);
    c.itensLiberados = listaDeIds(p.itensLiberados);
    return c;
  }

  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  // ---- limites calculados ------------------------------------------------------------------
  // ctx (publicado pelo Piloto, no mundo da página): { ouroH, teto } — o ouro/h medido e o teto do
  // dia do cofre. Sem ctx (Piloto ainda medindo), valem os pisos. O cofre continua sendo a trava
  // final de todo gasto: reserva, teto do dia somado e desligamento geral.
  const AUTO = Object.freeze({
    minLucroAuto: 20000, fracLucroAuto: 0.05, // ~3 min de farm
    minLucroAviso: 20000, fracLucroAviso: 0.03,
    minLucroRevenda: 10000, fracLucroRevenda: 0.02,
    minLucroPokemon: 500000, fracLucroPokemon: 0.5, // pokémon paga diária e é único: mais exigente
    fracPorCompra: 0.25, minPorCompra: 100000,
    fracPorPokemon: 0.5, minPorPokemon: 1000000,
    descontoBase: 0.25, descontoTeto: 0.5, pesoDispersao: 0.5, extraIliquido: 0.05,
    diasDeVolume: 2, // compra no máximo o que o mercado vende em ~2 dias
  });

  // Compra automática = as MESMAS regras do aviso (o que avisou, compra). O tamanho de cada compra é
  // o ouro livre do cofre agora (reserva e teto do dia já descontados). Pokémon mantém os números
  // dele (70% abaixo, 1 mi de lucro). Sem ctx (Piloto ainda medindo), valem os pisos.
  function calibrar(config, ctx) {
    if (!config || !config.ajusteAutomatico) return config;
    const c = { ...config, calibrada: true };
    const ouroH = ctx && positivo(ctx.ouroH) ? ctx.ouroH : 0;
    c.lucroMinimo = Math.max(AUTO.minLucroAviso, Math.round(ouroH * AUTO.fracLucroAviso));
    c.lucroMinimoAuto = c.lucroMinimo;
    c.descontoMinimoAuto = c.descontoMinimo;
    c.lucroMinimoRevenda = Math.max(AUTO.minLucroRevenda, Math.round(ouroH * AUTO.fracLucroRevenda));
    c.gastoMaximoPorCompra = 0;
    if (ctx && typeof ctx.livre === 'number' && Number.isFinite(ctx.livre)) {
      // 0 seria "sem teto" para o radar: sem folga no cofre, o teto vira 1 e nada passa.
      c.gastoMaximoDia = 0;
      c.gastoMaximoAuto = Math.max(1, Math.floor(ctx.livre));
      c.gastoMaximoPokemon = Math.max(1, Math.floor(ctx.livre));
    }
    return c;
  }

  // Mantidos por compatibilidade: o desconto do automático é o do aviso; sem teto por volume.
  function descontoAutoPara(av, config) {
    return config ? config.descontoMinimoAuto : AUTO.descontoBase;
  }
  function qtdPeloVolume() { return Infinity; }

  // Perfis do botão único. Só mexem nos interruptores; os números ficam com o ajuste automático.
  const PERFIS = Object.freeze({
    desligado: { radarLigado: false, compraAutomatica: false, compraAutomaticaPokemon: false, revendaAutomatica: false },
    manual: { radarLigado: true, compraAutomatica: false, compraAutomaticaPokemon: false, ajusteAutomatico: true }, // a revenda fica como está
    automatico: { radarLigado: true, compraAutomatica: true, compraAutomaticaPokemon: true, revendaAutomatica: true, revendaSoDoRadar: false, ajusteAutomatico: true, pokemon: true, vigiaContinua: true, abrirPainelNoAviso: false, intervaloS: 30, pausarOculta: false, som: true, notificacoes: true },
  });

  // item: { id, categoria } do catálogo do welcome.
  function itemLiberado(config, item) {
    if (!item || CATEGORIAS_PROIBIDAS.includes(item.categoria)) return false;
    const id = Number(item.id);
    if (config.itensBloqueados.includes(id)) return false;
    if (config.itensLiberados.includes(id)) return true;
    return config.categorias.includes(item.categoria);
  }

  return { CHAVE, TAXA_VENDA, CATEGORIAS_PROIBIDAS, PADRAO, LIMITES, AUTO, PERFIS, validar, itemLiberado, calibrar, descontoAutoPara, qtdPeloVolume };
});
