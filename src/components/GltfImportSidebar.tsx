import {
  Blend,
  Bone,
  Camera,
  Download,
  Film,
  Grid,
  Layers,
  Package,
  Pin,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type {
  ExportCaptureResolution,
  LodTelemetry,
  RigExportProfile,
} from '../types/graphics';

interface GltfImportSidebarProps {
  lodTelemetry: LodTelemetry;
  exportProfile: RigExportProfile;
  startupModelName: string | null;
  transparentPng: boolean;
  captureResolution: ExportCaptureResolution;
  turntable360: boolean;
  multiClipExport: boolean;
  exportingFramesLabel: string | null;
  exportingSpriteSheetLabel: string | null;
  exportingBlenderZip: boolean;
  exportingGlb?: boolean;
  onChangeExportProfile: (profile: RigExportProfile) => void;
  onChangeCaptureResolution: (res: ExportCaptureResolution) => void;
  onToggleTurntable360: () => void;
  onToggleMultiClipExport: () => void;
  onUploadFile: (file: File) => void;
  onInsertRiggedHumanoid: () => void;
  onGoToAnimation: () => void;
  onExportGlb: (profile?: RigExportProfile) => void;
  onExportBlenderZip: (profile?: RigExportProfile) => void;
  onToggleTransparentPng: () => void;
  onCaptureFrame: (transparentOverride?: boolean) => void;
  onExportFramesZip: (step?: number, transparentOverride?: boolean) => void;
  onExportSpriteSheetZip: (step?: number, transparentOverride?: boolean) => void;
  onPinStartupModel: () => void;
  onClearStartupModel: () => void;
  onResetLodAssembly: () => void;
  onClose: () => void;
}

const EXPORT_PROFILES: Array<{ id: RigExportProfile; label: string; title?: string }> = [
  { id: 'standard', label: 'Padrão' },
  { id: 'mixamo', label: 'Mixamo' },
  { id: 'ue5', label: 'UE5', title: 'Unreal Engine 5' },
  { id: 'unity', label: 'Unity' },
  { id: 'godot', label: 'Godot' },
];

const CAPTURE_RESOLUTIONS: Array<{ id: ExportCaptureResolution; label: string }> = [
  { id: 'viewport', label: 'Tela' },
  { id: '1080x1080', label: '1:1' },
  { id: '1920x1080', label: '16:9' },
  { id: '1080x1920', label: '9:16' },
  { id: '3840x2160', label: '4K' },
];

export function GltfImportSidebar({
  lodTelemetry,
  exportProfile,
  startupModelName,
  transparentPng,
  captureResolution,
  turntable360,
  multiClipExport,
  exportingFramesLabel,
  exportingSpriteSheetLabel,
  exportingBlenderZip,
  exportingGlb = false,
  onChangeExportProfile,
  onChangeCaptureResolution,
  onToggleTurntable360,
  onToggleMultiClipExport,
  onUploadFile,
  onInsertRiggedHumanoid,
  onGoToAnimation,
  onExportGlb,
  onExportBlenderZip,
  onToggleTransparentPng,
  onCaptureFrame,
  onExportFramesZip,
  onExportSpriteSheetZip,
  onPinStartupModel,
  onClearStartupModel,
  onResetLodAssembly,
  onClose,
}: GltfImportSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [frameStep, setFrameStep] = useState<1 | 2 | 4>(1);

  const meshCountDisplay = lodTelemetry.loadedModelName
    ? lodTelemetry.loadedMeshCount
    : lodTelemetry.totalLodNodes;

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    onUploadFile(file);
  };

  return (
    <aside
      aria-label="Importação de Modelos GLB, GLTF e ZIP"
      className="fixed left-12 right-2 bottom-[66px] max-h-[58dvh] md:top-[68px] md:left-[68px] md:right-auto md:bottom-[76px] md:max-h-none md:w-[336px] z-20 overflow-y-auto bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3.5"
    >
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 border-b border-white/10 pb-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0">
          <Upload className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wide text-white uppercase">
              Importar &amp; Exportar
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-mono tabular-nums text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                {meshCountDisplay} malha(s)
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar painel"
                title="Recolher painel"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Traga malhas do <span className="text-slate-200">Blender</span> (`.glb`, `.gltf`, `.zip`) e exporte no padrão <span className="text-slate-200">Blender 5.3+</span>.
          </p>
        </div>
      </div>

      {/* Dropzone Interativa */}
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,.zip"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`w-full rounded-xl border-2 border-dashed p-3.5 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer ${
          dragActive
            ? 'bg-sky-500/15 border-sky-400 text-white'
            : 'bg-[#090c13] hover:bg-[#0e1420] border-white/15 hover:border-sky-400/50 text-slate-200'
        }`}
      >
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center">
          <Upload className="w-4 h-4 text-sky-400" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-white">
            Clique ou Arraste .GLB / .GLTF / .ZIP
          </span>
          <span className="text-[11px] text-slate-400">
            Persistente em todos os modos do estúdio
          </span>
        </div>
      </button>

      {/* Resumo do Modelo Carregado ou Exemplo Multi-LOD */}
      {lodTelemetry.loadedModelName ? (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] text-slate-400 block">Modelo Ativo</span>
              <span className="text-xs font-semibold text-white truncate block">
                {lodTelemetry.loadedModelName}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md border shrink-0 ${
                lodTelemetry.boneCount > 0
                  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                  : 'text-amber-300 bg-amber-500/15 border-amber-400/30'
              }`}
            >
              {lodTelemetry.boneCount > 0 ? `${lodTelemetry.boneCount} ossos` : 'Sem ossos'}
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToAnimation}
            className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Animar &amp; Rigging (Ossos / IK / FK)</span>
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onResetLodAssembly}
              className="h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Restaurar LOD</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPinStartupModel}
                className={`flex-1 h-8 px-2 text-[11px] font-medium rounded-lg border flex items-center justify-center gap-1 cursor-pointer truncate ${
                  startupModelName === lodTelemetry.loadedModelName
                    ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/45'
                    : 'bg-[#121826] hover:bg-[#192235] text-sky-200 border-sky-400/30'
                }`}
              >
                <Pin className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {startupModelName === lodTelemetry.loadedModelName ? 'Fixado' : 'Fixar Inicial'}
                </span>
              </button>
              {startupModelName && (
                <button
                  type="button"
                  title="Remover modelo salvo ao iniciar"
                  onClick={onClearStartupModel}
                  className="h-8 px-2 text-[11px] rounded-lg bg-[#121826] hover:bg-rose-500/15 text-slate-300 hover:text-rose-200 border border-white/10 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Exemplo Multi-LOD Ativo</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-[#121826] border border-white/8 py-1.5 px-1">
              <span className="text-[10px] text-slate-400 block">LOD0 (Alta)</span>
              <span className="text-xs font-mono tabular-nums text-sky-300">
                {lodTelemetry.lod0Count}
              </span>
            </div>
            <div className="rounded-lg bg-[#121826] border border-white/8 py-1.5 px-1">
              <span className="text-[10px] text-slate-400 block">LOD1 (Média)</span>
              <span className="text-xs font-mono tabular-nums text-emerald-300">
                {lodTelemetry.lod1Count}
              </span>
            </div>
            <div className="rounded-lg bg-[#121826] border border-white/8 py-1.5 px-1">
              <span className="text-[10px] text-slate-400 block">LOD2 (Baixa)</span>
              <span className="text-xs font-mono tabular-nums text-amber-300">
                {lodTelemetry.lod2Count}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onInsertRiggedHumanoid}
            className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Bone className="w-3.5 h-3.5" />
            <span>Inserir Malha com Ossos (19 Ossos)</span>
          </button>
        </div>
      )}

      {/* Exportação Blender 5.3+ (.GLB & .ZIP Completo) */}
      <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-white truncate">
              Exportar Blender 5.3+
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-1.5 py-0.5 rounded shrink-0">
            5.3+ Ready
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Perfil de Ossos (Exportação Engine)
          </span>
          <div className="grid grid-cols-5 gap-1">
            {EXPORT_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.title ?? p.label}
                onClick={() => onChangeExportProfile(p.id)}
                className={`h-7 px-1 text-[10px] font-medium rounded-md border cursor-pointer flex items-center justify-center ${
                  exportProfile === p.id
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                    : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          aria-pressed={multiClipExport}
          onClick={onToggleMultiClipExport}
          className={`w-full h-8 px-2.5 text-[11px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
            multiClipExport
              ? 'bg-sky-500/20 text-sky-100 border-sky-400/50'
              : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
          }`}
        >
          <span>Pacote Multi-Clipes NLA (.GLB)</span>
          <span className="font-mono text-[10px]">
            {multiClipExport ? 'ON (5 Ações)' : 'OFF'}
          </span>
        </button>

        <button
          type="button"
          disabled={exportingGlb}
          onClick={() => onExportGlb(exportProfile)}
          className="w-full h-8 px-3 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] disabled:opacity-60 text-slate-200 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {exportingGlb
              ? 'Exportando .GLB...'
              : `Exportar .GLB (${EXPORT_PROFILES.find((p) => p.id === exportProfile)?.label})`}
          </span>
        </button>

        <button
          type="button"
          disabled={exportingBlenderZip}
          onClick={() => onExportBlenderZip(exportProfile)}
          className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Package className="w-3.5 h-3.5" />
          <span>
            {exportingBlenderZip
              ? 'Empacotando Blender 5.3+...'
              : 'Exportar .ZIP Completo (Blender 5.3+)'}
          </span>
        </button>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Pacote completo com <span className="text-slate-200">.glb</span>, script <span className="text-slate-200">abrir_no_blender_5_3.py</span> (Câmera/Luz, GeoNodes, NLA Tracks e Bone Collections), <span className="text-slate-200">.vertice.json</span> e prévia PNG transparente.
        </p>
      </div>

      {/* Exportar PNG, Quadro a Quadro & Sprite Sheet */}
      <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Camera className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-white truncate">
              Exportar PNG &amp; Quadro a Quadro
            </span>
          </div>
          <button
            type="button"
            aria-pressed={transparentPng}
            onClick={onToggleTransparentPng}
            className={`h-7 px-2 text-[11px] font-medium rounded-md border flex items-center gap-1 cursor-pointer shrink-0 ${
              transparentPng
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#121826] text-slate-300 border-white/10'
            }`}
          >
            <Blend className="w-3 h-3" />
            <span>Alpha: {transparentPng ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Resolução de Captura */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Resolução de Captura
          </span>
          <div className="grid grid-cols-5 gap-1">
            {CAPTURE_RESOLUTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onChangeCaptureResolution(r.id)}
                className={`h-7 px-1 text-[10px] font-medium rounded-md border cursor-pointer ${
                  captureResolution === r.id
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                    : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onCaptureFrame(true)}
            className="h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-sky-400/35 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Criar PNG Transp.</span>
          </button>
          <button
            type="button"
            onClick={() => onCaptureFrame(false)}
            className="h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-slate-400" />
            <span>PNG com Fundo</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { step: 1 as const, label: '60 quadros' },
              { step: 2 as const, label: '30 quadros' },
              { step: 4 as const, label: '15 quadros' },
            ]
          ).map((opt) => (
            <button
              key={opt.step}
              type="button"
              onClick={() => setFrameStep(opt.step)}
              className={`h-7 px-1.5 text-[11px] font-medium rounded-lg border cursor-pointer ${
                frameStep === opt.step
                  ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                  : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={turntable360}
          onClick={onToggleTurntable360}
          className={`w-full h-8 px-2.5 text-[11px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
            turntable360
              ? 'bg-sky-500/20 text-sky-100 border-sky-400/50'
              : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Giro 360° Turntable na Sequência</span>
          </span>
          <span className="font-mono text-[10px]">{turntable360 ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          disabled={Boolean(exportingFramesLabel)}
          onClick={() => onExportFramesZip(frameStep, transparentPng)}
          className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Film className="w-3.5 h-3.5" />
          <span>
            {exportingFramesLabel
              ? `Exportando ${exportingFramesLabel}...`
              : transparentPng
                ? 'Exportar Quadro a Quadro (.ZIP PNG Transp.)'
                : 'Exportar Quadro a Quadro (.ZIP PNG Fundo)'}
          </span>
        </button>

        <button
          type="button"
          disabled={Boolean(exportingSpriteSheetLabel)}
          onClick={() => onExportSpriteSheetZip(frameStep, transparentPng)}
          className="w-full h-8 px-3 text-[11px] font-semibold rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-60 text-sky-100 border border-sky-400/45 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Grid className="w-3.5 h-3.5 text-sky-300" />
          <span>
            {exportingSpriteSheetLabel
              ? `Montando Sheet ${exportingSpriteSheetLabel}...`
              : 'Exportar Sprite Sheet (.ZIP PNG + JSON)'}
          </span>
        </button>
      </div>
    </aside>
  );
}
