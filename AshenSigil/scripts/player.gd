class_name Player
extends Fighter
## Hold LMB to wind up, drag the mouse while holding to pick the cut,
## release to swing. RMB guards (early guard = parry), Space dodges,
## Q opens the parchment to ink a sigil, E readies the mask's power.

signal paper_changed(count: int)
signal glyph_requested

const CAM_FWD := Vector3(-0.70710678, 0.0, -0.70710678)
const CAM_RIGHT := Vector3(0.70710678, 0.0, -0.70710678)
const FULL_CHARGE := 0.7
const DRAG_DEADZONE := 25.0
const SPELL_REACH := 9.0
## A click that lands while you're still busy is remembered this long (real seconds).
const ATTACK_BUFFER := 0.4
## A buffered click that was already released still winds up this long before swinging.
const TAP_WINDUP := 0.08

var cam: Camera3D
var aim_point := Vector3.ZERO
var paper := 8
var glyph_open := false
var facing_locked := false
## > 0 while the HUD should flash the stamina bar: a swing was refused for lack of it.
var winded_t := 0.0
## False until the run starts: the weapon is chosen, the mask on, the weapon drawn.
var ready_to_fight := false
var model: HunterModel
var weapon := ""
## The sigil inked on the mask, its strength, and the state of its power.
var mask_glyph := ""
var mask_power := 0.0
var imbue_armed := false
var imbue_cd := 0.0
## > 0 after a parry: the sword's next blow is a riposte.
var riposte_t := 0.0

var _drag := Vector2.ZERO
var _combo_flip := false
var _buffer_t := 0.0
var _buffer_released := false
var _auto_release := false


func _init() -> void:
	team = 0
	max_health = 120.0
	move_speed = 4.8
	windup_glow = Color(1.0, 0.7, 0.35)
	equip("sword")


## The hunter model from drex.glb. The weapon pivot stays: it's an invisible
## guide that the ArmRig aims the real arm along.
func _build_body() -> void:
	visual = Node3D.new()
	visual.name = "Visual"
	add_child(visual)
	model = HunterModel.new()
	visual.add_child(model)
	model.build(HIT_FLASH, windup_glow)
	body_mats = model.body_mats
	weapon_mat = model.weapon_mat
	weapon_pivot = Node3D.new()
	weapon_pivot.position = WEAPON_POS
	weapon_pivot.rotation = IDLE_POSE
	visual.add_child(weapon_pivot)
	model.rig.pivot = weapon_pivot
	model.set_weapon("")
	_dress()


## Takes up one of Weapons.ORDER: its handling, and the model puts the rest away.
func equip(kind: String) -> void:
	weapon = kind
	var s: Dictionary = Weapons.STATS[kind]
	weapon_damage = s.damage
	weapon_reach = s.reach
	swing_time_mult = s.time
	recover_mult = s.recover
	stamina_mult = s.stamina
	force_mult = s.force
	arc_mult = s.arc
	lunge_mult = s.lunge
	stun_bonus = s.stun
	dodge_cost = s.dodge
	whirl = kind == "flail"
	if model:
		model.set_weapon(kind)


func set_mask(glyph: String, power: float) -> void:
	mask_glyph = glyph
	mask_power = power
	model.mask_mat.emission = Spells.GLYPHS[glyph].color


## Puts the mask on, draws the weapon, and is ready to fight. instant skips
## the animations (tests).
func start_run(instant := false) -> void:
	if not instant:
		await model.play_action("MaskOn")
		await model.play_action("Draw_" + weapon.capitalize())
	model.rig.mask_on = true
	model.armed = true
	ready_to_fight = true


func _dress() -> void:
	var lantern := OmniLight3D.new()
	lantern.light_color = Color(1.0, 0.68, 0.4)
	lantern.light_energy = 1.6
	lantern.omni_range = 8.5
	lantern.omni_attenuation = 1.6
	lantern.shadow_enabled = true
	# Held a little toward the camera, so the side of the hero we see is lit.
	lantern.position = Vector3(0.7, 2.1, 0.7)
	# The hero sits inside their own lantern light; let it pass through them so
	# only the world around them throws shadows.
	for mi in visual.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lantern.set_script(preload("res://scripts/flicker.gd"))
	add_child(lantern)


