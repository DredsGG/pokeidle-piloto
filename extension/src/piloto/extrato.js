// Extrato (1.35, pedido do André): o que você gastou e o que entrou, com a arte do jogo.
//
// "Um lugar que eu veja o histórico do que eu gastei, do que eu vendi… o item, o nome, o símbolo,
// a sprite… quando, quanto tempo faz… para eu entender os gastos."
//
// De onde vem cada linha (tudo guardado neste navegador, 60 dias, até 3.000 linhas):
// - Loja (bolas, poções, revives, ovos): o que o Piloto pede pelo cofre. Pedido que não saiu
//   (o cofre devolve o ouro) some do extrato.
// - Diária de anúncio de pokémon: também pelo cofre.
// - Mercado, compras e vendas: o histórico do PRÓPRIO jogo (o Radar lê a página mais recente) —
//   entram as suas compras à mão também. A compra do Radar aparece na hora e é trocada pela linha
//   do jogo quando ela chega (mesmo item, quantidade e valor, até 5 min de diferença).
// - Venda do Depot ao NPC: a diferença de ouro logo depois da venda (≈, pode somar um pouco do farm).
// Não entra: a compra que você faz à mão na loja do NPC (o jogo não guarda isso em lugar nenhum).
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:extrato:v1';
  const CHAVE_UI = 'piloto:extrato:ui';
  const MAX = 3000;
  const VALE_MS = 60 * 86_400_000;
  const JANELA_GEMEO_MS = 5 * 60_000;

  let lista = (() => { try { const l = JSON.parse(localStorage.getItem(CHAVE) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } })();
  let ui = (() => { try { return { periodo: 'hoje', filtro: 'tudo', ...JSON.parse(localStorage.getItem(CHAVE_UI) || '{}') }; } catch { return { periodo: 'hoje', filtro: 'tudo' }; } })();
  const gravar = () => {
    const corte = Date.now() - VALE_MS;
    lista = lista.filter((e) => e && e.em >= corte).sort((a, b) => b.em - a.em).slice(0, MAX);
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { lista = lista.slice(0, Math.floor(lista.length / 2)); try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* sem espaço */ } }
  };
  const gravarUi = () => { try { localStorage.setItem(CHAVE_UI, JSON.stringify(ui)); } catch { /* sem armazenamento */ } };

  let eu = null;
  let welcome = null;
  PIH.on('estado', (e) => { eu = e; conferirDepot(); });
  PIH.on('welcome', (w) => { welcome = w; });

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  function normalizar(e) {
    const valor = num(e.valor);
    if (!e || !Number.isFinite(Number(e.em)) || valor == null || valor < 0) return null;
    return {
      id: String(e.id || `x:${e.em}:${Math.random().toString(36).slice(2, 8)}`).slice(0, 80),
      em: Number(e.em), tipo: e.tipo === 'entrada' ? 'entrada' : 'gasto',
      fonte: String(e.fonte || 'outro').slice(0, 20), origem: String(e.origem || '').slice(0, 20),
      nome: String(e.nome || '').slice(0, 60), qtd: Math.max(1, Math.round(num(e.qtd) || 1)), valor: Math.round(valor),
      itemId: num(e.itemId), ballId: num(e.ballId), speciesId: num(e.speciesId), shiny: !!e.shiny, aprox: !!e.aprox,
    };
  }
  // A compra do Radar e a linha do histórico do jogo são a mesma compra: fica a do jogo, com a
  // origem do Radar.
  const gemeos = (a, b) => a.fonte === 'mercado' && b.fonte === 'mercado' && a.tipo === b.tipo && a.qtd === b.qtd && Math.abs(a.valor - b.valor) <= Math.max(1, a.valor * 0.001) && a.nome.toLowerCase() === b.nome.toLowerCase() && Math.abs(a.em - b.em) <= JANELA_GEMEO_MS;
  function juntar(e) {
    const n = normalizar(e);
    if (!n) return false;
    const i = lista.findIndex((x) => x.id === n.id);
    if (i >= 0) { lista[i] = { ...lista[i], ...n, origem: lista[i].origem && !n.origem ? lista[i].origem : n.origem || lista[i].origem }; return true; }
    const doJogo = n.id.startsWith('hc:') || n.id.startsWith('hv:');
    const g = lista.findIndex((x) => x.id !== n.id && gemeos(x, n) && (doJogo ? x.id.startsWith('r:') : x.id.startsWith('hc:') || x.id.startsWith('hv:')));
    if (g >= 0) {
      if (doJogo) { n.origem = lista[g].origem || n.origem; lista.splice(g, 1); } else return true; // o do jogo já está lá
    }
    lista.push(n);
    return true;
  }
  function anotar(e) { if (juntar(e)) { gravar(); PIH.emit?.('extrato.mudou', {}); } }
  function anotarVarios(arr) { let m = false; for (const e of arr || []) m = juntar(e) || m; if (m) { gravar(); PIH.emit?.('extrato.mudou', {}); } }
  function remover(id) { const n = lista.length; lista = lista.filter((x) => x.id !== id); if (lista.length !== n) { gravar(); PIH.emit?.('extrato.mudou', {}); } }
  // O Radar (outro mundo da extensão) manda o que viu do Mercado por evento.
  document.addEventListener('piloto:extrato', (ev) => {
    try { const d = JSON.parse(ev.detail); anotarVarios(Array.isArray(d.lista) ? d.lista.slice(0, 200) : []); } catch { /* evento estragado */ }
  });

  // ---- o cofre: a loja e a diária ----------------------------------------------------------------
  const porReserva = new Map();
  function doCofre(pedido, custo, reserva, origem) {
    if (!pedido || !(custo > 0)) return;
    const id = `c:${Date.now()}:${reserva ? reserva.id : Math.random().toString(36).slice(2, 7)}`;
    let e = null;
    if (pedido.t === 'shop.buy') {
      if (pedido.kind === 'ball') {
        const b = ((welcome && welcome.catalogoBolas) || []).find((x) => Number(x.id) === Number(pedido.id));
        e = { id, em: Date.now(), tipo: 'gasto', fonte: 'loja', origem: origem === 'captura' ? 'piloto' : 'piloto', nome: (b && b.nome) || 'Poké Ball', qtd: pedido.qty, valor: custo, ballId: pedido.id };
      } else e = { id, em: Date.now(), tipo: 'gasto', fonte: 'loja', origem: 'piloto', nome: nomeItem(pedido.id), qtd: pedido.qty, valor: custo, itemId: pedido.id };
    } else if (pedido.t === 'market.criar' && pedido.tipo === 'pokemon') {
      e = { id, em: Date.now(), tipo: 'gasto', fonte: 'taxa', origem: 'piloto', nome: 'Diária do anúncio', qtd: Number(pedido.dias) || 1, valor: custo, speciesId: pokemonDoPedido(pedido) };
    }
    if (!e) return;
    if (reserva) porReserva.set(reserva.id, id);
    // a compra da loja só fica se o item chegar à mochila em até 20 s (o servidor pode recusar)
    if (pedido.t === 'shop.buy') {
      const tem = pedido.kind === 'ball' ? Number(eu && eu.balls && eu.balls[pedido.id]) || 0 : Number(eu && eu.items && eu.items[pedido.id]) || 0;
      aConfirmar.set(id, { kind: pedido.kind, itemId: pedido.id, antes: tem, em: Date.now() });
    }
    anotar(e);
  }
  const aConfirmar = new Map();
  function conferirLoja() {
    if (!aConfirmar.size || !eu) return;
    for (const [id, c] of aConfirmar) {
      const tem = c.kind === 'ball' ? Number(eu.balls && eu.balls[c.itemId]) || 0 : Number(eu.items && eu.items[c.itemId]) || 0;
      if (tem > c.antes) aConfirmar.delete(id);
      else if (Date.now() - c.em > 20_000) { aConfirmar.delete(id); remover(id); }
    }
  }
  setInterval(() => { try { conferirLoja(); } catch { /* segue */ } }, 2000);
  function estornoDoCofre(reserva) {
    if (!reserva) return;
    const id = porReserva.get(reserva.id);
    if (!id) return;
    porReserva.delete(reserva.id);
    remover(id);
  }
  let itensJogo = null;
  const carregarItens = () => { if (!itensJogo) itensJogo = fetch('/assets/items.json').then((r) => (r.ok ? r.json() : null)).then((j) => new Map(((j && j.items) || []).map((x) => [Number(x.id), x]))).catch(() => new Map()); return itensJogo; };
  let nomesItens = new Map();
  carregarItens().then((m) => { nomesItens = m || new Map(); });
  const nomeItem = (id) => (nomesItens.get(Number(id)) || {}).name || `item ${id}`;
  function pokemonDoPedido(pedido) {
    const p = ((eu && eu.pokemons) || []).find((x) => x && x.id === pedido.pokemonId);
    return p ? p.speciesId : null;
  }

  // ---- a venda do Depot ao NPC: a diferença de ouro ----------------------------------------------
  let vendaDepot = null; // { em, n, ouro }
  function depotVendido(n) {
    const ouro = Number(eu && eu.gold);
    if (!Number.isFinite(ouro)) return;
    vendaDepot = { em: Date.now(), n: Math.max(1, n || 1), ouro };
  }
  function conferirDepot() {
    const v = vendaDepot;
    if (!v || !eu) return;
    const ouro = Number(eu.gold);
    if (!Number.isFinite(ouro)) return;
    if (Date.now() - v.em > 15_000) { vendaDepot = null; return; }
    if (ouro > v.ouro) {
      vendaDepot = null;
      anotar({ id: `d:${v.em}`, em: v.em, tipo: 'entrada', fonte: 'depot', origem: 'piloto', nome: 'Depot vendido ao NPC', qtd: v.n, valor: ouro - v.ouro, aprox: true });
    }
  }

  // ---- a tela ---------------------------------------------------------------------------------------
  const TXT = {
    hoje: ['Hoje', 'Today', 'Hoy'], d7: ['7 dias', '7 days', '7 días'], d30: ['30 dias', '30 days', '30 días'],
    tudo: ['Tudo', 'All', 'Todo'], gastos: ['Gastos', 'Spent', 'Gastos'], entradas: ['Entradas', 'Income', 'Ingresos'],
    gastou: ['Gastou', 'Spent', 'Gastaste'], entrou: ['Entrou', 'Came in', 'Entró'], saldo: ['Saldo', 'Balance', 'Saldo'],
    loja: ['Loja', 'Shop', 'Tienda'], mercado: ['Mercado', 'Market', 'Mercado'], depot: ['Depot', 'Depot', 'Depot'], taxa: ['Taxa', 'Fee', 'Tasa'], outro: ['Outro', 'Other', 'Otro'],
    piloto: ['Piloto', 'Pilot', 'Piloto'], radar: ['Radar', 'Radar', 'Radar'], voceRadar: ['você (Radar)', 'you (Radar)', 'tú (Radar)'], voce: ['você', 'you', 'tú'],
    ontem: ['Ontem', 'Yesterday', 'Ayer'], agora: ['agora', 'now', 'ahora'],
    min: ['há {m} min', '{m} min ago', 'hace {m} min'], h: ['há {h} h', '{h} h ago', 'hace {h} h'], hm: ['há {h} h {m} min', '{h} h {m} min ago', 'hace {h} h {m} min'],
    dia: ['há {d} dia', '{d} day ago', 'hace {d} día'], dias: ['há {d} dias', '{d} days ago', 'hace {d} días'],
    diaria: ['Diária do anúncio', 'Listing daily fee', 'Tarifa diaria del anuncio'], depotNpc: ['Depot vendido ao NPC', 'Depot sold to the NPC', 'Depot vendido al NPC'],
    vazio: ['Nada neste período ainda. O extrato começa a contar a partir desta versão: compras da loja feitas pelo Piloto, compras e vendas no Mercado (as suas também) e as vendas do Depot.', 'Nothing in this period yet. The statement starts counting from this version: shop buys made by the Pilot, Market buys and sales (yours too) and Depot sales.', 'Nada en este período todavía. El extracto empieza a contar desde esta versión: compras de tienda hechas por el Piloto, compras y ventas en el Mercado (las tuyas también) y las ventas del Depot.'],
    mais: ['Mostrar mais ({n})', 'Show more ({n})', 'Mostrar más ({n})'],
    nota: ['Valores em ouro. A loja do NPC à mão não aparece (o jogo não registra). ≈ = venda do Depot medida pela diferença de ouro.', 'Amounts in gold. Buying from the NPC shop by hand doesn\u2019t show (the game doesn\u2019t record it). ≈ = Depot sale measured by the gold difference.', 'Valores en oro. La tienda del NPC a mano no aparece (el juego no lo registra). ≈ = venta del Depot medida por la diferencia de oro.'],
  };
  const idi = () => { const l = (PIH.idioma && PIH.idioma.atual && PIH.idioma.atual()) || 'pt'; return l === 'en' ? 1 : l === 'es' ? 2 : 0; };
  const T = (k, v = {}) => String((TXT[k] || [k])[idi()] || TXT[k][0]).replace(/\{(\w+)\}/g, (_, x) => v[x]);
  const LOCAL = ['pt-BR', 'en-US', 'es-ES'];
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const PERIODOS = { hoje: null, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
  const diaBr = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  function noPeriodo(e) {
    if (ui.periodo === 'hoje') return diaBr(e.em) === diaBr(Date.now());
    const d = PERIODOS[ui.periodo] || PERIODOS['7d'];
    return Date.now() - e.em <= d;
  }
  function haQuanto(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return T('agora');
    const m = Math.round(s / 60);
    if (m < 60) return T('min', { m });
    const h = Math.floor(m / 60);
    if (h < 24) return m % 60 ? T('hm', { h, m: m % 60 }) : T('h', { h });
    const d = Math.floor(h / 24);
    return T(d === 1 ? 'dia' : 'dias', { d });
  }
  const hora = (ms) => new Date(ms).toLocaleTimeString(LOCAL[idi()], { hour: '2-digit', minute: '2-digit' });
  function rotuloDia(ms) {
    const d = diaBr(ms);
    if (d === diaBr(Date.now())) return T('hoje');
    if (d === diaBr(Date.now() - 86_400_000)) return T('ontem');
    return new Date(ms).toLocaleDateString(LOCAL[idi()], { weekday: 'short', day: '2-digit', month: '2-digit' });
  }
  const SPRITE_BOLA = { 1: '/assets/site/assets/ui/ball-poke.png', 2: '/assets/site/assets/ui/ball-great.png', 3: '/img/ball-super.png', 4: '/assets/site/assets/ui/ball-ultra.png', 5: '/img/ball-beast.png' };
  const fonteTxt = (f) => (['loja', 'mercado', 'depot', 'taxa', 'outro'].includes(f) ? T(f) : f);
  const origemTxt = (o) => ({ piloto: T('piloto'), radar: T('radar'), 'voce-radar': T('voceRadar'), voce: T('voce'), mercado: '' })[o] ?? o;
  const nomeTxt = (e) => (e.fonte === 'taxa' && e.nome === 'Diária do anúncio' ? T('diaria') : e.fonte === 'depot' && e.nome === 'Depot vendido ao NPC' ? T('depotNpc') : e.nome);
  const dadosArte = new Map();
  function icone(e, px) {
    if (e.ballId) return `<img class="plt-ex-img" src="${SPRITE_BOLA[e.ballId] || SPRITE_BOLA[1]}" alt="" width="${px}" height="${px}">`;
    if (e.fonte === 'depot') return `<img class="plt-ex-img" src="/img/icone-depot.png" alt="" width="${px}" height="${px}">`;
    if (e.speciesId && PIH.arte) {
      const r = PIH.arte.retrato(e.speciesId, px);
      if (r) return r;
      const d = { categoria: 'pokemon', speciesId: e.speciesId, shiny: e.shiny, anuncioId: `ex:${e.id}`, nome: e.nome };
      dadosArte.set(PIH.arte.chave(d, px), d);
      return PIH.arte.lugar(d, px);
    }
    if (e.itemId && PIH.arte) {
      const d = { categoria: 'item', itemId: e.itemId, anuncioId: `ex:i${e.itemId}`, nome: e.nome };
      dadosArte.set(PIH.arte.chave(d, px), d);
      return PIH.arte.lugar(d, px);
    }
    return `<span class="plt-ex-img plt-ex-sem">${K.ico(e.fonte === 'mercado' ? 'mercado' : 'gasto')}</span>`;
  }
  let mostrar = 60;
  function html(modo) {
    dadosArte.clear();
    const doPeriodo = lista.filter(noPeriodo);
    const gasto = doPeriodo.filter((e) => e.tipo === 'gasto').reduce((s, e) => s + e.valor, 0);
    const entrou = doPeriodo.filter((e) => e.tipo === 'entrada').reduce((s, e) => s + e.valor, 0);
    const saldo = entrou - gasto;
    const porFonte = {};
    for (const e of doPeriodo) if (e.tipo === 'gasto') porFonte[e.fonte] = (porFonte[e.fonte] || 0) + e.valor;
    const visiveis = doPeriodo.filter((e) => ui.filtro === 'tudo' || (ui.filtro === 'gastos' ? e.tipo === 'gasto' : e.tipo === 'entrada'));
    const topo = `<div class="plt-ex-topo">
      ${K.escala('extrato:periodo', ui.periodo, [['hoje', T('hoje')], ['7d', T('d7')], ['30d', T('d30')]])}
      ${K.escala('extrato:filtro', ui.filtro, [['tudo', T('tudo')], ['gastos', T('gastos')], ['entradas', T('entradas')]])}
    </div>
    <div class="plt-kpis plt-ex-kpis">
      ${K.numeroGrande({ icone: 'gasto', rotulo: T('gastou'), valor: `−${nf.format(gasto)}`, classe: 'plt-ex-k-gasto', sub: Object.entries(porFonte).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, v]) => `${fonteTxt(f)} ${nf.format(v)}`).join(' · ') })}
      ${K.numeroGrande({ icone: 'mercado', rotulo: T('entrou'), valor: `+${nf.format(entrou)}`, classe: 'plt-ex-k-entrou' })}
      ${K.numeroGrande({ icone: 'cofre', rotulo: T('saldo'), valor: `${saldo >= 0 ? '+' : '−'}${nf.format(Math.abs(saldo))}`, classe: saldo >= 0 ? 'plt-ex-k-entrou' : 'plt-ex-k-gasto' })}
    </div>`;
    if (!visiveis.length) return `${topo}<div class="plt-ex-vazio">${esc(T('vazio'))}</div>${rodape()}`;
    let ultimoDia = '';
    const linhas = visiveis.slice(0, mostrar).map((e) => {
      const dia = rotuloDia(e.em);
      const cab = dia !== ultimoDia ? `<div class="plt-ex-dia">${esc(dia)}</div>` : '';
      ultimoDia = dia;
      const org = origemTxt(e.origem);
      return `${cab}<div class="plt-ex-l plt-ex-${e.tipo}">
        <span class="plt-ex-arte">${icone(e, 32)}</span>
        <span class="plt-ex-nome"><b>${esc(nomeTxt(e) || fonteTxt(e.fonte))}</b><small>${e.qtd > 1 ? `${nf.format(e.qtd)}× · ` : ''}${esc(fonteTxt(e.fonte))}${org ? ` · ${esc(org)}` : ''}</small></span>
        <span class="plt-ex-valor">${e.tipo === 'gasto' ? '−' : '+'}${e.aprox ? '≈' : ''}${nf.format(e.valor)}</span>
        <span class="plt-ex-quando" title="${esc(new Date(e.em).toLocaleString(LOCAL[idi()]))}">${esc(haQuanto(e.em))}<small>${esc(hora(e.em))}</small></span>
      </div>`;
    }).join('');
    const mais = visiveis.length > mostrar ? `<button type="button" class="cfg-escala-bt plt-acao on plt-ex-mais" data-acao="extrato-mais">${esc(T('mais', { n: nf.format(visiveis.length - mostrar) }))}</button>` : '';
    return `${topo}<div class="plt-ex">${linhas}</div>${mais}${rodape()}`;
  }
  const rodape = () => `<p class="plt-ex-nota">${esc(T('nota'))}</p>`;
  function hidratar(raiz) { if (PIH.arte) PIH.arte.preparar().then(() => PIH.arte.hidratar(raiz, (k) => dadosArte.get(k))); }
  function definir(caminho, v) {
    if (caminho === 'periodo' && v in PERIODOS) { ui.periodo = v; mostrar = 60; gravarUi(); }
    if (caminho === 'filtro' && ['tudo', 'gastos', 'entradas'].includes(v)) { ui.filtro = v; mostrar = 60; gravarUi(); }
  }
  const mais = () => { mostrar += 60; };

  PIH.extrato = Object.freeze({ anotar, anotarVarios, doCofre, estornoDoCofre, depotVendido, html, hidratar, definir, mais, lista: () => lista.slice(), _interno: { remover, juntar, gemeos } });
})(globalThis);
