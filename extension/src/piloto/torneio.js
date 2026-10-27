// Torneios (1.32, pedido do André): inscreve a conta sozinho em todos os torneios do jogo assim que
// as inscrições abrem — o Mundial e o Amador (todo mês) e o Showdown (toda quarta).
//
// - O calendário e a regra de inscrição vêm dos MESMOS módulos que o servidor usa
//   (shared/campeonato.mjs e shared/showdown.mjs): edição aberta = agora entre inscricoesDe e
//   inscricoesAte, e o nível mínimo de cada uma.
// - Para cada edição aberta: pede a ficha (campeonato.info / showdown.info); se a ficha diz que
//   você não está inscrito, manda a inscrição (campeonato.inscrever / showdown.inscrever).
// - Inscrição é de graça. Nunca cancela inscrição e não mexe em equipe: o Mundial e o Amador usam a
//   equipe do PvP Ranqueado (a mesma do time principal).
// - Vigia contínua: confere a cada 10 min (e logo depois de entrar no jogo). Recusa por nível espera
//   o nível subir; outra recusa tenta de novo em 1 h.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:torneio:v1';
  const CONFERIR_MS = 10 * 60_000;
  const ESPERA_RECUSA_MS = 60 * 60_000;
  const ler = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      return { ligado: c.ligado === true, inscritos: c.inscritos && typeof c.inscritos === 'object' ? c.inscritos : {}, recusas: c.recusas && typeof c.recusas === 'object' ? c.recusas : {} };
    } catch { return { ligado: false, inscritos: {}, recusas: {} }; }
  };
  const cfg = ler();
  const gravar = () => {
    // guarda só as edições recentes (60 dias)
    const corte = Date.now() - 60 * 86400_000;
    for (const k of Object.keys(cfg.inscritos)) if ((cfg.inscritos[k].em || 0) < corte) delete cfg.inscritos[k];
    for (const k of Object.keys(cfg.recusas)) if ((cfg.recusas[k].em || 0) < corte) delete cfg.recusas[k];
    try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ }
  };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`torneio: ${txt}`, tipo);

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });
  let mods = null;
  async function modulos() {
    if (mods) return mods;
    const imp = (p) => import(`${location.origin}/shared/${p}.mjs`).catch(() => null);
    const [camp, sd] = await Promise.all([imp('campeonato'), imp('showdown')]);
    mods = { camp, sd };
    return mods;
  }
  const NOME = { mundial: 'Mundial', amador: 'Amador', showdown: 'Showdown' };
  const nomeDe = (ed) => `${NOME[ed.tipo] || ed.tipo} ${ed.id}`;

  // As edições com inscrição aberta agora: [{ tipo, id, nivelMin, ate, canal }]
  async function abertas(agora = Date.now()) {
    const m = await modulos();
    const out = [];
    try {
      if (m.camp && typeof m.camp.listaDeCampeonatos === 'function') {
        for (const c of m.camp.listaDeCampeonatos(agora, { passados: 1, futuros: 1 }) || []) {
          if (!c || !c.id || !(agora >= c.inscricoesDe && agora < c.inscricoesAte)) continue;
          out.push({ tipo: c.tipo || 'campeonato', id: String(c.id), nivelMin: Number(c.nivelMin) || 0, ate: c.inscricoesAte, canal: 'campeonato' });
        }
      }
    } catch { /* módulo mudou: a saúde avisa */ }
    try {
      if (m.sd && typeof m.sd.showdownAberto === 'function') {
        const s = m.sd.showdownAberto(agora);
        if (s && s.id && agora >= (s.inscricoesDe ?? 0) && agora < s.inscricoesAte) {
          out.push({ tipo: 'showdown', id: String(s.id), nivelMin: Number(s.nivelMin ?? m.sd.SHOWDOWN_NIVEL_MIN) || 0, ate: s.inscricoesAte, canal: 'showdown' });
        }
      }
    } catch { /* idem */ }
    return out;
  }

  // ---- a ficha que o servidor devolve -----------------------------------------------------------
  const esperando = new Map(); // id → { ed, fase: 'info'|'inscrever', em }
  function aoReceber(canal, m) {
    if (!m || typeof m !== 'object') return;
    const id = m.campeonato && m.campeonato.id ? String(m.campeonato.id) : (m.showdown && m.showdown.id ? String(m.showdown.id) : null);
    // a recusa não diz o id: vale para o último pedido deste canal
    const alvo = id ? esperando.get(id) : [...esperando.values()].filter((x) => x.ed.canal === canal).sort((a, b) => b.em - a.em)[0];
    if (!alvo) return;
    const ed = alvo.ed;
    if (m.recusa) {
      esperando.delete(ed.id);
      if (m.recusa === 'jaInscrito' || /inscrito/i.test(String(m.recusa))) { marcarInscrito(ed); return; }
      cfg.recusas[ed.id] = { em: Date.now(), motivo: String(m.recusa).slice(0, 40), nivel: Number(eu && eu.level) || 0 };
      gravar();
      diario(`${nomeDe(ed)}: o jogo recusou a inscrição (${String(m.recusa).slice(0, 40)})`, 'aviso');
      return;
    }
    const inscrito = !!(m.eu && m.eu.inscrito);
    if (inscrito || m.acao === 'inscreveu') {
      esperando.delete(ed.id);
      marcarInscrito(ed, m.acao === 'inscreveu', m.eu && m.eu.seed);
      return;
    }
    if (alvo.fase === 'info') {
      alvo.fase = 'inscrever';
      alvo.em = Date.now();
      const r = PIH.pedir({ t: `${ed.canal}.inscrever`, id: ed.id }, 'torneio');
      if (r && r.ok === false) esperando.delete(ed.id);
      else diario(`${nomeDe(ed)}: inscrições abertas — inscrevendo`);
    }
  }
  function marcarInscrito(ed, agora, seed) {
    cfg.inscritos[ed.id] = { em: Date.now(), tipo: ed.tipo };
    delete cfg.recusas[ed.id];
    gravar();
    if (agora) {
      diario(`${nomeDe(ed)}: inscrito${seed != null ? ` (seed ${seed})` : ''}`, 'ok');
      PIH.emit?.('piloto.torneio', { tipo: ed.tipo, id: ed.id });
    }
  }
  PIH.on('campeonato', (m) => aoReceber('campeonato', m));
  PIH.on('showdown', (m) => aoReceber('showdown', m));

  // ---- a vigia ---------------------------------------------------------------------------------
  let ultima = 0;
  let andando = false;
  async function conferir(forcar = false) {
    if (!cfg.ligado || andando || !eu) return;
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('torneio')) return;
    if (!forcar && Date.now() - ultima < CONFERIR_MS) return;
    andando = true;
    ultima = Date.now();
    try {
      const agora = Date.now();
      for (const ed of await abertas(agora)) {
        if (cfg.inscritos[ed.id]) continue;
        if ((Number(eu.level) || 0) < ed.nivelMin) continue;
        const rec = cfg.recusas[ed.id];
        if (rec && agora - rec.em < ESPERA_RECUSA_MS) continue;
        if (rec && rec.motivo === 'nivel' && (Number(eu.level) || 0) <= rec.nivel) continue;
        const ja = esperando.get(ed.id);
        if (ja && agora - ja.em < 60_000) continue;
        esperando.set(ed.id, { ed, fase: 'info', em: agora });
        PIH.pedir({ t: `${ed.canal}.info`, id: ed.id }, 'torneio');
      }
    } catch (e) { diario(`erro: ${e && e.message}`, 'erro'); }
    finally { andando = false; }
  }
  setInterval(() => { conferir().catch(() => {}); }, 30_000);
  PIH.on('estado', () => { if (!ultima) setTimeout(() => conferir().catch(() => {}), 15_000); });

  // ---- a linha na aba Rotina --------------------------------------------------------------------
  let resumoAbertas = [];
  setInterval(() => { abertas().then((l) => { resumoAbertas = l; }).catch(() => {}); }, 60_000);
  setTimeout(() => { abertas().then((l) => { resumoAbertas = l; }).catch(() => {}); }, 5000);
  function status() {
    const nivel = Number(eu && eu.level) || 0;
    const partes = [];
    for (const ed of resumoAbertas) {
      if (cfg.inscritos[ed.id]) partes.push(`${NOME[ed.tipo] || ed.tipo}: inscrito ✓`);
      else if (nivel < ed.nivelMin) partes.push(`${NOME[ed.tipo] || ed.tipo}: nível ${ed.nivelMin}`);
      else partes.push(`${NOME[ed.tipo] || ed.tipo}: inscrição aberta`);
    }
    return partes.length ? partes.join(' · ') : 'nenhuma inscrição aberta agora';
  }
  function linha(modo) {
    return `${K.grupo('Torneios')}${K.linha({ id: 'torneio', icone: 'pvp', nome: 'Inscrever nos torneios', alvo: 'torneio:ligado', on: cfg.ligado, trava: modo === 'desligado', status: esc(cfg.ligado ? status() : ''),
      dica: 'Inscreve você sozinho em todos os torneios do jogo assim que as inscrições abrem: o Mundial (lutas no último dia do mês, treinador Nv 300+), o Amador (lutas no dia 15, Nv 100+; sem shiny, P5 nem lendário na equipe) e o Showdown (toda quarta). A inscrição é de graça. Confere a cada 10 min; nunca cancela e não mexe na equipe — o Mundial e o Amador usam a equipe do PvP Ranqueado.',
      ajustes: modo === 'manual' ? K.acao('Conferir agora', 'data-acao="torneio-conferir"', 'pvp', modo === 'desligado') : '' })}`;
  }
  function definir(caminho, v) {
    if (caminho !== 'ligado') return;
    cfg.ligado = !!v;
    gravar();
    diario(`inscrição automática ${v ? 'ligada' : 'desligada'}`);
    if (v) { ultima = 0; setTimeout(() => conferir(true).catch(() => {}), 500); }
  }
  // Perfil do Auto: liga
  function aplicar(m) { if (m && typeof m.ligado === 'boolean') { cfg.ligado = m.ligado; gravar(); if (m.ligado) ultima = 0; } }

  PIH.torneio = { linha, definir, aplicar, conferir: () => conferir(true), abertas, _interno: { cfg: () => cfg, esperando } };
})(globalThis);
