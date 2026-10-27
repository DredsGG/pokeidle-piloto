import path from 'node:path';
// Regra 13: na primeira abertura o idioma vem do navegador (pt, en ou es; qualquer outro, inglês);
// depois vale a escolha salva.
import { createRequire } from 'node:module';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const EXT = path.resolve(AQUI, '../extension');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };
async function rodar(locale, salvo) {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, locale, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${locale}`] });
  await ctx.route('https://pokeidle.io/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>x</body></html>' }));
  if (salvo) await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('piloto:idioma', s); sessionStorage.setItem('x', '1'); } } catch {} }, salvo);
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://pokeidle.io/terms'); await sleep(1500);
  const r = await page.evaluate(() => ({ atual: window.__pokeidleHunt?.idioma?.atual?.(), salvo: localStorage.getItem('piloto:idioma'), nav: navigator.language }));
  await ctx.close().catch(() => {});
  return r;
}
for (const [loc, esp] of [['pt-BR', 'pt'], ['es-ES', 'es'], ['en-US', 'en'], ['fr-FR', 'en'], ['de-DE', 'en']]) {
  const r = await rodar(loc);
  ok(r.atual === esp && r.salvo === esp, `navegador ${loc} (${r.nav}) → ${r.atual}`);
}
const r = await rodar('es-ES', 'pt');
ok(r.atual === 'pt', `escolha salva vale mais que o navegador (${r.atual})`);
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
process.exit(falhas ? 1 : 0);
