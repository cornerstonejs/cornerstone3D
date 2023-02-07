import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import cache from '../cache';
import ViewportType from '../enums/ViewportType';
import Viewport from './Viewport';
import { createVolumeActor } from './helpers';
import volumeNewImageEventDispatcher, {
  resetVolumeNewImageState,
} from './helpers/volumeNewImageEventDispatcher';
import { loadVolume } from '../loaders/volumeLoader';
import vtkSlabCamera from './vtkClasses/vtkSlabCamera';
import { getShouldUseCPURendering } from '../init';
import type {
  Point2,
  Point3,
  IImageData,
  IVolumeInput,
  ActorEntry,
  FlipDirection,
  VolumeViewportProperties,
} from '../types';
import type { ViewportInput } from '../types/IViewport';
import type IVolumeViewport from '../types/IVolumeViewport';
import { Events, BlendModes, OrientationAxis } from '../enums';
import eventTarget from '../eventTarget';
import { actorIsA, imageIdToURI, triggerEvent } from '../utilities';
import type { vtkSlabCamera as vtkSlabCameraType } from './vtkClasses/vtkSlabCamera';
import { VoiModifiedEventDetail } from '../types/EventTypes';
import { RENDERING_DEFAULTS } from '../constants';

/**
 * Abstract base class for volume viewports. VolumeViewports are used to render
 * 3D volumes from which various orientations can be viewed. Since VolumeViewports
 * use SharedVolumeMappers behind the scene, memory footprint of visualizations
 * of the same volume in different orientations is very small.
 *
 * For setting volumes on viewports you need to use {@link addVolumesToViewports}
 * which will add volumes to the specified viewports.
 */
