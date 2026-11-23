import type { ShaderPreset } from '../types/graphics';

export const WGSL_PARTICLE_COMPUTE = /* wgsl */ `
struct SimParams {
  dt: f32,
  time: f32,
  turbulence: f32,
  dispersion: f32,
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

struct Particle {
  pos: vec4<f32>, // xyz + phase
  vel: vec4<f32>, // xyz + speed
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

fn hash3(n: u32) -> vec3<f32> {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  let a = f32((x >> 22u) ^ x) / 4294967295.0;
  let y = x * 1664525u + 1013904223u;
  let b = f32((y >> 16u) ^ y) / 4294967295.0;
  let z = y * 22695477u + 1u;
  let c = f32((z >> 14u) ^ z) / 4294967295.0;
  return vec3<f32>(a, b, c) * 2.0 - 1.0;
}

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.count) {
    return;
  }

  var p = particles[idx];
  var pos = p.pos.xyz;
  var vel = p.vel.xyz;
  let phase = p.pos.w;

  let r = max(length(pos), 0.15);
  let targetRadius = 2.6 + params.dispersion * 2.4 + 0.65 * sin(phase * 6.2831 + params.time * 0.8);

  let radialDir = normalize(pos + vec3<f32>(0.0001, 0.0002, 0.0001));
  let tangent = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), radialDir) + vec3<f32>(0.001));

  let swirlForce = tangent * (2.8 + params.turbulence * 1.6);
  let springForce = radialDir * ((targetRadius - r) * 2.4);
  let waveY = sin(pos.x * 1.7 + params.time * 1.4) * cos(pos.z * 1.7 - params.time * 1.1);
  let curlVec = vec3<f32>(
    cos(pos.y * 2.1 + params.time),
    waveY * 1.6 - pos.y * 0.9,
    sin(pos.x * 2.1 - params.time)
  ) * params.turbulence;

  vel = mix(vel, swirlForce + springForce + curlVec, clamp(params.dt * 3.5, 0.01, 0.4));
  pos = pos + vel * params.dt;

  if (length(pos) > 12.0) {
    pos = hash3(idx + 17u) * 2.2;
    vel = vec3<f32>(0.0);
  }

  p.pos = vec4<f32>(pos, phase);
  p.vel = vec4<f32>(vel, length(vel));
  particles[idx] = p;
}
`;

export const WGSL_PARTICLE_RENDER = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  time: f32,
  pointScale: f32,
  _pad0: f32,
  _pad1: f32,
};

struct Particle {
  pos: vec4<f32>,
  vel: vec4<f32>,
};

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) quadUv: vec2<f32>,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vIdx: u32,
  @builtin(instance_index) iIdx: u32
) -> VsOut {
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0,  1.0)
  );

  let p = particles[iIdx];
  let clip = cam.viewProj * vec4<f32>(p.pos.xyz, 1.0);
  let corner = corners[vIdx];
  let size = cam.pointScale * (0.014 + min(p.vel.w * 0.004, 0.012));

  var out: VsOut;
  out.position = clip + vec4<f32>(corner.x * size, corner.y * size * 1.4, 0.0, 0.0);
  out.quadUv = corner;

  let speedT = clamp(p.vel.w / 6.0, 0.0, 1.0);
  let cLow = vec3<f32>(0.14, 0.62, 0.98);
  let cMid = vec3<f32>(0.22, 0.85, 0.78);
  let cHigh = vec3<f32>(0.98, 0.62, 0.24);
  out.color = mix(mix(cLow, cMid, speedT), cHigh, smoothstep(0.45, 1.0, speedT));
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let d = dot(in.quadUv, in.quadUv);
  if (d > 1.0) {
    discard;
  }
  let alpha = pow(1.0 - d, 1.8) * 0.92;
  return vec4<f32>(in.color * alpha, alpha);
}
`;

export const GLSL_HARMONIC_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uTurbulence;
uniform float uFrequency;

varying vec3 vNormalWorld;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vDisplacement;

float harmonicField(vec3 p, float t, float freq) {
  float a = sin(p.x * freq + t * 1.3) * cos(p.y * freq - t * 0.9);
  float b = sin(p.y * freq * 1.4 + t * 1.1) * cos(p.z * freq * 1.2 + t * 0.8);
  float c = cos(p.z * freq * 1.7 - t * 1.5) * sin(p.x * freq * 1.1 + t * 0.7);
  return (a + b + c) * 0.3333;
}

void main() {
  vUv = uv;
  vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
  float field = harmonicField(worldBase, uTime, uFrequency);
  float objScale = max(length(vec3(modelMatrix[0].xyz)), 0.0001);
  float disp = (field * 0.22 * uTurbulence) / objScale;
  vec3 displaced = position + normal * disp;

  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vDisplacement = field * mix(0.32, 0.48, clamp(uTurbulence, 0.0, 1.0));

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const GLSL_HARMONIC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vNormalWorld;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vDisplacement;

void main() {
  vec3 N = normalize(vNormalWorld) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

  vec3 deepSlate = vec3(0.06, 0.11, 0.22);
  vec3 cobalt = vec3(0.11, 0.56, 0.96);
  vec3 amber = vec3(0.96, 0.58, 0.18);

  float crest = smoothstep(-0.22, 0.32, vDisplacement);
  vec3 base = mix(deepSlate, cobalt, crest);
  vec3 highlight = mix(cobalt, amber, smoothstep(0.15, 0.45, vDisplacement));

  vec3 L = normalize(vec3(4.0, 6.0, 5.0));
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0);

  vec3 finalColor = base + highlight * (fresnel * 1.15) + vec3(0.95, 0.97, 1.0) * (spec * 0.65);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export const SHADER_PRESETS: ShaderPreset[] = [
  {
    id: 'harmonic',
    name: 'Plasma Harmônico',
    description: 'Deslocamento senoidal 3D nos vértices com Fresnel e brilho especular direcional.',
    vertexShader: GLSL_HARMONIC_VERTEX.trim(),
    fragmentShader: GLSL_HARMONIC_FRAGMENT.trim(),
  },
  {
    id: 'hologram',
    name: 'Holograma Fresnel',
    description: 'Varredura de linhas horizontais combinada com borda emissiva dependente do ângulo de visão.',
    vertexShader: `uniform float uTime;
