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
      if (painel && prefs.aba === 'resumo' && !painel.contains(document.activeElement)) desenhar();
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
  function definirModo(modo) {
    if (!['desligado', 'manual', 'automatico'].includes(modo)) return;
    gravarJson(CHAVE_MODO, modo === 'desligado' ? (lerJson(CHAVE_MODO, 'manual') ?? 'manual') : modo);
    PIH.cofre?.definirLigado(modo !== 'desligado');
    if (modo === 'automatico') {
      PIH.cofre?.religarTudo?.();
      PIH.auto?.aplicar?.({ hunt: { ligado: true }, repor: { ligado: true } });
      PIH.rotina?.aplicar?.({ passe: true, xpshare: true, outland: true, pvp: true, depotVender: true });
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
    const d = JSON.stringify({ ouroH: Number(cof.ouroH) || 0, teto: Number(cof.teto) || 0, livre });
    if (!forcar && d === contextoPublicado) return;
    contextoPublicado = d;
    document.dispatchEvent(new CustomEvent('piloto:contexto', { detail: d }));
  }
  setInterval(publicarContexto, 5_000);
  setTimeout(() => {
    publicarContexto(true);
    // O modo é quem manda: no Automático, o Radar volta ao perfil automático a cada carga da página
    // (antes, 3 falhas desligavam a compra dele e ela ficava desligada com o Piloto em Automático).
    if (modoAtual() === 'automatico') document.dispatchEvent(new CustomEvent('piloto:modo', { detail: JSON.stringify({ modo: 'automatico' }) }));
    // 1.10, uma vez: quem já estava no Automático passa a vender o Depot sozinho (pedido do André).
    if (modoAtual() === 'automatico' && !lerJson('piloto:migr:depot110', false)) {
      gravarJson('piloto:migr:depot110', true);
      PIH.rotina?.aplicar?.({ depotVender: true });
    }
  }, 3000);
  // Desligou a compra automática no Mercado: o Piloto passa a Manual (para não religar sozinho).
  document.addEventListener('piloto:radar-manual', () => {
    if (modoAtual() === 'automatico') { gravarJson(CHAVE_MODO, 'manual'); pintarBarra(); }
  });

  // ---- o painel ------------------------------------------------------------------------
  const ABAS = [
    ['resumo', 'Resumo', 'resumo'], ['hunts', 'Caçar', 'cacar'], ['meta', 'Nível', 'nivel'], ['auto', 'Auto', 'auto'],
    ['rotina', 'Rotina', 'rotina'], ['mercado', 'Mercado', 'mercado'], ['cofre', 'Cofre', 'cofre'],
  ];
  let painel = null;
  let mostrando = POR_PAGINA;
  let assinatura = '';
  let relogio = 0;
  const inicioSessao = Date.now();

  function alternarPainel() {
    if (painel) return fecharPainel();
    painel = document.createElement('div');
    painel.className = 'plt-painel';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-label', 'Piloto');
    painel.innerHTML = `
      <header class="plt-cab">
        <span class="plt-titulo">${ico('leme')}Piloto</span>
        <span class="plt-sub" data-sub></span>
        <div class="plt-modo" role="group" aria-label="Modo do Piloto">
          <button type="button" data-modo="desligado" title="Desligado: nada automático sai, nem a compra do Radar">${ico('fechar')}<span>Off</span></button>
          <button type="button" data-modo="manual" title="Manual: só o que você ligar em cada aba; o Radar só avisa">${ico('escudo')}<span>Manual</span></button>
          <button type="button" data-modo="automatico" title="Automático: troca de hunt, reposição, Passe, XP Share, Outland, PvP e o Radar comprando e revendendo em ouro, dentro do cofre">${ico('leme')}<span>Auto</span></button>
        </div>
        <button type="button" class="plt-fechar plt-tema" data-acao="tema"></button>
        <button type="button" class="plt-fechar" data-acao="fechar" aria-label="Fechar (Esc)" title="Fechar (Esc)">${ico('fechar')}</button>
      </header>
      <div class="plt-corpo">
        <nav class="plt-nav" aria-label="Seções">${ABAS.map(([k, r, i]) => `<button type="button" data-aba="${k}" title="${r}">${ico(i)}<span>${r}</span><b data-n="${k}" hidden></b></button>`).join('')}
          ${PIH.idioma ? PIH.idioma.bandeiras() : ''}
          <a class="plt-assinatura" href="https://github.com/DredsGG" target="_blank" rel="noopener noreferrer" title="Abrir o GitHub do Dreds" aria-label="Feito por Dreds: abrir o GitHub"><i class="plt-rebite" aria-hidden="true"></i><small>feito por</small><b>Dreds</b><em data-versao></em><i class="plt-rebite" aria-hidden="true"></i></a>
        </nav>
        <section class="plt-conteudo" data-conteudo></section>
      </div>`;
    document.body.append(painel);
    painel.querySelector('[data-acao="fechar"]').addEventListener('click', fecharPainel);
    pintarBotaoTema();
    painel.querySelector('[data-acao="tema"]').addEventListener('click', () => { definirTema(temaAtual() === 'claro' ? 'escuro' : 'claro'); pintarBotaoTema(); });
    for (const b of painel.querySelectorAll('[data-modo]')) b.addEventListener('click', () => { definirModo(b.dataset.modo); desenhar(); });
    for (const b of painel.querySelectorAll('[data-idioma]')) b.addEventListener('click', () => {
      PIH.idioma?.definir(b.dataset.idioma);
      for (const x of painel.querySelectorAll('[data-idioma]')) x.setAttribute('aria-pressed', String(x === b));
      desenhar();
    });
    for (const b of painel.querySelectorAll('.plt-nav [data-aba]')) {
      b.addEventListener('click', () => { prefs.aba = b.dataset.aba; gravarJson(CHAVE_PREFS, prefs); mostrando = POR_PAGINA; desenhar(); });
    }
    pintarMoldura();
    posicionarPainel();
    desenhar();
    addEventListener('keydown', aoTeclar, true);
    setTimeout(() => addEventListener('pointerdown', aoClicarFora, true));
    // Tempo real (1.12.2): Resumo, Cofre, Automação e Rotina conferem a cada 1 s e só trocam o
    // que mudou (sem piscar); Nível refaz a cada 10 s. Não refaz enquanto você digita num campo
    // (antes, qualquer clique num botão do painel travava a atualização até clicar fora).
    let voltas = 0;
    relogio = setInterval(() => {
      if (!painel || digitando()) return;
      voltas++;
      if (['resumo', 'auto', 'rotina', 'cofre'].includes(prefs.aba)) desenhar();
      else if (prefs.aba === 'meta' && voltas % 10 === 0) desenhar();
    }, 1_000);
  }
  function fecharPainel() {
    clearInterval(relogio);
    soltarMercado();
    painel?.remove();
    painel = null;
    assinatura = '';
    removeEventListener('keydown', aoTeclar, true);
    removeEventListener('pointerdown', aoClicarFora, true);
  }
  const aoTeclar = (ev) => { if (ev.key === 'Escape') fecharPainel(); };
  const aoClicarFora = (ev) => {
    const caminho = ev.composedPath();
    if (painel && !caminho.includes(painel) && !caminho.includes(botao)) fecharPainel();
  };

  function posicionarPainel() {
    if (!painel) return;
    const base = document.getElementById('p-ativo')?.getBoundingClientRect() ?? botao.getBoundingClientRect();
    const larg = painel.offsetWidth || 760;
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

  /** O cabeçalho e o menu: quem está em campo, onde, o interruptor geral e os números das abas. */
  function pintarMoldura() {
    if (!painel) return;
    const pk = pkAtivo();
    const h = (welcome?.hunts ?? []).find((x) => x.slug === eu?.huntSlug);
    const sub = painel.querySelector('[data-sub]');
    if (sub) {
      sub.textContent = pk
        ? `${pk.nome}, Nv ${num(pk.level ?? 1)}${h ? ` em ${h.nome}` : eu?.noCentro ? ' no Centro' : ''}`
        : 'nenhum pokémon em campo';
    }
    const cof = PIH.cofre?.resumo?.();
    const modo = modoAtual();
    for (const b of painel.querySelectorAll('[data-modo]')) b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
    painel.classList.toggle('plt-desligado', !cof?.ligado);
    for (const b of painel.querySelectorAll('.plt-nav [data-aba]')) b.setAttribute('aria-current', String(b.dataset.aba === prefs.aba));
    const n = painel.querySelector('[data-n="mercado"]');
    if (n) { n.hidden = !(radar?.avisos > 0); n.textContent = radar?.avisos ?? ''; }
    const nc = painel.querySelector('[data-n="cofre"]');
    if (nc) { const d = cof?.desligados?.length ?? 0; nc.hidden = !d; nc.textContent = d ? '!' : ''; }
  }

  // ---- Mercado: o painel do Radar encaixado aqui --------------------------------------------
  let mercadoMontado = false;
  function montarMercado(alvo) {
    if (!alvo.querySelector('#piloto-slot-mercado')) {
      alvo.innerHTML = '<div id="piloto-slot-mercado" class="plt-slot"><div class="pih-carga">Abrindo o Radar…</div></div>';
    }
    mercadoMontado = true;
    document.dispatchEvent(new CustomEvent('piloto:mercado-montar', { detail: '{}' }));
  }
  function soltarMercado() {
    if (!mercadoMontado) return;
    mercadoMontado = false;
    document.dispatchEvent(new CustomEvent('piloto:mercado-soltar', { detail: '{}' }));
  }

  // ---- Resumo: a conta inteira numa tela -----------------------------------------------------
  const PILULA = { on: 'ON', pausa: 'PAUSA', erro: 'ERRO', '': 'OFF' };
  function frente(estado, icone, nome, detalhe) {
    return `<li class="plt-frente" data-estado="${estado}" title="${esc(detalhe)}">${ico(icone)}<b>${esc(nome)}</b><i class="plt-pill">${PILULA[estado] ?? 'OFF'}</i><span>${esc(detalhe)}</span></li>`;
  }
  function kpi(classe, icone, rotulo, valor, sub, pct = null) {
    return `<div class="plt-kpi ${classe}">${ico(icone)}<small>${rotulo}</small><strong>${valor}</strong><em>${sub}</em>${pct == null ? '' : `<div class="plt-barrinha"><span style="width:${Math.round(Math.min(1, pct) * 100)}%"></span></div>`}</div>`;
  }
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
    const numeros = `<div class="plt-kpis" title="${medido ? `Medido nos últimos ${medido.minutos} min de caça contínua` : 'Aparece depois de 5 min caçando com a aba aberta'}">
        ${kpi('k-xp', 'xp', 'XP/h treinador', xpTr != null ? curto(xpTr) : '—', `Nv +1 em ${etaTr}`)}
        ${kpi('k-xp', 'nivel', `XP/h ${pk ? esc(pk.nome) : 'pokémon'}`, xpPk != null ? curto(xpPk) : '—', `Nv +1 em ${etaPk}`)}
        ${kpi('k-ouro', 'ouro', 'Ouro/h', medido ? curto(medido.ouro) : '—', `saldo ${eu ? curto(Number(eu.gold) || 0) : '—'}`)}
        ${kpi('k-gasto', 'gasto', 'Gasto hoje', cof ? curto(cof.gasto) : '—', `teto ${cof ? curto(cof.teto) : '—'}`, cof && cof.teto > 0 ? cof.gasto / cof.teto : 0)}
      </div>`;

    const itens = PIH.auto ? PIH.auto._interno.itensVigiados() : [];
    const baixos = itens.filter((it) => it.tem < (PIH.auto.alvoDe?.(it)?.min ?? 0));
    const prox = a?.hunt.ligado && PIH.auto.proximaAnalise ? Math.max(0, PIH.auto.proximaAnalise() - Date.now()) : null;
    const rot = rotinaLigadas();
    const pvpLig = rot.includes('PvP');
    const frentes = `<ul class="plt-frentes">
        ${frente(f.hunt && a?.hunt.ligado ? f.hunt : '', 'cacar', 'Troca de hunt', a?.hunt.ligado ? `${a.hunt.criterio === 'ouro' ? 'Ouro/h' : 'XP/h'} · análise ${prox == null ? 'agora' : `em ${duracao(prox)}`}` : 'desligada')}
        ${frente(f.hunt && a?.repor.ligado ? (baixos.length ? 'pausa' : 'on') : '', 'repor', 'Reposição', a?.repor.ligado ? (itens.length ? (baixos.length ? `baixo: ${baixos.map((x) => x.nome).join(', ')}` : `${itens.length} itens em dia`) : 'marque bolas e poções no jogo') : 'desligada')}
        ${frente(f.rotina, 'rotina', 'Rotina', rot.filter((x) => x !== 'PvP').join(', ') || 'nada ligado')}
        ${frente(f.rotina && pvpLig ? f.rotina : '', 'pvp', 'PvP', pvpLig ? 'equipe por Poder · fila' : 'desligado')}
        ${frente(f.radar, 'radar', 'Radar', radar ? `${radar.texto}${radar.avisos ? ` · ${radar.avisos} aviso${radar.avisos > 1 ? 's' : ''}` : ''}${radar.auto ? ` · comprou ${curto(radar.gastoAutoHoje ?? 0)} hoje` : ''}` : 'esperando')}
        ${frente(cof?.ligado ? (cof.desligados.length ? 'erro' : 'on') : '', 'cofre', 'Cofre', cof ? `reserva ${curto(cof.reserva)}${cof.pendente ? ` · ${curto(cof.pendente)} em uso` : ''}${cof.desligados.length ? ` · disjuntor: ${cof.desligados.join(', ')}` : ''}` : '—')}
      </ul>`;

    const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const eventos = [...(PIH.cofre?.ultimos?.(8) ?? []), ...(PIH.auto?.diario?.() ?? []).slice(0, 8), ...diarioRadar.slice(0, 8)]
      .sort((x, y) => y.t - x.t).slice(0, 8);
    const ultimos = `<ol class="plt-ultimos">${eventos.length
      ? eventos.map((d) => `<li class="pih-d-${d.tipo}"><time>${hora(d.t)}</time>${esc(d.txt.replace(/^rotina: /, ''))}</li>`).join('')
      : '<li class="pih-dim">Nada ainda.</li>'}</ol>`;

    const modo = { desligado: 'Off', manual: 'Manual', automatico: 'Auto' }[modoAtual()];
    return `<div class="plt-resumo">
        ${numeros}
        <div class="plt-secao">Automações · ${modo}</div>${frentes}
        <div class="plt-secao">Últimas ações</div>${ultimos}
      </div>`;
  }

  function blocoStats(pk) {
    if (!pk?.stats) return '';
    const rot = [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spAtk', 'SP.ATK'], ['spDef', 'SP.DEF'], ['speed', 'SPD']];
    return `<div class="pih-vao pih-stats">${rot.map(([k, r]) => `
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
    return `<div class="pih-vao pih-bonus" title="Os bônus se multiplicam entre si (Pokepédia → Níveis e XP)">
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
  function fonteDoRitmo(r, pk) {
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
    let escolha = prefs.fonte;
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

  function cartaoMeta({ titulo, chave, nivel, xp, meta, base, multEm, cortes, fracao, extra = '' }) {
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
    return `<div class="pih-vao pih-meta-card">
      <div class="pih-meta-top">
        <b>${titulo}</b> <span class="pih-dim">Nv ${num(nivel)}</span>
        <label class="pih-meta-alvo">meta Nv <input type="number" min="${nivel + 1}" step="1" value="${meta}" data-meta="${chave}"></label>
      </div>
      ${meta > nivel ? `
      <div class="pih-meta-num">
        <div><small>falta</small><strong>${grande(falta)} XP</strong></div>
        <div><small>tempo</small><strong>${fim ? duracao(fim.ms) : '—'}</strong></div>
        <div><small>chega</small><strong>${fim ? quando(fim.em) : '—'}</strong></div>
      </div>
      <div class="pih-meta-sub">próximo nível (${num(nivel + 1)}) em <b>${prox ? duracao(prox.ms) : '—'}</b>${extra}</div>
      <table class="pih-tab pih-meta-tab"><thead><tr><th>Nível</th><th>XP do nível</th><th>Em</th><th>Quando</th></tr></thead>
        <tbody>${linhas}</tbody></table>` : '<div class="pih-meta-sub">Escolha uma meta acima do nível atual.</div>'}
    </div>`;
  }

  function blocoMeta(r, ctx) {
    const e = eu;
    const pk = pkAtivo();
    if (!PIH.nivel || !e || !pk) return '<div class="pih-erro">Sem dados de nível ainda.</div>';
    const { opcoes, escolha, fonte } = fonteDoRitmo(r, pk);
    if (!fonte) return '<div class="pih-erro">Nenhuma hunt viável para estimar o ritmo.</div>';
    const bonus = PIH.engine._interno.bonusXp;
    const cortes = cortesDeBonus(e);
    const fracao = Math.min(24, Math.max(0.5, Number(prefs.horasDia) || 24)) / 24;
    const ab = aberturas(e.level);
    const metaTr = Math.max(e.level + 1, Math.round(Number(prefs.metaTr)) || (ab[0]?.nivel ?? Math.ceil((e.level + 1) / 100) * 100));
    const metaPk = Math.max(pk.level + 1, Math.round(Number(prefs.metaPk)) || Math.max(pk.level + 1, metaTr));
    const multTr = (t) => bonus(e, ctx, t).treinador;
    const multPk = (t) => bonus(e, ctx, t).pokemon;

    // As próximas hunts que abrem, com quando chegam, na linha do treinador.
    const abre = ab.slice(0, 3);
    const projAbre = PIH.nivel.projetar({ base: fonte.trBase, multEm: multTr, cortes, fracao, alvos: abre.map((a) => PIH.nivel.xpTotal(a.nivel) - e.xp) });
    const extraTr = abre.length
      ? `<br>abrem hunts novas: ${abre.map((a, i) => `<b>Nv ${num(a.nivel)}</b> (${a.qtd} hunt${a.qtd > 1 ? 's' : ''}) em ${projAbre[i] ? duracao(projAbre[i].ms) : '—'}`).join(' · ')}`
      : '';
    const extraPk = metaPk > metaTr + 5
      ? '<br><span class="pih-alerta">⚠ o pokémon só entra em campo até o nível do treinador + 5</span>'
      : (fonte.pkModelo ? '<br><span class="pih-dim">ritmo do pokémon pelo modelo da hunt (ainda sem 5 min medidos com ele)</span>' : '');

    const horizonte = Date.now() + 30 * 86_400_000;
    const venc = vencimentos(e, horizonte);
    const avisoVenc = venc.length
      ? `<div class="pih-meta-sub">Já na conta: ${venc.map((v) => `<b>${esc(v.nome)}</b> (${v.quem}) acaba em ${duracao(v.t - Date.now())}`).join(' · ')}.
         Agora: treinador ${xV(r.bonusXp.treinador)} · pokémon ${xV(r.bonusXp.pokemon)}.</div>`
      : '';

    return `<div class="pih-ctrl pih-meta-ctrl">
        <label>ritmo <select data-fonte>${opcoes.map((o) => `<option value="${esc(o.v)}" ${o.v === escolha ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('')}</select></label>
        <label title="Os bônus vencem no relógio, cace ou não">caço <input type="number" min="0.5" max="24" step="0.5" value="${Math.round(fracao * 48) / 2}" data-horas> h/dia</label>
      </div>
      <div class="pih-meta-sub pih-meta-fonte">XP/h agora: <b>${curto(fonte.trBase * r.bonusXp.treinador)}</b> do treinador · <b>${curto(fonte.pkBase * r.bonusXp.pokemon)}</b> do pokémon — ${esc(fonte.texto)}.</div>
      ${avisoVenc}
      <div class="pih-meta-grid">
        ${cartaoMeta({ titulo: 'Treinador', chave: 'metaTr', nivel: e.level, xp: e.xp, meta: metaTr, base: fonte.trBase, multEm: multTr, cortes, fracao, extra: extraTr })}
        ${cartaoMeta({ titulo: esc(pk.nome), chave: 'metaPk', nivel: pk.level, xp: pk.xp, meta: metaPk, base: fonte.pkBase, multEm: multPk, cortes, fracao, extra: extraPk })}
      </div>
      <div class="pih-rodape">Curva do jogo: XP total do nível L = 50/3 × (L³ − 6L² + 17L − 12). O XP por abate depende só do nível do selvagem, então na mesma hunt o XP/h é fixo e cada nível pede mais. Bônus com prazo cortam o ritmo no instante em que vencem.</div>`;
  }

  function controles() {
    return `<div class="pih-ctrl">
      <span class="pih-seg">
        <button type="button" data-ordem="xp" class="${prefs.ordem === 'xp' ? 'on' : ''}">XP/h</button>
        <button type="button" data-ordem="ouro" class="${prefs.ordem === 'ouro' ? 'on' : ''}">Ouro/h</button>
      </span>
      <label><input type="checkbox" data-pref="soLiberadas" ${prefs.soLiberadas ? 'checked' : ''}> só hunts liberadas</label>
      <label title="Com a automação de poção ligada, só morre quem leva um golpe maior que o HP inteiro"><input type="checkbox" data-pref="comPocao" ${prefs.comPocao ? 'checked' : ''}> poção automática</label>
      ${prefs.ordem === 'ouro' ? '<button type="button" class="pih-ajuda" data-acao="ajuda-ouro" aria-expanded="false" aria-controls="pih-dica-ouro" title="O que entra no ouro/h">?</button>' : ''}
    </div>
    ${prefs.ordem === 'ouro' ? `<div class="pih-vao pih-dica" id="pih-dica-ouro" hidden>
      O ouro/h é o <b>ouro de cada abate</b> com o <b>bônus de loot</b> (o loot vendável saiu do jogo em 15/10/2026),
      já com Loot Boost, guild e evento ativos. A <b>venda dos pokémon capturados</b> e as pedras não entram.
    </div>` : ''}`;
  }

  function risco(l) {
    if (l.umHit) return '<span class="pih-perigo" title="Um golpe do selvagem passa do seu HP">☠ 1 hit</span>';
    if (l.mortesH >= 0.5) return `<span class="pih-perigo" title="Mortes estimadas por hora">☠ ${l.mortesH.toFixed(1).replace('.', ',')}/h</span>`;
    const pct = Math.round(l.hitPct * 100);
    const oque = l.engajados > 1.2
      ? `O pior momento (o golpe mais forte de um selvagem mais o golpe médio dos outros ${(l.engajados - 1).toFixed(1).replace('.', ',')} que o AoE segura em você) tira ${pct}% do seu HP`
      : `O pior golpe do selvagem tira ${pct}% do seu HP`;
    if (pct >= 50) return `<span class="pih-alerta" title="${oque}">⚠ ${pct}%</span>`;
    return `<span class="pih-ok" title="${oque}">✓ ${pct}%</span>`;
  }

  function linhaHtml(l, i) {
    const medido = l.kphMedido != null ? ` · você fez ${num(l.kphMedido)} abates/h aqui com este pokémon (referência; não muda o ranking)` : '';
    const aprox = l.aoe
      ? `<span class="pih-aprox" title="Estimativa com o TM AoE: ${l.engajados.toFixed(1).replace('.', ',')} selvagens em você ao mesmo tempo${l.geoMedida ? '' : '; geometria padrão'}${medido}">≈AoE</span>`
      : l.geoMedida
        ? (medido ? `<span class="pih-medido" title="Geometria medida em ondas cheias${medido}">●</span>` : '')
        : `<span class="pih-aprox" title="Geometria padrão (sem onda cheia medida nesta hunt)${medido}">≈</span>`;
    const cls = [i === 0 && !l.inviavel ? 'pih-top' : '', l.liberada ? '' : 'pih-bloq'].filter(Boolean).join(' ');
    const golpe = l.melhorGolpe ? `${esc(l.melhorGolpe.nome)} ×${l.efetividade.toFixed(2).replace('.', ',')}` : '';
    if (l.inviavel) {
      return `<tr class="${cls}"><td class="pih-pos">${i + 1}</td>
        <td class="pih-hunt"><b>${esc(l.nome)}</b><small>${regiao(l.regiao)} · Nv ${num(l.nivel)}</small></td>
        <td colspan="5"><span class="pih-perigo">não mata o selvagem</span></td></tr>`;
    }
    return `<tr class="${cls}" title="${esc(golpe)}">
      <td class="pih-pos">${i + 1}</td>
      <td class="pih-hunt"><b>${esc(l.nome)}</b><small>${regiao(l.regiao)} · Nv ${num(l.nivel)}${l.liberada ? '' : ' · 🔒'}</small></td>
      <td>${curto(prefs.ordem === 'ouro' ? l.ouroH : l.xpPokemonH)}</td>
      <td>${aprox}${num(l.kph)}</td>
      <td>${segundos(l.ttk)}</td>
      <td>${risco(l)}</td>
      <td>${curto(prefs.ordem === 'ouro' ? l.xpPokemonH : l.ouroH)}</td>
    </tr>`;
  }

  function corpo(r, jogo) {
    const linhas = r.linhas;
    if (!linhas.length) return '<div class="pih-erro">Nenhuma hunt liberada para o seu nível de treinador.</div>';
    const top = linhas.find((l) => !l.inviavel);
    const outro = prefs.ordem === 'ouro' ? 'XP/h' : 'Ouro/h';
    const melhor = top ? `<div class="pih-vao pih-melhor">
        <span class="pih-coroa">👑</span>
        <div><strong>${esc(top.nome)}</strong> <span class="pih-dim">${regiao(top.regiao)} · Nv ${num(top.nivel)}</span><br>
        ${curto(top.xpPokemonH)} XP/h do pokémon · ${curto(top.xpTreinadorH)} XP/h do treinador · ${curto(top.ouroH)} ouro/h · ${num(top.kph)} abates/h${top.melhorGolpe ? ` · ${esc(top.melhorGolpe.nome)}` : ''}</div>
      </div>` : '';
    return `${melhor}
      <div class="pih-vao pih-lista"><table class="pih-tab">
        <thead><tr><th>#</th><th>Hunt</th><th>${prefs.ordem === 'ouro' ? 'Ouro/h' : 'XP/h'}</th><th>Abates/h</th><th>Mata em</th><th>Risco</th><th>${outro}</th></tr></thead>
        <tbody>${linhas.slice(0, mostrando).map(linhaHtml).join('')}</tbody>
      </table>
      ${linhas.length > mostrando ? `<button type="button" class="pih-mais" data-acao="mais">mostrar mais (${linhas.length - mostrando})</button>` : ''}
      </div>
      <div class="pih-rodape">Dados do jogo ${jogo.versao ? `v${esc(jogo.versao)}` : 'no ar'} · ${r.linhas.length} de ${r.total} hunts · cálculo em ${r.ms} ms · ranking com ondas cheias · geometria medida em ${PIH.geo?.huntsMedidas?.() ?? 0} hunts (≈ = padrão · ● = você já caçou aqui, passe o mouse)${r.aoe ? ` · TM AoE: ${r.aoe.alvosPorGolpe.toFixed(1).replace('.', ',')} alvos/golpe (${r.aoe.calibradoEm ? `calibrado em ${r.aoe.calibradoEm} hunt${r.aoe.calibradoEm > 1 ? 's' : ''} suas` : 'padrão, até você caçar 10+ min com ele'})` : ''}</div>`;
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
    alvo.innerHTML = html;
    return true;
  }

  async function desenhar() {
    if (!painel) return;
    pintarMoldura();
    const v = document.documentElement.dataset.pilotoVersao;
    const campoV = painel.querySelector('[data-versao]');
    if (v && campoV && !campoV.textContent) { campoV.textContent = `v${v}`; campoV.closest('a').title = `PokeIdle Piloto v${v} · abrir o GitHub do Dreds`; }
    const alvo = painel.querySelector('[data-conteudo]');
    const aba = ABAS.some(([k]) => k === prefs.aba) ? prefs.aba : 'resumo';
    alvo.dataset.aba = aba;
    if (aba !== 'mercado') soltarMercado();
    if (aba === 'mercado') { ultimaAba = 'mercado'; ultimoHtml = ''; montarMercado(alvo); return; }
    if (aba === 'resumo') { pintarSeMudou(alvo, aba, blocoResumo()); return; }
    const modulo = { auto: PIH.auto, rotina: PIH.rotina, cofre: PIH.cofre }[aba];
    if (modulo) {
      if (pintarSeMudou(alvo, aba, modulo.html())) modulo.ligar(alvo, desenhar);
      return;
    }
    ultimaAba = aba;
    const pk = pkAtivo();
    if (!welcome || !eu) { alvo.innerHTML = '<div class="pih-carga">Esperando o jogo conectar…</div>'; return; }
    if (!pk) { alvo.innerHTML = '<div class="pih-erro">Coloque um pokémon em campo para ver onde caçar.</div>'; return; }
    if (!alvo.querySelector('.pih-tab, .pih-meta-grid')) alvo.innerHTML = '<div class="pih-carga">Lendo o jogo…</div>';
    try {
      const jogo = await PIH.carregarJogo();
      if (!painel || prefs.aba !== aba) return;
      const ctx = contexto(jogo, pk);
      const r = PIH.engine.analisar(pk, ctx, prefs);
      const rolagem = alvo.querySelector('.pih-lista, .pih-meta-grid')?.scrollTop ?? 0;
      alvo.innerHTML = aba === 'meta'
        ? `${blocoBonus(r.bonusXp)}${blocoMeta(r, ctx)}`
        : `${blocoStats(r.pokemon)}${blocoBonus(r.bonusXp)}${controles()}${corpo(r, jogo)}`;
      const area = alvo.querySelector('.pih-lista, .pih-meta-grid');
      if (area) area.scrollTop = rolagem;
      assinatura = assinaturaDe(pk);
    } catch (err) {
      console.error('[piloto]', err);
      if (painel) alvo.innerHTML = `<div class="pih-erro">Não consegui calcular: ${esc(err.message)}</div>`;
    }
    ligarEventos();
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

  function ligarEventos() {
    if (!painel) return;
    painel.querySelector('[data-acao="mais"]')?.addEventListener('click', () => { mostrando += POR_PAGINA; desenhar(); });
    const ajuda = painel.querySelector('[data-acao="ajuda-ouro"]');
    ajuda?.addEventListener('click', () => {
      const dica = painel.querySelector('#pih-dica-ouro');
      dica.hidden = !dica.hidden;
      ajuda.setAttribute('aria-expanded', String(!dica.hidden));
    });
    const salvarERedesenhar = () => { gravarJson(CHAVE_PREFS, prefs); desenhar(); };
    painel.querySelector('[data-fonte]')?.addEventListener('change', (ev) => { prefs.fonte = ev.target.value; salvarERedesenhar(); });
    painel.querySelector('[data-horas]')?.addEventListener('change', (ev) => {
      const v = Number(ev.target.value);
      prefs.horasDia = Number.isFinite(v) && v > 0 ? Math.min(24, v) : 24;
      salvarERedesenhar();
    });
    for (const inp of painel.querySelectorAll('[data-meta]')) {
      inp.addEventListener('change', () => {
        const v = Math.round(Number(inp.value));
        prefs[inp.dataset.meta] = Number.isFinite(v) && v > 0 ? v : null;
        salvarERedesenhar();
      });
      inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); });
    }
    for (const b of painel.querySelectorAll('[data-ordem]')) {
      b.addEventListener('click', () => { prefs.ordem = b.dataset.ordem; gravarJson(CHAVE_PREFS, prefs); desenhar(); });
    }
    for (const c of painel.querySelectorAll('[data-pref]')) {
      c.addEventListener('change', () => { prefs[c.dataset.pref] = c.checked; gravarJson(CHAVE_PREFS, prefs); desenhar(); });
    }
  }

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
  PIH.on('auto.diario', () => redesenharSe(['auto', 'resumo']));
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
