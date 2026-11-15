import HalfFloat from '@kitware/vtk.js/Common/Core/HalfFloat';

/**
 * Per-format results of the offscreen WebGL texture probes. Each flag is true
 * only when a real draw + readback through that texture format produced the
 * expected pixels, so a browser that merely advertises an extension but
 * renders garbage through it (e.g. broken EXT_texture_norm16 on some GPUs)
 * still reports false.
 *
 * `norm16` and `norm16Linear` need both 16-bit normalized formats: R16_SNORM
 * (Int16 images) and R16 (Uint16 images).
 */
export interface TextureFormatSupport {
  norm16: boolean;
  norm16Linear: boolean;
  float: boolean;
  floatLinear: boolean;
  halfFloat: boolean;
  halfFloatLinear: boolean;
}

/** The texture formats that the probes test. */
export type ProbedTextureFormat = 'R16_SNORM' | 'R16' | 'R32F' | 'R16F';

/**
 * One value that a probe reads back: the place in the texture, in texels
 * (0.5 is the centre of the first texel), and the value that a correct GPU
 * returns there, in the units of the uploaded data.
 */
export interface TextureProbeSample {
  position: number;
  expected: number;
  /** A second value that is also correct, for -32768 in R16_SNORM. */
  alsoAccepted?: number;
  /** Largest difference from the expected value that still passes. */
  tolerance: number;
}

/** What one probe found. */
export interface TextureProbeResult {
  internalFormat: ProbedTextureFormat;
  filter: 'nearest' | 'linear';
  /** False when the extension that the format needs is missing. */
  available: boolean;
  passed: boolean;
  /** Largest difference between a value read and the value expected, in data units. */
  maxError: number;
  /** Number of values outside their tolerance. */
  failedSamples: number;
  sampleCount: number;
  /** The first value outside its tolerance, for a report. */
  firstFailure?: { position: number; expected: number; actual: number };
  /** The values in the texture, in data units. */
  values: number[];
}

/** The six flags and the result of each probe behind them. */
export interface TextureProbeReport {
  formats: TextureFormatSupport;
  probes: TextureProbeResult[];
}

/**
 * The definition of one probe: the values in a one row texture, the pairs of
 * neighbouring texels whose blend the linear variant checks, and how to
 * upload them.
 */
interface TextureProbeDefinition {
  internalFormat: ProbedTextureFormat;
  extension?: string;
  values: number[];
  blends: Array<[number, number]>;
  sampleScale: number;
  upload: (
    gl: WebGL2RenderingContext,
    extension: Record<string, number> | null,
    values: number[]
  ) => {
    internalFormat: number;
    type: number;
    data: ArrayBufferView;
  };
  toTextureValue: (value: number) => number;
  formatStep: (value: number) => number;
}

/** Most values one probe reads back, the width of the probe canvas. */
export const TEXTURE_PROBE_MAX_SAMPLES = 32;

/**
 * GPUs blend two texels with about 8 bits of weight, so a linear sample may be
 * off by one 256th of the difference between the two texels.
 */
export const LINEAR_WEIGHT_STEPS = 256;

/** The readback offset: values are written as `value * scale + 2^23` in 24 bits. */
const READBACK_OFFSET = 2 ** 23;
const READBACK_MAX = 2 ** 24 - 1;
const R16_EXT = 0x822a;
const R16_SNORM_EXT = 0x8f98;
const BLEND_WEIGHTS = [0.25, 0.5, 0.75];
const NORM16_EXTENSION = 'EXT_texture_norm16';
const FLOAT_LINEAR_EXTENSION = 'OES_texture_float_linear';

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_image;
uniform float u_coordinates[${TEXTURE_PROBE_MAX_SAMPLES}];
uniform float u_scale;
uniform float u_offset;

out vec4 color;

