extends Control
## The parchment. Time crawls while it is open; draw one stroke, release, and
## the sheet is thrown. Q, Esc or right-click puts it away unused.

signal finished(glyph: String, score: float)
signal cancelled

const PAPER := Vector2(400, 400)
const INK := Color(0.16, 0.03, 0.02)

var recognizer := GlyphRecognizer.new()
var points := PackedVector2Array()
var drawing := false
var font: Font

var _shapes: Dictionary
var _paper_rect := Rect2()


func _ready() -> void:
	# Already in the tree here, so offsets must be reset too or it stays 0x0.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	Spells.teach(recognizer)
	_shapes = Spells.shapes()
	if font == null:
		font = ThemeDB.fallback_font


func open() -> void:
	points.clear()
	drawing = false
	visible = true
	queue_redraw()


func close() -> void:
	visible = false
	drawing = false


func _input(event: InputEvent) -> void:
	if not visible:
		return
	var cancel := event.is_action_pressed("glyph") or event.is_action_pressed("ui_cancel")
	var mb := event as InputEventMouseButton
	if mb and mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT:
		cancel = true
	if cancel:
		close()
		cancelled.emit()
		get_viewport().set_input_as_handled()


func _gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed and _paper_rect.has_point(mb.position):
			drawing = true
			points = PackedVector2Array([mb.position])
		elif not mb.pressed and drawing:
			drawing = false
			_finish()
		accept_event()
	var mm := event as InputEventMouseMotion
	if mm and drawing:
		var p := mm.position.clamp(_paper_rect.position, _paper_rect.end)
		if p.distance_to(points[points.size() - 1]) > 2.0:
			points.append(p)
			queue_redraw()
		accept_event()


func _finish() -> void:
	var res := recognizer.recognize(points)
	close()
	finished.emit(res["name"], res["score"])


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.0, 0.0, 0.0, 0.6))
	var origin := (size - PAPER) * 0.5 - Vector2(110, 0)
	_paper_rect = Rect2(origin, PAPER)

	# Scorched edge, then parchment.
	draw_rect(_paper_rect.grow(10), Color(0.12, 0.07, 0.04))
	draw_rect(_paper_rect.grow(4), Color(0.45, 0.32, 0.18))
	draw_rect(_paper_rect, Color(0.84, 0.76, 0.58))
	var c := _paper_rect.get_center()
	draw_arc(c, 150, 0, TAU, 64, Color(0.55, 0.45, 0.32, 0.35), 2.0, true)
	draw_arc(c, 165, 0, TAU, 64, Color(0.55, 0.45, 0.32, 0.25), 1.0, true)

	draw_string(font, origin + Vector2(0, -24), "Ink a sigil", HORIZONTAL_ALIGNMENT_CENTER, PAPER.x, 26, Color(0.9, 0.82, 0.65))
	draw_string(font, origin + Vector2(0, PAPER.y + 40), "Hold left mouse and draw in one stroke. Release to cast.   Q / Esc / right-click: put it away",
		HORIZONTAL_ALIGNMENT_CENTER, PAPER.x + 220, 14, Color(0.75, 0.7, 0.6))

	if points.size() > 1:
		draw_polyline(points, INK, 7.0, true)

	# Grimoire margin.
	var g := Vector2(_paper_rect.end.x + 40, origin.y)
	draw_string(font, g + Vector2(0, 18), "Grimoire", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(0.9, 0.82, 0.65))
	var y := 50.0
	for glyph in Spells.GLYPHS:
		var info: Dictionary = Spells.GLYPHS[glyph]
		var box := Rect2(g + Vector2(0, y), Vector2(70, 70))
		draw_rect(box, Color(0.84, 0.76, 0.58, 0.9))
		var stroke: PackedVector2Array = _shapes[glyph][0]
		var mini := PackedVector2Array()
		for v in stroke:
			mini.append(box.get_center() + v * 26.0)
		draw_polyline(mini, INK, 3.0, true)
		draw_circle(mini[0], 4.0, Color(0.7, 0.1, 0.05))
		draw_string(font, g + Vector2(84, y + 30), info.title, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, info.color)
		draw_string(font, g + Vector2(84, y + 52), info.hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(0.7, 0.65, 0.55))
		y += 100.0
