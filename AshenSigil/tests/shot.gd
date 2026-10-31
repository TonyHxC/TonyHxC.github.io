extends Node
## Renders the arena and saves screenshots:
## godot --path . res://tests/shot.tscn -- <out.png> [mode]
##   (none)        the opening weapon pick
##   mask          the mask with a sigil inked on it
##   fight         axe and Storm, the first wave up, the power readied
##   drawing | prepared    the parchment mid-stroke / with a sigil ready
##   poses:<weapon>        close-ups of the hunter's stances; out is a prefix


func _ready() -> void:
	var main: Node3D = preload("res://main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(4.5).timeout
	var p: Player = main.player
	var args := OS.get_cmdline_user_args()
	var out := args[0] if args.size() > 0 else "user://shot.png"
	var mode := args[1] if args.size() > 1 else ""
	if mode == "mask":
		var rs: RunStart = main.hud.run_start
		rs.pick("sword")
		var c := Vector2(900, 300)
		rs.begin_stroke(c + Vector2(0, -110))
		for i in range(1, 33):
			var a := -PI / 2.0 + TAU * i / 32.0
			rs.add_point(c + Vector2(cos(a), sin(a)) * 110.0)
		rs.end_stroke()
		await get_tree().create_timer(0.5).timeout
	elif mode == "fight":
		await main.quick_start("axe", "storm")
		main._spawn_wave()
		await get_tree().create_timer(2.0).timeout
		p.ready_imbue()
		await get_tree().create_timer(0.3).timeout
	elif mode.begins_with("poses:"):
		await _poses(main, mode.get_slice(":", 1), out)
		get_tree().quit()
		return
	elif mode == "drawing" or mode == "prepared":
		await main.quick_start("sword", "ember")
		main._on_glyph_requested()
		var ui: SigilUI = main.hud.glyph
		# Drawn well away from the sheet, as a player would.
		var c := Vector2(950, 260)
		var steps := 25 if mode == "drawing" else 33
		ui.begin_stroke(c + Vector2(0, -110))
		for i in range(1, steps):
			var a := -PI / 2.0 + TAU * i / 32.0
			ui.add_point(c + Vector2(cos(a), sin(a)) * 110.0)
		if mode == "prepared":
			ui.end_stroke()
		await get_tree().create_timer(0.5, true, false, true).timeout
	_save(out)
	get_tree().quit()


func _save(path: String) -> void:
	get_viewport().get_texture().get_image().save_png(path)
	print("saved ", path)


var _sheet: Image
var _cells := 0
## How far above the screen centre (the hunter's feet) the crop starts.
var crop_rise := 260


## Crops around the hunter (screen centre) into the next cell of a 5x2 sheet.
func _cell(label: String) -> void:
	var img := get_viewport().get_texture().get_image()
	var c := img.get_size() / 2
	var cell := img.get_region(Rect2i(c.x - 200, c.y - crop_rise, 400, 400))
	if _sheet == null:
		_sheet = Image.create(2000, 800, false, cell.get_format())
	_sheet.blit_rect(cell, Rect2i(Vector2i.ZERO, cell.get_size()), Vector2i((_cells % 5) * 400, (_cells / 5) * 400))
	_cells += 1
	print("cell ", _cells, " ", label)


## The hunter up close: idle, each wind-up and cut, guard, and the power readied.
func _poses(main: Node3D, weapon: String, prefix: String) -> void:
	var p: Player = main.player
	main.hud.show_help = false
	await main.quick_start(weapon, "ember")
	main._next_wave_in = INF
	p.desired_facing = -0.25 * PI  # three-quarter view, sword arm toward the camera
	p.facing_locked = true
	await get_tree().create_timer(0.9).timeout  # let the camera's zoom-out finish
	main.camera.size = 5.0
	await get_tree().create_timer(0.2).timeout
	_cell("idle")
	var cuts := [[Fighter.Swing.SLASH_RL, "slash"], [Fighter.Swing.OVERHEAD, "overhead"], [Fighter.Swing.THRUST, "thrust"]]
	for cut in cuts:
		p.state = Fighter.State.IDLE
		p.stamina = p.max_stamina
		p.begin_windup(cut[0])
		p._drag = [Vector2(-100, 0), Vector2(100, 0), Vector2(0, 100), Vector2(0, -100)][cut[0]]
		await get_tree().create_timer(0.45).timeout
		_cell(cut[1] + " windup")
		p.release_swing(1.0)
		p.impulse = Vector3.ZERO
		await get_tree().create_timer(p.swing_time() * 0.45).timeout
		_cell(cut[1] + " swing")
		await get_tree().create_timer(0.9).timeout
	Input.action_press("guard")
	await get_tree().create_timer(0.4).timeout
	_cell("guard")
	Input.action_release("guard")
	p.ready_imbue()
	await get_tree().create_timer(0.4).timeout
	_cell("imbued")
	_sheet.save_png(prefix + ".png")
	print("saved ", prefix + ".png")
