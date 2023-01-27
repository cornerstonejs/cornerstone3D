import type { vtkCamera } from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import { vec2, vec3 } from 'gl-matrix';
import _cloneDeep from 'lodash.clonedeep';

import Events from '../enums/Events';
import ViewportType from '../enums/ViewportType';
import renderingEngineCache from './renderingEngineCache';
import { triggerEvent, planar, isImageActor, actorIsA } from '../utilities';
import hasNaNValues from '../utilities/hasNaNValues';
import { RENDERING_DEFAULTS } from '../constants';
import type {
  ICamera,
  ActorEntry,
  IRenderingEngine,
  ViewportInputOptions,
  Point2,
  Point3,
  FlipDirection,
  EventTypes,
} from '../types';
import type { ViewportInput, IViewport } from '../types/IViewport';
import type { vtkSlabCamera } from './vtkClasses/vtkSlabCamera';

/**
 * An object representing a single viewport, which is a camera
 * looking into a viewport, and an associated target output `HTMLDivElement`.
 * Viewport is a base class that can be extended to create a specific
 * viewport type. Both VolumeViewport and StackViewport are subclasses
 * of Viewport. Common logic for all viewports is contained in Viewport class
 * which is camera properties/methods, vtk.js actors, and other common
 * logic.
 */
class Viewport implements IViewport {
  /** unique identifier for the viewport */
  readonly id: string;
  /** HTML element in DOM that is used for rendering the viewport */
  readonly element: HTMLDivElement;
  /** an internal canvas that is created on the provided HTML element */
  readonly canvas: HTMLCanvasElement;
  /** RenderingEngine id that the viewport belongs to */
  readonly renderingEngineId: string;
  /** Type of viewport */
  readonly type: ViewportType;
  protected flipHorizontal = false;
  protected flipVertical = false;
  public isDisabled: boolean;

  /** sx of viewport on the offscreen canvas */
  sx: number;
  /** sy of viewport on the offscreen canvas */
  sy: number;
  /** sWidth of viewport on the offscreen canvas */
  sWidth: number;
  /** sHeight of viewport on the offscreen canvas */
  sHeight: number;
  /** a Map containing the actor uid and actors */
  _actors: Map<string, any>;
  /** Default options for the viewport which includes orientation, viewPlaneNormal and backgroundColor */
  readonly defaultOptions: any;
  /** options for the viewport which includes orientation axis and backgroundColor */
  options: ViewportInputOptions;
  private _suppressCameraModifiedEvents = false;
  /** A flag representing if viewport methods should fire events or not */
  readonly suppressEvents: boolean;
  protected hasPixelSpacing = true;
  /** The camera that is initially defined on the reset for
   * the relative pan/zoom
   */
  protected initialCamera: ICamera;

  constructor(props: ViewportInput) {
    this.id = props.id;
    this.renderingEngineId = props.renderingEngineId;
    this.type = props.type;
    this.element = props.element;
    this.canvas = props.canvas;
    this.sx = props.sx;
    this.sy = props.sy;
    this.sWidth = props.sWidth;
    this.sHeight = props.sHeight;
    this._actors = new Map();
    // Set data attributes for render events
    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );

