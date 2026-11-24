use glam::{EulerRot, Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::{BoneSpec, SceneData};

type KeyframeData = (f32, [f32; 3], Option<[f32; 3]>);

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

        indices.extend_from_slice(&[b0, t0, t1, b0, t1, b1]);
        indices.extend_from_slice(&[bottom_center_idx, b0, b1]);
        indices.extend_from_slice(&[top_center_idx, t1, t0]);
    }
}

// ============================================================================
// PROCEDURAL ANIMATION GENERATION — 12 CLIPS
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnimationClipType {
    Idle,
    Walk,
    Run,
    Jump,
    Slash,
    Hit,
    Death,
    Block,
    Fall,
    Land,
    Dash,
    Interact,
    ChestOpen,
}

impl AnimationClipType {
    pub fn all() -> &'static [AnimationClipType] {
        &[
            AnimationClipType::Idle,
            AnimationClipType::Walk,
            AnimationClipType::Run,
            AnimationClipType::Jump,
            AnimationClipType::Slash,
            AnimationClipType::Hit,
            AnimationClipType::Death,
            AnimationClipType::Block,
            AnimationClipType::Fall,
            AnimationClipType::Land,
            AnimationClipType::Dash,
            AnimationClipType::Interact,
            AnimationClipType::ChestOpen,
        ]
    }

    pub fn name(&self) -> &'static str {
        match self {
            AnimationClipType::Idle => "Idle",
            AnimationClipType::Walk => "Walk",
            AnimationClipType::Run => "Run",
            AnimationClipType::Jump => "Jump",
            AnimationClipType::Slash => "Slash",
            AnimationClipType::Hit => "Hit",
            AnimationClipType::Death => "Death",
            AnimationClipType::Block => "Block",
            AnimationClipType::Fall => "Fall",
            AnimationClipType::Land => "Land",
            AnimationClipType::Dash => "Dash",
            AnimationClipType::Interact => "Interact",
            AnimationClipType::ChestOpen => "ChestOpen",
        }
    }

    pub fn duration(&self) -> f32 {
        match self {
            AnimationClipType::Idle => 2.0,
            AnimationClipType::Walk => 1.0,
            AnimationClipType::Run => 0.66,
            AnimationClipType::Jump => 1.2,
            AnimationClipType::Slash => 0.8,
            AnimationClipType::Hit => 0.4,
            AnimationClipType::Death => 1.2,
            AnimationClipType::Block => 1.0,
            AnimationClipType::Fall => 0.6,
            AnimationClipType::Land => 0.45,
            AnimationClipType::Dash => 0.5,
            AnimationClipType::Interact => 1.2,
            AnimationClipType::ChestOpen => 2.0,
        }
    }

    #[allow(dead_code)]

    pub fn is_loop(&self) -> bool {
        matches!(
            self,
            AnimationClipType::Idle
                | AnimationClipType::Walk
                | AnimationClipType::Run
                | AnimationClipType::Block
                | AnimationClipType::Fall
        )
    }

    pub fn fps(&self) -> u32 {
        30
    }

    pub fn frame_count(&self) -> usize {
        (self.duration() * self.fps() as f32).ceil() as usize
    }
}

