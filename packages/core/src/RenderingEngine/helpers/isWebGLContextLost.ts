import type { VtkOffscreenMultiRenderWindow } from '../../types';

/**
 * True when the WebGL context of an offscreen render window is lost.
 *
 * vtk.js cannot build its shader programs in a lost context, and a render
 * there throws, for example in the volume pass. A rendering engine therefore
 * renders nothing into such a window, and the canvases keep their last image.
 *
 * @param offscreenMultiRenderWindow - the offscreen window of a context
 * @returns true when its context is lost
 */
export default function isWebGLContextLost(
  offscreenMultiRenderWindow: VtkOffscreenMultiRenderWindow | undefined
): boolean {
  const gl = offscreenMultiRenderWindow
    ?.getOpenGLRenderWindow?.()
    ?.getContext?.();

  return Boolean(gl?.isContextLost?.());
}
