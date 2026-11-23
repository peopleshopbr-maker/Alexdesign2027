import {
  Bone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardPaste,
  Clock,
  Copy,
  CopyPlus,
  Diamond,
  FastForward,
  Film,
  Globe,
  KeyRound,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Rewind,
  Share2,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AnimationActionCycle,
  AnimationSettings,
  EasingCurveType,
  NlaTimelineStrip,
  TimelineViewMode,
} from '../types/graphics';

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
}

const STRIP_PALETTE_ACTIONS: Array<{ id: AnimationActionCycle; label: string; color: string }> = [
  { id: 'walk', label: 'Walk', color: 'bg-sky-500/25 border-sky-400/55 text-sky-100' },
  { id: 'run', label: 'Run', color: 'bg-emerald-500/25 border-emerald-400/55 text-emerald-100' },
  { id: 'jump', label: 'Jump', color: 'bg-amber-500/25 border-amber-400/55 text-amber-100' },
  { id: 'slash', label: 'Slash', color: 'bg-rose-500/25 border-rose-400/55 text-rose-100' },
  { id: 'wave', label: 'Wave', color: 'bg-indigo-500/25 border-indigo-400/55 text-indigo-100' },
  { id: 'idle', label: 'Idle', color: 'bg-slate-500/25 border-slate-400/50 text-slate-100' },
];

const FPS_CYCLE: Array<12 | 24 | 30 | 60> = [12, 24, 30, 60];

const DOPE_CHANNELS = [
  { id: 'summary', label: 'Resumo (Todos)', color: 'text-sky-300' },
  { id: 'hips', label: 'Pelvis / Raiz', color: 'text-amber-300' },
  { id: 'spine', label: 'Coluna / Tórax', color: 'text-emerald-300' },
  { id: 'arms', label: 'Braços (FK)', color: 'text-rose-300' },
  { id: 'legs', label: 'Pernas (FK / IK)', color: 'text-indigo-300' },
] as const;

