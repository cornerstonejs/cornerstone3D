import type { ViewportInput } from '../types/IViewport';
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
  constructor(props: ViewportInput) {
    super(props);

    const { parallelProjection } = this.options;

    const activeCamera = this.getVtkActiveCamera();

    if (parallelProjection != null) {
      activeCamera.setParallelProjection(parallelProjection);
    }
  }

  public resetCamera(
    resetPan = true,
    resetZoom = true,
    resetToCenter = true
  ): boolean {
    super.resetCamera(resetPan, resetZoom, resetToCenter);
    this.resetVolumeViewportClippingRange();
    return;
  }

  getRotation = (): number => 0;
}

export default VolumeViewport3D;
