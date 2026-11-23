import type { GpuHardwareReport, WebGL2ProbeInfo, WebGPUProbeInfo } from '../types/graphics';
import type { WebGPUNavigatorInterface } from './webgpuTypes';

const SOFTWARE_GL_REGEX = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

export function detectSoftwareWebGL(): { isSoftware: boolean; renderer: string } {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return { isSoftware: true, renderer: 'WebGL2 Indisponível' };
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const renderer = String(gl.getParameter(param) || 'WebGL2 Padrão');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return {
    isSoftware: SOFTWARE_GL_REGEX.test(renderer),
    renderer,
  };
}

function probeWebGL2(): WebGL2ProbeInfo {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    return {
      supported: false,
      renderer: 'Não suportado',
      vendor: 'Desconhecido',
      isSoftware: true,
      maxTextureSize: 0,
      maxVertexAttribs: 0,
      maxColorAttachments: 0,
      maxAnisotropy: 1,
      shadingLanguageVersion: 'N/A',
    };
  }

  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(
    gl.getParameter(debugExt ? debugExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || 'WebGL2'
  );
  const vendor = String(
    gl.getParameter(debugExt ? debugExt.UNMASKED_VENDOR_WEBGL : gl.VENDOR) || 'WebGL'
  );
  const anisoExt =
    gl.getExtension('EXT_texture_filter_anisotropic') ||
    gl.getExtension('MOZ_EXT_texture_filter_anisotropic') ||
    gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');

  const maxAnisotropy = anisoExt
    ? Number(gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1)
    : 1;

  const info: WebGL2ProbeInfo = {
    supported: true,
    renderer,
    vendor,
    isSoftware: SOFTWARE_GL_REGEX.test(renderer),
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0),
    maxVertexAttribs: Number(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 0),
    maxColorAttachments: Number(gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) || 0),
    maxAnisotropy,
    shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || 'GLSL ES 3.00'),
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return info;
}

async function probeWebGPU(): Promise<WebGPUProbeInfo> {
  const navGpu = (navigator as unknown as { gpu?: WebGPUNavigatorInterface }).gpu;
  if (!navGpu) {
    return {
      supported: false,
      adapterAvailable: false,
      vendor: 'N/A',
      architecture: 'N/A',
      deviceName: 'N/A',
      description: 'API navigator.gpu ausente neste navegador',
      maxStorageBufferBindingSize: 0,
      maxComputeWorkgroupSizeX: 0,
      maxBufferSize: 0,
      features: [],
      reasonIfUnavailable: 'O navegador atual não expõe a interface navigator.gpu.',
    };
  }

  try {
    const adapter = await navGpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return {
        supported: true,
        adapterAvailable: false,
        vendor: 'N/A',
        architecture: 'N/A',
        deviceName: 'N/A',
        description: 'Nenhum adaptador WebGPU físico ou compatível encontrado',
        maxStorageBufferBindingSize: 0,
        maxComputeWorkgroupSizeX: 0,
        maxBufferSize: 0,
        features: [],
        reasonIfUnavailable:
          'navigator.gpu está presente, mas requestAdapter() retornou nulo (aceleração Vulkan/Metal/DX12 indisponível).',
      };
    }

    const adapterInfo = adapter.info;
    const features = Array.from(adapter.features);

    return {
      supported: true,
      adapterAvailable: true,
      vendor: adapterInfo?.vendor || 'Adaptador GPU',
      architecture: adapterInfo?.architecture || 'Padrão',
      deviceName: adapterInfo?.device || 'GPU WebGPU',
      description: adapterInfo?.description || 'Adaptador WebGPU Ativo',
      maxStorageBufferBindingSize: Number(adapter.limits.maxStorageBufferBindingSize || 0),
      maxComputeWorkgroupSizeX: Number(adapter.limits.maxComputeWorkgroupSizeX || 0),
      maxBufferSize: Number(adapter.limits.maxBufferSize || 0),
      features,
    };
  } catch (err) {
    return {
      supported: true,
      adapterAvailable: false,
      vendor: 'N/A',
      architecture: 'N/A',
      deviceName: 'N/A',
      description: 'Falha ao consultar adaptador WebGPU',
      maxStorageBufferBindingSize: 0,
      maxComputeWorkgroupSizeX: 0,
      maxBufferSize: 0,
      features: [],
      reasonIfUnavailable: err instanceof Error ? err.message : 'Erro desconhecido ao inicializar WebGPU.',
    };
  }
}

export async function probeGpuHardware(): Promise<GpuHardwareReport> {
  const [webgpu, webgl2] = await Promise.all([probeWebGPU(), Promise.resolve(probeWebGL2())]);
  return {
    webgpu,
    webgl2,
    preferredBackend: webgpu.adapterAvailable ? 'webgpu' : 'webgl2',
    timestamp: new Date().toLocaleTimeString('pt-BR'),
  };
}
