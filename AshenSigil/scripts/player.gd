class_name Player
extends Fighter
## Tap LMB for a cut; hold it until the weapon flares for a heavy blow. Taps
## run a string: slash, reverse slash, finisher. Dragging while holding picks
## a particular cut instead. RMB guards (early guard = parry), Space dodges,
## Q opens the parchment to ink a sigil, E readies the mask's power.
## A wind-up can be feinted into a guard or dodge, and the next attack, guard
## or dodge can cut a recovery short.

signal paper_changed(count: int)
signal glyph_requested

const CAM_FWD := Vector3(-0.70710678, 0.0, -0.70710678)
const CAM_RIGHT := Vector3(0.70710678, 0.0, -0.70710678)
const DRAG_DEADZONE := 25.0
const SPELL_REACH := 9.0
## A click that lands while you're still busy is remembered this long (real
## seconds). Short, so you don't swing after you've changed your mind.
const ATTACK_BUFFER := 0.25
## Even a tap winds up this long, so the cut has a readable anticipation.
const TAP_WINDUP := 0.08
## A dodge pressed while still busy is remembered this long (real seconds).
const DODGE_BUFFER := 0.2
## Tapping again within this long of a cut ending carries the string on.
const COMBO_WINDOW := 0.45
## The light string: slash, reverse slash, then a committed finisher.
const COMBO := [Fighter.Swing.SLASH_RL, Fighter.Swing.SLASH_LR, Fighter.Swing.OVERHEAD]
## Soft lock: foes within this angle of where you aimed draw your swing to them.
const LOCK_CONE := 0.9
## The most the release nudges you onto a foe; the wind-up does the rest of the turn.
const RELEASE_NUDGE := 0.35

var cam: Camera3D
## Where the hunter is aiming. Held still from the moment you click until you
## move the mouse after the swing, so the drag that picks the cut doesn't aim.
var aim_point := Vector3.ZERO
## Where the cursor actually is on the ground.
var cursor_point := Vector3.ZERO
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

## Which cut of the light string comes next (0..2).
var combo_step := 0

var _drag := Vector2.ZERO
var _since_swing := 0.0
var _heavy_cued := false
var _ready_sfx: AudioStreamPlayer
var _buffer_t := 0.0
var _buffer_released := false
var _auto_release := false
var _aim_held := false
var _aim_offset := Vector3.ZERO
var _dodge_buffer_t := 0.0


func _init() -> void:
	team = 0
	max_health = 120.0
	move_speed = 4.8
	windup_glow = Color(1.0, 0.7, 0.35)
	# The hunter keeps most of their footwork while attacking and turns quickly
	# onto a target while winding up.
	windup_move = 0.75
	swing_move = 0.55
	recover_move = 0.7
	windup_turn = 12.0
	# Quick to start and quicker to stop or turn back.
	accel = 30.0
	brake = 2.5
	equip("sword")


## The hunter model from drex.glb. The weapon pivot stays: it's an invisible
## guide that the ArmRig aims the real arm along.
func _build_body() -> void:
	_make_visual()
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
	poise_power = s.poise
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
	smooth.add_child(lantern)
	_ready_sfx = AudioStreamPlayer.new()
	_ready_sfx.stream = Sfx.get_sound("ready")
	_ready_sfx.volume_db = -8.0
	add_child(_ready_sfx)


