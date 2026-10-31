class_name RunStart
extends Control
## The start of a run. First the hunter picks one weapon from the kit they
## carry, then inks a single sigil on their mask. The sigil's power, shaped by
## the weapon, is theirs for the run (E readies it in the fight).

signal weapon_picked(kind: String)
signal inscribed(glyph: String, power: float)

enum Phase { CLOSED, PICK, INK }
enum Ink { READY, DRAWING, FADING, TAKEN }

const CARD := Vector2(232, 196)
const CARD_GAP := 18.0
const FADE_TIME := 0.45
const MIN_FRAME := 140.0
const INK_COLOR := Color(0.1, 0.05, 0.04)
const IVORY := Color(0.86, 0.83, 0.76)
const TITLE := Color(0.75, 0.12, 0.08)
const SOFT := Color(0.78, 0.72, 0.6)
const TARNISH := Color(0.42, 0.37, 0.28)

var phase := Phase.CLOSED
var ink := Ink.READY
var weapon := ""
var glyph := ""
var power := 0.0
var score := 0.0
var stroke := PackedVector2Array()

var _font: Font
var _leather: Texture2D
var _stone: Texture2D
var _recognizer := GlyphRecognizer.new()
var _shapes: Dictionary
var _hover := -1
var _t := 0.0
var _ink_t := 0.0
var _audio := {}


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_font = Look.font()
	_leather = load(Look.TEX % ["brown_leather", "albedo"])
	_stone = load(Look.TEX % ["rustic_stone_wall_02", "albedo"])
	Spells.teach(_recognizer)
	_shapes = Spells.shapes()
	for key in ["scratch", "chime", "ignite"]:
		var a := AudioStreamPlayer.new()
		a.stream = Sfx.get_sound(key)
		a.volume_db = -6.0
		add_child(a)
		_audio[key] = a


func is_open() -> bool:
	return phase != Phase.CLOSED


func open() -> void:
	phase = Phase.PICK
	_t = 0.0
	visible = true


func pick(kind: String) -> void:
	if phase != Phase.PICK:
		return
	weapon = kind
	phase = Phase.INK
	ink = Ink.READY
	_t = 0.0
	stroke.clear()
	weapon_picked.emit(kind)


func begin_stroke(pos: Vector2) -> void:
	if phase != Phase.INK or not (ink == Ink.READY or ink == Ink.FADING):
		return
	ink = Ink.DRAWING
	stroke = PackedVector2Array([pos])


func add_point(pos: Vector2) -> void:
	if ink == Ink.DRAWING and pos.distance_to(stroke[stroke.size() - 1]) > 2.0:
		stroke.append(pos)


func end_stroke() -> void:
	if ink != Ink.DRAWING:
		return
	var res := _recognizer.recognize(stroke)
	score = res["score"]
	var p := Spells.power_for(score)
	if res["name"] == "" or p <= 0.0:
		ink = Ink.FADING
		_ink_t = 0.0
		_play("scratch")
		return
	glyph = res["name"]
	power = p
	ink = Ink.TAKEN
	_ink_t = 0.0
	_play("chime")


## Back to a clean mask, to try a different sigil.
func wipe() -> void:
	if ink == Ink.TAKEN:
		ink = Ink.READY
		stroke.clear()


func confirm() -> void:
	if phase != Phase.INK or ink != Ink.TAKEN:
		return
	phase = Phase.CLOSED
	visible = false
	_play("ignite")
	inscribed.emit(glyph, power)


# --- input ----------------------------------------------------------------------

