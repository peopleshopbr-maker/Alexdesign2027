import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimationTimelineDock } from './components/AnimationTimelineDock';
import { BottomDock } from './components/BottomDock';
import { CameraOrientationGizmo } from './components/CameraOrientationGizmo';
import { LeftToolRail } from './components/LeftToolRail';
import { ObjectPropertiesPanel } from './components/ObjectPropertiesPanel';
import { RadialPieMenu, type PieMenuActionId } from './components/RadialPieMenu';
import { SceneOutlinerPanel } from './components/SceneOutlinerPanel';
import { TopBar } from './components/TopBar';
import { probeGpuHardware } from './graphics/gpuProbe';
import { SHADER_PRESETS } from './graphics/shaders';
import { ThreeStudioEngine } from './graphics/threeStudioEngine';
import { NativeWebGPUParticleEngine } from './graphics/webgpuParticleEngine';
import {
  loadStartupModelFile,
} from './utils/startupModelStore';
import { useSystemStore } from './stores/SystemStore';
import { downloadBlender53Package } from './services/blenderZipExporter';
import type {
  AnimationActionCycle,
  AnimationSettings,
  CameraPreset,
  ExportCaptureResolution,
  GeometryNodesSettings,
  GpuHardwareReport,
  MaterialPresetId,
  PbrTextureSlot,
  ProceduralNodeTemplate,
  RenderMetrics,
  RenderSettings,
  RigExportProfile,
  SavedPosePreset,
  SceneMode,
  SceneOutlinerItem,
  SculptSettings,
  SelectedObjectInfo,
  ShaderCompileResult,
  ViewportCompareMode,
  WeightPaintSettings,
} from './types/graphics';

type Vfx3DSceneMode = 'nodes' | 'physics' | 'instanced' | 'shader';
type VfxSubMode = Vfx3DSceneMode | 'postfx';

const isVfxSceneMode = (mode: SceneMode): mode is Vfx3DSceneMode =>
  mode === 'nodes' || mode === 'physics' || mode === 'instanced' || mode === 'shader';

const MULTI_CLIP_EXPORT_ACTIONS: AnimationActionCycle[] = [
  'idle',
  'walk',
  'run',
  'jump',
  'slash',
  'hit',
  'death',
  'block',
  'fall',
  'land',
  'dash',
  'interact',
  'chest_open',
];

const DEFAULT_WEIGHT_PAINT: WeightPaintSettings = {
  active: false,
  selectedBoneName: '',
  brushMode: 'add',
  brushRadius: 0.22,
  strength: 0.45,
  symmetryX: true,
};

const DEFAULT_ANIMATION: AnimationSettings = {
  enabled: true,
  playing: false,
  cycleMode: 'full_cycle',
  action: 'walk',
  inPlace: true,
  propType: 'none',
  exportProfile: 'standard',
  motionTrail: true,
  fpsCadence: 30,
  currentFrame: 1,
  frameStart: 1,
  frameEnd: 60,
  autoKey: false,
  rotationMode: 'quaternion',
  keyframes: [1],
  activeClipIndex: 0,
  poseSource: 'procedural',
  showBones: false,
  exaggeration: 1.0,
  nlaStrips: [],
};

const DEFAULT_GEOMETRY_NODES: GeometryNodesSettings = {
  enabled: true,
  distribution: 'radial',
  effector: 'wave',
  cloneCount: 4,
  spacing: 1.6,
  strength: 0.45,
  speed: 1.0,
  template: 'glass_neon',
};

const DEFAULT_SETTINGS: RenderSettings = {
  sceneMode: 'gltf',
  backend: 'webgl2',
  finish: 'titanium',
  explosion: 0,
  speed: 1.0,
  instanceCount: 1000,
  turbulence: 0.25,
  frequency: 2.0,
  frustumCulling: true,
  lodBias: 0,
  snapEnabled: false,
  lighting: {
    preset: 'studio',
    exposure: 1.1,
    envIntensity: 1.0,
    envRotationDeg: 0,
    shadowIntensity: 0.85,
  },
  postProcessing: {
    enabled: false,
    bloomStrength: 0.22,
    dofEnabled: false,
    dofFocus: 6.5,
    grainAmount: 0.02,
    chromaticAmount: 0.0015,
  },
  viewportShading: {
    mode: 'pbr',
    wireframe: false,
    bakeAo: false,
  },
  sculpt: {
    material: 'redwax',
    brush: 'standard',
    drawSize: 0.18,
    zIntensity: 18,
    symmetryX: true,
    gizmoMode: 'orbit',
    baseVisible: true,
  },
  geometryNodes: DEFAULT_GEOMETRY_NODES,
  animation: DEFAULT_ANIMATION,
};

const INITIAL_METRICS: RenderMetrics = {
  fps: 60,
  frameTimeMs: 16.7,
  drawCalls: 0,
  triangles: 0,
  activeBackendLabel: 'WebGL2 Acelerado',
  isNativeWebGPUActive: false,
  isSoftwareRenderer: false,
  gpuRendererString: 'Inicializando GPU...',
  lodTelemetry: {
    totalLodNodes: 1,
    lod0Count: 0,
    lod1Count: 0,
    lod2Count: 0,
    inFrustumCount: 0,
    culledCount: 0,
    loadedModelName: null,
    loadedMeshCount: 0,
    loadedClips: [],
    activeClipIndex: 0,
    boneCount: 0,
    isAutoRigged: false,
  },
};

