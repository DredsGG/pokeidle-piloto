// Rank do PvP dos amigos (1.49.1, pedido do André em 30/10): na janela Amigos do jogo, ao lado de
// cada amigo, o selo do rank do Ranqueado — o emblema do tier, o tier com a divisão e os pontos (PR)
// e, se ele estiver entre os 100 primeiros, a posição (#N).
//
// De onde vem (app.js do jogo, lido em 30/10): a lista de amigos não traz nada de PvP; o perfil
// público traz (`ranking.perfil {nick}` → `perfil.pvpRank { pontos, tierId, partidas, vitorias, derrotas }`;
// null ou menos de 5 partidas = "posicionando"). É o mesmo pedido da aba Meta (só leitura; o gancho já
// esconde a janela de perfil que o jogo abriria). Tier, divisão e emblema pelo módulo do próprio jogo
// (`shared/pvp-rank.mjs`: rankDePontos, iconeDoRank). A posição vem do placar dos 100 primeiros que a
// aba Meta já guarda.
//
// Ritmo (1.49.1, o André: "a ideia é clicar e já aparecer"): o rank fica guardado e aparece na hora
// em que a janela abre. Com o Piloto ligado, em segundo plano, ele lê a lista de amigos (`amigos.info`,
// o mesmo pedido do jogo ao abrir a janela) a cada 30 min e atualiza devagar quem está velho (1 perfil a
// cada 8 s). Com a janela aberta, quem ainda não tem rank sai rápido (1 por segundo) e quem está velho,
// 1 a cada 4 s. O freio do "Devagar aí" do gancho continua valendo. Nada é gasto e nada muda no jogo.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir) return;

  const CHAVE = 'piloto:amigosRank:v1';
  const VALE_MS = 30 * 60_000;
  const RAPIDO_MS = 1_100; // janela aberta, amigo sem rank nenhum
  const ABERTA_MS = 4_000; // janela aberta, rank velho (já aparece o guardado)
  const FUNDO_MS = 8_000; // janela fechada, em segundo plano
  const LISTA_A_CADA_MS = 30 * 60_000;
  const SEM_RESPOSTA_MS = 10 * 60_000;
  const MAX_GUARDADOS = 400;
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;
  const TIERS = {
    bronze: ['Bronze', 'Bronze', 'Bronce'], prata: ['Prata', 'Silver', 'Plata'], ouro: ['Ouro', 'Gold', 'Oro'], platina: ['Platina', 'Platinum', 'Platino'],
    diamante: ['Diamante', 'Diamond', 'Diamante'], mestre: ['Mestre', 'Master', 'Maestro'], challenger: ['Challenger', 'Challenger', 'Challenger'],
  };
  const nomeTier = (id) => { const n = TIERS[id]; return n ? n[{ pt: 0, en: 1, es: 2 }[L()]] : String(id || ''); };
  const nf = () => new Intl.NumberFormat({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[L()]);
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---- o que já se sabe de cada amigo -------------------------------------------------------------
  const ler = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return c && typeof c === 'object' ? c : {}; } catch { return {}; } };
  let guardados = ler(); // nick minúsculo -> { pontos, tierId, partidas, v, d, em } | { semRank: true, em }
  const gravar = () => {
    try {
      const ks = Object.keys(guardados);
      if (ks.length > MAX_GUARDADOS) for (const k of ks.sort((a, b) => (guardados[a].em || 0) - (guardados[b].em || 0)).slice(0, ks.length - MAX_GUARDADOS)) delete guardados[k];
      localStorage.setItem(CHAVE, JSON.stringify(guardados));
    } catch { /* sem armazenamento */ }
  };
  const pedidos = new Map(); // nick minúsculo -> quando pediu (sem resposta, espera 10 min)
  PIH.on('perfil', (m) => {
    const p = m && m.perfil;
    if (!p || typeof p.nick !== 'string') return;
    const k = p.nick.toLowerCase();
    if (!pedidos.has(k) && !guardados[k]) return; // perfil que não é de amigo que pedimos (a aba Meta, o seu clique)
    const r = p.pvpRank;
    guardados[k] = r && typeof r === 'object'
      ? { pontos: Number(r.pontos) || 0, tierId: String(r.tierId || ''), partidas: Number(r.partidas) || 0, v: Number(r.vitorias) || 0, d: Number(r.derrotas) || 0, em: Date.now() }
      : { semRank: true, em: Date.now() };
    pedidos.delete(k);
    gravar();
    pintar();
  });

  // ---- o módulo de rank do jogo (tier, divisão e emblema) -----------------------------------------
  let R = null;
  let tentouR = false;
  async function moduloRank() {
    if (R || tentouR) return R;
    tentouR = true;
    try { R = await import(`${location.origin}/shared/pvp-rank.mjs`); } catch { R = null; }
    return R;
  }
  const posicionando = (g) => !g || g.semRank || g.partidas < ((R && Number(R.PVP_PARTIDAS_POSICIONAMENTO)) || 5);
  // a posição na tabela dos 100 primeiros (o placar que a aba Meta guarda)
  function posicaoDe(k) {
    try {
      const m = JSON.parse(localStorage.getItem('piloto:meta:v1') || 'null');
      const l = m && m.placar && Array.isArray(m.placar.linhas) ? m.placar.linhas.find((x) => String(x.nick).toLowerCase() === k) : null;
      return l && l.pos ? l.pos : null;
    } catch { return null; }
  }
  function selo(k) {
    const g = guardados[k];
    if (!g) return `<span class="plt-ar plt-ar-carregando" title="${esc(t3('Lendo o rank do PvP…', 'Reading the PvP rank…', 'Leyendo el rango de PvP…'))}">…</span>`;
    if (posicionando(g)) return `<span class="plt-ar plt-ar-sem" title="${esc(t3('Ainda não tem rank no PvP Ranqueado', 'No PvP Ranked rank yet', 'Aún sin rango en el PvP Clasificatorio'))}">${esc(t3('sem rank', 'unranked', 'sin rango'))}</span>`;
    let div = '';
    try { if (R && R.rankDePontos) { const x = R.rankDePontos(g.pontos); if (x && x.tierId === g.tierId && x.divisaoNum) div = ` ${x.divisaoNum}`; } } catch { /* sem divisão */ }
    let icone = '';
    try { icone = R && R.iconeDoRank ? R.iconeDoRank(g.tierId) : ''; } catch { icone = ''; }
    const pos = posicaoDe(k);
    const rotulo = `${nomeTier(g.tierId)}${div}`;
    const vd = g.v || g.d ? ` · ${g.v}V ${g.d}D` : '';
    return `<span class="plt-ar" data-tier="${esc(g.tierId)}" title="${esc(`${t3('PvP Ranqueado', 'PvP Ranked', 'PvP Clasificatorio')}: ${rotulo} · ${nf().format(g.pontos)} PR${pos ? ` · #${pos}` : ''}${vd}`)}">${icone && /^\/[\w/.-]+$/.test(icone) ? `<img src="${esc(icone)}" alt="" loading="lazy">` : ''}<span class="plt-ar-txt"><b>${esc(rotulo)}</b><small>${nf().format(g.pontos)} PR${pos ? ` · #${pos}` : ''}</small></span></span>`;
  }

  // ---- a janela Amigos do jogo --------------------------------------------------------------------
  // As linhas são `.amigo-linha[data-id]` dentro de `#amigos-rol` (o nick em `.amigo-meta b`); o jogo
  // redesenha a lista inteira a cada mudança, então o selo é posto de novo a cada redesenho.
  const linhas = () => [...document.querySelectorAll('#amigos-rol .amigo-linha[data-id]')].filter((el) => !el.classList.contains('guild'));
  const nickDe = (el) => String((el.querySelector('.amigo-meta b') || {}).textContent || '').trim();
  let pintando = false;
  function pintar() {
    if (pintando) return;
    pintando = true;
    try {
      for (const el of linhas()) {
        const nick = nickDe(el);
        if (!nick) continue;
        const k = nick.toLowerCase();
        const html = selo(k);
        let s = el.querySelector(':scope > .plt-ar-caixa');
        if (!s) { s = document.createElement('span'); s.className = 'plt-ar-caixa'; s.dataset.piloto = '1'; s.dataset.semTraducao = '1'; const badge = el.querySelector(':scope > .amigo-badge'); el.insertBefore(s, badge || null); }
        if (s.dataset.h !== html) { s.innerHTML = html; s.dataset.h = html; const img = s.querySelector('img'); if (img) img.addEventListener('error', () => img.remove(), { once: true }); }
      }
    } finally { pintando = false; }
  }
  // a lista de amigos que o jogo mandou (na ordem dele), para atualizar com a janela fechada
  let nicksDaLista = [];
  let listaEm = 0;
  PIH.on('amigos', (m) => {
    if (!m || !Array.isArray(m.lista)) return;
    nicksDaLista = m.lista.map((a) => String((a && a.nick) || '')).filter((n) => /^[\p{L}\p{N}_.\-]{1,30}$/u.test(n)).slice(0, 300);
    listaEm = Date.now();
  });
  // o próximo a ler: { nick, novo } — primeiro quem não tem rank nenhum, depois quem está velho
  function proximo(nicks) {
    const agora = Date.now();
    let velho = null;
    for (const nick of nicks) {
      const k = nick.toLowerCase();
      if (!k || !/^[\p{L}\p{N}_.\-]{1,30}$/u.test(k)) continue;
      const p = pedidos.get(k);
      if (p && agora - p < SEM_RESPOSTA_MS) continue;
      const g = guardados[k];
      if (!g) return { nick, novo: true };
      if (!velho && agora - g.em >= VALE_MS) velho = { nick, novo: false };
    }
    return velho;
  }
  let ultimoPedido = 0;
  let listaPedidaEm = 0;
  let inicio = Date.now();
  async function tique() {
    const rol = document.getElementById('amigos-rol');
    observar(rol && rol.isConnected ? rol : null);
    const aberta = !!(rol && rol.isConnected && rol.offsetParent !== null);
    if (aberta) { await moduloRank(); pintar(); }
    if (!PIH.cofre || !PIH.cofre.ligado || !PIH.cofre.ligado()) return; // Piloto em Off: só o que já sabe
    if (!/^\/app\/?$/.test(location.pathname)) return;
    const agora = Date.now();
    // em segundo plano: a lista de amigos a cada 30 min (a primeira, 45 s depois de abrir o jogo)
    if (!aberta && agora - inicio > 45_000 && agora - Math.max(listaEm, listaPedidaEm) > LISTA_A_CADA_MS) {
      listaPedidaEm = agora;
      PIH.pedir({ t: 'amigos.info' }, 'amigos');
      return;
    }
    const prox = proximo(aberta ? linhas().map(nickDe) : nicksDaLista);
    if (!prox) return;
    const espera = aberta ? (prox.novo ? RAPIDO_MS : ABERTA_MS) : FUNDO_MS;
    if (agora - ultimoPedido < espera) return;
    ultimoPedido = agora;
    const r = PIH.pedir({ t: 'ranking.perfil', nick: prox.nick }, aberta ? 'amigos-ja' : 'amigos');
    if (r.ok) pedidos.set(prox.nick.toLowerCase(), agora);
  }
  setInterval(() => { tique().catch(() => {}); }, 500);
  // o jogo redesenhou a lista: o selo volta na hora (sem esperar o relógio). Só a lista é observada.
  let observado = null;
  const obs = new MutationObserver(() => { if (!pintando) pintar(); });
  function observar(rol) { if (rol === observado) return; obs.disconnect(); observado = rol; if (rol) obs.observe(rol, { childList: true }); }
  document.addEventListener('piloto:idioma', () => { for (const s of document.querySelectorAll('.plt-ar-caixa')) s.dataset.h = ''; pintar(); });

  PIH.amigosRank = { pintar, _interno: { guardados: () => guardados, pedidos, tique, moduloRank, selo, lista: () => nicksDaLista.slice(), comecarJa: () => { inicio = 0; listaEm = 0; listaPedidaEm = 0; } } };
})(globalThis);