func _input(event: InputEvent) -> void:
	if phase == Phase.CLOSED:
		return
	var mb := event as InputEventMouseButton
	var key := event as InputEventKey
	if phase == Phase.PICK:
		if event is InputEventMouseMotion:
			_hover = _card_at(get_global_mouse_position())
		elif mb and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			var i := _card_at(get_global_mouse_position())
			if i >= 0:
				pick(Weapons.ORDER[i])
		elif key and key.pressed and not key.echo and key.physical_keycode >= KEY_1 and key.physical_keycode <= KEY_4:
			pick(Weapons.ORDER[key.physical_keycode - KEY_1])
		get_viewport().set_input_as_handled()
		return
	if mb and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed:
			if ink == Ink.TAKEN:
				confirm()
			else:
				begin_stroke(get_global_mouse_position())
		else:
			end_stroke()
	elif mb and mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT:
		wipe()
	elif event is InputEventMouseMotion:
		add_point(get_global_mouse_position())
	get_viewport().set_input_as_handled()


func _process(_delta: float) -> void:
	if phase == Phase.CLOSED:
		return
	_t += Game.real_delta
	_ink_t += Game.real_delta
	if ink == Ink.FADING and _ink_t >= FADE_TIME:
		ink = Ink.READY
		stroke.clear()
	queue_redraw()


# --- pick -----------------------------------------------------------------------

func _card_rect(i: int) -> Rect2:
	var total := CARD.x * 4.0 + CARD_GAP * 3.0
	var x := (size.x - total) * 0.5 + i * (CARD.x + CARD_GAP)
	return Rect2(x, size.y - CARD.y - 56.0, CARD.x, CARD.y)


func _card_at(p: Vector2) -> int:
	for i in 4:
		if _card_rect(i).has_point(p):
			return i
	return -1


func _draw() -> void:
	if phase == Phase.CLOSED:
		return
	var fade := clampf(_t / 0.4, 0.0, 1.0)
	if phase == Phase.PICK:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.0, 0.0, 0.35 * fade))
		_text_c(size.y * 0.13, "Choose your arm", 44, Color(TITLE, fade))
		_text_c(size.y * 0.13 + 30.0, "One weapon goes into the yard with you.   Click it, or press 1-4.", 16, Color(SOFT, fade))
		for i in 4:
			_draw_card(i)
	else:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.02, 0.0, 0.0, 0.6 * fade))
		_draw_ink_phase()


func _draw_card(i: int) -> void:
	var kind: String = Weapons.ORDER[i]
	var info: Dictionary = Weapons.STATS[kind]
	var r := _card_rect(i)
	var lit := i == _hover
	if lit:
		r.position.y -= 6.0
	draw_rect(r.grow(3), Color(0, 0, 0, 0.6))
	draw_texture_rect(_leather, r, true, Color(0.42, 0.34, 0.28) if not lit else Color(0.55, 0.44, 0.34))
	_frame(r, Color(1.0, 0.7, 0.35) if lit else TARNISH)
	var x := r.position.x + 16.0
	var y := r.position.y + 34.0
	_text(Vector2(x, y), info.title, 26, Color(0.92, 0.82, 0.66))
	_text(Vector2(r.end.x - 26.0, y - 4.0), str(i + 1), 16, Color(0.6, 0.55, 0.47))
	y += 14.0
	for row in Weapons.ratings(kind):
		_text(Vector2(x, y + 10.0), row[0], 13, SOFT)
		var bar := Rect2(x + 62.0, y + 2.0, CARD.x - 94.0, 7.0)
		draw_rect(bar.grow(2), Color(0.03, 0.02, 0.015, 0.92))
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * row[1], bar.size.y)), Color(0.62, 0.12, 0.07))
		y += 18.0
	draw_multiline_string_outline(_font, Vector2(x, y + 16.0), info.blurb, HORIZONTAL_ALIGNMENT_LEFT, CARD.x - 32.0, 14, -1, 4, Color(0, 0, 0, 0.7))
	draw_multiline_string(_font, Vector2(x, y + 16.0), info.blurb, HORIZONTAL_ALIGNMENT_LEFT, CARD.x - 32.0, 14, -1, Color(0.82, 0.76, 0.66))


# --- ink ------------------------------------------------------------------------

func _mask_center() -> Vector2:
	return Vector2(size.x * 0.5, size.y * 0.4)


func _mask_radii() -> Vector2:
	var k := clampf(size.y / 720.0, 0.8, 1.6)
	return Vector2(104, 136) * k


