// Jogo novo (1.44.0, pedido do André em 29/10): a vigia da versão do jogo, que era uma tarefa
// agendada a cada 3 h, agora mora no Piloto.
//
// A ponte (mundo isolado) lê a versão que a aba carregou (o `estilo.css?v=` do HTML do jogo) e, a
// cada 30 min (alarme do fundo) e ao voltar para a aba (no máximo 1 vez a cada 10 min), busca o HTML
// do /app do mesmo jeito que o Passo 1 do VIGIA.md: só o arquivo estático, nada na conta. Mudou →
// manda `piloto:jogo-novo` { antes, agora } para cá.
//
// Aqui: uma linha no Diário com a versão antiga e a nova, o quadro no meio da tela "O PokeIdle
// atualizou o jogo, dê F5" (o X só adia 1 h, como os avisos de versão da regra 14) e, com a aba
// escondida, uma notificação do sistema (uma por versão). "Dar F5 agora" recarrega a página: o
// Piloto volta no modo em que estava. Nada de gasto nem de trava muda.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const esc = PIH.kit.esc;

  const ADIA_MS = 60 * 60_000;
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;
  const aVista = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());

  let novo = null; // { antes, agora, em }
  let adiadoAte = 0;
  let notificada = '';
  let caixa = null;

  function fechar() { if (caixa) { caixa.remove(); caixa = null; } }
  function mostrar() {
    if (!novo || !document.body) return;
    if (Date.now() < adiadoAte) return;
    fechar();
    const el = document.createElement('div');
    el.className = 'plt-guia plt-guia-solto plt-jogo-novo';
    el.dataset.semTraducao = '1';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `<div class="plt-guia-caixa modal-caixa plt-jogo-novo-caixa">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h"><span class="plt-jogo-novo-ico" aria-hidden="true">↻</span><span>${esc(t3('O PokeIdle atualizou o jogo', 'PokeIdle updated the game', 'PokeIdle actualizó el juego'))}</span></h3>
          <button type="button" class="plt-guia-fechar" data-jn="adiar" aria-label="${esc(t3('Lembrar daqui a 1 h', 'Remind me in 1 h', 'Recordar en 1 h'))}" title="${esc(t3('Lembrar daqui a 1 h', 'Remind me in 1 h', 'Recordar en 1 h'))}">×</button>
        </div>
        <div class="plt-guia-corpo">
          <p class="plt-guia-de">${esc(t3(`Versão ${novo.antes} → ${novo.agora}. Dê F5 para carregar o jogo novo: esta aba ainda roda o antigo. O Piloto volta sozinho no modo em que estava.`,
    `Version ${novo.antes} → ${novo.agora}. Press F5 to load the new game: this tab still runs the old one. The Pilot comes back by itself in the mode it was in.`,
    `Versión ${novo.antes} → ${novo.agora}. Pulsa F5 para cargar el juego nuevo: esta pestaña todavía usa el viejo. El Piloto vuelve solo en el modo en que estaba.`))}</p>
        </div>
        <div class="plt-guia-rodape"><span class="plt-guia-bts plt-guia-bts-fim">
          <button type="button" class="cfg-escala-bt" data-jn="adiar">${esc(t3('Depois', 'Later', 'Después'))}</button>
          <button type="button" class="cfg-escala-bt on" data-jn="f5">${esc(t3('Dar F5 agora', 'Press F5 now', 'Pulsar F5 ahora'))}</button>
        </span></div>
      </div>`;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-jn]');
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.jn === 'f5') { PIH.cofre?.diario?.(t3('jogo novo: F5 pedido no aviso', 'new game: F5 requested from the notice', 'juego nuevo: F5 pedido desde el aviso'), 'ok'); setTimeout(() => location.reload(), 300); return; }
      adiadoAte = Date.now() + ADIA_MS;
      fechar();
    });
    for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    document.body.append(el);
    caixa = el;
  }
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && caixa) { ev.preventDefault(); ev.stopImmediatePropagation(); adiadoAte = Date.now() + ADIA_MS; fechar(); } }, true);

  document.addEventListener('piloto:jogo-novo', (ev) => {
    let d = {};
    try { d = JSON.parse(ev.detail) || {}; } catch { return; }
    const antes = String(d.antes || '').slice(0, 20);
    const agora = String(d.agora || '').slice(0, 20);
    if (!/^[\d.]+$/.test(antes) || !/^[\d.]+$/.test(agora) || antes === agora) return;
    const primeira = !novo || novo.agora !== agora;
    novo = { antes, agora, em: Date.now() };
    if (primeira) {
      adiadoAte = 0;
      PIH.cofre?.diario?.(t3(`jogo novo: o PokeIdle atualizou de ${antes} para ${agora} — dê F5`, `new game: PokeIdle updated from ${antes} to ${agora} — press F5`, `juego nuevo: PokeIdle se actualizó de ${antes} a ${agora} — pulsa F5`), 'aviso');
    }
    if (!aVista() && notificada !== agora) {
      notificada = agora;
      try { document.dispatchEvent(new CustomEvent('piloto:notificar', { detail: JSON.stringify({ titulo: `PokeIdle Piloto · ${t3('O PokeIdle atualizou o jogo', 'PokeIdle updated the game', 'PokeIdle actualizó el juego')}`, mensagem: t3(`Versão ${antes} → ${agora}. Dê F5 na aba do jogo.`, `Version ${antes} → ${agora}. Press F5 on the game tab.`, `Versión ${antes} → ${agora}. Pulsa F5 en la pestaña del juego.`) }) })); } catch { /* sem ponte */ }
    }
    mostrar();
  });
  // adiado: volta depois de 1 h (o alarme de 30 min manda de novo; este relógio cobre a aba à vista)
  setInterval(() => { if (novo && !caixa && Date.now() >= adiadoAte) mostrar(); }, 60_000);

  PIH.jogoNovo = { atual: () => (novo ? { ...novo } : null), _interno: { caixa: () => caixa, adiar: (ms) => { adiadoAte = Date.now() + ms; } } };
})(globalThis);
