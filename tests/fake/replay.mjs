// Imitação do player da fita do jogo (/replay.mjs → ReplayGuerra), só o que o Piloto lê.
export const VELOCIDADES = [1, 2, 4];
export class ReplayGuerra {
  constructor(canvas, rep, { aoAtualizar = null, mini = false } = {}) {
    this.canvas = canvas; this.rep = rep; this.mini = mini; this.aoAtualizar = aoAtualizar;
    this.base = new Map((rep.atores || []).map((a) => [a.s, a]));
    this.atores = new Map([...this.base].map(([s, a]) => [s, { ...a }]));
    this.estado = new Map(); this.tv = 0; this.vivo = true;
  }
  iniciar() { for (const a of this.atores.values()) this.estado.set(a.s, { hp: a.hp, mhp: a.mhp, fora: false }); return Promise.resolve(true); }
  destruir() { this.vivo = false; }
}
