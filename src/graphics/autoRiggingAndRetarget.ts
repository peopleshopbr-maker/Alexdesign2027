import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  AnimationActionCycle,
  AnimationSettings,
  AutoRigPreset,
  HumanoidJointMarkerId,
  PoseLibraryPresetId,
  RigExportProfile,
} from '../types/graphics';

export type HumanoidBoneRole =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'leftShoulder'
  | 'leftUpperArm'
  | 'leftForeArm'
  | 'leftHand'
  | 'rightShoulder'
  | 'rightUpperArm'
  | 'rightForeArm'
  | 'rightHand'
  | 'leftThigh'
  | 'leftShin'
  | 'leftFoot'
  | 'rightThigh'
  | 'rightShin'
  | 'rightFoot';

export type CustomJointMarkers = Record<HumanoidJointMarkerId, THREE.Vector3>;

export interface BoneRestEntry {
  bone: THREE.Bone;
  restLocalPos: THREE.Vector3;
  restLocalQuat: THREE.Quaternion;
  restWorldPos: THREE.Vector3;
  restParentWorldQuat: THREE.Quaternion;
  restParentWorldQuatInv: THREE.Quaternion;
}

export interface SkeletonRigMap {
  bones: BoneRestEntry[];
  roles: Partial<Record<HumanoidBoneRole, BoneRestEntry>>;
  spineChain: BoneRestEntry[];
  tPoseArmDropRad: number;
  leftForeArmBendAxis: THREE.Vector3;
  rightForeArmBendAxis: THREE.Vector3;
  boneCount: number;
}

export interface AutoRigOutput {
  riggedRoot: THREE.Group;
  skeleton: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  boneCount: number;
  disposables: Array<{ dispose: () => void }>;
}

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vP = new THREE.Vector3();
const _vAB = new THREE.Vector3();
const _vAP = new THREE.Vector3();
const _forwardZ = new THREE.Vector3(0, 0, 1);
const _qWorldDelta = new THREE.Quaternion();
const _qTmp = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler(0, 0, 0, 'YXZ');
const _boxTmp = new THREE.Box3();
const _rootInvMat = new THREE.Matrix4();
const _meshRelMat = new THREE.Matrix4();

const _ikA = new THREE.Vector3();
const _ikB = new THREE.Vector3();
const _ikC = new THREE.Vector3();
const _ikT = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikTargetDir = new THREE.Vector3();
const _ikBendNormal = new THREE.Vector3();
const _ikPole = new THREE.Vector3();
const _ikParentQuat = new THREE.Quaternion();
const _ikWorldQuat = new THREE.Quaternion();
const _ikRotQuat = new THREE.Quaternion();

const PROFILE_BONE_NAMES: Record<RigExportProfile, Record<HumanoidBoneRole, string>> = {
  standard: {
    hips: 'Pelvis',
    spine: 'Spine',
    chest: 'Chest',
    neck: 'Neck',
    head: 'Head',
    leftShoulder: 'Shoulder_L',
    leftUpperArm: 'UpperArm_L',
    leftForeArm: 'ForeArm_L',
    leftHand: 'Hand_L',
    rightShoulder: 'Shoulder_R',
    rightUpperArm: 'UpperArm_R',
    rightForeArm: 'ForeArm_R',
    rightHand: 'Hand_R',
    leftThigh: 'Thigh_L',
    leftShin: 'Shin_L',
    leftFoot: 'Foot_L',
    rightThigh: 'Thigh_R',
    rightShin: 'Shin_R',
    rightFoot: 'Foot_R',
  },
  mixamo: {
    hips: 'mixamorig:Hips',
    spine: 'mixamorig:Spine',
    chest: 'mixamorig:Spine2',
    neck: 'mixamorig:Neck',
    head: 'mixamorig:Head',
    leftShoulder: 'mixamorig:LeftShoulder',
    leftUpperArm: 'mixamorig:LeftArm',
    leftForeArm: 'mixamorig:LeftForeArm',
    leftHand: 'mixamorig:LeftHand',
    rightShoulder: 'mixamorig:RightShoulder',
    rightUpperArm: 'mixamorig:RightArm',
    rightForeArm: 'mixamorig:RightForeArm',
    rightHand: 'mixamorig:RightHand',
    leftThigh: 'mixamorig:LeftUpLeg',
    leftShin: 'mixamorig:LeftLeg',
    leftFoot: 'mixamorig:LeftFoot',
    rightThigh: 'mixamorig:RightUpLeg',
    rightShin: 'mixamorig:RightLeg',
    rightFoot: 'mixamorig:RightFoot',
  },
  ue5: {
    hips: 'pelvis',
    spine: 'spine_01',
    chest: 'spine_03',
    neck: 'neck_01',
    head: 'head',
    leftShoulder: 'clavicle_l',
    leftUpperArm: 'upperarm_l',
    leftForeArm: 'lowerarm_l',
    leftHand: 'hand_l',
    rightShoulder: 'clavicle_r',
    rightUpperArm: 'upperarm_r',
    rightForeArm: 'lowerarm_r',
    rightHand: 'hand_r',
    leftThigh: 'thigh_l',
    leftShin: 'calf_l',
    leftFoot: 'foot_l',
    rightThigh: 'thigh_r',
    rightShin: 'calf_r',
    rightFoot: 'foot_r',
  },
  unity: {
    hips: 'Hips',
    spine: 'Spine',
    chest: 'Chest',
    neck: 'Neck',
    head: 'Head',
    leftShoulder: 'LeftShoulder',
    leftUpperArm: 'LeftUpperArm',
    leftForeArm: 'LeftLowerArm',
    leftHand: 'LeftHand',
    rightShoulder: 'RightShoulder',
    rightUpperArm: 'RightUpperArm',
    rightForeArm: 'RightLowerArm',
    rightHand: 'RightHand',
    leftThigh: 'LeftUpperLeg',
    leftShin: 'LeftLowerLeg',
    leftFoot: 'LeftFoot',
    rightThigh: 'RightUpperLeg',
    rightShin: 'RightLowerLeg',
    rightFoot: 'RightFoot',
  },
  godot: {
    hips: 'Hips',
    spine: 'Spine',
    chest: 'UpperChest',
    neck: 'Neck',
    head: 'Head',
    leftShoulder: 'LeftShoulder',
    leftUpperArm: 'LeftUpperArm',
    leftForeArm: 'LeftLowerArm',
    leftHand: 'LeftHand',
    rightShoulder: 'RightShoulder',
    rightUpperArm: 'RightUpperArm',
    rightForeArm: 'RightLowerArm',
    rightHand: 'RightHand',
    leftThigh: 'LeftUpperLeg',
    leftShin: 'LeftLowerLeg',
    leftFoot: 'LeftFoot',
    rightThigh: 'RightUpperLeg',
    rightShin: 'RightLowerLeg',
    rightFoot: 'RightFoot',
  },
};

export function applyRigProfileNaming(rigMap: SkeletonRigMap, profile: RigExportProfile): void {
  const map = PROFILE_BONE_NAMES[profile];
  for (const [role, entry] of Object.entries(rigMap.roles) as Array<[HumanoidBoneRole, BoneRestEntry | undefined]>) {
    if (entry && map[role]) {
      entry.bone.name = map[role];
    }
  }
}

function pointToSegmentDistSq(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3
): number {
  _vAB.subVectors(b, a);
  _vAP.subVectors(p, a);
  const abLenSq = _vAB.lengthSq();
  if (abLenSq < 1e-8) {
    return _vAP.lengthSq();
  }
  const t = THREE.MathUtils.clamp(_vAP.dot(_vAB) / abLenSq, 0, 1);
  _vP.copy(a).addScaledVector(_vAB, t);
  return _vP.distanceToSquared(p);
}

function detectSide(name: string, worldX: number, centerX: number): 'left' | 'right' | 'center' {
  const n = name.toLowerCase();
  if (
    /(^|[._\-\s:])(left|l)([._\-\s\d]|$)|mixamorig:?left|left(arm|hand|leg|foot|thigh|shin|shoulder|forearm|upleg|lowerarm|upperarm|lowerleg|upperleg)/.test(
      n
    )
  ) {
    return 'left';
  }
  if (
    /(^|[._\-\s:])(right|r)([._\-\s\d]|$)|mixamorig:?right|right(arm|hand|leg|foot|thigh|shin|shoulder|forearm|upleg|lowerarm|upperarm|lowerleg|upperleg)/.test(
      n
    )
  ) {
    return 'right';
  }
  const dx = worldX - centerX;
  if (dx > 0.04) return 'left';
  if (dx < -0.04) return 'right';
  return 'center';
}

function computeForeArmBendAxis(
  upperArm: BoneRestEntry | undefined,
  foreArm: BoneRestEntry | undefined
): THREE.Vector3 {
  if (upperArm && foreArm) {
    _vA.subVectors(foreArm.restWorldPos, upperArm.restWorldPos);
    if (_vA.lengthSq() > 1e-4) {
      _vA.normalize();
      const axis = new THREE.Vector3().crossVectors(_vA, _forwardZ);
      if (axis.lengthSq() > 1e-4) {
        return axis.normalize();
      }
    }
  }
  return new THREE.Vector3(-1, 0, 0);
}

