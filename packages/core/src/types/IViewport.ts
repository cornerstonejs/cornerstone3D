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
 * not currently in view, such as for a different slice, or for a given set of
 * points.
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
 * These are the options arguments to determine whether a view reference
 * is compatible with a viewport, that is, could be or is shown in a viewport.
 * That specifies whether a view could be shown in a given viewport or not.
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
 * A view reference references the image/location of an image.  It
 * basically says would this viewport show this view, or can direct a viewport
 * to show a specific view.
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
 * Viewport interface for cornerstone viewports
 */
interface IViewport {
  /** unique identifier of the viewport */
  id: string;
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
   * Gets a view target, allowing comparison between view positions as well
   * as restoring views later.
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
