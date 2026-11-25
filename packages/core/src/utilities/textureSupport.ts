/**
 * Per-format results of the offscreen WebGL texture probes. Each flag is true
 * only when a real draw + readback through that texture format produced the
 * expected pixels, so a browser that merely advertises an extension but
 * renders garbage through it (e.g. broken EXT_texture_norm16 on some GPUs)
 * still reports false.
 */
export interface TextureFormatSupport {
  /** Signed 16-bit normalized (`R16_SNORM`), which most CT data uses. */
  norm16: boolean;
  norm16Linear: boolean;
  /** Unsigned 16-bit normalized (`R16_EXT`), which most MR data uses. */
  unorm16: boolean;
  unorm16Linear: boolean;
  float: boolean;
  floatLinear: boolean;
  halfFloat: boolean;
  halfFloatLinear: boolean;
}

/** A texel data type that the probe can test. */
export type ProbeTextureFormat =
  | 'uint8'
  | 'norm16'
  | 'unorm16'
  | 'halfFloat'
  | 'float';

/** The result of one run of the combined probe. */
export interface RenderingLimitsProbeResult {
  formats: TextureFormatSupport;
  /** MAX_3D_TEXTURE_SIZE of the probe context. */
  max3DTextureSize: number;
  /** The largest edge that passed, or `undefined` when no edge passed. */
  reliableEdge?: number;
  /** The smallest edge that failed, or `undefined` when no edge failed. */
  failedEdge?: number;
  /** True when the context was lost during the test of `failedEdge`. */
  contextLost?: boolean;
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

/**
 * Four distinct values, none near 0: an incomplete or empty texture samples as
 * 0, and a uniform gray samples one value at every texel.
 */
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
  unorm16: {
    ext: 'EXT_texture_norm16',
    internalFormat: (_gl, ext) => ext.R16_EXT,
    glDataType: (gl) => gl.UNSIGNED_SHORT,
    encode: (values) => Uint16Array.from(values, (v) => Math.round(v * 65535)),
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
  /** One triangle that covers the canvas. */
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

  private readonly program: WebGLProgram;
  /** The draw target in a context that the probe does not own. */
  private readonly target?: {
    framebuffer: WebGLFramebuffer;
    renderbuffer: WebGLRenderbuffer;
    vertexArray: WebGLVertexArrayObject;
  };

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    target?: TextureProbe['target']
  ) {
    this.gl = gl;
    this.program = program;
    this.target = target;
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
      const program = gl && createProbeProgram(gl);

      if (!program) {
        return null;
      }

      gl.useProgram(program);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

      return new TextureProbe(gl, program);
    } catch {
      return null;
    }
  }

  /**
   * Creates a probe in a context that a viewport owns, so the probe adds no
   * context. The probe draws to its own 4 x 1 framebuffer. Call it only inside
   * {@link withProbeState}, which sets and restores the state of the context.
   *
   * @returns the probe, or `null` when the program does not compile
   */
  private static inContext(gl: WebGL2RenderingContext): TextureProbe | null {
    const program = createProbeProgram(gl);

    if (!program) {
      return null;
    }

    const renderbuffer = gl.createRenderbuffer();
    const framebuffer = gl.createFramebuffer();
    const vertexArray = gl.createVertexArray();

    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, 4, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.RENDERBUFFER,
      renderbuffer
    );
    gl.bindVertexArray(vertexArray);
    gl.useProgram(program);
    gl.viewport(0, 0, 4, 1);

    return new TextureProbe(gl, program, {
      framebuffer,
      renderbuffer,
      vertexArray,
    });
  }

  /**
   * Runs `search` with a probe in the context of a viewport, and restores the
   * state of that context after it.
   *
   * @returns the result of `search`, or `null` when the probe cannot run
   */
  public static runInContext<T>(
    gl: WebGL2RenderingContext,
    search: (probe: TextureProbe) => T
  ): T | null {
    return withProbeState(gl, () => {
      const probe = TextureProbe.inContext(gl);

      if (!probe) {
        return null;
      }

      try {
        return search(probe);
      } finally {
        probe.dispose();
      }
    });
  }

  public isContextLost(): boolean {
    return this.gl.isContextLost();
  }

  /**
   * Releases the context of the probe, or, in the context of a viewport, the
   * objects that the probe created there.
   */
  public dispose(): void {
    const { gl, target } = this;

    if (!target) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();

      return;
    }

    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteRenderbuffer(target.renderbuffer);
    gl.deleteVertexArray(target.vertexArray);
    gl.deleteProgram(this.program);
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

      /**
       * The value depends on the index along the long axis alone. Every edge
       * is at least 8, so the middle texel is distinct from the end texels.
       */
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
        /** Clears an error that an earlier test left. */
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

      /**
       * Texel centres, so a LINEAR filter returns the texel value. The thin
       * axes sample between two equal texels. A LINEAR test replaces the
       * middle texel with the point halfway between the first two texels,
       * which hold different values, so a driver that accepts LINEAR but
       * samples the nearest texel fails.
       */
      const sampled = [linear ? 0.5 : middle, 0, edge - 2, edge - 1];
      const expectedAt = (position: number) =>
        Number.isInteger(position)
          ? valueAt(position)
          : (valueAt(Math.floor(position)) + valueAt(Math.ceil(position))) / 2;
      const coords = new Float32Array(12);

      sampled.forEach((position, pixel) => {
        coords[pixel * 3] = 0.5;
        coords[pixel * 3 + 1] = 0.5;
        coords[pixel * 3 + 2] = 0.5;
        coords[pixel * 3 + axis] = (position + 0.5) / edge;
      });
      gl.uniform3fv(this.coordsLocation, coords);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Uint8Array(16);
      gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      return sampled.every((position, pixel) => {
        const expected = Math.round(expectedAt(position) * 255);
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
    unorm16: probe.probeFormat('unorm16'),
    unorm16Linear: probe.probeFormat('unorm16', true),
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
 * See {@link searchEdge} for the edge search.
 *
 * @returns the result, or `null` when the probe could not run (no context, or
 * the context was lost during the test of the data types), so that a caller
 * does not store it
 */
export function probeRenderingLimits(
  edgeSearch: EdgeSearchOptions = {}
): RenderingLimitsProbeResult | null {
  const probe = TextureProbe.create();

  if (!probe) {
    return null;
  }

  try {
    const formats = formatsOf(probe);

    /** A context lost during the probe reads zeros, which are not answers. */
    if (probe.isContextLost()) {
      return null;
    }

    return {
      formats,
      max3DTextureSize: probe.max3DTextureSize,
      ...searchEdge(probe, {
        ...edgeSearch,
        format: edgeSearch.format ?? (formats.float ? 'float' : 'halfFloat'),
      }),
    };
  } finally {
    probe.dispose();
  }
}

/** Where the edge search starts, and the texel type that it tests. */
export type EdgeSearchOptions = {
  /** The first edge to test; MAX_3D_TEXTURE_SIZE when that is smaller. */
  startEdge?: number;
  /** Every tested edge is below this edge, a failed edge of the record. */
  belowEdge?: number;
  format?: ProbeTextureFormat;
};

/**
 * Tests from `startEdge` down, halving on each failure, down to 16. Returns
 * the largest edge that passed and the smallest edge that failed. A context
 * lost during a test counts as a failure of that edge, and ends the search
 * (`contextLost`), so the next start begins below it.
 */
function searchEdge(
  probe: TextureProbe,
  { startEdge = 2048, belowEdge, format = 'float' }: EdgeSearchOptions
): Pick<
  RenderingLimitsProbeResult,
  'reliableEdge' | 'failedEdge' | 'contextLost'
> {
  const result: Pick<
    RenderingLimitsProbeResult,
    'reliableEdge' | 'failedEdge' | 'contextLost'
  > = {};
  let edge = Math.min(startEdge, probe.max3DTextureSize);

  while (belowEdge && edge >= belowEdge) {
    edge = Math.floor(edge / 2);
  }

  for (; edge >= MIN_PROBE_EDGE; edge = Math.floor(edge / 2)) {
    const passed = probe.probeEdge(edge, format);

    if (probe.isContextLost()) {
      result.failedEdge = edge;
      result.contextLost = true;
      break;
    }

    if (passed) {
      result.reliableEdge = edge;
      break;
    }

    result.failedEdge = edge;
  }

  return result;
}

/**
 * Runs the edge search of {@link probeRenderingLimits} alone, in the context
 * of a viewport, so the search adds no WebGL context. The state of that
 * context is the same after the search.
 *
 * @returns the result without formats, or `null` when the probe could not run
 */
export function probeEdgeSearch(
  gl: WebGL2RenderingContext,
  options: EdgeSearchOptions = {}
): Omit<RenderingLimitsProbeResult, 'formats'> | null {
  return TextureProbe.runInContext(gl, (probe) => ({
    max3DTextureSize: probe.max3DTextureSize,
    ...searchEdge(probe, options),
  }));
}

/** Compiles the probe program, or returns `null`. */
function createProbeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();
  const shaders: WebGLShader[] = [];

  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
    ] as const) {
      const shader = gl.createShader(type);

      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteProgram(program);

        return null;
      }

      gl.attachShader(program, shader);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);

      return null;
    }

    return program;
  } finally {
    /** A linked program keeps its shaders. */
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}