export function captureSkeletonMap(root: THREE.Object3D): SkeletonRigMap {
  root.updateMatrixWorld(true);
  const allBones: THREE.Bone[] = [];
  const seen = new Set<THREE.Bone>();
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) {
      const b = obj as THREE.Bone;
      if (!seen.has(b)) {
        seen.add(b);
        allBones.push(b);
      }
    }
  });

  _boxTmp.setFromObject(root);
  const centerX = Number.isFinite(_boxTmp.min.x) ? (_boxTmp.min.x + _boxTmp.max.x) * 0.5 : 0;

  const entries: BoneRestEntry[] = allBones.map((bone) => {
    const restWorldPos = new THREE.Vector3();
    bone.getWorldPosition(restWorldPos);
    const restParentWorldQuat = new THREE.Quaternion();
    if (bone.parent) {
      bone.parent.getWorldQuaternion(restParentWorldQuat);
    }
    return {
      bone,
      restLocalPos: bone.position.clone(),
      restLocalQuat: bone.quaternion.clone(),
      restWorldPos,
      restParentWorldQuat,
      restParentWorldQuatInv: restParentWorldQuat.clone().invert(),
    };
  });

  const roles: Partial<Record<HumanoidBoneRole, BoneRestEntry>> = {};
  const assign = (role: HumanoidBoneRole, entry: BoneRestEntry) => {
    if (!roles[role]) {
      roles[role] = entry;
    }
  };

  for (const entry of entries) {
    const n = entry.bone.name.toLowerCase();
    const side = detectSide(entry.bone.name, entry.restWorldPos.x, centerX);

    if (/pelvis|hips|mixamorig:?hips|\bhip\b/.test(n) && !/thigh|upleg/.test(n)) {
      assign('hips', entry);
    } else if (/^spine(_?0?1)?$|mixamorig:?spine$|spine1|\btorso\b/.test(n)) {
      assign('spine', entry);
    } else if (/chest|upper_?chest|spine_?0?[23]|mixamorig:?spine2|ribcage/.test(n)) {
      assign('chest', entry);
    } else if (/neck|cervical/.test(n)) {
      assign('neck', entry);
    } else if (/head|cranium|skull/.test(n) && !/top|end/.test(n)) {
      assign('head', entry);
    } else if (side === 'left') {
      if (/clavicle|collar|shoulder/.test(n) && !/upper|arm/.test(n)) assign('leftShoulder', entry);
      else if (/fore_?arm|lower_?arm|elbow|radius/.test(n)) assign('leftForeArm', entry);
      else if (/upper_?arm|arm|bicep|humerus|shoulder/.test(n)) assign('leftUpperArm', entry);
      else if (/hand|wrist|palm/.test(n)) assign('leftHand', entry);
      else if (/thigh|upper_?leg|upleg|femur/.test(n)) assign('leftThigh', entry);
      else if (/shin|calf|lower_?leg|knee|tibia|(\bleg|leftleg|l_leg)/.test(n)) assign('leftShin', entry);
      else if (/foot|ankle|heel/.test(n)) assign('leftFoot', entry);
    } else if (side === 'right') {
      if (/clavicle|collar|shoulder/.test(n) && !/upper|arm/.test(n)) assign('rightShoulder', entry);
      else if (/fore_?arm|lower_?arm|elbow|radius/.test(n)) assign('rightForeArm', entry);
      else if (/upper_?arm|arm|bicep|humerus|shoulder/.test(n)) assign('rightUpperArm', entry);
      else if (/hand|wrist|palm/.test(n)) assign('rightHand', entry);
      else if (/thigh|upper_?leg|upleg|femur/.test(n)) assign('rightThigh', entry);
      else if (/shin|calf|lower_?leg|knee|tibia|(\bleg|rightleg|r_leg)/.test(n)) assign('rightShin', entry);
      else if (/foot|ankle|heel/.test(n)) assign('rightFoot', entry);
    }
  }

  if (!roles.leftUpperArm && roles.leftShoulder) roles.leftUpperArm = roles.leftShoulder;
  if (!roles.rightUpperArm && roles.rightShoulder) roles.rightUpperArm = roles.rightShoulder;

  const spineChain = entries.filter((e) => /spine|torso|chest|root_spine/i.test(e.bone.name));

  let tPoseArmDropRad = 0;
  const upperArm = roles.leftUpperArm ?? roles.rightUpperArm;
  const foreArm = roles.leftForeArm ?? roles.rightForeArm;
  if (upperArm && foreArm) {
    _vA.subVectors(foreArm.restWorldPos, upperArm.restWorldPos);
    const len = _vA.length();
    if (len > 0.02) {
      _vA.divideScalar(len);
      const cosDown = THREE.MathUtils.clamp(-_vA.y, -1, 1);
      const angleFromDown = Math.acos(cosDown);
      if (angleFromDown > 0.45) {
        tPoseArmDropRad = Math.min(1.18, angleFromDown - 0.25);
      }
    }
  }

  const leftForeArmBendAxis = computeForeArmBendAxis(roles.leftUpperArm, roles.leftForeArm);
  const rightForeArmBendAxis = computeForeArmBendAxis(roles.rightUpperArm, roles.rightForeArm);

  return {
    bones: entries,
    roles,
    spineChain,
    tPoseArmDropRad,
    leftForeArmBendAxis,
    rightForeArmBendAxis,
    boneCount: entries.length,
  };
}

export function resetSkeletonToRestPose(rigMap: SkeletonRigMap): void {
  for (const entry of rigMap.bones) {
    entry.bone.position.copy(entry.restLocalPos);
    entry.bone.quaternion.copy(entry.restLocalQuat);
  }
}

function rotateBoneInWorldAxes(
  entry: BoneRestEntry | undefined,
  rx: number,
  ry: number,
  rz: number,
  slerpAlpha: number,
  overrideDeg?: [number, number, number]
): void {
  if (!entry) return;
  _eulerTmp.set(rx, ry, rz, 'YXZ');
  _qWorldDelta.setFromEuler(_eulerTmp);
  _qTmp.multiplyQuaternions(entry.restParentWorldQuatInv, _qWorldDelta);
  _qTarget.multiplyQuaternions(_qTmp, entry.restParentWorldQuat);
  _qTarget.multiply(entry.restLocalQuat);

  if (overrideDeg) {
    const ox = THREE.MathUtils.degToRad(overrideDeg[0]);
    const oy = THREE.MathUtils.degToRad(overrideDeg[1]);
    const oz = THREE.MathUtils.degToRad(overrideDeg[2]);
    if (Math.abs(ox) > 1e-4 || Math.abs(oy) > 1e-4 || Math.abs(oz) > 1e-4) {
      _eulerTmp.set(ox, oy, oz, 'XYZ');
      _qTmp.setFromEuler(_eulerTmp);
      _qTarget.multiply(_qTmp);
    }
  }

  if (slerpAlpha < 0.999) {
    entry.bone.quaternion.slerp(_qTarget, slerpAlpha);
  } else {
    entry.bone.quaternion.copy(_qTarget);
  }
}

function rotateBoneAroundWorldAxis(
  entry: BoneRestEntry | undefined,
  worldAxis: THREE.Vector3,
  angleRad: number,
  slerpAlpha: number,
  overrideDeg?: [number, number, number]
): void {
  if (!entry) return;
  _qWorldDelta.setFromAxisAngle(worldAxis, angleRad);
  _qTmp.multiplyQuaternions(entry.restParentWorldQuatInv, _qWorldDelta);
  _qTarget.multiplyQuaternions(_qTmp, entry.restParentWorldQuat);
  _qTarget.multiply(entry.restLocalQuat);

  if (overrideDeg) {
    const ox = THREE.MathUtils.degToRad(overrideDeg[0]);
    const oy = THREE.MathUtils.degToRad(overrideDeg[1]);
    const oz = THREE.MathUtils.degToRad(overrideDeg[2]);
    if (Math.abs(ox) > 1e-4 || Math.abs(oy) > 1e-4 || Math.abs(oz) > 1e-4) {
      _eulerTmp.set(ox, oy, oz, 'XYZ');
      _qTmp.setFromEuler(_eulerTmp);
      _qTarget.multiply(_qTmp);
    }
  }

  if (slerpAlpha < 0.999) {
    entry.bone.quaternion.slerp(_qTarget, slerpAlpha);
  } else {
    entry.bone.quaternion.copy(_qTarget);
  }
}

/**
 * Analytical 2-Bone IK Solver (ActionForge Live IK style)
 * Rotates upperBone & midBone in world space so endBone reaches targetWorldPos
 * while keeping the middle joint aligned along poleWorldDir.
 */
