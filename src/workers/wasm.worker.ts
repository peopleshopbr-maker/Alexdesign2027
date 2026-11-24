import type {
  MeshAnalysisInput,
  MeshAnalysisOutput,
  RustSceneData,
  AnimationClipType,
  WasmRequest,
  WasmResponse,
  WasmCoreExports,
} from '../services/wasmTypes';


let initializedModule: WasmCoreExports | null = null;

async function initRustEngineWorker(): Promise<WasmCoreExports> {
  if (initializedModule) {
    return initializedModule;
  }

  const mod = await import('../wasm/wasm_core.js');
  initializedModule = mod as unknown as WasmCoreExports;
  return mod as unknown as WasmCoreExports;
}

const workerSelf = self as unknown as {
  onmessage: ((ev: MessageEvent<WasmRequest>) => void) | null;
  postMessage: (message: WasmResponse, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = async (ev: MessageEvent<WasmRequest>) => {
  const { id, type, ...payload } = ev.data;
  try {
    let result: MeshAnalysisOutput | Uint8Array | string | { ok: boolean } | AnimationClipType[];
    const engine = await initRustEngineWorker();

    switch (type) {
      case 'init': {
        result = { ok: true };
        break;
      }
      case 'analyze_mesh_bounds': {
        const p = payload as { input: MeshAnalysisInput };
        result = engine.analyze_mesh_bounds(p.input);
        break;
      }
      case 'generate_rigged_animation_glb': {
        if (typeof engine.generate_rigged_animation_glb !== 'function') {
          throw new Error('generate_rigged_animation_glb indisponível no binário Wasm.');
        }
        const p = payload as { sceneData: RustSceneData; clipType?: AnimationClipType };
        result = new Uint8Array(engine.generate_rigged_animation_glb(p.sceneData, p.clipType));
        break;
      }
      case 'generate_blender_vfx_script': {
        if (typeof engine.generate_blender_vfx_script !== 'function') {
          throw new Error('generate_blender_vfx_script indisponível no binário Wasm.');
        }
        const p = payload as { sceneData: RustSceneData; glbFilename: string };
        result = engine.generate_blender_vfx_script(p.sceneData, p.glbFilename);
        break;
      }
      case 'get_animation_clip_types': {
        if (typeof engine.get_animation_clip_types !== 'function') {
          throw new Error('get_animation_clip_types indisponível no binário Wasm.');
        }
        result = engine.get_animation_clip_types();
        break;
      }
      default: {
        throw new Error(`Tipo de requisição desconhecido: ${(type as string)}`);
      }
    }

    const transferable: Transferable[] = [];
    let response: WasmResponse;
    if (result instanceof Uint8Array) {
      transferable.push(result.buffer);
      response = { id, ok: true, result };
    } else if (typeof result === 'string') {
      response = { id, ok: true, result };
    } else if (Array.isArray(result)) {
      response = { id, ok: true, result };
    } else if (result && typeof result === 'object' && 'ok' in result) {
      response = { id, ok: true, result: result as { ok: boolean } };
    } else {
      response = { id, ok: true, result: result as MeshAnalysisOutput };
    }
    workerSelf.postMessage(response, transferable);
  } catch (err) {
    workerSelf.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido no Web Worker WASM.',
    });
  }
};

export {};