func _think(delta: float) -> void:
	if not ready_to_fight:
		# Picking a weapon, inking the mask, gearing up: face the camera and wait.
		move_input = Vector3.ZERO
		desired_facing = -0.75 * PI
		return
	imbue_cd = maxf(0.0, imbue_cd - delta)
	riposte_t = maxf(0.0, riposte_t - delta)
	_since_swing = _since_swing + delta if state == State.IDLE else 0.0
	# After a plain tap, aim follows the cursor again as soon as the cut is done.
	# After a drag (which moved the cursor to pick the cut) it holds until you
	# move the mouse, so the hunter doesn't whip round.
	if _aim_held and _drag.length() < DRAG_DEADZONE and state != State.WINDUP and state != State.SWING and _buffer_t <= 0.0:
		_aim_held = false
	_update_aim()
	var iv := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
	move_input = CAM_RIGHT * iv.x + CAM_FWD * iv.y
	# Winding up turns you onto the foe nearest where you aimed; otherwise you
	# face the aim point. The pen being down (drawing a sigil) isn't aiming.
	if not facing_locked:
		var foe := _lock_target() if state == State.WINDUP else null
		desired_facing = yaw_to(foe.global_position if foe else aim_point)
	if glyph_open:
		set_guard(false)
		return
	var want_guard := Input.is_action_pressed("guard")
	if want_guard and (state == State.WINDUP or (state == State.RECOVER and state_time >= recover_time() * 0.3)):
		# Guarding cancels a wind-up (a feint) or cuts the recovery short.
		_set_state(State.IDLE)
		_auto_release = false
		_buffer_t = 0.0
		combo_step = 0
	set_guard(want_guard and state == State.IDLE)
	winded_t = maxf(0.0, winded_t - Game.real_delta)
	if _dodge_buffer_t > 0.0:
		_dodge_buffer_t -= Game.real_delta
		if _dodge():
			_dodge_buffer_t = 0.0
	if _buffer_t > 0.0:
		_buffer_t -= Game.real_delta
		if _try_windup():
			_buffer_t = 0.0
			_auto_release = _buffer_released
	if state == State.WINDUP:
		set_windup_type(_drag_to_swing())
		if _auto_release and state_time >= TAP_WINDUP:
			_release()
		elif not _heavy_cued and state_time >= heavy_time():
			# Charged: the weapon flares and rings, and releasing now is a heavy blow.
			_heavy_cued = true
			_ready_sfx.play()
			Fx.sparks(global_position + Vector3(0, 1.3, 0) + forward() * 0.4, windup_glow, 12)
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
			_dodge()
		return
	if event.is_action_pressed("attack"):
		_drag = Vector2.ZERO
		_aim_held = true
		if not _try_windup():
			# Still recovering, staggered or dodging: remember the click.
			_buffer_t = ATTACK_BUFFER
			_buffer_released = false
	elif event.is_action_released("attack"):
		if state == State.WINDUP:
			if state_time < TAP_WINDUP:
				_auto_release = true  # swings as soon as the short wind-up has read
			else:
				_release()
		elif _buffer_t > 0.0:
			_buffer_released = true
	elif event is InputEventMouseMotion:
		if state == State.WINDUP:
			_drag += (event as InputEventMouseMotion).relative
		elif state != State.SWING and _buffer_t <= 0.0:
			_aim_held = false  # the swing is done and you're aiming again
	elif event.is_action_pressed("dodge"):
		if not _dodge():
			_dodge_buffer_t = DODGE_BUFFER
	elif event.is_action_pressed("glyph") and state != State.WINDUP and state != State.SWING:
		if paper > 0:
			glyph_requested.emit()
		else:
			Game.toast("No paper left.", Color(0.8, 0.5, 0.4))


func _try_windup() -> bool:
	if _since_swing > COMBO_WINDOW:
		combo_step = 0  # paused too long: the string starts over
	if begin_windup(_default_slash()):
		_auto_release = false
		_heavy_cued = false
		return true
	if can_attack() and stamina < 5.0:
		winded_t = 0.5
	return false


func _dodge() -> bool:
	if dodge(move_input if move_input.length() > 0.1 else -forward()):
		combo_step = 0
		return true
	return false


## How long to hold for a heavy blow; quicker with light weapons.
func heavy_time() -> float:
	return clampf(0.5 * swing_time_mult, 0.35, 0.65)


## True when releasing now would be a heavy blow.
func heavy_ready() -> bool:
	return state == State.WINDUP and not _auto_release and state_time >= heavy_time()


## True when releasing now would be the finisher of the light string.
func finisher_next() -> bool:
	return combo_step == COMBO.size() - 1 and _drag.length() < DRAG_DEADZONE and not heavy_ready()


func _release() -> void:
	# Any release short of the charge is an ordinary, full-strength cut; a tap
	# isn't a weak mistake. Holding to the flare is a heavy.
	var heavy := heavy_ready()
	var finisher := finisher_next()
	var chosen := _drag.length() >= DRAG_DEADZONE
	_auto_release = false
	_assist_aim()
	release_swing(1.5 if heavy else 1.0, heavy, finisher)
	# Heavies and hand-picked cuts start the string over; taps carry it on.
	combo_step = 0 if heavy or chosen else (combo_step + 1) % COMBO.size()


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
	if imbue_armed and (result == "hit" or result == "broke" or result == "blocked"):
		imbue_armed = false
		imbue_cd = Imbue.COOLDOWN
		Imbue.unleash(weapon, mask_glyph, mask_power, self, o)


