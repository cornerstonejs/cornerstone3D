import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import cache from '../cache/cache';
import { Events, BlendModes, ViewportStatus } from '../enums';
import { MPR_CAMERA_VALUES } from '../constants';
import type {
  ActorEntry,
  IVolumeInput,
  Point3,
  EventTypes,
  ICamera,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import { isImageActor } from '../utilities/actorCheck';
import triggerEvent from '../utilities/triggerEvent';
import uuidv4 from '../utilities/uuidv4';

import VolumeViewport from './VolumeViewport';
import Viewport from './Viewport';
import createVolumeSliceActor from './helpers/createVolumeSliceActor';

class VolumeSliceViewport extends VolumeViewport {
  constructor(props: ViewportInput) {
    super(props);
  }

  public async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const volumeId = volumeInputArray[0].volumeId;
    const firstImageVolume = cache.getVolume(volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeId} does not exist, you need to create/allocate the volume first`
      );
    }

    if (this._useAcquisitionPlaneForViewPlane) {
      this._setViewPlaneToAcquisitionPlane(firstImageVolume);
      this._useAcquisitionPlaneForViewPlane = false;
    } else if (
      this.options.orientation &&
      typeof this.options.orientation === 'string'
    ) {
      if (this.options.orientation.includes('_reformat')) {
        this._setViewPlaneToReformatOrientation(
          this.options.orientation,
          firstImageVolume
        );
      }
    }

    const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;
    const volumeCenter = firstImageVolume.imageData?.getCenter?.();
    const { viewPlaneNormal } = this.getCamera();

    this._isValidVolumeInputArray(volumeInputArray, FrameOfReferenceUID);

    this._FrameOfReferenceUID = FrameOfReferenceUID;
    volumeInputArray.forEach((volumeInput) => {
      this._addVolumeId(volumeInput.volumeId);
    });

    const volumeActors: ActorEntry[] = [];

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, actorUID, ...rest } = volumeInputArray[i];

      const { actor, slicePlane } = await createVolumeSliceActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents
      );
      if (volumeCenter && viewPlaneNormal) {
        slicePlane.setOrigin(volumeCenter as Point3);
        slicePlane.setNormal(viewPlaneNormal as Point3);
      }

      const uid = actorUID || uuidv4();
      volumeActors.push({
        uid,
        actor,
        referencedId: volumeId,
        slicePlane,
        ...rest,
      });
    }

    this._setVolumeActors(volumeActors);
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    this.initializeColorTransferFunction(volumeInputArray);
    this.updateClippingPlanesForActors(this.getCamera());
    this.getRenderer()?.resetCamera();

    triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
      viewportId: this.id,
      volumeActors,
    });

    if (immediate) {
      this.render();
    }
  }

  public async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${volumeInputArray[0].volumeId} does not exist`
      );
    }

    this._isValidVolumeInputArray(volumeInputArray, this._FrameOfReferenceUID);
    const volumeCenter = firstImageVolume.imageData?.getCenter?.();
    const { viewPlaneNormal } = this.getCamera();

    volumeInputArray.forEach((volumeInput) => {
      this._addVolumeId(volumeInput.volumeId);
    });

    const volumeActors: ActorEntry[] = [];

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, visibility, actorUID, ...rest } = volumeInputArray[i];

      const { actor, slicePlane } = await createVolumeSliceActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents
      );
      if (volumeCenter && viewPlaneNormal) {
        slicePlane.setOrigin(volumeCenter as Point3);
        slicePlane.setNormal(viewPlaneNormal as Point3);
      }

      if (!visibility) {
        actor.setVisibility(false);
      }

      const uid = actorUID || uuidv4();
      volumeActors.push({
        uid,
        actor,
        referencedId: volumeId,
        slicePlane,
        ...rest,
      });
    }

    this.addActors(volumeActors);

    this.initializeColorTransferFunction(volumeInputArray);
    this.updateClippingPlanesForActors(this.getCamera());
    this.getRenderer()?.resetCamera();

    if (immediate) {
      this.render();
    }
  }

  public setBlendMode(
    _blendMode: BlendModes,
    _filterActorUIDs = [],
    immediate = false
  ): void {
    console.warn(
      'VolumeSliceViewport does not support blend modes. Ignoring setBlendMode.'
    );
    if (immediate) {
      this.render();
    }
  }

  public getBlendMode(): BlendModes {
    return BlendModes.COMPOSITE;
  }

  public setSlabThickness(slabThickness: number, filterActorUIDs = []): void {
    console.warn(
      'VolumeSliceViewport renders a single slice. Ignoring setSlabThickness.'
    );
  }

  public resetSlabThickness(): void {
    // No-op for single-slice rendering.
  }

  public resetCamera(options?): boolean {
    const {
      resetPan = true,
      resetZoom = true,
      resetRotation = true,
      resetToCenter = true,
      suppressEvents = false,
      resetOrientation = true,
    } = options || {};
    const { orientation } = this.viewportProperties;
    if (orientation && resetOrientation) {
      this.applyViewOrientation(orientation, false);
    }
    Viewport.prototype.resetCamera.call(this, {
      resetPan,
      resetZoom,
      resetToCenter,
    });

    if (
      resetRotation &&
      MPR_CAMERA_VALUES[this.viewportProperties.orientation] !== undefined
    ) {
      const viewToReset =
        MPR_CAMERA_VALUES[this.viewportProperties.orientation];
      this.setCameraNoEvent({
        viewUp: viewToReset.viewUp,
        viewPlaneNormal: viewToReset.viewPlaneNormal,
      });
    }

    if (!suppressEvents) {
      const eventDetail: EventTypes.CameraResetEventDetail = {
        viewportId: this.id,
        camera: this.getCamera(),
        renderingEngineId: this.renderingEngineId,
        element: this.element,
      };

      triggerEvent(this.element, Events.CAMERA_RESET, eventDetail);
    }
    this.updateClippingPlanesForActors(this.getCamera());
    this.getRenderer()?.resetCameraClippingRange();
    return true;
  }

  protected async updateClippingPlanesForActors(
    updatedCamera: ICamera
  ): Promise<void> {
    const actorEntries = this.getActors();
    const { viewPlaneNormal, focalPoint } = updatedCamera;

    actorEntries.forEach((actorEntry) => {
      if (!isImageActor(actorEntry)) {
        return;
      }

      const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;
      const slicePlane =
        (actorEntry as ActorEntry & { slicePlane?: vtkPlane }).slicePlane ||
        mapper.getSlicePlane?.();

      if (!slicePlane) {
        return;
      }

      slicePlane.setNormal(viewPlaneNormal as Point3);
      slicePlane.setOrigin(focalPoint as Point3);

      triggerEvent(this.element, Events.CLIPPING_PLANES_UPDATED, {
        actorEntry,
        focalPoint,
        vtkPlanes: [slicePlane],
        viewport: this,
      });
    });
  }
}

export default VolumeSliceViewport;
