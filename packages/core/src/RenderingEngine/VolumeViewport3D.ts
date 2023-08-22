import { BlendModes, OrientationAxis } from '../enums';
import type { ViewportInput } from '../types/IViewport';
import BaseVolumeViewport from './BaseVolumeViewport';

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

    const { parallelProjection, orientation } = this.options;

    const activeCamera = this.getVtkActiveCamera();

    if (parallelProjection != null) {
      activeCamera.setParallelProjection(parallelProjection);
    }

    if (orientation && orientation !== OrientationAxis.ACQUISITION) {
      this.applyViewOrientation(orientation);
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

  getCurrentImageIdIndex = (): number | undefined => {
    return undefined;
  };

  getCurrentImageId = (): string => {
    return null;
  };

  setSlabThickness(
    slabThickness: number,
    filterActorUIDs?: Array<string>
  ): void {
    return null;
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate?: boolean
  ): void {
    return null;
  }

  resetProperties(volumeId?: string): void {
    return null;
  }
}

export default VolumeViewport3D;