function sampleEasingValue(easing: EasingCurveType, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  if (easing === 'linear') return x;
  if (easing === 'slow_in_out') return x * x * (3 - 2 * x);
  if (easing === 'snap_out') return 1 - Math.pow(1 - x, 3);
  // elastic
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function AnimationTimelineDock({
  collapsed,
  onToggleCollapsed,
  animation,
  loadedClips,
  isRecording,
  undoCount,
  redoCount,
  onUpdateAnimation,
  onUndo,
  onRedo,
  onToggleRecordWebm,
  onOpenRetargetPicker,
  onNotice,
}: AnimationTimelineDockProps) {
  const [viewMode, setViewMode] = useState<TimelineViewMode>('strips');
  const [pxPerFrame, setPxPerFrame] = useState<number>(14);
  const [selectedStripId, setSelectedStripId] = useState<string | null>(null);
  const [copiedPose, setCopiedPose] = useState<Record<string, [number, number, number]> | null>(null);
  const [clipMenuOpen, setClipMenuOpen] = useState(false);

  const laneScrollRef = useRef<HTMLDivElement>(null);
  const dragScrubRef = useRef(false);
  const stripDragRef = useRef<{
    id: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    originX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const frameStart = Math.max(1, Math.min(239, animation.frameStart ?? 1));
  const frameEnd = Math.max(frameStart + 1, Math.min(240, animation.frameEnd ?? 60));
  const maxTimelineFrame = Math.max(120, frameEnd + 15);
  const strips = animation.nlaStrips ?? [];

  const updateFrameFromClientX = (clientX: number) => {
    const el = laneScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const rawFrame = Math.round(x / pxPerFrame) + 1;
    const clamped = Math.max(1, Math.min(maxTimelineFrame, rawFrame));
    onUpdateAnimation({
      currentFrame: clamped,
      playing: false,
      cycleMode: 'full_cycle',
    });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragScrubRef.current) {
        updateFrameFromClientX(e.clientX);
        return;
      }
      const sd = stripDragRef.current;
      if (!sd) return;
      const deltaFrames = Math.round((e.clientX - sd.originX) / pxPerFrame);
      const nextStrips = (animation.nlaStrips ?? []).map((s) => {
        if (s.id !== sd.id) return s;
        if (sd.mode === 'move') {
          const span = sd.origEnd - sd.origStart;
          const nextStart = Math.max(1, Math.min(maxTimelineFrame - span, sd.origStart + deltaFrames));
          return { ...s, startFrame: nextStart, endFrame: nextStart + span };
        }
        if (sd.mode === 'resize-left') {
          const nextStart = Math.max(1, Math.min(sd.origEnd - 4, sd.origStart + deltaFrames));
          return { ...s, startFrame: nextStart };
        }
        const nextEnd = Math.max(sd.origStart + 4, Math.min(maxTimelineFrame, sd.origEnd + deltaFrames));
        return { ...s, endFrame: nextEnd };
      });
      onUpdateAnimation({ nlaStrips: nextStrips });
    };

    const onUp = () => {
      dragScrubRef.current = false;
      stripDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  if (collapsed) {
    return (
      <div className="fixed bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[calc(100vw-6rem)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="h-8 sm:h-9 px-3 sm:px-4 rounded-xl bg-[#0d1118]/95 border border-sky-400/40 text-xs font-semibold text-sky-200 hover:text-white shadow-2xl flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <ChevronUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">Timeline NLA ({animation.currentFrame}f)</span>
        </button>
      </div>
    );
  }

  const hasCurrentKeyframe = animation.keyframes.includes(animation.currentFrame);

  const toggleKeyframeAt = (frame: number) => {
    const exists = animation.keyframes.includes(frame);
    const nextKf = exists
      ? animation.keyframes.length > 1
        ? animation.keyframes.filter((k) => k !== frame)
        : animation.keyframes
      : [...animation.keyframes, frame].sort((a, b) => a - b);
    onUpdateAnimation({ keyframes: nextKf });
  };

  const jumpPrevKeyframe = () => {
    const sorted = [...animation.keyframes].sort((a, b) => a - b);
    const prev = [...sorted].reverse().find((k) => k < animation.currentFrame);
    onUpdateAnimation({
      currentFrame: prev ?? frameStart,
      playing: false,
      cycleMode: 'full_cycle',
    });
  };

  const jumpNextKeyframe = () => {
    const sorted = [...animation.keyframes].sort((a, b) => a - b);
    const next = sorted.find((k) => k > animation.currentFrame);
    onUpdateAnimation({
      currentFrame: next ?? frameEnd,
      playing: false,
      cycleMode: 'full_cycle',
    });
  };

  const addNlaStrip = (
    trackId: 'base' | 'upper',
    opts: {
      label: string;
      sourceType: 'procedural' | 'clip';
      actionCycle?: AnimationActionCycle;
      clipIndex?: number;
      startAt?: number;
    }
  ) => {
    const existingOnTrack = strips.filter((s) => s.trackId === trackId);
    const lastEnd = existingOnTrack.reduce((acc, s) => Math.max(acc, s.endFrame), 0);
    const startFrame = Math.max(1, Math.min(frameEnd - 5, opts.startAt ?? (lastEnd > 0 ? lastEnd + 1 : frameStart)));
    const endFrame = Math.min(Math.max(frameEnd, startFrame + 24), startFrame + 24);
    const newStrip: NlaTimelineStrip = {
      id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId,
      label: opts.label,
      sourceType: opts.sourceType,
      actionCycle: opts.actionCycle,
      clipIndex: opts.clipIndex,
      startFrame,
      endFrame,
      blendIn: 4,
      muted: false,
    };
    const nextEnd = Math.max(frameEnd, endFrame);
    onUpdateAnimation({
      nlaStrips: [...strips, newStrip],
      frameEnd: nextEnd,
      cycleMode: 'full_cycle',
      enabled: true,
    });
    setSelectedStripId(newStrip.id);
    setClipMenuOpen(false);
    onNotice(`Clipe "${opts.label}" adicionado na pista ${trackId === 'base' ? 'Base' : 'Superior'} (${startFrame}–${endFrame}f).`);
  };

  const handleDeleteSelected = () => {
    if (viewMode === 'strips' && selectedStripId) {
      const next = strips.filter((s) => s.id !== selectedStripId);
      setSelectedStripId(null);
      onUpdateAnimation({ nlaStrips: next });
      onNotice('Clipe removido da Timeline NLA.');
      return;
    }
    if (hasCurrentKeyframe && animation.keyframes.length > 1) {
      toggleKeyframeAt(animation.currentFrame);
      onNotice(`Keyframe ${animation.currentFrame}f removido.`);
    }
  };

  const handleDuplicateSelected = () => {
    if (viewMode === 'strips' && selectedStripId) {
      const target = strips.find((s) => s.id === selectedStripId);
      if (!target) return;
      const span = target.endFrame - target.startFrame;
      const startFrame = target.endFrame + 1;
      const endFrame = Math.min(240, startFrame + span);
      const copy: NlaTimelineStrip = {
        ...target,
        id: `strip_${Date.now()}`,
        startFrame,
        endFrame,
      };
      onUpdateAnimation({
        nlaStrips: [...strips, copy],
        frameEnd: Math.max(frameEnd, endFrame),
      });
      setSelectedStripId(copy.id);
      onNotice(`Clipe "${target.label}" duplicado (${startFrame}–${endFrame}f).`);
      return;
    }
    const nextFrame = Math.min(frameEnd, animation.currentFrame + 5);
    const nextKf = animation.keyframes.includes(nextFrame)
      ? animation.keyframes
      : [...animation.keyframes, nextFrame].sort((a, b) => a - b);
    onUpdateAnimation({ currentFrame: nextFrame, keyframes: nextKf });
    onNotice(`Keyframe duplicado no quadro ${nextFrame}f.`);
  };

  const handleCopyPose = () => {
    const snap: Record<string, [number, number, number]> = {};
    for (const [k, v] of Object.entries(animation.poseOverrides)) {
      snap[k] = [v[0], v[1], v[2]];
    }
    setCopiedPose(snap);
    onNotice('Pose FK atual copiada para a área de transferência.');
  };

  const handlePastePose = () => {
    if (!copiedPose) {
      onNotice('Copie uma pose primeiro usando o ícone Copiar Pose.');
      return;
    }
    const nextKf = animation.keyframes.includes(animation.currentFrame)
      ? animation.keyframes
      : [...animation.keyframes, animation.currentFrame].sort((a, b) => a - b);
    onUpdateAnimation({
      poseSource: 'procedural',
      poseOverrides: { ...copiedPose },
      keyframes: nextKf,
    });
    onNotice(`Pose colada e gravada no quadro ${animation.currentFrame}f.`);
  };

  const handleFitZoom = () => {
    const viewportW = laneScrollRef.current?.clientWidth ?? 720;
    const fitted = Math.max(8, Math.min(24, Math.floor((viewportW - 24) / Math.max(20, frameEnd))));
    setPxPerFrame(fitted);
  };

  const cycleFps = () => {
    const idx = FPS_CYCLE.indexOf(animation.fpsCadence);
    const next = FPS_CYCLE[(idx + 1) % FPS_CYCLE.length];
    onUpdateAnimation({ fpsCadence: next });
  };

  const totalWidth = maxTimelineFrame * pxPerFrame;
  const playheadX = (animation.currentFrame - 1) * pxPerFrame;
  const startBracketX = (frameStart - 1) * pxPerFrame;
  const endBracketX = (frameEnd - 1) * pxPerFrame;

  const baseStrips = strips.filter((s) => s.trackId === 'base');
  const upperStrips = strips.filter((s) => s.trackId === 'upper');

  const tickFrames: number[] = [];
  for (let f = 5; f <= maxTimelineFrame; f += 5) {
    tickFrames.push(f);
  }

  return (
    <section
      aria-label="Timeline NLA e Editor de Animação Integrada"
      className="fixed bottom-0 left-[44px] sm:left-[56px] right-0 z-20 bg-[#0b0e14]/97 backdrop-blur-md border-t border-white/12 shadow-2xl flex flex-col select-none"
    >
      {/* Barra de Ferramentas da Timeline (padrão NLA / Dope Sheet / Graph) */}
      <div className="h-9 sm:h-10 px-2 sm:px-2.5 border-b border-white/10 bg-[#0f141e] flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        {/* Grupo Esquerdo: Histórico, Pose, Retarget & Opções de Rig */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={undoCount === 0}
            onClick={onUndo}
            title="Desfazer (Ctrl+Z)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center ${
              undoCount > 0
                ? 'bg-[#151b28] text-slate-200 border-white/10 hover:text-white cursor-pointer'
                : 'bg-[#0c1018] text-slate-600 border-white/5 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={redoCount === 0}
            onClick={onRedo}
            title="Refazer (Ctrl+Shift+Z)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center ${
              redoCount > 0
                ? 'bg-[#151b28] text-slate-200 border-white/10 hover:text-white cursor-pointer'
                : 'bg-[#0c1018] text-slate-600 border-white/5 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            title="Excluir clipe selecionado ou keyframe atual"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDuplicateSelected}
            title="Duplicar clipe selecionado ou keyframe"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-slate-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenRetargetPicker}
            title="Retargeting: Transferir clipe .GLB externo para este esqueleto"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-sky-300 border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={handleCopyPose}
            title="Copiar Pose FK atual"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1d2638] text-slate-300 hover:text-white border border-white/10 flex items-center justify-center cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handlePastePose}
            title="Colar Pose FK no quadro atual"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
              copiedPose
                ? 'bg-sky-500/15 text-sky-200 border-sky-400/40 hover:bg-sky-500/25'
                : 'bg-[#151b28] text-slate-500 border-white/10'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-pressed={!animation.inPlace}
            onClick={() => onUpdateAnimation({ inPlace: !animation.inPlace })}
            title={animation.inPlace ? 'Modo In-Place (sem deslocamento de raiz)' : 'Modo Raiz Global (com deslocamento)'}
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
              !animation.inPlace
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={animation.showBones}
            onClick={() => onUpdateAnimation({ showBones: !animation.showBones })}
            title="Mostrar / Ocultar Esqueleto (Ossos)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
              animation.showBones
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <Bone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={animation.motionTrail}
            onClick={() => onUpdateAnimation({ motionTrail: !animation.motionTrail })}
            title="Ativar / Desativar Rastro de Arco (Motion Trail)"
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
              animation.motionTrail
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grupo Central: Transporte, Loop, Auto-Key, Gravação & Keyframe */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-pressed={animation.cycleMode === 'full_cycle'}
            onClick={() =>
              onUpdateAnimation({
                cycleMode: animation.cycleMode === 'full_cycle' ? 'static' : 'full_cycle',
              })
            }
            title="Alternar Loop do Ciclo / Pose Estática"
            className={`h-7 px-2 rounded-md border flex items-center gap-1 cursor-pointer ${
              animation.cycleMode === 'full_cycle'
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-pressed={animation.autoKey}
            onClick={() => onUpdateAnimation({ autoKey: !animation.autoKey })}
            title="Auto-Keyframe: grava keyframe automaticamente ao editar Pose FK/IK"
            className={`h-7 px-2 rounded-md border flex items-center gap-1 cursor-pointer ${
              animation.autoKey
                ? 'bg-amber-500/25 text-amber-200 border-amber-400/55'
                : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium hidden xl:inline">Auto</span>
          </button>

          <div className="flex items-center bg-[#151b28] border border-white/10 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({ currentFrame: frameStart, playing: false })
              }
              title="Ir para o quadro inicial (Start)"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({
                  currentFrame: Math.max(frameStart, animation.currentFrame - 5),
                  playing: false,
                })
              }
              title="Voltar 5 quadros"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Rewind className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={jumpPrevKeyframe}
              title="Keyframe anterior"
              className="h-7 w-6 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
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
              title={animation.playing ? 'Pausar (Space)' : 'Reproduzir animação'}
              className={`h-7 w-8 flex items-center justify-center cursor-pointer ${
                animation.playing
                  ? 'bg-emerald-500/25 text-emerald-200'
                  : 'bg-sky-500/20 text-white hover:bg-sky-500/30'
              }`}
            >
              {animation.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={jumpNextKeyframe}
              title="Próximo Keyframe"
              className="h-7 w-6 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({
                  currentFrame: Math.min(frameEnd, animation.currentFrame + 5),
                  playing: false,
                })
              }
              title="Avançar 5 quadros"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({ currentFrame: frameEnd, playing: false })
              }
              title="Ir para o quadro final (End)"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            aria-pressed={isRecording}
            onClick={onToggleRecordWebm}
            title={isRecording ? 'Parar gravação .WebM' : 'Gravar vídeo da animação (.WebM)'}
            className={`h-7 px-2 rounded-md border flex items-center gap-1 cursor-pointer ${
              isRecording
                ? 'bg-rose-500/30 border-rose-400 text-rose-200'
                : 'bg-[#151b28] border-rose-500/45 text-rose-400 hover:bg-rose-500/15'
            }`}
          >
            {isRecording ? (
              <Square className="w-3 h-3 fill-rose-400" />
            ) : (
              <Circle className="w-3 h-3 fill-rose-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => toggleKeyframeAt(animation.currentFrame)}
            title={
              hasCurrentKeyframe
                ? `Remover keyframe no quadro ${animation.currentFrame}`
                : `Adicionar keyframe no quadro ${animation.currentFrame}`
            }
            className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
              hasCurrentKeyframe
                ? 'bg-amber-500/25 text-amber-200 border-amber-400/55'
                : 'bg-[#151b28] text-slate-300 border-white/10 hover:text-white'
            }`}
          >
            <Diamond className="w-3 h-3 fill-current" />
          </button>
        </div>

        {/* Grupo Direito: Clipes, Abas (STRIPS/GRAPH/KEYS), Zoom, Range & FPS */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() => setClipMenuOpen((p) => !p)}
              title="Adicionar clipe ou ciclo de ação à pista NLA"
              className={`h-7 px-2 rounded-md border text-[10px] font-semibold flex items-center gap-1 cursor-pointer ${
                clipMenuOpen
                  ? 'bg-sky-500/25 text-sky-100 border-sky-400'
                  : 'bg-[#151b28] text-sky-300 border-sky-400/40 hover:bg-sky-500/15'
              }`}
            >
              <Film className="w-3 h-3" />
              <span>+ Clipe</span>
            </button>
            {clipMenuOpen && (
              <div className="fixed bottom-[162px] sm:bottom-[196px] right-2 sm:right-48 z-50 w-56 max-w-[calc(100vw-1rem)] rounded-xl bg-[#101521] border border-white/15 shadow-2xl p-2 flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase px-1">
                  Adicionar na Pista Base
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {STRIP_PALETTE_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        addNlaStrip('base', {
                          label: a.label,
                          sourceType: 'procedural',
                          actionCycle: a.id,
                          startAt: animation.currentFrame,
                        })
                      }
                      className="h-7 px-1 text-[10px] font-medium rounded bg-[#161d2e] hover:bg-sky-500/25 text-slate-100 border border-white/10 cursor-pointer"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                {loadedClips.length > 0 && (
                  <>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase px-1 pt-1">
                      Clipes .GLB Carregados
                    </span>
                    {loadedClips.map((name, idx) => (
                      <button
                        key={`${name}_${idx}`}
                        type="button"
                        onClick={() =>
                          addNlaStrip('base', {
                            label: name,
                            sourceType: 'clip',
                            clipIndex: idx,
                            startAt: animation.currentFrame,
                          })
                        }
                        className="h-7 px-2 text-left text-[10px] rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 truncate cursor-pointer"
                      >
                        + {name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Modos da Timeline"
            className="flex items-center bg-[#080a0f] border border-white/10 rounded-md p-0.5"
          >
            {(['strips', 'graph', 'keys'] as TimelineViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`h-6 px-2 text-[10px] font-bold uppercase tracking-wider rounded cursor-pointer ${
                  viewMode === mode
                    ? 'bg-sky-500/20 text-sky-200 border border-sky-400/60'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-[#151b28] border border-white/10 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setPxPerFrame((p) => Math.max(7, p - 2))}
              title="Diminuir zoom da timeline"
              className="h-7 w-6 text-xs text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              -
            </button>
            <button
              type="button"
              onClick={handleFitZoom}
              title="Ajustar zoom ao intervalo Start–End"
              className="h-7 px-2 text-[10px] font-semibold text-slate-200 hover:text-white hover:bg-white/10 border-x border-white/10 cursor-pointer"
            >
              FIT
            </button>
            <button
              type="button"
              onClick={() => setPxPerFrame((p) => Math.min(28, p + 2))}
              title="Aumentar zoom da timeline"
              className="h-7 w-6 text-xs text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              +
            </button>
          </div>

          <div className="h-7 px-2 rounded-md bg-[#151b28] border border-white/10 flex items-center text-[10px] font-mono tabular-nums text-slate-200">
            Frame {animation.currentFrame}
          </div>

          <label className="h-7 px-1.5 rounded-md bg-[#151b28] border border-white/10 flex items-center gap-1 text-[10px] text-slate-400">
            <span>Start</span>
            <input
              type="number"
              min={1}
              max={frameEnd - 1}
              value={frameStart}
              onChange={(e) => {
                const v = Math.max(1, Math.min(frameEnd - 1, Number(e.target.value) || 1));
                onUpdateAnimation({
                  frameStart: v,
                  currentFrame: Math.max(v, animation.currentFrame),
                });
              }}
              className="w-8 bg-transparent text-slate-100 font-mono text-center outline-none"
            />
          </label>

          <label className="h-7 px-1.5 rounded-md bg-[#151b28] border border-white/10 flex items-center gap-1 text-[10px] text-slate-400">
            <span>End</span>
            <input
              type="number"
              min={frameStart + 1}
              max={240}
              value={frameEnd}
              onChange={(e) => {
                const v = Math.max(frameStart + 1, Math.min(240, Number(e.target.value) || 60));
                onUpdateAnimation({
                  frameEnd: v,
                  currentFrame: Math.min(v, animation.currentFrame),
                });
              }}
              className="w-9 bg-transparent text-slate-100 font-mono text-center outline-none"
            />
          </label>

          <button
            type="button"
            onClick={cycleFps}
            title="Alternar cadência FPS (12 / 24 / 30 / 60)"
            className="h-7 px-2 rounded-md bg-[#151b28] hover:bg-[#1e273a] border border-white/10 text-[10px] font-mono tabular-nums text-sky-200 cursor-pointer"
          >
            {animation.fpsCadence} FPS
          </button>

          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Recolher Timeline"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Área Principal: Coluna de Pistas (Esq) + Sequenciador / Graph / Keys (Dir) */}
      <div className="flex h-[116px] sm:h-[142px] overflow-hidden">
        {/* Coluna Esquerda de Cabeçalhos das Pistas */}
        <div className="w-28 sm:w-40 md:w-48 shrink-0 border-r border-white/10 bg-[#0d1118] flex flex-col">
          <div className="h-6 px-2.5 border-b border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <span>Range</span>
            <span className="font-mono tabular-nums text-slate-500">
              {frameStart}–{frameEnd}f
            </span>
          </div>

          {viewMode === 'strips' && (
            <div className="flex-1 flex flex-col justify-between">
              {/* Track Base */}
              <div className="flex-1 px-2.5 py-1.5 border-b border-white/8 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-white leading-tight">Base</div>
                  <div className="text-[9px] text-slate-500 truncate">
                    arraste um clipe aqui
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addNlaStrip('base', {
                      label: STRIP_PALETTE_ACTIONS.find((a) => a.id === animation.action)?.label ?? animation.action,
                      sourceType: animation.poseSource === 'clip' && loadedClips.length > 0 ? 'clip' : 'procedural',
                      actionCycle: animation.action,
                      clipIndex: animation.activeClipIndex,
                    })
                  }
                  title="Adicionar ação atual na pista Base"
                  className="h-6 px-1.5 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-200 border border-sky-400/35 text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Track Superior */}
              <div className="flex-1 px-2.5 py-1.5 border-b border-white/8 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-slate-200 leading-tight">
                    Superior
                  </div>
                  <div className="text-[9px] text-slate-500 truncate">
                    camada torso / braços
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addNlaStrip('upper', {
                      label:
                        animation.upperBodyAction !== 'none'
                          ? animation.upperBodyAction
                          : 'Slash',
                      sourceType: 'procedural',
                      actionCycle:
                        animation.upperBodyAction !== 'none'
                          ? animation.upperBodyAction
                          : 'slash',
                    })
                  }
                  title="Adicionar ação superior (Slash/Wave/Punch)"
                  className="h-6 px-1.5 rounded bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 border border-amber-400/35 text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Paleta arrastável de Clipes */}
              <div className="px-2 py-1 flex items-center gap-1 overflow-x-auto bg-[#090c12]">
                {STRIP_PALETTE_ACTIONS.slice(0, 4).map((item) => (
                  <span
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/x-vertice-strip',
                        JSON.stringify({
                          label: item.label,
                          sourceType: 'procedural',
                          actionCycle: item.id,
                        })
                      );
                    }}
                    title="Arraste para a pista Base ou Superior"
                    className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[#161d2e] hover:bg-sky-500/25 text-slate-200 border border-white/10 cursor-grab active:cursor-grabbing shrink-0"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'graph' && (
            <div className="flex-1 px-2.5 py-1.5 flex flex-col justify-between text-[10px]">
              <div className="flex flex-col gap-1">
                <span className="text-sky-300 font-semibold">● Curva Timing ({animation.easing})</span>
                <span className="text-emerald-300">● Arcos ({animation.arcs}%)</span>
                <span className="text-amber-300">● Squash/Stretch ({animation.squashStretch}%)</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: 'linear', label: 'Linear' },
                    { id: 'slow_in_out', label: 'Slow In/Out' },
                    { id: 'snap_out', label: 'Snap Out' },
                    { id: 'elastic', label: 'Elástico' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onUpdateAnimation({ easing: c.id })}
                    className={`h-5 px-1 text-[9px] rounded border cursor-pointer truncate ${
                      animation.easing === c.id
                        ? 'bg-sky-500/25 text-sky-100 border-sky-400/60'
                        : 'bg-[#141a28] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'keys' && (
            <div className="flex-1 flex flex-col justify-around px-2.5 py-1">
              {DOPE_CHANNELS.map((ch) => (
                <div key={ch.id} className={`text-[10px] font-medium truncate ${ch.color}`}>
                  {ch.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grade Temporal Direita */}
        <div
          ref={laneScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#080a0f]"
        >
          <div style={{ width: `${totalWidth}px` }} className="h-full relative flex flex-col">
            {/* Régua de Quadros (clicável e arrastável) */}
            <div
              onMouseDown={(e) => {
                dragScrubRef.current = true;
                updateFrameFromClientX(e.clientX);
              }}
              className="h-6 border-b border-white/10 bg-[#0e121b] relative cursor-ew-resize shrink-0"
            >
              {tickFrames.map((f) => (
                <div
                  key={f}
                  style={{ left: `${(f - 1) * pxPerFrame}px` }}
                  className="absolute top-0 bottom-0 border-l border-white/12 pl-1 flex items-center text-[9px] font-mono tabular-nums text-slate-400 pointer-events-none"
                >
                  {f}
                </div>
              ))}

              {/* Colchetes de Range [Start e End] */}
              <div
                style={{ left: `${startBracketX}px` }}
                className="absolute bottom-0 text-[10px] font-bold text-slate-200 pointer-events-none leading-none"
              >
                [
              </div>
              <div
                style={{ left: `${endBracketX}px` }}
                className="absolute bottom-0 -translate-x-1/2 text-[10px] font-bold text-slate-200 pointer-events-none leading-none"
              >
                ]
              </div>
            </div>

            {/* Área de Conteúdo da Pista */}
            <div className="flex-1 relative">
              {/* Linhas verticais de grade */}
              {tickFrames.map((f) => (
                <div
                  key={`grid_${f}`}
                  style={{ left: `${(f - 1) * pxPerFrame}px` }}
                  className="absolute top-0 bottom-0 border-l border-white/5 pointer-events-none"
                />
              ))}

              {/* Linha limite do End Frame */}
              <div
                style={{ left: `${endBracketX}px` }}
                className="absolute top-0 bottom-0 border-l border-white/18 pointer-events-none"
              />

              {/* Modo STRIPS */}
              {viewMode === 'strips' && (
                <div className="absolute inset-0 flex flex-col">
                  {/* Pista Base */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('application/x-vertice-strip');
                      if (!raw) return;
                      try {
                        const payload = JSON.parse(raw) as {
                          label: string;
                          sourceType: 'procedural' | 'clip';
                          actionCycle?: AnimationActionCycle;
                        };
                        const el = laneScrollRef.current;
                        const rect = el?.getBoundingClientRect();
                        const dropFrame = rect
                          ? Math.max(
                              1,
                              Math.round((e.clientX - rect.left + (el?.scrollLeft ?? 0)) / pxPerFrame) + 1
                            )
                          : frameStart;
                        addNlaStrip('base', { ...payload, startAt: dropFrame });
                      } catch {
                        // ignore invalid drop
                      }
                    }}
                    className="flex-1 relative border-b border-white/8"
                  >
                    {baseStrips.length === 0 ? (
                      <div
                        style={{
                          left: `${startBracketX + 2}px`,
                          width: `${Math.max(220, endBracketX - startBracketX - 4)}px`,
                        }}
                        className="absolute top-1.5 bottom-1.5 rounded border border-dashed border-sky-400/35 bg-sky-500/5 flex items-center px-3 text-[11px] text-slate-400 pointer-events-none"
                      >
                        Arraste um clipe/ação ou clique em + Clipe para iniciar a sequência
                      </div>
                    ) : (
                      baseStrips.map((s) => {
                        const left = (s.startFrame - 1) * pxPerFrame;
                        const width = Math.max(pxPerFrame * 4, (s.endFrame - s.startFrame + 1) * pxPerFrame);
                        const selected = selectedStripId === s.id;
                        return (
                          <div
                            key={s.id}
                            style={{ left: `${left}px`, width: `${width}px` }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setSelectedStripId(s.id);
                              stripDragRef.current = {
                                id: s.id,
                                mode: 'move',
                                originX: e.clientX,
                                origStart: s.startFrame,
                                origEnd: s.endFrame,
                              };
                            }}
                            className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing ${
                              s.muted
                                ? 'bg-slate-800/70 border-slate-600/50 text-slate-400 opacity-60'
                                : selected
                                  ? 'bg-sky-500/35 border-sky-300 text-white shadow-md'
                                  : 'bg-sky-500/22 border-sky-400/60 text-sky-100'
                            }`}
                          >
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setSelectedStripId(s.id);
                                stripDragRef.current = {
                                  id: s.id,
                                  mode: 'resize-left',
                                  originX: e.clientX,
                                  origStart: s.startFrame,
                                  origEnd: s.endFrame,
                                };
                              }}
                              className="w-1.5 h-full cursor-ew-resize shrink-0"
                            />
                            <span className="text-[10px] font-semibold truncate flex-1">
                              {s.label} ({s.startFrame}–{s.endFrame})
                            </span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() =>
                                onUpdateAnimation({
                                  nlaStrips: strips.map((x) =>
                                    x.id === s.id ? { ...x, muted: !x.muted } : x
                                  ),
                                })
                              }
                              className="text-slate-300 hover:text-white cursor-pointer shrink-0"
                            >
                              {s.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                            </button>
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setSelectedStripId(s.id);
                                stripDragRef.current = {
                                  id: s.id,
                                  mode: 'resize-right',
                                  originX: e.clientX,
                                  origStart: s.startFrame,
                                  origEnd: s.endFrame,
                                };
                              }}
                              className="w-1.5 h-full cursor-ew-resize shrink-0"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pista Superior */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('application/x-vertice-strip');
                      if (!raw) return;
                      try {
                        const payload = JSON.parse(raw) as {
                          label: string;
                          sourceType: 'procedural' | 'clip';
                          actionCycle?: AnimationActionCycle;
                        };
                        const el = laneScrollRef.current;
                        const rect = el?.getBoundingClientRect();
                        const dropFrame = rect
                          ? Math.max(
                              1,
                              Math.round((e.clientX - rect.left + (el?.scrollLeft ?? 0)) / pxPerFrame) + 1
                            )
                          : frameStart;
                        addNlaStrip('upper', { ...payload, startAt: dropFrame });
                      } catch {
                        // ignore invalid drop
                      }
                    }}
                    className="flex-1 relative"
                  >
                    {upperStrips.map((s) => {
                      const left = (s.startFrame - 1) * pxPerFrame;
                      const width = Math.max(pxPerFrame * 4, (s.endFrame - s.startFrame + 1) * pxPerFrame);
                      const selected = selectedStripId === s.id;
                      return (
                        <div
                          key={s.id}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedStripId(s.id);
                            stripDragRef.current = {
                              id: s.id,
                              mode: 'move',
                              originX: e.clientX,
                              origStart: s.startFrame,
                              origEnd: s.endFrame,
                            };
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing ${
                            s.muted
                              ? 'bg-slate-800/70 border-slate-600/50 text-slate-400 opacity-60'
                              : selected
                                ? 'bg-amber-500/35 border-amber-300 text-white shadow-md'
                                : 'bg-amber-500/22 border-amber-400/60 text-amber-100'
                          }`}
                        >
                          <span className="text-[10px] font-semibold truncate flex-1">
                            {s.label} ({s.startFrame}–{s.endFrame})
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              onUpdateAnimation({
                                nlaStrips: strips.map((x) =>
                                  x.id === s.id ? { ...x, muted: !x.muted } : x
                                ),
                              })
                            }
                            className="text-slate-300 hover:text-white cursor-pointer shrink-0"
                          >
                            {s.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modo GRAPH (F-Curves & Timing Spline) */}
              {viewMode === 'graph' && (
                <svg
                  width={Math.max(120, endBracketX - startBracketX)}
                  height="108"
                  style={{ marginLeft: `${startBracketX}px` }}
                  viewBox="0 0 400 100"
                  preserveAspectRatio="none"
                  className="h-full block"
                >
                  {/* Linha guia horizontal central */}
                  <line x1="0" y1="50" x2="400" y2="50" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                  {/* Curva Timing / Easing */}
                  <path
                    d={Array.from({ length: 49 }, (_, i) => {
                      const t = i / 48;
                      const x = t * 400;
                      const y = 86 - sampleEasingValue(animation.easing, t) * 72;
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                  />
                  {/* Curva Arcos */}
                  <path
                    d={Array.from({ length: 49 }, (_, i) => {
                      const t = i / 48;
                      const x = t * 400;
                      const amp = (animation.arcs / 100) * 34;
                      const y = 50 - Math.sin(t * Math.PI * 2) * amp;
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.6"
                  />
                  {/* Curva Squash & Stretch */}
                  <path
                    d={Array.from({ length: 49 }, (_, i) => {
                      const t = i / 48;
                      const x = t * 400;
                      const amp = (animation.squashStretch / 100) * 28;
                      const y = 50 + Math.cos(t * Math.PI * 4) * amp;
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.4"
                  />
                  {/* Pontos dos Keyframes na Curva */}
                  {animation.keyframes.map((kf) => {
                    const span = Math.max(1, frameEnd - frameStart);
                    const t = Math.max(0, Math.min(1, (kf - frameStart) / span));
                    const cx = t * 400;
                    const cy = 86 - sampleEasingValue(animation.easing, t) * 72;
                    return (
                      <circle
                        key={`g_kf_${kf}`}
                        cx={cx}
                        cy={cy}
                        r="3.8"
                        fill="#f59e0b"
                        stroke="#0b0e14"
                        strokeWidth="1.2"
                      />
                    );
                  })}
                </svg>
              )}

              {/* Modo KEYS (Dope Sheet interativo por canal) */}
              {viewMode === 'keys' && (
                <div
                  onClick={(e) => {
                    const el = laneScrollRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const x = e.clientX - rect.left + el.scrollLeft;
                    const clickedFrame = Math.max(
                      1,
                      Math.min(frameEnd, Math.round(x / pxPerFrame) + 1)
                    );
                    onUpdateAnimation({ currentFrame: clickedFrame, playing: false });
                  }}
                  className="absolute inset-0 flex flex-col justify-around cursor-pointer"
                >
                  {DOPE_CHANNELS.map((ch) => (
                    <div key={ch.id} className="h-5 relative border-b border-white/5">
                      {animation.keyframes.map((kf) => (
                        <button
                          key={`${ch.id}_${kf}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateAnimation({ currentFrame: kf, playing: false });
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            toggleKeyframeAt(kf);
                          }}
                          style={{ left: `${(kf - 1) * pxPerFrame}px` }}
                          title={`Keyframe ${kf}f (duplo clique para remover)`}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 border cursor-pointer ${
                            kf === animation.currentFrame
                              ? 'bg-amber-400 border-white scale-110'
                              : ch.id === 'summary'
                                ? 'bg-sky-400 border-sky-200'
                                : 'bg-slate-300 border-slate-900'
                          }`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Playhead Vermelho Vertical (igual à referência) */}
            <div
              style={{ left: `${playheadX}px` }}
              className="absolute top-0 bottom-0 w-[1.5px] bg-rose-500 pointer-events-none z-10"
            >
              <div className="px-1.5 py-0.5 rounded-sm bg-rose-500 text-white text-[9px] font-mono font-bold tabular-nums -translate-x-1/2 leading-none shadow">
                {animation.currentFrame}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
