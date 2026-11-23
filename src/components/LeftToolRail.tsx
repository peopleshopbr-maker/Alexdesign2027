import {
  Aperture,
  ListTree,
  Maximize2,
  MousePointer,
  Move,
  RotateCw,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import type { GizmoMode } from '../types/graphics';

interface LeftToolRailProps {
  gizmoMode: GizmoMode;
  panelOpen: boolean;
  sideUtilityPanel: 'none' | 'postfx' | 'lighting';
  postFxOpen?: boolean;
  outlinerOpen: boolean;
  onChangeGizmoMode: (mode: GizmoMode) => void;
  onToggleSideUtility: (util: 'postfx' | 'lighting') => void;
  onToggleOutliner: () => void;
  onToggleWorkspacePanel: () => void;
}

const TRANSFORM_TOOLS: Array<{
  id: GizmoMode;
  label: string;
  shortcut: string;
  icon: typeof Move;
}> = [
  { id: 'orbit', label: 'Selecionar / Órbita', shortcut: 'Q', icon: MousePointer },
  { id: 'translate', label: 'Mover Objeto', shortcut: 'G', icon: Move },
  { id: 'rotate', label: 'Rotacionar Objeto', shortcut: 'R', icon: RotateCw },
  { id: 'scale', label: 'Escalonar Objeto', shortcut: 'S', icon: Maximize2 },
];

export function LeftToolRail({
  gizmoMode,
  panelOpen,
  sideUtilityPanel,
  postFxOpen = false,
  outlinerOpen,
  onChangeGizmoMode,
  onToggleSideUtility,
  onToggleOutliner,
  onToggleWorkspacePanel,
}: LeftToolRailProps) {
  return (
    <aside
      aria-label="Ferramentas do Viewport 3D"
      className="fixed top-13 sm:top-14 left-0 bottom-0 w-11 sm:w-14 z-20 bg-[#0b0e14] border-r border-white/10 py-2 sm:py-3 flex flex-col items-center justify-between overflow-y-auto no-scrollbar"
    >
      <div className="flex flex-col items-center gap-1 sm:gap-1.5 w-full px-1 sm:px-2">
        {/* Grupo 1: Ferramentas de Transformação 3D (padrão Q / G / R / S) */}
        {TRANSFORM_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = gizmoMode === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={active}
              onClick={() => onChangeGizmoMode(tool.id)}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
                active
                  ? 'bg-sky-500/20 text-sky-300 border-sky-400/55 shadow-sm'
                  : 'bg-[#111622] text-slate-400 border-white/8 hover:bg-[#171f30] hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          );
        })}

        <div className="w-6 sm:w-7 h-px bg-white/10 my-1 sm:my-1.5 shrink-0" />

        {/* Grupo 2: Estúdio de Cena & Painéis */}
        <button
          type="button"
          title="Iluminação de Estúdio & HDRI"
          aria-label="Iluminação & HDRI"
          aria-pressed={sideUtilityPanel === 'lighting'}
          onClick={() => onToggleSideUtility('lighting')}
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
            sideUtilityPanel === 'lighting'
              ? 'bg-sky-500/20 text-sky-300 border-sky-400/55'
              : 'bg-[#111622] text-slate-400 border-white/8 hover:bg-[#171f30] hover:text-slate-100'
          }`}
        >
          <Sun className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>

        <button
          type="button"
          title="Pós-Processamento VFX (Bloom, DOF, Grain)"
          aria-label="Pós-Processamento"
          aria-pressed={postFxOpen || sideUtilityPanel === 'postfx'}
          onClick={() => onToggleSideUtility('postfx')}
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
            postFxOpen || sideUtilityPanel === 'postfx'
              ? 'bg-sky-500/20 text-sky-300 border-sky-400/55'
              : 'bg-[#111622] text-slate-400 border-white/8 hover:bg-[#171f30] hover:text-slate-100'
          }`}
        >
          <Aperture className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>

        <button
          type="button"
          title="Outliner / Hierarquia da Cena"
          aria-label="Outliner da Cena"
          aria-pressed={outlinerOpen}
          onClick={onToggleOutliner}
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
            outlinerOpen
              ? 'bg-sky-500/20 text-sky-300 border-sky-400/55'
              : 'bg-[#111622] text-slate-400 border-white/8 hover:bg-[#171f30] hover:text-slate-100'
          }`}
        >
          <ListTree className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>
      </div>

      {/* Alternar painel contextual do workspace ativo */}
      <div className="flex flex-col items-center gap-1.5 pt-2 border-t border-white/10 w-full px-1 sm:px-2 shrink-0">
        <button
          type="button"
          title="Mostrar / Ocultar Painel do Workspace"
          aria-label="Alternar painel lateral"
          aria-pressed={panelOpen && sideUtilityPanel === 'none'}
          onClick={onToggleWorkspacePanel}
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center shrink-0 cursor-pointer ${
            panelOpen && sideUtilityPanel === 'none'
              ? 'bg-sky-500/18 text-sky-300 border-sky-400/45'
              : 'bg-[#111622] text-slate-400 border-white/8 hover:bg-[#171f30] hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </button>
      </div>
    </aside>
  );
}
