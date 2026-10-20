// Resultado de uma compra, a partir do que o servidor manda depois do market.comprar. O erro e
// o marketComprado não dizem a que anúncio se referem (Fase 0), então só uma compra fica
// enviada por vez e os eventos são ligados a ela pelo horário; as outras esperam na fila. O
// rastro guarda o que chegou depois do envio, para entender a compra que fica sem resposta.
// Funções puras.
(function (raiz, fabrica) {
  const m = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else raiz.RadarCompra = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRAZO_MS = 15000; // sem resposta depois disso (contado do envio ou da entrada no sorteio)

  const ROTULOS = Object.freeze({
    agendada: 'Agendada',
    enviada: 'Enviada',
    sorteio: 'No sorteio',
    ganhou: 'Comprado',
    confirmado: 'Comprado (confirmado no histórico)',
    perdeu: 'Perdeu o sorteio',
    'cedo-demais': 'Ainda retido (chegou cedo)',
    'preco-mudou': 'Preço mudou',
    'sem-saldo': 'Saldo insuficiente',
    'anuncio-proprio': 'Anúncio é seu',
    indisponivel: 'Anúncio saiu do mercado',
    erro: 'Erro do servidor',
    'sem-resposta': 'Sem resposta do servidor',
    cancelada: 'Cancelada',
    'nao-enviada': 'Não enviada',
  });

  function criar({ anuncioId, preco, qtd, enviarEm }) {
    return { anuncioId, preco, qtd, enviarEm, fase: 'agendada', resultado: null, msg: null, enviadoEm: null, sorteioEm: null, concluidoEm: null };
  }

  // Erro sem chave: o servidor manda texto cru (Fase 0). Classificação por palavra; o texto
  // original fica guardado no registro.
  function classificarMsg(msg) {
    const t = String(msg || '').toLowerCase();
    if (/pre[cç]o/.test(t)) return 'preco-mudou';
    if (/saldo|insuficiente|sem ouro|n[aã]o tem ouro/.test(t)) return 'sem-saldo';
    if (/(é|e) seu|pr[oó]prio/.test(t)) return 'anuncio-proprio';
    if (/outro jogador levou/.test(t)) return 'perdeu';
    if (/saiu|vendid|comprad|indispon|n[aã]o existe|n[aã]o est[aá] mais|esgot|encontrad/.test(t)) return 'indisponivel';
    return 'erro';
  }

  function classificarChave(chave) {
    if (chave === 'market.sorteio' || chave === 'market.sorteioEspera') return 'sorteio';
    if (chave === 'market.sorteioPerdeu') return 'perdeu';
    if (chave === 'market.retencao') return 'cedo-demais';
    if (chave === 'comercio.seuAnuncio') return 'anuncio-proprio';
    if (/anuncioSaiu|anuncioSumiu|favIndisponivel|favVendido/.test(chave)) return 'indisponivel';
    return 'erro';
  }

  function concluir(e, resultado, em, msg) {
    return { ...e, fase: 'concluida', resultado, concluidoEm: em ?? null, msg: msg ?? e.msg };
  }

  // evento: { tipo: 'enviado'|'falhaEnvio'|'erro'|'comprado'|'tempo'|'cancelar', em, chave, msg, motivo }
  function aplicar(e, ev) {
    if (!e || e.fase === 'concluida' || !ev) return e;
    const emAndamento = e.fase === 'enviada' || e.fase === 'sorteio';
    switch (ev.tipo) {
      case 'cancelar':
        return e.fase === 'agendada' ? concluir(e, 'cancelada', ev.em) : e;
      case 'falhaEnvio':
        return e.fase === 'agendada' ? concluir(e, 'nao-enviada', ev.em, ev.motivo) : e;
      case 'enviado':
        return e.fase === 'agendada' ? { ...e, fase: 'enviada', enviadoEm: ev.em } : e;
      case 'comprado':
        return emAndamento ? concluir(e, 'ganhou', ev.em, ev.descricao) : e;
      case 'erro': {
        if (!emAndamento) return e;
        const r = ev.chave ? classificarChave(ev.chave) : classificarMsg(ev.msg);
        if (r === 'sorteio') return e.fase === 'sorteio' ? e : { ...e, fase: 'sorteio', sorteioEm: ev.em };
        return concluir(e, r, ev.em, ev.chave ? ev.chave : ev.msg);
      }
      case 'tempo':
        return emAndamento && ev.em >= prazo(e) ? concluir(e, 'sem-resposta', ev.em) : e;
      default:
        return e;
    }
  }

  function prazo(e) {
    const base = e.sorteioEm ?? e.enviadoEm;
    return base === null || base === undefined ? Infinity : base + PRAZO_MS;
  }

  function rotulo(e) {
    return ROTULOS[e.fase === 'concluida' ? e.resultado : e.fase] || e.fase;
  }

  // "Sem resposta", mas a compra apareceu no histórico de compras do jogo.
  function confirmar(e, em) {
    if (!e || e.fase !== 'concluida' || e.resultado !== 'sem-resposta') return e;
    return { ...e, resultado: 'confirmado', confirmadoEm: em ?? null };
  }

  const comprou = (resultado) => resultado === 'ganhou' || resultado === 'confirmado';
  const emVoo = (e) => Boolean(e && (e.fase === 'enviada' || e.fase === 'sorteio'));
  // 1.5: só a ENVIADA sem resposta ainda segura a fila. A que já entrou no sorteio é identificada
  // pelo id do anúncio (mktSorteio), então várias disputas correm ao mesmo tempo.
  const aguardando = (e) => Boolean(e && e.fase === 'enviada');

  // ---- fila: várias agendadas, uma enviada por vez ---------------------------------------------

  // estados: os das compras abertas. A próxima a enviar é a agendada de menor enviarEm, e só
  // quando nenhuma está enviada ou no sorteio. Devolve { anuncioId, em } ou null.
  // Entre as que vencem quase juntas (1 s), sai antes a de maior prioridade (lucro ÷ disputa).
  const EMPATE_MS = 1000;
  function proximaDaFila(estados) {
    const lista = (estados || []).filter(Boolean);
    if (lista.some(aguardando)) return null;
    const agendadas = lista.filter((e) => e.fase === 'agendada').sort((a, b) => a.enviarEm - b.enviarEm);
    if (!agendadas.length) return null;
    const primeira = agendadas[0].enviarEm;
    const juntas = agendadas.filter((e) => e.enviarEm - primeira <= EMPATE_MS).sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0) || a.enviarEm - b.enviarEm);
    const e = juntas[0];
    return { anuncioId: e.anuncioId, em: Math.max(e.enviarEm, primeira) };
  }

  // Janela de silêncio: o servidor segura rajadas de ações por segundo, então nenhuma leitura
  // do radar sai com uma compra enviada ou a menos de `antesMs` do envio de uma agendada.
  const SILENCIO_ANTES_MS = 2000;
  function leituraPodeSair(estados, agora, antesMs = SILENCIO_ANTES_MS) {
    for (const e of estados || []) {
      if (aguardando(e)) return false;
      if (e && e.fase === 'agendada' && e.enviarEm - agora <= antesMs) return false;
    }
    return true;
  }

  // ---- rastro ----------------------------------------------------------------------------------

  // eventos: [{ em, t, chave?, msg?, ks? }] do que chegou do servidor (só o tipo e, no erro, a
  // chave) e [{ em, radar: 't' }] das leituras do radar. Texto curto para o registro e o CSV,
  // com o tempo relativo ao envio e as repetições seguidas juntadas: "+0,0 s erro
  // market.sorteio · +3,4 s batalha marketComprado · estado ×12".
  function resumirRastro(eventos, enviadoEm, max = 40) {
    const lista = (eventos || []).filter((x) => x && typeof x.em === 'number').sort((a, b) => a.em - b.em);
    const partes = [];
    let anterior = null;
    for (const x of lista) {
      const nome = x.radar ? `radar ${x.radar}` : [x.t, x.aba, x.chave || (x.msg ? `"${String(x.msg).slice(0, 60)}"` : ''), (x.ks || []).join(',')].filter(Boolean).join(' ');
      // Sem nada de especial (estado, batalha de combate): junta as repetições.
      const simples = !x.radar && !x.chave && !x.msg && !(x.ks && x.ks.length);
      if (simples && anterior && anterior.simples && anterior.nome === nome) { anterior.n += 1; continue; }
      const seg = typeof enviadoEm === 'number' ? (x.em - enviadoEm) / 1000 : null;
      anterior = { nome, simples, n: 1, quando: seg === null ? '' : `${seg >= 0 ? '+' : ''}${seg.toFixed(1).replace('.', ',')} s ` };
      partes.push(anterior);
      if (partes.length >= max) break;
    }
    if (!partes.length) return 'nada chegou do servidor';
    return partes.map((p) => `${p.quando}${p.nome}${p.n > 1 ? ` ×${p.n}` : ''}`).join(' · ');
  }

  // ---- o sorteio da liberação (0.8.0) ------------------------------------------------------------
  //
  // Com `sorteioUi: 1` no pedido (como o jogo manda desde a v1.300), o servidor conta a disputa pelo
  // evento mktSorteio: `entrou` (a janela abriu), `lista` (quem entrou, `quem`; quantos ao todo,
  // `total`, porque os nomes têm teto; e quem levou, `levaram: [{ nick, sobra }]`) e `fim` (o que
  // houve com o seu pedido). Os nomes ficam só na memória da aba; o registro guarda os números e um
  // código no lugar do nome de quem levou.
  const MAX_NOMES_SORTEIO = 40;

  function juntarSorteio(atual, ev) {
    const s = atual
      ? { ...atual, quem: [...atual.quem], levaram: [...atual.levaram] }
      : { quem: [], levaram: [], total: 0, liberouEm: null, fim: null };
    const tem = new Set(s.quem.map((n) => n.toLowerCase()));
    const juntar = (n) => {
      if (typeof n !== 'string' || !n) return;
      const k = n.toLowerCase();
      if (tem.has(k) || s.quem.length >= MAX_NOMES_SORTEIO) return;
      tem.add(k);
      s.quem.push(n);
    };
    for (const n of (ev && ev.quem) || []) juntar(n);
    for (const c of (ev && ev.levaram) || []) {
      if (!c || typeof c.nick !== 'string') continue;
      juntar(c.nick);
      const sobra = Number(c.sobra);
      if (!s.levaram.some((x) => x.nick.toLowerCase() === c.nick.toLowerCase() && x.sobra === sobra)) s.levaram.push({ nick: c.nick, sobra });
    }
    if (ev && Number(ev.total) > s.total) s.total = Number(ev.total);
    if (ev && typeof ev.liberouEm === 'number') s.liberouEm = ev.liberouEm;
    // O jogo lê `ok` e `perdeu` como verdade/mentira (sorteio-janela.mjs), não só true.
    if (ev && ev.fase === 'fim') s.fim = { ok: !!ev.ok, perdeu: !!ev.perdeu && !ev.ok, msg: typeof ev.msg === 'string' ? ev.msg : null };
    return s;
  }

  // Um código curto no lugar do nome (FNV-1a de 32 bits), para contar quem mais leva sem guardar nick.
  function codigoDoJogador(nick) {
    let h = 0x811c9dc5;
    for (const ch of String(nick || '').toLowerCase()) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `J${h.toString(16).padStart(8, '0').slice(0, 6).toUpperCase()}`;
  }

  // participantes: o maior entre o total e os nomes vistos; chance: 1 em N (o servidor sorteia o
  // instante de cada pedido entre 3 e 4 s, e o primeiro a chegar leva).
  function resumoDoSorteio(s) {
    if (!s) return null;
    const participantes = Math.max(s.total || 0, s.quem.length);
    const vencedores = [...new Set(s.levaram.map((c) => c.nick))];
    return {
      participantes, chance: participantes > 0 ? 1 / participantes : null, vencedores, codigos: vencedores.map(codigoDoJogador),
      ganhou: s.fim ? s.fim.ok : null, perdeu: s.fim ? s.fim.perdeu : null, quem: [...s.quem],
    };
  }

  // O que vai para o registro e o CSV: sem nome nenhum.
  const resumoParaGuardar = (r) => (r ? { participantes: r.participantes, chance: r.chance, ganhou: r.ganhou, perdeu: r.perdeu, codigos: r.codigos } : null);

  // Métricas dos sorteios do registro: quantos o radar disputou, quantos levou, quantos devia levar
  // pela chance (a soma das chances), a média de participantes e quem mais levou de você.
  function metricasDeSorteio(alertas) {
    const lista = (alertas || []).filter((a) => a && a.sorteio && a.sorteio.participantes > 0 && (a.sorteio.ganhou !== null || a.sorteio.perdeu !== null));
    const contagem = new Map();
    let ganhos = 0;
    let esperado = 0;
    let soma = 0;
    let maior = 0;
    for (const a of lista) {
      const s = a.sorteio;
      if (s.ganhou) ganhos += 1;
      esperado += s.chance || 0;
      soma += s.participantes;
      maior = Math.max(maior, s.participantes);
      if (!s.ganhou) for (const c of s.codigos || []) contagem.set(c, (contagem.get(c) || 0) + 1);
    }
    const vencedores = [...contagem].map(([codigo, vezes]) => ({ codigo, vezes })).sort((x, y) => y.vezes - x.vezes || x.codigo.localeCompare(y.codigo)).slice(0, 5);
    return { disputados: lista.length, ganhos, perdidos: lista.length - ganhos, esperado, mediaParticipantes: lista.length ? soma / lista.length : null, maiorDisputa: maior || null, vencedores };
  }

  return { PRAZO_MS, SILENCIO_ANTES_MS, ROTULOS, criar, aplicar, prazo, rotulo, confirmar, comprou, emVoo, aguardando, proximaDaFila, leituraPodeSair, resumirRastro, classificarMsg, classificarChave, juntarSorteio, codigoDoJogador, resumoDoSorteio, resumoParaGuardar, metricasDeSorteio };
});
