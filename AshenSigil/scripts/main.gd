extends Node3D
## Prototype arena: a ruined graveyard courtyard lit by braziers, and waves of
## the dead. Builds everything in code so the scene file stays trivial.

const HALF := 17.0

var player: Player
var camera: Camera3D
var hud: CanvasLayer
var rng := RandomNumberGenerator.new()

var wave := 0
var alive: Array[Enemy] = []
var _next_wave_in := 2.5

var _stone: StandardMaterial3D
var _dark_stone: StandardMaterial3D


func _ready() -> void:
	Game.reset()
	Game.world = self
	rng.seed = 1666
	_build_environment()
	_build_materials()
	_build_floor()
	_build_ruins()
	_build_player()
	hud = preload("res://scripts/hud.gd").new()
	add_child(hud)
	Game.hud = hud
	hud.bind(player)
	hud.glyph.cast.connect(_on_glyph_cast)
	hud.glyph.closed.connect(_on_glyph_closed)
	player.died.connect(func(_f: Fighter) -> void: hud.glyph.close())
	Game.toast("The dead stir in the old yard.", Color(0.8, 0.7, 0.6))


func _process(delta: float) -> void:
	if player.is_dead():
		return
	if alive.is_empty():
		_next_wave_in -= delta
		if _next_wave_in <= 0.0:
			_spawn_wave()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("restart") and player.is_dead():
		Game.reset()
		get_tree().reload_current_scene()


# --- world ------------------------------------------------------------------

func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.015, 0.02)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.28, 0.25, 0.34)
	env.ambient_light_energy = 0.32
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.05
	env.glow_enabled = true
	env.glow_intensity = 0.9
	env.glow_bloom = 0.15
	env.fog_enabled = true
	env.fog_light_color = Color(0.09, 0.08, 0.11)
	env.fog_density = 0.012
	env.fog_height = 0.6
	env.fog_height_density = 0.25
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.78
	env.adjustment_contrast = 1.1
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var moon := DirectionalLight3D.new()
	moon.light_color = Color(0.55, 0.62, 0.85)
	moon.light_energy = 0.35
	moon.shadow_enabled = true
	moon.rotation_degrees = Vector3(-55, -30, 0)
	add_child(moon)


func _build_materials() -> void:
	var noise := FastNoiseLite.new()
	noise.noise_type = FastNoiseLite.TYPE_CELLULAR
	noise.cellular_return_type = FastNoiseLite.RETURN_DISTANCE2_SUB
	noise.frequency = 0.045
	var ramp := Gradient.new()
	ramp.set_color(0, Color(0.05, 0.045, 0.045))
	ramp.set_color(1, Color(0.3, 0.28, 0.27))
	ramp.add_point(0.12, Color(0.16, 0.15, 0.15))
	var albedo := NoiseTexture2D.new()
	albedo.noise = noise
	albedo.seamless = true
	albedo.color_ramp = ramp
	albedo.width = 512
	albedo.height = 512
	var normal := NoiseTexture2D.new()
	normal.noise = noise
	normal.seamless = true
	normal.as_normal_map = true
	normal.bump_strength = 6.0
	normal.width = 512
	normal.height = 512

	_stone = StandardMaterial3D.new()
	_stone.albedo_texture = albedo
	_stone.normal_enabled = true
	_stone.normal_texture = normal
	_stone.roughness = 0.92
	_stone.uv1_triplanar = true
	_stone.uv1_world_triplanar = true
	_stone.uv1_scale = Vector3(0.12, 0.12, 0.12)

	_dark_stone = _stone.duplicate() as StandardMaterial3D
	_dark_stone.albedo_color = Color(0.7, 0.66, 0.68)
	_dark_stone.uv1_scale = Vector3(0.3, 0.3, 0.3)


