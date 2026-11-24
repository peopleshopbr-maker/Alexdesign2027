import {
  Bone,
  Box,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CopyPlus,
  Diamond,
  Download,
  Film,
  Globe,
  Grid,
  KeyRound,
  Layers,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Share2,
  SkipBack,
  SkipForward,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Zap,
  Eye,
  Blend,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AnimationActionCycle,
  AnimationSettings,
  CameraPreset,
  GeometryNodesSettings,
  LightingPreset,
  MaterialFinish,
  MoGraphDistribution,
  MoGraphEffector,
  NlaTimelineStrip,
  ProceduralNodeTemplate,
  RigExportProfile,
  ViewportShadingMode,
} from '../types/graphics';

const EXPORT_PROFILES: Array<{ id: RigExportProfile; label: string }> = [
  { id: 'standard', label: 'Padrão' },
  { id: 'mixamo', label: 'Mixamo' },
  { id: 'ue5', label: 'UE5' },
  { id: 'unity', label: 'Unity' },
  { id: 'godot', label: 'Godot' },
];

const FINISH_OPTIONS: Array<{ id: MaterialFinish; label: string; swatch: string }> = [
  { id: 'titanium', label: 'Titânio', swatch: 'bg-slate-300' },
  { id: 'cobalt', label: 'Cobalto', swatch: 'bg-blue-500' },
  { id: 'gold', label: 'Ouro', swatch: 'bg-amber-400' },
  { id: 'crystal', label: 'Cristal', swatch: 'bg-cyan-200' },
  { id: 'copper', label: 'Cobre', swatch: 'bg-orange-500' },
  { id: 'bronze', label: 'Bronze', swatch: 'bg-amber-700' },
  { id: 'chrome', label: 'Cromo', swatch: 'bg-gradient-to-br from-white via-slate-200 to-slate-400' },
  { id: 'obsidian', label: 'Obsidiana', swatch: 'bg-zinc-900 ring-1 ring-white/30' },
  { id: 'ceramic', label: 'Cerâmica', swatch: 'bg-stone-100' },
  { id: 'crimson', label: 'Rubi', swatch: 'bg-rose-500' },
  { id: 'emerald', label: 'Esmeralda', swatch: 'bg-emerald-400' },
  { id: 'iridescent', label: 'Furta-Cor', swatch: 'bg-gradient-to-tr from-fuchsia-500 via-violet-400 to-cyan-300' },
];

const CAMERA_PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'orbital', label: 'Orbital' },
  { id: 'front', label: 'Frontal' },
  { id: 'side', label: 'Lateral' },
  { id: 'top', label: 'Topo' },
  { id: 'macro', label: 'Macro' },
];

const SHADING_MODES: Array<{ id: ViewportShadingMode; label: string }> = [
  { id: 'pbr', label: 'PBR' },
  { id: 'clay', label: 'Clay' },
  { id: 'redwax', label: 'Red Wax' },
  { id: 'chrome', label: 'Cromo' },
  { id: 'normals', label: 'Normais' },
  { id: 'uv', label: 'UV' },
  { id: 'cel', label: 'Cel' },
];

const STRIP_PALETTE_ACTIONS: Array<{ id: AnimationActionCycle; label: string }> = [
  { id: 'idle', label: 'Idle' },
  { id: 'walk', label: 'Caminhar' },
  { id: 'run', label: 'Correr' },
  { id: 'jump', label: 'Pular' },
  { id: 'slash', label: 'Espada' },
  { id: 'hit', label: 'Hit' },
  { id: 'death', label: 'Morte' },
  { id: 'block', label: 'Bloqueio' },
  { id: 'fall', label: 'Queda' },
  { id: 'land', label: 'Pouso' },
  { id: 'dash', label: 'Dash' },
  { id: 'interact', label: 'Interagir' },
  { id: 'chest_open', label: 'Abrir Tórax' },
];

const DISTRIBUTIONS: Array<{ id: MoGraphDistribution; label: string }> = [
  { id: 'radial', label: 'Radial 360°' },
  { id: 'grid', label: 'Grade 3D' },
  { id: 'helix', label: 'Hélice' },
];

const EFFECTORS: Array<{ id: MoGraphEffector; label: string }> = [
  { id: 'wave', label: 'Onda' },
  { id: 'spiral', label: 'Espiral' },
  { id: 'fracture', label: 'Fratura' },
  { id: 'pulse', label: 'Pulso' },
];

