# Ashen Sigil

A dark, gothic isometric RPG prototype in Godot 4.7, written in GDScript with the
Compatibility renderer so it can run in a browser.

## Run

Open the folder in Godot 4.7 and press F5, or:

```
Godot_v4.7.2-stable_mono_win64_console.exe --path .
```

## A run

Each run opens with two choices. First, pick one weapon from the hunter's kit (click it
or press 1-4). Then ink one sigil on the mask. The hunter puts the mask on and draws the
weapon, and the dead start to rise.

| Weapon | Feel | Trait |
|---|---|---|
| Sword | balanced | a parry readies a riposte that strikes twice as hard |
| Dagger | fast, cheap, short | blows from behind deal triple damage; cheaper dodge |
| Axe | slow, heavy | long stagger and big knockback (hurled foes slam into others) |
| Flail | long, wide arcs | the thrust becomes a whirl that hits all around you |

The mask's sigil gives the weapon one power for the run. Press **E** to wake it (the
weapon glows), and the next blow that lands sets it off. It then recharges for 9 seconds.

| | Ember (circle) | Storm (Z) | Repulsion (triangle) |
|---|---|---|---|
| Sword | Searing Edge: fire burst that sets foes alight | Thunder Cut: chain lightning from the foe | Cleaving Gale: a wave hurls everything ahead |
| Dagger | Cinder Wound: the foe burns for a long while | Flicker: blink behind the next foe and backstab it | Shadow Veil: two seconds untouchable, the foe reels |
| Axe | Molten Cleave: a great fire burst | Skyfall: a bolt, and everything near it is stunned | Earthsplitter: a shockwave from the impact |
| Flail | Comet: fire all around you, igniting foes | Tempest: lightning at every foe within 6 m | Pendulum: the foe is flung into the others |

## Controls

| Input | Action |
|---|---|
| WASD | move |
| Mouse | aim / facing |
| Tap LMB | a full-strength cut; taps in rhythm run slash, reverse slash, finisher (the finisher hits harder and staggers longer, then recovers slower) |
| Hold LMB | charge; release once the weapon flares and rings for a heavy blow (more damage, stagger and shove, but you commit to it) |
| Drag while holding | pick a particular cut instead: left/right = slash, down = overhead, up = thrust (whirl with the flail) |
| RMB | guard; raise it just before a hit to **parry** |
| Space | dodge |
| E | wake the mask's power; the next blow that lands releases it |
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
- `scripts/hunter_model.gd`: the player's body from `assets/models/drex.glb`, its animations, and the sword, dagger and axe meshes
- `scripts/arm_rig.gd`: a SkeletonModifier3D that aims the weapon arm along the fighter's swing pivot, keeps the weapon in hand, swings the flail head and holds the mask on
- `scripts/weapons.gd`, `scripts/imbue.gd`: weapon handling and the 12 mask powers
- `scripts/run_start.gd`: the weapon pick and mask-inking screens
- `scripts/glyph_recognizer.gd`: $1 Unistroke Recognizer
- `scripts/spells.gd`, `scripts/spell_paper.gd`, `scripts/sigil_ui.gd`: the sigil magic
- `scripts/main.gd`: the arena and waves
- `tests/smoke.tscn`: headless checks (`--headless --path . res://tests/smoke.tscn`)
- `tests/shot.tscn`: screenshots (`--path . res://tests/shot.tscn -- out.png [mask|poses:axe]`)
- `shaders/`: low-res retro finish, mud-and-cobble ground, burning parchment
- `assets/`: the hunter model, CC0 Poly Haven textures and the OFL IM Fell English font (see `assets/CREDITS.md`)

`drex.glb` has bones for the sword, dagger and axe but no meshes for them (only the flail
is modelled), so those three are built in code and attached to their bones. If the model
gets real weapon meshes, drop the matching `_forge` call in `hunter_model.gd`.

## Web build

Requires the 4.7.2 web export templates. Then:

```
C:/Godot42/Godot_v4.7.2-stable_win64/Godot_v4.7.2-stable_win64_console.exe --headless --path . --export-release Web play/index.html
```

Use the standard (non-C#) editor for this; the C# build refuses web exports. The build
lands in `play/` (`play/.gdignore` keeps Godot from importing it) and is served by GitHub
Pages at https://tonyhxc.github.io/AshenSigil/play/. The preset is single-threaded, so it
needs no special headers.
