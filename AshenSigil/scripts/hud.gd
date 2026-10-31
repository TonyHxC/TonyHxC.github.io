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
	vec3 tint = mix(vec3(0.0), vec3(0.45, 0.0, 0.0), pain);
	COLOR = vec4(tint, clamp(v * strength + pain * 0.35 * v, 0.0, 1.0));
}
"""

var player: Player
var glyph: Control
var font: Font
var wave := 0
var kills := 0
var show_help := true

var _root: Control
var _vignette: ShaderMaterial
var _pain := 0.0
var _toast := ""
var _toast_color := Color.WHITE
var _toast_t := 0.0


func _ready() -> void:
	layer = 10
	font = ThemeDB.fallback_font
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

	# Bars, bottom-left.
	var bx := 28.0
	var by := s.y - 64.0
	_bar(Rect2(bx, by, 280, 16), player.health / player.max_health, Color(0.6, 0.05, 0.04))
	_bar(Rect2(bx, by + 22, 280, 9), player.stamina / player.max_stamina, Color(0.75, 0.62, 0.25))
	_text(Vector2(bx, by - 10), "%d / %d" % [ceili(player.health), int(player.max_health)], 14, Color(0.85, 0.75, 0.7))

	# Paper stack beside the bars.
	var px := bx + 304.0
	var sheets := mini(player.paper, 3)
	for i in range(sheets - 1, -1, -1):
		var o := Vector2(i * 3.0, -i * 3.0)
		var r := Rect2(Vector2(px, by - 2) + o, Vector2(20, 26))
		c.draw_rect(r, Color(0.84, 0.76, 0.58).darkened(0.12 * i))
		c.draw_rect(r, Color(0.4, 0.28, 0.15), false, 1.0)
	if sheets == 0:
		c.draw_rect(Rect2(px, by - 2, 20, 26), Color(0.4, 0.28, 0.15, 0.6), false, 1.0)
	var paper_col := Color(0.85, 0.79, 0.64) if player.paper > 0 else Color(0.7, 0.35, 0.3)
	_text(Vector2(px + 32, by + 18), "×%d" % player.paper, 18, paper_col)
	_text(Vector2(px + 32, by + 34), "Q", 11, Color(0.65, 0.6, 0.52))

	# Wave, top centre.
	_text_c(Vector2(0, 40), s.x, "Wave %d" % wave if wave > 0 else "", 26, Color(0.75, 0.12, 0.08))
	_text_c(Vector2(0, 64), s.x, "%d slain" % kills if kills > 0 else "", 14, Color(0.6, 0.55, 0.5))

	# Swing read-out while winding up.
	if player.state == Fighter.State.WINDUP:
		var w := 180.0
		var r := Rect2((s.x - w) * 0.5, s.y - 120, w, 6)
		_bar(r, player.charge(), Color(1.0, 0.75, 0.35))
		_text_c(Vector2(0, s.y - 128), s.x, Fighter.SWING_NAMES[player.swing_type], 18, Color(1.0, 0.85, 0.6))

	if _toast_t > 0.0:
		var col := _toast_color
		col.a = clampf(_toast_t, 0.0, 1.0)
		_text_c(Vector2(0, s.y * 0.28), s.x, _toast, 22, col)

	if show_help:
		var lines := [
			"WASD  move          Mouse  aim",
			"Hold LMB  wind up   drag while holding: <- -> slash, down overhead, up thrust",
			"Release  swing      longer hold = heavier, more stamina",
			"RMB  guard (tap just before a hit to parry)",
			"Space  dodge        Wheel  zoom         H  hide help",
			"Q  sigil mode: draw anywhere, release, then click to cast   (Tab: sigil guides)",
		]
		for i in lines.size():
			_text(Vector2(20, 28 + i * 18), lines[i], 13, Color(0.7, 0.66, 0.6, 0.85))

	if player.is_dead():
		c.draw_rect(Rect2(Vector2.ZERO, s), Color(0.05, 0.0, 0.0, 0.55))
		_text_c(Vector2(0, s.y * 0.45), s.x, "YOU HAVE FALLEN", 52, Color(0.7, 0.06, 0.04))
		_text_c(Vector2(0, s.y * 0.45 + 44), s.x, "Wave %d   %d slain" % [wave, kills], 18, Color(0.75, 0.7, 0.65))
		_text_c(Vector2(0, s.y * 0.45 + 74), s.x, "Press R to rise again", 18, Color(0.85, 0.8, 0.7))


func _bar(r: Rect2, frac: float, color: Color) -> void:
	_root.draw_rect(r.grow(2), Color(0.05, 0.03, 0.03, 0.85))
	_root.draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(frac, 0.0, 1.0), r.size.y)), color)
	_root.draw_rect(r.grow(2), Color(0.35, 0.28, 0.2), false, 1.0)


func _text(pos: Vector2, text: String, fsize: int, color: Color) -> void:
	_root.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, 4, Color(0, 0, 0, color.a * 0.8))
	_root.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, color)


func _text_c(pos: Vector2, width: float, text: String, fsize: int, color: Color) -> void:
	if text.is_empty():
		return
	_root.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_CENTER, width, fsize, 5, Color(0, 0, 0, color.a * 0.8))
	_root.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_CENTER, width, fsize, color)
