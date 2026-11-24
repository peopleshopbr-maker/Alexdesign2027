import type { CameraPreset } from '../types/graphics';

interface CameraOrientationGizmoProps {
  cameraQuaternion: [number, number, number, number];
  rightPanelOpen: boolean;
  onSelectPreset: (preset: CameraPreset) => void;
}

interface AxisEndpoint {
  id: string;
  label: string;
  vec: [number, number, number];
  color: string;
  preset: CameraPreset;
}

const AXES: AxisEndpoint[] = [
  { id: 'x', label: 'X', vec: [1, 0, 0], color: '#fb7185', preset: 'side' },
  { id: 'y', label: 'Y', vec: [0, 1, 0], color: '#34d399', preset: 'top' },
  { id: 'z', label: 'Z', vec: [0, 0, 1], color: '#38bdf8', preset: 'front' },
];

function rotateByConjQuat(
  v: [number, number, number],
  q: [number, number, number, number]
): [number, number, number] {
  // Inverse/conjugate of camera world quaternion transforms world axes into view space
  const qx = -q[0];
  const qy = -q[1];
  const qz = -q[2];
  const qw = q[3];

  const vx = v[0];
  const vy = v[1];
  const vz = v[2];

  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function CameraOrientationGizmo({
  cameraQuaternion,
  rightPanelOpen,
  onSelectPreset,
}: CameraOrientationGizmoProps) {
  const cx = 42;
  const cy = 42;
  const scale = 27;

  const projected = AXES.map((axis) => {
    const [rx, ry, rz] = rotateByConjQuat(axis.vec, cameraQuaternion);
    return {
      ...axis,
      px: cx + rx * scale,
      py: cy - ry * scale,
      nx: cx - rx * scale * 0.72,
      ny: cy + ry * scale * 0.72,
      depth: rz,
    };
  }).sort((a, b) => a.depth - b.depth);

  return (
    <div
      aria-label="Gizmo de orientação da câmera"
      className={`fixed top-[62px] sm:top-[68px] z-20 transition-all duration-200 flex flex-col items-center gap-1.5 bg-[#101521]/92 border border-white/12 rounded-2xl p-1.5 sm:p-2 shadow-xl scale-[0.82] sm:scale-100 origin-top-right ${
        rightPanelOpen ? 'right-[348px] hidden md:flex' : 'right-2 sm:right-4 flex'
      }`}
    >
      <svg
        width={84}
        height={84}
        viewBox="0 0 84 84"
        className="select-none overflow-visible"
      >
        <circle
          cx={cx}
          cy={cy}
          r={34}
          fill="#090c13"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        {/* Centro para vista orbital padrão */}
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill="#1e293b"
          stroke="#64748b"
          strokeWidth={1.2}
          className="cursor-pointer hover:fill-sky-400"
          onClick={() => onSelectPreset('orbital')}
        >
          <title>Vista Orbital 3D (Tecla 0)</title>
        </circle>

        {projected.map((ax) => (
          <g key={ax.id}>
            {/* Eixo negativo sutil */}
            <circle
              cx={ax.nx}
              cy={ax.ny}
              r={4.2}
              fill="#0f172a"
              stroke={ax.color}
              strokeOpacity={0.45}
              strokeWidth={1}
              className="cursor-pointer"
              onClick={() => onSelectPreset(ax.preset)}
            />
            {/* Linha do eixo */}
            <line
              x1={cx}
              y1={cy}
              x2={ax.px}
              y2={ax.py}
              stroke={ax.color}
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* Polo positivo interativo */}
            <g
              className="cursor-pointer"
              onClick={() => onSelectPreset(ax.preset)}
            >
              <circle
                cx={ax.px}
                cy={ax.py}
                r={8.5}
                fill={ax.color}
                opacity={ax.depth >= -0.1 ? 0.95 : 0.55}
              />
              <text
                x={ax.px}
                y={ax.py + 3.2}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={700}
                fill="#06090f"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {ax.label}
              </text>
              <title>
                {ax.id === 'x'
                  ? 'Vista Lateral (Tecla 3)'
                  : ax.id === 'y'
                    ? 'Vista Superior / Topo (Tecla 7)'
                    : 'Vista Frontal (Tecla 1)'}
              </title>
            </g>
          </g>
        ))}
      </svg>

      {/* Atalhos rápidos ortográficos */}
      <div className="grid grid-cols-3 gap-1 w-full">
        <button
          type="button"
          onClick={() => onSelectPreset('front')}
          title="Vista Frontal (1)"
          className="h-5 px-1 rounded bg-[#090c13] hover:bg-sky-500/20 text-[9px] font-semibold text-sky-300 border border-white/10 cursor-pointer"
        >
          Frente
        </button>
        <button
          type="button"
          onClick={() => onSelectPreset('top')}
          title="Vista Topo (7)"
          className="h-5 px-1 rounded bg-[#090c13] hover:bg-emerald-500/20 text-[9px] font-semibold text-emerald-300 border border-white/10 cursor-pointer"
        >
          Topo
        </button>
        <button
          type="button"
          onClick={() => onSelectPreset('side')}
          title="Vista Lateral (3)"
          className="h-5 px-1 rounded bg-[#090c13] hover:bg-rose-500/20 text-[9px] font-semibold text-rose-300 border border-white/10 cursor-pointer"
        >
          Lat.
        </button>
      </div>
    </div>
  );
}

