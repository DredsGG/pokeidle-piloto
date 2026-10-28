// Radar do Mercado: service worker.
// - Selo no ícone: REC durante a gravação; número de avisos ainda não vistos e que ainda dá
//   para comprar (comprado, saído do mercado ou ignorado sai do número).
// - IndexedDB da extensão (fora do alcance da página do jogo): histórico de preços, registro
//   de avisos e compras e as vendas de pokémon com o IV de cada atributo (0.6.2), com
//   exportação em CSV.
// - Notificações do sistema; o clique leva para a aba do jogo.
'use strict';

// 1.31: um manifest só para todos os navegadores (regra 11 do hub). Chrome, Edge, Brave e Opera
// rodam este arquivo como service worker (as libs vêm por importScripts); o Firefox roda o mesmo
// arquivo como página de eventos (background.scripts, com as libs listadas antes dele). Nada aqui
// usa window nem DOM.
// No Firefox, o namespace browser.* devolve promise em todas as APIs: usa ele.
if (typeof browser !== 'undefined' && browser && browser.runtime && globalThis.chrome !== browser) { try { globalThis.chrome = browser; } catch { /* fica o chrome.* */ } }
if (typeof importScripts === 'function') importScripts('lib/estatistica.js', 'lib/historico.js', 'lib/csv.js', 'lib/compra.js', 'lib/lucro.js');
const NO_FIREFOX = typeof chrome.runtime.getBrowserInfo === 'function';

const H = self.RadarHistorico;
const Csv = self.RadarCsv;
const Compra = self.RadarCompra;
const Lucro = self.RadarLucro;

const PREFIXO = '[radar-mercado]';
const CHAVE_GRAVANDO = 'radar:gravando';
const CHAVE_NAO_VISTOS = 'radar:naoVistos';
const CHAVE_PODA = 'radar:ultimaPoda';
const CHAVE_NOTIFICACOES = 'radar:notificacoes';
const DB_NOME = 'radar-mercado';
const DB_VERSAO = 3; // 2: vendasPokemon (0.6.2); 3: minhasVendas e diariasPokemon (0.9.0)
const VENDAS_VALEM_MS = 45 * 24 * 3600000; // a Tabela de preços do jogo mostra 30 dias
const HORA_MS = 3600000;

function erro(e) { console.error(PREFIXO, e); }

// ---- IndexedDB -------------------------------------------------------------------------------

let banco = null;
function abrir() {
  if (banco) return banco;
  banco = new Promise((resolver, falhar) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('amostras')) db.createObjectStore('amostras', { keyPath: ['itemId', 'balde'] });
      if (!db.objectStoreNames.contains('alertas')) {
        const a = db.createObjectStore('alertas', { keyPath: 'chave', autoIncrement: true });
        a.createIndex('porAnuncio', 'anuncioId');
        a.createIndex('porEm', 'em');
      }
      if (!db.objectStoreNames.contains('vendasPokemon')) {
        const v = db.createObjectStore('vendasPokemon', { keyPath: 'chave' });
        v.createIndex('porEm', 'em');
      }
      // 0.9.0: as suas vendas (do seu histórico, sem quem comprou) e a diária dos seus anúncios de pokémon.
      if (!db.objectStoreNames.contains('minhasVendas')) {
        const v = db.createObjectStore('minhasVendas', { keyPath: 'id' });
        v.createIndex('porEm', 'em');
      }
      if (!db.objectStoreNames.contains('diariasPokemon')) db.createObjectStore('diariasPokemon', { keyPath: 'pokemonId' });
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => { banco = null; falhar(req.error); };
  });
  return banco;
}

const pedido = (req) => new Promise((resolver, falhar) => {
  req.onsuccess = () => resolver(req.result);
  req.onerror = () => falhar(req.error);
});

async function transacao(lojas, modo, fn) {
  const db = await abrir();
  return new Promise((resolver, falhar) => {
    const tx = db.transaction(lojas, modo);
    let resultado;
    Promise.resolve(fn(tx)).then((r) => { resultado = r; }, falhar);
    tx.oncomplete = () => resolver(resultado);
    tx.onerror = () => falhar(tx.error);
    tx.onabort = () => falhar(tx.error);
  });
}

async function gravarAmostras(amostras) {
  await transacao(['amostras'], 'readwrite', async (tx) => {
    const loja = tx.objectStore('amostras');
    for (const a of amostras) {
      const existente = await pedido(loja.get([a.itemId, a.balde]));
      loja.put(H.mesclarAmostra(existente, a));
    }
  });
  podarSePreciso().catch(erro);
}

// antesDe: só baldes anteriores a este (o radar exclui o balde da leitura atual).
async function resumoHistorico(itemIds, agora, antesDe) {
  const limite = typeof antesDe === 'number' ? antesDe : agora + H.BALDE_MS;
  return transacao(['amostras'], 'readonly', async (tx) => {
    const loja = tx.objectStore('amostras');
    const saida = {};
    for (const id of itemIds) {
      const faixa = IDBKeyRange.bound([id, agora - 7 * H.DIA_MS], [id, limite], false, true);
      saida[id] = H.resumir(await pedido(loja.getAll(faixa)), agora);
    }
    return saida;
  });
}

async function podarSePreciso() {
  const agora = Date.now();
  const s = await chrome.storage.session.get(CHAVE_PODA);
  if (s[CHAVE_PODA] && agora - s[CHAVE_PODA] < HORA_MS) return;
  await chrome.storage.session.set({ [CHAVE_PODA]: agora });
  await transacao(['amostras'], 'readwrite', (tx) => new Promise((resolver) => {
    const req = tx.objectStore('amostras').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolver(); return; }
      if (H.velha(cursor.value, agora)) cursor.delete();
      cursor.continue();
    };
  }));
}

