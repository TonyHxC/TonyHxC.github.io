# Ashen Sigil

A dark, gothic isometric RPG prototype in Godot 4.7, written in GDScript with the
Compatibility renderer so it can run in a browser.

## Run

Open the folder in Godot 4.7 and press F5, or:

```
Godot_v4.7.2-stable_mono_win64_console.exe --path .
```

## Controls

| Input | Action |
|---|---|
| WASD | move |
| Mouse | aim / facing |
| Hold LMB | wind up (longer = heavier swing, more stamina) |
| Drag while holding | pick the cut: left/right = slash, down = overhead, up = thrust |
| RMB | guard; raise it just before a hit to **parry** |
| Space | dodge |
| Q | open the parchment and ink a sigil (time slows) |
| Wheel | zoom |
| H | toggle help, R restarts after death |

## Sigils

Draw in one stroke on the parchment. A cleaner shape gives a stronger spell, and a
malformed one burns you.

- **Ember**: a circle. The paper bursts into fire where it lands.
- **Storm**: a Z. Lightning strikes and chains between foes.
- **Repulsion**: a triangle from the top. A shockwave hurls everything away from you.

## Layout

- `scripts/fighter.gd`: shared combat body (momentum, swing sweep, guard/parry, stagger, slams)
- `scripts/player.gd`, `scripts/enemy.gd`: input and AI on top of it
- `scripts/glyph_recognizer.gd`: $1 Unistroke Recognizer
- `scripts/spells.gd`, `scripts/spell_paper.gd`, `scripts/glyph_canvas.gd`: the sigil magic
- `scripts/main.gd`: the arena and waves
- `tests/smoke.tscn`: headless checks (`--headless --path . res://tests/smoke.tscn`)
- `shaders/`: low-res retro finish, mud-and-cobble ground, burning parchment
- `assets/`: CC0 Poly Haven textures and the OFL IM Fell English font (see `assets/CREDITS.md`)

## Web build

Requires the 4.7.2 web export templates. Then:

```
C:/Godot42/Godot_v4.7.2-stable_win64/Godot_v4.7.2-stable_win64_console.exe --headless --path . --export-release Web play/index.html
```

Use the standard (non-C#) editor for this; the C# build refuses web exports. The build
lands in `play/` (`play/.gdignore` keeps Godot from importing it) and is served by GitHub
Pages at https://tonyhxc.github.io/AshenSigil/play/. The preset is single-threaded, so it
needs no special headers.
