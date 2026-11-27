/**
 * A WebGL2 stand-in for jsdom, enough for the vtk.js OpenGL classes to draw:
 * every method of the context exists and records its calls, constants are
 * numbers that stay the same for a name, a shader compiles and a program
 * links, a uniform or an attribute exists when a shader of the program
 * declares its name, and a framebuffer is complete. Nothing is drawn: the
 * calls are what a test reads, for example how many programs a frame
 * compiles and how many textures it makes.
 */

const isConstantName = (name) =>
  typeof name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(name);

/** A number for each constant name, the same in every context. */
const constants = new Map();

function constant(name) {
  if (!constants.has(name)) {
    constants.set(name, 0x10000 + constants.size);
  }

  return constants.get(name);
}

/** An extension object: its constants are numbers, its methods do nothing. */
function createExtension(name) {
  return new Proxy(
    { name },
    {
      get: (target, property) => {
        if (property in target) {
          return target[property];
        }

        if (isConstantName(property)) {
          return constant(property);
        }

        return typeof property === 'string' && property !== 'then'
          ? () => undefined
          : undefined;
      },
    }
  );
}

/** Whether a shader attached to a program declares a name. */
function declares(program, name) {
  const base = String(name).split('[')[0];
  const pattern = new RegExp(`\\b${base}\\b`);

  return program.shaders.some((shader) => pattern.test(shader.source));
}

/**
 * Makes a WebGL2 stand-in for a canvas.
 *
 * @param canvas - The canvas of the context
 * @param calls - Where the calls are recorded: name to a list of argument
 *   lists
 */
export function createWebGL2StandIn(canvas, calls = {}) {
  let gl;
  const record = (name, args) => {
    (calls[name] ||= []).push(args);
  };
  const methods = {
    isContextLost: () => false,
    getExtension: (name) => createExtension(name),
    getSupportedExtensions: () => [
      'EXT_texture_norm16',
      'OES_texture_float_linear',
      'EXT_color_buffer_float',
      'EXT_color_buffer_half_float',
      'WEBGL_lose_context',
    ],
    getParameter: (parameter) =>
      [
        gl.VERSION,
        gl.RENDERER,
        gl.VENDOR,
        gl.SHADING_LANGUAGE_VERSION,
      ].includes(parameter)
        ? 'WebGL 2.0 stand-in'
        : 4096,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getContextAttributes: () => ({}),
    getShaderPrecisionFormat: () => ({
      precision: 23,
      rangeMin: 127,
      rangeMax: 127,
    }),
    isEnabled: () => false,
    checkFramebufferStatus: () => gl.FRAMEBUFFER_COMPLETE,
    getError: () => gl.NO_ERROR,
    createShader: () => ({ source: '' }),
    shaderSource: (shader, source) => {
      shader.source = source;
    },
    createProgram: () => ({ shaders: [] }),
    attachShader: (program, shader) => {
      program.shaders.push(shader);
    },
    getUniformLocation: (program, name) =>
      declares(program, name) ? { name } : null,
    getAttribLocation: (program, name) => (declares(program, name) ? 0 : -1),
    createTexture: () => ({}),
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
  };

  gl = new Proxy(
    {
      canvas,
      drawingBufferWidth: canvas.width,
      drawingBufferHeight: canvas.height,
    },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }

        if (isConstantName(property)) {
          return constant(property);
        }

        if (typeof property !== 'string' || property === 'then') {
          return undefined;
        }

        return (...args) => {
          record(property, args);

          return methods[property]?.(...args);
        };
      },
    }
  );

  return gl;
}

/**
 * A 2D context stand-in for jsdom: every method does nothing, and
 * `getImageData` gives transparent black pixels.
 */
export function create2DStandIn(canvas) {
  return new Proxy(
    { canvas },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }

        if (property === 'getImageData') {
          return (x, y, width, height) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          });
        }

        return typeof property === 'string' && property !== 'then'
          ? () => undefined
          : undefined;
      },
      set(target, property, value) {
        target[property] = value;

        return true;
      },
    }
  );
}
