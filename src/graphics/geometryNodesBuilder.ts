import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  BooleanCsgOp,
  GeometryNodesSettings,
  ProceduralNodeTemplate,
} from '../types/graphics';

export function createUvCheckerTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cells = 8;
    const step = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const even = (x + y) % 2 === 0;
        ctx.fillStyle = even ? '#e2e8f0' : '#1e293b';
        ctx.fillRect(x * step, y * step, step, step);
        ctx.strokeStyle = even ? 'rgba(14,165,233,0.45)' : 'rgba(56,189,248,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * step + 1, y * step + 1, step - 2, step - 2);
      }
    }
    // Colored UV orientation axes
    ctx.fillStyle = 'rgba(239, 68, 68, 0.72)';
    ctx.fillRect(0, size - 10, size, 10);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.72)';
    ctx.fillRect(0, 0, 10, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface ProceduralTemplateResult {
  meshes: THREE.Mesh[];
  disposables: Array<{ dispose: () => void }>;
}

export function createProceduralTemplateMeshes(
  template: ProceduralNodeTemplate,
  isSoftwareGl: boolean
): ProceduralTemplateResult {
  const meshes: THREE.Mesh[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  if (template === 'glass_neon') {
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      metalness: 0.05,
      roughness: 0.08,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.48 : 1.0,
      ior: 1.6,
      thickness: 1.1,
      clearcoat: 1.0,
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.15,
      metalness: 0.4,
      roughness: 0.25,
    });

    const coreGeo = new THREE.IcosahedronGeometry(0.75, 2);
    const core = new THREE.Mesh(coreGeo, glassMat);
    core.name = 'Núcleo_Vidro_Procedural';
    core.position.set(0, 1.45, 0);
    core.castShadow = !isSoftwareGl;

    const ringGeo = new THREE.TorusKnotGeometry(0.95, 0.09, 96, 16);
    const ring = new THREE.Mesh(ringGeo, neonMat);
    ring.name = 'Fita_Neon_Procedural';
    ring.position.set(0, 1.45, 0);
    ring.castShadow = !isSoftwareGl;

    meshes.push(core, ring);
    disposables.push(glassMat, neonMat, coreGeo, ringGeo);
  } else if (template === 'organic_sculpt') {
    const matA = new THREE.MeshPhysicalMaterial({
      color: 0xf97316,
      metalness: 0.18,
      roughness: 0.32,
      clearcoat: 0.55,
    });
    const matB = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      metalness: 0.12,
      roughness: 0.48,
    });

    const sphereGeo = new THREE.IcosahedronGeometry(0.82, 4);
    const pos = sphereGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const disp = 1 + 0.18 * Math.sin(x * 4.0) * Math.cos(y * 4.0) + 0.12 * Math.sin(z * 5.0);
      pos.setXYZ(i, x * disp, y * disp, z * disp);
    }
    sphereGeo.computeVertexNormals();
    const body = new THREE.Mesh(sphereGeo, matA);
    body.name = 'Escultura_Orgânica_A';
    body.position.set(-0.35, 1.45, 0);
    body.castShadow = !isSoftwareGl;

    const satGeo = new THREE.CapsuleGeometry(0.36, 0.7, 12, 24);
    const sat = new THREE.Mesh(satGeo, matB);
    sat.name = 'Núcleo_Orgânico_B';
    sat.position.set(0.45, 1.45, 0.2);
    sat.rotation.z = -0.35;
    sat.castShadow = !isSoftwareGl;

    meshes.push(body, sat);
    disposables.push(matA, matB, sphereGeo, satGeo);
  } else if (template === 'parametric_arch') {
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.35,
      roughness: 0.45,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.2,
    });

    const archGeo = new THREE.TorusGeometry(0.95, 0.22, 20, 48, Math.PI);
    const arch = new THREE.Mesh(archGeo, concreteMat);
    arch.name = 'Arco_Paramétrico_A';
    arch.position.set(0, 1.15, 0);
    arch.castShadow = !isSoftwareGl;

    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.5, 24);
    const pillar = new THREE.Mesh(pillarGeo, brassMat);
    pillar.name = 'Coluna_Paramétrica_B';
    pillar.position.set(0.42, 1.15, 0.22);
    pillar.castShadow = !isSoftwareGl;

    meshes.push(arch, pillar);
    disposables.push(concreteMat, brassMat, archGeo, pillarGeo);
  } else {
    // holo_grid
    const holoMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0d9488,
      emissiveIntensity: 0.65,
      metalness: 0.65,
      roughness: 0.22,
      wireframe: false,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.85,
      roughness: 0.2,
    });

    const boxGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15, 4, 4, 4);
    const box = new THREE.Mesh(boxGeo, holoMat);
    box.name = 'Cubo_Holográfico_A';
    box.position.set(-0.28, 1.45, 0);
    box.rotation.set(0.35, 0.55, 0.15);
    box.castShadow = !isSoftwareGl;

    const octGeo = new THREE.OctahedronGeometry(0.78, 1);
    const oct = new THREE.Mesh(octGeo, frameMat);
    oct.name = 'Prisma_Holográfico_B';
    oct.position.set(0.42, 1.45, 0.25);
    oct.castShadow = !isSoftwareGl;

    meshes.push(box, oct);
    disposables.push(holoMat, frameMat, boxGeo, octGeo);
  }

  return { meshes, disposables };
}

