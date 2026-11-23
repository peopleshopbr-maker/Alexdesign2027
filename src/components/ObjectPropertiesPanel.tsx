import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  ImagePlus,
  ListTree,
  Maximize2,
  MousePointer,
  Move,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type {
  GizmoMode,
  MaterialPresetId,
  PbrTextureSlot,
  RenderSettings,
  SelectedObjectInfo,
} from '../types/graphics';

interface ObjectPropertiesPanelProps {
  selected: SelectedObjectInfo | null;
  gizmoMode: GizmoMode;
  settings: RenderSettings;
  onUpdateSettings: (patch: Partial<RenderSettings>) => void;
  onChangeGizmoMode: (mode: GizmoMode) => void;
  onUpdateProperty: (patch: {
    position?: [number, number, number];
    rotationDeg?: [number, number, number];
    scale?: [number, number, number];
    colorHex?: string;
    metalness?: number;
    roughness?: number;
    wireframe?: boolean;
    visible?: boolean;
    frustumCulled?: boolean;
  }) => void;
  onApplyMaterialPreset: (presetId: MaterialPresetId) => void;
  onApplyCustomTexture: (slot: PbrTextureSlot, file: File) => void;
  onClearCustomTextures: () => void;
  onFocusObject: () => void;
  onSnapToGround: () => void;
  onClearSelection: () => void;
  onDuplicateObject: () => void;
  onDeleteObject: () => void;
  onOpenOutliner: () => void;
}

const PBR_TEXTURE_SLOTS: Array<{ slot: PbrTextureSlot; label: string }> = [
  { slot: 'map', label: 'Albedo' },
  { slot: 'normalMap', label: 'Normal' },
  { slot: 'roughnessMap', label: 'Roughness' },
  { slot: 'metalnessMap', label: 'Metallic' },
  { slot: 'emissiveMap', label: 'Emissive' },
];

const MATERIAL_PRESETS: Array<{ id: MaterialPresetId; label: string; swatch: string }> = [
  { id: 'frosted_glass', label: 'Vidro Fosco', swatch: 'bg-sky-200/80' },
  { id: 'carbon', label: 'Carbono', swatch: 'bg-slate-700' },
  { id: 'brushed_copper', label: 'Cobre', swatch: 'bg-amber-600' },
  { id: 'matte_ceramic', label: 'Cerâmica', swatch: 'bg-slate-100' },
  { id: 'neon_glow', label: 'Neon Glow', swatch: 'bg-cyan-400' },
  { id: 'obsidian_rubber', label: 'Borracha', swatch: 'bg-zinc-900' },
];

