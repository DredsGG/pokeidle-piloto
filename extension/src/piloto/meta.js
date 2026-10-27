// Meta (1.23): o que os jogadores estão usando no PvP Ranqueado, conferido com o Poder.
//
// Pedido do André (2026-10-23): a aba Meta da janela Time mostra a melhor comp atual, com os
// sprites, e se atualiza sozinha o tempo todo. Não existe guia de meta do pokeidle.io na internet;
// o meta vem de dentro do jogo, só com leituras que o próprio jogo faz quando você clica:
// - o placar do Ranqueado (pvp.info: os 100 primeiros) e o seu histórico (os seus adversários);
// - o perfil público de cada um (ranking.perfil: a "Equipe de PvP" que aparece no perfil).
// Ritmo (Termos: sem pesar o servidor): o placar no máximo a cada 30 min; UM perfil a cada 2 min,
// em rodízio — os 20 primeiros e os seus últimos adversários ficam atualizados a cada ~1 h.
// Dois recortes: "Topo" (os 20 primeiros) e "Sua faixa" (os seus adversários, do mesmo PR que você).
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:meta:v1';
  const TOPO_N = 20;
  const PERFIL_A_CADA_MS = 2 * 60_000;
  const PLACAR_A_CADA_MS = 30 * 60_000;
  const PERFIL_VALE_MS = 60 * 60_000;
  const PERFIL_ESQUECE_MS = 3 * 24 * 3600_000;
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const curto = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 10000 ? nfc.format(v) : nf.format(v)) : '—');
  const diaDe = (t) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10);

  // perfis: nick -> { nick, em, time: [{ speciesId, nome, level, poder, nota, tipos, shiny, potencia, tm }] }
  const ler = () => { try { const s = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; return { perfis: s.perfis || {}, placar: s.placar || null, faixa: s.faixa || [], dias: s.dias || {} }; } catch { return { perfis: {}, placar: null, faixa: [], dias: {} }; } };
  let s = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento */ } };

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });

  // ---- o que chega do jogo -------------------------------------------------------------------
  PIH.on('pvp', (m) => {
    if (!m) return;
    if (Array.isArray(m.ladder) && m.ladder.length) {
      s.placar = { em: Date.now(), linhas: m.ladder.slice(0, 100).map((l) => ({ nick: String(l.nick || ''), pos: Number(l.posicao || l.pos) || 0, pontos: Number(l.pontos) || 0, tier: String(l.tierId || '') })).filter((l) => l.nick) };
    }
    if (Array.isArray(m.historico)) {
      const vistos = new Set();
      s.faixa = m.historico.map((h) => ({ nick: String(h.oponente || ''), pontos: Number(h.oponentePontos) || 0, em: Date.parse(h.criadoEm) || Date.now() }))
        .filter((h) => h.nick && !vistos.has(h.nick) && vistos.add(h.nick)).slice(0, 20);
    }
    gravar();
  });
  let esperando = null;
  PIH.on('perfil', (m) => {
    const p = m && m.perfil;
    if (!p || typeof p.nick !== 'string') return;
    const time = (Array.isArray(p.pvpTime) ? p.pvpTime : []).slice(0, 5).map((k) => ({
      speciesId: Number(k.speciesId) || null, nome: String(k.nome || ''), level: Number(k.level) || 0, poder: Number(k.poder) || 0,
      nota: Number(k.nota) || 0, tipos: Array.isArray(k.tipos) ? k.tipos.slice(0, 2).map(String) : [], shiny: !!(k.shiny || k.lookShiny), potencia: Number(k.potencia) || 1, tm: k.tmElemental || null,
    })).filter((k) => k.speciesId);
    s.perfis[p.nick] = { nick: p.nick, em: Date.now(), time, nivel: Number(p.level) || 0 };
    if (esperando === p.nick) esperando = null;
    // um retrato por dia, para mostrar o que mudou
    const hoje = diaDe(Date.now());
    s.dias[hoje] = resumoDoDia();
    conferirMudanca();
    for (const d of Object.keys(s.dias).sort().slice(0, -8)) delete s.dias[d];
    gravar();
    pintar && pintar();
  });

  // ---- a fila de leituras ---------------------------------------------------------------------
  function proximoNick() {
    const agora = Date.now();
    for (const [n, p] of Object.entries(s.perfis)) if (agora - p.em > PERFIL_ESQUECE_MS) delete s.perfis[n];
    const meu = eu && eu.nick;
    const alvos = [
      ...((s.placar && s.placar.linhas) || []).slice(0, TOPO_N).map((l) => l.nick),
      ...s.faixa.map((h) => h.nick),
    ].filter((n) => n && n !== meu);
    // o mais velho (ou nunca lido) primeiro
    let melhor = null;
    let idade = -1;
    for (const n of alvos) {
      if (agora - (pedidoEm.get(n) || 0) < 30 * 60_000) continue; // pedido há pouco (sem resposta ainda, ou o nick sumiu)
      const p = s.perfis[n];
      const i = p ? agora - p.em : Infinity;
      if (i > PERFIL_VALE_MS && i > idade) { melhor = n; idade = i; }
    }
    return melhor;
  }
  const st = { ultimoPerfil: 0, ultimoPlacar: 0, motivo: 'esperando o jogo' };
  const pedidoEm = new Map();
  function tique() {
    if (!eu) { st.motivo = 'esperando o jogo'; return; }
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('meta')) { st.motivo = 'Piloto desligado: o meta fica parado'; return; }
    const agora = Date.now();
    const placarVelho = !s.placar || agora - s.placar.em > PLACAR_A_CADA_MS;
    if (placarVelho && agora - st.ultimoPlacar > PLACAR_A_CADA_MS) {
      st.ultimoPlacar = agora;
      const r = PIH.pedir({ t: 'pvp.info' }, 'meta');
      st.motivo = r.ok ? 'lendo o placar do Ranqueado' : `placar: ${r.motivo}`;
      return;
    }
    if (agora - st.ultimoPerfil < PERFIL_A_CADA_MS) return;
    const nick = proximoNick();
    if (!nick) { st.motivo = 'tudo atualizado'; return; }
    st.ultimoPerfil = agora;
    esperando = nick;
    pedidoEm.set(nick, agora);
    const r = PIH.pedir({ t: 'ranking.perfil', nick }, 'meta');
    st.motivo = r.ok ? `lendo o time de ${nick}` : `perfil: ${r.motivo}`;
  }
  setInterval(() => { try { tique(); } catch (e) { console.warn('[piloto] meta:', e); } }, 10_000);

  // ---- a conta --------------------------------------------------------------------------------
  function times(recorte) {
    const agora = Date.now();
    const nicks = recorte === 'topo'
      ? ((s.placar && s.placar.linhas) || []).slice(0, TOPO_N).map((l) => l.nick)
      : s.faixa.map((h) => h.nick);
    return nicks.map((n) => s.perfis[n]).filter((p) => p && p.time.length && agora - p.em < PERFIL_ESQUECE_MS);
  }
  function agregar(recorte) {
    const ts = times(recorte);
    const por = new Map();
    for (const p of ts) {
      const vistos = new Set();
      const ult = Math.max(1, p.time.length - 1);
      p.time.forEach((k, i) => {
        if (vistos.has(k.speciesId)) return;
        vistos.add(k.speciesId);
        const a = por.get(k.speciesId) || { speciesId: k.speciesId, nome: k.nome, tipos: k.tipos, shiny: false, n: 0, poder: 0, nivel: 0, nota: 0, pos: 0, quem: [] };
        // 1.27: a posição na escalação (0 = abre a luta, 1 = fecha) — o pvpTime do perfil vem na ordem
        a.n++; a.poder += k.poder; a.nivel += k.level; a.nota += k.nota; a.pos += i / ult; a.quem.push(p.nick);
        por.set(k.speciesId, a);
      });
    }
    const lista = [...por.values()].map((a) => ({ ...a, uso: ts.length ? a.n / ts.length : 0, poder: a.poder / a.n, nivel: a.nivel / a.n, nota: a.nota / a.n, pos: a.pos / a.n }))
      .sort((x, y) => y.n - x.n || y.poder - x.poder);
    return { n: ts.length, lista, comp: lista.slice(0, 5) };
  }
  // 1.25: aviso curto quando a comp do meta muda (o cartãozinho das ofertas, nunca uma janela).
  // Só com dados suficientes (Topo: 8+ times; Sua faixa: 4+) e no máximo um aviso a cada 2 h por recorte.
  const MIN_TIMES = { topo: 8, faixa: 4 };
  function conferirMudanca() {
    s.compVista = s.compVista || {};
    for (const recorte of ['topo', 'faixa']) {
      const a = agregar(recorte);
      if (a.n < MIN_TIMES[recorte] || a.comp.length < 5) continue;
      const agora = a.comp.map((x) => x.speciesId);
      const antes = s.compVista[recorte];
      if (!antes) { s.compVista[recorte] = { ids: agora, em: Date.now() }; continue; }
      const entrou = a.comp.filter((x) => !antes.ids.includes(x.speciesId));
      if (!entrou.length) continue;
      if (Date.now() - (antes.em || 0) < 2 * 3600_000) continue;
      const nomes = new Map(agregar(recorte).lista.map((x) => [x.speciesId, x.nome]));
      const saiu = antes.ids.filter((id) => !agora.includes(id)).map((id) => nomes.get(id) || `#${id}`);
      s.compVista[recorte] = { ids: agora, em: Date.now() };
      const linha = `entrou ${entrou.map((x) => x.nome).join(', ')}${saiu.length ? ` · saiu ${saiu.join(', ')}` : ''}`;
      PIH.cofre?.diario?.(`meta (${recorte === 'topo' ? 'Topo 20' : 'sua faixa'}): ${linha}`, 'aviso');
      PIH.emit?.('piloto.meta-mudou', { speciesId: entrou[0].speciesId, nome: entrou[0].nome, titulo: 'O meta mudou', linha, recorte: recorte === 'topo' ? 'Topo 20' : 'Sua faixa' });
    }
  }
  function resumoDoDia() {
    const o = {};
    for (const r of ['topo', 'faixa']) o[r] = agregar(r).lista.slice(0, 10).map((a) => a.speciesId);
    return o;
  }
  // "Você tem": o seu melhor da mesma espécie ou da mesma família (Mega X → X e a linhagem dela).
  let familias = null;
  async function carregarFamilias() {
    if (familias || !PIH.carregarJogo) return familias;
    try {
      const j = await PIH.carregarJogo();
      const porNome = new Map();
      const pai = new Map();
      for (const e of j.especies.values()) {
        porNome.set(String(e.name || '').toLowerCase(), e.pokeId);
        // 1.26: mais de um pai para a mesma evolução (Pupitar e Ancient Pupitar → Tyranitar): fica a
        // linhagem normal (id menor), senão a raiz do Tyranitar virava o Ancient Pupitar.
        if (e.evolvesToId && !(pai.has(e.evolvesToId) && pai.get(e.evolvesToId) < e.pokeId)) pai.set(e.evolvesToId, e.pokeId);
      }
      const raizDe = (id) => { let x = id; for (let i = 0; i < 6 && pai.has(x); i++) x = pai.get(x); return x; };
      // 1.31 (o André: "pokémon da Outland não evolui"): as variantes Outland (#2001–#2058) ficam
      // fora da família do meta — não evoluem, então não servem para chegar na espécie do meta.
      const ehOutland = (id) => { try { if (j.mod && j.mod.outland && typeof j.mod.outland.isOutlandPokeId === 'function') return j.mod.outland.isOutlandPokeId(id); } catch { /* fallback */ } return Number(id) >= 2001 && Number(id) < 2100; };
      familias = { porNome, raizDe, especies: j.especies, ehOutland };
    } catch { familias = null; }
    return familias;
  }
  carregarFamilias();
  // A raiz da família de um pokémon (seu ou do meta). 1.26: Mega X conta como da família do X
  // (pelo nome, ou pelo id 3000 + base quando a espécie Mega nem está no catálogo) — antes um Mega
  // Venusaur seu não contava como "já tem" o Venusaur do meta.
  // A espécie "de verdade" (Mega X → X). 1.26.3: base para o "serve para o meta".
  function baseDe(a) {
    const F = familias;
    if (!F || !a) return null;
    let id = Number(a.speciesId);
    const nomeEsp = (F.especies.get(id) || {}).name || '';
    const nome = /^mega /i.test(String(a.nome || '')) ? String(a.nome) : nomeEsp;
    if (!F.especies.has(id) || /^mega /i.test(nome)) {
      const base = String(nome || '').replace(/^mega\s+/i, '').replace(/\s+[xy]$/i, '').toLowerCase();
      id = F.porNome.get(base) ?? (id > 3000 && F.especies.has(id - 3000) ? id - 3000 : id);
    }
    return id;
  }
  // Quantas evoluções de `de` até `para` (0 = a mesma), ou -1 se não chega.
  function passosAte(de, para) {
    const F = familias;
    let x = de;
    for (let i = 0; i < 8 && x != null; i++) { if (x === para) return i; x = (F.especies.get(x) || {}).evolvesToId ?? null; }
    return -1;
  }
  // 1.26.3 (o André pegou um Pupitar e o Piloto não viu que vira o Tyranitar do meta): serve para o
  // meta quem É a espécie do meta (ou o Mega dela) ou EVOLUI até ela — por qualquer linhagem
  // (Pupitar e Ancient Pupitar viram Tyranitar). Antes era pela "raiz", e duas linhagens que
  // chegam no mesmo pokémon tinham raízes diferentes.
  function serve(p, a) {
    if (!familias) return false;
    const bp = baseDe(p);
    const ba = baseDe(a);
    if (bp == null || ba == null) return false;
    if (familias.ehOutland(bp)) return bp === ba; // Outland não evolui: só serve se já for a espécie do meta
    return passosAte(bp, ba) >= 0;
  }
  function membrosDoMeta(a) {
    if (!familias) return [];
    const ba = baseDe(a);
    const out = [];
    for (const e of familias.especies.values()) {
      if (familias.ehOutland(e.pokeId) && e.pokeId !== ba) continue; // 1.31: Outland não evolui
      const n = passosAte(e.pokeId, ba);
      if (n >= 0) out.push({ id: e.pokeId, nome: e.name, estagio: Math.max(0, 2 - n) });
    }
    return out.sort((x, y) => x.estagio - y.estagio);
  }
  function familiaDe(a) {
    const F = familias;
    if (!F || !a) return null;
    let id = Number(a.speciesId);
    const nomeEsp = (F.especies.get(id) || {}).name || '';
    const nome = /^mega /i.test(String(a.nome || '')) ? String(a.nome) : nomeEsp;
    if (!F.especies.has(id) || /^mega /i.test(nome)) {
      const base = String(nome || '').replace(/^mega\s+/i, '').replace(/\s+[xy]$/i, '').toLowerCase();
      id = F.porNome.get(base) ?? (id > 3000 && F.especies.has(id - 3000) ? id - 3000 : id);
    }
    return F.raizDe(id);
  }
  function seuMelhor(a) {
    const meus = ((eu && eu.pokemons) || []).filter((p) => p && !p.ovo);
    const mesmo = meus.filter((p) => p.speciesId === a.speciesId).sort((x, y) => (y.poder || 0) - (x.poder || 0))[0];
    if (mesmo) return { p: mesmo, como: 'mesma' };
    const fam = familiaDe(a);
    if (fam == null || !familias) return null;
    const daFamilia = meus.filter((p) => serve(p, a) || familiaDe(p) === fam).sort((x, y) => (y.poder || 0) - (x.poder || 0))[0];
    return daFamilia ? { p: daFamilia, como: 'familia' } : null;
  }
  function mudou(recorte, speciesId, pos) {
    const dias = Object.keys(s.dias).sort();
    const ontem = dias.filter((d) => d < diaDe(Date.now())).pop();
    if (!ontem) return '';
    const antes = (s.dias[ontem][recorte] || []).indexOf(speciesId);
    if (antes < 0) return '<i class="plt-meta-novo" title="Não estava no meta ontem">novo</i>';
    if (antes > pos) return `<i class="plt-meta-sobe" title="Subiu desde ontem">▲${antes - pos}</i>`;
    if (antes < pos) return `<i class="plt-meta-desce" title="Caiu desde ontem">▼${pos - antes}</i>`;
    return '';
  }

  // ---- a aba ----------------------------------------------------------------------------------
  let pintar = null;
  const ui = { recorte: 'topo' };
  function html({ arte, modo }) {
    const a = agregar(ui.recorte);
    const placarEm = s.placar ? s.placar.em : 0;
    const lidos = times(ui.recorte).length;
    const alvo = ui.recorte === 'topo' ? Math.min(TOPO_N, ((s.placar && s.placar.linhas) || []).length) : s.faixa.length;
    const ultimo = Object.values(s.perfis).reduce((m, p) => Math.max(m, p.em), 0);
    const quando = (t) => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
    const topo = K.linha({ id: 'meta', icone: 'radar', nome: 'Meta do PvP Ranqueado',
      status: `${lidos}/${alvo || '?'} times lidos · último às ${quando(ultimo)} · ${esc(st.motivo)}`,
      dica: 'O que os jogadores usam de verdade: o time de PvP do perfil público dos 20 primeiros do Ranqueado (Topo) e dos seus últimos adversários (Sua faixa). Um perfil a cada 2 min, em rodízio, e o placar a cada 30 min — leve para o servidor e sempre andando. A comp é a dos 5 pokémon mais usados no recorte; ▲▼ mostra o que mudou desde ontem.',
      direita: K.escala('meta:recorte', ui.recorte, [['topo', 'Topo 20'], ['faixa', 'Sua faixa']], false) });
    if (!a.n) return `${topo}<div class="pih-carga">${ui.recorte === 'faixa' && !s.faixa.length ? 'Jogue uma partida do Ranqueado (ou espere o placar) para o Piloto conhecer os seus adversários.' : 'Lendo os primeiros times… (um a cada 2 min)'}</div>`;
    const cartao = (x, i, grande) => {
      const meu = seuMelhor(x);
      // 1.26.3 (pedido do André): além do "você tem", se ele já está no time (campo e PvP) ou ainda fora
      const noTime = meu && meu.p.slot != null;
      const tem = meu ? `<span class="plt-meta-chips"><span class="plt-meta-tem${meu.como === 'mesma' ? ' on' : ''}" title="${meu.como === 'mesma' ? 'Você tem esta espécie' : 'Você tem um da mesma família (ou que evolui até ele)'}">você: ${esc(meu.p.nome)} Nv ${nf.format(meu.p.level || 0)} · ⚔ ${curto(meu.p.poder || 0)}</span><span class="plt-meta-tem plt-meta-${noTime ? 'notime on' : 'fora'}" title="${noTime ? 'Já está no time (campo e PvP)' : 'Você tem, mas ainda não está no time — o montar sozinho troca'}">${noTime ? 'no time ✓' : 'fora do time'}</span></span>` : '<span class="plt-meta-tem plt-meta-falta">você não tem</span>';
      return `<div class="cfg-linha plt-pk plt-meta-pk${grande ? ' plt-meta-comp' : ''}">
        <span class="plt-pk-arte">${arte({ speciesId: x.speciesId, shiny: false, nome: x.nome }, grande ? 64 : 40, `meta:${ui.recorte}:${x.speciesId}`)}</span>
        <span class="plt-pk-info"><span class="plt-pk-nome"><b>${esc(x.nome)}</b>${mudou(ui.recorte, x.speciesId, i)}</span>
          <span class="plt-pk-tipos">${(x.tipos || []).map((t) => `<img class="plt-pk-tipo" src="/img/tipos/${esc(String(t).toLowerCase())}.svg" alt="${esc(t)}" title="${esc(t)}" width="16" height="16">`).join('')}</span>
          <span class="plt-pk-nums"><span title="Em quantos times do recorte">uso <b>${Math.round(x.uso * 100)}%</b></span><span title="Poder médio de quem usa">⚔ <b>${curto(x.poder)}</b></span><span title="Nível médio">Nv <b>${curto(x.nivel)}</b></span><span title="Nota média">nota <b>${x.nota.toFixed(2).replace('.', ',')}</b></span></span>
          ${tem}</span>
      </div>`;
    };
    const resto = a.lista.slice(5, 15);
    return `${topo}${K.grupo(`A comp do meta · ${ui.recorte === 'topo' ? 'Topo 20' : 'sua faixa'} · ${a.n} times`)}${a.comp.map((x, i) => cartao(x, i, true)).join('')}${resto.length ? `${K.grupo('Também muito usados')}${resto.map((x, i) => cartao(x, i + 5, false)).join('')}` : ''}<div class="plt-meta-pe">Placar lido às ${quando(placarEm)}. O "Montar o time principal sozinho" (aba Time) põe no time os do meta que você tem.</div>`;
  }
  function definir(caminho, v) { if (caminho === 'recorte' && (v === 'topo' || v === 'faixa')) ui.recorte = v; }
  // Para o "Caçar o meta" (1.24): a família de cada espécie (a raiz da linhagem e os membros, na
  // ordem da evolução).
  const familia = {
    pronta: async () => !!(await carregarFamilias()),
    raizDe: (id) => (familias ? familias.raizDe(id) : null),
    raizDoMeta: (a) => familiaDe(a),
    raizDePk: (p) => familiaDe(p),
    serve: (p, a) => serve(p, a),
    membrosDoMeta: (a) => membrosDoMeta(a),
    ehOutland: (id) => (familias ? familias.ehOutland(id) : Number(id) >= 2001 && Number(id) < 2100),
    membros(raizId) {
      if (!familias) return [];
      const out = [];
      const seguir = (id, d) => { const e = familias.especies.get(id); if (!e || out.some((o) => o.id === id)) return; out.push({ id, nome: e.name, estagio: d }); if (e.evolvesToId) seguir(e.evolvesToId, d + 1); };
      seguir(raizId, 0);
      // ramificações (Eevee e cia.): quem tem a mesma raiz e ainda não entrou
      for (const e of familias.especies.values()) if (!out.some((o) => o.id === e.pokeId) && familias.raizDe(e.pokeId) === raizId) out.push({ id: e.pokeId, nome: e.name, estagio: 1 });
      return out;
    },
  };
  // 1.27 (pedido do André): a ordem da escalação do PvP (quem abre e quem fecha a luta) copiada de
  // quem joga no topo: cada pokémon seu que serve para uma espécie do meta vai na posição média em
  // que os jogadores do recorte usam aquela espécie; quem não é do meta fica no meio. Desempate e
  // falta de dados (menos de 5 times lidos): o mais forte abrindo, como antes.
  const ORDEM_DO_META_DESLIGADA = true;
  function ordemPvp(pks, recorte) {
    const lista = (pks || []).slice();
    const porPoder = (a, b) => (Number(b.poder) || 0) - (Number(a.poder) || 0);
    // 1.28.1: DESLIGADO. O jogo esconde a ordem de entrada da equipe de PvP no perfil dos outros
    // ("ordem de entrada oculta"): a lista que chega não é a ordem da luta, então copiar a posição
    // não tem base. Fica o mais forte abrindo.
    if (ORDEM_DO_META_DESLIGADA) return { ordem: lista.sort(porPoder), comMeta: false };
    const ag = agregar(recorte === 'faixa' ? 'faixa' : 'topo');
    if (!familias || ag.n < 5) return { ordem: lista.sort(porPoder), comMeta: false };
    const posDe = (p) => {
      let melhor = null;
      for (const a of ag.lista) if (serve(p, a) && (melhor === null || a.uso > melhor.uso)) melhor = a;
      return melhor ? melhor.pos : null;
    };
    const pos = new Map(lista.map((p) => [p.id, posDe(p)]));
    const comMeta = [...pos.values()].some((v) => v != null);
    lista.sort((a, b) => ((pos.get(a.id) ?? 0.5) - (pos.get(b.id) ?? 0.5)) || porPoder(a, b));
    return { ordem: lista, comMeta };
  }
  PIH.meta = { html, definir, agregar, familia, ordemPvp, ligarPintura: (fn) => { pintar = fn; }, _interno: { tique, estado: () => s, st, proximoNick } };
})(globalThis);
