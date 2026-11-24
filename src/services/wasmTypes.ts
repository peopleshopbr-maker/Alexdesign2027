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