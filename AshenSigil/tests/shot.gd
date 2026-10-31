extends Node
## Renders the arena for a few seconds and saves a screenshot:
## godot --path . res://tests/shot.tscn -- <out.png> [glyph]


func _ready() -> void:
	var main: Node3D = preload("res://main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(4.5).timeout
	var p: Player = main.player
	var args := OS.get_cmdline_user_args()
	if args.size() > 1 and args[1] == "glyph":
		main._on_glyph_requested()
		var canvas: Control = main.hud.glyph
		await get_tree().process_frame
		var paper: Rect2 = canvas._paper_rect
		var c := paper.get_center()
		for i in 25:
			var a := -PI / 2.0 + TAU * i / 32.0
			canvas.points.append(c + Vector2(cos(a), sin(a)) * 120.0)
		canvas.queue_redraw()
		await get_tree().process_frame
	else:
		p.begin_windup(Fighter.Swing.OVERHEAD)
		await get_tree().create_timer(0.3).timeout
	var out := args[0] if args.size() > 0 else "user://shot.png"
	get_viewport().get_texture().get_image().save_png(out)
	print("saved ", out)
	get_tree().quit()
