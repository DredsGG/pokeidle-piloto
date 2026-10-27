// Radar do Mercado: gancho no WebSocket do jogo.
//
// Roda no contexto da página (world MAIN), em document_start, antes do cliente do jogo abrir o
// socket. Regras que este arquivo não pode quebrar:
// - O jogo recebe exatamente o que recebia: só acrescentamos um ouvinte com addEventListener,
//   sem tocar em onmessage, e o processamento nosso fica para uma tarefa seguinte, depois do
//   handler do jogo.
// - Nada do jogo é alterado fora da gravação. Com a gravação ligada (e só então) a instância do
//   socket ganha um repassador de send que registra e chama o send de sempre, com o mesmo this,
//   os mesmos argumentos, o mesmo retorno e a mesma exceção. Ao parar, ele é apagado.
// - O radar (Fase 1) não usa o repassador: escuta igual e manda os pedidos dele pelo send
//   nativo, só de uma lista fechada de tipos, e no máximo um market.comprar por anúncio.
// - Só sai daqui o que é do mercado. hello, token, chat e estado do jogador ficam na página; do
//   resto vai só o nome do tipo, para contagem. A exceção é o meu id e o meu saldo de ouro,
//   que vão só para o radar (para descartar os meus anúncios e não pedir mais do que o saldo
//   paga) e nunca para a gravação.
// - Qualquer erro nosso fica no console com o prefixo e o jogo segue normal.
(function (raiz) {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const MARCA = Symbol.for('radar-mercado.hook');
  if (raiz[MARCA]) return;

  const Nativo = raiz.WebSocket;
  // O send de verdade (o do protótipo), guardado antes do jogo carregar: o radar envia por ele,
  // nunca pelo send da instância.
  const sendNativo = Nativo && Nativo.prototype ? Nativo.prototype.send : null;
  const doc = raiz.document;
  const CustomEventNativo = raiz.CustomEvent;
  const agendar = raiz.setTimeout.bind(raiz);
  const agora = () => Date.now();
  const consoleErro = raiz.console && raiz.console.error ? raiz.console.error.bind(raiz.console) : () => {};
  if (typeof Nativo !== 'function' || typeof sendNativo !== 'function' || !doc || typeof CustomEventNativo !== 'function') return;

  const EVT_SAIDA = 'radar-mercado:hook'; // hook para ponte
  const EVT_ENTRADA = 'radar-mercado:ponte'; // ponte para hook
  const LIMITE_FILA = 2000;
  const LIMITE_PENDENTES = 200;
  const INTERVALO_RELOGIO_MS = 5000;
  const INTERVALO_PULSO_MS = 3000;
  const INTERVALO_POKEMONS_MS = 10000;
  const INTERVALO_CONTAGEM_MS = 5000;
  const CABECA = 64;

  const INTERESSE_RADAR = new Set(['market', 'erro', 'batalha', 'estado']);
  // Rastro da compra: por este tempo depois de cada market.comprar, o radar recebe o tipo de toda
  // mensagem que chega (e, no erro, a chave), para entender a compra que fica sem resposta.
  const RASTRO_MS = 20000;
  // A resposta da compra chega em menos de 1 s: o aviso em texto solto só passa nos 3 s seguintes.
  const AVISO_LIVRE_MS = 3000;
  const RE_CHAVE = /"chave"\s*:\s*"([^"\\]{1,64})"/;
  const RE_MSG = /"msg"\s*:\s*"([^"\\]{0,120})/;
  const RE_ABA = /"aba"\s*:\s*"([^"\\]{1,32})"/;
  const RE_K_MERCADO = /"k"\s*:\s*"(market[A-Za-z]{0,40})"/g;
  // { k: 'aviso', msg: 'market.…' } no texto, mesmo cortado (o servidor manda k antes de msg).
  const RE_AVISO_MERCADO = /"k"\s*:\s*"aviso"\s*,\s*"msg"\s*:\s*"(market\.[^"\\]{1,80})"/g;
  // Qualquer aviso (0.6.3): a recusa de compra de anúncio que já saiu vem em texto solto, sem a
  // chave market.*. Só entra no rastro e só passa ao radar nos 3 s depois de um market.comprar.
  const RE_AVISO_QUALQUER = /"k"\s*:\s*"aviso"\s*,\s*"msg"\s*:\s*"([^"\\]{1,80})/g;

  // Eventos de batalha.ev que interessam. O resto (combate) nem é copiado.
  const EVENTOS_FORA_DO_PREFIXO = new Set(['orbsSaque', 'orbsEstorno', 'diamantesCreditados']);

  function erro(e) {
    try { consoleErro(PREFIXO, e); } catch { /* sem console: nada a fazer */ }
  }

  // ---- funções puras (expostas para os testes) --------------------------------------------

  // Tipo da mensagem lido só da cabeça do texto, sem parse. O servidor manda o t primeiro;
  // se não mandar, cai na busca na cabeça; se nem assim, '?' (o relatório mostra quantos).
  const RE_T_INICIO = /^\s*\{\s*"t"\s*:\s*"([^"\\]{1,48})"/;
  const RE_T_CABECA = /"t"\s*:\s*"([^"\\]{1,48})"/;
  function tipoRapido(texto) {
    if (typeof texto !== 'string') return null;
    const cab = texto.length > CABECA ? texto.slice(0, CABECA) : texto;
    const m = RE_T_INICIO.exec(cab) || RE_T_CABECA.exec(cab);
    return m ? m[1] : '?';
  }

  // O servidor manda as respostas do mercado (entrou no sorteio, perdeu o sorteio, retenção,
  // trava de anúncio) como evento de batalha { k: 'aviso', msg: 'market.…', params } (app.js
  // 24918, "os minutos que faltam na trava do mercado"), e não como erro.
  const ehAvisoDeMercado = (ev) => Boolean(ev && ev.k === 'aviso' && typeof ev.msg === 'string' && ev.msg.startsWith('market.'));
  // A janela do sorteio (v1.300): `entrou` e `fim` dizem o que houve com o pedido, pelo id do
  // anúncio. A fase `lista` (os nicks de quem disputa e de quem levou) só vai quando o anúncio é de
  // uma compra do radar (0.8.0), para o cartão mostrar a disputa como a janela do jogo mostra.
  const doRadar = (ev, opcoes) => Boolean(opcoes && opcoes.idsDoRadar && opcoes.idsDoRadar.has(Number(ev.id)));
  const ehSorteioDeMercado = (ev, opcoes) => Boolean(ev && ev.k === 'mktSorteio' && (ev.fase === 'entrou' || ev.fase === 'fim' || (ev.fase === 'lista' && doRadar(ev, opcoes))));

  const ehAvisoQualquer = (ev) => Boolean(ev && ev.k === 'aviso' && typeof ev.msg === 'string');

  // qualquerAviso: perto de uma compra (o rastro), o aviso que não é do mercado também passa.
  function ehEventoDeMercado(ev, opcoes = {}) {
    if (!ev || typeof ev.k !== 'string') return false;
    return ev.k.startsWith('market') || EVENTOS_FORA_DO_PREFIXO.has(ev.k) || ehAvisoDeMercado(ev) || ehSorteioDeMercado(ev, opcoes) || (Boolean(opcoes && opcoes.qualquerAviso) && ehAvisoQualquer(ev));
  }

  // Do aviso só vão a chave e os números da frase; do sorteio, o id, a fase e o resultado.
  const nomeCurto = (n) => (typeof n === 'string' && n ? n.slice(0, 24) : null);
  function copiaDoEvento(ev, opcoes) {
    if (ehSorteioDeMercado(ev, opcoes)) {
      const c = { k: 'mktSorteio', fase: ev.fase, id: Number(ev.id) || null, ok: ev.ok === true, perdeu: ev.perdeu === true, msg: typeof ev.msg === 'string' ? ev.msg.slice(0, 80) : null, descricao: typeof ev.descricao === 'string' ? ev.descricao.slice(0, 80) : null };
      if (doRadar(ev, opcoes)) {
        c.quem = (Array.isArray(ev.quem) ? ev.quem : []).map(nomeCurto).filter(Boolean).slice(0, 40);
        c.levaram = (Array.isArray(ev.levaram) ? ev.levaram : []).filter((x) => x && nomeCurto(x.nick)).slice(0, 40).map((x) => ({ nick: nomeCurto(x.nick), sobra: Number(x.sobra) || 0 }));
        c.total = Number.isFinite(Number(ev.total)) ? Number(ev.total) : null;
        for (const k of ['liberouEm', 'fechaEm', 'sorteioAte']) c[k] = typeof ev[k] === 'number' ? ev[k] : null;
      }
      return c;
    }
    if (!ehAvisoQualquer(ev)) return ev;
    const params = {};
    for (const [k, v] of Object.entries(ev.params && typeof ev.params === 'object' ? ev.params : {})) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
    return { k: 'aviso', msg: ev.msg.slice(0, ehAvisoDeMercado(ev) ? 80 : 120), params };
  }

  function filtrarEventos(m, opcoes) {
    const lista = m && Array.isArray(m.ev) ? m.ev : [];
    return lista.filter((ev) => ehEventoDeMercado(ev, opcoes)).map((ev) => copiaDoEvento(ev, opcoes));
  }

  // Procura objetos anuncioChat sem saber o formato exato da mensagem de chat. Copia só o
  // objeto do anúncio: texto, nick e o resto da conversa ficam de fora.
  function extrairAnuncios(valor, achados = [], prof = 0) {
    if (!valor || typeof valor !== 'object' || prof > 6 || achados.length >= 50) return achados;
    if (Array.isArray(valor)) {
      for (const v of valor) extrairAnuncios(v, achados, prof + 1);
      return achados;
    }
    for (const chave of Object.keys(valor)) {
      const v = valor[chave];
      if (chave === 'anuncioChat' && v && typeof v === 'object') achados.push(v);
      else if (v && typeof v === 'object') extrairAnuncios(v, achados, prof + 1);
    }
    return achados;
  }

  // Rastro: só o tipo e, conforme o tipo, a chave e a mensagem do erro, a aba do mercado e os
  // eventos de mercado da batalha. Nada de conteúdo, nick ou chat.
  function resumoParaRastro(texto, { avisoLivre = false } = {}) {
    const t = tipoRapido(texto);
    const r = { t };
    if (t === 'erro') {
      const c = RE_CHAVE.exec(texto);
      const m = RE_MSG.exec(texto);
      if (c) r.chave = c[1];
      else if (m) r.msg = m[1];
    } else if (t === 'market') {
      const a = RE_ABA.exec(texto.slice(0, 200));
      if (a) r.aba = a[1];
    } else if (t === 'batalha' && (texto.includes('"k":"market') || texto.includes('"k":"aviso"') || texto.includes('"k":"mktSorteio"'))) {
      const ks = [...texto.matchAll(RE_K_MERCADO)].map((x) => x[1]);
      for (const x of texto.matchAll(RE_AVISO_MERCADO)) ks.push(`aviso ${x[1]}`);
      if (avisoLivre) for (const x of texto.matchAll(RE_AVISO_QUALQUER)) if (!x[1].startsWith('market.')) ks.push(`aviso: ${x[1].slice(0, 60)}`);
      if (texto.includes('"k":"mktSorteio"')) ks.push('mktSorteio');
      if (ks.length) r.ks = ks.slice(0, 5);
    }
    return r;
  }

  // Do welcome só interessa a parte do mercado. Estado do jogador, nick e o resto ficam aqui.
  function fatiaWelcome(m) {
    const estado = m && m.estado;
    return {
      mercado: m && m.mercado !== undefined ? m.mercado : null,
      economia: m && m.economia !== undefined ? m.economia : null,
      itensNossos: m && m.itensNossos !== undefined ? m.itensNossos : null,
      servidorAgora: estado && typeof estado.servidorAgora === 'number' ? estado.servidorAgora : null,
    };
  }

  const RE_RELOGIO = /"servidorAgora"\s*:\s*(\d{10,})/;
  function lerRelogio(texto) {
    const m = RE_RELOGIO.exec(texto);
    return m ? Number(m[1]) : null;
  }

  // Do welcome e dos pacotes de estado, para o radar: só o meu id, o meu ouro e o inventário de
  // itens (itemId -> quantidade, para a aba Revenda). O delta do estado manda o mapa inteiro de
  // itens quando ele muda.
  function lerConta(estado) {
    if (!estado || typeof estado !== 'object') return null;
    const conta = {};
    if (typeof estado.id === 'number' || typeof estado.id === 'string') conta.id = estado.id;
    if (typeof estado.gold === 'number' && Number.isFinite(estado.gold)) conta.gold = estado.gold;
    if (estado.items && typeof estado.items === 'object' && !Array.isArray(estado.items)) {
      const itens = {};
      let n = 0;
      for (const [id, q] of Object.entries(estado.items)) {
        if (n >= 2000) break;
        if (/^\d{1,9}$/.test(id) && Number.isInteger(q) && q >= 0) { itens[id] = q; n++; }
      }
      conta.itens = itens;
    }
    return Object.keys(conta).length ? conta : null;
  }

  const mesmosItens = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

  // ---- os seus pokémon (0.7.0, Revenda de pokémon) ------------------------------------------
  //
  // O estado do jogo traz a coleção inteira no quadro cheio (welcome, reconexão) e, depois, só os
  // pokémon que mudaram (pkMud) e os que saíram (pkFora), como em `shared/estado-delta.mjs`. O
  // gancho remonta a lista e passa ao radar só o que a revenda usa: sem apelido e sem quem capturou.
  const STATS_IV = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const numeroOuNulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  function fichaPropria(k) {
    if (!k || typeof k !== 'object' || !Number.isInteger(k.id)) return null;
    const ivs = {};
    for (const s of STATS_IV) ivs[s] = numeroOuNulo(k.ivs && k.ivs[s]);
    const refino = {};
    for (const s of STATS_IV.slice(0, 5)) refino[s] = numeroOuNulo(k.refino && k.refino[s]) || 0;
    return {
      id: k.id,
      speciesId: numeroOuNulo(k.speciesId),
      nome: typeof k.nome === 'string' ? k.nome.slice(0, 40) : null,
      level: numeroOuNulo(k.level),
      potencia: numeroOuNulo(k.potencia),
      quality: numeroOuNulo(k.quality),
      ivTotal: numeroOuNulo(k.ivTotal),
      ivs: STATS_IV.every((s) => ivs[s] !== null) ? ivs : null,
      refino,
      shiny: Boolean(k.shiny),
      tmAoe: Boolean(k.tmAoe),
      tmElemental: typeof k.tmElemental === 'string' ? k.tmElemental.slice(0, 20) : null,
      starter: Boolean(k.starter),
      skin: Boolean(k.skin),
      heldItemId: numeroOuNulo(k.heldItemId),
    };
  }

  // Aplica um estado (cheio ou delta) à coleção guardada. Devolve true se mudou algo.
  function aplicarPokemons(estado, cheio) {
    if (!estado || typeof estado !== 'object') return false;
    const m = st.meus;
    let mudou = false;
    if (cheio || Array.isArray(estado.pokemons)) {
      m.mapa = new Map();
      for (const k of Array.isArray(estado.pokemons) ? estado.pokemons : []) {
        const f = fichaPropria(k);
        if (f && m.mapa.size < 5000) m.mapa.set(f.id, f);
      }
      m.recebeu = true;
      mudou = true;
    }
    for (const k of Array.isArray(estado.pkMud) ? estado.pkMud : []) {
      const f = fichaPropria(k);
      if (f) { m.mapa.set(f.id, f); mudou = true; }
    }
    for (const id of Array.isArray(estado.pkFora) ? estado.pkFora : []) if (m.mapa.delete(id)) mudou = true;
    if (estado.activeId !== undefined && estado.activeId !== m.activeId) { m.activeId = estado.activeId; mudou = true; }
    return mudou;
  }

  // Manda ao radar a coleção (sem o ativo, que muda a cada golpe) quando algo que importa mudou,
  // no máximo a cada 10 s, numa tarefa à parte.
  function agendarPokemons() {
    const m = st.meus;
    if (!m.recebeu || m.timer) return;
    const espera = Math.max(0, m.ultimaEmissao + INTERVALO_POKEMONS_MS - agora());
    m.timer = agendar(() => {
      m.timer = null;
      const lista = [...m.mapa.values()].filter((k) => k.id !== m.activeId);
      const assinatura = `${m.activeId}|${lista.map((k) => `${k.id}:${k.level}:${k.skin ? 1 : 0}:${k.heldItemId}:${k.potencia}`).join(',')}`;
      if (assinatura === m.assinatura) return;
      m.assinatura = assinatura;
      m.ultimaEmissao = agora();
      emitir({ tipo: 'pokemons', em: agora(), activeId: m.activeId, lista });
    }, espera);
  }

  // Lista fechada do que o radar pode mandar, já no formato que o jogo usa (Fase 0). Qualquer
  // outro campo é descartado.
  function validarPedido(p) {
    const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    if (!p || typeof p !== 'object') return { erro: 'pedido inválido' };
    switch (p.t) {
      case 'market.itens':
        return { pedido: { t: 'market.itens' } };
      case 'market.item':
        if (!inteiro(p.itemId, 1, 1e9) || p.moeda !== 'gold') return { erro: 'market.item inválido' };
        return { pedido: { t: 'market.item', itemId: p.itemId, moeda: 'gold' } };
      case 'market.comprar':
        if (!inteiro(p.id, 1, Number.MAX_SAFE_INTEGER) || !inteiro(p.qtd, 1, 1e6) || !inteiro(p.preco, 1, 1e13) || p.moeda !== 'gold') {
          return { erro: 'market.comprar inválido' };
        }
        // sorteioUi: 1, como o jogo manda desde a v1.300: a disputa vem pelo mktSorteio (0.8.0).
        return { pedido: { t: 'market.comprar', id: p.id, qtd: p.qtd, preco: p.preco, moeda: 'gold', sorteioUi: 1 } };
      // Leituras do painel (abas Compras e Vendas), no formato visto na gravação.
      case 'market.historico':
      case 'market.historicoCompras':
        if (!inteiro(p.pagina, 0, 1000) || !inteiro(p.seq, 1, 1e9)) return { erro: `${p.t} inválido` };
        return { pedido: { t: p.t, pagina: p.pagina, seq: p.seq } };
      case 'market.meus':
        return { pedido: { t: 'market.meus' } };
      // Revenda (Fase 3): anunciar um item em ouro, no formato exato do jogo (app.js 39844), e
      // mudar o preço de um anúncio (app.js 40948). Só com o clique do Allan no cartão.
      case 'market.criar':
        // Pokémon (0.7.0): um só, com os dias da diária, no formato do jogo (o itemId não vai).
        if (p.tipo === 'pokemon') {
          if (!inteiro(p.pokemonId, 1, Number.MAX_SAFE_INTEGER) || p.qtd !== 1 || !['gold', 'orb'].includes(p.moeda) || !inteiro(p.preco, p.moeda === 'gold' ? 2 : 1, 1e13) || !inteiro(p.dias, 1, 30)) {
            return { erro: 'market.criar inválido' };
          }
          return { pedido: { t: 'market.criar', tipo: 'pokemon', pokemonId: p.pokemonId, caixaId: null, casaId: null, bicicletaId: null, qtd: 1, preco: p.preco, moeda: p.moeda, dias: p.dias } };
        }
        if (p.tipo !== 'item' || !inteiro(p.itemId, 1, 1e9) || !inteiro(p.qtd, 1, 1e6) || !inteiro(p.preco, 2, 1e13) || p.moeda !== 'gold') {
          return { erro: 'market.criar inválido' };
        }
        return { pedido: { t: 'market.criar', tipo: 'item', itemId: p.itemId, caixaId: null, casaId: null, bicicletaId: null, qtd: p.qtd, preco: p.preco, moeda: 'gold', dias: null } };
      case 'market.editar':
        // Em Gemas, só o pokémon shiny (que só se anuncia em Gemas).
        if (!inteiro(p.id, 1, Number.MAX_SAFE_INTEGER) || !['gold', 'orb'].includes(p.moeda) || !inteiro(p.preco, p.moeda === 'gold' ? 2 : 1, 1e13)) return { erro: 'market.editar inválido' };
        return { pedido: { t: 'market.editar', id: p.id, preco: p.preco, moeda: p.moeda } };
      // Pokémon (Fase 4): a lista de anúncios (ouro, ou Gemas só para análise), de todas as
      // espécies ou de uma, com os filtros zerados como o jogo manda (gravação de 2026-10-17,
      // v1.300.2). Comprar continua só em ouro (market.comprar, acima).
      case 'market.listar':
        if (p.tipo !== 'pokemon' || !['gold', 'orb'].includes(p.moeda) || !['recentes', 'baratos'].includes(p.ordem) || !inteiro(p.especieId, 0, 1e7) || !inteiro(p.pagina, 0, 100)) {
          return { erro: 'market.listar inválido' };
        }
        return {
          pedido: {
            t: 'market.listar', tipo: 'pokemon', moeda: p.moeda, busca: '', ordem: p.ordem, criterios: [], elementos: [], categoria: '',
            soShiny: false, soP5: false, soMega: false, soLendario: false, soTmElemental: false, soTmAoe: false, semOutland: false,
            nivelMin: '', nivelMax: '', notaMin: '', notaMax: '', ivMin: '', ivMax: '', potenciaMin: '', potenciaMax: '', qualidadeMin: '', qualidadeMax: '',
            pagina: p.pagina, especieId: p.especieId,
          },
        };
      // As vendas de 30 dias de uma espécie (a Tabela de preços do jogo).
      case 'market.historicoGlobal':
        if (!inteiro(p.pagina, 0, 10) || !inteiro(p.seq, 1, 1e9) || p.tipo !== 'pokemon' || !['gold', 'orb'].includes(p.moeda) || typeof p.busca !== 'string' || !/^[\p{L}\p{N} .'-]{1,40}$/u.test(p.busca)) {
          return { erro: 'market.historicoGlobal inválido' };
        }
        return { pedido: { t: 'market.historicoGlobal', pagina: p.pagina, seq: p.seq, tipo: 'pokemon', moeda: p.moeda, busca: p.busca } };
      default:
        return { erro: `tipo não permitido: ${String(p.t)}` };
    }
  }

  function descreverUrl(url) {
    try {
      const u = new URL(String(url), raiz.location.href);
      return { mesmoHost: u.host === raiz.location.host, endereco: `${u.protocol}//${u.host}${u.pathname}` };
    } catch {
      return { mesmoHost: false, endereco: null };
    }
  }

  // ---- estado ----------------------------------------------------------------------------

  const st = {
    gravando: false,
    radar: false,
    comprados: new Set(), // ids de anúncio com market.comprar já enviado nesta página
    rastroAte: 0, // até quando anotar o rastro da última compra
    avisoLivreAte: 0, // até quando o aviso em texto solto passa (a resposta da compra)
    rastro: [],
    rastroAgendado: false,
    ultimaConta: null,
    ponteOk: false,
    pendentes: [],
    descartadas: 0,
    proximoId: 1,
    atual: null, // socket mais recente do jogo (a Fase 1 envia por ele)
    sockets: new Map(), // ws -> { id, abertoEm }
    repassadores: new WeakMap(), // ws -> função instalada como send próprio
    ultimoWelcome: null,
    ultimoRelogio: 0,
    ultimoPulso: 0,
    meus: { mapa: new Map(), activeId: null, recebeu: false, assinatura: '', ultimaEmissao: 0, timer: null },
    contagem: { in: Object.create(null), out: Object.create(null) },
    contagemMudou: false,
    ultimaContagem: 0,
  };

  // ==== PILOTO: o hook único ====================================================================
  //
  // O /hunt tinha um gancho próprio no WebSocket. Agora é este, o único: ele publica o estado
  // remontado no barramento `__pokeidleHunt` (PIH.on/emit), que o /hunt, a rotina e o cofre assinam,
  // e TODO comando que sai, do radar ou do piloto, passa pelo mesmo limitador de taxa da conta.
  //
  // Regras que valem para todo mundo:
  // - Lista fechada: o piloto só manda o que está em PIH_PERMITIDOS, no formato do jogo; o radar,
  //   o que está em validarPedido. Nada mais sai.
  // - BLOQUEADOS nunca saem, de módulo nenhum: dinheiro de verdade (Gemas, diamantes) e transferências.
  // - Todo comando do piloto passa antes pelo cofre (PIH.cofre.autorizar): piloto desligado,
  //   módulo desligado pelo disjuntor, piso de ouro e teto do dia.
  // - Abaixo do gateway: leituras a 2/s (rajada de 10; ele aceita 3/s e 20), escritas a 1/s (rajada de 3).
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  PIH.hookInstalado = true;

  const BLOQUEADOS = Object.freeze(new Set([
    'orbs.sacar', 'orbs.painel', 'loja.comprar', 'passe.comprarVip', 'guild.doar', 'amigo.coins',
    'market.anunciarChat', 'market.diamantes.cota', 'afiliado.recolher', 'convite.resgatar',
    'chat.send', 'chat.comando', 'amigo.dm.enviar', 'comercio.enviar', 'pokemon.megaRetroceder',
    'pokemon.reduzirNivel', 'nametag.usar', 'guild.apagar', 'guild.sair', 'guild.transferirLider',
  ]));
  PIH.BLOQUEADOS = BLOQUEADOS;

  const pihOuvintes = new Map();
  const pihUltimo = new Map();
  const PIH_RETIDOS = new Set(['welcome', 'estado']);
  PIH.on = (tipo, fn) => {
    if (!pihOuvintes.has(tipo)) pihOuvintes.set(tipo, new Set());
    pihOuvintes.get(tipo).add(fn);
    if (pihUltimo.has(tipo)) { try { fn(pihUltimo.get(tipo)); } catch (e) { erro(e); } }
    return () => pihOuvintes.get(tipo) && pihOuvintes.get(tipo).delete(fn);
  };
  function emitirInterno(tipo, dado) {
    if (PIH_RETIDOS.has(tipo)) pihUltimo.set(tipo, dado);
    for (const fn of pihOuvintes.get(tipo) || []) { try { fn(dado); } catch (e) { erro(e); } }
  }
  // O que vem do SERVIDOR (estado, welcome, campo, erro) só o hook publica: a página não pode
  // fingir um saldo maior para o cofre aprovar (auditoria de 2026-10-19, caso C2).
  const TIPOS_DO_SERVIDOR = new Set(['welcome', 'estado', 'campo.init', 'campo', 'erro', 'pvp', 'perfil', 'piloto.enviado', 'campeonato', 'showdown']);
  PIH.emit = (tipo, dado) => { if (!TIPOS_DO_SERVIDOR.has(tipo)) emitirInterno(tipo, dado); };

  // O cofre se registra UMA vez (o primeiro script da extensão, em document_start, antes de
  // qualquer script da página) e o hook guarda a referência: trocar __pokeidleHunt.cofre depois
  // não muda nada (caso C1).
  let cofreRef = null;
  PIH.registrarCofre = (c) => {
    if (cofreRef || !c) return false;
    cofreRef = Object.freeze(c);
    Object.defineProperty(PIH, 'cofre', { value: cofreRef, writable: false, configurable: false, enumerable: true });
    return true;
  };
  // Itens que o radar comprou para revender: a rotina não gasta (pedra comprada não vira evolução).
  const CHAVE_RESERVA_ITENS = 'piloto:itensDoRadar:v1';
  const reservaItens = (() => { try { return JSON.parse(raiz.localStorage.getItem(CHAVE_RESERVA_ITENS)) || {}; } catch { return {}; } })();
  PIH.itensReservados = (itemId, temAgora) => {
    const r = Math.min(Number(reservaItens[itemId]) || 0, Math.max(0, Number(temAgora) || 0));
    if (r !== (Number(reservaItens[itemId]) || 0)) { reservaItens[itemId] = r; try { raiz.localStorage.setItem(CHAVE_RESERVA_ITENS, JSON.stringify(reservaItens)); } catch { /* nada */ } }
    return r;
  };

  // O estado chega cheio no welcome e depois em delta: a remontagem é a do próprio jogo.
  let mesclarEstado = null;
  const filaEstado = [];
  import(`${raiz.location.origin}/shared/estado-delta.mjs`)
    .then((m) => {
      mesclarEstado = m.criarMescladorDeEstado();
      for (const parcial of filaEstado.splice(0)) entregarEstado(parcial);
    })
    .catch((e) => erro(e));
  function entregarEstado(parcial) {
    if (!mesclarEstado) { if (filaEstado.length < 500) filaEstado.push(parcial); return; }
    const eu = mesclarEstado(parcial);
    if (eu) emitirInterno('estado', eu);
  }

  // Erro logo depois de um comando do piloto: conta para o disjuntor do módulo que mandou.
  const enviosPih = []; // { origem, pedido, reserva, em, timer } dos últimos 3 s
  let ultimoEnvioRadarEm = 0;
  const raizDe = (t) => String(t || '').split('.')[0];
  function registroDoErro(chave) {
    const n = agora();
    for (let i = enviosPih.length - 1; i >= 0; i--) if (n - enviosPih[i].em >= 3000) enviosPih.splice(i, 1);
    if (!enviosPih.length) return null;
    const raiz = typeof chave === 'string' && chave.includes('.') ? raizDe(chave) : null;
    if (raiz) {
      for (let i = enviosPih.length - 1; i >= 0; i--) if (raizDe(enviosPih[i].pedido.t) === raiz) return enviosPih[i];
    }
    const ultimo = enviosPih[enviosPih.length - 1];
    if (raiz && ['market', 'ranking', 'guild', 'orbs', 'ginasio'].includes(raiz)) return null; // é do radar ou do jogo
    if (n - ultimo.em > 1500 || ultimoEnvioRadarEm > ultimo.em - 200) return null;
    return ultimo;
  }
  // 1.14: os corpos no chão (x:1, xr = ms que ainda restam) — só eles aceitam bola. O servidor tira
  // o corpo do mapa no mesmo tick do arremesso, acerte ou não: uma bola por corpo.
  const corposPih = new Map();
  let ultimoArremessoPih = 0;
  function anotarCorpos(tipo, m) {
    if (tipo === 'campo.init') corposPih.clear();
    const n = agora();
    for (const x of (m && m.mobs) || []) {
      if (!x || !Number.isInteger(x.s)) continue;
      if (x.x && Number(x.xr) > 0) corposPih.set(x.s, n + Number(x.xr));
      else if (x.x === 0 || x.x === false) corposPih.delete(x.s);
    }
    for (const sl of (m && m.fora) || []) corposPih.delete(sl);
    for (const [sl, ate] of corposPih) if (ate <= n) corposPih.delete(sl);
  }
  function pihReceber(texto) {
    const cab = texto.slice(0, 40);
    let tipo = null;
    if (cab.includes('"t":"welcome"')) tipo = 'welcome';
    else if (cab.includes('"t":"estado"')) tipo = 'estado';
    else if (cab.includes('"t":"campo.init"')) tipo = 'campo.init';
    else if (cab.includes('"t":"campo"')) tipo = 'campo';
    else if (cab.includes('"t":"erro"')) tipo = 'erro';
    else if (cab.includes('"t":"pvp"')) tipo = 'pvp';
    else if (cab.includes('"t":"perfil"')) tipo = 'perfil'; // 1.23: o perfil público (ranking.perfil), para a aba Meta
    else if (cab.includes('"t":"campeonato"')) tipo = 'campeonato'; // 1.32: torneios (Mundial e Amador)
    else if (cab.includes('"t":"showdown"')) tipo = 'showdown'; // 1.32: o Showdown semanal
    if (!tipo) return;
    let m;
    try { m = JSON.parse(texto); } catch { return; }
    if (tipo === 'welcome') {
      emitirInterno('welcome', m);
      if (m.estado) entregarEstado({ ...m.estado, cheio: true });
    } else if (tipo === 'estado') {
      if (m.estado) entregarEstado(m.estado);
    } else {
      if (tipo === 'erro') {
        // 1.12.3: a recusa só conta para o comando do piloto que ela é. Pelo prefixo da chave
        // ("shop.foraCentro" → shop.buy); sem prefixo que bata, só o último comando do piloto, e
        // só se o radar não mandou nada no mesmo intervalo. O ouro reservado dele volta ao cofre.
        const o = registroDoErro(m && m.chave);
        if (o) {
          enviosPih.splice(enviosPih.indexOf(o), 1);
          clearTimeout(o.timer);
          try {
            if (cofreRef) {
              cofreRef.registrarErro(o.origem, m && (m.chave || m.msg), o.pedido);
              if (o.reserva) cofreRef.estornar(o.reserva);
            }
          } catch (e) { erro(e); }
        }
      }
      if (tipo === 'campo' || tipo === 'campo.init') anotarCorpos(tipo, m);
      emitirInterno(tipo, m);
    }
  }

  // ---- limitador de taxa (um só, para radar e piloto) ----------------------------------------
  const RE_LEITURA = /^(market\.(itens|item|listar|historico|historicoCompras|historicoGlobal|meus|cotarLote|favoritos|especies)|ranking\.|guild\.info|pvp\.info|ginasio\.info|orbs\.painel)/;
  const BALDES = {
    leitura: { taxa: 2, rajada: 1, fichas: 1, em: agora() }, // 1.12.3: sem rajada (era 10): no máximo 3 leituras em qualquer 1 s, o limite do servidor (que o jogo também usa)
    escrita: { taxa: 1, rajada: 3, fichas: 3, em: agora() },
  };
  const baldeDe = (t) => (RE_LEITURA.test(t) ? BALDES.leitura : BALDES.escrita);
  function encher(b) {
    const n = agora();
    b.fichas = Math.min(b.rajada, b.fichas + ((n - b.em) / 1000) * b.taxa);
    b.em = n;
  }
  // O radar não espera na fila (a compra tem hora marcada no sorteio): ele gasta a ficha e o
  // saldo pode ficar negativo, o que segura o piloto até a conta voltar ao normal.
  function gastarFicha(t) { const b = baldeDe(t); encher(b); b.fichas = Math.max(-3, b.fichas - 1); }
  function temFicha(t) { const b = baldeDe(t); encher(b); return b.fichas >= 1; }

  // ---- lista fechada do piloto ---------------------------------------------------------------
  const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const ID = Number.MAX_SAFE_INTEGER;
  const PIH_PERMITIDOS = {
    'hunt.select': (p) => (typeof p.slug === 'string' && /^[\w.-]{1,80}$/.test(p.slug) ? { t: 'hunt.select', slug: p.slug } : null),
    'centro.ir': () => ({ t: 'centro.ir' }),
    'centro.curar': () => ({ t: 'centro.curar' }),
    'shop.buy': (p) => (['ball', 'item'].includes(p.kind) && int(p.id, 1, 1e9) && int(p.qty, 1, 9999) ? { t: 'shop.buy', kind: p.kind, id: p.id, qty: p.qty } : null),
    'passe.resgatar': () => ({ t: 'passe.resgatar' }),
    'xpshare.escolher': (p) => (int(p.casaId, 1, ID) && int(p.slot, 0, 9) && (p.pokemonId === null || int(p.pokemonId, 1, ID)) ? { t: 'xpshare.escolher', casaId: p.casaId, slot: p.slot, pokemonId: p.pokemonId } : null),
    'outland.tier': (p) => (int(p.tier, 1, 8) ? { t: 'outland.tier', tier: p.tier } : null),
    'team.active': (p) => (int(p.pokemonId, 1, ID) ? { t: 'team.active', pokemonId: p.pokemonId } : null),
    'pokemon.evoluir': (p) => (int(p.pokemonId, 1, ID) && int(p.alvoId, 1, 1e7) ? { t: 'pokemon.evoluir', pokemonId: p.pokemonId, alvoId: p.alvoId } : null),
    'chocadeira.colocar': (p) => {
      const ID_OVO = { p2: 70091, p3: 70092, p4: 70093, shiny: 70094 };
      const itens = (pihUltimo.get('estado') || {}).items || {};
      if (!int(p.slot, 0, 5) || !Object.hasOwn(ID_OVO, p.ovo) || !(Number(itens[ID_OVO[p.ovo]]) > 0)) return null;
      return { t: 'chocadeira.colocar', slot: p.slot, ovo: p.ovo };
    },
    'oferenda.tudo': () => ({ t: 'oferenda.tudo' }),
    // 1.18: as regras do Auto Coleção do jogo (o "Salvar" do painel Market → Vender). Só a forma que
    // o jogo aceita: seis linhas com liga/desliga, P2–P5, qualidade 1,1/1,3/1,5/1,6, IV 1–32, nota 0–10.
    'shop.autoColecao': (p) => {
      const r = p.regra;
      const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
      if (!obj(r)) return null;
      const out = {};
      for (const k of ['lendario', 'shiny', 'pot', 'qual', 'iv', 'nota']) {
        if (!obj(r[k]) || typeof r[k].on !== 'boolean') return null;
        out[k] = { on: r[k].on };
      }
      if (![2, 3, 4, 5].includes(r.pot.min)) return null;
      out.pot.min = r.pot.min;
      if (![1.1, 1.3, 1.5, 1.6].includes(r.qual.min)) return null;
      out.qual.min = r.qual.min;
      if (typeof r.nota.min !== 'number' || !(r.nota.min >= 0 && r.nota.min <= 10)) return null;
      out.nota.min = r.nota.min;
      if (!obj(r.iv.min)) return null;
      const ivMin = {};
      for (const [s, v] of Object.entries(r.iv.min)) { if (!/^(hp|atk|def|spAtk|spDef|speed)$/.test(s) || !int(v, 1, 32)) return null; ivMin[s] = v; }
      out.iv.min = ivMin;
      return { t: 'shop.autoColecao', regra: out };
    },
    // 1.14: bola num corpo caído — a mesma mensagem do clique na lista "Proximidade para Capturar".
    // Só bola paga em OURO (Beast Ball é de diamante: nunca), que você tem, num corpo que ainda está
    // no chão, e nunca mais rápido que o lançamento automático do VIP (1 a cada 1,2 s).
    'ball.throw': (p) => {
      const cat = ((pihUltimo.get('welcome') || {}).catalogoBolas) || [];
      const bola = Array.isArray(cat) ? cat.find((b) => b && b.id === p.ballId) : null;
      const bolas = (pihUltimo.get('estado') || {}).balls || {};
      if (!int(p.ballId, 1, 1e6) || !int(p.slot, 0, ID) || !bola || !(Number(bola.priceGold) > 0) || !(Number(bolas[p.ballId]) > 0)) return null;
      const ate = corposPih.get(p.slot);
      const n = agora();
      if (!ate || ate - n < 400 || n - ultimoArremessoPih < 1200) return null;
      ultimoArremessoPih = n;
      corposPih.delete(p.slot);
      return { t: 'ball.throw', ballId: p.ballId, slot: p.slot };
    },
    'shop.sellAllPokemons': (p) => (int(p.ateId, 1, ID) ? { t: 'shop.sellAllPokemons', ateId: p.ateId } : null),
    // 1.12.4: guardar um pokémon SEU na Coleção (protege da venda do Depot). Só para dentro, nunca "depot".
    // 1.16: montar o time de campo (janela Time). Entrar: um pokémon SEU, numa vaga livre (0 a 4),
    // que o seu nível de treinador deixa usar (nível do pokémon ≤ treinador + 5, ou o inicial). Sair
    // (slot null): nunca o que está em campo lutando.
    'team.move': (p) => {
      const e = pihUltimo.get('estado') || {};
      const lista = e.pokemons || [];
      const pk = lista.find((x) => x && x.id === p.pokemonId);
      if (!int(p.pokemonId, 1, ID) || !pk) return null;
      if (p.slot === null) {
        if (pk.slot == null || pk.id === e.activeId) return null;
        return { t: 'team.move', pokemonId: p.pokemonId, slot: null };
      }
      if (!int(p.slot, 0, 4) || pk.slot != null || lista.some((x) => x && x.slot === p.slot)) return null;
      if (!pk.starter && (Number(pk.level) || 0) > (Number(e.level) || 0) + 5) return null;
      return { t: 'team.move', pokemonId: p.pokemonId, slot: p.slot };
    },
    'colecao.mover': (p) => {
      const meus = new Set(((pihUltimo.get('estado') || {}).pokemons || []).map((x) => x && x.id));
      return int(p.pokemonId, 1, ID) && meus.has(p.pokemonId) && p.para === 'colecao' ? { t: 'colecao.mover', pokemonId: p.pokemonId, para: 'colecao' } : null;
    },
    // PvP Ranqueado (1.2.1): ler, montar a equipe (1 a 5 pokémon seus, sem repetir) e entrar na fila.
    'pvp.info': () => ({ t: 'pvp.info' }),
    // 1.32 (pedido do André): torneios. Só ler a edição e se INSCREVER (de graça; nada de cancelar,
    // nem equipe): Mundial e Amador (campeonato.*) e o Showdown da semana (showdown.*).
    'campeonato.info': (p) => (typeof p.id === 'string' && /^[\w:.-]{1,40}$/.test(p.id) ? { t: 'campeonato.info', id: p.id } : null),
    'campeonato.inscrever': (p) => (typeof p.id === 'string' && /^[\w:.-]{1,40}$/.test(p.id) ? { t: 'campeonato.inscrever', id: p.id } : null),
    'showdown.info': (p) => (typeof p.id === 'string' && /^[\w:.-]{1,40}$/.test(p.id) ? { t: 'showdown.info', id: p.id } : null),
    'showdown.inscrever': (p) => (typeof p.id === 'string' && /^[\w:.-]{1,40}$/.test(p.id) ? { t: 'showdown.inscrever', id: p.id } : null),
    // 1.23: o perfil público de um jogador (o mesmo clique no nick do placar), só leitura.
    'ranking.perfil': (p) => (typeof p.nick === 'string' && /^[\p{L}\p{N}_.\-]{1,30}$/u.test(p.nick) ? { t: 'ranking.perfil', nick: p.nick } : null),
    'pvp.fila.entrar': () => ({ t: 'pvp.fila.entrar' }),
    'pvp.time.salvar': (p) => {
      const ids = Array.isArray(p.pokemonIds) ? p.pokemonIds : null;
      const meus = new Set(((pihUltimo.get('estado') || {}).pokemons || []).map((x) => x && x.id));
      if (!ids || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length || !ids.every((id) => int(id, 1, ID) && meus.has(id))) return null;
      return { t: 'pvp.time.salvar', pokemonIds: [...ids] };
    },
    // Automações do jogo. Dois pedidos, e só eles; o resto da automação sai do estado que o gancho
    // recebeu do servidor, nunca do pedido:
    // - Fila automática do PvP (VIP): SÓ liga o pvpAutoFila.
    // - 1.31 (pedido do André): os itens da reposição — exatamente UMA bola, UMA poção e UM revive:
    //   a bola do catálogo do jogo, comprável em ouro (Beast Ball e Master Ball nunca); a poção e o
    //   revive da lista fechada abaixo. Não liga nem desliga
    //   nenhuma automação: só troca qual item cada uma usa.
    'auto.set': (p) => {
      const e = pihUltimo.get('estado') || {};
      if (!e.automation || typeof e.automation !== 'object') return null;
      if (p.pvpAutoFila === true && p.ballIds === undefined && p.potionIds === undefined && p.reviveIds === undefined) {
        if (!(e.loja && e.loja.vip)) return null;
        return { ...e.automation, t: 'auto.set', pvpAutoFila: true };
      }
      if (p.pvpAutoFila !== undefined) return null;
      const um = (v) => (Array.isArray(v) && v.length === 1 && int(v[0], 1, 1e6) ? v[0] : null);
      const bola = um(p.ballIds);
      const pocao = um(p.potionIds);
      const revive = um(p.reviveIds);
      if (bola == null || pocao == null || revive == null) return null;
      const w = pihUltimo.get('welcome') || {};
      const b = (Array.isArray(w.catalogoBolas) ? w.catalogoBolas : []).find((x) => x && Number(x.id) === bola);
      if (!b || b.compravel === false || !(Number(b.priceGold) > 0) || /beast|master/i.test(String(b.nome || ''))) return null;
      // as poções e revives que o NPC vende (assets/items.json do jogo, 2026-10-27): Small, Great,
      // Ultra, Hyper e Ultimate Potion; Revive e Max Revive. A Medicine (sem preço) fica de fora.
      if (![200, 201, 202, 203, 204].includes(pocao) || ![205, 206].includes(revive)) return null;
      return { ...e.automation, t: 'auto.set', ballIds: [bola], potionIds: [pocao], reviveIds: [revive] };
    },
  };
  PIH.COMANDOS_DO_PILOTO = Object.freeze(Object.keys(PIH_PERMITIDOS));

  const filaPih = [];
  const reservasMercado = new Map(); // anuncioId -> reserva do cofre (compra automática do radar)
  let filaPihTimer = null;
  /**
   * O piloto pede um comando. Devolve { ok, motivo }: ok quer dizer "aceito na fila" — o comando
   * sai assim que houver ficha, e nunca a menos de 3 s de uma compra ou anúncio do radar.
   */
  PIH.pedir = (obj, origem = 'piloto') => {
    const t = obj && obj.t;
    if (!t || BLOQUEADOS.has(t)) return { ok: false, motivo: `bloqueado: ${t}` };
    // Só chave própria da lista (nada de "constructor" ou "__proto__" vindo do protótipo), e o
    // pedido validado é copiado e congelado: ninguém troca o `t` depois da conferência.
    const validar = typeof t === 'string' && Object.hasOwn(PIH_PERMITIDOS, t) ? PIH_PERMITIDOS[t] : null;
    let pedido = null;
    try { pedido = validar ? validar(obj) : null; } catch { pedido = null; }
    if (!pedido || pedido.t !== t || BLOQUEADOS.has(pedido.t)) return { ok: false, motivo: `fora da lista fechada: ${t}` };
    pedido = Object.freeze(JSON.parse(JSON.stringify(pedido)));
    if (!cofreRef) return { ok: false, motivo: 'cofre não carregou' };
    const r = cofreRef.autorizar(pedido, origem);
    if (!r.ok) return r;
    if (filaPih.length > 50) { cofreRef.estornar(r.reserva); return { ok: false, motivo: 'fila cheia' }; }
    filaPih.push({ pedido, origem, custo: r.custo, reserva: r.reserva, em: agora() });
    agendarFilaPih();
    return { ok: true, motivo: null };
  };
  // Compatível com o /hunt (que esperava true/false).
  PIH.enviar = (obj, origem = 'hunt') => PIH.pedir(obj, origem).ok;
  // 1.20: só leitura, para a Saúde conferir quais mensagens do jogo chegaram (uma cópia).
  PIH.contagemDoJogo = () => ({ in: { ...st.contagem.in }, out: { ...st.contagem.out }, conectado: !!st.atual, ultimaEntrada: st.ultimaEntrada || 0 });
  for (const k of ['on', 'emit', 'pedir', 'enviar', 'registrarCofre', 'itensReservados', 'BLOQUEADOS', 'COMANDOS_DO_PILOTO', 'hookInstalado', 'contagemDoJogo']) {
    Object.defineProperty(PIH, k, { value: PIH[k], writable: false, configurable: false, enumerable: true });
  }

  function agendarFilaPih() {
    if (filaPihTimer) return;
    filaPihTimer = agendar(processarFilaPih, 150);
  }
  function processarFilaPih() {
    filaPihTimer = null;
    if (!filaPih.length) return;
    const ws = st.atual;
    const proximo = filaPih[0];
    if (!ws || ws.readyState !== 1) {
      // Sem conexão por mais de 30 s: o pedido vence e o ouro reservado volta.
      if (agora() - proximo.em > 30000) { filaPih.shift(); cofreRef.estornar(proximo.reserva); }
      agendarFilaPih();
      return;
    }
    if (agora() < st.avisoLivreAte || !temFicha(proximo.pedido.t)) { agendarFilaPih(); return; }
    filaPih.shift();
    // Desligou o piloto (ou o disjuntor do módulo caiu) com o pedido na fila: não sai.
    if (!Object.hasOwn(PIH_PERMITIDOS, proximo.pedido.t) || BLOQUEADOS.has(proximo.pedido.t) || !cofreRef.liberado(proximo.origem)) {
      cofreRef.estornar(proximo.reserva);
      if (filaPih.length) agendarFilaPih();
      return;
    }
    const texto = JSON.stringify(proximo.pedido);
    try {
      Reflect.apply(sendNativo, ws, [texto]);
      gastarFicha(proximo.pedido.t);
      // 1.25: o perfil que o Piloto lê (aba Meta) não pode abrir a janela do perfil na tela do jogo
      if (proximo.pedido.t === 'ranking.perfil') perfisDoPiloto.set(String(proximo.pedido.nick).toLowerCase(), agora() + 60000);
      const registro = { origem: proximo.origem, pedido: proximo.pedido, reserva: proximo.reserva, em: agora(), timer: null };
      registro.timer = agendar(() => {
        const i = enviosPih.indexOf(registro);
        if (i >= 0) enviosPih.splice(i, 1);
        try { cofreRef.registrarSucesso(registro.origem); } catch (e) { erro(e); }
      }, 3000);
      enviosPih.push(registro);
      while (enviosPih.length > 20) clearTimeout(enviosPih.shift().timer);
      emitirInterno('piloto.enviado', { t: proximo.pedido.t, origem: proximo.origem, custo: proximo.custo, em: agora(), pokemonId: Number.isInteger(proximo.pedido.pokemonId) ? proximo.pedido.pokemonId : null });
      if (st.gravando) entrada('out', proximo.pedido.t, agora(), 0, proximo.pedido, { bytes: texto.length, piloto: true });
    } catch (e) {
      erro(e);
      cofreRef.estornar(proximo.reserva);
    }
    if (filaPih.length) agendarFilaPih();
  }

  // ---- saída para a ponte ------------------------------------------------------------------

  function emitir(obj) {
    if (!st.ponteOk) {
      if (st.pendentes.length < LIMITE_PENDENTES) st.pendentes.push(obj);
      else st.descartadas++;
      return;
    }
    try {
      doc.dispatchEvent(new CustomEventNativo(EVT_SAIDA, { detail: JSON.stringify(obj) }));
    } catch (e) {
      erro(e);
    }
  }

  function entrada(dir, t, quando, sid, dados, extra) {
    const obj = { tipo: 'entrada', dir, t, em: quando, sid, dados };
    if (dados && typeof dados === 'object' && typeof dados.aba === 'string') obj.aba = dados.aba;
    if (extra) Object.assign(obj, extra);
    emitir(obj);
  }

  function contar(dir, t) {
    const mapa = st.contagem[dir];
    mapa[t] = (mapa[t] || 0) + 1;
    st.contagemMudou = true;
  }

  function emitirContagem(forcar) {
    const t = agora();
    if (!forcar && (!st.contagemMudou || t - st.ultimaContagem < INTERVALO_CONTAGEM_MS)) return;
    st.ultimaContagem = t;
    st.contagemMudou = false;
    emitir({ tipo: 'contagem', em: t, contagem: st.contagem, descartadas: st.descartadas });
  }

  // ---- fila: o processamento fica para depois do handler do jogo -----------------------------

  const fila = [];
  let agendado = false;

  function enfileirar(dir, texto, quando, sid) {
    if (fila.length >= LIMITE_FILA) { st.descartadas++; return; }
    fila.push([dir, texto, quando, sid]);
    if (!agendado) {
      agendado = true;
      agendar(processar, 0);
    }
  }

  function processar() {
    agendado = false;
    const lote = fila.splice(0, fila.length);
    for (const item of lote) {
      try { tratar(item[0], item[1], item[2], item[3]); } catch (e) { erro(e); }
    }
    try { if (st.gravando) emitirContagem(false); } catch (e) { erro(e); }
  }

  function tratar(dir, texto, quando, sid) {
    const t = tipoRapido(texto);

    if (dir === 'out') {
      if (!st.gravando) return;
      contar('out', t);
      if (t.startsWith('market.')) entrada('out', t, quando, sid, JSON.parse(texto), { bytes: texto.length });
      return;
    }

    if (t === 'welcome') {
      // Guardado mesmo sem gravação nem radar: quem liga no meio da sessão ainda precisa do
      // catálogo, que só vem aqui.
      const m = JSON.parse(texto);
      st.ultimoWelcome = { em: quando, sid, dados: fatiaWelcome(m) };
      st.ultimaConta = lerConta(m.estado);
      if (aplicarPokemons(m.estado, true)) { st.meus.assinatura = ''; if (st.radar) agendarPokemons(); }
      if (st.gravando) contar('in', t);
      if (repassando()) entrada('in', 'welcome', quando, sid, st.ultimoWelcome.dados, { bytes: texto.length });
      if (st.radar && st.ultimaConta) emitir({ tipo: 'conta', em: quando, ...st.ultimaConta });
      return;
    }

    if (!repassando()) return;
    if (st.gravando) contar('in', t);

    if (t === 'market' || t === 'erro') {
      const dados = JSON.parse(texto);
      if (!st.gravando && t === 'market') semNicks(dados);
      entrada('in', t, quando, sid, dados, { bytes: texto.length });
    } else if (t === 'batalha') {
      if (texto.includes('"k":"market') || texto.includes('"k":"orbs') || texto.includes('"k":"diamantes') || texto.includes('"k":"aviso"') || texto.includes('"k":"mktSorteio"')) {
        const eventos = filtrarEventos(JSON.parse(texto), { qualquerAviso: quando <= st.avisoLivreAte, idsDoRadar: st.comprados });
        if (eventos.length) entrada('in', 'batalha', quando, sid, { ev: eventos }, { bytes: texto.length });
      }
    } else if (t === 'chat' || t.startsWith('chat.')) {
      if (texto.includes('anuncioChat')) {
        const anuncios = extrairAnuncios(JSON.parse(texto));
        if (anuncios.length) entrada('in', t, quando, sid, { anuncioChat: anuncios }, { bytes: texto.length });
      }
    } else if (t === 'estado') {
      if (quando - st.ultimoRelogio >= INTERVALO_RELOGIO_MS) {
        const servidorAgora = lerRelogio(texto);
        if (servidorAgora) {
          st.ultimoRelogio = quando;
          entrada('in', 'relogio', quando, sid, { servidorAgora });
        }
      }
      // Os seus pokémon: a coleção no quadro cheio, depois só os que mudaram ou saíram.
      const comPokemons = texto.includes('"pokemons"') || texto.includes('"pkMud"') || texto.includes('"pkFora"') || texto.includes('"activeId"');
      if (st.radar && comPokemons) {
        const est = JSON.parse(texto).estado;
        if (aplicarPokemons(est, Boolean(est && est.cheio))) agendarPokemons();
      }
      // O ouro e os itens vêm no delta só quando mudam; o id, no quadro cheio (reconexão).
      if (st.radar && (texto.includes('"gold"') || texto.includes('"cheio"') || texto.includes('"items"'))) {
        const conta = lerConta(JSON.parse(texto).estado);
        const antes = st.ultimaConta || {};
        if (conta && ((conta.gold !== undefined && conta.gold !== antes.gold) || (conta.id !== undefined && conta.id !== antes.id) || (conta.itens !== undefined && !mesmosItens(conta.itens, antes.itens)))) {
          st.ultimaConta = { ...(st.ultimaConta || {}), ...conta };
          emitir({ tipo: 'conta', em: quando, ...st.ultimaConta });
        }
      }
    }
  }

  // Fora do caminho da mensagem do jogo: só guarda e manda depois, numa tarefa à parte.
  function anotarRastro(texto) {
    if (st.rastro.length >= 400) return;
    st.rastro.push({ em: agora(), texto: texto.length > 4000 ? texto.slice(0, 4000) : texto });
    if (st.rastroAgendado) return;
    st.rastroAgendado = true;
    agendar(() => {
      st.rastroAgendado = false;
      const lote = st.rastro.splice(0, st.rastro.length);
      for (const x of lote) {
        try { emitir({ tipo: 'rastro', em: x.em, ...resumoParaRastro(x.texto, { avisoLivre: x.em <= st.avisoLivreAte }) }); } catch (e) { erro(e); }
      }
    }, 0);
  }

  // Na vitrine e na Tabela de preços (dados de todo mundo), o radar não precisa de nick nenhum:
  // nem de quem vende, de quem compra, de quem capturou, nem o apelido do pokémon.
  function semNicks(d) {
    if (!d || (d.aba !== 'vitrine' && d.aba !== 'historicoGlobal') || !Array.isArray(d.linhas)) return;
    for (const l of d.linhas) {
      if (!l || typeof l !== 'object') continue;
      delete l.vendedor;
      delete l.comprador;
      if (l.ficha && typeof l.ficha === 'object') { delete l.ficha.caughtBy; delete l.ficha.apelido; }
    }
  }

  function repassando() {
    return st.gravando || st.radar;
  }

  // ---- ouvintes no socket ------------------------------------------------------------------

  // 1.25: perfis pedidos pelo Piloto (nick -> até quando). A resposta vai só para o Piloto: o jogo
  // abriria a janela do perfil na tela do André a cada leitura da aba Meta.
  // 1.28.1 (o André viu a janela de perfil abrir de novo): o nick casa sem maiúsculas, a janela é de
  // 60 s (a fila de leituras pode segurar o pedido) e, se o nick não casar, um perfil que chega com
  // pedido do Piloto em aberto e SEM clique/tecla sua nos últimos 4 s também é do Piloto. Perfil que
  // você clica continua abrindo.
  const perfisDoPiloto = new Map();
  let cliqueEm = 0;
  try { for (const tipo of ['pointerdown', 'keydown']) raiz.addEventListener(tipo, () => { cliqueEm = agora(); }, { capture: true, passive: true }); } catch { /* sem janela */ }
  function ehPerfilDoPiloto(dado) {
    if (!perfisDoPiloto.size || dado.slice(0, 80).indexOf('"t":"perfil"') < 0) return false;
    for (const [n, t] of perfisDoPiloto) if (t < agora()) perfisDoPiloto.delete(n);
    if (!perfisDoPiloto.size) return false;
    const m = /"nick":"((?:[^"\\]|\\.){1,40})"/.exec(dado.slice(0, 600));
    let nick = m ? m[1] : '';
    try { nick = JSON.parse(`"${nick}"`); } catch { /* fica o bruto */ }
    nick = String(nick).toLowerCase();
    if (nick && perfisDoPiloto.has(nick)) { perfisDoPiloto.delete(nick); return true; }
    if (agora() - cliqueEm > 4000) { perfisDoPiloto.delete(perfisDoPiloto.keys().next().value); return true; }
    return false;
  }
  function aoReceber(ev) {
    try {
      const dado = ev.data;
      if (typeof dado !== 'string') return;
      // O piloto (/hunt, rotina, cofre) recebe o estado primeiro, como o gancho dele fazia.
      try { pihReceber(dado); } catch (e) { erro(e); }
      if (ehPerfilDoPiloto(dado)) { ev.stopImmediatePropagation(); return; }
      if (tipoRapido(dado) !== 'pong') st.ultimaEntrada = agora(); // 1.20.1: a Volta sabe se o jogo está vivo
      if (st.rastroAte && agora() < st.rastroAte) anotarRastro(dado);
      // Pulso: o jogo está recebendo mensagens. Vai só a hora, no máximo a cada 3 s, numa tarefa à
      // parte. O pong não conta: o gateway responde ping mesmo com o servidor do jogo parado.
      if (st.radar && agora() - st.ultimoPulso >= INTERVALO_PULSO_MS && tipoRapido(dado) !== 'pong') {
        const quando = agora();
        st.ultimoPulso = quando;
        agendar(() => emitir({ tipo: 'pulso', em: quando }), 0);
      }
      if (!st.gravando) {
        // Fora da gravação só entra na fila o welcome e, com o radar ligado, os tipos que ele
        // usa. A conferência é uma fatia de 64 caracteres; campo e o resto passam direto.
        const t = tipoRapido(dado);
        if (t !== 'welcome' && !(st.radar && (INTERESSE_RADAR.has(t) || t.startsWith('chat')))) return;
      }
      const info = st.sockets.get(ev.currentTarget || this);
      enfileirar('in', dado, agora(), info ? info.id : 0);
    } catch (e) {
      erro(e);
    }
  }

  function instalarRepassador(ws) {
    if (st.repassadores.has(ws)) return;
    // Se alguém já pôs um send próprio na instância, não mexemos: gravamos sem as saídas.
    if (Object.prototype.hasOwnProperty.call(ws, 'send')) return;
    const info = st.sockets.get(ws);
    const sid = info ? info.id : 0;
    const repassador = function send() {
      try {
        if (st.gravando && typeof arguments[0] === 'string') enfileirar('out', arguments[0], agora(), sid);
      } catch (e) {
        erro(e);
      }
      // O send que a instância usaria sem nós, procurado na hora (respeita quem mexer no
      // protótipo depois).
      const original = Reflect.get(Object.getPrototypeOf(this), 'send', this);
      return Reflect.apply(original, this, arguments);
    };
    Object.defineProperty(ws, 'send', { value: repassador, writable: true, configurable: true, enumerable: false });
    st.repassadores.set(ws, repassador);
  }

  function removerRepassador(ws) {
    const repassador = st.repassadores.get(ws);
    if (!repassador) return;
    st.repassadores.delete(ws);
    const d = Object.getOwnPropertyDescriptor(ws, 'send');
    if (d && d.value === repassador) delete ws.send;
  }

  function acompanhar(ws, url) {
    const alvo = descreverUrl(url);
    if (!alvo.mesmoHost) return;
    const info = { id: st.proximoId++, endereco: alvo.endereco, criadoEm: agora() };
    st.sockets.set(ws, info);
    st.atual = ws;
    ws.addEventListener('message', aoReceber);
    ws.addEventListener('open', () => {
      try { emitir({ tipo: 'socket', evento: 'aberto', sid: info.id, em: agora(), endereco: info.endereco }); } catch (e) { erro(e); }
    });
    ws.addEventListener('close', (ev) => {
      try {
        st.sockets.delete(ws);
        removerRepassador(ws);
        if (st.atual === ws) st.atual = null;
        emitir({ tipo: 'socket', evento: 'fechado', sid: info.id, em: agora(), codigo: ev.code, motivo: ev.reason, limpo: ev.wasClean });
      } catch (e) {
        erro(e);
      }
    });
    if (st.gravando) instalarRepassador(ws);
    emitir({ tipo: 'socket', evento: 'criado', sid: info.id, em: info.criadoEm, endereco: info.endereco });
  }

  // ---- comandos da ponte --------------------------------------------------------------------

  function ligarGravacao(ligado) {
    if (ligado === st.gravando) return;
    st.gravando = ligado;
    if (ligado) {
      // A contagem não zera: é cumulativa nesta aba, e a ponte soma as abas.
      st.ultimoRelogio = 0;
      for (const ws of st.sockets.keys()) instalarRepassador(ws);
      if (st.ultimoWelcome) {
        const w = st.ultimoWelcome;
        entrada('in', 'welcome', w.em, w.sid, w.dados, { retido: true });
      }
    } else {
      for (const ws of st.sockets.keys()) removerRepassador(ws);
      emitirContagem(true);
    }
  }

  function ligarRadar(ligado) {
    if (ligado === st.radar) return;
    st.radar = ligado;
    if (ligado) {
      st.ultimoRelogio = 0;
      // O radar ligado no meio da sessão recebe o catálogo e a conta do último welcome.
      if (st.ultimoWelcome) {
        const w = st.ultimoWelcome;
        entrada('in', 'welcome', w.em, w.sid, w.dados, { retido: true });
      }
      if (st.ultimaConta) emitir({ tipo: 'conta', em: agora(), ...st.ultimaConta });
      // E os seus pokémon do último quadro (0.7.0).
      if (st.meus.recebeu) {
        st.meus.assinatura = '';
        st.meus.ultimaEmissao = 0;
        agendarPokemons();
      }
    }
  }

  function responder(ref, ok, motivo) {
    emitir({ tipo: 'enviado', ref, ok, motivo: motivo || null, em: agora() });
  }

  // Pedido do radar. Sai pelo send nativo, direto no socket atual do jogo.
  function enviar(cmd, esperou = 0) {
    const ref = cmd.ref;
    // `auto`: a compra é do automático do radar (sem clique). Só ela passa pelo cofre: o clique
    // do jogador é decisão dele. O campo não vai para o servidor (validarPedido monta o pedido).
    const auto = Boolean(cmd.pedido && cmd.pedido.auto === true);
    const v = validarPedido(cmd.pedido);
    if (v.erro) return responder(ref, false, v.erro);
    const pedido = v.pedido;
    if (BLOQUEADOS.has(pedido.t)) return responder(ref, false, `bloqueado: ${pedido.t}`);
    const compra = pedido.t === 'market.comprar';
    if (compra && st.comprados.has(pedido.id)) return responder(ref, false, 'compra já enviada para esse anúncio');
    const ws = st.atual;
    if (!ws || ws.readyState !== 1) return responder(ref, false, 'socket do jogo fechado');
    // Leitura do radar espera ficha (até 2 s; a ponte espera 3 s). Só a compra não espera: ela tem
    // hora marcada no sorteio.
    // 1.12.3: passou de 2,6 s sem ficha, não sai "de graça": volta como limite de leituras (o radar
    // só espaça, não conta como falha). O tempo de espera é contado aqui dentro, não vem do pedido.
    if (!compra && !temFicha(pedido.t)) {
      if (esperou >= 2600) return responder(ref, false, 'limite de leituras');
      agendar(() => enviar(cmd, esperou + 200), 200);
      return;
    }
    // 1.21: o anúncio automático de pokémon paga a diária (ouro) — também passa pelo cofre.
    if (auto && pedido.t === 'market.criar' && pedido.tipo === 'pokemon') {
      if (pedido.moeda !== 'gold') return responder(ref, false, 'anúncio automático só em ouro');
      const r = cofreRef ? cofreRef.autorizar(pedido, 'mercado') : { ok: false, motivo: 'cofre não carregou' };
      if (!r.ok) return responder(ref, false, `cofre: ${r.motivo}`);
    }
    if (compra && auto) {
      const r = cofreRef ? cofreRef.autorizar(pedido, 'mercado') : { ok: false, motivo: 'cofre não carregou' };
      if (!r.ok) return responder(ref, false, `cofre: ${r.motivo}`);
      reservasMercado.set(pedido.id, r.reserva);
      while (reservasMercado.size > 200) reservasMercado.delete(reservasMercado.keys().next().value);
    }
    gastarFicha(pedido.t);
    ultimoEnvioRadarEm = agora();
    // Marca antes de enviar: mesmo se o envio falhar, esse anúncio não recebe outro pedido.
    if (compra) st.comprados.add(pedido.id);
    const texto = JSON.stringify(pedido);
    try {
      Reflect.apply(sendNativo, ws, [texto]);
    } catch (e) {
      erro(e);
      return responder(ref, false, 'falha ao enviar');
    }
    // A recusa de um anúncio também pode vir em texto solto (0.7.0).
    if (pedido.t === 'market.criar' || pedido.t === 'market.editar') st.avisoLivreAte = agora() + AVISO_LIVRE_MS;
    if (compra) {
      st.rastroAte = agora() + RASTRO_MS;
      st.avisoLivreAte = agora() + AVISO_LIVRE_MS;
    }
    if (st.gravando) {
      const info = st.sockets.get(ws);
      entrada('out', pedido.t, agora(), info ? info.id : 0, pedido, { bytes: texto.length, radar: true });
    }
    return responder(ref, true, null);
  }

  function status() {
    const sockets = [];
    for (const [ws, info] of st.sockets) sockets.push({ sid: info.id, endereco: info.endereco, readyState: ws.readyState });
    const atual = st.atual ? st.sockets.get(st.atual) : null;
    return { tipo: 'status', em: agora(), gravando: st.gravando, radar: st.radar, sockets, atual: atual ? atual.id : null, descartadas: st.descartadas };
  }

  function aoComando(ev) {
    try {
      const cmd = JSON.parse(String(ev.detail));
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.tipo === 'pronto') {
        st.ponteOk = true;
        for (const obj of st.pendentes.splice(0)) emitir(obj);
        ligarGravacao(cmd.gravando === true);
        ligarRadar(cmd.radar === true);
        emitir(status());
      } else if (cmd.tipo === 'gravar') {
        ligarGravacao(cmd.ligado === true);
        emitir(status());
      } else if (cmd.tipo === 'radar') {
        ligarRadar(cmd.ligado === true);
        emitir(status());
      } else if (cmd.tipo === 'enviar') {
        enviar(cmd);
      } else if (cmd.tipo === 'cofre-estornar') {
        // Compra automática do radar que não aconteceu: devolve a reserva DAQUELE anúncio, uma vez
        // e no máximo pelo valor reservado (um evento forjado não reabre o teto do dia — caso B).
        const reserva = reservasMercado.get(Number(cmd.anuncioId));
        if (reserva && cofreRef) { reservasMercado.delete(Number(cmd.anuncioId)); cofreRef.estornar(reserva); }
      } else if (cmd.tipo === 'reservar-itens') {
        // O radar comprou para revender: a rotina não gasta essas unidades.
        const id = Number(cmd.itemId);
        const q = Math.floor(Number(cmd.qtd));
        if (Number.isInteger(id) && id > 0 && q > 0 && q < 1e7) {
          reservaItens[id] = (Number(reservaItens[id]) || 0) + q;
          try { raiz.localStorage.setItem(CHAVE_RESERVA_ITENS, JSON.stringify(reservaItens)); } catch { /* nada */ }
        }
      } else if (cmd.tipo === 'status') {
        emitir(status());
      }
    } catch (e) {
      erro(e);
    }
  }

  // ---- instalação ----------------------------------------------------------------------------

  const Envolto = new Proxy(Nativo, {
    construct(alvo, args, novoAlvo) {
      const ws = Reflect.construct(alvo, args, novoAlvo);
      try { acompanhar(ws, args[0]); } catch (e) { erro(e); }
      return ws;
    },
  });

  try {
    doc.addEventListener(EVT_ENTRADA, aoComando);
    raiz.WebSocket = Envolto;
    Object.defineProperty(raiz, MARCA, {
      value: Object.freeze({ versao: 2, _interno: Object.freeze({ tipoRapido, filtrarEventos, extrairAnuncios, fatiaWelcome, lerRelogio, lerConta, validarPedido, resumoParaRastro, semNicks, fichaPropria }) }),
    });
    // A ponte pode ter carregado antes: avisa que o hook está de pé para ela mandar "pronto".
    doc.dispatchEvent(new CustomEventNativo(EVT_SAIDA, { detail: JSON.stringify({ tipo: 'hook-pronto', em: agora() }) }));
  } catch (e) {
    erro(e);
  }
})(globalThis);
