// Apoiar ♥ (1.47.1, regra 16 do hub; dados só de 02-projetos/extensoes/apoio.md): doação opcional.
//
// O item "Apoiar ♥" do rodapé abre um quadro pequeno no meio da tela. Passo 1: "De onde você é?"
// — 🇧🇷 Brasil (Pix, em reais) ou 🌎 Outro país (cartão, em dólar, pelo GitHub Sponsors). Com o idioma
// em português o Brasil vem destacado; nos outros, o outro país. Os dois sempre ficam clicáveis.
//   - Brasil: R$ 5 · R$ 10 · R$ 25 · Outro valor; o QR Code Pix do valor (BR Code estático montado aqui,
//     sem internet), "Copiar código Pix" e a chave com o botão de copiar.
//   - Outro país: abre https://github.com/sponsors/DredsGG numa aba nova.
// Fecha no X, no Esc ou clicando fora. Nunca abre sozinho, não manda nada para lugar nenhum, não guarda
// nada de quem doa (só o passo em que parou, para abrir no mesmo lugar) e não muda nenhum recurso.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const esc = PIH.kit.esc;

  // ---- os dados (apoio.md, preenchidos pelo André em 2026-10-29) ---------------------------------
  const PIX_CHAVE = 'fa525dad-afca-4683-845d-eee7225a53e3';
  const PIX_NOME = 'Andre Miller Fleck';
  const PIX_CIDADE = 'Sao Paulo';
  const SPONSORS = 'https://github.com/sponsors/DredsGG';
  const PROJETO = 'PokeIdle Piloto';
  const VALORES = [5, 10, 25];
  const CHAVE = 'piloto:apoiar:v1';

  // ---- BR Code (o "Pix copia e cola") ------------------------------------------------------------
  const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  // CRC16-CCITT-FALSE: polinômio 0x1021, começa em 0xFFFF, sem reflexão e sem XOR no fim
  function crc16(s) {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  // valor em reais (número) ou null para "a pessoa digita no banco"
  function brcode(valor = null) {
    let s = campo('00', '01')
      + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', PIX_CHAVE))
      + campo('52', '0000')
      + campo('53', '986')
      + (valor != null ? campo('54', Number(valor).toFixed(2)) : '')
      + campo('58', 'BR')
      + campo('59', PIX_NOME)
      + campo('60', PIX_CIDADE)
      + campo('62', campo('05', '***'))
      + '6304';
    return s + crc16(s);
  }
  // "Outro valor": aceita vírgula ou ponto; de R$ 1 a R$ 10.000; vazio = livre; o resto = inválido
  function lerValor(txt) {
    const t = String(txt ?? '').trim().replace(/^R\$\s*/i, '');
    if (!t) return { livre: true, valor: null };
    const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return { erro: true };
    const v = Math.round(Number(limpo) * 100) / 100;
    if (!(v >= 1 && v <= 10000)) return { erro: true };
    return { valor: v };
  }
  // o QR em SVG (correção de erro M), com borda branca de 4 módulos — nítido em qualquer tamanho
  function qrSvg(texto, rotulo) {
    if (!PIH.qrcode) return '';
    const q = PIH.qrcode(0, 'M');
    q.addData(texto, 'Byte');
    q.make();
    const n = q.getModuleCount();
    const m = 4;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg class="plt-ap-qr" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" role="img" aria-label="${esc(rotulo)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  // ---- idioma -------------------------------------------------------------------------------------
  const L = () => { try { const l = PIH.idioma && PIH.idioma.atual ? PIH.idioma.atual() : 'pt'; return ['pt', 'en', 'es'].includes(l) ? l : 'pt'; } catch { return 'pt'; } };
  const t3 = (pt, en, es) => ({ pt, en, es })[L()] || pt;
  const reais = (v) => (v == null ? '' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`);

  // ---- estado (só o passo, para abrir no mesmo lugar) ----------------------------------------------
  const lerSalvo = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; return { passo: ['br', 'fora'].includes(c.passo) ? c.passo : 'origem' }; } catch { return { passo: 'origem' }; } };
  const st = { ...lerSalvo(), escolha: 10, outro: '', copiado: '', aberto: false };
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify({ passo: st.passo })); } catch { /* sem armazenamento */ } };
  let fundo = null;
  let voltarFoco = null;

  function codigoAtual() {
    if (st.escolha === 'outro') {
      const r = lerValor(st.outro);
      if (r.erro) return { erro: true, codigo: brcode(null), valor: null };
      return { codigo: brcode(r.valor), valor: r.valor };
    }
    return { codigo: brcode(st.escolha), valor: st.escolha };
  }

  function corpo() {
    if (st.passo === 'br') {
      const c = codigoAtual();
      const rotulo = c.valor != null ? t3(`QR Code Pix de ${reais(c.valor)}`, `Pix QR Code for ${reais(c.valor)}`, `Código QR Pix de ${reais(c.valor)}`) : t3('QR Code Pix, valor livre', 'Pix QR Code, any amount', 'Código QR Pix, monto libre');
      return `<div class="plt-ap-valores" role="group" aria-label="${esc(t3('Valor', 'Amount', 'Monto'))}">
          ${VALORES.map((v) => `<button type="button" class="cfg-escala-bt${st.escolha === v ? ' on' : ''}" data-ap="valor" data-v="${v}" aria-pressed="${st.escolha === v}">${reais(v)}</button>`).join('')}
          <button type="button" class="cfg-escala-bt${st.escolha === 'outro' ? ' on' : ''}" data-ap="valor" data-v="outro" aria-pressed="${st.escolha === 'outro'}">${esc(t3('Outro valor', 'Other amount', 'Otro monto'))}</button>
        </div>
        ${st.escolha === 'outro' ? `<label class="plt-ap-outro"><span>R$</span><input type="text" inputmode="decimal" data-ap-outro value="${esc(st.outro)}" placeholder="${esc(t3('vazio = você digita no banco', 'empty = you type it in the bank app', 'vacío = lo escribes en el banco'))}" aria-label="${esc(t3('Outro valor em reais', 'Other amount in reais', 'Otro monto en reales'))}"></label>
          <small class="plt-ap-dica${c.erro ? ' erro' : ''}" data-ap-dica>${esc(c.erro ? t3('Valor entre R$ 1 e R$ 10.000 (ex.: 12,50). O QR abaixo é o de valor livre.', 'Amount between R$ 1 and R$ 10,000 (e.g. 12,50). The QR below is the any-amount one.', 'Monto entre R$ 1 y R$ 10.000 (ej.: 12,50). El QR de abajo es el de monto libre.') : t3('De R$ 1 a R$ 10.000; aceita vírgula. Vazio: você digita o valor no banco.', 'From R$ 1 to R$ 10,000; commas are fine. Empty: you type the amount in the bank app.', 'De R$ 1 a R$ 10.000; acepta coma. Vacío: escribes el monto en el banco.'))}</small>` : ''}
        <div class="plt-ap-qr-caixa" data-ap-qr>${qrSvg(c.codigo, rotulo)}</div>
        <button type="button" class="cfg-escala-bt on plt-ap-copiar" data-ap="copiar-codigo">${esc(st.copiado === 'codigo' ? t3('Copiado!', 'Copied!', '¡Copiado!') : t3('Copiar código Pix', 'Copy Pix code', 'Copiar código Pix'))}</button>
        <div class="plt-ap-chave"><small>${esc(t3('Chave aleatória', 'Random key', 'Clave aleatoria'))}</small><code>${esc(PIX_CHAVE)}</code><button type="button" class="cfg-escala-bt" data-ap="copiar-chave">${esc(st.copiado === 'chave' ? t3('Copiado!', 'Copied!', '¡Copiado!') : t3('Copiar', 'Copy', 'Copiar'))}</button></div>
        <p class="plt-ap-nota">${esc(t3(`Abra o app do seu banco, escolha Pix → Ler QR Code ou Pix Copia e Cola. O nome que aparece é ${PIX_NOME}.`, `Open your bank app and choose Pix → Read QR Code or Pix Copy and Paste. The name shown is ${PIX_NOME}.`, `Abre la app de tu banco y elige Pix → Leer código QR o Pix Copiar y Pegar. El nombre que aparece es ${PIX_NOME}.`))}</p>`;
    }
    if (st.passo === 'fora') {
      return `<p class="plt-ap-texto">${esc(t3('Uma vez ou todo mês, a partir de US$ 1. Pagamento com cartão pelo GitHub, sem taxa para mim.', 'One-time or monthly, from US$ 1. Card payments through GitHub, no fee for me.', 'Una vez o cada mes, desde US$ 1. Pago con tarjeta por GitHub, sin comisión para mí.'))}</p>
        <a class="cfg-escala-bt on plt-ap-sponsors" href="${SPONSORS}" target="_blank" rel="noopener noreferrer" data-ap="sponsors">${esc(t3('Abrir o GitHub Sponsors', 'Open GitHub Sponsors', 'Abrir GitHub Sponsors'))}</a>`;
    }
    const br = L() === 'pt';
    return `<p class="plt-ap-pergunta">${esc(t3('De onde você é?', 'Where are you from?', '¿De dónde eres?'))}</p>
      <div class="plt-ap-cartoes">
        <button type="button" class="plt-ap-cartao${br ? ' destaque' : ''}" data-ap="br"><span class="plt-ap-band" aria-hidden="true">🇧🇷</span><b>${esc(t3('Brasil', 'Brazil', 'Brasil'))}</b><small>${esc(t3('Pix, em reais, na hora', 'Pix, in reais, instant', 'Pix, en reales, al instante'))}</small></button>
        <button type="button" class="plt-ap-cartao${br ? '' : ' destaque'}" data-ap="fora"><span class="plt-ap-band" aria-hidden="true">🌎</span><b>${esc(t3('Outro país', 'Another country', 'Otro país'))}</b><small>${esc(t3('Cartão, em dólar, pelo GitHub Sponsors', 'Card, in dollars, through GitHub Sponsors', 'Tarjeta, en dólares, por GitHub Sponsors'))}</small></button>
      </div>
      <p class="plt-ap-nota">${esc(t3(`É opcional e não muda nada no ${PROJETO}. Obrigado por usar!`, `It's optional and changes nothing in ${PROJETO}. Thanks for using it!`, `Es opcional y no cambia nada en ${PROJETO}. ¡Gracias por usarlo!`))}</p>`;
  }

  function pintar(focarSeletor) {
    if (!fundo) return;
    const caixa = fundo.querySelector('[data-ap-corpo]');
    const titulo = fundo.querySelector('[data-ap-titulo]');
    const voltar = fundo.querySelector('[data-ap="voltar"]');
    titulo.textContent = st.passo === 'br' ? t3('Apoiar com Pix', 'Support with Pix', 'Apoyar con Pix') : st.passo === 'fora' ? t3('Apoiar pelo GitHub Sponsors', 'Support on GitHub Sponsors', 'Apoyar en GitHub Sponsors') : t3('Apoiar', 'Support', 'Apoyar'); // o ♥ já vem no ícone do título
    voltar.hidden = st.passo === 'origem';
    voltar.textContent = t3('← Voltar', '← Back', '← Volver');
    fundo.querySelector('.plt-guia-fechar').setAttribute('aria-label', t3('Fechar', 'Close', 'Cerrar'));
    caixa.innerHTML = corpo();
    const alvo = focarSeletor ? fundo.querySelector(focarSeletor) : null;
    if (alvo) { alvo.focus(); if (alvo.matches('input')) { const n = alvo.value.length; try { alvo.setSelectionRange(n, n); } catch { /* ok */ } } }
  }
  // só o QR e o aviso mudam enquanto a pessoa digita (o campo não perde o foco)
  function pintarQr() {
    const c = codigoAtual();
    const box = fundo && fundo.querySelector('[data-ap-qr]');
    const rotulo = c.valor != null ? t3(`QR Code Pix de ${reais(c.valor)}`, `Pix QR Code for ${reais(c.valor)}`, `Código QR Pix de ${reais(c.valor)}`) : t3('QR Code Pix, valor livre', 'Pix QR Code, any amount', 'Código QR Pix, monto libre');
    if (box) box.innerHTML = qrSvg(c.codigo, rotulo);
    const dica = fundo && fundo.querySelector('[data-ap-dica]');
    if (dica) {
      dica.classList.toggle('erro', !!c.erro);
      dica.textContent = c.erro ? t3('Valor entre R$ 1 e R$ 10.000 (ex.: 12,50). O QR abaixo é o de valor livre.', 'Amount between R$ 1 and R$ 10,000 (e.g. 12,50). The QR below is the any-amount one.', 'Monto entre R$ 1 y R$ 10.000 (ej.: 12,50). El QR de abajo es el de monto libre.') : t3('De R$ 1 a R$ 10.000; aceita vírgula. Vazio: você digita o valor no banco.', 'From R$ 1 to R$ 10,000; commas are fine. Empty: you type the amount in the bank app.', 'De R$ 1 a R$ 10.000; acepta coma. Vacío: escribes el monto en el banco.');
    }
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch {
      const ta = document.createElement('textarea'); ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      (fundo || document.body).appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { /* nada */ } ta.remove();
      return ok;
    }
  }

  function fechar() {
    if (!fundo) return;
    fundo.remove(); fundo = null; st.aberto = false;
    try { if (voltarFoco && voltarFoco.isConnected) voltarFoco.focus(); } catch { /* ok */ }
  }
  function abrir(origem) {
    if (fundo) return;
    voltarFoco = origem || document.activeElement;
    st.copiado = '';
    fundo = document.createElement('div');
    fundo.className = 'plt-ap-fundo';
    fundo.dataset.semTraducao = '1';
    fundo.innerHTML = `<div class="plt-guia-caixa modal-caixa plt-ap-caixa" role="dialog" aria-modal="true" aria-labelledby="plt-ap-titulo">
        <div class="modal-topo plt-guia-topo">
          <h3 class="plt-guia-h" id="plt-ap-titulo"><span class="plt-ap-coracao" aria-hidden="true">♥</span><span data-ap-titulo></span></h3>
          <button type="button" class="plt-guia-fechar" data-ap="fechar">×</button>
        </div>
        <div class="plt-guia-corpo plt-ap-corpo" data-ap-corpo></div>
        <div class="plt-guia-rodape"><button type="button" class="cfg-escala-bt plt-ap-voltar" data-ap="voltar" hidden></button></div>
      </div>`;
    fundo.addEventListener('click', async (ev) => {
      if (ev.target === fundo) { fechar(); return; } // clicou fora da caixa
      const b = ev.target.closest('[data-ap]');
      if (!b) return;
      const a = b.dataset.ap;
      if (a === 'fechar') { fechar(); return; }
      if (a === 'br' || a === 'fora') { st.passo = a; salvar(); pintar(a === 'br' ? '[data-ap="valor"].on' : '[data-ap="sponsors"]'); return; }
      if (a === 'voltar') { st.passo = 'origem'; salvar(); pintar('.plt-ap-cartao.destaque'); return; }
      if (a === 'valor') { st.escolha = b.dataset.v === 'outro' ? 'outro' : Number(b.dataset.v); st.copiado = ''; pintar(st.escolha === 'outro' ? '[data-ap-outro]' : `[data-ap="valor"][data-v="${st.escolha}"]`); return; }
      if (a === 'copiar-codigo' || a === 'copiar-chave') {
        const ok = await copiar(a === 'copiar-codigo' ? codigoAtual().codigo : PIX_CHAVE);
        st.copiado = ok ? (a === 'copiar-codigo' ? 'codigo' : 'chave') : '';
        if (!ok) b.textContent = t3('Não deu para copiar: selecione e copie à mão', "Couldn't copy: select it and copy by hand", 'No se pudo copiar: selecciona y copia a mano');
        else pintar(`[data-ap="${a}"]`);
        setTimeout(() => { if (fundo && st.copiado) { st.copiado = ''; const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.ap : null; pintar(f ? `[data-ap="${f}"]` : null); } }, 1800);
      }
    });
    fundo.addEventListener('input', (ev) => { if (ev.target.matches('[data-ap-outro]')) { st.outro = ev.target.value.slice(0, 12); st.copiado = ''; pintarQr(); } });
    // o teclado fica dentro do quadro (Tab circula; Esc fecha); o jogo não recebe as teclas
    fundo.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); return; }
      if (ev.key === 'Tab') {
        const foc = [...fundo.querySelectorAll('button:not([hidden]):not([disabled]), a[href], input')].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!foc.length) return;
        const i = foc.indexOf(document.activeElement);
        const prox = ev.shiftKey ? (i <= 0 ? foc[foc.length - 1] : foc[i - 1]) : (i < 0 || i >= foc.length - 1 ? foc[0] : foc[i + 1]);
        ev.preventDefault(); prox.focus();
      }
      ev.stopPropagation();
    });
    for (const t of ['keyup', 'keypress']) fundo.addEventListener(t, (e) => e.stopPropagation());
    document.body.append(fundo);
    st.aberto = true;
    pintar(st.passo === 'br' ? '[data-ap="valor"].on' : st.passo === 'fora' ? '[data-ap="sponsors"]' : '.plt-ap-cartao.destaque');
  }
  // trocou o idioma com o quadro aberto: redesenha
  document.addEventListener('piloto:idioma', () => { if (fundo) pintar(); });
  // Esc fecha só o quadro (sem isto a janela do Piloto, que escuta antes, fechava junto)
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && fundo) { ev.preventDefault(); ev.stopImmediatePropagation(); fechar(); } }, true);

  PIH.apoiar = { abrir, fechar, aberto: () => !!fundo, brcode, crc16, lerValor, qrSvg, _interno: { st } };
})(globalThis);
