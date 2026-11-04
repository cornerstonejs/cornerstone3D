/**
 * Per-format results of the offscreen WebGL texture probes. Each flag is true
 * only when a real draw + readback through that texture format produced the
 * expected pixels, so a browser that merely advertises an extension but
 * renders garbage through it (e.g. broken EXT_texture_norm16 on some GPUs)
 * still reports false.
 */
export interface TextureFormatSupport {
  norm16: boolean;
  norm16Linear: boolean;
  float: boolean;
  floatLinear: boolean;
  halfFloat: boolean;
  halfFloatLinear: boolean;
}

/** A texel data type that the probe can test. */
export type ProbeTextureFormat = 'uint8' | 'norm16' | 'halfFloat' | 'float';

/** The result of one run of the combined probe. */
export interface RenderingLimitsProbeResult {
  formats: TextureFormatSupport;
  /** MAX_3D_TEXTURE_SIZE of the probe context. */
  max3DTextureSize: number;
  /** The largest edge that passed, or `undefined` when no edge passed. */
  reliableEdge?: number;
  /** The smallest edge that failed, or `undefined` when no edge failed. */
  failedEdge?: number;
}

interface FormatSpec {
  ext?: string;
  internalFormat: (gl: WebGL2RenderingContext, ext?) => number;
  glDataType: (gl: WebGL2RenderingContext, ext?) => number;
  encode: (values: number[]) => ArrayBufferView;
}

/** The edge at which a format is tested, so a format failure is not an edge failure. */
const FORMAT_PROBE_EDGE = 8;
/** The smallest edge that the search of the edge tests. */
const MIN_PROBE_EDGE = 16;
/** The thin axes of the probe texture. */
const THIN_EDGE = 4;
/** Each output pixel samples one texel; 8-bit readback allows this error. */
const TOLERANCE = 3;

// Four distinct values, none near 0: an incomplete or empty texture samples as
// 0, and a uniform gray samples one value at every texel.
const FIRST_VALUE = 0.5;
const FILL_VALUE = 0.75;
const NEXT_TO_LAST_VALUE = 0.25;
const LAST_VALUE = 1;

const HALF_FLOATS = new Map([
  [0.25, 0x3400],
  [0.5, 0x3800],
  [0.75, 0x3a00],
  [1, 0x3c00],
]);

const FORMATS: Record<ProbeTextureFormat, FormatSpec> = {
  uint8: {
    internalFormat: (gl) => gl.R8,
    glDataType: (gl) => gl.UNSIGNED_BYTE,
    encode: (values) => Uint8Array.from(values, (v) => Math.round(v * 255)),
  },
  norm16: {
    ext: 'EXT_texture_norm16',
    internalFormat: (_gl, ext) => ext.R16_SNORM_EXT,
    glDataType: (gl) => gl.SHORT,
    encode: (values) => Int16Array.from(values, (v) => Math.round(v * 32767)),
  },
  halfFloat: {
    internalFormat: (gl) => gl.R16F,
    glDataType: (gl) => gl.HALF_FLOAT,
    encode: (values) => Uint16Array.from(values, (v) => HALF_FLOATS.get(v)),
  },
  float: {
    internalFormat: (gl) => gl.R32F,
    glDataType: (gl) => gl.FLOAT,
    encode: (values) => Float32Array.from(values),
  },
};

const VERTEX_SHADER = `#version 300 es
void main() {
  // One triangle that covers the canvas.
  vec2 position = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D u_image;
uniform vec3 u_coords[4];

out vec4 color;

void main() {
  int index = int(gl_FragCoord.x);
  vec3 coord = u_coords[0];
  if (index == 1) { coord = u_coords[1]; }
  else if (index == 2) { coord = u_coords[2]; }
  else if (index == 3) { coord = u_coords[3]; }
  float value = texture(u_image, coord).r;
  color = vec4(value, value, value, 1.0);
}`;

/**
 * One offscreen WebGL2 context with the probe program.
 *
 * The probe draws one row of four pixels. Pixel `i` samples one texel of an
 * N x 4 x 4 3D texture, through the same `sampler3D` path that a volume uses.
 * The four texels are the first texel, a middle texel, the texel next to the
 * last one and the last one of the long axis, and each holds a different
 * value. A uniform gray, an empty texture or a lost far end therefore fails.
 */
