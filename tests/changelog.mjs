// changelog.json (regra 12/14): o que mudou em cada versão, nos três idiomas, tirado dos mesmos
// textos do quadro de Novidades (src/piloto/guia-pt.js, guia-en.js, guia-es.js). O fundo da
// extensão lê este arquivo na tag do Release para mostrar "Nova versão vX.Y.Z" no idioma de quem usa.
//   node changelog.mjs [pasta-da-extensao]            → grava <pasta>/changelog.json
//   node changelog.mjs [pasta-da-extensao] --conferir → falha se o arquivo estiver desatualizado
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const args = process.argv.slice(2);
const conferir = args.includes('--conferir');
const EXT = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const ctx = { globalThis: null };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const l of ['pt', 'en', 'es']) vm.runInContext(fs.readFileSync(path.join(EXT, 'src/piloto', `guia-${l}.js`), 'utf8'), ctx);
const T = ctx.__pokeidleHunt.guiaTextos;
const cmp = (a, b) => { const pa = a.split('.').map(Number); const pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]; return 0; };
const versoes = [...new Set(['pt', 'en', 'es'].flatMap((l) => Object.keys(T[l].novidades || {})))].sort(cmp);
const out = { versoes: {} };
let falta = [];
for (const v of versoes) {
  out.versoes[v] = {};
  for (const l of ['pt', 'en', 'es']) {
    const lista = (T[l].novidades || {})[v];
    if (!Array.isArray(lista) || !lista.length) falta.push(`${v}/${l}`);
    out.versoes[v][l] = Array.isArray(lista) ? lista.map(String) : [];
  }
}
if (falta.length) { console.log('FALTA tradução nas novidades: ' + falta.join(', ')); process.exit(1); }
const texto = JSON.stringify(out, null, 2) + '\n';
const arq = path.join(EXT, 'changelog.json');
if (conferir) {
  const ok = fs.existsSync(arq) && fs.readFileSync(arq, 'utf8') === texto;
  console.log(ok ? 'ok   changelog.json em dia' : 'FALHOU changelog.json desatualizado: rode node changelog.mjs');
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(arq, texto);
console.log(`changelog.json: ${versoes.length} versões (${versoes.join(', ')})`);
