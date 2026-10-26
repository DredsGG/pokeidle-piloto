# Testes do PokeIdle Piloto

Todos os caminhos são relativos a esta pasta. Requer Node 22.

- `teste-piloto.mjs` — roda os scripts do mundo MAIN (gancho, cofre, hunt, rotina, Pokébola automática) num navegador falso com WebSocket simulado: `node teste-piloto.mjs` (tem que dar **TUDO PASSOU**).
- `e2e.mjs` — carrega a extensão de verdade num Chromium (Playwright) numa imitação do pokeidle.io (`fake/`): compra e revenda do Radar, cofre, os modos Off/Manual/Auto, idiomas e tema. `npm i playwright` antes.
- `arte.mjs` — os avisos com o sprite animado do pokémon e o ícone do item (sprites sintéticos em `fake/assets`).
- `bola.mjs` — a Pokébola automática: lança num corpo caído e fica travada com VIP.
- `janela.mjs` — a janela do Piloto fica por cima do jogo (`position: fixed`), sem esticar a página.
- `centro.mjs`, `hunt.mjs`, `trava.mjs` — fila do Centro Pokémon, troca de hunt e travas da janela.
- `time.mjs` — time único (campo + PvP), lista travada e rodízio de hora em hora.
- `meta.mjs` — meta do Ranked (ladder + perfis), marcadores do dia e janela de perfil escondida.
- `metacaca.mjs` — caçar o meta: escolhe a hunt, guarda a captura, monta o time.
- `vendapk.mjs`, `teste-vendapk.cjs`, `teste-compra-pk.cjs` — anúncio automático de pokémon e regras de preço.
- `volta.mjs` — recarrega depois de 5 min parado e espera outra aba.
- `saude.mjs` — checagem dos módulos do jogo e assinatura clicável.
- `suporte.mjs` — Relatar bug e Procurar atualização.
- `idioma-scan.mjs` — lista os textos que ficaram sem tradução em EN/ES.
- `stub/` e `fake/` — módulos `shared/` mínimos e dados de teste (não são o jogo).
