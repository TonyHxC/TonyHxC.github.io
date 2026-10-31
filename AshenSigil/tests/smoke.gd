extends Node
## Headless smoke test: godot --headless --path . res://tests/smoke.tscn

## The mouse drag that picks each cut, in Fighter.Swing order.
const DRAGS := [Vector2(-100, 0), Vector2(100, 0), Vector2(0, 100), Vector2(0, -100)]

var main: Node3D
var failures := 0


func _ready() -> void:
	main = preload("res://main.tscn").instantiate()
	add_child(main)
	main._next_wave_in = INF  # no real waves: they'd attack the player mid-test
	if not main.ready_to_play:
		await main.warmed_up
	_check(get_tree().get_nodes_in_group("fighters").size() == 1 and Fx._decals.is_empty(),
		"loading warm-up leaves no creatures or decals behind")
	await _frames(5)
	var canvas: Control = main.hud.glyph
	_check(canvas.size == get_viewport().get_visible_rect().size,
		"sigil overlay spans the screen (%s)" % canvas.size)
	_test_recognizer()
	await _test_run_start()
	await _test_sigil_mode()
	await _test_swings()
	await _test_traits()
	await _test_imbue()
	await _test_spells()
	print("SMOKE: %s (%d failures)" % ["PASS" if failures == 0 else "FAIL", failures])
	get_tree().quit(failures)


## The run opens on the weapon pick, then the mask; the hunter gears up and fights.
func _test_run_start() -> void:
	var p: Player = main.player
	var rs: RunStart = main.hud.run_start
	_check(rs.is_open() and rs.phase == RunStart.Phase.PICK and not p.ready_to_fight,
		"the run opens on the weapon pick")
	var shown := 0
	for k in p.model._weapon_nodes:
		for n in p.model._weapon_nodes[k]:
			shown += 1 if n.visible else 0
	_check(shown == 6, "the hunter carries the whole kit before choosing (%d pieces)" % shown)
	rs.pick("axe")
	_check(p.weapon == "axe" and rs.phase == RunStart.Phase.INK, "picking the axe takes it up and moves to the mask")
	var hidden_ok := true
	for k in p.model._weapon_nodes:
		for n in p.model._weapon_nodes[k]:
			if n.visible != (k == "axe"):
				hidden_ok = false
	_check(hidden_ok, "the other weapons are put away")
	var scribble := PackedVector2Array()
	for i in 40:
		scribble.append(Vector2(randf_range(200, 500), randf_range(200, 500)))
	rs.begin_stroke(scribble[0])
	for v in scribble:
		rs.add_point(v)
	rs.end_stroke()
	_check(rs.ink == RunStart.Ink.FADING, "a scribble won't take on the mask")
	await _frames(40)
	var tri := PackedVector2Array()
	for v in Spells.shapes()["ward"][0]:
		tri.append(v * 100.0)
	var pts := _wobbly(tri)
	rs.begin_stroke(pts[0])
	for v in pts:
		rs.add_point(v)
	rs.end_stroke()
	_check(rs.ink == RunStart.Ink.TAKEN and rs.glyph == "ward", "a triangle inks Repulsion on the mask")
	rs.confirm()
	_check(not rs.is_open() and p.mask_glyph == "ward", "putting on the mask closes the screen")
	var waited := 0
	while not p.ready_to_fight and waited < 600:
		await _frames(1)
		waited += 1
	_check(p.ready_to_fight and p.model.armed and p.model.rig.mask_on,
		"mask on and axe drawn, ready to fight (%.1fs)" % (waited / 60.0))
	_check(main._next_wave_in < INF, "the waves are coming")
	main._next_wave_in = INF


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


func _draw_stroke(ui: SigilUI, raw: PackedVector2Array, at: Vector2, scale: float) -> void:
	var pts := _wobbly(raw)
	ui.begin_stroke(pts[0] - Vector2(400, 300) + at)
	for i in range(1, pts.size()):
		ui.add_point((pts[i] - Vector2(400, 300)) * scale + at)
	ui.end_stroke()


