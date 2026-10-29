// Manter o PC acordado (1.40.0, pedido do André em 29/10; ideia da pesquisa de 27/10: o Multidle,
// o PokeFarm, o PokeIdle Hub e o BookIdle não deixam o computador dormir enquanto farmam).
//
// Com o Piloto ligado (Manual ou Auto) e o jogo aberto, pede ao navegador para o computador não
// entrar em suspensão (`chrome.power.requestKeepAwake('system')`: a tela pode apagar, o PC não
// dorme). A página avisa o fundo a cada 1 min; sem aviso por 3 min (aba fechada, Piloto em Off,
// navegador fechado), o fundo solta o pedido e o PC volta a dormir normalmente.
// O Firefox não tem essa função: lá a linha avisa que não dá.
// O outro lado da ideia (recarregar a página que caiu) já existe: "Voltar sozinho se o jogo cair"
// (piloto/volta.js), que agora também avisa por notificação quando recarrega.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;

  const CHAVE = 'piloto:acordado:v1';
  const PULSO_MS = 60_000;
  const naPaginaDoJogo = () => /^\/app\/?$/.test(location.pathname);
  const cfg = (() => { try { const c = JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}; return { ligado: c.ligado !== false }; } catch { return { ligado: true }; } })();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };
  let resposta = null; // o que o fundo disse da última vez: { suportado, acordado }

  const pilotoLigado = () => !!(PIH.cofre && PIH.cofre.ligado && PIH.cofre.ligado());
  const querAcordado = () => cfg.ligado && pilotoLigado() && naPaginaDoJogo();
  function pulso() {
    try { document.dispatchEvent(new CustomEvent('piloto:acordado', { detail: JSON.stringify({ ligar: querAcordado() }) })); } catch { /* sem ponte */ }
  }
  document.addEventListener('piloto:acordado-resposta', (ev) => {
    try { const d = JSON.parse(ev.detail) || {}; resposta = { suportado: d.suportado !== false, acordado: !!d.acordado }; } catch { /* ok */ }
  });
  setInterval(pulso, PULSO_MS);
  setTimeout(pulso, 3000);
  // o modo mudou (Off, emergência, Manual, Auto): avisa na hora
  document.addEventListener('piloto:modo', () => setTimeout(pulso, 200));

  function status() {
    if (resposta && !resposta.suportado) return 'este navegador não deixa (o Firefox não tem essa função)';
    if (!cfg.ligado) return 'desligado';
    if (!pilotoLigado()) return 'só com o Piloto em Manual ou Auto';
    if (!resposta) return 'conferindo…';
    return resposta.acordado ? 'o PC não vai dormir enquanto o jogo estiver aberto' : 'conferindo…';
  }
  function linha(modo) {
    return K.linha({
      id: 'acordado', icone: 'lua', nome: 'Manter o PC acordado', alvo: 'acordado:ligado', on: cfg.ligado, trava: modo === 'desligado', status: K.esc(status()),
      dica: 'Enquanto o jogo estiver aberto e o Piloto em Manual ou Auto, o computador não entra em suspensão (a tela pode apagar normalmente). Fechou o jogo, pôs o Piloto em Off ou fechou o navegador: em até 3 min o PC volta a dormir como sempre. Não funciona no Firefox.',
    });
  }
  function definir(caminho, v) {
    if (caminho !== 'ligado') return;
    cfg.ligado = !!v;
    gravar();
    PIH.cofre?.diario?.(`manter o PC acordado ${cfg.ligado ? 'ligado' : 'desligado'}`);
    pulso();
  }

  PIH.acordado = { linha, definir, status, _interno: { pulso, cfg: () => cfg, resposta: () => resposta } };
})(globalThis);
