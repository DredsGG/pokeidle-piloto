# Testes do PokeIdle Piloto

- `teste-piloto.mjs`: roda os scripts do mundo MAIN (hook, cofre, hunt, rotina) num navegador falso com WebSocket simulado. Requer Node 22: `node teste-piloto.mjs`. Ajuste a constante RAIZ para a pasta `unificada/src`.
- `e2e.mjs`: carrega a extensão de verdade num Chromium (Playwright) numa imitação do pokeidle.io (`fake/`). Ajuste os caminhos EXT/FAKE e o require do Playwright.
- `stub/` e `fake/`: módulos `shared/` mínimos e dados de teste (não são o jogo).
