# Testes do PokeIdle Piloto

Todos os caminhos são relativos a esta pasta. Requer Node 22.

- `teste-piloto.mjs` — roda os scripts do mundo MAIN (gancho, cofre, hunt, rotina, Pokébola automática) num navegador falso com WebSocket simulado: `node teste-piloto.mjs` (tem que dar **TUDO PASSOU**).
- `e2e.mjs` — carrega a extensão de verdade num Chromium (Playwright) numa imitação do pokeidle.io (`fake/`): compra e revenda do Radar, cofre, os modos Off/Manual/Auto, idiomas e tema. `npm i playwright` antes.
- `arte.mjs` — os avisos com o sprite animado do pokémon e o ícone do item (sprites sintéticos em `fake/assets`).
- `bola.mjs` — a Pokébola automática: lança num corpo caído e fica travada com VIP.
- `janela.mjs` — a janela do Piloto fica por cima do jogo (`position: fixed`), sem esticar a página.
- `idioma-scan.mjs` — lista os textos que ficaram sem tradução em EN/ES.
- `stub/` e `fake/` — módulos `shared/` mínimos e dados de teste (não são o jogo).