func _draw_ink_phase() -> void:
	var title := "Ink one sigil on the mask"
	_text_c(size.y * 0.09, title, 38, TITLE)
	_text_c(size.y * 0.09 + 26.0, "It wakes the %s's power for the whole run." % Weapons.STATS[weapon].title.to_lower(), 16, SOFT)
	var c := _mask_center()
	if ink == Ink.FADING:
		c.x += sin(_ink_t * 70.0) * 4.0 * (1.0 - _ink_t / FADE_TIME)
	_draw_mask(c, _mask_radii())
	if stroke.size() > 1:
		_draw_ink(c)
	_draw_tablet()
	var hint := "Draw anywhere   ·   hold Tab for guides"
	if ink == Ink.TAKEN:
		var col: Color = Spells.GLYPHS[glyph].color
		var power_info := Imbue.info(weapon, glyph)
		var y := c.y + _mask_radii().y + 34.0
		_text_c(y, "%s  ·  %d%%" % [power_info.title, roundi(score * 100.0)], 28, col)
		_text_c(y + 24.0, power_info.desc, 16, SOFT)
		hint = "Click to put on the mask   ·   right-click to wipe it clean"
	elif ink == Ink.FADING:
		_text_c(c.y + _mask_radii().y + 34.0, "The ink will not take.", 20, Color(0.7, 0.35, 0.28))
	_text_c(size.y - 22.0, hint, 14, Color(0.66, 0.6, 0.52, 0.9))


## A porcelain mask, cracked and stained: almond eye holes, a brow, a slit mouth.
func _draw_mask(c: Vector2, r: Vector2) -> void:
	var outline := PackedVector2Array()
	var colors := PackedColorArray()
	for i in 56:
		var a := TAU * i / 56.0
		var v := Vector2(cos(a), sin(a))
		if v.y > 0.0:
			v.x *= 1.0 - 0.28 * v.y * v.y  # the chin narrows
		outline.append(c + v * r)
		# Lit from the top left; the lower right sinks into shadow.
		colors.append(IVORY.darkened(clampf(0.12 + 0.22 * (v.x * 0.5 + v.y * 0.7), 0.0, 0.45)))
	var shadow := PackedVector2Array()
	for p in outline:
		shadow.append(p + Vector2(8, 12))
	draw_colored_polygon(shadow, Color(0, 0, 0, 0.45))
	draw_polygon(outline, colors)
	var ring := outline.duplicate()
	ring.append(outline[0])
	draw_polyline(ring, Color(0.3, 0.24, 0.18), 2.5, true)
	for side in [-1.0, 1.0]:
		var e := c + Vector2(side * 0.38 * r.x, -0.14 * r.y)
		var eye := PackedVector2Array()
		for i in 16:
			var a := TAU * i / 16.0
			eye.append(e + Vector2(cos(a) * 0.24 * r.x, sin(a) * 0.085 * r.y * (1.2 if sin(a) > 0.0 else 0.8)))
		draw_colored_polygon(eye, Color(0.04, 0.03, 0.03))
		var brow := PackedVector2Array()
		for i in 9:
			var t := float(i) / 8.0
			brow.append(e + Vector2(lerpf(-0.3, 0.3, t) * r.x, -0.16 * r.y - sin(t * PI) * 0.05 * r.y))
		draw_polyline(brow, Color(0.45, 0.4, 0.34, 0.7), 2.0, true)
	draw_line(c + Vector2(0, -0.02 * r.y), c + Vector2(0, 0.3 * r.y), Color(0.5, 0.45, 0.38, 0.5), 2.0, true)
	draw_line(c + Vector2(-0.16 * r.x, 0.56 * r.y), c + Vector2(0.16 * r.x, 0.56 * r.y), Color(0.12, 0.08, 0.06), 2.5, true)
	var crack := PackedVector2Array([c + Vector2(0.52, -0.82) * r, c + Vector2(0.42, -0.6) * r, c + Vector2(0.47, -0.45) * r, c + Vector2(0.36, -0.3) * r])
	draw_polyline(crack, Color(0.25, 0.2, 0.16, 0.8), 1.5, true)


