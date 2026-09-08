import type { TextureFormatSupport } from './textureSupport';
import { getSupportedTextureFormats } from './textureSupport';

/**
 * Bump when the probes (or the meaning of any profile field) change so that
 * profiles cached by earlier versions are discarded.
 */
export const RENDERING_CAPABILITIES_PROBE_VERSION = 1;

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

const SOFTWARE_RASTERIZER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

/**
 * The GPU capability profile detected through offscreen WebGL probes.
 *
 * This is the single source the rendering configuration consults instead of
 * scattered per-feature checks: backend selection reads `webgl`/`webgl2`,
 * texture-format decisions read the {@link TextureFormatSupport} flags, and
 * `renderer`/`softwareRasterizer` let applications surface or log degraded
 * environments (e.g. SwiftShader after a driver denylist hit).
 */
export interface RenderingCapabilities extends TextureFormatSupport {
  /** Any WebGL context (1 or 2) could be created. */
  webgl: boolean;
  /** A WebGL2 context could be created. */
  webgl2: boolean;
  /** MAX_TEXTURE_SIZE of the probed context, 0 when no context exists. */
  maxTextureSize: number;
  /** Unmasked renderer string when exposed by the browser, '' otherwise. */
  renderer: string;
  /** True when the renderer string identifies a software rasterizer. */
  softwareRasterizer: boolean;
}

interface WebGLContextInfo {
  webgl: boolean;
  webgl2: boolean;
  maxTextureSize: number;
  renderer: string;
}

interface CachedCapabilities {
  probeVersion: number;
  renderer: string;
  webgl2: boolean;
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
 * Returns the floating-point texture precision that can be linearly sampled.
 *
 * WebGL exposes 32-bit and 16-bit float filtering independently. In
 * particular, Safari on iOS can linearly filter R16F textures while R32F
 * textures remain non-filterable. Volume preparation must therefore accept
 * either precision instead of disabling modality pre-scaling whenever R32F
 * filtering is unavailable.
 */
export function getFilterableFloatTexturePrecision(
  capabilities: RenderingCapabilities = getRenderingCapabilities()
): 32 | 16 | null {
  if (capabilities.floatLinear) {
    return 32;
  }

  if (capabilities.halfFloatLinear) {
    return 16;
  }

  return null;
}

function getWebGLContextInfo(): WebGLContextInfo {
  const info: WebGLContextInfo = {
    webgl: false,
    webgl2: false,
    maxTextureSize: 0,
    renderer: '',
  };

  if (typeof document === 'undefined') {
    return info;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl =
      gl2 ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      return info;
    }

    info.webgl = true;
    info.webgl2 = !!gl2;
    info.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;

    // Modern browsers expose the unmasked renderer through RENDERER directly;
    // older ones require the WEBGL_debug_renderer_info extension.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    info.renderer = typeof renderer === 'string' ? renderer : '';

    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }
  } catch {
    // A throwing context factory is equivalent to "no GPU".
  }

  return info;
}

function readCachedFormats(
  renderer: string,
  webgl2: boolean
): TextureFormatSupport | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedCapabilities;

    // The texture probes require WebGL2, so a profile cached on a WebGL1-only
    // run is all-false; invalidate it when WebGL2 availability changes for
    // the same renderer (browser update/flag) instead of pinning it forever.
    if (
      parsed?.probeVersion !== RENDERING_CAPABILITIES_PROBE_VERSION ||
      parsed?.renderer !== renderer ||
      parsed?.webgl2 !== webgl2 ||
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
  webgl2: boolean,
  formats: TextureFormatSupport
): void {
  try {
    const payload: CachedCapabilities = {
      probeVersion: RENDERING_CAPABILITIES_PROBE_VERSION,
      renderer,
      webgl2,
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
 * WebGL level and MAX_TEXTURE_SIZE, then the texture-format probes.
 *
 * Probe results are cached in localStorage keyed by renderer string, WebGL2
 * availability, and probe version, so repeat page loads on the same GPU skip
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

  let formats = useCache
    ? readCachedFormats(contextInfo.renderer, contextInfo.webgl2)
    : null;

  if (!formats) {
    const probed = getSupportedTextureFormats();

    // A null probe result means the probes could not run (context limit hit,
    // GPU process restarting, context lost mid-probe) — report no format
    // support for this load but do NOT persist it, so a transient bad run
    // costs one re-probe next load instead of poisoning the cache under an
    // otherwise valid renderer key.
    if (probed) {
      writeCachedFormats(contextInfo.renderer, contextInfo.webgl2, probed);
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
