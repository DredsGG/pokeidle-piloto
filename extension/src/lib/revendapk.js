// Revenda de pokémon (0.7.0): os pokémon da conta que o jogo deixa anunciar, o custo de cada um
// (o que você pagou, quando comprou pelo Mercado), as vendas e os anúncios parecidos, o preço
// sugerido e a conta do líquido com a diária. Funções puras.
//
// Preço sugerido (decisão do Allan em 2026-10-17): 1 de ouro abaixo do anúncio parecido mais
// barato de outro jogador, mas nunca abaixo do 25º percentil das vendas parecidas (um anúncio com
// erro de preço não puxa o seu para baixo); sem anúncio parecido à venda, a mediana das vendas
// parecidas. Dias padrão: 1 (a diária é paga na hora e não volta se vender antes).
(function (raiz, fabrica) {
  const node = typeof module === 'object' && module.exports;
  const m = fabrica(node ? require('./pokemon.js') : raiz.RadarPokemon, node ? require('./config.js') : raiz.RadarConfig);
  if (node) module.exports = m;
  else raiz.RadarRevendaPokemon = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Pk, Config) {
  'use strict';

  const TAXA = Config.TAXA_VENDA;
  const PRECO_MINIMO = 2; // welcome.mercado.precoMinGold
  const DIAS = [1, 3, 7, 15, 30];
  const DIAS_PADRAO = 1;
  const DIARIA_PADRAO = 100000; // welcome.mercado.taxaDiaria
  // Termos, seção 11 (welcome.mercado.pokemonMin): nível 50 e nota 3,5; shiny e P5 passam.
  const NIVEL_MIN = 50;
  const NOTA_MIN = 3.5;
  // Abaixo da metade do 25º percentil das vendas parecidas, o clique pede confirmação: é o erro de
  // preço que o radar compra dos outros.
  const RAZAO_ABAIXO_DO_MERCADO = 0.5;
  const COMPRADO = new Set(['ganhou', 'confirmado']);

  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  // O pokémon da sua conta (como o gancho manda) no formato das fichas do Mercado, com a nota do
  // jogo calculada (o cliente calcula na tela; o servidor não manda).
  function fichaDe(k) {
    if (!k || !Number.isInteger(k.id)) return null;
    const f = {
      id: k.id,
      pokemonId: k.id,
      speciesId: typeof k.speciesId === 'number' ? k.speciesId : null,
      nome: k.nome || null,
      nivel: typeof k.level === 'number' ? k.level : null,
      potencia: typeof k.potencia === 'number' ? k.potencia : 1,
      qualidade: typeof k.quality === 'number' ? k.quality : null,
      ivTotal: typeof k.ivTotal === 'number' ? k.ivTotal : null,
      ivs: k.ivs || null,
      refinoStats: k.refino || null,
      shiny: Boolean(k.shiny),
      tm: Boolean(k.tmAoe || k.tmElemental),
      moeda: k.shiny ? 'orb' : 'gold', // shiny só se anuncia em Gemas
    };
    f.nota = Pk.notaDoJogo(f);
    f.notaAtaque = Pk.notaDeAtaque(f);
    return f;
  }

  // null: o jogo deixa anunciar. Senão o motivo (o servidor confere de novo de qualquer jeito).
  function motivoNaoAnunciavel(k, ficha, activeId) {
    if (!k || !ficha) return 'sumiu';
    if (k.id === activeId) return 'ativo';
    if (k.starter) return 'inicial';
    if (k.skin) return 'skin';
    if (ficha.shiny || ficha.potencia === 5) return null;
    if (!(ficha.nivel >= NIVEL_MIN)) return 'nivel';
    if (!(typeof ficha.nota === 'number' && ficha.nota >= NOTA_MIN - 1e-9)) return 'nota';
    return null;
  }

  // O que você pagou: a compra do radar (registro) ou a do histórico de compras do jogo.
  function custoDe(pokemonId, { registro, compras } = {}) {
    const r = (registro || []).find((a) => a && a.categoria === 'pokemon' && a.pokemonId === pokemonId && COMPRADO.has(a.resultado));
    if (r && positivo(r.preco)) return { valor: r.preco, moeda: r.moeda || 'gold', fonte: 'radar' };
    const c = (compras || []).find((l) => l && Number(l.pokemonId) === pokemonId && positivo(l.bruto));
    if (c) return { valor: c.bruto, moeda: c.moeda || 'gold', fonte: 'jogo' };
    return null;
  }

  // vendas: as da Tabela de preços da espécie; outros: os anúncios à venda da espécie (lerAnuncio).
  function sugerir({ ficha, vendas, outros, anuncioId = null }) {
    const ps = Pk.parecidas(vendas, ficha);
    const precos = ps.map((v) => v.preco).sort((a, b) => a - b);
    const p25 = Pk.percentil(precos, 0.25);
    const mediana = Pk.percentil(precos, 0.5);
    const aVenda = (outros || [])
      .filter((o) => o && !o.meu && o.id !== anuncioId && o.pokemonId !== ficha.pokemonId && o.moeda === ficha.moeda && positivo(o.preco) && (!o.estado || o.estado === 'aberto') && Pk.ehParecido(o, ficha))
      .sort((a, b) => a.preco - b.preco);
    const menor = aVenda[0] || null;
    let preco = null;
    let fonte = null;
    if (menor) {
      preco = menor.preco - 1;
      fonte = 'anuncio';
      if (p25 !== null && preco < p25) { preco = p25; fonte = 'p25'; }
    } else if (mediana !== null) {
      preco = mediana;
      fonte = 'mediana';
    }
    if (preco !== null) preco = Math.max(PRECO_MINIMO, Math.floor(preco));
    return {
      n: precos.length, p25, mediana, min: precos.length ? precos[0] : null, max: precos.length ? precos[precos.length - 1] : null,
      menorAVenda: menor ? menor.preco : null, nAVenda: aVenda.length, preco, fonte, ataque: Pk.compararAtaque(ficha, ps),
    };
  }

  // O líquido: em ouro, 85% do preço menos a diária dos dias; em Gemas, o preço menos a comissão
  // por faixa (a diária sai em ouro, à parte).
  function contaDe({ preco, moeda = 'gold', dias = DIAS_PADRAO, diaria = DIARIA_PADRAO, custo = null, faixasOrb } = {}) {
    if (!positivo(preco)) return null;
    const diariaTotal = diaria * dias;
    if (moeda === 'orb') {
      const liquido = preco - Pk.comissaoGemas(preco, faixasOrb);
      return { liquido, diariaTotal, lucro: custo && custo.moeda === 'orb' ? liquido - custo.valor : null, moeda };
    }
    const liquido = Math.floor(preco * (1 - TAXA)) - diariaTotal;
    return { liquido, diariaTotal, lucro: custo && custo.moeda !== 'orb' ? liquido - custo.valor : null, moeda };
  }

  // O que pede segundo clique: abaixo do custo, ou muito abaixo das vendas parecidas.
  function alertasDoPreco({ preco, conta, sugestao }) {
    const r = [];
    if (conta && typeof conta.lucro === 'number' && conta.lucro < 0) r.push('abaixo do custo');
    if (sugestao && positivo(sugestao.p25) && positivo(preco) && preco < sugestao.p25 * RAZAO_ABAIXO_DO_MERCADO) r.push('menos da metade das vendas parecidas');
    return r;
  }

  // pokemons: a coleção (do gancho); meus: as linhas de market.meus; calculos: pokemonId ->
  // { vendas, outros, em }; registro e compras: para o custo.
  function montarCartoes({ pokemons, activeId, meus, meuId, calculos, registro, compras }) {
    const cartoes = [];
    const ocultos = {};
    for (const k of pokemons || []) {
      const ficha = fichaDe(k);
      const motivo = motivoNaoAnunciavel(k, ficha, activeId);
      if (motivo) { ocultos[motivo] = (ocultos[motivo] || 0) + 1; continue; }
      const custo = custoDe(k.id, { registro, compras });
      const calculo = calculos && calculos.get(k.id);
      const sugestao = calculo ? sugerir({ ficha, vendas: calculo.vendas, outros: calculo.outros }) : null;
      cartoes.push({
        chave: `pk:${k.id}`, grupo: 'anunciar', pokemonId: k.id, ficha, custo, doRadar: Boolean(custo && custo.fonte === 'radar'),
        calculadoEm: calculo ? calculo.em : null, sugestao, acao: !calculo ? 'calcular' : sugestao.preco ? 'anunciar' : 'sem-referencia',
      });
    }
    for (const l of meus || []) {
      if (!l || l.tipo !== 'pokemon' || (l.estado && l.estado !== 'aberto')) continue;
      const a = Pk.lerAnuncio(l, meuId);
      if (!a || a.id === null) continue;
      const ficha = { ...a, moeda: a.moeda || 'gold' };
      const custo = custoDe(a.pokemonId, { registro, compras });
      const calculo = calculos && calculos.get(a.pokemonId);
      const sugestao = calculo ? sugerir({ ficha, vendas: calculo.vendas, outros: calculo.outros, anuncioId: a.id }) : null;
      let acao = 'calcular';
      if (calculo) {
        const baixar = sugestao.menorAVenda !== null && sugestao.menorAVenda <= a.preco && sugestao.preco !== null && sugestao.preco < a.preco;
        acao = baixar ? 'mudar-preco' : 'primeiro';
      }
      cartoes.push({
        chave: `pka:${a.id}`, grupo: 'mudar', anuncioId: a.id, pokemonId: a.pokemonId, ficha, custo, doRadar: Boolean(custo && custo.fonte === 'radar'),
        precoAtual: a.preco, compravelEm: a.compravelEm, expiraEm: typeof l.expiraEm === 'number' ? l.expiraEm : null,
        calculadoEm: calculo ? calculo.em : null, sugestao, acao,
      });
    }
    // Os comprados pelo radar primeiro; depois a maior nota.
    cartoes.sort((x, y) => Number(y.doRadar) - Number(x.doRadar) || (y.ficha.nota ?? 0) - (x.ficha.nota ?? 0));
    return { cartoes, ocultos };
  }

  const comAcao = (c) => c.acao === 'anunciar' || c.acao === 'mudar-preco';

  return { PRECO_MINIMO, DIAS, DIAS_PADRAO, DIARIA_PADRAO, NIVEL_MIN, NOTA_MIN, RAZAO_ABAIXO_DO_MERCADO, fichaDe, motivoNaoAnunciavel, custoDe, sugerir, contaDe, alertasDoPreco, montarCartoes, comAcao };
});
