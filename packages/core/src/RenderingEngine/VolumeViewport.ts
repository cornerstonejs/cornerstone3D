import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';

import { vec3 } from 'gl-matrix';

import cache from '../cache';
import { MPR_CAMERA_VALUES, RENDERING_DEFAULTS } from '../constants';
import { BlendModes, OrientationAxis, Events } from '../enums';
import type {
  ActorEntry,
  IImageVolume,
  IVolumeInput,
  OrientationVectors,
  Point3,
  EventTypes,
  VolumeViewportProperties,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import {
  actorIsA,
  getClosestImageId,
  getSpacingInNormalDirection,
  isImageActor,
  triggerEvent,
} from '../utilities';
import BaseVolumeViewport from './BaseVolumeViewport';
import setDefaultVolumeVOI from './helpers/setDefaultVolumeVOI';
import { setTransferFunctionNodes } from '../utilities/transferFunctionUtils';
import { ImageActor } from '../types/IActor';

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
  // Camera properties
  private initialViewUp: Point3;

  private _useAcquisitionPlaneForViewPlane = false;
  constructor(props: ViewportInput) {
    super(props);

    const camera = vtkCamera.newInstance();

    this.initialViewUp = <Point3>[0, -1, 0];
    const viewPlaneNormal = <Point3>[0, 0, -1];

    camera.setDirectionOfProjection(
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2]
    );
    camera.setViewUp(...this.initialViewUp);

    const { orientation } = this.options;
    // if the camera is set to be acquisition axis then we need to skip
    // it for now until the volume is set
    if (orientation && orientation !== OrientationAxis.ACQUISITION) {
      this.applyViewOrientation(orientation);
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

  /**
   * Gets the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   *
   * @returns the rotation resulting from the value set in setRotation AND taking into
   * account any flips that occurred subsequently.
   */
  public getRotation = (): number => {
    const {
      viewUp: currentViewUp,
      viewPlaneNormal,
      flipVertical,
    } = this.getCamera();

    // The initial view up vector without any rotation, but incorporating vertical flip.
    const initialViewUp = flipVertical
      ? vec3.negate(vec3.create(), this.initialViewUp)
      : this.initialViewUp;

    // The angle between the initial and current view up vectors.
    // TODO: check with VTK about rounding errors here.
    const initialToCurrentViewUpAngle =
      (vec3.angle(initialViewUp, currentViewUp) * 180) / Math.PI;

    // Now determine if initialToCurrentViewUpAngle is positive or negative by comparing
    // the direction of the initial/current view up cross product with the current
    // viewPlaneNormal.

    const initialToCurrentViewUpCross = vec3.cross(
      vec3.create(),
      initialViewUp,
      currentViewUp
    );

    // The sign of the dot product of the start/end view up cross product and
    // the viewPlaneNormal indicates a positive or negative rotation respectively.
    const normalDot = vec3.dot(initialToCurrentViewUpCross, viewPlaneNormal);

    return normalDot >= 0
      ? initialToCurrentViewUpAngle
      : (360 - initialToCurrentViewUpAngle) % 360;
  };

  private setRotation(rotation: number): void {
    const previousCamera = this.getCamera();

    this.rotateCamera(rotation);

    // New camera after rotation
    const camera = this.getCamera();

    const eventDetail: EventTypes.CameraModifiedEventDetail = {
      previousCamera,
      camera,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      rotation,
    };

    triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
  }

  private rotateCamera(rotation: number): void {
    const { flipVertical } = this.getCamera();

    // Moving back to zero rotation, for new scrolled slice rotation is 0 after camera reset
    const initialViewUp = flipVertical
      ? vec3.negate(vec3.create(), this.initialViewUp)
      : this.initialViewUp;

    this.setCameraNoEvent({
      viewUp: initialViewUp as Point3,
    });

    // rotating camera to the new value
    this.getVtkActiveCamera().roll(-rotation);
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

      if (vtkPlanes.length === 0 && !actorEntry?.clippingFilter) {
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
   * @param filterActorUIDs - Optional argument to filter the actors to apply
   * the slab thickness to (if not provided, all actors will be affected).
   */
  public setSlabThickness(slabThickness: number, filterActorUIDs = []): void {
    if (slabThickness < 0.1) {
      // Cannot render zero thickness
      slabThickness = 0.1;
    }

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
    this.viewportProperties.slabThickness = slabThickness;
  }

  /**
   * Uses the origin and focalPoint to calculate the slice index.
   *
   * @returns The slice index in the direction of the view
   */
  public getCurrentImageIdIndex = (volumeId?: string): number => {
    const { viewPlaneNormal, focalPoint } = this.getCamera();

    const { origin, direction, spacing } = this.getImageData(volumeId);

    const spacingInNormal = getSpacingInNormalDirection(
      { direction, spacing },
      viewPlaneNormal
    );
    const sub = vec3.create();
    vec3.sub(sub, focalPoint, origin);
    const distance = vec3.dot(sub, viewPlaneNormal);

    // divide by the spacing in the normal direction to get the
    // number of steps, and subtract 1 to get the index
    return Math.round(Math.abs(distance) / spacingInNormal);
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
    if (this.getActors().length > 1) {
      console.warn(
        `Using the first/default actor of ${
          this.getActors().length
        } actors for getCurrentImageId.`
      );
    }

    const actorEntry = this.getDefaultActor();

    if (!actorEntry || !actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const { uid } = actorEntry;
    const volume = cache.getVolume(uid);

    if (!volume) {
      return;
    }

    const { viewPlaneNormal, focalPoint } = this.getCamera();

    return getClosestImageId(volume, focalPoint, viewPlaneNormal);
  };

  /**
   * Reset the viewport properties to the default values
   *

   * @param volumeId - Optional volume ID to specify which volume properties to reset.
   * If not provided, it will reset the properties of the default actor.
   *
   * @returns void
   */
  public resetProperties(volumeId?: string): void {
    this._resetProperties(volumeId);
  }

  private _resetProperties(volumeId?: string) {
    // Get the actor based on the volumeId if provided, otherwise use the default actor.
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
      setTransferFunctionNodes(
        (volumeActor.actor as ImageActor)
          .getProperty()
          .getRGBTransferFunction(0),
        this.initialTransferFunctionNodes
      );
    }

    const range = (volumeActor.actor as vtkVolume)
      .getProperty()
      .getRGBTransferFunction(0)
      .getMappingRange();

    const eventDetails = {
      viewportId: volumeActor.uid,
      range: {
        lower: range[0],
        upper: range[1],
      },
      volumeId: volumeActor.uid,
    };

    triggerEvent(this.element, Events.VOI_MODIFIED, eventDetails);
  }
}

export default VolumeViewport;
