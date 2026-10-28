// Guia de primeiro uso, quadro de novidades e aviso de versão nova (1.31, regra 12; 1.32.2, regra 14).
//
// 1.32.2 (regra 14 do hub): os três aparecem SOZINHOS no meio da página do jogo (/app), sem abrir o
// painel do Piloto — um quadro solto, sem fundo escuro, que não pega clique fora dele. O ? do topo
// do painel continua abrindo o guia dentro da janela.
// - Versão nova: o fundo confere os Releases ao abrir o navegador, a cada 6 h e no botão do rodapé.
//   Se houver, "Nova versão vX.Y.Z" com o que mudou (changelog.json da tag, no idioma) e Atualizar
//   (o jeito certo daquele navegador). Volta a cada abertura da página até atualizar; o X esconde
//   até sair uma versão mais nova. Firefox instalado pelo .xpi atualiza sozinho: lá não aparece.
//
// - Instalação nova: na primeira vez que a janela do Piloto abre naquele navegador, aparece o guia
//   (poucos passos, "Pular" e "Entendi"). Não volta sozinho; reabre pelo botão ? do topo.
// - Atualização: na primeira abertura depois dela, aparece "Novidades da vX.Y.Z" (uma vez por
//   versão), com as frases de guia-pt.js / guia-en.js / guia-es.js.
// - O "já viu" fica no chrome.storage.local ('piloto:guia'), lido e gravado pela ponte. Quem marca
//   instalação nova ou atualização é o fundo (runtime.onInstalled).
// - Os quadros ficam dentro da janela do Piloto: não travam nenhuma automação; fecham no X, no Esc
//   ou em "Pular"/"Entendi".
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH) return;

  const versao = () => document.documentElement.dataset.pilotoVersao || '';
  const idioma = () => (PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt');
  const textos = () => { const T = PIH.guiaTextos || {}; return T[idioma()] || T.pt || null; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in o ? o[k] : ''));

  // ---- o estado ("já viu"), pela ponte --------------------------------------------------------
  let estado = null; // { tutorial: bool, novidades: 'x.y.z' | null }
  let pedidoEm = 0;
  document.addEventListener('piloto:guia-estado', (ev) => {
    try { const d = JSON.parse(ev.detail); estado = d && typeof d === 'object' ? d : {}; } catch { estado = {}; }
    if (esperando) { esperando = false; talvezMostrar(!janela()); }
  });
  const pedirEstado = () => { pedidoEm = Date.now(); document.dispatchEvent(new CustomEvent('piloto:guia-ler', { detail: '{}' })); };
  const gravar = (patch) => {
    estado = { ...(estado || {}), ...patch };
    document.dispatchEvent(new CustomEvent('piloto:guia-gravar', { detail: JSON.stringify(patch) }));
  };
  pedirEstado();
  // a ponte (mundo isolado) pode ainda não estar ouvindo: pede de novo até responder
  let tentativas = 0;
  const insistir = setInterval(() => { if (estado || ++tentativas > 15) clearInterval(insistir); else pedirEstado(); }, 1000);

  // ---- o quadro -------------------------------------------------------------------------------
  // 1.33.6 (o André: "aparece um monte de coisa, às vezes não mudou quase nada"): cada versão tem só
  // o que mudou NELA; o quadro mostra as versões entre a última que a pessoa viu e a atual, da mais
  // nova para trás, no máximo 6 linhas (o resto fica no GitHub).
  const MAX_NOVIDADES = 6;
  function novidadesDesde(T) {
    const v = versao();
    const nov = (T && T.novidades) || {};
    if (!v) return [];
    const viu = estado && estado.novidades;
    const vers = Object.keys(nov).filter((x) => cmpVer(x, v) <= 0 && (viu ? cmpVer(x, viu) > 0 : x === v)).sort((a, b) => cmpVer(b, a));
    return vers.flatMap((x) => nov[x] || []);
  }
  let quadro = null; // { el, tipo: 'tutorial'|'novidades', passo }
  const janela = () => document.querySelector('.plt-janela:not(.plt-janela-time)');

  function fechar() {
    if (!quadro) return;
    if (quadro.tipo === 'tutorial') gravar({ tutorial: true, novidades: versao() || (estado && estado.novidades) || null });
    if (quadro.tipo === 'novidades') gravar({ novidades: versao() });
    if (quadro.tipo === 'versao') { if (urgente() && versaoNova()) return; adiadoAte = Date.now() + 60 * 60_000; adiadoVersao = upd.ultima || null; }
    const solto = quadro.solto;
    quadro.el.remove();
    quadro = null;
    // o próximo da fila (ex.: o guia fechou e há versão nova)
    if (solto) setTimeout(() => talvezMostrar(true), 500);
  }

  function desenhar() {
    if (!quadro) return;
    const T = textos();
    if (!T) return;
    const U = T.ui;
    let corpo = '';
    let rodape = '';
    let titulo = '';
    if (quadro.tipo === 'tutorial') {
      const lista = T.tutorial;
      const n = Math.min(quadro.passo, lista.length - 1);
      const p = lista[n];
      titulo = p.t;
      corpo = `<p class="plt-guia-x">${esc(p.x)}</p>
        <div class="plt-guia-pontos" aria-hidden="true">${lista.map((_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;
      const ultimo = n === lista.length - 1;
      rodape = `<span class="plt-guia-passo">${esc(fmt(U.passo, { n: n + 1, t: lista.length }))}</span>
        <span class="plt-guia-bts">
          ${ultimo ? '' : `<button type="button" class="cfg-escala-bt" data-guia="pular">${esc(U.pular)}</button>`}
          ${n > 0 ? `<button type="button" class="cfg-escala-bt" data-guia="voltar">${esc(U.voltar)}</button>` : ''}
          <button type="button" class="cfg-escala-bt on" data-guia="${ultimo ? 'entendi' : 'proximo'}">${esc(ultimo ? U.entendi : U.proximo)}</button>
        </span>`;
    } else if (quadro.tipo === 'versao') {
      const itens = mudancasDaVersao();
      const msg = updStatus && U.updMsg ? U.updMsg[updStatus] || '' : '';
      titulo = fmt(urgente() ? (U.versaoUrgente || 'Atualização urgente v{v}') : (U.novaVersao || 'Nova versão v{v}'), { v: upd.ultima || '?' });
      if (urgente() && PIH.pausarUrgente) PIH.pausarUrgente(String(upd.ultima || '?'));
      corpo = `<p class="plt-guia-de">${esc(fmt(U.voceTem || 'Você está na v{v}.', { v: versao() || upd.atual || '?' }))}</p>
        ${itens.length ? `<ul class="plt-guia-lista">${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${urgente() ? `<p class="plt-guia-msg">${esc(U.urgentePausado || 'O Piloto está pausado até você atualizar.')}</p>` : ''}
        ${msg ? `<p class="plt-guia-msg">${esc(msg)}</p>` : ''}`;
      rodape = `<span class="plt-guia-bts plt-guia-bts-fim">
          ${upd.pagina ? `<a class="cfg-escala-bt plt-guia-link" href="${esc(upd.pagina)}" target="_blank" rel="noopener noreferrer">${esc(U.verNoGithub || 'GitHub')}</a>` : ''}
          <button type="button" class="cfg-escala-bt on" data-guia="atualizar"${updStatus === 'aplicando' ? ' disabled' : ''}>${esc(U.atualizar || 'Atualizar')}</button>
        </span>`;
    } else {
      const v = versao();
      const todos = novidadesDesde(T);
      const itens = todos.slice(0, MAX_NOVIDADES);
      const resto = todos.length - itens.length;
      titulo = fmt(U.novidades, { v });
      corpo = `<ul class="plt-guia-lista">${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${resto > 0 ? `<p class="plt-guia-de">${esc(fmt(U.eMais || '+{n}', { n: resto }))}</p>` : ''}`;
      rodape = `<span class="plt-guia-bts plt-guia-bts-fim">
          <button type="button" class="cfg-escala-bt" data-guia="ver-guia">${esc(U.verGuia)}</button>
          <button type="button" class="cfg-escala-bt on" data-guia="entendi">${esc(U.entendi)}</button>
        </span>`;
    }
    quadro.el.innerHTML = `<div class="plt-guia-caixa modal-caixa" role="dialog" aria-modal="false" aria-label="${esc(titulo)}">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h">${quadro.tipo === 'tutorial' ? ICO_GUIA : quadro.tipo === 'versao' ? ICO_UPD : ICO_NOVO}<span>${esc(titulo)}</span></h3>
          ${quadro.tipo === 'versao' && urgente() ? '' : `<button type="button" class="plt-guia-fechar" data-guia="fechar" aria-label="${esc(U.fechar)}" title="${esc(U.fechar)}">×</button>`}
        </div>
        <div class="plt-guia-corpo">${corpo}</div>
        <div class="plt-guia-rodape">${rodape}</div>
      </div>`;
    const foco = quadro.el.querySelector('.cfg-escala-bt.on');
    if (foco) try { foco.focus({ preventScroll: true }); } catch { /* ok */ }
  }

  // solto = no meio da página (regra 14); senão, dentro da janela do Piloto (o ? do topo)
  function abrir(tipo, solto = false) {
    const j = solto ? null : janela();
    if (!solto && !j) return false;
    if (!document.body) return false;
    if (quadro) quadro.el.remove();
    const el = document.createElement('div');
    el.className = solto ? 'plt-guia plt-guia-solto' : 'plt-guia';
    el.dataset.semTraducao = '1';
    el.dataset.tipo = tipo;
    el.addEventListener('click', aoClicar);
    // teclas digitadas no quadro não viram atalho do jogo (menos o Esc)
    for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    (j || document.body).append(el);
    quadro = { el, tipo, passo: 0, solto, abertoEm: Date.now() };
    desenhar();
    return true;
  }

  function aoClicar(ev) {
    const b = ev.target.closest('[data-guia]');
    if (!b || !quadro) return;
    ev.stopPropagation();
    const a = b.dataset.guia;
    if (a === 'fechar' || a === 'pular' || a === 'entendi') return fechar();
    if (a === 'proximo') { quadro.passo++; return desenhar(); }
    if (a === 'voltar') { quadro.passo = Math.max(0, quadro.passo - 1); return desenhar(); }
    if (a === 'ver-guia') { gravar({ novidades: versao() }); abrir('tutorial', quadro.solto); }
    if (a === 'atualizar') { updStatus = 'aplicando'; desenhar(); pedirUpd('aplicar'); }
  }

  // Esc fecha só o quadro (a janela do Piloto continua aberta). Registrado antes do Esc da janela.
  addEventListener('keydown', (ev) => {
    // 1.33.6: um Esc nos primeiros 2 s depois que o quadro apareceu sozinho era de outra coisa (o
    // André não viu as Novidades da 1.33.5: elas foram marcadas como vistas sem ele ver). Passa reto.
    if (ev.key === 'Escape' && quadro && !(quadro.tipo === 'versao' && urgente() && versaoNova()) && !(quadro.solto && Date.now() - quadro.abertoEm < 2000)) { ev.preventDefault(); ev.stopImmediatePropagation(); fechar(); }
  }, true);

  // ---- a versão nova (o fundo procura; a ponte traz o 'piloto:update') -------------------------
  let upd = {};
  let updStatus = null;
  function cmpVer(a, b) {
    const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  const pedirUpd = (acao, extra = {}) => document.dispatchEvent(new CustomEvent('piloto:upd-pedir', { detail: JSON.stringify({ acao, ...extra }) }));
  document.addEventListener('piloto:upd', (ev) => {
    try { upd = JSON.parse(ev.detail) || {}; } catch { upd = {}; }
    if (quadro && quadro.tipo === 'versao') { if (!versaoNova()) { quadro.el.remove(); quadro = null; } else desenhar(); }
    else if (prontoParaSoltar) talvezMostrar(true);
  });
  document.addEventListener('piloto:upd-resposta', (ev) => {
    let d = {};
    try { d = JSON.parse(ev.detail) || {}; } catch { return; }
    if (d.acao !== 'aplicar' || !quadro || quadro.tipo !== 'versao') return;
    updStatus = d.erro ? 'erro' : (d.r && (d.r.status === 'baixado' && d.r.modo !== 'download' ? d.r.modo : d.r.status)) || 'erro';
    if (updStatus === 'no_update' || updStatus === 'throttled') updStatus = 'loja';
    desenhar();
  });
  // há versão mais nova que a instalada, não escondida no X, e o navegador não atualiza sozinho
  // 1.34 (regra 14, 27/10): o X só ADIA (1 h, ou até a próxima abertura da página); versão URGENTE
  // não tem X e pausa a automação até atualizar.
  let adiadoAte = 0;
  let adiadoVersao = null; // o adiamento vale para ESSA versão: saiu outra mais nova, aparece na hora
  const urgente = () => !!(upd && upd.urgente);
  const versaoNova = () => !!(upd && upd.disponivel && upd.ultima && cmpVer(upd.ultima, versao() || upd.atual || '0') > 0
    && (urgente() || (!upd.autoAtualiza && (adiadoVersao !== upd.ultima || Date.now() >= adiadoAte))));
  // procurar: ao abrir a página, ao voltar para a aba e a cada 30 min (o fundo), no máx. 1 a cada 10 min
  const procurar = () => pedirUpd('checar', { minMs: 10 * 60_000 });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && naPaginaDoJogo()) procurar(); });
  setInterval(() => {
    if (!quadro && adiadoAte && Date.now() >= adiadoAte) { adiadoAte = 0; if (prontoParaSoltar) talvezMostrar(true); }
    if (upd && upd.urgente && versaoNova() && PIH.pausarUrgente) PIH.pausarUrgente(String(upd.ultima));
  }, 30_000);
  // o que mudou: o changelog.json da versão nova, no idioma; sem ele, as notas do Release
  function mudancasDaVersao() {
    const m = upd.mudancas && (upd.mudancas[idioma()] || upd.mudancas.en || upd.mudancas.pt);
    if (Array.isArray(m) && m.length) return m.slice(0, 6).map(String);
    try { return (PIH.suporte && PIH.suporte.itensDasNotas ? PIH.suporte.itensDasNotas(upd.notas) : []).slice(0, 6); } catch { return []; }
  }

  // ---- quando mostrar sozinho ----------------------------------------------------------------
  let esperando = false;
  // os testes automáticos desligam o aparecer sozinho com a chave de desenvolvimento 'piloto:dev:semGuia'
  const semGuia = (() => { try { return localStorage.getItem('piloto:dev:semGuia') === '1'; } catch { return false; } })();
  // só na página do jogo, depois que ele carregou
  const naPaginaDoJogo = () => /^\/app(\/|$)/.test(location.pathname);
  let prontoParaSoltar = false;
  function talvezMostrar(solto = false) {
    if (quadro || semGuia) return;
    if (!solto && !janela()) return;
    if (solto && (!prontoParaSoltar || !naPaginaDoJogo())) return;
    // 1.33.6: com a aba escondida (outra aba, janela minimizada) ninguém veria: espera a pessoa voltar
    if (solto && document.visibilityState !== 'visible') { esperarVisivel(); return; }
    if (!estado) { esperando = true; if (Date.now() - pedidoEm > 3000) pedirEstado(); return; }
    const T = textos();
    if (!T) return;
    if (estado.tutorial !== true) { abrir('tutorial', solto); return; }
    const v = versao();
    if (v && estado.novidades !== v && novidadesDesde(T).length) { abrir('novidades', solto); return; }
    if (solto && versaoNova()) { updStatus = null; abrir('versao', true); }
  }
  let esperandoVisivel = false;
  function esperarVisivel() {
    if (esperandoVisivel) return;
    esperandoVisivel = true;
    const volta = () => { if (document.visibilityState !== 'visible') return; document.removeEventListener('visibilitychange', volta); esperandoVisivel = false; setTimeout(() => talvezMostrar(true), 1500); };
    document.addEventListener('visibilitychange', volta);
  }
  // a página do jogo: espera o jogo mandar o primeiro estado (ou 8 s) e mais um pouco
  const soltar = () => { if (prontoParaSoltar) return; prontoParaSoltar = true; procurar(); talvezMostrar(true); };
  if (naPaginaDoJogo()) {
    let marcado = false;
    if (PIH.on) PIH.on('estado', () => { if (!marcado) { marcado = true; setTimeout(soltar, 2500); } });
    setTimeout(soltar, 8000);
  }

  // o botão ? no topo da janela, e o primeiro abrir
  const ICO_AJUDA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-.1 11.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM12 6c2.2 0 3.8 1.3 3.8 3.2 0 1.4-.8 2.2-1.9 2.9-.8.5-1 .8-1 1.5v.4h-2v-.6c0-1.3.6-2 1.6-2.7.8-.5 1.2-.9 1.2-1.5 0-.8-.7-1.4-1.8-1.4-1 0-1.8.6-1.9 1.6H8C8.2 7.3 9.8 6 12 6z" fill="currentColor"/></svg>';
  const ICO_GUIA = '<svg class="plt-guia-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7a3 3 0 0 1 1 .2A3 3 0 0 1 13 4h7v15h-7a2 2 0 0 0-1 .3 2 2 0 0 0-1-.3H4zm2 2v11h5l.1.1V7a1 1 0 0 0-1-1zm12 0h-4a1 1 0 0 0-1 1v10.1l.1-.1H18z" fill="currentColor"/></svg>';
  const ICO_UPD = '<svg class="plt-guia-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 1 8.9 7.6h-2.1A7 7 0 0 0 6.2 8.4L9 11H3V5l1.8 1.8A9 9 0 0 1 12 3zm-.9 5h1.8v4.6l3.4 2-0.9 1.5L11.1 13.6zM3.1 13.4h2.1a7 7 0 0 0 12.6 2.2L15 13h6v6l-1.8-1.8A9 9 0 0 1 3.1 13.4z" fill="currentColor"/></svg>';
  const ICO_NOVO = '<svg class="plt-guia-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 5.6L20 8.2l-4.3 3.9 1.2 5.9L12 15l-4.9 3 1.2-5.9L4 8.2l5.6-.6z" fill="currentColor"/></svg>';
  function prepararJanela(j) {
    if (j.dataset.guiaPronta) return;
    j.dataset.guiaPronta = '1';
    const acoes = j.querySelector('.modal-topo .modal-acoes');
    if (acoes && !acoes.querySelector('[data-guia-abrir]')) {
      const T = textos();
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plt-guia-bt';
      b.dataset.guiaAbrir = '1';
      b.dataset.semTraducao = '1';
      const rot = (T && T.ui.comoUsar) || 'Como usar';
      b.title = rot;
      b.setAttribute('aria-label', rot);
      b.innerHTML = ICO_AJUDA;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); abrir('tutorial'); });
      acoes.prepend(b);
    }
    setTimeout(talvezMostrar, 600);
  }
  // troca de idioma: o quadro e o title do botão vêm do arquivo do idioma
  document.addEventListener('piloto:idioma', () => {
    desenhar();
    const T = textos();
    const b = document.querySelector('.plt-janela [data-guia-abrir]');
    if (b && T) { b.title = T.ui.comoUsar; b.setAttribute('aria-label', T.ui.comoUsar); }
  });
  const obs = new MutationObserver(() => {
    const j = janela();
    if (j && !j.dataset.guiaPronta) prepararJanela(j);
    if (quadro && !quadro.el.isConnected) quadro = null; // a janela fechou
  });
  const ligar = () => { if (document.body) obs.observe(document.body, { childList: true }); else setTimeout(ligar, 300); };
  ligar();

  PIH.guia = { _interno: { adiadoAte: () => adiadoAte, voltarJa: () => { adiadoAte = 1; } }, abrir, fechar, estado: () => estado, aberto: () => (quadro ? { tipo: quadro.tipo, passo: quadro.passo, solto: !!quadro.solto } : null), versaoNova };
})(globalThis);
