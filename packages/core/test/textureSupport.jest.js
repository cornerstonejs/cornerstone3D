import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  probeEdgeSearch,
  probeRenderingLimits,
} from '../src/utilities/textureSupport';

/** The WebGL2 enums that the probe reads; the values are those of WebGL. */
const GL = {
  NO_ERROR: 0,
  INVALID_ENUM: 0x0500,
  INVALID_VALUE: 0x0501,
  INVALID_OPERATION: 0x0502,
  CONTEXT_LOST_WEBGL: 0x9242,
  TRIANGLES: 0x0004,
  COLOR_BUFFER_BIT: 0x4000,
  RED: 0x1903,
  RGBA: 0x1908,
  RGBA8: 0x8058,
  UNSIGNED_BYTE: 0x1401,
  SHORT: 0x1402,
  UNSIGNED_SHORT: 0x1403,
  FLOAT: 0x1406,
  HALF_FLOAT: 0x140b,
  R8: 0x8229,
  R16F: 0x822d,
  R32F: 0x822e,
  TEXTURE_3D: 0x806f,
  TEXTURE0: 0x84c0,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  TEXTURE_WRAP_R: 0x8072,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  NEAREST_MIPMAP_LINEAR: 0x2702,
  CLAMP_TO_EDGE: 0x812f,
  FRAMEBUFFER: 0x8d40,
  READ_FRAMEBUFFER: 0x8ca8,
  DRAW_FRAMEBUFFER: 0x8ca9,
  RENDERBUFFER: 0x8d41,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
  PIXEL_PACK_BUFFER: 0x88eb,
  PIXEL_UNPACK_BUFFER: 0x88ec,
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  MAX_3D_TEXTURE_SIZE: 0x8073,
  ACTIVE_TEXTURE: 0x84e0,
  CURRENT_PROGRAM: 0x8b8d,
  DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
  READ_FRAMEBUFFER_BINDING: 0x8caa,
  RENDERBUFFER_BINDING: 0x8ca7,
  VERTEX_ARRAY_BINDING: 0x85b5,
  VIEWPORT: 0x0ba2,
  TEXTURE_BINDING_3D: 0x806a,
  SAMPLER_BINDING: 0x8919,
  PIXEL_PACK_BUFFER_BINDING: 0x88ed,
  PIXEL_UNPACK_BUFFER_BINDING: 0x88ef,
  COLOR_CLEAR_VALUE: 0x0c22,
  COLOR_WRITEMASK: 0x0c23,
};

const CAPABILITIES = {
  BLEND: 0x0be2,
  CULL_FACE: 0x0b44,
  DEPTH_TEST: 0x0b71,
  POLYGON_OFFSET_FILL: 0x8037,
  RASTERIZER_DISCARD: 0x8c89,
  SAMPLE_ALPHA_TO_COVERAGE: 0x809e,
  SAMPLE_COVERAGE: 0x80a0,
  SCISSOR_TEST: 0x0c11,
  STENCIL_TEST: 0x0b90,
};

/** The pixel store parameters, with the default of a new context. */
const PIXEL_STORE = {
  PACK_ALIGNMENT: [0x0d05, 4],
  PACK_ROW_LENGTH: [0x0d02, 0],
  PACK_SKIP_PIXELS: [0x0d04, 0],
  PACK_SKIP_ROWS: [0x0d03, 0],
  UNPACK_ALIGNMENT: [0x0cf5, 4],
  UNPACK_ROW_LENGTH: [0x0cf2, 0],
  UNPACK_IMAGE_HEIGHT: [0x806e, 0],
  UNPACK_SKIP_PIXELS: [0x0cf4, 0],
  UNPACK_SKIP_ROWS: [0x0cf3, 0],
  UNPACK_SKIP_IMAGES: [0x806d, 0],
  UNPACK_FLIP_Y_WEBGL: [0x9240, false],
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: [0x9241, false],
};

const NORM16 = { R16_EXT: 0x822a, R16_SNORM_EXT: 0x8f98 };

