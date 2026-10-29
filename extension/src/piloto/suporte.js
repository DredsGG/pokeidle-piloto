// Suporte (1.25): "Relatar bug" e "Procurar atualização" no painel do Piloto — o mesmo sistema do
// Midas (pedido do André, 2026-10-26).
//
// - Relatar bug: um cartão com o campo "o que aconteceu" e o diagnóstico (versões, navegador, modo,
//   Saúde, o que está ligado e o fim do Diário). "Abrir no GitHub" abre um relato já preenchido em
//   github.com/DredsGG/pokeidle-piloto/issues; "Copiar" copia o texto. Nada da conta: sem nick, sem
//   saldo, sem e-mail, sem cookie.
// - Atualização: o service worker procura nos Releases do GitHub (ao abrir o Chrome, a cada 6 h e no
//   botão). Com versão nova, aparece o cartão dourado com o que mudou e "Atualizar" (baixa o zip; a
//   pasta extraída por cima é percebida em até 1 min e o Piloto se recarrega sozinho).
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;
  const tr = (x) => { try { return PIH.idioma && PIH.idioma.traduzir ? PIH.idioma.traduzir(x) : x; } catch { return x; } };

  const REPO = 'DredsGG/pokeidle-piloto';
  const GH_NOVO = `https://github.com/${REPO}/issues/new`;

  let upd = {};
  let status = null; // 'procurando' | 'nenhuma' | 'erro' | 'baixado' | 'aplicando' | 'loja'
  let bugAberto = false;
  document.addEventListener('piloto:upd', (ev) => { try { upd = JSON.parse(ev.detail) || {}; } catch { /* nada */ } pintar(); });
  document.addEventListener('piloto:upd-resposta', (ev) => {
    let d = {};
    try { d = JSON.parse(ev.detail) || {}; } catch { return; }
    if (d.acao === 'checar') status = d.erro ? 'erro' : (d.r && d.r.erro ? 'erro' : (d.r && d.r.disponivel ? null : 'nenhuma'));
    if (d.acao === 'aplicar') status = d.erro ? 'erro' : d.r && d.r.modo === 'firefox' ? 'firefox' : d.r && d.r.modo === 'firefox-temporario' ? 'firefox-temporario' : d.r && d.r.status === 'baixado' ? 'baixado' : d.r && d.r.modo === 'loja' ? (d.r.status === 'aplicando' ? 'aplicando' : 'loja') : 'erro';
    pintar();
  });
  const pedir = (acao, extra = {}) => document.dispatchEvent(new CustomEvent('piloto:upd-pedir', { detail: JSON.stringify({ acao, ...extra }) }));

  // ---- o relatório -------------------------------------------------------------------------------
  function relatorio(oque, maxLog = 60) {
    const ua = navigator.userAgent;
    const v = (re) => (ua.match(re) || [])[1];
    // Brave se identifica como Chrome; só o navigator.brave entrega
    const navegador = v(/Firefox\/([\d.]+)/) ? `Firefox ${v(/Firefox\/([\d.]+)/)}` : v(/Edg\/([\d.]+)/) ? `Edge ${v(/Edg\/([\d.]+)/)}`
      : v(/OPR\/([\d.]+)/) ? `Opera ${v(/OPR\/([\d.]+)/)}` : navigator.brave ? `Brave (Chromium ${v(/Chrome\/([\d.]+)/) || '?'})` : `Chrome ${v(/Chrome\/([\d.]+)/) || '?'}`;
    const so = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '?';
    const versao = document.documentElement.dataset.pilotoVersao || '?';
    let modo = '?';
    try { const cof = PIH.cofre && PIH.cofre.resumo(); modo = cof && !cof.ligado ? 'off' : JSON.parse(localStorage.getItem('piloto:modo:v1') || '"?"'); } catch { /* ok */ }
    const ligado = [];
    try { const c = PIH.auto._interno.cfg(); if (c.hunt.ligado) ligado.push('troca de hunt'); if (c.repor.ligado) ligado.push('reposição'); } catch { /* ok */ }
    try { const c = PIH.captura.resumo(); ligado.push(`pokébola ${c.vip ? 'VIP' : c.ligado ? 'on' : 'off'}`); } catch { /* ok */ }
    try { const v = PIH.volta.resumo(); ligado.push(`voltar ${v.ligado ? 'on' : 'off'} (${v.motivo})`); } catch { /* ok */ }
    try { if (PIH.metaCaca && PIH.metaCaca.ativo()) ligado.push('caçar o meta'); } catch { /* ok */ }
    try { if (PIH.cacadas && PIH.cacadas.ativo()) ligado.push(`caçada: ${PIH.cacadas.modo()}`); } catch { /* ok */ }
    try { if (PIH.farm && PIH.farm.ativo()) ligado.push('modo farm'); } catch { /* ok */ }
    try { const g = PIH.guarda.resumo(); ligado.push(`vender pokémon ${g.pronto ? 'pronto' : g.motivo}`); } catch { /* ok */ }
    let saude = '-';
    try { const r = PIH.saude.relatorio(); saude = r && r.em ? (r.ok ? `ok (${r.checks.length})` : `FALHAS: ${r.falhas.join(' · ')}`) : '-'; } catch { /* ok */ }
    let cofre = '';
    try { const c = PIH.cofre.resumo(); cofre = `cofre: teto ${Math.round(c.teto)} · gasto hoje ${Math.round(c.gasto)}${c.desligados.length ? ` · disjuntor: ${c.desligados.join(', ')}` : ''}`; } catch { /* ok */ }
    const meta = [
      `Piloto: v${versao} (${upd.instalacao || '?'})`,
      `Jogo: ${PIH.versaoDoJogo ? PIH.versaoDoJogo() || '?' : '?'} · página ${location.pathname}`,
      `Navegador: ${navegador} · ${so} · ${navigator.language} · painel ${(PIH.idioma && PIH.idioma.atual && PIH.idioma.atual()) || '?'}`,
      `Modo: ${modo}`,
      ligado.length ? `Ligado: ${ligado.join(' · ')}` : '',
      `Saúde: ${saude}`,
      cofre,
    ].filter(Boolean).join('\n');
    const eventos = [...(PIH.cofre && PIH.cofre.ultimos ? PIH.cofre.ultimos(maxLog) : []), ...(PIH.auto && PIH.auto.diario ? PIH.auto.diario().slice(0, maxLog) : [])]
      .filter((d) => d && d.t).sort((a, b) => a.t - b.t).slice(-maxLog);
    // o Diário não tem nick nenhum; por garantia, tira o que parecer e-mail
    const log = eventos.map((d) => `${new Date(d.t).toLocaleTimeString('pt-BR')} ${d.tipo && d.tipo !== 'ok' && d.tipo !== 'info' ? d.tipo.toUpperCase() + ' ' : ''}${String(d.txt || '').replace(/\S+@\S+/g, '[e-mail]')}`);
    return { oque: String(oque || '').trim(), meta, log, diag: `${meta}\n\nDiário:\n${log.join('\n')}` };
  }
  function urlDoRelato(oque) {
    const r = relatorio(oque);
    const titulo = '[Bug] ' + (r.oque.split('\n')[0].slice(0, 70) || `v${document.documentElement.dataset.pilotoVersao || '?'}`);
    const montar = (log, cortado) => `${GH_NOVO}?title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(
      `### O que aconteceu\n\n${r.oque || '-'}\n\n### Diagnóstico\n\n\`\`\`text\n${r.meta}\n\nDiário${cortado ? ' (cortado)' : ''}:\n${log.join('\n')}\n\`\`\`\n`)}`;
    let log = r.log;
    let url = montar(log, false);
    while (url.length > 7500 && log.length > 5) { log = log.slice(Math.ceil(log.length / 5)); url = montar(log, true); }
    return url;
  }

  // ---- o painel ----------------------------------------------------------------------------------
  const ICO_BUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.6 7 4.1 8.1 3l1.8 1.8a5 5 0 0 1 4.2 0L15.9 3 17 4.1l-1.5 1.5A5 5 0 0 1 17 9h2v2h-2v1.5h2.5v2H17V15a5 5 0 0 1-.3 1.6l2.2 2.2-1.4 1.4-1.9-1.9A5 5 0 0 1 12 20a5 5 0 0 1-3.6-1.7l-1.9 1.9-1.4-1.4 2.2-2.2A5 5 0 0 1 7 15v-.5H4.5v-2H7V11H5V9h2a5 5 0 0 1 1.5-3.4zM11 10v8h2v-8z" fill="currentColor"/></svg>';
  const ICO_UPD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 1 7.4 5H17v2h5V6h-2v1.7A10 10 0 0 0 2.1 11h2A8 8 0 0 1 12 4zm7.9 9A8 8 0 0 1 4.6 15H7v-2H2v5h2v-1.7A10 10 0 0 0 21.9 13z" fill="currentColor"/></svg>';
  const itensDasNotas = (md) => String(md || '').replace(/^\s*###\s*(Install|Instalar)[\s\S]*?\n\s*\n\s*\n/i, '').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/^\s*([-*+]|\d+\.)\s*/, '').replace(/[*_`]/g, '').trim())
    .filter((l) => l && !/^(install|instalar|download|baixe|open `chrome|abra `chrome|drag the zip|arraste o zip|chrome, edge|firefox 128|step by step|passo a passo)/i.test(l)).flatMap((l) => (l.length > 160 ? l.split(/(?<=[.!?])\s+/) : [l])).filter(Boolean).slice(0, 6);

  function htmlBotoes() {
    const procurando = status === 'procurando';
    const st = procurando ? 'procurando…' : upd.disponivel ? `v${upd.ultima} disponível` : status === 'nenhuma' ? 'você está na última versão' : status === 'erro' || (status && upd.erro) ? 'não deu para procurar agora' : '';
    return `<div class="plt-sup-bts">
      <button type="button" class="plt-sup-bt" data-sup="bug" title="Relatar um bug para o Dreds" aria-expanded="${bugAberto}">${ICO_BUG}<span>${esc(tr('Relatar bug'))}</span></button>
      <button type="button" class="plt-sup-bt${procurando ? ' gira' : ''}" data-sup="checar" title="Procurar versão nova no GitHub">${ICO_UPD}<span>${esc(tr('Procurar atualização'))}</span></button>
    </div>${st ? `<div class="plt-sup-st${upd.disponivel ? ' novo' : status === 'nenhuma' ? ' ok' : status === 'procurando' ? ' busca' : ' erro'}">${upd.disponivel ? '' : status === 'nenhuma' ? '<i aria-hidden="true">✓</i>' : ''}<span>${esc(tr(st))}</span></div>` : ''}`;
  }
  function htmlCartoes() {
    let out = '';
    const ju = upd.acabouDe;
    if (ju && Date.now() - ju.em < 30 * 60_000) out += `<div class="plt-sup-ok"><span>${esc(tr(`Piloto atualizado: v${ju.de || '?'} → v${ju.para}`))}</span><button type="button" data-sup="visto" aria-label="Fechar">×</button></div>`;
    if (upd.disponivel && upd.dispensada !== upd.ultima) {
      const itens = itensDasNotas(upd.notas);
      const msg = status === 'firefox' ? 'O Firefox vai perguntar se quer instalar a versão nova: clique em Adicionar. As abas do jogo recarregam sozinhas.'
        : status === 'firefox-temporario' ? 'O zip novo foi baixado. Em about:debugging, remova o Piloto e carregue o zip novo em "Carregar extensão temporária".'
        : status === 'baixado' ? 'O zip foi baixado (pasta Downloads). Extraia por cima da pasta do Piloto: em até 1 min ele se recarrega sozinho e as abas do jogo recarregam.'
        : status === 'aplicando' ? 'Atualizando…' : status === 'loja' ? 'O navegador ainda não liberou a versão nova: tente de novo daqui a pouco.' : status === 'erro' ? 'Não deu para atualizar agora.' : '';
      out += `<div class="plt-sup-upd">
        <div class="plt-sup-h"><span class="plt-sup-ic">${ICO_UPD}</span><span><b>${esc(tr('Atualização disponível'))}</b><small>v${esc(upd.atual || '?')} → <i>v${esc(upd.ultima)}</i></small></span></div>
        ${itens.length ? `<ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${msg ? `<p class="plt-sup-msg">${esc(tr(msg))}</p>` : ''}
        <div class="plt-sup-acoes"><button type="button" class="cfg-escala-bt on" data-sup="aplicar"${status === 'aplicando' ? ' disabled' : ''}>${esc(tr('Atualizar'))}</button><button type="button" class="cfg-escala-bt" data-sup="depois">${esc(tr('Depois'))}</button>${upd.pagina ? `<a class="plt-sup-link" href="${esc(upd.pagina)}" target="_blank" rel="noopener noreferrer">${esc(tr('Ver no GitHub'))}</a>` : ''}</div>
      </div>`;
    }
    if (bugAberto) {
      out += `<div class="plt-sup-bug">
        <div class="plt-sup-h"><span class="plt-sup-ic plt-sup-ic-bug">${ICO_BUG}</span><span><b>${esc(tr('Relatar um bug'))}</b><small>${esc(tr('Vira um relato no GitHub do Piloto; o Dreds corrige e avisa lá.'))}</small></span><button type="button" class="plt-sup-x" data-sup="bug-fechar" aria-label="Fechar">×</button></div>
        <textarea data-sup-oque rows="3" placeholder="${esc(tr('O que aconteceu? O que você esperava?'))}"></textarea>
        <details><summary>${esc(tr('O que vai junto (sem nada da sua conta)'))}</summary><pre data-sup-diag></pre></details>
        <div class="plt-sup-acoes"><button type="button" class="cfg-escala-bt on" data-sup="bug-gh">${esc(tr('Abrir no GitHub'))}</button><button type="button" class="cfg-escala-bt" data-sup="bug-copiar">${esc(tr('Copiar'))}</button></div>
        <p class="plt-sup-nota">${esc(tr('Precisa de uma conta no GitHub. Sem conta, use Copiar e mande para o Dreds.'))}</p>
      </div>`;
    }
    return out;
  }
  let ultimoBts = '';
  let ultimoCartoes = '';
  function pintar() {
    const j = document.querySelector('.plt-janela:not(.plt-janela-time)');
    if (!j) { ultimoBts = ''; ultimoCartoes = ''; return; }
    const bts = j.querySelector('[data-suporte-bts]');
    const cart = j.querySelector('[data-suporte]');
    if (bts) { const h = htmlBotoes(); if (h !== ultimoBts || !bts.firstChild) { ultimoBts = h; bts.innerHTML = h; } }
    if (cart) {
      const h = htmlCartoes();
      if (h !== ultimoCartoes || (h && !cart.firstChild)) {
        const texto = cart.querySelector('[data-sup-oque]')?.value || '';
        ultimoCartoes = h; cart.innerHTML = h;
        const ta = cart.querySelector('[data-sup-oque]');
        if (ta) {
          ta.value = texto;
          // as teclas digitadas aqui não podem virar atalho do jogo
          for (const t of ['keydown', 'keyup', 'keypress']) ta.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
          const diag = cart.querySelector('[data-sup-diag]');
          if (diag) diag.textContent = relatorio('').diag;
        }
      }
    }
  }
  setInterval(pintar, 1000);

  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sup]');
    if (!b || !b.closest('.plt-janela')) return;
    const a = b.dataset.sup;
    if (a === 'bug') { bugAberto = !bugAberto; pintar(); if (bugAberto) setTimeout(() => document.querySelector('[data-sup-oque]')?.focus(), 50); return; }
    if (a === 'bug-fechar') { bugAberto = false; pintar(); return; }
    if (a === 'checar') { status = 'procurando'; pintar(); pedir('checar'); return; }
    if (a === 'aplicar') { status = 'aplicando'; pintar(); pedir('aplicar'); return; }
    if (a === 'depois') { upd.dispensada = upd.ultima; status = null; pintar(); pedir('dispensar', { versao: upd.ultima || null }); return; }
    if (a === 'visto') { upd.acabouDe = null; pintar(); pedir('dispensar', { limparAviso: true }); return; }
    const oque = document.querySelector('[data-sup-oque]')?.value || '';
    if (a === 'bug-gh') { window.open(urlDoRelato(oque), '_blank', 'noopener'); return; }
    if (a === 'bug-copiar') {
      const r = relatorio(oque, 200);
      const texto = `PokeIdle Piloto — relato de bug\n\n${r.oque || '-'}\n\n${r.diag}`;
      let ok = false;
      try { await navigator.clipboard.writeText(texto); ok = true; } catch {
        const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch { /* nada */ } ta.remove();
      }
      b.textContent = tr(ok ? 'Copiado!' : 'Não deu para copiar');
      setTimeout(() => { b.textContent = tr('Copiar'); }, 1600);
    }
  }, true);

  PIH.suporte = { relatorio, urlDoRelato, itensDasNotas, estado: () => ({ upd: { ...upd }, status, bugAberto }) };
})(globalThis);
