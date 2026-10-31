extends Node
## Renders the arena for a few seconds and saves a screenshot:
## godot --path . res://tests/shot.tscn -- <out.png> [drawing|prepared]


func _ready() -> void:
	var main: Node3D = preload("res://main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(4.5).timeout
	var p: Player = main.player
	var args := OS.get_cmdline_user_args()
	var sigil := args[1] if args.size() > 1 else ""
	if sigil == "drawing" or sigil == "prepared":
		main._on_glyph_requested()
		var ui: SigilUI = main.hud.glyph
		# Drawn well away from the sheet, as a player would.
		var c := Vector2(950, 260)
		var steps := 25 if sigil == "drawing" else 33
		ui.begin_stroke(c + Vector2(0, -110))
		for i in range(1, steps):
			var a := -PI / 2.0 + TAU * i / 32.0
			ui.add_point(c + Vector2(cos(a), sin(a)) * 110.0)
		if sigil == "prepared":
			ui.end_stroke()
		await get_tree().create_timer(0.5, true, false, true).timeout
	else:
		p.begin_windup(Fighter.Swing.OVERHEAD)
		await get_tree().create_timer(0.3).timeout
	var out := args[0] if args.size() > 0 else "user://shot.png"
	get_viewport().get_texture().get_image().save_png(out)
	print("saved ", out)
	get_tree().quit()
