class_name HunterModel
extends Node3D
## The hunter: drex.glb's rig and meshes, its animations for walking, drawing
## and masking, and an ArmRig on top that swings whichever weapon was chosen.
## The model carries every weapon until one is picked; the rest are put away.

signal action_done(anim_name: String)

const SCENE := preload("res://assets/models/drex.glb")
const BONES := {"sword": "W_Sword", "dagger": "W_Dagger", "axe": "W_Axe", "flail": "W_Flail"}
const FLAIL_MESHES := ["flail_wood_dark", "flail_boot_leather", "flail_aged_steel"]
const LOOPS := ["Idle", "Idle_Armed", "Walk", "Walk_Armed"]
const WALK_SPEED := 2.6  # ground speed at which the walk cycle plays at 1x

var skeleton: Skeleton3D
var anim: AnimationPlayer
var rig: ArmRig
var weapon := ""
var armed := false
var body_mats: Array[StandardMaterial3D] = []
var weapon_mat: StandardMaterial3D
var mask_mat: StandardMaterial3D
## The one-shot animation playing (drawing, masking), or "".
var action := ""

var _weapon_nodes := {}
var _hit_flash: Color


func build(hit_flash: Color, glow: Color) -> void:
	_hit_flash = hit_flash
	var root: Node3D = SCENE.instantiate()
	root.rotation.y = PI  # authored facing +Z; fighters face -Z
	add_child(root)
	skeleton = root.find_children("*", "Skeleton3D", true, false)[0]
	anim = root.find_children("*", "AnimationPlayer", true, false)[0]
	for n in LOOPS:
		anim.get_animation(n).loop_mode = Animation.LOOP_LINEAR
	anim.animation_finished.connect(_on_finished)

	weapon_mat = Fighter._glowable(Look.matte(Color(0.62, 0.62, 0.64)), glow)
	weapon_mat.metallic = 0.6
	weapon_mat.roughness = 0.5
	for k in BONES:
		_weapon_nodes[k] = []
	for mi in skeleton.find_children("*", "MeshInstance3D", false, false):
		_dress_mesh(mi as MeshInstance3D)
	_forge("sword")
	_forge("dagger")
	_forge("axe")

	rig = ArmRig.new()
	rig.setup(skeleton)
	skeleton.add_child(rig)
	rig.mask_offset = _mask_offset()
	anim.play("Idle")


## Every material gets its own copy with emission switched on (but dark), so
## hit flashes and glows only change numbers and never compile a new shader.
func _dress_mesh(mi: MeshInstance3D) -> void:
	for i in mi.mesh.get_surface_count():
		var m := (mi.mesh.surface_get_material(i) as StandardMaterial3D).duplicate() as StandardMaterial3D
		m.roughness = maxf(m.roughness, 0.6)
		if m.metallic > 0.3:
			# Pale steel blows out to white under the lantern; age it.
			m.albedo_color = m.albedo_color.darkened(0.45)
		if mi.name == "flail_aged_steel":
			m = weapon_mat
		elif mi.name == "hunter_mask_white":
			mask_mat = Fighter._glowable(m, Color.WHITE)
		else:
			Fighter._glowable(m, _hit_flash)
			if not mi.name in FLAIL_MESHES:
				body_mats.append(m)
		mi.set_surface_override_material(i, m)
	if mi.name in FLAIL_MESHES:
		_weapon_nodes["flail"].append(mi)


