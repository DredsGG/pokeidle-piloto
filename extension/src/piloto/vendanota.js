// 1.53.0: "Vender os de nota baixa" (ideia aprovada pelo André em 2026-11-09). DESLIGADA de fábrica e, mesmo
// ligada, só simula: lista no Diário o que venderia. A venda de verdade pede um segundo interruptor.
// Só vale com o Piloto em Automático. Uma rodada por hora, com limite por rodada.
//
// Como o jogo vende: um por um com shop.sellPokemon (app.js 1.412: o botão Vender do Market NPC), e só do
// Depot, porque a Coleção é o antigo cadeado de venda (automation.pokemonTravado). Daqui nunca sai o
// "Vender todo o Depot": cada venda leva o id de um pokémon que passou em todas as travas, conferido de
// novo logo antes do envio, e o hook recusa outra vez shiny, P5, time, ativo, item, inicial e Coleção.
// Da Coleção só sai quem o Piloto viu entrar sozinho na captura (o jogo não distingue o que você guardou
// à mão): volta ao Depot numa rodada e pode ser vendido só em outra. Abaixo do Nv 50, a regra do hook.
// Vender não gasta nada: o comando passa pelo cofre só para respeitar o Desligado e a parada de emergência.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;

  const CHAVE = 'piloto:vendanota:v1';
  const HORA_MS = 3_600_000;
  const CORTE_PADRAO = 2; // vende abaixo de 2,0: as duas faixas de baixo do jogo ("extremamente fraco" e "fraco")
  const CORTE_MAX = 3.4; // 3,5+ é o auto-lock do jogo e o mínimo do Mercado: nunca vende
  const NOTA_NUNCA = 3.5;
  const COL_NV_DEPOT = 50;
  const ENTROU_JANELA_MS = 15_000;
  const ENTRE_ENVIOS_MS = 2500;
  const lerJ = (d) => { try { return JSON.parse(localStorage.getItem(CHAVE)) ?? d; } catch { return d; } };
  const salvo = lerJ({});
  const cfg = {
    ligado: salvo.ligado === true,
    real: salvo.ligado === true && salvo.real === true,
    corte: Number.isFinite(Number(salvo.corte)) ? Math.min(CORTE_MAX, Math.max(0.5, Number(salvo.corte))) : CORTE_PADRAO,
    limite: Number.isInteger(salvo.limite) ? Math.min(20, Math.max(1, salvo.limite)) : 5,
    ultimaEm: Number(salvo.ultimaEm) || 0,
    entrouSozinho: Array.isArray(salvo.entrouSozinho) ? salvo.entrouSozinho.filter(Number.isInteger) : [],
  };
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem espaço */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`venda de nota baixa${txt}`, tipo);
  const nf = new Intl.NumberFormat('pt-BR');
  const notaTxt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  let eu = null;
  const naColecao = () => new Set(((eu && eu.automation && eu.automation.pokemonTravado) || []).map(Number));
  // quem chegou nesta sessão e já estava na Coleção em até 15 s entrou pela regra do jogo, não pela sua mão
  const conhecidos = new Set();
  const recemChegados = new Map();
  let primeira = true;
  function vigiarColecao() {
    const lista = (eu && eu.pokemons) || [];
    if (!lista.length) return;
    if (primeira) { primeira = false; for (const p of lista) if (p) conhecidos.add(p.id); return; }
    const agora = Date.now();
    for (const p of lista) if (p && !conhecidos.has(p.id)) { conhecidos.add(p.id); recemChegados.set(p.id, agora); }
    const col = naColecao();
    let mudou = false;
    for (const [id, t] of recemChegados) {
      if (col.has(id)) { recemChegados.delete(id); if (!cfg.entrouSozinho.includes(id)) { cfg.entrouSozinho.push(id); cfg.entrouSozinho = cfg.entrouSozinho.slice(-3000); mudou = true; } } else if (agora - t > ENTROU_JANELA_MS) recemChegados.delete(id);
    }
    if (mudou) gravar();
  }
  PIH.on('estado', (e) => { eu = e; vigiarColecao(); });

  let modNota; let modValor;
  const importar = (c) => import(`${location.origin}/shared/${c}.mjs`).catch(() => null);
  async function modulos() {
    if (modNota === undefined) modNota = await importar('nota-pokemon');
    if (modValor === undefined) modValor = await importar('sell-value');
    return { N: modNota, V: modValor };
  }

  const ativa = () => cfg.ligado === true && PIH.modo?.atual?.() === 'automatico' && PIH.cofre?.liberado?.('vendanota') === true;

  /** O motivo para ficar (nome fixo, sem dado de terceiros) ou null. Sem certeza, fica. */
  function porQueFica(p, ctx) {
    if (p.shiny) return 'é shiny';
    if (Number(p.potencia) >= 5) return 'é P5';
    if (p.id === eu.activeId) return 'é o ativo';
    if (p.slot != null) return 'está no time';
    if (Number(p.heldItemId) > 0) return 'segura item';
    if (p.starter) return 'é o inicial';
    if (p.tmElemental || p.tmAoe || Object.values(p.refino || {}).some((v) => Number(v) > 0)) return 'tem TM ou refino';
    if (ctx.guarda.has(p.id)) return 'a Guarda protege';
    if (ctx.familia.has(p.speciesId)) return 'família do alvo';
    if (ctx.outros.has(p.id)) return 'o Caçar o meta, o Melhorar o time ou o Modo farm protegem';
    if (ctx.col.has(p.id)) {
      if ((Number(p.level) || 0) >= COL_NV_DEPOT) return 'na Coleção: Nv 50+';
      if (!cfg.entrouSozinho.includes(p.id)) return 'na Coleção: guardado por você';
    }
    return null;
  }
  function contexto() {
    const G = PIH.guarda && PIH.guarda.resumo ? PIH.guarda.resumo() : null;
    if (!G || !G.pronto) return null;
    const lista = (f) => { try { return f() || []; } catch { return []; } };
    return {
      guarda: new Set(G.ids),
      col: naColecao(),
      familia: new Set([...lista(() => PIH.metaCaca.especiesAlvo()), ...lista(() => PIH.cacadas.especiesAlvo()), ...lista(() => PIH.farm.especiesAlvo())]),
      outros: new Set([...lista(() => PIH.metaCaca.protegidos()), ...lista(() => PIH.cacadas.protegidos()), ...lista(() => PIH.farm.protegidos()), ...lista(() => PIH.time.protegidos()), ...lista(() => PIH.time.doMeta())]),
    };
  }
  function notaDe(p, N, especies) {
    try {
      const esp = especies.get(p.speciesId);
      if (!esp) return null;
      const r = N.notaDePokemon(p, esp);
      const v = Number(r && typeof r === 'object' ? r.nota : r);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  }

  async function selecionar() {
    if (!eu || !Array.isArray(eu.pokemons)) return { espera: 'esperando o jogo' };
    const ctx = contexto();
    if (!ctx) return { espera: 'a Guarda ainda não está pronta' };
    const { N, V } = await modulos();
    if (!N || typeof N.notaDePokemon !== 'function') return { espera: 'a nota do jogo não carregou' };
    const jogo = await PIH.carregarJogo();
    const travas = {};
    const fica = (m) => { travas[m] = (travas[m] || 0) + 1; };
    const porEspecie = new Map();
    for (const p of eu.pokemons) if (p && !p.ovo) porEspecie.set(p.speciesId, (porEspecie.get(p.speciesId) || 0) + 1);
    const possiveis = [];
    for (const p of eu.pokemons) {
      if (!p || p.ovo) continue;
      const m = porQueFica(p, ctx);
      if (m) { fica(m); continue; }
      const nota = notaDe(p, N, jogo.especies);
      if (nota == null) { fica('sem nota'); continue; }
      if (nota >= cfg.corte || nota >= NOTA_NUNCA) { fica('nota no corte ou acima'); continue; }
      possiveis.push({ p, nota });
    }
    possiveis.sort((a, b) => a.nota - b.nota);
    // nunca o último da espécie (⚠️ não sei se vender o único exemplar atrapalha o registro na Pokédex)
    const escolhidos = [];
    for (const c of possiveis) {
      const resta = porEspecie.get(c.p.speciesId) || 0;
      if (resta <= 1) { fica('único da espécie'); continue; }
      porEspecie.set(c.p.speciesId, resta - 1);
      escolhidos.push(c);
    }
    const valor = (p) => { try { const v = Number(V && V.precoVendaDoPokemon ? V.precoVendaDoPokemon(p, (id) => jogo.especies.get(id)) : NaN); return Number.isFinite(v) ? v : 0; } catch { return 0; } };
    return { lista: escolhidos.slice(0, cfg.limite).map((c) => ({ id: c.p.id, nome: c.p.nome, level: c.p.level, nota: c.nota, coisa: ctx.col.has(c.p.id) ? 'colecao' : 'depot', valor: valor(c.p) })), total: escolhidos.length, travas };
  }

  const descreve = (c) => `${c.nome} Nv ${nf.format(c.level || 0)} nota ${notaTxt(c.nota)}${c.coisa === 'colecao' ? ' (Coleção)' : ''}`;
  let rodando = false;
  let avisoEm = 0;
  async function rodada(forcar = false) {
    if (rodando || !ativa()) return null;
    if (!forcar && Date.now() - cfg.ultimaEm < HORA_MS) return null;
    rodando = true;
    try {
      const s = await selecionar();
      if (s.espera) {
        if (Date.now() - avisoEm > HORA_MS) { avisoEm = Date.now(); diario(`: esperando (${s.espera})`, 'info'); }
        return s;
      }
      cfg.ultimaEm = Date.now();
      gravar();
      for (const [m, n] of Object.entries(s.travas)) diario(`: ${n} ${n === 1 ? 'fica' : 'ficam'}: ${m}`, 'info');
      const ouro = s.lista.filter((c) => c.coisa === 'depot').reduce((t, c) => t + c.valor, 0);
      if (cfg.real !== true) {
        diario(` (simulação): venderia ${s.lista.length} pokémon (${s.lista.map(descreve).join('; ') || 'nenhum'}) = ${nf.format(ouro)} de ouro`, 'info');
        return s;
      }
      for (const c of s.lista) {
        if (!ativa() || cfg.real !== true) { diario(': parei no meio da rodada', 'aviso'); break; }
        const ctx = contexto();
        const p = (eu.pokemons || []).find((x) => x && x.id === c.id);
        // confere de novo: o estado pode ter mudado desde a escolha
        if (!ctx || !p || porQueFica(p, ctx)) continue;
        if (c.coisa === 'colecao') {
          const r = PIH.pedir({ t: 'colecao.mover', pokemonId: c.id, para: 'depot' }, 'vendanota');
          if (r && r.ok) diario(`: tirei da Coleção para o Depot ${descreve(c)}`, 'ok'); else diario(`: não tirei da Coleção ${descreve(c)} (${(r && r.motivo) || 'recusado'})`, 'aviso');
        } else {
          const r = PIH.pedir({ t: 'shop.sellPokemon', pokemonId: c.id }, 'vendanota');
          if (r && r.ok) diario(`: vendi ${descreve(c)}`, 'ok'); else diario(`: não vendi ${descreve(c)} (${(r && r.motivo) || 'recusado'})`, 'aviso');
        }
        await espera(ENTRE_ENVIOS_MS);
      }
      return s;
    } finally { rodando = false; }
  }
  setInterval(() => { rodada(false).catch((e) => console.warn('[piloto] venda de nota baixa:', e)); }, 60_000);

  function linha(modo) {
    const trava = modo === 'desligado';
    const estado = !cfg.ligado ? 'desligada' : cfg.real ? 'VENDENDO DE VERDADE' : 'só simulando';
    return `${K.grupo('Venda de nota baixa')}${K.linha({ id: 'vendanota', icone: 'depot', nome: 'Vender os de nota baixa', alvo: 'vendanota:ligado', on: cfg.ligado, trava,
      status: estado,
      dica: 'Desligada de fábrica. Só em Automático, uma rodada por hora. Ligada, só simula: o Diário lista o que venderia. Vende um por um e nunca shiny, P5, time, ativo, quem segura item, o que a Guarda protege, a família dos alvos, nota 3,5+ nem o último da espécie.',
      ajustes: `${K.mini('vendanota:real', cfg.real, 'Vender de verdade', 'Venda não se desfaz. Desligado, só aparece no Diário o que seria vendido.', trava || !cfg.ligado)}${K.fcampo('Vender abaixo da nota', K.numero('vendanota:corte', cfg.corte, 0.5, CORTE_MAX, 0.1, trava))}${K.fcampo('No máximo por rodada', K.numero('vendanota:limite', cfg.limite, 1, 20, 1, trava))}` })}`;
  }
  function definir(caminho, v) {
    if (caminho === 'ligado') { cfg.ligado = v === true; if (!cfg.ligado) cfg.real = false; cfg.ultimaEm = 0; } else if (caminho === 'real') { cfg.real = cfg.ligado && v === true; } else if (caminho === 'corte') { if (Number.isFinite(Number(v))) cfg.corte = Math.min(CORTE_MAX, Math.max(0.5, Number(v))); } else if (caminho === 'limite') { if (Number.isFinite(Number(v))) cfg.limite = Math.min(20, Math.max(1, Math.round(Number(v)))); } else return;
    gravar();
  }
  PIH.vendaNota = { linha, definir, _interno: { cfg: () => cfg, rodada, selecionar, porQueFica } };
})(globalThis);
