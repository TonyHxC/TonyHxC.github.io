class_name SigilUI
extends Control
## Sigil mode. Q unfolds a small enchanted parchment beside the hero. The
## gesture is captured anywhere on screen and scaled onto the sheet while a
## faint copy forms on the ground. A valid sigil glows and is held ready; click
## to throw it where you aim (Repulsion goes off at once). A bad one fades and
## costs nothing, so you can try again.

signal closed
signal cast(glyph: String, power: float)

enum Mode { CLOSED, READY, DRAWING, FADING, PREPARED }

const SHEET := Vector2(96, 118)
const CURL := 15.0
const OFFSET := Vector2(96, 46)  # from the hero's chest, in screen pixels
const MIN_FRAME := 140.0  # small strokes aren't blown up to fill the sheet
const GROUND_RADIUS := 1.1
const FADE_TIME := 0.45
const BURN_TIME := 0.5
const LEARN_CASTS := 2
const INK := Color(0.16, 0.03, 0.02)
const PARCHMENT := Color(0.87, 0.79, 0.61)
const EDGE := Color(0.42, 0.29, 0.16)
const SOFT_TEXT := Color(0.85, 0.8, 0.7)

var mode := Mode.CLOSED
var player: Player
var recognizer := GlyphRecognizer.new()
var stroke := PackedVector2Array()
var glyph := ""
var power := 0.0
var score := 0.0
var learned := {}
var font: Font

var _t := 0.0
var _mode_t := 0.0
var _burn := -1.0
var _outline := PackedVector2Array()
var _shapes: Dictionary
var _center := Vector2.ZERO
var _embers: Array = []
var _ground: MeshInstance3D
var _ground_mat: StandardMaterial3D
var _reticle: MeshInstance3D
var _reticle_mat: StandardMaterial3D
var _audio := {}


func _ready() -> void:
	# Already in the tree here, so offsets must be reset too or it stays 0x0.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	Spells.teach(recognizer)
	_shapes = Spells.shapes()
	font = ThemeDB.fallback_font
	for key in ["scratch", "chime", "ignite"]:
		var a := AudioStreamPlayer.new()
		a.stream = Sfx.get_sound(key)
		a.volume_db = -6.0
		add_child(a)
		_audio[key] = a


func is_open() -> bool:
	return mode != Mode.CLOSED


func open(p: Player) -> void:
	player = p
	_ensure_3d()
	mode = Mode.READY
	_mode_t = 0.0
	_t = 0.0
	_burn = -1.0
	stroke.clear()
	_outline = _make_outline()
	_rebuild_ground()
	visible = true


func close() -> void:
	if mode == Mode.CLOSED:
		return
	mode = Mode.CLOSED
	if player:
		player.facing_locked = false
	if _burn < 0.0:
		stroke.clear()
		_rebuild_ground()
	closed.emit()


# --- input --------------------------------------------------------------------

func _input(event: InputEvent) -> void:
	if mode == Mode.CLOSED:
		return
	var mb := event as InputEventMouseButton
	var cancel := event.is_action_pressed("glyph") or event.is_action_pressed("ui_cancel")
	if mb and mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT:
		cancel = true
	if cancel:
		close()
		get_viewport().set_input_as_handled()
		return
	if mb and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed:
			if mode == Mode.PREPARED:
				cast_prepared()
			else:
				begin_stroke(get_global_mouse_position())
		elif mode == Mode.DRAWING:
			end_stroke()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and mode == Mode.DRAWING:
		add_point(get_global_mouse_position())


func begin_stroke(pos: Vector2) -> void:
	if mode != Mode.READY and mode != Mode.FADING:
		return
	mode = Mode.DRAWING
	_mode_t = 0.0
	stroke = PackedVector2Array([pos])
	player.facing_locked = true
	_rebuild_ground()


func add_point(pos: Vector2) -> void:
	if mode == Mode.DRAWING and pos.distance_to(stroke[stroke.size() - 1]) > 2.0:
		stroke.append(pos)
		_rebuild_ground()


func end_stroke() -> void:
	if mode != Mode.DRAWING:
		return
	player.facing_locked = false
	var res := recognizer.recognize(stroke)
	score = res["score"]
	var p := Spells.power_for(score)
	if res["name"] == "" or p <= 0.0:
		mode = Mode.FADING
		_mode_t = 0.0
		_play("scratch")
		return
	glyph = res["name"]
	power = p
	learned[glyph] = int(learned.get(glyph, 0)) + 1
	mode = Mode.PREPARED
	_mode_t = 0.0
	_play("chime")
	if glyph == "ward":
		cast_prepared()