func _test_sigil_mode() -> void:
	var p: Player = main.player
	var ui: SigilUI = main.hud.glyph
	var s := Spells.shapes()
	var start_paper := p.paper

	main._on_glyph_requested()
	_check(ui.is_open() and p.glyph_open, "Q opens sigil mode")
	var circle: PackedVector2Array = s["ember"][0]
	var big := PackedVector2Array()
	for v in circle:
		big.append(v * 100.0)
	# Drawn far from the sheet, at a large size: should still read.
	_draw_stroke(ui, big, Vector2(900, 200), 1.6)
	_check(ui.mode == SigilUI.Mode.PREPARED and ui.glyph == "ember", "circle drawn anywhere prepares Ember")
	_check(p.paper == start_paper, "preparing does not spend paper")
	ui.cast_prepared()
	await _frames(2)
	_check(p.paper == start_paper - 1 and not p.glyph_open, "click casts, spends one sheet and clears the UI")

	main._on_glyph_requested()
	var scribble := PackedVector2Array()
	for i in 40:
		scribble.append(Vector2(randf_range(-150, 150), randf_range(-150, 150)))
	ui.begin_stroke(scribble[0] + Vector2(400, 300))
	for v in scribble:
		ui.add_point(v + Vector2(400, 300))
	ui.end_stroke()
	_check(ui.mode == SigilUI.Mode.FADING and p.paper == start_paper - 1, "bad stroke fades and costs nothing")
	var waited := 0
	while ui.mode == SigilUI.Mode.FADING and waited < 600:
		await _frames(1)
		waited += 1
	_check(ui.mode == SigilUI.Mode.READY, "can retry after a bad stroke")

	var tri: PackedVector2Array = s["ward"][0]
	var big_tri := PackedVector2Array()
	for v in tri:
		big_tri.append(v * 100.0)
	_draw_stroke(ui, big_tri, Vector2(500, 400), 1.0)
	await _frames(2)
	_check(p.paper == start_paper - 2 and not ui.is_open(), "Repulsion casts immediately")

	main._on_glyph_requested()
	ui.close()
	_check(not p.glyph_open and not Game.slowmo, "Q / right-click puts it away")
	p.paper = start_paper


