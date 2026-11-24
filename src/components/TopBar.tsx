import {
  Camera,
  ChevronDown,
  Cpu,
  Download,
  FolderOpen,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SceneMode } from '../types/graphics';

interface TopBarProps {
  sceneMode: SceneMode;
  sidePanelOpen: boolean;
  liveRenderActive: boolean;
  gpuStatusLabel: string;
  isSoftwareRenderer: boolean;
  onSelectWorkspace: (mode: SceneMode) => void;
  onToggleLiveRender: () => void;
  onCaptureFrame: () => void;
  onSaveProject: () => void;
  onLoadProjectFile: (file: File) => void;
  onImportModelFile: (file: File) => void;
  onExportGlb: () => void;
  onExportGltf?: () => void;
  onExportAllZip?: () => void;
  onCaptureFramesZip?: () => void;
  exportingModel?: boolean;
  exportingZip?: boolean;
  exportingFrames?: boolean;
}

const WORKSPACES: Array<{ id: SceneMode; label: string; tip: string }> = [
  { id: 'gltf', label: 'Importar', tip: 'Importar modelos .GLB/.GLTF & Auto-Rig' },
  { id: 'pbr', label: 'Materiais', tip: 'Materiais PBR & Vista Explodida' },
  { id: 'animation', label: 'Animação', tip: 'Rig, Pose FK/IK & 12 Princípios' },
  { id: 'nodes', label: 'VFX', tip: 'VFX Studio: Nodes, Física, Instâncias, Efeitos & Shaders GLSL' },
];

const isVfxSceneMode = (mode: SceneMode) =>
  mode === 'nodes' || mode === 'physics' || mode === 'instanced' || mode === 'shader';

