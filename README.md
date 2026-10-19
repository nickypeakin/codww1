# ONE/TAP — a Valorant-style 1v1

A 3D first-person tactical shooter that runs in any modern browser. You play 1v1 rounds against a bot, with a buy phase, credits, shields, abilities, and guns modelled on the Vandal, Phantom, Sheriff and Operator.

Nothing needs to be installed and nothing loads from the internet. Three.js is bundled and all sounds are generated in code, so it works on a school Chromebook or laptop and on blocked networks.

## How to play at school

Pick one of these:

1. **GitHub Pages (easiest).** In this repo on GitHub go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick the branch with this code and the `/ (root)` folder, then save. After a minute the game is at `https://<your-username>.github.io/codww1/`. On a free GitHub account, the repo has to be public for Pages to work.
2. **Single file.** Download [`dist/one-tap.html`](dist/one-tap.html) (open it on GitHub, then click *Download raw file*). Save it anywhere, for example Google Drive or a USB stick, then open it in Chrome. Everything is inside that one file.
3. **The whole folder.** Download the repo as a ZIP (**Code → Download ZIP**), extract it, and open `index.html`.

Click **Fullscreen** in the menu before you play. In fullscreen, Ctrl+W (crouch + forward) can't close the tab by accident. If you're not in fullscreen, the browser asks before leaving instead.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Walk (silent, no footsteps) |
| Ctrl | Crouch |
| Space | Jump |
| Left mouse | Shoot |
| Right mouse | Aim down sights / scope (Operator) |
| R | Reload |
| 1 / 2 / 3 or scroll | Primary / sidearm / knife |
| B | Buy menu (during the buy phase) |
| Enter | Skip the rest of the buy phase |
| Q | Flash |
| E | Dash |
| C | Smoke (placed where you aim) |
| Tab | Scoreboard |
| Esc | Pause |

## How it plays

- **Rounds.** Each round starts with a 15 second buy phase behind a barrier, then 1:40 to fight. Kill the bot to win the round. If time runs out, the round is a draw. First to 3, 5, 7 or 13 rounds wins the match.
- **Economy.** You start with 800 credits. A round win gives +3000. A loss gives +1900, plus 500 more for each loss in a row (up to 2900). Each kill gives +200. If you survive a round you keep your gun and whatever shield you have left. If you die you drop them.
- **Guns.** Classic (free), Ghost, Sheriff, Spectre, Vandal, Phantom and Operator, with damage, fire rate and prices close to Valorant's. A Vandal or Operator headshot one-taps.
- **Accuracy works like Valorant's.** Your first shot is accurate if you're standing still. Running makes rifles very inaccurate and jumping is worse. Stop (counter-strafe) before you shoot. Spraying climbs, so pull down or burst. Crouching and aiming down sights help a little.
- **Getting shot slows you down** briefly.
- **Sound matters.** Running makes footsteps that you and the bot can both hear. Walking with Shift is silent. Footsteps behind walls sound muffled.
- **Abilities.** You buy them in the buy menu, and unused ones carry over.
  - Flash (Q, 250, max 2): blinds anyone looking at it when it pops, the bot included.
  - Dash (E, free every round): a quick burst in the direction you're moving.
  - Smoke (C, 200): drops a dome where you aim. It blocks vision but not bullets.

## Bot difficulty

| Level | What it's like |
| --- | --- |
| Iron | Slow to react, sprays and misses, stands still |
| Gold | Decent aim, strafes between bursts, sometimes flashes |
| Diamond | Quick, plays for sound, holds angles, flashes before peeking |
| Radiant | Very fast reactions, lots of headshots, taps instead of spraying |

The bot holds angles, pushes lanes, investigates where it heard or last saw you, and counter-strafes in fights. It can't see through smokes and gets blinded by your flashes.

## Settings

Sensitivity, volume, field of view, graphics quality, crosshair colour and enemy highlight colour are on the main menu. Sensitivity and volume can also be changed from the pause menu. Settings are saved in your browser.

- Sensitivity uses the same scale as Valorant (0.07° per mouse count × sensitivity). On a touchpad, try 2–3.
- If the game runs slowly during a round, it lowers the graphics setting by itself and tells you. You can also set **Graphics** to **Low** yourself. Low renders at a lower resolution with no shadows. Choosing a setting yourself turns off the automatic change.

## Project layout

```
index.html            page, HUD, menus and styles
js/three.min.js       three.js r159 (bundled so nothing loads from a CDN)
js/data.js            weapon stats, shields, abilities, economy, difficulty levels
js/audio.js           synthesized sound effects (Web Audio)
js/world.js           the map, collision, ray casts and bot pathfinding
js/fighter.js         player/bot state, hitboxes, agent and gun models
js/bot.js             bot AI
js/main.js            game loop, input, rounds, shooting, abilities, effects, HUD
tools/build-standalone.mjs   builds dist/one-tap.html
```

After changing anything in `js/` or `index.html`, rebuild the single-file version:

```
node tools/build-standalone.mjs
```

The map is built from boxes in `js/world.js`, so it's easy to change. Every `twin(...)` line adds a piece to your half and a mirrored copy on the bot's half. Weapon balance lives in `js/data.js`.

This is a fan-made game inspired by Valorant. It is not affiliated with Riot Games.