// tipo 'aviso' (ou ausente, registros antigos) ou 'quase' (segurado por alguma regra: só
// registro, sem selo nem notificação).
const ehQuase = (a) => a && a.tipo === 'quase';

// Avisos não vistos: a lista dos anúncios (até a 0.3.6 era só um número, que vira lista vazia).
const listaNaoVistos = (v) => (Array.isArray(v) ? v : []);
let filaNaoVistos = Promise.resolve();
// Uma mudança por vez: aviso novo e aviso resolvido podem chegar juntos.
function mudarNaoVistos(fn) {
  filaNaoVistos = filaNaoVistos.then(async () => {
    const s = await chrome.storage.local.get(CHAVE_NAO_VISTOS);
    await chrome.storage.local.set({ [CHAVE_NAO_VISTOS]: fn(listaNaoVistos(s[CHAVE_NAO_VISTOS])) });
  }).catch(erro);
  return filaNaoVistos;
}

// 1.12.3: os "quase avisos" (só estatística) passam de 7 dias e saem; avisos e compras ficam.
// Sem isso o banco crescia para sempre e o lucro (que lê os 10 mil mais novos) perdia compras.
async function podarAlertas() {
  const limite = Date.now() - 7 * 24 * HORA_MS;
  return transacao(['alertas'], 'readwrite', (tx) => new Promise((resolver) => {
    let n = 0;
    const req = tx.objectStore('alertas').index('porEm').openCursor(IDBKeyRange.upperBound(limite));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) { resolver(n); return; }
      if (ehQuase(c.value)) { c.delete(); n++; }
      c.continue();
    };
    req.onerror = () => resolver(n);
  }));
}
let alertasDesdePoda = 0;

async function registrarAlerta(alerta) {
  if (++alertasDesdePoda >= 300) { alertasDesdePoda = 0; podarAlertas().catch(erro); }
  const chave = await transacao(['alertas'], 'readwrite', (tx) => pedido(tx.objectStore('alertas').add({ ...alerta })));
  if (!ehQuase(alerta)) await mudarNaoVistos((l) => (l.includes(alerta.anuncioId) ? l : [...l, alerta.anuncioId]));
  return chave;
}

// O aviso já não dá para comprar: sai do selo e a notificação dele some da central.
async function resolverAviso(anuncioId) {
  await mudarNaoVistos((l) => l.filter((id) => id !== anuncioId));
  const s = await chrome.storage.session.get(CHAVE_NOTIFICACOES);
  const mapa = s[CHAVE_NOTIFICACOES] || {};
  const ids = Object.keys(mapa).filter((id) => mapa[id].anuncioId === anuncioId);
  if (!ids.length) return;
  for (const id of ids) {
    await chrome.notifications.clear(id);
    delete mapa[id];
  }
  await chrome.storage.session.set({ [CHAVE_NOTIFICACOES]: mapa });
}

async function atualizarAlerta(chave, campos) {
  return transacao(['alertas'], 'readwrite', async (tx) => {
    const loja = tx.objectStore('alertas');
    const atual = await pedido(loja.get(chave));
    if (atual) loja.put({ ...atual, ...campos });
    return Boolean(atual);
  });
}

async function listarAlertas(limite = 200) {
  return transacao(['alertas'], 'readonly', (tx) => new Promise((resolver) => {
    const saida = [];
    const req = tx.objectStore('alertas').index('porEm').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || saida.length >= limite) { resolver(saida); return; }
      saida.push(cursor.value);
      cursor.continue();
    };
  }));
}

async function anunciosRecentes() {
  const desde = Date.now() - 24 * HORA_MS;
  const lista = (await listarAlertas(2000)).filter((a) => a.em >= desde);
  return {
    avisos: lista.filter((a) => !ehQuase(a)).map((a) => a.anuncioId),
    quase: lista.filter(ehQuase).map((a) => a.anuncioId),
  };
}

const MOTIVOS_CSV = {
  'desconto abaixo do mínimo': 'desconto abaixo do mínimo',
  'lucro abaixo do mínimo': 'lucro abaixo do mínimo',
  'item ilíquido': 'ilíquido',
  'referência pouco confiável': 'sem próximo na fila',
  'saldo não paga uma unidade': 'saldo insuficiente',
};

// Até a 0.3.4, "pouco confiável" valia também com menos de 6 h de histórico, mesmo com próximo
// na fila. Esses registros antigos dizem o motivo de verdade.
function motivoCsv(m, a) {
  if (m === 'referência pouco confiável' && typeof a.proximo === 'number') return 'pouco histórico (regra até a 0.3.4)';
  return MOTIVOS_CSV[m] || m;
}

