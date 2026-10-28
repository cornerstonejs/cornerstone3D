import type { TextureFormatSupport } from './textureSupport';
import { getSupportedTextureFormats } from './textureSupport';
import {
  classifyGpuClass,
  getRecommendedInteractiveBudgetFrac,
  probeGpuMsPerMpx,
  GPU_CLASSES,
  type GpuClass,
} from './gpuBudgetProbe';

export type { GpuClass } from './gpuBudgetProbe';
export {
  GPU_CLASSES,
  GPU_CLASS_BUDGET_FRAC,
  getRecommendedInteractiveBudgetFrac,
  classifyGpuClass,
} from './gpuBudgetProbe';

const STORAGE_KEY = 'cornerstone3D.renderingCapabilities';

const SOFTWARE_RASTERIZER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;

const GPU_CLASS_SET = new Set<string>(GPU_CLASSES);

/** Hard WebGL size limits gathered from a cheap context probe. */
export interface WebGLSizeLimits {
  /** MAX_TEXTURE_SIZE (2D). */
  maxTextureSize: number;
  /** MAX_3D_TEXTURE_SIZE (WebGL2 only; 0 on WebGL1 / no context). */
  max3DTextureSize: number;
  /** MAX_ARRAY_TEXTURE_LAYERS (WebGL2 only; 0 on WebGL1 / no context). */
  maxArrayTextureLayers: number;
  /** MAX_RENDERBUFFER_SIZE. */
  maxRenderbufferSize: number;
  /** MAX_VIEWPORT_DIMS as [width, height]. */
  maxViewportDims: [number, number];
}

const NO_GPU_SIZE_LIMITS: WebGLSizeLimits = {
  maxTextureSize: 0,
  max3DTextureSize: 0,
  maxArrayTextureLayers: 0,
  maxRenderbufferSize: 0,
  maxViewportDims: [0, 0],
};

/**
 * The GPU capability profile detected through offscreen WebGL probes.
 *
 * This is the single source the rendering configuration consults instead of
 * scattered per-feature checks: backend selection reads `webgl`/`webgl2`,
 * texture-format decisions read the {@link TextureFormatSupport} flags, and
 * `renderer`/`softwareRasterizer` let applications surface or log degraded
 * environments (e.g. SwiftShader after a driver denylist hit).
 *
 * `gpuClass` is a classify-only fill-rate probe (`minimal`|`low`|`medium`|`high`,
 * or null when there is no WebGL — use `useCPURendering` for the CPU path).
 * Interactive pixel-budget seeding uses {@link recommendedInteractiveBudgetFrac}
 * from a fixed class→frac table — not a continuous timing→budget formula.
 */
export interface RenderingCapabilities
  extends TextureFormatSupport,
    WebGLSizeLimits {
  /** Any WebGL context (1 or 2) could be created. */
  webgl: boolean;
  /** A WebGL2 context could be created. */
  webgl2: boolean;
  /** Unmasked renderer string when exposed by the browser, '' otherwise. */
  renderer: string;
  /** True when the renderer string identifies a software rasterizer. */
  softwareRasterizer: boolean;
  /**
   * Named GPU class when WebGL is available; null when there is no WebGL
   * (CPU pipeline via useCPURendering).
   */
  gpuClass: GpuClass | null;
  /**
   * Fixed table lookup from {@link gpuClass} for Target FPS startPx.
   * 0 when gpuClass is null.
   */
  recommendedInteractiveBudgetFrac: number;
  /** Raw probe metric (ms per megapixel); null when skipped or unavailable. */
  gpuPerfMsPerMpx: number | null;
}

interface WebGLContextInfo extends WebGLSizeLimits {
  webgl: boolean;
  webgl2: boolean;
  renderer: string;
}