func take_hit(attacker: Node3D, dmg: float, dir: Vector3, force: float, stun: float, can_block := true, poise_dmg := -1.0) -> String:
	var result := super.take_hit(attacker, dmg, dir, force, stun, can_block, poise_dmg)
	if result == "parried":
		riposte_t = 1.5
	return result


func charge() -> float:
	return clampf(state_time / heavy_time(), 0.0, 1.0) if state == State.WINDUP else 0.0


## What the HUD calls the cut being wound up.
func windup_label() -> String:
	if heavy_ready():
		return "Heavy " + swing_name()
	return "Finisher" if finisher_next() else swing_name()


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
	var speed := Vector2(move_vel.x, move_vel.z).length()
	_pose_body(rig, speed, delta)
	model.update_locomotion(speed)


## The body sells the blow, exaggerated to read from the high camera: the torso
## winds away from the cut and turns through it, leans back into an overhead
## and over a thrust, and the legs plant a stance (fuller for heavier blows).
func _pose_body(rig: ArmRig, speed: float, delta: float) -> void:
	var p := weapon_pivot.rotation
	var twist := clampf(p.y * 0.32, -0.7, 0.7) * rig.aim
	var lean := clampf((0.3 - p.x) * 0.15, -0.22, 0.3) * rig.aim
	var stance := 0.0
	var committed := swing_heavy or swing_finisher or swing_type == Swing.OVERHEAD or swing_type == Swing.THRUST
	match state:
		State.WINDUP:
			committed = committed or heavy_ready() or finisher_next()
			stance = 1.0 if committed else 0.55
		State.SWING:
			stance = 1.0 if committed else 0.6
			if swing_type == Swing.THRUST and not whirl:
				lean += 0.22  # reach over the point
		State.RECOVER:
			stance = (1.0 if committed else 0.6) * (1.0 - state_time / maxf(recover_time(), 0.01))
	if is_whirl():
		twist = 0.0  # the whole body spins instead
	# Walking legs and a planted stance fight each other; ease off on the move.
	stance *= clampf(1.2 - speed / 4.0, 0.3, 1.0)
	var k := 1.0 - exp(-14.0 * delta)
	rig.twist = lerpf(rig.twist, twist, k)
	rig.lean = lerpf(rig.lean, lean, k)
	rig.stance = lerpf(rig.stance, stance, 1.0 - exp(-8.0 * delta))


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
		if state == State.WINDUP and not _auto_release:
			# A low warmth while charging; at the charge, a flare that settles to a
			# steady burn, so a heavy is unmistakable.
			var over := state_time - heavy_time()
			weapon_mat.emission_energy_multiplier = 0.8 * charge() if over < 0.0 else 2.5 + 4.0 * exp(-over * 10.0)
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
		cursor_point = from + dir * (-from.y / dir.y)
	if glyph_open:
		_aim_held = false  # sigils aim at the cursor
	if _aim_held:
		# Held as an offset, so walking during the swing doesn't swing your aim around.
		aim_point = global_position + _aim_offset
	else:
		aim_point = cursor_point
		_aim_offset = aim_point - global_position


## The foe nearest where you're aiming, within reach of a lunge, or null.
func _lock_target() -> Fighter:
	var aim_yaw := yaw_to(aim_point)
	var best: Fighter = null
	var best_d := weapon_reach + 2.0
	for o in opponents():
		var d := flat_dist(o)
		if absf(wrapf(yaw_to(o.global_position) - aim_yaw, -PI, PI)) < LOCK_CONE and d < best_d:
			best = o
			best_d = d
	return best


func _default_slash() -> Swing:
	return COMBO[combo_step]


func _drag_to_swing() -> Swing:
	if _drag.length() < DRAG_DEADZONE:
		return _default_slash()
	if absf(_drag.x) > absf(_drag.y) * 0.8:
		return Swing.SLASH_LR if _drag.x > 0.0 else Swing.SLASH_RL
	return Swing.OVERHEAD if _drag.y > 0.0 else Swing.THRUST


## Soft lock on release: the wind-up has been turning you onto the foe; a quick
## tap may not have finished, so close a small gap at once (hidden by the swing).
func _assist_aim() -> void:
	if facing_locked:
		return
	var foe := _lock_target()
	if foe:
		var want := yaw_to(foe.global_position)
		var gap := wrapf(want - facing_angle, -PI, PI)
		facing_angle = wrapf(facing_angle + clampf(gap, -RELEASE_NUDGE, RELEASE_NUDGE), -PI, PI)
		desired_facing = want
