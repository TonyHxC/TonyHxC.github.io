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
	# These swing at dummies placed in front, so facing is pinned rather than aimed.
	main.player.facing_locked = true
	await _test_swings()
	await _test_traits()
	await _test_imbue()
	await _test_foes()
	main.player.facing_locked = false
	await _test_flow()
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


func _spawn_dummy(offset: Vector3, kind := "cultist") -> Enemy:
	var e := Enemy.new()
	e.setup(kind, null, 1)
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
	foe.desired_facing = PI  # facing the hunter, as a real foe would
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


## Swings at a dummy and returns as soon as the cut is over (to catch a stagger).
func _swing_at(p: Player, e: Enemy, type := Fighter.Swing.SLASH_RL) -> void:
	await _frames(2)
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.facing_angle = p.yaw_to(e.global_position)
	p.desired_facing = p.facing_angle
	p.begin_windup(type)
	p._drag = DRAGS[type]
	await _frames(5)
	p.release_swing(1.0)
	while p.state == Fighter.State.SWING:
		await _frames(1)


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


## Poise, posture breaks, and each foe's opening.
func _test_foes() -> void:
	var p: Player = main.player
	p.equip("sword")
	p.invuln_left = 0.0
	# Earlier lunges have walked the hunter about; start from the open middle.
	p.global_position = Vector3.ZERO
	p.snap_visual()
	await _frames(2)
	# A ghoul has no poise: any blow staggers it.
	var ghoul := _spawn_dummy(Vector3(0, 0, -1.3), "ghoul")
	await _swing_at(p, ghoul)
	_check(ghoul.state == Fighter.State.STAGGER, "a light cut staggers a ghoul")
	ghoul.queue_free()

	# A cultist's poise shrugs off a light cut, but a finisher breaks it.
	var c := _spawn_dummy(Vector3(0, 0, -1.3))
	c.health = 400.0  # survives long enough to measure
	c.facing_angle = PI
	c.desired_facing = PI
	await _strike(p, c)
	_check(c.state == Fighter.State.IDLE and c.poise < c.max_poise and c.broken_t <= 0.0,
		"a light cut only flinches a cultist (poise %.0f / %.0f)" % [c.poise, c.max_poise])
	await _frames(2)
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.begin_windup(Fighter.Swing.OVERHEAD)
	await _frames(5)
	p.release_swing(1.0, false, true)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	_check(c.broken_t > 0.0 and c.state == Fighter.State.STAGGER, "a finisher breaks its posture")
	var hp := c.health
	var dealt := await _strike(p, c)
	_check(dealt > p.weapon_damage * 1.2, "a broken posture takes harder blows (%.0f)" % dealt)
	c.queue_free()

	# A ward blocks a light cut from the front; an overhead smashes it.
	var w := _spawn_dummy(Vector3(0, 0, -1.3))
	w.facing_angle = PI
	w.desired_facing = PI
	w.target = p
	w.cooldown = 99.0
	await _frames(2)
	w.state = Fighter.State.IDLE
	w.set_guard(true)
	w._ward_t = 5.0
	hp = w.health
	await _strike(p, w)
	_check(w.health == hp and w.guarding, "a cultist's ward blocks a light cut")
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	p.begin_windup(Fighter.Swing.OVERHEAD)
	p._drag = DRAGS[Fighter.Swing.OVERHEAD]
	await _frames(5)
	p.release_swing(1.0)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	_check(not w.guarding and w.broken_t > 0.0, "an overhead smashes the ward")
	w.queue_free()

	# Hitting a channelling cultist breaks the spell.
	var caster := _spawn_dummy(Vector3(0, 0, -1.3))
	caster.target = p
	caster.cooldown = 99.0
	caster._ward_cd = 99.0
	await _frames(2)
	caster.state = Fighter.State.IDLE
	caster.channeling = true
	caster._channel_t = 0.0
	await _swing_at(p, caster)
	_check(not caster.channeling and caster.state == Fighter.State.STAGGER, "a blow interrupts the cultist's channel")
	caster.queue_free()

	# A brute shrugs off light blows mid-swing, then recovers slowly and exposed.
	var brute := _spawn_dummy(Vector3(0, 0, -1.6), "brute")
	brute.health = 400.0
	brute.facing_angle = PI
	brute.desired_facing = PI
	await _frames(2)
	brute.state = Fighter.State.IDLE
	brute.begin_windup(Fighter.Swing.OVERHEAD)
	await _strike(p, brute)
	_check(brute.state == Fighter.State.WINDUP, "a light cut doesn't stop a brute's overhead")
	p.invuln_left = 3.0
	brute._release(2.0)
	while brute.state == Fighter.State.SWING:
		await _frames(1)
	_check(brute.state == Fighter.State.RECOVER and brute.exposed() and brute.recover_time() > 1.0,
		"the brute's overhead leaves it exposed (%.1fs)" % brute.recover_time())
	dealt = await _strike(p, brute)
	_check(dealt > p.weapon_damage * 1.4, "blows on an exposed brute land harder (%.0f)" % dealt)
	brute.queue_free()

	# A ghoul leaps the gap and lands open.
	var leaper := _spawn_dummy(Vector3(0, 0, -4.0), "ghoul")
	leaper.target = p
	await _frames(2)
	leaper.state = Fighter.State.IDLE
	leaper.cooldown = 99.0
	var gap := leaper.flat_dist(p)
	leaper.begin_windup(Fighter.Swing.THRUST)
	leaper.leaping = true
	var waited := 0
	while leaper.state != Fighter.State.RECOVER and waited < 120:
		await _frames(1)
		waited += 1
	_check(leaper.flat_dist(p) < gap - 2.0 and leaper.exposed(),
		"a ghoul leaps in (%.1f m -> %.1f m) and lands exposed" % [gap, leaper.flat_dist(p)])
	leaper.queue_free()
	p.invuln_left = 0.0
	p.health = p.max_health
	await _frames(5)


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