abstract class BaseVolumeViewport extends Viewport implements IVolumeViewport {
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
      case ViewportType.VOLUME_3D:
        camera.setParallelProjection(true);
        break;
      case ViewportType.PERSPECTIVE:
        camera.setParallelProjection(false);
        break;
      default:
        throw new Error(`Unrecognized viewport type: ${this.type}`);
    }

    this.initializeVolumeNewImageEventDispatcher();
  }

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  private initializeVolumeNewImageEventDispatcher(): void {
    const volumeNewImageHandlerBound = volumeNewImageHandler.bind(this);
    const volumeNewImageCleanUpBound = volumeNewImageCleanUp.bind(this);

    function volumeNewImageHandler(cameraEvent) {
      const { viewportId } = cameraEvent.detail;

      if (viewportId !== this.id || this.isDisabled) {
        return;
      }

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

  protected resetVolumeViewportClippingRange() {
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

  /**
   * Sets the properties for the volume viewport on the volume
   * (if fusion, it sets it for the first volume in the fusion)
   *
   * @param voiRange - Sets the lower and upper voi
   * @param volumeId - The volume id to set the properties for (if undefined, the first volume)
   * @param suppressEvents - If true, the viewport will not emit events
   */
  public setProperties(
    { voiRange }: VolumeViewportProperties = {},
    volumeId?: string,
    suppressEvents = false
  ): void {
    if (volumeId !== undefined && !this.getActor(volumeId)) {
      return;
    }

    const actorEntries = this.getActors();

    if (!actorEntries.length) {
      return;
    }

    let volumeActor;

    if (volumeId) {
      const actorEntry = actorEntries.find((entry: ActorEntry) => {
        return entry.uid === volumeId;
      });

      volumeActor = actorEntry?.actor as vtkVolume;
    }

    // // set it for the first volume (if there are more than one - fusion)
    if (!volumeActor) {
      volumeActor = actorEntries[0].actor as vtkVolume;
      volumeId = actorEntries[0].uid;
    }

    if (!voiRange) {
      return;
    }

    // Todo: later when we have more properties, refactor the setVoiRange code below
    const { lower, upper } = voiRange;
    volumeActor.getProperty().getRGBTransferFunction(0).setRange(lower, upper);

    if (!suppressEvents) {
      const eventDetail: VoiModifiedEventDetail = {
        viewportId: this.id,
        range: voiRange,
        volumeId: volumeId,
      };

      triggerEvent(this.element, Events.VOI_MODIFIED, eventDetail);
    }
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
        referenceId: volumeId,
      });
    }

    this._setVolumeActors(volumeActors);

    triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
      viewportId: this.id,
      volumeActors,
    });

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
    const firstImageVolume = cache.getVolume(volumeInputArray[0].volumeId);

    if (!firstImageVolume) {
      throw new Error(
        `imageVolume with id: ${firstImageVolume.volumeId} does not exist`
      );
    }

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
        // although the actor UID is defined, we need to use the volumeId for the
        // referenceId, since the actor UID is used to reference the actor in the
        // viewport, however, the actor is created from its volumeId
        // and if later we need to grab the referenced volume from cache,
        // we can use the referenceId to get the volume from the cache
        referenceId: volumeId,
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
    console.warn('Method "setOrientation" needs implementation');
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

  public getFrameOfReferenceUID = (): string => {
    return this._FrameOfReferenceUID;
  };

  /**
   * Checks if the viewport has a volume actor with the given volumeId
   * @param volumeId - the volumeId to look for
   * @returns Boolean indicating if the volume is present in the viewport
   */
  public hasVolumeId(volumeId: string): boolean {
    // Note: this assumes that the uid of the volume is the same as the volumeId
    // which is not guaranteed to be the case for SEG.
    const actorEntries = this.getActors();
    return actorEntries.some((actorEntry) => {
      return actorEntry.uid === volumeId;
    });
  }

  /**
   * Returns the image and its properties that is being shown inside the
   * stack viewport. It returns, the image dimensions, image direction,
   * image scalar data, vtkImageData object, metadata, and scaling (e.g., PET suvbw)
   * Note: since the volume viewport supports fusion, to get the
   * image data for a specific volume, use the optional volumeId
   * argument.
   *
   * @param volumeId - The volumeId of the volume to get the image for.
   * @returns IImageData: {dimensions, direction, scalarData, vtkImageData, metadata, scaling}
   */
  public getImageData(volumeId?: string): IImageData | undefined {
    const defaultActor = this.getDefaultActor();
    if (!defaultActor) {
      return;
    }

    const { uid: defaultActorUID } = defaultActor;
    volumeId = volumeId ?? defaultActorUID;

    const actorEntry = this.getActor(volumeId);

    if (!actorIsA(actorEntry, 'vtkVolume')) {
      return;
    }

    const actor = actorEntry.actor;
    const volume = cache.getVolume(volumeId);

    const vtkImageData = actor.getMapper().getInputData();
    return {
      dimensions: vtkImageData.getDimensions(),
      spacing: vtkImageData.getSpacing(),
      origin: vtkImageData.getOrigin(),
      direction: vtkImageData.getDirection(),
      scalarData: vtkImageData.getPointData().getScalars().getData(),
      imageData: actor.getMapper().getInputData(),
      metadata: {
        Modality: volume?.metadata?.Modality,
      },
      scaling: volume?.scaling,
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
     * NOTE: this is necessary because we want the coordinate transformation
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

    vtkCamera.setIsPerformingCoordinateTransformation?.(true);

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

    const worldCoord = openGLRenderWindow.displayToWorld(
      displayCoord[0],
      displayCoord[1],
      0,
      renderer
    );

    vtkCamera.setIsPerformingCoordinateTransformation?.(false);

    return [worldCoord[0], worldCoord[1], worldCoord[2]];
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

    vtkCamera.setIsPerformingCoordinateTransformation?.(true);

    const renderer = this.getRenderer();
    const offscreenMultiRenderWindow =
      this.getRenderingEngine().offscreenMultiRenderWindow;
    const openGLRenderWindow =
      offscreenMultiRenderWindow.getOpenGLRenderWindow();
    const size = openGLRenderWindow.getSize();
    const displayCoord = openGLRenderWindow.worldToDisplay(
      ...worldPos,
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

    vtkCamera.setIsPerformingCoordinateTransformation?.(false);

    return canvasCoordWithDPR;
  };

  /*
   * Checking if the imageURI is in the volumes that are being
   * rendered by the viewport. imageURI is the imageId without the schema
   * for instance for the imageId of wadors:http://..., the http://... is the imageURI.
   * Why we don't check the imageId is because the same image can be shown in
   * another viewport (StackViewport) with a different schema
   *
   * @param imageURI - The imageURI to check
   * @returns True if the imageURI is in the volumes that are being rendered by the viewport
   */
  public hasImageURI = (imageURI: string): boolean => {
    const volumeActors = this.getActors().filter((actorEntry) =>
      actorIsA(actorEntry, 'vtkVolume')
    );

    return volumeActors.some(({ uid }) => {
      const volume = cache.getVolume(uid);

      if (!volume || !volume.imageIds) {
        return false;
      }

      const volumeImageURIs = volume.imageIds.map(imageIdToURI);

      return volumeImageURIs.includes(imageURI);
    });
  };

  /**
   * Reset the camera for the volume viewport
   */
  resetCamera(
    resetPan?: boolean,
    resetZoom?: boolean,
    resetToCenter?: boolean
  ): boolean {
    return super.resetCamera(resetPan, resetZoom, resetToCenter);
  }

  getCurrentImageIdIndex = (): number => {
    throw new Error('Method not implemented.');
  };

  getCurrentImageId = (): string => {
    throw new Error('Method not implemented.');
  };

  getIntensityFromWorld(point: Point3): number {
    throw new Error('Method not implemented.');
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate?: boolean
  ): void {
    throw new Error('Method not implemented.');
  }

  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void {
    throw new Error('Method not implemented.');
  }

  getSlabThickness(): number {
    throw new Error('Method not implemented.');
  }
}

export default BaseVolumeViewport;
