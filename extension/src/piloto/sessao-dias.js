// Dias no TEMPO da Sessão (1.30, pedido do André): a prancheta "Sessão" do jogo mostra o tempo da
// hunt só em horas ("252:58:16"). Aqui o vão do TEMPO vira dois: um quadradinho com os dias e, ao
// lado, o relógio com o resto em horas ("10 dias" + "12:58:16").
//
// Como: o jogo reescreve `#sessao-tempo` (textContent) a cada segundo e refaz a prancheta inteira
// quando abre. O vão original continua lá, escondido, e o Piloto só LÊ o texto dele (H:MM:SS ou
// M:SS) e pinta o par. Nada é enviado ao jogo; se o jogo mudar o formato, o vão original volta a
// aparecer sozinho.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH) return;

  const MARCA = 'plt-dias-on';

  // "252:58:16" → segundos; "4:05" → segundos; o resto → null.
  function segundos(txt) {
    const m = String(txt || '').trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return m[3] === undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  const p2 = (n) => String(n).padStart(2, '0');
  function partes(s) {
    const dias = Math.floor(s / 86400);
    const r = s % 86400;
    return { dias, horas: `${p2(Math.floor(r / 3600))}:${p2(Math.floor((r % 3600) / 60))}:${p2(r % 60)}` };
  }


  function montar(sec, orig, b) {
    const par = document.createElement('div');
    par.className = 'plt-ss-tempo';
    const ico = orig.querySelector('.ss-tempo-ico');
    par.innerHTML = `<div class="ss-tempo plt-ss-dias" title="Dias de hunt nesta sessão"><span class="plt-ss-dias-txt"><b class="plt-ss-n">0</b><small class="plt-ss-rot">dias</small></span></div>`
      + `<div class="ss-tempo plt-ss-horas" title="Horas, minutos e segundos"><span class="ss-tempo-ico" aria-hidden="true">${ico ? ico.innerHTML : ''}</span><b class="plt-ss-h">00:00:00</b></div>`;
    orig.after(par);
    sec.classList.add(MARCA);
    return par;
  }

  // Se o relógio não couber (prancheta estreita, zoom), diminui a fonte até caber.
  function caber(b) {
    b.style.fontSize = '';
    let px = parseFloat(getComputedStyle(b).fontSize) || 24;
    let voltas = 0;
    while (b.scrollWidth > b.clientWidth + 1 && px > 14 && voltas++ < 12) { px -= 1; b.style.fontSize = `${px}px`; }
  }

  const vistos = new WeakSet();
  function pintar() {
    const b = document.getElementById('sessao-tempo');
    if (!b) return;
    const orig = b.closest('.ss-tempo');
    const sec = b.closest('.ss-sec-tempo') || orig?.parentElement;
    if (!orig || !sec) return;
    const s = segundos(b.textContent);
    let par = sec.querySelector(':scope > .plt-ss-tempo');
    if (s === null) { // formato que não conheço: volta o original
      sec.classList.remove(MARCA);
      if (par) par.remove();
      return;
    }
    if (!par) par = montar(sec, orig, b);
    const { dias, horas } = partes(s);
    const n = par.querySelector('.plt-ss-n');
    const rot = par.querySelector('.plt-ss-rot');
    const h = par.querySelector('.plt-ss-h');
    if (n.textContent !== String(dias)) n.textContent = String(dias);
    const r = dias === 1 ? 'dia' : 'dias';
    if (rot.dataset.pt !== r) { rot.dataset.pt = r; rot.textContent = r; } // compara com o PT: o tradutor troca o texto
    par.classList.toggle('zero', dias === 0);
    const mudouLargura = h.textContent.length !== horas.length;
    h.textContent = horas;
    if (mudouLargura || !vistos.has(h)) { vistos.add(h); caber(h); }
    // o relógio do jogo continua andando no vão escondido; observa direto o texto dele
    if (!vistos.has(b)) { vistos.add(b); obsTexto.observe(b, { childList: true, characterData: true, subtree: true }); }
  }

  let agendado = 0;
  const pedir = () => { if (!agendado) agendado = requestAnimationFrame(() => { agendado = 0; try { pintar(); } catch { /* tenta no próximo */ } }); };
  const obsTexto = new MutationObserver(pedir);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && (n.id === 'sessao-tempo' || n.querySelector?.('#sessao-tempo'))) { pedir(); return; }
    }
  });
  const ligar = () => { if (document.body) { obs.observe(document.body, { childList: true, subtree: true }); pedir(); } else setTimeout(ligar, 300); };
  ligar();
  raiz.addEventListener?.('resize', () => { const h = document.querySelector('.plt-ss-h'); if (h) caber(h); });

  PIH.sessaoDias = { pintar, _interno: { segundos, partes } };
})(globalThis);