function deepMergeSettings(
  base: RenderSettings,
  override?: Partial<RenderSettings>
): RenderSettings {
  if (!override) return structuredClone(base);
  return {
    ...base,
    ...override,
    lighting: {
      ...base.lighting,
      ...(override.lighting ?? {}),
    },
    postProcessing: {
      ...base.postProcessing,
      ...(override.postProcessing ?? {}),
    },
    viewportShading: {
      ...base.viewportShading,
      ...(override.viewportShading ?? {}),
    },
    sculpt: {
      ...base.sculpt,
      ...(override.sculpt ?? {}),
    },
    geometryNodes: {
      ...base.geometryNodes,
      ...(override.geometryNodes ?? {}),
    },
    animation: {
      ...base.animation,
      ...(override.animation ?? {}),
      keyframes: override.animation?.keyframes
        ? [...override.animation.keyframes]
        : [...base.animation.keyframes],
    },
  };
}

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const bottomDockRef = useRef<HTMLDivElement>(null);
  const [bottomInset, setBottomInset] = useState(0);
  const threeEngineRef = useRef<ThreeStudioEngine | null>(null);
  const webgpuEngineRef = useRef<NativeWebGPUParticleEngine | null>(null);

  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<RenderSettings>(settings);
  settingsRef.current = settings;

  const [metrics, setMetrics] = useState<RenderMetrics>(INITIAL_METRICS);
  const metricsRef = useRef<RenderMetrics>(INITIAL_METRICS);
  metricsRef.current = metrics;

  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1180 : false
  );
  const isCompactViewportRef = useRef(isCompactViewport);
  isCompactViewportRef.current = isCompactViewport;
  const lastVfx3DModeRef = useRef<Vfx3DSceneMode>('nodes');
  const [vfxTab, setVfxTab] = useState<VfxSubMode>('nodes');

  const [contextLost, setContextLost] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const timelineRetargetInputRef = useRef<HTMLInputElement>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const leftPanelOpenRef = useRef(leftPanelOpen);
  leftPanelOpenRef.current = leftPanelOpen;

  const [sideUtilityPanel, setSideUtilityPanel] = useState<'none' | 'postfx' | 'lighting'>('none');
  const [rightPanelMode, setRightPanelMode] = useState<'closed' | 'inspector' | 'outliner'>('closed');
  const rightPanelModeRef = useRef(rightPanelMode);
  rightPanelModeRef.current = rightPanelMode;

  const [outlinerItems, setOutlinerItems] = useState<SceneOutlinerItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SelectedObjectInfo | null>(null);
  const [cameraQuaternion, setCameraQuaternion] = useState<[number, number, number, number]>([
    0, 0, 0, 1,
  ]);
  const [pieMenuOpen, setPieMenuOpen] = useState(false);
  const [pieMenuPos] = useState({ x: 640, y: 360 });
  const lastPointerPosRef = useRef({ x: 640, y: 360 });

  const [, setNodesMeshCount] = useState(2);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [, setJointMarkersActive] = useState(false);
  const [jointMarkerSymmetry] = useState(true);
  const jointMarkerSymmetryRef = useRef(jointMarkerSymmetry);
  jointMarkerSymmetryRef.current = jointMarkerSymmetry;

  const [liveRenderActive, setLiveRenderActive] = useState(false);
  const liveRenderActiveRef = useRef(liveRenderActive);
  liveRenderActiveRef.current = liveRenderActive;

  const [transparentPng, setTransparentPng] = useState(true);
  const [captureResolution, setCaptureResolution] = useState<ExportCaptureResolution>('viewport');
  const [turntable360, setTurntable360] = useState(false);
  const [multiClipExport, setMultiClipExport] = useState(false);
  const [compareMode, setCompareMode] = useState<ViewportCompareMode>('off');
  const compareModeRef = useRef(compareMode);
  compareModeRef.current = compareMode;

  const [exportingFramesLabel, setExportingFramesLabel] = useState<string | null>(null);
  const [exportingSpriteSheetLabel, setExportingSpriteSheetLabel] = useState<string | null>(null);
  const [exportingBlenderZip, setExportingBlenderZip] = useState(false);
  const [exportingGlb, setExportingGlb] = useState(false);
  const [, setRigBoneNames] = useState<string[]>([]);
  const [rigRevision, setRigRevision] = useState(0);
  const [weightPaint, setWeightPaint] = useState<WeightPaintSettings>(DEFAULT_WEIGHT_PAINT);
  const weightPaintRef = useRef(weightPaint);
  weightPaintRef.current = weightPaint;

  const [savedPoses, setSavedPoses] = useState<SavedPosePreset[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('vertice_studio_saved_poses_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore parse error
    }
    return [];
  });
  const savedPosesRef = useRef(savedPoses);
  savedPosesRef.current = savedPoses;

  const liveRenderPrevRef = useRef<{
    postFxEnabled: boolean;
    bloomStrength: number;
    bakeAo: boolean;
    showBones: boolean;
  } | null>(null);

  const [, setVertexCode] = useState(SHADER_PRESETS[0].vertexShader);
  const [, setFragmentCode] = useState(SHADER_PRESETS[0].fragmentShader);
  const [, setCompileResult] = useState<ShaderCompileResult | null>(null);

  // Internal hardware probe used silently for automatic GPU acceleration & status icon
  const [hardwareReport, setHardwareReport] = useState<GpuHardwareReport | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [viewportDragOver, setViewportDragOver] = useState(false);
  const [, setStartupModelName] = useState<string | null>(null);
  const lastUploadedFileRef = useRef<File | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('vertice_studio_saved_poses_v1', JSON.stringify(savedPoses));
    } catch {
      // Ignore storage error
    }
  }, [savedPoses]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3200);
  }, []);

  useEffect(() => {
    void probeGpuHardware().then((report) => {
      setHardwareReport(report);
      if (report.webgpu.supported && report.webgpu.adapterAvailable) {
        setSettings((prev) =>
          prev.backend === 'webgpu' ? prev : { ...prev, backend: 'webgpu' }
        );
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 1179px)');
    const syncCompact = () => setIsCompactViewport(mq.matches);
    syncCompact();
    mq.addEventListener('change', syncCompact);
    return () => mq.removeEventListener('change', syncCompact);
  }, []);

  // Mede a altura real do dock inferior (timeline NLA / BottomDock, expandido ou recolhido)
  useEffect(() => {
    const el = bottomDockRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setBottomInset(Math.ceil(el.getBoundingClientRect().height));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isVfxSceneMode(settings.sceneMode)) {
      lastVfx3DModeRef.current = settings.sceneMode;
      setVfxTab((prev) => (prev === 'postfx' ? prev : settings.sceneMode as Vfx3DSceneMode));
    }
  }, [settings.sceneMode]);

  const handleUndo = useCallback(() => {
    const { undo, canUndo } = useSystemStore.getState();
    if (!canUndo()) return;
    undo();
    showNotice('Desfeito (Ctrl+Z)');
  }, [showNotice]);

  const handleRedo = useCallback(() => {
    const { redo, canRedo } = useSystemStore.getState();
    if (!canRedo()) return;
    redo();
    showNotice('Refeito (Ctrl+Y)');
  }, [showNotice]);

  const handleDeleteSelected = useCallback(() => {
    const removedName = threeEngineRef.current?.deleteSelectedObject();
    if (removedName) {
      showNotice(`Malha removida: ${removedName} (Ctrl+Z para desfazer)`);
    }
  }, [showNotice]);

  const handleDuplicateSelected = useCallback(() => {
    const createdName = threeEngineRef.current?.duplicateSelectedObject();
    if (createdName) {
      showNotice(`Objeto duplicado: ${createdName}`);
    }
  }, [showNotice]);

  const handleSaveProject = useCallback(
    (downloadFile = true) => {
      const json = threeEngineRef.current?.exportProjectJson();
      if (!json) return;
      let finalJson = json;
      try {
        const parsed = JSON.parse(json);
        parsed.savedPoses = savedPosesRef.current;
        finalJson = JSON.stringify(parsed, null, 2);
        localStorage.setItem('vertice_studio_project_v1', finalJson);
      } catch {
        // Ignore storage quota errors cleanly
      }
      if (downloadFile) {
        const blob = new Blob([finalJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vertice-studio-projeto.vertice.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('Projeto salvo (.vertice.json) e armazenado no navegador.');
      } else {
        showNotice('Projeto salvo localmente no navegador (Ctrl+S).');
      }
    },
    [showNotice]
  );

  const handleLoadProjectFile = useCallback(
    async (file: File) => {
      if (!threeEngineRef.current) return;
      try {
        const text = await file.text();
        const res = threeEngineRef.current.importProjectJson(text);
        if (res.ok && res.settings) {
          const rawParsed = JSON.parse(text) as { savedPoses?: SavedPosePreset[] };
          const normalizedSettings = deepMergeSettings(DEFAULT_SETTINGS, res.settings);
          if (normalizedSettings.sceneMode === 'sculpt') {
            normalizedSettings.sceneMode = 'gltf';
          }
          setSettings(normalizedSettings);
          setJointMarkersActive(false);
          setWeightPaint(DEFAULT_WEIGHT_PAINT);
          threeEngineRef.current.setWeightPaintSettings(DEFAULT_WEIGHT_PAINT);
          setStartupModelName(null);
          if (Array.isArray(rawParsed.savedPoses)) {
            setSavedPoses(rawParsed.savedPoses);
          } else {
            setSavedPoses([]);
          }
          setRigRevision((r) => r + 1);
        }
        showNotice(res.message);
      } catch {
        showNotice('Erro ao ler arquivo de projeto.');
      }
    },
    [showNotice]
  );

  const handleToggleRecordWebm = useCallback(() => {
    const engine = threeEngineRef.current;
    if (!engine) {
      showNotice('Gravação disponível no pipeline WebGL2.');
      return;
    }
    if (isRecording) {
      engine.stopTurntableRecording();
      setIsRecording(false);
      return;
    }
    const started = engine.startTurntableRecording(6, (blob, err) => {
      setIsRecording(false);
      if (err) {
        showNotice(err);
        return;
      }
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vertice-studio-turntable.webm';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice('Vídeo Turntable 360° (.webm) baixado.');
      }
    });
    if (started) {
      setIsRecording(true);
      showNotice('Gravando Turntable 360° (6s)... clique em Parar REC para finalizar.');
    }
  }, [isRecording, showNotice]);

  // Atalhos globais de cena: Ctrl+Z/Y/D/S, Delete, G/R/S/Q/F, 0/1/3/7, H, Esc
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        if (
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        if (target.tagName === 'INPUT') {
          const inputType = (target as HTMLInputElement).type.toLowerCase();
          const nonTextTypes = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset'];
          if (!nonTextTypes.includes(inputType)) {
            return;
          }
        }
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        handleSaveProject(false);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (pieMenuOpen) {
          setPieMenuOpen(false);
          return;
        }
        threeEngineRef.current?.clearSelection();
        setRightPanelMode('closed');
        return;
      }

      // Alt+A: reproduzir ou parar animação (padrão 3D)
      if (e.altKey && key === 'a') {
        e.preventDefault();
        setSettings((prev) => {
          const nextPlaying = !prev.animation.playing;
          showNotice(nextPlaying ? 'Reproduzindo animação (Alt+A)' : 'Animação pausada (Alt+A)');
          return {
            ...prev,
            animation: { ...prev.animation, playing: nextPlaying },
          };
        });
        return;
      }

      // Barra de espaço: reproduzir ou pausar animação (padrão 3D)
      if (e.code === 'Space') {
        if (e.repeat) return;
        if (target && target.tagName === 'BUTTON') return;
        e.preventDefault();
        setSettings((prev) => {
          const nextPlaying = !prev.animation.playing;
          showNotice(nextPlaying ? 'Reproduzindo animação (Espaço)' : 'Animação pausada (Espaço)');
          return {
            ...prev,
            animation: { ...prev.animation, playing: nextPlaying },
          };
        });
        return;
      }

      // Setas Esquerda / Direita: avançar ou retroceder quadros na timeline
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? -5 : -1;
        setSettings((prev) => {
          const start = prev.animation.frameStart ?? 1;
          const end = prev.animation.frameEnd ?? 60;
          const nextF = Math.max(start, Math.min(end, prev.animation.currentFrame + delta));
          return {
            ...prev,
            animation: { ...prev.animation, currentFrame: nextF },
          };
        });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        setSettings((prev) => {
          const start = prev.animation.frameStart ?? 1;
          const end = prev.animation.frameEnd ?? 60;
          const nextF = Math.max(start, Math.min(end, prev.animation.currentFrame + delta));
          return {
            ...prev,
            animation: { ...prev.animation, currentFrame: nextF },
          };
        });
        return;
      }

      // I ou K: inserir keyframe no quadro atual
      if (key === 'i' || key === 'k') {
        setSettings((prev) => {
          const cf = prev.animation.currentFrame;
          const existing = prev.animation.keyframes || [];
          if (!existing.includes(cf)) {
            const nextKf = [...existing, cf].sort((a, b) => a - b);
            showNotice(`Keyframe inserido no quadro ${cf}f (Tecla ${key.toUpperCase()}).`);
            return {
              ...prev,
              animation: { ...prev.animation, keyframes: nextKf },
            };
          } else {
            showNotice(`Quadro ${cf}f já possui keyframe.`);
            return prev;
          }
        });
        return;
      }

      // Atalhos de tecla única não disparam com Ctrl, Cmd ou Alt
      if (mod || e.altKey) return;

      if (key === 'g') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'translate', brush: 'camera' },
        }));
        showNotice('Modo Mover (G)');
        return;
      }
      if (key === 'r') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'rotate', brush: 'camera' },
        }));
        showNotice('Modo Rotacionar (R)');
        return;
      }
      if (key === 's') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'scale', brush: 'camera' },
        }));
        showNotice('Modo Escalar (S)');
        return;
      }
      if (key === 'q') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'orbit' },
        }));
        return;
      }
      if (key === 'f') {
        threeEngineRef.current?.focusSelectedObject();
        return;
      }
      if (e.key === '1') {
        threeEngineRef.current?.setCameraPreset('front');
        return;
      }
      if (e.key === '3') {
        threeEngineRef.current?.setCameraPreset('side');
        return;
      }
      if (e.key === '7') {
        threeEngineRef.current?.setCameraPreset('top');
        return;
      }
      if (e.key === '0') {
        threeEngineRef.current?.setCameraPreset('orbital');
        return;
      }
      if (key === 'h') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    pieMenuOpen,
    handleUndo,
    handleRedo,
    handleDeleteSelected,
    handleDuplicateSelected,
    handleSaveProject,
  ]);

  const webgpuSupported = Boolean(
    hardwareReport?.webgpu.supported && hardwareReport?.webgpu.adapterAvailable
  );

  // Use native WebGPU WGSL Compute engine when WebGPU + Instanced Particle Field is active (unless a custom GLB model is in the scene)
  const useNativeWebGPU =
    settings.backend === 'webgpu' &&
    settings.sceneMode === 'instanced' &&
    webgpuSupported &&
    !metrics.lodTelemetry.loadedModelName;

  // Mount & switch between ThreeStudioEngine (WebGL2) and NativeWebGPUParticleEngine (WebGPU WGSL)
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    let cancelled = false;

    const cleanupEngines = () => {
      if (threeEngineRef.current) {
        threeEngineRef.current.destroy();
        threeEngineRef.current = null;
      }
      if (webgpuEngineRef.current) {
        webgpuEngineRef.current.destroy();
        webgpuEngineRef.current = null;
      }
      setUndoCount(0);
      setRedoCount(0);
      setSelectedObject(null);
      setOutlinerItems([]);
      setRigBoneNames([]);
      setRightPanelMode((prev) => (prev === 'inspector' ? 'closed' : prev));
      setJointMarkersActive(false);
      setLiveRenderActive(false);
    };

    cleanupEngines();

    const mountThreeEngine = () => {
      if (cancelled) return;
      const engine = new ThreeStudioEngine(
        container,
        settingsRef.current,
        (nextMetrics) => setMetrics(nextMetrics),
        (lost) => setContextLost(lost),
        (sel) => {
          setSelectedObject(sel);
          if (sel) {
            setRightPanelMode('inspector');
            if (isCompactViewportRef.current) {
              setLeftPanelOpen(false);
              setSideUtilityPanel('none');
            }
          } else {
            setRightPanelMode((prev) => (prev === 'inspector' ? 'closed' : prev));
          }
        },
        undefined,
        (frame) => {
          setSettings((prev) =>
            prev.animation.currentFrame === frame
              ? prev
              : {
                  ...prev,
                  animation: { ...prev.animation, currentFrame: frame },
                }
          );
        },
        (nodeCount) => {
          setNodesMeshCount(nodeCount);
        },
        (uCount, rCount) => {
          setUndoCount(uCount);
          setRedoCount(rCount);
        },
        (items) => {
          setOutlinerItems(items);
        },
        (quat) => {
          setCameraQuaternion(quat);
        }
      );
      engine.setAutoOrbit(autoOrbitRef.current);
      engine.setAutoQuality(true);
      threeEngineRef.current = engine;

      void loadStartupModelFile().then(async (saved) => {
        if (cancelled || threeEngineRef.current !== engine) return;
        if (saved) {
          try {
            const info = await engine.loadGltfFile(saved.file, 'gltf', {
              autoRigIfStatic: saved.autoRigOnImport,
              rigType: 'biped',
            });
            if (cancelled) return;
            lastUploadedFileRef.current = saved.file;
            setStartupModelName(saved.file.name);
            setSettings((prev) => ({
              ...prev,
              sceneMode: info.clipCount > 0 || info.boneCount > 0 ? 'animation' : 'gltf',
              animation: {
                ...prev.animation,
                activeClipIndex: 0,
                poseSource: info.clipCount > 0 && !info.autoRigged ? 'clip' : 'procedural',
                showBones: info.autoRigged ? true : prev.animation.showBones,
              },
            }));
            setRigRevision((r) => r + 1);
            showNotice(`Modelo inicial carregado: ${info.name}`);
            return;
          } catch {
            // Ignore corrupted cached startup model cleanly
          }
        }

        try {
          const savedProject = localStorage.getItem('vertice_studio_project_v1');
          if (savedProject && !cancelled && threeEngineRef.current === engine) {
            const res = engine.importProjectJson(savedProject);
            if (res.ok && res.settings) {
              const parsed = JSON.parse(savedProject) as { savedPoses?: SavedPosePreset[] };
              const normalized = deepMergeSettings(DEFAULT_SETTINGS, res.settings);
              if (normalized.sceneMode === 'sculpt') normalized.sceneMode = 'gltf';
              setSettings(normalized);
              if (Array.isArray(parsed.savedPoses)) {
                setSavedPoses(parsed.savedPoses);
              }
              setRigRevision((r) => r + 1);
              showNotice('Projeto restaurado do armazenamento local.');
            }
          }
        } catch {
          // Ignore parse errors cleanly
        }
      });
    };

    if (useNativeWebGPU) {
      const gpuEngine = new NativeWebGPUParticleEngine(container, settingsRef.current, (nextMetrics) =>
        setMetrics(nextMetrics)
      );
      webgpuEngineRef.current = gpuEngine;
      void gpuEngine.init().then((ok) => {
        if (cancelled) {
          gpuEngine.destroy();
          return;
        }
        if (!ok) {
          gpuEngine.destroy();
          webgpuEngineRef.current = null;
          mountThreeEngine();
        }
      });
    } else {
      mountThreeEngine();
    }

    return () => {
      cancelled = true;
      cleanupEngines();
    };
    // Intentionally only remount when switching between WebGL2 & Native WebGPU particle pipeline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useNativeWebGPU]);

  // Sync live settings updates without remounting WebGL/WebGPU context
  useEffect(() => {
    threeEngineRef.current?.updateSettings(settings);
    webgpuEngineRef.current?.updateSettings(settings);
  }, [settings]);

  // Keep bone list synchronized for Weight Paint 3D whenever active rig changes
  useEffect(() => {
    const names = threeEngineRef.current?.getRigBoneNames() ?? [];
    setRigBoneNames(names);
    setWeightPaint((prev) => ({
      ...prev,
      active: names.length > 0 ? prev.active : false,
      selectedBoneName:
        names.length > 0 && names.includes(prev.selectedBoneName)
          ? prev.selectedBoneName
          : names[0] ?? '',
    }));
  }, [metrics.lodTelemetry.boneCount, metrics.lodTelemetry.loadedModelName, rigRevision]);

  const handleUpdateSettings = useCallback((patch: Partial<RenderSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateSculpt = useCallback((patch: Partial<SculptSettings>) => {
    setSettings((prev) => ({
      ...prev,
      sculpt: { ...prev.sculpt, ...patch },
    }));
  }, []);

  const handleUpdateAnimation = useCallback((patch: Partial<AnimationSettings>) => {
    setSettings((prev) => ({
      ...prev,
      animation: { ...prev.animation, ...patch },
    }));
  }, []);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    threeEngineRef.current?.setCameraPreset(preset);
    webgpuEngineRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleAutoOrbit = useCallback(() => {
    const next = !autoOrbitRef.current;
    setAutoOrbit(next);
    threeEngineRef.current?.setAutoOrbit(next);
  }, []);

  const handleCompileGlsl = useCallback(
    (vs: string, fs: string): ShaderCompileResult => {
      if (!threeEngineRef.current) {
        const res: ShaderCompileResult = {
          ok: false,
          stage: 'program',
          message: 'Alterne para o backend WebGL2 ou modo VFX -> Efeitos para aplicar.',
        };
        setCompileResult(res);
        return res;
      }
      const result = threeEngineRef.current.compileAndApplyGlsl(vs, fs);
      setCompileResult(result);
      if (result.ok) {
        setSettings((prev) => ({
          ...prev,
          sceneMode: 'shader',
          shaderDisabled: false,
          viewportShading: { ...prev.viewportShading, mode: 'pbr' },
        }));
      }
      return result;
    },
    []
  );

  const handleSelectShaderPreset = useCallback(
    (presetId: string) => {
      const preset = SHADER_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setVertexCode(preset.vertexShader);
      setFragmentCode(preset.fragmentShader);
      const res = handleCompileGlsl(preset.vertexShader, preset.fragmentShader);
      if (res.ok) {
        showNotice(`Visual "${preset.name}" aplicado ao vivo.`);
      }
    },
    [handleCompileGlsl, showNotice]
  );

  const handleResetToPbrFromShader = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      shaderDisabled: true,
      viewportShading: { ...prev.viewportShading, mode: 'pbr' },
    }));
    showNotice('Visual restaurado para PBR realista.');
  }, [showNotice]);

  const handleToggleLiveRender = useCallback(() => {
    const next = !liveRenderActiveRef.current;
    setLiveRenderActive(next);

    if (next) {
      liveRenderPrevRef.current = {
        postFxEnabled: settingsRef.current.postProcessing.enabled,
        bloomStrength: settingsRef.current.postProcessing.bloomStrength,
        bakeAo: settingsRef.current.viewportShading.bakeAo,
        showBones: settingsRef.current.animation.showBones,
      };
      threeEngineRef.current?.clearSelection();
      setSettings((s) => ({
        ...s,
        postProcessing: {
          ...s.postProcessing,
          enabled: true,
          bloomStrength: Math.min(0.26, Math.max(0.18, s.postProcessing.bloomStrength)),
        },
        viewportShading: {
          ...s.viewportShading,
          bakeAo: true,
        },
        animation: {
          ...s.animation,
          showBones: false,
        },
      }));
      showNotice('Render ao Vivo ativado: iluminação, sombras e Bloom em tempo real.');
    } else {
      const saved = liveRenderPrevRef.current;
      if (saved) {
        setSettings((s) => ({
          ...s,
          postProcessing: {
            ...s.postProcessing,
            enabled: saved.postFxEnabled,
            bloomStrength: saved.bloomStrength,
          },
          viewportShading: {
            ...s.viewportShading,
            bakeAo: saved.bakeAo,
          },
          animation: {
            ...s.animation,
            showBones: saved.showBones,
          },
        }));
      }
      showNotice('Render ao Vivo desativado.');
    }
  }, [showNotice]);

  const handleUploadGltf = useCallback(
    async (file: File) => {
      if (!threeEngineRef.current) {
        showNotice('Importação de modelos disponível no pipeline WebGL2.');
        return;
      }
      try {
        setJointMarkersActive(false);
        const info = await threeEngineRef.current.loadGltfFile(file, 'gltf', {
          autoRigIfStatic: false,
          rigType: 'biped',
        });
        lastUploadedFileRef.current = file;
        setSettings((prev) => ({
          ...prev,
          sceneMode:
            prev.sceneMode === 'shader'
              ? 'shader'
              : info.clipCount > 0 || info.boneCount > 0
                ? 'animation'
                : 'gltf',
          animation: {
            ...prev.animation,
            activeClipIndex: 0,
            poseSource: info.clipCount > 0 && !info.autoRigged ? 'clip' : 'procedural',
            showBones: info.autoRigged ? true : prev.animation.showBones,
          },
        }));
        setRigRevision((r) => r + 1);
        showNotice(
          `${info.name} importado (${info.meshes} malha(s), ${info.triangles.toLocaleString('pt-BR')} triângulos${
            info.boneCount > 0 ? `, ${info.boneCount} ossos` : ''
          }).`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Erro ao importar modelo 3D.');
      }
    },
    [showNotice]
  );

  const handleInsertRiggedHumanoid = useCallback(
    (goToAnimation = false) => {
      const res = threeEngineRef.current?.insertRiggedHumanoidModel();
      if (!res) return;
      setJointMarkersActive(false);
      setSettings((prev) => ({
        ...prev,
        sceneMode: goToAnimation ? 'animation' : prev.sceneMode,
        animation: {
          ...prev.animation,
          poseSource: 'procedural',
          showBones: true,
          enabled: true,
          playing: false,
          cycleMode: 'full_cycle',
        },
      }));
      setRigRevision((r) => r + 1);
      showNotice(
        `${res.name} inserido (${res.boneCount} ossos)! Pronto para todos os comandos.`
      );
    },
    [showNotice]
  );

  const handleExportSampleGlb = useCallback(
    async (profile?: RigExportProfile) => {
      if (!threeEngineRef.current || exportingGlb) return;
      try {
        setExportingGlb(true);
        const chosenProfile = profile ?? settings.animation.exportProfile;
        const blob = await threeEngineRef.current.exportSampleGlb(
          chosenProfile,
          multiClipExport ? MULTI_CLIP_EXPORT_ACTIONS : undefined
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vertice-studio-${chosenProfile}-blender53.glb`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice(
          `Arquivo vertice-studio-${chosenProfile}-blender53.glb exportado${
            multiClipExport ? ' com pacote Multi-Clipes NLA' : ''
          } (Blender 5.3+).`
        );
      } catch {
        showNotice('Não foi possível exportar o modelo GLB.');
      } finally {
        setExportingGlb(false);
      }
    },
    [exportingGlb, multiClipExport, settings.animation.exportProfile, showNotice]
  );

  const handleExportBlenderZip = useCallback(
    async (profile?: RigExportProfile) => {
      if (!threeEngineRef.current || exportingBlenderZip) return;
      try {
        setExportingBlenderZip(true);
        const chosenProfile = profile ?? settings.animation.exportProfile;
        await downloadBlender53Package(
          threeEngineRef.current,
          cameraQuaternion,
          {
            profile: chosenProfile,
            includeTransparentPreview: true,
            multiActions: multiClipExport ? MULTI_CLIP_EXPORT_ACTIONS : undefined,
          }
        );
        showNotice(
          `ZIP Completo Blender 5.3+ (.glb + cena_config.json + abrir_no_blender.py) exportado!`
        );
      } catch {
        showNotice('Não foi possível gerar o pacote .ZIP completo.');
      } finally {
        setExportingBlenderZip(false);
      }
    },
    [exportingBlenderZip, multiClipExport, settings.animation.exportProfile, showNotice, cameraQuaternion]
  );

  const handleCaptureFrame = useCallback(
    (transparentOverride?: boolean) => {
      const useTransparent = transparentOverride ?? transparentPng;
      const dataUrl = useTransparent
        ? (threeEngineRef.current?.captureFrame({
            transparentBg: true,
            resolution: captureResolution,
          }) ?? webgpuEngineRef.current?.captureFrame())
        : (webgpuEngineRef.current?.captureFrame() ??
          threeEngineRef.current?.captureFrame({
            transparentBg: false,
            resolution: captureResolution,
          }));
      if (!dataUrl) {
        showNotice('Aguarde o quadro renderizar para capturar.');
        return;
      }
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = useTransparent
        ? 'vertice-studio-quadro-transparente.png'
        : 'vertice-studio-quadro.png';
      a.click();
      showNotice(
        useTransparent
          ? `PNG transparente capturado (${captureResolution === 'viewport' ? 'Tela' : captureResolution}).`
          : `Quadro PNG capturado (${captureResolution === 'viewport' ? 'Tela' : captureResolution}).`
      );
    },
    [transparentPng, captureResolution, showNotice]
  );

  const handleExportFramesZip = useCallback(
    async (step = 1, transparentOverride?: boolean) => {
      if (!threeEngineRef.current) {
        showNotice('Exportação quadro a quadro disponível no pipeline WebGL2.');
        return;
      }
      if (exportingFramesLabel) return;
      const useTransparent = transparentOverride ?? transparentPng;
      const startFrame = settings.animation.frameStart;
      const endFrame = settings.animation.frameEnd;
      const totalEstimated = Math.max(1, Math.floor((endFrame - startFrame) / step) + 1);
      try {
        setExportingFramesLabel(`0/${totalEstimated}...`);
        const { blob, frameCount } = await threeEngineRef.current.exportAnimationFramesZip({
          startFrame,
          endFrame,
          step,
          transparentBg: useTransparent,
          resolution: captureResolution,
          turntable360,
          onProgress: (curr, total) => setExportingFramesLabel(`${curr}/${total}`),
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = useTransparent
          ? 'vertice-studio-quadros-transparente.zip'
          : 'vertice-studio-quadros.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice(
          `${frameCount} quadros PNG (${useTransparent ? 'fundo transparente' : 'com fundo'}${
            turntable360 ? ', giro 360°' : ''
          }) exportados em .ZIP!`
        );
      } catch {
        showNotice('Não foi possível exportar a sequência quadro a quadro.');
      } finally {
        setExportingFramesLabel(null);
      }
    },
    [
      exportingFramesLabel,
      transparentPng,
      settings.animation.frameStart,
      settings.animation.frameEnd,
      captureResolution,
      turntable360,
      showNotice,
    ]
  );

  const handleExportSpriteSheetZip = useCallback(
    async (step = 1, transparentOverride?: boolean) => {
      if (!threeEngineRef.current) {
        showNotice('Sprite Sheet disponível no pipeline WebGL2.');
        return;
      }
      if (exportingSpriteSheetLabel) return;
      const useTransparent = transparentOverride ?? transparentPng;
      const startFrame = settings.animation.frameStart;
      const endFrame = settings.animation.frameEnd;
      const totalEstimated = Math.max(1, Math.floor((endFrame - startFrame) / step) + 1);
      try {
        setExportingSpriteSheetLabel(`0/${totalEstimated}...`);
        const res = await threeEngineRef.current.exportSpriteSheetZip({
          startFrame,
          endFrame,
          step,
          transparentBg: useTransparent,
          resolution: captureResolution,
          turntable360,
          onProgress: (curr, total) => setExportingSpriteSheetLabel(`${curr}/${total}`),
        });
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vertice-studio-spritesheet.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showNotice(
          `Sprite Sheet ${res.cols}x${res.rows} (${res.sheetWidth}x${res.sheetHeight}px + JSON) exportado!`
        );
      } catch {
        showNotice('Não foi possível gerar o Sprite Sheet.');
      } finally {
        setExportingSpriteSheetLabel(null);
      }
    },
    [
      exportingSpriteSheetLabel,
      transparentPng,
      settings.animation.frameStart,
      settings.animation.frameEnd,
      captureResolution,
      turntable360,
      showNotice,
    ]
  );

  const handleCycleCompareMode = useCallback(() => {
    const prev = compareModeRef.current;
    const next: ViewportCompareMode =
      prev === 'off' ? 'split_normals' : prev === 'split_normals' ? 'wireframe_overlay' : 'off';
    setCompareMode(next);
    threeEngineRef.current?.setViewportCompareMode(next);
    showNotice(
      next === 'split_normals'
        ? 'Comparação 50/50 ativada: PBR à esquerda · Normais à direita.'
        : next === 'wireframe_overlay'
          ? 'Sobreposição Wireframe + PBR ativada.'
          : 'Modo de comparação desativado.'
    );
  }, [showNotice]);

  const handleRetargetMotionFile = useCallback(
    async (file: File) => {
      if (!threeEngineRef.current) return;
      try {
        const res = await threeEngineRef.current.retargetMotionClipsFromFile(file);
        setSettings((prev) => ({
          ...prev,
          animation: {
            ...prev.animation,
            poseSource: 'clip',
            playing: true,
            enabled: true,
            cycleMode: 'full_cycle',
            activeClipIndex: Math.max(0, metricsRef.current.lodTelemetry.loadedClips.length),
          },
        }));
        showNotice(
          `Retargeting concluído: ${res.clipCount} clipe(s) transferido(s) (${res.names[0]}).`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Erro ao transferir clipe de animação.');
      }
    },
    [showNotice]
  );

  const handleApplyCustomTexture = useCallback(
    async (slot: PbrTextureSlot, file: File) => {
      if (!threeEngineRef.current) return;
      try {
        const ok = await threeEngineRef.current.applyCustomTextureToSelected(slot, file);
        if (ok) {
          showNotice(`Textura (${slot}) aplicada ao material selecionado.`);
        } else {
          showNotice('Selecione uma malha com material PBR para aplicar textura.');
        }
      } catch {
        showNotice('Não foi possível carregar o arquivo de imagem.');
      }
    },
    [showNotice]
  );

  const handleClearCustomTextures = useCallback(() => {
    const ok = threeEngineRef.current?.clearCustomTexturesOnSelected();
    if (ok) {
      showNotice('Texturas PBR customizadas removidas do objeto selecionado.');
    }
  }, [showNotice]);

  const handleApplyNodeTemplate = useCallback(
    (template: ProceduralNodeTemplate) => {
      threeEngineRef.current?.applyProceduralNodeTemplate(template, true);
      showNotice('Template procedural aplicado na cena e no personagem.');
    },
    [showNotice]
  );

  const handleInstantiateCircular6x = useCallback(() => {
    threeEngineRef.current?.instantiateCircularArray6x();
    showNotice('Array Circular (6x Nodes) instanciado (Ctrl+Z para desfazer).');
  }, [showNotice]);

  const handleSnapToGround = useCallback(() => {
    const ok = threeEngineRef.current?.snapSelectedToGround();
    if (ok) {
      showNotice('Objeto alinhado ao piso (Y = 0).');
    } else {
      showNotice('Clique em qualquer objeto 3D da cena para alinhá-lo ao piso.');
    }
  }, [showNotice]);

  const handleSelectRailMode = useCallback(
    (mode: SceneMode) => {
      const targetMode = mode === 'nodes' ? lastVfx3DModeRef.current : mode;
      const isSameWorkspace =
        mode === 'nodes' ? isVfxSceneMode(settings.sceneMode) : mode === settings.sceneMode;

      const closeCompetingCompactPanels = () => {
        if (isCompactViewport) {
          setRightPanelMode('closed');
        }
      };

      if (vfxTab === 'postfx') {
        setVfxTab(lastVfx3DModeRef.current);
      }

      if (sideUtilityPanel !== 'none') {
        setSideUtilityPanel('none');
        setLeftPanelOpen(true);
        handleUpdateSettings({ sceneMode: targetMode });
        closeCompetingCompactPanels();
        return;
      }
      if (isSameWorkspace && vfxTab !== 'postfx') {
        const next = !leftPanelOpenRef.current;
        setLeftPanelOpen(next);
        if (next) closeCompetingCompactPanels();
      } else {
        handleUpdateSettings({ sceneMode: targetMode });
        setLeftPanelOpen(true);
        closeCompetingCompactPanels();
      }
    },
    [sideUtilityPanel, settings.sceneMode, vfxTab, isCompactViewport, handleUpdateSettings]
  );

  const handleToggleSideUtility = useCallback(
    (util: 'postfx' | 'lighting') => {
      if (util === 'postfx') {
        const alreadyShowingPostFx =
          leftPanelOpen && sideUtilityPanel === 'none' && vfxTab === 'postfx';
        if (alreadyShowingPostFx) {
          setLeftPanelOpen(false);
          setVfxTab(lastVfx3DModeRef.current);
          return;
        }
        setSideUtilityPanel('none');
        setVfxTab('postfx');
        setLeftPanelOpen(true);
        if (isCompactViewport) {
          setRightPanelMode('closed');
        }
        return;
      }

      setSideUtilityPanel((prev) => {
        const next = prev === util ? 'none' : util;
        if (next !== 'none') {
          setLeftPanelOpen(true);
          if (isCompactViewport) {
            setRightPanelMode('closed');
          }
        }
        return next;
      });
    },
    [leftPanelOpen, sideUtilityPanel, vfxTab, isCompactViewport]
  );

  const handleToggleOutliner = useCallback(() => {
    const next =
      rightPanelModeRef.current === 'outliner'
        ? (selectedObject ? 'inspector' : 'closed')
        : 'outliner';
    setRightPanelMode(next);
    if (next !== 'closed' && isCompactViewport) {
      setLeftPanelOpen(false);
      setSideUtilityPanel('none');
    }
  }, [selectedObject, isCompactViewport]);

  const handleApplyMaterialPreset = useCallback(
    (presetId: MaterialPresetId) => {
      const ok = threeEngineRef.current?.applyMaterialPresetToSelected(presetId);
      if (ok) {
        showNotice('Material PBR aplicado (Ctrl+Z para desfazer).');
      }
    },
    [showNotice]
  );

  const handlePieSelect = useCallback(
    (action: PieMenuActionId) => {
      if (action === 'action:live_render') {
        handleToggleLiveRender();
        return;
      }
      if (action === 'action:capture_png') {
        handleCaptureFrame();
        return;
      }
      const mode = action.replace('mode:', '') as SceneMode;
      handleSelectRailMode(mode);
    },
    [handleToggleLiveRender, handleCaptureFrame, handleSelectRailMode]
  );

  const leftPanelVisible = leftPanelOpen || sideUtilityPanel !== 'none';
  const gpuStatusLabel = `${metrics.activeBackendLabel} · ${metrics.fps} FPS (${metrics.frameTimeMs} ms)`;

  return (
    <div
      className="w-screen h-dvh bg-[#080a0f] text-slate-100 flex flex-col overflow-hidden select-none"
      onPointerMove={(e) => {
        lastPointerPosRef.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <TopBar
        sceneMode={settings.sceneMode}
        sidePanelOpen={leftPanelVisible && sideUtilityPanel === 'none'}
        liveRenderActive={liveRenderActive}
        gpuStatusLabel={gpuStatusLabel}
        isSoftwareRenderer={metrics.isSoftwareRenderer}
        onSelectWorkspace={handleSelectRailMode}
        onToggleLiveRender={handleToggleLiveRender}
        onCaptureFrame={() => handleCaptureFrame()}
        onSaveProject={() => handleSaveProject(true)}
        onLoadProjectFile={(file) => void handleLoadProjectFile(file)}
        onImportModelFile={(file) => void handleUploadGltf(file)}
        onExportGlb={() => void handleExportSampleGlb()}
      />

      <main
        className="relative flex-1 w-full h-full overflow-hidden"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setViewportDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) {
            setViewportDragOver(false);
          }
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setViewportDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && /\.(glb|gltf|zip)$/i.test(file.name)) {
            void handleUploadGltf(file);
          } else if (file && /\.json$/i.test(file.name)) {
            void handleLoadProjectFile(file);
          } else if (file) {
            showNotice('Formato não suportado. Use .glb, .gltf, .zip ou .vertice.json.');
          }
        }}
      >


        {/* Overlay ao arrastar .glb / .gltf / .zip sobre a cena */}
        {viewportDragOver && (
          <div className="fixed inset-0 z-40 pointer-events-none bg-[#080a0f]/80 flex items-center justify-center p-6">
            <div className="rounded-2xl border-2 border-dashed border-sky-400 bg-[#101521] px-8 py-6 text-center shadow-2xl">
              <p className="text-sm font-semibold text-white">
                Solte o arquivo .GLB, .GLTF, .ZIP ou .JSON para importar
              </p>
              <p className="text-xs text-slate-400 mt-1">
                O modelo ou projeto será carregado imediatamente no pipeline
              </p>
            </div>
          </div>
        )}

        {/* Trilho lateral esquerdo: Ferramentas de Transformação & Estúdio */}
        <LeftToolRail
          gizmoMode={settings.sculpt.gizmoMode}
          panelOpen={leftPanelVisible}
          sideUtilityPanel={sideUtilityPanel}
          postFxOpen={leftPanelOpen && sideUtilityPanel === 'none' && vfxTab === 'postfx'}
          outlinerOpen={rightPanelMode === 'outliner'}
          onChangeGizmoMode={(gizmoMode) => handleUpdateSculpt({ gizmoMode })}
          onToggleSideUtility={handleToggleSideUtility}
          onToggleOutliner={handleToggleOutliner}
          onToggleWorkspacePanel={() => {
            if (sideUtilityPanel !== 'none') {
              setSideUtilityPanel('none');
              setLeftPanelOpen(true);
              if (isCompactViewport) {
                setRightPanelMode('closed');
              }
            } else {
              setLeftPanelOpen((prev) => {
                const next = !prev;
                if (next && isCompactViewport) {
                  setRightPanelMode('closed');
                }
                return next;
              });
            }
          }}
        />

        {/* Gizmo de Orientação 3D no canto superior direito (padrão Blender / Maya) */}
        <CameraOrientationGizmo
          cameraQuaternion={cameraQuaternion}
          rightPanelOpen={
            rightPanelMode === 'outliner' ||
            (rightPanelMode === 'inspector' && Boolean(selectedObject))
          }
          onSelectPreset={handleCameraPreset}
        />

        {/* Outliner / Inspetor (painéis flutuantes à direita) */}
        {/* Outliner da Cena ou Inspetor Universal do Objeto */}
        {rightPanelMode === 'outliner' ? (
          <SceneOutlinerPanel
            items={outlinerItems}
            selectedUuid={selectedObject?.uuid ?? null}
            hasSelection={Boolean(selectedObject)}
            onSelectItem={(uuid) => {
              threeEngineRef.current?.selectObjectByUuid(uuid);
              setRightPanelMode('inspector');
            }}
            onToggleVisibility={(uuid) => {
              threeEngineRef.current?.toggleObjectVisibilityByUuid(uuid);
            }}
            onDeleteItem={(uuid) => {
              const removed = threeEngineRef.current?.deleteObjectByUuid(uuid);
              if (removed) {
                showNotice(`Malha removida: ${removed} (Ctrl+Z para desfazer)`);
              }
            }}
            onSwitchToInspector={() => setRightPanelMode('inspector')}
            onClose={() => setRightPanelMode('closed')}
          />
        ) : rightPanelMode === 'inspector' ? (
          <ObjectPropertiesPanel
            selected={selectedObject}
            gizmoMode={settings.sculpt.gizmoMode}
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onChangeGizmoMode={(gizmoMode) => handleUpdateSculpt({ gizmoMode })}
            onUpdateProperty={(patch) => threeEngineRef.current?.updateSelectedObjectProperty(patch)}
            onApplyMaterialPreset={handleApplyMaterialPreset}
            onApplyCustomTexture={(slot, file) => void handleApplyCustomTexture(slot, file)}
            onClearCustomTextures={handleClearCustomTextures}
            onFocusObject={() => threeEngineRef.current?.focusSelectedObject()}
            onSnapToGround={handleSnapToGround}
            onClearSelection={() => threeEngineRef.current?.clearSelection()}
            onDuplicateObject={handleDuplicateSelected}
            onDeleteObject={handleDeleteSelected}
            onOpenOutliner={() => setRightPanelMode('outliner')}
          />
        ) : null}

        {/* Linha inferior: hub de comandos + timeline (em fluxo, para o viewport poder reservar a altura real) */}
        <div
          ref={bottomDockRef}
          className="absolute bottom-0 right-0 left-11 sm:left-14 z-10"
        >
          <input
            ref={timelineRetargetInputRef}
            type="file"
            accept=".glb,.gltf,.zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleRetargetMotionFile(file);
              e.target.value = '';
            }}
          />
          {leftPanelVisible && (
            <AnimationTimelineDock
              collapsed={timelineCollapsed}
              onToggleCollapsed={() => setTimelineCollapsed((p) => !p)}
              animation={settings.animation}
              loadedClips={metrics.lodTelemetry.loadedClips}
              isRecording={isRecording}
              undoCount={undoCount}
              redoCount={redoCount}
              onUpdateAnimation={handleUpdateAnimation}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onToggleRecordWebm={handleToggleRecordWebm}
              onOpenRetargetPicker={() => timelineRetargetInputRef.current?.click()}
              onNotice={showNotice}
              onAddNlaStrip={(label, sourceType, actionCycle, clipIndex, startAt) => {
                const strips = settings.animation.nlaStrips ?? [];
                const lastEnd = strips.reduce((acc: number, s) => Math.max(acc, s.endFrame), 0);
                const startFrame = Math.max(1, startAt ?? (lastEnd > 0 ? lastEnd + 1 : settings.animation.frameStart ?? 1));
                const endFrame = startFrame + 24;
                const newStrip = {
                  id: `strip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  trackId: 'base',
                  label,
                  sourceType,
                  actionCycle,
                  clipIndex,
                  startFrame,
                  endFrame,
                };
                handleUpdateAnimation({
                  nlaStrips: [...strips, newStrip],
                  frameEnd: Math.max(settings.animation.frameEnd ?? 60, endFrame),
                  cycleMode: 'full_cycle',
                  enabled: true,
                });
              }}
              // Import & Export
              lodTelemetry={metrics.lodTelemetry}
              exportProfile={settings.animation.exportProfile}
              onChangeExportProfile={(exportProfile) => handleUpdateAnimation({ exportProfile })}
              onUploadFile={(file) => void handleUploadGltf(file)}
              onInsertRiggedHumanoid={() => handleInsertRiggedHumanoid(false)}
              onExportGlb={(profile) => void handleExportSampleGlb(profile)}
              onExportBlenderZip={(profile) => void handleExportBlenderZip(profile)}
              exportingGlb={exportingGlb}
              exportingBlenderZip={exportingBlenderZip}
              multiClipExport={multiClipExport}
              onToggleMultiClipExport={() => setMultiClipExport((p) => !p)}
              transparentPng={transparentPng}
              onToggleTransparentPng={() => setTransparentPng((p) => !p)}
              captureResolution={captureResolution}
              onChangeCaptureResolution={(res: string) => setCaptureResolution(res as ExportCaptureResolution)}
              turntable360={turntable360}
              onToggleTurntable360={() => setTurntable360((p) => !p)}
              onCaptureFrame={(t) => handleCaptureFrame(t)}
              onExportFramesZip={(step, t) => void handleExportFramesZip(step, t)}
              onExportSpriteSheetZip={(step, t) => void handleExportSpriteSheetZip(step, t)}
              exportingFramesLabel={exportingFramesLabel}
              exportingSpriteSheetLabel={exportingSpriteSheetLabel}
              // Materials & Camera (PBR Engine)
              finish={settings.finish}
              explosion={settings.explosion}
              speed={settings.speed}
              turbulence={settings.turbulence}
              frequency={settings.frequency}
              viewportShadingMode={settings.viewportShading.mode}
              onChangeFinish={(finish) => handleUpdateSettings({ finish })}
              onChangeExplosion={(v) => handleUpdateSettings({ explosion: v })}
              onChangeSpeed={(v) => handleUpdateSettings({ speed: v })}
              onChangeTurbulence={(v) => handleUpdateSettings({ turbulence: v })}
              onChangeFrequency={(v) => handleUpdateSettings({ frequency: v })}
              onChangeViewportShading={(mode) => handleUpdateSettings({ viewportShading: { ...settings.viewportShading, mode } })}
              onCameraPreset={handleCameraPreset}
              onRestoreGltfMaterials={() => {
                threeEngineRef.current?.restoreGltfOriginalMaterials();
                showNotice('Materiais originais do modelo restaurados.');
              }}
              loadedModelName={metrics.lodTelemetry.loadedModelName}
              // Render settings for PBR/VXF
              postProcessing={settings.postProcessing}
              lighting={settings.lighting}
              onUpdateSettings={handleUpdateSettings}
              // VFX Studio
              geometryNodes={settings.geometryNodes}
              onChangeGeometryNodes={(patch) => handleUpdateSettings({ geometryNodes: { ...settings.geometryNodes, ...patch } })}
              onChangeLightingPreset={(preset) => handleUpdateSettings({ lighting: { ...settings.lighting, preset } })}
              onChangeEnvIntensity={(v) => handleUpdateSettings({ lighting: { ...settings.lighting, envIntensity: v } })}
              onChangeEnvRotation={(v) => handleUpdateSettings({ lighting: { ...settings.lighting, envRotationDeg: v } })}
              onChangeShadowIntensity={(v) => handleUpdateSettings({ lighting: { ...settings.lighting, shadowIntensity: v } })}
              onChangeExposure={(v) => handleUpdateSettings({ lighting: { ...settings.lighting, exposure: v } })}
              onChangeBloomStrength={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, bloomStrength: v } })}
              onChangeGrainAmount={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, grainAmount: v } })}
              onChangeChromaticAmount={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, chromaticAmount: v } })}
              onChangeDofEnabled={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, dofEnabled: v } })}
              onChangeDofFocus={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, dofFocus: v } })}
              onChangePostFxEnabled={(v) => handleUpdateSettings({ postProcessing: { ...settings.postProcessing, enabled: v } })}
              onChangeInstanceCount={(v) => handleUpdateSettings({ instanceCount: v })}
              instanceCount={settings.instanceCount}
              onTriggerPhysicsImpulse={() => threeEngineRef.current?.triggerPhysicsImpulse()}
              onSelectVfxSubMode={(mode) => {
                setVfxTab(mode as any);
                if (mode !== 'postfx') handleUpdateSettings({ sceneMode: mode as SceneMode });
              }}
              onApplyTemplate={(template) => {
                handleApplyNodeTemplate(template);
                showNotice('Template procedural aplicado na cena e no personagem.');
              }}
              onInstantiateCircular6x={() => {
                handleInstantiateCircular6x();
                showNotice('Array Circular (6x Nodes) instanciado (Ctrl+Z para desfazer).');
              }}
              onSelectShaderPreset={handleSelectShaderPreset}
              onResetToPbrFromShader={handleResetToPbrFromShader}
              onToggleLiveRender={handleToggleLiveRender}
              liveRenderActive={liveRenderActive}
              sceneMode={settings.sceneMode}
              onChangeSceneMode={(mode) => handleUpdateSettings({ sceneMode: mode as SceneMode })}
              vfxTab={vfxTab}
              onChangeVfxTab={(tab) => setVfxTab(tab as any)}
            />

          )}
        </div>

        {/* Barra do viewport (shading, snap, REC…): flutua logo acima do dock */}
        {settings.sceneMode !== 'animation' && (
              <BottomDock
                bottomOffset={bottomInset}
                collapsed={dockCollapsed}
                onToggleCollapsed={() => setDockCollapsed((p) => !p)}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                compareMode={compareMode}
                onCycleCompareMode={handleCycleCompareMode}
                autoOrbit={autoOrbit}
                onToggleAutoOrbit={handleToggleAutoOrbit}
                hasSelection={Boolean(selectedObject)}
                isRecording={isRecording}
                transparentPng={transparentPng}
                exportingFramesLabel={exportingFramesLabel}
                onToggleTransparentPng={() => setTransparentPng((p) => !p)}
                onExportFramesZip={() => void handleExportFramesZip(1, transparentPng)}
                onToggleRecordWebm={handleToggleRecordWebm}
                onSnapToGround={handleSnapToGround}
                onFocusObject={() => threeEngineRef.current?.focusSelectedObject()}
                onUndo={handleUndo}
                onRedo={handleRedo}
                undoCount={undoCount}
                redoCount={redoCount}
              />
        )}

        {/* Notificação discreta */}
        {notice && (
          <div className="fixed top-15 sm:top-[68px] left-1/2 -translate-x-1/2 z-30 bg-[#141c2c] border border-sky-400/35 text-slate-100 text-xs px-3.5 sm:px-4 py-2 rounded-xl shadow-xl max-w-[calc(100vw-6rem)] text-center">
            {notice}
          </div>
        )}

        {/* Aviso se contexto WebGL for perdido */}
        {contextLost && (
          <div className="fixed inset-0 z-40 bg-[#080a0f]/90 flex items-center justify-center p-6">
            <div className="bg-[#101521] border border-amber-400/40 rounded-2xl p-6 max-w-md text-center">
              <h2 className="text-base font-semibold text-white">Contexto GPU interrompido</h2>
              <p className="text-xs text-slate-300 mt-2">
                O navegador suspendeu temporariamente o contexto WebGL2. A restauração automática
                está em andamento.
              </p>
            </div>
          </div>
        )}

        {/* Menu Radial Rápido (Espaço) */}
        <RadialPieMenu
          open={pieMenuOpen}
          position={pieMenuPos}
          currentMode={settings.sceneMode}
          liveRenderActive={liveRenderActive}
          onSelect={handlePieSelect}
          onClose={() => setPieMenuOpen(false)}
        />
      </main>
    </div>
  );
}