func cast_prepared() -> void:
	if mode != Mode.PREPARED:
		return
	var g := glyph
	var p := power
	_burn = 0.0
	_spawn_embers()
	_play("ignite")
	mode = Mode.CLOSED
	player.facing_locked = false
	cast.emit(g, p)
	closed.emit()


# --- frame ----------------------------------------------------------------------

func _process(_delta: float) -> void:
	var dt := Game.real_delta
	_t += dt
	_mode_t += dt
	if mode == Mode.FADING and _mode_t >= FADE_TIME:
		mode = Mode.READY
		stroke.clear()
		_rebuild_ground()
	if _burn >= 0.0:
		_burn += dt / BURN_TIME
		if _burn >= 1.0:
			_burn = -1.0
			if mode == Mode.CLOSED:
				stroke.clear()
				_rebuild_ground()
	for e in _embers:
		e["life"] -= dt
		e["vel"] += Vector2(0, -40) * dt
		e["pos"] += e["vel"] * dt
	_embers = _embers.filter(func(e: Dictionary) -> bool: return e["life"] > 0.0)
	if player and is_instance_valid(player) and player.cam:
		var chest := player.cam.unproject_position(player.global_position + Vector3(0, 1.1, 0))
		_center = chest + OFFSET + Vector2(0, sin(_t * 2.2) * 3.0)
	_update_3d()
	visible = mode != Mode.CLOSED or _burn >= 0.0 or not _embers.is_empty()
	queue_redraw()


func _ink_color() -> Color:
	var spell := Color.WHITE
	if glyph != "":
		spell = Spells.GLYPHS[glyph].color
	match mode:
		Mode.FADING:
			var c := INK
			c.a = 1.0 - _mode_t / FADE_TIME
			return c
		Mode.PREPARED:
			return spell
	if _burn >= 0.0:
		var c := spell
		c.a = 1.0 - _burn
		return c
	return INK


# --- drawing --------------------------------------------------------------------

func _draw() -> void:
	if player == null:
		return
	if mode != Mode.CLOSED:
		_draw_reference()
	if mode != Mode.CLOSED or _burn >= 0.0:
		_draw_sheet()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for e in _embers:
		var c: Color = e["color"]
		var life: float = e["life"]
		c.a = clampf(life / 0.6, 0.0, 1.0)
		draw_circle(e["pos"], 1.6 + life * 2.0, c)


func _draw_sheet() -> void:
	var unfold := 1.0 - pow(1.0 - clampf(_t / 0.22, 0.0, 1.0), 3.0)
	var scale_v := Vector2(lerpf(0.25, 1.0, unfold), lerpf(0.05, 1.0, unfold))
	var rot := deg_to_rad(-5.0 + sin(_t * 1.3) * 1.5)
	var pos := _center
	if mode == Mode.FADING:
		pos.x += sin(_mode_t * 70.0) * 3.0 * (1.0 - _mode_t / FADE_TIME)
	var burn := maxf(_burn, 0.0)
	if _burn >= 0.0:
		scale_v *= 1.0 - 0.2 * burn
		pos.y -= burn * 14.0

	# Drop shadow, offset further as it bobs higher.
	draw_set_transform(pos + Vector2(7, 14 - sin(_t * 2.2) * 2.0), rot, scale_v)
	draw_colored_polygon(_outline, Color(0, 0, 0, 0.35 * (1.0 - burn)))

	draw_set_transform(pos, rot, scale_v)
	var colors := PackedColorArray()
	for v in _outline:
		var shade := clampf((v.y + SHEET.y * 0.5) / SHEET.y, 0.0, 1.0) * 0.18
		var c := PARCHMENT.darkened(shade).lerp(Color(0.12, 0.05, 0.02), burn)
		c.a = 1.0 - burn * burn
		colors.append(c)
	draw_polygon(_outline, colors)
	var edge := EDGE.lerp(Color(1.0, 0.5, 0.1), burn)
	edge.a = 1.0 - burn
	var ring := _outline.duplicate()
	ring.append(_outline[0])
	draw_polyline(ring, edge, 1.5 + burn * 2.0, true)

	# The curled-over corner.
	var hw := SHEET.x * 0.5
	var hh := SHEET.y * 0.5
	var fold := PackedVector2Array([Vector2(hw, hh - CURL), Vector2(hw - CURL, hh), Vector2(hw - CURL + 2, hh - CURL + 2)])
	var fold_col := PARCHMENT.darkened(0.28)
	fold_col.a = 1.0 - burn
	draw_colored_polygon(fold, fold_col)
	draw_polyline(PackedVector2Array([fold[0], fold[2], fold[1]]), edge, 1.0, true)

	# Ink, scaled from wherever the gesture was drawn onto the sheet.
	if stroke.size() > 1:
		var ink := _to_sheet()
		var c := _ink_color()
		if mode == Mode.PREPARED or _burn >= 0.0:
			var glow := c
			glow.a *= 0.45 + 0.2 * sin(_t * 8.0)
			draw_polyline(ink, glow, 8.0, true)
			var core := c.darkened(0.15)
			core.a = c.a
			draw_polyline(ink, core, 3.0, true)
		else:
			draw_polyline(ink, c, 2.5, true)

	if mode == Mode.PREPARED:
		var info: Dictionary = Spells.GLYPHS[glyph]
		var label := "%s  %d%%" % [info.title, roundi(score * 100.0)]
		draw_string(font, Vector2(-hw, hh - 9), label, HORIZONTAL_ALIGNMENT_CENTER, SHEET.x, 12, (info.color as Color).darkened(0.35))


