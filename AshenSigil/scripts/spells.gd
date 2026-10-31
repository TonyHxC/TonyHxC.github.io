class_name Spells
## The sigils: their shapes (used both to teach the recognizer and to draw the
## grimoire), and what each one does when its burning paper lands.

const PASS_SCORE := 0.72
const GREAT_SCORE := 0.92

const GLYPHS := {
	"ember": {"title": "Ember", "hint": "a circle", "color": Color(1.0, 0.45, 0.15)},
	"storm": {"title": "Storm", "hint": "a Z, top-left first", "color": Color(0.55, 0.75, 1.0)},
	"ward": {"title": "Repulsion", "hint": "a triangle, from the top", "color": Color(0.85, 0.8, 1.0)},
}


## Raw template strokes in a -1..1 box, y pointing down (screen space).
static func shapes() -> Dictionary:
	var circle_cw := PackedVector2Array()
	for i in 33:
		var a := -PI / 2.0 + TAU * i / 32.0
		circle_cw.append(Vector2(cos(a), sin(a)))
	var circle_ccw := circle_cw.duplicate()
	circle_ccw.reverse()
	var tri := PackedVector2Array([Vector2(0, -1), Vector2(0.9, 0.6), Vector2(-0.9, 0.6), Vector2(0, -1)])
	var tri_rev := PackedVector2Array([Vector2(0, -1), Vector2(-0.9, 0.6), Vector2(0.9, 0.6), Vector2(0, -1)])
	var zig := PackedVector2Array([Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)])
	return {
		"ember": [circle_cw, circle_ccw],
		"storm": [zig],
		"ward": [tri, tri_rev],
	}


static func teach(r: GlyphRecognizer) -> void:
	var s := shapes()
	for glyph in s:
		for stroke in s[glyph]:
			r.add_template(glyph, _densify(stroke))


## Turns a recognizer score into spell power, or 0 for a failed sigil.
static func power_for(score: float) -> float:
	if score < PASS_SCORE:
		return 0.0
	return remap(clampf(score, PASS_SCORE, GREAT_SCORE), PASS_SCORE, GREAT_SCORE, 0.7, 1.3)


## Area of effect, also used to size the aiming ring.
static func radius(glyph: String, power: float) -> float:
	match glyph:
		"ember": return 2.4 + 0.9 * power
		"ward": return 3.8 + 1.2 * power
	return 1.0


static func detonate(glyph: String, power: float, caster: Fighter, pos: Vector3) -> void:
	match glyph:
		"ember": _ember(power, caster, pos)
		"storm": _storm(power, caster, pos)
		"ward": _ward(power, caster, pos)


static func _ember(power: float, caster: Fighter, pos: Vector3) -> void:
	var r := radius("ember", power)
	for o in caster.opponents():
		var d := o.global_position - pos
		d.y = 0.0
		if d.length() <= r + o.radius:
			var falloff := 1.0 - 0.5 * clampf(d.length() / r, 0.0, 1.0)
			o.take_hit(caster, 48.0 * power * falloff, d.normalized(), 9.0 * power * falloff, 0.9, false)
	Fx.fire_burst(pos, r)
	Game.shake(0.6)
	Game.hitstop(0.08)


static func _storm(power: float, caster: Fighter, pos: Vector3) -> void:
	var color: Color = GLYPHS.storm.color
	var foes := caster.opponents()
	var current: Fighter = null
	var best := 3.5
	for o in foes:
		var d := o.global_position.distance_to(pos)
		if d < best:
			best = d
			current = o
	var sky := pos + Vector3(randf_range(-1, 1), 9.0, randf_range(-1, 1))
	if current == null:
		Fx.bolt(sky, pos, color)
		Fx.scorch(pos, 0.6)
		Game.shake(0.3)
		return
	var dmg := 36.0 * power
	var jumps := 2 + roundi(power * 2.0)
	var struck: Array[Fighter] = []
	var from := sky
	while current and jumps >= 0:
		var at := current.global_position + Vector3(0, 1.1, 0)
		Fx.bolt(from, at, color)
		current.take_hit(caster, dmg, Vector3.ZERO, 0.0, 1.1, false)
		struck.append(current)
		from = at
		dmg *= 0.85
		jumps -= 1
		var next: Fighter = null
		var nd := 4.5
		for o in foes:
			if o in struck or o.is_dead():
				continue
			var d := o.global_position.distance_to(current.global_position)
			if d < nd:
				nd = d
				next = o
		current = next
	Game.shake(0.5)
	Game.hitstop(0.1)


static func _ward(power: float, caster: Fighter, pos: Vector3) -> void:
	var r := radius("ward", power)
	for o in caster.opponents():
		var d := o.global_position - pos
		d.y = 0.0
		if d.length() <= r:
			o.take_hit(caster, 12.0 * power, d.normalized(), 13.0 * power, 1.4, false)
	caster.invuln_left = 0.3
	Fx.shockwave(pos, r, GLYPHS.ward.color)
	Game.shake(0.45)


static func _densify(stroke: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(stroke.size() - 1):
		for k in 8:
			out.append(stroke[i].lerp(stroke[i + 1], k / 8.0))
	out.append(stroke[stroke.size() - 1])
	var scaled := PackedVector2Array()
	for v in out:
		scaled.append(v * 100.0)
	return scaled
