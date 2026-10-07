/**
 * Returns whether the current WebGL2 context can linearly sample a float
 * opacity texture.
 *
 * WebGL2 includes float textures, but linear filtering of those textures is
 * still gated by OES_texture_float_linear.
 */
export default function canUseFloatOpacityTexture(context) {
  return Boolean(context.getExtension('OES_texture_float_linear'));
}
