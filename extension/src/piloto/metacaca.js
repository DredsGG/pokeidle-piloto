// Caçar o meta (1.24): vai buscar, um por um, os 5 pokémon da comp do meta.
//
// Pedido do André (2026-10-23/24), etapa 3 do meta:
// - começa DESLIGADO; ligar desliga a Troca de hunt (e ligar a Troca de hunt desliga este);
// - o mais forte do time luta; o Piloto vai à hunt onde a família do alvo aparece e fica até
//   capturar; capturou → guarda na Coleção (nunca vende) e vai para o próximo;
// - "o que for mais fácil de capturar": entre as hunts onde aparece algum da família (a base ou já
//   evoluído), a de mais encontros por hora com o alvo (abates/h × fatia do alvo nos spawns), com
//   um pequeno bônus para a forma mais evoluída. Família sem hunt (lendário) é pulada;
// - "primeiro, depois melhora": o primeiro de cada família vale; se depois vier um melhor (mais
//   Poder no nível máximo que você pode usar), ele toma o lugar e o antigo deixa de ser guardado;
// - fechou os 5 → vira o time principal (campo e PvP, com cadeado) e o modo se desliga sozinho.
//   A Troca de hunt fica para você ligar.
// A comp é congelada quando você liga: o meta mudar no meio não muda o alvo.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:metacaca:v1';
  const IR_A_CADA_MS = 2 * 60_000;
  const ESCOLHA_VALE_MS = 10 * 60_000;
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  const ler = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      return { ligado: c.ligado === true, recorte: c.recorte === 'faixa' ? 'faixa' : 'topo', alvos: Array.isArray(c.alvos) ? c.alvos : [], vistos: Array.isArray(c.vistos) ? c.vistos : [], desde: Number(c.desde) || 0, fim: c.fim || null };
    } catch { return { ligado: false, recorte: 'topo', alvos: [], vistos: [], desde: 0, fim: null }; }
  };
  let cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`meta: ${txt}`, tipo);

  let eu = null;
  let welcome = null;
  PIH.on('estado', (e) => { eu = e; });
  PIH.on('welcome', (w) => { welcome = w; });

  const meus = () => ((eu && eu.pokemons) || []).filter((p) => p && Number.isInteger(p.id) && !p.ovo);
  const porId = (id) => meus().find((p) => p.id === id) || null;
  const podeUsar = (p) => !!p && (p.starter || (Number(p.level) || 0) <= (Number(eu && eu.level) || 0) + 5);
  const poderDe = (p) => Number(p && p.poder) || 0;
  const nomeHunt = (slug) => ((welcome && welcome.hunts) || []).find((h) => h.slug === slug)?.nome || slug || '—';

  // ---- o "melhor": o Poder no nível máximo que você pode usar (a fórmula do ⚔ do jogo) ----------
  let N = null;
  (async () => { try { N = await import(`${location.origin}/shared/nota-pokemon.mjs`); } catch { N = null; } })();
  async function potencial(p) {
    try {
      const j = await PIH.carregarJogo();
      const esp = j.especies.get(p.speciesId);
      if (!N || !N.poderDePokemon || !esp) return poderDe(p);
      return N.poderDePokemon({ ...p, level: Math.max(p.level || 1, (Number(eu && eu.level) || 1) + 5) }, esp);
    } catch { return poderDe(p); }
  }

  // ---- ligar e desligar -----------------------------------------------------------------------
  const st = { motivo: '', alvoAtual: null, escolha: null, irEm: 0, ultimaTroca: 0 };
  async function ligar() {
    if (!PIH.meta || !PIH.meta.familia) return { ok: false, motivo: 'a aba Meta não carregou' };
    if (!(await PIH.meta.familia.pronta())) return { ok: false, motivo: 'o catálogo do jogo ainda não carregou' };
    const comp = PIH.meta.agregar(cfg.recorte).comp;
    if (comp.length < 5) return { ok: false, motivo: `a comp do meta ainda tem ${comp.length} de 5 (espere a aba Meta ler mais times)` };
    const alvos = [];
    for (const a of comp) {
      const raizId = PIH.meta.familia.raizDoMeta(a);
      // 1.26.3: quem evolui até o do meta (todas as linhagens), não só a linhagem da raiz
      const membros = PIH.meta.familia.membrosDoMeta ? PIH.meta.familia.membrosDoMeta({ speciesId: a.speciesId, nome: a.nome }) : (raizId != null ? PIH.meta.familia.membros(raizId) : []);
      // a mesma família pode aparecer duas vezes na comp (ex.: Charizard e Mega Charizard): cada vaga precisa do seu
      const usados = new Set(alvos.map((x) => x.capturadoId).filter(Boolean));
      const tenho = meus().filter((p) => PIH.meta.familia.serve(p, { speciesId: a.speciesId, nome: a.nome }) && !usados.has(p.id)).sort((x, y) => poderDe(y) - poderDe(x))[0] || null;
      alvos.push({ meta: a.nome, metaId: a.speciesId, raiz: raizId, membros, capturadoId: tenho ? tenho.id : null, tinhaId: tenho ? tenho.id : null, tinha: !!tenho, semHunt: false });
    }
    cfg = { ...cfg, ligado: true, alvos, vistos: meus().map((p) => p.id), desde: Date.now(), fim: null };
    gravar();
    // os dois não andam juntos: a Troca de hunt levaria o Piloto para longe do alvo
    if (PIH.auto && PIH.auto._interno && PIH.auto._interno.cfg().hunt.ligado) { PIH.auto.definir('hunt.ligado', false); diario('Troca de hunt desligada (o Caçar o meta escolhe a hunt)'); }
    diario(`ligado — alvo: ${alvos.map((x) => x.meta).join(', ')}${alvos.some((x) => x.tinha) ? ` (já tem: ${alvos.filter((x) => x.tinha).map((x) => x.meta).join(', ')})` : ''}`, 'ok');
    st.escolha = null;
    return { ok: true };
  }
  function desligar(motivo) {
    if (!cfg.ligado) return;
    cfg.ligado = false;
    gravar();
    diario(`desligado${motivo ? ` (${motivo})` : ''}`);
  }

  // ---- capturas -------------------------------------------------------------------------------
  // 1.26: a família pela raiz (Mega X e as linhagens alternativas contam), não pela lista de ids.
  // 1.26.3: serve para a vaga quem é o do meta (ou o Mega) ou evolui até ele, por qualquer linhagem.
  const daFamilia = (a, p) => (PIH.meta?.familia?.serve ? PIH.meta.familia.serve(p, { speciesId: a.metaId, nome: a.meta }) : (a.raiz != null && PIH.meta?.familia?.raizDePk?.(p) === a.raiz));
  // a primeira vaga ainda sem pokémon dessa família; se todas têm, a do mais fraco (para melhorar)
  const alvoDaEspecie = (p) => cfg.alvos.find((a) => daFamilia(a, p) && !(a.capturadoId && porId(a.capturadoId))) || cfg.alvos.find((a) => daFamilia(a, p));
  async function conferirCapturas() {
    const vistos = new Set(cfg.vistos);
    const novos = meus().filter((p) => !vistos.has(p.id));
    if (!novos.length) return;
    for (const p of novos) {
      vistos.add(p.id);
      const a = alvoDaEspecie(p);
      if (!a) continue;
      const atual = a.capturadoId ? porId(a.capturadoId) : null;
      if (!atual) {
        a.capturadoId = p.id;
        diario(`capturou ${p.nome} (Nv ${p.level}) — ${a.meta} do meta, guardado na Coleção`, 'ok');
        guardarNaColecao(p);
      } else if ((await potencial(p)) > (await potencial(atual)) * 1.02) {
        a.capturadoId = p.id;
        diario(`capturou um ${p.nome} melhor — ele fica no lugar do anterior (${atual.nome} Nv ${atual.level})`, 'ok');
        guardarNaColecao(p);
      }
    }
    cfg.vistos = [...vistos].slice(-3000);
    gravar();
  }
  // 1.26 (pedido do André: "sempre verificar para deixar 100% alinhado"): a cada volta, cada vaga
  // fica com o MELHOR pokémon seu daquela família — inclusive o que você já tinha antes de ligar
  // (o Venusaur que ele tinha no time e o 1.24 não viu). Ninguém ocupa duas vagas.
  async function alinhar() {
    if (!PIH.meta?.familia?.serve) return;
    const usados = new Set();
    let mexeu = false;
    for (const a of cfg.alvos) {
      const cand = meus().filter((p) => !usados.has(p.id) && daFamilia(a, p));
      let melhor = null;
      let mv = -1;
      for (const p of cand) { const v = await potencial(p); if (v > mv) { mv = v; melhor = p; } }
      const atual = a.capturadoId ? porId(a.capturadoId) : null;
      if (melhor && (!atual || usados.has(atual.id) || (melhor.id !== atual.id && mv > (await potencial(atual)) * 1.02))) {
        if (atual && !usados.has(atual.id)) diario(`${a.meta}: você já tem um ${melhor.nome} melhor (Nv ${melhor.level}) — ele fica no lugar do ${atual.nome} Nv ${atual.level}`, 'ok');
        else if (!atual) diario(`${a.meta}: você já tem ${melhor.nome} (Nv ${melhor.level}) — não precisa caçar`, 'ok');
        a.capturadoId = melhor.id; a.tinhaId = melhor.id; a.tinha = true; mexeu = true;
      }
      if (a.capturadoId) usados.add(a.capturadoId);
    }
    if (mexeu) gravar();
  }
  function guardarNaColecao(p) {
    const colecao = (eu && eu.automation && Array.isArray(eu.automation.pokemonTravado)) ? eu.automation.pokemonTravado : [];
    if (colecao.includes(p.id) || p.slot != null) return;
    PIH.pedir({ t: 'colecao.mover', pokemonId: p.id, para: 'colecao' }, 'metacaca');
  }

  // ---- onde caçar -----------------------------------------------------------------------------
  function cacador() {
    const time = meus().filter((p) => p.slot != null && p.stats && podeUsar(p) && !(p.hp != null && Number(p.hp) <= 0));
    return time.sort((a, b) => poderDe(b) - poderDe(a))[0] || null;
  }
  async function escolherHunt(alvo, pk) {
    // 1.31 (o André: "pokémon da Outland não evolui, tem que ser os normais dos campos normais"):
    // a Outland fica de fora, a não ser que a própria espécie do meta seja uma variante Outland.
    const F = PIH.meta && PIH.meta.familia;
    const ehOutland = (id) => (F && F.ehOutland ? F.ehOutland(id) : Number(id) >= 2001 && Number(id) < 2100);
    const soOutland = alvo.membros.length > 0 && alvo.membros.every((m) => ehOutland(m.id));
    const huntOutland = (h) => h.area === 'outland' || h.regiao === 'outland' || /outland/i.test(String(h.slug || ''));
    const hunts = ((welcome && welcome.hunts) || []).filter((h) => (soOutland || !huntOutland(h)) && (h.especies || []).some((e) => alvo.membros.some((m) => m.id === e.pokeId) && (soOutland || !ehOutland(e.pokeId))));
    if (!hunts.length) return null;
    const jogo = await PIH.carregarJogo();
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem: jogo.precoItem, hunts,
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu, geo: (slug) => (PIH.geo ? PIH.geo.daHunt(slug) : null), ritmoMedido: () => null,
    };
    let linhas = [];
    try { linhas = PIH.engine.analisar(pk, ctx, { soLiberadas: true, comPocao: true }).linhas || []; } catch { linhas = []; }
    let melhor = null;
    for (const l of linhas) {
      if (!l || l.inviavel || l.umHit || l.mortesH >= 0.2) continue;
      const h = hunts.find((x) => x.slug === l.slug);
      if (!h) continue;
      const total = (h.especies || []).reduce((s, e) => s + (Number(e.pontos) || 0), 0) || 1;
      let nota = 0;
      let qual = null;
      for (const e of h.especies || []) {
        const m = alvo.membros.find((x) => x.id === e.pokeId);
        if (!m || (!soOutland && ehOutland(e.pokeId))) continue;
        const v = (Number(l.kph) || 0) * ((Number(e.pontos) || 0) / total) * (1 + 0.25 * m.estagio);
        if (v > nota) { nota = v; qual = m; }
      }
      if (nota > 0 && (!melhor || nota > melhor.nota)) melhor = { slug: h.slug, nome: h.nome, nota, especie: qual, porHora: (Number(l.kph) || 0) * ((h.especies.find((e) => e.pokeId === qual.id)?.pontos || 0) / total) };
    }
    return melhor;
  }

  // ---- o relógio --------------------------------------------------------------------------------
  let andando = false;
  async function tique() {
    if (!cfg.ligado || andando || !eu || !welcome) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('metacaca')) { st.motivo = 'Piloto desligado (ou disjuntor)'; return; }
    andando = true;
    try {
      await conferirCapturas();
      await alinhar();
      const falta = cfg.alvos.filter((a) => !(a.capturadoId && porId(a.capturadoId)) && !a.semHunt);
      if (!falta.length) return concluir();
      const pk = cacador();
      if (!pk) { st.motivo = 'nenhum pokémon do time pode lutar'; return; }
      // o mais forte luta (o rodízio fica parado enquanto este modo estiver ligado)
      if (eu.activeId !== pk.id && Date.now() - st.ultimaTroca > 60_000) { st.ultimaTroca = Date.now(); PIH.pedir({ t: 'team.active', pokemonId: pk.id }, 'metacaca'); diario(`${pk.nome} (⚔ ${nf.format(poderDe(pk))}) entra para caçar`); }
      const alvo = falta[0];
      if (!st.escolha || st.escolha.alvo !== alvo.raiz || Date.now() - st.escolha.em > ESCOLHA_VALE_MS) {
        const h = await escolherHunt(alvo, pk);
        if (!h) {
          alvo.semHunt = true; gravar();
          diario(`${alvo.meta}: nenhuma hunt liberada onde a família aparece e o ${pk.nome} mate com segurança — pulando`, 'aviso');
          return;
        }
        st.escolha = { alvo: alvo.raiz, em: Date.now(), ...h };
      }
      st.alvoAtual = alvo;
      const e = st.escolha;
      if (eu.huntSlug !== e.slug || eu.noCentro) {
        if (!st.motivo || !/^(indo|não deu)/.test(st.motivo)) st.motivo = `a caminho de ${e.nome} (atrás de ${e.especie.nome})`;
        if (PIH.auto && !PIH.auto.rotinaAtual() && Date.now() - st.irEm > IR_A_CADA_MS) {
          st.irEm = Date.now();
          const r = PIH.auto.irParaHunt(e.slug);
          st.motivo = r.ok ? `indo para ${e.nome} atrás de ${e.especie.nome}` : `não deu para ir a ${e.nome}: ${r.motivo}`;
        }
        return;
      }
      const captura = PIH.captura && PIH.captura.resumo ? PIH.captura.resumo() : null;
      const semBola = captura && !captura.vip && !captura.ligado;
      st.motivo = `caçando ${e.especie.nome} em ${e.nome} · ~${e.porHora >= 1 ? nf.format(e.porHora) : '<1'} por hora${semBola ? ' · ligue a Pokébola automática!' : ''}`;
    } catch (err) { st.motivo = 'não consegui calcular'; console.warn('[piloto] metacaca:', err); } finally { andando = false; }
  }
  // 1.26 (pedido do André): completou → o "Montar o time principal sozinho" passa a usar os do meta
  // que você tem (sem cadeado: se aparecer um melhor da família, ele entra), no campo e no PvP, e a
  // Troca de hunt volta a ligar para farmar com esse time.
  function concluir() {
    const ids = cfg.alvos.map((a) => a.capturadoId).filter((id) => id && porId(id)).slice(0, 5);
    cfg.fim = { em: Date.now(), ids };
    desligar('o time do meta está completo');
    // 1.26.3 (pedido do André): a Troca de hunt só religa DEPOIS que a janela Time trocar o time
    // inteiro no Centro (ela religa no fim da troca).
    if (PIH.time && PIH.time.usarMeta) PIH.time.usarMeta('o Caçar o meta completou o time', null, { huntDepois: true });
    else religarHunt();
    diario(`time do meta completo: ${ids.map((id) => porId(id)?.nome).join(', ')} — agora o Piloto vai ao Centro trocar o time (campo e PvP) e depois religa a Troca de hunt.`, 'ok');
  }
  function religarHunt() {
    try { if (PIH.auto && PIH.auto._interno && !PIH.auto._interno.cfg().hunt.ligado) { PIH.auto.definir('hunt.ligado', true); diario('Troca de hunt ligada de novo (farm com o time do meta)'); } } catch { /* sem auto */ }
  }
  // 1.26: quem completou na 1.24/1.25 ficou com os 5 no cadeado e a Troca de hunt desligada. Uma vez:
  // solta o cadeado (o time segue os do meta), liga a Troca de hunt.
  try {
    // só na página do jogo: a extensão também carrega em /terms (a vigia), e lá não há time para soltar
    if (/^\/app\/?$/.test(location.pathname) && !cfg.ligado && cfg.fim && !localStorage.getItem('piloto:migr:meta126')) {
      localStorage.setItem('piloto:migr:meta126', '1');
      setTimeout(() => {
        if (PIH.time && PIH.time.usarMeta) PIH.time.usarMeta('1.26: o time segue os do meta que você tem', cfg.fim.ids);
        religarHunt();
      }, 20_000);
    }
  } catch { /* sem armazenamento */ }
  setInterval(() => { tique(); }, 10_000);

  // Os guardados: o capturado de cada família e, enquanto caça, toda a família dos alvos no Depot.
  const protegidos = () => cfg.alvos.map((a) => a.capturadoId).filter(Boolean);
  const especiesAlvo = () => (cfg.ligado ? cfg.alvos.flatMap((a) => a.membros.map((m) => m.id)) : []);

  // ---- a linha na aba Meta ----------------------------------------------------------------------
  function html({ modo, arte }) {
    const trava = modo === 'desligado';
    const ok = (a) => a.capturadoId && porId(a.capturadoId);
    const feitos = cfg.alvos.filter(ok).length;
    const status = cfg.ligado ? `${feitos}/${cfg.alvos.length} · ${esc(st.motivo || 'começando…')}` : cfg.fim ? `último: time completo em ${new Date(cfg.fim.em).toLocaleDateString('pt-BR')}` : 'desligado';
    const linha = K.linha({ id: 'metacaca', icone: 'cacar', nome: 'Caçar o meta', alvo: 'metacaca:ligado', on: cfg.ligado, trava, status,
      dica: 'Vai buscar os 5 da comp do meta, um por um: o mais forte do time luta na hunt onde a família aparece com mais frequência (a base ou já evoluído) até capturar. Capturado vai para a Coleção e nunca é vendido. Se vier um melhor, ele fica no lugar. Com os 5, viram o time principal (campo e PvP) e este modo se desliga. Ligar desliga a Troca de hunt; ligar a Troca de hunt desliga este. Precisa de bola: VIP (Lançar sem Parar) ou a Pokébola automática.',
      direita: cfg.ligado ? '' : K.escala('metacaca:recorte', cfg.recorte, [['topo', 'Topo 20'], ['faixa', 'Sua faixa']], trava) });
    if (!cfg.alvos.length) return linha;
    const linhas = cfg.alvos.map((a) => {
      const p = ok(a) ? porId(a.capturadoId) : null;
      const atual = cfg.ligado && st.alvoAtual && st.alvoAtual.raiz === a.raiz;
      const estado = p ? `<span class="plt-meta-tem on">${p.id === a.tinhaId ? 'já tinha' : 'capturado'}: ${esc(p.nome)} Nv ${nf.format(p.level || 0)}</span>`
        : a.semHunt ? '<span class="plt-meta-tem plt-meta-falta">sem hunt: pulado</span>'
          : atual ? `<span class="plt-meta-tem plt-meta-cacando">caçando${st.escolha ? ` ${esc(st.escolha.especie.nome)} em ${esc(nomeHunt(st.escolha.slug))}` : ''}</span>` : '<span class="plt-meta-tem">na fila</span>';
      return `<div class="plt-an-l"><span class="plt-an-arte">${arte({ speciesId: a.metaId, shiny: false, nome: a.meta }, 34, `caca:${a.raiz}`)}</span><span class="plt-an-nome"><b>${esc(a.meta)}</b><small>${esc(a.membros.map((m) => m.nome).join(' → '))}</small></span><span class="plt-an-acoes">${estado}</span></div>`;
    }).join('');
    return `${linha}<div class="plt-an">${linhas}</div>`;
  }
  async function definir(caminho, v) {
    if (caminho === 'recorte' && !cfg.ligado && (v === 'topo' || v === 'faixa')) { cfg.recorte = v; gravar(); return null; }
    if (caminho === 'ligado') {
      if (v) { const r = await ligar(); if (!r.ok) { st.motivo = r.motivo; diario(`não liguei: ${r.motivo}`, 'aviso'); } return r; }
      desligar('você desligou');
    }
    return null;
  }

  PIH.metaCaca = { html, definir, desligar, ativo: () => cfg.ligado, protegidos, especiesAlvo, _interno: { cfg: () => cfg, st, tique, escolherHunt, conferirCapturas } };
})(globalThis);
