// Guarda (1.21): a lista dos pokémon que o anúncio automático do Radar NUNCA pode vender.
//
// Pedido do André (2026-10-23): o pokémon que não serve para ele é anunciado sozinho; shiny e
// lendário ficam sempre com ele. O Radar (outro mundo da extensão) não sabe quem está no time nem
// quem a janela Time quer treinar — este módulo sabe, e publica a cada 15 s:
//   'piloto:pk-guardados' { pronto, ids, motivo }
// Sem "pronto" (análise da janela Time ainda não rodou, módulo do jogo não carregou), o Radar
// não anuncia nada.
//
// Ficam guardados:
// - o ativo e os 5 do time de campo; quem está num posto do XP Share; quem segura item;
// - o time do PvP (o de agora e o que a rotina quer montar) e os travados da janela Time;
// - quem a janela Time acabou de tirar do campo (3 min) e, na última análise dela, os 8 melhores
//   para farm, os 8 melhores para PvP e os 8 que valem treinar;
// - todo shiny e todo lendário/mítico (shared/mistico.mjs do jogo) — esses só você decide.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on) return;

  const INTERVALO_MS = 15_000;
  const ANALISE_VALE_MS = 30 * 60_000;

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });

  let mistico = null;
  let misticoFalhou = 0;
  async function carregarMistico() {
    if (mistico || Date.now() - misticoFalhou < 60_000) return mistico;
    try { mistico = await import(`${location.origin}/shared/mistico.mjs`); if (typeof mistico.ehLendarioOuMitico !== 'function') { mistico = null; misticoFalhou = Date.now(); } }
    catch { misticoFalhou = Date.now(); }
    return mistico;
  }

  let ultimo = { pronto: false, ids: [], motivo: 'esperando o jogo', em: 0 };
  let pedindoAnalise = 0;

  async function montar() {
    if (!eu || !Array.isArray(eu.pokemons)) return { pronto: false, ids: [], motivo: 'esperando o jogo' };
    const M = await carregarMistico();
    if (!M) return { pronto: false, ids: [], motivo: 'o módulo de lendários do jogo não carregou' };
    const ids = new Set();
    const por = {};
    const add = (id, motivo) => { const n = Number(id); if (!Number.isInteger(n)) return; if (!ids.has(n)) por[motivo] = (por[motivo] || 0) + 1; ids.add(n); };

    if (eu.activeId != null) add(eu.activeId, 'ativo');
    for (const p of eu.pokemons) {
      if (!p) continue;
      if (p.slot != null) add(p.id, 'time de campo');
      if (p.shiny) add(p.id, 'shiny');
      if (Number(p.heldItemId) > 0) add(p.id, 'segura item');
      let lend = false;
      try { lend = !!M.ehLendarioOuMitico(p.speciesId); } catch { lend = false; }
      if (lend) add(p.id, 'lendário/mítico');
    }
    for (const c of (eu.casa && eu.casa.lista) || []) for (const id of c.postos || []) if (id) add(id, 'XP Share');

    const R = PIH.rotina;
    try { for (const id of (R && R.pvpTime && R.pvpTime()) || []) add(id, 'time do PvP'); } catch { /* sem PvP */ }
    try { for (const id of (R && R.equipePvpAlvo && R.equipePvpAlvo()) || []) add(id, 'time do PvP'); } catch { /* sem PvP */ }

    const T = PIH.time;
    if (!T) return { pronto: false, ids: [], motivo: 'a janela Time não carregou' };
    for (const lista of ['campo', 'pvp']) for (const id of T.travados(lista)) add(id, 'travado na janela Time');
    for (const id of T.protegidos()) add(id, 'saiu do campo agora');
    for (const id of (PIH.metaCaca ? PIH.metaCaca.protegidos() : [])) add(id, 'do meta');
    for (const id of (PIH.cacadas ? PIH.cacadas.protegidos() : [])) add(id, 'promessa do Melhorar o time');
    for (const id of (PIH.farm ? PIH.farm.protegidos() : [])) add(id, 'farmador do Modo farm');
    const a = T._interno && T._interno.st && T._interno.st.analise;
    const fresca = a && a.em && Date.now() - a.em < ANALISE_VALE_MS;
    if (!fresca) {
      if (Date.now() - pedindoAnalise > 60_000) { pedindoAnalise = Date.now(); try { T.analisar(); } catch { /* tenta de novo depois */ } }
      return { pronto: false, ids: [], motivo: 'esperando a análise da janela Time' };
    }
    if (a.semNota) return { pronto: false, ids: [], motivo: 'a análise saiu sem a nota do jogo' };
    for (const l of a.farmTop || []) add(l.p.id, 'melhor para farm');
    for (const l of a.pvpTop || []) add(l.p.id, 'melhor para PvP');
    for (const l of a.treinar || []) add(l.p.id, 'vale treinar');
    return { pronto: true, ids: [...ids], por, motivo: '' };
  }

  async function publicar() {
    try {
      const r = await montar();
      ultimo = { ...r, em: Date.now() };
      document.dispatchEvent(new CustomEvent('piloto:pk-guardados', { detail: JSON.stringify({ pronto: r.pronto, ids: r.ids, motivo: r.motivo }) }));
    } catch (e) { console.warn('[piloto] guarda:', e); }
  }
  setInterval(publicar, INTERVALO_MS);
  setTimeout(publicar, 5000);

  PIH.guarda = { resumo: () => ({ ...ultimo, ids: ultimo.ids.slice() }), publicar };
})(globalThis);