/// Bone role mapping for procedural animation targeting
fn bone_role_map(bones: &[BoneSpec]) -> BTreeMap<String, usize> {
    let mut map = BTreeMap::new();
    for (i, bone) in bones.iter().enumerate() {
        let name_lower = bone.name.to_lowercase();
        // Map common bone names to roles
        if name_lower.contains("hip") || name_lower.contains("pelvis") || name_lower.contains("root") {
            map.insert("Hips".to_string(), i);
        } else if name_lower.contains("spine") || name_lower.contains("torso") || name_lower.contains("chest") {
            if name_lower.contains("chest") || name_lower.contains("upper") {
                map.insert("Chest".to_string(), i);
            } else {
                map.insert("Spine".to_string(), i);
            }
        } else if name_lower.contains("neck") {
            map.insert("Neck".to_string(), i);
        } else if name_lower.contains("head") {
            map.insert("Head".to_string(), i);
        } else if name_lower.contains("left") && (name_lower.contains("upperarm") || name_lower.contains("shoulder")) {
            map.insert("LeftUpperArm".to_string(), i);
        } else if name_lower.contains("left") && (name_lower.contains("lowerarm") || name_lower.contains("forearm") || name_lower.contains("elbow")) {
            map.insert("LeftLowerArm".to_string(), i);
        } else if name_lower.contains("right") && (name_lower.contains("upperarm") || name_lower.contains("shoulder")) {
            map.insert("RightUpperArm".to_string(), i);
        } else if name_lower.contains("right") && (name_lower.contains("lowerarm") || name_lower.contains("forearm") || name_lower.contains("elbow")) {
            map.insert("RightLowerArm".to_string(), i);
        } else if name_lower.contains("left") && (name_lower.contains("upperleg") || name_lower.contains("thigh")) {
            map.insert("LeftUpperLeg".to_string(), i);
        } else if name_lower.contains("left") && (name_lower.contains("lowerleg") || name_lower.contains("calf") || name_lower.contains("knee")) {
            map.insert("LeftLowerLeg".to_string(), i);
        } else if name_lower.contains("right") && (name_lower.contains("upperleg") || name_lower.contains("thigh")) {
            map.insert("RightUpperLeg".to_string(), i);
        } else if name_lower.contains("right") && (name_lower.contains("lowerleg") || name_lower.contains("calf") || name_lower.contains("knee")) {
            map.insert("RightLowerLeg".to_string(), i);
        }
    }
    map
}

