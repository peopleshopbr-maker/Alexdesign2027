import JSZip from 'jszip';
import { ThreeStudioEngine } from '../graphics/threeStudioEngine';
import { analyzeMeshBoundsWasm, type MeshAnalysisInput } from './rustEngine';
import type { RenderSettings, SceneMode, RigExportProfile, AnimationActionCycle } from '../types/graphics';

export interface BlenderExportConfig {
  profile?: RigExportProfile;
  includeTransparentPreview?: boolean;
  multiActions?: AnimationActionCycle[];
  /** Arquivos adicionais embutidos no .ZIP (nome → bytes). */
  extraFiles?: Record<string, Uint8Array | string>;
}

export interface CameraConfig {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  target: [number, number, number];
}

export interface LightingConfig {
  preset: string;
  exposure: number;
  envIntensity: number;
  envRotationDeg: number;
  shadowIntensity: number;
}

export interface MeshBoundsConfig {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  radius: number;
}

export interface RustAnalysisConfig {
  vertexCount: number;
  triangleEstimate: number;
  bounds: MeshBoundsConfig;
  normalizedScale: number;
}

export interface SceneConfigJson {
  version: '1.0';
  exportedAt: string;
  engine: 'AlexDesign Studio';
  blenderVersion: '5.3+';
  camera: CameraConfig;
  lighting: LightingConfig;
  sceneMode: SceneMode;
  rustAnalysis?: RustAnalysisConfig;
  meshInfo: {
    name: string;
    triangleCount: number;
    hasArmature: boolean;
    hasAnimations: boolean;
    activeClipIndex: number;
    clipNames: string[];
  };
}

function threeToBlenderCoords(v: [number, number, number]): [number, number, number] {
  return [
    Number.isFinite(v[0]) ? v[0] : 0,
    Number.isFinite(v[2]) ? -v[2] : 0,
    Number.isFinite(v[1]) ? v[1] : 0,
  ];
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\.(glb|gltf|zip)$/i, '')
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .slice(0, 64);
}

async function exportSceneAsGlb(
  engine: ThreeStudioEngine,
  config: BlenderExportConfig
): Promise<Blob> {
  return engine.exportSampleGlb(config.profile, config.multiActions);
}

