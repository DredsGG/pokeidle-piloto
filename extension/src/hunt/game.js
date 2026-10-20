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
})(globalThis);
