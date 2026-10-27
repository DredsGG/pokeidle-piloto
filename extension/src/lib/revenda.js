// Revenda (Fase 3): para cada item que o Allan tem das categorias vigiadas, o preço sugerido (1
// abaixo do menor anúncio de outro jogador que não esteja abaixo do custo), o líquido depois dos
// 15% e o que o botão do cartão faz. Nada é anunciado sem o clique dele. Funções puras.
(function (raiz, fabrica) {
  const node = typeof module === 'object' && module.exports;
  const m = node
    ? fabrica(require('./config.js'), require('./precos.js'), require('./pessoal.js'))
    : fabrica(raiz.RadarConfig, raiz.RadarPrecos, raiz.RadarPessoal);
  if (node) module.exports = m;
  else raiz.RadarRevenda = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config, P, Pessoal) {
  'use strict';

  const TAXA = Config.TAXA_VENDA;
  const PRECO_MINIMO = 2; // em ouro (seção 11 dos Termos)
  const MAX_ANUNCIOS = 20;
  const FILA_MOSTRADA = 3;
  const MESMA_COMPRA_MS = 2 * 60 * 1000;
  const MARGEM_SUBIR = 0.05; // subir o preço só quando ganha 5% ou mais (editar reinicia a retenção)

  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // As compras que dão o custo: as do radar (registro: comprado ou confirmado no histórico) e a
  // primeira página de "Suas compras" do jogo. A compra do radar também aparece no histórico do
  // jogo: a linha do jogo com o mesmo item e a mesma quantidade, perto da mesma hora, sai.
  // registro: as linhas do registro do radar; historico: market.historicoCompras.linhas.
  // Devolve [{ nome, qtd, bruto, em, doRadar }].
  function juntarCompras(registro, historico) {
    // 1.33.9: compra com clique (automatica === false) é SUA, não do radar — fica fora do "doRadar"
    const doRadar = (registro || [])
      .filter((a) => a && a.automatica !== false && (a.resultado === 'ganhou' || a.resultado === 'confirmado') && positivo(a.preco))
      .map((a) => {
        const qtd = positivo(a.qtdPedida) ? a.qtdPedida : a.qtd;
        return { nome: a.nome, qtd, bruto: a.preco * qtd, em: numero(a.concluidoEm) ?? numero(a.em), doRadar: true };
      })
      .filter((c) => positivo(c.qtd));
    const doJogo = Pessoal.normalizarHistorico(historico || [], 'compra')
      .filter((c) => c.moeda === 'gold' && positivo(c.qtd) && positivo(c.bruto))
      .filter((c) => !doRadar.some((r) => r.nome === c.nome && r.qtd === c.qtd && c.bruto <= r.bruto && Math.abs((r.em ?? 0) - (c.em ?? 0)) <= MESMA_COMPRA_MS))
      .map((c) => ({ nome: c.nome, qtd: c.qtd, bruto: c.bruto, em: c.em, doRadar: false }));
    return [...doRadar, ...doJogo];
  }

  // Custo das qtd unidades que ele tem: das compras mais recentes para trás. O que as compras
  // não cobrem veio de drop, com custo zero.
  function custoMedio({ compras, nome, qtd }) {
    const q = Math.max(0, Math.floor(qtd || 0));
    let falta = q;
    let pago = 0;
    let compradas = 0;
    let doRadar = false;
    const lista = (compras || []).filter((c) => c && c.nome === nome && positivo(c.qtd) && positivo(c.bruto)).sort((a, b) => (b.em ?? 0) - (a.em ?? 0));
    for (const c of lista) {
      if (falta <= 0) break;
      const usa = Math.min(falta, c.qtd);
      pago += (c.bruto / c.qtd) * usa;
      compradas += usa;
      falta -= usa;
      if (c.doRadar) doRadar = true;
    }
    return { porUnidade: q > 0 ? pago / q : 0, pago, compradas, deDrop: q - compradas, doRadar };
  }

  // Preço em que vender empata depois da taxa.
  function pisoDe(custoPorUnidade) {
    return Math.max(PRECO_MINIMO, Math.ceil((custoPorUnidade || 0) / (1 - TAXA)));
  }

  // Os anúncios de outros jogadores (abertos e retidos), do menor para o maior, a partir do corte.
  function filaDeOutros({ linhas, meuId, piso = 0 }) {
    return P.ordenar(linhas).filter((l) => !P.ehMeu(l, meuId) && l.preco >= piso);
  }

  // Abaixo do corte, o anúncio não conta para o preço sugerido: abaixo do piso seria vender no
  // prejuízo, e abaixo da metade da mediana dos 10 mais baratos é um anúncio de 2 de ouro, que
  // some no sorteio. A média de 7 dias não serve de base: ela fica bem acima do preço de hoje
  // (Fase 0).
  function corteDe(outros, piso) {
    const precos = outros.slice(0, 10).map((l) => l.preco);
    if (!precos.length) return piso;
    const meio = Math.floor(precos.length / 2);
    const mediana = precos.length % 2 ? precos[meio] : (precos[meio - 1] + precos[meio]) / 2;
    return Math.max(piso, Math.floor(mediana / 2));
  }

  const liquidoDe = (preco, qtd) => Math.floor(preco * qtd * (1 - TAXA));

  // qtd: unidades no inventário; meuAnuncio: o anúncio aberto dele deste item (ou null).
  // agora: hora do servidor (para a espera de 30 min entre mudanças de preço, v1.305).
  function sugerir({ qtd, linhas, meuId, custo, media7d, meuAnuncio, anunciosAbertos, agora }) {
    const piso = pisoDe(custo.porUnidade);
    const todos = P.ordenar(linhas).filter((l) => !P.ehMeu(l, meuId));
    const fila = filaDeOutros({ linhas, meuId, piso: corteDe(todos, piso) });
    const base = { piso, fila: fila.slice(0, FILA_MOSTRADA).map((l) => l.preco), ignorados: todos.length - fila.length };
    let preco;
    let fonte;
    if (fila.length) {
      preco = Math.max(piso, fila[0].preco - 1);
      fonte = 'menor';
    } else if (positivo(media7d)) {
      preco = Math.max(piso, Math.round(media7d));
      fonte = 'media7d';
    } else {
      return { ...base, preco: null, fonte: null, acao: 'sem-referencia', qtdCartao: qtd, liquido: null, lucro: null };
    }
    let acao;
    let qtdCartao = qtd;
    if (meuAnuncio) {
      qtdCartao = meuAnuncio.qtd;
      // Já é o primeiro: abaixo de todo anúncio de outro jogador que conta.
      // 1.12.3: já no preço sugerido (ex.: o outro está no piso e eu também) conta como primeiro —
      // senão "mudava" para o mesmo preço e reiniciava a retenção de 2 min à toa.
      const primeiro = meuAnuncio.preco === preco || (!fila.length ? meuAnuncio.preco <= preco : meuAnuncio.preco < fila[0].preco);
      // Primeiro, mas bem abaixo do próximo (5%+): dá para subir e continuar o mais barato.
      const subir = primeiro && fila.length > 0 && preco >= Math.ceil(meuAnuncio.preco * (1 + MARGEM_SUBIR));
      const espera = (!primeiro || subir) && typeof meuAnuncio.editavelEm === 'number' && typeof agora === 'number' && agora < meuAnuncio.editavelEm;
      acao = primeiro && !subir ? 'primeiro' : espera ? 'espera-editar' : 'mudar-preco';
    } else if (anunciosAbertos >= MAX_ANUNCIOS) {
      acao = 'sem-vaga';
    } else if (qtd < 1) {
      acao = 'sem-unidades';
    } else {
      acao = 'anunciar';
    }
    const precoDoCartao = acao === 'primeiro' ? meuAnuncio.preco : preco;
    const liquido = liquidoDe(precoDoCartao, qtdCartao);
    const lucro = liquido - custo.porUnidade * qtdCartao;
    const esperaEditarMs = acao === 'espera-editar' ? meuAnuncio.editavelEm - agora : null;
    return { ...base, preco, fonte, acao, qtdCartao, liquido, lucro, esperaEditarMs };
  }

  // inventario: { itemId: qtd } (estado.items); catalogo: Map id -> { id, nome, categoria };
  // livros: Map itemId -> { linhas, em } (último market.item); meus: anúncios abertos
  // (normalizarMeus); compras: juntarCompras; resumo: itemId -> { media7d, volume7d };
  // ocultos: Map itemId -> qtd com que ele escondeu o cartão.
  function montarSugestoes({ inventario, catalogo, config, livros, meus, compras, resumo, meuId, ocultos, agora }) {
    const abertos = (meus || []).filter((m) => m && (m.estado === null || m.estado === undefined || m.estado === 'aberto'));
    const anunciosAbertos = abertos.length;
    const ids = new Set();
    for (const [id, q] of Object.entries(inventario || {})) if (positivo(Number(q))) ids.add(Number(id));
    for (const m of abertos) if (m.tipoItem === 'item' && m.moeda === 'gold' && m.itemId) ids.add(m.itemId);
    const lista = [];
    for (const id of ids) {
      const item = catalogo && catalogo.get(id);
      if (!item || !Config.itemLiberado(config, item)) continue;
      const qtd = Math.max(0, Math.floor(Number((inventario || {})[id]) || 0));
      const meuAnuncio = abertos.find((m) => m.itemId === id && m.moeda === 'gold') || null;
      if (ocultos && ocultos.has(id) && ocultos.get(id) === qtd) continue;
      const custo = custoMedio({ compras, nome: item.nome, qtd: qtd + (meuAnuncio ? meuAnuncio.qtd || 0 : 0) });
      const r = resumo && resumo[id];
      const livro = livros && livros.get(id);
      const comum = { itemId: id, nome: item.nome, qtd, meuAnuncio, custo, volume7d: r ? r.volume7d : null, livroEm: livro ? livro.em : null };
      if (!livro) {
        lista.push({ ...comum, acao: 'sem-livro', piso: pisoDe(custo.porUnidade), preco: null, fila: [], ignorados: 0, qtdCartao: qtd, liquido: null, lucro: null });
        continue;
      }
      lista.push({ ...comum, ...sugerir({ qtd, linhas: livro.linhas, meuId, custo, media7d: r ? r.media7d : null, meuAnuncio, anunciosAbertos, agora }) });
    }
    return lista.sort((a, b) => Number(b.custo.doRadar) - Number(a.custo.doRadar) || (b.lucro ?? -Infinity) - (a.lucro ?? -Infinity));
  }

  // ---- 1.33.9 (pedido do André): o que você comprou À MÃO nunca é revendido sozinho ------------
  // O livro dos "comprados à mão": cada linha de "Suas compras" do jogo que NÃO foi uma compra
  // automática do radar entra uma vez (pela id da linha) e protege aquela quantidade do item, ou o
  // pokémon inteiro. Item: a proteção nunca passa do que você tem; se você usou ou vendeu na mão,
  // ela baixa junto. O que veio sozinho (drop, prêmio, compra automática do radar) segue na revenda.
  function livroManualVazio() { return { itens: {}, pokemons: [], vistos: [] }; }
  function ehCompraDoRadar(l, registroAuto) {
    const pid = Number(l.pokemonId);
    if (Number.isInteger(pid) && pid > 0) return registroAuto.some((a) => Number(a.pokemonId) === pid);
    const c = Pessoal.normalizarHistorico([l], 'compra')[0];
    if (!c) return false;
    return registroAuto.some((r) => r.nome === c.nome && r.qtd === c.qtd && Math.abs((r.em ?? 0) - (c.em ?? 0)) <= MESMA_COMPRA_MS);
  }
  function atualizarManuais(livro, { registro, historico, inventarioPorNome }) {
    const l0 = livro && typeof livro === 'object' ? livro : livroManualVazio();
    const out = { itens: { ...(l0.itens || {}) }, pokemons: [...new Set((l0.pokemons || []).map(Number).filter(Number.isInteger))], vistos: [...(l0.vistos || [])] };
    const vistos = new Set(out.vistos.map(String));
    const registroAuto = (registro || []).filter((a) => a && a.automatica !== false && (a.resultado === 'ganhou' || a.resultado === 'confirmado'))
      .map((a) => ({ nome: a.nome, qtd: positivo(a.qtdPedida) ? a.qtdPedida : a.qtd, em: numero(a.concluidoEm) ?? numero(a.em), pokemonId: a.pokemonId }));
    let mudou = false;
    for (const l of historico || []) {
      if (!l || l.id == null) continue;
      const id = String(l.id);
      if (vistos.has(id)) continue;
      vistos.add(id); out.vistos.push(id); mudou = true;
      if (ehCompraDoRadar(l, registroAuto)) continue;
      const pid = Number(l.pokemonId);
      if (Number.isInteger(pid) && pid > 0) { if (!out.pokemons.includes(pid)) out.pokemons.push(pid); continue; }
      const c = Pessoal.normalizarHistorico([l], 'compra')[0];
      if (!c || !c.nome || !positivo(c.qtd)) continue;
      out.itens[c.nome] = (Number(out.itens[c.nome]) || 0) + c.qtd;
    }
    // nunca protege mais do que você tem (o que usou ou vendeu na mão sai da proteção)
    if (inventarioPorNome) {
      for (const [nome, q] of Object.entries(out.itens)) {
        const tem = Math.max(0, Math.floor(Number(inventarioPorNome[nome]) || 0));
        if (q > tem) { out.itens[nome] = tem; mudou = true; }
        if (!out.itens[nome]) delete out.itens[nome];
      }
    }
    if (out.vistos.length > 600) out.vistos = out.vistos.slice(-600);
    if (out.pokemons.length > 2000) out.pokemons = out.pokemons.slice(-2000);
    return { livro: out, mudou };
  }
  // O inventário que a revenda pode usar: o que você tem menos o comprado à mão e menos as pedras
  // que o time vai gastar para evoluir.
  function inventarioRevendavel(inventario, catalogo, { manuais, pedrasDoTime } = {}) {
    const out = {};
    for (const [id, q] of Object.entries(inventario || {})) {
      const item = catalogo && catalogo.get(Number(id));
      const nome = item && item.nome;
      const mao = nome && manuais && manuais.itens ? Number(manuais.itens[nome]) || 0 : 0;
      const time = pedrasDoTime ? Number(pedrasDoTime[id]) || 0 : 0;
      out[id] = Math.max(0, Math.floor(Number(q) || 0) - mao - time);
    }
    return out;
  }

  // O número da aba: cartões com algo a fazer e lucro.
  const comAcao = (s) => (s.acao === 'anunciar' || s.acao === 'mudar-preco') && s.lucro > 0;

  return { TAXA, PRECO_MINIMO, MAX_ANUNCIOS, juntarCompras, custoMedio, pisoDe, filaDeOutros, liquidoDe, sugerir, montarSugestoes, comAcao, livroManualVazio, atualizarManuais, inventarioRevendavel };
});
