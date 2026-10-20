// Pokébola automática (1.14) para quem está SEM VIP. É o mesmo que você faria clicando na lista
// "Proximidade para Capturar" do jogo: uma bola por corpo caído (`ball.throw {ballId, slot}`).
//
// Regras (para ficar dentro do que o VIP faz e nunca além):
// - nunca mais rápido que o lançamento automático do VIP: 1 bola a cada 1,3 s ou mais (o gancho
//   ainda recusa qualquer coisa abaixo de 1,2 s);
// - só bola paga em OURO: Beast Ball (diamante) nunca;
// - só em corpo que ainda está no chão (o gancho confere de novo);
// - com VIP ativo fica BLOQUEADA (em qualquer modo): o lançamento é o do próprio jogo;
// - guarda as bolas que você mandar (o resto é com a Reposição).
// Sem VIP, já vem LIGADA (pedido do André, ciente de que os Termos tratam o lançamento automático
// como benefício do VIP — ver decisões); quem não quiser desliga.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;

  const CHAVE = 'piloto:captura:v1';
  const PADRAO = Object.freeze({ ligado: true, modo: 'todos', guardar: 0 });
  const MIN_MS = 1300;
  const lerCfg = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {};
      return {
        ligado: c.ligado !== false,
        modo: c.modo === 'shiny' ? 'shiny' : 'todos',
        guardar: Number.isInteger(c.guardar) && c.guardar >= 0 && c.guardar <= 1e6 ? c.guardar : 0,
      };
    } catch { return { ...PADRAO }; }
  };
  let cfg = lerCfg();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento: vale na sessão */ } };

  let eu = null;
  let catalogo = [];
  PIH.on('welcome', (m) => { if (m && Array.isArray(m.catalogoBolas)) catalogo = m.catalogoBolas; });
  PIH.on('estado', (e) => { eu = e; });

  // Corpos no chão: x:1 e xr = ms que ainda restam (quem chega no meio recebe o corpo pela metade).
  const corpos = new Map();
  function anotar(m) {
    const n = Date.now();
    for (const x of (m && m.mobs) || []) {
      if (!x || !Number.isInteger(x.s)) continue;
      if (x.x && Number(x.xr) > 0) {
        if (!corpos.has(x.s)) corpos.set(x.s, { ate: n + Number(x.xr), desde: n, nome: String(x.n || ''), nv: Number(x.nv) || 0, shiny: !!x.sh });
      } else if (x.x === 0 || x.x === false) corpos.delete(x.s);
    }
    for (const s of (m && m.fora) || []) corpos.delete(s);
  }
  PIH.on('campo.init', (m) => { corpos.clear(); anotar(m); });
  PIH.on('campo', anotar);

  const st = { hoje: '', lancadas: 0, ultima: null, motivo: 'desligado' };
  const diaDe = (t) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10); // dia de Brasília

  function temVip() {
    const l = eu && eu.loja;
    return !!l && (l.vip === true || Number(l.vipAte) > Date.now());
  }
  const bolaDeOuro = (id) => { const b = catalogo.find((x) => x && x.id === id); return !!b && Number(b.priceGold) > 0; };
  const quantas = (id) => Number(eu && eu.balls && eu.balls[id]) || 0;
  // A mesma ordem do jogo: as bolas marcadas na automação dele primeiro, depois a ordem do catálogo.
  function bolaDaVez() {
    const ok = (id) => bolaDeOuro(id) && quantas(id) > cfg.guardar;
    const marcadas = (eu && eu.automation && Array.isArray(eu.automation.ballIds)) ? eu.automation.ballIds : [];
    for (const id of marcadas) if (ok(id)) return id;
    for (const b of catalogo) if (b && ok(b.id)) return b.id;
    return null;
  }

  let proximaEm = 0;
  function tique() {
    const n = Date.now();
    for (const [s, c] of corpos) if (c.ate <= n) corpos.delete(s);
    if (!cfg.ligado) { st.motivo = 'desligado'; return; }
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('captura')) { st.motivo = 'Piloto desligado (ou o disjuntor da captura caiu)'; return; }
    if (!eu || !catalogo.length) { st.motivo = 'esperando o jogo'; return; }
    if (temVip()) { st.motivo = 'VIP ativo: quem lança é o jogo'; return; }
    const alvos = [...corpos].filter(([, c]) => c.ate - n > 700 && n - c.desde >= 350 && (cfg.modo === 'todos' || c.shiny));
    if (!alvos.length) { st.motivo = 'esperando um corpo no chão'; return; }
    if (n < proximaEm) return;
    const ballId = bolaDaVez();
    if (ballId == null) { st.motivo = cfg.guardar ? `sem bola de ouro acima das ${cfg.guardar} guardadas` : 'sem bola de ouro na mochila'; return; }
    // shiny primeiro; depois o que vai sumir antes
    alvos.sort((a, b) => (b[1].shiny - a[1].shiny) || (a[1].ate - b[1].ate));
    const [slot, c] = alvos[0];
    proximaEm = n + MIN_MS + Math.floor(Math.random() * 400);
    const r = PIH.pedir({ t: 'ball.throw', ballId, slot }, 'captura');
    corpos.delete(slot);
    if (!r.ok) { st.motivo = r.motivo || 'recusado'; return; }
    const d = diaDe(n);
    if (st.hoje !== d) { st.hoje = d; st.lancadas = 0; }
    st.lancadas++;
    st.ultima = { em: n, nome: c.nome, nv: c.nv, shiny: c.shiny, ballId };
    st.motivo = 'lançando';
    if (c.shiny) PIH.cofre?.diario?.(`captura: bola no ${c.nome} SHINY Nv ${c.nv}`, 'ok');
  }
  setInterval(tique, 250);

  // ---- aba Caçar ------------------------------------------------------------------------------------
  function status() {
    if (temVip()) return 'bloqueada: VIP ativo — use "Lançar sem Parar" do jogo';
    if (!cfg.ligado) return 'desligada';
    const base = st.motivo === 'lançando' || st.motivo === 'esperando um corpo no chão'
      ? `${st.lancadas} bola${st.lancadas === 1 ? '' : 's'} hoje${st.ultima ? ` · última em ${K.esc(st.ultima.nome)} Nv ${st.ultima.nv}` : ''}`
      : K.esc(st.motivo);
    return base;
  }
  function linha(modo) {
    const vip = temVip();
    const trava = modo === 'desligado' || vip;
    const manual = modo === 'manual';
    return K.linha({
      id: 'captura', icone: 'bola', nome: 'Pokébola automática', alvo: 'captura:ligado', on: cfg.ligado && !vip, trava, status: status(), classe: vip ? 'plt-l-vip' : '',
      dica: 'Para quem está sem VIP: joga a bola sozinho em cada corpo que cai, igual ao clique na lista "Proximidade para Capturar" do jogo. Uma bola por corpo, no máximo uma a cada 1,3 s (o ritmo do VIP). Só bola paga em ouro — Beast Ball nunca. Com VIP ativo fica bloqueada (o jogo lança). Atenção: no jogo, lançar sozinho é benefício do VIP.',
      ajustes: manual ? `${K.fcampo('Em quem', K.escala('captura:modo', cfg.modo, [['todos', 'Todo corpo'], ['shiny', 'Só shiny']], trava))}${K.fcampo('Guardar bolas', K.numero('captura:guardar', cfg.guardar, 0, 100000, 10, trava), 'Para de lançar uma bola quando sobrarem estas')}` : '',
    });
  }
  function definir(caminho, v) {
    if (caminho === 'ligado') cfg.ligado = !!v;
    else if (caminho === 'modo' && (v === 'todos' || v === 'shiny')) cfg.modo = v;
    else if (caminho === 'guardar') { const n = Math.floor(Number(v)); if (Number.isFinite(n) && n >= 0 && n <= 1e6) cfg.guardar = n; }
    else return;
    gravar();
    PIH.cofre?.diario?.(`captura: ${caminho} ${caminho === 'ligado' ? (cfg.ligado ? 'ligada' : 'desligada') : String(v)}`);
  }
  const resumo = () => ({ ligado: cfg.ligado, motivo: st.motivo, lancadas: st.lancadas, ultima: st.ultima, vip: temVip() });

  PIH.captura = { linha, definir, resumo, status, temVip, _interno: { tique, corpos, cfg: () => cfg, bolaDaVez } };
})(globalThis);
