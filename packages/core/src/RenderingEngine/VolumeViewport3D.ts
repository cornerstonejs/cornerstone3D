import { BlendModes, OrientationAxis, Events } from '../enums';
import { RENDERING_DEFAULTS } from '../constants';
import cache from '../cache';
import setDefaultVolumeVOI from './helpers/setDefaultVolumeVOI';
import { triggerEvent, isImageActor } from '../utilities';
import { setTransferFunctionNodes } from '../utilities/transferFunctionUtils';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { ViewportInput } from '../types/IViewport';
import type { ImageActor } from '../types/IActor';
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

  /**
   * Resets the properties of the volume to their default values.
   *
   * @param [volumeId] - The id of the volume to reset. If not provided, the default volume will be reset.
   */
  resetProperties(volumeId?: string): void {
    const volumeActor = volumeId
      ? this.getActor(volumeId)
      : this.getDefaultActor();

    if (!volumeActor) {
      throw new Error(`No actor found for the given volumeId: ${volumeId}`);
    }

    // if a custom slabThickness was set, we need to reset it
    if (volumeActor.slabThickness) {
      volumeActor.slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
      this.viewportProperties.slabThickness = undefined;
      this.updateClippingPlanesForActors(this.getCamera());
    }

    const imageVolume = cache.getVolume(volumeActor.uid);

    if (!imageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeActor.uid} does not exist in cache`
      );
    }

    setDefaultVolumeVOI(volumeActor.actor as vtkVolume, imageVolume, false);

    if (isImageActor(volumeActor)) {
      const transferFunction = (volumeActor.actor as ImageActor)
        .getProperty()
        .getRGBTransferFunction(0);

      setTransferFunctionNodes(
        transferFunction,
        this.initialTransferFunctionNodes
      );
    }

    this.setCamera(this.initialCamera);
    triggerEvent(
      this.element,
      Events.VOI_MODIFIED,
      super.getVOIModifiedEventDetail(volumeId)
    );
  }

  resetSlabThickness(): void {
    return null;
  }
}

export default VolumeViewport3D;