export class TextureProbe {
  private readonly gl: WebGL2RenderingContext;
  private readonly coordsLocation: WebGLUniformLocation;
  public readonly max3DTextureSize: number;

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.gl = gl;
    this.coordsLocation = gl.getUniformLocation(program, 'u_coords');
    this.max3DTextureSize =
      Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) || 0;
  }

  /**
   * Creates the context and compiles the program. Context creation and shader
   * compilation dominate the cost, so a caller creates one probe for all of
   * its tests.
   *
   * @returns the probe, or `null` when no WebGL2 context or program exists
   */
  public static create(): TextureProbe | null {
    try {
      if (typeof document === 'undefined') {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 1;

      const gl = canvas.getContext('webgl2');

      if (!gl) {
        return null;
      }

      const program = gl.createProgram();

      for (const [type, source] of [
        [gl.VERTEX_SHADER, VERTEX_SHADER],
        [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
      ] as const) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          return null;
        }

        gl.attachShader(program, shader);
      }

      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return null;
      }

      gl.useProgram(program);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      return new TextureProbe(gl, program);
    } catch {
      return null;
    }
  }

  public isContextLost(): boolean {
    return this.gl.isContextLost();
  }

  /** Releases the context. */
  public dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /**
   * Tests one texel data type at a small edge.
   *
   * @param format - the data type
   * @param linear - true to sample with the LINEAR filter
   */
  public probeFormat(format: ProbeTextureFormat, linear = false): boolean {
    return this.probeAxis(format, FORMAT_PROBE_EDGE, 0, linear);
  }

  /**
   * Tests one edge on each of the three axes.
   *
   * A driver can store the depth axis of a 3D texture as an array of 2D
   * layers and the other two axes as one 2D image, so one axis can fail while
   * another passes. The long axis of a volume is often the depth axis, so each
   * axis is tested; the cost is three thin textures for each edge.
   */
  public probeEdge(
    edge: number,
    format: ProbeTextureFormat = 'float'
  ): boolean {
    if (edge > this.max3DTextureSize || edge < FORMAT_PROBE_EDGE) {
      return false;
    }

    return [0, 1, 2].every((axis) => this.probeAxis(format, edge, axis, false));
  }

  private probeAxis(
    format: ProbeTextureFormat,
    edge: number,
    axis: number,
    linear: boolean
  ): boolean {
    const { gl } = this;
    const spec = FORMATS[format];
    let tex: WebGLTexture | null = null;

    try {
      let ext;

      if (spec.ext) {
        ext = gl.getExtension(spec.ext);

        if (!ext) {
          return false;
        }
      }

      if (
        linear &&
        format === 'float' &&
        !gl.getExtension('OES_texture_float_linear')
      ) {
        return false;
      }

      const dims = [THIN_EDGE, THIN_EDGE, THIN_EDGE];
      dims[axis] = edge;

      // The value depends on the index along the long axis alone. Every edge
      // is at least 8, so the middle texel is distinct from the end texels.
      const middle = Math.floor(edge / 2);
      const valueAt = (i: number) =>
        i === 0
          ? FIRST_VALUE
          : i === edge - 1
            ? LAST_VALUE
            : i === edge - 2
              ? NEXT_TO_LAST_VALUE
              : FILL_VALUE;
      const strides = [1, dims[0], dims[0] * dims[1]];
      const values = new Array<number>(dims[0] * dims[1] * dims[2]);

      for (let index = 0; index < values.length; index++) {
        const along = Math.floor(index / strides[axis]) % dims[axis];
        values[index] = valueAt(along);
      }

      while (gl.getError() !== gl.NO_ERROR) {
        // Clears an error that an earlier test left.
      }

      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        spec.internalFormat(gl, ext),
        dims[0],
        dims[1],
        dims[2],
        0,
        gl.RED,
        spec.glDataType(gl, ext),
        spec.encode(values)
      );

      if (gl.getError() !== gl.NO_ERROR) {
        return false;
      }

      const filter = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

      // Texel centres, so a LINEAR filter returns the texel value. The thin
      // axes sample between two equal texels.
      const sampled = [0, middle, edge - 2, edge - 1];
      const coords = new Float32Array(12);

      sampled.forEach((i, pixel) => {
        coords[pixel * 3] = 0.5;
        coords[pixel * 3 + 1] = 0.5;
        coords[pixel * 3 + 2] = 0.5;
        coords[pixel * 3 + axis] = (i + 0.5) / edge;
      });
      gl.uniform3fv(this.coordsLocation, coords);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Uint8Array(16);
      gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      return sampled.every((i, pixel) => {
        const expected = Math.round(valueAt(i) * 255);
        const [r, g, b] = pixels.subarray(pixel * 4, pixel * 4 + 3);

        return r === g && g === b && Math.abs(r - expected) <= TOLERANCE;
      });
    } catch {
      return false;
    } finally {
      if (tex) {
        gl.deleteTexture(tex);
      }
    }
  }
}

