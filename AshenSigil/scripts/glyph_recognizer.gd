class_name GlyphRecognizer
extends RefCounted
## $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007): resample the stroke,
## rotate to its indicative angle, scale, centre, then find the template with the
## smallest average point distance. Score is 0..1, higher is a cleaner sigil.

const N := 64
const SIZE := 250.0
const ANGLE_RANGE := deg_to_rad(45.0)
const ANGLE_STEP := deg_to_rad(2.0)
const PHI := 0.6180339887

var templates: Array = []


func add_template(glyph: String, points: PackedVector2Array) -> void:
	templates.append({"name": glyph, "points": _normalize(points)})


func recognize(points: PackedVector2Array) -> Dictionary:
	if points.size() < 10 or _path_length(points) < 60.0:
		return {"name": "", "score": 0.0}
	var c := _normalize(points)
	var best := INF
	var best_name := ""
	for t in templates:
		var d := _distance_at_best_angle(c, t.points)
		if d < best:
			best = d
			best_name = t.name
	var half_diag := 0.5 * sqrt(2.0 * SIZE * SIZE)
	return {"name": best_name, "score": maxf(0.0, 1.0 - best / half_diag)}


func _normalize(points: PackedVector2Array) -> PackedVector2Array:
	var p := _resample(points, N)
	p = _rotate_by(p, -_indicative_angle(p))
	p = _scale_to_square(p)
	return _translate_to_origin(p)


static func _resample(points: PackedVector2Array, n: int) -> PackedVector2Array:
	var interval := _path_length(points) / (n - 1)
	var acc := 0.0
	var src := points.duplicate()
	var out := PackedVector2Array([src[0]])
	var i := 1
	while i < src.size():
		var d := src[i - 1].distance_to(src[i])
		if acc + d >= interval and d > 0.0:
			var q := src[i - 1] + (interval - acc) / d * (src[i] - src[i - 1])
			out.append(q)
			src.insert(i, q)
			acc = 0.0
		else:
			acc += d
		i += 1
	while out.size() < n:
		out.append(src[src.size() - 1])
	out.resize(n)
	return out


static func _centroid(p: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for v in p:
		c += v
	return c / p.size()


static func _indicative_angle(p: PackedVector2Array) -> float:
	var c := _centroid(p)
	return atan2(c.y - p[0].y, c.x - p[0].x)


static func _rotate_by(p: PackedVector2Array, angle: float) -> PackedVector2Array:
	var c := _centroid(p)
	var out := PackedVector2Array()
	for v in p:
		out.append((v - c).rotated(angle) + c)
	return out


static func _scale_to_square(p: PackedVector2Array) -> PackedVector2Array:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for v in p:
		mn = mn.min(v)
		mx = mx.max(v)
	var w := maxf(mx.x - mn.x, 1.0)
	var h := maxf(mx.y - mn.y, 1.0)
	var out := PackedVector2Array()
	for v in p:
		out.append(Vector2(v.x * SIZE / w, v.y * SIZE / h))
	return out


static func _translate_to_origin(p: PackedVector2Array) -> PackedVector2Array:
	var c := _centroid(p)
	var out := PackedVector2Array()
	for v in p:
		out.append(v - c)
	return out


static func _distance_at_best_angle(p: PackedVector2Array, t: PackedVector2Array) -> float:
	var a := -ANGLE_RANGE
	var b := ANGLE_RANGE
	var x1 := PHI * a + (1.0 - PHI) * b
	var f1 := _distance_at_angle(p, t, x1)
	var x2 := (1.0 - PHI) * a + PHI * b
	var f2 := _distance_at_angle(p, t, x2)
	while absf(b - a) > ANGLE_STEP:
		if f1 < f2:
			b = x2
			x2 = x1
			f2 = f1
			x1 = PHI * a + (1.0 - PHI) * b
			f1 = _distance_at_angle(p, t, x1)
		else:
			a = x1
			x1 = x2
			f1 = f2
			x2 = (1.0 - PHI) * a + PHI * b
			f2 = _distance_at_angle(p, t, x2)
	return minf(f1, f2)


static func _distance_at_angle(p: PackedVector2Array, t: PackedVector2Array, angle: float) -> float:
	var r := _rotate_by(p, angle)
	var d := 0.0
	for i in r.size():
		d += r[i].distance_to(t[i])
	return d / r.size()


static func _path_length(p: PackedVector2Array) -> float:
	var d := 0.0
	for i in range(1, p.size()):
		d += p[i - 1].distance_to(p[i])
	return d
