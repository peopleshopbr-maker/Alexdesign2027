use crate::{SceneData, VfxEmitterSpec};

fn hex_to_rgb_tuple(hex: &str) -> (f32, f32, f32) {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&clean[0..2], 16),
            u8::from_str_radix(&clean[2..4], 16),
            u8::from_str_radix(&clean[4..6], 16),
        ) {
            return (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
        }
    }
    (0.22, 0.74, 0.97)
}

fn sanitize_py_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn format_emitter_block(index: usize, emitter: &VfxEmitterSpec) -> String {
    let (r, g, b) = hex_to_rgb_tuple(&emitter.color_hex);
    let safe_name = sanitize_py_str(&emitter.name);
    let safe_bone = sanitize_py_str(&emitter.attach_bone);
    let density = (emitter.rate.max(10) as f32 / 2.0).clamp(6.0, 180.0);
    let speed = emitter.speed.max(0.05);
    let spread = emitter.spread.clamp(0.05, 2.5);
    let p_size = emitter.particle_size.clamp(0.008, 0.5);
    let turbulence = emitter.turbulence.clamp(0.0, 2.0);
    let is_aura = emitter.emitter_type == "aura";

    format!(
        r#"    # --- Emissor Geometry Nodes VFX {idx}: {name} (osso: {bone}) ---
    inst_mesh = create_icosphere_object(
        name="{name}_ParticleMesh_{idx}",
        radius={p_size:.4},
        subdivisions=2,
        location=(0.0, 0.0, 0.0),
        target_col=vfx_col,
    )
    inst_mesh.hide_viewport = True
    inst_mesh.hide_render = True

    em_mat = create_emission_material(
        name="{name}_EmissionMat_{idx}",
        rgba=({r:.4}, {g:.4}, {b:.4}, 1.0),
        strength=4.5,
    )
    inst_mesh.data.materials.append(em_mat)

    emitter_obj = create_icosphere_object(
        name="{name}_VFX_Emitter_{idx}",
        radius=0.14 if {is_aura_py} else 0.065,
        subdivisions=2,
        location=(0.0, 0.0, 1.15),
        target_col=vfx_col,
    )
    emitter_obj.display_type = "WIRE"

    if armature_obj and "{bone}" in armature_obj.data.bones:
        emitter_obj.parent = armature_obj
        emitter_obj.parent_type = "BONE"
        emitter_obj.parent_bone = "{bone}"
        emitter_obj.location = (0.0, 0.0, 0.0)

    attach_geometry_nodes_vfx(
        emitter_obj=emitter_obj,
        instance_obj=inst_mesh,
        material=em_mat,
        density={density:.2},
        speed={speed:.3},
        spread={spread:.3},
        turbulence={turbulence:.3},
        idx={idx},
    )
"#,
        idx = index,
        name = safe_name,
        bone = safe_bone,
        r = r,
        g = g,
        b = b,
        density = density,
        speed = speed,
        spread = spread,
        turbulence = turbulence,
        p_size = p_size,
        is_aura_py = if is_aura { "True" } else { "False" },
    )
}