func _think(delta: float) -> void:
	if not ready_to_fight:
		# Picking a weapon, inking the mask, gearing up: face the camera and wait.
		move_input = Vector3.ZERO
		desired_facing = -0.75 * PI
		return
	imbue_cd = maxf(0.0, imbue_cd - delta)
	riposte_t = maxf(0.0, riposte_t - delta)
	_update_aim()
	var iv := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
	move_input = CAM_RIGHT * iv.x + CAM_FWD * iv.y
	# The facing locks once you start winding up (the drag picks the cut) and
	# while the pen is down (the gesture isn't aiming).
	if state != State.WINDUP and not facing_locked:
		desired_facing = yaw_to(aim_point)
	if glyph_open:
		set_guard(false)
		return
	set_guard(Input.is_action_pressed("guard") and state == State.IDLE)
	winded_t = maxf(0.0, winded_t - Game.real_delta)
	if _buffer_t > 0.0:
		_buffer_t -= Game.real_delta
		if _try_windup():
			_buffer_t = 0.0
			_auto_release = _buffer_released
	if state == State.WINDUP:
		set_windup_type(_drag_to_swing())
		if _auto_release and state_time >= TAP_WINDUP:
			_release()
	super._think(delta)


func _unhandled_input(event: InputEvent) -> void:
	if is_dead() or not ready_to_fight:
		return
	if event.is_action_pressed("imbue"):
		ready_imbue()
		return
	if glyph_open:
		# Sigil mode owns the mouse; you can still dodge out of trouble.
		if event.is_action_pressed("dodge"):
			dodge(move_input if move_input.length() > 0.1 else -forward())
		return
	if event.is_action_pressed("attack"):
		_drag = Vector2.ZERO
		if not _try_windup():
			# Still recovering, staggered or dodging: remember the click.
			_buffer_t = ATTACK_BUFFER
			_buffer_released = false
	elif event.is_action_released("attack"):
		if state == State.WINDUP:
			_release()
		elif _buffer_t > 0.0:
			_buffer_released = true
	elif event is InputEventMouseMotion and state == State.WINDUP:
		_drag += (event as InputEventMouseMotion).relative
	elif event.is_action_pressed("dodge"):
		var d := move_input if move_input.length() > 0.1 else -forward()
		dodge(d)
	elif event.is_action_pressed("glyph") and state != State.WINDUP and state != State.SWING:
		if paper > 0:
			glyph_requested.emit()
		else:
			Game.toast("No paper left.", Color(0.8, 0.5, 0.4))


func _try_windup() -> bool:
	if begin_windup(_default_slash()):
		_auto_release = false
		return true
	if can_attack() and stamina < 5.0:
		winded_t = 0.5
	return false


func _release() -> void:
	var power := remap(clampf(state_time, 0.1, FULL_CHARGE), 0.1, FULL_CHARGE, 0.6, 1.5)
	_auto_release = false
	_assist_aim()
	release_swing(power)
	_combo_flip = not _combo_flip


## E: wakes the mask's sigil in the weapon; the next blow that lands releases it.
func ready_imbue() -> bool:
	if mask_glyph == "" or imbue_armed:
		return false
	if imbue_cd > 0.0:
		Game.toast("The mask is still cooling.", Color(0.7, 0.6, 0.55))
		return false
	imbue_armed = true
	Fx.sparks(global_position + Vector3(0, 1.75, 0) + forward() * 0.15, Spells.GLYPHS[mask_glyph].color, 14)
	return true


func imbue_info() -> Dictionary:
	return Imbue.info(weapon, mask_glyph) if mask_glyph != "" else {}


func _strike_damage(o: Fighter, dmg: float) -> float:
	if weapon == "dagger":
		var from_o := global_position - o.global_position
		from_o.y = 0.0
		if o.forward().dot(from_o.normalized()) < -0.3:
			Fx.sparks(o.global_position + Vector3(0, 1.2, 0), Color(1.0, 0.2, 0.1), 16)
			Game.toast("Backstab", Color(0.9, 0.3, 0.2))
			return dmg * 3.0
	if weapon == "sword" and riposte_t > 0.0:
		riposte_t = 0.0
		Fx.sparks(o.global_position + Vector3(0, 1.2, 0), Color(1.0, 0.85, 0.4), 16)
		Game.toast("Riposte", Color(1.0, 0.85, 0.5))
		return dmg * 2.0
	return dmg


