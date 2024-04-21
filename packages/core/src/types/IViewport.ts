import ICamera from './ICamera';
import Point2 from './Point2';
import Point3 from './Point3';
import ViewportInputOptions from './ViewportInputOptions';
import { ActorEntry } from './IActor';
import ViewportType from '../enums/ViewportType';
import ViewportStatus from '../enums/ViewportStatus';
import DisplayArea from './displayArea';
import BoundsLPS from './BoundsLPS';

/**
 * Specifies what view to get a reference for.
 * This set of options allows a Viewport to return a reference for an image
 * not currently in view, such as for a different slice, or containing a given
 * set of points.
 */
export type ViewReferenceSpecifier = {
  /** The slice index within the current viewport camera to get a reference for */
  sliceIndex?: number | [number, number];
  /**
   * Specifies to get a view reference that refers to the generic frame of
   * reference rather than to a specific volume or stack.  Thus, the view
   * reference would be compatible with any view showing the same frame of
   * reference UID.
   */
  forFrameOfReference?: boolean;
  /** Set of points to get a reference for, in world space */
  points?: Point3[];
  /** The volumeId to reference */
  volumeId?: string;
};

/**
 * It is often important to decide if a given view can display a specific
 * view reference.  For example, annotations need to know if they are
 * shown on a view.  Some operations need to know if the view COULD show
 * the given object if certain changes were made to the view.  This object
 * allows specifying what changes are permitted in order to determine if the
 * view could show the image.
 */
export type ReferenceCompatibleOptions = {
  /**
   * Test whether the view could be shown if the viewport were navigated.
   * That is, test is just changing the slice position and zoom/pan would
   * allow showing the view.
   */
  withNavigation?: boolean;
  /**
   * For a stack viewport, return true if this viewport could show the given
   * view if it were converted into a volume viewport, while for a volume,
   * could it be shown if the camera/orientation were changed.
   * That is, is the specified view showing an image in the stack but with a
   * different orientation than acquisition.
   */
  asVolume?: boolean;
  /**
   * Use this imageURI for testing - may or may not be the current one.
   * Should be a straight contains URI for the set of imageIds in any of
   * the volumes or set of image ids.
   * This is an optimization setting only that makes the test faster, and does
   * not need to be provided.
   */
  imageURI?: string;
};

/**
 * A view reference references the image/location of an image.  Typical use
 * cases include remembering the current position of a viewport to allow returning
 * to it later, as well as determining whether specific views should show annotations
 * or other overlay information.
 */
export type ViewReference = {
  /**
   * The FrameOfReferenceUID
   */
  FrameOfReferenceUID: string;
  /**
   * An optional property used to specify the particular image that this view includes.
   * For volumes, that will specify which image is closest to the requested
   * point(s) in some fashion, or will be undefined when the reference applies
   * to any volume with the same frame of reference.
   *
   * The naming of this particular attribute matches the DICOM SR naming for the
   * referenced image, as well as historical naming in CS3D.
   */
  referencedImageId?: string;

  /**
   * The focal point of the camera in world space
   */
  cameraFocalPoint?: Point3;
  /**
   * The normal for the current view
   */
  viewPlaneNormal?: Point3;
  /**
   * The slice index or range for this view
   */
  sliceIndex?: number | [number, number];

  /**
   * VolumeId that the referencedImageId was chosen from
   */
  volumeId?: string;
  /**
   * The bounds that are shown.  Allows specifying whether a view includes
   * particular bounds or not.  This will be in world coordinates.
   */
  bounds?: BoundsLPS;
};

/**
 * A view presentation stores information about how the view is presented to the
 * user, such as rotation, the displayed area, pan/zoom etc.  This is represented
 * as values which are independent of the view type or size as much as possible,
 * by normalizing the values to the type of view presented.  This allows
 * remember or synchronizing values in a much wider variety of places than
 * using the raw/underlying view data such as camera position.
 */
