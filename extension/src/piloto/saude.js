// Saúde (1.20): a cada página aberta, confere se o jogo ainda tem tudo o que o Piloto usa.
//
// O jogo atualiza sem aviso (estilo.css?v=1.345.3). Quando a versão muda, ou quando alguma peça
// some, o Piloto anota no Diário e guarda o relatório em localStorage ('piloto:saude:v1'). A
// verificação agendada (fora do jogo) lê `__pokeidleHunt.saude.relatorio()` para saber se precisa
// consertar a extensão.
//
// O que confere (só leitura — nada daqui manda comando ao servidor):
// - o gancho e a conexão; as mensagens welcome e estado com os campos que o Piloto lê;
// - os módulos `shared/*.mjs` do jogo, cada um com as funções que o Piloto chama;
// - as âncoras da tela (barra do ativo, cabeçalho da equipe, botão do Centro numa hunt);
// - as imagens e índices de arte (ícones de item, retratos, bola do botão Time).
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on) return;

  const CHAVE = 'piloto:saude:v1';
  const ESPERA_MS = 30_000;
  const ESPERA_DE_NOVO_MS = 90_000;

  // Cada módulo do jogo e o que o Piloto usa dele (procurado em todos os scripts da 1.20).
  const MODULOS = {
    'shared/cooldown-golpes.mjs': ['cooldownGolpeComSpeed'],
    'shared/golpes-especiais.mjs': ['injetarGolpesEspeciais'],
    'shared/golpes-planilhas.mjs': ['aplicarGolpesDasPlanilhas'],
    'shared/outland.mjs': ['aplicarRemapOutlandLista', 'isEspelhoFantasmaPokeId', 'isOutlandPokeId'],
    'shared/campeonato.mjs': ['listaDeCampeonatos'],
    'shared/showdown.mjs': ['showdownAberto'],
    'shared/herdar-base-outland.mjs': ['herdarBaseOutland'],
    'shared/herdar-golpes-orre.mjs': ['herdarGolpesOrre'],
    'shared/megas.mjs': ['criarEspeciesMega'],
    'shared/evolucoes-cruzadas.mjs': ['aplicarCadeiasTruncadas', 'normalizarEvolveLevel600'],
    'shared/alias-item.mjs': ['resolverNomeItem'],
    'shared/tm-elemental.mjs': ['golpeTmElemental'],
    'shared/recompensa-hunt.mjs': ['ouroDoAbate', 'ouroPorDerrotaHunt', 'xpPorDerrota'],
    'hunt-analyser.mjs': ['VIP_MULT_XP', 'bonusLootPct', 'multXpPokemon', 'multXpTreinador'],
    'shared/passe-batalha.mjs': ['PASSE_NIVEL_MIN', 'estadoDoPasse'],
    'shared/outland-tiers.mjs': ['multOutlandTier', 'tierOutlandValido'],
    'shared/evolucoes-ramificadas.mjs': ['destinosDeEvolucao', 'tipoDaPedraDeEvolucao'],
    'shared/teto-captura.mjs': ['aplicarTetoDeCaptura'],
    'shared/chocadeira.mjs': ['normalizarChocadeira', 'primeiroSlotLivre'],
    'shared/auto-colecao.mjs': ['autoColecaoEfetiva', 'mesmaAutoColecao'],
    'shared/pedras-evolucao.mjs': ['PEDRA_POR_TIPO'],
    'shared/nota-pokemon.mjs': ['poderDePokemon', 'MERCADO_POKEMON_MIN'],
    'shared/estado-delta.mjs': ['criarMescladorDeEstado'],
    'shared/mistico.mjs': ['ehLendarioOuMitico'],
  };
  const ARQUIVOS = [
    'assets/items-icons.json',
    'assets/site/assets/maps/marker-atlas.json',
    'assets/site/assets/ui/ball-poke.png',
    'assets/creatures.json',
  ];

  let welcome = null;
  let eu = null;
  PIH.on('welcome', (m) => { welcome = m; });
  PIH.on('estado', (e) => { eu = e; });

  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; } catch { return {}; } };
  const gravar = (x) => { try { localStorage.setItem(CHAVE, JSON.stringify(x)); } catch { /* sem armazenamento */ } };
  const versaoExt = () => { try { return document.documentElement.dataset.pilotoVersao || null; } catch { return null; } };
  const comTempo = (p, ms) => Promise.race([p, new Promise((_, nao) => setTimeout(() => nao(new Error(`sem resposta em ${ms / 1000} s`)), ms))]);

  async function conferirModulo(caminho, nomes) {
    try {
      const m = await comTempo(import(`${location.origin}/${caminho}`), 15_000);
      const faltam = nomes.filter((n) => !(n in m) || m[n] === undefined);
      return faltam.length ? { ok: false, detalhe: `sem ${faltam.join(', ')}` } : { ok: true, detalhe: '' };
    } catch (e) { return { ok: false, detalhe: `não carregou (${String(e && e.message || e).slice(0, 80)})` }; }
  }
  async function conferirArquivo(caminho) {
    try {
      const r = await comTempo(fetch(`${location.origin}/${caminho}`, { cache: 'no-cache' }), 15_000);
      return r.ok ? { ok: true, detalhe: '' } : { ok: false, detalhe: `HTTP ${r.status}` };
    } catch (e) { return { ok: false, detalhe: String(e && e.message || e).slice(0, 80) }; }
  }

  // ok: true | false | null (null = ainda não dá para saber, ex.: fora de uma hunt)
  async function rodar() {
    const checks = [];
    const add = (id, ok, detalhe = '') => checks.push({ id, ok, detalhe });

    add('gancho', PIH.hookInstalado === true, PIH.hookInstalado ? '' : 'o gancho não instalou');
    const cont = PIH.contagemDoJogo ? PIH.contagemDoJogo() : null;
    add('conexão', cont ? cont.conectado : null, cont ? (cont.conectado ? '' : 'sem socket do jogo') : '');
    add('welcome', welcome ? (Array.isArray(welcome.catalogoBolas) && Array.isArray(welcome.hunts)) : null,
      welcome ? [!Array.isArray(welcome.catalogoBolas) && 'sem catalogoBolas', !Array.isArray(welcome.hunts) && 'sem hunts'].filter(Boolean).join(', ') : 'ainda não chegou');
    add('estado', eu ? (Number.isFinite(Number(eu.gold)) && Array.isArray(eu.pokemons) && Number.isFinite(Number(eu.level))) : null,
      eu ? [!Number.isFinite(Number(eu.gold)) && 'sem gold', !Array.isArray(eu.pokemons) && 'sem pokemons', !Number.isFinite(Number(eu.level)) && 'sem level'].filter(Boolean).join(', ') : 'ainda não chegou');

    const versao = PIH.versaoDoJogo ? PIH.versaoDoJogo() : null;
    add('versão do jogo', versao ? true : false, versao ? '' : 'sem estilo.css?v= na página');

    add('tela: barra do ativo', !!document.getElementById('p-ativo'), '#p-ativo');
    add('tela: cabeçalho da equipe', !!document.querySelector('#p-equipe .painel-cab-equipe'), '#p-equipe .painel-cab-equipe');
    const naHunt = !!eu && !!eu.huntSlug && !eu.noCentro;
    add('tela: botão do Centro', naHunt ? !!document.getElementById('ir-centro') : null, naHunt ? '#ir-centro' : 'só numa hunt');

    try {
      const j = await comTempo(PIH.carregarJogo(), 30_000);
      add('catálogo do jogo', !!j && j.especies && j.especies.size > 100, j ? `${j.especies.size} espécies` : '');
    } catch (e) { add('catálogo do jogo', false, String(e && e.message || e).slice(0, 80)); }

    const mods = await Promise.all(Object.entries(MODULOS).map(async ([c, n]) => [c, await conferirModulo(c, n)]));
    for (const [c, r] of mods) add(`módulo ${c}`, r.ok, r.detalhe);
    const arqs = await Promise.all(ARQUIVOS.map(async (c) => [c, await conferirArquivo(c)]));
    for (const [c, r] of arqs) add(`arquivo ${c}`, r.ok, r.detalhe);

    const antes = ler();
    const falhas = checks.filter((c) => c.ok === false);
    const rel = {
      em: Date.now(),
      versaoJogo: versao,
      versaoExtensao: versaoExt(),
      versaoAnterior: antes.versaoJogo || null,
      mudouVersao: !!(antes.versaoJogo && versao && antes.versaoJogo !== versao),
      ok: falhas.length === 0,
      pendentes: checks.filter((c) => c.ok === null).map((c) => c.id),
      falhas: falhas.map((c) => `${c.id}${c.detalhe ? `: ${c.detalhe}` : ''}`),
      checks,
      historico: [...(antes.historico || [])].filter((h) => h && h.versao),
    };
    if (versao && (!rel.historico.length || rel.historico[rel.historico.length - 1].versao !== versao)) rel.historico.push({ versao, desde: rel.em });
    rel.historico = rel.historico.slice(-12);
    gravar(rel);

    const diario = PIH.cofre && PIH.cofre.diario;
    const resumo = rel.ok ? `tudo certo (${checks.filter((c) => c.ok).length} conferências)` : `${falhas.length} falha${falhas.length === 1 ? '' : 's'}: ${rel.falhas.slice(0, 3).join(' · ')}`;
    if (diario) {
      if (rel.mudouVersao) diario(`saúde: o jogo atualizou ${rel.versaoAnterior} → ${versao} — ${resumo}`, rel.ok ? 'ok' : 'erro');
      else if (!rel.ok && (antes.ok !== false || antes.versaoJogo !== versao || antes.versaoExtensao !== rel.versaoExtensao)) diario(`saúde: ${resumo}`, 'erro');
    }
    if (!rel.ok) console.warn('[piloto] saúde:', rel.falhas);
    PIH.emit && PIH.emit('piloto.saude', rel);
    ultimo = rel;
    return rel;
  }

  let ultimo = null;
  // Só na página do jogo: em /terms (onde a vigia confere sem entrar) a tela e as mensagens não existem.
  if (/^\/app\/?$/.test(location.pathname)) setTimeout(() => {
    rodar().then((r) => { if (r.pendentes.length) setTimeout(() => rodar().catch(() => {}), ESPERA_DE_NOVO_MS - ESPERA_MS); }).catch(() => {});
  }, ESPERA_MS);

  const relatorio = () => JSON.parse(JSON.stringify(ultimo || ler() || {}));
  PIH.saude = { rodar, relatorio, MODULOS, ARQUIVOS };
})(globalThis);
