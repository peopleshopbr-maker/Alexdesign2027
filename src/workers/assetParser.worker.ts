import { unzipSync } from 'fflate';

export interface WorkerAssetEntry {
  path: string;
  buffer: ArrayBuffer;
}

export interface AssetInspectRequest {
  id: number;
  kind: 'inspect_and_unpack';
  fileName: string;
  buffer: ArrayBuffer;
}

export interface AssetInspectResponse {
  id: number;
  ok: boolean;
  error?: string;
  isZip: boolean;
  entryPath?: string;
  entries?: WorkerAssetEntry[];
  extensionsUsed: string[];
  hasDraco: boolean;
  hasMeshopt: boolean;
  hasKtx2: boolean;
}

function parseGlbJsonChunk(buffer: ArrayBuffer): Record<string, unknown> | null {
  if (buffer.byteLength < 20) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) return null; // 'glTF'
  const chunkLen = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || 20 + chunkLen > buffer.byteLength) return null;
  try {
    const jsonBytes = new Uint8Array(buffer, 20, chunkLen);
    const text = new TextDecoder().decode(jsonBytes);
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseGltfTextJson(buffer: ArrayBuffer): Record<string, unknown> | null {
  try {
    const text = new TextDecoder().decode(new Uint8Array(buffer));
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const workerSelf = self as unknown as {
  onmessage: ((ev: MessageEvent<AssetInspectRequest>) => void) | null;
  postMessage: (message: AssetInspectResponse, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = (ev: MessageEvent<AssetInspectRequest>) => {
  const msg = ev.data;
  if (!msg || msg.kind !== 'inspect_and_unpack') return;

  try {
    const lower = msg.fileName.toLowerCase();
    if (lower.endsWith('.zip')) {
      const archive = unzipSync(new Uint8Array(msg.buffer));
      const entries: WorkerAssetEntry[] = [];
      const transfers: Transferable[] = [];
      let entryPath: string | undefined;
      let entryBuffer: ArrayBuffer | undefined;

      for (const [rawPath, bytes] of Object.entries(archive)) {
        if (rawPath.endsWith('/') || rawPath.includes('__MACOSX')) continue;
        const normalized = rawPath.replace(/^\.\//, '');
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const ab = copy.buffer;
        entries.push({ path: normalized, buffer: ab });
        transfers.push(ab);
        if (!entryPath && /\.(glb|gltf)$/i.test(normalized)) {
          entryPath = normalized;
          entryBuffer = ab;
        }
      }

      if (!entryPath || !entryBuffer) {
        workerSelf.postMessage({
          id: msg.id,
          ok: false,
          isZip: true,
          error: 'Nenhum arquivo .glb ou .gltf encontrado dentro do .zip.',
          extensionsUsed: [],
          hasDraco: false,
          hasMeshopt: false,
          hasKtx2: false,
        } satisfies AssetInspectResponse);
        return;
      }

      const json = entryPath.toLowerCase().endsWith('.glb')
        ? parseGlbJsonChunk(entryBuffer)
        : parseGltfTextJson(entryBuffer);
      const exts = Array.isArray(json?.extensionsUsed)
        ? (json.extensionsUsed as string[])
        : [];

      workerSelf.postMessage(
        {
          id: msg.id,
          ok: true,
          isZip: true,
          entryPath,
          entries,
          extensionsUsed: exts,
          hasDraco: exts.includes('KHR_draco_mesh_compression'),
          hasMeshopt: exts.includes('EXT_meshopt_compression'),
          hasKtx2: exts.includes('KHR_texture_basisu'),
        } satisfies AssetInspectResponse,
        transfers
      );
      return;
    }

    const json = lower.endsWith('.glb')
      ? parseGlbJsonChunk(msg.buffer)
      : parseGltfTextJson(msg.buffer);
    const exts = Array.isArray(json?.extensionsUsed) ? (json.extensionsUsed as string[]) : [];

    workerSelf.postMessage(
      {
        id: msg.id,
        ok: true,
        isZip: false,
        entryPath: msg.fileName,
        entries: [{ path: msg.fileName, buffer: msg.buffer }],
        extensionsUsed: exts,
        hasDraco: exts.includes('KHR_draco_mesh_compression'),
        hasMeshopt: exts.includes('EXT_meshopt_compression'),
        hasKtx2: exts.includes('KHR_texture_basisu'),
      } satisfies AssetInspectResponse,
      [msg.buffer]
    );
  } catch (err) {
    workerSelf.postMessage({
      id: msg.id,
      ok: false,
      isZip: msg.fileName.toLowerCase().endsWith('.zip'),
      error: err instanceof Error ? err.message : 'Erro ao processar arquivo no Web Worker.',
      extensionsUsed: [],
      hasDraco: false,
      hasMeshopt: false,
      hasKtx2: false,
    } satisfies AssetInspectResponse);
  }
};