interface AnimationTimelineDockProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  animation: AnimationSettings;
  loadedClips: string[];
  isRecording: boolean;
  undoCount: number;
  redoCount: number;
  onUpdateAnimation: (patch: Partial<AnimationSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleRecordWebm: () => void;
  onOpenRetargetPicker: () => void;
  onNotice: (msg: string) => void;
  onAddNlaStrip?: (
    label: string,
    sourceType: 'procedural' | 'clip',
    actionCycle?: AnimationActionCycle,
    clipIndex?: number,
    startAt?: number,
  ) => void;
  lodTelemetry?: { loadedModelName?: string | null; loadedMeshCount?: number; boneCount?: number; totalLodNodes?: number; lod0Count?: number; lod1Count?: number; lod2Count?: number };
  exportProfile?: RigExportProfile;
  onChangeExportProfile?: (profile: RigExportProfile) => void;
  onUploadFile?: (file: File) => void;
  onInsertRiggedHumanoid?: () => void;
  onExportGlb?: (profile?: RigExportProfile) => void;
  onExportBlenderZip?: (profile?: RigExportProfile) => void;
  exportingGlb?: boolean;
  exportingBlenderZip?: boolean;
  multiClipExport?: boolean;
  onToggleMultiClipExport?: () => void;
  transparentPng?: boolean;
  onToggleTransparentPng?: () => void;
  captureResolution?: string;
  onChangeCaptureResolution?: (res: string) => void;
  turntable360?: boolean;
  onToggleTurntable360?: () => void;
  onCaptureFrame?: (transparentOverride?: boolean) => void;
  onExportFramesZip?: (step?: number, transparentOverride?: boolean) => void;
  onExportSpriteSheetZip?: (step?: number, transparentOverride?: boolean) => void;
  exportingFramesLabel?: string | null;
  exportingSpriteSheetLabel?: string | null;
  finish?: MaterialFinish;
  explosion?: number;
  speed?: number;
  turbulence?: number;
  frequency?: number;
  viewportShadingMode?: ViewportShadingMode;
  onChangeFinish?: (finish: MaterialFinish) => void;
  onChangeExplosion?: (v: number) => void;
  onChangeSpeed?: (v: number) => void;
  onChangeTurbulence?: (v: number) => void;
  onChangeFrequency?: (v: number) => void;
  onChangeViewportShading?: (mode: ViewportShadingMode) => void;
  onCameraPreset?: (preset: CameraPreset) => void;
  onRestoreGltfMaterials?: () => void;
  loadedModelName?: string | null;
  postProcessing?: { enabled: boolean; bloomStrength: number; dofEnabled: boolean; dofFocus: number; grainAmount: number; chromaticAmount: number };
  lighting?: { preset: LightingPreset; exposure: number; envIntensity: number; envRotationDeg: number; shadowIntensity: number };
  onUpdateSettings?: (patch: any) => void;
  geometryNodes?: GeometryNodesSettings;
  onChangeGeometryNodes?: (patch: Partial<GeometryNodesSettings>) => void;
  onChangeLightingPreset?: (preset: LightingPreset) => void;
  onChangeEnvIntensity?: (v: number) => void;
  onChangeEnvRotation?: (v: number) => void;
  onChangeShadowIntensity?: (v: number) => void;
  onChangeExposure?: (v: number) => void;
  onChangeBloomStrength?: (v: number) => void;
  onChangeGrainAmount?: (v: number) => void;
  onChangeChromaticAmount?: (v: number) => void;
  onChangeDofEnabled?: (v: boolean) => void;
  onChangeDofFocus?: (v: number) => void;
  onChangePostFxEnabled?: (v: boolean) => void;
  onChangeInstanceCount?: (v: number) => void;
  instanceCount?: number;
  onTriggerPhysicsImpulse?: () => void;
  onSelectVfxSubMode?: (mode: string) => void;
  onApplyTemplate?: (template: ProceduralNodeTemplate) => void;
  onInstantiateCircular6x?: () => void;
  onSelectShaderPreset?: (presetId: string) => void;
  onResetToPbrFromShader?: () => void;
  onToggleLiveRender?: () => void;
  liveRenderActive?: boolean;
  sceneMode?: string;
  onChangeSceneMode?: (mode: string) => void;
  vfxTab?: string;
  onChangeVfxTab?: (tab: string) => void;
}

