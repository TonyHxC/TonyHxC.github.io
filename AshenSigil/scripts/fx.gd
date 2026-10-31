class_name Fx
## One-shot visual effects: blood, sparks, fire, lightning, shockwaves.
## Everything is built from primitives so it runs on the web renderer.

const MAX_DECALS := 140

static var _decals: Array[Node3D] = []
static var _drop_mesh: SphereMesh
static var _quad_mesh: QuadMesh


static func blood(pos: Vector3, dir: Vector3, amount: float) -> void:
	var d := (dir + Vector3(0, 0.6, 0)).normalized() if dir.length() > 0.01 else Vector3.UP
	var p := _particles(pos, clampi(int(amount * 1.2), 8, 48), 0.7, _drops(Color(0.45, 0.02, 0.02)))
	p.direction = d
	p.spread = 35.0
	p.initial_velocity_min = 2.0
	p.initial_velocity_max = 5.5
	p.gravity = Vector3(0, -14, 0)
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.4
	var splat_pos := pos + Vector3(dir.x, 0, dir.z) * randf_range(0.4, 1.0)
	splat_pos.y = 0.0
	blood_pool(splat_pos, randf_range(0.25, 0.55) * clampf(amount / 20.0, 0.6, 1.6))


static func blood_pool(pos: Vector3, size: float) -> void:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = size * 0.5
	m.bottom_radius = size * 0.5
	m.height = 0.01
	m.radial_segments = 12
	m.rings = 1
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.22, 0.01, 0.01)
	mat.roughness = 0.25
	mat.metallic_specular = 0.8
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_add_decal(mi, Vector3(pos.x, 0.01 + randf() * 0.004, pos.z))
	mi.scale = Vector3(randf_range(0.8, 1.3), 1.0, randf_range(0.8, 1.3))
	mi.rotation.y = randf() * TAU


static func scorch(pos: Vector3, size: float) -> void:
	var mi := MeshInstance3D.new()
	var m := CylinderMesh.new()
	m.top_radius = size
	m.bottom_radius = size
	m.height = 0.01
	m.rings = 1
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.02, 0.015, 0.01, 0.85)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_add_decal(mi, Vector3(pos.x, 0.008, pos.z))


static func sparks(pos: Vector3, color: Color, amount: int) -> void:
	var p := _particles(pos, amount, 0.35, _glow_drops(color))
	p.direction = Vector3.UP
	p.spread = 90.0
	p.initial_velocity_min = 3.0
	p.initial_velocity_max = 7.0
	p.gravity = Vector3(0, -12, 0)
	p.scale_amount_min = 0.3
	p.scale_amount_max = 0.7
	flash(pos, color, 2.0, 4.0, 0.12)


static func fire_burst(pos: Vector3, radius: float) -> void:
	var p := _particles(pos + Vector3(0, 0.4, 0), 70, 0.9, _flames())
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = radius * 0.4
	p.direction = Vector3.UP
	p.spread = 70.0
	p.initial_velocity_min = 1.5
	p.initial_velocity_max = radius * 2.0
	p.gravity = Vector3(0, 3, 0)
	p.scale_amount_min = 0.8
	p.scale_amount_max = 2.2
	p.color_ramp = _fire_ramp()
	flash(pos + Vector3(0, 1, 0), Color(1.0, 0.5, 0.15), 4.5, radius * 3.0, 0.5)
	scorch(pos, radius * 0.7)
	ash_burst(pos + Vector3(0, 0.6, 0), 40, radius)


## Grey flakes that lift on the heat and drift down slowly.
static func ash_burst(pos: Vector3, amount: int, spread_radius := 0.5) -> void:
	var p := _particles(pos, amount, 3.0, _ash())
	p.explosiveness = 0.6
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = spread_radius * 0.5
	p.direction = Vector3.UP
	p.spread = 60.0
	p.initial_velocity_min = 0.5
	p.initial_velocity_max = 2.2
	p.gravity = Vector3(0, -0.35, 0)
	p.damping_min = 0.8
	p.damping_max = 1.6
	p.angular_velocity_min = -180.0
	p.angular_velocity_max = 180.0
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.2


## A slow, constant fall of ash over the yard, following the hero.
static func drifting_ash(follow: Node3D) -> void:
	var p := CPUParticles3D.new()
	p.amount = 140
	p.lifetime = 9.0
	p.preprocess = 9.0
	p.local_coords = false
	p.mesh = _ash()
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	p.emission_box_extents = Vector3(15, 0.5, 15)
	p.position.y = 7.0
	p.direction = Vector3(0.3, -1, 0.1)
	p.spread = 25.0
	p.initial_velocity_min = 0.4
	p.initial_velocity_max = 0.9
	p.gravity = Vector3(0.05, -0.08, 0.0)
	p.angular_velocity_min = -90.0
	p.angular_velocity_max = 90.0
	p.scale_amount_min = 0.5
	p.scale_amount_max = 1.1
	follow.add_child(p)


