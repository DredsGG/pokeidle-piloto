export const DEX_LENDARIO_OU_MITICO = new Set([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251]);
export function ehLendarioOuMitico(id) { return DEX_LENDARIO_OU_MITICO.has(Number(id)); }
