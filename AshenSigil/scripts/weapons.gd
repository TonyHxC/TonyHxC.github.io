class_name Weapons
## The four arms the hunter can carry into a run. Each changes how the same
## cuts feel (timing, reach, weight) and brings one trait of its own.

const ORDER := ["sword", "dagger", "axe", "flail"]

## time / recover scale the cut and its recovery, stamina the cost, force the
## knockback, arc the width of a slash, lunge the step into it.
const STATS := {
	"sword": {
		"title": "Sword",
		"blurb": "Balanced in every cut. A parry readies a riposte that strikes twice as hard.",
		"damage": 24.0, "reach": 1.7, "time": 1.0, "recover": 1.0, "stamina": 1.0,
		"force": 1.0, "arc": 1.0, "lunge": 1.0, "stun": 0.0, "dodge": 22.0,
	},
	"dagger": {
		"title": "Dagger",
		"blurb": "Quick, cheap and close. Strikes from behind cut three times as deep.",
		"damage": 14.0, "reach": 1.25, "time": 0.6, "recover": 0.55, "stamina": 0.55,
		"force": 0.6, "arc": 0.75, "lunge": 1.4, "stun": 0.0, "dodge": 13.0,
	},
	"axe": {
		"title": "Axe",
		"blurb": "Slow and brutal. Every blow staggers long and hurls the dead into each other.",
		"damage": 34.0, "reach": 1.75, "time": 1.35, "recover": 1.3, "stamina": 1.35,
		"force": 1.7, "arc": 1.1, "lunge": 0.8, "stun": 0.45, "dodge": 22.0,
	},
	"flail": {
		"title": "Flail",
		"blurb": "Long, sweeping arcs. The thrust becomes a whirl that strikes all around you.",
		"damage": 27.0, "reach": 2.15, "time": 1.2, "recover": 1.25, "stamina": 1.2,
		"force": 1.3, "arc": 1.15, "lunge": 0.7, "stun": 0.1, "dodge": 22.0,
	},
}


## 0..1 ratings for the pick screen.
static func ratings(w: String) -> Array:
	var s: Dictionary = STATS[w]
	return [
		["Damage", remap(s.damage, 10.0, 36.0, 0.15, 1.0)],
		["Reach", remap(s.reach, 1.1, 2.2, 0.15, 1.0)],
		["Speed", remap(1.0 / s.time, 1.0 / 1.4, 1.0 / 0.55, 0.15, 1.0)],
	]
