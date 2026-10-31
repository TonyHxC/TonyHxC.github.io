extends Node3D
## Prototype arena: a ruined graveyard courtyard lit by braziers, and waves of
## the dead. Builds everything in code so the scene file stays trivial.

signal warmed_up

const HALF := 17.0
## Camera size while choosing (close on the hunter) and in the fight.
const START_ZOOM := 7.0
const FIGHT_ZOOM := 15.0

var player: Player
var ready_to_play := false
var camera: Camera3D
var hud: CanvasLayer
var rng := RandomNumberGenerator.new()

var wave := 0
var alive: Array[Enemy] = []
## No waves until the run has started (weapon chosen, mask on).
var _next_wave_in := INF

var _wall: StandardMaterial3D
var _stone: StandardMaterial3D
var _grave: StandardMaterial3D
var _wood: StandardMaterial3D
var _rust: StandardMaterial3D
var _retro_mat: ShaderMaterial

## The world renders at roughly this many lines, whatever the window size.
const RETRO_LINES := 340.0


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
	hud.run_start.weapon_picked.connect(player.equip)
	hud.run_start.inscribed.connect(_on_mask_inscribed)
	await _warm_up()
	camera.size = START_ZOOM
	hud.run_start.open()


## The mask is inked: put it on, draw the weapon, and let the dead come.
func _on_mask_inscribed(glyph: String, power: float, instant := false) -> void:
	player.set_mask(glyph, power)
	await player.start_run(instant)
	create_tween().tween_property(camera, "size", FIGHT_ZOOM, 0.8).set_trans(Tween.TRANS_SINE)
	_next_wave_in = minf(_next_wave_in, 2.5)
	Game.toast("The dead stir in the old yard.", Color(0.8, 0.7, 0.6))


## Skips the start screen (tests): this weapon, this sigil, ready at once.
func quick_start(weapon: String, glyph: String, power := 1.0) -> void:
	hud.run_start.phase = RunStart.Phase.CLOSED
	hud.run_start.visible = false
	player.equip(weapon)
	await _on_mask_inscribed(glyph, power, true)


## Draws every effect and creature once, out of sight behind the loading
## screen, so the browser compiles their shaders now instead of freezing on
## the first swing, hit or spell. Then tells the web page it can reveal us.
func _warm_up() -> void:
	var at := player.global_position + Vector3(1.5, 0, 1.5)
	var dummies: Array[Node] = []
	for kind in ["ghoul", "cultist", "brute"]:
		var e := Enemy.new()
		e.setup(kind, null, 1)
		e.position = at + Vector3(randf_range(-1, 1), 0, randf_range(-1, 1))
		add_child(e)
		e.remove_from_group("fighters")
		dummies.append(e)
	Fx.blood(at + Vector3(0, 1, 0), Vector3.RIGHT, 20.0)
	Fx.sparks(at + Vector3(0, 1, 0), Color(1, 0.8, 0.4), 6)
	Fx.fire_burst(at, 2.0)
	Fx.bolt(at + Vector3(0, 4, 0), at, Spells.GLYPHS.storm.color)
	Fx.shockwave(at, 2.0, Spells.GLYPHS.ward.color)
	Fx.ash_burst(at, 6)
	var sheet := SpellPaper.new()
	sheet.setup("ember", 1.0, null, at + Vector3(0, 1, 0), at + Vector3(1, 0, 0))
	add_child(sheet)
	dummies.append(sheet)

	var ui: SigilUI = hud.glyph
	ui.open(player)
	ui.begin_stroke(Vector2(500, 300))
	for i in 12:
		ui.add_point(Vector2(500, 300) + Vector2(cos(i * 0.5), sin(i * 0.5)) * 60.0)
	ui.mode = SigilUI.Mode.PREPARED
	ui.glyph = "ember"
	ui.power = 1.0
	for i in 3:
		await get_tree().process_frame
	ui._burn = 0.0
	for i in 3:
		await get_tree().process_frame
	ui.close()
	ui.learned.clear()
	player.facing_locked = false

	for d in dummies:
		if is_instance_valid(d):
			d.queue_free()
	await get_tree().process_frame
	Fx.clear_decals()
	ready_to_play = true
	warmed_up.emit()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.ashenReady && window.ashenReady()")


