// First-run guide and "What's new" texts (hub rule 12) — ENGLISH.
// Every new version: add the `novidades` entry in the three files (pt, en, es), in short sentences
// written for the person using it. Only the current version shows in the box.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).en = {
    ui: {
      comoUsar: 'How to use the Pilot', pular: 'Skip', voltar: 'Back', proximo: 'Next', entendi: 'Got it', fechar: 'Close (Esc)',
      passo: 'Step {n} of {t}', novidades: "What's new in v{v}", verGuia: 'See the guide', eMais: 'and {n} more — the full list is on GitHub',
      versaoUrgente: 'Urgent update v{v}', urgentePausado: 'The Pilot is paused until you update.', novaVersao: 'New version v{v}', voceTem: "You're on v{v}. What changed:", atualizar: 'Update', verNoGithub: 'See on GitHub',
      updMsg: {
        aplicando: 'Updating…',
        baixado: 'The new zip was downloaded (Downloads folder). Extract it over the Pilot folder: within 1 min it reloads by itself and the game tabs reload.',
        firefox: 'Firefox will ask whether to install the new version: click Add. The game tabs reload by themselves.',
        'firefox-temporario': 'The new zip was downloaded. In about:debugging, remove the Pilot and load the new zip with "Load Temporary Add-on".',
        loja: "The browser hasn't released the new version yet: try again in a little while.",
        erro: "Couldn't update right now. Try again with the Check for updates button in the panel.",
      },
    },
    tutorial: [
      { t: 'Welcome to the Pilot', x: 'The Pilot plays for you right here in PokeIdle: it picks the best hunt, restocks balls and potions, and looks after your team and the Market. It only spends gold and always within the Vault; never gems or diamonds. The Pilot button sits right above your Pokémon in the field: that is where the panel opens.' },
      { t: 'Off, Manual and Auto', x: 'The mode is at the top. Off: nothing runs. Manual: you turn on and tune each automation. Auto: the Pilot turns everything on and works out the numbers; each row keeps its own ON/OFF.' },
      { t: 'The Vault controls spending', x: 'Before turning it on, open the Vault tab and check the reserve (the gold that is never spent) and the daily cap. Every purchase the Pilot makes goes through it.' },
      { t: 'The tabs', x: 'Hunt: hunt switching, restock and team rotation. Level: when each one levels up. Routine: Pass, XP Share, PvP and Depot. Market: the Radar alerts, buys and resells for gold.' },
      { t: "Your team in the game's panel", x: "The game's Team panel gets the Team button (your field and PvP team, plus the Ranked meta) and a ⏱ on each Pokémon with its turn and the rotation queue." },
      { t: 'Help is always at hand', x: 'The ? on each row explains what it does. Report bug, Check for updates and the language are below the menu. This guide comes back with the ? button at the top.' },
    ],
    novidades: {
      '1.31.1': [
        "Fixed: the Ancient Pupitar (and the other Outland variants) no longer counts as \"already had\" in Hunt the meta: they don't evolve.",
      ],
      '1.36.1': [
        "Restock: revive and potion always come before balls, and balls only use the gold left after the next potion restock is secured — low-gold accounts no longer run out of potions.",
        "Restock: when the chosen potion (or ball, or revive) changes, the Piloto switches and buys right away instead of going up to 40 min without buying either; and it no longer drops to a weaker potion just because it just spent gold.",
        "Evolve: if the vault won't release gold for the stone (low-gold account), it tries again in 30 min instead of retrying nonstop.",
      ],
      '1.36.0': [
        "Evolve: the team evolves the moment it reaches the level — any Pokémon, the starter too. Without the stone, the Piloto buys one on the Market right away (for gold) and it never goes to resale.",
        "Evolve: fixed what blocked evolutions — the stone lookup lost its turn to the Radar, a second stone from the same seller was refused and a lost command held the Pokémon for 24 h.",
        "Plateia: \"Reopen if it closes\" option — if the Twitch or Kick window closes or is discarded from memory, the Piloto reopens it within 1 min.",
        "Live PvP: all 6 on each side show from the start, in a vertical list in each corner — a frame on whoever is fighting, fading as they lose HP and grey when they faint.",
      ],
      '1.35.0': [
        "Meta tab in the Team window: \"Update team\" button — switches to the current meta right away (at the Center), shows who comes in, who goes out and what's still to catch; \"Hunt the missing ones\" only when you click.",
        "New Statement tab: what you spent and what came in, with the item icon or the Pokémon, when and how long ago; totals for today, 7 and 30 days.",
        "Live PvP: in the small window and the full screen of the match, each trainer's name and Pokémon in the corners — fading as they lose HP and grey when they faint.",
      ],
      '1.34.1': [
        "Collection: a Pokémon the Auto Collection kept below Lv 50 (the Market only takes it from there) that isn't useful for the team, PvP or the meta goes back to the Depot and is sold instead of sitting there.",
        "The Pilot's version shows, discreetly, next to its name on the In the field bar.",
        "Team button: turns gold with a red dot when the meta changes and you haven't seen it yet; opening it goes straight to the Meta tab.",
        "Next to your rank you see the last ranked result: ▲ the PR you won or ▼ the PR you lost.",
        "Battle Pass: when the Pilot collects the daily reward, it closes the \"Amazing!\" box and the Pass window by itself.",
        "An automatic buy that didn't go out because the game connection dropped tries again by itself when the connection is back.",
      ],
      '1.34.0': [
        "New version: the Pilot checks on its own when the game opens, every 30 min and when you come back to the tab, and shows the notice right away, without reloading. The X only postpones it for 1 h; an urgent update pauses the Pilot until you update.",
        "Manual mode: Targets tab in the Market — for each item, the max price in gold and how many to buy; the Radar buys on its own when a listing shows up at or below it. Also Pokémon targets in gold (P5 and minimum grade).",
        "Manual mode: with \"Calculate limits automatically\" off, the Market limits become fields you can type in, and F5 no longer undoes what you set.",
        "Restock: the revive, potion or ball picked for the account is bought again when it runs out, even if the game unticks it for being at zero.",
        "Rotation: if the turn ends during a trip to the Center (a restock, for example), the swap happens on that same trip, without going back to the hunt first.",
      ],
      '1.33.9': [
        "Automatic resale: what you buy by hand (on the Market, with a click in the Radar, or a Pokémon) is never listed on its own; only what came by itself (drops or the Radar's automatic buys) goes to resale.",
        "The stone your team will spend to evolve stays out of resale while it's needed.",
      ],
      '1.33.7': [
        "In the field: a golden \"+N\" next to the level shows how many levels the Pokémon gained this rotation turn (only if it leveled up; it starts over when it comes back).",
      ],
      '1.33.6': [
        "What's new now shows only what changed since the last version you saw (6 lines at most).",
      ],
      '1.33.5': [
        "Automatic evolution: the stone the Radar buys for the team no longer goes to resale (before, the Pokémon kept waiting and the Radar bought another every 30 min); if the Radar already has the stone in stock, it uses one from there.",
      ],
      '1.33.4': [
        "Rotation: when the hunt never gives a break in combat (the weak Pokémon keeps getting hit), after 2 min the next one in line comes in right there, clears the hunt and goes on to the Center and its best hunt. The order doesn't change.",
        "If the next one in line can't handle that hunt, the team's strongest comes in only to clear it; it doesn't count as a turn or lose its place in line.",
        "No VIP: the automatic Poké Ball keeps throwing with the window minimized (Chrome was slowing the clock to once a minute).",
      ],
      '1.33.3': [
        "Automatic Market buying now follows your money: it buys what's profitable while the radar's stock plus the purchase stays under half of what you have; once it sells, room opens again. It left the daily cap.",
        "When the game says \"Devagar aí — muitas mensagens\" (too many messages), the radar and the Pilot slow down on their own and speed back up slowly.",
        "The ball takes your balance into account: an account with lots of gold uses the Ultra Ball even while leveling a weak Pokémon.",
      ],
      '1.33.0': [
        "Restock for new accounts: the Pilot ticks one ball, one potion and one revive right away and buys the first batch as soon as there is gold (it keeps only 10% of the balance).",
        "Restock amounts come from what your account actually uses (1 h minimum, 6 h target), and the potion is the one with the lowest gold per HP it really heals.",
        "Hunt tab: gold/h already takes potions off, and a hunt where fainting costs more XP than it gives is flagged as risky.",
        "Hunt the meta no longer skips anyone: it tries every team Pokémon and, with no safe hunt, waits while farming XP until the trainer levels up.",
      ],
      '1.32.3': [
        "Plateia also stops opening a duplicate room after a Piloto update or with Windows display scaling (it adopts the window that is already open).",
        "Hunt tab: a hunt where your Pokémon dies before finishing a single kill leaves the ranking (e.g. Larvitar Lv 20 at Ledyba Lv 230), and with \"Avoid risk\" the risky ones come after the safe ones.",
        "The first time, the Pilot opens in your browser language (Portuguese, English or Spanish); the PT · EN · ES picker is still in the panel.",
        "New version, what is new and the guide show up by themselves in the middle of the game screen, without opening the panel. X or Esc closes them.",
        "Plateia rooms no longer open again when the game or the extension restarts: only a missing one opens.",
        "When the rotation is turned back on, it starts with the weakest Pokémon and leaves the strongest for last.",
        "Hunt the meta also turns off the team rotation; it comes back together with Hunt switching.",
        "Tournaments: the Pilot signs you up for the World, the Amateur and the Showdown as soon as registration opens (Routine tab).",
      ],
      '1.31.0': [
        'Now also works on Edge, Brave, Opera GX and Firefox.',
        'Manual mode is unlocked: you turn on and tune each automation.',
        'Team rotation by turn: in Manual you choose how long a turn lasts.',
        "The game's Session TIME now has a box with the days.",
        "Hunt the meta no longer goes to the Outland: Pokémon from there don't evolve.",
        'This first-run guide and the "What\'s new" box (? button at the top).',
        "Restock picks one ball, one potion and one revive for your account and switches them as it grows.",
        "The team only takes meta Pokémon; the meta it follows only changes after 24 h.",
      ],
    },
  };
})(globalThis);