export function AnimationTimelineDock(props: AnimationTimelineDockProps) {
  const { animation } = props;

  const frameStart = animation.frameStart ?? 1;
  const frameEnd = animation.frameEnd ?? 60;
  const pxPerFrame = 18;
  const maxTimelineFrame = Math.max(frameEnd, 240);
  const totalWidth = maxTimelineFrame * pxPerFrame;

  const laneScrollRef = useRef<HTMLDivElement>(null);
  const [tracks, setTracks] = useState<{ id: string; name: string; visible: boolean; solo: boolean; mute: boolean; blendMode: string; extrapolation: string; strips: NlaTimelineStrip[] }[]>([
    { id: 'base', name: 'Base', visible: true, solo: false, mute: false, blendMode: 'replace', extrapolation: 'hold', strips: animation.nlaStrips ?? [] },
  ]);
  const [onionSkinning, setOnionSkinning] = useState({ enabled: false, beforeFrames: 2, afterFrames: 2, opacity: 0.3 });
  const [, setShowTimecode] = useState(true);

  const [commandTab, setCommandTab] = useState<'import' | 'pbr' | 'rig' | 'vfx'>('rig');

  const tabLabel = { import: 'Importar & Exportar', pbr: 'Materiais & Câmera', rig: 'Rig & Animação', vfx: 'VFX Studio' } as const;
  const tabIcon = { import: Upload, pbr: Box, rig: Bone, vfx: Zap } as const;

  useEffect(() => {
    setTracks((prev) => {
      const baseTrack = prev.find((t) => t.id === 'base');
      const newBaseStrips = animation.nlaStrips ?? [];
      if (baseTrack && baseTrack.strips.length === newBaseStrips.length &&
          baseTrack.strips.every((s, i) => s.id === newBaseStrips[i]?.id)) {
        return prev;
      }
      return prev.map((t) => t.id === 'base' ? { ...t, strips: newBaseStrips } : t);
    });
  }, [animation.nlaStrips]);

  useEffect(() => {
    if (!animation.playing || !laneScrollRef.current) return;
    const playheadX = (animation.currentFrame - 1) * pxPerFrame;
    const el = laneScrollRef.current;
    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    if (Math.abs(playheadX - viewportCenter) > el.clientWidth * 0.3) {
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth / 2);
    }
  }, [animation.playing, animation.currentFrame, pxPerFrame]);

  const hasCurrentKeyframe = animation.keyframes.includes(animation.currentFrame);

  const toggleKeyframeAt = (frame: number) => {
    const exists = animation.keyframes.includes(frame);
    const nextKf = exists
      ? animation.keyframes.length > 1
        ? animation.keyframes.filter((k) => k !== frame)
        : animation.keyframes
      : [...animation.keyframes, frame].sort((a, b) => a - b);
    props.onUpdateAnimation({ keyframes: nextKf });
  };

  const jumpPrevKeyframe = () => {
    const sorted = [...animation.keyframes].sort((a, b) => a - b);
    const prev = [...sorted].reverse().find((k) => k < animation.currentFrame);
    props.onUpdateAnimation({ currentFrame: prev ?? frameStart, playing: false, cycleMode: 'full_cycle' });
  };

  const jumpNextKeyframe = () => {
    const sorted = [...animation.keyframes].sort((a, b) => a - b);
    const next = sorted.find((k) => k > animation.currentFrame);
    props.onUpdateAnimation({ currentFrame: next ?? frameEnd, playing: false, cycleMode: 'full_cycle' });
  };

  // ============ TAB PANELS ============

  const ImportExportPanel = () => {
    const meshCountDisplay = props.lodTelemetry?.loadedModelName
      ? props.lodTelemetry?.loadedMeshCount
      : props.lodTelemetry?.totalLodNodes;

    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
      const file = files?.[0];
      if (!file || !props.onUploadFile) return;
      props.onUploadFile(file);
    };

    return (
      <div className="space-y-2">
        <div className="flex items-start gap-3 border-b border-white/10 pb-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0">
            <Upload className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[9px] font-bold tracking-wide text-white uppercase">Importar &amp; Exportar</h3>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[9px] font-mono tabular-nums text-sky-300 bg-sky-500/15 border border-sky-400/30 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                {meshCountDisplay} malha(s)
              </span>
            </div>
            <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">
              Traga malhas do <span className="text-slate-200">Blender</span> (`.glb`, `.gltf`, `.zip`) e exporte no padrão <span className="text-slate-200">Blender 5.3+</span>.
            </p>
          </div>
        </div>

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
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="w-full rounded-xl border-2 border-dashed p-3 flex flex-col items-center justify-center text-center gap-1 bg-[#090c13] hover:bg-[#0e1420] border-white/15 hover:border-sky-400/50 text-slate-200 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center">
            <Upload className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-semibold text-white">Clique ou Arraste .GLB / .GLTF / .ZIP</span>
            <span className="text-[9px] text-slate-400">Persistente em todos os modos do estúdio</span>
          </div>
        </button>

        {props.lodTelemetry?.loadedModelName ? (
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <div className="min-w-0">
                <span className="text-[9px] text-slate-400 block">Modelo Ativo</span>
                <span className="text-[9px] font-semibold text-white truncate block">{props.lodTelemetry.loadedModelName}</span>
              </div>
              <span className={`text-[9px] font-mono tabular-nums px-1 py-0.5 rounded border shrink-0 ${props.lodTelemetry.boneCount! > 0 ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' : 'text-amber-300 bg-amber-500/15 border-amber-400/30'}`}>
                {props.lodTelemetry.boneCount! > 0 ? `${props.lodTelemetry.boneCount} ossos` : 'Sem ossos'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={props.onInsertRiggedHumanoid}
                className="h-8 px-2 text-[9px] font-medium rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Bone className="w-3 h-3" />
                <span>Inserir Malha (19 Ossos)</span>
              </button>
              {EXPORT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => props.onChangeExportProfile?.(p.id)}
                  className={`h-8 px-2 text-[9px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${props.exportProfile === p.id ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  {p.label === 'Padrão' ? 'LOD0 Alta' : p.label === 'Mixamo' ? 'LOD1 Média' : p.label === 'UE5' ? 'LOD2 Baixa' : p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold text-slate-200">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>Exemplo Multi-LOD Ativo</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded-lg bg-[#121826] border border-white/8 py-1 px-0.5">
                <span className="text-[9px] text-slate-400 block">LOD0 (Alta)</span>
                <span className="text-[9px] font-mono tabular-nums text-sky-300">{props.lodTelemetry?.lod0Count}</span>
              </div>
              <div className="rounded-lg bg-[#121826] border border-white/8 py-1 px-0.5">
                <span className="text-[9px] text-slate-400 block">LOD1 (Média)</span>
                <span className="text-[9px] font-mono tabular-nums text-emerald-300">{props.lodTelemetry?.lod1Count}</span>
              </div>
              <div className="rounded-lg bg-[#121826] border border-white/8 py-1 px-0.5">
                <span className="text-[9px] text-slate-400 block">LOD2 (Baixa)</span>
                <span className="text-[9px] font-mono tabular-nums text-amber-300">{props.lodTelemetry?.lod2Count}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onInsertRiggedHumanoid}
              className="w-full h-8 px-2 text-[9px] font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
            >
              <Bone className="w-3 h-3" />
              <span>Inserir Malha com Ossos (19 Ossos)</span>
            </button>
          </div>
        )}

        <div className="rounded-xl bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <Download className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[9px] font-semibold text-white truncate">Exportar Blender 5.3+</span>
            </div>
            <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-1 py-0.5 rounded shrink-0">
              5.3+ Ready
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Perfil de Ossos (Exportação Engine)</span>
            <div className="grid grid-cols-5 gap-0.5">
              {EXPORT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => props.onChangeExportProfile?.(p.id)}
                  className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${props.exportProfile === p.id ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={props.multiClipExport}
            onClick={props.onToggleMultiClipExport}
            className={`w-full h-7 px-1.5 text-[9px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${props.multiClipExport ? 'bg-sky-500/20 text-sky-100 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
          >
            <span>Pacote Multi-Clipes NLA (.GLB)</span>
            <span className="font-mono text-[9px]">{props.multiClipExport ? 'ON (5 Ações)' : 'OFF'}</span>
          </button>
          <button
            type="button"
            disabled={props.exportingGlb}
            onClick={() => props.onExportGlb?.(props.exportProfile)}
            className={`w-full h-7 px-2 text-[9px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] disabled:opacity-60 text-slate-200 border border-white/10 flex items-center justify-center gap-1 cursor-pointer ${props.exportingGlb ? 'opacity-80 cursor-not-allowed' : ''}`}
          >
            <Download className="w-3 h-3 text-sky-400" />
            <span>{props.exportingGlb ? 'Exportando .GLB...' : `Exportar .GLB (${props.exportProfile})`}</span>
          </button>
          <button
            type="button"
            disabled={props.exportingBlenderZip}
            onClick={() => props.onExportBlenderZip?.(props.exportProfile)}
            className="w-full h-8 px-2 text-[9px] font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>{props.exportingBlenderZip ? 'Empacotando Blender 5.3+...' : 'Exportar .ZIP Completo (Blender 5.3+)'}</span>
          </button>
        </div>

        <div className="rounded-xl bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <Film className="w-3 h-3 text-sky-400 shrink-0" />
              <span className="text-[9px] font-semibold text-white truncate">Exportar PNG &amp; Quadro a Quadro</span>
            </div>
            <button
              type="button"
              aria-pressed={props.transparentPng}
              onClick={props.onToggleTransparentPng}
              className={`h-6 px-1.5 text-[9px] font-medium rounded-md border flex items-center gap-0.5 cursor-pointer shrink-0 ${props.transparentPng ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10'}`}
            >
              <Blend className="w-2.5 h-2.5" />
              <span>Alpha: {props.transparentPng ? 'ON' : 'OFF'}</span>
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 block">Resolução de Captura</span>
            <div className="grid grid-cols-5 gap-0.5">
              {['Tela', '1:1', '16:9', '9:16', '4K'].map((label, i) => {
                const id = ['viewport', '1080x1080', '1920x1080', '1080x1920', '3840x2160'][i];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => props.onChangeCaptureResolution?.(id)}
                    className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${props.captureResolution === id ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => props.onCaptureFrame?.(true)}
              className="h-7 px-1.5 text-[9px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-sky-400/35 flex items-center justify-center gap-0.5 cursor-pointer"
            >
              <Film className="w-2.5 h-2.5" />
              <span>PNG Transp.</span>
            </button>
            <button
              type="button"
              onClick={() => props.onCaptureFrame?.(false)}
              className="h-7 px-1.5 text-[9px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center justify-center gap-0.5 cursor-pointer"
            >
              <Film className="w-2.5 h-2.5 text-slate-400" />
              <span>PNG Fundo</span>
            </button>
          </div>
          <button
            type="button"
            aria-pressed={props.turntable360}
            onClick={props.onToggleTurntable360}
            className={`w-full h-7 px-1.5 text-[9px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${props.turntable360 ? 'bg-sky-500/20 text-sky-100 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
          >
            <span className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-sky-400" />
              <span>Giro 360° Turntable</span>
            </span>
            <span className="font-mono text-[9px]">{props.turntable360 ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            disabled={Boolean(props.exportingFramesLabel)}
            onClick={() => props.onExportFramesZip?.(1, props.transparentPng)}
            className="w-full h-8 px-2 text-[9px] font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Film className="w-3 h-3" />
            <span>{props.exportingFramesLabel ? `Exportando ${props.exportingFramesLabel}...` : props.transparentPng ? 'Exportar Quadro a Quadro (.ZIP PNG Transp.)' : 'Exportar Quadro a Quadro (.ZIP PNG Fundo)'}</span>
          </button>
          <button
            type="button"
            disabled={Boolean(props.exportingSpriteSheetLabel)}
            onClick={() => props.onExportSpriteSheetZip?.(1, props.transparentPng)}
            className="w-full h-7 px-2 text-[9px] font-semibold rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-60 text-sky-100 border border-sky-400/45 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Grid className="w-3 h-3 text-sky-300" />
            <span>{props.exportingSpriteSheetLabel ? `Montando Sheet ${props.exportingSpriteSheetLabel}...` : 'Exportar Sprite Sheet (.ZIP PNG + JSON)'}</span>
          </button>
        </div>
      </div>
    );
  };

  const PbrCameraPanel = () => {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 border-b border-white/10 pb-1 mb-1">
          <Box className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[9px] font-bold tracking-wide text-white uppercase">Materiais &amp; Câmera</h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Motor PBR · Materiais físicos · Vista explodida</p>
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] font-semibold text-slate-400 block">Acabamento PBR (12 opções)</span>
            <span className="text-[9px] font-mono text-slate-500">{FINISH_OPTIONS.length}</span>
          </div>
          <div className="grid grid-cols-4 gap-0.5">
            {FINISH_OPTIONS.map((f) => {
              const active = props.finish === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => props.onChangeFinish?.(f.id)}
                  className={`h-7 px-1 text-[9px] font-medium rounded border cursor-pointer flex items-center justify-center gap-0.5 ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${f.swatch}`} />
                  <span className="truncate">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Vista Explodida</span>
            <span className="font-mono text-sky-300">{Math.round((props.explosion ?? 0) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={props.explosion ?? 0}
            onChange={(e) => props.onChangeExplosion?.(Number(e.target.value))}
            className="studio-slider w-full h-1.5 accent-sky-500"
          />
          {props.loadedModelName && props.onRestoreGltfMaterials && (
            <button
              type="button"
              onClick={props.onRestoreGltfMaterials}
              className="w-full h-7 px-2 text-[9px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center justify-center cursor-pointer"
            >
              Restaurar Material Original do GLB
            </button>
          )}
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Velocidade da Simulação</span>
            <span className="font-mono text-sky-300">{props.speed?.toFixed(1) ?? '1.0'}x</span>
          </div>
          <input
            type="range"
            min={0}
            max={2.5}
            step={0.1}
            value={props.speed ?? 1}
            onChange={(e) => props.onChangeSpeed?.(Number(e.target.value))}
            className="studio-slider w-full h-1.5 accent-sky-500"
          />
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Presets de Câmera</span>
          </div>
          <div className="grid grid-cols-5 gap-0.5">
            {CAMERA_PRESETS.map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => props.onCameraPreset?.(cam.id)}
                className="h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer bg-[#121826] text-slate-200 border-white/10 hover:text-white hover:bg-[#192235] flex items-center justify-center"
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Modo de Visualização</span>
          </div>
          <div className="grid grid-cols-4 gap-0.5">
            {SHADING_MODES.map((m) => {
              const active = props.viewportShadingMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => props.onChangeViewportShading?.(m.id)}
                  className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Pós-Processamento</span>
            <button
              type="button"
              aria-pressed={props.postProcessing?.enabled}
              onClick={() => props.onChangePostFxEnabled?.(!(props.postProcessing?.enabled ?? false))}
              className={`h-6 px-1.5 text-[9px] font-medium rounded border cursor-pointer ${props.postProcessing?.enabled ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            >
              {props.postProcessing?.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Bloom</span>
              <span className="font-mono text-sky-300">{props.postProcessing?.bloomStrength?.toFixed(2) ?? '0.00'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1.4}
              step={0.05}
              value={props.postProcessing?.bloomStrength ?? 0}
              onChange={(e) => props.onChangeBloomStrength?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Film Grain</span>
              <span className="font-mono text-sky-300">{props.postProcessing?.grainAmount?.toFixed(3) ?? '0.000'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.15}
              step={0.01}
              value={props.postProcessing?.grainAmount ?? 0}
              onChange={(e) => props.onChangeGrainAmount?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-[9px] font-semibold text-slate-400 uppercase mb-1">
            <Sun className="w-3 h-3" />
            <span>Iluminação &amp; HDRI</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {['studio', 'dramatic', 'cyber', 'sunset'].map((p) => {
              const active = props.lighting?.preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => props.onChangeLightingPreset?.(p as LightingPreset)}
                  className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Exposição</span>
              <span className="font-mono text-sky-300">{props.lighting?.exposure?.toFixed(2) ?? '1.00'}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={props.lighting?.exposure ?? 1}
              onChange={(e) => props.onChangeExposure?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Intensidade HDRI</span>
              <span className="font-mono text-sky-300">{props.lighting?.envIntensity?.toFixed(2) ?? '1.00'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={props.lighting?.envIntensity ?? 1}
              onChange={(e) => props.onChangeEnvIntensity?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
        </div>
      </div>
    );
  };

  const RigAnimationPanel = () => {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 border-b border-white/10 pb-1 mb-1">
          <Bone className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[9px] font-bold tracking-wide text-white uppercase">Rig &amp; Animação</h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Pistas NLA · Ciclos de Ação · Keyframes</p>
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              aria-pressed={!animation.playing}
              onClick={() => props.onUpdateAnimation({ playing: false })}
              className={`h-7 text-[9px] font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer ${!animation.playing ? 'bg-[#1e293b] text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
            >
              <Pause className="w-3 h-3" />
              <span>Editar</span>
            </button>
            <button
              type="button"
              aria-pressed={animation.playing}
              onClick={() => props.onUpdateAnimation({ playing: true, enabled: true, cycleMode: 'full_cycle' })}
              className={`h-7 text-[9px] font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer ${animation.playing ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/35' : 'text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'}`}
            >
              <Play className="w-3 h-3" />
              <span>Play</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              aria-pressed={animation.cycleMode === 'static'}
              onClick={() => props.onUpdateAnimation({ cycleMode: 'static', playing: false })}
              className={`h-7 px-1 text-[9px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${animation.cycleMode === 'static' ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            >
              Pose Estática (1f)
            </button>
            <button
              type="button"
              aria-pressed={animation.cycleMode === 'full_cycle'}
              onClick={() => props.onUpdateAnimation({ cycleMode: 'full_cycle', playing: true, enabled: true })}
              className={`h-7 px-1 text-[9px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${animation.cycleMode === 'full_cycle' ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            >
              Ciclo Completo (60f)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => props.onUpdateAnimation({ rotationMode: animation.rotationMode === 'quaternion' ? 'euler' : 'quaternion' })}
            className="h-7 px-1 text-[9px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer flex items-center justify-center whitespace-nowrap"
          >
            Rotação: {animation.rotationMode === 'quaternion' ? 'Quaternion' : 'Euler'}
          </button>
          <button
            type="button"
            onClick={() => {
              const f = animation.currentFrame;
              const nextKf = hasCurrentKeyframe
                ? animation.keyframes.length > 1
                  ? animation.keyframes.filter((k) => k !== f)
                  : animation.keyframes
                : [...animation.keyframes, f].sort((a, b) => a - b);
              props.onUpdateAnimation({ keyframes: nextKf });
            }}
            className={`h-7 px-1 text-[9px] font-medium rounded-lg border cursor-pointer flex items-center justify-center whitespace-nowrap ${hasCurrentKeyframe ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/40' : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border-sky-400/40'}`}
          >
            {hasCurrentKeyframe ? `Remover Key (${animation.currentFrame}f)` : `+ Keyframe (${animation.currentFrame}f)`}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            aria-pressed={animation.inPlace}
            onClick={() => props.onUpdateAnimation({ inPlace: !animation.inPlace })}
            className={`h-7 px-1 text-[9px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${animation.inPlace ? 'bg-sky-500/20 text-sky-200 border-sky-400/55' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
          >
            No Lugar: {animation.inPlace ? 'In-Place' : 'Raiz'}
          </button>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              aria-pressed={animation.playing}
              onClick={() => props.onUpdateAnimation({ playing: !animation.playing, enabled: true, cycleMode: 'full_cycle' })}
              className={`h-8 px-3 text-[9px] font-semibold rounded-lg border flex items-center gap-1 shrink-0 cursor-pointer ${animation.playing ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50' : 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-transparent'}`}
            >
              {animation.playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{animation.playing ? 'Pausar' : 'Animar'}</span>
            </button>
            <input
              type="range"
              min={1}
              max={animation.frameEnd ?? 60}
              step={1}
              value={animation.currentFrame}
              onChange={(e) => props.onUpdateAnimation({ currentFrame: Number(e.target.value), playing: false, cycleMode: 'full_cycle' })}
              className="studio-slider flex-1"
            />
            <span className="text-[9px] font-mono tabular-nums text-slate-200 w-8 text-right shrink-0">
              {animation.currentFrame}f
            </span>
          </div>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={props.onInsertRiggedHumanoid}
            className="w-full h-7 px-2 text-[9px] font-semibold rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/40 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Bone className="w-3 h-3" />
            <span>Inserir Personagem com Ossos (19 Ossos)</span>
          </button>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[9px] font-semibold text-slate-400 block">Ciclos de Ação (NLA Strips)</span>
            <button
              type="button"
              onClick={() => props.onUpdateAnimation({ nlaStrips: [], cycleMode: 'full_cycle', enabled: true })}
              className="w-6 h-6 rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-300 border border-white/10 flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {STRIP_PALETTE_ACTIONS.map((a) => {
              const active = animation.action === a.id && animation.poseSource === 'procedural';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    props.onUpdateAnimation({
                      action: a.id,
                      poseSource: 'procedural',
                      enabled: true,
                      playing: true,
                      cycleMode: 'full_cycle',
                    });
                    props.onAddNlaStrip?.(a.label, 'procedural', a.id, undefined, animation.currentFrame);
                  }}
                  className={`h-7 px-1 text-[9px] font-medium rounded-lg border whitespace-nowrap cursor-pointer flex items-center justify-center ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/55 shadow-sm' : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          {props.loadedClips.length > 0 && (
            <div className="mt-1.5">
              <span className="text-[9px] font-semibold text-slate-400 uppercase block mb-1">Clipes .GLB Carregados</span>
              <div className="flex flex-wrap gap-1">
                {props.loadedClips.map((name, idx) => (
                  <button
                    key={`${name}_${idx}`}
                    type="button"
                    onClick={() => props.onAddNlaStrip?.(name, 'clip', undefined, idx, animation.currentFrame)}
                    className="h-6 px-1 text-left text-[9px] rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 truncate cursor-pointer"
                  >
                    + {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Pistas NLA</span>
            <button
              type="button"
              onClick={() => {
                setTracks((prev) => {
                  const next = [...prev, { id: `track_${Date.now()}`, name: `Pista ${prev.length + 1}`, visible: true, solo: false, mute: false, blendMode: 'replace', extrapolation: 'hold', strips: [] }];
                  return next;
                });
              }}
              className="h-6 px-1 text-[9px] font-medium rounded border cursor-pointer bg-sky-500/15 text-sky-200 border-sky-400/40 hover:bg-sky-500/25"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>Nova Pista</span>
            </button>
          </div>
          {tracks.map((track) => {
            const stripCount = track.strips.length;
            return (
              <div key={track.id} className="flex items-center gap-1 bg-[#121826] border border-white/8 rounded p-1.5">
                <input
                  type="checkbox"
                  checked={track.visible}
                  onChange={() => setTracks((prev) => prev.map((t) => t.id === track.id ? { ...t, visible: !t.visible } : t))}
                  className="w-3 h-3 rounded accent-sky-500"
                />
                <span className={`text-[9px] ${track.visible ? 'text-slate-200' : 'text-slate-500'} truncate w-16`}>{track.name}</span>
                <span className="text-[9px] text-slate-500 font-mono w-12 text-right">{stripCount} strip(s)</span>
                <button
                  type="button"
                  onClick={() => setTracks((prev) => prev.filter((t) => t.id !== track.id && t.id !== 'base'))}
                  className="h-6 w-6 rounded bg-[#121826] hover:bg-rose-500/20 text-slate-400 hover:text-rose-200 border border-white/10 flex items-center justify-center cursor-pointer"
                  title="Excluir pista"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const VfxStudioPanel = () => {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 border-b border-white/10 pb-1 mb-1">
          <Zap className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[9px] font-bold tracking-wide text-white uppercase">VFX Studio</h3>
            <p className="text-[9px] text-slate-400 mt-0.5">Nodes · Física · Instâncias · Pós-FX</p>
          </div>
        </div>

        <div className="flex gap-0.5 mb-1">
          {['nodes', 'physics', 'instanced', 'shader', 'postfx'].map((tab) => {
            const active = props.vfxTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  props.onChangeVfxTab?.(tab);
                  if (tab !== 'postfx') props.onChangeSceneMode?.(tab);
                }}
                className={`h-7 px-1.5 text-[9px] font-medium rounded border cursor-pointer ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
              >
                {tab === 'nodes' ? 'Nodes' : tab === 'physics' ? 'Física' : tab === 'instanced' ? 'Instâncias' : tab === 'shader' ? 'Efeitos' : 'Pós-FX'}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">MoGraph Cloner</span>
            <button
              type="button"
              aria-pressed={props.geometryNodes?.enabled}
              onClick={() => props.onChangeGeometryNodes?.({ enabled: !(props.geometryNodes?.enabled ?? false) })}
              className={`h-6 px-1.5 text-[9px] font-medium rounded border cursor-pointer ${props.geometryNodes?.enabled ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            >
              {props.geometryNodes?.enabled ? 'Ativo' : 'Ativar'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {DISTRIBUTIONS.map((d) => {
              const active = props.geometryNodes?.distribution === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => props.onChangeGeometryNodes?.({ distribution: d.id })}
                  className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {EFFECTORS.map((e) => {
              const active = props.geometryNodes?.effector === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => props.onChangeGeometryNodes?.({ effector: e.id })}
                  className={`h-6 px-0.5 text-[9px] font-medium rounded border cursor-pointer ${active ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Quantidade de Clones</span>
              <span className="font-mono text-sky-300">{props.geometryNodes?.cloneCount}</span>
            </div>
            <input
              type="range"
              min={4}
              max={36}
              step={1}
              value={props.geometryNodes?.cloneCount ?? 6}
              onChange={(e) => props.onChangeGeometryNodes?.({ cloneCount: Number(e.target.value) })}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Raio / Espaçamento</span>
              <span className="font-mono text-sky-300">{props.geometryNodes?.spacing?.toFixed(1) ?? '1.0'}</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={3.5}
              step={0.1}
              value={props.geometryNodes?.spacing ?? 1}
              onChange={(e) => props.onChangeGeometryNodes?.({ spacing: Number(e.target.value) })}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Força</span>
              <span className="font-mono text-sky-300">{props.geometryNodes?.strength?.toFixed(2) ?? '1.00'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={props.geometryNodes?.strength ?? 1}
              onChange={(e) => props.onChangeGeometryNodes?.({ strength: Number(e.target.value) })}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Velocidade</span>
              <span className="font-mono text-sky-300">{props.geometryNodes?.speed?.toFixed(1) ?? '1.0'}x</span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.1}
              value={props.geometryNodes?.speed ?? 1}
              onChange={(e) => props.onChangeGeometryNodes?.({ speed: Number(e.target.value) })}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <button
            type="button"
            onClick={props.onInstantiateCircular6x}
            className="w-full h-7 px-2 text-[9px] font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3" />
            <span>MoGraph Ativo</span>
          </button>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 text-[9px]">
            <span className="font-medium text-slate-200">Templates Procedurais 3D</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[
              { id: 'glass_neon', label: 'Vidro & Neon' },
              { id: 'organic_sculpt', label: 'Escultura Orgânica' },
              { id: 'parametric_arch', label: 'Arquitetura Paramétrica' },
              { id: 'holo_grid', label: 'Grade Holográfica' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => props.onApplyTemplate?.(t.id as ProceduralNodeTemplate)}
                className={`h-7 px-1 text-[9px] font-medium rounded border cursor-pointer flex items-center justify-center bg-[#121826] text-slate-300 border-white/10 hover:text-white hover:bg-[#192235]`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => props.onChangeSceneMode?.('instanced')}
            className="w-full h-7 px-2 text-[9px] font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Boxes className="w-3 h-3" />
            <span>Instanciar Array Circular</span>
          </button>
        </div>

        <div className="rounded-lg bg-[#090c13] border border-white/10 p-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={props.onTriggerPhysicsImpulse}
            className="w-full h-7 px-2 text-[9px] font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Zap className="w-3 h-3" />
            <span>Lançar Impulso Físico</span>
          </button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Instâncias</span>
              <span className="font-mono text-sky-300">{props.instanceCount?.toLocaleString('pt-BR') ?? '2.000'}</span>
            </div>
            <input
              type="range"
              min={500}
              max={20000}
              step={500}
              value={props.instanceCount ?? 2000}
              onChange={(e) => props.onChangeInstanceCount?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Turbulência</span>
              <span className="font-mono text-sky-300">{props.turbulence?.toFixed(2) ?? '0.00'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={props.turbulence ?? 0}
              onChange={(e) => props.onChangeTurbulence?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-slate-400">Frequência</span>
              <span className="font-mono text-sky-300">{props.frequency?.toFixed(1) ?? '1.0'}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={props.frequency ?? 1}
              onChange={(e) => props.onChangeFrequency?.(Number(e.target.value))}
              className="studio-slider w-full h-1.5 accent-sky-500"
            />
          </div>
        </div>
      </div>
    );
  };

  // ============ RENDER ============

  if (props.collapsed) {
    return (
      <div className="fixed bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[calc(100vw-6rem)]">
        <button
          type="button"
          onClick={props.onToggleCollapsed}
          className="h-8 sm:h-9 px-3 sm:px-4 rounded-xl bg-[#0d1118]/95 border border-sky-400/40 text-[9px] font-semibold text-sky-200 hover:text-white shadow-2xl flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <ChevronUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">Timeline NLA ({animation.currentFrame}f)</span>
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Timeline NLA e Editor de Animação Integrada"
      className="relative w-full z-20 bg-[#0b0e14]/97 backdrop-blur-md border-t border-white/12 shadow-2xl flex flex-col select-none"
    >
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-white/10 bg-[#0f141e]/80 sticky top-0 z-10 px-2 sm:px-2.5">
          <div className="flex items-center gap-1 px-1 py-1 overflow-x-auto no-scrollbar">
            {(['import', 'pbr', 'rig', 'vfx'] as const).map((tab) => {
              const Icon = tabIcon[tab];
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={commandTab === tab}
                  onClick={() => setCommandTab(tab)}
                  className={`flex-1 shrink-0 h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${commandTab === tab ? 'bg-sky-500/20 border-sky-400/55 text-sky-200 shadow-sm' : 'bg-[#0c1018] border-transparent text-slate-400 hover:text-white hover:border-white/10'}`}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="text-[9px] font-medium whitespace-nowrap">{tabLabel[tab]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-2 sm:p-2.5 pb-12">
          {commandTab === 'import' && <ImportExportPanel />}
          {commandTab === 'pbr' && <PbrCameraPanel />}
          {commandTab === 'rig' && <RigAnimationPanel />}
          {commandTab === 'vfx' && <VfxStudioPanel />}
        </div>
      </div>

      <div className="h-9 sm:h-10 px-2 sm:px-2.5 border-b border-white/10 bg-[#0f141e] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={props.undoCount === 0}
            onClick={props.onUndo}
            title="Desfazer (Ctrl+Z)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center ${props.undoCount > 0 ? 'bg-[#151b28] text-slate-200 border-white/10 hover:text-white cursor-pointer' : 'bg-[#0c1018] text-slate-600 border-white/5 cursor-not-allowed'}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={props.redoCount === 0}
            onClick={props.onRedo}
            title="Refazer (Ctrl+Shift+Z)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center ${props.redoCount > 0 ? 'bg-[#151b28] text-slate-200 border-white/10 hover:text-white cursor-pointer' : 'bg-[#0c1018] text-slate-600 border-white/5 cursor-not-allowed'}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const stripsList = tracks.find((t) => t.id === 'base')?.strips ?? [];
              if (stripsList.length > 0) {
                const last = stripsList[stripsList.length - 1];
                setTracks((prev) => prev.map((t) => t.id === 'base' ? { ...t, strips: t.strips.filter((s) => s.id !== last.id) } : t));
                props.onUpdateAnimation({ nlaStrips: animation.nlaStrips.filter((s) => s.id !== last.id) });
                props.onNotice(`Strip "${last.label}" excluído.`);
              } else {
                props.onNotice('Nenhum strip para excluir.');
              }
            }}
            title="Excluir strip selecionado ou keyframe atual"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const stripsList = tracks.find((t) => t.id === 'base')?.strips ?? [];
              const last = stripsList[stripsList.length - 1];
              if (last) {
                const newStrip: NlaTimelineStrip = {
                  ...last,
                  id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  startFrame: last.endFrame + 1,
                  endFrame: last.endFrame + 25,
                };
                setTracks((prev) => prev.map((t) => t.id === 'base' ? { ...t, strips: [...t.strips, newStrip] } : t));
                props.onUpdateAnimation({ nlaStrips: [...animation.nlaStrips, newStrip] });
              }
            }}
            title="Duplicar strip selecionado ou keyframe"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-slate-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={props.onOpenRetargetPicker}
            title="Retargeting: Transferir clipe .GLB externo para este esqueleto"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-sky-300 border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            aria-pressed={!animation.inPlace}
            onClick={() => props.onUpdateAnimation({ inPlace: !animation.inPlace })}
            title={animation.inPlace ? 'Modo In-Place (sem deslocamento de raiz)' : 'Modo Raiz Global (com deslocamento)'}
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${!animation.inPlace ? 'bg-sky-500/20 text-sky-300 border-sky-400/50' : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'}`}
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={animation.showBones}
            onClick={() => props.onUpdateAnimation({ showBones: !animation.showBones })}
            title="Mostrar / Ocultar Esqueleto (Ossos)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${animation.showBones ? 'bg-sky-500/20 text-sky-300 border-sky-400/50' : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'}`}
          >
            <Bone className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={jumpPrevKeyframe}
            title="Ir para keyframe anterior (Setas Esquerda)"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-slate-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => props.onUpdateAnimation({ playing: !animation.playing, enabled: true, cycleMode: 'full_cycle' })}
            title="Play / Pausa (Espaço)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${animation.playing ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50' : 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-transparent'}`}
          >
            {animation.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={jumpNextKeyframe}
            title="Ir para próximo keyframe (Setas Direita)"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-slate-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={props.onToggleRecordWebm}
            title="Gravar Turntable 360° (.webm)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${props.isRecording ? 'bg-rose-500/20 text-rose-200 border-rose-400/50 animate-pulse' : 'bg-[#151b28] text-slate-300 border-white/10 hover:text-white'}`}
          >
            <Circle className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setOnionSkinning((prev) => ({ ...prev, enabled: !prev.enabled }))}
            title="Onion Skinning (Antes / Depois)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${onionSkinning.enabled ? 'bg-sky-500/20 text-sky-300 border-sky-400/50' : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'}`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowTimecode((prev) => !prev)}
            title="Alternar Timecode"
            className="h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer bg-[#151b28] text-slate-400 border-white/10 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto bg-[#0b0e14] relative">
        <div
          ref={laneScrollRef}
          className="flex flex-col min-w-[calc(100%+1px)]"
          style={{ minWidth: `${totalWidth}px` }}
        >
          <div className="flex items-end border-b border-white/8 bg-[#0c1018]/80 px-2 py-1">
            <div style={{ width: '60px' }} />
            <div className="flex" style={{ width: `${totalWidth}px` }}>
              {Array.from({ length: maxTimelineFrame }, (_, i) => i + 1).map((f) => (
                <div
                  key={f}
                  className="flex flex-col items-center gap-0.5 shrink-0"
                  style={{ width: `${pxPerFrame}px` }}
                >
                  <div
                    className={`w-[1px] ${f % 10 === 0 ? 'bg-sky-400/40' : 'bg-white/6'} ${animation.currentFrame === f ? 'bg-sky-400' : 'bg-transparent'}`}
                    style={{ height: f % 10 === 0 ? 8 : 4 }}
                  />
                  {f % 10 === 0 && (
                    <span className="text-[9px] text-slate-500 font-mono leading-none">{f}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/8 px-2">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center border-b border-white/6 bg-[#0f141e]/50"
              >
                <div className="w-60 shrink-0 border-r border-white/6 px-2 py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={track.visible}
                    className="w-3 h-3 rounded accent-sky-500"
                  />
                  <span className={`text-[9px] ${track.visible ? 'text-slate-200' : 'text-slate-500'} truncate`}>{track.name}</span>
                </div>
                <div className="flex-1 h-10 relative overflow-hidden bg-transparent">
                  {track.strips.map((strip) => {
                    const startX = (strip.startFrame - 1) * pxPerFrame;
                    const width = Math.max(24, (strip.endFrame - strip.startFrame + 1) * pxPerFrame);
                    return (
                      <div
                        key={strip.id}
                        className="absolute top-0.5 bottom-0.5 rounded-lg border flex items-center justify-center cursor-pointer overflow-hidden group"
                        style={{
                          left: `${startX}px`,
                          width: `${width}px`,
                          backgroundColor: strip.sourceType === 'procedural' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          borderColor: strip.sourceType === 'procedural' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(16, 185, 129, 0.5)',
                        }}
                        title={`${strip.label} (${strip.startFrame}f - ${strip.endFrame}f)`}
                      >
                        <span className="text-[9px] font-medium truncate px-1">
                          {track.solo ? '🔹 ' : ''}{strip.label}
                          {strip.muted ? ' (muted)' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            className="absolute left-0 top-0 bottom-0 w-[2px] bg-sky-400 z-20 shadow-[0_0_8px_rgba(56,189,248,0.6)] pointer-events-none"
            style={{
              left: `${(animation.currentFrame - 1) * pxPerFrame}px`,
              height: `calc(100% - 44px)`,
              transform: `translateX(-1px)`,
            }}
          />
        </div>
      </div>

      <div className="h-8 border-t border-white/10 bg-[#0f141e] flex items-center justify-between gap-2 px-2 sm:px-2.5 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-slate-400">Frame:</span>
          <span className="font-mono text-sky-300 tabular-nums">{animation.currentFrame}f</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-400">Intervalo:</span>
          <span className="font-mono text-slate-300 tabular-nums">{frameStart}f – {frameEnd}f</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => props.onUpdateAnimation({ currentFrame: Math.max(frameStart, animation.currentFrame - 1) })}
            className="h-6 w-6 rounded border flex items-center justify-center cursor-pointer bg-[#121826] text-slate-300 hover:text-white border-white/10"
          >
            <ChevronLeft className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => props.onUpdateAnimation({ currentFrame: Math.min(frameEnd, animation.currentFrame + 1) })}
            className="h-6 w-6 rounded border flex items-center justify-center cursor-pointer bg-[#121826] text-slate-300 hover:text-white border-white/10"
          >
            <ChevronRight className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleKeyframeAt(animation.currentFrame)}
            className={`h-6 w-6 rounded border flex items-center justify-center cursor-pointer ${hasCurrentKeyframe ? 'bg-amber-500/20 text-amber-200 border-amber-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            title={hasCurrentKeyframe ? 'Remover keyframe' : 'Inserir keyframe (I/K)'}
          >
            <KeyRound className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => props.onUpdateAnimation({ autoKey: !animation.autoKey })}
            className={`h-6 w-6 rounded border flex items-center justify-center cursor-pointer ${animation.autoKey ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50' : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'}`}
            title={`Auto-Key: ${animation.autoKey ? 'ON' : 'OFF'}`}
          >
            <Circle className={`w-2 h-2 rounded-full ${animation.autoKey ? 'bg-emerald-400' : 'bg-transparent'}`} />
          </button>
          <button
            type="button"
            onClick={() => props.onNotice('Graph Editor: selecione um keyframe para editar curvas (F-Curve).')}
            className="h-6 w-6 rounded border flex items-center justify-center cursor-pointer bg-[#121826] text-slate-400 hover:text-white border-white/10"
          >
            <Diamond className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-400">FPS:</span>
          {[12, 24, 30, 60].map((fps) => (
            <button
              key={fps}
              type="button"
              onClick={() => props.onUpdateAnimation({ fpsCadence: fps as 12 | 24 | 30 | 60 })}
              className={`h-6 w-6 rounded border flex items-center justify-center cursor-pointer text-[9px] ${animation.fpsCadence === fps ? 'bg-sky-500/20 text-sky-200 border-sky-400/50' : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'}`}
            >
              {fps}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}