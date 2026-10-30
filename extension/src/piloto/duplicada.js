// Extensão duplicada (1.48.0, relato #4 do GitHub, pedido do André em 30/10): o Piloto já é o /hunt
// e o Radar do Mercado juntos. Se o /hunt ou o Radar originais continuam ligados no navegador, as
// duas extensões disputam o mesmo lugar acima do pokémon em campo e escutam o jogo em dobro.
//
// Como reconhece (só lê a página, nada é enviado ao jogo nem mexe na outra extensão):
// - /hunt original: um botão com o texto "/hunt" fora dos elementos do Piloto (`plt-*`); no 1.2.0 é o `button.pih-btn`;
// - Radar original: um `#radar-mercado-barra` ou `#radar-mercado-tela` sem o `data-piloto` (o Piloto
//   usa os mesmos ids e marca os dele com `data-piloto="1"` em tela.js).
// Achou → uma linha no Diário e o quadro no meio da tela explicando como desativar. "Entendi"
// cala o aviso por 24 h (localStorage); o X só fecha nesta aba.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const esc = PIH.kit.esc;

  const CHAVE = 'piloto:duplicada:adiadaAte';
  const ADIA_MS = 24 * 60 * 60_000;
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;
  const lerAdiada = () => { try { return Number(localStorage.getItem(CHAVE)) || 0; } catch { return 0; } };
  const gravarAdiada = (v) => { try { localStorage.setItem(CHAVE, String(v)); } catch { /* sem armazenamento */ } };

  let caixa = null;
  let fechadaNestaAba = false;
  let registradas = '';

  function achar() {
    const achadas = [];
    // `.pih-btn` é o do /hunt 1.2.0; qualquer botão escrito só "/hunt" fora do Piloto cobre outras versões dele
    const hunt = [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '/hunt' && !b.closest('[class*="plt-"]'));
    if (hunt) achadas.push('/hunt');
    if (document.querySelector('#radar-mercado-barra:not([data-piloto]), #radar-mercado-tela:not([data-piloto])')) achadas.push('Radar do Mercado');
    return achadas;
  }

  function fechar() { if (caixa) { caixa.remove(); caixa = null; } }

  function mostrar(achadas) {
    if (!document.body || caixa) return;
    const nomes = achadas.map((n) => `<b>${esc(n)}</b>`).join(t3(' e ', ' and ', ' y '));
    const el = document.createElement('div');
    el.className = 'plt-guia plt-guia-solto plt-jogo-novo plt-duplicada';
    el.dataset.semTraducao = '1';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `<div class="plt-guia-caixa modal-caixa plt-jogo-novo-caixa">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h"><span class="plt-jogo-novo-ico" aria-hidden="true">⚠</span><span>${esc(t3('Extensão repetida ligada', 'Duplicate extension turned on', 'Extensión repetida activada'))}</span></h3>
          <button type="button" class="plt-guia-fechar" data-dup="x" aria-label="${esc(t3('Fechar', 'Close', 'Cerrar'))}" title="${esc(t3('Fechar', 'Close', 'Cerrar'))}">×</button>
        </div>
        <div class="plt-guia-corpo">
          <p class="plt-guia-de">${t3(
    `O ${nomes} original está ligado junto com o Piloto. O Piloto já faz tudo o que ele faz: os dois juntos disputam o mesmo lugar na tela e escutam o jogo em dobro.`,
    `The original ${nomes} is on together with the Pilot. The Pilot already does everything it does: together they fight over the same spot on screen and listen to the game twice.`,
    `El ${nomes} original está activado junto con el Piloto. El Piloto ya hace todo lo que hace: juntos se disputan el mismo lugar en la pantalla y escuchan el juego dos veces.`)}</p>
          <p class="plt-guia-de">${esc(t3(
    'Para resolver: abra chrome://extensions (no Edge, edge://extensions; no Firefox, about:addons), desative o original e dê F5 no jogo.',
    'To fix it: open chrome://extensions (Edge: edge://extensions; Firefox: about:addons), turn the original off and press F5 in the game.',
    'Para resolverlo: abre chrome://extensions (en Edge, edge://extensions; en Firefox, about:addons), desactiva el original y pulsa F5 en el juego.'))}</p>
        </div>
        <div class="plt-guia-rodape"><span class="plt-guia-bts plt-guia-bts-fim">
          <button type="button" class="cfg-escala-bt on" data-dup="entendi">${esc(t3('Entendi', 'Got it', 'Entendido'))}</button>
        </span></div>
      </div>`;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dup]');
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.dup === 'entendi') gravarAdiada(Date.now() + ADIA_MS);
      fechadaNestaAba = true;
      fechar();
    });
    for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    document.body.append(el);
    caixa = el;
  }
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && caixa) { ev.preventDefault(); ev.stopImmediatePropagation(); fechadaNestaAba = true; fechar(); } }, true);

  function conferir() {
    let achadas = [];
    try { achadas = achar(); } catch { return; }
    if (!achadas.length) { fechar(); return; }
    const chave = achadas.join('+');
    if (registradas !== chave) {
      registradas = chave;
      PIH.cofre?.diario?.(t3(`extensão repetida: o ${achadas.join(' e ')} original está ligado junto com o Piloto — desative o original`, `duplicate extension: the original ${achadas.join(' and ')} is on together with the Pilot — turn the original off`, `extensión repetida: el ${achadas.join(' y ')} original está activado junto con el Piloto — desactiva el original`), 'aviso');
    }
    if (fechadaNestaAba || Date.now() < lerAdiada()) return;
    mostrar(achadas);
  }

  // as outras extensões montam a barra quando o pokémon em campo aparece: confere algumas vezes no
  // começo e depois a cada 2 min
  for (const ms of [5_000, 15_000, 30_000, 60_000]) setTimeout(conferir, ms);
  setInterval(conferir, 120_000);

  PIH.duplicada = { conferir, achar, _interno: { caixa: () => caixa } };
})(globalThis);
