class_name Enemy
extends Fighter
## Creatures of the road. They telegraph (weapon glows red while winding up),
## keep spacing, circle you, and get in each other's way.

var kind := "ghoul"
var target: Fighter
var windup_len := 0.5
var cooldown := 1.5
var strafe := 1.0
var swings: Array = [Swing.SLASH_RL, Swing.SLASH_LR]
var eye_color := Color(0.8, 1.0, 0.3)
var body_scale := 1.0


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
			weapon_color = Color(0.75, 0.7, 0.6)
			body_color = Color(0.38, 0.4, 0.34)
			skin_color = Color(0.5, 0.52, 0.45)
			windup_len = 0.42
		"cultist":
			max_health = 85.0
			move_speed = 3.6
			weapon_damage = 19.0
			weapon_reach = 1.7
			weapon_length = 1.1
			body_color = Color(0.3, 0.04, 0.05)
			eye_color = Color(1.0, 0.2, 0.1)
			windup_len = 0.7
			swings = [Swing.SLASH_RL, Swing.SLASH_LR, Swing.OVERHEAD, Swing.THRUST]
		"brute":
			max_health = 190.0
			move_speed = 2.8
			weapon_damage = 34.0
			weapon_reach = 2.1
			weapon_length = 1.5
			weapon_color = Color(0.3, 0.28, 0.26)
			body_color = Color(0.2, 0.17, 0.15)
			skin_color = Color(0.35, 0.3, 0.28)
			eye_color = Color(1.0, 0.55, 0.1)
			windup_len = 0.95
			radius = 0.5
			body_scale = 1.35
			swings = [Swing.OVERHEAD]
	max_health *= 1.0 + 0.08 * (wave - 1)


func _dress() -> void:
	visual.scale = Vector3.ONE * body_scale
	match kind:
		"ghoul":
			# Hunched, long-armed, too thin.
			_part(_capsule(0.07, 0.9), Vector3(-0.32, 0.95, -0.15), skin_color)
			_part(_capsule(0.07, 0.9), Vector3(0.32, 0.95, -0.15), skin_color)
		"cultist":
			_part(_cone(0.45, 1.25, 0.24), Vector3(0.0, 0.7, 0.0), body_color)
			_part(_cone(0.24, 0.45, 0.0), Vector3(0.0, 1.85, 0.03), body_color.darkened(0.3))
		"brute":
			_part(_box(Vector3(0.85, 0.3, 0.4)), Vector3(0.0, 1.45, 0.0), body_color.lightened(0.1))
			_part(_cone(0.07, 0.3), Vector3(-0.15, 1.9, 0.0), Color(0.8, 0.75, 0.65))
			_part(_cone(0.07, 0.3), Vector3(0.15, 1.9, 0.0), Color(0.8, 0.75, 0.65))
	_glow_part(_sphere(0.035), Vector3(-0.07, 1.7, -0.15), eye_color)
	_glow_part(_sphere(0.035), Vector3(0.07, 1.7, -0.15), eye_color)
	# Rise out of the earth.
	visual.position.y = -1.9
	create_tween().tween_property(visual, "position:y", 0.0, 0.9).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	stagger(1.1)


func _think(delta: float) -> void:
	move_input = Vector3.ZERO
	if target == null or target.is_dead():
		return
	var to := target.global_position - global_position
	to.y = 0.0
	var dist := to.length()
	var dir := to / maxf(dist, 0.01)
	desired_facing = yaw_to(target.global_position)
	cooldown -= delta
	var sep := _separation()
	match state:
		State.WINDUP:
			move_input = dir * 0.3
			if state_time >= windup_len:
				release_swing(1.0)
		State.IDLE:
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
