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
			weapon_color = Color(0.62, 0.58, 0.5)
			body_color = Color(0.36, 0.36, 0.3)
			skin_color = Color(0.42, 0.44, 0.38)
			windup_len = 0.42
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
	max_health *= 1.0 + 0.08 * (wave - 1)


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
