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
    rodizio: { ligado: false, modo: 'ciclo', intervaloMin: 60, difNivel: 5 }, // 1.22: um de cada vez, a cada hora
    evoluir: { ligado: false, escopo: 'equipe', ramificada: false, comprarPedra: true },
    chocadeira: { ligado: false, comprarP2: false },
    depot: { modo: 'off', limiar: 50, horas: 1 },
    pvp: { fila: false, time: false, mini: true },
    autoColecao: { ligado: true }, // 1.18: todo mundo com a extensão (pedido do André)
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
  // 1.34.1: o rastro da Coleção sem saída (tarefaColecaoBaixa, mais abaixo)
  const COL_NV_MERCADO = 50;
  const COL_JANELA_MS = 15_000;
  let colVistos = null; // ids já vistos nesta sessão (o que já existia ao abrir nunca entra)
  const colPendentes = new Map(); // id -> quando apareceu (esperando o cadeado da regra)
  const colRegra = new Map(); // id -> quando entrou sozinho na Coleção
  let colRastreadoEm = 0;
  let colMaxId = 0; // só id maior que todos os já vistos é captura nova (lista parcial nunca vira 'nova')
  PIH.on('estado', (e) => { eu = e; try { rastrearColecao(); } catch (err) { console.warn('[piloto] coleção:', err); } });
  // 1.36.0: subiu de nível ou a pedra chegou → confere a evolução na hora (não espera o tique de 20 s).
  let evoAssin = '', evoTimer = null;
  PIH.on('estado', () => {
    try {
      if (!evoluirLigado()) return;
      const a = equipe().map((p) => `${p.id}:${p.speciesId}:${p.level}`).join(',') + '|' + JSON.stringify((eu && eu.items) || {});
      if (a === evoAssin) return;
      evoAssin = a;
      clearTimeout(evoTimer);
      evoTimer = setTimeout(() => { Promise.resolve().then(tique).catch(() => { /* segue */ }); }, 2500);
    } catch { /* segue */ }
  });

  // ---- PvP Ranqueado (1.2.1) ------------------------------------------------------------------
  // O servidor manda o guarda-chuva `pvp` (resposta do pvp.info e de cada ação): equipe salva,
  // fila, recusas. A rotina guarda o que precisa para não repetir pedido à toa.
  const PVP_NIVEL_MIN = 150; // shared/pvp-rank.mjs
  const PVP_TIME_MAX = 5;
  const pvp = { time: null, fila: null, lidoEm: 0, recusaEm: 0, recusa: null, esperaAte: 0 };
  // 1.34.1 (pedido do André): o resultado da última ranqueada ao lado do rank (os PR que entraram ou
  // saíram), sem abrir o PvP. Vem do mesmo 'pvp' do jogo: a partida ao vivo (m.partida) ou as que
  // terminaram com você fora (m.naoVistas).
  const CHAVE_PVP_ULT = 'piloto:pvp:ultima';
  let pvpUlt = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_PVP_ULT) || 'null'); } catch { return null; } })();
  // A partida AO VIVO só aparece depois que o próprio jogo revela o resultado (fim da fita, o
  // termômetro de rank, ou ninguém assistindo) — o jogo esconde o +18 até o fim de propósito.
  let pvpEspera = null;
  function anotarPartida(p, aoVivo = false) {
    if (!p || typeof p !== 'object' || !Number.isFinite(Number(p.delta))) return;
    const id = p.id != null ? String(p.id) : null;
    if (id && ((pvpUlt && pvpUlt.id === id) || (pvpEspera && pvpEspera.id === id))) return;
    const r = { id, venci: !!p.venci, delta: Math.round(Number(p.delta)), oponente: String((p.oponente && p.oponente.nick) || p.oponente || '').slice(0, 30), em: Date.now() };
    if (aoVivo) { pvpEspera = r; return; }
    pvpEspera = null;
    gravarPvpUlt(r);
  }
  function gravarPvpUlt(r) {
    pvpUlt = r;
    try { localStorage.setItem(CHAVE_PVP_ULT, JSON.stringify(pvpUlt)); } catch { /* sem armazenamento */ }
    pintarPvpUlt();
  }
  function conferirRevelado() {
    if (!pvpEspera) return;
    const vis = (id) => { const e = document.getElementById(id); return !!(e && !e.classList.contains('hidden') && !e.hidden); };
    const assistindo = vis('pvp-mini') || vis('gwr');
    const revelou = vis('pvp-mini-res') || vis('pvp-tick') || vis('gwr-pvp-resultado');
    const t = Date.now() - pvpEspera.em;
    if (revelou || (!assistindo && t > 15_000) || t > 6 * 60_000) gravarPvpUlt(pvpEspera), pvpEspera = null;
  }
  setInterval(() => { try { conferirRevelado(); } catch { /* sem a tela do jogo */ } }, 1000);
  function pintarPvpUlt() {
    const box = document.getElementById('tr-rank-box');
    const pr = document.getElementById('tr-rank-pr');
    if (!box || !pr || !pvpUlt) return;
    let el = box.querySelector('.plt-pvp-ult');
    if (!el) { el = document.createElement('span'); el.className = 'plt-pvp-ult'; pr.after(el); }
    const d = pvpUlt.delta;
    const txt = `${d >= 0 ? '▲' : '▼'} ${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`;
    const l = (PIH.idioma && PIH.idioma.atual && PIH.idioma.atual()) || 'pt';
    const op = pvpUlt.oponente;
    const tit = l === 'en' ? `Last ranked match: ${pvpUlt.venci ? 'won' : 'lost'}${op ? ` vs ${op}` : ''} (${txt.slice(2)} PR)`
      : l === 'es' ? `Última clasificatoria: ${pvpUlt.venci ? 'ganó' : 'perdió'}${op ? ` contra ${op}` : ''} (${txt.slice(2)} PR)`
        : `Última ranqueada: ${pvpUlt.venci ? 'venceu' : 'perdeu'}${op ? ` contra ${op}` : ''} (${txt.slice(2)} PR)`;
    if (el.textContent !== txt) el.textContent = txt;
    el.dataset.res = pvpUlt.venci ? 'v' : 'd';
    if (el.title !== tit) el.title = tit;
  }
  setInterval(() => { try { pintarPvpUlt(); } catch { /* sem a tela do jogo */ } }, 3000);
  PIH.on('pvp', (m) => {
    if (!m || typeof m !== 'object') return;
    if (m.partida) anotarPartida(m.partida, true);
    if (Array.isArray(m.naoVistas) && m.naoVistas.length) anotarPartida([...m.naoVistas].sort((a, b) => (Number(a && a.id) || 0) - (Number(b && b.id) || 0)).at(-1));
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
    let modal = null;
    try { modal = document.getElementById('modal'); } catch { modal = null; }
    const ok = pedir({ t: 'passe.resgatar' }, 'resgatando o Passe de Batalha de hoje');
    if (ok) passeLimpar = { em: Date.now(), modalAntes: !!(modal && !modal.classList.contains('hidden')), clicouOk: false };
    return ok;
  }
  // 1.34.1 (pedido do André): o jogo, ao receber o resgate com o Passe fechado, abre a janela do Passe
  // e a abertura do prêmio ("Incrível!"). Resgate feito pelo Piloto: fecha a abertura e, se nenhuma
  // janela estava aberta antes, fecha o Passe também. Só cliques na tela, nada vai ao servidor.
  let passeLimpar = null;
  setInterval(() => { try { limparPasse(); } catch { /* sem a tela do jogo */ } }, 500);
  function limparPasse() {
    const r = passeLimpar;
    if (!r) return;
    if (Date.now() - r.em > 20_000) { passeLimpar = null; return; }
    const abertura = document.getElementById('ps-abrir');
    const okBt = document.getElementById('ps-abrir-ok');
    if (!r.clicouOk) {
      if (!abertura || abertura.classList.contains('hidden') || !okBt) return;
      r.clicouOk = true; r.okEm = Date.now();
      setTimeout(() => { try { okBt.click(); } catch { /* sumiu */ } }, 1500); // deixa ver o prêmio um instante
      return;
    }
    if (Date.now() - r.okEm < 2200) return;
    passeLimpar = null;
    const modal = document.getElementById('modal');
    const fechar = document.getElementById('modal-fechar');
    if (!r.modalAntes && modal && !modal.classList.contains('hidden') && modal.querySelector('#ps-abrir, [class^="ps-"], [class*=" ps-"]') && fechar) fechar.click();
    diario('Passe de Batalha: prêmio de hoje recolhido e janela fechada', 'ok');
  }

  function tarefaXpShare() {
    if (!cfg.xpshare.ligado || !venceu('xpshare', 60_000)) return false;
    const casas = (eu.casa && eu.casa.lista || []).filter((c) => !c.anunciada && c.emUso !== false);
    if (!casas.length) return false;
    const ocupados = new Set();
    for (const c of casas) for (const id of c.postos || []) if (id) ocupados.add(id);
    const at = ativo();
    // Os mais atrasados primeiro: são os que mais ganham com a fatia. 1.41.0: antes deles, as
    // promessas do Melhorar o time (o exemplar melhor que ainda não passou o do time em Poder).
    const promessas = (PIH.cacadas && PIH.cacadas.treinar ? PIH.cacadas.treinar() : []).filter((p) => p && Number(p.heldItemId) !== ID_XP_SHARE_HELD && !ocupados.has(p.id));
    const candidatos = [...promessas, ...equipe()
      .filter((p) => p.id !== (at && at.id) && Number(p.heldItemId) !== ID_XP_SHARE_HELD && !ocupados.has(p.id) && !promessas.includes(p))
      .sort((a, b) => (a.level || 0) - (b.level || 0))];
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

  // 1.28 (o André viu o rodízio pôr o 2º para lutar na hunt do Charizard, ele cair e o jogo voltar
  // o Charizard): com a Troca de hunt ligada, a troca do ativo passa pelo Centro — vai na fila do
  // Centro, troca o ativo lá dentro (fora de combate), calcula a melhor hunt DELE e sai direto para
  // ela. Sem a Troca de hunt (ou sem o Centro), troca na hora, como antes (aí só entra quem mata
  // com segurança na hunt atual).
  let rodCentro = null; // { proxId, nome, deNome, etapa, desde, em }
  function trocarAtivo(prox, at, huntAuto) {
    const txt = `rodízio: ${prox.nome} (Nv ${prox.level}) entra no lugar de ${at.nome} (Nv ${at.level})`;
    if (huntAuto && PIH.auto && PIH.auto.irAoCentroEFicar && !rodCentro) {
      // 1.34: com uma ida ao Centro já andando, pega carona nela em vez de esperar ela voltar
      const carona = PIH.auto._interno.rotina() && PIH.auto.caronaNoCentro;
      const r = carona ? PIH.auto.caronaNoCentro({ motivo: `${txt} — trocando nesta ida ao Centro` }) : PIH.auto.irAoCentroEFicar({ motivo: `${txt} — trocando no Centro` });
      if (r.ok) {
        rodCentro = { proxId: prox.id, nome: prox.nome, deNome: at.nome, etapa: 'indo', desde: Date.now(), em: 0 };
        diario(`${txt}: vou trocar no Centro e levar ${prox.nome} direto para a melhor hunt dele`);
        return true;
      }
      if (carona) return false; // a ida ao Centro andando não deu carona: espera ela acabar (nunca troca no meio da hunt)
    }
    return pedir({ t: 'team.active', pokemonId: prox.id }, `${txt}${huntAuto ? ' — a Troca de hunt leva para a melhor hunt dele' : ''}`);
  }
  // 1.33.4 (o André viu o Larvitar Nv 44 ficar 1h51 na hunt do Pichu Nv 260 com o turno vencido): a
  // válvula de escape. A troca do rodízio espera a brecha de combate (3 s sem dano) para ir ao Centro;
  // numa hunt acima do Nv 150 o jogo repõe cada selvagem na hora, e um pokémon fraco, que mata
  // devagar, nunca fica 3 s sem apanhar — a fila desistia aos 10 min e o rodízio tentava de novo,
  // para sempre. Agora, 2 min sem brecha: o próximo da fila (o mesmo, a ordem não muda) entra ali
  // mesmo, se luta com segurança nessa hunt. Ele limpa o campo, a brecha aparece, a ida ao Centro
  // segue e ele sai de lá para a melhor hunt dele. Se o próximo não aguenta essa hunt, entra uma
  // PONTE (o mais forte do time que aguenta) só para limpar: ela não conta como turno (não perde o
  // lugar na fila) e, no Centro, o próximo da fila assume como sempre. Nunca usa o "Desistir do
  // Combate" do jogo: ele custa 10% do XP do nível do treinador.
  const VALVULA_MS = 2 * 60_000;
  const vivoRod = (p) => !!(p && p.stats && !(p.hp != null && Number(p.hp) <= 0));
  async function valvula(r) {
    const at = ativo();
    const h = huntAtual();
    if (!at || !h || !welcome || at.id === r.proxId) return;
    const jogo = await PIH.carregarJogo();
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem: jogo.precoItem, hunts: [h],
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu, geo: (slug) => (PIH.geo ? PIH.geo.daHunt(slug) : null), ritmoMedido: () => null,
    };
    const aguenta = (pk) => {
      try { const l = PIH.engine.analisar(pk, ctx, { soLiberadas: false, comPocao: true }).linhas[0]; return !!l && !l.inviavel && !PIH.engine.arriscada(l); } catch { return false; }
    };
    const prox = equipe().find((p) => p.id === r.proxId);
    if (vivoRod(prox) && aguenta(prox)) {
      pedir({ t: 'team.active', pokemonId: prox.id }, `rodízio: 2 min sem brecha de combate — ${prox.nome} entra aqui mesmo para limpar a hunt, depois vai ao Centro e segue para a melhor hunt dele`);
      return;
    }
    const ponte = equipe()
      .filter((p) => p.id !== at.id && p.id !== r.proxId && vivoRod(p) && (p.starter || (p.level || 0) <= (eu.level || 0) + 5) && aguenta(p))
      .sort((a, b) => poderRod(b) - poderRod(a))[0];
    if (ponte) {
      if (PIH.time && PIH.time.marcarPonte) PIH.time.marcarPonte(ponte.id);
      r.ponte = ponte.id;
      pedir({ t: 'team.active', pokemonId: ponte.id }, `rodízio: 2 min sem brecha de combate — ${ponte.nome} entra só para limpar a hunt (não conta como turno); no Centro ${r.nome} assume`);
      return;
    }
    diario('rodízio: 2 min sem brecha de combate e ninguém do time luta com segurança aqui — continuo esperando', 'aviso');
  }
  let rodAndando = false;
  async function andarRodCentro() {
    const r = rodCentro;
    if (!r || !eu || rodAndando) return;
    rodAndando = true;
    try {
      const agora = Date.now();
      const sair = (txt, tipo, destino) => { rodCentro = null; try { PIH.auto.liberarCentro(destino); } catch { /* sem auto */ } if (txt) diario(txt, tipo); };
      if (agora - r.desde > 12 * 60_000) return sair('rodízio: a troca no Centro passou de 12 min — voltando', 'aviso');
      if (r.etapa === 'indo') {
        const rot = PIH.auto.rotinaAtual();
        // 1.34: a rotina parada no Centro também conta como chegou (o relógio de 1 s podia perder o noCentro)
        if (eu.noCentro || (rot && rot.etapa === 'parado')) { r.etapa = 'trocar'; r.em = 0; return; }
        if (!rot) { rodCentro = null; marcas.rodizio = Date.now() - cfg.rodizio.intervaloMin * 60_000 + 2 * 60_000; diario('rodízio: não cheguei ao Centro — tento de novo em 2 min', 'aviso'); return; }
        if (!r.valvula && rot.etapa === 'esperar' && naHunt() && agora - r.desde > VALVULA_MS) { r.valvula = true; await valvula(r); }
        return;
      }
      if (r.etapa === 'trocar') {
        if (eu.activeId === r.proxId) { r.etapa = 'hunt'; return; }
        if (agora - r.em > 5000) {
          if (r.em && agora - r.desde > 3 * 60_000) return sair(`rodízio: o jogo não trocou o ativo para ${r.nome} — voltando`, 'aviso');
          r.em = agora;
          pedir({ t: 'team.active', pokemonId: r.proxId }, `rodízio: ${r.nome} entra no lugar de ${r.deNome} (no Centro)`);
        }
        return;
      }
      if (r.etapa === 'hunt') {
        r.etapa = 'saindo';
        const h = await PIH.auto.melhorHuntPara(r.proxId).catch(() => null);
        return sair(h ? `rodízio: ${r.nome} sai do Centro direto para ${h.nome} (a melhor hunt dele)` : `rodízio: ${r.nome} volta para a hunt de antes (sem cálculo da melhor)`, 'ok', h ? h.slug : undefined);
      }
    } finally { rodAndando = false; }
  }
  setInterval(() => { andarRodCentro().catch((e) => console.warn('[piloto] rodízio:', e)); }, 1000);

  // 1.28.1 (o André viu "próximo em 25 min" num Charizard que tinha acabado de entrar): o relógio do
  // rodízio é o TURNO de quem está lutando — conta desde que ESSE pokémon virou o ativo (a janela Time
  // anota os turnos), não desde o último rodízio. Se o jogo trocou sozinho porque o anterior
  // desmaiou, o turno de quem entrou é curto (2 min): logo vem o próximo da fila.
  function faltaDoTurno() {
    const c = cfg.rodizio;
    const intervalo = c.intervaloMin * 60_000;
    const at = eu && eu.activeId;
    const t = PIH.time && PIH.time.turnoAtual ? PIH.time.turnoAtual() : null;
    if (t && at != null && t.pkId === at) return t.desde + (t.desmaio ? 2 * 60_000 : intervalo) - Date.now();
    return (Number(marcas.rodizio) || 0) + intervalo - Date.now();
  }
  // 1.32.2 (pedido do André): quando o rodízio liga (e depois que o Caçar o meta o desliga e ele
  // volta), o ciclo começa do zero: o MAIS FRACO entra primeiro para farmar e o mais forte fica por
  // último. Depois disso, quem está há mais tempo sem lutar (neste ciclo) entra; empate, o mais fraco.
  const poderRod = (p) => Number(p && p.poder) || 0;
  const ultimaVezCiclo = (p) => {
    const v = PIH.time && PIH.time.ultimaVez ? PIH.time.ultimaVez(p.id) : null;
    return v == null || v < (Number(marcas.rodizioCiclo) || 0) ? -Infinity : v;
  };
  const ordemRodizio = (a, b) => (ultimaVezCiclo(a) - ultimaVezCiclo(b)) || (poderRod(a) - poderRod(b));
  function comecarCiclo() { marcas.rodizioCiclo = Date.now(); marcas.rodizioComecar = true; gravar(); }
  // 1.29: a fila do rodízio para a tela (o painel Equipe do jogo): quem entra depois, na ordem, e
  // quando — a mesma regra da escolha.
  function filaRodizio() {
    const c = cfg.rodizio;
    if (!eu || !c.ligado) return null;
    const at = eu.activeId;
    const ordemIds = PIH.time ? equipeAlvo([]).map((p) => p.id) : [];
    const idx = (p) => { const i = ordemIds.indexOf(p.id); return i < 0 ? 99 + p.slot : i; };
    const ultimaVez = (p) => { const v = PIH.time && PIH.time.ultimaVez ? PIH.time.ultimaVez(p.id) : null; return v == null ? -Infinity : v; };
    const fila = equipe().filter((p) => p.id !== at && p.stats && (p.starter || (p.level || 0) <= (eu.level || 0) + 5))
      .sort(ordemRodizio);
    void idx; void ultimaVez;
    const intervalo = c.intervaloMin * 60_000;
    const falta = marcas.rodizioComecar ? 0 : Math.max(0, faltaDoTurno());
    return { intervaloMin: c.intervaloMin, falta, modo: c.modo, fila: fila.map((p, i) => ({ id: p.id, nome: p.nome, pos: i + 1, emMs: falta + i * intervalo, desmaiado: p.hp != null && Number(p.hp) <= 0 })) };
  }
  async function tarefaRodizio() {
    const c = cfg.rodizio;
    const comecar = !!marcas.rodizioComecar;
    if (!c.ligado || !naHunt() || !PIH.engine || (!comecar && faltaDoTurno() > 0) || !venceu('rodizio', comecar ? 30_000 : 3 * 60_000)) return false;
    if (rodCentro) return false; // a troca do rodízio já está andando
    // 1.34: uma ida ao Centro já andando (reposição, vigia, botão ↩) não segura mais o rodízio — ele pega
    // carona nela. Só espera a que não passa pelo Centro (a troca de hunt direta) ou a do time.
    const rotAuto = PIH.auto && PIH.auto._interno.rotina();
    if (rotAuto && !(rotAuto.curar || (rotAuto.compras && rotAuto.compras.length)) ) return false;
    if (rotAuto && (rotAuto.ficar || !['esperar', 'indo', 'centro', 'sair'].includes(rotAuto.etapa))) return false;
    if (PIH.metaCaca && PIH.metaCaca.ativo()) return false; // 1.24: caçando o meta, quem luta é o mais forte
    if (PIH.cacadas && PIH.cacadas.ativo()) return false; // 1.41.0: Melhorar o time / Completar a Pokédex escolhem quem caça
    if (PIH.farm && PIH.farm.ativo()) return false; // 1.47.0: no Modo farm quem luta é o farmador
    if (PIH.time && PIH.time.emSessao && PIH.time.emSessao()) return false; // 1.26.3: trocando o time no Centro
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
    // 1.22 (pedido do André): 'ciclo' — o próximo do time (pela ordem das vagas) vira o ativo, um de
    // cada vez. Com a Troca de hunt ligada ele vai para a melhor hunt dele; sem ela, só entra quem
    // mata com segurança aqui.
    const huntAuto = (() => { try { return !!PIH.auto._interno.cfg().hunt.ligado; } catch { return false; } })();
    if (c.modo === 'ciclo') {
      // 1.27: na ordem da escalação do PvP (a mesma do meta), para o rodízio "ir indo" nela
      const ordemIds = PIH.time ? equipeAlvo([]).map((p) => p.id) : [];
      const idx = (p) => { const i = ordemIds.indexOf(p.id); return i < 0 ? 99 + p.slot : i; };
      const ordem = equipe().filter((p) => p.stats && !(p.hp != null && Number(p.hp) <= 0) && (p.starter || (p.level || 0) <= (eu.level || 0) + 5)).sort((a, b) => idx(a) - idx(b));
      if (ordem.length < 2) return false;
      // 1.28.1 (pedido do André: "quem acabou de lutar vai por último"): entra quem está há mais
      // tempo sem lutar (nunca lutou = primeiro); empate, a ordem do PvP.
      // 1.32.2: começo do ciclo — se o ativo já é o mais fraco, ele fica e o ciclo segue daqui
      if (comecar) {
        const todos = [...ordem].sort(ordemRodizio);
        if (todos[0] && todos[0].id === at.id) { marcas.rodizioComecar = false; gravar(); return false; }
      }
      const fila = ordem.filter((p) => p.id !== at.id).sort(ordemRodizio);
      for (const prox of fila) {
        if (!huntAuto) {
          try {
            const r = PIH.engine.analisar(prox, ctx, { soLiberadas: false, comPocao: true });
            const l = r.linhas[0];
            if (!l || l.inviavel || PIH.engine.arriscada(l)) continue;
          } catch { continue; }
        } else {
          // 1.43.1 (relato #3, ZaryImortal: um Magikarp entrou no rodízio e ficou morrendo, gastando
          // tudo em revive e poção): com a Troca de hunt, quem entra vai para a melhor hunt DELE — e
          // quem não tem nenhuma hunt liberada onde lute com segurança fica fora do rodízio.
          let destino = null;
          try { destino = PIH.auto && PIH.auto.melhorHuntPara ? await PIH.auto.melhorHuntPara(prox.id) : null; } catch { destino = null; }
          if (!destino) {
            const k = `rodSemHunt:${prox.id}`;
            if (Date.now() - (Number(marcas[k]) || 0) > 3_600_000) { marcas[k] = Date.now(); gravar(); diario(`rodízio: ${prox.nome} (Nv ${prox.level}) não luta com segurança em nenhuma hunt liberada — fica fora do rodízio por enquanto`, 'aviso'); }
            continue;
          }
        }
        if (comecar) { marcas.rodizioComecar = false; gravar(); }
        return trocarAtivo(prox, at, huntAuto);
      }
      return false;
    }
    const linhas = [];
    for (const pk of equipe()) {
      if (!pk.stats || (pk.hp != null && Number(pk.hp) <= 0) || (pk.level || 0) > (eu.level || 0) + 5) continue;
      try {
        const r = PIH.engine.analisar(pk, ctx, { soLiberadas: false, comPocao: true });
        const l = r.linhas[0];
        if (l && !l.inviavel && !PIH.engine.arriscada(l)) linhas.push({ pk, l });
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

  // 1.36.0 (pedido do André, 28/10: "nenhuma vez funcionou"): o time evolui NA HORA, qualquer
  // pokémon — inicial, com skin, item, refino, tanto faz. Ficam de fora só o que o jogo não deixa
  // (Outland, Mega, sem arte do destino, cadeia com escolha sem a opção ligada) e o shiny sem a Shiny
  // Stone na mochila (essa o Piloto nunca compra: é o item mais raro do jogador). Quem NÃO é do time
  // (escopo "Todos") segue a regra antiga: nada que alguém cuidou à mão.
  // Confere a cada mudança no estado (subiu de nível, a pedra chegou) e a cada tique.
  function cuidadoAMao(pk, noXpShare) {
    if (pk.starter) return 'é o seu inicial';
    if (pk.skin) return 'tem skin';
    if (pk.heldItemId != null) return 'segura um item';
    if (noXpShare.has(pk.id)) return 'está num posto do XP Share';
    if (Object.values(pk.refino || {}).some((v) => Number(v) > 0) || Number(pk.refinoTotal) > 0) return 'é refinado';
    return '';
  }
  function pedraShinyDe(tipo) {
    const lista = (welcome && welcome.shinyStone && welcome.shinyStone.pedras) || [];
    const p = lista.find((x) => x && x.tipo === tipo && x.itemId != null);
    return p ? { itemId: Number(p.itemId), nome: p.nome || `${tipo} Shiny Stone`, shiny: true } : null;
  }
  // 1.47.0 (pedido do André): o farmador do Modo farm evolui sozinho até a espécie escolhida, mesmo
  // com o Evoluir desligado — só ele, e só pelo caminho que chega no escolhido.
  const farmEvo = () => { try { const id = PIH.farm && PIH.farm.pkId ? PIH.farm.pkId() : null; const p = id ? (eu.pokemons || []).find((x) => x.id === id) : null; return p ? { pk: p, caminho: PIH.farm.caminhoEvolucao() } : null; } catch { return null; } };
  const evoluirLigado = () => !!(cfg.evoluir && cfg.evoluir.ligado) || !!farmEvo();
  // O que falta para este pokémon evoluir agora: null (não evolui) ou { d, pedra, tem, livre }.
  function prontoParaEvoluir(pk, m, porId, jogo, caminho = null) {
    if (pk.speciesId >= 2000) return null; // Outland e Mega não evoluem
    const esp = porId.get(pk.speciesId);
    if (!esp || !esp.evolvesToId) return null;
    let destinos = m.ramif.destinosDeEvolucao(esp, (id) => porId.get(id)).filter((d) => d.temArte && (pk.level || 0) >= d.nivel);
    if (caminho) destinos = destinos.filter((d) => caminho.has(d.pokeId)); // 1.47.0: o farmador vai só pelo caminho do escolhido
    if (!destinos.length || (destinos.length > 1 && !cfg.evoluir.ramificada && !caminho)) return null;
    const d = destinos[0];
    const tipo = m.ramif.tipoDaPedraDeEvolucao(esp, d.especie);
    let pedra;
    if (pk.shiny) {
      // o servidor recusa shiny sem forma shiny no destino (e o jogo esconde a opção)
      const looks = welcome && welcome.shinyLooks;
      if (!looks || looks[d.pokeId] == null) return null;
      pedra = pedraShinyDe(tipo);
    } else pedra = pedraDe(tipo, jogo);
    if (!pedra) return null;
    const tem = Number((eu.items || {})[pedra.itemId]) || 0;
    return { d, pedra, tem, livre: tem - PIH.itensReservados(pedra.itemId, tem) };
  }
  function xpSharePostos() {
    const s = new Set();
    for (const c of (eu.casa && eu.casa.lista) || []) for (const id of c.postos || []) if (id) s.add(id);
    return s;
  }
  // Diário da evolução guardado no navegador (também lido pelo /terms na vigia): sem ele não dá para
  // saber depois por que não evoluiu.
  function diagEvo(txt) {
    try {
      const l = JSON.parse(localStorage.getItem('piloto:diag:evo') || '[]');
      l.push({ em: Date.now(), txt: String(txt).slice(0, 200) });
      localStorage.setItem('piloto:diag:evo', JSON.stringify(l.slice(-60)));
    } catch { /* sem armazenamento */ }
  }

  // o que o jogo respondeu (recusas) e o que o Radar fez com a pedra também vão para o diário da evolução
  let evoUltimo = 0;
  PIH.on('piloto.diario', (reg) => {
    try {
      for (const r of (reg || []).slice(0, 5).reverse()) {
        if (!r || r.t <= evoUltimo) continue;
        evoUltimo = r.t;
        if (/^(rotina: |radar: )?pedra:|^rotina: o servidor recusou|evolu/i.test(r.txt) && !/^rotina: (evoluindo|pedra: .+ pedi 1×)/.test(r.txt)) diagEvo(r.txt);
      }
    } catch { /* segue */ }
  });

  document.addEventListener('piloto:radar-diario', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      if (!d || typeof d.txt !== 'string' || !/^pedra:/.test(d.txt)) return;
      diagEvo(`radar: ${d.txt}`);
      // compra perdida no sorteio do Mercado ou recusada: pede de novo já no próximo tique (não em 5 min)
      if (/o cofre não liberou/.test(d.txt)) { for (const k of pedidoPedra.keys()) pedidoPedra.set(k, Date.now() + 25 * 60_000); return; } // 30 min
      const daqui = /não deu certo|não entrou na fila|não respondeu|sem conexão/.test(d.txt) ? 30_000 : /ninguém vende/.test(d.txt) ? 2 * 60_000 : 0;
      if (daqui) for (const [k, em] of pedidoPedra) pedidoPedra.set(k, Math.min(em, Date.now() - 5 * 60_000 + daqui));
    } catch { /* segue */ }
  });

  async function tarefaEvoluir() {
    if (!evoluirLigado() || !venceu('evoluir', 8_000)) return false;
    const m = await modulos();
    const { porId, jogo } = await catalogoEvolucao();
    const doTime = new Set(equipe().map((p) => p.id));
    const fe = farmEvo();
    // o time primeiro (1.47.0: com o Evoluir desligado, só o farmador do Modo farm)
    const lista = !cfg.evoluir.ligado ? (fe ? [fe.pk] : []) : cfg.evoluir.escopo === 'tudo' ? [...equipe(), ...(eu.pokemons || []).filter((p) => !doTime.has(p.id))] : equipe();
    const noXpShare = xpSharePostos();
    for (const pk of lista) {
      const time = doTime.has(pk.id);
      if (!time && (pk.shiny || cuidadoAMao(pk, noXpShare))) continue;
      // Um envio por pokémon a cada 2 min enquanto não evoluir (o estado novo mostra a espécie nova);
      // depois de 3 envios sem evoluir, espera 6 h e avisa — o servidor está recusando.
      let tentou = Number(marcas[`evoN:${pk.id}`]) || 0;
      const evoluiu = marcas[`evoSp:${pk.id}`] != null && marcas[`evoSp:${pk.id}`] !== pk.speciesId;
      if (evoluiu || (tentou && marcas[`evoSp:${pk.id}`] == null)) { tentou = 0; delete marcas[`evo:${pk.id}`]; delete marcas[`evoSp:${pk.id}`]; } // evoluiu: a próxima etapa já pode
      if (!venceu(`evo:${pk.id}`, tentou >= 3 ? 6 * 3_600_000 : 2 * 60_000)) continue;
      if (tentou >= 3) tentou = 0;
      const pr = prontoParaEvoluir(pk, m, porId, jogo, fe && fe.pk.id === pk.id ? fe.caminho : null);
      if (!pr || pr.livre < 1) continue;
      const { d, pedra } = pr;
      marcar('evoluir');
      const txt = `evoluindo ${pk.nome} (Nv ${pk.level}) → ${d.especie.name} com 1× ${pedra.nome || 'pedra'}`;
      const ok = pedir({ t: 'pokemon.evoluir', pokemonId: pk.id, alvoId: d.pokeId }, txt);
      diagEvo(ok ? txt : `${txt} — não saiu`);
      if (ok) { marcas[`evoN:${pk.id}`] = tentou + 1; marcas[`evoSp:${pk.id}`] = pk.speciesId; }
      if (ok && tentou + 1 >= 3) diario(`evolução: ${pk.nome} não evoluiu depois de 3 envios — o jogo está recusando; tento de novo em 6 h`, 'aviso');
      marcas[`evo:${pk.id}`] = ok ? Date.now() : Date.now() - 90_000; // nem saiu: tenta em 30 s
      gravar();
      return ok;
    }
    return false;
  }

  // Pokémon do TIME no nível de evoluir e sem a pedra → pede ao Radar UMA no Mercado, em ouro (nunca
  // diamante/gema: o gancho só deixa ouro), pelo cofre, na hora. Quando a pedra chega, o Evoluir acima
  // evolui. Sem vendedor ou com a compra recusada, pede de novo em 5 min. Shiny Stone nunca é comprada.
  const pedidoPedra = new Map(); // 'pokémon:itemId' -> quando pediu
  async function tarefaPedraDoTime() {
    if (!evoluirLigado() || !venceu('pedraTime', 10_000)) return false;
    marcar('pedraTime');
    const m = await modulos();
    const { porId, jogo } = await catalogoEvolucao();
    // 1.33.9: avisa o Radar de TODAS as pedras que o time vai gastar, para a revenda automática não
    // vendê-las (1.36.0: o time inteiro, inicial e cuidados à mão incluídos).
    const precisa = {};
    const prontos = [];
    const fe = farmEvo();
    for (const pk of (cfg.evoluir.ligado ? equipe() : fe ? [fe.pk] : [])) {
      const pr = prontoParaEvoluir(pk, m, porId, jogo, fe && fe.pk.id === pk.id ? fe.caminho : null);
      if (!pr) continue;
      precisa[pr.pedra.itemId] = (precisa[pr.pedra.itemId] || 0) + 1;
      prontos.push({ pk, ...pr });
    }
    document.dispatchEvent(new CustomEvent('piloto:pedras-do-time', { detail: JSON.stringify({ itens: precisa }) }));
    if (cfg.evoluir.comprarPedra === false) return false;
    for (const { pk, d, pedra, tem, livre } of prontos) {
      if (pedra.shiny || livre >= 1) continue; // já tem: o Evoluir resolve
      // 1.33.5: o radar tem essa pedra no estoque de revenda → uma sai do estoque para o time
      if (tem >= 1 && PIH.liberarItemParaEvoluir && PIH.liberarItemParaEvoluir(pedra.itemId)) {
        marcas.evoluir = 0; gravar();
        diario(`pedra: ${pk.nome} (Nv ${pk.level}) já pode virar ${d.especie.name} — usei 1× ${pedra.nome || 'pedra'} do estoque do Radar`);
        diagEvo(`pedra do estoque do Radar para ${pk.nome} → ${d.especie.name}`);
        setTimeout(() => { Promise.resolve().then(tique).catch(() => { /* segue */ }); }, 1500);
        return true;
      }
      const chave = `${pk.id}:${pedra.itemId}`; // por pokémon: dois do time com a mesma pedra pedem duas
      if (Date.now() - (pedidoPedra.get(chave) || 0) < 5 * 60_000) continue;
      pedidoPedra.set(chave, Date.now());
      document.dispatchEvent(new CustomEvent('piloto:pedra-precisa', { detail: JSON.stringify({ itemId: pedra.itemId, nome: pedra.nome || 'pedra', para: `${pk.nome} → ${d.especie.name}` }) }));
      diario(`pedra: ${pk.nome} (Nv ${pk.level}) já pode virar ${d.especie.name} — pedi 1× ${pedra.nome || 'pedra'} ao Radar (Mercado, em ouro)`);
      diagEvo(`pedi 1× ${pedra.nome || 'pedra'} ao Radar para ${pk.nome} → ${d.especie.name}`);
      return true;
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
    // quem a janela Time está tirando do time de campo vai para a Coleção: nunca vende no meio
    for (const id of (PIH.time && PIH.time.protegidos ? PIH.time.protegidos() : [])) ids.add(id);
    // 1.24: os do meta (capturados) e, enquanto o Caçar o meta está ligado, toda a família dos alvos
    for (const id of (PIH.metaCaca ? PIH.metaCaca.protegidos() : [])) ids.add(id);
    // 1.41.0: as promessas do Melhorar o time e, enquanto ele caça, a família do alvo (até ser avaliada)
    for (const id of (PIH.cacadas ? PIH.cacadas.protegidos() : [])) ids.add(id);
    for (const id of (PIH.farm ? PIH.farm.protegidos() : [])) ids.add(id);
    const familiaMeta = new Set([...(PIH.metaCaca ? PIH.metaCaca.especiesAlvo() : []), ...(PIH.cacadas ? PIH.cacadas.especiesAlvo() : []), ...(PIH.farm ? PIH.farm.especiesAlvo() : [])]);
    for (const p of livres) if (familiaMeta.has(p.speciesId)) ids.add(p.id);
    if (cfg.pvp.time && Array.isArray(pvp.time)) for (const p of equipeAlvo(pvp.time)) ids.add(p.id);
    return livres.filter((p) => ids.has(p.id) || p.shiny || Number(p.potencia) >= POTENCIA_MAX);
  }
  async function tarefaDepot() {
    const c = cfg.depot;
    // 1.17 (pedido do André): na hora. Entrou no Depot e não foi para a Coleção → vende (no máximo
    // uma venda a cada 15 s; um relógio próprio de 5 s olha o Depot).
    if (c.modo === 'off' || !venceu('depot', DEPOT_ESPERA_MS)) return false;
    const travados = new Set(((eu.automation && eu.automation.pokemonTravado) || []).map(Number));
    const depot = (eu.pokemons || []).filter((p) => p.slot == null && p.id !== eu.activeId && !travados.has(Number(p.id)) && Number(p.heldItemId) !== ID_XP_SHARE_HELD);
    if (!depot.length) return false;
    // com o Auto Coleção no ponto ligado, só vende depois que a regra estiver salva no jogo
    if (cfg.autoColecao.ligado && !autoColecaoOk) { await tarefaAutoColecao(); if (!autoColecaoOk) return false; }
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
      if (ok) { marcar('depot'); try { PIH.extrato?.depotVendido?.(depot.length); } catch { /* só a tela */ } }
      else { marcas.depot = Date.now() + 45_000; gravar(); } // recusado: tenta de novo em 1 min
      return ok;
    }
    return false;
  }

  // ---- 1.34.1: Coleção sem saída (pedido do André, 28/10) -------------------------------------
  // O Auto Coleção guarda na captura todo pokémon de nota 3,5+, mas o Mercado só aceita anunciar
  // (fora shiny, P5 e lendário/mítico) a partir do Nv 50 (MERCADO_POKEMON_MIN do jogo). Abaixo
  // disso ele ficava parado na Coleção: a venda automática não lista e o NPC não compra. Agora, quem
  // ENTROU SOZINHO na Coleção na captura (vista nesta sessão: chegou e já estava na Coleção em até
  // 15 s), abaixo do Nv 50, volta para o Depot e sai na venda — menos o que a Guarda protege (time,
  // PvP, XP Share, item, shiny, lendário, os melhores de farm/PvP e os que valem treinar), os do
  // meta e quem segura item. O que estava na Coleção antes (ou que você travou à mão depois) nunca
  // é tocado: o jogo não diz quem pôs o cadeado, então só vale o que o Piloto viu chegar.
  // (as variáveis do rastro moram lá em cima, junto do eu: o 'estado' pode chegar antes daqui)
  function rastrearColecao() {
    if (!eu || !Array.isArray(eu.pokemons)) return;
    const agora = Date.now();
    if (colVistos && agora - colRastreadoEm < 1000 && !colPendentes.size) return;
    colRastreadoEm = agora;
    const col = new Set(((eu.automation && eu.automation.pokemonTravado) || []).map(Number));
    if (!colVistos) {
      if (!eu.pokemons.length) return;
      colVistos = new Set(eu.pokemons.map((p) => p && p.id));
      colMaxId = Math.max(0, ...eu.pokemons.map((p) => Number(p && p.id) || 0));
      return;
    }
    let maior = colMaxId;
    for (const p of eu.pokemons) {
      if (!p || colVistos.has(p.id)) continue;
      colVistos.add(p.id);
      if (Number(p.id) > colMaxId) { colPendentes.set(p.id, agora); maior = Math.max(maior, Number(p.id)); }
    }
    colMaxId = maior;
    for (const [id, em] of colPendentes) {
      if (col.has(id)) { colPendentes.delete(id); colRegra.set(id, agora); }
      else if (agora - em > COL_JANELA_MS) colPendentes.delete(id);
    }
  }
  async function tarefaColecaoBaixa() {
    if (!cfg.autoColecao.ligado || cfg.depot.modo === 'off' || !colRegra.size || !eu || !venceu('colBaixa', 30_000)) return false;
    const G = PIH.guarda && PIH.guarda.resumo ? PIH.guarda.resumo() : null;
    if (!G || !G.pronto) return false; // sem a Guarda pronta, não dá para saber quem proteger
    const protegidos = new Set(G.ids);
    for (const id of (PIH.time && PIH.time.doMeta ? PIH.time.doMeta() : [])) protegidos.add(id);
    for (const id of (PIH.metaCaca ? PIH.metaCaca.protegidos() : [])) protegidos.add(id);
    for (const id of (PIH.cacadas ? PIH.cacadas.protegidos() : [])) protegidos.add(id);
    for (const id of (PIH.farm ? PIH.farm.protegidos() : [])) protegidos.add(id);
    const familiaMeta = new Set([...(PIH.metaCaca ? PIH.metaCaca.especiesAlvo() : []), ...(PIH.cacadas ? PIH.cacadas.especiesAlvo() : []), ...(PIH.farm ? PIH.farm.especiesAlvo() : [])]);
    const a = PIH.time && PIH.time._interno && PIH.time._interno.st && PIH.time._interno.st.analise;
    const analiseEm = (a && a.em) || 0;
    const col = new Set(((eu.automation && eu.automation.pokemonTravado) || []).map(Number));
    const porId = new Map(eu.pokemons.map((p) => [p && p.id, p]));
    for (const [id, chegou] of colRegra) {
      const p = porId.get(id);
      // saiu da Coleção, morreu na venda, ou é dos que ficam guardados de vez
      if (!p || !col.has(id) || (Number(p.level) || 0) >= COL_NV_MERCADO || p.shiny || Number(p.potencia) >= POTENCIA_MAX || p.slot != null || p.id === eu.activeId || Number(p.heldItemId) > 0 || familiaMeta.has(p.speciesId)) { colRegra.delete(id); continue; }
      if (protegidos.has(id)) continue; // a Guarda pode soltar depois (outra análise)
      if (analiseEm < chegou + 1000) { if (venceu('colBaixaAnalise', 60_000) && PIH.time && PIH.time.analisar) { marcar('colBaixaAnalise'); try { PIH.time.analisar(); } catch { /* depois */ } } continue; } // a janela Time ainda não avaliou este
      marcar('colBaixa');
      colRegra.delete(id);
      return pedir({ t: 'colecao.mover', pokemonId: id, para: 'depot' }, `Coleção: ${p.nome} (Nv ${p.level}) volta para o Depot — o Mercado só aceita a partir do Nv ${COL_NV_MERCADO}`);
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
  let recorteMeta = 'topo';
  function ordemDoPvp(time) {
    try { recorteMeta = JSON.parse(localStorage.getItem('piloto:metacaca:v1') || 'null')?.recorte === 'faixa' ? 'faixa' : 'topo'; } catch { /* topo */ }
    if (!PIH.meta || !PIH.meta.ordemPvp) return time;
    try { return PIH.meta.ordemPvp(time, recorteMeta).ordem; } catch { return time; }
  }
  function equipeAlvo(atualIds) {
    // 1.22: um time só — o PvP recebe o time principal (as 5 vagas do campo), o mais forte abrindo.
    if (PIH.time) {
      const time = ((eu && eu.pokemons) || []).filter((p) => p && p.slot != null && poderDe(p) > 0).sort((a, b) => poderDe(b) - poderDe(a)).slice(0, PVP_TIME_MAX);
      // 1.27: na ordem que o topo usa (quem abre e quem fecha), quando a aba Meta já tem dados
      return ordemDoPvp(time);
    }
    const candidatos = candidatosDoPvp();
    const porId = new Map(candidatos.map((p) => [p.id, p]));
    const equipe = [];
    // 1.16: os travados na janela Time entram sempre e nunca saem por troca
    const travados = new Set((PIH.time && PIH.time.travados ? PIH.time.travados('pvp') : []).filter((id) => porId.has(id)).slice(0, PVP_TIME_MAX));
    for (const id of travados) equipe.push(porId.get(id));
    for (const id of atualIds) { const p = porId.get(id); if (p && !equipe.includes(p) && equipe.length < PVP_TIME_MAX) equipe.push(p); }
    for (const c of candidatos) { if (equipe.length >= PVP_TIME_MAX) break; if (!equipe.includes(c)) equipe.push(c); }
    for (const c of candidatos) {
      if (equipe.includes(c)) continue;
      const trocaveis = equipe.filter((p) => !travados.has(p.id));
      if (!trocaveis.length) break;
      const fraco = trocaveis.reduce((m, p) => (poderDe(p) < poderDe(m) ? p : m), trocaveis[0]);
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
    // Mesmo time: com a ordem do meta (1.27), reordena quando a ordem mudou; sem ela, só se quem
    // abre ficou bem para trás (5%) do mais forte.
    if (mesmoConjunto) {
      const comMeta = !!(PIH.meta && PIH.meta.ordemPvp && PIH.meta.ordemPvp(alvo, recorteMeta).comMeta);
      if (comMeta) { if (novo.every((id, i) => id === pvp.time[i])) return false; }
      else {
        const porId = new Map(alvo.map((p) => [p.id, p]));
        const abre = porId.get(pvp.time[0]);
        if (!abre || poderDe(abre) >= poderDe(alvo[0]) * 0.95) return false;
      }
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

  // ---- Auto Coleção no ponto (1.18) --------------------------------------------------------------
  // O Depot agora vende na hora, então o que vale dinheiro TEM de ir para a Coleção antes. A regra
  // recomendada guarda tudo o que o Mercado da Comunidade aceita (vale mais lá que no NPC):
  // lendário/mítico, shiny, P5 e nota ≥ o mínimo do Mercado (3,5 hoje, lido do próprio jogo).
  // Simulado com o shared/nota-pokemon.mjs do jogo: nota ≥ 3,5 é 2–7% dos nascimentos e P5 é 5%.
  // P4 e qualidade alta já entram na nota; sozinhos (nota < 3,5) o Mercado não aceita.
  let notaMercado = null;
  let autoColecaoOk = false;
  async function regraRecomendada(atual) {
    if (notaMercado === null) {
      try { const N = await import(`${location.origin}/shared/nota-pokemon.mjs`); notaMercado = Number(N.MERCADO_POKEMON_MIN && N.MERCADO_POKEMON_MIN.nota) || 3.5; } catch { notaMercado = 3.5; }
    }
    return {
      lendario: { on: true },
      shiny: { on: true },
      pot: { on: true, min: 5 },
      qual: { on: false, min: (atual && atual.qual && atual.qual.min) || 1.5 },
      iv: { on: false, min: (atual && atual.iv && atual.iv.min) || { hp: 1, atk: 1, def: 1, spAtk: 1, spDef: 1, speed: 1 } },
      nota: { on: true, min: notaMercado },
    };
  }
  const resumoRegra = (r) => (r ? [r.lendario.on && 'Lendário', r.shiny.on && 'Shiny', r.pot.on && `P${r.pot.min}+`, r.qual.on && `Qualidade ${String(r.qual.min).replace('.', ',')}+`, r.iv.on && 'IV mínimo', r.nota.on && `Nota ${String(r.nota.min).replace('.', ',')}+`].filter(Boolean).join(' · ') : '—');
  let ultimaRegra = null;
  async function tarefaAutoColecao() {
    if (!cfg.autoColecao.ligado) { autoColecaoOk = true; return false; }
    const m = await modulos();
    if (!m.colecao || !m.colecao.autoColecaoEfetiva) { autoColecaoOk = true; return false; }
    const atual = m.colecao.autoColecaoEfetiva((eu && eu.automation) || {});
    const rec = await regraRecomendada(atual);
    ultimaRegra = atual;
    const igual = m.colecao.mesmaAutoColecao ? m.colecao.mesmaAutoColecao(atual, rec) : JSON.stringify(atual) === JSON.stringify(rec);
    if (igual) { autoColecaoOk = true; return false; }
    autoColecaoOk = false;
    if (!venceu('autoColecao', 60_000)) return false;
    marcar('autoColecao');
    return pedir({ t: 'shop.autoColecao', regra: rec }, `Auto Coleção no ponto: ${resumoRegra(rec)}`);
  }

  // 1.36.0: evoluir e a pedra do time vêm primeiro — antes, qualquer tarefa da frente que mandasse algo
  // encerrava o tique e a evolução esperava a próxima volta.
  const TAREFAS = [tarefaEvoluir, tarefaPedraDoTime, tarefaAutoColecao, tarefaPasse, tarefaPvpTime, tarefaPvpFila, tarefaXpShare, tarefaOutland, tarefaRodizio, tarefaChocadeira, tarefaColecaoBaixa, tarefaDepot];
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
  // o Depot tem relógio próprio (5 s): a venda sai logo depois que o pokémon entra
  const DEPOT_ESPERA_MS = 15_000;
  setInterval(async () => {
    if (rodando || !eu || !welcome || cfg.depot.modo === 'off' || !PIH.cofre || !PIH.cofre.liberado('rotina')) return;
    rodando = true;
    try { await tarefaDepot(); } catch (e) { diario(`erro em tarefaDepot: ${e.message}`, 'erro'); } finally { rodando = false; }
  }, 5_000);

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
      ${L({ icone: 'xpshare', nome: 'XP Share', alvo: 'rotina:xpshare.ligado', on: cfg.xpshare.ligado, dica: 'Põe nos postos vazios da casa quem está mais atrasado na equipe.',
        ajustes: K.mini('rotina:xpshare.trocarAtivo', cfg.xpshare.trocarAtivo, 'Tirar quem luta', 'O registrado que está lutando não ganha a fatia', trava) })}
      ${K.grupo('PvP Ranqueado')}
      ${L({ icone: 'pvp', nome: 'Equipe = time principal', alvo: 'rotina:pvp.time', on: cfg.pvp.time, dica: 'Salva no PvP a mesma equipe do time principal (as 5 vagas do campo, montadas na janela Time), o mais forte abrindo. Treinador Nv 150+.',
        status: !nivelPvp ? `o PvP abre no treinador Nv 150 (você: Nv ${eu?.level ?? '?'})` : somaPvp ? `Poder somado ${nfR.format(Math.round(somaPvp))}${tier ? ` · ${tier}` : ''}` : tier })}
      ${L({ icone: 'radar', nome: 'Fila automática', alvo: 'rotina:pvp.fila', on: cfg.pvp.fila, dica: 'Com VIP liga a fila automática do jogo; sem VIP, entra na fila quando estiver fora (no máximo a cada 3 min).',
        status: pvp.fila ? (pvp.fila.na ? 'na fila agora' : 'fora da fila') : '' })}
      ${L({ icone: 'pvp', nome: 'Tela de batalha minimizada', alvo: 'rotina:pvp.mini', on: cfg.pvp.mini !== false, dica: 'Deixa a "Tela de batalha" do PvP do jogo em Minimizada: a luta aparece na janelinha e não cobre o farm. Se você escolher "Não mostrar" no jogo, fica como você escolheu. É uma opção do próprio jogo guardada no navegador: nada vai ao servidor.',
        status: cfg.pvp.mini === false ? '' : telaPvp() === 'off' ? 'você escolheu Não mostrar' : telaPvp() === 'mini' ? 'minimizada' : 'vai para minimizada' })}
      ${K.grupo('Sem volta')}
      ${L({ icone: 'evoluir', nome: 'Evoluir', classe: 'plt-l-perigo', alvo: 'rotina:evoluir.ligado', on: cfg.evoluir.ligado, dica: 'O time evolui na hora em que chega no nível, qualquer pokémon (inicial também). Sem a pedra, compra uma no Mercado em ouro e ela não vai para a revenda. Shiny só com a Shiny Stone na mochila (essa nunca é comprada). Outland e Mega não evoluem.',
        status: cfg.evoluir.ligado ? (cfg.evoluir.escopo === 'tudo' ? 'equipe, Depot e Coleção' : 'só a equipe') : '',
        ajustes: `${K.fcampo('Quem', K.escala('rotina:evoluir.escopo', cfg.evoluir.escopo, [['equipe', 'Só a equipe'], ['tudo', 'Todos']], trava))}${K.mini('rotina:evoluir.ramificada', cfg.evoluir.ramificada, 'Cadeias com escolha', 'Eevee e outras: vai para o primeiro destino', trava)}${K.mini('rotina:evoluir.comprarPedra', cfg.evoluir.comprarPedra !== false, 'Comprar a pedra do time', 'Pokémon do time pronto para evoluir sem a pedra: compra 1 no Mercado, em ouro, pelo cofre', trava)}` })}
      ${L({ icone: 'ovo', nome: 'Chocadeira', classe: 'plt-l-perigo', alvo: 'rotina:chocadeira.ligado', on: cfg.chocadeira.ligado, dica: 'Põe na chocadeira o ovo que você tem (Shiny, P4, P3, P2).',
        ajustes: K.mini('rotina:chocadeira.comprarP2', cfg.chocadeira.comprarP2, 'Comprar P2 (100 mi)', 'Só com teto da categoria "ovos" no Cofre (padrão 0 = proibido)', trava) })}
      ${L({ icone: 'check', nome: 'Auto Coleção no ponto', alvo: 'rotina:autoColecao.ligado', on: cfg.autoColecao.ligado, status: !cfg.autoColecao.ligado ? (ultimaRegra ? `no jogo: ${resumoRegra(ultimaRegra)}` : '') : autoColecaoOk && ultimaRegra ? `no jogo: ${resumoRegra(ultimaRegra)}` : `vai salvar: Lendário · Shiny · P5+ · Nota ${String(notaMercado ?? 3.5).replace('.', ',')}+`,
        dica: 'Deixa o Auto Coleção do jogo guardando tudo o que vale mais no Mercado que no NPC: lendário/mítico, shiny, P5 e nota a partir do mínimo que o Mercado aceita (3,5 hoje, lido do jogo). Assim a venda imediata do Depot nunca leva uma oportunidade. Se alguém mudar a regra, o Piloto põe de volta. O que a regra guardou abaixo do Nv 50 (o Mercado só aceita a partir dele) e não serve para o time, o PvP ou o meta volta para o Depot e é vendido.' })}
      ${L({ icone: 'depot', nome: 'Limpar o Depot', classe: 'plt-l-perigo', alvo: 'rotina:depot.ligado', on: d.modo !== 'off', dica: 'Na hora: pokémon que entrou no Depot e não foi para a Coleção (pelo Auto Coleção do jogo) é vendido em segundos — igual ao botão "Vender todo o Depot". Antes de vender, guarda na Coleção a equipe do PvP, os shiny, os P5 e quem a janela Time tirou do campo. A Coleção, o ativo e quem segura a Exp. Share nunca vão.',
        status: `${nfR.format(noDepot)} no Depot${d.modo !== 'off' ? ` · ${d.modo === 'oferenda' ? 'oferenda' : 'vende'} assim que entra` : ''}`,
        ajustes: `${K.fcampo('Como', K.escala('rotina:depot.modo', d.modo === 'off' ? (d.ultimoModo || 'vender') : d.modo, [['vender', 'Vender ao NPC'], ['oferenda', 'Oferenda']], trava))}` })}`;
  }

  // 1.26.3 (pedido do André: "o rodízio faria mais sentido no Caçar"): o rodízio e o tier da
  // Outland mudam onde e com quem você caça — moram na aba Caçar.
  function linhasCaca(modo = 'manual') {
    const K = PIH.kit;
    const manual = modo === 'manual';
    const trava = modo === 'desligado';
    const L = (o) => K.linha({ trava, ...o, ajustes: manual ? o.ajustes : '' });
    const r = cfg.rodizio;
    return `
      ${L({ icone: 'nivel', nome: 'Rodízio do time', alvo: 'rotina:rodizio.ligado', on: r.ligado, dica: 'Cada pokémon do time luta um turno (60 min, ou o que você escolher no Manual) e entra quem está há mais tempo sem lutar, para todos ganharem XP. Com a Troca de hunt ligada, a troca é feita no Centro e o novo vai direto para a melhor hunt dele; sem ela, só entra quem mata com segurança na hunt atual. Se o ativo desmaiar, o turno dele acaba em 2 min.',
        status: r.ligado ? `um de cada vez · turno de ${r.intervaloMin} min` : '',
        ajustes: `${K.fcampo('Turno de cada um (min)', K.numero('rotina:rodizio.intervaloMin', r.intervaloMin, 10, 240, 5, trava))}` })}
      ${L({ icone: 'outland', nome: 'Tier da Outland', alvo: 'rotina:outland.ligado', on: cfg.outland.ligado, dica: 'Na Outland, sobe para o maior tier liberado: mesmo XP e ouro, drops raros ×1 a ×8.', status: eu && eu.outlandTier ? `tier ${eu.outlandTier}` : '' })}
`;
  }

  function setCaminho(caminho, v) {
    const [g, k] = caminho.split('.');
    const antes = cfg[g][k];
    cfg[g][k] = v;
    gravar();
    if (g === 'rodizio' && k === 'ligado' && v === true && antes !== true) comecarCiclo();
  }
  // Uma mudança vinda do painel (interruptor, escolha ou número). Números já chegam validados.
  // 1.42.0 (pedido do André, 29/10): a "Tela de batalha" do PvP sempre em Minimizada. É uma escolha
  // do próprio jogo guardada só neste navegador (localStorage 'pvpTelaBatalha': completa, mini ou
  // off; sem valor = completa), lida no app.js em 29/10 — nada vai ao servidor. Completa (ou sem
  // escolha) vira Minimizada; "Não mostrar" fica, porque é escolha sua.
  const CHAVE_TELA_PVP = 'pvpTelaBatalha';
  const telaPvp = () => { try { return localStorage.getItem(CHAVE_TELA_PVP); } catch { return null; } };
  function conferirTelaPvp() {
    if (!cfg.pvp.mini || !/^\/app\/?$/.test(location.pathname)) return;
    const v = telaPvp();
    if (v === 'mini' || v === 'off') return;
    try { localStorage.setItem(CHAVE_TELA_PVP, 'mini'); } catch { return; }
    diario('PvP: a tela de batalha foi para Minimizada');
    // a janela do PvP aberta agora: o botão "Minimizada" acende na próxima vez que ela se desenhar
  }
  setTimeout(conferirTelaPvp, 2000);
  setInterval(conferirTelaPvp, 20_000);
  function definir(caminho, v) {
    if (caminho === 'pvp.mini') { cfg.pvp.mini = !!v; gravar(); diario(`tela de batalha do PvP minimizada ${v ? 'ligada' : 'desligada'}`); if (v) conferirTelaPvp(); return; }
    if (caminho === 'depot.ligado') {
      if (v) cfg.depot.modo = cfg.depot.ultimoModo || 'vender';
      else { if (cfg.depot.modo !== 'off') cfg.depot.ultimoModo = cfg.depot.modo; cfg.depot.modo = 'off'; }
      gravar();
      diario(`Limpar o Depot ${v ? 'ligado' : 'desligado'}`);
      return;
    }
    if (caminho === 'depot.modo') { cfg.depot.ultimoModo = v; if (cfg.depot.modo !== 'off') cfg.depot.modo = v; gravar(); return; }
    // 1.47.0: ligar o rodízio desliga o Modo farm (no farm quem luta é o farmador)
    if (caminho === 'rodizio.ligado' && v === true && PIH.farm && PIH.farm.ativo()) PIH.farm.desligar('o rodízio foi ligado');
    setCaminho(caminho, v);
    if (typeof v === 'boolean') diario(`${caminho} ${v ? 'ligado' : 'desligado'}`);
  }
  function ligar() { /* 1.13: o painel roteia as mudanças por definir() */ }

  // Perfil do botão único: só as tarefas sem custo e reversíveis (Passe, XP Share, Outland).
  // Evoluir, chocadeira e Depot são irreversíveis e ficam como você deixou.
  function aplicar(m) {
    const rodAntes = cfg.rodizio.ligado;
    for (const k of ['passe', 'xpshare', 'outland', 'rodizio']) if (m && k in m) cfg[k].ligado = !!m[k];
    if (PIH.farm && PIH.farm.ativo()) cfg.rodizio.ligado = rodAntes; // 1.47.0: com o Modo farm o rodízio fica como está
    if (cfg.rodizio.ligado && !rodAntes) comecarCiclo();
    if (m && 'pvp' in m) { cfg.pvp.fila = !!m.pvp; cfg.pvp.time = !!m.pvp; }
    if (m && 'autoColecao' in m) cfg.autoColecao.ligado = !!m.autoColecao;
    if (m && m.depotVender && cfg.depot.modo === 'off') { cfg.depot.modo = 'vender'; cfg.depot.limiar = Math.min(cfg.depot.limiar, 50); cfg.depot.horas = Math.min(cfg.depot.horas, 1); }
    gravar();
  }
  // Para a janela Time: quanto falta para o próximo rodízio.
  function proximoRodizio() {
    const c = cfg.rodizio;
    if (!c.ligado) return '';
    const falta = faltaDoTurno();
    return falta > 0 ? `próximo em ${Math.ceil(falta / 60_000)} min` : 'troca na próxima chance';
  }
  // 1.31 (Manual liberado para o público): o rodízio é sempre por turno, um de cada vez (o cartão ⏱
  // e a fila do painel Equipe seguem essa regra). Os modos antigos 'atrasado' e 'xp' saíram da tela.
  if (cfg.rodizio.modo !== 'ciclo') { cfg.rodizio.modo = 'ciclo'; try { gravar(); } catch { /* sem armazenamento */ } }
  // 1.22, uma vez: o rodízio vira o ciclo de 1 h (pedido do André); no Auto ele já liga.
  try {
    if (!localStorage.getItem('piloto:migr:rodizio122')) {
      localStorage.setItem('piloto:migr:rodizio122', '1');
      cfg.rodizio.modo = 'ciclo'; cfg.rodizio.intervaloMin = 60;
      if (JSON.parse(localStorage.getItem('piloto:modo:v1') || 'null') === 'automatico') cfg.rodizio.ligado = true;
      gravar();
    }
  } catch { /* sem armazenamento */ }
  PIH.rotina = { html, linhasCaca, ligar, aplicar, definir, proximoRodizio, filaRodizio, resumoAutoColecao: () => resumoRegra(ultimaRegra), pvpTime: () => (Array.isArray(pvp.time) ? pvp.time.slice() : null), equipePvpAlvo: () => (eu ? equipeAlvo(Array.isArray(pvp.time) ? pvp.time : []).map((p) => p.id) : []), _interno: { cfg: () => cfg, tique, TAREFAS, marcas: () => marcas, rodCentro: () => rodCentro, andarRodCentro, VALVULA_MS, colRegra: () => colRegra, rastrearColecao, armarPasse: () => { passeLimpar = { em: Date.now(), modalAntes: false, clicouOk: false }; } } };
})(globalThis);
