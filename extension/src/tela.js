// Radar do Mercado: o radar dentro da tela do jogo.
//
// 1. A barra: uma faixa no painel "Em campo" do jogo, logo acima da /hunt (ou do card do
//    pokémon, sem a /hunt), com o estado do radar e o número de avisos. Mora em #p-ativo, que
//    o jogo não redesenha (o card #ativo-card ele redesenha a cada atualização). A /hunt só exige
//    ficar colada no card; o radar fica logo antes dela, então as duas regras não brigam. Sem o
//    #p-ativo (layout novo do jogo), a barra flutua no canto inferior direito.
// 2. O painel, aberto pela barra: Avisos (os cartões de compra), Mercado (os itens vigiados),
//    Compras e Vendas (o histórico do jogador e os anúncios abertos).
//
// Tudo em shadow DOM, com as variáveis de cor do jogo (com reserva) para parecer da casa. A
// tela só mostra e repassa cliques: quem pede ao servidor é o radar, a pedido daqui.
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const bus = globalThis.RadarBus;
  const Config = globalThis.RadarConfig;
  const Pessoal = globalThis.RadarPessoal;
  const Compra = globalThis.RadarCompra;
  const Rv = globalThis.RadarRevenda;
  const RvPk = globalThis.RadarRevendaPokemon;
  const CHAVE_AUTO_DESLIGADA = 'radar:autoDesligada';
  if (!bus || !Config || !Pessoal || !Compra) { console.error(PREFIXO, 'tela: bibliotecas não carregaram'); return; }

  const MOTIVO_FALHAS = 'Pausado depois de 5 falhas seguidas';
  const REPEDIR_MS = 60000;
  const MAX_LINHAS_MERCADO = 60;

  const CSS_BARRA = `
    :host { all: initial; }
    .barra {
      display: flex; align-items: center; gap: 6px; width: 100%; box-sizing: border-box; padding: 6px 10px; border: 0;
      border-radius: 6px; cursor: pointer; text-align: left; white-space: nowrap;
      background: var(--vao, #33202b); color: var(--sobre-mad, #fff6ef);
      box-shadow: inset 0 0 0 2px var(--mad-linha, #480e1e), 0 1px 0 var(--mad-luz2, #e7a86d);
      font: 700 12px/1.2 Tahoma, Verdana, "Segoe UI", sans-serif;
    }
    .barra:hover { filter: brightness(1.12); }
    .barra:focus-visible { outline: 2px solid #ffd36b; outline-offset: 2px; }
    .ponto { width: 8px; height: 8px; border-radius: 50%; background: #8a7f86; flex: none; }
    .ponto.ok { background: #6fd08a; }
    .ponto.pausa { background: #f0a03c; }
    .estado { font-weight: 500; color: var(--vao-dim, #c9a9b4); overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .selo { margin-left: auto; padding: 1px 7px; border-radius: 999px; background: #f0a03c; color: #2a1405; font-size: 11px; flex: none; }
    .selo.pisca { animation: pisca 1s ease-in-out 3; }
    @keyframes pisca { 50% { filter: brightness(1.45); } }
    .auto { padding: 1px 6px; border-radius: 999px; background: #8fb2ff; color: #0d1a33; font-size: 10.5px; flex: none; }
    [hidden] { display: none !important; }
  `;

  const CSS_PAINEL = `
    :host { all: initial; }
    .painel {
      --linha: var(--mad-linha, #480e1e); --luz: var(--mad-luz, #f1d3b7); --luz2: var(--mad-luz2, #e7a86d); --pmad: var(--mad, #bd6951);
      --esc: var(--mad-esc, #914850); --quente: var(--mad-quente, #df824c); --base: var(--mad-base, #722c3f);
      --fundo: var(--vao, #33202b); --sup2: var(--vao2, #462b39); --vluz: var(--vao-luz, #5c3948); --vazio: var(--barra-vazia, #1e1219);
      --texto: var(--sobre-mad, #fff6ef); --tdim: var(--sobre-mad-dim, #f5cdb9); --dim: var(--vao-dim, #c9a9b4);
      --rxl: var(--rx-luz, #ffdef0); --rxe: var(--rx-esc, #8d49b8); --rx0: var(--rx, #ba5ad1); --rxc: var(--rx-clr, #e77ad2); --rxr: var(--rx-rosa, #ffa7d7);
      --pl-ouro: var(--ouro, #e2a93f); --pl-ouro-luz: var(--ouro-luz, #ffe9a3);
      --tahoma: Tahoma, Verdana, "Segoe UI", sans-serif;
      position: fixed; z-index: 39; width: min(640px, calc(100vw - 24px)); max-height: min(80vh, 720px); box-sizing: border-box;
      display: flex; flex-direction: column; padding: 14px 16px 16px; border-radius: 9px;
      font: 500 13px/1.4 "Barlow", "Segoe UI", system-ui, sans-serif; color: var(--texto); font-variant-numeric: tabular-nums;
      background: linear-gradient(180deg, var(--esc) 0 12px, var(--pmad) 12px calc(100% - 16px), var(--quente) calc(100% - 16px) calc(100% - 8px), var(--pmad) calc(100% - 8px) 100%);
      box-shadow: inset 0 0 0 2px var(--linha), inset 0 0 0 4px var(--luz), inset 0 0 0 6px var(--pmad), 0 6px 0 var(--base), 0 24px 70px #000c;
    }
    .painel * { box-sizing: border-box; }
    /* encaixado na aba Mercado do Piloto: já está dentro do vão do Piloto */
    .painel.encaixado { position: static; width: auto; height: 100%; max-height: none; padding: 12px; border-radius: 0; box-shadow: none; background: transparent; }
    .painel.encaixado .titulo h3, .painel.encaixado .fechar { display: none; }
    .cab { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .titulo { flex: 1; min-width: 0; }
    .titulo h3 { margin: 0 0 6px; font: 700 15px/1.2 var(--tahoma); text-transform: uppercase; letter-spacing: 1px; color: #fff;
      text-shadow: -2px -2px 0 var(--base), 2px -2px 0 var(--base), -2px 2px 0 var(--base), 2px 2px 0 var(--base); }
    .titulo small { display: block; padding: 4px 10px; border-radius: 6px; font-size: 12.5px; font-weight: 600; color: var(--dim);
      background: var(--fundo); box-shadow: inset 0 0 0 2px var(--linha); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .painel.encaixado .titulo small { background: var(--sup2); box-shadow: inset 0 0 0 1px var(--vluz); }
    button { font: inherit; cursor: pointer; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--pl-ouro-luz); outline-offset: 2px; }
    /* botão pixel do jogo: roxo = ação/ativo, madeira = inativo */
    .botao, .seg button {
      border: 0; border-radius: 6px; min-height: 30px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      font: 700 11px/1 var(--tahoma); text-transform: uppercase; letter-spacing: .5px; color: #fff; transition: filter .1s, transform .06s;
    }
    .botao, .seg button.on {
      background: linear-gradient(180deg, var(--rxl) 0 4px, var(--rxe) 4px 8px, var(--rx0) 8px calc(100% - 8px), var(--rxc) calc(100% - 8px) calc(100% - 4px), var(--rxr) calc(100% - 4px) 100%);
      box-shadow: inset 0 0 0 2px var(--linha), 0 2px 0 var(--base);
      text-shadow: -1px -1px 0 var(--rxe), 1px -1px 0 var(--rxe), -1px 1px 0 var(--rxe), 1px 1px 0 var(--rxe);
    }
    .seg button {
      color: var(--tdim);
      background: linear-gradient(180deg, var(--luz2) 0 4px, var(--esc) 4px 8px, var(--pmad) 8px calc(100% - 6px), var(--quente) calc(100% - 6px) 100%);
      box-shadow: inset 0 0 0 2px var(--linha), 0 2px 0 var(--base);
      text-shadow: -1px -1px 0 var(--base), 1px -1px 0 var(--base), -1px 1px 0 var(--base), 1px 1px 0 var(--base);
    }
    .botao:hover, .seg button:hover { filter: brightness(1.12); }
    .botao:active, .seg button:active { transform: translateY(1px); }
    /* 1.13: as abas são os botões de escala do jogo (.cfg-escala-bt, do estilo.css dele) */
    .aba { display: inline-flex; align-items: center; gap: 4px; height: 32px; min-width: 0; padding: 0 12px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .4px; }
    .aba[hidden] { display: none !important; }
    /* 1.13: linhas de ajuste iguais às da janela Configurações do jogo */
    .faixa, .ajustes { flex: none; display: block; }
    .faixa { margin-bottom: 10px; }
    .faixa .r-linhas, .faixa { padding: 0; }
    .faixa:not([hidden]) { display: flex; flex-direction: column; gap: 6px; }
    .r-linhas { padding: 0; overflow: visible; }
    .r-linha { min-height: 52px; }
    .r-status { display: block; margin-top: 2px; font: 500 12px/1.35 "Barlow", sans-serif; color: var(--dim); overflow-wrap: anywhere; }
    .r-ajustes { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin: 10px 0 2px; padding: 12px 14px 14px; border-radius: 6px; background: var(--fundo); box-shadow: inset 0 0 0 2px var(--linha); }
    .r-ajustes .lim { background: var(--sup2); }
    .r-ajustes .lims { width: 100%; }
    .r-mini { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; font: 700 12.5px/1.2 var(--tahoma); color: var(--texto); }
    .r-mini .cfg-toggle { --cfg-larg: 54px; --cfg-alt: 26px; --cfg-mao: 18px; }
    .painel.encaixado .cab .botao { display: none; }
    .painel[data-modo="desligado"] .faixa, .painel[data-modo="desligado"] .ajustes { filter: grayscale(1) brightness(.78); }
    .cfg-toggle:disabled, .cfg-escala-bt:disabled { cursor: not-allowed; }
    .botao.auto[aria-pressed="true"], .seg button.on.ouro { color: #3a2a00; text-shadow: 0 1px 0 rgba(255,255,255,.4); background: linear-gradient(180deg, #ffe9a8 0 4px, #d09a17 4px 100%); }
    .fechar { width: 30px; min-height: 30px; padding: 0; font: 700 16px/1 var(--tahoma); }
    .botao.alternar { min-width: 84px; }
    .abas { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .aba .n { margin-left: 4px; min-width: 16px; padding: 0 4px; border-radius: 8px; font: 700 10px/16px var(--tahoma); text-shadow: none; color: #fff; background: #d8574a; box-shadow: 0 0 0 1px var(--linha); }
    .vao { flex: 1; min-height: 140px; overflow: auto; padding: 12px; border-radius: 7px; background: var(--fundo);
      box-shadow: inset 0 0 0 2px var(--linha), 0 1px 0 var(--luz2); scrollbar-color: var(--vluz) transparent; }
    .painel.encaixado .vao { padding: 0; background: transparent; box-shadow: none; }
    .vao h4 { display: flex; align-items: center; gap: 8px; margin: 14px 0 8px; font: 700 11px/1 var(--tahoma); text-transform: uppercase; letter-spacing: .8px; color: var(--dim); }
    .vao h4::after { content: ""; flex: 1; height: 2px; background: var(--sup2); border-radius: 1px; }
    .vao h4:first-child { margin-top: 0; }
    .nota, .vazio { margin: 6px 0; color: var(--dim); font-size: 12px; }
    .acoes-aba { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .acoes-aba .quando { color: var(--dim); font-size: 12px; }
    .tab { width: 100%; border-collapse: collapse; }
    .tab th { position: sticky; top: 0; background: var(--sup2); color: var(--dim); font: 700 10px/1.2 var(--tahoma); text-transform: uppercase; letter-spacing: .5px;
      text-align: right; padding: 7px 6px; white-space: nowrap; }
    .tab td { padding: 5px 6px; text-align: right; border-top: 1px solid var(--sup2); white-space: nowrap; }
    .tab tbody tr:hover td { background: rgba(255,255,255,.04); }
    .tab th:first-child, .tab td:first-child { text-align: left; white-space: normal; }
    .tab tr.destaque td { background: rgba(111,208,138,.09); }
    .ok { color: #6fd08a; }
    .alerta { color: #f0a03c; }
    .ruim { color: #ffc9bd; }
    .dim { color: var(--dim); }
    .painel .rm-cartoes {
      --rm-fundo: var(--fundo); --rm-superficie: var(--sup2); --rm-borda: var(--vluz);
      --rm-texto: var(--texto); --rm-fraco: var(--dim); --rm-verde: #6fd08a;
      --rm-ambar: #f0a03c; --rm-vermelho: #ffc9bd; --rm-acao: var(--rx0); --rm-acao-texto: #fff;
    }
    .seg { display: inline-flex; gap: 6px; }
    .caixa { display: flex; gap: 10px; align-items: center; margin: 8px 0; cursor: pointer; font-weight: 600; color: var(--tdim); }
    .caixa input { appearance: none; -webkit-appearance: none; position: relative; flex: none; cursor: pointer; width: 40px; height: 22px; margin: 0; border: 0; border-radius: 6px;
      background: var(--vazio); box-shadow: inset 0 0 0 2px var(--linha), 0 2px 0 var(--base); }
    .caixa input::before { content: ""; position: absolute; top: 4px; left: 4px; width: 14px; height: 14px; border-radius: 4px;
      background: linear-gradient(180deg, var(--luz2) 0 4px, var(--pmad) 4px calc(100% - 3px), var(--base) calc(100% - 3px) 100%); box-shadow: inset 0 0 0 2px var(--linha); transition: left .12s; }
    .caixa input:checked { background: var(--rxe); }
    .caixa input:checked::before { left: 22px; background: linear-gradient(180deg, var(--rxl) 0 4px, var(--rx0) 4px calc(100% - 3px), var(--rxr) calc(100% - 3px) 100%); }
    .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0 14px; }
    .cartao-aj { padding: 10px 12px; margin-bottom: 10px; border-radius: 7px; background: var(--sup2); box-shadow: inset 0 0 0 1px var(--vluz); }
    .lims { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .lim { padding: 8px 10px; border-radius: 6px; background: var(--fundo); box-shadow: inset 0 0 0 1px var(--vluz); }
    .lim small { display: block; font: 700 9.5px/1.2 var(--tahoma); text-transform: uppercase; letter-spacing: .5px; color: var(--dim); }
    .lim b { display: block; margin-top: 3px; font-size: 15px; color: #fff; }
    /* modo claro do Piloto: só o vão clareia */
    :host-context(html[data-piloto-tema="claro"]) .painel {
      --fundo: #f4e3ca; --sup2: #fff6e8; --vluz: #dbbd98; --vazio: #ead2b2; --dim: #7e5548; color: #3a1d22;
    }
    :host-context(html[data-piloto-tema="claro"]) .painel .rm-cartoes {
      --rm-texto: #3a1d22; --rm-verde: #23793f; --rm-ambar: #a35a00; --rm-vermelho: #b2392b; --rm-fraco: #7e5548;
    }
    :host-context(html[data-piloto-tema="claro"]) .ok { color: #23793f; }
    :host-context(html[data-piloto-tema="claro"]) .alerta { color: #a35a00; }
    :host-context(html[data-piloto-tema="claro"]) .ruim { color: #b2392b; }
    :host-context(html[data-piloto-tema="claro"]) .caixa { color: #4c2a2a; }
    :host-context(html[data-piloto-tema="claro"]) .lim b { color: #3a1d22; }
    :host-context(html[data-piloto-tema="claro"]) .tab tbody tr:hover td { background: rgba(72, 14, 30, .05); }
    :host-context(html[data-piloto-tema="claro"]) .tab tr.destaque td { background: rgba(35, 121, 63, .1); }
    :host-context(html[data-piloto-tema="claro"]) .painel input:not([type="checkbox"]),
    :host-context(html[data-piloto-tema="claro"]) .painel select { color: #3a1d22; background: #fffbf4; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    [hidden] { display: none !important; }
  `;

  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtN = (v) => (typeof v === 'number' && Number.isFinite(v) ? nf.format(v) : '-');
  const fmtC = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 100000 ? nfc.format(v) : nf.format(v)) : '-');
  const fmtPct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)}%` : '-');
  const fmtData = (ms) => (typeof ms === 'number' ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
  const haQuanto = (ms) => {
    if (typeof ms !== 'number') return '';
    const sg = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (sg < 60) return `há ${sg} s`;
    const m = Math.floor(sg / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `há ${Math.floor(h / 24)} d`;
  };
  const ha = (ms) => {
    if (typeof ms !== 'number') return '';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    return s < 60 ? `há ${s} s` : `há ${Math.floor(s / 60)} min`;
  };

  const s = {
    cfg: Config.validar(null),
    base: Config.validar(null),
    ctx: null,
    modoPiloto: 'manual',
    estado: null,
    mercado: null,
    pessoal: { historico: null, historicoCompras: null, meus: null },
    eventos: [],
    tentativas: [],
    avisos: 0,
    aba: 'avisos',
    aberto: false,
    pedidoEm: {},
    carregando: {},
  };

  function erro(e) { try { console.error(PREFIXO, e); } catch { /* nada */ } }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  // Tabela montada com textContent: nome de item e nick de jogador nunca viram HTML.
  function tabela(colunas, linhas, classeDaLinha) {
    const t = el('table', 'tab');
    const cab = el('tr');
    for (const c of colunas) cab.append(el('th', null, c.titulo));
    const thead = el('thead');
    thead.append(cab);
    const tbody = el('tbody');
    for (const l of linhas) {
      const tr = el('tr', classeDaLinha ? classeDaLinha(l) : null);
      for (const c of colunas) {
        const v = c.valor(l);
        const td = el('td', c.classe ? c.classe(l) : null, v);
        if (c.dica) td.title = c.dica(l) || '';
        tr.append(td);
      }
      tbody.append(tr);
    }
    t.append(thead, tbody);
    return t;
  }

  function agoraServidor() {
    return s.estado && typeof s.estado.desvioMs === 'number' ? Date.now() - s.estado.desvioMs : null;
  }

  // ---- a barra ---------------------------------------------------------------------------------
  // Com o Piloto carregado (mundo MAIN), a barra é uma só: a dele. O radar só publica o estado e
  // se encaixa na aba Mercado do painel do Piloto.
  const comPiloto = () => document.documentElement.getAttribute('data-piloto') === '1';
  let encaixado = false;

  const barraHost = document.createElement('div');
  barraHost.id = 'radar-mercado-barra';
  const barraSombra = barraHost.attachShadow({ mode: 'open' });
  const barraEstilo = el('style');
  barraEstilo.textContent = CSS_BARRA;
  const barra = el('button', 'barra');
  barra.type = 'button';
  barra.setAttribute('aria-haspopup', 'dialog');
  const barraPonto = el('span', 'ponto');
  const barraTexto = el('span', 'estado', 'desligado');
  const barraSelo = el('span', 'selo');
  barraSelo.hidden = true;
  // Compra automática ligada: um selo "auto" ao lado do nome, sempre à vista.
  const barraAuto = el('span', 'auto', 'auto');
  barraAuto.hidden = true;
  barra.append(barraPonto, el('b', null, 'Radar'), barraAuto, barraTexto, barraSelo);
  barraSombra.append(barraEstilo, barra);
  barra.addEventListener('click', () => (s.aberto ? fechar() : abrir(s.avisos ? 'avisos' : s.aba)));

  function estadoCurto() {
    const e = s.estado;
    if (!s.cfg.radarLigado) return { texto: 'desligado', classe: '' };
    if (!e) return { texto: 'esperando o jogo', classe: 'pausa' };
    if (e.motivo) return { texto: `em pausa: ${e.motivo.charAt(0).toLowerCase()}${e.motivo.slice(1)}`, classe: 'pausa' };
    const falta = e.proximoCiclo ? Math.max(0, Math.round((e.proximoCiclo - Date.now()) / 1000)) : null;
    // Com aviso aberto o selo já diz o que importa: o texto fica curto para caber.
    // 1.12.3: no recuo (o servidor reclamou), diz que está espaçando em vez de "ao vivo".
    if (s.cfg.vigiaContinua && e.nivelRecuo > 0) return { texto: falta === null ? 'espaçando' : `espaçando: ${falta} s`, classe: 'pausa' };
    if (s.cfg.vigiaContinua) return { texto: 'vigiando ao vivo', classe: 'ok' };
    if (s.avisos) return { texto: 'vigiando', classe: 'ok' };
    return { texto: falta === null ? 'consultando' : `vigiando ${falta} s`, classe: 'ok' };
  }

  function pintarBarra() {
    const { texto, classe } = estadoCurto();
    barraTexto.textContent = texto;
    barraPonto.className = `ponto ${classe}`;
    barraSelo.hidden = s.avisos === 0;
    barraSelo.textContent = s.avisos === 1 ? '1 aviso' : `${s.avisos} avisos`;
    const auto = s.cfg.radarLigado && (s.cfg.compraAutomatica || s.cfg.compraAutomaticaPokemon);
    barraAuto.hidden = !auto;
    barra.title = `Radar do Mercado: ${texto}${auto ? ' · compra automática ligada' : ''}`;
    publicarParaPiloto(texto, classe, auto);
  }

  let publicado = '';
  function publicarParaPiloto(texto, classe, auto) {
    const e = s.estado || {};
    const detalhe = JSON.stringify({
      ligado: Boolean(s.cfg.radarLigado), texto, classe, avisos: s.avisos, auto: Boolean(auto),
      gastoAutoHoje: typeof e.gastoAutoHoje === 'number' ? e.gastoAutoHoje : 0,
      comprasNaFila: e.comprasNaFila || 0,
    });
    if (detalhe === publicado) return;
    publicado = detalhe;
    document.dispatchEvent(new CustomEvent('piloto:radar', { detail: detalhe }));
  }

  function modoBarra(fluxo) {
    barraHost.style.cssText = fluxo
      ? 'display:block !important; position:static !important; width:clamp(170px, 80%, 300px) !important; margin:0 auto 6px !important;'
      : 'display:block !important; position:fixed !important; right:16px !important; bottom:16px !important; width:260px !important; z-index:2147483000 !important;';
  }

  function cardDoPokemon() {
    const painel = document.getElementById('p-ativo');
    const card = document.getElementById('ativo-card');
    return painel && card && painel.contains(card) ? card : null;
  }

  let quadro = 0;
  function posicionarBarra() {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      try {
        if (comPiloto()) {
          if (barraHost.isConnected) barraHost.remove();
          return;
        }
        const card = cardDoPokemon();
        if (card) {
          // Com a /hunt colada no card, o radar fica logo antes dela.
          const antes = card.previousElementSibling;
          const alvo = antes && antes !== barraHost && antes.classList && antes.classList.contains('plt-barra') ? antes : card;
          if (barraHost.nextElementSibling !== alvo) alvo.before(barraHost);
          modoBarra(true);
        } else {
          if (barraHost.parentElement !== document.body && document.body) document.body.appendChild(barraHost);
          modoBarra(false);
        }
        if (s.aberto) posicionarPainel();
      } catch (e) {
        erro(e);
      }
    });
  }

  function vigiarLugar() {
    const alvo = document.getElementById('p-ativo') || document.body;
    new MutationObserver(posicionarBarra).observe(alvo, { childList: true, subtree: true });
    addEventListener('resize', posicionarBarra);
    // Rede de segurança para mudanças de layout que não passam pelo #p-ativo.
    setInterval(posicionarBarra, 1500);
    posicionarBarra();
  }

  // ---- o painel --------------------------------------------------------------------------------

  let painelHost = null;
  const p = {};

  function montarPainel() {
    if (painelHost) return;
    painelHost = document.createElement('div');
    painelHost.id = 'radar-mercado-tela';
    painelHost.style.cssText = 'display:none !important;';
    const sombra = painelHost.attachShadow({ mode: 'open' });
    // 1.13: o estilo.css do PRÓPRIO jogo também aqui dentro — as abas, linhas, interruptores e
    // botões do Radar são as mesmas peças das janelas do jogo.
    const cssJogo = document.querySelector('link[rel="stylesheet"][href*="estilo.css"]');
    if (cssJogo) { const lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = cssJogo.href; sombra.append(lk); }
    const estilo = el('style');
    estilo.textContent = CSS_PAINEL + ((globalThis.RadarCartoes && globalThis.RadarCartoes.CSS) || '') + ((globalThis.RadarRevendaUI && globalThis.RadarRevendaUI.CSS) || '');
    const painel = el('div', 'painel');
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-label', 'Radar do Mercado');

    const cab = el('header', 'cab');
    const titulo = el('div', 'titulo');
    titulo.append(el('h3', null, 'Radar do Mercado'));
    p.sub = el('small');
    titulo.append(p.sub);
    p.auto = el('button', 'botao auto', 'Automático: desligado');
    p.auto.type = 'button';
    p.auto.title = 'Compra automática: compra sozinho dentro do cofre do Piloto';
    p.alternar = el('button', 'botao alternar', 'Ligar');
    p.alternar.type = 'button';
    const fecharBtn = el('button', 'botao fechar', '×');
    fecharBtn.type = 'button';
    fecharBtn.setAttribute('aria-label', 'Fechar');
    cab.append(titulo, p.auto, p.alternar, fecharBtn);

    // Modo Auto do Piloto: só os interruptores do Radar, num bloco no topo (sem a aba Ajustes).
    p.faixa = el('div', 'faixa cfg-corpo');
    p.faixa.addEventListener('click', aoClicarNosAjustes);
    const abas = el('nav', 'abas');
    abas.setAttribute('role', 'tablist');
    p.abas = {};
    p.conteudos = {};
    const vao = el('div', 'vao');
    for (const [chave, rotulo] of [['avisos', 'Avisos'], ['mercado', 'Ofertas'], ['compras', 'Compras'], ['vendas', 'Vendas'], ['revenda', 'Revenda'], ['lucro', 'Lucro'], ['ajustes', 'Ajustes']]) {
      const b = el('button', 'aba cfg-escala-bt', rotulo);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.aba = chave;
      b.addEventListener('click', () => mostrarAba(chave));
      abas.append(b);
      p.abas[chave] = b;
      const secao = el('section');
      secao.dataset.conteudo = chave;
      secao.setAttribute('role', 'tabpanel');
      vao.append(secao);
      p.conteudos[chave] = secao;
    }
    p.nAvisos = el('span', 'n');
    p.abas.avisos.append(p.nAvisos);
    // Revenda: o número conta os cartões com algo a fazer (anunciar ou mudar preço) e lucro.
    p.nRevenda = el('span', 'n');
    p.nRevenda.hidden = true;
    p.abas.revenda.append(p.nRevenda);

    // Avisos: a área onde o painel.js põe os cartões.
    p.areaAvisos = el('div', 'rm-cartoes');
    p.avisosVazio = el('div');
    p.avisosTexto = el('p', 'vazio');
    p.abrirOpcoes = el('button', 'botao', 'Ajustes');
    p.abrirOpcoes.type = 'button';
    p.abrirOpcoes.addEventListener('click', () => mostrarAba('ajustes'));
    p.avisosVazio.append(p.avisosTexto, p.abrirOpcoes);
    p.conteudos.avisos.append(p.areaAvisos, p.avisosVazio);
    // Mercado, Compras e Vendas: repintados por inteiro quando chega dado novo.
    p.mercado = el('div');
    p.conteudos.mercado.append(p.mercado);
    p.compras = el('div');
    p.conteudos.compras.append(acoesDaAba('compras'), p.compras);
    p.vendas = el('div');
    p.conteudos.vendas.append(acoesDaAba('vendas'), p.vendas);
    // Revenda: a área onde o revenda.js põe os cartões.
    p.areaRevenda = el('div', 'rm-cartoes');
    p.revendaVazio = el('p', 'vazio');
    p.conteudos.revenda.append(acoesDaAba('revenda'), p.revendaVazio, p.areaRevenda);
    // Lucro (0.9.0): o que o radar comprou e você já vendeu.
    p.lucro = el('div');
    p.conteudos.lucro.append(acoesDaAba('lucro'), p.lucro);
    // Ajustes (1.1): o que antes ficava na página de opções, agora aqui, quase tudo automático.
    p.ajustes = el('div', 'ajustes');
    p.conteudos.ajustes.append(p.ajustes);

    p.ajustes.classList.add('cfg-corpo');
    p.ajustes.addEventListener('click', aoClicarNosAjustes);
    painel.append(cab, p.faixa, abas, vao);
    sombra.append(estilo, painel);
    p.painel = painel;
    (document.body || document.documentElement).appendChild(painelHost);

    p.alternar.addEventListener('click', () => alternarRadar().catch(erro));
    p.auto.addEventListener('click', () => alternarAutomatica().catch(erro));
    fecharBtn.addEventListener('click', fechar);
    mostrarAba(s.aba, true);
    pintarCabecalho();
  }

  function acoesDaAba(aba) {
    const linha = el('div', 'acoes-aba');
    const atualizar = el('button', 'botao', 'Atualizar');
    atualizar.type = 'button';
    const quando = el('span', 'quando');
    linha.append(atualizar, quando);
    p[`quando_${aba}`] = quando;
    atualizar.addEventListener('click', () => pedirDaAba(aba, true));
    return linha;
  }

  function mostrarAba(aba, semPedir) {
    s.aba = aba;
    if (aba === 'ajustes' && s.modoPiloto !== 'manual' && encaixado) aba = s.aba = 'avisos';
    for (const [chave, b] of Object.entries(p.abas)) { b.setAttribute('aria-selected', String(chave === aba)); b.classList.toggle('on', chave === aba); }
    for (const [chave, secao] of Object.entries(p.conteudos)) secao.hidden = chave !== aba;
    if (!semPedir) pedirDaAba(aba, false);
    pintarAba(aba);
  }

  function pedirDaAba(aba, forcar) {
    // Revenda: o radar decide o que está velho (anúncios, compras, livros dos itens).
    if (aba === 'revenda') { bus.emit('revenda:pedir', { forcar: Boolean(forcar) }); return; }
    // Lucro: o histórico de vendas mais recente (pelo radar) e a conta do service worker.
    if (aba === 'lucro') {
      if (forcar || Date.now() - (s.pedidoEm.historico || 0) >= REPEDIR_MS) {
        s.pedidoEm.historico = Date.now();
        bus.emit('tela:pedir', { tipo: 'historico' });
      }
      pedirLucro().catch(erro);
      return;
    }
    const tipos = aba === 'compras' ? ['historicoCompras'] : aba === 'vendas' ? ['meus', 'historico'] : [];
    for (const tipo of tipos) {
      if (!forcar && Date.now() - (s.pedidoEm[tipo] || 0) < REPEDIR_MS) continue;
      s.pedidoEm[tipo] = Date.now();
      s.carregando[tipo] = true;
      bus.emit('tela:pedir', { tipo });
    }
    if (aba === 'compras') carregarTentativas();
    if (tipos.length) pintarAba(aba);
  }

  async function carregarTentativas() {
    try {
      const r = await chrome.runtime.sendMessage({ tipo: 'alertas:listar', limite: 30 });
      s.tentativas = ((r && r.dados) || []).filter((a) => a.resultado);
      if (s.aba === 'compras') pintarCompras();
    } catch (e) {
      erro(e);
    }
  }

  function posicionarPainel() {
    if (!p.painel || encaixado) return;
    const ancora = document.getElementById('p-ativo') || barraHost;
    const base = ancora.getBoundingClientRect();
    const larg = p.painel.offsetWidth || 600;
    const alt = p.painel.offsetHeight || 400;
    let left = base.right + 10;
    if (left + larg > innerWidth - 8) left = base.left - larg - 10;
    if (left < 8) left = Math.max(8, innerWidth - larg - 8);
    const top = Math.min(Math.max(8, base.top - 40), Math.max(8, innerHeight - alt - 8));
    p.painel.style.left = `${Math.round(left)}px`;
    p.painel.style.top = `${Math.round(top)}px`;
  }

  const aoTeclar = (ev) => { if (ev.key === 'Escape') fechar(); };
  const aoClicarFora = (ev) => {
    const caminho = ev.composedPath();
    if (!caminho.includes(painelHost) && !caminho.includes(barraHost)) fechar();
  };

  function abrir(aba) {
    if (comPiloto()) {
      // O Piloto abre o painel dele na aba Mercado, que nos chama de volta (piloto:mercado-montar).
      if (aba) s.aba = aba;
      if (encaixado) mostrarAba(s.aba);
      else document.dispatchEvent(new CustomEvent('piloto:abrir', { detail: JSON.stringify({ aba: s.aba }) }));
      return;
    }
    montarPainel();
    bus.emit('tela:quero-estado', null);
    s.aberto = true;
    painelHost.style.cssText = 'display:block !important;';
    mostrarAba(aba || s.aba);
    posicionarPainel();
    barraSelo.classList.remove('pisca');
    addEventListener('keydown', aoTeclar, true);
    addEventListener('pointerdown', aoClicarFora, true);
  }

  function fechar() {
    if (!s.aberto || encaixado) return;
    s.aberto = false;
    painelHost.style.cssText = 'display:none !important;';
    removeEventListener('keydown', aoTeclar, true);
    removeEventListener('pointerdown', aoClicarFora, true);
  }

  // O Piloto publica o ouro/h e o teto do cofre: os limites se recalculam com eles.
  document.addEventListener('piloto:contexto', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
      s.ctx = { ouroH: n(d.ouroH), teto: n(d.teto), livre: n(d.livre) };
      s.cfg = Config.calibrar(s.base, s.ctx);
      if (['desligado', 'manual', 'automatico'].includes(d.modo) && d.modo !== s.modoPiloto) { s.modoPiloto = d.modo; aplicarModoTela(); }
    } catch (e) { erro(e); }
  });

  // Voto no TopIdle (1.9): o Piloto pega o link na janela do jogo; a extensão abre e fecha a aba.
  // Só aceita link do topidle.com (a página não manda abrir outro site).
  document.addEventListener('piloto:voto-abrir', (ev) => {
    try {
      const u = new URL(JSON.parse(ev.detail).url);
      if (u.protocol !== 'https:' || !(u.hostname === 'topidle.com' || u.hostname.endsWith('.topidle.com'))) return;
      chrome.runtime.sendMessage({ tipo: 'voto:abrir', url: u.href }).catch(erro);
    } catch (e) { erro(e); }
  });
  document.addEventListener('piloto:voto-fechar', () => { chrome.runtime.sendMessage({ tipo: 'voto:fechar' }).catch(erro); });

  // ---- encaixe na aba Mercado do Piloto -------------------------------------------------------
  document.addEventListener('piloto:mercado-montar', () => {
    try {
      const slot = document.getElementById('piloto-slot-mercado');
      if (!slot) return;
      montarPainel();
      if (s.aberto && !encaixado) fechar();
      encaixado = true;
      p.painel.classList.add('encaixado');
      p.painel.style.left = p.painel.style.top = '';
      if (painelHost.parentElement !== slot) slot.replaceChildren(painelHost);
      painelHost.style.cssText = 'display:block !important; height:100% !important;';
      s.aberto = true;
      bus.emit('tela:quero-estado', null);
      aplicarModoTela();
      mostrarAba(s.aba);
      pintarCabecalho();
      barraSelo.classList.remove('pisca');
    } catch (e) {
      erro(e);
    }
  });
  document.addEventListener('piloto:mercado-soltar', () => {
    if (!encaixado) return;
    encaixado = false;
    s.aberto = false;
    p.painel.classList.remove('encaixado');
    painelHost.style.cssText = 'display:none !important;';
    aplicarModoTela();
    (document.body || document.documentElement).appendChild(painelHost);
  });

  async function alternarRadar() {
    const salvo = await chrome.storage.local.get(Config.CHAVE);
    const atual = Config.validar(salvo[Config.CHAVE]);
    if (atual.radarLigado && s.estado && String(s.estado.motivo || '').startsWith(MOTIVO_FALHAS)) {
      // Retomar: desliga e liga, o que zera o recuo.
      await chrome.storage.local.set({ [Config.CHAVE]: { ...atual, radarLigado: false } });
      await chrome.storage.local.set({ [Config.CHAVE]: { ...atual, radarLigado: true } });
      return;
    }
    await chrome.storage.local.set({ [Config.CHAVE]: { ...atual, radarLigado: !atual.radarLigado } });
  }

  async function alternarAutomatica() {
    const salvo = await chrome.storage.local.get(Config.CHAVE);
    const atual = Config.validar(salvo[Config.CHAVE]);
    const ligar = !(atual.compraAutomatica || atual.compraAutomaticaPokemon);
    if (!ligar) document.dispatchEvent(new CustomEvent('piloto:radar-manual', { detail: '{}' }));
    await chrome.storage.local.set({ [Config.CHAVE]: { ...atual, ...(ligar ? Config.PERFIS.automatico : { compraAutomatica: false, compraAutomaticaPokemon: false, revendaAutomatica: false }) } });
  }

  // ---- pintura das abas ------------------------------------------------------------------------

  function pintarCabecalho() {
    if (!p.sub) return;
    const e = s.estado;
    const partes = [];
    if (!s.cfg.radarLigado) partes.push('Radar desligado');
    else if (e && e.motivo) partes.push(`Em pausa: ${e.motivo}`);
    else if (e) {
      partes.push(`Vigiando ${e.itensCobertos || 0} itens`);
      if (s.cfg.vigiaContinua && e.nivelRecuo > 0) partes.push(`espaçando (o servidor pediu calma): próxima em ${Math.max(0, Math.round(((e.proximoCiclo || Date.now()) - Date.now()) / 1000))} s`);
      else if (s.cfg.vigiaContinua) partes.push('ao vivo, sem intervalo'); else if (e.proximoCiclo) partes.push(`próxima consulta em ${Math.max(0, Math.round((e.proximoCiclo - Date.now()) / 1000))} s`);
    } else partes.push('Esperando o jogo');
    if (e && typeof e.desvioMs === 'number') partes.push(`relógio ${e.desvioMs >= 0 ? '+' : ''}${(e.desvioMs / 1000).toFixed(1).replace('.', ',')} s`);
    if (e && typeof e.saldo === 'number') partes.push(`saldo ${fmtC(e.saldo)}`);
    if ((s.cfg.compraAutomatica || s.cfg.compraAutomaticaPokemon) && e && typeof e.gastoAutoHoje === 'number') {
      partes.push(s.cfg.gastoMaximoDia > 0 ? `automático hoje ${fmtC(e.gastoAutoHoje)} de ${fmtC(s.cfg.gastoMaximoDia)}` : `automático hoje ${fmtC(e.gastoAutoHoje)}`);
    }
    // A notificação do sistema pode não aparecer: o motivo fica aqui até ligar de novo.
    const d = s.autoDesligada;
    if (d && typeof d.ate === 'number' && Date.now() < d.ate) {
      partes.push(`automático em pausa até ${new Date(d.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}: ${d.motivo}`);
    } else if (!s.cfg.compraAutomatica && d && typeof d.em === 'number' && typeof d.ate !== 'number') {
      partes.push(`automático desligou sozinho às ${new Date(d.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}: ${d.motivo}`);
    }
    p.sub.textContent = partes.join(' · ');
    // O botão liga e desliga o automático inteiro: compra de itens e pokémon e revenda.
    const ligadoAuto = s.cfg.compraAutomatica || s.cfg.compraAutomaticaPokemon;
    p.auto.textContent = ligadoAuto ? 'Auto ✓' : 'Auto';
    p.auto.title = 'Compra itens e pokémon em ouro e revende os itens sozinho, dentro do cofre do Piloto.';
    p.auto.setAttribute('aria-pressed', String(ligadoAuto));
    const pausadoPorFalha = s.cfg.radarLigado && e && String(e.motivo || '').startsWith(MOTIVO_FALHAS);
    p.alternar.textContent = pausadoPorFalha ? '▶ Retomar' : s.cfg.radarLigado ? '❚❚ Pausar' : '▶ Ligar';
    pintarFaixa();
    p.nAvisos.textContent = String(s.avisos);
    p.nAvisos.hidden = s.avisos === 0;
    p.avisosVazio.hidden = s.avisos > 0;
    if (!s.avisos) p.avisosTexto.textContent = textoSemAvisos();
  }

  // Aba Avisos vazia: diz o que está segurando os avisos, para não parecer que o radar parou.
  function textoSemAvisos() {
    const partes = ['Nenhum aviso aberto.'];
    if (!s.cfg.radarLigado) return 'Nenhum aviso aberto: o radar está desligado. Ligue no botão acima.';
    // O motivo vai direto aqui, para não precisar procurar na aba Mercado.
    const semAviso = s.mercado ? s.mercado.linhas.filter(linhaSemAviso) : [];
    for (const l of semAviso.slice(0, 2)) partes.push(`${porQueNaoAvisou(l)}.`);
    if (semAviso.length > 2) partes.push(`Mais ${semAviso.length - 2} na aba Mercado.`);
    if (partes.length === 1) partes.push(`Quando o radar achar um anúncio pelo menos ${Math.round(s.cfg.descontoMinimo * 100)}% abaixo do preço de revenda, ele aparece aqui.`);
    return partes.join(' ');
  }

  // Linha verde (passou do desconto) conferida que não virou aviso nem compra automática.
  const linhaSemAviso = (l) => l.destaque && ((l.motivos && l.motivos.length) || l.motivoAuto);

  function porQueNaoAvisou(l) {
    const cab = typeof l.qtdAnuncio === 'number'
      ? `${l.nome} (${fmtN(l.qtdAnuncio)} ${l.qtdAnuncio === 1 ? 'unidade' : 'unidades'}${typeof l.lucroTotal === 'number' ? `, lucro ${fmtC(l.lucroTotal)}` : ''})`
      : l.nome;
    const partes = [];
    if (l.motivos && l.motivos.length) partes.push(`aviso: ${l.motivos.map(explicarMotivo).join('; ')}`);
    else partes.push('virou aviso');
    if (l.motivoAuto) partes.push(`compra automática: ${explicarMotivoAuto(l.motivoAuto)}`);
    return `${cab}: ${partes.join('; ')}`;
  }

  function explicarMotivoAuto(motivo) {
    switch (motivo) {
      case 'lucro abaixo do mínimo do automático':
        return `lucro abaixo dos ${fmtC(s.cfg.lucroMinimoAuto)} do automático`;
      case 'desconto abaixo do mínimo do automático':
        return `menos de ${Math.round(s.cfg.descontoMinimoAuto * 100)}% abaixo, o mínimo do automático`;
      case 'teto do dia atingido':
        return s.cfg.gastoMaximoDia > 0 ? `teto do dia (${fmtC(s.cfg.gastoMaximoDia)}) atingido` : 'teto do dia do cofre atingido';
      default:
        return motivo;
    }
  }

  function pintarRevenda() {
    if (!p.nRevenda) return;
    const d = s.revenda;
    const nPk = s.revendaPk && RvPk ? (s.revendaPk.cartoes || []).filter(RvPk.comAcao).length : 0;
    const n = (d ? (d.sugestoes || []).filter(Rv.comAcao).length : 0) + nPk;
    p.nRevenda.textContent = String(n);
    p.nRevenda.hidden = n === 0;
    if (p.quando_revenda) {
      p.quando_revenda.textContent = !d ? '' : d.lendo ? 'lendo o mercado…' : typeof d.anuncios === 'number' ? `${d.anuncios} de ${d.max} anúncios abertos` : '';
    }
    let vazio = '';
    const categoria = globalThis.RadarRevendaUI && globalThis.RadarRevendaUI.categoria ? globalThis.RadarRevendaUI.categoria() : 'item';
    if (categoria !== 'item') vazio = '';
    else if (!d || !d.inventarioOk) vazio = 'Esperando o inventário do jogo. Ele chega com o estado da conta; se não aparecer, aperte F5 na aba do jogo.';
    else if (!(d.sugestoes || []).length) vazio = 'Nenhum item das categorias vigiadas no inventário.';
    p.revendaVazio.textContent = vazio;
    p.revendaVazio.hidden = !vazio;
  }

  async function pedirLucro() {
    s.carregandoLucro = true;
    if (s.aba === 'lucro') pintarLucro();
    try {
      const r = await chrome.runtime.sendMessage({ tipo: 'lucro:resumo' });
      s.lucro = r && r.dados ? r.dados : null;
      s.lucroEm = Date.now();
    } finally {
      s.carregandoLucro = false;
      if (s.aberto && s.aba === 'lucro') pintarLucro();
    }
  }

  function pintarLucro() {
    if (!p.lucro) return;
    const alvo = p.lucro;
    alvo.textContent = '';
    if (p.quando_lucro) p.quando_lucro.textContent = s.carregandoLucro ? 'calculando…' : s.lucroEm ? `às ${fmtData(s.lucroEm)}` : '';
    const d = s.lucro;
    if (!d) { alvo.append(el('p', 'vazio', s.carregandoLucro ? 'Calculando o lucro.' : 'Sem dados ainda.')); return; }
    const sinal = (v) => `${v > 0 ? '+' : ''}${fmtN(v)}`;
    const t = d.totais;
    alvo.append(el('p', 'lucro-totais', `Hoje ${sinal(t.hoje)} · 7 dias ${sinal(t.seteDias)} · desde o começo ${sinal(t.tudo)} em ${fmtN(t.vendas)} venda${t.vendas === 1 ? '' : 's'}`));
    alvo.append(el('p', 'nota', `Só o que o radar comprou e você vendeu depois. O que você recebeu já vem sem os 15%; no pokémon, a diária do anúncio entra quando o radar viu o anúncio. Item: as unidades vendidas saem das compras do radar mais antigas primeiro; o que passar delas é drop seu e fica fora. Em estoque (comprado pelo radar e ainda não vendido): ${fmtN(t.emEstoque)} de ouro.`));
    if (d.linhas.length) {
      alvo.append(tabela([
        { titulo: 'Vendido', valor: (l) => fmtData(l.vendaEm) },
        { titulo: 'O quê', valor: (l) => (l.tipo === 'pokemon' ? `${l.nome} (pokémon)` : l.nome) },
        { titulo: 'Qtd', valor: (l) => fmtN(l.qtd) },
        { titulo: 'Pagou', valor: (l) => fmtN(l.custo) },
        { titulo: 'Recebeu', valor: (l) => `${fmtN(l.liquido)}${l.diaria ? ` (−${fmtN(l.diaria)} de diária)` : ''}` },
        { titulo: 'Lucro', valor: (l) => sinal(l.lucro) },
      ], d.linhas));
    } else {
      alvo.append(el('p', 'vazio', 'Nenhuma venda do que o radar comprou, na página mais recente do seu histórico de vendas. O radar lê o histórico a cada 10 min.'));
    }
    if (d.estoque.length) {
      alvo.append(el('h4', null, 'Comprado pelo radar e ainda não vendido'));
      alvo.append(tabela([
        { titulo: 'O quê', valor: (e) => (e.tipo === 'pokemon' ? `${e.nome} (pokémon)` : e.nome) },
        { titulo: 'Qtd', valor: (e) => fmtN(e.qtd) },
        { titulo: 'Pagou', valor: (e) => fmtN(e.custo) },
      ], d.estoque));
    }
  }

  function pintarAba(aba) {
    if (!painelHost) return;
    if (aba === 'lucro') pintarLucro();
    if (aba === 'revenda') pintarRevenda();
    if (aba === 'mercado') pintarMercado();
    if (aba === 'compras') pintarCompras();
    if (aba === 'vendas') pintarVendas();
    if (aba === 'ajustes') pintarAjustes();
  }

  // ---- Ajustes -----------------------------------------------------------------------------------
  const NOMES_CATEGORIA = { stone: 'Pedras', fragment: 'Fragmentos', boss: 'Fichas de boss', ticket: 'Tickets', tm: 'TMs', mega: 'Mega pedras', skin: 'Skins', ovo: 'Ovos' };
  let catalogoCats = null;

  async function salvarConfig(mudanca) {
    const salvo = await chrome.storage.local.get(Config.CHAVE);
    const atual = Config.validar(salvo[Config.CHAVE]);
    await chrome.storage.local.set({ [Config.CHAVE]: { ...atual, ...mudanca } });
  }

  function modoDoRadar(c) {
    if (!c.radarLigado) return 'desligado';
    return c.compraAutomatica || c.compraAutomaticaPokemon ? 'automatico' : 'manual';
  }

  // ---- 1.13: os ajustes do Radar como linhas da janela Configurações do jogo -------------------
  const escH = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const trava = () => s.modoPiloto === 'desligado';
  const ESCOLHAS_AUTO = ['radarLigado', 'compraAutomatica', 'compraAutomaticaPokemon', 'revendaAutomatica'];
  const tg = (k, on, inverso = false) => `<button type="button" class="cfg-toggle${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" data-cfg="${k}"${inverso ? ' data-inverso="1"' : ''}${trava() ? ' disabled' : ''}></button>`;
  const linhaR = ({ nome, dica = '', k = null, on = false, inverso = false, status = '', ajustes = '' }) => `<div class="cfg-linha r-linha">
      <span class="cfg-rot"><span class="cfg-cola"><span class="cfg-nome">${nome}</span>${dica ? '<button type="button" class="cfg-ajuda" aria-expanded="false" title="O que é isto?"><b aria-hidden="true">?</b></button>' : ''}</span>${status ? `<small class="r-status">${status}</small>` : ''}</span>
      ${k ? tg(k, on, inverso) : '<span></span>'}
      ${dica ? `<p class="cfg-desc">${escH(dica)}</p>` : ''}
      ${ajustes ? `<div class="r-ajustes">${ajustes}</div>` : ''}
    </div>`;
  const miniR = (k, on, rotulo, inverso = false) => `<label class="r-mini">${tg(k, on, inverso)}<span>${rotulo}</span></label>`;
  function statusRadar() {
    const e = s.estado;
    if (!s.cfg.radarLigado) return 'desligado';
    if (e && e.motivo) return `em pausa: ${escH(e.motivo)}`;
    return e ? `vigiando ${e.itensCobertos || 0} itens${s.cfg.vigiaContinua ? ' ao vivo' : ''}` : 'esperando o jogo';
  }
  function linhasPrincipais(b) {
    const e = s.estado;
    const gasto = e && typeof e.gastoAutoHoje === 'number' ? `comprou ${fmtC(e.gastoAutoHoje)} hoje` : '';
    return linhaR({ nome: 'Radar do Mercado', k: 'radarLigado', on: b.radarLigado, status: statusRadar(), dica: 'Vigia o Mercado sem parar e avisa as oportunidades em ouro. Gema e diamante nunca.' })
      + linhaR({ nome: 'Comprar itens sozinho', k: 'compraAutomatica', on: b.compraAutomatica, status: b.compraAutomatica ? gasto : '', dica: 'Tudo o que vira aviso é comprado sozinho, se couber no ouro livre do cofre do Piloto. Entra em todos os sorteios que passam nas regras, vários ao mesmo tempo.' })
      + linhaR({ nome: 'Comprar pokémon sozinho', k: 'compraAutomaticaPokemon', on: b.compraAutomaticaPokemon, dica: 'Não shiny, em ouro, pelas vendas parecidas dos últimos 30 dias. Com 5 a 7 vendas parecidas, só compra se der lucro mesmo vendendo pelo preço da parecida mais barata. Quanto gastar é o cofre que decide.' })
      + linhaR({ nome: 'Revender sozinho', k: 'revendaAutomatica', on: b.revendaAutomatica, status: b.revendaAutomatica ? 'anuncia, baixa e sobe o preço a cada 2 min' : '', dica: 'Anuncia o que está parado, baixa o preço quando alguém passa na frente e sobe quando você ficou 5% abaixo do próximo. Sempre 1 abaixo do menor anúncio de outro jogador, nunca abaixo do custo + 15%. Pokémon também: só os que não servem para você (fora do time, do PvP e dos que valem treinar), nunca shiny nem lendário, com 5+ vendas parecidas e nunca abaixo do que você pagou; a diária passa pelo cofre.' });
  }
  function pintarFaixa() {
    if (!p.faixa) return;
    const auto = encaixado && s.modoPiloto !== 'manual';
    p.faixa.hidden = !auto;
    if (!auto) return;
    const html = linhasPrincipais(s.base);
    if (p.faixa._html !== html) { p.faixa._html = html; p.faixa.innerHTML = html; }
  }
  function aplicarModoTela() {
    if (!p.painel) return;
    p.painel.dataset.modo = s.modoPiloto || 'manual';
    if (p.abas && p.abas.ajustes) p.abas.ajustes.hidden = encaixado && s.modoPiloto !== 'manual';
    if (p.abrirOpcoes) p.abrirOpcoes.hidden = encaixado && s.modoPiloto !== 'manual';
    if (s.aba === 'ajustes' && encaixado && s.modoPiloto !== 'manual') mostrarAba('avisos', true);
    pintarFaixa();
    if (s.aba === 'ajustes') pintarAjustes();
  }
  function aoClicarNosAjustes(ev) {
    const t = ev.target.closest('button');
    if (!t || t.disabled) return;
    if (t.matches('.cfg-ajuda')) { const l = t.closest('.cfg-linha'); if (l) { l.classList.toggle('aberta'); t.setAttribute('aria-expanded', String(l.classList.contains('aberta'))); } return; }
    if (t.matches('.cfg-toggle[data-cfg]')) {
      const k = t.dataset.cfg;
      const ligado = !t.classList.contains('on');
      // No Automático, o que você desligar fica desligado também depois de recarregar a página.
      if (s.modoPiloto === 'automatico' && ESCOLHAS_AUTO.includes(k)) {
        chrome.storage.local.get('radar:auto-escolhas').then((r) => chrome.storage.local.set({ 'radar:auto-escolhas': { ...(r['radar:auto-escolhas'] || {}), [k]: ligado } })).catch(erro);
      }
      if (k === 'vigiaContinua') salvarConfig({ vigiaContinua: ligado, intervaloS: 30 }).catch(erro);
      else salvarConfig({ [k]: t.dataset.inverso ? !ligado : ligado }).catch(erro);
      return;
    }
    if (t.matches('[data-categoria]')) {
      const set = new Set(s.base.categorias);
      if (set.has(t.dataset.categoria)) set.delete(t.dataset.categoria); else set.add(t.dataset.categoria);
      salvarConfig({ categorias: [...set] }).catch(erro);
    }
  }

  async function pintarAjustes() {
    const alvo = p.ajustes;
    if (!alvo) return;
    if (!catalogoCats) {
      try {
        const r = await chrome.storage.local.get('radar:catalogo');
        const itens = (r['radar:catalogo'] && r['radar:catalogo'].itens) || [];
        const n = new Map();
        for (const i of itens) if (i && !Config.CATEGORIAS_PROIBIDAS.includes(i.categoria)) n.set(i.categoria, (n.get(i.categoria) || 0) + 1);
        catalogoCats = n.size ? n : new Map(Config.PADRAO.categorias.map((c) => [c, null]));
      } catch (e) { erro(e); catalogoCats = new Map(Config.PADRAO.categorias.map((c) => [c, null])); }
    }
    const c = s.cfg;
    const b = s.base;
    const ctx = s.ctx;
    const teto = ctx && typeof ctx.teto === 'number' && ctx.teto > 0 ? ctx.teto : null;
    const livre = ctx && typeof ctx.livre === 'number' ? ctx.livre : null;
    const blocos = [
      ['Lucro mín.', fmtC(c.lucroMinimo), 'O mesmo para avisar e para comprar sozinho'],
      ['Desconto mín.', fmtPct(c.descontoMinimo), 'Abaixo do preço de revenda (próximo da fila, mediana 24 h, média 7 d)'],
      ['Por compra', c.calibrada && livre !== null ? fmtC(livre) : c.gastoMaximoAuto > 0 ? fmtC(c.gastoMaximoAuto) : 'saldo', 'O ouro livre do cofre agora'],
      ['Teto do dia', c.calibrada && teto ? fmtC(teto) : c.gastoMaximoDia > 0 ? fmtC(c.gastoMaximoDia) : '—', 'O do cofre: soma toda a automação'],
      ['Pokémon', `${fmtPct(c.descontoMinimoPokemon)} · ${fmtC(c.lucroMinimoPokemon)}`, 'Desconto e lucro mínimos para pokémon'],
      ['Ouro/h base', ctx && ctx.ouroH ? fmtC(ctx.ouroH) : 'medindo', 'Enquanto mede, valem os pisos'],
    ];
    const lims = `<div class="lims">${blocos.map(([k, v, d]) => `<div class="lim" title="${escH(d)}"><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    const cats = `<div class="cfg-escala">${[...catalogoCats].map(([cat, n]) => `<button type="button" class="cfg-escala-bt${b.categorias.includes(cat) ? ' on' : ''}" data-categoria="${escH(cat)}"${trava() ? ' disabled' : ''}>${escH(NOMES_CATEGORIA[cat] || cat)}${typeof n === 'number' ? ` (${n})` : ''}</button>`).join('')}</div>`;
    const html = `<div class="cfg-linhas r-linhas">
      ${linhasPrincipais(b)}
      ${linhaR({ nome: 'Vigia contínua', k: 'vigiaContinua', on: b.vigiaContinua, dica: 'Uma varredura atrás da outra, sem intervalo. O freio é só o limite de leituras do servidor; se ele reclamar, o radar espaça sozinho até normalizar.' })}
      ${linhaR({ nome: 'Calcular os limites sozinho', k: 'ajusteAutomatico', on: b.ajusteAutomatico, dica: 'Pelo seu ouro/h e pelo cofre do Piloto. O motivo de não comprar aparece no Resumo.', ajustes: lims })}
      ${linhaR({ nome: 'O que vigiar', dica: 'As categorias de itens que o radar olha. Pokémon em ouro: os anúncios de pokémon, não shiny.', ajustes: `${cats}${miniR('pokemon', b.pokemon, 'Pokémon em ouro')}${miniR('revendaSoDoRadar', !b.revendaSoDoRadar, 'Revender também os seus drops', true)}` })}
      ${linhaR({ nome: 'Como avisar', ajustes: `${miniR('notificacoes', b.notificacoes, 'Notificação')}${miniR('som', b.som, 'Som')}${miniR('abrirPainelNoAviso', b.abrirPainelNoAviso, 'Abrir o painel no aviso')}` })}
    </div>`;
    if (alvo._html !== html) { alvo._html = html; alvo.innerHTML = html; }
  }

  const FONTES = { proximo: 'próximo da fila', mediana24h: 'mediana de 24 h', media7d: 'média de 7 dias' };

  function pintarMercado() {
    const alvo = p.mercado;
    alvo.textContent = '';
    const m = s.mercado;
    if (!m || !m.linhas.length) {
      alvo.append(el('p', 'vazio', s.cfg.radarLigado ? 'Esperando a primeira consulta do radar.' : 'Ligue o radar para ver o mercado dos itens vigiados.'));
      return;
    }
    alvo.append(el('p', 'nota', `${m.linhas.length} itens com anúncio em ouro, atualizado ${ha(m.em)}. Revenda: o menor entre a mediana de 24 h, a média de 7 dias e, nos itens conferidos (•), o próximo da fila.`));
    alvo.append(tabela([
      { titulo: 'Item', valor: (l) => l.nome },
      { titulo: 'Menor agora', valor: (l) => fmtN(l.minGold) },
      { titulo: 'Revenda', valor: (l) => `${fmtN(l.revenda)}${l.conferido ? ' •' : ''}`, dica: (l) => (l.fonteRevenda ? `pela ${FONTES[l.fonteRevenda] || l.fonteRevenda}` : '') },
      { titulo: 'Abaixo', valor: (l) => fmtPct(l.desconto), classe: (l) => (l.destaque ? 'ok' : l.desconto !== null && l.desconto < 0 ? 'dim' : null) },
      { titulo: 'Por semana', valor: (l) => fmtC(l.volume7d), classe: (l) => (l.iliquido ? 'alerta' : null) },
      { titulo: 'Anúncios', valor: (l) => fmtN(l.anuncios) },
    ], m.linhas.slice(0, MAX_LINHAS_MERCADO), (l) => (l.destaque ? 'destaque' : null)));
    // Linha verde que não virou aviso (nem compra automática): diz por quê, com a quantidade e
    // o lucro do anúncio (vem da última conferência do item).
    const semAviso = m.linhas.filter(linhaSemAviso);
    if (semAviso.length) {
      alvo.append(el('h4', null, 'Por que a linha verde não virou aviso'));
      for (const l of semAviso) alvo.append(el('p', 'nota', `${porQueNaoAvisou(l)}.`));
    }
  }

  function explicarMotivo(motivo) {
    switch (motivo) {
      case 'lucro abaixo do mínimo':
        return `lucro total abaixo de ${fmtC(s.cfg.lucroMinimo)} com a quantidade do anúncio`;
      case 'referência pouco confiável':
        return 'sem próximo na fila: a revenda viria só do histórico e da média de 7 dias';
      case 'desconto abaixo do mínimo':
        return `o anúncio de outro jogador não está ${Math.round(s.cfg.descontoMinimo * 100)}% abaixo do próximo da fila`;
      default:
        return motivo;
    }
  }

  function situacao(tipo) {
    const d = s.pessoal[tipo];
    if (s.carregando[tipo]) return 'carregando…';
    if (d && d.erro) return d.erro;
    if (d && d.em) return `atualizado ${ha(d.em)}${d.doJogo ? ' (pelo jogo)' : ''}`;
    return '';
  }

  function pintarCompras() {
    if (!p.compras) return;
    const alvo = p.compras;
    alvo.textContent = '';
    p.quando_compras.textContent = situacao('historicoCompras');
    alvo.append(el('h4', null, 'Suas compras'));
    const ao = s.eventos.filter((e) => e.k === 'marketComprado');
    const hist = s.pessoal.historicoCompras && s.pessoal.historicoCompras.dados ? Pessoal.normalizarHistorico(s.pessoal.historicoCompras.dados.linhas, 'compra') : [];
    if (ao.length) {
      alvo.append(tabela([
        { titulo: 'Agora há pouco', valor: (e) => e.descricao || 'compra' },
        { titulo: 'Quando', valor: (e) => fmtData(e.em) },
        { titulo: 'Origem', valor: (e) => (e.doRadar ? 'radar' : 'você no jogo') },
      ], ao.slice(0, 10)));
    }
    if (hist.length) {
      alvo.append(tabela([
        { titulo: 'Item', valor: (l) => l.nome },
        { titulo: 'Qtd', valor: (l) => fmtN(l.qtd) },
        { titulo: 'Pagou', valor: (l) => fmtN(l.bruto) },
        { titulo: 'Por unidade', valor: (l) => fmtN(l.unitario) },
        { titulo: 'Vendedor', valor: (l) => l.contraparte || '-' },
        { titulo: 'Quando', valor: (l) => fmtData(l.em) },
      ], hist));
    } else if (!ao.length) {
      alvo.append(el('p', 'vazio', s.carregando.historicoCompras ? 'Carregando o seu histórico de compras.' : 'Nenhuma compra na página mais recente do histórico.'));
    }
    alvo.append(el('h4', null, 'Pedidos de compra do radar'));
    alvo.append(el('p', 'nota', 'Cada pedido que o radar mandou ao jogo, pelo seu clique ou pela compra automática, e o que o servidor respondeu. Comprado de verdade é só o que aparece também em "Suas compras".'));
    if (!s.tentativas.length) {
      alvo.append(el('p', 'vazio', 'Nenhum pedido de compra feito pelo radar ainda.'));
    } else {
      alvo.append(tabela([
        { titulo: 'Item', valor: (a) => a.nome },
        { titulo: 'Preço', valor: (a) => `${fmtN(a.preco)} × ${fmtN(a.qtdPedida || a.qtd)}` },
        { titulo: 'Como', valor: (a) => (a.automatica ? 'automática' : 'clique') },
        { titulo: 'Resultado', valor: (a) => Compra.ROTULOS[a.resultado] || a.resultado, classe: (a) => (Compra.comprou(a.resultado) ? 'ok' : a.resultado === 'cancelada' ? 'dim' : 'ruim') },
        { titulo: 'Quando', valor: (a) => `${haQuanto(a.concluidoEm || a.em)} · ${fmtData(a.concluidoEm || a.em)}` },
      ], s.tentativas));
    }
  }

  function pintarVendas() {
    if (!p.vendas) return;
    const alvo = p.vendas;
    alvo.textContent = '';
    // Uma linha só: carregando ou erro de qualquer um aparece; senão, a atualização mais velha.
    const sit = [situacao('meus'), situacao('historico')].filter(Boolean);
    p.quando_vendas.textContent = sit.find((t) => !t.startsWith('atualizado')) || sit.sort().pop() || '';
    alvo.append(el('h4', null, 'À venda agora'));
    const meus = s.pessoal.meus && s.pessoal.meus.dados ? Pessoal.normalizarMeus(s.pessoal.meus.dados.linhas, agoraServidor()) : [];
    if (meus.length) {
      alvo.append(tabela([
        { titulo: 'Anúncio', valor: (l) => l.nome },
        { titulo: 'Qtd', valor: (l) => fmtN(l.qtd) },
        { titulo: 'Preço', valor: (l) => `${fmtN(l.preco)}${l.moeda === 'orb' ? ' gemas' : ''}` },
        { titulo: 'Situação', valor: (l) => (l.retido ? 'retido' : 'à venda'), classe: (l) => (l.retido ? 'alerta' : 'ok') },
      ], meus));
    } else {
      alvo.append(el('p', 'vazio', s.carregando.meus ? 'Carregando os seus anúncios.' : 'Nenhum anúncio aberto.'));
    }
    alvo.append(el('h4', null, 'Vendidas'));
    const hist = s.pessoal.historico && s.pessoal.historico.dados ? Pessoal.normalizarHistorico(s.pessoal.historico.dados.linhas, 'venda') : [];
    const vendas = Pessoal.juntarVendas(hist, s.eventos.filter((e) => e.k === 'marketVendido'));
    if (!vendas.length) {
      alvo.append(el('p', 'vazio', s.carregando.historico ? 'Carregando o seu histórico de vendas.' : 'Nenhuma venda na página mais recente do histórico.'));
      return;
    }
    const t = Pessoal.totais(vendas);
    alvo.append(el('p', 'nota', `Nesta página: ${t.vendas} vendas em ouro, ${fmtN(t.unidades)} unidades, ${fmtN(t.liquido)} de ouro líquido (já sem a taxa).`));
    alvo.append(tabela([
      { titulo: 'Item', valor: (l) => `${l.nome}${l.aoVivo ? ' (agora)' : ''}` },
      { titulo: 'Qtd', valor: (l) => fmtN(l.qtd) },
      { titulo: 'Bruto', valor: (l) => fmtN(l.bruto) },
      { titulo: 'Líquido', valor: (l) => fmtN(l.liquido), classe: () => 'ok' },
      { titulo: 'Comprador', valor: (l) => l.contraparte || '-' },
      { titulo: 'Quando', valor: (l) => fmtData(l.em) },
    ], vendas));
  }

  // ---- o que chega do radar --------------------------------------------------------------------

  bus.on('tela:estado', (e) => {
    s.estado = e;
    // Mercado do jogo aberto: o painel sai da frente.
    if (e.mercadoAberto && s.aberto && !encaixado) fechar();
    pintarBarra();
    pintarCabecalho();
  });
  bus.on('tela:revenda', (d) => {
    s.revenda = d;
    pintarRevenda();
  });
  bus.on('tela:revenda-pk', (d) => {
    s.revendaPk = d;
    pintarRevenda();
  });
  bus.on('revenda:categoria', () => pintarRevenda());
  bus.on('tela:mercado', (m) => {
    s.mercado = m;
    if (s.aberto && s.aba === 'mercado') pintarMercado();
    pintarCabecalho();
  });
  bus.on('tela:pessoal', (r) => {
    if (!r || !r.tipo) return;
    // O histórico de vendas novo muda o lucro: a conta sai de novo, logo depois de ele ser guardado.
    if (r.tipo === 'historico' && s.aberto && s.aba === 'lucro') setTimeout(() => pedirLucro().catch(erro), 400);
    s.carregando[r.tipo] = false;
    s.pessoal[r.tipo] = r.erro && s.pessoal[r.tipo] && s.pessoal[r.tipo].dados ? { ...s.pessoal[r.tipo], erro: r.erro } : r;
    if (s.aberto) pintarAba(s.aba);
  });
  bus.on('tela:evento', (ev) => {
    s.eventos.unshift(ev);
    if (s.eventos.length > 100) s.eventos.length = 100;
    if (s.aberto && (s.aba === 'vendas' || s.aba === 'compras')) pintarAba(s.aba);
  });
  bus.on('painel:contagem', ({ n }) => {
    s.avisos = n;
    pintarBarra();
    pintarCabecalho();
  });
  bus.on('painel:mostrar', () => {
    // Aviso novo: abre o painel nos Avisos, a não ser que o mercado do jogo esteja aberto.
    if (s.cfg.abrirPainelNoAviso && !(s.estado && s.estado.mercadoAberto)) abrir('avisos');
    else {
      barraSelo.classList.remove('pisca');
      void barraSelo.offsetWidth;
      barraSelo.classList.add('pisca');
    }
  });

  globalThis.RadarTela = Object.freeze({
    areaDeAvisos() { montarPainel(); return p.areaAvisos; },
    areaDeRevenda() { montarPainel(); return p.areaRevenda; },
    abrir,
    fechar,
  });

  async function iniciar() {
    try {
      const salvo = await chrome.storage.local.get([Config.CHAVE, CHAVE_AUTO_DESLIGADA]);
      s.base = Config.validar(salvo[Config.CHAVE]);
      s.cfg = Config.calibrar(s.base, s.ctx);
      s.autoDesligada = salvo[CHAVE_AUTO_DESLIGADA] || null;
      chrome.storage.onChanged.addListener((m, area) => {
        if (area !== 'local') return;
        if (m[CHAVE_AUTO_DESLIGADA]) s.autoDesligada = m[CHAVE_AUTO_DESLIGADA].newValue || null;
        if (m[Config.CHAVE]) { s.base = Config.validar(m[Config.CHAVE].newValue); s.cfg = Config.calibrar(s.base, s.ctx); }
        if (m[Config.CHAVE] || m[CHAVE_AUTO_DESLIGADA]) {
          pintarBarra();
          pintarCabecalho();
          if (s.aberto && s.aba === 'ajustes') pintarAjustes();
        }
      });
    } catch (e) {
      erro(e);
    }
    pintarBarra();
  }

  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigiarLugar, { once: true });
    else vigiarLugar();
    // O contador da barra anda sozinho entre um estado e outro.
    setInterval(() => { pintarBarra(); if (s.aberto) pintarCabecalho(); }, 1000);
    setInterval(() => { if (s.aberto && s.aba === 'compras') pintarCompras(); }, 30000);
    iniciar();
  } catch (e) {
    erro(e);
  }
})();