const COLUNAS_CSV = [
  { titulo: 'Data', valor: (a) => a.em, tipo: 'data' },
  { titulo: 'Tipo', valor: (a) => (ehQuase(a) ? 'Quase aviso' : 'Aviso') },
  { titulo: 'Item', valor: (a) => a.nome },
  { titulo: 'Item id', valor: (a) => a.itemId },
  { titulo: 'Anúncio', valor: (a) => a.anuncioId },
  { titulo: 'Preço', valor: (a) => a.preco, tipo: 'numero' },
  { titulo: 'Qtd no anúncio', valor: (a) => a.qtdAnuncio, tipo: 'numero' },
  { titulo: 'Qtd pedida', valor: (a) => a.qtdPedida, tipo: 'numero' },
  { titulo: 'Referência de revenda', valor: (a) => a.referencia, tipo: 'numero' },
  { titulo: 'Fonte da referência', valor: (a) => (a.fontes || []).join(', ') },
  { titulo: 'Próximo da fila', valor: (a) => a.proximo, tipo: 'numero' },
  { titulo: 'Desconto %', valor: (a) => a.desconto, tipo: 'pct' },
  { titulo: 'Lucro por unidade', valor: (a) => a.lucroPorUnidade, tipo: 'numero' },
  { titulo: 'Lucro estimado', valor: (a) => a.lucroTotal, tipo: 'numero' },
  { titulo: 'Volume 7 dias', valor: (a) => a.volume7d, tipo: 'numero' },
  { titulo: 'Ilíquido', valor: (a) => a.iliquido, tipo: 'sim' },
  { titulo: 'Pouco confiável', valor: (a) => a.poucoConfiavel, tipo: 'sim' },
  { titulo: 'Por que não avisou', valor: (a) => (a.motivos || []).map((m) => motivoCsv(m, a)).join(', ') },
  { titulo: 'Resultado', valor: (a) => (ehQuase(a) ? 'não avisou' : a.resultado ? Compra.ROTULOS[a.resultado] || a.resultado : a.compradoNoJogo ? 'Comprado por você no jogo' : 'sem compra') },
  { titulo: 'Mensagem do servidor', valor: (a) => a.resultadoMsg || '' },
  { titulo: 'Automática', valor: (a) => (ehQuase(a) ? null : Boolean(a.automatica)), tipo: 'sim' },
  { titulo: 'Saiu do mercado em', valor: (a) => a.saiuEm, tipo: 'data' },
  { titulo: 'Durou (min)', valor: (a) => (typeof a.saiuEm === 'number' ? (a.saiuEm - a.em) / 60000 : null), tipo: 'numero' },
  { titulo: 'Enviado em', valor: (a) => a.enviadoEm, tipo: 'data' },
  { titulo: 'Concluído em', valor: (a) => a.concluidoEm, tipo: 'data' },
  // O que chegou do servidor depois do envio (só tipos e chaves) e as leituras do radar perto dele.
  { titulo: 'Rastro da compra', valor: (a) => a.rastro || '' },
  // Pokémon (Fase 4): os atributos e de quantas vendas parecidas veio o valor de mercado.
  { titulo: 'Categoria', valor: (a) => (a.categoria === 'pokemon' ? 'pokémon' : 'item') },
  { titulo: 'Pokémon', valor: (a) => (a.pokemon ? textoPokemonCsv(a.pokemon) : '') },
  { titulo: 'Moeda', valor: (a) => (a.moeda === 'orb' ? 'Gemas' : 'ouro') },
  { titulo: 'Faixa de nota', valor: (a) => (a.pokemon && a.pokemon.faixaNota) || '' },
  // 0.6.2: a nota de ataque (só o que bate: o lado de ataque da espécie e o SPD) e a das parecidas.
  { titulo: 'Nota de ataque', valor: (a) => (a.pokemon ? a.pokemon.notaAtaque : null), tipo: 'numero' },
  { titulo: 'Nota de ataque das parecidas', valor: (a) => (a.pokemon ? a.pokemon.ataqueParecidas : null), tipo: 'numero' },
  { titulo: 'IV útil', valor: (a) => (a.pokemon && a.pokemon.ivUtil) || '' },
  // 0.8.0: a disputa do sorteio da liberação. No lugar do nome de quem levou, um código.
  { titulo: 'Sorteio: participantes', valor: (a) => (a.sorteio ? a.sorteio.participantes : null), tipo: 'numero' },
  { titulo: 'Sorteio: sua chance %', valor: (a) => (a.sorteio ? a.sorteio.chance : null), tipo: 'pct' },
  { titulo: 'Sorteio: quem levou (código)', valor: (a) => (a.sorteio && !a.sorteio.ganhou ? (a.sorteio.codigos || []).join(' ') : '') },
];

function textoPokemonCsv(pk) {
  const base = pk.base ? `${pk.n} vendas de ${pk.base}` : `${pk.n} vendas parecidas${pk.min !== null && pk.min !== undefined ? ` (${pk.min} a ${pk.max})` : ''}`;
  return `${pk.resumo} · ${base}`;
}

// ---- vendas de pokémon (0.6.2) ----------------------------------------------------------------

// As vendas que o radar já lê da Tabela de preços, sem nick: a mesma venda (pokémon e hora) entra
// uma vez só. Ficam 45 dias.
async function guardarVendasPokemon(vendas) {
  const validas = (vendas || []).filter((v) => v && typeof v.chave === 'string' && typeof v.preco === 'number');
  if (!validas.length) return 0;
  await transacao(['vendasPokemon'], 'readwrite', (tx) => {
    const loja = tx.objectStore('vendasPokemon');
    for (const v of validas) loja.put(v);
  });
  if (Math.random() < 0.05) podarVendasPokemon().catch(erro);
  return validas.length;
}

async function podarVendasPokemon() {
  const limite = Date.now() - VENDAS_VALEM_MS;
  await transacao(['vendasPokemon'], 'readwrite', (tx) => new Promise((resolver) => {
    const req = tx.objectStore('vendasPokemon').index('porEm').openCursor(IDBKeyRange.upperBound(limite, true));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolver(); return; }
      cursor.delete();
      cursor.continue();
    };
  }));
}

