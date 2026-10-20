export function normalizarChocadeira(b){ b=b||{}; return { total: b.total||1, ovos: b.ovos||[] }; }
export function primeiroSlotLivre(e){ for(let s=0;s<e.total;s++) if(!e.ovos.find(o=>o.slot===s)) return s; return null; }
