class_name Enemy
extends Fighter
## Creatures of the road. They telegraph (weapon glows red while winding up),
## keep spacing, circle you, and get in each other's way. Each kind gives you
## something to read and punish:
##   ghoul    no poise, so every blow staggers it. Crouches and leaps from a
##            few paces, and lands open.
##   cultist  raises a ward against a blow it sees coming (an overhead, heavy or
##            finisher smashes it; so does circling round), and at range
##            channels fire you can interrupt by hitting it.
##   brute    heavy poise: light blows only make it flinch. Its overhead is slow
##            to recover, and it's open to punishment while it does.

## Blows on an exposed foe (landing from a leap, recovering from a brute's
## overhead) land this much harder and wear twice the poise.
const EXPOSED_DAMAGE := 1.5
const LEAP_WINDUP := 0.45
const CHANNEL_TIME := 1.4
const CAST_DELAY := 0.7
const CAST_RADIUS := 1.5
const WARD_TIME := 1.1
const WARD_COLOR := Color(0.7, 0.55, 1.0)

static var _ring_mat: StandardMaterial3D

var kind := "ghoul"
var target: Fighter
var windup_len := 0.5
var cooldown := 1.5
var strafe := 1.0
var swings: Array = [Swing.SLASH_RL, Swing.SLASH_LR]
var eye_color := Color(0.8, 1.0, 0.3)
var body_scale := 1.0
## The ghoul's current attack is a leap.
var leaping := false
## The cultist is channelling fire.
var channeling := false

var _ward_t := 0.0
var _ward_cd := 0.0
var _saw_windup := false
var _channel_t := 0.0
var _cast_cd := 3.0
var _ward_mesh: MeshInstance3D
var _orb: MeshInstance3D
var _orb_mat: StandardMaterial3D


func setup(k: String, t: Fighter, wave: int) -> void:
	kind = k
	target = t
	team = 1
	strafe = 1.0 if randf() < 0.5 else -1.0
	match kind:
		"ghoul":
			max_health = 45.0
			move_speed = 5.0
			weapon_damage = 11.0
			weapon_reach = 1.15
			weapon_length = 0.5
			weapon_color = Color(0.62, 0.58, 0.5)
			body_color = Color(0.36, 0.36, 0.3)
			skin_color = Color(0.42, 0.44, 0.38)
			windup_len = 0.42
			poise_power = 0.8
		"cultist":
			max_health = 85.0
			move_speed = 3.6
			weapon_damage = 19.0
			weapon_reach = 1.7
			weapon_length = 1.1
			weapon_texture = "rusty_metal_02"
			weapon_color = Color(0.75, 0.7, 0.65)
			body_color = Color(0.4, 0.13, 0.1)
			eye_color = Color(1.0, 0.2, 0.1)
			windup_len = 0.7
			swings = [Swing.SLASH_RL, Swing.SLASH_LR, Swing.OVERHEAD, Swing.THRUST]
			max_poise = 45.0
			poise_power = 0.9
		"brute":
			max_health = 190.0
			move_speed = 2.8
			weapon_damage = 34.0
			weapon_reach = 2.1
			weapon_length = 1.5
			weapon_texture = "rusty_metal_02"
			weapon_color = Color(0.6, 0.55, 0.5)
			body_color = Color(0.3, 0.26, 0.22)
			skin_color = Color(0.35, 0.3, 0.28)
			eye_color = Color(1.0, 0.55, 0.1)
			windup_len = 0.95
			radius = 0.5
			body_scale = 1.35
			swings = [Swing.OVERHEAD]
			max_poise = 120.0
			poise_power = 1.6
	max_health *= 1.0 + 0.08 * (wave - 1)
	max_poise *= 1.0 + 0.05 * (wave - 1)


