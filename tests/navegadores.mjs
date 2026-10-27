// 1.31: o sw.js roda como service worker (Chrome, Edge, Brave, Opera) e como página de eventos
// (Firefox, background.scripts). Carrega o sw.js num contexto falso de cada jeito e confere:
// - sobe sem importScripts (Firefox) e sem erro;
// - a atualização escolhe o arquivo certo do Release: zip do Chromium, zip do Firefox ou .xpi;
// - o "Atualizar" no Firefox abre o .xpi (assinado) ou o zip (temporário), nunca chama
//   runtime.requestUpdateCheck, que o Firefox não tem;
// - o manifest do Firefox gerado pelo build tem background.scripts com as libs antes do sw.js.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);

const EXT = process.argv[2] || path.resolve(AQUI, '../extension');
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };

const RELEASE = {
  tag_name: 'v9.9.9', body: 'notas', html_url: 'https://github.com/DredsGG/pokeidle-piloto/releases/tag/v9.9.9',
  assets: [
    { name: 'pokeidle-piloto-v9.9.9.zip', browser_download_url: 'https://x/chromium.zip' },
    { name: 'pokeidle-piloto-v9.9.9.xpi', browser_download_url: 'https://x/assinado.xpi' },
  ],
};

function montar({ firefox, instalacao, permitido = true }) {
  const store = { local: {}, session: {} };
  const area = (k) => ({
    get: async (q) => { if (q == null) return { ...store[k] }; const ks = typeof q === 'string' ? [q] : Array.isArray(q) ? q : Object.keys(q); const o = {}; for (const x of ks) if (x in store[k]) o[x] = store[k][x]; return o; },
    set: async (o) => { Object.assign(store[k], o); },
    remove: async (q) => { for (const x of [].concat(q)) delete store[k][x]; },
  });
  const ouvintes = {};
  const evento = (nome) => ({ addListener: (f) => { (ouvintes[nome] = ouvintes[nome] || []).push(f); } });
  const abertas = [];
  const chamadas = [];
  const runtime = {
    id: 'x', getManifest: () => ({ version: '1.31.0' }), getURL: (p) => `ext://${p}`,
    onStartup: evento('onStartup'), onInstalled: evento('onInstalled'), onMessage: evento('onMessage'),
    reload: () => chamadas.push('reload'),
  };
  if (firefox) runtime.getBrowserInfo = async () => ({ name: 'Firefox', version: '158.0' });
  else runtime.requestUpdateCheck = (cb) => { chamadas.push('requestUpdateCheck'); cb('no_update'); };
  const chrome = {
    runtime,
    storage: { local: area('local'), session: area('session'), onChanged: evento('storage') },
    alarms: { create: () => {}, onAlarm: evento('alarm') },
    notifications: { create: async () => 'n', clear: async () => {}, onClicked: evento('nc'), onClosed: evento('ncl') },
    tabs: { create: async (o) => { abertas.push(o.url); return { id: 1 }; }, query: async () => [], update: async () => {}, reload: () => {}, remove: async () => {} },
    windows: { create: async () => ({ id: 1 }), get: async () => ({}), update: async () => {} },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: () => {}, onClicked: evento('action') },
    management: { getSelf: async () => ({ installType: instalacao }) },
    permissions: { contains: async () => estadoPerm.ok, request: async () => { chamadas.push('permissions.request'); estadoPerm.ok = true; return true; }, onAdded: evento('pAdd'), onRemoved: evento('pRem') },
  };
  const estadoPerm = { ok: permitido };
  const selo = { texto: '' };
  chrome.action.setBadgeText = async (o) => { selo.texto = o.text; };
  chrome.notifications.create = async (id, o) => { chamadas.push('notificar:' + (o && o.title)); return id; };
  const fakeIdb = { open: () => { const r = {}; setTimeout(() => r.onerror && r.onerror(new Error('sem idb no teste')), 0); return r; } };
  const ctx = {
    chrome, console: { ...console, error: () => {}, warn: () => {} }, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (u) => ({ ok: true, status: 200, json: async () => (String(u).includes('api.github.com') ? RELEASE : { version: '1.31.0' }) }),
    indexedDB: fakeIdb, IDBKeyRange: { bound: () => ({}), lowerBound: () => ({}), upperBound: () => ({}) }, URL, Blob: class {}, TextEncoder,
  };
  ctx.self = ctx; ctx.globalThis = ctx;
  if (firefox) ctx.browser = chrome; // o Firefox tem browser.* (com promise); o shim aponta o chrome para ele
  if (!firefox) ctx.importScripts = (...arqs) => { for (const a of arqs) vm.runInContext(fs.readFileSync(path.join(EXT, 'src', a), 'utf8'), ctx, { filename: a }); };
  vm.createContext(ctx);
  return { ctx, ouvintes, abertas, chamadas, store, selo, estadoPerm };
}

async function rodar(caso) {
  const m = montar(caso);
  try {
    if (caso.firefox) {
      // Firefox: as libs vêm antes do sw.js em background.scripts
      const man = JSON.parse(fs.readFileSync(caso.manifestFirefox || path.join(EXT, 'manifest.json'), 'utf8'));
      for (const s of man.background.scripts) vm.runInContext(fs.readFileSync(path.join(EXT, s), 'utf8'), m.ctx, { filename: s });
    } else {
      vm.runInContext(fs.readFileSync(path.join(EXT, 'src/sw.js'), 'utf8'), m.ctx, { filename: 'sw.js' });
    }
  } catch (e) { return { ...m, erro: String(e && e.stack || e) }; }
  // procura e aplica a atualização pelo mesmo caminho do painel
  const msg = (acao) => new Promise((res) => {
    let respondeu = false;
    for (const f of m.ouvintes.onMessage || []) {
      const volta = f({ tipo: acao, t: acao, acao }, { tab: { id: 1 } }, (r) => { respondeu = true; res(r); });
      if (volta === true) return;
    }
    setTimeout(() => { if (!respondeu) res(null); }, 50);
  });
  await new Promise((r) => setTimeout(r, 30));
  return { ...m, msg };
}

