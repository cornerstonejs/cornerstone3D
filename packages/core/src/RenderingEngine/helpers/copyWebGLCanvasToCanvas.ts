import { getRenderingCapabilities } from '../../utilities/renderingCapabilities';

type WebGLContext = WebGLRenderingContext | WebGL2RenderingContext;

type CopyScratch = {
  canvas?: HTMLCanvasElement;
  context?: CanvasRenderingContext2D;
  imageData?: ImageData;
  pixels?: Uint8Array;
};

const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;

const scratch: CopyScratch = {};

/**
 * Returns the WebGL context that a canvas already has. Asking a canvas for
 * the context type it holds returns that context and creates nothing.
 */
function getWebGLContextOfCanvas(
  canvas: HTMLCanvasElement
): WebGLContext | null {
  try {
    return (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLContext | null;
  } catch {
    return null;
  }
}

/**
 * Returns the 2D canvas, its context and its pixel arrays for a copy of the
 * given size. They are kept between copies and replaced when the size changes.
 */
function getScratch(width: number, height: number): Required<CopyScratch> {
  if (!scratch.canvas || !scratch.context) {
    scratch.canvas = document.createElement('canvas');
    scratch.context = scratch.canvas.getContext('2d');
  }

  if (scratch.canvas.width !== width || scratch.canvas.height !== height) {
    scratch.canvas.width = width;
    scratch.canvas.height = height;
    scratch.imageData = undefined;
  }

  if (!scratch.imageData) {
    scratch.imageData = scratch.context.createImageData(width, height);
    scratch.pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  }

  return scratch as Required<CopyScratch>;
}

/**
 * Writes one row of pixels that WebGL returned into a row of image data.
 * WebGL keeps colours multiplied by their alpha and image data does not, so
 * a pixel that is neither opaque nor fully clear is divided by its alpha.
 */
function writeRow(
  source: Uint8Array,
  sourceStart: number,
  target: Uint8ClampedArray,
  targetStart: number,
  rowBytes: number,
  premultiplied: boolean
): void {
  target.set(source.subarray(sourceStart, sourceStart + rowBytes), targetStart);

  if (!premultiplied) {
    return;
  }

  for (let offset = 3; offset < rowBytes; offset += BYTES_PER_PIXEL) {
    const alpha = source[sourceStart + offset];

    if (alpha === OPAQUE || alpha === 0) {
      continue;
    }

    const scale = OPAQUE / alpha;
    const pixel = targetStart + offset - 3;

    target[pixel] = source[sourceStart + offset - 3] * scale;
    target[pixel + 1] = source[sourceStart + offset - 2] * scale;
    target[pixel + 2] = source[sourceStart + offset - 1] * scale;
  }
}

/**
 * Copies a rectangle of a WebGL canvas into a 2D canvas by reading the pixels
 * back from the WebGL context: the rows are turned upside down (WebGL counts
 * rows from the bottom), put on a spare 2D canvas and drawn from there, so
 * the result is blended and scaled like a `drawImage` of the WebGL canvas.
 * Returns false when the pixels could not be read, and draws nothing then.
 */
function copyThroughReadPixels(
  target: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sWidth: number,
  sHeight: number,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number
): boolean {
  const gl = getWebGLContextOfCanvas(source);
  const width = Math.floor(sWidth);
  const height = Math.floor(sHeight);

  if (!gl || gl.isContextLost() || width <= 0 || height <= 0) {
    return false;
  }

  const { canvas, context, imageData, pixels } = getScratch(width, height);
  const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

  if (framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  gl.readPixels(
    Math.floor(sx),
    gl.drawingBufferHeight - Math.floor(sy) - height,
    width,
    height,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels
  );

  if (framebuffer) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  }

  const rowBytes = width * BYTES_PER_PIXEL;
  const premultiplied = gl.getContextAttributes()?.premultipliedAlpha !== false;

  for (let row = 0; row < height; row++) {
    writeRow(
      pixels,
      row * rowBytes,
      imageData.data,
      (height - 1 - row) * rowBytes,
      rowBytes,
      premultiplied
    );
  }

  context.putImageData(imageData, 0, 0);
  target.drawImage(canvas, 0, 0, width, height, dx, dy, dWidth, dHeight);

  return true;
}

/**
 * Copies a rectangle of the WebGL canvas that a rendering engine draws into
 * to the 2D canvas of a viewport. The arguments are those of `drawImage`.
 *
 * A browser normally does this with `drawImage`. Some graphics stacks draw
 * correctly with WebGL but hand an empty picture to `drawImage` (seen in
 * Chrome on the Android emulator with the host GPU mode), which leaves every
 * viewport black. The capability profile measures that once
 * (`webglCanvasCopy`), and on such a device the pixels are read back from the
 * WebGL context instead. That gives the same picture and costs a few
 * milliseconds per frame for a large viewport.
 */
export default function copyWebGLCanvasToCanvas(
  target: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sWidth: number,
  sHeight: number,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number
): void {
  const capabilities = getRenderingCapabilities();
  const needsReadPixels = capabilities.webgl && !capabilities.webglCanvasCopy;

  if (
    needsReadPixels &&
    copyThroughReadPixels(
      target,
      source,
      sx,
      sy,
      sWidth,
      sHeight,
      dx,
      dy,
      dWidth,
      dHeight
    )
  ) {
    return;
  }

  target.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
}
