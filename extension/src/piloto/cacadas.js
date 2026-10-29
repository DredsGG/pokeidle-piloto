// Caçadas (1.41.0, pedido do André em 29/10, ideias do ZaryImortal no relato #3): dois modos de caça
// que levam o time sozinho às hunts certas, no mesmo jeito do "Caçar o meta" (piloto/metacaca.js):
//
// - MELHORAR O TIME: para cada pokémon do time de campo, caça a família dele atrás de um exemplar
//   com mais Poder no nível máximo que você pode usar (a mesma fórmula do ⚔ do jogo: qualidade, IV e
//   Potência). Até 1 h por pokémon (o tempo na hunt certa). O melhor fica na Coleção (nunca vendido)
//   e vai para o XP Share treinar; quando passar o do time em Poder, a janela Time põe ele no lugar.
// - COMPLETAR A POKÉDEX: caça as espécies que você nunca capturou (a Pokédex do próprio jogo,
//   `estado.pokedex`, a mesma chave nacional da ficha). Vai à hunt segura com mais espécies faltando
//   por hora, fica até capturar ou até 45 min sem novidade ali, e passa para a próxima. Capturou,
//   a espécie entra na Pokédex: o pokémon pode seguir para a venda normal.
//
// Os dois começam desligados e só um anda por vez. Ligar um desliga o outro, o Caçar o meta e a
// Troca de hunt (e o rodízio, que volta junto com a Troca de hunt). Ligar a Troca de hunt desliga
// estes. No fim, a Troca de hunt e o rodízio voltam como estavam. Precisa de bola: VIP (Lançar sem
// Parar) ou a Pokébola automática em "Todo corpo".
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:cacadas:v1';
  const IR_A_CADA_MS = 2 * 60_000;
  const ESCOLHA_VALE_MS = 10 * 60_000;
  const MELHORAR_POR_ALVO_MS = 60 * 60_000;
  const DEX_SEM_NOVIDADE_MS = 45 * 60_000;
  const ESPERA_MS = 30 * 60_000;
  const MARGEM = 1.03;
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  // os textos que mudam (status e Diário) saem direto no idioma da pessoa
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;

  const ler = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      return {
        modo: c.modo === 'melhorar' || c.modo === 'dex' ? c.modo : null,
        alvos: Array.isArray(c.alvos) ? c.alvos : [], i: Number(c.i) || 0, vistos: Array.isArray(c.vistos) ? c.vistos : [],
        promessas: Array.isArray(c.promessas) ? c.promessas : [], dexFrio: c.dexFrio && typeof c.dexFrio === 'object' ? c.dexFrio : {},
        dexPegos: Array.isArray(c.dexPegos) ? c.dexPegos : [], huntDepois: c.huntDepois === true, rodizioDepois: c.rodizioDepois === true,
        desde: Number(c.desde) || 0, fim: c.fim || null,
      };
    } catch { return { modo: null, alvos: [], i: 0, vistos: [], promessas: [], dexFrio: {}, dexPegos: [], huntDepois: false, rodizioDepois: false, desde: 0, fim: null }; }
  };
  let cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo, modo = cfg.modo) => PIH.cofre?.diario?.(`${modo === 'dex' ? 'Pokédex' : t3('melhorar o time', 'improve the team', 'mejorar el equipo')}: ${txt}`, tipo);

  let eu = null;
  let welcome = null;
  PIH.on('estado', (e) => { eu = e; });
  PIH.on('welcome', (w) => { welcome = w; });

  const meus = () => ((eu && eu.pokemons) || []).filter((p) => p && Number.isInteger(p.id) && !p.ovo);
  const porId = (id) => meus().find((p) => p.id === id) || null;
  const podeUsar = (p) => !!p && (p.starter || (Number(p.level) || 0) <= (Number(eu && eu.level) || 0) + 5);
  const poderDe = (p) => Number(p && p.poder) || 0;
  const timeCampo = () => meus().filter((p) => p.slot != null).sort((a, b) => a.slot - b.slot);
  const nomeHunt = (slug) => ((welcome && welcome.hunts) || []).find((h) => h.slug === slug)?.nome || slug || '—';
  const F = () => PIH.meta && PIH.meta.familia;
  const ehOutland = (id) => (F() && F().ehOutland ? F().ehOutland(id) : Number(id) >= 2001 && Number(id) < 2100);
  const huntOutland = (h) => h.area === 'outland' || h.regiao === 'outland' || /outland/i.test(String(h.slug || ''));

  // ---- o "melhor": o Poder no nível máximo que você pode usar (a fórmula do ⚔ do jogo) ----------
  let N = null;
  (async () => { try { N = await import(`${location.origin}/shared/nota-pokemon.mjs`); } catch { N = null; } })();
  async function potencial(p) {
    try {
      const j = await PIH.carregarJogo();
      const e = j.especies.get(p.speciesId);
      if (!N || !N.poderDePokemon || !e) return poderDe(p);
      return N.poderDePokemon({ ...p, level: Math.max(p.level || 1, (Number(eu && eu.level) || 1) + 5) }, e);
    } catch { return poderDe(p); }
  }

  // ---- a Pokédex do jogo (chave nacional; a Outland não grava) ----------------------------------
  const chaveDex = (id) => (Number(id) <= 1025 ? Number(id) : Number(id) % 1000);
  const pegos = new Set(); // capturados nesta sessão (antes de o estado trazer a Pokédex nova)
  function jaCapturou(id) {
    if (pegos.has(id) || cfg.dexPegos.includes(id)) return true;
    const dex = (eu && eu.pokedex) || {};
    const a = dex[chaveDex(id)];
    const b = chaveDex(id) !== Number(id) ? dex[id] : null;
    return ((a && Number(a.c)) || 0) + ((b && Number(b.c)) || 0) > 0;
  }
  const temPokedex = () => !!(eu && eu.pokedex && typeof eu.pokedex === 'object');
  PIH.on('batalha.achados', (d) => {
    for (const e of (d && d.ev) || []) {
      if (e && e.k === 'capturado' && e.pokemon && Number(e.pokemon.speciesId)) {
        const id = Number(e.pokemon.speciesId);
        if (cfg.modo === 'dex' && !jaCapturou(id)) {
          cfg.dexPegos = [...cfg.dexPegos, id].slice(-2000); gravar();
          diario(t3(`capturou ${e.pokemon.nome || `#${id}`} — nova na Pokédex`, `caught ${e.pokemon.nome || `#${id}`} — new in the Pokédex`, `capturó ${e.pokemon.nome || `#${id}`} — nueva en la Pokédex`), 'ok');
          if (st.escolha) st.escolha.novidadeEm = Date.now();
        }
        pegos.add(id);
      }
    }
  });
  function faltamNaDex() {
    const out = new Map();
    for (const h of (welcome && welcome.hunts) || []) {
      if (huntOutland(h)) continue;
      for (const e of h.especies || []) {
        const id = Number(e.pokeId);
        if (!id || ehOutland(id) || out.has(id) || jaCapturou(id)) continue;
        out.set(id, true);
      }
    }
    return [...out.keys()];
  }

  // ---- ligar e desligar -----------------------------------------------------------------------
  const st = { motivo: '', escolha: null, irEm: 0, ultimaTroca: 0, farmEm: 0 };
  async function ligar(modo) {
    if (!eu || !welcome) return { ok: false, motivo: t3('o jogo ainda não carregou', "the game hasn't loaded yet", 'el juego aún no cargó') };
    if (!F() || !(await F().pronta())) return { ok: false, motivo: t3('o catálogo do jogo ainda não carregou', "the game catalog hasn't loaded yet", 'el catálogo del juego aún no cargó') };
    const nomeModo = modo === 'dex' ? t3('Completar a Pokédex', 'Complete the Pokédex', 'Completar la Pokédex') : t3('Melhorar o time', 'Improve the team', 'Mejorar el equipo');
    if (cfg.modo && cfg.modo !== modo) desligar(t3(`ligou ${nomeModo}`, `turned on ${nomeModo}`, `encendió ${nomeModo}`));
    // 1.47.0: um modo de cada vez — o Modo farm desliga (e devolve o rodízio e a Troca de hunt antes)
    try { if (PIH.farm && PIH.farm.ativo()) PIH.farm.desligar(t3(`ligou ${nomeModo}`, `turned on ${nomeModo}`, `encendió ${nomeModo}`)); } catch { /* sem farm */ }
    let alvos = [];
    if (modo === 'melhorar') {
      const time = timeCampo().filter((p) => p.stats);
      if (!time.length) return { ok: false, motivo: t3('o time de campo está vazio', 'the field team is empty', 'el equipo de campo está vacío') };
      for (const p of time) {
        const raizId = F().raizDePk(p);
        let membros = raizId != null ? F().membros(raizId) : [];
        if (!ehOutland(p.speciesId)) membros = membros.filter((m) => !ehOutland(m.id));
        if (!membros.length) membros = [{ id: p.speciesId, nome: p.nome, estagio: 0 }];
        alvos.push({ pkId: p.id, nome: p.nome, speciesId: p.speciesId, raiz: raizId, membros, base: await potencial(p), melhorId: null, melhorPot: 0, naHuntMs: 0, espera: null, semHunt: false, feito: false });
      }
    } else {
      if (!temPokedex()) return { ok: false, motivo: t3('o jogo ainda não mandou a Pokédex', "the game hasn't sent the Pokédex yet", 'el juego aún no envió la Pokédex') };
      if (!faltamNaDex().length) return { ok: false, motivo: t3('você já capturou todas as espécies que aparecem em hunt', "you've already caught every species that spawns in a hunt", 'ya capturaste todas las especies que aparecen en hunt') };
    }
    cfg = { ...cfg, modo, alvos, i: 0, vistos: meus().map((p) => p.id), desde: Date.now(), fim: null, dexFrio: {}, huntDepois: false, rodizioDepois: false };
    if (cfg.modo !== modo) cfg.modo = modo;
    // os modos de caça não andam juntos com a Troca de hunt nem com o Caçar o meta
    // o Caçar o meta tinha desligado a Troca de hunt e o rodízio: eles ficam para voltar no fim deste
    let vinhaDoMeta = false;
    try { if (PIH.metaCaca && PIH.metaCaca.ativo()) { vinhaDoMeta = true; PIH.metaCaca.desligar(t3(`ligou ${nomeModo}`, `turned on ${nomeModo}`, `encendió ${nomeModo}`)); PIH.metaCaca.religarRodizio(); } } catch { /* sem meta */ }
    if (vinhaDoMeta) cfg.huntDepois = true;
    try { if (PIH.auto && PIH.auto._interno.cfg().hunt.ligado) { cfg.huntDepois = true; gravar(); PIH.auto.definir('hunt.ligado', false); } } catch { /* sem auto */ }
    try { if (PIH.rotina && PIH.rotina._interno.cfg().rodizio.ligado) { cfg.rodizioDepois = true; PIH.rotina.definir('rodizio.ligado', false); } } catch { /* sem rotina */ }
    gravar();
    diario(modo === 'dex' ? t3(`ligado — faltam ${faltamNaDex().length} espécies que aparecem em hunt`, `on — ${faltamNaDex().length} species that spawn in a hunt are missing`, `encendido — faltan ${faltamNaDex().length} especies que aparecen en hunt`) : t3(`ligado — vai caçar um melhor de: ${alvos.map((a) => a.nome).join(', ')}`, `on — will hunt a better one of: ${alvos.map((a) => a.nome).join(', ')}`, `encendido — va a cazar uno mejor de: ${alvos.map((a) => a.nome).join(', ')}`), 'ok');
    st.escolha = null; st.indo = false; st.motivo = t3('começando…', 'starting…', 'empezando…');
    return { ok: true };
  }
  function desligar(motivo, semReligar = false) {
    if (!cfg.modo) return;
    const modo = cfg.modo;
    cfg.fim = { em: Date.now(), modo, motivo: motivo || '' };
    diario(`${t3('desligado', 'off', 'apagado')}${motivo ? ` (${motivo})` : ''}`, 'info', modo);
    cfg.modo = null;
    st.escolha = null;
    st.indo = false;
    gravar();
    if (!semReligar && !TROCA_LIGADA.test(motivo || '')) religar(modo);
  }
  // a Troca de hunt e o rodízio voltam como estavam antes de ligar
  const TROCA_LIGADA = /Troca de hunt foi ligada|hunt switching was turned on|cambio de hunt se encendió/;
  function religar(modo) {
    try { if (cfg.huntDepois && PIH.auto && !PIH.auto._interno.cfg().hunt.ligado) { PIH.auto.definir('hunt.ligado', true); diario(t3('Troca de hunt ligada de novo', 'hunt switching back on', 'cambio de hunt encendido de nuevo'), 'info', modo); } } catch { /* sem auto */ }
    try { if (cfg.rodizioDepois && PIH.rotina && !PIH.rotina._interno.cfg().rodizio.ligado) { PIH.rotina.definir('rodizio.ligado', true); diario(t3('Rodízio do time ligado de novo', 'team rotation back on', 'rotación del equipo encendida de nuevo'), 'info', modo); } } catch { /* sem rotina */ }
    cfg.huntDepois = false; cfg.rodizioDepois = false; gravar();
  }

  // ---- capturas (Melhorar o time) -------------------------------------------------------------
  const daFamilia = (a, p) => !!p && a.membros.some((m) => m.id === p.speciesId);
  async function conferirCapturas() {
    const vistos = new Set(cfg.vistos);
    const novos = meus().filter((p) => !vistos.has(p.id));
    if (!novos.length) return;
    for (const p of novos) {
      vistos.add(p.id);
      if (cfg.modo !== 'melhorar') continue;
      const a = cfg.alvos.find((x) => !x.feito && daFamilia(x, p)) || cfg.alvos.find((x) => daFamilia(x, p));
      if (!a) continue;
      const v = await potencial(p);
      if (v > a.base * MARGEM && v > a.melhorPot) {
        const antes = a.melhorId ? porId(a.melhorId) : null;
        a.melhorId = p.id; a.melhorPot = v;
        cfg.promessas = [...cfg.promessas.filter((id) => !antes || id !== antes.id), p.id].slice(-10);
        guardarNaColecao(p);
        const pct = Math.round((v / a.base - 1) * 100);
        diario(t3(`achou um ${p.nome} melhor que o ${a.nome} do time (+${pct}% de Poder no seu nível máximo) — guardado na Coleção e indo para o XP Share`, `found a ${p.nome} better than the team's ${a.nome} (+${pct}% Power at your max level) — kept in the Collection and going to the XP Share`, `encontró un ${p.nome} mejor que el ${a.nome} del equipo (+${pct}% de Poder en tu nivel máximo) — guardado en la Colección y yendo al XP Share`), 'ok');
        if (a === cfg.alvos[cfg.i]) a.feito = true;
      }
    }
    cfg.vistos = [...vistos].slice(-3000);
    gravar();
  }
  function guardarNaColecao(p) {
    const colecao = (eu && eu.automation && Array.isArray(eu.automation.pokemonTravado)) ? eu.automation.pokemonTravado : [];
    if (colecao.includes(p.id) || p.slot != null) return;
    PIH.pedir({ t: 'colecao.mover', pokemonId: p.id, para: 'colecao' }, 'cacadas');
  }
  // a promessa que já passou o do time em Poder (a janela Time pôs no time) ou sumiu sai da lista
  function podarPromessas() {
    const antes = cfg.promessas.length;
    cfg.promessas = cfg.promessas.filter((id) => { const p = porId(id); return p && p.slot == null; });
    if (cfg.promessas.length !== antes) gravar();
  }

  // ---- onde caçar -----------------------------------------------------------------------------
  const cacadores = () => meus().filter((p) => p.slot != null && p.stats && podeUsar(p) && !(p.hp != null && Number(p.hp) <= 0)).sort((a, b) => poderDe(b) - poderDe(a));
  // nota de cada hunt: encontros por hora com o que se procura (a fatia dos spawns × abates/h)
  async function escolherHunt(querId, slugsFrios = {}) {
    const hunts = ((welcome && welcome.hunts) || []).filter((h) => !huntOutland(h) && !(slugsFrios[h.slug] > Date.now()) && (h.especies || []).some((e) => querId(Number(e.pokeId))));
    if (!hunts.length) return { semHunt: true };
    const jogo = await PIH.carregarJogo();
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem: jogo.precoItem, hunts,
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu, geo: (slug) => (PIH.geo ? PIH.geo.daHunt(slug) : null), ritmoMedido: () => null,
    };
    let melhor = null;
    for (const pk of cacadores()) {
      let linhas = [];
      try { linhas = PIH.engine.analisar(pk, ctx, { soLiberadas: true, comPocao: true }).linhas || []; } catch { linhas = []; }
      for (const l of linhas) {
        if (!l || l.inviavel || PIH.engine.arriscada(l)) continue;
        const h = hunts.find((x) => x.slug === l.slug);
        if (!h) continue;
        const total = (h.especies || []).reduce((s, e) => s + (Number(e.pontos) || 0), 0) || 1;
        let nota = 0;
        const quais = [];
        for (const e of h.especies || []) {
          if (!querId(Number(e.pokeId))) continue;
          nota += (Number(l.kph) || 0) * ((Number(e.pontos) || 0) / total);
          quais.push(Number(e.pokeId));
        }
        if (nota > 0 && (!melhor || nota > melhor.nota)) melhor = { slug: h.slug, nome: h.nome, nota, quais, pkId: pk.id, pkNome: pk.nome };
      }
    }
    return melhor || { semSegura: true };
  }
  const podeTentar = (a) => !a.espera || (Number(eu && eu.level) || 0) > (Number(a.espera.nivel) || 0) || Date.now() - (Number(a.espera.em) || 0) > ESPERA_MS;

  // ---- o relógio --------------------------------------------------------------------------------
  let andando = false;
  let ultimoTique = 0;
  async function tique() {
    if (!cfg.modo || andando || !eu || !welcome) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('cacadas')) { st.motivo = t3('Piloto desligado (ou disjuntor)', 'Pilot off (or circuit breaker)', 'Piloto apagado (o disyuntor)'); return; }
    andando = true;
    const agora = Date.now();
    const passou = ultimoTique ? Math.min(agora - ultimoTique, 60_000) : 0;
    ultimoTique = agora;
    try {
      await conferirCapturas();
      podarPromessas();
      if (!cacadores().length) { st.motivo = t3('nenhum pokémon do time pode lutar', 'no team Pokémon can fight', 'ningún pokémon del equipo puede luchar'); return; }
      const alvoAtual = cfg.modo === 'melhorar' ? proximoMelhorar() : null;
      if (cfg.modo === 'melhorar' && !alvoAtual) return concluirMelhorar();
      const querId = cfg.modo === 'melhorar' ? (id) => alvoAtual.membros.some((m) => m.id === id) : (id) => !ehOutland(id) && !jaCapturou(id);
      if (cfg.modo === 'dex' && !faltamNaDex().length) { desligar(t3('todas as espécies que aparecem em hunt já estão na Pokédex', 'every species that spawns in a hunt is in the Pokédex', 'todas las especies que aparecen en hunt ya están en la Pokédex')); return; }
      // a escolha da hunt vale 10 min; no modo Pokédex, troca quando a hunt fica sem espécie faltando ou 45 min sem novidade
      if (st.escolha && cfg.modo === 'dex') {
        const ainda = st.escolha.quais.some((id) => querId(id));
        if (!ainda || agora - (st.escolha.novidadeEm || st.escolha.em) > DEX_SEM_NOVIDADE_MS) {
          if (ainda) { cfg.dexFrio[st.escolha.slug] = agora + 3 * 3_600_000; gravar(); diario(t3(`45 min sem espécie nova em ${st.escolha.nome} — vou para outra hunt (volto a ela em 3 h)`, `45 min with no new species in ${st.escolha.nome} — moving to another hunt (back to it in 3 h)`, `45 min sin especie nueva en ${st.escolha.nome} — voy a otra hunt (vuelvo a ella en 3 h)`)); }
          st.escolha = null;
        }
      }
      const chaveAlvo = cfg.modo === 'melhorar' ? `m${cfg.i}` : 'dex';
      if (!st.escolha || st.escolha.chave !== chaveAlvo || (cfg.modo === 'melhorar' && agora - st.escolha.em > ESCOLHA_VALE_MS)) {
        const h = await escolherHunt(querId, cfg.modo === 'dex' ? cfg.dexFrio : {});
        if (h.semHunt) {
          if (cfg.modo === 'melhorar') { alvoAtual.semHunt = true; alvoAtual.feito = true; gravar(); diario(t3(`${alvoAtual.nome}: a família não aparece em nenhuma hunt (vem de boss ou ovo) — pula`, `${alvoAtual.nome}: the family doesn't spawn in any hunt (comes from bosses or eggs) — skipped`, `${alvoAtual.nome}: la familia no aparece en ninguna hunt (viene de boss o huevo) — se salta`), 'aviso'); return; }
          cfg.dexFrio = {}; gravar(); st.motivo = t3('nenhuma hunt com espécie faltando', 'no hunt with a missing species', 'ninguna hunt con especie faltante'); return;
        }
        if (h.semSegura) {
          if (cfg.modo === 'melhorar') { alvoAtual.espera = { em: agora, nivel: Number(eu.level) || 0 }; gravar(); diario(t3(`${alvoAtual.nome}: nenhuma hunt segura onde a família aparece — tento de novo quando o treinador subir de nível ou em 30 min`, `${alvoAtual.nome}: no safe hunt where the family spawns — trying again when the trainer levels up or in 30 min`, `${alvoAtual.nome}: ninguna hunt segura donde aparece la familia — lo intento de nuevo cuando el entrenador suba de nivel o en 30 min`), 'aviso'); }
          st.escolha = null;
          return farmarEsperando(cfg.modo === 'dex' ? t3('as espécies que faltam', 'the missing species', 'las especies que faltan') : alvoAtual.nome);
        }
        st.escolha = { ...h, chave: chaveAlvo, em: agora, novidadeEm: st.escolha && st.escolha.slug === h.slug ? st.escolha.novidadeEm : agora };
      }
      const e = st.escolha;
      const pk = porId(e.pkId) || cacadores()[0];
      if (eu.activeId !== pk.id && agora - st.ultimaTroca > 60_000) { st.ultimaTroca = agora; PIH.pedir({ t: 'team.active', pokemonId: pk.id }, 'cacadas'); diario(t3(`${pk.nome} (⚔ ${nf.format(poderDe(pk))}) entra para caçar em ${e.nome}`, `${pk.nome} (⚔ ${nf.format(poderDe(pk))}) steps in to hunt in ${e.nome}`, `${pk.nome} (⚔ ${nf.format(poderDe(pk))}) entra a cazar en ${e.nome}`)); }
      const nQ = e.quais.filter((id) => querId(id)).length;
      const alvoTxt = cfg.modo === 'melhorar' ? t3(`um ${alvoAtual.nome} melhor`, `a better ${alvoAtual.nome}`, `un ${alvoAtual.nome} mejor`) : t3(`${nQ} espécie(s) que faltam`, `${nQ} missing species`, `${nQ} especie(s) que faltan`);
      if (eu.huntSlug !== e.slug || eu.noCentro) {
        if (PIH.auto && !PIH.auto.rotinaAtual() && agora - st.irEm > IR_A_CADA_MS) {
          st.irEm = agora;
          const r = PIH.auto.irParaHunt(e.slug);
          st.motivo = r.ok ? t3(`indo para ${e.nome} atrás de ${alvoTxt}`, `going to ${e.nome} after ${alvoTxt}`, `yendo a ${e.nome} tras ${alvoTxt}`) : t3(`não deu para ir a ${e.nome}: ${r.motivo}`, `couldn't go to ${e.nome}: ${r.motivo}`, `no se pudo ir a ${e.nome}: ${r.motivo}`);
        } else if (!st.indo) st.motivo = t3(`a caminho de ${e.nome} (atrás de ${alvoTxt})`, `on the way to ${e.nome} (after ${alvoTxt})`, `camino a ${e.nome} (tras ${alvoTxt})`);
        st.indo = true;
        return;
      }
      st.indo = false;
      if (cfg.modo === 'melhorar') { alvoAtual.naHuntMs = (alvoAtual.naHuntMs || 0) + passou; gravar(); }
      const captura = PIH.captura && PIH.captura.resumo ? PIH.captura.resumo() : null;
      const semBola = captura && !captura.vip && (!captura.ligado || captura.modo === 'shiny');
      const min = Math.max(1, Math.ceil((MELHORAR_POR_ALVO_MS - (alvoAtual ? alvoAtual.naHuntMs : 0)) / 60_000));
      const resta = cfg.modo === 'melhorar' ? t3(` · ${min} min para o próximo`, ` · ${min} min to the next`, ` · ${min} min para el siguiente`) : '';
      st.motivo = t3(`caçando ${alvoTxt} em ${e.nome}`, `hunting ${alvoTxt} in ${e.nome}`, `cazando ${alvoTxt} en ${e.nome}`) + resta + (semBola ? t3(' · ligue a Pokébola automática em "Todo corpo"!', ' · turn on the automatic Poké Ball on "Every body"!', ' · ¡enciende la Pokébola automática en "Todo cuerpo"!') : '');
    } catch (err) { st.motivo = t3('não consegui calcular', "couldn't calculate", 'no pude calcular'); console.warn('[piloto] cacadas:', err); } finally { andando = false; }
  }
  // Melhorar: o alvo atual, ou o próximo (passou 1 h na hunt dele, ou achou um melhor)
  function proximoMelhorar() {
    while (cfg.i < cfg.alvos.length) {
      const a = cfg.alvos[cfg.i];
      if (a.feito || a.semHunt || (a.naHuntMs || 0) >= MELHORAR_POR_ALVO_MS || !porId(a.pkId)) {
        if (!a.feito) { a.feito = true; diario(a.melhorId ? t3(`${a.nome}: achou um melhor — próximo`, `${a.nome}: found a better one — next`, `${a.nome}: encontró uno mejor — siguiente`) : t3(`${a.nome}: 1 h caçando e nenhum melhor — próximo`, `${a.nome}: 1 h hunting and none better — next`, `${a.nome}: 1 h cazando y ninguno mejor — siguiente`)); }
        cfg.i++; st.escolha = null; gravar();
        continue;
      }
      if (!podeTentar(a)) {
        // esperando hunt segura: tenta o próximo e volta a este depois
        const outro = cfg.alvos.findIndex((x, k) => k > cfg.i && !x.feito && podeTentar(x));
        if (outro < 0) return a;
        const [x] = cfg.alvos.splice(cfg.i, 1); cfg.alvos.push(x); gravar();
        continue;
      }
      return a;
    }
    return null;
  }
  function concluirMelhorar() {
    const achados = cfg.alvos.filter((a) => a.melhorId && porId(a.melhorId));
    const lista = achados.map((a) => `${porId(a.melhorId).nome} (${a.nome})`).join(', ');
    diario(achados.length ? t3(`terminou: achou ${achados.length} melhor(es) — ${lista}. Eles treinam no XP Share e entram no time quando passarem em Poder.`, `done: found ${achados.length} better — ${lista}. They train in the XP Share and join the team once they pass in Power.`, `terminó: encontró ${achados.length} mejor(es) — ${lista}. Entrenan en el XP Share y entran al equipo cuando superen en Poder.`) : t3('terminou: nenhum exemplar melhor desta vez', 'done: no better one this time', 'terminó: ninguno mejor esta vez'), 'ok');
    desligar(t3('passou por todo o time', 'went through the whole team', 'pasó por todo el equipo'));
  }
  async function farmarEsperando(oQue) {
    const pk = cacadores()[0];
    st.motivo = t3(`esperando hunt segura para ${oQue} · farmando XP enquanto isso`, `waiting for a safe hunt for ${oQue} · farming XP meanwhile`, `esperando una hunt segura para ${oQue} · farmeando XP mientras tanto`);
    if (!pk || !PIH.auto || PIH.auto.rotinaAtual() || Date.now() - st.farmEm < IR_A_CADA_MS) return;
    st.farmEm = Date.now();
    if (eu.activeId !== pk.id) { PIH.pedir({ t: 'team.active', pokemonId: pk.id }, 'cacadas'); return; }
    const m = PIH.auto.melhorHuntPara ? await PIH.auto.melhorHuntPara(pk.id) : null;
    if (m && m.slug && (eu.huntSlug !== m.slug || eu.noCentro)) PIH.auto.irParaHunt(m.slug);
  }
  setInterval(() => { tique(); }, 10_000);

  // ---- para os outros módulos -------------------------------------------------------------------
  // guardados: as promessas e, enquanto o Melhorar caça, toda a família do alvo (até ser avaliada)
  const protegidos = () => cfg.promessas.slice();
  const especiesAlvo = () => (cfg.modo === 'melhorar' ? cfg.alvos.filter((a) => !a.feito).flatMap((a) => a.membros.map((m) => m.id)) : []);
  // o XP Share treina primeiro as promessas (as que ainda não estão no time)
  const treinar = () => cfg.promessas.map(porId).filter((p) => p && p.slot == null);

  // ---- as linhas na aba Caçar -------------------------------------------------------------------
  function linhas(modo) {
    const trava = modo === 'desligado';
    const sMel = cfg.modo === 'melhorar'
      ? `${Math.min(cfg.i + 1, cfg.alvos.length)}/${cfg.alvos.length} · ${esc(st.motivo || t3('começando…', 'starting…', 'empezando…'))}`
      : cfg.promessas.length ? t3(`${cfg.promessas.length} melhor(es) treinando no XP Share`, `${cfg.promessas.length} better one(s) training in the XP Share`, `${cfg.promessas.length} mejor(es) entrenando en el XP Share`) : t3('desligado', 'off', 'apagado');
    const faltam = welcome && eu ? faltamNaDex().length : null;
    const sDex = cfg.modo === 'dex' ? `${t3('faltam', 'missing', 'faltan')} ${faltam ?? '?'} · ${esc(st.motivo || t3('começando…', 'starting…', 'empezando…'))}`
      : !temPokedex() ? t3('esperando a Pokédex do jogo', "waiting for the game's Pokédex", 'esperando la Pokédex del juego')
        : faltam != null ? t3(`faltam ${faltam} espécies que aparecem em hunt`, `${faltam} species that spawn in a hunt are missing`, `faltan ${faltam} especies que aparecen en hunt`) : t3('desligado', 'off', 'apagado');
    const semTr = (x) => `<span data-sem-traducao="1">${x}</span>`;
    const lista = cfg.modo === 'melhorar' && cfg.alvos.length ? `<div class="plt-an">${cfg.alvos.map((a, k) => {
      const m = a.melhorId ? porId(a.melhorId) : null;
      const est = m ? `<span class="plt-meta-tem on" data-sem-traducao="1">${t3('achou', 'found', 'encontró')}: ${esc(m.nome)} ${t3('Nv', 'Lv', 'Nv')} ${nf.format(m.level || 0)}</span>`
        : a.semHunt ? '<span class="plt-meta-tem plt-meta-falta">não aparece em hunt</span>'
          : a.feito ? '<span class="plt-meta-tem">nenhum melhor</span>'
            : k === cfg.i ? '<span class="plt-meta-tem plt-meta-cacando">caçando</span>' : '<span class="plt-meta-tem">na fila</span>';
      return `<div class="plt-an-l"><span class="plt-an-nome"><b>${esc(a.nome)}</b><small>${esc(a.membros.map((x) => x.nome).join(' → '))}</small></span><span class="plt-an-acoes">${est}</span></div>`;
    }).join('')}</div>` : '';
    return `${K.grupo('Caçadas')}${K.linha({ id: 'cacadas-melhorar', icone: 'cacar', nome: 'Melhorar o time', alvo: 'cacadas:melhorar', on: cfg.modo === 'melhorar', trava, status: semTr(sMel),
      dica: 'Para cada pokémon do time de campo, caça a família dele (até 1 h por pokémon) atrás de um exemplar com mais Poder no nível máximo que você pode usar — qualidade, IV e Potência, a fórmula do ⚔ do jogo. O melhor vai para a Coleção (nunca vendido) e treina no XP Share; quando passar o do time em Poder, entra no lugar. Ligar desliga a Troca de hunt, o rodízio, o Caçar o meta e o Completar a Pokédex; no fim, a Troca de hunt e o rodízio voltam. Precisa de bola: VIP ou a Pokébola automática em "Todo corpo".' })}${lista}${K.linha({ id: 'cacadas-dex', icone: 'bola', nome: 'Completar a Pokédex', alvo: 'cacadas:dex', on: cfg.modo === 'dex', trava, status: semTr(sDex),
      dica: 'Caça as espécies que você nunca capturou (pela Pokédex do próprio jogo). Vai à hunt segura com mais espécies faltando por hora e fica até capturar todas de lá, ou até 45 min sem novidade (aí troca de hunt). Capturou, a espécie entra na Pokédex e o pokémon segue o caminho normal (Coleção ou venda). A Outland fica de fora (não conta na Pokédex). Ligar desliga a Troca de hunt, o rodízio, o Caçar o meta e o Melhorar o time; no fim, voltam. Precisa de bola: VIP ou a Pokébola automática em "Todo corpo".' })}`;
  }
  async function definir(caminho, v) {
    if (caminho !== 'melhorar' && caminho !== 'dex') return null;
    if (v) { const r = await ligar(caminho); if (!r.ok) { st.motivo = r.motivo; diario(`${t3('não liguei', "didn't turn on", 'no encendí')}: ${r.motivo}`, 'aviso', caminho); } return r; }
    if (cfg.modo === caminho) desligar(t3('você desligou', 'you turned it off', 'lo apagaste'));
    return null;
  }

  PIH.cacadas = { linhas, definir, desligar, ativo: () => !!cfg.modo, modo: () => cfg.modo, protegidos, especiesAlvo, treinar, _interno: { cfg: () => cfg, st, tique, escolherHunt, faltamNaDex, jaCapturou, conferirCapturas, proximoMelhorar, potencial } };
})(globalThis);
