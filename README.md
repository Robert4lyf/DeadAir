# DEAD AIR

A short third-person horror proof of concept set in a rain-soaked industrial noir city. Fixed cameras and painted backgrounds frame the journey through the streets to Studio 001, beneath a giant radio tower that never stopped broadcasting.

[Play the hosted demo](https://dead-air-ps1-horror-9d98.slopedcrow2.chatgpt.site/) (requires access through ChatGPT).

## Run locally

The game is plain HTML, CSS, and JavaScript using Canvas 2D. No build step or dependencies are required. Serve `dist` over HTTP rather than opening the HTML file directly:

```sh
python -m http.server 8000 --directory dist
```

Open http://localhost:8000 in a modern browser. On Windows, use `py` instead of `python` if needed. The interface uses Google Fonts and falls back to system fonts when offline.

## Controls

| Input                   | Action                |
| ----------------------- | --------------------- |
| WASD or arrow keys      | Walk                  |
| Shift                   | Run                   |
| E or Space              | Interact              |
| F                       | Toggle torch          |
| Escape                  | Pause / resume        |
| Click or tap the ground | Walk to a destination |
| Click or tap an object  | Approach and interact |

Touch controls appear on supported devices. Headphones are recommended; sound can be toggled in the interface.

## Prototype content

- Three scenes: side street, broadcast plaza, and studio control room.
- Eight-direction idle, walking, and running sprites.
- Perspective-aware movement, obstacles, foreground occlusion, lighting, and wet-ground reflections.
- Curfew notice, predictive intercom, and service breaker interactions.
- A broadcast encounter with shelter, exposure recovery, and a breaker bypass.
- An interactive studio monitor and two ending choices.

## Tests

With Node.js 22 or later:

```sh
npm test
```

The tests cover navigation and perspective mapping, encounter rules, and progression through the studio ending. They do not replace visual and audio playtesting.

Formatting uses Prettier: `npm run format` rewrites files and `npm run format:check` verifies them. CI runs both the tests and the format check on every pull request.

## Files

| Path                                | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `dist/index.html`, `dist/style.css` | Interface and layout                                   |
| `dist/game.js`                      | Gameplay, rendering, input, and procedural audio       |
| `dist/navigation.js`                | Scene projections, routes, obstacles, and interactions |
| `dist/encounter.js`                 | Broadcast encounter rules                              |
| `dist/sprites.js`                   | Sprite extraction, animation, and lighting             |
| `dist/art/`                         | Backgrounds and transparent character sheets           |
| `tests/`                            | Node.js checks                                         |
| `.openai/hosting.json`              | Existing ChatGPT Sites deployment identity             |

This is an early proof of concept. Character animation and background integration still need refinement. Artwork was generated with AI and is included with the source. This repository imports published Sites source commit `3637771338a1c3fae2100a419bc26524fea1a9d1`.
