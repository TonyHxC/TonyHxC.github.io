extends Node
## Renders the arena for a few seconds and saves a screenshot:
## godot --path . res://tests/shot.tscn -- <out.png>


func _ready() -> void:
	var main: Node3D = preload("res://main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(4.5).timeout
	var p: Player = main.player
	p.begin_windup(Fighter.Swing.OVERHEAD)
	await get_tree().create_timer(0.3).timeout
	var args := OS.get_cmdline_user_args()
	var out := args[0] if args.size() > 0 else "user://shot.png"
	get_viewport().get_texture().get_image().save_png(out)
	print("saved ", out)
	get_tree().quit()