func _click(p: Player, pressed: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = pressed
	p._unhandled_input(ev)


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
	for w in Weapons.ORDER:
		p.equip(w)
		for type in [Fighter.Swing.SLASH_RL, Fighter.Swing.SLASH_LR, Fighter.Swing.OVERHEAD, Fighter.Swing.THRUST]:
			var e := _spawn_dummy(Vector3(0, 0, -1.4))
			await _frames(2)
			p.global_position.y = 0.0
			p.facing_angle = 0.0
			p.desired_facing = 0.0
			p.stamina = p.max_stamina
			p.state = Fighter.State.IDLE
			var before := e.health
			p.begin_windup(type)
			p._drag = DRAGS[type]
			await _frames(20)
			var cut := "%s %s" % [w, p.swing_name()]
			_check(p.swing_type == type, "drag selects %s" % cut)
			p.release_swing(1.0)
			await _frames(70)
			_check(e.health < before, "%s hits (%.0f -> %.0f)" % [cut, before, e.health])
			e.queue_free()
			await _frames(2)
	p.equip("axe")

	# A click while still recovering is remembered and swings as soon as it can.
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.begin_windup(Fighter.Swing.SLASH_RL)
	p.release_swing(1.0)
	while p.state != Fighter.State.RECOVER:
		await _frames(1)
	_click(p, true)
	_click(p, false)
	var swung := false
	for i in 90:
		await _frames(1)
		if p.state == Fighter.State.SWING:
			swung = true
			break
	_check(swung, "a quick click during recovery is buffered into a swing")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	p.stamina = 0.0
	_click(p, true)
	_check(p.state != Fighter.State.WINDUP and p.winded_t > 0.0, "a click with no stamina flashes the stamina bar")
	_click(p, false)
	p._buffer_t = 0.0  # don't let that buffered click swing during the next test
	p.stamina = p.max_stamina
	await _frames(30)

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


## Swings at a dummy standing in front and returns the damage dealt.
func _strike(p: Player, e: Enemy, type := Fighter.Swing.SLASH_RL) -> float:
	await _frames(2)
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.facing_angle = p.yaw_to(e.global_position)
	p.desired_facing = p.facing_angle
	var before := e.health
	p.begin_windup(type)
	p._drag = DRAGS[type]
	await _frames(10)
	p.release_swing(1.0)
	await _frames(70)
	return before - e.health


func _test_traits() -> void:
	var p: Player = main.player
	# The dagger strikes three times as hard from behind.
	p.equip("dagger")
	var front := _spawn_dummy(Vector3(0, 0, -1.2))
	front.facing_angle = PI  # facing the hunter
	front.desired_facing = PI
	var plain := await _strike(p, front)
	front.queue_free()
	var back := _spawn_dummy(Vector3(0, 0, -1.2))
	back.facing_angle = 0.0  # its back to the hunter
	back.desired_facing = 0.0
	back.stagger(5.0)
	var stab := await _strike(p, back)
	back.queue_free()
	_check(stab > plain * 2.0, "dagger backstab (%.0f vs %.0f)" % [stab, plain])

	# The flail's whirl strikes what's behind you.
	p.equip("flail")
	var behind := _spawn_dummy(Vector3(0, 0, 1.5))
	await _frames(2)
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.facing_angle = 0.0
	p.desired_facing = 0.0
	var hp := behind.health
	p.begin_windup(Fighter.Swing.THRUST)
	p._drag = DRAGS[Fighter.Swing.THRUST]
	await _frames(10)
	p.release_swing(1.0)
	await _frames(70)
	_check(behind.health < hp, "flail whirl strikes behind (%.0f -> %.0f)" % [hp, behind.health])
	behind.queue_free()

	# Burning keeps hurting without staggering.
	var burner := _spawn_dummy(Vector3(3, 0, 0))
	await _frames(2)
	burner.state = Fighter.State.IDLE
	hp = burner.health
	burner.ignite(2.0, 10.0, p)
	await _frames(60)
	_check(burner.health < hp - 5.0 and burner.state != Fighter.State.STAGGER, "burning hurts over time (%.0f -> %.0f)" % [hp, burner.health])
	burner.queue_free()
	await _frames(2)


## Every weapon with every sigil: E readies it, the next blow releases it.
func _test_imbue() -> void:
	var p: Player = main.player
	for w in Weapons.ORDER:
		p.equip(w)
		for g in ["ember", "storm", "ward"]:
			p.set_mask(g, 1.0)
			p.imbue_cd = 0.0
			p.imbue_armed = false
			p.invuln_left = 0.0
			var start := p.global_position
			var e := _spawn_dummy(Vector3(0, 0, -1.3))
			var other := _spawn_dummy(Vector3(1.6, 0, -2.4))
			var ok := p.ready_imbue() and p.imbue_armed
			var hp := e.health + other.health
			await _strike(p, e)
			var dealt := hp - maxf(e.health, 0.0) - maxf(other.health, 0.0)
			var title: String = Imbue.info(w, g).title
			_check(ok and not p.imbue_armed and p.imbue_cd > 0.0 and dealt > 0.0,
				"%s + %s: %s fires (%.0f dealt)" % [w, g, title, dealt])
			e.queue_free()
			other.queue_free()
			p.global_position = start
			p.health = p.max_health
			await _frames(30)
	_check(not p.ready_imbue(), "E does nothing while the mask is cooling")
	p.equip("axe")
	p.set_mask("ward", 1.0)
	p.imbue_cd = 0.0


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
