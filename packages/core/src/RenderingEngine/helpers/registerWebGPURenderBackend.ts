import {
  isRegisteredRenderBackend,
  registerRenderBackend,
} from './renderBackendRegistry';
import {
  WebGPUImageMapperPath,
  WEBGPU_IMAGE_RENDER_MODE,
} from '../GenericViewport/Planar/WebGPUImageMapperRenderPath';
import {
  WebGPUVolumeSlicePath,
  WEBGPU_VOLUME_RENDER_MODE,
} from '../GenericViewport/Planar/WebGPUVolumeSliceRenderPath';
import { isWebGPURenderingAvailable } from '../GenericViewport/Planar/webgpuViewportRenderWindow';

export { isWebGPURenderingAvailable };

/**
 * Wire id of the WebGPU render backend.
 */
export const WEBGPU_RENDER_BACKEND = 'webgpu';

/**
 * Registers the experimental WebGPU render backend for GenericViewport
 * planar viewports (image-stack and volume-slice/MPR render modes).
 *
 * After registration the backend participates like any other:
 * - `setRenderBackend(Enums.RenderBackends.WEBGPU)` (or `'webgpu'`) globally
 * - `options: { renderBackend: 'webgpu' }` per display set
 *
 * Not registered automatically: call this explicitly from applications that
 * want to opt in. Throws when WebGPU is unavailable in the environment
 * (check `isWebGPURenderingAvailable()` first).
 *
 * @experimental
 */
export function registerWebGPURenderBackend(): void {
  if (isRegisteredRenderBackend(WEBGPU_RENDER_BACKEND)) {
    return;
  }

  if (!isWebGPURenderingAvailable()) {
    throw new Error(
      '[registerWebGPURenderBackend] WebGPU is not available in this environment (navigator.gpu missing)'
    );
  }

  registerRenderBackend({
    name: 'WEBGPU',
    backend: WEBGPU_RENDER_BACKEND,
    renderModes: {
      image: {
        id: WEBGPU_IMAGE_RENDER_MODE,
        createDefinition: () => new WebGPUImageMapperPath(),
      },
      volume: {
        id: WEBGPU_VOLUME_RENDER_MODE,
        createDefinition: () => new WebGPUVolumeSlicePath(),
      },
    },
    // The WebGPU path blits into the viewport's `cpu` surface canvas (the
    // `vtk` surface belongs to the engine's WebGL blit cycle).
    surface: 'cpu',
  });
}
