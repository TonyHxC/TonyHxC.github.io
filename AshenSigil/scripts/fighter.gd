class_name Fighter
extends CharacterBody3D
## Shared body for the player and every creature. Movement carries momentum,
## swings sweep through space and hit whatever the blade passes, and getting
## hit staggers you. The Exanima feel, with the steering done for you.

signal died(fighter: Fighter)
signal hurt(fighter: Fighter, amount: float)

enum State { IDLE, WINDUP, SWING, RECOVER, STAGGER, DODGE, DEAD }
enum Swing { SLASH_RL, SLASH_LR, OVERHEAD, THRUST }

const SWING_NAMES := ["Slash  <-", "Slash  ->", "Overhead", "Thrust"]
const SWING_TIME := [0.26, 0.26, 0.34, 0.2]
const RECOVER_TIME := [0.3, 0.3, 0.5, 0.26]
const SWING_DAMAGE := [1.0, 1.0, 1.4, 1.1]
const WEAPON_POS := Vector3(0.27, 1.42, -0.02)  # the sword shoulder
const IDLE_POSE := Vector3(-0.35, -0.35, 0.0)
const GUARD_POSE := Vector3(0.55, 1.2, 0.0)
const GUARD_POS := Vector3(0.24, 1.4, -0.12)
const PARRY_WINDOW := 0.22
const HIT_FLASH := Color(1.0, 0.25, 0.2)
const DODGE_TIME := 0.38

@export var team := 0
@export var max_health := 100.0
@export var max_stamina := 100.0
@export var move_speed := 4.5
@export var accel := 22.0
@export var weapon_damage := 20.0
@export var weapon_reach := 1.6
@export var weapon_length := 1.1
## CC0 texture names from assets/textures; "" means plain colour.
@export var weapon_texture := ""
@export var cloth_texture := "brown_leather"
@export var weapon_color := Color(0.55, 0.55, 0.58)
@export var windup_glow := Color(1.0, 0.15, 0.05)
@export var body_color := Color(0.3, 0.3, 0.32)
@export var skin_color := Color(0.62, 0.52, 0.45)
@export var radius := 0.35

## Weapon handling (see Weapons.STATS): scales on the base cut timings, cost,
## knockback, slash width and lunge, plus extra stun and the dodge's cost.
var swing_time_mult := 1.0
var recover_mult := 1.0
var stamina_mult := 1.0
var force_mult := 1.0
var arc_mult := 1.0
var lunge_mult := 1.0
var stun_bonus := 0.0
var dodge_cost := 22.0
## The thrust becomes a full spin that strikes all around (the flail).
var whirl := false

var health := 0.0
var stamina := 0.0
var state := State.IDLE
var state_time := 0.0
var swing_type := Swing.SLASH_RL
var swing_power := 1.0
var facing_angle := 0.0
var desired_facing := 0.0
var move_input := Vector3.ZERO
var move_vel := Vector3.ZERO
var impulse := Vector3.ZERO
var stagger_left := 0.0
var guarding := false
var guard_time := 0.0
var invuln_left := 0.0
var stamina_delay := 0.0

var visual: Node3D
var weapon_pivot: Node3D
var weapon_mat: StandardMaterial3D
var body_mats: Array[StandardMaterial3D] = []

var _blade_prev := 0.0
var _hit_list: Array = []
var _flash := 0.0
var _bob := 0.0
var _burn_left := 0.0
var _burn_dps := 0.0
var _burn_by: Fighter
var _burn_spark := 0.0


func _ready() -> void:
	health = max_health
	stamina = max_stamina
	add_to_group("fighters")
	collision_layer = 2
	collision_mask = 1 | 2
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = radius
	capsule.height = 1.8
	shape.shape = capsule
	shape.position.y = 0.9
	add_child(shape)
	_build_body()
	facing_angle = desired_facing


# --- body -------------------------------------------------------------------

