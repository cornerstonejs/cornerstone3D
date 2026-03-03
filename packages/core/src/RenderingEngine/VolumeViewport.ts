import { mat4, vec2, vec3 } from 'gl-matrix';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import cache from '../cache/cache';
import { EPSILON, MPR_CAMERA_VALUES, RENDERING_DEFAULTS } from '../constants';
import {
  BlendModes,
  InterpolationType,
  OrientationAxis,
  Events,
} from '../enums';
import { getShouldUseCPURendering } from '../init';
import type {
  ICamera,
  IImageData,
  IImageVolume,
  IVolumeInput,
  OrientationVectors,
  Point2,
  Point3,
  EventTypes,
  ViewReference,
  ViewReferenceSpecifier,
  VolumeViewportProperties,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import { actorIsA, isImageActor } from '../utilities/actorCheck';
import getClosestImageId from '../utilities/getClosestImageId';
import getSliceRange from '../utilities/getSliceRange';
import getSpacingInNormalDirection from '../utilities/getSpacingInNormalDirection';
import getVoiFromSigmoidRGBTransferFunction from '../utilities/getVoiFromSigmoidRGBTransferFunction';
import snapFocalPointToSlice from '../utilities/snapFocalPointToSlice';
import triggerEvent from '../utilities/triggerEvent';
import getTargetVolumeAndSpacingInNormalDir from '../utilities/getTargetVolumeAndSpacingInNormalDir';

import BaseVolumeViewport from './BaseVolumeViewport';
import setDefaultVolumeVOI from './helpers/setDefaultVolumeVOI';
import { setTransferFunctionNodes } from '../utilities/transferFunctionUtils';
import type { ImageActor } from '../types/IActor';
import getImageSliceDataForVolumeViewport from '../utilities/getImageSliceDataForVolumeViewport';
import { transformCanvasToIJK } from '../utilities/transformCanvasToIJK';
import { transformIJKToCanvas } from '../utilities/transformIJKToCanvas';
import getVolumeViewportScrollInfo from '../utilities/getVolumeViewportScrollInfo';
import {
  calculateCameraPosition,
  getCameraVectors,
} from './helpers/getCameraVectors';
import {
  VolumeCPUActorMapper,
  VolumeGPUActorMapper,
} from './PlanarActorMapper';
import type IVolumeActorMapper from './PlanarActorMapper/IVolumeActorMapper';
import type { VolumeActorMapperContext } from './PlanarActorMapper/VolumeActorMapperContext';

type VolumeViewportScrollOptions = {
  volumeId?: string;
  scrollSlabs?: boolean;
};

/**
 * An object representing a VolumeViewport. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use addVolumesToViewports
 * which will add volumes to the specified viewports.
 */
class VolumeViewport extends BaseVolumeViewport {
  private _useAcquisitionPlaneForViewPlane = false;
  private readonly gpuActorMapper: IVolumeActorMapper;
  private readonly cpuActorMapper: IVolumeActorMapper;
  private cpuVolumeIds: string[] = [];
  private readonly cpuVolumes = new Map<string, IImageVolume>();
  private cpuBlendMode: BlendModes = BlendModes.COMPOSITE;
  private cpuDebug = {
    pipelineSelected: false,
    setVolumes: false,
    customRenderHit: false,
  };
  private cpuCamera: ICamera = {
    viewUp: [0, -1, 0],
    viewPlaneNormal: [0, 0, -1],
    focalPoint: [0, 0, 0],
    position: [0, 0, 1],
    parallelProjection: true,
    parallelScale: 1,
    viewAngle: 90,
    flipHorizontal: false,
    flipVertical: false,
  };
  private logCPU(message: string, payload?: unknown): void {
    if (payload !== undefined) {
      console.info(`[VolumeViewport:${this.id}] [CPU] ${message}`, payload);
      return;
    }

    console.info(`[VolumeViewport:${this.id}] [CPU] ${message}`);
  }

  public static get useCustomRenderingPipeline(): boolean {
    return getShouldUseCPURendering();
  }

  constructor(props: ViewportInput) {
    super(props);
    this.gpuActorMapper = new VolumeGPUActorMapper(
      this.createVolumeActorMapperContext()
    );
    this.cpuActorMapper = new VolumeCPUActorMapper(
      this.createVolumeActorMapperContext()
    );

    if (this.useCPURendering) {
      if (!this.cpuDebug.pipelineSelected) {
        this.cpuDebug.pipelineSelected = true;
        this.logCPU('CPU rendering pipeline selected');
      }

      this.worldToCanvas = this.worldToCanvasCPU;
      this.canvasToWorld = this.canvasToWorldCPU;

      const { orientation } = this.options;
      if (orientation && orientation !== OrientationAxis.ACQUISITION) {
        if (typeof orientation === 'string' && MPR_CAMERA_VALUES[orientation]) {
          const { viewPlaneNormal, viewUp } = MPR_CAMERA_VALUES[orientation];
          this.cpuCamera = {
            ...this.cpuCamera,
            viewPlaneNormal: [...viewPlaneNormal] as Point3,
            viewUp: [...viewUp] as Point3,
          };
        } else if (typeof orientation !== 'string') {
          this.cpuCamera = {
            ...this.cpuCamera,
            viewPlaneNormal: [...orientation.viewPlaneNormal] as Point3,
            viewUp: [...orientation.viewUp] as Point3,
          };
        }
        if (typeof orientation === 'string') {
          this.viewportProperties.orientation = orientation;
        }
      } else {
        this._useAcquisitionPlaneForViewPlane = true;
      }

      return;
    }

    const { orientation } = this.options;
    // if the camera is set to be acquisition axis then we need to skip
    // it for now until the volume is set
    if (orientation && orientation !== OrientationAxis.ACQUISITION) {
      this.applyViewOrientation(orientation);
      return;
    }

    this._useAcquisitionPlaneForViewPlane = true;
  }

  private createVolumeActorMapperContext(): VolumeActorMapperContext {
    return {
      setVolumesBase: (volumeInputArray, immediate, suppressEvents) =>
        super.setVolumes(volumeInputArray, immediate, suppressEvents),
      addVolumesBase: (volumeInputArray, immediate, suppressEvents) =>
        super.addVolumes(volumeInputArray, immediate, suppressEvents),
      getActors: () => this.getActors(),
      render: () => this.render(),
      getCamera: () => this.getCamera(),
      setCamera: (camera) => this.setCamera(camera),
      getVolumeViewportScrollInfo: (volumeId, useSlabThickness = false) =>
        getVolumeViewportScrollInfo(this, volumeId, useSlabThickness),
      updateClippingPlanesForActors: (camera) =>
        this.updateClippingPlanesForActors(camera),
      triggerCameraModifiedEventIfNecessary: (previousCamera, updatedCamera) =>
        this.triggerCameraModifiedEventIfNecessary(
          previousCamera,
          updatedCamera
        ),
      setOrientationOfClippingPlanes: (
        vtkPlanes,
        slabThickness,
        viewPlaneNormal,
        focalPoint
      ) =>
        this.setOrientationOfClippingPlanes(
          vtkPlanes,
          slabThickness,
          viewPlaneNormal,
          focalPoint
        ),
      getSlicePlaneCoordinates: () => this.getSlicePlaneCoordinates(),
      setCPUVolumes: (volumeInputArray, append, suppressEvents) =>
        this.setCPUVolumes(volumeInputArray, append, suppressEvents),
      getViewportBlendMode: () => this.cpuBlendMode,
      setViewportBlendMode: (blendMode) => {
        this.cpuBlendMode = blendMode;
      },
      setViewportSlabThickness: (slabThickness) => {
        this.viewportProperties.slabThickness = slabThickness;
      },
      getRenderDefaultSlabThickness: () =>
        RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
      getCanvas: () => this.getCanvas(),
      getCPUPrimaryVolume: (volumeId) => this.getCPUPrimaryVolume(volumeId),
      getCPUCameraBasis: (camera) => this.getCPUCameraBasis(camera),
      getViewportInterpolationType: () =>
        this.viewportProperties.interpolationType,
      getViewportVOILUTFunction: () => this.viewportProperties.VOILUTFunction,
      getViewportVOIRange: () => this.viewportProperties.voiRange,
      getViewportInvert: () => this.viewportProperties.invert === true,
      getViewportSlabThickness: () => this.viewportProperties.slabThickness,
      fillCanvasWithBackgroundColor: () => {
        const renderingEngine = this.getRenderingEngine();
        if (renderingEngine) {
          renderingEngine.fillCanvasWithBackgroundColor(
            this.canvas,
            this.options.background
          );
        }
      },
      logCPU: (message, payload) => this.logCPU(message, payload),
      getIntensityFromWorldBase: (point) => super.getIntensityFromWorld(point),
    };
  }

  private getActiveVolumeActorMapper(): IVolumeActorMapper {
    return this.useCPURendering ? this.cpuActorMapper : this.gpuActorMapper;
  }

  private getCPUPrimaryVolume(volumeId?: string): IImageVolume | undefined {
    if (volumeId && this.cpuVolumes.has(volumeId)) {
      return this.cpuVolumes.get(volumeId);
    }

    if (!this.cpuVolumeIds.length) {
      return;
    }

    return this.cpuVolumes.get(this.cpuVolumeIds[0]);
  }

  private async setCPUVolumes(
    volumeInputArray: IVolumeInput[],
    append = false,
    _suppressEvents = false
  ): Promise<void> {
    if (!append) {
      this.cpuVolumes.clear();
      this.cpuVolumeIds = [];
    }

    for (const volumeInput of volumeInputArray) {
      const imageVolume = cache.getVolume(volumeInput.volumeId);
      if (!imageVolume) {
        throw new Error(
          `imageVolume with id: ${volumeInput.volumeId} does not exist`
        );
      }

      this.cpuVolumes.set(imageVolume.volumeId, imageVolume);
      if (!this.cpuVolumeIds.includes(imageVolume.volumeId)) {
        this.cpuVolumeIds.push(imageVolume.volumeId);
      }
    }

    const primaryVolume = this.getCPUPrimaryVolume();
    if (!primaryVolume) {
      return;
    }

    if (!this.cpuDebug.setVolumes) {
      this.cpuDebug.setVolumes = true;
      this.logCPU('CPU volume set', {
        volumeId: primaryVolume.volumeId,
        dimensions: primaryVolume.dimensions,
        spacing: primaryVolume.spacing,
      });
    }

    if (!this.viewportProperties.voiRange) {
      if (this.isCPUVolumePTPrescaled(primaryVolume)) {
        this.viewportProperties.voiRange = { lower: 0, upper: 5 };
      } else {
        const [lower, upper] = primaryVolume.voxelManager.getRange();
        if (Number.isFinite(lower) && Number.isFinite(upper) && upper > lower) {
          this.viewportProperties.voiRange = { lower, upper };
        }
      }
    }

    if (typeof this.viewportProperties.invert !== 'boolean') {
      this.viewportProperties.invert = false;
    }

    if (
      typeof this.viewportProperties.interpolationType === 'undefined' ||
      this.viewportProperties.interpolationType === null
    ) {
      this.viewportProperties.interpolationType = InterpolationType.LINEAR;
    }

    this.resetCamera({ suppressEvents: true });
  }

  private isCPUVolumePTPrescaled(volume: IImageVolume): boolean {
    return volume.metadata?.Modality === 'PT' && volume.isPreScaled === true;
  }

  private getVolumeCornersWorld(volume: IImageVolume): Point3[] {
    const [dx, dy, dz] = volume.dimensions;
    const corners: Point3[] = [
      [0, 0, 0],
      [dx - 1, 0, 0],
      [0, dy - 1, 0],
      [dx - 1, dy - 1, 0],
      [0, 0, dz - 1],
      [dx - 1, 0, dz - 1],
      [0, dy - 1, dz - 1],
      [dx - 1, dy - 1, dz - 1],
    ];

    return corners.map((ijk) => this.cpuIndexToWorld(volume, ijk));
  }

  private cpuIndexToWorld(volume: IImageVolume, ijk: Point3): Point3 {
    const [i, j, k] = ijk;
    const [sx, sy, sz] = volume.spacing;
    const [ox, oy, oz] = volume.origin;
    const row = volume.direction.slice(0, 3) as Point3;
    const col = volume.direction.slice(3, 6) as Point3;
    const scan = volume.direction.slice(6, 9) as Point3;

    return [
      ox + row[0] * sx * i + col[0] * sy * j + scan[0] * sz * k,
      oy + row[1] * sx * i + col[1] * sy * j + scan[1] * sz * k,
      oz + row[2] * sx * i + col[2] * sy * j + scan[2] * sz * k,
    ];
  }

  private cpuWorldToIndexContinuous(
    volume: IImageVolume,
    worldPos: Point3
  ): Point3 {
    const delta = [
      worldPos[0] - volume.origin[0],
      worldPos[1] - volume.origin[1],
      worldPos[2] - volume.origin[2],
    ] as Point3;

    const row = volume.direction.slice(0, 3) as Point3;
    const col = volume.direction.slice(3, 6) as Point3;
    const scan = volume.direction.slice(6, 9) as Point3;

    return [
      vec3.dot(delta, row as Point3) / volume.spacing[0],
      vec3.dot(delta, col as Point3) / volume.spacing[1],
      vec3.dot(delta, scan as Point3) / volume.spacing[2],
    ];
  }

  private getCPUCameraBasis(camera: ICamera): {
    right: Point3;
    up: Point3;
    normal: Point3;
  } {
    const normal = vec3.normalize(
      vec3.create(),
      camera.viewPlaneNormal as Point3
    ) as Point3;
    const rawUp = vec3.normalize(vec3.create(), camera.viewUp as Point3);
    let right = vec3.cross(vec3.create(), rawUp, normal);
    if (vec3.length(right) < EPSILON) {
      right = vec3.cross(vec3.create(), [0, 1, 0], normal);
    }
    right = vec3.normalize(vec3.create(), right) as Point3;
    const up = vec3.normalize(
      vec3.create(),
      vec3.cross(vec3.create(), normal, right)
    ) as Point3;

    if (camera.flipHorizontal) {
      vec3.scale(right, right, -1);
    }

    if (camera.flipVertical) {
      vec3.scale(up, up, -1);
    }

    return { right, up, normal };
  }

  private getCPUSliceRangeInfo(volumeId?: string, useSlabThickness = true) {
    const volume = this.getCPUPrimaryVolume(volumeId);
    if (!volume) {
      return;
    }

    const camera = this.getCamera();
    const { normal } = this.getCPUCameraBasis(camera);
    const corners = this.getVolumeCornersWorld(volume);

    let min = Infinity;
    let max = -Infinity;
    for (const point of corners) {
      const projection = vec3.dot(point as Point3, normal as Point3);
      min = Math.min(min, projection);
      max = Math.max(max, projection);
    }

    const current = vec3.dot(camera.focalPoint as Point3, normal as Point3);
    const slabThickness = this.viewportProperties.slabThickness;
    const spacingInNormalDirection =
      useSlabThickness && slabThickness
        ? slabThickness
        : getSpacingInNormalDirection(volume, normal);
    const spacing = Math.max(spacingInNormalDirection, EPSILON);
    const numScrollSteps = Math.max(0, Math.round((max - min) / spacing));
    const currentStepIndex = Math.max(
      0,
      Math.min(numScrollSteps, Math.round((current - min) / spacing))
    );

    return {
      min,
      max,
      current,
      spacingInNormalDirection: spacing,
      numScrollSteps,
      numberOfSlices: numScrollSteps + 1,
      currentStepIndex,
      camera,
      normal,
    };
  }

  private worldToCanvasCPU = (worldPos: Point3): Point2 => {
    const { width, height } = this.getCanvas();
    const camera = this.getCamera();
    const { right, up } = this.getCPUCameraBasis(camera);
    const focalPoint = camera.focalPoint as Point3;
    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const worldHeight = parallelScale * 2;
    const worldWidth = worldHeight * (width / Math.max(height, 1));
    const delta = vec3.subtract(vec3.create(), worldPos, focalPoint);

    const rightProjection = vec3.dot(delta, right as Point3);
    const upProjection = vec3.dot(delta, up as Point3);

    return [
      ((rightProjection + worldWidth / 2) / worldWidth) * width,
      ((worldHeight / 2 - upProjection) / worldHeight) * height,
    ];
  };

  private canvasToWorldCPU = (
    canvasPos: Point2,
    destPoint?: Point3
  ): Point3 => {
    const { width, height } = this.getCanvas();
    const camera = this.getCamera();
    const { right, up } = this.getCPUCameraBasis(camera);
    const focalPoint = camera.focalPoint as Point3;
    const parallelScale = Math.max(camera.parallelScale ?? 1, EPSILON);
    const worldHeight = parallelScale * 2;
    const worldWidth = worldHeight * (width / Math.max(height, 1));
    const xOffset = (canvasPos[0] / width - 0.5) * worldWidth;
    const yOffset = (0.5 - canvasPos[1] / height) * worldHeight;
    const point = destPoint || ([0, 0, 0] as Point3);

    point[0] = focalPoint[0] + right[0] * xOffset + up[0] * yOffset;
    point[1] = focalPoint[1] + right[1] * xOffset + up[1] * yOffset;
    point[2] = focalPoint[2] + right[2] * xOffset + up[2] * yOffset;

    return point;
  };

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
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    const volumeId = volumeInputArray[0].volumeId;
    const firstImageVolume = cache.getVolume(volumeId);

    if (!firstImageVolume) {
      throw new Error(`imageVolume with id: ${volumeId} does not exist`);
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

    return this.getActiveVolumeActorMapper().setVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /** Gets the number of slices the volume is broken up into in the camera direction */
  public getNumberOfSlices = (): number => {
    if (this.useCPURendering) {
      return this.getCPUSliceRangeInfo()?.numberOfSlices ?? 0;
    }

    const { numberOfSlices } = getImageSliceDataForVolumeViewport(this) || {};
    return numberOfSlices;
  };

  public getSpacingInNormalDirection(
    volumeId?: string,
    options: {
      viewReference?: Pick<ViewReference, 'viewPlaneNormal'>;
      useSlabThickness?: boolean;
    } = {}
  ): number | undefined {
    const camera = this.getCamera();
    const viewPlaneNormal =
      options.viewReference?.viewPlaneNormal ?? camera.viewPlaneNormal;
    const useSlabThickness = options.useSlabThickness ?? this.useCPURendering;

    if (useSlabThickness) {
      const slabThickness = this.getProperties()?.slabThickness;
      if (slabThickness) {
        return slabThickness;
      }
    }

    if (this.useCPURendering) {
      const volume = this.getCPUPrimaryVolume(volumeId);
      if (!volume) {
        return;
      }

      return getSpacingInNormalDirection(volume, viewPlaneNormal as Point3);
    }

    const { spacingInNormalDirection } = getTargetVolumeAndSpacingInNormalDir(
      this,
      {
        ...camera,
        viewPlaneNormal,
      },
      volumeId,
      useSlabThickness
    );

    return spacingInNormalDirection;
  }

  public scroll(delta?: number, options?: VolumeViewportScrollOptions): void;
  /** @deprecated Use `scroll(delta, { volumeId, scrollSlabs })` instead. */
  public scroll(
    delta?: number,
    volumeId?: string,
    useSlabThickness?: boolean
  ): void;
  public scroll(
    delta = 1,
    optionsOrVolumeId: VolumeViewportScrollOptions | string = {},
    legacyUseSlabThickness = false
  ): void {
    const options =
      typeof optionsOrVolumeId === 'string'
        ? {
            volumeId: optionsOrVolumeId,
            scrollSlabs: legacyUseSlabThickness,
          }
        : optionsOrVolumeId;
    const volumeId = options.volumeId ?? this.getVolumeId();
    const useSlabThickness = options.scrollSlabs ?? false;

    if (!volumeId) {
      return;
    }

    this.getActiveVolumeActorMapper().scroll(volumeId, delta, useSlabThickness);
  }

  public getScrollInfo(
    volumeId: string = this.getVolumeId(),
    useSlabThickness = false
  ) {
    if (!volumeId) {
      return;
    }

    return this.getActiveVolumeActorMapper().getScrollInfo(
      volumeId,
      useSlabThickness
    );
  }

  /**
   * Creates and adds volume actors for all volumes defined in the `volumeInputArray`.
   * For each entry, if a `callback` is supplied, it will be called with the new volume actor as input.
   *
   * @param volumeInputArray - The array of `VolumeInput`s which define the volumes to add.
   * @param immediate - Whether the `Viewport` should be rendered as soon as volumes are added.
   */
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
    return this.getActiveVolumeActorMapper().addVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  public jumpToWorld(worldPos: Point3): boolean {
    let targetWorldPos = worldPos;

    const imageData = this.getImageData();
    if (imageData?.imageData) {
      const bounds = imageData.imageData.getBounds();
      // Ensure the target world position is within the bounds of the image data
      targetWorldPos = [
        Math.max(bounds[0], Math.min(bounds[1], worldPos[0])),
        Math.max(bounds[2], Math.min(bounds[3], worldPos[1])),
        Math.max(bounds[4], Math.min(bounds[5], worldPos[2])),
      ] as Point3;
    }

    const { focalPoint } = this.getCamera();

    const delta: Point3 = [0, 0, 0];
    vec3.sub(delta, targetWorldPos, focalPoint);

    const camera = this.getCamera();
    const normal = camera.viewPlaneNormal;

    const dotProd = vec3.dot(delta, normal);
    const projectedDelta = vec3.fromValues(normal[0], normal[1], normal[2]);

    vec3.scale(projectedDelta, projectedDelta, dotProd);

    if (
      Math.abs(projectedDelta[0]) > 1e-3 ||
      Math.abs(projectedDelta[1]) > 1e-3 ||
      Math.abs(projectedDelta[2]) > 1e-3
    ) {
      const newFocalPoint: Point3 = [0, 0, 0];
      const newPosition: Point3 = [0, 0, 0];

      vec3.add(newFocalPoint, camera.focalPoint, projectedDelta);
      vec3.add(newPosition, camera.position, projectedDelta);

      this.setCamera({
        focalPoint: newFocalPoint,
        position: newPosition,
      });
      this.render();
    }
    return true;
  }

  /**
   * It sets the orientation for the camera, the orientation can be one of the
   * following: axial, sagittal, coronal, acquisition. Use the `Enums.OrientationAxis`
   * to set the orientation. The "acquisition" orientation is the orientation that
   * the volume was acquired in (scan axis).
   *
   * @param orientation - The orientation to set the camera to.
   * @param immediate - Whether the `Viewport` should be rendered as soon as the camera is set.
   */
  public setOrientation(
    orientation: OrientationAxis | OrientationVectors,
    immediate = true,
    suppressEvents = false
  ): void {
    if (this.useCPURendering) {
      let viewPlaneNormal: Point3;
      let viewUp: Point3;

      if (typeof orientation === 'string') {
        if (orientation === OrientationAxis.ACQUISITION) {
          const imageVolume = this.getCPUPrimaryVolume();
          if (imageVolume) {
            viewPlaneNormal = imageVolume.direction
              .slice(6, 9)
              .map((x) => -x) as Point3;
            viewUp = imageVolume.direction.slice(3, 6).map((x) => -x) as Point3;
          } else {
            viewPlaneNormal = [0, 0, -1];
            viewUp = [0, -1, 0];
          }
        } else if (
          orientation === OrientationAxis.AXIAL_REFORMAT ||
          orientation === OrientationAxis.SAGITTAL_REFORMAT ||
          orientation === OrientationAxis.CORONAL_REFORMAT
        ) {
          const baseOrientation =
            orientation === OrientationAxis.AXIAL_REFORMAT
              ? OrientationAxis.AXIAL
              : orientation === OrientationAxis.SAGITTAL_REFORMAT
                ? OrientationAxis.SAGITTAL
                : OrientationAxis.CORONAL;
          ({ viewPlaneNormal, viewUp } = MPR_CAMERA_VALUES[baseOrientation]);
        } else if (
          orientation === OrientationAxis.REFORMAT &&
          this.cpuCamera.viewPlaneNormal &&
          this.cpuCamera.viewUp
        ) {
          viewPlaneNormal = [...this.cpuCamera.viewPlaneNormal] as Point3;
          viewUp = [...this.cpuCamera.viewUp] as Point3;
        } else if (MPR_CAMERA_VALUES[orientation]) {
          ({ viewPlaneNormal, viewUp } = MPR_CAMERA_VALUES[orientation]);
        } else {
          throw new Error(
            `Invalid orientation: ${orientation}. Use Enums.OrientationAxis instead.`
          );
        }

        this.viewportProperties.orientation = orientation;
      } else {
        ({ viewPlaneNormal, viewUp } = orientation);
      }

      this.setCamera({ viewPlaneNormal, viewUp });
      this.resetCamera({ suppressEvents: true, resetOrientation: false });

      if (immediate) {
        this.render();
      }
      return;
    }

    let viewPlaneNormal, viewUp;

    // check if the orientation is a string or an object
    if (typeof orientation === 'string') {
      if (orientation === OrientationAxis.ACQUISITION) {
        // Acquisition orientation is determined from the volume data
        ({ viewPlaneNormal, viewUp } = super._getAcquisitionPlaneOrientation());
      } else if (orientation === OrientationAxis.REFORMAT) {
        // Generic reformat - auto-detect closest orientation
        ({ viewPlaneNormal, viewUp } = getCameraVectors(this, {
          useViewportNormal: true,
        }));
      } else if (
        orientation === OrientationAxis.AXIAL_REFORMAT ||
        orientation === OrientationAxis.SAGITTAL_REFORMAT ||
        orientation === OrientationAxis.CORONAL_REFORMAT
      ) {
        // Extract base orientation from reformat type
        let baseOrientation: OrientationAxis;
        if (orientation === OrientationAxis.AXIAL_REFORMAT) {
          baseOrientation = OrientationAxis.AXIAL;
        } else if (orientation === OrientationAxis.SAGITTAL_REFORMAT) {
          baseOrientation = OrientationAxis.SAGITTAL;
        } else {
          baseOrientation = OrientationAxis.CORONAL;
        }

        // Use viewport normal (for reformat) but specify base orientation (for reference)
        ({ viewPlaneNormal, viewUp } = getCameraVectors(this, {
          useViewportNormal: true,
          orientation: baseOrientation,
        }));
      } else if (MPR_CAMERA_VALUES[orientation]) {
        ({ viewPlaneNormal, viewUp } = MPR_CAMERA_VALUES[orientation]);
      } else {
        throw new Error(
          `Invalid orientation: ${orientation}. Use Enums.OrientationAxis instead.`
        );
      }

      this.setCamera({
        viewPlaneNormal,
        viewUp,
      });

      this.viewportProperties.orientation = orientation;
      // Suppress events to prevent CAMERA_RESET from triggering render before camera is ready
      this.resetCamera({ suppressEvents: true });
    } else {
      ({ viewPlaneNormal, viewUp } = orientation);
      this.applyViewOrientation(orientation, true, suppressEvents);
    }

    if (immediate) {
      this.render();
    }
  }

  protected setCameraClippingRange() {
    const activeCamera = this.getVtkActiveCamera();

    if (!activeCamera) {
      console.warn('No active camera found');
      return;
    }

    if (activeCamera.getParallelProjection()) {
      // which makes more sense. However, in situations like MPR where the camera is
      // oblique, the slab thickness might not be sufficient.
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

  private _setViewPlaneToReformatOrientation(
    orientation: OrientationAxis,
    imageVolume: IImageVolume
  ): void {
    let viewPlaneNormal, viewUp;

    if (imageVolume) {
      const { direction } = imageVolume;
      ({ viewPlaneNormal, viewUp } = calculateCameraPosition(
        direction.slice(0, 3) as Point3,
        direction.slice(3, 6) as Point3,
        direction.slice(6, 9) as Point3,
        orientation
      ));
    } else {
      ({ viewPlaneNormal, viewUp } = this._getAcquisitionPlaneOrientation());
    }

    this.setCamera({
      viewPlaneNormal,
      viewUp,
    });

    this.initialViewUp = viewUp;
    this.resetCamera();
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

    this.initialViewUp = viewUp;
    this.resetCamera();
  }

  /**
   * Gets the blend mode for the volume viewport. If filterActorUIDs is provided,
   * it will return the blend mode for the first matching actor. Otherwise, it returns
   * the blend mode of the first actor.
   *
   * @param filterActorUIDs - Optional array of actor UIDs to filter by
   * @returns The blend mode of the matched actor
   */
  public getBlendMode(filterActorUIDs?: string[]): BlendModes {
    return this.getActiveVolumeActorMapper().getBlendMode(filterActorUIDs);
  }

  /**
   * Sets the blend mode for actors in the volume viewport. Can optionally filter which
   * actors to apply the blend mode to using filterActorUIDs.
   *
   * @param blendMode - The blend mode to set
   * @param filterActorUIDs - Optional array of actor UIDs to filter which actors to update
   * @param immediate - Whether to render the viewport immediately after setting the blend mode
   */
  public setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs = [],
    immediate = false
  ): void {
    this.getActiveVolumeActorMapper().setBlendMode(
      blendMode,
      filterActorUIDs,
      immediate
    );
  }

  public resetCameraForResize = (): boolean => {
    return this.resetCamera({
      resetPan: true,
      resetZoom: true,
      resetToCenter: true,
      resetRotation: false,
      suppressEvents: true,
    });
  };

  /**
   * Reset the camera for the volume viewport
   */
  public resetCamera(options?): boolean {
    const {
      resetPan = true,
      resetZoom = true,
      resetRotation = true,
      resetToCenter = true,
      suppressEvents = false,
      resetOrientation = true,
    } = options || {};

    if (this.useCPURendering) {
      const primaryVolume = this.getCPUPrimaryVolume();
      if (!primaryVolume) {
        return true;
      }

      const previousCamera = this.getCamera();
      const camera = { ...this.getCamera() };

      if (
        resetOrientation &&
        typeof this.viewportProperties.orientation === 'string' &&
        MPR_CAMERA_VALUES[this.viewportProperties.orientation]
      ) {
        const { viewPlaneNormal, viewUp } =
          MPR_CAMERA_VALUES[this.viewportProperties.orientation];
        camera.viewPlaneNormal = [...viewPlaneNormal] as Point3;
        camera.viewUp = [...viewUp] as Point3;
      }

      const centerIJK = [
        (primaryVolume.dimensions[0] - 1) / 2,
        (primaryVolume.dimensions[1] - 1) / 2,
        (primaryVolume.dimensions[2] - 1) / 2,
      ] as Point3;
      const centerWorld = this.cpuIndexToWorld(primaryVolume, centerIJK);

      if (resetPan || resetToCenter) {
        camera.focalPoint = centerWorld;
      }

      const { up, normal } = this.getCPUCameraBasis(camera);
      const corners = this.getVolumeCornersWorld(primaryVolume);
      let minUp = Infinity;
      let maxUp = -Infinity;

      for (const corner of corners) {
        const projection = vec3.dot(corner as Point3, up as Point3);
        minUp = Math.min(minUp, projection);
        maxUp = Math.max(maxUp, projection);
      }

      if (resetZoom) {
        const worldHeight = Math.max(maxUp - minUp, EPSILON);
        camera.parallelScale = (worldHeight / 2) * this.insetImageMultiplier;
      }

      const distance = Math.max(camera.parallelScale ?? 1, 1);
      camera.position = [
        camera.focalPoint[0] + normal[0] * distance,
        camera.focalPoint[1] + normal[1] * distance,
        camera.focalPoint[2] + normal[2] * distance,
      ];

      if (resetRotation) {
        camera.rotation = 0;
      }

      this.cpuCamera = {
        ...this.cpuCamera,
        ...camera,
        parallelProjection: true,
      };

      if (!this.initialCamera || (resetPan && resetZoom && resetToCenter)) {
        this.setInitialCamera(this.getCamera());
        this.setFitToCanvasCamera(this.getCamera());
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

      this.triggerCameraModifiedEventIfNecessary(
        previousCamera,
        this.getCamera()
      );

      return true;
    }

    const { orientation } = this.viewportProperties;
    if (orientation && resetOrientation) {
      this.applyViewOrientation(orientation, false);
    }
    super.resetCamera({ resetPan, resetZoom, resetToCenter });

    const activeCamera = this.getVtkActiveCamera();

    if (activeCamera) {
      this.getActiveVolumeActorMapper().ensureClippingPlanesForActors(
        this.getCamera()
      );
    }

    //Only reset the rotation of the camera if wanted (so we don't reset every time resetCamera is called) and also verify that the viewport has an orientation that we know (sagittal, coronal, axial)
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
    return true;
  }

  public getCamera(): ICamera {
    if (!this.useCPURendering) {
      return super.getCamera();
    }

    return {
      ...this.cpuCamera,
      viewUp: [...(this.cpuCamera.viewUp as Point3)] as Point3,
      viewPlaneNormal: [
        ...(this.cpuCamera.viewPlaneNormal as Point3),
      ] as Point3,
      position: [...(this.cpuCamera.position as Point3)] as Point3,
      focalPoint: [...(this.cpuCamera.focalPoint as Point3)] as Point3,
      rotation: 0,
    };
  }

  public setCamera(
    cameraInterface: ICamera,
    storeAsInitialCamera = false
  ): void {
    if (!this.useCPURendering) {
      super.setCamera(cameraInterface, storeAsInitialCamera);
      return;
    }

    const previousCamera = this.getCamera();
    const mergedCamera = {
      ...this.cpuCamera,
      ...cameraInterface,
      parallelProjection: true,
    };

    if (cameraInterface.flipHorizontal !== undefined) {
      mergedCamera.flipHorizontal = cameraInterface.flipHorizontal;
    }
    if (cameraInterface.flipVertical !== undefined) {
      mergedCamera.flipVertical = cameraInterface.flipVertical;
    }

    if (cameraInterface.viewPlaneNormal) {
      const normalizedViewPlaneNormal = vec3.normalize(
        vec3.create(),
        cameraInterface.viewPlaneNormal as Point3
      ) as Point3;
      mergedCamera.viewPlaneNormal = normalizedViewPlaneNormal;
    }

    if (cameraInterface.viewUp) {
      const normalizedViewUp = vec3.normalize(
        vec3.create(),
        cameraInterface.viewUp as Point3
      ) as Point3;
      mergedCamera.viewUp = normalizedViewUp;
    }

    this.cpuCamera = mergedCamera;

    if (storeAsInitialCamera) {
      this.setInitialCamera(this.cpuCamera);
    }

    this.triggerCameraModifiedEventIfNecessary(
      previousCamera,
      this.getCamera()
    );
  }

  public getPan(initialCamera = this.initialCamera): Point2 {
    if (!this.useCPURendering) {
      return super.getPan(initialCamera);
    }

    if (!initialCamera) {
      return [0, 0];
    }

    const zero3 = this.canvasToWorldCPU([0, 0]);
    const initialCanvasFocal = this.worldToCanvasCPU(
      vec3.subtract(
        [0, 0, 0],
        initialCamera.focalPoint as Point3,
        zero3
      ) as Point3
    );
    const currentCanvasFocal = this.worldToCanvasCPU(
      vec3.subtract(
        [0, 0, 0],
        this.cpuCamera.focalPoint as Point3,
        zero3
      ) as Point3
    );

    return vec2.subtract(
      [0, 0],
      initialCanvasFocal,
      currentCanvasFocal
    ) as Point2;
  }

  public setPan(pan: Point2, storeAsInitialCamera = false): void {
    if (!this.useCPURendering) {
      super.setPan(pan, storeAsInitialCamera);
      return;
    }

    const previousCamera = this.getCamera();
    const { focalPoint, position } = previousCamera;
    const zero3 = this.canvasToWorldCPU([0, 0]);
    const delta2 = vec2.subtract([0, 0], pan, this.getPan());

    if (
      Math.abs(delta2[0]) < 1 &&
      Math.abs(delta2[1]) < 1 &&
      !storeAsInitialCamera
    ) {
      return;
    }

    const delta = vec3.subtract(
      vec3.create(),
      this.canvasToWorldCPU(delta2 as Point2),
      zero3
    );
    const newFocal = vec3.subtract(vec3.create(), focalPoint, delta);
    const newPosition = vec3.subtract(vec3.create(), position, delta);

    this.setCamera(
      {
        ...previousCamera,
        focalPoint: newFocal as Point3,
        position: newPosition as Point3,
      },
      storeAsInitialCamera
    );
  }

  public getZoom(compareCamera = this.initialCamera): number {
    if (!this.useCPURendering) {
      return super.getZoom(compareCamera);
    }

    if (!compareCamera) {
      return 1;
    }

    const initialParallelScale = compareCamera.parallelScale ?? 1;
    const currentParallelScale = this.cpuCamera.parallelScale ?? 1;
    return initialParallelScale / Math.max(currentParallelScale, EPSILON);
  }

  public setZoom(value: number, storeAsInitialCamera = false): void {
    if (!this.useCPURendering) {
      super.setZoom(value, storeAsInitialCamera);
      return;
    }

    const camera = this.getCamera();
    const initialParallelScale = this.initialCamera?.parallelScale ?? 1;
    const parallelScale = initialParallelScale / Math.max(value, EPSILON);

    this.setCamera(
      {
        ...camera,
        parallelScale,
      },
      storeAsInitialCamera
    );
  }

  public getImageData(volumeId?: string): IImageData | undefined {
    if (!this.useCPURendering) {
      return super.getImageData(volumeId);
    }

    const volume = this.getCPUPrimaryVolume(volumeId);
    if (!volume) {
      return;
    }

    const imageData = {
      getDimensions: () => volume.dimensions,
      getSpacing: () => volume.spacing,
      getOrigin: () => volume.origin,
      getDirection: () => volume.direction,
      worldToIndex: (worldPos: Point3) =>
        this.cpuWorldToIndexContinuous(volume, worldPos),
      indexToWorld: (ijk: Point3) => this.cpuIndexToWorld(volume, ijk),
      getBounds: () => {
        const corners = this.getVolumeCornersWorld(volume);
        const xValues = corners.map((point) => point[0]);
        const yValues = corners.map((point) => point[1]);
        const zValues = corners.map((point) => point[2]);
        return [
          Math.min(...xValues),
          Math.max(...xValues),
          Math.min(...yValues),
          Math.max(...yValues),
          Math.min(...zValues),
          Math.max(...zValues),
        ];
      },
    };

    return {
      dimensions: volume.dimensions,
      spacing: volume.spacing,
      origin: volume.origin,
      direction: volume.direction,
      imageData: imageData as unknown as IImageData['imageData'],
      metadata: {
        Modality: volume.metadata?.Modality,
        FrameOfReferenceUID: volume.metadata?.FrameOfReferenceUID,
      },
      get scalarData() {
        return volume.voxelManager?.getScalarData();
      },
      scaling: volume.scaling,
      hasPixelSpacing: volume.hasPixelSpacing,
      voxelManager: volume.voxelManager,
    };
  }

  public getVolumeId(specifier?: ViewReferenceSpecifier): string | undefined {
    if (!this.useCPURendering) {
      return super.getVolumeId(specifier);
    }

    if (!this.cpuVolumeIds.length) {
      return;
    }

    if (!specifier?.volumeId) {
      return this.cpuVolumeIds[0];
    }

    return this.cpuVolumes.has(specifier.volumeId)
      ? specifier.volumeId
      : undefined;
  }

  public getViewReferenceId(
    specifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    if (!this.useCPURendering) {
      return super.getViewReferenceId(specifier);
    }

    let { volumeId, sliceIndex } = specifier;
    volumeId ||= this.getVolumeId(specifier);

    if (!volumeId) {
      return;
    }

    sliceIndex ??= this.getSliceIndex();
    const { viewPlaneNormal } = this.getCamera();
    const querySeparator = volumeId.includes('?') ? '&' : '?';
    const formattedNormal = viewPlaneNormal.map((v) => v.toFixed(3)).join(',');

    return `volumeId:${volumeId}${querySeparator}sliceIndex=${sliceIndex}&viewPlaneNormal=${formattedNormal}`;
  }

  public hasVolumeId(volumeId: string): boolean {
    if (!this.useCPURendering) {
      return super.hasVolumeId(volumeId);
    }

    return this.cpuVolumes.has(volumeId);
  }

  public getAllVolumeIds(): string[] {
    if (!this.useCPURendering) {
      return super.getAllVolumeIds();
    }

    return [...this.cpuVolumeIds];
  }

  public getProperties = (
    _volumeId?: string
  ): VolumeViewportProperties | undefined => {
    if (!this.useCPURendering) {
      const actorEntries = this.getActors();
      if (!actorEntries?.length) {
        return;
      }

      const volumeId = _volumeId ?? actorEntries[0].referencedId;
      const volumeActorEntry = actorEntries.find(
        (actorEntry) => actorEntry.referencedId === volumeId
      );

      if (!volumeActorEntry) {
        return;
      }

      const volume = cache.getVolume(volumeId);
      if (!volume) {
        return null;
      }

      const {
        colormap: latestColormap,
        VOILUTFunction,
        interpolationType,
        invert,
        slabThickness,
        preset,
      } = this.viewportProperties;

      const volumeActor = volumeActorEntry.actor as vtkVolume;
      const cfun = volumeActor.getProperty().getRGBTransferFunction(0);
      const [lower, upper] =
        this.viewportProperties?.VOILUTFunction === 'SIGMOID'
          ? getVoiFromSigmoidRGBTransferFunction(cfun)
          : cfun.getRange();
      const volumeColormap = (
        this as unknown as { getColormap?: (volumeId?: string) => unknown }
      ).getColormap?.(volumeId);
      const colormap =
        volumeId && volumeColormap ? volumeColormap : latestColormap;

      return {
        colormap,
        voiRange: { lower, upper },
        VOILUTFunction,
        interpolationType,
        invert,
        slabThickness,
        preset,
        sharpening: (this as unknown as { sharpening?: number }).sharpening,
        smoothing: (this as unknown as { smoothing?: number }).smoothing,
      };
    }

    const volume = this.getCPUPrimaryVolume(_volumeId);
    const voiRange =
      this.viewportProperties.voiRange ??
      (volume
        ? (() => {
            const [lower, upper] = volume.voxelManager.getRange();
            return { lower, upper };
          })()
        : undefined);

    return {
      ...this.viewportProperties,
      voiRange,
      invert: this.viewportProperties.invert ?? false,
      interpolationType:
        this.viewportProperties.interpolationType ?? InterpolationType.LINEAR,
      slabThickness: this.viewportProperties.slabThickness,
    };
  };

  public setProperties(
    {
      voiRange,
      VOILUTFunction,
      invert,
      interpolationType,
      slabThickness,
      orientation,
    }: VolumeViewportProperties = {},
    volumeId?: string,
    suppressEvents = false
  ): void {
    if (!this.useCPURendering) {
      super.setProperties(
        {
          voiRange,
          VOILUTFunction,
          invert,
          interpolationType,
          slabThickness,
          orientation,
        },
        volumeId,
        suppressEvents
      );
      return;
    }

    if (voiRange) {
      this.viewportProperties.voiRange = voiRange;
    }

    if (VOILUTFunction !== undefined) {
      this.viewportProperties.VOILUTFunction = VOILUTFunction;
    }

    if (typeof invert === 'boolean') {
      this.viewportProperties.invert = invert;
    }

    if (interpolationType !== undefined) {
      this.viewportProperties.interpolationType = interpolationType;
    }

    if (typeof slabThickness === 'number') {
      this.setSlabThickness(slabThickness);
    }

    if (orientation !== undefined) {
      this.viewportProperties.orientation = orientation;
    }

    if (!suppressEvents && (voiRange || typeof invert === 'boolean')) {
      const volume = this.getCPUPrimaryVolume(volumeId);
      const eventDetail: EventTypes.VoiModifiedEventDetail = {
        viewportId: this.id,
        range: this.viewportProperties.voiRange,
        volumeId: volume?.volumeId,
        VOILUTFunction: this.viewportProperties.VOILUTFunction,
        invert: this.viewportProperties.invert,
      };

      triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
    }

    this.render();
  }

  public getIntensityFromWorld(point: Point3): number {
    return this.getActiveVolumeActorMapper().getIntensityFromWorld(point);
  }

  public customRenderViewportToCanvas = () => {
    if (!this.useCPURendering) {
      throw new Error(
        'Custom cpu rendering pipeline should only be hit in CPU rendering mode'
      );
    }

    if (!this.cpuDebug.customRenderHit) {
      this.cpuDebug.customRenderHit = true;
      this.logCPU('Entered customRenderViewportToCanvas CPU route');
    }

    this.getActiveVolumeActorMapper().renderToCanvas();

    return {
      canvas: this.canvas,
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      viewportStatus: this.viewportStatus,
    };
  };

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
    this.getActiveVolumeActorMapper().setSlabThickness(
      slabThickness,
      filterActorUIDs
    );
  }

  /**
   * Uses the origin and focalPoint to calculate the slice index.



   * Resets the slab thickness of the actors of the viewport to the default value.
   */
  public resetSlabThickness(): void {
    this.getActiveVolumeActorMapper().resetSlabThickness();
  }

  public isInAcquisitionPlane(): boolean {
    const imageData = this.getImageData();

    if (!imageData) {
      return false;
    }

    const { direction } = imageData;
    const { viewPlaneNormal } = this.getCamera();
    const normalDirection = [direction[6], direction[7], direction[8]];

    const TOLERANCE = 0.99;
    return (
      Math.abs(vec3.dot(viewPlaneNormal, normalDirection as Point3)) > TOLERANCE
    );
  }

  /**
   * Uses the slice range information to compute the current image id index.
   * Note that this may be offset from the origin location, or opposite in
   * direction to the distance from the origin location, as the index is a
   * complete index from minimum to maximum.
   *
   * @returns The slice index in the direction of the view.  This index is in
   * the same position/size/direction as the scroll utility.  That is,
   * ```scroll(dir)```
   * and
   * ```viewport.setView(viewport.getView({sliceIndex: viewport.getCurrentImageIdIndex()+dir}))```
   *
   * have the same affect, excluding end/looping conditions.
   */
  public getCurrentImageIdIndex = (
    volumeId: string = this.getVolumeId(),
    useSlabThickness = true
  ): number => {
    if (this.useCPURendering) {
      return (
        this.getCPUSliceRangeInfo(volumeId, useSlabThickness)
          ?.currentStepIndex ?? 0
      );
    }

    if (!volumeId) {
      return 0;
    }
    const { currentStepIndex } = getVolumeViewportScrollInfo(
      this,
      volumeId,
      useSlabThickness
    );
    return currentStepIndex;
  };

  /**
   * Returns the image index associated with the volume viewport in the current view, the difference
   * between this method and getCurrentImageIdIndex is that this method returns the index of the
   * slice in the volume in view direction so at the top (scrollbar top) of the viewport the index
   * will be 0 and at the bottom (scrollbar bottom) the index will be the number of slices - 1.
   * But the getCurrentImageIdIndex returns the index of current image in the imageIds
   * which is not guaranteed to be the same as the slice index in the view.
   *
   * @returns The image index.
   */
  public getSliceIndex = (): number => {
    if (this.useCPURendering) {
      return this.getCPUSliceRangeInfo()?.currentStepIndex ?? 0;
    }

    const { imageIndex } = getImageSliceDataForVolumeViewport(this) || {};
    return imageIndex;
  };

  /**
   * Returns detailed information about the current slice view in the volume viewport.
   * This method provides comprehensive data about the slice's position, orientation,
   * and dimensions within the volume.
   *
   * @returns An object containing the following properties:
   * @property sliceIndex - The current slice index in the view direction.
   * @property slicePlane - The axis along which the slicing is performed (0 for X, 1 for Y, 2 for Z).
   * @property width - The width of the slice in voxels.
   * @property height - The height of the slice in voxels.
   * @property sliceToIndexMatrix - A 4x4 matrix for transforming from slice coordinates to volume index coordinates.
   * @property indexToSliceMatrix - A 4x4 matrix for transforming from volume index coordinates to slice coordinates.
   *
   * @throws {Error} If the view is oblique or if the slice axis cannot be determined.
   */
  public getSliceViewInfo(): {
    sliceIndex: number;
    slicePlane: number;
    width: number;
    height: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  } {
    const { width: canvasWidth, height: canvasHeight } = this.getCanvas();

    // Get three points from the canvas to help us identify the orientation of
    // the slice. Using canvas width/height to get point far away for each other
    // because points such as (0,0), (1,0) and (0,1) may be converted to the same
    // ijk index when the image is zoomed in.
    const ijkOriginPoint = transformCanvasToIJK(this, [0, 0]);
    const ijkRowPoint = transformCanvasToIJK(this, [canvasWidth - 1, 0]);
    const ijkColPoint = transformCanvasToIJK(this, [0, canvasHeight - 1]);

    // Subtract the points to get the row and column vectors in index space
    const ijkRowVec = vec3.sub(vec3.create(), ijkRowPoint, ijkOriginPoint);
    const ijkColVec = vec3.sub(vec3.create(), ijkColPoint, ijkOriginPoint);
    const ijkSliceVec = vec3.cross(vec3.create(), ijkRowVec, ijkColVec);

    vec3.normalize(ijkRowVec, ijkRowVec);
    vec3.normalize(ijkColVec, ijkColVec);
    vec3.normalize(ijkSliceVec, ijkSliceVec);

    const { dimensions } = this.getImageData();
    const [sx, sy, sz] = dimensions;

    // All eight volume corners in index space
    // prettier-ignore
    const ijkCorners: Point3[] = [
      [     0,        0,        0], // top-left-front
      [sx - 1,        0,        0], // top-right-front
      [     0,   sy - 1,        0], // bottom-left-front
      [sx - 1,   sy - 1,        0], // bottom-right-front
      [     0,        0,   sz - 1], // top-left-back
      [sx - 1,        0,   sz - 1], // top-right-back
      [     0,   sy - 1,   sz - 1], // bottom-left-back
      [sx - 1,   sy - 1,   sz - 1], // bottom-right-back
    ];

    // Project the volume corners onto the canvas
    const canvasCorners = ijkCorners.map((ijkCorner) =>
      transformIJKToCanvas(this, ijkCorner)
    );

    // Calculate the AABB from the corners project onto the canvas
    const canvasAABB = canvasCorners.reduce(
      (aabb, canvasPoint) => {
        aabb.minX = Math.min(aabb.minX, canvasPoint[0]);
        aabb.minY = Math.min(aabb.minY, canvasPoint[1]);
        aabb.maxX = Math.max(aabb.maxX, canvasPoint[0]);
        aabb.maxY = Math.max(aabb.maxY, canvasPoint[1]);

        return aabb;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    // Get the top-left, bottom-right and the diagonal vector of
    // the slice in index space
    const ijkTopLeft = transformCanvasToIJK(this, [
      canvasAABB.minX,
      canvasAABB.minY,
    ]);

    // prettier-ignore
    const sliceToIndexMatrix = mat4.fromValues(
      ijkRowVec[0],   ijkRowVec[1],   ijkRowVec[2],  0,
      ijkColVec[0],   ijkColVec[1],   ijkColVec[2],  0,
     ijkSliceVec[0], ijkSliceVec[1], ijkSliceVec[2],  0,
     ijkTopLeft[0],  ijkTopLeft[1],  ijkTopLeft[2],  1
    );

    const ijkBottomRight = transformCanvasToIJK(this, [
      canvasAABB.maxX,
      canvasAABB.maxY,
    ]);
    const ijkDiagonal = vec3.sub(vec3.create(), ijkBottomRight, ijkTopLeft);

    const indexToSliceMatrix = mat4.invert(mat4.create(), sliceToIndexMatrix);

    const { viewPlaneNormal } = this.getCamera();

    // Check if the view is oblique
    const isOblique =
      viewPlaneNormal.filter((component) => Math.abs(component) > EPSILON)
        .length > 1;

    if (isOblique) {
      throw new Error('getSliceInfo is not supported for oblique views');
    }

    // Find the primary axis
    const sliceAxis = viewPlaneNormal.findIndex(
      (component) => Math.abs(component) > 1 - EPSILON
    );

    if (sliceAxis === -1) {
      throw new Error('Unable to determine slice axis');
    }

    // Dot the diagonal with row/column to find the image width/height
    const sliceWidth = vec3.dot(ijkRowVec, ijkDiagonal) + 1;
    const sliceHeight = vec3.dot(ijkColVec, ijkDiagonal) + 1;

    return {
      sliceIndex: this.getSliceIndex(),
      width: sliceWidth,
      height: sliceHeight,
      slicePlane: sliceAxis,
      sliceToIndexMatrix,
      indexToSliceMatrix,
    };
  }

  /**
   * Retrieves the pixel data for the current slice being displayed in the viewport.
   *
   * Note: this method cannot return the oblique planes pixel data as they
   * are interpolated in the gpu side
   *
   * @returns The pixel data for the current slice, which can be in any of the axial, sagittal
   * or coronal directions
   *
   */
  public getCurrentSlicePixelData() {
    const { voxelManager } = this.getImageData();

    const sliceData = voxelManager.getSliceData(this.getSliceViewInfo());
    return sliceData;
  }

  /**
   * Uses viewport camera and volume actor to decide if the viewport
   * is looking at the volume in the direction of acquisition (imageIds).
   * If so, it uses the origin and focalPoint to find which imageId is
   * currently being viewed.
   *
   * @returns ImageId
   */
  public getCurrentImageId = (): string | undefined => {
    if (this.useCPURendering) {
      const volume = this.getCPUPrimaryVolume();
      if (!volume) {
        return;
      }

      const imageIdIndex = this.getCurrentImageIdIndex(volume.volumeId, true);
      return volume.imageIds[imageIdIndex];
    }

    const actorEntry = this.getDefaultActor();

    if (!actorEntry || !actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const volume = cache.getVolume(this.getVolumeId());

    if (!volume) {
      return;
    }

    const { viewPlaneNormal, focalPoint } = this.getCamera();

    return getClosestImageId(volume, focalPoint, viewPlaneNormal);
  };

  /**
   * Gets a view target, allowing comparison between view positions as well
   * as restoring views later.
   * Add the referenced image id.
   */
  public getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const viewRef = super.getViewReference(viewRefSpecifier);
    if (!viewRef?.volumeId) {
      return;
    }
    const volume = cache.getVolume(viewRef.volumeId);
    viewRef.referencedImageId = getClosestImageId(
      volume,
      viewRef.cameraFocalPoint,
      viewRef.viewPlaneNormal
    );
    return viewRef;
  }
  /**
   * Reset the viewport properties to the default values
   *

   * @param volumeId - Optional volume ID to specify which volume properties to reset.
   * If not provided, it will reset the properties of the default actor.
   *
   * @returns void
   */
  public resetProperties(volumeId?: string): void {
    if (this.useCPURendering) {
      const imageVolume = this.getCPUPrimaryVolume(volumeId);
      if (!imageVolume) {
        throw new Error(`No volume found for the given volumeId: ${volumeId}`);
      }

      const [lower, upper] = imageVolume.voxelManager.getRange();
      this.viewportProperties = {
        ...this.viewportProperties,
        voiRange: { lower, upper },
        VOILUTFunction: this.viewportProperties.VOILUTFunction,
        invert: false,
        interpolationType: InterpolationType.LINEAR,
        slabThickness: undefined,
      };
      this.cpuBlendMode = BlendModes.COMPOSITE;
      this.resetCamera();

      triggerEvent(this.element, Events.VOI_MODIFIED, {
        viewportId: this.id,
        range: { lower, upper },
        volumeId: imageVolume.volumeId,
        VOILUTFunction: this.viewportProperties.VOILUTFunction,
        invert: false,
      });
      return;
    }

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

    const eventDetails = {
      ...super.getVOIModifiedEventDetail(volumeId),
    };

    const resetPan = true;
    const resetZoom = true;
    const resetToCenter = true;
    const resetCameraRotation = true;
    this.resetCamera({
      resetPan,
      resetZoom,
      resetToCenter,
      resetCameraRotation,
    });

    triggerEvent(this.element, Events.VOI_MODIFIED, eventDetails);
  }

  /**
   * Retrieves the clipping planes for the slices in the volume viewport.
   * @returns An array of vtkPlane objects representing the clipping planes, or an array of objects with normal and origin properties if raw is true.
   */
  public getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: {
      normal: Point3;
      origin: Point3;
    }[];
  }[] {
    return this.getActiveVolumeActorMapper().getSlicesClippingPlanes();
  }

  /**
   * Returns an array of 3D coordinates representing the slice plane positions.
   * It starts by the focal point as a reference point on the current slice that
   * the camera is looking at, and then it calculates the slice plane positions
   * by moving the focal point in the direction of the view plane normal back and
   * forward, and snaps them to the slice.
   *
   * @returns An array of Point3 representing the slice plane coordinates.
   */
  public getSlicePlaneCoordinates = (): {
    sliceIndex: number;
    point: Point3;
  }[] => {
    if (this.useCPURendering) {
      const sliceRangeInfo = this.getCPUSliceRangeInfo();
      if (!sliceRangeInfo) {
        return [];
      }

      const { numScrollSteps, currentStepIndex, spacingInNormalDirection } =
        sliceRangeInfo;
      const { focalPoint } = this.getCamera();
      const { normal } = this.getCPUCameraBasis(this.getCamera());
      const focalPoints: { sliceIndex: number; point: Point3 }[] = [];

      for (let index = 0; index <= numScrollSteps; index++) {
        const delta = (index - currentStepIndex) * spacingInNormalDirection;
        focalPoints.push({
          sliceIndex: index,
          point: [
            focalPoint[0] + normal[0] * delta,
            focalPoint[1] + normal[1] * delta,
            focalPoint[2] + normal[2] * delta,
          ],
        });
      }

      return focalPoints;
    }

    const actorEntry = this.getDefaultActor();

    if (!actorEntry?.actor) {
      console.warn('No image data found for calculating vtkPlanes.');
      return [];
    }

    const volumeId = this.getVolumeId();
    const imageVolume = cache.getVolume(volumeId);

    const camera = this.getCamera();
    const { focalPoint, position, viewPlaneNormal } = camera;
    const spacingInNormalDirection = getSpacingInNormalDirection(
      imageVolume,
      viewPlaneNormal
    );
    const sliceRange = getSliceRange(
      actorEntry.actor as vtkVolume,
      viewPlaneNormal,
      focalPoint
    );

    // calculate the number of slices that is possible to visit
    // in the direction of the view back and forward
    const numSlicesBackward = Math.round(
      (sliceRange.current - sliceRange.min) / spacingInNormalDirection
    );

    const numSlicesForward = Math.round(
      (sliceRange.max - sliceRange.current) / spacingInNormalDirection
    );

    const currentSliceIndex = this.getSliceIndex();
    const focalPoints = [];

    for (let i = -numSlicesBackward; i <= numSlicesForward; i++) {
      const { newFocalPoint: point } = snapFocalPointToSlice(
        focalPoint,
        position,
        sliceRange,
        viewPlaneNormal,
        spacingInNormalDirection,
        i
      );

      focalPoints.push({ sliceIndex: currentSliceIndex + i, point });
    }

    return focalPoints;
  };
}

export default VolumeViewport;
