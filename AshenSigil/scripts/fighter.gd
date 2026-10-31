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
const WEAPON_POS := Vector3(0.28, 1.25, -0.05)
const IDLE_POSE := Vector3(0.9, -0.5, 0.0)
const GUARD_POSE := Vector3(0.35, 1.45, 0.0)
const GUARD_POS := Vector3(0.2, 1.35, -0.4)
const PARRY_WINDOW := 0.22
const DODGE_TIME := 0.38

@export var team := 0
@export var max_health := 100.0
@export var max_stamina := 100.0
@export var move_speed := 4.5
@export var accel := 22.0
@export var weapon_damage := 20.0
@export var weapon_reach := 1.6
@export var weapon_length := 1.1
@export var weapon_color := Color(0.55, 0.55, 0.58)
@export var windup_glow := Color(1.0, 0.15, 0.05)
@export var body_color := Color(0.3, 0.3, 0.32)
@export var skin_color := Color(0.62, 0.52, 0.45)
@export var radius := 0.35

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
	_part(_capsule(0.12, 0.8), Vector3(-0.13, 0.4, 0.0), legs)
	_part(_capsule(0.12, 0.8), Vector3(0.13, 0.4, 0.0), legs)
	_part(_capsule(0.28, 0.85), Vector3(0.0, 1.1, 0.0), body_color)
	_part(_sphere(0.17), Vector3(0.0, 1.68, 0.0), skin_color)

	weapon_pivot = Node3D.new()
	weapon_pivot.position = WEAPON_POS
	weapon_pivot.rotation = IDLE_POSE
	visual.add_child(weapon_pivot)
	weapon_mat = StandardMaterial3D.new()
	weapon_mat.albedo_color = weapon_color
	weapon_mat.metallic = 0.7
	weapon_mat.roughness = 0.4
	var blade := MeshInstance3D.new()
	blade.mesh = _box(Vector3(0.06, 0.025, weapon_length))
	blade.position.z = -(weapon_length * 0.5 + 0.12)
	blade.material_override = weapon_mat
	weapon_pivot.add_child(blade)
	var guard := MeshInstance3D.new()
	guard.mesh = _box(Vector3(0.28, 0.05, 0.05))
	guard.position.z = -0.1
	guard.material_override = _plain(Color(0.25, 0.2, 0.15))
	weapon_pivot.add_child(guard)
	_dress()


## Override to add hoods, eyes, cloaks.
func _dress() -> void:
	pass


func _part(mesh: Mesh, pos: Vector3, color: Color, flashes := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	var m := _plain(color)
	mi.material_override = m
	if flashes:
		body_mats.append(m)
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
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.9
	return m


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


func swing_progress() -> float:
	return clampf(state_time / SWING_TIME[swing_type], 0.0, 1.0)


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
			if state_time >= RECOVER_TIME[swing_type]:
				_set_state(State.IDLE)
		State.STAGGER:
			if state_time >= stagger_left:
				_set_state(State.IDLE)
		State.DODGE:
			if state_time >= DODGE_TIME:
				_set_state(State.IDLE)


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

func begin_windup(type: Swing) -> bool:
	if state != State.IDLE or stamina < 5.0:
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
	var cost := (10.0 + 8.0 * power) * (1.3 if swing_type == Swing.OVERHEAD else 1.0)
	stamina = maxf(0.0, stamina - cost)
	stamina_delay = 0.8
	_hit_list.clear()
	_set_state(State.SWING)
	_blade_prev = _swing_pose(0.0).y
	var lunge := (1.5 + 2.5 * power) * (1.7 if swing_type == Swing.THRUST else 1.0)
	impulse += forward() * lunge


func dodge(dir: Vector3) -> bool:
	if not (state == State.IDLE or state == State.RECOVER) or stamina < 20.0:
		return false
	stamina -= 22.0
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
	match t:
		Swing.SLASH_RL: return Vector3(0.25, -2.0, 0.3)
		Swing.SLASH_LR: return Vector3(0.25, 2.0, -0.3)
		Swing.OVERHEAD: return Vector3(2.5, -0.15, 0.0)
	return Vector3(0.05, 0.0, 0.0)


func _swing_pose(p: float) -> Vector3:
	# Ease-out: fast through the target, heavy follow-through.
	var e := 1.0 - pow(1.0 - p, 3.0)
	match swing_type:
		Swing.SLASH_RL: return Vector3(0.1, lerpf(-2.0, 1.9, e), 0.3)
		Swing.SLASH_LR: return Vector3(0.1, lerpf(2.0, -1.9, e), -0.3)
		Swing.OVERHEAD: return Vector3(lerpf(2.5, -0.7, e), -0.1, 0.0)
	return Vector3(0.05, 0.0, 0.0)


## Hits anything the blade swept past since the last frame.
func _sweep(p: float) -> void:
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
	var dmg: float = weapon_damage * swing_power * SWING_DAMAGE[swing_type]
	var dir := o.global_position - global_position
	dir.y = 0.0
	dir = dir.normalized()
	var force := (2.5 + 3.5 * swing_power) * (1.5 if swing_type == Swing.OVERHEAD else 1.0)
	var result := o.take_hit(self, dmg, dir, force, 0.2 + 0.35 * swing_power)
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
			pos.z += lerpf(0.35, -0.6, 1.0 - pow(1.0 - p, 3.0)) if swing_type == Swing.THRUST else 0.0
			weapon_pivot.position = pos
		State.WINDUP:
			pose = _windup_pose(swing_type)
			if swing_type == Swing.THRUST:
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


func _update_glow(delta: float) -> void:
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - delta * 6.0)
		for m in body_mats:
			m.emission_enabled = _flash > 0.0
			m.emission = Color(1.0, 0.25, 0.2)
			m.emission_energy_multiplier = _flash * 2.0
	var glow := 0.0
	if state == State.WINDUP:
		glow = 0.6 + 0.4 * sin(state_time * 30.0) if team != 0 else minf(state_time / 0.7, 1.0)
	weapon_mat.emission_enabled = glow > 0.01
	weapon_mat.emission = windup_glow
	weapon_mat.emission_energy_multiplier = glow * 2.5
