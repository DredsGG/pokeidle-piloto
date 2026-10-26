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
      return { campoAuto: typeof c.campoAuto === 'boolean' ? c.campoAuto : null, doMeta: c.doMeta !== false, travados: { time: uniao }, aba: ['time', 'meta'].includes(c.aba) ? c.aba : 'time' };
    } catch { return { campoAuto: null, doMeta: true, travados: { time: [] }, aba: 'time' }; }
  };
  const cfg = lerCfg();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`time: ${txt}`, tipo);

  let eu = null;
  let welcome = null;
  let ultimaHunt = null;
  PIH.on('welcome', (w) => { welcome = w; });
  PIH.on('estado', (e) => { eu = e; if (e && e.huntSlug && !e.noCentro) ultimaHunt = e.huntSlug; });

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
  // Uma troca em passos: tira (vai para o Depot) → guarda na Coleção → põe o novo na vaga.
  function andarTroca() {
    const t = st.troca;
    if (!t || !eu) return;
    const agora = Date.now();
    if (agora - t.desde > 45_000) { diario(`troca cancelada: o jogo não respondeu (${t.nomeEntra})`, 'aviso'); st.troca = null; return; }
    const sai = t.sai ? porId(t.sai) : null;
    const entra = porId(t.entra);
    if (!entra) { st.troca = null; return; }
    if (t.etapa === 'sair') {
      if (sai && sai.slot != null) return; // ainda saindo
      const colecao = (eu.automation && Array.isArray(eu.automation.pokemonTravado)) ? eu.automation.pokemonTravado : [];
      if (sai && !colecao.includes(sai.id)) pedir({ t: 'colecao.mover', pokemonId: sai.id, para: 'colecao' }, `${sai.nome} guardado na Coleção`);
      t.etapa = 'entrar'; t.em = agora;
      return;
    }
    if (t.etapa === 'entrar') {
      if (entra.slot != null) { diario(`${entra.nome} entrou no time de campo`, 'ok'); st.troca = null; st.ultimaTroca = agora; return; }
      if (agora - t.em < 800) return;
      const vaga = vagaLivre();
      if (vaga == null) return;
      pedir({ t: 'team.move', pokemonId: entra.id, slot: vaga });
      t.em = agora + 3000; // espera o estado
    }
  }
  function trocar(entra, sai, motivo) {
    if (st.troca) return false;
    st.troca = { entra: entra.id, nomeEntra: entra.nome, sai: sai ? sai.id : null, etapa: sai ? 'sair' : 'entrar', desde: Date.now(), em: 0 };
    if (sai) protegerAte.set(sai.id, Date.now() + 3 * 60_000); // a venda imediata do Depot não leva no meio da troca
    if (sai) { if (!pedir({ t: 'team.move', pokemonId: sai.id, slot: null }, `${motivo}: sai ${sai.nome}, entra ${entra.nome}`)) { st.troca = null; return false; } }
    else diario(`${motivo}: entra ${entra.nome}`);
    andarTroca();
    return true;
  }
  // 1.26 (pedido do André): os do meta que você tem. Para cada pokémon da comp do meta (o recorte
  // do Caçar o meta: Topo 20 ou Sua faixa), o seu melhor da mesma família (Mega X conta como X),
  // que o treinador pode usar. Conferido a cada volta: pegou um melhor da família, ele entra.
  function doMetaAgora() {
    if (!cfg.doMeta || !PIH.meta || !PIH.meta.familia || !PIH.meta.familia.raizDePk) return [];
    let recorte = 'topo';
    try { recorte = JSON.parse(localStorage.getItem('piloto:metacaca:v1') || 'null')?.recorte === 'faixa' ? 'faixa' : 'topo'; } catch { /* topo */ }
    const comp = (PIH.meta.agregar(recorte) || {}).comp || [];
    const F = PIH.meta.familia;
    const cand = meus().filter((p) => p.stats && podeUsar(p) && poderDe(p) > 0);
    const out = [];
    for (const a of comp) {
      const raizA = F.raizDoMeta(a);
      if (raizA == null) continue;
      const p = cand.filter((x) => !out.some((o) => o.p.id === x.id) && F.raizDePk(x) === raizA).sort((x, y) => poderDe(y) - poderDe(x))[0];
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
  async function tarefaCampo() {
    if (calculando || st.troca || !eu || !campoAuto()) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('time')) { st.motivo = 'Piloto desligado (ou disjuntor)'; return; }
    const temVaga = timeCampo().length < MAX_EQUIPE;
    if (!temVaga && Date.now() - st.ultimaTroca < ESPERA_TROCA_MS) return; // vaga livre enche logo; troca, no máximo 1 a cada 2 min
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
    const status = !on ? 'desligado' : st.troca ? `trocando: entra ${esc(st.troca.nomeEntra)}` : `${st.motivo ? esc(st.motivo) : base} · ${pvpTxt}`;
    const linha = K.linha({ id: 'principal', icone: 'pvp', nome: 'Montar o time principal sozinho', alvo: 'time:principalAuto', on, trava, status,
      dica: 'Um time só para o campo e para o PvP. Primeiro os do meta que você tem (para cada pokémon da comp da aba Meta, o seu melhor da mesma família; Mega X conta como X), depois os de maior Poder que você já pode usar (treinador + 5). Entra quem tiver 2% mais Poder que o mais fraco; quem sai vai para a Coleção (a venda nunca leva). O cadeado fixa no time; o que está lutando só sai depois do rodízio. O PvP recebe a mesma equipe (treinador Nv 150+). No máximo uma troca a cada 2 min.',
      ajustes: modo === 'manual' ? K.mini('time:doMeta', cfg.doMeta, 'Usar os do meta', 'Põe no time, primeiro, os pokémon do meta que você tem', trava) : '' });
    const r = rc && rc.rodizio;
    const rod = K.linha({ id: 'rodizio', icone: 'nivel', nome: 'Rodízio do time', alvo: 'rotina:rodizio.ligado', on: !!(r && r.ligado), trava,
      status: r && r.ligado ? `troca o ativo a cada ${r.intervaloMin} min${PIH.rotina && PIH.rotina.proximoRodizio ? ` · ${esc(PIH.rotina.proximoRodizio())}` : ''}` : 'desligado',
      dica: 'A cada hora o próximo do time vira o ativo, um de cada vez, para todos ganharem XP. Com a Troca de hunt ligada, ele vai na hora para a melhor hunt do pokémon que entrou.' });
    const max = maxDe(time);
    const vazias = Math.max(0, MAX_EQUIPE - time.length);
    return `${linha}${rod}${K.grupo(`Time principal · campo e PvP · ${time.length}/${MAX_EQUIPE}${slug ? ` · farm em ${esc(nomeHunt(slug))}` : ''}`)}${time.map((p) => { const m = cfg.doMeta ? doMetaAgora().find((x) => x.p.id === p.id) : null; return cartao(p, { lista: 'time', slug, maxStats: max, trava, extra: m ? `<span class="plt-meta-tem on" title="Do meta: ${esc(m.meta)}">meta · ${esc(m.meta)}</span>` : '' }); }).join('')}${'<div class="plt-pk-vazio">vaga livre</div>'.repeat(vazias)}`;
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
  function usarMeta(motivo, soltar) {
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
  PIH.time = { alternar, abrirAba, aplicar, analisar, protegidos, fixarTime, usarMeta, doMeta: () => doMetaAgora().map((x) => x.p.id), travados: () => cfg.travados.time.slice(), alvoPrincipal: () => alvoPrincipal().map((p) => p.id), campoAuto, _interno: { cfg: () => cfg, st, tarefaCampo, andarTroca, farm, medirFarm } };
})(globalThis);
