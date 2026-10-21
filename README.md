# The Cursed Tide

A spooky 3D pirate game that runs in any modern browser. You sail a haunted sea at night, sink ghost ships, fight off the Kraken and haul five cursed skulls aboard before the dead drag you under.

Nothing needs to be installed. Three.js is bundled and all sounds are generated in code, so it works on a school Chromebook or laptop and on networks that block other sites. The fonts come from Google Fonts; if they're blocked the game falls back to fonts already on your computer.

## How to play at school

Pick one of these:

1. **GitHub Pages (easiest).** In this repo on GitHub go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick the branch with this code and the `/ (root)` folder, then save. After a minute the game is at `https://<your-username>.github.io/<repo-name>/`. On a free GitHub account, the repo has to be public for Pages to work.
2. **Single file.** Download [`dist/game.html`](dist/game.html) (open it on GitHub, then click *Download raw file*). Save it anywhere, for example Google Drive or a USB stick, then open it in Chrome. Everything is inside that one file.
3. **The whole folder.** Download the repo as a ZIP (**Code → Download ZIP**), extract it, and open `index.html`.

Click **Full screen** on the title screen and wear headphones. If the game says 3D graphics couldn't start, open Chrome's Settings, search for "hardware acceleration", turn it on, then reload.

## Controls

| Key | Action |
| --- | --- |
| W / S or ↑ / ↓ | Raise or lower the sails |
| A / D or ← / → | Steer |
| Q | Fire the port (left) cannons |
| E | Fire the starboard (right) cannons |
| Space | Fire at the nearest enemy |
| Hold R | Patch holes in the hull, then bail out the water |
| Hold F | Haul a cursed skull aboard |
| Drag the mouse | Look around |
| Scroll | Zoom |
| M | Mute |
| P or Esc | Pause |

On a touchscreen, tap the screen once and on-screen buttons appear.

## How it plays

- **The goal.** Five islands each have a cursed skull on a shrine, marked by a green beam of light and a green skull on your compass. Sail close and hold F to haul it aboard. Get all five and the curse breaks at dawn.
- **Ghost ships** come out of the fog, ring a bell and circle you, firing green cannonballs. Each hit punches a hole in your hull. Sink them with your cannons for 50 gold. More of them come after each skull you take.
- **The Kraken** rises once you've been at sea for a while and holds your ship in place. Its tentacles slam the deck and make holes. Shoot every tentacle to drive it off for 150 gold.
- **Sinking.** Holes let water in. Hold R to patch them one at a time, then keep holding R to bail. If the water below deck reaches 100%, your ship goes down. A full ship is also slower.
- **Aim help.** Your cannons aim themselves at a ghost ship or tentacle on that side of the ship, so line up side-on and fire.
- **Running aground** on rocks at speed tears a hole in the hull.
- **Gold.** Skulls are worth 100, floating barrels 25. Your best haul is saved in your browser.
- **Things in the fog.** Red eyes watch you from the water, voices whisper near the shrines, and sometimes a lightning flash shows something enormous standing in the sea.

If the game runs slowly it lowers its own resolution to keep up.

## Project layout

```
index.html                  the whole game: page, HUD, styles and code
js/three.min.js             three.js r128 (bundled so nothing loads from a CDN)
tools/build-standalone.mjs  builds dist/game.html
dist/game.html              index.html with three.js inlined, for offline use
```

After changing `index.html`, rebuild the single-file version:

```
node tools/build-standalone.mjs
```

Some easy things to change in `index.html`: `MAX_SPEED` (how fast your ship sails), `COOL` (seconds between cannon shots), `HAUL_R` (how close you need to be to haul a skull), the `fresh()` function (starting timers, such as how soon the first ghost ship and the Kraken appear) and `placeIslands()` (how many islands there are and how far apart).

This is a fan-made game inspired by Sea of Thieves. It is not affiliated with Rare or Microsoft.
