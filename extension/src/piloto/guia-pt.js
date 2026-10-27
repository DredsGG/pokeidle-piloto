// Textos do guia de primeiro uso e das novidades (regra 12 do hub) — PORTUGUÊS.
// A cada versão nova: acrescente a entrada em `novidades` nos três arquivos (pt, en, es), em frases
// curtas, do ponto de vista de quem usa. Só a versão atual aparece no quadro.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).pt = {
    ui: {
      comoUsar: 'Como usar o Piloto', pular: 'Pular', voltar: 'Voltar', proximo: 'Próximo', entendi: 'Entendi', fechar: 'Fechar (Esc)',
      passo: 'Passo {n} de {t}', novidades: 'Novidades da v{v}', verGuia: 'Ver o guia',
    },
    tutorial: [
      { t: 'Bem-vindo ao Piloto', x: 'O Piloto joga por você aqui dentro do PokeIdle: escolhe a melhor hunt, repõe bolas e poções, cuida do time e do Mercado. Gasta só ouro e sempre dentro do Cofre; Gema e diamante, nunca.' },
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
