export const PASSE_NIVEL_MIN = 10;
export function estadoDoPasse(p) { return { jaPegouHoje: !!(p.passe && p.passe.hoje), vipPendenteHoje: false }; }
