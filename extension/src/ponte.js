// Radar do Mercado: ponte entre o hook (world MAIN) e a extensão.
//
// Roda no mundo isolado da aba do jogo. Recebe do hook só o que já passou pelo filtro de
// privacidade e:
// - publica no barramento (RadarBus) para o radar e o painel;
// - grava em chrome.storage.local quando a gravação de diagnóstico está ligada;
// - mantém o status que o popup mostra;
// - leva os pedidos do radar ao hook (RadarPonte.enviar) e devolve a resposta.
// Nada daqui fala com a rede.
(function () {
  'use strict';

  const PREFIXO = '[radar-mercado]';
  const EVT_SAIDA = 'radar-mercado:hook';
  const EVT_ENTRADA = 'radar-mercado:ponte';
  const CHAVE_GRAVANDO = 'radar:gravando';
  const CHAVE_STATUS = 'radar:status';
  const ESPERA_ESCRITA_MS = 1500;
  const PULSO_STATUS_MS = 15000;
  const ESPERA_ENVIO_MS = 3000;

  // A versão vai para um atributo da página: o painel (mundo MAIN) não enxerga chrome.runtime.
  try { document.documentElement.dataset.pilotoVersao = chrome.runtime.getManifest().version; } catch { /* sem versão */ }

  const G = globalThis.RadarGravador;
  const Config = globalThis.RadarConfig;
  if (!G || !Config || !globalThis.RadarBarramento) { console.error(PREFIXO, 'bibliotecas não carregaram'); return; }

  const bus = globalThis.RadarBarramento.criarBarramento(PREFIXO);
  const pagina = Math.random().toString(36).slice(2, 8);
  let gravando = false;
  let escuta = false; // hook repassando o mercado para o barramento
  let gravador = null;
  let escritaAgendada = null;
  let contextoValido = true;
  // Só a aba que tem o socket do jogo escreve o status (uma aba de /terms não pode apagar o
  // "conectado" da aba do jogo).
  let temJogo = false;
  // versaoExtensao: o popup compara com a dele para avisar quando a aba roda scripts antigos.
  const status = { pagina, atualizadoEm: Date.now(), conectado: false, sid: null, ultimoFechamento: null, versaoJogo: null, versaoExtensao: chrome.runtime.getManifest().version, gravando: false };
  const envios = new Map(); // ref -> { resolver, timer }
  let proximoRef = 1;

  function erro(e) { try { console.error(PREFIXO, e); } catch { /* nada */ } }

  function storage() {
    // Extensão recarregada com a aba aberta: o contexto morre e qualquer chamada lança erro.
    if (!contextoValido || !globalThis.chrome || !chrome.runtime || !chrome.runtime.id) {
      if (contextoValido) {
        contextoValido = false;
        paraHook({ tipo: 'gravar', ligado: false });
        paraHook({ tipo: 'radar', ligado: false });
        bus.emit('contexto-perdido', null);
      }
      return null;
    }
    return chrome.storage.local;
  }

  function paraHook(cmd) {
    try {
      document.dispatchEvent(new CustomEvent(EVT_ENTRADA, { detail: JSON.stringify(cmd) }));
    } catch (e) {
      erro(e);
    }
  }

  function versaoDoJogo() {
    try {
      const s = document.querySelector('script[src*="app.js"]');
      const m = s && /[?&]v=([\w.-]+)/.exec(s.getAttribute('src'));
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  // ---- escrita no storage --------------------------------------------------------------------

  function agendarEscrita(imediata) {
    if (escritaAgendada) {
      if (!imediata) return;
      clearTimeout(escritaAgendada);
    }
    escritaAgendada = setTimeout(escrever, imediata ? 0 : ESPERA_ESCRITA_MS);
  }

  async function escrever() {
    escritaAgendada = null;
    const st = storage();
    if (!st) return;
    try {
      const lote = temJogo ? { [CHAVE_STATUS]: { ...status, atualizadoEm: Date.now() } } : {};
      if (gravador) Object.assign(lote, gravador.pendente());
      if (Object.keys(lote).length) await st.set(lote);
      if (gravador && gravador.meta.cheio && gravando) {
        // Perto do teto do storage: para sozinha e o popup avisa.
        await st.set({ [CHAVE_GRAVANDO]: false });
      }
    } catch (e) {
      erro(e);
    }
  }

  // ---- eventos do hook -----------------------------------------------------------------------

  function registrar(entrada) {
    if (!gravando || !gravador) return;
    gravador.versaoJogo(status.versaoJogo);
    gravador.adicionar({ ...entrada, pg: pagina });
    agendarEscrita(false);
  }

  function aoHook(ev) {
    let msg;
    try { msg = JSON.parse(String(ev.detail)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.tipo) {
        case 'hook-pronto':
          iniciar();
          break;
        case 'entrada': {
          const { tipo, ...resto } = msg;
          registrar(resto);
          if (escuta) bus.emit('entrada', resto);
          break;
        }
        case 'conta':
          // Só para o radar: nunca vai para a gravação nem para o storage.
          if (escuta) bus.emit('conta', { id: msg.id, gold: msg.gold, itens: msg.itens, em: msg.em });
          break;
        case 'enviado': {
          const espera = envios.get(msg.ref);
          if (espera) {
            envios.delete(msg.ref);
            clearTimeout(espera.timer);
            espera.resolver({ ok: msg.ok === true, motivo: msg.motivo || null, em: msg.em });
          }
          break;
        }
        case 'socket':
          temJogo = true;
          if (msg.evento === 'aberto') { status.conectado = true; status.sid = msg.sid; }
          if (msg.evento === 'fechado' && msg.sid === status.sid) {
            status.conectado = false;
            status.ultimoFechamento = { em: msg.em, codigo: msg.codigo, motivo: msg.motivo };
          }
          registrar({ dir: '-', t: 'socket', em: msg.em, sid: msg.sid, dados: { evento: msg.evento, codigo: msg.codigo, motivo: msg.motivo, limpo: msg.limpo, endereco: msg.endereco } });
          bus.emit('socket', msg);
          agendarEscrita(true);
          break;
        // Os seus pokémon (0.7.0): só para o radar, nunca para a gravação nem para o storage.
        case 'pokemons':
          if (escuta) bus.emit('pokemons', { em: msg.em, activeId: msg.activeId, lista: Array.isArray(msg.lista) ? msg.lista : [] });
          break;
        // Pulso: o jogo recebeu mensagens (só a hora). Separa "servidor parado" de "recusou".
        case 'pulso':
          if (escuta) bus.emit('pulso', { em: msg.em });
          break;
        // Rastro da compra (só tipos e chaves): o radar junta à compra enviada.
        case 'rastro': {
          const { tipo, ...resto } = msg;
          if (escuta) bus.emit('rastro', resto);
          break;
        }
        case 'contagem':
          // Pode chegar logo depois de parar (o hook manda a última ao desligar).
          if (gravador) {
            gravador.contagem(msg.contagem, msg.descartadas);
            agendarEscrita(false);
          }
          break;
        case 'status': {
          if ((msg.sockets || []).length) temJogo = true;
          const aberto = (msg.sockets || []).find((s) => s.sid === msg.atual && s.readyState === 1);
          status.conectado = Boolean(aberto);
          status.sid = msg.atual;
          status.gravando = msg.gravando;
          bus.emit('status', { conectado: status.conectado, sid: msg.atual });
          agendarEscrita(true);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      erro(e);
    }
  }

  // ---- pedidos do radar ----------------------------------------------------------------------

  // Resolve com { ok, motivo, em }. Sem resposta do hook em 3 s conta como falha.
  function enviar(pedido) {
    return new Promise((resolver) => {
      if (!contextoValido) { resolver({ ok: false, motivo: 'extensão recarregada', em: Date.now() }); return; }
      const ref = `r${proximoRef++}`;
      const timer = setTimeout(() => {
        envios.delete(ref);
        resolver({ ok: false, motivo: 'o hook não respondeu', em: Date.now() });
      }, ESPERA_ENVIO_MS);
      envios.set(ref, { resolver, timer });
      paraHook({ tipo: 'enviar', ref, pedido });
    });
  }

  // ---- ligar e desligar ----------------------------------------------------------------------

  function aplicarGravacao(ligado, meta) {
    gravando = ligado;
    status.gravando = ligado;
    if (ligado && !gravador) gravador = G.criarGravador({ pagina, meta: meta || null });
    paraHook({ tipo: 'gravar', ligado });
    agendarEscrita(true);
  }

  let iniciado = false;
  async function iniciar() {
    const st = storage();
    if (!st) return;
    try {
      const salvo = await st.get([CHAVE_GRAVANDO, G.CHAVE_META]);
      const ligado = salvo[CHAVE_GRAVANDO] === true;
      gravando = ligado;
      status.gravando = ligado;
      // A escuta do mercado fica sempre ligada na aba do jogo: o painel (Compras, Vendas) usa
      // mesmo com o radar desligado. Ligar e desligar o radar só liga e desliga as consultas.
      escuta = true;
      if (ligado && !gravador) gravador = G.criarGravador({ pagina, meta: salvo[G.CHAVE_META] || null });
      // "pronto" pode ir duas vezes (ponte e hook carregando em qualquer ordem); o hook ignora a repetida.
      paraHook({ tipo: 'pronto', gravando: ligado, radar: escuta });
      iniciado = true;
    } catch (e) {
      erro(e);
    }
  }

  function aoMudarStorage(mudancas, area) {
    if (area !== 'local') return;
    try {
      if (mudancas[G.CHAVE_META] && mudancas[G.CHAVE_META].newValue === undefined) {
        // O popup limpou a gravação.
        gravador = gravando ? G.criarGravador({ pagina, meta: null }) : null;
      }
      if (mudancas[CHAVE_GRAVANDO] && iniciado) {
        const ligado = mudancas[CHAVE_GRAVANDO].newValue === true;
        if (ligado !== gravando) {
          if (ligado && !gravador) {
            storage().get(G.CHAVE_META).then((s) => aplicarGravacao(true, s[G.CHAVE_META])).catch(erro);
          } else {
            aplicarGravacao(ligado);
          }
        }
      }
    } catch (e) {
      erro(e);
    }
  }

  globalThis.RadarBus = bus;
  globalThis.RadarPonte = Object.freeze({
    enviar,
    // Compra automática que não aconteceu: o ouro reservado no cofre (no hook) volta.
    estornarCofre: (anuncioId) => paraHook({ tipo: 'cofre-estornar', anuncioId }),
    // Comprado para revender: a rotina do piloto não gasta essas unidades (pedra não vira evolução).
    reservarItens: (itemId, qtd) => paraHook({ tipo: 'reservar-itens', itemId, qtd }),
    pagina,
    temJogo: () => temJogo,
    conectado: () => status.conectado,
    versaoJogo: () => status.versaoJogo,
    storage,
  });

  try {
    document.addEventListener(EVT_SAIDA, aoHook);
    chrome.storage.onChanged.addListener(aoMudarStorage);
    document.addEventListener('DOMContentLoaded', () => {
      status.versaoJogo = versaoDoJogo();
      agendarEscrita(true);
    });
    setInterval(() => { if (temJogo && storage()) agendarEscrita(true); }, PULSO_STATUS_MS);
    iniciar();
    // 1.25: atualização (o service worker procura no GitHub; aqui só leva e traz para o painel)
    const CHAVE_UPD = 'piloto:update';
    const mandarUpd = (st) => { try { document.dispatchEvent(new CustomEvent('piloto:upd', { detail: JSON.stringify(st || {}) })); } catch (e) { erro(e); } };
    const lerUpd = () => { const s2 = storage(); if (s2) s2.get(CHAVE_UPD).then((r) => mandarUpd(r[CHAVE_UPD])).catch(() => {}); };
    chrome.storage.onChanged.addListener((m, area) => { if (area === 'local' && m[CHAVE_UPD]) mandarUpd(m[CHAVE_UPD].newValue); });
    document.addEventListener('piloto:upd-pedir', (ev) => {
      let d = {};
      try { d = JSON.parse(ev.detail) || {}; } catch { return; }
      const tipo = { checar: 'upd:checar', aplicar: 'upd:aplicar', dispensar: 'upd:dispensar' }[d.acao];
      if (!tipo || !storage()) return;
      chrome.runtime.sendMessage({ tipo, versao: typeof d.versao === 'string' ? d.versao : null, limparAviso: d.limparAviso === true })
        .then((r) => { document.dispatchEvent(new CustomEvent('piloto:upd-resposta', { detail: JSON.stringify({ acao: d.acao, r: r && r.dados }) })); lerUpd(); })
        .catch((e) => { document.dispatchEvent(new CustomEvent('piloto:upd-resposta', { detail: JSON.stringify({ acao: d.acao, erro: String(e && e.message || e) }) })); });
    });
    setTimeout(lerUpd, 1500);
  } catch (e) {
    erro(e);
  }
})();
