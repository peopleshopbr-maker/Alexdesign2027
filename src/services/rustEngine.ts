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
}

interface WasmCoreExports {
  default?: (moduleOrPath?: unknown) => Promise<unknown>;
  analyze_mesh_bounds: (input: MeshAnalysisInput) => MeshAnalysisOutput;
  generate_rigged_animation_glb?: (sceneData: RustSceneData) => Uint8Array;
  generate_blender_vfx_script?: (sceneData: RustSceneData, glbFilename: string) => string;
}

const wasmLoaders =
  typeof import.meta.glob === 'function'
    ? import.meta.glob<WasmCoreExports>('../wasm/wasm_core.js')
    : {};

let cachedModulePromise: Promise<WasmCoreExports> | null = null;
let initializedModule: WasmCoreExports | null = null;

/**
 * Carrega e inicializa o módulo Rust/WebAssembly de forma assíncrona e segura (singleton).
 */
export async function initRustEngine(): Promise<WasmCoreExports> {
  if (initializedModule) {
    return initializedModule;
  }

  if (!cachedModulePromise) {
    cachedModulePromise = (async () => {
      const loader = wasmLoaders['../wasm/wasm_core.js'];
      if (!loader) {
        throw new Error(
          'Módulo Wasm ainda não compilado. Execute "bun run build:wasm" para gerar src/wasm.'
        );
      }

      const mod = await loader();
      if (typeof mod.default === 'function') {
        await mod.default();
      }
      initializedModule = mod;
      return mod;
    })().catch((err) => {
      cachedModulePromise = null;
      throw err;
    });
  }

  return cachedModulePromise;
}

export function isRustEngineAvailable(): boolean {
  return Boolean(wasmLoaders['../wasm/wasm_core.js']);
}

export async function analyzeMeshBoundsWasm(
  input: MeshAnalysisInput
): Promise<MeshAnalysisOutput> {
  const engine = await initRustEngine();
  return engine.analyze_mesh_bounds(input);
}

export async function generateRiggedAnimationGlbWasm(
  sceneData: RustSceneData
): Promise<Uint8Array> {
  const engine = await initRustEngine();
  if (typeof engine.generate_rigged_animation_glb !== 'function') {
    throw new Error('Função generate_rigged_animation_glb indisponível no binário Wasm.');
  }
  return new Uint8Array(engine.generate_rigged_animation_glb(sceneData));
}

export async function generateBlenderVfxScriptWasm(
  sceneData: RustSceneData,
  glbFilename: string
): Promise<string> {
  const engine = await initRustEngine();
  if (typeof engine.generate_blender_vfx_script !== 'function') {
    throw new Error('Função generate_blender_vfx_script indisponível no binário Wasm.');
  }
  return engine.generate_blender_vfx_script(sceneData, glbFilename);
}