func _dress() -> void:
	visual.scale = Vector3.ONE * body_scale
	match kind:
		"ghoul":
			# Hunched, long-armed, too thin.
			_part(_capsule(0.05, 0.95), Vector3(-0.3, 0.95, -0.15), skin_color)
			_part(_capsule(0.05, 0.95), Vector3(0.3, 0.95, -0.15), skin_color)
			visual.get_child(3).rotation.x = -0.35  # hunched chest
		"cultist":
			_part(_cone(0.42, 1.2, 0.22), Vector3(0.0, 0.62, 0.0), body_color, true, cloth_texture)
			_part(_cone(0.2, 0.4, 0.0), Vector3(0.0, 1.76, 0.02), body_color.darkened(0.35), true, cloth_texture)
			_dress_cultist_magic()
		"brute":
			var pauldron := _part(_box(Vector3(0.8, 0.22, 0.36)), Vector3(0.0, 1.45, 0.0), Color(0.6, 0.55, 0.5), true, "rusty_metal_02")
			pauldron.rotation.z = 0.05
			_part(_cone(0.05, 0.26), Vector3(-0.12, 1.82, 0.0), Color(0.62, 0.58, 0.5))
			_part(_cone(0.05, 0.26), Vector3(0.12, 1.82, 0.0), Color(0.62, 0.58, 0.5))
	_glow_part(_sphere(0.022), Vector3(-0.045, 1.68, -0.1), eye_color, 1.6)
	_glow_part(_sphere(0.022), Vector3(0.045, 1.68, -0.1), eye_color, 1.6)
	# Rise out of the earth.
	visual.position.y = -1.9
	create_tween().tween_property(visual, "position:y", 0.0, 0.9).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	stagger(1.1)


## The ward (a shell of violet light, bulging out in front, so it reads from
## any angle the camera sees it) and the orb of fire that swells while
## channelling. Both always draw, shrunk to nothing when idle, so their shaders
## are built during the loading warm-up rather than mid-fight.
func _dress_cultist_magic() -> void:
	var shell := SphereMesh.new()
	shell.radius = 0.62
	shell.height = 1.5
	shell.radial_segments = 24
	shell.rings = 12
	var ward_mat := StandardMaterial3D.new()
	ward_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ward_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ward_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	ward_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ward_mat.albedo_color = Color(WARD_COLOR, 0.12)
	_ward_mesh = MeshInstance3D.new()
	_ward_mesh.mesh = shell
	_ward_mesh.material_override = ward_mat
	_ward_mesh.position = Vector3(0, 1.15, -0.22)
	_ward_mesh.scale = Vector3.ONE * 0.001
	_ward_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	visual.add_child(_ward_mesh)
	_orb = _glow_part(_sphere(0.1), Vector3(0, 1.25, -0.38), Color(1.0, 0.45, 0.15), 0.0)
	_orb_mat = _orb.material_override as StandardMaterial3D
	_orb.scale = Vector3.ONE * 0.001


func _think(delta: float) -> void:
	move_input = Vector3.ZERO
	_ward_cd -= delta
	_cast_cd -= delta
	if kind == "cultist":
		_ward_mesh.scale = Vector3.ONE * (1.0 if guarding else 0.001)
	if target == null or target.is_dead():
		set_guard(false)
		return
	var to := target.global_position - global_position
	to.y = 0.0
	var dist := to.length()
	var dir := to / maxf(dist, 0.01)
	desired_facing = yaw_to(target.global_position)
	cooldown -= delta
	var sep := _separation()
	if channeling:
		_tick_channel(delta)
		return
	if guarding:
		# Holding the ward: stand ground until it fades.
		_ward_t -= delta
		move_input = sep * 0.5
		if _ward_t <= 0.0:
			set_guard(false)
		return
	if target.state != State.WINDUP:
		_saw_windup = false
	match state:
		State.WINDUP:
			move_input = Vector3.ZERO if leaping else dir * 0.3
			if state_time >= (LEAP_WINDUP if leaping else windup_len):
				_release(dist)
		State.IDLE:
			leaping = false
			if kind == "ghoul" and cooldown <= 0.0 and stamina > 20.0 and dist > 2.6 and dist < 5.5 and randf() < delta * 2.0:
				if begin_windup(Swing.THRUST):
					leaping = true
					cooldown = randf_range(2.2, 3.2)
				return
			if kind == "cultist":
				if _cast_cd <= 0.0 and dist > 3.5 and dist < 9.0:
					channeling = true
					_channel_t = 0.0
					_cast_cd = randf_range(5.0, 7.0)
					return
				if _should_ward(dist):
					set_guard(true)
					if guarding:
						_ward_t = WARD_TIME
						_ward_cd = 2.5
					return
			if dist > weapon_reach + 0.4:
				move_input = dir + sep
			elif cooldown <= 0.0 and stamina > 20.0:
				begin_windup(swings.pick_random())
				cooldown = randf_range(0.6, 1.5) if kind == "ghoul" else randf_range(1.2, 2.4)
			else:
				if randf() < delta * 0.4:
					strafe = -strafe
				var side := Vector3(-dir.z, 0.0, dir.x) * strafe
				move_input = side * 0.6 + sep
				if dist < weapon_reach - 0.4:
					move_input -= dir * 0.6