const listarVendasPokemon = () => transacao(['vendasPokemon'], 'readonly', (tx) => pedido(tx.objectStore('vendasPokemon').index('porEm').getAll()));
const contarVendasPokemon = () => transacao(['vendasPokemon'], 'readonly', (tx) => pedido(tx.objectStore('vendasPokemon').count()));

const iv = (k) => (v) => (v.ivs ? v.ivs[k] : null);
const COLUNAS_VENDAS_CSV = [
  { titulo: 'Data da venda', valor: (v) => v.em, tipo: 'data' },
  { titulo: 'Espécie', valor: (v) => v.especie },
  { titulo: 'Espécie id', valor: (v) => v.speciesId },
  { titulo: 'Moeda', valor: (v) => (v.moeda === 'orb' ? 'Gemas' : 'ouro') },
  { titulo: 'Preço', valor: (v) => v.preco, tipo: 'numero' },
  { titulo: 'Nível', valor: (v) => v.nivel, tipo: 'numero' },
  { titulo: 'Nota', valor: (v) => v.nota, tipo: 'numero3' },
  { titulo: 'Nota de ataque', valor: (v) => v.notaAtaque, tipo: 'numero' },
  { titulo: 'IV útil', valor: (v) => v.ivUtil || '' },
  { titulo: 'Qualidade', valor: (v) => v.qualidade, tipo: 'numero3' },
  { titulo: 'Potência', valor: (v) => v.potencia, tipo: 'numero' },
  { titulo: 'Shiny', valor: (v) => v.shiny, tipo: 'sim' },
  { titulo: 'TM', valor: (v) => v.tm, tipo: 'sim' },
  { titulo: 'Refino', valor: (v) => v.refino, tipo: 'numero' },
  { titulo: 'IV total', valor: (v) => v.ivTotal, tipo: 'numero' },
  { titulo: 'IV HP', valor: iv('hp'), tipo: 'numero' },
  { titulo: 'IV ATK', valor: iv('atk'), tipo: 'numero' },
  { titulo: 'IV DEF', valor: iv('def'), tipo: 'numero' },
  { titulo: 'IV Sp.ATK', valor: iv('spAtk'), tipo: 'numero' },
  { titulo: 'IV Sp.DEF', valor: iv('spDef'), tipo: 'numero' },
  { titulo: 'IV SPD', valor: iv('speed'), tipo: 'numero' },
];

// ---- lucro realizado (0.9.0) -------------------------------------------------------------------

async function guardarMinhasVendas(vendas) {
  const validas = (vendas || []).filter((v) => v && (typeof v.id === 'number' || typeof v.id === 'string') && typeof v.liquido === 'number');
  if (!validas.length) return 0;
  await transacao(['minhasVendas'], 'readwrite', (tx) => {
    const loja = tx.objectStore('minhasVendas');
    for (const v of validas) loja.put({ id: v.id, em: v.em, tipo: v.tipo, nome: v.nome, qtd: v.qtd, bruto: v.bruto, liquido: v.liquido, moeda: v.moeda, pokemonId: v.pokemonId ?? null });
  });
  return validas.length;
}

async function guardarDiarias(diarias) {
  const validas = (diarias || []).filter((d) => d && Number.isFinite(Number(d.pokemonId)) && typeof d.diaria === 'number');
  if (!validas.length) return 0;
  await transacao(['diariasPokemon'], 'readwrite', (tx) => {
    const loja = tx.objectStore('diariasPokemon');
    for (const d of validas) loja.put({ pokemonId: Number(d.pokemonId), dias: d.dias, diaria: d.diaria });
  });
  return validas.length;
}

async function calcularLucro() {
  const [alertas, vendas, diarias] = await Promise.all([
    listarAlertas(10000),
    transacao(['minhasVendas'], 'readonly', (tx) => pedido(tx.objectStore('minhasVendas').getAll())),
    transacao(['diariasPokemon'], 'readonly', (tx) => pedido(tx.objectStore('diariasPokemon').getAll())),
  ]);
  const porId = Object.fromEntries((diarias || []).map((d) => [d.pokemonId, d.diaria]));
  return Lucro.lucroRealizado({ compras: Lucro.comprasDoRadar(alertas), vendas, diarias: porId, agora: Date.now() });
}

const COLUNAS_LUCRO_CSV = [
  { titulo: 'Vendido em', valor: (l) => l.vendaEm, tipo: 'data' },
  { titulo: 'Comprado em', valor: (l) => l.compraEm, tipo: 'data' },
  { titulo: 'Categoria', valor: (l) => (l.tipo === 'pokemon' ? 'pokémon' : 'item') },
  { titulo: 'O quê', valor: (l) => l.nome },
  { titulo: 'Qtd', valor: (l) => l.qtd, tipo: 'numero' },
  { titulo: 'Pagou', valor: (l) => l.custo, tipo: 'numero' },
  { titulo: 'Recebeu (já sem os 15%)', valor: (l) => l.liquido, tipo: 'numero' },
  { titulo: 'Diária', valor: (l) => l.diaria, tipo: 'numero' },
  { titulo: 'Lucro', valor: (l) => l.lucro, tipo: 'numero' },
  { titulo: 'Moeda', valor: (l) => (l.moeda === 'orb' ? 'Gemas' : 'ouro') },
  { titulo: 'Unidades de drop na mesma venda', valor: (l) => l.deDrop || null, tipo: 'numero' },
];

