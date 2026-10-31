class_name Imbue
## The mask's power. The one sigil inked on the hunter's mask lends the chosen
## weapon a strike of its own: E readies it, and the next blow that lands sets
## it off. What it does depends on the pairing of sigil and weapon.

const COOLDOWN := 9.0

const POWERS := {
	"sword": {
		"ember": {"title": "Searing Edge", "desc": "The cut bursts into flame around the foe, setting the dead alight."},
		"storm": {"title": "Thunder Cut", "desc": "Lightning falls on the foe and leaps to those nearby."},
		"ward": {"title": "Cleaving Gale", "desc": "A wave rolls off the blade, hurling everything ahead of you."},
	},
	"dagger": {
		"ember": {"title": "Cinder Wound", "desc": "The foe burns from within, long after the blade is gone."},
		"storm": {"title": "Flicker", "desc": "You vanish in a flash and stab the next foe in the back."},
		"ward": {"title": "Shadow Veil", "desc": "Nothing can touch you for a moment, and the foe reels."},
	},
	"axe": {
		"ember": {"title": "Molten Cleave", "desc": "The head erupts in a great burst of fire where it bites."},
		"storm": {"title": "Skyfall", "desc": "A bolt strikes the foe and stuns everything around it."},
		"ward": {"title": "Earthsplitter", "desc": "The ground heaves outward from the blow."},
	},
	"flail": {
		"ember": {"title": "Comet", "desc": "The head trails fire that ignites everything around you."},
		"storm": {"title": "Tempest", "desc": "Lightning lashes out from the chain at every foe close by."},
		"ward": {"title": "Pendulum", "desc": "The foe is flung like a stone into the others."},
	},
}


static func info(weapon: String, glyph: String) -> Dictionary:
	return POWERS[weapon][glyph]


static func unleash(weapon: String, glyph: String, power: float, hunter: Fighter, target: Fighter) -> void:
	var at := target.global_position
	var color: Color = Spells.GLYPHS[glyph].color
	Fx.flash(at + Vector3(0, 1, 0), color, 4.0, 5.0, 0.35)
	match weapon + "/" + glyph:
		"sword/ember":
			_burst(hunter, at, 2.4, 26.0 * power, 7.0 * power, 1.0)
			for o in _near(hunter, at, 2.4):
				o.ignite(3.0, 6.0 * power, hunter)
			Fx.fire_burst(at, 2.4)
		"sword/storm":
			Spells.detonate("storm", power, hunter, at)
		"sword/ward":
			var fwd := hunter.forward()
			for o in hunter.opponents():
				var d := o.global_position - hunter.global_position
				d.y = 0.0
				if d.length() < 5.0 and fwd.dot(d.normalized()) > 0.45:
					o.take_hit(hunter, 14.0 * power, d.normalized(), 15.0 * power, 1.3, false)
			Fx.shockwave(hunter.global_position + fwd * 1.8, 2.6, color)
			Game.shake(0.45)
		"dagger/ember":
			target.ignite(6.0, 10.0 * power, hunter)
			Fx.sparks(at + Vector3(0, 1.1, 0), color, 24)
		"dagger/storm":
			_flicker(power, hunter, target, color)
		"dagger/ward":
			hunter.invuln_left = maxf(hunter.invuln_left, 2.0)
			target.stagger(2.5)
			Fx.shockwave(hunter.global_position, 1.6, color)
			Fx.ash_burst(hunter.global_position + Vector3(0, 1, 0), 20)
		"axe/ember":
			Spells.detonate("ember", power * 1.2, hunter, at)
		"axe/storm":
			Fx.bolt(at + Vector3(randf_range(-1, 1), 9.0, randf_range(-1, 1)), at + Vector3(0, 1.1, 0), color)
			Fx.scorch(at, 0.9)
			target.take_hit(hunter, 30.0 * power, Vector3.ZERO, 0.0, 2.0, false)
			for o in _near(hunter, at, 3.2):
				if o != target:
					Fx.bolt(at + Vector3(0, 1.1, 0), o.global_position + Vector3(0, 1.1, 0), color)
					o.take_hit(hunter, 12.0 * power, Vector3.ZERO, 0.0, 2.0, false)
			Game.shake(0.5)
			Game.hitstop(0.1)
		"axe/ward":
			Spells.detonate("ward", power * 1.2, hunter, at)
		"flail/ember":
			var here := hunter.global_position
			_burst(hunter, here, 3.5, 16.0 * power, 6.0 * power, 0.8)
			for o in _near(hunter, here, 3.5):
				o.ignite(4.0, 6.0 * power, hunter)
			Fx.fire_burst(here, 3.5)
		"flail/storm":
			var from := hunter.global_position + Vector3(0, 1.3, 0)
			for o in _near(hunter, hunter.global_position, 6.0):
				Fx.bolt(from, o.global_position + Vector3(0, 1.1, 0), color)
				o.take_hit(hunter, 24.0 * power, Vector3.ZERO, 0.0, 1.0, false)
			Game.shake(0.5)
			Game.hitstop(0.08)
		"flail/ward":
			var d := at - hunter.global_position
			d.y = 0.0
			target.take_hit(hunter, 10.0 * power, d.normalized(), 26.0 * power, 1.5, false)
			Fx.shockwave(at, 1.4, color)
			Game.shake(0.4)


static func _near(hunter: Fighter, at: Vector3, r: float) -> Array[Fighter]:
	var out: Array[Fighter] = []
	for o in hunter.opponents():
		var d := o.global_position - at
		d.y = 0.0
		if d.length() <= r + o.radius:
			out.append(o)
	return out


## Damage and push outward from a point, weaker toward the edge.
static func _burst(hunter: Fighter, at: Vector3, r: float, dmg: float, force: float, stun: float) -> void:
	for o in _near(hunter, at, r):
		var d := o.global_position - at
		d.y = 0.0
		var falloff := 1.0 - 0.5 * clampf(d.length() / r, 0.0, 1.0)
		o.take_hit(hunter, dmg * falloff, d.normalized(), force * falloff, stun, false)
	Game.shake(0.5)
	Game.hitstop(0.08)


## Blink behind the nearest other foe and stab it in the back.
static func _flicker(power: float, hunter: Fighter, target: Fighter, color: Color) -> void:
	var next: Fighter = null
	var best := 7.0
	for o in hunter.opponents():
		var d := o.global_position.distance_to(target.global_position)
		if o != target and d < best:
			best = d
			next = o
	var chest := Vector3(0, 1.1, 0)
	if next == null:
		Fx.bolt(target.global_position + Vector3(0, 9, 0), target.global_position + chest, color)
		target.take_hit(hunter, 22.0 * power, Vector3.ZERO, 0.0, 1.0, false)
		return
	var from := hunter.global_position
	var behind := next.global_position - next.forward() * 0.9
	behind.x = clampf(behind.x, -16.0, 16.0)
	behind.z = clampf(behind.z, -16.0, 16.0)
	hunter.global_position = Vector3(behind.x, from.y, behind.z)
	hunter.snap_visual()
	hunter.facing_angle = hunter.yaw_to(next.global_position)
	hunter.desired_facing = hunter.facing_angle
	hunter.invuln_left = maxf(hunter.invuln_left, 0.4)
	Fx.bolt(from + chest, hunter.global_position + chest, color)
	Fx.ash_burst(from + chest, 16)
	var d := next.global_position - hunter.global_position
	d.y = 0.0
	next.take_hit(hunter, hunter.weapon_damage * 3.0 * power, d.normalized(), 4.0, 1.2, false)
	Game.hitstop(0.1)