static var _ash_mesh: QuadMesh

static func _ash() -> Mesh:
	if _ash_mesh == null:
		_ash_mesh = QuadMesh.new()
		_ash_mesh.size = Vector2(0.06, 0.05)
		var mat := StandardMaterial3D.new()
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		mat.albedo_color = Color(0.32, 0.3, 0.29)
		mat.roughness = 1.0
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_ash_mesh.material = mat
	return _ash_mesh


## A jagged bolt from a to b, made of thin glowing boxes.
static func bolt(a: Vector3, b: Vector3, color: Color) -> void:
	var root := Node3D.new()
	Game.world.add_child(root)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var segments := 7
	var prev := a
	for i in range(1, segments + 1):
		var t := float(i) / segments
		var next := a.lerp(b, t)
		if i < segments:
			next += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * 0.35
		var seg_len := prev.distance_to(next)
		if seg_len > 0.01:
			var mi := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(0.07, 0.07, seg_len)
			mi.mesh = box
			mi.material_override = mat
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			root.add_child(mi)
			var up := Vector3.UP if absf((next - prev).normalized().y) < 0.95 else Vector3.RIGHT
			mi.look_at_from_position((prev + next) * 0.5, next, up)
		prev = next
	flash(b, color, 5.0, 6.0, 0.25)
	var tw := root.create_tween()
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.3)
	tw.tween_callback(root.queue_free)


static func shockwave(pos: Vector3, radius: float, color: Color) -> void:
	var mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.9
	torus.outer_radius = 1.0
	mi.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = mat
	Game.world.add_child(mi)
	mi.global_position = pos + Vector3(0, 0.3, 0)
	mi.scale = Vector3.ONE * 0.2
	var tw := mi.create_tween().set_parallel()
	tw.tween_property(mi, "scale", Vector3(radius, 1.0, radius), 0.35).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.45)
	tw.chain().tween_callback(mi.queue_free)
	flash(pos + Vector3(0, 1, 0), color, 4.0, radius * 2.0, 0.35)


static func flash(pos: Vector3, color: Color, energy: float, light_range: float, duration: float) -> void:
	var l := OmniLight3D.new()
	l.light_color = color
	l.light_energy = energy
	l.omni_range = light_range
	Game.world.add_child(l)
	l.global_position = pos
	var tw := l.create_tween()
	tw.tween_property(l, "light_energy", 0.0, duration)
	tw.tween_callback(l.queue_free)


# --- internals ----------------------------------------------------------------

static func _particles(pos: Vector3, amount: int, life: float, mesh: Mesh) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.explosiveness = 0.95
	p.amount = amount
	p.lifetime = life
	p.mesh = mesh
	Game.world.add_child(p)
	p.global_position = pos
	p.emitting = true
	Game.world.get_tree().create_timer(life + 0.3, false).timeout.connect(p.queue_free)
	return p


static func _add_decal(node: Node3D, pos: Vector3) -> void:
	Game.world.add_child(node)
	node.global_position = pos
	_decals.append(node)
	while _decals.size() > MAX_DECALS:
		var old: Node3D = _decals.pop_front()
		if is_instance_valid(old):
			old.queue_free()


static func _drops(color: Color) -> Mesh:
	var m := SphereMesh.new()
	m.radius = 0.035
	m.height = 0.07
	m.radial_segments = 6
	m.rings = 3
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.3
	m.material = mat
	return m


static func _glow_drops(color: Color) -> Mesh:
	var m := _drops(color)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = color
	(m as SphereMesh).material = mat
	return m


static func _flames() -> Mesh:
	var m := QuadMesh.new()
	m.size = Vector2(0.45, 0.45)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.albedo_texture = _soft_dot()
	m.material = mat
	return m


static func _fire_ramp() -> Gradient:
	var g := Gradient.new()
	g.set_color(0, Color(1.0, 0.9, 0.5, 1.0))
	g.set_color(1, Color(0.3, 0.05, 0.0, 0.0))
	g.add_point(0.35, Color(1.0, 0.45, 0.1, 0.9))
	return g


static var _dot: GradientTexture2D

static func _soft_dot() -> Texture2D:
	if _dot == null:
		var g := Gradient.new()
		g.set_color(0, Color(1, 1, 1, 1))
		g.set_color(1, Color(1, 1, 1, 0))
		_dot = GradientTexture2D.new()
		_dot.gradient = g
		_dot.fill = GradientTexture2D.FILL_RADIAL
		_dot.fill_from = Vector2(0.5, 0.5)
		_dot.fill_to = Vector2(1.0, 0.5)
		_dot.width = 64
		_dot.height = 64
	return _dot
