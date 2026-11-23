import { zipSync } from 'fflate';
import type {
  GeometryNodesSettings,
  LightingSettings,
} from '../types/graphics';
import {
  generateBlenderVfxScriptWasm,
  isRustEngineAvailable,
  type RustSceneData,
} from './rustEngine';

export interface BlenderSceneSyncExtras {
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
  };
  lighting?: LightingSettings;
  geometryNodes?: GeometryNodesSettings;
  clipNames?: string[];
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return [0.22, 0.74, 0.97];
}

function sanitizePyStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function threeToBlenderCoords(v: [number, number, number]): [number, number, number] {
  // Three.js Y-up (X, Y, Z) -> glTF/Blender Z-up (X, -Z, Y)
  return [
    Number.isFinite(v[0]) ? v[0] : 0,
    Number.isFinite(v[2]) ? -v[2] : 0,
    Number.isFinite(v[1]) ? v[1] : 0,
  ];
}

function resolveLightingColors(lighting?: LightingSettings): {
  keyRgb: [number, number, number];
  rimRgb: [number, number, number];
  worldRgb: [number, number, number];
  keyEnergy: number;
  rimEnergy: number;
  envStrength: number;
  exposure: number;
} {
  const preset = lighting?.preset ?? 'studio';
  const envMult = Math.max(0.1, Math.min(2.5, lighting?.envIntensity ?? 1.0));
  const shadowMult = Math.max(0.1, Math.min(2.0, lighting?.shadowIntensity ?? 0.85));
  const exposure = Math.max(-2.0, Math.min(2.0, ((lighting?.exposure ?? 1.1) - 1.0) * 0.9));

  if (preset === 'dramatic') {
    return {
      keyRgb: [1.0, 0.92, 0.82],
      rimRgb: [0.35, 0.65, 1.0],
      worldRgb: [0.02, 0.03, 0.05],
      keyEnergy: 180 * shadowMult,
      rimEnergy: 120 * envMult,
      envStrength: 0.28 * envMult,
      exposure,
    };
  }
  if (preset === 'cyber') {
    return {
      keyRgb: [0.25, 0.82, 1.0],
      rimRgb: [0.95, 0.25, 0.78],
      worldRgb: [0.03, 0.02, 0.08],
      keyEnergy: 135 * shadowMult,
      rimEnergy: 155 * envMult,
      envStrength: 0.45 * envMult,
      exposure,
    };
  }
  if (preset === 'sunset') {
    return {
      keyRgb: [1.0, 0.58, 0.28],
      rimRgb: [0.95, 0.42, 0.65],
      worldRgb: [0.09, 0.04, 0.04],
      keyEnergy: 150 * shadowMult,
      rimEnergy: 110 * envMult,
      envStrength: 0.5 * envMult,
      exposure,
    };
  }
  return {
    keyRgb: [0.98, 0.99, 1.0],
    rimRgb: [0.56, 0.82, 1.0],
    worldRgb: [0.04, 0.06, 0.09],
    keyEnergy: 125 * shadowMult,
    rimEnergy: 85 * envMult,
    envStrength: 0.6 * envMult,
    exposure,
  };
}

/**
 * Gera script Python (.py) 100% compatível com Blender 5.3+ (e versões superiores 5.4+ / 6.0+):
 * - Compositor via `scene.compositing_node_group` + `NodeGroupOutput` + `interface.new_socket`
 * - Engine `'BLENDER_EEVEE'` (padrão restaurado no Blender 5.0+, sem `_NEXT`)
 * - Criação de malhas context-free via `bmesh` (funciona na UI e em `--background`)
 * - VFX + MoGraph procedurais via Geometry Nodes (`GeometryNodeTree`)
 * - Bone Collections (`armature.data.collections`), Slotted Actions (`action.slots`) e NLA Tracks
 * - Sincronia exata de Câmera, Luzes, Exposição e Mundo
 */
