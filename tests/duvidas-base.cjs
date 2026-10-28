// Base do Dúvidas contra perguntas REAIS do canal (registro de 28/10/2026): o que deve responder (id)
// e o que deve ficar calado (null). Erro de resposta (responder a coisa errada) é pior que calar.
const path = require('path');
const ARQ = process.argv[2] || path.join(__dirname, '../extension/src/piloto/duvidas.js');
global.__pokeidleHunt = { on() {}, pedir() {}, kit: { esc: (x) => x } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
require(path.resolve(ARQ));
const I = __pokeidleHunt.testeDuvidas._interno;
const C = [
  ['Quanto tempo mais oumenos demora para o deposito de usdt cair na conta ?', 'gema-como'],
  ['galera, nao da pra comprar diamante pelo mercado rmt mais?', 'diamante-mercado'],
  ['pq nao consigo comprar pokebolas e porçao', 'loja-npc'],
  ['consigo trocar pokemon com amigo?', 'trocar-pokemon'],
  ['como conseguir Shine Stone fire?', 'shiny-stone'],
  ['existe algum limite de level do qual eu possa usar pokemon, tipo eu lvl baixo posso usar um poke lvl alto?', 'treinador-5'],
  ['Tem alguma possibilidade dos diamantes voltarem a serem vendidos por gemas?', 'diamante-mercado'],
  ['oq o fragmento de chave faz?', 'chave'],
  ['como eu mexo na minha equip de poluemons?', 'equipe'],
  ['onde compra pedra pra evolução?', 'pedra-onde'],
  ['tem algum jeito de ganhar gemas sem ser vendendo poke ou item?', 'gema-como'],
  ['como eu consigo fragmento de mega stone?', 'mega-pedra'],
  ['ooque é Z MOVE?', 'zmove'],
  ['pra conseguir xp share é só com dima?', 'exp-share'],
  ['compensa comprar esses ovos no market?', 'ovo'],
  ['No celular pode minimizar que fica normal igual no Pc ?', 'celular'],
  ['qual a funçao da bicicleta nesse jogo?', 'bicicleta'],
  ['seu eu comprar um pokemon que o nivel dele é maior que o meu treinador tem algum debuff?', 'treinador-5'],
  ['como pegar blastoisinite?', 'mega-pedra'],
  ['gente a casa serve pra que?', 'casa'],
  ['tem algum jeito de passar as gemas de uma conta pra outra?', 'coins-amigo'],
  ['guys, quando eu acho um shiny, ele priorizar gastar a beast ball?', 'beast-shiny'],
  ['alguem sabe dizer se os bonus de xp de comprei se estiver fora do jogo ele continua mesmo ass', 'celular'],
  ['Tem como mandar o poke pro depot no meio da hunt?', null],
  ['qual a diferença de Z Move pra AoE?', 'zmove'],
  ['Só vi agora que não da pra comprar/vender diamante no rmt mais. Desativou temporário ou é permanente a mudança?', 'diamante-mercado'],
  ['Onde vejo o patch notes pessoal ?', 'patch'],
  ['onde arruma a pedra pra mega evoluir o blastoise?', 'mega-pedra'],
  ['vale a pena gastar com aumento de status base de pokemon?', 'iv-subir'],
  ['Como eu troco um pokemon da minha equipe?', 'equipe'],
  ['quanto custa uma gema em real?', 'gema-como'],
  ['ONDE ARRUMO CHARIZARDITE Y OU X ????', 'mega-pedra'],
  ['De modo geral... compensa mais pegar os pokemon primeira forma, ou compensa mais pegar eles na ultima forma? muda alguma cosa?', 'forma-captura'],
  ['como funciona o shiny secret lure?', 'shiny-chance'],
  ['o poke inicial vale a pena evoluir logo que chega no nivel?', 'inicial'],
  ['gente, da pra evoluir pokemon da outland? ou ele fica preso na forma que foi capturado?', 'outland-evolui'],
  ['uma dúvida, se eu chegar num rank no pvp e não jogar mais, tem perigo de cair por inatividade ou algo parecido?', 'pvp-inativo'],
  ['Tem como colocar opção de jogar best ball só em shiny?', 'beast-shiny'],
  ['nao da mais praa vender diamanete?', 'diamante-mercado'],
  ['Pessoal, como consigo enviar coins entre as minhas contas?', 'coins-amigo'],
  ['como ganha dd colocando IDLE no discord', 'discord-tag'],
  ['outland é focado em drop entao?', 'outland'],
  ['na out 2, os pokemon continuam lvl 150 ainda msm ?', 'outland'],
  ['oq é o ticket safari?} pra que serve?', 'safari'],
  ['galera onde compro poçao?', 'loja-npc'],
  ['como eu junto os fragmentos de shiny stone em um de fogo a?', 'shiny-stone'],
  ['como q dropa entrada de boss', 'boss'],
  ['Pessoal. gastar as pedras pra upar stats base, aumenta Nota ?', 'iv-subir'],
  ['que nivel dá pra fazer o primeiro ginasio?', 'ginasio'],
  ['como EU EVOLUO O CHARLIZARD', null],
  ['da pra comprar diamante com ouro?', 'diamante-mercado'],
  ['eu consigo transferir pokemon pra outra conta?', 'trocar-pokemon'],
  ['Quantos fragmentos de mega stone preciso para transformar meu pokemon em mega?', 'mega-pedra'],
  ['ta compensando comprar mystery egg na loja e incubar?', 'ovo'],
  ['alguem sabe um jeito de deixar farmando no celular sem o jogo fechar?', 'celular'],
  ['qnt mais xp eu tenho, menos xp eu ganho de pok lvl inferior?', 'xp-nivel'],
  ['galera boost de loot funciona em boss?', 'boss-loot'],
  ['uma pergunta de leigo, onde que eu jogo o pokemon do banco pro time? nao to conseguindo jogar do depot pro time', 'equipe'],
  ['aonde eu posso vender pedras e comprar pokebolas?', null],
  ['como que eu mudo minha equipe?', 'equipe'],
  ['Como eu troco 1 pokemon com meu amigo?', 'trocar-pokemon'],
  ['nao tem mais como comprar diamante com gema?', 'diamante-mercado'],
  ['onde fica o depot? kkk', 'depot-onde'],
  ['Tem como aumentar o IV do pokemon ?', 'iv-subir'],
  ['Compensa mais capturar pokes na pré evolução ou na forma final?', 'forma-captura'],
  ['pra q serve as casas?', 'casa'],
  ['galera, eu cliquei em "ignorar" em uma pessoa sem querer, tem como reverter?', 'ignorar'],
  ['EXP SHARE pode ser usado nos 4 pokemon que possuo além do principal ou somente em 1?', 'exp-share'],
  ['Mega Stone é so comprando pra adquirir?', 'mega-pedra'],
  ['Pra que serve o safari ticket?', 'safari'],
  ['Rapaziada, não da mais pra comprar dima no RMT?', 'diamante-mercado'],
  ['compensa comprar ovo para chocar poke?', 'ovo'],
  ['Deixei o jogo aberto no pc e agr abri sem querer no celular, se eu fechar ele no celular agr o do pc continua normal?', 'sessao'],
  ['Alguem sabe se o bonus da kick se somam ? , por exemplo pegar 3x o bonus de xp ai fica 45% ?', 'kick-soma'],
  ['bom dia galera!! como faz pra coonseguir ou comprar Blastoisinite?', 'mega-pedra'],
  ['@alizu aonde que ve a tipagem do dia ?', 'tipo-dia'],
  ['Por favor, como Consegue o EXP Share?', 'exp-share'],
  ['melhor colocar lançar ate capturar ou sem parar ? achei que dava pra colocar os 2 mas n', 'lancar'],
  ['os shinys vem de cor diferente no mapa ou so depois que voec ve?', 'shiny-chance'],
  ['Se eu não pegar a recompensa do passe hoje, pra acumular os bonus com o de 2 dias na frente, eu perco a de hoje ou da pra resgatar tudo de vez?', 'passe'],
  ['como faz pra ter duas abas com contas diferentes? queria criar uma alt mas quando abro outra aba vem na minha conta já', 'sessao'],
  // não devem responder (conversa, opinião, outro assunto)
  ['é bom ? kkkkkkkkkkkkkkkk', null],
  ['O que acham do meu zard?', null],
  ['capturei agora esse Cloyster, bom?', null],
  ['boa tarde Hawks, cortou o cabelo? combinou com você.', null],
  ['veio cometer crimes no chat?', null],
  ['caiu o serve?', null],
  ['Que guia?', null],
  ['esse charmander e bom ?', null],
  ['qual vale a pega o Y ou X?', null],
  ['O meta é ir ate que nivel com o golem ? lvl 80 ja vale mudar para charizard ?', null],
];
let ok = 0, erro = 0, calou = 0; const falhas = [];
for (const [q, esp] of C) {
  const t = I.norm(q);
  const r = I.respostaBase(t, 'pt');
  const id = r && !r.pulou ? r.id : null;
  if (id === esp) ok++;
  else if (id && id !== esp) { erro++; falhas.push(`ERRADA  ${id} (esperado ${esp}): ${q}`); }
  else { calou++; falhas.push(`CALOU   (esperado ${esp})${r && r.pulou ? ' ' + r.pulou : ''}: ${q}`); }
}
console.log(falhas.join('\n'));
console.log(`${ok}/${C.length} certas · ${erro} respostas erradas · ${calou} caladas`);
process.exitCode = erro ? 1 : 0;
