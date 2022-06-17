import { vec3 } from 'gl-matrix';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import cache from '../cache';
import ViewportType from '../enums/ViewportType';
import Viewport from './Viewport';
import { createVolumeActor } from './helpers';
import volumeNewImageEventDispatcher, {
  resetVolumeNewImageState,
} from './helpers/volumeNewImageEventDispatcher';
import { loadVolume } from '../volumeLoader';
import vtkSlabCamera from './vtkClasses/vtkSlabCamera';
import { getShouldUseCPURendering } from '../init';
import transformWorldToIndex from '../utilities/transformWorldToIndex';
import type {
  Point2,
  Point3,
  IImageData,
  IVolumeInput,
  ActorEntry,
  FlipDirection,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import { RENDERING_DEFAULTS } from '../constants';
import { Events, BlendModes } from '../enums';
import eventTarget from '../eventTarget';
import type { vtkSlabCamera as vtkSlabCameraType } from './vtkClasses/vtkSlabCamera';

const EPSILON = 1e-3;

/**
 * An object representing a VolumeViewport. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
class VolumeViewport extends Viewport implements IVolumeViewport {
  useCPURendering = false;
  private _FrameOfReferenceUID: string;

  constructor(props: ViewportInput) {
    super(props);

    this.useCPURendering = getShouldUseCPURendering();

    if (this.useCPURendering) {
      throw new Error(
        'VolumeViewports cannot be used whilst CPU Fallback Rendering is enabled.'
      );
    }

    const renderer = this.getRenderer();

    const camera = vtkSlabCamera.newInstance();
    renderer.setActiveCamera(camera);

    switch (this.type) {
      case ViewportType.ORTHOGRAPHIC:
        camera.setParallelProjection(true);
        break;
      case ViewportType.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;
      default:
        throw new Error(`Unrecognized viewport type: ${this.type}`);
    }

    this.initializeVolumeNewImageEventDispatcher();

    const { sliceNormal, viewUp } = this.defaultOptions.orientation;

    camera.setDirectionOfProjection(
      -sliceNormal[0],
      -sliceNormal[1],
      -sliceNormal[2]
    );
    camera.setViewUpFrom(viewUp);

    this.resetCamera();
  }

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  private initializeVolumeNewImageEventDispatcher(): void {
    const volumeNewImageHandlerBound = volumeNewImageHandler.bind(this);
    const volumeNewImageCleanUpBound = volumeNewImageCleanUp.bind(this);

    function volumeNewImageHandler(cameraEvent) {
      const viewportImageData = this.getImageData();

      if (!viewportImageData) {
        return;
      }

      volumeNewImageEventDispatcher(cameraEvent);
    }

    function volumeNewImageCleanUp(evt) {
      const { viewportId } = evt.detail;

      if (viewportId !== this.id) {
        return;
      }

      this.element.removeEventListener(
        Events.CAMERA_MODIFIED,
        volumeNewImageHandlerBound
      );

      eventTarget.removeEventListener(
        Events.ELEMENT_DISABLED,
        volumeNewImageCleanUpBound
      );

      resetVolumeNewImageState(viewportId);
    }

    this.element.removeEventListener(
      Events.CAMERA_MODIFIED,
      volumeNewImageHandlerBound
    );
    this.element.addEventListener(
      Events.CAMERA_MODIFIED,
      volumeNewImageHandlerBound
    );

    eventTarget.addEventListener(
      Events.ELEMENT_DISABLED,
      volumeNewImageCleanUpBound
    );
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

    const FrameOfReferenceUID = firstImageVolume.metadata.FrameOfReferenceUID;

    await this._isValidVolumeInputArray(volumeInputArray, FrameOfReferenceUID);

    this._FrameOfReferenceUID = FrameOfReferenceUID;

    const volumeActors = [];

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, actorUID, slabThickness } = volumeInputArray[i];

      const actor = await createVolumeActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents
      );

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({
        uid,
        actor,
        slabThickness,
      });
    }

    this._setVolumeActors(volumeActors);

    if (immediate) {
      this.render();
    }
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
    const volumeActors = [];

    await this._isValidVolumeInputArray(
      volumeInputArray,
      this._FrameOfReferenceUID
    );

    // One actor per volume
    for (let i = 0; i < volumeInputArray.length; i++) {
      const { volumeId, visibility, actorUID, slabThickness } =
        volumeInputArray[i];

      const actor = await createVolumeActor(
        volumeInputArray[i],
        this.element,
        this.id,
        suppressEvents
      );

      if (visibility === false) {
        actor.setVisibility(false);
      }

      // We cannot use only volumeId since then we cannot have for instance more
      // than one representation of the same volume (since actors would have the
      // same name, and we don't allow that) AND We cannot use only any uid, since
      // we rely on the volume in the cache for mapper. So we prefer actorUID if
      // it is defined, otherwise we use volumeId for the actor name.
      const uid = actorUID || volumeId;
      volumeActors.push({
        uid,
        actor,
        slabThickness,
      });
    }

    this.addActors(volumeActors);

    if (immediate) {
      // render
      this.render();
    }
  }

  /**
   * It removes the volume actor from the Viewport. If the volume actor is not in
   * the viewport, it does nothing.
   * @param actorUIDs - Array of actor UIDs to remove. In case of simple volume it will
   * be the volume Id, but in case of Segmentation it will be `{volumeId}-{representationType}`
   * since the same volume can be rendered in multiple representations.
   * @param immediate - If true, the Viewport will be rendered immediately
   */
  public removeVolumeActors(actorUIDs: Array<string>, immediate = false): void {
    // Todo: This is actually removeActors
    this.removeActors(actorUIDs);

    if (immediate) {
      this.render();
    }
  }

  private async _isValidVolumeInputArray(
    volumeInputArray: Array<IVolumeInput>,
    FrameOfReferenceUID: string
  ): Promise<boolean> {
    const numVolumes = volumeInputArray.length;

    // Check all other volumes exist and have the same FrameOfReference
    for (let i = 1; i < numVolumes; i++) {
      const volumeInput = volumeInputArray[i];

      const imageVolume = await loadVolume(volumeInput.volumeId);

      if (!imageVolume) {
        throw new Error(
          `imageVolume with id: ${imageVolume.volumeId} does not exist`
        );
      }

      if (FrameOfReferenceUID !== imageVolume.metadata.FrameOfReferenceUID) {
        throw new Error(
          `Volumes being added to viewport ${this.id} do not share the same FrameOfReferenceUID. This is not yet supported`
        );
      }
    }

    return true;
  }

  /**
   * Given a point in world coordinates, return the intensity at that point
   * @param point - The point in world coordinates to get the intensity
   * from.
   * @returns The intensity value of the voxel at the given point.
   */
  public getIntensityFromWorld(point: Point3): number {
    const { actor, uid } = this.getDefaultActor();
    if (!actor.isA('vtkVolume')) {
      return;
    }

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

  /**
   * gets the visible bounds of the viewport in the world coordinate system
   */
  public getBounds(): number[] {
    const renderer = this.getRenderer();
    const bounds = renderer.computeVisiblePropBounds();
    return bounds;
  }

  /**
   * Flip the viewport along the desired axis
   * @param flipDirection - FlipDirection
   */
  public flip(flipDirection: FlipDirection): void {
    super.flip(flipDirection);
  }

  /**
   * Reset the camera for the volume viewport
   */
  public resetCamera(resetPan = true, resetZoom = true): boolean {
    super.resetCamera(resetPan, resetZoom);
    const activeCamera = this.getVtkActiveCamera();
    // Set large numbers to ensure everything is always rendered
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

    const viewPlaneNormal = <Point3>activeCamera.getViewPlaneNormal();
    const focalPoint = <Point3>activeCamera.getFocalPoint();

    const actorEntries = this.getActors();
    actorEntries.forEach((actorEntry) => {
      // we assume that the first two clipping plane of the mapper are always
      // the 'camera' clipping. Add clipping planes only if the actor is
      // a vtkVolume
      if (!actorEntry.actor || !actorEntry.actor.isA('vtkVolume')) {
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

  public getFrameOfReferenceUID = (): string => {
    return this._FrameOfReferenceUID;
  };

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
      const { actor } = actorEntry;

      if (actor.isA('vtkVolume')) {
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
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   *
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(): IImageData | undefined {
    const defaultActor = this.getDefaultActor();

    if (!defaultActor) {
      return;
    }

    const { actor } = defaultActor;
    if (!actor.isA('vtkVolume')) {
      return;
    }

    const vtkImageData = actor.getMapper().getInputData();
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      imageData: actor.getMapper().getInputData(),
      metadata: undefined,
      scaling: undefined,
      hasPixelSpacing: true,
    };
  }

  /**
   * Attaches the volume actors to the viewport.
   *
   * @param volumeActorEntries - The volume actors to add the viewport.
   *
   */
  private _setVolumeActors(volumeActorEntries: Array<ActorEntry>): void {
    this.setActors(volumeActorEntries);
  }

  /**
   * canvasToWorld Returns the world coordinates of the given `canvasPos`
   * projected onto the plane defined by the `Viewport`'s `vtkCamera`'s focal point
   * and the direction of projection.
   *
   * @param canvasPos - The position in canvas coordinates.
   * @returns The corresponding world coordinates.
   * @public
   */
  public canvasToWorld = (canvasPos: Point2): Point3 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    /**
     * NOTE: this is necessary because we want the coordinate trasformation
     * respect to the view plane (plane orthogonal to the camera and passing to
     * the focal point).
     *
     * When vtk.js computes the coordinate transformations, it simply uses the
     * camera matrix (no ray casting).
     *
     * However for the volume viewport the clipping range is set to be
     * (-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE).
     * The clipping range is used in the camera method getProjectionMatrix().
     * The projection matrix is used then for viewToWorld/worldToView methods of
     * the renderer. This means that vkt.js will not return the coordinates of
     * the point on the view plane (i.e. the depth coordinate will correspond
     * to the focal point).
     *
     * Therefore the clipping range has to be set to (distance, distance + 0.01),
     * where now distance is the distance between the camera position and focal
     * point. This is done internally, in our camera customization when the flag
     * isPerformingCoordinateTransformation is set to true.
     */

    vtkCamera.setIsPerformingCoordinateTransformation(true);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasPosWithDPR = [
      canvasPos[0] * devicePixelRatio,
      canvasPos[1] * devicePixelRatio,
    ];
    const displayCoord = [
      canvasPosWithDPR[0] + this.sx,
      canvasPosWithDPR[1] + this.sy,
    ];

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    let worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    vtkCamera.setIsPerformingCoordinateTransformation(false);

    worldCoord = this.applyFlipTx(worldCoord);
    return worldCoord;
  };

  /**
   * Returns the canvas coordinates of the given `worldPos`
   * projected onto the `Viewport`'s `canvas`.
   *
   * @param worldPos - The position in world coordinates.
   * @returns The corresponding canvas coordinates.
   * @public
   */
  public worldToCanvas = (worldPos: Point3): Point2 => {
    const vtkCamera = this.getVtkActiveCamera() as vtkSlabCameraType;

    /**
     * NOTE: this is necessary because we want the coordinate trasformation
     * respect to the view plane (plane orthogonal to the camera and passing to
     * the focal point).
     *
     * When vtk.js computes the coordinate transformations, it simply uses the
     * camera matrix (no ray casting).
     *
     * However for the volume viewport the clipping range is set to be
     * (-RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE, RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE).
     * The clipping range is used in the camera method getProjectionMatrix().
     * The projection matrix is used then for viewToWorld/worldToView methods of
     * the renderer. This means that vkt.js will not return the coordinates of
     * the point on the view plane (i.e. the depth coordinate will corresponded
     * to the focal point).
     *
     * Therefore the clipping range has to be set to (distance, distance + 0.01),
     * where now distance is the distance between the camera position and focal
     * point. This is done internally, in our camera customization when the flag
     * isPerformingCoordinateTransformation is set to true.
     */

    vtkCamera.setIsPerformingCoordinateTransformation(true);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...this.applyFlipTx(worldPos),
      renderer
    );

    // The y axis display coordinates are inverted with respect to canvas coords
    displayCoord[1] = size[1] - displayCoord[1];

    const canvasCoord = <Point2>[
      displayCoord[0] - this.sx,
      displayCoord[1] - this.sy,
    ];

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasCoordWithDPR = <Point2>[
      canvasCoord[0] / devicePixelRatio,
      canvasCoord[1] / devicePixelRatio,
    ];

    vtkCamera.setIsPerformingCoordinateTransformation(false);

    return canvasCoordWithDPR;
  };

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

    if (!index) {
      return;
    }

    const { uid, actor } = this.getDefaultActor();
    if (!actor.isA('vtkVolume')) {
      return;
    }

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
