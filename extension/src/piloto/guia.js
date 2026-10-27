// Guia de primeiro uso e quadro de novidades (1.31, regra 12 do hub).
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
    if (esperando) { esperando = false; talvezMostrar(); }
  });
  const pedirEstado = () => { pedidoEm = Date.now(); document.dispatchEvent(new CustomEvent('piloto:guia-ler', { detail: '{}' })); };
  const gravar = (patch) => {
    estado = { ...(estado || {}), ...patch };
    document.dispatchEvent(new CustomEvent('piloto:guia-gravar', { detail: JSON.stringify(patch) }));
  };
  pedirEstado();

  // ---- o quadro -------------------------------------------------------------------------------
  let quadro = null; // { el, tipo: 'tutorial'|'novidades', passo }
  const janela = () => document.querySelector('.plt-janela:not(.plt-janela-time)');

  function fechar() {
    if (!quadro) return;
    if (quadro.tipo === 'tutorial') gravar({ tutorial: true, novidades: versao() || (estado && estado.novidades) || null });
    if (quadro.tipo === 'novidades') gravar({ novidades: versao() });
    quadro.el.remove();
    quadro = null;
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
    } else {
      const v = versao();
      const itens = (T.novidades && T.novidades[v]) || [];
      titulo = fmt(U.novidades, { v });
      corpo = `<ul class="plt-guia-lista">${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
      rodape = `<span class="plt-guia-bts plt-guia-bts-fim">
          <button type="button" class="cfg-escala-bt" data-guia="ver-guia">${esc(U.verGuia)}</button>
          <button type="button" class="cfg-escala-bt on" data-guia="entendi">${esc(U.entendi)}</button>
        </span>`;
    }
    quadro.el.innerHTML = `<div class="plt-guia-caixa modal-caixa" role="dialog" aria-modal="false" aria-label="${esc(titulo)}">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h">${quadro.tipo === 'tutorial' ? ICO_GUIA : ICO_NOVO}<span>${esc(titulo)}</span></h3>
          <button type="button" class="plt-guia-fechar" data-guia="fechar" aria-label="${esc(U.fechar)}" title="${esc(U.fechar)}">×</button>
        </div>
        <div class="plt-guia-corpo">${corpo}</div>
        <div class="plt-guia-rodape">${rodape}</div>
      </div>`;
    const foco = quadro.el.querySelector('.cfg-escala-bt.on');
    if (foco) try { foco.focus({ preventScroll: true }); } catch { /* ok */ }
  }

  function abrir(tipo) {
    const j = janela();
    if (!j) return false;
    if (quadro) quadro.el.remove();
    const el = document.createElement('div');
    el.className = 'plt-guia';
    el.dataset.semTraducao = '1';
    el.dataset.tipo = tipo;
    el.addEventListener('click', aoClicar);
    j.append(el);
    quadro = { el, tipo, passo: 0 };
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
    if (a === 'ver-guia') { gravar({ novidades: versao() }); abrir('tutorial'); }
  }

  // Esc fecha só o quadro (a janela do Piloto continua aberta). Registrado antes do Esc da janela.
  addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && quadro) { ev.preventDefault(); ev.stopImmediatePropagation(); fechar(); }
  }, true);

  // ---- quando mostrar sozinho ----------------------------------------------------------------
  let esperando = false;
  // os testes automáticos desligam o aparecer sozinho com a chave de desenvolvimento 'piloto:dev:semGuia'
  const semGuia = (() => { try { return localStorage.getItem('piloto:dev:semGuia') === '1'; } catch { return false; } })();
  function talvezMostrar() {
    if (quadro || !janela() || semGuia) return;
    if (!estado) { esperando = true; if (Date.now() - pedidoEm > 3000) pedirEstado(); return; }
    const T = textos();
    if (!T) return;
    if (estado.tutorial !== true) { abrir('tutorial'); return; }
    const v = versao();
    if (v && estado.novidades !== v && T.novidades && (T.novidades[v] || []).length) abrir('novidades');
  }

  // o botão ? no topo da janela, e o primeiro abrir
  const ICO_AJUDA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-.1 11.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM12 6c2.2 0 3.8 1.3 3.8 3.2 0 1.4-.8 2.2-1.9 2.9-.8.5-1 .8-1 1.5v.4h-2v-.6c0-1.3.6-2 1.6-2.7.8-.5 1.2-.9 1.2-1.5 0-.8-.7-1.4-1.8-1.4-1 0-1.8.6-1.9 1.6H8C8.2 7.3 9.8 6 12 6z" fill="currentColor"/></svg>';
  const ICO_GUIA = '<svg class="plt-guia-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7a3 3 0 0 1 1 .2A3 3 0 0 1 13 4h7v15h-7a2 2 0 0 0-1 .3 2 2 0 0 0-1-.3H4zm2 2v11h5l.1.1V7a1 1 0 0 0-1-1zm12 0h-4a1 1 0 0 0-1 1v10.1l.1-.1H18z" fill="currentColor"/></svg>';
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

  PIH.guia = { abrir, fechar, estado: () => estado, aberto: () => (quadro ? { tipo: quadro.tipo, passo: quadro.passo } : null) };
})(globalThis);
