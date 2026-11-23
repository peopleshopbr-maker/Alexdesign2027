import { Aperture, Bone, Box, Code2, Layers, Sun, Upload, Wand2, Wind, X, Zap } from 'lucide-react';
import { useRef } from 'react';
import { SHADER_PRESETS } from '../graphics/shaders';
import type {
  CameraPreset,
  LightingPreset,
  MaterialFinish,
  RenderSettings,
} from '../types/graphics';

interface SceneModeSidebarProps {
  settings: RenderSettings;
  utilityPanel: 'none' | 'postfx' | 'lighting';
  loadedModelName?: string | null;
  vertexCode?: string;
  fragmentCode?: string;
  shaderEffectActive?: boolean;
  liveRenderActive?: boolean;
  onSelectShaderPreset?: (presetId: string) => void;
  onResetToPbrFromShader?: () => void;
  onToggleLiveRender?: () => void;
  onInsertRiggedHumanoid?: () => void;
  onImportModelFile?: (file: File) => void;
  onRestoreGltfMaterials?: () => void;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onTriggerPhysicsImpulse: () => void;
  onOpenGlslEditor: () => void;
  onClose: () => void;
}

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

const LIGHTING_PRESETS: Array<{ id: LightingPreset; label: string }> = [
  { id: 'studio', label: 'Estúdio Neutro' },
  { id: 'dramatic', label: 'Dramático' },
  { id: 'cyber', label: 'Neon Cyber' },
  { id: 'sunset', label: 'Pôr do Sol' },
];

const CAMERA_PRESETS: Array<{ id: CameraPreset; label: string; tip: string }> = [
  { id: 'orbital', label: 'Orbital', tip: 'Vista Orbital (0)' },
  { id: 'front', label: 'Frontal', tip: 'Vista Frontal (1)' },
  { id: 'side', label: 'Lateral', tip: 'Vista Lateral (3)' },
  { id: 'top', label: 'Topo', tip: 'Vista Superior (7)' },
  { id: 'macro', label: 'Macro', tip: 'Zoom Macro' },
];

