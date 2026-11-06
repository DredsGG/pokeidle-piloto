// Tudo o que vem do jogo, sempre da versão no ar.
//
// Nada de tabela copiada: as fórmulas são os próprios módulos `shared/` do pokeidle.io,
// importados da página, e o catálogo de espécies é remontado a partir dos mesmos JSONs e na
// mesma ordem que o cliente oficial usa (`carregarCatalogoEspecies` no app.js deles). Quando
// o jogo muda um golpe, um cooldown ou uma curva de XP, a extensão muda junto no próximo F5.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});

  const SEM_CACHE = { cache: 'no-cache' };
  const url = (caminho) => `${location.origin}/${caminho}`;
  const importar = (caminho) => import(url(caminho));
  const json = (caminho, opcional = false) =>
    fetch(url(caminho), SEM_CACHE).then((r) => {
      if (r.ok) return r.json();
      if (opcional) return null;
      throw new Error(`${caminho}: HTTP ${r.status}`);
    }).catch((err) => { if (opcional) return null; throw err; });

  /** A versão do cliente, lida da folha de estilo (`estilo.css?v=1.233.0`). */
  PIH.versaoDoJogo = () => {
    const link = document.querySelector('link[href*="estilo.css?v="]');
    return link?.getAttribute('href')?.split('v=')[1] ?? null;
  };

  /** Os módulos do jogo que a extensão usa — a mesma lista serve aos testes (scripts/). */
  const MODULOS = {
    cooldown: 'shared/cooldown-golpes.mjs',
    especiais: 'shared/golpes-especiais.mjs',
    planilhas: 'shared/golpes-planilhas.mjs',
    outland: 'shared/outland.mjs',
    baseOutland: 'shared/herdar-base-outland.mjs',
    golpesOrre: 'shared/herdar-golpes-orre.mjs',
    megas: 'shared/megas.mjs',
    evolucoes: 'shared/evolucoes-cruzadas.mjs',
    alias: 'shared/alias-item.mjs',
    tm: 'shared/tm-elemental.mjs',
    recompensa: 'shared/recompensa-hunt.mjs',
    analyser: 'hunt-analyser.mjs',
  };
  const CATALOGOS = {
    cr: 'assets/creatures.json',
    novos: 'assets/creatures-novos.json',
    outlandNovos: 'assets/creatures-outland-novos.json',
    overrides: 'assets/creatures-audit-overrides.json',
    itens: 'assets/items.json',
  };
  PIH.MODULOS_DO_JOGO = MODULOS;
  PIH.CATALOGOS_DO_JOGO = CATALOGOS;

  async function carregarModulos() {
    const pares = await Promise.all(Object.entries(MODULOS).map(async ([k, caminho]) => [k, await importar(caminho)]));
    return Object.fromEntries(pares);
  }

  /**
   * O catálogo de espécies como o cliente monta — só os passos que mexem em combate:
   * stats-base, tipos e golpes. Evolução, teto de captura e valor de mercado ficam de fora.
   */
  function montarCatalogo(mod, fontes) {
    const { cr, novos, outlandNovos, overrides } = fontes;
    const lista = [...(cr?.creatures ?? [])];
    if (novos?.creatures?.length) lista.push(...novos.creatures);
    if (outlandNovos?.creatures?.length) lista.push(...outlandNovos.creatures);
    mod.outland.aplicarRemapOutlandLista(lista);

    for (const o of overrides?.overrides ?? []) {
      const c = lista.find((x) => x.pokeId === o.pokeId);
      if (!c) continue;
      for (const k of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) {
        if (typeof o[k] === 'number') c[k] = o[k];
      }
      if (Array.isArray(o.attacks)) c.attacks = o.attacks.map((a) => ({ ...a }));
    }

    mod.planilhas.aplicarGolpesDasPlanilhas((id) => lista.filter((c) => c.pokeId === id));
    mod.baseOutland.herdarBaseOutland(lista);
    // Cadeias truncadas antes da injeção dos golpes de 600: é o que tira o ultimate de quem
    // deixou de ser última evolução (Vigoroth, Shelgon), igual ao servidor.
    mod.evolucoes.aplicarCadeiasTruncadas(lista);
    mod.evolucoes.normalizarEvolveLevel600(lista);

    const especies = new Map();
    for (const c of lista) {
      if (mod.outland.isEspelhoFantasmaPokeId(c.pokeId)) continue;
      for (const l of c.loot ?? []) l.name = mod.alias.resolverNomeItem(l.name);
      mod.especiais.injetarGolpesEspeciais(c);
      especies.set(c.pokeId, c);
    }
    mod.golpesOrre.herdarGolpesOrre(lista);
    for (const mega of mod.megas.criarEspeciesMega(lista)) especies.set(mega.pokeId, mega);
    return especies;
  }

  function precosDeItem(itens) {
    const precoItem = new Map();
    for (const i of itens?.items ?? itens ?? []) {
      if (i?.name) precoItem.set(i.name, Number(i.npcPrice) || 0);
    }
    return precoItem;
  }

  // Para os testes montarem o mesmo catálogo fora do navegador.
  PIH._montarCatalogo = montarCatalogo;
  PIH._precosDeItem = precosDeItem;

  let promessa = null;
  /** Carrega uma vez por página; as chamadas seguintes recebem o mesmo resultado. */
  PIH.carregarJogo = () => (promessa ??= (async () => {
    const inicio = performance.now();
    const [mod, cr, novos, outlandNovos, overrides, itens] = await Promise.all([
      carregarModulos(),
      json(CATALOGOS.cr),
      json(CATALOGOS.novos, true),
      json(CATALOGOS.outlandNovos, true),
      json(CATALOGOS.overrides, true),
      json(CATALOGOS.itens, true),
    ]);
    const especies = montarCatalogo(mod, { cr, novos, outlandNovos, overrides });
    const precoItem = precosDeItem(itens);
    const itensPorId = new Map((itens?.items ?? itens ?? []).filter((i) => i?.id != null).map((i) => [Number(i.id), i]));
    return {
      itensPorId,
      mod,
      especies,
      precoItem,
      versao: PIH.versaoDoJogo(),
      msCarga: Math.round(performance.now() - inicio),
    };
  })().catch((err) => { promessa = null; throw err; }));

  // ---- 1.51.0: o Dia Sazonal (o "Bônus do Dia") -------------------------------------------------
  // Todo dia às 18:00 de Brasília o servidor sorteia uma das 18 tipagens: chega em
  // `estado.diaSazonal { tipo, fim }` e, na virada com o jogador aqui, na mensagem
  // `{ t: 'diaSazonal', tipo }` (o hook repassa só o tipo). Nas hunts do Mapa, quem é dessa
  // tipagem causa ×2 e recebe ×¼ de dano. A regra é a do próprio jogo (shared/dia-sazonal.mjs:
  // `multDanoSazonal` e o piso de `danoSazonal`), pedida só quando o tipo aparece. Sem o dado,
  // ou sem o módulo no formato esperado, o ranking fica exatamente como era (e o Diário diz).
  const MODULO_SAZONAL = 'shared/dia-sazonal.mjs';
  PIH.MODULO_SAZONAL = MODULO_SAZONAL;
  // o nome que o jogo mostra em português (i18n do cliente, sazonal.tipo.*); o dicionário traduz
  const NOME_TIPO = { NORMAL: 'Normal', FIRE: 'Fogo', WATER: 'Água', GRASS: 'Planta', ELECTRIC: 'Elétrico', ICE: 'Gelo', FIGHTING: 'Lutador', POISON: 'Veneno', GROUND: 'Terra', FLYING: 'Voador', PSYCHIC: 'Psíquico', BUG: 'Inseto', ROCK: 'Pedra', GHOST: 'Fantasma', DRAGON: 'Dragão', DARK: 'Sombrio', STEEL: 'Aço', FAIRY: 'Fada' };
  const RE_TIPO = /^[A-Z]{3,10}$/;

  /** O módulo do jogo serve? Só o formato: as 18 tipagens e a função do multiplicador. */
  function validarSazonal(m) {
    try {
      if (!m || typeof m.multDanoSazonal !== 'function' || !Array.isArray(m.TIPOS_SAZONAIS) || m.TIPOS_SAZONAIS.length !== 18) return null;
      const t = m.TIPOS_SAZONAIS[0];
      const v = m.multDanoSazonal(t, [t], []);
      if (!(Number.isFinite(v) && v > 0) || m.multDanoSazonal(null, [t], [t]) !== 1) return null;
      const mult = m.multDanoSazonal;
      const piso = typeof m.danoSazonal === 'function' ? m.danoSazonal : null;
      return {
        tipos: [...m.TIPOS_SAZONAIS],
        mult,
        // o golpe que acertava continua tirando pelo menos 1 (o ¼ não zera golpe)
        dano: (d, k) => {
          const r = piso ? Number(piso(d, k)) : Math.max(d > 0 ? 1 : 0, d * k);
          return Number.isFinite(r) ? r : d;
        },
      };
    } catch { return null; }
  }

  const sz = { lido: null, modulo: undefined, carregando: null, anunciado: null, falhaAnunciada: null };
  const nomeTipo = (t) => NOME_TIPO[t] || t;
  const diarioSz = (txt, tipo) => { try { PIH.cofre?.diario?.(txt, tipo); } catch { /* sem cofre */ } };
  /** O tipo que vale para o ranking agora: lido do servidor, uma das 18 do módulo do jogo. */
  function tipoValido() {
    const m = sz.modulo;
    return m && sz.lido && m.tipos.includes(sz.lido) ? sz.lido : null;
  }
  function anunciar() {
    const t = tipoValido();
    if (t) {
      if (t !== sz.anunciado) {
        sz.anunciado = t;
        diarioSz(`Dia Sazonal: ${nomeTipo(t)} (2× dano causado, ¼ recebido nas hunts do Mapa); ranking ajustado`, 'info');
        emitirMudou();
      }
      return;
    }
    if (sz.lido && sz.modulo === null && sz.falhaAnunciada !== sz.lido) {
      sz.falhaAnunciada = sz.lido;
      diarioSz(`Dia Sazonal: ${nomeTipo(sz.lido)} — o módulo do jogo (dia-sazonal) não carregou ou mudou de formato; ranking sem o ajuste do dia`, 'aviso');
    }
    if (sz.anunciado) { sz.anunciado = null; emitirMudou(); }
  }
  function emitirMudou() { try { PIH.emit?.('sazonal.mudou', { tipo: tipoValido() }); } catch { /* nada */ } }
  function carregarModuloSazonal() {
    if (sz.modulo !== undefined || sz.carregando) return;
    sz.carregando = importar(MODULO_SAZONAL)
      .then((m) => validarSazonal(m))
      .catch(() => null)
      .then((v) => { sz.modulo = v; sz.carregando = null; anunciar(); });
  }
  function receberTipo(tipo) {
    const t = typeof tipo === 'string' && RE_TIPO.test(tipo) ? tipo : null;
    if (t === sz.lido) return;
    sz.lido = t;
    if (t) carregarModuloSazonal();
    if (sz.modulo !== undefined) anunciar();
  }
  if (typeof PIH.on === 'function') {
    PIH.on('estado', (e) => { if (e && Object.prototype.hasOwnProperty.call(e, 'diaSazonal')) receberTipo(e.diaSazonal && e.diaSazonal.tipo); });
    PIH.on('diaSazonal', (m) => receberTipo(m && m.tipo));
  }

  /**
   * O `ctx.consts` do motor (um lugar só para todos que montam o ranking). `sazonal: false` para
   * quem não usa o Dia Sazonal (Caçar o meta, Melhorar o time, rodízio): o consts de antes.
   */
  PIH.constsDoRanking = (welcome, { sazonal = true } = {}) => {
    const w = welcome || {};
    const c = { tabelaTipos: w.tabelaTipos, ampliacaoHunt: w.ampliacaoHunt, multHpSelvagem: w.multHpSelvagem, multDanoSelvagem: w.multDanoSelvagem, tiposBoost: w.tiposBoost };
    const t = sazonal ? tipoValido() : null;
    if (t) {
      const m = sz.modulo;
      c.sazonal = Object.freeze({ tipo: t, mult: (tiposAtaca, tiposApanha) => m.mult(t, tiposAtaca, tiposApanha), dano: m.dano });
    }
    return c;
  };
  PIH.sazonal = Object.freeze({
    tipo: tipoValido,
    lido: () => sz.lido,
    situacao: () => (!sz.lido ? 'sem-dado' : sz.modulo === undefined ? 'carregando' : sz.modulo ? (tipoValido() ? 'ok' : 'tipo-desconhecido') : 'sem-modulo'),
    nome: nomeTipo,
    _interno: {
      validar: validarSazonal,
      // para os testes do motor: o tipo lido e o módulo já validado
      definir: (tipo, moduloValidado) => { sz.lido = tipo; sz.modulo = moduloValidado; },
    },
  });
})(globalThis);
