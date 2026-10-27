// Motor do "Onde caçar?" — simula o seu pokémon em cada hunt e ordena por XP/h ou ouro/h.
//
// Regras de combate: Pokepédia do jogo (capítulos Combate e Stats) e os módulos `shared/`
// importados ao vivo (curva de cooldown, desconto do Speed, efetividade amplificada, XP e ouro
// por abate, multiplicadores de boost). Constantes que o servidor manda no `welcome`
// (multiplicadores do selvagem, tabela de tipos) entram por `ctx.consts`.
//
// O que NÃO está no cliente e foi medido em jogo (ritmo das ondas, caminhada entre alvos,
// tempo de retarget) fica em MEDIDO, abaixo, e pode ser substituído pela geometria que a
// própria extensão mede enquanto você caça (ver geo.js).
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});

  // ---- regras do jogo que o cliente só documenta em texto (Pokepédia > Combate) -----------
  const REGRAS = {
    randMedio: 0.925, // aleatório(0,85–1,00)
    stab: 1.5,
    gapJogadorMs: 900, // intervalo mínimo entre golpes seus
    gapSelvagemS: 1.4, // intervalo mínimo entre golpes dele
    investidaPower: 30,
    investidaCdMs: 2000,
    pisoCdMs: 400, // piso do desconto fixo do IV de SPD
    msPorIvSpd: 10, // −10 ms por ponto de IV de SPD na Investida e no intervalo
    hpCombateMult: 12, // hpDeCombate = máx(24, arred(hp × 12))
    hpCombateMin: 24,
    ivSelvagemMedio: 16, // selvagem: IV sorteado 1–32 por mob
    poderMinimo: 15,
    ladoTmAoe: 11, // Pokepédia > TM: o disco AoE acerta um quadrado 11×11 centrado no pokémon
  };

  // ---- ritmo da hunt: medido em jogo (aprendido com o guia, ajustável por medição própria) --
  const MEDIDO = {
    retargetS: 1.0, // abate → primeiro golpe no próximo alvo
    cicloMinS: 1.8, // piso do ciclo de quem mata instantâneo
    gapOndaS: 2.8, // campo limpo → próxima onda
    msOndaS: 2.6, // jitter da onda repartido entre os mobs
    selvagemSPorTile: 1.9, // velocidade com que o selvagem converge ao herói
    heroiSPorTile: 0.26, // passo do herói
    fBusca: 0.31, // fração da distância média andada por abate
    spawnsPadrao: 15,
    maxSpawns: 16, // o jogo nunca põe mais de 16 selvagens por onda (MAX_MOBS do hunt-analyser)
    distPadrao: 20.6, // tiles — mediana das hunts medidas
    slotSinnohS: 30, // nv>150: reposição por slot
    slotOutrasS: 65,
    nivelOnda: 150, // até aqui a onda é global; acima, por slot
    respawnS: 3, // morte → volta ao jogo (sem contar a corrida)
    amostrasHp: 32, // abates simulados por espécie (IV de HP 1..32)
    maxAtaquesPorAbate: 4000,
    // TM AoE: quantos selvagens cada golpe acerta em média. 2,2 é o medido numa sessão real;
    // com as suas sessões medidas, a extensão recalibra (ver `calibrarAoe`).
    aoeAlvosPorGolpe: 2.2,
    aoeAlvosMin: 1,
    aoeAlvosMax: 6,
    aoeMaxEngajados: 15,
  };

  // A curva de XP do jogo (`xpTotalParaNivel`, a mesma de hunt/nivel.js): o desmaio cobra 10% do XP
  // do nível ATUAL do treinador (Pokepédia > Desmaiar e curar), a não ser com o Boost dos Atrasados.
  const xpTotal = (L) => (L <= 1 ? 0 : Math.round((50 / 3) * (L ** 3 - 6 * L ** 2 + 17 * L - 12)));
  const PERDA_DESMAIO = 0.1;

  /** O pokémon tem o disco AoE aplicado? (mesma leitura do selo "AoE" do jogo) */
  const temAoe = (pk) => {
    const v = pk?.tmAoe ?? pk?.tm_aoe;
    return v === true || v === 'true' || v === 1;
  };
  const mediana = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  /** `n` valores espalhados pela distribuição medida (quantis), do mais perto ao mais longe. */
  function quantis(valores, n) {
    const v = valores.slice().sort((a, b) => a - b);
    return Array.from({ length: n }, (_, i) => v[Math.min(v.length - 1, Math.floor(((i + 0.5) / n) * v.length))]);
  }

  /**
   * Todos os multiplicadores de XP ativos agora (Pokepédia > Níveis e XP: eles se MULTIPLICAM):
   * XP Boost (treinador) e XP Boost Pokémon, VIP, Boost da Guild e bônus do ranking da guild — os
   * quatro já na conta `multXp*` do jogo —, mais o bônus Twitch, o bônus na Kick, o evento e o
   * Boost dos atrasados.
   */
  function bonusXp(eu, ctx, agora = Date.now()) {
    const tiposBoost = ctx.consts.tiposBoost ?? [];
    const base = {
      pokemon: ctx.mod.analyser.multXpPokemon?.(eu ?? {}, agora, tiposBoost) ?? 1,
      treinador: ctx.mod.analyser.multXpTreinador?.(eu ?? {}, agora, tiposBoost) ?? 1,
    };
    const itens = [];
    const l = eu?.loja ?? {};
    const boostDe = (chave) => (agora < (l.boosts?.[chave] ?? 0) ? tiposBoost.find((b) => b.chave === chave)?.mult ?? 1 : 1);
    if (agora < (l.vipAte ?? 0)) itens.push({ nome: 'VIP', mult: ctx.mod.analyser.VIP_MULT_XP ?? 1.5, ambos: true, base: true });
    if (boostDe('xp') > 1) itens.push({ nome: 'XP Boost', mult: boostDe('xp'), treinador: true, base: true });
    if (boostDe('pokexp') > 1) itens.push({ nome: 'XP Boost Pokémon', mult: boostDe('pokexp'), pokemon: true, base: true });
    if (Number(eu?.guildBonusPct) > 0) itens.push({ nome: 'Ranking da guild', mult: 1 + eu.guildBonusPct / 100, ambos: true, base: true });
    if (agora < (eu?.guild?.boostAte ?? 0)) {
      const m = base.pokemon / itens.filter((i) => i.base && (i.ambos || i.pokemon)).reduce((s, i) => s * i.mult, 1);
      if (m > 1.0001) itens.push({ nome: 'Boost da Guild', mult: m, ambos: true, base: true });
    }
    const extra = { pokemon: 1, treinador: 1 };
    const somar = (item) => {
      itens.push(item);
      if (item.ambos || item.pokemon) extra.pokemon *= item.mult;
      if (item.ambos || item.treinador) extra.treinador *= item.mult;
    };
    const tw = eu?.twitch;
    if (tw?.assistindo && Number(tw.pctAtual) > 0) somar({ nome: 'Twitch', mult: 1 + tw.pctAtual / 100, ambos: true });
    const kk = eu?.kick;
    if (agora < (Number(kk?.bonus?.xp) || 0) && Number(kk?.pct) > 0) somar({ nome: 'Kick', mult: 1 + kk.pct / 100, ambos: true });
    const ev = eu?.evento;
    if (ev && agora < (ev.terminaEm ?? 0)) {
      const tr = Number(ev.xpTreinadorPct) || 0;
      const pk = Number(ev.xpPokemonPct) || 0;
      if (tr && tr === pk) somar({ nome: 'Evento', mult: 1 + tr / 100, ambos: true });
      else {
        if (pk) somar({ nome: 'Evento (pokémon)', mult: 1 + pk / 100, pokemon: true });
        if (tr) somar({ nome: 'Evento (treinador)', mult: 1 + tr / 100, treinador: true });
      }
    }
    const at = l.atrasados;
    if (at && Number(at.mult) > 1 && (eu?.level ?? 0) < (Number(at.alvo) || 0)) somar({ nome: 'Atrasados', mult: Number(at.mult), ambos: true });
    return { pokemon: base.pokemon * extra.pokemon, treinador: base.treinador * extra.treinador, itens };
  }

  const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const BASE_DE = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' };
  const tiposDe = (esp) => [esp.type1, esp.type2].filter(Boolean);
  const ivSpd = (iv) => Math.min(32, Math.max(1, Math.round(Number(iv) || 1)));
  const cdPeloIv = (ms, iv) => Math.max(REGRAS.pisoCdMs, ms - ivSpd(iv) * REGRAS.msPorIvSpd);

  function dano(nivel, power, atk, def, stab, efet) {
    const base = ((2 * nivel / 5 + 2) * power * Math.max(1, atk) / Math.max(1, def)) / 50 + 2;
    return base * (stab ? REGRAS.stab : 1) * efet * REGRAS.randMedio;
  }

  /** Stats do selvagem: IV médio, qualidade 1, potência I. */
  function statsSelvagem(esp, nivel, iv = REGRAS.ivSelvagemMedio) {
    const o = {};
    for (const k of STATS) o[k] = ((esp[BASE_DE[k]] ?? 0) + 2 * iv) * nivel / 100;
    return o;
  }

  /** Os golpes que o pokémon usa: liberados até o nível, com o desconto do Speed, mais o TM. */
  function golpesDoPokemon(pk, esp, mod) {
    const comSpeed = (cd) => mod.cooldown.cooldownGolpeComSpeed(cd, esp.baseSpeed, pk.ivs?.speed);
    const golpes = (esp.attacks ?? [])
      .filter((a) => (a.learnLevel ?? 1) <= (pk.level ?? 1))
      .map((a) => ({ ...a, cooldownMs: comSpeed(a.cooldownMs) }));
    if (pk.tmElemental && mod.tm?.golpeTmElemental) {
      const tm = mod.tm.golpeTmElemental(pk.tmElemental);
      golpes.push({ ...tm, cooldownMs: comSpeed(tm.cooldownMs) });
    }
    return golpes;
  }

  /**
   * Amplificação da hunt (Pokepédia > Tipos: "Na hunt a vantagem é 1.5× mais forte"):
   * ×2 → ×2,5 · ×4 → ×5,5 · ×0,5 → ×0,333 · ×0,25 → ×0,167 · ×0 e ×1 não mudam.
   * O jogo tirou `efetividadeHunt` do hunt-analyser.mjs na atualização de out/2026 (o painel do
   * mapa passou a mostrar a efetividade crua); a conta amplificada fica aqui.
   */
  function ampliar(v, fator) {
    if (!(v > 0) || v === 1) return v;
    return v > 1 ? 1 + (v - 1) * fator : v / fator;
  }

  function criarEfetividade(ctx) {
    const tabela = ctx.consts.tabelaTipos ?? {};
    const fator = ctx.consts.ampliacaoHunt ?? 1.5;
    const an = ctx.mod.analyser;
    const cru = typeof an.efetividade === 'function'
      ? an.efetividade
      : (atq, d1, d2, tab) => {
        const linha = tab[String(atq).toUpperCase()] ?? {};
        const m = (d) => linha[String(d).toUpperCase()] ?? 1;
        return m(d1) * (d2 && d2 !== d1 ? m(d2) : 1);
      };
    const cache = new Map();
    return (atq, d1, d2) => {
      const k = `${atq}|${d1}|${d2}`;
      let v = cache.get(k);
      if (v === undefined) {
        v = typeof an.efetividadeHunt === 'function'
          ? an.efetividadeHunt(atq, d1, d2 ?? null, tabela, fator)
          : ampliar(cru(atq, d1, d2 ?? null, tabela), fator);
        cache.set(k, v);
      }
      return v;
    };
  }

  /** A Investida sai no 1º tipo; só passa para o 2º se o alvo for imune ao 1º. */
  function tipoDaInvestida(tipos, ef, alvoTipos) {
    const [t1, t2] = tipos;
    if (t2 && ef(t1, alvoTipos[0], alvoTipos[1]) === 0) return t2;
    return t1;
  }

  /**
   * Segundos de luta por abate. A cada ataque o pokémon usa, entre os golpes prontos, o de
   * maior dano contra o alvo; sem golpe pronto vem a Investida; todo ataque ocupa o intervalo
   * global. O HP do selvagem rola por abate (IV 1–32) e as recargas correm no tempo morto.
   */
  function segundosPorAbate(golpes, investida, gapS, hps, mortoS) {
    const ordem = golpes.map((_, i) => i).filter((i) => golpes[i].d > 0).sort((a, b) => golpes[b].d - golpes[a].d);
    const pronto = golpes.map(() => 0);
    let proxInv = 0, t = 0, luta = 0;
    for (const hp of hps) {
      let feito = 0, ini = t, ultimo = t, ataques = 0;
      while (feito < hp) {
        if (++ataques > MEDIDO.maxAtaquesPorAbate) return Infinity;
        let i = -1;
        for (const j of ordem) if (pronto[j] <= t) { i = j; break; }
        if (i >= 0) {
          feito += golpes[i].d; pronto[i] = t + golpes[i].cdS; ultimo = t; t += gapS;
        } else if (investida.d > 0 && proxInv <= t) {
          feito += investida.d; proxInv = t + investida.cdS; ultimo = t; t += gapS;
        } else {
          let prox = investida.d > 0 ? proxInv : Infinity;
          for (const j of ordem) if (pronto[j] < prox) prox = pronto[j];
          if (!Number.isFinite(prox)) return Infinity;
          t = Math.max(t, prox);
        }
      }
      luta += ultimo - ini;
      t = ultimo + mortoS;
    }
    return luta / hps.length;
  }

  /**
   * O que o selvagem faz com você: dano por segundo e o pior golpe (rolagem máxima).
   * 1.33 (auditoria): o selvagem segue a mesma regra de luta do seu pokémon (Pokepédia > Combate):
   * a cada ataque, o golpe de maior dano entre os que já recarregaram; sem nenhum pronto, a
   * Investida; intervalo mínimo de 1,4 s entre ataques dele. Antes o modelo aplicava a média de
   * TODOS os golpes a cada 1,4 s, como se nada tivesse recarga — o dano por segundo saía ~1,5× maior
   * e, com o gasto de poção no ouro/h, isso pesaria no ranking. ⚠️ a Pokepédia descreve a regra para
   * "o pokemon"; que o servidor use a mesma para o selvagem é a leitura mais provável, não confirmada.
   */
  function ameacaDoSelvagem(esp, nivel, pk, ef, ctx) {
    const st = statsSelvagem(esp, nivel);
    const tiposPk = pk.tipos;
    const tiposEsp = tiposDe(esp);
    const multDano = ctx.consts.multDanoSelvagem ?? 1.8;
    const comSpeed = (cd) => (ctx.mod?.cooldown?.cooldownGolpeComSpeed ? ctx.mod.cooldown.cooldownGolpeComSpeed(cd, esp.baseSpeed, REGRAS.ivSelvagemMedio) : cd);
    const golpes = (esp.attacks ?? []).filter((a) => (a.learnLevel ?? 1) <= nivel).map((a) => {
      const fisico = a.category !== 'SPECIAL';
      const d = dano(nivel, Math.max(REGRAS.poderMinimo, a.power), fisico ? st.atk : st.spAtk,
        fisico ? pk.stats.def : pk.stats.spDef, tiposEsp.includes(a.type), ef(a.type, tiposPk[0], tiposPk[1]));
      return { d, cdS: Math.max(0.1, (Number(comSpeed(a.cooldownMs)) || 0) / 1000) };
    }).filter((g) => g.d > 0).sort((a, b) => b.d - a.d);
    const tipoInv = tipoDaInvestida(tiposEsp, ef, tiposPk);
    const inv = dano(nivel, REGRAS.investidaPower, st.atk, pk.stats.def, true, ef(tipoInv, tiposPk[0], tiposPk[1]));
    const cdInv = cdPeloIv(REGRAS.investidaCdMs, REGRAS.ivSelvagemMedio) / 1000;
    // 120 s de luta, do começo (tudo pronto): o selvagem fica muito mais tempo em você do que isso só
    // nos abates longos, e aí o ritmo já é o de recarga
    const pronto = golpes.map(() => 0);
    let t = 0, proxInv = 0, total = 0, hits = 0;
    while (t < 120) {
      let i = -1;
      for (let j = 0; j < golpes.length; j++) if (pronto[j] <= t) { i = j; break; }
      if (i >= 0) { total += golpes[i].d; pronto[i] = t + golpes[i].cdS; hits++; t += REGRAS.gapSelvagemS; }
      else if (inv > 0 && proxInv <= t) { total += inv; proxInv = t + cdInv; hits++; t += REGRAS.gapSelvagemS; }
      else { let prox = inv > 0 ? proxInv : Infinity; for (const p of pronto) if (p < prox) prox = p; if (!Number.isFinite(prox)) break; t = Math.max(t + 0.05, prox); }
    }
    const media = hits ? total / hits : inv;
    return {
      dps: (t > 0 ? total / t : 0) * multDano,
      hitMedio: media * multDano,
      hitMax: Math.max(inv, ...golpes.map((g) => g.d)) / REGRAS.randMedio * multDano,
    };
  }

  /** Acima do nível 150 o servidor repõe por slot, não por onda: é o teto físico da hunt. */
  function tetoDeReposicao(n, hunt) {
    if ((hunt.nivel ?? 0) <= MEDIDO.nivelOnda) return Infinity;
    const sinnoh = hunt.regiao === 'sinnoh' || String(hunt.slug).endsWith('_sinnoh');
    return n * 3600 / (sinnoh ? MEDIDO.slotSinnohS : MEDIDO.slotOutrasS);
  }

  /** Abates/h que a hunt entrega um a um: fila de chegada dos spawns, caminhada e reposição. */
  function abatesPorHora(dists, cicloS, hunt) {
    const d = dists.slice().sort((a, b) => a - b);
    const n = d.length;
    const dMed = d.reduce((s, x) => s + x, 0) / n;
    const caminho = dMed * MEDIDO.heroiSPorTile * MEDIDO.fBusca;
    const fEncontro = MEDIDO.selvagemSPorTile * MEDIDO.heroiSPorTile / (MEDIDO.selvagemSPorTile + MEDIDO.heroiSPorTile);
    let t = 0;
    for (const x of d) t = Math.max(t + cicloS + caminho, x * fEncontro);
    const porOnda = n * 3600 / (t + MEDIDO.gapOndaS);
    return Math.min(3600 / cicloS, porOnda, tetoDeReposicao(n, hunt));
  }

  /**
   * Com o TM AoE os abates saem em fluxo: cada golpe acerta `alvos` selvagens de uma vez e o
   * pokémon quase não anda — o selvagem só precisa ENTRAR no quadrado. O limite passa a ser a
   * chegada dos spawns (o penúltimo mais distante dita o ritmo: o último o herói vai buscar) e a
   * reposição do servidor.
   */
  function limiteAoe(dists, hunt) {
    const d = dists.slice().sort((a, b) => a - b);
    const dRitmo = d.length > 1 ? d[d.length - 2] : d[0];
    const raio = (REGRAS.ladoTmAoe - 1) / 2;
    const chegada = Math.max(0, dRitmo - raio) * MEDIDO.selvagemSPorTile;
    return Math.min(d.length * 3600 / (chegada + MEDIDO.gapOndaS), tetoDeReposicao(d.length, hunt));
  }
  const abatesPorHoraAoe = (dists, cicloS, hunt, alvos) => Math.min(3600 * alvos / cicloS, limiteAoe(dists, hunt));

  function simularHunt(h, pk, golpesPk, ef, ctx, opcoes) {
    const especiesHunt = (h.especies ?? [])
      .map((e) => ({ esp: ctx.especies.get(e.pokeId), pontos: Number(e.pontos) || 0 }))
      .filter((e) => e.esp && e.pontos > 0);
    const total = especiesHunt.reduce((s, e) => s + e.pontos, 0);
    if (!total) return null;
    const nivel = h.nivel ?? 1;

    // Quantos pontos de spawn: os pontos da própria hunt no jogo (no máximo 16 por onda). A
    // medição feita enquanto você caça só ajusta as DISTÂNCIAS — não o tamanho da hunt.
    const nSpawns = Math.max(1, Math.min(MEDIDO.maxSpawns, Math.round(total) || MEDIDO.spawnsPadrao));
    const medida = ctx.geo?.(h.slug) ?? null;
    const dists = medida?.dists?.length ? quantis(medida.dists, nSpawns) : Array(nSpawns).fill(MEDIDO.distPadrao);
    const mortoS = MEDIDO.msOndaS / dists.length + MEDIDO.retargetS;
    const gapS = cdPeloIv(REGRAS.gapJogadorMs, pk.ivs?.speed) / 1000;
    const cdInvS = cdPeloIv(REGRAS.investidaCdMs, pk.ivs?.speed) / 1000;

    let ttk = 0, dps = 0, hitMax = 0, hitMedio = 0, xpKill = 0, ouroKill = 0, lootKill = 0, efMedia = 0;
    let melhorGolpe = null, melhorDano = -1;
    const alvos = [];
    for (const { esp, pontos } of especiesHunt) {
      const w = pontos / total;
      const tiposAlvo = tiposDe(esp);
      const st = statsSelvagem(esp, nivel);
      const golpes = golpesPk.map((g) => {
        const fisico = g.category !== 'SPECIAL';
        const d = dano(pk.level, Math.max(REGRAS.poderMinimo, g.power), fisico ? pk.stats.atk : pk.stats.spAtk,
          fisico ? st.def : st.spDef, pk.tipos.includes(g.type), ef(g.type, tiposAlvo[0], tiposAlvo[1]));
        return { d, cdS: g.cooldownMs / 1000, g };
      });
      for (const g of golpes) {
        if (g.d * w > melhorDano) { melhorDano = g.d * w; melhorGolpe = g.g; }
      }
      const tipoInv = tipoDaInvestida(pk.tipos, ef, tiposAlvo);
      const investida = {
        d: dano(pk.level, REGRAS.investidaPower, pk.stats.atk, st.def, true, ef(tipoInv, tiposAlvo[0], tiposAlvo[1])),
        cdS: cdInvS,
      };
      const multHp = ctx.consts.multHpSelvagem ?? 5;
      const hps = [];
      for (let k = 0; k < MEDIDO.amostrasHp; k++) {
        const iv = 1 + Math.floor(k * 32 / MEDIDO.amostrasHp + 0.5);
        const hpStat = ((esp.baseHp ?? 0) + 2 * iv) * nivel / 100;
        hps.push(Math.max(REGRAS.hpCombateMin, Math.round(hpStat * REGRAS.hpCombateMult)) * multHp);
      }
      const s = segundosPorAbate(golpes, investida, gapS, hps, mortoS);
      if (!Number.isFinite(s)) { ttk = Infinity; break; }
      ttk += w * s;

      const ameaca = ameacaDoSelvagem(esp, nivel, pk, ef, ctx);
      dps += w * ameaca.dps;
      hitMedio += w * ameaca.hitMedio;
      hitMax = Math.max(hitMax, ameaca.hitMax);

      xpKill += w * ctx.mod.recompensa.xpPorDerrota(h, nivel, esp);
      // Desde 15/10/2026 não há loot vendável ao NPC: o que ele pagava virou o bônus de loot que já
      // vem dentro de `ouroPorDerrotaHunt`, e o que cai são só pedras (que o NPC não compra). O /hunt
      // 1.2.0 ainda somava o loot antigo do creatures.json por cima (ouro/h inflado e ranking por
      // ouro fora de ordem). O bônus de Loot Boost/guild/evento entra pelo `bonusLootPct` do jogo.
      const bonusLoot = Number(ctx.bonusLootPct) || 0;
      ouroKill += w * (ctx.mod.recompensa.ouroDoAbate ? ctx.mod.recompensa.ouroDoAbate(nivel, bonusLoot).total : ctx.mod.recompensa.ouroPorDerrotaHunt(h, nivel, esp));
      alvos.push({ w, tiposAlvo });
    }
    for (const { w, tiposAlvo } of alvos) {
      efMedia += w * (melhorGolpe ? ef(melhorGolpe.type, tiposAlvo[0], tiposAlvo[1]) : 1);
    }

    const base = {
      hunt: h, slug: h.slug, nome: h.nome, nivel, regiao: h.regiao ?? h.area ?? null,
      liberada: (ctx.eu?.level ?? Infinity) >= nivel,
      geoMedida: !!medida?.dists?.length,
      melhorGolpe: melhorGolpe ? { nome: melhorGolpe.name, tipo: melhorGolpe.type } : null,
      efetividade: efMedia,
    };
    if (!Number.isFinite(ttk)) return { ...base, inviavel: true, motivo: 'não mata', xpPokemonH: 0, xpTreinadorH: 0, ouroH: 0, kph: 0 };

    const cicloS = Math.max(ttk + MEDIDO.retargetS, MEDIDO.cicloMinS);
    let kph = abatesPorHora(dists, cicloS, h);
    let modoAoe = false;
    let engajados = 1;
    if (opcoes.aoe) {
      const kAoe = abatesPorHoraAoe(dists, cicloS, h, opcoes.alvosAoe);
      if (kAoe > kph) { kph = kAoe; modoAoe = true; }
      // O preço do AoE: você segura todos os que entraram no quadrado. Selvagens vivos ao mesmo
      // tempo ≈ ritmo de chegada × tempo de vida de cada um (lei de Little).
      engajados = Math.min(MEDIDO.aoeMaxEngajados, 1 + kph * ttk / 3600);
    }

    // Morte: com poção automática só morre quem leva, de uma vez, mais que o HP inteiro — com
    // AoE, o pior golpe de um somado ao golpe médio de cada outro selvagem engajado; sem poção,
    // morre quando o dano acumulado nos abates passa do HP.
    const hpPk = pk.maxHp ?? Math.max(REGRAS.hpCombateMin, Math.round(pk.stats.hp * REGRAS.hpCombateMult));
    const danoPorAbate = dps * engajados * ttk;
    const hitPior = hitMax + (engajados - 1) * hitMedio;
    const umHit = hitPior >= hpPk;
    const abatesPorVida = opcoes.comPocao
      ? (umHit ? hpPk / hitPior : 999)
      : hpPk / Math.max(1e-6, danoPorAbate);
    // 1.32.2 (Larvitar Nv 20 com Ledyba Nv 230 no topo): quem morre antes de terminar UM abate não
    // farma nada — ao desmaiar o selvagem não fica com o dano, você vai para o Centro e perde 10% do
    // XP do nível. Antes o modelo somava pedaços de abate entre as mortes (0,04 abate por vida × 96
    // mortes/h) e a hunt subia para o 1º lugar pelo XP alto do selvagem de nível alto.
    if (abatesPorVida < 1) {
      return { ...base, inviavel: true, motivo: 'morre antes de matar', ttk, umHit, hitPct: hitPior / hpPk, mortesH: Infinity, abatesPorVida,
        xpPokemonH: 0, xpTreinadorH: 0, ouroH: 0, kph: 0, kphModelo: 0, xpKill, ouroKill };
    }
    const dMed = dists.reduce((s, x) => s + x, 0) / dists.length;
    const tempoMorte = MEDIDO.respawnS + dMed * MEDIDO.heroiSPorTile;
    const vidaS = abatesPorVida * (kph > 0 ? 3600 / kph : 0);
    const uptime = vidaS / (vidaS + tempoMorte);
    const mortesH = abatesPorVida >= 999 ? 0 : 3600 / (vidaS + tempoMorte);
    const kphModelo = kph * uptime;
    // O ranking é sempre o modelo de onda cheia, nas mesmas condições para todas as hunts. O que
    // você mediu caçando aqui (10+ min com este pokémon) aparece só como referência — senão a
    // hunt em que você está ganharia ou perderia posição por isso.
    const kphMedido = ctx.ritmoMedido?.(h.slug) ?? null;
    const kphEf = kphModelo;

    const multPk = opcoes.bonusXp?.pokemon ?? 1;
    const multTr = opcoes.bonusXp?.treinador ?? 1;

    // 1.33 (pedido do André): o gasto REAL de poção. A poção do jogo entra quando o HP cai até o
    // limiar (slider das Automações; padrão 30%) e cura um valor fixo (ou % do HP, a Golden Potion):
    // cada uma rende no máximo o que falta até o HP cheio. Poções por abate = dano levado no abate ÷
    // cura que rende; o custo sai do ouro/h. A poção é a da CONTA (a que está marcada no jogo).
    let pocoesH = 0, custoPocaoH = 0, curaEf = 0;
    const poc = opcoes.comPocao ? opcoes.pocao : null;
    if (poc && (Number(poc.cura) > 0 || Number(poc.curaPct) > 0)) {
      const lim = Math.min(1, Math.max(0.1, Number(poc.limiar) || 0.3));
      const cura = Number(poc.curaPct) > 0 ? Number(poc.curaPct) * hpPk : Number(poc.cura);
      curaEf = Math.max(1, Math.min(cura, Math.max(0.1, 1 - lim) * hpPk));
      pocoesH = (danoPorAbate / curaEf) * kphEf;
      custoPocaoH = pocoesH * (Number(poc.preco) || 0);
    }
    // 1.33: o XP do treinador que o desmaio leva (10% do nível atual por desmaio; ⚠️ o modelo conta
    // cada morte do ativo — com Revive automático o time quase nunca cai inteiro, então é o teto).
    const eu = ctx.eu ?? {};
    const nivelTr = Number(eu.level) || 0;
    const at = eu.loja?.atrasados;
    const semPerda = !!(at && Number(at.mult) > 1 && nivelTr < (Number(at.alvo) || 0));
    const xpPerdidoH = !semPerda && nivelTr > 0 && mortesH > 0 ? mortesH * PERDA_DESMAIO * (xpTotal(nivelTr + 1) - xpTotal(nivelTr)) : 0;
    const ouroBrutoH = kphEf * (ouroKill + lootKill);
    const xpTrH = kphEf * xpKill * multTr;

    return {
      ...base,
      inviavel: false,
      ttk, kph: kphEf, kphModelo, kphMedido, mortesH, umHit,
      hitPct: hitPior / hpPk,
      danoPorAbate,
      aoe: modoAoe, engajados,
      _cicloS: cicloS, _limiteAoe: limiteAoe(dists, h),
      xpPokemonH: kphEf * xpKill * multPk,
      xpTreinadorH: xpTrH - xpPerdidoH,
      xpTreinadorBrutoH: xpTrH, xpPerdidoH,
      ouroH: ouroBrutoH - custoPocaoH,
      ouroBrutoH, pocoesH, custoPocaoH, curaPocao: curaEf,
      // perde mais XP de treinador nos desmaios do que ganha; ou gasta mais em poção do que a hunt
      // rende e o saldo não aguenta um dia assim (conta grande paga do bolso; conta nova quebraria)
      perdeXp: xpPerdidoH > 0 && xpTrH - xpPerdidoH < 0,
      prejuizo: custoPocaoH > 0 && ouroBrutoH - custoPocaoH < 0 && (Number(eu.gold) || 0) < (custoPocaoH - ouroBrutoH) * 24,
      ouroKill, lootKill, xpKill,
    };
  }

  /**
   * Recalibra os alvos por golpe do AoE com as hunts em que você já caçou 10+ min com este
   * pokémon: abates/h medido × ciclo de abate ÷ 3600. Hunts em que o ritmo bateu na chegada ou
   * na reposição ficam de fora — ali o número de alvos não aparece.
   */
  function calibrarAoe(pk, golpes, ef, ctx, op) {
    if (!ctx.ritmoMedido) return null;
    const obs = [];
    const semMedida = { ...ctx, ritmoMedido: null };
    for (const h of ctx.hunts ?? []) {
      const medido = ctx.ritmoMedido(h.slug);
      if (!medido) continue;
      const r = simularHunt(h, pk, golpes, ef, semMedida, { ...op, alvosAoe: MEDIDO.aoeAlvosPorGolpe });
      if (!r || r.inviavel || medido >= 0.9 * r._limiteAoe) continue;
      obs.push(medido * r._cicloS / 3600);
    }
    if (!obs.length) return null;
    return {
      alvos: Math.min(MEDIDO.aoeAlvosMax, Math.max(MEDIDO.aoeAlvosMin, mediana(obs))),
      hunts: obs.length,
    };
  }

  /**
   * Analisa todas as hunts para o pokémon `pk` (um item de `estado.pokemons`).
   * `ctx`: { mod, especies, precoItem, hunts, consts, eu, geo, ritmoMedido }.
   * `opcoes`: { comPocao = true, ordem = 'xp' | 'ouro', soLiberadas = true }.
   */
  function analisar(pk, ctx, opcoes = {}) {
    const op = { comPocao: true, ordem: 'xp', soLiberadas: true, ...opcoes };
    // a poção da conta (marcada nas Automações do jogo): quem chama pode passar outra
    if (op.pocao === undefined) { try { op.pocao = PIH.pocaoDaConta ? PIH.pocaoDaConta() : null; } catch { op.pocao = null; } }
    const esp = ctx.especies.get(pk.speciesId);
    if (!esp) throw new Error(`espécie ${pk.speciesId} (${pk.nome}) não está no catálogo`);
    const stats = pk.stats ?? null;
    if (!stats) throw new Error('o jogo não mandou os stats deste pokémon');
    const poke = {
      ...pk,
      level: pk.level ?? 1,
      tipos: pk.tipos?.length ? pk.tipos : tiposDe(esp),
      stats,
    };
    const ef = criarEfetividade(ctx);
    const golpes = golpesDoPokemon(poke, esp, ctx.mod);
    const inicio = (typeof performance !== 'undefined' ? performance : Date).now();
    op.aoe = temAoe(poke);
    op.bonusXp = bonusXp(ctx.eu, ctx);
    const calibracao = op.aoe ? calibrarAoe(poke, golpes, ef, ctx, op) : null;
    op.alvosAoe = calibracao?.alvos ?? MEDIDO.aoeAlvosPorGolpe;
    const linhas = [];
    for (const h of ctx.hunts ?? []) {
      const r = simularHunt(h, poke, golpes, ef, ctx, op);
      if (r) linhas.push(r);
    }
    const chave = op.ordem === 'ouro' ? 'ouroH' : 'xpPokemonH';
    // as inviáveis (não mata / morre antes de matar) vão para o fim
    linhas.sort((a, b) => (Number(!!a.inviavel) - Number(!!b.inviavel)) || (b[chave] - a[chave]) || (a.nivel - b.nivel));
    return {
      pokemon: poke,
      especie: esp,
      golpes,
      aoe: op.aoe ? { alvosPorGolpe: op.alvosAoe, calibradoEm: calibracao?.hunts ?? 0 } : null,
      bonusXp: op.bonusXp,
      linhas: op.soLiberadas ? linhas.filter((l) => l.liberada) : linhas,
      total: linhas.length,
      ms: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - inicio),
    };
  }

  // 1.33: um critério de risco só, para a aba Caçar, a Troca de hunt, o rodízio e o Caçar o meta.
  const arriscada = (l) => !!l && (l.umHit || l.mortesH >= 0.2 || l.hitPct >= 0.5 || l.perdeXp || l.prejuizo);
  PIH.engine = { analisar, arriscada, REGRAS, MEDIDO, _interno: { xpTotal, dano, statsSelvagem, segundosPorAbate, abatesPorHora, abatesPorHoraAoe, golpesDoPokemon, temAoe, bonusXp, quantis } };
})(globalThis);
