// imitação mínima de shared/campeonato.mjs do jogo (só o que o Piloto usa)
const H = 3600_000;
export function listaDeCampeonatos(agora = Date.now()) {
  return [
    { tipo: 'amador', id: 'amador-teste', inscricoesDe: agora - H, inscricoesAte: agora + 48 * H, nivelMin: 10 },
    { tipo: 'mundial', id: 'mundial-teste', inscricoesDe: agora - H, inscricoesAte: agora + 48 * H, nivelMin: 300 },
    { tipo: 'amador', id: 'amador-futuro', inscricoesDe: agora + 240 * H, inscricoesAte: agora + 480 * H, nivelMin: 10 },
  ];
}
export function podeInscrever() { return { ok: true }; }
