// Radar do Mercado: os cartões de pokémon da aba Revenda (0.7.0).
//
// Um cartão por pokémon da sua conta que o jogo deixa anunciar (sem o ativo, o inicial e o que
// veste skin), e um por anúncio seu de pokémon aberto. Cada um mostra a nota do jogo, a nota de
// ataque e os IV que batem, o que você pagou, as vendas e os anúncios parecidos, o preço
// sugerido, os dias da diária e o líquido. Um clique manda um único pedido ao radar; nada é
// anunciado sem o clique. Abaixo do custo, ou abaixo da metade das vendas parecidas, o clique pede
// confirmação. O preço é calculado sozinho para os anúncios abertos e os pokémon que o radar
// comprou; nos outros, com "Calcular preço" (para não ler o mercado de dezenas de espécies).
//
// Duas sub-abas, como nos itens: "Anunciar" e "Mudar preço", com a busca pelo nome.
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const bus = globalThis.RadarBus;
  const RvPk = globalThis.RadarRevendaPokemon;
  const Pk = globalThis.RadarPokemon;
  if (!bus || !RvPk || !Pk) return;

  const fmtN = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('pt-BR') : '-');
  const fmt2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '-');
  const moedaTexto = (m) => (m === 'orb' ? 'Gemas' : 'ouro');
  const cartoes = new Map(); // chave -> { el, partes, card, sujo, confirmar }
  let area = null;
  let lista = null;
  let ultimo = null;
  const ui = { grupo: 'anunciar', escolheu: false, busca: '', botoes: {}, numeros: {}, vazio: null, ocultos: null };
  const GRUPOS = [['anunciar', 'Anunciar'], ['mudar', 'Mudar preço']];
  const ORDEM_ACAO = { 'mudar-preco': 0, anunciar: 0, calcular: 1, 'sem-referencia': 2, primeiro: 3 };
  const MOTIVOS = { ativo: 'o pokémon ativo', inicial: 'o inicial', skin: 'com skin vestida', nivel: 'abaixo do nível 50', nota: 'abaixo da nota 3,5' };
  const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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
    const ui2 = globalThis.RadarRevendaUI;
    area = ui2 && typeof ui2.areaDePokemon === 'function' ? ui2.areaDePokemon() : null;
    if (!area) return null;
    const topo = el('div', 'rv-topo');
    topo.setAttribute('role', 'tablist');
    for (const [chave, rotulo] of GRUPOS) {
      const b = el('button', 'aba', rotulo);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.grupoPk = chave;
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
    busca.placeholder = 'Procurar pokémon';
    busca.setAttribute('aria-label', 'Procurar pokémon pelo nome');
    isolarTeclado(busca);
    busca.addEventListener('input', () => { ui.busca = normalizar(busca.value); filtrar(); });
    topo.append(busca);
    ui.vazio = el('p', 'rv-vazio');
    ui.vazio.hidden = true;
    ui.ocultos = el('p', 'rv-vazio rvp-ocultos');
    lista = el('div', 'rv-lista');
    area.append(topo, ui.vazio, lista, ui.ocultos);
    return lista;
  }

  function filtrar() {
    if (!lista) return;
    const conta = { anunciar: 0, mudar: 0 };
    const visiveis = { anunciar: 0, mudar: 0 };
    for (const c of cartoes.values()) {
      const g = c.card.grupo;
      if (RvPk.comAcao(c.card)) conta[g] += 1;
      const bate = !ui.busca || normalizar(c.card.ficha.nome).includes(ui.busca);
      if (bate) visiveis[g] += 1;
      c.el.hidden = !(g === ui.grupo && bate);
    }
    if (!ui.escolheu && visiveis[ui.grupo] === 0) {
      const outro = ui.grupo === 'anunciar' ? 'mudar' : 'anunciar';
      if (visiveis[outro] > 0) { ui.grupo = outro; filtrar(); return; }
    }
    for (const [chave] of GRUPOS) {
      ui.botoes[chave].setAttribute('aria-selected', String(chave === ui.grupo));
      ui.numeros[chave].textContent = String(conta[chave]);
      ui.numeros[chave].hidden = conta[chave] === 0;
    }
    let vazio = '';
    if (!ultimo || !ultimo.recebeu) vazio = 'Esperando os seus pokémon: eles chegam com o estado da conta. Se não aparecerem, aperte F5 na aba do jogo.';
    else if (!visiveis[ui.grupo]) {
      if (ui.busca) vazio = 'Nenhum pokémon com esse nome aqui.';
      else vazio = ui.grupo === 'anunciar' ? 'Nenhum pokémon seu que o jogo deixe anunciar agora.' : 'Nenhum anúncio seu de pokémon aberto.';
    }
    ui.vazio.textContent = vazio;
    ui.vazio.hidden = !vazio;
    const ui2 = globalThis.RadarRevendaUI;
    if (ui2 && ui2.contarPokemon) ui2.contarPokemon(conta.anunciar + conta.mudar);
  }

  function criarCartao(card) {
    const cartao = el('article', 'cartao');
    cartao.dataset.pokemon = String(card.pokemonId);
    if (card.anuncioId) cartao.dataset.anuncio = String(card.anuncioId);
    const cabeca = el('div', 'cabeca');
    const nome = el('span', 'nome');
    const selo = el('span', 'rv-selo', 'comprado pelo radar');
    cabeca.append(nome, selo);
    const dl = el('dl');
    const partes = {
      nome, selo,
      ddPk: linha(dl, 'Pokémon'),
      ddIv: linha(dl, 'IV útil'),
      ddCusto: linha(dl, 'Você pagou'),
      ddVendas: linha(dl, 'Vendas parecidas'),
      ddAVenda: linha(dl, 'Parecido à venda'),
      ddAtual: linha(dl, 'Seu anúncio'),
    };
    const campos = el('div', 'rv-campos');
    const rotPreco = el('label', null, 'Preço');
    const preco = el('input');
    preco.type = 'number';
    preco.min = String(RvPk.PRECO_MINIMO);
    preco.inputMode = 'numeric';
    rotPreco.append(preco);
    const rotDias = el('label', null, 'Dias');
    const dias = el('select');
    for (const d of RvPk.DIAS) {
      const o = el('option', null, d === 1 ? '1 dia' : `${d} dias`);
      o.value = String(d);
      dias.append(o);
    }
    dias.value = String(RvPk.DIAS_PADRAO);
    rotDias.append(dias);
    campos.append(rotPreco, rotDias);
    const conta = el('p', 'rv-conta');
    const nota = el('p', 'rv-nota');
    const acoes = el('div', 'acoes');
    const botao = el('button', 'vender', 'Calcular preço');
    botao.type = 'button';
    acoes.append(botao);
    const estado = el('p', 'estado');
    estado.setAttribute('aria-live', 'polite');
    cartao.append(cabeca, dl, campos, conta, nota, acoes, estado);
    Object.assign(partes, { preco, dias, rotDias, campos, conta, nota, acoes, botao, estado });
    const c = { el: cartao, card, sujo: false, confirmar: false, partes };
    isolarTeclado(preco);
    preco.addEventListener('input', () => { c.sujo = true; c.confirmar = false; pintarConta(c); });
    dias.addEventListener('change', () => { c.confirmar = false; pintarConta(c); });
    botao.addEventListener('click', () => clicar(c));
    return c;
  }

  const lerPreco = (c) => Math.floor(Number(c.partes.preco.value) || 0);
  const lerDias = (c) => Math.floor(Number(c.partes.dias.value) || RvPk.DIAS_PADRAO);

  function contaDoCartao(c) {
    const d = ultimo || {};
    const dias = c.card.grupo === 'anunciar' ? lerDias(c) : 0;
    return RvPk.contaDe({ preco: lerPreco(c), moeda: c.card.ficha.moeda, dias, diaria: d.diaria || RvPk.DIARIA_PADRAO, custo: c.card.custo, faixasOrb: d.faixasOrb });
  }

  function pintarConta(c) {
    const { conta, botao } = c.partes;
    const card = c.card;
    conta.textContent = '';
    if (card.acao === 'calcular') {
      const lendo = ultimo && (ultimo.calculando || []).includes(card.pokemonId);
      botao.textContent = lendo ? 'Lendo o mercado…' : 'Calcular preço';
      botao.disabled = Boolean(lendo);
      botao.classList.remove('prejuizo');
      return;
    }
    const p = lerPreco(c);
    if (!(p >= RvPk.PRECO_MINIMO)) { conta.textContent = `Preço mínimo: ${RvPk.PRECO_MINIMO}.`; botao.disabled = true; return; }
    const r = contaDoCartao(c);
    const m = card.ficha.moeda;
    conta.append(document.createTextNode(m === 'orb'
      ? `Líquido ${fmtN(r.liquido)} Gemas (já sem a comissão por faixa)${card.grupo === 'anunciar' ? ` · diária ${fmtN(r.diariaTotal)} de ouro` : ''}`
      : `Líquido ${fmtN(r.liquido)} (já sem os 15%${card.grupo === 'anunciar' ? ` e ${fmtN(r.diariaTotal)} de diária` : ''})`));
    if (typeof r.lucro === 'number') {
      conta.append(document.createTextNode(' · lucro '));
      conta.append(el('span', r.lucro < 0 ? 'ruim' : null, fmtN(r.lucro)));
    }
    const alertas = RvPk.alertasDoPreco({ preco: p, conta: r, sugestao: card.sugestao });
    const perigo = alertas.length > 0;
    botao.classList.toggle('prejuizo', perigo);
    const ocupado = c.acao && c.acao.fase === 'enviando';
    botao.disabled = Boolean(ocupado);
    const verbo = card.grupo === 'mudar' ? `Mudar preço para ${fmtN(p)}` : `Anunciar por ${fmtN(p)}${m === 'orb' ? ' Gemas' : ''}`;
    botao.textContent = perigo ? (c.confirmar ? `Confirmar (${alertas.join(', ')})` : `${verbo} (${alertas.join(', ')})`) : verbo;
  }

  function clicar(c) {
    const card = c.card;
    if (card.acao === 'calcular') {
      c.partes.botao.disabled = true;
      c.partes.botao.textContent = 'Lendo o mercado…';
      bus.emit('revenda:pk:calcular', { pokemonId: card.pokemonId });
      return;
    }
    const p = lerPreco(c);
    if (!(p >= RvPk.PRECO_MINIMO)) return;
    const alertas = RvPk.alertasDoPreco({ preco: p, conta: contaDoCartao(c), sugestao: card.sugestao });
    if (alertas.length && !c.confirmar) { c.confirmar = true; pintarConta(c); return; }
    c.confirmar = false;
    c.partes.botao.disabled = true;
    if (card.grupo === 'mudar') bus.emit('revenda:pk:mudar-preco', { anuncioId: card.anuncioId, pokemonId: card.pokemonId, preco: p });
    else bus.emit('revenda:pk:anunciar', { pokemonId: card.pokemonId, preco: p, dias: lerDias(c) });
  }

  function pintarCartao(c, card, acao) {
    const precoAntes = c.card && c.card.sugestao && c.card.sugestao.preco;
    c.card = card;
    c.acao = acao || null;
    const f = card.ficha;
    const s = card.sugestao;
    const pt = c.partes;
    pt.nome.textContent = `${f.nome || 'Pokémon'} Nv ${fmtN(f.nivel)}${f.shiny ? ' · shiny' : ''}`;
    pt.selo.hidden = !card.doRadar;
    pt.ddPk.textContent = Pk.resumo(f);
    const iv = Pk.ivUtil(f);
    pt.ddIv.textContent = iv ? `${iv}${s && s.ataque && typeof s.ataque.mediana === 'number' ? ` (ataque ${fmt2(f.notaAtaque)}; parecidas ${fmt2(s.ataque.mediana)})` : ''}` : '-';
    pt.ddCusto.textContent = card.custo ? `${fmtN(card.custo.valor)} ${card.custo.moeda === 'orb' ? 'Gemas' : ''}${card.custo.fonte === 'radar' ? '(pelo radar)' : '(histórico do jogo)'}`.replace('  ', ' ') : 'sem registro (drop, captura ou compra antiga)';
    pt.ddVendas.textContent = !s ? '-' : s.n ? `${fmtN(s.n)} em 30 dias, de ${fmtN(s.min)} a ${fmtN(s.max)} · 25º percentil ${fmtN(s.p25)} · mediana ${fmtN(s.mediana)}` : 'nenhuma venda parecida em 30 dias';
    pt.ddAVenda.textContent = !s ? '-' : s.menorAVenda !== null ? `${fmtN(s.menorAVenda)} (o mais barato de ${fmtN(s.nAVenda)} de outros jogadores)` : 'nenhum de outro jogador';
    pt.ddAtual.parentElement && (pt.ddAtual.previousSibling.hidden = card.grupo !== 'mudar');
    pt.ddAtual.hidden = card.grupo !== 'mudar';
    pt.ddAtual.textContent = card.grupo === 'mudar' ? `${fmtN(card.precoAtual)} ${moedaTexto(f.moeda)}` : '';
    // O que ele digitou fica, a não ser que a sugestão tenha mudado.
    const sugerido = s ? s.preco : null;
    if (!c.sujo || precoAntes !== sugerido) {
      pt.preco.value = sugerido ? String(sugerido) : card.grupo === 'mudar' ? String(card.precoAtual || '') : '';
      c.sujo = false;
    }
    pt.rotDias.hidden = card.grupo !== 'anunciar';
    // Com o preço calculado, campos e conta; "já é o primeiro" não tem botão.
    const comCampos = card.acao !== 'calcular' && card.acao !== 'primeiro';
    pt.campos.hidden = !comCampos;
    pt.conta.hidden = !comCampos;
    pt.acoes.hidden = card.acao === 'primeiro';
    const notas = {
      calcular: 'Clique para ler as vendas e os anúncios parecidos da espécie (2 ou 3 pedidos ao jogo).',
      anunciar: !s ? '' : s.fonte === 'anuncio' ? 'Sugerido: 1 abaixo do anúncio parecido mais barato de outro jogador.'
        : s.fonte === 'p25' ? 'Sugerido: o 25º percentil das vendas parecidas (o anúncio parecido mais barato está abaixo dele, provavelmente com erro de preço).'
        : 'Sugerido: a mediana das vendas parecidas (não há anúncio parecido à venda).',
      'sem-referencia': 'Sem venda nem anúncio parecido para sugerir um preço: digite o seu.',
      'mudar-preco': 'Há anúncio parecido abaixo do seu. Mudar o preço reinicia os 2 min de retenção.',
      primeiro: 'Nenhum anúncio parecido de outro jogador abaixo do seu.',
    };
    let texto = notas[card.acao] || '';
    if (card.grupo === 'anunciar' && card.acao !== 'calcular') texto += ' A diária é paga na hora e não volta se vender antes; sem venda no prazo, o pokémon volta para a equipe. O anúncio fica 2 min retido.';
    if (f.moeda === 'orb') texto += ' Shiny só se anuncia em Gemas.';
    pt.nota.textContent = texto.trim();
    pt.estado.textContent = acao ? acao.texto : '';
    pt.estado.classList.toggle('bom', Boolean(acao && acao.fase === 'ok'));
    pt.estado.classList.toggle('ruim', Boolean(acao && acao.fase === 'erro'));
    pintarConta(c);
  }

  function pintar(d) {
    ultimo = d;
    const alvo = montarArea();
    if (!alvo) return;
    const vistos = new Set();
    let anterior = null;
    const ordenados = [...(d.cartoes || [])].map((card, i) => ({ card, i }))
      .sort((a, b) => (ORDEM_ACAO[a.card.acao] ?? 9) - (ORDEM_ACAO[b.card.acao] ?? 9) || a.i - b.i)
      .map((x) => x.card);
    for (const card of ordenados) {
      vistos.add(card.chave);
      let c = cartoes.get(card.chave);
      if (!c) { c = criarCartao(card); cartoes.set(card.chave, c); }
      pintarCartao(c, card, d.acoes && d.acoes[card.pokemonId]);
      if (anterior ? anterior.nextSibling !== c.el : alvo.firstChild !== c.el) {
        if (anterior) anterior.after(c.el);
        else alvo.prepend(c.el);
      }
      anterior = c.el;
    }
    for (const [chave, c] of [...cartoes]) {
      if (!vistos.has(chave)) { c.el.remove(); cartoes.delete(chave); }
    }
    const ocultos = Object.entries(d.ocultos || {}).filter(([, n]) => n > 0).map(([m, n]) => `${fmtN(n)} ${MOTIVOS[m] || m}`);
    ui.ocultos.textContent = ocultos.length ? `Fora da lista (o jogo não deixa anunciar): ${ocultos.join(', ')}.` : '';
    ui.ocultos.hidden = !ocultos.length;
    filtrar();
  }

  globalThis.RadarRevendaPokemonUI = Object.freeze({ quantos: () => cartoes.size, ultimo: () => ultimo });
  bus.on('tela:revenda-pk', (d) => { try { pintar(d); } catch (e) { erro(e); } });
})();