## The rig has bones for the sword, dagger and axe but no meshes for them, so
## they're built here in the bone's own space: grip at the origin, head down -Y,
## edges along X.
func _forge(kind: String) -> void:
	var att := BoneAttachment3D.new()
	att.bone_name = BONES[kind]
	skeleton.add_child(att)
	_weapon_nodes[kind].append(att)
	var leather := Fighter._glowable(Look.cloth("brown_leather", Color(0.3, 0.2, 0.15)), _hit_flash)
	var wood := Fighter._glowable(Look.cloth("weathered_planks", Color(0.45, 0.33, 0.24)), _hit_flash)
	match kind:
		"sword":
			_piece(att, Fighter._sphere(0.028), Vector3(0, 0.11, 0), leather)
			_piece(att, Fighter._cone(0.018, 0.17, 0.018), Vector3(0, 0.02, 0), leather)
			_piece(att, Fighter._box(Vector3(0.2, 0.03, 0.04)), Vector3(0, -0.07, 0), weapon_mat)
			_piece(att, Fighter._box(Vector3(0.05, 0.82, 0.012)), Vector3(0, -0.49, 0), weapon_mat)
			_tip(att, 0.05, 0.12, -0.96)
		"dagger":
			_piece(att, Fighter._cone(0.016, 0.12, 0.016), Vector3(0, 0.03, 0), leather)
			_piece(att, Fighter._box(Vector3(0.11, 0.022, 0.03)), Vector3(0, -0.04, 0), weapon_mat)
			_piece(att, Fighter._box(Vector3(0.036, 0.26, 0.01)), Vector3(0, -0.18, 0), weapon_mat)
			_tip(att, 0.036, 0.08, -0.35)
		"axe":
			_piece(att, Fighter._cone(0.022, 0.8, 0.02), Vector3(0, -0.26, 0), wood)
			_piece(att, Fighter._box(Vector3(0.07, 0.11, 0.05)), Vector3(0, -0.6, 0), weapon_mat)
			var bit := _piece(att, Fighter._box(Vector3(0.2, 0.2, 0.018)), Vector3(0.13, -0.61, 0), weapon_mat)
			bit.rotation.z = 0.12
			var spike := _piece(att, Fighter._cone(0.03, 0.12), Vector3(-0.08, -0.6, 0), weapon_mat)
			spike.rotation.z = PI / 2.0


func _piece(parent: Node3D, mesh: Mesh, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


## A flat, pointed blade end.
func _tip(parent: Node3D, width: float, length: float, y: float) -> void:
	var tip := _piece(parent, Fighter._cone(width * 0.5, length), Vector3(0, y, 0), weapon_mat)
	tip.rotation.x = PI
	(tip.mesh as CylinderMesh).radial_segments = 4
	tip.scale = Vector3(1.0, 1.0, 0.25)


## Keeps only the chosen weapon; "" shows the full kit (before the pick).
func set_weapon(kind: String) -> void:
	weapon = kind
	for k in _weapon_nodes:
		for n in _weapon_nodes[k]:
			(n as Node3D).visible = kind == "" or k == kind
	rig.weapon_bone = skeleton.find_bone(BONES[kind]) if kind != "" else -1
	rig.chain_bone = skeleton.find_bone("FlailChain") if kind == "flail" else -1


## Plays a one-shot (MaskOn, Draw_Sword...) and waits for it to end.
func play_action(anim_name: String) -> void:
	action = anim_name
	anim.speed_scale = 1.0
	anim.play(anim_name, 0.2)
	await action_done


func update_locomotion(speed: float) -> void:
	if action != "":
		return
	var moving := speed > 0.4
	var n := ("Walk" if moving else "Idle") + ("_Armed" if armed else "")
	if anim.current_animation != n:
		anim.play(n, 0.2)
	anim.speed_scale = clampf(speed / WALK_SPEED, 0.7, 2.0) if moving else 1.0


func _on_finished(anim_name: StringName) -> void:
	if anim_name == action:
		action = ""
		if anim_name == &"MaskOn":
			rig.mask_on = true
		action_done.emit(String(anim_name))


## Where MaskOn leaves the mask relative to the head, so it can stay there
## while other animations (which keep it at the hip) play.
func _mask_offset() -> Transform3D:
	anim.play("MaskOn")
	anim.seek(anim.get_animation("MaskOn").length, true)
	skeleton.force_update_all_bone_transforms()
	var head := skeleton.get_bone_global_pose(skeleton.find_bone("Head"))
	var mask := skeleton.get_bone_global_pose(skeleton.find_bone("Mask"))
	anim.stop()
	return head.affine_inverse() * mask