interface CachedCapabilities extends WebGLSizeLimits {
  renderer: string;
  webgl2: boolean;
  softwareRasterizer: boolean;
  formats: TextureFormatSupport;
  gpuClass: GpuClass;
  gpuPerfMsPerMpx: number | null;
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

function readGlNumber(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  pname: number
): number {
  return Number(gl.getParameter(pname)) || 0;
}

function readGlViewportDims(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): [number, number] {
  const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  if (
    dims &&
    typeof dims === 'object' &&
    typeof (dims as ArrayLike<number>)[0] === 'number' &&
    typeof (dims as ArrayLike<number>)[1] === 'number'
  ) {
    return [
      Number((dims as ArrayLike<number>)[0]) || 0,
      Number((dims as ArrayLike<number>)[1]) || 0,
    ];
  }
  return [0, 0];
}

function getWebGLContextInfo(): WebGLContextInfo {
  const info: WebGLContextInfo = {
    webgl: false,
    webgl2: false,
    ...NO_GPU_SIZE_LIMITS,
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
    info.maxTextureSize = readGlNumber(gl, gl.MAX_TEXTURE_SIZE);
    info.maxRenderbufferSize = readGlNumber(gl, gl.MAX_RENDERBUFFER_SIZE);
    info.maxViewportDims = readGlViewportDims(gl);

    if (gl2) {
      info.max3DTextureSize = readGlNumber(gl2, gl2.MAX_3D_TEXTURE_SIZE);
      info.maxArrayTextureLayers = readGlNumber(
        gl2,
        gl2.MAX_ARRAY_TEXTURE_LAYERS
      );
    }

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

function withPerformanceFields(
  base: Omit<
    RenderingCapabilities,
    'gpuClass' | 'recommendedInteractiveBudgetFrac' | 'gpuPerfMsPerMpx'
  >,
  gpuClass: GpuClass | null,
  gpuPerfMsPerMpx: number | null
): RenderingCapabilities {
  return {
    ...base,
    gpuClass,
    recommendedInteractiveBudgetFrac:
      getRecommendedInteractiveBudgetFrac(gpuClass),
    gpuPerfMsPerMpx,
  };
}

function isCachedSizeLimits(parsed: CachedCapabilities): boolean {
  return (
    typeof parsed?.maxTextureSize === 'number' &&
    typeof parsed?.max3DTextureSize === 'number' &&
    typeof parsed?.maxArrayTextureLayers === 'number' &&
    typeof parsed?.maxRenderbufferSize === 'number' &&
    Array.isArray(parsed?.maxViewportDims) &&
    parsed.maxViewportDims.length === 2 &&
    typeof parsed.maxViewportDims[0] === 'number' &&
    typeof parsed.maxViewportDims[1] === 'number'
  );
}

function readCachedProfile(
  renderer: string,
  webgl2: boolean
): {
  formats: TextureFormatSupport;
  gpuClass: GpuClass;
  gpuPerfMsPerMpx: number | null;
} | null {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedCapabilities;

    // The texture probes require WebGL2, so a profile cached on a WebGL1-only
    // run is all-false; invalidate it when WebGL2 availability changes for
    // the same renderer (browser update/flag) instead of pinning it forever.
    // Size-limit fields are required so incomplete cache entries are ignored.
    // There is no probe-version field — clear localStorage manually to refresh.
    if (
      parsed?.renderer !== renderer ||
      parsed?.webgl2 !== webgl2 ||
      !isCachedSizeLimits(parsed) ||
      typeof parsed?.softwareRasterizer !== 'boolean' ||
      typeof parsed?.formats !== 'object' ||
      parsed?.formats === null ||
      typeof parsed?.gpuClass !== 'string' ||
      !GPU_CLASS_SET.has(parsed.gpuClass)
    ) {
      return null;
    }

    return {
      formats: { ...NO_GPU_FORMATS, ...parsed.formats },
      gpuClass: parsed.gpuClass,
      gpuPerfMsPerMpx:
        typeof parsed.gpuPerfMsPerMpx === 'number'
          ? parsed.gpuPerfMsPerMpx
          : null,
    };
  } catch {
    return null;
  }
}

function writeCachedProfile(
  contextInfo: WebGLContextInfo,
  softwareRasterizer: boolean,
  formats: TextureFormatSupport,
  gpuClass: GpuClass,
  gpuPerfMsPerMpx: number | null
): void {
  try {
    const payload: CachedCapabilities = {
      renderer: contextInfo.renderer,
      webgl2: contextInfo.webgl2,
      maxTextureSize: contextInfo.maxTextureSize,
      max3DTextureSize: contextInfo.max3DTextureSize,
      maxArrayTextureLayers: contextInfo.maxArrayTextureLayers,
      maxRenderbufferSize: contextInfo.maxRenderbufferSize,
      maxViewportDims: contextInfo.maxViewportDims,
      softwareRasterizer,
      formats,
      gpuClass,
      gpuPerfMsPerMpx,
    };

    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (privacy mode, quota); probing every load is
    // the acceptable fallback.
  }
}

/**
 * Runs the capability detection: one cheap context to gather renderer string,
 * WebGL level and size limits (2D/3D texture, array layers, renderbuffer,
 * viewport), then the texture-format and GPU class probes.
 *
 * Probe results are cached in localStorage keyed by renderer string and WebGL2
 * availability, so repeat page loads on the same GPU skip the probe contexts
 * entirely. Pass `useCache: false` to force a fresh probe run (also refreshes
 * the stored cache). Clear the storage key manually after probe-shape changes.
 */
export function detectRenderingCapabilities({
  useCache = true,
}: { useCache?: boolean } = {}): RenderingCapabilities {
  const contextInfo = getWebGLContextInfo();

  if (!contextInfo.webgl) {
    return withPerformanceFields(
      {
        ...contextInfo,
        ...NO_GPU_FORMATS,
        softwareRasterizer: false,
      },
      null,
      null
    );
  }

  const softwareRasterizer = SOFTWARE_RASTERIZER_PATTERN.test(
    contextInfo.renderer
  );

  const cached = useCache
    ? readCachedProfile(contextInfo.renderer, contextInfo.webgl2)
    : null;

  if (cached) {
    return withPerformanceFields(
      {
        ...contextInfo,
        ...cached.formats,
        softwareRasterizer,
      },
      // Software rasterizer always wins over a stale cached class.
      softwareRasterizer ? 'minimal' : cached.gpuClass,
      softwareRasterizer ? null : cached.gpuPerfMsPerMpx
    );
  }

  const probedFormats = getSupportedTextureFormats();
  const formats = probedFormats ?? { ...NO_GPU_FORMATS };

  let gpuPerfMsPerMpx: number | null = null;
  if (!softwareRasterizer) {
    gpuPerfMsPerMpx = probeGpuMsPerMpx();
  }

  const gpuClass = classifyGpuClass({
    webgl: true,
    softwareRasterizer,
    msPerMpx: gpuPerfMsPerMpx,
  });

  // Only persist when texture probing succeeded so a transient GL failure does
  // not poison the cache under an otherwise valid renderer key.
  if (probedFormats && gpuClass != null) {
    writeCachedProfile(
      contextInfo,
      softwareRasterizer,
      probedFormats,
      gpuClass,
      gpuPerfMsPerMpx
    );
  }

  return withPerformanceFields(
    {
      ...contextInfo,
      ...formats,
      softwareRasterizer,
    },
    gpuClass,
    gpuPerfMsPerMpx
  );
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
