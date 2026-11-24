import {
  Bone,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  Circle,
  Clock,
  Copy,
  CopyPlus,
  Diamond,
  FastForward,
  Film,
  Flag,
  Globe,
  Hash,
  KeyRound,
  Layers,
  Mic,
  Minus,
  Monitor,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Rewind,
  Scissors,
  Share2,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Zap,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  MoveHorizontal,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  AnimationActionCycle,
  AnimationSettings,
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
  { id: 'idle', label: 'Idle', color: 'bg-slate-500/25 border-slate-400/50 text-slate-100' },
  { id: 'walk', label: 'Walk', color: 'bg-sky-500/25 border-sky-400/55 text-sky-100' },
  { id: 'run', label: 'Run', color: 'bg-emerald-500/25 border-emerald-400/55 text-emerald-100' },
  { id: 'jump', label: 'Jump', color: 'bg-amber-500/25 border-amber-400/55 text-amber-100' },
  { id: 'slash', label: 'Slash', color: 'bg-rose-500/25 border-rose-400/55 text-rose-100' },
  { id: 'hit', label: 'Hit', color: 'bg-red-500/25 border-red-400/55 text-red-100' },
  { id: 'death', label: 'Death', color: 'bg-zinc-500/25 border-zinc-400/55 text-zinc-100' },
  { id: 'block', label: 'Block', color: 'bg-blue-500/25 border-blue-400/55 text-blue-100' },
  { id: 'fall', label: 'Fall', color: 'bg-purple-500/25 border-purple-400/55 text-purple-100' },
  { id: 'land', label: 'Land', color: 'bg-orange-500/25 border-orange-400/55 text-orange-100' },
  { id: 'dash', label: 'Dash', color: 'bg-cyan-500/25 border-cyan-400/55 text-cyan-100' },
  { id: 'interact', label: 'Interact', color: 'bg-pink-500/25 border-pink-400/55 text-pink-100' },
];

const FPS_CYCLE: Array<12 | 24 | 30 | 60> = [12, 24, 30, 60];

const DOPE_CHANNELS = [
  { id: 'summary', label: 'Summary (All)', color: 'text-sky-300' },
  { id: 'hips', label: 'Pelvis / Root', color: 'text-amber-300' },
  { id: 'spine', label: 'Spine / Chest', color: 'text-emerald-300' },
  { id: 'arms', label: 'Arms (FK)', color: 'text-rose-300' },
  { id: 'legs', label: 'Legs (FK / IK)', color: 'text-indigo-300' },
] as const;

const EXTRAPOLATION_MODES = ['hold', 'repeat', 'nothing'] as const;
const BLEND_MODES = ['replace', 'add', 'multiply', 'combine'] as const;

const INTERPOLATION_TYPES = ['constant', 'linear', 'bezier', 'sine', 'elastic', 'bounce', 'back'] as const;
const TANGENT_TYPES = ['auto', 'free', 'aligned', 'vectored', 'clamped'] as const;

interface TimelineMarker {
  id: string;
  frame: number;
  label: string;
  color: string;
  note?: string;
}