func _build_body() -> void:
	visual = Node3D.new()
	visual.name = "Visual"
	add_child(visual)
	var legs := body_color.darkened(0.35)
	# Roughly seven and a half heads tall, with broad shoulders for a readable silhouette.
	_part(_capsule(0.085, 0.9), Vector3(-0.1, 0.45, 0.0), legs, true, cloth_texture)
	_part(_capsule(0.085, 0.9), Vector3(0.1, 0.45, 0.0), legs, true, cloth_texture)
	_part(_box(Vector3(0.34, 0.16, 0.2)), Vector3(0.0, 0.9, 0.0), legs, true, cloth_texture)
	var chest := _part(_capsule(0.19, 0.64), Vector3(0.0, 1.22, 0.0), body_color, true, cloth_texture)
	chest.scale = Vector3(1.2, 1.0, 0.85)
	_part(_box(Vector3(0.54, 0.1, 0.2)), Vector3(0.0, 1.46, 0.0), body_color, true, cloth_texture)
	_part(_capsule(0.05, 0.14), Vector3(0.0, 1.55, 0.0), skin_color)
	_part(_sphere(0.115), Vector3(0.0, 1.66, 0.0), skin_color)
	var off_arm := _part(_capsule(0.055, 0.62), Vector3(-0.3, 1.15, 0.0), body_color, true, cloth_texture)
	off_arm.rotation.z = -0.12

	# Sword arm and blade swing together from the shoulder.
	weapon_pivot = Node3D.new()
	weapon_pivot.position = WEAPON_POS
	weapon_pivot.rotation = IDLE_POSE
	visual.add_child(weapon_pivot)
	var arm := MeshInstance3D.new()
	arm.mesh = _capsule(0.055, 0.5)
	arm.rotation.x = PI / 2.0
	arm.position.z = -0.22
	var arm_mat := Look.cloth(cloth_texture, body_color) if cloth_texture != "" else Look.matte(body_color)
	_glowable(arm_mat, HIT_FLASH)
	arm.material_override = arm_mat
	body_mats.append(arm_mat)
	weapon_pivot.add_child(arm)
	if weapon_texture != "":
		weapon_mat = Look.cloth(weapon_texture, weapon_color, 3.0)
	else:
		weapon_mat = Look.matte(weapon_color)
		weapon_mat.metallic = 0.6
		weapon_mat.roughness = 0.55
	_glowable(weapon_mat, windup_glow)
	var blade := MeshInstance3D.new()
	blade.mesh = _box(Vector3(0.055, 0.022, weapon_length))
	blade.position.z = -(weapon_length * 0.5 + 0.55)
	blade.material_override = weapon_mat
	weapon_pivot.add_child(blade)
	var guard := MeshInstance3D.new()
	guard.mesh = _box(Vector3(0.24, 0.045, 0.045))
	guard.position.z = -0.53
	guard.material_override = Look.surface("rusty_metal_02", 4.0, Color(0.55, 0.5, 0.45))
	weapon_pivot.add_child(guard)
	_dress()


## Override to add hoods, eyes, cloaks.
func _dress() -> void:
	pass


func _part(mesh: Mesh, pos: Vector3, color: Color, flashes := true, tex := "") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	var m := Look.cloth(tex, color) if tex != "" else Look.matte(color)
	mi.material_override = m
	if flashes:
		body_mats.append(_glowable(m, HIT_FLASH))
	visual.add_child(mi)
	return mi


