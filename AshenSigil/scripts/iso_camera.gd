extends Camera3D
## Fixed-angle orthographic follow camera with trauma-based shake.

const OFFSET := Vector3(11.0, 13.0, 11.0)

var target: Node3D
var trauma := 0.0
var _focus := Vector3.ZERO


func _ready() -> void:
	projection = PROJECTION_ORTHOGONAL
	size = 15.0
	near = 0.1
	far = 120.0


func snap() -> void:
	if target:
		_focus = target.global_position
	_place()


func add_trauma(amount: float) -> void:
	trauma = minf(1.0, trauma + amount)


func _unhandled_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb and mb.pressed:
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			size = maxf(9.0, size - 1.0)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			size = minf(22.0, size + 1.0)


func _process(delta: float) -> void:
	if target:
		_focus = _focus.lerp(target.global_position, 1.0 - exp(-6.0 * delta))
	trauma = maxf(0.0, trauma - delta * 1.6)
	_place()
	var s := trauma * trauma * 0.4
	h_offset = randf_range(-1.0, 1.0) * s
	v_offset = randf_range(-1.0, 1.0) * s


func _place() -> void:
	global_position = _focus + OFFSET
	look_at(_focus, Vector3.UP)
