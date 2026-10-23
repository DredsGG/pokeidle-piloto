<div align="center">

<img src="extension/icons/icon-128.png" width="96" alt="PokeIdle Piloto icon">

# PokeIdle Piloto

**An autopilot for [pokeidle.io](https://pokeidle.io) with a budget vault in front of every gold coin it spends.**
Market radar, hunt optimizer and daily routine in one Chrome extension, built so it can't touch premium currency.

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-1.15.1-e53935)
![Tests](https://img.shields.io/badge/tests-22%2F22%20passing-2e7d32)

</div>

---

## What it does

Everything lives inside the game, behind a **Piloto** bar above your active Pokémon, with a single **Off · Manual · Automatic** switch.

The panel is built from the game's own window pieces (the same frame, menu, rows, ON/OFF switches and buttons as the game's Settings window), so it looks like part of pokeidle.io. Each tab changes with the mode:

- **Off:** everything greyed out and locked.
- **Manual:** every automation with all its settings.
- **Automatic:** as clean as possible, just one switch per automation. A switch you turn off stays off after a reload.

<p align="center">
  <img src="docs/hunt-auto.png" width="32%" alt="Hunt tab in Automatic mode">
  <img src="docs/routine-manual.png" width="32%" alt="Routine tab in Manual mode">
  <img src="docs/market-auto.png" width="32%" alt="Market tab in Automatic mode">
</p>

- **Market radar.** Scans the community market, flags items and Pokémon priced well below their recent sales, and can buy them automatically in gold. Bought items can be **resold automatically**: one action every 10 min (list or lower the price), never below cost + 15%.
- **Hunt optimizer.** Ranks hunting spots by real gold/hour, switches hunts, restocks potions and revives at the buy price, within the budget.
- **Pokémon Center queue.** Two buttons right next to the game's own "Go to Pokémon Center", which stays locked while your Pokémon is fighting. **Queue** (clock): press once and the Piloto clicks the game's own button at the first gap, in any mode, even Off. **Return** (U-turn): at the first gap it goes to the Center, heals and comes back to the same hunt. It never presses "Give up the fight", and if a hunt has no gap for over 2 minutes the button turns orange to tell you.
- **Auto Poké Ball for accounts without VIP.** Throws one ball at each fainted wild Pokémon, the same message the game sends when you click it in the "Nearby to catch" list. It never goes faster than the VIP auto-throw (one ball every 1.3 s or more), shinies come first, and it only uses balls bought with gold (never Beast Ball). It is on by default without VIP, and locked while VIP is active, because then the game throws by itself. Note that the game treats auto-throwing as a VIP benefit.
- **Deal alerts with the game's own art:** the Pokémon's animated sprite (same atlas and frame timing as the game) and the item icon at a crisp integer scale.
- **Daily routine (free actions):** battle pass claims, XP Share (puts the furthest-behind team members in empty slots), highest unlocked Outland tier, training rotation and a PvP team made of your 5 strongest by Power, without reshuffling over tiny differences.
- **Irreversible actions are opt-in:** evolving (never shiny, Outland or Mega), hatching eggs you own, and clearing the Depot. Before selling the Depot it first moves your PvP team, shinies and top-potential Pokémon into the Collection.

## The vault (`cofre`): the part I'm proudest of

An automation that spends in-game money needs hard limits more than features. Every gold purchase goes through the vault:

