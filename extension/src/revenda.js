// Radar do Mercado: os cartões da aba Revenda (Fase 3).
//
// Um cartão por item que o Allan tem das categorias vigiadas, com o preço sugerido (1 abaixo
// do menor anúncio de outro jogador que não esteja abaixo do custo), o líquido depois dos 15% e
// um botão: Anunciar ou Mudar preço. Um clique manda um único pedido ao radar; nada é anunciado
// sem o clique. Preço abaixo do custo pede um segundo clique. Os cartões moram na área que o
// tela.js oferece na aba Revenda e usam o CSS dos cartões de aviso (painel.js).
//
// Duas sub-abas separam o que fazer: "Anunciar" (itens sem anúncio seu) e "Mudar preço" (itens
// que você já tem à venda; os que já são os primeiros da fila vêm no fim). A busca pelo nome vale
// nas duas.
//
// 0.7.0: acima de tudo, as categorias Itens e Pokémon. A de pokémon mora numa área própria, que o
// revendapk.js preenche (areaDePokemon).
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const bus = globalThis.RadarBus;
  const Rv = globalThis.RadarRevenda;
  if (!bus || !Rv) return;

  const CSS = `
    .rv-selo { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--rm-verde); color: var(--rm-verde); }
    .rv-campos { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; margin: 6px 0 8px; }
    .rv-campos label { display: flex; flex-direction: column; gap: 2px; color: var(--rm-fraco); font-size: 11px; }
    .rv-campos input { width: 110px; height: 28px; box-sizing: border-box; border: 1px solid var(--rm-borda); border-radius: 6px; background: var(--rm-fundo); color: var(--rm-texto); padding: 0 8px; font: inherit; font-variant-numeric: tabular-nums; }
    .rv-campos input.qtd-rv { width: 76px; }
    .rv-campos select { width: 92px; height: 28px; box-sizing: border-box; border: 1px solid var(--rm-borda); border-radius: 6px; background: var(--rm-fundo); color: var(--rm-texto); padding: 0 6px; font: inherit; }
    .rv-conta { margin: 0 0 8px; font-variant-numeric: tabular-nums; }
    .rv-conta .ruim { color: var(--rm-vermelho); }
    .rv-nota { margin: 0 0 8px; color: var(--rm-fraco); font-size: 12px; }
    .cartao .vender { flex: 1; height: 30px; border: 0; border-radius: 6px; background: var(--rm-acao); color: var(--rm-acao-texto); font: inherit; font-weight: 650; cursor: pointer; }
    .cartao .vender.prejuizo { background: #8a3a2e; }
    .rv-topo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .rv-topo .aba { padding: 4px 10px; font-size: 12px; }
    .rv-busca { flex: 1; min-width: 140px; height: 28px; box-sizing: border-box; border: 1px solid var(--rm-borda); border-radius: 6px; background: var(--rm-fundo); color: var(--rm-texto); padding: 0 8px; font: inherit; }
    .rv-lista { display: flex; flex-direction: column; gap: 8px; }
    .rv-vazio { margin: 4px 0; color: var(--rm-fraco); font-size: 12px; }
    .rv-cats { margin-bottom: 8px; }
    .rv-topo[hidden], .rv-lista[hidden], .rv-area-pk[hidden] { display: none; }
  `;

  const fmtN = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('pt-BR') : '-');
  const cartoes = new Map(); // itemId -> { el, partes, sug, sujo, confirmar }
  let area = null;
  let lista = null;
  let ultimo = null;
  const ui = { grupo: 'anunciar', escolheu: false, busca: '', botoes: {}, numeros: {}, vazio: null, categoria: 'item', cats: {}, nCats: {}, topo: null, areaPk: null, nPokemon: 0 };
  const CATEGORIAS = [['item', 'Itens'], ['pokemon', 'Pokémon']];

  const GRUPOS = [['anunciar', 'Anunciar'], ['mudar', 'Mudar preço']];
  // Com anúncio seu do item, o cartão é de "Mudar preço".
  const grupoDe = (sug) => (sug.meuAnuncio ? 'mudar' : 'anunciar');
  // Dentro de cada sub-aba, o que tem botão vem primeiro.
  const ORDEM_ACAO = { 'mudar-preco': 0, anunciar: 0, 'sem-referencia': 1, 'espera-editar': 2, 'sem-livro': 2, primeiro: 3, 'sem-vaga': 4, 'sem-unidades': 5 };
  const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // O jogo tem atalhos de teclado: o que se digita nos campos do painel não chega até ele.
  const isolarTeclado = (campo) => { for (const tipo of ['keydown', 'keyup', 'keypress']) campo.addEventListener(tipo, (ev) => { if (ev.key !== 'Escape') ev.stopPropagation(); }); };

  function erro(e) { try { console.error(PREFIXO, e); } catch { /* nada */ } }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function linha(dl, rotulo) {
    dl.append(el('dt', null, rotulo));
    const dd = el('dd');
    dl.append(dd);
    return dd;
  }

  function montarArea() {
    if (area) return lista;
    const tela = globalThis.RadarTela;
    area = tela && typeof tela.areaDeRevenda === 'function' ? tela.areaDeRevenda() : null;
    if (!area) return null;
    const cats = el('div', 'rv-topo rv-cats');
    cats.setAttribute('role', 'tablist');
    for (const [chave, rotulo] of CATEGORIAS) {
      const b = el('button', 'aba cfg-escala-bt', rotulo);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.categoria = chave;
      const n = el('span', 'n');
      n.hidden = true;
      b.append(n);
      b.addEventListener('click', () => { ui.categoria = chave; aplicarCategoria(); });
      ui.cats[chave] = b;
      ui.nCats[chave] = n;
      cats.append(b);
    }
    const topo = el('div', 'rv-topo');
    ui.topo = topo;
    topo.setAttribute('role', 'tablist');
    for (const [chave, rotulo] of GRUPOS) {
      const b = el('button', 'aba cfg-escala-bt', rotulo);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.grupo = chave;
      const n = el('span', 'n');
      n.hidden = true;
      b.append(n);
      b.addEventListener('click', () => { ui.grupo = chave; ui.escolheu = true; filtrar(); });
      ui.botoes[chave] = b;
      ui.numeros[chave] = n;
      topo.append(b);
    }
    const busca = el('input', 'rv-busca');
    busca.type = 'search';
    busca.placeholder = 'Procurar item';
    busca.setAttribute('aria-label', 'Procurar item pelo nome');
    isolarTeclado(busca);
    busca.addEventListener('input', () => { ui.busca = normalizar(busca.value); filtrar(); });
    topo.append(busca);
    lista = el('div', 'rv-lista');
    ui.vazio = el('p', 'rv-vazio');
    ui.vazio.hidden = true;
    ui.areaPk = el('div', 'rv-area-pk');
    area.append(cats, topo, ui.vazio, lista, ui.areaPk);
    aplicarCategoria();
    return lista;
  }

  // Itens ou Pokémon: mostra só a parte escolhida.
  function aplicarCategoria() {
    if (!ui.topo) return;
    const item = ui.categoria === 'item';
    ui.topo.hidden = !item;
    lista.hidden = !item;
    ui.areaPk.hidden = item;
    if (!item) ui.vazio.hidden = true;
    for (const [chave] of CATEGORIAS) { const _b = ui.cats[chave]; _b.setAttribute('aria-selected', String(chave === ui.categoria)); _b.classList.toggle('on', chave === ui.categoria); }
    if (item) filtrar();
    contarCategorias();
    bus.emit('revenda:categoria', { categoria: ui.categoria });
  }

  function contarCategorias() {
    if (!ui.nCats.item) return;
    const nItens = [...cartoes.values()].filter((c) => Rv.comAcao(c.sug)).length;
    for (const [chave, n] of [['item', nItens], ['pokemon', ui.nPokemon]]) {
      ui.nCats[chave].textContent = String(n);
      ui.nCats[chave].hidden = n === 0;
    }
  }

  // Mostra só a sub-aba escolhida e o que bate com a busca; atualiza os números.
  function filtrar() {
    if (!lista) return;
    const conta = { anunciar: 0, mudar: 0 };
    const visiveis = { anunciar: 0, mudar: 0 };
    for (const c of cartoes.values()) {
      const g = grupoDe(c.sug);
      if (Rv.comAcao(c.sug)) conta[g] += 1;
      const bate = !ui.busca || normalizar(c.sug.nome).includes(ui.busca);
      if (bate) visiveis[g] += 1;
      c.el.hidden = !(g === ui.grupo && bate);
    }
    // Sem escolha ainda: abre onde há o que fazer.
    if (!ui.escolheu && conta[ui.grupo] === 0) {
      const outro = ui.grupo === 'anunciar' ? 'mudar' : 'anunciar';
      if (conta[outro] > 0) { ui.grupo = outro; filtrar(); return; }
    }
    for (const [chave] of GRUPOS) {
      { const _b = ui.botoes[chave]; _b.setAttribute('aria-selected', String(chave === ui.grupo)); _b.classList.toggle('on', chave === ui.grupo); }
      ui.numeros[chave].textContent = String(conta[chave]);
      ui.numeros[chave].hidden = conta[chave] === 0;
    }
    let vazio = '';
    if (cartoes.size && !visiveis[ui.grupo]) {
      const outro = ui.grupo === 'anunciar' ? 'mudar' : 'anunciar';
      const nomeOutro = outro === 'mudar' ? 'Mudar preço' : 'Anunciar';
      if (ui.busca) vazio = visiveis[outro] ? `Nenhum item com esse nome aqui; há em "${nomeOutro}".` : 'Nenhum item com esse nome.';
      else vazio = ui.grupo === 'anunciar' ? 'Nada para anunciar: o que você tem já está à venda.' : 'Nenhum anúncio seu aberto.';
    }
    ui.vazio.textContent = vazio;
    ui.vazio.hidden = !vazio || ui.categoria !== 'item';
    contarCategorias();
  }

  function criarCartao(sug) {
    const cartao = el('article', 'cartao');
    cartao.dataset.item = String(sug.itemId);
    const cabeca = el('div', 'cabeca');
    const selo = el('span', 'rv-selo', 'comprado pelo radar');
    const fechar = el('button', 'fechar-cartao', '×');
    fechar.type = 'button';
    fechar.title = 'Esconder até a quantidade mudar';
    fechar.setAttribute('aria-label', 'Esconder esta sugestão');
    cabeca.append(el('span', 'nome', sug.nome), selo, fechar);

    const dl = el('dl');
    const ddTem = linha(dl, 'Você tem');
    const ddCusto = linha(dl, 'Custo');
    const ddFila = linha(dl, 'Fila agora');
    const ddVolume = linha(dl, 'Vende por semana');

    const campos = el('div', 'rv-campos');
    const rotPreco = el('label', null, 'Preço por unidade');
    const preco = el('input');
    preco.type = 'number';
    preco.min = String(Rv.PRECO_MINIMO);
    preco.inputMode = 'numeric';
    rotPreco.append(preco);
    const rotQtd = el('label', null, 'Quantidade');
    const qtd = el('input', 'qtd-rv');
    qtd.type = 'number';
    qtd.min = '1';
    qtd.inputMode = 'numeric';
    rotQtd.append(qtd);
    campos.append(rotPreco, rotQtd);

    const conta = el('p', 'rv-conta');
    const nota = el('p', 'rv-nota');
    const acoes = el('div', 'acoes');
    const botao = el('button', 'vender', 'Anunciar');
    botao.type = 'button';
    acoes.append(botao);
    const estado = el('p', 'estado');
    estado.setAttribute('aria-live', 'polite');
    cartao.append(cabeca, dl, campos, conta, nota, acoes, estado);

    const c = { el: cartao, sug, sujo: false, confirmar: false, partes: { selo, ddTem, ddCusto, ddFila, ddVolume, preco, qtd, rotQtd, conta, nota, botao, acoes, estado, campos } };
    isolarTeclado(preco);
    isolarTeclado(qtd);
    preco.addEventListener('input', () => { c.sujo = true; c.confirmar = false; pintarConta(c); });
    qtd.addEventListener('input', () => { c.sujo = true; pintarConta(c); });
    fechar.addEventListener('click', () => bus.emit('revenda:esconder', { itemId: c.sug.itemId, qtd: c.sug.qtd }));
    botao.addEventListener('click', () => clicar(c));
    return c;
  }

  const lerPreco = (c) => Math.floor(Number(c.partes.preco.value) || 0);
  const lerQtd = (c) => (c.sug.acao === 'mudar-preco' ? c.sug.qtdCartao : Math.max(1, Math.min(c.sug.qtd, Math.floor(Number(c.partes.qtd.value) || 1))));

  function pintarConta(c) {
    const { conta, botao } = c.partes;
    const p = lerPreco(c);
    const q = lerQtd(c);
    conta.textContent = '';
    if (!(p >= Rv.PRECO_MINIMO)) { conta.textContent = `Preço mínimo: ${Rv.PRECO_MINIMO}.`; botao.disabled = true; return; }
    const liquido = Rv.liquidoDe(p, q);
    const lucro = liquido - c.sug.custo.porUnidade * q;
    conta.append(document.createTextNode(`Líquido ${fmtN(liquido)} (já sem os 15%) · lucro `));
    conta.append(el('span', lucro < 0 ? 'ruim' : null, fmtN(lucro)));
    const prejuizo = p < c.sug.piso;
    botao.classList.toggle('prejuizo', prejuizo);
    const ocupado = c.acao && c.acao.fase === 'enviando';
    botao.disabled = Boolean(ocupado);
    if (c.sug.acao === 'mudar-preco') botao.textContent = prejuizo ? (c.confirmar ? 'Confirmar o preço com prejuízo' : `Mudar preço para ${fmtN(p)} (prejuízo)`) : `Mudar preço para ${fmtN(p)}`;
    else botao.textContent = prejuizo ? (c.confirmar ? 'Confirmar: anunciar com prejuízo' : 'Anunciar com prejuízo') : 'Anunciar';
  }

  function clicar(c) {
    const p = lerPreco(c);
    if (!(p >= Rv.PRECO_MINIMO)) return;
    // Abaixo do custo: o primeiro clique só pede confirmação.
    if (p < c.sug.piso && !c.confirmar) { c.confirmar = true; pintarConta(c); return; }
    c.confirmar = false;
    c.partes.botao.disabled = true;
    if (c.sug.acao === 'mudar-preco') bus.emit('revenda:mudar-preco', { itemId: c.sug.itemId, anuncioId: c.sug.meuAnuncio.id, preco: p });
    else bus.emit('revenda:anunciar', { itemId: c.sug.itemId, qtd: lerQtd(c), preco: p });
  }

  function pintarCartao(c, sug, acao) {
    const precoAntes = c.sug && c.sug.preco;
    c.sug = sug;
    c.acao = acao || null;
    const { selo, ddTem, ddCusto, ddFila, ddVolume, preco, qtd, rotQtd, nota, acoes, estado, campos } = c.partes;
    selo.hidden = !sug.custo.doRadar;
    const m = sug.meuAnuncio;
    ddTem.textContent = `${fmtN(sug.qtd)}${m ? ` · à venda: ${fmtN(m.qtd)} × ${fmtN(m.preco)}` : ''}`;
    const cu = sug.custo;
    ddCusto.textContent = cu.compradas === 0 ? 'drop (sem custo)' : `${fmtN(cu.porUnidade)} por unidade${cu.deDrop > 0 ? ` (${fmtN(cu.deDrop)} de drop)` : ''} · empata a ${fmtN(sug.piso)}`;
    ddFila.textContent = sug.fila && sug.fila.length ? `${sug.fila.map(fmtN).join(' · ')}${sug.ignorados ? ` · ${sug.ignorados} muito abaixo (custo ou anúncio de sorteio), ignorado${sug.ignorados > 1 ? 's' : ''}` : ''}` : (sug.acao === 'sem-livro' ? 'lendo o mercado deste item…' : 'nenhum outro anúncio');
    ddVolume.textContent = typeof sug.volume7d === 'number' ? fmtN(sug.volume7d) : '-';
    // O que ele digitou fica, a não ser que a sugestão tenha mudado.
    if (!c.sujo || precoAntes !== sug.preco) {
      preco.value = sug.preco ? String(sug.preco) : '';
      qtd.value = String(Math.max(1, sug.qtdCartao || sug.qtd || 1));
      c.sujo = false;
    }
    qtd.max = String(Math.max(1, sug.qtd));
    rotQtd.hidden = sug.acao === 'mudar-preco';
    const comBotao = sug.acao === 'anunciar' || sug.acao === 'mudar-preco' || sug.acao === 'sem-referencia';
    campos.hidden = !comBotao;
    acoes.hidden = !comBotao;
    c.partes.conta.hidden = !comBotao;
    const notas = {
      anunciar: sug.fonte === 'media7d' ? 'Sem outro anúncio: o preço sugerido é a média de 7 dias.' : 'Sugerido: 1 abaixo do menor anúncio de outro jogador. O anúncio fica 2 min retido.',
      'mudar-preco': `Alguém está abaixo do seu anúncio. Mudar o preço reinicia os 2 min de retenção. O jogo só deixa um anúncio por item${sug.qtd ? `: as ${fmtN(sug.qtd)} unidades do inventário ficam para depois` : ''}.`,
      'espera-editar': `Alguém está abaixo do seu anúncio, mas o jogo só deixa mudar o preço de item a cada 30 min: libera em ${Math.max(1, Math.ceil((sug.esperaEditarMs || 0) / 60000))} min.`,
      primeiro: `Você já é o primeiro da fila a ${m ? fmtN(m.preco) : '-'}.`,
      'sem-vaga': `Sem vaga: ${Rv.MAX_ANUNCIOS} anúncios abertos, o máximo do jogo.`,
      'sem-livro': 'Abra a aba de novo ou clique em Atualizar para ler o mercado deste item.',
      'sem-referencia': 'Sem anúncio nem média de 7 dias para sugerir um preço: digite o seu.',
      'sem-unidades': 'Sem unidades no inventário.',
    };
    nota.textContent = notas[sug.acao] || '';
    estado.textContent = acao ? acao.texto : '';
    estado.classList.toggle('bom', Boolean(acao && acao.fase === 'ok'));
    estado.classList.toggle('ruim', Boolean(acao && acao.fase === 'erro'));
    if (comBotao) pintarConta(c);
  }

  function pintar(d) {
    ultimo = d;
    const alvo = montarArea();
    if (!alvo) return;
    const vistos = new Set();
    let anterior = null;
    // A ordem do radar (compras do radar primeiro, depois o lucro), com o que tem botão na frente.
    const ordenadas = [...(d.sugestoes || [])].map((sug, i) => ({ sug, i }))
      .sort((a, b) => (ORDEM_ACAO[a.sug.acao] ?? 9) - (ORDEM_ACAO[b.sug.acao] ?? 9) || a.i - b.i)
      .map((x) => x.sug);
    for (const sug of ordenadas) {
      vistos.add(sug.itemId);
      let c = cartoes.get(sug.itemId);
      if (!c) { c = criarCartao(sug); cartoes.set(sug.itemId, c); }
      pintarCartao(c, sug, d.acoes && d.acoes[sug.itemId]);
      // Na ordem das sugestões.
      if (anterior ? anterior.nextSibling !== c.el : alvo.firstChild !== c.el) {
        if (anterior) anterior.after(c.el);
        else alvo.prepend(c.el);
      }
      anterior = c.el;
    }
    for (const [id, c] of [...cartoes]) {
      if (!vistos.has(id)) { c.el.remove(); cartoes.delete(id); }
    }
    filtrar();
  }

  globalThis.RadarRevendaUI = Object.freeze({
    CSS,
    quantos: () => cartoes.size,
    ultimo: () => ultimo,
    categoria: () => ui.categoria,
    areaDePokemon() { montarArea(); return ui.areaPk; },
    contarPokemon(n) { ui.nPokemon = n; contarCategorias(); },
  });
  bus.on('tela:revenda', (d) => { try { pintar(d); } catch (e) { erro(e); } });
})();
