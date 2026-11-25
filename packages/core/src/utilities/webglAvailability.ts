import type { WebGLBlockReason } from '../types/GpuMemory';

/**
 * Whether new WebGL contexts and large GPU allocations wait, and why.
 *
 * Chromium blocks WebGL for a site for about two minutes after repeated
 * context losses, and other browsers can fail again at once after a GPU
 * memory failure. While a wait runs, Cornerstone3D creates no WebGL context
 * and uploads no large texture, and the images on screen stay.
 *
 * This version detects no wait yet, so WebGL is always available.
 */

/** The wait now: its end and its reason, or `undefined` when none runs. */
function getWebGLBlock():
  | { until: number; reason: WebGLBlockReason }
  | undefined {
  return undefined;
}

/** True while new WebGL contexts and large GPU allocations wait. */
function isWebGLBlocked(): boolean {
  return getWebGLBlock() !== undefined;
}

/**
 * Resolves when WebGL is available: at once when no wait runs, else when the
 * wait ends. `WEBGL_AVAILABILITY_CHANGED` fires at the same time.
 */
function whenWebGLAvailable(): Promise<void> {
  return Promise.resolve();
}

export { getWebGLBlock, isWebGLBlocked, whenWebGLAvailable };
