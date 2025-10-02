import { RENDERING_DEFAULTS } from '../constants';
import type { BlendModes } from '../enums';
import { OrientationAxis, Events } from '../enums';
import cache from '../cache/cache';
import setDefaultVolumeVOI from './helpers/setDefaultVolumeVOI';
import triggerEvent from '../utilities/triggerEvent';
import { isImageActor } from '../utilities/actorCheck';
import { setTransferFunctionNodes } from '../utilities/transferFunctionUtils';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import type { ViewportInput } from '../types/IViewport';
import type { ImageActor } from '../types/IActor';
import BaseVolumeViewport from './BaseVolumeViewport';

/**
 * An object representing a 3-dimensional volume viewport. VolumeViewport3Ds are used to render
 * 3D volumes in their entirety, and not just load a single slice at a time.
 *
 * For setting volumes on viewports you need to use addVolumesToViewports
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

  public getNumberOfSlices = (): number => {
    return 1;
  };

  public isInAcquisitionPlane(): boolean {
    return false;
  }

  public resetCamera({
    resetPan = true,
    resetZoom = true,
    resetToCenter = true,
  } = {}): boolean {
    // Log volume dimensions and voxel manager info before camera reset
    const actors = this.getActors();
    if (actors && actors.length > 0) {
      actors.forEach(actor => {
        const volume = cache.getVolume(actor.referencedId);
        if (volume) {
          console.log('📏 VolumeViewport3D: Volume info before camera reset:', {
            volumeId: actor.referencedId,
            volumeDimensions: Array.from(volume.dimensions),
            volumeSpacing: Array.from(volume.spacing),
            volumeOrigin: Array.from(volume.origin),
            volumeDirection: Array.from(volume.direction),
            imageDataDimensions: Array.from(volume.imageData?.getDimensions() || []),
            imageDataSpacing: Array.from(volume.imageData?.getSpacing() || []),
            imageDataOrigin: Array.from(volume.imageData?.getOrigin() || []),
            imageDataDirection: Array.from(volume.imageData?.getDirection() || []),
            voxelManager: volume.voxelManager ? {
              dimensions: volume.voxelManager.dimensions,
              sizeInBytes: (() => {
                try {
                  return volume.voxelManager.sizeInBytes;
                } catch (e) {
                  console.warn('Error accessing voxelManager.sizeInBytes:', e);
                  return 'Error accessing sizeInBytes';
                }
              })()
            } : null,
            numberOfComponents: volume.imageData?.get('numberOfComponents'),
            dataType: volume.dataType,
            metadataRows: volume.metadata?.Rows,
            metadataColumns: volume.metadata?.Columns,
            metadataPixelSpacing: volume.metadata?.PixelSpacing
          });
        }
      });
    }

    super.resetCamera({ resetPan, resetZoom, resetToCenter });
    const activeCamera = this.getVtkActiveCamera();

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

    // reset camera clipping range
    const renderer = this.getRenderer();
    renderer.resetCameraClippingRange();

    // Log volume dimensions and voxel manager info after camera reset
    if (actors && actors.length > 0) {
      actors.forEach(actor => {
        const volume = cache.getVolume(actor.referencedId);
        if (volume) {
          console.log('📏 VolumeViewport3D: Volume info after camera reset:', {
            volumeId: actor.referencedId,
            volumeDimensions: Array.from(volume.dimensions),
            imageDataDimensions: Array.from(volume.imageData?.getDimensions() || []),
            numberOfComponents: volume.imageData?.get('numberOfComponents'),
            dataType: volume.dataType,
            viewportBounds: this.getBounds(),
            cameraPosition: this.getCamera().position,
            cameraFocalPoint: this.getCamera().focalPoint
          });
        }
      });
    }

    return true;
  }

  getRotation = (): number => 0;

  getCurrentImageIdIndex = (): number => {
    return 0;
  };

  getCurrentImageId = (): string => {
    return null;
  };

  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void {
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

    volumeId ||= this.getVolumeId();
    const imageVolume = cache.getVolume(volumeId);

    if (!imageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeId} does not exist in cache`
      );
    }

    setDefaultVolumeVOI(volumeActor.actor as vtkVolume, imageVolume);

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

  public resetCameraForResize = (): boolean => {
    return this.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: true,
    });
  };

  public getSliceIndex(): number {
    return null;
  }

  public setCamera(props) {
    // Log volume dimensions and voxel manager info before setting camera
    const actors = this.getActors();
    if (actors && actors.length > 0) {
      actors.forEach(actor => {
        const volume = cache.getVolume(actor.referencedId);
        if (volume) {
          console.log('📏 VolumeViewport3D: Volume info before setCamera:', {
            volumeId: actor.referencedId,
            volumeDimensions: Array.from(volume.dimensions),
            imageDataDimensions: Array.from(volume.imageData?.getDimensions() || []),
            numberOfComponents: volume.imageData?.get('numberOfComponents'),
            dataType: volume.dataType,
            voxelManager: volume.voxelManager ? {
              dimensions: volume.voxelManager.dimensions,
              sizeInBytes: (() => {
                try {
                  return volume.voxelManager.sizeInBytes;
                } catch (e) {
                  console.warn('Error accessing voxelManager.sizeInBytes:', e);
                  return 'Error accessing sizeInBytes';
                }
              })()
            } : null
          });
        }
      });
    }

    super.setCamera(props);
    this.getRenderer().resetCameraClippingRange();
    this.render();
  }

  protected setCameraClippingRange() {
    const activeCamera = this.getVtkActiveCamera();
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
  }

  resetSlabThickness(): void {
    return null;
  }
}

export default VolumeViewport3D;