func _glow_part(mesh: Mesh, pos: Vector3, color: Color, energy := 3.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.emission_enabled = true
	m.emission = color
	m.emission_energy_multiplier = energy
	mi.material_override = m
	visual.add_child(mi)
	return mi


static func _plain(color: Color) -> StandardMaterial3D:
	return Look.matte(color)


static func _capsule(r: float, h: float) -> CapsuleMesh:
	var m := CapsuleMesh.new()
	m.radius = r
	m.height = h
	return m


static func _sphere(r: float) -> SphereMesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	return m


static func _box(size: Vector3) -> BoxMesh:
	var m := BoxMesh.new()
	m.size = size
	return m


static func _cone(bottom: float, h: float, top := 0.0) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = top
	m.bottom_radius = bottom
	m.height = h
	return m


# --- helpers ----------------------------------------------------------------

func forward() -> Vector3:
	return Vector3(-sin(facing_angle), 0.0, -cos(facing_angle))


func yaw_to(p: Vector3) -> float:
	var d := p - global_position
	return atan2(-d.x, -d.z)


func flat_dist(other: Node3D) -> float:
	var d := other.global_position - global_position
	d.y = 0.0
	return d.length()


func is_dead() -> bool:
	return state == State.DEAD


func opponents() -> Array[Fighter]:
	var out: Array[Fighter] = []
	for n in get_tree().get_nodes_in_group("fighters"):
		var f := n as Fighter
		if f and f.team != team and not f.is_dead():
			out.append(f)
	return out


func is_whirl() -> bool:
	return whirl and swing_type == Swing.THRUST


func swing_name() -> String:
	return "Whirl" if is_whirl() else SWING_NAMES[swing_type]


func swing_time() -> float:
	return (0.5 if is_whirl() else SWING_TIME[swing_type]) * swing_time_mult


func recover_time() -> float:
	return RECOVER_TIME[swing_type] * recover_mult


func swing_progress() -> float:
	return clampf(state_time / swing_time(), 0.0, 1.0)


# --- frame ------------------------------------------------------------------

## Override: set move_input, desired_facing, and start actions.
func _think(_delta: float) -> void:
	pass


func _physics_process(delta: float) -> void:
	if state == State.DEAD:
		_dead_physics(delta)
		return
	_think(delta)
	state_time += delta
	invuln_left = maxf(0.0, invuln_left - delta)
	if guarding:
		guard_time += delta
	_tick_state()
	_tick_burn(delta)
	if state == State.DEAD:
		return
	_tick_stamina(delta)
	_turn(delta)
	_move(delta)
	_animate(delta)
	_update_glow(delta)


func _set_state(s: State) -> void:
	state = s
	state_time = 0.0
	if s != State.IDLE:
		guarding = false


func _tick_state() -> void:
	match state:
		State.SWING:
			var p := swing_progress()
			_sweep(p)
			if p >= 1.0:
				_set_state(State.RECOVER)
		State.RECOVER:
			if state_time >= recover_time():
				_set_state(State.IDLE)
		State.STAGGER:
			if state_time >= stagger_left:
				_set_state(State.IDLE)
		State.DODGE:
			if state_time >= DODGE_TIME:
				_set_state(State.IDLE)


## Sets the fighter alight: it loses health steadily, without staggering.
func ignite(seconds: float, dps: float, by: Fighter) -> void:
	_burn_left = maxf(_burn_left, seconds)
	_burn_dps = maxf(_burn_dps, dps)
	_burn_by = by


func _tick_burn(delta: float) -> void:
	if _burn_left <= 0.0:
		return
	_burn_left -= delta
	health -= _burn_dps * delta
	_flash = maxf(_flash, 0.35)
	_burn_spark -= delta
	if _burn_spark <= 0.0:
		_burn_spark = 0.12
		Fx.sparks(global_position + Vector3(randf_range(-0.2, 0.2), randf_range(0.5, 1.6), randf_range(-0.2, 0.2)), Color(1.0, 0.5, 0.15), 3)
	if health <= 0.0:
		_burn_left = 0.0
		die(Vector3.ZERO)


func _tick_stamina(delta: float) -> void:
	if state == State.WINDUP or state == State.SWING or state == State.DODGE:
		return
	stamina_delay -= delta
	if stamina_delay <= 0.0:
		stamina = minf(max_stamina, stamina + (10.0 if guarding else 30.0) * delta)


func _turn(delta: float) -> void:
	var rate := 14.0
	match state:
		State.WINDUP: rate = 7.0
		State.SWING: rate = 2.0
		State.RECOVER: rate = 4.0
		State.STAGGER, State.DODGE: rate = 0.0
	var diff := wrapf(desired_facing - facing_angle, -PI, PI)
	facing_angle = wrapf(facing_angle + clampf(diff, -rate * delta, rate * delta), -PI, PI)
	visual.rotation.y = facing_angle


func _move(delta: float) -> void:
	var mult := 1.0
	match state:
		State.WINDUP: mult = 0.5
		State.SWING: mult = 0.2
		State.RECOVER: mult = 0.45
		State.STAGGER, State.DODGE: mult = 0.0
	if guarding:
		mult *= 0.5
	var target := move_input.limit_length(1.0) * move_speed * mult
	move_vel = move_vel.move_toward(target, accel * delta)
	impulse = impulse.lerp(Vector3.ZERO, 1.0 - exp(-7.0 * delta))
	var v := move_vel + impulse
	velocity.x = v.x
	velocity.z = v.z
	velocity.y = -0.5 if is_on_floor() else velocity.y - 25.0 * delta
	var slam := impulse.length()
	move_and_slide()
	if slam > 4.5:
		_check_slam(slam)


## Being thrown into a wall or another body hurts both of you.
func _check_slam(speed: float) -> void:
	for i in get_slide_collision_count():
		var col := get_slide_collision(i)
		if col.get_normal().y > 0.5:
			continue  # the floor
		var c := col.get_collider()
		if c is Fighter and c != self and not c.is_dead():
			var other := c as Fighter
			other.take_hit(self, 3.0 + speed, impulse.normalized(), speed * 0.7, 0.45, false)
			impulse *= 0.35
			Game.shake(0.2)
			return
		if c is StaticBody3D and speed > 6.0:
			impulse *= -0.25
			take_hit(self, 4.0, Vector3.ZERO, 0.0, 0.5, false)
			Game.shake(0.25)
			return


func _dead_physics(delta: float) -> void:
	impulse = impulse.lerp(Vector3.ZERO, 1.0 - exp(-5.0 * delta))
	velocity = Vector3(impulse.x, -2.0, impulse.z)
	move_and_slide()


# --- actions ----------------------------------------------------------------

## Free to start a swing: idle, or in the last stretch of the previous swing's
## recovery, so chained attacks flow instead of waiting for a full stop.
func can_attack() -> bool:
	return state == State.IDLE or (state == State.RECOVER and state_time >= recover_time() * 0.6)


func begin_windup(type: Swing) -> bool:
	if not can_attack() or stamina < 5.0:
		return false
	swing_type = type
	_set_state(State.WINDUP)
	return true


func set_windup_type(type: Swing) -> void:
	if state == State.WINDUP:
		swing_type = type


func release_swing(power: float) -> void:
	if state != State.WINDUP:
		return
	swing_power = power
	var cost := (10.0 + 8.0 * power) * (1.3 if swing_type == Swing.OVERHEAD or is_whirl() else 1.0) * stamina_mult
	stamina = maxf(0.0, stamina - cost)
	stamina_delay = 0.8
	_hit_list.clear()
	_set_state(State.SWING)
	_blade_prev = _swing_pose(0.0).y
	if not is_whirl():
		var lunge := (1.5 + 2.5 * power) * (1.7 if swing_type == Swing.THRUST else 1.0) * lunge_mult
		impulse += forward() * lunge


func dodge(dir: Vector3) -> bool:
	if not (state == State.IDLE or state == State.RECOVER) or stamina < dodge_cost - 2.0:
		return false
	stamina -= dodge_cost
	stamina_delay = 0.6
	_set_state(State.DODGE)
	invuln_left = 0.3
	impulse = dir.normalized() * 11.0
	return true


func set_guard(on: bool) -> void:
	if on and state == State.IDLE and not guarding and stamina > 5.0:
		guarding = true
		guard_time = 0.0
	elif not on:
		guarding = false


func stagger(seconds: float) -> void:
	if state == State.DEAD:
		return
	_set_state(State.STAGGER)
	stagger_left = seconds


# --- the swing --------------------------------------------------------------

func _windup_pose(t: Swing) -> Vector3:
	var a := 2.0 * arc_mult
	match t:
		Swing.SLASH_RL: return Vector3(0.25, -a, 0.3)
		Swing.SLASH_LR: return Vector3(0.25, a, -0.3)
		Swing.OVERHEAD: return Vector3(2.5, -0.15, 0.0)
		Swing.THRUST:
			if whirl:
				return Vector3(0.3, 2.2, -0.4)
	return Vector3(0.05, 0.0, 0.0)


func _swing_pose(p: float) -> Vector3:
	# Ease-out: fast through the target, heavy follow-through.
	var e := 1.0 - pow(1.0 - p, 3.0)
	var a := 2.0 * arc_mult
	match swing_type:
		Swing.SLASH_RL: return Vector3(0.1, lerpf(-a, a * 0.95, e), 0.3)
		Swing.SLASH_LR: return Vector3(0.1, lerpf(a, -a * 0.95, e), -0.3)
		Swing.OVERHEAD: return Vector3(lerpf(2.5, -0.7, e), -0.1, 0.0)
		Swing.THRUST:
			if whirl:
				return Vector3(0.15, 1.5, -0.2)  # arm held out; the body turns (see _animate)
	return Vector3(0.05, 0.0, 0.0)


## Hits anything the blade swept past since the last frame.
func _sweep(p: float) -> void:
	if is_whirl():
		# One full turn: anything in reach is struck once along the way.
		if p >= 0.1 and p <= 0.9:
			for o in opponents():
				if not o in _hit_list and flat_dist(o) <= weapon_reach + o.radius:
					_hit_list.append(o)
					_deliver(o)
		return
	var yaw := _swing_pose(p).y
	var lo := minf(_blade_prev, yaw) - 0.2
	var hi := maxf(_blade_prev, yaw) + 0.2
	_blade_prev = yaw
	for o in opponents():
		if o in _hit_list:
			continue
		var d := flat_dist(o)
		var rel := wrapf(yaw_to(o.global_position) - facing_angle, -PI, PI)
		var hit := false
		match swing_type:
			Swing.SLASH_RL, Swing.SLASH_LR:
				hit = p < 0.9 and d <= weapon_reach + o.radius and rel >= lo and rel <= hi
			Swing.OVERHEAD:
				hit = p >= 0.35 and p <= 0.8 and absf(rel) < 0.55 and d <= weapon_reach + o.radius
			Swing.THRUST:
				hit = p >= 0.25 and p <= 0.75 and absf(rel) < 0.4 and d <= weapon_reach + 0.5 + o.radius
		if hit:
			_hit_list.append(o)
			_deliver(o)


func _deliver(o: Fighter) -> void:
	var dir := o.global_position - global_position
	dir.y = 0.0
	dir = dir.normalized()
	var dmg := _strike_damage(o, weapon_damage * swing_power * SWING_DAMAGE[swing_type])
	var force := (2.5 + 3.5 * swing_power) * (1.5 if swing_type == Swing.OVERHEAD else 1.0) * force_mult
	var result := o.take_hit(self, dmg, dir, force, 0.2 + 0.35 * swing_power + stun_bonus)
	_on_strike(o, result)
	match result:
		"parried":
			stagger(1.0)
			impulse -= dir * 3.0
			Game.hitstop(0.12)
			Game.shake(0.35)
		"blocked":
			impulse -= dir * 1.5
			Game.hitstop(0.04)
		"hit":
			Game.hitstop(0.04 + 0.05 * swing_power)
			Game.shake(0.2 + 0.25 * swing_power)


## Override to change a blow's damage just before it lands (backstabs, ripostes).
func _strike_damage(_o: Fighter, dmg: float) -> float:
	return dmg


## Override to react to a blow you landed; result is what take_hit returned.
func _on_strike(_o: Fighter, _result: String) -> void:
	pass


## Returns "hit", "blocked", "parried", "dodged" or "none".
func take_hit(attacker: Node3D, dmg: float, dir: Vector3, force: float, stun: float, can_block := true) -> String:
	if state == State.DEAD:
		return "none"
	if invuln_left > 0.0:
		return "dodged"
	if can_block and guarding:
		var to_att := attacker.global_position - global_position
		to_att.y = 0.0
		if forward().dot(to_att.normalized()) > 0.25:
			var spark_pos := global_position + Vector3(0, 1.3, 0) + forward() * 0.5
			if guard_time < PARRY_WINDOW:
				Fx.sparks(spark_pos, Color(1.0, 0.9, 0.5), 30)
				return "parried"
			Fx.sparks(spark_pos, Color(1.0, 0.6, 0.3), 12)
			stamina -= dmg * 1.2
			stamina_delay = 0.8
			impulse += dir * force * 0.5
			if stamina <= 0.0:
				stamina = 0.0
				stagger(0.9)
			return "blocked"
	health -= dmg
	impulse += dir * force
	_flash = 1.0
	Fx.blood(global_position + Vector3(0, 1.1, 0), dir, dmg)
	hurt.emit(self, dmg)
	if health <= 0.0:
		die(dir)
	else:
		stagger(stun)
	return "hit"


func die(dir: Vector3) -> void:
	health = 0.0
	_set_state(State.DEAD)
	collision_layer = 0
	collision_mask = 1
	impulse = dir * 4.0
	var fall := -1.45 if forward().dot(dir) > 0.0 else 1.45
	var tw := create_tween().set_parallel()
	tw.tween_property(visual, "rotation:x", fall, 0.45).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	tw.tween_property(visual, "position:y", -0.55, 0.45)
	Fx.blood_pool(global_position, 0.8 + randf() * 0.5)
	died.emit(self)


# --- animation --------------------------------------------------------------

func _animate(delta: float) -> void:
	var k := 1.0 - exp(-16.0 * delta)
	var pose := IDLE_POSE
	var pos := WEAPON_POS
	match state:
		State.SWING:
			var p := swing_progress()
			weapon_pivot.rotation = _swing_pose(p)
			if is_whirl():
				visual.rotation.y += TAU * (1.0 - pow(1.0 - p, 2.0))
			elif swing_type == Swing.THRUST:
				pos.z += lerpf(0.35, -0.6, 1.0 - pow(1.0 - p, 3.0))
			weapon_pivot.position = pos
		State.WINDUP:
			pose = _windup_pose(swing_type)
			if swing_type == Swing.THRUST and not whirl:
				pos.z += 0.35
		_:
			if guarding:
				pose = GUARD_POSE
				pos = GUARD_POS
	if state != State.SWING:
		weapon_pivot.rotation = weapon_pivot.rotation.lerp(pose, k)
		weapon_pivot.position = weapon_pivot.position.lerp(pos, k)

	var tilt := 0.0
	match state:
		State.STAGGER: tilt = 0.35
		State.WINDUP: tilt = 0.12
		State.SWING: tilt = -0.2
		State.DODGE: tilt = -0.4
	visual.rotation.x = lerpf(visual.rotation.x, tilt, k)

	var speed := move_vel.length()
	if speed > 0.4:
		_bob += delta * speed * 2.4
	visual.position.y = lerpf(visual.position.y, absf(sin(_bob)) * 0.07 if speed > 0.4 else 0.0, k)


## Only brightness changes here. Emission stays enabled from the start
## (see _glowable): switching it on mid-fight is a different shader variant,
## and compiling it on the first swing or hit is what made them hitch.
func _update_glow(delta: float) -> void:
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - delta * 6.0)
		for m in body_mats:
			m.emission_energy_multiplier = _flash * 2.0
	var glow := 0.0
	if state == State.WINDUP:
		glow = 0.6 + 0.4 * sin(state_time * 30.0) if team != 0 else minf(state_time / 0.7, 1.0)
	weapon_mat.emission_energy_multiplier = glow * 2.5


static func _glowable(m: StandardMaterial3D, color: Color) -> StandardMaterial3D:
	m.emission_enabled = true
	m.emission = color
	m.emission_energy_multiplier = 0.0
	return m
