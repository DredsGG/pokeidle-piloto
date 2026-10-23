// Fila do Centro (1.15): dois botões colados no "Ir para o Centro Pokemon" do próprio jogo.
//
// - Fila (relógio): aperte uma vez e esqueça. Na primeira brecha (os 3 s sem dano que o jogo cobra),
//   o Piloto aperta o botão do JOGO por você — o mesmo clique, a mesma confirmação do Safari. Vale
//   em qualquer modo do Piloto, até no Off: é só o seu clique esperando a hora certa.
// - ↩ Ir e voltar: na primeira brecha vai ao Centro, cura e volta para a mesma hunt (a rotina da
//   reposição, marcada como pedido seu). Precisa do Piloto em Manual ou Auto.
// Apertar de novo cancela. Em hunt sem pausa (onda contínua), depois de 2 min sem brecha o botão
// avisa; o "Desistir do Combate" continua sendo decisão sua — o Piloto nunca aperta.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;

  const AVISO_MS = 2 * 60_000;
  const DESISTE_MS = 30 * 60_000;
  const FEITO_MS = 4000;

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });

  // modo: null | 'ficar' | 'voltar'; fase: 'fila' | 'indo' | 'feito' | 'erro'
  const st = { modo: null, fase: null, desde: 0, clicouEm: 0, cliques: 0, feitoEm: 0, msg: '' };
  let bts = null;

  const btJogo = () => document.getElementById('ir-centro');
  const contaJogo = () => (document.getElementById('ir-centro-conta')?.textContent || '').trim();
  // O tradutor do Piloto não olha estes botões (moram dentro da cena do jogo): o texto já sai
  // traduzido daqui, e a comparação é com o traduzido — senão os dois ficariam trocando o texto.
  const tr = (x) => { try { return PIH.idioma?.traduzir ? PIH.idioma.traduzir(x) : x; } catch { return x; } };
  const naHunt = () => !!eu && !!eu.huntSlug && !eu.noCentro;

  // Ícones (1.15.1): o MESMO prédio do Centro nos dois — telhado e a cruz vermelha — e um selo
  // dourado que diz a ação: relógio = espera a brecha; seta de volta = vai, cura e volta.
  const PREDIO = '<path d="M2.5 10.2 11 3.3l8.5 6.9V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" fill="#fff6ef" stroke="#480e1e" stroke-width="1.6" stroke-linejoin="round"/><path d="M2.5 10.2 11 3.3l8.5 6.9" fill="none" stroke="#d8574a" stroke-width="2.4" stroke-linejoin="round"/><path d="M9.6 9.6h2.8v2.6H15v2.8h-2.6v2.6H9.6V15H7v-2.8h2.6z" fill="#e2433a"/>';
  const SELO = (dentro) => `<circle cx="18" cy="17.8" r="5.9" fill="#ffd36b" stroke="#480e1e" stroke-width="1.6"/>${dentro}`;
  const ICONES = {
    // relógio: espera a brecha
    ficar: `<svg class="plt-fila-ico" viewBox="0 0 24 24" aria-hidden="true">${PREDIO}${SELO('<path d="M18 14.6v3.5l2.3 1.4" fill="none" stroke="#480e1e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>')}</svg>`,
    // seta em U: vai, cura e volta
    voltar: `<svg class="plt-fila-ico" viewBox="0 0 24 24" aria-hidden="true">${PREDIO}${SELO('<path d="M20.4 20.2v-2.4a2.4 2.4 0 0 0-4.8 0v2.6" fill="none" stroke="#480e1e" stroke-width="1.9" stroke-linecap="round"/><path d="m13.9 18.9 1.7 1.9 1.7-1.9" fill="none" stroke="#480e1e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>')}</svg>`,
  };
  function montar() {
    const jogo = btJogo();
    const caixa = jogo && jogo.parentElement;
    if (!caixa) return false;
    if (bts && bts.fila.isConnected) return true;
    const criar = (modo, icone, rotulo, dica) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ir-centro plt-fila-centro plt-fila-${modo}`;
      b.dataset.modo = modo;
      b.title = dica;
      b.setAttribute('aria-label', dica);
      b.innerHTML = `${ICONES[modo] || K.ico(icone, 'plt-fila-ico')}<span class="plt-fila-txt">${rotulo}</span>`;
      b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); apertar(modo); });
      return b;
    };
    bts = {
      fila: criar('ficar', 'relogio', 'Fila', 'Fila do Centro: vai sozinho na primeira brecha (apertar de novo cancela)'),
      voltar: criar('voltar', 'voltar', 'Volta', 'Ir e voltar: na primeira brecha vai ao Centro, cura e volta para esta hunt'),
    };
    caixa.classList.add('plt-com-fila');
    jogo.after(bts.fila, bts.voltar);
    pintar();
    return true;
  }

  function apertar(modo) {
    if (st.modo === modo && (st.fase === 'fila' || st.fase === 'indo')) return cancelar();
    if (st.modo && st.fase === 'fila') cancelar();
    if (!naHunt()) return mostrarErro('só numa hunt', modo);
    if (modo === 'voltar') {
      const r = PIH.auto?.irAoCentroEVoltar?.() || { ok: false, motivo: 'a automação de hunt não carregou' };
      if (!r.ok) return mostrarErro(r.motivo, modo);
    } else if (PIH.auto?.rotinaAtual?.()) {
      return mostrarErro('o Piloto já está indo ao Centro', modo);
    }
    Object.assign(st, { modo, ultimo: modo, fase: 'fila', desde: Date.now(), clicouEm: 0, cliques: 0, msg: '' });
    PIH.cofre?.diario?.(`centro: na fila (${modo === 'voltar' ? 'ir, curar e voltar' : 'ir e ficar'})`);
    tique();
  }
  function cancelar() {
    if (st.modo === 'voltar') PIH.auto?.cancelarIdaManual?.();
    PIH.cofre?.diario?.('centro: fila cancelada por você');
    Object.assign(st, { modo: null, fase: null, msg: '' });
    pintar();
  }
  function mostrarErro(msg, modo = st.modo || st.ultimo || 'ficar') {
    Object.assign(st, { modo: null, ultimo: modo, fase: 'erro', feitoEm: Date.now(), msg });
    pintar();
  }

  function tique() {
    if (!montar()) return;
    const n = Date.now();
    if ((st.fase === 'feito' || st.fase === 'erro') && n - st.feitoEm > FEITO_MS) { st.fase = null; st.msg = ''; }
    if (st.modo === 'ficar' && (st.fase === 'fila' || st.fase === 'indo')) {
      if (eu && eu.noCentro) { Object.assign(st, { modo: null, fase: 'feito', feitoEm: n, msg: 'no Centro' }); PIH.cofre?.diario?.('centro: chegou', 'ok'); }
      else if (!eu || !eu.huntSlug) { /* trocando de mapa: espera */ }
      else if (n - st.desde > DESISTE_MS) { mostrarErro('30 min sem brecha: cancelado'); }
      else {
        const jogo = btJogo();
        // a brecha: o próprio jogo destravou o botão dele. Uma tentativa a cada 2,5 s no máximo.
        if (jogo && !jogo.disabled && n - st.clicouEm > 2500) {
          st.clicouEm = n; st.cliques++; st.fase = 'indo';
          jogo.click();
        } else if (st.fase === 'indo' && n - st.clicouEm > 2500) st.fase = 'fila'; // recusado: volta para a fila
      }
    }
    if (st.modo === 'voltar') {
      const r = PIH.auto?.rotinaAtual?.();
      if (!r || !r.manual) Object.assign(st, { modo: null, fase: 'feito', feitoEm: n, msg: 'de volta à hunt' });
      else st.fase = r.etapa === 'esperar' ? 'fila' : 'indo';
    }
    pintar();
  }
  setInterval(tique, 150);

  function pintar() {
    if (!bts) return;
    const n = Date.now();
    const ativo = (modo) => st.modo === modo && (st.fase === 'fila' || st.fase === 'indo');
    const semBrecha = st.fase === 'fila' && n - st.desde > AVISO_MS;
    for (const [modo, b] of [['ficar', bts.fila], ['voltar', bts.voltar]]) {
      const on = ativo(modo);
      b.classList.toggle('on', on);
      b.classList.toggle('plt-fila-alerta', on && semBrecha);
      const meu = !st.modo && st.ultimo === modo;
      b.classList.toggle('plt-fila-ok', meu && st.fase === 'feito');
      b.classList.toggle('plt-fila-erro', meu && st.fase === 'erro');
      const txt = b.querySelector('.plt-fila-txt');
      let rot = modo === 'ficar' ? 'Fila' : 'Volta';
      if (on) rot = st.fase === 'indo' ? 'Indo…' : semBrecha ? 'Sem brecha' : (contaJogo() || 'Na fila');
      if (meu && st.fase === 'feito') rot = modo === 'ficar' ? 'No Centro' : 'Voltou';
      if (meu && st.fase === 'erro') rot = 'Não deu';
      rot = tr(rot);
      if (txt.textContent !== rot) txt.textContent = rot;
      const dica = on
        ? (semBrecha ? 'Mais de 2 min sem brecha: esta hunt não para de lutar. Se quiser sair agora, use "Desistir do Combate" (custa XP). Apertar aqui cancela a fila.' : 'Na fila: vai na primeira brecha. Apertar de novo cancela.')
        : meu && st.fase === 'erro' ? `Não deu: ${st.msg}`
          : modo === 'ficar' ? 'Fila do Centro: vai sozinho na primeira brecha (apertar de novo cancela)' : 'Ir e voltar: na primeira brecha vai ao Centro, cura e volta para esta hunt';
      const dicaT = tr(dica);
      if (b.title !== dicaT) { b.title = dicaT; b.setAttribute('aria-label', dicaT); }
    }
  }

  PIH.centro = { apertar, cancelar, estado: () => ({ ...st }), _interno: { tique, montar } };
})(globalThis);
