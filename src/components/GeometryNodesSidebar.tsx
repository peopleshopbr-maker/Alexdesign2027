import {
  Aperture,
  Bone,
  Boxes,
  ChevronDown,
  ChevronUp,
  Code2,
  Download,
  Layers,
  Play,
  Sparkles,
  Upload,
  Wand2,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SHADER_PRESETS } from '../graphics/shaders';
import type {
  GeometryNodesSettings,
  MoGraphDistribution,
  MoGraphEffector,
  ProceduralNodeTemplate,
  RenderSettings,
  SceneMode,
  ShaderCompileResult,
} from '../types/graphics';

export type Vfx3DSceneMode = 'nodes' | 'physics' | 'instanced' | 'shader';
export type VfxSubMode = Vfx3DSceneMode | 'postfx';

interface GeometryNodesSidebarProps {
  activeTab: VfxSubMode;
  sceneMode: SceneMode;
  nodes: GeometryNodesSettings;
  settings: RenderSettings;
  meshCount: number;
  loadedModelName?: string | null;
  vertexCode?: string;
  fragmentCode?: string;
  onVertexChange?: (code: string) => void;
  onFragmentChange?: (code: string) => void;
  onCompileGlsl?: (vs: string, fs: string) => ShaderCompileResult;
  compileResult?: ShaderCompileResult | null;
  shaderEffectActive?: boolean;
  liveRenderActive?: boolean;
  glslExpandSignal?: number;
  onSelectVfxSubMode: (mode: VfxSubMode) => void;
  onSelectBackgroundVfxLayer?: (layer: Vfx3DSceneMode) => void;
  onUpdateNodes: (patch: Partial<GeometryNodesSettings>) => void;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onTriggerPhysicsImpulse: () => void;
  onApplyTemplate: (template: ProceduralNodeTemplate) => void;
  onInstantiateCircular6x: () => void;
  onRestoreGltfMaterials?: () => void;
  onSelectShaderPreset?: (presetId: string) => void;
  onResetToPbrFromShader?: () => void;
  onToggleLiveRender?: () => void;
  onInsertRiggedHumanoid?: () => void;
  onImportModelFile?: (file: File) => void;
  onClose: () => void;
}

const VFX_TABS: Array<{ id: VfxSubMode; label: string; mobileLabel?: string; icon: typeof Boxes }> = [
  { id: 'nodes', label: 'Nodes', icon: Boxes },
  { id: 'physics', label: 'Física', icon: Wind },
  { id: 'instanced', label: 'Instâncias', mobileLabel: 'Instân.', icon: Layers },
  { id: 'shader', label: 'Efeitos', icon: Wand2 },
  { id: 'postfx', label: 'Pós-FX', icon: Aperture },
];

const VFX_LAYERS: Array<{ id: Vfx3DSceneMode; label: string }> = [
  { id: 'nodes', label: 'Nodes' },
  { id: 'physics', label: 'Física' },
  { id: 'instanced', label: 'Instâncias' },
  { id: 'shader', label: 'Efeitos' },
];

const PRESET_SWATCHES: Record<string, { badge: string; desc: string }> = {
  harmonic: {
    badge: 'from-blue-500 to-amber-400',
    desc: 'Energia líquida pulsante com reflexo azul e âmbar.',
  },
  hologram: {
    badge: 'from-cyan-400 to-sky-600',
    desc: 'Contorno neon ciano com linhas de varredura holográfica.',
  },
  topo: {
    badge: 'from-teal-400 to-orange-500',
    desc: 'Mapa de calor em relevo com linhas de contorno luminosas.',
  },
  grid: {
    badge: 'from-sky-400 to-indigo-500',
    desc: 'Grade tecnológica luminosa acompanhando a malha 3D.',
  },
};

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