export function buildBlender53PythonScriptSync(
  scene: RustSceneData,
  glbFilename: string,
  scriptFilename = 'abrir_no_blender_5_3.py',
  extras?: BlenderSceneSyncExtras
): string {
  const fps = Math.max(12, Math.min(120, Math.round(scene.fps || 30)));
  const totalFrames = Math.max(24, Math.round(Math.max(0.5, scene.duration || 2.0) * fps));
  const safeGlb = sanitizePyStr(glbFilename);
  const safeScene = sanitizePyStr(scene.sceneName || 'VerticeStudio');
  const safeScript = sanitizePyStr(scriptFilename);

  const camPos = threeToBlenderCoords(extras?.camera?.position ?? [5.4, 3.6, 6.2]);
  const camTarget = threeToBlenderCoords(extras?.camera?.target ?? [0, 1.0, 0]);
  const camFov = Math.max(20, Math.min(100, extras?.camera?.fov ?? 45));
  const lightCfg = resolveLightingColors(extras?.lighting);

  const moNodes = extras?.geometryNodes;
  const moEnabled = Boolean(moNodes?.enabled);
  const moDist = sanitizePyStr(moNodes?.distribution ?? 'radial');
  const moEff = sanitizePyStr(moNodes?.effector ?? 'wave');
  const moClones = Math.max(4, Math.min(36, Math.round(moNodes?.cloneCount ?? 8)));
  const moSpacing = Math.max(0.4, Math.min(4.0, moNodes?.spacing ?? 1.6));
  const moStrength = Math.max(0.0, Math.min(2.0, moNodes?.strength ?? 0.45));
  const moSpeed = Math.max(0.05, Math.min(3.0, moNodes?.speed ?? 1.0));

  const emittersCode = scene.emitters
    .map((emitter, idx) => {
      const index = idx + 1;
      const [r, g, b] = hexToRgbTuple(emitter.colorHex);
      const safeName = sanitizePyStr(emitter.name);
      const safeBone = sanitizePyStr(emitter.attachBone);
      const density = Math.max(6, Math.min(180, (emitter.rate || 24) / 2));
      const speed = Math.max(0.05, emitter.speed || 1.0);
      const spread = Math.max(0.05, Math.min(2.5, emitter.spread || 0.45));
      const pSize = Math.max(0.008, Math.min(0.5, emitter.particleSize || 0.035));
      const turbulence = Math.max(0.0, Math.min(2.0, emitter.turbulence || 0.35));
      const isAura = emitter.emitterType === 'aura' ? 'True' : 'False';

      return `    # --- Emissor Geometry Nodes VFX ${index}: ${safeName} (osso: ${safeBone}) ---
    inst_mesh = create_icosphere_object(
        name="${safeName}_ParticleMesh_${index}",
        radius=${pSize.toFixed(4)},
        subdivisions=2,
        location=(0.0, 0.0, 0.0),
        target_col=vfx_col,
    )
    inst_mesh.hide_viewport = True
    inst_mesh.hide_render = True

    em_mat = create_emission_material(
        name="${safeName}_EmissionMat_${index}",
        rgba=(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, 1.0),
        strength=4.5,
    )
    inst_mesh.data.materials.append(em_mat)

    emitter_obj = create_icosphere_object(
        name="${safeName}_VFX_Emitter_${index}",
        radius=0.14 if ${isAura} else 0.065,
        subdivisions=2,
        location=(0.0, 0.0, 1.15),
        target_col=vfx_col,
    )
    emitter_obj.display_type = "WIRE"

    if armature_obj and "${safeBone}" in armature_obj.data.bones:
        emitter_obj.parent = armature_obj
        emitter_obj.parent_type = "BONE"
        emitter_obj.parent_bone = "${safeBone}"
        emitter_obj.location = (0.0, 0.0, 0.0)

    attach_geometry_nodes_vfx(
        emitter_obj=emitter_obj,
        instance_obj=inst_mesh,
        material=em_mat,
        density=${density.toFixed(2)},
        speed=${speed.toFixed(3)},
        spread=${spread.toFixed(3)},
        turbulence=${turbulence.toFixed(3)},
        idx=${index},
    )`;
    })
    .join('\n\n');

  return `# ==============================================================================
# Vértice Studio — Script Automatizado para Blender 5.3+ (e superiores)
# Compatível com Blender 5.3 / 5.4+ / 6.0+ (CompositorNodeTree, Slotted Actions,
# NLA Tracks, Bone Collections, Geometry Nodes VFX & MoGraph, Câmera & Luzes)
# Como executar no Blender 5.3+:
#   1) Extraia este .py na mesma pasta do arquivo "${safeGlb}"
#   2) Abra o Blender 5.3+ -> Scripting -> Open -> Run Script
#   Ou via terminal: blender --python "${safeScript}"
# ==============================================================================
import os
import math
import bpy
import bmesh
from mathutils import Vector

GLB_FILENAME = "${safeGlb}"
SCENE_LABEL = "${safeScene}"
TARGET_FPS = ${fps}
FRAME_END = ${totalFrames}

CAM_LOCATION = (${camPos[0].toFixed(4)}, ${camPos[1].toFixed(4)}, ${camPos[2].toFixed(4)})
CAM_TARGET = (${camTarget[0].toFixed(4)}, ${camTarget[1].toFixed(4)}, ${camTarget[2].toFixed(4)})
CAM_FOV_DEG = ${camFov.toFixed(2)}

LIGHT_KEY_COLOR = (${lightCfg.keyRgb[0].toFixed(3)}, ${lightCfg.keyRgb[1].toFixed(3)}, ${lightCfg.keyRgb[2].toFixed(3)})
LIGHT_RIM_COLOR = (${lightCfg.rimRgb[0].toFixed(3)}, ${lightCfg.rimRgb[1].toFixed(3)}, ${lightCfg.rimRgb[2].toFixed(3)})
WORLD_BG_COLOR = (${lightCfg.worldRgb[0].toFixed(4)}, ${lightCfg.worldRgb[1].toFixed(4)}, ${lightCfg.worldRgb[2].toFixed(4)}, 1.0)
LIGHT_KEY_ENERGY = ${lightCfg.keyEnergy.toFixed(2)}
LIGHT_RIM_ENERGY = ${lightCfg.rimEnergy.toFixed(2)}
WORLD_ENV_STRENGTH = ${lightCfg.envStrength.toFixed(3)}
SCENE_EXPOSURE = ${lightCfg.exposure.toFixed(3)}

MOGRAPH_ENABLED = ${moEnabled ? 'True' : 'False'}
MOGRAPH_DISTRIBUTION = "${moDist}"
MOGRAPH_EFFECTOR = "${moEff}"
MOGRAPH_CLONES = ${moClones}
MOGRAPH_SPACING = ${moSpacing.toFixed(3)}
MOGRAPH_STRENGTH = ${moStrength.toFixed(3)}
MOGRAPH_SPEED = ${moSpeed.toFixed(3)}


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


def create_emission_material(name, rgba, strength=4.5):
    mat = bpy.data.materials.new(name=name)
    nt = get_material_node_tree(mat)
    nt.nodes.clear()
    out_node = nt.nodes.new(type="ShaderNodeOutputMaterial")
    out_node.location = (260, 0)
    emit_node = nt.nodes.new(type="ShaderNodeEmission")
    emit_node.location = (0, 0)
    emit_node.inputs["Color"].default_value = rgba
    emit_node.inputs["Strength"].default_value = strength
    nt.links.new(emit_node.outputs["Emission"], out_node.inputs["Surface"])
    return mat


def create_icosphere_object(name, radius, subdivisions, location, target_col):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    target_col.objects.link(obj)
    return obj


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

    # Luz Principal (Key Light) + Rim Light sincronizados
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


def attach_geometry_nodes_vfx(emitter_obj, instance_obj, material, density, speed, spread, turbulence, idx):
    mod = emitter_obj.modifiers.new(name=f"Vertice_VFX_Nodes_{idx}", type="NODES")
    ng = bpy.data.node_groups.new(name=f"{emitter_obj.name}_GeoNodes", type="GeometryNodeTree")
    mod.node_group = ng

    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")

    nodes = ng.nodes
    links = ng.links

    g_in = nodes.new("NodeGroupInput")
    g_in.location = (-720, 0)
    g_out = nodes.new("NodeGroupOutput")
    g_out.location = (680, 0)

    distrib = nodes.new("GeometryNodeDistributePointsOnFaces")
    distrib.location = (-460, 80)
    if "Density" in distrib.inputs:
        distrib.inputs["Density"].default_value = density

    time_node = nodes.new("GeometryNodeInputSceneTime")
    time_node.location = (-720, -240)

    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-460, -240)
    if "Scale" in noise.inputs:
        noise.inputs["Scale"].default_value = 1.6 + turbulence
    if "Roughness" in noise.inputs:
        noise.inputs["Roughness"].default_value = 0.55

    sub_half = nodes.new("ShaderNodeVectorMath")
    sub_half.operation = "SUBTRACT"
    sub_half.location = (-240, -240)
    sub_half.inputs[1].default_value = (0.5, 0.5, 0.5)

    scale_vec = nodes.new("ShaderNodeVectorMath")
    scale_vec.operation = "SCALE"
    scale_vec.location = (-40, -240)
    scale_vec.inputs["Scale"].default_value = spread * 0.45

    set_pos = nodes.new("GeometryNodeSetPosition")
    set_pos.location = (80, 80)

    obj_info = nodes.new("GeometryNodeObjectInfo")
    obj_info.location = (80, -140)
    if "Object" in obj_info.inputs:
        obj_info.inputs["Object"].default_value = instance_obj

    inst_pts = nodes.new("GeometryNodeInstanceOnPoints")
    inst_pts.location = (300, 80)

    set_mat = nodes.new("GeometryNodeSetMaterial")
    set_mat.location = (500, 80)
    if "Material" in set_mat.inputs:
        set_mat.inputs["Material"].default_value = material

    links.new(g_in.outputs["Geometry"], distrib.inputs["Mesh"])
    links.new(time_node.outputs["Seconds"], noise.inputs["W"] if "W" in noise.inputs else noise.inputs["Scale"])
    links.new(noise.outputs["Color"], sub_half.inputs[0])
    links.new(sub_half.outputs["Vector"], scale_vec.inputs[0])
    links.new(distrib.outputs["Points"], set_pos.inputs["Geometry"])
    links.new(scale_vec.outputs["Vector"], set_pos.inputs["Offset"])
    links.new(set_pos.outputs["Geometry"], inst_pts.inputs["Points"])
    links.new(obj_info.outputs["Geometry"], inst_pts.inputs["Instance"])
    links.new(inst_pts.outputs["Instances"], set_mat.inputs["Geometry"])
    links.new(set_mat.outputs["Geometry"], g_out.inputs["Geometry"])

    emitter_obj.driver_remove("rotation_euler", 2)
    drv = emitter_obj.driver_add("rotation_euler", 2).driver
    drv.expression = f"frame * {0.025 * speed:.4f}"


def setup_mograph_geometry_nodes_53(target_col):
    if not MOGRAPH_ENABLED:
        return
    base_mesh = bpy.data.meshes.new("Vertice_MoGraph_Host_Mesh")
    host_obj = bpy.data.objects.new("Vertice_MoGraph_53", base_mesh)
    host_obj.location = (0.0, 0.0, 0.9)
    target_col.objects.link(host_obj)

    clone_proto = create_icosphere_object(
        name="Vertice_MoGraph_CloneProto",
        radius=0.075,
        subdivisions=2,
        location=(0.0, 0.0, 0.0),
        target_col=target_col,
    )
    clone_proto.hide_viewport = True
    clone_proto.hide_render = True
    clone_mat = create_emission_material(
        name="Vertice_MoGraph_Mat",
        rgba=(0.22, 0.74, 0.97, 1.0),
        strength=2.2,
    )
    clone_proto.data.materials.append(clone_mat)

    mod = host_obj.modifiers.new(name="Vertice_MoGraph_Nodes", type="NODES")
    ng = bpy.data.node_groups.new(name="Vertice_MoGraph_53_Tree", type="GeometryNodeTree")
    mod.node_group = ng
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")

    nodes = ng.nodes
    links = ng.links
    out_node = nodes.new("NodeGroupOutput")
    out_node.location = (640, 0)

    if MOGRAPH_DISTRIBUTION == "grid":
        grid = nodes.new("GeometryNodeMeshGrid")
        grid.location = (-360, 80)
        side = max(2, int(round(math.sqrt(MOGRAPH_CLONES))))
        grid.inputs["Vertices X"].default_value = side
        grid.inputs["Vertices Y"].default_value = side
        grid.inputs["Size X"].default_value = MOGRAPH_SPACING * 2.2
        grid.inputs["Size Y"].default_value = MOGRAPH_SPACING * 2.2
        pts_source = grid.outputs["Mesh"]
    else:
        circle = nodes.new("GeometryNodeCurvePrimitiveCircle")
        circle.location = (-360, 80)
        circle.inputs["Resolution"].default_value = MOGRAPH_CLONES
        circle.inputs["Radius"].default_value = MOGRAPH_SPACING * 1.1
        pts_source = circle.outputs["Curve"]

    time_node = nodes.new("GeometryNodeInputSceneTime")
    time_node.location = (-360, -180)
    mul_speed = nodes.new("ShaderNodeMath")
    mul_speed.operation = "MULTIPLY"
    mul_speed.location = (-180, -180)
    mul_speed.inputs[1].default_value = MOGRAPH_SPEED * 2.4

    wave_sin = nodes.new("ShaderNodeMath")
    wave_sin.operation = "SINE"
    wave_sin.location = (0, -180)

    mul_amp = nodes.new("ShaderNodeMath")
    mul_amp.operation = "MULTIPLY"
    mul_amp.location = (160, -180)
    mul_amp.inputs[1].default_value = MOGRAPH_STRENGTH * 0.35

    comb_xyz = nodes.new("ShaderNodeCombineXYZ")
    comb_xyz.location = (160, -320)

    set_pos = nodes.new("GeometryNodeSetPosition")
    set_pos.location = (40, 80)

    obj_info = nodes.new("GeometryNodeObjectInfo")
    obj_info.location = (40, -60)
    obj_info.inputs["Object"].default_value = clone_proto

    inst_pts = nodes.new("GeometryNodeInstanceOnPoints")
    inst_pts.location = (260, 80)

    set_mat = nodes.new("GeometryNodeSetMaterial")
    set_mat.location = (450, 80)
    set_mat.inputs["Material"].default_value = clone_mat

    links.new(pts_source, set_pos.inputs["Geometry"])
    links.new(time_node.outputs["Seconds"], mul_speed.inputs[0])
    links.new(mul_speed.outputs["Value"], wave_sin.inputs[0])
    links.new(wave_sin.outputs["Value"], mul_amp.inputs[0])
    links.new(mul_amp.outputs["Value"], comb_xyz.inputs["Z"])
    links.new(comb_xyz.outputs["Vector"], set_pos.inputs["Offset"])
    links.new(set_pos.outputs["Geometry"], inst_pts.inputs["Points"])
    links.new(obj_info.outputs["Geometry"], inst_pts.inputs["Instance"])
    links.new(inst_pts.outputs["Instances"], set_mat.inputs["Geometry"])
    links.new(set_mat.outputs["Geometry"], out_node.inputs["Geometry"])


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
    slot_count = 0
    if anim_data and anim_data.action:
        action = anim_data.action
        if hasattr(action, "slots"):
            slot_count = len(action.slots)
            if anim_data.action_slot is None and slot_count > 0:
                anim_data.action_slot = action.slots[0]

    # Organiza múltiplos clipes em NLA Tracks (Blender 5.3+ Slotted Actions)
    all_actions = list(bpy.data.actions)
    if anim_data and len(all_actions) > 1:
        frame_cursor = 1
        for idx, act in enumerate(all_actions):
            track = anim_data.nla_tracks.new()
            track.name = f"Vertice_Clip_{idx + 1}_{act.name}"
            strip = track.strips.new(act.name, frame_cursor, act)
            if hasattr(strip, "action_slot") and hasattr(act, "slots") and len(act.slots) > 0:
                strip.action_slot = act.slots[0]
            frame_cursor += max(24, int(act.frame_range[1] - act.frame_range[0]) + 4)

    print(
        f"[Vertice] Armature configurada para Blender 5.3+ com {len(armature_obj.data.bones)} ossos "
        f"(Slotted Actions: {slot_count} | Total Clips NLA: {len(all_actions)})."
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

    vfx_col = get_or_create_collection(f"{SCENE_LABEL}_VFX")
${emittersCode}
    setup_mograph_geometry_nodes_53(vfx_col)
    setup_compositor_bloom_53(scene)
    print(
        f"[Vertice] Cena '{SCENE_LABEL}' importada e pronta no Blender {bpy.app.version_string} "
        f"({FRAME_END} quadros @ {TARGET_FPS} FPS)."
    )


if __name__ == "__main__":
    main()
`;
}