## Three tiny glyphs near the bottom of the screen. Start dots and direction
## arrows show while a sigil is still being learned, or while Tab is held.
func _draw_reference() -> void:
	var guide_all := Input.is_action_pressed("sigil_help")
	var names := ["ember", "storm", "ward"]
	var slot := 128.0
	var y := size.y - 104.0
	var x0 := (size.x - slot * names.size()) * 0.5
	for i in names.size():
		var g: String = names[i]
		var info: Dictionary = Spells.GLYPHS[g]
		var col: Color = info.color if (mode == Mode.PREPARED and g == glyph) else SOFT_TEXT
		var mid := Vector2(x0 + i * slot + 22, y)
		var stroke_pts: PackedVector2Array = _shapes[g][0]
		var mini := PackedVector2Array()
		for v in stroke_pts:
			mini.append(mid + v * 11.0)
		_outlined_polyline(mini, col, 2.0)
		if guide_all or int(learned.get(g, 0)) < LEARN_CASTS:
			draw_circle(mini[0], 3.0, Color(0.85, 0.15, 0.08))
			_arrow(mini, 0.38, Color(0.85, 0.15, 0.08))
		_text(Vector2(x0 + i * slot + 40, y + 5), info.title, 14, info.color)
	var hint := "Draw anywhere with left mouse   ·   hold Tab for guides   ·   Q / right-click: put away"
	if mode == Mode.PREPARED:
		hint = "Click to cast %s where you aim   ·   Q / right-click: put away" % Spells.GLYPHS[glyph].title
	_text_centered(y + 32.0, hint, 12, Color(0.75, 0.7, 0.62, 0.9))


func _arrow(points: PackedVector2Array, along: float, col: Color) -> void:
	var total := 0.0
	for i in range(1, points.size()):
		total += points[i - 1].distance_to(points[i])
	var want := total * along
	for i in range(1, points.size()):
		var seg := points[i - 1].distance_to(points[i])
		if want <= seg and seg > 0.0:
			var dir := (points[i] - points[i - 1]) / seg
			var tip := points[i - 1] + dir * want
			var side := Vector2(-dir.y, dir.x)
			draw_colored_polygon(PackedVector2Array([tip + dir * 4.0, tip - dir * 3.0 + side * 3.5, tip - dir * 3.0 - side * 3.5]), col)
			return
		want -= seg


func _outlined_polyline(points: PackedVector2Array, col: Color, width: float) -> void:
	draw_polyline(points, Color(0, 0, 0, 0.7), width + 2.5, true)
	draw_polyline(points, col, width, true)


func _text(pos: Vector2, text: String, fsize: int, col: Color) -> void:
	draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, 4, Color(0, 0, 0, 0.8))
	draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, col)


func _text_centered(y: float, text: String, fsize: int, col: Color) -> void:
	draw_string_outline(font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, size.x, fsize, 4, Color(0, 0, 0, 0.8))
	draw_string(font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, size.x, fsize, col)


# --- geometry -------------------------------------------------------------------

## Returns [centre, extent] of the stroke drawn so far.
func _frame() -> Array:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for p in stroke:
		mn = mn.min(p)
		mx = mx.max(p)
	return [(mn + mx) * 0.5, maxf(maxf(mx.x - mn.x, mx.y - mn.y), MIN_FRAME)]