export function TopBar({
  sceneMode,
  sidePanelOpen,
  liveRenderActive,
  gpuStatusLabel,
  isSoftwareRenderer,
  onSelectWorkspace,
  onToggleLiveRender,
  onCaptureFrame,
  onSaveProject,
  onLoadProjectFile,
  onImportModelFile,
  onExportGlb,
  onExportGltf,
  onExportAllZip,
  onCaptureFramesZip,
  exportingModel = false,
  exportingZip = false,
  exportingFrames = false,
}: TopBarProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFileMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [fileMenuOpen]);

  return (
    <header className="h-13 sm:h-14 w-full shrink-0 bg-[#0b0e14] border-b border-white/10 px-2.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 z-30">
      {/* Zona 1: Marca + Menu Arquivo padrão 3D */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0 drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]"
          />
          <h1 className="font-display text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            Alex Design <span className="hidden xs:inline sm:inline text-slate-400 font-medium text-xs sm:text-sm">Studio</span>
          </h1>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-expanded={fileMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFileMenuOpen((p) => !p)}
            className="h-8 px-2 sm:px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/8 border border-white/10 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Arquivo</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <input
            ref={projectInputRef}
            type="file"
            accept=".json,.vertice.json"
            aria-label="Abrir arquivo de projeto .json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && f.name.toLowerCase().endsWith('.json')) {
                onLoadProjectFile(f);
              }
              e.target.value = '';
            }}
          />
          <input
            ref={modelInputRef}
            type="file"
            accept=".glb,.gltf,.zip"
            aria-label="Importar modelo .glb, .gltf ou .zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportModelFile(f);
              e.target.value = '';
            }}
          />

          {fileMenuOpen && (
            <div
              className="absolute left-0 top-10 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl bg-[#101521] border border-white/14 shadow-2xl p-1.5 flex flex-col gap-0.5 z-50"
              role="menu"
              aria-label="Menu de Arquivo"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  onSaveProject();
                }}
                className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Save className="w-3.5 h-3.5 text-sky-400" />
                  <span>Salvar Projeto</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">Ctrl+S</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  projectInputRef.current?.click();
                }}
                className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span>Abrir Projeto (.json)</span>
              </button>

              <div className="h-px bg-white/10 my-1" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFileMenuOpen(false);
                  modelInputRef.current?.click();
                }}
                className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Importar .GLB / .GLTF</span>
              </button>

              <button
                type="button"
                role="menuitem"
                disabled={exportingModel || exportingZip || exportingFrames}
                onClick={() => {
                  setFileMenuOpen(false);
                  onExportGlb();
                }}
                className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{exportingModel ? 'Exportando modelo...' : 'Exportar Modelo (.GLB)'}</span>
                </span>
              </button>

              {onExportGltf && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={exportingModel || exportingZip || exportingFrames}
                  onClick={() => {
                    setFileMenuOpen(false);
                    onExportGltf();
                  }}
                  className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Exportar Modelo (.GLTF JSON)</span>
                  </span>
                </button>
              )}

              {onExportAllZip && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={exportingModel || exportingZip || exportingFrames}
                  onClick={() => {
                    setFileMenuOpen(false);
                    onExportAllZip();
                  }}
                  className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>{exportingZip ? 'Empacotando ZIP completo...' : 'Exportar ZIP Completo (GLB + PNGs + Blender)'}</span>
                  </span>
                </button>
              )}

              {onCaptureFramesZip && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={exportingModel || exportingZip || exportingFrames}
                  onClick={() => {
                    setFileMenuOpen(false);
                    onCaptureFramesZip();
                  }}
                  className="h-8 px-2.5 rounded-lg text-xs text-slate-200 hover:text-white hover:bg-white/8 flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-rose-400" />
                    <span>{exportingFrames ? 'Exportando sequência...' : 'Exportar Sequência PNG (fundo transparente)'}</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Seletor compacto de workspace em telas menores que lg */}
        <select
          aria-label="Selecionar Workspace 3D"
          value={isVfxSceneMode(sceneMode) ? 'nodes' : sceneMode}
          onChange={(e) => onSelectWorkspace(e.target.value as SceneMode)}
          className="lg:hidden h-8 max-w-[116px] sm:max-w-[144px] px-1.5 sm:px-2 rounded-lg text-xs font-medium bg-[#121723] text-sky-200 border border-white/12 outline-none cursor-pointer truncate"
        >
          {WORKSPACES.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.label}
            </option>
          ))}
        </select>
      </div>

      {/* Zona 2: Workspaces do pipeline 3D (padrão Blender / Maya) */}
      <nav
        aria-label="Workspaces 3D"
        className="hidden lg:flex items-center gap-1 bg-[#07090e] p-1 rounded-xl border border-white/8 overflow-x-auto no-scrollbar min-w-0"
      >
        {WORKSPACES.map((ws) => {
          const active =
            ws.id === 'nodes' ? isVfxSceneMode(sceneMode) : sceneMode === ws.id;
          return (
            <button
              key={ws.id}
              type="button"
              title={ws.tip}
              aria-pressed={active && sidePanelOpen}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`h-7 px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer flex items-center ${
                active
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/45 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/6 border border-transparent'
              }`}
            >
              {ws.label}
            </button>
          );
        })}
      </nav>

      {/* Zona 3: Lookdev, Render ao Vivo, Captura & Ícone Discreto de Status */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span
          role="status"
          aria-label={gpuStatusLabel}
          title={gpuStatusLabel}
          className={`hidden sm:flex w-8 h-8 rounded-lg border items-center justify-center shrink-0 ${
            isSoftwareRenderer
              ? 'bg-amber-500/10 border-amber-400/30 text-amber-300'
              : 'bg-emerald-500/10 border-emerald-400/25 text-emerald-300'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
        </span>

        <button
          type="button"
          aria-pressed={liveRenderActive}
          onClick={onToggleLiveRender}
          title="Ativa iluminação final, Bloom e sombras em tempo real sobre a cena"
          aria-label={liveRenderActive ? 'Desativar Render ao Vivo' : 'Ativar Render ao Vivo'}
          className={`h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            liveRenderActive
              ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-emerald-300 shadow-sm'
              : 'bg-[#141c2c] hover:bg-[#1c263b] text-sky-200 border-sky-400/40'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">
            {liveRenderActive ? 'Render ON' : 'Render ao Vivo'}
          </span>
        </button>

        <button
          type="button"
          onClick={onCaptureFrame}
          title="Capturar imagem PNG do viewport"
          aria-label="Capturar PNG"
          className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Capturar PNG</span>
          <span className="sm:hidden">PNG</span>
        </button>
      </div>
    </header>
  );
}
