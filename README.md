# Sea of Thieves Fan Game

A fan-made, spooky 3D pirate game that runs in any modern browser. You sail a haunted sea at night, sink ghost ships, fight off the Kraken and haul five cursed skulls aboard before the dead drag you under. Play solo, or crew up with up to three friends, each on your own ship.

Nothing needs to be installed. Three.js is bundled and all sounds are generated in code, so it works on a school Chromebook or laptop and on networks that block other sites. The fonts come from Google Fonts; if they're blocked the game falls back to fonts already on your computer.

## How to play at school

Pick one of these:

1. **GitHub Pages (easiest).** In this repo on GitHub go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick the branch with this code and the `/ (root)` folder, then save. After a minute the game is at `https://<your-username>.github.io/<repo-name>/`. On a free GitHub account, the repo has to be public for Pages to work.
   Multiplayer works best this way, because the invite link you send friends only works from a web address.
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
| P or Esc | Pause (in a crew this opens the menu, but the game keeps going) |

On a touchscreen, tap the screen once and on-screen buttons appear.

## Playing with friends

Up to 4 pirates can sail together, each captaining their own ship on the same sea.

1. Everyone types a pirate name on the title screen.
2. One person presses **Host a crew**. The lobby shows a 5-letter crew code and an invite link with a **Copy link** button.
3. Friends open the invite link and press **Join**. Or they open the game, press **Join a crew** and type the code.
4. The host can tick **Ships can sink each other** if you want to fight each other as well as the ghosts.
5. The host presses **Set sail** and everyone starts side by side. Friends can also join a voyage that's already going; they appear near the host.

How a crew plays:

- Skulls and gold belong to the whole crew. When anyone hauls a skull aboard, it counts for everyone.
- Each ship has its own colour of sails and a name above it. Crewmates show as coloured triangles on your compass, and the list under your gold shows who's taking on water or sinking.
- Ghost ships hunt whichever ship is closest. When the Kraken grabs one ship, everyone else can sail over and shoot the tentacles off.
- If your ship sinks, you ride the **Ferry of the Damned** for 10 seconds and watch a crewmate, then you're back at sea next to them.
- Everyone needs the same version of the game. If joining says the versions are different, both of you refresh the page.

There's no game server. The host's browser runs the sea (ghost ships, the Kraken, skulls and gold) and friends connect straight to it over WebRTC. The free [PeerJS](https://peerjs.com) service is only used to find each other by crew code, so multiplayer needs the internet even though the game itself doesn't. The host has to keep the game open while everyone plays; switching to another tab is fine. If the host leaves, everyone else goes back to the title screen.

If a friend can find the crew but can't connect, one of your networks (often school Wi-Fi) is blocking the connection. A phone hotspot on either side usually fixes it.

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
index.html                  the page: HUD, title screen, lobby, menus and styles
js/game.js                  the game: the sea, ships, ghosts, the Kraken, sound and crew syncing
js/net.js                   how crewmates find and talk to each other (hosting and joining)
js/three.min.js             three.js r128 (bundled so nothing loads from a CDN)
js/peerjs.min.js            PeerJS 1.5.5, for multiplayer connections
tools/build-standalone.mjs  builds dist/game.html
dist/game.html              index.html with every script inlined, for offline use
```

After changing `index.html` or anything in `js/`, rebuild the single-file version:

```
node tools/build-standalone.mjs
```

Some easy things to change in `js/game.js`: `MAX_SPEED` (how fast your ship sails), `COOL` (seconds between cannon shots), `HAUL_R` (how close you need to be to haul a skull), the `fresh()` function (starting timers, such as how soon the first ghost ship and the Kraken appear) and `placeIslands()` (how many islands there are and how far apart). If you change what crewmates send each other in `js/game.js`, bump `PROTOCOL` in `js/net.js` so old and new copies of the game don't try to play together.

This is a fan-made game inspired by Sea of Thieves. It is not affiliated with Rare or Microsoft.
