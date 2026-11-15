import macro from '@kitware/vtk.js/macros';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { getRenderingCapabilities } from '../../utilities/renderingCapabilities';
import { withoutExtension } from './norm16ExtensionGate';

/** The WebGL extension of linear filtering of 32-bit float textures. */
export const FLOAT_LINEAR_EXTENSION_NAME = 'OES_texture_float_linear';

type FilterContext = {
  NEAREST?: number;
  R32F?: number;
  RG32F?: number;
  RGB32F?: number;
  RGBA32F?: number;
  getExtension?: (name: string) => unknown;
  getSupportedExtensions?: () => string[] | null;
};

type FilterTexture = {
  getOpenGLFilterMode: (mode: number) => number;
  getReferenceByName: (name: string) => unknown;
};

/**
 * Whether this device filters 32-bit float textures linearly. The capability
 * profile decides (`floatLinear`), because a GPU can list
 * `OES_texture_float_linear` and still filter wrong. Without a profile of a
 * WebGL2 context (no WebGL, or a test), the extension of the given context
 * decides.
 *
 * @param context - The WebGL context of the texture, used only without a profile
 */
export function canFilterFloatTextures(context?: FilterContext): boolean {
  const capabilities = getRenderingCapabilities();

  if (capabilities.webgl) {
    return capabilities.floatLinear;
  }

  return Boolean(context?.getExtension?.(FLOAT_LINEAR_EXTENSION_NAME));
}

/**
 * Whether a texture of the given internal format must be sampled with
 * nearest filtering on this device: a 32-bit float format (R32F to RGBA32F)
 * when the device cannot filter float textures. WebGL reads such a texture
 * with a linear filter as 0. A half float texture (R16F), which vtk.js also
 * fills from float data, can always be filtered in WebGL2.
 *
 * @param context - The WebGL context of the texture
 * @param internalFormat - The internal format of the texture
 */
export function isUnfilterableFloat(
  context: FilterContext | undefined,
  internalFormat: unknown
): boolean {
  if (!context || !internalFormat) {
    return false;
  }

  return (
    [context.R32F, context.RG32F, context.RGB32F, context.RGBA32F].includes(
      internalFormat as number
    ) && !canFilterFloatTextures(context)
  );
}

/**
 * Whether a vtk.js OpenGL texture holds a format that this device samples
 * with nearest filtering (see {@link isUnfilterableFloat}).
 *
 * @param texture - A vtk.js OpenGL texture (its public API)
 */
export function isUnfilterableFloatTexture(texture: FilterTexture): boolean {
  return isUnfilterableFloat(
    texture.getReferenceByName('context') as FilterContext,
    texture.getReferenceByName('internalFormat')
  );
}

/**
 * Makes a vtk.js OpenGL texture send nearest filtering to WebGL whenever it
 * holds a 32-bit float format that this device cannot filter (see
 * {@link isUnfilterableFloat}), also after vtk.js fills it again with another
 * format. The filters that vtk.js sets on the texture stay as they are, so a
 * mapper that sets a linear filter on every render does not mark the texture
 * modified again and again, and a texture that later holds a half float
 * format is filtered linearly again.
 *
 * vtk.js freezes the public API of an instance, so this is called inside the
 * `extend` of a texture class, before `newInstance` returns.
 *
 * @param publicAPI - The public API of a vtk.js OpenGL texture being extended
 */
export function sampleUnfilterableFloatNearest(publicAPI: FilterTexture): void {
  const getOpenGLFilterMode = publicAPI.getOpenGLFilterMode;

  publicAPI.getOpenGLFilterMode = (mode: number) =>
    isUnfilterableFloatTexture(publicAPI)
      ? (publicAPI.getReferenceByName('context') as FilterContext).NEAREST
      : getOpenGLFilterMode(mode);
}

function extendFloatSafeTexture(publicAPI, model, initialValues = {}) {
  vtkOpenGLTexture.extend(publicAPI, model, initialValues);
  sampleUnfilterableFloatNearest(publicAPI);
}

/**
 * Creates a vtk.js OpenGL texture that samples a 32-bit float format this
 * device cannot filter with nearest filtering (see
 * {@link sampleUnfilterableFloatNearest}). Every other texture behaves as a
 * stock vtk.js texture.
 */
export const newFloatSafeTexture = macro.newInstance(
  extendFloatSafeTexture,
  'vtkOpenGLTexture'
);

/**
 * Applies the capability profile to a WebGL context made for a cornerstone
 * render window: when the profile says this device cannot filter float
 * textures but the context lists `OES_texture_float_linear`, the context is
 * wrapped so that vtk.js does not see that extension. vtk.js then keeps float
 * data that fits a half float texture in one, which WebGL2 can filter, and
 * builds the opacity table of a volume as 8-bit. Every other context is
 * returned unchanged.
 */
export function applyFloatLinearExtensionGate<T>(context: T): T {
  const capabilities = getRenderingCapabilities();

  if (
    !context ||
    typeof context !== 'object' ||
    !capabilities.webgl ||
    capabilities.floatLinear
  ) {
    return context;
  }

  const supported = (context as FilterContext).getSupportedExtensions?.() ?? [];

  if (!supported.includes(FLOAT_LINEAR_EXTENSION_NAME)) {
    return context;
  }

  return withoutExtension(context as T & object, FLOAT_LINEAR_EXTENSION_NAME);
}
