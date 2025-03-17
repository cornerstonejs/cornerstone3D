const canvasSize = 4;
const texWidth = 5;
const texHeight = 1;
const pixelToCheck = [1, 1];

function main({ ext, filterType, texData, internalFormat, glDataType }) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      return false;
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

    let extToUse;
    if (ext) {
      extToUse = gl.getExtension(ext);
      if (!extToUse) {
        return false;
      }
    }

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vs);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      return false;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fs);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      return false;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return false;
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
    gl.useProgram(program);
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

    const webglLoseContext = gl.getExtension('WEBGL_lose_context');
    if (webglLoseContext) {
      webglLoseContext.loseContext();
    }

    return r === g && g === b && r !== 0;
  } catch (e) {
    return false;
  }
}

export function getSupportedTextureFormats() {
  const norm16TexData = new Int16Array([
    32767, 2000, 3000, 4000, 5000, 16784, 7000, 8000, 9000, 32767,
  ]);

  // const floatTexData = new Float32Array([0.3, 0.2, 0.3, 0.4, 0.5]);
  // const halfFloatTexData = new Uint16Array([13517, 12902, 13517, 13926, 14336]);

  return {
    norm16: main({
      ext: 'EXT_texture_norm16',
      filterType: 'NEAREST',
      texData: norm16TexData,
      internalFormat: (gl, ext) => ext.R16_SNORM_EXT,
      glDataType: (gl) => gl.SHORT,
    }),
    norm16Linear: main({
      ext: 'EXT_texture_norm16',
      filterType: 'LINEAR',
      texData: norm16TexData,
      internalFormat: (gl, ext) => ext.R16_SNORM_EXT,
      glDataType: (gl) => gl.SHORT,
    }),
    // float: main({
    //   filterType: 'NEAREST',
    //   texData: floatTexData,
    //   internalFormat: (gl) => gl.R16F,
    //   glDataType: (gl) => gl.FLOAT,
    // }),
    // floatLinear: main({
    //   ext: 'OES_texture_float_linear',
    //   filterType: 'LINEAR',
    //   texData: floatTexData,
    //   internalFormat: (gl) => gl.R16F,
    //   glDataType: (gl) => gl.FLOAT,
    // }),
    // halfFloat: main({
    //   filterType: 'NEAREST',
    //   texData: halfFloatTexData,
    //   internalFormat: (gl) => gl.R16F,
    //   glDataType: (gl) => gl.HALF_FLOAT,
    // }),
    // halfFloatLinear: main({
    //   filterType: 'LINEAR',
    //   texData: halfFloatTexData,
    //   internalFormat: (gl) => gl.R16F,
    //   glDataType: (gl) => gl.HALF_FLOAT,
    // }),
  };
}
