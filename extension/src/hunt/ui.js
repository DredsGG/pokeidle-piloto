// A tela do Piloto: UMA barra no painel "Em campo" do jogo (onde ficavam o Radar e o /hunt) e UM
// painel com menu lateral — Resumo, Caçar, Nível, Automação, Rotina, Mercado (o Radar, que roda no
// outro mundo da extensão e se encaixa aqui) e Cofre.
//
// O card "Em campo" do jogo (`#ativo-card`) é redesenhado inteiro a cada atualização do estado.
// Por isso a barra NÃO mora dentro dele: fica no painel em volta (`#p-ativo`), logo antes do card.
// Se o card não estiver onde esperamos (layout novo do jogo), a extensão pede um clique nele.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  if (!PIH.on || !PIH.engine) return;

  const CHAVE_PREFS = 'pokeidle-hunt:prefs:v1';
  const CHAVE_ALVO = 'pokeidle-hunt:alvo:v1';
  const POR_PAGINA = 25;

  const lerJson = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravarJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  // Tema (1.12): escuro (o do jogo) ou claro (só os vãos clareiam; madeira e botões ficam). O
  // atributo no <html> também chega ao shadow DOM do Radar por :host-context.
  const temaAtual = () => (lerJson('piloto:tema', 'escuro') === 'claro' ? 'claro' : 'escuro');
  const aplicarTema = () => { document.documentElement.dataset.pilotoTema = temaAtual(); };
  const definirTema = (t) => { gravarJson('piloto:tema', t === 'claro' ? 'claro' : 'escuro'); aplicarTema(); };
  aplicarTema();
  function pintarBotaoTema() {
    const b = painel && painel.querySelector('[data-acao="tema"]');
    if (!b) return;
    const claro = temaAtual() === 'claro';
    const rotulo = claro ? 'Modo escuro' : 'Modo claro';
    b.innerHTML = PIH.kit.ico(claro ? 'lua' : 'sol');
    b.setAttribute('aria-label', rotulo);
    b.title = rotulo;
  }

  let prefs = {
    ordem: 'xp', soLiberadas: true, comPocao: true,
    aba: 'resumo', fonte: 'auto', metaTr: null, metaPk: null, horasDia: 24,
    ...lerJson(CHAVE_PREFS, {}),
  };
  let welcome = null;
  let eu = null;

  // ---- formatação ------------------------------------------------------------------------
  const nf = new Intl.NumberFormat('pt-BR');
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const num = (v) => nf.format(Math.round(v));
  const curto = (v) => (Math.abs(v) >= 10000 ? nfc.format(v) : num(v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const REGIAO = { kanto: 'Kanto', johto: 'Johto', outland: 'Outland', orre: 'Orre', hoenn: 'Hoenn', sinnoh: 'Sinnoh', unova: 'Unova', kalos: 'Kalos', alola: 'Alola', galar: 'Galar', paldea: 'Paldea' };
  const regiao = (r) => REGIAO[r] ?? (r ? r[0].toUpperCase() + r.slice(1) : '');
  const segundos = (s) => (s < 1 ? '<1 s' : s < 60 ? `${s.toFixed(1).replace('.', ',')} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

  const pkAtivo = () => eu?.pokemons?.find((p) => p.id === eu.activeId) ?? null;
  const K = PIH.kit;
  const ico = (n, c) => (K ? K.ico(n, c) : '');

  // ---- a barra do Piloto ----------------------------------------------------------------
  // O Radar roda no outro mundo da extensão: esta marca diz a ele que a barra é uma só (a nossa).
  document.documentElement.setAttribute('data-piloto', '1');

  function criarBotao() {
    const m = document.createElement('span');
    m.className = 'plt-marca';
    m.textContent = 'Piloto';
    return m;
  }

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'plt-barra';
  botao.setAttribute('aria-haspopup', 'dialog');
  botao.innerHTML = `<span class="plt-marca">${ico('leme')}Piloto</span>
    <span class="plt-chips">
      <span class="plt-chip" data-chip="hunt" title="Hunt">${ico('cacar')}</span>
      <span class="plt-chip" data-chip="rotina" title="Rotina">${ico('rotina')}</span>
      <span class="plt-chip" data-chip="radar" title="Radar">${ico('radar')}<b hidden></b></span>
    </span>
    <span class="plt-medidor" aria-hidden="true"><span></span></span>`;
  botao.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    alternarPainel();
  });

  let alvoManual = lerJson(CHAVE_ALVO, null); // seletor escolhido pelo jogador, se o padrão falhar

  function ancora() {
    if (alvoManual) {
      const el = document.querySelector(alvoManual);
      if (el) return { modo: 'manual', el };
    }
    const card = document.getElementById('ativo-card');
    const painelJogo = document.getElementById('p-ativo');
    const nome = card?.querySelector('.ativo-nome');
    if (card && painelJogo && nome && !card.classList.contains('vazio')) return { modo: 'padrao', card, nome };
    return null;
  }

  let quadro = 0;
  function posicionarBotao() {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      const a = ancora();
      if (!a) {
        // Sem o card (layout novo, pokémon fora de campo): a barra flutua no canto, nunca some.
        botao.classList.add('plt-fixo');
        if (botao.parentElement !== document.body && document.body) document.body.appendChild(botao);
        botao.style.left = botao.style.top = '';
        return;
      }
      if (a.modo === 'padrao') {
        botao.classList.remove('plt-fixo');
        botao.style.left = botao.style.top = '';
        if (a.card.previousElementSibling !== botao) a.card.before(botao);
      } else {
        botao.classList.add('plt-fixo');
        if (botao.parentElement !== document.body) document.body.appendChild(botao);
        const r = a.el.getBoundingClientRect();
        botao.style.left = `${r.left}px`;
        botao.style.top = `${Math.max(4, r.top - botao.offsetHeight - 6)}px`;
      }
    });
  }

  function vigiarCard() {
    const alvo = document.getElementById('p-ativo') ?? document.body;
    new MutationObserver(posicionarBotao).observe(alvo, { childList: true, subtree: true });
    addEventListener('resize', posicionarBotao);
    addEventListener('scroll', posicionarBotao, true);
    setInterval(posicionarBotao, 1500);
    setInterval(pintarBarra, 2000);
    posicionarBotao();
  }

  // O que a barra mostra: um ponto por frente (verde ligado, laranja em pausa, cinza desligado) e
  // o medidor do cofre (o gasto de hoje contra o teto).
  let radar = null; // o que o Radar publica (o outro mundo): estado, avisos, compra automática
  const rotinaLigadas = () => {
    const c = PIH.rotina?._interno.cfg();
    if (!c) return [];
    const nomes = { passe: 'Passe', xpshare: 'XP Share', outland: 'Outland', rodizio: 'Rodízio', evoluir: 'Evoluir', chocadeira: 'Chocadeira' };
    const out = Object.entries(nomes).filter(([k]) => c[k]?.ligado).map(([, n]) => n);
    if (c.depot && c.depot.modo !== 'off') out.push('Depot');
    if (c.pvp && (c.pvp.fila || c.pvp.time)) out.push('PvP');
    return out;
  };
  function estadoDasFrentes() {
    const cof = PIH.cofre?.resumo?.() ?? null;
    const geral = !!cof?.ligado;
    const a = PIH.auto?._interno.cfg();
    const huntLigado = !!(a && (a.hunt.ligado || a.repor.ligado));
    const disj = new Set(cof?.desligados ?? []);
    return {
      cof, geral,
      hunt: !geral ? '' : disj.has('hunt') ? 'erro' : huntLigado ? 'on' : '',
      rotina: !geral ? '' : disj.has('rotina') ? 'erro' : rotinaLigadas().length ? 'on' : '',
      radar: !radar?.ligado ? '' : radar.classe === 'pausa' ? 'pausa' : 'on',
    };
  }
  function pintarBarra() {
    const f = estadoDasFrentes();
    const NOME = { hunt: 'Hunt', rotina: 'Rotina', radar: 'Radar' };
    const EST = { on: 'ligado', pausa: 'em pausa', erro: 'disjuntor', '': 'desligado' };
    for (const k of ['hunt', 'rotina', 'radar']) {
      const el = botao.querySelector(`[data-chip="${k}"]`);
      if (el) { el.dataset.estado = f[k]; el.title = `${NOME[k]}: ${EST[f[k]] ?? f[k]}`; }
    }
    const n = botao.querySelector('[data-chip="radar"] b');
    if (n) { n.hidden = !(radar?.avisos > 0); n.textContent = radar?.avisos ?? ''; }
    const pct = f.cof && f.cof.teto > 0 ? Math.min(1, f.cof.gasto / f.cof.teto) : 0;
    const med = botao.querySelector('.plt-medidor > span');
    if (med) med.style.width = `${Math.round(pct * 100)}%`;
    botao.classList.toggle('plt-desligado', !f.geral);
    botao.classList.toggle('plt-auto', modoAtual() === 'automatico');
    publicarContexto();
    botao.title = f.cof
      ? `Piloto ${f.geral ? 'ligado' : 'desligado'} — gasto hoje ${curto(f.cof.gasto)} de ${curto(f.cof.teto)}${radar ? ` · Radar: ${radar.texto}` : ''}`
      : 'Piloto';
    if (painel) pintarMoldura();
  }
  // O que a revenda automática do Radar fez (outro mundo da extensão): entra em "Últimas ações".
  const diarioRadar = [];
  document.addEventListener('piloto:radar-diario', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      if (typeof d.txt !== 'string' || typeof d.t !== 'number') return;
      diarioRadar.unshift({ t: d.t, txt: d.txt.slice(0, 200), tipo: ['erro', 'aviso'].includes(d.tipo) ? d.tipo : 'ok' });
      diarioRadar.length = Math.min(diarioRadar.length, 20);
      if (painel && prefs.aba === 'resumo' && !digitando()) desenhar();
    } catch { /* ignora */ }
  });
  document.addEventListener('piloto:radar', (ev) => {
    try { radar = JSON.parse(ev.detail); } catch { return; }
    pintarBarra();
  });
  // O Radar pede para aparecer (aviso novo, com "abrir o painel no aviso" ligado).
  document.addEventListener('piloto:abrir', () => {
    prefs.aba = 'mercado';
    gravarJson(CHAVE_PREFS, prefs);
    if (!painel) alternarPainel(); else desenhar();
  });

  // ---- verificação: onde está o pokémon ativo? -------------------------------------------
  let aviso = null;
  function mostrarAviso(html, { fechaEm = 0, acao = null } = {}) {
    aviso?.remove();
    aviso = document.createElement('div');
    aviso.className = 'pih-aviso';
    aviso.append(criarBotao());
    const txt = document.createElement('div');
    txt.innerHTML = html;
    aviso.append(txt);
    if (acao) aviso.append(acao);
    const x = document.createElement('button');
    x.className = 'pih-x';
    x.textContent = '×';
    x.onclick = () => { aviso?.remove(); aviso = null; pararMira(); };
    aviso.append(x);
    document.body.append(aviso);
    if (fechaEm) setTimeout(() => { if (aviso?.contains(txt)) { aviso.remove(); aviso = null; } }, fechaEm);
  }

  let verificado = false;
  function verificar(tentativa = 0) {
    if (verificado || !eu) return;
    const pk = pkAtivo();
    if (!pk) {
      if (tentativa === 0) mostrarAviso('Coloque um pokémon <b>em campo</b> para usar o <b>Piloto</b>.', { fechaEm: 8000 });
      setTimeout(() => verificar(1), 3000);
      return;
    }
    const a = ancora();
    const texto = a?.modo === 'padrao' ? a.nome.textContent : a?.el?.textContent;
    if (a && texto?.includes(pk.nome)) {
      verificado = true;
      posicionarBotao();
      mostrarAviso(`Pokémon em campo encontrado: <b>${esc(pk.nome)}</b>. O <b>Piloto</b> está logo acima dele.`, { fechaEm: 4500 });
      return;
    }
    if (tentativa < 12) { setTimeout(() => verificar(tentativa + 1), 500); return; }
    const mirar = document.createElement('button');
    mirar.className = 'pih-mais';
    mirar.style.width = 'auto';
    mirar.textContent = 'Apontar';
    mirar.onclick = iniciarMira;
    mostrarAviso(`<b>Onde está seu Pokémon ativo?</b><br>Não achei o card de <b>${esc(pk.nome)}</b>. Clique em “Apontar” e depois no nome dele.`, { acao: mirar });
  }

  let mirando = null;
  function iniciarMira() {
    document.documentElement.classList.add('pih-mirando');
    let marcado = null;
    const sobre = (ev) => {
      marcado?.classList.remove('pih-alvo');
      marcado = ev.target instanceof Element && !ev.target.closest('.pih-aviso') ? ev.target : null;
      marcado?.classList.add('pih-alvo');
    };
    const clique = (ev) => {
      if (!marcado) return;
      ev.preventDefault();
      ev.stopPropagation();
      alvoManual = seletorDe(marcado);
      gravarJson(CHAVE_ALVO, alvoManual);
      pararMira();
      verificado = true;
      posicionarBotao();
      mostrarAviso('Pronto: o <b>Piloto</b> vai ficar logo acima deste ponto.', { fechaEm: 4000 });
    };
    addEventListener('mouseover', sobre, true);
    addEventListener('click', clique, true);
    mirando = () => {
      removeEventListener('mouseover', sobre, true);
      removeEventListener('click', clique, true);
      marcado?.classList.remove('pih-alvo');
    };
  }
  function pararMira() {
    document.documentElement.classList.remove('pih-mirando');
    mirando?.();
    mirando = null;
  }
  function seletorDe(el) {
    const partes = [];
    while (el && el !== document.body) {
      if (el.id) { partes.unshift(`#${CSS.escape(el.id)}`); break; }
      const i = [...el.parentElement.children].indexOf(el) + 1;
      partes.unshift(`${el.tagName.toLowerCase()}:nth-child(${i})`);
      el = el.parentElement;
    }
    return partes.join(' > ');
  }

  // ---- o botão único: Desligado, Manual, Automático -------------------------------------------
  const CHAVE_MODO = 'piloto:modo:v1';
  function modoAtual() {
    const cof = PIH.cofre?.resumo?.();
    if (cof && !cof.ligado) return 'desligado';
    const m = lerJson(CHAVE_MODO, null);
    return m === 'automatico' || m === 'manual' ? m : 'manual';
  }
  // 1.19 bloqueou o Manual; 1.31 (pedido do André) libera de novo, revisado para o público. Fica a
  // constante para um bloqueio futuro sem caçar todos os pontos.
  const MANUAL_BLOQUEADO = false;
  function definirModo(modo) {
    if (!['desligado', 'manual', 'automatico'].includes(modo)) return;
    if (modo === 'manual' && MANUAL_BLOQUEADO) return;
    gravarJson(CHAVE_MODO, modo === 'desligado' ? (lerJson(CHAVE_MODO, 'manual') ?? 'manual') : modo);
    PIH.cofre?.definirLigado(modo !== 'desligado');
    if (modo === 'automatico') {
      PIH.cofre?.religarTudo?.();
      PIH.auto?.aplicar?.({ hunt: { ligado: true }, repor: { ligado: true } });
      PIH.rotina?.aplicar?.({ passe: true, xpshare: true, outland: true, pvp: true, depotVender: true, autoColecao: true, rodizio: true });
      PIH.time?.aplicar?.({ campoAuto: true });
      PIH.torneio?.aplicar?.({ ligado: true });
    }
    // O Radar (outro mundo da extensão) muda o perfil dele: desligado, só avisar ou automático.
    document.dispatchEvent(new CustomEvent('piloto:modo', { detail: JSON.stringify({ modo }) }));
    publicarContexto(true);
    pintarBarra();
  }
  // O ouro/h medido e o teto do dia do cofre vão para o Radar calcular os limites sozinho.
  let contextoPublicado = '';
  function publicarContexto(forcar = false) {
    const cof = PIH.cofre?.resumo?.();
    if (!cof) return;
    const livre = PIH.cofre?.livre ? Math.max(0, Math.floor(Number(PIH.cofre.livre('mercado')) || 0)) : null;
    // 1.13: o modo vai junto — a tela do Radar (outro mundo) se desenha diferente em cada um.
    const d = JSON.stringify({ ouroH: Number(cof.ouroH) || 0, teto: Number(cof.teto) || 0, livre, modo: modoAtual() });
    if (!forcar && d === contextoPublicado) return;
    contextoPublicado = d;
    document.dispatchEvent(new CustomEvent('piloto:contexto', { detail: d }));
  }
  setInterval(publicarContexto, 5_000);
  setTimeout(() => {
    // 1.31: instalação nova (nenhum modo salvo) começa no Off — você escolhe Manual ou Auto.
    // (a chave de desenvolvimento 'piloto:dev:manual' dos testes automáticos mantém o começo antigo)
    const devManual = (() => { try { return localStorage.getItem('piloto:dev:manual') === '1'; } catch { return false; } })();
    if (!devManual && lerJson(CHAVE_MODO, null) === null && modoAtual() !== 'desligado') definirModo('desligado');
    if (MANUAL_BLOQUEADO && modoAtual() === 'manual') {
      const veioDoManual = lerJson(CHAVE_MODO, null) === 'manual'; // instalação nova não tem modo salvo
      definirModo('desligado');
      if (veioDoManual) PIH.cofre?.diario?.('o modo Manual está bloqueado: o Piloto ficou em Off — escolha Auto para ligar', 'aviso');
    }
    publicarContexto(true);
    // O modo é quem manda: no Automático, o Radar volta ao perfil automático a cada carga da página
    // (antes, 3 falhas desligavam a compra dele e ela ficava desligada com o Piloto em Automático).
    if (modoAtual() === 'automatico') document.dispatchEvent(new CustomEvent('piloto:modo', { detail: JSON.stringify({ modo: 'automatico', recarga: true }) }));
    // 1.10, uma vez: quem já estava no Automático passa a vender o Depot sozinho (pedido do André).
    if (modoAtual() === 'automatico' && !lerJson('piloto:migr:depot110', false)) {
      gravarJson('piloto:migr:depot110', true);
      PIH.rotina?.aplicar?.({ depotVender: true });
    }
  }, 3000);
  // Desligou a compra automática no Mercado: o Piloto passa a Manual (para não religar sozinho).
  document.addEventListener('piloto:radar-manual', () => {
    if (MANUAL_BLOQUEADO) return; // no Auto, cada automação do Radar tem o seu interruptor
    if (modoAtual() === 'automatico') { gravarJson(CHAVE_MODO, 'manual'); pintarBarra(); }
  });

  // ---- o painel (1.13): a janela do PRÓPRIO jogo -----------------------------------------------
  // Moldura .modal-caixa, menu e linhas da janela Configurações (.cfg-*), botões e interruptores
  // do estilo.css do jogo: se o jogo mudar o visual, o Piloto muda junto. Cada aba se desenha em
  // três jeitos: Off (tudo travado e cinza), Auto (só os interruptores e o que está acontecendo) e
  // Manual (os interruptores e todos os ajustes de cada um).
  const ABAS = [
    ['resumo', 'Resumo', 'resumo', 'Como está a conta agora'],
    ['hunts', 'Caçar', 'cacar', 'Troca de hunt, rodízio, reposição e onde render mais'],
    ['meta', 'Nível', 'nivel', 'Quanto falta e quando chega'],
    ['rotina', 'Rotina', 'rotina', 'Passe, XP Share, PvP, Depot e o resto'],
    ['mercado', 'Mercado', 'mercado', 'O Radar: compra, sorteios e revenda'],
    ['cofre', 'Cofre', 'cofre', 'Quanto pode gastar, e onde gastou'],
  ];
  if (prefs.aba === 'auto') prefs.aba = 'hunts'; // a aba "Auto" virou parte de Caçar
  const ICO_CADEADO = '<svg class="plt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0zm3 4a1.6 1.6 0 0 0-.8 3V19h1.6v-2a1.6 1.6 0 0 0-.8-3z" fill="currentColor"/></svg>';
  const MODOS = [
    ['desligado', 'Off', 'fechar', 'Desligado: nada automático roda, nem a compra do Radar'],
    ['manual', 'Manual', 'escudo', 'Manual: você liga e ajusta cada automação'],
    ['automatico', 'Auto', 'leme', 'Automático: o Piloto lê a conta e calcula tudo; você só liga e desliga'],
  ];
  let painel = null;
  let mostrando = POR_PAGINA;
  let assinatura = '';
  let relogio = 0;
  const abertas = new Set(); // linhas com a explicação ("?") aberta
  const layoutDo = (modo) => (modo === 'manual' ? 'manual' : modo === 'desligado' ? 'desligado' : 'automatico');

  function alternarPainel() {
    if (painel) return fecharPainel();
    painel = document.createElement('div');
    painel.className = 'plt-janela modal-caixa';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-label', 'Piloto');
    painel.innerHTML = `
      <div class="modal-topo plt-topo">
        <div class="modal-topo-esq">
          <h2 class="plt-h2">${ico('leme', 'plt-h2-ico')}Piloto</h2>
          <span class="plt-sub" data-sub></span>
        </div>
        <div class="cfg-escala plt-modos" role="radiogroup" aria-label="Modo do Piloto">
          ${MODOS.map(([k, r, i, d]) => { const bloq = k === 'manual' && MANUAL_BLOQUEADO; return `<button type="button" class="cfg-escala-bt plt-modo-bt${bloq ? ' plt-modo-bloq' : ''}" role="radio" data-modo="${k}" title="${d}"${bloq ? ' disabled aria-disabled="true"' : ''}>${bloq ? ICO_CADEADO : ico(i)}<span>${r}</span></button>`; }).join('')}
        </div>
        <div class="modal-acoes">
          <button type="button" class="plt-tema" data-acao="tema"></button>
          <button type="button" data-acao="fechar" aria-label="Fechar (Esc)" title="Fechar (Esc)">×</button>
        </div>
      </div>
      <div class="modal-corpo plt-modal-corpo">
        <div class="cfg-corpo">
          <div class="cfg-layout">
            <nav class="cfg-cats plt-cats" role="tablist" aria-label="Seções">
              ${ABAS.map(([k, r, i]) => `<button type="button" class="cfg-cat" role="tab" data-aba="${k}"><span class="cfg-cat-ico">${ico(i, 'dlg-svg')}</span><span class="cfg-cat-rot">${r}</span><b class="plt-cat-n" data-n="${k}" hidden></b></button>`).join('')}
              <span class="plt-cats-fim"></span>
              <div class="plt-suporte-bts" data-suporte-bts></div>
              ${PIH.idioma ? PIH.idioma.bandeiras() : ''}
              <a class="plt-assinatura" href="https://github.com/DredsGG" target="_blank" rel="noopener noreferrer" title="Abrir o GitHub do Dreds" aria-label="Feito por Dreds: abrir o GitHub"><i class="plt-rebite" aria-hidden="true"></i><small>feito por</small><b>Dreds</b><em data-versao></em><i class="plt-rebite" aria-hidden="true"></i></a>
            </nav>
            <div class="cfg-paineis">
              <section class="cfg-painel plt-aba" role="tabpanel">
                <header class="cfg-cab"><span class="cfg-cab-ico" data-cab-ico></span><h3 data-titulo></h3><span class="plt-cab-modo" data-cab-modo></span></header>
                <div class="plt-suporte" data-suporte></div>
                <div class="cfg-linhas plt-corpo-aba" data-conteudo></div>
              </section>
            </div>
          </div>
        </div>
      </div>`;
    document.body.append(painel);
    painel.addEventListener('click', aoClicarNoPainel);
    painel.addEventListener('change', aoMudarNoPainel);
    painel.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('input')) ev.target.blur(); });
    pintarBotaoTema();
    pintarMoldura();
    posicionarPainel();
    desenhar();
    addEventListener('keydown', aoTeclar, true);
    setTimeout(() => addEventListener('pointerdown', aoClicarFora, true));
    // Tempo real: as abas conferem a cada 1 s e só trocam o que mudou (sem piscar). Nível refaz a
    // cada 10 s. Não refaz enquanto você digita num campo.
    let voltas = 0;
    relogio = setInterval(() => {
      if (!painel || digitando()) return;
      voltas++;
      if (['resumo', 'hunts', 'rotina', 'cofre'].includes(prefs.aba)) desenhar();
      else if (prefs.aba === 'meta' && voltas % 10 === 0) desenhar();
      else pintarMoldura();
    }, 1_000);
  }
  function fecharPainel() {
    clearInterval(relogio);
    soltarMercado();
    painel?.remove();
    painel = null;
    assinatura = '';
    ultimoHtml = '';
    removeEventListener('keydown', aoTeclar, true);
    removeEventListener('pointerdown', aoClicarFora, true);
  }
  const aoTeclar = (ev) => { if (ev.key === 'Escape') fecharPainel(); };
  const aoClicarFora = (ev) => {
    const caminho = ev.composedPath();
    // 1.32.2: clicar no quadro solto do guia/novidades/versão nova (piloto/guia.js) não fecha o painel
    if (caminho.some((el) => el && el.classList && el.classList.contains('plt-guia-solto'))) return;
    if (painel && !caminho.includes(painel) && !caminho.includes(botao)) fecharPainel();
  };

  // ---- todos os cliques e mudanças do painel passam aqui (um ouvinte só, não se perde ao repintar)
  function rotear(alvo, valor) {
    const i = alvo.indexOf(':');
    const mod = alvo.slice(0, i);
    const caminho = alvo.slice(i + 1);
    if (mod === 'ui') { prefs[caminho] = valor; gravarJson(CHAVE_PREFS, prefs); }
    else if (mod === 'auto') PIH.auto?.definir?.(caminho, valor);
    else if (mod === 'rotina') PIH.rotina?.definir?.(caminho, valor);
    else if (mod === 'cofre') PIH.cofre?.definir?.(caminho, valor);
    else if (mod === 'captura') PIH.captura?.definir?.(caminho, valor);
    else if (mod === 'volta') PIH.volta?.definir?.(caminho, valor);
    else if (mod === 'plateia') PIH.plateia?.definir?.(caminho, valor);
    else if (mod === 'torneio') PIH.torneio?.definir?.(caminho, valor);
    ultimoHtml = '';
    desenhar();
  }
  function aoClicarNoPainel(ev) {
    const t = ev.target.closest('button, a');
    if (!t || !painel.contains(t)) return;
    if (t.disabled) return;
    if (t.matches('.plt-modo-bt[data-modo]')) { definirModo(t.dataset.modo); ultimoHtml = ''; desenhar(); return; }
    if (t.matches('[data-ir-hunt]')) {
      const r = PIH.auto?.irParaHunt?.(t.dataset.irHunt) || { ok: false, motivo: 'a automação de hunt não carregou' };
      t.classList.add(r.ok ? 'indo' : 'recusado');
      t.title = r.ok ? 'Indo…' : `Não deu: ${r.motivo}`;
      setTimeout(() => { ultimoHtml = ''; desenhar(); }, r.ok ? 1500 : 2500);
      return;
    }
    if (t.matches('.cfg-cat[data-aba]')) { prefs.aba = t.dataset.aba; gravarJson(CHAVE_PREFS, prefs); mostrando = POR_PAGINA; ultimoHtml = ''; desenhar(); return; }
    if (t.matches('[data-idioma]')) {
      PIH.idioma?.definir(t.dataset.idioma);
      for (const x of painel.querySelectorAll('[data-idioma]')) x.setAttribute('aria-pressed', String(x === t));
      ultimoHtml = ''; desenhar();
      return;
    }
    if (t.matches('.cfg-ajuda')) {
      const l = t.closest('.cfg-linha');
      if (!l) return;
      const aberta = !l.classList.contains('aberta');
      l.classList.toggle('aberta', aberta);
      t.setAttribute('aria-expanded', String(aberta));
      if (aberta) abertas.add(l.dataset.linha); else abertas.delete(l.dataset.linha);
      return;
    }
    if (t.matches('.cfg-toggle[data-alternar]')) { rotear(t.dataset.alternar, !t.classList.contains('on')); return; }
    if (t.matches('.cfg-escala-bt[data-escolha]')) { rotear(t.dataset.escolha, t.dataset.valor); return; }
    const acao = t.dataset.acao;
    if (!acao) return;
    if (acao === 'fechar') fecharPainel();
    else if (acao === 'tema') { definirTema(temaAtual() === 'claro' ? 'escuro' : 'claro'); pintarBotaoTema(); }
    else if (acao === 'mais') { mostrando += POR_PAGINA; ultimoHtml = ''; desenhar(); }
    else if (acao === 'plateia-abrir') PIH.plateia?.abrirAgora?.();
    else if (acao === 'torneio-conferir') PIH.torneio?.conferir?.();
    else if (acao.startsWith('religar:')) { PIH.cofre?.religar?.(acao.slice(8)); ultimoHtml = ''; desenhar(); }
    else if (PIH.auto?.acoes?.[acao]) Promise.resolve(PIH.auto.acoes[acao]()).finally(() => { ultimoHtml = ''; desenhar(); });
  }
  function aoMudarNoPainel(ev) {
    const el = ev.target;
    if (!el.matches('[data-definir]') || el.disabled) return;
    let v = el.value;
    if (el.type === 'number') {
      // vazio ou inválido não vira 0; vale o mínimo e o máximo do campo
      const n = el.value.trim() === '' ? NaN : Number(el.value);
      if (!Number.isFinite(n)) { ultimoHtml = ''; desenhar(); return; }
      v = Math.max(el.min !== '' ? Number(el.min) : -Infinity, el.max !== '' ? Math.min(Number(el.max), n) : n);
    }
    rotear(el.dataset.definir, v);
  }

  function posicionarPainel() {
    if (!painel) return;
    const base = document.getElementById('p-ativo')?.getBoundingClientRect() ?? botao.getBoundingClientRect();
    const larg = painel.offsetWidth || 900;
    let left = base.right + 10;
    let top = Math.max(8, base.top - 40);
    if (left + larg > innerWidth - 8) {
      // Sem espaço ao lado: o painel desce para baixo da barra, para nunca cobri-la.
      left = Math.max(8, innerWidth - larg - 8);
      if (left < base.right) top = botao.getBoundingClientRect().bottom + 8;
    }
    top = Math.min(top, Math.max(8, innerHeight - painel.offsetHeight - 8));
    painel.style.left = `${left}px`;
    painel.style.top = `${top}px`;
  }

  /** O topo e o menu: quem está em campo, o modo, a aba e os números das abas. */
  function pintarMoldura() {
    if (!painel) return;
    const pk = pkAtivo();
    const h = (welcome?.hunts ?? []).find((x) => x.slug === eu?.huntSlug);
    const sub = painel.querySelector('[data-sub]');
    const txt = pk ? `${pk.nome}, Nv ${num(pk.level ?? 1)}${h ? ` em ${h.nome}` : eu?.noCentro ? ' no Centro' : ''}` : 'nenhum pokémon em campo';
    if (sub && sub.textContent !== txt) sub.textContent = txt;
    const cof = PIH.cofre?.resumo?.();
    const modo = modoAtual();
    if (painel.dataset.modo !== modo) painel.dataset.modo = modo;
    for (const b of painel.querySelectorAll('.plt-modo-bt[data-modo]')) {
      const on = b.dataset.modo === modo;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of painel.querySelectorAll('.cfg-cat[data-aba]')) {
      const on = b.dataset.aba === prefs.aba;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    const n = painel.querySelector('[data-n="mercado"]');
    if (n) { n.hidden = !(radar?.avisos > 0); n.textContent = radar?.avisos ?? ''; }
    const nc = painel.querySelector('[data-n="cofre"]');
    if (nc) { const d = cof?.desligados?.length ?? 0; nc.hidden = !d; nc.textContent = d ? '!' : ''; }
    const v = document.documentElement.dataset.pilotoVersao;
    const campoV = painel.querySelector('[data-versao]');
    if (v && campoV && !campoV.textContent) { campoV.textContent = `v${v}`; campoV.closest('a').title = `PokeIdle Piloto v${v} · abrir o GitHub do Dreds`; }
  }
  function pintarCabecalho(aba) {
    const def = ABAS.find(([k]) => k === aba) ?? ABAS[0];
    const t = painel.querySelector('[data-titulo]');
    if (t.textContent !== def[1]) { t.textContent = def[1]; painel.querySelector('[data-cab-ico]').innerHTML = ico(def[2], 'dlg-svg'); }
    const modo = modoAtual();
    const txt = { desligado: 'Off · tudo parado', manual: 'Manual · você ajusta', automatico: 'Auto · o Piloto calcula' }[modo];
    const m = painel.querySelector('[data-cab-modo]');
    if (m.textContent !== txt) { m.textContent = txt; m.dataset.modo = modo; }
  }

  // ---- Mercado: o painel do Radar encaixado aqui --------------------------------------------
  let mercadoMontado = false;
  function montarMercado(alvo) {
    if (!alvo.querySelector('#piloto-slot-mercado')) {
      alvo.innerHTML = '<div id="piloto-slot-mercado" class="plt-slot"><div class="pih-carga">Abrindo o Radar…</div></div>';
    }
    mercadoMontado = true;
    publicarContexto(true); // o modo chega antes: o Radar já se desenha no jeito certo
    document.dispatchEvent(new CustomEvent('piloto:mercado-montar', { detail: '{}' }));
  }
  function soltarMercado() {
    if (!mercadoMontado) return;
    mercadoMontado = false;
    document.dispatchEvent(new CustomEvent('piloto:mercado-soltar', { detail: '{}' }));
  }

  // ---- Off: um aviso no topo de cada aba ---------------------------------------------------------
  const avisoOff = () => K.linha({ id: 'off', icone: 'fechar', nome: 'Piloto desligado', classe: 'plt-l-off', status: 'Nada automático roda. Escolha Manual ou Auto lá em cima para ligar.' });

  // ---- Resumo: a conta inteira numa tela -----------------------------------------------------
  function blocoResumo() {
    const pk = pkAtivo();
    const N = PIH.nivel;
    const medido = pk && N ? N.ritmoMedido(pk.id) : null;
    const cof = PIH.cofre?.resumo?.();
    const f = estadoDasFrentes();
    const a = PIH.auto?._interno.cfg();

    const xpTr = medido?.treinador ?? null;
    const proxTr = eu && N ? N.xpTotal((eu.level ?? 1) + 1) - (eu.xp ?? 0) : null;
    const etaTr = xpTr > 0 && proxTr > 0 ? duracao((proxTr / xpTr) * 3_600_000) : '—';
    const xpPk = medido?.pokemon ?? null;
    const proxPk = pk && N ? N.xpTotal((pk.level ?? 1) + 1) - (pk.xp ?? 0) : null;
    const etaPk = xpPk > 0 && proxPk > 0 ? duracao((proxPk / xpPk) * 3_600_000) : '—';
    const numeros = `<div class="plt-ks" title="${medido ? `Medido nos últimos ${medido.minutos} min de caça contínua` : 'Aparece depois de 5 min caçando com a aba aberta'}">
        ${K.numeroGrande({ icone: 'xp', rotulo: 'XP/h treinador', valor: xpTr != null ? curto(xpTr) : '—', sub: `Nv +1 em ${etaTr}`, classe: 'k-xp' })}
        ${K.numeroGrande({ icone: 'nivel', rotulo: `XP/h ${pk ? esc(pk.nome) : 'pokémon'}`, valor: xpPk != null ? curto(xpPk) : '—', sub: `Nv +1 em ${etaPk}`, classe: 'k-xp' })}
        ${K.numeroGrande({ icone: 'ouro', rotulo: 'Ouro/h', valor: medido ? curto(medido.ouro) : '—', sub: `saldo ${eu ? curto(Number(eu.gold) || 0) : '—'}`, classe: 'k-ouro' })}
        ${K.numeroGrande({ icone: 'gasto', rotulo: 'Gasto hoje', valor: cof ? curto(cof.gasto) : '—', sub: `teto ${cof ? curto(cof.teto) : '—'}`, classe: 'k-gasto', pct: cof && cof.teto > 0 ? cof.gasto / cof.teto : 0 })}
      </div>`;

    const itens = PIH.auto ? PIH.auto._interno.itensVigiados() : [];
    const baixos = itens.filter((it) => it.tem < (PIH.auto.alvoDe?.(it)?.min ?? 0));
    const prox = a?.hunt.ligado && PIH.auto.proximaAnalise ? Math.max(0, PIH.auto.proximaAnalise() - Date.now()) : null;
    const rot = rotinaLigadas();
    const pvpLig = rot.includes('PvP');
    const fr = (estado, icone, nome, status) => K.linha({ id: `res:${nome}`, icone, nome, status, direita: K.pilula(estado), classe: estado === 'on' ? 'plt-l-on' : '' });
    const frentes = [
      fr(f.hunt && a?.hunt.ligado ? f.hunt : '', 'cacar', 'Troca de hunt', a?.hunt.ligado ? `top 1 em ${prefs.ordem === 'ouro' ? 'Ouro/h' : 'XP/h'} · análise contínua${PIH.auto.ultimoResultado?.() ? ` · ${esc(PIH.auto.ultimoResultado())}` : ''}` : 'desligada'),
      fr(f.hunt && a?.repor.ligado ? (baixos.length ? 'pausa' : 'on') : '', 'repor', 'Reposição', a?.repor.ligado ? (itens.length ? (baixos.length ? `baixo: ${baixos.map((x) => x.nome).join(', ')}` : `${itens.length} itens em dia`) : 'marque bolas e poções no jogo') : 'desligada'),
      fr(f.rotina, 'rotina', 'Rotina', rot.filter((x) => x !== 'PvP').join(', ') || 'nada ligado'),
      ...(PIH.captura ? [(() => { const c = PIH.captura.resumo(); return fr(cof?.ligado && c.ligado && !c.vip ? 'on' : '', 'bola', 'Pokébola automática', PIH.captura.status()); })()] : []),
      ...(PIH.guarda ? [(() => { const g = PIH.guarda.resumo(); const on = cof?.ligado && radar?.revenda !== false; return fr(on ? (g.pronto ? 'on' : 'pausa') : '', 'mercado', 'Vender pokémon', g.pronto ? `${g.ids.length} guardados (time, PvP, treinar, shiny, lendário) · o resto vai ao Mercado` : esc(g.motivo || 'esperando')); })()] : []),
      ...(PIH.volta ? [(() => { const v = PIH.volta.resumo(); return fr(cof?.ligado && v.ligado ? (v.vivo ? 'on' : 'pausa') : '', 'voltar', 'Voltar se cair', PIH.volta.status()); })()] : []),
      fr(f.rotina && pvpLig ? f.rotina : '', 'pvp', 'PvP', pvpLig ? 'mesma equipe do time · fila' : 'desligado'),
      fr(f.radar, 'radar', 'Radar', radar ? `${radar.texto}${radar.avisos ? ` · ${radar.avisos} aviso${radar.avisos > 1 ? 's' : ''}` : ''}${radar.auto ? ` · comprou ${curto(radar.gastoAutoHoje ?? 0)} hoje` : ''}` : 'esperando'),
      fr(cof?.ligado ? (cof.desligados.length ? 'erro' : 'on') : '', 'cofre', 'Cofre', cof ? `reserva ${curto(cof.reserva)}${cof.pendente ? ` · ${curto(cof.pendente)} em uso` : ''}${cof.desligados.length ? ` · disjuntor: ${cof.desligados.join(', ')}` : ''}` : '—'),
    ].join('');

    const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const eventos = [...(PIH.cofre?.ultimos?.(8) ?? []), ...(PIH.auto?.diario?.() ?? []).slice(0, 8), ...diarioRadar.slice(0, 8)]
      .sort((x, y) => y.t - x.t).slice(0, 8);
    const ultimos = `<ul class="plt-diario">${eventos.length
      ? eventos.map((d) => `<li class="pih-d-${d.tipo}"><time>${hora(d.t)}</time>${esc(d.txt.replace(/^rotina: /, ''))}</li>`).join('')
      : '<li class="pih-dim">Nada ainda.</li>'}</ul>`;
    return `${numeros}${K.grupo('Automações')}${frentes}${K.grupo('Últimas ações')}${ultimos}`;
  }

  function blocoStats(pk) {
    if (!pk?.stats) return '';
    const rot = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spAtk', 'SP.ATK'], ['spDef', 'SP.DEF'], ['speed', 'SPD']];
    return `<div class="plt-caixa pih-stats">${rot.map(([k, r]) => `
      <div class="pih-stat"><b>${r}</b><span>${num(pk.stats[k] ?? 0)}</span>${pk.ivs?.[k] != null ? `<i>IV ${pk.ivs[k]}</i>` : ''}</div>`).join('')}
    </div>`;
  }

  /** Os bônus de XP que entraram na conta (multiplicam-se, como no jogo). */
  function blocoBonus(b) {
    if (!b) return '';
    const x = (v) => `×${v.toFixed(2).replace('.', ',')}`;
    const fmt = (i) => `${esc(i.nome)} ${i.mult >= 2 ? x(i.mult) : `+${(Math.round((i.mult - 1) * 1000) / 10).toString().replace('.', ',')}%`}`;
    const lista = b.itens.length ? b.itens.map(fmt).join(' · ') : 'nenhum bônus ativo';
    const iguais = Math.abs(b.pokemon - b.treinador) < 1e-6;
    return `<div class="plt-caixa pih-bonus" title="Os bônus se multiplicam entre si (Pokepédia → Níveis e XP)">
      <b>Bônus de XP:</b> ${lista}
      <span class="pih-bonus-total">${iguais ? x(b.pokemon) : `pokémon ${x(b.pokemon)} · treinador ${x(b.treinador)}`}</span>
    </div>`;
  }

  // ---- meta de nível ---------------------------------------------------------------------
  const dfQuando = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const quando = (ts) => dfQuando.format(ts);
  function duracao(ms) {
    const m = Math.max(0, Math.round(ms / 60_000));
    if (m < 1) return '<1 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
    const d = Math.floor(h / 24);
    return `${num(d)} d${h % 24 ? ` ${h % 24} h` : ''}`;
  }
  const nfc2 = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 });
  const grande = (v) => (Math.abs(v) >= 10000 ? nfc2.format(v) : num(v));
  const xV = (v) => `×${v.toFixed(2).replace('.', ',')}`;

  /** Instantes em que um bônus de XP vence (o ritmo muda só neles). */
  function cortesDeBonus(e) {
    const l = e?.loja ?? {};
    return [l.boosts?.xp, l.boosts?.pokexp, l.vipAte, e?.guild?.boostAte, Number(e?.kick?.bonus?.xp) || null, e?.evento?.terminaEm]
      .map(Number).filter((t) => Number.isFinite(t) && t > Date.now());
  }

  /** Os bônus que vencem antes de `ate`, com o nome — para avisar na tela. */
  function vencimentos(e, ate) {
    const l = e?.loja ?? {};
    const lista = [
      ['XP Boost', l.boosts?.xp, 'treinador'], ['XP Boost Pokémon', l.boosts?.pokexp, 'pokémon'], ['VIP', l.vipAte, 'os dois'],
      ['Boost da Guild', e?.guild?.boostAte, 'os dois'], ['Kick', Number(e?.kick?.bonus?.xp) || null, 'os dois'], ['Evento', e?.evento?.terminaEm, 'os dois'],
    ];
    return lista.map(([nome, t, quem]) => ({ nome, t: Number(t), quem }))
      .filter((v) => Number.isFinite(v.t) && v.t > Date.now() && v.t < ate)
      .sort((a, b) => a.t - b.t);
  }

  /** Níveis de treinador que abrem hunts novas (acima do nível atual), com quantas abrem. */
  function aberturas(nivelAtual) {
    const porNivel = new Map();
    for (const h of welcome?.hunts ?? []) {
      const n = Number(h.nivel);
      if (n > nivelAtual) porNivel.set(n, (porNivel.get(n) ?? 0) + 1);
    }
    return [...porNivel].sort((a, b) => a[0] - b[0]).map(([nivel, qtd]) => ({ nivel, qtd }));
  }

  /** Resolve de onde vem o XP/h: medido de verdade ou o modelo de uma hunt da lista. */
  function fonteDoRitmo(r, pk, manual) {
    const N = PIH.nivel;
    const viaveis = r.linhas.filter((l) => !l.inviavel);
    const medido = N.ritmoMedido(pk.id);
    const slugAtual = N.huntAtual();
    const linhaAtual = slugAtual ? viaveis.find((l) => l.slug === slugAtual) : null;
    const opcoes = [{ v: 'auto', rotulo: 'Automático' }];
    if (medido) opcoes.push({ v: 'medido', rotulo: `Medido agora (últimos ${medido.minutos} min)` });
    const lista = viaveis.slice(0, 15);
    if (linhaAtual && !lista.includes(linhaAtual)) lista.unshift(linhaAtual);
    for (const l of lista) opcoes.push({ v: `hunt:${l.slug}`, rotulo: `${l.nome} · Nv ${num(l.nivel)} (modelo${l === linhaAtual ? ', onde você está' : ''})` });
    let escolha = manual ? prefs.fonte : 'auto';
    if (escolha === 'medido' && !medido) escolha = 'auto';
    if (escolha.startsWith('hunt:') && !viaveis.some((l) => `hunt:${l.slug}` === escolha)) escolha = 'auto';
    let efetiva = escolha;
    if (escolha === 'auto') efetiva = medido ? 'medido' : linhaAtual ? `hunt:${linhaAtual.slug}` : viaveis[0] ? `hunt:${viaveis[0].slug}` : null;
    let fonte = null;
    if (efetiva === 'medido') {
      const b = r.bonusXp;
      const linhaRef = linhaAtual ?? viaveis[0];
      fonte = {
        tipo: 'medido',
        texto: `o que você fez nos últimos ${medido.minutos} min (mortes e idas ao Centro já entram)`,
        trBase: medido.treinador / (b?.treinador || 1),
        // o pokémon só conta o tempo com ELE em campo; sem 5 min dele ainda, usa o modelo da hunt
        pkBase: medido.pokemon != null ? medido.pokemon / (b?.pokemon || 1) : linhaRef ? linhaRef.kph * linhaRef.xpKill : 0,
        pkModelo: medido.pokemon == null,
      };
    } else if (efetiva) {
      const l = viaveis.find((x) => `hunt:${x.slug}` === efetiva);
      if (l) {
        const base = l.kph * l.xpKill;
        fonte = { tipo: 'modelo', texto: `modelo do /hunt em ${l.nome} (Nv ${num(l.nivel)}, ${num(l.kph)} abates/h; mortes não entram)`, trBase: base, pkBase: base };
      }
    }
    return { opcoes, escolha, fonte };
  }

  function cartaoMeta({ titulo, chave, nivel, xp, meta, base, multEm, cortes, fracao, extra = '', manual }) {
    const N = PIH.nivel;
    const agora = Date.now();
    const lista = N.marcos(nivel, meta);
    const alvos = [nivel + 1, ...lista].map((L) => N.xpTotal(L) - xp);
    const proj = N.projetar({ base, multEm, cortes, fracao, agora, alvos });
    const prox = proj[0];
    const fim = proj[proj.length - 1];
    const falta = Math.max(0, N.xpTotal(meta) - xp);
    const linhas = lista.map((L, i) => {
      const p = proj[i + 1];
      return `<tr><td>Nv ${num(L)}</td><td>${curto(N.xpTotal(L) - N.xpTotal(L - 1))}</td>
        <td>${p ? duracao(p.ms) : '—'}</td><td>${p ? quando(p.em) : '—'}</td></tr>`;
    }).join('');
    return `<div class="plt-caixa pih-meta-card">
      <div class="pih-meta-top">
        <b>${titulo}</b> <span class="pih-dim">Nv ${num(nivel)}</span>
        ${manual ? `<label class="plt-f plt-f-linha"><small>meta</small>${K.numero(`ui:${chave}`, meta, nivel + 1, null, 1)}</label>` : `<span class="pih-dim">meta Nv ${num(meta)}</span>`}
      </div>
      ${meta > nivel ? `
      <div class="pih-meta-num">
        <div><small>falta</small><strong>${grande(falta)} XP</strong></div>
        <div><small>tempo</small><strong>${fim ? duracao(fim.ms) : '—'}</strong></div>
        <div><small>chega</small><strong>${fim ? quando(fim.em) : '—'}</strong></div>
      </div>
      <div class="pih-meta-sub">próximo nível (${num(nivel + 1)}) em <b>${prox ? duracao(prox.ms) : '—'}</b>${extra}</div>
      ${manual ? `<table class="plt-tab pih-meta-tab"><thead><tr><th>Nível</th><th>XP do nível</th><th>Em</th><th>Quando</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : ''}` : '<div class="pih-meta-sub">Escolha uma meta acima do nível atual.</div>'}
    </div>`;
  }

  function blocoMeta(r, ctx, manual) {
    const e = eu;
    const pk = pkAtivo();
    if (!PIH.nivel || !e || !pk) return '<div class="pih-erro">Sem dados de nível ainda.</div>';
    const { opcoes, escolha, fonte } = fonteDoRitmo(r, pk, manual);
    if (!fonte) return '<div class="pih-erro">Nenhuma hunt viável para estimar o ritmo.</div>';
    const bonus = PIH.engine._interno.bonusXp;
    const cortes = cortesDeBonus(e);
    const fracao = manual ? Math.min(24, Math.max(0.5, Number(prefs.horasDia) || 24)) / 24 : 1;
    const ab = aberturas(e.level);
    const autoTr = ab[0]?.nivel ?? Math.ceil((e.level + 1) / 100) * 100;
    const metaTr = manual ? Math.max(e.level + 1, Math.round(Number(prefs.metaTr)) || autoTr) : Math.max(e.level + 1, autoTr);
    const metaPk = manual ? Math.max(pk.level + 1, Math.round(Number(prefs.metaPk)) || Math.max(pk.level + 1, metaTr)) : Math.max(pk.level + 1, Math.min(metaTr + 5, Math.ceil((pk.level + 1) / 100) * 100));
    const multTr = (t) => bonus(e, ctx, t).treinador;
    const multPk = (t) => bonus(e, ctx, t).pokemon;

    const abre = ab.slice(0, 3);
    const projAbre = PIH.nivel.projetar({ base: fonte.trBase, multEm: multTr, cortes, fracao, alvos: abre.map((a) => PIH.nivel.xpTotal(a.nivel) - e.xp) });
    const extraTr = abre.length
      ? `<br>abrem hunts novas: ${abre.map((a, i) => `<b>Nv ${num(a.nivel)}</b> (${a.qtd} hunt${a.qtd > 1 ? 's' : ''}) em ${projAbre[i] ? duracao(projAbre[i].ms) : '—'}`).join(' · ')}`
      : '';
    const extraPk = metaPk > metaTr + 5
      ? '<br><span class="pih-alerta">⚠ o pokémon só entra em campo até o nível do treinador + 5</span>'
      : (fonte.pkModelo ? '<br><span class="pih-dim">ritmo do pokémon pelo modelo da hunt (ainda sem 5 min medidos com ele)</span>' : '');

    const venc = vencimentos(e, Date.now() + 30 * 86_400_000);
    const avisoVenc = venc.length
      ? `<div class="pih-meta-sub">Já na conta: ${venc.map((v) => `<b>${esc(v.nome)}</b> (${v.quem}) acaba em ${duracao(v.t - Date.now())}`).join(' · ')}.</div>`
      : '';
    const controles = manual ? `<div class="plt-caixa plt-ajustes plt-ajustes-solto">
        ${K.fcampo('Ritmo', K.selecao('ui:fonte', escolha, opcoes.map((o) => [o.v, esc(o.rotulo)])))}
        ${K.fcampo('Caço (h/dia)', K.numero('ui:horasDia', Math.round(fracao * 48) / 2, 0.5, 24, 0.5), 'Os bônus vencem no relógio, cace ou não')}
      </div>` : '';
    return `${controles}
      <div class="pih-meta-sub pih-meta-fonte">XP/h agora: <b>${curto(fonte.trBase * r.bonusXp.treinador)}</b> do treinador · <b>${curto(fonte.pkBase * r.bonusXp.pokemon)}</b> do pokémon — ${esc(fonte.texto)}.</div>
      ${avisoVenc}
      <div class="pih-meta-grid">
        ${cartaoMeta({ titulo: 'Treinador', chave: 'metaTr', nivel: e.level, xp: e.xp, meta: metaTr, base: fonte.trBase, multEm: multTr, cortes, fracao, extra: extraTr, manual })}
        ${cartaoMeta({ titulo: esc(pk.nome), chave: 'metaPk', nivel: pk.level, xp: pk.xp, meta: metaPk, base: fonte.pkBase, multEm: multPk, cortes, fracao, extra: extraPk, manual })}
      </div>
      ${manual ? '<div class="pih-rodape">Curva do jogo: XP total do nível L = 50/3 × (L³ − 6L² + 17L − 12). O XP por abate depende só do nível do selvagem, então na mesma hunt o XP/h é fixo e cada nível pede mais. Bônus com prazo cortam o ritmo no instante em que vencem.</div>' : ''}`;
  }

  function controlesCacar() {
    return `<div class="plt-caixa plt-ajustes plt-ajustes-solto">
      ${K.fcampo('Ordenar por', K.escala('ui:ordem', prefs.ordem, [['xp', 'XP/h'], ['ouro', 'Ouro/h']]))}
      ${K.mini('ui:soLiberadas', prefs.soLiberadas, 'Só hunts liberadas')}
      ${K.mini('ui:comPocao', prefs.comPocao, 'Poção automática', 'Com a automação de poção ligada, só morre quem leva um golpe maior que o HP inteiro')}
    </div>`;
  }

  function risco(l) {
    if (l.umHit) return '<span class="pih-perigo" title="Um golpe do selvagem passa do seu HP">☠ 1 hit</span>';
    // 1.33: os desmaios levam mais XP do treinador (10% do nível cada) do que a hunt dá
    if (l.perdeXp) return `<span class="pih-perigo" title="Perde ${curto(l.xpPerdidoH)} de XP do treinador por hora em desmaios (10% do nível cada) e ganha ${curto(l.xpTreinadorBrutoH)}">☠ XP</span>`;
    // 1.33: gasta mais em poção do que a hunt rende em ouro
    if (l.prejuizo) return `<span class="pih-perigo" title="Gasta ${curto(l.custoPocaoH)} de ouro/h em poção (${num(Math.round(l.pocoesH))} por hora) e a hunt rende ${curto(l.ouroBrutoH)}">💸 poção</span>`;
    if (l.mortesH >= 0.5) return `<span class="pih-perigo" title="Mortes estimadas por hora">☠ ${l.mortesH.toFixed(1).replace('.', ',')}/h</span>`;
    const pct = Math.round(l.hitPct * 100);
    const oque = l.engajados > 1.2
      ? `O pior momento (o golpe mais forte de um selvagem mais o golpe médio dos outros ${(l.engajados - 1).toFixed(1).replace('.', ',')} que o AoE segura em você) tira ${pct}% do seu HP`
      : `O pior golpe do selvagem tira ${pct}% do seu HP`;
    if (pct >= 50) return `<span class="pih-alerta" title="${oque}">⚠ ${pct}%</span>`;
    return `<span class="pih-ok" title="${oque}">✓ ${pct}%</span>`;
  }

  // 1.26.3: retrato que acabou de ficar pronto (sprite de verdade) → redesenha a aba Caçar
  PIH.on?.('arte.retrato-pronto', () => { if (painel && prefs.aba === 'hunts' && !digitando()) desenhar(); });
  // 1.17: o retrato do pokémon da hunt numa moldura redonda; clicar leva para a hunt.
  function retratoHunt(l) {
    const h = (welcome?.hunts ?? []).find((x) => x.slug === l.slug);
    const esp = h && Array.isArray(h.especies) && h.especies.length ? [...h.especies].sort((a, b) => (Number(b.pontos) || 0) - (Number(a.pontos) || 0))[0] : null;
    const img = esp && PIH.arte?.retrato ? PIH.arte.retrato(esp.pokeId, 30) : '';
    const aqui = l.slug === eu?.huntSlug && !eu?.noCentro;
    const off = modoAtual() === 'desligado';
    const pode = l.liberada && !aqui && !off;
    const dica = aqui ? 'Você está aqui' : !l.liberada ? 'Hunt ainda bloqueada para o seu nível' : off ? 'Com o Piloto em Off, use o mapa do jogo' : cfgAuto()?.hunt?.ligado
      ? `Ir para ${l.nome}. Com a Troca de hunt ligada, se esta não for a melhor, o Piloto volta para a melhor.`
      : `Ir para ${l.nome} (espera sair de combate)`;
    return `<button type="button" class="pih-retrato${aqui ? ' aqui' : ''}" data-ir-hunt="${esc(l.slug)}" title="${esc(dica)}" aria-label="${esc(dica)}"${pode ? '' : ' disabled'}>${img || `<span class="pih-retrato-ini">${esc(String(l.nome || '?').slice(0, 1))}</span>`}</button>`;
  }
  const cfgAuto = () => { try { return PIH.auto?._interno?.cfg?.(); } catch { return null; } };
  let topSlug = null;
  function linhaHtml(l, i) {
    const medido = l.kphMedido != null ? ` · você fez ${num(l.kphMedido)} abates/h aqui com este pokémon (referência; não muda o ranking)` : '';
    const aprox = l.aoe
      ? `<span class="pih-aprox" title="Estimativa com o TM AoE: ${l.engajados.toFixed(1).replace('.', ',')} selvagens em você ao mesmo tempo${l.geoMedida ? '' : '; geometria padrão'}${medido}">≈AoE</span>`
      : l.geoMedida
        ? (medido ? `<span class="pih-medido" title="Geometria medida em ondas cheias${medido}">●</span>` : '')
        : `<span class="pih-aprox" title="Geometria padrão (sem onda cheia medida nesta hunt)${medido}">≈</span>`;
    const cls = [l.slug === topSlug && !l.inviavel ? 'pih-top' : '', l.liberada ? '' : 'pih-bloq'].filter(Boolean).join(' ');
    const golpe = l.melhorGolpe ? `${esc(l.melhorGolpe.nome)} ×${l.efetividade.toFixed(2).replace('.', ',')}` : '';
    if (l.inviavel) {
      return `<tr class="${cls}"><td class="pih-pos">${i + 1}</td>
        <td class="pih-hunt"><b>${esc(l.nome)}</b><small>${regiao(l.regiao)} · Nv ${num(l.nivel)}</small></td>
        <td colspan="5"><span class="pih-perigo">${l.motivo === 'morre antes de matar' ? 'morre antes de matar' : 'não mata o selvagem'}</span></td></tr>`;
    }
    return `<tr class="${cls}" title="${esc(golpe)}">
      <td class="pih-pos">${i + 1}</td>
      <td class="pih-hunt">${retratoHunt(l)}<span class="pih-hunt-txt"><b>${esc(l.nome)}${l.slug === eu?.huntSlug && !eu?.noCentro ? ' <i class="pih-aqui">você está aqui</i>' : ''}</b><small>${regiao(l.regiao)} · Nv ${num(l.nivel)}${l.liberada ? '' : ' · 🔒'}</small></span></td>
      <td>${curto(prefs.ordem === 'ouro' ? l.ouroH : l.xpPokemonH)}</td>
      <td>${aprox}${num(l.kph)}</td>
      <td>${segundos(l.ttk)}</td>
      <td>${risco(l)}</td>
      <td>${curto(prefs.ordem === 'ouro' ? l.xpPokemonH : l.ouroH)}</td>
    </tr>`;
  }

  function corpo(r, jogo, manual) {
    // 1.32.2: com "Evitar risco" (o padrão), a lista segue a mesma regra da Troca de hunt — as sem
    // risco primeiro; as arriscadas (☠ 1 hit, mortes, golpe de 50%+) depois; as inviáveis no fim.
    // Antes uma hunt ☠ 1 hit aparecia em 1º com o 👑 em outra linha.
    const evitar = cfgAuto()?.hunt?.evitarRisco !== false;
    const arriscada = (l) => PIH.engine.arriscada(l);
    const grupo = (l) => (l.inviavel ? 2 : evitar && arriscada(l) ? 1 : 0);
    const linhas = r.linhas.map((l, i) => [l, i]).sort((a, b) => (grupo(a[0]) - grupo(b[0])) || (a[1] - b[1])).map((x) => x[0]);
    if (!linhas.length) return '<div class="pih-erro">Nenhuma hunt liberada para o seu nível de treinador.</div>';
    // 1.18: o 👑 é o mesmo destino da Troca de hunt (top 1 liberado, sem risco se "Evitar risco")
    const top = (PIH.auto?.melhorDe ? PIH.auto.melhorDe(linhas, prefs.ordem === 'ouro' ? 'ouro' : 'xp') : null) || linhas.find((l) => !l.inviavel);
    topSlug = top ? top.slug : null;
    const outro = prefs.ordem === 'ouro' ? 'XP/h' : 'Ouro/h';
    const limite = manual ? mostrando : 5;
    const melhor = top ? `<div class="plt-caixa pih-melhor">
        <span class="pih-coroa">👑</span>
        <div><strong>${esc(top.nome)}</strong> <span class="pih-dim">${regiao(top.regiao)} · Nv ${num(top.nivel)}</span><br>
        ${curto(top.xpPokemonH)} XP/h do pokémon · ${curto(top.xpTreinadorH)} XP/h do treinador · ${curto(top.ouroH)} ouro/h · ${num(top.kph)} abates/h${top.melhorGolpe ? ` · ${esc(top.melhorGolpe.nome)}` : ''}</div>
      </div>` : '';
    return `${melhor}
      <div class="plt-caixa pih-lista"><table class="plt-tab pih-tab">
        <thead><tr><th>#</th><th>Hunt</th><th>${prefs.ordem === 'ouro' ? 'Ouro/h' : 'XP/h'}</th><th>Abates/h</th><th>Mata em</th><th>Risco</th><th>${outro}</th></tr></thead>
        <tbody>${linhas.slice(0, limite).map(linhaHtml).join('')}</tbody>
      </table>
      ${manual && linhas.length > mostrando ? `<button type="button" class="cfg-escala-bt plt-mais" data-acao="mais">mostrar mais (${linhas.length - mostrando})</button>` : ''}
      </div>
      ${manual ? `<div class="pih-rodape">Dados do jogo ${jogo.versao ? `v${esc(jogo.versao)}` : 'no ar'} · ${r.linhas.length}/${r.total} hunts · cálculo em ${r.ms} ms · ranking com ondas cheias · geometria medida em ${PIH.geo?.huntsMedidas?.() ?? 0} hunts (≈ = padrão · ● = você já caçou aqui, passe o mouse)${r.aoe ? ` · TM AoE: ${r.aoe.alvosPorGolpe.toFixed(1).replace('.', ',')} alvos/golpe` : ''}</div>` : ''}`;
  }

  // Só um campo de digitar (número, texto, lista) segura a atualização; botão não.
  function digitando() {
    const a = document.activeElement;
    return !!(painel && a && painel.contains(a) && (a.matches('select, textarea') || (a.matches('input') && !/^(checkbox|radio|button)$/i.test(a.type))));
  }
  // Troca o conteúdo só se mudou: atualizar a cada segundo sem piscar nem perder o mouse.
  let ultimoHtml = '';
  let ultimaAba = '';
  function pintarSeMudou(alvo, aba, html) {
    if (aba === ultimaAba && html === ultimoHtml && alvo.childElementCount) return false;
    ultimaAba = aba;
    ultimoHtml = html;
    const rolagem = alvo.scrollTop;
    alvo.innerHTML = html;
    for (const l of alvo.querySelectorAll('.cfg-linha[data-linha]')) {
      if (abertas.has(l.dataset.linha)) { l.classList.add('aberta'); l.querySelector('.cfg-ajuda')?.setAttribute('aria-expanded', 'true'); }
    }
    alvo.scrollTop = rolagem;
    return true;
  }

  let desenhando = 0;
  async function desenhar() {
    if (!painel) return;
    pintarMoldura();
    const alvo = painel.querySelector('[data-conteudo]');
    const aba = ABAS.some(([k]) => k === prefs.aba) ? prefs.aba : 'resumo';
    alvo.dataset.aba = aba;
    pintarCabecalho(aba);
    const modo = modoAtual();
    const layout = layoutDo(modo);
    const manual = layout === 'manual';
    const topo = modo === 'desligado' ? avisoOff() : '';
    if (aba !== 'mercado') soltarMercado();
    if (aba === 'mercado') { ultimaAba = 'mercado'; ultimoHtml = ''; montarMercado(alvo); return; }
    if (aba === 'resumo') { pintarSeMudou(alvo, aba, topo + blocoResumo()); return; }
    if (aba === 'rotina') { pintarSeMudou(alvo, aba, topo + (PIH.rotina ? PIH.rotina.html(layout) : '') + (PIH.plateia ? PIH.plateia.linha(layout) : '') + (PIH.torneio ? PIH.torneio.linha(layout) : '')); return; }
    if (aba === 'cofre') { pintarSeMudou(alvo, aba, topo + (PIH.cofre ? PIH.cofre.html(layout) : '')); return; }
    const pk = pkAtivo();
    const linhasCaca = aba === 'hunts' ? `${PIH.auto ? PIH.auto.linhas(layout) : ''}${PIH.rotina && PIH.rotina.linhasCaca ? PIH.rotina.linhasCaca(layout) : ''}${PIH.captura ? PIH.captura.linha(layout) : ''}${PIH.volta ? PIH.volta.linha(layout) : ''}${K.grupo('Onde render mais')}` : '';
    if (!welcome || !eu) { pintarSeMudou(alvo, aba, `${topo}${linhasCaca}<div class="pih-carga">Esperando o jogo conectar…</div>`); return; }
    if (!pk) { pintarSeMudou(alvo, aba, `${topo}${linhasCaca}<div class="pih-erro">Coloque um pokémon em campo para ver onde caçar.</div>`); return; }
    const vez = ++desenhando;
    try {
      const jogo = await PIH.carregarJogo();
      if (!painel || prefs.aba !== aba || vez !== desenhando) return;
      const ctx = contexto(jogo, pk);
      const r = PIH.engine.analisar(pk, ctx, prefs);
      const html = aba === 'meta'
        ? `${topo}${blocoBonus(r.bonusXp)}${blocoMeta(r, ctx, manual)}`
        : `${topo}${linhasCaca}${manual ? `${blocoStats(r.pokemon)}${controlesCacar()}` : ''}${blocoBonus(r.bonusXp)}${corpo(r, jogo, manual)}`;
      pintarSeMudou(alvo, aba, html);
      assinatura = assinaturaDe(pk);
    } catch (err) {
      console.error('[piloto]', err);
      if (painel) pintarSeMudou(alvo, aba, `${topo}${linhasCaca}<div class="pih-erro">Não consegui calcular: ${esc(err.message)}</div>`);
    }
  }

  function contexto(jogo, pk) {
    const chave = PIH.geo?.chaveDoPokemon(pk);
    const precoItem = new Map(jogo.precoItem);
    for (const i of welcome.itensNossos ?? []) {
      if (i?.name && Number(i.npcPrice) > 0) precoItem.set(i.name, Number(i.npcPrice));
    }
    return {
      mod: jogo.mod,
      especies: jogo.especies,
      precoItem,
      hunts: welcome.hunts ?? [],
      consts: {
        tabelaTipos: welcome.tabelaTipos,
        ampliacaoHunt: welcome.ampliacaoHunt,
        multHpSelvagem: welcome.multHpSelvagem,
        multDanoSelvagem: welcome.multDanoSelvagem,
        tiposBoost: welcome.tiposBoost,
      },
      eu,
      bonusLootPct: lootPct(jogo, eu, welcome),
      geo: (slug) => PIH.geo?.daHunt(slug) ?? null,
      ritmoMedido: (slug) => (chave ? PIH.geo?.ritmoMedido(slug, chave) ?? null : null),
    };
  }
  function lootPct(jogo, e, w) {
    try {
      const evento = Date.now() < (e?.evento?.terminaEm ?? 0) ? Number(e.evento.farmPct ?? e.evento.lootPct) || 0 : 0;
      const v = jogo.mod.analyser.bonusLootPct?.(e ?? {}, Date.now(), w?.tiposBoost ?? [], evento);
      return Number.isFinite(v) ? v : 0;
    } catch { return 0; }
  }
  PIH.lootPct = lootPct;

  // Recalcula com o painel aberto só quando muda o que entra na conta (outro pokémon, nível
  // novo, refino, TM) — não a cada golpe recebido.
  const assinaturaDe = (pk) => (pk ? `${pk.id}|${pk.level}|${pk.tmElemental ?? ''}|${pk.tmAoe ?? ''}|${JSON.stringify(pk.stats)}` : '');

  // ---- ligação com o jogo ----------------------------------------------------------------
  function preaquecer() {
    const ocioso = root.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    ocioso(() => PIH.carregarJogo().catch((err) => console.warn('[pokeidle-hunt] pré-carga falhou', err)));
  }

  // O diário da automação e o do piloto mudam o que Automação, Cofre e Resumo mostram.
  const redesenharSe = (abas) => { if (painel && abas.includes(prefs.aba) && !digitando()) desenhar(); };
  PIH.on('auto.diario', () => redesenharSe(['hunts', 'resumo']));
  PIH.on('piloto.diario', () => { redesenharSe(['cofre', 'resumo']); pintarBarra(); });
  PIH.on('welcome', (m) => {
    welcome = m;
    preaquecer();
  });
  PIH.on('estado', (e) => {
    const primeiro = !eu;
    eu = e;
    posicionarBotao();
    if (primeiro) { setTimeout(() => verificar(0), 800); pintarBarra(); }
    if (painel) pintarMoldura();
    if (painel && prefs.aba === 'hunts' && assinatura && assinaturaDe(pkAtivo()) !== assinatura) desenhar();
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', vigiarCard, { once: true });
  else vigiarCard();
})(globalThis);