pub fn build_blender_vfx_script(scene: &SceneData, glb_filename: &str) -> String {
    let fps = scene.fps.clamp(12.0, 120.0).round() as u32;
    let total_frames = ((scene.duration.max(0.5) * fps as f32).round() as u32).max(24);
    let safe_glb = sanitize_py_str(glb_filename);
    let safe_scene = sanitize_py_str(&scene.scene_name);

    let mut emitters_code = String::new();
    for (idx, emitter) in scene.emitters.iter().enumerate() {
        emitters_code.push_str(&format_emitter_block(idx + 1, emitter));
        emitters_code.push('\n');
    }

    format!(
        r#"# ==============================================================================
# Vértice Studio — Script Automatizado para Blender 5.3+ (e superiores)
# Compatível com Blender 5.3 / 5.4+ / 6.0+ (CompositorNodeTree, Slotted Actions,
# Bone Collections, Geometry Nodes VFX, Principled BSDF & glTF 2.0)
# Como executar no Blender 5.3+:
#   1) Extraia este .py na mesma pasta do arquivo "{glb}"
#   2) Abra o Blender 5.3+ -> Scripting -> Open -> Run Script
#   Ou via terminal: blender --python "{script_hint}"
# ==============================================================================
import os
import bpy
import bmesh

GLB_FILENAME = "{glb}"
SCENE_LABEL = "{scene_name}"
TARGET_FPS = {fps}
FRAME_END = {total_frames}


def ensure_object_mode():
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def move_to_collection(obj, target_col):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    target_col.objects.link(obj)


def get_or_create_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def get_material_node_tree(mat):
    # Blender 5.0+ garante node_tree nativo; use_nodes está obsoleto/removido em versões futuras
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
    # Blender 5.0+ voltou a usar 'BLENDER_EEVEE' (removendo 'BLENDER_EEVEE_NEXT')
    target_engine = "BLENDER_EEVEE" if bpy.app.version >= (5, 0, 0) else "BLENDER_EEVEE_NEXT"
    try:
        scene.render.engine = target_engine
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"


def setup_compositor_bloom_53(scene):
    # Blender 5.0–5.3+: Scene.use_nodes e Scene.node_tree foram removidos;
    # o compositor usa scene.compositing_node_group + NodeGroupOutput + interface.new_socket
    if hasattr(scene, "compositing_node_group"):
        ng = scene.compositing_node_group
        if ng is None:
            ng = bpy.data.node_groups.new(
                name=f"{{SCENE_LABEL}}_Compositor_53",
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
    mod = emitter_obj.modifiers.new(name=f"Vertice_VFX_Nodes_{{idx}}", type="NODES")
    ng = bpy.data.node_groups.new(name=f"{{emitter_obj.name}}_GeoNodes", type="GeometryNodeTree")
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

    # Ligações Geometry Nodes 5.3+
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

    # Anima leve elevação orbital no próprio emissor compatível com timeline
    emitter_obj.driver_remove("rotation_euler", 2)
    drv = emitter_obj.driver_add("rotation_euler", 2).driver
    drv.expression = f"frame * {{0.025 * speed:.4f}}"


def setup_armature_rig(armature_obj):
    if armature_obj is None:
        return
    armature_obj.show_in_front = True
    armature_obj.data.display_type = "OCTAHEDRAL"
    armature_obj.data.pose_position = "POSE"
    armature_obj["vertice_blender_53_ready"] = True

    # Bone Collections (padrão Blender 4.0–5.3+, substitui bone layers legados)
    deform_col = None
    if hasattr(armature_obj.data, "collections"):
        deform_col = armature_obj.data.collections.get("Vertice_Deform")
        if deform_col is None:
            deform_col = armature_obj.data.collections.new("Vertice_Deform")

    for bone in armature_obj.data.bones:
        bone.use_deform = True
        if deform_col is not None:
            deform_col.assign(bone)

    # Inspeção segura de Slotted Actions (Blender 5.0–5.3+ substitui Action.fcurves)
    anim_data = armature_obj.animation_data
    slot_count = 0
    if anim_data and anim_data.action:
        action = anim_data.action
        if hasattr(action, "slots"):
            slot_count = len(action.slots)
            if anim_data.action_slot is None and slot_count > 0:
                anim_data.action_slot = action.slots[0]

    print(
        f"[Vertice] Armature configurada para Blender 5.3+ com {{len(armature_obj.data.bones)}} ossos "
        f"(Slotted Actions: {{slot_count}})."
    )


def main():
    ensure_object_mode()
    script_dir = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    glb_path = os.path.join(script_dir, GLB_FILENAME)
    if not os.path.exists(glb_path):
        raise FileNotFoundError(f"Arquivo GLB não encontrado ao lado do script: {{glb_path}}")

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
    setup_armature_rig(armature_obj)

    vfx_col = get_or_create_collection(f"{{SCENE_LABEL}}_VFX")
{emitters}
    setup_compositor_bloom_53(scene)
    print(
        f"[Vertice] Cena '{{SCENE_LABEL}}' importada e pronta no Blender {{bpy.app.version_string}} "
        f"({{FRAME_END}} quadros @ {{TARGET_FPS}} FPS)."
    )


if __name__ == "__main__":
    main()
"#,
        glb = safe_glb,
        script_hint = "abrir_no_blender_5_3.py",
        scene_name = safe_scene,
        fps = fps,
        total_frames = total_frames,
        emitters = emitters_code,
    )
}