export function solveTwoBoneIK(
  upperEntry: BoneRestEntry | undefined,
  midEntry: BoneRestEntry | undefined,
  endEntry: BoneRestEntry | undefined,
  targetWorldPos: THREE.Vector3,
  poleWorldDir: THREE.Vector3
): void {
  if (!upperEntry || !midEntry || !endEntry) return;

  const upper = upperEntry.bone;
  const mid = midEntry.bone;
  const end = endEntry.bone;

  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_ikA);
  mid.getWorldPosition(_ikB);
  end.getWorldPosition(_ikC);

  const l1 = Math.max(0.05, _ikA.distanceTo(_ikB));
  const l2 = Math.max(0.05, _ikB.distanceTo(_ikC));

  _ikT.subVectors(targetWorldPos, _ikA);
  const rawDist = _ikT.length();
  if (rawDist < 1e-4) return;

  const maxReach = (l1 + l2) * 0.995;
  const minReach = Math.abs(l1 - l2) + 0.02;
  const dist = THREE.MathUtils.clamp(rawDist, minReach, maxReach);
  _ikTargetDir.copy(_ikT).divideScalar(rawDist);

  // Law of cosines for upper bone interior angle alpha & elbow exterior angle beta
  const cosAlpha = THREE.MathUtils.clamp(
    (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist),
    -1,
    1
  );
  const alpha = Math.acos(cosAlpha);

  // Build bend plane perpendicular to targetDir & poleWorldDir
  _ikPole.copy(poleWorldDir);
  if (_ikPole.lengthSq() < 1e-4) _ikPole.set(0, 0, 1);
  _ikPole.normalize();

  _ikBendNormal.crossVectors(_ikTargetDir, _ikPole);
  if (_ikBendNormal.lengthSq() < 1e-4) {
    _ikBendNormal.crossVectors(_ikTargetDir, new THREE.Vector3(0, 1, 0));
  }
  _ikBendNormal.normalize();

  // Desired direction from upper -> mid
  const desiredUpperDir = _ikDir
    .copy(_ikTargetDir)
    .applyAxisAngle(_ikBendNormal, alpha)
    .normalize();

  // Rotate upper bone from current (B - A) to desiredUpperDir
  const curUpperDir = _vA.subVectors(_ikB, _ikA).normalize();
  if (curUpperDir.lengthSq() > 1e-4) {
    _ikRotQuat.setFromUnitVectors(curUpperDir, desiredUpperDir);
    upper.getWorldQuaternion(_ikWorldQuat);
    _ikWorldQuat.premultiply(_ikRotQuat);
    if (upper.parent) {
      upper.parent.getWorldQuaternion(_ikParentQuat);
      upper.quaternion.copy(_ikParentQuat.invert().multiply(_ikWorldQuat));
    }
  }

  // Re-evaluate mid & end world positions, then rotate mid bone so (C - B) aims at target
  upper.updateMatrixWorld(true);
  mid.getWorldPosition(_ikB);
  end.getWorldPosition(_ikC);

  const curMidDir = _vA.subVectors(_ikC, _ikB).normalize();
  const desiredMidDir = _vB.subVectors(targetWorldPos, _ikB).normalize();
  if (curMidDir.lengthSq() > 1e-4 && desiredMidDir.lengthSq() > 1e-4) {
    _ikRotQuat.setFromUnitVectors(curMidDir, desiredMidDir);
    mid.getWorldQuaternion(_ikWorldQuat);
    _ikWorldQuat.premultiply(_ikRotQuat);
    if (mid.parent) {
      mid.parent.getWorldQuaternion(_ikParentQuat);
      mid.quaternion.copy(_ikParentQuat.invert().multiply(_ikWorldQuat));
    }
  }
}

interface ActionPoseParams {
  rootLiftY: number;
  rootOffsetX: number;
  torsoRotX: number;
  torsoRotY: number;
  chestRotX: number;
  chestRotY: number;
  lHipX: number;
  rHipX: number;
  lKneeX: number;
  rKneeX: number;
  lFootX: number;
  rFootX: number;
  lShoX: number;
  rShoX: number;
  lShoZ: number;
  rShoZ: number;
  lElbBend: number;
  rElbBend: number;
  stretchY: number;
}

function evaluateActionParams(
  action: AnimationActionCycle,
  angle: number,
  drop: number,
  amp: number
): ActionPoseParams {
  const out: ActionPoseParams = {
    rootLiftY: 0,
    rootOffsetX: 0,
    torsoRotX: 0,
    torsoRotY: 0,
    chestRotX: 0,
    chestRotY: 0,
    lHipX: 0,
    rHipX: 0,
    lKneeX: 0,
    rKneeX: 0,
    lFootX: 0,
    rFootX: 0,
    lShoX: 0,
    rShoX: 0,
    lShoZ: -drop,
    rShoZ: drop,
    lElbBend: 0.22,
    rElbBend: 0.22,
    stretchY: 1,
  };

  if (action === 'idle') {
    const s = Math.sin(angle * 0.5);
    const c = Math.cos(angle * 0.5);
    out.rootLiftY = Math.abs(c) * 0.015 * amp;
    out.torsoRotX = s * 0.03 * amp;
    out.chestRotX = s * 0.04 * amp;
    out.lHipX = s * 0.015 * amp;
    out.rHipX = -s * 0.015 * amp;
    out.lKneeX = Math.max(0, c * 0.02 * amp);
    out.rKneeX = Math.max(0, -c * 0.02 * amp);
    out.lShoX = s * 0.04 * amp;
    out.rShoX = -s * 0.04 * amp;
    out.lElbBend = 0.22 + Math.max(0, s) * 0.1;
    out.rElbBend = 0.22 + Math.max(0, -s) * 0.1;
    out.stretchY = 1;
  } else if (action === 'walk') {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    out.rootLiftY = Math.abs(c) * 0.03 * amp;
    out.lHipX = -s * 0.44 * amp;
    out.rHipX = s * 0.44 * amp;
    out.lKneeX = Math.max(0, c * 0.52 * amp);
    out.rKneeX = Math.max(0, -c * 0.52 * amp);
    out.lFootX = -out.lHipX * 0.22 - out.lKneeX * 0.15;
    out.rFootX = -out.rHipX * 0.22 - out.rKneeX * 0.15;
    out.lShoX = -Math.sin(angle) * 0.38 * amp;
    out.rShoX = Math.sin(angle) * 0.38 * amp;
    out.lElbBend = 0.22 + Math.max(0, Math.sin(angle)) * 0.24;
    out.rElbBend = 0.22 + Math.max(0, -Math.sin(angle)) * 0.24;
    out.torsoRotY = s * 0.06;
    out.chestRotY = -s * 0.03;
    out.stretchY = 1;
  } else if (action === 'run') {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    out.rootLiftY = Math.abs(c) * 0.14 * amp;
    out.torsoRotX += 0.24;
    out.lHipX = -s * 0.88 * amp;
    out.rHipX = s * 0.88 * amp;
    out.lKneeX = Math.max(0.1, c * 1.15 * amp);
    out.rKneeX = Math.max(0.1, -c * 1.15 * amp);
    out.lFootX = -out.lHipX * 0.3;
    out.rFootX = -out.rHipX * 0.3;
    out.lShoX = -Math.sin(angle) * 0.92 * amp;
    out.rShoX = Math.sin(angle) * 0.92 * amp;
    out.lElbBend = 1.25;
    out.rElbBend = 1.25;
    out.torsoRotY = s * 0.24;
    out.stretchY = 1;
  } else if (action === 'jump') {
    const jumpArc = Math.max(0, Math.sin(angle));
    const dip = Math.min(0, Math.sin(angle)) * 0.35;
    out.rootLiftY = jumpArc * 0.62 * amp + dip * 0.12;
    out.torsoRotX += dip * 0.45 - jumpArc * 0.16;
    out.lHipX = -jumpArc * 0.55 - dip * 0.45;
    out.rHipX = -jumpArc * 0.55 - dip * 0.45;
    out.lKneeX = jumpArc * 0.95 - dip * 0.75;
    out.rKneeX = jumpArc * 0.95 - dip * 0.75;
    out.lFootX = jumpArc * 0.35;
    out.rFootX = jumpArc * 0.35;
    out.lShoX = -jumpArc * 1.9 + dip * 0.55;
    out.rShoX = -jumpArc * 1.9 + dip * 0.55;
    out.lShoZ = -drop * (1 - jumpArc * 0.45);
    out.rShoZ = drop * (1 - jumpArc * 0.45);
    out.lElbBend = 0.45;
    out.rElbBend = 0.45;
    out.stretchY = 1;
  } else if (action === 'slash') {
    const swing = Math.sin(angle);
    const strike = Math.max(0, swing);
    out.torsoRotY = -0.55 + strike * 1.25 * amp;
    out.torsoRotX += 0.12 + strike * 0.18;
    out.rShoX = -1.75 + strike * 2.15 * amp;
    out.rShoZ = drop - 0.55 + strike * 0.9;
    out.rElbBend = 0.45 + (1 - strike) * 0.4;
    out.lShoX = -0.55;
    out.lElbBend = 1.15;
    out.lHipX = -0.22;
    out.rHipX = 0.25;
    out.rKneeX = 0.28;
    out.rootLiftY = -strike * 0.04;
  } else if (action === 'hit') {
    const recoil = Math.max(0, Math.sin(angle * 4));
    out.rootLiftY = -recoil * 0.12 * amp;
    out.torsoRotX = recoil * 0.4 * amp;
    out.chestRotX = recoil * 0.6 * amp;
    out.lShoX = recoil * 0.3 * amp;
    out.rShoX = recoil * 0.3 * amp;
    out.lElbBend = 0.5 + recoil * 0.3;
    out.rElbBend = 0.5 + recoil * 0.3;
    out.lHipX = -recoil * 0.1 * amp;
    out.rHipX = recoil * 0.1 * amp;
    out.stretchY = 1 - recoil * 0.1;
  } else if (action === 'death') {
    const progress = Math.min(1, angle / Math.PI);
    out.rootLiftY = -0.9 * progress;
    out.torsoRotX = 0.8 * progress;
    out.chestRotX = 1.0 * progress;
    out.lShoX = 0.5 * progress;
    out.rShoX = 0.5 * progress;
    out.lShoZ = -drop + 0.3 * progress;
    out.rShoZ = drop - 0.3 * progress;
    out.lElbBend = 0.22 + 0.3 * progress;
    out.rElbBend = 0.22 + 0.3 * progress;
    out.lHipX = 0.3 * progress;
    out.rHipX = 0.3 * progress;
    out.lKneeX = 0.3 * progress;
    out.rKneeX = 0.3 * progress;
    out.stretchY = 1 - 0.5 * progress;
  } else if (action === 'block') {
    const s = Math.sin(angle);
    out.rootLiftY = -0.12 + s * 0.02;
    out.torsoRotX = 0.3;
    out.chestRotX = 0.4;
    out.lShoX = 0.8;
    out.rShoX = -0.8;
    out.lShoZ = -drop + 0.6;
    out.rShoZ = drop - 0.6;
    out.lElbBend = 0.5;
    out.rElbBend = 0.5;
    out.lHipX = 0.4;
    out.rHipX = 0.4;
    out.lKneeX = 0.1;
    out.rKneeX = 0.1;
    out.stretchY = 0.95;
  } else if (action === 'fall') {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    out.rootLiftY = 0;
    out.torsoRotX = 0.15 * c;
    out.chestRotX = 0.2 * c;
    out.lShoX = 0.6 * s;
    out.rShoX = -0.6 * s;
    out.lShoZ = -drop + 0.8;
    out.rShoZ = drop - 0.8;
    out.lElbBend = 0.3;
    out.rElbBend = 0.3;
    out.lHipX = 0.3 * s;
    out.rHipX = -0.3 * s;
    out.stretchY = 1;
  } else if (action === 'land') {
    const progress = Math.max(0, Math.sin(angle));
    out.rootLiftY = -0.25 * progress;
    out.torsoRotX = 0.3 * progress;
    out.chestRotX = 0.15 * progress;
    out.lHipX = -0.8 * progress;
    out.rHipX = -0.8 * progress;
    out.lKneeX = 0.8 * progress;
    out.rKneeX = 0.8 * progress;
    out.lFootX = 0.5 * progress;
    out.rFootX = 0.5 * progress;
    out.lElbBend = 0.45;
    out.rElbBend = 0.45;
    out.stretchY = 1;
  } else if (action === 'dash') {
    const progress = angle / (Math.PI * 2);
    out.rootOffsetX = -0.5 * progress * (1 - progress) * 4;
    out.torsoRotX = 0.6 * progress;
    out.chestRotX = 0.7 * progress;
    out.lShoX = -0.8 * progress;
    out.rShoX = -0.8 * progress;
    out.lElbBend = 0.3;
    out.rElbBend = 0.3;
    out.lHipX = 1.2 * progress * (1 - progress) * 4;
    out.rHipX = 1.2 * progress * (1 - progress) * 4;
    out.lKneeX = Math.max(0, 1.2 * progress * (1 - progress) * 4);
    out.rKneeX = Math.max(0, 1.2 * progress * (1 - progress) * 4);
    out.stretchY = 1;
  } else if (action === 'interact') {
    const progress = angle / (Math.PI * 2);
    const s = Math.sin(angle);
    out.torsoRotX = progress < 0.5 ? -0.2 * Math.sin(progress * Math.PI * 2) : -0.2 * Math.sin((1 - (progress - 0.5) * 2) * Math.PI);
    out.torsoRotY = progress < 0.5 ? 0.2 * Math.sin(progress * Math.PI * 2) : 0.2 * Math.sin((1 - (progress - 0.5) * 2) * Math.PI);
    out.rShoX = progress < 0.3 ? -0.3 * Math.sin(progress * Math.PI / 0.3) : (progress < 0.7 ? -0.3 : -0.3 * Math.sin((progress - 0.7) * Math.PI / 0.3));
    out.rShoZ = progress < 0.3 ? drop - 0.8 * Math.sin(progress * Math.PI / 0.3) : (progress < 0.7 ? drop - 0.8 : drop - 0.8 * Math.sin((1 - (progress - 0.7) / 0.3) * Math.PI));
    out.rElbBend = progress < 0.7 ? 0.5 * Math.sin(progress * Math.PI / 0.7) : 0.5 * Math.sin((1 - (progress - 0.7) / 0.3) * Math.PI);
    out.lShoX = -0.1;
    out.lElbBend = 0.8;
    out.lHipX = -0.1;
    out.rHipX = 0.1;
    out.stretchY = 1;
  }

  return out;
}

