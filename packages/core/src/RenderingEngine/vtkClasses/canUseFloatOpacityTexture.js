/**
 * Returns whether the current WebGL context can linearly sample a float
 * opacity texture.
 *
 * WebGL2 includes float textures, but linear filtering of those textures is
 * still gated by OES_texture_float_linear. In WebGL1, both extensions are
 * required.
 */
export default function canUseFloatOpacityTexture(openGLRenderWindow, context) {
  const supportsFloatTextures =
    openGLRenderWindow.getWebgl2() ||
    Boolean(context.getExtension('OES_texture_float'));
  const supportsFloatLinearFiltering = Boolean(
    context.getExtension('OES_texture_float_linear')
  );

  return supportsFloatTextures && supportsFloatLinearFiltering;
}
