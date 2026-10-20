// Ritmo do radar: espera entre consultas, recuo quando o servidor reclama e motivos de pausa.
// Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarAgenda = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PISO_MS = 20000; // nunca consulta mais rápido que isso, nem com a variação
  const TETO_RECUO_MS = 10 * 60 * 1000;
  const SUCESSOS_PARA_ZERAR = 3;
  const FALHAS_PARA_PAUSAR = 5;
  // Depois da pausa, uma tentativa sozinha a cada 10 min (6 pedidos por hora: não pesa).
  const RETOMADA_MS = 10 * 60 * 1000;

  // Espera até a próxima consulta: intervalo × 2^recuo (até 10 min), com variação de ±20%.
  function proximaEspera(config, nivelRecuo = 0, aleatorio = Math.random) {
    const base = Math.min(TETO_RECUO_MS, Math.max(PISO_MS, config.intervaloS * 1000) * 2 ** Math.max(0, nivelRecuo));
    const variacao = typeof config.variacao === 'number' ? config.variacao : 0.2;
    const r = aleatorio();
    const espera = base * (1 + variacao * (2 * r - 1));
    return Math.round(Math.max(PISO_MS, espera));
  }

  function novoRecuo() {
    return { nivel: 0, sucessos: 0, falhas: 0, pausado: false };
  }

  // ok: a consulta teve resposta sem erro. mudo: ficou sem resposta com o jogo inteiro calado (o
  // servidor reiniciando numa atualização do jogo): só espaça as consultas, não conta para a pausa.
  // Devolve um estado novo.
  function registrar(estado, ok, { mudo = false } = {}) {
    const e = { ...estado };
    if (ok) {
      e.sucessos += 1;
      e.falhas = 0;
      if (e.sucessos >= SUCESSOS_PARA_ZERAR) e.nivel = 0;
    } else if (mudo) {
      e.sucessos = 0;
      e.nivel = Math.min(e.nivel + 1, 6);
    } else {
      e.sucessos = 0;
      e.falhas += 1;
      e.nivel = Math.min(e.nivel + 1, 6);
      if (e.falhas >= FALHAS_PARA_PAUSAR) e.pausado = true;
    }
    return e;
  }

  // A tentativa depois da pausa: se falhar de novo, pausa outra vez na hora; se der certo, zera.
  function retomar(estado) {
    return { ...estado, pausado: false, falhas: FALHAS_PARA_PAUSAR - 1 };
  }

  // O primeiro motivo que impede consultar agora, em texto para a tela; null se pode.
  function motivoDePausa(s) {
    if (!s.ligado) return 'Radar desligado';
    if (s.recuo && s.recuo.pausado) return s.retomaAs ? `Pausado depois de 5 falhas seguidas; tenta de novo às ${s.retomaAs}` : 'Pausado depois de 5 falhas seguidas';
    if (s.sessaoTomada) return 'Sessão tomada por outra aba (4001)';
    if (!s.socketAberto) return 'Sem conexão com o jogo';
    if (!s.temCatalogo) return 'Esperando o catálogo do jogo';
    if (s.mercadoAberto) return 'Mercado aberto na tela';
    if (s.config.pausarOculta && s.ocultaDesde !== null && s.agora - s.ocultaDesde > s.config.minutosOculta * 60000) {
      return `Aba oculta há mais de ${s.config.minutosOculta} min`;
    }
    return null;
  }

  return { PISO_MS, TETO_RECUO_MS, SUCESSOS_PARA_ZERAR, FALHAS_PARA_PAUSAR, RETOMADA_MS, proximaEspera, novoRecuo, registrar, retomar, motivoDePausa };
});
