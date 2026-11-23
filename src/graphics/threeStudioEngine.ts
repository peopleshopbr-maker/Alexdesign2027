import { unzipSync, zipSync } from 'fflate';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type {
  AnimationActionCycle,
  AnimationSettings,
  AutoRigPreset,
  BooleanCsgOp,
  CameraPreset,
  ExportCaptureResolution,
  HumanoidJointMarkerId,
  LodTelemetry,
  MaterialFinish,
  MaterialPresetId,
  MeshDeformationType,
  PbrTextureSlot,
  PrimitiveShape,
  ProceduralNodeTemplate,
  PropSocketType,
  RenderMetrics,
  RenderSettings,
  RigExportProfile,
  SceneOutlinerItem,
  SelectedObjectInfo,
  ShaderCompileResult,
  ViewportCompareMode,
  WeightPaintSettings,
} from '../types/graphics';
import {
  type BlenderSceneSyncExtras,
  createBlender53ZipBundle,
  generateBlender53PythonScript,
} from '../services/blenderExporter';
import type { RustSceneData, RustVfxEmitterSpec } from '../services/rustEngine';
import {
  applyProceduralPoseToSkeleton,
  applyRigProfileNaming,
  autoRigObject,
  captureSkeletonMap,
  computeDefaultJointMarkers,
  computePatrolBackAndForth,
  createPropSocketMesh,
  createRiggedHumanoidTemplate,
  disableWeightHeatmapOnRoot,
  findMirrorBoneName,
  paintSkinWeightStroke,
  refreshWeightHeatmapOnRoot,
  resetSkeletonToRestPose,
  retargetAnimationClipToRig,
  type CustomJointMarkers,
  type SkeletonRigMap,
} from './autoRiggingAndRetarget';
import {
  createProceduralTemplateMeshes,
  createUvCheckerTexture,
  evaluateMoGraphTransform,
  performMeshBooleanCsg,
} from './geometryNodesBuilder';
import { detectSoftwareWebGL } from './gpuProbe';
import {
  applyMeshDeformation,
  applySculptBrushStroke,
  type ArticulatedRig,
  createArticulatedCharacterRig,
  createPrimitiveSculptGeometry,
  createSculptMatcapTexture,
  subdivideGeometry4x,
  updateCharacterRigAnimation,
} from './sculptAndRigBuilder';
import { GLSL_HARMONIC_FRAGMENT, GLSL_HARMONIC_VERTEX } from './shaders';

type SceneUndoCommand =
  | {
      kind: 'transform';
      label: string;
      object: THREE.Object3D;
      prevPos: THREE.Vector3;
      prevQuat: THREE.Quaternion;
      prevScale: THREE.Vector3;
      nextPos: THREE.Vector3;
      nextQuat: THREE.Quaternion;
      nextScale: THREE.Vector3;
    }
  | {
      kind: 'geometry';
      label: string;
      mesh: THREE.Mesh;
      prevPositions: Float32Array;
      nextPositions: Float32Array;
    }
  | {
      kind: 'delete';
      label: string;
      object: THREE.Object3D;
      parent: THREE.Object3D;
      index: number;
      wasSculptMesh: boolean;
      wasNodeMesh: boolean;
    }
  | {
      kind: 'create';
      label: string;
      items: Array<{
        object: THREE.Object3D;
        parent: THREE.Object3D;
        isSculptMesh: boolean;
        isNodeMesh: boolean;
      }>;
    }
  | {
      kind: 'property';
      label: string;
      mesh: THREE.Mesh;
      prev: {
        visible: boolean;
        frustumCulled: boolean;
        wireframe: boolean;
        colorHex?: string;
        metalness?: number;
        roughness?: number;
        emissiveHex?: string;
        emissiveIntensity?: number;
        opacity?: number;
        transparent?: boolean;
      };
      next: {
        visible: boolean;
        frustumCulled: boolean;
        wireframe: boolean;
        colorHex?: string;
        metalness?: number;
        roughness?: number;
        emissiveHex?: string;
        emissiveIntensity?: number;
        opacity?: number;
        transparent?: boolean;
      };
    };

// Zero-GC reusable math helpers outside the render loop
const _mat4 = new THREE.Matrix4();
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _box3 = new THREE.Box3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();
const _worldPos = new THREE.Vector3();
const _deltaVec = new THREE.Vector3();
const _normalVec = new THREE.Vector3();
const _cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
const _cursorWorld = new THREE.Vector3(0, 0.9, 0);

const MAX_INSTANCES = 20000;
const PHYSICS_BALL_COUNT = 6;
const PHYSICS_PARTICLE_COUNT = 400;
const SCENE_BG = 0x080a0f;

const CinematicPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.03 },
    uChromatic: { value: 0.002 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uChromatic;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      vec2 offset = dir * uChromatic * dist;

      float r = texture2D(tDiffuse, vUv - offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + offset).b;

      vec3 col = vec3(r, g, b);
      float grain = (rand(vUv * 400.0 + fract(uTime * 13.7)) - 0.5) * uGrain;
      col += grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

interface FinishPreset {
  primaryColor: number;
  primaryMetalness: number;
  primaryRoughness: number;
  secondaryColor: number;
  secondaryMetalness: number;
  secondaryRoughness: number;
  accentColor: number;
  coreColor: number;
  anisotropy: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence?: number;
  iridescenceIOR?: number;
  transmissive?: boolean;
  ior?: number;
  dispersion?: number;
}

const FINISH_PRESETS: Record<MaterialFinish, FinishPreset> = {
  titanium: {
    primaryColor: 0xbac4d4,
    primaryMetalness: 0.94,
    primaryRoughness: 0.22,
    secondaryColor: 0x222938,
    secondaryMetalness: 0.45,
    secondaryRoughness: 0.62,
    accentColor: 0x38bdf8,
    coreColor: 0x7dd3fc,
    anisotropy: 0.85,
    clearcoat: 0.25,
    clearcoatRoughness: 0.2,
  },
  cobalt: {
    primaryColor: 0x2563eb,
    primaryMetalness: 0.88,
    primaryRoughness: 0.24,
    secondaryColor: 0x161c26,
    secondaryMetalness: 0.35,
    secondaryRoughness: 0.68,
    accentColor: 0xf59e0b,
    coreColor: 0x60a5fa,
    anisotropy: 0.72,
    clearcoat: 0.4,
    clearcoatRoughness: 0.18,
  },
  gold: {
    primaryColor: 0xeab308,
    primaryMetalness: 0.96,
    primaryRoughness: 0.18,
    secondaryColor: 0x1e1b18,
    secondaryMetalness: 0.3,
    secondaryRoughness: 0.72,
    accentColor: 0xf97316,
    coreColor: 0xfde047,
    anisotropy: 0.9,
    clearcoat: 0.35,
    clearcoatRoughness: 0.12,
  },
  crystal: {
    primaryColor: 0xe2e8f0,
    primaryMetalness: 0.15,
    primaryRoughness: 0.08,
    secondaryColor: 0x1e293b,
    secondaryMetalness: 0.75,
    secondaryRoughness: 0.48,
    accentColor: 0x2dd4bf,
    coreColor: 0xa5f3fc,
    anisotropy: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transmissive: true,
    ior: 1.65,
    dispersion: 0.45,
  },
  copper: {
    primaryColor: 0xd97745,
    primaryMetalness: 0.95,
    primaryRoughness: 0.24,
    secondaryColor: 0x2a1d17,
    secondaryMetalness: 0.55,
    secondaryRoughness: 0.58,
    accentColor: 0xfbbf24,
    coreColor: 0xfb923c,
    anisotropy: 0.88,
    clearcoat: 0.22,
    clearcoatRoughness: 0.22,
  },
  bronze: {
    primaryColor: 0x9a6b38,
    primaryMetalness: 0.9,
    primaryRoughness: 0.34,
    secondaryColor: 0x231d16,
    secondaryMetalness: 0.48,
    secondaryRoughness: 0.65,
    accentColor: 0xf59e0b,
    coreColor: 0xd97706,
    anisotropy: 0.75,
    clearcoat: 0.18,
    clearcoatRoughness: 0.28,
  },
  chrome: {
    primaryColor: 0xf1f5f9,
    primaryMetalness: 1.0,
    primaryRoughness: 0.05,
    secondaryColor: 0x0f172a,
    secondaryMetalness: 0.7,
    secondaryRoughness: 0.35,
    accentColor: 0x38bdf8,
    coreColor: 0xe0f2fe,
    anisotropy: 0.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.04,
  },
  obsidian: {
    primaryColor: 0x14161d,
    primaryMetalness: 0.28,
    primaryRoughness: 0.12,
    secondaryColor: 0x090a0f,
    secondaryMetalness: 0.15,
    secondaryRoughness: 0.78,
    accentColor: 0xa855f7,
    coreColor: 0xc084fc,
    anisotropy: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  },
  ceramic: {
    primaryColor: 0xf5f2eb,
    primaryMetalness: 0.04,
    primaryRoughness: 0.18,
    secondaryColor: 0x475569,
    secondaryMetalness: 0.25,
    secondaryRoughness: 0.55,
    accentColor: 0x0ea5e9,
    coreColor: 0xbae6fd,
    anisotropy: 0.0,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
  },
  crimson: {
    primaryColor: 0xdc2626,
    primaryMetalness: 0.72,
    primaryRoughness: 0.16,
    secondaryColor: 0x18181b,
    secondaryMetalness: 0.4,
    secondaryRoughness: 0.6,
    accentColor: 0xfb7185,
    coreColor: 0xf43f5e,
    anisotropy: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  },
  emerald: {
    primaryColor: 0x10b981,
    primaryMetalness: 0.12,
    primaryRoughness: 0.09,
    secondaryColor: 0x0f2922,
    secondaryMetalness: 0.65,
    secondaryRoughness: 0.45,
    accentColor: 0x34d399,
    coreColor: 0x6ee7b7,
    anisotropy: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transmissive: true,
    ior: 1.58,
  },
  iridescent: {
    primaryColor: 0x312e81,
    primaryMetalness: 0.85,
    primaryRoughness: 0.16,
    secondaryColor: 0x17152b,
    secondaryMetalness: 0.6,
    secondaryRoughness: 0.45,
    accentColor: 0xe879f9,
    coreColor: 0x22d3ee,
    anisotropy: 0.6,
    clearcoat: 1.0,
    clearcoatRoughness: 0.07,
    iridescence: 1.0,
    iridescenceIOR: 1.42,
  },
};

function createBrushedMetalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const lum = 112 + Math.floor(Math.sin(y * 1.7) * 18 + ((y * 37) % 24));
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, 256, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCalibrationGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 1.5;
    for (const r of [110, 175, 238]) {
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const inner = i % 3 === 0 ? 175 : 224;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(a) * inner, 256 + Math.sin(a) * inner);
      ctx.lineTo(256 + Math.cos(a) * 238, 256 + Math.sin(a) * 238);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export class ThreeStudioEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private gpuRendererString: string;

  private settings: RenderSettings;
  private onMetrics: (metrics: RenderMetrics) => void;
  private onContextStatus?: (lost: boolean) => void;
  private onSelectionChange?: (info: SelectedObjectInfo | null) => void;
  private onSculptStateChange?: (meshCount: number, undoCount: number) => void;
  private onAnimationFrameChange?: (frame: number) => void;
  private onNodesStateChange?: (meshCount: number) => void;
  private onUndoRedoChange?: (undoCount: number, redoCount: number) => void;
  private onOutlinerChange?: (items: SceneOutlinerItem[]) => void;
  private onCameraQuaternionChange?: (quat: [number, number, number, number]) => void;
  private lastReportedCamQuat: [number, number, number, number] = [0, 0, 0, 1];

  // Scene mode containers
  private pbrGroup = new THREE.Group();
  private instancedGroup = new THREE.Group();
  private shaderGroup = new THREE.Group();
  private gltfGroup = new THREE.Group();
  private physicsGroup = new THREE.Group();
  private sculptGroup = new THREE.Group();
  private nodesGroup = new THREE.Group();
  private animationGroup = new THREE.Group();

  // Lights & ground contact shadow for staging / Bake AO
  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private softboxA: THREE.RectAreaLight | null = null;
  private softboxB: THREE.RectAreaLight | null = null;
  private contactShadowMat!: THREE.MeshBasicMaterial;
  private stageGroundMeshes: THREE.Object3D[] = [];
  private deletedBuiltinNames = new Set<string>();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTimeoutId: number | null = null;
  private recordingPrevAutoOrbit: boolean | null = null;

  // Viewport Shading & Comparison override materials
  private shadeMatChrome!: THREE.MeshStandardMaterial;
  private shadeMatNormals!: THREE.MeshNormalMaterial;
  private shadeMatUv!: THREE.MeshStandardMaterial;
  private shadeMatCel!: THREE.MeshToonMaterial;
  private compareWireMat!: THREE.MeshBasicMaterial;
  private viewportCompareMode: ViewportCompareMode = 'off';

  // Weight Paint 3D state
  private weightPaintSettings: WeightPaintSettings = {
    active: false,
    selectedBoneName: 'Pelvis',
    brushMode: 'add',
    brushRadius: 0.25,
    strength: 0.5,
    symmetryX: true,
  };
  private isPaintingWeights = false;

  // Geometry Nodes / MoGraph state
  private nodesHeroGroup = new THREE.Group();
  private nodesHeroMeshes: THREE.Mesh[] = [];
  private moGraphContainer = new THREE.Group();
  private moGraphClones: THREE.Mesh[] = [];
  private customNodeMeshes: THREE.Mesh[] = [];
  private customNodeGroups: THREE.Object3D[] = [];
  private nodesTemplateApplied = false;
  private nodeTemplateDisposables: Array<{ dispose: () => void }> = [];
  private nodeCounter = 0;

  // Unified Global Scene Undo / Redo Stack
  private sceneUndoStack: SceneUndoCommand[] = [];
  private sceneRedoStack: SceneUndoCommand[] = [];
  private gizmoDragStart: {
    object: THREE.Object3D;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
  } | null = null;
  private activeSculptStrokeStart: {
    mesh: THREE.Mesh;
    positions: Float32Array;
  } | null = null;

  // Sculpting & Modeling 3D state
  private sculptMatcapRedWax!: THREE.MeshMatcapMaterial;
  private sculptMatcapClay!: THREE.MeshMatcapMaterial;
  private sculptBaseMesh!: THREE.Mesh;
  private sculptBrushCursor!: THREE.Mesh;
  private sculptMeshes: THREE.Mesh[] = [];
  private activeSculptMesh: THREE.Mesh | null = null;
  private isSculpting = false;
  private transformControls!: TransformControls;
  private sculptCounter = 2;

  // Animation 3D Rig state
  private rig!: ArticulatedRig;
  private animFrameFloat = 1;
  private lastReportedAnimFrame = 1;

  // PBR sub-parts
  private outerGimbal = new THREE.Group();
  private middleGimbal = new THREE.Group();
  private innerRotor = new THREE.Group();
  private crystalCore!: THREE.Mesh;
  private filamentMesh!: THREE.Mesh;
  private statorBlades!: THREE.InstancedMesh;
  private perimeterBolts!: THREE.InstancedMesh;
  private primaryMat!: THREE.MeshPhysicalMaterial;
  private secondaryMat!: THREE.MeshStandardMaterial;
  private accentMat!: THREE.MeshStandardMaterial;
  private crystalMat!: THREE.MeshPhysicalMaterial;

  // Instanced field
  private instancedField!: THREE.InstancedMesh;
  private instancePhases = new Float32Array(MAX_INSTANCES);
  private instanceRadii = new Float32Array(MAX_INSTANCES);

  // Shader mode objects
  private harmonicMaterial!: THREE.ShaderMaterial;
  private shaderRingMat!: THREE.MeshStandardMaterial;
  private harmonicSphere!: THREE.Mesh;
  private shaderRingA!: THREE.Mesh;
  private shaderRingB!: THREE.Mesh;

  // glTF & Multi-LOD objects (Hero GLB persists across all studio modes)
  private activeHeroGltfGroup = new THREE.Group();
  private lodNodes: THREE.LOD[] = [];
  private lodDefaultContainer = new THREE.Group();
  private loadedGltfRoot: THREE.Object3D | null = null;
  private loadedModelName: string | null = null;
  private loadedMeshCount = 0;
  private gltfMixer: THREE.AnimationMixer | null = null;
  private gltfClips: THREE.AnimationClip[] = [];
  private gltfActiveAction: THREE.AnimationAction | null = null;
  private gltfActiveClipIndex = 0;
  private gltfBasePos = new THREE.Vector3();
  private gltfBaseRot = new THREE.Euler();
  private gltfBaseScale = new THREE.Vector3(1, 1, 1);
  private gltfSyncedToSculpt = false;
  private gltfRigMap: SkeletonRigMap | null = null;
  private gltfSkeletonHelper: THREE.SkeletonHelper | null = null;
  private gltfIsAutoRigged = false;
  private jointMarkerGroup = new THREE.Group();
  private jointMarkerMeshes = new Map<HumanoidJointMarkerId, THREE.Mesh>();
  private jointMarkerSymmetry = true;
  private jointMarkersActive = false;
  private propSocketGroup: THREE.Group | null = null;
  private propSocketDisposables: Array<{ dispose: () => void }> = [];
  private activePropType: PropSocketType = 'none';
  private skinnedHarmonicMaterial: THREE.ShaderMaterial | null = null;
  private currentGlslVs = GLSL_HARMONIC_VERTEX;
  private currentGlslFs = GLSL_HARMONIC_FRAGMENT;

  // Physics & cursor-reactive particles
  private physicsBodies: Array<{
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    radius: number;
    mass: number;
  }> = [];
  private physicsParticles!: THREE.Points;
  private physicsParticlePositions = new Float32Array(PHYSICS_PARTICLE_COUNT * 3);
  private physicsParticleVelocities = new Float32Array(PHYSICS_PARTICLE_COUNT * 3);
  private cursorBeacon!: THREE.Mesh;
  private cursorActive = false;

  // Post-processing (EffectComposer)
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bokehPass: BokehPass | null = null;
  private cinematicPass: ShaderPass | null = null;

  // Object selection & Raycasting
  private raycaster = new THREE.Raycaster();
  private selectedMesh: THREE.Mesh | null = null;
  private selectionHelper: THREE.BoxHelper | null = null;
  private pointerDownPos = { x: 0, y: 0 };
  private resizeObserver: ResizeObserver | null = null;

  // Disposable resources
  private disposables: Array<{ dispose: () => void }> = [];
  private gltfDisposables: Array<{ dispose: () => void }> = [];
  private envMap: THREE.Texture | null = null;

  // Loop & state
  private frameId = 0;
  private disposed = false;
  private isExportingSequence = false;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private currentExplosion = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private autoOrbit = true;
  private autoQuality = true;
  private qualityScale = 1;
  private cameraTransitionActive = false;

  constructor(
    container: HTMLElement,
    initialSettings: RenderSettings,
    onMetrics: (metrics: RenderMetrics) => void,
    onContextStatus?: (lost: boolean) => void,
    onSelectionChange?: (info: SelectedObjectInfo | null) => void,
    onSculptStateChange?: (meshCount: number, undoCount: number) => void,
    onAnimationFrameChange?: (frame: number) => void,
    onNodesStateChange?: (meshCount: number) => void,
    onUndoRedoChange?: (undoCount: number, redoCount: number) => void,
    onOutlinerChange?: (items: SceneOutlinerItem[]) => void,
    onCameraQuaternionChange?: (quat: [number, number, number, number]) => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onMetrics = onMetrics;
    this.onContextStatus = onContextStatus;
    this.onSelectionChange = onSelectionChange;
    this.onSculptStateChange = onSculptStateChange;
    this.onAnimationFrameChange = onAnimationFrameChange;
    this.onNodesStateChange = onNodesStateChange;
    this.onUndoRedoChange = onUndoRedoChange;
    this.onOutlinerChange = onOutlinerChange;
    this.onCameraQuaternionChange = onCameraQuaternionChange;
    this.animFrameFloat = initialSettings.animation.currentFrame;
    this.lastReportedAnimFrame = initialSettings.animation.currentFrame;

    const probe = detectSoftwareWebGL();
    this.isSoftwareGl = probe.isSoftware;
    this.gpuRendererString = probe.renderer;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setSize(w, h);
    this.renderer.domElement.className = 'w-full h-full block touch-none cursor-grab active:cursor-grabbing';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_BG);
    this.scene.fog = new THREE.FogExp2(SCENE_BG, 0.024);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 120);
    this.camera.position.set(5.4, 3.6, 6.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 32;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 1.35, 0);
    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
    });

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      const dragging = Boolean(event.value);
      this.controls.enabled = !dragging;
      if (dragging && this.selectedMesh) {
        this.gizmoDragStart = {
          object: this.selectedMesh,
          pos: this.selectedMesh.position.clone(),
          quat: this.selectedMesh.quaternion.clone(),
          scale: this.selectedMesh.scale.clone(),
        };
      } else if (!dragging && this.gizmoDragStart) {
        const obj = this.gizmoDragStart.object;
        const moved =
          obj.position.distanceToSquared(this.gizmoDragStart.pos) > 1e-6 ||
          1 - Math.abs(obj.quaternion.dot(this.gizmoDragStart.quat)) > 1e-6 ||
          obj.scale.distanceToSquared(this.gizmoDragStart.scale) > 1e-6;
        if (moved) {
          obj.userData.userEdited = true;
          if (obj === this.loadedGltfRoot) {
            this.gltfBasePos.copy(obj.position);
            this.gltfBaseRot.copy(obj.rotation);
            this.gltfBaseScale.copy(obj.scale);
          }
          this.pushSceneUndo({
            kind: 'transform',
            label: `Transformar ${obj.name || 'Objeto'}`,
            object: obj,
            prevPos: this.gizmoDragStart.pos,
            prevQuat: this.gizmoDragStart.quat,
            prevScale: this.gizmoDragStart.scale,
            nextPos: obj.position.clone(),
            nextQuat: obj.quaternion.clone(),
            nextScale: obj.scale.clone(),
          });
        }
        this.gizmoDragStart = null;
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      const attached = this.transformControls.object;
      if (attached && attached === this.loadedGltfRoot) {
        this.gltfBasePos.copy(this.loadedGltfRoot.position);
        this.gltfBaseRot.copy(this.loadedGltfRoot.rotation);
        this.gltfBaseScale.copy(this.loadedGltfRoot.scale);
        this.loadedGltfRoot.userData.userEdited = true;
        this.selectionHelper?.update();
        if (this.selectedMesh) {
          this.emitSelectionInfo(this.selectedMesh);
        }
        return;
      }
      if (this.selectedMesh) {
        if (this.selectedMesh.userData.jointMarkerId && this.jointMarkerSymmetry) {
          const id = this.selectedMesh.userData.jointMarkerId as HumanoidJointMarkerId;
          const mirrorMap: Partial<Record<HumanoidJointMarkerId, HumanoidJointMarkerId>> = {
            shoulderL: 'shoulderR',
            shoulderR: 'shoulderL',
            elbowL: 'elbowR',
            elbowR: 'elbowL',
            wristL: 'wristR',
            wristR: 'wristL',
            kneeL: 'kneeR',
            kneeR: 'kneeL',
            ankleL: 'ankleR',
            ankleR: 'ankleL',
          };
          const mirrorId = mirrorMap[id];
          if (mirrorId) {
            const partner = this.jointMarkerMeshes.get(mirrorId);
            if (partner) {
              partner.position.set(
                -this.selectedMesh.position.x,
                this.selectedMesh.position.y,
                this.selectedMesh.position.z
              );
            }
          }
        } else {
          this.selectedMesh.userData.userEdited = true;
        }
        this.selectionHelper?.update();
        this.emitSelectionInfo(this.selectedMesh);
      }
    });
    const gizmoHelper = this.transformControls.getHelper();
    gizmoHelper.userData.nonSelectable = true;
    gizmoHelper.traverse((obj) => {
      obj.userData.nonSelectable = true;
    });
    this.scene.add(gizmoHelper);
    this.jointMarkerGroup.visible = false;
    this.scene.add(this.jointMarkerGroup);

    this.setupEnvironmentAndLights();
    this.setupGround();
    this.buildPbrAssembly();
    this.buildInstancedField();
    this.buildShaderScene();
    this.buildDefaultLodAssembly();
    this.buildPhysicsScene();
    this.buildSculptScene();
    this.buildNodesScene();
    this.buildAnimationScene();
    this.setupShadingMaterials();
    this.setupPostProcessing(w, h);

    this.scene.add(this.pbrGroup);
    this.scene.add(this.instancedGroup);
    this.scene.add(this.shaderGroup);
    this.scene.add(this.gltfGroup);
    this.scene.add(this.physicsGroup);
    this.scene.add(this.sculptGroup);
    this.scene.add(this.nodesGroup);
    this.scene.add(this.animationGroup);
    this.scene.add(this.activeHeroGltfGroup);
    this.syncSceneModeVisibility();
    this.applyFinish(this.settings.finish);
    this.syncSculptSettings();
    this.syncViewportShading();
    this.syncStagingSettings();
    this.notifyOutliner();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }

    this.tick();
  }

  private setupEnvironmentAndLights(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    this.envMap = envTarget.texture;
    this.scene.environment = this.envMap;
    roomEnv.dispose();
    pmrem.dispose();

    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.65);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff1e0, 2.2);
    this.keyLight.position.set(5.5, 8.5, 5.0);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 25;
      this.keyLight.shadow.camera.left = -7;
      this.keyLight.shadow.camera.right = 7;
      this.keyLight.shadow.camera.top = 7;
      this.keyLight.shadow.camera.bottom = -7;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    this.rimLight.position.set(-6.0, 4.5, -5.5);
    this.scene.add(this.rimLight);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      this.softboxA = new THREE.RectAreaLight(0xe0f2fe, 3.2, 5, 2.5);
      this.softboxA.position.set(-4.5, 4.0, 3.5);
      this.softboxA.lookAt(0, 1.4, 0);
      this.scene.add(this.softboxA);

      this.softboxB = new THREE.RectAreaLight(0xfef3c7, 2.4, 4, 2);
      this.softboxB.position.set(4.5, 2.5, -3.5);
      this.softboxB.lookAt(0, 1.4, 0);
      this.scene.add(this.softboxB);
    }
  }

  private setupGround(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const floorGeo = new THREE.CircleGeometry(22, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f17,
      roughness: 0.78,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'Piso do Estúdio';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = !this.isSoftwareGl;
    floor.userData.nonSelectable = true;
    this.scene.add(floor);
    this.stageGroundMeshes.push(floor);
    this.disposables.push(floorGeo, floorMat);

    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(5.8, 5.8);
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, this.contactShadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.02;
    shadowPlane.userData.nonSelectable = true;
    this.scene.add(shadowPlane);
    this.stageGroundMeshes.push(shadowPlane);
    this.disposables.push(shadowTex, shadowGeo, this.contactShadowMat);

    const gridTex = createCalibrationGridTexture(maxAniso);
    const gridGeo = new THREE.PlaneGeometry(9.2, 9.2);
    const gridMat = new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const gridPlane = new THREE.Mesh(gridGeo, gridMat);
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = 0.04;
    gridPlane.userData.nonSelectable = true;
    this.scene.add(gridPlane);
    this.stageGroundMeshes.push(gridPlane);
    this.disposables.push(gridTex, gridGeo, gridMat);
  }

  private buildPbrAssembly(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const brushedMap = createBrushedMetalTexture(maxAniso);
    this.disposables.push(brushedMap);

    this.primaryMat = new THREE.MeshPhysicalMaterial({
      color: 0xbac4d4,
      metalness: 0.94,
      roughness: 0.22,
      roughnessMap: brushedMap,
      anisotropy: 0.85,
      clearcoat: 0.25,
      clearcoatRoughness: 0.2,
    });

    this.secondaryMat = new THREE.MeshStandardMaterial({
      color: 0x222938,
      metalness: 0.45,
      roughness: 0.62,
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.35,
    });

    this.crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      metalness: 0.0,
      roughness: 0.06,
      transmission: this.isSoftwareGl ? 0 : 0.92,
      transparent: true,
      opacity: this.isSoftwareGl ? 0.42 : 1.0,
      ior: 1.75,
      thickness: 1.4,
      attenuationColor: new THREE.Color(0x38bdf8),
      attenuationDistance: 1.8,
      clearcoat: 1.0,
    });
    this.disposables.push(this.primaryMat, this.secondaryMat, this.accentMat, this.crystalMat);

    // 1. Base Plinth
    const plinthPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.75, 0.0),
      new THREE.Vector2(1.75, 0.12),
      new THREE.Vector2(1.52, 0.22),
      new THREE.Vector2(1.15, 0.24),
      new THREE.Vector2(1.05, 0.38),
      new THREE.Vector2(0.55, 0.42),
      new THREE.Vector2(0.42, 0.65),
      new THREE.Vector2(0.0, 0.65),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPts, 48);
    if (plinthGeo.index && plinthGeo.attributes.normal && plinthGeo.attributes.uv) {
      plinthGeo.computeTangents();
    }
    const plinthMesh = new THREE.Mesh(plinthGeo, this.secondaryMat.clone());
    plinthMesh.name = 'Plinto Estrutural';
    plinthMesh.castShadow = !this.isSoftwareGl;
    plinthMesh.receiveShadow = !this.isSoftwareGl;
    this.pbrGroup.add(plinthMesh);
    this.disposables.push(plinthGeo, plinthMesh.material);

    // 2. Machined Collar Ring
    const collarGeo = new THREE.TorusGeometry(1.42, 0.055, 18, 64);
    const collarMesh = new THREE.Mesh(collarGeo, this.primaryMat.clone());
    collarMesh.name = 'Anel de Fixação Usinado';
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = 0.22;
    collarMesh.castShadow = !this.isSoftwareGl;
    this.pbrGroup.add(collarMesh);
    this.disposables.push(collarGeo, collarMesh.material);

    // 3. 24 Perimeter Fasteners
    const boltGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.08, 6);
    this.perimeterBolts = new THREE.InstancedMesh(boltGeo, this.primaryMat, 24);
    this.perimeterBolts.name = 'Parafusos Perimetrais (24x)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      _pos.set(Math.cos(a) * 1.56, 0.19, Math.sin(a) * 1.56);
      _quat.identity();
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.perimeterBolts.setMatrixAt(i, _mat4);
    }
    this.perimeterBolts.instanceMatrix.needsUpdate = true;
    this.perimeterBolts.computeBoundingSphere();
    this.pbrGroup.add(this.perimeterBolts);
    this.disposables.push(boltGeo);

    // 4. Outer Gimbal Ring
    this.outerGimbal.position.set(0, 1.65, 0);
    const outerShape = new THREE.Shape();
    outerShape.absarc(0, 0, 1.32, 0, Math.PI * 2, false);
    const outerHole = new THREE.Path();
    outerHole.absarc(0, 0, 1.12, 0, Math.PI * 2, true);
    outerShape.holes.push(outerHole);

    const outerRingGeo = new THREE.ExtrudeGeometry(outerShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 3,
      curveSegments: 48,
    });
    outerRingGeo.center();
    if (outerRingGeo.index && outerRingGeo.attributes.normal && outerRingGeo.attributes.uv) {
      outerRingGeo.computeTangents();
    }
    const outerRingMesh = new THREE.Mesh(outerRingGeo, this.primaryMat);
    outerRingMesh.name = 'Anel Gimbal Externo';
    outerRingMesh.castShadow = !this.isSoftwareGl;
    this.outerGimbal.add(outerRingMesh);
    this.disposables.push(outerRingGeo);

    const trunnionGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.34, 24);
    const trunnionL = new THREE.Mesh(trunnionGeo, this.accentMat);
    trunnionL.name = 'Mancal Esquerdo';
    trunnionL.rotation.z = Math.PI / 2;
    trunnionL.position.set(-1.32, 0, 0);
    const trunnionR = new THREE.Mesh(trunnionGeo, this.accentMat);
    trunnionR.name = 'Mancal Direito';
    trunnionR.rotation.z = Math.PI / 2;
    trunnionR.position.set(1.32, 0, 0);
    this.outerGimbal.add(trunnionL, trunnionR);
    this.disposables.push(trunnionGeo);

    // 5. Middle Gimbal Ring
    const midGeo = new THREE.TorusGeometry(0.95, 0.085, 24, 64);
    const midMesh = new THREE.Mesh(midGeo, this.secondaryMat);
    midMesh.name = 'Anel Intermediário';
    midMesh.castShadow = !this.isSoftwareGl;
    this.middleGimbal.add(midMesh);
    this.disposables.push(midGeo);

    // 6. Inner Rotor Shroud + 12 Stator Blades
    const hubGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 32);
    const hubMesh = new THREE.Mesh(hubGeo, this.primaryMat);
    hubMesh.name = 'Cubo do Rotor';
    hubMesh.rotation.x = Math.PI / 2;
    this.innerRotor.add(hubMesh);
    this.disposables.push(hubGeo);

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -0.04);
    bladeShape.quadraticCurveTo(0.24, 0.05, 0.46, 0.01);
    bladeShape.lineTo(0.46, -0.02);
    bladeShape.quadraticCurveTo(0.22, -0.07, 0, -0.04);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 2,
    });
    bladeGeo.center();
    this.statorBlades = new THREE.InstancedMesh(bladeGeo, this.primaryMat, 12);
    this.statorBlades.name = 'Pás do Estator (12x)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      _pos.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
      _euler.set(0.35, 0, a);
      _quat.setFromEuler(_euler);
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.statorBlades.setMatrixAt(i, _mat4);
    }
    this.statorBlades.instanceMatrix.needsUpdate = true;
    this.statorBlades.computeBoundingSphere();
    this.innerRotor.add(this.statorBlades);
    this.disposables.push(bladeGeo);

    // 7. Inner Harmonic Filament Coil
    const knotCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 72 }, (_, i) => {
        const t = (i / 72) * Math.PI * 2;
        const r = 0.24 + 0.07 * Math.cos(3 * t);
        return new THREE.Vector3(
          r * Math.cos(2 * t),
          r * Math.sin(2 * t),
          0.09 * Math.sin(3 * t)
        );
      }),
      true
    );
    const filamentGeo = new THREE.TubeGeometry(knotCurve, 96, 0.018, 12, true);
    this.filamentMesh = new THREE.Mesh(filamentGeo, this.accentMat);
    this.filamentMesh.name = 'Filamento Harmônico';
    this.innerRotor.add(this.filamentMesh);
    this.disposables.push(filamentGeo);

    // 8. Optical Crystal Core Sphere
    const coreGeo = new THREE.IcosahedronGeometry(0.36, 4);
    this.crystalCore = new THREE.Mesh(coreGeo, this.crystalMat);
    this.crystalCore.name = 'Núcleo Cristalino Óptico';
    this.crystalCore.renderOrder = 2;
    this.innerRotor.add(this.crystalCore);
    this.disposables.push(coreGeo);

    this.middleGimbal.add(this.innerRotor);
    this.outerGimbal.add(this.middleGimbal);
    this.pbrGroup.add(this.outerGimbal);
  }

  private buildInstancedField(): void {
    const geo = new THREE.OctahedronGeometry(0.065, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.78,
    });

    this.instancedField = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
    this.instancedField.name = 'Campo Orbital Instanciado';
    this.instancedField.frustumCulled = false;

    const paletteA = new THREE.Color(0x0ea5e9);
    const paletteB = new THREE.Color(0x2dd4bf);
    const paletteC = new THREE.Color(0xf59e0b);

    for (let i = 0; i < MAX_INSTANCES; i++) {
      const phase = (i / MAX_INSTANCES) * Math.PI * 2 * 13;
      const radius = 1.4 + ((i * 1.6180339) % 1) * 3.8;
      this.instancePhases[i] = phase;
      this.instanceRadii[i] = radius;

      const t = (radius - 1.4) / 3.8;
      if (t < 0.5) {
        _color.copy(paletteA).lerp(paletteB, t * 2);
      } else {
        _color.copy(paletteB).lerp(paletteC, (t - 0.5) * 2);
      }
      this.instancedField.setColorAt(i, _color);
    }
    if (this.instancedField.instanceColor) {
      this.instancedField.instanceColor.needsUpdate = true;
    }

    this.instancedField.count = Math.min(MAX_INSTANCES, this.settings.instanceCount);
    this.instancedGroup.position.y = 1.65;
    this.instancedGroup.add(this.instancedField);
    this.disposables.push(geo, mat);
  }

  private buildShaderScene(): void {
    this.harmonicMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTurbulence: { value: this.settings.turbulence },
        uFrequency: { value: this.settings.frequency },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: GLSL_HARMONIC_VERTEX,
      fragmentShader: GLSL_HARMONIC_FRAGMENT,
    });

    const sphereGeo = new THREE.IcosahedronGeometry(1.15, 5);
    this.harmonicSphere = new THREE.Mesh(sphereGeo, this.harmonicMaterial);
    this.harmonicSphere.name = 'Esfera Shader GLSL';
    this.harmonicSphere.position.set(0, 1.65, 0);
    this.shaderGroup.add(this.harmonicSphere);

    this.shaderRingMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.88,
      roughness: 0.24,
    });
    this.shaderRingMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.shaderRingMat.userData.shader = shader;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        transformed.z += sin(position.x * 4.0 + uTime * 2.4) * 0.06;
        `
      );
    };

    const ringGeoA = new THREE.TorusGeometry(1.85, 0.032, 16, 96);
    const ringGeoB = new THREE.TorusGeometry(2.25, 0.022, 16, 96);
    this.shaderRingA = new THREE.Mesh(ringGeoA, this.shaderRingMat.clone());
    this.shaderRingA.name = 'Anel Orbital Interno';
    this.shaderRingB = new THREE.Mesh(ringGeoB, this.shaderRingMat.clone());
    this.shaderRingB.name = 'Anel Orbital Externo';
    this.shaderRingA.position.set(0, 1.65, 0);
    this.shaderRingB.position.set(0, 1.65, 0);
    this.shaderGroup.add(this.shaderRingA, this.shaderRingB);

    this.disposables.push(
      this.harmonicMaterial,
      sphereGeo,
      this.shaderRingMat,
      this.shaderRingA.material as THREE.Material,
      this.shaderRingB.material as THREE.Material,
      ringGeoA,
      ringGeoB
    );
  }

  private buildDefaultLodAssembly(): void {
    // Single lightweight example node with 3 genuine THREE.LOD levels
    const highCoreGeo = new THREE.TorusKnotGeometry(0.28, 0.085, 96, 16);
    const midCoreGeo = new THREE.TorusKnotGeometry(0.28, 0.085, 36, 8);
    const lowCoreGeo = new THREE.OctahedronGeometry(0.32, 0);

    const highRingGeo = new THREE.TorusGeometry(0.45, 0.028, 16, 48);
    const midRingGeo = new THREE.TorusGeometry(0.45, 0.028, 8, 20);

    const matHigh = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      metalness: 0.86,
      roughness: 0.2,
      clearcoat: 0.6,
    });
    const matMid = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      metalness: 0.72,
      roughness: 0.35,
    });
    const matLow = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.55,
      roughness: 0.5,
    });
    const matRing = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.9,
      roughness: 0.22,
    });

    this.disposables.push(
      highCoreGeo,
      midCoreGeo,
      lowCoreGeo,
      highRingGeo,
      midRingGeo,
      matHigh,
      matMid,
      matLow,
      matRing
    );

    this.lodNodes = [];
    const total = 1;
    for (let i = 0; i < total; i++) {
      const lod = new THREE.LOD();
      lod.name = 'Modelo Exemplo Multi-LOD';
      lod.position.set(0, 1.35, 0);
      lod.scale.setScalar(1.45);

      // Level 0: High Detail (< 6.0m)
      const g0 = new THREE.Group();
      const m0 = new THREE.Mesh(highCoreGeo, matHigh.clone());
      m0.name = 'Exemplo (LOD0 Alta)';
      m0.castShadow = !this.isSoftwareGl;
      m0.receiveShadow = !this.isSoftwareGl;
      const r0 = new THREE.Mesh(highRingGeo, matRing.clone());
      r0.name = 'Anel Exemplo (LOD0)';
      r0.rotation.x = Math.PI / 3;
      r0.castShadow = !this.isSoftwareGl;
      g0.add(m0, r0);
      lod.addLevel(g0, 0);

      // Level 1: Medium Detail (6.0m - 11.5m)
      const g1 = new THREE.Group();
      const m1 = new THREE.Mesh(midCoreGeo, matMid.clone());
      m1.name = 'Exemplo (LOD1 Média)';
      m1.castShadow = !this.isSoftwareGl;
      const r1 = new THREE.Mesh(midRingGeo, matRing.clone());
      r1.name = 'Anel Exemplo (LOD1)';
      r1.rotation.x = Math.PI / 3;
      g1.add(m1, r1);
      lod.addLevel(g1, 6.0);

      // Level 2: Low Detail Proxy (> 11.5m)
      const m2 = new THREE.Mesh(lowCoreGeo, matLow.clone());
      m2.name = 'Exemplo (LOD2 Baixa)';
      m2.castShadow = !this.isSoftwareGl;
      lod.addLevel(m2, 11.5);

      this.lodDefaultContainer.add(lod);
      this.lodNodes.push(lod);
    }

    this.gltfGroup.add(this.lodDefaultContainer);
  }

  private setupPostProcessing(width: number, height: number): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2))),
      this.settings.postProcessing.bloomStrength,
      0.35,
      0.85
    );
    this.bloomPass.enabled = this.settings.postProcessing.bloomStrength > 0.005;
    this.composer.addPass(this.bloomPass);

    this.bokehPass = new BokehPass(this.scene, this.camera, {
      focus: this.settings.postProcessing.dofFocus,
      aperture: 0.00018,
      maxblur: 0.008,
    });
    this.bokehPass.enabled = this.settings.postProcessing.dofEnabled;
    this.composer.addPass(this.bokehPass);

    this.cinematicPass = new ShaderPass(CinematicPassShader);
    this.cinematicPass.uniforms.uGrain.value = this.settings.postProcessing.grainAmount;
    this.cinematicPass.uniforms.uChromatic.value = this.settings.postProcessing.chromaticAmount;
    this.composer.addPass(this.cinematicPass);

    this.composer.addPass(new OutputPass());
  }

  private buildPhysicsScene(): void {
    // Arena containment ring grounded at y = 0.05
    const arenaGeo = new THREE.TorusGeometry(4.0, 0.08, 16, 72);
    const arenaMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.3,
    });
    const arenaRing = new THREE.Mesh(arenaGeo, arenaMat);
    arenaRing.name = 'Anel de Contenção Física';
    arenaRing.rotation.x = Math.PI / 2;
    arenaRing.position.y = 0.08;
    arenaRing.userData.nonSelectable = true;
    this.physicsGroup.add(arenaRing);
    this.disposables.push(arenaGeo, arenaMat);

    // Cursor 3D repulsor/attractor indicator
    const beaconGeo = new THREE.SphereGeometry(0.18, 20, 20);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity: 0.75,
    });
    this.cursorBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.cursorBeacon.position.copy(_cursorWorld);
    this.cursorBeacon.userData.nonSelectable = true;
    this.physicsGroup.add(this.cursorBeacon);
    this.disposables.push(beaconGeo, beaconMat);

    // 16 Rigid-body spheres with varied PBR finishes
    const ballGeo = new THREE.IcosahedronGeometry(1, 3);
    this.disposables.push(ballGeo);
    const palette = [0x38bdf8, 0xf59e0b, 0x2dd4bf, 0xe2e8f0, 0x60a5fa];

    for (let i = 0; i < PHYSICS_BALL_COUNT; i++) {
      const radius = 0.24 + (i % 4) * 0.06;
      const mat = new THREE.MeshPhysicalMaterial({
        color: palette[i % palette.length],
        metalness: i % 2 === 0 ? 0.88 : 0.25,
        roughness: i % 2 === 0 ? 0.18 : 0.42,
        clearcoat: 0.65,
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.name = `Esfera Física #${i + 1}`;
      mesh.scale.setScalar(radius);
      const angle = (i / PHYSICS_BALL_COUNT) * Math.PI * 2;
      const dist = 1.2 + (i % 3) * 0.8;
      mesh.position.set(Math.cos(angle) * dist, 1.4 + (i % 5) * 0.55, Math.sin(angle) * dist);
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = !this.isSoftwareGl;
      this.physicsGroup.add(mesh);
      this.disposables.push(mat);

      this.physicsBodies.push({
        mesh,
        vel: new THREE.Vector3(Math.sin(angle) * 1.4, 0, Math.cos(angle) * 1.4),
        radius,
        mass: radius * radius * radius,
      });
    }

    // 1,600 cursor-reactive particle sparks
    const pGeo = new THREE.BufferGeometry();
    for (let i = 0; i < PHYSICS_PARTICLE_COUNT; i++) {
      const a = (i / PHYSICS_PARTICLE_COUNT) * Math.PI * 2 * 11;
      const r = 0.6 + ((i * 0.618) % 1) * 3.1;
      this.physicsParticlePositions[i * 3 + 0] = Math.cos(a) * r;
      this.physicsParticlePositions[i * 3 + 1] = 0.3 + ((i * 0.37) % 1) * 2.6;
      this.physicsParticlePositions[i * 3 + 2] = Math.sin(a) * r;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.physicsParticlePositions, 3));

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d');
    if (pCtx) {
      const grad = pCtx.createRadialGradient(16, 16, 1, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.7)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 32, 32);
    }
    const pTex = new THREE.CanvasTexture(pCanvas);
    pTex.colorSpace = THREE.SRGBColorSpace;

    const pMat = new THREE.PointsMaterial({
      size: 0.14,
      map: pTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0x7dd3fc,
    });
    this.physicsParticles = new THREE.Points(pGeo, pMat);
    this.physicsParticles.name = 'Nuvem de Partículas Interativa';
    this.physicsParticles.userData.nonSelectable = true;
    this.physicsGroup.add(this.physicsParticles);
    this.disposables.push(pGeo, pTex, pMat);
  }

  private buildSculptScene(): void {
    const redWaxTex = createSculptMatcapTexture('redwax');
    const clayTex = createSculptMatcapTexture('clay');
    this.sculptMatcapRedWax = new THREE.MeshMatcapMaterial({ matcap: redWaxTex });
    this.sculptMatcapClay = new THREE.MeshMatcapMaterial({ matcap: clayTex });
    this.disposables.push(redWaxTex, clayTex, this.sculptMatcapRedWax, this.sculptMatcapClay);

    // Sculpt turntable base (grounded at y = 0)
    const baseGeo = new THREE.CylinderGeometry(1.45, 1.58, 0.16, 48);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.65,
      roughness: 0.42,
    });
    this.sculptBaseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.sculptBaseMesh.name = 'Base Giratória';
    this.sculptBaseMesh.position.set(0, 0.08, 0);
    this.sculptBaseMesh.receiveShadow = !this.isSoftwareGl;
    this.sculptBaseMesh.userData.nonSelectable = true;
    this.sculptGroup.add(this.sculptBaseMesh);
    this.disposables.push(baseGeo, baseMat);

    // Primary organic sculpt mesh
    const geoMain = createPrimitiveSculptGeometry('sphere');
    const meshMain = new THREE.Mesh(geoMain, this.sculptMatcapRedWax);
    meshMain.name = 'Objeto_3D';
    meshMain.position.set(0, 1.48, 0);
    meshMain.scale.setScalar(0.95);
    meshMain.castShadow = !this.isSoftwareGl;
    meshMain.receiveShadow = !this.isSoftwareGl;
    meshMain.userData.isSculptObject = true;
    this.sculptGroup.add(meshMain);
    this.sculptMeshes.push(meshMain);
    this.activeSculptMesh = meshMain;
    this.disposables.push(geoMain);

    // Secondary reference crystal mesh
    const geoAux = createPrimitiveSculptGeometry('crystal');
    const meshAux = new THREE.Mesh(geoAux, this.sculptMatcapRedWax);
    meshAux.name = 'Cristal_Apoio';
    meshAux.position.set(-1.35, 0.68, -0.35);
    meshAux.scale.setScalar(0.45);
    meshAux.castShadow = !this.isSoftwareGl;
    meshAux.userData.isSculptObject = true;
    this.sculptGroup.add(meshAux);
    this.sculptMeshes.push(meshAux);
    this.disposables.push(geoAux);

    // Sculpt brush cursor ring
    const cursorGeo = new THREE.RingGeometry(0.88, 1.0, 32);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.sculptBrushCursor = new THREE.Mesh(cursorGeo, cursorMat);
    this.sculptBrushCursor.visible = false;
    this.sculptBrushCursor.userData.nonSelectable = true;
    this.sculptGroup.add(this.sculptBrushCursor);
    this.disposables.push(cursorGeo, cursorMat);
  }

  private setupShadingMaterials(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const uvTex = createUvCheckerTexture(maxAniso);

    this.shadeMatChrome = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 1.0,
      roughness: 0.06,
    });
    this.shadeMatNormals = new THREE.MeshNormalMaterial();
    this.shadeMatUv = new THREE.MeshStandardMaterial({
      map: uvTex,
      metalness: 0.08,
      roughness: 0.48,
    });
    this.shadeMatCel = new THREE.MeshToonMaterial({
      color: 0x38bdf8,
    });
    this.compareWireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      depthTest: true,
    });

    this.disposables.push(
      uvTex,
      this.shadeMatChrome,
      this.shadeMatNormals,
      this.shadeMatUv,
      this.shadeMatCel,
      this.compareWireMat
    );
  }

  private buildNodesScene(): void {
    this.nodesGroup.add(this.nodesHeroGroup);
    this.nodesGroup.add(this.moGraphContainer);

    // 36 reusable MoGraph Cloner node meshes
    const cloneGeo = new THREE.OctahedronGeometry(0.18, 1);
    const cloneMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      metalness: 0.72,
      roughness: 0.2,
      clearcoat: 0.7,
    });
    this.disposables.push(cloneGeo, cloneMat);

    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(cloneGeo, cloneMat);
      m.name = `Clone_MoGraph_${i + 1}`;
      m.castShadow = !this.isSoftwareGl;
      m.receiveShadow = !this.isSoftwareGl;
      m.userData.isMoGraphClone = true;
      this.moGraphContainer.add(m);
      this.moGraphClones.push(m);
    }

    this.applyProceduralNodeTemplate(this.settings.geometryNodes.template, false);
    this.notifyNodesState();
  }

  private applyProceduralTemplateToLoadedGltf(template: ProceduralNodeTemplate): void {
    if (!this.loadedGltfRoot) return;
    let meshIdx = 0;
    this.loadedGltfRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const isPrimary = meshIdx % 2 === 0;
        meshIdx++;
        let mat: THREE.Material;

        if (template === 'glass_neon') {
          mat = isPrimary
            ? new THREE.MeshPhysicalMaterial({
                color: 0xbae6fd,
                emissive: 0x0284c7,
                emissiveIntensity: 0.42,
                metalness: 0.14,
                roughness: 0.08,
                clearcoat: 1.0,
                clearcoatRoughness: 0.05,
                transmission: this.isSoftwareGl ? 0 : 0.72,
                transparent: true,
                opacity: this.isSoftwareGl ? 0.65 : 0.94,
                ior: 1.6,
              })
            : new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0ea5e9,
                emissiveIntensity: 1.25,
                metalness: 0.45,
                roughness: 0.2,
              });
        } else if (template === 'organic_sculpt') {
          mat = isPrimary
            ? new THREE.MeshPhysicalMaterial({
                color: 0xf97316,
                emissive: 0x9a3412,
                emissiveIntensity: 0.18,
                metalness: 0.18,
                roughness: 0.28,
                clearcoat: 0.72,
                clearcoatRoughness: 0.18,
              })
            : new THREE.MeshStandardMaterial({
                color: 0xfef3c7,
                metalness: 0.12,
                roughness: 0.42,
              });
        } else if (template === 'parametric_arch') {
          mat = isPrimary
            ? new THREE.MeshStandardMaterial({
                color: 0xcbd5e1,
                metalness: 0.42,
                roughness: 0.4,
              })
            : new THREE.MeshStandardMaterial({
                color: 0xf59e0b,
                metalness: 0.92,
                roughness: 0.2,
              });
        } else {
          // holo_grid
          mat = isPrimary
            ? new THREE.MeshStandardMaterial({
                color: 0x2dd4bf,
                emissive: 0x0d9488,
                emissiveIntensity: 0.85,
                metalness: 0.65,
                roughness: 0.2,
                transparent: true,
                opacity: 0.88,
              })
            : new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0284c7,
                emissiveIntensity: 0.7,
                metalness: 0.8,
                roughness: 0.22,
                wireframe: true,
              });
        }

        mat.userData.isPerMeshCloned = true;
        this.disposables.push(mat);
        mesh.userData.__origMaterial = mat;
      }
    });
    if (this.selectedMesh) {
      this.emitSelectionInfo(this.selectedMesh);
    }
  }

  public applyProceduralNodeTemplate(
    template = this.settings.geometryNodes.template,
    applyToHero = true
  ): void {
    this.settings.geometryNodes.template = template;
    for (const m of this.nodesHeroMeshes) {
      this.nodesHeroGroup.remove(m);
    }
    for (const d of this.nodeTemplateDisposables) {
      d.dispose();
    }
    this.nodesHeroMeshes = [];
    this.nodeTemplateDisposables = [];

    const built = createProceduralTemplateMeshes(template, this.isSoftwareGl);
    for (const m of built.meshes) {
      this.nodesHeroGroup.add(m);
      this.nodesHeroMeshes.push(m);
    }
    this.nodeTemplateDisposables.push(...built.disposables);

    if (applyToHero) {
      this.nodesTemplateApplied = true;
      if (this.loadedGltfRoot) {
        this.applyProceduralTemplateToLoadedGltf(template);
      }
      this.syncSceneModeVisibility();
      this.syncViewportShading();
    }

    this.notifyNodesState();
    this.notifyOutliner();
  }

  public instantiateCircularArray6x(): number {
    const createdItems: Array<{
      object: THREE.Object3D;
      parent: THREE.Object3D;
      isSculptMesh: boolean;
      isNodeMesh: boolean;
    }> = [];

    const radius = Math.max(1.9, this.settings.geometryNodes.spacing * 1.45);
    let firstMesh: THREE.Mesh | null = null;

    if (this.loadedGltfRoot) {
      for (let i = 0; i < 6; i++) {
        this.nodeCounter++;
        const angle = (i / 6) * Math.PI * 2;
        const cloneRoot = SkeletonUtils.clone(this.loadedGltfRoot);
        cloneRoot.name = `Node_Circular_${this.nodeCounter}`;
        cloneRoot.position.set(
          this.gltfBasePos.x + Math.cos(angle) * radius,
          this.gltfBasePos.y,
          this.gltfBasePos.z + Math.sin(angle) * radius
        );
        cloneRoot.rotation.copy(this.gltfBaseRot);
        cloneRoot.rotation.y = this.gltfBaseRot.y - angle + Math.PI / 2;
        cloneRoot.scale.copy(this.gltfBaseScale);
        cloneRoot.userData.isNodeMesh = true;
        cloneRoot.userData.isCustomUserMesh = true;
        cloneRoot.userData.__circularIndex = i;
        cloneRoot.userData.__circularBasePos = cloneRoot.position.clone();
        cloneRoot.userData.__circularBaseRotY = cloneRoot.rotation.y;
        cloneRoot.userData.__circularBaseScale = cloneRoot.scale.clone();

        cloneRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.castShadow = !this.isSoftwareGl;
            m.receiveShadow = !this.isSoftwareGl;
            m.userData.isNodeMesh = true;
            m.userData.isCustomUserMesh = true;
            if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
              m.frustumCulled = false;
            }
            if (!firstMesh) firstMesh = m;
          }
        });

        this.nodesGroup.add(cloneRoot);
        this.customNodeGroups.push(cloneRoot);
        createdItems.push({
          object: cloneRoot,
          parent: this.nodesGroup,
          isSculptMesh: false,
          isNodeMesh: true,
        });
      }
    } else {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        metalness: 0.78,
        roughness: 0.18,
        clearcoat: 0.8,
      });
      const geo = new THREE.TorusKnotGeometry(0.24, 0.075, 64, 12);
      this.disposables.push(mat, geo);

      for (let i = 0; i < 6; i++) {
        this.nodeCounter++;
        const angle = (i / 6) * Math.PI * 2;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `Node_Circular_${this.nodeCounter}`;
        mesh.position.set(Math.cos(angle) * radius, 1.25, Math.sin(angle) * radius);
        mesh.rotation.y = -angle;
        mesh.castShadow = !this.isSoftwareGl;
        mesh.receiveShadow = !this.isSoftwareGl;
        mesh.userData.isNodeMesh = true;
        mesh.userData.isCustomUserMesh = true;
        mesh.userData.__circularIndex = i;
        mesh.userData.__circularBasePos = mesh.position.clone();
        mesh.userData.__circularBaseRotY = mesh.rotation.y;
        mesh.userData.__circularBaseScale = mesh.scale.clone();

        this.nodesGroup.add(mesh);
        this.customNodeMeshes.push(mesh);
        createdItems.push({
          object: mesh,
          parent: this.nodesGroup,
          isSculptMesh: false,
          isNodeMesh: true,
        });
        if (!firstMesh) firstMesh = mesh;
      }
    }

    this.pushSceneUndo({
      kind: 'create',
      label: 'Instanciar Array Circular (6x Nodes)',
      items: createdItems,
    });

    if (firstMesh) {
      this.selectAnyMesh(firstMesh);
    }
    this.syncViewportShading();
    this.notifyNodesState();
    this.notifyOutliner();
    return 6;
  }

  public applyBooleanCsg(op: BooleanCsgOp): { ok: boolean; message: string } {
    const gltfMeshes: THREE.Mesh[] = [];
    if (this.loadedGltfRoot) {
      this.loadedGltfRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.visible) gltfMeshes.push(obj as THREE.Mesh);
      });
    }
    const pool: THREE.Mesh[] =
      this.settings.sceneMode === 'sculpt'
        ? this.sculptMeshes.filter((m) => Boolean(m.parent))
        : [
            ...this.customNodeMeshes,
            ...gltfMeshes,
            ...(this.nodesHeroGroup.visible ? this.nodesHeroMeshes : []),
          ].filter((m) => Boolean(m.parent));

    let meshA: THREE.Mesh | undefined;
    let meshB: THREE.Mesh | undefined;

    if (pool.length >= 2) {
      if (this.selectedMesh && pool.includes(this.selectedMesh)) {
        meshA = this.selectedMesh;
        meshB = pool.find((m) => m !== this.selectedMesh);
      } else {
        meshA = pool[pool.length - 2];
        meshB = pool[pool.length - 1];
      }
    }

    if (!meshA || !meshB) {
      return {
        ok: false,
        message: 'São necessárias pelo menos 2 malhas na cena para Booleana CSG.',
      };
    }

    const resultGeo = performMeshBooleanCsg(meshA, meshB, op);
    if (!resultGeo) {
      return {
        ok: false,
        message: 'As 2 malhas não se intersectam ou o resultado ficou vazio.',
      };
    }

    const center =
      (resultGeo.userData.csgWorldCenter as THREE.Vector3 | undefined) ??
      new THREE.Vector3(0, 1.45, 0);

    const mat =
      this.settings.sceneMode === 'sculpt'
        ? this.settings.sculpt.material === 'redwax'
          ? this.sculptMatcapRedWax
          : this.sculptMatcapClay
        : new THREE.MeshPhysicalMaterial({
            color: op === 'union' ? 0x38bdf8 : op === 'subtract' ? 0xf59e0b : 0x2dd4bf,
            metalness: 0.65,
            roughness: 0.22,
            clearcoat: 0.55,
          });
    if (!(mat === this.sculptMatcapRedWax || mat === this.sculptMatcapClay)) {
      this.disposables.push(mat);
    }

    this.nodeCounter++;
    const opNames: Record<BooleanCsgOp, string> = {
      union: 'CSG_União',
      subtract: 'CSG_Subtração',
      intersect: 'CSG_Interseção',
    };

    const resultMesh = new THREE.Mesh(resultGeo, mat);
    resultMesh.name = `${opNames[op]}_${this.nodeCounter}`;
    resultMesh.position.copy(center);
    resultMesh.castShadow = !this.isSoftwareGl;
    resultMesh.receiveShadow = !this.isSoftwareGl;
    this.disposables.push(resultGeo);

    const isSculpt = this.settings.sceneMode === 'sculpt';
    const targetParent = isSculpt ? this.sculptGroup : this.nodesGroup;
    resultMesh.userData.isCustomUserMesh = true;
    if (isSculpt) {
      resultMesh.userData.isSculptObject = true;
      this.sculptMeshes.push(resultMesh);
    } else {
      resultMesh.userData.isNodeMesh = true;
      this.customNodeMeshes.push(resultMesh);
    }
    targetParent.add(resultMesh);

    this.pushSceneUndo({
      kind: 'create',
      label: `Booleana ${opNames[op]}`,
      items: [
        {
          object: resultMesh,
          parent: targetParent,
          isSculptMesh: isSculpt,
          isNodeMesh: !isSculpt,
        },
      ],
    });

    this.selectAnyMesh(resultMesh);
    this.syncViewportShading();
    this.notifySculptState();
    this.notifyNodesState();
    this.notifyOutliner();
    return {
      ok: true,
      message: `${opNames[op]} gerada a partir de ${meshA.name} e ${meshB.name} (Ctrl+Z para desfazer).`,
    };
  }

  private buildAnimationScene(): void {
    this.rig = createArticulatedCharacterRig();
    this.animationGroup.add(this.rig.root);
    this.animationGroup.add(this.rig.trailLine);
    for (const d of this.rig.disposables) {
      this.disposables.push(d);
    }
  }

  private notifyNodesState(): void {
    const heroCount = this.loadedGltfRoot ? this.loadedMeshCount : 0;
    const count =
      heroCount +
      this.nodesHeroMeshes.filter((m) => Boolean(m.parent) && this.nodesHeroGroup.visible && m.visible).length +
      this.customNodeMeshes.filter((m) => Boolean(m.parent)).length +
      this.customNodeGroups.filter((g) => Boolean(g.parent)).length * Math.max(1, this.loadedMeshCount);
    this.onNodesStateChange?.(count);
  }

  private notifyUndoRedo(): void {
    this.onUndoRedoChange?.(this.sceneUndoStack.length, this.sceneRedoStack.length);
  }

  private notifySculptState(): void {
    const geomCount = this.sceneUndoStack.length;
    this.onSculptStateChange?.(this.sculptMeshes.length, geomCount);
  }

  private pushSceneUndo(cmd: SceneUndoCommand): void {
    this.sceneUndoStack.push(cmd);
    if (this.sceneUndoStack.length > 40) {
      this.sceneUndoStack.shift();
    }
    this.sceneRedoStack = [];
    this.notifyUndoRedo();
    this.notifySculptState();
  }

  public undoScene(): { ok: boolean; label: string } {
    const cmd = this.sceneUndoStack.pop();
    if (!cmd) return { ok: false, label: '' };

    if (cmd.kind === 'transform') {
      cmd.object.position.copy(cmd.prevPos);
      cmd.object.quaternion.copy(cmd.prevQuat);
      cmd.object.scale.copy(cmd.prevScale);
      if (cmd.object === this.loadedGltfRoot) {
        this.gltfBasePos.copy(cmd.object.position);
        this.gltfBaseRot.copy(cmd.object.rotation);
        this.gltfBaseScale.copy(cmd.object.scale);
      }
      if ((cmd.object as THREE.Mesh).isMesh) {
        this.selectAnyMesh(cmd.object as THREE.Mesh);
      }
    } else if (cmd.kind === 'geometry') {
      const pos = cmd.mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos && pos.array.length === cmd.prevPositions.length) {
        (pos.array as Float32Array).set(cmd.prevPositions);
        pos.needsUpdate = true;
        cmd.mesh.geometry.computeVertexNormals();
        cmd.mesh.geometry.computeBoundingBox();
        cmd.mesh.geometry.computeBoundingSphere();
      }
      this.selectAnyMesh(cmd.mesh);
    } else if (cmd.kind === 'delete') {
      cmd.parent.add(cmd.object);
      if (cmd.wasSculptMesh && (cmd.object as THREE.Mesh).isMesh) {
        const m = cmd.object as THREE.Mesh;
        if (!this.sculptMeshes.includes(m)) this.sculptMeshes.push(m);
      }
      if (cmd.wasNodeMesh) {
        if ((cmd.object as THREE.Mesh).isMesh) {
          const m = cmd.object as THREE.Mesh;
          if (!this.customNodeMeshes.includes(m)) this.customNodeMeshes.push(m);
        } else if (!this.customNodeGroups.includes(cmd.object)) {
          this.customNodeGroups.push(cmd.object);
        }
      }
      if ((cmd.object as THREE.Mesh).isMesh) {
        this.selectAnyMesh(cmd.object as THREE.Mesh);
      }
    } else if (cmd.kind === 'create') {
      for (const item of cmd.items) {
        if (this.selectedMesh === item.object) {
          this.clearSelection();
        }
        item.parent.remove(item.object);
        if (item.isSculptMesh) {
          this.sculptMeshes = this.sculptMeshes.filter((m) => m !== item.object);
        }
        if (item.isNodeMesh) {
          this.customNodeMeshes = this.customNodeMeshes.filter((m) => m !== item.object);
          this.customNodeGroups = this.customNodeGroups.filter((g) => g !== item.object);
        }
      }
    } else if (cmd.kind === 'property') {
      this.applyPropertySnapshot(cmd.mesh, cmd.prev);
      this.selectAnyMesh(cmd.mesh);
    }

    this.sceneRedoStack.push(cmd);
    this.selectionHelper?.update();
    if (this.selectedMesh) this.emitSelectionInfo(this.selectedMesh);
    this.notifyUndoRedo();
    this.notifySculptState();
    this.notifyNodesState();
    this.notifyOutliner();
    return { ok: true, label: cmd.label };
  }

  public redoScene(): { ok: boolean; label: string } {
    const cmd = this.sceneRedoStack.pop();
    if (!cmd) return { ok: false, label: '' };

    if (cmd.kind === 'transform') {
      cmd.object.position.copy(cmd.nextPos);
      cmd.object.quaternion.copy(cmd.nextQuat);
      cmd.object.scale.copy(cmd.nextScale);
      if (cmd.object === this.loadedGltfRoot) {
        this.gltfBasePos.copy(cmd.object.position);
        this.gltfBaseRot.copy(cmd.object.rotation);
        this.gltfBaseScale.copy(cmd.object.scale);
      }
      if ((cmd.object as THREE.Mesh).isMesh) {
        this.selectAnyMesh(cmd.object as THREE.Mesh);
      }
    } else if (cmd.kind === 'geometry') {
      const pos = cmd.mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (pos && pos.array.length === cmd.nextPositions.length) {
        (pos.array as Float32Array).set(cmd.nextPositions);
        pos.needsUpdate = true;
        cmd.mesh.geometry.computeVertexNormals();
        cmd.mesh.geometry.computeBoundingBox();
        cmd.mesh.geometry.computeBoundingSphere();
      }
      this.selectAnyMesh(cmd.mesh);
    } else if (cmd.kind === 'delete') {
      if (this.selectedMesh === cmd.object) {
        this.clearSelection();
      }
      cmd.parent.remove(cmd.object);
      if (cmd.wasSculptMesh) {
        this.sculptMeshes = this.sculptMeshes.filter((m) => m !== cmd.object);
      }
      if (cmd.wasNodeMesh) {
        this.customNodeMeshes = this.customNodeMeshes.filter((m) => m !== cmd.object);
        this.customNodeGroups = this.customNodeGroups.filter((g) => g !== cmd.object);
      }
    } else if (cmd.kind === 'create') {
      for (const item of cmd.items) {
        item.parent.add(item.object);
        if (item.isSculptMesh && (item.object as THREE.Mesh).isMesh) {
          const m = item.object as THREE.Mesh;
          if (!this.sculptMeshes.includes(m)) this.sculptMeshes.push(m);
        }
        if (item.isNodeMesh) {
          if ((item.object as THREE.Mesh).isMesh) {
            const m = item.object as THREE.Mesh;
            if (!this.customNodeMeshes.includes(m)) this.customNodeMeshes.push(m);
          } else if (!this.customNodeGroups.includes(item.object)) {
            this.customNodeGroups.push(item.object);
          }
        }
      }
      const first = cmd.items[0]?.object;
      if (first && (first as THREE.Mesh).isMesh) {
        this.selectAnyMesh(first as THREE.Mesh);
      }
    } else if (cmd.kind === 'property') {
      this.applyPropertySnapshot(cmd.mesh, cmd.next);
      this.selectAnyMesh(cmd.mesh);
    }

    this.sceneUndoStack.push(cmd);
    this.selectionHelper?.update();
    if (this.selectedMesh) this.emitSelectionInfo(this.selectedMesh);
    this.notifyUndoRedo();
    this.notifySculptState();
    this.notifyNodesState();
    this.notifyOutliner();
    return { ok: true, label: cmd.label };
  }

  private applyPropertySnapshot(
    mesh: THREE.Mesh,
    snap: {
      visible: boolean;
      frustumCulled: boolean;
      wireframe: boolean;
      colorHex?: string;
      metalness?: number;
      roughness?: number;
      emissiveHex?: string;
      emissiveIntensity?: number;
      opacity?: number;
      transparent?: boolean;
    }
  ): void {
    mesh.visible = snap.visible;
    mesh.frustumCulled = snap.frustumCulled;
    const mat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const targetMat = Array.isArray(mat) ? mat[0] : mat;
    if (targetMat) {
      if ('wireframe' in targetMat) {
        (targetMat as THREE.MeshStandardMaterial).wireframe = snap.wireframe;
      }
      if (targetMat instanceof THREE.MeshStandardMaterial) {
        if (snap.colorHex !== undefined) targetMat.color.set(snap.colorHex);
        if (snap.metalness !== undefined) targetMat.metalness = snap.metalness;
        if (snap.roughness !== undefined) targetMat.roughness = snap.roughness;
        if (snap.emissiveHex !== undefined) targetMat.emissive.set(snap.emissiveHex);
        if (snap.emissiveIntensity !== undefined) targetMat.emissiveIntensity = snap.emissiveIntensity;
        if (snap.opacity !== undefined) targetMat.opacity = snap.opacity;
        if (snap.transparent !== undefined) targetMat.transparent = snap.transparent;
        targetMat.needsUpdate = true;
      }
    }
    this.notifyOutliner();
  }

  public undoSculpt(): boolean {
    return this.undoScene().ok;
  }

  public divideActiveSculptMesh(): boolean {
    const target =
      (this.selectedMesh?.userData.isSculptObject ? this.selectedMesh : null) ||
      this.activeSculptMesh ||
      this.sculptMeshes[0];
    if (!target) return false;

    const nextGeo = subdivideGeometry4x(target.geometry);
    if (!nextGeo) return false;

    const oldGeo = target.geometry;
    target.geometry = nextGeo;
    oldGeo.dispose();
    this.disposables.push(nextGeo);
    this.sceneUndoStack = this.sceneUndoStack.filter(
      (u) => !(u.kind === 'geometry' && u.mesh.uuid === target.uuid)
    );
    this.notifyUndoRedo();
    this.notifySculptState();

    this.selectionHelper?.update();
    if (this.selectedMesh === target) this.emitSelectionInfo(target);
    return true;
  }

  public applyDeformationToActiveSculptMesh(type: MeshDeformationType): boolean {
    const target =
      (this.selectedMesh?.userData.isSculptObject ? this.selectedMesh : null) ||
      this.activeSculptMesh ||
      this.sculptMeshes[0];
    if (!target) return false;

    const posAttr = target.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const prevPositions = posAttr ? new Float32Array(posAttr.array as Float32Array) : null;

    applyMeshDeformation(target, type);

    if (prevPositions && posAttr) {
      this.pushSceneUndo({
        kind: 'geometry',
        label: `Deformação ${type}`,
        mesh: target,
        prevPositions,
        nextPositions: new Float32Array(posAttr.array as Float32Array),
      });
    }

    this.selectionHelper?.update();
    if (this.selectedMesh === target) this.emitSelectionInfo(target);
    return true;
  }

  public addSculptPrimitive(shape: PrimitiveShape): void {
    const geo = createPrimitiveSculptGeometry(shape);
    const mat =
      this.settings.sculpt.material === 'redwax'
        ? this.sculptMatcapRedWax
        : this.sculptMatcapClay;
    const mesh = new THREE.Mesh(geo, mat);
    this.sculptCounter++;
    const labelMap: Record<PrimitiveShape, string> = {
      cube: 'Cubo',
      sphere: 'Esfera',
      torus: 'Toro',
      cylinder: 'Cilindro',
      cone: 'Cone',
      capsule: 'Cápsula',
      crystal: 'Cristal',
      knot: 'Nó_3D',
    };
    mesh.name = `${labelMap[shape]}_${this.sculptCounter}`;
    const offset = ((this.sculptMeshes.length % 5) - 2) * 0.55;
    mesh.position.set(offset, 1.35, 0.15 * ((this.sculptMeshes.length % 3) - 1));
    mesh.scale.setScalar(0.8);
    mesh.castShadow = !this.isSoftwareGl;
    mesh.receiveShadow = !this.isSoftwareGl;
    mesh.userData.isSculptObject = true;
    mesh.userData.isCustomUserMesh = true;

    this.sculptGroup.add(mesh);
    this.sculptMeshes.push(mesh);
    this.disposables.push(geo);
    this.pushSceneUndo({
      kind: 'create',
      label: `Adicionar ${mesh.name}`,
      items: [
        {
          object: mesh,
          parent: this.sculptGroup,
          isSculptMesh: true,
          isNodeMesh: false,
        },
      ],
    });
    this.selectSculptMesh(mesh);
    this.syncViewportShading();
    this.notifySculptState();
    this.notifyOutliner();
  }

  public duplicateSelectedObject(): string | null {
    const target =
      this.selectedMesh ||
      (this.settings.sceneMode === 'sculpt' ? this.activeSculptMesh : null);
    if (!target || !target.parent) return null;

    const geoClone = target.geometry.clone();
    const origMat =
      (target.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      target.material;
    const matClone = Array.isArray(origMat)
      ? origMat.map((m) => m.clone())
      : origMat.clone();

    const mesh = new THREE.Mesh(geoClone, matClone);
    this.sculptCounter++;
    mesh.name = `${target.name || 'Objeto'}_Copia`;
    mesh.position.copy(target.position).add(new THREE.Vector3(0.75, 0, 0.25));
    mesh.rotation.copy(target.rotation);
    mesh.scale.copy(target.scale);
    mesh.castShadow = !this.isSoftwareGl;
    mesh.receiveShadow = !this.isSoftwareGl;
    mesh.userData.userEdited = true;
    mesh.userData.isCustomUserMesh = true;

    const isSculpt = Boolean(target.userData.isSculptObject);
    const isNode = Boolean(target.userData.isNodeMesh);
    mesh.userData.isSculptObject = isSculpt;
    mesh.userData.isNodeMesh = isNode;

    target.parent.add(mesh);
    if (isSculpt) this.sculptMeshes.push(mesh);
    if (isNode) this.customNodeMeshes.push(mesh);

    this.disposables.push(geoClone);
    if (Array.isArray(matClone)) {
      matClone.forEach((m) => this.disposables.push(m));
    } else {
      this.disposables.push(matClone);
    }

    this.pushSceneUndo({
      kind: 'create',
      label: `Duplicar ${target.name}`,
      items: [
        {
          object: mesh,
          parent: target.parent,
          isSculptMesh: isSculpt,
          isNodeMesh: isNode,
        },
      ],
    });

    this.selectAnyMesh(mesh);
    this.syncViewportShading();
    this.notifySculptState();
    this.notifyNodesState();
    return mesh.name;
  }

  public duplicateSelectedSculptObject(): void {
    this.duplicateSelectedObject();
  }

  public deleteSelectedObject(): string | null {
    const target =
      this.selectedMesh ||
      (this.settings.sceneMode === 'sculpt' ? this.activeSculptMesh : null);
    if (!target || !target.parent) return null;

    const parent = target.parent;
    const index = parent.children.indexOf(target);
    const wasSculptMesh = this.sculptMeshes.includes(target);
    const wasNodeMesh = this.customNodeMeshes.includes(target);
    const name = target.name || 'Objeto';

    this.clearSelection();
    parent.remove(target);

    if (wasSculptMesh) {
      this.sculptMeshes = this.sculptMeshes.filter((m) => m !== target);
      this.activeSculptMesh = this.sculptMeshes[this.sculptMeshes.length - 1] ?? null;
    }
    if (wasNodeMesh) {
      this.customNodeMeshes = this.customNodeMeshes.filter((m) => m !== target);
    }

    this.pushSceneUndo({
      kind: 'delete',
      label: `Excluir ${name}`,
      object: target,
      parent,
      index,
      wasSculptMesh,
      wasNodeMesh,
    });

    if (!target.userData.isCustomUserMesh && target.name) {
      this.deletedBuiltinNames.add(target.name);
    }

    this.notifySculptState();
    this.notifyNodesState();
    this.notifyOutliner();
    return name;
  }

  public deleteSelectedSculptObject(): void {
    this.deleteSelectedObject();
  }

  public snapSelectedToGround(): boolean {
    let target: THREE.Object3D | null =
      this.selectedMesh ||
      (this.settings.sceneMode === 'sculpt' ? this.activeSculptMesh : null) ||
      this.loadedGltfRoot;
    if (
      this.loadedGltfRoot &&
      target &&
      target.userData.isHeroGltfMesh &&
      ((target as THREE.SkinnedMesh).isSkinnedMesh || this.loadedMeshCount <= 1)
    ) {
      target = this.loadedGltfRoot;
    }
    if (!target) return false;

    const prevPos = target.position.clone();
    const prevQuat = target.quaternion.clone();
    const prevScale = target.scale.clone();

    target.updateMatrixWorld(true);
    _box3.setFromObject(target);
    const deltaY = -_box3.min.y;
    target.position.y += deltaY;
    if (target === this.loadedGltfRoot) {
      this.gltfBasePos.copy(target.position);
    } else {
      target.userData.userEdited = true;
    }

    this.pushSceneUndo({
      kind: 'transform',
      label: `Alinhar ${target.name || 'Personagem'} ao piso (Y=0)`,
      object: target,
      prevPos,
      prevQuat,
      prevScale,
      nextPos: target.position.clone(),
      nextQuat: target.quaternion.clone(),
      nextScale: target.scale.clone(),
    });

    this.selectionHelper?.update();
    if (this.selectedMesh) this.emitSelectionInfo(this.selectedMesh);
    return true;
  }

  public resetAnimationTrail(): void {
    this.rig.trailCount = 0;
    this.rig.trailPositions.fill(0);
    (this.rig.trailLine.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
      true;
  }

  private selectAnyMesh(mesh: THREE.Mesh): void {
    if (mesh.userData.isSculptObject) {
      this.selectSculptMesh(mesh);
      return;
    }
    this.selectedMesh = mesh;
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.dispose();
    }
    this.selectionHelper = new THREE.BoxHelper(mesh, 0x38bdf8);
    this.selectionHelper.userData.nonSelectable = true;
    this.scene.add(this.selectionHelper);
    this.syncTransformGizmo();
    this.emitSelectionInfo(mesh);
  }

  private selectSculptMesh(mesh: THREE.Mesh): void {
    this.activeSculptMesh = mesh;
    this.selectedMesh = mesh;
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.dispose();
    }
    this.selectionHelper = new THREE.BoxHelper(mesh, 0xf97316);
    this.selectionHelper.userData.nonSelectable = true;
    this.scene.add(this.selectionHelper);
    this.syncTransformGizmo();
    this.emitSelectionInfo(mesh);
  }

  private syncSculptSettings(): void {
    const mat =
      this.settings.sculpt.material === 'redwax'
        ? this.sculptMatcapRedWax
        : this.sculptMatcapClay;
    for (const m of this.sculptMeshes) {
      m.userData.__origMaterial = mat;
      if (this.settings.viewportShading.mode === 'pbr') {
        m.material = mat;
      }
    }
    this.sculptBaseMesh.visible = this.settings.sculpt.baseVisible;
    this.syncTransformGizmo();
  }

  private getSkinnedHarmonicMaterial(): THREE.ShaderMaterial {
    if (this.skinnedHarmonicMaterial) return this.skinnedHarmonicMaterial;

    let vs = this.currentGlslVs;
    // Inject Three.js skinning + morph target support cleanly without touching raw editor GLSL
    const mainMatch = vs.match(/void\s+main\s*\([^)]*\)\s*\{/);
    if (mainMatch && mainMatch.index !== undefined) {
      const header = vs.slice(0, mainMatch.index);
      const body = vs.slice(mainMatch.index + mainMatch[0].length);
      const patchedBody = body
        .replace(/\bposition\b/g, 'transformed')
        .replace(/\bnormal\b/g, 'objectNormal');
      vs = [
        '#include <common>',
        '#include <morphtarget_pars_vertex>',
        '#include <skinning_pars_vertex>',
        header,
        'void main() {',
        '#include <beginnormal_vertex>',
        '#include <morphnormal_vertex>',
        '#include <skinbase_vertex>',
        '#include <skinnormal_vertex>',
        '#include <begin_vertex>',
        '#include <morphtarget_vertex>',
        '#include <skinning_vertex>',
        patchedBody,
      ].join('\n');
    }

    this.skinnedHarmonicMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: this.elapsed },
        uTurbulence: { value: this.settings.turbulence },
        uFrequency: { value: this.settings.frequency },
        uCameraPos: { value: this.camera.position.clone() },
      },
      vertexShader: vs,
      fragmentShader: this.currentGlslFs,
      side: THREE.DoubleSide,
      wireframe: this.settings.viewportShading.wireframe,
    });
    return this.skinnedHarmonicMaterial;
  }

  private syncViewportShading(): void {
    const shading = this.settings.viewportShading;
    const isShaderMode = this.settings.sceneMode === 'shader' && !this.settings.shaderDisabled;
    const groups = [
      this.pbrGroup,
      this.shaderGroup,
      this.gltfGroup,
      this.physicsGroup,
      this.sculptGroup,
      this.nodesGroup,
      this.animationGroup,
      this.activeHeroGltfGroup,
    ];

    const overrideMat: THREE.Material | null =
      shading.mode === 'clay'
        ? this.sculptMatcapClay
        : shading.mode === 'redwax'
          ? this.sculptMatcapRedWax
          : shading.mode === 'chrome'
            ? this.shadeMatChrome
            : shading.mode === 'normals'
              ? this.shadeMatNormals
              : shading.mode === 'uv'
                ? this.shadeMatUv
                : shading.mode === 'cel'
                  ? this.shadeMatCel
                  : null;

    if (overrideMat && 'wireframe' in overrideMat) {
      (overrideMat as THREE.MeshStandardMaterial).wireframe = shading.wireframe;
    }

    this.harmonicMaterial.wireframe = shading.wireframe;
    if (this.skinnedHarmonicMaterial) {
      this.skinnedHarmonicMaterial.wireframe = shading.wireframe;
    }

    for (const grp of groups) {
      if (this.weightPaintSettings.active && grp === this.activeHeroGltfGroup) {
        continue;
      }
      const applySilhouette =
        grp === this.activeHeroGltfGroup &&
        this.settings.sceneMode === 'animation' &&
        this.settings.animation.staging === 'silhouette';
      grp.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !obj.userData.nonSelectable) {
          const mesh = obj as THREE.Mesh;
          if (!mesh.userData.__origMaterial) {
            mesh.userData.__origMaterial = mesh.material;
          }
          if (applySilhouette) {
            mesh.material = this.rig.silhouetteMat;
          } else if (isShaderMode && grp === this.activeHeroGltfGroup) {
            mesh.material = this.getSkinnedHarmonicMaterial();
          } else if (isShaderMode && grp === this.shaderGroup) {
            mesh.material = this.harmonicMaterial;
          } else if (overrideMat) {
            mesh.material = overrideMat;
          } else {
            const orig = mesh.userData.__origMaterial as THREE.Material | THREE.Material[];
            mesh.material = orig;
            const list = Array.isArray(orig) ? orig : [orig];
            for (const m of list) {
              if (m && 'wireframe' in m) {
                const baseWire = m.userData.__origWireframe ?? false;
                if (m.userData.__origWireframe === undefined) {
                  m.userData.__origWireframe = (m as THREE.MeshStandardMaterial).wireframe;
                }
                (m as THREE.MeshStandardMaterial).wireframe = shading.wireframe || baseWire;
              }
            }
          }
        }
      });
    }

    // Bake AO & Tone Mapping exposure from Lighting settings
    if (this.contactShadowMat) {
      this.contactShadowMat.opacity = shading.bakeAo ? 0.92 : 0.48;
    }
    const baseExp = this.settings.lighting?.exposure ?? 1.1;
    this.renderer.toneMappingExposure = baseExp;
  }

  private syncTransformGizmo(): void {
    const gizmo = this.settings.sculpt.gizmoMode;
    const snap = this.settings.snapEnabled;
    this.transformControls.setTranslationSnap(snap ? 0.25 : null);
    this.transformControls.setRotationSnap(snap ? THREE.MathUtils.degToRad(15) : null);
    this.transformControls.setScaleSnap(snap ? 0.1 : null);

    if (gizmo !== 'orbit' && !this.selectedMesh && this.loadedGltfRoot && !this.jointMarkersActive) {
      let firstHeroMesh: THREE.Mesh | null = null;
      this.loadedGltfRoot.traverse((obj) => {
        if (!firstHeroMesh && (obj as THREE.Mesh).isMesh && obj.visible) {
          firstHeroMesh = obj as THREE.Mesh;
        }
      });
      if (firstHeroMesh) {
        this.selectedMesh = firstHeroMesh;
        if (this.selectionHelper) {
          this.scene.remove(this.selectionHelper);
          this.selectionHelper.dispose();
        }
        this.selectionHelper = new THREE.BoxHelper(this.loadedGltfRoot, 0x38bdf8);
        this.selectionHelper.userData.nonSelectable = true;
        this.scene.add(this.selectionHelper);
        this.emitSelectionInfo(firstHeroMesh);
      }
    }

    if (gizmo !== 'orbit' && this.selectedMesh && this.selectedMesh.parent) {
      const attachTarget =
        this.loadedGltfRoot &&
        this.selectedMesh.userData.isHeroGltfMesh &&
        ((this.selectedMesh as THREE.SkinnedMesh).isSkinnedMesh || this.loadedMeshCount <= 1)
          ? this.loadedGltfRoot
          : this.selectedMesh;
      this.transformControls.setMode(gizmo);
      this.transformControls.attach(attachTarget);
      this.transformControls.getHelper().visible = true;
    } else {
      this.transformControls.detach();
      this.transformControls.getHelper().visible = false;
    }
  }

  private syncStagingSettings(): void {
    const isAnim = this.settings.sceneMode === 'animation';
    const staging = isAnim ? this.settings.animation.staging : 'default';
    const aoBoost = 0;
    const l = this.settings.lighting;

    this.scene.environmentIntensity = l.envIntensity;
    this.scene.environmentRotation.set(0, THREE.MathUtils.degToRad(l.envRotationDeg), 0);
    this.renderer.toneMappingExposure = l.exposure;

    if (this.keyLight.shadow) {
      this.keyLight.shadow.intensity = Math.min(1, Math.max(0, l.shadowIntensity));
    }

    if (staging === 'silhouette') {
      this.scene.background = new THREE.Color(0xdbeafe);
      this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.015);
      this.hemiLight.color.setHex(0x93c5fd);
      this.hemiLight.intensity = 0.7;
      this.keyLight.color.setHex(0xfff1e0);
      this.keyLight.intensity = 1.6;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.2;
      return;
    }
    if (staging === 'rim') {
      this.scene.background = new THREE.Color(0x04060a);
      this.scene.fog = new THREE.FogExp2(0x04060a, 0.028);
      this.hemiLight.intensity = 0.14;
      this.keyLight.intensity = 0.35;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 4.4;
      return;
    }

    if (l.preset === 'dramatic') {
      this.scene.background = new THREE.Color(0x05060a);
      this.scene.fog = new THREE.FogExp2(0x05060a, 0.03);
      this.hemiLight.color.setHex(0x475569);
      this.hemiLight.intensity = 0.22;
      this.keyLight.color.setHex(0xffffff);
      this.keyLight.intensity = 3.1 + aoBoost;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 2.6;
      this.softboxA?.color.setHex(0xcbd5e1);
      if (this.softboxA) this.softboxA.intensity = 1.4;
      this.softboxB?.color.setHex(0x38bdf8);
      if (this.softboxB) this.softboxB.intensity = 1.8;
    } else if (l.preset === 'cyber') {
      this.scene.background = new THREE.Color(0x080612);
      this.scene.fog = new THREE.FogExp2(0x080612, 0.026);
      this.hemiLight.color.setHex(0x818cf8);
      this.hemiLight.intensity = 0.48;
      this.keyLight.color.setHex(0xf472b6);
      this.keyLight.intensity = 2.3 + aoBoost;
      this.rimLight.color.setHex(0x22d3ee);
      this.rimLight.intensity = 2.8;
      this.softboxA?.color.setHex(0x22d3ee);
      if (this.softboxA) this.softboxA.intensity = 3.6;
      this.softboxB?.color.setHex(0xe879f9);
      if (this.softboxB) this.softboxB.intensity = 3.2;
    } else if (l.preset === 'sunset') {
      this.scene.background = new THREE.Color(0x110b09);
      this.scene.fog = new THREE.FogExp2(0x110b09, 0.024);
      this.hemiLight.color.setHex(0xfdba74);
      this.hemiLight.intensity = 0.55;
      this.keyLight.color.setHex(0xfb923c);
      this.keyLight.intensity = 2.7 + aoBoost;
      this.rimLight.color.setHex(0x60a5fa);
      this.rimLight.intensity = 1.7;
      this.softboxA?.color.setHex(0xfed7aa);
      if (this.softboxA) this.softboxA.intensity = 3.0;
      this.softboxB?.color.setHex(0x93c5fd);
      if (this.softboxB) this.softboxB.intensity = 2.1;
    } else {
      this.scene.background = new THREE.Color(SCENE_BG);
      this.scene.fog = new THREE.FogExp2(SCENE_BG, 0.024);
      this.hemiLight.color.setHex(0x93c5fd);
      this.hemiLight.intensity = this.settings.viewportShading.bakeAo ? 0.38 : 0.65;
      this.keyLight.color.setHex(0xfff1e0);
      this.keyLight.intensity = 2.2 + aoBoost;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.35;
      this.softboxA?.color.setHex(0xe0f2fe);
      if (this.softboxA) this.softboxA.intensity = 3.2;
      this.softboxB?.color.setHex(0xfef3c7);
      if (this.softboxB) this.softboxB.intensity = 2.4;
    }
  }

  public triggerPhysicsImpulse(): void {
    for (let i = 0; i < this.physicsBodies.length; i++) {
      const b = this.physicsBodies[i];
      b.vel.y += 4.2 + (i % 3) * 1.4;
      b.vel.x += (Math.sin(i * 2.1 + this.elapsed) * 3.2);
      b.vel.z += (Math.cos(i * 1.7 + this.elapsed) * 3.2);
    }
  }

  public async loadGltfFile(
    file: File,
    targetPipeline: 'gltf' | 'sculpt' = 'gltf',
    options?: { autoRigIfStatic?: boolean; rigType?: AutoRigPreset }
  ): Promise<{ name: string; meshes: number; triangles: number; boneCount: number; autoRigged: boolean; clipCount: number }> {
    const lowerName = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();

    const cleanupUrls: string[] = [];
    let gltf: GLTF;

    try {
      if (lowerName.endsWith('.zip')) {
        const archive = unzipSync(new Uint8Array(buffer));
        const blobUrlMap = new Map<string, string>();
        let entryKey: string | null = null;

        for (const [rawPath, bytes] of Object.entries(archive)) {
          if (rawPath.endsWith('/') || rawPath.includes('__MACOSX')) continue;
          const normalized = rawPath.replace(/^\.\//, '');
          const baseName = normalized.split('/').pop() || normalized;
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
          cleanupUrls.push(url);
          blobUrlMap.set(normalized, url);
          blobUrlMap.set(baseName, url);
          if (!entryKey && /\.(glb|gltf)$/i.test(normalized)) {
            entryKey = normalized;
          }
        }

        if (!entryKey) {
          throw new Error('Nenhum arquivo .glb ou .gltf encontrado dentro do .zip.');
        }

        const manager = new THREE.LoadingManager();
        manager.setURLModifier((requestedUrl) => {
          const clean = requestedUrl.split('?')[0].replace(/^\.\//, '');
          const fileOnly = clean.split('/').pop() || clean;
          return blobUrlMap.get(clean) || blobUrlMap.get(fileOnly) || requestedUrl;
        });

        const loader = new GLTFLoader(manager);
        const entryUrl = blobUrlMap.get(entryKey)!;
        gltf = await loader.loadAsync(entryUrl);
      } else {
        const loader = new GLTFLoader();
        gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.parse(
            buffer,
            '',
            (parsed) => resolve(parsed),
            (err) =>
              reject(err instanceof Error ? err : new Error('Erro ao decodificar arquivo glTF/GLB.'))
          );
        });
      }
    } finally {
      for (const url of cleanupUrls) {
        URL.revokeObjectURL(url);
      }
    }

    const rawRoot = gltf.scene || gltf.scenes[0];
    if (!rawRoot) {
      throw new Error('O arquivo não contém nenhuma cena 3D válida.');
    }

    // Center, ground at y = 0, and normalize scale to studio viewport
    rawRoot.updateMatrixWorld(true);
    _box3.setFromObject(rawRoot);
    const center = _box3.getCenter(new THREE.Vector3());
    const size = _box3.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const normScale = 3.2 / maxDim;

    rawRoot.scale.setScalar(normScale);
    rawRoot.position.set(
      -center.x * normScale,
      -_box3.min.y * normScale + 0.15,
      -center.z * normScale
    );
    rawRoot.updateMatrixWorld(true);

    if (targetPipeline === 'sculpt') {
      let meshCount = 0;
      let triCount = 0;
      const mat =
        this.settings.sculpt.material === 'redwax'
          ? this.sculptMatcapRedWax
          : this.sculptMatcapClay;
      const addedMeshes: THREE.Mesh[] = [];

      rawRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const srcMesh = obj as THREE.Mesh;
          if (!srcMesh.geometry) return;
          meshCount++;

          const clonedGeo = srcMesh.geometry.clone();
          clonedGeo.applyMatrix4(srcMesh.matrixWorld);
          clonedGeo.deleteAttribute('uv');
          const welded = mergeVertices(clonedGeo, 1e-4);
          clonedGeo.dispose();
          welded.computeVertexNormals();
          welded.computeBoundingBox();
          welded.computeBoundingSphere();

          const posAttr = welded.getAttribute('position');
          const idxAttr = welded.getIndex();
          triCount += idxAttr ? idxAttr.count / 3 : posAttr ? posAttr.count / 3 : 0;

          const sculptMesh = new THREE.Mesh(welded, mat);
          sculptMesh.name = srcMesh.name || `Malha_${file.name.replace(/\.[^.]+$/, '')}_${meshCount}`;
          sculptMesh.castShadow = !this.isSoftwareGl;
          sculptMesh.receiveShadow = !this.isSoftwareGl;
          sculptMesh.userData.isSculptObject = true;
          sculptMesh.userData.isCustomUserMesh = true;

          this.sculptGroup.add(sculptMesh);
          this.sculptMeshes.push(sculptMesh);
          this.disposables.push(welded);
          addedMeshes.push(sculptMesh);
        }
      });

      if (addedMeshes.length > 0) {
        this.selectSculptMesh(addedMeshes[0]);
        this.notifySculptState();
        this.notifyOutliner();
      }
      return {
        name: file.name,
        meshes: meshCount,
        triangles: Math.round(triCount),
        boneCount: 0,
        autoRigged: false,
        clipCount: 0,
      };
    }

    let finalRoot: THREE.Object3D = rawRoot;
    let clips = gltf.animations ?? [];
    let isAutoRigged = false;
    let extraDisposables: Array<{ dispose: () => void }> = [];

    const initialRigCheck = captureSkeletonMap(rawRoot);
    if (options?.autoRigIfStatic && initialRigCheck.boneCount === 0) {
      const rigOut = autoRigObject(rawRoot, options.rigType ?? 'biped');
      rigOut.riggedRoot.position.set(0, 0.15, 0);
      finalRoot = rigOut.riggedRoot;
      clips = [];
      isAutoRigged = true;
      extraDisposables = rigOut.disposables;
    }

    const stats = this.installHeroGltfRoot(finalRoot, file.name, clips, isAutoRigged, extraDisposables);
    return {
      name: file.name,
      meshes: stats.meshCount,
      triangles: stats.triCount,
      boneCount: stats.boneCount,
      autoRigged: isAutoRigged,
      clipCount: clips.length,
    };
  }

  private installHeroGltfRoot(
    root: THREE.Object3D,
    modelName: string,
    clips: THREE.AnimationClip[],
    isAutoRigged: boolean,
    extraDisposables: Array<{ dispose: () => void }> = []
  ): { meshCount: number; triCount: number; boneCount: number } {
    this.clearLoadedGltf();
    this.gltfDisposables.push(...extraDisposables);

    this.gltfBasePos.copy(root.position);
    this.gltfBaseRot.copy(root.rotation);
    this.gltfBaseScale.copy(root.scale);
    root.updateMatrixWorld(true);
    const rootCenterWorld = _box3.setFromObject(root).getCenter(new THREE.Vector3());

    let meshCount = 0;
    let triCount = 0;

    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        meshCount++;
        mesh.castShadow = !this.isSoftwareGl;
        mesh.receiveShadow = !this.isSoftwareGl;
        mesh.frustumCulled = (mesh as THREE.SkinnedMesh).isSkinnedMesh
          ? false
          : this.settings.frustumCulling;
        mesh.userData.isHeroGltfMesh = true;
        mesh.userData.__gltfBasePos = mesh.position.clone();
        mesh.userData.__origGltfMaterial = mesh.material;
        mesh.userData.__origMaterial = mesh.material;

        // Compute deterministic explode vector per sub-mesh
        _box3.setFromObject(mesh);
        const meshCenter = _box3.getCenter(new THREE.Vector3());
        const explodeDir = meshCenter.sub(rootCenterWorld);
        if (explodeDir.lengthSq() < 0.005) {
          const angle = meshCount * 2.1;
          explodeDir.set(
            Math.cos(angle) * 0.65,
            0.35 * (meshCount % 2 === 0 ? 1 : -0.4),
            Math.sin(angle) * 0.65
          );
        } else {
          explodeDir.normalize();
        }
        mesh.userData.__gltfExplodeDir = explodeDir;

        if (!mesh.name) {
          mesh.name = `Malha_${meshCount}`;
        }
        if (mesh.geometry) {
          mesh.geometry.computeBoundingBox();
          mesh.geometry.computeBoundingSphere();
          const posAttr = mesh.geometry.getAttribute('position');
          const idxAttr = mesh.geometry.getIndex();
          triCount += idxAttr ? idxAttr.count / 3 : posAttr ? posAttr.count / 3 : 0;
          this.gltfDisposables.push(mesh.geometry);
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => this.gltfDisposables.push(m));
          } else {
            this.gltfDisposables.push(mesh.material);
          }
        }
      }
    });

    this.lodDefaultContainer.visible = false;
    this.loadedGltfRoot = root;
    this.loadedModelName = modelName;
    this.loadedMeshCount = meshCount;
    this.gltfSyncedToSculpt = false;
    this.gltfIsAutoRigged = isAutoRigged;
    this.activeHeroGltfGroup.add(root);

    // Capture pure bind/rest pose BEFORE starting any mixer clip
    this.gltfRigMap = captureSkeletonMap(root);

    if (this.gltfRigMap.boneCount > 0) {
      const skelHelper = new THREE.SkeletonHelper(root);
      skelHelper.userData.nonSelectable = true;
      skelHelper.renderOrder = 999;
      const helperMat = skelHelper.material as THREE.LineBasicMaterial;
      helperMat.depthTest = false;
      helperMat.transparent = true;
      helperMat.opacity = 0.92;
      skelHelper.visible = this.settings.animation.showBones && this.activeHeroGltfGroup.visible;
      this.activeHeroGltfGroup.add(skelHelper);
      this.gltfSkeletonHelper = skelHelper;
    }

    this.gltfClips = clips;
    if (this.gltfClips.length > 0) {
      this.gltfMixer = new THREE.AnimationMixer(root);
      if (this.settings.animation.poseSource === 'clip') {
        this.selectGltfClip(0);
      }
    }

    this.clearSelection();
    this.syncSceneModeVisibility();
    this.syncViewportShading();
    this.notifyOutliner();

    return {
      meshCount,
      triCount: Math.round(triCount),
      boneCount: this.gltfRigMap.boneCount,
    };
  }

  public autoRigLoadedGltf(
    rigType: AutoRigPreset = 'biped',
    customMarkers?: CustomJointMarkers
  ): { boneCount: number; meshCount: number } | null {
    if (!this.loadedGltfRoot) return null;
    if (this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
      resetSkeletonToRestPose(this.gltfRigMap);
    }
    this.loadedGltfRoot.position.copy(this.gltfBasePos);
    this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
    this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
    this.loadedGltfRoot.updateMatrixWorld(true);

    const prevName = this.loadedModelName || 'Modelo_Rigado.glb';
    const rigOut = autoRigObject(
      this.loadedGltfRoot,
      rigType,
      customMarkers,
      this.settings.animation.exportProfile ?? 'standard'
    );
    rigOut.riggedRoot.position.set(0, 0.15, 0);

    const stats = this.installHeroGltfRoot(
      rigOut.riggedRoot,
      prevName,
      [],
      true,
      rigOut.disposables
    );
    return { boneCount: stats.boneCount, meshCount: stats.meshCount };
  }

  public startJointMarkerRigging(): boolean {
    if (!this.loadedGltfRoot) return false;
    this.cancelJointMarkerRigging();
    if (this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
      resetSkeletonToRestPose(this.gltfRigMap);
    }
    this.loadedGltfRoot.position.copy(this.gltfBasePos);
    this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
    this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
    this.loadedGltfRoot.updateMatrixWorld(true);

    _box3.setFromObject(this.loadedGltfRoot);
    const center = _box3.getCenter(new THREE.Vector3());
    const minY = _box3.min.y;
    const markers = computeDefaultJointMarkers(this.loadedGltfRoot);

    const colors: Record<HumanoidJointMarkerId, number> = {
      head: 0x38bdf8,
      neck: 0x38bdf8,
      pelvis: 0xfacc15,
      shoulderL: 0x34d399,
      elbowL: 0x34d399,
      wristL: 0x34d399,
      kneeL: 0x34d399,
      ankleL: 0x34d399,
      shoulderR: 0xf472b6,
      elbowR: 0xf472b6,
      wristR: 0xf472b6,
      kneeR: 0xf472b6,
      ankleR: 0xf472b6,
    };

    const geo = new THREE.SphereGeometry(0.055, 16, 12);
    this.disposables.push(geo);

    for (const [id, localPos] of Object.entries(markers) as Array<[HumanoidJointMarkerId, THREE.Vector3]>) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[id],
        depthTest: false,
        transparent: true,
        opacity: 0.92,
      });
      this.disposables.push(mat);
      const sphere = new THREE.Mesh(geo, mat);
      sphere.name = `Marcador_${id}`;
      sphere.renderOrder = 1000;
      sphere.position.set(center.x + localPos.x, minY + localPos.y, center.z + localPos.z);
      sphere.userData.jointMarkerId = id;
      this.jointMarkerGroup.add(sphere);
      this.jointMarkerMeshes.set(id, sphere);
    }

    this.jointMarkersActive = true;
    this.jointMarkerGroup.visible = true;
    this.settings.sculpt.gizmoMode = 'translate';
    const pelvisMarker = this.jointMarkerMeshes.get('pelvis');
    if (pelvisMarker) {
      this.selectAnyMesh(pelvisMarker);
    }
    return true;
  }

  public setJointMarkerSymmetry(enabled: boolean): void {
    this.jointMarkerSymmetry = enabled;
  }

  public cancelJointMarkerRigging(): void {
    this.jointMarkersActive = false;
    this.jointMarkerGroup.visible = false;
    for (const mesh of this.jointMarkerMeshes.values()) {
      if (this.selectedMesh === mesh) this.clearSelection();
      this.jointMarkerGroup.remove(mesh);
    }
    this.jointMarkerMeshes.clear();
  }

  public commitJointMarkerRigging(): { boneCount: number; meshCount: number } | null {
    if (!this.loadedGltfRoot || !this.jointMarkersActive) return null;
    _box3.setFromObject(this.loadedGltfRoot);
    const center = _box3.getCenter(new THREE.Vector3());
    const minY = _box3.min.y;

    const customMarkers = {} as CustomJointMarkers;
    for (const [id, mesh] of this.jointMarkerMeshes.entries()) {
      customMarkers[id] = new THREE.Vector3(
        mesh.position.x - center.x,
        mesh.position.y - minY,
        mesh.position.z - center.z
      );
    }
    this.cancelJointMarkerRigging();
    return this.autoRigLoadedGltf('biped', customMarkers);
  }

  public autoRigSelectedOrActiveSculptMesh(rigType: AutoRigPreset = 'biped'): { name: string; boneCount: number } | null {
    const target =
      (this.selectedMesh && this.selectedMesh.userData.isSculptObject
        ? this.selectedMesh
        : this.activeSculptMesh) || this.sculptMeshes[0];
    if (!target) return null;

    target.updateMatrixWorld(true);
    const modelName = `${target.name || 'Malha_Esculpida'}_Ossos.glb`;
    const rigOut = autoRigObject(target, rigType);
    rigOut.riggedRoot.position.set(0, 0.15, 0);

    const stats = this.installHeroGltfRoot(
      rigOut.riggedRoot,
      modelName,
      [],
      true,
      rigOut.disposables
    );
    this.gltfSyncedToSculpt = true;
    return { name: modelName, boneCount: stats.boneCount };
  }

  public insertRiggedHumanoidModel(): { name: string; boneCount: number } {
    const rigOut = createRiggedHumanoidTemplate(this.settings.animation.exportProfile ?? 'standard');
    rigOut.riggedRoot.position.set(0, 0.15, 0);
    const modelName = 'Humanoide_Com_Ossos.glb';
    const stats = this.installHeroGltfRoot(
      rigOut.riggedRoot,
      modelName,
      [],
      true,
      rigOut.disposables
    );
    return { name: modelName, boneCount: stats.boneCount };
  }

  public selectGltfClip(index: number): void {
    if (!this.gltfMixer || this.gltfClips.length === 0) return;
    const clamped = Math.max(0, Math.min(this.gltfClips.length - 1, index));
    const clip = this.gltfClips[clamped];
    if (!clip) return;
    if (this.gltfActiveAction) {
      this.gltfActiveAction.stop();
    }
    this.gltfActiveClipIndex = clamped;
    const action = this.gltfMixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    this.gltfActiveAction = action;
  }

  public applyFinishToLoadedGltf(finish: MaterialFinish): void {
    if (!this.loadedGltfRoot) return;
    const preset = FINISH_PRESETS[finish];
    let meshIdx = 0;
    this.loadedGltfRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const isPrimary = meshIdx % 2 === 0;
        meshIdx++;
        const isTransmissive = Boolean(preset.transmissive);
        const mat = new THREE.MeshPhysicalMaterial({
          color: isPrimary ? preset.primaryColor : preset.secondaryColor,
          metalness: isPrimary ? preset.primaryMetalness : preset.secondaryMetalness,
          roughness: isPrimary ? preset.primaryRoughness : preset.secondaryRoughness,
          anisotropy: preset.anisotropy,
          clearcoat: preset.clearcoat,
          clearcoatRoughness: preset.clearcoatRoughness,
          iridescence: preset.iridescence ?? 0,
          iridescenceIOR: preset.iridescenceIOR ?? 1.3,
          transmission: isTransmissive && !this.isSoftwareGl ? 0.85 : 0,
          transparent: isTransmissive,
          opacity: isTransmissive && this.isSoftwareGl ? 0.55 : 1,
          ior: preset.ior ?? 1.65,
          dispersion: preset.dispersion ?? 0,
        });
        mat.userData.isPerMeshCloned = true;
        this.disposables.push(mat);
        mesh.userData.__origMaterial = mat;
        if (this.settings.viewportShading.mode === 'pbr' && this.settings.sceneMode !== 'shader') {
          mesh.material = mat;
        }
      }
    });
    if (this.selectedMesh) {
      this.emitSelectionInfo(this.selectedMesh);
    }
  }

  public restoreGltfOriginalMaterials(): void {
    if (!this.loadedGltfRoot) return;
    this.nodesTemplateApplied = false;
    this.loadedGltfRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.userData.__origGltfMaterial) {
        const mesh = obj as THREE.Mesh;
        mesh.userData.__origMaterial = obj.userData.__origGltfMaterial;
      }
    });
    this.syncSceneModeVisibility();
    this.syncViewportShading();
    if (this.selectedMesh) {
      this.emitSelectionInfo(this.selectedMesh);
    }
  }

  public sendLoadedGltfToSculpt(replaceUntouchedPlaceholders = false): number {
    if (!this.loadedGltfRoot) return 0;
    this.loadedGltfRoot.updateMatrixWorld(true);

    if (replaceUntouchedPlaceholders) {
      const onlyUntouchedBuiltins = this.sculptMeshes.every(
        (m) => !m.userData.isCustomUserMesh && !m.userData.userEdited
      );
      if (onlyUntouchedBuiltins) {
        for (const m of this.sculptMeshes) {
          if (this.selectedMesh === m) this.clearSelection();
          this.sculptGroup.remove(m);
        }
        this.sculptMeshes = [];
        this.activeSculptMesh = null;
      }
    }

    const mat =
      this.settings.sculpt.material === 'redwax'
        ? this.sculptMatcapRedWax
        : this.sculptMatcapClay;
    let addedCount = 0;
    let firstAdded: THREE.Mesh | null = null;

    this.loadedGltfRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const srcMesh = obj as THREE.Mesh;
        if (!srcMesh.geometry) return;
        const clonedGeo = srcMesh.geometry.clone();
        clonedGeo.applyMatrix4(srcMesh.matrixWorld);
        clonedGeo.deleteAttribute('uv');
        const welded = mergeVertices(clonedGeo, 1e-4);
        clonedGeo.dispose();
        welded.computeVertexNormals();
        welded.computeBoundingBox();
        welded.computeBoundingSphere();

        addedCount++;
        const sculptMesh = new THREE.Mesh(welded, mat);
        sculptMesh.name = srcMesh.name || `Malha_Importada_${addedCount}`;
        sculptMesh.castShadow = !this.isSoftwareGl;
        sculptMesh.receiveShadow = !this.isSoftwareGl;
        sculptMesh.userData.isSculptObject = true;
        sculptMesh.userData.isCustomUserMesh = true;
        if (replaceUntouchedPlaceholders) {
          sculptMesh.userData.isAutoSyncedFromGltf = true;
        }

        this.sculptGroup.add(sculptMesh);
        this.sculptMeshes.push(sculptMesh);
        this.disposables.push(welded);
        if (!firstAdded) firstAdded = sculptMesh;
      }
    });

    if (firstAdded) {
      this.gltfSyncedToSculpt = true;
      this.selectSculptMesh(firstAdded);
      this.notifySculptState();
      this.notifyOutliner();
    }
    return addedCount;
  }

  public resetToProceduralLodAssembly(): void {
    this.clearLoadedGltf();
    this.lodDefaultContainer.visible = true;
    this.loadedModelName = null;
    this.loadedMeshCount = 0;
    this.gltfSyncedToSculpt = false;
    this.clearSelection();
    this.syncSceneModeVisibility();
    this.syncViewportShading();
    this.notifyOutliner();
  }

  private bakeProceduralClipForExport(
    root: THREE.Object3D,
    rigMap: SkeletonRigMap,
    actionOverride?: AnimationActionCycle
  ): THREE.AnimationClip {
    const fps = 30;
    const duration = 1.6;
    const sampleCount = Math.round(fps * duration) + 1;
    const times: number[] = [];
    const rotMap = new Map<string, number[]>();
    const posMap = new Map<string, number[]>();

    for (const entry of rigMap.bones) {
      rotMap.set(entry.bone.name, []);
      if (entry === rigMap.roles.hips) {
        posMap.set(entry.bone.name, []);
      }
    }

    const animSettings = {
      ...this.settings.animation,
      enabled: true,
      action: actionOverride ?? this.settings.animation.action,
    };
    const trackRootTravel =
      !animSettings.inPlace && (animSettings.action === 'walk' || animSettings.action === 'run');
    if (trackRootTravel && !root.name) {
      root.name = 'VerticeRoot';
    }
    const rootPosValues: number[] = [];
    const rootQuatValues: number[] = [];

    for (let s = 0; s < sampleCount; s++) {
      const t = (s / (sampleCount - 1)) * duration;
      const frame = 1 + (s / (sampleCount - 1)) * 59;
      times.push(Number(t.toFixed(4)));
      applyProceduralPoseToSkeleton(rigMap, root, animSettings, frame, {
        pos: this.gltfBasePos,
        rot: this.gltfBaseRot,
        scale: this.gltfBaseScale,
      });
      if (trackRootTravel) {
        rootPosValues.push(root.position.x, root.position.y, root.position.z);
        rootQuatValues.push(root.quaternion.x, root.quaternion.y, root.quaternion.z, root.quaternion.w);
      }
      for (const entry of rigMap.bones) {
        const q = entry.bone.quaternion;
        const rotArr = rotMap.get(entry.bone.name);
        if (rotArr) {
          rotArr.push(q.x, q.y, q.z, q.w);
        }
        const posArr = posMap.get(entry.bone.name);
        if (posArr) {
          const p = entry.bone.position;
          posArr.push(p.x, p.y, p.z);
        }
      }
    }

    const tracks: THREE.KeyframeTrack[] = [];
    if (trackRootTravel && root.name) {
      tracks.push(new THREE.VectorKeyframeTrack(`${root.name}.position`, times, rootPosValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${root.name}.quaternion`, times, rootQuatValues));
    }
    for (const [boneName, values] of rotMap.entries()) {
      if (values.length > 0) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
      }
    }
    for (const [boneName, values] of posMap.entries()) {
      if (values.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, values));
      }
    }

    return new THREE.AnimationClip(`Vertice_${animSettings.action}`, duration, tracks);
  }

  private cloneClipRemappingBones(
    clip: THREE.AnimationClip,
    renameMap: Map<string, string>
  ): THREE.AnimationClip {
    const cloned = clip.clone();
    if (renameMap.size === 0) return cloned;
    for (const track of cloned.tracks) {
      const dotIdx = track.name.indexOf('.');
      if (dotIdx > 0) {
        const nodePart = track.name.slice(0, dotIdx);
        const propPart = track.name.slice(dotIdx);
        const mapped = renameMap.get(nodePart);
        if (mapped) {
          track.name = `${mapped}${propPart}`;
        }
      }
    }
    return cloned;
  }

  public async exportSampleGlb(
    profile?: RigExportProfile,
    multiActions?: AnimationActionCycle[]
  ): Promise<Blob> {
    const renameMap = new Map<string, string>();
    if (profile && this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
      const beforeNames = this.gltfRigMap.bones.map((b) => ({
        bone: b.bone,
        oldName: b.bone.name,
      }));
      applyRigProfileNaming(this.gltfRigMap, profile);
      for (const item of beforeNames) {
        if (item.bone.name !== item.oldName) {
          renameMap.set(item.oldName, item.bone.name);
        }
      }
    }

    const exportTarget = this.loadedGltfRoot ? this.loadedGltfRoot : this.pbrGroup;
    const savedMaterials: Array<{
      mesh: THREE.Mesh;
      mat: THREE.Material | THREE.Material[];
      vertexColors: boolean;
    }> = [];
    const tempMaterials: THREE.Material[] = [];
    const preset = FINISH_PRESETS[this.settings.finish];
    const prevFrame = this.animFrameFloat;
    const wasWeightPainting = this.weightPaintSettings.active;
    if (wasWeightPainting && this.loadedGltfRoot) {
      disableWeightHeatmapOnRoot(this.loadedGltfRoot);
    }

    // Normalize any ShaderMaterial / shading override into Blender 5.3+ PBR Material
    exportTarget.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const origMat = (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) || mesh.material;
        const baseFirst = Array.isArray(origMat) ? origMat[0] : origMat;
        const hadVertexColors = Boolean((baseFirst as THREE.MeshStandardMaterial | undefined)?.vertexColors);
        savedMaterials.push({ mesh, mat: mesh.material, vertexColors: hadVertexColors });

        const hasColorAttr = Boolean(mesh.geometry?.getAttribute('color'));
        if (origMat && !(origMat as THREE.ShaderMaterial).isShaderMaterial) {
          if (Array.isArray(origMat)) {
            mesh.material = origMat;
          } else {
            if (!hasColorAttr && 'vertexColors' in origMat && origMat.vertexColors) {
              origMat.vertexColors = false;
              origMat.needsUpdate = true;
            }
            mesh.material = origMat;
          }
        } else {
          const fallbackMat = new THREE.MeshPhysicalMaterial({
            name: mesh.name ? `${mesh.name}_Mat` : 'Vertice_PBR_53',
            color: preset.primaryColor,
            metalness: preset.primaryMetalness,
            roughness: preset.primaryRoughness,
            clearcoat: preset.clearcoat,
            clearcoatRoughness: preset.clearcoatRoughness,
            iridescence: preset.iridescence ?? 0,
            iridescenceIOR: preset.iridescenceIOR ?? 1.3,
            transmission: preset.transmissive ? 0.85 : 0,
            transparent: Boolean(preset.transmissive),
            ior: preset.ior ?? 1.65,
            dispersion: preset.dispersion ?? 0,
            emissive: this.nodesTemplateApplied ? preset.accentColor : 0x000000,
            emissiveIntensity: this.nodesTemplateApplied ? 0.85 : 0,
          });
          tempMaterials.push(fallbackMat);
          mesh.material = fallbackMat;
        }
      }
    });

    const animations: THREE.AnimationClip[] = [];
    if (this.loadedGltfRoot) {
      if (multiActions && multiActions.length > 0 && this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
        for (const act of multiActions) {
          animations.push(this.bakeProceduralClipForExport(this.loadedGltfRoot, this.gltfRigMap, act));
        }
        for (const clip of this.gltfClips) {
          animations.push(this.cloneClipRemappingBones(clip, renameMap));
        }
        resetSkeletonToRestPose(this.gltfRigMap);
        this.loadedGltfRoot.position.copy(this.gltfBasePos);
        this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
        this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
        this.loadedGltfRoot.updateMatrixWorld(true);
      } else if (this.settings.animation.poseSource === 'clip' && this.gltfClips.length > 0) {
        for (const clip of this.gltfClips) {
          animations.push(this.cloneClipRemappingBones(clip, renameMap));
        }
      } else if (this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
        animations.push(this.bakeProceduralClipForExport(this.loadedGltfRoot, this.gltfRigMap));
        resetSkeletonToRestPose(this.gltfRigMap);
        this.loadedGltfRoot.position.copy(this.gltfBasePos);
        this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
        this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
        this.loadedGltfRoot.updateMatrixWorld(true);
      }
    }

    const exporter = new GLTFExporter();
    try {
      return await new Promise<Blob>((resolve, reject) => {
        exporter.parse(
          exportTarget,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(new Blob([result], { type: 'model/gltf-binary' }));
            } else {
              const json = JSON.stringify(result, null, 2);
              resolve(new Blob([json], { type: 'model/gltf+json' }));
            }
          },
          (error) => reject(error),
          {
            binary: true,
            onlyVisible: false,
            animations,
          }
        );
      });
    } finally {
      for (const item of savedMaterials) {
        item.mesh.material = item.mat;
      }
      for (const m of tempMaterials) {
        m.dispose();
      }
      if (this.loadedGltfRoot) {
        this.evaluateAnimationAtFrame(prevFrame);
        if (wasWeightPainting) {
          refreshWeightHeatmapOnRoot(
            this.loadedGltfRoot,
            this.weightPaintSettings.selectedBoneName
          );
        }
      }
    }
  }

  public buildBlenderSceneData(profile?: RigExportProfile): RustSceneData {
    const preset = FINISH_PRESETS[this.settings.finish];
    const hexColor = '#' + new THREE.Color(preset.primaryColor).getHexString();
    const accentHex = '#' + new THREE.Color(preset.accentColor).getHexString();
    const baseName = (this.loadedModelName || 'Vertice_Studio')
      .replace(/\.(glb|gltf|zip)$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_');

    const emitters: RustVfxEmitterSpec[] = [];
    if (this.settings.geometryNodes.enabled || this.nodesTemplateApplied) {
      emitters.push({
        name: `${baseName}_AuraNodes`,
        attachBone: this.gltfRigMap?.roles.chest?.bone.name ?? this.gltfRigMap?.bones[0]?.bone.name ?? 'Pelvis',
        emitterType: 'aura',
        rate: Math.max(24, this.settings.geometryNodes.cloneCount * 8),
        lifetime: 36,
        speed: Math.max(0.25, this.settings.geometryNodes.speed),
        spread: Math.max(0.25, this.settings.geometryNodes.strength),
        colorHex: accentHex,
        particleSize: 0.032,
        turbulence: this.settings.turbulence,
      });
    } else {
      emitters.push({
        name: `${baseName}_RimSparks`,
        attachBone: this.gltfRigMap?.roles.hips?.bone.name ?? this.gltfRigMap?.bones[0]?.bone.name ?? 'Pelvis',
        emitterType: 'sparks',
        rate: 32,
        lifetime: 30,
        speed: 0.85,
        spread: 0.45,
        colorHex: accentHex,
        particleSize: 0.025,
        turbulence: this.settings.turbulence,
      });
    }

    const duration =
      this.settings.animation.poseSource === 'clip' && this.gltfClips[this.gltfActiveClipIndex]
        ? Math.max(0.5, this.gltfClips[this.gltfActiveClipIndex].duration)
        : 2.0;

    return {
      sceneName: `${baseName}_${profile ?? this.settings.animation.exportProfile}`,
      fps: 30,
      duration,
      baseColorHex: hexColor,
      metallic: preset.primaryMetalness,
      roughness: preset.primaryRoughness,
      bones: [],
      keyframes: [],
      emitters,
    };
  }

  public buildBlenderSceneExtras(): BlenderSceneSyncExtras {
    return {
      camera: {
        position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
        fov: this.camera.fov,
      },
      lighting: { ...this.settings.lighting },
      geometryNodes:
        this.settings.sceneMode === 'nodes' || this.nodesTemplateApplied
          ? { ...this.settings.geometryNodes, enabled: true }
          : { ...this.settings.geometryNodes, enabled: false },
      clipNames: this.gltfClips.map((c) => c.name),
    };
  }

  public async exportBlenderCompleteZip(
    profile?: RigExportProfile,
    includeTransparentPng = true,
    multiActions?: AnimationActionCycle[]
  ): Promise<Blob> {
    const chosenProfile = profile ?? this.settings.animation.exportProfile;
    const baseName = (this.loadedModelName || `vertice-studio-${chosenProfile}`)
      .replace(/\.(glb|gltf|zip)$/i, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_');
    const glbFilename = `${baseName}_blender53.glb`;

    const glbBlob = await this.exportSampleGlb(chosenProfile, multiActions);
    const glbBytes = new Uint8Array(await glbBlob.arrayBuffer());
    const sceneSpec = this.buildBlenderSceneData(chosenProfile);
    const extras = this.buildBlenderSceneExtras();
    const pythonScript = await generateBlender53PythonScript(sceneSpec, glbFilename, extras);
    const projectJson = this.exportProjectJson();

    let transparentPreviewPngBytes: Uint8Array | undefined;
    if (includeTransparentPng) {
      const dataUrl = this.captureFrame({ transparentBg: true });
      const b64 = dataUrl.split(',')[1] || '';
      const binStr = atob(b64);
      transparentPreviewPngBytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        transparentPreviewPngBytes[i] = binStr.charCodeAt(i);
      }
    }

    return createBlender53ZipBundle({
      glbBytes,
      glbFilename,
      pythonScript,
      pythonFilename: 'abrir_no_blender_5_3.py',
      projectJson,
      transparentPreviewPngBytes,
    });
  }

  private clearPropSocket(): void {
    if (this.propSocketGroup) {
      this.propSocketGroup.parent?.remove(this.propSocketGroup);
      this.propSocketGroup = null;
    }
    for (const d of this.propSocketDisposables) {
      d.dispose();
    }
    this.propSocketDisposables = [];
    this.activePropType = 'none';
  }

  private syncPropSocket(propType: PropSocketType): void {
    if (propType === this.activePropType && (propType === 'none' || this.propSocketGroup?.parent)) {
      return;
    }
    this.clearPropSocket();
    if (propType === 'none') return;

    const handEntry =
      propType === 'shield'
        ? this.gltfRigMap?.roles.leftHand ?? this.gltfRigMap?.roles.leftForeArm
        : this.gltfRigMap?.roles.rightHand ?? this.gltfRigMap?.roles.rightForeArm;
    const targetParent: THREE.Object3D =
      handEntry?.bone ??
      (propType === 'shield' ? this.rig.leftElbow : this.rig.rightHandTip);

    const created = createPropSocketMesh(propType);
    this.propSocketGroup = created.group;
    this.propSocketDisposables = created.disposables;
    this.activePropType = propType;
    targetParent.add(created.group);
  }

  private clearLoadedGltf(): void {
    this.weightPaintSettings.active = false;
    this.isPaintingWeights = false;
    this.cancelJointMarkerRigging();
    this.clearPropSocket();
    if (this.gltfSkeletonHelper) {
      this.activeHeroGltfGroup.remove(this.gltfSkeletonHelper);
      this.gltfSkeletonHelper.dispose();
      this.gltfSkeletonHelper = null;
    }
    this.gltfRigMap = null;
    this.gltfIsAutoRigged = false;

    if (this.gltfMixer) {
      this.gltfMixer.stopAllAction();
      if (this.loadedGltfRoot) {
        this.gltfMixer.uncacheRoot(this.loadedGltfRoot);
      }
      this.gltfMixer = null;
    }
    this.gltfActiveAction = null;
    this.gltfClips = [];
    this.gltfActiveClipIndex = 0;

    if (this.loadedGltfRoot) {
      disableWeightHeatmapOnRoot(this.loadedGltfRoot);
      this.activeHeroGltfGroup.remove(this.loadedGltfRoot);
      this.loadedGltfRoot = null;
    }
    for (const d of this.gltfDisposables) {
      d.dispose();
    }
    this.gltfDisposables = [];
  }

  public getRigBoneNames(): string[] {
    if (!this.gltfRigMap) return [];
    return this.gltfRigMap.bones.map((b) => b.bone.name);
  }

  public setWeightPaintSettings(patch: Partial<WeightPaintSettings>): boolean {
    this.weightPaintSettings = { ...this.weightPaintSettings, ...patch };
    if (!this.loadedGltfRoot) return false;

    if (this.weightPaintSettings.active) {
      const names = this.getRigBoneNames();
      if (names.length === 0) {
        this.weightPaintSettings.active = false;
        return false;
      }
      if (!names.includes(this.weightPaintSettings.selectedBoneName)) {
        this.weightPaintSettings.selectedBoneName = names[0];
      }
      const count = refreshWeightHeatmapOnRoot(
        this.loadedGltfRoot,
        this.weightPaintSettings.selectedBoneName
      );
      if (count === 0) {
        this.weightPaintSettings.active = false;
        return false;
      }
      return true;
    } else {
      disableWeightHeatmapOnRoot(this.loadedGltfRoot);
      this.syncViewportShading();
      return false;
    }
  }

  public setViewportCompareMode(mode: ViewportCompareMode): void {
    this.viewportCompareMode = mode;
  }

  public async retargetMotionClipsFromFile(
    file: File
  ): Promise<{ clipCount: number; names: string[] }> {
    if (!this.loadedGltfRoot || !this.gltfRigMap || this.gltfRigMap.boneCount === 0) {
      throw new Error('Carregue ou aplique Auto-Rig em um personagem antes do Retargeting.');
    }

    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    let parsedClips: THREE.AnimationClip[] = [];

    if (/\.zip$/i.test(file.name)) {
      const files = unzipSync(new Uint8Array(buffer));
      const entryName = Object.keys(files).find((k) => /\.(glb|gltf)$/i.test(k));
      if (!entryName) throw new Error('Nenhum .glb ou .gltf encontrado dentro do .zip.');
      const gltfBytes = files[entryName];
      const copy = new Uint8Array(gltfBytes.byteLength);
      copy.set(gltfBytes);
      const gltf = await new Promise<GLTF>((res, rej) => loader.parse(copy.buffer, '', res, rej));
      parsedClips = gltf.animations ?? [];
    } else {
      const gltf = await new Promise<GLTF>((res, rej) => loader.parse(buffer, '', res, rej));
      parsedClips = gltf.animations ?? [];
    }

    if (parsedClips.length === 0) {
      throw new Error('O arquivo enviado não contém clipes de animação.');
    }

    const addedNames: string[] = [];
    for (const srcClip of parsedClips) {
      const retargeted = retargetAnimationClipToRig(srcClip, this.gltfRigMap);
      if (retargeted.tracks.length > 0) {
        this.gltfClips.push(retargeted);
        addedNames.push(retargeted.name);
      }
    }

    if (addedNames.length === 0) {
      throw new Error('Não foi possível mapear nenhum osso compatível para este personagem.');
    }

    if (!this.gltfMixer) {
      this.gltfMixer = new THREE.AnimationMixer(this.loadedGltfRoot);
    }
    const newIndex = this.gltfClips.length - 1;
    this.selectGltfClip(newIndex);
    this.settings.animation.poseSource = 'clip';
    this.settings.animation.activeClipIndex = newIndex;

    return { clipCount: addedNames.length, names: addedNames };
  }

  public async applyCustomTextureToSelected(
    slot: PbrTextureSlot,
    file: File
  ): Promise<boolean> {
    const mesh = this.selectedMesh;
    if (!mesh) return false;
    const origMat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const targetMat = Array.isArray(origMat) ? origMat[0] : origMat;
    if (!(targetMat instanceof THREE.MeshStandardMaterial)) return false;

    const url = URL.createObjectURL(file);
    try {
      const tex = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
      tex.colorSpace =
        slot === 'map' || slot === 'emissiveMap'
          ? THREE.SRGBColorSpace
          : THREE.NoColorSpace;
      tex.flipY = !Boolean(mesh.userData.isHeroGltfMesh);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;

      const prevTex = targetMat[slot];
      if (prevTex && prevTex.userData?.__isCustomUserTexture) {
        prevTex.dispose();
      }
      tex.userData.__isCustomUserTexture = true;
      targetMat[slot] = tex;
      if (slot === 'emissiveMap') {
        targetMat.emissive.setHex(0xffffff);
        targetMat.emissiveIntensity = Math.max(0.8, targetMat.emissiveIntensity || 1.0);
      }
      targetMat.needsUpdate = true;
      mesh.userData.userEdited = true;
      this.disposables.push(tex);
      this.syncViewportShading();
      this.emitSelectionInfo(mesh);
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public clearCustomTexturesOnSelected(): boolean {
    const mesh = this.selectedMesh;
    if (!mesh) return false;
    const origMat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const targetMat = Array.isArray(origMat) ? origMat[0] : origMat;
    if (!(targetMat instanceof THREE.MeshStandardMaterial)) return false;

    const slots: PbrTextureSlot[] = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
    ];
    for (const s of slots) {
      const tex = targetMat[s];
      if (tex && tex.userData?.__isCustomUserTexture) {
        tex.dispose();
        targetMat[s] = null;
      }
    }
    targetMat.needsUpdate = true;
    this.syncViewportShading();
    this.emitSelectionInfo(mesh);
    return true;
  }

  public compileAndApplyGlsl(vertexSource: string, fragmentSource: string): ShaderCompileResult {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;

    const threeVertexHeader = `
      precision highp float;
      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform mat4 viewMatrix;
      uniform mat3 normalMatrix;
      uniform vec3 cameraPosition;
      attribute vec3 position;
      attribute vec3 normal;
      attribute vec2 uv;
    `;
    const threeFragmentHeader = `
      precision highp float;
      uniform mat4 viewMatrix;
      uniform vec3 cameraPosition;
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) {
      return { ok: false, stage: 'program', message: 'Falha ao alocar objetos shader no contexto WebGL2.' };
    }

    gl.shaderSource(vs, threeVertexHeader + '\n' + vertexSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vs) || 'Erro de sintaxe no Vertex Shader.';
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { ok: false, stage: 'vertex', message: log };
    }

    gl.shaderSource(fs, threeFragmentHeader + '\n' + fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || 'Erro de sintaxe no Fragment Shader.';
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { ok: false, stage: 'fragment', message: log };
    }

    const prog = gl.createProgram();
    if (!prog) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return { ok: false, stage: 'program', message: 'Falha ao criar programa GLSL.' };
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    const linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
    const linkLog = gl.getProgramInfoLog(prog) || '';

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);

    if (!linked) {
      return { ok: false, stage: 'program', message: linkLog || 'Erro ao vincular Vertex e Fragment Shader.' };
    }

    // Compilation verified! Hot-swap ShaderMaterial cleanly
    const nextMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: this.elapsed },
        uTurbulence: { value: this.settings.turbulence },
        uFrequency: { value: this.settings.frequency },
        uCameraPos: { value: this.camera.position.clone() },
      },
      vertexShader: vertexSource,
      fragmentShader: fragmentSource,
    });

    const oldMat = this.harmonicMaterial;
    this.harmonicMaterial = nextMat;
    this.harmonicSphere.material = nextMat;
    oldMat.dispose();

    this.currentGlslVs = vertexSource;
    this.currentGlslFs = fragmentSource;
    if (this.skinnedHarmonicMaterial) {
      this.skinnedHarmonicMaterial.dispose();
      this.skinnedHarmonicMaterial = null;
    }
    this.syncViewportShading();

    return { ok: true, message: 'Shader GLSL compilado e aplicado na GPU sem erros.' };
  }

  public updateSettings(next: RenderSettings): void {
    const prevMode = this.settings.sceneMode;
    const prevFinish = this.settings.finish;
    const prevCulling = this.settings.frustumCulling;
    const prevStaging = this.settings.animation.staging;
    const prevFrame = this.settings.animation.currentFrame;
    const prevClipIdx = this.settings.animation.activeClipIndex;
    const prevPoseSource = this.settings.animation.poseSource;
    const prevShowBones = this.settings.animation.showBones;
    const prevShading = this.settings.viewportShading;
    const prevLighting = this.settings.lighting;
    this.settings = { ...next };

    if (prevFrame !== next.animation.currentFrame && Math.round(this.animFrameFloat) !== next.animation.currentFrame) {
      this.animFrameFloat = next.animation.currentFrame;
      this.lastReportedAnimFrame = next.animation.currentFrame;
    }

    if (prevPoseSource !== next.animation.poseSource) {
      if (next.animation.poseSource === 'clip' && this.gltfMixer && this.gltfClips.length > 0) {
        this.selectGltfClip(next.animation.activeClipIndex);
      } else if (next.animation.poseSource === 'procedural') {
        this.gltfMixer?.stopAllAction();
        this.gltfActiveAction = null;
        if (this.gltfRigMap) {
          resetSkeletonToRestPose(this.gltfRigMap);
        }
      }
    } else if (prevClipIdx !== next.animation.activeClipIndex && next.animation.poseSource === 'clip') {
      this.selectGltfClip(next.animation.activeClipIndex);
    }

    if (prevShowBones !== next.animation.showBones && this.gltfSkeletonHelper) {
      this.gltfSkeletonHelper.visible = next.animation.showBones && this.activeHeroGltfGroup.visible;
    }

    if (next.animation.propType !== this.activePropType) {
      this.syncPropSocket(next.animation.propType);
    }

    if (prevMode !== next.sceneMode) {
      this.syncSceneModeVisibility();
      this.clearSelection();
      if (next.sceneMode === 'nodes') {
        this.notifyNodesState();
      }
      this.syncViewportShading();
      this.syncStagingSettings();
      this.notifyOutliner();
    } else if (
      prevStaging !== next.animation.staging ||
      prevLighting !== next.lighting
    ) {
      if (prevStaging !== next.animation.staging) {
        this.syncViewportShading();
      }
      this.syncStagingSettings();
    }

    if (
      prevShading.mode !== next.viewportShading.mode ||
      prevShading.wireframe !== next.viewportShading.wireframe ||
      prevShading.bakeAo !== next.viewportShading.bakeAo
    ) {
      this.syncViewportShading();
      this.syncStagingSettings();
    }

    if (prevFinish !== next.finish) {
      this.applyFinish(next.finish);
      if (this.loadedGltfRoot && next.sceneMode === 'pbr') {
        this.applyFinishToLoadedGltf(next.finish);
      }
    }
    if (prevCulling !== next.frustumCulling) {
      this.applyFrustumCullingSetting(next.frustumCulling);
    }

    this.syncSculptSettings();

    this.harmonicMaterial.uniforms.uTurbulence.value = next.turbulence;
    this.harmonicMaterial.uniforms.uFrequency.value = next.frequency;
    if (this.skinnedHarmonicMaterial) {
      this.skinnedHarmonicMaterial.uniforms.uTurbulence.value = next.turbulence;
      this.skinnedHarmonicMaterial.uniforms.uFrequency.value = next.frequency;
    }

    if (this.bloomPass) {
      this.bloomPass.strength = next.postProcessing.bloomStrength;
      this.bloomPass.enabled = next.postProcessing.bloomStrength > 0.005;
    }
    if (this.bokehPass) {
      this.bokehPass.enabled = next.postProcessing.dofEnabled;
      const uniforms = this.bokehPass.uniforms as Record<string, THREE.IUniform>;
      if (uniforms.focus) uniforms.focus.value = next.postProcessing.dofFocus;
    }
    if (this.cinematicPass) {
      this.cinematicPass.uniforms.uGrain.value = next.postProcessing.grainAmount;
      this.cinematicPass.uniforms.uChromatic.value = next.postProcessing.chromaticAmount;
    }
  }

  private applyFrustumCullingSetting(enabled: boolean): void {
    this.gltfGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.frustumCulled = enabled;
      }
    });
    this.pbrGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.frustumCulled = enabled;
      }
    });
  }

  public setAutoOrbit(enabled: boolean): void {
    this.autoOrbit = enabled;
  }

  public setAutoQuality(enabled: boolean): void {
    this.autoQuality = enabled;
    if (!enabled) {
      this.qualityScale = 1;
      this.renderer.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (preset === 'orbital') {
      _camTargetPos.set(5.4, 3.6, 6.2);
      _camTargetLook.set(0, 1.45, 0);
    } else if (preset === 'front') {
      _camTargetPos.set(0, 1.75, 6.6);
      _camTargetLook.set(0, 1.55, 0);
    } else if (preset === 'side') {
      _camTargetPos.set(6.8, 1.75, 0.01);
      _camTargetLook.set(0, 1.55, 0);
    } else if (preset === 'macro') {
      _camTargetPos.set(2.4, 2.05, 3.1);
      _camTargetLook.set(0, 1.65, 0);
    } else {
      _camTargetPos.set(0.01, 8.6, 0.8);
      _camTargetLook.set(0, 1.4, 0);
    }
    this.cameraTransitionActive = true;
  }

  public focusSelectedObject(): void {
    const target = this.selectedMesh ?? this.loadedGltfRoot;
    if (!target) return;
    _box3.setFromObject(target);
    const center = _box3.getCenter(new THREE.Vector3());
    const size = _box3.getSize(new THREE.Vector3());
    const dist = Math.max(size.length() * 1.9, 2.5);
    _camTargetLook.copy(center);
    _camTargetPos.set(center.x + dist * 0.75, center.y + dist * 0.45, center.z + dist * 0.75);
    this.cameraTransitionActive = true;
  }

  public clearSelection(): void {
    this.selectedMesh = null;
    this.transformControls?.detach();
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.dispose();
      this.selectionHelper = null;
    }
    this.onSelectionChange?.(null);
  }

  public updateSelectedObjectProperty(patch: {
    position?: [number, number, number];
    rotationDeg?: [number, number, number];
    scale?: [number, number, number];
    colorHex?: string;
    metalness?: number;
    roughness?: number;
    wireframe?: boolean;
    visible?: boolean;
    frustumCulled?: boolean;
  }): void {
    const mesh = this.selectedMesh;
    if (!mesh) return;

    const hasTransformPatch =
      patch.position !== undefined ||
      patch.rotationDeg !== undefined ||
      patch.scale !== undefined;
    const hasPropPatch =
      patch.colorHex !== undefined ||
      patch.metalness !== undefined ||
      patch.roughness !== undefined ||
      patch.wireframe !== undefined ||
      patch.visible !== undefined ||
      patch.frustumCulled !== undefined;

    const prevPos = mesh.position.clone();
    const prevQuat = mesh.quaternion.clone();
    const prevScale = mesh.scale.clone();

    const origMat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const mat = Array.isArray(origMat) ? origMat[0] : origMat;
    const isStd = mat instanceof THREE.MeshStandardMaterial;
    const prevProp = {
      visible: mesh.visible,
      frustumCulled: mesh.frustumCulled,
      wireframe: mat && 'wireframe' in mat ? Boolean((mat as THREE.MeshStandardMaterial).wireframe) : false,
      colorHex: isStd ? '#' + mat.color.getHexString() : undefined,
      metalness: isStd ? mat.metalness : undefined,
      roughness: isStd ? mat.roughness : undefined,
    };

    if (patch.position) {
      mesh.position.set(patch.position[0], patch.position[1], patch.position[2]);
      mesh.userData.userEdited = true;
    }
    if (patch.rotationDeg) {
      mesh.rotation.set(
        THREE.MathUtils.degToRad(patch.rotationDeg[0]),
        THREE.MathUtils.degToRad(patch.rotationDeg[1]),
        THREE.MathUtils.degToRad(patch.rotationDeg[2])
      );
      mesh.userData.userEdited = true;
    }
    if (patch.scale) {
      mesh.scale.set(patch.scale[0], patch.scale[1], patch.scale[2]);
      mesh.userData.userEdited = true;
    }
    if (patch.visible !== undefined) {
      mesh.visible = patch.visible;
    }
    if (patch.frustumCulled !== undefined) {
      mesh.frustumCulled = patch.frustumCulled;
    }

    if (mat) {
      if (patch.wireframe !== undefined && 'wireframe' in mat) {
        (mat as THREE.MeshStandardMaterial).wireframe = patch.wireframe;
      }
      if (mat instanceof THREE.MeshStandardMaterial) {
        if (patch.colorHex !== undefined) mat.color.set(patch.colorHex);
        if (patch.metalness !== undefined) mat.metalness = patch.metalness;
        if (patch.roughness !== undefined) mat.roughness = patch.roughness;
      }
    }

    if (hasTransformPatch) {
      this.pushSceneUndo({
        kind: 'transform',
        label: `Editar ${mesh.name}`,
        object: mesh,
        prevPos,
        prevQuat,
        prevScale,
        nextPos: mesh.position.clone(),
        nextQuat: mesh.quaternion.clone(),
        nextScale: mesh.scale.clone(),
      });
    }

    if (hasPropPatch) {
      this.pushSceneUndo({
        kind: 'property',
        label: `Material de ${mesh.name}`,
        mesh,
        prev: prevProp,
        next: {
          visible: mesh.visible,
          frustumCulled: mesh.frustumCulled,
          wireframe: mat && 'wireframe' in mat ? Boolean((mat as THREE.MeshStandardMaterial).wireframe) : false,
          colorHex: mat instanceof THREE.MeshStandardMaterial ? '#' + mat.color.getHexString() : undefined,
          metalness: mat instanceof THREE.MeshStandardMaterial ? mat.metalness : undefined,
          roughness: mat instanceof THREE.MeshStandardMaterial ? mat.roughness : undefined,
        },
      });
    }

    this.selectionHelper?.update();
    this.emitSelectionInfo(mesh);
    if (patch.visible !== undefined) {
      this.notifyOutliner();
    }
  }

  private getActiveModeGroup(): THREE.Group {
    return this.settings.sceneMode === 'pbr'
      ? this.pbrGroup
      : this.settings.sceneMode === 'instanced'
        ? this.instancedGroup
        : this.settings.sceneMode === 'shader'
          ? this.shaderGroup
          : this.settings.sceneMode === 'physics'
            ? this.physicsGroup
            : this.settings.sceneMode === 'sculpt'
              ? this.sculptGroup
              : this.settings.sceneMode === 'nodes'
                ? this.nodesGroup
                : this.settings.sceneMode === 'animation'
                  ? this.animationGroup
                  : this.gltfGroup;
  }

  public getSceneOutlinerItems(): SceneOutlinerItem[] {
    const group = this.getActiveModeGroup();
    const items: SceneOutlinerItem[] = [];
    const seen = new Set<string>();

    const collectFrom = (rootObj: THREE.Object3D) => {
      if (!rootObj.visible) return;
      rootObj.traverse((obj) => {
        if (!obj.visible && obj !== rootObj && !(obj as THREE.Mesh).isMesh) return;
        if ((obj as THREE.Mesh).isMesh && !obj.userData.nonSelectable) {
          const mesh = obj as THREE.Mesh;
          if (seen.has(mesh.uuid)) return;
          if (mesh.userData.isMoGraphClone && !mesh.visible) return;
          // Skip hidden procedural hero containers when a GLB character replaced them
          let ancestor = mesh.parent;
          while (ancestor && ancestor !== rootObj) {
            if (!ancestor.visible) return;
            ancestor = ancestor.parent;
          }
          seen.add(mesh.uuid);
          const posAttr = mesh.geometry?.getAttribute('position');
          const idxAttr = mesh.geometry?.getIndex();
          const tris = idxAttr ? idxAttr.count / 3 : posAttr ? posAttr.count / 3 : 0;
          items.push({
            uuid: mesh.uuid,
            name: mesh.name || 'Malha 3D',
            triangles: Math.round(tris),
            visible: mesh.visible,
            isSculptObject: Boolean(mesh.userData.isSculptObject),
          });
        }
      });
    };

    if (this.activeHeroGltfGroup.visible) {
      collectFrom(this.activeHeroGltfGroup);
    }
    collectFrom(group);
    return items.slice(0, 80);
  }

  private notifyOutliner(): void {
    this.onOutlinerChange?.(this.getSceneOutlinerItems());
  }

  private findMeshByUuid(uuid: string): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    this.scene.traverse((obj) => {
      if (!found && obj.uuid === uuid && (obj as THREE.Mesh).isMesh) {
        found = obj as THREE.Mesh;
      }
    });
    return found;
  }

  public selectObjectByUuid(uuid: string): boolean {
    const mesh = this.findMeshByUuid(uuid);
    if (!mesh) return false;
    this.selectAnyMesh(mesh);
    return true;
  }

  public toggleObjectVisibilityByUuid(uuid: string): boolean {
    const mesh = this.findMeshByUuid(uuid);
    if (!mesh) return false;
    const prevVis = mesh.visible;
    mesh.visible = !prevVis;
    const mat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const targetMat = Array.isArray(mat) ? mat[0] : mat;
    const wire = targetMat && 'wireframe' in targetMat ? Boolean((targetMat as THREE.MeshStandardMaterial).wireframe) : false;
    this.pushSceneUndo({
      kind: 'property',
      label: `${mesh.visible ? 'Mostrar' : 'Ocultar'} ${mesh.name}`,
      mesh,
      prev: { visible: prevVis, frustumCulled: mesh.frustumCulled, wireframe: wire },
      next: { visible: mesh.visible, frustumCulled: mesh.frustumCulled, wireframe: wire },
    });
    if (this.selectedMesh === mesh) this.emitSelectionInfo(mesh);
    this.notifyOutliner();
    return true;
  }

  public deleteObjectByUuid(uuid: string): string | null {
    const mesh = this.findMeshByUuid(uuid);
    if (!mesh) return null;
    this.selectedMesh = mesh;
    return this.deleteSelectedObject();
  }

  public applyMaterialPresetToSelected(presetId: MaterialPresetId): boolean {
    const mesh = this.selectedMesh;
    if (!mesh) return false;

    const origMat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const currentMat = Array.isArray(origMat) ? origMat[0] : origMat;
    const isStd = currentMat instanceof THREE.MeshStandardMaterial;

    const prevSnap = {
      visible: mesh.visible,
      frustumCulled: mesh.frustumCulled,
      wireframe: currentMat && 'wireframe' in currentMat ? Boolean((currentMat as THREE.MeshStandardMaterial).wireframe) : false,
      colorHex: isStd ? '#' + currentMat.color.getHexString() : undefined,
      metalness: isStd ? currentMat.metalness : undefined,
      roughness: isStd ? currentMat.roughness : undefined,
      emissiveHex: isStd ? '#' + currentMat.emissive.getHexString() : undefined,
      emissiveIntensity: isStd ? currentMat.emissiveIntensity : undefined,
      opacity: currentMat ? currentMat.opacity : undefined,
      transparent: currentMat ? currentMat.transparent : undefined,
    };

    const presetConfigs: Record<
      MaterialPresetId,
      {
        color: number;
        metalness: number;
        roughness: number;
        emissive: number;
        emissiveIntensity: number;
        clearcoat: number;
        opacity: number;
        transparent: boolean;
      }
    > = {
      frosted_glass: {
        color: 0xe0f2fe,
        metalness: 0.08,
        roughness: 0.18,
        emissive: 0x000000,
        emissiveIntensity: 0,
        clearcoat: 0.9,
        opacity: 0.55,
        transparent: true,
      },
      carbon: {
        color: 0x1e2430,
        metalness: 0.55,
        roughness: 0.34,
        emissive: 0x000000,
        emissiveIntensity: 0,
        clearcoat: 0.85,
        opacity: 1,
        transparent: false,
      },
      brushed_copper: {
        color: 0xd97745,
        metalness: 0.94,
        roughness: 0.24,
        emissive: 0x000000,
        emissiveIntensity: 0,
        clearcoat: 0.3,
        opacity: 1,
        transparent: false,
      },
      matte_ceramic: {
        color: 0xf1f5f9,
        metalness: 0.04,
        roughness: 0.72,
        emissive: 0x000000,
        emissiveIntensity: 0,
        clearcoat: 0.25,
        opacity: 1,
        transparent: false,
      },
      neon_glow: {
        color: 0x38bdf8,
        metalness: 0.2,
        roughness: 0.2,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.85,
        clearcoat: 0.5,
        opacity: 1,
        transparent: false,
      },
      obsidian_rubber: {
        color: 0x11151d,
        metalness: 0.12,
        roughness: 0.86,
        emissive: 0x000000,
        emissiveIntensity: 0,
        clearcoat: 0.05,
        opacity: 1,
        transparent: false,
      },
    };

    const cfg = presetConfigs[presetId];
    let targetMat: THREE.MeshPhysicalMaterial;
    if (currentMat instanceof THREE.MeshPhysicalMaterial && currentMat.userData.isPerMeshCloned) {
      targetMat = currentMat;
    } else {
      targetMat = new THREE.MeshPhysicalMaterial();
      targetMat.userData.isPerMeshCloned = true;
      this.disposables.push(targetMat);
      mesh.userData.__origMaterial = targetMat;
      if (this.settings.viewportShading.mode === 'pbr') {
        mesh.material = targetMat;
      }
    }

    targetMat.color.setHex(cfg.color);
    targetMat.metalness = cfg.metalness;
    targetMat.roughness = cfg.roughness;
    targetMat.emissive.setHex(cfg.emissive);
    targetMat.emissiveIntensity = cfg.emissiveIntensity;
    targetMat.clearcoat = cfg.clearcoat;
    targetMat.opacity = cfg.opacity;
    targetMat.transparent = cfg.transparent;
    targetMat.needsUpdate = true;

    this.pushSceneUndo({
      kind: 'property',
      label: `Material ${presetId}`,
      mesh,
      prev: prevSnap,
      next: {
        visible: mesh.visible,
        frustumCulled: mesh.frustumCulled,
        wireframe: targetMat.wireframe,
        colorHex: '#' + targetMat.color.getHexString(),
        metalness: targetMat.metalness,
        roughness: targetMat.roughness,
        emissiveHex: '#' + targetMat.emissive.getHexString(),
        emissiveIntensity: targetMat.emissiveIntensity,
        opacity: targetMat.opacity,
        transparent: targetMat.transparent,
      },
    });

    this.emitSelectionInfo(mesh);
    return true;
  }

  public startTurntableRecording(
    durationSec = 6,
    onComplete: (blob: Blob | null, error?: string) => void
  ): boolean {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      return false;
    }
    const canvas = this.renderer.domElement;
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      onComplete(null, 'Gravação WebM não suportada neste navegador.');
      return false;
    }

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    try {
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_500_000,
      });
    } catch {
      onComplete(null, 'Não foi possível iniciar o gravador de vídeo.');
      return false;
    }

    this.recordingPrevAutoOrbit = this.autoOrbit;
    this.autoOrbit = true;

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) this.recordedChunks.push(ev.data);
    };
    this.mediaRecorder.onstop = () => {
      if (this.recordingTimeoutId) {
        window.clearTimeout(this.recordingTimeoutId);
        this.recordingTimeoutId = null;
      }
      if (this.recordingPrevAutoOrbit !== null) {
        this.autoOrbit = this.recordingPrevAutoOrbit;
        this.recordingPrevAutoOrbit = null;
      }
      const blob =
        this.recordedChunks.length > 0
          ? new Blob(this.recordedChunks, { type: mimeType })
          : null;
      this.recordedChunks = [];
      this.mediaRecorder = null;
      onComplete(blob);
    };

    this.mediaRecorder.start(200);
    this.recordingTimeoutId = window.setTimeout(() => {
      this.stopTurntableRecording();
    }, durationSec * 1000);
    return true;
  }

  public stopTurntableRecording(): void {
    if (this.recordingTimeoutId) {
      window.clearTimeout(this.recordingTimeoutId);
      this.recordingTimeoutId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  public exportProjectJson(): string {
    const customMeshes: Array<{ group: 'sculpt' | 'nodes'; json: unknown }> = [];
    const overrides: Array<{
      name: string;
      position: number[];
      quaternion: number[];
      scale: number[];
      visible: boolean;
      colorHex?: string;
      metalness?: number;
      roughness?: number;
      emissiveHex?: string;
      emissiveIntensity?: number;
    }> = [];

    const collectGroup = (grp: THREE.Group, groupKey: 'sculpt' | 'nodes' | 'other') => {
      grp.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !obj.userData.nonSelectable) {
          const mesh = obj as THREE.Mesh;
          if (mesh.userData.isCustomUserMesh && (groupKey === 'sculpt' || groupKey === 'nodes')) {
            customMeshes.push({ group: groupKey, json: mesh.toJSON() });
          } else if (mesh.name && (mesh.userData.userEdited || !mesh.visible)) {
            const origMat =
              (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
              mesh.material;
            const mat = Array.isArray(origMat) ? origMat[0] : origMat;
            const isStd = mat instanceof THREE.MeshStandardMaterial;
            overrides.push({
              name: mesh.name,
              position: mesh.position.toArray(),
              quaternion: mesh.quaternion.toArray(),
              scale: mesh.scale.toArray(),
              visible: mesh.visible,
              colorHex: isStd ? '#' + mat.color.getHexString() : undefined,
              metalness: isStd ? mat.metalness : undefined,
              roughness: isStd ? mat.roughness : undefined,
              emissiveHex: isStd ? '#' + mat.emissive.getHexString() : undefined,
              emissiveIntensity: isStd ? mat.emissiveIntensity : undefined,
            });
          }
        }
      });
    };

    collectGroup(this.pbrGroup, 'other');
    collectGroup(this.sculptGroup, 'sculpt');
    collectGroup(this.nodesGroup, 'nodes');
    collectGroup(this.shaderGroup, 'other');
    collectGroup(this.animationGroup, 'other');

    return JSON.stringify(
      {
        version: 1,
        app: 'Vértice Studio',
        savedAt: new Date().toISOString(),
        settings: this.settings,
        camera: {
          position: this.camera.position.toArray(),
          target: this.controls.target.toArray(),
        },
        deletedBuiltins: Array.from(this.deletedBuiltinNames),
        overrides,
        customMeshes,
      },
      null,
      2
    );
  }

  public importProjectJson(rawJson: string): {
    ok: boolean;
    settings?: RenderSettings;
    message: string;
  } {
    try {
      const data = JSON.parse(rawJson) as {
        version?: number;
        settings?: RenderSettings;
        camera?: { position?: number[]; target?: number[] };
        deletedBuiltins?: string[];
        overrides?: Array<{
          name: string;
          position?: number[];
          quaternion?: number[];
          scale?: number[];
          visible?: boolean;
          colorHex?: string;
          metalness?: number;
          roughness?: number;
          emissiveHex?: string;
          emissiveIntensity?: number;
        }>;
        customMeshes?: Array<{ group: 'sculpt' | 'nodes'; json: unknown }>;
      };

      if (data.version !== 1 || !data.settings) {
        return { ok: false, message: 'Arquivo de projeto inválido ou incompatível.' };
      }

      this.clearSelection();

      if (data.camera?.position?.length === 3) {
        this.camera.position.fromArray(data.camera.position);
      }
      if (data.camera?.target?.length === 3) {
        this.controls.target.fromArray(data.camera.target);
        this.controls.update();
      }

      if (Array.isArray(data.deletedBuiltins)) {
        const delSet = new Set(data.deletedBuiltins);
        this.deletedBuiltinNames = delSet;
        this.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && !obj.userData.isCustomUserMesh && obj.name && delSet.has(obj.name)) {
            obj.visible = false;
          }
        });
      }

      if (Array.isArray(data.overrides)) {
        const byName = new Map(data.overrides.map((o) => [o.name, o]));
        this.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.name && byName.has(obj.name)) {
            const ov = byName.get(obj.name)!;
            if (ov.position?.length === 3) obj.position.fromArray(ov.position);
            if (ov.quaternion?.length === 4) obj.quaternion.fromArray(ov.quaternion);
            if (ov.scale?.length === 3) obj.scale.fromArray(ov.scale);
            if (ov.visible !== undefined) obj.visible = ov.visible;
            obj.userData.userEdited = true;
            const mesh = obj as THREE.Mesh;
            const origMat =
              (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
              mesh.material;
            const mat = Array.isArray(origMat) ? origMat[0] : origMat;
            if (mat instanceof THREE.MeshStandardMaterial) {
              if (ov.colorHex) mat.color.set(ov.colorHex);
              if (ov.metalness !== undefined) mat.metalness = ov.metalness;
              if (ov.roughness !== undefined) mat.roughness = ov.roughness;
              if (ov.emissiveHex) mat.emissive.set(ov.emissiveHex);
              if (ov.emissiveIntensity !== undefined) mat.emissiveIntensity = ov.emissiveIntensity;
            }
          }
        });
      }

      if (Array.isArray(data.customMeshes) && data.customMeshes.length > 0) {
        const loader = new THREE.ObjectLoader();
        for (const entry of data.customMeshes) {
          const parsed = loader.parse(entry.json as THREE.Object3DJSON);
          if ((parsed as THREE.Mesh).isMesh) {
            const mesh = parsed as THREE.Mesh;
            mesh.userData.isCustomUserMesh = true;
            mesh.castShadow = !this.isSoftwareGl;
            mesh.receiveShadow = !this.isSoftwareGl;
            if (entry.group === 'sculpt') {
              mesh.userData.isSculptObject = true;
              this.sculptGroup.add(mesh);
              this.sculptMeshes.push(mesh);
            } else {
              mesh.userData.isNodeMesh = true;
              this.nodesGroup.add(mesh);
              this.customNodeMeshes.push(mesh);
            }
            if (mesh.geometry) this.disposables.push(mesh.geometry);
          }
        }
      }

      this.updateSettings(data.settings);
      this.notifySculptState();
      this.notifyNodesState();
      this.notifyOutliner();
      return {
        ok: true,
        settings: data.settings,
        message: 'Projeto carregado com sucesso.',
      };
    } catch {
      return { ok: false, message: 'Não foi possível ler o arquivo de projeto JSON.' };
    }
  }

  private emitSelectionInfo(mesh: THREE.Mesh): void {
    const origMat =
      (mesh.userData.__origMaterial as THREE.Material | THREE.Material[] | undefined) ||
      mesh.material;
    const mat = Array.isArray(origMat) ? origMat[0] : origMat;
    const isStd = mat instanceof THREE.MeshStandardMaterial;
    const posAttr = mesh.geometry?.getAttribute('position');
    const idxAttr = mesh.geometry?.getIndex();
    const tris = idxAttr ? idxAttr.count / 3 : posAttr ? posAttr.count / 3 : 0;

    this.onSelectionChange?.({
      uuid: mesh.uuid,
      name: mesh.name || 'Malha 3D',
      geometryType: mesh.geometry?.type || 'BufferGeometry',
      triangles: Math.round(tris),
      position: [
        Number(mesh.position.x.toFixed(2)),
        Number(mesh.position.y.toFixed(2)),
        Number(mesh.position.z.toFixed(2)),
      ],
      rotationDeg: [
        Math.round(THREE.MathUtils.radToDeg(mesh.rotation.x)),
        Math.round(THREE.MathUtils.radToDeg(mesh.rotation.y)),
        Math.round(THREE.MathUtils.radToDeg(mesh.rotation.z)),
      ],
      scale: [
        Number(mesh.scale.x.toFixed(2)),
        Number(mesh.scale.y.toFixed(2)),
        Number(mesh.scale.z.toFixed(2)),
      ],
      colorHex: isStd ? '#' + mat.color.getHexString() : '#b93829',
      metalness: isStd ? Number(mat.metalness.toFixed(2)) : 0,
      roughness: isStd ? Number(mat.roughness.toFixed(2)) : 0,
      wireframe: mat && 'wireframe' in mat ? Boolean((mat as THREE.MeshStandardMaterial).wireframe) : false,
      visible: mesh.visible,
      frustumCulled: mesh.frustumCulled,
      hasStandardMaterial: isStd,
      isSculptObject: Boolean(mesh.userData.isSculptObject),
    });
  }

  private applyWeightPaintAtPointer(e: PointerEvent): void {
    if (!this.weightPaintSettings.active || !this.loadedGltfRoot) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.loadedGltfRoot, true);
    const hit = hits.find((h) => (h.object as THREE.SkinnedMesh).isSkinnedMesh);
    if (!hit) return;

    const skinned = hit.object as THREE.SkinnedMesh;
    const allNames = this.getRigBoneNames();
    const mirrorBone = findMirrorBoneName(
      this.weightPaintSettings.selectedBoneName,
      allNames
    );
    const changed = paintSkinWeightStroke(
      skinned,
      hit.point,
      this.weightPaintSettings.selectedBoneName,
      {
        mode: this.weightPaintSettings.brushMode,
        radius: this.weightPaintSettings.brushRadius,
        strength: this.weightPaintSettings.strength,
        symmetryX: this.weightPaintSettings.symmetryX,
        mirrorBoneName: mirrorBone,
      }
    );
    if (changed > 0) {
      refreshWeightHeatmapOnRoot(
        this.loadedGltfRoot,
        this.weightPaintSettings.selectedBoneName
      );
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    if (e.button === 0 && this.weightPaintSettings.active && this.loadedGltfRoot) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(_pointerNdc, this.camera);
      const hits = this.raycaster.intersectObject(this.loadedGltfRoot, true);
      if (hits.some((h) => (h.object as THREE.SkinnedMesh).isSkinnedMesh)) {
        this.isPaintingWeights = true;
        this.controls.enabled = false;
        this.applyWeightPaintAtPointer(e);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.isPaintingWeights) {
      this.applyWeightPaintAtPointer(e);
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.sculptBrushCursor.visible = false;

    if (this.settings.sceneMode !== 'physics' && this.settings.sceneMode !== 'instanced') {
      return;
    }
    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    this.raycaster.ray.intersectPlane(_cursorPlane, _cursorWorld);
    this.cursorActive = true;
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.isPaintingWeights) {
      this.isPaintingWeights = false;
      this.controls.enabled = true;
      return;
    }

    if (this.isSculpting) {
      this.isSculpting = false;
      this.controls.enabled = true;
      if (this.activeSculptStrokeStart) {
        const { mesh, positions: prevPositions } = this.activeSculptStrokeStart;
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (posAttr) {
          this.pushSceneUndo({
            kind: 'geometry',
            label: `Esculpir ${mesh.name}`,
            mesh,
            prevPositions,
            nextPositions: new Float32Array(posAttr.array as Float32Array),
          });
        }
        this.activeSculptStrokeStart = null;
      }
      if (this.selectedMesh) {
        this.selectionHelper?.update();
        this.emitSelectionInfo(this.selectedMesh);
      }
      return;
    }

    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (Math.hypot(dx, dy) > 5) return; // Ignore orbit drag gestures

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const activeGroup =
      this.settings.sceneMode === 'pbr'
        ? this.pbrGroup
        : this.settings.sceneMode === 'instanced'
          ? this.instancedGroup
          : this.settings.sceneMode === 'shader'
            ? this.shaderGroup
            : this.settings.sceneMode === 'physics'
              ? this.physicsGroup
              : this.settings.sceneMode === 'sculpt'
                ? this.sculptGroup
                : this.settings.sceneMode === 'nodes'
                  ? this.nodesGroup
                  : this.settings.sceneMode === 'animation'
                    ? this.animationGroup
                    : this.gltfGroup;

    const pickTargets: THREE.Object3D[] = [];
    if (this.jointMarkersActive && this.jointMarkerGroup.visible) {
      pickTargets.push(this.jointMarkerGroup);
    }
    if (this.activeHeroGltfGroup.visible) {
      pickTargets.push(this.activeHeroGltfGroup);
    }
    if (activeGroup.visible) {
      pickTargets.push(activeGroup);
    }

    const hits = this.raycaster.intersectObjects(pickTargets, true);
    const hitMesh = hits.find(
      (h) => (h.object as THREE.Mesh).isMesh && !h.object.userData.nonSelectable
    )?.object as THREE.Mesh | undefined;

    if (!hitMesh) {
      this.clearSelection();
      return;
    }

    this.selectAnyMesh(hitMesh);
  };

  private resolveCaptureDimensions(
    resolution?: ExportCaptureResolution
  ): { width: number; height: number } | null {
    if (!resolution || resolution === 'viewport') return null;
    const maxTex = Math.min(4096, this.renderer.capabilities.maxTextureSize || 4096);
    const map: Record<Exclude<ExportCaptureResolution, 'viewport'>, [number, number]> = {
      '1080x1080': [1080, 1080],
      '1920x1080': [1920, 1080],
      '1080x1920': [1080, 1920],
      '3840x2160': [3840, 2160],
    };
    const [rawW, rawH] = map[resolution];
    const scale = Math.min(1, maxTex / Math.max(rawW, rawH));
    return {
      width: Math.max(64, Math.round(rawW * scale)),
      height: Math.max(64, Math.round(rawH * scale)),
    };
  }

  public captureFrame(options?: {
    transparentBg?: boolean;
    resolution?: ExportCaptureResolution;
  }): string {
    const transparentBg = Boolean(options?.transparentBg);
    const customSize = this.resolveCaptureDimensions(options?.resolution);

    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevAspect = this.camera.aspect;

    if (customSize) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(customSize.width, customSize.height, false);
      this.camera.aspect = customSize.width / customSize.height;
      this.camera.updateProjectionMatrix();
    }

    try {
      if (transparentBg) {
        const prevBg = this.scene.background;
        const prevFog = this.scene.fog;
        const prevClearColor = new THREE.Color();
        this.renderer.getClearColor(prevClearColor);
        const prevClearAlpha = this.renderer.getClearAlpha();
        const prevGroundVis = this.stageGroundMeshes.map((m) => m.visible);
        const gizmoHelper = this.transformControls.getHelper();
        const prevGizmoVis = gizmoHelper.visible;
        const prevSelVis = this.selectionHelper?.visible ?? false;
        const prevSkelVis = this.gltfSkeletonHelper?.visible ?? false;
        const prevMarkerVis = this.jointMarkerGroup.visible;

        this.scene.background = null;
        this.scene.fog = null;
        this.stageGroundMeshes.forEach((m) => {
          m.visible = false;
        });
        gizmoHelper.visible = false;
        if (this.selectionHelper) this.selectionHelper.visible = false;
        if (this.gltfSkeletonHelper) this.gltfSkeletonHelper.visible = false;
        this.jointMarkerGroup.visible = false;

        this.renderer.setRenderTarget(null);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear(true, true, true);
        this.renderer.render(this.scene, this.camera);
        const dataUrl = this.renderer.domElement.toDataURL('image/png');

        this.scene.background = prevBg;
        this.scene.fog = prevFog;
        this.renderer.setClearColor(prevClearColor, prevClearAlpha);
        this.stageGroundMeshes.forEach((m, idx) => {
          m.visible = prevGroundVis[idx] ?? true;
        });
        gizmoHelper.visible = prevGizmoVis;
        if (this.selectionHelper) this.selectionHelper.visible = prevSelVis;
        if (this.gltfSkeletonHelper) this.gltfSkeletonHelper.visible = prevSkelVis;
        this.jointMarkerGroup.visible = prevMarkerVis;

        return dataUrl;
      }

      if (!customSize && this.composer && this.settings.postProcessing.enabled) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      return this.renderer.domElement.toDataURL('image/png');
    } finally {
      if (customSize) {
        this.renderer.setPixelRatio(prevPixelRatio);
        this.renderer.setSize(prevSize.x, prevSize.y, false);
        this.camera.aspect = prevAspect;
        this.camera.updateProjectionMatrix();
      }
      if (this.composer && this.settings.postProcessing.enabled) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  private resolveAnimationEvaluationContext(
    anim: AnimationSettings,
    frameFloat: number
  ): {
    effectiveAnim: AnimationSettings;
    cycleFrame: number;
    useBakedClip: boolean;
    clipIndex: number;
    startF: number;
    endF: number;
  } {
    const startF = Math.max(1, Math.min(239, Math.round(anim.frameStart ?? 1)));
    const endF = Math.max(startF + 1, Math.min(240, Math.round(anim.frameEnd ?? 60)));
    const strips = anim.nlaStrips ?? [];

    const baseStrip = strips.find(
      (s) => !s.muted && s.trackId === 'base' && frameFloat >= s.startFrame && frameFloat <= s.endFrame
    );
    const upperStrip = strips.find(
      (s) => !s.muted && s.trackId === 'upper' && frameFloat >= s.startFrame && frameFloat <= s.endFrame
    );

    let effectiveAnim = anim;
    let cycleFrame = frameFloat;
    let clipIndex = this.gltfActiveClipIndex;
    let useBakedClip =
      anim.poseSource === 'clip' && Boolean(this.gltfMixer && this.gltfClips.length > 0);

    if (baseStrip) {
      const span = Math.max(1, baseStrip.endFrame - baseStrip.startFrame);
      const tNorm = THREE.MathUtils.clamp((frameFloat - baseStrip.startFrame) / span, 0, 1);
      cycleFrame = 1 + tNorm * 59;
      if (baseStrip.sourceType === 'clip' && typeof baseStrip.clipIndex === 'number' && this.gltfClips[baseStrip.clipIndex]) {
        useBakedClip = Boolean(this.gltfMixer);
        clipIndex = baseStrip.clipIndex;
        effectiveAnim = { ...effectiveAnim, poseSource: 'clip', activeClipIndex: clipIndex };
      } else if (baseStrip.actionCycle) {
        useBakedClip = false;
        effectiveAnim = { ...effectiveAnim, poseSource: 'procedural', action: baseStrip.actionCycle };
      }
    } else if (startF !== 1 || endF !== 60) {
      const span = Math.max(1, endF - startF);
      const tNorm = THREE.MathUtils.clamp((frameFloat - startF) / span, 0, 1);
      cycleFrame = 1 + tNorm * 59;
    }

    if (upperStrip && upperStrip.actionCycle) {
      effectiveAnim = {
        ...effectiveAnim,
        composeEnabled: true,
        upperBodyAction: upperStrip.actionCycle,
      };
    }

    return { effectiveAnim, cycleFrame, useBakedClip, clipIndex, startF, endF };
  }

  private evaluateAnimationAtFrame(frameFloat: number): void {
    const anim = this.settings.animation;
    const ctx = this.resolveAnimationEvaluationContext(anim, frameFloat);
    if (this.loadedGltfRoot) {
      if (ctx.useBakedClip && this.gltfMixer) {
        if (!this.gltfActiveAction || this.gltfActiveClipIndex !== ctx.clipIndex) {
          this.selectGltfClip(ctx.clipIndex);
        }
        const clipDur = Math.max(0.05, this.gltfClips[ctx.clipIndex]?.duration || 1.5);
        const norm = (ctx.cycleFrame - 1) / 59;
        this.gltfMixer.setTime(norm * clipDur);
        this.gltfMixer.update(0);
      } else if (this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
        applyProceduralPoseToSkeleton(
          this.gltfRigMap,
          this.loadedGltfRoot,
          ctx.effectiveAnim,
          ctx.cycleFrame,
          { pos: this.gltfBasePos, rot: this.gltfBaseRot, scale: this.gltfBaseScale }
        );
      } else {
        const eff = ctx.effectiveAnim;
        const phaseRaw = (ctx.cycleFrame - 1) / 60;
        const patrol = computePatrolBackAndForth(
          phaseRaw,
          eff.action,
          eff.inPlace,
          eff.exaggeration
        );
        const phase = phaseRaw * Math.PI * 2 * patrol.stepMultiplier;
        const arcBoost = (eff.arcs / 100) * 0.28;
        const bounce = eff.enabled
          ? Math.abs(Math.sin(phase * (eff.action === 'run' ? 2 : 1))) *
            (eff.action === 'jump' || eff.action === 'arc_leap' ? 0.55 : 0.14) *
            eff.exaggeration
          : 0;
        const cosBaseY = Math.cos(this.gltfBaseRot.y);
        const sinBaseY = Math.sin(this.gltfBaseRot.y);
        const travelX =
          patrol.offsetZ * sinBaseY + (eff.action === 'arc_leap' ? Math.sin(phase) * arcBoost : 0);
        const travelZ = patrol.offsetZ * cosBaseY;
        this.loadedGltfRoot.position.set(
          this.gltfBasePos.x + travelX,
          this.gltfBasePos.y + (ctx.useBakedClip ? bounce * 0.28 : bounce),
          this.gltfBasePos.z + travelZ
        );
        this.loadedGltfRoot.rotation.set(
          this.gltfBaseRot.x,
          this.gltfBaseRot.y + patrol.turnRotY,
          this.gltfBaseRot.z
        );
      }
      this.loadedGltfRoot.updateMatrixWorld(true);
    } else {
      updateCharacterRigAnimation(this.rig, ctx.effectiveAnim, ctx.cycleFrame);
    }
  }

  public async exportAnimationFramesZip(options: {
    startFrame?: number;
    endFrame?: number;
    step?: number;
    transparentBg: boolean;
    resolution?: ExportCaptureResolution;
    turntable360?: boolean;
    onProgress?: (current: number, total: number) => void;
  }): Promise<{ blob: Blob; frameCount: number }> {
    const startFrame = Math.max(1, options.startFrame ?? this.settings.animation.frameStart ?? 1);
    const endFrame = Math.min(240, Math.max(startFrame, options.endFrame ?? this.settings.animation.frameEnd ?? 60));
    const step = Math.max(1, options.step ?? 1);
    const frames: number[] = [];
    for (let f = startFrame; f <= endFrame; f += step) {
      frames.push(f);
    }

    const prevFrame = this.animFrameFloat;
    const prevAutoOrbit = this.autoOrbit;
    const prevHeroRotY = this.activeHeroGltfGroup.rotation.y;
    const prevRigRotY = this.rig.root.rotation.y;
    this.isExportingSequence = true;
    this.autoOrbit = false;
    this.controls.autoRotate = false;

    const files: Record<string, Uint8Array> = {};
    try {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        this.animFrameFloat = f;
        this.evaluateAnimationAtFrame(f);
        if (options.turntable360) {
          const angle = (i / Math.max(1, frames.length)) * Math.PI * 2;
          this.activeHeroGltfGroup.rotation.y = prevHeroRotY + angle;
          this.rig.root.rotation.y = prevRigRotY + angle;
        }
        const dataUrl = this.captureFrame({
          transparentBg: options.transparentBg,
          resolution: options.resolution,
        });
        const b64 = dataUrl.split(',')[1] || '';
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let j = 0; j < binStr.length; j++) {
          bytes[j] = binStr.charCodeAt(j);
        }
        const padded = String(i + 1).padStart(3, '0');
        files[`quadro_${padded}.png`] = bytes;
        options.onProgress?.(i + 1, frames.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      this.activeHeroGltfGroup.rotation.y = prevHeroRotY;
      this.rig.root.rotation.y = prevRigRotY;
      this.animFrameFloat = prevFrame;
      this.evaluateAnimationAtFrame(prevFrame);
      this.autoOrbit = prevAutoOrbit;
      this.isExportingSequence = false;
    }

    const zipped = zipSync(files, { level: 0 });
    return {
      blob: new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
      frameCount: frames.length,
    };
  }

  public async exportSpriteSheetZip(options: {
    startFrame?: number;
    endFrame?: number;
    step?: number;
    transparentBg: boolean;
    resolution?: ExportCaptureResolution;
    turntable360?: boolean;
    onProgress?: (current: number, total: number) => void;
  }): Promise<{
    blob: Blob;
    frameCount: number;
    cols: number;
    rows: number;
    sheetWidth: number;
    sheetHeight: number;
  }> {
    const startFrame = Math.max(1, options.startFrame ?? this.settings.animation.frameStart ?? 1);
    const endFrame = Math.min(240, Math.max(startFrame, options.endFrame ?? this.settings.animation.frameEnd ?? 60));
    const step = Math.max(1, options.step ?? 1);
    const frames: number[] = [];
    for (let f = startFrame; f <= endFrame; f += step) {
      frames.push(f);
    }

    const cols = Math.ceil(Math.sqrt(frames.length));
    const rows = Math.ceil(frames.length / cols);
    const maxSheetDim = 4096;
    const requestedSize = this.resolveCaptureDimensions(options.resolution);
    const baseW = requestedSize?.width ?? this.renderer.domElement.width;
    const baseH = requestedSize?.height ?? this.renderer.domElement.height;
    const maxCellW = Math.floor(maxSheetDim / cols);
    const maxCellH = Math.floor(maxSheetDim / rows);
    const cellScale = Math.min(1, maxCellW / Math.max(1, baseW), maxCellH / Math.max(1, baseH));
    const cellW = Math.max(64, Math.floor(baseW * cellScale));
    const cellH = Math.max(64, Math.floor(baseH * cellScale));
    const sheetWidth = cols * cellW;
    const sheetHeight = rows * cellH;

    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = sheetWidth;
    atlasCanvas.height = sheetHeight;
    const ctx = atlasCanvas.getContext('2d');
    if (!ctx) throw new Error('Contexto 2D indisponível para Sprite Sheet.');
    ctx.clearRect(0, 0, sheetWidth, sheetHeight);

    const prevFrame = this.animFrameFloat;
    const prevAutoOrbit = this.autoOrbit;
    const prevHeroRotY = this.activeHeroGltfGroup.rotation.y;
    const prevRigRotY = this.rig.root.rotation.y;
    this.isExportingSequence = true;
    this.autoOrbit = false;
    this.controls.autoRotate = false;

    const frameMeta: Array<{
      name: string;
      frame: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    try {
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        this.animFrameFloat = f;
        this.evaluateAnimationAtFrame(f);
        if (options.turntable360) {
          const angle = (i / Math.max(1, frames.length)) * Math.PI * 2;
          this.activeHeroGltfGroup.rotation.y = prevHeroRotY + angle;
          this.rig.root.rotation.y = prevRigRotY + angle;
        }
        const dataUrl = this.captureFrame({
          transparentBg: options.transparentBg,
          resolution: options.resolution,
        });
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = rej;
          el.src = dataUrl;
        });
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellW;
        const y = row * cellH;
        ctx.drawImage(img, x, y, cellW, cellH);
        frameMeta.push({
          name: `quadro_${String(i + 1).padStart(3, '0')}`,
          frame: f,
          x,
          y,
          w: cellW,
          h: cellH,
        });
        options.onProgress?.(i + 1, frames.length);
      }
    } finally {
      this.activeHeroGltfGroup.rotation.y = prevHeroRotY;
      this.rig.root.rotation.y = prevRigRotY;
      this.animFrameFloat = prevFrame;
      this.evaluateAnimationAtFrame(prevFrame);
      this.autoOrbit = prevAutoOrbit;
      this.isExportingSequence = false;
    }

    const sheetPngUrl = atlasCanvas.toDataURL('image/png');
    const b64 = sheetPngUrl.split(',')[1] || '';
    const binStr = atob(b64);
    const pngBytes = new Uint8Array(binStr.length);
    for (let j = 0; j < binStr.length; j++) {
      pngBytes[j] = binStr.charCodeAt(j);
    }

    const atlasJson = JSON.stringify(
      {
        generator: 'Vértice Studio Sprite Sheet',
        fps: this.settings.animation.fpsCadence,
        transparent: options.transparentBg,
        turntable360: Boolean(options.turntable360),
        cols,
        rows,
        cellWidth: cellW,
        cellHeight: cellH,
        sheetWidth,
        sheetHeight,
        frameCount: frames.length,
        frames: frameMeta,
      },
      null,
      2
    );

    const zipped = zipSync(
      {
        'spritesheet.png': pngBytes,
        'spritesheet.json': new TextEncoder().encode(atlasJson),
      },
      { level: 6 }
    );

    return {
      blob: new Blob([new Uint8Array(zipped)], { type: 'application/zip' }),
      frameCount: frames.length,
      cols,
      rows,
      sheetWidth,
      sheetHeight,
    };
  }

  private syncSceneModeVisibility(): void {
    const hasHero = Boolean(this.loadedGltfRoot);
    const mode = this.settings.sceneMode === 'sculpt' ? 'gltf' : this.settings.sceneMode;

    this.pbrGroup.visible =
      (mode === 'pbr' || (mode === 'shader' && Boolean(this.settings.shaderDisabled))) && !hasHero;
    this.instancedGroup.visible = mode === 'instanced';
    this.shaderGroup.visible = mode === 'shader' && !this.settings.shaderDisabled;
    this.gltfGroup.visible = mode === 'gltf';
    this.physicsGroup.visible = mode === 'physics';
    this.sculptGroup.visible = false;
    this.nodesGroup.visible = mode === 'nodes';
    this.animationGroup.visible = mode === 'animation';

    this.nodesHeroGroup.visible = !hasHero || this.nodesTemplateApplied;
    if (hasHero && this.nodesTemplateApplied) {
      this.nodesHeroGroup.scale.setScalar(1.32);
      this.nodesHeroMeshes.forEach((m, idx) => {
        // Keep outer framing/neon rings visible around the character while hiding solid center occluders
        m.visible = idx > 0;
      });
    } else {
      this.nodesHeroGroup.scale.setScalar(1);
      this.nodesHeroMeshes.forEach((m) => {
        m.visible = true;
      });
    }
    if (this.rig?.root) {
      this.rig.root.visible = !hasHero;
    }
    if (this.harmonicSphere) {
      this.harmonicSphere.visible = !hasHero;
    }
    if (this.lodDefaultContainer) {
      this.lodDefaultContainer.visible = !hasHero;
    }
    this.activeHeroGltfGroup.visible = hasHero;
    if (this.gltfSkeletonHelper) {
      this.gltfSkeletonHelper.visible =
        this.settings.animation.showBones && this.activeHeroGltfGroup.visible;
    }

    if (this.loadedGltfRoot) {
      if (mode !== 'animation' && !(mode === 'nodes' && this.settings.geometryNodes.enabled)) {
        this.loadedGltfRoot.position.copy(this.gltfBasePos);
        this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
        this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
      }
      if (mode === 'pbr' && this.settings.explosion > 0.01 && this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
        resetSkeletonToRestPose(this.gltfRigMap);
      }
      if (mode !== 'pbr' && !(mode === 'nodes' && this.settings.geometryNodes.enabled)) {
        this.loadedGltfRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.userData.__gltfBasePos) {
            obj.position.copy(obj.userData.__gltfBasePos as THREE.Vector3);
            obj.rotation.set(0, 0, 0);
          }
        });
      }
    }

    this.syncTransformGizmo();
  }

  private applyFinish(finish: MaterialFinish): void {
    const preset = FINISH_PRESETS[finish];
    this.primaryMat.color.setHex(preset.primaryColor);
    this.primaryMat.metalness = preset.primaryMetalness;
    this.primaryMat.roughness = preset.primaryRoughness;
    this.primaryMat.anisotropy = preset.anisotropy;
    this.primaryMat.clearcoat = preset.clearcoat;
    this.primaryMat.clearcoatRoughness = preset.clearcoatRoughness;
    this.primaryMat.iridescence = preset.iridescence ?? 0;
    this.primaryMat.iridescenceIOR = preset.iridescenceIOR ?? 1.3;
    this.primaryMat.dispersion = preset.dispersion ?? 0;
    this.primaryMat.needsUpdate = true;

    this.secondaryMat.color.setHex(preset.secondaryColor);
    this.secondaryMat.metalness = preset.secondaryMetalness;
    this.secondaryMat.roughness = preset.secondaryRoughness;

    this.accentMat.color.setHex(preset.accentColor);
    this.accentMat.emissive.setHex(preset.accentColor);
    this.crystalMat.attenuationColor.setHex(preset.coreColor);
    this.crystalMat.dispersion = preset.dispersion ?? 0.35;
  }

  private computeLodAndFrustumTelemetry(): LodTelemetry {
    _projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    let lod0Count = 0;
    let lod1Count = 0;
    let lod2Count = 0;
    let inFrustumCount = 0;
    let culledCount = 0;

    if (this.loadedGltfRoot) {
      this.loadedGltfRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          _box3.setFromObject(mesh);
          if (!this.settings.frustumCulling || _frustum.intersectsBox(_box3)) {
            inFrustumCount++;
          } else {
            culledCount++;
          }
        }
      });
    } else if (this.settings.sceneMode === 'gltf') {
      for (const lod of this.lodNodes) {
        lod.getWorldPosition(_worldPos);
        const dist = this.camera.position.distanceTo(_worldPos);

        // Apply manual LOD bias if requested, otherwise automatic distance evaluation
        if (this.settings.lodBias === 1) {
          lod.levels.forEach((lvl, idx) => (lvl.object.visible = idx === 0));
          lod0Count++;
        } else if (this.settings.lodBias === 2) {
          lod.levels.forEach((lvl, idx) => (lvl.object.visible = idx === 1));
          lod1Count++;
        } else if (this.settings.lodBias === 3) {
          lod.levels.forEach((lvl, idx) => (lvl.object.visible = idx === 2));
          lod2Count++;
        } else {
          lod.autoUpdate = true;
          lod.update(this.camera);
          if (dist < 6.0) lod0Count++;
          else if (dist < 11.5) lod1Count++;
          else lod2Count++;
        }

        _box3.setFromObject(lod);
        if (!this.settings.frustumCulling || _frustum.intersectsBox(_box3)) {
          inFrustumCount++;
        } else {
          culledCount++;
        }
      }
    }

    return {
      totalLodNodes: this.loadedGltfRoot ? this.loadedMeshCount : this.lodNodes.length,
      lod0Count,
      lod1Count,
      lod2Count,
      inFrustumCount,
      culledCount,
      loadedModelName: this.loadedModelName,
      loadedMeshCount: this.loadedMeshCount,
      loadedClips: this.gltfClips.map((c, idx) => c.name || `Clipe ${idx + 1}`),
      activeClipIndex: this.gltfActiveClipIndex,
      boneCount: this.gltfRigMap?.boneCount ?? 0,
      isAutoRigged: this.gltfIsAutoRigged,
    };
  }

  private updateScene(delta: number): void {
    const dt = Math.min(delta, 0.1);
    const speed = this.settings.speed;
    this.elapsed += dt * speed;

    if (this.cameraTransitionActive) {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camTargetPos.x, 6, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camTargetPos.y, 6, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camTargetPos.z, 6, dt);
      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _camTargetLook.x, 6, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _camTargetLook.y, 6, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _camTargetLook.z, 6, dt);
      if (this.camera.position.distanceTo(_camTargetPos) < 0.02) {
        this.cameraTransitionActive = false;
      }
    }

    this.controls.autoRotate =
      !this.isSoftwareGl &&
      this.autoOrbit &&
      !this.cameraTransitionActive &&
      !this.jointMarkersActive;
    this.controls.autoRotateSpeed = 0.85 * speed;
    this.controls.update();

    // Keep character animation alive across non-animation modes (unless placing joint markers or driving MoGraph)
    if (
      this.loadedGltfRoot &&
      this.settings.sceneMode !== 'animation' &&
      !(this.settings.sceneMode === 'nodes' && this.settings.geometryNodes.enabled) &&
      !this.jointMarkersActive
    ) {
      const useClip =
        this.settings.animation.poseSource === 'clip' &&
        this.gltfMixer &&
        this.gltfClips.length > 0;
      if (useClip && this.gltfMixer) {
        this.gltfMixer.update(dt * Math.max(0.25, speed));
      } else if (
        this.settings.animation.enabled &&
        this.gltfRigMap &&
        this.gltfRigMap.boneCount > 0 &&
        !(this.settings.sceneMode === 'pbr' && this.settings.explosion > 0.02)
      ) {
        const anim = this.settings.animation;
        if (anim.playing && anim.cycleMode === 'full_cycle') {
          this.animFrameFloat += dt * anim.fpsCadence * anim.timing * Math.max(0.2, speed);
          if (this.animFrameFloat > 60) {
            this.animFrameFloat = ((this.animFrameFloat - 1) % 60) + 1;
          }
        }
        applyProceduralPoseToSkeleton(
          this.gltfRigMap,
          this.loadedGltfRoot,
          anim,
          this.animFrameFloat,
          { pos: this.gltfBasePos, rot: this.gltfBaseRot, scale: this.gltfBaseScale }
        );
      }
    }

    if (this.settings.sceneMode === 'pbr') {
      this.currentExplosion = THREE.MathUtils.damp(
        this.currentExplosion,
        this.settings.explosion,
        7.5,
        dt
      );
      const exp = this.currentExplosion;

      if (this.loadedGltfRoot) {
        this.loadedGltfRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.userData.__gltfBasePos) {
            const base = obj.userData.__gltfBasePos as THREE.Vector3;
            const dir = obj.userData.__gltfExplodeDir as THREE.Vector3 | undefined;
            if (dir) {
              obj.position.copy(base).addScaledVector(dir, exp * 0.95);
            }
          }
        });
        if (this.loadedMeshCount <= 1 && !this.loadedGltfRoot.userData.userEdited) {
          this.loadedGltfRoot.position.y = this.gltfBasePos.y + exp * 0.35;
        }
      } else {
        this.outerGimbal.rotation.y = this.elapsed * 0.42;
        this.outerGimbal.position.y = 1.65 + exp * 0.45;
        this.middleGimbal.rotation.x = this.elapsed * 0.65;
        this.middleGimbal.position.z = exp * 0.85;
        this.innerRotor.rotation.z = -this.elapsed * 1.15;
        this.innerRotor.position.z = exp * 0.95;
        if (!this.crystalCore.userData.userEdited) {
          this.crystalCore.position.z = exp * 1.15;
        }
        if (!this.filamentMesh.userData.userEdited) {
          this.filamentMesh.rotation.y = this.elapsed * 1.8;
        }
      }
    } else if (this.settings.sceneMode === 'instanced') {
      const targetCount = Math.min(
        MAX_INSTANCES,
        Math.max(500, Math.floor(this.settings.instanceCount * this.qualityScale))
      );
      this.instancedField.count = targetCount;

      const spread = 1 + this.settings.explosion * 0.95;
      const t = this.elapsed;

      for (let i = 0; i < targetCount; i++) {
        const phase = this.instancePhases[i];
        const baseR = this.instanceRadii[i] * spread;
        const angle = phase + t * (0.35 + (i % 5) * 0.08);
        const elevation =
          Math.sin(phase * 2.1 + t * 1.2) * (0.55 + this.settings.turbulence * 0.55);

        _pos.set(Math.cos(angle) * baseR, elevation, Math.sin(angle) * baseR);
        _euler.set(t + phase, angle, phase * 0.5);
        _quat.setFromEuler(_euler);
        const s = 0.65 + 0.45 * Math.sin(phase + t * 2.0);
        _scale.set(s, s, s);
        _mat4.compose(_pos, _quat, _scale);
        this.instancedField.setMatrixAt(i, _mat4);
      }
      this.instancedField.instanceMatrix.needsUpdate = true;
    } else if (this.settings.sceneMode === 'shader') {
      this.harmonicMaterial.uniforms.uTime.value = this.elapsed;
      this.harmonicMaterial.uniforms.uCameraPos.value.copy(this.camera.position);
      if (this.skinnedHarmonicMaterial) {
        this.skinnedHarmonicMaterial.uniforms.uTime.value = this.elapsed;
        this.skinnedHarmonicMaterial.uniforms.uCameraPos.value.copy(this.camera.position);
      }
      if (this.shaderRingMat.userData.shader) {
        this.shaderRingMat.userData.shader.uniforms.uTime.value = this.elapsed;
      }
      if (!this.shaderRingA.userData.userEdited) {
        this.shaderRingA.rotation.set(Math.PI * 0.35 + this.elapsed * 0.3, this.elapsed * 0.4, 0);
      }
      if (!this.shaderRingB.userData.userEdited) {
        this.shaderRingB.rotation.set(-Math.PI * 0.28 - this.elapsed * 0.25, 0, this.elapsed * 0.5);
      }
    } else if (this.settings.sceneMode === 'physics') {
      const simDt = Math.min(dt * Math.max(0.2, this.settings.speed), 0.035);
      this.cursorBeacon.position.lerp(_cursorWorld, 0.25);

      let heroColX = 0;
      let heroColZ = 0;
      let heroMinY = 0;
      let heroMaxY = 0;
      let heroRadius = 0;
      if (this.loadedGltfRoot) {
        _box3.setFromObject(this.loadedGltfRoot);
        const heroCenter = _box3.getCenter(_worldPos);
        const heroSize = _box3.getSize(_deltaVec);
        heroColX = heroCenter.x;
        heroColZ = heroCenter.z;
        heroMinY = _box3.min.y;
        heroMaxY = _box3.max.y;
        heroRadius = Math.max(0.45, Math.min(1.65, Math.max(heroSize.x, heroSize.z) * 0.38));
      }

      // Rigid-body gravity, floor bounce, containment ring, and cursor force field
      for (let i = 0; i < this.physicsBodies.length; i++) {
        const b = this.physicsBodies[i];
        if (!b.mesh.parent) continue;
        b.vel.y -= 9.81 * simDt;

        // Cursor repulsion/attraction field
        if (this.cursorActive) {
          _deltaVec.subVectors(b.mesh.position, this.cursorBeacon.position);
          const d = _deltaVec.length();
          if (d < 2.2 && d > 0.05) {
            _deltaVec.normalize().multiplyScalar((2.2 - d) * 14.0 * simDt);
            b.vel.add(_deltaVec);
          }
        }

        b.mesh.position.addScaledVector(b.vel, simDt);
        b.vel.multiplyScalar(0.996);

        // Collide with imported GLB hero character bounding volume
        if (heroRadius > 0 && b.mesh.position.y >= heroMinY - b.radius && b.mesh.position.y <= heroMaxY + b.radius) {
          const dx = b.mesh.position.x - heroColX;
          const dz = b.mesh.position.z - heroColZ;
          const distXZ = Math.hypot(dx, dz);
          const minR = heroRadius + b.radius;
          if (distXZ < minR && distXZ > 0.001) {
            const nx = dx / distXZ;
            const nz = dz / distXZ;
            b.mesh.position.x = heroColX + nx * minR;
            b.mesh.position.z = heroColZ + nz * minR;
            const dot = b.vel.x * nx + b.vel.z * nz;
            if (dot < 0) {
              b.vel.x -= 1.85 * dot * nx;
              b.vel.z -= 1.85 * dot * nz;
            }
          }
        }

        // Floor bounce
        if (b.mesh.position.y < b.radius + 0.05) {
          b.mesh.position.y = b.radius + 0.05;
          b.vel.y = Math.abs(b.vel.y) * 0.84;
          b.vel.x *= 0.96;
          b.vel.z *= 0.96;
        }

        // Radial containment wall
        const horizLen = Math.hypot(b.mesh.position.x, b.mesh.position.z);
        const maxR = 3.85 - b.radius;
        if (horizLen > maxR && horizLen > 0.001) {
          const nx = b.mesh.position.x / horizLen;
          const nz = b.mesh.position.z / horizLen;
          b.mesh.position.x = nx * maxR;
          b.mesh.position.z = nz * maxR;
          const dot = b.vel.x * nx + b.vel.z * nz;
          if (dot > 0) {
            b.vel.x -= 1.82 * dot * nx;
            b.vel.z -= 1.82 * dot * nz;
          }
        }
      }

      // Pairwise elastic sphere-sphere collisions
      for (let i = 0; i < this.physicsBodies.length; i++) {
        const a = this.physicsBodies[i];
        for (let j = i + 1; j < this.physicsBodies.length; j++) {
          const b = this.physicsBodies[j];
          _deltaVec.subVectors(b.mesh.position, a.mesh.position);
          const dist = _deltaVec.length();
          const minDist = a.radius + b.radius;
          if (dist < minDist && dist > 0.0001) {
            _normalVec.copy(_deltaVec).divideScalar(dist);
            const overlap = (minDist - dist) * 0.5;
            a.mesh.position.addScaledVector(_normalVec, -overlap);
            b.mesh.position.addScaledVector(_normalVec, overlap);

            const relVelX = b.vel.x - a.vel.x;
            const relVelY = b.vel.y - a.vel.y;
            const relVelZ = b.vel.z - a.vel.z;
            const velAlongNormal =
              relVelX * _normalVec.x + relVelY * _normalVec.y + relVelZ * _normalVec.z;
            if (velAlongNormal < 0) {
              const restitution = 0.86;
              const jImpulse =
                (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
              a.vel.addScaledVector(_normalVec, -jImpulse / a.mass);
              b.vel.addScaledVector(_normalVec, jImpulse / b.mass);
            }
          }
        }
      }

      // Update cursor-reactive particle sparks
      const posAttr = this.physicsParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const cx = this.cursorBeacon.position.x;
      const cy = this.cursorBeacon.position.y;
      const cz = this.cursorBeacon.position.z;
      for (let i = 0; i < PHYSICS_PARTICLE_COUNT; i++) {
        const idx = i * 3;
        let px = this.physicsParticlePositions[idx];
        let py = this.physicsParticlePositions[idx + 1];
        let pz = this.physicsParticlePositions[idx + 2];

        let vx = this.physicsParticleVelocities[idx];
        let vy = this.physicsParticleVelocities[idx + 1];
        let vz = this.physicsParticleVelocities[idx + 2];

        // Gentle orbital swirl + cursor attraction/repulsion
        const dx = cx - px;
        const dy = cy - py;
        const dz = cz - pz;
        const d2 = dx * dx + dy * dy + dz * dz + 0.15;
        if (d2 < 6.0) {
          const f = (1.6 / d2) * simDt;
          vx += (dx * f - dz * f * 1.4);
          vy += dy * f + 0.35 * simDt;
          vz += (dz * f + dx * f * 1.4);
        }

        // Deflect particles around the imported character silhouette
        if (heroRadius > 0 && py >= heroMinY && py <= heroMaxY + 0.25) {
          const hdx = px - heroColX;
          const hdz = pz - heroColZ;
          const hd = Math.hypot(hdx, hdz);
          if (hd < heroRadius + 0.2 && hd > 0.001) {
            const push = (heroRadius + 0.2 - hd) * 3.5 * simDt;
            vx += (hdx / hd) * push;
            vz += (hdz / hd) * push;
          }
        }

        // Return softly toward arena bounds
        vx += (-px * 0.35) * simDt;
        vy += ((1.2 - py) * 0.4) * simDt;
        vz += (-pz * 0.35) * simDt;

        vx *= 0.96;
        vy *= 0.96;
        vz *= 0.96;

        px += vx;
        py = Math.max(0.08, py + vy);
        pz += vz;

        this.physicsParticlePositions[idx] = px;
        this.physicsParticlePositions[idx + 1] = py;
        this.physicsParticlePositions[idx + 2] = pz;
        this.physicsParticleVelocities[idx] = vx;
        this.physicsParticleVelocities[idx + 1] = vy;
        this.physicsParticleVelocities[idx + 2] = vz;
      }
      posAttr.needsUpdate = true;
    } else if (this.settings.sceneMode === 'sculpt') {
      // Sculpting mode updates cleanly on user brush/gizmo input
    } else if (this.settings.sceneMode === 'nodes') {
      const cfg = this.settings.geometryNodes;
      this.moGraphContainer.visible = cfg.enabled;
      const animT = this.elapsed * Math.max(0.1, cfg.speed);
      const strength = cfg.strength;

      if (cfg.enabled) {
        const activeCount = Math.min(this.moGraphClones.length, Math.max(4, cfg.cloneCount));
        for (let i = 0; i < this.moGraphClones.length; i++) {
          const clone = this.moGraphClones[i];
          const shouldShow = i < activeCount;
          clone.visible = shouldShow;
          if (shouldShow && !clone.userData.userEdited) {
            evaluateMoGraphTransform(
              i,
              activeCount,
              this.elapsed,
              cfg,
              _pos,
              _euler,
              _scale
            );
            clone.position.copy(_pos);
            clone.rotation.copy(_euler);
            clone.scale.copy(_scale);
          }
        }

        if (this.nodesHeroGroup.visible) {
          this.nodesHeroGroup.rotation.y = animT * 0.45;
        }

        if (this.loadedGltfRoot) {
          this.loadedGltfRoot.position.copy(this.gltfBasePos);
          this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
          this.loadedGltfRoot.scale.copy(this.gltfBaseScale);

          let subIdx = 0;
          this.loadedGltfRoot.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh && obj.userData.__gltfBasePos) {
              const basePos = obj.userData.__gltfBasePos as THREE.Vector3;
              obj.position.copy(basePos);
              obj.rotation.set(0, 0, 0);

              if (cfg.effector === 'wave') {
                obj.position.y = basePos.y + Math.sin(animT * 2.4 + subIdx * 0.6) * 0.08 * strength;
              } else if (cfg.effector === 'fracture') {
                const dir = obj.userData.__gltfExplodeDir as THREE.Vector3 | undefined;
                if (dir) {
                  const push = (0.1 + Math.abs(Math.sin(animT * 1.8 + subIdx * 0.85)) * 0.45) * strength;
                  obj.position.addScaledVector(dir, push);
                }
                obj.rotation.set(
                  Math.sin(animT * 2.1 + subIdx) * 0.14 * strength,
                  Math.cos(animT * 1.7 + subIdx) * 0.18 * strength,
                  0
                );
              }
              subIdx++;
            }
          });

          if (cfg.effector === 'wave') {
            this.loadedGltfRoot.position.y =
              this.gltfBasePos.y + Math.sin(animT * 2.4) * 0.24 * strength;
            this.loadedGltfRoot.rotation.z =
              this.gltfBaseRot.z + Math.cos(animT * 2.0) * 0.09 * strength;
          } else if (cfg.effector === 'spiral') {
            this.loadedGltfRoot.rotation.y =
              this.gltfBaseRot.y + animT * 1.45 * (0.4 + strength * 0.6);
            this.loadedGltfRoot.position.y =
              this.gltfBasePos.y + (0.5 + 0.5 * Math.sin(animT * 2.0)) * 0.22 * strength;
          } else if (cfg.effector === 'fracture') {
            const jx = Math.sin(animT * 4.2) * 0.14 * strength;
            const jz = Math.cos(animT * 3.7) * 0.14 * strength;
            this.loadedGltfRoot.position.set(
              this.gltfBasePos.x + jx,
              this.gltfBasePos.y + Math.abs(Math.sin(animT * 2.6)) * 0.22 * strength,
              this.gltfBasePos.z + jz
            );
            this.loadedGltfRoot.rotation.set(
              this.gltfBaseRot.x + Math.sin(animT * 3.1) * 0.12 * strength,
              this.gltfBaseRot.y + Math.cos(animT * 2.8) * 0.18 * strength,
              this.gltfBaseRot.z + Math.sin(animT * 3.5) * 0.1 * strength
            );
          } else {
            // pulse
            const sxz = 1 + Math.sin(animT * 3.2) * 0.15 * strength;
            const sy = 1 + Math.sin(animT * 3.2 - 0.6) * 0.18 * strength;
            this.loadedGltfRoot.scale.set(
              this.gltfBaseScale.x * sxz,
              this.gltfBaseScale.y * sy,
              this.gltfBaseScale.z * sxz
            );
          }

          if (cfg.distribution === 'helix' && cfg.effector !== 'spiral') {
            this.loadedGltfRoot.rotation.y += animT * 0.55;
            this.loadedGltfRoot.position.y += (0.5 + 0.5 * Math.sin(animT * 1.5)) * 0.14 * Math.max(0.3, strength);
          }
        }

        const circularTargets: THREE.Object3D[] = [
          ...this.customNodeGroups,
          ...this.customNodeMeshes,
        ];
        const liveRadius = Math.max(1.6, cfg.spacing * 1.45);
        for (const item of circularTargets) {
          if (!item.parent || item.userData.userEdited) continue;
          const idx = (item.userData.__circularIndex as number | undefined) ?? 0;
          const basePos = item.userData.__circularBasePos as THREE.Vector3 | undefined;
          const baseRotY = (item.userData.__circularBaseRotY as number | undefined) ?? item.rotation.y;
          const baseScale = item.userData.__circularBaseScale as THREE.Vector3 | undefined;
          if (!basePos || !baseScale) continue;

          const phase = (idx / 6) * Math.PI * 2;
          if (cfg.distribution === 'grid') {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            const step = Math.max(1.15, cfg.spacing * 1.15);
            item.position.set(
              this.gltfBasePos.x + (col - 1) * step,
              basePos.y,
              this.gltfBasePos.z + (row === 0 ? -step * 0.85 : step * 0.85)
            );
            item.rotation.set(0, this.gltfBaseRot.y, 0);
          } else if (cfg.distribution === 'helix') {
            const hx = this.gltfBasePos.x + Math.cos(phase + animT * 0.35) * liveRadius * 0.9;
            const hz = this.gltfBasePos.z + Math.sin(phase + animT * 0.35) * liveRadius * 0.9;
            item.position.set(hx, basePos.y + (idx / 5) * 1.35, hz);
            item.rotation.set(0, baseRotY - animT * 0.35, 0);
          } else {
            item.position.set(
              this.gltfBasePos.x + Math.cos(phase) * liveRadius,
              basePos.y,
              this.gltfBasePos.z + Math.sin(phase) * liveRadius
            );
            item.rotation.set(0, baseRotY, 0);
          }
          item.scale.copy(baseScale);

          if (cfg.effector === 'wave') {
            item.position.y += Math.sin(animT * 2.4 + phase) * 0.35 * strength;
          } else if (cfg.effector === 'spiral') {
            const orbitAngle = animT * 0.75 * (0.4 + strength * 0.6);
            const relX = item.position.x - this.gltfBasePos.x;
            const relZ = item.position.z - this.gltfBasePos.z;
            const rx = this.gltfBasePos.x + relX * Math.cos(orbitAngle) - relZ * Math.sin(orbitAngle);
            const rz = this.gltfBasePos.z + relX * Math.sin(orbitAngle) + relZ * Math.cos(orbitAngle);
            item.position.set(rx, item.position.y + Math.sin(animT * 2 + phase) * 0.15 * strength, rz);
            item.rotation.y -= orbitAngle;
          } else if (cfg.effector === 'fracture') {
            const push = 1 + Math.abs(Math.sin(animT * 1.8 + phase)) * 0.35 * strength;
            const relX = item.position.x - this.gltfBasePos.x;
            const relZ = item.position.z - this.gltfBasePos.z;
            item.position.set(
              this.gltfBasePos.x + relX * push,
              item.position.y + Math.abs(Math.cos(animT * 2.1 + idx)) * 0.25 * strength,
              this.gltfBasePos.z + relZ * push
            );
          } else {
            const s = 0.8 + (0.5 + 0.5 * Math.sin(animT * 3.2 - phase)) * 0.45 * Math.max(0.4, strength);
            item.scale.copy(baseScale).multiplyScalar(s);
          }
        }
      } else if (this.loadedGltfRoot) {
        this.loadedGltfRoot.position.copy(this.gltfBasePos);
        this.loadedGltfRoot.rotation.copy(this.gltfBaseRot);
        this.loadedGltfRoot.scale.copy(this.gltfBaseScale);
        this.loadedGltfRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.userData.__gltfBasePos) {
            obj.position.copy(obj.userData.__gltfBasePos as THREE.Vector3);
            obj.rotation.set(0, 0, 0);
          }
        });
      }
    } else if (this.settings.sceneMode === 'animation') {
      const anim = this.settings.animation;
      const startF = Math.max(1, Math.min(239, Math.round(anim.frameStart ?? 1)));
      const endF = Math.max(startF + 1, Math.min(240, Math.round(anim.frameEnd ?? 60)));
      const spanF = Math.max(1, endF - startF + 1);

      if (anim.playing && anim.enabled && anim.cycleMode === 'full_cycle') {
        this.animFrameFloat += dt * anim.fpsCadence * anim.timing * Math.max(0.2, this.settings.speed);
        if (this.animFrameFloat < startF || this.animFrameFloat > endF) {
          this.animFrameFloat = startF + ((((this.animFrameFloat - startF) % spanF) + spanF) % spanF);
        }
        const intFrame = Math.min(endF, Math.max(startF, Math.round(this.animFrameFloat)));
        if (intFrame !== this.lastReportedAnimFrame) {
          this.lastReportedAnimFrame = intFrame;
          this.onAnimationFrameChange?.(intFrame);
        }
      } else {
        this.animFrameFloat = Math.min(endF, Math.max(startF, anim.currentFrame));
      }

      const evalCtx = this.resolveAnimationEvaluationContext(anim, this.animFrameFloat);

      if (this.loadedGltfRoot && !this.jointMarkersActive) {
        const clipDur = evalCtx.useBakedClip
          ? Math.max(0.05, this.gltfClips[evalCtx.clipIndex]?.duration || 1.5)
          : 2.0;

        if (evalCtx.useBakedClip && this.gltfMixer) {
          if (!this.gltfActiveAction || this.gltfActiveClipIndex !== evalCtx.clipIndex) {
            this.selectGltfClip(evalCtx.clipIndex);
          }
          const norm = anim.cycleMode === 'static' ? 0 : (evalCtx.cycleFrame - 1) / 59;
          this.gltfMixer.setTime(norm * clipDur);
        }

        if (!evalCtx.useBakedClip && this.gltfRigMap && this.gltfRigMap.boneCount > 0) {
          applyProceduralPoseToSkeleton(
            this.gltfRigMap,
            this.loadedGltfRoot,
            evalCtx.effectiveAnim,
            evalCtx.cycleFrame,
            { pos: this.gltfBasePos, rot: this.gltfBaseRot, scale: this.gltfBaseScale }
          );
        } else {
          const eff = evalCtx.effectiveAnim;
          const phaseRaw = (evalCtx.cycleFrame - 1) / 60;
          const patrol = computePatrolBackAndForth(
            phaseRaw,
            eff.action,
            eff.inPlace,
            eff.exaggeration
          );
          const phase = phaseRaw * Math.PI * 2 * patrol.stepMultiplier;
          const sq = (eff.squashStretch / 100) * 0.14 * eff.exaggeration;
          const arcBoost = (eff.arcs / 100) * 0.28;
          const bounce = eff.enabled
            ? Math.abs(Math.sin(phase * (eff.action === 'run' ? 2 : 1))) *
              (eff.action === 'jump' || eff.action === 'arc_leap' ? 0.55 : 0.14) *
              eff.exaggeration
            : 0;
          const secSway =
            eff.secondaryAction === 'breathing'
              ? Math.sin(phase * 2) * 0.02
              : eff.secondaryAction === 'sway'
                ? Math.sin(phase) * 0.08
                : eff.secondaryAction === 'look_around'
                  ? Math.sin(phase) * 0.22
                  : 0;

          const cosBaseY = Math.cos(this.gltfBaseRot.y);
          const sinBaseY = Math.sin(this.gltfBaseRot.y);
          const travelX =
            patrol.offsetZ * sinBaseY + (eff.action === 'arc_leap' ? Math.sin(phase) * arcBoost : 0);
          const travelZ = patrol.offsetZ * cosBaseY;

          this.loadedGltfRoot.position.set(
            this.gltfBasePos.x + travelX,
            this.gltfBasePos.y + (evalCtx.useBakedClip ? bounce * 0.28 : bounce),
            this.gltfBasePos.z + travelZ
          );
          this.loadedGltfRoot.rotation.set(
            this.gltfBaseRot.x + (eff.secondaryAction === 'sway' ? secSway * 0.4 : 0),
            this.gltfBaseRot.y +
              patrol.turnRotY +
              (eff.secondaryAction === 'look_around' ? secSway : 0),
            this.gltfBaseRot.z
          );
          const sy = 1 + Math.sin(phase * 2) * sq + (eff.secondaryAction === 'breathing' ? secSway : 0);
          const sxz = 1 / Math.sqrt(Math.max(0.75, sy));
          this.loadedGltfRoot.scale.set(
            this.gltfBaseScale.x * sxz,
            this.gltfBaseScale.y * sy,
            this.gltfBaseScale.z * sxz
          );
        }

        // Update motion trail tracking right hand bone (if rigged) or character center
        this.rig.trailLine.visible = anim.motionTrail;
        if (anim.motionTrail) {
          this.loadedGltfRoot.updateMatrixWorld(true);
          const handBone =
            this.gltfRigMap?.roles.rightHand?.bone ??
            this.gltfRigMap?.roles.rightForeArm?.bone ??
            null;
          let trailTarget: THREE.Vector3;
          if (handBone) {
            trailTarget = handBone.getWorldPosition(_worldPos);
          } else {
            _box3.setFromObject(this.loadedGltfRoot);
            trailTarget = _box3.getCenter(_worldPos);
          }
          const posArr = this.rig.trailPositions;
          const maxPts = posArr.length / 3;
          const count = Math.min(maxPts, this.rig.trailCount + 1);
          for (let k = count - 1; k > 0; k--) {
            posArr[k * 3] = posArr[(k - 1) * 3];
            posArr[k * 3 + 1] = posArr[(k - 1) * 3 + 1];
            posArr[k * 3 + 2] = posArr[(k - 1) * 3 + 2];
          }
          posArr[0] = trailTarget.x;
          posArr[1] = trailTarget.y;
          posArr[2] = trailTarget.z;
          this.rig.trailCount = count;
          this.rig.trailLine.geometry.setDrawRange(0, count);
          (this.rig.trailLine.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
            true;
        }
      } else {
        updateCharacterRigAnimation(this.rig, evalCtx.effectiveAnim, evalCtx.cycleFrame);
      }
    } else {
      // gltf / Multi-LOD orbital rotation
      if (!this.loadedGltfRoot) {
        for (let i = 0; i < this.lodNodes.length; i++) {
          const lod = this.lodNodes[i];
          lod.autoUpdate = this.settings.lodBias === 0;
          lod.rotation.y = this.elapsed * (0.4 + (i % 3) * 0.15);
        }
      }
    }

    if (this.selectionHelper) {
      this.selectionHelper.update();
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    if (this.isExportingSequence) {
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }

    const delta = this.clock.getDelta();
    this.updateScene(delta);
    const lodTelemetry = this.computeLodAndFrustumTelemetry();
    if (this.cinematicPass) {
      this.cinematicPass.uniforms.uTime.value = this.elapsed;
    }
    this.renderer.info.reset();
    if (this.viewportCompareMode === 'split_normals') {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      const halfW = Math.floor(size.x * 0.5);
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(0, 0, halfW, size.y);
      this.renderer.render(this.scene, this.camera);

      this.renderer.setScissor(halfW, 0, Math.max(1, size.x - halfW), size.y);
      const prevOverride = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.shadeMatNormals;
      this.renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = prevOverride;
      this.renderer.setScissorTest(false);
    } else if (this.viewportCompareMode === 'wireframe_overlay') {
      this.renderer.render(this.scene, this.camera);
      const prevAutoClear = this.renderer.autoClear;
      const prevOverride = this.scene.overrideMaterial;
      this.renderer.autoClear = false;
      this.scene.overrideMaterial = this.compareWireMat;
      this.renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = prevOverride;
      this.renderer.autoClear = prevAutoClear;
    } else if (this.composer && this.settings.postProcessing.enabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.onCameraQuaternionChange) {
      const q = this.camera.quaternion;
      const prev = this.lastReportedCamQuat;
      const diff =
        Math.abs(q.x - prev[0]) +
        Math.abs(q.y - prev[1]) +
        Math.abs(q.z - prev[2]) +
        Math.abs(q.w - prev[3]);
      if (diff > 0.005) {
        const next: [number, number, number, number] = [q.x, q.y, q.z, q.w];
        this.lastReportedCamQuat = next;
        this.onCameraQuaternionChange(next);
      }
    }

    this.fpsFrames++;
    this.fpsAccum += delta;
    if (this.fpsAccum >= 0.4) {
      this.currentFps = Math.max(1, Math.round(this.fpsFrames / this.fpsAccum));
      const frameTimeMs = Number((1000 / this.currentFps).toFixed(1));

      if (this.autoQuality && !this.isSoftwareGl) {
        if (frameTimeMs > 28 && this.qualityScale > 0.55) {
          this.qualityScale = Math.max(0.55, this.qualityScale - 0.15);
          this.renderer.setPixelRatio(1);
        } else if (frameTimeMs < 18 && this.qualityScale < 1) {
          this.qualityScale = Math.min(1, this.qualityScale + 0.1);
          if (this.qualityScale >= 0.95) {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          }
        }
      }

      this.onMetrics({
        fps: this.currentFps,
        frameTimeMs,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        activeBackendLabel: this.isSoftwareGl ? 'WebGL2 Software' : 'WebGL2 Acelerado',
        isNativeWebGPUActive: false,
        isSoftwareRenderer: this.isSoftwareGl,
        gpuRendererString: this.gpuRendererString,
        lodTelemetry,
      });
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.onContextStatus?.(true);
  };

  private handleContextRestored = (): void => {
    this.onContextStatus?.(false);
    this.tick();
  };

  public destroy(): void {
    this.disposed = true;
    this.stopTurntableRecording();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.clearSelection();
    this.clearLoadedGltf();
    this.skinnedHarmonicMaterial?.dispose();
    this.transformControls.dispose();
    this.composer?.dispose();
    this.controls.dispose();
    this.envMap?.dispose();
    for (const item of this.nodeTemplateDisposables) {
      item.dispose();
    }
    for (const item of this.disposables) {
      item.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