async function captureTransparentPreview(
  engine: ThreeStudioEngine
): Promise<Uint8Array | undefined> {
  try {
    const dataUrl = engine.captureFrame({ transparentBg: true, resolution: '1920x1080' });
    if (!dataUrl) return undefined;
    const b64 = dataUrl.split(',')[1] || '';
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

async function getRustAnalysis(engine: ThreeStudioEngine): Promise<RustAnalysisConfig | undefined> {
  try {
    const bounds = engine.getMeshBoundsForExport?.();
    if (!bounds) return undefined;

    const input: MeshAnalysisInput = {
      positions: bounds.positions,
      scaleFactor: 1.0,
    };
    const result = await analyzeMeshBoundsWasm(input);
    return {
      vertexCount: result.vertexCount,
      triangleEstimate: result.triangleEstimate,
      bounds: {
        min: result.bounds.min,
        max: result.bounds.max,
        center: result.bounds.center,
        size: result.bounds.size,
        radius: result.bounds.radius,
      },
      normalizedScale: result.normalizedScale,
    };
  } catch {
    return undefined;
  }
}

function buildSceneConfigJson(
  engine: ThreeStudioEngine,
  cameraQuat: [number, number, number, number],
  rustAnalysis: RustAnalysisConfig | undefined,
): SceneConfigJson {
  const settings = engine.getSettings?.() ?? ({} as RenderSettings);
  const lodTelemetry = engine.getLodTelemetry?.() ?? {
    loadedModelName: null,
    loadedMeshCount: 0,
    loadedClips: [],
    activeClipIndex: 0,
    boneCount: 0,
    triangles: 0,
  };

  const camera = engine.getCamera();
  const controls = engine.getControls();
  const cameraPos: [number, number, number] = [
    camera.position.x,
    camera.position.y,
    camera.position.z,
  ];
  const cameraTarget: [number, number, number] = [
    controls.target.x,
    controls.target.y,
    controls.target.z,
  ];

  const currentMetrics = engine.getCurrentMetrics?.();

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    engine: 'AlexDesign Studio',
    blenderVersion: '5.3+',
    camera: {
      position: threeToBlenderCoords(cameraPos),
      quaternion: cameraQuat,
      fov: camera.fov,
      target: threeToBlenderCoords(cameraTarget),
    },
    lighting: {
      preset: settings.lighting?.preset ?? 'studio',
      exposure: settings.lighting?.exposure ?? 1.1,
      envIntensity: settings.lighting?.envIntensity ?? 1.0,
      envRotationDeg: settings.lighting?.envRotationDeg ?? 0,
      shadowIntensity: settings.lighting?.shadowIntensity ?? 0.85,
    },
    sceneMode: settings.sceneMode ?? 'gltf',
    rustAnalysis,
    meshInfo: {
      name: lodTelemetry.loadedModelName ?? 'Vertice_Studio',
      triangleCount: currentMetrics?.triangles ?? lodTelemetry.loadedMeshCount ?? 0,
      hasArmature: lodTelemetry.boneCount > 0,
      hasAnimations: lodTelemetry.loadedClips.length > 0,
      activeClipIndex: lodTelemetry.activeClipIndex ?? 0,
      clipNames: lodTelemetry.loadedClips,
    },
  };
}

function buildBlenderPythonScript(
  sceneConfig: SceneConfigJson,
  glbFilename: string
): string {
  const safeGlb = glbFilename.replace(/"/g, '\\"');
  const safeName = sceneConfig.meshInfo.name.replace(/"/g, '\\"');
  const camPos = sceneConfig.camera.position;
  const camTarget = sceneConfig.camera.target;
  const camFov = sceneConfig.camera.fov;
  const light = sceneConfig.lighting;

  const lightPresets: Record<string, {
    keyRgb: [number, number, number];
    rimRgb: [number, number, number];
    worldRgb: [number, number, number];
    keyEnergy: number;
    rimEnergy: number;
    envStrength: number;
    exposure: number;
  }> = {
    dramatic: {
      keyRgb: [1.0, 0.92, 0.82],
      rimRgb: [0.35, 0.65, 1.0],
      worldRgb: [0.02, 0.03, 0.05],
      keyEnergy: 180 * light.shadowIntensity,
      rimEnergy: 120 * light.envIntensity,
      envStrength: 0.28 * light.envIntensity,
      exposure: (light.exposure - 1.0) * 0.9,
    },
    cyber: {
      keyRgb: [0.25, 0.82, 1.0],
      rimRgb: [0.95, 0.25, 0.78],
      worldRgb: [0.03, 0.02, 0.08],
      keyEnergy: 135 * light.shadowIntensity,
      rimEnergy: 155 * light.envIntensity,
      envStrength: 0.45 * light.envIntensity,
      exposure: (light.exposure - 1.0) * 0.9,
    },
    sunset: {
      keyRgb: [1.0, 0.58, 0.28],
      rimRgb: [0.95, 0.42, 0.65],
      worldRgb: [0.09, 0.04, 0.04],
      keyEnergy: 150 * light.shadowIntensity,
      rimEnergy: 110 * light.envIntensity,
      envStrength: 0.5 * light.envIntensity,
      exposure: (light.exposure - 1.0) * 0.9,
    },
    studio: {
      keyRgb: [0.98, 0.99, 1.0],
      rimRgb: [0.56, 0.82, 1.0],
      worldRgb: [0.04, 0.06, 0.09],
      keyEnergy: 125 * light.shadowIntensity,
      rimEnergy: 85 * light.envIntensity,
      envStrength: 0.6 * light.envIntensity,
      exposure: (light.exposure - 1.0) * 0.9,
    },
  };

  const l = lightPresets[light.preset] ?? lightPresets.studio;

  return `# ==============================================================================
# Vértice Studio — Script Automatizado para Blender 5.3+
# Compatível com Blender 5.3 / 5.4+ / 6.0+
# Como executar:
#   1) Extraia este .py na mesma pasta do arquivo "${safeGlb}"
#   2) Abra o Blender 5.3+ -> Scripting -> Open -> Run Script
#   Ou via terminal: blender --python "${safeGlb.replace('.glb', '.py')}"
# ==============================================================================
import os
import math
import bpy
import bmesh
from mathutils import Vector, Euler

GLB_FILENAME = "${safeGlb}"
SCENE_LABEL = "${safeName}"
TARGET_FPS = 30
FRAME_END = 60

CAM_LOCATION = (${camPos[0].toFixed(4)}, ${camPos[1].toFixed(4)}, ${camPos[2].toFixed(4)})
CAM_TARGET = (${camTarget[0].toFixed(4)}, ${camTarget[1].toFixed(4)}, ${camTarget[2].toFixed(4)})
CAM_FOV_DEG = ${camFov.toFixed(2)}

LIGHT_KEY_COLOR = (${l.keyRgb[0].toFixed(3)}, ${l.keyRgb[1].toFixed(3)}, ${l.keyRgb[2].toFixed(3)})
LIGHT_RIM_COLOR = (${l.rimRgb[0].toFixed(3)}, ${l.rimRgb[1].toFixed(3)}, ${l.rimRgb[2].toFixed(3)})
WORLD_BG_COLOR = (${l.worldRgb[0].toFixed(4)}, ${l.worldRgb[1].toFixed(4)}, ${l.worldRgb[2].toFixed(4)}, 1.0)
LIGHT_KEY_ENERGY = ${l.keyEnergy.toFixed(2)}
LIGHT_RIM_ENERGY = ${l.rimEnergy.toFixed(2)}
WORLD_ENV_STRENGTH = ${l.envStrength.toFixed(3)}
SCENE_EXPOSURE = ${l.exposure.toFixed(3)}

# ==============================================================================
# ACTIONS PROCEDURALS — 12 CLIPS (Idle ativo por padrão)
# ==============================================================================
PROCEDURAL_ACTIONS = [
    "Idle",         # Loop — respiração sutil
    "Walk",         # Loop — ciclo de caminhada
    "Run",          # Loop — ciclo de corrida
    "Jump",         # Once — antecipação + voo + pouso
    "Slash",        # Once — ataque de espada
    "Hit",          # Once — recoil de impacto
    "Death",        # Once — colapso progressivo
    "Block",        # Loop — pose de guarda
    "Fall",         # Loop — suspensão no ar
    "Land",         # Once — absorção de impacto
    "Dash",         # Once — esquiva explosiva
    "Interact",     # Once — pose de vitória/interação
    "ChestOpen",    # Once — abertura torácica (respiração profunda)
]

def ensure_object_mode():
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def get_or_create_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def get_material_node_tree(mat):
    if getattr(mat, "node_tree", None) is None and hasattr(mat, "use_nodes"):
        mat.use_nodes = True
    return mat.node_tree


def configure_render_engine(scene):
    target_engine = "BLENDER_EEVEE" if bpy.app.version >= (5, 0, 0) else "BLENDER_EEVEE_NEXT"
    try:
        scene.render.engine = target_engine
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    try:
        scene.view_settings.exposure = SCENE_EXPOSURE
    except Exception:
        pass


def setup_camera_and_lighting(scene, stage_col):
    # Câmera sincronizada com o viewport
    cam_data = bpy.data.cameras.new(name=f"{SCENE_LABEL}_Camera")
    cam_data.sensor_width = 36.0
    fov_rad = math.radians(CAM_FOV_DEG)
    cam_data.lens = 18.0 / max(0.05, math.tan(fov_rad * 0.5))
    cam_data.clip_start = 0.05
    cam_data.clip_end = 250.0

    cam_obj = bpy.data.objects.new(f"{SCENE_LABEL}_Camera", cam_data)
    cam_obj.location = CAM_LOCATION
    direction = Vector(CAM_TARGET) - Vector(CAM_LOCATION)
    if direction.length > 0.001:
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    stage_col.objects.link(cam_obj)
    scene.camera = cam_obj

    # Luz Principal (Key Light)
    key_data = bpy.data.lights.new(name=f"{SCENE_LABEL}_KeyLight", type="AREA")
    key_data.energy = LIGHT_KEY_ENERGY
    key_data.color = LIGHT_KEY_COLOR
    key_data.size = 3.2
    key_obj = bpy.data.objects.new(f"{SCENE_LABEL}_KeyLight", key_data)
    key_obj.location = (3.8, -3.5, 4.8)
    key_dir = Vector(CAM_TARGET) - key_obj.location
    if key_dir.length > 0.001:
        key_obj.rotation_euler = key_dir.to_track_quat("-Z", "Y").to_euler()
    stage_col.objects.link(key_obj)

    # Luz Rim
    rim_data = bpy.data.lights.new(name=f"{SCENE_LABEL}_RimLight", type="AREA")
    rim_data.energy = LIGHT_RIM_ENERGY
    rim_data.color = LIGHT_RIM_COLOR
    rim_data.size = 2.6
    rim_obj = bpy.data.objects.new(f"{SCENE_LABEL}_RimLight", rim_data)
    rim_obj.location = (-3.6, 3.8, 3.2)
    rim_dir = Vector(CAM_TARGET) - rim_obj.location
    if rim_dir.length > 0.001:
        rim_obj.rotation_euler = rim_dir.to_track_quat("-Z", "Y").to_euler()
    stage_col.objects.link(rim_obj)

    # Mundo / Ambiente
    if scene.world is None:
        scene.world = bpy.data.worlds.new(name=f"{SCENE_LABEL}_World")
    w_nt = get_material_node_tree(scene.world)
    if w_nt is not None:
        bg_node = next((n for n in w_nt.nodes if n.type == "BACKGROUND"), None)
        if bg_node:
            bg_node.inputs["Color"].default_value = WORLD_BG_COLOR
            bg_node.inputs["Strength"].default_value = WORLD_ENV_STRENGTH


def setup_compositor_bloom_53(scene):
    if hasattr(scene, "compositing_node_group"):
        ng = scene.compositing_node_group
        if ng is None:
            ng = bpy.data.node_groups.new(
                name=f"{SCENE_LABEL}_Compositor_53",
                type="CompositorNodeTree",
            )
            scene.compositing_node_group = ng
        ng.nodes.clear()

        if hasattr(ng, "interface"):
            has_out = any(
                getattr(item, "in_out", None) == "OUTPUT"
                for item in ng.interface.items_tree
            )
            if not has_out:
                ng.interface.new_socket(
                    name="Image",
                    in_out="OUTPUT",
                    socket_type="NodeSocketColor",
                )

        rl = ng.nodes.new(type="CompositorNodeRLayers")
        rl.location = (-360, 0)

        glare = ng.nodes.new(type="CompositorNodeGlare")
        glare.location = (0, 0)
        for sock_name, val in (
            ("Type", "Fog Glow"),
            ("Quality", "High"),
            ("Threshold", 0.9),
            ("Size", 6),
            ("Mix", 0.0),
        ):
            if sock_name in glare.inputs:
                try:
                    glare.inputs[sock_name].default_value = val
                except Exception:
                    pass

        out_node = ng.nodes.new(type="NodeGroupOutput")
        out_node.location = (320, 0)

        ng.links.new(rl.outputs["Image"], glare.inputs["Image"])
        ng.links.new(glare.outputs["Image"], out_node.inputs[0])
    elif hasattr(scene, "use_nodes") and hasattr(scene, "node_tree"):
        scene.use_nodes = True
        nt = scene.node_tree
        if nt is not None:
            nt.nodes.clear()
            rl = nt.nodes.new(type="CompositorNodeRLayers")
            glare = nt.nodes.new(type="CompositorNodeGlare")
            comp = nt.nodes.new(type="CompositorNodeComposite")
            nt.links.new(rl.outputs["Image"], glare.inputs["Image"])
            nt.links.new(glare.outputs["Image"], comp.inputs["Image"])


def setup_armature_rig_and_nla(armature_obj):
    if armature_obj is None:
        return
    armature_obj.show_in_front = True
    armature_obj.data.display_type = "OCTAHEDRAL"
    armature_obj.data.pose_position = "POSE"
    armature_obj["vertice_blender_53_ready"] = True

    deform_col = None
    if hasattr(armature_obj.data, "collections"):
        deform_col = armature_obj.data.collections.get("Vertice_Deform")
        if deform_col is None:
            deform_col = armature_obj.data.collections.new("Vertice_Deform")

    for bone in armature_obj.data.bones:
        bone.use_deform = True
        if deform_col is not None:
            deform_col.assign(bone)

    anim_data = armature_obj.animation_data
    if anim_data and anim_data.action:
        action = anim_data.action
        if hasattr(action, "slots"):
            if anim_data.action_slot is None and len(action.slots) > 0:
                anim_data.action_slot = action.slots[0]

    all_actions = list(bpy.data.actions)
    
    # Listar todas as 12 actions procedurais no console
    print("[Vertice Studio] === 12 Actions Procedurais Detectadas ===")
    for i, action_name in enumerate(PROCEDURAL_ACTIONS):
        print(f"[Vertice Studio]   {i+1:2d}. {action_name}")
    
    if anim_data and len(all_actions) > 1:
        frame_cursor = 1
        for idx, act in enumerate(all_actions):
            track = anim_data.nla_tracks.new()
            track.name = f"Vertice_Clip_{idx + 1}_{act.name}"
            strip = track.strips.new(act.name, frame_cursor, act)
            if hasattr(strip, "action_slot") and hasattr(act, "slots") and len(act.slots) > 0:
                strip.action_slot = act.slots[0]
            frame_cursor += max(24, int(act.frame_range[1] - act.frame_range[0]) + 4)
            
            # Ativar 'Idle' por padrão
            if act.name == "Idle" and anim_data.action_slot is None:
                anim_data.action = act
                anim_data.action_slot = act.slots[0] if act.slots else None

    print(
        f"[Vertice] Armature configurada para Blender 5.3+ com {len(armature_obj.data.bones)} ossos "
        f"(Total Clips NLA: {len(all_actions)})."
    )


def main():
    ensure_object_mode()
    script_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    glb_path = os.path.join(script_dir, GLB_FILENAME)
    if not os.path.exists(glb_path):
        raise FileNotFoundError(f"Arquivo GLB não encontrado ao lado do script: {glb_path}")

    scene = bpy.context.scene
    configure_render_engine(scene)
    scene.render.fps = TARGET_FPS
    scene.frame_start = 1
    scene.frame_end = FRAME_END

    try:
        bpy.ops.import_scene.gltf(filepath=glb_path, bone_heuristic="TEMPERANCE")
    except TypeError:
        bpy.ops.import_scene.gltf(filepath=glb_path)

    armature_obj = next(
        (obj for obj in bpy.context.selected_objects if obj.type == "ARMATURE"),
        next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None),
    )
    setup_armature_rig_and_nla(armature_obj)

    stage_col = get_or_create_collection(f"{SCENE_LABEL}_Stage")
    setup_camera_and_lighting(scene, stage_col)
    setup_compositor_bloom_53(scene)

    print(
        f"[Vertice] Cena '{SCENE_LABEL}' importada e pronta no Blender {bpy.app.version_string} "
        f"({FRAME_END} quadros @ {TARGET_FPS} FPS)."
    )


if __name__ == "__main__":
    main()
`;
}

function buildReadmeTxt(sceneConfig: SceneConfigJson, glbFilename: string, pyFilename: string): string {
  return `Vértice Studio — Pacote Completo para Blender 5.3+ (e superiores)
=================================================================

1. Arquivo 3D glTF 2.0 Binário: ${glbFilename}
2. Configuração da Cena (JSON): cena_config.json
3. Script Automatizado Blender 5.3+: ${pyFilename}

Como abrir no Blender 5.3 ou superior:
  - Extraia todos os arquivos deste .ZIP na mesma pasta.
  - Abra o Blender 5.3+ -> aba Scripting -> Open -> selecione "${pyFilename}" -> Run Script.
  - Ou importe apenas "${glbFilename}" via File -> Import -> glTF 2.0 (.glb/.gltf).

Recursos incluídos no padrão Blender 5.3+:
  * Principled BSDF com KHR_materials_dispersion, iridescence, clearcoat, transmission e IOR.
  * Armature + Bone Collections ("Vertice_Deform") + Slotted Actions + NLA Tracks multi-clip.
  * Sincronia de Câmera (FOV/posição/alvo), Luzes Key/Rim, World Environment e Exposure.
  * Compositor moderno (scene.compositing_node_group + NodeGroupOutput + Glare).
  * Configuração exata da câmera e iluminação do viewport exportada via cena_config.json.

Metadados da exportação:
  - Engine: ${sceneConfig.engine}
  - Versão Blender: ${sceneConfig.blenderVersion}
  - Exportado em: ${sceneConfig.exportedAt}
  - Modo da Cena: ${sceneConfig.sceneMode}
  - Modelo: ${sceneConfig.meshInfo.name}
  - Triângulos: ${sceneConfig.meshInfo.triangleCount.toLocaleString()}
  - Tem Armature: ${sceneConfig.meshInfo.hasArmature ? 'Sim' : 'Não'}
  - Tem Animações: ${sceneConfig.meshInfo.hasAnimations ? 'Sim' : 'Não'}
  - Clipes: ${sceneConfig.meshInfo.clipNames.join(', ') || 'Nenhum'}
`;
}

export async function exportBlender53Package(
  engine: ThreeStudioEngine,
  cameraQuaternion: [number, number, number, number],
  config: BlenderExportConfig = {}
): Promise<Blob> {
  const profile = config.profile ?? 'standard';
  const baseName = sanitizeFilename(engine.getLoadedModelName?.() ?? `vertice-studio-${profile}`);
  const glbFilename = `${baseName}_blender53.glb`;
  const pyFilename = `abrir_no_blender.py`;
  const configFilename = 'cena_config.json';

  // 1. Export GLB
  const glbBlob = await exportSceneAsGlb(engine, config);
  const glbArrayBuffer = await glbBlob.arrayBuffer();
  const glbBytes = new Uint8Array(glbArrayBuffer);

  // 2. Capture transparent preview
  const transparentPreview = config.includeTransparentPreview !== false
    ? await captureTransparentPreview(engine)
    : undefined;

  // 3. Get Rust analysis
  const rustAnalysis = await getRustAnalysis(engine);

  // 4. Build scene config JSON
  const sceneConfig = buildSceneConfigJson(engine, cameraQuaternion, rustAnalysis);
  const configJson = JSON.stringify(sceneConfig, null, 2);

  // 5. Build Python script
  const pythonScript = buildBlenderPythonScript(sceneConfig, glbFilename);

  // 6. Build README
  const readmeTxt = buildReadmeTxt(sceneConfig, glbFilename, pyFilename);

  // 7. Create ZIP with JSZip
  const zip = new JSZip();
  zip.file(glbFilename, glbBytes);
  zip.file(configFilename, configJson);
  zip.file(pyFilename, pythonScript);
  zip.file('LEIAME_BLENDER_5_3.txt', readmeTxt);
  if (transparentPreview) {
    zip.file('quadro_transparente.png', transparentPreview);
  }
  if (config.extraFiles) {
    for (const [name, data] of Object.entries(config.extraFiles)) {
      zip.file(name, data);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return zipBlob;
}

export async function downloadBlender53Package(
  engine: ThreeStudioEngine,
  cameraQuaternion: [number, number, number, number],
  config: BlenderExportConfig = {}
): Promise<void> {
  const profile = config.profile ?? 'standard';
  const baseName = sanitizeFilename(engine.getLoadedModelName?.() ?? `vertice-studio-${profile}`);
  const zipFilename = `${baseName}_Blender53_Pack.zip`;

  const zipBlob = await exportBlender53Package(engine, cameraQuaternion, config);

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}