export function computePatrolBackAndForth(
  phaseRaw: number,
  action: AnimationActionCycle,
  inPlace: boolean,
  exaggeration = 1.0
): {
  offsetZ: number;
  turnRotY: number;
  stepMultiplier: number;
} {
  if (inPlace || (action !== 'walk' && action !== 'run')) {
    return { offsetZ: 0, turnRotY: 0, stepMultiplier: 1 };
  }
  const amp = THREE.MathUtils.clamp(exaggeration, 0.55, 1.8);
  const half = (action === 'run' ? 1.15 : 0.78) * amp;
  const p = ((phaseRaw % 1) + 1) % 1;

  let offsetZ = 0;
  let turnRotY = 0;
  if (p < 0.22) {
    // Centro (0) -> Frente (+half)
    const t = p / 0.22;
    offsetZ = t * half;
    turnRotY = 0;
  } else if (p < 0.27) {
    // Giro suave de 180° na frente
    const t = (p - 0.22) / 0.05;
    const smooth = t * t * (3 - 2 * t);
    offsetZ = half;
    turnRotY = smooth * Math.PI;
  } else if (p < 0.72) {
    // Travessia de volta pelo centro: +half -> -half
    const t = (p - 0.27) / 0.45;
    offsetZ = half - t * (half * 2);
    turnRotY = Math.PI;
  } else if (p < 0.77) {
    // Giro suave de 180° atrás para voltar ao centro
    const t = (p - 0.72) / 0.05;
    const smooth = t * t * (3 - 2 * t);
    offsetZ = -half;
    turnRotY = Math.PI + smooth * Math.PI;
  } else {
    // Retorno ao centro: -half -> 0
    const t = (p - 0.77) / 0.23;
    offsetZ = -half * (1 - t);
    turnRotY = Math.PI * 2;
  }

  return { offsetZ, turnRotY, stepMultiplier: 2 };
}

export function applyProceduralPoseToSkeleton(
  rigMap: SkeletonRigMap,
  root: THREE.Object3D,
  settings: AnimationSettings,
  frameFloat: number,
  baseTransform: { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }
): void {
  const clampedFrame = THREE.MathUtils.clamp(frameFloat, 1, 60);
  const rawPhase =
    settings.cycleMode === 'static'
      ? (clampedFrame - 1) / 59
      : (clampedFrame - 1) / 60;

  const amp = settings.exaggeration;
  const drop = rigMap.tPoseArmDropRad;
  const angle = rawPhase * Math.PI * 2;

  const basePose = evaluateActionParams(settings.action, angle, drop, amp);

  let {
    rootLiftY,
    rootOffsetX,
    torsoRotX,
    torsoRotY,
    chestRotX,
    chestRotY,
    lHipX,
    rHipX,
    lKneeX,
    rKneeX,
    lFootX,
    rFootX,
    lShoX,
    rShoX,
    lShoZ,
    rShoZ,
    lElbBend,
    rElbBend,
    stretchY,
  } = basePose;

  if (settings.inPlace) {
    rootOffsetX = 0;
  }

  const slerpAlpha =
    settings.rotationMode === 'quaternion' && settings.playing ? 0.48 : 1.0;

  const isFree = Boolean(settings.freeEdit || !settings.enabled);
  const cosBaseY = Math.cos(baseTransform.rot.y);
  const sinBaseY = Math.sin(baseTransform.rot.y);
  const worldTravelX = isFree ? 0 : rootOffsetX * cosBaseY;
  const worldTravelZ = isFree ? 0 : -rootOffsetX * sinBaseY;

  root.position.set(
    baseTransform.pos.x + worldTravelX,
    baseTransform.pos.y + (isFree ? 0 : rootLiftY),
    baseTransform.pos.z + worldTravelZ
  );
  root.rotation.set(
    baseTransform.rot.x,
    baseTransform.rot.y,
    baseTransform.rot.z
  );
  root.scale.set(baseTransform.scale.x, baseTransform.scale.y * stretchY, baseTransform.scale.z);

  const f = isFree ? 0 : 1;
  const r = rigMap.roles;
  if (r.hips || r.spine || r.leftThigh || r.rightUpperArm) {
    rotateBoneInWorldAxes(r.hips, torsoRotX * 0.25 * f, torsoRotY * 0.35 * f, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.spine, torsoRotX * 0.5 * f, torsoRotY * 0.45 * f, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.chest, (torsoRotX * 0.3 + chestRotX) * f, (torsoRotY * 0.35 + chestRotY) * f, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.neck, 0, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.head, 0, 0, 0, slerpAlpha);

    rotateBoneInWorldAxes(r.leftThigh, lHipX * f, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.rightThigh, rHipX * f, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.leftShin, lKneeX * f, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.rightShin, rKneeX * f, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.leftFoot, lFootX * f, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.rightFoot, rFootX * f, 0, 0, slerpAlpha);

    rotateBoneInWorldAxes(r.leftUpperArm, lShoX * f, 0, lShoZ, slerpAlpha);
    rotateBoneInWorldAxes(r.rightUpperArm, rShoX * f, 0, rShoZ, slerpAlpha);
    rotateBoneAroundWorldAxis(r.leftForeArm, rigMap.leftForeArmBendAxis, lElbBend, slerpAlpha);
    rotateBoneAroundWorldAxis(r.rightForeArm, rigMap.rightForeArmBendAxis, rElbBend, slerpAlpha);
    rotateBoneInWorldAxes(r.leftHand, 0, 0, 0, slerpAlpha);
    rotateBoneInWorldAxes(r.rightHand, 0, 0, 0, slerpAlpha);
  } else if (rigMap.spineChain.length > 0) {
    const len = rigMap.spineChain.length;
    for (let i = 0; i < len; i++) {
      const weight = (i + 1) / len;
      const swayX = torsoRotX * 0.6 + Math.sin(angle + i * 0.45) * 0.16 * amp;
      const swayY = torsoRotY * 0.7;
      const swayZ = 0;
      rotateBoneInWorldAxes(rigMap.spineChain[i], swayX * weight, swayY * weight, swayZ, slerpAlpha);
    }
  }
}