async function limparHistorico() {
  await transacao(['amostras'], 'readwrite', (tx) => pedido(tx.objectStore('amostras').clear()));
}

// ---- selo e notificações ----------------------------------------------------------------------

// 1.31: no Firefox, o usuário pode tirar a permissão do pokeidle.io (about:addons). Sem ela o Piloto
// não entra no jogo: o ícone fica com "!" e o clique nele pede a permissão de volta.
const ORIGENS = { origins: ['https://pokeidle.io/*'] };
let semPermissao = false;
let avisouPermissao = false;
async function conferirPermissao() {
  try { semPermissao = !(await chrome.permissions.contains(ORIGENS)); } catch { semPermissao = false; }
  if (semPermissao && !avisouPermissao) {
    avisouPermissao = true;
    try { await chrome.notifications.create('piloto-permissao', { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), title: 'PokeIdle Piloto sem acesso ao jogo', message: 'O navegador tirou a permissão do Piloto no pokeidle.io. Clique no ícone do Piloto para permitir de novo.' }); } catch (e) { erro(e); }
  }
  if (!semPermissao) avisouPermissao = false;
  await atualizarSelo();
  return !semPermissao;
}
try {
  chrome.permissions.onAdded.addListener(() => { conferirPermissao().catch(erro); });
  chrome.permissions.onRemoved.addListener(() => { conferirPermissao().catch(erro); });
} catch (e) { erro(e); }

