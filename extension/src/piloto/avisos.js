// Avisos de achados (1.39.0, pedido do André em 29/10; ideia da pesquisa de 27/10: o PokeIdle
// Hub, o PokeFarm e a Rotom avisam quando algo raro acontece).
//
// Só leitura: nada é enviado ao jogo. O hook repassa da batalha só os eventos que interessam
// (`batalha.achados`), com os mesmos campos que o cliente do jogo usa (lidos no app.js e no
// sessao-hunt.mjs em 29/10):
// - `capturado` { pokemon: { id, nome, level, shiny, speciesId, quality, potencia }, paraDepot }
// - `bola` { shiny } — a bola revelou um shiny (o contador "shinies vistos" do jogo)
// - `morte` (selvagem) e `bossMorto` { drops: [{ itemId, nome, qtd }] }
// E do campo, o corpo com `sh` (shiny) e o nome.
//
// Avisa: shiny no campo, shiny capturado, captura P5 e drop raro (os 11 da prancheta do jogo:
// Boss Token, fragmentos, peças de TM, tickets). Com a aba do jogo à vista, um cartãozinho no canto;
// com ela escondida (outra aba, outra janela, PC bloqueado), a notificação do sistema. Drop raro
// junta o que cair em 1 min num aviso só, e no máximo um aviso de drop a cada 10 min. Tudo entra
// no Diário, e a linha da aba Rotina mostra o que caiu hoje.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:avisos:v1';
  const CHAVE_DIA = 'piloto:avisos:dia';
  // os drops raros da prancheta do jogo (sessao-hunt.mjs, DROPS_SESSAO, 29/10/2026)
  const RAROS = new Map([
    [70000, 'Bronze Boss Token'], [70011, 'Key Fragment'], [70012, 'Shiny Stone Fragment'], [70013, 'Bicycle Fragment'],
    [70014, 'Mega Stone Fragment'], [70015, 'Mega Shiny Stone Fragment'], [59194, 'TM Disk Piece'], [40530, 'AoE TM Disk Piece'],
  ]);
  const NOMES_RAROS = new Set([...RAROS.values(), 'Mystic Ticket', 'Safari Ticket', 'Shiny Egg Fragment']);
  const JUNTAR_MS = 60_000;
  const ESPACO_DROP_MS = 10 * 60_000;

  const ler = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; return { ligado: c.ligado !== false, shiny: c.shiny !== false, especial: c.especial !== false, drop: c.drop !== false }; } catch { return { ligado: true, shiny: true, especial: true, drop: true }; } };
  const cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const hojeBr = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  let dia = (() => { try { const d = JSON.parse(localStorage.getItem(CHAVE_DIA) || 'null'); return d && d.dia === hojeBr() ? d : null; } catch { return null; } })() || { dia: hojeBr(), shinyVisto: 0, shiny: 0, especial: 0, drops: {} };
  const gravarDia = () => { try { localStorage.setItem(CHAVE_DIA, JSON.stringify(dia)); } catch { /* sem armazenamento */ } };
  const virarDia = () => { if (dia.dia !== hojeBr()) dia = { dia: hojeBr(), shinyVisto: 0, shiny: 0, especial: 0, drops: {} }; };

  // ---- textos (a notificação do sistema sai já no idioma da pessoa) ---------------------------
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const T = {
    shinyVisto: { pt: 'Shiny na hunt!', en: 'Shiny in the hunt!', es: '¡Shiny en la hunt!' },
    shinyVistoTxt: { pt: '{nome} Nv {nv} apareceu shiny{onde}.', en: '{nome} Lv {nv} showed up shiny{onde}.', es: '¡{nome} Nv {nv} apareció shiny{onde}!' },
    shinyPego: { pt: 'Shiny capturado!', en: 'Shiny caught!', es: '¡Shiny capturado!' },
    shinyPegoTxt: { pt: '{nome} Nv {nv}{depot}.', en: '{nome} Lv {nv}{depot}.', es: '{nome} Nv {nv}{depot}.' },
    depot: { pt: ' (foi para o Depot)', en: ' (sent to the Depot)', es: ' (fue al Depot)' },
    especial: { pt: 'Captura P5!', en: 'P5 catch!', es: '¡Captura P5!' },
    especialTxt: { pt: '{nome} Nv {nv} com Potência P5.', en: '{nome} Lv {nv} with P5 Potency.', es: '{nome} Nv {nv} con Potencia P5.' },
    drop: { pt: 'Drop raro', en: 'Rare drop', es: 'Drop raro' },
    em: { pt: ' em {h}', en: ' in {h}', es: ' en {h}' },
    prefixo: { pt: 'achado', en: 'find', es: 'hallazgo' },
  };
  const tx = (k, v = {}) => String(T[k][L()] || T[k].pt).replace(/\{(\w+)\}/g, (_, n) => (v[n] == null ? '' : String(v[n])));

  // ---- o que está acontecendo -------------------------------------------------------------------
  let eu = null;
  let welcome = null;
  PIH.on('estado', (e) => { eu = e; });
  PIH.on('welcome', (w) => { welcome = w; });
  const nomeHunt = () => { const s = eu && eu.huntSlug; const h = s && ((welcome && welcome.hunts) || []).find((x) => x.slug === s); return h ? h.nome : ''; };
  const aVista = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());

  function sistema(titulo, mensagem) {
    try { document.dispatchEvent(new CustomEvent('piloto:notificar', { detail: JSON.stringify({ titulo: String(titulo).slice(0, 120), mensagem: String(mensagem).slice(0, 300) }) })); } catch { /* sem ponte */ }
  }
  function avisar({ titulo, linha, categoria, speciesId = null, itemId = null, nome, tag }) {
    PIH.cofre?.diario?.(`${tx('prefixo')}: ${titulo} ${linha}`, 'ok');
    if (aVista()) PIH.emit('piloto.achado', { titulo, linha, categoria, speciesId, itemId, nome, tag });
    else sistema(`PokeIdle · ${titulo}`, linha);
    ultimo = { em: Date.now(), titulo, linha };
  }
  let ultimo = null;

  // shiny no campo (o corpo chega com sh) — um aviso por corpo
  const vistos = new Map();
  function verCampo(m) {
    if (!m) return;
    const n = Date.now();
    for (const [k, em] of vistos) if (n - em > 10 * 60_000) vistos.delete(k);
    for (const [k, c] of corpos) if (n - c.em > 10 * 60_000) corpos.delete(k);
    for (const x of m.mobs || []) {
      if (!x || !Number.isInteger(x.s)) continue;
      if (x.n) corpos.set(x.s, { n: String(x.n).slice(0, 40), nv: Number(x.nv) || null, em: n });
      if (x.sh) shinyVisto(x.s, x.n, x.nv);
    }
  }
  const corpos = new Map(); // vaga → nome e nível do corpo (para a bola que revela o shiny)
  function shinyVisto(slot, nome, nv) {
    const n = Date.now();
    const chave = `${slot}:${nome || ''}`;
    if (vistos.has(chave)) return; // o mesmo corpo: um aviso só (some da lista 10 min depois)
    vistos.set(chave, n);
    virarDia(); dia.shinyVisto++; gravarDia();
    if (!cfg.ligado || !cfg.shiny) return;
    const h = nomeHunt();
    avisar({ titulo: tx('shinyVisto'), linha: tx('shinyVistoTxt', { nome: nome || '?', nv: nv || '?', onde: h ? tx('em', { h }) : '' }), categoria: 'pokemon', nome: String(nome || 'Shiny'), tag: 'Shiny' });
  }
  PIH.on('campo', verCampo);
  PIH.on('campo.init', verCampo);

  // drops raros: junta 1 min, um aviso a cada 10 min no máximo
  let fila = {};
  let filaDesde = 0;
  let ultimoDrop = 0;
  let timerDrop = null;
  function soltarDrops() {
    timerDrop = null;
    const itens = Object.entries(fila);
    if (!itens.length) return;
    const espera = ultimoDrop + ESPACO_DROP_MS - Date.now();
    if (espera > 0) { timerDrop = setTimeout(soltarDrops, espera); return; }
    fila = {};
    ultimoDrop = Date.now();
    const linha = itens.map(([nome, q]) => `${q}× ${nome}`).join(', ');
    const [primeiro] = itens[0];
    const itemId = [...RAROS].find(([, n]) => n === primeiro)?.[0] ?? null;
    avisar({ titulo: tx('drop'), linha, categoria: 'item', itemId, nome: primeiro, tag: 'Drop' });
  }
  function anotarDrops(drops) {
    for (const d of Array.isArray(drops) ? drops : []) {
      if (!d) continue;
      const nome = RAROS.get(Number(d.itemId)) || (NOMES_RAROS.has(String(d.nome)) ? String(d.nome) : null);
      if (!nome) continue;
      const q = Math.max(1, Math.round(Number(d.qtd) || 1));
      virarDia(); dia.drops[nome] = (dia.drops[nome] || 0) + q; gravarDia();
      if (!cfg.ligado || !cfg.drop) continue;
      fila[nome] = (fila[nome] || 0) + q;
      if (!filaDesde) filaDesde = Date.now();
      if (!timerDrop) timerDrop = setTimeout(() => { filaDesde = 0; soltarDrops(); }, JUNTAR_MS);
    }
  }

  PIH.on('batalha.achados', (d) => {
    for (const e of (d && d.ev) || []) {
      if (!e || typeof e !== 'object') continue;
      if (e.k === 'capturado' && e.pokemon) {
        const p = e.pokemon;
        if (p.shiny) {
          virarDia(); dia.shiny++; gravarDia();
          if (cfg.ligado && cfg.shiny) avisar({ titulo: tx('shinyPego'), linha: tx('shinyPegoTxt', { nome: p.nome || '?', nv: p.level || '?', depot: e.paraDepot ? tx('depot') : '' }), categoria: 'pokemon', speciesId: Number(p.speciesId) || null, nome: String(p.nome || 'Shiny'), tag: 'Shiny' });
        } else if (Number(p.potencia) >= 5) {
          virarDia(); dia.especial++; gravarDia();
          if (cfg.ligado && cfg.especial) avisar({ titulo: tx('especial'), linha: tx('especialTxt', { nome: p.nome || '?', nv: p.level || '?' }), categoria: 'pokemon', speciesId: Number(p.speciesId) || null, nome: String(p.nome || 'P5'), tag: 'P5' });
        }
      } else if (e.k === 'bola' && e.shiny) {
        const c = corpos.get(e.slot);
        shinyVisto(e.slot, c && c.n, c && c.nv);
      } else if ((e.k === 'morte' && e.quem === 'selvagem') || e.k === 'bossMorto') {
        anotarDrops(e.drops);
      }
    }
  });

  // ---- a linha na aba Rotina --------------------------------------------------------------------
  function resumoHoje() {
    virarDia();
    const l = L();
    const W = { pt: ['shiny capturado', 'shinies capturados', 'shiny visto', 'shinies vistos', 'hoje: ', 'nada raro hoje ainda'],
      en: ['shiny caught', 'shinies caught', 'shiny seen', 'shinies seen', 'today: ', 'nothing rare today yet'],
      es: ['shiny capturado', 'shinies capturados', 'shiny visto', 'shinies vistos', 'hoy: ', 'nada raro hoy todavía'] }[l];
    const partes = [];
    if (dia.shiny) partes.push(`${dia.shiny} ${dia.shiny === 1 ? W[0] : W[1]}`);
    if (dia.shinyVisto) partes.push(`${dia.shinyVisto} ${dia.shinyVisto === 1 ? W[2] : W[3]}`);
    if (dia.especial) partes.push(`${dia.especial} P5`);
    for (const [nome, q] of Object.entries(dia.drops)) partes.push(`${q}× ${nome}`);
    return partes.length ? `${W[4]}${partes.join(' · ')}` : W[5];
  }
  function linha(modo) {
    const ajustes = [
      K.mini('avisos:shiny', cfg.shiny, 'Shiny', 'Shiny no campo e shiny capturado'),
      K.mini('avisos:especial', cfg.especial, 'Captura P5', 'Pokémon capturado com Potência P5'),
      K.mini('avisos:drop', cfg.drop, 'Drop raro', 'Boss Token, fragmentos (Chave, Shiny Stone, Bicicleta, Mega, Ovo Shiny), peças de TM e tickets. O que cair em 1 min vira um aviso só, no máximo um a cada 10 min.'),
    ].join('');
    return `${K.grupo('Avisos')}${K.linha({ id: 'avisos', icone: 'sino', nome: 'Avisos de achados', alvo: 'avisos:ligado', on: cfg.ligado, status: `<span data-sem-traducao="1">${esc(resumoHoje())}</span>`,
      dica: 'Avisa quando acontece algo raro: shiny no campo, shiny capturado, captura P5 e drop raro. Com a aba do jogo à vista, um cartãozinho no canto; com ela escondida, a notificação do sistema. Só lê o que o jogo já mostra: não envia nada. Funciona em qualquer modo, até no Off.',
      ajustes })}`;
  }
  function definir(caminho, v) {
    if (!['ligado', 'shiny', 'especial', 'drop'].includes(caminho)) return;
    cfg[caminho] = !!v;
    gravar();
  }

  PIH.avisos = { linha, definir, resumoHoje, _interno: { cfg: () => cfg, dia: () => dia, ultimo: () => ultimo, soltarDrops, fila: () => fila, zerarEspaco: () => { ultimoDrop = 0; } } };
})(globalThis);