export function computeDefaultJointMarkers(source: THREE.Object3D): CustomJointMarkers {
  source.updateMatrixWorld(true);
  _boxTmp.setFromObject(source);
  const min = _boxTmp.min.clone();
  const max = _boxTmp.max.clone();
  const size = new THREE.Vector3().subVectors(max, min);
  const safeH = Math.max(0.4, size.y);
  const safeW = Math.max(0.3, size.x);
  const wideArms = safeW > safeH * 0.62;

  const shoulderX = wideArms ? safeW * 0.12 : Math.min(safeW * 0.32, safeH * 0.11);
  const elbowX = wideArms ? safeW * 0.27 : shoulderX + safeH * 0.08;
  const elbowY = wideArms ? safeH * 0.76 : safeH * 0.63;
  const wristX = wideArms ? safeW * 0.43 : elbowX + safeH * 0.05;
  const wristY = wideArms ? safeH * 0.76 : safeH * 0.5;
  const hipX = Math.min(safeW * 0.16, safeH * 0.08);

  return {
    head: new THREE.Vector3(0, safeH * 0.9, 0),
    neck: new THREE.Vector3(0, safeH * 0.82, 0),
    pelvis: new THREE.Vector3(0, safeH * 0.5, 0),
    shoulderL: new THREE.Vector3(shoulderX, safeH * 0.76, 0),
    shoulderR: new THREE.Vector3(-shoulderX, safeH * 0.76, 0),
    elbowL: new THREE.Vector3(elbowX, elbowY, 0),
    elbowR: new THREE.Vector3(-elbowX, elbowY, 0),
    wristL: new THREE.Vector3(wristX, wristY, 0),
    wristR: new THREE.Vector3(-wristX, wristY, 0),
    kneeL: new THREE.Vector3(hipX, safeH * 0.26, 0),
    kneeR: new THREE.Vector3(-hipX, safeH * 0.26, 0),
    ankleL: new THREE.Vector3(hipX, safeH * 0.04, 0),
    ankleR: new THREE.Vector3(-hipX, safeH * 0.04, 0),
  };
}

