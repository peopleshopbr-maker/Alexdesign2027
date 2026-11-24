import {
  ArrowDownToLine,
  Blend,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Film,
  Grid3x3,
  Magnet,
  Redo2,
  RotateCw,
  SplitSquareHorizontal,
  Square,
  SunDim,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import type {
  RenderSettings,
  ViewportCompareMode,
  ViewportShadingMode,
} from '../types/graphics';

interface BottomDockProps {
  collapsed: boolean;
  /** Altura (px) do dock inferior em fluxo; a barra flutua acima dela */
  bottomOffset?: number;
  onToggleCollapsed: () => void;
  settings: RenderSettings;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  compareMode: ViewportCompareMode;
  onCycleCompareMode: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  hasSelection: boolean;
  isRecording: boolean;
  transparentPng: boolean;
  exportingFramesLabel: string | null;
  onCancelExport?: () => void;

  cancelling?: boolean;
  onToggleTransparentPng: () => void;
  onExportFramesZip: () => void;
  onToggleRecordWebm: () => void;
  onSnapToGround: () => void;
  onFocusObject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  undoCount: number;
  redoCount: number;
}

const SHADING_MODES: Array<{ id: ViewportShadingMode; label: string }> = [
  { id: 'pbr', label: 'PBR' },
  { id: 'chrome', label: 'Cromo' },
  { id: 'normals', label: 'Normais' },
  { id: 'uv', label: 'UV' },
  { id: 'cel', label: 'Cel' },
];

export function BottomDock({
  collapsed,
  bottomOffset = 0,
  onToggleCollapsed,
  settings,
  onUpdateSettings,
  compareMode,
  onCycleCompareMode,
  autoOrbit,
  onToggleAutoOrbit,
  hasSelection,
  isRecording,
  transparentPng,
  exportingFramesLabel,
  onCancelExport,
  cancelling,
  onToggleTransparentPng,
  onExportFramesZip,
  onToggleRecordWebm,
  onSnapToGround,
  onFocusObject,
  onUndo,
  onRedo,
  undoCount,
  redoCount,
}: BottomDockProps) {
  const updateShading = (patch: Partial<RenderSettings['viewportShading']>) => {
    onUpdateSettings({
      viewportShading: {
        ...settings.viewportShading,
        ...patch,
      },
    });
  };

  return (
    <div
      style={{ bottom: bottomOffset + 12 }}
      className={`fixed left-12 right-2 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 z-20 lg:max-w-[calc(100vw-6rem)] transition-transform duration-300 ease-out ${
        collapsed ? 'translate-y-[calc(100%+16px)]' : 'translate-y-0'
      }`}
    >
      {collapsed && (
        <div className="flex justify-center -mt-9 mb-1 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Mostrar barra do viewport (atalho H)"
            className="h-8 px-3.5 rounded-xl bg-[#101521] border border-white/12 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Viewport</span>
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex items-center justify-start lg:justify-center gap-2 flex-nowrap overflow-x-auto no-scrollbar pb-0.5">
        {/* Grupo 1: Viewport Shading */}
        <div
          role="group"
          aria-label="Modos de Shading do Viewport"
          className="bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl px-1.5 sm:px-2 py-1 sm:py-1.5 shadow-2xl flex items-center gap-1 shrink-0"
        >
          {SHADING_MODES.map((m) => {
            const active = settings.viewportShading.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateShading({ mode: m.id })}
                className={`h-8 px-2.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer flex items-center ${
                  active
                    ? 'bg-sky-400 text-slate-950 border-sky-300 font-semibold shadow-sm'
                    : 'bg-transparent text-slate-300 border-transparent hover:bg-white/6 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            );
          })}

          <div className="h-5 w-px bg-white/10 shrink-0 mx-0.5" />

          <button
            type="button"
            aria-pressed={settings.viewportShading.wireframe}
            onClick={() => updateShading({ wireframe: !settings.viewportShading.wireframe })}
            title="Alternar malha aramada (Wireframe)"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              settings.viewportShading.wireframe
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#151b29] text-slate-300 border-white/10 hover:text-white'
            }`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            <span>Wire</span>
          </button>

          <button
            type="button"
            aria-pressed={settings.viewportShading.bakeAo}
            onClick={() => updateShading({ bakeAo: !settings.viewportShading.bakeAo })}
            title="Realçar oclusão ambiental e sombras de contato"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              settings.viewportShading.bakeAo
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#151b29] text-slate-300 border-white/10 hover:text-white'
            }`}
          >
            <SunDim className="w-3.5 h-3.5" />
            <span>AO</span>
          </button>

          <button
            type="button"
            aria-pressed={compareMode !== 'off'}
            onClick={onCycleCompareMode}
            title="Comparar Viewport: PBR / Split 50-50 Normais / Wire sobre PBR"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              compareMode !== 'off'
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                : 'bg-[#151b29] text-slate-300 border-white/10 hover:text-white'
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            <span>
              {compareMode === 'split_normals'
                ? 'Split Normais'
                : compareMode === 'wireframe_overlay'
                  ? 'Wire+PBR'
                  : 'Comparar'}
            </span>
          </button>
        </div>

        {/* Grupo 2: Auxiliares de Cena & Histórico */}
        <div
          role="group"
          aria-label="Auxiliares de Cena"
          className="bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl px-1.5 sm:px-2 py-1 sm:py-1.5 shadow-2xl flex items-center gap-1 shrink-0"
        >
          <button
            type="button"
            aria-pressed={autoOrbit}
            onClick={onToggleAutoOrbit}
            title="Rotação automática 360° da câmera"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
              autoOrbit
                ? 'bg-sky-500/18 text-sky-200 border-sky-400/45'
                : 'bg-transparent text-slate-300 border-transparent hover:bg-white/6 hover:text-white'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>360°</span>
          </button>

          <button
            type="button"
            aria-pressed={settings.snapEnabled}
            onClick={() => onUpdateSettings({ snapEnabled: !settings.snapEnabled })}
            title="Snap na grade para Gizmo (0.25m / 15°)"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
              settings.snapEnabled
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-transparent text-slate-300 border-transparent hover:bg-white/6 hover:text-white'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>

          <button
            type="button"
            onClick={onSnapToGround}
            title="Apoiar objeto selecionado no piso (Y = 0)"
            className="h-8 px-2.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white hover:bg-white/6 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Y=0</span>
          </button>

          <div className="h-5 w-px bg-white/10 shrink-0 mx-0.5" />

          <button
            type="button"
            onClick={onUndo}
            disabled={undoCount === 0}
            title="Desfazer última ação (Ctrl+Z)"
            aria-label="Desfazer"
            className={`h-8 px-2 rounded-lg flex items-center gap-1 shrink-0 ${
              undoCount > 0
                ? 'text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            {undoCount > 0 && (
              <span className="text-[11px] font-mono tabular-nums">{undoCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={redoCount === 0}
            title="Refazer ação (Ctrl+Shift+Z)"
            aria-label="Refazer"
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              redoCount > 0
                ? 'text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onFocusObject}
            disabled={!hasSelection}
            title="Focar câmera no objeto selecionado (F)"
            aria-label="Focar objeto"
            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              hasSelection
                ? 'text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grupo 3: Gravação Turntable & Sequência */}
        <div
          role="group"
          aria-label="Gravação e Sequência"
          className="bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl px-1.5 sm:px-2 py-1 sm:py-1.5 shadow-2xl flex items-center gap-1 shrink-0"
        >
          <button
            type="button"
            aria-pressed={isRecording}
            onClick={onToggleRecordWebm}
            title={
              isRecording
                ? 'Parar gravação e baixar vídeo .WebM'
                : 'Gravar giro Turntable 360° (.WebM)'
            }
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              isRecording
                ? 'bg-rose-500/25 text-rose-200 border-rose-400/55'
                : 'bg-[#151b29] hover:bg-[#1c2436] text-slate-200 border-white/10'
            }`}
          >
            {isRecording ? (
              <Square className="w-3 h-3 text-rose-400 fill-rose-400" />
            ) : (
              <Video className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>{isRecording ? 'Parar REC' : 'REC 360°'}</span>
          </button>

          <button
            type="button"
            aria-pressed={transparentPng}
            onClick={onToggleTransparentPng}
            title="Exportar PNG e Quadro a Quadro com Fundo Transparente (Alpha)"
            className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              transparentPng
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#151b29] hover:bg-[#1c2436] text-slate-300 border-white/10'
            }`}
          >
            <Blend className="w-3.5 h-3.5 text-sky-400" />
            <span>{transparentPng ? 'Alpha: ON' : 'Alpha'}</span>
          </button>

          {exportingFramesLabel && onCancelExport && (
            <button
              type="button"
              onClick={onCancelExport}
              disabled={cancelling}
              title="Cancelar exportação em andamento"
              aria-label="Cancelar exportação"
              className="h-8 px-2.5 text-xs font-medium rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar ({exportingFramesLabel})</span>
            </button>
          )}

          <button
            type="button"
            disabled={Boolean(exportingFramesLabel)}
            onClick={onExportFramesZip}
            title="Exportar animação quadro a quadro em sequência PNG (.zip)"
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-[#151b29] hover:bg-[#1c2436] disabled:opacity-60 text-slate-200 border border-white/10 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 text-emerald-400" />
            <span>{exportingFramesLabel ? `Seq. PNG (${exportingFramesLabel})` : 'Seq. PNG'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Ocultar barra (atalho H)"
            aria-label="Ocultar barra"
            className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
