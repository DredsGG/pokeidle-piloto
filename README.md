<div align="center">

<img src="extension/icons/icon-128.png" width="96" alt="PokeIdle Piloto icon">

# PokeIdle Piloto

**An autopilot for [pokeidle.io](https://pokeidle.io) with a budget vault in front of every gold coin it spends.**
Hunt optimizer, market radar, team manager and daily routine in one Chrome extension, built so it can't touch premium currency.

![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Version](https://img.shields.io/badge/version-1.29.1-e53935)
![Tests](https://img.shields.io/badge/tests-28%2F28%20passing-2e7d32)

<img src="docs/hunt-tab.png" width="80%" alt="The Piloto window in Automatic mode, Hunt tab: hunt switching, restock, team rotation, Outland tier, automatic Poké Ball and auto-reload, above the ranking of the best hunts">

</div>

---

## What it is

Everything lives inside the game, behind a **Pilot** bar above your active Pokémon, in a window built from the game's own pieces (frame, menu, rows, ON/OFF switches). One switch runs it all:

- **Off:** nothing automatic runs.
- **Automatic:** turns on the hunt switch, restock, the daily routine, the team builder, the rotation and the market radar, each with its own ON/OFF switch. A switch you turn off stays off after a reload. Irreversible actions (evolving, hatching) stay off until you turn them on.
- **Manual** (every setting of every automation) is locked for now.

## Features

<p align="center">
  <img src="docs/routine-tab.png" width="32%" alt="Routine tab: daily pass, XP Share, Ranked PvP team and queue, evolve, hatchery, Auto Collection and Depot cleaning">
  <img src="docs/market-tab.png" width="32%" alt="Market tab: market radar, automatic buying and reselling, with a bought deal and a lost draw in the alerts">
  <img src="docs/vault-tab.png" width="32%" alt="Vault tab: reserve, today's cap, spent today and the per-category caps">
</p>

**Hunting**
- **Hunt switching.** Ranks every hunt for the Pokémon in the field by XP/h or gold/h (the /hunt model plus what you actually measured there) and always goes to the top one, waiting for a gap in combat.
- **Restock.** Buys the balls, potions and revives you ticked in the game's own automation, at the shop price and within the vault. With little gold it brings revives and potions to their minimum before any Poké Ball. Every Center trip heals, and a watchdog brings you back to your hunt if the character is left standing at the Center.
- **Pokémon Center queue.** Two buttons next to the game's "Go to Pokémon Center": **Queue** presses the game's button at the first gap in combat; **Return** goes, heals and comes back to the same hunt. It never presses "Give up the fight".
- **Automatic Poké Ball for accounts without VIP.** One gold ball at each fainted wild Pokémon, never faster than the VIP auto-throw (1.3 s), shinies first, never Beast Ball. Locked while VIP is active. Note that the game treats auto-throwing as a VIP benefit.
- **Comes back by itself.** If the game stops in the tab for 5 minutes (another device took the session, the server restarted), the Piloto reloads the page, waiting while another tab of the same Chrome is playing.

**Team**

<p align="center">
  <img src="docs/team-window.png" width="49%" alt="Team window: build the main team on its own and team rotation, with each team member's Power, XP/h, gold/h, PvP position and meta badge">
  <img src="docs/meta-tab.png" width="49%" alt="Meta tab: the Ranked meta comp of the top 20, with usage, Power, level and grade, and whether you own each species and have it on the team">
</p>

- **One team for the field and PvP.** The Team window builds it: your locked Pokémon first, then **the meta species you already own** (your best of each family; Megas count as their base form and a Pupitar counts for Tyranitar), then the strongest by Power. The same team goes to Ranked with the strongest opening. Team changes happen at the Pokémon Center: it pauses the hunt switch, heals, swaps everyone in the game's own order and goes back to the hunt.
- **Team rotation.** Each team member fights for one turn (60 min by default) and the one that has gone longest without fighting comes in next. With hunt switching on, the swap happens at the Center and the newcomer goes straight to its own best hunt.
- **Turn timer.** A ⏱ button on each row of the game's Team panel shows how long the active Pokémon has been fighting, the time left in its turn, the rotation queue with when each one comes in, and today's turns.
- **Meta tab.** Reads the Ranked ladder and the players' public profiles to show which species the top 20, or the players in your own bracket, are using, with daily ▲▼ changes and whether you own each one and have it on the team. When the meta shifts you get a small toast, never a pop-up.
- **Hunt the meta (opt-in).** Freezes the current meta comp, takes your strongest Pokémon to the hunt where those species spawn most, keeps the best catch of each family (including the ones you already had), protects them from any sale, then hands the team to the builder and turns the hunt switch back on.
- **Evolution stones for the team.** When a team member is ready to evolve by stone and you don't have it, the Radar buys **one** from the market (cheapest listing that isn't yours), in gold and through the vault, and the opt-in evolve step uses it.

<p align="center">
  <img src="docs/turn-card.png" width="30%" alt="Turn card from the game's Team panel: fighting time, time left in the turn, today's turns and the rotation queue">
</p>

**Market**
- **Market radar.** Scans the community market, flags items and Pokémon priced well below their recent sales, and can buy them automatically in gold.
- **Automatic resale.** Every 2 minutes it lists, lowers or raises one price, never below cost + 15%.
- **Automatic Pokémon listing.** Lists Pokémon you don't use at a price backed by 5+ similar sales, paying the market fee through the vault. Your team, locked and training Pokémon, held-item carriers, **shinies and legendaries are never listed**.
- **Deal alerts with the game's own art:** the Pokémon's animated sprite and the item icon at a crisp integer scale.

**Daily routine**
- Battle pass claims, XP Share (the furthest-behind team members in empty slots), highest unlocked Outland tier, Ranked queue, Auto Collection kept on Legendary · Shiny · P5+ · the market's minimum grade, and Depot cleaning (it first moves your team, shinies and top-potential Pokémon into the Collection).
- **Irreversible actions are opt-in:** evolving (never shiny, Outland or Mega) and hatching eggs you own.

**Live bonus with Plateia**

<p align="center">
  <img src="docs/plateia-banner.png" width="60%" alt="Banner on the game's Twitch bonus window: Farm this bonus with Plateia, with an Open the Twitch room button">
</p>

- If you also use [Plateia](https://github.com/DredsGG/plateia) (Twitch and Kick), opening the game opens its Twitch and/or Kick room in a separate window, once per Chrome session, for the platforms linked in your game account. The game's own Twitch/Kick bonus windows get an **Open the room** button, or a link to download Plateia if you don't have it.

**Support**

<p align="center">
  <img src="docs/bug-report.png" width="49%" alt="Report a bug card: what happened, what gets attached (nothing from your account), Open on GitHub and Copy">
</p>

- **Report bug** opens a GitHub issue pre-filled with a privacy-safe report (versions, modes, health check, recent journal; no nick, no balance). **Check for updates** reads the latest release. Both sit at the bottom of the menu, above the "made by **Dreds** · vX.Y.Z" signature.
- **Health check after every game update:** checks that the game modules and functions the Piloto relies on still exist, and reports what broke instead of failing silently.

## The vault (`cofre`): the part I'm proudest of

An automation that spends in-game money needs hard limits more than features. Every gold purchase goes through the vault:

- **Reserve:** never goes below max(5M, 2 h of measured gold/h).
- **Daily cap:** the larger of 50% of gold/h × 24 h (a fixed 10M until there's a measurement) and 15% of the balance above the reserve, reset at 00:00 Brasília time, plus per-category caps (restock, market, eggs; eggs start **forbidden**).
- **Unknown price = no purchase.** Gold already committed to pending orders counts against the reserve, so back-to-back orders can't break through it.
- **Circuit breaker:** 3 server refusals in a row turn that module off (auto re-arms after 30 min).
- **A journal** of every action, readable in the panel.

And under the vault, the WebSocket hook itself enforces:

- **Closed command list.** The pilot can send only 21 game commands, each validated against the game's own format. Anything else is dropped.
- **Absolute block on 20 commands:** gem withdrawal, diamond shop, VIP pass, guild donation, sending coins or trades, chat and DMs, and guild or Pokémon-level changes. Purchases only in `gold`; a gem purchase is refused at the hook.
- **Hardened against the page:** the allow-list only accepts own keys (`Object.hasOwn`), requests are copied and frozen, and the command type and block list are checked again right before sending. Tests try to swap the vault, forge state and rewrite the send function from the page, and they fail.
- **One rate limiter for everything:** reads ~2/s, writes 1/s with a burst of 3.

## Install

1. Download **pokeidle-piloto-vX.Y.Z.zip** from the [latest release](https://github.com/DredsGG/pokeidle-piloto/releases/latest).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Drag the zip onto the page (or unzip it and use **Load unpacked**). From a clone of this repo, load the `extension/` folder.
4. Open the game. The Piloto starts in **Off**: check the reserve in the Vault tab, then pick **Auto**.

Updates: **Check for updates** shows what changed and downloads the new zip; unzip it over the same folder and the Piloto reloads by itself within a minute.

## Languages

Portuguese, English and Spanish (flags at the bottom of the menu), with light and dark themes.

## Known limitations

- **Manual mode is locked** for now: Off or Automatic.
- **Use a single game tab.** Each tab has its own vault, and opening the game somewhere else takes the session from this tab (it reloads by itself after 5 minutes).
- **PvP order:** the strongest Pokémon opens. The game hides the entry order of other players' teams, so the Piloto doesn't copy anyone's order.
- **Ranked PvP** opens at trainer level 150.
- The Plateia integration needs the [Plateia](https://github.com/DredsGG/plateia) extension installed in the same Chrome.
- Settings, turns and the journal live in this browser's storage; another browser or profile starts from scratch.

## Architecture

```mermaid
flowchart TB
  WS(("game WebSocket"))
  subgraph MAIN["pokeidle.io · MAIN world"]
    H["hook.js<br/>single WS hook · state rebuilt from the game's own deltas<br/>closed command list · absolute blocks · rate limiter"]
    C["piloto/cofre.js<br/>reserve · daily cap · categories · circuit breaker · journal"]
    RA["radar.js · revenda.js<br/>market scan · auto-buy · auto-resell · team stones"]
    HU["hunt/*<br/>gold/h engine · hunt switch · restock · Center"]
    RO["piloto/rotina.js · piloto/captura.js<br/>pass · XP Share · Outland · PvP · rotation · evolve · eggs · Depot · auto ball"]
    TM["piloto/time.js · meta.js · metacaca.js · guarda.js<br/>single team · turns · Ranked meta · hunt the meta · never-sell list"]
    SA["piloto/saude.js · volta.js · suporte.js · plateia.js<br/>health check · auto-reload · bug report · updates · Plateia rooms"]
    UI["hunt/ui.js · tela.js · painel.js<br/>in-game panel (PT/EN/ES, light/dark)"]
  end
  SW["sw.js · service worker<br/>notifications · alerts DB · updates · Plateia windows"]
  RA & HU & RO & TM -->|requests| C -->|approved| H <--> WS
  H -->|state| RA & HU & RO & TM & SA & UI
  UI <--> SW
  SA <--> SW
```

No build step: plain JavaScript modules, Manifest V3.

## Tests

```bash
node tests/teste-piloto.mjs   # Node 22+: the MAIN-world scripts in a fake browser with a simulated WebSocket (28/28)
node tests/teste-compra-pk.cjs && node tests/teste-vendapk.cjs   # Pokémon buy/list price rules
node tests/e2e.mjs            # needs Playwright: the real extension in Chromium against a fake pokeidle.io (tests/fake)
node tests/time.mjs           # team builder, Center swaps, rotation by turn, turn timer in the Team panel
node tests/meta.mjs           # Ranked meta from the ladder and profiles; profile pop-ups stay hidden
node tests/metacaca.mjs       # hunt the meta: picks the hunt, keeps the catch, fills the team
node tests/hunt.mjs           # hunt switching, portraits, Hunt tab layout
node tests/centro.mjs         # Pokémon Center queue and return
node tests/pedra.mjs          # buys one evolution stone, gold only, never twice in a row
node tests/plateia.mjs        # opens the Plateia rooms once per session, banner with and without Plateia
node tests/vendapk.mjs        # automatic Pokémon listing never touches protected Pokémon
node tests/volta.mjs          # reloads after 5 min stopped, waits for another tab
node tests/saude.mjs          # health check against the game modules, clickable signature
node tests/suporte.mjs        # bug report and update check
node tests/bola.mjs           # auto Poké Ball, locked with VIP
node tests/trava.mjs          # the window's locks
node tests/janela.mjs         # the Piloto window floats over the game without stretching the page
node tests/arte.mjs           # alerts with the animated sprite and the item icon
node tests/idioma-scan.mjs    # lists any text left untranslated in English and Spanish
node tests/docs-prints.mjs    # the screenshots in docs/ (fake game, placeholder art, no real account)
```

`teste-piloto.mjs` covers state rebuilding, real-money command blocks, the closed list, vault rules (unknown price, reserve, daily cap, committed gold), the rate limiter, page-side attacks, the circuit breaker, the routine commands, the Depot rules, the auto Poké Ball, the balance-aware daily cap, the restock budget split and the stuck-at-the-Center watchdog.

The screenshots come from `tests/docs-prints.mjs`: the real extension running against the fake game in `tests/fake`, with placeholder sprites and no real account.

## Credits

Built on top of **Radar do Mercado** and **/hunt**, two extensions by **Allan Hert**, used and published with his permission. PokeIdle Piloto merges both into a single hook and adds the vault, the routine, auto-resell and the safety layer.

## Disclaimer

Fan-made personal project, not affiliated with pokeidle.io. Automating a game may go against its Terms of Service. Use it on your own account and at your own risk. Pokémon is a trademark of Nintendo / Creatures / GAME FREAK.

## License

Copyright © 2026 André Miller Fleck (Dreds) and Allan Hert. All rights reserved: the source is public for reading, not licensed for reuse.