func _on_strike(o: Fighter, result: String) -> void:
	if imbue_armed and (result == "hit" or result == "blocked"):
		imbue_armed = false
		imbue_cd = Imbue.COOLDOWN
		Imbue.unleash(weapon, mask_glyph, mask_power, self, o)


func take_hit(attacker: Node3D, dmg: float, dir: Vector3, force: float, stun: float, can_block := true) -> String:
	var result := super.take_hit(attacker, dmg, dir, force, stun, can_block)
	if result == "parried":
		riposte_t = 1.5
	return result


func charge() -> float:
	return clampf(state_time / FULL_CHARGE, 0.0, 1.0) if state == State.WINDUP else 0.0


func add_paper(n: int) -> void:
	paper += n
	paper_changed.emit(paper)


## Where a sigil would land right now: the cursor, clamped to throwing range.
func spell_target(glyph: String) -> Vector3:
	if glyph == "ward":
		return global_position
	var flat := aim_point - global_position
	flat.y = 0.0
	return global_position + flat.limit_length(SPELL_REACH)


## Called when a prepared sigil is cast: spends the sheet and throws it.
func cast_glyph(glyph: String, power: float) -> void:
	paper -= 1
	paper_changed.emit(paper)
	var hand := global_position + Vector3(0, 1.3, 0) + forward() * 0.4
	var paper_node := SpellPaper.new()
	paper_node.setup(glyph, power, self, hand, spell_target(glyph))
	Game.world.add_child(paper_node)


func _animate(delta: float) -> void:
	super._animate(delta)
	visual.position.y = 0.0  # the walk cycle has its own bob
	var rig := model.rig
	var aiming := model.armed and (state == State.WINDUP or state == State.SWING or state == State.RECOVER or guarding)
	rig.aim = move_toward(rig.aim, 1.0 if aiming else 0.0, delta * (9.0 if aiming else 4.0))
	rig.bend = clampf((weapon_pivot.position.z - WEAPON_POS.z) / 0.35, 0.0, 1.0)
	var flung := 0.0
	match state:
		State.SWING: flung = 1.0
		State.WINDUP: flung = 0.5
	rig.spin = flung
	model.update_locomotion(Vector2(move_vel.x, move_vel.z).length())


## While the mask's power is ready the weapon burns in its sigil's colour, and
## the mask glows faintly whenever it can be woken.
func _update_glow(delta: float) -> void:
	super._update_glow(delta)
	var t := Time.get_ticks_msec() / 1000.0
	if imbue_armed:
		weapon_mat.emission = Spells.GLYPHS[mask_glyph].color
		weapon_mat.emission_energy_multiplier = 1.6 + 0.8 * sin(t * 9.0)
	else:
		weapon_mat.emission = windup_glow
	if model.mask_mat and mask_glyph != "":
		var lit := 1.4 if imbue_armed else (0.35 + 0.2 * sin(t * 2.5) if imbue_cd <= 0.0 else 0.0)
		model.mask_mat.emission_energy_multiplier = lit


func _update_aim() -> void:
	if cam == null:
		return
	var mp := get_viewport().get_mouse_position()
	var from := cam.project_ray_origin(mp)
	var dir := cam.project_ray_normal(mp)
	if absf(dir.y) > 0.0001:
		aim_point = from + dir * (-from.y / dir.y)


func _default_slash() -> Swing:
	return Swing.SLASH_LR if _combo_flip else Swing.SLASH_RL


func _drag_to_swing() -> Swing:
	if _drag.length() < DRAG_DEADZONE:
		return _default_slash()
	if absf(_drag.x) > absf(_drag.y) * 0.8:
		return Swing.SLASH_LR if _drag.x > 0.0 else Swing.SLASH_RL
	return Swing.OVERHEAD if _drag.y > 0.0 else Swing.THRUST


## Soft lock: on release, turn to the nearest foe roughly in front of you.
func _assist_aim() -> void:
	var best: Fighter = null
	var best_d := weapon_reach + 2.0
	for o in opponents():
		var rel := wrapf(yaw_to(o.global_position) - facing_angle, -PI, PI)
		var d := flat_dist(o)
		if absf(rel) < 0.9 and d < best_d:
			best = o
			best_d = d
	if best:
		facing_angle = yaw_to(best.global_position)
		desired_facing = facing_angle