export function autoRigObject(
  source: THREE.Object3D,
  rigType: AutoRigPreset = 'biped',
  customMarkers?: CustomJointMarkers,
  exportProfile: RigExportProfile = 'standard'
): AutoRigOutput {
  source.updateMatrixWorld(true);
  _boxTmp.setFromObject(source);
  const min = _boxTmp.min.clone();
  const max = _boxTmp.max.clone();
  const size = new THREE.Vector3().subVectors(max, min);
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

  const safeH = Math.max(0.4, size.y);
  const safeW = Math.max(0.3, size.x);

  const riggedRoot = new THREE.Group();
  riggedRoot.name = source.name ? `${source.name}_Rigged` : 'Malha_Com_Ossos';
  riggedRoot.userData.isAutoRigged = true;

  const bones: THREE.Bone[] = [];
  const boneSegments: Array<{
    a: THREE.Vector3;
    b: THREE.Vector3;
    side: 'L' | 'R' | 'C';
    zone: 'upper' | 'lower' | 'all';
  }> = [];

  const mkBone = (
    name: string,
    parent: THREE.Object3D,
    localX: number,
    localY: number,
    localZ: number
  ) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(localX, localY, localZ);
    parent.add(bone);
    bones.push(bone);
    return bone;
  };

  const names = PROFILE_BONE_NAMES[exportProfile];

  if (rigType === 'flex_spine') {
    const b0 = mkBone('Root_Spine', riggedRoot, 0, safeH * 0.08, 0);
    const b1 = mkBone('Spine_1', b0, 0, safeH * 0.22, 0);
    const b2 = mkBone('Spine_2', b1, 0, safeH * 0.22, 0);
    const b3 = mkBone('Spine_3', b2, 0, safeH * 0.22, 0);
    mkBone('Spine_Tip', b3, 0, safeH * 0.2, 0);
  } else if (customMarkers) {
    // Build skeleton directly from user-placed ActionForge Joint Markers
    const m = customMarkers;
    const spineW = new THREE.Vector3().lerpVectors(m.pelvis, m.neck, 0.34);
    const chestW = new THREE.Vector3().lerpVectors(m.pelvis, m.neck, 0.72);
    const clavLW = new THREE.Vector3().lerpVectors(chestW, m.shoulderL, 0.45);
    const clavRW = new THREE.Vector3().lerpVectors(chestW, m.shoulderR, 0.45);
    const thighLW = new THREE.Vector3(m.kneeL.x, m.pelvis.y - safeH * 0.03, m.pelvis.z);
    const thighRW = new THREE.Vector3(m.kneeR.x, m.pelvis.y - safeH * 0.03, m.pelvis.z);

    const pelvis = mkBone(names.hips, riggedRoot, m.pelvis.x, m.pelvis.y, m.pelvis.z);
    const spine = mkBone(names.spine, pelvis, spineW.x - m.pelvis.x, spineW.y - m.pelvis.y, spineW.z - m.pelvis.z);
    const chest = mkBone(names.chest, spine, chestW.x - spineW.x, chestW.y - spineW.y, chestW.z - spineW.z);
    const neck = mkBone(names.neck, chest, m.neck.x - chestW.x, m.neck.y - chestW.y, m.neck.z - chestW.z);
    mkBone(names.head, neck, m.head.x - m.neck.x, m.head.y - m.neck.y, m.head.z - m.neck.z);

    const lClav = mkBone(names.leftShoulder, chest, clavLW.x - chestW.x, clavLW.y - chestW.y, clavLW.z - chestW.z);
    const lUp = mkBone(names.leftUpperArm, lClav, m.shoulderL.x - clavLW.x, m.shoulderL.y - clavLW.y, m.shoulderL.z - clavLW.z);
    const lFore = mkBone(names.leftForeArm, lUp, m.elbowL.x - m.shoulderL.x, m.elbowL.y - m.shoulderL.y, m.elbowL.z - m.shoulderL.z);
    mkBone(names.leftHand, lFore, m.wristL.x - m.elbowL.x, m.wristL.y - m.elbowL.y, m.wristL.z - m.elbowL.z);

    const rClav = mkBone(names.rightShoulder, chest, clavRW.x - chestW.x, clavRW.y - chestW.y, clavRW.z - chestW.z);
    const rUp = mkBone(names.rightUpperArm, rClav, m.shoulderR.x - clavRW.x, m.shoulderR.y - clavRW.y, m.shoulderR.z - clavRW.z);
    const rFore = mkBone(names.rightForeArm, rUp, m.elbowR.x - m.shoulderR.x, m.elbowR.y - m.shoulderR.y, m.elbowR.z - m.shoulderR.z);
    mkBone(names.rightHand, rFore, m.wristR.x - m.elbowR.x, m.wristR.y - m.elbowR.y, m.wristR.z - m.elbowR.z);

    const lThigh = mkBone(names.leftThigh, pelvis, thighLW.x - m.pelvis.x, thighLW.y - m.pelvis.y, thighLW.z - m.pelvis.z);
    const lShin = mkBone(names.leftShin, lThigh, m.kneeL.x - thighLW.x, m.kneeL.y - thighLW.y, m.kneeL.z - thighLW.z);
    mkBone(names.leftFoot, lShin, m.ankleL.x - m.kneeL.x, m.ankleL.y - m.kneeL.y, m.ankleL.z - m.kneeL.z);

    const rThigh = mkBone(names.rightThigh, pelvis, thighRW.x - m.pelvis.x, thighRW.y - m.pelvis.y, thighRW.z - m.pelvis.z);
    const rShin = mkBone(names.rightShin, rThigh, m.kneeR.x - thighRW.x, m.kneeR.y - thighRW.y, m.kneeR.z - thighRW.z);
    mkBone(names.rightFoot, rShin, m.ankleR.x - m.kneeR.x, m.ankleR.y - m.kneeR.y, m.ankleR.z - m.kneeR.z);
  } else {
    const pelvis = mkBone(names.hips, riggedRoot, 0, safeH * 0.5, 0);
    const spine = mkBone(names.spine, pelvis, 0, safeH * 0.09, 0);
    const chest = mkBone(names.chest, spine, 0, safeH * 0.13, 0);
    const neck = mkBone(names.neck, chest, 0, safeH * 0.1, 0);
    mkBone(names.head, neck, 0, safeH * 0.08, 0);

    const wideArms = safeW > safeH * 0.62;
    const shoulderX = wideArms ? safeW * 0.08 : Math.min(safeW * 0.3, safeH * 0.1);
    const upperLen = wideArms ? safeW * 0.15 : safeH * 0.15;
    const foreLen = wideArms ? safeW * 0.14 : safeH * 0.14;
    const armDropY = wideArms ? 0 : -upperLen * 0.85;
    const armOutX = wideArms ? upperLen : upperLen * 0.42;
    const foreDropY = wideArms ? 0 : -foreLen * 0.92;
    const foreOutX = wideArms ? foreLen : foreLen * 0.25;

    const lSho = mkBone(names.leftShoulder, chest, shoulderX, safeH * 0.04, 0);
    const lUpArm = mkBone(names.leftUpperArm, lSho, safeW * 0.04, 0, 0);
    const lFore = mkBone(names.leftForeArm, lUpArm, armOutX, armDropY, 0);
    mkBone(names.leftHand, lFore, foreOutX, foreDropY, 0);

    const rSho = mkBone(names.rightShoulder, chest, -shoulderX, safeH * 0.04, 0);
    const rUpArm = mkBone(names.rightUpperArm, rSho, -safeW * 0.04, 0, 0);
    const rFore = mkBone(names.rightForeArm, rUpArm, -armOutX, armDropY, 0);
    mkBone(names.rightHand, rFore, -foreOutX, foreDropY, 0);

    const hipX = Math.min(safeW * 0.16, safeH * 0.08);
    const thighLen = safeH * 0.22;
    const shinLen = safeH * 0.22;

    const lThigh = mkBone(names.leftThigh, pelvis, hipX, -safeH * 0.03, 0);
    const lShin = mkBone(names.leftShin, lThigh, 0, -thighLen, 0);
    mkBone(names.leftFoot, lShin, 0, -shinLen, 0);

    const rThigh = mkBone(names.rightThigh, pelvis, -hipX, -safeH * 0.03, 0);
    const rShin = mkBone(names.rightShin, rThigh, 0, -thighLen, 0);
    mkBone(names.rightFoot, rShin, 0, -shinLen, 0);
  }

  riggedRoot.updateMatrixWorld(true);
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    const aPos = new THREE.Vector3();
    b.getWorldPosition(aPos);
    const bPos = new THREE.Vector3();
    const firstChildBone = b.children.find((c) => (c as THREE.Bone).isBone);
    const sideDet = detectSide(b.name, aPos.x, 0);
    const side: 'L' | 'R' | 'C' = sideDet === 'left' ? 'L' : sideDet === 'right' ? 'R' : 'C';
    if (firstChildBone) {
      firstChildBone.getWorldPosition(bPos);
    } else {
      const isHand = /hand|wrist/i.test(b.name);
      const isFoot = /foot|ankle/i.test(b.name);
      const offsetDir = isHand
        ? new THREE.Vector3(side === 'R' ? -0.08 : 0.08, -0.02, 0)
        : isFoot
          ? new THREE.Vector3(0, -0.03, 0.12)
          : new THREE.Vector3(0, safeH * 0.1, 0);
      bPos.copy(aPos).add(offsetDir);
    }

    const bn = b.name.toLowerCase();
    const zone: 'upper' | 'lower' | 'all' =
      /thigh|upleg|upper_?leg|shin|calf|lower_?leg|(\bleg|leftleg|rightleg|l_leg|r_leg)|foot/.test(bn)
        ? 'lower'
        : /spine|chest|neck|head|shoulder|clavicle|arm|hand/.test(bn)
          ? 'upper'
          : 'all';
    boneSegments.push({ a: aPos, b: bPos, side, zone });
  }

  const skeleton = new THREE.Skeleton(bones);
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  _rootInvMat.makeTranslation(-center.x, -min.y, -center.z);

  const sigma = Math.max(0.06, safeH * 0.075);
  const invTwoSigmaSq = 1 / (2 * sigma * sigma);
  const pelvisLineY = safeH * 0.48;

  source.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const srcMesh = obj as THREE.Mesh;
      if (!srcMesh.geometry) return;
      const geo = srcMesh.geometry.clone();
      _meshRelMat.multiplyMatrices(_rootInvMat, srcMesh.matrixWorld);
      geo.applyMatrix4(_meshRelMat);
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      const posAttr = geo.getAttribute('position');
      const vCount = posAttr.count;
      const skinIndices = new Uint16Array(vCount * 4);
      const skinWeights = new Float32Array(vCount * 4);

      const top4Idx = [0, 0, 0, 0];
      const top4W = [0, 0, 0, 0];

      for (let vi = 0; vi < vCount; vi++) {
        _vA.fromBufferAttribute(posAttr, vi);
        top4Idx[0] = top4Idx[1] = top4Idx[2] = top4Idx[3] = 0;
        top4W[0] = top4W[1] = top4W[2] = top4W[3] = 0;

        for (let bi = 0; bi < boneSegments.length; bi++) {
          const seg = boneSegments[bi];
          let d2 = pointToSegmentDistSq(_vA, seg.a, seg.b);

          if (rigType === 'biped') {
            if (seg.side === 'L' && _vA.x < -0.015) d2 += 0.55;
            if (seg.side === 'R' && _vA.x > 0.015) d2 += 0.55;
            if (seg.zone === 'lower' && _vA.y > pelvisLineY + 0.06) d2 += 0.45;
            if (seg.zone === 'upper' && _vA.y < pelvisLineY - 0.06) d2 += 0.45;
          }

          const w = Math.exp(-d2 * invTwoSigmaSq);
          for (let k = 0; k < 4; k++) {
            if (w > top4W[k]) {
              for (let s = 3; s > k; s--) {
                top4W[s] = top4W[s - 1];
                top4Idx[s] = top4Idx[s - 1];
              }
              top4W[k] = w;
              top4Idx[k] = bi;
              break;
            }
          }
        }

        const sum = top4W[0] + top4W[1] + top4W[2] + top4W[3];
        const base = vi * 4;
        if (sum > 1e-8) {
          for (let k = 0; k < 4; k++) {
            skinIndices[base + k] = top4Idx[k];
            skinWeights[base + k] = top4W[k] / sum;
          }
        } else {
          skinIndices[base] = 0;
          skinWeights[base] = 1;
        }
      }

      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      disposables.push(geo);

      const srcMat = Array.isArray(srcMesh.material) ? srcMesh.material[0] : srcMesh.material;
      const clonedMat = srcMat
        ? srcMat.clone()
        : new THREE.MeshPhysicalMaterial({
            color: 0x38bdf8,
            metalness: 0.25,
            roughness: 0.45,
          });
      disposables.push(clonedMat);

      const skinned = new THREE.SkinnedMesh(geo, clonedMat);
      skinned.name = srcMesh.name || `Malha_Rig_${skinnedMeshes.length + 1}`;
      skinned.castShadow = srcMesh.castShadow;
      skinned.receiveShadow = srcMesh.receiveShadow;
      skinned.frustumCulled = false;
      skinned.bind(skeleton, new THREE.Matrix4());
      riggedRoot.add(skinned);
      skinnedMeshes.push(skinned);
    }
  });

  skeleton.calculateInverses();

  return {
    riggedRoot,
    skeleton,
    skinnedMeshes,
    boneCount: bones.length,
    disposables,
  };
}

export function createRiggedHumanoidTemplate(
  exportProfile: RigExportProfile = 'standard'
): AutoRigOutput {
  const parts: THREE.BufferGeometry[] = [];
  const addPart = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (rz !== 0) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
    geo.dispose();
  };

  // Pelvis & Torso
  addPart(new THREE.CylinderGeometry(0.17, 0.15, 0.19, 18), 0, 0.96, 0);
  addPart(new THREE.CylinderGeometry(0.24, 0.17, 0.46, 20), 0, 1.29, 0);
  // Neck & Head
  addPart(new THREE.CylinderGeometry(0.075, 0.085, 0.11, 14), 0, 1.58, 0);
  addPart(new THREE.CapsuleGeometry(0.125, 0.11, 8, 18), 0, 1.75, 0);
  // Left & Right Arms + Hands (T-pose centered at y = 1.46)
  addPart(new THREE.CapsuleGeometry(0.06, 0.25, 8, 14), 0.36, 1.46, 0, Math.PI / 2);
  addPart(new THREE.CapsuleGeometry(0.05, 0.25, 8, 14), 0.66, 1.46, 0, Math.PI / 2);
  addPart(new THREE.BoxGeometry(0.11, 0.05, 0.08), 0.85, 1.46, 0.01);

  addPart(new THREE.CapsuleGeometry(0.06, 0.25, 8, 14), -0.36, 1.46, 0, Math.PI / 2);
  addPart(new THREE.CapsuleGeometry(0.05, 0.25, 8, 14), -0.66, 1.46, 0, Math.PI / 2);
  addPart(new THREE.BoxGeometry(0.11, 0.05, 0.08), -0.85, 1.46, 0.01);

  // Left & Right Legs + Feet (bottom at y = 0)
  addPart(new THREE.CapsuleGeometry(0.082, 0.33, 8, 14), 0.14, 0.69, 0);
  addPart(new THREE.CapsuleGeometry(0.068, 0.35, 8, 14), 0.14, 0.27, 0);
  addPart(new THREE.BoxGeometry(0.12, 0.07, 0.22), 0.14, 0.035, 0.05);

  addPart(new THREE.CapsuleGeometry(0.082, 0.33, 8, 14), -0.14, 0.69, 0);
  addPart(new THREE.CapsuleGeometry(0.068, 0.35, 8, 14), -0.14, 0.27, 0);
  addPart(new THREE.BoxGeometry(0.12, 0.07, 0.22), -0.14, 0.035, 0.05);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const tempMat = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    metalness: 0.35,
    roughness: 0.4,
    clearcoat: 0.25,
  });
  const tempMesh = new THREE.Mesh(merged, tempMat);
  tempMesh.name = 'Humanoide_Rigado';
  tempMesh.castShadow = true;
  tempMesh.receiveShadow = true;

  const out = autoRigObject(tempMesh, 'biped', undefined, exportProfile);
  merged.dispose();
  tempMat.dispose();
  return out;
}

