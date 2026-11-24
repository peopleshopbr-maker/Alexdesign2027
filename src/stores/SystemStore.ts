import * as THREE from 'three';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Command { id: string; label: string; execute: () => void; undo: () => void; timestamp: number; affectedRigId?: string; cameraQuaternion?: [number, number, number, number]; }
export interface QuickAction { id: string; label: string; category: string; shortcut?: string; run: () => void; }

interface SystemState {
  past: Command[]; future: Command[]; isCommandPaletteOpen: boolean; quickActions: QuickAction[];
  push: (cmd: Command) => void; undo: () => void; redo: () => void; clear: () => void;
  canUndo: () => boolean; canRedo: () => boolean;
  setCommandPaletteOpen: (v: boolean) => void; toggleCommandPalette: () => void; setQuickActions: (a: QuickAction[]) => void;
}

type Listener = (e: { type: string; payload: unknown }) => void;
let listeners: Listener[] = [];
const emit = (type: string, payload?: unknown) => listeners.forEach((fn) => fn({ type, payload }));
export const subscribeToSystemStore = (fn: Listener) => { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; };

export const useSystemStore = create<SystemState>()(
  subscribeWithSelector((set, get) => ({
    past: [], future: [], isCommandPaletteOpen: false, quickActions: [],
    push: (cmd) => { set((s) => ({ past: [...s.past, cmd].slice(-100), future: [] })); emit('undo:push', cmd); },
    undo: () => { const c = get().past.at(-1); if (!c) return; c.undo(); set((s) => ({ past: s.past.slice(0, -1), future: [c, ...s.future] })); emit('undo:pop', c); },
    redo: () => { const [c, ...r] = get().future; if (!c) return; c.execute(); set((s) => ({ past: [...s.past, c], future: r })); emit('redo:push', c); },
    clear: () => { set({ past: [], future: [] }); emit('history:clear'); },
    canUndo: () => get().past.length > 0, canRedo: () => get().future.length > 0,
    setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
    toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
    setQuickActions: (quickActions) => set({ quickActions }),
  }))
);

const cmd = (label: string, execute: () => void, undo: () => void): Command => ({ id: crypto.randomUUID(), label, timestamp: Date.now(), execute, undo });

export const createTransformCommand = (o: THREE.Object3D, p0: THREE.Vector3, q0: THREE.Quaternion, s0: THREE.Vector3, label: string) => {
  const [a, b] = [[p0.clone(), q0.clone(), s0.clone()], [o.position.clone(), o.quaternion.clone(), o.scale.clone()]];
  const set = ([p, q, s]: [THREE.Vector3, THREE.Quaternion, THREE.Vector3]) => { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); o.updateMatrixWorld(true); };
  return cmd(label, () => set(b as [THREE.Vector3, THREE.Quaternion, THREE.Vector3]), () => set(a as [THREE.Vector3, THREE.Quaternion, THREE.Vector3]));
};

export const createMaterialCommand = (mesh: THREE.Mesh, prev: Record<string, unknown>, next: Record<string, unknown>, label: string) => {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const apply = (p: Record<string, unknown>) => {
    if (typeof p.colorHex === 'string') mat.color.set(p.colorHex);
    if (typeof p.emissiveHex === 'string') mat.emissive.set(p.emissiveHex);
    if (typeof p.visible === 'boolean') mesh.visible = p.visible;
    Object.assign(mat, p); mat.needsUpdate = true;
  };
  return cmd(label, () => apply(next), () => apply(prev));
};

export const createLightingCommand = (light: THREE.Light, prev: { intensity?: number; colorHex?: string; position?: THREE.Vector3 }, next: { intensity?: number; colorHex?: string; position?: THREE.Vector3 }, label: string) => {
  const apply = (p: typeof prev) => {
    if (p.intensity !== undefined) light.intensity = p.intensity;
    if (p.colorHex) light.color.set(p.colorHex);
    if (p.position && 'position' in light) (light as THREE.PointLight).position.copy(p.position);
  };
  return cmd(label, () => apply(next), () => apply(prev));
};

export const createGeometryCommand = (geo: THREE.BufferGeometry, prev: Map<string, THREE.BufferAttribute>, next: Map<string, THREE.BufferAttribute>, label: string) => {
  const apply = (m: Map<string, THREE.BufferAttribute>) => { m.forEach((a, k) => geo.setAttribute(k, a.clone())); geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere(); };
  return cmd(label, () => apply(next), () => apply(prev));
};

export const createDeleteCommand = (o: THREE.Object3D, p: THREE.Object3D, idx: number, label: string) =>
  cmd(label, () => p.remove(o), () => { p.add(o); const c = p.children.indexOf(o); if (c > -1 && idx >= 0) { p.children.splice(c, 1); p.children.splice(idx, 0, o); } });

export const createCreateCommand = (items: Array<{ object: THREE.Object3D; parent: THREE.Object3D }>, label: string) =>
  cmd(label, () => items.forEach((i) => i.parent.add(i.object)), () => items.forEach((i) => i.object.parent?.remove(i.object)));
