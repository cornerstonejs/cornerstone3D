const canvasSize = 4;
const texWidth = 5;
const texHeight = 1;
const pixelToCheck = [1, 1];

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

interface FormatProbe {
  ext?: string;
  filterType: 'NEAREST' | 'LINEAR';
  texData: ArrayBufferView;
  internalFormat: (gl: WebGL2RenderingContext, ext?) => number;
  glDataType: (gl: WebGL2RenderingContext, ext?) => number;
}

const NO_SUPPORT: TextureFormatSupport = {
  norm16: false,
  norm16Linear: false,
  float: false,
  floatLinear: false,
  halfFloat: false,
  halfFloatLinear: false,
};

/**
 * Creates the single offscreen context and point-sprite program shared by all
 * format probes. Context creation and shader compilation dominate the probe
 * cost, so they are paid once rather than once per format.
 */
function createProbeContext(): WebGL2RenderingContext | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      return null;
    }

    const vs = `#version 300 es
    void main() {
      gl_PointSize = ${canvasSize.toFixed(1)};
      gl_Position = vec4(0, 0, 0, 1);
    }
  `;
    const fs = `#version 300 es
    precision highp float;
    precision highp int;
    precision highp sampler2D;

    uniform sampler2D u_image;

    out vec4 color;

    void main() {
        vec4 intColor = texture(u_image, gl_PointCoord.xy);
        color = vec4(vec3(intColor.rrr), 1);
    }
    `;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vs);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      return null;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fs);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
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

    return gl;
  } catch (e) {
    return null;
  }
}

function probeFormat(
  gl: WebGL2RenderingContext,
  { ext, filterType, texData, internalFormat, glDataType }: FormatProbe
): boolean {
  try {
    let extToUse;
    if (ext) {
      extToUse = gl.getExtension(ext);
      if (!extToUse) {
        return false;
      }
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat(gl, extToUse),
      texWidth,
      texHeight,
      0,
      gl.RED,
      glDataType(gl, extToUse),
      texData
    );

    const filter = filterType === 'LINEAR' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);

    // Clear to black (which fails the readback check) so pixels drawn by a
    // previous probe on the shared framebuffer cannot leak into this result.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, 1);

    const pixel = new Uint8Array(4);
    gl.readPixels(
      pixelToCheck[0],
      pixelToCheck[1],
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel
    );
    const [r, g, b] = pixel;

    gl.deleteTexture(tex);

    return r === g && g === b && r !== 0;
  } catch (e) {
    return false;
  }
}

export function getSupportedTextureFormats(): TextureFormatSupport {
  const gl = createProbeContext();
  if (!gl) {
    return { ...NO_SUPPORT };
  }

  const norm16TexData = new Int16Array([
    32767, 2000, 3000, 4000, 5000, 16784, 7000, 8000, 9000, 32767,
  ]);

  const floatTexData = new Float32Array([0.3, 0.2, 0.3, 0.4, 0.5]);
  const halfFloatTexData = new Uint16Array([13517, 12902, 13517, 13926, 14336]);

  const result: TextureFormatSupport = {
    norm16: probeFormat(gl, {
      ext: 'EXT_texture_norm16',
      filterType: 'NEAREST',
      texData: norm16TexData,
      internalFormat: (_gl, ext) => ext.R16_SNORM_EXT,
      glDataType: (_gl) => _gl.SHORT,
    }),
    norm16Linear: probeFormat(gl, {
      ext: 'EXT_texture_norm16',
      filterType: 'LINEAR',
      texData: norm16TexData,
      internalFormat: (_gl, ext) => ext.R16_SNORM_EXT,
      glDataType: (_gl) => _gl.SHORT,
    }),
    float: probeFormat(gl, {
      filterType: 'NEAREST',
      texData: floatTexData,
      internalFormat: (_gl) => _gl.R32F,
      glDataType: (_gl) => _gl.FLOAT,
    }),
    floatLinear: probeFormat(gl, {
      ext: 'OES_texture_float_linear',
      filterType: 'LINEAR',
      texData: floatTexData,
      internalFormat: (_gl) => _gl.R32F,
      glDataType: (_gl) => _gl.FLOAT,
    }),
    halfFloat: probeFormat(gl, {
      filterType: 'NEAREST',
      texData: halfFloatTexData,
      internalFormat: (_gl) => _gl.R16F,
      glDataType: (_gl) => _gl.HALF_FLOAT,
    }),
    halfFloatLinear: probeFormat(gl, {
      filterType: 'LINEAR',
      texData: halfFloatTexData,
      internalFormat: (_gl) => _gl.R16F,
      glDataType: (_gl) => _gl.HALF_FLOAT,
    }),
  };

  const webglLoseContext = gl.getExtension('WEBGL_lose_context');
  if (webglLoseContext) {
    webglLoseContext.loseContext();
  }

  return result;
}
