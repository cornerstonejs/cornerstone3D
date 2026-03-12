import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkImageResliceMapper from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper';
import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import { vec3 } from 'gl-matrix';

import cache from '../cache/cache';
import { Events, BlendModes, ViewportStatus } from '../enums';
import { MPR_CAMERA_VALUES } from '../constants';
import type {
  ActorEntry,
  IVolumeInput,
  Point2,
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
  private _volumeLoadCallbacks = new Map<string, (evt: unknown) => void>();

  constructor(props: ViewportInput) {
    super(props);

    this.canvasToWorld = this.canvasToWorldVolumeSlice;
    this.worldToCanvas = this.worldToCanvasVolumeSlice;
  }

  public setCamera(
    cameraInterface: ICamera,
    storeAsInitialCamera?: boolean
  ): void {
    const adjustedCamera = { ...cameraInterface };

    if (
      cameraInterface.parallelScale !== undefined &&
      (cameraInterface.focalPoint || cameraInterface.position)
    ) {
      const slicePlane = this._getDefaultSlicePlane();
      const viewPlaneNormal =
        cameraInterface.viewPlaneNormal || this.getCamera().viewPlaneNormal;

      if (slicePlane && viewPlaneNormal) {
        const origin = slicePlane.getOrigin() as Point3;
        const normalizedNormal = vec3.normalize(
          vec3.create(),
          viewPlaneNormal as Point3
        ) as Point3;

        if (cameraInterface.focalPoint) {
          const focalPoint = cameraInterface.focalPoint as Point3;
          const toPlane = vec3.subtract(vec3.create(), focalPoint, origin);
          const distance = vec3.dot(toPlane, normalizedNormal);
          const spacing = this.getDefaultImageData()?.spacing;
          const epsilon =
            spacing && spacing.length ? Math.min(...spacing) * 0.01 : 1e-3;
          if (Math.abs(distance) > epsilon) {
            const offset = vec3.scale(
              vec3.create(),
              normalizedNormal,
              distance
            );
            const projectedFocalPoint = vec3.subtract(
              vec3.create(),
              focalPoint,
              offset
            ) as Point3;
            adjustedCamera.focalPoint = projectedFocalPoint;

            const deltaAlongNormal = vec3.scale(
              vec3.create(),
              normalizedNormal,
              -distance
            ) as Point3;

            if (cameraInterface.position) {
              adjustedCamera.position = vec3.add(
                vec3.create(),
                cameraInterface.position as Point3,
                deltaAlongNormal
              ) as Point3;
            } else if (this.getCamera()?.position) {
              adjustedCamera.position = vec3.add(
                vec3.create(),
                this.getCamera().position as Point3,
                deltaAlongNormal
              ) as Point3;
            }
          }
        }
      }
    }

    super.setCamera(adjustedCamera, storeAsInitialCamera);
    this._updateSlicePlaneFromCamera(this.getCamera());
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
      const actorEntry = {
        uid,
        actor,
        referencedId: volumeId,
        slicePlane,
        ...rest,
      } as ActorEntry;

      this._applyResliceProperties(actorEntry);
      volumeActors.push(actorEntry);
    }

    this._setVolumeActors(volumeActors);
    this.viewportStatus = ViewportStatus.PRE_RENDER;

    this.initializeColorTransferFunction(volumeInputArray);
    this.resetCamera({ suppressEvents });
    this._attachStreamingVolumeCallbacks(volumeInputArray);

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
      const actorEntry = {
        uid,
        actor,
        referencedId: volumeId,
        slicePlane,
        ...rest,
      } as ActorEntry;

      this._applyResliceProperties(actorEntry);
      volumeActors.push(actorEntry);
    }

    this.addActors(volumeActors);

    this.initializeColorTransferFunction(volumeInputArray);
    this.resetCamera({ suppressEvents });
    this._attachStreamingVolumeCallbacks(volumeInputArray);

    if (immediate) {
      this.render();
    }
  }

  public setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs = [],
    immediate = false
  ): void {
    let actorEntries = this.getActors();

    if (filterActorUIDs?.length > 0) {
      actorEntries = actorEntries.filter((actorEntry: ActorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      if (!isImageActor(actorEntry)) {
        return;
      }

      const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;
      const slabType = this._mapBlendModeToSlabType(blendMode);
      if (slabType !== undefined) {
        mapper.setSlabType?.(slabType);
        mapper.modified?.();
        actorEntry.blendMode = blendMode;
      }
    });

    if (immediate) {
      this.render();
    }
  }

  public getBlendMode(): BlendModes {
    const actorEntry = this.getDefaultActor();
    if (!actorEntry || !isImageActor(actorEntry)) {
      return BlendModes.COMPOSITE;
    }

    if (actorEntry.blendMode !== undefined) {
      return actorEntry.blendMode;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;
    const slabType = mapper.getSlabType?.();
    return this._mapSlabTypeToBlendMode(slabType);
  }

  public setSlabThickness(slabThickness: number, filterActorUIDs = []): void {
    const clampedThickness = Math.max(0, slabThickness ?? 0);

    let actorEntries = this.getActors();
    if (filterActorUIDs?.length > 0) {
      actorEntries = actorEntries.filter((actorEntry) =>
        filterActorUIDs.includes(actorEntry.uid)
      );
    }

    actorEntries.forEach((actorEntry) => {
      if (!isImageActor(actorEntry)) {
        return;
      }

      const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;
      mapper.setSlabThickness?.(clampedThickness);
      mapper.modified?.();
      actorEntry.slabThickness = clampedThickness;
    });

    this.viewportProperties.slabThickness = clampedThickness;
  }

  public resetSlabThickness(): void {
    this.setSlabThickness(0);
    this.viewportProperties.slabThickness = undefined;
  }

  private _getDefaultSlicePlane(): vtkPlane | undefined {
    const actorEntry = this.getDefaultActor();
    if (!actorEntry || !isImageActor(actorEntry)) {
      return;
    }

    const entryWithPlane = actorEntry as ActorEntry & { slicePlane?: vtkPlane };
    if (entryWithPlane.slicePlane) {
      return entryWithPlane.slicePlane;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;
    return mapper.getSlicePlane?.();
  }

  private _applyResliceProperties(actorEntry: ActorEntry): void {
    if (!isImageActor(actorEntry)) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageResliceMapper;

    if (actorEntry.slabThickness !== undefined) {
      const clampedThickness = Math.max(0, actorEntry.slabThickness);
      mapper.setSlabThickness?.(clampedThickness);
      mapper.modified?.();
      actorEntry.slabThickness = clampedThickness;
    }

    if (actorEntry.blendMode !== undefined) {
      const slabType = this._mapBlendModeToSlabType(actorEntry.blendMode);
      if (slabType !== undefined) {
        mapper.setSlabType?.(slabType);
        mapper.modified?.();
      }
    }
  }

  private _mapBlendModeToSlabType(
    blendMode: BlendModes | undefined
  ): number | undefined {
    switch (blendMode) {
      case BlendModes.MAXIMUM_INTENSITY_BLEND:
        return SlabTypes.MAX;
      case BlendModes.MINIMUM_INTENSITY_BLEND:
        return SlabTypes.MIN;
      case BlendModes.AVERAGE_INTENSITY_BLEND:
        return SlabTypes.MEAN;
      case BlendModes.COMPOSITE:
        return SlabTypes.MEAN;
      case BlendModes.LABELMAP_EDGE_PROJECTION_BLEND:
        return SlabTypes.MAX;
      default:
        return undefined;
    }
  }

  private _mapSlabTypeToBlendMode(slabType: number | undefined): BlendModes {
    switch (slabType) {
      case SlabTypes.MAX:
        return BlendModes.MAXIMUM_INTENSITY_BLEND;
      case SlabTypes.MIN:
        return BlendModes.MINIMUM_INTENSITY_BLEND;
      case SlabTypes.MEAN:
        return BlendModes.AVERAGE_INTENSITY_BLEND;
      default:
        return BlendModes.COMPOSITE;
    }
  }

  private canvasToWorldVolumeSlice = (canvasPos: Point2): Point3 => {
    const renderer = this.getRenderer();
    const vtkCamera = this.getVtkActiveCamera();
    const clippingRange = vtkCamera.getClippingRange();
    const distance = vtkCamera.getDistance();
    vtkCamera.setClippingRange(distance, distance + 0.1);

    const devicePixelRatio = window.devicePixelRatio || 1;
    const { width, height } = this.canvas;
    const aspectRatio = width / height;

    const [xMin, yMin, xMax, yMax] =
      renderer.getViewport() as unknown as number[];
    const viewportWidth = xMax - xMin;
    const viewportHeight = yMax - yMin;

    const canvasPosWithDPR = [
      canvasPos[0] * devicePixelRatio,
      canvasPos[1] * devicePixelRatio,
    ];

    const normalizedDisplay = [
      xMin + (canvasPosWithDPR[0] / width) * viewportWidth,
      yMin + (1 - canvasPosWithDPR[1] / height) * viewportHeight,
      0,
    ];

    const projCoords = renderer.normalizedDisplayToProjection(
      normalizedDisplay[0],
      normalizedDisplay[1],
      normalizedDisplay[2]
    );
    const viewCoords = renderer.projectionToView(
      projCoords[0],
      projCoords[1],
      projCoords[2],
      aspectRatio
    );
    const worldCoord = renderer.viewToWorld(
      viewCoords[0],
      viewCoords[1],
      viewCoords[2]
    );

    vtkCamera.setClippingRange(clippingRange[0], clippingRange[1]);

    return [worldCoord[0], worldCoord[1], worldCoord[2]];
  };

  private worldToCanvasVolumeSlice = (worldPos: Point3): Point2 => {
    const renderer = this.getRenderer();
    const vtkCamera = this.getVtkActiveCamera();
    const clippingRange = vtkCamera.getClippingRange();
    const distance = vtkCamera.getDistance();
    vtkCamera.setClippingRange(distance, distance + 0.1);

    const { width, height } = this.canvas;
    const aspectRatio = width / height;

    const [xMin, yMin, xMax, yMax] =
      renderer.getViewport() as unknown as number[];
    const viewportWidth = xMax - xMin;
    const viewportHeight = yMax - yMin;

    const viewCoords = renderer.worldToView(
      worldPos[0],
      worldPos[1],
      worldPos[2]
    );

    const projCoords = renderer.viewToProjection(
      viewCoords[0],
      viewCoords[1],
      viewCoords[2],
      aspectRatio
    );

    const normalizedDisplay = renderer.projectionToNormalizedDisplay(
      projCoords[0],
      projCoords[1],
      projCoords[2]
    );

    const canvasNormalizedX = (normalizedDisplay[0] - xMin) / viewportWidth;
    const canvasNormalizedY = (normalizedDisplay[1] - yMin) / viewportHeight;

    const canvasX = canvasNormalizedX * width;
    const canvasY = (1 - canvasNormalizedY) * height;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasCoordWithDPR = [
      canvasX / devicePixelRatio,
      canvasY / devicePixelRatio,
    ] as Point2;

    vtkCamera.setClippingRange(clippingRange[0], clippingRange[1]);

    return canvasCoordWithDPR;
  };

  private _attachStreamingVolumeCallbacks(
    volumeInputArray: IVolumeInput[]
  ): void {
    volumeInputArray.forEach(({ volumeId }) => {
      const imageVolume = cache.getVolume(volumeId);
      const loadStatus = imageVolume?.loadStatus as
        | { callbacks?: Array<(...args: unknown[]) => void>; loading?: boolean }
        | undefined;

      if (!loadStatus?.callbacks) {
        return;
      }

      const existingCallback = this._volumeLoadCallbacks.get(volumeId);
      if (existingCallback) {
        loadStatus.callbacks = loadStatus.callbacks.filter(
          (cb) => cb !== existingCallback
        );
      }

      const callback = () => {
        this.render();
      };

      loadStatus.callbacks.push(callback);
      this._volumeLoadCallbacks.set(volumeId, callback);

      if (!loadStatus.loading && typeof imageVolume?.load === 'function') {
        imageVolume.load(() => {});
      }
    });
  }

  private _updateSlicePlaneFromCamera(updatedCamera: ICamera): void {
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
    });
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
    this._updateSlicePlaneFromCamera(updatedCamera);
  }
}

export default VolumeSliceViewport;
