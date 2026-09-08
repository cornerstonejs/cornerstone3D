/**
 * @packageDocumentation
 *
 * Experimental WebGPU render backend for Cornerstone3D planar viewports,
 * built on the vtk.js WebGPU view API.
 *
 * @deprecated This package is maintained but not developed. vtk.js's WebGPU
 * support is not being completed upstream; the supported route to WebGPU is
 * vtk-wasm, tracked in
 * {@link https://github.com/cornerstonejs/cornerstone3D/issues/2894 | #2894}.
 * It ships as its own package, is not installed by default, and is not part
 * of any Cornerstone3D bundle unless an application asks for it. Use it to
 * evaluate WebGPU, not as the basis for new work.
 *
 * Load it dynamically so it stays out of the main bundle:
 *
 * ```ts
 * const { registerWebGPURenderBackend, isWebGPURenderingAvailable } =
 *   await import('@cornerstonejs/rendering-webgpu-vtkjs');
 *
 * if (isWebGPURenderingAvailable()) {
 *   registerWebGPURenderBackend();
 *   setRenderBackend('webgpu');
 * }
 * ```
 */

// Brings the `'webgpu'` backend id into core's extensible-enum interfaces for
// anything that imports this package. Type-only, so it adds no runtime import;
// the module is still emitted, so the augmentation ships in the built types.
import type {} from './renderBackendRegistry';

export {
  registerWebGPURenderBackend,
  WEBGPU_RENDER_BACKEND,
} from './registerWebGPURenderBackend';

export {
  getWebGPUViewportDebugInfo,
  isWebGPURenderingAvailable,
  setWebGPUViewportBackground,
} from './webgpuViewportRenderWindow';

export type { WebGPUViewportWindow } from './webgpuViewportRenderWindow';

export {
  WebGPUImageMapperPath,
  WEBGPU_IMAGE_RENDER_MODE,
} from './WebGPUImageMapperRenderPath';

export {
  WebGPUVolumeSlicePath,
  WEBGPU_VOLUME_RENDER_MODE,
} from './WebGPUVolumeSliceRenderPath';