/** The capabilities that the probe turns off, and that vtk.js can turn on. */
const PROBE_DISABLED_CAPABILITIES = [
  'BLEND',
  'CULL_FACE',
  'DEPTH_TEST',
  'POLYGON_OFFSET_FILL',
  'RASTERIZER_DISCARD',
  'SAMPLE_ALPHA_TO_COVERAGE',
  'SAMPLE_COVERAGE',
  'SCISSOR_TEST',
  'STENCIL_TEST',
] as const;

/** The pixel store values that the probe sets, with the value it needs. */
const PROBE_PIXEL_STORE = {
  PACK_ALIGNMENT: 4,
  UNPACK_ALIGNMENT: 1,
  UNPACK_ROW_LENGTH: 0,
  UNPACK_IMAGE_HEIGHT: 0,
  UNPACK_SKIP_PIXELS: 0,
  UNPACK_SKIP_ROWS: 0,
  UNPACK_SKIP_IMAGES: 0,
  UNPACK_FLIP_Y_WEBGL: false,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: false,
} as const;

/**
 * Runs `run` in the context of a viewport, with the state that the probe
 * needs, and restores every state that the probe changes: the program, the
 * framebuffers, the renderbuffer, the vertex array, the viewport, the active
 * texture unit, the 3D texture and the sampler of unit 0, the buffers of the pixel
 * transfers, the pixel store, the clear color, the color mask, and the
 * capabilities. vtk.js binds what it uses before each draw, so it reads none
 * of the probe state.
 */
