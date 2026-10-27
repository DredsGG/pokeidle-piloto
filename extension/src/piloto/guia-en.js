// First-run guide and "What's new" texts (hub rule 12) — ENGLISH.
// Every new version: add the `novidades` entry in the three files (pt, en, es), in short sentences
// written for the person using it. Only the current version shows in the box.
(function (raiz) {
  'use strict';
  const PIH = (raiz.__pokeidleHunt = raiz.__pokeidleHunt || {});
  (PIH.guiaTextos = PIH.guiaTextos || {}).en = {
    ui: {
      comoUsar: 'How to use the Pilot', pular: 'Skip', voltar: 'Back', proximo: 'Next', entendi: 'Got it', fechar: 'Close (Esc)',
      passo: 'Step {n} of {t}', novidades: "What's new in v{v}", verGuia: 'See the guide',
    },
    tutorial: [
      { t: 'Welcome to the Pilot', x: 'The Pilot plays for you right here in PokeIdle: it picks the best hunt, restocks balls and potions, and looks after your team and the Market. It only spends gold and always within the Vault; never gems or diamonds.' },
      { t: 'Off, Manual and Auto', x: 'The mode is at the top. Off: nothing runs. Manual: you turn on and tune each automation. Auto: the Pilot turns everything on and works out the numbers; each row keeps its own ON/OFF.' },
      { t: 'The Vault controls spending', x: 'Before turning it on, open the Vault tab and check the reserve (the gold that is never spent) and the daily cap. Every purchase the Pilot makes goes through it.' },
      { t: 'The tabs', x: 'Hunt: hunt switching, restock and team rotation. Level: when each one levels up. Routine: Pass, XP Share, PvP and Depot. Market: the Radar alerts, buys and resells for gold.' },
      { t: "Your team in the game's panel", x: "The game's Team panel gets the Team button (your field and PvP team, plus the Ranked meta) and a ⏱ on each Pokémon with its turn and the rotation queue." },
      { t: 'Help is always at hand', x: 'The ? on each row explains what it does. Report bug, Check for updates and the language are below the menu. This guide comes back with the ? button at the top.' },
    ],
    novidades: {
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
