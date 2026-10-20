// Radar do Mercado: os cartões de aviso.
//
// Cada aviso vira um cartão com item, preço, referência, lucro estimado, % abaixo e a contagem
// até o anúncio liberar (no relógio do servidor). O botão Comprar pede ao radar um único envio;
// os cartões só mostram e repassam cliques. A compra automática aparece no mesmo cartão, marcada
// "automática", com Cancelar enquanto não sai.
//
// Cartão que já não dá para comprar (comprado, saiu do mercado, perdeu o sorteio) se recolhe
// numa linha e sai da contagem de avisos, para dar lugar aos próximos; um clique na linha abre
// os detalhes de novo e outro recolhe.
//
// Duas sub-abas separam os avisos de item e os de pokémon (0.6.3), cada uma com o número dos
// avisos abertos dela e até 6 cartões.
//
// Os cartões moram na aba Avisos do painel no jogo (tela.js, que inclui o CSS daqui no shadow
// DOM dele). Se o painel não estiver disponível, eles voltam a flutuar no canto inferior
// direito da página, num shadow DOM próprio.
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const bus = globalThis.RadarBus;
  const C = globalThis.RadarCompra;
  if (!bus || !C) return;

  const MAX_CARTOES = 6;
  const ID_HOST = 'radar-mercado-painel';

  // Variáveis com prefixo próprio: o jogo já define --verde, --vermelho e outras, e elas são
  // herdadas para dentro do shadow DOM.
  const CSS_CARTOES = `
    .rm-cartoes {
      --rm-fundo: #16191e; --rm-superficie: #1f232a; --rm-borda: #333944; --rm-texto: #eceef2; --rm-fraco: #9aa1ad;
      --rm-verde: #3ec27a; --rm-ambar: #f0b429; --rm-vermelho: #ef5350; --rm-acao: #2f7d4f; --rm-acao-texto: #fff;
      display: flex; flex-direction: column; gap: 8px;
    }
    .cartao[hidden] { display: none !important; }
    .rm-subabas { display: flex; gap: 6px; margin: 0 0 8px; }
    .rm-subabas[hidden] { display: none; }
    .rm-subabas .aba { height: 28px; padding: 0 12px; font-size: 11px; }
    .rm-vazio-grupo { margin: 0 0 8px; color: #9aa1ad; font-size: 12px; }
    .cartao { background: var(--rm-fundo); color: var(--rm-texto); border: 1px solid var(--rm-borda); border-radius: 8px; padding: 10px 12px; }
    .cabeca { display: flex; align-items: baseline; gap: 8px; }
    .nome { font-weight: 650; font-size: 14px; }
    .desconto { color: var(--rm-verde); font-weight: 700; font-variant-numeric: tabular-nums; }
    .fechar-cartao { margin-left: auto; border: 0; background: none; color: var(--rm-fraco); font: inherit; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; }
    .cartao dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0; }
    .cartao dt { color: var(--rm-fraco); }
    .cartao dd.sorteio small { display: block; color: var(--rm-fraco); font-size: 11px; margin-top: 2px; }
    .cartao dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .marcas { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .marca { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--rm-ambar); color: var(--rm-ambar); }
    .marca.auto { border-color: #6b9bff; color: #9dbcff; }
    .acoes { display: flex; gap: 8px; align-items: center; }
    .qtd { display: flex; align-items: center; border: 1px solid var(--rm-borda); border-radius: 6px; overflow: hidden; }
    .qtd button { width: 26px; height: 28px; border: 0; background: var(--rm-superficie); color: var(--rm-texto); font: inherit; cursor: pointer; }
    .qtd input { width: 54px; height: 28px; border: 0; background: var(--rm-fundo); color: var(--rm-texto); text-align: center; font: inherit; font-variant-numeric: tabular-nums; }
    .comprar { flex: 1; height: 30px; border: 0; border-radius: 6px; background: var(--rm-acao); color: var(--rm-acao-texto); font: inherit; font-weight: 650; cursor: pointer; }
    .cancelar { height: 30px; border: 1px solid var(--rm-borda); border-radius: 6px; background: var(--rm-superficie); color: var(--rm-texto); font: inherit; cursor: pointer; padding: 0 10px; }
    .cartao button:disabled { opacity: .55; cursor: not-allowed; }
    .cartao button:focus-visible, .cartao input:focus-visible { outline: 2px solid #6b9bff; outline-offset: 1px; }
    .estado { margin: 8px 0 0; color: var(--rm-fraco); min-height: 1em; }
    .estado.bom { color: var(--rm-verde); font-weight: 600; }
    .estado.ruim { color: var(--rm-vermelho); }
    .cartao [hidden] { display: none !important; }
    .resumo { display: none; color: var(--rm-verde); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .cartao.recolhivel .cabeca { cursor: pointer; }
    .cartao.recolhivel .cabeca:focus-visible { outline: 2px solid #6b9bff; outline-offset: 2px; border-radius: 4px; }
    .cartao.recolhido { padding: 5px 10px 5px 12px; }
    .cartao.recolhido:hover { border-color: var(--rm-verde); }
    .cartao.recolhido .nome { font-size: 13px; font-weight: 600; }
    .cartao.recolhido .desconto, .cartao.recolhido dl, .cartao.recolhido .marcas, .cartao.recolhido .acoes, .cartao.recolhido .estado { display: none; }
    .cartao.recolhido .resumo { display: inline; }
    .resumo.fraco { color: var(--rm-fraco); }
  `;

  // Só no modo flutuante (sem o painel no jogo).
  const CSS_FLUTUANTE = `
    :host { all: initial; }
    .raiz {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 300px; max-width: calc(100vw - 32px);
      font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .raiz .rm-cartoes { max-height: 70vh; overflow-y: auto; }
    .cartao { box-shadow: 0 4px 18px rgba(0,0,0,.35); }
  `;

  const fmtN = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString('pt-BR') : '-');
  const FONTES = { proximo: 'próximo da fila', mediana24h: 'mediana de 24 h', media7d: 'média de 7 dias' };

  let host = null;
  let lista = null;
  let desvio = null;
  const cartoes = new Map(); // anuncioId -> { el, alerta, compra }

  function erro(e) { try { console.error(PREFIXO, e); } catch { /* nada */ } }

  function montar() {
    if (lista) return;
    const tela = globalThis.RadarTela;
    const area = tela && typeof tela.areaDeAvisos === 'function' ? tela.areaDeAvisos() : null;
    if (area) {
      lista = area;
    } else {
      host = document.createElement('div');
      host.id = ID_HOST;
      const sombra = host.attachShadow({ mode: 'open' });
      const estilo = document.createElement('style');
      estilo.textContent = CSS_FLUTUANTE + CSS_CARTOES;
      const raiz = document.createElement('div');
      raiz.className = 'raiz';
      lista = document.createElement('div');
      lista.className = 'rm-cartoes';
      raiz.append(lista);
      sombra.append(estilo, raiz);
      (document.body || document.documentElement).appendChild(host);
    }
    montarSubabas();
    setInterval(tique, 500);
  }

  // ---- sub-abas Itens e Pokémon ----------------------------------------------------------------

  const GRUPOS = [['item', 'Itens'], ['pokemon', 'Pokémon']];
  const grupoDe = (a) => (a && a.categoria === 'pokemon' ? 'pokemon' : 'item');
  const sub = { grupo: 'item', botoes: {}, numeros: {}, topo: null, vazio: null };

  function montarSubabas() {
    const pai = lista && lista.parentNode;
    if (!pai || sub.topo) return;
    sub.topo = document.createElement('div');
    sub.topo.className = 'rm-subabas';
    sub.topo.setAttribute('role', 'tablist');
    for (const [chave, rotulo] of GRUPOS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'aba cfg-escala-bt';
      b.setAttribute('role', 'tab');
      b.dataset.grupo = chave;
      b.textContent = rotulo;
      const n = document.createElement('span');
      n.className = 'n';
      n.hidden = true;
      b.append(n);
      b.addEventListener('click', () => { sub.grupo = chave; filtrar(); });
      sub.botoes[chave] = b;
      sub.numeros[chave] = n;
      sub.topo.append(b);
    }
    sub.vazio = document.createElement('p');
    sub.vazio.className = 'rm-vazio-grupo';
    sub.vazio.hidden = true;
    pai.insertBefore(sub.topo, lista);
    pai.insertBefore(sub.vazio, lista);
  }

  // Mostra só os cartões da sub-aba escolhida e atualiza os números.
  function filtrar() {
    const abertos = { item: 0, pokemon: 0 };
    const todos = { item: 0, pokemon: 0 };
    for (const c of cartoes.values()) {
      const g = grupoDe(c.alerta);
      todos[g] += 1;
      if (vivo(c)) abertos[g] += 1;
      c.el.hidden = g !== sub.grupo;
    }
    for (const [chave] of GRUPOS) {
      if (sub.botoes[chave]) { const _b = sub.botoes[chave]; _b.setAttribute('aria-selected', String(chave === sub.grupo)); _b.classList.toggle('on', chave === sub.grupo); }
      if (sub.numeros[chave]) {
        sub.numeros[chave].textContent = String(abertos[chave]);
        sub.numeros[chave].hidden = abertos[chave] === 0;
      }
    }
    if (sub.topo) sub.topo.hidden = cartoes.size === 0;
    if (sub.vazio) {
      const outro = sub.grupo === 'item' ? 'pokemon' : 'item';
      sub.vazio.hidden = cartoes.size === 0 || todos[sub.grupo] > 0;
      const resto = abertos[outro] ? ` Há ${abertos[outro]} aberto${abertos[outro] > 1 ? 's' : ''} em ${outro === 'item' ? 'Itens' : 'Pokémon'}.` : '';
      sub.vazio.textContent = `Nenhum aviso de ${sub.grupo === 'item' ? 'item' : 'pokémon'} por enquanto.${resto}`;
    }
  }

  // Compra concluída que chegou ao servidor: o radar não manda outra para o mesmo anúncio.
  const encerrada = (c) => !!(c.compra && c.compra.fase === 'concluida' && !['cancelada', 'nao-enviada'].includes(c.compra.resultado));
  // Aviso aberto: ainda dá para comprar (ou a compra está em andamento).
  const vivo = (c) => !c.sumiu && !encerrada(c);

  // n: avisos abertos (o selo da barra e o número da aba); comprado ou saído já não conta.
  function contar() {
    if (host) host.style.setProperty('display', cartoes.size === 0 ? 'none' : 'block', 'important');
    bus.emit('painel:contagem', { n: [...cartoes.values()].filter(vivo).length, total: cartoes.size });
    filtrar();
  }

  function recolher(c, sim) {
    if (!c) return;
    const { cabeca } = c.partes;
    c.el.classList.toggle('recolhido', sim);
    cabeca.setAttribute('aria-expanded', String(!sim));
    cabeca.title = sim ? 'Ver os detalhes da compra' : 'Recolher';
  }

  function pintarResumo(c, texto, tom) {
    c.resumoBase = texto;
    c.resumoTom = tom;
    const sr = c.sorteio;
    const extra = sr && sr.participantes ? ` · ${fmtN(sr.participantes)} na disputa${!sr.ganhou && sr.vencedores.length ? `, levou ${sr.vencedores[0]}` : ''}` : '';
    // 1.9: há quanto tempo foi o sorteio (anda sozinho no tique).
    const quando = c.encerradoEm ? ` · ${haQuanto(c.encerradoEm)}` : '';
    texto = `${texto}${extra}${quando}`;
    c.partes.resumo.textContent = texto;
    c.partes.resumo.classList.toggle('fraco', tom !== 'bom');
  }

  // Aviso encerrado: o cartão vira uma linha com o desfecho e passa a abrir e recolher.
  function haQuanto(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `há ${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
    return `há ${Math.floor(h / 24)} d`;
  }

  function tornarRecolhivel(c, texto, tom) {
    const { cabeca } = c.partes;
    pintarResumo(c, texto, tom);
    c.el.classList.add('recolhivel');
    cabeca.tabIndex = 0;
    cabeca.setAttribute('role', 'button');
    recolher(c, true);
  }

  function agoraServidor() {
    return desvio === null ? null : Date.now() - desvio;
  }

  function contagem(compravelEm) {
    const agora = agoraServidor();
    if (agora === null || typeof compravelEm !== 'number') return '-';
    const falta = compravelEm - agora;
    if (falta <= 0) return 'liberado';
    const seg = Math.ceil(falta / 1000);
    return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function linha(dl, rotulo, valor, classe) {
    dl.append(el('dt', null, rotulo));
    const dd = el('dd', classe, valor);
    dl.append(dd);
    return dd;
  }

  function criarCartao(a) {
    const cartao = el('article', 'cartao');
    cartao.dataset.anuncio = String(a.anuncioId);
    const cabeca = el('div', 'cabeca');
    const resumo = el('span', 'resumo');
    cabeca.append(el('span', 'nome', a.nome), el('span', 'desconto', `${Math.round(a.desconto * 100)}% abaixo`), resumo);
    const fechar = el('button', 'fechar-cartao', '×');
    fechar.type = 'button';
    fechar.title = 'Ignorar este aviso';
    fechar.setAttribute('aria-label', 'Ignorar este aviso');
    cabeca.append(fechar);

    const dl = el('dl');
    const pokemon = a.categoria === 'pokemon' && a.pokemon;
    let ddLucro = null;
    if (pokemon) {
      // Pokémon é único: o valor de mercado vem das vendas parecidas, e a revenda paga a diária.
      const pk = a.pokemon;
      linha(dl, 'Pokémon', pk.resumo);
      // 0.6.2: os IV que batem (o lado de ataque da espécie e o SPD) e a nota de ataque das parecidas.
      if (pk.ivUtil) {
        const n2 = (v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '-');
        linha(dl, 'IV útil', `${pk.ivUtil}${typeof pk.ataqueParecidas === 'number' ? ` (ataque ${n2(pk.notaAtaque)}; parecidas ${n2(pk.ataqueParecidas)})` : ''}`);
      }
      linha(dl, 'Preço', fmtN(a.preco));
      linha(dl, 'Valor de mercado', a.fontes[0] === 'anuncioParecido'
        ? `${fmtN(a.referencia)} (menor anúncio parecido à venda)`
        : `${fmtN(a.referencia)} (${fmtN(pk.n)} vendas parecidas em 30 dias, de ${fmtN(pk.min)} a ${fmtN(pk.max)})`);
      linha(dl, 'Lucro estimado', `${fmtN(a.lucroTotal)} (sem os 15% e 1 dia de diária)`);
    } else {
      linha(dl, 'Preço', `${fmtN(a.preco)} × ${fmtN(a.qtdAnuncio)} no anúncio`);
      linha(dl, 'Revenda', `${fmtN(a.referencia)} (${a.fontes.map((f) => FONTES[f] || f).join(', ')})`);
      linha(dl, 'Lucro por unidade', `${fmtN(a.lucroPorUnidade)} (já sem os 15%)`);
      ddLucro = linha(dl, 'Lucro estimado', '');
    }
    const ddLibera = linha(dl, 'Libera em', contagem(a.compravelEm), 'libera');
    // A disputa do sorteio (0.8.0): aparece quando a compra entra nele.
    const ddSorteio = linha(dl, 'Sorteio', '', 'sorteio');
    ddSorteio.hidden = true;
    ddSorteio.previousSibling.hidden = true;

    const marcas = el('div', 'marcas');
    if (pokemon) marcas.append(el('span', 'marca auto', 'pokémon'));
    if (a.motivoAuto) marcas.append(el('span', 'marca', `não comprou sozinho: ${a.motivoAuto}`));
    if (a.iliquido) marcas.append(el('span', 'marca', 'ilíquido'));
    if (a.poucoConfiavel) marcas.append(el('span', 'marca', 'pouco confiável'));
    if (a.automatica) marcas.append(el('span', 'marca auto', 'automática'));
    marcas.hidden = !marcas.childElementCount;

    const acoes = el('div', 'acoes');
    const qtd = el('div', 'qtd');
    const menos = el('button', null, '−');
    const campo = el('input');
    const mais = el('button', null, '+');
    menos.type = 'button';
    mais.type = 'button';
    menos.setAttribute('aria-label', 'Menos unidades');
    mais.setAttribute('aria-label', 'Mais unidades');
    campo.type = 'number';
    campo.min = '1';
    campo.max = String(Math.max(1, a.qtd));
    campo.value = String(Math.max(1, a.qtd));
    campo.setAttribute('aria-label', 'Quantidade');
    qtd.append(menos, campo, mais);
    // Pokémon é um só: sem escolher a quantidade.
    qtd.hidden = Boolean(pokemon);
    const comprar = el('button', 'comprar', 'Comprar');
    comprar.type = 'button';
    const cancelar = el('button', 'cancelar', 'Cancelar');
    cancelar.type = 'button';
    cancelar.hidden = true;
    acoes.append(qtd, comprar, cancelar);
    const estado = el('p', 'estado');
    estado.setAttribute('aria-live', 'polite');

    cartao.append(cabeca, dl, marcas, acoes, estado);

    const ler = () => Math.min(Math.max(1, a.qtd), Math.max(1, Math.floor(Number(campo.value) || 1)));
    const pintarLucro = () => { if (ddLucro) ddLucro.textContent = fmtN(a.lucroPorUnidade * ler()); };
    menos.addEventListener('click', () => { campo.value = String(Math.max(1, ler() - 1)); pintarLucro(); });
    mais.addEventListener('click', () => { campo.value = String(Math.min(Math.max(1, a.qtd), ler() + 1)); pintarLucro(); });
    campo.addEventListener('change', () => { campo.value = String(ler()); pintarLucro(); });
    comprar.addEventListener('click', () => {
      comprar.disabled = true;
      bus.emit('painel:comprar', { anuncioId: a.anuncioId, qtd: ler() });
    });
    cancelar.addEventListener('click', () => bus.emit('painel:cancelar', { anuncioId: a.anuncioId }));
    // Só o cartão comprado abre e recolhe; o × continua ignorando o aviso.
    const alternar = () => {
      if (!cartao.classList.contains('recolhivel')) return;
      recolher(cartoes.get(a.anuncioId), !cartao.classList.contains('recolhido'));
    };
    cabeca.addEventListener('click', (ev) => { if (!fechar.contains(ev.target)) alternar(); });
    cabeca.addEventListener('keydown', (ev) => {
      if (ev.target !== cabeca || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      ev.preventDefault();
      alternar();
    });
    fechar.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const c = cartoes.get(a.anuncioId);
      if (c && c.compra && ['agendada', 'enviada', 'sorteio'].includes(c.compra.fase)) {
        estado.textContent = 'Espere o resultado da compra ou cancele antes.';
        return;
      }
      bus.emit('painel:ignorar', { anuncioId: a.anuncioId });
      remover(a.anuncioId);
    });
    pintarLucro();
    return { el: cartao, alerta: a, compra: null, partes: { cabeca, resumo, comprar, cancelar, estado, ddLibera, ddSorteio, campo, menos, mais } };
  }

  function mostrar(a) {
    try {
      montar();
      if (typeof a.desvio === 'number') desvio = a.desvio;
      if (cartoes.has(a.anuncioId)) return;
      const c = criarCartao(a);
      const g = grupoDe(a);
      // A sub-aba vai para a do aviso novo só se a de agora não tem aviso aberto: nada muda de
      // lugar embaixo do clique.
      if (g !== sub.grupo && ![...cartoes.values()].some((x) => grupoDe(x.alerta) === sub.grupo && vivo(x))) sub.grupo = g;
      cartoes.set(a.anuncioId, c);
      lista.prepend(c.el);
      // Só os mais recentes de cada sub-aba; os sem compra em andamento saem primeiro.
      const doGrupo = () => [...cartoes.values()].filter((x) => grupoDe(x.alerta) === g);
      while (doGrupo().length > MAX_CARTOES) {
        const antigos = doGrupo().reverse();
        const velho = antigos.find((x) => !vivo(x)) || antigos.find((x) => !x.compra || x.compra.fase === 'concluida');
        if (!velho) break;
        remover(velho.alerta.anuncioId);
      }
      contar();
    } catch (e) {
      erro(e);
    }
  }

  function remover(anuncioId) {
    const c = cartoes.get(anuncioId);
    if (!c) return;
    c.el.remove();
    cartoes.delete(anuncioId);
    contar();
  }

  function aoCompra(ev) {
    const c = cartoes.get(ev.anuncioId);
    if (!c) return;
    c.compra = ev;
    const { comprar, cancelar, estado, campo, menos, mais } = c.partes;
    const andamento = ['agendada', 'enviada', 'sorteio'].includes(ev.fase);
    comprar.disabled = andamento || (ev.fase === 'concluida' && ev.resultado !== 'cancelada' && ev.resultado !== 'nao-enviada');
    cancelar.hidden = ev.fase !== 'agendada';
    campo.disabled = menos.disabled = mais.disabled = comprar.disabled;
    const comprou = ev.resultado === 'ganhou' || ev.resultado === 'confirmado';
    c.auto = Boolean(ev.auto);
    estado.classList.toggle('bom', comprou);
    estado.classList.toggle('ruim', ev.fase === 'concluida' && !comprou && ev.resultado !== 'cancelada');
    if (ev.fase === 'agendada') {
      c.agendadoPara = ev.enviarEm;
      estado.textContent = c.auto ? 'Automática' : 'Agendada';
    } else {
      c.agendadoPara = null;
      estado.textContent = ev.fase === 'concluida' && ev.msg && !comprou ? `${ev.rotulo}: ${ev.msg}` : ev.rotulo;
    }
    if (ev.fase === 'concluida' && ev.resultado === 'cancelada') comprar.textContent = 'Comprar';
    if (encerrada(c)) {
      if (!c.encerradoEm) c.encerradoEm = typeof ev.concluidoEm === 'number' ? ev.concluidoEm : Date.now();
      const quanto = typeof ev.qtd === 'number' && ev.qtd > 0 ? ` · ${fmtN(ev.qtd)} × ${fmtN(c.alerta.preco)}` : '';
      const texto = comprou ? `Comprado${quanto}${ev.resultado === 'confirmado' ? ' (confirmado no histórico)' : ''}` : ev.rotulo;
      // O "sem resposta" pode virar "confirmado no histórico" depois: a linha acompanha.
      if (!c.el.classList.contains('recolhivel')) tornarRecolhivel(c, texto, comprou ? 'bom' : 'fraco');
      else pintarResumo(c, texto, comprou ? 'bom' : 'fraco');
      contar();
    }
  }

  function tique() {
    for (const c of cartoes.values()) {
      if (c.encerradoEm && c.resumoBase && Date.now() - (c.resumoPintadoEm || 0) > 1000) { c.resumoPintadoEm = Date.now(); pintarResumo(c, c.resumoBase, c.resumoTom); }
      c.partes.ddLibera.textContent = contagem(c.alerta.compravelEm);
      if (c.agendadoPara) {
        const falta = Math.max(0, Math.ceil((c.agendadoPara - Date.now()) / 1000));
        const rotulo = c.auto ? 'Automática' : 'Agendada';
        // Passou da hora e não saiu: espera a compra enviada antes dela terminar.
        c.partes.estado.textContent = Date.now() - c.agendadoPara > 1500
          ? `${rotulo}: na fila, esperando a compra anterior`
          : `${rotulo}: envia em ${Math.floor(falta / 60)}:${String(falta % 60).padStart(2, '0')}`;
      }
    }
  }

  globalThis.RadarCartoes = Object.freeze({ CSS: CSS_CARTOES, quantos: () => cartoes.size });

  bus.on('painel:mostrar', mostrar);
  bus.on('painel:compra', (ev) => { try { aoCompra(ev); } catch (e) { erro(e); } });
  bus.on('painel:aviso', ({ anuncioId, texto }) => {
    const c = cartoes.get(anuncioId);
    if (!c) return;
    c.partes.estado.textContent = texto;
    if (!c.sumiu && (!c.compra || c.compra.fase === 'concluida')) c.partes.comprar.disabled = false;
  });
  bus.on('painel:relogio', (r) => { if (typeof r.desvio === 'number') desvio = r.desvio; });
  // A disputa do sorteio: quantos, a sua chance, quem levou e quem entrou.
  bus.on('painel:sorteio', (r) => {
    const c = cartoes.get(r.anuncioId);
    if (!c) return;
    c.sorteio = r;
    const dd = c.partes.ddSorteio;
    const chance = typeof r.chance === 'number' ? `${Math.round(r.chance * 100)}%` : '-';
    dd.textContent = '';
    dd.append(document.createTextNode(`${fmtN(r.participantes)} participante${r.participantes === 1 ? '' : 's'} · sua chance ${chance}${r.vencedores.length ? ` · levou: ${r.vencedores.join(', ')}` : ''}`));
    if (r.quem.length) dd.append(el('small', 'quem-sorteio', `Na disputa: ${r.quem.join(', ')}${r.participantes > r.quem.length ? ` e mais ${fmtN(r.participantes - r.quem.length)}` : ''}`));
    dd.hidden = false;
    dd.previousSibling.hidden = false;
    if (c.resumoBase) pintarResumo(c, c.resumoBase, c.resumoTom);
  });
  // O anúncio do aviso saiu do mercado: o cartão se recolhe, sem Comprar. porVoce: você
  // comprou esse item pelo próprio jogo depois do aviso.
  bus.on('painel:sumiu', ({ anuncioId, porVoce }) => {
    const c = cartoes.get(anuncioId);
    if (!c || c.sumiu || (c.compra && c.compra.fase !== 'concluida')) return;
    const { comprar, estado, campo, menos, mais, ddLibera } = c.partes;
    comprar.disabled = campo.disabled = menos.disabled = mais.disabled = true;
    comprar.textContent = porVoce ? 'Comprado' : 'Saiu';
    estado.textContent = porVoce ? 'Comprado por você no jogo.' : 'Saiu do mercado: comprado por outro jogador ou retirado.';
    estado.classList.toggle('bom', !!porVoce);
    estado.classList.toggle('ruim', !porVoce);
    c.sumiu = true;
    c.alerta = { ...c.alerta, compravelEm: null };
    ddLibera.textContent = '-';
    if (!c.el.classList.contains('recolhivel')) tornarRecolhivel(c, porVoce ? 'Comprado por você no jogo' : 'Saiu do mercado', porVoce ? 'bom' : 'fraco');
    contar();
  });
})();
