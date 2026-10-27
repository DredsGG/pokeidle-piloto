// imitação mínima de shared/showdown.mjs do jogo
export const SHOWDOWN_NIVEL_MIN = 1;
export function showdownAberto(agora = Date.now()) { return { id: 'sd-teste', inscricoesDe: agora - 3600_000, inscricoesAte: agora + 86400_000 }; }