export function evaluateMoGraphTransform(
  index: number,
  total: number,
  t: number,
  cfg: GeometryNodesSettings,
  outPos: THREE.Vector3,
  outEuler: THREE.Euler,
  outScale: THREE.Vector3
): void {
  const ratio = total > 1 ? index / total : 0;
  const phase = ratio * Math.PI * 2;
  const animT = t * Math.max(0.05, cfg.speed);
  const strength = cfg.strength;

  if (cfg.distribution === 'radial') {
    const r = cfg.spacing * 1.45;
    outPos.set(Math.cos(phase + animT * 0.25) * r, 1.45, Math.sin(phase + animT * 0.25) * r);
    outEuler.set(0, -phase - animT * 0.25, 0);
  } else if (cfg.distribution === 'grid') {
    const side = Math.max(2, Math.ceil(Math.sqrt(total)));
    const row = Math.floor(index / side);
    const col = index % side;
    const step = cfg.spacing * 0.72;
    const half = ((side - 1) * step) / 2;
    outPos.set(col * step - half, 1.35, row * step - half);
    outEuler.set(0, 0, 0);
  } else {
    // helix
    const turns = 2.5;
    const helixAngle = ratio * Math.PI * 2 * turns + animT * 0.4;
    const r = cfg.spacing * 0.95;
    outPos.set(Math.cos(helixAngle) * r, 0.45 + ratio * 2.4, Math.sin(helixAngle) * r);
    outEuler.set(0, -helixAngle, 0);
  }

  let s = 1.0;
  if (cfg.effector === 'wave') {
    const wave = Math.sin(phase * 2.0 + animT * 2.4) * 0.45 * strength;
    outPos.y += wave;
    outEuler.x += wave * 0.6;
    s = 1 + wave * 0.25;
  } else if (cfg.effector === 'spiral') {
    const spin = animT * 1.5 + phase * 1.5;
    outPos.x += Math.cos(spin) * 0.25 * strength;
    outPos.z += Math.sin(spin) * 0.25 * strength;
    outEuler.y += spin * 0.8;
    outEuler.z += Math.sin(spin) * 0.4 * strength;
  } else if (cfg.effector === 'fracture') {
    const jitter = Math.sin(index * 12.9898 + animT * 1.6);
    const push = (0.2 + Math.abs(jitter) * 0.55) * strength;
    const dirLen = Math.hypot(outPos.x, outPos.z) || 1;
    outPos.x += (outPos.x / dirLen) * push;
    outPos.z += (outPos.z / dirLen) * push;
    outPos.y += Math.cos(index * 7.23 + animT) * 0.35 * strength;
    outEuler.set(jitter * strength, index * 0.7 + animT * 0.5, -jitter * strength);
  } else {
    // pulse
    const pulse = 0.5 + 0.5 * Math.sin(animT * 3.0 - ratio * Math.PI * 2);
    s = 0.65 + pulse * 0.65 * Math.max(0.4, strength);
    outPos.y += pulse * 0.22 * strength;
  }

  const clampedScale = Math.max(0.25, s);
  outScale.set(clampedScale, clampedScale, clampedScale);
}

// === WATER-TIGHT SURFACE NETS BOOLEAN CSG ===

interface TriList {
  verts: Float32Array; // 9 floats per triangle in world space
  count: number;
}

function extractWorldTriangles(mesh: THREE.Mesh): TriList {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex();
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  const verts = new Float32Array(triCount * 9);
  const v = new THREE.Vector3();

  for (let i = 0; i < triCount; i++) {
    const i0 = idx ? idx.getX(i * 3) : i * 3;
    const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;

    v.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
    verts[i * 9 + 0] = v.x;
    verts[i * 9 + 1] = v.y;
    verts[i * 9 + 2] = v.z;

    v.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
    verts[i * 9 + 3] = v.x;
    verts[i * 9 + 4] = v.y;
    verts[i * 9 + 5] = v.z;

    v.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
    verts[i * 9 + 6] = v.x;
    verts[i * 9 + 7] = v.y;
    verts[i * 9 + 8] = v.z;
  }

  return { verts, count: triCount };
}

