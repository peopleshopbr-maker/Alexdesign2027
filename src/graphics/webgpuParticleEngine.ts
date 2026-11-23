import * as THREE from 'three';
import type { CameraPreset, RenderMetrics, RenderSettings } from '../types/graphics';
import { WGSL_PARTICLE_COMPUTE, WGSL_PARTICLE_RENDER } from './shaders';
import type {
  WebGPUBuffer,
  WebGPUCanvasContext,
  WebGPUDevice,
  WebGPUNavigatorInterface,
} from './webgpuTypes';

const GPU_BUFFER_USAGE = {
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  COPY_DST: 0x0008,
};

const MAX_WEBGPU_PARTICLES = 65536;

export class NativeWebGPUParticleEngine {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private device: WebGPUDevice | null = null;
  private context: WebGPUCanvasContext | null = null;
  private format = 'bgra8unorm';
  private particleBuffer: WebGPUBuffer | null = null;
  private simUniformBuffer: WebGPUBuffer | null = null;
  private camUniformBuffer: WebGPUBuffer | null = null;
  private computePipeline: { getBindGroupLayout(i: number): unknown } | null = null;
  private renderPipeline: { getBindGroupLayout(i: number): unknown } | null = null;
  private computeBindGroup: unknown = null;
  private renderBindGroup: unknown = null;

  private settings: RenderSettings;
  private onMetrics: (metrics: RenderMetrics) => void;
  private rafId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private elapsed = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private adapterLabel = 'WebGPU WGSL';

  // Camera orbit state
  private yaw = 0.6;
  private pitch = 0.35;
  private radius = 9.5;
  private targetYaw = 0.6;
  private targetPitch = 0.35;
  private targetRadius = 9.5;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly viewProj = new THREE.Matrix4();
  private readonly simData = new ArrayBuffer(32);
  private readonly simFloats = new Float32Array(this.simData);
  private readonly simUints = new Uint32Array(this.simData);
  private readonly camData = new Float32Array(20);

  constructor(
    container: HTMLElement,
    initialSettings: RenderSettings,
    onMetrics: (metrics: RenderMetrics) => void
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.onMetrics = onMetrics;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block touch-none';
    this.container.appendChild(this.canvas);
    this.bindEvents();
  }

  public async init(): Promise<boolean> {
    const navGpu = (navigator as unknown as { gpu?: WebGPUNavigatorInterface }).gpu;
    if (!navGpu) return false;

    const adapter = await navGpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;

    this.adapterLabel = adapter.info?.description || adapter.info?.device || 'Adaptador WebGPU';
    const device = await adapter.requestDevice();
    if (this.disposed) {
      device.destroy();
      return false;
    }

    this.device = device;
    device.lost.then((info) => {
      if (!this.disposed && info.reason !== 'destroyed') {
        console.warn('WebGPU device lost:', info.message);
      }
    });

    const ctx = this.canvas.getContext('webgpu') as unknown as WebGPUCanvasContext | null;
    if (!ctx) return false;
    this.context = ctx;
    this.format = navGpu.getPreferredCanvasFormat();
    ctx.configure({
      device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.resize();
    this.buildPipelines(device);
    this.lastTime = performance.now();
    this.loop();
    return true;
  }

  private buildPipelines(device: WebGPUDevice): void {
    // Initialize particle buffer with deterministic Fibonacci sphere distribution
    const strideFloats = 8; // pos(vec4) + vel(vec4)
    const bufferSize = MAX_WEBGPU_PARTICLES * strideFloats * 4;
    this.particleBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
      mappedAtCreation: true,
    });

    const mapped = new Float32Array(this.particleBuffer.getMappedRange());
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < MAX_WEBGPU_PARTICLES; i++) {
      const t = i / MAX_WEBGPU_PARTICLES;
      const y = 1 - 2 * t;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const scale = 2.6 + (i % 7) * 0.22;
      const offset = i * strideFloats;
      mapped[offset + 0] = Math.cos(theta) * r * scale;
      mapped[offset + 1] = y * scale * 0.65;
      mapped[offset + 2] = Math.sin(theta) * r * scale;
      mapped[offset + 3] = (i % 1024) / 1024;
      mapped[offset + 4] = 0;
      mapped[offset + 5] = 0;
      mapped[offset + 6] = 0;
      mapped[offset + 7] = 0;
    }
    this.particleBuffer.unmap();

