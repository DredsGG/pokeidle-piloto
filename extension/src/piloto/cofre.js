// O COFRE: o orçamento de ouro do piloto. Toda ação que gasta passa por aqui antes de sair.
//
// Roda no mundo da página (MAIN), carregado logo depois do hook. O hook chama `autorizar` para todo
// comando do piloto e para toda compra AUTOMÁTICA do radar; o clique do jogador não passa por aqui
// (é decisão dele), mas as listas de bloqueio do hook valem para ele também.
//
// As regras (decisão de 2026-10-19):
// - Piloto desligado: nada automático sai.
// - Disjuntor: 3 erros seguidos do servidor num módulo desligam aquele módulo até você religar.
// - Reserva: nunca gastar abaixo de max(reserva mínima, 2 h de ouro/h medido).
// - Teto do dia (00:00 de Brasília): 50% do ouro/h medido × 24 h, somando tudo. Sem medida ainda
//   (menos de 5 min caçando), um teto baixo e fixo.
// - Preço desconhecido = não compra.
// - Diamante e Gema não existem aqui: o hook nem deixa esses comandos saírem.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt = root.__pokeidleHunt || {});
  if (!PIH.on) return;

  const CHAVE = 'piloto:cofre:v1';
  const PADRAO = {
    ligado: true, // o piloto inteiro (mas cada automação começa desligada no próprio módulo)
    modo: 'proporcional', // 'proporcional' | 'fixo'
    reservaMin: 5_000_000,
    horasReserva: 2,
    fracaoTeto: 0.5,
    tetoFixoDia: 10_000_000,
    tetoSemMedida: 10_000_000, // 1.2.1: era 2 mi e travava a compra automática no primeiro dia
    // teto por categoria (0 = categoria proibida; null = só o teto do dia)
    tetoCategoria: { repor: null, mercado: null, ovos: 0 },
    errosParaDesligar: 3,
  };
  const CATEGORIAS = { repor: 'Reposição (bolas, poções, revives)', mercado: 'Compra automática no Mercado', ovos: 'Mystery Eggs' };
  // Os ovos do Market: o id do item e o preço em ouro (shared/chocadeira.mjs).
  const OVOS = { 70091: 100_000_000, 70092: 500_000_000, 70093: 1_000_000_000, 70094: Infinity }; // 70094 (Shiny) nunca é comprado sozinho

  const diaBrasilia = (t = Date.now()) => new Date(t - 3 * 3_600_000).toISOString().slice(0, 10);

  function ler() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE)) || {};
      return {
        cfg: { ...PADRAO, ...(s.cfg || {}), ...(Number(s.cfg && s.cfg.tetoSemMedida) === 2_000_000 ? { tetoSemMedida: PADRAO.tetoSemMedida } : {}), tetoCategoria: { ...PADRAO.tetoCategoria, ...((s.cfg || {}).tetoCategoria || {}) } },
        dia: s.dia || diaBrasilia(),
        gasto: s.gasto || {},
        ouroH: Number(s.ouroH) || 0,
        ouroHEm: Number(s.ouroHEm) || 0,
        ouroHDia: Number(s.ouroHDia) || 0,
        desligados: s.desligados || {},
      };
    } catch {
      return { cfg: { ...PADRAO, tetoCategoria: { ...PADRAO.tetoCategoria } }, dia: diaBrasilia(), gasto: {}, ouroH: 0, ouroHEm: 0, ouroHDia: 0, desligados: {} };
    }
  }
  let s = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento */ } };

  function virarDia() {
    const hoje = diaBrasilia();
    // O teto do dia é congelado na virada, com o ouro/h de então: uma venda grande no meio do dia
    // não estoura o teto de hoje (auditoria, caso G).
    if (s.dia === hoje) return false;
    const ontem = Object.values(s.gasto).reduce((a, b) => a + (Number(b) || 0), 0);
    s.dia = hoje; s.gasto = {}; s.ouroHDia = s.ouroH; gravar();
    diarioViradaPendente = `novo dia (00:00 de Brasília): gasto zerado${ontem ? `, ontem foram ${nf.format(Math.round(ontem))}` : ''}`;
    return true;
  }
  let diarioViradaPendente = '';
  // A virada não espera alguém abrir o Cofre: confere a cada 15 s e avisa o painel.
  setInterval(() => {
    virarDia();
    if (diarioViradaPendente) { const t = diarioViradaPendente; diarioViradaPendente = ''; diario(t, 'ok'); }
  }, 15_000);

  // ---- o que o cofre sabe do jogo -----------------------------------------------------------
  let eu = null;
  let welcome = null;
  let precoItem = new Map(); // itemId -> priceGold
  // Ouro já autorizado que ainda não saiu do saldo (fila, sorteio, estado atrasado): entra no piso
  // e no "livre". Sai quando o saldo cai (o mais antigo primeiro) ou depois de 2 min (auditoria, caso A).
  let pendentes = []; // { id, custo, em }
  let ouroAnterior = null;
  const pendente = () => {
    const limite = Date.now() - 120_000;
    pendentes = pendentes.filter((r) => r.em >= limite && r.custo > 0);
    return pendentes.reduce((a, r) => a + r.custo, 0);
  };
  PIH.on('estado', (e) => {
    eu = e;
    const ouro = Number(e && e.gold);
    if (Number.isFinite(ouro)) {
      if (ouroAnterior !== null && ouro < ouroAnterior) {
        let caiu = ouroAnterior - ouro;
        for (const r of pendentes) { if (caiu <= 0) break; const k = Math.min(caiu, r.custo); r.custo -= k; caiu -= k; }
      }
      ouroAnterior = ouro;
    }
  });
  PIH.on('welcome', (m) => {
    welcome = m;
    for (const i of m.itensNossos || []) if (i && Number(i.priceGold) > 0) precoItem.set(Number(i.id), Number(i.priceGold));
    // O catálogo do jogo (items.json) traz o priceGold das poções e revives.
    if (PIH.carregarJogo) {
      PIH.carregarJogo().then((j) => {
        for (const [id, it] of j.itensPorId) if (Number(it.priceGold) > 0 && !precoItem.has(id)) precoItem.set(id, Number(it.priceGold));
      }).catch(() => {});
    }
  });

  // O ouro/h medido (só as subidas do ouro, da última meia hora contínua — nivel.js) vira a régua.
  setInterval(() => {
    try {
      const m = PIH.nivel && PIH.nivel.ritmoMedido(null);
      if (m && m.minutos >= 5 && m.ouro > 0) {
        // média móvel: um pico (venda grande no mercado) não estoura o teto de uma vez
        // média móvel com freio: no máximo +25% por hora (1,25^(1/60) por minuto). Venda grande
        // no Mercado não vira "ouro/h" da noite para o dia.
        const alvo = s.ouroH > 0 ? s.ouroH * 0.7 + m.ouro * 0.3 : m.ouro;
        s.ouroH = Math.round(s.ouroH > 0 ? Math.min(alvo, s.ouroH * 1.25 ** (1 / 60)) : Math.min(alvo, 50_000_000));
        if (!s.ouroHDia) s.ouroHDia = s.ouroH;
        s.ouroHEm = Date.now();
        gravar();
      }
    } catch { /* sem medida */ }
  }, 60_000);

  // ---- as contas ------------------------------------------------------------------------------
  const reserva = () => Math.max(Number(s.cfg.reservaMin) || 0, (Number(s.cfg.horasReserva) || 0) * s.ouroH);
  function tetoDia() {
    virarDia();
    if (s.cfg.modo === 'fixo') return Number(s.cfg.tetoFixoDia) || 0;
    const base = s.ouroHDia || 0;
    return base > 0 ? (Number(s.cfg.fracaoTeto) || 0) * base * 24 : Number(s.cfg.tetoSemMedida) || 0;
  }
  const gastoHoje = () => { virarDia(); return Object.values(s.gasto).reduce((a, b) => a + (Number(b) || 0), 0); };

  function custoDe(pedido) {
    if (pedido.t === 'shop.buy') {
      let unit = null;
      if (pedido.kind === 'ball') {
        const b = (welcome && welcome.catalogoBolas || []).find((x) => Number(x.id) === pedido.id);
        unit = b && Number(b.priceGold) > 0 ? Number(b.priceGold) : null;
      } else {
        unit = OVOS[pedido.id] || precoItem.get(pedido.id) || null;
      }
      if (!unit) return { custo: null, categoria: 'repor' };
      return { custo: unit * pedido.qty, categoria: OVOS[pedido.id] ? 'ovos' : 'repor' };
    }
    if (pedido.t === 'market.comprar') return { custo: pedido.qtd * pedido.preco, categoria: 'mercado' };
    return { custo: 0, categoria: null };
  }

  /** O piloto (ou o automático do radar) pode mandar isto? Reserva o ouro se puder. */
  function autorizar(pedido, origem) {
    virarDia();
    if (!s.cfg.ligado) return { ok: false, motivo: 'piloto desligado' };
    if (s.desligados[origem]) return { ok: false, motivo: `módulo ${origem} desligado pelo disjuntor (${s.desligados[origem].motivo})` };
    const { custo, categoria } = custoDe(pedido);
    if (custo === null) return { ok: false, motivo: 'preço desconhecido: não compro no escuro' };
    if (custo > 0) {
      if (pedido.moeda && pedido.moeda !== 'gold') return { ok: false, motivo: 'só ouro' };
      const ouro = Number(eu && eu.gold);
      if (!Number.isFinite(ouro)) return { ok: false, motivo: 'saldo desconhecido' };
      if (ouro - pendente() - custo < reserva()) return { ok: false, motivo: `abaixo da reserva (${fmt(reserva())}, com ${fmt(pendente())} já comprometido)` };
      const teto = tetoDia();
      if (gastoHoje() + custo > teto) return { ok: false, motivo: `teto do dia (${fmt(teto)})` };
      const tc = s.cfg.tetoCategoria[categoria];
      if (tc !== null && tc !== undefined && (Number(s.gasto[categoria]) || 0) + custo > tc) return { ok: false, motivo: tc === 0 ? `${CATEGORIAS[categoria]} proibida no cofre` : `teto de ${CATEGORIAS[categoria]} (${fmt(tc)})` };
      s.gasto[categoria] = (Number(s.gasto[categoria]) || 0) + custo;
      gravar();
      const res = Object.freeze({ id: ++ultimaReserva, categoria, custo, dia: s.dia });
      reservasAbertas.add(res.id);
      pendentes.push({ id: res.id, custo, em: Date.now() });
      return { ok: true, motivo: null, custo, categoria, reserva: res };
    }
    return { ok: true, motivo: null, custo: 0, categoria, reserva: null };
  }

  // Devolve UMA reserva, uma vez, e só no dia em que ela foi feita (o dia novo começa zerado).
  let ultimaReserva = 0;
  const reservasAbertas = new Set();
  function estornar(reserva) {
    if (!reserva || !reservasAbertas.has(reserva.id)) return;
    reservasAbertas.delete(reserva.id);
    pendentes = pendentes.filter((r) => r.id !== reserva.id);
    virarDia();
    if (reserva.dia !== s.dia) return;
    s.gasto[reserva.categoria] = Math.max(0, (Number(s.gasto[reserva.categoria]) || 0) - reserva.custo);
    gravar();
  }

  /** Quanto ainda dá para gastar agora numa categoria (para a reposição dimensionar a compra). */
  function livre(categoria) {
    virarDia();
    if (!s.cfg.ligado) return 0;
    const ouro = Number(eu && eu.gold) || 0;
    const tc = s.cfg.tetoCategoria[categoria];
    const porCat = tc === null || tc === undefined ? Infinity : tc - (Number(s.gasto[categoria]) || 0);
    return Math.max(0, Math.min(ouro - pendente() - reserva(), tetoDia() - gastoHoje(), porCat));
  }

  // ---- disjuntor --------------------------------------------------------------------------------
  const erros = {};
  function registrarErro(origem, chave) {
    erros[origem] = (erros[origem] || 0) + 1;
    diario(`${origem}: o servidor recusou (${chave || 'erro'}) — ${erros[origem]}/${s.cfg.errosParaDesligar}`, 'aviso');
    if (erros[origem] >= s.cfg.errosParaDesligar && !s.desligados[origem]) {
      s.desligados[origem] = { em: Date.now(), motivo: `${erros[origem]} recusas seguidas, a última: ${chave || 'erro'}` };
      gravar();
      diario(`DISJUNTOR: módulo ${origem} desligado. Confira o diário e religue na aba Cofre.`, 'erro');
      PIH.emit('piloto.disjuntor', { origem });
    }
  }
  function registrarSucesso(origem) { erros[origem] = 0; }
  // 1.12.3: o disjuntor religa sozinho depois de 30 min (o Automático é de um botão só); se o
  // servidor seguir recusando, ele cai de novo após 3 recusas.
  const liberado = (origem) => {
    const d = s.desligados[origem];
    if (d && Date.now() - (Number(d.em) || 0) > 30 * 60_000) {
      delete s.desligados[origem]; erros[origem] = 0; gravar();
      diario(`módulo ${origem} religado sozinho depois de 30 min`, 'ok');
    }
    return s.cfg.ligado && !s.desligados[origem];
  };

  // ---- diário do piloto (compartilhado com a rotina) --------------------------------------------
  const registro = [];
  function diario(txt, tipo = 'info') {
    registro.unshift({ t: Date.now(), txt, tipo });
    registro.length = Math.min(registro.length, 60);
    console.info('[piloto]', txt);
    PIH.emit('piloto.diario', registro);
  }

  // ---- aba Cofre ----------------------------------------------------------------------------------
  const nf = new Intl.NumberFormat('pt-BR');
  const fmt = (v) => (Number.isFinite(v) ? nf.format(Math.round(v)) : '—');
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function html() {
    virarDia();
    const K = PIH.kit;
    const c = s.cfg;
    const CURTO = { repor: 'Reposição', mercado: 'Mercado', ovos: 'Ovos' };
    const linhasCat = Object.keys(CATEGORIAS).map((k) => {
      const tc = c.tetoCategoria[k];
      return `<tr><td title="${esc(CATEGORIAS[k])}">${CURTO[k] || esc(CATEGORIAS[k])}</td><td>${fmt(Number(s.gasto[k]) || 0)}</td>
        <td><input type="number" min="0" step="100000" placeholder="livre" value="${tc === null || tc === undefined ? '' : tc}" data-cofre-cat="${k}"></td></tr>`;
    }).join('');
    const desl = Object.entries(s.desligados);
    const n = (k, v, min, max, step) => `<input type="number" min="${min}" ${max != null ? `max="${max}"` : ''} step="${step}" value="${v}" data-cofre="${k}">`;
    const kpi = (icone, rot, val, cls = '') => `<div class="plt-kpi ${cls}">${K.ico(icone)}<small>${rot}</small><strong>${val}</strong></div>`;
    const gasto = gastoHoje();
    const teto = tetoDia();
    const topo = `<div class="plt-kpis">
        ${kpi('ouro', 'Ouro/h', s.ouroH ? fmt(s.ouroH) : '…', 'k-ouro')}
        ${kpi('escudo', 'Reserva', fmt(reserva()))}
        ${kpi('cofre', 'Teto hoje', fmt(teto))}
        ${kpi('gasto', 'Gasto hoje', fmt(gasto), 'k-gasto')}
      </div>`;
    const regras = K.cartao({
      icone: 'cofre', titulo: 'Regras do cofre',
      dica: `Toda compra automática passa aqui: reserva mínima, teto do dia e teto por categoria. Diamante e Gema nunca: ${PIH.BLOQUEADOS ? PIH.BLOQUEADOS.size : 0} comandos bloqueados no núcleo. O dia vira à 00:00 de Brasília.`,
      corpo: `<div class="plt-linha">
          ${K.campo('Modo', `<select data-cofre="modo"><option value="proporcional" ${c.modo === 'proporcional' ? 'selected' : ''}>Pelo ganho</option><option value="fixo" ${c.modo === 'fixo' ? 'selected' : ''}>Fixo</option></select>`)}
          ${K.campo('Fração', n('fracaoTeto', c.fracaoTeto, 0, 1, 0.05), 'Teto do dia = esta fração × ouro/h × 24 h')}
          ${K.campo('Teto fixo', n('tetoFixoDia', c.tetoFixoDia, 0, null, 1000000))}
          ${K.campo('Reserva mín.', n('reservaMin', c.reservaMin, 0, null, 1000000))}
          ${K.campo('+ horas', n('horasReserva', c.horasReserva, 0, 48, 0.5), 'A reserva também cobre estas horas de ouro/h')}
        </div>
        <table class="pih-tab pih-auto-tab"><thead><tr><th>Categoria</th><th>Hoje</th><th>Teto (0 = proibida)</th></tr></thead><tbody>${linhasCat}</tbody></table>
        ${desl.length ? `<p class="plt-nota pih-alerta">Disjuntor: ${desl.map(([o, d]) => `<b title="${esc(d.motivo)}">${esc(o)}</b> ${K.botao('Religar', `data-religar="${esc(o)}"`)}`).join(' ')}</p>` : ''}`,
    });
    const diarioHtml = K.cartao({
      icone: 'relogio', titulo: 'Diário',
      corpo: `<ul class="pih-diario">${registro.length ? registro.map((d) => `<li class="pih-d-${d.tipo}"><span>${hora(d.t)}</span> ${esc(d.txt)}</li>`).join('') : '<li class="pih-dim">nada ainda</li>'}</ul>`,
    });
    return topo + regras + diarioHtml;
  }

  function ligar(painel, redesenhar) {
    for (const el of painel.querySelectorAll('[data-cofre]')) {
      el.addEventListener('change', () => {
        const k = el.dataset.cofre;
        if (el.type === 'number') {
          // vazio ou inválido (ex.: "5.000.000") não vira 0: fica o valor anterior (auditoria, item 9)
          const v = el.value.trim() === '' ? NaN : Number(el.value);
          if (!Number.isFinite(v) || v < 0) { redesenhar(); return; }
          s.cfg[k] = v;
        } else s.cfg[k] = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'ligado') diario(s.cfg.ligado ? 'piloto ligado' : 'piloto DESLIGADO', s.cfg.ligado ? 'ok' : 'aviso');
        gravar();
        redesenhar();
      });
    }
    for (const el of painel.querySelectorAll('[data-cofre-cat]')) {
      el.addEventListener('change', () => {
        const v = el.value.trim() === '' ? NaN : Number(el.value);
        if (!Number.isFinite(v) || v < 0) { redesenhar(); return; } // vazio não libera categoria
        s.cfg.tetoCategoria[el.dataset.cofreCat] = v;
        gravar();
        redesenhar();
      });
    }
    for (const el of painel.querySelectorAll('[data-religar]')) {
      el.addEventListener('click', () => {
        delete s.desligados[el.dataset.religar];
        erros[el.dataset.religar] = 0;
        gravar();
        diario(`módulo ${el.dataset.religar} religado`, 'ok');
        redesenhar();
      });
    }
  }

  // Para o painel: o interruptor geral e um resumo de leitura.
  const ligado = () => !!s.cfg.ligado;
  function definirLigado(v) {
    s.cfg.ligado = !!v;
    gravar();
    diario(s.cfg.ligado ? 'piloto ligado' : 'piloto DESLIGADO', s.cfg.ligado ? 'ok' : 'aviso');
  }
  const resumo = () => ({ ligado: !!s.cfg.ligado, ouroH: s.ouroH, reserva: reserva(), teto: tetoDia(), gasto: gastoHoje(), gastoPorCategoria: { ...s.gasto }, pendente: pendente(), desligados: Object.keys(s.desligados) });
  const ultimos = (n = 8) => registro.slice(0, n).map((r) => ({ ...r }));

  // Escolher o Automático religa os módulos que o disjuntor desligou (com registro no diário).
  function religarTudo() {
    const ks = Object.keys(s.desligados);
    if (!ks.length) return;
    for (const k of ks) { delete s.desligados[k]; erros[k] = 0; }
    gravar();
    diario(`Automático: religados ${ks.join(', ')}`, 'ok');
  }
  PIH.registrarCofre({ autorizar, estornar, livre, reserva, tetoDia, gastoHoje, liberado, registrarErro, registrarSucesso, religarTudo, diario, html, ligar, CATEGORIAS, pendente, ligado, definirLigado, resumo, ultimos, _interno: { custoDe, estado: () => s } });
})(globalThis);
