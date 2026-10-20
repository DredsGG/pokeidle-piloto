// Lucro realizado (0.9.0): o que o radar comprou e você vendeu depois, e quanto sobrou.
//
// As compras são as do radar (registro, resultado "Comprado" ou "Comprado (confirmado no
// histórico)"); as vendas, as do seu histórico de vendas do jogo (`market.historico`), com o que
// entrou já sem os 15%. Pokémon casa pelo id (cada um é único); item casa pelo nome, e as unidades
// vendidas saem primeiro das compras do radar, da mais antiga para a mais nova (o que passar delas é
// drop seu e fica fora da conta). No pokémon, a diária do anúncio entra quando o radar a conhece.
// Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarLucro = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COMPRADO = new Set(['ganhou', 'confirmado']);
  const DIA_MS = 86400000;
  const positivo = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const normalizarNome = (n) => String(n || '').trim().toLowerCase();

  // Do registro: só as compras do radar que aconteceram.
  function comprasDoRadar(alertas) {
    return (alertas || []).filter((a) => a && (!a.tipo || a.tipo === 'aviso') && COMPRADO.has(a.resultado) && positivo(a.preco)).map((a) => {
      const pokemon = a.categoria === 'pokemon';
      return {
        chave: a.chave ?? null,
        tipo: pokemon ? 'pokemon' : 'item',
        nome: pokemon ? (a.especie || a.nome) : a.nome,
        itemId: a.itemId ?? null,
        pokemonId: pokemon ? a.pokemonId ?? null : null,
        qtd: pokemon ? 1 : Math.max(1, Math.floor(Number(a.qtdPedida || a.qtd) || 1)),
        preco: a.preco,
        moeda: a.moeda || 'gold',
        em: a.concluidoEm || a.enviadoEm || a.em || 0,
      };
    }).sort((x, y) => x.em - y.em);
  }

  // As suas vendas (market.historico), como o radar guarda: sem o nome de quem comprou.
  function lerVenda(l) {
    if (!l || l.id === null || l.id === undefined) return null;
    const m = typeof l.descricao === 'string' && /^\s*(\d[\d.]*)\s*[x×]\s*(.+?)\s*$/iu.exec(l.descricao);
    const pokemon = l.tipo === 'pokemon';
    const nome = pokemon ? ((l.ficha && l.ficha.nome) || (typeof l.descricao === 'string' ? l.descricao.replace(/\s+Nv\s+\d+\s*$/i, '') : '')) : m ? m[2] : (l.descricao || '');
    return {
      id: l.id, em: typeof l.em === 'number' ? l.em : 0, tipo: pokemon ? 'pokemon' : 'item', nome,
      qtd: pokemon ? 1 : m ? Number(m[1].replace(/\./g, '')) : 1,
      bruto: typeof l.bruto === 'number' ? l.bruto : null, liquido: typeof l.valor === 'number' ? l.valor : null,
      moeda: l.moeda || 'gold', pokemonId: pokemon && l.pokemonId !== null && l.pokemonId !== undefined ? Number(l.pokemonId) : null,
    };
  }

  // compras: comprasDoRadar; vendas: lerVenda; diarias: pokemonId -> diária total paga no anúncio.
  function lucroRealizado({ compras, vendas, diarias = {}, agora = Date.now() }) {
    const linhas = [];
    const vs = (vendas || []).filter((v) => v && positivo(v.liquido)).sort((x, y) => x.em - y.em);
    // Pokémon: pelo id, venda depois da compra e na mesma moeda.
    const pkComprados = new Map((compras || []).filter((c) => c.tipo === 'pokemon' && c.pokemonId !== null).map((c) => [c.pokemonId, c]));
    for (const v of vs) {
      if (v.tipo !== 'pokemon' || v.pokemonId === null) continue;
      const c = pkComprados.get(v.pokemonId);
      if (!c || v.em < c.em || v.moeda !== c.moeda) continue;
      pkComprados.delete(v.pokemonId);
      const diaria = positivo(diarias[v.pokemonId]) ? diarias[v.pokemonId] : null;
      linhas.push({ tipo: 'pokemon', nome: c.nome, qtd: 1, custo: c.preco, liquido: v.liquido, diaria, lucro: v.liquido - c.preco - (diaria || 0), compraEm: c.em, vendaEm: v.em, moeda: v.moeda, vendaId: v.id });
    }
    // Itens: pelo nome, as unidades vendidas saem das compras do radar mais antigas primeiro.
    const lotes = new Map();
    for (const c of compras || []) {
      if (c.tipo !== 'item') continue;
      const k = `${normalizarNome(c.nome)}|${c.moeda}`;
      if (!lotes.has(k)) lotes.set(k, []);
      lotes.get(k).push({ ...c, resta: c.qtd });
    }
    for (const v of vs) {
      if (v.tipo !== 'item' || !(v.qtd > 0)) continue;
      const fila = lotes.get(`${normalizarNome(v.nome)}|${v.moeda}`);
      if (!fila) continue;
      let falta = v.qtd;
      let qtd = 0;
      let custo = 0;
      let compraEm = null;
      for (const lote of fila) {
        if (falta <= 0) break;
        if (lote.resta <= 0 || lote.em > v.em) continue;
        const k = Math.min(falta, lote.resta);
        lote.resta -= k;
        falta -= k;
        qtd += k;
        custo += k * lote.preco;
        if (compraEm === null) compraEm = lote.em;
      }
      if (!qtd) continue;
      const liquido = Math.round((v.liquido * qtd) / v.qtd);
      linhas.push({ tipo: 'item', nome: v.nome, qtd, custo, liquido, diaria: null, lucro: liquido - custo, compraEm, vendaEm: v.em, moeda: v.moeda, vendaId: v.id, deDrop: v.qtd - qtd });
    }
    linhas.sort((x, y) => y.vendaEm - x.vendaEm);
    // O que o radar comprou e ainda não foi vendido.
    const estoque = [];
    for (const fila of lotes.values()) {
      const resta = fila.reduce((s, l) => s + l.resta, 0);
      if (resta > 0) estoque.push({ tipo: 'item', nome: fila[0].nome, qtd: resta, custo: fila.reduce((s, l) => s + l.resta * l.preco, 0), moeda: fila[0].moeda });
    }
    for (const c of pkComprados.values()) estoque.push({ tipo: 'pokemon', nome: c.nome, qtd: 1, custo: c.preco, moeda: c.moeda, pokemonId: c.pokemonId });
    estoque.sort((x, y) => y.custo - x.custo);
    const ouro = linhas.filter((l) => l.moeda !== 'orb');
    const soma = (lista) => lista.reduce((s, l) => s + l.lucro, 0);
    // "Hoje" começa às 00:00 de Brasília (UTC−3), como o Cofre e o jogo.
    const BR = 3 * 3_600_000;
    const inicioHoje = new Date(Math.floor((agora - BR) / DIA_MS) * DIA_MS + BR);
    return {
      linhas,
      estoque,
      totais: {
        tudo: soma(ouro), hoje: soma(ouro.filter((l) => l.vendaEm >= inicioHoje.getTime())), seteDias: soma(ouro.filter((l) => l.vendaEm >= agora - 7 * DIA_MS)),
        vendas: ouro.length, custo: ouro.reduce((s, l) => s + l.custo, 0), liquido: ouro.reduce((s, l) => s + l.liquido, 0),
        emEstoque: estoque.filter((e) => e.moeda !== 'orb').reduce((s, e) => s + e.custo, 0),
      },
    };
  }

  // A diária de um anúncio de pokémon pelo prazo dele (Meus anúncios: criadoEm e expiraEm).
  function diariaDoAnuncio(l, taxaDiaria = 100000) {
    if (!l || l.tipo !== 'pokemon' || typeof l.criadoEm !== 'number' || typeof l.expiraEm !== 'number') return null;
    const dias = Math.max(1, Math.round((l.expiraEm - l.criadoEm) / DIA_MS));
    return { pokemonId: Number(l.pokemonId), dias, diaria: dias * taxaDiaria };
  }

  return { COMPRADO, comprasDoRadar, lerVenda, lucroRealizado, diariaDoAnuncio };
});
