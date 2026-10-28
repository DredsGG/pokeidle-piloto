// Radar do Mercado: o radar (Fases 1 e 2).
//
// A cada 30 s (±20%, nunca menos de 20 s) pede o resumo do mercado pelo socket do jogo, guarda
// o histórico de preços, confere no máximo 2 itens promissores e avisa quando um anúncio está
// pelo menos 25% abaixo do preço de revenda (com a taxa de 15% na conta). Compra com o clique
// do Allan no painel ou, se ele ligar a compra automática, sozinho, dentro dos limites dela: um
// pedido por anúncio, no fim da retenção, no relógio do servidor, uma compra enviada por vez e
// nenhuma leitura perto do envio. Para enquanto o mercado está aberto na tela, para não mexer
// no que ele está vendo (a compra já agendada segue).
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const g = globalThis;
  const bus = g.RadarBus;
  const ponte = g.RadarPonte;
  const Config = g.RadarConfig;
  const A = g.RadarAgenda;
  const R = g.RadarRelogio;
  const P = g.RadarPrecos;
  const H = g.RadarHistorico;
  const C = g.RadarCompra;
  const Vitrine = g.RadarVitrine;
  const Pessoal = g.RadarPessoal;
  const Auto = g.RadarAutomatica;
  const Rv = g.RadarRevenda;
  const Pk = g.RadarPokemon;
  const RvPk = g.RadarRevendaPokemon;
  const Lucro = g.RadarLucro;
  if (!bus || !ponte || !Config || !A || !R || !P || !H || !C || !Vitrine || !Pessoal || !Auto || !Rv || !Pk || !RvPk || !Lucro) { console.error(PREFIXO, 'radar: bibliotecas não carregaram'); return; }

  const CHAVE_ESTADO = 'radar:estado';
  const CHAVE_CATALOGO = 'radar:catalogo';
  const ESPERA_RESPOSTA_MS = 8000;
  const JANELA_MERCADO_ABERTO_MS = 60000;
  const JANELA_ERRO_PEDIDO_MS = 3000;
  const JANELA_AVISO_COMPRA_MS = 2000; // aviso em texto solto que vale como resposta da compra
  const MAX_CONFERENCIAS = 2;
  const RECONFERIR_MS = 10 * 60 * 1000;
  const PAUSA_ENTRE_PEDIDOS_MS = 1500;
  const PRIMEIRO_CICLO_MS = 3000;
  const PESSOAIS = new Set(['historico', 'historicoCompras', 'meus']);
  const INTERVALO_PEDIDO_TELA_MS = 10000;
  const CHAVE_GASTO = 'radar:gastoDia';
  const CHAVE_AUTO_DESLIGADA = 'radar:autoDesligada'; // { em, motivo }: o painel mostra por quê
  const CHAVE_ALVOS_CONTA = 'radar:alvos-contagem'; // 1.34: quanto cada alvo de compra já comprou
  const CHAVE_MANUAIS = 'revenda:manuais:v1'; // 1.33.9: o que você comprou à mão (nunca revende sozinho)
  const CHAVE_PEDRAS_TIME = 'revenda:pedrasDoTime:v1'; // 1.33.9: as pedras que o time vai gastar
  // Na vigia contínua a pausa entre leituras cai para 0,5 s: quem segura o ritmo é o limitador do
  // gancho (2 leituras/s), não um intervalo fixo.
  const pausaEntrePedidos = () => (s.config.vigiaContinua ? 500 : PAUSA_ENTRE_PEDIDOS_MS);
  const VOLTA_CONTINUA_MS = 1000; // começo de uma varredura até o começo da próxima, no mínimo
  const MAX_FILA = 16; // compras abertas (agendadas, a enviada e as que estão no sorteio)
  const CONFERIR_HISTORICO_MS = 3000; // depois de "sem resposta", espera isto e olha o histórico
  const RASTRO_ANTES_MS = 5000; // leituras do radar que entram no rastro, antes do envio
  const RASTRO_DEPOIS_MS = 20000; // igual ao do gancho
  const ESPERA_SILENCIO_MAX_MS = 30000;
  // Revenda (Fase 3)
  const LIVRO_VALE_MS = 5 * 60 * 1000; // linhas do market.item de um item
  const MEUS_VALE_MS = 60 * 1000;
  const HISTORICO_VALE_MS = 5 * 60 * 1000;
  const MAX_LIVROS_POR_ABERTURA = 4;
  const JANELA_RESPOSTA_ANUNCIO_MS = 3000; // erro ligado ao último anúncio pelo horário
  const ESPERA_ANUNCIO_MS = 8000;
  // Pokémon (Fase 4)
  const VENDAS_VALE_MS = 6 * 60 * 60 * 1000; // vendas de 30 dias de uma espécie
  const MAX_PAGINAS_VENDAS = 2;
  const MAX_VISTOS_POKEMON = 3000;
  const ESPERA_POKEMON_MS = 10 * 60 * 1000; // anúncio que espera as vendas da espécie por mais que isto sai

  const s = {
    disputa: new Map(), // itemId/espécie -> média de jogadores no sorteio (1.5)
    config: Config.validar(null),
    configCarregada: false,
    catalogo: new Map(),
    catalogoSalvo: '',
    conta: { id: null, gold: null, itens: null },
    amostrasRelogio: [],
    socketAberto: false,
    retentar: new Map(), // 1.34.1: anúncioId -> compra automática que não saiu com a conexão caída
    quedas: [], // 1.34.1: as últimas quedas da conexão do jogo (para o diagnóstico)
    sessaoTomada: false,
    mercadoDom: false,
    temModalDom: false, // o #modal do jogo existe: a pausa segue o que está na tela
    mercadoJogoAte: 0,
    ultimoPedidoResumo: 0,
    ultimoHistoricoVendas: Date.now(), // a leitura de fundo das suas vendas começa 10 min depois (0.9.0)
    ocultaDesde: document.visibilityState === 'hidden' ? Date.now() : null,
    recuo: A.novoRecuo(),
    timer: null,
    ultimoPulsoEm: 0, // última mensagem do jogo (pulso do gancho)
    semResposta: null, // { em, mudo }: o último pedido que ficou sem resposta
    ultimaRecusa: null, // { chave, em }: o último erro do servidor logo depois de um pedido nosso
    retomaEm: null,
    timerRetomada: null,
    rodando: false,
    pendentes: [],
    conferidos: new Map(),
    dicas: new Set(),
    alertados: new Set(),
    quaseRegistrados: new Set(),
    acompanhados: new Map(), // anuncioId -> aviso ou quase aviso ainda no mercado
    sorteios: new Map(), // anuncioId -> a disputa da liberação, das compras do radar (0.8.0, só memória)
    alertas: new Map(),
    comprasNoJogo: [], // marketComprado que não veio do radar (descricao, em)
    compras: new Map(), // anuncioId -> compra (agendada, enviada ou acabando de concluir)
    timerFila: null,
    rastroAlvo: null, // a compra enviada por último: o rastro do gancho vai para ela
    leituras: [], // { t, em } dos últimos pedidos de leitura do radar (para o rastro)
    falhasSeguidas: 0,
    gastoDia: null, // { dia, total } do que o automático comprou
    tetoAvisado: null, // dia em que já avisou o teto
    ultimoCiclo: null,
    proximoCiclo: null,
    itensCobertos: 0,
    itensLiberados: 0,
    motivo: null,
    ultimoErro: null,
    ultimoAlerta: null,
    parado: false,
    ultimaVitrine: null,
    seqTela: 900000,
    ultimoPedidoTela: new Map(),
    livros: new Map(), // itemId -> { linhas, em } do último market.item
    taxaDiaria: Pk.DIARIA_PADRAO, // welcome.mercado.taxaDiaria
    faixasOrb: undefined, // welcome.mercado.faixasOrb (comissão do pokémon em Gemas)
    pokemon: {
      vistos: new Set(), // ids de anúncio de pokémon já avaliados
      vendas: new Map(), // espécie -> { vendas, em }
      espera: new Map(), // espécie -> { nome, speciesId, anuncios } esperando as vendas
      acompanhados: new Map(), // anuncioId -> aviso ou quase aviso de pokémon ainda à venda (0.6.3)
    },
    revenda: {
      meus: null, meusEm: 0, // última resposta de market.meus
      historico: null, historicoEm: 0, // última de market.historicoCompras
      registro: null, registroEm: 0, // compras do radar no registro
      ocultos: new Map(), // itemId -> qtd com que o cartão foi escondido
      acoes: new Map(), // itemId -> { fase, texto, em } do último clique
      esperaAte: new Map(), // itemId -> hora local em que o jogo deixa anunciar ou mudar o preço de novo
      emVoo: null, // { itemId, tipo: 'criar'|'editar', em, qtd, preco, anuncioId } (pokémon: tipo 'criar-pk'|'editar-pk', pokemonId)
      lendo: false,
      // 0.7.0: os seus pokémon (do gancho), os cálculos de preço por pokémon e o último clique.
      pk: { lista: [], activeId: null, recebidoEm: 0, calculos: new Map(), acoes: new Map(), fila: [], calculando: false },
    },
  };

  function erro(e) { try { console.error(PREFIXO, e); } catch { /* nada */ } }
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  function desvio() {
    return R.estimarDesvio(s.amostrasRelogio);
  }

  function agoraServidor() {
    const d = desvio();
    return d === null ? null : R.agoraNoServidor(Date.now(), d);
  }

  // Com o #modal do jogo à vista, vale só o que está na tela. A resposta de mercado que o jogo
  // pediu é reserva para quando o layout mudar e o modal sumir: ao abrir o mercado o próprio
  // jogo pede dados, e usar isso com o modal à vista deixava o radar pausado até 60 s depois
  // de fechar.
  function mercadoAberto() {
    return s.temModalDom ? s.mercadoDom : Date.now() < s.mercadoJogoAte;
  }

  // Mercado fechado: volta a consultar em poucos segundos, sem esperar o ciclo, respeitando o
  // mínimo de 20 s desde o último pedido de resumo.
  function retomarLogo() {
    if (!s.config.radarLigado || s.parado || s.recuo.pausado || s.rodando) return;
    const desde = Date.now() - (s.ultimoPedidoResumo || 0);
    agendarProximo(Math.max(PRIMEIRO_CICLO_MS, A.PISO_MS - desde));
  }

  // ---- service worker (histórico, registro, notificações) ------------------------------------

  async function sw(mensagem) {
    try {
      if (!ponte.storage()) return null;
      const r = await chrome.runtime.sendMessage(mensagem);
      if (r && r.erro) { erro(r.erro); return null; }
      return r ? r.dados : null;
    } catch (e) {
      erro(e);
      return null;
    }
  }

  // ---- estado para o popup -------------------------------------------------------------------

  let publicacao = null;
  function publicarEstado() {
    if (publicacao) return;
    publicacao = setTimeout(() => {
      publicacao = null;
      const estado = {
        atualizadoEm: Date.now(),
        ligado: s.config.radarLigado,
        motivo: s.motivo,
        ultimoCiclo: s.ultimoCiclo,
        proximoCiclo: s.proximoCiclo,
        itensCobertos: s.itensCobertos,
        itensLiberados: s.itensLiberados,
        desvioMs: desvio(),
        meuIdOk: s.conta.id !== null && s.conta.id !== undefined,
        saldoOk: typeof s.conta.gold === 'number', // o valor do saldo não sai da página
        nivelRecuo: s.recuo.nivel,
        falhas: s.recuo.falhas,
        retomaEm: s.retomaEm,
        ultimoErro: s.ultimoErro,
        ultimoAlerta: s.ultimoAlerta,
        compraEmAndamento: abertas().length > 0,
        comprasNaFila: abertas().length,
        automatica: s.config.compraAutomatica,
        gastoAutoHoje: Auto.gastoDeHoje(s.gastoDia, Date.now()),
        gastoMaximoDia: s.config.gastoMaximoDia,
      };
      // A barra e o painel no jogo recebem também o saldo e se o mercado está aberto: ficam
      // só nesta aba, nunca no storage.
      bus.emit('tela:estado', { ...estado, saldo: s.conta.gold, mercadoAberto: mercadoAberto() });
      const st = ponte.storage();
      if (!st || !ponte.temJogo()) return;
      st.set({ [CHAVE_ESTADO]: estado }).catch(erro);
    }, 250);
  }

  // Aba Mercado do painel: a vitrine do último ciclo, com as conferências que já houve.
  function emitirMercado() {
    if (!s.ultimaVitrine) return;
    const v = s.ultimaVitrine;
    const linhas = Vitrine.linhasDoMercado({ amostras: v.amostras, historico: v.historico, conferidos: s.conferidos, catalogo: s.catalogo, config: s.config, agora: Date.now() });
    bus.emit('tela:mercado', { linhas, em: v.em });
  }

  // ---- pedidos e respostas -------------------------------------------------------------------

  // Resolve com a resposta (dados da aba) ou null (recusado, sem resposta em 8 s, erro).
  // casa(dados): diz se uma resposta de mercado é a deste pedido. Espera a janela de silêncio
  // das compras: nenhuma leitura sai com uma compra enviada ou a 2 s do envio.
  // 1.36.0: a leitura da pedra do time passa na frente. As leituras do radar dividem um balde só no
  // gancho (com o freio do "Devagar aí" chega a 1 a cada 8 s) e a da pedra perdia a vez para a
  // varredura, voltando "limite de leituras" — o time ficava sem a pedra. Enquanto ela espera, as
  // outras leituras aguardam (no máximo 20 s).
  let prioridade = 0;
  async function esperarPrioridade() {
    const ate = Date.now() + 20_000;
    while (prioridade > 0 && Date.now() < ate) await new Promise((r) => setTimeout(r, 250));
  }
  async function pedirPrioritario(pedido, casa, tentativas = 6) {
    prioridade++;
    try {
      for (let i = 0; i < tentativas; i++) {
        const r = await pedir(pedido, casa, true);
        if (r) return r;
        if (!(s.ultimoErro && /limite de leituras/.test(s.ultimoErro.motivo || '') && Date.now() - s.ultimoErro.em < 5000)) return r;
        await new Promise((res) => setTimeout(res, 1500));
      }
      return null;
    } finally { prioridade--; }
  }
  async function pedir(pedido, casa, prio = false) {
    if (!prio && prioridade > 0) await esperarPrioridade();
    await esperarJanelaDeCompra();
    s.leituras.push({ t: pedido.t, em: Date.now() });
    if (s.leituras.length > 30) s.leituras.shift();
    return new Promise((resolver) => {
      const p = { casa, em: Date.now(), resolver, timer: null };
      const terminar = (v) => {
        clearTimeout(p.timer);
        const i = s.pendentes.indexOf(p);
        if (i >= 0) s.pendentes.splice(i, 1);
        resolver(v);
      };
      p.terminar = terminar;
      p.timer = setTimeout(() => {
        // Mudo: nenhuma mensagem do jogo desde o envio (o servidor está parado, não recusou).
        s.semResposta = { em: Date.now(), mudo: !(s.ultimoPulsoEm >= p.em) };
        terminar(null);
      }, ESPERA_RESPOSTA_MS);
      s.pendentes.push(p);
      ponte.enviar(pedido).then((r) => {
        if (!r.ok) {
          s.ultimoErro = { motivo: r.motivo, em: Date.now() };
          // Limite de leituras do gancho: só espaça (como servidor mudo), não conta como falha.
          if (/limite de leituras/.test(r.motivo || '')) s.semResposta = { em: Date.now(), mudo: true };
          terminar(null);
        }
      });
    });
  }

  function resolverPendente(e) {
    const d = e.dados || {};
    const p = s.pendentes.find((x) => x.casa(d));
    if (!p) return false;
    p.terminar(d);
    return true;
  }

  const ERROS_DE_FORA = new Set(['shop', 'team', 'hunt', 'centro', 'xpshare', 'pvp', 'passe', 'outland', 'pokemon', 'chocadeira', 'oferenda', 'auto', 'batalha', 'campo', 'guild', 'amigo', 'orbs', 'loja', 'ginasio', 'casa', 'colecao']);
  const casaItens = (d) => d.aba === 'itens';
  const casaItem = (itemId) => (d) => d.aba === 'item' && Number(d.itemId) === itemId && d.moeda === 'gold';

  // Pedido sem resposta. Se o jogo inteiro ficou calado (o servidor reinicia a cada atualização do
  // jogo), só espaça as consultas; senão conta, e 5 seguidas pausam com uma tentativa a cada 10 min.
  function falha(motivo) {
    const agora = Date.now();
    const sr = s.semResposta;
    const mudo = Boolean(sr && sr.mudo && agora - sr.em < 2000);
    const recusa = s.ultimaRecusa && agora - s.ultimaRecusa.em < 10000 ? s.ultimaRecusa.chave : null;
    s.semResposta = null;
    s.recuo = A.registrar(s.recuo, false, { mudo });
    let texto = motivo;
    if (mudo) texto = `${motivo}: o jogo todo ficou sem mensagens (servidor reiniciando?), não conta como falha`;
    else if (recusa) texto = `${motivo} (o servidor recusou: ${recusa})`;
    s.ultimoErro = { motivo: texto, em: agora, mudo };
    if (s.recuo.pausado) pausarComRetomada();
  }

  const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function pausarComRetomada() {
    clearTimeout(s.timerRetomada);
    s.retomaEm = Date.now() + A.RETOMADA_MS;
    s.timerRetomada = setTimeout(retomarDepoisDaPausa, A.RETOMADA_MS);
    s.motivo = A.motivoDePausa(contextoDePausa());
    sw({ tipo: 'notificar', titulo: 'Radar pausado', mensagem: `O servidor não respondeu 5 vezes seguidas. O radar tenta de novo sozinho às ${hora(s.retomaEm)}.` });
  }

  function cancelarRetomada() {
    clearTimeout(s.timerRetomada);
    s.timerRetomada = null;
    s.retomaEm = null;
  }

  function retomarDepoisDaPausa() {
    s.timerRetomada = null;
    s.retomaEm = null;
    if (!s.recuo.pausado) return;
    s.recuo = A.retomar(s.recuo);
    s.motivo = null;
    publicarEstado();
    agendarProximo(PRIMEIRO_CICLO_MS);
  }

  // ---- ciclo ---------------------------------------------------------------------------------

  function contextoDePausa() {
    return {
      ligado: s.config.radarLigado,
      recuo: s.recuo,
      sessaoTomada: s.sessaoTomada,
      socketAberto: s.socketAberto,
      temCatalogo: s.catalogo.size > 0,
      // 1.5: com a vigia contínua, o radar não para nem com o mercado aberto na tela.
      mercadoAberto: s.config.vigiaContinua ? false : mercadoAberto(),
      ocultaDesde: s.ocultaDesde,
      agora: Date.now(),
      config: s.config,
      retomaAs: s.retomaEm ? hora(s.retomaEm) : null,
    };
  }

  function agendarProximo(ms) {
    clearTimeout(s.timer);
    s.timer = null;
    s.proximoCiclo = null;
    if (!s.config.radarLigado || s.parado || s.recuo.pausado) return;
    // 1.7: vigia contínua = uma varredura atrás da outra, sem intervalo. O único freio é o
    // limitador do gancho (leituras a 2/s, abaixo das 3/s que o servidor aceita por conta, para
    // sobrar 1/s para o próprio jogo). Se o servidor reclamar, o recuo volta a espaçar.
    // Se o servidor reclamou (recuo), espaça só o necessário: 5 s, 10 s, 20 s… até 1 min, e volta ao
    // contínuo depois de 3 respostas boas.
    const vc = s.config.vigiaContinua;
    const espera = ms ?? (vc
      ? (s.recuo.nivel === 0 ? Math.max(0, VOLTA_CONTINUA_MS - (Date.now() - (s.ultimoPedidoResumo || 0))) : Math.min(60000, 5000 * 2 ** (s.recuo.nivel - 1)))
      : A.proximaEspera(s.config, s.recuo.nivel));
    s.timer = setTimeout(ciclo, espera);
    s.proximoCiclo = Date.now() + espera;
  }

  async function ciclo() {
    s.timer = null;
    if (s.rodando) return;
    s.rodando = true;
    try {
      s.motivo = A.motivoDePausa(contextoDePausa());
      if (s.motivo) return;
      s.ultimoPedidoResumo = Date.now();
      const resp = await pedir({ t: 'market.itens' }, casaItens);
      if (!resp) { falha('sem resposta ao resumo do mercado'); return; }
      s.recuo = A.registrar(s.recuo, true);
      s.ultimoCiclo = Date.now();
      await processarResumo(resp);
      if (s.config.pokemon && !A.motivoDePausa(contextoDePausa())) await processarPokemon();
      if (!A.motivoDePausa(contextoDePausa())) await lerVendasDeFundo();
      // 1.12.3: a revenda corre à parte (antes, a volta dela parava as varreduras por até 45 s).
      if (!A.motivoDePausa(contextoDePausa())) revendaAutomatica().catch(erro);
      if (!A.motivoDePausa(contextoDePausa())) revendaPkAutomatica().catch(erro);
    } catch (e) {
      erro(e);
    } finally {
      s.rodando = false;
      s.motivo = A.motivoDePausa(contextoDePausa());
      agendarProximo();
      publicarEstado();
    }
  }

  function liberados() {
    return [...s.catalogo.values()].filter((item) => Config.itemLiberado(s.config, item));
  }

  // ---- 1.34: Alvos de compra (só no Manual) ----------------------------------------------------
  // Por item: compra sozinho quando aparece anúncio de outro jogador no teto (em ouro) ou abaixo,
  // até a quantidade máxima. Passa pelo cofre como toda compra automática. O que o alvo compra é
  // SEU (não entra na revenda automática nem na reserva do radar).
  s.alvosConta = {};
  s.alvosPendente = {};
  function alvosAtivos() {
    if (s.modoPiloto !== 'manual' || !s.config.radarLigado) return [];
    return (s.config.alvos || []).filter((a) => a.ligado && (!a.max || ((s.alvosConta || {})[a.id] || 0) + (s.alvosPendente[a.id] || 0) < a.max));
  }
  function comprarPorAlvo(alvo, item, linhas) {
    const l = P.escolherCandidato(linhas || [], s.conta.id);
    if (!l || !Number.isInteger(l.id) || !(l.preco > 0) || l.preco > alvo.teto || s.compras.has(l.id) || s.alertados.has(l.id)) return false;
    const restante = alvo.max ? alvo.max - ((s.alvosConta || {})[alvo.id] || 0) - (s.alvosPendente[alvo.id] || 0) : Infinity;
    const cabe = P.quantidadeCompravel({ qtdAnuncio: l.qtd ?? 1, preco: l.preco, saldo: saldoLivre(), gastoMaximo: 0 });
    const qtd = Math.min(restante, cabe, l.qtd ?? 1);
    if (!(qtd >= 1)) return false;
    const nome = item.nome || `item ${alvo.itemId}`;
    const alerta = { anuncioId: l.id, itemId: alvo.itemId, nome, preco: l.preco, qtdAnuncio: l.qtd ?? 1, qtd, compravelEm: typeof l.compravelEm === 'number' ? l.compravelEm : 0, criadoEm: l.criadoEm ?? null, lucroTotal: 0, alvo: alvo.id, qtdReservadaAlvo: qtd, em: Date.now(), resultado: null };
    s.alertas.set(l.id, alerta);
    s.alertados.add(l.id);
    const ok = iniciarCompra({ anuncioId: l.id, qtd, auto: true });
    if (ok) s.alvosPendente[alvo.id] = (s.alvosPendente[alvo.id] || 0) + qtd;
    diarioPiloto(ok ? `alvo: comprando ${fmtN(qtd)}× ${nome} a ${fmtN(l.preco)} (teto ${fmtN(alvo.teto)})` : `alvo: a compra de ${nome} não entrou na fila`, ok ? 'ok' : 'aviso');
    return ok;
  }

  async function processarResumo(resp) {
    const agora = Date.now();
    const alvos = alvosAtivos();
    const lista = liberados();
    for (const a of alvos) { const it = s.catalogo.get(a.itemId); if (it && !lista.includes(it)) lista.push(it); }
    s.itensLiberados = lista.length;
    const amostras = [];
    for (const item of lista) {
      const a = H.amostraDoResumo(String(item.id), resp.resumo, resp.medias, agora);
      if (a) amostras.push(a);
    }
    s.itensCobertos = amostras.length;
    conferirSaidas(amostras, lista);
    if (!amostras.length) return;
    // A referência vem do histórico de ANTES desta leitura: com a amostra de agora dentro, um
    // preço baixo viraria a própria mediana e nunca pareceria barato.
    const historico = (await sw({ tipo: 'historico:resumo', itemIds: amostras.map((a) => a.itemId), agora, antesDe: H.balde(agora) })) || {};
    await sw({ tipo: 'historico:gravar', amostras });
    s.ultimaVitrine = { amostras, historico, em: agora };
    emitirMercado();

    const candidatos = [];
    const alvoDe = new Map(alvos.map((x) => [x.itemId, x]));
    for (const a of amostras) {
      const al = alvoDe.get(Number(a.itemId));
      if (al && a.minGold > 0 && a.minGold <= al.teto) {
        const asn = Vitrine.assinatura(a);
        const ult = s.conferidos.get(a.itemId);
        if (!(ult && ult.alvo && ult.assinatura === asn && agora - ult.em < 60_000)) { candidatos.push({ a, hist: historico[a.itemId] || null, assinatura: asn, prioridade: 9, alvo: al }); continue; }
      }
      const hist = historico[a.itemId] || null;
      const pf = P.preFiltro({ minGold: a.minGold, media7d: a.mediaGold, mediana24h: hist && hist.mediana24h, volume7d: a.volume7d, config: s.config });
      const dica = s.dicas.has(a.itemId);
      if (!pf.passa && !dica) continue;
      const assinatura = Vitrine.assinatura(a);
      const ultimo = s.conferidos.get(a.itemId);
      if (!dica && ultimo && ultimo.assinatura === assinatura && agora - ultimo.em < RECONFERIR_MS) continue;
      candidatos.push({ a, hist, assinatura, prioridade: dica ? 2 : pf.descontoEstimado });
    }
    s.dicas.clear();
    candidatos.sort((x, y) => y.prioridade - x.prioridade);

    for (const c of candidatos.slice(0, MAX_CONFERENCIAS)) {
      await esperar(pausaEntrePedidos());
      if (A.motivoDePausa(contextoDePausa())) return;
      const resp2 = await pedir({ t: 'market.item', itemId: c.a.itemId, moeda: 'gold' }, casaItem(c.a.itemId));
      if (!resp2) { falha('sem resposta aos anúncios do item'); return; }
      s.recuo = A.registrar(s.recuo, true);
      s.livros.set(c.a.itemId, { linhas: resp2.linhas || [], em: Date.now() });
      if (c.alvo) {
        s.conferidos.set(c.a.itemId, { assinatura: c.assinatura, em: Date.now(), alvo: true, proximo: null, candidato: null, motivos: [], motivoAuto: null, qtdAnuncio: null, lucroTotal: null });
        comprarPorAlvo(c.alvo, s.catalogo.get(Number(c.a.itemId)) || { nome: c.a.nome }, resp2.linhas);
        emitirMercado();
        continue;
      }
      const av = P.avaliar({
        linhas: resp2.linhas,
        meuId: s.conta.id,
        mediana24h: c.hist && c.hist.mediana24h,
        media7d: c.a.mediaGold,
        volume7d: c.a.volume7d,
        saldo: s.conta.gold,
        config: s.config,
      });
      const novo = Boolean(av.candidato) && !s.alertados.has(av.candidato.id);
      // O automático tem limites próprios: pode comprar o que não virou aviso (lucro entre o
      // mínimo dele e o do aviso), e pode deixar de comprar o que avisou.
      const auto = av.candidato ? Auto.decidir({ avaliacao: av, config: configDoAutomatico(), gastoHoje: Auto.gastoDeHoje(s.gastoDia, Date.now()) + reservado((x) => x.auto), saldo: saldoLivre() }) : null;
      // O próximo da fila vira a revenda da aba Mercado por 10 min.
      // motivos: por que não avisou; motivoAuto: por que o automático (ligado) não comprou. A
      // aba Mercado e a aba Avisos mostram os dois quando a linha está verde.
      s.conferidos.set(c.a.itemId, {
        assinatura: c.assinatura, em: Date.now(), proximo: av.proximo ? av.proximo.preco : null, candidato: av.candidato ? av.candidato.preco : null,
        motivos: av.motivos || [], motivoAuto: s.config.compraAutomatica && auto && !auto.comprar ? auto.motivo : null,
        qtdAnuncio: av.candidato ? av.candidato.qtd : null, lucroTotal: typeof av.lucroTotal === 'number' ? av.lucroTotal : null,
      });
      conferirSaidasNoItem(c.a.itemId, resp2.linhas);
      emitirMercado();
      if (novo && av.alerta && s.config.compraAutomatica && auto && !auto.comprar) {
        diarioPiloto(`radar: ${c.a.nome || 'item'} avisou mas não comprei sozinho: ${auto.motivo}`, 'aviso', `${c.a.itemId}:${auto.motivo}`);
      }
      if (novo && (av.alerta || auto.comprar)) await alertar(c.a, av, auto.comprar ? auto : null);
      else if (ehQuaseAviso(av)) await registrarQuase(c.a, av);
      if (novo && auto && auto.motivo === 'teto do dia atingido') avisarTeto();
    }
  }

  // ---- aviso ---------------------------------------------------------------------------------

  const fmtN = (v) => (typeof v === 'number' ? Math.round(v).toLocaleString('pt-BR') : '-');
  const fmtPct = (v) => `${Math.round(v * 100)}%`;

  // Quase aviso: o anúncio dá lucro depois da taxa (desconto de pelo menos 16% sobre a
  // revenda), mas alguma regra segurou (desconto abaixo do mínimo, lucro, liquidez, pouco
  // histórico). Vai para o registro, sem notificação, para calibrar as regras com o que
  // apareceu de verdade. Um registro por anúncio.
  function ehQuaseAviso(av) {
    return Boolean(!av.alerta && av.candidato && typeof av.desconto === 'number'
      && av.desconto >= Config.LIMITES.descontoMinimo[0]
      && !s.alertados.has(av.candidato.id) && !s.quaseRegistrados.has(av.candidato.id));
  }

  async function registrarQuase(amostra, av) {
    const registro = { ...montarRegistro(amostra, av), tipo: 'quase', motivos: av.motivos || [] };
    s.quaseRegistrados.add(registro.anuncioId);
    registro.chave = await sw({ tipo: 'alerta:registrar', alerta: registro });
    acompanhar(registro);
  }

  // ---- anúncios que saem do mercado ------------------------------------------------------------

  // Avisos e quase avisos ficam acompanhados até o anúncio sair (comprado por alguém ou
  // retirado). A hora da saída vai para o registro: mostra quanto tempo cada oportunidade dura.
  const MAX_ACOMPANHADOS = 300;

  function acompanhar(registro) {
    s.acompanhados.set(registro.anuncioId, { anuncioId: registro.anuncioId, itemId: registro.itemId, preco: registro.preco, chave: registro.chave, em: registro.em });
    while (s.acompanhados.size > MAX_ACOMPANHADOS) s.acompanhados.delete(s.acompanhados.keys().next().value);
  }

  // Pokémon (0.6.3): o aviso e o quase aviso ficam acompanhados até o anúncio sumir da lista dos
  // mais baratos da espécie (a vitrine mostra os retidos também). No máximo uma lista a mais por
  // ciclo: aviso aberto a cada 30 s, quase aviso a cada 5 min, por até 24 h. A lista que o radar
  // já pede para conferir um candidato também serve.
  const ACOMPANHAR_POKEMON_MS = 24 * 3600000;
  const REVER_AVISO_POKEMON_MS = 30000;
  const REVER_QUASE_POKEMON_MS = 5 * 60000;

  function acompanharPokemon(r, aviso) {
    if (!r || r.anuncioId === null || r.anuncioId === undefined || r.speciesId === null || r.speciesId === undefined) return;
    const mapa = s.pokemon.acompanhados;
    // O aviso é conferido logo no próximo ciclo; o quase aviso, só depois do intervalo dele.
    mapa.set(r.anuncioId, { anuncioId: r.anuncioId, speciesId: r.speciesId, moeda: r.moeda || 'gold', preco: r.preco, chave: r.chave, em: r.em, aviso, conferidoEm: aviso ? 0 : Date.now() });
    while (mapa.size > MAX_ACOMPANHADOS) mapa.delete(mapa.keys().next().value);
  }

  function conferirSaidasPokemon(speciesId, moeda, linhas) {
    const agora = Date.now();
    for (const ac of [...s.pokemon.acompanhados.values()]) {
      if (ac.speciesId !== speciesId || ac.moeda !== moeda) continue;
      ac.conferidoEm = agora;
      if (Pk.saiuDaVitrine(ac, linhas) === true) {
        s.pokemon.acompanhados.delete(ac.anuncioId);
        registrarSaida(ac);
      }
    }
  }

  // O acompanhado mais atrasado: aviso aberto antes de quase aviso.
  function pokemonParaConferir() {
    const agora = Date.now();
    let melhor = null;
    for (const ac of [...s.pokemon.acompanhados.values()]) {
      const alerta = s.alertas.get(ac.anuncioId);
      if (agora - ac.em > ACOMPANHAR_POKEMON_MS || (alerta && (alerta.resultado || alerta.sumiu))) {
        s.pokemon.acompanhados.delete(ac.anuncioId);
        continue;
      }
      if (agora - ac.conferidoEm < (ac.aviso ? REVER_AVISO_POKEMON_MS : REVER_QUASE_POKEMON_MS)) continue;
      if (!melhor || (ac.aviso && !melhor.aviso) || (ac.aviso === melhor.aviso && ac.conferidoEm < melhor.conferidoEm)) melhor = ac;
    }
    return melhor;
  }

  // Pelo resumo: o menor preço do item subiu acima do preço do anúncio, então ele saiu.
  function conferirSaidas(amostras, lista) {
    for (const ac of [...s.acompanhados.values()]) {
      if (!lista.some((item) => item.id === ac.itemId)) continue; // item fora do escopo agora: não dá para saber
      const amostra = amostras.find((a) => a.itemId === ac.itemId);
      if (P.anuncioSaiu({ alerta: ac, minGold: amostra ? amostra.minGold : null })) registrarSaida(ac);
    }
  }

  // Pelos anúncios do item (resposta exata).
  function conferirSaidasNoItem(itemId, linhas) {
    for (const ac of [...s.acompanhados.values()]) {
      if (ac.itemId === itemId && P.anuncioSaiu({ alerta: ac, linhas })) registrarSaida(ac);
    }
  }

  function registrarSaida(ac) {
    s.acompanhados.delete(ac.anuncioId);
    const alerta = s.alertas.get(ac.anuncioId);
    // Compra nossa em andamento ou feita: a saída é por causa dela, não conta.
    if (alerta && alerta.resultado) return;
    const campos = { saiuEm: Date.now() };
    if (alerta) {
      // Comprado por você no próprio jogo? Então o aviso também acabou em compra.
      const porVoce = Boolean(Pessoal && Pessoal.compraNoJogo({ alerta, compras: s.comprasNoJogo }));
      if (porVoce) campos.compradoNoJogo = true;
      alerta.sumiu = true;
      bus.emit('painel:sumiu', { anuncioId: ac.anuncioId, porVoce });
      resolverAviso(ac.anuncioId);
    }
    if (ac.chave !== null && ac.chave !== undefined) sw({ tipo: 'alerta:atualizar', chave: ac.chave, campos });
  }

  // A disputa do sorteio (0.8.0): o cartão mostra os nomes (só na memória da aba, como a janela do
  // jogo); o registro guarda os números e o código de quem levou.
  function registrarSorteio(anuncioId, ev) {
    const d = C.juntarSorteio(s.sorteios.get(anuncioId), ev);
    s.sorteios.set(anuncioId, d);
    while (s.sorteios.size > 100) s.sorteios.delete(s.sorteios.keys().next().value);
    const r = C.resumoDoSorteio(d);
    bus.emit('painel:sorteio', { anuncioId, ...r });
    if (r) paraPiloto({ tipo: 'sorteio', anuncioId, participantes: r.participantes || 0, ganhou: r.ganhou, perdeu: r.perdeu });
    if (d.fim && r && r.participantes > 0) {
      const k = chaveDisputa(s.alertas.get(anuncioId));
      if (k) { const ant = s.disputa.get(k); s.disputa.set(k, ant ? ant * 0.7 + r.participantes * 0.3 : r.participantes); }
    }
    const alerta = s.alertas.get(anuncioId);
    if (!alerta || !d.fim) return;
    alerta.sorteio = C.resumoParaGuardar(r);
    if (alerta.chave !== null && alerta.chave !== undefined) sw({ tipo: 'alerta:atualizar', chave: alerta.chave, campos: { sorteio: alerta.sorteio } });
  }

  // Aviso que já não dá para comprar: sai do selo do ícone e a notificação dele some.
  function resolverAviso(anuncioId) {
    sw({ tipo: 'aviso:resolvido', anuncioId });
  }

  function montarRegistro(amostra, av) {
    const item = s.catalogo.get(amostra.itemId) || { nome: `item ${amostra.itemId}` };
    return {
      anuncioId: av.candidato.id,
      itemId: amostra.itemId,
      nome: item.nome,
      preco: av.candidato.preco,
      qtdAnuncio: av.candidato.qtd,
      qtd: av.qtd,
      referencia: av.referencia.valor,
      fontes: av.referencia.fontes,
      partes: av.referencia.partes,
      proximo: av.proximo ? av.proximo.preco : null,
      desconto: av.desconto,
      lucroPorUnidade: av.lucroPorUnidade,
      lucroTotal: av.lucroTotal,
      retorno: av.retorno,
      iliquido: av.iliquido,
      poucoConfiavel: av.poucoConfiavel,
      volume7d: amostra.volume7d,
      compravelEm: av.candidato.compravelEm,
      criadoEm: av.candidato.criadoEm ?? null,
      em: Date.now(),
      resultado: null,
    };
  }

  // auto: a decisão do automático quando ele vai comprar ({ qtd }), ou null.
  async function alertar(amostra, av, auto) {
    await publicarAviso({ ...montarRegistro(amostra, av), tipo: 'aviso', automatica: Boolean(auto) }, auto);
  }

  // O que todo aviso faz (item ou pokémon): registro, cartão, compra automática e notificação.
  async function publicarAviso(alerta, auto) {
    s.alertados.add(alerta.anuncioId);
    s.alertas.set(alerta.anuncioId, alerta);
    s.ultimoAlerta = { nome: alerta.nome, preco: alerta.preco, desconto: alerta.desconto, em: alerta.em };
    const chave = await sw({ tipo: 'alerta:registrar', alerta });
    alerta.chave = chave;
    if (alerta.itemId !== null && alerta.itemId !== undefined) acompanhar(alerta);
    else if (alerta.categoria === 'pokemon') acompanharPokemon(alerta, true);
    bus.emit('painel:mostrar', { ...alerta, desvio: desvio() });
    // 1.6: o aviso mínimo na tela do jogo (o Piloto desenha: notificação curta e a bandeja).
    paraPiloto({ tipo: 'aviso', ...resumoParaPiloto(alerta), auto: Boolean(auto) });
    if (auto) iniciarCompra({ anuncioId: alerta.anuncioId, qtd: auto.qtd, auto: true });
    if (s.config.som) bipe();
    if (s.config.notificacoes) {
      const marcas = [alerta.iliquido ? 'ilíquido' : null, alerta.poucoConfiavel ? 'pouco confiável' : null].filter(Boolean);
      sw({
        tipo: 'notificar',
        anuncioId: alerta.anuncioId,
        titulo: `${alerta.nome}: ${fmtPct(alerta.desconto)} abaixo`,
        mensagem: alerta.categoria === 'pokemon'
          ? `Pokémon ${alerta.pokemon.resumo} a ${fmtN(alerta.preco)} · valor de mercado ${fmtN(alerta.referencia)} · lucro estimado ${fmtN(alerta.lucroTotal)}${auto ? ' · compra automática agendada' : ''}`
          : `${fmtN(alerta.preco)} × ${fmtN(auto ? auto.qtd : alerta.qtd)} · lucro estimado ${fmtN(auto ? auto.lucro : alerta.lucroTotal)}${marcas.length ? ` · ${marcas.join(', ')}` : ''}${auto ? ' · compra automática agendada' : ''}`,
      });
    }
    publicarEstado();
  }

  // ---- pokémon (Fase 4) --------------------------------------------------------------------------

  // A lista de anúncios (todas as espécies, ou uma) no formato do jogo; o gancho completa os
  // filtros zerados. Em Gemas é só leitura: o gancho não deixa comprar fora do ouro.
  const listarPokemon = ({ ordem, especieId = 0, pagina = 0, moeda = 'gold' }) => ({ t: 'market.listar', tipo: 'pokemon', moeda, ordem, especieId, pagina });
  // 1.12.3: com a espécie, a resposta de outra espécie não serve (o servidor pode ou não ecoar o
  // especieId; as linhas trazem o speciesId de cada anúncio).
  const casaVitrine = (ordem, pagina = 0, especieId = 0) => (d) => {
    if (d.aba !== 'vitrine' || d.ordem !== ordem || (d.pagina ?? 0) !== pagina) return false;
    if (!especieId) return true;
    if (d.especieId != null && Number(d.especieId) !== Number(especieId)) return false;
    const esp = (l) => (l && (l.speciesId ?? (l.ficha && l.ficha.speciesId))) ?? null;
    const comEspecie = Array.isArray(d.linhas) ? d.linhas.filter((l) => esp(l) != null) : [];
    return !comEspecie.length || comEspecie.some((l) => Number(esp(l)) === Number(especieId));
  };
  const moedasDePokemon = () => (s.config.pokemonGemas ? ['gold', 'orb'] : ['gold']);

  // Anúncios novos de pokémon: um market.listar "mais recentes" por moeda e por ciclo. As vendas
  // de 30 dias de uma espécie vêm da Tabela de preços e ficam guardadas por 6 h; por ciclo e por
  // moeda, no máximo uma espécie nova e uma lista de anúncios da espécie candidata.
  async function processarPokemon() {
    for (const moeda of moedasDePokemon()) {
      await esperar(pausaEntrePedidos());
      if (A.motivoDePausa(contextoDePausa())) return;
      const resp = await pedir(listarPokemon({ ordem: 'recentes', moeda }), casaVitrine('recentes'));
      if (!resp) { falha('sem resposta aos anúncios de pokémon'); return; }
      s.recuo = A.registrar(s.recuo, true);
      await processarAnunciosPokemon(resp.linhas || [], moeda);
    }
    // O aviso (ou quase aviso) de pokémon ainda está à venda? Uma lista, no máximo.
    const ac = pokemonParaConferir();
    if (ac && !A.motivoDePausa(contextoDePausa())) {
      ac.conferidoEm = Date.now();
      await esperar(pausaEntrePedidos());
      const lista = await pedir(listarPokemon({ ordem: 'baratos', especieId: ac.speciesId, moeda: ac.moeda }), casaVitrine('baratos', 0, ac.speciesId));
      if (lista) conferirSaidasPokemon(ac.speciesId, ac.moeda, lista.linhas || []);
    }
  }

  async function processarAnunciosPokemon(linhas, moeda) {
    const agora = Date.now();
    const pk = s.pokemon;
    for (const l of linhas) {
      const a = Pk.lerAnuncio(l, s.conta.id);
      if (!a || a.id === null || pk.vistos.has(a.id)) continue;
      pk.vistos.add(a.id);
      // Em ouro, shiny não (só se vende em Gemas); em Gemas, shiny entra e compara com shiny.
      if (a.meu || a.moeda !== moeda || (moeda === 'gold' && a.shiny) || !(a.preco > 0) || (a.estado && a.estado !== 'aberto') || s.alertados.has(a.id)) continue;
      // 1.34: alvos de pokémon do Manual (em ouro): P5 até o teto; nota mínima até o teto
      if (moeda === 'gold' && s.modoPiloto === 'manual' && alvoPokemon(a)) continue;
      const chave = `${moeda}:${a.speciesId ?? a.nome}`;
      const e = pk.espera.get(chave) || { nome: a.nome, speciesId: a.speciesId, moeda, anuncios: [] };
      e.anuncios.push({ ...a, vistoEm: agora });
      pk.espera.set(chave, e);
    }
    while (pk.vistos.size > MAX_VISTOS_POKEMON) pk.vistos.delete(pk.vistos.values().next().value);
    let buscouVendas = false;
    let listouEspecie = false;
    for (const [chave, e] of [...pk.espera]) {
      if (e.moeda !== moeda) continue;
      e.anuncios = e.anuncios.filter((a) => agora - a.vistoEm <= ESPERA_POKEMON_MS);
      if (!e.anuncios.length) { pk.espera.delete(chave); continue; }
      let cache = pk.vendas.get(chave);
      if (!cache || agora - cache.em > VENDAS_VALE_MS) {
        if (buscouVendas) continue;
        buscouVendas = true;
        cache = await lerVendasDaEspecie(e.nome, moeda);
        if (!cache) continue;
        pk.vendas.set(chave, cache);
      }
      pk.espera.delete(chave);
      for (const a of e.anuncios) {
        const contexto = { anuncio: a, vendas: cache.vendas, config: s.config, diaria: s.taxaDiaria, saldo: saldoLivre(), faixasOrb: s.faixasOrb };
        let av = Pk.avaliar({ ...contexto, outros: [] });
        // Candidato: confere os anúncios parecidos à venda agora (puxam a referência para baixo).
        if ((av.aviso || av.quase) && !listouEspecie && a.speciesId !== null) {
          listouEspecie = true;
          await esperar(pausaEntrePedidos());
          const lista = await pedir(listarPokemon({ ordem: 'baratos', especieId: a.speciesId, moeda }), casaVitrine('baratos', 0, a.speciesId));
          if (lista) {
            conferirSaidasPokemon(a.speciesId, moeda, lista.linhas || []);
            const outros = (lista.linhas || []).map((l) => Pk.lerAnuncio(l, s.conta.id)).filter(Boolean);
            av = Pk.avaliar({ ...contexto, outros });
          }
        }
        // Em Gemas, avaliar nunca devolve aviso: tudo vai para o registro, para análise.
        if (av.aviso && moeda === 'gold') await alertarPokemon(a, av);
        else if (av.quase && !s.quaseRegistrados.has(a.id)) await registrarQuasePokemon(a, av);
      }
    }
  }

  function alvoPokemon(a) {
    const ap = s.config.alvosPk || {};
    let regra = null;
    if (ap.p5 && ap.p5.ligado && ap.p5.teto > 0 && Number(a.potencia) === 5 && a.preco <= ap.p5.teto) regra = 'P5';
    else if (ap.nota && ap.nota.ligado && ap.nota.teto > 0 && typeof a.nota === 'number' && a.nota >= ap.nota.corte && a.preco <= ap.nota.teto) regra = `nota ${String(ap.nota.corte).replace('.', ',')}+`;
    if (!regra) return false;
    if (saldoLivre() < a.preco) return false;
    const av = { ref: { valor: null, fonte: 'alvo', n: 0 }, desconto: null, lucro: 0, ataque: null };
    const registro = { ...registroPokemon(a, av), tipo: 'aviso', automatica: true, alvo: `pk:${regra}` };
    publicarAviso(registro, { qtd: 1, lucro: 0 }).catch(erro);
    diarioPiloto(`alvo: comprando ${a.nome} Nv ${a.nivel ?? '?'} (${regra}) a ${fmtN(a.preco)}`, 'ok');
    return true;
  }

  async function lerVendasDaEspecie(nome, moeda = 'gold') {
    if (!nome) return null;
    const vendas = [];
    for (let pagina = 0; pagina < MAX_PAGINAS_VENDAS; pagina++) {
      if (pagina) await esperar(pausaEntrePedidos());
      const seq = ++s.seqTela;
      const dados = await pedir({ t: 'market.historicoGlobal', pagina, seq, tipo: 'pokemon', moeda, busca: nome.slice(0, 40) }, (d) => d.aba === 'historicoGlobal' && d.seq === seq);
      if (!dados) return pagina ? { vendas, em: Date.now() } : null;
      const linhas = (dados.linhas || []).filter((l) => l && l.tipo === 'pokemon');
      vendas.push(...linhas);
      // Para a análise: a venda com o IV de cada atributo (a ficha chega sem nick nenhum).
      const guardar = linhas.map(Pk.vendaParaGuardar).filter(Boolean);
      if (guardar.length) sw({ tipo: 'vendasPokemon:guardar', vendas: guardar });
      if (!dados.temMais) break;
    }
    return { vendas, em: Date.now() };
  }

  function registroPokemon(a, av) {
    const fontes = { anuncio: 'anuncioParecido', abaixo: 'qualidadeMenor' };
    return {
      anuncioId: a.id,
      itemId: null,
      categoria: 'pokemon',
      moeda: a.moeda,
      pokemonId: a.pokemonId,
      speciesId: a.speciesId,
      especie: a.nome,
      nome: `${a.nome} Nv ${a.nivel ?? '?'}`,
      preco: a.preco,
      qtdAnuncio: 1,
      qtd: 1,
      referencia: av.ref.valor,
      fontes: [fontes[av.ref.fonte] || 'vendasParecidas'],
      proximo: av.ref.menorAVenda ?? null,
      desconto: av.desconto,
      lucroPorUnidade: av.lucro,
      lucroTotal: av.lucro,
      retorno: a.preco > 0 ? av.lucro / a.preco : null,
      iliquido: false,
      poucoConfiavel: false,
      volume7d: null,
      compravelEm: a.compravelEm,
      criadoEm: a.criadoEm,
      em: Date.now(),
      resultado: null,
      pokemon: {
        resumo: Pk.resumo(a), nivel: a.nivel, nota: a.nota, ivTotal: a.ivTotal, potencia: a.potencia, shiny: a.shiny,
        faixaNota: Pk.nomeFaixaNota(a.nota), faixaPotencia: Pk.faixaPotencia(a.potencia),
        n: av.ref.n, p25: av.ref.p25, min: av.ref.min ?? null, max: av.ref.max ?? null, base: av.ref.base || null,
        notaAtaque: a.notaAtaque ?? null, ivUtil: Pk.ivUtil(a),
        ataqueParecidas: av.ataque ? av.ataque.mediana : null, nAtaque: av.ataque ? av.ataque.n : 0,
      },
    };
  }

  async function alertarPokemon(a, av) {
    const decisao = Pk.decidirAuto({ avaliacao: av, anuncio: a, config: configDoAutomatico(), gastoHoje: Auto.gastoDeHoje(s.gastoDia, Date.now()) + reservado((x) => x.auto), saldo: saldoLivre() });
    const auto = decisao.comprar ? { qtd: 1, lucro: av.lucro } : null;
    await publicarAviso({ ...registroPokemon(a, av), tipo: 'aviso', automatica: Boolean(auto), motivoAuto: s.config.compraAutomaticaPokemon && !auto ? decisao.motivo : null }, auto);
    if (decisao.motivo === 'teto do dia atingido') avisarTeto();
  }

  async function registrarQuasePokemon(a, av) {
    const registro = { ...registroPokemon(a, av), tipo: 'quase', motivos: av.motivos };
    s.quaseRegistrados.add(registro.anuncioId);
    registro.chave = await sw({ tipo: 'alerta:registrar', alerta: registro });
    acompanharPokemon(registro, false);
  }

  // Dois toques curtos. Sem arquivo de som e sem usar o áudio do jogo.
  // O Chrome só deixa tocar som depois que você interagiu com a página (clique ou tecla). Antes
  // disso o bipe fica calado — sem o aviso "AudioContext was not allowed to start" (1.8). Um
  // contexto só, reaproveitado.
  let gestoFeito = false;
  let audio = null;
  for (const t of ['pointerdown', 'keydown']) g.addEventListener(t, () => { gestoFeito = true; }, { capture: true, passive: true });
  function bipe() {
    if (!gestoFeito) return;
    try {
      const Ctx = g.AudioContext || g.webkitAudioContext;
      if (!Ctx) return;
      if (!audio) audio = new Ctx();
      const ctx = audio;
      if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
      const t0 = ctx.currentTime;
      for (const [i, freq] of [[0, 880], [1, 1320]]) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.frequency.value = freq;
        ganho.gain.setValueAtTime(0.0001, t0 + i * 0.18);
        ganho.gain.exponentialRampToValueAtTime(0.15, t0 + i * 0.18 + 0.02);
        ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.15);
        osc.connect(ganho).connect(ctx.destination);
        osc.start(t0 + i * 0.18);
        osc.stop(t0 + i * 0.18 + 0.16);
      }
    } catch (e) {
      erro(e);
    }
  }


  // ---- compras: fila, envio, resultado ---------------------------------------------------------

  // Várias agendadas, uma enviada por vez: o resultado do sorteio não diz de qual anúncio é.
  const aberta = (c) => c.estado.fase !== 'concluida';
  const abertas = () => [...s.compras.values()].filter(aberta);
  const estadosAbertos = () => abertas().map((c) => (c.enviando ? { ...c.estado, fase: 'enviada' } : c.estado));
  // Ouro comprometido: as abertas e a que ficou sem resposta enquanto o histórico é conferido
  // (ela pode ter comprado). Entra no saldo livre e no teto do dia.
  const comprometidas = () => [...s.compras.values()].filter((c) => !c.finalizada && !['cancelada', 'nao-enviada'].includes(c.estado.resultado));
  const reservado = (filtro = () => true) => comprometidas().filter(filtro).reduce((soma, c) => soma + c.estado.qtd * c.alerta.preco, 0);
  const saldoLivre = () => (typeof s.conta.gold === 'number' ? s.conta.gold - reservado() : null);

  function compraEmVoo() {
    return abertas().find((c) => c.enviando || C.aguardando(c.estado)) || abertas().find((c) => C.emVoo(c.estado)) || null;
  }
  function compraAguardando() {
    return abertas().find((c) => c.enviando || C.aguardando(c.estado)) || null;
  }
  // Compra aberta pelo marketComprado ("N× nome" no item; "Nome Nv 50" no pokémon). 1.12.3: só a
  // enviada SEM resposta e do mesmo nome — as que estão no sorteio se resolvem pelo mktSorteio
  // (com o id do anúncio). Antes, uma compra sua de outra coisa podia virar "ganhou" de um sorteio
  // que o radar perdeu.
  function compraPorNome(lido, descricao) {
    const desc = String(descricao || '');
    const mesmo = (c) => (lido && lido.nome ? c.alerta.nome === lido.nome : c.alerta.categoria === 'pokemon' && !!c.alerta.nome && desc.startsWith(c.alerta.nome));
    return abertas().find((c) => (c.enviando || C.aguardando(c.estado)) && mesmo(c)) || null;
  }

  // ---- disputa por item: quantos costumam entrar no sorteio (média móvel) ---------------------
  // Entra em TODO sorteio que passa nas regras; a disputa só decide a ordem quando vários anúncios
  // liberam juntos (sai antes o de maior lucro ÷ jogadores na disputa).
  const chaveDisputa = (alerta) => (alerta && alerta.itemId != null ? `i${alerta.itemId}` : alerta && alerta.speciesId != null ? `p${alerta.speciesId}` : null);
  function disputaEsperada(alerta) {
    const k = chaveDisputa(alerta);
    const v = k ? s.disputa.get(k) : null;
    return v && v > 0 ? v : 4; // sem histórico: um palpite médio
  }

  async function esperarJanelaDeCompra() {
    const limite = Date.now() + ESPERA_SILENCIO_MAX_MS;
    while (Date.now() < limite && !C.leituraPodeSair(estadosAbertos(), Date.now())) await esperar(250);
  }

  function avisarPainel(anuncioId, texto) {
    bus.emit('painel:aviso', { anuncioId, texto });
  }

  function emitirCompra(c) {
    bus.emit('painel:compra', { anuncioId: c.alerta.anuncioId, fase: c.estado.fase, resultado: c.estado.resultado, rotulo: C.rotulo(c.estado), enviarEm: c.estado.enviarEm, msg: c.estado.msg, qtd: c.estado.qtd, auto: c.auto });
    paraPiloto({ tipo: 'compra', ...resumoParaPiloto(c.alerta), fase: c.estado.fase, resultado: c.estado.resultado || null, rotulo: C.rotulo(c.estado), enviarEm: c.estado.enviarEm, qtd: c.estado.qtd, auto: c.auto });
  }

  // O resumo de um aviso que vai para a tela do Piloto (outro mundo da extensão). Só texto e números.
  function resumoParaPiloto(a) {
    return {
      anuncioId: a.anuncioId, nome: a.nome, categoria: a.categoria === 'pokemon' ? 'pokemon' : 'item',
      itemId: a.itemId ?? null, speciesId: a.speciesId ?? null, preco: a.preco, desconto: a.desconto,
      lucro: typeof a.lucroTotal === 'number' ? a.lucroTotal : null, qtd: a.qtd ?? 1,
    };
  }
  function paraPiloto(d) {
    try { document.dispatchEvent(new CustomEvent('piloto:oferta', { detail: JSON.stringify(d) })); } catch (e) { erro(e); }
  }

  // Devolve true se a compra entrou na fila.
  function iniciarCompra({ anuncioId, qtd, auto = false }) {
    const alerta = s.alertas.get(anuncioId);
    if (!alerta) return false;
    if (s.compras.has(anuncioId)) { avisarPainel(anuncioId, 'Esse anúncio já está na fila de compras.'); return false; }
    if (alerta.resultado) { avisarPainel(anuncioId, 'Esse anúncio já teve um pedido de compra.'); return false; }
    if (alerta.sumiu) { avisarPainel(anuncioId, 'Esse anúncio saiu do mercado (comprado por outro jogador ou retirado).'); return false; }
    const d = desvio();
    if (d === null) { avisarPainel(anuncioId, 'Esperando o relógio do servidor.'); return false; }
    if (!s.socketAberto) { avisarPainel(anuncioId, 'Sem conexão com o jogo.'); return false; }
    if (abertas().length >= MAX_FILA) { avisarPainel(anuncioId, 'Fila de compras cheia: espere uma terminar.'); return false; }
    let q;
    if (auto) q = Math.max(1, Math.floor(qtd));
    else {
      const maximo = Math.max(1, P.quantidadeCompravel({ qtdAnuncio: alerta.qtdAnuncio, preco: alerta.preco, saldo: saldoLivre(), gastoMaximo: s.config.gastoMaximoPorCompra }));
      q = Math.min(maximo, Math.max(1, Math.floor(Number(qtd) || alerta.qtd || 1)));
    }
    const enviarEm = Math.max(Date.now(), R.horaLocalDeEnvio(alerta.compravelEm, d, s.config.margemEnvioMs));
    alerta.resultado = 'pendente';
    const estado = C.criar({ anuncioId, preco: alerta.preco, qtd: q, enviarEm });
    const lucro = typeof alerta.lucroTotal === 'number' ? alerta.lucroTotal : typeof alerta.lucro === 'number' ? alerta.lucro : 0;
    estado.prioridade = lucro / disputaEsperada(alerta);
    const c = { alerta, auto, estado, enviando: false, antecipados: [], timerPrazo: null, rastro: [], finalizada: false };
    s.compras.set(anuncioId, c);
    emitirCompra(c);
    agendarFila();
    publicarEstado();
    return true;
  }

  function agendarFila() {
    clearTimeout(s.timerFila);
    s.timerFila = null;
    const prox = C.proximaDaFila(estadosAbertos());
    if (!prox) return;
    s.timerFila = setTimeout(enviarDaFila, Math.max(0, prox.em - Date.now()));
  }

  function enviarDaFila() {
    s.timerFila = null;
    const prox = C.proximaDaFila(estadosAbertos());
    if (!prox) return;
    // Um anúncio acabou de sair: a resposta dele não diz de quem é, então a compra espera a
    // janela dele (no máximo 3 s; o anúncio só sai sem compra marcada para os próximos 10 s).
    const v = s.revenda.emVoo;
    if (v && Date.now() - v.em < JANELA_RESPOSTA_ANUNCIO_MS) { s.timerFila = setTimeout(enviarDaFila, 250); return; }
    if (prox.em > Date.now() + 20) { agendarFila(); return; }
    enviarCompra(s.compras.get(prox.anuncioId)).catch(erro);
  }

  async function enviarCompra(c) {
    if (!c || c.estado.fase !== 'agendada' || c.enviando) return;
    if (compraAguardando()) { agendarFila(); return; }
    c.enviando = true;
    s.rastroAlvo = c;
    // `auto`: o hook passa a compra automática pelo cofre do piloto (reserva e teto do dia).
    const r = await ponte.enviar({ t: 'market.comprar', id: c.alerta.anuncioId, qtd: c.estado.qtd, preco: c.alerta.preco, moeda: 'gold', auto: c.auto === true });
    c.enviando = false;
    aplicarCompra(c, r.ok ? { tipo: 'enviado', em: r.em || Date.now() } : { tipo: 'falhaEnvio', motivo: r.motivo, em: Date.now() });
    if (!r.ok && c.auto) diarioPiloto(`radar: compra de ${c.alerta.nome || 'item'} não saiu: ${r.motivo}`, 'erro', `envio:${r.motivo}`);
    // Resposta que chegou antes de o envio voltar da ponte.
    for (const ev of c.antecipados.splice(0)) aplicarCompra(c, ev);
  }

  // Evento do servidor para a compra enviada.
  function paraCompraEmVoo(ev) {
    // Evento sem id do anúncio: é da enviada que ainda não teve resposta (só existe uma por vez).
    // As que já estão no sorteio recebem o resultado pelo mktSorteio, com o id.
    const c = compraAguardando();
    if (!c) return false;
    if (c.enviando) c.antecipados.push(ev);
    else aplicarCompra(c, ev);
    return true;
  }

  function aplicarCompra(c, ev) {
    if (!c) return;
    const antes = c.estado.fase;
    c.estado = C.aplicar(c.estado, ev);
    if (C.emVoo(c.estado)) {
      clearTimeout(c.timerPrazo);
      c.timerPrazo = setTimeout(() => aplicarCompra(c, { tipo: 'tempo', em: Date.now() }), Math.max(0, C.prazo(c.estado) - Date.now()) + 50);
    }
    emitirCompra(c);
    // 1.12.3: a enviada que entrou no sorteio já não segura a fila — a próxima sai agora, não só
    // quando esta terminar (antes, dois anúncios liberados juntos entravam um de cada vez).
    if (antes !== c.estado.fase && c.estado.fase !== 'concluida') agendarFila();
    if (c.estado.fase === 'concluida' && antes !== 'concluida') {
      clearTimeout(c.timerPrazo);
      // Cancelada ou não enviada: nada chegou ao servidor, então pode tentar de novo.
      c.alerta.resultado = ['cancelada', 'nao-enviada'].includes(c.estado.resultado) ? null : c.estado.resultado;
      if (c.alerta.resultado) resolverAviso(c.alerta.anuncioId);
      if (c.estado.resultado === 'sem-resposta') conferirNoHistorico(c).catch(erro).finally(() => finalizarCompra(c));
      else finalizarCompra(c);
      // 1.34.1 (o André viu "Não enviada: socket do jogo fechado" numa Earth Stone 100% abaixo): a
      // compra automática que não saiu porque a conexão do jogo estava caída tenta de novo sozinha
      // quando ela volta (até 3 vezes, por 3 min). Nada chegou ao servidor, então não há risco de
      // comprar em dobro; o cofre confere tudo de novo no envio.
      if (c.auto && c.estado.resultado === 'nao-enviada' && /socket|conex/i.test(String(c.estado.msg || ''))) agendarRetentativa(c);
      agendarFila();
      publicarEstado();
    }
  }

  const RETENTAR_MS = 3 * 60_000;
  const RETENTAR_MAX = 3;
  function agendarRetentativa(c) {
    const id = c.alerta.anuncioId;
    const ant = s.retentar.get(id);
    const n = (ant ? ant.n : 0) + 1;
    if (n > RETENTAR_MAX) { s.retentar.delete(id); return; }
    s.retentar.set(id, { qtd: c.estado.qtd, ate: ant ? ant.ate : Date.now() + RETENTAR_MS, n, nome: c.alerta.nome || 'item' });
    if (s.socketAberto) setTimeout(retentarCompras, 2000);
  }
  function retentarCompras() {
    if (!s.socketAberto || !s.retentar.size) return;
    for (const [id, r] of [...s.retentar]) {
      const alerta = s.alertas.get(id);
      if (Date.now() > r.ate || !alerta || alerta.sumiu || alerta.resultado || s.compras.has(id) || !s.config.compraAutomatica) { s.retentar.delete(id); continue; }
      if (iniciarCompra({ anuncioId: id, qtd: r.qtd, auto: true })) diarioPiloto(`radar: a conexão do jogo voltou — tentando de novo a compra de ${r.nome} (${r.n}ª vez)`, 'ok');
    }
  }

  // "Sem resposta": a compra pode ter acontecido mesmo assim. Uma leitura da primeira página
  // do histórico de compras, depois da janela de silêncio das outras compras.
  async function conferirNoHistorico(c) {
    await esperar(CONFERIR_HISTORICO_MS);
    const seq = ++s.seqTela;
    const dados = await pedir({ t: 'market.historicoCompras', pagina: 0, seq }, (d) => d.aba === 'historicoCompras' && d.seq === seq);
    if (!dados) { c.conferencia = 'histórico sem resposta'; return; }
    const achada = Pessoal.compraNoHistorico({ compra: { nome: c.alerta.nome, qtd: c.estado.qtd, preco: c.alerta.preco, enviadoEm: c.estado.enviadoEm, pokemonId: c.alerta.pokemonId ?? null }, linhas: dados.linhas });
    c.conferencia = achada ? 'achada no histórico' : 'não está no histórico';
    if (achada) {
      c.estado = C.confirmar(c.estado, Date.now());
      c.alerta.resultado = c.estado.resultado;
      emitirCompra(c);
    }
    bus.emit('tela:pessoal', { tipo: 'historicoCompras', dados, em: Date.now() });
    guardarPessoal('historicoCompras', dados);
  }

  function rastroDe(c) {
    const enviado = c.estado.enviadoEm;
    if (typeof enviado !== 'number') return null;
    const fim = (c.estado.concluidoEm ?? Date.now()) + 1000;
    const leituras = s.leituras.filter((x) => x.em >= enviado - RASTRO_ANTES_MS && x.em <= fim).map((x) => ({ em: x.em, radar: x.t }));
    const texto = C.resumirRastro([...c.rastro, ...leituras], enviado);
    return c.conferencia ? `${texto} · ${c.conferencia}` : texto;
  }

  function finalizarCompra(c) {
    if (c.finalizada) return;
    c.finalizada = true;
    if (s.rastroAlvo === c) s.rastroAlvo = null;
    const r = c.estado.resultado;
    const enviada = typeof c.estado.enviadoEm === 'number';
    if (c.alerta.chave !== null && c.alerta.chave !== undefined) {
      sw({ tipo: 'alerta:atualizar', chave: c.alerta.chave, campos: { resultado: r, resultadoMsg: c.estado.msg, qtdPedida: c.estado.qtd, enviadoEm: c.estado.enviadoEm, concluidoEm: c.estado.concluidoEm, automatica: c.auto, rastro: rastroDe(c) } });
    }
    // O cofre reservou o ouro no envio. Só devolve com resultado DEFINITIVO de que não comprou:
    // "sem resposta" e erro em texto solto podem ser compra que aconteceu (auditoria, caso F).
    const NAO_COMPROU = ['perdeu', 'indisponivel', 'preco-mudou', 'cedo-demais', 'anuncio-proprio', 'sem-saldo'];
    if (c.auto && enviada && NAO_COMPROU.includes(r) && ponte.estornarCofre) ponte.estornarCofre(c.alerta.anuncioId);
    // 1.33.5: a pedra comprada para o time evoluir NÃO entra na reserva de revenda — antes entrava, e a
    // Rotina (que não gasta o que está reservado) nunca evoluía: o pokémon ficava esperando e o radar
    // comprava outra a cada 30 min.
    if (C.comprou(r) && !c.alerta.pedraDoTime && !c.alerta.alvo && c.alerta.itemId !== null && c.alerta.itemId !== undefined && ponte.reservarItens) ponte.reservarItens(c.alerta.itemId, c.estado.qtd);
    // 1.36.0: o resultado da compra da pedra do time vai para o diário (e libera um pedido novo se falhou)
    if (c.alerta.pedraDoTime) {
      c.alerta.resultado = r || 'sem-resposta';
      diarioPiloto(C.comprou(r) ? `pedra: comprei 1× ${c.alerta.nome} a ${fmtN(c.alerta.preco)} de ouro — o time evolui em seguida` : `pedra: a compra de ${c.alerta.nome} não deu certo (${r || 'sem resposta'}${c.estado.msg ? `: ${String(c.estado.msg).slice(0, 60)}` : ''}) — tento de novo em 30 s`, C.comprou(r) ? 'ok' : 'aviso');
    }
    if (c.alerta.alvo) {
      const id = c.alerta.alvo;
      s.alvosPendente[id] = Math.max(0, (s.alvosPendente[id] || 0) - (c.alerta.qtdReservadaAlvo || 0));
      if (C.comprou(r)) {
        s.alvosConta = { ...(s.alvosConta || {}), [id]: ((s.alvosConta || {})[id] || 0) + c.estado.qtd };
        const st = ponte.storage(); if (st) st.set({ [CHAVE_ALVOS_CONTA]: s.alvosConta }).catch(erro);
        diarioPiloto(`alvo: comprei ${fmtN(c.estado.qtd)}× ${c.alerta.nome} a ${fmtN(c.alerta.preco)} de ouro`, 'ok');
      }
    }
    if (c.auto && C.comprou(r)) {
      s.gastoDia = Auto.somarGasto(s.gastoDia, c.estado.qtd * c.alerta.preco, Date.now());
      const st = ponte.storage();
      if (st) st.set({ [CHAVE_GASTO]: s.gastoDia }).catch(erro);
    }
    // Só as compras da automática contam: a compra com clique não desliga nada.
    if (enviada && c.auto) {
      s.falhasSeguidas = Auto.contarFalhas(s.falhasSeguidas, r);
      if (Auto.deveDesligar(s.falhasSeguidas) && s.config.compraAutomatica) {
        s.falhasSeguidas = 0;
        desligarAutomatica(`${Auto.FALHAS_PARA_DESLIGAR} compras seguidas sem resposta ou com erro do servidor`);
      }
    }
    if (C.comprou(r)) {
      const a = c.alerta;
      paraExtrato([{ id: `r:${a.anuncioId}`, em: c.estado.concluidoEm || Date.now(), tipo: 'gasto', fonte: 'mercado', origem: c.auto ? 'radar' : 'voce-radar', nome: a.nome, qtd: c.estado.qtd, valor: c.estado.qtd * a.preco, itemId: a.itemId ?? null, speciesId: a.speciesId ?? null, shiny: !!(a.pokemon && a.pokemon.shiny) }]);
    }
    if (c.auto && enviada) notificarResultado(c);
    if (C.comprou(r)) { s.revenda.registroEm = 0; s.revenda.historicoEm = 0; }
    s.compras.delete(c.alerta.anuncioId);
    agendarFila();
    publicarEstado();
  }

  function notificarResultado(c) {
    const r = c.estado.resultado;
    if (!s.config.notificacoes) return;
    const nome = c.alerta.nome;
    if (C.comprou(r)) {
      if (s.config.som) bipe();
      sw({ tipo: 'notificar', titulo: `Comprado sozinho: ${nome}`, mensagem: `${fmtN(c.estado.qtd)} × ${fmtN(c.alerta.preco)} = ${fmtN(c.estado.qtd * c.alerta.preco)} de ouro${r === 'confirmado' ? ' (confirmado no histórico)' : ''}` });
    } else {
      sw({ tipo: 'notificar', titulo: `${C.rotulo(c.estado)}: ${nome}`, mensagem: 'Compra automática. Nada foi pago.' });
    }
  }

  // 1.2.1: falhas seguidas PAUSAM a compra automática por 15 min e ela volta sozinha. Antes ela
  // se desligava de vez e ficava assim até alguém religar — e os avisos viravam botão de clique.
  const PAUSA_POR_FALHAS_MS = 15 * 60000;
  async function desligarAutomatica(motivo) {
    s.autoPausadaAte = Date.now() + PAUSA_POR_FALHAS_MS;
    const st = ponte.storage();
    if (st) await st.set({ [CHAVE_AUTO_DESLIGADA]: { em: Date.now(), ate: s.autoPausadaAte, motivo } });
    diarioPiloto(`compra automática em pausa por 15 min: ${motivo}`, 'erro');
    sw({ tipo: 'notificar', titulo: 'Compra automática em pausa (15 min)', mensagem: `${motivo}. Volta sozinha.` });
  }
  const autoEmPausa = () => typeof s.autoPausadaAte === 'number' && Date.now() < s.autoPausadaAte;
  function configDoAutomatico() {
    const c = autoEmPausa() ? { ...s.config, compraAutomatica: false, compraAutomaticaPokemon: false } : s.config;
    // 1.12.3: o "livre" do cofre chega a cada 5 s e não sabe das compras que o radar já pôs na
    // fila. Desconta as automáticas abertas (pode sobrar um pouco de folga; nunca falta).
    const livre = s.ctxPiloto && Number.isFinite(s.ctxPiloto.livre) ? s.ctxPiloto.livre : null;
    if (c.calibrada && livre !== null) {
      const resto = Math.max(1, Math.floor(livre - reservado((x) => x.auto)));
      return { ...c, gastoMaximoAuto: resto, gastoMaximoPokemon: resto };
    }
    return c;
  }
  // "Últimas ações" no Resumo do Piloto.
  const ultimoDiario = new Map();
  // 1.35: o Extrato do Piloto (o outro mundo) guarda as compras e vendas do Mercado.
  function paraExtrato(lista) {
    if (!lista || !lista.length) return;
    try { document.dispatchEvent(new CustomEvent('piloto:extrato', { detail: JSON.stringify({ lista }) })); } catch (e) { erro(e); }
  }
  function linhasParaExtrato(linhas, tipo) {
    const porNome = new Map([...s.catalogo.values()].map((i) => [String(i.nome).toLowerCase(), i.id]));
    const brutas = new Map((linhas || []).filter(Boolean).map((l) => [l.id, l]));
    return Pessoal.normalizarHistorico(linhas || [], tipo).filter((l) => l.moeda === 'gold' && l.em && (tipo === 'venda' ? (l.liquido ?? l.bruto) : l.bruto) > 0).map((l) => {
      const b = brutas.get(l.id) || {};
      const f = b.ficha || {};
      const pk = l.tipoItem === 'pokemon' || f.speciesId != null;
      return {
        id: `${tipo === 'venda' ? 'hv' : 'hc'}:${l.id}`, em: l.em, tipo: tipo === 'venda' ? 'entrada' : 'gasto', fonte: 'mercado', origem: 'mercado',
        nome: l.nome, qtd: l.qtd, valor: tipo === 'venda' ? (l.liquido ?? l.bruto) : l.bruto,
        itemId: pk ? null : (b.itemId ?? porNome.get(String(l.nome).toLowerCase()) ?? null), speciesId: pk ? (f.speciesId ?? b.speciesId ?? null) : null, shiny: !!(f.shiny || b.shiny),
      };
    });
  }

  function diarioPiloto(txt, tipo = 'ok', chave = null) {
    if (chave) {
      const ant = ultimoDiario.get(chave);
      if (ant && Date.now() - ant < 10 * 60000) return; // o mesmo motivo, no máximo a cada 10 min
      ultimoDiario.set(chave, Date.now());
    }
    document.dispatchEvent(new CustomEvent('piloto:radar-diario', { detail: JSON.stringify({ t: Date.now(), txt, tipo }) }));
  }

  function avisarTeto() {
    const dia = Auto.diaLocal(Date.now());
    if (s.tetoAvisado === dia) return;
    s.tetoAvisado = dia;
    if (!s.config.notificacoes) return;
    sw({ tipo: 'notificar', titulo: 'Compra automática: teto do dia', mensagem: `Gastou ${fmtN(Auto.gastoDeHoje(s.gastoDia, Date.now()))} de ${fmtN(s.config.gastoMaximoDia)} hoje. Volta à meia-noite; os avisos continuam.` });
  }

  function cancelarCompra(anuncioId) {
    const c = s.compras.get(anuncioId);
    if (!c || c.estado.fase !== 'agendada' || c.enviando) return;
    aplicarCompra(c, { tipo: 'cancelar', em: Date.now() });
  }

  function cancelarTodas(filtro = () => true) {
    for (const c of abertas().filter(filtro)) cancelarCompra(c.alerta.anuncioId);
  }

  // ---- revenda (Fase 3) -----------------------------------------------------------------------

  // As sugestões da aba Revenda, com o que o radar já tem: inventário (estado.items), livros dos
  // itens, meus anúncios, compras do registro e de "Suas compras". Nada é anunciado sem clique.
  let revendaAgendada = null;
  // 1.27: as pedras pedidas para o time evoluir (ver 'piloto:pedra-precisa' mais abaixo)
  const pedrasDoTime = new Map(); // itemId -> { em, nome, para }
  const PEDRA_FORA_DA_REVENDA_MS = 2 * 3_600_000;
  const pedraGuardada = (itemId) => { const p = pedrasDoTime.get(Number(itemId)); return !!p && Date.now() - p.em < PEDRA_FORA_DA_REVENDA_MS; };
  function calcularSugestoes({ auto = false } = {}) {
    const v = s.ultimaVitrine;
    const resumo = {};
    for (const a of (v && v.amostras) || []) resumo[a.itemId] = { media7d: a.mediaGold, volume7d: a.volume7d };
    const meus = Pessoal.normalizarMeus((s.revenda.meus && s.revenda.meus.linhas) || [], agoraServidor());
    const compras = Rv.juntarCompras(s.revenda.registro || [], (s.revenda.historico && s.revenda.historico.linhas) || []);
    // 1.27: a pedra comprada para o time evoluir não entra na revenda
    const inventario = auto ? Rv.inventarioRevendavel(s.conta.itens || {}, s.catalogo, { manuais: s.revenda.manuais, pedrasDoTime: pedrasDoTimeAgora() }) : (s.conta.itens || {});
    const sugestoes = Rv.montarSugestoes({ inventario, catalogo: s.catalogo, config: s.config, livros: s.livros, meus, compras, resumo, meuId: s.conta.id, ocultos: s.revenda.ocultos, agora: agoraServidor() }).filter((sg) => !pedraGuardada(sg.itemId));
    return { meus, sugestoes };
  }

  // ---- revenda automática de itens (1.2) ------------------------------------------------------
  //
  // Enquanto o jogo roda, a cada 2 min no fim do ciclo do radar: relê o que a aba Revenda lê e
  // passa por TODOS os cartões com algo a fazer, um de cada vez:
  //   - anunciar o item que você tem e ainda não está à venda;
  //   - baixar o preço quando alguém anunciou abaixo do seu;
  //   - subir o preço quando você ficou muito abaixo do próximo anúncio (dinheiro na mesa).
  // Antes de cada ação relê o livro do item (preço de agora, não o de minutos atrás). Quando o jogo
  // segura (30 min para mudar o preço, 30 min para anunciar de novo depois de vender, retenção de
  // 2 min), anota a hora e tenta de novo quando ela passar. O preço é o do cartão: 1 abaixo do
  // menor anúncio de outro jogador, nunca abaixo do piso (custo + 15%). Pokémon fica de fora.
  const REVENDA_AUTO_MS = 2 * 60000;
  const LIVRO_FRESCO_MS = 60000;
  const MAX_ACOES_POR_VOLTA = 6;
  const PAUSA_ENTRE_ACOES_MS = 4000;

  function emEspera(itemId) {
    const ate = s.revenda.esperaAte.get(itemId);
    if (!ate) return false;
    if (Date.now() >= ate) { s.revenda.esperaAte.delete(itemId); return false; }
    return true;
  }
  function segurar(itemId, ms) {
    s.revenda.esperaAte.set(itemId, Date.now() + Math.max(30000, ms) + 15000);
  }

  // O cartão passa nas regras do automático?
  function cartaoAutomatico(sg) {
    if (!(sg.acao === 'anunciar' || sg.acao === 'mudar-preco')) return false;
    if (emEspera(sg.itemId)) return false;
    if (!(typeof sg.preco === 'number' && sg.preco >= sg.piso)) return false;
    if (s.config.revendaSoDoRadar && !(sg.custo && sg.custo.doRadar)) return false;
    // Anunciar não custa nada (item não paga diária) e o piso já garante custo + 15%: basta ter
    // lucro. Só com as vagas apertando (15 de 20 abertas) o lucro mínimo da revenda entra, para os
    // últimos anúncios irem para o que rende mais. Mudar o preço: o piso basta.
    if (sg.acao === 'anunciar') {
      if (!(typeof sg.lucro === 'number' && sg.lucro > 0)) return false;
      if (abertosAgora >= VAGAS_APERTADAS && sg.lucro < s.config.lucroMinimoRevenda) return false;
    }
    return true;
  }
  const VAGAS_APERTADAS = 15;
  let abertosAgora = 0;

  async function esperarVoo(limiteMs = ESPERA_ANUNCIO_MS + 4000) {
    const fim = Date.now() + limiteMs;
    while ((s.revenda.emVoo || s.revenda.conferindo) && Date.now() < fim) await esperar(250);
  }

  async function revendaAutomatica() {
    if (!s.config.revendaAutomatica || s.parado || !s.socketAberto || s.revenda.autoRodando) return;
    if (!s.revenda.manuaisProntos) return; // 1.33.9: sem o livro dos comprados à mão, não revende nada
    if (Date.now() - (s.ultimaRevendaAuto || 0) < REVENDA_AUTO_MS) return;
    s.ultimaRevendaAuto = Date.now();
    s.revenda.autoRodando = true;
    try {
      await pedirRevenda({});
      if (!s.revenda.manuaisEm) { try { atualizarLivroManual(); } catch (e) { erro(e); } }
      if (!s.revenda.manuaisEm) return; // ainda sem "Suas compras" lido: não arrisca
      // Anúncio com espera conhecida (editavelEm): anota para não tentar antes da hora.
      for (const sg of calcularSugestoes({ auto: true }).sugestoes) {
        if (sg.acao === 'espera-editar' && typeof sg.esperaEditarMs === 'number') segurar(sg.itemId, sg.esperaEditarMs);
      }
      const feitos = new Set();
      for (let n = 0; n < MAX_ACOES_POR_VOLTA; n++) {
        if (!s.config.revendaAutomatica || !s.socketAberto) break;
        const atual = calcularSugestoes({ auto: true });
        abertosAgora = atual.meus.filter((m) => m && (m.estado === null || m.estado === 'aberto')).length;
        const candidato = atual.sugestoes.find((sg) => !feitos.has(sg.itemId) && cartaoAutomatico(sg));
        if (!candidato) break;
        feitos.add(candidato.itemId);
        // O preço de agora: relê o livro do item se tiver mais de 1 min.
        const livro = s.livros.get(candidato.itemId);
        if (!livro || Date.now() - livro.em > LIVRO_FRESCO_MS) {
          await esperar(pausaEntrePedidos());
          const dados = await pedir({ t: 'market.item', itemId: candidato.itemId, moeda: 'gold' }, casaItem(candidato.itemId));
          if (dados) s.livros.set(candidato.itemId, { linhas: dados.linhas || [], em: Date.now() });
        }
        const alvo = calcularSugestoes({ auto: true }).sugestoes.find((sg) => sg.itemId === candidato.itemId);
        if (!alvo || !cartaoAutomatico(alvo)) continue;
        const tipo = alvo.acao === 'anunciar' ? 'criar' : 'editar';
        await acaoDeRevenda({ tipo, itemId: alvo.itemId, qtd: alvo.qtdCartao, preco: alvo.preco, anuncioId: alvo.meuAnuncio ? alvo.meuAnuncio.id : undefined, auto: true });
        await esperarVoo();
        const r = s.revenda.acoes.get(alvo.itemId);
        if (r && r.fase === 'ok') {
          const subiu = tipo === 'editar' && alvo.meuAnuncio && alvo.preco > alvo.meuAnuncio.preco;
          const texto = tipo === 'criar' ? `Anunciei ${fmtN(alvo.qtdCartao)} × ${fmtN(alvo.preco)}` : `${subiu ? 'Subi' : 'Baixei'} o preço para ${fmtN(alvo.preco)}`;
          // Vai para "Últimas ações" no Resumo do Piloto.
          document.dispatchEvent(new CustomEvent('piloto:radar-diario', { detail: JSON.stringify({ t: Date.now(), txt: `revenda: ${alvo.nome}: ${texto}`, tipo: 'ok' }) }));
          if (s.config.notificacoes) sw({ tipo: 'notificar', titulo: `Revenda: ${alvo.nome}`, mensagem: `${texto} · lucro estimado ${fmtN(alvo.lucro)}` });
          // Item editado só muda de novo em 30 min.
          if (tipo === 'editar') segurar(alvo.itemId, 30 * 60000);
        } else if (!s.revenda.esperaAte.has(alvo.itemId)) {
          // Falhou sem dizer quanto esperar: tenta de novo na próxima volta longa.
          segurar(alvo.itemId, 5 * 60000);
        }
        await esperar(PAUSA_ENTRE_ACOES_MS);
      }
    } finally {
      s.revenda.autoRodando = false;
      emitirRevenda();
    }
  }

  function emitirRevenda() {
    if (revendaAgendada) return;
    revendaAgendada = setTimeout(() => {
      revendaAgendada = null;
      try {
        const { meus, sugestoes } = calcularSugestoes();
        bus.emit('tela:revenda', {
          sugestoes,
          acoes: Object.fromEntries(s.revenda.acoes),
          anuncios: s.revenda.meus ? meus.filter((m) => !m.estado || m.estado === 'aberto').length : null,
          max: Rv.MAX_ANUNCIOS,
          inventarioOk: Boolean(s.conta.itens),
          lendo: s.revenda.lendo,
          em: Date.now(),
        });
      } catch (e) {
        erro(e);
      }
    }, 150);
  }

  // ---- lucro realizado (0.9.0) -------------------------------------------------------------------

  // O seu histórico de vendas (página mais recente) e os seus anúncios, a cada 10 min no ciclo: é
  // o que o lucro realizado usa. Dois pedidos a cada 10 min, pela janela de silêncio.
  const VENDAS_DE_FUNDO_MS = 10 * 60000;
  async function lerVendasDeFundo() {
    const agora = Date.now();
    if (agora - (s.ultimoHistoricoVendas || 0) < VENDAS_DE_FUNDO_MS) return;
    s.ultimoHistoricoVendas = agora;
    await esperar(pausaEntrePedidos());
    const seq = ++s.seqTela;
    const dados = await pedir({ t: 'market.historico', pagina: 0, seq }, (d) => d.aba === 'historico' && d.seq === seq);
    if (dados) guardarPessoal('historico', dados);
    if (agora - s.revenda.meusEm > VENDAS_DE_FUNDO_MS) {
      await esperar(pausaEntrePedidos());
      await lerMeus();
    }
  }

  // ---- revenda de pokémon (0.7.0) ---------------------------------------------------------------

  const CALCULO_PK_VALE_MS = 10 * 60000; // os anúncios da espécie mudam rápido: 10 min
  const MAX_CALCULOS_PK_POR_ABERTURA = 4;
  let revendaPkAgendada = null;

  function emitirRevendaPk() {
    if (revendaPkAgendada) return;
    revendaPkAgendada = setTimeout(() => {
      revendaPkAgendada = null;
      try {
        const r = s.revenda.pk;
        const { cartoes, ocultos } = RvPk.montarCartoes({
          pokemons: r.lista, activeId: r.activeId, meus: (s.revenda.meus && s.revenda.meus.linhas) || [], meuId: s.conta.id,
          calculos: r.calculos, registro: s.revenda.registro || [], compras: (s.revenda.historico && s.revenda.historico.linhas) || [],
        });
        bus.emit('tela:revenda-pk', {
          cartoes, ocultos, acoes: Object.fromEntries(r.acoes), recebeu: r.recebidoEm > 0, calculando: r.calculando ? [...r.fila] : [],
          diaria: s.taxaDiaria, faixasOrb: s.faixasOrb, saldo: s.conta.gold, em: Date.now(),
        });
      } catch (e) {
        erro(e);
      }
    }, 150);
  }

  function marcarAcaoPk(pokemonId, fase, texto) {
    s.revenda.pk.acoes.set(pokemonId, { fase, texto, em: Date.now() });
    emitirRevendaPk();
  }

  // O pokémon pelo id: o da sua conta, ou o do seu anúncio aberto.
  function fichaPk(pokemonId) {
    const k = s.revenda.pk.lista.find((x) => x.id === pokemonId);
    if (k) return RvPk.fichaDe(k);
    const l = ((s.revenda.meus && s.revenda.meus.linhas) || []).find((x) => x && x.tipo === 'pokemon' && Number(x.pokemonId) === pokemonId);
    const a = l ? Pk.lerAnuncio(l, s.conta.id) : null;
    return a ? { ...a, moeda: a.moeda || 'gold' } : null;
  }

  function pedirCalculoPk(pokemonId) {
    const r = s.revenda.pk;
    if (!Number.isInteger(pokemonId) || r.fila.includes(pokemonId)) return;
    r.fila.push(pokemonId);
    processarFilaPk().catch(erro);
  }

  async function processarFilaPk() {
    const r = s.revenda.pk;
    if (r.calculando) return;
    r.calculando = true;
    emitirRevendaPk();
    try {
      while (r.fila.length) {
        await calcularPk(r.fila[0]);
        r.fila.shift();
        emitirRevendaPk();
      }
    } finally {
      r.calculando = false;
      emitirRevendaPk();
    }
  }

  // As vendas da espécie (as mesmas que o radar guarda por 6 h) e os anúncios dela à venda agora.
  // O cálculo vale para todos os seus pokémon da mesma espécie e moeda.
  async function calcularPk(pokemonId) {
    const ficha = fichaPk(pokemonId);
    if (!ficha || ficha.speciesId === null || !ficha.nome) return;
    if (!s.socketAberto) { marcarAcaoPk(pokemonId, 'erro', 'Sem conexão com o jogo.'); return; }
    const moeda = ficha.moeda;
    const chave = `${moeda}:${ficha.speciesId}`;
    let cache = s.pokemon.vendas.get(chave);
    if (!cache || Date.now() - cache.em > VENDAS_VALE_MS) {
      await esperar(pausaEntrePedidos());
      cache = await lerVendasDaEspecie(ficha.nome, moeda);
      if (cache) s.pokemon.vendas.set(chave, cache);
    }
    await esperar(pausaEntrePedidos());
    const lista = await pedir(listarPokemon({ ordem: 'baratos', especieId: ficha.speciesId, moeda }), casaVitrine('baratos', 0, ficha.speciesId));
    if (lista) conferirSaidasPokemon(ficha.speciesId, moeda, lista.linhas || []);
    if (!cache && !lista) { marcarAcaoPk(pokemonId, 'erro', 'O servidor não respondeu: tente de novo.'); return; }
    const calculo = { em: Date.now(), vendas: cache ? cache.vendas : [], outros: lista ? (lista.linhas || []).map((l) => Pk.lerAnuncio(l, s.conta.id)).filter(Boolean) : [] };
    const mesmos = [pokemonId];
    for (const k of s.revenda.pk.lista) if (k.speciesId === ficha.speciesId && Boolean(k.shiny) === (moeda === 'orb')) mesmos.push(k.id);
    for (const l of (s.revenda.meus && s.revenda.meus.linhas) || []) if (l && l.tipo === 'pokemon' && l.ficha && l.ficha.speciesId === ficha.speciesId && (l.moeda || 'gold') === moeda) mesmos.push(Number(l.pokemonId));
    for (const id of mesmos) s.revenda.pk.calculos.set(id, calculo);
  }

  // Ao abrir a Revenda: o preço sai sozinho para os seus anúncios abertos e para os pokémon que o
  // radar comprou (até 4 espécies por abertura); os outros, com um clique no cartão.
  function calcularPkSozinho(forcar) {
    const r = s.revenda.pk;
    const agora = Date.now();
    const velho = (id) => forcar || !r.calculos.has(id) || agora - r.calculos.get(id).em > CALCULO_PK_VALE_MS;
    const especies = new Set();
    const ids = [];
    const registro = s.revenda.registro || [];
    const compras = (s.revenda.historico && s.revenda.historico.linhas) || [];
    const candidatos = [
      ...((s.revenda.meus && s.revenda.meus.linhas) || []).filter((l) => l && l.tipo === 'pokemon' && (!l.estado || l.estado === 'aberto')).map((l) => ({ id: Number(l.pokemonId), especie: `${l.moeda || 'gold'}:${l.ficha && l.ficha.speciesId}` })),
      ...r.lista.filter((k) => RvPk.custoDe(k.id, { registro, compras })?.fonte === 'radar').map((k) => ({ id: k.id, especie: `${k.shiny ? 'orb' : 'gold'}:${k.speciesId}` })),
    ];
    for (const c of candidatos) {
      if (!velho(c.id) || especies.has(c.especie)) continue;
      if (especies.size >= MAX_CALCULOS_PK_POR_ABERTURA) break;
      especies.add(c.especie);
      ids.push(c.id);
    }
    for (const id of ids) pedirCalculoPk(id);
  }

  // ---- anúncio automático de pokémon (1.21) --------------------------------------------------
  // Pedido do André: o pokémon que não serve para ele vai sozinho ao Mercado, como os itens. Quem
  // pode ir quem diz é o Piloto (src/piloto/guarda.js): sem a lista fresca dele, nada é anunciado.
  // Uma ação por volta (a cada 3 min), até 3 espécies calculadas por volta, só em ouro.
  const REVENDA_PK_AUTO_MS = 3 * 60000;
  const GUARDA_VALE_MS = 2 * 60000;
  const MAX_CALCULOS_PK_AUTO = 3;
  s.pkGuardados = null;
  s.revenda.pkEspera = new Map(); // pokemonId -> não tenta antes de
  // ---- 1.27: a pedra que falta para um pokémon do time evoluir (pedido do André) ---------------
  // A Rotina (mundo MAIN) avisa 'piloto:pedra-precisa'. Aqui: lê o livro do item em ouro, pega o
  // anúncio mais barato que não é seu e compra UMA, pela fila de compras de sempre, como compra
  // automática — o gancho passa pelo cofre (reserva, teto do dia) e só aceita ouro. A pedra pedida
  // fica fora da revenda automática por 2 h (para não ser anunciada antes de evoluir).
  document.addEventListener('piloto:pedra-precisa', (ev) => {
    let d;
    try { d = JSON.parse(ev.detail); } catch { return; }
    const itemId = Number(d && d.itemId);
    if (!Number.isInteger(itemId) || itemId < 1) return;
    const ant = pedrasDoTime.get(itemId);
    // 1.36.0: aceita pedido novo (era 1 a cada 25 min) — a Rotina segura por pokémon; aqui só não compra
    // duas vezes ao mesmo tempo a mesma pedra
    if (ant && Date.now() - ant.em < 30_000) return;
    if ([...s.alertas.values()].some((a) => a && a.pedraDoTime && a.itemId === itemId && !a.resultado && Date.now() - (a.em || 0) < 10 * 60_000)) return;
    const nome = String(d.nome || 'pedra').slice(0, 40);
    const para = String(d.para || '').slice(0, 80);
    pedrasDoTime.set(itemId, { em: Date.now(), nome, para });
    comprarPedraDoTime(itemId, nome, para).catch(erro);
  });
  const pedraAnunciosUsados = new Set();
  async function comprarPedraDoTime(itemId, nome, para) {
    if (!s.socketAberto) { diarioPiloto(`pedra: sem conexão com o jogo para comprar ${nome}`, 'aviso'); return; }
    const dados = await pedirPrioritario({ t: 'market.item', itemId, moeda: 'gold' }, casaItem(itemId));
    if (!dados) { diarioPiloto(`pedra: o Mercado não respondeu (${nome})`, 'aviso'); return; }
    s.livros.set(itemId, { linhas: dados.linhas || [], em: Date.now() });
    // 1.36.0: o gancho só deixa UMA compra por anúncio em cada abertura da página (trava contra compra
    // dupla). A segunda pedra do mesmo vendedor era recusada e o time nunca evoluía: pula o anúncio já
    // usado e vai no próximo mais barato.
    const usado = (l) => pedraAnunciosUsados.has(l.id) || !!(s.alertas.get(l.id) && s.alertas.get(l.id).resultado);
    const l = P.escolherCandidato((dados.linhas || []).filter((x) => x && !usado(x)), s.conta.id);
    if (!l || !Number.isInteger(l.id)) { diarioPiloto(`pedra: ninguém vende ${nome} em ouro agora — tento de novo em 2 min`, 'aviso'); return; }
    if (s.compras.has(l.id)) return;
    const alerta = { anuncioId: l.id, itemId, nome, preco: l.preco, qtdAnuncio: l.qtd ?? 1, qtd: 1, compravelEm: typeof l.compravelEm === 'number' ? l.compravelEm : 0, criadoEm: l.criadoEm ?? null, lucroTotal: 0, pedraDoTime: true, em: Date.now(), resultado: null };
    s.alertas.set(l.id, alerta);
    const ok = iniciarCompra({ anuncioId: l.id, qtd: 1, auto: true });
    if (ok) pedraAnunciosUsados.add(l.id);
    diarioPiloto(ok ? `pedra: comprando 1× ${nome} por ${fmtN(l.preco)} de ouro${para ? ` para ${para}` : ''}` : `pedra: a compra de ${nome} não entrou na fila`, ok ? 'ok' : 'aviso');
  }

  document.addEventListener('piloto:pk-guardados', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      s.pkGuardados = d && d.pronto === true && Array.isArray(d.ids) ? { ids: new Set(d.ids.map(Number)), em: Date.now() } : null;
      s.pkGuardaMotivo = d && !d.pronto ? String(d.motivo || '') : '';
    } catch (e) { erro(e); }
  });
  const emEsperaPk = (id) => (s.revenda.pkEspera.get(id) || 0) > Date.now();
  const segurarPk = (id, ms) => s.revenda.pkEspera.set(id, Date.now() + ms);
  function cartoesPk() {
    const r = s.revenda.pk;
    return RvPk.montarCartoes({
      pokemons: r.lista, activeId: r.activeId, meus: (s.revenda.meus && s.revenda.meus.linhas) || [], meuId: s.conta.id,
      calculos: r.calculos, registro: s.revenda.registro || [], compras: (s.revenda.historico && s.revenda.historico.linhas) || [],
    }).cartoes;
  }
  async function revendaPkAutomatica() {
    if (!s.config.revendaAutomatica || s.parado || !s.socketAberto || s.revenda.pkAutoRodando) return;
    if (Date.now() - (s.ultimaRevendaPkAuto || 0) < REVENDA_PK_AUTO_MS) return;
    const g = s.pkGuardados;
    if (!g || Date.now() - g.em > GUARDA_VALE_MS) return;
    if (!s.revenda.pk.recebidoEm) return;
    s.ultimaRevendaPkAuto = Date.now();
    s.revenda.pkAutoRodando = true;
    try {
      if (!s.revenda.meus || Date.now() - (s.revenda.meusEm || 0) > 5 * 60000) { await esperar(pausaEntrePedidos()); await lerMeus(); }
      const abertos = ((s.revenda.meus && s.revenda.meus.linhas) || []).filter((l) => l && (!l.estado || l.estado === 'aberto')).length;
      const vagas = abertos < Rv.MAX_ANUNCIOS - 2;
      const manuaisPk = new Set(((s.revenda.manuais && s.revenda.manuais.pokemons) || []).map(Number));
      if (s.revenda.manuaisProntos && !s.revenda.manuaisEm) { await pedirRevenda({}); try { atualizarLivroManual(); } catch (e) { erro(e); } }
      if (!s.revenda.manuaisProntos || !s.revenda.manuaisEm) return; // 1.33.9: sem o livro, não anuncia
      const pode = (c) => c.ficha && c.ficha.moeda === 'gold' && !c.ficha.shiny && !emEsperaPk(c.pokemonId) && !manuaisPk.has(Number(c.pokemonId)) && !(c.custo && c.custo.fonte === 'jogo')
        && (c.grupo === 'mudar' || (vagas && !g.ids.has(c.pokemonId)));
      // Mudar o preço primeiro (já está à venda); depois os comprados pelo radar e a maior nota.
      const fila = cartoesPk().filter(pode).sort((x, y) => Number(y.grupo === 'mudar') - Number(x.grupo === 'mudar'));
      let calculos = 0;
      for (const c of fila) {
        if (!s.config.revendaAutomatica || !s.socketAberto) break;
        const r = s.revenda.pk;
        const velho = !r.calculos.has(c.pokemonId) || Date.now() - r.calculos.get(c.pokemonId).em > CALCULO_PK_VALE_MS;
        if (velho) {
          if (calculos >= MAX_CALCULOS_PK_AUTO) break;
          calculos++;
          await calcularPk(c.pokemonId);
          emitirRevendaPk();
        }
        // De novo, com o cálculo e a lista do Piloto de agora.
        const alvo = cartoesPk().find((x) => x.chave === c.chave);
        if (!alvo || (alvo.grupo === 'anunciar' && (!s.pkGuardados || s.pkGuardados.ids.has(alvo.pokemonId)))) continue;
        const d = RvPk.decidirAutoPk(alvo, { diaria: s.taxaDiaria, minLiquido: s.config.lucroMinimoRevenda || 0 });
        if (!d.ok) { segurarPk(alvo.pokemonId, (d.motivo === 'já é o mais barato' ? 15 : 60) * 60000); continue; }
        const nome = `${alvo.ficha.nome || 'pokémon'} Nv ${alvo.ficha.nivel ?? '?'}`;
        if (alvo.grupo === 'mudar') await mudarPrecoPk({ anuncioId: alvo.anuncioId, pokemonId: alvo.pokemonId, preco: d.preco });
        else await anunciarPk({ pokemonId: alvo.pokemonId, preco: d.preco, dias: d.dias, auto: true });
        await esperarVoo();
        const res = r.acoes.get(alvo.pokemonId);
        if (res && res.fase === 'ok') {
          const texto = alvo.grupo === 'mudar' ? `baixei o preço para ${fmtN(d.preco)}` : `anunciei por ${fmtN(d.preco)} (1 dia)`;
          diarioPiloto(`revenda: ${nome}: ${texto} · líquido ${fmtN(d.conta.liquido)}`, 'ok');
          if (s.config.notificacoes) sw({ tipo: 'notificar', titulo: `Revenda: ${nome}`, mensagem: `${texto} · líquido estimado ${fmtN(d.conta.liquido)}` });
          segurarPk(alvo.pokemonId, 30 * 60000);
        } else {
          diarioPiloto(`revenda: ${nome}: não anunciei — ${res ? res.texto : 'sem resposta'}`, 'aviso', `pk:${alvo.pokemonId}`);
          segurarPk(alvo.pokemonId, 60 * 60000);
        }
        break; // uma ação por volta
      }
    } finally {
      s.revenda.pkAutoRodando = false;
      emitirRevendaPk();
    }
  }

  // Um clique no cartão: um único market.criar de pokémon, com os dias da diária.
  async function anunciarPk({ pokemonId, preco, dias, auto = false }) {
    const r = s.revenda.pk;
    const k = r.lista.find((x) => x.id === pokemonId);
    const ficha = k ? RvPk.fichaDe(k) : null;
    if (!k || RvPk.motivoNaoAnunciavel(k, ficha, r.activeId)) { marcarAcaoPk(pokemonId, 'erro', 'Este pokémon não pode ser anunciado agora.'); return; }
    if (anuncioEmVoo()) { marcarAcaoPk(pokemonId, 'erro', 'Espere a resposta do anúncio anterior.'); return; }
    if (!s.socketAberto) { marcarAcaoPk(pokemonId, 'erro', 'Sem conexão com o jogo.'); return; }
    const p = Math.floor(Number(preco));
    const d = Math.floor(Number(dias));
    if (!(p >= (ficha.moeda === 'gold' ? RvPk.PRECO_MINIMO : 1))) { marcarAcaoPk(pokemonId, 'erro', `Preço mínimo: ${RvPk.PRECO_MINIMO}.`); return; }
    if (!(d >= 1 && d <= 30)) { marcarAcaoPk(pokemonId, 'erro', 'Escolha de 1 a 30 dias.'); return; }
    const diaria = s.taxaDiaria * d;
    if (typeof s.conta.gold === 'number' && s.conta.gold < diaria) { marcarAcaoPk(pokemonId, 'erro', `A diária de ${d} dia${d > 1 ? 's' : ''} é ${fmtN(diaria)}: o saldo não paga.`); return; }
    marcarAcaoPk(pokemonId, 'enviando', 'Enviando…');
    await esperarJanelaDeAnuncio();
    const voo = { pokemonId, nome: ficha.nome, tipo: 'criar-pk', em: Date.now(), preco: p, dias: d };
    s.revenda.emVoo = voo;
    // `auto` (1.21): o anúncio sem clique paga a diária pelo cofre do Piloto (reserva e teto do dia).
    const resp = await ponte.enviar({ t: 'market.criar', tipo: 'pokemon', pokemonId, qtd: 1, preco: p, moeda: ficha.moeda, dias: d, auto: auto === true });
    if (!resp.ok) { s.revenda.emVoo = null; marcarAcaoPk(pokemonId, 'erro', `Não enviado: ${resp.motivo}`); return; }
    voo.em = resp.em || Date.now();
    voo.timer = setTimeout(() => conferirAnuncio(voo).catch(erro), ESPERA_ANUNCIO_MS);
  }

  async function mudarPrecoPk({ anuncioId, pokemonId, preco }) {
    const l = ((s.revenda.meus && s.revenda.meus.linhas) || []).find((x) => x && x.id === anuncioId && x.tipo === 'pokemon');
    if (!l) { marcarAcaoPk(pokemonId, 'erro', 'O anúncio não está mais em Meus anúncios.'); return; }
    if (anuncioEmVoo()) { marcarAcaoPk(pokemonId, 'erro', 'Espere a resposta do anúncio anterior.'); return; }
    if (!s.socketAberto) { marcarAcaoPk(pokemonId, 'erro', 'Sem conexão com o jogo.'); return; }
    const agoraSv = agoraServidor();
    if (typeof l.compravelEm === 'number' && typeof agoraSv === 'number' && agoraSv < l.compravelEm) { marcarAcaoPk(pokemonId, 'erro', 'O anúncio ainda está na retenção de 2 min: espere para mudar o preço.'); return; }
    const moeda = l.moeda || 'gold';
    const p = Math.floor(Number(preco));
    if (!(p >= (moeda === 'gold' ? RvPk.PRECO_MINIMO : 1))) { marcarAcaoPk(pokemonId, 'erro', `Preço mínimo: ${RvPk.PRECO_MINIMO}.`); return; }
    marcarAcaoPk(pokemonId, 'enviando', 'Enviando…');
    await esperarJanelaDeAnuncio();
    const voo = { pokemonId, anuncioId, tipo: 'editar-pk', em: Date.now(), preco: p };
    s.revenda.emVoo = voo;
    const resp = await ponte.enviar({ t: 'market.editar', id: anuncioId, preco: p, moeda });
    if (!resp.ok) { s.revenda.emVoo = null; marcarAcaoPk(pokemonId, 'erro', `Não enviado: ${resp.motivo}`); return; }
    voo.em = resp.em || Date.now();
    voo.timer = setTimeout(() => conferirAnuncio(voo).catch(erro), JANELA_RESPOSTA_ANUNCIO_MS);
  }

  // O cartão do clique: o de item pelo itemId, o de pokémon pelo pokemonId.
  function marcarVoo(voo, fase, texto) {
    if (voo.pokemonId !== undefined && voo.pokemonId !== null) marcarAcaoPk(voo.pokemonId, fase, texto);
    else marcarAcao(voo.itemId, fase, texto);
  }

  // 1.33.9: o livro dos comprados à mão. Só atualiza com o registro do radar já lido (senão uma
  // compra automática pareceria sua) — e, na dúvida, protege: nunca o contrário.
  function atualizarLivroManual() {
    if (!s.revenda.manuaisProntos || !s.revenda.registroEm || !s.revenda.historico) return;
    const porNome = {};
    for (const [id, q] of Object.entries(s.conta.itens || {})) { const it = s.catalogo.get(Number(id)); if (it && it.nome) porNome[it.nome] = (porNome[it.nome] || 0) + (Number(q) || 0); }
    const r = Rv.atualizarManuais(s.revenda.manuais, { registro: s.revenda.registro || [], historico: s.revenda.historico.linhas || [], inventarioPorNome: porNome });
    s.revenda.manuais = r.livro;
    s.revenda.manuaisEm = Date.now();
    if (r.mudou) { const st = ponte.storage(); if (st) st.set({ [CHAVE_MANUAIS]: r.livro }).catch(erro); }
  }
  // as pedras que o time vai gastar (a Rotina avisa a cada 2 min): valem 15 min sem aviso novo
  const pedrasDoTimeAgora = () => { const p = s.revenda.pedrasDoTime; return p && Date.now() - (p.em || 0) < 15 * 60_000 ? (p.itens || {}) : null; };
  document.addEventListener('piloto:pedras-do-time', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      const itens = {};
      for (const [id, q] of Object.entries((d && d.itens) || {})) { const n = Math.floor(Number(q)); if (Number.isInteger(Number(id)) && n > 0 && n < 1000) itens[Number(id)] = n; }
      s.revenda.pedrasDoTime = { em: Date.now(), itens };
      const st = ponte.storage(); if (st) st.set({ [CHAVE_PEDRAS_TIME]: s.revenda.pedrasDoTime }).catch(erro);
    } catch (e) { erro(e); }
  });

  function guardarPessoal(aba, dados) {
    if (!dados) return;
    if (aba === 'meus') { s.revenda.meus = dados; s.revenda.meusEm = Date.now(); }
    if (aba === 'historicoCompras') { s.revenda.historico = dados; s.revenda.historicoEm = Date.now(); try { atualizarLivroManual(); } catch (e) { erro(e); } }
    if (aba === 'historicoCompras') { try { paraExtrato(linhasParaExtrato(dados.linhas, 'compra')); } catch (e) { erro(e); } }
    if (aba === 'historico') { try { paraExtrato(linhasParaExtrato(dados.linhas, 'venda')); } catch (e) { erro(e); } }
    // Lucro realizado (0.9.0): as suas vendas, sem quem comprou, e a diária dos seus anúncios de pokémon.
    if (aba === 'historico') {
      s.ultimoHistoricoVendas = Date.now();
      const vendas = (dados.linhas || []).map(Lucro.lerVenda).filter(Boolean);
      if (vendas.length) sw({ tipo: 'minhasVendas:guardar', vendas });
    }
    if (aba === 'meus') {
      const diarias = (dados.linhas || []).map((l) => Lucro.diariaDoAnuncio(l, s.taxaDiaria)).filter(Boolean);
      if (diarias.length) sw({ tipo: 'diarias:guardar', diarias });
    }
    emitirRevenda();
    emitirRevendaPk();
  }

  async function lerMeus() {
    const dados = await pedir({ t: 'market.meus' }, (d) => d.aba === 'meus');
    if (dados) { guardarPessoal('meus', dados); bus.emit('tela:pessoal', { tipo: 'meus', dados, em: Date.now() }); }
    return dados;
  }

  // A aba Revenda abriu (ou Atualizar): só o que estiver velho, e cada leitura pela janela de
  // silêncio das compras (pedir).
  async function pedirRevenda({ forcar = false } = {}) {
    if (s.revenda.lendo) return;
    if (!s.socketAberto) { emitirRevenda(); return; }
    s.revenda.lendo = true;
    emitirRevenda();
    try {
      const agora = Date.now();
      if (forcar || agora - s.revenda.registroEm > MEUS_VALE_MS) {
        s.revenda.registro = (await sw({ tipo: 'alertas:listar', limite: 500 })) || [];
        s.revenda.registroEm = Date.now();
        try { atualizarLivroManual(); } catch (e) { erro(e); }
      }
      if (forcar || agora - s.revenda.meusEm > MEUS_VALE_MS) await lerMeus();
      if (forcar || agora - s.revenda.historicoEm > HISTORICO_VALE_MS) {
        const seq = ++s.seqTela;
        const dados = await pedir({ t: 'market.historicoCompras', pagina: 0, seq }, (d) => d.aba === 'historicoCompras' && d.seq === seq);
        if (dados) { guardarPessoal('historicoCompras', dados); bus.emit('tela:pessoal', { tipo: 'historicoCompras', dados, em: Date.now() }); }
      }
      // Livros: dos itens que ele tem (ou anunciou) e que estão vigiados, os mais velhos primeiro.
      const meus = Pessoal.normalizarMeus((s.revenda.meus && s.revenda.meus.linhas) || [], agoraServidor());
      const ids = new Set(Object.entries(s.conta.itens || {}).filter(([, q]) => q > 0).map(([id]) => Number(id)));
      for (const m of meus) if (m.itemId && m.moeda === 'gold') ids.add(m.itemId);
      const velhos = [...ids]
        .filter((id) => { const item = s.catalogo.get(id); return item && Config.itemLiberado(s.config, item); })
        .filter((id) => forcar || !s.livros.has(id) || Date.now() - s.livros.get(id).em > LIVRO_VALE_MS)
        .sort((a, b) => ((s.livros.get(a) || {}).em || 0) - ((s.livros.get(b) || {}).em || 0))
        .slice(0, MAX_LIVROS_POR_ABERTURA);
      for (const id of velhos) {
        await esperar(pausaEntrePedidos());
        const dados = await pedir({ t: 'market.item', itemId: id, moeda: 'gold' }, casaItem(id));
        if (dados) s.livros.set(id, { linhas: dados.linhas || [], em: Date.now() });
        emitirRevenda();
      }
    } finally {
      s.revenda.lendo = false;
      emitirRevenda();
      emitirRevendaPk();
      calcularPkSozinho(forcar);
    }
  }

  const ANTES_DE_COMPRA_MS = 10000;
  async function esperarJanelaDeAnuncio() {
    const limite = Date.now() + ESPERA_SILENCIO_MAX_MS;
    const livre = () => !abertas().some((c) => c.enviando || C.emVoo(c.estado) || (c.estado.fase === 'agendada' && c.estado.enviarEm - Date.now() <= ANTES_DE_COMPRA_MS));
    while (Date.now() < limite && !livre()) await esperar(250);
  }

  function anuncioEmVoo() {
    const v = s.revenda.emVoo;
    return v && Date.now() - v.em < ESPERA_ANUNCIO_MS ? v : null;
  }

  function marcarAcao(itemId, fase, texto) {
    s.revenda.acoes.set(itemId, { fase, texto, em: Date.now() });
    emitirRevenda();
  }

  // Um clique no cartão: um único pedido. tipo 'criar' (anunciar) ou 'editar' (mudar o preço).
  async function acaoDeRevenda({ tipo, itemId, qtd, preco, anuncioId }) {
    const item = s.catalogo.get(Number(itemId));
    if (!item || !Config.itemLiberado(s.config, item)) return;
    const atual = s.revenda.acoes.get(item.id);
    if (anuncioEmVoo() || (atual && atual.fase === 'enviando')) { marcarAcao(item.id, 'erro', 'Espere a resposta do anúncio anterior.'); return; }
    if (!s.socketAberto) { marcarAcao(item.id, 'erro', 'Sem conexão com o jogo.'); return; }
    const p = Math.floor(Number(preco));
    if (!(p >= Rv.PRECO_MINIMO)) { marcarAcao(item.id, 'erro', `Preço mínimo: ${Rv.PRECO_MINIMO}.`); return; }
    let pedido;
    if (tipo === 'criar') {
      const tem = Number((s.conta.itens || {})[item.id]) || 0;
      const q = Math.floor(Number(qtd));
      if (!(q >= 1 && q <= tem)) { marcarAcao(item.id, 'erro', `Você tem ${fmtN(tem)} unidades.`); return; }
      pedido = { t: 'market.criar', tipo: 'item', itemId: item.id, qtd: q, preco: p, moeda: 'gold' };
    } else if (tipo === 'editar') {
      if (!Number.isInteger(anuncioId)) return;
      // v1.305: item muda de preço no máximo a cada 30 min. Nem tenta antes da hora.
      const agoraSv = agoraServidor();
      const meu = Pessoal.normalizarMeus((s.revenda.meus && s.revenda.meus.linhas) || [], agoraSv).find((m) => m.id === anuncioId);
      if (meu && typeof meu.editavelEm === 'number' && typeof agoraSv === 'number' && agoraSv < meu.editavelEm) {
        marcarAcao(item.id, 'erro', `O jogo só deixa mudar o preço de item a cada 30 min: faltam ${Math.ceil((meu.editavelEm - agoraSv) / 60000)} min.`);
        return;
      }
      pedido = { t: 'market.editar', id: anuncioId, preco: p, moeda: 'gold' };
    } else return;
    marcarAcao(item.id, 'enviando', 'Enviando…');
    // Ação no mercado, como a compra: não sai com uma compra enviada nem marcada para logo.
    await esperarJanelaDeAnuncio();
    const voo = { itemId: item.id, nome: item.nome, tipo, em: Date.now(), qtd: pedido.qtd, preco: p, anuncioId };
    s.revenda.emVoo = voo;
    const r = await ponte.enviar(pedido);
    if (!r.ok) { s.revenda.emVoo = null; marcarAcao(item.id, 'erro', `Não enviado: ${r.motivo}`); return; }
    voo.em = r.em || Date.now();
    // Sem marketCriado nem erro: confere em "Meus anúncios".
    voo.timer = setTimeout(() => conferirAnuncio(voo).catch(erro), tipo === 'editar' ? JANELA_RESPOSTA_ANUNCIO_MS : ESPERA_ANUNCIO_MS);
  }

  async function conferirAnuncio(voo) {
    if (s.revenda.emVoo !== voo) return;
    s.revenda.emVoo = null;
    // 1.12.3: quem espera o anúncio (a revenda automática) espera também esta conferência —
    // senão o "Baixei/Subi o preço" nunca chegava ao diário.
    s.revenda.conferindo = voo;
    try { await conferirAnuncioLido(voo, await lerMeus()); } finally { if (s.revenda.conferindo === voo) s.revenda.conferindo = null; }
  }
  async function conferirAnuncioLido(voo, dados) {
    if (voo.tipo === 'criar-pk' || voo.tipo === 'editar-pk') {
      const linhas = (dados && dados.linhas) || [];
      const achado = voo.tipo === 'criar-pk'
        ? linhas.find((l) => l && l.tipo === 'pokemon' && Number(l.pokemonId) === voo.pokemonId && l.preco === voo.preco)
        : linhas.find((l) => l && l.id === voo.anuncioId && l.preco === voo.preco);
      if (achado) marcarAcaoPk(voo.pokemonId, 'ok', voo.tipo === 'criar-pk' ? `Anunciado por ${fmtN(voo.preco)} (${voo.dias} dia${voo.dias > 1 ? 's' : ''}), libera em 2 min.` : `Preço mudado para ${fmtN(voo.preco)}: a retenção de 2 min recomeçou.`);
      else marcarAcaoPk(voo.pokemonId, 'erro', dados ? 'O servidor não confirmou: confira em Meus anúncios no jogo.' : 'O servidor não respondeu.');
      return;
    }
    const meus = Pessoal.normalizarMeus((dados && dados.linhas) || [], agoraServidor());
    const achado = meus.find((m) => m.itemId === voo.itemId && m.moeda === 'gold' && m.preco === voo.preco);
    if (achado) marcarAcao(voo.itemId, 'ok', voo.tipo === 'criar' ? `Anunciado: ${fmtN(achado.qtd)} × ${fmtN(achado.preco)}, libera em 2 min.` : `Preço mudado para ${fmtN(voo.preco)}: a retenção de 2 min recomeçou.`);
    else marcarAcao(voo.itemId, 'erro', dados ? 'O servidor não confirmou: confira em Meus anúncios no jogo.' : 'O servidor não respondeu.');
  }

  // Erro do servidor logo depois de um anúncio nosso.
  function erroDeAnuncio(d, em) {
    const voo = anuncioEmVoo();
    if (!voo || em - voo.em > JANELA_RESPOSTA_ANUNCIO_MS || em < voo.em - 50) return false;
    clearTimeout(voo.timer);
    s.revenda.emVoo = null;
    const min = d.params && Number.isFinite(Number(d.params.min)) ? Number(d.params.min) : null;
    const textos = {
      'market.travaItemAberto': 'Você já tem um anúncio deste item: mude o preço dele.',
      'market.travaItemEspera': `O jogo segura mais ${min ?? 'alguns'} min antes de anunciar este item de novo.`,
      'market.retencaoEditar': 'O anúncio ainda está em retenção: por enquanto só dá para remover no jogo.',
      'market.editarEspera': `O jogo só deixa mudar o preço de item a cada ${d.params && d.params.total ? d.params.total : 30} min: faltam ${min ?? 'alguns'} min.`,
      'market.shinySoGemas': 'Pokémon shiny só se anuncia em Gemas.',
      'skin.travaVenda': 'Pokémon com skin vestida não se anuncia: tire a skin no jogo.',
      'market.estadiaSemSaldo': 'O saldo não paga a diária dos dias escolhidos.',
    };
    marcarVoo(voo, 'erro', textos[d.chave] || d.msg || d.chave || 'Erro do servidor.');
    if (d.chave === 'market.travaItemAberto') lerMeus().catch(erro);
    // O jogo segurou: a revenda automática tenta de novo quando a espera acabar.
    if (voo.itemId !== undefined && voo.itemId !== null) {
      if (d.chave === 'market.travaItemEspera' || d.chave === 'market.editarEspera') segurar(voo.itemId, (min ?? 5) * 60000);
      else if (d.chave === 'market.retencaoEditar') segurar(voo.itemId, 2 * 60000);
      else if (d.chave === 'market.travaItemAberto') segurar(voo.itemId, 60000);
    }
    return true;
  }

  function anuncioCriado(ev) {
    const voo = anuncioEmVoo();
    if (voo && voo.tipo === 'criar-pk') {
      clearTimeout(voo.timer);
      s.revenda.emVoo = null;
      marcarAcaoPk(voo.pokemonId, 'ok', `Anunciado por ${fmtN(voo.preco)} (${voo.dias} dia${voo.dias > 1 ? 's' : ''}), libera em 2 min.`);
      setTimeout(() => lerMeus().catch(erro), 1000);
      return;
    }
    if (!voo || voo.tipo !== 'criar') return;
    const lido = Pessoal.lerDescricao(ev.descricao);
    if (lido && lido.nome !== voo.nome) return;
    clearTimeout(voo.timer);
    s.revenda.emVoo = null;
    s.revenda.ocultos.delete(voo.itemId);
    marcarAcao(voo.itemId, 'ok', `Anunciado: ${fmtN(voo.qtd)} × ${fmtN(voo.preco)}, libera em 2 min.`);
    setTimeout(() => lerMeus().catch(erro), 1000);
  }

  // ---- o que chega do jogo -------------------------------------------------------------------

  function aoEntrar(e) {
    switch (e.t) {
      case 'welcome':
        guardarCatalogo(e.dados && e.dados.mercado && e.dados.mercado.catalogo);
        if (e.dados && e.dados.mercado && Number(e.dados.mercado.taxaDiaria) > 0) s.taxaDiaria = Number(e.dados.mercado.taxaDiaria);
        if (e.dados && e.dados.mercado && Array.isArray(e.dados.mercado.faixasOrb) && e.dados.mercado.faixasOrb.length) s.faixasOrb = e.dados.mercado.faixasOrb;
        if (e.dados && typeof e.dados.servidorAgora === 'number' && !e.retido) s.amostrasRelogio.push({ local: e.em, servidor: e.dados.servidorAgora });
        acordar();
        break;
      case 'relogio':
        s.amostrasRelogio.push({ local: e.em, servidor: e.dados.servidorAgora });
        if (s.amostrasRelogio.length > R.MAX_AMOSTRAS) s.amostrasRelogio.splice(0, s.amostrasRelogio.length - R.MAX_AMOSTRAS);
        bus.emit('painel:relogio', { desvio: desvio() });
        break;
      case 'market':
        // O jogo responde ao anúncio publicado com aba 'criado' (v1.300): é o da revenda.
        if (e.dados && e.dados.aba === 'criado') { anuncioCriado({}); break; }
        // Resposta que não é nossa: foi o jogo que pediu, então o mercado está em uso na tela.
        // Se for do histórico ou dos anúncios do jogador, o painel aproveita.
        if (!resolverPendente(e)) {
          s.mercadoJogoAte = Date.now() + JANELA_MERCADO_ABERTO_MS;
          if (e.dados && PESSOAIS.has(e.dados.aba)) {
            bus.emit('tela:pessoal', { tipo: e.dados.aba, dados: e.dados, em: e.em, doJogo: true });
            guardarPessoal(e.dados.aba, e.dados);
          }
        }
        break;
      case 'erro': {
        const d = e.dados || {};
        // 1.12.3: recusa de comando do Piloto ou do próprio jogo (loja, equipe, hunt, PvP…) não é do
        // radar — antes ela abortava a leitura em curso ou "falhava" a compra no ar.
        const raizErro = typeof d.chave === 'string' && d.chave.includes('.') ? d.chave.split('.')[0] : null;
        if (raizErro && ERROS_DE_FORA.has(raizErro)) break;
        if (paraCompraEmVoo({ tipo: 'erro', chave: d.chave, msg: d.msg, em: e.em })) break;
        if (erroDeAnuncio(d, e.em)) break;
        // Erro logo depois de um pedido nosso: o servidor reclamou dele.
        const p = s.pendentes.find((x) => e.em - x.em <= JANELA_ERRO_PEDIDO_MS);
        if (p) {
          s.ultimaRecusa = { chave: d.chave || d.msg || 'erro', em: e.em };
          s.ultimoErro = { motivo: d.chave || d.msg || 'erro', em: e.em };
          p.terminar(null);
        }
        break;
      }
      case 'batalha':
        for (const ev of (e.dados && e.dados.ev) || []) {
          // Resposta do mercado em forma de aviso (entrou no sorteio, perdeu o sorteio, retenção,
          // trava de anúncio): é da compra enviada ou do anúncio que acabou de sair.
          // A janela do sorteio (v1.300), pelo id do anúncio: entrou, levou, perdeu ou não passou.
          if (ev.k === 'mktSorteio') {
            if (s.alertas.has(Number(ev.id))) registrarSorteio(Number(ev.id), ev);
            const alvo = s.compras.get(Number(ev.id));
            if (alvo && (alvo.enviando || C.emVoo(alvo.estado))) {
              const ap = (x) => { if (alvo.enviando) alvo.antecipados.push(x); else aplicarCompra(alvo, x); };
              if (ev.fase === 'entrou') ap({ tipo: 'erro', chave: 'market.sorteio', em: e.em });
              else if (ev.fase === 'fim' && ev.ok) ap({ tipo: 'comprado', descricao: ev.descricao, em: e.em });
              else if (ev.fase === 'fim' && ev.perdeu) ap({ tipo: 'erro', chave: 'market.sorteioPerdeu', em: e.em });
              else if (ev.fase === 'fim') ap({ tipo: 'erro', chave: typeof ev.msg === 'string' && ev.msg.startsWith('market.') ? ev.msg : undefined, msg: ev.msg || 'não passou', em: e.em });
            }
            continue;
          }
          if (ev.k === 'aviso' && typeof ev.msg === 'string' && ev.msg.startsWith('market.')) {
            const d = { chave: ev.msg, params: ev.params || {} };
            if (!paraCompraEmVoo({ tipo: 'erro', chave: d.chave, em: e.em })) erroDeAnuncio(d, e.em);
            continue;
          }
          // Aviso em texto solto (0.6.3), que o gancho só repassa perto de uma compra: é a resposta
          // dela se chegou até 2 s depois do envio (anúncio que já saiu, por exemplo).
          if (ev.k === 'aviso' && typeof ev.msg === 'string') {
            const voo = compraAguardando();
            const recente = voo && (voo.enviando || (voo.estado.fase === 'enviada' && typeof voo.estado.enviadoEm === 'number' && e.em - voo.estado.enviadoEm <= JANELA_AVISO_COMPRA_MS));
            const chaveAviso = /^[a-z][\w.-]*\.[\w.-]+$/i.test(ev.msg) ? ev.msg : undefined;
            if (recente) paraCompraEmVoo({ tipo: 'erro', chave: chaveAviso, msg: ev.msg, em: e.em });
            else erroDeAnuncio({ chave: chaveAviso, msg: ev.msg, params: ev.params || {} }, e.em);
            continue;
          }
          // Compra do radar: a enviada agora, e do mesmo item (a descrição é "N× nome").
          const lido = ev.k === 'marketComprado' ? Pessoal.lerDescricao(ev.descricao) : null;
          const voo = ev.k === 'marketComprado' ? compraPorNome(lido, ev.descricao) : null;
          const doRadar = Boolean(voo);
          if (voo) { if (voo.enviando) voo.antecipados.push({ tipo: 'comprado', descricao: ev.descricao, em: e.em }); else aplicarCompra(voo, { tipo: 'comprado', descricao: ev.descricao, em: e.em }); }
          if (ev.k === 'marketCriado') anuncioCriado(ev);
          // Compra sua pelo próprio jogo: quando o anúncio de um aviso sair, ela diz que foi você.
          if (ev.k === 'marketComprado' && !doRadar) {
            s.comprasNoJogo.push({ descricao: ev.descricao, em: e.em });
            if (s.comprasNoJogo.length > 20) s.comprasNoJogo.shift();
          }
          // Vendas e compras ao vivo para as abas do painel.
          if (typeof ev.k === 'string' && ev.k.startsWith('market')) bus.emit('tela:evento', { k: ev.k, descricao: ev.descricao, valor: ev.valor, moeda: ev.moeda, em: e.em, doRadar });
        }
        break;
      default:
        if (e.dados && Array.isArray(e.dados.anuncioChat)) {
          // Alto-falante anunciando item em ouro: pista para conferir esse item no próximo ciclo.
          for (const a of e.dados.anuncioChat) {
            const item = a && a.tipo === 'item' && a.moeda === 'gold' ? s.catalogo.get(Number(a.itemId)) : null;
            if (item && Config.itemLiberado(s.config, item)) s.dicas.add(item.id);
          }
        }
    }
  }

  // ---- abas Compras e Vendas do painel -------------------------------------------------------

  // Leitura pedida pelo painel quando o Allan abre a aba ou clica em Atualizar. O seq começa
  // em 900000 para nunca coincidir com o do jogo, que descarta resposta de seq diferente.
  async function pedirPessoal({ tipo }) {
    if (!PESSOAIS.has(tipo)) return;
    const agora = Date.now();
    if (agora - (s.ultimoPedidoTela.get(tipo) || 0) < INTERVALO_PEDIDO_TELA_MS) return;
    s.ultimoPedidoTela.set(tipo, agora);
    if (!s.socketAberto) { bus.emit('tela:pessoal', { tipo, erro: 'Sem conexão com o jogo.' }); return; }
    let pedido;
    let casa;
    if (tipo === 'meus') {
      pedido = { t: 'market.meus' };
      casa = (d) => d.aba === 'meus';
    } else {
      const seq = ++s.seqTela;
      pedido = { t: `market.${tipo}`, pagina: 0, seq };
      casa = (d) => d.aba === tipo && d.seq === seq;
    }
    const dados = await pedir(pedido, casa);
    if (dados) guardarPessoal(tipo, dados);
    bus.emit('tela:pessoal', dados ? { tipo, dados, em: Date.now() } : { tipo, erro: 'O servidor não respondeu.' });
  }

  function guardarCatalogo(catalogo) {
    if (!Array.isArray(catalogo) || !catalogo.length) return;
    s.catalogo = new Map(catalogo.filter((c) => c && Number.isFinite(Number(c.id))).map((c) => [Number(c.id), { id: Number(c.id), nome: String(c.nome), categoria: String(c.categoria) }]));
    const itens = [...s.catalogo.values()];
    const assinatura = JSON.stringify(itens);
    if (assinatura === s.catalogoSalvo) return;
    s.catalogoSalvo = assinatura;
    const st = ponte.storage();
    if (st) st.set({ [CHAVE_CATALOGO]: { versaoJogo: ponte.versaoJogo(), itens, em: Date.now() } }).catch(erro);
  }

  // Primeiro ciclo logo que der (catálogo e socket prontos), sem esperar 30 s.
  function acordar() {
    if (!s.config.radarLigado || s.parado || s.ultimoCiclo || s.rodando) return;
    agendarProximo(PRIMEIRO_CICLO_MS);
  }

  // ---- mercado aberto e aba oculta -----------------------------------------------------------

  function conferirMercadoDom() {
    const modal = document.getElementById('modal');
    const caixa = modal && modal.querySelector('.modal-caixa');
    const aberto = Boolean(modal && !modal.classList.contains('hidden') && caixa && caixa.dataset.modal === 'community');
    if (aberto !== s.mercadoDom) {
      s.mercadoDom = aberto;
      s.motivo = A.motivoDePausa(contextoDePausa());
      if (!aberto) retomarLogo();
      publicarEstado();
    }
  }

  function observarMercado() {
    const modal = document.getElementById('modal');
    if (modal) {
      s.temModalDom = true;
      new MutationObserver(conferirMercadoDom).observe(modal, { attributes: true, subtree: true, attributeFilter: ['class', 'data-modal'] });
      conferirMercadoDom();
      return;
    }
    // O #modal vem no HTML do jogo; se ainda não existir, espera ele aparecer.
    const obs = new MutationObserver(() => {
      if (document.getElementById('modal')) { obs.disconnect(); observarMercado(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---- configuração --------------------------------------------------------------------------

  // O Piloto (mundo da página) publica o ouro/h e o teto do cofre; com eles os limites do radar
  // se calculam sozinhos (Config.calibrar). Um evento forjado pela página só mexe nesses números:
  // o gasto continua passando pelo cofre no gancho.
  s.ctxPiloto = null;
  s.base = Config.validar(null);
  function recalibrar() {
    s.config = Config.calibrar(s.base, s.ctxPiloto);
  }
  document.addEventListener('piloto:contexto', (ev) => {
    try {
      const d = JSON.parse(ev.detail);
      const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
      s.ctxPiloto = { ouroH: n(d.ouroH), teto: n(d.teto), livre: n(d.livre) };
      if (s.configCarregada) recalibrar();
    } catch (e) { erro(e); }
  });
  // O botão único do Piloto (Desligado, Manual, Automático) liga e desliga as frentes do radar.
  document.addEventListener('piloto:modo', (ev) => {
    (async () => {
      const d = JSON.parse(ev.detail);
      if (d && ['desligado', 'manual', 'automatico'].includes(d.modo)) s.modoPiloto = d.modo;
      const perfil = Config.PERFIS[d && d.modo];
      const st = ponte.storage();
      if (!perfil || !st) return;
      // 1.34: no Manual, recarregar a página não devolve o perfil (antes religava "Calcular os
      // limites sozinho" e desligava as compras a cada F5 — o que a pessoa ajustou se perdia)
      if (d.modo === 'manual' && d.recarga) return;
      const salvo = await st.get(Config.CHAVE);
      const atual = Config.validar(salvo[Config.CHAVE]);
      // 1.13: no Automático cada automação tem o seu interruptor. Ao recarregar a página, o perfil
      // volta, mas o que você desligou no Automático continua desligado. Escolher o Automático de
      // novo no botão religa tudo (e esquece as escolhas).
      const escolhas = {};
      if (d.modo === 'automatico' && d.recarga) {
        const r = await st.get('radar:auto-escolhas');
        const g = (r && r['radar:auto-escolhas']) || {};
        for (const k of ['radarLigado', 'compraAutomatica', 'compraAutomaticaPokemon', 'revendaAutomatica']) if (typeof g[k] === 'boolean') escolhas[k] = g[k];
      } else if (d.modo === 'automatico') await st.set({ 'radar:auto-escolhas': {} });
      await st.set({ [Config.CHAVE]: { ...atual, ...perfil, ...escolhas } });
    })().catch(erro);
  });

  function aplicarConfig(bruto) {
    const antes = s.config;
    s.base = Config.validar(bruto);
    s.config = Config.calibrar(s.base, s.ctxPiloto);
    s.configCarregada = true;
    if (s.config.radarLigado && !antes.radarLigado) {
      cancelarRetomada();
      s.recuo = A.novoRecuo();
      s.ultimoCiclo = null;
      acordar();
    } else if (!s.config.radarLigado && antes.radarLigado) {
      clearTimeout(s.timer);
      s.timer = null;
      s.proximoCiclo = null;
      cancelarTodas();
    }
    // Desligou o automático: o que ele agendou e ainda não saiu é cancelado.
    if (!s.config.compraAutomatica && antes.compraAutomatica) cancelarTodas((c) => c.auto);
    if (s.config.compraAutomatica && !antes.compraAutomatica) {
      s.falhasSeguidas = 0;
      const st = ponte.storage();
      if (st && s.configCarregadaAntes) st.remove(CHAVE_AUTO_DESLIGADA).catch(erro);
    }
    s.configCarregadaAntes = true;
    s.motivo = A.motivoDePausa(contextoDePausa());
    publicarEstado();
  }

  // 1.33.2: o "Em estoque" da aba Lucro (o que o radar comprou e ainda não vendeu, a custo) vai para o
  // cofre a cada 2 min: é com ele que o cofre mede o capital em giro da compra automática.
  async function publicarEstoque() {
    try {
      if (!ponte.temJogo || !ponte.temJogo()) return;
      const r = await sw({ tipo: 'lucro:resumo' });
      const v = r && r.totais ? Number(r.totais.emEstoque) : NaN;
      if (Number.isFinite(v) && v >= 0) document.dispatchEvent(new CustomEvent('piloto:radar-estoque', { detail: JSON.stringify({ valor: Math.round(v) }) }));
    } catch (e) { erro(e); }
  }
  setInterval(() => { publicarEstoque(); }, 2 * 60000);
  setTimeout(() => { publicarEstoque(); }, 8000);

  // 1.34.1: as quedas da conexão do jogo, conferíveis pela página /terms ('piloto:diag:quedas')
  function gravarQuedas() {
    try { localStorage.setItem('piloto:diag:quedas', JSON.stringify(s.quedas)); } catch { /* sem espaço */ }
  }
  try { const q = JSON.parse(localStorage.getItem('piloto:diag:quedas') || '[]'); if (Array.isArray(q)) s.quedas = q.slice(-30); } catch { /* começa vazio */ }

  // 1.33.1: um retrato do radar no localStorage do pokeidle.io ('piloto:diag:radar'), a cada 1 min,
  // para conferir pela página /terms (sem abrir o /app) por que um item foi ou não comprado,
  // anunciado ou teve o preço mudado. Fica só neste navegador; não vai a lugar nenhum.
  setInterval(() => {
    try {
      if (!ponte.temJogo || !ponte.temJogo()) return;
      const prim = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v === null || typeof v !== 'object'));
      const cfg = configDoAutomatico();
      const v = s.ultimaVitrine;
      const linhas = v ? Vitrine.linhasDoMercado({ amostras: v.amostras, historico: v.historico, conferidos: s.conferidos, catalogo: s.catalogo, config: cfg, agora: Date.now() }) : [];
      const { meus, sugestoes } = calcularSugestoes();
      localStorage.setItem('piloto:diag:radar', JSON.stringify({
        em: Date.now(), motivo: s.motivo || null, ultimoCiclo: s.ultimoCiclo || null, ultimaRevendaAuto: s.ultimaRevendaAuto || null,
        config: prim(cfg), categorias: cfg.categorias, bloqueados: cfg.itensBloqueados, liberadosAMao: cfg.itensLiberados,
        catalogo: s.catalogo.size, liberados: liberados().map((i) => i.id), vitrineEm: v ? v.em : null,
        linhas: linhas.map(prim).slice(0, 60),
        sugestoes: sugestoes.map((sg) => ({ ...prim(sg), doRadar: !!(sg.custo && sg.custo.doRadar), custoUn: sg.custo ? sg.custo.porUnidade : null, espera: emEspera(sg.itemId), auto: cartaoAutomatico(sg) })),
        abertos: meus.length,
        gastoAutoHoje: Auto.gastoDeHoje(s.gastoDia, Date.now()),
      }));
    } catch { /* sem espaço ou sem dados ainda */ }
  }, 60000);

  async function iniciar() {
    const st = ponte.storage();
    if (!st) return;
    const salvo = await st.get([Config.CHAVE, CHAVE_GASTO, CHAVE_MANUAIS, CHAVE_PEDRAS_TIME]);
    s.gastoDia = salvo[CHAVE_GASTO] || null;
    s.revenda.manuais = salvo[CHAVE_MANUAIS] || Rv.livroManualVazio();
    s.revenda.pedrasDoTime = salvo[CHAVE_PEDRAS_TIME] || null;
    s.revenda.manuaisProntos = true;
    const ct = await st.get(CHAVE_ALVOS_CONTA);
    s.alvosConta = (ct && ct[CHAVE_ALVOS_CONTA]) || {};
    aplicarConfig(salvo[Config.CHAVE]);
    // Depois de recarregar a aba, não repete aviso nem quase aviso das últimas 24 h.
    const recentes = (await sw({ tipo: 'alertas:recentes' })) || {};
    for (const id of recentes.avisos || []) s.alertados.add(id);
    for (const id of recentes.quase || []) s.quaseRegistrados.add(id);
    chrome.storage.onChanged.addListener((m, area) => {
      if (area === 'local' && m[Config.CHAVE]) aplicarConfig(m[Config.CHAVE].newValue);
    });
  }

  try {
    bus.on('entrada', (e) => { try { aoEntrar(e); } catch (x) { erro(x); } });
    bus.on('conta', (c) => {
      if (c.id !== undefined && c.id !== null) s.conta.id = c.id;
      if (typeof c.gold === 'number') s.conta.gold = c.gold;
      if (c.itens && typeof c.itens === 'object') { s.conta.itens = c.itens; emitirRevenda(); }
    });
    // Pulso do gancho: o jogo está recebendo mensagens.
    bus.on('pulso', (m) => { if (typeof m.em === 'number') s.ultimoPulsoEm = m.em; });
    bus.on('socket', (m) => {
      if (m.evento === 'aberto') {
        s.socketAberto = true;
        s.sessaoTomada = false;
        const q = s.quedas[s.quedas.length - 1];
        if (q && !q.voltouEm) { q.voltouEm = Date.now(); gravarQuedas(); }
        setTimeout(retentarCompras, 3000); // 1.34.1: a compra automática que caiu com a conexão
        // Conexão nova (o jogo reconectou depois de uma queda ou de uma atualização): as falhas de
        // antes eram da conexão velha, e a pausa por elas acaba aqui.
        if (s.recuo.pausado || s.recuo.falhas) {
          cancelarRetomada();
          s.recuo = A.novoRecuo();
          if (s.ultimoCiclo && !s.rodando) agendarProximo(PRIMEIRO_CICLO_MS);
        }
        acordar();
      }
      if (m.evento === 'fechado') {
        s.socketAberto = false;
        if (m.codigo === 4001) s.sessaoTomada = true;
        // 1.34.1: anota a queda (código do fechamento, motivo, se estava escondida) para descobrir o porquê
        s.quedas.push({ em: Date.now(), codigo: m.codigo ?? null, motivo: String(m.motivo || '').slice(0, 80), limpo: !!m.limpo, oculta: typeof document !== 'undefined' ? document.hidden : null, voltouEm: null });
        if (s.quedas.length > 30) s.quedas.splice(0, s.quedas.length - 30);
        gravarQuedas();
        for (const p of [...s.pendentes]) p.terminar(null);
      }
      s.motivo = A.motivoDePausa(contextoDePausa());
      publicarEstado();
    });
    bus.on('status', (m) => {
      s.socketAberto = m.conectado;
      if (m.conectado) { acordar(); setTimeout(retentarCompras, 3000); }
    });
    bus.on('contexto-perdido', () => {
      s.parado = true;
      clearTimeout(s.timer);
      cancelarTodas();
    });
    // Rastro do gancho: vai para a compra enviada por último, nos 20 s depois do envio.
    bus.on('rastro', (x) => {
      const c = s.rastroAlvo;
      if (!c || typeof c.estado.enviadoEm !== 'number' && !c.enviando) return;
      if (typeof c.estado.enviadoEm === 'number' && x.em - c.estado.enviadoEm > RASTRO_DEPOIS_MS) return;
      if (c.rastro.length < 300) c.rastro.push(x);
    });
    bus.on('tela:pedir', (m) => { pedirPessoal(m).catch(erro); });
    bus.on('tela:quero-estado', () => { publicarEstado(); emitirMercado(); emitirRevenda(); });
    bus.on('revenda:pedir', (m) => { pedirRevenda(m || {}).catch(erro); });
    bus.on('revenda:anunciar', (m) => { acaoDeRevenda({ ...m, tipo: 'criar' }).catch(erro); });
    bus.on('revenda:mudar-preco', (m) => { acaoDeRevenda({ ...m, tipo: 'editar' }).catch(erro); });
    bus.on('revenda:pk:calcular', ({ pokemonId }) => pedirCalculoPk(Number(pokemonId)));
    bus.on('revenda:pk:anunciar', (m) => { anunciarPk({ ...m, pokemonId: Number(m.pokemonId) }).catch(erro); });
    bus.on('revenda:pk:mudar-preco', (m) => { mudarPrecoPk({ ...m, pokemonId: Number(m.pokemonId), anuncioId: Number(m.anuncioId) }).catch(erro); });
    bus.on('pokemons', (m) => {
      s.revenda.pk.lista = Array.isArray(m.lista) ? m.lista : [];
      s.revenda.pk.activeId = m.activeId ?? null;
      s.revenda.pk.recebidoEm = Date.now();
      emitirRevendaPk();
    });
    bus.on('revenda:esconder', ({ itemId, qtd }) => { s.revenda.ocultos.set(Number(itemId), Number(qtd) || 0); emitirRevenda(); });
    bus.on('painel:comprar', ({ anuncioId, qtd }) => iniciarCompra({ anuncioId, qtd }));
    bus.on('painel:cancelar', ({ anuncioId }) => cancelarCompra(anuncioId));
    bus.on('painel:ignorar', ({ anuncioId }) => { s.alertas.delete(anuncioId); resolverAviso(anuncioId); });
    document.addEventListener('visibilitychange', () => {
      s.ocultaDesde = document.visibilityState === 'hidden' ? Date.now() : null;
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observarMercado, { once: true });
    else observarMercado();
    iniciar().catch(erro);
  } catch (e) {
    erro(e);
  }
})();