export function createPropSocketMesh(propType: 'sword' | 'shield' | 'staff'): {
  group: THREE.Group;
  disposables: Array<{ dispose: () => void }>;
} {
  const group = new THREE.Group();
  group.name = `Prop_${propType}`;
  const disposables: Array<{ dispose: () => void }> = [];

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.9,
    roughness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
    metalness: 0.5,
    roughness: 0.3,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.2,
    roughness: 0.75,
  });
  disposables.push(metalMat, accentMat, gripMat);

  if (propType === 'sword') {
    const gripGeo = new THREE.CylinderGeometry(0.018, 0.02, 0.16, 10);
    const guardGeo = new THREE.BoxGeometry(0.16, 0.024, 0.04);
    const bladeGeo = new THREE.BoxGeometry(0.04, 0.68, 0.014);
    disposables.push(gripGeo, guardGeo, bladeGeo);

    const grip = new THREE.Mesh(gripGeo, gripMat);
    const guard = new THREE.Mesh(guardGeo, accentMat);
    guard.position.set(0, 0.09, 0);
    const blade = new THREE.Mesh(bladeGeo, metalMat);
    blade.position.set(0, 0.44, 0);
    group.add(grip, guard, blade);
    group.rotation.set(Math.PI * 0.5, 0, 0);
  } else if (propType === 'shield') {
    const bodyGeo = new THREE.CylinderGeometry(0.28, 0.25, 0.035, 20);
    const bossGeo = new THREE.SphereGeometry(0.075, 14, 12);
    disposables.push(bodyGeo, bossGeo);

    const body = new THREE.Mesh(bodyGeo, gripMat);
    body.rotation.x = Math.PI * 0.5;
    const boss = new THREE.Mesh(bossGeo, accentMat);
    boss.position.set(0, 0, 0.025);
    group.add(body, boss);
    group.position.set(0.08, 0, 0.06);
    group.rotation.set(0, Math.PI * 0.5, 0);
  } else {
    const shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.35, 12);
    const orbGeo = new THREE.OctahedronGeometry(0.075, 0);
    disposables.push(shaftGeo, orbGeo);

    const shaft = new THREE.Mesh(shaftGeo, gripMat);
    shaft.position.set(0, 0.28, 0);
    const orb = new THREE.Mesh(orbGeo, accentMat);
    orb.position.set(0, 0.98, 0);
    group.add(shaft, orb);
    group.rotation.set(Math.PI * 0.5, 0, 0);
  }

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.userData.nonSelectable = true;
    }
  });

  return { group, disposables };
}

export const POSE_LIBRARY_PRESETS: Record<
  PoseLibraryPresetId,
  { label: string; overrides: Record<string, [number, number, number]> }
> = {
  rest: {
    label: 'T-Pose / Rest',
    overrides: {},
  },
  a_pose: {
    label: 'A-Pose',
    overrides: {
      leftUpperArm: [0, 0, -42],
      rightUpperArm: [0, 0, 42],
      leftForeArm: [0, 8, -8],
      rightForeArm: [0, -8, 8],
      leftThigh: [0, 0, 5],
      rightThigh: [0, 0, -5],
    },
  },
  combat_guard: {
    label: 'Combate',
    overrides: {
      spine: [10, -14, 0],
      chest: [8, -16, 0],
      head: [-8, 22, 0],
      leftUpperArm: [-42, 24, -22],
      leftForeArm: [-78, 0, 0],
      rightUpperArm: [-52, -20, 26],
      rightForeArm: [-88, 0, 0],
      leftThigh: [-24, 6, 8],
      leftShin: [32, 0, 0],
      rightThigh: [18, -8, -8],
      rightShin: [22, 0, 0],
    },
  },
  hero_stance: {
    label: 'Heroico',
    overrides: {
      spine: [-6, 0, 0],
      chest: [-10, 6, 0],
      head: [-4, -8, 0],
      leftUpperArm: [8, 0, -28],
      leftForeArm: [-18, 0, 0],
      rightUpperArm: [12, 0, 32],
      rightForeArm: [-24, 0, 0],
      leftThigh: [-6, 6, 8],
      rightThigh: [6, -6, -8],
    },
  },
  sit: {
    label: 'Sentado',
    overrides: {
      hips: [6, 0, 0],
      spine: [-8, 0, 0],
      chest: [6, 0, 0],
      leftUpperArm: [-22, 10, -18],
      leftForeArm: [-35, 0, 0],
      rightUpperArm: [-22, -10, 18],
      rightForeArm: [-35, 0, 0],
      leftThigh: [-84, 4, 4],
      leftShin: [84, 0, 0],
      rightThigh: [-84, -4, -4],
      rightShin: [84, 0, 0],
    },
  },
};

export function detectRoleFromBoneName(name: string): HumanoidBoneRole | null {
  const n = name.toLowerCase();
  const side = detectSide(name, 0, 0);

  if (/pelvis|hips|mixamorig:?hips|\bhip\b/.test(n) && !/thigh|upleg/.test(n)) {
    return 'hips';
  }
  if (/^spine(_?0?1)?$|mixamorig:?spine$|spine1|\btorso\b/.test(n)) {
    return 'spine';
  }
  if (/chest|upper_?chest|spine_?0?[23]|mixamorig:?spine2|ribcage/.test(n)) {
    return 'chest';
  }
  if (/neck|cervical/.test(n)) {
    return 'neck';
  }
  if (/head|cranium|skull/.test(n) && !/top|end/.test(n)) {
    return 'head';
  }
  if (side === 'left') {
    if (/clavicle|collar|shoulder/.test(n) && !/upper|arm/.test(n)) return 'leftShoulder';
    if (/fore_?arm|lower_?arm|elbow|radius/.test(n)) return 'leftForeArm';
    if (/upper_?arm|arm|bicep|humerus|shoulder/.test(n)) return 'leftUpperArm';
    if (/hand|wrist|palm/.test(n)) return 'leftHand';
    if (/thigh|upper_?leg|upleg|femur/.test(n)) return 'leftThigh';
    if (/shin|calf|lower_?leg|knee|tibia|(\bleg|leftleg|l_leg)/.test(n)) return 'leftShin';
    if (/foot|ankle|heel/.test(n)) return 'leftFoot';
  } else if (side === 'right') {
    if (/clavicle|collar|shoulder/.test(n) && !/upper|arm/.test(n)) return 'rightShoulder';
    if (/fore_?arm|lower_?arm|elbow|radius/.test(n)) return 'rightForeArm';
    if (/upper_?arm|arm|bicep|humerus|shoulder/.test(n)) return 'rightUpperArm';
    if (/hand|wrist|palm/.test(n)) return 'rightHand';
    if (/thigh|upper_?leg|upleg|femur/.test(n)) return 'rightThigh';
    if (/shin|calf|lower_?leg|knee|tibia|(\bleg|rightleg|r_leg)/.test(n)) return 'rightShin';
    if (/foot|ankle|heel/.test(n)) return 'rightFoot';
  }
  return null;
}

export function retargetAnimationClipToRig(
  sourceClip: THREE.AnimationClip,
  targetRigMap: SkeletonRigMap
): THREE.AnimationClip {
  const newTracks: THREE.KeyframeTrack[] = [];
  const usedTargetTracks = new Set<string>();

  for (const track of sourceClip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    const rawNodeName = track.name.slice(0, dotIdx);
    const propName = track.name.slice(dotIdx + 1);
    const cleanNodeName = rawNodeName.includes('/')
      ? rawNodeName.slice(rawNodeName.lastIndexOf('/') + 1)
      : rawNodeName;

    const exactEntry = targetRigMap.bones.find((b) => b.bone.name === cleanNodeName);
    let targetBoneName = exactEntry?.bone.name;

    if (!targetBoneName) {
      const role = detectRoleFromBoneName(cleanNodeName);
      if (role && targetRigMap.roles[role]) {
        targetBoneName = targetRigMap.roles[role]!.bone.name;
      }
    }

    if (!targetBoneName) continue;
    if (propName === 'position' && targetBoneName !== targetRigMap.roles.hips?.bone.name) {
      continue;
    }

    const fullTrackName = `${targetBoneName}.${propName}`;
    if (usedTargetTracks.has(fullTrackName)) continue;
    usedTargetTracks.add(fullTrackName);

    const clonedTrack = track.clone();
    clonedTrack.name = fullTrackName;
    newTracks.push(clonedTrack);
  }

  const label = sourceClip.name ? `Retarget_${sourceClip.name}` : 'Retarget_Clip';
  return new THREE.AnimationClip(label, Math.max(0.1, sourceClip.duration), newTracks);
}

