// Volta sozinho (1.20.1): o jogo caiu nesta aba (outra aba ou aparelho entrou na conta, o servidor
// reiniciou, a internet piscou) e ficou parado? Depois de alguns minutos o Piloto recarrega a
// página para voltar ao farm — o mesmo F5 que você daria.
//
// 1.23.1 (o André viu ficar parada muito tempo): 5 min parado = recarrega, sempre. Antes, cada
// clique na página zerava a contagem e cada volta que não "firmava" por 20 min dobrava a espera até
// desistir — na prática a aba ficava parada horas. Agora:
// - 5 min parado (o socket do jogo fechou ou nada chega há 1,5 min) → recarrega;
// - só segura enquanto outra aba DESTE Chrome está no jogo (a vigia abre uma por ~1 min) ou se você
//   clicou/digitou nos últimos 30 s (sem zerar a contagem);
// - se a conta foi tomada de novo em menos de 3 min depois de voltar (outro aparelho jogando), a
//   espera seguinte dobra: 5, 10, 20, 30 min no máximo — e nunca desiste;
// - só no Auto (no Off nada automático roda).
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.kit) return;
  const K = PIH.kit;

  const CHAVE = 'piloto:volta:v1';
  const CHAVE_TENT = 'piloto:volta:tentativas';
  const ESPERAS_MIN = [5, 10, 20, 30];
  const SILENCIO_MS = 90_000; // sem mensagem do jogo por 1,5 min = parado
  const FIRME_MS = 3 * 60_000; // conectado por 3 min: a volta deu certo, zera a conta
  const MEXEU_MS = 30_000;
  const OUTRA_ABA_MS = 30_000;

  const naPaginaDoJogo = () => /^\/app\/?$/.test(location.pathname);
  const lerJ = (st, k, d) => { try { return JSON.parse(st.getItem(k) || 'null') ?? d; } catch { return d; } };
  const gravarJ = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  let cfg = { ligado: lerJ(localStorage, CHAVE, {}).ligado !== false };
  // sessionStorage: sobrevive ao recarregar desta aba, e cada aba tem a sua conta.
  let tent = lerJ(sessionStorage, CHAVE_TENT, { n: 0, ultimaEm: 0 });

  const carregouEm = Date.now();
  let caiuEm = null;
  let conectadoDesde = null;
  let mexeuEm = 0;
  let motivo = 'esperando o jogo';
  for (const t of ['pointerdown', 'keydown']) raiz.addEventListener(t, () => { mexeuEm = Date.now(); }, { capture: true, passive: true });

  // As outras abas do jogo neste Chrome.
  const euAba = Math.random().toString(36).slice(2);
  const outras = new Map(); // aba -> { conectado, em }
  let canal = null;
  try {
    canal = new BroadcastChannel('piloto:sessao');
    canal.onmessage = (ev) => { const d = ev.data; if (d && d.aba && d.aba !== euAba) outras.set(d.aba, { conectado: !!d.conectado, em: Date.now() }); };
  } catch { /* sem canal: segue sem saber das outras abas */ }
  const outraAbaJogando = () => [...outras.values()].some((o) => o.conectado && Date.now() - o.em < OUTRA_ABA_MS);

  function vivo() {
    const c = PIH.contagemDoJogo ? PIH.contagemDoJogo() : null;
    return !!c && c.conectado && Date.now() - (Number(c.ultimaEntrada) || 0) < SILENCIO_MS;
  }
  const ligadoNoPiloto = () => !!(PIH.cofre && PIH.cofre.ligado && PIH.cofre.ligado());
  const esperaMs = () => ESPERAS_MIN[Math.min(tent.n, ESPERAS_MIN.length - 1)] * 60_000;
  const min = (ms) => Math.max(1, Math.ceil(ms / 60_000));

  function tique() {
    if (!naPaginaDoJogo()) return;
    const n = Date.now();
    const v = vivo();
    try { canal && canal.postMessage({ aba: euAba, conectado: v }); } catch { /* canal fechado */ }
    if (v) {
      caiuEm = null;
      conectadoDesde ??= n;
      if (tent.n && n - conectadoDesde >= FIRME_MS) { tent = { n: 0, ultimaEm: 0 }; gravarJ(sessionStorage, CHAVE_TENT, tent); }
      motivo = 'conectado';
      return;
    }
    // Caiu logo depois de uma volta: essa volta não firmou (a conta das esperas continua subindo).
    conectadoDesde = null;
    caiuEm ??= Math.max(n, carregouEm);
    if (!cfg.ligado) { motivo = 'desligada'; return; }
    if (!ligadoNoPiloto()) { motivo = 'Piloto em Off'; return; }
    if (outraAbaJogando()) { caiuEm = n; motivo = 'outra aba deste Chrome está no jogo: espero ela fechar'; return; }
    const falta = caiuEm + esperaMs() - n;
    if (falta > 0) { motivo = `jogo parado: recarrego em ${min(falta)} min`; return; }
    if (n - mexeuEm < MEXEU_MS) { motivo = 'você está mexendo na página: recarrego quando parar'; return; }
    tent = { n: tent.n + 1, ultimaEm: n };
    gravarJ(sessionStorage, CHAVE_TENT, tent);
    PIH.cofre?.diario?.(`volta: o jogo ficou parado ${min(n - caiuEm)} min — recarregando a página (${tent.n}ª volta)`, 'aviso');
    motivo = 'recarregando';
    setTimeout(() => location.reload(), 1500);
  }
  setInterval(tique, 5000);
  // Aba que volta a ficar visível confere na hora (o Chrome espaça os relógios das abas escondidas).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tique(); });

  function status() {
    if (!cfg.ligado) return 'desligada';
    return K.esc(motivo) + (tent.n && motivo === 'conectado' ? ` · ${tent.n}ª volta, firmando` : '');
  }
  function linha(modo) {
    return K.linha({
      id: 'volta', icone: 'voltar', nome: 'Voltar sozinho se o jogo cair', alvo: 'volta:ligado', on: cfg.ligado, trava: modo === 'desligado', status: status(),
      dica: 'Se o jogo parar nesta aba (outra aba ou aparelho entrou na sua conta, o servidor reiniciou, a internet caiu), recarrega a página depois de 5 min parado para voltar ao farm. Só espera enquanto outra aba deste Chrome estiver no jogo ou enquanto você estiver clicando. Se outro aparelho tomar a conta de novo logo depois da volta, a espera seguinte dobra (até 30 min) — nunca desiste.',
    });
  }
  function definir(caminho, v) {
    if (caminho !== 'ligado') return;
    cfg.ligado = !!v;
    gravarJ(localStorage, CHAVE, cfg);
    if (cfg.ligado) { tent = { n: 0, ultimaEm: 0 }; gravarJ(sessionStorage, CHAVE_TENT, tent); }
    PIH.cofre?.diario?.(`volta: ${cfg.ligado ? 'ligada' : 'desligada'}`);
  }
  const resumo = () => ({ ligado: cfg.ligado, motivo, tentativas: tent.n, vivo: vivo() });

  PIH.volta = { linha, definir, status, resumo, _interno: { tique, outras, estado: () => ({ caiuEm, conectadoDesde, mexeuEm, tent: { ...tent } }), forcar: (o) => { if ('caiuEm' in o) caiuEm = o.caiuEm; if ('mexeuEm' in o) mexeuEm = o.mexeuEm; if ('tent' in o) { tent = o.tent; gravarJ(sessionStorage, CHAVE_TENT, tent); } } } };
})(globalThis);