uniform float uTurbulence;
uniform float uFrequency;

varying vec3 vNormalWorld;
varying vec3 vWorldPos;
varying float vScanY;

void main() {
  vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
  float objScale = max(length(vec3(modelMatrix[0].xyz)), 0.0001);
  float pulse = (sin(worldBase.y * uFrequency * 3.0 - uTime * 3.0) * 0.045 * uTurbulence) / objScale;
  vec3 displaced = position + normal * pulse;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  vScanY = worldPosition.y;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vNormalWorld;
varying vec3 vWorldPos;
varying float vScanY;

void main() {
  vec3 N = normalize(vNormalWorld) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float rim = pow(1.0 - abs(dot(N, V)), 2.4);
  float scan = 0.55 + 0.45 * sin(vScanY * 32.0 - uTime * 6.0);
  vec3 cyan = vec3(0.18, 0.84, 0.96);
  vec3 core = vec3(0.04, 0.12, 0.24);
  vec3 col = mix(core, cyan, clamp(rim * 1.3 + scan * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'topo',
    name: 'Topografia Termal',
    description: 'Isolinhas de altitude calculadas em tempo real sobre superfície deformada.',
    vertexShader: GLSL_HARMONIC_VERTEX.trim(),
    fragmentShader: `uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vNormalWorld;
varying vec3 vWorldPos;
varying float vDisplacement;

void main() {
  vec3 N = normalize(vNormalWorld) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float bands = abs(fract(vDisplacement * 14.0) - 0.5);
  float contour = 1.0 - smoothstep(0.02, 0.08, bands);

  vec3 lowCol = vec3(0.07, 0.14, 0.28);
  vec3 midCol = vec3(0.12, 0.65, 0.68);
  vec3 highCol = vec3(0.98, 0.52, 0.16);
  float h = smoothstep(-0.3, 0.35, vDisplacement);
  vec3 surf = mix(mix(lowCol, midCol, h), highCol, smoothstep(0.55, 1.0, h));

  float light = max(dot(N, normalize(vec3(3.0, 5.0, 4.0))), 0.2);
  vec3 finalCol = surf * light + vec3(0.95, 0.98, 1.0) * contour * 0.45;
  gl_FragColor = vec4(finalCol, 1.0);
}`,
  },
  {
    id: 'grid',
    name: 'Grade Vetorial UV',
    description: 'Padrão analítico de coordenadas UV com iluminação Lambertiana suave.',
    vertexShader: `uniform float uTime;
uniform float uTurbulence;
uniform float uFrequency;

varying vec3 vNormalWorld;
varying vec2 vUv;

void main() {
  vUv = uv;
  float objScale = max(length(vec3(modelMatrix[0].xyz)), 0.0001);
  float wave = (sin(uv.x * 12.566 * uFrequency + uTime * 2.0) * 0.035 * uTurbulence) / objScale;
  vec3 displaced = position + normal * wave;
  vNormalWorld = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}`,
    fragmentShader: `uniform float uTime;

varying vec3 vNormalWorld;
varying vec2 vUv;

void main() {
  vec2 grid = abs(fract(vUv * vec2(18.0, 9.0) - 0.5) - 0.5);
  float line = 1.0 - min(smoothstep(0.02, 0.06, grid.x), smoothstep(0.02, 0.06, grid.y));
  vec3 N = normalize(vNormalWorld) * (gl_FrontFacing ? 1.0 : -1.0);
  float diff = max(dot(N, normalize(vec3(4.0, 6.0, 4.0))), 0.25);

  vec3 base = vec3(0.08, 0.10, 0.16) * diff;
  vec3 wire = vec3(0.22, 0.74, 0.97);
  gl_FragColor = vec4(mix(base, wire, line * 0.85), 1.0);
}`,
  },
];
