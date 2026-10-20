const ouroPorKill=(n)=>Math.min(15776,Math.max(1,Math.round(36*Math.max(1,n)**0.6006668740248916)));
const alvo=(n)=>Math.round(ouroPorKill(n)*1.15);
export const xpPorDerrota=(h,n)=> n<=150?Math.floor(6*n*n/10)+8:Math.round(13500*(n/150)**1.25);
export function ouroDoAbate(n,b=0){const base=ouroPorKill(n);const loot=Math.round(Math.max(0,alvo(n)-base)*(1+b/100));return{base,loot,total:base+loot};}
export const ouroPorDerrotaHunt=(h,n,e,b=0)=>ouroDoAbate(n,b).total;
