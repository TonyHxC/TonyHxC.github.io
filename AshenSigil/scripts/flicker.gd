extends Light3D
## Candle and torch flicker layered from two sine waves and a little noise.

var _base := 0.0
var _t := 0.0


func _ready() -> void:
	_base = light_energy
	_t = randf() * 100.0


func _process(delta: float) -> void:
	_t += delta
	var f := sin(_t * 9.0) * 0.06 + sin(_t * 23.0 + 1.3) * 0.04 + randf_range(-0.04, 0.04)
	light_energy = _base * (1.0 + f)
