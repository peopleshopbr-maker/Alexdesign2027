export type SceneMode =
  | 'pbr'
  | 'instanced'
  | 'shader'
  | 'gltf'
  | 'physics'
  | 'sculpt'
  | 'nodes'
  | 'animation';

export type ViewportShadingMode =
  | 'pbr'
  | 'clay'
  | 'redwax'
  | 'chrome'
  | 'normals'
  | 'uv'
  | 'cel';

export type ViewportCompareMode = 'off' | 'split_normals' | 'wireframe_overlay';

export type ExportCaptureResolution =
  | 'viewport'
  | '1080x1080'
  | '1920x1080'
  | '1080x1920'
  | '3840x2160';

export type PoseLibraryPresetId = 'rest' | 'a_pose' | 'combat_guard' | 'hero_stance' | 'sit';

export interface SavedPosePreset {
  id: string;
  name: string;
  overrides: Record<string, [number, number, number]>;
}

export type PbrTextureSlot =
  | 'map'
  | 'normalMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'emissiveMap';

export interface WeightPaintSettings {
  active: boolean;
  selectedBoneName: string;
  brushMode: 'add' | 'subtract' | 'smooth';
  brushRadius: number;
  strength: number;
  symmetryX: boolean;
}

export interface ViewportShadingSettings {
  mode: ViewportShadingMode;
  wireframe: boolean;
  bakeAo: boolean;
}

export type MoGraphDistribution = 'radial' | 'grid' | 'helix';
export type MoGraphEffector = 'wave' | 'spiral' | 'fracture' | 'pulse';
export type ProceduralNodeTemplate =
  | 'glass_neon'
  | 'organic_sculpt'
  | 'parametric_arch'
  | 'holo_grid';
export type BooleanCsgOp = 'union' | 'subtract' | 'intersect';

export interface GeometryNodesSettings {
  enabled: boolean;
  distribution: MoGraphDistribution;
  effector: MoGraphEffector;
  cloneCount: number; // 4..36
  spacing: number; // 0.4..3.5
  strength: number; // 0..2.0
  speed: number; // 0..2.5
  template: ProceduralNodeTemplate;
}

export type SculptBrushTool = 'standard' | 'carve' | 'smooth' | 'camera';

export type SculptMaterialType = 'redwax' | 'clay';

export type GizmoMode = 'orbit' | 'translate' | 'rotate' | 'scale';

export type PrimitiveShape =
  | 'cube'
  | 'sphere'
  | 'torus'
  | 'cylinder'
  | 'cone'
  | 'capsule'
  | 'crystal'
  | 'knot';

export type MeshDeformationType =
  | 'inflate_plus'
  | 'inflate_minus'
  | 'polish'
  | 'mirror_x'
  | 'twist'
  | 'bend'
  | 'taper';

export interface SculptSettings {
  material: SculptMaterialType;
  brush: SculptBrushTool;
  drawSize: number; // 0.08..0.6
  zIntensity: number; // 1..50
  symmetryX: boolean;
  gizmoMode: GizmoMode;
  baseVisible: boolean;
}

export type AnimationActionCycle =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'slash'
  | 'hit'
  | 'death'
  | 'block'
  | 'fall'
  | 'land'
  | 'dash'
  | 'interact';

export type AutoRigPreset = 'biped' | 'flex_spine';

export type RigExportProfile = 'standard' | 'mixamo' | 'ue5' | 'unity' | 'godot';

export type AnimationPoseSource = 'procedural' | 'clip';

export type PropSocketType = 'none' | 'sword' | 'shield' | 'staff';

export type HumanoidJointMarkerId =
  | 'head'
  | 'neck'
  | 'pelvis'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'wristL'
  | 'wristR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR';

export type TimelineViewMode = 'strips' | 'graph' | 'keys';

export const BLEND_MODES = ['replace', 'add', 'multiply', 'combine'] as const;
export const EXTRAPOLATION_MODES = ['hold', 'repeat', 'nothing'] as const;

export interface NlaTimelineStrip {
  id: string;
  trackId: string;
  label: string;
  sourceType: 'procedural' | 'clip';
  actionCycle?: AnimationActionCycle;
  clipIndex?: number;
  startFrame: number;
  endFrame: number;
  muted?: boolean;
  blendMode?: typeof BLEND_MODES[number];
  extrapolation?: typeof EXTRAPOLATION_MODES[number];
}

export interface AnimationSettings {
  enabled: boolean;
  playing: boolean;
  playDirection?: 1 | -1;
  freeEdit?: boolean;
  cycleMode: 'static' | 'full_cycle';
  action: AnimationActionCycle;
  inPlace: boolean;
  propType: PropSocketType;
  exportProfile: RigExportProfile;
  motionTrail: boolean;
  fpsCadence: 12 | 24 | 30 | 60;
  currentFrame: number; // 1..240
  frameStart: number; // 1..239
  frameEnd: number; // 2..240
  autoKey: boolean;
  rotationMode: 'quaternion' | 'euler';
  keyframes: number[];
  activeClipIndex: number;
  poseSource: AnimationPoseSource;
  showBones: boolean;
  exaggeration: number;
  nlaStrips: NlaTimelineStrip[];
  // Animation principles / advanced settings
  easing?: 'linear' | 'slow_in_out' | 'snap_out' | 'elastic';
  staging?: 'silhouette' | 'default' | 'rim';
  method?: string;
  physicsEnabled?: boolean;
  followThrough?: number;
  arcs?: number;
  solidDrawing?: number;
  squashStretch?: number;
  anticipation?: number;
  appeal?: 'heroic' | 'villain' | 'cartoon' | 'none';
  secondaryAction?: 'breathing' | 'look_around' | 'sway' | 'none';
}

