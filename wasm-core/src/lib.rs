mod blender_py;
mod glb;

use crate::glb::AnimationClipType;
use glam::{EulerRot, Mat4, Quat, Vec3};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshAnalysisInput {
    pub positions: Vec<f32>,
    pub scale_factor: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshBounds {
    pub min: [f32; 3],
    pub max: [f32; 3],
    pub center: [f32; 3],
    pub size: [f32; 3],
    pub radius: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshAnalysisOutput {
    pub vertex_count: usize,
    pub triangle_estimate: usize,
    pub bounds: MeshBounds,
    pub normalized_scale: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoneSpec {
    pub name: String,
    pub parent_index: Option<usize>,
    pub rest_translation: [f32; 3],
    pub rest_rotation_euler_deg: [f32; 3],
    pub length: f32,
    pub radius: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframeSpec {
    pub time: f32,
    pub bone_name: String,
    pub rotation_euler_deg: [f32; 3],
    pub translation_offset: Option<[f32; 3]>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VfxEmitterSpec {
    pub name: String,
    pub attach_bone: String,
    pub emitter_type: String,
    pub rate: u32,
    pub lifetime: f32,
    pub speed: f32,
    pub spread: f32,
    pub color_hex: String,
    pub particle_size: f32,
    pub turbulence: f32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneData {
    pub scene_name: String,
    pub fps: f32,
    pub duration: f32,
    pub base_color_hex: String,
    pub metallic: f32,
    pub roughness: f32,
    pub bones: Vec<BoneSpec>,
    pub keyframes: Vec<KeyframeSpec>,
    pub emitters: Vec<VfxEmitterSpec>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatedBonePose {
    pub name: String,
    pub local_translation: [f32; 3],
    pub local_quaternion: [f32; 4],
    pub world_position: [f32; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluatedSceneFrame {
    pub time: f32,
    pub bones: Vec<EvaluatedBonePose>,
}

#[wasm_bindgen]
pub fn analyze_mesh_bounds(input: JsValue) -> Result<JsValue, JsValue> {
    let parsed: MeshAnalysisInput = serde_wasm_bindgen::from_value(input).map_err(|err| {
        JsValue::from_str(&format!("Entrada inválida para analyze_mesh_bounds: {err}"))
    })?;

    if parsed.positions.is_empty() || parsed.positions.len() % 3 != 0 {
        return Err(JsValue::from_str(
            "O vetor 'positions' deve ser não vazio e múltiplo de 3 (x, y, z).",
        ));
    }

    let scale = parsed.scale_factor.unwrap_or(1.0);
    if !scale.is_finite() || scale <= 0.0 {
        return Err(JsValue::from_str(
            "O parâmetro 'scaleFactor' deve ser um número finito maior que zero.",
        ));
    }

    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];

    for chunk in parsed.positions.chunks_exact(3) {
        let x = chunk[0] * scale;
        let y = chunk[1] * scale;
        let z = chunk[2] * scale;

        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            return Err(JsValue::from_str(
                "Foram encontradas coordenadas NaN ou infinitas em 'positions'.",
            ));
        }

        min[0] = min[0].min(x);
        min[1] = min[1].min(y);
        min[2] = min[2].min(z);

        max[0] = max[0].max(x);
        max[1] = max[1].max(y);
        max[2] = max[2].max(z);
    }

    let size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let center = [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
    ];
    let radius = 0.5 * (size[0] * size[0] + size[1] * size[1] + size[2] * size[2]).sqrt();
    let max_dim = size[0].max(size[1]).max(size[2]).max(0.0001);
    let vertex_count = parsed.positions.len() / 3;

    let result = MeshAnalysisOutput {
        vertex_count,
        triangle_estimate: vertex_count / 3,
        bounds: MeshBounds {
            min,
            max,
            center,
            size,
            radius,
        },
        normalized_scale: 3.2 / max_dim,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("Falha ao serializar saída Wasm: {err}")))
}

fn euler_deg_to_quat(deg: [f32; 3]) -> Quat {
    Quat::from_euler(
        EulerRot::XYZ,
        deg[0].to_radians(),
        deg[1].to_radians(),
        deg[2].to_radians(),
    )
}

#[wasm_bindgen]
pub fn evaluate_scene_frame(scene_data: JsValue, time_sec: f32) -> Result<JsValue, JsValue> {
    let scene: SceneData = serde_wasm_bindgen::from_value(scene_data)
        .map_err(|err| JsValue::from_str(&format!("SceneData inválido: {err}")))?;

    let dur = scene.duration.max(0.01);
    let wrapped_t = if time_sec >= 0.0 {
        time_sec % dur
    } else {
        0.0
    };

    let mut kf_map: BTreeMap<String, Vec<&KeyframeSpec>> = BTreeMap::new();
    for kf in &scene.keyframes {
        kf_map.entry(kf.bone_name.clone()).or_default().push(kf);
    }

    let mut world_mats: Vec<Mat4> = vec![Mat4::IDENTITY; scene.bones.len()];
    let mut evaluated: Vec<EvaluatedBonePose> = Vec::with_capacity(scene.bones.len());

    for (i, bone) in scene.bones.iter().enumerate() {
        let rest_q = euler_deg_to_quat(bone.rest_rotation_euler_deg);
        let mut delta_q = Quat::IDENTITY;
        let mut offset = Vec3::ZERO;

        if let Some(kfs) = kf_map.get_mut(&bone.name) {
            kfs.sort_by(|a, b| a.time.total_cmp(&b.time));
            if kfs.len() == 1 {
                delta_q = euler_deg_to_quat(kfs[0].rotation_euler_deg);
                if let Some(o) = kfs[0].translation_offset {
                    offset = Vec3::from_array(o);
                }
            } else if kfs.len() > 1 {
                let mut prev = kfs[0];
                let mut next = kfs[kfs.len() - 1];
                if wrapped_t <= prev.time {
                    next = prev;
                } else if wrapped_t >= next.time {
                    prev = next;
                } else {
                    for win in kfs.windows(2) {
                        if wrapped_t >= win[0].time && wrapped_t <= win[1].time {
                            prev = win[0];
                            next = win[1];
                            break;
                        }
                    }
                }

                let span = (next.time - prev.time).max(1e-5);
                let alpha = ((wrapped_t - prev.time) / span).clamp(0.0, 1.0);
                let q0 = euler_deg_to_quat(prev.rotation_euler_deg);
                let q1 = euler_deg_to_quat(next.rotation_euler_deg);
                delta_q = q0.slerp(q1, alpha);

                let o0 = Vec3::from_array(prev.translation_offset.unwrap_or([0.0, 0.0, 0.0]));
                let o1 = Vec3::from_array(next.translation_offset.unwrap_or([0.0, 0.0, 0.0]));
                offset = o0.lerp(o1, alpha);
            }
        }

        let local_q = (rest_q * delta_q).normalize();
        let local_t = Vec3::from_array(bone.rest_translation) + offset;
        let local_m = Mat4::from_rotation_translation(local_q, local_t);
        let parent_m = match bone.parent_index {
            Some(p) if p < i => world_mats[p],
            _ => Mat4::IDENTITY,
        };
        let world_m = parent_m * local_m;
        world_mats[i] = world_m;
        let wp = world_m.transform_point3(Vec3::ZERO);

        evaluated.push(EvaluatedBonePose {
            name: bone.name.clone(),
            local_translation: local_t.to_array(),
            local_quaternion: local_q.to_array(),
            world_position: wp.to_array(),
        });
    }

    let out = EvaluatedSceneFrame {
        time: wrapped_t,
        bones: evaluated,
    };

    serde_wasm_bindgen::to_value(&out)
        .map_err(|err| JsValue::from_str(&format!("Falha ao serializar pose FK: {err}")))
}

#[wasm_bindgen]
pub fn generate_rigged_animation_glb(scene_data: JsValue, clip_type: Option<String>) -> Result<Vec<u8>, JsValue> {
    let scene: SceneData = serde_wasm_bindgen::from_value(scene_data)
        .map_err(|err| JsValue::from_str(&format!("SceneData inválido para GLB: {err}")))?;

    let clip = if let Some(clip_str) = clip_type {
        match clip_str.to_lowercase().as_str() {
            "idle" => AnimationClipType::Idle,
            "walk" => AnimationClipType::Walk,
            "run" => AnimationClipType::Run,
            "jump" => AnimationClipType::Jump,
            "slash" => AnimationClipType::Slash,
            "hit" => AnimationClipType::Hit,
            "death" => AnimationClipType::Death,
            "block" => AnimationClipType::Block,
            "fall" => AnimationClipType::Fall,
            "land" => AnimationClipType::Land,
            "dash" => AnimationClipType::Dash,
            "interact" => AnimationClipType::Interact,
            "chest_open" => AnimationClipType::ChestOpen,
            _ => AnimationClipType::Idle,
        }
    } else {
        AnimationClipType::Idle
    };

    glb::build_rigged_animation_glb_for_clip(&scene, clip).map_err(|err| JsValue::from_str(&err))
}

#[wasm_bindgen]
pub fn get_animation_clip_types() -> Result<JsValue, JsValue> {
    let clips: Vec<&str> = AnimationClipType::all().iter().map(|c| c.name()).collect();
    serde_wasm_bindgen::to_value(&clips)
        .map_err(|err| JsValue::from_str(&format!("Falha ao serializar clip types: {err}")))
}

#[wasm_bindgen]
pub fn generate_blender_vfx_script(
    scene_data: JsValue,
    glb_filename: String,
) -> Result<String, JsValue> {
    let scene: SceneData = serde_wasm_bindgen::from_value(scene_data)
        .map_err(|err| JsValue::from_str(&format!("SceneData inválido para Blender .py: {err}")))?;

    if glb_filename.trim().is_empty() {
        return Err(JsValue::from_str(
            "O parâmetro 'glb_filename' não pode ser vazio.",
        ));
    }

    Ok(blender_py::build_blender_vfx_script(&scene, &glb_filename))
}
