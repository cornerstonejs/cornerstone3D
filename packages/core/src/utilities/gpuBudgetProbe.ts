/**
 * Classify-only GPU class probe and class → interactive budget-frac table.
 *
 * The WebGL timing probe measures a fill-rate-ish proxy (ms per megapixel) and
 * maps it to {@link GpuClass}. Pixel-budget seeding uses only the fixed frac
 * table — never a continuous msPerMpx → budgetPx formula.
 *
 * CPU rendering (`useCPURendering`) is orthogonal: when there is no WebGL,
 * {@link classifyGpuClass} returns null and the CPU pipeline flag applies.
 */

/** Named GPU classes when WebGL is available (Aim 2.3 / T4 taxonomy). */
export type GpuClass = 'minimal' | 'low' | 'medium' | 'high';

export const GPU_CLASSES: readonly GpuClass[] = [
  'minimal',
  'low',
  'medium',
  'high',
] as const;

/** Seed interactive budget as a fraction of native viewport pixels. */
export const GPU_CLASS_BUDGET_FRAC: Record<GpuClass, number> = {
  minimal: 0.15,
  low: 0.25,
  medium: 0.4,
  high: 0.75,
};

/**
 * ms/Mpx thresholds (inclusive upper bounds) for high → low.
 * Slower than the low bound → minimal.
 */
export const GPU_PERF_MS_PER_MPX_HIGH_MAX = 2;
export const GPU_PERF_MS_PER_MPX_MEDIUM_MAX = 8;
export const GPU_PERF_MS_PER_MPX_LOW_MAX = 25;

/**
 * Floor used when the GPU finishes within one performance.now() tick.
 * Reported as this value (not 0) so logs/cache stay interpretable and
 * classification treats the result as {@link GpuClass} high.
 */
export const GPU_PERF_MS_PER_MPX_TOO_FAST = 0.001;

// Large enough that discrete / fast iGPUs still accumulate measurable time;
// a 128–512 clear loop often finishes in 0ms on laptop GPUs.
const PROBE_SIZES = [512, 1024, 2048];
const PROBE_ITERATIONS = 12;

export function getRecommendedInteractiveBudgetFrac(
  gpuClass: GpuClass | null
): number {
  if (gpuClass == null) {
    return 0;
  }
  return GPU_CLASS_BUDGET_FRAC[gpuClass];
}

/**
 * Map capability signals + optional probe metric to a GPU class.
 * Returns null when there is no WebGL (CPU path owns that case).
 */
export function classifyGpuClass({
  webgl,
  softwareRasterizer,
  msPerMpx,
}: {
  webgl: boolean;
  softwareRasterizer: boolean;
  msPerMpx: number | null;
}): GpuClass | null {
  if (!webgl) {
    return null;
  }
  if (softwareRasterizer) {
    return 'minimal';
  }
  // null / NaN / negative → probe failed. 0 (or too-fast floor) means the
  // GPU finished within timer resolution — treat as high, not medium.
  if (msPerMpx == null || !Number.isFinite(msPerMpx) || msPerMpx < 0) {
    return 'medium';
  }
  if (msPerMpx <= GPU_PERF_MS_PER_MPX_HIGH_MAX) {
    return 'high';
  }
  if (msPerMpx <= GPU_PERF_MS_PER_MPX_MEDIUM_MAX) {
    return 'medium';
  }
  if (msPerMpx <= GPU_PERF_MS_PER_MPX_LOW_MAX) {
    return 'low';
  }
  return 'minimal';
}

/**
 * Time a simple fullscreen clear+draw loop at several sizes.
 * Returns average milliseconds per megapixel, or null if probing is impossible.
 */
export function probeGpuMsPerMpx(): number | null {
  if (typeof document === 'undefined') {
    return null;
  }

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    const canvas = document.createElement('canvas');
    gl =
      canvas.getContext('webgl2') ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      return null;
    }

    const program = createFillProgram(gl);
    if (!program) {
      return null;
    }

    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Fullscreen triangle in clip space.
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    let totalMs = 0;
    let totalMpx = 0;

    for (const size of PROBE_SIZES) {
      canvas.width = size;
      canvas.height = size;
      gl.viewport(0, 0, size, size);

      // Warm-up (excluded from timing).
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      syncGpu(gl);

      const start = performance.now();
      for (let i = 0; i < PROBE_ITERATIONS; i++) {
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      syncGpu(gl);
      totalMs += performance.now() - start;
      totalMpx += (size * size * PROBE_ITERATIONS) / 1e6;
    }

    if (!(totalMpx > 0) || !(totalMs >= 0) || !Number.isFinite(totalMs)) {
      return null;
    }

    // Timer resolution can round a fast discrete GPU to 0ms; do not persist
    // a literal 0 (ambiguous with "failed") — clamp to the too-fast floor.
    if (totalMs === 0) {
      return GPU_PERF_MS_PER_MPX_TOO_FAST;
    }

    return totalMs / totalMpx;
  } catch {
    return null;
  } finally {
    if (gl) {
      const loseContext = gl.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();
    }
  }
}

/**
 * Block until submitted GPU work completes. finish() alone is enough on most
 * drivers; a 1×1 readPixels forces a pipeline flush where finish is lazy.
 */
function syncGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
  gl.finish();
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
}

function createFillProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): WebGLProgram | null {
  const isWebGL2 =
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext;

  const vsSource = isWebGL2
    ? `#version 300 es
      in vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`
    : `attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

  const fsSource = isWebGL2
    ? `#version 300 es
      precision mediump float;
      out vec4 outColor;
      void main() {
        outColor = vec4(0.2, 0.4, 0.6, 1.0);
      }`
    : `precision mediump float;
      void main() {
        gl_FragColor = vec4(0.2, 0.4, 0.6, 1.0);
      }`;

  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  return program;
}

function compileShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
