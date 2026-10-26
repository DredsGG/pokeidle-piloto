// Stub de teste (não é o jogo): a forma do shared/auto-colecao.mjs real.
export function autoColecaoPadrao() {
  return { lendario: { on: true }, shiny: { on: true }, pot: { on: true, min: 4 }, qual: { on: false, min: 1.5 }, iv: { on: false, min: { hp: 1, atk: 1, def: 1, spAtk: 1, spDef: 1, speed: 1 } }, nota: { on: false, min: 3.5 } };
}
export function autoColecaoEfetiva(a) { return (a && a.autoColecao) || autoColecaoPadrao(); }
export function mesmaAutoColecao(x, y) { return JSON.stringify(x) === JSON.stringify(y); }
