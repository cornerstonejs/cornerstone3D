import type { vtkCamera } from '@kitware/vtk.js/Rendering/Core/Camera';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import { vec2, vec3 } from 'gl-matrix';
import _cloneDeep from 'lodash.clonedeep';

import Events from '../enums/Events';
import ViewportStatus from '../enums/ViewportStatus';
import ViewportType from '../enums/ViewportType';
import renderingEngineCache from './renderingEngineCache';
import {
  triggerEvent,
  planar,
  isImageActor,
  actorIsA,
  isEqual,
} from '../utilities';
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
  DisplayArea,
  ViewPresentation,
  ViewReference,
  ViewportProperties,
} from '../types';
import type {
  ViewportInput,
  IViewport,
  ViewReferenceSpecifier,
  ReferenceCompatibleOptions,
  ViewPresentationSelector,
  DataSetOptions,
} from '../types/IViewport';
import type { vtkSlabCamera } from './vtkClasses/vtkSlabCamera';
import { getConfiguration } from '../init';
import IImageCalibration from '../types/IImageCalibration';
import { InterpolationType } from '../enums';

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
  /**
   * CameraViewPresentation is a view preentation selector that has all the
   * camera related presentation selections, and would typically be used for
   * choosing presentation information between two viewports showing the same
   * type of orientation of a view, such as the CT, PT and fusion views in the
   * same orientation view.
   */
  public static readonly CameraViewPresentation: ViewPresentationSelector = {
    rotation: true,
    pan: true,
    zoom: true,
    displayArea: true,
  };

  /**
   * TransferViewPresentation is a view presentation selector that selects all
   * the transfer function related attributes.  It would typically be used for
   * synchronizing different orientations of the same series, or for
   * synchronizing two views of the same type of series such as a CT.
   */
  public static readonly TransferViewPresentation: ViewPresentationSelector = {
    windowLevel: true,
    paletteLut: true,
  };

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
  /**
   * The amount by which the images are inset in a viewport by default.
   */
  protected insetImageMultiplier = 1.1;

  protected flipHorizontal = false;
  protected flipVertical = false;
  public isDisabled: boolean;
  /** Record the rendering status, mostly for testing purposes, but can also
   * be useful for knowing things like whether the viewport is initialized
   */
  public viewportStatus: ViewportStatus = ViewportStatus.NO_DATA;

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
  readonly defaultOptions: Record<string, any>;
  /** options for the viewport which includes orientation axis, backgroundColor and displayArea */
  options: ViewportInputOptions;
  /** informs if a new actor was added before a resetCameraClippingRange phase */
  _suppressCameraModifiedEvents = false;
  /** A flag representing if viewport methods should fire events or not */
  readonly suppressEvents: boolean;
  protected hasPixelSpacing = true;
  protected calibration: IImageCalibration;
  /** The camera that is initially defined on the reset for
   * the relative pan/zoom
   */
  protected initialCamera: ICamera;
  /** The camera that is defined for resetting displayArea to ensure absolute displayArea
   * settings
   */
  protected fitToCanvasCamera: ICamera;

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
  getProperties: () => ViewportProperties = () => ({});
  updateRenderingPipeline: () => void;
  getNumberOfSlices: () => number;
  protected setRotation = (_rotation: number) => {
    /*empty*/
  };

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  private viewportWidgets = new Map() as Map<string, any>;

  public addWidget = (widgetId, widget) => {
    this.viewportWidgets.set(widgetId, widget);
  };

  public getWidget = (id) => {
    return this.viewportWidgets.get(id);
  };

  public getWidgets = () => {
    return Array.from(this.viewportWidgets.values());
  };

  public removeWidgets = () => {
    const widgets = this.getWidgets();
    widgets.forEach((widget) => {
      if (widget.getEnabled()) {
        widget.setEnabled(false);
      }
      if (widget.getActor && widget.getRenderer) {
        const actor = widget.getActor();
        const renderer = widget.getRenderer();
        if (renderer && actor) {
          renderer.removeActor(actor);
        }
      }
    });
  };

  /**
   * Indicate that the image has been rendered.
   * This will set the viewportStatus to RENDERED if there is image data
   * available to actually be rendered - otherwise, the rendering simply showed
   * the background image.
   */
  public setRendered() {
    if (
      this.viewportStatus === ViewportStatus.NO_DATA ||
      this.viewportStatus === ViewportStatus.LOADING
    ) {
      return;
    }
    this.viewportStatus = ViewportStatus.RENDERED;
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
  public getRenderer(): any {
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
    if (this.options?.displayArea) {
      this.setDisplayArea(this.options?.displayArea);
    }
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
   *    * flipOptions.flipHorizontal - Flip the viewport on horizontal axis
   *    * flipOptions.flipVertical - Flip the viewport on vertical axis
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
   * Returns an array of unique identifiers for all the actors in the viewport.
   * @returns An array of strings
   */
  public getActorUIDs(): Array<string> {
    return Array.from(this._actors.keys());
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
   *    * actorEntry.uid - The unique identifier for the actor.
   *    * actorEntry.actor - The volume actor.
   *    * actorEntry.slabThickness - The slab thickness.
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
    renderer?.addActor(actor);
    this._actors.set(actorUID, Object.assign({}, actorEntry));

    // when we add an actor we should update the camera clipping range and
    // clipping planes as well
    this.updateCameraClippingPlanesAndRange();
  }

  /**
   * Remove all actors from the renderer
   */
  public removeAllActors(): void {
    this.getRenderer()?.removeAllViewProps();
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
   * Sets the interpolation type.  No-op in the base.
   */
  protected setInterpolationType(_interpolationType: InterpolationType, _arg?) {
    // No-op - just done to allow setting on the base viewport
  }

  /**
   * Sets the camera to an initial bounds. If
   * resetPan and resetZoom are true it places the focal point at the center of
   * the volume (or slice); otherwise, only the camera zoom and camera Pan or Zoom
   * is reset for the current view.
   * @param displayArea - The display area of interest.
   * @param suppressEvents - If true, don't fire displayArea event.
   */
  public setDisplayArea(
    displayArea: DisplayArea,
    suppressEvents = false
  ): void {
    if (!displayArea) {
      return;
    }
    const { storeAsInitialCamera, type: areaType } = displayArea;

    // Instead of storing the camera itself, if initial camera is set,
    // then store the display area as the baseline display area.
    if (storeAsInitialCamera) {
      this.options.displayArea = displayArea;
    }

    // make calculations relative to the fitToCanvasCamera view
    const { _suppressCameraModifiedEvents } = this;
    this._suppressCameraModifiedEvents = true;

    // This should only apply for storeAsInitialCamera, but the calculations
    // currently don't quite work otherwise.
    // TODO - fix so that the store works for existing transforms
    this.setCamera(this.fitToCanvasCamera);

    if (areaType === 'SCALE') {
      this.setDisplayAreaScale(displayArea);
    } else {
      this.setInterpolationType(
        this.getProperties()?.interpolationType || InterpolationType.LINEAR
      );
      this.setDisplayAreaFit(displayArea);
    }

    // Set the initial camera if appropriate
    if (storeAsInitialCamera) {
      this.initialCamera = this.getCamera();
    }

    // Restore event firing
    this._suppressCameraModifiedEvents = _suppressCameraModifiedEvents;
    if (!suppressEvents && !_suppressCameraModifiedEvents) {
      const eventDetail: EventTypes.DisplayAreaModifiedEventDetail = {
        viewportId: this.id,
        displayArea: displayArea,
        storeAsInitialCamera: storeAsInitialCamera,
      };

      triggerEvent(this.element, Events.DISPLAY_AREA_MODIFIED, eventDetail);
      this.setCamera(this.getCamera());
    }
  }

  /**
   * Sets the viewport to pixel scaling mode.  Pixel scaling displays
   * 1 image pixel as 1 (or scale) physical screen pixels.  That is,
   * a 1024x512 image will be displayed with scale=2, as 2048x1024
   * physical image pixels.
   *
   * @param displayArea - display area to set
   *    * displayArea.scale - the number of physical pixels to display
   *        each image pixel in.  Values `< 1` mean smaller than physical,
   *        while values `> 1` mean more than one pixel.  Default is 1
   *        Suggest using whole numbers or integer fractions (eg `1/3`)
   */
  protected setDisplayAreaScale(displayArea: DisplayArea): void {
    const { scale = 1 } = displayArea;
    const canvas = this.canvas;
    const height = canvas.height;
    const width = canvas.width;
    if (height < 8 || width < 8) {
      return;
    }
    const imageData = this.getDefaultImageData();
    const spacingWorld = imageData.getSpacing();
    const spacing = spacingWorld[1];
    // Need nearest interpolation for scale
    this.setInterpolationType(InterpolationType.NEAREST);
    this.setCamera({ parallelScale: (height * spacing) / (2 * scale) });

    // If this is scale, then image area isn't allowed, so just delete it to be safe
    delete displayArea.imageArea;
    // Apply the pan values from the display area.
    this.setDisplayAreaFit(displayArea);

    // Need to ensure the focal point is aligned with the canvas size/position
    // so that we don't get half pixel rendering, which causes additional
    // moire patterns to be displayed.
    // This is based on the canvas size having the center pixel be at a fractional
    // position when the size is even, so matching a fractional position on the
    // focal point to the center of an image pixel.
    const { focalPoint, position, viewUp, viewPlaneNormal } = this.getCamera();
    const focalChange = vec3.create();
    if (canvas.height % 2) {
      vec3.scaleAndAdd(focalChange, focalChange, viewUp, scale * 0.5 * spacing);
    }
    if (canvas.width % 2) {
      const viewRight = vec3.cross(vec3.create(), viewUp, viewPlaneNormal);
      vec3.scaleAndAdd(
        focalChange,
        focalChange,
        viewRight,
        scale * 0.5 * spacing
      );
    }
    if (!focalChange[0] && !focalChange[1] && !focalChange[2]) {
      return;
    }
    this.setCamera({
      focalPoint: <Point3>vec3.add(vec3.create(), focalPoint, focalChange),
      position: <Point3>vec3.add(vec3.create(), position, focalChange),
    });
  }

  /**
   * This applies a display area with a fit of the provided area to the
   * available area.
   * The zoom level is controlled by the imageArea parameter, which is a pair
   * of percentage width in the horizontal and vertical dimension is scaled
   * to fit the displayable area.  Both values are taken into account, and the
   * scaling is set so that both fractions of the image area are visible.
   *
   * The panning is controlled by the imageCanvasPoint, which has two
   * values, teh imagePoint and the canvasPoint.  They are fractional
   * values of the image and canvas respectively, with the panning set to
   * display the image pixel at the given fraction on top of the canvas at the
   * given percentage.  The default points are 0.5.
   *
   * For example, if the zoom level is [2,1], then the image is displayed
   * such that at least twice the width is visible, and the height is visible.
   * That will result in the image width being black, divided up on the left
   * and right according to the imageCanvasPoint
   *
   * Then, if the imagePoint is [1,0] and the canvas point is [1,0], then
   * the right most edge of the image, at the top of the image, will be
   * displayed at the right most edge of the canvas, at the top.
   *
   */
  protected setDisplayAreaFit(displayArea: DisplayArea) {
    const { imageArea, imageCanvasPoint } = displayArea;

    const devicePixelRatio = window?.devicePixelRatio || 1;
    const imageData = this.getDefaultImageData();
    if (!imageData) {
      return;
    }
    const canvasWidth = this.sWidth / devicePixelRatio;
    const canvasHeight = this.sHeight / devicePixelRatio;
    const dimensions = imageData.getDimensions();
    const canvasZero = this.worldToCanvas(imageData.indexToWorld([0, 0, 0]));
    const canvasEdge = this.worldToCanvas(
      imageData.indexToWorld([
        dimensions[0] - 1,
        dimensions[1] - 1,
        dimensions[2],
      ])
    );

    const canvasImage = [
      Math.abs(canvasEdge[0] - canvasZero[0]),
      Math.abs(canvasEdge[1] - canvasZero[1]),
    ];
    const [imgWidth, imgHeight] = canvasImage;

    if (imageArea) {
      const [areaX, areaY] = imageArea;
      const requireX = Math.abs((areaX * imgWidth) / canvasWidth);
      const requireY = Math.abs((areaY * imgHeight) / canvasHeight);

      const initZoom = this.getZoom();
      const fitZoom = this.getZoom(this.fitToCanvasCamera);
      const absZoom = Math.min(1 / requireX, 1 / requireY);
      const applyZoom = (absZoom * initZoom) / fitZoom;
      this.setZoom(applyZoom, false);
    }

    // getting the image info
    // getting the image info
    if (imageCanvasPoint) {
      const { imagePoint, canvasPoint = imagePoint || [0.5, 0.5] } =
        imageCanvasPoint;
      const [canvasX, canvasY] = canvasPoint;
      const canvasPanX = canvasWidth * (canvasX - 0.5);
      const canvasPanY = canvasHeight * (canvasY - 0.5);

      const [imageX, imageY] = imagePoint || canvasPoint;
      const useZoom = 1;
      const imagePanX = useZoom * imgWidth * (0.5 - imageX);
      const imagePanY = useZoom * imgHeight * (0.5 - imageY);

      const newPositionX = imagePanX + canvasPanX;
      const newPositionY = imagePanY + canvasPanY;

      const deltaPoint2: Point2 = [newPositionX, newPositionY];
      // Use getPan from current for the setting
      vec2.add(deltaPoint2, deltaPoint2, this.getPan());
      // The pan is part of the display area settings, not the initial camera, so
      // don't store as initial camera here - that breaks rotation and other changes.
      this.setPan(deltaPoint2, false);
    }
  }

  public getDisplayArea(): DisplayArea | undefined {
    return this.options?.displayArea;
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
  public resetCamera(
    resetPan = true,
    resetZoom = true,
    resetToCenter = true,
    storeAsInitialCamera = true
  ): boolean {
    const renderer = this.getRenderer();

    // fix the flip right away, since we rely on the viewPlaneNormal and
    // viewUp for later. Basically, we need to flip back if flipHorizontal
    // is true or flipVertical is true
    // we should use resetCamera no event here, since we don't want to fire
    // camera modified events yet since a proper one will be fired later down
    // below
    this.setCameraNoEvent({
      flipHorizontal: false,
      flipVertical: false,
    });

    const previousCamera = _cloneDeep(this.getCamera());
    const bounds = renderer.computeVisiblePropBounds();
    const focalPoint = <Point3>[0, 0, 0];
    const imageData = this.getDefaultImageData();

    // The bounds are used to set the clipping view, which is then used to
    // figure out the center point of each image.  This needs to be the depth
    // center, so the bounds need to be extended by the spacing such that the
    // depth center is in the middle of each image.
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
      // TODO: This should be the line below, but that causes issues with existing
      // tests.  Not doing that adds significant fuzziness on rendering, so at
      // some point it should be fixed.
      // const middleIJK = dimensions.map((d) => Math.floor((d-1) / 2));
      const middleIJK = dimensions.map((d) => Math.floor(d / 2));

      const idx = [middleIJK[0], middleIJK[1], middleIJK[2]];
      // Modifies the focal point in place, as this hits the vtk indexToWorld function
      imageData.indexToWorld(idx, focalPoint);
    }

    const { widthWorld, heightWorld } =
      this._getWorldDistanceViewUpAndViewRight(bounds, viewUp, viewPlaneNormal);

    const canvasSize = [this.sWidth, this.sHeight];

    const boundsAspectRatio = widthWorld / heightWorld;
    const canvasAspectRatio = canvasSize[0] / canvasSize[1];

    const scaleFactor = boundsAspectRatio / canvasAspectRatio;

    const parallelScale =
      scaleFactor < 1 // can fit full height, so use it.
        ? (this.insetImageMultiplier * heightWorld) / 2
        : (this.insetImageMultiplier * heightWorld * scaleFactor) / 2;

    // If we have just a single point, pick a radius of 1.0
    // compute the radius of the enclosing sphere
    // For 3D viewport, we should increase the radius to make sure the whole
    // volume is visible and we don't get clipping artifacts.
    const radius =
      Viewport.boundsRadius(bounds) *
      (this.type === ViewportType.VOLUME_3D ? 10 : 1);

    const distance = this.insetImageMultiplier * radius;

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

    this.setFitToCanvasCamera(_cloneDeep(this.getCamera()));

    if (storeAsInitialCamera) {
      this.setInitialCamera(modifiedCamera);
    }

    if (resetZoom) {
      this.setZoom(1, storeAsInitialCamera);
    }

    const RESET_CAMERA_EVENT = {
      type: 'ResetCameraEvent',
      renderer,
    };

    // Here to let parallel/distributed compositing intercept
    // and do the right thing.
    renderer.invokeEvent(RESET_CAMERA_EVENT);

    this.triggerCameraModifiedEventIfNecessary(previousCamera, modifiedCamera);

    if (
      imageData &&
      this.options?.displayArea &&
      resetZoom &&
      resetPan &&
      resetToCenter
    ) {
      this.setDisplayArea(this.options?.displayArea);
    }

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
   * Sets the provided camera as the displayArea camera.
   * This allows computing differences applied later as compared to the initial
   * position, for things like zoom and pan.
   * @param camera - to store as the initial value.
   */
  protected setFitToCanvasCamera(camera: ICamera): void {
    this.fitToCanvasCamera = camera;
  }

  /**
   * Helper function to return the current canvas pan value.
   *
   * @returns a Point2 containing the current pan values
   * on the canvas,
   * computed from the current camera, where the initial pan
   * value is [0,0].
   */
  public getPan(initialCamera = this.initialCamera): Point2 {
    const activeCamera = this.getVtkActiveCamera();
    const focalPoint = activeCamera.getFocalPoint() as Point3;

    const zero3 = this.canvasToWorld([0, 0]);
    const initialCanvasFocal = this.worldToCanvas(
      <Point3>vec3.subtract([0, 0, 0], initialCamera.focalPoint, zero3)
    );
    const currentCanvasFocal = this.worldToCanvas(
      <Point3>vec3.subtract([0, 0, 0], focalPoint, zero3)
    );
    const result = <Point2>(
      vec2.subtract([0, 0], initialCanvasFocal, currentCanvasFocal)
    );
    return result;
  }

  public getCurrentImageIdIndex(): number {
    throw new Error('Not implemented');
  }

  public getSliceIndex(): number {
    throw new Error('Not implemented');
  }

  /**
   * Gets a referenced image url of some sort - could be a real image id, or
   * could be a URL with parameters. Regardless it refers to the currently displaying
   * image as a string value.
   */
  public getReferenceId(_specifier?: ViewReferenceSpecifier): string {
    return null;
  }

  /**
   * Sets the canvas pan value relative to the initial view position of 0,0
   * Modifies the camera to perform the pan.
   */
  public setPan(pan: Point2, storeAsInitialCamera = false): void {
    const previousCamera = this.getCamera();
    const { focalPoint, position } = previousCamera;
    const zero3 = this.canvasToWorld([0, 0]);
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
  public getZoom(compareCamera = this.initialCamera): number {
    if (!compareCamera) {
      return 1;
    }

    const activeCamera = this.getVtkActiveCamera();
    const { parallelScale: initialParallelScale } = compareCamera;
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

    // update clipping range only if focal point changed of a new actor is added
    const prevFocalPoint = previousCamera.focalPoint;
    const prevViewUp = previousCamera.viewUp;

    if ((prevFocalPoint && focalPoint) || (prevViewUp && viewUp)) {
      const currentViewPlaneNormal = <Point3>vtkCamera.getViewPlaneNormal();
      const currentViewUp = <Point3>vtkCamera.getViewUp();

      let cameraModifiedOutOfPlane = false;
      let viewUpHasChanged = false;

      if (focalPoint) {
        const deltaCamera = <Point3>[
          focalPoint[0] - prevFocalPoint[0],
          focalPoint[1] - prevFocalPoint[1],
          focalPoint[2] - prevFocalPoint[2],
        ];

        cameraModifiedOutOfPlane =
          Math.abs(vtkMath.dot(deltaCamera, currentViewPlaneNormal)) > 0;
      }

      if (viewUp) {
        viewUpHasChanged = !isEqual(currentViewUp, prevViewUp);
      }

      // only modify the clipping planes if the camera is modified out of plane
      // or a new actor is added and we need to update the clipping planes
      if (cameraModifiedOutOfPlane || viewUpHasChanged) {
        const actorEntry = this.getDefaultActor();
        if (!actorEntry?.actor) {
          return;
        }

        if (!actorIsA(actorEntry, 'vtkActor')) {
          this.updateClippingPlanesForActors(updatedCamera);
        }

        if (
          actorIsA(actorEntry, 'vtkImageSlice') ||
          this.type === ViewportType.VOLUME_3D
        ) {
          const renderer = this.getRenderer();
          renderer.resetCameraClippingRange();
        }
      }
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
   * Updates the camera's clipping planes and range.
   */
  public updateCameraClippingPlanesAndRange(): void {
    const currentCamera = this.getCamera();
    this.updateClippingPlanesForActors(currentCamera);
    this.getRenderer().resetCameraClippingRange();
  }

  /**
   * Updates the actors clipping planes orientation from the camera properties
   * @param updatedCamera - ICamera
   */
  protected async updateClippingPlanesForActors(
    updatedCamera: ICamera
  ): Promise<void> {
    const actorEntries = this.getActors();
    // Todo: this was using an async and promise wait all because of the
    // new surface rendering use case, which broke the more important 3D
    // volume rendering, so reverting this back for now until I can figure
    // out a better way to handle this.
    actorEntries.map((actorEntry) => {
      // we assume that the first two clipping plane of the mapper are always
      // the 'camera' clipping. Update clipping planes only if the actor is
      // a vtkVolume
      if (!actorEntry.actor) {
        return;
      }

      const mapper = actorEntry.actor.getMapper();
      let vtkPlanes = actorEntry?.clippingFilter
        ? actorEntry.clippingFilter.getClippingPlanes()
        : mapper.getClippingPlanes();

      if (vtkPlanes.length === 0 && actorEntry?.clippingFilter) {
        vtkPlanes = [vtkPlane.newInstance(), vtkPlane.newInstance()];
      }

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
      triggerEvent(this.element, Events.CLIPPING_PLANES_UPDATED, {
        actorEntry,
        focalPoint,
        vtkPlanes,
        viewport: this,
      });
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

  /**
   * Method to get the clipping planes of a given actor
   * @param actorEntry - The actor entry (a specific type you'll define dependent on your code)
   * @returns vtkPlanes - An array of vtkPlane objects associated with the given actor
   */
  public getClippingPlanesForActor(actorEntry?: ActorEntry): vtkPlane[] {
    if (!actorEntry) {
      actorEntry = this.getDefaultActor();
    }

    if (!actorEntry.actor) {
      throw new Error('Invalid actor entry: Actor is undefined');
    }

    const mapper = actorEntry.actor.getMapper();
    let vtkPlanes = actorEntry?.clippingFilter
      ? actorEntry.clippingFilter.getClippingPlanes()
      : mapper.getClippingPlanes();

    if (vtkPlanes.length === 0 && actorEntry?.clippingFilter) {
      vtkPlanes = [vtkPlane.newInstance(), vtkPlane.newInstance()];
    }

    return vtkPlanes;
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

  /**
   * Gets a view target specifying WHAT a view is displaying,
   * allowing for checking if a given image is displayed or could be displayed
   * in a given viewport.
   * See getViewPresentation for HOW a view is displayed.
   *
   * @param viewRefSpecifier - choose an alternate view to be specified, typically
   *      a different slice index in the same set of images.
   */
  public getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const {
      focalPoint: cameraFocalPoint,
      viewPlaneNormal,
      viewUp,
    } = this.getCamera();
    const target: ViewReference = {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      cameraFocalPoint,
      viewPlaneNormal,
      viewUp,
      sliceIndex: viewRefSpecifier.sliceIndex ?? this.getSliceIndex(),
    };
    return target;
  }

  /**
   * Find out if this viewport does or could show this view reference.
   *
   * @param options - allows specifying whether the view COULD display this with
   *                  some modification - either navigation or displaying as volume.
   * @returns true if the viewport could show this view reference
   */
  public isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean {
    if (
      viewRef.FrameOfReferenceUID &&
      viewRef.FrameOfReferenceUID !== this.getFrameOfReferenceUID()
    ) {
      return false;
    }

    const { viewPlaneNormal } = viewRef;
    const camera = this.getCamera();
    if (
      viewPlaneNormal &&
      !isEqual(viewPlaneNormal, camera.viewPlaneNormal) &&
      !isEqual(
        vec3.negate(camera.viewPlaneNormal, camera.viewPlaneNormal),
        viewPlaneNormal
      )
    ) {
      // Could navigate as a volume to the reference with an orientation change
      return options?.withOrientation === true;
    }
    return true;
  }

  /**
   * Gets a view presentation information specifying HOW a viewport displays
   * something, but not what is being displayed.
   * See getViewReference to get information on WHAT is being displayed.
   *
   * This is intended to have information on how an image is presented to the user, without
   * specifying what image s displayed.  All of this information is available
   * externally, but this method combines the parts of this that are appropriate
   * for remember or applying to other views, without necessarily needing to know
   * what all the atributes are.  That differs from methods like getCamera which
   * fetch exact view details that are not likely to be identical between viewports
   * as they change sizes or apply to different images.
   *
   * Note that the results of this can be used on different viewports, for example,
   * the pan values can be applied to a volume viewport showing a CT, and a
   * stack viewport showing an ultrasound.
   *
   * The selector allows choosing which view presentation attributes to return.
   * Some default values are available from `Viewport.CameraViewPresentation` and
   * `Viewport.TransferViewPresentation`
   *
   * @param viewPresSel - select which attributes to display.
   */
  public getViewPresentation(
    viewPresSel: ViewPresentationSelector = {
      rotation: true,
      displayArea: true,
      zoom: true,
      pan: true,
    }
  ): ViewPresentation {
    const target: ViewPresentation = {};

    const { rotation, displayArea, zoom, pan } = viewPresSel;
    if (rotation) {
      target.rotation = this.getRotation();
    }
    if (displayArea) {
      target.displayArea = this.getDisplayArea();
    }
    const initZoom = this.getZoom();

    if (zoom) {
      target.zoom = initZoom;
    }
    if (pan) {
      target.pan = this.getPan();
      vec2.scale(target.pan, target.pan, 1 / initZoom);
    }
    return target;
  }

  /**
   * Navigates to the image specified by the viewRef.
   */
  public setViewReference(viewRef: ViewReference) {
    // No-op
  }

  /**
   * Applies the display area, zoom, pan and rotation from the view presentation.
   * No-op is viewPres isn't defined.
   */
  public setViewPresentation(viewPres: ViewPresentation) {
    if (!viewPres) {
      return;
    }
    const { displayArea, zoom = this.getZoom(), pan, rotation } = viewPres;
    if (displayArea !== this.getDisplayArea()) {
      this.setDisplayArea(displayArea);
    }
    this.setZoom(zoom);
    if (pan) {
      this.setPan(vec2.scale([0, 0], pan, zoom) as Point2);
    }
    if (rotation >= 0) {
      this.setRotation(rotation);
    }
  }

  protected _shouldUseNativeDataType() {
    const { useNorm16Texture, preferSizeOverAccuracy } =
      getConfiguration().rendering;
    return useNorm16Texture || preferSizeOverAccuracy;
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

  /**
   * Computes the bounds radius value
   */
  static boundsRadius(bounds: number[]) {
    const w1 = (bounds[1] - bounds[0]) ** 2;
    const w2 = (bounds[3] - bounds[2]) ** 2;
    const w3 = (bounds[5] - bounds[4]) ** 2;

    // If we have just a single point, pick a radius of 1.0
    // compute the radius of the enclosing sphere
    // For 3D viewport, we should increase the radius to make sure the whole
    // volume is visible and we don't get clipping artifacts.
    const radius = Math.sqrt(w1 + w2 + w3 || 1) * 0.5;
    return radius;
  }

  /**
   * This is a wrapper for setStack/setVideo/etc
   */
  public setDataIds(_imageIds: string[], _options?: DataSetOptions) {
    throw new Error('Unsupported operatoin setDataIds');
  }
}

export default Viewport;
