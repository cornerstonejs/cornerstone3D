import supportsNorm16LinearCached from '@kitware/vtk.js/Rendering/OpenGL/Texture/supportsNorm16Linear';
import { getCanUseNorm16Texture } from '../../init';
import { getRenderingCapabilities } from '../../utilities/renderingCapabilities';
import { coreLog } from '../../utilities/logger';

const log = coreLog.getLogger('RenderingEngine', 'norm16ExtensionGate');

/** The WebGL extension of 16-bit normalized textures. */
export const NORM16_EXTENSION_NAME = 'EXT_texture_norm16';

let warned = false;

/**
 * Wraps a WebGL context so that it reports `EXT_texture_norm16` as missing:
 * `getExtension` gives null for it and `getSupportedExtensions` leaves it out.
 * Every other property and method is the one of the context.
 */
export function withoutNorm16Extension<T extends object>(context: T): T {
  return withoutExtension(context, NORM16_EXTENSION_NAME);
}

/**
 * Wraps a WebGL context so that it reports one extension as missing:
 * `getExtension` gives null for it and `getSupportedExtensions` leaves it out.
 * Every other property and method is the one of the context.
 *
 * @param context - The WebGL context, or a context wrapped before
 * @param hiddenName - The name of the extension to hide
 */
export function withoutExtension<T extends object>(
  context: T,
  hiddenName: string
): T {
  const boundMethods = new Map<PropertyKey, unknown>();

  return new Proxy(context, {
    get(target, property) {
      if (property === 'getExtension') {
        return (name: string) =>
          name === hiddenName
            ? null
            : (target as unknown as WebGL2RenderingContext).getExtension(name);
      }

      if (property === 'getSupportedExtensions') {
        return () =>
          (target as unknown as WebGL2RenderingContext)
            .getSupportedExtensions()
            ?.filter((name) => name !== hiddenName) ?? null;
      }

      const value = Reflect.get(target, property);

      if (typeof value !== 'function') {
        return value;
      }

      if (!boundMethods.has(property)) {
        boundMethods.set(property, value.bind(target));
      }

      return boundMethods.get(property);
    },
  });
}

/**
 * Logs one warning per page when norm16 is hidden and 32-bit float textures
 * cannot be filtered either: vtk.js then draws 16-bit images with half float,
 * which holds whole numbers exactly only up to 2048, or with a float texture
 * that linear filtering cannot sample.
 */
function warnWhenFilteredImagesCannotBeDrawn(): void {
  const capabilities = getRenderingCapabilities();

  if (warned || capabilities.floatLinear) {
    return;
  }

  warned = true;
  log.warn(
    capabilities.halfFloatLinear
      ? 'norm16 textures failed the texture probe and float textures cannot be filtered on this GPU: 16-bit images with values outside -2048 to 2048 may draw wrong with linear interpolation. utilities.runDrawSelfTest() checks the draw path.'
      : 'norm16, float and half float textures with linear filtering all failed the texture probe on this GPU: 16-bit and float images may draw wrong with linear interpolation. utilities.runDrawSelfTest() checks the draw path.'
  );
}

/**
 * Applies the texture probe to a WebGL context made for a cornerstone render
 * window. When the probe says norm16 is not usable (the test of
 * `getCanUseNorm16Texture()`), the context is wrapped so that every vtk.js
 * class on it sees no `EXT_texture_norm16` and uses float or half float. When
 * the probe passes, the context is returned unchanged.
 */
export function applyNorm16ExtensionGate<T>(context: T): T {
  if (!context || typeof context !== 'object' || getCanUseNorm16Texture()) {
    return context;
  }

  warnWhenFilteredImagesCannotBeDrawn();

  return withoutNorm16Extension(context as T & object);
}

/**
 * Runs, once per page, the probe with which vtk.js decides whether it may
 * filter a norm16 texture linearly (`supportsNorm16Linear` of vtk.js: a WebGL2
 * context of its own, a shader, a draw and a read-back; about 5 ms on an
 * Apple M2 Ultra). vtk.js runs it at the first texture that it makes with a
 * linear filter while norm16 is on, of any data type, which is the first
 * slice that a viewport draws; run in an idle period before that, the first
 * slice does not pay it. Nothing runs when norm16 is off: vtk.js then never
 * asks.
 */
export function runNorm16LinearProbe(): void {
  if (getCanUseNorm16Texture()) {
    supportsNorm16LinearCached();
  }
}

/** Lets the next hidden context log its warning again. For tests. */
export function resetNorm16ExtensionGateWarning(): void {
  warned = false;
}