void main() {
  int index = int(gl_FragCoord.x);
  float value = texture(u_image, vec2(u_coordinates[index], 0.5)).r;
  float encoded = clamp(floor(value * u_scale + u_offset + 0.5), 0.0, ${READBACK_MAX.toFixed(1)});
  uint bits = uint(encoded);
  color = vec4(
    float((bits >> 16u) & 255u),
    float((bits >> 8u) & 255u),
    float(bits & 255u),
    255.0
  ) / 255.0;
}
`;

/** The distance between neighbouring values of a 16-bit normalized format, in data units. */
function norm16Step(): number {
  return 1;
}

/** The distance between neighbouring 32-bit float values near a value. */
function float32Step(value: number): number {
  const magnitude = Math.abs(value);

  return magnitude === 0
    ? 2 ** -126
    : 2 ** (Math.floor(Math.log2(magnitude)) - 23);
}

/** The distance between neighbouring 16-bit float values near a value. */
function float16Step(value: number): number {
  const magnitude = Math.abs(value);

  return magnitude < 2 ** -14
    ? 2 ** -24
    : 2 ** (Math.floor(Math.log2(magnitude)) - 10);
}

/**
 * The value that R16_SNORM returns for an Int16 value. The GL specification
 * converts with `max(c / 32767, -1)`, so -32768 reads as -32767.
 */
export function getSignedNorm16Value(value: number): number {
  return Math.max(value, -32767);
}

/**
 * The probes. Each texture holds the extremes of its format and pairs of
 * values one apart, so that a device that keeps fewer than 16 bits, or scales
 * wrongly, gives a wrong value.
 *
 * Half float holds whole numbers exactly only up to 2048. Its probe tests
 * whether the format works, so every value in it is one that half float holds
 * exactly (whole numbers up to 2048, halves below 1024, 61440).
 */
const PROBE_DEFINITIONS: TextureProbeDefinition[] = [
  {
    internalFormat: 'R16_SNORM',
    extension: NORM16_EXTENSION,
    values: [
      -32768, 32767, -1024, 3071, 1000, 1001, -1, 0, 1, 32766, 32767, -32767,
    ],
    blends: [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [7, 8],
      [9, 10],
    ],
    sampleScale: 32767,
    upload: (gl, extension, values) => ({
      internalFormat: extension?.R16_SNORM_EXT ?? R16_SNORM_EXT,
      type: gl.SHORT,
      data: new Int16Array(values),
    }),
    toTextureValue: getSignedNorm16Value,
    formatStep: norm16Step,
  },
  {
    internalFormat: 'R16',
    extension: NORM16_EXTENSION,
    values: [0, 65535, 1000, 1001, 32767, 32768, 65534, 65535, 1, 4095],
    blends: [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
    ],
    sampleScale: 65535,
    upload: (gl, extension, values) => ({
      internalFormat: extension?.R16_EXT ?? R16_EXT,
      type: gl.UNSIGNED_SHORT,
      data: new Uint16Array(values),
    }),
    toTextureValue: (value) => value,
    formatStep: norm16Step,
  },
  {
    internalFormat: 'R32F',
    values: [-32768, 65535, 1000, 1001, -1024.5, 3071.25, 0, 0.125],
    blends: [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ],
    sampleScale: 1,
    upload: (gl, _extension, values) => ({
      internalFormat: gl.R32F,
      type: gl.FLOAT,
      data: new Float32Array(values),
    }),
    toTextureValue: (value) => value,
    formatStep: float32Step,
  },
  {
    internalFormat: 'R16F',
    values: [-2048, 2048, 1000, 1001, -1000.5, 0.125, 0, 61440],
    blends: [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ],
    sampleScale: 1,
    upload: (gl, _extension, values) => ({
      internalFormat: gl.R16F,
      type: gl.HALF_FLOAT,
      data: new Uint16Array(values.map((value) => HalfFloat.toHalf(value))),
    }),
    toTextureValue: (value) => value,
    formatStep: float16Step,
  },
];

/**
 * The tolerance of a value read at the centre of a texel: half the step of
 * the format at that value, or the resolution of the readback when that is
 * coarser. A correct GPU returns the value exactly.
 */
export function getNearestTolerance(
  step: number,
  readbackResolution: number
): number {
  return Math.max(step / 2, 2 * readbackResolution);
}

/**
 * The tolerance of a value blended from two texels `a` and `b`: one weight
 * step of an 8-bit blend (`|b - a| / 256`), plus one step of the format,
 * because a GPU may round the blended value to the precision of the format,
 * plus the resolution of the readback.
 */
export function getLinearTolerance(
  a: number,
  b: number,
  step: number,
  readbackResolution: number
): number {
  return Math.abs(b - a) / LINEAR_WEIGHT_STEPS + step + 2 * readbackResolution;
}

/**
 * The largest power of two that keeps `maxAbsValue * scale` inside the 23
 * bits on each side of the readback offset.
 */
export function getReadbackScale(maxAbsValue: number): number {
  return 2 ** Math.floor(Math.log2((READBACK_OFFSET - 1) / maxAbsValue));
}

/**
 * Builds the values that one probe reads back: the centre of every texel, and
 * for the linear variant three places between each pair of blended texels.
 */
export function buildProbeSamples(args: {
  values: number[];
  blends: Array<[number, number]>;
  linear: boolean;
  toTextureValue: (value: number) => number;
  formatStep: (value: number) => number;
  readbackResolution: number;
}): TextureProbeSample[] {
  const {
    values,
    blends,
    linear,
    toTextureValue,
    formatStep,
    readbackResolution,
  } = args;
  const samples: TextureProbeSample[] = values.map((value, index) => {
    const expected = toTextureValue(value);

    return {
      position: index + 0.5,
      expected,
      alsoAccepted: expected !== value ? value : undefined,
      tolerance: getNearestTolerance(formatStep(expected), readbackResolution),
    };
  });

  if (!linear) {
    return samples;
  }

  blends.forEach(([first, second]) => {
    const a = toTextureValue(values[first]);
    const b = toTextureValue(values[second]);
    const step = formatStep(Math.max(Math.abs(a), Math.abs(b)));

    BLEND_WEIGHTS.forEach((weight) => {
      samples.push({
        position: first + 0.5 + weight * (second - first),
        expected: a + (b - a) * weight,
        tolerance: getLinearTolerance(a, b, step, readbackResolution),
      });
    });
  });

  return samples;
}

/**
 * Turns the RGBA8 pixels written by the probe shader back into values. A
 * pixel the shader did not write (alpha not 255) gives NaN.
 */
export function decodeProbePixels(
  pixels: Uint8Array,
  count: number,
  readbackScale: number
): number[] {
  const values: number[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i * 4;

    if (pixels[offset + 3] !== 255) {
      values.push(NaN);
      continue;
    }

    const encoded =
      pixels[offset] * 65536 + pixels[offset + 1] * 256 + pixels[offset + 2];

    values.push((encoded - READBACK_OFFSET) / readbackScale);
  }

  return values;
}

/**
 * Compares the values read with the expected ones. A value passes when it is
 * within its tolerance of the expected value or of the other accepted value.
 */
export function evaluateProbeSamples(
  samples: TextureProbeSample[],
  actual: number[]
): Pick<
  TextureProbeResult,
  'passed' | 'maxError' | 'failedSamples' | 'sampleCount' | 'firstFailure'
> {
  let maxError = 0;
  let failedSamples = 0;
  let firstFailure: TextureProbeResult['firstFailure'];

  samples.forEach((sample, index) => {
    const value = actual[index];
    const errors = [sample.expected, sample.alsoAccepted]
      .filter((expected) => expected !== undefined)
      .map((expected) => Math.abs(value - expected));
    const error = Number.isFinite(value) ? Math.min(...errors) : Infinity;

    maxError = Math.max(maxError, error);

    if (error <= sample.tolerance) {
      return;
    }

    failedSamples++;
    firstFailure ??= {
      position: sample.position,
      expected: sample.expected,
      actual: value,
    };
  });

  return {
    passed: samples.length > 0 && failedSamples === 0,
    maxError,
    failedSamples,
    sampleCount: samples.length,
    firstFailure,
  };
}

/**
 * Turns the results of the eight probes into the six flags: the norm16 flags
 * need both the signed and the unsigned format.
 */
export function getFormatSupportFromProbes(
  probes: TextureProbeResult[]
): TextureFormatSupport {
  const passed = (format: ProbedTextureFormat, filter: 'nearest' | 'linear') =>
    probes.some(
      (probe) =>
        probe.internalFormat === format &&
        probe.filter === filter &&
        probe.passed
    );

  return {
    norm16: passed('R16_SNORM', 'nearest') && passed('R16', 'nearest'),
    norm16Linear: passed('R16_SNORM', 'linear') && passed('R16', 'linear'),
    float: passed('R32F', 'nearest'),
    floatLinear: passed('R32F', 'linear'),
    halfFloat: passed('R16F', 'nearest'),
    halfFloatLinear: passed('R16F', 'linear'),
  };
}

/** Compiles one shader, or returns null. */
function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * Creates the single offscreen context and the program shared by all probes.
 * The program draws one pixel per value: the pixel samples the texture at a
 * place given by a uniform and writes `value * scale + 2^23` as a 24-bit
 * number in red, green and blue, so the readback through an RGBA8 canvas,
 * which every WebGL2 device has, shows the value with 23 bits.
 */
function createProbeContext(): WebGL2RenderingContext | null {
  try {
    const canvas = document.createElement('canvas');

    canvas.width = TEXTURE_PROBE_MAX_SAMPLES;
    canvas.height = 1;

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      return null;
    }

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER
    );

    if (!vertexShader || !fragmentShader) {
      return null;
    }

    const program = gl.createProgram();

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return null;
    }

    gl.useProgram(program);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    return gl;
  } catch {
    return null;
  }
}

/** Draws one probe and reads its values back. */
function readProbeValues(
  gl: WebGL2RenderingContext,
  definition: TextureProbeDefinition,
  extension: Record<string, number> | null,
  linear: boolean,
  samples: TextureProbeSample[],
  readbackScale: number
): number[] {
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  const { internalFormat, type, data } = definition.upload(
    gl,
    extension,
    definition.values
  );
  const width = definition.values.length;
  const coordinates = new Float32Array(TEXTURE_PROBE_MAX_SAMPLES);
  const filter = linear ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture();

  samples.forEach((sample, index) => {
    coordinates[index] = sample.position / width;
  });

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    1,
    0,
    gl.RED,
    type,
    data
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform1fv(gl.getUniformLocation(program, 'u_coordinates'), coordinates);
  gl.uniform1f(
    gl.getUniformLocation(program, 'u_scale'),
    definition.sampleScale * readbackScale
  );
  gl.uniform1f(gl.getUniformLocation(program, 'u_offset'), READBACK_OFFSET);

  gl.viewport(0, 0, TEXTURE_PROBE_MAX_SAMPLES, 1);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const pixels = new Uint8Array(samples.length * 4);

  gl.readPixels(0, 0, samples.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.deleteTexture(texture);

  return decodeProbePixels(pixels, samples.length, readbackScale);
}

/** Runs one probe of one format and filter. */
function runProbe(
  gl: WebGL2RenderingContext,
  definition: TextureProbeDefinition,
  linear: boolean
): TextureProbeResult {
  const filter = linear ? 'linear' : 'nearest';
  const base = {
    internalFormat: definition.internalFormat,
    filter,
    values: definition.values,
  } as const;
  const extensionName =
    definition.extension ??
    (linear && definition.internalFormat === 'R32F'
      ? FLOAT_LINEAR_EXTENSION
      : undefined);
  const extension = extensionName ? gl.getExtension(extensionName) : null;

  if (extensionName && !extension) {
    return {
      ...base,
      available: false,
      passed: false,
      maxError: Infinity,
      failedSamples: 0,
      sampleCount: 0,
    };
  }

  const maxAbsValue = Math.max(
    ...definition.values.map((value) => Math.abs(value))
  );
  const readbackScale = getReadbackScale(maxAbsValue);
  const samples = buildProbeSamples({
    values: definition.values,
    blends: definition.blends,
    linear,
    toTextureValue: definition.toTextureValue,
    formatStep: definition.formatStep,
    readbackResolution: 1 / readbackScale,
  });

  try {
    const actual = readProbeValues(
      gl,
      definition,
      definition.extension ? extension : null,
      linear,
      samples,
      readbackScale
    );

    return {
      ...base,
      available: true,
      ...evaluateProbeSamples(samples, actual),
    };
  } catch {
    return {
      ...base,
      available: true,
      passed: false,
      maxError: Infinity,
      failedSamples: samples.length,
      sampleCount: samples.length,
    };
  }
}

/**
 * Probes the texture formats of the image and volume paths through a real
 * draw and readback, and compares the values that come back with the values
 * that went in: R16_SNORM and R16 (norm16), R32F (float) and R16F (half
 * float), each with nearest and linear filtering. One context and one program
 * serve all eight probes; the context is released at the end.
 *
 * Returns `null` when the probes could not run (no WebGL2 context, a shader
 * that does not compile, or a context lost during the probes).
 */
export function probeTextureFormats(): TextureProbeReport | null {
  const gl = createProbeContext();

  if (!gl) {
    return null;
  }

  const probes: TextureProbeResult[] = [];

  PROBE_DEFINITIONS.forEach((definition) => {
    probes.push(runProbe(gl, definition, false));
    probes.push(runProbe(gl, definition, true));
  });

  const contextLost = gl.isContextLost();
  const webglLoseContext = gl.getExtension('WEBGL_lose_context');

  webglLoseContext?.loseContext();

  if (contextLost) {
    return null;
  }

  return { formats: getFormatSupportFromProbes(probes), probes };
}

/**
 * Probes each texture format through a real draw + readback (see
 * {@link probeTextureFormats}). Returns `null` when the probes could not run
 * at all, so callers can tell "probing failed this run" apart from "the GPU
 * genuinely does not support these formats" and avoid persisting the former.
 */
export function getSupportedTextureFormats(): TextureFormatSupport | null {
  return probeTextureFormats()?.formats ?? null;
}
