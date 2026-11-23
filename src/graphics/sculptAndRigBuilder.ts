import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  AnimationSettings,
  MeshDeformationType,
  PrimitiveShape,
  SculptBrushTool,
  SculptMaterialType,
} from '../types/graphics';
import { computePatrolBackAndForth } from './autoRiggingAndRetarget';

const _localHit = new THREE.Vector3();
const _vPos = new THREE.Vector3();
const _vNorm = new THREE.Vector3();
const _avg = new THREE.Vector3();

export function createSculptMatcapTexture(kind: SculptMaterialType): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(96, 84, 10, 128, 128, 128);
    if (kind === 'redwax') {
      grad.addColorStop(0, '#ff9c7a');
      grad.addColorStop(0.28, '#b93829');
      grad.addColorStop(0.68, '#661816');
      grad.addColorStop(0.92, '#2a090d');
      grad.addColorStop(1, '#120406');
    } else {
      grad.addColorStop(0, '#f1e5d6');
      grad.addColorStop(0.35, '#bfa893');
      grad.addColorStop(0.75, '#6b5a4d');
      grad.addColorStop(1, '#261f1b');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPrimitiveSculptGeometry(shape: PrimitiveShape): THREE.BufferGeometry {
  let raw: THREE.BufferGeometry;
  if (shape === 'cube') {
    raw = new THREE.BoxGeometry(1.45, 1.45, 1.45, 18, 18, 18);
  } else if (shape === 'sphere') {
    raw = new THREE.IcosahedronGeometry(1.05, 4);
  } else if (shape === 'torus') {
    raw = new THREE.TorusGeometry(0.85, 0.34, 32, 64);
  } else if (shape === 'cylinder') {
    raw = new THREE.CylinderGeometry(0.72, 0.72, 1.65, 36, 18);
  } else if (shape === 'cone') {
    raw = new THREE.ConeGeometry(0.92, 1.75, 36, 18);
  } else if (shape === 'capsule') {
    raw = new THREE.CapsuleGeometry(0.62, 0.85, 16, 36);
  } else if (shape === 'crystal') {
    raw = new THREE.OctahedronGeometry(1.12, 2);
  } else {
    raw = new THREE.TorusKnotGeometry(0.68, 0.22, 96, 20);
  }

  // Delete UVs before merging vertices so seams weld cleanly for sculpting
  raw.deleteAttribute('uv');
  const merged = mergeVertices(raw, 1e-4);
  raw.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function subdivideGeometry4x(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute('position');
  if (!pos) return null;

  const triCount = index ? index.count / 3 : pos.count / 3;
  if (triCount > 45000) {
    // Safety cap to keep browser interactive
    return null;
  }

  const outPositions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const bc = new THREE.Vector3();
  const ca = new THREE.Vector3();

  const pushTri = (p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => {
    outPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  };

  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3;
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);

    ab.addVectors(a, b).multiplyScalar(0.5);
    bc.addVectors(b, c).multiplyScalar(0.5);
    ca.addVectors(c, a).multiplyScalar(0.5);

    pushTri(a, ab, ca);
    pushTri(ab, b, bc);
    pushTri(ca, bc, c);
    pushTri(ab, bc, ca);
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
  const welded = mergeVertices(raw, 1e-4);
  raw.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  return welded;
}

export function applySculptBrushStroke(
  mesh: THREE.Mesh,
  worldPoint: THREE.Vector3,
  brush: SculptBrushTool,
  drawSize: number,
  zIntensity: number,
  symmetryX: boolean
): boolean {
  if (brush === 'camera') return false;
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
  if (!pos || !norm) return false;

  _localHit.copy(worldPoint);
  mesh.worldToLocal(_localHit);

  const radius = drawSize;
  const radiusSq = radius * radius;
  const strength = (zIntensity / 50) * 0.055;
  const sign = brush === 'carve' ? -1 : 1;

  const sculptPass = (center: THREE.Vector3) => {
    if (brush === 'smooth') {
      _avg.set(0, 0, 0);
      let count = 0;
      for (let i = 0; i < pos.count; i++) {
        _vPos.fromBufferAttribute(pos, i);
        if (_vPos.distanceToSquared(center) < radiusSq) {
          _avg.add(_vPos);
          count++;
        }
      }
      if (count > 0) {
        _avg.divideScalar(count);
        for (let i = 0; i < pos.count; i++) {
          _vPos.fromBufferAttribute(pos, i);
          const d2 = _vPos.distanceToSquared(center);
          if (d2 < radiusSq) {
            const w = Math.pow(1 - d2 / radiusSq, 2) * (zIntensity / 50) * 0.28;
            _vPos.lerp(_avg, w);
            pos.setXYZ(i, _vPos.x, _vPos.y, _vPos.z);
          }
        }
      }
      return;
    }

    for (let i = 0; i < pos.count; i++) {
      _vPos.fromBufferAttribute(pos, i);
      const d2 = _vPos.distanceToSquared(center);
      if (d2 < radiusSq) {
        const falloff = Math.pow(1 - d2 / radiusSq, 2);
        _vNorm.fromBufferAttribute(norm, i);
        _vPos.addScaledVector(_vNorm, sign * strength * falloff);
        pos.setXYZ(i, _vPos.x, _vPos.y, _vPos.z);
      }
    }
  };

  sculptPass(_localHit);
  if (symmetryX && Math.abs(_localHit.x) > 0.01) {
    _localHit.x = -_localHit.x;
    sculptPass(_localHit);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return true;
}

export function applyMeshDeformation(
  mesh: THREE.Mesh,
  type: MeshDeformationType
): void {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
  if (!pos || !norm) return;

  if (type === 'polish') {
    // Relax vertices slightly toward radial average
    _avg.set(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      _vPos.fromBufferAttribute(pos, i);
      _avg.add(_vPos);
    }
    _avg.divideScalar(Math.max(1, pos.count));
    for (let i = 0; i < pos.count; i++) {
      _vPos.fromBufferAttribute(pos, i);
      const dist = _vPos.distanceTo(_avg);
      _vPos.sub(_avg).normalize().multiplyScalar(THREE.MathUtils.lerp(dist, 1.05, 0.14)).add(_avg);
      pos.setXYZ(i, _vPos.x, _vPos.y, _vPos.z);
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      if (type === 'inflate_plus') {
        x += norm.getX(i) * 0.08;
        y += norm.getY(i) * 0.08;
        z += norm.getZ(i) * 0.08;
      } else if (type === 'inflate_minus') {
        x -= norm.getX(i) * 0.08;
        y -= norm.getY(i) * 0.08;
        z -= norm.getZ(i) * 0.08;
      } else if (type === 'mirror_x') {
        x = Math.abs(x);
      } else if (type === 'twist') {
        const angle = y * 0.55;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const nx = x * c - z * s;
        const nz = x * s + z * c;
        x = nx;
        z = nz;
      } else if (type === 'bend') {
        const bendAngle = y * 0.35;
        x += Math.sin(bendAngle) * 0.35;
      } else if (type === 'taper') {
        const factor = THREE.MathUtils.clamp(1 - y * 0.25, 0.35, 1.65);
        x *= factor;
        z *= factor;
      }

      pos.setXYZ(i, x, y, z);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

// === ARTICULATED 3D RIG FOR 12 PRINCIPLES OF ANIMATION ===

export interface ArticulatedRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightHandTip: THREE.Object3D;
  bodyMeshes: THREE.Mesh[];
  silhouetteMat: THREE.MeshBasicMaterial;
  pbrPrimaryMat: THREE.MeshPhysicalMaterial;
  pbrSecondaryMat: THREE.MeshStandardMaterial;
  pbrAccentMat: THREE.MeshStandardMaterial;
  trailLine: THREE.Line;
  trailPositions: Float32Array;
  trailCount: number;
  disposables: Array<{ dispose: () => void }>;
}

const TRAIL_MAX_POINTS = 96;

export function createArticulatedCharacterRig(): ArticulatedRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const root = new THREE.Group();
  root.name = 'Rig Articulado 3D';

  const pbrPrimaryMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbd5e1,
    metalness: 0.85,
    roughness: 0.24,
    clearcoat: 0.35,
  });
  const pbrSecondaryMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.35,
    roughness: 0.65,
  });
  const pbrAccentMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.7,
    roughness: 0.2,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.65,
  });
  const silhouetteMat = new THREE.MeshBasicMaterial({
    color: 0x05070c,
  });
  disposables.push(pbrPrimaryMat, pbrSecondaryMat, pbrAccentMat, silhouetteMat);

  const bodyMeshes: THREE.Mesh[] = [];
  const trackMesh = (m: THREE.Mesh, defaultMat: THREE.Material) => {
    m.userData.defaultMaterial = defaultMat;
    m.castShadow = true;
    m.receiveShadow = true;
    bodyMeshes.push(m);
    return m;
  };

  // Pelvis (grounded via legs)
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 1.05, 0);
  root.add(pelvis);

  const pelvisGeo = new THREE.CylinderGeometry(0.24, 0.2, 0.22, 16);
  const pelvisMesh = trackMesh(new THREE.Mesh(pelvisGeo, pbrSecondaryMat), pbrSecondaryMat);
  pelvisMesh.name = 'Pelve';
  pelvis.add(pelvisMesh);
  disposables.push(pelvisGeo);

  // Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.14, 0);
  pelvis.add(torso);

  const chestGeo = new THREE.CylinderGeometry(0.32, 0.22, 0.56, 16);
  const chestMesh = trackMesh(new THREE.Mesh(chestGeo, pbrPrimaryMat), pbrPrimaryMat);
  chestMesh.name = 'Tórax';
  chestMesh.position.y = 0.28;
  torso.add(chestMesh);

  const coreGeo = new THREE.OctahedronGeometry(0.11, 1);
  const coreMesh = trackMesh(new THREE.Mesh(coreGeo, pbrAccentMat), pbrAccentMat);
  coreMesh.name = 'Núcleo Peitoral';
  coreMesh.position.set(0, 0.34, 0.23);
  torso.add(coreMesh);
  disposables.push(chestGeo, coreGeo);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0);
  torso.add(headGroup);

  const headGeo = new THREE.CapsuleGeometry(0.16, 0.12, 8, 18);
  const headMesh = trackMesh(new THREE.Mesh(headGeo, pbrPrimaryMat), pbrPrimaryMat);
  headMesh.name = 'Cabeça';
  headMesh.position.y = 0.18;
  headGroup.add(headMesh);

  const visorGeo = new THREE.BoxGeometry(0.24, 0.08, 0.1);
  const visorMesh = trackMesh(new THREE.Mesh(visorGeo, pbrAccentMat), pbrAccentMat);
  visorMesh.name = 'Visor';
  visorMesh.position.set(0, 0.2, 0.13);
  headGroup.add(visorMesh);
  disposables.push(headGeo, visorGeo);

  // Arms helper
  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.4, 0.5, 0);
    torso.add(shoulder);

    const jointGeo = new THREE.SphereGeometry(0.085, 14, 14);
    const upperGeo = new THREE.CapsuleGeometry(0.07, 0.28, 6, 12);
    const foreGeo = new THREE.CapsuleGeometry(0.06, 0.28, 6, 12);

    const jointMesh = trackMesh(new THREE.Mesh(jointGeo, pbrAccentMat), pbrAccentMat);
    const upperMesh = trackMesh(new THREE.Mesh(upperGeo, pbrSecondaryMat), pbrSecondaryMat);
    upperMesh.position.y = -0.18;
    shoulder.add(jointMesh, upperMesh);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.36, 0);
    shoulder.add(elbow);

    const foreMesh = trackMesh(new THREE.Mesh(foreGeo, pbrPrimaryMat), pbrPrimaryMat);
    foreMesh.position.y = -0.18;
    elbow.add(foreMesh);

    const handTip = new THREE.Object3D();
    handTip.position.set(0, -0.38, 0);
    elbow.add(handTip);

    disposables.push(jointGeo, upperGeo, foreGeo);
    return { shoulder, elbow, handTip };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Legs helper
  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.16, -0.08, 0);
    pelvis.add(hip);

    const thighGeo = new THREE.CapsuleGeometry(0.09, 0.32, 6, 12);
    const shinGeo = new THREE.CapsuleGeometry(0.075, 0.34, 6, 12);
    const footGeo = new THREE.BoxGeometry(0.14, 0.08, 0.26);

    const thighMesh = trackMesh(new THREE.Mesh(thighGeo, pbrSecondaryMat), pbrSecondaryMat);
    thighMesh.position.y = -0.22;
    hip.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.45, 0);
    hip.add(knee);

    const shinMesh = trackMesh(new THREE.Mesh(shinGeo, pbrPrimaryMat), pbrPrimaryMat);
    shinMesh.position.y = -0.22;
    const footMesh = trackMesh(new THREE.Mesh(footGeo, pbrAccentMat), pbrAccentMat);
    footMesh.position.set(0, -0.46, 0.05);
    knee.add(shinMesh, footMesh);

    disposables.push(thighGeo, shinGeo, footGeo);
    return { hip, knee };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // Motion Trail Line
  const trailPositions = new Float32Array(TRAIL_MAX_POINTS * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.frustumCulled = false;
  trailLine.userData.nonSelectable = true;
  disposables.push(trailGeo, trailMat);

  return {
    root,
    pelvis,
    torso,
    headGroup,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightHandTip: rightArm.handTip,
    bodyMeshes,
    silhouetteMat,
    pbrPrimaryMat,
    pbrSecondaryMat,
    pbrAccentMat,
    trailLine,
    trailPositions,
    trailCount: 0,
    disposables,
  };
}