func _process(delta: float) -> void:
	# Whole screen pixels per world pixel, so the grid stays even when resized.
	var h := get_viewport().get_visible_rect().size.y
	_retro_mat.set_shader_parameter("pixel_size", maxf(1.0, roundf(h / RETRO_LINES)))
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
	# Oppressive: almost no fill light, so the braziers and lantern carve out
	# pools of warmth and everything else sinks into brown-black.
	env.ambient_light_color = Color(0.3, 0.27, 0.3)
	env.ambient_light_energy = 0.3
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.1
	env.fog_enabled = true
	env.fog_light_color = Color(0.07, 0.06, 0.06)
	env.fog_density = 0.014
	env.fog_height = 0.5
	env.fog_height_density = 0.3
	env.adjustment_enabled = true
	env.adjustment_saturation = 0.85
	env.adjustment_contrast = 1.15
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var moon := DirectionalLight3D.new()
	moon.light_color = Color(0.5, 0.56, 0.72)
	moon.light_energy = 0.32
	moon.shadow_enabled = true
	moon.rotation_degrees = Vector3(-55, -30, 0)
	add_child(moon)

	# The low-res finish over the 3D world; the HUD draws above it, crisp.
	var retro_layer := CanvasLayer.new()
	retro_layer.layer = 1
	var retro := ColorRect.new()
	retro.set_anchors_preset(Control.PRESET_FULL_RECT)
	retro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_retro_mat = ShaderMaterial.new()
	_retro_mat.shader = preload("res://shaders/retro.gdshader")
	retro.material = _retro_mat
	retro_layer.add_child(retro)
	add_child(retro_layer)


func _build_materials() -> void:
	_wall = Look.surface("castle_brick_07", 0.45, Color(0.85, 0.8, 0.75))
	_stone = Look.surface("rustic_stone_wall_02", 0.5, Color(0.85, 0.82, 0.78))
	_grave = Look.surface("rustic_stone_wall_02", 0.9, Color(0.7, 0.68, 0.66))
	_wood = Look.surface("weathered_planks", 0.6, Color(0.75, 0.66, 0.56))
	_rust = Look.surface("rusty_metal_02", 1.0, Color(0.6, 0.55, 0.5))


func _build_floor() -> void:
	# Tiled so the web renderer's per-mesh light limit never bites.
	var tile := 3.4
	var count := int(HALF * 2.0 / tile)
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(tile, tile)
	var ground := ShaderMaterial.new()
	ground.shader = preload("res://shaders/ground.gdshader")
	ground.set_shader_parameter("cobble_albedo", load(Look.TEX % ["cobblestone_floor_08", "albedo"]))
	ground.set_shader_parameter("cobble_normal", load(Look.TEX % ["cobblestone_floor_08", "normal"]))
	ground.set_shader_parameter("mud_albedo", load(Look.TEX % ["brown_mud_02", "albedo"]))
	ground.set_shader_parameter("mud_normal", load(Look.TEX % ["brown_mud_02", "normal"]))
	var blend := NoiseTexture2D.new()
	blend.seamless = true
	blend.noise = FastNoiseLite.new()
	blend.noise.frequency = 0.012
	ground.set_shader_parameter("blend_noise", blend)
	for x in count:
		for z in count:
			var mi := MeshInstance3D.new()
			mi.mesh = mesh
			mi.material_override = ground
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
	# Old blood paint, barely glowing.
	var m := Look.matte(Color(0.22, 0.03, 0.02))
	m.emission_enabled = true
	m.emission = Color(0.4, 0.03, 0.02)
	m.emission_energy_multiplier = 0.25
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
			_static_box(edge + Vector3(0, h * 0.5, 0), size, _wall)

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
		var roll := rng.randf()
		if roll < 0.5:
			var stone := _static_box(pos + Vector3(0, 0.45, 0), Vector3(0.6, 0.9, 0.18), _grave)
			stone.rotation = Vector3(rng.randf_range(-0.15, 0.15), rng.randf() * TAU, rng.randf_range(-0.12, 0.12))
		elif roll < 0.75:
			var cross := _static_box(pos + Vector3(0, 0.7, 0), Vector3(0.14, 1.4, 0.14), _grave)
			cross.rotation = Vector3(rng.randf_range(-0.2, 0.2), rng.randf() * TAU, 0)
			var arm := MeshInstance3D.new()
			arm.mesh = Fighter._box(Vector3(0.7, 0.14, 0.14))
			arm.material_override = _grave
			arm.position.y = 0.35
			cross.add_child(arm)
		else:
			_coffin(pos, rng.randf() * TAU)

	_build_props()

	# Scattered bones.
	var bone := Fighter._plain(Color(0.6, 0.56, 0.48))
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
	mi.material_override = _stone
	mi.position.y = h * 0.5
	body.add_child(mi)
	var base := MeshInstance3D.new()
	base.mesh = Fighter._box(Vector3(1.4, 0.35, 1.4))
	base.material_override = _wall
	base.position.y = 0.17
	body.add_child(base)
	add_child(body)


