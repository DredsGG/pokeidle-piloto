// Avisos mínimos do Piloto (1.6): no lugar de abrir o painel inteiro, uma notificação curta no
// canto da tela (some sozinha) e uma bandeja com um ícone por disputa em andamento — o item ou o
// pokémon, com o tempo até o sorteio, quantos estão disputando e o resultado.
//
// Quem fala é o Radar (o outro mundo da extensão) pelo evento `piloto:oferta`. Com o painel do
// Piloto aberto na aba Mercado, a notificação não aparece: o aviso já está ali.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const curto = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 10000 ? nfc.format(v) : nf.format(v)) : '—');
  const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)}%` : '');

  // ---- a arte do jogo (1.13) --------------------------------------------------------------------
  // Pokémon: o MESMO sprite animado das janelas do jogo (sprites.mjs → spriteAnimado): o atlas do
  // looktype em /assets/asset-packs, virado para o sul, recortado pela união dos quadros e trocando
  // de quadro a cada 220 ms. Item: o mesmo ícone do inventário (items-icons.json, items.json, os
  // fixos e os cristais Z), ampliado por um número inteiro para o pixel não borrar.
  const PACK = '/assets/asset-packs';
  const localizar = (p) => String(p).replace(/^\/assets-packs/, PACK);
  const MS_QUADRO = 220;
  const ALFA_MIN = 8;
  const ICONE_GENERICO = 'site/assets/ui/menu-bolsa.png';
  const ICONES_FIXOS = { 30: 'site/assets/items/dark_gem.png', 63: 'site/assets/items/goggles.png', 47: 'site/assets/items/farfetchd_stick.png', 5041: 'site/assets/items/farfetchd_stick.png', 70070: '/img/itens/golden-potion.png', 59194: '/img/itens/zmove/fragmento.png', 40530: '/img/itens/zmove/aoe-peca.png', 40575: '/img/itens/zmove/aoe-disco.png' };
  const caminhoRel = (icon) => (!icon ? null : icon.startsWith('site/') ? icon : icon.startsWith('/') ? `site${icon}` : `site/assets/items/${icon}`);
  const srcIcone = (rel) => (String(rel).startsWith('/') ? rel : `/assets/${rel}`);

  let iconesItem = null;
  let itensJogo = null;
  let atlas = null;
  let shinyLooks = {};
  PIH.on?.('welcome', (m) => { if (m && m.shinyLooks && typeof m.shinyLooks === 'object') shinyLooks = m.shinyLooks; });
  const carregarIcones = (() => {
    let p = null;
    return () => (p ??= Promise.all([
      fetch('/assets/items-icons.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch('/assets/items.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/assets/site/assets/maps/marker-atlas.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([ic, it, at]) => {
      iconesItem = ic || {};
      itensJogo = new Map(((it && it.items) || []).map((x) => [Number(x.id), x]));
      atlas = at;
    }));
  })();
  let especies = null;
  const carregarEspecies = () => (PIH.carregarJogo ? PIH.carregarJogo().then((j) => { especies = j.especies; }).catch(() => {}) : Promise.resolve());

  function srcDoItem(id) {
    if (ICONES_FIXOS[id]) return srcIcone(ICONES_FIXOS[id]);
    const item = itensJogo && itensJogo.get(Number(id));
    const z = item && /^([A-Za-z]+)-Type TM Disk$/.exec(item.name || '');
    if (z) return `/img/itens/zmove/${z[1].toLowerCase()}.png`;
    const rel = (iconesItem && iconesItem[String(id)]) || caminhoRel(item && item.icon);
    return srcIcone(rel || ICONE_GENERICO);
  }
  function looktypeDo(d) {
    const esp = especies && especies.get(Number(d.speciesId));
    const base = (esp && esp.looktype) ?? d.looktype ?? null;
    if (!d.shiny) return base;
    const id = Number(d.speciesId);
    return shinyLooks[id] ?? base;
  }

  // Sprites: um por looktype (promessa), imagens do atlas em cache.
  let indice = null;
  const carregarIndice = () => (indice ??= fetch(`${PACK}/outfits-index.json`).then((r) => (r.ok ? r.json() : {})).then((j) => (j && j.outfits) || {}).catch(() => { indice = null; return {}; }));
  const imagens = new Map();
  const carregarImagem = (src) => {
    if (!imagens.has(src)) imagens.set(src, new Promise((ok, falha) => { const im = new Image(); im.onload = () => ok(im); im.onerror = falha; im.src = src; }));
    return imagens.get(src);
  };
  const sprites = new Map();
  function carregarSprite(lt) {
    if (!sprites.has(lt)) {
      const p = (async () => {
        const e = (await carregarIndice())[String(lt)];
        if (!e || !e.manifest) return null;
        const man = await fetch(localizar(e.manifest)).then((r) => r.json());
        const cat = Object.values(man.categories || {})[0];
        if (!cat || !Array.isArray(cat.pages)) return null;
        const imgs = await Promise.all(cat.pages.map((pg) => carregarImagem(localizar(pg.image))));
        const porDir = {};
        for (const [chave, a] of Object.entries(man.assets || {})) {
          const stem = chave.split('/').pop().replace(/\.png$/, '');
          if (stem.endsWith('_template')) continue;
          const n = stem.split('_').map(Number);
          const f = a && a.frames && a.frames[0];
          if (!f) continue;
          (porDir[n[3]] ??= [])[n[0] - 1] = { pagina: f.page ?? 0, x: f.x, y: f.y, w: f.w, h: f.h };
        }
        for (const d of Object.keys(porDir)) porDir[d] = porDir[d].filter(Boolean);
        const quadros = porDir[3] && porDir[3].length ? porDir[3] : Object.values(porDir)[0] || [];
        if (!quadros.length) return null;
        return { quadros, imgs, jan: janelaVisivel(quadros, imgs) };
      })().catch(() => null);
      p.then((sp) => { if (!sp) setTimeout(() => sprites.delete(lt), 60_000); });
      sprites.set(lt, p);
    }
    return sprites.get(lt);
  }
  // A união do que aparece em todos os quadros: a escala fica a mesma e o bicho não pulsa.
  function janelaVisivel(quadros, imgs) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    for (const q of quadros) {
      const img = imgs[q.pagina];
      if (!img) continue;
      cv.width = q.w; cv.height = q.h;
      ctx.clearRect(0, 0, q.w, q.h);
      ctx.drawImage(img, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
      let px;
      try { px = ctx.getImageData(0, 0, q.w, q.h).data; } catch { return { sx: 0, sy: 0, sw: quadros[0].w, sh: quadros[0].h }; }
      for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
        if (px[(y * q.w + x) * 4 + 3] <= ALFA_MIN) continue;
        if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y;
      }
    }
    if (!Number.isFinite(x1)) return { sx: 0, sy: 0, sw: quadros[0].w, sh: quadros[0].h };
    return { sx: x1, sy: y1, sw: x2 - x1 + 1, sh: y2 - y1 + 1 };
  }
  // Um relógio só para todos os sprites na tela.
  const vivos = new Set();
  setInterval(() => {
    const agora = Date.now();
    for (const v of vivos) {
      if (!v.cv.isConnected) { if (agora - v.visto > 20_000) { vivos.delete(v); nos.delete(v.chave); } continue; }
      v.visto = agora;
      v.pintar();
    }
  }, MS_QUADRO);

  function canvasDoPokemon(lt, px, chave, reserva) {
    const cv = document.createElement('canvas');
    cv.className = 'plt-mini-img plt-sprite';
    cv.width = cv.height = 32;
    cv.style.width = cv.style.height = `${px}px`;
    carregarSprite(lt).then((sp) => {
      if (!sp) { const r = reserva(); if (r && cv.parentNode) cv.replaceWith(r); return; }
      const { quadros, imgs, jan } = sp;
      cv.width = jan.sw; cv.height = jan.sh;
      const esc = Math.min(px / jan.sw, px / jan.sh);
      cv.style.width = `${Math.round(jan.sw * esc)}px`;
      cv.style.height = `${Math.round(jan.sh * esc)}px`;
      const ctx = cv.getContext('2d');
      let i = 0;
      const v = { cv, chave, visto: Date.now(), pintar: () => {
        const q = quadros[i++ % quadros.length];
        const img = imgs[q.pagina];
        if (!img) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, q.x + jan.sx, q.y + jan.sy, jan.sw, jan.sh, 0, 0, jan.sw, jan.sh);
      } };
      v.pintar();
      if (quadros.length > 1) vivos.add(v);
    });
    return cv;
  }
  function imgDoItem(src, px) {
    const img = document.createElement('img');
    img.className = 'plt-mini-img plt-item-img';
    img.alt = '';
    img.decoding = 'async';
    img.style.width = img.style.height = `${px}px`;
    img.style.objectFit = 'contain';
    img.onload = () => {
      const lado = Math.max(img.naturalWidth, img.naturalHeight) || px;
      // ampliação inteira (2×, 3×…) para o pixel ficar nítido; se já é maior que a caixa, encaixa
      const k = lado <= px ? Math.floor(px / lado) : px / lado;
      img.style.width = `${Math.round(img.naturalWidth * k)}px`;
      img.style.height = `${Math.round(img.naturalHeight * k)}px`;
    };
    img.onerror = () => { img.onerror = null; img.src = srcIcone(ICONE_GENERICO); };
    img.src = src;
    return img;
  }
  function htmlAtlas(d, px) {
    const lt = looktypeDo(d);
    const slot = lt != null && atlas && atlas.slots ? atlas.slots[String(lt)] : null;
    if (!slot) return null;
    const url = atlas.version ? `/assets/site/assets/maps/marker-atlas.png?v=${atlas.version}` : '/assets/site/assets/maps/marker-atlas.png';
    const sp = document.createElement('span');
    sp.className = 'plt-mini-img';
    sp.style.cssText = `width:${px}px;height:${px}px;background-image:url('${url}');background-size:${(atlas.cols || 16) * px}px ${(atlas.rows || 1) * px}px;background-position:${-slot[0] * px}px ${-slot[1] * px}px`;
    return sp;
  }

  // O HTML leva só um lugar marcado; `hidratar` põe ali o canvas/img de verdade. O mesmo nó é
  // reaproveitado quando o cartão é redesenhado (o do passar do mouse se redesenha a cada 1 s).
  const nos = new Map();
  function htmlIcone(d, px) {
    const chave = `${d.anuncioId ?? d.nome}:${px}`;
    return `<span class="plt-arte" data-arte="${esc(chave)}" style="width:${px}px;height:${px}px"></span>`;
  }
  function noDaArte(d, px, chave) {
    if (nos.has(chave)) return nos.get(chave);
    let no = null;
    if (d.categoria === 'pokemon') {
      const lt = looktypeDo(d);
      const reserva = () => htmlAtlas(d, px) || criarIco(d);
      no = lt != null ? canvasDoPokemon(lt, px, chave, reserva) : reserva();
    } else if (d.itemId != null) {
      no = imgDoItem(srcDoItem(d.itemId), px);
    } else no = criarIco(d);
    nos.set(chave, no);
    if (nos.size > 80) nos.delete(nos.keys().next().value);
    return no;
  }
  function criarIco(d) {
    const t = document.createElement('template');
    t.innerHTML = K.ico(d.categoria === 'pokemon' ? 'pvp' : 'mercado', 'plt-mini-ico');
    return t.content.firstElementChild;
  }
  // 1.16: a janela Time usa a mesma arte (cada lugar marcado diz de quem é pela chave).
  PIH.arte = Object.freeze({
    preparar: () => Promise.all([carregarIcones(), especies ? null : carregarEspecies()]),
    chave: (d, px) => `${d.anuncioId ?? d.nome}:${px}`,
    // retrato parado do pokémon (o atlas de marcadores do mapa do jogo), para molduras pequenas
    retrato(pokeId, px) {
      if (!atlas || !especies) { carregarIcones(); if (!especies) carregarEspecies(); return ''; }
      const lt = especies.get(Number(pokeId))?.looktype;
      const slot = lt != null && atlas.slots ? atlas.slots[String(lt)] : null;
      if (!slot) return '';
      const url = atlas.version ? `/assets/site/assets/maps/marker-atlas.png?v=${atlas.version}` : '/assets/site/assets/maps/marker-atlas.png';
      return `<span class="plt-retrato-img" style="width:${px}px;height:${px}px;background-image:url('${url}');background-size:${(atlas.cols || 16) * px}px ${(atlas.rows || 1) * px}px;background-position:${-slot[0] * px}px ${-slot[1] * px}px"></span>`;
    },
    lugar: (d, px) => htmlIcone(d, px),
    hidratar(raiz, deChave) {
      for (const el of raiz.querySelectorAll('[data-arte]')) {
        const d = deChave(el.dataset.arte);
        if (!d) continue;
        const px = parseInt(el.style.width, 10) || 32;
        const no = noDaArte(d, px, el.dataset.arte);
        if (no && no.parentNode !== el) el.replaceChildren(no);
      }
    },
  });
  function hidratar(raiz, d) {
    for (const el of raiz.querySelectorAll('[data-arte]')) {
      const px = parseInt(el.style.width, 10) || 32;
      const no = noDaArte(d, px, el.dataset.arte);
      if (no) el.replaceChildren(no);
    }
  }

  // ---- o lugar na tela --------------------------------------------------------------------------
  // A bandeja mora no painel "Em campo", logo acima da barra do Piloto (no fluxo, sem tampar nada).
  // Os avisos de sorteio (1.12) aparecem grandes, no centro, um pouco acima do meio da tela.
  // O lembrete do voto continua ao lado da barra (sem a barra, no canto de baixo à direita).
  let pilha = null;
  let pilhaLado = null;
  let bandeja = null;
  let pop = null;
  const barra = () => document.querySelector('.plt-barra');
  function montar() {
    if (!pilha || !pilha.isConnected) {
      pilha = document.createElement('div');
      pilha.className = 'plt-mini-pilha plt-mini-centro';
      pilha.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(pilha);
    }
    if (!pilhaLado || !pilhaLado.isConnected) {
      pilhaLado = document.createElement('div');
      pilhaLado.className = 'plt-mini-pilha plt-mini-lado';
      pilhaLado.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(pilhaLado);
    }
    if (!bandeja) {
      bandeja = document.createElement('div');
      bandeja.className = 'plt-bandeja';
      bandeja.hidden = true;
      bandeja.addEventListener('pointerover', (ev) => { const f = ev.target.closest('.plt-ficha'); if (f) mostrarPop(f); });
      bandeja.addEventListener('pointerleave', esconderPop);
      bandeja.addEventListener('focusin', (ev) => { const f = ev.target.closest('.plt-ficha'); if (f) mostrarPop(f); });
      bandeja.addEventListener('focusout', esconderPop);
      bandeja.addEventListener('click', () => abrirMercado());
    }
    if (!pop || !pop.isConnected) {
      pop = document.createElement('div');
      pop.className = 'plt-pop';
      pop.hidden = true;
      (document.body || document.documentElement).appendChild(pop);
    }
    encaixarBandeja();
    posicionarPilha();
  }
  function encaixarBandeja() {
    const b = barra();
    if (b && b.parentElement && !b.classList.contains('plt-fixo')) {
      if (bandeja.nextElementSibling !== b) b.before(bandeja);
      bandeja.classList.remove('plt-bandeja-solta');
    } else {
      if (bandeja.parentElement !== document.body && document.body) document.body.appendChild(bandeja);
      bandeja.classList.add('plt-bandeja-solta');
    }
  }
  function posicionarPilha() {
    const pilha = pilhaLado;
    if (!pilha) return;
    const b = barra();
    const r = b && !b.classList.contains('plt-fixo') ? b.getBoundingClientRect() : null;
    if (r && r.width) {
      const larg = 300;
      const left = r.right + 12 + larg <= innerWidth - 8 ? r.right + 12 : Math.max(8, r.left - larg - 12);
      pilha.style.cssText = `left:${Math.round(left)}px; top:${Math.round(Math.max(8, r.top - 4))}px; right:auto; bottom:auto;`;
      pilha.classList.remove('plt-mini-canto');
    } else {
      pilha.style.cssText = '';
      pilha.classList.add('plt-mini-canto');
    }
  }
  addEventListener('resize', posicionarPilha);
  addEventListener('scroll', posicionarPilha, true);
  const abrirMercado = () => document.dispatchEvent(new CustomEvent('piloto:abrir', { detail: '{}' }));
  const painelNoMercado = () => {
    const p = document.querySelector('.plt-janela');
    return !!(p && p.querySelector('[data-conteudo][data-aba="mercado"]'));
  };

  // ---- notificação curta ----------------------------------------------------------------------
  const VIDA_MS = 7000;
  function notificar(d) {
    if (painelNoMercado()) return;
    montar();
    const el = document.createElement('div');
    el.className = `plt-toast ${d.auto || d.tipo === 'voto' ? 'auto' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = d.tipo === 'meta' ? `
      <span class="plt-toast-ico">${htmlIcone(d, 46)}</span>
      <span class="plt-toast-txt">
        <b>${esc(d.titulo || 'O meta mudou')}</b>
        <span><i class="plt-tag">${esc(d.recorte || 'Meta')}</i> ${esc(d.linha || '')}</span>
        <small>Clique para ver na aba Meta</small>
      </span>
      <button type="button" class="plt-toast-x" aria-label="Fechar">${K.ico('fechar')}</button>
      <span class="plt-toast-vida"></span>` : d.tipo === 'voto' ? `
      <span class="plt-toast-ico">${K.ico('xp', 'plt-mini-ico')}</span>
      <span class="plt-toast-txt">
        <b>Voto liberado</b>
        <span><i class="plt-tag">TopIdle</i> vale diamante</span>
        <small>Clique para abrir o "Vote &amp; Ganhe"</small>
      </span>` : `
      <span class="plt-toast-ico">${htmlIcone(d, 46)}</span>
      <span class="plt-toast-txt">
        <b>${esc(d.nome)}</b>
        <span><i class="plt-tag">${d.categoria === 'pokemon' ? 'Pokémon' : 'Item'}</i> −${pct(d.desconto)} · ${curto(d.preco)}${d.lucro != null ? ` · lucro ${curto(d.lucro)}` : ''}</span>
        <small>${d.auto ? 'Comprando sozinho: entrou na fila do sorteio' : 'Oferta no Mercado: clique para ver'}</small>
      </span>
      <button type="button" class="plt-toast-x" aria-label="Fechar">${K.ico('fechar')}</button>
      <span class="plt-toast-vida"></span>`;
    if (d.tipo !== 'voto') hidratar(el, d);
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.plt-toast-x')) { el.remove(); return; }
      if (d.tipo === 'voto') document.getElementById('btn-votar')?.click();
      else if (d.tipo === 'meta') PIH.time?.abrirAba?.('meta');
      else abrirMercado();
      el.remove();
    });
    const alvo = d.tipo === 'voto' ? pilhaLado : pilha;
    alvo.prepend(el);
    while (alvo.children.length > (alvo === pilha ? 2 : 3)) alvo.lastElementChild.remove();
    let resta = VIDA_MS;
    let ultimo = Date.now();
    let pausado = false;
    el.addEventListener('mouseenter', () => { pausado = true; });
    el.addEventListener('mouseleave', () => { pausado = false; ultimo = Date.now(); });
    const vida = el.querySelector('.plt-toast-vida');
    const tique = setInterval(() => {
      if (!el.isConnected) { clearInterval(tique); return; }
      if (!pausado) { resta -= Date.now() - ultimo; }
      ultimo = Date.now();
      vida.style.transform = `scaleX(${Math.max(0, resta / VIDA_MS)})`;
      if (resta <= 0) { clearInterval(tique); el.classList.add('saindo'); setTimeout(() => el.remove(), 250); }
    }, 100);
  }

  // ---- bandeja: uma ficha por disputa, atualizada no lugar (sem redesenhar: nada pisca) ---------
  const disputas = new Map(); // anuncioId -> { d, fase, resultado, participantes, fimEm, el }
  const FICA_DEPOIS_MS = 9000;
  function estadoDe(x, agora) {
    const r = x.resultado;
    const ganhou = r === 'ganhou' || r === 'confirmado';
    const estado = ganhou ? 'ganhou' : x.fimEm ? 'perdeu' : x.fase === 'agendada' ? 'espera' : 'disputa';
    const seg = x.fase === 'agendada' && x.enviarEm ? Math.max(0, Math.ceil((x.enviarEm - agora) / 1000)) : null;
    const selo = estado === 'ganhou' ? '✓' : estado === 'perdeu' ? '✗' : seg !== null ? `${seg}s` : x.participantes ? `1/${x.participantes}` : '…';
    const frase = estado === 'ganhou' ? 'Comprado!' : estado === 'perdeu' ? (x.rotulo || 'Não levou') : estado === 'espera' ? `Sorteio em ${seg} s` : `No sorteio${x.participantes ? ` com ${x.participantes} jogadores` : ''}`;
    return { estado, selo, frase };
  }
  let cabeca = null;
  function atualizarBandeja() {
    montar();
    const agora = Date.now();
    for (const [id, x] of disputas) {
      if (x.fimEm && agora - x.fimEm > FICA_DEPOIS_MS) { x.el?.remove(); disputas.delete(id); if (popId === id) esconderPop(); }
    }
    bandeja.hidden = disputas.size === 0;
    if (!disputas.size) return;
    if (!cabeca) {
      cabeca = document.createElement('span');
      cabeca.className = 'plt-band-tit';
      cabeca.innerHTML = `${K.ico('radar')}<span>Disputas</span><b></b>`;
      bandeja.prepend(cabeca);
    }
    cabeca.querySelector('b').textContent = String([...disputas.values()].filter((x) => !x.fimEm).length);
    for (const [id, x] of disputas) {
      if (!x.el) {
        x.el = document.createElement('button');
        x.el.type = 'button';
        x.el.className = 'plt-ficha nova';
        x.el.dataset.id = String(id);
        x.el.innerHTML = `${htmlIcone(x.d, 26)}<i></i>`;
        hidratar(x.el, x.d);
        x.el.setAttribute('aria-label', x.d.nome);
        bandeja.append(x.el);
        setTimeout(() => x.el && x.el.classList.remove('nova'), 1200);
      }
      const { estado, selo } = estadoDe(x, agora);
      if (x.el.dataset.estado !== estado) x.el.dataset.estado = estado;
      const i = x.el.querySelector('i');
      if (i.textContent !== selo) i.textContent = selo;
    }
    if (popId != null && disputas.has(popId)) pintarPop(disputas.get(popId));
  }
  setInterval(() => { if (disputas.size) atualizarBandeja(); else if (bandeja) encaixarBandeja(); posicionarPilha(); }, 1000);

  // ---- o cartão do passar do mouse (com a cara do jogo) ---------------------------------------
  let popId = null;
  function pintarPop(x) {
    const { estado, frase } = estadoDe(x, Date.now());
    const d = x.d;
    const qtd = x.qtd || d.qtd || 1;
    pop.dataset.estado = estado;
    pop.innerHTML = `
      <div class="plt-pop-topo"><span class="plt-pop-ico">${htmlIcone(d, 40)}</span>
        <div><b>${esc(d.nome)}</b><i class="plt-tag">${d.categoria === 'pokemon' ? 'Pokémon' : 'Item'}</i></div></div>
      <div class="plt-pop-linhas">
        <span><small>Preço</small><strong>${curto(d.preco)}${qtd > 1 ? ` × ${nf.format(qtd)}` : ''}</strong></span>
        <span><small>Desconto</small><strong>−${pct(d.desconto)}</strong></span>
        <span><small>Lucro</small><strong>${d.lucro != null ? curto(d.lucro) : '—'}</strong></span>
      </div>
      <div class="plt-pop-estado">${frase}</div>`;
    hidratar(pop, d);
  }
  function mostrarPop(ficha) {
    const id = Number(ficha.dataset.id);
    const x = disputas.get(id);
    if (!x) return;
    popId = id;
    pintarPop(x);
    pop.hidden = false;
    const r = ficha.getBoundingClientRect();
    const w = pop.offsetWidth || 230;
    const h = pop.offsetHeight || 120;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.min(Math.max(8, left), innerWidth - w - 8);
    const top = r.top - h - 10 >= 8 ? r.top - h - 10 : r.bottom + 10;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }
  function esconderPop() { popId = null; if (pop) pop.hidden = true; }

  // ---- voto no TopIdle (1.9): abre sozinho quando libera e fecha depois -----------------------
  // O jogo marca o botão "Vote & Ganhe" (#btn-votar.tem-voto) quando o voto libera. O Piloto abre
  // a janela do voto do próprio jogo só para pegar o link (o #vt-ir, com o nome já preenchido),
  // fecha a janela e pede à extensão para abrir o TopIdle numa aba de fundo. A aba fecha quando o
  // jogo confirma o voto ou, no máximo, 30 s depois. Se o voto não cair, fica o aviso dourado para
  // terminar na mão. Uma tentativa automática a cada 2 h, e nunca com outra janela do jogo aberta.
  const CHAVE_VOTO = 'piloto:voto:v1';
  const lerVoto = () => { try { return JSON.parse(localStorage.getItem(CHAVE_VOTO)) || {}; } catch { return {}; } };
  const gravarVoto = (v) => { try { localStorage.setItem(CHAVE_VOTO, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  const temVoto = () => !!document.getElementById('btn-votar')?.classList.contains('tem-voto');
  const janelaAberta = () => [...document.querySelectorAll('#modal .modal-caixa')].some((m) => m.offsetParent !== null && !m.closest('.hidden, [hidden]'));
  const diarioVoto = (txt, tipo = 'ok') => document.dispatchEvent(new CustomEvent('piloto:radar-diario', { detail: JSON.stringify({ t: Date.now(), txt: `voto: ${txt}`, tipo }) }));
  let votando = false;
  let abertoEm = 0;

  async function abrirVotoSozinho() {
    votando = true;
    try {
      document.getElementById('btn-votar')?.click();
      let link = null;
      for (let k = 0; k < 40 && !link; k++) {
        await new Promise((r) => setTimeout(r, 250));
        const a = document.getElementById('vt-ir');
        if (a && a.href && !a.classList.contains('travado')) link = a;
      }
      const caixa = (link || document.getElementById('vt-corpo'))?.closest('.modal-caixa');
      const fechar = caixa?.querySelector('.modal-topo button');
      if (fechar) fechar.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (!link) { diarioVoto('não achei o link do TopIdle na janela do voto', 'aviso'); return; }
      document.dispatchEvent(new CustomEvent('piloto:voto-abrir', { detail: JSON.stringify({ url: link.href }) }));
      abertoEm = Date.now(); fechouAba = false;
      diarioVoto('abri o TopIdle numa aba de fundo');
    } finally { votando = false; }
  }

  let votoEl = null;
  let votoEscondido = false;
  function mostrarVoto() {
    montar();
    if (votoEl && votoEl.isConnected) return;
    votoEl = document.createElement('div');
    votoEl.className = 'plt-voto';
    votoEl.setAttribute('role', 'status');
    votoEl.innerHTML = `
      <span class="plt-voto-ico">${K.ico('xp')}</span>
      <span class="plt-voto-txt"><b>Voto pendente</b><small>TopIdle · termine o voto</small></span>
      <span class="plt-voto-bt">Votar</span>
      <button type="button" class="plt-toast-x" aria-label="Esconder até a próxima">${K.ico('fechar')}</button>`;
    votoEl.addEventListener('click', (ev) => {
      if (ev.target.closest('.plt-toast-x')) { votoEscondido = true; votoEl.remove(); return; }
      document.getElementById('btn-votar')?.click();
    });
    pilhaLado.prepend(votoEl);
  }
  function esconderVoto() { votoEl?.remove(); votoEl = null; }

  let fechouAba = false;
  setInterval(() => {
    const tem = temVoto();
    if (!tem) {
      if (abertoEm) { document.dispatchEvent(new CustomEvent('piloto:voto-fechar', { detail: '{}' })); diarioVoto('voto confirmado pelo jogo'); abertoEm = 0; }
      votoEscondido = false;
      esconderVoto();
      return;
    }
    // aberto há 30 s: fecha a aba (pedido do André), mesmo sem a confirmação ainda
    if (abertoEm && !fechouAba && Date.now() - abertoEm > 30_000) { fechouAba = true; document.dispatchEvent(new CustomEvent('piloto:voto-fechar', { detail: '{}' })); }
    // continua liberado 1 min depois de abrir: o voto não caiu, fica o aviso para terminar na mão
    if (abertoEm && Date.now() - abertoEm > 60_000 && !votoEscondido) mostrarVoto();
    const v = lerVoto();
    if (!votando && !janelaAberta() && Date.now() - (v.tentouEm || 0) > 2 * 3_600_000) {
      gravarVoto({ ...v, tentouEm: Date.now() });
      abrirVotoSozinho();
    }
  }, 5_000);

  // 1.25: aviso curto do meta (o mesmo cartãozinho das ofertas) — sem abrir janela nenhuma
  PIH.on('piloto.meta-mudou', (d) => {
    if (!d || typeof d !== 'object') return;
    const x = { tipo: 'meta', categoria: 'pokemon', speciesId: Number(d.speciesId) || null, nome: String(d.nome || 'Meta'), anuncioId: `meta:${d.speciesId}:${Date.now()}`, titulo: d.titulo, linha: d.linha, recorte: d.recorte };
    carregarEspecies().catch(() => {}).finally(() => notificar(x));
  });

  // ---- o que chega do Radar ---------------------------------------------------------------------
  document.addEventListener('piloto:oferta', (ev) => {
    let d;
    try { d = JSON.parse(ev.detail); } catch { return; }
    if (!d || typeof d !== 'object' || !Number.isFinite(Number(d.anuncioId))) return;
    d.nome = String(d.nome || 'Oferta').slice(0, 60);
    Promise.all([carregarIcones(), d.categoria === 'pokemon' && !especies ? carregarEspecies() : null]).finally(() => {
      if (d.tipo === 'aviso') notificar(d);
      else if (d.tipo === 'compra') {
        const x = disputas.get(d.anuncioId) || { d };
        x.d = { ...x.d, ...d };
        x.fase = d.fase;
        x.enviarEm = d.enviarEm;
        x.qtd = d.qtd;
        x.rotulo = d.rotulo;
        if (d.fase === 'concluida') {
          x.resultado = d.resultado;
          x.fimEm = x.fimEm || Date.now();
          // Cancelada ou não enviada: sai sem barulho.
          if (d.resultado === 'cancelada' || d.resultado === 'nao-enviada') { x.el?.remove(); disputas.delete(d.anuncioId); }
          else disputas.set(d.anuncioId, x);
        } else disputas.set(d.anuncioId, x);
        atualizarBandeja();
      } else if (d.tipo === 'sorteio') {
        const x = disputas.get(d.anuncioId);
        if (x && d.participantes > 0) { x.participantes = d.participantes; atualizarBandeja(); }
      }
    });
  });
})(globalThis);