## The things that keep attacks fluid: soft lock, feints, cancels, chains, a planted lunge.
func _test_flow() -> void:
	var p: Player = main.player
	p.equip("sword")
	p.stamina = p.max_stamina
	p.state = Fighter.State.IDLE
	await _frames(2)
	# Winding up turns you onto the foe nearest where you aimed.
	var foe := _spawn_dummy(Vector3(1.2, 0, -1.2))
	await _frames(2)
	p._aim_held = true
	p._aim_offset = Vector3(0, 0, -3)  # aimed straight ahead; the foe is 45 degrees off
	p.facing_angle = 0.0
	p.begin_windup(Fighter.Swing.SLASH_RL)
	await _frames(15)
	var gap := absf(wrapf(p.yaw_to(foe.global_position) - p.facing_angle, -PI, PI))
	_check(gap < 0.15, "winding up turns onto the nearby foe (%.2f rad off)" % gap)
	p.release_swing(1.0)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	foe.queue_free()
	p._aim_held = false

	# The lunge plants: once the cut is done you don't keep sliding.
	p.state = Fighter.State.IDLE
	p.stamina = p.max_stamina
	p.move_vel = Vector3.ZERO
	p.impulse = Vector3.ZERO
	p._aim_held = true
	p._aim_offset = Vector3(0, 0, -3)
	var start := p.global_position
	p.begin_windup(Fighter.Swing.THRUST)
	p._drag = DRAGS[Fighter.Swing.THRUST]
	await _frames(3)
	p.release_swing(1.0)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	var after_swing := p.global_position
	await _frames(10)
	var lunge := start.distance_to(after_swing)
	var slide := after_swing.distance_to(p.global_position)
	_check(lunge > 0.5 and slide < 0.05, "thrust steps %.2f m and plants (slides %.3f m after)" % [lunge, slide])

	# The next swing can start early in the recovery.
	while p.state == Fighter.State.RECOVER and p.state_time < p.recover_time() * 0.35:
		await _frames(1)
	_check(p.can_attack(), "a new swing can start a third of the way into recovery")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# A wind-up can be feinted into a dodge or a guard.
	p.stamina = p.max_stamina
	p.begin_windup(Fighter.Swing.OVERHEAD)
	await _frames(5)
	_check(p.dodge(Vector3.BACK), "dodging out of a wind-up")
	while p.state != Fighter.State.IDLE:
		await _frames(1)
	p.stamina = p.max_stamina
	p.begin_windup(Fighter.Swing.OVERHEAD)
	await _frames(5)
	Input.action_press("guard")
	await _frames(2)
	_check(p.guarding and p.state == Fighter.State.IDLE, "guarding out of a wind-up (a feint)")
	Input.action_release("guard")
	await _frames(2)

	# Mid-swing you're committed; once the blow has passed you can dodge away.
	p.stamina = p.max_stamina
	p.begin_windup(Fighter.Swing.SLASH_RL)
	await _frames(2)
	p.release_swing(1.0)
	await _frames(2)
	var early := p.can_dodge()
	while p.swing_progress() < 0.75:
		await _frames(1)
	_check(not early and p.can_dodge(), "dodge is locked mid-cut, open at its tail")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# A click remembered from mid-swing swings at full strength, not the weakest.
	p.stamina = p.max_stamina
	p.begin_windup(Fighter.Swing.SLASH_RL)
	p.release_swing(1.0)
	await _frames(2)
	_click(p, true)
	_click(p, false)
	var swung := false
	for i in 90:
		await _frames(1)
		if p.state == Fighter.State.SWING:
			swung = true
			break
	_check(swung and is_equal_approx(p.swing_power, 1.0), "a buffered click swings at normal strength (%.2f)" % p.swing_power)
	while p.state != Fighter.State.IDLE:
		await _frames(1)
	p._aim_held = false
	await _test_attack_input()


