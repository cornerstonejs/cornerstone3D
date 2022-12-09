import BaseVolumeViewport from './BaseVolumeViewport';
import { RENDERING_DEFAULTS } from '../constants';

/**
 * An object representing a 3-dimensional volume viewport. VolumeViewport3Ds are used to render
 * 3D volumes in their entirety, and not just load a single slice at a time.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
class VolumeViewport3D extends BaseVolumeViewport {
  public resetCamera(
    resetPan = true,
    resetZoom = true,
    resetToCenter = true
  ): boolean {
    super.resetCamera(resetPan, resetZoom, resetToCenter);
    const activeCamera = this.getVtkActiveCamera();
    // Set large numbers to ensure everything is always rendered
    if (activeCamera.getParallelProjection()) {
      activeCamera.setClippingRange(
        -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
        RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
      );
    } else {
      activeCamera.setClippingRange(
        RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
        RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
      );
    }

    return;
  }
}

export default VolumeViewport3D;
