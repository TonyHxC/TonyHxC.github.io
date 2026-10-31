class_name ArmRig
extends SkeletonModifier3D
## Runs after the animation each frame. Blends the weapon arm from its animated
## pose to one aimed along the fighter's weapon pivot (so every cut, guard and
## thrust reads), keeps the held weapon in that hand, lets the flail's head
## swing on its chain, and keeps the mask on the face once it's worn.

## The fighter's weapon pivot: the arm points down its -Z.
var pivot: Node3D
## 0 = the animated arm, 1 = aimed along the pivot.
var aim := 0.0
## Elbow bend for thrusts: 0 straight, 1 cocked back.
var bend := 0.0
## Flail head: 0 hangs from the haft, 1 flung out along it.
var spin := 0.0
var weapon_bone := -1
var chain_bone := -1
var mask_on := false
var mask_offset := Transform3D.IDENTITY

var _arm := -1
var _fore := -1
var _hand := -1
var _head := -1
var _mask := -1
var _chain_dir := Vector3.DOWN


func setup(sk: Skeleton3D) -> void:
	_arm = sk.find_bone("RightArm")
	_fore = sk.find_bone("RightForeArm")
	_hand = sk.find_bone("RightHand")
	_head = sk.find_bone("Head")
	_mask = sk.find_bone("Mask")


func _process_modification_with_delta(delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or _arm < 0:
		return
	if mask_on:
		sk.set_bone_global_pose(_mask, sk.get_bone_global_pose(_head) * mask_offset)
	if weapon_bone < 0:
		return
	# Where the animation holds the weapon, relative to the hand.
	var grip := sk.get_bone_global_pose(_hand).affine_inverse() * sk.get_bone_global_pose(weapon_bone)
	var hand_now := sk.get_bone_global_pose(_hand)
	if aim > 0.001 and pivot:
		var b := (sk.global_transform.affine_inverse() * pivot.global_transform).basis.get_rotation_quaternion()
		var fore := Quaternion(Vector3.RIGHT, -bend * 1.5)
		# The hand, seen from the shoulder; turn the whole arm so it points down the pivot.
		var h := sk.get_bone_rest(_fore).origin + fore * sk.get_bone_rest(_hand).origin
		var arm_g := b * Quaternion(h.normalized(), Vector3.FORWARD)
		var shoulder := sk.get_bone_global_pose(sk.get_bone_parent(_arm))
		var parent_g := shoulder.basis.get_rotation_quaternion()
		sk.set_bone_pose_rotation(_arm, sk.get_bone_pose_rotation(_arm).slerp(parent_g.inverse() * arm_g, aim))
		sk.set_bone_pose_rotation(_fore, sk.get_bone_pose_rotation(_fore).slerp(fore, aim))
		sk.set_bone_pose_rotation(_hand, sk.get_bone_pose_rotation(_hand).slerp(Quaternion.IDENTITY, aim))
		# The skeleton's global poses aren't refreshed mid-modification, so walk
		# the chain from the shoulder by hand.
		hand_now = shoulder * _local(sk, _arm) * _local(sk, _fore) * _local(sk, _hand)
		# Aimed, the weapon carries on the arm's line: its -Y (the head) down the pivot's -Z.
		var hand_g := arm_g * fore
		var aimed := Transform3D(Basis(hand_g.inverse() * b * Quaternion(Vector3.RIGHT, PI / 2.0)), grip.origin)
		grip = grip.interpolate_with(aimed, aim)
	var weapon_g := hand_now * grip
	sk.set_bone_global_pose(weapon_bone, weapon_g)
	if chain_bone >= 0:
		_swing_chain(sk, weapon_g, delta)


static func _local(sk: Skeleton3D, bone: int) -> Transform3D:
	return Transform3D(Basis(sk.get_bone_pose_rotation(bone)), sk.get_bone_pose_position(bone))


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
