class_name Sfx
## Tiny procedural sounds, synthesised once and cached, so there are no audio
## files to license or download.

const RATE := 22050

static var _cache := {}


static func get_sound(key: String) -> AudioStreamWAV:
	if not _cache.has(key):
		match key:
			"scratch": _cache[key] = _scratch()
			"chime": _cache[key] = _chime()
			"ignite": _cache[key] = _ignite()
			"ready": _cache[key] = _ready_ring()
			"break": _cache[key] = _clang()
	return _cache.get(key)


## Filtered noise with a fast tremolo: a nib dragging across paper.
static func _scratch() -> AudioStreamWAV:
	var n := int(RATE * 0.22)
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / n
		lp = lerpf(lp, randf_range(-1.0, 1.0), 0.35)
		out[i] = lp * pow(1.0 - t, 2.0) * (0.55 + 0.45 * sin(i * 0.045)) * 0.6
	return _wav(out)


## A soft bell: the sigil took.
static func _chime() -> AudioStreamWAV:
	var n := int(RATE * 0.6)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var s := float(i) / RATE
		var tone := sin(TAU * 660.0 * s) + 0.6 * sin(TAU * 990.0 * s) + 0.3 * sin(TAU * 1485.0 * s)
		out[i] = tone * exp(-float(i) / n * 6.0) * 0.22
	return _wav(out)


## A breathy whoosh: noise that swells then falls away as the paper catches.
static func _ignite() -> AudioStreamWAV:
	var n := int(RATE * 0.5)
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var t := float(i) / n
		lp = lerpf(lp, randf_range(-1.0, 1.0), 0.12 + 0.3 * t)
		out[i] = lp * smoothstep(0.0, 0.12, t) * pow(1.0 - t, 1.5) * 0.9
	return _wav(out)


## Plays a sound once from a node's position in the world, then cleans up.
static func play(key: String, at: Node3D, volume_db := -4.0) -> void:
	if Game.world == null or not at.is_inside_tree():
		return
	var p := AudioStreamPlayer3D.new()
	p.stream = get_sound(key)
	p.volume_db = volume_db
	p.unit_size = 14.0
	Game.world.add_child(p)
	p.global_position = at.global_position
	p.finished.connect(p.queue_free)
	p.play()


## A low, cracking clang with a rattle: a posture or guard gives way.
static func _clang() -> AudioStreamWAV:
	var n := int(RATE * 0.45)
	var out := PackedFloat32Array()
	out.resize(n)
	var lp := 0.0
	for i in n:
		var s := float(i) / RATE
		var t := float(i) / n
		lp = lerpf(lp, randf_range(-1.0, 1.0), 0.5)
		var tone := sin(TAU * 310.0 * s) + 0.7 * sin(TAU * 467.0 * s) + 0.4 * sin(TAU * 1240.0 * s)
		out[i] = (tone * 0.3 + lp * 0.5 * exp(-t * 18.0)) * exp(-t * 6.0) * 0.5
	return _wav(out)


## A short, bright metallic ring: a heavy blow is charged.
static func _ready_ring() -> AudioStreamWAV:
	var n := int(RATE * 0.35)
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		var s := float(i) / RATE
		var tone := sin(TAU * 1180.0 * s) + 0.5 * sin(TAU * 2950.0 * s) + 0.25 * sin(TAU * 4410.0 * s)
		out[i] = tone * exp(-float(i) / n * 9.0) * 0.2
	return _wav(out)


static func _wav(samples: PackedFloat32Array) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in samples.size():
		data.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	return w
