class_name ArmRig
extends SkeletonModifier3D
## Runs after the animation each frame. Puts the body into the blow (the hips
## and spine turn and lean with the swing, the legs take a fighting stance),
## blends the weapon arm from its animated pose to one aimed along the
## fighter's weapon pivot (so every cut, guard and thrust reads), keeps the
## held weapon in that hand, lets the flail's head swing on its chain, and
## keeps the mask on the face once it's worn.

## The fighter's weapon pivot: the arm points down its -Z.
var pivot: Node3D
## 0 = the animated arm, 1 = aimed along the pivot.
var aim := 0.0
## Elbow bend for thrusts: 0 straight, 1 cocked back.
var bend := 0.0
## Flail head: 0 hangs from the haft, 1 flung out along it.
var spin := 0.0
## How far the torso turns (radians, + to the left), spread up the spine.
var twist := 0.0
## How far the torso leans (radians, + forward).
var lean := 0.0
## 0 = the animated legs, 1 = a planted fighting stance (left foot forward,
## knees bent, hips dropped).
var stance := 0.0
var weapon_bone := -1
var chain_bone := -1
var mask_on := false
var mask_offset := Transform3D.IDENTITY

## Share of the twist taken by each bone, weakest at the pelvis.
const TWIST_SHARE := {"Hips": 0.15, "Spine": 0.25, "Spine1": 0.3, "Spine2": 0.3}
const LEAN_SHARE := {"Spine": 0.3, "Spine1": 0.35, "Spine2": 0.35}
## Stance: thigh swing and knee bend (radians) for the front and back legs.
const STANCE := {"LeftUpLeg": -0.5, "LeftLeg": 0.6, "RightUpLeg": 0.35, "RightLeg": 0.25}
const HIP_DROP := 0.065

var _arm := -1
var _fore := -1
var _hand := -1
var _head := -1
var _mask := -1
var _hips := -1
var _twist_bones := {}
var _lean_bones := {}
var _stance_bones := {}
var _chain_dir := Vector3.DOWN


func setup(sk: Skeleton3D) -> void:
	_arm = sk.find_bone("RightArm")
	_fore = sk.find_bone("RightForeArm")
	_hand = sk.find_bone("RightHand")
	_head = sk.find_bone("Head")
	_mask = sk.find_bone("Mask")
	_hips = sk.find_bone("Hips")
	for n in TWIST_SHARE:
		_twist_bones[sk.find_bone(n)] = TWIST_SHARE[n]
	for n in LEAN_SHARE:
		_lean_bones[sk.find_bone(n)] = LEAN_SHARE[n]
	for n in STANCE:
		_stance_bones[sk.find_bone(n)] = STANCE[n]


func _process_modification_with_delta(delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or _arm < 0:
		return
	# Where the animation holds the weapon, relative to the hand (read before
	# anything moves; the relation survives the body turning).
	var grip := Transform3D.IDENTITY
	if weapon_bone >= 0:
		grip = sk.get_bone_global_pose(_hand).affine_inverse() * sk.get_bone_global_pose(weapon_bone)
	_pose_body(sk)
	if mask_on:
		_set_global(sk, _mask, _global(sk, _head) * mask_offset)
	if weapon_bone < 0:
		return
	if aim > 0.001 and pivot:
		var b := (sk.global_transform.affine_inverse() * pivot.global_transform).basis.get_rotation_quaternion()
		var fore := Quaternion(Vector3.RIGHT, -bend * 1.5)
		# The hand, seen from the shoulder; turn the whole arm so it points down the pivot.
		var h := sk.get_bone_rest(_fore).origin + fore * sk.get_bone_rest(_hand).origin
		var arm_g := b * Quaternion(h.normalized(), Vector3.FORWARD)
		var parent_g := _global(sk, sk.get_bone_parent(_arm)).basis.get_rotation_quaternion()
		sk.set_bone_pose_rotation(_arm, sk.get_bone_pose_rotation(_arm).slerp(parent_g.inverse() * arm_g, aim))
		sk.set_bone_pose_rotation(_fore, sk.get_bone_pose_rotation(_fore).slerp(fore, aim))
		sk.set_bone_pose_rotation(_hand, sk.get_bone_pose_rotation(_hand).slerp(Quaternion.IDENTITY, aim))
		# Aimed, the weapon carries on the arm's line: its -Y (the head) down the pivot's -Z.
		var hand_g := arm_g * fore
		var aimed := Transform3D(Basis(hand_g.inverse() * b * Quaternion(Vector3.RIGHT, PI / 2.0)), grip.origin)
		grip = grip.interpolate_with(aimed, aim)
	var weapon_g := _global(sk, _hand) * grip
	_set_global(sk, weapon_bone, weapon_g)
	if chain_bone >= 0:
		_swing_chain(sk, weapon_g, delta)


## Layers the swing onto the animated body, each turn applied in the bone's
## parent space so it stacks on whatever the animation is doing.
func _pose_body(sk: Skeleton3D) -> void:
	if absf(twist) < 0.001 and absf(lean) < 0.001 and stance < 0.001:
		return
	for b in _twist_bones:
		var q := Quaternion(Vector3.UP, twist * _twist_bones[b])
		if _lean_bones.has(b):
			q = q * Quaternion(Vector3.RIGHT, lean * _lean_bones[b])
		sk.set_bone_pose_rotation(b, q * sk.get_bone_pose_rotation(b))
	for b in _stance_bones:
		sk.set_bone_pose_rotation(b, Quaternion(Vector3.RIGHT, stance * _stance_bones[b]) * sk.get_bone_pose_rotation(b))
	sk.set_bone_pose_position(_hips, sk.get_bone_pose_position(_hips) + Vector3(0, -HIP_DROP * stance, 0))


static func _local(sk: Skeleton3D, bone: int) -> Transform3D:
	return Transform3D(Basis(sk.get_bone_pose_rotation(bone)), sk.get_bone_pose_position(bone))


## The skeleton's global poses aren't refreshed mid-modification, so walk the
## chain to the root by hand from the poses as they stand now.
static func _global(sk: Skeleton3D, bone: int) -> Transform3D:
	var t := _local(sk, bone)
	var p := sk.get_bone_parent(bone)
	while p >= 0:
		t = _local(sk, p) * t
		p = sk.get_bone_parent(p)
	return t


static func _set_global(sk: Skeleton3D, bone: int, g: Transform3D) -> void:
	var p := sk.get_bone_parent(bone)
	var local := _global(sk, p).affine_inverse() * g if p >= 0 else g
	sk.set_bone_pose_position(bone, local.origin)
	sk.set_bone_pose_rotation(bone, local.basis.get_rotation_quaternion())


## The flail's head hangs under its own weight and is flung out along the haft
## while swinging, lagging a little behind.
func _swing_chain(sk: Skeleton3D, weapon_g: Transform3D, delta: float) -> void:
	var down := (sk.global_transform.basis.inverse() * Vector3.DOWN).normalized()
	var haft := (weapon_g.basis * Vector3.DOWN).normalized()
	var want := down.lerp(haft, spin).normalized()
	_chain_dir = _chain_dir.slerp(want, 1.0 - exp(-10.0 * delta)).normalized()
	var local := (weapon_g.basis.inverse() * _chain_dir).normalized()
	if local.dot(Vector3.DOWN) > -0.98:
		sk.set_bone_pose_rotation(chain_bone, Quaternion(Vector3.DOWN, local))