export type GraphicsBackend = 'webgl2' | 'webgpu';

export type MaterialFinish =
  | 'titanium'
  | 'cobalt'
  | 'gold'
  | 'crystal'
  | 'copper'
  | 'bronze'
  | 'chrome'
  | 'obsidian'
  | 'ceramic'
  | 'crimson'
  | 'emerald'
  | 'iridescent';

export type CameraPreset = 'orbital' | 'front' | 'side' | 'macro' | 'top';

export type LightingPreset = 'studio' | 'dramatic' | 'cyber' | 'sunset';

export interface LightingSettings {
  preset: LightingPreset;
  exposure: number; // 0.5..2.0
  envIntensity: number; // 0..2.5
  envRotationDeg: number; // 0..360
  shadowIntensity: number; // 0..1.5
}

export type MaterialPresetId =
  | 'frosted_glass'
  | 'carbon'
  | 'brushed_copper'
  | 'matte_ceramic'
  | 'neon_glow'
  | 'obsidian_rubber';

export interface SceneOutlinerItem {
  uuid: string;
  name: string;
  triangles: number;
  visible: boolean;
  isSculptObject: boolean;
}

export interface PostProcessingSettings {
  enabled: boolean;
  bloomStrength: number; // 0..1.5
  dofEnabled: boolean;
  dofFocus: number; // 2..15
  grainAmount: number; // 0..0.15
  chromaticAmount: number; // 0..0.008
}

export interface RenderSettings {
  sceneMode: SceneMode;
  backend: GraphicsBackend;
  finish: MaterialFinish;
  explosion: number; // 0..1
  speed: number; // 0..2.5
  instanceCount: number; // 500..20000
  turbulence: number; // 0..2
  frequency: number; // 0.5..4
  frustumCulling: boolean;
  lodBias: number; // 0 (auto), 1 (force high), 2 (force mid), 3 (force low)
  snapEnabled: boolean;
  shaderDisabled?: boolean;
  lighting: LightingSettings;
  postProcessing: PostProcessingSettings;
  viewportShading: ViewportShadingSettings;
  sculpt: SculptSettings;
  geometryNodes: GeometryNodesSettings;
  animation: AnimationSettings;
}

export interface SelectedObjectInfo {
  uuid: string;
  name: string;
  geometryType: string;
  triangles: number;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  colorHex: string;
  metalness: number;
  roughness: number;
  wireframe: boolean;
  visible: boolean;
  frustumCulled: boolean;
  hasStandardMaterial: boolean;
  isSculptObject: boolean;
}

export interface LodTelemetry {
  totalLodNodes: number;
  lod0Count: number;
  lod1Count: number;
  lod2Count: number;
  inFrustumCount: number;
  culledCount: number;
  loadedModelName: string | null;
  loadedMeshCount: number;
  loadedClips: string[];
  activeClipIndex: number;
  boneCount: number;
  isAutoRigged: boolean;
}

export interface RenderMetrics {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  activeBackendLabel: string;
  isNativeWebGPUActive: boolean;
  isSoftwareRenderer: boolean;
  gpuRendererString: string;
  onDemandIdle?: boolean;
  lodTelemetry: LodTelemetry;
}

export interface ShaderPreset {
  id: string;
  name: string;
  description: string;
  vertexShader: string;
  fragmentShader: string;
}

export interface ShaderCompileResult {
  ok: boolean;
  stage?: 'vertex' | 'fragment' | 'program';
  message: string;
}

export interface BenchmarkStageResult {
  stageName: string;
  sceneMode: SceneMode;
  avgFps: number;
  minFps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  triangles: number;
  drawCalls: number;
}

export interface BenchmarkReport {
  completedAt: string;
  backendLabel: string;
  gpuRenderer: string;
  overallScoreFps: number;
  stages: BenchmarkStageResult[];
}

export interface WebGPUProbeInfo {
  supported: boolean;
  adapterAvailable: boolean;
  vendor: string;
  architecture: string;
  deviceName: string;
  description: string;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupSizeX: number;
  maxBufferSize: number;
  features: string[];
  reasonIfUnavailable?: string;
}

export interface WebGL2ProbeInfo {
  supported: boolean;
  renderer: string;
  vendor: string;
  isSoftware: boolean;
  maxTextureSize: number;
  maxVertexAttribs: number;
  maxColorAttachments: number;
  maxAnisotropy: number;
  shadingLanguageVersion: string;
}

export interface GpuHardwareReport {
  webgpu: WebGPUProbeInfo;
  webgl2: WebGL2ProbeInfo;
  preferredBackend: GraphicsBackend;
  timestamp: string;
}