function rasterizeInsideGrid(
  tris: TriList,
  minX: number,
  minY: number,
  minZ: number,
  dx: number,
  dy: number,
  dz: number,
  N: number
): Uint8Array {
  const inside = new Uint8Array(N * N * N);
  // Preallocate intersection buckets per (ix, iy) column
  const columns: number[][] = Array.from({ length: N * N }, () => []);

  const eps = 1e-6;
  for (let t = 0; t < tris.count; t++) {
    const o = t * 9;
    const ax = tris.verts[o];
    const ay = tris.verts[o + 1];
    const az = tris.verts[o + 2];
    const bx = tris.verts[o + 3];
    const by = tris.verts[o + 4];
    const bz = tris.verts[o + 5];
    const cx = tris.verts[o + 6];
    const cy = tris.verts[o + 7];
    const cz = tris.verts[o + 8];

    const tMinX = Math.min(ax, bx, cx);
    const tMaxX = Math.max(ax, bx, cx);
    const tMinY = Math.min(ay, by, cy);
    const tMaxY = Math.max(ay, by, cy);

    const ix0 = Math.max(0, Math.floor((tMinX - minX) / dx));
    const ix1 = Math.min(N - 1, Math.ceil((tMaxX - minX) / dx));
    const iy0 = Math.max(0, Math.floor((tMinY - minY) / dy));
    const iy1 = Math.min(N - 1, Math.ceil((tMaxY - minY) / dy));

    const e1x = bx - ax;
    const e1y = by - ay;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const denom = e1x * e2y - e1y * e2x;
    if (Math.abs(denom) < 1e-10) continue;
    const invDenom = 1 / denom;

    for (let iy = iy0; iy <= iy1; iy++) {
      // Slight sub-cell jitter prevents exact vertex/edge hits
      const py = minY + iy * dy + dy * 0.00137;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = minX + ix * dx + dx * 0.00173;
        const rx = px - ax;
        const ry = py - ay;
        const u = (rx * e2y - ry * e2x) * invDenom;
        if (u < -eps || u > 1 + eps) continue;
        const v = (e1x * ry - e1y * rx) * invDenom;
        if (v < -eps || u + v > 1 + eps) continue;
        const hitZ = az + u * (bz - az) + v * (cz - az);
        columns[iy * N + ix].push(hitZ);
      }
    }
  }

  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const zHits = columns[iy * N + ix];
      if (zHits.length < 2) continue;
      zHits.sort((a, b) => a - b);
      let parity = 0;
      let hitIdx = 0;
      for (let iz = 0; iz < N; iz++) {
        const pz = minZ + iz * dz;
        while (hitIdx < zHits.length && zHits[hitIdx] <= pz) {
          parity ^= 1;
          hitIdx++;
        }
        if (parity === 1) {
          inside[(iz * N + iy) * N + ix] = 1;
        }
      }
    }
  }

  return inside;
}

