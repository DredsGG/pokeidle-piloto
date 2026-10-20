// Idioma do Piloto (1.12): português (padrão), inglês ou espanhol, escolhido nas bandeirinhas do
// painel — nunca automático. O código continua escrevendo em português; este módulo traduz o que
// aparece na tela (texto, title, aria-label, placeholder) dentro das peças do Piloto e do Radar
// (inclusive o shadow DOM do Radar). Em português ele fica desligado: custo zero.
// O que não está no dicionário continua em português (nomes de pokémon e itens vêm do jogo).
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  const CHAVE = 'piloto:idioma';
  const IDIOMAS = ['pt', 'en', 'es'];
  const NOMES = { pt: 'Português', en: 'English', es: 'Español' };
  const ATRIBUTOS = ['title', 'aria-label', 'placeholder'];
  const RAIZES = '.plt-janela, .plt-painel, .plt-barra, .plt-mini-pilha, .plt-bandeja, .plt-pop, .plt-toast, .plt-voto, .pih-aviso';
  const HOSTS = ['radar-mercado-tela', 'radar-mercado-barra'];

  let atual = 'pt';
  try { const v = localStorage.getItem(CHAVE); if (IDIOMAS.includes(v)) atual = v; } catch { /* sem armazenamento */ }

  // ---- dicionário ---------------------------------------------------------------------------
  const dic = PIH.idiomaDic || { exato: {}, regras: [], trocarTrechos: (x) => x };
  const coluna = { en: 0, es: 1 };
  // Busca sem diferença de maiúsculas para o caso exato (o CSS é que deixa em caixa alta).
  const exatoMin = new Map(Object.entries(dic.exato).map(([k, v]) => [k.toLowerCase(), v]));
  const cache = { en: new Map(), es: new Map() };

  function traduzirNucleo(k, l) {
    const i = coluna[l];
    const e = dic.exato[k] || exatoMin.get(k.toLowerCase());
    if (e && e[i] != null) return e[i];
    for (const r of dic.regras) {
      if (!r[0].test(k)) continue;
      const alvo = r[1 + i];
      if (alvo == null) break;
      return dic.trocarTrechos(k.replace(r[0], typeof alvo === 'function' ? (...m) => alvo(m) : alvo), i);
    }
    const t = dic.trocarTrechos(k, i);
    return t !== k ? t : null;
  }

  function traduzir(s, l = atual) {
    if (l === 'pt' || !s) return s;
    const c = cache[l];
    if (c.has(s)) return c.get(s);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const nucleo = m[2];
    let saida = s;
    if (nucleo && /[\p{L}\d]/u.test(nucleo)) {
      const t = traduzirNucleo(nucleo, l);
      if (t != null) saida = m[1] + t + m[3];
    }
    if (c.size > 5000) c.clear();
    c.set(s, saida);
    return saida;
  }

  // ---- aplicar na tela ------------------------------------------------------------------------
  const memTexto = new WeakMap(); // nó de texto → { orig, saida }
  const memAttr = new WeakMap(); // elemento → { [attr]: { orig, saida } }

  function noTexto(n) {
    const p = n.parentNode;
    if (!p || (p.nodeType === 1 && /^(STYLE|SCRIPT|TEXTAREA)$/.test(p.nodeName))) return;
    const rec = memTexto.get(n);
    const dado = n.data;
    if (rec && dado === rec.saida) return; // já é a tradução que pusemos
    const orig = dado;
    const saida = traduzir(orig);
    memTexto.set(n, { orig, saida });
    if (saida !== dado) n.data = saida;
  }

  function noAttr(el) {
    let rec = memAttr.get(el);
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute(a);
      if (v == null) continue;
      const r = rec && rec[a];
      if (r && v === r.saida) continue;
      const saida = traduzir(v);
      if (!rec) { rec = {}; memAttr.set(el, rec); }
      rec[a] = { orig: v, saida };
      if (saida !== v) el.setAttribute(a, saida);
    }
  }

  function arvore(raizNo) {
    if (!raizNo) return;
    if (raizNo.nodeType === 3) { noTexto(raizNo); return; }
    if (raizNo.nodeType === 1) noAttr(raizNo);
    const w = document.createTreeWalker(raizNo, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) noTexto(n);
      else noAttr(n);
    }
  }

  // Volta tudo ao português (o que guardamos como original).
  function restaurar(raizNo) {
    if (!raizNo) return;
    const w = document.createTreeWalker(raizNo, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n = raizNo;
    do {
      if (n.nodeType === 3) {
        const rec = memTexto.get(n);
        if (rec && n.data === rec.saida && rec.saida !== rec.orig) n.data = rec.orig;
        memTexto.delete(n);
      } else if (n.nodeType === 1) {
        const rec = memAttr.get(n);
        if (rec) for (const a of Object.keys(rec)) if (n.getAttribute(a) === rec[a].saida && rec[a].saida !== rec[a].orig) n.setAttribute(a, rec[a].orig);
        memAttr.delete(n);
      }
    } while ((n = w.nextNode()));
  }

  function todasRaizes() {
    const lista = [...document.querySelectorAll(RAIZES)];
    for (const id of HOSTS) { const h = document.getElementById(id); if (h && h.shadowRoot) lista.push(h.shadowRoot); }
    return lista;
  }

  // ---- observar ------------------------------------------------------------------------------
  const pendentes = new Set();
  let agendado = false;
  const observadas = new WeakSet();
  let obsCorpo = null;
  const obsSombras = [];

  function dentro(no) {
    const el = no.nodeType === 1 ? no : no.parentElement;
    if (!el) return null;
    const r = el.closest(RAIZES);
    if (r) return no;
    const rn = el.getRootNode && el.getRootNode();
    return rn && rn instanceof ShadowRoot && HOSTS.includes(rn.host && rn.host.id) ? no : null;
  }

  function processar() {
    agendado = false;
    if (atual === 'pt') { pendentes.clear(); return; }
    for (const no of pendentes) if (no.isConnected) arvore(no);
    pendentes.clear();
    ligarSombras();
  }

  function aoMudar(registros) {
    for (const m of registros) {
      if (m.type === 'childList') {
        // 1.12.3: uma conferência por registro (o alvo), não por nó — o jogo mexe no DOM sem parar.
        const alvoDentro = dentro(m.target);
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && (n.matches?.(RAIZES) || HOSTS.includes(n.id))) pendentes.add(n.shadowRoot || n);
          else if (alvoDentro) pendentes.add(n);
        }
      } else if (dentro(m.target)) pendentes.add(m.target);
    }
    if (pendentes.size && !agendado) { agendado = true; queueMicrotask(processar); }
  }

  const OPCOES = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS };
  function ligarSombras() {
    for (const id of HOSTS) {
      const h = document.getElementById(id);
      const s = h && h.shadowRoot;
      if (!s || observadas.has(s)) continue;
      observadas.add(s);
      const o = new MutationObserver(aoMudar);
      o.observe(s, OPCOES);
      obsSombras.push(o);
      arvore(s);
    }
  }

  function ligarObservador() {
    if (obsCorpo || !document.body) return;
    obsCorpo = new MutationObserver(aoMudar);
    obsCorpo.observe(document.body, OPCOES);
    ligarSombras();
  }
  function desligarObservador() {
    if (obsCorpo) { obsCorpo.disconnect(); obsCorpo = null; }
    for (const o of obsSombras.splice(0)) o.disconnect();
  }

  function aplicarTudo() {
    for (const r of todasRaizes()) { restaurar(r); if (atual !== 'pt') arvore(r); }
  }

  function definir(l) {
    if (!IDIOMAS.includes(l) || l === atual) return;
    atual = l;
    try { localStorage.setItem(CHAVE, l); } catch { /* sem armazenamento */ }
    if (l === 'pt') { desligarObservador(); aplicarTudo(); }
    else { aplicarTudo(); desligarObservador(); for (const id of HOSTS) { const h = document.getElementById(id); if (h && h.shadowRoot) observadas.delete(h.shadowRoot); } ligarObservador(); }
    document.dispatchEvent(new CustomEvent('piloto:idioma', { detail: JSON.stringify({ idioma: l }) }));
  }

  // ---- bandeirinhas ---------------------------------------------------------------------------
  // SVG 20×14, cores oficiais simplificadas para caber em 22 px.
  const BANDEIRA = {
    pt: '<rect width="20" height="14" fill="#009c3b"/><path d="M10 1.6 18.3 7 10 12.4 1.7 7z" fill="#ffdf00"/><circle cx="10" cy="7" r="3.3" fill="#002776"/><path d="M6.9 6.2c2.1-.5 4.3-.1 6.2 1.1" stroke="#fff" stroke-width=".7" fill="none"/>',
    en: (() => {
      let s = '<rect width="20" height="14" fill="#fff"/>';
      const h = 14 / 13;
      for (let i = 0; i < 13; i += 2) s += `<rect y="${(i * h).toFixed(3)}" width="20" height="${h.toFixed(3)}" fill="#b22234"/>`;
      s += `<rect width="8.4" height="${(7 * h).toFixed(3)}" fill="#3c3b6e"/>`;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) s += `<rect x="${(1 + x * 2).toFixed(1)}" y="${(1 + y * 1.7).toFixed(2)}" width=".7" height=".7" fill="#fff"/>`;
      return s;
    })(),
    es: '<rect width="20" height="14" fill="#aa151b"/><rect y="3.5" width="20" height="7" fill="#f1bf00"/>',
  };
  const bandeira = (l) => `<svg class="plt-bandeira" viewBox="0 0 20 14" shape-rendering="crispEdges" aria-hidden="true">${BANDEIRA[l]}</svg>`;
  const bandeiras = () => `<div class="plt-idiomas" role="group" aria-label="Idioma">${IDIOMAS.map((l) => `<button type="button" data-idioma="${l}" aria-pressed="${l === atual}" title="${NOMES[l]}" aria-label="${NOMES[l]}">${bandeira(l)}</button>`).join('')}</div>`;

  // Começa já no idioma escolhido antes.
  if (atual !== 'pt') {
    if (document.body) ligarObservador();
    else document.addEventListener('DOMContentLoaded', ligarObservador, { once: true });
  }

  PIH.idioma = Object.freeze({
    atual: () => atual, definir, traduzir, bandeiras, IDIOMAS, NOMES,
    _interno: { aplicarTudo, arvore, restaurar },
  });
})(globalThis);
