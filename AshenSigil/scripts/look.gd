class_name Look
## The game's material and type palette: matte surfaces from the CC0 texture
## set (nothing glossy), and the old-print serif for text.

const TEX := "res://assets/textures/%s_%s.jpg"

static var _cache := {}
static var _font: Font


## Shared world surface, projected in world space so pieces line up.
static func surface(tex: String, scale := 0.4, tint := Color.WHITE) -> StandardMaterial3D:
	var key := "%s|%s|%s" % [tex, scale, tint]
	if not _cache.has(key):
		_cache[key] = _make(tex, scale, tint, true)
	return _cache[key]


## A fresh material stuck to the object (for characters, whose materials flash
## when hit and so can't be shared).
static func cloth(tex: String, tint: Color, scale := 2.5) -> StandardMaterial3D:
	# Character tints are picked as the colour you should see; dark source
	# textures need lifting so the tint isn't crushed to black.
	var gain: float = CLOTH_GAIN.get(tex, 1.0)
	var lifted := Color(minf(tint.r * gain, 1.0), minf(tint.g * gain, 1.0), minf(tint.b * gain, 1.0), tint.a)
	return _make(tex, scale, lifted, false)


const CLOTH_GAIN := {"brown_leather": 2.4, "rusty_metal_02": 1.3}


static func matte(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 1.0
	m.metallic_specular = 0.15
	return m


static func font() -> Font:
	if _font == null:
		_font = load("res://assets/fonts/IMFellEnglish-Regular.ttf")
	return _font


static func _make(tex: String, scale: float, tint: Color, world: bool) -> StandardMaterial3D:
	var m := matte(tint)
	m.albedo_texture = load(TEX % [tex, "albedo"])
	var normal := TEX % [tex, "normal"]
	if ResourceLoader.exists(normal):
		m.normal_enabled = true
		m.normal_texture = load(normal)
		m.normal_scale = 1.3
	m.uv1_triplanar = true
	m.uv1_world_triplanar = world
	m.uv1_scale = Vector3.ONE * scale
	return m
