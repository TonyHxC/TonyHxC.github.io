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