function formatsOf(probe: TextureProbe): TextureFormatSupport {
  return {
    norm16: probe.probeFormat('norm16'),
    norm16Linear: probe.probeFormat('norm16', true),
    float: probe.probeFormat('float'),
    floatLinear: probe.probeFormat('float', true),
    halfFloat: probe.probeFormat('halfFloat'),
    halfFloatLinear: probe.probeFormat('halfFloat', true),
  };
}

/**
 * Runs the combined probe: the texel data types at a small edge, then the
 * texture edge.
 *
 * The edge search starts at `startEdge` (or at MAX_3D_TEXTURE_SIZE when that
 * is smaller) and halves on each failure, down to 16. It returns the largest
 * edge that passed and the smallest edge that failed. A device that renders a
 * uniform gray above 128 therefore costs five edge steps.
 *
 * @returns the result, or `null` when the probe could not run (no context, or
 * the context was lost during the probe), so that a caller does not store it
 */
export function probeRenderingLimits({
  startEdge = 2048,
}: { startEdge?: number } = {}): RenderingLimitsProbeResult | null {
  const probe = TextureProbe.create();

  if (!probe) {
    return null;
  }

  try {
    const formats = formatsOf(probe);
    const result: RenderingLimitsProbeResult = {
      formats,
      max3DTextureSize: probe.max3DTextureSize,
      ...searchEdge(probe, startEdge, formats.float ? 'float' : 'halfFloat'),
    };

    // A context lost during the probe reads zeros, which are not answers.
    return probe.isContextLost() ? null : result;
  } finally {
    probe.dispose();
  }
}

function searchEdge(
  probe: TextureProbe,
  startEdge: number,
  format: ProbeTextureFormat
): Pick<RenderingLimitsProbeResult, 'reliableEdge' | 'failedEdge'> {
  const result: Pick<
    RenderingLimitsProbeResult,
    'reliableEdge' | 'failedEdge'
  > = {};

  for (
    let edge = Math.min(startEdge, probe.max3DTextureSize);
    edge >= MIN_PROBE_EDGE;
    edge = Math.floor(edge / 2)
  ) {
    if (probe.probeEdge(edge, format)) {
      result.reliableEdge = edge;
      break;
    }

    result.failedEdge = edge;
  }

  return result;
}

/**
 * Runs the edge search of {@link probeRenderingLimits} alone, in a new probe
 * context.
 *
 * @returns the result without formats, or `null` when the probe could not run
 */
export function probeEdgeSearch({
  startEdge = 2048,
  format = 'float',
}: {
  startEdge?: number;
  format?: ProbeTextureFormat;
} = {}): Omit<RenderingLimitsProbeResult, 'formats'> | null {
  const probe = TextureProbe.create();

  if (!probe) {
    return null;
  }

  try {
    const result = {
      max3DTextureSize: probe.max3DTextureSize,
      ...searchEdge(probe, startEdge, format),
    };

    return probe.isContextLost() ? null : result;
  } finally {
    probe.dispose();
  }
}

/**
 * Tests one edge for one data type, in a new probe context.
 *
 * @returns true or false, or `undefined` when the probe could not run
 */
export function probeTextureEdge(
  edge: number,
  format: ProbeTextureFormat = 'float'
): boolean | undefined {
  const probe = TextureProbe.create();

  if (!probe) {
    return undefined;
  }

  try {
    const passed = probe.probeEdge(edge, format);

    return probe.isContextLost() ? undefined : passed;
  } finally {
    probe.dispose();
  }
}

/**
 * Probes each texture format through a real draw + readback. Returns `null`
 * when the probes could not run at all (probe context creation failed — e.g.
 * the browser's live-context limit was hit — or the context was lost
 * mid-probe), so callers can tell "probing failed this run" apart from "the
 * GPU genuinely does not support these formats" and avoid persisting the
 * former.
 */
export function getSupportedTextureFormats(): TextureFormatSupport | null {
  const probe = TextureProbe.create();

  if (!probe) {
    return null;
  }

  try {
    const formats = formatsOf(probe);

    return probe.isContextLost() ? null : formats;
  } finally {
    probe.dispose();
  }
}
