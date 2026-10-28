// Respondedor do canal Dúvidas do chat. 1.37.0 (pedido do André, 28/10): entra na versão pública,
// DESLIGADO de fábrica — quem quiser liga na aba Dúvidas. (De 1.33.8 a 1.36.2 só existia na build
// do André.) Sem IA e sem custo: as respostas saem de uma base fechada, tirada da Pokepédia do jogo
// e dos módulos dele, e a da pedra de evolução é calculada com shared/evolucoes-ramificadas.mjs.
//
// Regras para não virar spam nem "informação falsa" (Termos, "Convivência no chat"):
// - só o canal Dúvidas, só pergunta (tem "?" ou começa com palavra de pergunta), só mensagem nova;
// - só responde quando UMA resposta da base bate com folga; empate ou dúvida: não responde;
// - espera 20 s: se outra pessoa falou no Dúvidas nesse meio tempo, não responde (alguém já ajudou);
// - no máximo 1 resposta a cada 5 min, a mesma pessoa só depois de 30 min, a mesma resposta só
//   depois de 15 min; nada com link; o gancho ainda segura 4 min entre mensagens e só deixa o Dúvidas;
// - para tudo se o jogo mutar a conta ou recusar (o disjuntor do cofre desliga o módulo).
// Tudo vai para o registro (piloto:teste:duvidas:log — a chave antiga, para não perder o histórico),
// inclusive as perguntas sem resposta, para a base crescer.
(function (raiz) {
  'use strict';
  const PIH = raiz.__pokeidleHunt;
  if (!PIH || !PIH.on || !PIH.pedir || !PIH.kit) return;
  const K = PIH.kit;

  const CHAVE = 'piloto:teste:duvidas:v1';
  const CHAVE_LOG = 'piloto:teste:duvidas:log';
  const ESPERA_MS = 20_000;
  const ENTRE_MS = 5 * 60_000;
  const MESMA_PESSOA_MS = 30 * 60_000;
  const MESMA_RESPOSTA_MS = 15 * 60_000;
  const lerJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const gravarJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };
  const log = lerJ(CHAVE_LOG, []);
  // 1.37.0: desligado de fábrica. Quem já usava (a build do André, com registro) continua ligado.
  const salvo = lerJ(CHAVE, null);
  const cfg = { ligado: salvo ? salvo.ligado !== false : log.length > 0, ...(salvo || {}) };
  if (!salvo && cfg.ligado) gravarJ(CHAVE, cfg);
  // 1.36.2: guarda mais (1.000 linhas): as perguntas sem resposta são a matéria-prima da base
  const anotar = (e) => { log.unshift({ em: Date.now(), ...e }); log.length = Math.min(log.length, 1000); gravarJ(CHAVE_LOG, log); };

  let eu = null;
  PIH.on('estado', (e) => { eu = e; });
  const meuNick = () => String((eu && eu.nick) || '').toLowerCase();

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const PERGUNTA = /\?|^(como|onde|qual|quais|quanto|quantos|quando|porque|por que|pq|o que|oq|tem como|alguem sabe|alguem|sabem|how|where|what|which|when|why|is there|can i|does|como se|donde|cual|cuanto|cuando|por que|que es|se puede)\b/;
  const ehPergunta = (t) => PERGUNTA.test(t);

  // ---- a base (pt / en / es). Cada uma: todas as listas de `tem` precisam bater (≥ 2 sinais). ----
  // 1.36.2: a base cresceu de 15 para 50 respostas, tiradas da Pokepédia do jogo (pokepedia.mjs,
  // 28/10/2026) e das 300 perguntas que o canal Dúvidas fez (o registro desta aba). `nao` tira a
  // resposta da disputa quando a pergunta é de outro assunto parecido (sem isso, "comprar poção" caía
  // no sorteio do Mercado).
  const BASE = [
    { id: 'xp-morte', tem: [/\b(perd|perco|perdi|tira|custa|lose|losing|lost|pierd|pierdo)/, /\b(morr|desmai|morte|die|dies|dying|faint|muer|desmay)/],
      r: { pt: 'desmaiar contra selvagem custa 10% do XP do nível atual do treinador. Com o Boost dos Atrasados ligado não perde nada.',
        en: 'fainting against wild Pokémon costs 10% of the trainer\'s current-level XP. With the Late Boost on you lose nothing.',
        es: 'desmayarse contra salvajes cuesta el 10% del XP del nivel actual del entrenador. Con el Boost de los Atrasados activo no se pierde nada.' } },
    { id: 'treinador-5', tem: [/\b(nivel|nv|lv|lvl|level)/, /\b(maior|acima|mais alto|passa|limite|debuff|nao (entra|consigo|deixa|posso)|can'?t|cannot|higher|above|no (puedo|entra|me deja)|mayor)/, /\b(treinador|trainer|entrenador|meu nivel|que eu|que o meu|campo|usar|use|comprar|buy|compro)/],
      nao: [/\b(boss|pvp|ginasio|regiao|capturar|captura)/],
      r: { pt: 'o pokémon só entra em campo com até o nível do treinador + 5 (o inicial sempre entra). Acima disso, espere o treinador subir ou use "Reduzir o nível" na ficha (não volta).',
        en: 'a Pokémon only enters the field up to your trainer level + 5 (the starter always can). Above that, wait for the trainer to level up or use "Lower level" on its sheet (no undo).',
        es: 'el pokémon solo entra en campo hasta el nivel del entrenador + 5 (el inicial siempre entra). Por encima, espera a que el entrenador suba o usa "Reducir nivel" en la ficha (no se deshace).' } },
    { id: 'regioes', tem: [/\b(johto|hoenn|sinnoh|unova|kalos|alola|galar|paldea|regiao|regioes|region|regiones)\b/, /\b(nivel|nv|lv|level|libera|abre|desbloq|unlock|abrir|open)/],
      r: { pt: 'nível do treinador: Johto 200, Hoenn 500, Sinnoh 1.000, Unova 5.000, Kalos 10.000, Alola 25.000, Galar 40.000, Paldea 75.000. Outland abre no 150.',
        en: 'trainer level: Johto 200, Hoenn 500, Sinnoh 1,000, Unova 5,000, Kalos 10,000, Alola 25,000, Galar 40,000, Paldea 75,000. Outland opens at 150.',
        es: 'nivel del entrenador: Johto 200, Hoenn 500, Sinnoh 1.000, Unova 5.000, Kalos 10.000, Alola 25.000, Galar 40.000, Paldea 75.000. Outland abre en el 150.' } },
    { id: 'captura', tem: [/\b(captur|catch|capture|pegar|pego|atrapar)/, /\b(como|how|chance|bola|ball|pokebola|pokeball|funciona|works|matematica|consigo)/],
      nao: [/(ite\b|\bmega\b|stone|pedra|shiny|shine|beast|lure|forma|evolu|ovo|egg|boss|lendario)/],
      r: { pt: 'a bola vai no corpo caído: uma por corpo, e ele fica 30 s no chão. A chance vai de ~1,9% a ~2,9% com a melhor bola (mais fácil no 1º estágio da evolução); Capture Boost dobra.',
        en: 'the ball goes on the fallen body: one per body, and it stays 30 s on the ground. With the best ball the chance is ~1.9% to ~2.9% (easier on the first evolution stage); Capture Boost doubles it.',
        es: 'la bola va al cuerpo caído: una por cuerpo, y queda 30 s en el suelo. Con la mejor bola la chance va de ~1,9% a ~2,9% (más fácil en la 1ª etapa); Capture Boost la duplica.' } },
    { id: 'forma-captura', tem: [/\b(forma|base|evoluid|pre ?evolu|primeira|ultima|final)/, /\b(captur|pegar|compensa|melhor|vale)/],
      nao: [/\b(mega|shiny|status|stats|outland)/],
      r: { pt: 'a pré-evolução é mais fácil de capturar (o 1º de três tem a maior chance) e nasce no Nv 20/40. Evoluir não rerola IV e sempre sobe a nota, então dá para pegar na base e evoluir.',
        en: 'the pre-evolution is easier to catch (the first of three has the best chance) and is born at Lv 20/40. Evolving does not reroll IVs and always raises the grade, so catch the base and evolve.',
        es: 'la pre-evolución es más fácil de capturar (el 1º de tres tiene la mejor chance) y nace en Nv 20/40. Evolucionar no rerolea IV y siempre sube la nota: captura la base y evoluciona.' } },
    { id: 'taxa-mercado', tem: [/\b(taxa|taxas|fee|fees|tasa|tasas|imposto|comissao)/, /\b(mercado|market|vender|venda|sell|anuncio|listing|rmt)/],
      r: { pt: 'no Mercado quem paga é o vendedor: 15% em ouro e em item por Gema; pokémon em Gema 13%/10%/7,5% por faixa; pokémon anunciado paga 100 mil por dia. O Market do NPC não cobra nada.',
        en: 'on the Market the seller pays: 15% in gold and for items in Gems; Pokémon in Gems 13%/10%/7.5% by bracket; a listed Pokémon pays 100k per day. The NPC Market charges nothing.',
        es: 'en el Mercado paga el vendedor: 15% en oro y en ítems por Gemas; pokémon en Gemas 13%/10%/7,5% por tramo; pokémon anunciado paga 100 mil por día. El Market del NPC no cobra nada.' } },
    { id: 'sorteio', tem: [/\b(nao consigo comprar|nunca consigo|perdi|perco|sorteio|lottery|draw|can'?t buy|no puedo comprar|sorteo)/, /\b(mercado|anuncio|rmt|comunidade|listing|community|sorteio|sorteo)/],
      r: { pt: 'anúncio novo fica 2 min travado; quem pede nos 3 s seguintes à liberação entra num sorteio com chance igual, um pedido por jogador. Clicar mais não ajuda.',
        en: 'a new listing is locked for 2 min; everyone who asks in the 3 s after it unlocks joins a draw with equal chance, one request per player. Clicking more does not help.',
        es: 'un anuncio nuevo queda bloqueado 2 min; quien pide en los 3 s siguientes entra en un sorteo con la misma chance, un pedido por jugador. Hacer más clics no ayuda.' } },
    { id: 'loja-npc', tem: [/\b(compr|onde|where|donde|nao consigo|vende)/, /\b(pokebola|pokebolas|bola|bolas|ball|balls|poc|pocao|pocoes|potion|potions|revive|revives|pocion)/],
      nao: [/\b(beast|shiny|mestre|master)/],
      r: { pt: 'bolas, poções e revives: botão Market no topo (o balcão do NPC), em ouro, sem taxa e sem limite. A Beast Ball só sai na Loja de diamantes.',
        en: 'balls, potions and revives: the Market button at the top (the NPC counter), for gold, no fee and no limit. The Beast Ball only comes from the diamond Shop.',
        es: 'bolas, pociones y revives: botón Market arriba (el mostrador del NPC), con oro, sin tasa y sin límite. La Beast Ball solo sale en la Tienda de diamantes.' } },
    { id: 'diamante-mercado', tem: [/\b(diamante|diamantes|dima|dimas|diamond|diamonds)\b/, /\b(vend|compr|mercado|rmt|market|gema|gemas|coins|ouro|gold|troc|sell|buy)/],
      nao: [/\b(gratis|free|ganh|voto|vote|votar|discord|tag)/],
      r: { pt: 'desde 27/10 o Mercado não negocia mais diamante: a aba saiu e os anúncios voltaram aos donos. Diamante agora só se usa na Loja; não se vende nem se compra com ouro ou Gema.',
        en: 'since Oct 27 the Market no longer trades diamonds: the tab was removed and listings went back to their owners. Diamonds are only spent in the Shop; not sold or bought with gold or Gems.',
        es: 'desde el 27/10 el Mercado ya no negocia diamantes: la pestaña salió y los anuncios volvieron a sus dueños. El diamante solo se usa en la Tienda; no se vende ni se compra con oro o Gemas.' } },
    { id: 'saque', tem: [/\b(sac|saque|sacar|withdraw|cash ?out|retirar|dinheiro real|real money|dinero real)/, /\b(gema|gemas|gem|gems|diamante|diamond|diamantes)/],
      r: { pt: 'diamante não saca. Só a Gema saca, em USDT (rede Solana), com aprovação manual da equipe; a Gema vem de depósito de USDT.',
        en: 'diamonds cannot be withdrawn. Only Gems can, in USDT (Solana network), with manual approval from the team; Gems come from USDT deposits.',
        es: 'el diamante no se retira. Solo la Gema se retira, en USDT (red Solana), con aprobación manual del equipo; la Gema viene de depósito en USDT.' } },
    { id: 'gema-como', tem: [/\b(gema|gemas|gem|gems|usdt|deposito|depositar)\b/, /\b(ganh|consegu|conseguir|como|deposit|demora|cai|real|custa|preco|get|earn)/],
      nao: [/\b(sac|saque|withdraw|retirar|transfer|passar|enviar|mandar|diamante|diamantes|dima)/],
      r: { pt: 'Gema só nasce de depósito de USDT na rede Solana (RMT → Depósito; cai sozinha depois das confirmações da rede) ou da comissão de indicação. Não cai de drop nem de boss.',
        en: 'Gems only come from USDT deposits on the Solana network (RMT → Deposit; credited on its own after network confirmations) or from referral commission. They never drop.',
        es: 'la Gema solo nace de un depósito de USDT en la red Solana (RMT → Depósito; entra sola tras las confirmaciones) o de la comisión de referidos. No cae de drop ni de boss.' } },
    { id: 'coins-amigo', tem: [/\b(coins|coin|ouro|gold|dinheiro|gema|gemas|dim ?dim)\b/, /\b(envi|mand|transfer|passar|passo|doar|send)/, /\b(amigo|conta|contas|outra|friend|account|cuenta)/],
      r: { pt: 'Coins: na conversa da Lista de Amigos, "Enviar Coins" (15% é queimado, mínimo 1.000). Gema não tem envio direto: só muda de conta pelo Mercado.',
        en: 'Coins: in a Friends List chat, "Send Coins" (15% is burned, minimum 1,000). Gems have no direct transfer: they only change accounts through the Market.',
        es: 'Coins: en la conversación de la Lista de Amigos, "Enviar Coins" (se quema el 15%, mínimo 1.000). La Gema no tiene envío directo: solo cambia de cuenta por el Mercado.' } },
    { id: 'trocar-pokemon', tem: [/\b(troc|transfer|passar|mandar|enviar|trade|trading|intercamb|dar)/, /\b(pokemon|poke|pokes|pokemons)\b/, /\b(amigo|amigos|outra conta|outro jogador|outra pessoa|alt|friend|another account|otra cuenta|amigo)/],
      r: { pt: 'não existe troca direta: pokémon só muda de dono pelo Mercado da Comunidade (anúncio). Vender ou trocar por fora (PIX, outro site) é proibido e pode dar ban.',
        en: 'there is no direct trade: a Pokémon only changes owner through the Community Market (a listing). Selling or trading outside it (PIX, other sites) is forbidden and can get you banned.',
        es: 'no hay intercambio directo: el pokémon solo cambia de dueño por el Mercado de la Comunidad (anuncio). Vender o cambiar por fuera (PIX, otro sitio) está prohibido y puede dar ban.' } },
    { id: 'equipe', tem: [/\b(equipe|equip|time|team|equipo)\b/, /\b(mudar|mudo|mexer|mexo|troc|editar|edito|escolh|colocar|coloco|montar|monto|botar|change|edit|cambi|depot|banco)/],
      nao: [/\b(pvp|guild|ginasio|guerra|torneio|campeonato|showdown|boss)/],
      r: { pt: 'a equipe se mexe pelo Depot, no Centro Pokémon (Cerulean): lá ficam Depot e Coleção, e o card de quem está na equipe tem a caixa para voltar ao Depot. Cabem até 5; só o ativo luta.',
        en: 'the team is managed from the Depot at the Pokémon Center (Cerulean): Depot and Collection live there, and a team member\'s card has the box to send it back to the Depot. Up to 5; only the active one fights.',
        es: 'el equipo se maneja desde el Depot, en el Centro Pokémon (Cerulean): ahí están Depot y Colección, y la tarjeta de quien está en el equipo tiene la caja para volver al Depot. Hasta 5; solo lucha el activo.' } },
    { id: 'depot-onde', nao: [/\b(time|equipe|team)\b/], tem: [/\bdepot\b/, /\b(onde|where|donde|fica|acho|achar)/],
      r: { pt: 'o Depot fica no Centro Pokémon (Cerulean), com as abas Depot e Coleção. A Coleção também abre de qualquer lugar pela Mochila.',
        en: 'the Depot is at the Pokémon Center (Cerulean), with Depot and Collection tabs. The Collection also opens from anywhere through the Bag.',
        es: 'el Depot está en el Centro Pokémon (Cerulean), con las pestañas Depot y Colección. La Colección también se abre desde cualquier lugar por la Mochila.' } },
    { id: 'boss', tem: [/\bboss\b/, /\b(como|how|token|entrar|enter|time|team|equipe|equipo|ganhar|win|nivel|lvl|level|1 poke|matar|drop|dropa)/],
      nao: [/\b(loot|boost)/],
      r: { pt: 'boss: Bronze Boss Token (cai na Outland, ~1 a cada 2.000 abates, e sai no Passe) e treinador no nível do boss. Leve 5 pokémon no nível dele: cada um que falta triplica o dano que você toma.',
        en: 'boss: a Bronze Boss Token (drops in Outland, ~1 per 2,000 kills, and from the Pass) and trainer at the boss level. Bring 5 Pokémon at its level: each missing one triples the damage you take.',
        es: 'boss: Bronze Boss Token (cae en Outland, ~1 cada 2.000 bajas, y sale en el Pase) y entrenador al nivel del boss. Lleva 5 pokémon a su nivel: cada uno que falta triplica el daño recibido.' } },
    { id: 'boss-loot', tem: [/\bboss\b/, /\b(loot|boost)/],
      r: { pt: 'o Loot Boost não vale no boss: a chance de drop lá é a mesma com ou sem ele (o log da vitória avisa).',
        en: 'Loot Boost does not apply in boss fights: the drop chance there is the same with or without it (the victory log says so).',
        es: 'el Loot Boost no vale en el boss: la chance de drop es la misma con o sin él (el log de la victoria lo avisa).' } },
    { id: 'passe', tem: [/\b(passe|pass|pase)\b/, /\b(dia|dias|day|days|resgat|claim|reclam|perdi|missed|reset|volta|zera|acumul)/],
      r: { pt: 'o Passe é um resgate por dia (vira à meia-noite de Brasília); se faltar um dia, a trilha volta ao Dia 1. Não acumula.',
        en: 'the Pass is one claim per day (resets at midnight Brasília time); if you miss a day, the track goes back to Day 1. It does not stack.',
        es: 'el Pase es un reclamo por día (cambia a medianoche de Brasília); si faltas un día, la ruta vuelve al Día 1. No se acumula.' } },
    { id: 'pvp', tem: [/\bpvp\b/, /\b(nivel|level|lv|libera|abre|unlock|temporada|season|semana|week)/],
      r: { pt: 'o PvP abre no nível 150 do treinador; a temporada é semanal e zera sábado 23:59 (Brasília); perder não tira XP, só PR (70% do que a vitória pagaria).',
        en: 'PvP opens at trainer level 150; seasons are weekly and reset Saturday 23:59 (Brasília); losing costs no XP, only PR (70% of what a win would pay).',
        es: 'el PvP abre en el nivel 150 del entrenador; la temporada es semanal y se reinicia el sábado 23:59 (Brasília); perder no quita XP, solo PR (70% de lo que pagaría la victoria).' } },
    { id: 'pvp-inativo', tem: [/\b(pvp|rank|ranking|mestre|master|challenger|elo)\b/, /\b(inativ|parar de jogar|nao jogar|nao jogo|cair|caio|perder|perco|inactiv)/],
      r: { pt: 'Mestre e Challenger caem para Diamante com 24 h sem partida ranqueada. A tabela inteira zera todo sábado 23:59 (Brasília).',
        en: 'Master and Challenger drop to Diamond after 24 h without a ranked match. The whole table resets every Saturday 23:59 (Brasília).',
        es: 'Maestro y Challenger bajan a Diamante tras 24 h sin partida clasificatoria. Toda la tabla se reinicia cada sábado 23:59 (Brasília).' } },
    { id: 'onde-farmar', tem: [/\b(onde|where|donde|qual|which|cual|melhor|best|mejor)/, /\b(farm|farmar|upar|xp|exp|hunt|cacar|subir)\b/],
      nao: [/\b(share|nota|casa|extens|inicial|starter|outland|shiny|mega|boss|pedra|stone|poke pra|pokemon pra|pokemon para)\b/],
      r: { pt: 'digite /hunt no chat: abre a calculadora de hunts da comunidade. No jogo, o Hunt Analyser do Mapa estima XP/h e ouro/h de cada área para o seu pokémon.',
        en: 'type /hunt in the chat: it opens the community hunt calculator. In the game, the Map\'s Hunt Analyser estimates XP/h and gold/h of each area for your Pokémon.',
        es: 'escribe /hunt en el chat: abre la calculadora de hunts de la comunidad. En el juego, el Hunt Analyser del Mapa estima XP/h y oro/h de cada área para tu pokémon.' } },
    { id: 'xp-nivel', tem: [/\b(xp|exp|experiencia)\b/, /\b(menos|diminui|cai|inferior|mais baixo|level baixo|nivel baixo|lvl baixo|meu nivel|less|lower)/],
      nao: [/\b(outland|morr|desmai)/],
      r: { pt: 'o XP de cada abate depende só do nível do selvagem, não do seu: matar um mais fraco paga o mesmo para qualquer um.',
        en: 'the XP of each kill depends only on the wild Pokémon\'s level, not yours: a weaker one pays the same to anyone.',
        es: 'el XP de cada baja depende solo del nivel del salvaje, no del tuyo: uno más débil paga lo mismo a cualquiera.' } },
    { id: 'voto', tem: [/\b(diamante|diamond|diamantes|dima|dd)\b/, /\b(gratis|free|ganhar|ganho|ganha|get|earn|conseguir|voto|vote|votar)/],
      nao: [/\b(discord|tag|share|exp)\b/],
      r: { pt: 'diamante grátis: Vote & Ganhe (1 voto por dia no TopIdle, 1 💎 a cada 2 votos), tag IDLE no Discord, convites do Discord e os prêmios de ranking, Mini Games e Showdown.',
        en: 'free diamonds: Vote & Earn (1 vote a day on TopIdle, 1 💎 every 2 votes), the IDLE tag on Discord, Discord invites and the ranking, Mini Games and Showdown prizes.',
        es: 'diamantes gratis: Vota y Gana (1 voto al día en TopIdle, 1 💎 cada 2 votos), la tag IDLE en Discord, invitaciones de Discord y los premios de ranking, Mini Games y Showdown.' } },
    { id: 'discord-tag', tem: [/\b(discord|tag)\b/, /\b(idle|diamante|dima|dd|ganh|5)\b/],
      r: { pt: 'tag IDLE no perfil do Discord: 5 💎 na primeira vez e +5 a cada 10 dias seguidos com ela. O código sai no #reedem-codes e se resgata no chat com /resgatar <código>.',
        en: 'IDLE tag on your Discord profile: 5 💎 the first time and +5 every 10 days in a row. The code comes from #reedem-codes and is redeemed in chat with /resgatar <code>.',
        es: 'tag IDLE en el perfil de Discord: 5 💎 la primera vez y +5 cada 10 días seguidos. El código sale en #reedem-codes y se canjea en el chat con /resgatar <código>.' } },
    { id: 'casa', tem: [/\b(casa|casas|house)\b/, /\b(como|how|consegu|get|fragment|quanto|cuanto|serve|sirve|what|pra que|para que|funciona)/],
      r: { pt: 'a Casa dá a um pokémon da equipe ou da Coleção 25% a 100% do XP do ativo, de graça e por cima. 10 Fragmentos de Chave (caem na Outland) viram uma casa sorteada no Professor Carvalho.',
        en: 'a House gives a team or Collection Pokémon 25% to 100% of the active one\'s XP, extra and free. 10 Key Fragments (Outland drop) become a random house at Professor Oak.',
        es: 'la Casa da a un pokémon del equipo o de la Colección del 25% al 100% del XP del activo, extra y gratis. 10 Fragmentos de Llave (caen en Outland) dan una casa sorteada en el Profesor Oak.' } },
    { id: 'exp-share', tem: [/(exp\.? ?share|xp ?share|expshare)/],
      nao: [/\b(casa|house)\b/],
      r: { pt: 'o item Exp. Share (Loja de diamantes) dá +5% do XP do ativo a quem segura, um por pokémon, e vale até no Depot. A Casa (XP Share) é outra coisa: 25% a 100%, do Professor Carvalho.',
        en: 'the Exp. Share item (diamond Shop) gives +5% of the active one\'s XP to whoever holds it, one per Pokémon, even in the Depot. The House (XP Share) is different: 25% to 100%, from Professor Oak.',
        es: 'el ítem Exp. Share (Tienda de diamantes) da +5% del XP del activo a quien lo lleva, uno por pokémon, y vale hasta en el Depot. La Casa (XP Share) es otra cosa: 25% a 100%, del Profesor Oak.' } },
    { id: 'chave', tem: [/\b(chave|key|llave)\b/, /\b(fragment|serve|faz|o que|oq|what|para que)/],
      r: { pt: '10 Fragmentos de Chave (caem na Outland, ~1 a cada 200 mil abates na Outland 1) viram uma Casa de raridade sorteada no Professor Carvalho, no Centro Pokémon.',
        en: '10 Key Fragments (Outland drop, ~1 per 200k kills in Outland 1) become a House of random rarity at Professor Oak, in the Pokémon Center.',
        es: '10 Fragmentos de Llave (caen en Outland, ~1 cada 200 mil bajas en Outland 1) se vuelven una Casa de rareza sorteada en el Profesor Oak, en el Centro Pokémon.' } },
    { id: 'bicicleta', tem: [/\b(bicicleta|bike|bici)\b/, /\b(serve|funcao|o que|oq|como|quantos|fragment|raridade|what|faz|vale)/],
      r: { pt: 'a bicicleta encurta a caminhada entre os selvagens (a Lendária faz cada passo durar a metade). 10 Fragmentos de Bicicleta (Outland) viram uma de raridade sorteada no Professor Carvalho.',
        en: 'the bike shortens the walk between wild Pokémon (the Legendary one halves each step). 10 Bike Fragments (Outland) become one of random rarity at Professor Oak.',
        es: 'la bicicleta acorta la caminata entre salvajes (la Legendaria hace que cada paso dure la mitad). 10 Fragmentos de Bicicleta (Outland) dan una de rareza sorteada en el Profesor Oak.' } },
    { id: 'outland', tem: [/\b(outland|out ?[1-8])\b/, /\b(nivel|lvl|level|drop|melhor|vale|pena|mil|1000|150|foco|focado|diferen|muda|farm|xp)/],
      r: { pt: 'as 8 Outlands têm o mesmo mapa e selvagens Nv 150; a de cima só multiplica (×1 a ×8) os drops raros: Boss Token e fragmentos de Chave, Shiny Stone e Bicicleta. XP e ouro não mudam; lá não tem shiny.',
        en: 'all 8 Outlands share the map and Lv 150 wild Pokémon; higher ones only multiply (×1 to ×8) the rare drops: Boss Token and Key, Shiny Stone and Bike fragments. XP and gold do not change; no shinies there.',
        es: 'las 8 Outlands tienen el mismo mapa y salvajes Nv 150; las de arriba solo multiplican (×1 a ×8) los drops raros: Boss Token y fragmentos de Llave, Shiny Stone y Bicicleta. XP y oro no cambian; no hay shiny.' } },
    { id: 'zmove', tem: [/\b(z ?move|zmove|aoe|tm)\b/, /\b(o que|oq|oque|ooque|que e|qual|diferenca|como|serve|onde|what|which|difference|how)/],
      r: { pt: 'Z-Move: golpe de 2.800 de poder, recarga 60 s, área 3×3 em volta do alvo. TM AoE: todos os golpes acertam 11×11 em volta do seu pokémon. Os dois saem de 10 peças que caem dos bosses.',
        en: 'Z-Move: a 2,800-power move, 60 s cooldown, 3×3 area around the target. TM AoE: every move hits 11×11 around your Pokémon. Both come from 10 pieces dropped by bosses.',
        es: 'Z-Move: golpe de 2.800 de poder, recarga 60 s, área 3×3 alrededor del objetivo. TM AoE: todos los golpes pegan en 11×11 alrededor de tu pokémon. Los dos salen de 10 piezas de los bosses.' } },
    { id: 'safari', tem: [/\bsafari\b/],
      r: { pt: 'Safari Ticket (cai dos bosses): 60 min num mapa em que cada aparição é uma espécie sorteada, no Nv 1, para capturar; o capturado nasce no dobro do nível de captura (até 200). Não dá XP nem Coins.',
        en: 'Safari Ticket (boss drop): 60 min on a map where each spawn is a random species at Lv 1, to catch; catches are born at double their capture level (up to 200). No XP or Coins.',
        es: 'Safari Ticket (cae de los bosses): 60 min en un mapa donde cada aparición es una especie sorteada, en Nv 1, para capturar; nace al doble del nivel de captura (hasta 200). No da XP ni Coins.' } },
    { id: 'mega-pedra', tem: [/(\bmega\b|ite\b|megastone|mega stone)/, /\b(pedra|stone|como|onde|pegar|consig|arrum|compr|farm|fragment|dropa|evoluir|evolui|get|where)/],
      nao: [/\b(retroced|qual (e )?melhor|vale)/],
      r: { pt: 'Mega Stone: 10 Fragmentos de Mega Stone (caem dos bosses a partir do Nv 300, ou no Mercado) viram, no Professor Carvalho, a pedra da espécie que você escolher. Shiny pede a Mega Shiny.',
        en: 'Mega Stone: 10 Mega Stone Fragments (boss drops from Lv 300, or the Market) become, at Professor Oak, the stone for the species you pick. A shiny needs the Shiny Mega Stone.',
        es: 'Mega Stone: 10 Fragmentos de Mega Stone (caen de los bosses desde Nv 300, o en el Mercado) se vuelven, en el Profesor Oak, la piedra de la especie que elijas. El shiny pide la Mega Shiny.' } },
    { id: 'shiny-stone', tem: [/(shiny stone|shine stone|pedra shiny|shiny fire|stone fire)/],
      r: { pt: 'Shiny Stone: 10 Fragmentos de Shiny Stone (Outland) viram, no Professor Carvalho, a do tipo que você escolher; evolui um shiny pelo tipo primário. A Oferenda com shinys também dá.',
        en: 'Shiny Stone: 10 Shiny Stone Fragments (Outland) become, at Professor Oak, the type you choose; it evolves a shiny by its primary type. An Offering with shinies also gives one.',
        es: 'Shiny Stone: 10 Fragmentos de Shiny Stone (Outland) se vuelven, en el Profesor Oak, la del tipo que elijas; evoluciona un shiny por su tipo primario. La Ofrenda con shinys también la da.' } },
    { id: 'pedra-onde', tem: [/\b(pedra|pedras|stone|stones|piedra)\b/, /\b(onde|compr|consig|arrum|farm|dropa|cai|caem|where|get|donde|vend)/],
      nao: [/(\bmega\b|ite\b|shiny|shine)/],
      r: { pt: 'pedra de evolução cai do pokémon do mesmo tipo (0,2% a 0,5% por abate), se compra no Mercado da Comunidade, e a Oferenda troca pokémon do Depot por uma pedra dos tipos deles.',
        en: 'evolution stones drop from Pokémon of that type (0.2% to 0.5% per kill), are sold on the Community Market, and the Offering trades Depot Pokémon for a stone of their types.',
        es: 'la piedra de evolución cae del pokémon de ese tipo (0,2% a 0,5% por baja), se compra en el Mercado de la Comunidad, y la Ofrenda cambia pokémon del Depot por una piedra de sus tipos.' } },
    { id: 'outland-evolui', tem: [/\b(outland|ancient|furious)\b/, /\b(evolu|evolv)/],
      r: { pt: 'as variantes da Outland (Ancient Pupitar, Furious Magikarp, todo o #2001+) não evoluem nem megaevoluem: são espécies separadas, capturadas prontas.',
        en: 'Outland variants (Ancient Pupitar, Furious Magikarp, everything #2001+) do not evolve or mega evolve: they are separate species, caught as they are.',
        es: 'las variantes de Outland (Ancient Pupitar, Furious Magikarp, todo el #2001+) no evolucionan ni megaevolucionan: son especies aparte, capturadas así.' } },
    { id: 'ovo', tem: [/\b(ovo|ovos|egg|eggs|mystery|huevo)\b/, /\b(vale|compensa|compr|chocar|pena|worth|sai|nasce|como)/],
      nao: [/\bshiny\b/],
      r: { pt: 'Mystery Eggs (Market): P2 20 mi (6 h), P3 120 mi (12 h), P4 250 mi (24 h). Sai uma espécie sorteada das hunts com a potência do ovo; qualidade, IV e shiny rolam como captura. Nunca lendário.',
        en: 'Mystery Eggs (Market): P2 20M (6 h), P3 120M (12 h), P4 250M (24 h). A random hunt species hatches with the egg\'s potency; quality, IV and shiny roll like a catch. Never legendary.',
        es: 'Mystery Eggs (Market): P2 20 M (6 h), P3 120 M (12 h), P4 250 M (24 h). Nace una especie sorteada de las hunts con la potencia del huevo; calidad, IV y shiny como captura. Nunca legendario.' } },
    { id: 'shiny-chance', tem: [/\b(shiny|shinys|shinies|shine)\b/, /\b(chance|raro|rara|lure|quantos|media|a cada|odds|probab|vem|aparece|melhor poke|cor)/],
      nao: [/\b(stone|pedra|ovo|egg|mega)\b/],
      r: { pt: 'o shiny é sorteado no arremesso da bola, com a mesma chance para toda espécie; na hunt todo selvagem parece comum até a bola. O Shiny Secret Lure dobra; na Outland não tem shiny.',
        en: 'shiny is rolled when the ball is thrown, same chance for every species; in a hunt every wild one looks normal until the ball. Shiny Secret Lure doubles it; no shinies in Outland.',
        es: 'el shiny se sortea al lanzar la bola, con la misma chance para toda especie; en la hunt todo salvaje parece común hasta la bola. El Shiny Secret Lure la duplica; en Outland no hay shiny.' } },
    { id: 'beast-shiny', tem: [/\b(beast|best ball|besa|bola)\b/, /\b(shiny|shinys)\b/],
      r: { pt: 'não dá para separar bola para shiny: o brilho só é sorteado no arremesso. A automação gasta a primeira bola da lista que ainda tem estoque; por isso vale jogar a melhor em todo corpo.',
        en: 'you cannot save a ball for shinies: the shine is only rolled on the throw. The automation uses the first ball on the list still in stock, so the best ball on every body is worth it.',
        es: 'no se puede reservar bola para shiny: el brillo solo se sortea al lanzar. La automatización usa la primera bola de la lista con stock; por eso conviene la mejor en cada cuerpo.' } },
    { id: 'lancar', tem: [/\b(lancar|lanca|throw|lanzar)\b/, /\b(capturar|parar|sem parar|stop|catch)/],
      r: { pt: 'Lançar até Capturar para na primeira captura; Lançar sem Parar continua e recomeça sozinho quando a bola volta ao estoque. Os dois são VIP, uma bola por corpo a cada 1,2 s.',
        en: 'Throw until Catch stops at the first catch; Throw Nonstop keeps going and resumes when balls are back in stock. Both are VIP, one ball per body every 1.2 s.',
        es: 'Lanzar hasta Capturar para en la primera captura; Lanzar sin Parar sigue y vuelve solo cuando hay bolas. Los dos son VIP, una bola por cuerpo cada 1,2 s.' } },
    { id: 'inicial', tem: [/\b(inicial|starter|inical)\b/, /\b(ate|qual nivel|vale|bom|compensa|evolu|trocar|manter|melhor|considerado|level|lvl)/],
      r: { pt: 'todo inicial nasce igual: qualidade 1,6 e IV 27 em cada stat (nota boa), e é o único que entra em campo acima do nível do treinador + 5. Não adianta recriar a conta por um melhor.',
        en: 'every starter is born the same: quality 1.6 and IV 27 in each stat (a good grade), and it is the only one allowed above trainer level + 5. Remaking the account for a better one is pointless.',
        es: 'todo inicial nace igual: calidad 1,6 e IV 27 en cada stat (buena nota), y es el único que entra en campo por encima del nivel del entrenador + 5. No sirve rehacer la cuenta.' } },
    { id: 'nota', nao: [/(stats base|status base|refin)/], tem: [/\bnota\b/, /\b(3,5|3\.5|vale|compensa|bom|boa|significa|media|mercado|upar|investir|forca)/],
      r: { pt: 'a nota (0 a 10) mede o nascimento dentro da espécie (IV, qualidade, potência, shiny) e não muda com o nível; evoluir sempre sobe. O Mercado só aceita nota 3,5+ com Nv 50+ (shiny, P5 e lendário passam).',
        en: 'the grade (0 to 10) measures how a Pokémon was born within its species (IV, quality, potency, shiny) and does not change with level; evolving always raises it. The Market needs 3.5+ and Lv 50+ (shiny, P5, legendary pass).',
        es: 'la nota (0 a 10) mide el nacimiento dentro de la especie (IV, calidad, potencia, shiny) y no cambia con el nivel; evolucionar siempre la sube. El Mercado pide 3,5+ y Nv 50+ (shiny, P5 y legendario pasan).' } },
    { id: 'iv-speed', tem: [/\b(iv|speed|spd|velocidade)\b/, /\b(speed|spd|velocidade|rapido|skill|recarga|cooldown|serve)/],
      nao: [/\b(aumentar|subir|melhorar|refin)/],
      r: { pt: 'o SPD não acelera a corrida nem entra no dano: o Speed base com o IV de SPD encurta a recarga dos golpes (até 7%), e cada ponto de IV tira 10 ms da Investida e do intervalo.',
        en: 'SPD does not speed up walking or add damage: base Speed with the SPD IV shortens move cooldowns (up to 7%), and each IV point takes 10 ms off the Tackle and the attack interval.',
        es: 'el SPD no acelera la carrera ni suma daño: el Speed base con el IV de SPD acorta la recarga (hasta 7%), y cada punto de IV quita 10 ms a la Embestida y al intervalo.' } },
    { id: 'iv-subir', tem: [/\b(iv|ivs|qualidade|potencia|status base|stats base)\b/, /\b(aumentar|subir|melhorar|mudar|refin|gastar|vale)/],
      r: { pt: 'IV, qualidade e potência nunca mudam. O que sobe a base é o Refino: +1 por degrau num stat, pago com a pedra do tipo do pokémon (500 pedras o 1º degrau); o SPD não refina. Sobe a nota.',
        en: 'IV, quality and potency never change. Refining raises the base: +1 per step on a stat, paid with stones of the Pokémon\'s type (500 for the first step); SPD cannot be refined. It raises the grade.',
        es: 'IV, calidad y potencia nunca cambian. Lo que sube la base es el Refino: +1 por grado en un stat, pagado con piedras del tipo del pokémon (500 el 1º grado); el SPD no se refina. Sube la nota.' } },
    { id: 'tipo-dia', tem: [/(tipagem do dia|tipo do dia|sazonal|type of the day|tipo del dia)/],
      r: { pt: 'todo dia às 18:00 (Brasília) uma tipagem é sorteada: na hunt, todo pokémon dela, seu ou selvagem, fica 2× (ataque, defesa e vida). O ícone fica no canto de baixo à direita da hunt.',
        en: 'every day at 18:00 (Brasília) a type is drawn: in hunts, every Pokémon of it, yours or wild, gets 2× attack, defense and HP. The icon sits in the hunt\'s bottom-right corner.',
        es: 'cada día a las 18:00 (Brasília) se sortea un tipo: en la hunt, todo pokémon de él, tuyo o salvaje, queda 2× (ataque, defensa y vida). El ícono está en la esquina inferior derecha.' } },
    { id: 'celular', nao: [/(sem querer|outra aba|outro lugar)/], tem: [/\b(celular|mobile|minimiz|desligar o pc|offline|fechar|fora do jogo|longe)/, /\b(farm|cac|jogo|continua|aberto|game|funciona|normal|bonus|boost)/],
      r: { pt: 'o jogo só caça com a aba aberta (não há modo offline). No celular: Tela sempre acesa + Modo Economia; o Modo Pocket deixa a janelinha por cima. Os boosts da Loja correm mesmo com você fora.',
        en: 'the game only hunts with the tab open (no offline mode). On mobile: Keep screen on + Economy Mode; Pocket Mode keeps a small window on top. Shop boosts keep running while you are away.',
        es: 'el juego solo caza con la pestaña abierta (no hay modo offline). En el celular: Pantalla siempre encendida + Modo Economía; el Modo Pocket deja una ventanita encima. Los boosts de la Tienda corren aunque no estés.' } },
    { id: 'kick-soma', tem: [/\bkick\b/, /\b(soma|somam|acumul|stack|3x|45)/],
      r: { pt: 'na Kick as horas se somam (3 resgates = 3 h), mas o percentual não sobe: fica em +15%. O bônus da Kick multiplica com VIP, boosts e Twitch.',
        en: 'on Kick the hours add up (3 claims = 3 h), but the percentage does not grow: it stays at +15%. The Kick bonus multiplies with VIP, boosts and Twitch.',
        es: 'en Kick las horas se suman (3 canjes = 3 h), pero el porcentaje no sube: queda en +15%. El bono de Kick se multiplica con VIP, boosts y Twitch.' } },
    { id: 'ginasio', tem: [/\b(ginasio|gym|gimnasio)\b/],
      r: { pt: 'Ginásios: 18, um por tipo; registrar pede treinador Nv 150 e um time de até 5 do tipo, sem espécie repetida. O líder ganha +25% de dano com o tipo na hunt (2º +10%, 3º +5%).',
        en: 'Gyms: 18, one per type; registering needs trainer Lv 150 and a team of up to 5 of that type, no repeated species. The leader gets +25% damage with that type in hunts (2nd +10%, 3rd +5%).',
        es: 'Gimnasios: 18, uno por tipo; registrar pide entrenador Nv 150 y un equipo de hasta 5 del tipo, sin especie repetida. El líder gana +25% de daño con el tipo en la hunt (2º +10%, 3º +5%).' } },
    { id: 'patch', tem: [/\b(patch|novidades|news|changelog)\b/],
      r: { pt: 'o ! ao lado das bandeiras de idioma (no celular, na gaveta Menu) abre as Novidades no PokeIdle, com as edições anteriores nas setas.',
        en: 'the ! next to the language flags (on mobile, in the Menu drawer) opens PokeIdle News, with older editions on the arrows.',
        es: 'el ! junto a las banderas de idioma (en el celular, en el cajón Menú) abre las Novedades de PokeIdle, con las ediciones anteriores en las flechas.' } },
    { id: 'sacrificio', tem: [/\b(sacrific)/],
      r: { pt: 'Sacrifício (Mochila): pokémon de nota 3,5+ viram pontos numa barra de 5 níveis; resgatar dá +20% de XP de 8 h a 14 dias. Esperar o nível mais alto rende mais horas por ponto.',
        en: 'Sacrifice (Bag): Pokémon with grade 3.5+ become points on a 5-level bar; claiming gives +20% XP for 8 h up to 14 days. Waiting for a higher level gives more hours per point.',
        es: 'Sacrificio (Mochila): pokémon de nota 3,5+ se vuelven puntos en una barra de 5 niveles; canjear da +20% de XP de 8 h a 14 días. Esperar el nivel más alto rinde más horas por punto.' } },
    { id: 'oferenda', tem: [/\b(oferenda|oferendar|offering|ofrenda)\b/],
      r: { pt: 'Oferenda (Mochila): até 5 pokémon do Depot numa roleta; sai 1 pedra de evolução de um dos tipos deles (com 5 é garantida). Os oferecidos somem. Shiny dá Shiny Stone.',
        en: 'Offering (Bag): up to 5 Depot Pokémon on a wheel; you get 1 evolution stone of one of their types (guaranteed with 5). They are gone for good. A shiny gives a Shiny Stone.',
        es: 'Ofrenda (Mochila): hasta 5 pokémon del Depot en una ruleta; sale 1 piedra de evolución de uno de sus tipos (con 5 es segura). Los ofrecidos desaparecen. El shiny da Shiny Stone.' } },
    { id: 'sair-hunt', tem: [/\b(nao (consigo|da) (sair|ir)|preso|stuck|can'?t (leave|go)|no puedo (salir|ir)|atascad)/, /\b(hunt|centro|center|combate|combat)/],
      r: { pt: 'para ir ao Centro a hunt precisa de 3 s sem dano. Se não para de vir, "Desistir do Combate" sai na hora (custa 10% do XP do nível) ou use a Escape Rope (1 💎).',
        en: 'going to the Center needs 3 s without damage. If they keep coming, "Give up combat" leaves now (costs 10% of level XP) or use an Escape Rope (1 💎).',
        es: 'para ir al Centro la hunt necesita 3 s sin daño. Si no paran, "Rendirse del combate" sale al instante (cuesta 10% del XP del nivel) o usa la Escape Rope (1 💎).' } },
    { id: 'sessao', tem: [/\b(outro lugar|outra aba|caiu|desconect|deslog|another (tab|place)|disconnect|otra pestana|otro lugar|celular e no pc|no celular)/, /\b(conta|account|cuenta|jogo|game|juego|sessao|session|pc|continua)/],
      nao: [/\b(minimiz|farm)/],
      r: { pt: 'é uma sessão por conta: abrir o jogo em outra aba ou aparelho pausa a anterior, que mostra "Jogar aqui" para trazer de volta. Nada se perde.',
        en: 'one session per account: opening the game in another tab or device pauses the previous one, which shows "Play here" to bring it back. Nothing is lost.',
        es: 'es una sesión por cuenta: abrir el juego en otra pestaña o dispositivo pausa la anterior, que muestra "Jugar aquí" para volver. No se pierde nada.' } },
    { id: 'ignorar', tem: [/\b(ignor|bloque)/, /\b(revert|desfaz|tirar|voltar|undo|quitar|sem querer)/],
      r: { pt: 'quem você ignora sai da lista de ignorados quando você desfaz por lá (clique no nick para ver as opções). A lista fica na conta e vale em qualquer aparelho.',
        en: 'undo it from the ignore list (click the nick for the options). The list is saved on the account and works on any device.',
        es: 'se deshace desde la lista de ignorados (clic en el nick para ver las opciones). La lista queda en la cuenta y vale en cualquier dispositivo.' } },
  ];
  // a pedra de evolução: calculada pelos módulos do jogo para o pokémon citado
  const RE_EVO = /\b(evolu|evolv|evoluc|pedra|stone|piedra)/;
  let evo = null;
  async function catalogoEvo() {
    if (evo) return evo;
    const imp = (p) => import(`${location.origin}/shared/${p}.mjs`);
    const [ramif, teto, pedras, jogo] = await Promise.all([imp('evolucoes-ramificadas'), imp('teto-captura'), imp('pedras-evolucao'), PIH.carregarJogo()]);
    const lista = [...jogo.especies.values()].map((e) => ({ ...e }));
    const porId = new Map(lista.map((e) => [e.pokeId, e]));
    try { teto.aplicarTetoDeCaptura(lista, (id) => porId.get(id)); } catch { /* nível do catálogo */ }
    const porNome = new Map(lista.filter((e) => e.name).map((e) => [norm(e.name), e]));
    evo = { ramif, pedras, porId, porNome };
    return evo;
  }
  async function respostaEvo(texto, idi) {
    if (!RE_EVO.test(texto) || /(\bmega\b|ite\b|shiny|shine|outland|ancient|furious)/.test(texto)) return null;
    let c;
    try { c = await catalogoEvo(); } catch { return null; }
    const palavras = texto.replace(/[^a-z0-9 .'-]/g, ' ').split(' ').filter((w) => w.length >= 3);
    const achados = [...new Set(palavras.map((w) => c.porNome.get(w)).filter(Boolean))];
    if (achados.length !== 1) return null;
    const esp = achados[0];
    const destinos = esp.evolvesToId ? c.ramif.destinosDeEvolucao(esp, (id) => c.porId.get(id)).filter((d) => d.temArte) : [];
    if (!destinos.length) return { id: 'evo', txt: { pt: `o ${esp.name} não evolui.`, en: `${esp.name} does not evolve.`, es: `${esp.name} no evoluciona.` }[idi] };
    if (destinos.length > 1) return null; // ramificada: melhor um humano explicar
    const d = destinos[0];
    const tipo = c.ramif.tipoDaPedraDeEvolucao(esp, d.especie);
    const pedra = tipo && c.pedras.PEDRA_POR_TIPO[tipo];
    if (!pedra) return null;
    const nv = Number(d.nivel) || 0;
    return { id: `evo:${esp.pokeId}`, txt: {
      pt: `o ${esp.name} evolui para ${d.especie.name}${nv ? ` no Nv ${nv}` : ''} com 1 ${pedra}.`,
      en: `${esp.name} evolves into ${d.especie.name}${nv ? ` at Lv ${nv}` : ''} with 1 ${pedra}.`,
      es: `${esp.name} evoluciona a ${d.especie.name}${nv ? ` en el Nv ${nv}` : ''} con 1 ${pedra}.`,
    }[idi] };
  }
  function respostaBase(texto, idi) {
    const bate = BASE.filter((b) => b.tem.every((re) => re.test(texto)) && !(b.nao || []).some((re) => re.test(texto)));
    if (bate.length !== 1) return bate.length ? { pulou: `empate: ${bate.map((b) => b.id).join(', ')}` } : null;
    return { id: bate[0].id, txt: bate[0].r[idi] };
  }

  // ---- o fluxo ----------------------------------------------------------------------------------
  const st = { ultimaEm: 0, porNick: new Map(), porResposta: new Map(), pendente: null, ultimaFalaEm: 0, mutadoAte: 0 };
  PIH.on('chat.mute', (m) => { st.mutadoAte = Number(m && m.ate) || Date.now() + 3_600_000; anotar({ acao: 'parou', motivo: 'o jogo mutou a conta' }); });

  function porQueNao(nick, idResp) {
    const n = Date.now();
    if (!cfg.ligado) return 'desligado';
    if (!PIH.cofre || !PIH.cofre.liberado || !PIH.cofre.liberado('duvidas')) return 'Piloto desligado (ou disjuntor)';
    if (st.mutadoAte > n) return 'conta mutada';
    if (n - st.ultimaEm < ENTRE_MS) return 'menos de 5 min da última resposta';
    if (n - (st.porNick.get(nick) || 0) < MESMA_PESSOA_MS) return 'mesma pessoa há menos de 30 min';
    if (n - (st.porResposta.get(idResp) || 0) < MESMA_RESPOSTA_MS) return 'mesma resposta há menos de 15 min';
    return null;
  }

  PIH.on('chat', async (m) => {
    try {
      if (!m || m.canal !== 'duvidas' || typeof m.texto !== 'string') return;
      const de = String(m.de || '');
      const nick = de.toLowerCase();
      if (!nick) return;
      const ts = Number(m.ts) || Date.now();
      if (nick === meuNick()) return;
      // alguém falou depois da pergunta pendente: talvez já tenha respondido
      if (st.pendente && nick !== st.pendente.nick && ts >= st.pendente.ts) st.pendente.outros = true;
      if (Date.now() - ts > 60_000) return; // histórico ao entrar: não responde o passado
      const texto = norm(m.texto);
      if (!ehPergunta(texto) || texto.length < 8 || texto.length > 300) return;
      const idi = ['pt', 'en', 'es'].includes(m.idioma) ? m.idioma : 'pt';
      const r = (await respostaEvo(texto, idi)) || respostaBase(texto, idi);
      const pergunta = String(m.texto).slice(0, 200);
      if (!r) { anotar({ acao: 'sem resposta', de, idi, pergunta }); return; }
      if (r.pulou) { anotar({ acao: 'pulou', motivo: r.pulou, de, idi, pergunta }); return; }
      const nao = porQueNao(nick, r.id);
      if (nao) { anotar({ acao: 'pulou', motivo: nao, de, idi, pergunta, faq: r.id }); return; }
      if (st.pendente) { anotar({ acao: 'pulou', motivo: 'já tem outra na espera', de, idi, pergunta, faq: r.id }); return; }
      const pend = { nick, de, ts, idi, pergunta, r, outros: false };
      st.pendente = pend;
      setTimeout(() => {
        st.pendente = null;
        if (pend.outros) { anotar({ acao: 'pulou', motivo: 'outra pessoa falou antes (talvez já respondeu)', de, idi, pergunta, faq: r.id }); return; }
        const nao2 = porQueNao(nick, r.id);
        if (nao2) { anotar({ acao: 'pulou', motivo: nao2, de, idi, pergunta, faq: r.id }); return; }
        const texto2 = `@${de} ${r.txt}`.slice(0, 240);
        const ok = PIH.pedir({ t: 'chat.send', canal: 'duvidas', idioma: idi, texto: texto2 }, 'duvidas');
        if (!ok.ok) { anotar({ acao: 'pulou', motivo: `o gancho recusou: ${ok.motivo}`, de, idi, pergunta, faq: r.id }); return; }
        const n = Date.now();
        st.ultimaEm = n; st.porNick.set(nick, n); st.porResposta.set(r.id, n);
        anotar({ acao: 'respondi', de, idi, pergunta, faq: r.id, resposta: texto2 });
      }, ESPERA_MS);
    } catch (e) { console.warn('[piloto] teste-duvidas:', e); }
  });

  // ---- a aba Dúvidas ----------------------------------------------------------------------------
  // 1.36.2 (pedido do André): na tela, só o que o Piloto respondeu — a pergunta e a resposta. O
  // registro inteiro (sem resposta, puladas) continua guardado por dentro para a base crescer.
  const esc = K.esc;
  const quando = (t) => {
    const d = new Date(t); const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  function html(modo) {
    const trava = modo === 'desligado';
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const deHoje = log.filter((x) => x.em >= hoje.getTime());
    const conta = (a, l = deHoje) => l.filter((x) => x.acao === a).length;
    const respostas = log.filter((x) => x.acao === 'respondi');
    const cards = respostas.slice(0, 60).map((x) => {
      const resp = String(x.resposta || '').replace(/^@\S+\s*/, '');
      return `<div class="plt-tdu-qa">
        <div class="plt-tdu-q"><span class="plt-tdu-nick">${esc(x.de || '')}</span><span class="plt-tdu-h">${quando(x.em)}</span><p>${esc(x.pergunta || '')}</p></div>
        <div class="plt-tdu-ans"><span class="plt-tdu-eu">Piloto</span><p>${esc(resp)}</p></div>
      </div>`;
    }).join('');
    return `${K.grupo('Dúvidas do chat')}
      ${K.linha({ id: 'teste-duvidas', icone: 'duvidas', nome: 'Responder no Dúvidas', alvo: 'teste:ligado', on: cfg.ligado, trava,
    status: `hoje: ${conta('respondi')} respondidas · ${conta('pulou')} puladas · ${conta('sem resposta')} sem resposta · ${BASE.length} respostas na base`,
    dica: 'Desligado de fábrica. Ligado, responde sozinho no canal Dúvidas quando uma resposta da base (tirada da Pokepédia do jogo e dos módulos dele) bate com certeza. Espera 20 s e não responde se alguém já falou; no máximo 1 a cada 5 min, a mesma pessoa a cada 30 min. Aqui aparecem só as respostas; o resto fica guardado para a base crescer.' })}
      <div class="plt-tdu">${cards || '<p class="plt-tdu-vazio">Nenhuma resposta ainda. Quando o Piloto responder alguém no canal Dúvidas, a pergunta e a resposta aparecem aqui.</p>'}</div>`;
  }
  function definir(caminho, v) {
    if (caminho !== 'ligado') return;
    cfg.ligado = !!v;
    gravarJ(CHAVE, cfg);
    anotar({ acao: cfg.ligado ? 'ligado' : 'desligado' });
  }

  PIH.duvidas = PIH.testeDuvidas = { html, definir, _interno: { respostaBase, respostaEvo, ehPergunta, norm, st, log, BASE } };
})(globalThis);
