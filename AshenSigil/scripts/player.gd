class_name Player
extends Fighter
## Hold LMB to wind up, drag the mouse while holding to pick the cut,
## release to swing. RMB guards (early guard = parry), Space dodges,
## Q opens the parchment to ink a sigil.

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

var _drag := Vector2.ZERO
var _combo_flip := false
var _buffer_t := 0.0
var _buffer_released := false
var _auto_release := false


func _init() -> void:
	team = 0
	max_health = 120.0
	move_speed = 4.8
	weapon_damage = 24.0
	weapon_reach = 1.7
	weapon_length = 1.15
	body_color = Color(0.16, 0.15, 0.17)
	windup_glow = Color(1.0, 0.75, 0.35)


func _dress() -> void:
	var cloak := Color(0.1, 0.09, 0.1)
	_part(_cone(0.42, 1.1, 0.26), Vector3(0.0, 0.8, 0.05), cloak)
	_part(_cone(0.23, 0.42, 0.0), Vector3(0.0, 1.82, 0.02), cloak)
	_glow_part(_box(Vector3(0.12, 0.18, 0.12)), Vector3(-0.34, 0.95, -0.05), Color(1.0, 0.7, 0.35), 4.0)
	var lantern := OmniLight3D.new()
	lantern.light_color = Color(1.0, 0.72, 0.45)
	lantern.light_energy = 1.7
	lantern.omni_range = 9.0
	lantern.omni_attenuation = 1.3
	lantern.position = Vector3(0.0, 2.3, 0.0)
	lantern.set_script(preload("res://scripts/flicker.gd"))
	add_child(lantern)


func _think(delta: float) -> void:
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
	if is_dead():
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
