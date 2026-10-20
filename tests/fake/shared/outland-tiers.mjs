export const OUTLAND_TIERS=[{tier:1,nivel:150,mult:1},{tier:2,nivel:1000,mult:1.25},{tier:3,nivel:2000,mult:1.5},{tier:4,nivel:4000,mult:2},{tier:5,nivel:8000,mult:3},{tier:6,nivel:16000,mult:4},{tier:7,nivel:24000,mult:6},{tier:8,nivel:36000,mult:8}];
const t=(n)=>OUTLAND_TIERS.find(x=>x.tier===Number(n))??OUTLAND_TIERS[0];
export const multOutlandTier=(n)=>t(n).mult;
export function tierOutlandValido(tier, level){ const a=t(tier); if(level>=a.nivel) return a.tier; for(let i=OUTLAND_TIERS.length-1;i>=0;i--) if(level>=OUTLAND_TIERS[i].nivel) return OUTLAND_TIERS[i].tier; return 1; }
