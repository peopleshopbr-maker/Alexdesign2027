import {
  Bone,
  Brush,
  Camera,
  Check,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Film,
  Grid,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Sword,
  Upload,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type {
  AnimationActionCycle,
  AnimationSettings,
  AutoRigPreset,
  PropSocketType,
  RigExportProfile,
  WeightPaintSettings,
} from '../types/graphics';

interface AnimationSidebarProps {
  animation: AnimationSettings;
  loadedModelName?: string | null;
  loadedClips?: string[];
  boneCount?: number;
  rigBoneNames?: string[];
  weightPaint?: WeightPaintSettings;
  onUpdateWeightPaint?: (patch: Partial<WeightPaintSettings>) => void;
  onRetargetMotionFile?: (file: File) => void;
  autoRigOnImport?: boolean;
  onToggleAutoRigOnImport?: () => void;
  jointMarkersActive: boolean;
  jointMarkerSymmetry: boolean;
  onAutoRigLoaded?: (rigType: AutoRigPreset) => void;
  onStartJointMarkers: () => void;
  onCommitJointMarkers: () => void;
  onCancelJointMarkers: () => void;
  onToggleJointMarkerSymmetry: () => void;
  onExportGlb: (profile?: RigExportProfile) => void;
  onExportBlenderZip?: (profile?: RigExportProfile) => void;
  multiClipExport?: boolean;
  onToggleMultiClipExport?: () => void;
  exportingBlenderZip?: boolean;
  exportingGlb?: boolean;
  exportingFramesLabel?: string | null;
  exportingSpriteSheetLabel?: string | null;
  onCaptureFrame?: (transparentOverride?: boolean) => void;
  onExportFramesZip?: (step?: number, transparentOverride?: boolean) => void;
  onExportSpriteSheetZip?: (step?: number, transparentOverride?: boolean) => void;
  onInsertRiggedHumanoid?: () => void;
  onUpdateAnimation: (patch: Partial<AnimationSettings>) => void;
  onResetAnimation: () => void;
  timelineOpen?: boolean;
  onClose: () => void;
}

const ACTION_CYCLES: Array<{ id: AnimationActionCycle; label: string; spanFull?: boolean }> = [
  { id: 'walk', label: 'Caminhar' },
  { id: 'run', label: 'Correr' },
  { id: 'jump', label: 'Pular' },
  { id: 'punch', label: 'Soco' },
  { id: 'slash', label: 'Espada' },
  { id: 'aim', label: 'Mira' },
  { id: 'wave', label: 'Acenar' },
  { id: 'dance', label: 'Dançar' },
  { id: 'idle', label: 'Idle' },
  { id: 'arc_leap', label: 'Salto / Arco Parabólico', spanFull: true },
];

const PROP_SOCKETS: Array<{ id: PropSocketType; label: string }> = [
  { id: 'none', label: 'Nenhum' },
  { id: 'sword', label: 'Espada' },
  { id: 'shield', label: 'Escudo' },
  { id: 'staff', label: 'Bastão' },
];

const EXPORT_PROFILES: Array<{ id: RigExportProfile; label: string; title?: string }> = [
  { id: 'standard', label: 'Padrão' },
  { id: 'mixamo', label: 'Mixamo' },
  { id: 'ue5', label: 'UE5', title: 'Unreal Engine 5' },
  { id: 'unity', label: 'Unity' },
  { id: 'godot', label: 'Godot' },
];

const FK_BONES: Array<{ role: string; label: string }> = [
  { role: 'hips', label: 'Pelvis / Quadril' },
  { role: 'spine', label: 'Spine / Coluna' },
  { role: 'chest', label: 'Chest / Tórax' },
  { role: 'neck', label: 'Neck / Pescoço' },
  { role: 'head', label: 'Head / Cabeça' },
  { role: 'leftUpperArm', label: 'Braço Esq. (UpperArm_L)' },
  { role: 'leftForeArm', label: 'Antebraço Esq. (ForeArm_L)' },
  { role: 'leftHand', label: 'Mão Esq. (Hand_L)' },
  { role: 'rightUpperArm', label: 'Braço Dir. (UpperArm_R)' },
  { role: 'rightForeArm', label: 'Antebraço Dir. (ForeArm_R)' },
  { role: 'rightHand', label: 'Mão Dir. (Hand_R)' },
  { role: 'leftThigh', label: 'Coxa Esq. (Thigh_L)' },
  { role: 'leftShin', label: 'Canela Esq. (Shin_L)' },
  { role: 'leftFoot', label: 'Pé Esq. (Foot_L)' },
  { role: 'rightThigh', label: 'Coxa Dir. (Thigh_R)' },
  { role: 'rightShin', label: 'Canela Dir. (Shin_R)' },
  { role: 'rightFoot', label: 'Pé Dir. (Foot_R)' },
];

export function AnimationSidebar({
  animation,
  loadedModelName,
  loadedClips = [],
  boneCount = 0,
  rigBoneNames = [],
  weightPaint,
  onUpdateWeightPaint,
  onRetargetMotionFile,
  autoRigOnImport = false,
  onToggleAutoRigOnImport,
  jointMarkersActive,
  jointMarkerSymmetry,
  onAutoRigLoaded,
  onStartJointMarkers,
  onCommitJointMarkers,
  onCancelJointMarkers,
  onToggleJointMarkerSymmetry,
  onExportGlb,
  onExportBlenderZip,
  multiClipExport = false,
  onToggleMultiClipExport,
  exportingBlenderZip = false,
  exportingGlb = false,
  exportingFramesLabel,
  exportingSpriteSheetLabel,
  onCaptureFrame,
  onExportFramesZip,
  onExportSpriteSheetZip,
  onInsertRiggedHumanoid,
  onUpdateAnimation,
  onResetAnimation,
  timelineOpen = false,
  onClose,
}: AnimationSidebarProps) {
  const [activeTab, setActiveTab] = useState<'actions' | 'rig_export'>('actions');
  const [frameStep, setFrameStep] = useState<1 | 2 | 4>(1);
  const retargetInputRef = useRef<HTMLInputElement>(null);

  const hasCurrentKeyframe = animation.keyframes.includes(animation.currentFrame);

  const stampAutoKeyframe = () =>
    animation.autoKey && !animation.keyframes.includes(animation.currentFrame)
      ? [...animation.keyframes, animation.currentFrame].sort((a, b) => a - b)
      : animation.keyframes;

  return (
    <aside
      aria-label="Controles de Animação 3D e Rigging"
      className={`fixed left-12 right-2 ${
        timelineOpen
          ? 'bottom-[168px] max-h-[46dvh] md:bottom-[198px]'
          : 'bottom-[62px] max-h-[58dvh] md:bottom-[76px]'
      } md:top-[68px] md:left-[68px] md:right-auto md:max-h-none md:w-[344px] z-20 overflow-y-auto bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3.5`}
    >
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 border-b border-white/10 pb-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0">
          <Video className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wide text-white uppercase">
              Rig &amp; Animação 3D
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] font-mono tabular-nums text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 rounded-md">
                {animation.cycleMode === 'static' ? '1f' : '60f'}
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
            Fluxo ActionForge: Auto-Rig, Camadas, Live IK, Pose FK e Props.
          </p>
        </div>
      </div>

      {/* Painel de Timeline & Reprodução (FIXADO NA PARTE SUPERIOR) */}
      <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
        <div
          role="group"
          aria-label="Modo de edição ou reprodução"
          className="grid grid-cols-2 gap-1 bg-[#05070b] p-1 rounded-xl border border-white/10"
        >
          <button
            type="button"
            aria-pressed={!animation.playing}
            onClick={() => onUpdateAnimation({ playing: false })}
            className={`h-8 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              !animation.playing
                ? 'bg-[#1e293b] text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Editar</span>
          </button>
          <button
            type="button"
            aria-pressed={animation.playing}
            onClick={() =>
              onUpdateAnimation({
                playing: true,
                enabled: true,
                cycleMode: 'full_cycle',
              })
            }
            className={`h-8 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              animation.playing
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/35'
                : 'text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Play</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={animation.cycleMode === 'static'}
            onClick={() => onUpdateAnimation({ cycleMode: 'static', playing: false })}
            className={`h-8 px-2 text-[11px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
              animation.cycleMode === 'static'
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            Pose Estática (1f)
          </button>
          <button
            type="button"
            aria-pressed={animation.cycleMode === 'full_cycle'}
            onClick={() =>
              onUpdateAnimation({ cycleMode: 'full_cycle', playing: true, enabled: true })
            }
            className={`h-8 px-2 text-[11px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
              animation.cycleMode === 'full_cycle'
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            Ciclo Completo (60f)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() =>
              onUpdateAnimation({
                rotationMode: animation.rotationMode === 'quaternion' ? 'euler' : 'quaternion',
              })
            }
            className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer flex items-center justify-center whitespace-nowrap"
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
              onUpdateAnimation({ keyframes: nextKf });
            }}
            className={`h-8 px-2 text-[11px] font-medium rounded-lg border cursor-pointer flex items-center justify-center whitespace-nowrap ${
              hasCurrentKeyframe
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/40'
                : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border-sky-400/40'
            }`}
          >
            {hasCurrentKeyframe
              ? `Remover Key (${animation.currentFrame}f)`
              : `+ Keyframe (${animation.currentFrame}f)`}
          </button>
        </div>

        {/* Marcadores de Keyframes clicáveis */}
        <div className="flex flex-wrap items-center gap-1.5">
          {animation.keyframes.map((kf) => {
            const active = animation.currentFrame === kf;
            return (
              <div
                key={kf}
                className={`inline-flex items-center rounded-md border overflow-hidden ${
                  active
                    ? 'bg-sky-500/25 text-sky-100 border-sky-400/55'
                    : 'bg-[#121826] text-slate-300 border-white/12'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onUpdateAnimation({ currentFrame: kf, playing: false })}
                  className="h-7 px-2 text-[11px] font-mono tabular-nums hover:text-white cursor-pointer flex items-center"
                >
                  ◆ {kf}f
                </button>
                {animation.keyframes.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover keyframe ${kf}f`}
                    onClick={() =>
                      onUpdateAnimation({
                        keyframes: animation.keyframes.filter((k) => k !== kf),
                      })
                    }
                    className="h-7 px-1.5 text-slate-400 hover:text-rose-300 hover:bg-white/5 cursor-pointer flex items-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={animation.inPlace}
            onClick={() => onUpdateAnimation({ inPlace: !animation.inPlace })}
            className={`h-8 px-2 text-[11px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
              animation.inPlace
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/55'
                : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'
            }`}
          >
            No Lugar: {animation.inPlace ? 'In-Place' : 'Raiz'}
          </button>
        </div>

        {/* Barra de Scrub & Botão Animar */}
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            aria-pressed={animation.playing}
            onClick={() =>
              onUpdateAnimation({
                playing: !animation.playing,
                enabled: true,
                cycleMode: 'full_cycle',
              })
            }
            className={`h-9 px-3.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 shrink-0 cursor-pointer ${
              animation.playing
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                : 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-transparent'
            }`}
          >
            {animation.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{animation.playing ? 'Pausar' : 'Animar'}</span>
          </button>

          <input
            type="range"
            aria-label="Frame da animação"
            min={1}
            max={60}
            step={1}
            value={animation.currentFrame}
            onChange={(e) =>
              onUpdateAnimation({
                currentFrame: Number(e.target.value),
                playing: false,
                cycleMode: 'full_cycle',
              })
            }
            className="studio-slider flex-1"
          />

          <span className="text-xs font-mono tabular-nums text-slate-200 w-8 text-right shrink-0">
            {animation.currentFrame}f
          </span>
        </div>
      </div>

      {/* Auto-Rigging ao importar + Cartão do Modelo, Ossos & Marcadores */}
      {onToggleAutoRigOnImport && (
        <button
          type="button"
          aria-pressed={autoRigOnImport}
          onClick={onToggleAutoRigOnImport}
          className={`w-full h-8 px-3 text-[11px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
            autoRigOnImport
              ? 'bg-sky-500/15 text-sky-200 border-sky-400/45'
              : 'bg-[#090c13] text-slate-300 border-white/10 hover:text-white'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Auto-Rigging se malha vier sem ossos</span>
          </span>
          <span className="font-mono text-[10px]">{autoRigOnImport ? 'ON' : 'OFF'}</span>
        </button>
      )}

      {loadedModelName ? (
        <div className="rounded-xl bg-[#090c13] border border-sky-400/25 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Modelo Ativo
              </span>
              <span className="text-xs font-semibold text-white truncate block">
                {loadedModelName}
              </span>
            </div>
            <span
              className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border shrink-0 ${
                boneCount > 0
                  ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                  : 'text-amber-300 bg-amber-500/15 border-amber-400/30'
              }`}
            >
              {boneCount > 0 ? `${boneCount} ossos` : 'Sem ossos'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              aria-pressed={animation.showBones}
              onClick={() => onUpdateAnimation({ showBones: !animation.showBones })}
              disabled={boneCount === 0}
              className={`h-8 px-2 text-[11px] font-medium rounded-lg border flex items-center justify-center gap-1.5 ${
                boneCount === 0
                  ? 'bg-[#0b0f17] text-slate-600 border-white/5 cursor-not-allowed'
                  : animation.showBones
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/55 cursor-pointer'
                    : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white cursor-pointer'
              }`}
            >
              {animation.showBones ? (
                <Eye className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{animation.showBones ? 'Ocultar Ossos' : 'Mostrar Ossos'}</span>
            </button>

            {onAutoRigLoaded && (
              <button
                type="button"
                onClick={() => onAutoRigLoaded('biped')}
                className="h-8 px-2 text-[11px] font-medium rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/40 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 shrink-0" />
                <span>Auto-Rig Bípede</span>
              </button>
            )}
          </div>

          {/* Marcadores de Rigging (Rig Manual com Marcadores 3D) */}
          {jointMarkersActive ? (
            <div className="rounded-lg bg-sky-500/10 border border-sky-400/35 p-2 flex flex-col gap-2">
              <span className="text-[11px] text-sky-200 leading-snug">
                Clique e arraste as esferas na malha para posicionar cada junta antes de gerar os ossos.
              </span>
              <button
                type="button"
                aria-pressed={jointMarkerSymmetry}
                onClick={onToggleJointMarkerSymmetry}
                className={`h-7 px-2 text-[11px] font-medium rounded-md border flex items-center justify-between cursor-pointer ${
                  jointMarkerSymmetry
                    ? 'bg-sky-500/20 text-sky-100 border-sky-400/45'
                    : 'bg-[#121826] text-slate-300 border-white/10'
                }`}
              >
                <span>Simetria E/D nos Marcadores</span>
                <span className="font-mono text-[10px]">{jointMarkerSymmetry ? 'ON' : 'OFF'}</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={onCommitJointMarkers}
                  className="h-8 px-2 text-[11px] font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Gerar Skeleton</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelJointMarkers}
                  className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-300 border border-white/10 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartJointMarkers}
              className="w-full h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-sky-400/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5 text-sky-400" />
              <span>Rig Manual com Marcadores 3D</span>
            </button>
          )}

          {onAutoRigLoaded && (
            <button
              type="button"
              onClick={() => onAutoRigLoaded('flex_spine')}
              className="w-full h-7 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-300 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Bone className="w-3 h-3 text-sky-400" />
              <span>Auto-Rig Espinha Articulada (5 Ossos)</span>
            </button>
          )}

          {/* Perfil de Ossos (Exportação Engine / Blender 5.3+) */}
          <div className="flex flex-col gap-1 pt-1 border-t border-white/8">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Perfil de Ossos (Exportação Engine)
            </span>
            <div className="grid grid-cols-5 gap-1">
              {EXPORT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdateAnimation({ exportProfile: p.id })}
                  className={`h-7 px-1 text-[10px] font-medium rounded-md border cursor-pointer truncate ${
                    animation.exportProfile === p.id
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                      : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loadedClips.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/8">
              <div className="grid grid-cols-2 gap-1 bg-[#05070b] p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  aria-pressed={animation.poseSource === 'procedural'}
                  onClick={() => onUpdateAnimation({ poseSource: 'procedural', enabled: true })}
                  className={`h-7 text-[11px] font-medium rounded-md cursor-pointer ${
                    animation.poseSource === 'procedural'
                      ? 'bg-sky-500/25 text-sky-100'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Comandos 3D
                </button>
                <button
                  type="button"
                  aria-pressed={animation.poseSource === 'clip'}
                  onClick={() => onUpdateAnimation({ poseSource: 'clip', enabled: true })}
                  className={`h-7 text-[11px] font-medium rounded-md cursor-pointer ${
                    animation.poseSource === 'clip'
                      ? 'bg-emerald-500/25 text-emerald-100'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Clipe GLB ({loadedClips.length})
                </button>
              </div>

              {animation.poseSource === 'clip' && (
                <div className="flex flex-wrap gap-1.5">
                  {loadedClips.map((clipName, idx) => {
                    const active = animation.activeClipIndex === idx;
                    return (
                      <button
                        key={`${clipName}-${idx}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onUpdateAnimation({
                            poseSource: 'clip',
                            activeClipIndex: idx,
                            playing: true,
                            enabled: true,
                            cycleMode: 'full_cycle',
                          })
                        }
                        className={`h-7 px-2.5 text-[11px] font-medium rounded-lg border cursor-pointer truncate max-w-full ${
                          active
                            ? 'bg-emerald-500/25 text-emerald-100 border-emerald-400/55'
                            : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {clipName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        onInsertRiggedHumanoid && (
          <button
            type="button"
            onClick={onInsertRiggedHumanoid}
            className="w-full h-9 px-3 text-xs font-medium rounded-xl bg-[#090c13] hover:bg-[#121826] text-sky-200 border border-sky-400/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Bone className="w-3.5 h-3.5 text-sky-400" />
            <span>Inserir Personagem com Ossos (19 Ossos)</span>
          </button>
        )
      )}

      {/* Abas ActionForge: Ações | Rig & Exportar */}
      <div className="grid grid-cols-2 gap-1 bg-[#05070b] p-1 rounded-xl border border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('actions')}
          className={`h-8 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'actions'
              ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Ações</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rig_export')}
          className={`h-8 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'rig_export'
              ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
              : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Bone className="w-3 h-3" />
          <span>Rig &amp; GLB</span>
        </button>
      </div>

      {activeTab === 'actions' && (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs font-semibold text-slate-200">
                Ações &amp; Animação Procedural
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onResetAnimation}
                title="Restaurar padrões"
                aria-label="Restaurar padrões de animação"
                className="w-8 h-8 rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-300 border border-white/10 flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-pressed={animation.enabled}
                onClick={() => onUpdateAnimation({ enabled: !animation.enabled })}
                className={`h-8 px-3 text-[11px] font-semibold rounded-lg border cursor-pointer flex items-center ${
                  animation.enabled
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                    : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {animation.enabled ? 'Ativo' : 'Pausado'}
              </button>
            </div>
          </div>

          {/* Ciclo de Ação */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">
              Ciclo de Ação (Base / Corpo Inferior)
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {ACTION_CYCLES.map((act) => {
                const active =
                  animation.action === act.id &&
                  (!loadedModelName || animation.poseSource === 'procedural');
                return (
                  <button
                    key={act.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onUpdateAnimation({
                        action: act.id,
                        poseSource: 'procedural',
                        enabled: true,
                        playing: true,
                        cycleMode: 'full_cycle',
                      })
                    }
                    className={`h-8 px-2 text-[11px] font-medium rounded-lg border whitespace-nowrap cursor-pointer flex items-center justify-center ${
                      act.spanFull ? 'col-span-3' : ''
                    } ${
                      active
                        ? 'bg-sky-500/20 text-sky-200 border-sky-400/55 shadow-sm'
                        : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'
                    }`}
                  >
                    {act.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prop Sockets (Acessório na Mão) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Sword className="w-3.5 h-3.5 text-sky-400" />
              <span>Prop Socket (Acessório na Mão)</span>
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {PROP_SOCKETS.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  aria-pressed={animation.propType === pr.id}
                  onClick={() => onUpdateAnimation({ propType: pr.id })}
                  className={`h-8 px-1.5 text-[11px] font-medium rounded-lg border whitespace-nowrap cursor-pointer flex items-center justify-center ${
                    animation.propType === pr.id
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/55'
                      : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
                  }`}
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Motion Trail */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={animation.motionTrail}
              onClick={() => onUpdateAnimation({ motionTrail: !animation.motionTrail })}
              className={`h-8 px-3 text-[11px] font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer flex items-center ${
                animation.motionTrail
                  ? 'bg-sky-500/20 text-sky-200 border-sky-400/55'
                  : 'bg-[#121826] text-slate-400 border-white/10 hover:bg-[#192235] hover:text-white'
              }`}
            >
              Motion Trail
            </button>
          </div>

          {/* Cadência (FPS) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/8">
            <span className="text-[11px] font-medium text-slate-400">Cadência (FPS)</span>
            <div className="flex items-center gap-1">
              {([12, 24, 30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  aria-pressed={animation.fpsCadence === fps}
                  onClick={() => onUpdateAnimation({ fpsCadence: fps })}
                  className={`h-7 px-2 text-[11px] font-mono tabular-nums rounded-lg border cursor-pointer flex items-center justify-center ${
                    animation.fpsCadence === fps
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/55'
                      : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {fps}fps
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rig_export' && (
        <div className="flex flex-col gap-3">
          {/* Marcadores de Rigging (ActionForge Auto-Rigging) */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-white">
              Marcadores 3D &amp; Auto-Rigging
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Ajuste os marcadores anatômicos na malha importada (estilo ActionForge) antes de gerar o esqueleto e skinning.
            </p>

            {jointMarkersActive ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-pressed={jointMarkerSymmetry}
                  onClick={onToggleJointMarkerSymmetry}
                  className={`h-8 px-2.5 text-[11px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
                    jointMarkerSymmetry
                      ? 'bg-sky-500/20 text-sky-100 border-sky-400/45'
                      : 'bg-[#121826] text-slate-300 border-white/10'
                  }`}
                >
                  <span>Simetria E/D Automática</span>
                  <span className="font-mono text-[10px]">{jointMarkerSymmetry ? 'ON' : 'OFF'}</span>
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onCommitJointMarkers}
                    className="h-9 px-2 text-xs font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Gerar Skeleton</span>
                  </button>
                  <button
                    type="button"
                    onClick={onCancelJointMarkers}
                    className="h-9 px-2 text-xs font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-300 border border-white/10 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={!loadedModelName}
                  onClick={onStartJointMarkers}
                  className={`h-9 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 ${
                    loadedModelName
                      ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 border-sky-400/45 cursor-pointer'
                      : 'bg-[#0b0f17] text-slate-600 border-white/5 cursor-not-allowed'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Posicionar Marcadores 3D na Malha</span>
                </button>
                {onAutoRigLoaded && loadedModelName && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAutoRigLoaded('biped')}
                      className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer"
                    >
                      Auto-Rig Bípede (19)
                    </button>
                    <button
                      type="button"
                      onClick={() => onAutoRigLoaded('flex_spine')}
                      className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer"
                    >
                      Espinha Flex (5)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weight Paint 3D (Pintura de Pesos com Heatmap & Simetria) */}
          {weightPaint && onUpdateWeightPaint && (
            <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Brush className="w-3.5 h-3.5 text-amber-400" />
                  <span>Weight Paint 3D (Pesos)</span>
                </span>
                <button
                  type="button"
                  disabled={rigBoneNames.length === 0}
                  aria-pressed={weightPaint.active}
                  onClick={() => onUpdateWeightPaint({ active: !weightPaint.active })}
                  className={`h-7 px-2.5 text-[10px] font-semibold rounded-md border ${
                    rigBoneNames.length === 0
                      ? 'bg-[#0b0f17] text-slate-600 border-white/5 cursor-not-allowed'
                      : weightPaint.active
                        ? 'bg-amber-400 text-slate-950 border-amber-300 cursor-pointer'
                        : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white cursor-pointer'
                  }`}
                >
                  {weightPaint.active ? 'Heatmap: ON' : 'Ativar Heatmap'}
                </button>
              </div>

              {rigBoneNames.length > 0 ? (
                <>
                  <select
                    aria-label="Osso para pintar pesos"
                    value={weightPaint.selectedBoneName || rigBoneNames[0]}
                    onChange={(e) => onUpdateWeightPaint({ selectedBoneName: e.target.value })}
                    className="w-full h-8 px-2 text-[11px] rounded-lg bg-[#121826] text-slate-100 border border-white/12 outline-none"
                  >
                    {rigBoneNames.map((bn) => (
                      <option key={bn} value={bn}>
                        {bn}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'add' as const, label: '+ Somar' },
                        { id: 'subtract' as const, label: '- Subtrair' },
                        { id: 'smooth' as const, label: 'Suavizar' },
                      ]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateWeightPaint({ brushMode: m.id })}
                        className={`h-7 px-1.5 text-[10px] font-medium rounded-md border cursor-pointer ${
                          weightPaint.brushMode === m.id
                            ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                            : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    aria-pressed={weightPaint.symmetryX}
                    onClick={() => onUpdateWeightPaint({ symmetryX: !weightPaint.symmetryX })}
                    className={`h-7 px-2.5 text-[11px] font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
                      weightPaint.symmetryX
                        ? 'bg-sky-500/15 text-sky-100 border-sky-400/45'
                        : 'bg-[#121826] text-slate-300 border-white/10'
                    }`}
                  >
                    <span>Simetria E/D (Espelhar Osso)</span>
                    <span className="font-mono text-[10px]">{weightPaint.symmetryX ? 'ON' : 'OFF'}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[10px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Raio</span>
                        <span className="font-mono text-sky-300">
                          {weightPaint.brushRadius.toFixed(2)}m
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.08}
                        max={0.6}
                        step={0.02}
                        value={weightPaint.brushRadius}
                        onChange={(e) =>
                          onUpdateWeightPaint({ brushRadius: Number(e.target.value) })
                        }
                        className="studio-slider w-full"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px]">
                      <div className="flex justify-between text-slate-400">
                        <span>Força</span>
                        <span className="font-mono text-sky-300">
                          {Math.round(weightPaint.strength * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1.0}
                        step={0.05}
                        value={weightPaint.strength}
                        onChange={(e) =>
                          onUpdateWeightPaint({ strength: Number(e.target.value) })
                        }
                        className="studio-slider w-full"
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Com o Heatmap ligado, clique e arraste diretamente na malha 3D para ajustar pesos por vértice.
                  </p>
                </>
              ) : (
                <p className="text-[10px] text-slate-400">
                  Aplique Auto-Rig ou carregue um personagem com esqueleto para pintar pesos 3D.
                </p>
              )}
            </div>
          )}

          {/* Cross-Skeleton Animation Retargeting */}
          {onRetargetMotionFile && (
            <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2">
              <input
                ref={retargetInputRef}
                type="file"
                accept=".glb,.gltf,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onRetargetMotionFile(file);
                  e.target.value = '';
                }}
              />
              <span className="text-xs font-semibold text-white">
                Retargeting de Movimento (.GLB)
              </span>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Importe um clipe externo (Mixamo, UE5, Unity ou Blender) para transferir a animação para o esqueleto ativo.
              </p>
              <button
                type="button"
                disabled={boneCount === 0}
                onClick={() => retargetInputRef.current?.click()}
                className={`w-full h-9 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 ${
                  boneCount > 0
                    ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 border-sky-400/45 cursor-pointer'
                    : 'bg-[#0b0f17] text-slate-600 border-white/5 cursor-not-allowed'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Transferir Clipe (.GLB / .ZIP)</span>
              </button>
            </div>
          )}

          {/* Exportação para Blender 5.3+ e Engines */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                Exportar Blender 5.3+ &amp; Engines
              </span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 px-1.5 py-0.5 rounded">
                glTF 2.0
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {EXPORT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.title ?? p.label}
                  onClick={() => onUpdateAnimation({ exportProfile: p.id })}
                  className={`h-8 px-2 text-[11px] font-medium rounded-lg border cursor-pointer ${
                    animation.exportProfile === p.id
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                      : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {onToggleMultiClipExport && (
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
            )}
            <button
              type="button"
              disabled={exportingGlb}
              onClick={() => onExportGlb(animation.exportProfile)}
              className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {exportingGlb
                  ? 'Exportando .GLB...'
                  : `Exportar .GLB (${EXPORT_PROFILES.find((p) => p.id === animation.exportProfile)?.label})`}
              </span>
            </button>
            {onExportBlenderZip && (
              <button
                type="button"
                disabled={exportingBlenderZip}
                onClick={() => onExportBlenderZip(animation.exportProfile)}
                className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {exportingBlenderZip
                    ? 'Empacotando Blender 5.3+...'
                    : 'ZIP Completo Blender 5.3+ (.GLB + .PY)'}
                </span>
              </button>
            )}
          </div>

          {/* Exportar PNG & Quadro a Quadro (Fundo Transparente) */}
          {(onCaptureFrame || onExportFramesZip) && (
            <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2.5">
              <span className="text-xs font-semibold text-white">
                Exportar PNG &amp; Quadro a Quadro
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Gere PNG transparente do quadro atual ou sequência animada quadro a quadro em .ZIP.
              </p>
              {onCaptureFrame && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onCaptureFrame(true)}
                    className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-sky-400/35 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>PNG Transp.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCaptureFrame(false)}
                    className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-white/10 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-slate-400" />
                    <span>PNG Fundo</span>
                  </button>
                </div>
              )}
              {onExportFramesZip && (
                <>
                  <div className="grid grid-cols-3 gap-1">
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
                        className={`h-7 px-1.5 text-[10px] font-medium rounded-md border cursor-pointer ${
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
                    disabled={Boolean(exportingFramesLabel)}
                    onClick={() => onExportFramesZip(frameStep, true)}
                    className="w-full h-9 px-3 text-xs font-semibold rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>
                      {exportingFramesLabel ?? 'Quadro a Quadro (.ZIP PNG Transp.)'}
                    </span>
                  </button>
                  {onExportSpriteSheetZip && (
                    <button
                      type="button"
                      disabled={Boolean(exportingSpriteSheetLabel)}
                      onClick={() => onExportSpriteSheetZip(frameStep, true)}
                      className="w-full h-8 px-3 text-[11px] font-semibold rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-60 text-sky-100 border border-sky-400/45 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Grid className="w-3.5 h-3.5 text-sky-300" />
                      <span>
                        {exportingSpriteSheetLabel
                          ? `Montando Sheet ${exportingSpriteSheetLabel}...`
                          : 'Sprite Sheet (.ZIP PNG + JSON)'}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
