import { vec3 } from 'gl-matrix';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import cache from '../cache';
import transformWorldToIndex from '../utilities/transformWorldToIndex';
import type {
  Point3,
  IVolumeInput,
  ActorEntry,
  IImageVolume,
  OrientationVectors,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import { RENDERING_DEFAULTS, MPR_CAMERA_VALUES, EPSILON } from '../constants';
import { BlendModes, OrientationAxis } from '../enums';
import BaseVolumeViewport from './BaseVolumeViewport';
import { actorIsA } from '../utilities';

/**
 * An object representing a VolumeViewport. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
class VolumeViewport extends BaseVolumeViewport {
  private _useAcquisitionPlaneForViewPlane = false;
  constructor(props: ViewportInput) {
    super(props);

    const { orientation } = this.options;

    // if the camera is set to be acquisition axis then we need to skip
    // it for now until the volume is set
    if (orientation && orientation !== OrientationAxis.ACQUISITION) {
      const { viewPlaneNormal, viewUp } =
        this._getOrientationVectors(orientation);
      const camera = this.getVtkActiveCamera();
      camera.setDirectionOfProjection(
        -viewPlaneNormal[0],
        -viewPlaneNormal[1],
        -viewPlaneNormal[2]
      );
      camera.setViewUpFrom(viewUp);

      this.resetCamera();
      return;
    }

    this._useAcquisitionPlaneForViewPlane = true;
  }

  /**
   * Creates volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   * For each entry, if a `blendMode` and/or `slabThickness` is defined, this will be set on the actor's
   * `VolumeMapper`.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async setVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }

    if (this._useAcquisitionPlaneForViewPlane) {
      this._setViewPlaneToAcquisitionPlane(firstImageVolume);
      this._useAcquisitionPlaneForViewPlane = false;
    }

    return super.setVolumes(volumeInputArray, immediate, suppressEvents);
  }

  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
  public async addVolumes(
    volumeInputArray: Array<IVolumeInput>,
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }

    if (this._useAcquisitionPlaneForViewPlane) {
      this._setViewPlaneToAcquisitionPlane(firstImageVolume);
      this._useAcquisitionPlaneForViewPlane = false;
    }

    return super.addVolumes(volumeInputArray, immediate, suppressEvents);
  }

  /**
   * It sets the orientation for the camera, the orientation can be one of the
   * following: axial, sagittal, coronal, default. Use the Enums.OrientationAxis
   * to set the orientation. The "default" orientation is the orientation that
   * the volume was acquired in (scan axis)
   *
   * @param orientation - The orientation to set the camera to.
   * @param immediate - Whether the `Viewport` should be rendered as soon as the camera is set.
   */
  public setOrientation(orientation: OrientationAxis, immediate = true): void {
    let viewPlaneNormal, viewUp;

    if (MPR_CAMERA_VALUES[orientation]) {
      ({ viewPlaneNormal, viewUp } = MPR_CAMERA_VALUES[orientation]);
    } else if (orientation === 'acquisition') {
      ({ viewPlaneNormal, viewUp } = this._getAcquisitionPlaneOrientation());
    } else {
      throw new Error(
        `Invalid orientation: ${orientation}. Use Enums.OrientationAxis instead.`
      );
    }

    this.setCamera({
      viewPlaneNormal,
      viewUp,
    });

    this.resetCamera();

    if (immediate) {
      this.render();
    }
  }

  private _getOrientationVectors(
    orientation: OrientationAxis | OrientationVectors
  ): OrientationVectors {
    if (typeof orientation === 'object') {
      if (orientation.viewPlaneNormal && orientation.viewUp) {
        return orientation;
      } else {
        throw new Error(
          'Invalid orientation object. It must contain viewPlaneNormal and viewUp'
        );
      }
    } else if (
      typeof orientation === 'string' &&
      MPR_CAMERA_VALUES[orientation]
    ) {
      return MPR_CAMERA_VALUES[orientation];
    } else {
      throw new Error(
        `Invalid orientation: ${orientation}. Valid orientations are: ${Object.keys(
          MPR_CAMERA_VALUES
        ).join(', ')}`
      );
    }
  }

  private _getAcquisitionPlaneOrientation(): OrientationVectors {
    const actorEntry = this.getDefaultActor();

    if (!actorEntry) {
      return;
    }

    // Todo: fix this after we add the volumeId reference to actorEntry later
    // in the segmentation refactor
    const volumeId = actorEntry.uid;

    const imageVolume = cache.getVolume(volumeId);

    if (!imageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeId} does not exist in cache`
      );
    }

    const { direction } = imageVolume;
    const viewPlaneNormal = direction.slice(6, 9).map((x) => -x) as Point3;
    const viewUp = (direction.slice(3, 6) as Point3).map((x) => -x) as Point3;

    return {
      viewPlaneNormal,
      viewUp,
    };
  }

  private _setViewPlaneToAcquisitionPlane(imageVolume: IImageVolume): void {
    let viewPlaneNormal, viewUp;

    if (imageVolume) {
      const { direction } = imageVolume;
      viewPlaneNormal = direction.slice(6, 9).map((x) => -x) as Point3;
      viewUp = (direction.slice(3, 6) as Point3).map((x) => -x) as Point3;
    } else {
      ({ viewPlaneNormal, viewUp } = this._getAcquisitionPlaneOrientation());
    }

    this.setCamera({
      viewPlaneNormal,
      viewUp,
    });

    this.resetCamera();
  }

  /**
   * Given a point in world coordinates, return the intensity at that point
   * @param point - The point in world coordinates to get the intensity
   * from.
   * @returns The intensity value of the voxel at the given point.
   */
  public getIntensityFromWorld(point: Point3): number {
    const actorEntry = this.getDefaultActor();
    if (!actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const { actor, uid } = actorEntry;
    const imageData = actor.getMapper().getInputData();

    const volume = cache.getVolume(uid);
    const { dimensions } = volume;

    const index = transformWorldToIndex(imageData, point);

    const voxelIndex =
      index[2] * dimensions[0] * dimensions[1] +
      index[1] * dimensions[0] +
      index[0];

    return volume.scalarData[voxelIndex];
  }

  public setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs = [],
    immediate = false
  ): void {
    let actorEntries = this.getActors();

    if (filterActorUIDs && filterActorUIDs.length > 0) {
      actorEntries = actorEntries.filter((actorEntry: ActorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      const { actor } = actorEntry;

      const mapper = actor.getMapper();
      // @ts-ignore vtk incorrect typing
      mapper.setBlendMode(blendMode);
    });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Reset the camera for the volume viewport
   */
  public resetCamera(
    resetPan = true,
    resetZoom = true,
    resetToCenter = true
  ): boolean {
    super.resetCamera(resetPan, resetZoom, resetToCenter);

    this.resetVolumeViewportClippingRange();

    const activeCamera = this.getVtkActiveCamera();
    const viewPlaneNormal = <Point3>activeCamera.getViewPlaneNormal();
    const focalPoint = <Point3>activeCamera.getFocalPoint();

    // always add clipping planes for the volume viewport. If a use case
    // arises where we don't want clipping planes, you should use the volume_3d
    // viewport instead.
    const actorEntries = this.getActors();
    actorEntries.forEach((actorEntry) => {
      if (!actorEntry.actor) {
        return;
      }
      const mapper = actorEntry.actor.getMapper();
      const vtkPlanes = mapper.getClippingPlanes();

      if (vtkPlanes.length === 0) {
        const clipPlane1 = vtkPlane.newInstance();
        const clipPlane2 = vtkPlane.newInstance();
        const newVtkPlanes = [clipPlane1, clipPlane2];

        let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
        if (actorEntry.slabThickness) {
          slabThickness = actorEntry.slabThickness;
        }

        this.setOrientationOfClippingPlanes(
          newVtkPlanes,
          slabThickness,
          viewPlaneNormal,
          focalPoint
        );

        mapper.addClippingPlane(clipPlane1);
        mapper.addClippingPlane(clipPlane2);
      }
    });

    return true;
  }

  /**
   * It sets the slabThickness of the actors of the viewport. If filterActorUIDs are
   * provided, only the actors with the given UIDs will be affected. If no
   * filterActorUIDs are provided, all actors will be affected.
   *
   * @param slabThickness - The slab thickness to set.
   * @param blendMode - The blend mode to use when rendering the actors.
   * @param filterActorUIDs - Optional argument to filter the actors to apply
   * the slab thickness to (if not provided, all actors will be affected).
   */
  public setSlabThickness(slabThickness: number, filterActorUIDs = []): void {
    let actorEntries = this.getActors();

    if (filterActorUIDs && filterActorUIDs.length > 0) {
      actorEntries = actorEntries.filter((actorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      if (actorIsA(actorEntry, 'vtkVolume')) {
        actorEntry.slabThickness = slabThickness;
      }
    });

    const currentCamera = this.getCamera();
    this.updateClippingPlanesForActors(currentCamera);
    this.triggerCameraModifiedEventIfNecessary(currentCamera, currentCamera);
  }

  /**
   * Gets the largest slab thickness from all actors in the viewport.
   *
   * @returns slabThickness - The slab thickness.
   */
  public getSlabThickness(): number {
    const actors = this.getActors();
    let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
    actors.forEach((actor) => {
      if (actor.slabThickness > slabThickness) {
        slabThickness = actor.slabThickness;
      }
    });

    return slabThickness;
  }

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to calculate the slice index.
   * Todo: This only works if the imageIds are properly sorted
   *
   * @returns The slice index
   */
  public getCurrentImageIdIndex = (): number | undefined => {
    return this._getImageIdIndex();
  };

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to find which imageId is
   * currently being viewed.
   *
   * @returns ImageId
   */
  public getCurrentImageId = (): string | undefined => {
    const index = this._getImageIdIndex();

    if (isNaN(index)) {
      return;
    }

    const actorEntry = this.getDefaultActor();
    if (!actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const { uid } = actorEntry;
    const volume = cache.getVolume(uid);

    if (!volume) {
      return;
    }

    const imageIds = volume.imageIds;

    return imageIds[index];
  };

  private _getImageIdIndex = () => {
    const { viewPlaneNormal, focalPoint } = this.getCamera();

    // Todo: handle scenario of fusion of multiple volumes
    // we cannot only check number of actors, because we might have
    // segmentations ...
    const { direction, origin, spacing } = this.getImageData();

    // get the last 3 components of the direction - axis normal
    const dir = direction.slice(direction.length - 3);

    const dot = Math.abs(
      dir[0] * viewPlaneNormal[0] +
        dir[1] * viewPlaneNormal[1] +
        dir[2] * viewPlaneNormal[2]
    );

    // if dot is not 1 or -1 return null since it means
    // viewport is not looking at the image acquisition plane
    if (dot - 1 > EPSILON) {
      return;
    }

    // how many steps are from the origin to the focal point in the
    // normal direction
    const spacingInNormal = spacing[2];
    const sub = vec3.create();
    vec3.sub(sub, focalPoint, origin);
    const distance = vec3.dot(sub, viewPlaneNormal);

    // divide by the spacing in the normal direction to get the
    // number of steps, and subtract 1 to get the index
    return Math.round(Math.abs(distance) / spacingInNormal);
  };
}

export default VolumeViewport;