/// Generate keyframes for a specific animation clip
fn generate_animation_keyframes(
    clip: AnimationClipType,
    _bones: &[BoneSpec],
    bone_roles: &BTreeMap<String, usize>,
) -> Vec<(usize, Vec<KeyframeData>)> {
    // Returns: Vec<(bone_idx, Vec<(time, rotation_euler_deg, translation_offset)>>)>
    let duration = clip.duration();
    let _fps = clip.fps() as f32;
    let frame_count = clip.frame_count();
    let dt = duration / frame_count as f32;

    let mut result = Vec::new();

    let get_bone = |role: &str| -> Option<usize> { bone_roles.get(role).copied() };

    match clip {
        AnimationClipType::Idle => {
            // Subtle breathing sway
            let roles = [
                ("Hips", 0.02, [0.0, 0.0, 0.0]),
                ("Spine", 0.03, [0.0, 0.0, 0.0]),
                ("Chest", 0.04, [0.0, 0.0, 0.0]),
                ("Neck", 0.02, [0.0, 0.0, 0.0]),
                ("Head", 0.03, [0.0, 0.0, 0.0]),
                ("LeftUpperArm", 0.05, [0.0, 0.0, 0.0]),
                ("RightUpperArm", 0.05, [0.0, 0.0, 0.0]),
                ("LeftLowerArm", 0.03, [0.0, 0.0, 0.0]),
                ("RightLowerArm", 0.03, [0.0, 0.0, 0.0]),
                ("LeftUpperLeg", 0.01, [0.0, 0.0, 0.0]),
                ("RightUpperLeg", 0.01, [0.0, 0.0, 0.0]),
                ("LeftLowerLeg", 0.01, [0.0, 0.0, 0.0]),
                ("RightLowerLeg", 0.01, [0.0, 0.0, 0.0]),
            ];
            for (role, amp, base) in roles {
                if let Some(idx) = get_bone(role) {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU * 0.5;
                        let rot = [
                            base[0] + amp * phase.sin(),
                            base[1] + amp * 0.5 * (phase * 2.0).sin(),
                            base[2] + amp * 0.3 * (phase * 3.0).sin(),
                        ];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Walk => {
            // Walk cycle: opposing arm/leg swing, hip sway
            let hip_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let _neck_idx = get_bone("Neck");
            let _head_idx = get_bone("Head");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_lower_arm_idx = get_bone("LeftLowerArm");
            let r_lower_arm_idx = get_bone("RightLowerArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");
            let l_lower_leg_idx = get_bone("LeftLowerLeg");
            let r_lower_leg_idx = get_bone("RightLowerLeg");

            if let Some(idx) = hip_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [0.0, 0.15 * phase.sin(), 0.08 * (phase * 2.0).sin()];
                    let trans = Some([0.0, 0.03 * (phase * 2.0).cos(), 0.0]);
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [0.1 * phase.cos(), 0.0, 0.05 * phase.sin()];
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [-0.08 * phase.cos(), 0.0, 0.03 * phase.sin()];
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            // Arms: opposite to legs
            for (idx_opt, phase_offset, swing_amp) in [
                (l_upper_arm_idx, 0.0, 1.0),
                (r_upper_arm_idx, 0.5, -1.0),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [swing_amp * 0.8 * phase.sin(), 0.0, 0.1 * phase.cos()];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            // Lower arms follow
            for (idx_opt, phase_offset) in [
                (l_lower_arm_idx, 0.0),
                (r_lower_arm_idx, 0.5),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [0.3 * phase.sin(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            // Legs
            for (idx_opt, phase_offset, swing) in [
                (l_upper_leg_idx, 0.0, 1.0),
                (r_upper_leg_idx, 0.5, -1.0),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [swing * 0.9 * phase.sin().max(0.0), 0.0, 0.05 * phase.cos()];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, phase_offset) in [
                (l_lower_leg_idx, 0.0),
                (r_lower_leg_idx, 0.5),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [0.5 * phase.sin().max(0.0), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Run => {
            // Faster, more exaggerated walk
            let hip_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");
            let l_lower_leg_idx = get_bone("LeftLowerLeg");
            let r_lower_leg_idx = get_bone("RightLowerLeg");

            if let Some(idx) = hip_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [0.0, 0.25 * phase.sin(), 0.12 * (phase * 2.0).sin()];
                    let trans = Some([0.0, 0.06 * (phase * 2.0).cos(), 0.0]);
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [0.2 * phase.cos(), 0.0, 0.08 * phase.sin()];
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [-0.15 * phase.cos(), 0.0, 0.05 * phase.sin()];
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, phase_offset) in [
                (l_upper_arm_idx, 0.0),
                (r_upper_arm_idx, 0.5),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [1.2 * phase.sin(), 0.0, 0.15 * phase.cos()];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, phase_offset) in [
                (l_upper_leg_idx, 0.0),
                (r_upper_leg_idx, 0.5),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [1.3 * phase.sin().max(0.0), 0.0, 0.08 * phase.cos()];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, phase_offset) in [
                (l_lower_leg_idx, 0.0),
                (r_lower_leg_idx, 0.5),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU + phase_offset * std::f32::consts::PI;
                        let rot = [0.7 * phase.sin().max(0.0), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Jump => {
            // Anticipation, launch, air, land
            let hip_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");
            let l_lower_leg_idx = get_bone("LeftLowerLeg");
            let r_lower_leg_idx = get_bone("RightLowerLeg");

            if let Some(idx) = hip_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = [
                        0.0,
                        0.0,
                        if progress < 0.2 { -0.3 * (progress / 0.2).sin() }
                        else if progress < 0.5 { 0.0 }
                        else { 0.0 },
                    ];
                    let trans = Some([
                        0.0,
                        if progress < 0.2 { -0.15 * (progress / 0.2).cos() }
                        else if progress < 0.7 { 0.25 * (1.0 - (progress - 0.2) / 0.5).max(0.0) }
                        else { 0.0 },
                        0.0,
                    ]);
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, role) in [(spine_idx, "Spine"), (chest_idx, "Chest")] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if role == "Spine" {
                            [-0.4 * (1.0 - progress).max(0.0), 0.0, 0.0]
                        } else {
                            [-0.2 * (1.0 - progress).max(0.0), 0.0, 0.0]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, side) in [(l_upper_arm_idx, 1.0), (r_upper_arm_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [side * 0.8 * (1.0 - progress).max(0.0), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, _phase_offset) in [
                (l_upper_leg_idx, 0.0),
                (r_upper_leg_idx, 0.0),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if progress < 0.2 {
                            [-0.8 * (progress / 0.2).sin(), 0.0, 0.0]
                        } else if progress < 0.7 {
                            [0.3 * (1.0 - (progress - 0.2) / 0.5).sin(), 0.0, 0.0]
                        } else {
                            [-0.5 * ((progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_lower_leg_idx, r_lower_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if progress < 0.7 {
                            [0.6 * (1.0 - progress / 0.7), 0.0, 0.0]
                        } else {
                            [0.0, 0.0, 0.0]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Slash => {
            // Quick sword slash: windup, swing, follow-through
            let chest_idx = get_bone("Chest");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let r_lower_arm_idx = get_bone("RightLowerArm");
            let spine_idx = get_bone("Spine");

            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        [0.0, 0.0, -0.4 * (progress / 0.3).sin()]
                    } else {
                        [0.0, 0.0, -0.4 * (1.0 - (progress - 0.3) / 0.7).sin()]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        [0.0, 0.0, -0.2 * (progress / 0.3).sin()]
                    } else {
                        [0.0, 0.0, -0.2 * (1.0 - (progress - 0.3) / 0.7).sin()]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = r_upper_arm_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.15 {
                        [-0.5 * (progress / 0.15).sin(), 0.0, 0.8 * (progress / 0.15).sin()]
                    } else if progress < 0.5 {
                        [-0.5, 0.0, 0.8 - 1.3 * ((progress - 0.15) / 0.35).sin()]
                    } else {
                        [-0.5 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.0, -0.5 * ((progress - 0.5) / 0.5).sin()]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = r_lower_arm_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.5 {
                        [1.2 * (progress / 0.5).sin(), 0.0, 0.0]
                    } else {
                        [1.2 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
        }
        AnimationClipType::Hit => {
            // Sharp impact recoil
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let head_idx = get_bone("Head");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");

            for (idx_opt, amp) in [
                (hips_idx, 0.0),
                (spine_idx, 0.3),
                (chest_idx, 0.5),
                (head_idx, 0.4),
                (l_upper_arm_idx, 0.2),
                (r_upper_arm_idx, 0.2),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [
                            amp * (1.0 - progress).max(0.0) * (-progress * 20.0).sin(),
                            0.0,
                            0.0,
                        ];
                        let trans = Some([
                            0.0,
                            0.0,
                            -amp * 0.3 * (1.0 - progress).max(0.0),
                        ]);
                        kfs.push((t, rot, trans));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Death => {
            // Progressive collapse
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let neck_idx = get_bone("Neck");
            let head_idx = get_bone("Head");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");

            if let Some(idx) = hips_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let trans = Some([0.0, -0.9 * progress, 0.0]);
                    kfs.push((t, [0.0, 0.0, 0.0], trans));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, rot_amp) in [
                (spine_idx, 0.8),
                (chest_idx, 1.0),
                (neck_idx, 0.6),
                (head_idx, 0.8),
            ] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [rot_amp * progress, 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_arm_idx, r_upper_arm_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [0.5 * progress, 0.0, 0.3 * progress];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_leg_idx, r_upper_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [0.3 * progress, 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Block => {
            // Defensive guard pose loop
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_lower_arm_idx = get_bone("LeftLowerArm");
            let r_lower_arm_idx = get_bone("RightLowerArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");

            if let Some(idx) = hips_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let trans = Some([0.0, -0.12 + 0.02 * phase.sin(), 0.0]);
                    kfs.push((t, [0.0, 0.0, 0.0], trans));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    kfs.push((t, [0.3, 0.0, 0.0], None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    kfs.push((t, [0.4, 0.0, 0.0], None));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, side) in [(l_upper_arm_idx, 1.0), (r_upper_arm_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let rot = [0.8, side * 0.6, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_lower_arm_idx, r_lower_arm_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        kfs.push((t, [0.5, 0.0, 0.0], None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_leg_idx, r_upper_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        kfs.push((t, [0.4, 0.0, 0.0], None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Fall => {
            // Airborne loop
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");

            if let Some(idx) = hips_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let phase = t * std::f32::consts::TAU;
                    let rot = [0.1 * phase.sin(), 0.0, 0.05 * phase.cos()];
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, amp) in [(spine_idx, 0.15), (chest_idx, 0.2)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU;
                        let rot = [amp * phase.cos(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, side) in [(l_upper_arm_idx, 1.0), (r_upper_arm_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU;
                        let rot = [side * 0.6 * phase.sin(), 0.0, 0.8];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for (idx_opt, side) in [(l_upper_leg_idx, 1.0), (r_upper_leg_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let phase = t * std::f32::consts::TAU;
                        let rot = [side * 0.3 * phase.sin(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Land => {
            // Impact absorption
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");
            let l_lower_leg_idx = get_bone("LeftLowerLeg");
            let r_lower_leg_idx = get_bone("RightLowerLeg");

            if let Some(idx) = hips_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let trans = Some([0.0, -0.25 * progress.sin().min(1.0), 0.0]);
                    let rot = [0.3 * progress.sin(), 0.0, 0.0];
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, amp) in [(spine_idx, 0.2), (chest_idx, 0.15)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [amp * progress.sin(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_leg_idx, r_upper_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [0.8 * progress.sin(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_lower_leg_idx, r_lower_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [0.5 * progress.sin(), 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Dash => {
            // Explosive dodge
            let hips_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_upper_leg_idx = get_bone("LeftUpperLeg");
            let r_upper_leg_idx = get_bone("RightUpperLeg");

            if let Some(idx) = hips_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let trans = Some([0.0, 0.0, -0.5 * progress * (1.0 - progress) * 4.0]);
                    let rot = [0.6 * progress, 0.0, 0.0];
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }
            for (idx_opt, amp) in [(spine_idx, 0.5), (chest_idx, 0.7)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [amp * progress, 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_arm_idx, r_upper_arm_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [-0.8 * progress, 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
            for idx_opt in [l_upper_leg_idx, r_upper_leg_idx] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = [1.2 * progress * (1.0 - progress) * 4.0, 0.0, 0.0];
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
        AnimationClipType::Interact => {
            // Victory/Interaction pose
            let chest_idx = get_bone("Chest");
            let head_idx = get_bone("Head");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let r_lower_arm_idx = get_bone("RightLowerArm");
            let spine_idx = get_bone("Spine");

            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.5 {
                        [-0.2 * (progress / 0.5).sin(), 0.2 * (progress / 0.5).sin(), 0.0]
                    } else {
                        [-0.2 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.2 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.5 {
                        [-0.1 * (progress / 0.5).sin(), 0.0, 0.0]
                    } else {
                        [-0.1 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = head_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.5 {
                        [0.0, 0.2 * (progress / 0.5).sin(), 0.0]
                    } else {
                        [0.0, 0.2 * (1.0 - (progress - 0.5) / 0.5).sin(), 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = r_upper_arm_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        [-0.3 * (progress / 0.3).sin(), -0.8 * (progress / 0.3).sin(), 0.0]
                    } else if progress < 0.7 {
                        [-0.3, -0.8, 0.0]
                    } else {
                        [-0.3 * (1.0 - (progress - 0.7) / 0.3).sin(), -0.8 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
            if let Some(idx) = r_lower_arm_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.7 {
                        [0.5 * (progress / 0.7).sin(), 0.0, 0.0]
                    } else {
                        [0.5 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }
        }
        AnimationClipType::ChestOpen => {
            // Professional chest opening animation: deep inhalation, chest expansion, shoulders back, proud pose
            // Phases: 0-30% inhale/expand, 30-60% hold/peak, 60-100% controlled release
            let hip_idx = get_bone("Hips");
            let spine_idx = get_bone("Spine");
            let chest_idx = get_bone("Chest");
            let neck_idx = get_bone("Neck");
            let head_idx = get_bone("Head");
            let l_upper_arm_idx = get_bone("LeftUpperArm");
            let r_upper_arm_idx = get_bone("RightUpperArm");
            let l_lower_arm_idx = get_bone("LeftLowerArm");
            let r_lower_arm_idx = get_bone("RightLowerArm");
            let l_clavicle_idx = get_bone("LeftClavicle").or_else(|| get_bone("LeftCollar"));
            let r_clavicle_idx = get_bone("RightClavicle").or_else(|| get_bone("RightCollar"));

            // Hips: slight counter-movement, subtle grounding
            if let Some(idx) = hip_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        // Slight anterior pelvic tilt during inhale
                        [0.05 * (progress / 0.3).sin(), 0.0, 0.0]
                    } else if progress < 0.7 {
                        // Hold with subtle engagement
                        [0.05 * (1.0 - (progress - 0.3) / 0.4).sin(), 0.0, 0.0]
                    } else {
                        // Release
                        [0.05 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    let trans = Some([
                        0.0,
                        if progress < 0.3 { -0.01 * (progress / 0.3).sin() } else { 0.0 },
                        0.0,
                    ]);
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }

            // Spine: lumbar extension during inhale, then thoracic
            if let Some(idx) = spine_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        // Lumbar extends slightly
                        [-0.12 * (progress / 0.3).sin(), 0.0, 0.0]
                    } else if progress < 0.7 {
                        // Hold extension
                        [-0.12, 0.0, 0.0]
                    } else {
                        // Controlled return
                        [-0.12 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }

            // Chest: main expansion - ribs widen, sternum lifts
            if let Some(idx) = chest_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        // Sternal lift and rib cage expansion
                        [-0.35 * (progress / 0.3).sin(), 0.0, 0.0]
                    } else if progress < 0.7 {
                        // Peak expansion held
                        [-0.35, 0.0, 0.0]
                    } else {
                        // Slow controlled exhale
                        [-0.35 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    let trans = Some([
                        0.0,
                        if progress < 0.3 { 0.02 * (progress / 0.3).sin() } else if progress < 0.7 { 0.02 } else { 0.02 * (1.0 - (progress - 0.7) / 0.3).sin() },
                        0.0,
                    ]);
                    kfs.push((t, rot, trans));
                }
                result.push((idx, kfs));
            }

            // Clavicles: shoulders roll back and slightly down (scapular retraction/depression)
            for (idx_opt, side) in [(l_clavicle_idx, 1.0), (r_clavicle_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if progress < 0.3 {
                            // Retract and depress
                            [0.0, 0.0, side * 0.15 * (progress / 0.3).sin()]
                        } else if progress < 0.7 {
                            // Hold retraction
                            [0.0, 0.0, side * 0.15]
                        } else {
                            // Release
                            [0.0, 0.0, side * 0.15 * (1.0 - (progress - 0.7) / 0.3).sin()]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }

            // Neck: slight extension (chin lifts slightly)
            if let Some(idx) = neck_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        [-0.08 * (progress / 0.3).sin(), 0.0, 0.0]
                    } else if progress < 0.7 {
                        [-0.08, 0.0, 0.0]
                    } else {
                        [-0.08 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }

            // Head: follows neck, slight lift
            if let Some(idx) = head_idx {
                let mut kfs = Vec::new();
                for f in 0..=frame_count {
                    let t = f as f32 * dt;
                    let progress = t / duration;
                    let rot = if progress < 0.3 {
                        [-0.05 * (progress / 0.3).sin(), 0.0, 0.0]
                    } else if progress < 0.7 {
                        [-0.05, 0.0, 0.0]
                    } else {
                        [-0.05 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                    };
                    kfs.push((t, rot, None));
                }
                result.push((idx, kfs));
            }

            // Upper arms: abduct slightly, externally rotate (palms opening)
            for (idx_opt, side) in [(l_upper_arm_idx, 1.0), (r_upper_arm_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if progress < 0.3 {
                            // Abduct and externally rotate
                            [side * 0.4 * (progress / 0.3).sin(), 0.0, side * 0.3 * (progress / 0.3).sin()]
                        } else if progress < 0.7 {
                            // Hold open position
                            [side * 0.4, 0.0, side * 0.3]
                        } else {
                            // Return to neutral
                            [side * 0.4 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, side * 0.3 * (1.0 - (progress - 0.7) / 0.3).sin()]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }

            // Lower arms: follow upper arms, palms facing forward/up
            for (idx_opt, _side) in [(l_lower_arm_idx, 1.0), (r_lower_arm_idx, -1.0)] {
                if let Some(idx) = idx_opt {
                    let mut kfs = Vec::new();
                    for f in 0..=frame_count {
                        let t = f as f32 * dt;
                        let progress = t / duration;
                        let rot = if progress < 0.3 {
                            [0.2 * (progress / 0.3).sin(), 0.0, 0.0]
                        } else if progress < 0.7 {
                            [0.2, 0.0, 0.0]
                        } else {
                            [0.2 * (1.0 - (progress - 0.7) / 0.3).sin(), 0.0, 0.0]
                        };
                        kfs.push((t, rot, None));
                    }
                    result.push((idx, kfs));
                }
            }
        }
    }

    result
}

pub fn build_rigged_animation_glb_for_clip(scene: &SceneData, clip_type: AnimationClipType) -> Result<Vec<u8>, String> {
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

    // 3: JOINTS_0 (VEC4 u16)
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

    // 4: WEIGHTS_0 (VEC4 f32)
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

    // 5: INDICES (SCALAR u16)
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

    // 6: inverseBindMatrices (MAT4 f32)
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

    // Build Node Hierarchy
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

    // ========================================================================
    // BUILD SINGLE PROCEDURAL ANIMATION CLIP
    // ========================================================================
    let bone_roles = bone_role_map(&scene.bones);
    let keyframes_by_bone = generate_animation_keyframes(clip_type, &scene.bones, &bone_roles);

    let mut animations: Vec<GltfAnimation> = Vec::new();

    if !keyframes_by_bone.is_empty() {
        let mut channels: Vec<GltfAnimationChannel> = Vec::new();
        let mut samplers: Vec<GltfAnimationSampler> = Vec::new();

        for (b_idx, kfs) in keyframes_by_bone {
            if kfs.is_empty() {
                continue;
            }

            let bone = &scene.bones[b_idx];
            let rest_q = euler_deg_to_quat(bone.rest_rotation_euler_deg);

            let mut times: Vec<f32> = Vec::with_capacity(kfs.len());
            let mut rots: Vec<f32> = Vec::with_capacity(kfs.len() * 4);
            let mut trans: Vec<f32> = Vec::with_capacity(kfs.len() * 3);
            let mut has_translation = false;

            let mut last_time: Option<f32> = None;
            for (t, rot_deg, trans_opt) in &kfs {
                let mut time_val = if t.is_finite() { t.max(0.0) } else { 0.0 };
                if let Some(prev_t) = last_time {
                    if time_val <= prev_t {
                        time_val = prev_t + 1e-4;
                    }
                }
                last_time = Some(time_val);
                times.push(time_val);

                let delta_q = euler_deg_to_quat(*rot_deg);
                let final_q = (rest_q * delta_q).normalize();
                rots.extend_from_slice(&final_q.to_array());

                let offset = trans_opt.unwrap_or([0.0, 0.0, 0.0]);
                if trans_opt.is_some() {
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

        if !channels.is_empty() {
            animations.push(GltfAnimation {
                name: clip_type.name().to_string(),
                channels,
                samplers,
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

    let root = GltfRoot {
        asset: GltfAsset {
            version: "2.0",
            generator: "Vertice Studio Rust Wasm Core (Blender 5.3+) — 12 Procedural Animations",
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

#[allow(dead_code)]

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

    // 3: JOINTS_0 (VEC4 u16)
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

    // 4: WEIGHTS_0 (VEC4 f32)
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

    // 5: INDICES (SCALAR u16)
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

    // 6: inverseBindMatrices (MAT4 f32)
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

    // Build Node Hierarchy
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

    // ========================================================================
    // BUILD 12 PROCEDURAL ANIMATION CLIPS
    // ========================================================================
    let bone_roles = bone_role_map(&scene.bones);
    let clip_types = AnimationClipType::all();

    let mut animations: Vec<GltfAnimation> = Vec::new();

    for clip_type in clip_types {
        let keyframes_by_bone = generate_animation_keyframes(*clip_type, &scene.bones, &bone_roles);
        if keyframes_by_bone.is_empty() {
            continue;
        }

        let mut channels: Vec<GltfAnimationChannel> = Vec::new();
        let mut samplers: Vec<GltfAnimationSampler> = Vec::new();

        for (b_idx, kfs) in keyframes_by_bone {
            if kfs.is_empty() {
                continue;
            }

            let bone = &scene.bones[b_idx];
            let rest_q = euler_deg_to_quat(bone.rest_rotation_euler_deg);

            let mut times: Vec<f32> = Vec::with_capacity(kfs.len());
            let mut rots: Vec<f32> = Vec::with_capacity(kfs.len() * 4);
            let mut trans: Vec<f32> = Vec::with_capacity(kfs.len() * 3);
            let mut has_translation = false;

            let mut last_time: Option<f32> = None;
            for (t, rot_deg, trans_opt) in &kfs {
                let mut time_val = if t.is_finite() { t.max(0.0) } else { 0.0 };
                if let Some(prev_t) = last_time {
                    if time_val <= prev_t {
                        time_val = prev_t + 1e-4;
                    }
                }
                last_time = Some(time_val);
                times.push(time_val);

                let delta_q = euler_deg_to_quat(*rot_deg);
                let final_q = (rest_q * delta_q).normalize();
                rots.extend_from_slice(&final_q.to_array());

                let offset = trans_opt.unwrap_or([0.0, 0.0, 0.0]);
                if trans_opt.is_some() {
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

        if !channels.is_empty() {
            animations.push(GltfAnimation {
                name: clip_type.name().to_string(),
                channels,
                samplers,
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

    let root = GltfRoot {
        asset: GltfAsset {
            version: "2.0",
            generator: "Vertice Studio Rust Wasm Core (Blender 5.3+) — 12 Procedural Animations",
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
