import type { TextureFormatSupport } from './textureSupport';
import { getSupportedTextureFormats } from './textureSupport';

/**
 * Bump when the probes (or the meaning of any profile field) change so that
 * profiles cached by earlier versions are discarded.
 * Version 2: the probes compare the values read back with the values
 * uploaded, and norm16 needs both R16_SNORM and R16.
 */
export const RENDERING_CAPABILITIES_PROBE_VERSION = 2;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

const SOFTWARE_RASTERIZER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/**
 * The GPU capability profile detected through offscreen WebGL probes.
 *
 * This is the single source the rendering configuration consults instead of
 * scattered per-feature checks: backend selection reads `webgl`,
 * texture-format decisions read the {@link TextureFormatSupport} flags, and
 * `renderer`/`softwareRasterizer` let applications surface or log degraded
 * environments (e.g. SwiftShader after a driver denylist hit).
 *
 * Only WebGL2 is probed: vtk.js cannot render with WebGL1, so a WebGL1-only
 * browser reports `webgl: false` and uses CPU rendering.
 */
export interface RenderingCapabilities extends TextureFormatSupport {
  /** A WebGL2 context could be created. */
  webgl: boolean;
  /** MAX_TEXTURE_SIZE of the probed context, 0 when no context exists. */
  maxTextureSize: number;
  /**
   * MAX_3D_TEXTURE_SIZE of the probed context: the largest edge of a 3D
   * texture. 0 when no context exists.
   * @experimental
   */
  max3DTextureSize: number;
  /** Unmasked renderer string when exposed by the browser, '' otherwise. */
  renderer: string;
  /** True when the renderer string identifies a software rasterizer. */
  softwareRasterizer: boolean;
  /**
   * True when `drawImage` copies what WebGL drew on a canvas into a 2D
   * canvas. The rendering engines put each viewport on screen with that
   * copy. When it is false they read the pixels back from the WebGL context
   * instead, which gives the same picture and is slower. False without WebGL.
   */
  webglCanvasCopy: boolean;
}

interface WebGLContextInfo {
  webgl: boolean;
  maxTextureSize: number;
  max3DTextureSize: number;
  renderer: string;
  webglCanvasCopy: boolean;
}

const CANVAS_COPY_PROBE_SIZE = 2;
const CANVAS_COPY_PROBE_COLOR = [64, 128, 192];
const CANVAS_COPY_PROBE_TOLERANCE = 2;

interface CachedCapabilities {
  probeVersion: number;
  renderer: string;
  formats: TextureFormatSupport;
}

const NO_GPU_FORMATS: TextureFormatSupport = {
  norm16: false,
  norm16Linear: false,
  float: false,
  floatLinear: false,
  halfFloat: false,
  halfFloatLinear: false,
};

let cachedCapabilities: RenderingCapabilities | null = null;

/**
 * Measures whether `drawImage` copies what WebGL drew on a canvas into a 2D
 * canvas: the WebGL canvas is cleared to a known colour and the copy must
 * hold that colour. Some graphics stacks draw correctly and hand an empty
 * picture to `drawImage`. A browser in which the check itself cannot run
 * counts as able to copy, because that is the path every browser takes today.
 */
