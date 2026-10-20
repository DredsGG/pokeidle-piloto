export function destinosDeEvolucao(e, buscar){ if(!e||!e.evolvesToId) return []; const a=buscar(e.evolvesToId); return a?[{pokeId:e.evolvesToId,nivel:e.evolveLevel??0,especie:a,temArte:true}]:[]; }
export function tipoDaPedraDeEvolucao(b){ return b?.type1??null; }