interface NlaTrack {
  id: string;
  name: string;
  visible: boolean;
  solo: boolean;
  mute: boolean;
  blendMode: typeof BLEND_MODES[number];
  extrapolation: typeof EXTRAPOLATION_MODES[number];
  strips: NlaTimelineStrip[];
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
  const [clipMenuOpen, setClipMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'track' | 'strip' | 'keyframe' | 'marker'; data: any } | null>(null);
  const [onionSkinning, setOnionSkinning] = useState({ enabled: false, beforeFrames: 2, afterFrames: 2, opacity: 0.3 });
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [tracks, setTracks] = useState<NlaTrack[]>([
    { id: 'base', name: 'Base', visible: true, solo: false, mute: false, blendMode: 'replace', extrapolation: 'hold', strips: animation.nlaStrips ?? [] },
  ]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimecode, setShowTimecode] = useState(true);
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ frame: number; channel: string; interpolation: typeof INTERPOLATION_TYPES[number]; tangentIn: typeof TANGENT_TYPES[number]; tangentOut: typeof TANGENT_TYPES[number] } | null>(null);
  const [graphTangentEdit, setGraphTangentEdit] = useState<{ frame: number; handle: 'in' | 'out'; dragging: boolean } | null>(null);

  const laneScrollRef = useRef<HTMLDivElement>(null);
  const dragScrubRef = useRef(false);
  const stripDragRef = useRef<{
    id: string;
    mode: 'move' | 'resize-left' | 'resize-right';
    originX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);
  const markerDragRef = useRef<{ id: string; originX: number; origFrame: number } | null>(null);

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
      if (sd) {
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
        return;
      }
      const md = markerDragRef.current;
      if (md) {
        const deltaFrames = Math.round((e.clientX - md.originX) / pxPerFrame);
        const nextFrame = Math.max(1, Math.min(maxTimelineFrame, md.origFrame + deltaFrames));
        setMarkers((prev) => prev.map((m) => (m.id === md.id ? { ...m, frame: nextFrame } : m)));
        return;
      }
    };

    const onUp = () => {
      dragScrubRef.current = false;
      stripDragRef.current = null;
      markerDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pxPerFrame, maxTimelineFrame]);

  // Auto-scroll when playing
  useEffect(() => {
    if (!animation.playing || !autoScroll || !laneScrollRef.current) return;
    const playheadX = (animation.currentFrame - 1) * pxPerFrame;
    const el = laneScrollRef.current;
    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    if (Math.abs(playheadX - viewportCenter) > el.clientWidth * 0.3) {
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth / 2);
    }
  }, [animation.playing, animation.currentFrame, autoScroll, pxPerFrame]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

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
    opts: {
      label: string;
      sourceType: 'procedural' | 'clip';
      actionCycle?: AnimationActionCycle;
      clipIndex?: number;
      startAt?: number;
    }
  ) => {
    const lastEnd = strips.reduce((acc, s) => Math.max(acc, s.endFrame), 0);
    const startFrame = Math.max(1, Math.min(frameEnd - 5, opts.startAt ?? (lastEnd > 0 ? lastEnd + 1 : frameStart)));
    const endFrame = Math.min(Math.max(frameEnd, startFrame + 24), startFrame + 24);
    const newStrip: NlaTimelineStrip = {
      id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: 'base',
      label: opts.label,
      sourceType: opts.sourceType,
      actionCycle: opts.actionCycle,
      clipIndex: opts.clipIndex,
      startFrame,
      endFrame,
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
    onNotice(`Clipe "${opts.label}" adicionado na pista Base (${startFrame}–${endFrame}f).`);
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
        {/* Grupo Esquerdo: Histórico, Duplicar & Opções de Rig */}
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
            title="Auto-Keyframe: grava keyframe automaticamente ao editar Pose FK"
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
              title="Ir para o quadro inicial (Start) [Shift+Home]"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({
                  currentFrame: Math.max(frameStart, animation.currentFrame - 1),
                  playing: false,
                })
              }
              title="Voltar 1 quadro [←]"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Rewind className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={jumpPrevKeyframe}
              title="Keyframe anterior [Alt+←]"
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
              onClick={() =>
                onUpdateAnimation({
                  playing: false,
                  currentFrame: frameStart,
                })
              }
              title="Parar e voltar ao início (Stop) [Shift+Space]"
              className="h-7 w-7 hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 flex items-center justify-center cursor-pointer"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
            <button
              type="button"
              onClick={jumpNextKeyframe}
              title="Próximo Keyframe [Alt+→]"
              className="h-7 w-6 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({
                  currentFrame: Math.min(frameEnd, animation.currentFrame + 1),
                  playing: false,
                })
              }
              title="Avançar 1 quadro [→]"
              className="h-7 w-7 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAnimation({ currentFrame: frameEnd, playing: false })
              }
              title="Ir para o quadro final (End) [Shift+End]"
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

        {/* Grupo Direito: Clipes, Abas (STRIPS/GRAPH/KEYS), Onion Skin, Markers, Tracks, Zoom, Range & FPS */}
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
                        addNlaStrip({
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
                          addNlaStrip({
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

          {/* Onion Skinning Toggle */}
          <div className="relative">
            <button
              type="button"
              aria-pressed={onionSkinning.enabled}
              onClick={() => setOnionSkinning((p) => ({ ...p, enabled: !p.enabled }))}
              title="Onion Skinning (mostrar frames anteriores/posteriores)"
              className={`h-7 w-7 rounded-md border flex items-center justify-center cursor-pointer ${
                onionSkinning.enabled
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                  : 'bg-[#151b28] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
            {onionSkinning.enabled && (
              <div className="fixed bottom-[162px] sm:bottom-[196px] right-2 sm:right-[100px] z-50 w-40 rounded-xl bg-[#101521] border border-white/15 shadow-2xl p-2 flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase px-1">Onion Skin</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 w-12">Antes</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={onionSkinning.beforeFrames}
                    onChange={(e) => setOnionSkinning((p) => ({ ...p, beforeFrames: Number(e.target.value) }))}
                    className="flex-1 h-1.5 accent-sky-500"
                  />
                  <span className="text-[10px] font-mono text-slate-100 w-6">{onionSkinning.beforeFrames}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 w-12">Depois</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={onionSkinning.afterFrames}
                    onChange={(e) => setOnionSkinning((p) => ({ ...p, afterFrames: Number(e.target.value) }))}
                    className="flex-1 h-1.5 accent-sky-500"
                  />
                  <span className="text-[10px] font-mono text-slate-100 w-6">{onionSkinning.afterFrames}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 w-12">Opacidade</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(onionSkinning.opacity * 100)}
                    onChange={(e) => setOnionSkinning((p) => ({ ...p, opacity: Number(e.target.value) / 100 }))}
                    className="flex-1 h-1.5 accent-sky-500"
                  />
                  <span className="text-[10px] font-mono text-slate-100 w-6">{Math.round(onionSkinning.opacity * 100)}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Add Marker */}
          <button
            type="button"
            onClick={() => {
              const newMarker: TimelineMarker = {
                id: `marker_${Date.now()}`,
                frame: animation.currentFrame,
                label: `M${markers.length + 1}`,
                color: '#38bdf8',
              };
              setMarkers((prev) => [...prev, newMarker]);
              onNotice(`Marcador "${newMarker.label}" adicionado no quadro ${animation.currentFrame}f.`);
            }}
            title="Adicionar marcador no quadro atual (M)"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-[#1e273a] border border-white/10 text-sky-300 hover:text-sky-100 flex items-center justify-center cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>

          {/* Tracks Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setContextMenu((p) => (p?.type === 'track' ? null : { x: 0, y: 0, type: 'track', data: null }))}
              title="Gerenciar pistas NLA"
              className="h-7 px-2 rounded-md bg-[#151b28] hover:bg-[#1e273a] border border-white/10 text-[10px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <Layers className="w-3 h-3" />
              <span>Pistas</span>
            </button>
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
            {showTimecode ? (
              <>
                {Math.floor(animation.currentFrame / animation.fpsCadence)}:{String(animation.currentFrame % animation.fpsCadence).padStart(2, '0')}
              </>
            ) : (
              `Frame ${animation.currentFrame}`
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowTimecode((p) => !p)}
            title="Alternar Timecode / Frame Number"
            className="h-7 w-7 rounded-md bg-[#151b28] hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <Hash className="w-3.5 h-3.5" />
          </button>

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
            <div className="flex-1 flex flex-col overflow-y-auto">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className={`flex-shrink-0 px-2.5 py-1.5 border-b border-white/8 flex items-center justify-between gap-1 ${
                    !track.visible ? 'opacity-40' : ''
                  }`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'track', data: track });
                  }}
                >
                  <div className="min-w-0 flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={track.visible}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, visible: !t.visible } : t)));
                      }}
                      title={track.visible ? 'Ocultar pista' : 'Mostrar pista'}
                      className={`h-5 w-5 rounded flex items-center justify-center ${
                        track.visible
                          ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                          : 'bg-slate-500/20 text-slate-500 hover:bg-slate-500/30'
                      }`}
                    >
                      {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      aria-pressed={track.solo}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id ? { ...t, solo: !t.solo } : { ...t, solo: false }
                          )
                        );
                      }}
                      title={track.solo ? 'Desativar Solo' : 'Solo (isolar esta pista)'}
                      className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold ${
                        track.solo
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50'
                          : 'bg-slate-500/20 text-slate-500 hover:bg-slate-500/30'
                      }`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      aria-pressed={track.mute}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, mute: !t.mute } : t)));
                      }}
                      title={track.mute ? 'Desativar Mute' : 'Mute (silenciar esta pista)'}
                      className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold ${
                        track.mute
                          ? 'bg-rose-500/30 text-rose-300 border border-rose-400/50'
                          : 'bg-slate-500/20 text-slate-500 hover:bg-slate-500/30'
                      }`}
                    >
                      M
                    </button>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-white leading-tight truncate">{track.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">
                        {track.strips.length} clipe(s) • {track.blendMode} • {track.extrapolation}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <select
                      value={track.blendMode}
                      onChange={(e) => {
                        e.stopPropagation();
                        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, blendMode: e.target.value as typeof BLEND_MODES[number] } : t)));
                      }}
                      className="h-5 px-1.5 text-[9px] bg-[#151b28] border border-white/10 rounded text-slate-200 outline-none cursor-pointer"
                    >
                      {BLEND_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={track.extrapolation}
                      onChange={(e) => {
                        e.stopPropagation();
                        setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, extrapolation: e.target.value as typeof EXTRAPOLATION_MODES[number] } : t)));
                      }}
                      className="h-5 px-1.5 text-[9px] bg-[#151b28] border border-white/10 rounded text-slate-200 outline-none cursor-pointer"
                    >
                      {EXTRAPOLATION_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const newStrip: NlaTimelineStrip = {
                          id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          trackId: track.id,
                          label: STRIP_PALETTE_ACTIONS.find((a) => a.id === animation.action)?.label ?? animation.action,
                          sourceType: animation.poseSource === 'clip' && loadedClips.length > 0 ? 'clip' : 'procedural',
                          actionCycle: animation.action,
                          clipIndex: animation.activeClipIndex,
                          startFrame: frameStart,
                          endFrame: frameStart + 24,
                        };
                        setTracks((prev) =>
                          prev.map((t) =>
                            t.id === track.id ? { ...t, strips: [...t.strips, newStrip] } : t
                          )
                        );
                        onUpdateAnimation({ nlaStrips: [...strips, newStrip] });
                        onNotice(`Clipe adicionado na pista "${track.name}".`);
                      }}
                      title="Adicionar ação atual nesta pista"
                      className="h-5 px-1.5 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-200 border border-sky-400/35 text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {/* Add Track Button */}
              <button
                type="button"
                onClick={() => {
                  const newTrack: NlaTrack = {
                    id: `track_${Date.now()}`,
                    name: `Track ${tracks.length + 1}`,
                    visible: true,
                    solo: false,
                    mute: false,
                    blendMode: 'replace',
                    extrapolation: 'hold',
                    strips: [],
                  };
                  setTracks((prev) => [...prev, newTrack]);
                  onNotice(`Nova pista "${newTrack.name}" criada.`);
                }}
                className="px-2.5 py-1.5 flex items-center justify-center gap-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">Nova Pista</span>
              </button>
            </div>
          )}

          {viewMode === 'graph' && (
            <div className="flex-1 px-2.5 py-1.5 flex flex-col justify-between text-[10px]">
              <div className="flex flex-col gap-1">
                <span className="text-sky-300 font-semibold">● Curva Timing</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Interpolação:</span>
                  <select
                    value={selectedKeyframe?.interpolation ?? 'bezier'}
                    onChange={(e) => {
                      if (selectedKeyframe) {
                        // Update interpolation for selected keyframe
                        onNotice(`Interpolação alterada para ${e.target.value}`);
                      }
                    }}
                    className="h-5 px-1.5 text-[9px] bg-[#151b28] border border-white/10 rounded text-slate-200 outline-none cursor-pointer"
                  >
                    {INTERPOLATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
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

              {/* Markers */}
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  style={{
                    left: `${(marker.frame - 1) * pxPerFrame}px`,
                    backgroundColor: marker.color,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    markerDragRef.current = { id: marker.id, originX: e.clientX, origFrame: marker.frame };
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'marker', data: marker });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, type: 'marker', data: marker });
                  }}
                  className="absolute top-0 bottom-0 w-[2px] pointer-events-none z-5"
                >
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 transform-gpu"
                    style={{ transform: 'translateX(-50%) translateY(-100%)' }}
                  >
                    <div
                      className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold text-white whitespace-nowrap shadow"
                      style={{ backgroundColor: marker.color }}
                    >
                      {marker.label}
                    </div>
                    <div className="w-0.5 h-2" style={{ backgroundColor: marker.color }} />
                  </div>
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
                  {tracks.map((track) => (
                    !track.visible ? null : (
                      <div
                        key={track.id}
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
                            const newStrip: NlaTimelineStrip = {
                              id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                              trackId: track.id,
                              label: payload.label,
                              sourceType: payload.sourceType,
                              actionCycle: payload.actionCycle,
                              startFrame: dropFrame,
                              endFrame: dropFrame + 24,
                            };
                            setTracks((prev) =>
                              prev.map((t) =>
                                t.id === track.id ? { ...t, strips: [...t.strips, newStrip] } : t
                              )
                            );
                            onUpdateAnimation({ nlaStrips: [...strips, newStrip] });
                            onNotice(`Clipe "${payload.label}" adicionado na pista "${track.name}".`);
                          } catch {
                            // ignore invalid drop
                          }
                        }}
                        className={`flex-1 relative border-b border-white/8 ${track.mute ? 'opacity-50' : ''}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, type: 'track', data: track });
                        }}
                      >
                        {track.strips.length === 0 ? (
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
                          track.strips.map((s) => {
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
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setContextMenu({ x: e.clientX, y: e.clientY, type: 'strip', data: { strip: s, track } });
                                }}
                                className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 flex items-center justify-between gap-1 cursor-grab active:cursor-grabbing ${
                                  selected
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
                    )
                  ))}
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
                  {/* Curva Timing (linear simplificado) */}
                  <path
                    d={Array.from({ length: 49 }, (_, i) => {
                      const t = i / 48;
                      const x = t * 400;
                      const y = 86 - t * 72;
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                  />
                  {/* Pontos dos Keyframes na Curva */}
                  {animation.keyframes.map((kf) => {
                    const span = Math.max(1, frameEnd - frameStart);
                    const t = Math.max(0, Math.min(1, (kf - frameStart) / span));
                    const cx = t * 400;
                    const cy = 86 - t * 72;
                    const isSelected = selectedKeyframe?.frame === kf;
                    return (
                      <g key={`g_kf_${kf}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 5.5 : 3.8}
                          fill={isSelected ? '#f59e0b' : '#f59e0b'}
                          stroke={isSelected ? '#0b0e14' : '#0b0e14'}
                          strokeWidth={isSelected ? 2 : 1.2}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setSelectedKeyframe({
                              frame: kf,
                              channel: 'summary',
                              interpolation: 'bezier',
                              tangentIn: 'auto',
                              tangentOut: 'auto',
                            });
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'keyframe', data: { frame: kf, channel: 'summary' } });
                          }}
                        />
                        {isSelected && graphTangentEdit && graphTangentEdit.frame === kf && (
                          <>
                            <line
                              x1={cx - 30}
                              y1={cy}
                              x2={cx + 30}
                              y2={cy}
                              stroke="#38bdf8"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                              opacity={0.5}
                            />
                          </>
                        )}
                      </g>
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
                            setSelectedKeyframe({
                              frame: kf,
                              channel: ch.id,
                              interpolation: 'bezier',
                              tangentIn: 'auto',
                              tangentOut: 'auto',
                            });
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            toggleKeyframeAt(kf);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'keyframe', data: { frame: kf, channel: ch.id } });
                          }}
                          style={{ left: `${(kf - 1) * pxPerFrame}px` }}
                          title={`Keyframe ${kf}f (duplo clique para remover, clique direito para opções)`}
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
      </div>

      {/* Context Menus */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 rounded-xl bg-[#101521] border border-white/15 shadow-2xl p-1 min-w-[160px]"
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.type === 'track' && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase border-b border-white/10">
                Pista: {contextMenu.data.name}
              </div>
              <button
                onClick={() => {
                  setTracks((prev) => prev.map((t) => (t.id === contextMenu.data.id ? { ...t, visible: !t.visible } : t)));
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Eye className="w-3.5 h-3.5" />
                {contextMenu.data.visible ? 'Ocultar' : 'Mostrar'}
              </button>
              <button
                onClick={() => {
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === contextMenu.data.id ? { ...t, solo: !t.solo } : { ...t, solo: false }
                    )
                  );
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Mic className="w-3.5 h-3.5" />
                {contextMenu.data.solo ? 'Desativar Solo' : 'Solo'}
              </button>
              <button
                onClick={() => {
                  setTracks((prev) => prev.map((t) => (t.id === contextMenu.data.id ? { ...t, mute: !t.mute } : t)));
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <VolumeX className="w-3.5 h-3.5" />
                {contextMenu.data.mute ? 'Desativar Mute' : 'Mute'}
              </button>
              <div className="border-t border-white/10 my-1" />
              <button
                onClick={() => {
                  const newStrip: NlaTimelineStrip = {
                    id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    trackId: contextMenu.data.id,
                    label: STRIP_PALETTE_ACTIONS.find((a) => a.id === animation.action)?.label ?? animation.action,
                    sourceType: animation.poseSource === 'clip' && loadedClips.length > 0 ? 'clip' : 'procedural',
                    actionCycle: animation.action,
                    clipIndex: animation.activeClipIndex,
                    startFrame: frameStart,
                    endFrame: frameStart + 24,
                  };
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === contextMenu.data.id ? { ...t, strips: [...t.strips, newStrip] } : t
                    )
                  );
                  onUpdateAnimation({ nlaStrips: [...strips, newStrip] });
                  setContextMenu(null);
                  onNotice(`Clipe adicionado na pista "${contextMenu.data.name}".`);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-sky-200 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Clipe
              </button>
              <button
                onClick={() => {
                  setTracks((prev) => prev.filter((t) => t.id !== contextMenu.data.id));
                  onUpdateAnimation({ nlaStrips: strips.filter((s) => s.trackId !== contextMenu.data.id) });
                  setContextMenu(null);
                  onNotice(`Pista "${contextMenu.data.name}" removida.`);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-rose-200 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Pista
              </button>
            </>
          )}
          {contextMenu.type === 'strip' && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase border-b border-white/10">
                Clipe: {contextMenu.data.strip.label}
              </div>
              <button
                onClick={() => {
                  const span = contextMenu.data.strip.endFrame - contextMenu.data.strip.startFrame;
                  const startFrame = contextMenu.data.strip.endFrame + 1;
                  const endFrame = Math.min(240, startFrame + span);
                  const copy: NlaTimelineStrip = {
                    ...contextMenu.data.strip,
                    id: `strip_${Date.now()}`,
                    startFrame,
                    endFrame,
                  };
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === contextMenu.data.track.id
                        ? { ...t, strips: [...t.strips, copy] }
                        : t
                    )
                  );
                  onUpdateAnimation({
                    nlaStrips: [...strips, copy],
                    frameEnd: Math.max(frameEnd, endFrame),
                  });
                  setContextMenu(null);
                  onNotice(`Clipe duplicado (${startFrame}–${endFrame}f).`);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                Duplicar
              </button>
              <button
                onClick={() => {
                  setTracks((prev) =>
                    prev.map((t) =>
                      t.id === contextMenu.data.track.id
                        ? { ...t, strips: t.strips.filter((s) => s.id !== contextMenu.data.strip.id) }
                        : t
                    )
                  );
                  onUpdateAnimation({ nlaStrips: strips.filter((s) => s.id !== contextMenu.data.strip.id) });
                  setContextMenu(null);
                  onNotice('Clipe removido.');
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-rose-200 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
              <div className="border-t border-white/10 my-1" />
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">Blend Mode</div>
              {BLEND_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setTracks((prev) =>
                      prev.map((t) =>
                        t.id === contextMenu.data.track.id
                          ? {
                              ...t,
                              strips: t.strips.map((s) =>
                                s.id === contextMenu.data.strip.id ? { ...s, blendMode: mode } : s
                              ),
                            }
                          : t
                      )
                    );
                    setContextMenu(null);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-[11px] rounded flex items-center gap-2 ${
                    contextMenu.data.strip.blendMode === mode
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {contextMenu.data.strip.blendMode === mode && <Check className="w-3.5 h-3.5" />}
                  {mode}
                </button>
              ))}
            </>
          )}
          {contextMenu.type === 'keyframe' && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase border-b border-white/10">
                Keyframe: {contextMenu.data.frame}f ({contextMenu.data.channel})
              </div>
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">Interpolação</div>
              {INTERPOLATION_TYPES.map((interp) => (
                <button
                  key={interp}
                  onClick={() => {
                    onNotice(`Interpolação alterada para ${interp}`);
                    setContextMenu(null);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-[11px] rounded flex items-center gap-2 ${
                    selectedKeyframe?.interpolation === interp
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {selectedKeyframe?.interpolation === interp && <Check className="w-3.5 h-3.5" />}
                  {interp}
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">Tangente Entrada</div>
              {TANGENT_TYPES.map((tangent) => (
                <button
                  key={tangent}
                  onClick={() => {
                    onNotice(`Tangente de entrada: ${tangent}`);
                    setContextMenu(null);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-[11px] rounded flex items-center gap-2 ${
                    selectedKeyframe?.tangentIn === tangent
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {selectedKeyframe?.tangentIn === tangent && <Check className="w-3.5 h-3.5" />}
                  {tangent}
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase">Tangente Saída</div>
              {TANGENT_TYPES.map((tangent) => (
                <button
                  key={tangent}
                  onClick={() => {
                    onNotice(`Tangente de saída: ${tangent}`);
                    setContextMenu(null);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-[11px] rounded flex items-center gap-2 ${
                    selectedKeyframe?.tangentOut === tangent
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {selectedKeyframe?.tangentOut === tangent && <Check className="w-3.5 h-3.5" />}
                  {tangent}
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <button
                onClick={() => {
                  toggleKeyframeAt(contextMenu.data.frame);
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-rose-200 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover Keyframe
              </button>
            </>
          )}
          {contextMenu.type === 'marker' && (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase border-b border-white/10">
                Marcador: {contextMenu.data.label}
              </div>
              <button
                onClick={() => {
                  const newLabel = prompt('Editar label do marcador:', contextMenu.data.label);
                  if (newLabel) {
                    setMarkers((prev) =>
                      prev.map((m) => (m.id === contextMenu.data.id ? { ...m, label: newLabel } : m))
                    );
                  }
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Scissors className="w-3.5 h-3.5" />
                Renomear
              </button>
              <button
                onClick={() => {
                  const colors = ['#38bdf8', '#f59e0b', '#f87171', '#a78bfa', '#4ade80', '#fb923c'];
                  const randomColor = colors[Math.floor(Math.random() * colors.length)];
                  setMarkers((prev) =>
                    prev.map((m) => (m.id === contextMenu.data.id ? { ...m, color: randomColor } : m))
                  );
                  setContextMenu(null);
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-100 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5" />
                Cor Aleatória
              </button>
              <button
                onClick={() => {
                  setMarkers((prev) => prev.filter((m) => m.id !== contextMenu.data.id));
                  setContextMenu(null);
                  onNotice('Marcador removido.');
                }}
                className="w-full px-2 py-1.5 text-left text-[11px] text-rose-200 hover:bg-white/10 rounded flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
