extends Node
## Headless smoke test: godot --headless --path . res://tests/smoke.tscn

var main: Node3D
var failures := 0


func _ready() -> void:
	main = preload("res://main.tscn").instantiate()
	add_child(main)
	await _frames(5)
	_test_recognizer()
	await _test_swings()
	await _test_spells()
	print("SMOKE: %s (%d failures)" % ["PASS" if failures == 0 else "FAIL", failures])
	get_tree().quit(failures)


func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		failures += 1


func _frames(n: int) -> void:
	for i in n:
		await get_tree().physics_frame


func _wobbly(points: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(points.size() - 1):
		for k in 6:
			var p := points[i].lerp(points[i + 1], k / 6.0) * 1.3 + Vector2(400, 300)
			out.append(p + Vector2(randf_range(-6, 6), randf_range(-6, 6)))
	return out


func _test_recognizer() -> void:
	var r := GlyphRecognizer.new()
	Spells.teach(r)
	var s := Spells.shapes()
	for glyph in s:
		for stroke in s[glyph]:
			var scaled := PackedVector2Array()
			for v in stroke:
				scaled.append(v * 100.0)
			var res := r.recognize(_wobbly(scaled))
			_check(res["name"] == glyph and res["score"] >= Spells.PASS_SCORE,
				"recognize %s -> %s (%.2f)" % [glyph, res["name"], res["score"]])
	var scribble := PackedVector2Array()
	for i in 40:
		scribble.append(Vector2(randf_range(0, 300), randf_range(0, 300)))
	var bad := r.recognize(scribble)
	_check(Spells.power_for(bad["score"]) == 0.0, "scribble fails (%.2f)" % bad["score"])


func _spawn_dummy(offset: Vector3) -> Enemy:
	var e := Enemy.new()
	e.setup("cultist", null, 1)
	e.position = main.player.global_position + offset
	main.add_child(e)
	e.state = Fighter.State.IDLE
	return e


func _test_swings() -> void:
	var p: Player = main.player
	# The mouse drag held during wind-up is what picks the cut.
	var drags := [Vector2(-100, 0), Vector2(100, 0), Vector2(0, 100), Vector2(0, -100)]
	for type in [Fighter.Swing.SLASH_RL, Fighter.Swing.SLASH_LR, Fighter.Swing.OVERHEAD, Fighter.Swing.THRUST]:
		var e := _spawn_dummy(Vector3(0, 0, -1.4))
		await _frames(2)
		p.facing_angle = 0.0
		p.desired_facing = 0.0
		p.stamina = p.max_stamina
		p.state = Fighter.State.IDLE
		var before := e.health
		p.begin_windup(type)
		p._drag = drags[type]
		await _frames(20)
		_check(p.swing_type == type, "drag selects %s" % Fighter.SWING_NAMES[type])
		p.release_swing(1.0)
		await _frames(40)
		_check(e.health < before, "%s hits (%.0f -> %.0f)" % [Fighter.SWING_NAMES[type], before, e.health])
		e.queue_free()
		await _frames(2)

	# A parry staggers the attacker.
	var foe := _spawn_dummy(Vector3(0, 0, -1.4))
	await _frames(2)
	p.state = Fighter.State.IDLE
	p.facing_angle = 0.0
	foe.facing_angle = PI
	foe.target = null
	Input.action_press("guard")
	await _frames(1)
	foe.begin_windup(Fighter.Swing.OVERHEAD)
	foe.release_swing(1.0)
	await _frames(12)
	_check(foe.state == Fighter.State.STAGGER, "parry staggers attacker")
	foe.queue_free()
	Input.action_release("guard")
	await _frames(2)


func _test_spells() -> void:
	var p: Player = main.player
	p.health = p.max_health
	for glyph in ["ember", "storm", "ward"]:
		var e := _spawn_dummy(Vector3(0, 0, -2.0))
		await _frames(2)
		var before := e.health
		Spells.detonate(glyph, 1.0, p, e.global_position if glyph != "ward" else p.global_position)
		await _frames(3)
		_check(e.health < before, "%s damages (%.0f -> %.0f)" % [glyph, before, e.health])
		e.queue_free()
	p.aim_point = p.global_position + Vector3(0, 0, -4)
	var paper := p.paper
	p.cast_glyph("ember", 1.0)
	await _frames(60)
	_check(p.paper == paper - 1, "casting spends paper")