function withProbeState<T>(gl: WebGL2RenderingContext, run: () => T): T {
  const unit = gl.getParameter(gl.ACTIVE_TEXTURE);

  /** The sampler of the probe program reads unit 0. */
  gl.activeTexture(gl.TEXTURE0);

  const saved = {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING),
    vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    viewport: gl.getParameter(gl.VIEWPORT),
    texture3D: gl.getParameter(gl.TEXTURE_BINDING_3D),
    sampler: gl.getParameter(gl.SAMPLER_BINDING),
    packBuffer: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
    unpackBuffer: gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING),
    clearColor: gl.getParameter(gl.COLOR_CLEAR_VALUE),
    colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
    capabilities: PROBE_DISABLED_CAPABILITIES.map((name) =>
      gl.isEnabled(gl[name])
    ),
    pixelStore: Object.keys(PROBE_PIXEL_STORE).map((name) =>
      gl.getParameter(gl[name])
    ),
  };

  try {
    PROBE_DISABLED_CAPABILITIES.forEach((name) => gl.disable(gl[name]));
    Object.entries(PROBE_PIXEL_STORE).forEach(([name, value]) =>
      gl.pixelStorei(gl[name], Number(value))
    );
    gl.bindSampler(0, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.colorMask(true, true, true, true);

    return run();
  } finally {
    if (!gl.isContextLost()) {
      gl.useProgram(saved.program);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.drawFramebuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.readFramebuffer);
      gl.bindRenderbuffer(gl.RENDERBUFFER, saved.renderbuffer);
      gl.bindVertexArray(saved.vertexArray);
      gl.viewport(
        saved.viewport[0],
        saved.viewport[1],
        saved.viewport[2],
        saved.viewport[3]
      );
      gl.bindTexture(gl.TEXTURE_3D, saved.texture3D);
      gl.bindSampler(0, saved.sampler);
      gl.activeTexture(unit);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, saved.packBuffer);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, saved.unpackBuffer);
      gl.clearColor(
        saved.clearColor[0],
        saved.clearColor[1],
        saved.clearColor[2],
        saved.clearColor[3]
      );
      gl.colorMask(
        saved.colorMask[0],
        saved.colorMask[1],
        saved.colorMask[2],
        saved.colorMask[3]
      );
      PROBE_DISABLED_CAPABILITIES.forEach((name, index) =>
        saved.capabilities[index] ? gl.enable(gl[name]) : gl.disable(gl[name])
      );
      Object.keys(PROBE_PIXEL_STORE).forEach((name, index) =>
        gl.pixelStorei(gl[name], Number(saved.pixelStore[index]))
      );
    }
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