    this.simUniformBuffer = device.createBuffer({
      size: 32,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    this.camUniformBuffer = device.createBuffer({
      size: 80,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: WGSL_PARTICLE_COMPUTE });
    this.computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'cs_main',
      },
    });

    this.computeBindGroup = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.simUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffer } },
      ],
    });

    const renderModule = device.createShaderModule({ code: WGSL_PARTICLE_RENDER });
    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.renderBindGroup = device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.camUniformBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffer } },
      ],
    });
  }

  public updateSettings(next: RenderSettings): void {
    this.settings = { ...next };
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (preset === 'orbital') {
      this.targetYaw = 0.6;
      this.targetPitch = 0.35;
      this.targetRadius = 9.5;
    } else if (preset === 'front') {
      this.targetYaw = 0;
      this.targetPitch = 0.08;
      this.targetRadius = 8.5;
    } else if (preset === 'side') {
      this.targetYaw = Math.PI / 2;
      this.targetPitch = 0.08;
      this.targetRadius = 8.5;
    } else if (preset === 'macro') {
      this.targetYaw = 0.9;
      this.targetPitch = 0.25;
      this.targetRadius = 5.2;
    } else {
      this.targetYaw = 0;
      this.targetPitch = 1.35;
      this.targetRadius = 10.5;
    }
  }

  public captureFrame(): string | null {
    this.renderOnce(0.001);
    return this.canvas.toDataURL('image/png');
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.resize);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.targetYaw -= dx * 0.006;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.006, -1.4, 1.4);
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.targetRadius = THREE.MathUtils.clamp(this.targetRadius + e.deltaY * 0.005, 3.5, 20);
  };

  private resize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.camera.aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
    this.camera.updateProjectionMatrix();
  };

  private renderOnce(dt: number): void {
    if (
      !this.device ||
      !this.context ||
      !this.computePipeline ||
      !this.renderPipeline ||
      !this.simUniformBuffer ||
      !this.camUniformBuffer
    ) {
      return;
    }

    const activeCount = Math.min(
      MAX_WEBGPU_PARTICLES,
      Math.max(1024, Math.floor(this.settings.instanceCount * 2.5))
    );

    // Smoothly damp camera orbit
    this.yaw = THREE.MathUtils.damp(this.yaw, this.targetYaw + (this.dragging ? 0 : dt * 0.14 * this.settings.speed), 7, dt);
    if (!this.dragging) this.targetYaw += dt * 0.14 * this.settings.speed;
    this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 7, dt);
    this.radius = THREE.MathUtils.damp(this.radius, this.targetRadius, 7, dt);

    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * this.radius,
      Math.sin(this.pitch) * this.radius,
      Math.cos(this.yaw) * Math.cos(this.pitch) * this.radius
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);

    this.elapsed += dt * this.settings.speed;
    this.simFloats[0] = Math.min(dt, 0.033) * this.settings.speed;
    this.simFloats[1] = this.elapsed;
    this.simFloats[2] = this.settings.turbulence;
    this.simFloats[3] = this.settings.explosion;
    this.simUints[4] = activeCount;
    this.device.queue.writeBuffer(this.simUniformBuffer, 0, this.simData);

    this.camData.set(this.viewProj.elements, 0);
    this.camData[16] = this.elapsed;
    this.camData[17] = 1.15;
    this.device.queue.writeBuffer(this.camUniformBuffer, 0, this.camData);

    const encoder = this.device.createCommandEncoder();
    const cPass = encoder.beginComputePass();
    cPass.setPipeline(this.computePipeline);
    cPass.setBindGroup(0, this.computeBindGroup);
    cPass.dispatchWorkgroups(Math.ceil(activeCount / 64));
    cPass.end();

    const view = this.context.getCurrentTexture().createView();
    const rPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.031, g: 0.039, b: 0.059, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    rPass.setPipeline(this.renderPipeline);
    rPass.setBindGroup(0, this.renderBindGroup);
    rPass.draw(6, activeCount);
    rPass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  private loop = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.renderOnce(dt);

    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.4) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      const activeCount = Math.min(
        MAX_WEBGPU_PARTICLES,
        Math.max(1024, Math.floor(this.settings.instanceCount * 2.5))
      );
      this.onMetrics({
        fps: this.currentFps,
        frameTimeMs: Number((1000 / Math.max(1, this.currentFps)).toFixed(1)),
        drawCalls: 1,
        triangles: activeCount * 2,
        activeBackendLabel: 'WebGPU Nativo (Compute WGSL)',
        isNativeWebGPUActive: true,
        isSoftwareRenderer: false,
        gpuRendererString: this.adapterLabel,
        lodTelemetry: {
          totalLodNodes: 0,
          lod0Count: 0,
          lod1Count: 0,
          lod2Count: 0,
          inFrustumCount: 1,
          culledCount: 0,
          loadedModelName: null,
          loadedMeshCount: 0,
          loadedClips: [],
          activeClipIndex: 0,
          boneCount: 0,
          isAutoRigged: false,
        },
      });
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  public destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('resize', this.resize);
    this.particleBuffer?.destroy();
    this.simUniformBuffer?.destroy();
    this.camUniformBuffer?.destroy();
    this.device?.destroy();
    this.canvas.remove();
  }
}
