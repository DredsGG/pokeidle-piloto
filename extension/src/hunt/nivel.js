// Meta de nível: quanto falta, quanto tempo leva e quando chega — para o treinador e para o
// pokémon em campo.
//
// A curva é a do jogo (`xpTotalParaNivel`, a mesma no cliente e no servidor): cúbica, sem teto.
// O XP por abate não muda com o SEU nível (só com o do selvagem), então numa mesma hunt o XP/h é
// constante e quem fica "mais difícil" é cada nível novo. Os bônus com prazo (XP Boost, VIP,
// Boost da Guild, Kick, evento) acabam no relógio de verdade: a projeção corta o ritmo no instante
// em que cada um vence.
//
// O ritmo pode vir do modelo do /hunt (uma hunt da lista) ou do que você MEDIU de verdade: a
// extensão anota o XP do treinador e do pokémon a cada pacote de estado e tira o XP/h da última
// meia hora contínua — mortes, idas ao Centro e trocas de onda entram na conta sozinhas.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});

  // ---- a curva ---------------------------------------------------------------------------
  /** XP TOTAL para estar no começo do nível L (igual a `xpTotalParaNivelCliente` do jogo). */
  const xpTotal = (L) => (L <= 1 ? 0 : Math.round((50 / 3) * (L ** 3 - 6 * L ** 2 + 17 * L - 12)));

  /** O nível em que se está com `xp` acumulado. */
  function nivelDoXp(xp) {
    let lo = 1;
    let hi = 2;
    while (xpTotal(hi) <= xp) hi *= 2;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xpTotal(m) <= xp) lo = m; else hi = m;
    }
    return lo;
  }

  // ---- a projeção ------------------------------------------------------------------------
  /**
   * Quanto tempo até juntar cada XP-alvo, com o ritmo mudando quando um bônus vence.
   *
   * `base`: XP/h SEM bônus nenhum. `multEm(t)`: o multiplicador total no instante t (ms).
   * `cortes`: instantes em que algum bônus vence (o multiplicador só muda neles).
   * `fracao`: parte do dia em que você caça (24 h/dia = 1). Os bônus vencem no relógio, cace ou não.
   * `alvos`: XP que falta para cada marco, em ordem crescente.
   * Devolve, para cada alvo, `{ ms, em }` — ou `null` se o ritmo for zero.
   */
  function projetar({ base, multEm, cortes = [], fracao = 1, agora = Date.now(), alvos }) {
    if (!(base > 0) || !(fracao > 0)) return alvos.map(() => null);
    const futuros = [...new Set(cortes.filter((c) => Number.isFinite(c) && c > agora))].sort((a, b) => a - b);
    const saida = [];
    let t = agora;
    let juntado = 0;
    let i = 0;
    let k = 0;
    while (i < alvos.length) {
      const fim = k < futuros.length ? futuros[k] : Infinity;
      const porMs = (base * multEm(t + 1) * fracao) / 3_600_000;
      if (!(porMs > 0)) { while (i++ < alvos.length) saida.push(null); break; }
      const capacidade = (fim - t) * porMs;
      if (juntado + capacidade >= alvos[i]) {
        const dt = (alvos[i] - juntado) / porMs;
        // não avança `t`: o próximo alvo pode cair no mesmo trecho
        saida.push({ ms: t + dt - agora, em: t + dt });
        i++;
        continue;
      }
      juntado += capacidade;
      t = fim;
      k++;
    }
    return saida;
  }

  /** Marcos "redondos" entre o nível atual e a meta (no máximo ~10, sempre com a meta). */
  function marcos(atual, meta, max = 10) {
    if (!(meta > atual)) return [];
    const dist = meta - atual;
    if (dist <= max) return Array.from({ length: dist }, (_, i) => atual + i + 1);
    const passos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
    const passo = passos.find((p) => dist / p <= max - 1) ?? Math.ceil(dist / (max - 1));
    const lista = [];
    for (let n = Math.ceil((atual + 1) / passo) * passo; n < meta; n += passo) lista.push(n);
    lista.push(meta);
    return lista;
  }

  // ---- o ritmo medido --------------------------------------------------------------------
  const JANELA_MS = 30 * 60_000; // olha a última meia hora
  const MINIMO_MS = 5 * 60_000; // e só diz alguma coisa com 5+ min contínuos
  const BURACO_MS = 3 * 60_000; // um intervalo maior que isso (aba fechada, sem conexão) corta a série
  const GUARDA_MS = 4 * 3_600_000;
  const PASSO_MS = 10_000;

  let chave = null;
  let amostras = [];
  let gravadoEm = 0;

  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? []; } catch { return []; } };
  const gravar = () => {
    if (!chave) return;
    try { localStorage.setItem(chave, JSON.stringify(amostras)); } catch { /* sem armazenamento */ }
    gravadoEm = Date.now();
  };

  function anotar(eu, agora = Date.now()) {
    if (!eu || eu.xp == null) return;
    const k = `pokeidle-hunt:xp:v1:${eu.nick ?? eu.id ?? 'eu'}`;
    if (k !== chave) { chave = k; amostras = ler(k); }
    const pk = eu.pokemons?.find((p) => p.id === eu.activeId);
    const ult = amostras[amostras.length - 1];
    const mudou = !ult || ult.pk !== (pk?.id ?? null) || (pk && ult.pl !== pk.level) || ult.tl !== eu.level;
    if (!mudou && agora - ult.t < PASSO_MS) return;
    amostras.push({ t: agora, tr: eu.xp, tl: eu.level, pk: pk?.id ?? null, px: pk?.xp ?? null, pl: pk?.level ?? null, g: Number(eu.gold) || 0, h: eu.huntSlug ?? null });
    while (amostras.length && agora - amostras[0].t > GUARDA_MS) amostras.shift();
    if (agora - gravadoEm > 60_000) gravar();
  }

  /** O trecho contínuo mais recente (sem buracos de conexão), dentro da janela. */
  function trechoRecente(agora) {
    const out = [];
    for (let i = amostras.length - 1; i >= 0; i--) {
      const a = amostras[i];
      if (agora - a.t > JANELA_MS) break;
      if (out.length && out[out.length - 1].t - a.t > BURACO_MS) break;
      out.push(a);
    }
    return out.reverse();
  }

  /**
   * XP/h medido agora: `{ treinador, pokemon, minutos }`, ou null sem 5+ min contínuos.
   * O do pokémon só conta o tempo com ESTE pokémon em campo.
   */
  function ritmoMedido(pkId, agora = Date.now(), desde = 0) {
    const tr = trechoRecente(agora).filter((a) => a.t >= desde);
    if (tr.length < 2) return null;
    const ms = tr[tr.length - 1].t - tr[0].t;
    if (ms < MINIMO_MS) return null;
    const treinador = ((tr[tr.length - 1].tr - tr[0].tr) / ms) * 3_600_000;
    let pokemon = null;
    const dele = [];
    for (let i = tr.length - 1; i >= 0 && tr[i].pk === pkId && tr[i].px != null; i--) dele.unshift(tr[i]);
    if (dele.length >= 2 && dele[dele.length - 1].t - dele[0].t >= MINIMO_MS) {
      pokemon = ((dele[dele.length - 1].px - dele[0].px) / (dele[dele.length - 1].t - dele[0].t)) * 3_600_000;
    }
    // Ouro: só as SUBIDAS contam — uma compra (a reposição, por exemplo) não pode derrubar o ouro/h.
    let ganho = 0;
    for (let i = 1; i < tr.length; i++) { const d = (tr[i].g ?? 0) - (tr[i - 1].g ?? 0); if (d > 0) ganho += d; }
    const ouro = (ganho / ms) * 3_600_000;
    return { treinador: Math.max(0, treinador), pokemon: pokemon == null ? null : Math.max(0, pokemon), ouro, minutos: Math.round(ms / 60_000) };
  }

  // ---- onde você está caçando ------------------------------------------------------------
  let huntAtual = null;
  PIH.on?.('campo.init', (m) => {
    huntAtual = m?.slug && !m.centro && !m.pvp && m.casa == null ? m.slug : null;
  });
  PIH.on?.('estado', (eu) => anotar(eu));
  addEventListener('pagehide', gravar);

  PIH.nivel = {
    xpTotal,
    nivelDoXp,
    projetar,
    marcos,
    ritmoMedido,
    huntAtual: () => huntAtual,
    _interno: { anotar, trechoRecente, limpar: () => { amostras = []; } },
  };
})(globalThis);
