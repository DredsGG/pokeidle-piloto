// Textos do guia de primeiro uso e das novidades (regra 12 do hub) — PORTUGUÊS.
// A cada versão nova: acrescente a entrada em `novidades` nos três arquivos (pt, en, es), em frases
// curtas, do ponto de vista de quem usa. Só a versão atual aparece no quadro.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).pt = {
    ui: {
      comoUsar: 'Como usar o Piloto', pular: 'Pular', voltar: 'Voltar', proximo: 'Próximo', entendi: 'Entendi', fechar: 'Fechar (Esc)',
      passo: 'Passo {n} de {t}', novidades: 'Novidades da v{v}', verGuia: 'Ver o guia', eMais: 'e mais {n} — a lista completa está no GitHub',
      versaoUrgente: 'Atualização urgente v{v}', urgentePausado: 'O Piloto está pausado até você atualizar.', novaVersao: 'Nova versão v{v}', voceTem: 'Você está na v{v}. O que mudou:', atualizar: 'Atualizar', verNoGithub: 'Ver no GitHub',
      updMsg: {
        aplicando: 'Atualizando…',
        baixado: 'O zip novo foi baixado (pasta Downloads). Extraia por cima da pasta do Piloto: em até 1 min ele se recarrega sozinho e as abas do jogo recarregam.',
        firefox: 'O Firefox vai perguntar se quer instalar a versão nova: clique em Adicionar. As abas do jogo recarregam sozinhas.',
        'firefox-temporario': 'O zip novo foi baixado. Em about:debugging, remova o Piloto e carregue o zip novo em "Carregar extensão temporária".',
        loja: 'O navegador ainda não liberou a versão nova: tente de novo daqui a pouco.',
        erro: 'Não deu para atualizar agora. Tente de novo pelo botão Procurar atualização, no painel.',
      },
    },
    tutorial: [
      { t: 'Bem-vindo ao Piloto', x: 'O Piloto joga por você aqui dentro do PokeIdle: escolhe a melhor hunt, repõe bolas e poções, cuida do time e do Mercado. Gasta só ouro e sempre dentro do Cofre; Gema e diamante, nunca. O botão Piloto fica logo acima do seu pokémon em campo: é por ele que o painel abre.' },
      { t: 'Off, Manual e Auto', x: 'Lá em cima fica o modo. Off: nada roda. Manual: você liga e ajusta cada automação. Auto: o Piloto liga tudo e calcula os números; cada linha continua com o seu ON/OFF. Emergência: Alt+Shift+P põe tudo em Off na hora, de qualquer aba do navegador.' },
      { t: 'O Cofre manda no gasto', x: 'Antes de ligar, abra a aba Cofre e confira a reserva (o ouro que nunca é gasto) e o teto do dia. Toda compra do Piloto passa por ele.' },
      { t: 'As abas', x: 'Caçar: troca de hunt, reposição e rodízio do time. Nível: quando cada um sobe. Rotina: Passe, XP Share, PvP e Depot. Mercado: o Radar avisa, compra e revende em ouro.' },
      { t: 'O time no painel do jogo', x: 'No painel Equipe do jogo aparecem o botão do Time (o time do campo e do PvP, e o meta do Ranqueado) e o ⏱ de cada pokémon, com o turno e a fila do rodízio.' },
      { t: 'Ajuda sempre à mão', x: 'O ? de cada linha explica o que ela faz. Embaixo do menu ficam Relatar bug, Procurar atualização e o idioma. Este guia volta no botão ? lá em cima.' },
    ],
    novidades: {
      '1.31.1': [
        "Corrigido: o Ancient Pupitar (e as outras variantes da Outland) não conta mais como \"já tinha\" no Caçar o meta — elas não evoluem.",
      ],
      '1.47.0': [
        "Novo Modo farm (aba Caçar): o Piloto calcula qual pokémon rende mais XP no seu nível, de treinador e do próprio pokémon, e farma com ele sem parar. Se você não tem, ele captura um, que entra na hora e evolui sozinho até o escolhido. Recalcula 1x por dia e quando abre hunt nova.",
      ],
      '1.46.0': [
        "Conta pequena agora usa o Automático: a reposição (bola, poção e revive) ficou fora do teto do dia, porque no começo do jogo quase todo o ouro vai para item. Sempre sobram pelo menos 10% do saldo, e o Diário avisa se a reposição passar do teto. O Mercado continua com a reserva.",
      ],
      '1.45.0': [
        "Caçar o meta ganhou a opção \"Só aceitar um bom\" (desligada de fábrica): o Piloto fica em cada alvo até capturar um com a nota do jogo acima do corte que você escolher (3,5+, 4,0+ ou 5,0+; shiny e P5 passam sempre) e só então vai para o próximo.",
      ],
      '1.44.0': [
        "O Piloto agora percebe sozinho quando o PokeIdle publica versão nova do jogo (confere a cada 30 min e quando você volta para a aba) e mostra no meio da tela \"O PokeIdle atualizou o jogo, dê F5\", com o botão para recarregar.",
      ],
      '1.43.1': [
        "Corrigido: a poção e o revive custavam bem mais na loja do jogo do que o Piloto contava, então o Cofre deixava gastar muito além do teto. Agora a conta usa o preço que a loja cobra, e a escolha da poção e as quantidades também.",
        "Corrigido: pokémon do time que não luta com segurança em nenhuma hunt (um Magikarp, por exemplo) fica fora do rodízio, em vez de entrar e ficar morrendo.",
      ],
      '1.43.0': [
        "Atualizar o time pelo meta ganhou \"Fazer sozinho\" (janela Time, aba Meta): quando a diferença para o meta fica 30 min sem mudar, o Piloto atualiza o time sozinho; se faltar pokémon do meta, liga o Caçar o meta sozinho e, depois da caça, troca o time no Centro e religa a Troca de hunt e o rodízio.",
      ],
      '1.42.0': [
        "PvP: a \"Tela de batalha\" do jogo fica sempre em Minimizada (linha nova na aba Rotina). Se você escolher \"Não mostrar\", fica como escolheu.",
      ],
      '1.41.0': [
        "Melhorar o time (aba Caçar): caça a família de cada pokémon do time, até 1 h por pokémon, atrás de um exemplar com mais Poder no seu nível máximo. O melhor fica na Coleção, treina no XP Share e entra no time quando passar o atual.",
        "Completar a Pokédex (aba Caçar): caça as espécies que você nunca capturou, indo à hunt segura com mais delas por hora. Só um modo de caça anda por vez; no fim, a Troca de hunt e o rodízio voltam.",
      ],
      '1.40.0': [
        "Manter o PC acordado (aba Caçar): com o jogo aberto e o Piloto em Manual ou Auto, o computador não entra em suspensão; a tela pode apagar normalmente. Não funciona no Firefox. E quando o \"Voltar sozinho\" recarrega o jogo que caiu, chega uma notificação.",
      ],
      '1.39.0': [
        "Avisos de achados (aba Rotina): shiny no campo, shiny capturado, captura P5 e drop raro (Boss Token, fragmentos, peças de TM, tickets). Com o jogo à vista, um cartãozinho no canto; com ele escondido, a notificação do sistema. A linha mostra o que caiu hoje.",
      ],
      '1.38.0': [
        "Parada de emergência: Alt+Shift+P põe o Piloto em Off na hora, de qualquer aba do navegador. Um quadro confirma e tem o botão para voltar ao modo de antes. A tecla pode ser trocada em chrome://extensions/shortcuts.",
      ],
      '1.37.1': [
        'Time: um pokémon de fora do meta não prende mais a vaga. Se você pegar outro de fora do meta com mais Poder, ele entra no lugar do mais fraco. Os do meta continuam com prioridade.',
      ],
      '1.37.0': [
        "Nova aba Dúvidas: o Piloto pode responder sozinho perguntas no canal Dúvidas do chat, com 53 respostas tiradas da Pokepédia do jogo. Vem desligado; ligue na aba se quiser. Ele espera 20 s, não responde se alguém já ajudou e fala no máximo 1 vez a cada 5 min.",
      ],
      '1.36.2': [
        "Evoluir: a pedra do time agora usa a mesma reserva das poções (e não os 5 mi do Mercado), então conta com pouco ouro também compra a pedra — sem passar de metade do ouro livre, para a poção não faltar.",
        "PvP ao vivo: o nome de cada treinador numa etiqueta azul (você) ou vermelha (o adversário) e cada pokémon num quadradinho claro — sem o fundo escuro atrás.",
      ],
      '1.36.1': [
        "Reposição: revive e poção vêm sempre antes da bola, e a bola só usa o ouro que sobra depois de garantir a próxima reposição de poção — conta com pouco ouro não fica mais sem poção.",
        "Reposição: quando a poção (ou bola, ou revive) escolhida muda, o Piloto troca e compra na hora, em vez de passar até 40 min sem comprar nenhuma das duas; e não desce para uma poção mais fraca só porque acabou de gastar.",
        "Evoluir: se o cofre não libera ouro para a pedra (conta com pouco ouro), tenta de novo em 30 min, sem ficar insistindo.",
      ],
      '1.36.0': [
        "Evoluir: o time evolui na hora em que chega no nível — qualquer pokémon, o inicial também. Sem a pedra, o Piloto compra na hora no Mercado (em ouro) e ela nunca vai para a revenda.",
        "Evoluir: corrigido o que travava a evolução — a leitura da pedra perdia a vez para o Radar, a segunda pedra do mesmo vendedor era recusada e um comando perdido segurava o pokémon por 24 h.",
        "Plateia: opção \"Reabrir se fechar\" — se a janela da Twitch ou da Kick fechar ou for descartada da memória, o Piloto reabre em até 1 min.",
        "PvP ao vivo: os 6 de cada lado aparecem desde o começo, numa lista vertical em cada canto — moldura em quem está lutando, apagando conforme perde HP e cinza quando cai.",
      ],
      '1.35.0': [
        "Aba Meta da janela Time: botão \"Atualizar time\" — troca já para o meta de agora (no Centro), mostra quem entra, quem sai e o que falta caçar; \"Caçar os que faltam\" só quando você clica.",
        "Nova aba Extrato: o que você gastou e o que entrou, com o ícone do item ou o pokémon, quando e há quanto tempo; totais de hoje, 7 e 30 dias.",
        "PvP ao vivo: na janelinha e na tela cheia da partida, o nome de cada treinador e os pokémon dele nos cantos — apagando conforme perdem HP e cinza quando caem.",
      ],
      '1.34.1': [
        "Coleção: o pokémon que o Auto Coleção guardou abaixo do Nv 50 (o Mercado só aceita a partir dele) e que não serve para o time, o PvP ou o meta volta para o Depot e é vendido, em vez de ficar parado.",
        "A versão do Piloto aparece, discreta, ao lado do nome na barra do Em campo.",
        "Botão Time: fica dourado, com um ponto vermelho, quando o meta muda e você ainda não viu; abrir já mostra a aba Meta.",
        "Ao lado do seu rank aparece o resultado da última ranqueada: ▲ os PR que ganhou ou ▼ os que perdeu.",
        "Passe de Batalha: quando o Piloto recolhe o prêmio do dia, ele mesmo fecha o \"Incrível!\" e a janela do Passe.",
        "Compra automática que não saiu porque a conexão do jogo caiu tenta de novo sozinha quando a conexão volta.",
      ],
      '1.34.0': [
        "Versão nova: o Piloto procura sozinho ao abrir o jogo, a cada 30 min e quando você volta para a aba, e mostra o aviso na hora, sem recarregar. O X só adia por 1 h; atualização urgente pausa o Piloto até você atualizar.",
        "Modo Manual: aba Alvos no Mercado — para cada item, o teto em ouro e quantas unidades comprar; o Radar compra sozinho quando aparece no teto ou abaixo. Também alvos de pokémon em ouro (P5 e nota mínima).",
        "Modo Manual: com \"Calcular os limites sozinho\" desligado, os limites do Mercado viram campos para você digitar, e o F5 não desfaz mais o que você ajustou.",
        "Reposição: o revive, a poção ou a bola que a conta escolheu volta a ser comprado quando acaba, mesmo que o jogo o desmarque por estar zerado.",
        "Rodízio: se o turno acaba durante uma ida ao Centro (reposição, por exemplo), a troca acontece nessa mesma viagem, sem voltar antes para a hunt.",
      ],
      '1.33.9': [
        "Revenda automática: o que você compra à mão (no Mercado, com clique no Radar ou pokémon) nunca é anunciado sozinho; só entra na revenda o que veio sozinho (drop ou compra automática do Radar).",
        "A pedra que o time vai gastar para evoluir fica fora da revenda enquanto ele precisar dela.",
      ],
      '1.33.7': [
        "Em campo: um \"+N\" dourado ao lado do nível mostra quantos níveis o pokémon subiu neste turno do rodízio (só aparece se subiu; recomeça quando ele volta).",
      ],
      '1.33.6': [
        "As novidades mostram só o que mudou desde a última versão que você viu (no máximo 6 linhas).",
      ],
      '1.33.5': [
        "Evolução automática: a pedra que o Radar compra para o time não vai mais para a revenda (antes o pokémon ficava esperando e o Radar comprava outra a cada 30 min); se o Radar já tem a pedra no estoque, usa uma de lá.",
      ],
      '1.33.4': [
        "Rodízio: quando a hunt nunca dá uma brecha de combate (o pokémon fraco não para de apanhar), em 2 min o próximo da fila entra ali mesmo, limpa a hunt e segue para o Centro e a melhor hunt dele. A ordem não muda.",
        "Se o próximo da fila não aguenta aquela hunt, o mais forte do time entra só para limpar; não conta como turno nem perde o lugar na fila.",
        "Sem VIP: a pokébola automática continua lançando com a janela minimizada (o Chrome freava o relógio para uma vez por minuto).",
      ],
      '1.33.3': [
        "A compra automática do Mercado agora vai pelo seu dinheiro: compra o que dá lucro enquanto o estoque do radar mais a compra não passar de metade do que você tem; vendeu, libera de novo. Saiu do teto do dia.",
        "Quando o jogo avisa \"Devagar aí — muitas mensagens\", o radar e o Piloto diminuem o ritmo sozinhos e voltam a subir aos poucos.",
        "A bola leva em conta o saldo: conta com muito ouro usa a Ultra Ball mesmo enquanto sobe um pokémon fraco.",
      ],
      '1.33.0': [
        "Reposição para conta nova: o Piloto marca uma bola, uma poção e um revive na hora e compra o primeiro lote assim que tiver o ouro (guarda só 10% do saldo).",
        "As quantidades da reposição vêm do que a sua conta gasta de verdade (mínimo de 1 h, alvo de 6 h), e a poção é a de menor ouro por HP que cura.",
        "Aba Caçar: o ouro/h já desconta as poções, e hunt em que os desmaios levam mais XP do que dão fica marcada como risco.",
        "Caçar o meta não pula mais ninguém: testa cada pokémon do time e, sem hunt segura, espera farmando XP até o treinador subir de nível.",
      ],
      '1.32.3': [
        "A Plateia também não abre sala repetida depois de atualizar o Piloto ou com a escala do Windows (adota a janela que já está aberta).",
        "Aba Caçar: hunt em que o pokémon morre antes de terminar um abate sai do ranking (ex.: Larvitar Nv 20 na Ledyba Nv 230), e com \"Evitar risco\" as arriscadas ficam depois das seguras.",
        "Na primeira vez, o Piloto já abre no idioma do navegador (português, inglês ou espanhol); o seletor PT · EN · ES continua no painel.",
        "Versão nova, novidades e o guia aparecem sozinhos no meio da tela do jogo, sem abrir o painel. O X ou o Esc fecham.",
        "As salas da Plateia não abrem de novo quando o jogo ou a extensão reinicia: só abre a que estiver faltando.",
        "O rodízio religado começa pelo pokémon mais fraco e deixa o mais forte por último.",
        "Caçar o meta desliga também o rodízio do time; ele volta junto com a Troca de hunt.",
        "Torneios: o Piloto inscreve você sozinho no Mundial, no Amador e no Showdown assim que as inscrições abrem (aba Rotina).",
      ],
      '1.31.0': [
        'Agora funciona também no Edge, no Brave, no Opera GX e no Firefox.',
        'Modo Manual liberado: você liga e ajusta cada automação.',
        'Rodízio do time por turno: no Manual você escolhe quanto dura o turno.',
        'O TEMPO da Sessão do jogo ganhou um quadradinho com os dias.',
        'Caçar o meta não vai mais para a Outland: os pokémon de lá não evoluem.',
        'Este guia de primeiro uso e o quadro de novidades (botão ? lá em cima).',
        "Reposição escolhe sozinha uma bola, uma poção e um revive pela sua conta e troca conforme ela sobe.",
        "O time só recebe pokémon do meta; o meta que o time segue só muda depois de 24 h.",
      ],
    },
  };
})(globalThis);