    this.defaultOptions = _cloneDeep(props.defaultOptions);
    this.suppressEvents = props.defaultOptions.suppressEvents
      ? props.defaultOptions.suppressEvents
      : false;
    this.options = _cloneDeep(props.defaultOptions);
    this.isDisabled = false;
  }

  getRotation: () => number;
  getFrameOfReferenceUID: () => string;
  canvasToWorld: (canvasPos: Point2) => Point3;
  worldToCanvas: (worldPos: Point3) => Point2;
  customRenderViewportToCanvas: () => unknown;
  resize: () => void;
  getProperties: () => void;

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  /**
   * Returns the rendering engine driving the `Viewport`.
   *
   * @returns The RenderingEngine instance.
   */
  public getRenderingEngine(): IRenderingEngine {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  /**
   * Returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns The `vtkRenderer` for the `Viewport`.
   */
  public getRenderer() {
    const renderingEngine = this.getRenderingEngine();

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      throw new Error('Rendering engine has been destroyed');
    }

    return renderingEngine.offscreenMultiRenderWindow.getRenderer(this.id);
  }

  /**
   * Renders the `Viewport` using the `RenderingEngine`.
   */
  public render(): void {
    const renderingEngine = this.getRenderingEngine();

    renderingEngine.renderViewport(this.id);
  }

  /**
   * Sets new options and (TODO) applies them.
   *
   * @param options - The viewport options to set.
   * @param immediate - If `true`, renders the viewport after the options are set.
   */
  public setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = <ViewportInputOptions>_cloneDeep(options);

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render();
    }
  }

  /**
   * Resets the options the `Viewport`'s `defaultOptions`
   *
   * @param immediate - If `true`, renders the viewport after the options are reset.
   */
  public reset(immediate = false) {
    this.options = _cloneDeep(this.defaultOptions);

    // TODO When this is needed we need to move the camera position.
    // We can steal some logic from the tools we build to do this.

    if (immediate) {
      this.render();
    }
  }

  /**
   * Flip the viewport on horizontal or vertical axis, this method
   * works with vtk-js backed rendering pipeline.
   *
   * @param flipOptions - Flip options specifying the axis of flip
   * @param flipOptions.flipHorizontal - Flip the viewport on horizontal axis
   * @param flipOptions.flipVertical - Flip the viewport on vertical axis
   */
  protected flip({ flipHorizontal, flipVertical }: FlipDirection): void {
    const imageData = this.getDefaultImageData();

    if (!imageData) {
      return;
    }

    const camera = this.getCamera();
    const { viewPlaneNormal, viewUp, focalPoint, position } = camera;

    const viewRight = vec3.cross(vec3.create(), viewPlaneNormal, viewUp);
    let viewUpToSet = vec3.copy(vec3.create(), viewUp);
    const viewPlaneNormalToSet = vec3.negate(vec3.create(), viewPlaneNormal);

    // for both flip horizontal and vertical we need to move the camera to the
    // other side of the image
    const distance = vec3.distance(position, focalPoint);

    // If the pan has been applied, we need to be able
    // apply the pan back
    const dimensions = imageData.getDimensions();
    const middleIJK = dimensions.map((d) => Math.floor(d / 2));

    const idx = [middleIJK[0], middleIJK[1], middleIJK[2]];
    const centeredFocalPoint = imageData.indexToWorld(idx, vec3.create());

    const resetFocalPoint = this._getFocalPointForResetCamera(
      centeredFocalPoint as Point3,
      camera,
      { resetPan: true, resetToCenter: false }
    );

    const panDir = vec3.subtract(vec3.create(), focalPoint, resetFocalPoint);
    const panValue = vec3.length(panDir);

    const getPanDir = (mirrorVec) => {
      const panDirMirror = vec3.scale(
        vec3.create(),
        mirrorVec,
        2 * vec3.dot(panDir, mirrorVec)
      );
      vec3.subtract(panDirMirror, panDirMirror, panDir);
      vec3.normalize(panDirMirror, panDirMirror);

      return panDirMirror;
    };

    // Flipping horizontal mean that the camera should move
    // to the other side of the image but looking at the
    // same direction and same focal point
    if (flipHorizontal) {
      // we need to apply the pan value to the new focal point but in the direction
      // that is mirrored on the viewUp for the flip horizontal and
      // viewRight for the flip vertical

      // mirror the pan direction based on the viewUp
      const panDirMirror = getPanDir(viewUpToSet);

      // move focal point from the resetFocalPoint to the newFocalPoint
      // based on the panDirMirror and panValue
      const newFocalPoint = vec3.scaleAndAdd(
        vec3.create(),
        resetFocalPoint,
        panDirMirror,
        panValue
      );

      // move the camera position also the same way as the focal point
      const newPosition = vec3.scaleAndAdd(
        vec3.create(),
        newFocalPoint,
        viewPlaneNormalToSet,
        distance
      );

      this.setCamera({
        viewPlaneNormal: viewPlaneNormalToSet as Point3,
        position: newPosition as Point3,
        focalPoint: newFocalPoint as Point3,
      });

      this.flipHorizontal = !this.flipHorizontal;
    }

    // Flipping vertical mean that the camera should negate the view up
    // and also move to the other side of the image but looking at the
    if (flipVertical) {
      viewUpToSet = vec3.negate(viewUpToSet, viewUp);

      // we need to apply the pan value to the new focal point but in the direction
      const panDirMirror = getPanDir(viewRight);

      const newFocalPoint = vec3.scaleAndAdd(
        vec3.create(),
        resetFocalPoint,
        panDirMirror,
        panValue
      );

      const newPosition = vec3.scaleAndAdd(
        vec3.create(),
        newFocalPoint,
        viewPlaneNormalToSet,
        distance
      );

      this.setCamera({
        focalPoint: newFocalPoint as Point3,
        viewPlaneNormal: viewPlaneNormalToSet as Point3,
        viewUp: viewUpToSet as Point3,
        position: newPosition as Point3,
      });

      this.flipVertical = !this.flipVertical;
    }

    this.render();
  }

  private getDefaultImageData(): any {
    const actorEntry = this.getDefaultActor();

    if (actorEntry && isImageActor(actorEntry)) {
      return actorEntry.actor.getMapper().getInputData();
    }
  }

  /**
   * Get the default actor
   * @returns An actor entry.
   */
  public getDefaultActor(): ActorEntry {
    return this.getActors()[0];
  }

  /**
   * Get all the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  public getActors(): Array<ActorEntry> {
    return Array.from(this._actors.values());
  }

  /**
   * Get an actor by its UID
   * @param actorUID - The unique ID of the actor.
   * @returns An ActorEntry object.
   */
  public getActor(actorUID: string): ActorEntry {
    return this._actors.get(actorUID);
  }

  /**
   * Get an actor UID by its index
   * @param index - array index.
   * @returns actorUID
   */
  public getActorUIDByIndex(index: number): string {
    const actor = this.getActors()[index];
    if (actor) {
      return actor.uid;
    }
  }

  /**
   * Get an actor by its index
   * @param index - array index.
   * @returns actorUID
   */
  public getActorByIndex(index: number): ActorEntry {
    return this.getActors()[index];
  }

  /**
   * It removes all actors from the viewport and then adds the actors from the array.
   * @param actors - An array of ActorEntry objects.
   */
  public setActors(actors: Array<ActorEntry>): void {
    this.removeAllActors();
    const resetCameraPanAndZoom = true;
    // when we set the actor we need to reset the camera to initialize the
    // camera focal point with the bounds of the actors.
    this.addActors(actors, resetCameraPanAndZoom);
  }

  /**
   * Remove the actor from the viewport
   * @param actorUID - The unique identifier for the actor.
   */
  _removeActor(actorUID: string): void {
    const actorEntry = this.getActor(actorUID);
    if (!actorEntry) {
      console.warn(`Actor ${actorUID} does not exist for this viewport`);
      return;
    }
    const renderer = this.getRenderer();
    renderer.removeViewProp(actorEntry.actor); // removeActor not implemented in vtk?
    this._actors.delete(actorUID);
  }

  /**
   * Remove the actors with the given UIDs from the viewport
   * @param actorUIDs - An array of actor UIDs to remove.
   */
  public removeActors(actorUIDs: Array<string>): void {
    actorUIDs.forEach((actorUID) => {
      this._removeActor(actorUID);
    });
  }

  /**
   * Add a list of actors (actor entries) to the viewport
   * @param resetCameraPanAndZoom - force reset pan and zoom of the camera,
   *        default value is false.
   * @param actors - An array of ActorEntry objects.
   */
  public addActors(
    actors: Array<ActorEntry>,
    resetCameraPanAndZoom = false
  ): void {
    const renderingEngine = this.getRenderingEngine();
    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      console.warn(
        'Viewport::addActors::Rendering engine has not been initialized or has been destroyed'
      );
      return;
    }

    actors.forEach((actor) => this.addActor(actor));

    // set the clipping planes for the actors
    this.resetCamera(resetCameraPanAndZoom, resetCameraPanAndZoom);
  }

  /**
   * Add an actor to the viewport including its id, its actor and slabThickness
   * if defined
   * @param actorEntry - ActorEntry
   * @param actorEntry.uid - The unique identifier for the actor.
   * @param actorEntry.actor - The volume actor.
   * @param actorEntry.slabThickness - The slab thickness.
   */
  public addActor(actorEntry: ActorEntry): void {
    const { uid: actorUID, actor } = actorEntry;
    const renderingEngine = this.getRenderingEngine();

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      console.warn(
        `Cannot add actor UID of ${actorUID} Rendering Engine has been destroyed`
      );
      return;
    }

    if (!actorUID || !actor) {
      throw new Error('Actors should have uid and vtk Actor properties');
    }

    if (this.getActor(actorUID)) {
      console.warn(`Actor ${actorUID} already exists for this viewport`);
      return;
    }

    const renderer = this.getRenderer();
    renderer.addActor(actor);
    this._actors.set(actorUID, Object.assign({}, actorEntry));
  }

  /**
   * Remove all actors from the renderer
   */
  public removeAllActors(): void {
    this.getRenderer().removeAllViewProps();
    this._actors = new Map();
    return;
  }

  /**
   * Reset the camera to the default viewport camera without firing events
   */
  protected resetCameraNoEvent(): void {
    this._suppressCameraModifiedEvents = true;
    this.resetCamera();
    this._suppressCameraModifiedEvents = false;
  }

  /**
   * Sets the camera to the default viewport camera without firing events
   * @param camera - The camera to use for the viewport.
   */
  protected setCameraNoEvent(camera: ICamera): void {
    this._suppressCameraModifiedEvents = true;
    this.setCamera(camera);
    this._suppressCameraModifiedEvents = false;
  }

  /**
   * Calculates the intersections between the volume's boundaries and the viewplane.
   * 1) Determine the viewplane using the camera's ViewplaneNormal and focalPoint.
   * 2) Using volumeBounds, calculate the line equation for the 3D volume's 12 edges.
   * 3) Intersect each edge to the viewPlane and see whether the intersection point is inside the volume bounds.
   * 4) Return list of intersection points
   * It should be noted that intersection points may range from 3 to 6 points.
   * Orthogonal views have four points of intersection.
   *
   * @param imageData - vtkImageData
   * @param focalPoint - camera focal point
   * @param normal - view plane normal
   * @returns intersections list
   */
  private _getViewImageDataIntersections(imageData, focalPoint, normal) {
    // Viewplane equation: Ax+By+Cz=D
    const A = normal[0];
    const B = normal[1];
    const C = normal[2];
    const D = A * focalPoint[0] + B * focalPoint[1] + C * focalPoint[2];

    // Computing the edges of the 3D cube
    const bounds = imageData.getBounds();
    const edges = this._getEdges(bounds);

    const intersections = [];

    for (const edge of edges) {
      // start point: [x0, y0, z0], end point: [x1, y1, z1]
      const [[x0, y0, z0], [x1, y1, z1]] = edge;
      // Check if the edge is parallel to plane
      if (A * (x1 - x0) + B * (y1 - y0) + C * (z1 - z0) === 0) {
        continue;
      }
      const intersectionPoint = planar.linePlaneIntersection(
        [x0, y0, z0],
        [x1, y1, z1],
        [A, B, C, D]
      );

      if (this._isInBounds(intersectionPoint, bounds)) {
        intersections.push(intersectionPoint);
      }
    }

    return intersections;
  }

  /**
   * Resets the camera based on the rendering volume(s) bounds. If
   * resetPan and resetZoom are true it places the focal point at the center of
   * the volume (or slice); otherwise, only the camera zoom and camera Pan or Zoom
   * is reset for the current view.
   * @param resetPan - If true, the camera focal point is reset to the center of the volume (slice)
   * @param resetZoom - If true, the camera zoom is reset to the default zoom
   * @param storeAsInitialCamera - If true, reset camera is stored as the initial camera (to allow differences to
   *   be detected for pan/zoom values)
   * @returns boolean
   */
  protected resetCamera(
    resetPan = true,
    resetZoom = true,
    resetToCenter = true,
    storeAsInitialCamera = true
  ): boolean {
    const renderer = this.getRenderer();

    // fix the flip right away, since we rely on the viewPlaneNormal and
    // viewUp for later. Basically, we need to flip back if flipHorizontal
    // is true or flipVertical is true
    this.setCamera({
      flipHorizontal: false,
      flipVertical: false,
    });

    const previousCamera = _cloneDeep(this.getCamera());

    const bounds = renderer.computeVisiblePropBounds();
    const focalPoint = <Point3>[0, 0, 0];
    const imageData = this.getDefaultImageData();

    // Todo: remove this, this is just for tests passing
    if (imageData) {
      const spc = imageData.getSpacing();

      bounds[0] = bounds[0] + spc[0] / 2;
      bounds[1] = bounds[1] - spc[0] / 2;
      bounds[2] = bounds[2] + spc[1] / 2;
      bounds[3] = bounds[3] - spc[1] / 2;
      bounds[4] = bounds[4] + spc[2] / 2;
      bounds[5] = bounds[5] - spc[2] / 2;
    }

    const activeCamera = this.getVtkActiveCamera();
    const viewPlaneNormal = <Point3>activeCamera.getViewPlaneNormal();
    const viewUp = <Point3>activeCamera.getViewUp();

    // Reset the perspective zoom factors, otherwise subsequent zooms will cause
    // the view angle to become very small and cause bad depth sorting.
    // todo: parallel projection only

    focalPoint[0] = (bounds[0] + bounds[1]) / 2.0;
    focalPoint[1] = (bounds[2] + bounds[3]) / 2.0;
    focalPoint[2] = (bounds[4] + bounds[5]) / 2.0;

    if (imageData) {
      const dimensions = imageData.getDimensions();
      const middleIJK = dimensions.map((d) => Math.floor(d / 2));

      const idx = [middleIJK[0], middleIJK[1], middleIJK[2]];
      imageData.indexToWorld(idx, focalPoint);
    }

    const { widthWorld, heightWorld } =
      this._getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal);

    const canvasSize = [this.sWidth, this.sHeight];

    const boundsAspectRatio = widthWorld / heightWorld;
    const canvasAspectRatio = canvasSize[0] / canvasSize[1];

    let radius;

    if (boundsAspectRatio < canvasAspectRatio) {
      // can fit full height, so use it.
      radius = heightWorld / 2;
    } else {
      const scaleFactor = boundsAspectRatio / canvasAspectRatio;

      radius = (heightWorld * scaleFactor) / 2;
    }

    //const angle = vtkMath.radiansFromDegrees(activeCamera.getViewAngle())
    const parallelScale = 1.1 * radius;

    let w1 = bounds[1] - bounds[0];
    let w2 = bounds[3] - bounds[2];
    let w3 = bounds[5] - bounds[4];
    w1 *= w1;
    w2 *= w2;
    w3 *= w3;
    radius = w1 + w2 + w3;

    // If we have just a single point, pick a radius of 1.0
    radius = radius === 0 ? 1.0 : radius;

    // compute the radius of the enclosing sphere
    radius = Math.sqrt(radius) * 0.5;

    const distance = 1.1 * radius;

    const viewUpToSet: Point3 =
      Math.abs(vtkMath.dot(viewUp, viewPlaneNormal)) > 0.999
        ? [-viewUp[2], viewUp[0], viewUp[1]]
        : viewUp;

    const focalPointToSet = this._getFocalPointForResetCamera(
      focalPoint,
      previousCamera,
      { resetPan, resetToCenter }
    );

    const positionToSet: Point3 = [
      focalPointToSet[0] + distance * viewPlaneNormal[0],
      focalPointToSet[1] + distance * viewPlaneNormal[1],
      focalPointToSet[2] + distance * viewPlaneNormal[2],
    ];

    renderer.resetCameraClippingRange(bounds);

    const clippingRangeToUse: Point2 = [
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
    ];

    activeCamera.setPhysicalScale(radius);
    activeCamera.setPhysicalTranslation(
      -focalPointToSet[0],
      -focalPointToSet[1],
      -focalPointToSet[2]
    );

    this.setCamera({
      parallelScale: resetZoom ? parallelScale : previousCamera.parallelScale,
      focalPoint: focalPointToSet,
      position: positionToSet,
      viewAngle: 90,
      viewUp: viewUpToSet,
      clippingRange: clippingRangeToUse,
    });

    const modifiedCamera = _cloneDeep(this.getCamera());

    if (storeAsInitialCamera) {
      this.setInitialCamera(modifiedCamera);
    }

    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    };

    // Here to let parallel/distributed compositing intercept
    // and do the right thing.
    renderer.invokeEvent(RESET_CAMERA_EVENT);

    this.triggerCameraModifiedEventIfNecessary(previousCamera, modifiedCamera);

    return true;
  }

  /**
   * Sets the provided camera as the initial camera.
   * This allows computing differences applied later as compared to the initial
   * position, for things like zoom and pan.
   * @param camera - to store as the initial value.
   */
  protected setInitialCamera(camera: ICamera): void {
    this.initialCamera = camera;
  }

  /**
   * Helper function to return the current canvas pan value.
   *
   * @returns a Point2 containing the current pan values
   * on the canvas,
   * computed from the current camera, where the initial pan
   * value is [0,0].
   */
  public getPan(): Point2 {
    const activeCamera = this.getVtkActiveCamera();
    const focalPoint = activeCamera.getFocalPoint() as Point3;

    const zero3 = this.canvasToWorld([0, 0]);
    const initialCanvasFocal = this.worldToCanvas(
      <Point3>vec3.subtract(vec3.create(), this.initialCamera.focalPoint, zero3)
    );
    const currentCanvasFocal = this.worldToCanvas(
      <Point3>vec3.subtract(vec3.create(), focalPoint, zero3)
    );
    const result = <Point2>(
      vec2.subtract(vec2.create(), initialCanvasFocal, currentCanvasFocal)
    );
    return result;
  }

  /**
   * Sets the canvas pan value relative to the initial view position of 0,0
   * Modifies the camera to perform the pan.
   */
  public setPan(pan: Point2, storeAsInitialCamera = false): void {
    const previousCamera = this.getCamera();
    const { focalPoint, position } = previousCamera;
    const zero3 = this.canvasToWorld([0, 0]);
    const delta2 = vec2.subtract(vec2.create(), pan, this.getPan());
    if (
      Math.abs(delta2[0]) < 1 &&
      Math.abs(delta2[1]) < 1 &&
      !storeAsInitialCamera
    ) {
      return;
    }
    const delta = vec3.subtract(
      vec3.create(),
      this.canvasToWorld(<Point2>delta2),
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

  /**
   * Returns a current zoom level relative to the initial parallel scale
   * originally applied to the image.  That is, on initial display,
   * the zoom level is 1.  Computed as a function of the camera.
   */
  public getZoom(): number {
    const activeCamera = this.getVtkActiveCamera();
    const { parallelScale: initialParallelScale } = this.initialCamera;
    return initialParallelScale / activeCamera.getParallelScale();
  }

  /** Zooms the image using parallel scale by updating the camera value.
   * @param value - The relative parallel scale to apply.  It is relative
   * to the initial offsets value.
   * @param storeAsInitialCamera - can be set to true to reset the camera
   *   after applying this zoom as the initial camera.  A subsequent getZoom
   *   call will return "1", but the zoom will have been applied.
   */
  public setZoom(value: number, storeAsInitialCamera = false): void {
    const camera = this.getCamera();
    const { parallelScale: initialParallelScale } = this.initialCamera;
    const parallelScale = initialParallelScale / value;
    if (camera.parallelScale === parallelScale && !storeAsInitialCamera) {
      return;
    }
    this.setCamera(
      {
        ...camera,
        parallelScale,
      },
      storeAsInitialCamera
    );
  }

  /**
   * Because the focalPoint is always in the centre of the viewport,
   * we must do planar computations if the frame (image "slice") is to be preserved.
   * 1. Calculate the intersection of the view plane with the imageData
   * which results in points of intersection (minimum of 3, maximum of 6)
   * 2. Calculate average of the intersection points to get newFocalPoint
   * 3. Set the new focalPoint
   * @param imageData - imageData
   * @returns focalPoint
   */
  private _getFocalPointForViewPlaneReset(imageData) {
    // Todo: move some where else
    const { focalPoint, viewPlaneNormal: normal } = this.getCamera();
    const intersections = this._getViewImageDataIntersections(
      imageData,
      focalPoint,
      normal
    );

    let x = 0;
    let y = 0;
    let z = 0;

    intersections.forEach(([point_x, point_y, point_z]) => {
      x += point_x;
      y += point_y;
      z += point_z;
    });

    const newFocalPoint = <Point3>[
      x / intersections.length,
      y / intersections.length,
      z / intersections.length,
    ];
    // Set the focal point on the average of the intersection points
    return newFocalPoint;
  }

  /**
   * Gets the target output canvas for the `Viewport`.
   *
   * @returns an HTMLCanvasElement.
   */
  public getCanvas(): HTMLCanvasElement {
    return <HTMLCanvasElement>this.canvas;
  }
  /**
   * Gets the active vtkCamera for the viewport.
   *
   * @returns vtk driven camera
   */
  protected getVtkActiveCamera(): vtkCamera | vtkSlabCamera {
    const renderer = this.getRenderer();

    return renderer.getActiveCamera();
  }

  /**
   * Get the camera's current state
   * @returns The camera object.
   */
  public getCamera(): ICamera {
    const vtkCamera = this.getVtkActiveCamera();

    return {
      viewUp: <Point3>vtkCamera.getViewUp(),
      viewPlaneNormal: <Point3>vtkCamera.getViewPlaneNormal(),
      position: <Point3>vtkCamera.getPosition(),
      focalPoint: <Point3>vtkCamera.getFocalPoint(),
      parallelProjection: vtkCamera.getParallelProjection(),
      parallelScale: vtkCamera.getParallelScale(),
      viewAngle: vtkCamera.getViewAngle(),
      flipHorizontal: this.flipHorizontal,
      flipVertical: this.flipVertical,
    };
  }

  /**
   * Set the camera parameters
   * @param cameraInterface - ICamera
   * @param storeAsInitialCamera - to set the provided camera as the initial one,
   *    used to compute differences for things like pan and zoom.
   */
  public setCamera(
    cameraInterface: ICamera,
    storeAsInitialCamera = false
  ): void {
    const vtkCamera = this.getVtkActiveCamera();
    const previousCamera = _cloneDeep(this.getCamera());
    const updatedCamera = Object.assign({}, previousCamera, cameraInterface);
    const {
      viewUp,
      viewPlaneNormal,
      position,
      focalPoint,
      parallelScale,
      viewAngle,
      flipHorizontal,
      flipVertical,
      clippingRange,
    } = cameraInterface;

    // Note: Flip camera should be two separate calls since
    // for flip, we need to flip the viewportNormal, and if
    // flipHorizontal, and flipVertical are both true, that would
    // the logic would be incorrect. So instead, we handle flip Horizontal
    // and flipVertical separately.
    if (flipHorizontal !== undefined) {
      // flip if not flipped but requested to flip OR if flipped but requested to
      // not flip
      const flipH =
        (flipHorizontal && !this.flipHorizontal) ||
        (!flipHorizontal && this.flipHorizontal);

      if (flipH) {
        this.flip({ flipHorizontal: flipH });
      }
    }

    if (flipVertical !== undefined) {
      const flipV =
        (flipVertical && !this.flipVertical) ||
        (!flipVertical && this.flipVertical);

      if (flipV) {
        this.flip({ flipVertical: flipV });
      }
    }

    if (viewUp !== undefined) {
      vtkCamera.setViewUp(viewUp);
    }

    if (viewPlaneNormal !== undefined) {
      vtkCamera.setDirectionOfProjection(
        -viewPlaneNormal[0],
        -viewPlaneNormal[1],
        -viewPlaneNormal[2]
      );
    }

    if (position !== undefined) {
      vtkCamera.setPosition(...position);
    }

    if (focalPoint !== undefined) {
      vtkCamera.setFocalPoint(...focalPoint);
    }

    if (parallelScale !== undefined) {
      vtkCamera.setParallelScale(parallelScale);
    }

    if (viewAngle !== undefined) {
      vtkCamera.setViewAngle(viewAngle);
    }

    if (clippingRange !== undefined) {
      vtkCamera.setClippingRange(clippingRange);
    }

    // update clippingPlanes if volume viewports
    const actorEntry = this.getDefaultActor();

    if (!actorEntry || !actorEntry.actor) {
      return;
    }

    const isImageSlice = actorIsA(actorEntry, 'vtkImageSlice');

    if (!isImageSlice) {
      this.updateClippingPlanesForActors(updatedCamera);
    } else {
      const renderer = this.getRenderer();
      renderer.resetCameraClippingRange();
    }

    if (storeAsInitialCamera) {
      this.setInitialCamera(updatedCamera);
    }

    this.triggerCameraModifiedEventIfNecessary(
      previousCamera,
      this.getCamera()
    );
  }

  /**
   * Trigger camera modified event
   * @param cameraInterface - ICamera
   * @param cameraInterface - ICamera
   */
  public triggerCameraModifiedEventIfNecessary(
    previousCamera: ICamera,
    updatedCamera: ICamera
  ): void {
    if (!this._suppressCameraModifiedEvents && !this.suppressEvents) {
      const eventDetail: EventTypes.CameraModifiedEventDetail = {
        previousCamera,
        camera: updatedCamera,
        element: this.element,
        viewportId: this.id,
        renderingEngineId: this.renderingEngineId,
        rotation: this.getRotation(),
      };

      triggerEvent(this.element, Events.CAMERA_MODIFIED, eventDetail);
    }
  }

  /**
   * Updates the actors clipping planes orientation from the camera properties
   * @param updatedCamera - ICamera
   */
  protected updateClippingPlanesForActors(updatedCamera: ICamera): void {
    const actorEntries = this.getActors();
    actorEntries.forEach((actorEntry) => {
      // we assume that the first two clipping plane of the mapper are always
      // the 'camera' clipping. Update clipping planes only if the actor is
      // a vtkVolume
      if (!actorEntry.actor) {
        return;
      }

      const mapper = actorEntry.actor.getMapper();
      const vtkPlanes = mapper.getClippingPlanes();

      let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
      if (actorEntry.slabThickness) {
        slabThickness = actorEntry.slabThickness;
      }

      const { viewPlaneNormal, focalPoint } = updatedCamera;

      this.setOrientationOfClippingPlanes(
        vtkPlanes,
        slabThickness,
        viewPlaneNormal,
        focalPoint
      );
    });
  }

  public setOrientationOfClippingPlanes(
    vtkPlanes: Array<vtkPlane>,
    slabThickness: number,
    viewPlaneNormal: Point3,
    focalPoint: Point3
  ): void {
    if (vtkPlanes.length < 2) {
      return;
    }

    const scaledDistance = <Point3>[
      viewPlaneNormal[0],
      viewPlaneNormal[1],
      viewPlaneNormal[2],
    ];
    vtkMath.multiplyScalar(scaledDistance, slabThickness);

    vtkPlanes[0].setNormal(viewPlaneNormal);
    const newOrigin1 = <Point3>[0, 0, 0];
    vtkMath.subtract(focalPoint, scaledDistance, newOrigin1);
    vtkPlanes[0].setOrigin(newOrigin1);

    vtkPlanes[1].setNormal(
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2]
    );
    const newOrigin2 = <Point3>[0, 0, 0];
    vtkMath.add(focalPoint, scaledDistance, newOrigin2);
    vtkPlanes[1].setOrigin(newOrigin2);
  }

  private _getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal) {
    const viewUpCorners = this._getCorners(bounds);
    const viewRightCorners = this._getCorners(bounds);

    const viewRight = vec3.cross(vec3.create(), viewUp, viewPlaneNormal);

    let transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(viewUp, [1, 0, 0]);

    viewUpCorners.forEach((pt) => transform.apply(pt));

    // range is now maximum X distance
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const y = viewUpCorners[i][0];
      if (y > maxY) {
        maxY = y;
      }
      if (y < minY) {
        minY = y;
      }
    }

    transform = vtkMatrixBuilder
      .buildFromDegree()
      .identity()
      .rotateFromDirections(
        [viewRight[0], viewRight[1], viewRight[2]],
        [1, 0, 0]
      );

    viewRightCorners.forEach((pt) => transform.apply(pt));

    // range is now maximum Y distance
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = viewRightCorners[i][0];
      if (x > maxX) {
        maxX = x;
      }
      if (x < minX) {
        minX = x;
      }
    }

    return { widthWorld: maxX - minX, heightWorld: maxY - minY };
  }

  _getCorners(bounds: Array<number>): Array<number>[] {
    return [
      [bounds[0], bounds[2], bounds[4]],
      [bounds[0], bounds[2], bounds[5]],
      [bounds[0], bounds[3], bounds[4]],
      [bounds[0], bounds[3], bounds[5]],
      [bounds[1], bounds[2], bounds[4]],
      [bounds[1], bounds[2], bounds[5]],
      [bounds[1], bounds[3], bounds[4]],
      [bounds[1], bounds[3], bounds[5]],
    ];
  }

  _getFocalPointForResetCamera(
    centeredFocalPoint: Point3,
    previousCamera: ICamera,
    { resetPan = true, resetToCenter = true }
  ): Point3 {
    if (resetToCenter && resetPan) {
      return centeredFocalPoint;
    }

    if (resetToCenter && !resetPan) {
      return hasNaNValues(previousCamera.focalPoint)
        ? centeredFocalPoint
        : previousCamera.focalPoint;
    }

    if (!resetToCenter && resetPan) {
      // this is an interesting case that means the reset camera should not
      // change the slice (default behavior is to go to the center of the
      // image), and rather just reset the pan on the slice that is currently
      // being viewed
      const oldCamera = previousCamera;
      const oldFocalPoint = oldCamera.focalPoint;
      const oldViewPlaneNormal = oldCamera.viewPlaneNormal;

      const vectorFromOldFocalPointToCenteredFocalPoint = vec3.subtract(
        vec3.create(),
        centeredFocalPoint,
        oldFocalPoint
      );

      const distanceFromOldFocalPointToCenteredFocalPoint = vec3.dot(
        vectorFromOldFocalPointToCenteredFocalPoint,
        oldViewPlaneNormal
      );

      const newFocalPoint = vec3.scaleAndAdd(
        vec3.create(),
        centeredFocalPoint,
        oldViewPlaneNormal,
        -1 * distanceFromOldFocalPointToCenteredFocalPoint
      );

      return [newFocalPoint[0], newFocalPoint[1], newFocalPoint[2]];
    }

    if (!resetPan && !resetToCenter) {
      // this means the reset camera should not change the slice and should not
      // touch the pan either.
      return hasNaNValues(previousCamera.focalPoint)
        ? centeredFocalPoint
        : previousCamera.focalPoint;
    }
  }

  /**
   * Determines whether or not the 3D point position is inside the boundaries of the 3D imageData.
   * @param point - 3D coordinate
   * @param bounds - Bounds of the image
   * @returns boolean
   */
  _isInBounds(point: Point3, bounds: number[]): boolean {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
    const [x, y, z] = point;
    if (x < xMin || x > xMax || y < yMin || y > yMax || z < zMin || z > zMax) {
      return false;
    }
    return true;
  }

  /**
   * Returns a list of edges for the imageData bounds, which are
   * the cube edges in the case of volumeViewport edges.
   * p1: front, bottom, left
   * p2: front, top, left
   * p3: back, bottom, left
   * p4: back, top, left
   * p5: front, bottom, right
   * p6: front, top, right
   * p7: back, bottom, right
   * p8: back, top, right
   * @param bounds - Bounds of the renderer
   * @returns Edges of the containing bounds
   */
  _getEdges(bounds: Array<number>): Array<[number[], number[]]> {
    const [p1, p2, p3, p4, p5, p6, p7, p8] = this._getCorners(bounds);
    return [
      [p1, p2],
      [p1, p5],
      [p1, p3],
      [p2, p4],
      [p2, p6],
      [p3, p4],
      [p3, p7],
      [p4, p8],
      [p5, p7],
      [p5, p6],
      [p6, p8],
      [p7, p8],
    ];
  }
}

export default Viewport;
