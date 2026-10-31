class_name SpellPaper
extends Node3D
## The inked sheet, flung from the hand. It catches fire mid-flight and the
## sigil goes off where it lands.

var glyph := ""
var power := 1.0
var caster: Fighter
var from := Vector3.ZERO
var to := Vector3.ZERO
var flight := 0.45

var _t := 0.0
var _mat: StandardMaterial3D
var _light: OmniLight3D
var _sheet: MeshInstance3D
var _lit := false


func setup(g: String, p: float, c: Fighter, start: Vector3, target: Vector3) -> void:
	glyph = g
	power = p
	caster = c
	from = start
	to = target
	flight = 0.25 if glyph == "ward" else clampf(from.distance_to(to) / 14.0, 0.25, 0.6)


func _ready() -> void:
	_sheet = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(0.28, 0.38)
	_sheet.mesh = q
	_mat = StandardMaterial3D.new()
	_mat.albedo_color = Color(0.86, 0.79, 0.62)
	_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_mat.emission_enabled = true
	_mat.emission = Spells.GLYPHS[glyph].color
	_mat.emission_energy_multiplier = 0.0
	_sheet.material_override = _mat
	add_child(_sheet)
	_light = OmniLight3D.new()
	_light.light_color = Spells.GLYPHS[glyph].color
	_light.light_energy = 0.0
	_light.omni_range = 4.0
	add_child(_light)
	global_position = from


func _process(delta: float) -> void:
	_t += delta
	var p := clampf(_t / flight, 0.0, 1.0)
	var pos := from.lerp(to + Vector3(0, 0.3, 0), p)
	pos.y += sin(p * PI) * 1.4
	global_position = pos
	_sheet.rotation = Vector3(_t * 9.0, _t * 13.0, 0.0)
	if p > 0.35 and not _lit:
		_lit = true
		Fx.sparks(global_position, Spells.GLYPHS[glyph].color, 10)
	if _lit:
		_mat.emission_energy_multiplier = lerpf(_mat.emission_energy_multiplier, 4.0, 0.2)
		_light.light_energy = lerpf(_light.light_energy, 3.0, 0.2)
	if p >= 1.0:
		if is_instance_valid(caster):
			Spells.detonate(glyph, power, caster, to)
		queue_free()
