extends CanvasLayer
## Vignette, bars, wave text, swing read-out, toasts and the death screen.

const VIGNETTE := """
shader_type canvas_item;
uniform float strength = 0.85;
uniform float pain = 0.0;
void fragment() {
	vec2 uv = UV - 0.5;
	float d = length(uv * vec2(1.0, 0.85));
	float v = smoothstep(0.28, 0.78, d);
	vec3 tint = mix(vec3(0.03, 0.018, 0.012), vec3(0.4, 0.0, 0.0), pain);
	COLOR = vec4(tint, clamp(v * strength + pain * 0.35 * v, 0.0, 1.0));
}
"""

var player: Player
var glyph: Control
var run_start: RunStart
var font: Font
var wave := 0
var kills := 0
var show_help := true

var _root: Control
var _vignette: ShaderMaterial
var _leather: Texture2D
var _pain := 0.0
var _toast := ""
var _toast_color := Color.WHITE
var _toast_t := 0.0


func _ready() -> void:
	layer = 10
	font = Look.font()
	_leather = load(Look.TEX % ["brown_leather", "albedo"])
	var vig := ColorRect.new()
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	sh.code = VIGNETTE
	_vignette = ShaderMaterial.new()
	_vignette.shader = sh
	vig.material = _vignette
	add_child(vig)

	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.draw.connect(_on_draw)
	add_child(_root)

	glyph = SigilUI.new()
	add_child(glyph)
	run_start = RunStart.new()
	add_child(run_start)


func bind(p: Player) -> void:
	player = p
	p.hurt.connect(func(_f: Fighter, amount: float) -> void: _pain = minf(1.0, _pain + amount / 30.0))


func toast(text: String, color: Color) -> void:
	_toast = text
	_toast_color = color
	_toast_t = 3.0


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("help"):
		show_help = not show_help


func _process(delta: float) -> void:
	_pain = maxf(0.0, _pain - delta * 1.5)
	_toast_t = maxf(0.0, _toast_t - delta / maxf(Engine.time_scale, 0.05))
	var low := 0.0
	if player and not player.is_dead():
		low = clampf(1.0 - player.health / (player.max_health * 0.35), 0.0, 1.0) * 0.5
	_vignette.set_shader_parameter("pain", maxf(_pain, low))
	_root.queue_redraw()


func _on_draw() -> void:
	if player == null:
		return
	var s := _root.size
	var c := _root
	if not player.ready_to_fight and not player.is_dead():
		return  # the start screens have the floor

	# A worn leather panel trimmed in tarnished metal holds the bars and paper.
	var bx := 28.0
	var by := s.y - 64.0
	var panel := Rect2(bx - 14, by - 30, 384, 76)
	c.draw_rect(panel.grow(3), Color(0, 0, 0, 0.55))
	c.draw_texture_rect(_leather, panel, true, Color(0.42, 0.34, 0.28))
	_metal_frame(panel)
	_bar(Rect2(bx, by, 280, 14), player.health / player.max_health, Color(0.5, 0.04, 0.03))
	_bar(Rect2(bx, by + 22, 280, 8), player.stamina / player.max_stamina, Color(0.58, 0.47, 0.2))
	if player.winded_t > 0.0:
		# Too winded to swing: flash the stamina bar so a dead click isn't a mystery.
		c.draw_rect(Rect2(bx, by + 22, 280, 8).grow(3), Color(1.0, 0.25, 0.15, player.winded_t * 2.0), false, 2.0)
	_text(Vector2(bx, by - 8), "%d / %d" % [ceili(player.health), int(player.max_health)], 15, Color(0.8, 0.7, 0.62))

	# Paper stack beside the bars.
	var px := bx + 300.0
	var sheets := mini(player.paper, 3)
	for i in range(sheets - 1, -1, -1):
		var o := Vector2(i * 3.0, -i * 3.0)
		var r := Rect2(Vector2(px, by - 6) + o, Vector2(19, 25))
		c.draw_rect(r, Color(0.78, 0.69, 0.52).darkened(0.14 * i))
		c.draw_rect(r, Color(0.36, 0.24, 0.13), false, 1.0)
	if sheets == 0:
		c.draw_rect(Rect2(px, by - 6, 19, 25), Color(0.36, 0.24, 0.13, 0.6), false, 1.0)
	var paper_col := Color(0.8, 0.73, 0.58) if player.paper > 0 else Color(0.66, 0.32, 0.26)
	_text(Vector2(px + 30, by + 12), "×%d" % player.paper, 19, paper_col)
	_text(Vector2(px + 30, by + 30), "Q", 12, Color(0.6, 0.55, 0.47))
	if player.ready_to_fight:
		_mask_panel(Rect2(panel.end.x + 14, panel.position.y, 250, panel.size.y))

	# Wave, top centre.
	_text_c(Vector2(0, 40), s.x, "Wave %d" % wave if wave > 0 else "", 26, Color(0.75, 0.12, 0.08))
	_text_c(Vector2(0, 64), s.x, "%d slain" % kills if kills > 0 else "", 14, Color(0.6, 0.55, 0.5))

	# Swing read-out while winding up.
	if player.state == Fighter.State.WINDUP:
		var w := 180.0
		var r := Rect2((s.x - w) * 0.5, s.y - 120, w, 6)
		_bar(r, player.charge(), Color(1.0, 0.75, 0.35))
		_text_c(Vector2(0, s.y - 128), s.x, player.swing_name(), 18, Color(1.0, 0.85, 0.6))

	if _toast_t > 0.0:
		var col := _toast_color
		col.a = clampf(_toast_t, 0.0, 1.0)
		_text_c(Vector2(0, s.y * 0.28), s.x, _toast, 22, col)

	if show_help and player.ready_to_fight:
		var lines := [
			"WASD  move          Mouse  aim",
			"Hold LMB  wind up   drag while holding: <- -> slash, down overhead, up %s" % ("whirl" if player.whirl else "thrust"),
			"Release  swing      longer hold = heavier, more stamina",
			"RMB  guard (tap just before a hit to parry)",
			"Space  dodge        Wheel  zoom         H  hide help",
			"Q  sigil mode: draw anywhere, release, then click to cast   (Tab: sigil guides)",
			"E  wake the mask's power, then land a blow to release it",
		]
		for i in lines.size():
			_text(Vector2(20, 28 + i * 19), lines[i], 14, Color(0.68, 0.63, 0.56, 0.85))

	if player.is_dead():
		c.draw_rect(Rect2(Vector2.ZERO, s), Color(0.05, 0.0, 0.0, 0.55))
		_text_c(Vector2(0, s.y * 0.45), s.x, "YOU HAVE FALLEN", 52, Color(0.7, 0.06, 0.04))
		_text_c(Vector2(0, s.y * 0.45 + 44), s.x, "Wave %d   %d slain" % [wave, kills], 18, Color(0.75, 0.7, 0.65))
		_text_c(Vector2(0, s.y * 0.45 + 74), s.x, "Press R to rise again", 18, Color(0.85, 0.8, 0.7))


