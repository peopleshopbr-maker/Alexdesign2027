import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimationSidebar } from './components/AnimationSidebar';
import { AnimationTimelineDock } from './components/AnimationTimelineDock';
import { BottomDock } from './components/BottomDock';
import { CameraOrientationGizmo } from './components/CameraOrientationGizmo';
import {
  GeometryNodesSidebar,
  type Vfx3DSceneMode,
  type VfxSubMode,
} from './components/GeometryNodesSidebar';
import { GltfImportSidebar } from './components/GltfImportSidebar';
import { LeftToolRail } from './components/LeftToolRail';
import { ObjectPropertiesPanel } from './components/ObjectPropertiesPanel';
import { RadialPieMenu, type PieMenuActionId } from './components/RadialPieMenu';
import { SceneModeSidebar } from './components/SceneModeSidebar';
import { SceneOutlinerPanel } from './components/SceneOutlinerPanel';
import { TopBar } from './components/TopBar';
import { probeGpuHardware } from './graphics/gpuProbe';
import { SHADER_PRESETS } from './graphics/shaders';
import { ThreeStudioEngine } from './graphics/threeStudioEngine';
import { NativeWebGPUParticleEngine } from './graphics/webgpuParticleEngine';
import {
  clearStartupModelFile,
  loadStartupModelFile,
  saveStartupModelFile,
} from './utils/startupModelStore';
import type {
  AnimationActionCycle,
  AnimationSettings,
  AutoRigPreset,
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

const isVfxSceneMode = (mode: SceneMode): mode is Vfx3DSceneMode =>
  mode === 'nodes' || mode === 'physics' || mode === 'instanced' || mode === 'shader';

const MULTI_CLIP_EXPORT_ACTIONS: AnimationActionCycle[] = [
  'idle',
  'walk',
  'run',
  'jump',
  'slash',
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
  playing: true,
  cycleMode: 'full_cycle',
  action: 'walk',
  composeEnabled: false,
  upperBodyAction: 'none',
  inPlace: false,
  propType: 'none',
  exportProfile: 'standard',
  appeal: 'neutral',
  squashStretch: 35,
  anticipation: 30,
  staging: 'default',
  method: 'straight_ahead',
  followThrough: 35,
  exaggeration: 1.0,
  easing: 'slow_in_out',
  arcs: 40,
  motionTrail: true,
  secondaryAction: 'breathing',
  timing: 1.0,
  solidDrawing: 25,
  fpsCadence: 30,
  currentFrame: 1,
  frameStart: 1,
  frameEnd: 60,
  autoKey: false,
  nlaStrips: [],
  rotationMode: 'quaternion',
  physicsEnabled: false,
  keyframes: [1],
  activeClipIndex: 0,
  poseSource: 'procedural',
  showBones: false,
  poseOverrides: {},
  ikTargets: {
    leftHand: { enabled: false, offset: [0, 0, 0] },
    rightHand: { enabled: false, offset: [0, 0, 0] },
    leftFoot: { enabled: false, offset: [0, 0, 0] },
    rightFoot: { enabled: false, offset: [0, 0, 0] },
  },
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

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const threeEngineRef = useRef<ThreeStudioEngine | null>(null);
  const webgpuEngineRef = useRef<NativeWebGPUParticleEngine | null>(null);

  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS);
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
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const timelineRetargetInputRef = useRef<HTMLInputElement>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [sideUtilityPanel, setSideUtilityPanel] = useState<'none' | 'postfx' | 'lighting'>('none');
  const [rightPanelMode, setRightPanelMode] = useState<'closed' | 'inspector' | 'outliner'>('closed');
  const [outlinerItems, setOutlinerItems] = useState<SceneOutlinerItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SelectedObjectInfo | null>(null);
  const [cameraQuaternion, setCameraQuaternion] = useState<[number, number, number, number]>([
    0, 0, 0, 1,
  ]);
  const [pieMenuOpen, setPieMenuOpen] = useState(false);
  const [pieMenuPos, setPieMenuPos] = useState({ x: 640, y: 360 });
  const lastPointerPosRef = useRef({ x: 640, y: 360 });

  const [nodesMeshCount, setNodesMeshCount] = useState(2);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [jointMarkersActive, setJointMarkersActive] = useState(false);
  const [jointMarkerSymmetry, setJointMarkerSymmetry] = useState(true);
  const [liveRenderActive, setLiveRenderActive] = useState(false);
  const [transparentPng, setTransparentPng] = useState(true);
  const [captureResolution, setCaptureResolution] = useState<ExportCaptureResolution>('viewport');
  const [turntable360, setTurntable360] = useState(false);
  const [multiClipExport, setMultiClipExport] = useState(false);
  const [compareMode, setCompareMode] = useState<ViewportCompareMode>('off');
  const [exportingFramesLabel, setExportingFramesLabel] = useState<string | null>(null);
  const [exportingSpriteSheetLabel, setExportingSpriteSheetLabel] = useState<string | null>(null);
  const [exportingBlenderZip, setExportingBlenderZip] = useState(false);
  const [exportingGlb, setExportingGlb] = useState(false);
  const [rigBoneNames, setRigBoneNames] = useState<string[]>([]);
  const [weightPaint, setWeightPaint] = useState<WeightPaintSettings>(DEFAULT_WEIGHT_PAINT);
  const [savedPoses, setSavedPoses] = useState<SavedPosePreset[]>([]);
  const liveRenderPrevRef = useRef<{
    postFxEnabled: boolean;
    bakeAo: boolean;
    showBones: boolean;
  } | null>(null);

  const [glslExpandSignal, setGlslExpandSignal] = useState(0);
  const [vertexCode, setVertexCode] = useState(SHADER_PRESETS[0].vertexShader);
  const [fragmentCode, setFragmentCode] = useState(SHADER_PRESETS[0].fragmentShader);
  const [compileResult, setCompileResult] = useState<ShaderCompileResult | null>(null);

  // Internal hardware probe used silently for automatic GPU acceleration & status icon
  const [hardwareReport, setHardwareReport] = useState<GpuHardwareReport | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [viewportDragOver, setViewportDragOver] = useState(false);
  const [autoRigOnImport, setAutoRigOnImport] = useState(false);
  const [startupModelName, setStartupModelName] = useState<string | null>(null);
  const lastUploadedFileRef = useRef<File | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (isVfxSceneMode(settings.sceneMode)) {
      lastVfx3DModeRef.current = settings.sceneMode;
      setVfxTab((prev) => (prev === 'postfx' ? prev : settings.sceneMode as Vfx3DSceneMode));
    }
  }, [settings.sceneMode]);

  const handleUndo = useCallback(() => {
    const res = threeEngineRef.current?.undoScene();
    if (res?.ok) {
      showNotice(`Desfeito: ${res.label}`);
    }
  }, [showNotice]);

  const handleRedo = useCallback(() => {
    const res = threeEngineRef.current?.redoScene();
    if (res?.ok) {
      showNotice(`Refeito: ${res.label}`);
    }
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
      try {
        localStorage.setItem('vertice_studio_project_v1', json);
      } catch {
        // Ignore storage quota errors cleanly
      }
      if (downloadFile) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vertice-studio-projeto.vertice.json';
        a.click();
        URL.revokeObjectURL(url);
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
          const normalizedSettings: RenderSettings = {
            ...res.settings,
            sceneMode: res.settings.sceneMode === 'sculpt' ? 'gltf' : res.settings.sceneMode,
            animation: {
              ...DEFAULT_ANIMATION,
              ...res.settings.animation,
              ikTargets: {
                ...DEFAULT_ANIMATION.ikTargets,
                ...(res.settings.animation?.ikTargets ?? {}),
              },
              poseOverrides: res.settings.animation?.poseOverrides ?? {},
            },
          };
          setSettings(normalizedSettings);
          setJointMarkersActive(false);
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
        URL.revokeObjectURL(url);
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
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
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
      if (e.code === 'Space') {
        e.preventDefault();
        setPieMenuPos(lastPointerPosRef.current);
        setPieMenuOpen((prev) => !prev);
        return;
      }
      if (key === 'g') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'translate', brush: 'camera' },
        }));
        return;
      }
      if (key === 'r') {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'rotate', brush: 'camera' },
        }));
        return;
      }
      if (key === 's' && !mod) {
        setSettings((prev) => ({
          ...prev,
          sculpt: { ...prev.sculpt, gizmoMode: 'scale', brush: 'camera' },
        }));
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
    };

    cleanupEngines();

    const mountThreeEngine = () => {
      if (cancelled) return;
      const engine = new ThreeStudioEngine(
        container,
        settings,
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
      engine.setAutoOrbit(autoOrbit);
      engine.setAutoQuality(true);
      threeEngineRef.current = engine;

      void loadStartupModelFile().then(async (saved) => {
        if (cancelled || !saved || threeEngineRef.current !== engine) return;
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
          showNotice(`Modelo inicial carregado: ${info.name}`);
        } catch {
          // Ignore corrupted cached startup model cleanly
        }
      });
    };

    if (useNativeWebGPU) {
      const gpuEngine = new NativeWebGPUParticleEngine(container, settings, (nextMetrics) =>
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
  }, [metrics.lodTelemetry.boneCount, metrics.lodTelemetry.loadedModelName]);

  const handleUpdateSettings = useCallback((patch: Partial<RenderSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateSculpt = useCallback((patch: Partial<SculptSettings>) => {
    setSettings((prev) => ({
      ...prev,
      sculpt: { ...prev.sculpt, ...patch },
    }));
  }, []);

  const handleUpdateGeometryNodes = useCallback((patch: Partial<GeometryNodesSettings>) => {
    setSettings((prev) => ({
      ...prev,
      geometryNodes: { ...prev.geometryNodes, ...patch },
    }));
  }, []);

  const handleUpdateAnimation = useCallback((patch: Partial<AnimationSettings>) => {
    setSettings((prev) => ({
      ...prev,
      animation: { ...prev.animation, ...patch },
    }));
  }, []);

  const handleResetAnimation = useCallback(() => {
    threeEngineRef.current?.resetAnimationTrail();
    setSettings((prev) => ({
      ...prev,
      animation: { ...DEFAULT_ANIMATION },
    }));
  }, []);

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    threeEngineRef.current?.setCameraPreset(preset);
    webgpuEngineRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleAutoOrbit = useCallback(() => {
    setAutoOrbit((prev) => {
      const next = !prev;
      threeEngineRef.current?.setAutoOrbit(next);
      return next;
    });
  }, []);

  const handleOpenGlslInVfx = useCallback(() => {
    lastVfx3DModeRef.current = 'shader';
    setVfxTab('shader');
    setSideUtilityPanel('none');
    setLeftPanelOpen(true);
    setGlslExpandSignal((n) => n + 1);
    if (isCompactViewport) {
      setRightPanelMode('closed');
    }
    setSettings((prev) => ({
      ...prev,
      sceneMode: 'shader',
      shaderDisabled: false,
      viewportShading: { ...prev.viewportShading, mode: 'pbr' },
    }));
  }, [isCompactViewport]);

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
    setLiveRenderActive((prev) => {
      const next = !prev;
      if (next) {
        liveRenderPrevRef.current = {
          postFxEnabled: settings.postProcessing.enabled,
          bakeAo: settings.viewportShading.bakeAo,
          showBones: settings.animation.showBones,
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
      return next;
    });
  }, [
    settings.postProcessing.enabled,
    settings.viewportShading.bakeAo,
    settings.animation.showBones,
    showNotice,
  ]);

  const handleUploadGltf = useCallback(
    async (file: File) => {
      if (!threeEngineRef.current) {
        showNotice('Importação de modelos disponível no pipeline WebGL2.');
        return;
      }
      try {
        setJointMarkersActive(false);
        const info = await threeEngineRef.current.loadGltfFile(file, 'gltf', {
          autoRigIfStatic: autoRigOnImport,
          rigType: 'biped',
        });
        lastUploadedFileRef.current = file;
        void saveStartupModelFile(file, autoRigOnImport)
          .then(() => setStartupModelName(file.name))
          .catch(() => {});
        setSettings((prev) => ({
          ...prev,
          sceneMode: prev.sceneMode === 'shader' ? 'shader' : 'gltf',
          animation: {
            ...prev.animation,
            activeClipIndex: 0,
            poseSource: info.clipCount > 0 && !info.autoRigged ? 'clip' : 'procedural',
            showBones: info.autoRigged ? true : prev.animation.showBones,
          },
        }));
        showNotice(
          `${info.name} importado e salvo como modelo inicial (${info.meshes} malha(s), ${info.triangles.toLocaleString('pt-BR')} triângulos${
            info.boneCount > 0 ? `, ${info.boneCount} ossos` : ''
          }).`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Erro ao importar modelo 3D.');
      }
    },
    [showNotice, autoRigOnImport]
  );

  const handlePinStartupModel = useCallback(async () => {
    const engine = threeEngineRef.current;
    const activeName = metricsRef.current.lodTelemetry.loadedModelName;
    if (!engine || !activeName) {
      showNotice('Importe ou insira um modelo antes de fixá-lo como inicial.');
      return;
    }
    try {
      let fileToSave = lastUploadedFileRef.current;
      if (!fileToSave || fileToSave.name !== activeName) {
        const blob = await engine.exportSampleGlb(settings.animation.exportProfile);
        fileToSave = new File([blob], activeName, { type: 'model/gltf-binary' });
        lastUploadedFileRef.current = fileToSave;
      }
      await saveStartupModelFile(fileToSave, autoRigOnImport);
      setStartupModelName(activeName);
      showNotice(`${activeName} fixado! Abrirá automaticamente ao iniciar o site.`);
    } catch {
      showNotice('Não foi possível salvar este modelo como inicial no navegador.');
    }
  }, [autoRigOnImport, settings.animation.exportProfile, showNotice]);

  const handleClearStartupModel = useCallback(async () => {
    await clearStartupModelFile();
    setStartupModelName(null);
    showNotice('Modelo inicial removido. Próxima abertura usará o exemplo padrão.');
  }, [showNotice]);

  const handleAutoRigLoadedGltf = useCallback(
    (rigType: AutoRigPreset = 'biped') => {
      const res = threeEngineRef.current?.autoRigLoadedGltf(rigType);
      if (!res) {
        showNotice('Importe ou insira um modelo 3D antes de aplicar Auto-Rigging.');
        return;
      }
      setJointMarkersActive(false);
      setSettings((prev) => ({
        ...prev,
        animation: {
          ...prev.animation,
          poseSource: 'procedural',
          showBones: true,
          enabled: true,
          playing: true,
          cycleMode: 'full_cycle',
        },
      }));
      showNotice(
        `Auto-Rigging concluído (${res.boneCount} ossos)! Use os comandos em Animação 3D.`
      );
    },
    [showNotice]
  );

  const handleStartJointMarkers = useCallback(() => {
    const ok = threeEngineRef.current?.startJointMarkerRigging();
    if (!ok) {
      showNotice('Importe ou insira um modelo 3D antes de posicionar marcadores.');
      return;
    }
    threeEngineRef.current?.setJointMarkerSymmetry(jointMarkerSymmetry);
    setJointMarkersActive(true);
    setSettings((prev) => ({
      ...prev,
      sculpt: { ...prev.sculpt, gizmoMode: 'translate' },
    }));
    showNotice('Arraste as esferas (juntas) com o Gizmo 3D e clique em Gerar Skeleton.');
  }, [jointMarkerSymmetry, showNotice]);

  const handleCommitJointMarkers = useCallback(() => {
    const res = threeEngineRef.current?.commitJointMarkerRigging();
    setJointMarkersActive(false);
    if (!res) {
      showNotice('Não foi possível gerar o esqueleto pelos marcadores.');
      return;
    }
    setSettings((prev) => ({
      ...prev,
      animation: {
        ...prev.animation,
        poseSource: 'procedural',
        showBones: true,
        enabled: true,
        playing: true,
        cycleMode: 'full_cycle',
      },
    }));
    showNotice(`Skeleton gerado pelos marcadores (${res.boneCount} ossos)!`);
  }, [showNotice]);

  const handleCancelJointMarkers = useCallback(() => {
    threeEngineRef.current?.cancelJointMarkerRigging();
    setJointMarkersActive(false);
    showNotice('Posicionamento de marcadores cancelado.');
  }, [showNotice]);

  const handleToggleJointMarkerSymmetry = useCallback(() => {
    setJointMarkerSymmetry((prev) => {
      const next = !prev;
      threeEngineRef.current?.setJointMarkerSymmetry(next);
      return next;
    });
  }, []);

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
          playing: true,
          cycleMode: 'full_cycle',
        },
      }));
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
        URL.revokeObjectURL(url);
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
        const blob = await threeEngineRef.current.exportBlenderCompleteZip(
          chosenProfile,
          true,
          multiClipExport ? MULTI_CLIP_EXPORT_ACTIONS : undefined
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vertice-studio-${chosenProfile}-blender53-completo.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showNotice(
          `ZIP Completo Blender 5.3+ (.glb + .py + .json + PNG transp.) exportado!`
        );
      } catch {
        showNotice('Não foi possível gerar o pacote .ZIP completo.');
      } finally {
        setExportingBlenderZip(false);
      }
    },
    [exportingBlenderZip, multiClipExport, settings.animation.exportProfile, showNotice]
  );

  const handleCaptureFrame = useCallback(
    (transparentOverride?: boolean) => {
      const useTransparent = transparentOverride ?? transparentPng;
      const dataUrl = useTransparent
        ? threeEngineRef.current?.captureFrame({
            transparentBg: true,
            resolution: captureResolution,
          })
        : webgpuEngineRef.current?.captureFrame() ??
          threeEngineRef.current?.captureFrame({
            transparentBg: false,
            resolution: captureResolution,
          });
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
      const useTransparent = transparentOverride ?? true;
      try {
        setExportingFramesLabel('0/60...');
        const { blob, frameCount } = await threeEngineRef.current.exportAnimationFramesZip({
          startFrame: 1,
          endFrame: 60,
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
        URL.revokeObjectURL(url);
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
    [exportingFramesLabel, captureResolution, turntable360, showNotice]
  );

  const handleExportSpriteSheetZip = useCallback(
    async (step = 1, transparentOverride?: boolean) => {
      if (!threeEngineRef.current) {
        showNotice('Sprite Sheet disponível no pipeline WebGL2.');
        return;
      }
      if (exportingSpriteSheetLabel) return;
      const useTransparent = transparentOverride ?? transparentPng;
      try {
        setExportingSpriteSheetLabel('0/60...');
        const res = await threeEngineRef.current.exportSpriteSheetZip({
          startFrame: 1,
          endFrame: 60,
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
        URL.revokeObjectURL(url);
        showNotice(
          `Sprite Sheet ${res.cols}x${res.rows} (${res.sheetWidth}x${res.sheetHeight}px + JSON) exportado!`
        );
      } catch {
        showNotice('Não foi possível gerar o Sprite Sheet.');
      } finally {
        setExportingSpriteSheetLabel(null);
      }
    },
    [exportingSpriteSheetLabel, transparentPng, captureResolution, turntable360, showNotice]
  );

  const handleCycleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      const next: ViewportCompareMode =
        prev === 'off' ? 'split_normals' : prev === 'split_normals' ? 'wireframe_overlay' : 'off';
      threeEngineRef.current?.setViewportCompareMode(next);
      showNotice(
        next === 'split_normals'
          ? 'Comparação 50/50 ativada: PBR à esquerda · Normais à direita.'
          : next === 'wireframe_overlay'
            ? 'Sobreposição Wireframe + PBR ativada.'
            : 'Modo de comparação desativado.'
      );
      return next;
    });
  }, [showNotice]);

  const handleUpdateWeightPaint = useCallback(
    (patch: Partial<WeightPaintSettings>) => {
      setWeightPaint((prev) => {
        const next = { ...prev, ...patch };
        const ok = threeEngineRef.current?.setWeightPaintSettings(next) ?? false;
        if (patch.active === true && !ok) {
          showNotice('Carregue ou aplique Auto-Rig em uma malha SkinnedMesh antes de ativar o Heatmap.');
          return { ...next, active: false };
        }
        return next;
      });
    },
    [showNotice]
  );

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

  const handleSaveCustomPose = useCallback(
    (name: string) => {
      const id = `pose_${Date.now()}`;
      const overridesCopy: Record<string, [number, number, number]> = {};
      for (const [k, v] of Object.entries(settings.animation.poseOverrides)) {
        overridesCopy[k] = [v[0], v[1], v[2]];
      }
      setSavedPoses((prev) => [...prev, { id, name, overrides: overridesCopy }]);
      showNotice(`Pose "${name}" salva na biblioteca rápida.`);
    },
    [settings.animation.poseOverrides, showNotice]
  );

  const handleApplyPoseOverrides = useCallback(
    (overrides: Record<string, [number, number, number]>, label?: string) => {
      const copied: Record<string, [number, number, number]> = {};
      for (const [k, v] of Object.entries(overrides)) {
        copied[k] = [v[0], v[1], v[2]];
      }
      setSettings((prev) => ({
        ...prev,
        animation: {
          ...prev.animation,
          poseSource: 'procedural',
          cycleMode: 'static',
          playing: false,
          poseOverrides: copied,
        },
      }));
      if (label) {
        showNotice(`Pose aplicada: ${label}.`);
      }
    },
    [showNotice]
  );



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

      if (mode !== 'nodes' && vfxTab === 'postfx') {
        setVfxTab(lastVfx3DModeRef.current);
      } else if (mode === 'nodes' && vfxTab === 'postfx') {
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
        setLeftPanelOpen((prev) => {
          const next = !prev;
          if (next) closeCompetingCompactPanels();
          return next;
        });
      } else {
        handleUpdateSettings({ sceneMode: targetMode });
        setLeftPanelOpen(true);
        closeCompetingCompactPanels();
      }
    },
    [sideUtilityPanel, settings.sceneMode, vfxTab, isCompactViewport, handleUpdateSettings]
  );

  const handleSelectVfxSubMode = useCallback(
    (subMode: VfxSubMode) => {
      setVfxTab(subMode);
      setSideUtilityPanel('none');
      setLeftPanelOpen(true);
      if (isCompactViewport) {
        setRightPanelMode('closed');
      }
      if (subMode !== 'postfx') {
        lastVfx3DModeRef.current = subMode;
        handleUpdateSettings({ sceneMode: subMode });
      }
    },
    [isCompactViewport, handleUpdateSettings]
  );

  const handleSelectBackgroundVfxLayer = useCallback(
    (layer: Vfx3DSceneMode) => {
      lastVfx3DModeRef.current = layer;
      handleUpdateSettings({ sceneMode: layer });
    },
    [handleUpdateSettings]
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
    setRightPanelMode((prev) => {
      const next = prev === 'outliner' ? (selectedObject ? 'inspector' : 'closed') : 'outliner';
      if (next !== 'closed' && isCompactViewport) {
        setLeftPanelOpen(false);
        setSideUtilityPanel('none');
      }
      return next;
    });
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
        className="relative flex-1 w-full overflow-hidden"
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
        {/* Viewport WebGL2 / WebGPU em tela cheia */}
        <div ref={viewportRef} className="w-full h-full" />

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

        {/* Painel lateral contextual recolhível */}
        {leftPanelVisible &&
          (sideUtilityPanel !== 'none' ? (
            <SceneModeSidebar
              settings={settings}
              utilityPanel={sideUtilityPanel}
              onUpdateSettings={handleUpdateSettings}
              onCameraPreset={handleCameraPreset}
              onTriggerPhysicsImpulse={() => threeEngineRef.current?.triggerPhysicsImpulse()}
              onOpenGlslEditor={handleOpenGlslInVfx}
              onClose={() => {
                setSideUtilityPanel('none');
                setLeftPanelOpen(false);
              }}
            />
          ) : settings.sceneMode === 'gltf' ? (
            <GltfImportSidebar
              lodTelemetry={metrics.lodTelemetry}
              exportProfile={settings.animation.exportProfile}
              startupModelName={startupModelName}
              transparentPng={transparentPng}
              captureResolution={captureResolution}
              turntable360={turntable360}
              multiClipExport={multiClipExport}
              exportingFramesLabel={exportingFramesLabel}
              exportingSpriteSheetLabel={exportingSpriteSheetLabel}
              exportingBlenderZip={exportingBlenderZip}
              exportingGlb={exportingGlb}
              onChangeExportProfile={(exportProfile) => handleUpdateAnimation({ exportProfile })}
              onChangeCaptureResolution={setCaptureResolution}
              onToggleTurntable360={() => setTurntable360((p) => !p)}
              onToggleMultiClipExport={() => setMultiClipExport((p) => !p)}
              onUploadFile={(file) => void handleUploadGltf(file)}
              onInsertRiggedHumanoid={() => handleInsertRiggedHumanoid(false)}
              onGoToAnimation={() => setSettings((prev) => ({ ...prev, sceneMode: 'animation' }))}
              onExportGlb={(profile) => void handleExportSampleGlb(profile)}
              onExportBlenderZip={(profile) => void handleExportBlenderZip(profile)}
              onToggleTransparentPng={() => setTransparentPng((p) => !p)}
              onCaptureFrame={(t) => handleCaptureFrame(t)}
              onExportFramesZip={(step, t) => void handleExportFramesZip(step, t)}
              onExportSpriteSheetZip={(step, t) => void handleExportSpriteSheetZip(step, t)}
              onPinStartupModel={() => void handlePinStartupModel()}
              onClearStartupModel={() => void handleClearStartupModel()}
              onResetLodAssembly={() => {
                setJointMarkersActive(false);
                threeEngineRef.current?.resetToProceduralLodAssembly();
                showNotice('Cena restaurada para o exemplo Multi-LOD padrão.');
              }}
              onClose={() => setLeftPanelOpen(false)}
            />
          ) : isVfxSceneMode(settings.sceneMode) || vfxTab === 'postfx' ? (
            <GeometryNodesSidebar
              activeTab={isVfxSceneMode(settings.sceneMode) || vfxTab === 'postfx' ? vfxTab : 'nodes'}
              sceneMode={settings.sceneMode}
              nodes={settings.geometryNodes}
              settings={settings}
              meshCount={nodesMeshCount}
              loadedModelName={metrics.lodTelemetry.loadedModelName}
              vertexCode={vertexCode}
              fragmentCode={fragmentCode}
              onVertexChange={setVertexCode}
              onFragmentChange={setFragmentCode}
              onCompileGlsl={handleCompileGlsl}
              compileResult={compileResult}
              shaderEffectActive={!settings.shaderDisabled}
              liveRenderActive={liveRenderActive}
              glslExpandSignal={glslExpandSignal}
              onSelectVfxSubMode={handleSelectVfxSubMode}
              onSelectBackgroundVfxLayer={handleSelectBackgroundVfxLayer}
              onUpdateNodes={handleUpdateGeometryNodes}
              onUpdateSettings={handleUpdateSettings}
              onTriggerPhysicsImpulse={() => threeEngineRef.current?.triggerPhysicsImpulse()}
              onApplyTemplate={handleApplyNodeTemplate}
              onInstantiateCircular6x={handleInstantiateCircular6x}
              onRestoreGltfMaterials={() => {
                threeEngineRef.current?.restoreGltfOriginalMaterials();
                showNotice('Materiais originais do modelo restaurados.');
              }}
              onSelectShaderPreset={handleSelectShaderPreset}
              onResetToPbrFromShader={handleResetToPbrFromShader}
              onToggleLiveRender={handleToggleLiveRender}
              onInsertRiggedHumanoid={() => handleInsertRiggedHumanoid(false)}
              onImportModelFile={(file) => void handleUploadGltf(file)}
              onClose={() => {
                setLeftPanelOpen(false);
                if (vfxTab === 'postfx') {
                  setVfxTab(lastVfx3DModeRef.current);
                }
              }}
            />
          ) : settings.sceneMode === 'animation' ? (
            <AnimationSidebar
              animation={settings.animation}
              loadedModelName={metrics.lodTelemetry.loadedModelName}
              loadedClips={metrics.lodTelemetry.loadedClips}
              boneCount={metrics.lodTelemetry.boneCount}
              rigBoneNames={rigBoneNames}
              weightPaint={weightPaint}
              onUpdateWeightPaint={handleUpdateWeightPaint}
              savedPoses={savedPoses}
              onSaveCustomPose={handleSaveCustomPose}
              onApplyPoseOverrides={handleApplyPoseOverrides}
              onRetargetMotionFile={(file) => void handleRetargetMotionFile(file)}
              autoRigOnImport={autoRigOnImport}
              onToggleAutoRigOnImport={() => setAutoRigOnImport((p) => !p)}
              jointMarkersActive={jointMarkersActive}
              jointMarkerSymmetry={jointMarkerSymmetry}
              onAutoRigLoaded={(rigType) => handleAutoRigLoadedGltf(rigType)}
              onStartJointMarkers={handleStartJointMarkers}
              onCommitJointMarkers={handleCommitJointMarkers}
              onCancelJointMarkers={handleCancelJointMarkers}
              onToggleJointMarkerSymmetry={handleToggleJointMarkerSymmetry}
              onExportGlb={(profile) => void handleExportSampleGlb(profile)}
              onExportBlenderZip={(profile) => void handleExportBlenderZip(profile)}
              multiClipExport={multiClipExport}
              onToggleMultiClipExport={() => setMultiClipExport((p) => !p)}
              exportingBlenderZip={exportingBlenderZip}
              exportingGlb={exportingGlb}
              exportingFramesLabel={exportingFramesLabel}
              exportingSpriteSheetLabel={exportingSpriteSheetLabel}
              onCaptureFrame={(t) => handleCaptureFrame(t)}
              onExportFramesZip={(step, t) => void handleExportFramesZip(step, t)}
              onExportSpriteSheetZip={(step, t) => void handleExportSpriteSheetZip(step, t)}
              onInsertRiggedHumanoid={() => handleInsertRiggedHumanoid(false)}
              onUpdateAnimation={handleUpdateAnimation}
              onResetAnimation={handleResetAnimation}
              timelineOpen={!timelineCollapsed}
              onClose={() => setLeftPanelOpen(false)}
            />
          ) : (
            <SceneModeSidebar
              settings={settings}
              utilityPanel="none"
              loadedModelName={metrics.lodTelemetry.loadedModelName}
              vertexCode={vertexCode}
              fragmentCode={fragmentCode}
              liveRenderActive={liveRenderActive}
              onSelectShaderPreset={handleSelectShaderPreset}
              onResetToPbrFromShader={handleResetToPbrFromShader}
              onToggleLiveRender={handleToggleLiveRender}
              onInsertRiggedHumanoid={() => handleInsertRiggedHumanoid(false)}
              onImportModelFile={(file) => void handleUploadGltf(file)}
              onRestoreGltfMaterials={() => {
                threeEngineRef.current?.restoreGltfOriginalMaterials();
                showNotice('Materiais originais do GLB restaurados.');
              }}
              onUpdateSettings={handleUpdateSettings}
              onCameraPreset={handleCameraPreset}
              onTriggerPhysicsImpulse={() => threeEngineRef.current?.triggerPhysicsImpulse()}
              onOpenGlslEditor={handleOpenGlslInVfx}
              onClose={() => setLeftPanelOpen(false)}
            />
          ))}

        {/* Painel Direito: Outliner da Cena ou Inspetor Universal do Objeto */}
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

        {/* Barra inferior: Timeline NLA integrada no modo Animação, ou Dock de Viewport nos demais */}
        {settings.sceneMode === 'animation' ? (
          <>
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
            />
          </>
        ) : (
          <BottomDock
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