export function findMirrorBoneName(
  boneName: string,
  allBoneNames: string[]
): string | null {
  const swaps: Array<[RegExp, string]> = [
    [/_L\b/i, '_R'],
    [/_R\b/i, '_L'],
    [/\.L\b/i, '.R'],
    [/\.R\b/i, '.L'],
    [/Left/i, 'Right'],
    [/Right/i, 'Left'],
    [/_l\b/, '_r'],
    [/_r\b/, '_l'],
  ];

  for (const [pattern, replacement] of swaps) {
    if (pattern.test(boneName)) {
      const candidate = boneName.replace(pattern, replacement);
      const exact = allBoneNames.find((n) => n === candidate);
      if (exact) return exact;
      const insensitive = allBoneNames.find(
        (n) => n.toLowerCase() === candidate.toLowerCase()
      );
      if (insensitive) return insensitive;
    }
  }
  return null;
}

function weightToHeatRgb(w: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, w));
  if (clamped < 0.25) {
    const t = clamped / 0.25;
    return [0.08, 0.16 + t * 0.68, 0.72 + t * 0.25];
  }
  if (clamped < 0.5) {
    const t = (clamped - 0.25) / 0.25;
    return [0.08, 0.84, 0.97 * (1 - t) + 0.22 * t];
  }
  if (clamped < 0.75) {
    const t = (clamped - 0.5) / 0.25;
    return [0.1 + t * 0.88, 0.88, 0.16 * (1 - t)];
  }
  const t = (clamped - 0.75) / 0.25;
  return [0.98, 0.88 * (1 - t) + 0.12 * t, 0.08];
}

function getMeshWeightForBone(
  skinned: THREE.SkinnedMesh,
  vertexIndex: number,
  boneIndex: number
): number {
  const skinIdx = skinned.geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
  const skinW = skinned.geometry.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
  if (!skinIdx || !skinW) return 0;

  let total = 0;
  for (let slot = 0; slot < 4; slot++) {
    const idxVal = Math.round(skinIdx.getComponent(vertexIndex, slot));
    if (idxVal === boneIndex) {
      total += skinW.getComponent(vertexIndex, slot);
    }
  }
  return Math.max(0, Math.min(1, total));
}

function applyBoneWeightToVertex(
  skinned: THREE.SkinnedMesh,
  vertexIndex: number,
  boneIndex: number,
  targetWeight: number
): void {
  const skinIdx = skinned.geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
  const skinW = skinned.geometry.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
  if (!skinIdx || !skinW) return;

  const clampedTarget = Math.max(0, Math.min(1, targetWeight));
  const indices = [
    Math.round(skinIdx.getX(vertexIndex)),
    Math.round(skinIdx.getY(vertexIndex)),
    Math.round(skinIdx.getZ(vertexIndex)),
    Math.round(skinIdx.getW(vertexIndex)),
  ];
  const weights = [
    skinW.getX(vertexIndex),
    skinW.getY(vertexIndex),
    skinW.getZ(vertexIndex),
    skinW.getW(vertexIndex),
  ];

  let foundSlot = indices.indexOf(boneIndex);
  if (foundSlot === -1) {
    let minSlot = 0;
    for (let i = 1; i < 4; i++) {
      if (weights[i] < weights[minSlot]) minSlot = i;
    }
    foundSlot = minSlot;
    indices[foundSlot] = boneIndex;
  }

  let otherSum = 0;
  for (let i = 0; i < 4; i++) {
    if (i !== foundSlot) {
      otherSum += Math.max(0, weights[i]);
    }
  }

  weights[foundSlot] = clampedTarget;
  const remaining = Math.max(0, 1 - clampedTarget);
  if (otherSum > 1e-6) {
    const factor = remaining / otherSum;
    for (let i = 0; i < 4; i++) {
      if (i !== foundSlot) {
        weights[i] = Math.max(0, weights[i] * factor);
      }
    }
  } else if (remaining > 1e-5) {
    const fallbackSlot = foundSlot === 0 ? 1 : 0;
    weights[fallbackSlot] = remaining;
  }

  const finalSum = weights[0] + weights[1] + weights[2] + weights[3];
  if (finalSum > 1e-6) {
    for (let i = 0; i < 4; i++) weights[i] /= finalSum;
  } else {
    weights[foundSlot] = 1;
  }

  skinIdx.setXYZW(vertexIndex, indices[0], indices[1], indices[2], indices[3]);
  skinW.setXYZW(vertexIndex, weights[0], weights[1], weights[2], weights[3]);
}

export function refreshWeightHeatmapOnRoot(
  root: THREE.Object3D,
  activeBoneName: string
): number {
  let paintedCount = 0;
  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh || !skinned.skeleton) return;
    const boneIdx = skinned.skeleton.bones.findIndex((b) => b.name === activeBoneName);
    const posAttr = skinned.geometry.getAttribute('position');
    if (!posAttr) return;

    const vCount = posAttr.count;
    let colorAttr = skinned.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!colorAttr || colorAttr.count !== vCount) {
      colorAttr = new THREE.BufferAttribute(new Float32Array(vCount * 3), 3);
      skinned.geometry.setAttribute('color', colorAttr);
    }
    const arr = colorAttr.array as Float32Array;
    for (let i = 0; i < vCount; i++) {
      const w = boneIdx >= 0 ? getMeshWeightForBone(skinned, i, boneIdx) : 0;
      const [r, g, b] = weightToHeatRgb(w);
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    colorAttr.needsUpdate = true;

    if (!skinned.userData.__weightHeatmapMat) {
      const heatmapMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0.05,
      });
      skinned.userData.__weightHeatmapMat = heatmapMat;
    }
    if (!skinned.userData.__weightSavedMaterial) {
      skinned.userData.__weightSavedMaterial = skinned.material;
    }
    skinned.material = skinned.userData.__weightHeatmapMat as THREE.Material;
    paintedCount++;
  });
  return paintedCount;
}

export function disableWeightHeatmapOnRoot(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    if (skinned.userData.__weightSavedMaterial) {
      skinned.material = skinned.userData.__weightSavedMaterial as THREE.Material | THREE.Material[];
      delete skinned.userData.__weightSavedMaterial;
    }
    if (skinned.userData.__weightHeatmapMat) {
      (skinned.userData.__weightHeatmapMat as THREE.Material).dispose();
      delete skinned.userData.__weightHeatmapMat;
    }
  });
}

export function paintSkinWeightStroke(
  skinned: THREE.SkinnedMesh,
  worldHitPoint: THREE.Vector3,
  targetBoneName: string,
  options: {
    mode: 'add' | 'subtract' | 'smooth';
    radius: number;
    strength: number;
    symmetryX: boolean;
    mirrorBoneName?: string | null;
  }
): number {
  if (!skinned.skeleton) return 0;
  const boneIndex = skinned.skeleton.bones.findIndex((b) => b.name === targetBoneName);
  if (boneIndex < 0) return 0;

  const mirrorBoneIdx =
    options.symmetryX && options.mirrorBoneName
      ? skinned.skeleton.bones.findIndex((b) => b.name === options.mirrorBoneName)
      : boneIndex;

  const posAttr = skinned.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const skinW = skinned.geometry.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
  const skinIdx = skinned.geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
  if (!posAttr || !skinW || !skinIdx) return 0;

  skinned.updateMatrixWorld(true);
  const invMat = new THREE.Matrix4().copy(skinned.matrixWorld).invert();
  const localHit = worldHitPoint.clone().applyMatrix4(invMat);
  const mirrorHit = new THREE.Vector3(-localHit.x, localHit.y, localHit.z);

  const radiusSq = Math.max(0.002, options.radius * options.radius);
  const deltaStep = Math.max(0.02, Math.min(0.85, options.strength));
  let modified = 0;

  const paintVertexForBone = (vIdx: number, distSq: number, bIdx: number) => {
    const falloff = 1 - Math.sqrt(distSq) / Math.max(0.01, options.radius);
    if (falloff <= 0) return;
    const curr = getMeshWeightForBone(skinned, vIdx, bIdx);
    let next = curr;
    if (options.mode === 'add') {
      next = Math.min(1, curr + deltaStep * falloff * 0.45);
    } else if (options.mode === 'subtract') {
      next = Math.max(0, curr - deltaStep * falloff * 0.45);
    } else {
      next = THREE.MathUtils.lerp(curr, 0.5, deltaStep * falloff * 0.35);
    }
    applyBoneWeightToVertex(skinned, vIdx, bIdx, next);
    modified++;
  };

  for (let i = 0; i < posAttr.count; i++) {
    _vA.fromBufferAttribute(posAttr, i);
    const d2 = _vA.distanceToSquared(localHit);
    if (d2 <= radiusSq) {
      paintVertexForBone(i, d2, boneIndex);
    }
    if (options.symmetryX && mirrorBoneIdx >= 0 && Math.abs(localHit.x) > 0.02) {
      const md2 = _vA.distanceToSquared(mirrorHit);
      if (md2 <= radiusSq) {
        paintVertexForBone(i, md2, mirrorBoneIdx);
      }
    }
  }

  if (modified > 0) {
    skinIdx.needsUpdate = true;
    skinW.needsUpdate = true;
  }
  return modified;
}