## The weapon, the sigil on the mask and the state of its power (E).
func _mask_panel(r: Rect2) -> void:
	var c := _root
	c.draw_rect(r.grow(3), Color(0, 0, 0, 0.55))
	c.draw_texture_rect(_leather, r, true, Color(0.42, 0.34, 0.28))
	_metal_frame(r)
	var info := player.imbue_info()
	var col: Color = Spells.GLYPHS[player.mask_glyph].color if player.mask_glyph != "" else Color.WHITE
	# The sigil, small, as it's inked on the mask.
	var mid := r.position + Vector2(30, r.size.y * 0.5)
	c.draw_circle(mid, 21.0, Color(0.82, 0.79, 0.72))
	c.draw_arc(mid, 21.0, 0.0, TAU, 32, Color(0.3, 0.24, 0.18), 1.5, true)
	if player.mask_glyph != "":
		var pts := PackedVector2Array()
		for v in Spells.shapes()[player.mask_glyph][0]:
			pts.append(mid + v * 12.0)
		var lit := player.imbue_armed or player.imbue_cd <= 0.0
		c.draw_polyline(pts, col.darkened(0.4) if lit else Color(0.25, 0.2, 0.18), 2.4, true)
	var x := r.position.x + 62.0
	_text(Vector2(x, r.position.y + 22), Weapons.STATS[player.weapon].title, 15, Color(0.8, 0.7, 0.62))
	if info.is_empty():
		return
	_text(Vector2(x, r.position.y + 42), info.title, 17, col)
	var line := Rect2(x, r.position.y + 54, r.end.x - x - 40.0, 6)
	if player.imbue_armed:
		var pulse := 0.75 + 0.25 * sin(Time.get_ticks_msec() / 110.0)
		_text(Vector2(x, r.position.y + 66), "Readied: land a blow", 13, Color(col, pulse))
	elif player.imbue_cd > 0.0:
		_bar(line, 1.0 - player.imbue_cd / Imbue.COOLDOWN, col.darkened(0.4))
	else:
		_text(Vector2(x, r.position.y + 66), "Ready", 13, Color(0.8, 0.73, 0.58))
	_text(Vector2(r.end.x - 26, r.position.y + 66), "E", 13, Color(0.6, 0.55, 0.47))


## A sunken channel with a two-tone fill, so the bar reads as liquid in a groove.
func _bar(r: Rect2, frac: float, color: Color) -> void:
	_root.draw_rect(r.grow(2), Color(0.03, 0.02, 0.015, 0.92))
	var fill := Rect2(r.position, Vector2(r.size.x * clampf(frac, 0.0, 1.0), r.size.y))
	_root.draw_rect(fill, color)
	_root.draw_rect(Rect2(fill.position, Vector2(fill.size.x, fill.size.y * 0.4)), color.lightened(0.18))
	_root.draw_line(r.position + Vector2(-2, r.size.y + 2), r.end + Vector2(2, 2), Color(0.5, 0.44, 0.34, 0.5), 1.0)


const TARNISH := Color(0.42, 0.37, 0.28)


func _metal_frame(r: Rect2) -> void:
	_root.draw_rect(r, TARNISH.darkened(0.3), false, 3.0)
	_root.draw_line(r.position, Vector2(r.end.x, r.position.y), TARNISH.lightened(0.15), 1.0)
	_root.draw_line(r.position, Vector2(r.position.x, r.end.y), TARNISH.lightened(0.05), 1.0)
	for corner in [r.position + Vector2(5, 5), Vector2(r.end.x - 5, r.position.y + 5), Vector2(r.position.x + 5, r.end.y - 5), r.end - Vector2(5, 5)]:
		_root.draw_circle(corner + Vector2(0.8, 0.8), 3.0, Color(0, 0, 0, 0.6))
		_root.draw_circle(corner, 2.8, TARNISH)
		_root.draw_circle(corner - Vector2(0.8, 0.8), 1.1, TARNISH.lightened(0.35))


func _text(pos: Vector2, text: String, fsize: int, color: Color) -> void:
	_root.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, 4, Color(0, 0, 0, color.a * 0.8))
	_root.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, color)


func _text_c(pos: Vector2, width: float, text: String, fsize: int, color: Color) -> void:
	if text.is_empty():
		return
	_root.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_CENTER, width, fsize, 5, Color(0, 0, 0, color.a * 0.8))
	_root.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_CENTER, width, fsize, color)