async function atualizarSelo() {
  try {
    if (semPermissao) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
      await chrome.action.setTitle({ title: 'PokeIdle Piloto: sem permissão no pokeidle.io. Clique para permitir.' });
      return;
    }
    const s = await chrome.storage.local.get([CHAVE_GRAVANDO, CHAVE_NAO_VISTOS]);
    const gravando = s[CHAVE_GRAVANDO] === true;
    const naoVistos = listaNaoVistos(s[CHAVE_NAO_VISTOS]).length;
    if (gravando) {
      await chrome.action.setBadgeText({ text: 'REC' });
      await chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
    } else if (naoVistos > 0) {
      await chrome.action.setBadgeText({ text: naoVistos > 99 ? '99+' : String(naoVistos) });
      await chrome.action.setBadgeBackgroundColor({ color: '#9a6700' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
    await chrome.action.setTitle({ title: gravando ? 'Radar do Mercado: gravando' : naoVistos ? `Radar do Mercado: ${naoVistos} aviso(s)` : 'Radar do Mercado' });
  } catch (e) {
    erro(e);
  }
}

// O mapa notificação → aba fica pequeno: muda em fila (sem perder entrada) e cada uma sai ao
// clicar ou fechar; acima de 50, as mais antigas saem.
let filaMapa = Promise.resolve();
function mudarMapa(fn) {
  filaMapa = filaMapa.then(async () => {
    const s = await chrome.storage.session.get(CHAVE_NOTIFICACOES);
    const mapa = fn(s[CHAVE_NOTIFICACOES] || {});
    const chaves = Object.keys(mapa);
    for (const k of chaves.slice(0, Math.max(0, chaves.length - 50))) delete mapa[k];
    await chrome.storage.session.set({ [CHAVE_NOTIFICACOES]: mapa });
  }).catch(erro);
  return filaMapa;
}
chrome.notifications.onClosed.addListener((id) => { mudarMapa((m) => { delete m[id]; return m; }); });

async function notificar({ titulo, mensagem, anuncioId }, remetente) {
  const id = await chrome.notifications.create('', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: String(titulo).slice(0, 120),
    message: String(mensagem).slice(0, 300),
    priority: 2,
  });
  const aba = remetente && remetente.tab ? { tabId: remetente.tab.id, windowId: remetente.tab.windowId } : {};
  await mudarMapa((mapa) => { mapa[id] = { ...aba, anuncioId: anuncioId ?? null }; return mapa; });
  return id;
}

chrome.notifications.onClicked.addListener(async (id) => {
  try {
    const s = await chrome.storage.session.get(CHAVE_NOTIFICACOES);
    const alvo = (s[CHAVE_NOTIFICACOES] || {})[id];
    if (alvo && alvo.tabId !== undefined) {
      await chrome.tabs.update(alvo.tabId, { active: true });
      await chrome.windows.update(alvo.windowId, { focused: true });
    }
    await chrome.notifications.clear(id);
    mudarMapa((m) => { delete m[id]; return m; });
  } catch (e) {
    erro(e);
  }
});

// ---- mensagens ----------------------------------------------------------------------------------

// ---- atualização (1.25, o mesmo sistema do Midas) ----------------------------------------------
// - Procura versão nova nos Releases do GitHub (DredsGG/pokeidle-piloto): ao abrir o Chrome, a cada
//   6 h e no botão "Procurar atualização" do painel.
// - Instalada pela loja: "Atualizar" pede a versão nova ao Chrome e recarrega.
// - Instalada por pasta (modo desenvolvedor): o Chrome não deixa a extensão trocar os próprios
//   arquivos. "Atualizar" baixa o zip do Release; quando os arquivos novos chegam na pasta (zip
//   extraído por cima, ou gravados pela IA), a extensão percebe em até 1 min e se recarrega — sem ↻.
// - Depois de recarregar, as abas do jogo recarregam (o Piloto volta sozinho no modo em que estava).
const REPO = 'DredsGG/pokeidle-piloto';
const CHAVE_UPD = 'piloto:update';
const CHECAR_A_CADA_MIN = 30; // 1.34 (regra 14): a cada 30 min; a página também pede ao abrir e ao voltar para a aba
const versaoAtual = () => chrome.runtime.getManifest().version;
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
};
const tipoInstalacao = async () => { try { return (await chrome.management.getSelf()).installType; } catch { return 'development'; } };
async function gravarUpd(patch) {
  const { [CHAVE_UPD]: atual = {} } = await chrome.storage.local.get(CHAVE_UPD);
  const novo = { ...atual, ...patch };
  await chrome.storage.local.set({ [CHAVE_UPD]: novo });
  return novo;
}
async function checarUpd() {
  const cur = versaoAtual();
  const instalacao = await tipoInstalacao();
  // Firefox instalado pelo .xpi assinado atualiza sozinho pelo update_url: lá o aviso solto não aparece
  const base = { checadoEm: Date.now(), atual: cur, instalacao, autoAtualiza: NO_FIREFOX && instalacao === 'normal' };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const ultima = String(j.tag_name || '').replace(/^v/i, '');
    const assets = j.assets || [];
    const link = (re) => assets.find((a) => re.test(a.name))?.browser_download_url || null;
    // o mesmo zip serve para todos; no Firefox, o .xpi assinado pela Mozilla (instala com um clique)
    const zip = link(/\.zip$/i);
    const xpi = NO_FIREFOX ? link(/\.xpi$/i) : null;
    const disponivel = !!ultima && cmpVer(ultima, cur) > 0;
    const titulo = String(j.name || '').slice(0, 120);
    return gravarUpd({ ...base, titulo, urgente: /URGENTE/i.test(titulo), ultima, notas: String(j.body || '').slice(0, 4000), pagina: j.html_url || null, zip, xpi, disponivel, mudancas: disponivel ? await mudancasAte(ultima, cur) : null, erro: null });
  } catch (e) {
    return gravarUpd({ ...base, erro: String(e && e.message || e) });
  }
}
// 1.32.2 (regra 14): o que mudou, nos três idiomas, vem do changelog.json da tag do Release (o mesmo
// texto do quadro de Novidades). Junta as versões entre a instalada e a nova, da mais nova para trás.
// Release antigo sem o arquivo: null (o quadro usa as notas do Release).
async function mudancasAte(ultima, cur) {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/v${encodeURIComponent(ultima)}/extension/changelog.json`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const versoes = Object.keys(j && j.versoes || {}).filter((v) => cmpVer(v, cur) > 0 && cmpVer(v, ultima) <= 0).sort((a, b) => cmpVer(b, a));
    if (!versoes.length) return null;
    const out = {};
    for (const idi of ['pt', 'en', 'es']) out[idi] = versoes.flatMap((v) => (Array.isArray(j.versoes[v][idi]) ? j.versoes[v][idi] : [])).map((x) => String(x).slice(0, 300)).slice(0, 8);
    return out;
  } catch { return null; }
}
async function aplicarUpd() {
  const st = (await chrome.storage.local.get(CHAVE_UPD))[CHAVE_UPD] || {};
  if (NO_FIREFOX) {
    // assinado (instalado pelo .xpi): o Firefox atualiza sozinho pelo update_url; o botão abre o .xpi
    // novo e o Firefox pergunta se quer instalar. Temporário (about:debugging): baixa o zip novo.
    const temp = await tipoInstalacao() !== 'normal';
    const url = (!temp && st.xpi) || st.zip || st.pagina || `https://github.com/${REPO}/releases/latest`;
    await chrome.tabs.create({ url, active: !temp });
    await gravarUpd({ baixadoEm: Date.now() });
    return { modo: temp ? 'firefox-temporario' : 'firefox', status: 'baixado' };
  }
  if (await tipoInstalacao() === 'normal' && typeof chrome.runtime.requestUpdateCheck === 'function') {
    const res = await new Promise((ok) => chrome.runtime.requestUpdateCheck((status) => ok({ status })));
    if (res.status === 'update_available') { setTimeout(() => chrome.runtime.reload(), 1500); return { modo: 'loja', status: 'aplicando' }; }
    return { modo: 'loja', status: res.status };
  }
  const url = st.zip || st.pagina || `https://github.com/${REPO}/releases/latest`;
  await chrome.tabs.create({ url, active: false });
  await gravarUpd({ baixadoEm: Date.now() });
  return { modo: 'download', status: 'baixado' };
}
// por pasta: arquivos novos na pasta → recarrega sozinho (o manifest é gravado por último; espera
// 15 s para o zip terminar de ser extraído)
let recargaPendente = null;
async function vigiarDisco() {
  if (NO_FIREFOX || await tipoInstalacao() !== 'development') return;
  try {
    const r = await fetch(chrome.runtime.getURL('manifest.json') + '?t=' + Date.now(), { cache: 'no-store' });
    const noDisco = (await r.json()).version;
    if (noDisco && noDisco !== versaoAtual() && recargaPendente !== noDisco) { recargaPendente = noDisco; setTimeout(() => chrome.runtime.reload(), 15000); }
  } catch { /* manifest no meio da gravação: tenta no próximo minuto */ }
}
function agendarUpd() {
  chrome.alarms.create('piloto-upd', { delayInMinutes: 1, periodInMinutes: CHECAR_A_CADA_MIN });
  chrome.alarms.create('piloto-disco', { delayInMinutes: 1, periodInMinutes: 1 });
}
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'piloto-upd') checarUpd().catch(erro);
  if (a.name === 'piloto-disco') vigiarDisco().catch(erro);
});
chrome.runtime.onStartup.addListener(() => { agendarUpd(); checarUpd().catch(erro); });
chrome.runtime.onInstalled.addListener(async (d) => {
  agendarUpd();
  if (d.reason === 'update') {
    await gravarUpd({ acabouDe: { de: d.previousVersion || null, para: versaoAtual(), em: Date.now() }, disponivel: false, atual: versaoAtual() });
    // as abas do jogo ainda rodam a versão antiga: recarregar põe a nova
    try { for (const t of await chrome.tabs.query({ url: 'https://pokeidle.io/app*' })) chrome.tabs.reload(t.id); } catch (e) { erro(e); }
  }
  checarUpd().catch(erro);
});

