extends Node
## Global glue: input map, time control (hit-stop and the sigil slow-down),
## camera shake and on-screen messages.

var world: Node3D
var player: Fighter
var camera: Camera3D
var hud: Node

var slowmo := false
var _hitstop := 0.0
var _last_us := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_last_us = Time.get_ticks_usec()
	_setup_input()


func _process(_delta: float) -> void:
	# Real (unscaled) time, so hit-stop ends on schedule even while slowed.
	var now := Time.get_ticks_usec()
	var real_delta := (now - _last_us) / 1000000.0
	_last_us = now
	_hitstop = maxf(0.0, _hitstop - real_delta)
	var ts := 0.12 if slowmo else 1.0
	if _hitstop > 0.0:
		ts = minf(ts, 0.06)
	Engine.time_scale = ts


func hitstop(seconds: float) -> void:
	_hitstop = maxf(_hitstop, seconds)


func shake(amount: float) -> void:
	if camera:
		camera.add_trauma(amount)


func toast(text: String, color := Color(0.9, 0.85, 0.75)) -> void:
	if hud:
		hud.toast(text, color)


func reset() -> void:
	slowmo = false
	_hitstop = 0.0
	Engine.time_scale = 1.0


func _setup_input() -> void:
	_key("move_forward", [KEY_W, KEY_UP])
	_key("move_back", [KEY_S, KEY_DOWN])
	_key("move_left", [KEY_A, KEY_LEFT])
	_key("move_right", [KEY_D, KEY_RIGHT])
	_key("dodge", [KEY_SPACE])
	_key("glyph", [KEY_Q])
	_key("restart", [KEY_R])
	_key("help", [KEY_H])
	_mouse("attack", MOUSE_BUTTON_LEFT)
	_mouse("guard", MOUSE_BUTTON_RIGHT)


func _key(action: String, keys: Array) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(action, e)


func _mouse(action: String, button: MouseButton) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	var e := InputEventMouseButton.new()
	e.button_index = button
	InputMap.action_add_event(action, e)
