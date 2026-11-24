import * as THREE from 'three';

export interface ResourceTrackerStats {
  geometries: number;
  materials: number;
  textures: number;
  renderTargets: number;
  estimatedVRAM: number;
}

export class ResourceTracker {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private renderTargets = new Set<THREE.WebGLRenderTarget>();
  private onContextLostCallbacks: Array<() => void> = [];

  track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  untrackGeometry(geometry: THREE.BufferGeometry): void {
    if (this.geometries.delete(geometry)) {
      this.disposeGeometry(geometry);
    }
  }

  trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  untrackMaterial(material: THREE.Material): void {
    if (this.materials.delete(material)) {
      this.disposeMaterial(material);
    }
  }

  trackTexture<T extends THREE.Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  untrackTexture(texture: THREE.Texture): void {
    if (this.textures.delete(texture)) {
      texture.dispose();
    }
  }

  trackRenderTarget<T extends THREE.WebGLRenderTarget>(rt: T): T {
    this.renderTargets.add(rt);
    return rt;
  }

  untrackRenderTarget(rt: THREE.WebGLRenderTarget): void {
    if (this.renderTargets.delete(rt)) {
      rt.dispose();
    }
  }

  private disposeGeometry(geometry: THREE.BufferGeometry): void {
    geometry.dispose();
    Object.values(geometry.attributes).forEach((attr) => {
      if (attr instanceof THREE.BufferAttribute) {
        attr.array = null as unknown as Float32Array;
      }
    });
    geometry.index?.dispose();
    geometry.drawRange = { start: 0, count: Infinity };
  }

  private disposeMaterial(material: THREE.Material): void {
    material.dispose();
    if (Array.isArray(material)) {
      material.forEach((m) => this.disposeMaterial(m));
    }
  }

  disposeAll(): void {
    this.geometries.forEach((g) => this.disposeGeometry(g));
    this.geometries.clear();

    this.materials.forEach((m) => this.disposeMaterial(m));
    this.materials.clear();

    this.textures.forEach((t) => t.dispose());
    this.textures.clear();

    this.renderTargets.forEach((rt) => rt.dispose());
    this.renderTargets.clear();
  }

  onContextLost(callback: () => void): () => void {
    this.onContextLostCallbacks.push(callback);
    return () => {
      const idx = this.onContextLostCallbacks.indexOf(callback);
      if (idx >= 0) this.onContextLostCallbacks.splice(idx, 1);
    };
  }

  triggerContextLost(): void {
    this.onContextLostCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('[ResourceTracker] Context lost callback error:', err);
      }
    });
    this.disposeAll();
  }

  getStats(): ResourceTrackerStats {
    let estimatedVRAM = 0;

    this.geometries.forEach((g) => {
      Object.values(g.attributes).forEach((attr) => {
        if (attr instanceof THREE.BufferAttribute && attr.array instanceof ArrayBuffer) {
          estimatedVRAM += (attr.array as ArrayBuffer).byteLength;
        }
      });
      if (g.index) estimatedVRAM += g.index.array.byteLength;
    });

    this.textures.forEach((t) => {
      if (t.image) {
        const img = t.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement;
        if ('width' in img && 'height' in img) {
          estimatedVRAM += (img.width * img.height * 4) * (t.mipmaps.length > 0 ? 1.33 : 1);
        }
      }
    });

    this.renderTargets.forEach((rt) => {
      estimatedVRAM += rt.width * rt.height * 4 * (rt.depth ? 2 : 1);
    });

    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size,
      renderTargets: this.renderTargets.size,
      estimatedVRAM,
    };
  }
}

export const globalResourceTracker = new ResourceTracker();