## Tap for a full cut, hold for a heavy; taps run slash, reverse, finisher.
func _test_attack_input() -> void:
	var p: Player = main.player
	p.equip("sword")
	p.stamina = p.max_stamina
	p.combo_step = 0
	await _frames(40)  # let any old string lapse

	# A tap is an ordinary, full-strength cut, and aim is free once it's done.
	_click(p, true)
	_check(p._aim_held, "a click holds aim through the cut")
	_click(p, false)
	while p.state != Fighter.State.SWING:
		await _frames(1)
	_check(is_equal_approx(p.swing_power, 1.0) and not p.swing_heavy, "a tap swings at full strength (%.2f)" % p.swing_power)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	await _frames(1)
	_check(not p._aim_held, "after a tap, aim follows the cursor again")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# Holding to the flare is a heavy.
	p.stamina = p.max_stamina
	_click(p, true)
	while p.state_time < p.heavy_time() + 0.05:
		await _frames(1)
	_check(p.heavy_ready() and p._heavy_cued, "holding charges a heavy and cues it")
	_click(p, false)
	await _frames(1)
	_check(p.swing_heavy and p.swing_power > 1.4, "releasing at the flare swings heavy")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# Taps in rhythm: slash, reverse slash, finisher.
	p.combo_step = 0
	p._since_swing = 0.0
	var cuts := []
	var finishers := []
	for i in 3:
		p.stamina = p.max_stamina
		while not p.can_attack():
			await _frames(1)
		_click(p, true)
		_click(p, false)
		while p.state != Fighter.State.SWING:
			await _frames(1)
		cuts.append(p.swing_type)
		finishers.append(p.swing_finisher)
	_check(cuts == [Fighter.Swing.SLASH_RL, Fighter.Swing.SLASH_LR, Fighter.Swing.OVERHEAD] and finishers == [false, false, true],
		"taps run slash, reverse slash, finisher (%s)" % [cuts])
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# Pausing starts the string over.
	p.stamina = p.max_stamina
	p.combo_step = 1
	await _frames(int((Player.COMBO_WINDOW + 0.15) * 60.0))
	_click(p, true)
	_click(p, false)
	_check(p.swing_type == Fighter.Swing.SLASH_RL, "a pause starts the string over")
	while p.state != Fighter.State.IDLE:
		await _frames(1)

	# One sweep through a crowd pauses the game once.
	p.equip("sword")
	p.stamina = p.max_stamina
	var row: Array[Enemy] = []
	for x in [-1.0, 0.0, 1.0]:
		row.append(_spawn_dummy(Vector3(x, 0, -1.3 + absf(x) * 0.3)))
	await _frames(2)
	p.facing_locked = true
	p.facing_angle = 0.0
	p.desired_facing = 0.0
	var before := Game.hitstop_count
	var hp := 0.0
	for e in row:
		hp += e.health
	p.begin_windup(Fighter.Swing.SLASH_RL)
	await _frames(3)
	p.release_swing(1.0)
	while p.state == Fighter.State.SWING:
		await _frames(1)
	var after := 0.0
	for e in row:
		after += e.health
	_check(after < hp - 30.0 and Game.hitstop_count - before == 1,
		"one sweep through three foes pauses once (%d pauses)" % (Game.hitstop_count - before))
	for e in row:
		e.queue_free()
	p.facing_locked = false
	while p.state != Fighter.State.IDLE:
		await _frames(1)


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
