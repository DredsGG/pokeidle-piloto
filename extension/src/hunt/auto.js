// Automação: trocar sozinho para a melhor hunt e repor bolas, poções e revives.
//
// As duas vêm DESLIGADAS. Ligadas, elas mandam pelo socket do jogo os mesmos comandos que os
// botões do jogo mandam — `hunt.select`, `centro.ir`, `centro.curar`, `shop.buy` — e respeitam as
// mesmas travas que o servidor cobra (3 s fora de combate e a porta de 10 s entre trocas de área).
// Os Termos (seção 5) permitem automação no jogo, desde que siga as regras de quem joga na mão e
// não sobrecarregue o servidor: aqui são poucos comandos por hora.
//
// Trocar de hunt usa o ranking do /hunt (o modelo). Como o modelo pode errar numa hunt nova, a
// troca é CONFERIDA: depois de ~35 min caçando lá, se o XP/h medido ficou abaixo do que você
// fazia antes, a automação volta para a hunt anterior e deixa a nova de castigo por 12 h.
(function (root) {
  'use strict';
  const PIH = (root.__pokeidleHunt ??= {});
  if (!PIH.on || !PIH.engine) return;

  const CHAVE = 'pokeidle-hunt:auto:v1';
  const PADRAO = {
    hunt: { ligado: false, criterio: 'xp', intervaloMin: 30, margemPct: 10, evitarRisco: true, curar: true, conferir: true },
    repor: { ligado: false, reservaOuro: 5_000_000, intervaloMin: 3, irAoCentro: true, alvos: {} },
  };
  const ler = () => {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE)) ?? {};
      return { hunt: { ...PADRAO.hunt, ...s.hunt }, repor: { ...PADRAO.repor, ...s.repor, alvos: { ...(s.repor?.alvos ?? {}) } }, castigo: s.castigo ?? {}, troca: s.troca ?? null };
    } catch { return structuredClone({ ...PADRAO, castigo: {}, troca: null }); }
  };
  let cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };

  let welcome = null;
  let eu = null;
  PIH.on('welcome', (m) => { welcome = m; carregarCatalogo(); });

  // ---- diário (o que a automação fez, para você conferir) --------------------------------
  const diario = [];
  const hora = (t = Date.now()) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function anotar(txt, tipo = 'info') {
    diario.unshift({ t: Date.now(), txt, tipo });
    diario.length = Math.min(diario.length, 30);
    console.info('[pokeidle-hunt/auto]', txt);
    PIH.emit?.('auto.diario', diario);
  }
  let ultimoErro = null;
  PIH.on('erro', (m) => { ultimoErro = { t: Date.now(), chave: m?.chave ?? null, msg: m?.msg ?? null }; });
  const erroDepoisDe = (t0) => (ultimoErro && ultimoErro.t >= t0 ? ultimoErro.chave || ultimoErro.msg || 'erro' : null);

  // ---- onde estou ------------------------------------------------------------------------
  const pkAtivo = () => eu?.pokemons?.find((p) => p.id === eu.activeId) ?? null;
  const naHunt = () => !!eu?.huntSlug && !eu.noCentro && !eu.casa?.dentro && !eu.boss?.arena && !eu.mistico && !eu.safari?.dentro;
  const agoraServidor = () => Number(eu?.servidorAgora) || Date.now();
  // Fora de combate: a trava de 3 s do Centro já passou. (O carimbo vem do servidor no snapshot.)
  const foraDeCombate = () => (Number(eu?.centroLivreEm) || 0) <= agoraServidor();

  // ---- o ranking (mesma conta do painel /hunt) -------------------------------------------
  async function ranking(criterio) {
    const pk = pkAtivo();
    if (!pk || !welcome || !eu) return null;
    const jogo = await PIH.carregarJogo();
    const chave = PIH.geo?.chaveDoPokemon(pk);
    const precoItem = new Map(jogo.precoItem);
    for (const i of welcome.itensNossos ?? []) if (i?.name && Number(i.npcPrice) > 0) precoItem.set(i.name, Number(i.npcPrice));
    const ctx = {
      mod: jogo.mod, especies: jogo.especies, precoItem, hunts: welcome.hunts ?? [],
      consts: { tabelaTipos: welcome.tabelaTipos, ampliacaoHunt: welcome.ampliacaoHunt, multHpSelvagem: welcome.multHpSelvagem, multDanoSelvagem: welcome.multDanoSelvagem, tiposBoost: welcome.tiposBoost },
      eu,
      bonusLootPct: PIH.lootPct ? PIH.lootPct(jogo, eu, welcome) : 0,
      geo: (slug) => PIH.geo?.daHunt(slug) ?? null,
      ritmoMedido: (slug) => (chave ? PIH.geo?.ritmoMedido(slug, chave) ?? null : null),
    };
    const prefs = (() => { try { return JSON.parse(localStorage.getItem('pokeidle-hunt:prefs:v1')) ?? {}; } catch { return {}; } })();
    return PIH.engine.analisar(pk, ctx, { ordem: criterio === 'ouro' ? 'ouro' : 'xp', soLiberadas: true, comPocao: prefs.comPocao ?? true });
  }
  const valorDe = (l, criterio) => (criterio === 'ouro' ? l.ouroH : l.xpPokemonH);
  const arriscada = (l) => l.umHit || l.mortesH >= 0.2 || l.hitPct >= 0.5;

  // ---- a rotina de deslocamento (uma de cada vez) ----------------------------------------
  let rotina = null; // { destino, curar, compras, etapa, desde, tentativas, motivo }
  const ocupado = () => !!rotina;

  function iniciarRotina({ destino, curar, compras = [], motivo }) {
    if (rotina) return false;
    rotina = { destino, curar, compras, motivo, etapa: 'esperar', desde: Date.now(), tentativas: 0, origem: eu?.huntSlug ?? null };
    anotar(`${motivo} — esperando sair de combate`);
    passo();
    return true;
  }
  function encerrar(txt, tipo = 'info') {
    rotina = null;
    if (txt) anotar(txt, tipo);
  }

  function comprar(lista) {
    for (const c of lista) {
      const r = PIH.pedir({ t: 'shop.buy', kind: c.kind, id: c.id, qty: c.qty }, 'hunt');
      anotar(r.ok ? `comprando ${c.qty.toLocaleString('pt-BR')}× ${c.nome}` : `não comprou ${c.nome}: ${r.motivo}`, r.ok ? 'info' : 'aviso');
    }
  }

  /** Avança a rotina; chamado a cada snapshot de estado e por um relógio de 2 s. */
  function passo() {
    const r = rotina;
    if (!r || !eu) return;
    const agora = Date.now();
    const parado = agora - r.desde;
    if (r.etapa === 'esperar') {
      if (!naHunt() && !eu.noCentro) { if (parado > 120_000) encerrar('cancelado: você não está numa hunt', 'aviso'); return; }
      if (eu.noCentro) { r.etapa = 'centro'; r.desde = agora; return passo(); }
      if (!foraDeCombate()) { if (parado > 10 * 60_000) encerrar('cancelado: 10 min sem sair de combate', 'aviso'); return; }
      if (!r.curar && !r.compras.length) {
        PIH.enviar({ t: 'hunt.select', slug: r.destino });
        r.etapa = 'voltar'; r.desde = agora; r.enviadoEm = agora;
        return;
      }
      PIH.enviar({ t: 'centro.ir' });
      r.etapa = 'indo'; r.desde = agora; r.enviadoEm = agora;
      return;
    }
    if (r.etapa === 'indo') {
      if (eu.noCentro) { r.etapa = 'centro'; r.desde = agora; return passo(); }
      const erro = erroDepoisDe(r.enviadoEm);
      if ((erro || parado > 15_000) && r.tentativas < 3) { r.tentativas++; r.etapa = 'esperar'; r.desde = agora; return; }
      if (parado > 15_000) encerrar(`não consegui ir ao Centro${erro ? ` (${erro})` : ''}`, 'erro');
      return;
    }
    if (r.etapa === 'centro') {
      if (r.curar) PIH.enviar({ t: 'centro.curar' });
      if (r.compras.length) comprar(r.compras);
      r.etapa = 'sair'; r.desde = agora;
      return;
    }
    if (r.etapa === 'sair') {
      if (parado < 1500) return; // deixa a cura e a compra chegarem antes de sair
      PIH.enviar({ t: 'hunt.select', slug: r.destino });
      r.etapa = 'voltar'; r.desde = agora; r.enviadoEm = agora; r.tentativas = 0;
      return;
    }
    if (r.etapa === 'voltar') {
      if (eu.huntSlug === r.destino && !eu.noCentro) return encerrar(`pronto: caçando em ${nomeHunt(r.destino)}`, 'ok');
      // a porta de 10 s entre trocas, ou o "voltar à hunt" do jogo correndo junto: tenta de novo
      if (parado > 6000 && r.tentativas < 5) {
        r.tentativas++; r.desde = agora; r.enviadoEm = agora;
        PIH.enviar({ t: 'hunt.select', slug: r.destino });
        return;
      }
      if (parado > 6000) {
        const erro = erroDepoisDe(r.enviadoEm);
        encerrar(`não consegui entrar em ${nomeHunt(r.destino)}${erro ? ` (${erro})` : ''}`, 'erro');
        // nunca deixar você parado no Centro
        if (eu.noCentro && r.origem && r.origem !== r.destino) PIH.enviar({ t: 'hunt.select', slug: r.origem });
      }
    }
  }
  const nomeHunt = (slug) => (welcome?.hunts ?? []).find((h) => h.slug === slug)?.nome ?? slug;

  // ---- 1. a melhor hunt ------------------------------------------------------------------
  let ultimaAnalise = 0;
  async function avaliarHunt(forcar = false) {
    const c = cfg.hunt;
    if (!forcar && (!c.ligado || ocupado() || !naHunt() || !PIH.cofre?.liberado('hunt'))) return;
    if (forcar && (ocupado() || !naHunt())) return anotar('teste: só funciona caçando numa hunt e sem outra ação em andamento', 'aviso');
    ultimaAnalise = Date.now();
    const r = await ranking(c.criterio);
    if (!r) return anotar('sem dados do jogo para analisar', 'aviso');
    const agora = Date.now();
    for (const [slug, ate] of Object.entries(cfg.castigo)) if (ate < agora) delete cfg.castigo[slug];
    const atual = r.linhas.find((l) => l.slug === eu.huntSlug) ?? null;
    const cands = r.linhas.filter((l) => !l.inviavel && l.liberada && !(cfg.castigo[l.slug] > agora) && !(c.evitarRisco && arriscada(l)));
    cands.sort((a, b) => valorDe(b, c.criterio) - valorDe(a, c.criterio));
    const melhor = cands[0];
    if (!melhor) return anotar('nenhuma hunt candidata', 'aviso');
    const un = c.criterio === 'ouro' ? 'ouro/h' : 'XP/h';
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    if (melhor.slug === eu.huntSlug) return anotar(`análise: você já está na melhor (${melhor.nome}, ${fmt(valorDe(melhor, c.criterio))} ${un})`);
    const vAtual = atual ? valorDe(atual, c.criterio) : 0;
    const ganho = vAtual > 0 ? (valorDe(melhor, c.criterio) / vAtual - 1) * 100 : Infinity;
    if (ganho < c.margemPct) {
      return anotar(`análise: ${melhor.nome} rende ${fmt(valorDe(melhor, c.criterio))} ${un}, só ${ganho.toFixed(0)}% acima da atual — fica (margem ${c.margemPct}%)`);
    }
    if (!c.ligado) {
      return anotar(`análise: ${melhor.nome} rende ${fmt(valorDe(melhor, c.criterio))} ${un} (+${Number.isFinite(ganho) ? ganho.toFixed(0) : '∞'}%) — ligue a troca automática para ir`, 'aviso');
    }
    // guarda o que você fazia antes, para conferir a troca depois
    // se você chegou aqui por uma troca, mede só desde a chegada
    const desde = cfg.troca?.para === eu.huntSlug && cfg.troca.em ? cfg.troca.em : 0;
    const medido = PIH.nivel?.ritmoMedido(pkAtivo()?.id, Date.now(), desde);
    const antes = medidaDe(medido, c.criterio);
    cfg.troca = c.conferir
      ? { de: eu.huntSlug, para: melhor.slug, criterio: c.criterio, antes, em: null, pkId: pkAtivo()?.id, etapa: 0 }
      : null;
    gravar();
    iniciarRotina({ destino: melhor.slug, curar: c.curar, compras: comprasPendentes(), motivo: `trocando para ${melhor.nome} (+${Number.isFinite(ganho) ? ganho.toFixed(0) : '∞'}% de ${un} no modelo)` });
  }

  const medidaDe = (m, criterio) => (!m ? null : criterio === 'ouro' ? m.ouro : m.pokemon);

  /**
   * A troca é conferida duas vezes, com o que você MEDIU lá (não o modelo):
   *  - aos ~6 min: o /hunt já mediu as ondas da hunt nova e o ranking se corrige; se agora ele
   *    aponta outra melhor, ou se o medido já está claramente pior que o de antes, sai na hora;
   *  - aos ~35 min: a conferência firme, com meia hora de medida.
   * Se piorou, volta para a hunt anterior e põe a nova de castigo por 12 h.
   */
  async function conferirTroca() {
    const t = cfg.troca;
    if (!t || ocupado() || !cfg.hunt.ligado) return;
    if (pkAtivo()?.id !== t.pkId) { cfg.troca = null; gravar(); return; }
    if (eu?.huntSlug !== t.para) { if (t.em) { cfg.troca = null; gravar(); } return; }
    if (!t.em) { t.em = Date.now(); gravar(); return; } // marca a chegada
    const min = (Date.now() - t.em) / 60_000;
    const un = t.criterio === 'ouro' ? 'ouro/h' : 'XP/h';
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    const castigar = (txt) => {
      cfg.castigo[t.para] = Date.now() + 12 * 3_600_000;
      cfg.troca = null; gravar();
      if (t.de) iniciarRotina({ destino: t.de, curar: false, compras: comprasPendentes(), motivo: txt });
      else anotar(txt, 'aviso');
    };
    if (t.etapa === 0 && min >= 6) {
      t.etapa = 1; gravar();
      const agora = PIH.nivel?.ritmoMedido(t.pkId, Date.now(), t.em);
      const v = medidaDe(agora, t.criterio);
      // margem larga aqui: 5 min de medida ainda balançam bastante
      if (v != null && t.antes && v < t.antes * 0.8) {
        return castigar(`checagem de 5 min: ${nomeHunt(t.para)} está dando ${fmt(v)} ${un}, bem abaixo dos ${fmt(t.antes)} de antes — voltando (12 h de castigo)`);
      }
      anotar(`checagem de 5 min: ${nomeHunt(t.para)} ${v != null ? `está dando ${fmt(v)} ${un}` : 'ainda sem medida'}${t.antes ? ` (antes ${fmt(t.antes)})` : ''} — reanalisando com as ondas medidas`);
      ultimaAnalise = 0; // o ranking já corrigido decide se fica ou vai para outra
      return;
    }
    if (t.etapa === 1 && min >= 35) {
      const agora = PIH.nivel?.ritmoMedido(t.pkId, Date.now(), t.em);
      const v = medidaDe(agora, t.criterio);
      if (v == null || (agora?.minutos ?? 0) < 25) return;
      if (t.antes && v < t.antes * 0.95) {
        return castigar(`conferência de 30 min: ${nomeHunt(t.para)} deu ${fmt(v)} ${un}, abaixo dos ${fmt(t.antes)} de antes — voltando (12 h de castigo)`);
      }
      anotar(`conferência ok: ${nomeHunt(t.para)} deu ${fmt(v)} ${un}${t.antes ? ` (antes ${fmt(t.antes)})` : ''}`, 'ok');
      cfg.troca = null; gravar();
    }
  }

  // ---- 2. reposição ----------------------------------------------------------------------
  /** O que a automação do JOGO usa: as bolas, poções e revives marcados nela. */
  function itensVigiados() {
    const a = eu?.automation ?? {};
    const lista = [];
    for (const id of a.ballIds ?? []) {
      const b = (welcome?.catalogoBolas ?? []).find((x) => x.id === id);
      if (b?.compravel && b.priceGold > 0) lista.push({ chave: `b${id}`, kind: 'ball', id, nome: b.nome, preco: b.priceGold, tem: eu.balls?.[id] ?? 0, cat: 'bola' });
    }
    const itemDe = (id) => jogoCache?.itensPorId?.get(Number(id));
    for (const [ids, cat] of [[a.potionIds, 'pocao'], [a.reviveIds, 'revive']]) {
      for (const id of ids ?? []) {
        const it = itemDe(id);
        // Preço de COMPRA é o priceGold; o npcPrice é o que o NPC pagava de volta (o 1.2.0 usava esse).
        const preco = Number(it?.priceGold) || 0;
        if (it && preco > 0) lista.push({ chave: `i${id}`, kind: 'item', id: Number(id), nome: it.name, preco, tem: eu.items?.[id] ?? 0, cat });
      }
    }
    return lista;
  }
  const PADRAO_ALVO = { bola: { min: 1000, alvo: 10000 }, pocao: { min: 200, alvo: 1000 }, revive: { min: 20, alvo: 100 } };
  const alvoDe = (it) => ({ ...PADRAO_ALVO[it.cat], ...cfg.repor.alvos[it.chave] });

  /** O que está abaixo do mínimo, com a quantidade que cabe no ouro acima da reserva. */
  function comprasPendentes() {
    if (!cfg.repor.ligado || !eu) return [];
    // O cofre manda: piso de ouro, teto do dia e teto da categoria. A reserva daqui é um piso a mais.
    const doCofre = PIH.cofre ? PIH.cofre.livre('repor') : 0;
    let livre = Math.min((Number(eu.gold) || 0) - (Number(cfg.repor.reservaOuro) || 0), doCofre);
    const out = [];
    for (const it of itensVigiados()) {
      const { min, alvo } = alvoDe(it);
      if (it.tem >= min) continue;
      let qty = Math.min(9999, Math.max(0, alvo - it.tem)); // o Market vende até 9.999 por compra
      qty = Math.min(qty, Math.floor(livre / it.preco));
      if (qty < 1) continue;
      livre -= qty * it.preco;
      out.push({ ...it, qty });
    }
    return out;
  }

  let precisaCentro = false;
  let ultimaReposicao = 0;
  async function avaliarReposicao(forcar = false) {
    const c = cfg.repor;
    if (!forcar && (!c.ligado || ocupado() || !PIH.cofre?.liberado('hunt'))) return;
    ultimaReposicao = Date.now();
    await carregarCatalogo();
    const lista = comprasPendentes();
    if (!lista.length) { if (forcar) anotar('reposição: nada abaixo do mínimo (ou ouro só até a reserva)'); return; }
    if (precisaCentro || eu?.noCentro) {
      if (eu?.noCentro) return comprar(lista);
      if (c.irAoCentro && naHunt()) return iniciarRotina({ destino: eu.huntSlug, curar: cfg.hunt.curar, compras: lista, motivo: 'reposição: indo ao Centro comprar' });
      return anotar('reposição: o jogo só vende no Centro — ligue "ir ao Centro para comprar"', 'aviso');
    }
    // primeiro tenta comprar de onde está; se o servidor recusar, passa a comprar no Centro.
    // Os 6 s contam a partir do envio de verdade (a fila pode segurar o pedido), e ouro que caiu
    // também conta como compra feita: senão compra em dobro (auditoria, caso E).
    const antes = new Map(lista.map((x) => [x.chave, x.tem]));
    const ouroAntes = Number(eu.gold) || 0;
    const t0 = Date.now();
    let ultimoEnvio = 0;
    const solta = PIH.on('piloto.enviado', (m) => { if (m.t === 'shop.buy' && m.origem === 'hunt') ultimoEnvio = m.em; });
    comprar(lista);
    const conferir = () => {
      if (!ultimoEnvio && Date.now() - t0 < 30_000) { setTimeout(conferir, 1000); return; }
      if (ultimoEnvio && Date.now() - ultimoEnvio < 6000) { setTimeout(conferir, 1000); return; }
      solta();
      const subiu = itensVigiados().some((x) => (antes.has(x.chave) && x.tem > antes.get(x.chave))) || (Number(eu.gold) || 0) < ouroAntes;
      if (!subiu) {
        precisaCentro = true;
        const erro = erroDepoisDe(t0);
        anotar(`reposição: a compra fora do Centro não entrou${erro ? ` (${erro})` : ''} — daqui em diante compra no Centro`, 'aviso');
        if (c.irAoCentro && naHunt() && !ocupado()) iniciarRotina({ destino: eu.huntSlug, curar: cfg.hunt.curar, compras: comprasPendentes(), motivo: 'reposição: indo ao Centro comprar' });
      }
    };
    setTimeout(conferir, 1000);
  }

  let jogoCache = null;
  async function carregarCatalogo() { if (!jogoCache) jogoCache = await PIH.carregarJogo().catch(() => null); return jogoCache; }

  // ---- relógio ---------------------------------------------------------------------------
  PIH.on('estado', (e) => { eu = e; passo(); });
  setInterval(() => {
    try {
      passo();
      const agora = Date.now();
      if (cfg.hunt.ligado && agora - ultimaAnalise > cfg.hunt.intervaloMin * 60_000) avaliarHunt().catch((err) => anotar(`erro na análise: ${err.message}`, 'erro'));
      if (cfg.repor.ligado && agora - ultimaReposicao > cfg.repor.intervaloMin * 60_000) avaliarReposicao().catch((err) => anotar(`erro na reposição: ${err.message}`, 'erro'));
      conferirTroca().catch((err) => anotar(`erro na conferência: ${err.message}`, 'erro'));
    } catch (err) { console.error('[pokeidle-hunt/auto]', err); }
  }, 2000);

  // ---- a aba ------------------------------------------------------------------------------
  const nf = new Intl.NumberFormat('pt-BR');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // Em minutos (com o painel refazendo a cada 1 s, segundos trocariam a aba inteira toda hora).
  const quanto = (ms) => (ms <= 0 ? 'agora' : ms < 60_000 ? 'menos de 1 min' : `${Math.ceil(ms / 60_000)} min`);

  function html() {
    const h = cfg.hunt;
    const p = cfg.repor;
    const agora = Date.now();
    const itens = eu ? itensVigiados() : [];
    const linhasItens = itens.length
      ? itens.map((it) => {
        const a = alvoDe(it);
        const baixo = it.tem < a.min;
        return `<tr><td>${esc(it.nome)}</td><td class="${baixo ? 'pih-alerta' : ''}">${nf.format(it.tem)}</td>
          <td><input type="number" min="0" step="1" value="${a.min}" data-alvo="${it.chave}" data-campo="min"></td>
          <td><input type="number" min="0" step="1" value="${a.alvo}" data-alvo="${it.chave}" data-campo="alvo"></td>
          <td>${nf.format(it.preco)}</td></tr>`;
      }).join('')
      : '<tr><td colspan="5" class="pih-dim">Marque bolas, poções e revives nas Automações do jogo.</td></tr>';
    const castigos = Object.entries(cfg.castigo).filter(([, ate]) => ate > agora);
    const K = PIH.kit;
    const sel = (k, v, ops) => `<select data-cfg="${k}">${ops.map(([o, r]) => `<option value="${o}" ${v === o ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
    const num = (k, v, min, max, step) => `<input type="number" min="${min}" ${max != null ? `max="${max}"` : ''} step="${step}" value="${v}" data-cfg="${k}">`;
    const cx = (k, v) => `<input type="checkbox" data-cfg="${k}" ${v ? 'checked' : ''}>`;
    const extra = [
      h.ligado ? `próxima análise em ${quanto(ultimaAnalise + h.intervaloMin * 60_000 - agora)}` : '',
      castigos.length ? `de castigo: ${castigos.map(([sl, ate]) => `${esc(nomeHunt(sl))} (${quanto(ate - agora)})`).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    const hunt = K.cartao({
      icone: 'cacar', titulo: 'Melhor hunt',
      dica: 'Vai sozinho para a hunt que mais rende. Espera sair de combate (trava de 3 s do jogo) antes de mudar.',
      interruptor: cx('hunt.ligado', h.ligado),
      acoes: K.botao('Analisar', 'data-acao="testar-hunt"'),
      corpo: `<div class="plt-linha">
          ${K.campo('Critério', sel('hunt.criterio', h.criterio, [['xp', 'XP/h'], ['ouro', 'Ouro/h']]))}
          ${K.campo('A cada (min)', num('hunt.intervaloMin', h.intervaloMin, 10, 240, 5))}
          ${K.campo('Margem %', num('hunt.margemPct', h.margemPct, 0, 200, 1), 'Só troca se a outra render pelo menos isso a mais')}
        </div>
        <div class="plt-linha">
          ${K.opcao(cx('hunt.curar', h.curar), 'Curar antes', 'Passa no Centro e cura antes de ir')}
          ${K.opcao(cx('hunt.evitarRisco', h.evitarRisco), 'Evitar risco', 'Fora hunts com 1 hit, mortes estimadas ou golpe que tira 50%+ do HP')}
          ${K.opcao(cx('hunt.conferir', h.conferir), 'Conferir troca', 'Aos 5 e aos 30 min refaz a conta com o medido e volta se piorou')}
        </div>${extra ? `<p class="plt-nota">${extra}</p>` : ''}`,
    });
    const repor = K.cartao({
      icone: 'repor', titulo: 'Reposição',
      dica: 'Repõe as bolas, poções e revives marcados nas Automações do jogo, sempre dentro do cofre.',
      interruptor: cx('repor.ligado', p.ligado),
      acoes: K.botao('Conferir', 'data-acao="testar-repor"'),
      corpo: `<div class="plt-linha">
          ${K.campo('Guardar (ouro)', num('repor.reservaOuro', p.reservaOuro, 0, null, 100000), 'Nunca gasta abaixo disso')}
          ${K.campo('A cada (min)', num('repor.intervaloMin', p.intervaloMin, 1, 60, 1))}
          ${K.opcao(cx('repor.irAoCentro', p.irAoCentro), 'Ir ao Centro', 'Se o jogo só vender no Centro: vai, compra, cura e volta')}
        </div>
        <table class="pih-tab pih-auto-tab"><thead><tr><th>Item</th><th>Tem</th><th>Mín.</th><th>Até</th><th>Preço</th></tr></thead><tbody>${linhasItens}</tbody></table>`,
    });
    const diarioHtml = K.cartao({
      icone: 'relogio', titulo: 'Diário', acoes: `<span class="pih-dim">${rotina ? esc(rotina.motivo) : 'parado'}</span>`,
      corpo: `<ul class="pih-diario">${diario.length ? diario.map((d) => `<li class="pih-d-${d.tipo}"><span>${hora(d.t)}</span> ${esc(d.txt)}</li>`).join('') : '<li class="pih-dim">nada ainda</li>'}</ul>`,
    });
    return hunt + repor + diarioHtml;
  }

  // ---- 1.13: as duas linhas da caça na aba Caçar (troca de hunt e reposição) ------------------
  function linhas(modo = 'manual') {
    const K = PIH.kit;
    const manual = modo === 'manual';
    const trava = modo === 'desligado';
    const h = cfg.hunt;
    const p = cfg.repor;
    const agora = Date.now();
    const itens = eu ? itensVigiados() : [];
    const baixos = itens.filter((it) => it.tem < alvoDe(it).min);
    const castigos = Object.entries(cfg.castigo).filter(([, ate]) => ate > agora);
    const stHunt = h.ligado ? [`${h.criterio === 'ouro' ? 'Ouro/h' : 'XP/h'} · análise ${quanto(ultimaAnalise + h.intervaloMin * 60_000 - agora) === 'agora' ? 'agora' : `em ${quanto(ultimaAnalise + h.intervaloMin * 60_000 - agora)}`}`,
      castigos.length ? `de castigo: ${castigos.map(([sl]) => esc(nomeHunt(sl))).join(', ')}` : '', rotina ? esc(rotina.motivo) : ''].filter(Boolean).join(' · ') : '';
    const stRepor = p.ligado ? (itens.length ? (baixos.length ? `baixo: ${baixos.map((x) => esc(x.nome)).join(', ')}` : `${itens.length} itens em dia`) : 'marque bolas e poções nas Automações do jogo') : '';
    const tabela = itens.length
      ? `<table class="plt-tab"><thead><tr><th>Item</th><th>Tem</th><th>Mínimo</th><th>Repõe até</th><th>Preço</th></tr></thead><tbody>${itens.map((it) => {
        const a = alvoDe(it);
        return `<tr><td>${esc(it.nome)}</td><td class="${it.tem < a.min ? 'pih-alerta' : ''}">${nf.format(it.tem)}</td>
          <td>${K.numero(`auto:alvo.${it.chave}.min`, a.min, 0, null, 1, trava)}</td><td>${K.numero(`auto:alvo.${it.chave}.alvo`, a.alvo, 0, null, 1, trava)}</td><td>${nf.format(it.preco)}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="plt-nota">Marque bolas, poções e revives nas Automações do jogo.</p>';
    return K.linha({ icone: 'cacar', nome: 'Troca de hunt', alvo: 'auto:hunt.ligado', on: h.ligado, trava, status: stHunt,
      dica: 'Vai sozinho para a hunt que mais rende. Espera sair de combate (trava de 3 s do jogo) antes de mudar.',
      ajustes: manual ? `${K.fcampo('Critério', K.escala('auto:hunt.criterio', h.criterio, [['xp', 'XP/h'], ['ouro', 'Ouro/h']], trava))}
        ${K.fcampo('A cada (min)', K.numero('auto:hunt.intervaloMin', h.intervaloMin, 10, 240, 5, trava))}
        ${K.fcampo('Margem %', K.numero('auto:hunt.margemPct', h.margemPct, 0, 200, 1, trava), 'Só troca se a outra render pelo menos isso a mais')}
        <span class="plt-f-quebra"></span>
        ${K.mini('auto:hunt.curar', h.curar, 'Curar antes', 'Passa no Centro e cura antes de ir', trava)}
        ${K.mini('auto:hunt.evitarRisco', h.evitarRisco, 'Evitar risco', 'Fora hunts com 1 hit, mortes estimadas ou golpe que tira 50%+ do HP', trava)}
        ${K.mini('auto:hunt.conferir', h.conferir, 'Conferir a troca', 'Aos 5 e aos 30 min refaz a conta com o medido e volta se piorou', trava)}
        ${K.acao('Analisar agora', 'data-acao="testar-hunt"', 'cacar', trava)}` : '' })
      + K.linha({ icone: 'repor', nome: 'Reposição', alvo: 'auto:repor.ligado', on: p.ligado, trava, status: stRepor,
        dica: 'Repõe as bolas, poções e revives marcados nas Automações do jogo, sempre dentro do cofre.',
        ajustes: manual ? `${K.fcampo('Guardar (ouro)', K.numero('auto:repor.reservaOuro', p.reservaOuro, 0, null, 100000, trava), 'Nunca gasta abaixo disso')}
          ${K.fcampo('A cada (min)', K.numero('auto:repor.intervaloMin', p.intervaloMin, 1, 60, 1, trava))}
          ${K.mini('auto:repor.irAoCentro', p.irAoCentro, 'Ir ao Centro', 'Se o jogo só vender no Centro: vai, compra, cura e volta', trava)}
          ${K.acao('Conferir agora', 'data-acao="testar-repor"', 'repor', trava)}
          <div class="plt-f-largo">${tabela}</div>` : '' });
  }

  // Mudança vinda do painel. "alvo.<chave>.<campo>" são os mínimos e alvos da reposição.
  function definir(caminho, v) {
    const partes = caminho.split('.');
    if (partes[0] === 'alvo') {
      const [, k, campo] = partes;
      cfg.repor.alvos[k] = { ...(cfg.repor.alvos[k] ?? {}), [campo]: Math.max(0, Math.round(Number(v) || 0)) };
      gravar();
      return;
    }
    const [grupo, campo] = partes;
    if (!cfg[grupo] || !(campo in cfg[grupo])) return;
    cfg[grupo][campo] = v;
    if (grupo === 'hunt' && campo === 'ligado' && v) { ultimaAnalise = 0; anotar('troca automática de hunt ligada'); }
    if (grupo === 'repor' && campo === 'ligado' && v) { ultimaReposicao = 0; anotar('reposição ligada'); }
    gravar();
  }
  const acoes = {
    'testar-hunt': () => avaliarHunt(true).catch((e) => anotar(e.message, 'erro')),
    'testar-repor': () => avaliarReposicao(true).catch((e) => anotar(e.message, 'erro')),
  };

  function ligar(painel, redesenhar) {
    for (const el of painel.querySelectorAll('[data-cfg]')) {
      el.addEventListener('change', () => {
        const [grupo, campo] = el.dataset.cfg.split('.');
        let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value.trim() === '' ? NaN : Number(el.value)) : el.value;
        if (el.type === 'number') {
          // 1.12.3: vazio não vira 0 (com 0 min a análise rodaria a cada 2 s); vale o mínimo do campo.
          if (!Number.isFinite(v)) { redesenhar(); return; }
          v = Math.max(Number(el.min) || 0, el.max !== '' ? Math.min(Number(el.max), v) : v);
        }
        cfg[grupo][campo] = v;
        if (grupo === 'hunt' && campo === 'ligado' && v) { ultimaAnalise = 0; anotar('troca automática de hunt ligada'); }
        if (grupo === 'repor' && campo === 'ligado' && v) { ultimaReposicao = 0; anotar('reposição ligada'); }
        gravar();
        redesenhar();
      });
    }
    for (const el of painel.querySelectorAll('[data-alvo]')) {
      el.addEventListener('change', () => {
        const k = el.dataset.alvo;
        cfg.repor.alvos[k] = { ...(cfg.repor.alvos[k] ?? {}), [el.dataset.campo]: Math.max(0, Math.round(Number(el.value) || 0)) };
        gravar();
        redesenhar();
      });
    }
    painel.querySelector('[data-acao="testar-hunt"]')?.addEventListener('click', () => avaliarHunt(true).then(redesenhar).catch((e) => anotar(e.message, 'erro')));
    painel.querySelector('[data-acao="testar-repor"]')?.addEventListener('click', () => avaliarReposicao(true).then(redesenhar).catch((e) => anotar(e.message, 'erro')));
  }

  // Perfil do botão único (Automático): liga as frentes sem mexer no resto da configuração.
  function aplicar(m) {
    if (m?.hunt) Object.assign(cfg.hunt, { ligado: !!m.hunt.ligado });
    if (m?.repor) Object.assign(cfg.repor, { ligado: !!m.repor.ligado });
    gravar();
  }
  PIH.auto = { html, ligar, aplicar, linhas, definir, acoes, diario: () => diario.slice(), proximaAnalise: () => ultimaAnalise + cfg.hunt.intervaloMin * 60_000, alvoDe, _interno: { comprasPendentes, itensVigiados, cfg: () => cfg, passo, rotina: () => rotina } };
})(globalThis);