const manFF = path.join(EXT, 'manifest.json');
const man = JSON.parse(fs.readFileSync(manFF, 'utf8'));
ok(man.background.service_worker === 'src/sw.js' && Array.isArray(man.background.scripts) && man.background.scripts.at(-1) === 'src/sw.js', `um manifest só: service_worker e scripts com o mesmo sw.js (${man.background.scripts.join(', ')})`);
const g = man.browser_specific_settings?.gecko || {};
ok(g.id === 'pokeidle-piloto@dredsgg' && g.strict_min_version === '140.0', `gecko: id ${g.id}, Firefox ${g.strict_min_version}+`);
ok(JSON.stringify(g.data_collection_permissions) === '{"required":["none"]}', 'gecko: não coleta dados');
ok(g.update_url === 'https://raw.githubusercontent.com/DredsGG/pokeidle-piloto/main/firefox/updates.json', 'gecko: update_url do updates.json do repo');
ok(Number(man.minimum_chrome_version) >= 121, `Chrome ${man.minimum_chrome_version}+ (ignora background.scripts)`);
const sw = fs.readFileSync(path.join(EXT, 'src/sw.js'), 'utf8');
ok(!/\b(window|document)\./.test(sw.replace(/\/\/.*$/gm, '')), 'o fundo não usa window nem document');
// o sw.js expõe as funções de atualização? procura pelo texto das ações no onMessage
const casos = [
  { nome: 'Chrome por pasta', firefox: false, instalacao: 'development', esperaZip: 'https://x/chromium.zip', esperaAbre: 'https://x/chromium.zip' },
  { nome: 'Firefox assinado (.xpi)', firefox: true, instalacao: 'normal', esperaZip: 'https://x/chromium.zip', esperaAbre: 'https://x/assinado.xpi' },
  { nome: 'Firefox temporário', firefox: true, instalacao: 'temporary', esperaZip: 'https://x/chromium.zip', esperaAbre: 'https://x/chromium.zip' },
];
for (const c of casos) {
  const r = await rodar({ ...c, manifestFirefox: manFF });
  ok(!r.erro, `${c.nome}: o sw.js sobe ${r.erro ? `(${r.erro.split('\n')[0]})` : ''}`);
  if (r.erro) continue;
  const checar = r.ctx.eval ? null : null;
  // as funções são de topo no script: ficam no contexto
  const st = await vm.runInContext('checarUpd()', r.ctx);
  ok(st && st.zip === c.esperaZip, `${c.nome}: escolhe o zip certo (${st && st.zip})`);
  ok(c.firefox ? st.xpi === 'https://x/assinado.xpi' : st.xpi === null, `${c.nome}: .xpi só no Firefox (${st && st.xpi})`);
  const ap = await vm.runInContext('aplicarUpd()', r.ctx);
  ok(r.abertas.at(-1) === c.esperaAbre, `${c.nome}: Atualizar abre ${r.abertas.at(-1)} (${JSON.stringify(ap)})`);
  ok(!r.chamadas.includes('requestUpdateCheck') || !c.firefox, `${c.nome}: não chama requestUpdateCheck no Firefox`);
}
// Firefox sem a permissão do site: selo "!", aviso, e o clique no ícone pede a permissão de volta
{
  const r = await rodar({ firefox: true, instalacao: 'normal', permitido: false });
  if (r.erro) console.log("ERRO", r.erro.slice(0, 400));
  await vm.runInContext('conferirPermissao()', r.ctx);
  ok(r.selo.texto === '!', `sem permissão: selo "!" no ícone (${r.selo.texto})`);
  ok(r.chamadas.some((c) => /^notificar:.*sem acesso/.test(c)), 'sem permissão: notificação avisando');
  for (const f of r.ouvintes.action || []) await f();
  ok(r.chamadas.includes('permissions.request') && r.estadoPerm.ok, 'clique no ícone pede a permissão');
  ok(r.selo.texto !== '!', `com a permissão de volta, o "!" sai (${JSON.stringify(r.selo.texto)})`);
}
// instalação nova marca o guia; atualização marca só as novidades
{
  const r = await rodar({ firefox: false, instalacao: 'development' });
  for (const f of r.ouvintes.onInstalled || []) await f({ reason: 'install' });
  await new Promise((x) => setTimeout(x, 30));
  ok(r.store.local['piloto:guia'] && r.store.local['piloto:guia'].tutorial === false, `instalação nova: guia a mostrar (${JSON.stringify(r.store.local['piloto:guia'])})`);
  const r2 = await rodar({ firefox: false, instalacao: 'development' });
  for (const f of r2.ouvintes.onInstalled || []) await f({ reason: 'update', previousVersion: '1.29.1' });
  await new Promise((x) => setTimeout(x, 30));
  ok(r2.store.local['piloto:guia'] && r2.store.local['piloto:guia'].tutorial === true && r2.store.local['piloto:guia'].novidades === '1.29.1', `atualização: só as novidades (${JSON.stringify(r2.store.local['piloto:guia'])})`);
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
process.exit(falhas ? 1 : 0);