/** The internal formats by value, with the type and array that each takes. */
const INTERNAL_FORMATS = {
  [GL.R8]: { name: 'R8', type: GL.UNSIGNED_BYTE, array: Uint8Array },
  [GL.R16F]: { name: 'R16F', type: GL.HALF_FLOAT, array: Uint16Array },
  [GL.R32F]: { name: 'R32F', type: GL.FLOAT, array: Float32Array },
  [NORM16.R16_EXT]: {
    name: 'R16',
    type: GL.UNSIGNED_SHORT,
    array: Uint16Array,
  },
  [NORM16.R16_SNORM_EXT]: {
    name: 'R16_SNORM',
    type: GL.SHORT,
    array: Int16Array,
  },
};

function halfToFloat(bits) {
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  const sign = bits & 0x8000 ? -1 : 1;

  if (exponent === 0) {
    return sign * 2 ** -14 * (mantissa / 1024);
  }

  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

const DECODE = {
  [GL.UNSIGNED_BYTE]: (v) => v / 255,
  [GL.SHORT]: (v) => Math.max(v / 32767, -1),
  [GL.UNSIGNED_SHORT]: (v) => v / 65535,
  [GL.HALF_FLOAT]: halfToFloat,
  [GL.FLOAT]: (v) => v,
};

/**
 * A WebGL2 context that keeps the state the probe touches and that samples
 * uploaded 3D textures the way the probe shader does: pixel `i` of a 4 x 1
 * target reads the texel at `u_coords[i]` of the 3D texture of unit 0. Calls
 * that a real context rejects (an upload or readback with a pixel buffer
 * bound or with pixel store offsets, a mismatched type, a LINEAR float
 * texture without OES_texture_float_linear enabled, an edge above
 * MAX_3D_TEXTURE_SIZE) set an error and change nothing.
 *
 * @param options.drawsCorrectly - `(formatName, dims) => boolean`; a texture
 * for which it returns false samples as a uniform gray, as a driver that
 * cannot hold that size does
 * @param options.nearestOnly - format names whose LINEAR filter samples the
 * nearest texel
 * @param options.loseContextOn - `(event, upload) => boolean`, called with
 * `'upload'` before a texture upload and with `'delete'` after the texture of
 * a test is deleted; true loses the context there
 */
function createFakeGl({
  max3DTextureSize = 2048,
  extensions = [
    'EXT_texture_norm16',
    'OES_texture_float_linear',
    'WEBGL_lose_context',
  ],
  rejectedFormats = [],
  drawsCorrectly = () => true,
  nearestOnly = [],
  loseContextOn = () => false,
  framebufferComplete = true,
} = {}) {
  let lost = false;
  let lostErrorPending = false;
  let error = GL.NO_ERROR;
  let objectCount = 0;
  const enabledExtensions = new Set();
  const uploads = [];
  const pixels = new Uint8Array(16);

  const state = {
    program: null,
    drawFramebuffer: null,
    readFramebuffer: null,
    renderbuffer: null,
    vertexArray: null,
    viewport: [0, 0, 300, 150],
    activeUnit: 0,
    units: Array.from({ length: 8 }, () => ({
      texture3D: null,
      sampler: null,
    })),
    packBuffer: null,
    unpackBuffer: null,
    clearColor: [0, 0, 0, 0],
    colorMask: [true, true, true, true],
    capabilities: Object.fromEntries(
      Object.values(CAPABILITIES).map((cap) => [cap, false])
    ),
    pixelStore: Object.fromEntries(
      Object.values(PIXEL_STORE).map(([param, value]) => [param, value])
    ),
  };

  const newObject = (kind, props = {}) => ({
    name: `${kind} ${++objectCount}`,
    ...props,
  });

  const setError = (code) => {
    if (error === GL.NO_ERROR) {
      error = code;
    }
  };

  const loseContext = () => {
    lost = true;
    lostErrorPending = true;
  };

  /** A context call that does nothing and returns `fallback` once lost. */
  const live =
    (fn, fallback = undefined) =>
    (...args) =>
      lost ? fallback : fn(...args);

  /** Unbinds a deleted object wherever it is bound, as WebGL does. */
  const unbind = (object) => {
    for (const key of [
      'program',
      'drawFramebuffer',
      'readFramebuffer',
      'renderbuffer',
      'vertexArray',
      'packBuffer',
      'unpackBuffer',
    ]) {
      if (state[key] === object && key !== 'program') {
        state[key] = null;
      }
    }
    state.units.forEach((unit) => {
      if (unit.texture3D === object) {
        unit.texture3D = null;
      }
    });
  };

  const isFilterable = (texture) =>
    texture.format.name !== 'R32F' ||
    enabledExtensions.has('OES_texture_float_linear');

  const sample = (coord) => {
    const { texture3D: texture, sampler } = state.units[0];

    /** A mipmap filter on a texture with one level makes it incomplete. */
    if (
      !texture?.values ||
      sampler?.mipmapFilter ||
      texture.minFilter === GL.NEAREST_MIPMAP_LINEAR
    ) {
      return 0;
    }

    let linear = texture.minFilter === GL.LINEAR;

    if (linear && !isFilterable(texture)) {
      return 0;
    }

    if (!drawsCorrectly(texture.format.name, texture.dims)) {
      return 0.5;
    }

    if (nearestOnly.includes(texture.format.name)) {
      linear = false;
    }

    const { dims, values } = texture;
    const clamp = (i, n) => Math.min(Math.max(i, 0), n - 1);
    const taps = dims.map((n, axis) => {
      const c = coord[axis] * n;

      if (!linear) {
        return [[clamp(Math.floor(c), n), 1]];
      }

      const u = c - 0.5;
      const i0 = Math.floor(u);
      const f = u - i0;

      return [
        [clamp(i0, n), 1 - f],
        [clamp(i0 + 1, n), f],
      ];
    });
    let value = 0;

    for (const [x, wx] of taps[0]) {
      for (const [y, wy] of taps[1]) {
        for (const [z, wz] of taps[2]) {
          value +=
            wx * wy * wz * values[x + y * dims[0] + z * dims[0] * dims[1]];
        }
      }
    }

    return value;
  };

  const writePixel = (x, rgba) => {
    rgba.forEach((channel, i) => {
      if (state.colorMask[i]) {
        pixels[x * 4 + i] = Math.round(Math.min(Math.max(channel, 0), 1) * 255);
      }
    });
  };

  const unpackOffsetsSet = () =>
    [
      'UNPACK_ROW_LENGTH',
      'UNPACK_IMAGE_HEIGHT',
      'UNPACK_SKIP_PIXELS',
      'UNPACK_SKIP_ROWS',
      'UNPACK_SKIP_IMAGES',
    ].some((name) => state.pixelStore[PIXEL_STORE[name][0]] !== 0);

  const packOffsetsSet = () =>
    ['PACK_ROW_LENGTH', 'PACK_SKIP_PIXELS', 'PACK_SKIP_ROWS'].some(
      (name) => state.pixelStore[PIXEL_STORE[name][0]] !== 0
    );

  const parameters = {
    [GL.MAX_3D_TEXTURE_SIZE]: () => max3DTextureSize,
    [GL.ACTIVE_TEXTURE]: () => GL.TEXTURE0 + state.activeUnit,
    [GL.CURRENT_PROGRAM]: () => state.program,
    [GL.DRAW_FRAMEBUFFER_BINDING]: () => state.drawFramebuffer,
    [GL.READ_FRAMEBUFFER_BINDING]: () => state.readFramebuffer,
    [GL.RENDERBUFFER_BINDING]: () => state.renderbuffer,
    [GL.VERTEX_ARRAY_BINDING]: () => state.vertexArray,
    [GL.VIEWPORT]: () => Int32Array.from(state.viewport),
    [GL.TEXTURE_BINDING_3D]: () => state.units[state.activeUnit].texture3D,
    [GL.SAMPLER_BINDING]: () => state.units[state.activeUnit].sampler,
    [GL.PIXEL_PACK_BUFFER_BINDING]: () => state.packBuffer,
    [GL.PIXEL_UNPACK_BUFFER_BINDING]: () => state.unpackBuffer,
    [GL.COLOR_CLEAR_VALUE]: () => Float32Array.from(state.clearColor),
    [GL.COLOR_WRITEMASK]: () => [...state.colorMask],
  };

  const gl = {
    ...GL,
    ...CAPABILITIES,
    ...Object.fromEntries(
      Object.entries(PIXEL_STORE).map(([name, [param]]) => [name, param])
    ),
    isContextLost: () => lost,
    getError: () => {
      if (lostErrorPending) {
        lostErrorPending = false;

        return GL.CONTEXT_LOST_WEBGL;
      }

      const code = error;

      error = GL.NO_ERROR;

      return code;
    },
    getExtension: live((name) => {
      if (!extensions.includes(name)) {
        return null;
      }

      enabledExtensions.add(name);

      if (name === 'EXT_texture_norm16') {
        return { ...NORM16 };
      }

      return name === 'WEBGL_lose_context' ? { loseContext } : {};
    }, null),
    getParameter: live((param) => {
      if (param in parameters) {
        return parameters[param]();
      }

      if (param in state.pixelStore) {
        return state.pixelStore[param];
      }

      throw new Error(`The fake context has no parameter ${param}`);
    }, null),
    isEnabled: live((cap) => {
      if (!(cap in state.capabilities)) {
        throw new Error(`The fake context has no capability ${cap}`);
      }

      return state.capabilities[cap];
    }, false),
    enable: live((cap) => {
      state.capabilities[cap] = true;
    }),
    disable: live((cap) => {
      state.capabilities[cap] = false;
    }),
    pixelStorei: live((param, value) => {
      if (!(param in state.pixelStore)) {
        throw new Error(`The fake context has no pixel store ${param}`);
      }

      state.pixelStore[param] =
        typeof state.pixelStore[param] === 'boolean' ? Boolean(value) : value;
    }),
    activeTexture: live((unit) => {
      state.activeUnit = unit - GL.TEXTURE0;
    }),
    viewport: live((x, y, width, height) => {
      state.viewport = [x, y, width, height];
    }),
    clearColor: live((r, g, b, a) => {
      state.clearColor = [r, g, b, a];
    }),
    colorMask: live((r, g, b, a) => {
      state.colorMask = [r, g, b, a];
    }),
    bindSampler: live((unit, sampler) => {
      state.units[unit].sampler = sampler;
    }),
    bindBuffer: live((target, buffer) => {
      if (target === GL.PIXEL_PACK_BUFFER) {
        state.packBuffer = buffer;
      } else if (target === GL.PIXEL_UNPACK_BUFFER) {
        state.unpackBuffer = buffer;
      }
    }),
    createProgram: live(() => newObject('program', { shaders: [] }), null),
    createShader: live((type) => newObject('shader', { type }), null),
    shaderSource: live(() => undefined),
    compileShader: live(() => undefined),
    getShaderParameter: live(() => true, false),
    attachShader: live((program, shader) => program.shaders.push(shader)),
    linkProgram: live((program) => {
      program.linked = program.shaders.length === 2;
    }),
    getProgramParameter: live((program) => program.linked, false),
    deleteShader: live(() => undefined),
    deleteProgram: live((program) => unbind(program)),
    useProgram: live((program) => {
      state.program = program;
    }),
    getUniformLocation: live(
      (program, name) => ({ program, uniform: name }),
      null
    ),
    uniform3fv: live((location, values) => {
      if (location.program !== state.program) {
        setError(GL.INVALID_OPERATION);

        return;
      }

      state.program.coords = Array.from(values);
    }),
    createRenderbuffer: live(() => newObject('renderbuffer'), null),
    deleteRenderbuffer: live((renderbuffer) => unbind(renderbuffer)),
    bindRenderbuffer: live((_target, renderbuffer) => {
      state.renderbuffer = renderbuffer;
    }),
    renderbufferStorage: live(() => {
      state.renderbuffer.storage = true;
    }),
    createFramebuffer: live(() => newObject('framebuffer'), null),
    deleteFramebuffer: live((framebuffer) => unbind(framebuffer)),
    bindFramebuffer: live((target, framebuffer) => {
      if (target !== GL.READ_FRAMEBUFFER) {
        state.drawFramebuffer = framebuffer;
      }

      if (target !== GL.DRAW_FRAMEBUFFER) {
        state.readFramebuffer = framebuffer;
      }
    }),
    framebufferRenderbuffer: live((_target, _attachment, _rb, renderbuffer) => {
      state.drawFramebuffer.color = renderbuffer;
    }),
    checkFramebufferStatus: live(
      () =>
        framebufferComplete && state.drawFramebuffer?.color?.storage
          ? GL.FRAMEBUFFER_COMPLETE
          : GL.FRAMEBUFFER_INCOMPLETE_ATTACHMENT,
      0
    ),
    createVertexArray: live(() => newObject('vertex array'), null),
    deleteVertexArray: live((vertexArray) => unbind(vertexArray)),
    bindVertexArray: live((vertexArray) => {
      state.vertexArray = vertexArray;
    }),
    createTexture: live(
      () => newObject('texture', { minFilter: GL.NEAREST_MIPMAP_LINEAR }),
      null
    ),
    deleteTexture: (texture) => {
      if (lost) {
        return;
      }

      unbind(texture);

      if (texture.upload && loseContextOn('delete', texture.upload)) {
        loseContext();
      }
    },
    bindTexture: live((_target, texture) => {
      state.units[state.activeUnit].texture3D = texture;
    }),
    texParameteri: live((_target, pname, value) => {
      const texture = state.units[state.activeUnit].texture3D;

      if (pname === GL.TEXTURE_MIN_FILTER) {
        texture.minFilter = value;
      }
    }),
    texImage3D: live(
      (
        _target,
        _level,
        internalFormat,
        width,
        height,
        depth,
        _border,
        format,
        type,
        data
      ) => {
        const texture = state.units[state.activeUnit].texture3D;
        const spec = INTERNAL_FORMATS[internalFormat];
        const dims = [width, height, depth];
        const upload = { format: spec?.name, dims };

        uploads.push(upload);

        if (loseContextOn('upload', upload)) {
          loseContext();

          return;
        }

        if (!spec || rejectedFormats.includes(spec.name) || format !== GL.RED) {
          setError(GL.INVALID_ENUM);

          return;
        }

        if (dims.some((n) => n > max3DTextureSize)) {
          setError(GL.INVALID_VALUE);

          return;
        }

        if (
          !texture ||
          state.unpackBuffer ||
          unpackOffsetsSet() ||
          type !== spec.type ||
          !(data instanceof spec.array) ||
          data.length !== width * height * depth
        ) {
          setError(GL.INVALID_OPERATION);

          return;
        }

        Object.assign(texture, {
          upload,
          dims,
          format: spec,
          values: Array.from(data, DECODE[type]),
        });
      }
    ),
    clear: live(() => {
      for (let x = 0; x < 4; x++) {
        writePixel(x, state.clearColor);
      }
    }),
    drawArrays: live(() => {
      const { program, viewport } = state;

      if (!program?.linked) {
        setError(GL.INVALID_OPERATION);

        return;
      }

      /** Another program draws something else, so nothing of the probe. */
      if (
        !program.coords ||
        state.capabilities[CAPABILITIES.RASTERIZER_DISCARD]
      ) {
        return;
      }

      const [vx, vy, vw, vh] = viewport;

      for (let x = 0; x < 4; x++) {
        if (x >= vx && x < vx + vw && vy <= 0 && vy + vh > 0) {
          const value = sample(program.coords.slice(x * 3, x * 3 + 3));

          writePixel(x, [value, value, value, 1]);
        }
      }
    }),
    readPixels: live((_x, _y, _width, _height, _format, _type, out) => {
      if (state.packBuffer || packOffsetsSet()) {
        setError(GL.INVALID_OPERATION);

        return;
      }

      out.set(pixels);
    }),
  };

  return {
    gl,
    state,
    uploads,
    /** The long edge of each upload of the edge search (formats use 8). */
    searchedEdges: () =>
      uploads.map(({ dims }) => Math.max(...dims)).filter((edge) => edge > 8),
    loseContext,
  };
}

/** Makes every new canvas return `gl` for `webgl2`. */
function useContextForNewCanvases(gl) {
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((type) => (type === 'webgl2' ? gl : null));
}

/**
 * Sets a viewport state in which a probe that kept any part of it would not
 * draw or read back its texels, and that differs from every value that the
 * probe sets.
 */
function setViewportState({ state }) {
  const named = (name, props = {}) => ({ name, ...props });

  Object.assign(state, {
    program: named('viewport program', { linked: true }),
    drawFramebuffer: named('viewport draw framebuffer'),
    readFramebuffer: named('viewport read framebuffer'),
    renderbuffer: named('viewport renderbuffer'),
    vertexArray: named('viewport vertex array'),
    viewport: [200, 100, 64, 64],
    activeUnit: 3,
    packBuffer: named('viewport pack buffer'),
    unpackBuffer: named('viewport unpack buffer'),
    clearColor: [0.125, 0.25, 0.375, 0.5],
    colorMask: [false, true, true, true],
  });
  state.units[0].texture3D = named('viewport texture of unit 0');
  state.units[0].sampler = named('viewport sampler', { mipmapFilter: true });
  state.units[3].texture3D = named('viewport texture of unit 3');
  Object.keys(state.capabilities).forEach((cap) => {
    state.capabilities[cap] = true;
  });
  Object.assign(state.pixelStore, {
    [PIXEL_STORE.PACK_ALIGNMENT[0]]: 8,
    [PIXEL_STORE.PACK_ROW_LENGTH[0]]: 16,
    [PIXEL_STORE.PACK_SKIP_PIXELS[0]]: 1,
    [PIXEL_STORE.PACK_SKIP_ROWS[0]]: 1,
    [PIXEL_STORE.UNPACK_ALIGNMENT[0]]: 8,
    [PIXEL_STORE.UNPACK_ROW_LENGTH[0]]: 16,
    [PIXEL_STORE.UNPACK_IMAGE_HEIGHT[0]]: 16,
    [PIXEL_STORE.UNPACK_SKIP_PIXELS[0]]: 1,
    [PIXEL_STORE.UNPACK_SKIP_ROWS[0]]: 1,
    [PIXEL_STORE.UNPACK_SKIP_IMAGES[0]]: 1,
    [PIXEL_STORE.UNPACK_FLIP_Y_WEBGL[0]]: true,
    [PIXEL_STORE.UNPACK_PREMULTIPLY_ALPHA_WEBGL[0]]: true,
  });
}

/** The state of the context, with each bound object by name. */
function snapshot({ state }) {
  return JSON.parse(
    JSON.stringify(state, (key, value) =>
      value && typeof value === 'object' && 'name' in value ? value.name : value
    )
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the texel format test of the startup probe', () => {
  it('reports a format only when a draw through it at edge 8 reads back the expected texels', () => {
    const fake = createFakeGl({
      drawsCorrectly: (format) => format !== 'R16_SNORM',
      nearestOnly: ['R16F'],
    });

    useContextForNewCanvases(fake.gl);

    const result = probeRenderingLimits();

    expect(result.formats).toEqual({
      norm16: false,
      norm16Linear: false,
      unorm16: true,
      unorm16Linear: true,
      float: true,
      floatLinear: true,
      halfFloat: true,
      halfFloatLinear: false,
    });
    expect(
      fake.uploads
        .filter(({ dims }) => Math.max(...dims) <= 8)
        .map(({ dims }) => dims)
    ).toEqual(Array(8).fill([8, 4, 4]));
  });

  it('searches the edge with half float textures when float textures do not upload', () => {
    const fake = createFakeGl({ rejectedFormats: ['R32F'] });

    useContextForNewCanvases(fake.gl);

    const result = probeRenderingLimits();

    /** The format test makes eight uploads; the search makes the rest. */
    const searchFormats = fake.uploads.slice(8).map(({ format }) => format);

    expect(result.formats.float).toBe(false);
    expect(searchFormats.length).toBeGreaterThan(0);
    expect([...new Set(searchFormats)]).toEqual(['R16F']);
  });

  it('tests no edge when no float type uploads, so a format failure is not stored as an edge failure', () => {
    const fake = createFakeGl({ rejectedFormats: ['R32F', 'R16F'] });

    useContextForNewCanvases(fake.gl);

    const result = probeRenderingLimits();

    expect(result.formats).toMatchObject({ float: false, halfFloat: false });
    expect(fake.searchedEdges()).toEqual([]);
    expect(result).not.toHaveProperty('failedEdge');
    expect(result).not.toHaveProperty('reliableEdge');
  });

  it('returns no result when the context is lost during the format test', () => {
    const fake = createFakeGl({ loseContextOn: (event) => event === 'upload' });

    useContextForNewCanvases(fake.gl);

    expect(probeRenderingLimits()).toBeNull();
  });
});

describe('the edge search', () => {
  it('starts at 2048, tests each edge as an N x 4 x 4 texture on all three axes, and halves after a failure until an edge draws correctly', () => {
    const fake = createFakeGl({
      max3DTextureSize: 4096,
      drawsCorrectly: (_format, dims) => dims[2] <= 512,
    });

    const result = probeEdgeSearch(fake.gl);

    expect(result).toEqual({
      max3DTextureSize: 4096,
      reliableEdge: 512,
      failedEdge: 1024,
    });
    expect(fake.uploads.map(({ dims }) => dims)).toEqual([
      [2048, 4, 4],
      [4, 2048, 4],
      [4, 4, 2048],
      [1024, 4, 4],
      [4, 1024, 4],
      [4, 4, 1024],
      [512, 4, 4],
      [4, 512, 4],
      [4, 4, 512],
    ]);
  });

  it('tests no edge above the configured start edge', () => {
    const fake = createFakeGl({
      max3DTextureSize: 2048,
      drawsCorrectly: (_format, dims) => Math.max(...dims) <= 600,
    });

    const result = probeEdgeSearch(fake.gl, { startEdge: 1000 });

    expect([...new Set(fake.searchedEdges())]).toEqual([1000, 500]);
    expect(result.reliableEdge).toBe(500);
  });

  it('starts at MAX_3D_TEXTURE_SIZE when that is below the start edge', () => {
    const fake = createFakeGl({ max3DTextureSize: 512 });

    const result = probeEdgeSearch(fake.gl, { startEdge: 2048 });

    expect(result).toEqual({ max3DTextureSize: 512, reliableEdge: 512 });
  });

  it('starts below a failed edge of the record', () => {
    const fake = createFakeGl();

    const result = probeEdgeSearch(fake.gl, {
      startEdge: 2048,
      belowEdge: 1024,
    });

    expect(fake.searchedEdges()[0]).toBe(512);
    expect(result).toEqual({ max3DTextureSize: 2048, reliableEdge: 512 });
  });

  it('tests down to an edge of 16 and no further, and reports no reliable edge when every edge fails', () => {
    const fake = createFakeGl({ drawsCorrectly: () => false });

    const result = probeEdgeSearch(fake.gl);

    expect(fake.uploads.map(({ dims }) => dims[0])).toEqual([
      2048, 1024, 512, 256, 128, 64, 32, 16,
    ]);
    expect(result).toEqual({ max3DTextureSize: 2048, failedEdge: 16 });
  });

  it('tests 16 last when the halving of the start edge falls below 16', () => {
    const fake = createFakeGl({
      drawsCorrectly: (_format, dims) => Math.max(...dims) <= 16,
    });

    const result = probeEdgeSearch(fake.gl, { startEdge: 1000 });

    expect([...new Set(fake.searchedEdges())]).toEqual([
      1000, 500, 250, 125, 62, 31, 16,
    ]);
    expect(result.reliableEdge).toBe(16);
  });

  it('ends the search and reports the edge as failed when the context is lost during its test, even after a correct readback', () => {
    const fake = createFakeGl({
      loseContextOn: (event, { dims }) =>
        event === 'delete' && dims[2] === 2048,
    });

    const result = probeEdgeSearch(fake.gl);

    expect(result).toEqual({
      max3DTextureSize: 2048,
      failedEdge: 2048,
      contextLost: true,
    });
    expect(fake.uploads).toHaveLength(3);
  });
});

describe('the edge search in the context of a viewport', () => {
  it('does not run when the 4 x 1 framebuffer is incomplete', () => {
    const fake = createFakeGl({ framebufferComplete: false });

    expect(probeEdgeSearch(fake.gl)).toBeNull();
    expect(fake.uploads).toHaveLength(0);
  });

  it('draws and reads back correctly whatever state the viewport left in the context', () => {
    const fake = createFakeGl();

    setViewportState(fake);

    expect(probeEdgeSearch(fake.gl)).toEqual({
      max3DTextureSize: 2048,
      reliableEdge: 2048,
    });
  });

  it('leaves the state of the context as the viewport left it', () => {
    const fake = createFakeGl({
      drawsCorrectly: (_format, dims) => Math.max(...dims) <= 1024,
    });

    setViewportState(fake);

    const before = snapshot(fake);

    probeEdgeSearch(fake.gl);

    expect(snapshot(fake)).toEqual(before);
  });
});