func _to_sheet() -> PackedVector2Array:
	var f := _frame()
	var c: Vector2 = f[0]
	var extent: float = f[1]
	var room := SHEET.x - 28.0
	var out := PackedVector2Array()
	for p in stroke:
		out.append((p - c) / extent * room + Vector2(0, -7))
	return out


## Torn edge: jittered inward, with the bottom-right corner folded over.
func _make_outline() -> PackedVector2Array:
	var hw := SHEET.x * 0.5
	var hh := SHEET.y * 0.5
	var corners := [Vector2(-hw, -hh), Vector2(hw, -hh), Vector2(hw, hh - CURL), Vector2(hw - CURL, hh), Vector2(-hw, hh)]
	var pts := PackedVector2Array()
	for k in corners.size():
		var a: Vector2 = corners[k]
		var b: Vector2 = corners[(k + 1) % corners.size()]
		var steps := maxi(1, int(a.distance_to(b) / 6.0))
		var inward := -((a + b) * 0.5).normalized()
		for i in steps:
			var p := a.lerp(b, float(i) / steps)
			if i > 0:
				p += inward * randf_range(0.0, 3.5)
			pts.append(p)
	return pts


func _spawn_embers() -> void:
	var rot := deg_to_rad(-5.0)
	for i in 46:
		var v: Vector2 = _outline[randi() % _outline.size()]
		_embers.append({
			"pos": _center + v.rotated(rot),
			"vel": Vector2(randf_range(-30, 30), randf_range(-70, -20)),
			"life": randf_range(0.35, 0.8),
			"color": Color(1.0, randf_range(0.35, 0.7), 0.1),
		})


# --- the ground sigil and aiming ring -------------------------------------------

func _ensure_3d() -> void:
	if _ground and is_instance_valid(_ground):
		return
	_ground_mat = StandardMaterial3D.new()
	_ground_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ground_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ground_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_ground_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	_ground = MeshInstance3D.new()
	_ground.mesh = ImmediateMesh.new()
	_ground.material_override = _ground_mat
	_ground.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	Game.world.add_child(_ground)

	_reticle_mat = _ground_mat.duplicate() as StandardMaterial3D
	_reticle = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.95
	torus.outer_radius = 1.0
	torus.rings = 48
	_reticle.mesh = torus
	_reticle.material_override = _reticle_mat
	_reticle.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_reticle.visible = false
	Game.world.add_child(_reticle)


func _rebuild_ground() -> void:
	if _ground == null:
		return
	var im := _ground.mesh as ImmediateMesh
	im.clear_surfaces()
	if stroke.size() < 2:
		return
	var f := _frame()
	var c: Vector2 = f[0]
	var extent: float = f[1]
	var pts: Array[Vector3] = []
	for p in stroke:
		var v := (p - c) / extent * GROUND_RADIUS * 2.0
		pts.append(Player.CAM_RIGHT * v.x - Player.CAM_FWD * v.y)
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(1, pts.size()):
		var a := pts[i - 1]
		var b := pts[i]
		var d := b - a
		if d.length() < 0.001:
			continue
		var n := Vector3(-d.z, 0.0, d.x).normalized() * 0.045
		for v in [a + n, b + n, b - n, a + n, b - n, a - n]:
			im.surface_add_vertex(v)
	im.surface_end()


func _update_3d() -> void:
	if _ground == null or player == null or not is_instance_valid(player):
		return
	_ground.global_position = player.global_position + Vector3(0, 0.03, 0)
	var c := Color(0.75, 0.18, 0.1, 0.55)
	if mode == Mode.FADING:
		c.a *= 1.0 - _mode_t / FADE_TIME
	elif mode == Mode.PREPARED:
		c = Spells.GLYPHS[glyph].color
		c.a = 0.75 + 0.25 * sin(_t * 8.0)
	elif _burn >= 0.0:
		c = Spells.GLYPHS[glyph].color
		c.a = 1.0 - _burn
	_ground_mat.albedo_color = c
	_ground.visible = stroke.size() > 1

	var aiming := mode == Mode.PREPARED and glyph != "ward"
	_reticle.visible = aiming
	if aiming:
		var r := Spells.radius(glyph, power)
		_reticle.global_position = player.spell_target(glyph) + Vector3(0, 0.05, 0)
		_reticle.scale = Vector3(r, 0.05, r) * (1.0 + 0.04 * sin(_t * 6.0))
		var rc: Color = Spells.GLYPHS[glyph].color
		rc.a = 0.55 + 0.2 * sin(_t * 6.0)
		_reticle_mat.albedo_color = rc


func _play(key: String) -> void:
	var a: AudioStreamPlayer = _audio.get(key)
	if a:
		a.play()
