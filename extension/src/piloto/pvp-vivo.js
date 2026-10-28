// PvP ao vivo (1.35, pedido do André): na janelinha da partida e na tela cheia, em cada canto, o
// nome do treinador e os pokémon dele — acesos com HP cheio, apagando conforme perdem HP e
// cinza quando desmaiam.
//
// 1.36.0: lista vertical com os 6 de cada lado desde o começo (a fita inteira é lida na largada), moldura
// em quem está lutando.
//
// Como: o jogo toca a fita da partida com o player ReplayGuerra (/replay.mjs, o mesmo da Guerra de
// Guilds). Importando o MESMO módulo, o Piloto anota cada player que começa (iniciar) e termina
// (destruir) e lê, a cada 250 ms, o que ele já expõe: os atores (vaga, lado, dono, pokémon,
// looktype) e o estado de cada vaga (hp, hp máximo, fora). Nada vai ao servidor; só desenha.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const esc = PIH.kit.esc;

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });

  const players = new Set();
  let ligado = false;
  async function ligar() {
    if (ligado) return true;
    try {
      const M = await import(`${location.origin}/replay.mjs`);
      const C = M && M.ReplayGuerra;
      if (!C || !C.prototype || typeof C.prototype.iniciar !== 'function' || typeof C.prototype.destruir !== 'function') return false;
      if (!C.prototype.__pltVivo) {
        const ini = C.prototype.iniciar;
        const fim = C.prototype.destruir;
        C.prototype.iniciar = function (...a) { try { players.add(this); } catch { /* segue */ } return ini.apply(this, a); };
        C.prototype.destruir = function (...a) { try { players.delete(this); limpar(this); } catch { /* segue */ } return fim.apply(this, a); };
        Object.defineProperty(C.prototype, '__pltVivo', { value: true });
      }
      ligado = true;
      return true;
    } catch { return false; }
  }
  // só no jogo (o /terms também carrega a extensão)
  if (/^\/app\b/.test(location.pathname)) { ligar(); setTimeout(ligar, 5000); }

  // ---- o elenco de cada lado, inteiro desde o primeiro segundo -----------------------------------
  // 1.36.0 (o André: "aparecer todos os Pokémon de cada lado... não aparecer só um"): a fita traz os
  // atores do começo (rep.atores) e cada troca de pokémon nos quadros (q.c: mesma vaga, outro bicho).
  // Varrendo a fita inteira na largada, o Piloto já sabe quem são os 6 de cada lado antes de entrarem.
  const chaveDe = (g, n, lt, nv) => `${g}:${n}:${lt}:${nv ?? ''}`;
  function elencoDaFita(pl) {
    const rost = new Map();
    const ladoDaVaga = new Map();
    const add = (g, c, ordem) => {
      const k = chaveDe(g, c.n, c.lt, c.nv);
      if (!rost.has(k)) rost.set(k, { g, nome: c.n, lt: c.lt, nv: c.nv, dono: c.dono || null, hp: Number(c.mhp) || Number(c.hp) || 1, mhp: Number(c.mhp) || 1, fora: false, entrou: false, ordem });
      return k;
    };
    const rep = pl.rep || {};
    let ordem = 0;
    for (const a of rep.atores || []) {
      if (!a || a.tr) continue;
      ladoDaVaga.set(a.s, a.g);
      add(a.g, a, ordem++);
    }
    for (const q of rep.quadros || []) {
      for (const c of (q && q.c) || []) {
        const g = ladoDaVaga.get(c.s);
        if (g == null) continue;
        add(g, c, ordem++);
      }
    }
    return rost;
  }
  const memo = new WeakMap(); // player -> { tv, rost: Map(chave -> pk), porVaga: Map(vaga -> chave), el }
  function ler(pl) {
    let m = memo.get(pl);
    const tv = Number(pl.tv) || 0;
    // voltou a fita: remonta do zero (o elenco é o mesmo; o estado de cada um, não)
    if (!m || tv + 50 < m.tv) { if (m && m.el) m.el.remove(); m = { tv, rost: elencoDaFita(pl), porVaga: new Map(), el: null }; memo.set(pl, m); }
    m.tv = tv;
    const atores = pl.atores instanceof Map ? [...pl.atores.values()] : [];
    const ativos = new Set();
    for (const a of atores) {
      if (!a || a.tr) continue;
      const chave = chaveDe(a.g, a.n, a.lt, a.nv);
      const ant = m.porVaga.get(a.s);
      if (ant && ant !== chave) { const v = m.rost.get(ant); if (v) v.fora = true; }
      m.porVaga.set(a.s, chave);
      const est = pl.estado instanceof Map ? pl.estado.get(a.s) : null;
      const pk = m.rost.get(chave) || { g: a.g, nome: a.n, lt: a.lt, dono: a.dono, nv: a.nv, ordem: m.rost.size };
      pk.hp = Number(est && est.hp != null ? est.hp : a.hp);
      pk.mhp = Number(est && est.mhp != null ? est.mhp : a.mhp);
      pk.fora = !!(est && est.fora) || (Number.isFinite(pk.hp) && pk.hp <= 0);
      pk.entrou = true;
      if (a.dono) pk.dono = a.dono;
      m.rost.set(chave, pk);
      if (!pk.fora) ativos.add(chave);
    }
    for (const [k, pk] of m.rost) pk.ativo = ativos.has(k);
    return m;
  }
  function limpar(pl) { const m = memo.get(pl); if (m && m.el) m.el.remove(); memo.delete(pl); }

  const dados = new Map();
  function arte(pk, px, chave) {
    if (!PIH.arte) return '';
    const d = { categoria: 'pokemon', looktype: pk.lt, speciesId: null, shiny: false, anuncioId: chave, nome: pk.nome };
    dados.set(PIH.arte.chave(d, px), d);
    return PIH.arte.lugar(d, px);
  }
  function pintar(pl) {
    const reps = pl.rep && Array.isArray(pl.rep.guilds) ? pl.rep.guilds : [];
    if (reps.length !== 2) return;
    const m = ler(pl);
    const canvas = document.getElementById(pl.mini ? 'pvp-mini-campo' : 'gwr-campo');
    const palco = canvas && canvas.parentElement;
    if (!palco || !canvas.isConnected) return;
    if (!m.el || !m.el.isConnected) {
      if (getComputedStyle(palco).position === 'static') palco.style.position = 'relative';
      m.el = document.createElement('div');
      m.el.className = `plt-pvv${pl.mini ? ' plt-pvv-mini' : ''}`;
      m.el.setAttribute('aria-hidden', 'true');
      palco.appendChild(m.el);
    }
    const px = pl.mini ? 18 : 30;
    const lados = [0, 1].map((g) => [...m.rost.values()].filter((p) => p.g === g).sort((a, b) => a.ordem - b.ordem).slice(0, 6));
    const nomeLado = (g) => lados[g].find((p) => p.dono)?.dono || (reps[g] && (reps[g].nome || reps[g].nick)) || '';
    const meu = eu && eu.nick ? [0, 1].find((g) => nomeLado(g) && String(nomeLado(g)).toLowerCase() === String(eu.nick).toLowerCase()) : undefined;
    const esq = meu === 1 ? 1 : 0;
    const assinatura = JSON.stringify(lados.map((l) => l.map((p) => [p.nome, p.fora, p.ativo, p.entrou, Math.round((p.hp / p.mhp) * 20)])));
    if (m.el.dataset.ass === assinatura) return;
    m.el.dataset.ass = assinatura;
    dados.clear();
    const lado = (g, cls) => {
      // lista vertical: quem está lutando com moldura, os que perdem HP apagando, os caídos em cinza
      const pks = lados[g].map((p, i) => {
        const vida = p.fora ? 0 : Number.isFinite(p.hp) && p.mhp > 0 ? Math.max(0, Math.min(1, p.hp / p.mhp)) : 1;
        const op = p.fora ? 0.25 : 0.45 + 0.55 * vida;
        const cls = `plt-pvv-pk${p.fora ? ' fora' : ''}${p.ativo ? ' ativo' : ''}${!p.entrou && !p.fora ? ' espera' : ''}`;
        const cor = vida > 0.5 ? '#6fdc8c' : vida > 0.2 ? '#f2c94c' : '#ef6b5b';
        return `<span class="${cls}" style="opacity:${op.toFixed(2)}" title="${esc(p.nome)}${p.nv ? ` Nv ${p.nv}` : ''}">${arte(p, px, `pvv:${g}:${i}:${p.lt}`)}<span class="plt-pvv-vida"><i style="width:${Math.round(vida * 100)}%;background:${cor}"></i></span></span>`;
      }).join('');
      const vivos = lados[g].filter((p) => !p.fora).length;
      return `<div class="plt-pvv-lado ${cls}"><b>${esc(nomeLado(g))}</b><span class="plt-pvv-pks">${pks}</span><small>${vivos}/${lados[g].length || 0}</small></div>`;
    };
    m.el.innerHTML = lado(esq, 'esq') + lado(1 - esq, 'dir');
    if (PIH.arte) PIH.arte.preparar().then(() => PIH.arte.hidratar(m.el, (k) => dados.get(k)));
  }
  setInterval(() => {
    if (!players.size) return;
    for (const pl of [...players]) {
      try { if (pl.vivo === false) { players.delete(pl); limpar(pl); continue; } pintar(pl); } catch (e) { console.warn('[piloto] pvp ao vivo:', e); }
    }
  }, 250);

  PIH.pvpVivo = Object.freeze({ ligar, _interno: { players, memo, ler } });
})(globalThis);
