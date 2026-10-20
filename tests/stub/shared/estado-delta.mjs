export function criarMescladorDeEstado() { let eu = null; return (p) => { if (p.cheio || !eu) eu = { ...p }; else eu = { ...eu, ...p }; delete eu.cheio; return eu; }; }
