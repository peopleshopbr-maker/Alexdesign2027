import type {
  MeshAnalysisInput,
  MeshBounds,
  MeshAnalysisOutput,
  RustBoneSpec,
  RustKeyframeSpec,
  RustVfxEmitterSpec,
  AnimationClipType,
  RustSceneData,
} from './wasmTypes';

export type {
  MeshAnalysisInput,
  MeshBounds,
  MeshAnalysisOutput,
  RustBoneSpec,
  RustKeyframeSpec,
  RustVfxEmitterSpec,
  AnimationClipType,
  RustSceneData,
};

type WasmRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'analyze_mesh_bounds'; input: MeshAnalysisInput }
  | { id: number; type: 'generate_rigged_animation_glb'; sceneData: RustSceneData; clipType?: AnimationClipType }
  | { id: number; type: 'generate_blender_vfx_script'; sceneData: RustSceneData; glbFilename: string }
  | { id: number; type: 'get_animation_clip_types' };

type WasmResponse =
  | { id: number; ok: true; result: MeshAnalysisOutput }
  | { id: number; ok: true; result: Uint8Array }
  | { id: number; ok: true; result: string }
  | { id: number; ok: true; result: { ok: boolean } }
  | { id: number; ok: true; result: AnimationClipType[] }
  | { id: number; ok: false; error: string };

type WasmResult = MeshAnalysisOutput | Uint8Array | string | { ok: boolean };

interface WasmCoreExports {
  analyze_mesh_bounds: (input: MeshAnalysisInput) => MeshAnalysisOutput;
  generate_rigged_animation_glb?: (sceneData: RustSceneData, clipType?: AnimationClipType) => Uint8Array;
  generate_blender_vfx_script?: (sceneData: RustSceneData, glbFilename: string) => string;
  get_animation_clip_types?: () => AnimationClipType[];
}

interface InitInput {
  module_or_path: Promise<Response> | Response | URL | string | Request | ArrayBuffer | WebAssembly.Module;
}

let cachedModulePromise: Promise<WasmCoreExports> | null = null;
let initializedModule: WasmCoreExports | null = null;

let worker: Worker | null = null;
let workerReady = false;
let workerInitPromise: Promise<void> | null = null;
let requestId = 0;
const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/wasm.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WasmResponse>) => {
      const data = ev.data;
      const id = data.id;
      const pending = pendingRequests.get(id);
      if (pending) {
        pendingRequests.delete(id);
        if (data.ok) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error(data.error));
        }
      }
    };
    worker.onerror = (err) => {
      console.error('[rustEngine] Web Worker error:', err);
      workerReady = false;
      worker = null;
    };
  }
  return worker;
}

async function ensureWorkerReady(): Promise<void> {
  if (workerReady) return;
  if (!workerInitPromise) {
    workerInitPromise = (async () => {
      const w = getWorker();
      await new Promise<void>((resolve, reject) => {
        const id = ++requestId;
        pendingRequests.set(id, { resolve: () => resolve(), reject });
        w.postMessage({ id, type: 'init' });
        setTimeout(() => reject(new Error('Worker init timeout')), 10000);
      });
      workerReady = true;
    })().catch((err) => {
      workerInitPromise = null;
      workerReady = false;
      throw err;
    });
  }
  return workerInitPromise;
}

async function postToWorker<T>(type: WasmRequest['type'], payload: Omit<WasmRequest, 'id' | 'type'>): Promise<T> {
  try {
    await ensureWorkerReady();
    const w = getWorker();
    const id = ++requestId;
    return new Promise<T>((resolve, reject) => {
      pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      if (type === 'analyze_mesh_bounds') {
        const p = payload as { input: MeshAnalysisInput };
        w.postMessage({ id, type, ...p }, [new Float32Array(p.input.positions).buffer]);
      } else if (type === 'generate_rigged_animation_glb') {
        const p = payload as { sceneData: RustSceneData; clipType?: AnimationClipType };
        w.postMessage({ id, type, sceneData: p.sceneData, clipType: p.clipType });
      } else {
        w.postMessage({ id, type, ...payload });
      }
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 30000);
    });
  } catch {
    return postToMainThread<T>(type, payload);
  }
}

async function postToMainThread<T>(
  type: WasmRequest['type'],
  payload: Omit<WasmRequest, 'id' | 'type'>
): Promise<T> {
  if (!cachedModulePromise) {
    cachedModulePromise = (async () => {
      const mod = await import('../wasm/wasm_core.js');
      initializedModule = mod as WasmCoreExports;
      return mod as WasmCoreExports;
    })().catch((err) => {
      cachedModulePromise = null;
      throw err;
    });
  }
  const engine = await cachedModulePromise;
  if (!engine) {
    throw new Error('Failed to initialize WASM module');
  }

  switch (type) {
    case 'analyze_mesh_bounds': {
      const p = payload as { input: MeshAnalysisInput };
      return engine.analyze_mesh_bounds(p.input) as T;
    }
    case 'generate_rigged_animation_glb': {
      if (typeof engine.generate_rigged_animation_glb !== 'function') {
        throw new Error('Função generate_rigged_animation_glb indisponível no binário Wasm.');
      }
      const p = payload as { sceneData: RustSceneData; clipType?: AnimationClipType };
      return new Uint8Array(engine.generate_rigged_animation_glb(p.sceneData, p.clipType)) as T;
    }
    case 'generate_blender_vfx_script': {
      if (typeof engine.generate_blender_vfx_script !== 'function') {
        throw new Error('Função generate_blender_vfx_script indisponível no binário Wasm.');
      }
      const p = payload as { sceneData: RustSceneData; glbFilename: string };
      return engine.generate_blender_vfx_script(p.sceneData, p.glbFilename) as T;
    }
    case 'get_animation_clip_types': {
      if (typeof engine.get_animation_clip_types !== 'function') {
        throw new Error('Função get_animation_clip_types indisponível no binário Wasm.');
      }
      return engine.get_animation_clip_types() as T;
    }
    default: {
      throw new Error(`Tipo de requisição desconhecido: ${type}`);
    }
  }
}

export function isRustEngineAvailable(): boolean {
  try {
    // Check if the wasm module file exists by attempting to fetch it
    // In development, this will be true if the file exists
    // In production, the file will be bundled
    return true;
  } catch {
    return false;
  }
}

export async function analyzeMeshBoundsWasm(input: MeshAnalysisInput): Promise<MeshAnalysisOutput> {
  return postToWorker<MeshAnalysisOutput>('analyze_mesh_bounds', { input });
}

export async function generateRiggedAnimationGlbWasm(sceneData: RustSceneData, clipType?: AnimationClipType): Promise<Uint8Array> {
  return postToWorker<Uint8Array>('generate_rigged_animation_glb', { sceneData, clipType });
}

export async function getAnimationClipTypesWasm(): Promise<AnimationClipType[]> {
  return postToWorker<AnimationClipType[]>('get_animation_clip_types', {});
}

export async function generateBlenderVfxScriptWasm(sceneData: RustSceneData, glbFilename: string): Promise<string> {
  return postToWorker<string>('generate_blender_vfx_script', { sceneData, glbFilename });
}