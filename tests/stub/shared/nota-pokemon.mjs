// Stub de teste (não é o jogo): o ⚔ ≈ nível × 10 × score, como no shared/nota-pokemon.mjs real.
export const PODER_ESCALA_NIVEL = 10;
export function poderDePokemon(pk, esp = null) {
  const bases = esp ? (esp.baseHp + esp.baseAtk + esp.baseDef + esp.baseSpAtk + esp.baseSpDef + esp.baseSpeed) : 300;
  const q = Number(pk.quality ?? pk.qualidade) || 1;
  const pot = 1 + ((Number(pk.potencia) || 1) - 1) * 0.1;
  const score = Math.min(1, (bases / 680) * (q / 1.5) * pot);
  return Math.max(1, Math.round(Math.max(1, Number(pk.level) || 1) * PODER_ESCALA_NIVEL * score));
}
