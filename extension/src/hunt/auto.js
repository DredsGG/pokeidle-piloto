// Automação: trocar sozinho para a melhor hunt e repor bolas, poções e revives.
//
// As duas vêm DESLIGADAS. Ligadas, elas mandam pelo socket do jogo os mesmos comandos que os
// botões do jogo mandam — `hunt.select`, `centro.ir`, `centro.curar`, `shop.buy` — e respeitam as
// mesmas travas que o servidor cobra (3 s fora de combate e a porta de 10 s entre trocas de área).
// Os Termos (seção 5) permitem automação no jogo, desde que siga as regras de quem joga na mão e
// não sobrecarregue o servidor: aqui são poucos comandos por hora.
//
// Trocar de hunt usa o ranking do /hunt (o modelo). Como o modelo pode errar numa hunt nova, a
// troca é CONFERIDA: depois de ~35 min caçando lá, se o XP/h medido ficou abaixo do que você
// fazia antes, a automação volta para a hunt anterior e deixa a nova de castigo por 12 h.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  if (!PIH.on || !PIH.engine) return;

  const CHAVE = 'pokeidle-hunt:auto:v1';
  const PADRAO = {
    hunt: { ligado: false, criterio: 'xp', intervaloMin: 30, margemPct: 10, evitarRisco: true, curar: true, conferir: true },
    // 1.33 (pedido do André: conta nova não comprava nada): o "Guardar" da reposição era 5 mi, acima
    // do saldo de quem começa. Agora 0 — o piso é o do cofre (que, para a reposição, nunca passa de
    // 10% do saldo; ver piloto/cofre.js).
    repor: { ligado: false, reservaOuro: 0, intervaloMin: 3, irAoCentro: true, alvos: {}, kitAuto: true },
  };
  const ler = () => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE)) ?? {};
      const repor = { ...PADRAO.repor, ...s.repor, alvos: { ...(s.repor?.alvos ?? {}) } };
      if (Number(repor.reservaOuro) === 5_000_000) repor.reservaOuro = 0; // o padrão antigo (1.33)
      return { hunt: { ...PADRAO.hunt, ...s.hunt }, repor, castigo: s.castigo ?? {}, troca: s.troca ?? null };
    } catch { return structuredClone({ ...PADRAO, castigo: {}, troca: null }); }
  };
  let cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };

  let welcome = null;
  let eu = null;
  PIH.on('welcome', (m) => { welcome = m; carregarCatalogo(); });

  // ---- diário (o que a automação fez, para você conferir) --------------------------------
  const diario = [];
  const hora = (t = Date.now()) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function anotar(txt, tipo = 'info') {
    diario.unshift({ t: Date.now(), txt, tipo });
    diario.length = Math.min(diario.length, 30);
    console.info('[pokeidle-hunt/auto]', txt);
    PIH.emit?.('auto.diario', diario);
  }
  let ultimoErro = null;
  PIH.on('erro', (m) => { ultimoErro = { t: Date.now(), chave: m?.chave ?? null, msg: m?.msg ?? null }; });
  const erroDepoisDe = (t0) => (ultimoErro && ultimoErro.t >= t0 ? ultimoErro.chave || ultimoErro.msg || 'erro' : null);

  // ---- onde estou ------------------------------------------------------------------------
  const pkAtivo = () => eu?.pokemons?.find((p) => p.id === eu.activeId) ?? null;
  const naHunt = () => !!eu?.huntSlug && !eu.noCentro && !eu.casa?.dentro && !eu.boss?.arena && !eu.mistico && !eu.safari?.dentro;
  const agoraServidor = () => Number(eu?.servidorAgora) || Date.now();
  // Fora de combate: a trava de 3 s do Centro já passou. (O carimbo vem do servidor no snapshot.)
  const foraDeCombate = () => (Number(eu?.centroLivreEm) || 0) <= agoraServidor();
  // Alguém do time de campo desmaiado (hp 0): o Centro ainda não curou.
  const desmaiados = () => (eu?.pokemons ?? []).some((p) => p && p.slot != null && p.hp != null && Number(p.hp) <= 0);

  // ---- o ranking (mesma conta do painel /hunt) -------------------------------------------
  // 1.16: o farm de vários pokémon numa hunt só (a janela Time): a mesma conta do ranking, mas
  // simulando apenas aquela hunt — rápido o bastante para passar pela coleção inteira.
  async function farmDe(pks, slug) {
    if (!welcome || !eu) return new Map();
    const hunt = (welcome.hunts ?? []).find((h) => h.slug === slug);
    if (!hunt) return new Map();
    const jogo = await PIH.carregarJogo();
    const precoItem = new Map(jogo.precoItem);
    for (const i of welcome.itensNossos ?? []) if (i?.name && Number(i.npcPrice) > 0) precoItem.set(i.name, Number(i.npcPrice));
    const consts = { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost };
    const bonusLootPct = PIH.lootPct ? PIH.lootPct(jogo, eu, welcome) : 0;
    const out = new Map();
    let n = 0;
    for (const pk of pks) {
      if (!pk || !pk.stats) continue;
      const chave = PIH.geo?.chaveDoPokemon(pk);
      const ctx = { mod: jogo.mod, especies: jogo.especies, precoItem, hunts: [hunt], consts, eu, bonusLootPct, geo: (s) => PIH.geo?.daHunt(s) ?? null, ritmoMedido: (s) => (chave ? PIH.geo?.ritmoMedido(s, chave) ?? null : null) };
      try {
        const l = PIH.engine.analisar(pk, ctx, { ordem: 'xp', soLiberadas: false }).linhas[0];
        if (l) out.set(pk.id, { xpTreinadorH: l.inviavel ? 0 : l.xpTreinadorH, xpPokemonH: l.inviavel ? 0 : l.xpPokemonH, ouroH: l.inviavel ? 0 : l.ouroH, kph: l.kph ?? 0, inviavel: !!l.inviavel, risco: l.hitPct ?? null, pocoesH: l.pocoesH ?? 0, mortesH: Number.isFinite(l.mortesH) ? l.mortesH : 0 });
      } catch { /* espécie fora do catálogo: fica de fora */ }
      if (++n % 25 === 0) await new Promise((r) => setTimeout(r, 0)); // não trava a página
    }
    return out;
  }
  async function ranking(criterio, pkOutro = null) {
    const pk = pkOutro || pkAtivo();
    if (!pk || !welcome || !eu) return null;
    const jogo = await PIH.carregarJogo();
    const chave = PIH.geo?.chaveDoPokemon(pk);
    const precoItem = new Map(jogo.precoItem);
    for (const i of welcome.itensNossos ?? []) if (i?.name && Number(i.npcPrice) > 0) precoItem.set(i.name, Number(i.npcPrice));
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem, hunts: welcome.hunts ?? [],
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu,
      bonusLootPct: PIH.lootPct ? PIH.lootPct(jogo, eu, welcome) : 0,
      geo: (slug) => PIH.geo?.daHunt(slug) ?? null,
      ritmoMedido: (slug) => (chave ? PIH.geo?.ritmoMedido(slug, chave) ?? null : null),
    };
    const prefs = (() => { try { return JSON.parse(localStorage.getItem('pokeidle-hunt:prefs:v1')) ?? {}; } catch { return {}; } })();
    return PIH.engine.analisar(pk, ctx, { ordem: criterio === 'ouro' ? 'ouro' : 'xp', soLiberadas: true, comPocao: prefs.comPocao ?? true });
  }
  const valorDe = (l, criterio) => (criterio === 'ouro' ? l.ouroH : l.xpPokemonH);
  const arriscada = (l) => PIH.engine.arriscada(l);

  // ---- a rotina de deslocamento (uma de cada vez) ----------------------------------------
  let rotina = null; // { destino, curar, compras, etapa, desde, tentativas, motivo }
  const ocupado = () => !!rotina;

  function iniciarRotina({ destino, curar, compras = [], motivo, manual = false, ficar = false }) {
    if (rotina) return false;
    rotina = { destino, curar, compras, motivo, manual, ficar, etapa: 'esperar', desde: Date.now(), tentativas: 0, origem: eu?.huntSlug ?? null };
    anotar(`${motivo} — esperando sair de combate`);
    passo();
    return true;
  }
  function encerrar(txt, tipo = 'info') {
    rotina = null;
    if (txt) anotar(txt, tipo);
  }

  function comprar(lista) {
    for (const c of lista) {
      const r = PIH.pedir({ t: 'shop.buy', kind: c.kind, id: c.id, qty: c.qty }, 'hunt');
      anotar(r.ok ? `comprando ${c.qty.toLocaleString('pt-BR')}× ${c.nome}` : `não comprou ${c.nome}: ${r.motivo}`, r.ok ? 'info' : 'aviso');
    }
  }

  /** Avança a rotina; chamado a cada snapshot de estado e por um relógio de 2 s. */
  function passo() {
    const r = rotina;
    if (!r || !eu) return;
    const agora = Date.now();
    const parado = agora - r.desde;
    if (r.etapa === 'esperar') {
      if (!naHunt() && !eu.noCentro) { if (parado > 120_000) encerrar('cancelado: você não está numa hunt', 'aviso'); return; }
      if (eu.noCentro) { r.etapa = 'centro'; r.desde = agora; return passo(); }
      if (!foraDeCombate()) { if (parado > (r.manual ? 30 : 10) * 60_000) encerrar(`cancelado: ${r.manual ? 30 : 10} min sem sair de combate`, 'aviso'); return; }
      if (!r.curar && !r.compras.length) {
        PIH.enviar({ t: 'hunt.select', slug: r.destino });
        r.etapa = 'voltar'; r.desde = agora; r.enviadoEm = agora;
        return;
      }
      PIH.enviar({ t: 'centro.ir' });
      r.etapa = 'indo'; r.desde = agora; r.enviadoEm = agora;
      return;
    }
    if (r.etapa === 'indo') {
      if (eu.noCentro) { r.etapa = 'centro'; r.desde = agora; return passo(); }
      const erro = erroDepoisDe(r.enviadoEm);
      if ((erro || parado > 15_000) && r.tentativas < 3) { r.tentativas++; r.etapa = 'esperar'; r.desde = agora; return; }
      if (parado > 15_000) encerrar(`não consegui ir ao Centro${erro ? ` (${erro})` : ''}`, 'erro');
      return;
    }
    if (r.etapa === 'centro') {
      // 1.25.1 (relato #1 no GitHub): no Centro, cura sempre — estava indo só comprar e voltando
      // com o time desmaiado (ou ficando parado lá, porque o jogo não deixa entrar na hunt assim).
      PIH.enviar({ t: 'centro.curar' });
      if (r.compras.length) comprar(r.compras);
      r.etapa = r.ficar ? 'parado' : 'sair'; r.desde = agora; r.curas = 1;
      return;
    }
    // 1.26.3: a janela Time pediu para ficar no Centro enquanto troca o time inteiro; ela libera
    // (liberarCentro) quando acaba. Rede de segurança: 12 min parado, volta sozinho.
    if (r.etapa === 'parado') {
      if (!eu.noCentro) return encerrar('saiu do Centro antes da troca acabar', 'aviso');
      if (parado > 12 * 60_000) { r.etapa = 'sair'; r.desde = agora - 2000; anotar('o Centro passou de 12 min: voltando à hunt', 'aviso'); }
      return;
    }
    if (r.etapa === 'sair') {
      if (parado < 1500) return; // deixa a cura e a compra chegarem antes de sair
      if (desmaiados() && (r.curas || 0) < 3 && parado < 20_000) {
        if (parado >= 3000 * (r.curas || 1)) { r.curas = (r.curas || 0) + 1; PIH.enviar({ t: 'centro.curar' }); }
        return;
      }
      PIH.enviar({ t: 'hunt.select', slug: r.destino });
      r.etapa = 'voltar'; r.desde = agora; r.enviadoEm = agora; r.tentativas = 0;
      return;
    }
    if (r.etapa === 'voltar') {
      if (eu.huntSlug === r.destino && !eu.noCentro) return encerrar(`pronto: caçando em ${nomeHunt(r.destino)}`, 'ok');
      // a porta de 10 s entre trocas, ou o "voltar à hunt" do jogo correndo junto: tenta de novo
      if (parado > 6000 && r.tentativas < 5) {
        r.tentativas++; r.desde = agora; r.enviadoEm = agora;
        PIH.enviar({ t: 'hunt.select', slug: r.destino });
        return;
      }
      if (parado > 6000) {
        const erro = erroDepoisDe(r.enviadoEm);
        encerrar(`não consegui entrar em ${nomeHunt(r.destino)}${erro ? ` (${erro})` : ''}`, 'erro');
        // nunca deixar você parado no Centro (a vigia do Centro, no relógio, tenta de novo depois)
        if (eu.noCentro && r.origem && r.origem !== r.destino) PIH.enviar({ t: 'hunt.select', slug: r.origem });
        centroFalhou++;
      }
    }
  }
  // 1.15: o botão ↩ ao lado do "Ir para o Centro Pokemon" do jogo: vai na primeira brecha, cura e
  // volta para a mesma hunt — a mesma rotina da reposição, marcada como pedido seu.
  function irAoCentroEVoltar() {
    if (rotina) return { ok: false, motivo: rotina.manual ? 'já na fila' : 'o Piloto já está indo ao Centro' };
    if (!eu || !naHunt()) return { ok: false, motivo: 'só numa hunt' };
    if (!PIH.cofre?.ligado?.()) return { ok: false, motivo: 'com o Piloto em Off, use a fila simples' };
    const ok = iniciarRotina({ destino: eu.huntSlug, curar: true, manual: true, motivo: 'você pediu: Centro, curar e voltar' });
    return { ok, motivo: ok ? null : 'ocupado' };
  }
  // 1.26.3 (pedido do André): a troca do time inteiro acontece no Centro. Vai na primeira brecha
  // de combate (a mesma fila do botão do Centro), cura, compra o que faltar e FICA até a janela
  // Time chamar liberarCentro(); aí volta para a hunt de onde saiu.
  function irAoCentroEFicar({ motivo } = {}) {
    if (rotina) return { ok: false, motivo: 'o Piloto já está indo para outro lugar' };
    if (!eu) return { ok: false, motivo: 'esperando o jogo' };
    const destino = (naHunt() ? eu.huntSlug : null) || ultimaHunt;
    if (!destino) return { ok: false, motivo: 'não sei para qual hunt voltar' };
    if (!naHunt() && !eu.noCentro) return { ok: false, motivo: 'só numa hunt ou no Centro' };
    const ok = iniciarRotina({ destino, curar: true, compras: comprasPendentes(), motivo: motivo || 'indo ao Centro', ficar: true });
    return { ok, motivo: ok ? null : 'ocupado' };
  }
  // 1.34 (o André viu o turno do Blastoise acabar, ele ir ao Centro e voltar para a mesma hunt, e
  // só 3 min depois o rodízio fazer outra viagem ao Centro para trocar): se o turno vence com uma ida
  // ao Centro já andando (reposição, vigia do Centro, o botão ↩), o rodízio pega carona nela — a
  // rotina fica no Centro (como a do irAoCentroEFicar) até o rodízio trocar o ativo e liberar.
  function caronaNoCentro({ motivo } = {}) {
    const r = rotina;
    if (!r || r.ficar) return { ok: false, motivo: r ? 'a rotina já fica no Centro' : 'nada indo ao Centro' };
    const vaiAoCentro = r.curar || (r.compras && r.compras.length);
    const aindaDa = ['esperar', 'indo', 'centro'].includes(r.etapa) || (r.etapa === 'sair' && eu?.noCentro);
    if (!vaiAoCentro || !aindaDa) return { ok: false, motivo: 'a rotina não passa pelo Centro agora' };
    r.ficar = true;
    if (r.etapa === 'sair') { r.etapa = 'parado'; r.desde = Date.now(); }
    if (motivo) anotar(motivo);
    return { ok: true };
  }
  function liberarCentro(destino) {
    if (!rotina || !rotina.ficar) return false;
    if (destino) rotina.destino = destino;
    rotina.ficar = false;
    if (rotina.etapa === 'parado') { rotina.etapa = 'sair'; rotina.desde = Date.now() - 2000; passo(); }
    return true;
  }
  function cancelarIdaManual() {
    if (rotina && rotina.manual && rotina.etapa === 'esperar') { encerrar('fila do Centro cancelada por você'); return true; }
    return false;
  }
  const nomeHunt = (slug) => (welcome?.hunts ?? []).find((h) => h.slug === slug)?.nome ?? slug;

  // ---- 1. a melhor hunt ------------------------------------------------------------------
  // 1.17: análise CONTÍNUA (pedido do André): a cada 20 s, e na hora quando o pokémon em campo ou a
  // hunt mudam. Entrou numa hunt errada (ou trocou o pokémon), o Piloto já vai para a melhor. A
  // margem, o castigo de 12 h e a conferência da troca seguram o vai e volta.
  const CONTINUO_MS = 20_000;
  let ultimaAnalise = 0;
  let analisando = false;
  let ultimoTexto = { txt: '', em: 0 };
  // a mesma conclusão só volta ao diário a cada 10 min (a análise roda o tempo todo)
  const anotarAnalise = (txt, tipo) => {
    if (txt === ultimoTexto.txt && Date.now() - ultimoTexto.em < 10 * 60_000) return;
    ultimoTexto = { txt, em: Date.now() };
    anotar(txt, tipo);
  };
  let vistoPk = null;
  let vistaHunt = null;
  function notarMudanca() {
    const pk = eu?.activeId ?? null;
    const hunt = eu?.huntSlug ?? null;
    if (pk === vistoPk && hunt === vistaHunt) return;
    const primeira = vistoPk === null && vistaHunt === null;
    vistoPk = pk; vistaHunt = hunt;
    // pokémon ou hunt mudou: analisa em ~3 s (o tempo de o estado da hunt nova chegar)
    if (!primeira) ultimaAnalise = Math.min(ultimaAnalise, Date.now() - CONTINUO_MS + 3000);
  }
  async function avaliarHunt(forcar = false) {
    const c = cfg.hunt;
    if (analisando) return;
    if (!forcar && (!c.ligado || ocupado() || !naHunt() || !PIH.cofre?.liberado('hunt'))) return;
    if (forcar && (ocupado() || !naHunt())) return anotar('teste: só funciona caçando numa hunt e sem outra ação em andamento', 'aviso');
    ultimaAnalise = Date.now();
    analisando = true;
    try { await avaliarHuntAgora(c, forcar); } finally { analisando = false; }
  }
  // 1.18 (pedido do André): vai SEMPRE para o 👑 da aba Caçar — o top 1 do ranking do pokémon em
  // campo, no critério que a lista mostra (XP/h ou Ouro/h). Sem margem, sem castigo. Trocou de
  // pokémon: vai para o top 1 dele na hora. Entrou numa hunt que não é o top 1, ou ligou a troca:
  // vai na hora. Só quando você JÁ ESTAVA no top 1 e outra hunt passa à frente (o modelo mexe um
  // pouco a cada nível) é que ela precisa ser top 1 em duas análises seguidas (≈20 s), para não
  // ficar pulando entre duas hunts quase iguais.
  const criterioDaLista = () => { try { return JSON.parse(localStorage.getItem('pokeidle-hunt:prefs:v1'))?.ordem === 'ouro' ? 'ouro' : 'xp'; } catch { return 'xp'; } };
  function melhorDe(linhas, criterio = criterioDaLista()) {
    const c = cfg.hunt;
    const cands = (linhas || []).filter((l) => !l.inviavel && l.liberada && !(c.evitarRisco && arriscada(l)));
    cands.sort((a, b) => valorDe(b, criterio) - valorDe(a, criterio));
    return cands[0] || null;
  }
  // 1.28: a melhor hunt (o 👑 da aba Caçar) de outro pokémon — o rodízio leva o que entra direto
  // para ela, pelo Centro, sem lutar na hunt do anterior.
  async function melhorHuntPara(pkId) {
    const pk = (eu?.pokemons ?? []).find((p) => p.id === Number(pkId));
    if (!pk || !pk.stats) return null;
    const criterio = criterioDaLista();
    const r = await ranking(criterio, pk);
    const m = r ? melhorDe(r.linhas, criterio) : null;
    return m ? { slug: m.slug, nome: m.nome } : null;
  }
  let candidato = null;
  let pkDaAnalise = null;
  let topAnterior = null;
  async function avaliarHuntAgora(c, forcar) {
    const criterio = criterioDaLista();
    const r = await ranking(criterio);
    if (!r) return anotar('sem dados do jogo para analisar', 'aviso');
    const melhor = melhorDe(r.linhas, criterio);
    if (!melhor) return anotarAnalise('nenhuma hunt candidata', 'aviso');
    const pkId = pkAtivo()?.id ?? null;
    const pkMudou = pkDaAnalise !== null && pkDaAnalise !== pkId;
    pkDaAnalise = pkId;
    const un = criterio === 'ouro' ? 'ouro/h' : 'XP/h';
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    const estavaNoTop = topAnterior !== null && topAnterior === eu.huntSlug;
    topAnterior = melhor.slug;
    if (melhor.slug === eu.huntSlug) {
      candidato = null;
      ultimoResultado = `no top 1: ${melhor.nome}`;
      return forcar ? anotar(`análise: você já está no top 1 (${melhor.nome}, ${fmt(valorDe(melhor, criterio))} ${un})`) : anotarAnalise(`análise: você já está no top 1 (${melhor.nome})`);
    }
    if (!c.ligado) {
      return anotarAnalise(`análise: o top 1 é ${melhor.nome} (${fmt(valorDe(melhor, criterio))} ${un}) — ligue a Troca de hunt para ir`, 'aviso');
    }
    const atual = r.linhas.find((l) => l.slug === eu.huntSlug) ?? null;
    const atualRuim = !atual || atual.inviavel || !atual.liberada;
    if (!forcar && !pkMudou && !atualRuim && estavaNoTop && candidato !== melhor.slug) {
      candidato = melhor.slug;
      ultimoResultado = `top 1 agora: ${melhor.nome} — confirmando`;
      return;
    }
    candidato = null;
    cfg.troca = null;
    gravar();
    const vAtual = atual ? valorDe(atual, criterio) : 0;
    const ganho = vAtual > 0 ? (valorDe(melhor, criterio) / vAtual - 1) * 100 : Infinity;
    iniciarRotina({ destino: melhor.slug, curar: c.curar, compras: comprasPendentes(), motivo: `indo para o top 1: ${melhor.nome}${pkMudou ? ' (pokémon trocado)' : ''} (+${Number.isFinite(ganho) ? ganho.toFixed(0) : '∞'}% de ${un})` });
  }

  let ultimoResultado = '';
  // 1.17: clicar no retrato de uma hunt no ranking leva para ela (espera sair de combate). Com a
  // Troca de hunt ligada, se não for a melhor, a análise contínua traz de volta para a melhor.
  function irParaHunt(slug) {
    const h = (welcome?.hunts ?? []).find((x) => x.slug === slug);
    if (!h) return { ok: false, motivo: 'hunt desconhecida' };
    if (eu?.huntSlug === slug && !eu.noCentro) return { ok: false, motivo: 'você já está nela' };
    if (!PIH.cofre?.ligado?.()) return { ok: false, motivo: 'com o Piloto em Off, use o mapa do jogo' };
    if (rotina) { if (rotina.manual && rotina.etapa === 'esperar') encerrar('troca de destino'); else return { ok: false, motivo: 'o Piloto já está indo para outro lugar' }; }
    cfg.troca = null; gravar();
    const ok = iniciarRotina({ destino: slug, curar: false, compras: [], manual: true, motivo: `você escolheu ${h.nome}` });
    return { ok, motivo: ok ? null : 'ocupado' };
  }
  const medidaDe = (m, criterio) => (!m ? null : criterio === 'ouro' ? m.ouro : m.pokemon);

  /**
   * A troca é conferida duas vezes, com o que você MEDIU lá (não o modelo):
   *  - aos ~6 min: o /hunt já mediu as ondas da hunt nova e o ranking se corrige; se agora ele
   *    aponta outra melhor, ou se o medido já está claramente pior que o de antes, sai na hora;
   *  - aos ~35 min: a conferência firme, com meia hora de medida.
   * Se piorou, volta para a hunt anterior e põe a nova de castigo por 12 h.
   */
  async function conferirTroca() {
    // 1.18: desligada — a troca agora segue sempre o top 1 (pedido do André)
    if (cfg.troca) { cfg.troca = null; gravar(); }
    return;
    // eslint-disable-next-line no-unreachable
    const t = cfg.troca;
    if (!t || ocupado() || !cfg.hunt.ligado) return;
    if (pkAtivo()?.id !== t.pkId) { cfg.troca = null; gravar(); return; }
    if (eu?.huntSlug !== t.para) { if (t.em) { cfg.troca = null; gravar(); } return; }
    if (!t.em) { t.em = Date.now(); gravar(); return; } // marca a chegada
    const min = (Date.now() - t.em) / 60_000;
    const un = t.criterio === 'ouro' ? 'ouro/h' : 'XP/h';
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    const castigar = (txt) => {
      cfg.castigo[t.para] = Date.now() + 12 * 3_600_000;
      cfg.troca = null; gravar();
      if (t.de) iniciarRotina({ destino: t.de, curar: false, compras: comprasPendentes(), motivo: txt });
      else anotar(txt, 'aviso');
    };
    if (t.etapa === 0 && min >= 6) {
      t.etapa = 1; gravar();
      const agora = PIH.nivel?.ritmoMedido(t.pkId, Date.now(), t.em);
      const v = medidaDe(agora, t.criterio);
      // margem larga aqui: 5 min de medida ainda balançam bastante
      if (v != null && t.antes && v < t.antes * 0.8) {
        return castigar(`checagem de 5 min: ${nomeHunt(t.para)} está dando ${fmt(v)} ${un}, bem abaixo dos ${fmt(t.antes)} de antes — voltando (12 h de castigo)`);
      }
      anotar(`checagem de 5 min: ${nomeHunt(t.para)} ${v != null ? `está dando ${fmt(v)} ${un}` : 'ainda sem medida'}${t.antes ? ` (antes ${fmt(t.antes)})` : ''} — reanalisando com as ondas medidas`);
      ultimaAnalise = 0; // o ranking já corrigido decide se fica ou vai para outra
      return;
    }
    if (t.etapa === 1 && min >= 35) {
      const agora = PIH.nivel?.ritmoMedido(t.pkId, Date.now(), t.em);
      const v = medidaDe(agora, t.criterio);
      if (v == null || (agora?.minutos ?? 0) < 25) return;
      if (t.antes && v < t.antes * 0.95) {
        return castigar(`conferência de 30 min: ${nomeHunt(t.para)} deu ${fmt(v)} ${un}, abaixo dos ${fmt(t.antes)} de antes — voltando (12 h de castigo)`);
      }
      anotar(`conferência ok: ${nomeHunt(t.para)} deu ${fmt(v)} ${un}${t.antes ? ` (antes ${fmt(t.antes)})` : ''}`, 'ok');
      cfg.troca = null; gravar();
    }
  }

  // ---- 2. reposição ----------------------------------------------------------------------
  /** O que a automação do JOGO usa: as bolas, poções e revives marcados nela. */
  function itensVigiados() {
    const a = eu?.automation ?? {};
    const lista = [];
    for (const id of a.ballIds ?? []) {
      const b = (welcome?.catalogoBolas ?? []).find((x) => x.id === id);
      if (b?.compravel && b.priceGold > 0) lista.push({ chave: `b${id}`, kind: 'ball', id, nome: b.nome, preco: b.priceGold, tem: eu.balls?.[id] ?? 0, cat: 'bola' });
    }
    const itemDe = itemPorId;
    for (const [ids, cat] of [[a.potionIds, 'pocao'], [a.reviveIds, 'revive']]) {
      for (const id of ids ?? []) {
        const it = itemDe(id);
        // Preço de COMPRA é o priceGold; o npcPrice é o que o NPC pagava de volta (o 1.2.0 usava esse).
        const preco = Number(it?.priceGold) || 0;
        if (it && preco > 0) lista.push({ chave: `i${id}`, kind: 'item', id: Number(id), nome: it.name, preco, tem: eu.items?.[id] ?? 0, cat });
      }
    }
    // 1.33: com "Escolher os itens pela conta", só compra os três do kit — mesmo que o jogo ainda
    // esteja com todos marcados (conta nova) ou tenha recusado a troca.
    // 1.36.1 (amigo do André, conta baixa: "quando troca para uma mais fraca, não compra e morre"):
    // a lista era o que está marcado CRUZADO com o kit candidato (o que ainda espera os 10 min para
    // ser aplicado). Na troca, a poção marcada não estava no candidato e o candidato não estava
    // marcado: nenhuma das duas era comprada — e, depois de recarregar a página, sem kit aplicado na
    // memória, nada mesmo. Agora compra o kit APLICADO (marcado ou não); sem kit aplicado ainda, o que
    // está marcado se for um de cada (conta nova, com tudo marcado de fábrica, espera o kit).
    if (cfg.repor.kitAuto !== false) {
      if (kitAtual) {
        const out = [];
        const { bola, pocao, revive } = kitAtual;
        if (bola && bola.compravel !== false && Number(bola.priceGold) > 0) out.push({ chave: `b${bola.id}`, kind: 'ball', id: bola.id, nome: bola.nome, preco: Number(bola.priceGold), tem: eu.balls?.[bola.id] ?? 0, cat: 'bola' });
        for (const [it, cat] of [[pocao, 'pocao'], [revive, 'revive']]) {
          if (it && Number(it.priceGold) > 0) out.push({ chave: `i${it.id}`, kind: 'item', id: Number(it.id), nome: it.name, preco: Number(it.priceGold), tem: eu.items?.[it.id] ?? 0, cat });
        }
        return out;
      }
      const umDeCada = ['ballIds', 'potionIds', 'reviveIds'].every((k) => (a[k] ?? []).length <= 1);
      return umDeCada ? lista : [];
    }
    return lista;
  }
  const PADRAO_ALVO = { bola: { min: 1000, alvo: 10000 }, pocao: { min: 200, alvo: 1000 }, revive: { min: 20, alvo: 100 } };
  // 1.33 (pedido do André): com "Escolher os itens pela conta", as quantidades também vêm da conta:
  // o mínimo é 1 h do que a conta gasta daquele item e o alvo, 6 h — o gasto MEDIDO no inventário
  // (o que saiu sem ser venda nem compra) e, sem medida ainda, o do modelo da hunt atual (bolas = um
  // lançamento por abate com o lançamento automático ligado; poções = dano levado ÷ cura). Conta nova
  // compra pouco e logo; conta grande compra o que de fato usa. O número que você puser no Manual vale.
  const PISO_AUTO = { bola: 30, pocao: 20, revive: 3 };
  function alvoAuto(it) {
    const taxa = consumoPorHora(it.chave) ?? taxaDoModelo(it.cat);
    const min = Math.max(PISO_AUTO[it.cat], Math.ceil(taxa));
    return { min: Math.min(9999, min), alvo: Math.min(9999, Math.max(min * 3, Math.ceil(taxa * 6))), auto: true, taxa };
  }
  function taxaDoModelo(cat) {
    if (cat === 'bola') {
      const lanca = !!(eu?.automation?.autoBallSemParar || eu?.automation?.autoBallAteCapturar || PIH.captura?.resumo?.()?.ligado);
      return lanca ? (kphCache.v > 0 ? kphCache.v : 0) : 0;
    }
    if (cat === 'pocao') return kphCache.pocoesH || 0;
    return Math.max(kphCache.mortesH || 0, 0.2);
  }
  const alvoDe = (it) => {
    const meu = cfg.repor.alvos[it.chave];
    if (meu && (meu.min != null || meu.alvo != null)) return { ...PADRAO_ALVO[it.cat], ...meu };
    return cfg.repor.kitAuto !== false ? alvoAuto(it) : { ...PADRAO_ALVO[it.cat] };
  };

  // ---- 1.33: o gasto medido de cada item (o que saiu do inventário enquanto você caçava) ----------
  // Baldes de 1 h (12 h guardadas): tempo caçando e quanto saiu de cada bola/poção/revive. Subida no
  // estoque é compra (não conta); descida é gasto. A taxa vale com 30+ min caçando nas últimas 6 h.
  const CONSUMO_CHAVE = 'pokeidle-hunt:consumo:v1';
  let consumo = (() => { try { const c = JSON.parse(localStorage.getItem(CONSUMO_CHAVE)); return c && Array.isArray(c.baldes) ? c : { baldes: [], ultimo: {} }; } catch { return { baldes: [], ultimo: {} }; } })();
  let consumoAmostra = 0;
  let consumoGravado = 0;
  const contagens = (e) => {
    const out = {};
    for (const [id, q] of Object.entries(e?.balls ?? {})) out[`b${id}`] = Number(q) || 0;
    for (const [id, q] of Object.entries(e?.items ?? {})) { const n = Number(id); if ((n >= 200 && n <= 206) || pocaoNossa(n)) out[`i${id}`] = Number(q) || 0; }
    return out;
  };
  function registrarConsumo(e, agora = Date.now()) {
    if (consumoAmostra && agora < consumoAmostra) consumoAmostra = 0; // relógio voltou (teste ou ajuste do sistema)
    if (!e || agora - consumoAmostra < 20_000) return;
    const dt = consumoAmostra ? Math.min(agora - consumoAmostra, 120_000) : 0;
    consumoAmostra = agora;
    const hora = Math.floor(agora / 3_600_000);
    let b = consumo.baldes[consumo.baldes.length - 1];
    if (!b || b.h !== hora) { b = consumo.baldes.find((x) => x.h === hora); if (!b) { b = { h: hora, ms: 0, q: {} }; consumo.baldes.push(b); consumo.baldes.sort((x, y) => x.h - y.h); } consumo.baldes = consumo.baldes.filter((x) => Math.abs(hora - x.h) < 12); }
    const cacando = !!e.huntSlug && !e.noCentro;
    if (cacando) b.ms += dt;
    const agoraQ = contagens(e);
    for (const [k, q] of Object.entries(agoraQ)) {
      const antes = consumo.ultimo[k];
      if (cacando && antes != null && q < antes) b.q[k] = (b.q[k] || 0) + (antes - q);
    }
    consumo.ultimo = agoraQ;
    if (agora - consumoGravado > 5 * 60_000) { consumoGravado = agora; try { localStorage.setItem(CONSUMO_CHAVE, JSON.stringify(consumo)); } catch { /* sem armazenamento */ } }
  }
  function consumoPorHora(chave, agora = Date.now()) {
    const hora = Math.floor(agora / 3_600_000);
    const janela = consumo.baldes.filter((x) => x.h <= hora && hora - x.h < 6);
    const ms = janela.reduce((s, x) => s + x.ms, 0);
    if (ms < 30 * 60_000) return null;
    return janela.reduce((s, x) => s + (Number(x.q[chave]) || 0), 0) / (ms / 3_600_000);
  }
  // as poções do jogo que não estão no items.json (a Golden Potion vem no welcome, com cura em %)
  const pocaoNossa = (id) => (welcome?.itensNossos ?? []).some((i) => Number(i?.id) === Number(id) && i.category === 'heal' && Number(i.priceGold) > 0);
  const itemPorId = (id) => jogoCache?.itensPorId?.get(Number(id)) ?? (welcome?.itensNossos ?? []).find((i) => Number(i?.id) === Number(id)) ?? null;
  // a poção que a conta usa agora (a primeira marcada nas Automações) — para o modelo da aba Caçar
  PIH.pocaoDaConta = () => {
    const a = eu?.automation;
    const ids = Array.isArray(a?.potionIds) ? a.potionIds : [];
    const it = ids.map(itemPorId).find((i) => i && Number(i.priceGold) > 0 && (Number(i.healAmount) > 0 || Number(i.healPct) > 0));
    if (!it) return null;
    return { id: it.id, cura: Number(it.healAmount) || 0, curaPct: Number(it.healPct) || 0, preco: Number(it.priceGold), limiar: Number.isFinite(Number(a.hpLimiar)) ? Number(a.hpLimiar) : 0.3 };
  };

  /**
   * O que está abaixo do mínimo, com a quantidade que cabe no ouro acima da reserva.
   * 1.25.1 (relato #1 no GitHub): antes as bolas vinham primeiro e, com pouco ouro (conta nova ou
   * teto do dia baixo), levavam tudo — sem poção nem revive o pokémon morria e a caça parava.
   * 1.36.1: a ordem completa está logo abaixo (sobrevivência primeiro; bolas só com o que sobra).
   */
  const ORDEM_CAT = { revive: 0, pocao: 1, bola: 2 };
  function comprasPendentes() {
    if (!cfg.repor.ligado || !eu) return [];
    // O cofre manda: piso de ouro, teto do dia e teto da categoria. A reserva daqui é um piso a mais.
    const doCofre = PIH.cofre ? PIH.cofre.livre('repor') : 0;
    let livre = Math.min((Number(eu.gold) || 0) - (Number(cfg.repor.reservaOuro) || 0), doCofre);
    const baixos = itensVigiados().map((it) => ({ it, ...alvoDe(it) })).filter((x) => x.it.tem < x.min)
      .sort((a, b) => (ORDEM_CAT[a.it.cat] ?? 9) - (ORDEM_CAT[b.it.cat] ?? 9));
    const qtd = new Map();
    const teto = (x) => Math.min(9999, Math.max(0, x.alvo - x.it.tem)); // o Market vende até 9.999 por compra
    // 1.36.1 (amigo do André, conta baixa, "está morrendo"): as bolas (o alvo delas é 6 h de
    // lançamentos, centenas por hora) levavam quase todo o ouro e, na volta seguinte, não sobrava para a
    // poção boa: o kit descia para a mais fraca e comprava 2. Agora, nesta ordem:
    //   1º revive e poção até o mínimo; 2º bolas até o mínimo; 3º revive e poção até o alvo; 4º bolas
    //   até o alvo. As bolas só usam o que passar de uma reposição inteira de revive + poção (o alvo
    //   de cada um a preço de loja) — esse fôlego fica guardado para a próxima volta. Sem bola o jogo
    //   só não lança; sem poção, o pokémon morre.
    const repartir = (lista, verba) => {
      const falta = lista.map((x) => ({ x, q: teto(x) - (qtd.get(x.it.chave) || 0) })).filter((f) => f.q > 0);
      const custo = falta.reduce((sm, f) => sm + f.q * f.x.it.preco, 0);
      if (!(custo > 0) || !(verba > 0)) return 0;
      const fr = Math.min(1, verba / custo);
      let gasto = 0;
      for (const f of falta) {
        const q = Math.min(f.q, Math.floor(f.q * fr), Math.floor((verba - gasto) / f.x.it.preco));
        if (q > 0) { qtd.set(f.x.it.chave, (qtd.get(f.x.it.chave) || 0) + q); gasto += q * f.x.it.preco; }
      }
      return gasto;
    };
    const vida = baixos.filter((x) => x.it.cat !== 'bola');
    const bolas = baixos.filter((x) => x.it.cat === 'bola');
    // (no Manual valem os mínimos e alvos que você pôs: sem o fôlego guardado)
    const reservaVida = cfg.repor.kitAuto === false ? 0 : itensVigiados().filter((it) => it.cat !== 'bola').reduce((sm, it) => sm + Math.max(0, alvoDe(it).alvo) * it.preco, 0);
    const ateMin = (lista, verbaDe) => {
      for (const x of lista) {
        const q = Math.min(teto(x), Math.max(0, x.min - x.it.tem), Math.floor(Math.max(0, verbaDe()) / x.it.preco));
        if (q > 0) { qtd.set(x.it.chave, q); livre -= q * x.it.preco; }
      }
    };
    ateMin(vida, () => livre);
    // conta nova precisa capturar para montar o time: um punhado de bolas (o piso, 30) passa mesmo
    // sem o fôlego guardado — a sobrevivência mínima já foi comprada acima
    const pisoBolas = bolas.reduce((sm, x) => sm + Math.max(0, Math.min(PISO_AUTO.bola, x.min) - x.it.tem) * x.it.preco, 0);
    ateMin(bolas, () => Math.max(livre - reservaVida, Math.min(livre, pisoBolas)));
    livre -= repartir(vida, livre);
    livre -= repartir(bolas, Math.max(0, livre - reservaVida));
    return baixos.filter((x) => qtd.get(x.it.chave) > 0).map((x) => ({ ...x.it, qty: qtd.get(x.it.chave) }));
  }

  let precisaCentro = false;
  let ultimaReposicao = 0;
  // ---- 1.31: a bola, a poção e o revive escolhidos pela conta (pedido do André) ----------------
  // Com a Reposição ligada, o Piloto deixa marcado nas Automações do jogo UM item de cada — uma
  // bola, uma poção e um revive — e troca conforme a conta sobe, para a reposição só comprar esses.
  // São itens da CONTA (o mesmo para o time inteiro): o melhor geral, não o de um pokémon.
  // 1.33 (pedido do André, "o melhor para todos, pela progressão da conta e do dinheiro"):
  // - Poção: a de menor ouro por HP que REALMENTE cura. A poção do jogo entra quando o HP cai até o
  //   limiar e cura até encher: o que passa do HP que falta (HP médio do time × (1 − limiar)) é
  //   desperdício. Conta com a Golden Potion (cura em %) quando o jogo a vende em ouro. E só entra o
  //   que a conta consegue comprar: o primeiro lote (o mínimo) tem de caber no ouro livre do cofre —
  //   senão desce para a mais barata que cabe.
  // - Revive: o Revive; o Max Revive só quando completar o resto do HP com a poção escolhida sairia
  //   mais caro que a diferença de preço.
  // - Bola: a de maior eficiência que cabe no orçamento por lançamento — o maior entre 5% do ouro/h
  //   e 2% do saldo por dia, dividido pelos lançamentos/h (1.33.2). Beast e Master Ball nunca.
  // Troca quando a mesma escolha aparece duas vezes seguidas (10 min) e no máximo a cada 30 min. A
  // PRIMEIRA vez (o jogo vem com todas as poções e revives marcados) aplica na hora.
  const KIT_ESTAVEL_MS = 10 * 60_000;
  const KIT_INTERVALO_MS = 30 * 60_000;
  let kitVisto = null;
  let kitTrocadoEm = 0;
  let kphCache = { em: 0, v: 0, pocoesH: 0, mortesH: 0 };
  // 1.33: o kit acabou de ser pedido e o jogo ainda não confirmou — a reposição espera (senão compra
  // para TODOS os itens que o jogo marca de fábrica numa conta nova, até Max Revive)
  let kitPedido = null;
  let kitIds = null; // as chaves do último kit escolhido (b<id>, i<id>)
  let kitAtual = null; // 1.34: a bola, a poção e o revive do kit aplicado no jogo (para comprar mesmo desmarcados)
  function escolherKit(teste = {}) {
    if (!eu || !welcome || !jogoCache) return null;
    const time = (eu.pokemons ?? []).filter((p) => p.slot != null && Number(p.maxHp) > 0);
    const hpMedio = time.length ? time.reduce((s, p) => s + Number(p.maxHp), 0) / time.length : 0;
    const limiar = Number.isFinite(Number(eu.automation?.hpLimiar)) ? Math.min(0.95, Math.max(0.05, Number(eu.automation.hpLimiar))) : 0.3;
    const itens = [...(jogoCache.itensPorId?.values() ?? [])];
    const vende = (i) => Number(i.npcPrice) > 0 && Number(i.priceGold) > 0;
    const nossas = (welcome.itensNossos ?? []).filter((i) => i && i.category === 'heal' && Number(i.priceGold) > 0 && Number(i.healPct) > 0);
    const pocoes = [...itens.filter((i) => i.category === 'heal' && vende(i) && Number(i.healAmount) > 0), ...nossas];
    const revives = itens.filter((i) => i.category === 'revive' && vende(i) && Number(i.revivePct) > 0).sort((a, b) => a.revivePct - b.revivePct);
    const bolas = (welcome.catalogoBolas ?? []).filter((b) => b && b.compravel !== false && Number(b.priceGold) > 0 && !/beast|master/i.test(String(b.nome || ''))).sort((a, b) => a.priceGold - b.priceGold);
    if (!pocoes.length || !revives.length || !bolas.length) return null;
    const falta = Math.max(1, hpMedio * (1 - limiar));
    const cura = (i) => (Number(i.healPct) > 0 ? Number(i.healPct) * hpMedio : Number(i.healAmount));
    const util = (i) => Math.max(1, Math.min(cura(i), falta));
    // ouro livre para a reposição agora (o que o cofre deixa); o teste pode passar outro
    const livre = teste.livre ?? Math.min((Number(eu.gold) || 0) - (Number(cfg.repor.reservaOuro) || 0), PIH.cofre ? PIH.cofre.livre('repor') : Infinity);
    // 1.36.1: o item que já está marcado e ainda tem o mínimo em estoque "cabe" — sem isso, logo
    // depois de uma compra (ouro livre baixo) o kit descia para a poção mais fraca sem precisar.
    const marcado = (i, cat) => {
      const ids = cat === 'bola' ? eu.automation?.ballIds : cat === 'pocao' ? eu.automation?.potionIds : eu.automation?.reviveIds;
      return Array.isArray(ids) && ids.map(Number).includes(Number(i.id));
    };
    const estoque = (i, cat) => Number((cat === 'bola' ? eu.balls : eu.items)?.[i.id]) || 0;
    const cabe = (i, cat) => livre >= PISO_AUTO[cat] * Number(i.priceGold) || (marcado(i, cat) && estoque(i, cat) >= PISO_AUTO[cat]);
    const porUtil = (i) => Number(i.priceGold) / util(i);
    const ordenadas = [...pocoes].sort((a, b) => porUtil(a) - porUtil(b) || cura(b) - cura(a));
    const baratas = [...pocoes].sort((a, b) => a.priceGold - b.priceGold);
    const pocao = hpMedio ? (ordenadas.find((i) => cabe(i, 'pocao')) ?? baratas[0]) : baratas[0];
    const porHp = Number(pocao.priceGold) / util(pocao);
    const reviveBase = revives[0];
    let revive = reviveBase;
    for (const rv of revives.slice(1)) {
      const extraHp = (Number(rv.revivePct) - Number(reviveBase.revivePct)) * hpMedio;
      if (extraHp * porHp > Number(rv.priceGold) - Number(reviveBase.priceGold) && cabe(rv, 'revive')) revive = rv;
    }
    // 1.33.2 (o André: "a conta ficou alta e marcou Super Ball em vez de Ultra"): a bola olhava só o
    // ouro/h medido, que despenca quando o ativo é um pokémon fraco subindo de nível (Larvitar no
    // Pichu: ~5 mil/h), mesmo com 160 mi no saldo. Agora o orçamento das bolas é o MAIOR entre 5% do
    // ouro/h e 2% do saldo por dia, dividido pelos lançamentos por hora (o gasto medido de bolas;
    // sem medida, os abates/h da hunt com o lançamento automático ligado). Dentro do orçamento, a de
    // maior eficiência (Ultra 4, Super 3, Great 2, Poke 1 no catálogo de 27/10/2026).
    const ouroH = teste.ouroH ?? (Number(PIH.cofre?.resumo?.()?.ouroH) || 0);
    const saldo = teste.saldo ?? (Number(eu.gold) || 0);
    const kph = kphCache.v > 0 ? kphCache.v : 400; // abates/h do ativo nesta hunt (modelo do /hunt)
    const lanca = !!(eu.automation?.autoBallSemParar || eu.automation?.autoBallAteCapturar || PIH.captura?.resumo?.()?.ligado);
    const medidas = bolas.map((b) => consumoPorHora(`b${b.id}`)).filter((x) => x != null);
    const lancamentosH = teste.lancamentosH ?? (medidas.length ? Math.max(1, medidas.reduce((a, b) => a + b, 0)) : (lanca ? kph : 1));
    const orcamentoH = Math.max(ouroH * 0.05, (saldo * 0.02) / 24);
    const porBola = orcamentoH / Math.max(1, lancamentosH);
    const daBolsa = bolas.filter((b) => b.priceGold <= porBola && cabe(b, 'bola'));
    const bola = daBolsa.length ? daBolsa.sort((a, b) => (Number(b.catchRate) || 0) - (Number(a.catchRate) || 0) || b.priceGold - a.priceGold)[0] : bolas[0];
    return { bola, pocao, revive, hpMedio: Math.round(hpMedio), porBola: Math.round(porBola), lancamentosH: Math.round(lancamentosH), limiar };
  }
  async function conferirKit(forcar = false) {
    if (!cfg.repor.ligado || cfg.repor.kitAuto === false || !eu || !PIH.cofre?.liberado('hunt')) return null;
    if (Date.now() - kphCache.em > 10 * 60_000 && eu.huntSlug && eu.activeId != null) {
      kphCache.em = Date.now();
      try {
        const at = (eu.pokemons ?? []).find((p) => p.id === eu.activeId);
        const m = at ? await farmDe([at], eu.huntSlug) : null;
        const v = m && m.get(at.id);
        if (v && v.kph > 0) kphCache = { ...kphCache, v: v.kph, pocoesH: v.pocoesH || 0, mortesH: v.mortesH || 0 };
      } catch { /* fica o anterior */ }
    }
    const k = escolherKit();
    if (!k) return null;
    kitIds = new Set([`b${k.bola.id}`, `i${k.pocao.id}`, `i${k.revive.id}`]);
    const a = eu.automation ?? {};
    const igual = (ids, id) => Array.isArray(ids) && ids.length === 1 && Number(ids[0]) === Number(id);
    if (igual(a.ballIds, k.bola.id) && igual(a.potionIds, k.pocao.id) && igual(a.reviveIds, k.revive.id)) { kitVisto = null; kitAtual = k; return k; }
    const chave = `${k.bola.id}/${k.pocao.id}/${k.revive.id}`;
    const agora = Date.now();
    // a primeira vez (conta nova vem com tudo marcado, ou um item só não está marcado): na hora
    const primeira = !kitTrocadoEm && !(igual(a.potionIds, a.potionIds?.[0]) && igual(a.reviveIds, a.reviveIds?.[0]) && igual(a.ballIds, a.ballIds?.[0]));
    // 1.36.1: troca URGENTE — o item marcado de uma categoria que muda está abaixo do mínimo (vai
    // precisar comprar agora). Comprar o antigo para trocar daqui a 10-40 min é desperdício, e não
    // comprar nenhum deixa o pokémon morrer: troca já e compra o novo.
    const urgente = (() => {
      const pares = [['ballIds', k.bola, 'bola', 'b', eu.balls], ['potionIds', k.pocao, 'pocao', 'i', eu.items], ['reviveIds', k.revive, 'revive', 'i', eu.items]];
      for (const [campo, novo, cat, pre, est] of pares) {
        if (igual(a[campo], novo.id)) continue;
        const ids = a[campo] ?? [];
        if (!ids.length) return true; // nada marcado nessa categoria
        const tem = ids.reduce((sm, id) => sm + (Number(est?.[id]) || 0), 0);
        const min = Math.max(PISO_AUTO[cat], Math.ceil(consumoPorHora(`${pre}${ids[0]}`) ?? taxaDoModelo(cat)));
        if (tem < min) return true;
      }
      return false;
    })();
    if (!forcar && !primeira && !urgente) {
      if (!kitVisto || kitVisto.chave !== chave) { kitVisto = { chave, em: agora }; return k; }
      if (agora - kitVisto.em < KIT_ESTAVEL_MS || agora - kitTrocadoEm < KIT_INTERVALO_MS) return k;
    }
    kitTrocadoEm = agora;
    kitVisto = null;
    kitPedido = { em: agora, ids: [`b${k.bola.id}`, `i${k.pocao.id}`, `i${k.revive.id}`] };
    PIH.pedir({ t: 'auto.set', ballIds: [k.bola.id], potionIds: [k.pocao.id], reviveIds: [k.revive.id] }, 'hunt');
    kitAtual = k; // só o kit que foi de fato mandado ao jogo (o candidato ainda esperando os 10 min não compra)
    anotar(`automações do jogo: ${k.bola.nome}, ${k.pocao.name} e ${k.revive.name} (um de cada, pela conta: HP médio ${nf.format(k.hpMedio)}${k.porBola ? `, até ${nf.format(k.porBola)} de ouro por bola` : ''})`, 'ok');
    return k;
  }

  async function avaliarReposicao(forcar = false) {
    const c = cfg.repor;
    if (!forcar && (!c.ligado || ocupado() || !PIH.cofre?.liberado('hunt'))) return;
    ultimaReposicao = Date.now();
    await carregarCatalogo();
    try { await conferirKit(forcar); } catch (err) { anotar(`erro ao escolher os itens: ${err.message}`, 'erro'); }
    if (kitPedido) {
      const a = eu?.automation ?? {};
      const marcados = new Set([...(a.ballIds ?? []).map((id) => `b${id}`), ...(a.potionIds ?? []).map((id) => `i${id}`), ...(a.reviveIds ?? []).map((id) => `i${id}`)]);
      // 1.34: item do kit sem estoque o jogo não deixa marcado — conta como confirmado (a compra vem agora)
      const zerado = (x) => (x[0] === 'b' ? eu?.balls?.[x.slice(1)] : eu?.items?.[x.slice(1)]) ? false : true;
      const confirmou = [...marcados].every((x) => kitPedido.ids.includes(x)) && kitPedido.ids.every((x) => marcados.has(x) || zerado(x));
      if (!confirmou && Date.now() - kitPedido.em < 60_000) { setTimeout(() => { ultimaReposicao = 0; }, 4000); return; }
      kitPedido = null;
    }
    const lista = comprasPendentes();
    if (!lista.length) { if (forcar) anotar('reposição: nada abaixo do mínimo (ou ouro só até a reserva)'); return; }
    if (precisaCentro || eu?.noCentro) {
      // 1.25.1 (relatos #1 e #2): comprava e ficava parado no Centro. Agora compra, cura e volta.
      if (eu?.noCentro) {
        if (ultimaHunt && !ocupado()) return iniciarRotina({ destino: ultimaHunt, curar: true, compras: lista, motivo: `reposição: comprando no Centro e voltando para ${nomeHunt(ultimaHunt)}` });
        return comprar(lista);
      }
      if (c.irAoCentro && naHunt()) return iniciarRotina({ destino: eu.huntSlug, curar: cfg.hunt.curar, compras: lista, motivo: 'reposição: indo ao Centro comprar' });
      return anotar('reposição: o jogo só vende no Centro — ligue "ir ao Centro para comprar"', 'aviso');
    }
    // primeiro tenta comprar de onde está; se o servidor recusar, passa a comprar no Centro.
    // Os 6 s contam a partir do envio de verdade (a fila pode segurar o pedido), e ouro que caiu
    // também conta como compra feita: senão compra em dobro (auditoria, caso E).
    const antes = new Map(lista.map((x) => [x.chave, x.tem]));
    const ouroAntes = Number(eu.gold) || 0;
    const t0 = Date.now();
    let ultimoEnvio = 0;
    const solta = PIH.on('piloto.enviado', (m) => { if (m.t === 'shop.buy' && m.origem === 'hunt') ultimoEnvio = m.em; });
    comprar(lista);
    const conferir = () => {
      if (!ultimoEnvio && Date.now() - t0 < 30_000) { setTimeout(conferir, 1000); return; }
      if (ultimoEnvio && Date.now() - ultimoEnvio < 6000) { setTimeout(conferir, 1000); return; }
      solta();
      const subiu = itensVigiados().some((x) => (antes.has(x.chave) && x.tem > antes.get(x.chave))) || (Number(eu.gold) || 0) < ouroAntes;
      if (!subiu) {
        precisaCentro = true;
        const erro = erroDepoisDe(t0);
        anotar(`reposição: a compra fora do Centro não entrou${erro ? ` (${erro})` : ''} — daqui em diante compra no Centro`, 'aviso');
        if (c.irAoCentro && naHunt() && !ocupado()) iniciarRotina({ destino: eu.huntSlug, curar: cfg.hunt.curar, compras: comprasPendentes(), motivo: 'reposição: indo ao Centro comprar' });
      }
    };
    setTimeout(conferir, 1000);
  }

  let jogoCache = null;
  async function carregarCatalogo() { if (!jogoCache) jogoCache = await PIH.carregarJogo().catch(() => null); return jogoCache; }

  // ---- relógio ---------------------------------------------------------------------------
  // 1.25.1 (relatos #1 e #2 no GitHub): a vigia do Centro. Parado no Centro sem nada do Piloto em
  // andamento (o jogo mandou para lá, a compra terminou, a volta falhou) — com a Troca de hunt ou a
  // Reposição ligada e você sem mexer na página — o Piloto cura e volta para a última hunt. Se a
  // volta falhar de novo, a espera seguinte cresce (1,5 → 3 → 5 → 10 min), sem desistir.
  let ultimaHunt = null;
  let centroDesde = null;
  let centroFalhou = 0;
  let mexeuEm = 0;
  for (const t of ['pointerdown', 'keydown']) { try { root.addEventListener(t, () => { mexeuEm = Date.now(); }, { capture: true, passive: true }); } catch { /* sem janela */ } }
  const ESPERA_CENTRO_S = [90, 180, 300, 600];
  function vigiaCentro(agora) {
    if (!eu?.noCentro) { centroDesde = null; if (naHunt()) centroFalhou = 0; return; }
    centroDesde ??= agora;
    if (ocupado() || !ultimaHunt || !(cfg.hunt.ligado || cfg.repor.ligado) || !PIH.cofre?.liberado('hunt')) return;
    const espera = ESPERA_CENTRO_S[Math.min(centroFalhou, ESPERA_CENTRO_S.length - 1)] * 1000;
    if (agora - centroDesde < espera || agora - mexeuEm < 60_000) return;
    centroDesde = agora;
    iniciarRotina({ destino: ultimaHunt, curar: true, compras: comprasPendentes(), motivo: `parado no Centro: curando e voltando para ${nomeHunt(ultimaHunt)}` });
  }
  PIH.on('estado', (e) => { eu = e; if (naHunt()) ultimaHunt = e.huntSlug; notarMudanca(); passo(); try { registrarConsumo(e); } catch { /* sem medida */ } });
  setInterval(() => {
    try {
      passo();
      vigiaCentro(Date.now());
      const agora = Date.now();
      if (cfg.hunt.ligado && agora - ultimaAnalise > CONTINUO_MS) avaliarHunt().catch((err) => anotar(`erro na análise: ${err.message}`, 'erro'));
      if (cfg.repor.ligado && agora - ultimaReposicao > cfg.repor.intervaloMin * 60_000) avaliarReposicao().catch((err) => anotar(`erro na reposição: ${err.message}`, 'erro'));
      conferirTroca().catch((err) => anotar(`erro na conferência: ${err.message}`, 'erro'));
    } catch (err) { console.error('[pokeidle-hunt/auto]', err); }
  }, 2000);

  // ---- a aba ------------------------------------------------------------------------------
  const nf = new Intl.NumberFormat('pt-BR');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // Em minutos (com o painel refazendo a cada 1 s, segundos trocariam a aba inteira toda hora).
  const quanto = (ms) => (ms <= 0 ? 'agora' : ms < 60_000 ? 'menos de 1 min' : `${Math.ceil(ms / 60_000)} min`);

  function html() {
    const h = cfg.hunt;
    const p = cfg.repor;
    const agora = Date.now();
    const itens = eu ? itensVigiados() : [];
    const linhasItens = itens.length
      ? itens.map((it) => {
        const a = alvoDe(it);
        const baixo = it.tem < a.min;
        return `<tr><td>${esc(it.nome)}</td><td class="${baixo ? 'pih-alerta' : ''}">${nf.format(it.tem)}</td>
          <td><input type="number" min="0" step="1" value="${a.min}" data-alvo="${it.chave}" data-campo="min"></td>
          <td><input type="number" min="0" step="1" value="${a.alvo}" data-alvo="${it.chave}" data-campo="alvo"></td>
          <td>${nf.format(it.preco)}</td></tr>`;
      }).join('')
      : '<tr><td colspan="5" class="pih-dim">Marque bolas, poções e revives nas Automações do jogo.</td></tr>';
    const castigos = Object.entries(cfg.castigo).filter(([, ate]) => ate > agora);
    const K = PIH.kit;
    const sel = (k, v, ops) => `<select data-cfg="${k}">${ops.map(([o, r]) => `<option value="${o}" ${v === o ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
    const num = (k, v, min, max, step) => `<input type="number" min="${min}" ${max != null ? `max="${max}"` : ''} step="${step}" value="${v}" data-cfg="${k}">`;
    const cx = (k, v) => `<input type="checkbox" data-cfg="${k}" ${v ? 'checked' : ''}>`;
    const extra = [
      h.ligado ? 'análise contínua' : '',
      castigos.length ? `de castigo: ${castigos.map(([sl, ate]) => `${esc(nomeHunt(sl))} (${quanto(ate - agora)})`).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    const hunt = K.cartao({
      icone: 'cacar', titulo: 'Melhor hunt',
      dica: 'Vai sozinho para a hunt que mais rende. Espera sair de combate (trava de 3 s do jogo) antes de mudar.',
      interruptor: cx('hunt.ligado', h.ligado),
      acoes: K.botao('Analisar', 'data-acao="testar-hunt"'),
      corpo: `<div class="plt-linha">
          ${K.campo('Critério', sel('hunt.criterio', h.criterio, [['xp', 'XP/h'], ['ouro', 'Ouro/h']]))}
          ${K.campo('Margem %', num('hunt.margemPct', h.margemPct, 0, 200, 1), 'Só troca se a outra render pelo menos isso a mais')}
        </div>
        <div class="plt-linha">
          ${K.opcao(cx('hunt.curar', h.curar), 'Curar antes', 'Passa no Centro e cura antes de ir')}
          ${K.opcao(cx('hunt.evitarRisco', h.evitarRisco), 'Evitar risco', 'Fora hunts com 1 hit, mortes estimadas ou golpe que tira 50%+ do HP')}
          ${K.opcao(cx('hunt.conferir', h.conferir), 'Conferir troca', 'Aos 5 e aos 30 min refaz a conta com o medido e volta se piorou')}
        </div>${extra ? `<p class="plt-nota">${extra}</p>` : ''}`,
    });
    const repor = K.cartao({
      icone: 'repor', titulo: 'Reposição',
      dica: 'Repõe as bolas, poções e revives marcados nas Automações do jogo, sempre dentro do cofre.',
      interruptor: cx('repor.ligado', p.ligado),
      acoes: K.botao('Conferir', 'data-acao="testar-repor"'),
      corpo: `<div class="plt-linha">
          ${K.campo('Guardar (ouro)', num('repor.reservaOuro', p.reservaOuro, 0, null, 100000), 'Nunca gasta abaixo disso')}
          ${K.campo('A cada (min)', num('repor.intervaloMin', p.intervaloMin, 1, 60, 1))}
          ${K.opcao(cx('repor.irAoCentro', p.irAoCentro), 'Ir ao Centro', 'Se o jogo só vender no Centro: vai, compra, cura e volta')}
        </div>
        <table class="pih-tab pih-auto-tab"><thead><tr><th>Item</th><th>Tem</th><th>Mín.</th><th>Até</th><th>Preço</th></tr></thead><tbody>${linhasItens}</tbody></table>`,
    });
    const diarioHtml = K.cartao({
      icone: 'relogio', titulo: 'Diário', acoes: `<span class="pih-dim">${rotina ? esc(rotina.motivo) : 'parado'}</span>`,
      corpo: `<ul class="pih-diario">${diario.length ? diario.map((d) => `<li class="pih-d-${d.tipo}"><span>${hora(d.t)}</span> ${esc(d.txt)}</li>`).join('') : '<li class="pih-dim">nada ainda</li>'}</ul>`,
    });
    return hunt + repor + diarioHtml;
  }

  // ---- 1.13: as duas linhas da caça na aba Caçar (troca de hunt e reposição) ------------------
  function linhas(modo = 'manual') {
    const K = PIH.kit;
    const manual = modo === 'manual';
    const trava = modo === 'desligado';
    const h = cfg.hunt;
    const p = cfg.repor;
    const agora = Date.now();
    const itens = eu ? itensVigiados() : [];
    const baixos = itens.filter((it) => it.tem < alvoDe(it).min);
    const castigos = Object.entries(cfg.castigo).filter(([, ate]) => ate > agora);
    const stHunt = h.ligado ? [`top 1 em ${criterioDaLista() === 'ouro' ? 'Ouro/h' : 'XP/h'} · análise contínua`, ultimoResultado ? esc(ultimoResultado) : '',
      castigos.length ? `de castigo: ${castigos.map(([sl]) => esc(nomeHunt(sl))).join(', ')}` : '', rotina ? esc(rotina.motivo) : ''].filter(Boolean).join(' · ') : '';
    const stRepor = p.ligado ? (itens.length ? (baixos.length ? `baixo: ${baixos.map((x) => esc(x.nome)).join(', ')}` : `${itens.length} itens em dia`) : 'marque bolas e poções nas Automações do jogo') : '';
    const tabela = itens.length
      ? `<table class="plt-tab"><thead><tr><th>Item</th><th>Tem</th><th>Mínimo</th><th>Repõe até</th><th>Preço</th></tr></thead><tbody>${itens.map((it) => {
        const a = alvoDe(it);
        return `<tr><td>${esc(it.nome)}</td><td class="${it.tem < a.min ? 'pih-alerta' : ''}">${nf.format(it.tem)}</td>
          <td>${K.numero(`auto:alvo.${it.chave}.min`, a.min, 0, null, 1, trava)}</td><td>${K.numero(`auto:alvo.${it.chave}.alvo`, a.alvo, 0, null, 1, trava)}</td><td>${nf.format(it.preco)}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="plt-nota">Marque bolas, poções e revives nas Automações do jogo.</p>';
    return K.linha({ icone: 'cacar', nome: 'Troca de hunt', alvo: 'auto:hunt.ligado', on: h.ligado, trava, status: stHunt,
      dica: 'Vai sempre para o 👑 do ranking lá embaixo — o top 1 do pokémon em campo. Analisa o tempo todo (a cada 20 s, e na hora em que o pokémon em campo ou a hunt mudam); trocou de pokémon, vai para o top 1 dele. Espera sair de combate (trava de 3 s do jogo) antes de mudar. Para caçar uma hunt específica (capturar um pokémon), desligue: ao religar, ele volta para a melhor na hora.',
      ajustes: manual ? `${K.fcampo('Top 1 por', K.escala('ui:ordem', criterioDaLista(), [['xp', 'XP/h'], ['ouro', 'Ouro/h']], trava), 'O mesmo "Ordenar por" do ranking lá embaixo: o 👑 é o destino')}
        <span class="plt-f-quebra"></span>
        ${K.mini('auto:hunt.curar', h.curar, 'Curar antes', 'Passa no Centro e cura antes de ir', trava)}
        ${K.mini('auto:hunt.evitarRisco', h.evitarRisco, 'Evitar risco', 'Fora hunts com 1 hit, mortes estimadas ou golpe que tira 50%+ do HP', trava)}
        ${K.acao('Analisar agora', 'data-acao="testar-hunt"', 'cacar', trava)}` : '' })
      + K.linha({ icone: 'repor', nome: 'Reposição', alvo: 'auto:repor.ligado', on: p.ligado, trava, status: stRepor,
        dica: 'Repõe as bolas, poções e revives marcados nas Automações do jogo, sempre dentro do cofre. Com "Escolher os itens pela conta" (ligado no Auto), o Piloto deixa marcado um de cada (uma bola, uma poção e um revive) e troca conforme a conta e o ouro sobem: a poção de menor ouro por HP que cura de verdade, o revive pelo custo e a bola pelo ouro/h e pelo saldo. As quantidades também vêm da conta: o mínimo é 1 h do que você gasta de cada item e o alvo, 6 h. Conta nova compra o primeiro lote assim que tiver o ouro.',
        ajustes: manual ? `${K.fcampo('Guardar (ouro)', K.numero('auto:repor.reservaOuro', p.reservaOuro, 0, null, 100000, trava), 'Nunca gasta abaixo disso')}
          ${K.fcampo('A cada (min)', K.numero('auto:repor.intervaloMin', p.intervaloMin, 1, 60, 1, trava))}
          ${K.mini('auto:repor.irAoCentro', p.irAoCentro, 'Ir ao Centro', 'Se o jogo só vender no Centro: vai, compra, cura e volta', trava)}
          ${K.mini('auto:repor.kitAuto', p.kitAuto !== false, 'Escolher os itens pela conta', 'Deixa marcado nas Automações do jogo uma bola, uma poção e um revive, troca conforme a conta sobe e compra pelo que a conta gasta', trava)}
          ${K.acao('Conferir agora', 'data-acao="testar-repor"', 'repor', trava)}
          <div class="plt-f-largo">${tabela}</div>` : '' });
  }

  // Mudança vinda do painel. "alvo.<chave>.<campo>" são os mínimos e alvos da reposição.
  function definir(caminho, v) {
    const partes = caminho.split('.');
    if (partes[0] === 'alvo') {
      const [, k, campo] = partes;
      cfg.repor.alvos[k] = { ...(cfg.repor.alvos[k] ?? {}), [campo]: Math.max(0, Math.round(Number(v) || 0)) };
      gravar();
      return;
    }
    const [grupo, campo] = partes;
    if (!cfg[grupo] || !(campo in cfg[grupo])) return;
    cfg[grupo][campo] = v;
    if (grupo === 'hunt' && campo === 'ligado' && v) { ultimaAnalise = 0; topAnterior = null; candidato = null; anotar('troca automática de hunt ligada'); PIH.metaCaca?.desligar?.('a Troca de hunt foi ligada'); }
    if (grupo === 'repor' && campo === 'ligado' && v) { ultimaReposicao = 0; anotar('reposição ligada'); }
    gravar();
  }
  const acoes = {
    'testar-hunt': () => avaliarHunt(true).catch((e) => anotar(e.message, 'erro')),
    'testar-repor': () => avaliarReposicao(true).catch((e) => anotar(e.message, 'erro')),
  };

  function ligar(painel, redesenhar) {
    for (const el of painel.querySelectorAll('[data-cfg]')) {
      el.addEventListener('change', () => {
        const [grupo, campo] = el.dataset.cfg.split('.');
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value.trim() === '' ? NaN : Number(el.value)) : el.value;
        if (el.type === 'number') {
          // 1.12.3: vazio não vira 0 (com 0 min a análise rodaria a cada 2 s); vale o mínimo do campo.
          if (!Number.isFinite(v)) { redesenhar(); return; }
          v = Math.max(Number(el.min) || 0, el.max !== '' ? Math.min(Number(el.max), v) : v);
        }
        cfg[grupo][campo] = v;
        if (grupo === 'hunt' && campo === 'ligado' && v) { ultimaAnalise = 0; topAnterior = null; candidato = null; anotar('troca automática de hunt ligada'); PIH.metaCaca?.desligar?.('a Troca de hunt foi ligada'); }
        if (grupo === 'repor' && campo === 'ligado' && v) { ultimaReposicao = 0; anotar('reposição ligada'); }
        gravar();
        redesenhar();
      });
    }
    for (const el of painel.querySelectorAll('[data-alvo]')) {
      el.addEventListener('change', () => {
        const k = el.dataset.alvo;
        cfg.repor.alvos[k] = { ...(cfg.repor.alvos[k] ?? {}), [el.dataset.campo]: Math.max(0, Math.round(Number(el.value) || 0)) };
        gravar();
        redesenhar();
      });
    }
    painel.querySelector('[data-acao="testar-hunt"]')?.addEventListener('click', () => avaliarHunt(true).then(redesenhar).catch((e) => anotar(e.message, 'erro')));
    painel.querySelector('[data-acao="testar-repor"]')?.addEventListener('click', () => avaliarReposicao(true).then(redesenhar).catch((e) => anotar(e.message, 'erro')));
  }

  // Perfil do botão único (Automático): liga as frentes sem mexer no resto da configuração.
  function aplicar(m) {
    if (m?.hunt) { Object.assign(cfg.hunt, { ligado: !!m.hunt.ligado }); if (m.hunt.ligado) PIH.metaCaca?.desligar?.('a Troca de hunt foi ligada'); }
    if (m?.repor) Object.assign(cfg.repor, { ligado: !!m.repor.ligado });
    gravar();
  }
  PIH.auto = { html, ligar, aplicar, linhas, definir, acoes, farmDe, irParaHunt, melhorDe, irAoCentroEVoltar, irAoCentroEFicar, caronaNoCentro, liberarCentro, melhorHuntPara, cancelarIdaManual, rotinaAtual: () => (rotina ? { etapa: rotina.etapa, manual: !!rotina.manual, desde: rotina.desde, motivo: rotina.motivo } : null), diario: () => diario.slice(), proximaAnalise: () => ultimaAnalise + CONTINUO_MS, ultimoResultado: () => ultimoResultado, alvoDe, _interno: { alvoAuto, consumoPorHora, registrarConsumo, consumo: () => consumo, kphCache: () => kphCache, comprasPendentes, itensVigiados, escolherKit, conferirKit, cfg: () => cfg, passo, rotina: () => rotina, vigiaCentro, centro: () => ({ ultimaHunt, centroDesde, centroFalhou }), forcarCentro: (o) => { if ('centroDesde' in o) centroDesde = o.centroDesde; if ('mexeuEm' in o) mexeuEm = o.mexeuEm; } } };
})(globalThis);