export function performMeshBooleanCsg(
  meshA: THREE.Mesh,
  meshB: THREE.Mesh,
  op: BooleanCsgOp
): THREE.BufferGeometry | null {
  const trisA = extractWorldTriangles(meshA);
  const trisB = extractWorldTriangles(meshB);
  if (trisA.count === 0 || trisB.count === 0) return null;

  const boxA = new THREE.Box3().setFromObject(meshA);
  const boxB = new THREE.Box3().setFromObject(meshB);
  const unionBox = boxA.clone().union(boxB);
  const size = unionBox.getSize(new THREE.Vector3());
  const pad = Math.max(size.x, size.y, size.z, 0.25) * 0.1;
  unionBox.expandByScalar(pad);

  const N = 36;
  const minX = unionBox.min.x;
  const minY = unionBox.min.y;
  const minZ = unionBox.min.z;
  const totalSize = unionBox.getSize(new THREE.Vector3());
  const dx = totalSize.x / (N - 1);
  const dy = totalSize.y / (N - 1);
  const dz = totalSize.z / (N - 1);

  const insideA = rasterizeInsideGrid(trisA, minX, minY, minZ, dx, dy, dz, N);
  const insideB = rasterizeInsideGrid(trisB, minX, minY, minZ, dx, dy, dz, N);

  const totalCells = N * N * N;
  let field = new Float32Array(totalCells);
  let activeCount = 0;

  for (let i = 0; i < totalCells; i++) {
    const a = insideA[i] === 1;
    const b = insideB[i] === 1;
    const keep = op === 'union' ? a || b : op === 'subtract' ? a && !b : a && b;
    if (keep) activeCount++;
    // Negative inside, positive outside
    field[i] = keep ? -1.0 : 1.0;
  }

  if (activeCount === 0) return null;

  // 2 passes of 6-neighbor Laplacian smoothing for crisp smooth isosurface
  const temp = new Float32Array(totalCells);
  const idxOf = (x: number, y: number, z: number) => (z * N + y) * N + x;
  for (let pass = 0; pass < 2; pass++) {
    temp.set(field);
    for (let z = 1; z < N - 1; z++) {
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = idxOf(x, y, z);
          const avg =
            (field[i - 1] +
              field[i + 1] +
              field[i - N] +
              field[i + N] +
              field[i - N * N] +
              field[i + N * N]) /
            6;
          temp[i] = field[i] * 0.45 + avg * 0.55;
        }
      }
    }
    field.set(temp);
  }

  // Surface Nets extraction
  const cellVertIndex = new Int32Array(totalCells).fill(-1);
  const vertices: number[] = [];

  const cornerOffsets = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const cubeEdges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  const cVals = new Float32Array(8);
  for (let z = 0; z < N - 1; z++) {
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const co = cornerOffsets[c];
          const val = field[idxOf(x + co[0], y + co[1], z + co[2])];
          cVals[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        for (let e = 0; e < 12; e++) {
          const a = cubeEdges[e][0];
          const b = cubeEdges[e][1];
          const va = cVals[a];
          const vb = cVals[b];
          if ((va < 0) !== (vb < 0)) {
            const t = va / (va - vb);
            const ca = cornerOffsets[a];
            const cb = cornerOffsets[b];
            sx += ca[0] + t * (cb[0] - ca[0]);
            sy += ca[1] + t * (cb[1] - ca[1]);
            sz += ca[2] + t * (cb[2] - ca[2]);
            crossings++;
          }
        }
        if (crossings === 0) continue;
        const inv = 1 / crossings;
        const vx = minX + (x + sx * inv) * dx;
        const vy = minY + (y + sy * inv) * dy;
        const vz = minZ + (z + sz * inv) * dz;

        const vIdx = vertices.length / 3;
        vertices.push(vx, vy, vz);
        cellVertIndex[idxOf(x, y, z)] = vIdx;
      }
    }
  }

  if (vertices.length === 0) return null;

  const indices: number[] = [];
  const emitQuad = (v0: number, v1: number, v2: number, v3: number, flip: boolean) => {
    if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) return;
    if (!flip) {
      indices.push(v0, v1, v2, v0, v2, v3);
    } else {
      indices.push(v0, v2, v1, v0, v3, v2);
    }
  };

  for (let z = 1; z < N - 1; z++) {
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const val0 = field[idxOf(x, y, z)];
        const in0 = val0 < 0;

        // X-edge: (x,y,z) -> (x+1,y,z)
        if (x < N - 2) {
          const in1 = field[idxOf(x + 1, y, z)] < 0;
          if (in0 !== in1) {
            emitQuad(
              cellVertIndex[idxOf(x, y - 1, z - 1)],
              cellVertIndex[idxOf(x, y, z - 1)],
              cellVertIndex[idxOf(x, y, z)],
              cellVertIndex[idxOf(x, y - 1, z)],
              !in0
            );
          }
        }
        // Y-edge: (x,y,z) -> (x,y+1,z)
        if (y < N - 2) {
          const in1 = field[idxOf(x, y + 1, z)] < 0;
          if (in0 !== in1) {
            emitQuad(
              cellVertIndex[idxOf(x - 1, y, z - 1)],
              cellVertIndex[idxOf(x - 1, y, z)],
              cellVertIndex[idxOf(x, y, z)],
              cellVertIndex[idxOf(x, y, z - 1)],
              !in0
            );
          }
        }
        // Z-edge: (x,y,z) -> (x,y,z+1)
        if (z < N - 2) {
          const in1 = field[idxOf(x, y, z + 1)] < 0;
          if (in0 !== in1) {
            emitQuad(
              cellVertIndex[idxOf(x - 1, y - 1, z)],
              cellVertIndex[idxOf(x, y - 1, z)],
              cellVertIndex[idxOf(x, y, z)],
              cellVertIndex[idxOf(x - 1, y, z)],
              !in0
            );
          }
        }
      }
    }
  }

  if (indices.length === 0) return null;

  const rawGeo = new THREE.BufferGeometry();
  rawGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  rawGeo.setIndex(indices);

  // Recenter geometry around its local centroid so mesh.position holds world center
  rawGeo.computeBoundingBox();
  const center = new THREE.Vector3();
  rawGeo.boundingBox?.getCenter(center);
  rawGeo.translate(-center.x, -center.y, -center.z);

  const welded = mergeVertices(rawGeo, 1e-4);
  rawGeo.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  welded.userData.csgWorldCenter = center;
  return welded;
}
