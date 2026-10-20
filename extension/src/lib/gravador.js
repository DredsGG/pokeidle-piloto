// Gravação da Fase 0: entradas em blocos, com teto de tamanho, e a montagem do arquivo
// exportado. Funções puras; quem lê e escreve no chrome.storage é a ponte (e o popup).
//
// Formato no storage:
//   grav:meta          { inicio, fim, total, bytes, blocos: [chaves], contagem, descartadas, cheio, versaoJogo }
//   grav:b:<pagina>:<n> [ entradas ]
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarGravador = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CHAVE_META = 'grav:meta';
  const PREFIXO_BLOCO = 'grav:b:';
  const POR_BLOCO = 200;
  const BYTES_POR_BLOCO = 256 * 1024;
  const LIMITE_BYTES = 8 * 1024 * 1024;
  const FORMATO = 'radar-mercado/gravacao';

  function metaVazia() {
    return { inicio: null, fim: null, total: 0, bytes: 0, blocos: [], porTipo: {}, contagem: { in: {}, out: {} }, porPagina: {}, descartadas: 0, cheio: false, versaoJogo: null };
  }

  function chaveBloco(pagina, n) {
    return `${PREFIXO_BLOCO}${pagina}:${String(n).padStart(4, '0')}`;
  }

  // Estado de gravação de uma aba. `meta` vem do storage (ou metaVazia()).
  // adicionar() devolve as chaves que precisam ser escritas; nada aqui toca em storage.
  // Bloco também fecha por tamanho: cada escrita regrava o bloco atual inteiro, e uma resposta
  // aba=itens tem dezenas de KB.
  function criarGravador({ pagina, meta, porBloco = POR_BLOCO, bytesPorBloco = BYTES_POR_BLOCO, limiteBytes = LIMITE_BYTES }) {
    const m = meta ? JSON.parse(JSON.stringify(meta)) : metaVazia();
    let n = m.blocos.filter((c) => c.startsWith(`${PREFIXO_BLOCO}${pagina}:`)).length;
    let chaveAtual = null;
    let bytesAtual = 0;
    // Blocos mexidos desde a última gravação no storage (o atual e os que encheram no meio).
    const abertos = new Map();
    const sujos = new Set();

    function adicionar(entrada) {
      if (m.cheio) return false;
      const texto = JSON.stringify(entrada);
      if (m.bytes + texto.length > limiteBytes) {
        m.cheio = true;
        sujos.add(CHAVE_META);
        return false;
      }
      const atual = chaveAtual && abertos.get(chaveAtual);
      if (!atual || atual.length >= porBloco || (atual.length && bytesAtual + texto.length > bytesPorBloco)) {
        n += 1;
        chaveAtual = chaveBloco(pagina, n);
        abertos.set(chaveAtual, []);
        m.blocos.push(chaveAtual);
        bytesAtual = 0;
      }
      bytesAtual += texto.length;
      const e = { ...entrada, n: m.total + 1 };
      abertos.get(chaveAtual).push(e);
      // Contagem do que foi gravado (o popup mostra na hora; a do hook chega a cada 5 s).
      m.porTipo = m.porTipo || {};
      const tipo = `${e.dir} ${e.t}`;
      m.porTipo[tipo] = (m.porTipo[tipo] || 0) + 1;
      m.total += 1;
      m.bytes += texto.length;
      if (m.inicio === null) m.inicio = e.em ?? null;
      m.fim = e.em ?? m.fim;
      sujos.add(chaveAtual);
      sujos.add(CHAVE_META);
      return true;
    }

    // A contagem do hook é cumulativa dentro da aba; entre abas (recarregou a página) soma.
    function contagem(c, descartadas) {
      m.porPagina = m.porPagina || {};
      m.porPagina[pagina] = { contagem: c, descartadas: typeof descartadas === 'number' ? descartadas : 0 };
      let total = { in: {}, out: {} };
      let desc = 0;
      for (const p of Object.values(m.porPagina)) {
        total = somarContagem(total, p.contagem);
        desc += p.descartadas;
      }
      m.contagem = total;
      m.descartadas = desc;
      sujos.add(CHAVE_META);
    }

    function versaoJogo(v) {
      if (v && m.versaoJogo !== v) {
        m.versaoJogo = v;
        sujos.add(CHAVE_META);
      }
    }

    // O que precisa ir para o storage desde a última chamada.
    function pendente() {
      const saida = {};
      for (const chave of sujos) {
        saida[chave] = chave === CHAVE_META ? JSON.parse(JSON.stringify(m)) : abertos.get(chave).slice();
      }
      sujos.clear();
      // Bloco cheio já foi escrito inteiro: não precisa mais ficar na memória.
      for (const chave of [...abertos.keys()]) if (chave !== chaveAtual) abertos.delete(chave);
      return saida;
    }

    return { adicionar, contagem, versaoJogo, pendente, get meta() { return m; } };
  }

  function somarContagem(base, nova) {
    const saida = { in: { ...(base && base.in) }, out: { ...(base && base.out) } };
    for (const dir of ['in', 'out']) {
      const mapa = (nova && nova[dir]) || {};
      for (const t of Object.keys(mapa)) saida[dir][t] = (saida[dir][t] || 0) + mapa[t];
    }
    return saida;
  }

  // Junta meta e blocos no arquivo exportado.
  function montarExportacao({ meta, blocos, versaoExtensao, exportadoEm }) {
    const entradas = [];
    for (const chave of meta.blocos) for (const e of blocos[chave] || []) entradas.push(e);
    entradas.sort((a, b) => (a.em ?? 0) - (b.em ?? 0) || (a.n ?? 0) - (b.n ?? 0));
    return {
      formato: FORMATO,
      versao: 1,
      exportadoEm,
      versaoExtensao,
      versaoJogo: meta.versaoJogo,
      inicio: meta.inicio,
      fim: meta.fim,
      total: entradas.length,
      contagem: meta.contagem,
      descartadas: meta.descartadas,
      cheio: meta.cheio,
      entradas,
    };
  }

  function nomeArquivo(data) {
    const d = new Date(data);
    const p = (x) => String(x).padStart(2, '0');
    return `radar-gravacao-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  return { CHAVE_META, PREFIXO_BLOCO, POR_BLOCO, LIMITE_BYTES, FORMATO, metaVazia, chaveBloco, criarGravador, somarContagem, montarExportacao, nomeArquivo };
});