export type ViewPresentation = {
  /**
   * The slice thickness - in frames(true/default) it will be 1 for a frame distance of
   * 1 pixel thickness, while for mm will be in mm distance.
   */
  slabThickness?: number;

  /**
   * The rotation of the view - this is related to cameraViewUp, but is relative
   * to the viewNormal and the default viewUp for that viewNormal.
   */
  rotation?: number;

  /**
   * The display area being shown.  This is more consistent than applying a set
   * of boundary areas.
   */
  displayArea?: DisplayArea;

  /**
   * The zoom value is a zoom factor relative either to fit to canvas or relative
   * to the display area.
   * The default true units are relative to the initial camera
   * scale to fit is used to get units relative to the scale to fit camera.
   */
  zoom?: number;

  /**
   * The pan value is how far the pan has moved relative to the fit to canvas
   * or relative to the display area initial position/sizing.
   * true is the default units, which is relative to the initial canvas setting,
   * in zoom relative units.
   */
  pan?: Point2;
};

/**
 * A view presentation selector allows choosing what view attributes should be
 * returned by a call to getViewPresentation.  This allows a shared selection
 * object to be used to specify which presentation attributes are to be used.
 *
 * For example, a synchronizer might choose to use a presentation selector
 * so that multiple viewports could specify to synchronizer, say slabThickness
 * and windowLevel across one set, while a different synchronizer would choose
 * to apply zoom and pan.
 * Then, a resize operation might choose to synchronize display area, zoom and pan, but
 * not window level or slab thickness.
 * A store/remember state of viewport might choose to synchronize everything
 * Individual tools might choose to use synchronization of the specific attribute
 * which they are modifying (such as rotation) for history undo/redo, but use the
 * same re-apply function to undo the remembered history.
 *
 * It is certainly possible to implement each of these with their own selectors
 * which call the particular get/set functions, but that makes it more work to
 * share particular sets for different uses.
 */
export type ViewPresentationSelector = {
  slabThickness?: boolean;
  // Camera relative parameters
  rotation?: boolean;
  displayArea?: boolean;
  zoom?: boolean;
  pan?: boolean;
  // Transfer function relative parameters
  windowLevel?: boolean;
  paletteLut?: boolean;
};

/**
 * Viewport interface for cornerstone viewports
 */
interface IViewport {
  /** unique identifier of the viewport */
  id: string;

  getWidget: (id: string) => any;

  addWidget: (id: string, widget: any) => void;

  getWidgets: () => any;

  removeWidgets: () => void;