const ACOES = {
  'historico:gravar': (m) => gravarAmostras(m.amostras || []),
  'historico:resumo': (m) => resumoHistorico(m.itemIds || [], m.agora || Date.now(), m.antesDe),
  'historico:limpar': () => limparHistorico(),
  'alerta:registrar': (m) => registrarAlerta(m.alerta),
  'alerta:atualizar': (m) => atualizarAlerta(m.chave, m.campos || {}),
  'alertas:listar': (m) => listarAlertas(m.limite),
  'alertas:recentes': () => anunciosRecentes(),
  'alertas:csv': async () => Csv.paraCsv(await listarAlertas(10000), COLUNAS_CSV),
  'sorteios:metricas': async () => Compra.metricasDeSorteio(await listarAlertas(10000)),
  'minhasVendas:guardar': (m) => guardarMinhasVendas(m.vendas),
  'diarias:guardar': (m) => guardarDiarias(m.diarias),
  'lucro:resumo': async () => {
    const r = await calcularLucro();
    return { totais: r.totais, linhas: r.linhas.slice(0, 60), estoque: r.estoque.slice(0, 40), nLinhas: r.linhas.length, nEstoque: r.estoque.length };
  },
  'lucro:csv': async () => Csv.paraCsv((await calcularLucro()).linhas, COLUNAS_LUCRO_CSV),
  'vendasPokemon:guardar': (m) => guardarVendasPokemon(m.vendas),
  'vendasPokemon:contar': () => contarVendasPokemon(),
  'vendasPokemon:csv': async () => Csv.paraCsv(await listarVendasPokemon(), COLUNAS_VENDAS_CSV),
  'avisos:vistos': () => mudarNaoVistos(() => []),
  'aviso:resolvido': (m) => resolverAviso(m.anuncioId),
  notificar: (m, remetente) => notificar(m, remetente),
  // Voto no TopIdle (1.9): uma aba de fundo, fechada quando o jogo confirma ou em 30 s.
  'voto:abrir': async (m) => {
    const u = new URL(m.url);
    if (u.protocol !== 'https:' || !(u.hostname === 'topidle.com' || u.hostname.endsWith('.topidle.com'))) return null;
    // Uma aba só: no máximo uma abertura por minuto, e a anterior (se ficou aberta) fecha antes.
    const { 'voto:aba': velha, 'voto:em': em } = await chrome.storage.session.get(['voto:aba', 'voto:em']);
    if (Date.now() - (Number(em) || 0) < 60_000) return null;
    if (typeof velha === 'number') await chrome.tabs.remove(velha).catch(() => {});
    const aba = await chrome.tabs.create({ url: u.href, active: false });
    await chrome.storage.session.set({ 'voto:aba': aba.id, 'voto:em': Date.now() });
    // Rede de segurança: fecha sozinha em 45 s mesmo se a aba do jogo recarregar no meio.
    setTimeout(async () => {
      const { 'voto:aba': id } = await chrome.storage.session.get('voto:aba');
      if (id === aba.id) { await chrome.storage.session.remove('voto:aba'); await chrome.tabs.remove(id).catch(() => {}); }
    }, 45_000);
    return aba.id;
  },
  // 1.29: as salas da Plateia, uma vez por sessão do Chrome (janela à parte, sem roubar o foco).
  // Se a janela aberta antes ainda existe, não abre outra.
  // 1.32.2 (o André: "toda vez que o jogo ou a extensão reinicia, abre mais duas abas da Plateia"):
  // o id da janela de cada sala fica no storage.LOCAL (o session apaga quando a extensão recarrega) e
  // só abre a sala que estiver faltando. Depois de reiniciar o navegador o id muda: aí adota a janela
  // popup da sala que o navegador restaurou (o tamanho 1440×900 com que o Piloto abre). Um pedido de
  // cada vez (duas abas do jogo não abrem a mesma sala duas vezes).
  'plateia:abrir': (m) => (filaPlateia = filaPlateia.then(() => abrirSalasPlateia(m)).catch((e) => { erro(e); return []; })),
  // 1.34: a página pede ao abrir e ao voltar para a aba (minMs: no máximo uma vez a cada 10 min);
  // o botão "Procurar atualização" pede sem minMs (na hora)
  'upd:checar': async (m) => {
    const minMs = Number(m && m.minMs) || 0;
    if (minMs > 0) {
      const { [CHAVE_UPD]: atual = {} } = await chrome.storage.local.get(CHAVE_UPD);
      if (Date.now() - (Number(atual.checadoEm) || 0) < minMs) return atual;
    }
    return checarUpd();
  },
  'upd:aplicar': () => aplicarUpd(),
  'upd:dispensar': async (m) => gravarUpd({ ...(m.limparAviso ? { acabouDe: null } : { dispensada: typeof m.versao === 'string' ? m.versao.slice(0, 20) : null }) }),
  'voto:fechar': async () => {
    const { 'voto:aba': id } = await chrome.storage.session.get('voto:aba');
    if (typeof id !== 'number') return null;
    await chrome.storage.session.remove('voto:aba');
    await chrome.tabs.remove(id).catch(() => {});
    return id;
  },
};