function canCopyWebGLCanvas(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext
): boolean {
  try {
    const [red, green, blue] = CANVAS_COPY_PROBE_COLOR;
    const target = document.createElement('canvas');

    canvas.width = CANVAS_COPY_PROBE_SIZE;
    canvas.height = CANVAS_COPY_PROBE_SIZE;
    target.width = CANVAS_COPY_PROBE_SIZE;
    target.height = CANVAS_COPY_PROBE_SIZE;

    const context = target.getContext('2d');

    if (!context) {
      return true;
    }

    gl.clearColor(red / 255, green / 255, blue / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    context.drawImage(canvas, 0, 0);

    const pixel = context.getImageData(0, 0, 1, 1).data;

    return (
      pixel[3] === 255 &&
      CANVAS_COPY_PROBE_COLOR.every(
        (value, channel) =>
          Math.abs(pixel[channel] - value) <= CANVAS_COPY_PROBE_TOLERANCE
      )
    );
  } catch {
    return true;
  }
}

function getWebGLContextInfo(): WebGLContextInfo {
  const info: WebGLContextInfo = {
    webgl: false,
    maxTextureSize: 0,
    max3DTextureSize: 0,
    renderer: '',
    webglCanvasCopy: false,
  };

  if (typeof document === 'undefined') {
    return info;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
      return info;
    }

    info.webgl = true;
    info.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    info.max3DTextureSize =
      Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) || 0;

    // Modern browsers expose the unmasked renderer through RENDERER directly;
    // older ones require the WEBGL_debug_renderer_info extension.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    info.renderer = typeof renderer === 'string' ? renderer : '';
    info.webglCanvasCopy = canCopyWebGLCanvas(canvas, gl);

    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }
  } catch {
    // A throwing context factory is equivalent to "no GPU".
  }

  return info;
}

function readCachedFormats(renderer: string): TextureFormatSupport | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedCapabilities;

    if (
      parsed?.probeVersion !== RENDERING_CAPABILITIES_PROBE_VERSION ||
      parsed?.renderer !== renderer ||
      typeof parsed?.formats !== 'object' ||
      parsed?.formats === null
    ) {
      return null;
    }

    return { ...NO_GPU_FORMATS, ...parsed.formats };
  } catch {
    return null;
  }
}

function writeCachedFormats(
  renderer: string,
  formats: TextureFormatSupport
): void {
  try {
    const payload: CachedCapabilities = {
      probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
      renderer,
      formats,
    };

    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (privacy mode, quota); probing every load is
    // the acceptable fallback.
  }
}

/**
 * Runs the capability detection: one cheap context to gather renderer string,
 * WebGL2 availability, MAX_TEXTURE_SIZE and whether a WebGL canvas can be
 * copied with `drawImage`, then the texture-format probes.
 *
 * Probe results are cached in localStorage keyed by renderer string and
 * probe version, so repeat page loads on the same GPU skip
 * the probe contexts entirely. Pass `useCache: false` to force a fresh probe
 * run (also refreshes the stored cache).
 */
export function detectRenderingCapabilities({
  useCache = true,
}: { useCache?: boolean } = {}): RenderingCapabilities {
  const contextInfo = getWebGLContextInfo();

  if (!contextInfo.webgl) {
    return {
      ...contextInfo,
      ...NO_GPU_FORMATS,
      softwareRasterizer: false,
    };
  }

  let formats = useCache ? readCachedFormats(contextInfo.renderer) : null;

  if (!formats) {
    const probed = getSupportedTextureFormats();

    // A null probe result means the probes could not run (context limit hit,
    // GPU process restarting, context lost mid-probe) — report no format
    // support for this load but do NOT persist it, so a transient bad run
    // costs one re-probe next load instead of poisoning the cache under an
    // otherwise valid renderer key.
    if (probed) {
      writeCachedFormats(contextInfo.renderer, probed);
    }

    formats = probed ?? { ...NO_GPU_FORMATS };
  }

  return {
    ...contextInfo,
    ...formats,
    softwareRasterizer: SOFTWARE_RASTERIZER_PATTERN.test(contextInfo.renderer),
  };
}

/**
 * Returns the memoized capability profile, detecting it on first access.
 * This is the accessor the rest of the library (backend resolution, texture
 * format selection) reads.
 */
export function getRenderingCapabilities(): RenderingCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectRenderingCapabilities();
  }

  return cachedCapabilities;
}

/**
 * Drops the in-memory profile (and optionally the persisted cache) so the
 * next {@link getRenderingCapabilities} call re-detects. Intended for tests
 * and for applications that want to re-probe after a GPU change.
 */
export function resetRenderingCapabilities({
  clearStorage = false,
}: { clearStorage?: boolean } = {}): void {
  cachedCapabilities = null;

  if (clearStorage) {
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures on reset.
    }
  }
}
