// Parada de emergência (1.38.0, pedido do André em 29/10; ideia da pesquisa de 27/10: o PokeIdle
// Deck para com Esc e o Auto Helper do yColes com Alt+Shift+P).
//
// Alt+Shift+P põe o Piloto em Off na hora: compra, revenda, reposição, troca de hunt e de time,
// rotina e Radar param (todo comando do Piloto passa pelo cofre, e o cofre recusa tudo em Off). O
// jogo continua com as automações dele. Um quadro no meio da tela confirma e tem o botão para
// voltar ao modo de antes. Funciona de dois jeitos:
// - na aba do jogo, pela tecla (o Esc continua só fechando quadros, regra 14);
// - com o navegador em qualquer aba, pelo atalho da extensão (chrome.commands, dá para trocar a
//   tecla em chrome://extensions/shortcuts): o fundo avisa a aba do jogo pela ponte.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const esc = PIH.kit.esc;

  const NOME_MODO = { manual: 'Manual', automatico: 'Auto' };
  let antes = null; // o modo que estava ligado quando parou
  let paradoEm = 0;
  let caixa = null;

  function fecharCaixa() { if (caixa) { caixa.remove(); caixa = null; } }

  function mostrar(jaEstava) {
    if (!document.body) return;
    fecharCaixa();
    const el = document.createElement('div');
    el.className = 'plt-guia plt-guia-solto plt-emerg';
    el.setAttribute('role', 'alertdialog');
    const volta = !jaEstava && antes && NOME_MODO[antes];
    el.innerHTML = `<div class="plt-guia-caixa modal-caixa plt-emerg-caixa">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h"><span class="plt-emerg-ico" aria-hidden="true">■</span><span>${jaEstava ? 'O Piloto já estava em Off' : 'Piloto parado'}</span></h3>
          <button type="button" class="plt-guia-fechar" data-emerg="fechar" aria-label="Fechar" title="Fechar">×</button>
        </div>
        <div class="plt-guia-corpo">
          <p class="plt-guia-de">${jaEstava ? 'Nada do Piloto está rodando. Para ligar de novo, escolha Manual ou Auto na janela do Piloto.' : 'Tudo do Piloto parou: compras, revenda, reposição, troca de hunt e de time, rotina e Radar. O jogo continua com as automações dele.'}</p>
        </div>
        <div class="plt-guia-rodape"><span class="plt-guia-bts plt-guia-bts-fim">
          ${volta ? `<button type="button" class="cfg-escala-bt" data-emerg="voltar">${esc(volta === 'Auto' ? 'Voltar ao Auto' : 'Voltar ao Manual')}</button>` : ''}
          <button type="button" class="cfg-escala-bt on" data-emerg="fechar">Entendi</button>
        </span></div>
      </div>`;
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-emerg]');
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.emerg === 'voltar' && antes && PIH.modo) {
        PIH.modo.definir(antes);
        PIH.cofre?.diario?.(`voltou ao ${NOME_MODO[antes]} depois da parada de emergência`, 'ok');
        antes = null;
      }
      fecharCaixa();
    });
    for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    document.body.append(el);
    caixa = el;
    const foco = el.querySelector('.cfg-escala-bt.on');
    if (foco) try { foco.focus({ preventScroll: true }); } catch { /* ok */ }
  }

  function parar(origem) {
    if (!PIH.modo) return false;
    const agora = Date.now();
    const atual = PIH.modo.atual();
    if (atual === 'desligado' && agora - paradoEm < 1500) return true; // a tecla e o atalho do navegador chegaram juntos
    paradoEm = agora;
    if (atual === 'desligado') { mostrar(true); return true; }
    antes = atual;
    PIH.modo.definir('desligado');
    PIH.cofre?.diario?.(`PARADA DE EMERGÊNCIA (${origem}): o Piloto foi para Off`, 'aviso');
    mostrar(false);
    return true;
  }

  // Alt+Shift+P pela posição da tecla (vale em qualquer layout de teclado)
  addEventListener('keydown', (ev) => {
    if (ev.code !== 'KeyP' || !ev.altKey || !ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.repeat) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    parar('Alt+Shift+P');
  }, true);
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && caixa) { ev.preventDefault(); ev.stopImmediatePropagation(); fecharCaixa(); } }, true);
  // o atalho do navegador (o fundo manda pela ponte)
  document.addEventListener('piloto:emergencia', () => { parar('atalho do navegador'); });

  PIH.emergencia = { parar, _interno: { caixa: () => caixa, antes: () => antes } };
})(globalThis);