function applyEasingCurve(t: number, curve: AnimationSettings['easing']): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  if (curve === 'linear') return x;
  if (curve === 'slow_in_out') return x * x * (3 - 2 * x);
  if (curve === 'snap_out') return 1 - Math.pow(1 - x, 3);
  // Elastic bounce
  return x === 0 || x === 1
    ? x
    : Math.pow(2, -8 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

const _trailWorldPos = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _eulerTemp = new THREE.Euler();

export function updateCharacterRigAnimation(
  rig: ArticulatedRig,
  settings: AnimationSettings,
  frameFloat: number
): void {
  // Staging material swap
  const useSilhouette = settings.staging === 'silhouette';
  for (const m of rig.bodyMeshes) {
    const targetMat = useSilhouette ? rig.silhouetteMat : (m.userData.defaultMaterial as THREE.Material);
    if (m.material !== targetMat) {
      m.material = targetMat;
    }
  }

  // Frame evaluation (1..60): static locks at currentFrame, full_cycle plays across 60 frames
  const clampedFrame = THREE.MathUtils.clamp(frameFloat, 1, 60);
  const rawPhase =
    settings.cycleMode === 'static'
      ? (clampedFrame - 1) / 59
      : (clampedFrame - 1) / 60;

  // If Pose-to-Pose blocking is selected and keyframes exist, snap/step between user keyframes
  let phaseRaw = rawPhase;
  if (settings.method === 'pose_to_pose') {
    if (settings.keyframes.length >= 2) {
      const sorted = [...settings.keyframes].sort((a, b) => a - b);
      let prevKf = sorted[0];
      let nextKf = sorted[sorted.length - 1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (clampedFrame >= sorted[i] && clampedFrame <= sorted[i + 1]) {
          prevKf = sorted[i];
          nextKf = sorted[i + 1];
          break;
        }
      }
      const span = Math.max(1, nextKf - prevKf);
      const localT = THREE.MathUtils.clamp((clampedFrame - prevKf) / span, 0, 1);
      const steppedLocal = Math.floor(localT * 3) / 3;
      phaseRaw = ((prevKf - 1) + steppedLocal * span) / 60;
    } else {
      phaseRaw = Math.floor(rawPhase * 8) / 8;
    }
  }

  const easedPhase = applyEasingCurve(phaseRaw, settings.easing);
  const patrol = computePatrolBackAndForth(
    phaseRaw,
    settings.action,
    settings.inPlace,
    settings.exaggeration
  );
  const angle = easedPhase * Math.PI * 2 * patrol.stepMultiplier;
  const rawTime = (clampedFrame / 24) * Math.PI;

  const amp = settings.exaggeration;
  const physicsBoost = settings.physicsEnabled ? 0.35 : 0;
  const followLag = ((settings.followThrough / 100) + physicsBoost) * 0.65;
  const arcScale = 0.5 + (settings.arcs / 100) * 0.9;
  const solid = (settings.solidDrawing / 100) * 0.25;
  const squash = ((settings.squashStretch / 100) + (settings.physicsEnabled ? 0.25 : 0)) * 0.22;
  const antic = (settings.anticipation / 100) * 0.28;

  // Appeal posture offsets
  const appealChestLean =
    settings.appeal === 'heroic'
      ? -0.14
      : settings.appeal === 'villain'
        ? 0.22
        : settings.appeal === 'cartoon'
          ? 0.08
          : 0;
  const appealBounce = settings.appeal === 'cartoon' ? 1.35 : 1.0;

  let pelvisY = 1.05;
  let torsoRotX = appealChestLean;
  let torsoRotY = 0;
  let lHipX = 0;
  let rHipX = 0;
  let lKneeX = 0;
  let rKneeX = 0;
  let lShoX = 0;
  let rShoX = 0;
  let lElbX = -0.25;
  let rElbX = -0.25;
  let rShoZ = 0.12;
  let lShoZ = -0.12;
  let stretchY = 1;

  if (settings.action === 'walk') {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    pelvisY = 1.05 + Math.abs(c) * 0.06 * amp * appealBounce;
    lHipX = s * 0.58 * amp;
    rHipX = -s * 0.58 * amp;
    lKneeX = Math.max(0, -c * 0.65 * amp);
    rKneeX = Math.max(0, c * 0.65 * amp);
    lShoX = -Math.sin(angle - followLag) * 0.5 * amp;
    rShoX = Math.sin(angle - followLag) * 0.5 * amp;
    torsoRotY = s * (0.14 + solid);
    stretchY = 1 + Math.abs(c) * squash * 0.4;
  } else if (settings.action === 'run') {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    pelvisY = 1.0 + Math.abs(c) * 0.14 * amp * appealBounce;
    torsoRotX += 0.24;
    lHipX = s * 0.92 * amp;
    rHipX = -s * 0.92 * amp;
    lKneeX = Math.max(0.1, -c * 1.1 * amp);
    rKneeX = Math.max(0.1, c * 1.1 * amp);
    lShoX = -Math.sin(angle - followLag) * 0.95 * amp;
    rShoX = Math.sin(angle - followLag) * 0.95 * amp;
    lElbX = -1.25;
    rElbX = -1.25;
    torsoRotY = s * (0.24 + solid);
    stretchY = 1 + c * squash * 0.65;
  } else if (settings.action === 'jump' || settings.action === 'arc_leap') {
    const jumpArc = Math.max(0, Math.sin(angle));
    const dip = Math.min(0, Math.sin(angle)) * (0.35 + antic);
    pelvisY = 1.05 + jumpArc * 0.72 * amp * arcScale + dip * 0.35;
    torsoRotX += dip * 0.5 - jumpArc * 0.15;
    lHipX = -jumpArc * 0.55 - dip * 0.4;
    rHipX = -jumpArc * 0.55 - dip * 0.4;
    lKneeX = jumpArc * 0.85 - dip * 0.7;
    rKneeX = jumpArc * 0.85 - dip * 0.7;
    lShoX = -jumpArc * 2.1 * arcScale + dip * 0.6;
    rShoX = -jumpArc * 2.1 * arcScale + dip * 0.6;
    stretchY = 1 + (jumpArc - Math.abs(dip)) * squash;
  } else if (settings.action === 'punch') {
    const thrust = Math.pow(Math.max(0, Math.sin(angle)), 2);
    const windUp = Math.min(0, Math.sin(angle)) * (0.6 + antic);
    torsoRotY = -windUp * 0.65 + thrust * 0.75 * amp;
    rShoX = -1.45 * thrust * amp + windUp * 0.6;
    rElbX = -1.1 * (1 - thrust) - 0.1;
    lShoX = 0.35;
    lElbX = -1.3;
    pelvisY = 1.02 - thrust * 0.06;
    stretchY = 1 + thrust * squash * 0.5;
  } else if (settings.action === 'wave') {
    rShoZ = 2.25 + Math.sin(angle * 2) * 0.35 * amp * arcScale;
    rElbX = -0.65 + Math.cos(angle * 2 - followLag) * 0.45 * amp;
    torsoRotX += -0.05;
  } else {
    // Idle
    pelvisY = 1.05 + Math.sin(angle) * 0.025;
  }

  // Secondary Actions
  let headRotY = 0;
  let headRotX = 0;
  if (settings.secondaryAction === 'breathing') {
    stretchY *= 1 + Math.sin(rawTime * 1.4) * 0.028;
  } else if (settings.secondaryAction === 'look_around') {
    headRotY = Math.sin(rawTime * 0.9) * 0.42;
    headRotX = Math.cos(rawTime * 0.7) * 0.12;
  } else if (settings.secondaryAction === 'sway') {
    torsoRotY += Math.sin(rawTime * 1.1) * 0.14;
  }

  // Physics elastic secondary spring wobble when active
  if (settings.physicsEnabled) {
    const spring = Math.sin(angle * 3 - followLag) * 0.08;
    headRotX += spring;
    lElbX += spring * 1.2;
    rElbX -= spring * 1.2;
  }

  const isFree = Boolean(settings.freeEdit || !settings.enabled);
  const invXZ = isFree ? 1 : 1 / Math.sqrt(Math.max(0.65, stretchY));
  rig.pelvis.position.y = isFree ? 1.05 : pelvisY;
  rig.pelvis.scale.set(invXZ, isFree ? 1 : stretchY, invXZ);

  if (isFree) {
    rig.torso.rotation.set(0, 0, 0);
    rig.headGroup.rotation.set(0, 0, 0);
    rig.leftHip.rotation.x = 0;
    rig.rightHip.rotation.x = 0;
    rig.leftKnee.rotation.x = 0;
    rig.rightKnee.rotation.x = 0;
    rig.leftShoulder.rotation.set(0, 0, -0.12);
    rig.rightShoulder.rotation.set(0, 0, 0.12);
    rig.leftElbow.rotation.x = -0.25;
    rig.rightElbow.rotation.x = -0.25;
  } else {
    if (settings.rotationMode === 'quaternion') {
      _eulerTemp.set(torsoRotX, torsoRotY, 0);
      _quatA.setFromEuler(_eulerTemp);
      rig.torso.quaternion.slerp(_quatA, 0.42);

      _eulerTemp.set(headRotX, headRotY - torsoRotY * 0.35, 0);
      _quatB.setFromEuler(_eulerTemp);
      rig.headGroup.quaternion.slerp(_quatB, 0.42);
    } else {
      rig.torso.rotation.set(torsoRotX, torsoRotY, 0);
      rig.headGroup.rotation.set(headRotX, headRotY - torsoRotY * 0.35, 0);
    }

    rig.leftHip.rotation.x = lHipX;
    rig.rightHip.rotation.x = rHipX;
    rig.leftKnee.rotation.x = lKneeX;
    rig.rightKnee.rotation.x = rKneeX;
    rig.leftShoulder.rotation.set(lShoX, 0, lShoZ);
    rig.rightShoulder.rotation.set(rShoX, 0, rShoZ);
    rig.leftElbow.rotation.x = lElbX;
    rig.rightElbow.rotation.x = rElbX;

    if (!rig.root.userData.userEdited) {
      rig.root.position.set(0, 0, patrol.offsetZ);
      rig.root.rotation.set(0, patrol.turnRotY, 0);
    }
  }

  // Update Motion Trail ribbon
  rig.trailLine.visible = settings.motionTrail;
  if (settings.motionTrail && (settings.playing || settings.cycleMode === 'full_cycle')) {
    rig.root.updateMatrixWorld(true);
    rig.rightHandTip.getWorldPosition(_trailWorldPos);
    const pts = rig.trailPositions;
    for (let i = TRAIL_MAX_POINTS - 1; i > 0; i--) {
      pts[i * 3 + 0] = pts[(i - 1) * 3 + 0];
      pts[i * 3 + 1] = pts[(i - 1) * 3 + 1];
      pts[i * 3 + 2] = pts[(i - 1) * 3 + 2];
    }
    pts[0] = _trailWorldPos.x;
    pts[1] = _trailWorldPos.y;
    pts[2] = _trailWorldPos.z;
    if (rig.trailCount < TRAIL_MAX_POINTS) {
      rig.trailCount++;
      if (rig.trailCount === 1) {
        for (let i = 1; i < TRAIL_MAX_POINTS; i++) {
          pts[i * 3 + 0] = _trailWorldPos.x;
          pts[i * 3 + 1] = _trailWorldPos.y;
          pts[i * 3 + 2] = _trailWorldPos.z;
        }
      }
    }
    (rig.trailLine.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
