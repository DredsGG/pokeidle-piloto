// Janela Time (1.16): o botão "Time" no cabeçalho da Equipe do jogo abre uma janela no mesmo
// layout do Piloto, com três abas:
//
// - Campo: o time de campo (as 5 vagas da Equipe) com sprite animado, tipos, ⚔ Poder, nota, farm
//   na hunt atual e os 6 status. "Montar o time de campo sozinho" troca, uma vaga por vez, o que
//   rende menos XP/h de treinador NESTA hunt por alguém de fora que renda 5% mais. Quem sai vai para
//   a Coleção (a venda do Depot nunca leva). Cadeado = nunca sai. O que está lutando nunca sai.
// - PvP: o time do PvP (a rotina do Piloto escolhe pelo Poder). Cadeado = entra sempre.
// - Analisar: passa por todos os seus pokémon e mostra os melhores para farm (nesta hunt), para PvP
//   (Poder de hoje) e os que valem treinar (o Poder que eles chegam no nível máximo que você pode
//   usar, já evoluídos — a mesma fórmula do ⚔ do jogo, do shared/nota-pokemon.mjs).
//
// 1.22 (pedido do André): UM time só — o time principal fica no campo E no PvP. "Montar o time
// sozinho" escolhe os 5 de maior Poder que você já pode usar (treinador + 5), com cadeado para
// fixar; o rodízio troca o ativo entre eles a cada hora e a Troca de hunt leva cada um à melhor
// hunt dele. (A aba Meta, que vai escolher pelo meta, vem na próxima etapa.)
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:time:v1';
  const MARGEM_PODER = 1.02; // entra quem tem 2% mais Poder que o mais fraco (a mesma margem do PvP)
  const ESPERA_TROCA_MS = 2 * 60_000;
  const MAX_EQUIPE = 5;
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const curto = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 10000 ? nfc.format(v) : nf.format(v)) : '—');

  const lerCfg = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      const ids = (x) => (Array.isArray(x) ? x.filter((n) => Number.isInteger(n) && n > 0).slice(0, 50) : []);
      // 1.22: os cadeados de campo e PvP viram um só (no máximo 5)
      const t = c.travados || {};
      const uniao = [...new Set([...ids(t.time), ...ids(t.campo), ...ids(t.pvp)])].slice(0, MAX_EQUIPE);
      // 1.26: a aba Analisar saiu da janela (a análise continua por dentro, para a venda automática)
      const est = c.compEstavel && typeof c.compEstavel === 'object' ? c.compEstavel : {};
      return { campoAuto: typeof c.campoAuto === 'boolean' ? c.campoAuto : null, doMeta: c.doMeta !== false, travados: { time: uniao }, aba: ['time', 'meta'].includes(c.aba) ? c.aba : 'time', compEstavel: est };
    } catch { return { campoAuto: null, doMeta: true, travados: { time: [] }, aba: 'time', compEstavel: {} }; }
  };
  const cfg = lerCfg();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`time: ${txt}`, tipo);

  let eu = null;
  let welcome = null;
  let ultimaHunt = null;
  PIH.on('welcome', (w) => { welcome = w; });
  PIH.on('estado', (e) => { eu = e; if (e && e.huntSlug && !e.noCentro) ultimaHunt = e.huntSlug; try { notarTurno(e); } catch (err) { console.warn('[piloto] turnos:', err); } });

  // ---- 1.28: os turnos (pedido do André) — quem lutou, em qual hunt, quanto tempo, e por que trocou.
  // Um turno = o mesmo ativo na mesma hunt. Guardado no navegador (os últimos 150), sobrevive ao F5.
  const CHAVE_TURNOS = 'piloto:turnos:v1';
  const turnos = (() => { try { const t = JSON.parse(localStorage.getItem(CHAVE_TURNOS) || 'null'); return t && Array.isArray(t.hist) ? t : { atual: null, hist: [] }; } catch { return { atual: null, hist: [] }; } })();
  const gravarTurnos = () => { try { localStorage.setItem(CHAVE_TURNOS, JSON.stringify(turnos)); } catch { /* sem armazenamento */ } };
  let envioAtivo = null; // o último team.active que o Piloto mandou: { pokemonId, origem, em }
  PIH.on('piloto.enviado', (m) => { if (m && m.t === 'team.active') envioAtivo = { pokemonId: m.pokemonId, origem: m.origem, em: m.em || Date.now() }; });
  function motivoDaTroca(novoId) {
    const e = envioAtivo;
    if (e && e.pokemonId === novoId && Date.now() - e.em < 60_000) return { rotina: 'rodízio', metacaca: 'Caçar o meta', time: 'troca do time' }[e.origem] || e.origem || 'Piloto';
    return 'o jogo ou você (desmaiou?)';
  }
  function notarTurno(e) {
    if (!e || e.activeId == null) return;
    const onde = e.noCentro ? 'centro' : (e.huntSlug || null);
    const a = turnos.atual;
    if (a && a.pkId === e.activeId && a.onde === onde) return;
    const agora = Date.now();
    let motivo = null;
    if (a) {
      if (agora - a.desde >= 15_000) turnos.hist.push({ ...a, ate: agora }); // piscadas de segundos não contam
      motivo = a.pkId !== e.activeId ? motivoDaTroca(e.activeId) : onde === 'centro' ? 'foi ao Centro' : 'trocou de hunt';
      // passagem rápida (o Centro do rodízio, por exemplo): o turno novo herda o motivo de verdade
      if (agora - a.desde < 15_000 && a.pkId === e.activeId && a.motivo) motivo = a.motivo;
    }
    const pk = (e.pokemons || []).find((p) => p && p.id === e.activeId);
    // o jogo trocou sozinho porque o anterior desmaiou: o rodízio dá a quem entrou só um turno curto
    const antes = a ? (e.pokemons || []).find((p) => p && p.id === a.pkId) : null;
    const desmaio = !!(a && a.pkId !== e.activeId && /^o jogo/.test(motivo || '') && antes && antes.hp != null && Number(antes.hp) <= 0);
    // mesmo pokémon (mudou de hunt ou foi ao Centro): o turno dele continua de onde estava
    const inicio = a && a.pkId === e.activeId ? (a.inicio ?? a.desde) : agora;
    turnos.atual = { pkId: e.activeId, nome: pk ? pk.nome : `#${e.activeId}`, onde, desde: agora, inicio, motivo, desmaio: a && a.pkId === e.activeId ? !!a.desmaio : desmaio };
    if (turnos.hist.length > 150) turnos.hist.splice(0, turnos.hist.length - 150);
    gravarTurnos();
  }
  const ondeNome = (o) => (o === 'centro' ? 'Centro' : o ? nomeHunt(o) : '—');
  const duracao = (ms) => { const m = Math.max(0, Math.round(ms / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
  const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function resumoTurnos(pkId) {
    const h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const ini = h0.getTime();
    const todos = [...turnos.hist, ...(turnos.atual ? [{ ...turnos.atual, ate: Date.now() }] : [])];
    let ms = 0; let entradas = 0; const hunts = new Set(); let ultimoFim = null; let anterior = null;
    for (const t of todos) {
      if (t.pkId === pkId) {
        ultimoFim = t.ate;
        if (t.ate >= ini) {
          if (t.onde !== 'centro') { ms += t.ate - Math.max(t.desde, ini); if (t.onde) hunts.add(t.onde); }
          if (anterior !== pkId) entradas++;
        }
      }
      anterior = t.pkId;
    }
    return { ms, entradas, hunts: hunts.size, ultimoFim };
  }
  // 1.28.1: para o rodízio — o turno de quem luta (desde que virou o ativo, somando hunts e Centro)
  // e a última vez que cada um lutou.
  function turnoAtual() {
    const a = turnos.atual;
    return a ? { pkId: a.pkId, desde: a.inicio ?? a.desde, desmaio: !!a.desmaio } : null;
  }
  function ultimaVez(pkId) {
    if (turnos.atual && turnos.atual.pkId === pkId) return Date.now();
    for (let i = turnos.hist.length - 1; i >= 0; i--) if (turnos.hist[i].pkId === pkId) return turnos.hist[i].ate;
    return null;
  }
  function chipsTurno(p) {
    const a = turnos.atual;
    const r = resumoTurnos(p.id);
    const hoje = r.ms > 0 ? `<span class="plt-meta-tem" title="Hoje: tempo lutando (fora do Centro), quantas vezes entrou e em quantas hunts">hoje ${duracao(r.ms)} · ${r.entradas} turno${r.entradas === 1 ? '' : 's'} · ${r.hunts} hunt${r.hunts === 1 ? '' : 's'}</span>` : '';
    if (a && a.pkId === p.id && eu && eu.activeId === p.id) {
      let prox = '';
      try { prox = PIH.rotina && PIH.rotina.proximoRodizio ? PIH.rotina.proximoRodizio() : ''; } catch { prox = ''; }
      return `<span class="plt-meta-tem plt-turno-agora" title="Lutando agora${a.motivo ? ` — entrou por: ${esc(a.motivo)}` : ''}">⏱ ${duracao(Date.now() - a.desde)} em ${esc(ondeNome(a.onde))}</span>${prox ? `<span class="plt-meta-tem" title="Rodízio do time">rodízio: ${esc(prox)}</span>` : ''}${hoje}`;
    }
    const ult = r.ultimoFim ? `<span class="plt-meta-tem" title="Quando saiu da luta pela última vez">lutou há ${duracao(Date.now() - r.ultimoFim)}</span>` : '';
    return `${ult}${hoje}`;
  }
  function historicoTurnos() {
    const todos = [...turnos.hist.slice(-9), ...(turnos.atual ? [{ ...turnos.atual, ate: null }] : [])].reverse().slice(0, 10);
    if (!todos.length) return '';
    return `${K.grupo('Turnos · quem lutou, onde e por quanto tempo')}<div class="plt-turnos">${todos.map((t) => `<div class="plt-turno${t.ate ? '' : ' agora'}"><span class="plt-turno-h">${hhmm(t.desde)}–${t.ate ? hhmm(t.ate) : 'agora'}</span><b>${esc(t.nome)}</b><span>${esc(ondeNome(t.onde))} · ${duracao((t.ate || Date.now()) - t.desde)}</span>${t.motivo ? `<small>${esc(t.motivo)}</small>` : ''}</div>`).join('')}</div>`;
  }

  const modoPiloto = () => {
    const cof = PIH.cofre?.resumo?.();
    if (cof && !cof.ligado) return 'desligado';
    try { const m = JSON.parse(localStorage.getItem('piloto:modo:v1')); return m === 'automatico' || m === 'manual' ? m : 'manual'; } catch { return 'manual'; }
  };
  const campoAuto = () => (cfg.campoAuto === null ? modoPiloto() === 'automatico' : cfg.campoAuto);
  const travado = (_lista, id) => cfg.travados.time.includes(id);
  const meus = () => ((eu && eu.pokemons) || []).filter((p) => p && Number.isInteger(p.id) && !p.ovo);
  const timeCampo = () => meus().filter((p) => p.slot != null).sort((a, b) => a.slot - b.slot);
  const porId = (id) => meus().find((p) => p.id === id) || null;
  const podeUsar = (p) => !!p && (p.starter || (Number(p.level) || 0) <= (Number(eu && eu.level) || 0) + 5);
  const nomeHunt = (slug) => ((welcome && welcome.hunts) || []).find((h) => h.slug === slug)?.nome || slug || '—';
  const poderDe = (p) => Number(p && p.poder) || 0;

  // ---- farm (XP/h de treinador nesta hunt), com cache de 10 min por pokémon e nível -------------
  const farm = new Map();
  async function medirFarm(pks, slug) {
    if (!slug || !PIH.auto || !PIH.auto.farmDe) return false;
    const agora = Date.now();
    const falta = pks.filter((p) => { const c = farm.get(p.id); return !c || c.slug !== slug || c.nivel !== p.level || agora - c.em > 10 * 60_000; });
    if (!falta.length) return false;
    const r = await PIH.auto.farmDe(falta, slug);
    for (const p of falta) farm.set(p.id, { em: Date.now(), nivel: p.level, slug, v: r.get(p.id) || null });
    return true;
  }
  let medindo = false;
  const farmV = (p, slug) => { const c = p && farm.get(p.id); return c && c.slug === slug && c.v ? c.v : null; };
  const farmNum = (p, slug) => { const v = farmV(p, slug); return v ? v.xpTreinadorH || 0 : null; };

  // ---- montar o time de campo sozinho ------------------------------------------------------------
  const protegerAte = new Map();
  const st = { troca: null, ultimaTroca: 0, motivo: '', analise: null, analisando: false };
  function pedir(obj, txt) {
    const r = PIH.pedir(obj, 'time');
    if (!r.ok) { st.motivo = r.motivo || 'recusado'; return false; }
    if (txt) diario(txt);
    return true;
  }
  function vagaLivre() {
    const usadas = new Set(timeCampo().map((p) => p.slot));
    for (let i = 0; i < MAX_EQUIPE; i++) if (!usadas.has(i)) return i;
    return null;
  }
  // Uma troca em passos, na ordem do próprio jogo (1.26.2): marca quem sai na Coleção → tira do
  // time → põe o novo na vaga. Antes tirava primeiro: sem a marca, quem saía ia para o Depot e a
  // troca podia travar (o André viu "trocando: entra X" sem nunca trocar). Recusa do servidor vai
  // para o diário e para a linha, e a próxima tentativa espera 2 min.
  let ultimoErro = null;
  PIH.on('erro', (m) => { ultimoErro = { t: Date.now(), msg: String((m && (m.msg || m.chave)) || 'recusado').slice(0, 140) }; });
  const erroDesde = (t0) => (ultimoErro && ultimoErro.t >= t0 ? ultimoErro.msg : null);
  const colecaoDoJogo = () => (eu && eu.automation && Array.isArray(eu.automation.pokemonTravado) ? eu.automation.pokemonTravado : null);
  function andarTroca() {
    const t = st.troca;
    if (!t || !eu) return;
    const agora = Date.now();
    if (agora - t.desde > 45_000) {
      const erro = erroDesde(t.desde);
      diario(`a troca não entrou (${t.nomeEntra})${erro ? `: o jogo disse "${erro}"` : ': o jogo não respondeu'} — tento de novo em 2 min`, 'aviso');
      st.motivo = `a troca não entrou${erro ? `: ${erro}` : ''} — tento de novo em 2 min`;
      st.troca = null; st.ultimaTroca = agora;
      if (st.sessao) st.sessao.falhas++;
      return;
    }
    const sai = t.sai ? porId(t.sai) : null;
    const entra = porId(t.entra);
    if (!entra) { st.troca = null; return; }
    if (t.etapa === 'marcar') {
      const col = colecaoDoJogo();
      if (!sai || sai.slot == null) { t.etapa = 'entrar'; t.em = 0; return; }
      if (!col || col.includes(sai.id) || (t.marcouEm && agora - t.marcouEm > 8000)) {
        pedir({ t: 'team.move', pokemonId: sai.id, slot: null });
        t.etapa = 'sair'; t.em = agora;
        return;
      }
      if (!t.marcouEm) { t.marcouEm = agora; pedir({ t: 'colecao.mover', pokemonId: sai.id, para: 'colecao' }); }
      return;
    }
    if (t.etapa === 'sair') {
      if (sai && sai.slot != null) {
        if (agora - t.em > 8000 && (t.repetiu || 0) < 2) { t.repetiu = (t.repetiu || 0) + 1; t.em = agora; pedir({ t: 'team.move', pokemonId: sai.id, slot: null }); }
        return; // ainda saindo
      }
      t.etapa = 'entrar'; t.em = agora;
      return;
    }
    if (t.etapa === 'entrar') {
      if (entra.slot != null) { diario(`${entra.nome} entrou no time de campo`, 'ok'); st.troca = null; st.ultimaTroca = agora; st.motivo = ''; return; }
      if (agora - t.em < 800) return;
      const vaga = vagaLivre();
      if (vaga == null) return;
      pedir({ t: 'team.move', pokemonId: entra.id, slot: vaga });
      t.em = agora + 3000; // espera o estado
    }
  }
  function trocar(entra, sai, motivo) {
    if (st.troca) return false;
    st.troca = { entra: entra.id, nomeEntra: entra.nome, sai: sai ? sai.id : null, etapa: sai ? 'marcar' : 'entrar', desde: Date.now(), em: 0 };
    if (sai) protegerAte.set(sai.id, Date.now() + 3 * 60_000); // a venda imediata do Depot não leva no meio da troca
    diario(sai ? `${motivo}: sai ${sai.nome}, entra ${entra.nome}` : `${motivo}: entra ${entra.nome}`);
    andarTroca();
    return true;
  }
  // 1.26 (pedido do André): os do meta que você tem. Para cada pokémon da comp do meta (o recorte
  // do Caçar o meta: Topo 20 ou Sua faixa), o seu melhor da mesma família (Mega X conta como X),
  // que o treinador pode usar. Conferido a cada volta: pegou um melhor da família, ele entra.
  // 1.31 (o André: "trocou meu Venusaur pelo Scizor, sendo que o meta é o Venusaur"): a comp do meta
  // que o time segue é ESTÁVEL. O 5º lugar do meta oscila a cada perfil lido; antes, um pokémon que
  // saía da comp por alguns minutos perdia o lugar no time. Agora uma espécie só sai da comp do
  // time depois de 24 h seguidas fora da comp ao vivo, e só então entra a nova. Começa pela comp
  // congelada do Caçar o meta (a que você caçou), se houver.
  const FORA_DA_COMP_MS = 24 * 3600_000;
  function compEstavel(recorte) {
    const viva = ((PIH.meta && PIH.meta.agregar(recorte)) || {}).comp || [];
    const est = cfg.compEstavel[recorte] || null;
    const agora = Date.now();
    let mudou = false;
    let e = est;
    if (!e || !Array.isArray(e.lista) || !e.lista.length) {
      let base = [];
      try {
        const mc = JSON.parse(localStorage.getItem('piloto:metacaca:v1') || 'null');
        const alvos = mc && (mc.cfg || mc).alvos;
        if (Array.isArray(alvos) && alvos.length && ((mc.recorte || (mc.cfg || mc).recorte || 'topo') === recorte)) base = alvos.map((a) => ({ speciesId: a.metaId, nome: a.meta }));
      } catch { /* sem caça */ }
      if (!base.length) base = viva.map((a) => ({ speciesId: a.speciesId, nome: a.nome }));
      if (!base.length) return [];
      e = { lista: base.slice(0, MAX_EQUIPE), fora: {} };
      mudou = true;
    }
    const vivos = new Set(viva.map((a) => a.speciesId));
    for (const a of e.lista) {
      if (vivos.has(a.speciesId)) { if (e.fora[a.speciesId]) { delete e.fora[a.speciesId]; mudou = true; } } else if (!e.fora[a.speciesId] && viva.length) { e.fora[a.speciesId] = agora; mudou = true; }
    }
    const novos = viva.filter((a) => !e.lista.some((x) => x.speciesId === a.speciesId));
    for (const n of novos) {
      const sai = e.lista.find((x) => e.fora[x.speciesId] && agora - e.fora[x.speciesId] >= FORA_DA_COMP_MS);
      if (!sai) break;
      e.lista[e.lista.indexOf(sai)] = { speciesId: n.speciesId, nome: n.nome };
      delete e.fora[sai.speciesId];
      diario(`o meta mudou de verdade (24 h): sai ${sai.nome}, entra ${n.nome} na comp do time`);
      mudou = true;
    }
    for (const x of [...e.lista]) {
      if (e.fora[x.speciesId] && agora - e.fora[x.speciesId] >= FORA_DA_COMP_MS) { e.lista.splice(e.lista.indexOf(x), 1); delete e.fora[x.speciesId]; diario(`${x.nome} saiu do meta há 24 h: sai da comp do time`); mudou = true; }
    }
    if (e.lista.length < MAX_EQUIPE) for (const n of novos) { if (e.lista.length >= MAX_EQUIPE) break; if (!e.lista.some((x) => x.speciesId === n.speciesId)) { e.lista.push({ speciesId: n.speciesId, nome: n.nome }); mudou = true; } }
    if (mudou) { cfg.compEstavel[recorte] = e; gravar(); }
    return e.lista;
  }
  // 1.26 (pedido do André): os do meta que você tem. Para cada pokémon da comp do meta (o recorte
  // do Caçar o meta: Topo 20 ou Sua faixa), o seu melhor da mesma família (Mega X conta como X),
  // que o treinador pode usar. Conferido a cada volta: pegou um melhor da família, ele entra.
  function doMetaAgora() {
    if (!cfg.doMeta || !PIH.meta || !PIH.meta.familia || !PIH.meta.familia.raizDePk) return [];
    let recorte = 'topo';
    try { recorte = JSON.parse(localStorage.getItem('piloto:metacaca:v1') || 'null')?.recorte === 'faixa' ? 'faixa' : 'topo'; } catch { /* topo */ }
    const comp = compEstavel(recorte);
    const F = PIH.meta.familia;
    const cand = meus().filter((p) => p.stats && podeUsar(p) && poderDe(p) > 0);
    const out = [];
    // 1.26.3: serve quem é o do meta (ou o Mega) ou evolui até ele, por qualquer linhagem (o Pupitar
    // que o André pegou vira Tyranitar)
    const serve = F.serve ? (x, a) => F.serve(x, a) : (x, a) => { const r = F.raizDoMeta(a); return r != null && F.raizDePk(x) === r; };
    for (const a of comp) {
      const p = cand.filter((x) => !out.some((o) => o.p.id === x.id) && serve(x, a)).sort((x, y) => poderDe(y) - poderDe(x))[0];
      if (p) out.push({ p, meta: a.nome });
    }
    return out.slice(0, MAX_EQUIPE);
  }
  // O time principal: os travados, depois os do meta que você tem, depois quem já está no time, e
  // quem de fora tiver 2% mais Poder que o mais fraco entra no lugar dele. Só quem o treinador pode
  // usar (Nv ≤ treinador + 5).
  function alvoPrincipal() {
    if (!eu) return [];
    const cand = meus().filter((p) => p.stats && podeUsar(p) && poderDe(p) > 0).sort((a, b) => poderDe(b) - poderDe(a));
    const porIdC = new Map(cand.map((p) => [p.id, p]));
    const time = [];
    for (const id of cfg.travados.time) { const p = porIdC.get(id); if (p && time.length < MAX_EQUIPE) time.push(p); }
    const fixos = new Set(time.map((p) => p.id));
    for (const { p } of doMetaAgora()) { if (time.length < MAX_EQUIPE && !fixos.has(p.id)) { time.push(p); fixos.add(p.id); } }
    // 1.31 (pedido do André): com "Usar os do meta" ligado, SÓ os do meta entram no time. Quem já
    // está no time fica até um do meta precisar da vaga; ninguém de fora do meta entra por Poder (conta
    // nova não monta time com pokémon ruim: eles seguem para a Auto Coleção/Depot do jogo).
    const soMeta = cfg.doMeta !== false;
    if (soMeta) {
      for (const p of timeCampo()) { const c = porIdC.get(p.id); if (c && !time.includes(c) && time.length < MAX_EQUIPE) time.push(c); }
      return time.sort((a, b) => poderDe(b) - poderDe(a));
    }
    for (const p of timeCampo()) { const c = porIdC.get(p.id); if (c && !time.includes(c) && time.length < MAX_EQUIPE) time.push(c); }
    for (const c of cand) { if (time.length >= MAX_EQUIPE) break; if (!time.includes(c)) time.push(c); }
    for (const c of cand) {
      if (time.includes(c)) continue;
      const trocaveis = time.filter((p) => !fixos.has(p.id) && p.id !== eu.activeId);
      if (!trocaveis.length) break;
      const fraco = trocaveis.reduce((m, p) => (poderDe(p) < poderDe(m) ? p : m), trocaveis[0]);
      if (poderDe(c) <= poderDe(fraco) * MARGEM_PODER) break;
      time[time.indexOf(fraco)] = c;
    }
    return time.sort((a, b) => poderDe(b) - poderDe(a));
  }
  let calculando = false;
  // ---- 1.26.3: a troca do time inteiro no Centro (pedido do André) ------------------------------
  // Quando o time principal muda (o meta completou, ou o time está errado), o Piloto:
  // 1. desliga a Troca de hunt (e o rodízio espera);
  // 2. vai ao Centro na primeira brecha de combate (a fila do botão do Centro), cura e FICA lá;
  // 3. faz todas as trocas, uma atrás da outra, até o time ser o principal;
  // 4. volta para a hunt e religa a Troca de hunt (sempre, se veio do Caçar o meta).
  // Não chegou ao Centro ou o jogo recusou: desfaz e tenta de novo em 10 min.
  const SESSAO_MAX_MS = 12 * 60_000;
  const huntLigada = () => { try { return !!PIH.auto._interno.cfg().hunt.ligado; } catch { return false; } };
  const ligarHunt = (v) => { try { if (huntLigada() !== v) PIH.auto.definir('hunt.ligado', v); } catch { /* sem auto */ } };
  function iniciarSessao(motivo) {
    if (st.sessao || !PIH.auto || !PIH.auto.irAoCentroEFicar) return false;
    const huntAntes = huntLigada();
    const huntDepois = huntAntes || !!st.huntDepois;
    ligarHunt(false);
    const r = PIH.auto.irAoCentroEFicar({ motivo: `time: ${motivo} — indo ao Centro trocar o time` });
    if (!r.ok) {
      if (huntAntes) ligarHunt(true);
      st.sessaoFalhouEm = Date.now();
      st.motivo = `não deu para ir ao Centro: ${r.motivo}`;
      return false;
    }
    st.sessao = { etapa: 'indo', desde: Date.now(), motivo, huntDepois, trocas: 0, falhas: 0 };
    diario(`${motivo}: indo ao Centro trocar o time (Troca de hunt desligada até acabar)`);
    return true;
  }
  function fimSessao(txt, tipo = 'info', falhou = false) {
    const s = st.sessao;
    if (!s) return;
    st.sessao = null;
    st.ultimaTroca = Date.now();
    if (falhou) st.sessaoFalhouEm = Date.now();
    try { PIH.auto && PIH.auto.liberarCentro && PIH.auto.liberarCentro(); } catch { /* sem auto */ }
    if (s.huntDepois) { ligarHunt(true); if (!falhou) st.huntDepois = false; }
    st.motivo = txt;
    diario(`${txt}${s.huntDepois ? ' — voltando à hunt, Troca de hunt ligada' : ' — voltando à hunt'}`, tipo);
  }
  function andarSessao() {
    const s = st.sessao;
    if (!s || !eu) return;
    const agora = Date.now();
    if (agora - s.desde > SESSAO_MAX_MS) return fimSessao('a troca no Centro passou de 12 min', 'aviso', true);
    if (s.etapa === 'indo') {
      if (eu.noCentro) { s.etapa = 'trocando'; s.em = agora; st.motivo = 'no Centro: trocando o time'; return; }
      const rot = PIH.auto.rotinaAtual ? PIH.auto.rotinaAtual() : null;
      if (!rot) return fimSessao('não consegui chegar ao Centro', 'aviso', true);
      st.motivo = rot.etapa === 'esperar' ? 'na fila do Centro (esperando sair de combate)' : 'indo ao Centro trocar o time';
      return;
    }
    if (s.etapa !== 'trocando' || st.troca) return;
    if (!eu.noCentro) return fimSessao('saiu do Centro antes de acabar a troca', 'aviso', true);
    if (s.falhas >= 3) return fimSessao('o jogo recusou as trocas', 'aviso', true);
    const alvo = alvoPrincipal();
    const noAlvo = new Set(alvo.map((p) => p.id));
    const time = timeCampo();
    const entra = alvo.find((p) => p.slot == null);
    if (!entra) return fimSessao(`time trocado no Centro (${s.trocas} troca${s.trocas === 1 ? '' : 's'})`, 'ok');
    if (time.length < MAX_EQUIPE) { s.trocas++; trocar(entra, null, 'no Centro'); return; }
    let sai = time.filter((p) => !noAlvo.has(p.id) && !travado('time', p.id) && p.id !== eu.activeId).sort((a, b) => poderDe(a) - poderDe(b))[0];
    if (!sai) {
      // só sobrou o ativo fora do time principal: outro do time principal (já no campo) vira o ativo antes
      const at = time.find((p) => p.id === eu.activeId);
      const novo = time.find((p) => noAlvo.has(p.id) && p.id !== eu.activeId);
      if (at && !noAlvo.has(at.id) && novo && agora - (s.ativoEm || 0) > 5000) { s.ativoEm = agora; pedir({ t: 'team.active', pokemonId: novo.id }, `${novo.nome} vira o ativo para ${at.nome} poder sair`); return; }
      if (agora - (s.ativoEm || 0) > 20_000) return fimSessao('não dá para tirar quem está lutando', 'aviso', true);
      return;
    }
    const meta = doMetaAgora().find((x) => x.p.id === entra.id);
    s.trocas++;
    trocar(entra, sai, meta ? `no Centro, do meta (${meta.meta})` : 'no Centro');
  }
  setInterval(() => { try { andarSessao(); } catch (e) { console.warn('[piloto] time:', e); } }, 1000);

  async function tarefaCampo() {
    if (calculando || st.troca || st.sessao || !eu || !campoAuto()) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('time')) { st.motivo = 'Piloto desligado (ou disjuntor)'; return; }
    // 1.26.3: time diferente do principal → a troca inteira no Centro (no máximo uma tentativa a cada 10 min)
    try {
      const alvoS = alvoPrincipal();
      const falta = alvoS.some((p) => p.slot == null);
      if (!falta && st.huntDepois) { st.huntDepois = false; ligarHunt(true); diario('o time já é o do meta — Troca de hunt ligada'); }
      if (falta && PIH.auto && PIH.auto.irAoCentroEFicar && Date.now() - (st.sessaoFalhouEm || 0) > 10 * 60_000 && Date.now() - st.ultimaTroca > 60_000) {
        if (iniciarSessao(st.huntDepois ? 'o time do meta está pronto' : 'o time principal mudou')) return;
      }
      if (falta && st.sessaoFalhouEm && Date.now() - st.sessaoFalhouEm <= 10 * 60_000) return; // espera a próxima ida ao Centro
    } catch (e) { console.warn('[piloto] time:', e); }
    const temVaga = timeCampo().length < MAX_EQUIPE;
    if ((!temVaga || /não entrou/.test(st.motivo)) && Date.now() - st.ultimaTroca < ESPERA_TROCA_MS) return; // vaga livre enche logo; troca, no máximo 1 a cada 2 min
    calculando = true;
    try {
      const alvo = alvoPrincipal();
      const noAlvo = new Set(alvo.map((p) => p.id));
      const time = timeCampo();
      const entra = alvo.find((p) => p.slot == null);
      if (!entra) { st.motivo = 'o time já é o principal'; return; }
      if (time.length < MAX_EQUIPE) { trocar(entra, null, 'vaga livre no time'); return; }
      const sai = time.filter((p) => !noAlvo.has(p.id) && !travado('time', p.id) && p.id !== eu.activeId).sort((a, b) => poderDe(a) - poderDe(b))[0];
      if (!sai) { st.motivo = 'quem sai é o que está lutando: espera o rodízio'; return; }
      const meta = doMetaAgora().find((x) => x.p.id === entra.id);
      trocar(entra, sai, meta ? `do meta (${meta.meta})` : `mais Poder (${curto(poderDe(entra))} contra ${curto(poderDe(sai))})`);
    } catch (e) { st.motivo = 'não consegui calcular'; console.warn('[piloto] time:', e); } finally { calculando = false; }
  }
  setInterval(() => { try { andarTroca(); } catch (e) { console.warn('[piloto] time:', e); } }, 1000);
  setInterval(() => { tarefaCampo(); }, 15_000);

  // ---- analisar a coleção inteira -------------------------------------------------------------
  async function moduloNota() { try { return await import(`${location.origin}/shared/nota-pokemon.mjs`); } catch { return null; } }
  async function moduloRamif() { try { return await import(`${location.origin}/shared/evolucoes-ramificadas.mjs`); } catch { return null; } }
  async function analisar() {
    if (st.analisando || !eu) return;
    st.analisando = true; pintar(true);
    const t0 = Date.now();
    try {
      const slug = eu.huntSlug && !eu.noCentro ? eu.huntSlug : ultimaHunt;
      const todos = meus().filter((p) => p.stats);
      await medirFarm(todos.filter(podeUsar), slug);
      const [N, R, jogo] = await Promise.all([moduloNota(), moduloRamif(), PIH.carregarJogo ? PIH.carregarJogo().catch(() => null) : null]);
      const especies = (jogo && jogo.especies) || new Map();
      const alvoNivel = (Number(eu.level) || 1) + 5;
      const finais = (esp) => {
        const vistos = new Map();
        const fila = [esp];
        while (fila.length && vistos.size < 12) {
          const e = fila.shift();
          if (!e || vistos.has(e.pokeId)) continue;
          vistos.set(e.pokeId, e);
          let prox = [];
          try { prox = R && R.destinosDeEvolucao ? R.destinosDeEvolucao(e, (id) => especies.get(id)).map((d) => d.especie) : []; } catch { prox = []; }
          if (!prox.length && e.evolvesToId) prox = [especies.get(e.evolvesToId)];
          for (const x of prox) if (x) fila.push(x);
        }
        return [...vistos.values()];
      };
      const potencial = (p) => {
        const esp = especies.get(p.speciesId);
        if (!N || !N.poderDePokemon || !esp) return null;
        let melhor = { v: 0, como: esp.name };
        for (const e of finais(esp)) {
          let v = 0;
          try { v = N.poderDePokemon({ ...p, level: Math.max(p.level || 1, alvoNivel), speciesId: e.pokeId }, e); } catch { v = 0; }
          if (v > melhor.v) melhor = { v, como: e.name };
        }
        return melhor;
      };
      const linhas = todos.map((p) => ({ p, farm: podeUsar(p) ? farmNum(p, slug) : null, poder: poderDe(p), pot: potencial(p) }));
      const top = (arr, k) => arr.slice(0, k);
      const farmTop = top(linhas.filter((l) => (l.farm || 0) > 0).sort((a, b) => b.farm - a.farm), 8);
      const pvpTop = top(linhas.filter((l) => l.poder > 0).sort((a, b) => b.poder - a.poder), 8);
      const jaPvp = new Set(pvpTop.map((l) => l.p.id));
      const treinar = top(linhas.filter((l) => l.pot && l.pot.v > 0 && !jaPvp.has(l.p.id) && l.pot.v > l.poder * 1.15).sort((a, b) => b.pot.v - a.pot.v), 8);
      st.analise = { em: Date.now(), ms: Date.now() - t0, slug, alvoNivel, n: todos.length, farmTop, pvpTop, treinar, semNota: !N };
      diario(`análise: ${todos.length} pokémon em ${((Date.now() - t0) / 1000).toFixed(1).replace('.', ',')} s`);
    } catch (e) { st.analise = { erro: String(e && e.message || e) }; } finally { st.analisando = false; pintar(true); }
  }

  // 1.17: a aba Analisar analisa sozinha ao abrir (e de novo se a última tem mais de 3 min).
  function analisarSeVelha() {
    if (!janela || cfg.aba !== 'analisar' || st.analisando || !eu) return;
    if (st.analise && st.analise.em && Date.now() - st.analise.em < 3 * 60_000) return;
    analisar();
  }

  // ---- a janela -------------------------------------------------------------------------------------
  const ABAS = [['time', 'Time', 'pvp'], ['meta', 'Meta', 'radar']];
  let janela = null;
  let botao = null;
  let ultimoHtml = '';
  const abertas = new Set();

  const ICO_TRAVA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0zm3 4a1.6 1.6 0 0 0-.8 3V19h1.6v-2a1.6 1.6 0 0 0-.8-3z" fill="currentColor"/></svg>';
  const ICO_ABERTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 9.6-2l-1.8.9A3 3 0 0 0 9 7v3h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm5 4a1.6 1.6 0 0 0-.8 3V19h1.6v-2a1.6 1.6 0 0 0-.8-3z" fill="currentColor"/></svg>';
  const STATS = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spAtk', 'SP.ATK'], ['spDef', 'SP.DEF'], ['speed', 'VEL']];
  const dadosArte = new Map();
  function arte(p, px, lista) {
    const d = { categoria: 'pokemon', speciesId: p.speciesId, shiny: !!p.shiny, anuncioId: `time:${lista}:${p.id ?? p.speciesId}`, nome: p.nome };
    const chave = PIH.arte ? PIH.arte.chave(d, px) : '';
    dadosArte.set(chave, d);
    return PIH.arte ? PIH.arte.lugar(d, px) : '';
  }
  const tipos = (p) => (Array.isArray(p.tipos) ? p.tipos : []).map((t) => `<img class="plt-pk-tipo" src="/img/tipos/${esc(String(t).toLowerCase())}.svg" alt="${esc(t)}" title="${esc(t)}" width="16" height="16">`).join('');
  function cartao(p, { lista, slug, maxStats, trava, extra = '' }) {
    const f = farmV(p, slug);
    const tr = travado(lista, p.id);
    const ativo = eu && p.id === eu.activeId;
    const selos = `${ativo ? '<i class="plt-pk-selo plt-pk-campo">em campo</i>' : ''}${p.shiny ? '<i class="plt-pk-selo plt-pk-shiny">shiny</i>' : ''}${Number(p.potencia) >= 5 ? '<i class="plt-pk-selo">P5</i>' : ''}`;
    const barras = STATS.map(([k, r]) => {
      const v = Number(p.stats && p.stats[k]) || 0;
      const pct = maxStats[k] ? Math.max(4, Math.round((v / maxStats[k]) * 100)) : 0;
      return `<span class="plt-pk-st"><small>${r}</small><i><b style="width:${pct}%"></b></i><em>${curto(v)}</em></span>`;
    }).join('');
    return `<div class="cfg-linha plt-pk${tr ? ' plt-pk-travado' : ''}${ativo ? ' plt-pk-ativo' : ''}">
      <span class="plt-pk-arte">${arte(p, 56, lista)}</span>
      <span class="plt-pk-info"><span class="plt-pk-nome"><b>${esc(p.nome)}</b><small>Nv ${nf.format(p.level || 1)}</small></span><span class="plt-pk-tipos">${tipos(p)}${selos}</span>
        <span class="plt-pk-nums"><span title="Poder (o ⚔ do jogo)">⚔ <b>${curto(poderDe(p))}</b></span>${f ? `<span title="XP/h de treinador nesta hunt">XP/h <b>${curto(f.xpTreinadorH)}</b></span><span title="Ouro/h nesta hunt">Ouro/h <b>${curto(f.ouroH)}</b></span>` : ''}</span>${extra}</span>
      <span class="plt-pk-stats">${barras}</span>
      <button type="button" class="plt-pk-trava-bt${tr ? ' on' : ''}" data-travar="${lista}:${p.id}" aria-pressed="${tr}" title="${tr ? 'Travado: a troca automática nunca mexe nele. Clique para destravar.' : 'Travar: a troca automática nunca mexe nele'}"${trava ? ' disabled' : ''}>${tr ? ICO_TRAVA : ICO_ABERTO}</button>
    </div>`;
  }
  const maxDe = (lista) => Object.fromEntries(STATS.map(([k]) => [k, Math.max(1, ...lista.map((p) => Number(p.stats && p.stats[k]) || 0))]));

  function corpoTime(modo) {
    const trava = modo === 'desligado';
    const slug = eu && eu.huntSlug && !eu.noCentro ? eu.huntSlug : ultimaHunt;
    const time = timeCampo();
    if (slug && !medindo) { medindo = true; medirFarm(time, slug).then((mediu) => { medindo = false; if (mediu) pintar(); }).catch(() => { medindo = false; }); }
    const on = campoAuto();
    const rc = PIH.rotina && PIH.rotina._interno ? PIH.rotina._interno.cfg() : null;
    const pvpIds = PIH.rotina && PIH.rotina.pvpTime ? PIH.rotina.pvpTime() : null;
    const nv = Number(eu && eu.level) || 0;
    const noCampo = new Set(time.map((p) => p.id));
    const pvpIgual = Array.isArray(pvpIds) && pvpIds.length === time.length && pvpIds.every((id) => noCampo.has(id));
    const pvpTxt = nv < 150 ? `PvP: abre no treinador Nv 150 (você: Nv ${nv})` : !(rc && rc.pvp && rc.pvp.time) ? 'PvP: salvar a equipe está desligado' : pvpIds === null ? 'PvP: lendo a equipe…' : pvpIgual ? 'PvP: a mesma equipe ✓' : 'PvP: atualizando para a mesma equipe';
    const nMeta = doMetaAgora().length;
    const base = cfg.doMeta ? `${nMeta} do meta + os de maior Poder` : 'os 5 de maior Poder';
    const status = !on ? 'desligado' : st.sessao && !st.troca ? `${esc(st.motivo || 'trocando o time no Centro')} · ${pvpTxt}` : st.troca ? `trocando: entra ${esc(st.troca.nomeEntra)}` : `${st.motivo ? esc(st.motivo) : base} · ${pvpTxt}`;
    const linha = K.linha({ id: 'principal', icone: 'pvp', nome: 'Montar o time principal sozinho', alvo: 'time:principalAuto', on, trava, status,
      dica: "Um time só para o campo e para o PvP. Com \"Usar os do meta\" ligado, só entram os do meta que você tem (para cada pokémon da comp da aba Meta, o seu melhor da mesma família; Mega X conta como X): nenhum pokémon de fora do meta entra, e quem já está no time fica até um do meta precisar da vaga. A comp que o time segue só muda quando o meta muda de verdade (24 h). Desligado, entram os de maior Poder que você já pode usar (treinador + 5), com 2% de margem. Quem sai vai para a Coleção (a venda nunca leva). O cadeado fixa no time; o que está lutando só sai depois do rodízio. O PvP recebe a mesma equipe (treinador Nv 150+).",
      ajustes: modo === 'manual' ? K.mini('time:doMeta', cfg.doMeta, 'Usar os do meta', 'Põe no time, primeiro, os pokémon do meta que você tem', trava) : '' });
    const r = rc && rc.rodizio;
    const rod = K.linha({ id: 'rodizio', icone: 'nivel', nome: 'Rodízio do time', alvo: 'rotina:rodizio.ligado', on: !!(r && r.ligado), trava,
      status: r && r.ligado ? `troca o ativo a cada ${r.intervaloMin} min${PIH.rotina && PIH.rotina.proximoRodizio ? ` · ${esc(PIH.rotina.proximoRodizio())}` : ''}` : 'desligado',
      dica: 'Cada pokémon do time luta um turno (60 min, ou o que você escolher no Manual) e entra quem está há mais tempo sem lutar, para todos ganharem XP. Com a Troca de hunt ligada, a troca é feita no Centro e o novo vai direto para a melhor hunt dele; sem ela, só entra quem mata com segurança na hunt atual. Se o ativo desmaiar, o turno dele acaba em 2 min.' });
    const max = maxDe(time);
    const vazias = Math.max(0, MAX_EQUIPE - time.length);
    return `${linha}${rod}${K.grupo(`Time principal · campo e PvP · ${time.length}/${MAX_EQUIPE}${slug ? ` · farm em ${esc(nomeHunt(slug))}` : ''}`)}${(() => {
      // 1.27: na ordem da escalação do PvP (quem abre primeiro), com a posição
      let ordem = [];
      try { ordem = (PIH.rotina && PIH.rotina.equipePvpAlvo && PIH.rotina.equipePvpAlvo()) || []; } catch { ordem = []; }
      const idx = (p) => { const i = ordem.indexOf(p.id); return i < 0 ? 99 + (p.slot || 0) : i; };
      return time.slice().sort((a, b) => idx(a) - idx(b)).map((p) => {
        const m = cfg.doMeta ? doMetaAgora().find((x) => x.p.id === p.id) : null;
        const i = ordem.indexOf(p.id);
        const pos = i >= 0 ? `<span class="plt-meta-tem" title="Posição na escalação do PvP (o 1º abre a luta)">${i + 1}º no PvP</span>` : '';
        const meta = m ? `<span class="plt-meta-tem on" title="Do meta: ${esc(m.meta)}">meta · ${esc(m.meta)}</span>` : '';
        return cartao(p, { lista: 'time', slug, maxStats: max, trava, extra: pos || meta ? `<span class="plt-meta-chips">${pos}${meta}</span>` : '' });
      }).join('');
    })()}${'<div class="plt-pk-vazio">vaga livre</div>'.repeat(vazias)}${historicoTurnos()}`;
  }
  function linhaAnalise(l, tipo, a, modo) {
    const p = l.p;
    const noCampo = p.slot != null;
    const trava = modo === 'desligado';
    const valor = tipo === 'farm' ? `XP/h <b>${curto(l.farm)}</b>` : tipo === 'pvp' ? `⚔ <b>${curto(l.poder)}</b>` : `⚔ <b>${curto(l.poder)}</b> → <b>${curto(l.pot.v)}</b>`;
    const sub = tipo === 'treinar' ? `<small class="plt-an-sub">no Nv ${nf.format(a.alvoNivel)}${l.pot.como && l.pot.como !== p.nome ? `, como ${esc(l.pot.como)}` : ''}</small>` : '';
    const add = noCampo ? '<span class="plt-an-tag">no campo</span>'
      : podeUsar(p) ? `<button type="button" class="cfg-escala-bt plt-an-bt" data-acao="campo:${p.id}"${trava ? ' disabled' : ''} title="Põe no time principal (troca com o de menos Poder)">+ Time</button>`
        : `<span class="plt-an-tag" title="O jogo só deixa usar pokémon até 5 níveis acima do treinador">treinador Nv ${nf.format((p.level || 0) - 5)}+</span>`;
    const tr = travado('time', p.id);
    const fixa = podeUsar(p) ? `<button type="button" class="cfg-escala-bt plt-an-bt${tr ? ' on' : ''}" data-travar="time:${p.id}" title="Fixar no time principal (campo e PvP)">${tr ? 'Fixado ✓' : 'Fixar no time'}</button>` : '';
    return `<div class="plt-an-l"><span class="plt-an-arte">${arte(p, 34, `an${tipo}`)}</span><span class="plt-an-nome"><b>${esc(p.nome)}</b><small>Nv ${nf.format(p.level || 1)}</small>${sub}</span><span class="plt-an-v">${valor}</span><span class="plt-an-acoes">${add}${tipo !== 'farm' ? fixa : ''}</span></div>`;
  }
  function corpoAnalisar(modo) {
    const a = st.analise;
    const topo = K.linha({ id: 'analisar', icone: 'raio', nome: 'Analisar meus pokémon',
      status: st.analisando ? 'analisando todos os seus pokémon…' : a && a.em ? `${nf.format(a.n)} pokémon · ${new Date(a.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${a.slug ? ` · farm em ${esc(nomeHunt(a.slug))}` : ''}` : 'passa por todos, até os fracos',
      dica: 'Farm: XP/h de treinador nesta hunt (só quem você já pode usar). PvP: o Poder de hoje. Vale treinar: o Poder que cada um chega no nível máximo que você pode usar (treinador + 5), já evoluído — a fórmula do ⚔ do próprio jogo.',
      direita: K.acao(st.analisando ? 'Analisando…' : 'De novo', 'data-acao="analisar"', 'raio', st.analisando) });
    if (!a || !a.em) return topo + (a && a.erro ? `<div class="pih-erro">Não deu para analisar: ${esc(a.erro)}</div>` : '');
    const bloco = (titulo, arr, tipo, vazio) => `${K.grupo(titulo)}<div class="plt-an">${arr.length ? arr.map((l) => linhaAnalise(l, tipo, a, modo)).join('') : `<div class="plt-pk-vazio">${vazio}</div>`}</div>`;
    return `${topo}${bloco(`Melhores para farm${a.slug ? ` em ${esc(nomeHunt(a.slug))}` : ''}`, a.farmTop, 'farm', 'esteja numa hunt para medir o farm')}${bloco('Melhores para PvP (Poder de hoje)', a.pvpTop, 'pvp', 'nenhum')}${bloco(`Vale treinar (até o Nv ${nf.format(a.alvoNivel)})`, a.treinar, 'treinar', a.semNota ? 'o módulo de nota do jogo não carregou' : 'nenhum fraco com potencial acima dos de cima')}`;
  }

  function montarBotao() {
    if (botao && botao.isConnected) return;
    const cab = document.querySelector('#p-equipe .painel-cab-equipe');
    if (!cab) return;
    botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'plt-time-bt';
    botao.title = 'Time: o seu time de campo e o do PvP, e a análise dos seus pokémon (Piloto)';
    // 1.17: a pokébola do próprio jogo (a mesma do título da Equipe), colorida, no lugar do ícone apagado
    botao.innerHTML = `<img class="plt-time-bola" src="/assets/site/assets/ui/ball-poke.png" alt="" width="18" height="18"><span>Time</span>`;
    botao.addEventListener('click', (ev) => { ev.stopPropagation(); alternar(); });
    const tg = cab.querySelector('#btn-equipe-toggle');
    if (tg) cab.insertBefore(botao, tg); else cab.append(botao);
  }
  setInterval(montarBotao, 2000);

  // ---- 1.28.1 (pedido do André): o timer de cada pokémon no painel EQUIPE do próprio jogo ---------
  // O jogo refaz as linhas da Equipe (#time > .poke-linha[data-id]) a cada estado; um observador
  // põe de novo, em cada linha, uma linha curta embaixo dos selos:
  //   o que luta agora → "⏱ 36 min · Rattata · rodízio em 24 min"
  //   os outros        → "hoje 1h03 · lutou há 2h10"
  // 1.29 (o André: o texto cortava com "…"): na linha do jogo, só o essencial, curto; um botãozinho
  // ⏱ abre um cartão com tudo — agora, turno, posição na fila do rodízio, quando entra, hoje e os
  // turnos de hoje.
  function infoTurno(id) {
    const a = turnos.atual;
    const r = resumoTurnos(id);
    let fila = null;
    try { fila = PIH.rotina && PIH.rotina.filaRodizio ? PIH.rotina.filaRodizio() : null; } catch { fila = null; }
    const naFila = fila ? fila.fila.find((x) => x.id === id) : null;
    const agora = !!(a && a.pkId === id && eu && eu.activeId === id);
    return { a, r, fila, naFila, agora };
  }
  function textoCurto(id) {
    const { a, fila, naFila, agora, r } = infoTurno(id);
    if (agora) return { agora: true, txt: `⏱ ${duracao(Date.now() - (a.inicio ?? a.desde))}${fila ? ` · faltam ${duracao(fila.falta)}` : ''}` };
    if (naFila) return { agora: false, txt: `${naFila.pos}º na fila · entra em ${duracao(naFila.emMs)}` };
    if (r.ms > 0) return { agora: false, txt: `hoje ${duracao(r.ms)}` };
    return null;
  }
  const ICO_RELOGIO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4.6l3.2 1.9-1 1.7L11 12.7V7z"/></svg>';
  function cartaoTurno(id) {
    const p = meus().find((x) => x.id === id);
    const { a, r, fila, naFila, agora } = infoTurno(id);
    const linhas = [];
    const L = (rot, val) => linhas.push(`<div class="plt-eqc-l"><span>${rot}</span><b>${val}</b></div>`);
    if (agora) {
      L('Agora', `lutando há ${duracao(Date.now() - a.desde)} em ${esc(ondeNome(a.onde))}`);
      L('Turno', `${duracao(Date.now() - (a.inicio ?? a.desde))}${fila ? ` de ${fila.intervaloMin} min · faltam ${duracao(fila.falta)}` : ''}`);
      if (a.motivo) L('Entrou por', esc(a.motivo));
    } else if (naFila) {
      L('Rodízio', `${naFila.pos}º na fila · entra em ~${duracao(naFila.emMs)}`);
    } else if (fila === null) {
      L('Rodízio', 'desligado');
    }
    L('Hoje', `${duracao(r.ms)} lutando · ${r.entradas} turno${r.entradas === 1 ? '' : 's'} · ${r.hunts} hunt${r.hunts === 1 ? '' : 's'}`);
    if (!agora && r.ultimoFim) L('Última vez', `há ${duracao(Date.now() - r.ultimoFim)}`);
    const h0 = new Date(); h0.setHours(0, 0, 0, 0);
    const hoje = [...turnos.hist, ...(a ? [{ ...a, ate: null }] : [])].filter((t) => t.pkId === id && t.onde !== 'centro' && (t.ate == null || t.ate >= h0.getTime()) && (t.ate == null || t.ate - t.desde >= 60_000)).slice(-6).reverse();
    const lista = hoje.length ? `<div class="plt-eqc-sub">Turnos de hoje</div>${hoje.map((t) => `<div class="plt-eqc-t"><span>${hhmm(t.desde)}–${t.ate ? hhmm(t.ate) : 'agora'}</span><span>${esc(ondeNome(t.onde))}</span><span>${duracao((t.ate || Date.now()) - t.desde)}</span></div>`).join('')}` : '';
    const ordem = fila && fila.fila.length ? `<div class="plt-eqc-sub">Fila do rodízio</div>${fila.fila.map((x) => `<div class="plt-eqc-t${x.id === id ? ' eu' : ''}"><span>${x.pos}º</span><span>${esc(x.nome)}</span><span>em ${duracao(x.emMs)}</span></div>`).join('')}` : '';
    return `<div class="plt-eqc-cab">${esc(p ? p.nome : `#${id}`)}<button type="button" class="plt-eqc-x" aria-label="Fechar">×</button></div>${linhas.join('')}${lista}${ordem}`;
  }
  let cartaoAberto = null; // { id, el }
  function fecharCartao() { if (cartaoAberto) { cartaoAberto.el.remove(); cartaoAberto = null; } }
  function abrirCartao(id, ancora) {
    if (cartaoAberto && cartaoAberto.id === id) return fecharCartao();
    fecharCartao();
    const el = document.createElement('div');
    el.className = 'plt-eqc';
    el.setAttribute('role', 'dialog');
    el.innerHTML = cartaoTurno(id);
    document.body.append(el);
    const r = ancora.getBoundingClientRect();
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 200;
    const x = Math.min(Math.max(8, r.right + 8), innerWidth - w - 8);
    const y = Math.min(Math.max(8, r.top - 12), innerHeight - h - 8);
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.querySelector('.plt-eqc-x').addEventListener('click', fecharCartao);
    cartaoAberto = { id, el };
  }
  document.addEventListener('pointerdown', (ev) => { if (cartaoAberto && !cartaoAberto.el.contains(ev.target) && !ev.target.closest('.plt-eq-bt')) fecharCartao(); }, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharCartao(); });
  setInterval(() => { if (cartaoAberto && cartaoAberto.el.isConnected) { const sc = cartaoAberto.el.scrollTop; cartaoAberto.el.innerHTML = cartaoTurno(cartaoAberto.id); cartaoAberto.el.scrollTop = sc; cartaoAberto.el.querySelector('.plt-eqc-x').addEventListener('click', fecharCartao); } }, 15_000);

  function pintarEquipeJogo() {
    const lista = document.getElementById('time');
    if (!lista) return;
    for (const linha of lista.querySelectorAll('.poke-linha[data-id]')) {
      const id = Number(linha.dataset.id);
      const info = linha.querySelector('.pl-cabeca') || linha.querySelector('.pl-info');
      if (!info || !Number.isInteger(id)) continue;
      const t = textoCurto(id);
      let el = info.querySelector(':scope > .plt-eq-turno');
      if (!el) {
        el = document.createElement('div');
        el.className = 'plt-eq-turno';
        el.innerHTML = `<button type="button" class="plt-eq-bt" title="Turnos e rodízio deste pokémon (Piloto)" aria-label="Turnos e rodízio">${ICO_RELOGIO}</button><span class="plt-eq-txt"></span>`;
        const bt = el.querySelector('button');
        // o clique na linha do jogo troca o ativo: o botão não deixa o clique chegar lá
        for (const tipo of ['pointerdown', 'mousedown']) bt.addEventListener(tipo, (ev) => ev.stopPropagation());
        bt.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); abrirCartao(id, bt); });
        info.append(el);
      }
      const span = el.querySelector('.plt-eq-txt');
      const txt = t ? t.txt : '';
      if (span.textContent !== txt) span.textContent = txt;
      el.classList.toggle('agora', !!(t && t.agora));
    }
  }
  let obsEquipe = null;
  let obsAlvo = null;
  let pintandoEquipe = 0;
  function vigiarEquipe() {
    const lista = document.getElementById('time');
    if (lista && lista !== obsAlvo) {
      if (obsEquipe) obsEquipe.disconnect();
      obsAlvo = lista;
      obsEquipe = new MutationObserver(() => { if (!pintandoEquipe) pintandoEquipe = requestAnimationFrame(() => { pintandoEquipe = 0; try { pintarEquipeJogo(); } catch { /* tenta no próximo */ } }); });
      obsEquipe.observe(lista, { childList: true, subtree: true });
    }
    try { pintarEquipeJogo(); } catch { /* tenta no próximo */ }
  }
  setInterval(vigiarEquipe, 15_000);
  setTimeout(vigiarEquipe, 2000);

  function alternar() {
    if (janela) return fechar();
    PIH.arte?.preparar?.();
    janela = document.createElement('div');
    janela.className = 'plt-janela plt-janela-time modal-caixa';
    janela.setAttribute('role', 'dialog');
    janela.setAttribute('aria-label', 'Time');
    janela.innerHTML = `
      <div class="modal-topo plt-topo">
        <div class="modal-topo-esq"><h2 class="plt-h2"><img class="plt-time-bola plt-h2-ico" src="/assets/site/assets/ui/ball-poke.png" alt="" width="22" height="22">Time</h2><span class="plt-sub" data-sub></span></div>
        <div class="modal-acoes"><button type="button" data-acao="fechar" aria-label="Fechar (Esc)" title="Fechar (Esc)">×</button></div>
      </div>
      <div class="modal-corpo plt-modal-corpo"><div class="cfg-corpo"><div class="cfg-layout">
        <nav class="cfg-cats plt-cats" role="tablist" aria-label="Seções">
          ${ABAS.map(([k, r, i]) => `<button type="button" class="cfg-cat" role="tab" data-aba="${k}"><span class="cfg-cat-ico">${K.ico(i, 'dlg-svg')}</span><span class="cfg-cat-rot">${r}</span></button>`).join('')}
        </nav>
        <div class="cfg-paineis"><section class="cfg-painel plt-aba" role="tabpanel">
          <header class="cfg-cab"><span class="cfg-cab-ico" data-cab-ico></span><h3 data-titulo></h3><span class="plt-cab-modo" data-cab-modo></span></header>
          <div class="cfg-linhas plt-corpo-aba" data-conteudo></div>
        </section></div>
      </div></div></div>`;
    document.body.append(janela);
    janela.addEventListener('click', aoClicar);
    posicionar();
    ultimoHtml = '';
    pintar(true);
    analisarSeVelha();
    addEventListener('keydown', aoTeclar, true);
    setTimeout(() => addEventListener('pointerdown', aoClicarFora, true));
    relogio = setInterval(() => pintar(), 1500);
  }
  let relogio = null;
  function fechar() {
    clearInterval(relogio);
    janela?.remove();
    janela = null;
    removeEventListener('keydown', aoTeclar, true);
    removeEventListener('pointerdown', aoClicarFora, true);
  }
  const aoTeclar = (ev) => { if (ev.key === 'Escape') fechar(); };
  const aoClicarFora = (ev) => { const c = ev.composedPath(); if (janela && !c.includes(janela) && !c.includes(botao)) fechar(); };
  function posicionar() {
    if (!janela) return;
    const base = document.getElementById('p-equipe')?.getBoundingClientRect();
    const larg = janela.offsetWidth || 900;
    let left = base ? base.right + 10 : 20;
    let top = base ? Math.max(8, base.top - 120) : 20;
    if (left + larg > innerWidth - 8) left = Math.max(8, innerWidth - larg - 8);
    top = Math.min(top, Math.max(8, innerHeight - janela.offsetHeight - 8));
    janela.style.left = `${left}px`;
    janela.style.top = `${top}px`;
  }

  const MODO_TXT = { desligado: 'Off · tudo parado', manual: 'Manual · você ajusta', automatico: 'Auto · o Piloto calcula' };
  function pintar(forcar = false) {
    if (!janela) return;
    const modo = modoPiloto();
    janela.dataset.modo = modo;
    const aba = cfg.aba;
    for (const b of janela.querySelectorAll('.cfg-cat[data-aba]')) { const on = b.dataset.aba === aba; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    const [, rot, ic] = ABAS.find((x) => x[0] === aba);
    const tit = janela.querySelector('[data-titulo]');
    if (tit.textContent !== rot) { tit.textContent = rot; janela.querySelector('[data-cab-ico]').innerHTML = K.ico(ic, 'dlg-svg'); }
    const cm = janela.querySelector('[data-cab-modo]');
    if (cm.textContent !== MODO_TXT[modo]) { cm.textContent = MODO_TXT[modo]; cm.dataset.modo = modo; }
    const sub = janela.querySelector('[data-sub]');
    const s = eu ? `Treinador Nv ${nf.format(eu.level || 0)}${eu.huntSlug && !eu.noCentro ? ` · em ${nomeHunt(eu.huntSlug)}` : eu.noCentro ? ' · no Centro' : ''}` : 'esperando o jogo';
    if (sub.textContent !== s) sub.textContent = s;
    const alvo = janela.querySelector('[data-conteudo]');
    dadosArte.clear();
    const off = modo === 'desligado' ? K.linha({ id: 'off', icone: 'fechar', nome: 'Piloto desligado', classe: 'plt-l-off', status: 'Nada automático roda. O cadeado e a análise continuam.' }) : '';
    const arteMeta = (d, px, chave) => arte({ ...d, id: chave }, px, 'meta');
    const corpoMeta = () => (PIH.meta ? `${PIH.metaCaca ? PIH.metaCaca.html({ modo, arte: arteMeta }) : ''}${PIH.meta.html({ modo, arte: arteMeta })}` : '<div class="pih-erro">O módulo do meta não carregou.</div>');
    const html = !eu ? '<div class="pih-carga">Esperando o jogo conectar…</div>' : off + (aba === 'meta' ? corpoMeta() : corpoTime(modo));
    if (forcar || html !== ultimoHtml) {
      ultimoHtml = html;
      alvo.innerHTML = html;
      for (const l of alvo.querySelectorAll('.cfg-linha[data-linha]')) if (abertas.has(l.dataset.linha)) l.classList.add('aberta');
    }
    if (PIH.arte) PIH.arte.preparar().then(() => { if (janela) PIH.arte.hidratar(alvo, (k) => dadosArte.get(k)); });
  }

  function aoClicar(ev) {
    const t = ev.target.closest('button');
    if (!t || !janela || !janela.contains(t) || t.disabled) return;
    if (t.matches('[data-acao="fechar"]')) return fechar();
    if (t.matches('.cfg-cat[data-aba]')) { cfg.aba = t.dataset.aba; gravar(); pintar(true); analisarSeVelha(); return; }
    if (t.matches('.cfg-ajuda')) { const l = t.closest('.cfg-linha'); if (l) { l.classList.toggle('aberta'); const k = l.dataset.linha; if (l.classList.contains('aberta')) abertas.add(k); else abertas.delete(k); } return; }
    if (t.matches('.cfg-toggle[data-alternar]')) {
      const alvo = t.dataset.alternar;
      const v = !t.classList.contains('on');
      if (alvo === 'time:principalAuto') {
        cfg.campoAuto = v; gravar();
        PIH.rotina?.definir?.('pvp.time', v); // o PvP recebe a mesma equipe
        diario(`montar o time principal sozinho ${v ? 'ligado' : 'desligado'}`); if (v) st.ultimaTroca = 0;
      } else if (alvo === 'time:doMeta') { cfg.doMeta = v; gravar(); st.ultimaTroca = 0; diario(`usar os do meta ${v ? 'ligado' : 'desligado'}`); }
      else if (alvo === 'rotina:rodizio.ligado') PIH.rotina?.definir?.('rodizio.ligado', v);
      else if (alvo === 'metacaca:ligado') { Promise.resolve(PIH.metaCaca?.definir?.('ligado', v)).then(() => pintar(true)); }
      pintar(true);
      return;
    }
    if (t.matches('[data-travar]')) {
      const [lista, id] = t.dataset.travar.split(':');
      const n = Number(id);
      const arr = cfg.travados[lista];
      if (!arr || !Number.isInteger(n)) return;
      const i = arr.indexOf(n);
      if (i >= 0) arr.splice(i, 1); else if (arr.length < MAX_EQUIPE) arr.push(n);
      gravar();
      pintar(true);
      return;
    }
    if (t.matches('[data-acao="analisar"]')) { analisar(); return; }
    if (t.matches('[data-escolha^="meta:"]')) { PIH.meta?.definir?.(t.dataset.escolha.slice(5), t.dataset.valor); pintar(true); return; }
    if (t.matches('[data-escolha^="metacaca:"]')) { PIH.metaCaca?.definir?.(t.dataset.escolha.slice(9), t.dataset.valor); pintar(true); return; }
    const m = /^campo:(\d+)$/.exec(t.dataset.acao || '');
    if (m) {
      const p = porId(Number(m[1]));
      if (!p || p.slot != null || !podeUsar(p)) return;
      const slug = eu.huntSlug || ultimaHunt;
      const time = timeCampo();
      if (time.length < MAX_EQUIPE) trocar(p, null, 'você pediu');
      else {
        const trocaveis = time.filter((x) => !travado('campo', x.id) && x.id !== eu.activeId);
        if (!trocaveis.length) { st.motivo = 'todas as vagas travadas'; pintar(true); return; }
        const fraco = trocaveis.reduce((a, b) => (poderDe(b) < poderDe(a) ? b : a), trocaveis[0]);
        trocar(p, fraco, 'você pediu');
      }
      st.ultimaTroca = Date.now();
      pintar(true);
    }
  }

  function aplicar(o) {
    if (o && typeof o.campoAuto === 'boolean') { cfg.campoAuto = o.campoAuto; gravar(); }
  }
  // 1.26: o Caçar o meta completou → o time segue os do meta (sem cadeado), no campo e no PvP.
  // `soltar`: os cadeados que o 1.24/1.25 pôs (só sai o cadeado se a lista for exatamente aquela).
  function usarMeta(motivo, soltar, opcoes = {}) {
    if (opcoes.huntDepois) st.huntDepois = true;
    if (Array.isArray(soltar) && soltar.length && cfg.travados.time.length === soltar.length && cfg.travados.time.every((id) => soltar.includes(id))) cfg.travados.time = [];
    cfg.doMeta = true;
    cfg.campoAuto = true;
    gravar();
    PIH.rotina?.definir?.('pvp.time', true);
    st.ultimaTroca = 0;
    diario(`${motivo}: montar sozinho ligado, usando os do meta`, 'ok');
  }
  // 1.24: o Caçar o meta fechou os 5 → viram o time principal (com cadeado) e montar sozinho liga.
  function fixarTime(ids) {
    const ok = (ids || []).filter((id) => Number.isInteger(id)).slice(0, MAX_EQUIPE);
    if (!ok.length) return;
    cfg.travados.time = ok;
    cfg.campoAuto = true;
    gravar();
    PIH.rotina?.definir?.('pvp.time', true);
    st.ultimaTroca = 0;
    diario(`time principal fixado pelo meta: ${ok.map((id) => porId(id)?.nome || id).join(', ')}`, 'ok');
  }
  const protegidos = () => { const n = Date.now(); for (const [id, ate] of protegerAte) if (ate < n) protegerAte.delete(id); return [...protegerAte.keys()]; };
  PIH.meta?.ligarPintura?.(() => { if (janela && cfg.aba === 'meta') pintar(); });
  function abrirAba(aba) {
    if (!ABAS.some(([k]) => k === aba)) return;
    cfg.aba = aba; gravar();
    if (!janela) alternar(); else pintar(true);
  }
  PIH.time = { alternar, abrirAba, aplicar, analisar, protegidos, fixarTime, usarMeta, emSessao: () => !!st.sessao, turnoAtual, ultimaVez, doMeta: () => doMetaAgora().map((x) => x.p.id), travados: () => cfg.travados.time.slice(), alvoPrincipal: () => alvoPrincipal().map((p) => p.id), compEstavel: (r) => compEstavel(r || "topo").map((a) => a.speciesId), _cfgTime: () => cfg, campoAuto, _interno: { cfg: () => cfg, st, turnos: () => turnos, tarefaCampo, andarTroca, andarSessao, farm, medirFarm } };
})(globalThis);
