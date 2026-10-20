// A ROTINA: o que o jogo não faz sozinho e que dá para fazer sem você.
//
// Tudo começa DESLIGADO. Cada tarefa manda os mesmos comandos dos botões do jogo, um por vez (no
// máximo um comando a cada tique de 20 s), pela fila do hook (limitador de taxa) e pelo cofre.
// O servidor confere tudo de novo: o que ele recusa não gasta nada e entra no diário; três
// recusas seguidas desligam a rotina inteira (disjuntor do cofre).
//
//  Tarefa             Comando                  Custo                Reversível?
//  Passe diário       passe.resgatar           zero                 sim
//  XP Share           xpshare.escolher         zero                 sim
//  Tier da Outland    outland.tier             zero                 sim (mesmo XP, drops ×1 a ×8)
//  Rodízio de treino  team.active              zero                 sim
//  Evoluir            pokemon.evoluir          1 pedra              NÃO
//  Chocadeira         chocadeira.colocar       o ovo que você tem   NÃO (compra de ovo: categoria "ovos" do cofre)
//  Limpar o Depot     oferenda.tudo / shop.sellAllPokemons          NÃO
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt = root.__pokeidleHunt || {});
  if (!PIH.on || !PIH.pedir) return;

  const CHAVE = 'piloto:rotina:v1';
  const PADRAO = {
    passe: { ligado: false },
    xpshare: { ligado: false, trocarAtivo: true },
    outland: { ligado: false },
    rodizio: { ligado: false, modo: 'atrasado', intervaloMin: 20, difNivel: 5 },
    evoluir: { ligado: false, escopo: 'equipe', ramificada: false },
    chocadeira: { ligado: false, comprarP2: false },
    depot: { modo: 'off', limiar: 50, horas: 1 },
    pvp: { fila: false, time: false },
  };
  const ler = () => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE)) || {};
      const out = {};
      for (const k of Object.keys(PADRAO)) out[k] = { ...PADRAO[k], ...(s.cfg && s.cfg[k]) };
      return { cfg: out, marcas: s.marcas || {} };
    } catch { return { cfg: structuredClone(PADRAO), marcas: {} }; }
  };
  let { cfg, marcas } = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify({ cfg, marcas })); } catch { /* sem armazenamento */ } };

  const diario = (txt, tipo) => (PIH.cofre ? PIH.cofre.diario(`rotina: ${txt}`, tipo) : console.info('[piloto/rotina]', txt));
  const ID_XP_SHARE_HELD = 70050;
  const OVOS = [[70094, 'shiny', 'Ovo Shiny'], [70093, 'p4', 'Mystery Egg P4'], [70092, 'p3', 'Mystery Egg P3'], [70091, 'p2', 'Mystery Egg P2']];

  let eu = null;
  let welcome = null;
  PIH.on('welcome', (m) => { welcome = m; });
  PIH.on('estado', (e) => { eu = e; });

  // ---- PvP Ranqueado (1.2.1) ------------------------------------------------------------------
  // O servidor manda o guarda-chuva `pvp` (resposta do pvp.info e de cada ação): equipe salva,
  // fila, recusas. A rotina guarda o que precisa para não repetir pedido à toa.
  const PVP_NIVEL_MIN = 150; // shared/pvp-rank.mjs
  const PVP_TIME_MAX = 5;
  const pvp = { time: null, fila: null, lidoEm: 0, recusaEm: 0, recusa: null, esperaAte: 0 };
  PIH.on('pvp', (m) => {
    if (!m || typeof m !== 'object') return;
    if (Array.isArray(m.time)) { pvp.time = m.time.map(Number); pvp.lidoEm = Date.now(); }
    if (Array.isArray(m.timeSalvo)) { pvp.time = m.timeSalvo.map(Number); diario(`PvP: equipe salva (${pvp.time.length})`, 'ok'); }
    // 1.12.3: resposta de leitura sem "fila" (ou fila null) = fora da fila; antes a fila nunca era tentada.
    if ((Array.isArray(m.time) || 'fila' in m) && !(m.fila && typeof m.fila === 'object')) pvp.fila = { ...(pvp.fila || {}), na: false };
    if (m.fila && typeof m.fila === 'object') {
      pvp.fila = { ...(pvp.fila || {}), ...m.fila };
      if (Number(m.fila.cooldownMs) > 0) pvp.esperaAte = Date.now() + Number(m.fila.cooldownMs);
    }
    if (m.filaRecusa) {
      pvp.esperaAte = Date.now() + Math.max(Number(m.filaRecusa.restaMs) || 0, 5 * 60_000);
      diario(`PvP: o jogo recusou a fila — ${m.filaRecusa.msg || 'sem motivo'}`, 'aviso');
    }
    if (m.recusa) { pvp.recusaEm = Date.now(); pvp.recusa = m.recusa.msg || m.recusa; diario(`PvP: equipe recusada — ${pvp.recusa}`, 'aviso'); }
    if (m.filaAutoDesligada) diario('PvP: o jogo desligou a fila automática (equipe vazia ou nível)', 'aviso');
  });

  // Os módulos do jogo que a rotina usa, importados ao vivo como o resto do piloto.
  let mods = null;
  async function modulos() {
    if (mods) return mods;
    // 1.12.3: cada módulo por si — se o jogo renomear um, só a tarefa que depende dele para.
    const imp = (p) => import(`${location.origin}/shared/${p}.mjs`).catch((e) => { console.warn('[piloto] módulo do jogo não carregou:', p, e); return null; });
    const [passe, outland, ramif, teto, choc, colecao, pedras] = await Promise.all([
      imp('passe-batalha'), imp('outland-tiers'), imp('evolucoes-ramificadas'), imp('teto-captura'), imp('chocadeira'), imp('auto-colecao'), imp('pedras-evolucao'),
    ]);
    const m = { passe, outland, ramif, teto, choc, colecao, pedras };
    if (Object.values(m).every(Boolean)) mods = m; // só guarda quando veio tudo; senão tenta de novo depois
    return m;
  }

  const agoraServidor = () => Number(eu && eu.servidorAgora) || Date.now();
  const equipe = () => (eu && eu.pokemons || []).filter((p) => p.slot != null);
  const ativo = () => (eu && eu.pokemons || []).find((p) => p.id === eu.activeId) || null;
  const naHunt = () => !!eu && !!eu.huntSlug && !eu.noCentro && !(eu.casa && eu.casa.dentro) && !(eu.boss && eu.boss.arena) && !eu.mistico && !(eu.safari && eu.safari.dentro);
  const huntAtual = () => (welcome && welcome.hunts || []).find((h) => h.slug === (eu && eu.huntSlug)) || null;
  const venceu = (k, ms) => Date.now() - (Number(marcas[k]) || 0) >= ms;
  const marcar = (k) => { marcas[k] = Date.now(); gravar(); };

  function pedir(obj, txt) {
    const r = PIH.pedir(obj, 'rotina');
    diario(r.ok ? txt : `${txt} — recusado: ${r.motivo}`, r.ok ? 'ok' : 'aviso');
    return r.ok;
  }

  // ---- tarefas: cada uma devolve true se mandou um comando (aí o tique para por aqui) ----------

  async function tarefaPasse() {
    if (!cfg.passe.ligado || !venceu('passe', 10 * 60_000)) return false;
    const m = await modulos();
    if ((eu.level || 0) < (m.passe.PASSE_NIVEL_MIN || 10)) return false;
    const st = m.passe.estadoDoPasse({ passe: eu.passe }, agoraServidor());
    if (st.jaPegouHoje && !st.vipPendenteHoje) return false;
    marcar('passe');
    return pedir({ t: 'passe.resgatar' }, 'resgatando o Passe de Batalha de hoje');
  }

  function tarefaXpShare() {
    if (!cfg.xpshare.ligado || !venceu('xpshare', 60_000)) return false;
    const casas = (eu.casa && eu.casa.lista || []).filter((c) => !c.anunciada && c.emUso !== false);
    if (!casas.length) return false;
    const ocupados = new Set();
    for (const c of casas) for (const id of c.postos || []) if (id) ocupados.add(id);
    const at = ativo();
    // Os mais atrasados primeiro: são os que mais ganham com a fatia.
    const candidatos = equipe()
      .filter((p) => p.id !== (at && at.id) && Number(p.heldItemId) !== ID_XP_SHARE_HELD && !ocupados.has(p.id))
      .sort((a, b) => (a.level || 0) - (b.level || 0));
    for (const c of casas) {
      const n = Math.max((c.postos || []).length, c.rar === 'lendaria' ? 2 : 1);
      for (let slot = 0; slot < n; slot++) {
        const dono = (c.postos || [])[slot] || null;
        // O registrado que está lutando não ganha nada (já leva os 100%): troca por quem está parado.
        const inutil = dono && at && dono === at.id && cfg.xpshare.trocarAtivo;
        if (dono && !inutil) continue;
        const pk = candidatos.shift();
        if (!pk) return false;
        marcar('xpshare');
        return pedir({ t: 'xpshare.escolher', casaId: c.id, slot, pokemonId: pk.id }, `XP Share: ${pk.nome} (Nv ${pk.level}) no posto ${slot + 1} da casa #${c.id}`);
      }
    }
    return false;
  }

  async function tarefaOutland() {
    if (!cfg.outland.ligado || !naHunt() || !venceu('outland', 30_000)) return false;
    const h = huntAtual();
    if (!h || (h.area !== 'outland' && h.regiao !== 'outland')) return false;
    const m = await modulos();
    const alvo = m.outland.tierOutlandValido(8, eu.level || 0);
    const atual = Number(eu.outlandTier) || 1;
    if (alvo <= atual) return false;
    marcar('outland');
    return pedir({ t: 'outland.tier', tier: alvo }, `Outland ${atual} → Outland ${alvo} (mesmo XP e ouro, drops raros ×${m.outland.multOutlandTier(alvo)})`);
  }

  async function tarefaRodizio() {
    const c = cfg.rodizio;
    if (!c.ligado || !naHunt() || !PIH.engine || !venceu('rodizio', c.intervaloMin * 60_000)) return false;
    if (PIH.auto && PIH.auto._interno.rotina()) return false; // a troca de hunt está andando
    const h = huntAtual();
    const at = ativo();
    if (!h || !at || !welcome) return false;
    marcar('rodizio');
    const jogo = await PIH.carregarJogo();
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem: jogo.precoItem, hunts: [h],
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu, geo: (slug) => (PIH.geo ? PIH.geo.daHunt(slug) : null), ritmoMedido: () => null,
    };
    const linhas = [];
    for (const pk of equipe()) {
      if (!pk.stats || (pk.hp != null && Number(pk.hp) <= 0) || (pk.level || 0) > (eu.level || 0) + 5) continue;
      try {
        const r = PIH.engine.analisar(pk, ctx, { soLiberadas: false, comPocao: true });
        const l = r.linhas[0];
        if (l && !l.inviavel && !l.umHit && l.mortesH < 0.2 && l.hitPct < 0.5) linhas.push({ pk, l });
      } catch { /* sem dados desse pokémon */ }
    }
    if (!linhas.length) return false;
    let escolha = null;
    if (c.modo === 'xp') {
      escolha = linhas.sort((a, b) => b.l.xpPokemonH - a.l.xpPokemonH)[0];
      const doAtivo = linhas.find((x) => x.pk.id === at.id);
      if (doAtivo && escolha.l.xpPokemonH < doAtivo.l.xpPokemonH * 1.1) return false;
    } else {
      escolha = linhas.sort((a, b) => (a.pk.level || 0) - (b.pk.level || 0))[0];
      if ((escolha.pk.level || 0) > (at.level || 0) - c.difNivel) return false;
    }
    if (!escolha || escolha.pk.id === at.id) return false;
    return pedir({ t: 'team.active', pokemonId: escolha.pk.id }, `rodízio: ${escolha.pk.nome} (Nv ${escolha.pk.level}) entra no lugar de ${at.nome} (Nv ${at.level}) — mata em ${escolha.l.ttk.toFixed(1)} s aqui`);
  }

  let evoCatalogo = null;
  async function catalogoEvolucao() {
    if (evoCatalogo) return evoCatalogo;
    const m = await modulos();
    const jogo = await PIH.carregarJogo();
    // Uma cópia: a escada do teto de captura muda o nível pedido pelos elos (como no cliente).
    const lista = [...jogo.especies.values()].map((e) => ({ ...e }));
    const porId = new Map(lista.map((e) => [e.pokeId, e]));
    try { m.teto.aplicarTetoDeCaptura(lista, (id) => porId.get(id)); } catch { /* segue com o nível do catálogo */ }
    evoCatalogo = { porId, jogo };
    return evoCatalogo;
  }
  function pedraDe(tipo, jogo) {
    const doServidor = welcome && welcome.pedrasEvolucao && welcome.pedrasEvolucao[tipo];
    if (doServidor && doServidor.itemId) return { itemId: Number(doServidor.itemId), nome: doServidor.nome || doServidor.name };
    // Reserva: a pedra pelo nome no catálogo de itens (shared/pedras-evolucao.mjs dá o nome).
    const nome = mods && mods.pedras && mods.pedras.PEDRA_POR_TIPO[tipo];
    if (!nome) return null;
    for (const [id, it] of jogo.itensPorId) if (it.name === nome && it.category === 'stone') return { itemId: id, nome };
    return null;
  }

  async function tarefaEvoluir() {
    if (!cfg.evoluir.ligado || !venceu('evoluir', 60_000)) return false;
    const m = await modulos();
    const { porId, jogo } = await catalogoEvolucao();
    const lista = cfg.evoluir.escopo === 'tudo' ? (eu.pokemons || []) : equipe();
    const noXpShare = new Set();
    for (const c of (eu.casa && eu.casa.lista) || []) for (const id of c.postos || []) if (id) noXpShare.add(id);
    for (const pk of lista) {
      if (pk.shiny || pk.speciesId >= 2000) continue; // shiny pede Shiny Stone; Outland e Mega não evoluem
      // Fora também o que alguém cuidou à mão: starter, skin, refino, item segurado, posto de XP Share.
      if (pk.starter || pk.skin || pk.heldItemId != null || noXpShare.has(pk.id)) continue;
      if (Object.values(pk.refino || {}).some((v) => Number(v) > 0) || Number(pk.refinoTotal) > 0) continue;
      if (!venceu(`evo:${pk.id}`, 24 * 3_600_000)) continue;
      const esp = porId.get(pk.speciesId);
      if (!esp || !esp.evolvesToId) continue;
      const destinos = m.ramif.destinosDeEvolucao(esp, (id) => porId.get(id)).filter((d) => d.temArte && (pk.level || 0) >= d.nivel);
      if (!destinos.length || (destinos.length > 1 && !cfg.evoluir.ramificada)) continue;
      const d = destinos[0];
      const pedra = pedraDe(m.ramif.tipoDaPedraDeEvolucao(esp, d.especie), jogo);
      // Pedra que o radar comprou para revender não é gasta aqui (auditoria, item 5).
      if (!pedra) continue;
      const tem = Number((eu.items || {})[pedra.itemId]) || 0;
      if (tem - PIH.itensReservados(pedra.itemId, tem) < 1) continue;
      marcar('evoluir');
      marcar(`evo:${pk.id}`); // não tenta de novo o mesmo por 24 h, dê certo ou não
      return pedir({ t: 'pokemon.evoluir', pokemonId: pk.id, alvoId: d.pokeId }, `evoluindo ${pk.nome} (Nv ${pk.level}) → ${d.especie.name} com 1× ${pedra.nome || 'pedra'}`);
    }
    return false;
  }

  async function tarefaChocadeira() {
    if (!cfg.chocadeira.ligado || !venceu('chocadeira', 5 * 60_000)) return false;
    const m = await modulos();
    const ch = m.choc.normalizarChocadeira(eu.chocadeira);
    const slot = m.choc.primeiroSlotLivre(ch);
    if (slot === null || slot === undefined) return false;
    marcar('chocadeira');
    for (const [itemId, ovo, nome] of OVOS) {
      if ((eu.items || {})[itemId] > 0) return pedir({ t: 'chocadeira.colocar', slot, ovo }, `chocadeira ${slot + 1}: ${nome}`);
    }
    if (cfg.chocadeira.comprarP2) return pedir({ t: 'shop.buy', kind: 'item', id: 70091, qty: 1 }, 'comprando 1× Mystery Egg P2 (100M, categoria "ovos" do cofre)');
    return false;
  }

  // Limpar o Depot (1.10): o mesmo "Vender todo o Depot" do jogo (shop.sellAllPokemons com o
  // maior id visto, como o botão), ou a Oferenda. O servidor já deixa de fora shiny, P5, lendário,
  // Coleção, equipes, refinados, quem tem TM ou item e quem segura a Exp. Share. Com a regra
  // "Nota mínima" do Auto Coleção ligada, os bons vão para a Coleção antes e ficam protegidos —
  // sem ela, vende igual ao botão (o diário avisa uma vez por dia).
  // 1.12.4 (lido no jogo de verdade): o "Vender todo o Depot" vende o Depot inteiro menos a
  // Coleção, o ativo e quem segura a Exp. Share — shiny e P5 SÓ entram num aviso da confirmação, e
  // a equipe do PvP (que mora no Depot) não é protegida. Antes de vender, o Piloto leva para a
  // Coleção (colecao.mover, um por tique) a equipe do PvP salva e a que ele vai montar, os shiny e
  // os P5. Enquanto sobrar algum desses fora da Coleção, não vende.
  const POTENCIA_MAX = 5;
  function protegidosDoDepot(livres) {
    const ids = new Set(pvp.time || []);
    if (cfg.pvp.time && Array.isArray(pvp.time)) for (const p of equipeAlvo(pvp.time)) ids.add(p.id);
    return livres.filter((p) => ids.has(p.id) || p.shiny || Number(p.potencia) >= POTENCIA_MAX);
  }
  async function tarefaDepot() {
    const c = cfg.depot;
    if (c.modo === 'off' || !venceu('depot', c.horas * 3_600_000)) return false;
    const travados = new Set(((eu.automation && eu.automation.pokemonTravado) || []).map(Number));
    const depot = (eu.pokemons || []).filter((p) => p.slot == null && p.id !== eu.activeId && !travados.has(Number(p.id)) && Number(p.heldItemId) !== ID_XP_SHARE_HELD);
    if (depot.length < c.limiar) return false;
    // Sem a equipe do PvP lida ainda (com o PvP ligado): espera — não dá para saber quem proteger.
    if ((cfg.pvp.time || cfg.pvp.fila) && (eu.level || 0) >= PVP_NIVEL_MIN && pvp.time === null) return false;
    const guardar = protegidosDoDepot(depot);
    if (guardar.length) {
      const p = guardar.find((x) => venceu(`col:${x.id}`, 2 * 60_000));
      if (!p) {
        if (venceu('depotProtegeAviso', 60 * 60_000)) { marcar('depotProtegeAviso'); diario(`Depot: ${guardar.length} pokémon para proteger não entraram na Coleção — venda segurada`, 'aviso'); }
        return false;
      }
      marcar(`col:${p.id}`);
      const motivo = (pvp.time || []).includes(p.id) ? 'equipe do PvP' : p.shiny ? 'shiny' : Number(p.potencia) >= POTENCIA_MAX ? 'P5' : 'equipe do PvP';
      return pedir({ t: 'colecao.mover', pokemonId: p.id, para: 'colecao' }, `Depot: guardando ${p.nome} (${motivo}) na Coleção antes de vender`);
    }
    const mods0 = await modulos();
    let ac = null;
    try { ac = mods0.colecao ? mods0.colecao.autoColecaoEfetiva(eu.automation || {}) : null; } catch { ac = null; }
    const comNota = !!(ac && ac.nota && ac.nota.on);
    if (!comNota && venceu('depotAvisoNota', 24 * 3_600_000)) {
      marcar('depotAvisoNota');
      diario('Depot: a regra "Nota mínima" do Auto Coleção está desligada — vendo igual ao botão "Vender todo o Depot" (o Piloto guarda antes na Coleção a equipe do PvP, os shiny e os P5).', 'aviso');
    }
    if (c.modo === 'oferenda') {
      if (!comNota) return false; // a Oferenda do jogo só gira com a nota mínima definida
      const ok = pedir({ t: 'oferenda.tudo' }, `Depot com ${depot.length}: Oferendar tudo abaixo da nota do Auto Coleção`);
      if (ok) marcar('depot');
      return ok;
    }
    if (c.modo === 'vender') {
      const ateId = depot.reduce((mx, p) => Math.max(mx, Number(p.id) || 0), 0);
      if (!ateId) return false;
      const ok = pedir({ t: 'shop.sellAllPokemons', ateId }, `Depot com ${depot.length}: vender tudo ao NPC${comNota ? ` (Auto Coleção guarda os de nota alta)` : ''}`);
      // Só conta como feito se saiu; recusado, tenta de novo no próximo tique de 20 s... no máximo a cada 5 min.
      if (ok) marcar('depot');
      else { marcas.depot = Date.now() - c.horas * 3_600_000 + 5 * 60_000; gravar(); }
      return ok;
    }
    return false;
  }

  // A equipe do PvP (1.12.2): sempre os 5 de maior Poder (o número que o jogo mostra na montagem),
  // o mais forte abrindo — mas sem roleta. Quem já está na equipe só sai quando aparece alguém de
  // fora com 2% ou mais de Poder acima do MAIS FRACO da equipe; empate ou diferença mínima (um
  // pontinho de XP) não troca. A análise é contínua (a cada tique, só com dados locais); o
  // salvamento sai no máximo a cada 10 min.
  const MARGEM_PVP = 1.02;
  const poderDe = (p) => Number(p && p.poder) || 0;
  function candidatosDoPvp() {
    return (eu.pokemons || [])
      .filter((p) => p && Number.isInteger(p.id) && poderDe(p) > 0 && !p.ovo)
      .sort((a, b) => poderDe(b) - poderDe(a));
  }
  function equipeAlvo(atualIds) {
    const candidatos = candidatosDoPvp();
    const porId = new Map(candidatos.map((p) => [p.id, p]));
    const equipe = [];
    for (const id of atualIds) { const p = porId.get(id); if (p && !equipe.includes(p) && equipe.length < PVP_TIME_MAX) equipe.push(p); }
    for (const c of candidatos) { if (equipe.length >= PVP_TIME_MAX) break; if (!equipe.includes(c)) equipe.push(c); }
    for (const c of candidatos) {
      if (equipe.includes(c)) continue;
      const fraco = equipe.reduce((m, p) => (poderDe(p) < poderDe(m) ? p : m), equipe[0]);
      if (!fraco || poderDe(c) <= poderDe(fraco) * MARGEM_PVP) break; // os próximos são mais fracos ainda
      equipe[equipe.indexOf(fraco)] = c;
    }
    return equipe.sort((a, b) => poderDe(b) - poderDe(a));
  }
  function tarefaPvpTime() {
    if (!cfg.pvp.time || (eu.level || 0) < PVP_NIVEL_MIN) return false;
    // Sem a equipe salva lida ainda: pede o pvp.info (leitura) no máximo a cada 10 min.
    if (pvp.time === null || Date.now() - pvp.lidoEm > 30 * 60_000) {
      if (!venceu('pvpInfo', 10 * 60_000)) return false;
      marcar('pvpInfo');
      return pedir({ t: 'pvp.info' }, 'PvP: lendo equipe e fila');
    }
    if (Date.now() - pvp.recusaEm < 30 * 60_000 || !venceu('pvpTime', 10 * 60_000)) return false;
    const alvo = equipeAlvo(pvp.time);
    if (!alvo.length) return false;
    const novo = alvo.map((p) => p.id);
    const atual = new Set(pvp.time);
    const mesmoConjunto = novo.length === pvp.time.length && novo.every((id) => atual.has(id));
    // Mesmo time: só reordena se quem abre ficou bem para trás (5%) do mais forte.
    if (mesmoConjunto) {
      const porId = new Map(alvo.map((p) => [p.id, p]));
      const abre = porId.get(pvp.time[0]);
      if (!abre || poderDe(abre) >= poderDe(alvo[0]) * 0.95) return false;
    }
    const entram = alvo.filter((p) => !atual.has(p.id));
    marcar('pvpTime');
    return pedir({ t: 'pvp.time.salvar', pokemonIds: novo }, `PvP: equipe ${alvo.map((p) => `${p.nome} (⚔ ${Math.round(poderDe(p)).toLocaleString('pt-BR')})`).join(', ')}${entram.length && pvp.time.length ? ` — entra ${entram.map((p) => p.nome).join(', ')}` : ''}`);
  }
  // A fila: com VIP, liga a fila automática do jogo (ela volta sozinha depois de cada partida);
  // sem VIP, ou com ela desligada pelo jogo, entra na fila quando estiver fora dela.
  function tarefaPvpFila() {
    if (!cfg.pvp.fila || (eu.level || 0) < PVP_NIVEL_MIN || Date.now() < pvp.esperaAte) return false;
    if (cfg.pvp.time && (!pvp.time || !pvp.time.length)) return false; // a equipe vem antes
    const vip = !!(eu.loja && eu.loja.vip);
    if (vip && eu.automation && eu.automation.pvpAutoFila !== true && venceu('pvpAuto', 10 * 60_000)) {
      marcar('pvpAuto');
      return pedir({ t: 'auto.set', pvpAutoFila: true }, 'PvP: ligando a fila automática (VIP)');
    }
    if (pvp.fila && pvp.fila.na) return false;
    if (pvp.fila === null) {
      if (!venceu('pvpInfo', 10 * 60_000)) return false;
      marcar('pvpInfo');
      return pedir({ t: 'pvp.info' }, 'PvP: lendo a fila');
    }
    if (!venceu('pvpFila', 3 * 60_000)) return false;
    marcar('pvpFila');
    return pedir({ t: 'pvp.fila.entrar' }, 'PvP: entrando na fila do Ranqueado');
  }

  const TAREFAS = [tarefaPasse, tarefaPvpTime, tarefaPvpFila, tarefaXpShare, tarefaOutland, tarefaRodizio, tarefaChocadeira, tarefaEvoluir, tarefaDepot];
  let rodando = false;
  async function tique() {
    if (rodando || !eu || !welcome || !PIH.cofre || !PIH.cofre.liberado('rotina')) return;
    rodando = true;
    try {
      for (const t of TAREFAS) {
        try { if (await t()) break; } catch (e) { diario(`erro em ${t.name}: ${e.message}`, 'erro'); }
      }
    } finally { rodando = false; }
  }
  setInterval(tique, 20_000);

  // ---- aba Rotina ------------------------------------------------------------------------------
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const cx = (k, label, titulo = '') => `<label title="${esc(titulo)}"><input type="checkbox" data-rot="${k}" ${k.split('.').reduce((o, p) => o[p], cfg) ? 'checked' : ''}> ${label}</label>`;

  // ---- a aba Rotina (1.13): linhas da janela Configurações do jogo ------------------------------
  // modo: 'automatico' só os interruptores e o que está acontecendo; 'manual' também os ajustes;
  // 'desligado' o mesmo do automático, travado.
  const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const nfR = new Intl.NumberFormat('pt-BR');
  function html(modo = 'manual') {
    const K = PIH.kit;
    const manual = modo === 'manual';
    const trava = modo === 'desligado';
    const L = (o) => K.linha({ trava, ...o, ajustes: manual ? o.ajustes : '' });
    const r = cfg.rodizio;
    const d = cfg.depot;
    const travados = new Set(((eu && eu.automation && eu.automation.pokemonTravado) || []).map(Number));
    const noDepot = (eu && eu.pokemons || []).filter((p) => p.slot == null && p.id !== eu.activeId && !travados.has(Number(p.id))).length;
    const pv = eu && eu.pvp;
    const tier = pv ? `${String(pv.tierId || '').replace(/^./, (c) => c.toUpperCase())} ${pv.divisaoNum || ''} · ${nfR.format(pv.pontos || 0)} PR` : '';
    const somaPvp = Array.isArray(pvp.time) ? pvp.time.reduce((s2, id) => s2 + (Number(((eu && eu.pokemons) || []).find((p) => p.id === id)?.poder) || 0), 0) : 0;
    const nivelPvp = (eu && eu.level || 0) >= PVP_NIVEL_MIN;
    return `
      ${K.grupo('Todo dia')}
      ${L({ icone: 'passe', nome: 'Passe diário', alvo: 'rotina:passe.ligado', on: cfg.passe.ligado, dica: 'Resgata o prêmio do dia do Passe de Batalha (perder um dia volta a trilha ao Dia 1).', status: marcas.passe ? `último resgate às ${hhmm(marcas.passe)}` : '' })}
      ${L({ icone: 'outland', nome: 'Tier da Outland', alvo: 'rotina:outland.ligado', on: cfg.outland.ligado, dica: 'Na Outland, sobe para o maior tier liberado: mesmo XP e ouro, drops raros ×1 a ×8.', status: eu && eu.outlandTier ? `tier ${eu.outlandTier}` : '' })}
      ${L({ icone: 'xpshare', nome: 'XP Share', alvo: 'rotina:xpshare.ligado', on: cfg.xpshare.ligado, dica: 'Põe nos postos vazios da casa quem está mais atrasado na equipe.',
        ajustes: K.mini('rotina:xpshare.trocarAtivo', cfg.xpshare.trocarAtivo, 'Tirar quem luta', 'O registrado que está lutando não ganha a fatia', trava) })}
      ${L({ icone: 'nivel', nome: 'Rodízio da equipe', alvo: 'rotina:rodizio.ligado', on: r.ligado, dica: 'Troca o pokémon ativo por outro da equipe que mata com segurança na hunt atual.',
        status: r.ligado ? `${r.modo === 'xp' ? 'quem rende mais XP/h' : 'o mais atrasado'} · a cada ${r.intervaloMin} min` : '',
        ajustes: `${K.fcampo('Quem entra', K.escala('rotina:rodizio.modo', r.modo, [['atrasado', 'Mais atrasado'], ['xp', 'Mais XP/h']], trava))}${K.fcampo('A cada (min)', K.numero('rotina:rodizio.intervaloMin', r.intervaloMin, 10, 240, 5, trava))}` })}
      ${K.grupo('PvP Ranqueado')}
      ${L({ icone: 'pvp', nome: 'Equipe dos 5 mais fortes', alvo: 'rotina:pvp.time', on: cfg.pvp.time, dica: 'Os 5 de maior Poder, o mais forte abrindo. Só troca quando aparece um pokémon com 2% ou mais de Poder acima do mais fraco da equipe. Treinador Nv 150+.',
        status: !nivelPvp ? 'treinador abaixo do Nv 150' : somaPvp ? `Poder somado ${nfR.format(Math.round(somaPvp))}${tier ? ` · ${tier}` : ''}` : tier })}
      ${L({ icone: 'radar', nome: 'Fila automática', alvo: 'rotina:pvp.fila', on: cfg.pvp.fila, dica: 'Com VIP liga a fila automática do jogo; sem VIP, entra na fila quando estiver fora (no máximo a cada 3 min).',
        status: pvp.fila ? (pvp.fila.na ? 'na fila agora' : 'fora da fila') : '' })}
      ${K.grupo('Sem volta')}
      ${L({ icone: 'evoluir', nome: 'Evoluir', classe: 'plt-l-perigo', alvo: 'rotina:evoluir.ligado', on: cfg.evoluir.ligado, dica: 'Evolui quem tem nível e pedra na mochila. Nunca shiny, Outland nem Mega. Um por minuto.',
        status: cfg.evoluir.ligado ? (cfg.evoluir.escopo === 'tudo' ? 'equipe, Depot e Coleção' : 'só a equipe') : '',
        ajustes: `${K.fcampo('Quem', K.escala('rotina:evoluir.escopo', cfg.evoluir.escopo, [['equipe', 'Só a equipe'], ['tudo', 'Todos']], trava))}${K.mini('rotina:evoluir.ramificada', cfg.evoluir.ramificada, 'Cadeias com escolha', 'Eevee e outras: vai para o primeiro destino', trava)}` })}
      ${L({ icone: 'ovo', nome: 'Chocadeira', classe: 'plt-l-perigo', alvo: 'rotina:chocadeira.ligado', on: cfg.chocadeira.ligado, dica: 'Põe na chocadeira o ovo que você tem (Shiny, P4, P3, P2).',
        ajustes: K.mini('rotina:chocadeira.comprarP2', cfg.chocadeira.comprarP2, 'Comprar P2 (100 mi)', 'Só com teto da categoria "ovos" no Cofre (padrão 0 = proibido)', trava) })}
      ${L({ icone: 'depot', nome: 'Limpar o Depot', classe: 'plt-l-perigo', alvo: 'rotina:depot.ligado', on: d.modo !== 'off', dica: 'Igual ao botão "Vender todo o Depot" do jogo. Antes de vender, guarda na Coleção a equipe do PvP, os shiny e os P5. A Coleção, o ativo e quem segura a Exp. Share nunca vão.',
        status: `${nfR.format(noDepot)} no Depot${d.modo !== 'off' ? ` · ${d.modo === 'oferenda' ? 'oferenda' : 'vende'} a partir de ${nfR.format(d.limiar)}` : ''}`,
        ajustes: `${K.fcampo('Como', K.escala('rotina:depot.modo', d.modo === 'off' ? (d.ultimoModo || 'vender') : d.modo, [['vender', 'Vender ao NPC'], ['oferenda', 'Oferenda']], trava))}${K.fcampo('A partir de', K.numero('rotina:depot.limiar', d.limiar, 20, 5000, 10, trava))}${K.fcampo('A cada (h)', K.numero('rotina:depot.horas', d.horas, 1, 72, 1, trava))}` })}`;
  }

  function setCaminho(caminho, v) {
    const [g, k] = caminho.split('.');
    cfg[g][k] = v;
    gravar();
  }
  // Uma mudança vinda do painel (interruptor, escolha ou número). Números já chegam validados.
  function definir(caminho, v) {
    if (caminho === 'depot.ligado') {
      if (v) cfg.depot.modo = cfg.depot.ultimoModo || 'vender';
      else { if (cfg.depot.modo !== 'off') cfg.depot.ultimoModo = cfg.depot.modo; cfg.depot.modo = 'off'; }
      gravar();
      diario(`Limpar o Depot ${v ? 'ligado' : 'desligado'}`);
      return;
    }
    if (caminho === 'depot.modo') { cfg.depot.ultimoModo = v; if (cfg.depot.modo !== 'off') cfg.depot.modo = v; gravar(); return; }
    setCaminho(caminho, v);
    if (typeof v === 'boolean') diario(`${caminho} ${v ? 'ligado' : 'desligado'}`);
  }
  function ligar() { /* 1.13: o painel roteia as mudanças por definir() */ }

  // Perfil do botão único: só as tarefas sem custo e reversíveis (Passe, XP Share, Outland).
  // Evoluir, chocadeira e Depot são irreversíveis e ficam como você deixou.
  function aplicar(m) {
    for (const k of ['passe', 'xpshare', 'outland']) if (m && k in m) cfg[k].ligado = !!m[k];
    if (m && 'pvp' in m) { cfg.pvp.fila = !!m.pvp; cfg.pvp.time = !!m.pvp; }
    if (m && m.depotVender && cfg.depot.modo === 'off') { cfg.depot.modo = 'vender'; cfg.depot.limiar = Math.min(cfg.depot.limiar, 50); cfg.depot.horas = Math.min(cfg.depot.horas, 1); }
    gravar();
  }
  PIH.rotina = { html, ligar, aplicar, definir, _interno: { cfg: () => cfg, tique, TAREFAS, marcas: () => marcas } };
})(globalThis);