## The stroke, scaled from wherever it was drawn onto the face of the mask.
func _draw_ink(c: Vector2) -> void:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for p in stroke:
		mn = mn.min(p)
		mx = mx.max(p)
	var extent := maxf(maxf(mx.x - mn.x, mx.y - mn.y), MIN_FRAME)
	var mid := (mn + mx) * 0.5
	var room := _mask_radii().x * 1.25
	var pts := PackedVector2Array()
	for p in stroke:
		pts.append(c + Vector2(0, 0.05 * _mask_radii().y) + (p - mid) / extent * room)
	var col := INK_COLOR
	match ink:
		Ink.FADING:
			col.a = 1.0 - _ink_t / FADE_TIME
		Ink.TAKEN:
			var g: Color = Spells.GLYPHS[glyph].color
			var glow := g
			glow.a = 0.25 + 0.12 * sin(_t * 6.0)
			draw_polyline(pts, glow, 11.0, true)
			col = g.darkened(0.45)
	var bleed := INK_COLOR
	bleed.a = 0.2 * col.a
	draw_polyline(pts, bleed, 8.0, true)
	draw_polyline(pts, col, 4.0, true)


## The three sigils cut in stone, each with the power it would give this weapon.
func _draw_tablet() -> void:
	var names := ["ember", "storm", "ward"]
	var slot := 196.0
	var plate := Rect2((size.x - slot * 3.0 - 24.0) * 0.5, size.y - 128.0, slot * 3.0 + 24.0, 70.0)
	draw_rect(plate.grow(3), Color(0, 0, 0, 0.5))
	draw_texture_rect(_stone, plate, true, Color(0.3, 0.28, 0.26))
	_frame(plate, TARNISH)
	var guide := Input.is_action_pressed("sigil_help")
	for i in names.size():
		var g: String = names[i]
		var col: Color = Spells.GLYPHS[g].color
		var lit := ink == Ink.TAKEN and g == glyph
		var mid := Vector2(plate.position.x + 12.0 + i * slot + 30.0, plate.get_center().y)
		var mini := PackedVector2Array()
		for v in _shapes[g][0]:
			mini.append(mid + v * 16.0)
		draw_polyline(mini, Color(0.05, 0.04, 0.035), 3.0, true)
		if lit:
			draw_polyline(mini, col, 1.8, true)
		if guide:
			draw_circle(mini[0], 3.0, Color(0.62, 0.1, 0.05))
		var power_info := Imbue.info(weapon, g)
		_text(Vector2(mid.x + 28.0, mid.y - 4.0), Spells.GLYPHS[g].title, 13, Color(0.6, 0.55, 0.47))
		_text(Vector2(mid.x + 28.0, mid.y + 16.0), power_info.title, 17, col if lit or ink != Ink.TAKEN else SOFT)


# --- helpers --------------------------------------------------------------------

func _frame(r: Rect2, col: Color) -> void:
	draw_rect(r, col.darkened(0.3), false, 3.0)
	draw_line(r.position, Vector2(r.end.x, r.position.y), col.lightened(0.15), 1.0)
	for corner in [r.position + Vector2(5, 5), Vector2(r.end.x - 5, r.position.y + 5), Vector2(r.position.x + 5, r.end.y - 5), r.end - Vector2(5, 5)]:
		draw_circle(corner, 2.8, col)


func _text(pos: Vector2, text: String, fsize: int, col: Color) -> void:
	draw_string_outline(_font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, 4, Color(0, 0, 0, 0.8 * col.a))
	draw_string(_font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, col)


func _text_c(y: float, text: String, fsize: int, col: Color) -> void:
	draw_string_outline(_font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, size.x, fsize, 5, Color(0, 0, 0, 0.8 * col.a))
	draw_string(_font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, size.x, fsize, col)


func _play(key: String) -> void:
	var a: AudioStreamPlayer = _audio.get(key)
	if a:
		a.play()