func _release(dist: float) -> void:
	release_swing(1.0)
	if leaping:
		# A long, flying thrust that covers the gap and lands hard, then a
		# slow scramble up: the opening.
		swing_power = 1.4
		swing_slow = 2.6
		recover_slow = 3.5
		_step = clampf(dist - 0.7, 1.2, 5.0)
	elif kind == "brute":
		recover_slow = 2.4  # the overhead buries itself: time to punish


## Wards once per blow it sees coming, if the blow could reach it.
func _should_ward(dist: float) -> bool:
	if target.state != State.WINDUP or _saw_windup or dist > target.weapon_reach + 1.6:
		return false
	_saw_windup = true
	return _ward_cd <= 0.0 and randf() < 0.65


func _tick_channel(delta: float) -> void:
	if state != State.IDLE:
		_end_channel()
		return
	_channel_t += delta
	var t := _channel_t / CHANNEL_TIME
	_orb.scale = Vector3.ONE * lerpf(0.4, 1.6, t)
	_orb_mat.emission_energy_multiplier = 1.5 + 3.0 * t + sin(_channel_t * 25.0) * 0.6
	if _channel_t >= CHANNEL_TIME:
		_end_channel()
		_cast_fire(target.global_position)


func _end_channel() -> void:
	channeling = false
	_orb.scale = Vector3.ONE * 0.001
	_orb_mat.emission_energy_multiplier = 0.0


## Marks the ground under the hunter, and a moment later it erupts.
func _cast_fire(at: Vector3) -> void:
	if _ring_mat == null:
		_ring_mat = StandardMaterial3D.new()
		_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_ring_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_ring_mat.albedo_color = Color(1.0, 0.35, 0.1, 0.6)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = CAST_RADIUS - 0.08
	torus.outer_radius = CAST_RADIUS
	torus.rings = 40
	ring.mesh = torus
	ring.material_override = _ring_mat
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	Game.world.add_child(ring)
	ring.global_position = at + Vector3(0, 0.05, 0)
	ring.scale = Vector3(0.3, 0.05, 0.3)
	ring.create_tween().tween_property(ring, "scale", Vector3(1.0, 0.05, 1.0), CAST_DELAY * 0.8)
	ring.get_tree().create_timer(CAST_DELAY, false).timeout.connect(func() -> void:
		Fx.fire_burst(at, CAST_RADIUS)
		Game.shake(0.3)
		var hunter := Game.player
		if hunter and not hunter.is_dead():
			var d := hunter.global_position - at
			d.y = 0.0
			if d.length() <= CAST_RADIUS + hunter.radius:
				hunter.take_hit(ring, 20.0, d.normalized(), 7.0, 0.6, false)
		ring.queue_free())


## Landing from a leap, or recovering from a brute's overhead.
func exposed() -> bool:
	return state == State.RECOVER and (leaping or kind == "brute")


func take_hit(attacker: Node3D, dmg: float, dir: Vector3, force: float, stun: float, can_block := true, poise_dmg := -1.0) -> String:
	if exposed():
		dmg *= EXPOSED_DAMAGE
		if poise_dmg >= 0.0:
			poise_dmg *= 2.0
		Fx.sparks(global_position + Vector3(0, 1.2, 0), Color(1.0, 0.95, 0.8), 10)
	var result := super.take_hit(attacker, dmg, dir, force, stun, can_block, poise_dmg)
	if channeling and (result == "hit" or result == "broke"):
		# Any blow that lands breaks the channel, even one the poise shrugs off.
		_end_channel()
		Fx.sparks(global_position + Vector3(0, 1.25, 0) + forward() * 0.4, Color(1.0, 0.45, 0.15), 18)
		if state != State.STAGGER:
			stagger(0.8)
	return result


## Leap clearance: the ghoul only strikes as it comes down, not mid-flight.
func _sweep(p: float) -> void:
	if leaping and p < 0.6:
		return
	super._sweep(p)


func _animate(delta: float) -> void:
	super._animate(delta)
	if not leaping:
		return
	if state == State.WINDUP:
		visual.position.y = -0.18 * minf(state_time / LEAP_WINDUP, 1.0)  # coiling
	elif state == State.SWING:
		visual.position.y = sin(swing_progress() * PI) * 0.9


func _separation() -> Vector3:
	var push := Vector3.ZERO
	for n in get_tree().get_nodes_in_group("fighters"):
		var f := n as Fighter
		if f == self or f.team != team or f.is_dead():
			continue
		var d := global_position - f.global_position
		d.y = 0.0
		var l := d.length()
		if l < 1.6 and l > 0.01:
			push += d / l * (1.6 - l)
	return push