export function ObjectPropertiesPanel({
  selected,
  gizmoMode,
  settings,
  onUpdateSettings,
  onChangeGizmoMode,
  onUpdateProperty,
  onApplyMaterialPreset,
  onApplyCustomTexture,
  onClearCustomTextures,
  onFocusObject,
  onSnapToGround,
  onClearSelection,
  onDuplicateObject,
  onDeleteObject,
  onOpenOutliner,
}: ObjectPropertiesPanelProps) {
  const [retracted, setRetracted] = useState(false);
  const textureInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<PbrTextureSlot>('map');

  if (!selected) return null;

  if (retracted) {
    return (
      <button
        type="button"
        onClick={() => setRetracted(false)}
        title="Expandir Inspetor de Propriedades"
        className="fixed top-[148px] sm:top-48 right-2 sm:right-4 z-20 h-9 px-3 rounded-xl bg-[#101521]/95 border border-white/12 text-xs font-medium text-sky-200 hover:text-white shadow-xl flex items-center gap-1.5 cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5 text-sky-400" />
        <span className="max-w-[96px] sm:max-w-[110px] truncate">{selected.name}</span>
      </button>
    );
  }

  const updatePos = (axis: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [...selected.position];
    next[axis] = value;
    onUpdateProperty({ position: next });
  };

  const updateRot = (axis: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [...selected.rotationDeg];
    next[axis] = value;
    onUpdateProperty({ rotationDeg: next });
  };

  const updateScale = (axis: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [...selected.scale];
    next[axis] = Math.max(0.05, value);
    onUpdateProperty({ scale: next });
  };

  const axisColors = ['text-rose-400', 'text-emerald-400', 'text-sky-400'] as const;
  const gizmoButtons: Array<{ id: GizmoMode; label: string; tip: string; icon: typeof Move }> = [
    { id: 'orbit', label: 'Órbita', tip: 'Órbita livre (Q)', icon: MousePointer },
    { id: 'translate', label: 'Mover', tip: 'Mover objeto (G)', icon: Move },
    { id: 'rotate', label: 'Girar', tip: 'Girar objeto (R)', icon: RotateCw },
    { id: 'scale', label: 'Escala', tip: 'Escalar objeto (S)', icon: Maximize2 },
  ];

  return (
    <aside
      aria-label="Propriedades do objeto selecionado"
      className="fixed left-12 right-2 bottom-[66px] max-h-[58dvh] md:left-auto md:top-[68px] md:right-4 md:bottom-auto md:w-80 md:max-h-[calc(100dvh-13rem)] z-20 overflow-y-auto bg-[#101521]/95 backdrop-blur-md border border-white/12 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3.5"
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{selected.name}</h2>
          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            {selected.geometryType} · {selected.triangles.toLocaleString('pt-BR')} tris
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onOpenOutliner}
            title="Ver lista de objetos da cena (Outliner)"
            aria-label="Outliner da Cena"
            className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <ListTree className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onFocusObject}
            title="Focar câmera no objeto (F)"
            aria-label="Focar câmera no objeto"
            className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onSnapToGround}
            title="Apoiar no piso (Y = 0)"
            aria-label="Apoiar no piso (Y = 0)"
            className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDuplicateObject}
            title="Duplicar objeto (Ctrl+D)"
            aria-label="Duplicar objeto"
            className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDeleteObject}
            title="Excluir objeto (Delete)"
            aria-label="Excluir objeto"
            className="w-7 h-7 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/15 flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRetracted(true)}
            title="Recolher inspetor lateral"
            aria-label="Recolher inspetor"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            title="Desselecionar e fechar"
            aria-label="Fechar inspetor"
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Gizmo 3D Universal (em qualquer modo de cena) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-300">Gizmo 3D (Q / G / R / S)</span>
        <div className="grid grid-cols-4 gap-1.5">
          {gizmoButtons.map((g) => {
            const Icon = g.icon;
            const active = gizmoMode === g.id;
            return (
              <button
                key={g.id}
                type="button"
                title={g.tip}
                aria-pressed={active}
                onClick={() => onChangeGizmoMode(g.id)}
                className={`h-8 px-1 rounded-lg border flex items-center justify-center gap-1 text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                    : 'bg-[#080b11] text-slate-300 border-white/10 hover:bg-[#141b29] hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span>{g.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Posição X/Y/Z */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-300">Posição</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axisLabel, idx) => (
            <label
              key={axisLabel}
              className="h-8 flex items-center gap-1 px-2 rounded-lg bg-[#080b11] border border-white/12 focus-within:border-sky-400"
            >
              <span className={`text-[11px] font-bold ${axisColors[idx]}`}>{axisLabel}</span>
              <input
                type="number"
                step={0.1}
                value={selected.position[idx]}
                onChange={(e) => updatePos(idx as 0 | 1 | 2, Number(e.target.value) || 0)}
                className="w-full bg-transparent text-xs font-mono tabular-nums text-slate-100 outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Rotação (°) X/Y/Z */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-300">Rotação (°)</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axisLabel, idx) => (
            <label
              key={axisLabel}
              className="h-8 flex items-center gap-1 px-2 rounded-lg bg-[#080b11] border border-white/12 focus-within:border-sky-400"
            >
              <span className={`text-[11px] font-bold ${axisColors[idx]}`}>{axisLabel}</span>
              <input
                type="number"
                step={5}
                value={selected.rotationDeg[idx]}
                onChange={(e) => updateRot(idx as 0 | 1 | 2, Number(e.target.value) || 0)}
                className="w-full bg-transparent text-xs font-mono tabular-nums text-slate-100 outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Escala X/Y/Z */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-300">Escala</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axisLabel, idx) => (
            <label
              key={axisLabel}
              className="h-8 flex items-center gap-1 px-2 rounded-lg bg-[#080b11] border border-white/12 focus-within:border-sky-400"
            >
              <span className={`text-[11px] font-bold ${axisColors[idx]}`}>{axisLabel}</span>
              <input
                type="number"
                step={0.05}
                min={0.05}
                value={selected.scale[idx]}
                onChange={(e) => updateScale(idx as 0 | 1 | 2, Number(e.target.value) || 0.1)}
                className="w-full bg-transparent text-xs font-mono tabular-nums text-slate-100 outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Material PBR */}
      {selected.hasStandardMaterial && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Material PBR</span>
            <input
              type="color"
              aria-label="Cor do material"
              value={selected.colorHex}
              onChange={(e) => onUpdateProperty({ colorHex: e.target.value })}
              className="w-8 h-6 rounded border border-white/15 bg-transparent cursor-pointer"
            />
          </div>

          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="text-slate-400">Metalness</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={selected.metalness}
              onChange={(e) => onUpdateProperty({ metalness: Number(e.target.value) })}
              className="studio-slider w-32"
            />
            <span className="font-mono tabular-nums w-9 text-right">
              {selected.metalness.toFixed(2)}
            </span>
          </label>

          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="text-slate-400">Roughness</span>
            <input
              type="range"
              min={0.02}
              max={1}
              step={0.02}
              value={selected.roughness}
              onChange={(e) => onUpdateProperty({ roughness: Number(e.target.value) })}
              className="studio-slider w-32"
            />
            <span className="font-mono tabular-nums w-9 text-right">
              {selected.roughness.toFixed(2)}
            </span>
          </label>

          {/* Mapas de Textura PBR Customizados */}
          <div className="flex flex-col gap-1.5 pt-1">
            <input
              ref={textureInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onApplyCustomTexture(pendingSlotRef.current, file);
                }
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                <ImagePlus className="w-3 h-3 text-sky-400" />
                <span>Texturas PBR (Imagem)</span>
              </span>
              <button
                type="button"
                onClick={onClearCustomTextures}
                title="Remover texturas customizadas aplicadas"
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Limpar</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {PBR_TEXTURE_SLOTS.map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  onClick={() => {
                    pendingSlotRef.current = item.slot;
                    textureInputRef.current?.click();
                  }}
                  className="h-7 px-1.5 rounded-lg bg-[#080b11] hover:bg-[#141b29] text-[10px] font-medium text-slate-200 border border-white/10 hover:border-sky-400/45 cursor-pointer truncate"
                >
                  + {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Biblioteca de Materiais PBR com 1 Clique */}
      <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
        <span className="text-[11px] font-medium text-slate-300">Biblioteca PBR</span>
        <div className="grid grid-cols-3 gap-1.5">
          {MATERIAL_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onApplyMaterialPreset(p.id)}
              className="h-7 px-1.5 rounded-lg bg-[#080b11] hover:bg-[#141b29] text-[10px] font-medium text-slate-200 border border-white/10 flex items-center gap-1.5 cursor-pointer truncate"
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 border border-white/20 ${p.swatch}`} />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Controles Contextuais: Uniforms Shader ou Luz de Cena */}
      {settings.sceneMode === 'shader' && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
          <span className="text-[11px] font-medium text-sky-300">Uniforms do Shader (Tempo Real)</span>
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="text-slate-400">uTurbulence</span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={settings.turbulence}
              onChange={(e) => onUpdateSettings({ turbulence: Number(e.target.value) })}
              className="studio-slider w-28"
            />
            <span className="font-mono tabular-nums w-9 text-right">
              {settings.turbulence.toFixed(2)}
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="text-slate-400">uFrequency</span>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={settings.frequency}
              onChange={(e) => onUpdateSettings({ frequency: Number(e.target.value) })}
              className="studio-slider w-28"
            />
            <span className="font-mono tabular-nums w-9 text-right">
              {settings.frequency.toFixed(1)}
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
        <span className="text-[11px] font-medium text-slate-300">Luz &amp; Exposição da Cena</span>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span className="text-slate-400">Exposição</span>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.05}
            value={settings.lighting.exposure}
            onChange={(e) =>
              onUpdateSettings({
                lighting: { ...settings.lighting, exposure: Number(e.target.value) },
              })
            }
            className="studio-slider w-28"
          />
          <span className="font-mono tabular-nums w-9 text-right">
            {settings.lighting.exposure.toFixed(2)}
          </span>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span className="text-slate-400">Sombra</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={settings.lighting.shadowIntensity}
            onChange={(e) =>
              onUpdateSettings({
                lighting: { ...settings.lighting, shadowIntensity: Number(e.target.value) },
              })
            }
            className="studio-slider w-28"
          />
          <span className="font-mono tabular-nums w-9 text-right">
            {settings.lighting.shadowIntensity.toFixed(2)}
          </span>
        </label>
      </div>

      {/* Otimização & Visibilidade */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5">
        <button
          type="button"
          aria-pressed={selected.wireframe}
          onClick={() => onUpdateProperty({ wireframe: !selected.wireframe })}
          className={`h-8 px-3 text-xs font-medium rounded-lg border cursor-pointer flex items-center justify-center ${
            selected.wireframe
              ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
              : 'bg-[#080b11] text-slate-300 border-white/10 hover:bg-[#141b29] hover:text-white'
          }`}
        >
          Wireframe
        </button>

        <button
          type="button"
          aria-pressed={!selected.visible}
          onClick={() => onUpdateProperty({ visible: !selected.visible })}
          className={`h-8 px-3 text-xs font-medium rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${
            selected.visible
              ? 'bg-[#080b11] text-slate-300 border-white/10 hover:bg-[#141b29] hover:text-white'
              : 'bg-amber-500/20 text-amber-200 border-amber-400/50'
          }`}
        >
          {selected.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{selected.visible ? 'Visível' : 'Oculto'}</span>
        </button>
      </div>
    </aside>
  );
}
