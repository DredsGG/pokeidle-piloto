import path from 'node:path';
// 1.30: dias no TEMPO da Sessão do jogo. A extensão de verdade num Chromium, numa página que imita
// a prancheta "Sessão" do pokeidle.io (mesmo HTML e CSS do vão do TEMPO do jogo 1.374.0).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const { chromium } = require('playwright');

const EXT = path.resolve(AQUI, '../extension');
const SAIDA = path.resolve(AQUI, 'telas-sessao');
fs.mkdirSync(SAIDA, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RELOGIO = '<svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PAGINA = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><style>
:root{--vao:#1c1520;--mad-linha:#4a3040;--mad-luz2:#7a4a52;--rx-rosa:#c58fd8;--rx-esc:#1a0f18;--verde:#49d36b}
body{margin:0;background:#2a1a1e;font:600 13px/1.3 system-ui,sans-serif;color:#f3e6d8}
.prancheta{width:470px;margin:20px;padding:12px;background:#5a2f36;border-radius:8px;box-shadow:inset 0 0 0 3px #3a1d22}
.ss-grade{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ss-col{min-width:0}
.ss-sec h4{margin:0 0 6px;font-size:12px;color:#fff;letter-spacing:.04em;display:flex;align-items:center;gap:6px}
.ss-vivo{width:7px;height:7px;border-radius:50%;background:var(--verde)}
.ss-tempo{display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:6px;background:var(--vao);box-shadow:inset 0 0 0 2px var(--mad-linha),0 1px 0 var(--mad-luz2)}
.ss-tempo-ico{flex:none;display:grid;place-items:center;color:var(--rx-rosa)}
.ss-tempo b{min-width:0;font-size:26px;line-height:1.1;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap;text-shadow:-1px -1px 0 var(--rx-esc),1px -1px 0 var(--rx-esc),-1px 1px 0 var(--rx-esc),1px 1px 0 var(--rx-esc)}
.cartoes{display:flex;gap:6px;margin-top:12px}.cartoes div{flex:1;background:var(--vao);border-radius:6px;padding:8px;text-align:center;box-shadow:inset 0 0 0 2px var(--mad-linha)}
.treinador{background:var(--vao);border-radius:6px;padding:10px;height:150px}
</style></head><body><div class="prancheta" id="prancheta"></div></body></html>`;

function prancheta(tempo) {
  return `<div class="ss-grade"><div class="ss-col"><section class="ss-sec"><h4>TREINADOR</h4><div class="treinador">XP treinador · Gold · Capturas</div></section></div>
  <div class="ss-col"><section class="ss-sec ss-sec-tempo"><h4>TEMPO<i class="ss-vivo"></i></h4>
  <div class="ss-tempo"><span class="ss-tempo-ico" aria-hidden="true">${RELOGIO}</span><b id="sessao-tempo">${tempo}</b></div></section>
  <section class="ss-sec"><h4>SHINY · HUNT</h4><div class="cartoes"><div><b>2</b><br><small>vistos</small></div><div><b>0</b><br><small>capturados</small></div></div></section></div></div>`;
}

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 560, height: 420 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://pokeidle.io/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGINA }));
const page = ctx.pages()[0] || await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${msg}`); if (!cond) falhas++; };
const ler = () => page.evaluate(() => {
  const par = document.querySelector('.plt-ss-tempo');
  const orig = document.querySelector('.ss-sec-tempo > .ss-tempo');
  return {
    par: !!par,
    dias: par?.querySelector('.plt-ss-n')?.textContent,
    rot: par?.querySelector('.plt-ss-rot')?.textContent,
    horas: par?.querySelector('.plt-ss-h')?.textContent,
    origVisivel: orig ? getComputedStyle(orig).display !== 'none' : null,
    cabe: par ? [...par.querySelectorAll('.ss-tempo')].every((b) => b.getBoundingClientRect().right <= document.querySelector('.ss-sec-tempo').getBoundingClientRect().right + 0.5) : null,
    hCabe: par ? (() => { const h = par.querySelector('.plt-ss-h'); return h.scrollWidth <= h.clientWidth + 1; })() : null,
    zero: par?.classList.contains('zero'),
  };
});
const tempo = (txt) => page.evaluate((t) => { document.getElementById('sessao-tempo').textContent = t; }, txt);

await page.goto('https://pokeidle.io/app-sessao');
await sleep(1500);
await page.evaluate((h) => { document.getElementById('prancheta').innerHTML = h; }, prancheta('252:58:16'));
await sleep(500);
let r = await ler();
ok(r.par && r.dias === '10' && r.rot === 'dias' && r.horas === '12:58:16', `252:58:16 → 10 dias + 12:58:16 (${JSON.stringify(r)})`);
ok(r.origVisivel === false, 'o vão original do jogo fica escondido');
ok(r.cabe && r.hCabe, 'os dois vãos cabem na coluna e o relógio não corta');
await page.screenshot({ path: `${SAIDA}/1-dez-dias.png`, clip: { x: 0, y: 0, width: 520, height: 300 } });

await tempo('252:58:17'); await sleep(300);
r = await ler(); ok(r.horas === '12:58:17', `o relógio anda junto com o do jogo (${r.horas})`);

await tempo('23:59:59'); await sleep(300);
r = await ler(); ok(r.dias === '0' && r.horas === '23:59:59' && r.zero, `23:59:59 → 0 dias, apagadinho (${JSON.stringify(r)})`);
await tempo('24:00:00'); await sleep(300);
r = await ler(); ok(r.dias === '1' && r.rot === 'dia' && r.horas === '00:00:00', `24:00:00 → 1 dia (${r.dias} ${r.rot} ${r.horas})`);
await tempo('4:05'); await sleep(300);
r = await ler(); ok(r.dias === '0' && r.horas === '00:04:05', `4:05 (formato curto do jogo) → 00:04:05 (${r.horas})`);
await tempo('1000:00:00'); await sleep(300);
r = await ler(); ok(r.dias === '41' && r.horas === '16:00:00' && r.cabe && r.hCabe, `1000:00:00 → 41 dias + 16:00:00, cabendo (${JSON.stringify(r)})`);

// o jogo refaz a prancheta inteira (abrir/fechar, reset)
await page.evaluate((h) => { document.getElementById('prancheta').innerHTML = h; }, prancheta('49:00:05'));
await sleep(500);
r = await ler(); ok(r.par && r.dias === '2' && r.horas === '01:00:05' && r.origVisivel === false, `prancheta refeita → de novo (${JSON.stringify(r)})`);
const pares = await page.evaluate(() => document.querySelectorAll('.plt-ss-tempo').length);
ok(pares === 1, `um par só (${pares})`);

// formato desconhecido: volta o original do jogo
await tempo('—'); await sleep(300);
r = await ler(); ok(!r.par && r.origVisivel === true, `texto estranho → mostra o relógio do jogo (${JSON.stringify(r)})`);
await tempo('73:10:02'); await sleep(300);
r = await ler(); ok(r.par && r.dias === '3' && r.horas === '01:10:02', 'e volta quando o formato volta');

// idiomas
await page.evaluate(() => window.__pokeidleHunt?.idioma?.definir?.('en'));
await sleep(600);
r = await ler(); ok(r.rot === 'days', `EN: days (${r.rot})`);
await page.screenshot({ path: `${SAIDA}/2-en.png`, clip: { x: 0, y: 0, width: 520, height: 300 } });
await page.evaluate(() => window.__pokeidleHunt?.idioma?.definir?.('es'));
await sleep(600);
await tempo('24:00:00'); await sleep(600);
r = await ler(); ok(r.rot === 'día', `ES: día (${r.rot})`);
await page.evaluate(() => window.__pokeidleHunt?.idioma?.definir?.('pt'));
await tempo('252:58:16'); await sleep(600);
r = await ler(); ok(r.rot === 'dias', `PT de volta: dias (${r.rot})`);

ok(erros.length === 0, `sem erro na página (${erros.join(' | ')})`);
await ctx.close();
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
process.exit(falhas ? 1 : 0);
