// Ranking da aba Caçar (1.32.2): Larvitar Nv 20 não pode ter a Ledyba Nv 230 em 1º.
// Espécies e golpes reais do catálogo do jogo (lidos em 2026-10-27); XP pela curva do jogo.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const EXT = process.argv[2] || path.resolve(AQUI, '../extension');
const ctxVm = {}; ctxVm.globalThis = ctxVm; vm.createContext(ctxVm);
vm.runInContext(fs.readFileSync(path.join(EXT, 'src/hunt/engine.js'), 'utf8'), ctxVm);
const E = ctxVm.__pokeidleHunt.engine;
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FALHOU'} ${m}`); if (!c) falhas++; };
const at = (s) => s.split(',').map((x) => { const [name, type, power, category, l, cd] = x.split(':'); return { name, type, power: +power, category, learnLevel: +l.slice(1), cooldownMs: +cd }; });
const especies = new Map([
  [246, { pokeId: 246, name: 'Larvitar', baseHp: 50, baseAtk: 64, baseDef: 50, baseSpAtk: 45, baseSpDef: 50, baseSpeed: 41, type1: 'ROCK', type2: 'GROUND', attacks: at('Rock Throw:ROCK:50:PHYSICAL:L1:18200,Rock Slide:ROCK:75:PHYSICAL:L5:24100,Stomping Tantrum:GROUND:75:PHYSICAL:L10:24100,Smack Down:ROCK:50:PHYSICAL:L16:18200,Earthquake:GROUND:100:PHYSICAL:L22:30000') }],
  [165, { pokeId: 165, name: 'Ledyba', baseHp: 40, baseAtk: 20, baseDef: 30, baseSpAtk: 40, baseSpDef: 80, baseSpeed: 55, type1: 'BUG', type2: 'FLYING', attacks: at('Struggle Bug:BUG:50:SPECIAL:L1:18200,Bug Buzz:BUG:90:SPECIAL:L5:27600,Air Slash:FLYING:75:SPECIAL:L10:24100,Aerial Ace:FLYING:56:PHYSICAL:L16:19600,U-turn:BUG:70:PHYSICAL:L22:22900,Tackle:NORMAL:40:PHYSICAL:L30:15900,Swift:NORMAL:15:SPECIAL:L38:10000,Mach Punch:FIGHTING:40:PHYSICAL:L45:15900') }],
  [16, { pokeId: 16, name: 'Pidgey', baseHp: 40, baseAtk: 45, baseDef: 40, baseSpAtk: 35, baseSpDef: 35, baseSpeed: 56, type1: 'NORMAL', type2: 'FLYING', attacks: at('Tackle:NORMAL:40:PHYSICAL:L1:15900,Gust:FLYING:40:SPECIAL:L5:15900') }],
]);
const xpDoNivel = (n) => (n <= 150 ? Math.floor(0.6 * n * n) + 8 : 13500 * (n / 150) ** 1.25);
const T = { ROCK: { BUG: 2, FLYING: 2, FIGHTING: 0.5, GROUND: 0.5 }, GROUND: { FLYING: 0, BUG: 0.5, ROCK: 2 }, FLYING: { ROCK: 0.5 }, FIGHTING: { ROCK: 2, NORMAL: 2, FLYING: 0.5, BUG: 0.5 }, NORMAL: { ROCK: 0.5 } };
const mod = { cooldown: { cooldownGolpeComSpeed: (cd) => cd }, recompensa: { xpPorDerrota: (h, n) => xpDoNivel(n), ouroPorDerrotaHunt: (h, n) => n }, analyser: {} };
const H = (slug, nivel, id) => ({ slug, nome: slug, nivel, regiao: 'johto', especies: [{ pokeId: id, pontos: 16 }] });
const hunts = [H('ledyba230', 230, 165), H('ledyba170', 170, 165), H('ledyba120', 120, 165), H('ledyba10', 10, 165), H('pidgey20', 20, 16)];
const st = (b, lv, iv = 16) => (b + 2 * iv) * lv / 100;
const L = especies.get(246);
const pk = { id: 1, speciesId: 246, nome: 'Larvitar', level: 20, tipos: ['ROCK', 'GROUND'], ivs: { speed: 16 }, stats: { hp: st(L.baseHp, 20), atk: st(L.baseAtk, 20), def: st(L.baseDef, 20), spAtk: st(L.baseSpAtk, 20), spDef: st(L.baseSpDef, 20), speed: st(L.baseSpeed, 20) } };
const ctx = { mod, especies, hunts, consts: { tabelaTipos: T, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8, tiposBoost: [] }, eu: { level: 300 } };
const r = E.analisar(pk, ctx, {});
const por = Object.fromEntries(r.linhas.map((l) => [l.slug, l]));
console.log(r.linhas.map((l, i) => `${i + 1}. ${l.slug} ${l.inviavel ? `(${l.motivo})` : Math.round(l.xpPokemonH) + ' XP/h'}`).join(' · '));
ok(r.linhas[0].slug === 'ledyba10', `1º para o Larvitar Nv 20: ${r.linhas[0].slug}`);
ok(por.ledyba230.inviavel && por.ledyba230.motivo === 'morre antes de matar', 'Ledyba Nv 230: morre antes de matar (não entra no ranking)');
ok(por.ledyba170.inviavel && por.ledyba120.inviavel, 'Ledyba Nv 170 e Nv 120: idem');
const idx = r.linhas.findIndex((l) => l.inviavel);
ok(idx > 0 && r.linhas.slice(idx).every((l) => l.inviavel), 'inviáveis no fim da lista');
ok(!por.pidgey20.inviavel && por.pidgey20.xpPokemonH > 0, 'hunt do nível dele continua viável');
// um pokémon forte de verdade na Ledyba Nv 230 continua viável (a regra não corta quem aguenta)
const F = { ...pk, level: 300, stats: { hp: 2000, atk: 1500, def: 1500, spAtk: 900, spDef: 1500, speed: 300 } };
const rf = E.analisar(F, ctx, {});
ok(!rf.linhas.find((l) => l.slug === 'ledyba230').inviavel, 'pokémon forte (Nv 300) na Ledyba Nv 230: viável');
// 1.33: o gasto real de poção sai do ouro/h; o XP que o desmaio leva sai do XP do treinador
const comPoc = E.analisar(pk, ctx, { pocao: { cura: 60, preco: 5, limiar: 0.3 } });
const v = comPoc.linhas.find((l) => l.slug === 'ledyba10');
ok(v.pocoesH > 0 && Math.abs(v.ouroH - (v.ouroBrutoH - v.custoPocaoH)) < 1e-6, `Ledyba Nv 10 com Small Potion: ${Math.round(v.pocoesH)} poções/h, ouro/h ${Math.round(v.ouroBrutoH)} → ${Math.round(v.ouroH)}`);
const caro = E.analisar(pk, ctx, { pocao: { cura: 60, preco: 5000, limiar: 0.3 } }).linhas.find((l) => l.slug === 'pidgey20');
ok(caro.prejuizo && E.arriscada(caro), `poção cara demais: prejuízo e arriscada (custo ${Math.round(caro.custoPocaoH)}/h, rende ${Math.round(caro.ouroBrutoH)}/h)`);
const semPoc = E.analisar(pk, { ...ctx, eu: { level: 1000 } }, { comPocao: false, pocao: null }).linhas.find((l) => !l.inviavel && l.mortesH > 0);
ok(!semPoc || (semPoc.xpPerdidoH > 0 && semPoc.perdeXp && E.arriscada(semPoc)), `sem poção, treinador Nv 1000: os desmaios levam ${semPoc ? Math.round(semPoc.xpPerdidoH) : 0} XP/h (${semPoc ? semPoc.slug : '-'})`);
const atr = E.analisar(pk, { ...ctx, eu: { level: 1000, loja: { atrasados: { mult: 2, alvo: 2000 } } } }, { comPocao: false, pocao: null }).linhas.find((l) => !l.inviavel && l.mortesH > 0);
ok(!atr || atr.xpPerdidoH === 0, 'com o Boost dos Atrasados o desmaio não custa XP');
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO PASSOU');
process.exit(falhas ? 1 : 0);
