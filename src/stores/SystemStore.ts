import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Command {
  id: string;
  label: string;
  execute: () => void;
  undo: () => void;
  timestamp: number;
  affectedRigId?: string;
  cameraQuaternion?: [number, number, number, number];
}

interface SystemState {
  past: Command[];
  future: Command[];
  maxHistory: number;
  push: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let eventListeners: Array<(event: { type: string; payload: unknown }) => void> = [];

function emit(event: { type: string; payload: unknown }) {
  eventListeners.forEach((fn) => fn(event));
}

export function subscribeToSystemStore(listener: (event: { type: string; payload: unknown }) => void) {
  eventListeners.push(listener);
  return () => {
    eventListeners = eventListeners.filter((fn) => fn !== listener);
  };
}

export const useSystemStore = create<SystemState>()(
  subscribeWithSelector((set, get) => ({
    past: [],
    future: [],
    maxHistory: 100,

    push: (cmd: Command) => {
      const { past, maxHistory } = get();
      const newPast = [...past, cmd].slice(-maxHistory);
      set({ past: newPast, future: [] });
      emit({ type: 'undo:push', payload: cmd });
    },

    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      const cmd = past[past.length - 1];
      try {
        cmd.undo();
        set({ past: past.slice(0, -1), future: [cmd, ...get().future] });
        emit({ type: 'undo:pop', payload: cmd });
      } catch (err) {
        console.error('[SystemStore] Undo failed:', err);
      }
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return;
      const cmd = future[0];
      try {
        cmd.execute();
        set({ past: [...get().past, cmd], future: future.slice(1) });
        emit({ type: 'redo:push', payload: cmd });
      } catch (err) {
        console.error('[SystemStore] Redo failed:', err);
      }
    },

    clear: () => {
      set({ past: [], future: [] });
      emit({ type: 'history:clear', payload: undefined });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  }))
);

export function createTransformCommand(
  object: THREE.Object3D,
  prevPos: THREE.Vector3,
  prevQuat: THREE.Quaternion,
  prevScale: THREE.Vector3,
  label: string
): Command {
  let nextPos: THREE.Vector3 | null = null;
  let nextQuat: THREE.Quaternion | null = null;
  let nextScale: THREE.Vector3 | null = null;

  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      nextPos = object.position.clone();
      nextQuat = object.quaternion.clone();
      nextScale = object.scale.clone();
      object.position.copy(prevPos);
      object.quaternion.copy(prevQuat);
      object.scale.copy(prevScale);
      object.updateMatrixWorld(true);
    },
    undo: () => {
      if (nextPos && nextQuat && nextScale) {
        object.position.copy(nextPos);
        object.quaternion.copy(nextQuat);
        object.scale.copy(nextScale);
        object.updateMatrixWorld(true);
      }
    },
  };
}

export function createMaterialCommand(
  mesh: THREE.Mesh,
  prev: {
    colorHex?: string;
    metalness?: number;
    roughness?: number;
    emissiveHex?: string;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    wireframe?: boolean;
    visible?: boolean;
  },
  next: {
    colorHex?: string;
    metalness?: number;
    roughness?: number;
    emissiveHex?: string;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    wireframe?: boolean;
    visible?: boolean;
  },
  label: string
): Command {
  const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  const parseHex = (hex: string) => parseInt(hex.replace('#', '0x'));
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      if (next.colorHex !== undefined) mat.color.setHex(parseHex(next.colorHex));
      if (next.metalness !== undefined) mat.metalness = next.metalness;
      if (next.roughness !== undefined) mat.roughness = next.roughness;
      if (next.emissiveHex !== undefined) mat.emissive.setHex(parseHex(next.emissiveHex));
      if (next.emissiveIntensity !== undefined) mat.emissiveIntensity = next.emissiveIntensity;
      if (next.opacity !== undefined) mat.opacity = next.opacity;
      if (next.transparent !== undefined) mat.transparent = next.transparent;
      if (next.wireframe !== undefined) mat.wireframe = next.wireframe;
      if (next.visible !== undefined) mesh.visible = next.visible;
      mat.needsUpdate = true;
    },
    undo: () => {
      if (prev.colorHex !== undefined) mat.color.setHex(parseHex(prev.colorHex));
      if (prev.metalness !== undefined) mat.metalness = prev.metalness;
      if (prev.roughness !== undefined) mat.roughness = prev.roughness;
      if (prev.emissiveHex !== undefined) mat.emissive.setHex(parseHex(prev.emissiveHex));
      if (prev.emissiveIntensity !== undefined) mat.emissiveIntensity = prev.emissiveIntensity;
      if (prev.opacity !== undefined) mat.opacity = prev.opacity;
      if (prev.transparent !== undefined) mat.transparent = prev.transparent;
      if (prev.wireframe !== undefined) mat.wireframe = prev.wireframe;
      if (prev.visible !== undefined) mesh.visible = prev.visible;
      mat.needsUpdate = true;
    },
  };
}

export function createLightingCommand(
  light: THREE.Light,
  prev: { intensity?: number; colorHex?: string; position?: THREE.Vector3 },
  next: { intensity?: number; colorHex?: string; position?: THREE.Vector3 },
  label: string
): Command {
  const parseHex = (hex: string) => parseInt(hex.replace('#', '0x'));
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      if (next.intensity !== undefined) light.intensity = next.intensity;
      if (next.colorHex !== undefined) light.color.setHex(parseHex(next.colorHex));
      if (next.position && 'position' in light) (light as THREE.Light & { position: THREE.Vector3 }).position.copy(next.position);
    },
    undo: () => {
      if (prev.intensity !== undefined) light.intensity = prev.intensity;
      if (prev.colorHex !== undefined) light.color.setHex(parseHex(prev.colorHex));
      if (prev.position && 'position' in light) (light as THREE.Light & { position: THREE.Vector3 }).position.copy(prev.position);
    },
  };
}

export function createGeometryCommand(
  geometry: THREE.BufferGeometry,
  prevAttributes: Map<string, THREE.BufferAttribute>,
  nextAttributes: Map<string, THREE.BufferAttribute>,
  label: string
): Command {
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      nextAttributes.forEach((attr, name) => {
        geometry.setAttribute(name, attr.clone());
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    },
    undo: () => {
      prevAttributes.forEach((attr, name) => {
        geometry.setAttribute(name, attr.clone());
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    },
  };
}

export function createDeleteCommand(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  index: number,
  label: string
): Command {
  let removed = false;
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      parent.remove(object);
      removed = true;
    },
    undo: () => {
      if (removed) {
        const children = parent.children;
        if (index >= 0 && index <= children.length) {
          parent.add(object);
          // Reorder to original index
          const newChildren = [...children];
          newChildren.splice(index, 0, object);
          parent.children.length = 0;
          newChildren.forEach((c) => parent.add(c));
        }
        removed = false;
      }
    },
  };
}

export function createCreateCommand(
  objects: Array<{ object: THREE.Object3D; parent: THREE.Object3D }>,
  label: string
): Command {
  return {
    id: crypto.randomUUID(),
    label,
    timestamp: Date.now(),
    execute: () => {
      objects.forEach(({ object, parent }) => parent.add(object));
    },
    undo: () => {
      objects.forEach(({ object }) => object.parent?.remove(object));
    },
  };
}

import * as THREE from 'three';