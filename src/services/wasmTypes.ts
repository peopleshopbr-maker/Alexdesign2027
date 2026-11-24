export interface MeshAnalysisInput {
  positions: number[];
  scaleFactor?: number;
}

export interface MeshBounds {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  radius: number;
}

export interface MeshAnalysisOutput {
  vertexCount: number;
  triangleEstimate: number;
  bounds: MeshBounds;
  normalizedScale: number;
}

export interface RustBoneSpec {
  name: string;
  parentIndex: number | null;
  restTranslation: [number, number, number];
  restRotationEulerDeg: [number, number, number];
  length: number;
  radius: number;
}

export interface RustKeyframeSpec {
  time: number;
  boneName: string;
  rotationEulerDeg: [number, number, number];
  translationOffset?: [number, number, number];
}

export interface RustVfxEmitterSpec {
  name: string;
  attachBone: string;
  emitterType: string;
  rate: number;
  lifetime: number;
  speed: number;
  spread: number;
  colorHex: string;
  particleSize: number;
  turbulence: number;
}

export type AnimationClipType = 
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

export interface RustSceneData {
  sceneName: string;
  fps: number;
  duration: number;
  baseColorHex: string;
  metallic: number;
  roughness: number;
  bones: RustBoneSpec[];
  keyframes: RustKeyframeSpec[];
  emitters: RustVfxEmitterSpec[];
  clipType?: AnimationClipType;
}
export type WasmRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'analyze_mesh_bounds'; input: MeshAnalysisInput }
  | { id: number; type: 'generate_rigged_animation_glb'; sceneData: RustSceneData; clipType?: AnimationClipType }
  | { id: number; type: 'get_animation_clip_types' }
  | { id: number; type: 'generate_blender_vfx_script'; sceneData: RustSceneData; glbFilename: string };

export type WasmResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export interface WasmCoreExports {
  analyze_mesh_bounds: (input: MeshAnalysisInput) => MeshAnalysisOutput;
  generate_rigged_animation_glb?: (sceneData: RustSceneData, clipType?: AnimationClipType) => Uint8Array;
  generate_blender_vfx_script?: (sceneData: RustSceneData, glbFilename: string) => string;
  get_animation_clip_types?: () => AnimationClipType[];
  evaluate_scene_frame?: (sceneData: RustSceneData, timeSec: number) => unknown;
}
