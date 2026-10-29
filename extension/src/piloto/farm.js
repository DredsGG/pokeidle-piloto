// Modo farm (1.47.0, pedido do André em 29/10): o Piloto acha o pokémon que mais rende XP (do
// treinador e do próprio pokémon) no seu nível e farma com ele, sem parar.
//
// Como acha o "melhor farmador": o mesmo motor da aba Caçar (hunt/engine.js) simula cada espécie que
// você consegue ter — as que aparecem nas hunts liberadas (fora a Outland) e as evoluções delas — no
// nível máximo que você pode usar (treinador + 5), com um exemplar típico (IV 16, qualidade 1,2, sem
// TM), em cada hunt liberada, com o mesmo corte de risco da Troca de hunt. Fica a de mais XP por hora
// (XP do treinador + XP do pokémon: no jogo os dois vêm do mesmo abate). Os seus pokémon entram com os
// números de verdade (nível, IV, qualidade, TM AoE): se um seu render pelo menos 90% do melhor, ele
// mesmo é o farmador e nada é capturado.
//
// Depois:
// - já tem alguém da família do escolhido (ele ou quem evolui até ele): o seu melhor vira o principal;
// - não tem: vai à hunt onde a família aparece mais, captura um e ele entra NA HORA como principal
//   (pedido do André: sobe de nível lutando);
// - o principal entra no time de campo (a janela Time faz a troca no Centro) e vira o ativo; a Troca de
//   hunt fica ligada e leva para a melhor hunt dele; ele evolui sozinho até o escolhido, mesmo com o
//   Evoluir da Rotina desligado (comprando a pedra, em ouro, pelo Cofre, se a Rotina deixar comprar);
// - recalcula 1x por dia e quando abre hunt nova (região nova): achou um melhor, repete o ciclo.
//
// Ligar desliga o rodízio, o Caçar o meta, o Melhorar o time e o Completar a Pokédex (e o "Fazer
// sozinho" do meta fica parado). Ligar qualquer um deles desliga o Modo farm. Desligar o Modo farm
// devolve o rodízio e a Troca de hunt como estavam antes.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:farm:v1';
  const RECALC_MS = 24 * 3_600_000;
  const IR_A_CADA_MS = 2 * 60_000;
  const ATIVO_A_CADA_MS = 60_000;
  const MARGEM_SEU = 0.9; // um seu com 90% do melhor já serve (não vale capturar e começar do zero)
  const MAX_HUNTS = 60; // as hunts liberadas de nível mais alto (o XP por abate cresce com o nível)
  const IV_TIPICO = 16;
  const QUALIDADE_TIPICA = 1.2;
  const MAX_ESPECIES = 120; // as de mais ataque (o motor roda nelas; centenas de espécies travariam a aba)
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;
  const curto = (v) => { const n = Number(v) || 0; return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : nf.format(n); };

  const ler = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      return {
        ligado: c.ligado === true, alvo: c.alvo && typeof c.alvo === 'object' ? c.alvo : null, pkId: Number.isInteger(c.pkId) ? c.pkId : null,
        vistos: Array.isArray(c.vistos) ? c.vistos : [], huntAntes: c.huntAntes === true, rodizioDepois: c.rodizioDepois === true,
        campo: c.campo && typeof c.campo === 'object' ? c.campo : null, desde: Number(c.desde) || 0, fim: c.fim || null,
      };
    } catch { return { ligado: false, alvo: null, pkId: null, vistos: [], huntAntes: false, rodizioDepois: false, campo: null, desde: 0, fim: null }; }
  };
  let cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`${t3('farm', 'farm', 'farm')}: ${txt}`, tipo);

  let eu = null;
  let welcome = null;
  PIH.on('estado', (e) => { eu = e; });
  PIH.on('welcome', (w) => { welcome = w; });

  const meus = () => ((eu && eu.pokemons) || []).filter((p) => p && Number.isInteger(p.id) && !p.ovo);
  const porId = (id) => meus().find((p) => p.id === id) || null;
  const podeUsar = (p) => !!p && (p.starter || (Number(p.level) || 0) <= (Number(eu && eu.level) || 0) + 5);
  const poderDe = (p) => Number(p && p.poder) || 0;
  const F = () => PIH.meta && PIH.meta.familia;
  const ehOutland = (id) => (F() && F().ehOutland ? F().ehOutland(id) : Number(id) >= 2001 && Number(id) < 2100);
  const huntOutland = (h) => h.area === 'outland' || h.regiao === 'outland' || /outland/i.test(String(h.slug || ''));
  const nivelMax = () => (Number(eu && eu.level) || 1) + 5;

  // ---- o motor ---------------------------------------------------------------------------------
  function contexto(jogo, hunts) {
    return {
      mod: jogo.mod, especies: jogo.especies, precoItem: jogo.precoItem, hunts,
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu, geo: (slug) => (PIH.geo ? PIH.geo.daHunt(slug) : null), ritmoMedido: () => null,
    };
  }
  // stats de um exemplar típico no nível L (a fórmula do jogo: (base + 2·IV) × L/100 × qualidade^expo)
  const BASE = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' };
  function tipico(esp, nivel) {
    const stats = {};
    const ivs = {};
    for (const [k, b] of Object.entries(BASE)) {
      const expo = k === 'hp' || k === 'speed' ? 0.95 : 0.8;
      stats[k] = Math.max(1, Math.round(((Number(esp[b]) || 0) + 2 * IV_TIPICO) * (nivel / 100) * QUALIDADE_TIPICA ** expo));
      ivs[k] = IV_TIPICO;
    }
    const tipos = [esp.type1, esp.type2].filter(Boolean);
    return { id: -esp.pokeId, speciesId: esp.pokeId, nome: esp.name, level: nivel, stats, ivs, quality: QUALIDADE_TIPICA, potencia: 1, tipos, tmAoe: false, tmElemental: null };
  }
  const nota = (l) => (Number(l.xpTreinadorH) || 0) + (Number(l.xpPokemonH) || 0);
  function melhorLinha(pk, ctx) {
    let linhas = [];
    try { linhas = PIH.engine.analisar(pk, ctx, { soLiberadas: true, comPocao: true }).linhas || []; } catch { linhas = []; }
    let m = null;
    for (const l of linhas) { if (!l || l.inviavel || PIH.engine.arriscada(l)) continue; if (!m || nota(l) > nota(m)) m = l; }
    return m;
  }
  const pausa = () => new Promise((r) => setTimeout(r, 0));

  // As hunts liberadas (fora a Outland), as de nível mais alto primeiro; e quem nasce nelas.
  async function huntsLiberadas(jogo) {
    const todas = ((welcome && welcome.hunts) || []).filter((h) => !huntOutland(h));
    const ref = meus().find((p) => p.id === (eu && eu.activeId) && p.stats) || meus().find((p) => p.stats);
    if (!ref) return [];
    let linhas = [];
    try { linhas = PIH.engine.analisar(ref, contexto(jogo, todas), { soLiberadas: true, comPocao: true }).linhas || []; } catch { linhas = []; }
    const nivelDe = new Map(linhas.map((l) => [l.slug, Number(l.nivel) || 0]));
    return todas.filter((h) => nivelDe.has(h.slug)).sort((a, b) => nivelDe.get(b.slug) - nivelDe.get(a.slug));
  }
  // as espécies que você consegue ter: quem nasce nas hunts liberadas e as evoluções delas, com o
  // nível mínimo para chegar lá (o maior "evolui no Nv" do caminho)
  function alcancaveis(hunts, jogo) {
    const out = new Map(); // speciesId -> { nivelMin }
    for (const h of hunts) {
      for (const e of h.especies || []) {
        let id = Number(e.pokeId);
        if (!id || ehOutland(id) || id >= 2000) continue;
        let nivelMin = 1;
        for (let i = 0; i < 6 && id; i++) {
          const esp = jogo.especies.get(id);
          if (!esp) break;
          if (!out.has(id) || out.get(id).nivelMin > nivelMin) out.set(id, { nivelMin });
          if (!esp.evolvesToId || esp.evolvesToId >= 2000) break;
          nivelMin = Math.max(nivelMin, Number(esp.evolveLevel) || 0);
          id = esp.evolvesToId;
        }
      }
    }
    return out;
  }

  // ---- calcular o melhor -------------------------------------------------------------------------
  const st = { motivo: '', calculando: false, escolha: null, irEm: 0, ativoEm: 0, huntEm: 0, ranking: [], nLiberadas: 0 };
  async function calcular() {
    if (st.calculando || !eu || !welcome || !PIH.engine || !PIH.carregarJogo) return null;
    st.calculando = true;
    st.motivo = t3('calculando o melhor farmador…', 'working out the best farmer…', 'calculando el mejor farmeador…');
    try {
      const jogo = await PIH.carregarJogo();
      if (F() && F().pronta) await F().pronta();
      const lib = await huntsLiberadas(jogo);
      if (!lib.length) return null;
      st.nLiberadas = lib.length;
      const hunts = lib.slice(0, MAX_HUNTS);
      const ctx = contexto(jogo, hunts);
      const L = nivelMax();
      const ranking = [];
      let n = 0;
      const t0 = Date.now();
      // só as de mais ataque passam pelo motor: o farmador mata rápido (ataque/ataque especial e Speed)
      const forca = (e) => Math.max(Number(e.baseAtk) || 0, Number(e.baseSpAtk) || 0) * 2 + (Number(e.baseSpeed) || 0);
      const cands = [...alcancaveis(lib, jogo)].filter(([, v]) => v.nivelMin <= L).map(([id]) => jogo.especies.get(id)).filter(Boolean)
        .sort((a, b) => forca(b) - forca(a)).slice(0, MAX_ESPECIES);
      for (const esp of cands) {
        const id = esp.pokeId;
        const l = melhorLinha(tipico(esp, L), ctx);
        if (l) ranking.push({ speciesId: id, nome: esp.name, xpH: nota(l), slug: l.slug, hunt: l.nome });
        if (++n % 6 === 0) await pausa();
      }
      ranking.sort((a, b) => b.xpH - a.xpH);
      st.calculo = { especies: cands.length, hunts: hunts.length, ms: Date.now() - t0 };
      // os seus, com os números de verdade
      const seus = [];
      for (const p of meus().filter((x) => x.stats && podeUsar(x) && !ehOutland(x.speciesId)).sort((a, b) => poderDe(b) - poderDe(a)).slice(0, 15)) {
        const l = melhorLinha(p, ctx);
        if (l) seus.push({ pkId: p.id, speciesId: p.speciesId, nome: p.nome, level: p.level, xpH: nota(l), hunt: l.nome });
        await pausa();
      }
      seus.sort((a, b) => b.xpH - a.xpH);
      st.ranking = ranking.slice(0, 5);
      const top = ranking[0] || null;
      const meu = seus[0] || null;
      if (!top && !meu) return null;
      let alvo;
      if (meu && (!top || meu.xpH >= top.xpH * MARGEM_SEU)) {
        alvo = { speciesId: meu.speciesId, nome: meu.nome, xpH: meu.xpH, pkId: meu.pkId, seu: true };
      } else {
        // já tem alguém da família do melhor (ele ou quem evolui até ele)? o seu melhor dela
        const daFamilia = meus().filter((p) => F() && F().serve && F().serve(p, { speciesId: top.speciesId, nome: top.nome }) && podeUsar(p)).sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0) || poderDe(b) - poderDe(a))[0] || null;
        alvo = { speciesId: top.speciesId, nome: top.nome, xpH: top.xpH, pkId: daFamilia ? daFamilia.id : null, seu: false };
      }
      alvo.calcEm = Date.now(); alvo.liberadas = lib.length; alvo.nivel = L;
      return alvo;
    } catch (err) { console.warn('[piloto] farm:', err); return null; } finally { st.calculando = false; }
  }
  async function escolher(motivo) {
    const a = await calcular();
    if (!cfg.ligado) return;
    if (!a) { st.motivo = t3('não consegui calcular (nenhuma hunt segura?)', "couldn't calculate (no safe hunt?)", 'no pude calcular (¿ninguna hunt segura?)'); return; }
    const antes = cfg.alvo;
    cfg.alvo = a;
    const mudou = !antes || antes.speciesId !== a.speciesId;
    if (mudou || !cfg.pkId || !porId(cfg.pkId)) cfg.pkId = a.pkId || null;
    cfg.vistos = meus().map((p) => p.id);
    gravar();
    if (mudou) {
      diario(a.seu
        ? t3(`${motivo}: o melhor farmador é o seu ${a.nome} (~${curto(a.xpH)} XP/h) — ele vira o principal`, `${motivo}: the best farmer is your ${a.nome} (~${curto(a.xpH)} XP/h) — it becomes the main one`, `${motivo}: el mejor farmeador es tu ${a.nome} (~${curto(a.xpH)} XP/h) — pasa a ser el principal`)
        : a.pkId
          ? t3(`${motivo}: o melhor farmador é ${a.nome} (~${curto(a.xpH)} XP/h no Nv ${nf.format(a.nivel)}) — você já tem ${porId(a.pkId).nome}: ele vira o principal`, `${motivo}: the best farmer is ${a.nome} (~${curto(a.xpH)} XP/h at Lv ${nf.format(a.nivel)}) — you already have ${porId(a.pkId).nome}: it becomes the main one`, `${motivo}: el mejor farmeador es ${a.nome} (~${curto(a.xpH)} XP/h en Nv ${nf.format(a.nivel)}) — ya tienes ${porId(a.pkId).nome}: pasa a ser el principal`)
          : t3(`${motivo}: o melhor farmador é ${a.nome} (~${curto(a.xpH)} XP/h no Nv ${nf.format(a.nivel)}) — você não tem: vou capturar um`, `${motivo}: the best farmer is ${a.nome} (~${curto(a.xpH)} XP/h at Lv ${nf.format(a.nivel)}) — you don't have one: going to catch it`, `${motivo}: el mejor farmeador es ${a.nome} (~${curto(a.xpH)} XP/h en Nv ${nf.format(a.nivel)}) — no lo tienes: voy a capturarlo`), 'ok');
    }
    st.escolha = null;
  }

  // ---- ligar e desligar ---------------------------------------------------------------------------
  async function ligar() {
    if (!eu || !welcome) return { ok: false, motivo: t3('o jogo ainda não carregou', "the game hasn't loaded yet", 'el juego aún no cargó') };
    if (!F() || !(await F().pronta())) return { ok: false, motivo: t3('o catálogo do jogo ainda não carregou', "the game catalog hasn't loaded yet", 'el catálogo del juego aún no cargó') };
    const nome = t3('ligou o Modo farm', 'turned on Farm mode', 'encendió el Modo farm');
    // um modo de cada vez
    try { if (PIH.metaCaca && PIH.metaCaca.ativo()) { PIH.metaCaca.desligar(nome); PIH.metaCaca.religarRodizio?.(); } } catch { /* sem meta */ }
    try { if (PIH.cacadas && PIH.cacadas.ativo()) PIH.cacadas.desligar(nome); } catch { /* sem caçadas */ }
    cfg = { ...cfg, ligado: true, alvo: null, pkId: null, desde: Date.now(), fim: null, huntAntes: false, rodizioDepois: false, campo: null, vistos: meus().map((p) => p.id) };
    try { cfg.huntAntes = !!PIH.auto._interno.cfg().hunt.ligado; } catch { /* sem auto */ }
    try { if (PIH.rotina && PIH.rotina._interno.cfg().rodizio.ligado) { cfg.rodizioDepois = true; PIH.rotina.definir('rodizio.ligado', false); diario(t3('rodízio desligado (volta quando o Modo farm desligar)', 'rotation off (comes back when Farm mode turns off)', 'rotación apagada (vuelve cuando se apague el Modo farm)')); } } catch { /* sem rotina */ }
    gravar();
    diario(t3('ligado', 'on', 'encendido'), 'ok');
    st.escolha = null; st.motivo = t3('começando…', 'starting…', 'empezando…');
    escolher(t3('ligado', 'on', 'encendido'));
    return { ok: true };
  }
  function desligar(motivo, semDevolver = false) {
    if (!cfg.ligado) return;
    cfg.ligado = false;
    cfg.fim = { em: Date.now(), motivo: motivo || '' };
    gravar();
    diario(`${t3('desligado', 'off', 'apagado')}${motivo ? ` (${motivo})` : ''}`);
    st.escolha = null;
    if (semDevolver) { cfg.rodizioDepois = false; cfg.campo = null; gravar(); return; }
    // o que o Modo farm mexeu volta como estava
    try { if (!cfg.huntAntes && PIH.auto && PIH.auto._interno.cfg().hunt.ligado) PIH.auto.definir('hunt.ligado', false); } catch { /* sem auto */ }
    try { if (cfg.rodizioDepois && PIH.rotina && !PIH.rotina._interno.cfg().rodizio.ligado) { PIH.rotina.definir('rodizio.ligado', true); diario(t3('rodízio ligado de novo', 'rotation back on', 'rotación encendida de nuevo')); } } catch { /* sem rotina */ }
    try { if (cfg.campo && cfg.campo.mexeu && PIH.time && PIH.time.campoDoFarm) PIH.time.campoDoFarm(false, cfg.campo.raw); } catch { /* sem time */ }
    cfg.rodizioDepois = false; cfg.campo = null; gravar();
  }

  // ---- capturar (quando você não tem) -----------------------------------------------------------
  const membrosAlvo = () => (cfg.alvo && F() && F().membrosDoMeta ? F().membrosDoMeta({ speciesId: cfg.alvo.speciesId, nome: cfg.alvo.nome }).filter((m) => !ehOutland(m.id) || m.id === cfg.alvo.speciesId) : []);
  function conferirCapturas() {
    const vistos = new Set(cfg.vistos);
    const novos = meus().filter((p) => !vistos.has(p.id));
    if (!novos.length) return;
    const ids = new Set(membrosAlvo().map((m) => m.id));
    for (const p of novos) {
      vistos.add(p.id);
      if (!cfg.pkId && ids.has(p.speciesId)) {
        cfg.pkId = p.id;
        diario(t3(`capturou ${p.nome} (Nv ${p.level}) — ele vira o principal agora e sobe de nível farmando`, `caught ${p.nome} (Lv ${p.level}) — it becomes the main one now and levels up farming`, `capturó ${p.nome} (Nv ${p.level}) — pasa a ser el principal ahora y sube de nivel farmeando`), 'ok');
      }
    }
    cfg.vistos = [...vistos].slice(-3000);
    gravar();
  }
  const cacadores = () => meus().filter((p) => p.slot != null && p.stats && podeUsar(p) && !(p.hp != null && Number(p.hp) <= 0)).sort((a, b) => poderDe(b) - poderDe(a));
  async function huntDeCaptura() {
    const ids = new Set(membrosAlvo().map((m) => m.id));
    const hunts = ((welcome && welcome.hunts) || []).filter((h) => !huntOutland(h) && (h.especies || []).some((e) => ids.has(Number(e.pokeId))));
    if (!hunts.length) return { semHunt: true };
    const jogo = await PIH.carregarJogo();
    const ctx = contexto(jogo, hunts);
    let melhor = null;
    for (const pk of cacadores()) {
      let linhas = [];
      try { linhas = PIH.engine.analisar(pk, ctx, { soLiberadas: true, comPocao: true }).linhas || []; } catch { linhas = []; }
      for (const l of linhas) {
        if (!l || l.inviavel || PIH.engine.arriscada(l)) continue;
        const h = hunts.find((x) => x.slug === l.slug);
        if (!h) continue;
        const total = (h.especies || []).reduce((s, e) => s + (Number(e.pontos) || 0), 0) || 1;
        const fatia = (h.especies || []).filter((e) => ids.has(Number(e.pokeId))).reduce((s, e) => s + (Number(e.pontos) || 0), 0) / total;
        const v = (Number(l.kph) || 0) * fatia;
        if (v > 0 && (!melhor || v > melhor.v)) melhor = { slug: h.slug, nome: h.nome, v, pkId: pk.id };
      }
    }
    return melhor || { semSegura: true };
  }

  // ---- o relógio ----------------------------------------------------------------------------------
  let andando = false;
  async function tique() {
    if (!cfg.ligado || andando || !eu || !welcome) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('farm')) { st.motivo = t3('Piloto desligado (ou disjuntor)', 'Pilot off (or circuit breaker)', 'Piloto apagado (o disyuntor)'); return; }
    andando = true;
    const agora = Date.now();
    try {
      // recalcula 1x por dia e quando abre hunt nova
      if (!cfg.alvo) { if (!st.calculando) await escolher(t3('ligado', 'on', 'encendido')); return; }
      if (!st.calculando && (agora - (cfg.alvo.calcEm || 0) > RECALC_MS || (st.nLiberadas && cfg.alvo.liberadas && st.nLiberadas !== cfg.alvo.liberadas) || st.recalcularJa)) {
        st.recalcularJa = false;
        await escolher(t3('recalculado', 'recalculated', 'recalculado'));
        if (!cfg.ligado) return;
      }
      conferirCapturas();
      const pk = cfg.pkId ? porId(cfg.pkId) : null;
      if (cfg.pkId && !pk) { cfg.pkId = null; gravar(); }
      // não tem: captura
      if (!pk) {
        st.huntEm = 0; // capturou e entrou: a Troca de hunt liga na hora
        const h = st.escolha && agora - st.escolha.em < 10 * 60_000 ? st.escolha : await huntDeCaptura();
        if (h.semHunt) { st.motivo = t3(`${cfg.alvo.nome} não aparece em nenhuma hunt liberada — recalculando`, `${cfg.alvo.nome} doesn't spawn in any unlocked hunt — recalculating`, `${cfg.alvo.nome} no aparece en ninguna hunt liberada — recalculando`); st.recalcularJa = true; cfg.alvo.calcEm = 0; gravar(); return; }
        if (h.semSegura) { st.escolha = null; st.motivo = t3(`esperando hunt segura para capturar ${cfg.alvo.nome}`, `waiting for a safe hunt to catch ${cfg.alvo.nome}`, `esperando una hunt segura para capturar ${cfg.alvo.nome}`); return; }
        st.escolha = { ...h, em: st.escolha && st.escolha.slug === h.slug ? st.escolha.em : agora };
        const cac = porId(h.pkId) || cacadores()[0];
        if (cac && eu.activeId !== cac.id && agora - st.ativoEm > ATIVO_A_CADA_MS) { st.ativoEm = agora; PIH.pedir({ t: 'team.active', pokemonId: cac.id }, 'farm'); }
        if (eu.huntSlug !== h.slug || eu.noCentro) {
          if (PIH.auto && PIH.auto._interno.cfg().hunt.ligado) { PIH.auto.definir('hunt.ligado', false); st.huntEm = 0; } // a Troca de hunt levaria para longe
          if (PIH.auto && !PIH.auto.rotinaAtual() && agora - st.irEm > IR_A_CADA_MS) { st.irEm = agora; PIH.auto.irParaHunt(h.slug); }
          st.motivo = t3(`indo para ${h.nome} capturar ${cfg.alvo.nome}`, `going to ${h.nome} to catch ${cfg.alvo.nome}`, `yendo a ${h.nome} a capturar ${cfg.alvo.nome}`);
          return;
        }
        const captura = PIH.captura && PIH.captura.resumo ? PIH.captura.resumo() : null;
        const semBola = captura && !captura.vip && (!captura.ligado || captura.modo === 'shiny');
        st.motivo = t3(`capturando ${cfg.alvo.nome} em ${h.nome}`, `catching ${cfg.alvo.nome} in ${h.nome}`, `capturando ${cfg.alvo.nome} en ${h.nome}`) + (semBola ? t3(' · ligue a Pokébola automática em "Todo corpo"!', ' · turn on the automatic Poké Ball on "Every body"!', ' · ¡enciende la Pokébola automática en "Todo cuerpo"!') : '');
        return;
      }
      st.escolha = null;
      // tem: no time de campo (a janela Time troca no Centro), ativo, e a Troca de hunt leva à melhor hunt dele
      if (pk.slot == null) {
        if (PIH.time && PIH.time.campoDoFarm && !cfg.campo) { cfg.campo = PIH.time.campoDoFarm(true); gravar(); }
        st.motivo = t3(`${pk.nome} entrando no time (troca no Centro)`, `${pk.nome} joining the team (swap at the Center)`, `${pk.nome} entrando al equipo (cambio en el Centro)`);
        return;
      }
      if (eu.activeId !== pk.id) {
        if (agora - st.ativoEm > ATIVO_A_CADA_MS && !(PIH.time && PIH.time.emSessao && PIH.time.emSessao())) {
          st.ativoEm = agora;
          PIH.pedir({ t: 'team.active', pokemonId: pk.id }, 'farm');
          diario(t3(`${pk.nome} (Nv ${pk.level}) entra para farmar`, `${pk.nome} (Lv ${pk.level}) steps in to farm`, `${pk.nome} (Nv ${pk.level}) entra a farmear`));
        }
        st.motivo = t3(`${pk.nome} entrando em campo`, `${pk.nome} stepping into the field`, `${pk.nome} entrando en campo`);
        return;
      }
      const sessao = PIH.time && PIH.time.emSessao && PIH.time.emSessao();
      if (!sessao && PIH.auto && !PIH.auto._interno.cfg().hunt.ligado && agora - st.huntEm > 30_000) { st.huntEm = agora; PIH.auto.definir('hunt.ligado', true); }
      const evo = cfg.alvo.speciesId !== pk.speciesId ? t3(` · evolui até ${cfg.alvo.nome}`, ` · evolves into ${cfg.alvo.nome}`, ` · evoluciona hasta ${cfg.alvo.nome}`) : '';
      const onde = eu.huntSlug && !eu.noCentro ? ((welcome.hunts || []).find((h) => h.slug === eu.huntSlug) || {}).nome || eu.huntSlug : null;
      st.motivo = t3(`farmando com ${pk.nome} (Nv ${nf.format(pk.level || 0)})${onde ? ` em ${onde}` : ''}${evo}`, `farming with ${pk.nome} (Lv ${nf.format(pk.level || 0)})${onde ? ` in ${onde}` : ''}${evo}`, `farmeando con ${pk.nome} (Nv ${nf.format(pk.level || 0)})${onde ? ` en ${onde}` : ''}${evo}`);
    } catch (err) { st.motivo = t3('não consegui calcular', "couldn't calculate", 'no pude calcular'); console.warn('[piloto] farm:', err); } finally { andando = false; }
  }
  setInterval(() => { tique(); }, 10_000);

  // ---- para os outros módulos ---------------------------------------------------------------------
  const ativo = () => cfg.ligado;
  const pkId = () => (cfg.ligado && cfg.pkId && porId(cfg.pkId) ? cfg.pkId : null);
  const protegidos = () => (pkId() ? [cfg.pkId] : []);
  const especiesAlvo = () => (cfg.ligado && !pkId() ? membrosAlvo().map((m) => m.id) : []);
  // a evolução do principal: para qual espécie ele deve evoluir (só os caminhos que chegam no escolhido)
  const caminhoEvolucao = () => (pkId() && cfg.alvo ? new Set(membrosAlvo().map((m) => m.id)) : null);

  // ---- a linha na aba Caçar -----------------------------------------------------------------------
  function linha(modo) {
    const trava = modo === 'desligado';
    const pk = pkId() ? porId(cfg.pkId) : null;
    const status = cfg.ligado
      ? `${cfg.alvo ? `${esc(cfg.alvo.nome)} · ~${curto(cfg.alvo.xpH)} XP/h · ` : ''}${esc(st.motivo || t3('começando…', 'starting…', 'empezando…'))}`
      : cfg.fim ? t3('desligado', 'off', 'apagado') : t3('desligado', 'off', 'apagado');
    // o top 5 do cálculo (o retrato do jogo, o nome, a hunt e o XP/h; o escolhido em verde)
    const retrato = (id) => { try { return (PIH.arte && PIH.arte.retrato && PIH.arte.retrato(id, 34)) || ''; } catch { return ''; } };
    const rank = cfg.ligado && st.ranking.length ? `<div class="plt-an" data-sem-traducao="1">${st.ranking.map((r, k) => `<div class="plt-an-l"><span class="plt-an-arte">${retrato(r.speciesId) || `<b>${k + 1}</b>`}</span><span class="plt-an-nome"><b>${k + 1}. ${esc(r.nome)}</b><small>${r.hunt ? esc(t3(`em ${r.hunt}`, `in ${r.hunt}`, `en ${r.hunt}`)) : ''}</small></span><span class="plt-an-acoes"><span class="plt-meta-tem${cfg.alvo && cfg.alvo.speciesId === r.speciesId ? ' on' : ''}">~${curto(r.xpH)} XP/h</span></span></div>`).join('')}</div>` : '';
    return `${K.linha({ id: 'farm', icone: 'xp', nome: t3('Modo farm', 'Farm mode', 'Modo farm'), alvo: 'farm:ligado', on: cfg.ligado, trava,
      status: `<span data-sem-traducao="1">${status}${pk && cfg.ligado ? '' : ''}</span>`,
      dica: t3('Acha o pokémon que mais rende XP (do treinador e dele mesmo) no seu nível — simula cada espécie que você consegue ter em cada hunt liberada, com o mesmo corte de risco da Troca de hunt — e farma com ele sem parar. Se você tem, ele vira o principal; se não tem, o Piloto captura um e ele entra na hora, subindo de nível farmando, e evolui sozinho até a espécie escolhida (compra a pedra em ouro, pelo Cofre). A Troca de hunt fica ligada. Recalcula 1x por dia e quando abre hunt nova. Ligar desliga o rodízio, o Caçar o meta, o Melhorar o time e o Completar a Pokédex; ligar qualquer um deles desliga este.',
        'Finds the Pokémon that earns the most XP (trainer and its own) at your level — it simulates every species you can get in every unlocked hunt, with the same risk cut as hunt switching — and farms with it nonstop. If you have it, it becomes the main one; if not, the Pilot catches one and it steps in right away, leveling up while farming, and evolves by itself into the chosen species (buying the stone with gold, through the vault). Hunt switching stays on. Recalculates once a day and when a new hunt unlocks. Turning it on turns off the rotation, Hunt the meta, Improve the team and Complete the Pokédex; turning any of them on turns this off.',
        'Encuentra el pokémon que más XP rinde (del entrenador y el suyo) en tu nivel — simula cada especie que puedes tener en cada hunt liberada, con el mismo corte de riesgo del cambio de hunt — y farmea con él sin parar. Si lo tienes, pasa a ser el principal; si no, el Piloto captura uno y entra al momento, subiendo de nivel farmeando, y evoluciona solo hasta la especie elegida (compra la piedra con oro, por el Cofre). El cambio de hunt queda encendido. Recalcula 1 vez al día y cuando se abre una hunt nueva. Encenderlo apaga la rotación, Cazar el meta, Mejorar el equipo y Completar la Pokédex; encender cualquiera de ellos apaga este.') })}${rank}`;
  }
  async function definir(caminho, v) {
    if (caminho !== 'ligado') return null;
    if (v) { const r = await ligar(); if (!r.ok) { st.motivo = r.motivo; diario(`${t3('não liguei', "didn't turn on", 'no encendí')}: ${r.motivo}`, 'aviso'); } return r; }
    desligar(t3('você desligou', 'you turned it off', 'lo apagaste'));
    return null;
  }

  PIH.farm = { linha, definir, desligar, ativo, pkId, protegidos, especiesAlvo, caminhoEvolucao, _interno: { cfg: () => cfg, st, tique, calcular, escolher, tipico, alcancaveis, huntsLiberadas, conferirCapturas } };
})(globalThis);
