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
      novaVersao: 'Nova versão v{v}', voceTem: 'Você está na v{v}. O que mudou:', atualizar: 'Atualizar', verNoGithub: 'Ver no GitHub',
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
      { t: 'Off, Manual e Auto', x: 'Lá em cima fica o modo. Off: nada roda. Manual: você liga e ajusta cada automação. Auto: o Piloto liga tudo e calcula os números; cada linha continua com o seu ON/OFF.' },
      { t: 'O Cofre manda no gasto', x: 'Antes de ligar, abra a aba Cofre e confira a reserva (o ouro que nunca é gasto) e o teto do dia. Toda compra do Piloto passa por ele.' },
      { t: 'As abas', x: 'Caçar: troca de hunt, reposição e rodízio do time. Nível: quando cada um sobe. Rotina: Passe, XP Share, PvP e Depot. Mercado: o Radar avisa, compra e revende em ouro.' },
      { t: 'O time no painel do jogo', x: 'No painel Equipe do jogo aparecem o botão do Time (o time do campo e do PvP, e o meta do Ranqueado) e o ⏱ de cada pokémon, com o turno e a fila do rodízio.' },
      { t: 'Ajuda sempre à mão', x: 'O ? de cada linha explica o que ela faz. Embaixo do menu ficam Relatar bug, Procurar atualização e o idioma. Este guia volta no botão ? lá em cima.' },
    ],
    novidades: {
      '1.31.1': [
        "Corrigido: o Ancient Pupitar (e as outras variantes da Outland) não conta mais como \"já tinha\" no Caçar o meta — elas não evoluem.",
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
