export interface WebGPUAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

export interface WebGPUAdapterLimits {
  maxStorageBufferBindingSize?: number;
  maxComputeWorkgroupSizeX?: number;
  maxBufferSize?: number;
}

export interface WebGPUDeviceLostInfo {
  reason: string;
  message: string;
}

export interface WebGPUQueue {
  writeBuffer(buffer: WebGPUBuffer, bufferOffset: number, data: BufferSource): void;
  submit(commandBuffers: unknown[]): void;
}

export interface WebGPUBuffer {
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface WebGPUDevice {
  queue: WebGPUQueue;
  lost: Promise<WebGPUDeviceLostInfo>;
  createShaderModule(descriptor: { code: string }): unknown;
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }): WebGPUBuffer & { getMappedRange(): ArrayBuffer; unmap(): void };
  createComputePipeline(descriptor: unknown): { getBindGroupLayout(index: number): unknown };
  createRenderPipeline(descriptor: unknown): { getBindGroupLayout(index: number): unknown };
  createBindGroup(descriptor: unknown): unknown;
  createCommandEncoder(): {
    beginComputePass(): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      dispatchWorkgroups(x: number): void;
      end(): void;
    };
    beginRenderPass(descriptor: unknown): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      draw(vertexCount: number, instanceCount?: number): void;
      end(): void;
    };
    finish(): unknown;
  };
  destroy(): void;
}

export interface WebGPUAdapter {
  info?: WebGPUAdapterInfo;
  limits: WebGPUAdapterLimits;
  features: Iterable<string>;
  requestDevice(): Promise<WebGPUDevice>;
}

export interface WebGPUCanvasContext {
  configure(config: {
    device: WebGPUDevice;
    format: string;
    alphaMode?: 'opaque' | 'premultiplied';
  }): void;
  getCurrentTexture(): { createView(): unknown };
}

export interface WebGPUNavigatorInterface {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<WebGPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}