func _build_floor() -> void:
	# Tiled so the web renderer's per-mesh light limit never bites.
	var tile := 3.4
	var count := int(HALF * 2.0 / tile)
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(tile, tile)
	for x in count:
		for z in count:
			var mi := MeshInstance3D.new()
			mi.mesh = mesh
			mi.material_override = _stone
			mi.position = Vector3(-HALF + tile * (x + 0.5), 0.0, -HALF + tile * (z + 0.5))
			add_child(mi)
	var floor_body := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(HALF * 2.0 + 4.0, 1.0, HALF * 2.0 + 4.0)
	shape.shape = box
	shape.position.y = -0.5
	floor_body.add_child(shape)
	add_child(floor_body)
	# Invisible boundary.
	for side in [Vector3(HALF, 0, 0), Vector3(-HALF, 0, 0), Vector3(0, 0, HALF), Vector3(0, 0, -HALF)]:
		var size := Vector3(1.0, 4.0, HALF * 2.0) if side.x != 0.0 else Vector3(HALF * 2.0, 4.0, 1.0)
		_static_box(side + Vector3(0, 2, 0) + side.normalized() * 0.5, size, null)

	# Ritual circle at the heart of the yard.
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 2.6
	torus.outer_radius = 2.75
	ring.mesh = torus
	ring.scale = Vector3(1, 0.05, 1)
	ring.position.y = 0.01
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.3, 0.02, 0.02)
	m.emission_enabled = true
	m.emission = Color(0.5, 0.03, 0.02)
	m.emission_energy_multiplier = 0.6
	ring.material_override = m
	add_child(ring)


func _build_ruins() -> void:
	# Broken outer wall. Near (camera-side) walls stay low so they never hide you.
	var seg := 2.0
	var n := int(HALF * 2.0 / seg)
	for i in n:
		var t := -HALF + seg * (i + 0.5)
		for edge in [Vector3(t, 0, -HALF), Vector3(-HALF, 0, t), Vector3(t, 0, HALF), Vector3(HALF, 0, t)]:
			if rng.randf() < 0.18:
				continue
			var near: bool = edge.x >= HALF - 0.1 or edge.z >= HALF - 0.1
			var h := rng.randf_range(0.3, 0.9) if near else rng.randf_range(1.2, 3.6)
			var along_x: bool = absf(edge.z) >= HALF - 0.1
			var size := Vector3(seg * 0.98, h, 0.7) if along_x else Vector3(0.7, h, seg * 0.98)
			_static_box(edge + Vector3(0, h * 0.5, 0), size, _dark_stone)

	# Pillars, some snapped off.
	for i in 8:
		var a := TAU * i / 8.0 + 0.2
		var pos := Vector3(cos(a), 0, sin(a)) * 9.5
		var h := rng.randf_range(3.0, 4.5) if rng.randf() < 0.6 else rng.randf_range(0.8, 1.8)
		_pillar(pos, h)

	# Braziers.
	for i in 6:
		var a := TAU * i / 6.0
		_brazier(Vector3(cos(a), 0, sin(a)) * 12.5)

	# Gravestones and crosses.
	var placed := 0
	while placed < 22:
		var pos := Vector3(rng.randf_range(-HALF + 2, HALF - 2), 0, rng.randf_range(-HALF + 2, HALF - 2))
		var r := Vector2(pos.x, pos.z).length()
		if r < 4.5 or absf(r - 9.5) < 1.5 or absf(r - 12.5) < 1.2:
			continue
		placed += 1
		if rng.randf() < 0.65:
			var stone := _static_box(pos + Vector3(0, 0.45, 0), Vector3(0.6, 0.9, 0.18), _dark_stone)
			stone.rotation = Vector3(rng.randf_range(-0.15, 0.15), rng.randf() * TAU, rng.randf_range(-0.12, 0.12))
		else:
			var cross := _static_box(pos + Vector3(0, 0.7, 0), Vector3(0.14, 1.4, 0.14), _dark_stone)
			cross.rotation = Vector3(rng.randf_range(-0.2, 0.2), rng.randf() * TAU, 0)
			var arm := MeshInstance3D.new()
			arm.mesh = Fighter._box(Vector3(0.7, 0.14, 0.14))
			arm.material_override = _dark_stone
			arm.position.y = 0.35
			cross.add_child(arm)

	# Scattered bones.
	var bone := Fighter._plain(Color(0.72, 0.68, 0.58))
	for i in 40:
		var mi := MeshInstance3D.new()
		mi.mesh = Fighter._capsule(0.035, rng.randf_range(0.25, 0.5)) if rng.randf() < 0.75 else Fighter._sphere(0.11)
		mi.material_override = bone
		mi.position = Vector3(rng.randf_range(-HALF + 1, HALF - 1), 0.04, rng.randf_range(-HALF + 1, HALF - 1))
		mi.rotation = Vector3(PI / 2, rng.randf() * TAU, 0)
		add_child(mi)


func _static_box(pos: Vector3, size: Vector3, mat: Material) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = pos
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	if mat:
		var mi := MeshInstance3D.new()
		mi.mesh = Fighter._box(size)
		mi.material_override = mat
		body.add_child(mi)
	add_child(body)
	return body


