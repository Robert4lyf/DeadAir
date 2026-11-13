# DEAD AIR

A short third-person horror proof of concept set in a rain-soaked industrial noir city. Fixed cameras and painted backgrounds frame the journey through the streets to Studio 001, beneath a giant radio tower that never stopped broadcasting.

[Play the hosted demo](https://dead-air-ps1-horror-9d98.slopedcrow2.chatgpt.site/) (requires access through ChatGPT).

## Play from a single file

Open [`dead-air.html`](dead-air.html) in a modern browser: download it (or clone the repository) and double-click it. It contains the whole game, with artwork embedded, and needs no server or install. Fonts load from Google Fonts when online and fall back to system fonts offline.

`dead-air.html` is generated from `dist/`; after changing the game, run `npm run build:standalone` and commit the result. CI fails if it is out of date.

## Run locally

The game is plain HTML, CSS, and JavaScript using Canvas 2D. To work on it, serve `dist` over HTTP (its HTML uses separate module and image files, which browsers block when opened directly):

```sh
python -m http.server 8000 --directory dist
```

Open http://localhost:8000 in a modern browser. On Windows, use `py` instead of `python` if needed. The interface uses Google Fonts and falls back to system fonts when offline.

## Controls

| Keyboard and mouse | Touch                         | Action                |
| ------------------ | ----------------------------- | --------------------- |
| WASD or arrow keys | Tap the ground                | Walk                  |
| Shift              | —                             | Run                   |
| E or Space         | Tap the object, or the prompt | Use what is nearby    |
| F                  | TORCH button                  | Toggle torch          |
| Escape             | ? button                      | Pause / resume        |
| Click the ground   | —                             | Walk to a destination |
| Click an object    | —                             | Walk over and use it  |

Headphones are recommended; sound can be toggled in the interface, and every audio cue has a subtitle. On a phone held upright, the picture sits at the top with text and controls below it; turning the phone sideways gives the full picture.

## The experience

Three fixed-camera scenes. A direct run takes about a minute of game time; a first play that reads everything, explores and lingers on the studio sequence takes longer (not yet timed with real players).

1. **The side street.** A broadcast warns before it goes live. Shelter under the right-hand awning to wait it out, or cut the service feed at the breaker. If the tower catches you in the open, the picture skips, you land back under the awning, and the transmission _holds_ on you: it will not pass by itself until you cut the feed. The street lamp that caught you stays red for the rest of the game.
2. **The broadcast plaza.** Partway across, a horn speaker announces a guest; the studio doors then open on their own while you are still far away, and the PA greets you in a way that depends on how the street went.
3. **Studio 001.** The monitor is a live feed of the room. Watch it and the picture jumps seven seconds ahead: you see yourself walk to a tape mark under the microphone. You then have seven seconds. Stand on the mark to **follow** the prediction, or stay away to **resist** it. Either way, take the microphone and choose to **speak** or **stay silent**.

### Seeing the variations

- **Prediction:** to follow, tap or click the microphone (or walk onto the tape mark) during the countdown; to resist, stand still at the monitor. Following syncs the feed and locks the ON AIR sign; resisting tears the feed and cuts back to the monitor, where the figure turns to look at you.
- **Ending:** speaking makes the tower sign blaze and the rain louder; silence darkens the sign and fades rain and hum to seven seconds of dead air. If the tower caught you on the street (or you cut the feed and then speak), the final shot returns to the side street and its lamp. The ending text reflects the prediction and the street.
- **Return to the city** restarts from the street with every consequence cleared.

## Tests

With Node.js 22 or later:

```sh
npm test
```

Unit tests cover the state machines (`prediction`, `encounter`, `plaza`, `ending`), sprite anchoring metadata, navigation and perspective mapping. Progression tests boot `game.js` in a VM (see `tests/support/harness.mjs`) and drive the real game loop through the shelter, breaker and caught routes, both prediction outcomes, both endings, restart, pause and hidden-tab timing, backtracking through the plaza, and a touch-only playthrough. They do not replace visual and audio playtesting.

Formatting uses Prettier: `npm run format` rewrites files and `npm run format:check` verifies them. CI runs both the tests and the format check on every pull request.

## Files

| Path                                | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `dist/index.html`, `dist/style.css` | Interface and layout                                               |
| `dead-air.html`                     | Single-file build of the game (generated)                          |
| `scripts/build-standalone.mjs`      | Builds `dead-air.html` from `dist/`                                |
| `dist/game.js`                      | Rendering, input, HUD, audio, and wiring between the state modules |
| `dist/navigation.js`                | Scene projections, routes, obstacles, and interactions             |
| `dist/encounter.js`                 | Street broadcast: warning, catch recovery, holding, resolution     |
| `dist/plaza.js`                     | Plaza doors event                                                  |
| `dist/prediction.js`                | Studio seven-second prediction sequence                            |
| `dist/ending.js`                    | Ending composition from the journey                                |
| `dist/sprites.js`                   | Sprite extraction, anchoring, animation, and lighting              |
| `dist/art/`                         | Backgrounds and transparent character sheets                       |
| `tests/`                            | Node.js checks                                                     |
| `.openai/hosting.json`              | Existing ChatGPT Sites deployment identity                         |

## Known asset limitations

The code now anchors every sprite frame on the body and uses one scale per sheet, which removes the jitter and size pulsing the sheets produced. Two issues are in the art itself:

- **Proportions differ between sheets.** The walk and run sheets draw the character with a larger head relative to the body (head about 13.5% of height) than the idle sheet (about 11%). Heights match on screen, so the head grows slightly when the character starts walking. Fix: re-render the idle sheet from the same model and camera as walk/run (or the reverse).
- **Four frames per direction.** Walk and run cycles have four frames each, so they animate at about 5–6 frames per second at the matched stride rate. Fix: walk and run sheets with at least eight frames per direction, each centred on the torso in its cell.

Artwork was generated with AI and is included with the source. This repository imports published Sites source commit `3637771338a1c3fae2100a419bc26524fea1a9d1`.