  /** renderingEngineId the viewport belongs to */
  renderingEngineId: string;
  /** viewport type, can be ORTHOGRAPHIC or STACK for now */
  type: ViewportType;
  /** canvas associated to the viewport */
  canvas: HTMLCanvasElement;
  /** public DOM element associated to the viewport */
  element: HTMLDivElement;
  /** sx of the viewport on the offscreen canvas (if rendering using GPU) */
  sx: number;
  /** sy of the viewport on the offscreen canvas (if rendering using GPU) */
  sy: number;
  /** width of the viewport on the offscreen canvas (if rendering using GPU) */
  sWidth: number;
  /** height of the viewport on the offscreen canvas (if rendering using GPU) */
  sHeight: number;
  /** actors rendered in the viewport*/
  _actors: Map<string, any>;
  /** viewport default options including the axis, and background color  */
  defaultOptions: any;
  /** viewport options */
  options: ViewportInputOptions;
  /** Suppress events */
  suppressEvents: boolean;
  /** if the viewport has been disabled */
  isDisabled: boolean;
  /** The rendering state of this viewport */
  viewportStatus: ViewportStatus;
  /** get the rotation either from the camera provided or the viewport if not provided */
  getRotation: () => number;
  /** frameOfReferenceUID the viewport's default actor is rendering */
  getFrameOfReferenceUID: () => string;
  /** method to convert canvas to world coordinates */
  canvasToWorld: (canvasPos: Point2) => Point3;
  /** method to convert world to canvas coordinates */
  worldToCanvas: (worldPos: Point3) => Point2;
  /** get the first actor */
  getDefaultActor(): ActorEntry;
  /** returns all the actor entires for a viewport which is an object containing actor and its uid */
  getActors(): Array<ActorEntry>;
  /** returns specific actor by its uid */
  getActor(actorUID: string): ActorEntry;
  /** returns specific actor uid by array index */
  getActorUIDByIndex(index: number): string;
  /** returns specific actor by array index */
  getActorByIndex(index: number): ActorEntry;
  /** set and overwrite actors in a viewport */
  setActors(actors: Array<ActorEntry>): void;
  /** add actors to the list of actors */
  addActors(actors: Array<ActorEntry>): void;
  /** add one actor */
  addActor(actorEntry: ActorEntry): void;
  /** get actor UIDs */
  getActorUIDs(): Array<string>;
  /** remove all actors from the viewport */
  removeAllActors(): void;
  /** remove array of uids */
  removeActors(actorUIDs: Array<string>): void;
  /** returns the renderingEngine instance the viewport belongs to */
  getRenderingEngine(): any;
  /** returns the vtkRenderer (for GPU rendering) of the viewport */
  getRenderer(): void;
  /** triggers render for all actors in the viewport */
  render(): void;
  /** set options for the viewport */
  setOptions(options: ViewportInputOptions, immediate: boolean): void;
  /** set displayArea for the viewport */
  setDisplayArea(
    displayArea: DisplayArea,
    callResetCamera?: boolean,
    suppressEvents?: boolean
  );
  /** returns the displayArea */
  getDisplayArea(): DisplayArea | undefined;
  /** reset camera and options*/
  reset(immediate: boolean): void;
  /** returns the canvas */
  getCanvas(): HTMLCanvasElement;
  /** returns camera object */
  getCamera(): ICamera;
  /** Sets the rendered state to rendered if the render actually showed image data */
  setRendered(): void;
  /** returns the parallel zoom relative to the default (eg returns 1 after reset) */
  getZoom(): number;
  /** Sets the relative zoom - set to 1 to reset it */
  setZoom(zoom: number, storeAsInitialCamera?: boolean);
  /** Gets the canvas pan value */
  getPan(): Point2;
  /** Sets the canvas pan value */
  setPan(pan: Point2, storeAsInitialCamera?: boolean);
  /** sets the camera */
  setCamera(cameraInterface: ICamera, storeAsInitialCamera?: boolean): void;
  /** Gets the number of slices in the current camera orientation */
  getNumberOfSlices(): number;
  /** Gets the current slice in the current camera orientation */
  getCurrentImageIdIndex(): number;
  /** Gets a referenced image url of some sort - could be a real image id, or could be a URL with parameters */
  getReferenceId(viewRefSpecifier?: ViewReferenceSpecifier): string;
  /**
   * Gets a view target specifying WHAT a view is displaying,
   * allowing for checking if a given image is displayed or could be displayed
   * in a given viewport.
   * See getViewPresentation for HOW a view is displayed.
   *
   * @param viewRefSpecifier - choose an alternate view to be specified, typically
   *      a different slice index in the same set of images.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  /**
   * Find out if this viewport does or could show this view reference.
   *
   * @param options - allows specifying whether the view COULD display this with
   *                  some modification - either navigation or displaying as volume.
   * @returns true if the viewport could show this view reference
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
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
  getViewPresentation(viewPresSel?: ViewPresentationSelector): ViewPresentation;
  /**
   * Selects both what a viewport is showing (which image/slice) as well as how it
   * is being presented.  If only one or the other values is provided, the
   * currently applied view for the other attribute is preserved, allowing for
   * remember specific sets of attributes.
   *
   * @param viewRef - the basic positioning in terms of what image id/slice index/orientation to display
   *        * The viewRef must be applicable to the current stack or volume, otherwise an exception will be thrown
   * @param viewPres - the presentation information to apply to the current image (as chosen above)
   */
  setView(viewRef?: ViewReference, viewPres?: ViewPresentation);

  /** whether the viewport has custom rendering */
  customRenderViewportToCanvas: () => unknown;
  _getCorners(bounds: Array<number>): Array<number>[];
  updateRenderingPipeline: () => void;
}

/**
 * Public Interface for viewport input to get enabled/disabled or set
 */
type PublicViewportInput = {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions?: ViewportInputOptions;
};

type NormalizedViewportInput = {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions: ViewportInputOptions;
};

type InternalViewportInput = {
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  viewportId: string;
  type: ViewportType;
  defaultOptions: ViewportInputOptions;
};

type ViewportInput = {
  id: string;
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  renderingEngineId: string;
  type: ViewportType;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
};

export type {
  IViewport,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
};