export function SceneModeSidebar({
  settings,
  utilityPanel,
  loadedModelName,
  vertexCode = '',
  fragmentCode = '',
  shaderEffectActive = true,
  liveRenderActive = false,
  onSelectShaderPreset,
  onResetToPbrFromShader,
  onToggleLiveRender,
  onInsertRiggedHumanoid,
  onImportModelFile,
  onRestoreGltfMaterials,
  onUpdateSettings,
  onCameraPreset,
  onTriggerPhysicsImpulse,
  onOpenGlslEditor,
  onClose,
}: SceneModeSidebarProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const modeMeta = {
    pbr: {
      title: 'Motor PBR',
      subtitle: 'Materiais físicos, refração de cristal e vista explodida.',
      icon: Box,
    },
    instanced: {
      title: 'Campo Instanciado',
      subtitle: 'Renderização massiva de instâncias procedurais em tempo real.',
      icon: Layers,
    },
    shader: {
      title: 'Efeitos Visuais (Shader)',
      subtitle: 'Escolha um visual pronto e veja o personagem mudar ao vivo na tela.',
      icon: Wand2,
    },
    physics: {
      title: 'Física 3D & Partículas',
      subtitle: 'Corpos rígidos com colisões e partículas reativas ao cursor.',
      icon: Wind,
    },
  } as const;

  const currentMeta =
    modeMeta[settings.sceneMode as keyof typeof modeMeta] ?? modeMeta.pbr;
  const Icon =
    utilityPanel === 'postfx'
      ? Aperture
      : utilityPanel === 'lighting'
        ? Sun
        : currentMeta.icon;

  const updatePostFx = (patch: Partial<RenderSettings['postProcessing']>) => {
    onUpdateSettings({
      postProcessing: {
        ...settings.postProcessing,
        ...patch,
      },
    });
  };

  const updateLighting = (patch: Partial<RenderSettings['lighting']>) => {
    onUpdateSettings({
      lighting: {
        ...settings.lighting,
        ...patch,
      },
    });
  };

  const headerTitle =
    utilityPanel === 'postfx'
      ? 'Pós-Processamento'
      : utilityPanel === 'lighting'
        ? 'Iluminação & HDRI'
        : currentMeta.title;

  const headerSubtitle =
    utilityPanel === 'postfx'
      ? 'Bloom, Depth of Field (DOF), granulação e aberração cromática.'
      : utilityPanel === 'lighting'
        ? 'Presets de luz de estúdio, exposição, HDRI e sombras.'
        : currentMeta.subtitle;

  return (
    <aside
      aria-label="Controles do modo de cena"
      className="fixed left-12 right-2 bottom-[66px] max-h-[58dvh] md:top-[68px] md:left-[68px] md:right-auto md:bottom-[76px] md:max-h-none md:w-[332px] z-20 overflow-y-auto bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-4"
    >
      {/* Cabeçalho limpo com botão fechar */}
      <div className="flex items-start gap-3 border-b border-white/10 pb-3">
        <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wide text-white uppercase">
              {headerTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel lateral"
              title="Recolher painel"
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            {headerSubtitle}
          </p>
        </div>
      </div>

      {utilityPanel === 'lighting' ? (
        <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
          <span className="text-[11px] font-medium text-slate-400">Preset de Iluminação</span>
          <div className="grid grid-cols-2 gap-1.5">
            {LIGHTING_PRESETS.map((lp) => {
              const active = settings.lighting.preset === lp.id;
              return (
                <button
                  key={lp.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateLighting({ preset: lp.id })}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium border cursor-pointer flex items-center justify-center ${
                    active
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/55'
                      : 'bg-[#121826] text-slate-300 border-white/10 hover:text-white'
                  }`}
                >
                  {lp.label}
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Exposição da Câmera</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.lighting.exposure.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={settings.lighting.exposure}
              onChange={(e) => updateLighting({ exposure: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Intensidade HDRI</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.lighting.envIntensity.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={settings.lighting.envIntensity}
              onChange={(e) => updateLighting({ envIntensity: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Rotação do Ambiente</span>
              <span className="font-mono tabular-nums text-sky-300">
                {settings.lighting.envRotationDeg}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={settings.lighting.envRotationDeg}
              onChange={(e) => updateLighting({ envRotationDeg: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Força da Sombra</span>
              <span className="font-mono tabular-nums text-sky-300">
                {Math.round(settings.lighting.shadowIntensity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.lighting.shadowIntensity}
              onChange={(e) => updateLighting({ shadowIntensity: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>
        </div>
      ) : utilityPanel === 'postfx' ? (
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
            {settings.postProcessing.enabled ? 'Pós-FX Ativo' : 'Ativar Pós-FX'}
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
              onChange={(e) => updatePostFx({ bloomStrength: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>

          <button
            type="button"
            aria-pressed={settings.postProcessing.dofEnabled}
            onClick={() => updatePostFx({ dofEnabled: !settings.postProcessing.dofEnabled })}
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
                onChange={(e) => updatePostFx({ dofFocus: Number(e.target.value) })}
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
              onChange={(e) => updatePostFx({ grainAmount: Number(e.target.value) })}
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
              onChange={(e) => updatePostFx({ chromaticAmount: Number(e.target.value) })}
              className="studio-slider w-full"
            />
          </label>
        </div>
      ) : (
        <>
          {/* Controles específicos do modo */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-3">
            {settings.sceneMode === 'pbr' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-400">Acabamento PBR</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {FINISH_OPTIONS.length} opções
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FINISH_OPTIONS.map((f) => {
                    const active = settings.finish === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onUpdateSettings({ finish: f.id })}
                        className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-2 border cursor-pointer ${
                          active
                            ? 'bg-sky-500/20 border-sky-400/55 text-white'
                            : 'bg-[#121826] border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${f.swatch}`} />
                        <span className="truncate">{f.label}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="flex flex-col gap-1.5 text-[11px] pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Vista Explodida</span>
                    <span className="font-mono tabular-nums text-sky-300">
                      {Math.round(settings.explosion * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.explosion}
                    onChange={(e) => onUpdateSettings({ explosion: Number(e.target.value) })}
                    className="studio-slider w-full"
                  />
                </label>

                {loadedModelName && onRestoreGltfMaterials && (
                  <div className="pt-2 border-t border-white/8 flex flex-col gap-1.5">
                    <span className="text-[11px] text-emerald-300 truncate">
                      Aplicando ao modelo: {loadedModelName}
                    </span>
                    <button
                      type="button"
                      onClick={onRestoreGltfMaterials}
                      className="h-8 px-2.5 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer flex items-center justify-center"
                    >
                      Restaurar Material Original do GLB
                    </button>
                  </div>
                )}
              </>
            )}

            {settings.sceneMode === 'instanced' && (
              <>
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
              </>
            )}

            {settings.sceneMode === 'shader' && (
              <>
                <span className="text-[11px] font-medium text-slate-400">
                  Estilo Visual no Personagem
                </span>

                <div className="grid grid-cols-1 gap-1.5">
                  {onResetToPbrFromShader && (
                    <button
                      type="button"
                      aria-pressed={!shaderEffectActive}
                      onClick={onResetToPbrFromShader}
                      className={`h-8 px-2.5 text-xs font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
                        !shaderEffectActive
                          ? 'bg-sky-500/20 text-white border-sky-400/55 shadow-sm'
                          : 'bg-[#121826] hover:bg-[#192235] text-slate-200 border-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                        <span>Normal (PBR Realista)</span>
                      </span>
                      <span className="text-[10px] text-sky-300">
                        {!shaderEffectActive ? 'Ativo' : 'Original'}
                      </span>
                    </button>
                  )}

                  {SHADER_PRESETS.map((preset) => {
                    const isActive =
                      shaderEffectActive &&
                      settings.viewportShading.mode === 'pbr' &&
                      vertexCode === preset.vertexShader &&
                      fragmentCode === preset.fragmentShader;
                    const swatchClass =
                      preset.id === 'hologram'
                        ? 'bg-cyan-400'
                        : preset.id === 'topo'
                          ? 'bg-amber-400'
                          : preset.id === 'grid'
                            ? 'bg-sky-400'
                            : 'bg-blue-500';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onSelectShaderPreset?.(preset.id)}
                        className={`h-9 px-2.5 text-xs font-medium rounded-lg border flex items-center justify-between cursor-pointer ${
                          isActive
                            ? 'bg-sky-500/20 text-white border-sky-400/55 shadow-sm'
                            : 'bg-[#121826] text-slate-300 border-white/10 hover:bg-[#192235] hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${swatchClass}`} />
                          <span className="truncate">{preset.name}</span>
                        </span>
                        {isActive && (
                          <span className="text-[10px] text-sky-300 font-semibold shrink-0">
                            Ativo
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                  <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
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
                  <div className="flex flex-col gap-1.5 pt-1">
                    {onImportModelFile && (
                      <button
                        type="button"
                        onClick={() => glbInputRef.current?.click()}
                        className="h-8 w-full px-2.5 text-[11px] font-semibold rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-100 border border-white/12 flex items-center justify-center gap-1.5 cursor-pointer"
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

                <label className="flex flex-col gap-1.5 text-[11px] pt-1 border-t border-white/8">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Intensidade do Pulso (0 = sem distorção)</span>
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
                    <span className="text-slate-400">Escala das Ondas</span>
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

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {onToggleLiveRender && (
                    <button
                      type="button"
                      aria-pressed={liveRenderActive}
                      onClick={onToggleLiveRender}
                      className={`h-8 px-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1 cursor-pointer ${
                        liveRenderActive
                          ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                          : 'bg-sky-400 hover:bg-sky-300 text-slate-950 border-transparent'
                      }`}
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>{liveRenderActive ? 'Render: ON' : 'Render ao Vivo'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onOpenGlslEditor}
                    className="h-8 px-2 text-[11px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Código GLSL</span>
                  </button>
                </div>
              </>
            )}

            {settings.sceneMode === 'physics' && (
              <>
                <button
                  type="button"
                  onClick={onTriggerPhysicsImpulse}
                  className="h-9 w-full px-3 text-xs font-semibold rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Lançar Impulso na Arena</span>
                </button>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Mova o cursor sobre a arena para repelir esferas e atrair partículas em tempo real.
                </p>
              </>
            )}

            <label className="flex flex-col gap-1.5 text-[11px] pt-1 border-t border-white/8">
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

          {/* Presets de Câmera */}
          <div className="rounded-xl bg-[#090c13] border border-white/10 p-3 flex flex-col gap-2">
            <span className="text-[11px] font-medium text-slate-400">
              Presets de Câmera (0 / 1 / 3 / 7)
            </span>
            <div className="grid grid-cols-5 gap-1">
              {CAMERA_PRESETS.map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  title={cam.tip}
                  onClick={() => onCameraPreset(cam.id)}
                  className="h-8 px-1 text-[10px] font-medium rounded-lg bg-[#121826] hover:bg-[#192235] text-slate-200 border border-white/10 cursor-pointer flex items-center justify-center"
                >
                  {cam.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