func _brazier(pos: Vector3) -> void:
	var body := _static_box(pos + Vector3(0, 0.45, 0), Vector3(0.5, 0.9, 0.5), null)
	var stand := MeshInstance3D.new()
	stand.mesh = Fighter._cone(0.12, 0.9, 0.12)
	stand.material_override = _rust
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
	light.light_color = Color(1.0, 0.46, 0.16)
	light.light_energy = 2.8
	light.omni_range = 7.5
	light.omni_attenuation = 1.8
	light.position.y = 1.4
	light.set_script(preload("res://scripts/flicker.gd"))
	body.add_child(light)


## Wood and rusted iron: a gibbet with a hanging cage, crates, broken fencing.
func _build_props() -> void:
	# Gibbet, back-left of the yard where it reads against the far wall.
	var g := Vector3(-11.5, 0, -6.0)
	_static_box(g + Vector3(0, 2.0, 0), Vector3(0.22, 4.0, 0.22), _wood)
	var beam := _static_box(g + Vector3(0.9, 3.85, 0), Vector3(2.0, 0.18, 0.18), _wood)
	beam.rotation.z = 0.02
	var brace := _static_box(g + Vector3(0.45, 3.35, 0), Vector3(0.12, 1.0, 0.12), _wood)
	brace.rotation.z = -0.75
	var chain := MeshInstance3D.new()
	chain.mesh = Fighter._box(Vector3(0.04, 0.8, 0.04))
	chain.material_override = _rust
	chain.position = g + Vector3(1.7, 3.35, 0)
	add_child(chain)
	var cage := Node3D.new()
	cage.position = g + Vector3(1.7, 2.35, 0)
	cage.rotation.y = 0.4
	add_child(cage)
	for i in 8:
		var a := TAU * i / 8.0
		var bar := MeshInstance3D.new()
		bar.mesh = Fighter._box(Vector3(0.035, 1.25, 0.035))
		bar.material_override = _rust
		bar.position = Vector3(cos(a), 0, sin(a)) * 0.38
		cage.add_child(bar)
	for y in [-0.62, 0.62]:
		var hoop := MeshInstance3D.new()
		var torus := TorusMesh.new()
		torus.inner_radius = 0.35
		torus.outer_radius = 0.41
		hoop.mesh = torus
		hoop.material_override = _rust
		hoop.position.y = y
		cage.add_child(hoop)
	var skull := MeshInstance3D.new()
	skull.mesh = Fighter._sphere(0.11)
	skull.material_override = Fighter._plain(Color(0.6, 0.56, 0.48))
	skull.position.y = -0.5
	cage.add_child(skull)

	# Crates stacked against the far walls.
	for spot in [Vector3(-14.5, 0, -14.0), Vector3(-13.4, 0, -14.6), Vector3(13.8, 0, -14.2), Vector3(-14.6, 0, 6.5)]:
		var s := rng.randf_range(0.7, 1.0)
		var crate := _static_box(spot + Vector3(0, s * 0.5, 0), Vector3.ONE * s, _wood)
		crate.rotation.y = rng.randf_range(-0.4, 0.4)
		if rng.randf() < 0.5:
			var top := _static_box(spot + Vector3(0.1, s + 0.32, 0.05), Vector3.ONE * 0.62, _wood)
			top.rotation.y = rng.randf_range(-0.6, 0.6)

	# Broken fence along the far side.
	var x := -6.0
	while x < 7.0:
		if rng.randf() > 0.25:
			_static_box(Vector3(x, 0.55, -15.2), Vector3(0.14, 1.1, 0.14), _wood)
			var rail := _static_box(Vector3(x + 0.8, 0.75, -15.2), Vector3(1.6, 0.1, 0.08), _wood)
			rail.rotation.z = rng.randf_range(-0.12, 0.12)
		x += 1.6


func _coffin(pos: Vector3, yaw: float) -> void:
	var body := _static_box(pos + Vector3(0, 0.2, 0), Vector3(0.7, 0.4, 1.9), _wood)
	body.rotation.y = yaw
	var lid := MeshInstance3D.new()
	lid.mesh = Fighter._box(Vector3(0.72, 0.06, 1.92))
	lid.material_override = _wood
	lid.position = Vector3(0.25, 0.26, 0.1)
	lid.rotation = Vector3(0.0, 0.25, -0.18)  # pushed half open
	body.add_child(lid)


# --- actors -----------------------------------------------------------------

func _build_player() -> void:
	player = Player.new()
	player.name = "Player"
	add_child(player)
	Game.player = player
	Fx.drifting_ash(player)
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
