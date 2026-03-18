import { mat4, vec3 } from 'gl-matrix';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import cache from '../cache/cache';
import { EPSILON, MPR_CAMERA_VALUES, RENDERING_DEFAULTS } from '../constants';
import type { BlendModes } from '../enums';
import { OrientationAxis, Events } from '../enums';
import type {
  ActorEntry,
  IImageVolume,
  IVolumeInput,
  OrientationVectors,
  Point3,
  EventTypes,
  ViewReference,
  ViewReferenceSpecifier,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import { actorIsA, isImageActor } from '../utilities/actorCheck';
import getClosestImageId from '../utilities/getClosestImageId';
import getSliceRange from '../utilities/getSliceRange';
import getSpacingInNormalDirection from '../utilities/getSpacingInNormalDirection';
import snapFocalPointToSlice from '../utilities/snapFocalPointToSlice';
import triggerEvent from '../utilities/triggerEvent';

import BaseVolumeViewport from './BaseVolumeViewport';
import setDefaultVolumeVOI from './helpers/setDefaultVolumeVOI';
import { setTransferFunctionNodes } from '../utilities/transferFunctionUtils';
import type { ImageActor } from '../types/IActor';
import getImageSliceDataForVolumeViewport from '../utilities/getImageSliceDataForVolumeViewport';
import { transformCanvasToIJK } from '../utilities/transformCanvasToIJK';
import { transformIJKToCanvas } from '../utilities/transformIJKToCanvas';
import type vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import getVolumeViewportScrollInfo from '../utilities/getVolumeViewportScrollInfo';
import {
  calculateCameraPosition,
  getCameraVectors,
} from './helpers/getCameraVectors';

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
  constructor(props: ViewportInput) {
    super(props);

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

    return super.setVolumes(volumeInputArray, immediate, suppressEvents);
  }

  /** Gets the number of slices the volume is broken up into in the camera direction */
  public getNumberOfSlices = (): number => {
    const { numberOfSlices } = getImageSliceDataForVolumeViewport(this) || {};
    return numberOfSlices;
  };

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
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
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
    return super.addVolumes(volumeInputArray, immediate, suppressEvents);
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
    const actorEntries = this.getActors();
    const actorForBlend =
      filterActorUIDs?.length > 0
        ? actorEntries.find((actorEntry) =>
            filterActorUIDs.includes(actorEntry.uid)
          )
        : actorEntries[0];

    return (
      actorForBlend?.blendMode ||
      // @ts-ignore vtk incorrect typing
      actorForBlend?.actor.getMapper().getBlendMode()
    );
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
    let actorEntries = this.getActors();

    if (filterActorUIDs?.length > 0) {
      actorEntries = actorEntries.filter((actorEntry: ActorEntry) => {
        return filterActorUIDs.includes(actorEntry.uid);
      });
    }

    actorEntries.forEach((actorEntry) => {
      const { actor } = actorEntry;

      const mapper = actor.getMapper();
      // @ts-ignore vtk incorrect typing
      mapper.setBlendMode?.(blendMode);
      actorEntry.blendMode = blendMode;
    });

    if (immediate) {
      this.render();
    }
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
    const { orientation } = this.viewportProperties;
    if (orientation && resetOrientation) {
      this.applyViewOrientation(orientation, false);
    }
    super.resetCamera({ resetPan, resetZoom, resetToCenter });

    const activeCamera = this.getVtkActiveCamera();
    const viewPlaneNormal = activeCamera.getViewPlaneNormal() as Point3;
    const focalPoint = activeCamera.getFocalPoint() as Point3;

    // always add clipping planes for the volume viewport. If a use case
    // arises where we don't want clipping planes, you should use the volume_3d
    // viewport instead.
    const actorEntries = this.getActors();
    actorEntries.forEach((actorEntry) => {
      if (!actorEntry.actor) {
        return;
      }
      const mapper = actorEntry.actor.getMapper() as vtkMapper;
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

    if (filterActorUIDs?.length > 0) {
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
    // reset camera clipping range as well
    this.triggerCameraModifiedEventIfNecessary(currentCamera, currentCamera);
    this.viewportProperties.slabThickness = slabThickness;
  }

  /**
   * Uses the origin and focalPoint to calculate the slice index.



   * Resets the slab thickness of the actors of the viewport to the default value.
   */
  public resetSlabThickness(): void {
    const actorEntries = this.getActors();

    actorEntries.forEach((actorEntry) => {
      if (actorIsA(actorEntry, 'vtkVolume')) {
        actorEntry.slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
      }
    });

    const currentCamera = this.getCamera();
    this.updateClippingPlanesForActors(currentCamera);
    this.triggerCameraModifiedEventIfNecessary(currentCamera, currentCamera);
    this.viewportProperties.slabThickness = undefined;
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
  getSlicesClippingPlanes(): {
    sliceIndex: number;
    planes: {
      normal: Point3;
      origin: Point3;
    }[];
  }[] {
    const focalPoints = this.getSlicePlaneCoordinates();
    const { viewPlaneNormal } = this.getCamera();
    const slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

    return focalPoints.map(({ point, sliceIndex }) => {
      const vtkPlanes = [vtkPlane.newInstance(), vtkPlane.newInstance()];

      this.setOrientationOfClippingPlanes(
        vtkPlanes,
        slabThickness,
        viewPlaneNormal,
        point
      );

      return {
        sliceIndex,
        planes: vtkPlanes.map((plane) => ({
          normal: plane.getNormal(),
          origin: plane.getOrigin(),
        })),
      };
    });
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
