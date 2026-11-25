/**
 * Raw GPU allocations for a calibration run and for a device test page. They
 * run in a WebGL2 context of their own, on a canvas outside the page, so the
 * viewports never hold a half-built texture.
 *
 * The memory is a set of R8 3D textures of up to 256 MB each. After each
 * growth, one frame samples every texture, so the driver commits the memory,
 * and `finish()` waits for the GPU. A lost context or `OUT_OF_MEMORY` then
 * counts as a failure at that size.
 */

/** The largest texture of the run. */
const PIECE_BYTES = 256 * 1024 * 1024;

/** The time to wait after a frame, for a context loss to arrive. */
const LOSS_WAIT_MS = 100;

const VERTEX_SHADER = `#version 300 es
void main() {
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D pieceTexture;
out vec4 color;
void main() {
  color = texture(pieceTexture, vec3(0.5));
}`;

/** A context that holds the memory of a run. */
export type GpuMemoryStress = {
  /** The bytes that the textures hold. */
  allocatedBytes(): number;
  /**
   * Grows the textures to at least `targetBytes`, draws one frame that
   * samples all of them, and waits for the GPU.
   *
   * @returns true when the GPU held the memory, false on a lost context or
   * `OUT_OF_MEMORY`
   */
  growTo(targetBytes: number): Promise<boolean>;
  /** Deletes the textures and loses the context. */
  release(): void;
};

/** Compiles the program that samples one texture. */
function sampleProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram();

  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX_SHADER],
    [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
  ] as const) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }

  gl.linkProgram(program);

  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/** True when an error that waits is `OUT_OF_MEMORY`. Reads every error. */
function outOfMemory(gl: WebGL2RenderingContext): boolean {
  let found = false;

  for (let index = 0; index < 16; index++) {
    const error = gl.getError();

    if (error === gl.NO_ERROR) {
      break;
    }

    found ||= error === gl.OUT_OF_MEMORY;
  }

  return found;
}

/**
 * Creates the context of a run.
 *
 * @param createCanvas - makes the canvas of the context; tests pass a fake
 * @returns the context, or `undefined` when WebGL2 is not available
 */
export function createGpuMemoryStress(
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): GpuMemoryStress | undefined {
  const canvas = createCanvas();

  canvas.width = 1;
  canvas.height = 1;

  let lost = false;

  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
  });

  const gl = canvas.getContext('webgl2');
  const program = gl && sampleProgram(gl);

  if (!gl || !program) {
    return undefined;
  }

  const max3D = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) || 256;
  const side = Math.min(1024, max3D);
  const frameBytes = side * side;
  const maxDepth = Math.min(max3D, Math.floor(PIECE_BYTES / frameBytes));
  const textures: WebGLTexture[] = [];
  let allocated = 0;

  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, 'pieceTexture'), 0);
  gl.activeTexture(gl.TEXTURE0);

  const failed = () => lost || gl.isContextLost() || outOfMemory(gl);

  return {
    allocatedBytes: () => allocated,

    growTo: async (targetBytes) => {
      while (allocated < targetBytes) {
        const depth = Math.min(
          maxDepth,
          Math.max(1, Math.ceil((targetBytes - allocated) / frameBytes))
        );
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_3D, texture);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, side, side, depth);

        if (failed()) {
          return false;
        }

        textures.push(texture);
        allocated += frameBytes * depth;
      }

      for (const texture of textures) {
        gl.bindTexture(gl.TEXTURE_3D, texture);
        gl.drawArrays(gl.POINTS, 0, 1);
      }

      gl.finish();
      await new Promise((resolve) => setTimeout(resolve, LOSS_WAIT_MS));

      return !failed();
    },

    release: () => {
      if (!gl.isContextLost()) {
        textures.forEach((texture) => gl.deleteTexture(texture));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }

      textures.length = 0;
      allocated = 0;
    },
  };
}