const TEMPLATES: Array<{ id: ProceduralNodeTemplate; label: string }> = [
  { id: 'glass_neon', label: 'Vidro & Neon' },
  { id: 'organic_sculpt', label: 'Escultura Orgânica' },
  { id: 'parametric_arch', label: 'Arquitetura Paramétrica' },
  { id: 'holo_grid', label: 'Grade Holográfica' },
];

export function GeometryNodesSidebar({
  activeTab,
  sceneMode,
  nodes,
  settings,
  meshCount,
  loadedModelName,
  vertexCode = '',
  fragmentCode = '',
  onVertexChange,
  onFragmentChange,
  onCompileGlsl,
  compileResult = null,
  shaderEffectActive = true,
  liveRenderActive = false,
  glslExpandSignal = 0,
  onSelectVfxSubMode,
  onSelectBackgroundVfxLayer,
  onUpdateNodes,
  onUpdateSettings,
  onTriggerPhysicsImpulse,
  onApplyTemplate,
  onInstantiateCircular6x,
  onRestoreGltfMaterials,
  onSelectShaderPreset,
  onResetToPbrFromShader,
  onToggleLiveRender,
  onInsertRiggedHumanoid,
  onImportModelFile,
  onClose,
}: GeometryNodesSidebarProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const glslFileInputRef = useRef<HTMLInputElement>(null);
  const [showAdvancedCode, setShowAdvancedCode] = useState(false);

  useEffect(() => {
    if (glslExpandSignal > 0) {
      setShowAdvancedCode(true);
    }
  }, [glslExpandSignal]);

  const updatePostFx = (patch: Partial<RenderSettings['postProcessing']>) => {
    onUpdateSettings({
      postProcessing: {
        ...settings.postProcessing,
        ...patch,
      },
    });
  };

  const handleLoadGlslFile = async (file: File) => {
    const content = await file.text();
    if (content.includes('gl_Position')) {
      onVertexChange?.(content);
    } else {
      onFragmentChange?.(content);
    }
  };

  const handleExportGlsl = () => {
    const bundle = `// === VERTEX SHADER ===\n${vertexCode}\n\n// === FRAGMENT SHADER ===\n${fragmentCode}\n`;
    const blob = new Blob([bundle], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vertice_custom_shader.glsl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const ActiveIcon =
    activeTab === 'postfx'
      ? Aperture
      : activeTab === 'physics'
        ? Wind
        : activeTab === 'instanced'
          ? Layers
          : activeTab === 'shader'
            ? Wand2
            : Boxes;

  return (
    <aside
      aria-label="VFX Studio: Nodes, Física, Instâncias, Efeitos e Pós-FX"
      className={`fixed left-12 right-2 bottom-[66px] max-h-[58dvh] md:top-[68px] md:left-[68px] md:right-auto md:bottom-[76px] md:max-h-none z-20 overflow-y-auto bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3.5 transition-all duration-200 ${
        activeTab === 'shader' && showAdvancedCode ? 'md:w-[440px]' : 'md:w-[356px]'
      }`}
    >
      {/* Cabeçalho único limpo */}
      <div className="flex items-start gap-3 border-b border-white/10 pb-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0">
          <ActiveIcon className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wide text-white uppercase">
              VFX Studio
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              {activeTab === 'nodes' && (
                <span className="text-[11px] font-mono tabular-nums text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 rounded-md whitespace-nowrap">
                  {meshCount} malha(s)
                </span>
              )}
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
            Nodes, física, instâncias GPU, efeitos visuais e pós-processamento integrados.
          </p>
        </div>
      </div>

      {/* Sub-abas unificadas do pipeline VFX (5 módulos) */}
      <div
        role="tablist"
        aria-label="Módulos VFX"
        className="grid grid-cols-5 gap-1 bg-[#080a0f] p-1 rounded-xl border border-white/10"
      >
        {VFX_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectVfxSubMode(tab.id)}
              className={`h-11 px-1 rounded-lg text-[9.5px] sm:text-[10px] font-semibold flex flex-col items-center justify-center gap-0.5 whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-400/45 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <TabIcon className="w-3.5 h-3.5 shrink-0" />
              {tab.mobileLabel ? (
                <>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                <span>{tab.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'nodes' && (
        <>
          {/* Cartão: MoGraph Cloner & Efetores */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-200">
                  MoGraph Cloner &amp; Efetores
                </span>
              </div>
            </div>

            {/* Distribuição: 3 colunas uniformes */}
            <div className="grid grid-cols-3 gap-1.5">
              {DISTRIBUTIONS.map((dist) => {
                const active = nodes.distribution === dist.id;
                return (
                  <button
                    key={dist.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdateNodes({ distribution: dist.id, enabled: true })}
                    className={`h-8 px-2 text-[11px] font-medium rounded-lg border whitespace-nowrap cursor-pointer flex items-center justify-center ${
                      active
                        ? 'bg-sky-500/20 text-sky-200 border-sky-400/55 shadow-sm'
                        : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'
                    }`}
                  >
                    {dist.label}
                  </button>
                );
              })}
            </div>

            {/* Efetores: 4 colunas uniformes */}
            <div className="grid grid-cols-4 gap-1.5">
              {EFFECTORS.map((eff) => {
                const active = nodes.effector === eff.id;
                return (
                  <button
                    key={eff.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdateNodes({ effector: eff.id, enabled: true })}
                    className={`h-8 px-1.5 text-[11px] font-medium rounded-lg border whitespace-nowrap cursor-pointer flex items-center justify-center ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/55 shadow-sm'
                        : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'
                    }`}
                  >
                    {eff.label}
                  </button>
                );
              })}
            </div>

            {/* Sliders de Quantidade e Raio / Espaçamento */}
            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Quantidade de Clones</span>
                <span className="font-mono tabular-nums text-sky-300">{nodes.cloneCount}</span>
              </div>
              <input
                type="range"
                min={4}
                max={36}
                step={1}
                value={nodes.cloneCount}
                onChange={(e) => onUpdateNodes({ cloneCount: Number(e.target.value), enabled: true })}
                className="studio-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Raio / Espaçamento</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {nodes.spacing.toFixed(1)}m
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3.5}
                step={0.1}
                value={nodes.spacing}
                onChange={(e) => onUpdateNodes({ spacing: Number(e.target.value), enabled: true })}
                className="studio-slider w-full"
              />
            </label>

            {/* Força e Velocidade em 2 colunas */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Força</span>
                  <span className="font-mono tabular-nums text-sky-300">
                    {nodes.strength.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={nodes.strength}
                  onChange={(e) => onUpdateNodes({ strength: Number(e.target.value), enabled: true })}
                  className="studio-slider w-full"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Velocidade</span>
                  <span className="font-mono tabular-nums text-sky-300">
                    {nodes.speed.toFixed(1)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2.5}
                  step={0.1}
                  value={nodes.speed}
                  onChange={(e) => onUpdateNodes({ speed: Number(e.target.value), enabled: true })}
                  className="studio-slider w-full"
                />
              </label>
            </div>

            {/* Botão Primário Ativar / Pausar MoGraph */}
            <button
              type="button"
              aria-pressed={nodes.enabled}
              onClick={() => onUpdateNodes({ enabled: !nodes.enabled })}
              className={`h-9 w-full px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-2 cursor-pointer ${
                nodes.enabled
                  ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-sky-300 shadow-sm'
                  : 'bg-[#121826] hover:bg-[#192235] text-slate-200 border-white/12'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{nodes.enabled ? 'MoGraph Ativo' : 'Ativar MoGraph'}</span>
            </button>
          </div>

          {/* Seção: Templates Procedurais 3D */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-200">Templates Procedurais 3D</span>
            <div className="flex items-center gap-2">
              <select
                aria-label="Template Procedural 3D"
                value={nodes.template}
                onChange={(e) =>
                  onUpdateNodes({ template: e.target.value as ProceduralNodeTemplate })
                }
                className="h-8 flex-1 min-w-0 px-2.5 text-xs rounded-lg bg-[#090c13] text-slate-200 border border-white/12 outline-none cursor-pointer focus-visible:border-sky-400"
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onApplyTemplate(nodes.template)}
                className="h-8 px-3.5 text-xs font-medium rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/45 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Aplicar
              </button>
            </div>

            {loadedModelName && onRestoreGltfMaterials && (
              <button
                type="button"
                onClick={onRestoreGltfMaterials}
                className="h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#090c13] hover:bg-[#141c2b] text-slate-300 border border-white/10 cursor-pointer flex items-center justify-center"
              >
                Restaurar Material Original ({loadedModelName})
              </button>
            )}
          </div>

          {/* Ação: Instanciar Array Circular (6x Nodes) */}
          <button
            type="button"
            onClick={onInstantiateCircular6x}
            className="h-9 w-full px-3 text-xs font-medium rounded-xl bg-[#090c13] hover:bg-[#141c2b] text-slate-100 border border-sky-400/35 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Instanciar Array Circular (6x Nodes)</span>
          </button>
        </>
      )}

      {activeTab === 'physics' && (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={onTriggerPhysicsImpulse}
            className="h-9 w-full px-3 text-xs font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Lançar Impulso na Arena</span>
          </button>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Mova o cursor sobre a arena para repelir corpos rígidos e atrair partículas VFX em tempo real.
          </p>

          <label className="flex flex-col gap-1.5 text-[11px] pt-2 border-t border-white/8">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Velocidade da Simulação</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.speed.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.1}
              value={settings.speed}
              onChange={(e) => onUpdateSettings({ speed: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>
        </div>
      )}

      {activeTab === 'instanced' && (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Instâncias</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.instanceCount.toLocaleString('pt-BR')}
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={20000}
              step={500}
              value={settings.instanceCount}
              onChange={(e) => onUpdateSettings({ instanceCount: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Dispersão</span>
              <span className="font-mono tabular-nums text-sky-300">
                {Math.round(settings.explosion * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={settings.explosion}
              onChange={(e) => onUpdateSettings({ explosion: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px] pt-2 border-t border-white/8">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Velocidade do Campo</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.speed.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.1}
              value={settings.speed}
              onChange={(e) => onUpdateSettings({ speed: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>
        </div>
      )}

      {activeTab === 'shader' && (
        <div className="flex flex-col gap-3">
          {onToggleLiveRender && (
            <button
              type="button"
              aria-pressed={liveRenderActive}
              onClick={onToggleLiveRender}
              className={`h-9 w-full px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-2 cursor-pointer ${
                liveRenderActive
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-emerald-300 shadow-sm'
                  : 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-transparent'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {liveRenderActive
                  ? 'Render ao Vivo Ativo (Luz + Bloom + Sombra)'
                  : 'Ativar Render ao Vivo na Tela'}
              </span>
            </button>
          )}

          {/* Cartões Visuais de Estilo / Shader */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-400">
                Escolha o Estilo Visual VFX
              </span>
              {loadedModelName && (
                <span className="text-[10px] text-emerald-300 truncate max-w-[140px]">
                  Em: {loadedModelName}
                </span>
              )}
            </div>

            {onResetToPbrFromShader && (
              <button
                type="button"
                aria-pressed={!shaderEffectActive}
                onClick={onResetToPbrFromShader}
                className={`p-2 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${
                  !shaderEffectActive
                    ? 'bg-sky-500/18 border-sky-400/55 text-white shadow-sm'
                    : 'bg-[#121826] border-white/10 text-slate-300 hover:bg-[#192235] hover:text-white'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-500 to-slate-200 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">
                      Normal (PBR Realista)
                    </span>
                    {!shaderEffectActive && (
                      <span className="text-[10px] font-semibold text-sky-300 shrink-0">
                        Ativo
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Materiais originais com luz e sombra reais.
                  </div>
                </div>
              </button>
            )}

            {SHADER_PRESETS.map((preset) => {
              const isActive =
                shaderEffectActive &&
                settings.viewportShading.mode === 'pbr' &&
                vertexCode === preset.vertexShader &&
                fragmentCode === preset.fragmentShader;
              const meta = PRESET_SWATCHES[preset.id] ?? {
                badge: 'from-sky-400 to-blue-600',
                desc: preset.description,
              };
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelectShaderPreset?.(preset.id)}
                  className={`p-2 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer ${
                    isActive
                      ? 'bg-sky-500/20 border-sky-400/55 text-white shadow-sm'
                      : 'bg-[#121826] border-white/10 text-slate-300 hover:bg-[#192235] hover:text-white'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${meta.badge} shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {preset.name}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-semibold text-sky-300 shrink-0">
                          Ativo
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{meta.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Ajustes Visuais em Tempo Real */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
            <span className="text-[11px] font-semibold text-slate-200">
              Ajuste Visual em Tempo Real
            </span>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Pulso / Ondulação (0 = forma intacta)</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.turbulence.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={settings.turbulence}
                onChange={(e) => onUpdateSettings({ turbulence: Number(e.target.value) })}
                className="studio-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Escala do Padrão</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.frequency.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={settings.frequency}
                onChange={(e) => onUpdateSettings({ frequency: Number(e.target.value) })}
                className="studio-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Velocidade do Efeito</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.speed.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2.5}
                step={0.1}
                value={settings.speed}
                onChange={(e) => onUpdateSettings({ speed: Number(e.target.value) })}
                className="studio-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Brilho (Bloom)</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.postProcessing.enabled
                    ? settings.postProcessing.bloomStrength.toFixed(2)
                    : 'OFF'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.05}
                value={settings.postProcessing.enabled ? settings.postProcessing.bloomStrength : 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  onUpdateSettings({
                    postProcessing: {
                      ...settings.postProcessing,
                      enabled: val > 0.01,
                      bloomStrength: val,
                    },
                  });
                }}
                className="studio-slider w-full"
              />
            </label>
          </div>

          {onImportModelFile && (
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,.gltf,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportModelFile(f);
                e.target.value = '';
              }}
            />
          )}

          {loadedModelName ? (
            <div className="rounded-xl bg-[#090c13] border border-white/10 p-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-300 truncate">
                Personagem: {loadedModelName}
              </span>
              {onImportModelFile && (
                <button
                  type="button"
                  onClick={() => glbInputRef.current?.click()}
                  className="h-7 px-2 text-[10px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-sky-400" />
                  <span>Trocar .GLB</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {onImportModelFile && (
                <button
                  type="button"
                  onClick={() => glbInputRef.current?.click()}
                  className="h-8 w-full px-2.5 text-[11px] font-semibold rounded-lg bg-[#090c13] hover:bg-[#141c2b] text-slate-100 border border-white/12 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-400" />
                  <span>Importar Personagem (.GLB / .GLTF)</span>
                </button>
              )}
              {onInsertRiggedHumanoid && (
                <button
                  type="button"
                  onClick={onInsertRiggedHumanoid}
                  className="h-8 w-full px-2.5 text-[11px] font-semibold rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/40 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Bone className="w-3.5 h-3.5" />
                  <span>Inserir Personagem 3D na Cena</span>
                </button>
              )}
            </div>
          )}

          {/* Modo Avançado Colapsável (Código GLSL) integrado ao VFX Studio */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 overflow-hidden">
            <button
              type="button"
              aria-expanded={showAdvancedCode}
              onClick={() => setShowAdvancedCode((p) => !p)}
              className="w-full h-9 px-3 text-[11px] font-medium text-slate-300 hover:text-white flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Modo Avançado (Código GLSL)</span>
              </span>
              {showAdvancedCode ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAdvancedCode && (
              <div className="p-3 pt-2 border-t border-white/10 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={glslFileInputRef}
                    type="file"
                    accept=".glsl,.vert,.frag,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleLoadGlslFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => glslFileInputRef.current?.click()}
                    className="h-7 px-2 text-[10px] font-medium rounded-lg bg-[#171e2e] hover:bg-[#1f283d] text-slate-200 border border-white/10 flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Carregar .glsl</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportGlsl}
                    className="h-7 px-2 text-[10px] font-medium rounded-lg bg-[#171e2e] hover:bg-[#1f283d] text-slate-200 border border-white/10 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Exportar .glsl</span>
                  </button>
                  {onCompileGlsl && (
                    <button
                      type="button"
                      onClick={() => onCompileGlsl(vertexCode, fragmentCode)}
                      className="h-7 px-2.5 text-[10px] font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <Play className="w-3 h-3" />
                      <span>Aplicar</span>
                    </button>
                  )}
                </div>

                {compileResult && (
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono ${
                      compileResult.ok
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
                    }`}
                  >
                    {compileResult.ok
                      ? `Sucesso: ${compileResult.message}`
                      : `Erro (${compileResult.stage}): ${compileResult.message}`}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="vfx-vs-editor" className="text-[10px] font-medium text-slate-300">
                      Vertex Shader
                    </label>
                    <textarea
                      id="vfx-vs-editor"
                      value={vertexCode}
                      onChange={(e) => onVertexChange?.(e.target.value)}
                      spellCheck={false}
                      className="h-28 w-full p-2 rounded-lg bg-[#070a10] border border-white/12 font-mono text-[10px] leading-relaxed text-sky-100 outline-none focus:border-sky-400 resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="vfx-fs-editor" className="text-[10px] font-medium text-slate-300">
                      Fragment Shader
                    </label>
                    <textarea
                      id="vfx-fs-editor"
                      value={fragmentCode}
                      onChange={(e) => onFragmentChange?.(e.target.value)}
                      spellCheck={false}
                      className="h-28 w-full p-2 rounded-lg bg-[#070a10] border border-white/12 font-mono text-[10px] leading-relaxed text-emerald-100 outline-none focus:border-sky-400 resize-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'postfx' && (
        <div className="flex flex-col gap-3">
          {/* Camada VFX em execução combinada com Pós-Processamento */}
          {onSelectBackgroundVfxLayer && (
            <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-slate-300">
                  Camada VFX Combinada
                </span>
                <span className="text-[10px] text-sky-300 font-mono">Ao vivo</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {VFX_LAYERS.map((layer) => {
                  const active = sceneMode === layer.id;
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectBackgroundVfxLayer(layer.id)}
                      className={`h-7 px-1 text-[10px] font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
                        active
                          ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                          : 'bg-[#121826] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {layer.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Presets Rápidos Pós-FX */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2">
            <span className="text-[11px] font-medium text-slate-400">
              Presets de Pós-Processamento VFX
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updatePostFx({
                    enabled: false,
                    bloomStrength: 0.22,
                    dofEnabled: false,
                    grainAmount: 0.02,
                    chromaticAmount: 0.0015,
                  })
                }
                className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer"
              >
                Limpo (Padrão)
              </button>
              <button
                type="button"
                onClick={() =>
                  updatePostFx({
                    enabled: true,
                    bloomStrength: 0.55,
                    dofEnabled: false,
                    grainAmount: 0.01,
                    chromaticAmount: 0.001,
                  })
                }
                className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-sky-200 border border-sky-400/30 cursor-pointer"
              >
                Neon Glow VFX
              </button>
              <button
                type="button"
                onClick={() =>
                  updatePostFx({
                    enabled: true,
                    bloomStrength: 0.28,
                    dofEnabled: true,
                    dofFocus: 5.5,
                    grainAmount: 0.03,
                    chromaticAmount: 0.0015,
                  })
                }
                className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-emerald-200 border border-emerald-400/30 cursor-pointer"
              >
                Cinema DOF
              </button>
              <button
                type="button"
                onClick={() =>
                  updatePostFx({
                    enabled: true,
                    bloomStrength: 0.72,
                    dofEnabled: false,
                    grainAmount: 0.06,
                    chromaticAmount: 0.0065,
                  })
                }
                className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-fuchsia-200 border border-fuchsia-400/30 cursor-pointer"
              >
                Cyber Glitch
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
            <button
              type="button"
              aria-pressed={settings.postProcessing.enabled}
              onClick={() => updatePostFx({ enabled: !settings.postProcessing.enabled })}
              className={`h-9 w-full px-3 text-xs font-semibold rounded-lg border cursor-pointer flex items-center justify-center ${
                settings.postProcessing.enabled
                  ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-sky-300'
                  : 'bg-[#121826] hover:bg-[#192235] text-slate-200 border-white/12'
              }`}
            >
              {settings.postProcessing.enabled ? 'Pós-FX Ativo na Cena' : 'Ativar Pós-FX'}
            </button>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Bloom (Brilho)</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.postProcessing.bloomStrength.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.4}
                step={0.05}
                value={settings.postProcessing.bloomStrength}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updatePostFx({
                    bloomStrength: val,
                    enabled: val > 0.01 ? true : settings.postProcessing.enabled,
                  });
                }}
                className="studio-slider w-full"
              />
            </label>

            <button
              type="button"
              aria-pressed={settings.postProcessing.dofEnabled}
              onClick={() =>
                updatePostFx({
                  dofEnabled: !settings.postProcessing.dofEnabled,
                  enabled: !settings.postProcessing.dofEnabled ? true : settings.postProcessing.enabled,
                })
              }
              className={`h-8 w-full px-3 text-xs font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
                settings.postProcessing.dofEnabled
                  ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                  : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
              }`}
            >
              Depth of Field (DOF): {settings.postProcessing.dofEnabled ? 'Ativo' : 'Desligado'}
            </button>

            {settings.postProcessing.dofEnabled && (
              <label className="flex flex-col gap-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Distância Focal (DOF)</span>
                  <span className="font-mono tabular-nums text-sky-300">
                    {settings.postProcessing.dofFocus.toFixed(1)}m
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={0.5}
                  value={settings.postProcessing.dofFocus}
                  onChange={(e) => updatePostFx({ dofFocus: Number(e.target.value), enabled: true })}
                  className="studio-slider w-full"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Film Grain</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.postProcessing.grainAmount.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.14}
                step={0.01}
                value={settings.postProcessing.grainAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updatePostFx({
                    grainAmount: val,
                    enabled: val > 0.005 ? true : settings.postProcessing.enabled,
                  });
                }}
                className="studio-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Aberração Cromática</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {settings.postProcessing.chromaticAmount.toFixed(4)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.008}
                step={0.0005}
                value={settings.postProcessing.chromaticAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updatePostFx({
                    chromaticAmount: val,
                    enabled: val > 0.0001 ? true : settings.postProcessing.enabled,
                  });
                }}
                className="studio-slider w-full"
              />
            </label>
          </div>
        </div>
      )}

      {/* Barra rápida de Pós-FX Integrado visível em Nodes / Física / Instâncias / Efeitos */}
      {activeTab !== 'postfx' && (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-pressed={settings.postProcessing.enabled}
            onClick={() => updatePostFx({ enabled: !settings.postProcessing.enabled })}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 cursor-pointer ${
              settings.postProcessing.enabled
                ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
            }`}
          >
            <Aperture className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Pós-FX: {settings.postProcessing.enabled ? 'ON' : 'OFF'}
            </span>
            {settings.postProcessing.enabled && (
              <span className="text-[10px] font-mono text-sky-300">
                · {settings.postProcessing.bloomStrength.toFixed(2)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectVfxSubMode('postfx')}
            className="h-7 px-2.5 rounded-lg text-[11px] font-medium bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer shrink-0"
          >
            Ajustar Pós-FX
          </button>
        </div>
      )}
    </aside>
  );
}