- **Reserve:** never goes below max(5M, 2 h of measured gold/h).
- **Daily cap:** 50% of gold/h × 24 h (a fixed 2M until there's a measurement), reset at 00:00 Brasília time, plus per-category caps (restock, market, eggs; eggs start **forbidden**).
- **Unknown price = no purchase.** Gold already committed to pending orders counts against the reserve, so back-to-back orders can't break through it.
- **Circuit breaker:** 3 server refusals in a row turn that module off (auto re-arms after 30 min).
- **A journal** of every action, readable in the panel.

And under the vault, the WebSocket hook itself enforces:

- **Closed command list.** The pilot can send only 18 game commands, each validated against the game's own format. Anything else is dropped. A ball throw is accepted only for a gold-priced ball you own, on a body still on the ground, and never less than 1.2 s after the previous one.
- **Absolute block on 20 commands:** gem withdrawal, diamond shop, VIP pass, guild donation, sending coins or trades, chat and DMs, and guild or Pokémon-level changes. Purchases only in `gold`; a gem purchase is refused at the hook.
- **Hardened against the page:** the allow-list only accepts own keys (`Object.hasOwn`), requests are copied and frozen, and the command type and block list are checked again right before sending. Tests try to swap the vault, forge state and rewrite the send function from the page, and they fail.
- **One rate limiter for everything:** reads ~2/s, writes 1/s with a burst of 3.

## Architecture

```mermaid
flowchart TB
  WS(("game WebSocket"))
  subgraph MAIN["pokeidle.io · MAIN world"]
    H["hook.js<br/>single WS hook · state rebuilt from the game's own deltas<br/>closed command list · absolute blocks · rate limiter"]
    C["piloto/cofre.js<br/>reserve · daily cap · categories · circuit breaker · journal"]
    RA["radar.js · revenda.js<br/>market scan · auto-buy · auto-resell"]
    HU["hunt/*<br/>gold/h engine · hunt switch · restock"]
    RO["piloto/rotina.js · piloto/captura.js<br/>pass · XP Share · Outland · PvP · evolve · eggs · Depot · auto ball"]
    UI["painel.js · tela.js<br/>in-game panel (PT/EN/ES, light/dark)"]
  end
  SW["sw.js · service worker<br/>notifications · alerts DB"]
  RA & HU & RO -->|requests| C -->|approved| H <--> WS
  H -->|state| RA & HU & RO & UI
  UI <--> SW
```

No build step: plain JavaScript modules, Manifest V3.

## Install

1. Download **pokeidle-piloto-vX.Y.Z.zip** from the [latest release](https://github.com/DredsGG/pokeidle-piloto/releases/latest).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Drag the zip onto the page (or unzip it and use **Load unpacked**). From a clone of this repo, load the `extension/` folder.
4. Open the game. Everything starts **off**. Suggested order: check the reserve in the Vault tab → Routine (pass and XP Share cost nothing) → Automation (hunt and restock) → Radar options (buying and reselling).

Use a single game tab: each tab has its own vault.

## Tests

```bash
node tests/teste-piloto.mjs   # Node 22+: runs the MAIN-world scripts in a fake browser with a simulated WebSocket
node tests/e2e.mjs            # needs Playwright: loads the real extension in Chromium against a fake pokeidle.io (tests/fake)
node tests/bola.mjs           # auto Poké Ball: throws at a fainted Pokémon, locked with VIP
node tests/janela.mjs         # the Piloto window floats over the game without stretching the page
```

`teste-piloto.mjs` covers state rebuilding, real-money command blocks, the closed list, vault rules (unknown price, reserve, daily cap, committed gold), the rate limiter, page-side attacks, the circuit breaker, the routine commands, the Depot rules and the auto Poké Ball (gold balls only, shiny first, pacing, VIP lock): **22/22 passing**.

## Credits

Built on top of **Radar do Mercado** and **/hunt**, two extensions by **Allan Hert**, used and published with his permission. PokeIdle Piloto merges both into a single hook and adds the vault, the routine, auto-resell and the safety layer.

## Disclaimer

Fan-made personal project, not affiliated with pokeidle.io. Automating a game may go against its Terms of Service. Use it on your own account and at your own risk. Pokémon is a trademark of Nintendo / Creatures / GAME FREAK.

## License

Copyright © 2026 André Miller Fleck (Dreds) and Allan Hert. All rights reserved: the source is public for reading, not licensed for reuse.
