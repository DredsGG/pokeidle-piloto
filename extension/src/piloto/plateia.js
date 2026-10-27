// Plateia (1.29, pedido do André): liga o Piloto à outra extensão dele, a Plateia (Twitch e Kick).
//
// O bônus de XP do PokeIdle por assistir lives (Twitch: o jogo te procura no chat dos canais
// oficiais; Kick: pacote de recompensas por pontos do canal) só rende com as lives abertas. A Plateia
// faz isso numa "sala" (twitch.tv/drops/inventory#plateia e kick.com/drops/claimed#plateia). Aqui:
//
// 1. Ao abrir o jogo (uma vez por sessão do navegador, só com o Piloto ligado), abre as salas da
//    Plateia das plataformas vinculadas na conta (o service worker abre numa janela à parte, sem
//    roubar o foco). Opção "Abrir as salas ao entrar no jogo".
// 2. Na janela do bônus da Twitch e da Kick do próprio jogo, uma faixa deixa explícito o que fazer:
//    com a Plateia instalada, "Abrir a sala" (reaproveita a janela se já estiver aberta); sem ela,
//    "Baixar a Plateia" (GitHub).
//
// Como sabe que a Plateia está instalada: a ponte dela no pokeidle.io marca `window.__plateiaPonte`.
// Nada é enviado ao jogo.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;
  const esc = K.esc;

  const CHAVE = 'piloto:plateia:v1';
  const SALAS = {
    twitch: { url: 'https://www.twitch.tv/drops/inventory#plateia', janela: 'plateia', nome: 'Twitch' },
    kick: { url: 'https://kick.com/drops/claimed#plateia', janela: 'plateia-kick', nome: 'Kick' },
  };
  const BAIXAR = 'https://github.com/DredsGG/plateia/releases/latest';

  const ler = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; return { abrirAoEntrar: c.abrirAoEntrar !== false }; } catch { return { abrirAoEntrar: true }; } };
  const cfg = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  const diario = (txt, tipo) => PIH.cofre?.diario?.(`plateia: ${txt}`, tipo);

  const temPlateia = () => raiz.__plateiaPonte === true;
  const naPaginaDoJogo = () => /^\/app\/?$/.test(location.pathname);
  let eu = null;
  const vinculadas = () => {
    const out = [];
    if (eu && eu.twitch && eu.twitch.login) out.push('twitch');
    if (eu && eu.kick && (eu.kick.vinculado || eu.kick.login)) out.push('kick');
    return out;
  };

  // ---- 1. abrir as salas ao entrar no jogo ---------------------------------------------------
  let pediuAoEntrar = false;
  function autoAbrir() {
    if (pediuAoEntrar || !cfg.abrirAoEntrar || !naPaginaDoJogo() || !temPlateia()) return;
    if (!PIH.cofre || !PIH.cofre.ligado || !PIH.cofre.ligado()) return; // Off: nada automático
    const plataformas = vinculadas();
    if (!plataformas.length) return;
    pediuAoEntrar = true;
    document.dispatchEvent(new CustomEvent('piloto:plateia-abrir', { detail: JSON.stringify({ plataformas }) }));
    diario(`abrindo a sala da ${plataformas.map((p) => SALAS[p].nome).join(' e da ')} (uma vez por sessão do navegador)`);
  }
  PIH.on('estado', (e) => { eu = e; setTimeout(autoAbrir, 8000); });

  // Com clique (gesto do usuário): reaproveita a janela da sala se já estiver aberta.
  function abrirSala(p) {
    const s = SALAS[p];
    if (!s) return false;
    const w = raiz.open('', s.janela, 'popup=yes,width=1440,height=900');
    if (!w) return false;
    let vazia = false;
    try { vazia = !w.location.href || w.location.href === 'about:blank'; } catch { vazia = false; } // outra origem = a sala já está lá
    if (vazia) w.location.href = s.url;
    try { w.focus(); } catch { /* ok */ }
    return true;
  }
  function abrirAgora() {
    const ps = vinculadas();
    for (const p of (ps.length ? ps : ['twitch'])) abrirSala(p);
  }

  // ---- 2. a faixa na janela do bônus da Twitch / Kick do jogo ----------------------------------
  function faixa(p) {
    const s = SALAS[p];
    const el = document.createElement('div');
    el.className = 'plt-plateia-faixa';
    el.dataset.plateia = p;
    if (temPlateia()) {
      el.innerHTML = `<div class="plt-plateia-txt"><b>Farme este bônus com a Plateia</b><span>${p === 'twitch'
        ? 'A sala da Plateia fica no chat de todos os canais com bônus e toca as lives — o jogo te vê assistindo. Deixe a janela aberta.'
        : 'A sala da Plateia toca os canais oficiais e resgata o pacote de XP sozinha. Deixe a janela aberta.'}</span></div><button type="button" class="plt-plateia-bt">Abrir a sala da ${s.nome}</button>`;
      el.querySelector('button').addEventListener('click', (ev) => { ev.stopPropagation(); abrirSala(p); });
    } else {
      el.innerHTML = `<div class="plt-plateia-txt"><b>Quer farmar este bônus sem ficar com abas abertas na mão?</b><span>A Plateia (extensão do Dreds, grátis) assiste as lives com bônus por você, na Twitch e na Kick.</span></div><a class="plt-plateia-bt" href="${BAIXAR}" target="_blank" rel="noopener noreferrer">Baixar a Plateia</a>`;
    }
    return el;
  }
  function pintarFaixas() {
    for (const [p, id] of [['twitch', 'tw-corpo'], ['kick', 'kk-corpo']]) {
      const host = document.getElementById(id);
      if (!host || !host.parentElement) continue;
      const ant = host.parentElement.querySelector(`:scope > .plt-plateia-faixa[data-plateia="${p}"]`);
      const tem = temPlateia() ? '1' : '0';
      if (ant && ant.dataset.tem === tem) continue;
      if (ant) ant.remove();
      const f = faixa(p);
      f.dataset.tem = tem;
      host.parentElement.insertBefore(f, host);
    }
  }
  let agendado = 0;
  const obs = new MutationObserver(() => { if (!agendado) agendado = requestAnimationFrame(() => { agendado = 0; try { pintarFaixas(); } catch { /* tenta de novo */ } }); });
  const ligarObservador = () => { if (document.body) obs.observe(document.body, { childList: true, subtree: true }); else setTimeout(ligarObservador, 500); };
  ligarObservador();

  // ---- a linha na aba Rotina ----------------------------------------------------------------
  function linha(modo) {
    const ps = vinculadas();
    const status = !temPlateia() ? 'Plateia não instalada'
      : !ps.length ? 'nenhuma Twitch/Kick vinculada no jogo'
      : `${ps.map((p) => SALAS[p].nome).join(' e ')} · ${cfg.abrirAoEntrar ? 'abre ao entrar no jogo' : 'só no botão'}`;
    return `${K.grupo('Bônus de live')}${K.linha({ id: 'plateia', icone: 'xp', nome: 'Plateia (Twitch e Kick)', alvo: 'plateia:abrirAoEntrar', on: cfg.abrirAoEntrar, trava: modo === 'desligado', status: esc(status),
      dica: 'Liga o Piloto à Plateia, a outra extensão do Dreds que assiste as lives com bônus do PokeIdle. Ao abrir o jogo (uma vez por sessão do navegador), abre a sala da Twitch e/ou da Kick que estiverem vinculadas na sua conta, numa janela à parte. Na janela do bônus da Twitch/Kick do jogo aparece o botão "Abrir a sala". Sem a Plateia, aparece o link para baixar.',
      ajustes: modo === 'manual' ? (temPlateia() ? K.acao('Abrir as salas agora', 'data-acao="plateia-abrir"', 'xp', modo === 'desligado') : `<a class="cfg-escala-bt plt-acao on" href="${BAIXAR}" target="_blank" rel="noopener noreferrer">Baixar a Plateia</a>`) : '' })}`;
  }
  function definir(caminho, v) {
    if (caminho !== 'abrirAoEntrar') return;
    cfg.abrirAoEntrar = !!v;
    gravar();
    diario(`abrir as salas ao entrar no jogo ${v ? 'ligado' : 'desligado'}`);
  }

  PIH.plateia = { linha, definir, abrirAgora, abrirSala, temPlateia, vinculadas, _interno: { pintarFaixas, autoAbrir, cfg: () => cfg } };
})(globalThis);