// ---- 1.32.2: as salas da Plateia, sem repetir -------------------------------------------------
let filaPlateia = Promise.resolve();
const SALAS_PLATEIA = { twitch: 'https://www.twitch.tv/drops/inventory#plateia', kick: 'https://kick.com/drops/claimed#plateia' };
const janelaViva = async (id) => {
  if (typeof id !== 'number') return false;
  try { const w = await chrome.windows.get(id, { populate: true }); return !!w && (!Array.isArray(w.tabs) || w.tabs.length > 0); } catch { return false; }
};
async function abrirSalasPlateia(m) {
  const pedidas = (Array.isArray(m && m.plataformas) ? m.plataformas : []).filter((p) => SALAS_PLATEIA[p]);
  const chaves = pedidas.map((p) => `plateia:janela:${p}`);
  const guardadas = chaves.length ? await chrome.storage.local.get(chaves) : {};
  const vivas = new Set();
  const faltam = [];
  for (const p of pedidas) {
    const id = guardadas[`plateia:janela:${p}`];
    if (await janelaViva(id)) vivas.add(id); else faltam.push(p);
  }
  if (!faltam.length) return [];
  // depois de reiniciar o navegador ou de atualizar a extensão: as janelas que já estão abertas têm id
  // que o Piloto não conhece — adota as janelas popup de uma aba só (é assim que a sala abre).
  // 1.32.2 (o André, depois da atualização: "abriu outras duas abas"): não exige mais o tamanho
  // 1440×900 — com a escala do Windows (125%) a janela é encolhida para caber na tela e o tamanho muda.
  // As mais parecidas com a sala vêm primeiro; janela com o jogo nunca é adotada.
  let soltas = [];
  try {
    soltas = (await chrome.windows.getAll({ windowTypes: ['popup'], populate: true }))
      .filter((w) => !vivas.has(w.id) && Array.isArray(w.tabs) && w.tabs.length === 1 && !/^https:\/\/pokeidle\.io\//.test(w.tabs[0].url || w.tabs[0].pendingUrl || ''))
      .sort((a, b) => (Math.abs((a.width || 0) - 1440) + Math.abs((a.height || 0) - 900)) - (Math.abs((b.width || 0) - 1440) + Math.abs((b.height || 0) - 900)));
  } catch { soltas = []; }
  const abertas = [];
  for (const p of faltam) {
    const chave = `plateia:janela:${p}`;
    const adotar = soltas.shift();
    if (adotar) { await chrome.storage.local.set({ [chave]: adotar.id }); continue; }
    const w = await chrome.windows.create({ url: SALAS_PLATEIA[p], type: 'popup', focused: false, width: 1440, height: 900 })
      .catch(() => chrome.windows.create({ url: SALAS_PLATEIA[p], type: 'popup', width: 1440, height: 900 })).catch(() => null); // sem 'focused' se o navegador recusar
    if (w && typeof w.id === 'number') { await chrome.storage.local.set({ [chave]: w.id }); abertas.push(p); }
  }
  return abertas;
}

chrome.runtime.onMessage.addListener((m, remetente, responder) => {
  const acao = m && ACOES[m.tipo];
  if (!acao || remetente.id !== chrome.runtime.id) return false;
  Promise.resolve()
    .then(() => acao(m, remetente))
    .then((dados) => responder({ dados: dados === undefined ? null : dados }))
    .catch((e) => { erro(e); responder({ erro: String(e && e.message ? e.message : e) }); });
  return true;
});

chrome.runtime.onInstalled.addListener(() => { conferirPermissao().catch(erro); });
chrome.runtime.onStartup.addListener(() => { conferirPermissao().catch(erro); });
// 1.31 (regra 12): instalação nova mostra o guia de primeiro uso; atualização mostra só as novidades.
chrome.runtime.onInstalled.addListener(async (d) => {
  try {
    const { 'piloto:guia': g } = await chrome.storage.local.get('piloto:guia');
    if (d.reason === 'install') await chrome.storage.local.set({ 'piloto:guia': { tutorial: false, novidades: versaoAtual() } });
    else if (d.reason === 'update' && !g) await chrome.storage.local.set({ 'piloto:guia': { tutorial: true, novidades: d.previousVersion || null } });
  } catch (e) { erro(e); }
});
chrome.runtime.onStartup.addListener(() => { podarAlertas().catch(erro); });
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === 'local' && (mudancas[CHAVE_GRAVANDO] || mudancas[CHAVE_NAO_VISTOS])) atualizarSelo();
});

// O ícone da extensão não tem menu: tudo fica no painel dentro do jogo. Clicar nele leva para a
// aba do jogo (ou abre uma, se não houver).
chrome.action.onClicked.addListener(async () => {
  // pede a permissão do site no próprio clique (o Firefox só aceita o pedido vindo de um gesto);
  // se ela já existe, não aparece nada
  const pedido = chrome.permissions.request(ORIGENS).catch(() => false);
  try {
    await pedido;
    await conferirPermissao();
    const [aba] = await chrome.tabs.query({ url: 'https://pokeidle.io/*' });
    if (aba) {
      await chrome.tabs.update(aba.id, { active: true });
      await chrome.windows.update(aba.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: 'https://pokeidle.io/app' });
    }
  } catch (e) {
    erro(e);
  }
});
