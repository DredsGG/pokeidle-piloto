// Stub de teste (não é o jogo): o ⚔ ≈ nível × 10 × score, como no shared/nota-pokemon.mjs real.
export const PODER_ESCALA_NIVEL = 10;
export const MERCADO_POKEMON_MIN = { level: 50, nota: 3.5 };
export function poderDePokemon(pk, esp = null) {
  const bases = esp ? (esp.baseHp + esp.baseAtk + esp.baseDef + esp.baseSpAtk + esp.baseSpDef + esp.baseSpeed) : 300;
  const q = Number(pk.quality ?? pk.qualidade) || 1;
  const pot = 1 + ((Number(pk.potencia) || 1) - 1) * 0.1;
  const score = Math.min(1, (bases / 680) * (q / 1.5) * pot);
  return Math.max(1, Math.round(Math.max(1, Number(pk.level) || 1) * PODER_ESCALA_NIVEL * score));
}
// 1.45.0 (teste): nota de mentira e previsível — qualidade × 2,5, mais um pouco pelas bases da espécie
// (o do meta, mais evoluído, sai com nota maior, como no jogo).
export function notaDePokemon(pk, esp = null) {
  const q = Number(pk.quality ?? pk.qualidade) || 1;
  const bases = esp ? (esp.baseHp + esp.baseAtk + esp.baseDef + esp.baseSpAtk + esp.baseSpDef + esp.baseSpeed) : 300;
  const nota = Math.round((q * 2.5 + (bases - 300) / 1000) * 1000) / 1000;
  return { nota, faixa: nota >= 4 ? 'bom' : 'razoavel' };
}
