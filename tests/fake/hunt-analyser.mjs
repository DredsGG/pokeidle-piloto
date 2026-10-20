export const VIP_MULT_XP=1.5, MAX_MOBS=16;
export const multXpPokemon=()=>1, multXpTreinador=()=>1;
export function efetividade(a,d1,d2,tab){const l=tab[String(a).toUpperCase()]??{};const m=(d)=>l[String(d).toUpperCase()]??1;return m(d1)*(d2&&d2!==d1?m(d2):1);}
export function bonusLootPct(p,agora,tipos,ev=0){return 40+ev;}
