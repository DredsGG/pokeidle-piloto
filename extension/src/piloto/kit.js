// Kit visual do Piloto: ícones (SVG próprios, traço do jogo) e as peças que todas as abas usam —
// cartão com interruptor, campo com rótulo curto e o "i" com a explicação no passar do mouse.
// O texto longo saiu da tela e foi para o `title`: bater o olho e entender, sem ler parágrafo.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});

  // viewBox 24×24, preenchidos (currentColor): o contorno escuro vem do CSS (drop-shadow).
  const P = {
    resumo: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
    duvidas: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm8 2.5a3.2 3.2 0 0 0-3.2 3.2h2a1.2 1.2 0 1 1 1.6 1.1c-.9.4-1.4 1.1-1.4 2.1v.6h2v-.5c0-.3.2-.5.4-.6A3.2 3.2 0 0 0 12 5.5zM11 14v2h2v-2z',
    cacar: 'M11 2h2v3.1A7 7 0 0 1 18.9 11H22v2h-3.1A7 7 0 0 1 13 18.9V22h-2v-3.1A7 7 0 0 1 5.1 13H2v-2h3.1A7 7 0 0 1 11 5.1zm1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
    nivel: 'M12 3l8 8h-5v4H9v-4H4zM9 17h6v2H9zm0 3h6v2H9z',
    auto: 'M10.3 2h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6L2 13.7v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    rotina: 'M6 2h2v2h8V2h2v2h3v18H3V4h3zm-1 7v11h14V9zm5.6 9.2L7.4 15l1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z',
    mercado: 'M5 7h14l-1 14H6zm3-1a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0zm1 4v2h2v-2zm4 0v2h2v-2z',
    cofre: 'M3 4h18v15h-2v2h-3v-2H8v2H5v-2H3zm2 2v11h14V6zm7 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5-2h1v6h-1z',
    radar: 'M12 2a10 10 0 1 1-7.1 2.9l1.4 1.4A8 8 0 1 0 12 4zm0 4a6 6 0 1 1-4.2 1.8l1.4 1.4A4 4 0 1 0 12 8zm0 4a2 2 0 1 1-1.4.6L4.9 4.9l1.4-1.4 5.7 5.7z',
    pvp: 'M3 2l7 7-1.5 1.5L7 9l-2 2 3 3-2 2-1.5-1.5L2 17l-1-1 2.5-2.5L2 12l2-2 3 3 2-2-1.5-1.5L3 6zm18 0v4l-9.5 9.5 1.5 1.5-2 2-3-3 2-2 1.5 1.5L21 2zm-5 13l2 2 1.5-1.5L22 18l-1 1-2.5-2.5L17 18l-2-2z',
    xp: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z',
    ouro: 'M12 3c5 0 9 2 9 4.5v9C21 19 17 21 12 21s-9-2-9-4.5v-9C3 5 7 3 12 3zm0 2C8 5 5 6.4 5 7.5S8 10 12 10s7-1.4 7-2.5S16 5 12 5zm-7 5.6v2.4c0 1.1 3 2.5 7 2.5s7-1.4 7-2.5v-2.4c-1.6 1-4.2 1.4-7 1.4s-5.4-.5-7-1.4z',
    gasto: 'M3 6h15v3h3v11H3zm2 2v10h14v-7h-6v-2h3V8zm9 5h3v2h-3zM11 1l4 4h-3v4h-2V5H7z',
    passe: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zm11 2v2h2V8zm0 3v2h2v-2zm0 3v2h2v-2z',
    outland: 'M2 20L9 7l4 7 2-3 7 9zm7-9l-3.5 7h7z',
    xpshare: 'M12 3l10 8h-3v10h-5v-6h-4v6H5V11H2z',
    evoluir: 'M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 2 2 .7-2 .7L5 20l-.7-2-2-.7 2-.7z',
    ovo: 'M12 2c4 0 7 6.5 7 11a7 7 0 0 1-14 0c0-4.5 3-11 7-11zm-2 9l-2 3 2 2 2-3 2 3 2-2-2-3-2 3z',
    depot: 'M3 7l9-4 9 4v11l-9 4-9-4zm2 2.3v7.4l6 2.7v-7.4zm8 2.7v7.4l6-2.7V9.3zm-1-6.8L6.2 7.8 12 10.4l5.8-2.6z',
    repor: 'M9 2h6v2h-1v3.2l4.6 7.9A4 4 0 0 1 15.1 21H8.9a4 4 0 0 1-3.5-5.9L10 7.2V4H9zm-.9 13l-.9 1.6A1.6 1.6 0 0 0 8.6 19h6.8a1.6 1.6 0 0 0 1.4-2.4l-.9-1.6z',
    revenda: 'M4 4h9l7 7-9 9-7-7zm4 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    leme: 'M11 1h2v3.1a8 8 0 0 1 3.3 1.4l2.2-2.2 1.4 1.4-2.2 2.2a8 8 0 0 1 1.4 3.3H23v2h-3.1a8 8 0 0 1-1.4 3.3l2.2 2.2-1.4 1.4-2.2-2.2a8 8 0 0 1-3.3 1.4V23h-2v-3.1a8 8 0 0 1-3.3-1.4l-2.2 2.2-1.4-1.4 2.2-2.2A8 8 0 0 1 4.1 13H1v-2h3.1a8 8 0 0 1 1.4-3.3L3.3 5.5l1.4-1.4 2.2 2.2A8 8 0 0 1 11 4.1zm1 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    fechar: 'M5.6 4.2L12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z',
    info: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-4v2h2V6z',
    relogio: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 3h2v5.6l3.7 2.2-1 1.7L11 13.7z',
    sol: 'M11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1zM12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
    lua: 'M14.5 2A10 10 0 1 0 22 15.5 8 8 0 0 1 14.5 2z',
    raio: 'M13 2L4 14h6l-1 8 9-12h-6z',
    check: 'M9.5 16.6L4.9 12l-1.4 1.4 6 6L21 7.9l-1.4-1.4z',
    voltar: 'M10 4 3 10l7 6v-4h5a4 4 0 0 1 0 8h-3v2h3a6 6 0 0 0 0-12h-5z',
    bola: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-7.9 11a8 8 0 0 0 15.8 0h-4.5a3.5 3.5 0 0 1-6.8 0zm7.9-2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM4.1 11h4.5a3.5 3.5 0 0 1 6.8 0h4.5a8 8 0 0 0-15.8 0z',
    escudo: 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zm-1 13.2l6-6-1.4-1.4-4.6 4.6-2.1-2.1-1.4 1.4z',
  };
  const ico = (nome, classe = '') => `<svg class="plt-ico ${classe}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[nome] || P.info}"/></svg>`;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // O "i": a explicação mora no title (passar o mouse) e no aria-label (leitor de tela).
  const dica = (texto) => (texto ? `<span class="plt-dica" tabindex="0" title="${esc(texto)}" aria-label="${esc(texto)}">${ico('info')}</span>` : '');
  // Cartão: ícone, título curto, o "i" e, à direita, o interruptor (já com o data-* do módulo).
  const cartao = ({ icone, titulo, dica: d = '', interruptor = '', acoes = '', corpo = '', classe = '' }) => `
    <section class="plt-card ${classe}">
      <header class="plt-card-cab">${ico(icone)}<b>${titulo}</b>${dica(d)}<span class="plt-card-acoes">${acoes}${interruptor}</span></header>
      ${corpo ? `<div class="plt-card-corpo">${corpo}</div>` : ''}
    </section>`;
  // Campo: rótulo curto em cima, controle embaixo.
  const campo = (rotulo, controle, d = '') => `<label class="plt-campo"${d ? ` title="${esc(d)}"` : ''}><small>${rotulo}</small>${controle}</label>`;
  // Opção: o interruptor do jogo com um texto curto do lado.
  const opcao = (input, rotulo, d = '') => `<label class="plt-opcao"${d ? ` title="${esc(d)}"` : ''}>${input}<span>${rotulo}</span></label>`;
  const botao = (rotulo, attrs = '', icone = '') => `<button type="button" class="plt-bt" ${attrs}>${icone ? ico(icone) : ''}${rotulo}</button>`;

  // ---- 1.13: as peças das janelas do PRÓPRIO jogo (classes do estilo.css dele) -----------------
  // Linha de opção = .cfg-linha da janela Configurações: nome em Tahoma, o "?" amarelo que abre a
  // explicação (.cfg-desc) e o interruptor ON/OFF (.cfg-toggle). Os controles do modo Manual moram
  // num bloco abaixo (.plt-ajustes). `alvo` é "modulo:caminho" (o ui.js roteia a mudança).
  const ajuda = (texto, nome = '') => (texto ? `<button type="button" class="cfg-ajuda" aria-expanded="false" title="O que é isto?" aria-label="O que é isto? ${esc(nome)}"><b aria-hidden="true">?</b></button>` : '');
  const interruptor = (alvo, on, { trava = false, nome = '' } = {}) => `<button type="button" class="cfg-toggle${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" data-alternar="${esc(alvo)}" aria-label="${esc(nome)}"${trava ? ' disabled' : ''}></button>`;
  function linha({ id = '', icone = '', nome, dica = '', alvo = null, on = false, trava = false, status = '', ajustes = '', classe = '', direita = '' }) {
    const chave = id || (alvo || nome);
    return `<div class="cfg-linha plt-l ${classe}" data-linha="${esc(chave)}">
      <span class="cfg-rot">${icone ? `<span class="plt-l-ico">${ico(icone)}</span>` : ''}<span class="cfg-cola"><span class="cfg-nome">${nome}</span>${ajuda(dica, nome)}</span>${status ? `<small class="plt-l-status">${status}</small>` : ''}</span>
      ${alvo ? interruptor(alvo, on, { trava, nome }) : direita || '<span></span>'}
      ${dica ? `<p class="cfg-desc">${esc(dica)}</p>` : ''}
      ${ajustes ? `<div class="plt-ajustes">${ajustes}</div>` : ''}
    </div>`;
  }
  // Escolha entre poucas opções: os botões .cfg-escala-bt do jogo (roxo = escolhido).
  const escala = (alvo, valor, opcoes, trava = false) => `<span class="cfg-escala plt-escala">${opcoes.map(([v, r, d]) => `<button type="button" class="cfg-escala-bt${String(v) === String(valor) ? ' on' : ''}" data-escolha="${esc(alvo)}" data-valor="${esc(v)}"${d ? ` title="${esc(d)}"` : ''}${trava ? ' disabled' : ''}>${r}</button>`).join('')}</span>`;
  const numero = (alvo, v, min, max, step, trava = false) => `<input type="number" class="plt-num" min="${min}"${max != null ? ` max="${max}"` : ''} step="${step}" value="${esc(v)}" data-definir="${esc(alvo)}"${trava ? ' disabled' : ''}>`;
  const selecao = (alvo, v, opcoes, trava = false) => `<select class="plt-sel" data-definir="${esc(alvo)}"${trava ? ' disabled' : ''}>${opcoes.map(([o, r]) => `<option value="${esc(o)}"${String(v) === String(o) ? ' selected' : ''}>${r}</option>`).join('')}</select>`;
  const mini = (alvo, on, rotulo, dica = '', trava = false) => `<label class="plt-mini-op"${dica ? ` title="${esc(dica)}"` : ''}>${interruptor(alvo, on, { trava, nome: rotulo })}<span>${rotulo}</span></label>`;
  const fcampo = (rotulo, controle, d = '') => `<label class="plt-f"${d ? ` title="${esc(d)}"` : ''}><small>${rotulo}</small>${controle}</label>`;
  const grupo = (titulo) => `<div class="plt-grupo">${titulo}</div>`;
  const acao = (rotulo, attrs = '', icone = '', trava = false) => `<button type="button" class="cfg-escala-bt plt-acao on" ${attrs}${trava ? ' disabled' : ''}>${icone ? ico(icone) : ''}${rotulo}</button>`;
  // Número grande em caixa (os KPIs): o vão do jogo com rótulo em cima.
  const numeroGrande = ({ icone = '', rotulo, valor, sub = '', classe = '', pct = null }) => `<div class="plt-k ${classe}">${icone ? ico(icone) : ''}<small>${rotulo}</small><strong>${valor}</strong>${sub ? `<em>${sub}</em>` : ''}${pct == null ? '' : `<span class="plt-k-barra"><i style="width:${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%"></i></span>`}</div>`;
  const pilula = (estado) => `<i class="plt-pilula" data-estado="${esc(estado)}">${{ on: 'ON', pausa: 'PAUSA', erro: 'ERRO' }[estado] || 'OFF'}</i>`;

  PIH.kit = Object.freeze({
    ico, dica, cartao, campo, opcao, botao, esc, ICONES: Object.freeze({ ...P }),
    ajuda, interruptor, linha, escala, numero, selecao, mini, fcampo, grupo, acao, numeroGrande, pilula,
  });
})(globalThis);