func _pillar(pos: Vector3, h: float) -> void:
	var body := StaticBody3D.new()
	body.position = pos
	var shape := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 0.55
	cyl.height = h
	shape.shape = cyl
	shape.position.y = h * 0.5
	body.add_child(shape)
	var mi := MeshInstance3D.new()
	mi.mesh = Fighter._cone(0.55, h, 0.5)
	mi.material_override = _dark_stone
	mi.position.y = h * 0.5
	body.add_child(mi)
	var base := MeshInstance3D.new()
	base.mesh = Fighter._box(Vector3(1.4, 0.35, 1.4))
	base.material_override = _dark_stone
	base.position.y = 0.17
	body.add_child(base)
	add_child(body)


func _brazier(pos: Vector3) -> void:
	var body := _static_box(pos + Vector3(0, 0.45, 0), Vector3(0.5, 0.9, 0.5), null)
	var stand := MeshInstance3D.new()
	stand.mesh = Fighter._cone(0.12, 0.9, 0.12)
	stand.material_override = Fighter._plain(Color(0.12, 0.1, 0.09))
	body.add_child(stand)
	var bowl := MeshInstance3D.new()
	bowl.mesh = Fighter._cone(0.2, 0.25, 0.45)
	bowl.material_override = stand.material_override
	bowl.position.y = 0.55
	body.add_child(bowl)

	var fire := CPUParticles3D.new()
	fire.amount = 26
	fire.lifetime = 0.8
	fire.mesh = Fx._flames()
	fire.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	fire.emission_sphere_radius = 0.18
	fire.direction = Vector3.UP
	fire.spread = 12.0
	fire.initial_velocity_min = 0.6
	fire.initial_velocity_max = 1.4
	fire.gravity = Vector3(0, 1.5, 0)
	fire.scale_amount_min = 0.6
	fire.scale_amount_max = 1.3
	fire.color_ramp = Fx._fire_ramp()
	fire.position.y = 0.75
	body.add_child(fire)

	var light := OmniLight3D.new()
	light.light_color = Color(1.0, 0.48, 0.18)
	light.light_energy = 2.4
	light.omni_range = 7.5
	light.omni_attenuation = 1.4
	light.position.y = 1.4
	light.set_script(preload("res://scripts/flicker.gd"))
	body.add_child(light)


# --- actors -----------------------------------------------------------------

func _build_player() -> void:
	player = Player.new()
	player.name = "Player"
	add_child(player)
	Game.player = player
	player.glyph_requested.connect(_on_glyph_requested)

	camera = preload("res://scripts/iso_camera.gd").new()
	add_child(camera)
	camera.target = player
	camera.snap()
	camera.make_current()
	Game.camera = camera
	player.cam = camera


func _spawn_wave() -> void:
	wave += 1
	hud.wave = wave
	var brutes := wave / 4
	var cultists := wave / 2
	var ghouls := 1 + wave - cultists - brutes
	var kinds: Array[String] = []
	for i in ghouls: kinds.append("ghoul")
	for i in cultists: kinds.append("cultist")
	for i in brutes: kinds.append("brute")
	for k in kinds:
		var e := Enemy.new()
		e.setup(k, player, wave)
		e.position = _spawn_point()
		add_child(e)
		e.desired_facing = e.yaw_to(player.global_position)
		e.facing_angle = e.desired_facing
		e.died.connect(_on_enemy_died)
		alive.append(e)
	Game.toast(["They rise.", "More claw their way up.", "The earth gives up its dead."][mini(wave - 1, 2)], Color(0.8, 0.15, 0.1))


func _spawn_point() -> Vector3:
	for attempt in 30:
		var a := rng.randf() * TAU
		var p := Vector3(cos(a), 0, sin(a)) * rng.randf_range(6.0, 14.0)
		if p.distance_to(player.global_position) > 6.0:
			return p
	return Vector3(0, 0, -12)


func _on_enemy_died(f: Fighter) -> void:
	alive.erase(f)
	hud.kills += 1
	if alive.is_empty():
		_next_wave_in = 4.0
		player.add_paper(3)
		player.health = minf(player.max_health, player.health + 25.0)
		Game.toast("The yard falls quiet.  +3 paper", Color(0.85, 0.8, 0.65))


func _on_glyph_requested() -> void:
	player.glyph_open = true
	Game.slowmo = true
	hud.glyph.open(player)


func _on_glyph_closed() -> void:
	player.glyph_open = false
	Game.slowmo = false


func _on_glyph_cast(glyph: String, power: float) -> void:
	player.cast_glyph(glyph, power)
