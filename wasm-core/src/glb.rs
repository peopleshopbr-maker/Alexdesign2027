use glam::{EulerRot, Mat4, Quat, Vec3};
use serde::Serialize;
use std::collections::BTreeMap;

use crate::{BoneSpec, KeyframeSpec, SceneData};

#[derive(Serialize)]
struct GltfAsset {
    version: &'static str,
    generator: &'static str,
}

#[derive(Serialize)]
struct GltfScene {
    name: String,
    nodes: Vec<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfNode {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mesh: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skin: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    translation: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rotation: Option<[f32; 4]>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    children: Vec<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfPbrMetallicRoughness {
    base_color_factor: [f32; 4],
    metallic_factor: f32,
    roughness_factor: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfMaterial {
    name: String,
    double_sided: bool,
    pbr_metallic_roughness: GltfPbrMetallicRoughness,
}

#[derive(Serialize)]
struct GltfMesh {
    name: String,
    primitives: Vec<GltfPrimitive>,
}

#[derive(Serialize)]
struct GltfPrimitive {
    attributes: BTreeMap<&'static str, usize>,
    indices: usize,
    material: usize,
    mode: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfSkin {
    name: String,
    inverse_bind_matrices: usize,
    joints: Vec<usize>,
    skeleton: usize,
}

#[derive(Serialize)]
struct GltfAnimation {
    name: String,
    channels: Vec<GltfAnimationChannel>,
    samplers: Vec<GltfAnimationSampler>,
}

#[derive(Serialize)]
struct GltfAnimationChannel {
    sampler: usize,
    target: GltfAnimationTarget,
}

#[derive(Serialize)]
struct GltfAnimationTarget {
    node: usize,
    path: &'static str,
}

#[derive(Serialize)]
struct GltfAnimationSampler {
    input: usize,
    interpolation: &'static str,
    output: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfAccessor {
    buffer_view: usize,
    byte_offset: usize,
    component_type: u32,
    count: usize,
    #[serde(rename = "type")]
    accessor_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    min: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max: Option<Vec<f32>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfBufferView {
    buffer: usize,
    byte_offset: usize,
    byte_length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GltfBuffer {
    byte_length: usize,
}

#[derive(Serialize)]
struct GltfRoot {
    asset: GltfAsset,
    scene: usize,
    scenes: Vec<GltfScene>,
    nodes: Vec<GltfNode>,
    materials: Vec<GltfMaterial>,
    meshes: Vec<GltfMesh>,
    skins: Vec<GltfSkin>,
    animations: Vec<GltfAnimation>,
    accessors: Vec<GltfAccessor>,
    buffer_views: Vec<GltfBufferView>,
    buffers: Vec<GltfBuffer>,
}

fn pad_to_4(buf: &mut Vec<u8>, byte: u8) {
    while buf.len() % 4 != 0 {
        buf.push(byte);
    }
}

fn push_f32_slice(bin: &mut Vec<u8>, values: &[f32]) -> (usize, usize) {
    pad_to_4(bin, 0);
    let offset = bin.len();
    for &v in values {
        bin.extend_from_slice(&v.to_le_bytes());
    }
    let length = bin.len() - offset;
    (offset, length)
}

fn push_u16_slice(bin: &mut Vec<u8>, values: &[u16]) -> (usize, usize) {
    pad_to_4(bin, 0);
    let offset = bin.len();
    for &v in values {
        bin.extend_from_slice(&v.to_le_bytes());
    }
    let length = bin.len() - offset;
    pad_to_4(bin, 0);
    (offset, length)
}

fn parse_hex_color(hex: &str) -> [f32; 4] {
    let clean = hex.trim().trim_start_matches('#');
    if clean.len() == 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&clean[0..2], 16),
            u8::from_str_radix(&clean[2..4], 16),
            u8::from_str_radix(&clean[4..6], 16),
        ) {
            return [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, 1.0];
        }
    }
    [0.22, 0.74, 0.97, 1.0]
}

fn euler_deg_to_quat(deg: [f32; 3]) -> Quat {
    Quat::from_euler(
        EulerRot::XYZ,
        deg[0].to_radians(),
        deg[1].to_radians(),
        deg[2].to_radians(),
    )
}

fn compute_world_rest_matrices(bones: &[BoneSpec]) -> Result<Vec<Mat4>, String> {
    let n = bones.len();
    let mut cache: Vec<Option<Mat4>> = vec![None; n];
    let mut visiting: Vec<bool> = vec![false; n];

    fn resolve(
        idx: usize,
        bones: &[BoneSpec],
        cache: &mut [Option<Mat4>],
        visiting: &mut [bool],
    ) -> Result<Mat4, String> {
        if let Some(m) = cache[idx] {
            return Ok(m);
        }
        if visiting[idx] {
            return Err(format!("Ciclo detectado na hierarquia de ossos no índice {idx}."));
        }
        visiting[idx] = true;

        let bone = &bones[idx];
        let local = Mat4::from_rotation_translation(
            euler_deg_to_quat(bone.rest_rotation_euler_deg),
            Vec3::from_array(bone.rest_translation),
        );

        let world = match bone.parent_index {
            Some(p) => {
                if p >= bones.len() {
                    return Err(format!(
                        "Osso '{}' aponta para parentIndex inválido ({p}).",
                        bone.name
                    ));
                }
                resolve(p, bones, cache, visiting)? * local
            }
            None => local,
        };

        visiting[idx] = false;
        cache[idx] = Some(world);
        Ok(world)
    }

    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        out.push(resolve(i, bones, &mut cache, &mut visiting)?);
    }
    Ok(out)
}

fn append_bone_limb_segment(
    bone_idx: u16,
    world_mat: Mat4,
    length: f32,
    radius: f32,
    positions: &mut Vec<f32>,
    normals: &mut Vec<f32>,
    uvs: &mut Vec<f32>,
    joints: &mut Vec<u16>,
    weights: &mut Vec<f32>,
    indices: &mut Vec<u16>,
) {
    let seg_len = if length.is_finite() { length.max(0.06) } else { 0.25 };
    let r_base = if radius.is_finite() { radius.max(0.025) } else { 0.05 };
    let r_tip = (r_base * 0.68).max(0.018);
    let sides: usize = 8;

    let normal_mat = glam::Mat3::from_mat4(world_mat);
    let base_vertex = (positions.len() / 3) as u16;

    // 2 rings (bottom & top) + 2 cap center vertices
    for ring in 0..2 {
        let y = if ring == 0 { 0.0 } else { seg_len };
        let v_coord = if ring == 0 { 0.0 } else { 1.0 };
        let r = if ring == 0 { r_base } else { r_tip };
        for s in 0..sides {
            let u_coord = s as f32 / sides as f32;
            let theta = u_coord * std::f32::consts::TAU;
            let cos_t = theta.cos();
            let sin_t = theta.sin();

            let local_p = Vec3::new(cos_t * r, y, sin_t * r);
            let local_n = Vec3::new(cos_t, 0.15, sin_t).normalize();

            let wp = world_mat.transform_point3(local_p);
            let wn = (normal_mat * local_n).normalize_or_zero();
            let safe_n = if wn.length_squared() > 1e-6 { wn } else { Vec3::Y };

            positions.extend_from_slice(&[wp.x, wp.y, wp.z]);
            normals.extend_from_slice(&[safe_n.x, safe_n.y, safe_n.z]);
            uvs.extend_from_slice(&[u_coord, v_coord]);
            joints.extend_from_slice(&[bone_idx, 0, 0, 0]);
            weights.extend_from_slice(&[1.0, 0.0, 0.0, 0.0]);
        }
    }

    // Bottom cap center & top cap center
    let bottom_center_idx = (positions.len() / 3) as u16;
    let wp_bot = world_mat.transform_point3(Vec3::ZERO);
    let wn_bot = (normal_mat * Vec3::NEG_Y).normalize_or_zero();
    let safe_bot = if wn_bot.length_squared() > 1e-6 { wn_bot } else { Vec3::NEG_Y };
    positions.extend_from_slice(&[wp_bot.x, wp_bot.y, wp_bot.z]);
    normals.extend_from_slice(&[safe_bot.x, safe_bot.y, safe_bot.z]);
    uvs.extend_from_slice(&[0.5, 0.0]);
    joints.extend_from_slice(&[bone_idx, 0, 0, 0]);
    weights.extend_from_slice(&[1.0, 0.0, 0.0, 0.0]);

    let top_center_idx = (positions.len() / 3) as u16;
    let wp_top = world_mat.transform_point3(Vec3::new(0.0, seg_len, 0.0));
    let wn_top = (normal_mat * Vec3::Y).normalize_or_zero();
    let safe_top = if wn_top.length_squared() > 1e-6 { wn_top } else { Vec3::Y };
    positions.extend_from_slice(&[wp_top.x, wp_top.y, wp_top.z]);
    normals.extend_from_slice(&[safe_top.x, safe_top.y, safe_top.z]);
    uvs.extend_from_slice(&[0.5, 1.0]);
    joints.extend_from_slice(&[bone_idx, 0, 0, 0]);
    weights.extend_from_slice(&[1.0, 0.0, 0.0, 0.0]);

    for s in 0..sides {
        let next = (s + 1) % sides;
        let b0 = base_vertex + s as u16;
        let b1 = base_vertex + next as u16;
        let t0 = base_vertex + sides as u16 + s as u16;
        let t1 = base_vertex + sides as u16 + next as u16;

        // Side quad (CCW outward)
        indices.extend_from_slice(&[b0, t0, t1, b0, t1, b1]);
        // Bottom cap
        indices.extend_from_slice(&[bottom_center_idx, b0, b1]);
        // Top cap
        indices.extend_from_slice(&[top_center_idx, t1, t0]);
    }
}

pub fn build_rigged_animation_glb(scene: &SceneData) -> Result<Vec<u8>, String> {
    if scene.bones.is_empty() {
        return Err("SceneData.bones não pode estar vazio para exportar um GLB rigado.".into());
    }

    let world_rest = compute_world_rest_matrices(&scene.bones)?;

    // Build skinned geometry buffers
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut uvs: Vec<f32> = Vec::new();
    let mut joints: Vec<u16> = Vec::new();
    let mut weights: Vec<f32> = Vec::new();
    let mut indices: Vec<u16> = Vec::new();

    for (i, bone) in scene.bones.iter().enumerate() {
        append_bone_limb_segment(
            i as u16,
            world_rest[i],
            bone.length,
            bone.radius,
            &mut positions,
            &mut normals,
            &mut uvs,
            &mut joints,
            &mut weights,
            &mut indices,
        );
    }

    let vertex_count = positions.len() / 3;
    let mut min_p = [f32::INFINITY; 3];
    let mut max_p = [f32::NEG_INFINITY; 3];
    for p in positions.chunks_exact(3) {
        for axis in 0..3 {
            min_p[axis] = min_p[axis].min(p[axis]);
            max_p[axis] = max_p[axis].max(p[axis]);
        }
    }

    let mut bin: Vec<u8> = Vec::new();
    let mut buffer_views: Vec<GltfBufferView> = Vec::new();
    let mut accessors: Vec<GltfAccessor> = Vec::new();

    // 0: POSITION
    let (pos_off, pos_len) = push_f32_slice(&mut bin, &positions);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: pos_off,
        byte_length: pos_len,
        target: Some(34962),
    });
    let pos_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5126,
        count: vertex_count,
        accessor_type: "VEC3",
        min: Some(min_p.to_vec()),
        max: Some(max_p.to_vec()),
    });

    // 1: NORMAL
    let (norm_off, norm_len) = push_f32_slice(&mut bin, &normals);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: norm_off,
        byte_length: norm_len,
        target: Some(34962),
    });
    let norm_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5126,
        count: vertex_count,
        accessor_type: "VEC3",
        min: None,
        max: None,
    });

    // 2: TEXCOORD_0
    let (uv_off, uv_len) = push_f32_slice(&mut bin, &uvs);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: uv_off,
        byte_length: uv_len,
        target: Some(34962),
    });
    let uv_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5126,
        count: vertex_count,
        accessor_type: "VEC2",
        min: None,
        max: None,
    });

    // 2: JOINTS_0 (VEC4 u16)
    let (j_off, j_len) = push_u16_slice(&mut bin, &joints);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: j_off,
        byte_length: j_len,
        target: Some(34962),
    });
    let joints_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5123,
        count: vertex_count,
        accessor_type: "VEC4",
        min: None,
        max: None,
    });

    // 3: WEIGHTS_0 (VEC4 f32)
    let (w_off, w_len) = push_f32_slice(&mut bin, &weights);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: w_off,
        byte_length: w_len,
        target: Some(34962),
    });
    let weights_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5126,
        count: vertex_count,
        accessor_type: "VEC4",
        min: None,
        max: None,
    });

    // 4: INDICES (SCALAR u16)
    let (idx_off, idx_len) = push_u16_slice(&mut bin, &indices);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: idx_off,
        byte_length: idx_len,
        target: Some(34963),
    });
    let indices_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5123,
        count: indices.len(),
        accessor_type: "SCALAR",
        min: None,
        max: None,
    });

    // 5: inverseBindMatrices (MAT4 f32)
    let mut ibm_floats: Vec<f32> = Vec::with_capacity(scene.bones.len() * 16);
    for mat in &world_rest {
        let inv = mat.inverse();
        ibm_floats.extend_from_slice(&inv.to_cols_array());
    }
    let (ibm_off, ibm_len) = push_f32_slice(&mut bin, &ibm_floats);
    buffer_views.push(GltfBufferView {
        buffer: 0,
        byte_offset: ibm_off,
        byte_length: ibm_len,
        target: None,
    });
    let ibm_acc = accessors.len();
    accessors.push(GltfAccessor {
        buffer_view: buffer_views.len() - 1,
        byte_offset: 0,
        component_type: 5126,
        count: scene.bones.len(),
        accessor_type: "MAT4",
        min: None,
        max: None,
    });

    // Build Node Hierarchy:
    // node 0: Armature root
    // node 1: SkinnedMesh
    // nodes 2..2+N: Bones
    let bone_node_offset = 2usize;
    let mut children_by_bone: Vec<Vec<usize>> = vec![Vec::new(); scene.bones.len()];
    let mut root_bones: Vec<usize> = Vec::new();
    let mut bone_name_to_idx: BTreeMap<String, usize> = BTreeMap::new();

    for (i, bone) in scene.bones.iter().enumerate() {
        bone_name_to_idx.insert(bone.name.clone(), i);
        match bone.parent_index {
            Some(p) => children_by_bone[p].push(bone_node_offset + i),
            None => root_bones.push(bone_node_offset + i),
        }
    }

    let mut nodes: Vec<GltfNode> = Vec::with_capacity(2 + scene.bones.len());
    let mut armature_children = vec![1usize];
    armature_children.extend_from_slice(&root_bones);

    nodes.push(GltfNode {
        name: "Armature".into(),
        mesh: None,
        skin: None,
        translation: None,
        rotation: None,
        children: armature_children,
    });

    nodes.push(GltfNode {
        name: format!("{}_Mesh", scene.scene_name),
        mesh: Some(0),
        skin: Some(0),
        translation: None,
        rotation: None,
        children: Vec::new(),
    });

    let mut joint_indices: Vec<usize> = Vec::with_capacity(scene.bones.len());
    for (i, bone) in scene.bones.iter().enumerate() {
        let q = euler_deg_to_quat(bone.rest_rotation_euler_deg).normalize();
        nodes.push(GltfNode {
            name: bone.name.clone(),
            mesh: None,
            skin: None,
            translation: Some(bone.rest_translation),
            rotation: Some(q.to_array()),
            children: children_by_bone[i].clone(),
        });
        joint_indices.push(bone_node_offset + i);
    }

    // Build Keyframe Animation Channels & Samplers
    let mut keyframes_by_bone: BTreeMap<usize, Vec<&KeyframeSpec>> = BTreeMap::new();
    for kf in &scene.keyframes {
        if let Some(&b_idx) = bone_name_to_idx.get(&kf.bone_name) {
            keyframes_by_bone.entry(b_idx).or_default().push(kf);
        }
    }

    let mut channels: Vec<GltfAnimationChannel> = Vec::new();
    let mut samplers: Vec<GltfAnimationSampler> = Vec::new();

    for (b_idx, mut kfs) in keyframes_by_bone {
        kfs.sort_by(|a, b| a.time.total_cmp(&b.time));
        let bone = &scene.bones[b_idx];
        let rest_q = euler_deg_to_quat(bone.rest_rotation_euler_deg);

        let mut times: Vec<f32> = Vec::with_capacity(kfs.len());
        let mut rots: Vec<f32> = Vec::with_capacity(kfs.len() * 4);
        let mut trans: Vec<f32> = Vec::with_capacity(kfs.len() * 3);
        let mut has_translation = false;

        let mut last_time: Option<f32> = None;
        for kf in &kfs {
            let mut t = if kf.time.is_finite() { kf.time.max(0.0) } else { 0.0 };
            if let Some(prev_t) = last_time {
                if t <= prev_t {
                    t = prev_t + 1e-4;
                }
            }
            last_time = Some(t);
            times.push(t);

            let delta_q = euler_deg_to_quat(kf.rotation_euler_deg);
            let final_q = (rest_q * delta_q).normalize();
            rots.extend_from_slice(&final_q.to_array());

            let offset = kf.translation_offset.unwrap_or([0.0, 0.0, 0.0]);
            if kf.translation_offset.is_some() {
                has_translation = true;
            }
            trans.extend_from_slice(&[
                bone.rest_translation[0] + offset[0],
                bone.rest_translation[1] + offset[1],
                bone.rest_translation[2] + offset[2],
            ]);
        }

        if times.is_empty() {
            continue;
        }

        let t_min = *times.first().unwrap_or(&0.0);
        let t_max = *times.last().unwrap_or(&0.0);

        let (t_off, t_len) = push_f32_slice(&mut bin, &times);
        buffer_views.push(GltfBufferView {
            buffer: 0,
            byte_offset: t_off,
            byte_length: t_len,
            target: None,
        });
        let time_acc = accessors.len();
        accessors.push(GltfAccessor {
            buffer_view: buffer_views.len() - 1,
            byte_offset: 0,
            component_type: 5126,
            count: times.len(),
            accessor_type: "SCALAR",
            min: Some(vec![t_min]),
            max: Some(vec![t_max]),
        });

        let (r_off, r_len) = push_f32_slice(&mut bin, &rots);
        buffer_views.push(GltfBufferView {
            buffer: 0,
            byte_offset: r_off,
            byte_length: r_len,
            target: None,
        });
        let rot_acc = accessors.len();
        accessors.push(GltfAccessor {
            buffer_view: buffer_views.len() - 1,
            byte_offset: 0,
            component_type: 5126,
            count: times.len(),
            accessor_type: "VEC4",
            min: None,
            max: None,
        });

        let rot_sampler_idx = samplers.len();
        samplers.push(GltfAnimationSampler {
            input: time_acc,
            interpolation: "LINEAR",
            output: rot_acc,
        });
        channels.push(GltfAnimationChannel {
            sampler: rot_sampler_idx,
            target: GltfAnimationTarget {
                node: bone_node_offset + b_idx,
                path: "rotation",
            },
        });

        if has_translation {
            let (tr_off, tr_len) = push_f32_slice(&mut bin, &trans);
            buffer_views.push(GltfBufferView {
                buffer: 0,
                byte_offset: tr_off,
                byte_length: tr_len,
                target: None,
            });
            let trans_acc = accessors.len();
            accessors.push(GltfAccessor {
                buffer_view: buffer_views.len() - 1,
                byte_offset: 0,
                component_type: 5126,
                count: times.len(),
                accessor_type: "VEC3",
                min: None,
                max: None,
            });

            let trans_sampler_idx = samplers.len();
            samplers.push(GltfAnimationSampler {
                input: time_acc,
                interpolation: "LINEAR",
                output: trans_acc,
            });
            channels.push(GltfAnimationChannel {
                sampler: trans_sampler_idx,
                target: GltfAnimationTarget {
                    node: bone_node_offset + b_idx,
                    path: "translation",
                },
            });
        }
    }

    pad_to_4(&mut bin, 0);

    let mut attributes = BTreeMap::new();
    attributes.insert("POSITION", pos_acc);
    attributes.insert("NORMAL", norm_acc);
    attributes.insert("TEXCOORD_0", uv_acc);
    attributes.insert("JOINTS_0", joints_acc);
    attributes.insert("WEIGHTS_0", weights_acc);

    let animations = if channels.is_empty() {
        Vec::new()
    } else {
        vec![GltfAnimation {
            name: format!("{}_Action", scene.scene_name),
            channels,
            samplers,
        }]
    };

    let root = GltfRoot {
        asset: GltfAsset {
            version: "2.0",
            generator: "Vertice Studio Rust Wasm Core (Blender 5.3+)",
        },
        scene: 0,
        scenes: vec![GltfScene {
            name: scene.scene_name.clone(),
            nodes: vec![0],
        }],
        nodes,
        materials: vec![GltfMaterial {
            name: "Vertice_Character_Mat".into(),
            double_sided: false,
            pbr_metallic_roughness: GltfPbrMetallicRoughness {
                base_color_factor: parse_hex_color(&scene.base_color_hex),
                metallic_factor: scene.metallic.clamp(0.0, 1.0),
                roughness_factor: scene.roughness.clamp(0.05, 1.0),
            },
        }],
        meshes: vec![GltfMesh {
            name: format!("{}_Mesh", scene.scene_name),
            primitives: vec![GltfPrimitive {
                attributes,
                indices: indices_acc,
                material: 0,
                mode: 4,
            }],
        }],
        skins: vec![GltfSkin {
            name: "Armature".into(),
            inverse_bind_matrices: ibm_acc,
            joints: joint_indices.clone(),
            skeleton: joint_indices[0],
        }],
        animations,
        accessors,
        buffer_views,
        buffers: vec![GltfBuffer {
            byte_length: bin.len(),
        }],
    };

    let mut json_bytes =
        serde_json::to_vec(&root).map_err(|e| format!("Falha ao serializar JSON glTF: {e}"))?;
    pad_to_4(&mut json_bytes, b' ');

    // Assemble GLB v2 binary container
    let total_len = 12 + 8 + json_bytes.len() + 8 + bin.len();
    let mut glb = Vec::with_capacity(total_len);
    glb.extend_from_slice(b"glTF");
    glb.extend_from_slice(&2u32.to_le_bytes());
    glb.extend_from_slice(&(total_len as u32).to_le_bytes());

    // JSON chunk
    glb.extend_from_slice(&(json_bytes.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x4E4F534Au32.to_le_bytes());
    glb.extend_from_slice(&json_bytes);

    // BIN chunk
    glb.extend_from_slice(&(bin.len() as u32).to_le_bytes());
    glb.extend_from_slice(&0x004E4942u32.to_le_bytes());
    glb.extend_from_slice(&bin);

    Ok(glb)
}
