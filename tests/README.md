# Testes do PokeIdle Piloto

Todos os caminhos são relativos a esta pasta. Requer Node 22.

- `teste-piloto.mjs` — roda os scripts do mundo MAIN (gancho, cofre, hunt, rotina, Pokébola automática, divisão do reabastecimento, vigia do Centro) num navegador falso com WebSocket simulado: `node teste-piloto.mjs` (tem que dar **TUDO PASSOU**, 28 casos).
- `e2e.mjs` — carrega a extensão de verdade num Chromium (Playwright) numa imitação do pokeidle.io (`fake/`): compra e revenda do Radar, cofre, os modos Off/Manual/Auto, idiomas e tema. `npm i playwright` antes.
- `arte.mjs` — os avisos com o sprite animado do pokémon e o ícone do item (sprites sintéticos em `fake/assets`).
- `bola.mjs` — a Pokébola automática: lança num corpo caído e fica travada com VIP.
- `janela.mjs` — a janela do Piloto fica por cima do jogo (`position: fixed`), sem esticar a página.
- `centro.mjs`, `hunt.mjs`, `trava.mjs` — fila do Centro Pokémon, troca de hunt (com os retratos e o rodízio/Outland na aba Caçar) e travas da janela.
- `time.mjs` — time único (campo + PvP), troca do time no Centro na ordem do jogo, rodízio por turno pelo Centro e o cartão ⏱ no painel Equipe do jogo.
- `meta.mjs` — meta do Ranked (ladder + perfis), marcadores do dia, janela de perfil escondida e ordem do PvP (o mais forte abre).
- `metacaca.mjs` — caçar o meta: escolhe a hunt, guarda a captura, monta o time.
- `pedra.mjs` — compra uma pedra de evolução do time no mercado, só em ouro, sem repetir.
- `plateia.mjs` — abre as salas da Plateia uma vez por sessão e a faixa no bônus da Twitch/Kick, com e sem a Plateia.
- `vendapk.mjs`, `teste-vendapk.cjs`, `teste-compra-pk.cjs` — anúncio automático de pokémon e regras de preço.
- `volta.mjs` — recarrega depois de 5 min parado e espera outra aba.
- `saude.mjs` — checagem dos módulos do jogo e assinatura clicável.
- `suporte.mjs` — Relatar bug e Procurar atualização.
- `idioma-scan.mjs` — lista os textos que ficaram sem tradução em EN/ES.
- `navegadores.mjs` — o fundo como service worker (Chromium) e como página de eventos (Firefox), o manifest único, o arquivo certo do Release em cada navegador e o aviso de permissão no Firefox.
- `guia.mjs` — o guia de primeiro uso (instalação nova) e as Novidades (uma vez por versão), Esc e X.
- `kit.mjs` — a bola, a poção e o revive escolhidos pela conta e o gancho aceitando só isso.
- `so-meta.mjs` — só os do meta entram no time; a comp que o time segue muda depois de 24 h.
- `outland-meta.mjs` — pokémon da Outland não contam para o meta e as hunts da Outland ficam de fora.
- `sessao-dias.mjs` — o quadradinho dos dias no TEMPO da Sessão do jogo.
- `docs-prints.mjs` — gera os prints de `../docs` (jogo falso, sprites provisórios, nenhuma conta real).
- `stub/` e `fake/` — módulos `shared/` mínimos e dados de teste (não são o jogo).
