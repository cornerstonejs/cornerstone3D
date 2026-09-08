import {
  isRegisteredRenderBackend,
  registerRenderBackend,
} from '@cornerstonejs/core/renderBackend';
import {
  WebGPUImageMapperPath,
  WEBGPU_IMAGE_RENDER_MODE,
} from './WebGPUImageMapperRenderPath';
import {
  WebGPUVolumeSlicePath,
  WEBGPU_VOLUME_RENDER_MODE,
} from './WebGPUVolumeSliceRenderPath';
import { isWebGPURenderingAvailable } from './webgpuViewportRenderWindow';

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
      // Both modes mount ordinary vtk actors into a vtk scene and can host
      // overlay actors; only the presentation surface differs from the core
      // gpu backend. Declared explicitly rather than left to the defaults,
      // because the surface below would otherwise be the only signal and it
      // says the opposite -- see the comment on `surface`.
      image: {
        id: WEBGPU_IMAGE_RENDER_MODE,
        createDefinition: () => new WebGPUImageMapperPath(),
        supportsOverlayActors: true,
        usesVtkActors: true,
      },
      volume: {
        id: WEBGPU_VOLUME_RENDER_MODE,
        createDefinition: () => new WebGPUVolumeSlicePath(),
        supportsOverlayActors: true,
        usesVtkActors: true,
      },
    },
    // The WebGPU path blits into the viewport's `cpu` surface canvas (the
    // `vtk` surface belongs to the engine's WebGL blit cycle). This is a
    // statement about which canvas is composited, not about how the scene is
    // built: the actors are vtk actors, which is why the two capabilities
    // above are declared and must not be inferred from this.
    surface: 'cpu',
  });
}