export async function generateBlender53PythonScript(
  scene: RustSceneData,
  glbFilename: string,
  extras?: BlenderSceneSyncExtras
): Promise<string> {
  if (!extras && isRustEngineAvailable()) {
    try {
      return await generateBlenderVfxScriptWasm(scene, glbFilename);
    } catch {
      // Fallback transparently to identical Blender 5.3+ TS generator
    }
  }
  return buildBlender53PythonScriptSync(scene, glbFilename, 'abrir_no_blender_5_3.py', extras);
}

export function createBlender53ZipBundle(params: {
  glbBytes: Uint8Array;
  glbFilename: string;
  pythonScript: string;
  pythonFilename?: string;
  projectJson: string;
  transparentPreviewPngBytes?: Uint8Array;
}): Blob {
  const pyName = params.pythonFilename ?? 'abrir_no_blender_5_3.py';
  const readme = [
    'Vértice Studio — Pacote Completo para Blender 5.3+ (e superiores)',
    '=================================================================',
    '',
    `1. Arquivo 3D glTF 2.0 Binário: ${params.glbFilename}`,
    `2. Script Automatizado Blender 5.3+: ${pyName}`,
    '3. Snapshot do Projeto: projeto.vertice.json',
    params.transparentPreviewPngBytes ? '4. Prévia Renderizada (Alpha): quadro_transparente.png' : '',
    '',
    'Como abrir no Blender 5.3 ou superior:',
    `  - Extraia todos os arquivos deste .ZIP na mesma pasta.`,
    `  - Abra o Blender 5.3+ -> aba Scripting -> Open -> selecione "${pyName}" -> Run Script.`,
    `  - Ou importe apenas "${params.glbFilename}" via File -> Import -> glTF 2.0 (.glb/.gltf).`,
    '',
    'Recursos incluídos no padrão Blender 5.3+:',
    '  * Principled BSDF com KHR_materials_dispersion, iridescence, clearcoat, transmission e IOR.',
    '  * Armature + Bone Collections ("Vertice_Deform") + Slotted Actions + NLA Tracks multi-clip.',
    '  * Sincronia de Câmera (FOV/posição/alvo), Luzes Key/Rim, World Environment e Exposure.',
    '  * Compositor moderno (scene.compositing_node_group + NodeGroupOutput + Glare).',
    '  * Emissores VFX e MoGraph Cloner nativos via Geometry Nodes (GeometryNodeTree).',
  ]
    .filter(Boolean)
    .join('\n');

  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    [params.glbFilename]: params.glbBytes,
    [pyName]: encoder.encode(params.pythonScript),
    'projeto.vertice.json': encoder.encode(params.projectJson),
    'LEIAME_BLENDER_5_3.txt': encoder.encode(readme),
  };

  if (params.transparentPreviewPngBytes && params.transparentPreviewPngBytes.length > 0) {
    entries['quadro_transparente.png'] = params.transparentPreviewPngBytes;
  }

  const zipped = zipSync(entries, { level: 6 });
  return new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
}
