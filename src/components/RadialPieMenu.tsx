import {
  Box,
  Boxes,
  Camera,
  Code2,
  Film,
  Sparkles,
  Upload,
  Wind,
  X,
} from 'lucide-react';
import type { SceneMode } from '../types/graphics';

export type PieMenuActionId =
  | 'mode:gltf'
  | 'mode:pbr'
  | 'mode:animation'
  | 'mode:nodes'
  | 'action:live_render'
  | 'action:capture_png';

interface RadialPieMenuProps {
  open: boolean;
  position: { x: number; y: number };
  currentMode: SceneMode;
  liveRenderActive: boolean;
  onSelect: (action: PieMenuActionId) => void;
  onClose: () => void;
}

const PIE_ITEMS: Array<{
  id: PieMenuActionId;
  label: string;
  angleDeg: number;
  icon: typeof Box;
  modeMatch?: SceneMode;
}> = [
  { id: 'mode:gltf', label: 'Importar GLB', angleDeg: -90, icon: Upload, modeMatch: 'gltf' },
  { id: 'mode:pbr', label: 'Materiais', angleDeg: -30, icon: Box, modeMatch: 'pbr' },
  { id: 'mode:animation', label: 'Animação', angleDeg: 30, icon: Film, modeMatch: 'animation' },
  { id: 'action:live_render', label: 'Render Vivo', angleDeg: 90, icon: Sparkles },
  { id: 'mode:nodes', label: 'VFX', angleDeg: 150, icon: Boxes, modeMatch: 'nodes' },
  { id: 'action:capture_png', label: 'Capturar PNG', angleDeg: -150, icon: Camera },
];

export function RadialPieMenu({
  open,
  position,
  currentMode,
  liveRenderActive,
  onSelect,
  onClose,
}: RadialPieMenuProps) {
  if (!open) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const isCompact = vw < 520;
  const margin = isCompact ? 135 : 165;
  const cx = Math.max(margin, Math.min(vw - margin, position.x));
  const cy = Math.max(margin, Math.min(vh - margin, position.y));
  const radius = isCompact ? 92 : 112;

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        aria-label="Menu radial rápido (Espaço)"
        style={{ left: cx, top: cy }}
        className="fixed -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] sm:w-[310px] sm:h-[310px] pointer-events-none"
      >
        {/* Anel guia sutil */}
        <div className="absolute inset-8 rounded-full border border-sky-400/20 bg-[#090d16]/60 pointer-events-none" />

        {/* Núcleo central */}
        <button
          type="button"
          onClick={onClose}
          title="Fechar menu radial (Esc / Espaço)"
          className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#101521] hover:bg-[#192235] border border-white/15 shadow-2xl flex flex-col items-center justify-center gap-0.5 text-slate-200 cursor-pointer"
        >
          <X className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            Fechar
          </span>
        </button>

        {/* Fatias radiais */}
        {PIE_ITEMS.map((item) => {
          const Icon = item.icon;
          const rad = (item.angleDeg * Math.PI) / 180;
          const dx = Math.cos(rad) * radius;
          const dy = Math.sin(rad) * radius;
          const isVfx =
            item.modeMatch === 'nodes' &&
            (currentMode === 'nodes' ||
              currentMode === 'physics' ||
              currentMode === 'instanced' ||
              currentMode === 'shader');
          const isActive =
            isVfx ||
            (item.modeMatch && currentMode === item.modeMatch) ||
            (item.id === 'action:live_render' && liveRenderActive);

          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
              style={{
                left: `calc(50% + ${dx.toFixed(1)}px)`,
                top: `calc(50% + ${dy.toFixed(1)}px)`,
              }}
              className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 min-w-[96px] h-10 px-2.5 rounded-xl border shadow-xl flex items-center justify-center gap-1.5 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-transform hover:scale-105 ${
                isActive
                  ? 'bg-sky-400 text-slate-950 border-sky-300 font-semibold'
                  : 'bg-[#101521]/95 hover:bg-[#1a2234] text-slate-100 border-white/15 hover:border-sky-400/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
