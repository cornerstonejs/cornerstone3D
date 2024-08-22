import type Point2 from './Point2';
import type Point3 from './Point3';
import type ViewportInputOptions from './ViewportInputOptions';
import type ViewportType from '../enums/ViewportType';
import type DisplayArea from './displayArea';
import type { BoundsLPS } from './BoundsLPS';
import type Viewport from '../RenderingEngine/Viewport';
/**
 * Specifies what view to get a reference for.
 * This set of options allows a Viewport to return a reference for an image
 * not currently in view, such as for a different slice, or containing a given
 * set of points.
 */
export interface ViewReferenceSpecifier {
  /**
   * The slice index within the current viewport camera to get a reference for.
   * Note that slice indexes are dependent on the particular view being shown
   * and cannot be shared across different view types such as stacks and
   * volumes, or two viewports showing different orientations or slab thicknesses.
   */
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
}

/**
 * It is often important to decide if a given view can display a specific
 * view reference.  For example, annotations need to know if they are
 * shown on a view.  Some operations need to know if the view COULD show
 * the given object if certain changes were made to the view.  This object
 * allows specifying what changes are permitted in order to determine if the
 * view could show the image.
 */
export interface ReferenceCompatibleOptions {
  /**
   * Test whether the view could be shown if the viewport were navigated.
   * That is, test is just changing the slice position and zoom/pan would
   * allow showing the view.
   */
  withNavigation?: boolean;
  /**
   * For a stack viewport, return true if this viewport could show the given
   * view if it were converted into a volume viewport.  Has no affect on volume
   * viewports.
   */
  asVolume?: boolean;
  /**
   * For volume viewports, return true if this viewport could show the given view
   * if the orientation was changed.
   */
  withOrientation?: boolean;
  // Todo: im not sure what is this
  /**
   * Use this imageURI for testing - may or may not be the current one.
   * Should be a straight contains URI for the set of imageIds in any of
   * the volumes or set of image ids.
   * This is an optimization setting only that makes the test faster, and does
   * not need to be provided.
   */
  imageURI?: string;

  /**
   * To see if the reference could be overladed (labelmap, fusion) on the viewport, set this to true.
   */
  asOverlay?: boolean;
}

/**
 * A view reference references the image/location of an image.  Typical use
 * cases include remembering the current position of a viewport to allow returning
 * to it later, as well as determining whether specific views should show annotations
 * or other overlay information.
 */
export interface ViewReference {
  /**
   * The FrameOfReferenceUID
   */
  FrameOfReferenceUID?: string;
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
   * The focal point of the camera in world space.
   * The focal point is used for to define the stack positioning, but not the
   * zoom/pan (which is defined by the view presentation
   * object.)
   *
   * Single point objects (probe etc) should use the probe point as the camera
   * focal point as that allows omitting the view plane normal and showing the probe
   * in any orientation.
   */
  cameraFocalPoint?: Point3;
  /**
   * The normal for the current view.  This defines the plane used to show the
   * 2d annotation.  This should be omitted if the annotation is a point to
   * allows for single-point annotations.
   */
  viewPlaneNormal?: Point3;
  /**
   * The view up - this is only used for resetting orientation
   */
  viewUp?: Point3;
  /**
   * The slice index or range for this view.
   * <b>NOTE</b> The slice index is relative to the volume or stack of images.
   * You cannot apply a slice index from one volume to another as they do NOT
   * apply.   The referencedImageId should belong to the volume you are trying
   * to apply to, the viewPlane normal should be identical, and then you can
   * apply the sliceIndex.
   *
   * For stack viewports, the referencedImageId should occur at the given slice index.
   *
   * <b>Note 2</b>slice indices don't necessarily indicate anything positionally
   * within the stack of images - subsequent slice indexes can be at opposite
   * ends or can be co-incident but separate types of images.
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
}

/**
 * A view presentation stores information about how the view is presented to the
 * user, such as rotation, the displayed area, pan/zoom etc.  This is represented
 * as values which are independent of the view type or size as much as possible,
 * by normalizing the values to the type of view presented.  This allows
 * remember or synchronizing values in a much wider variety of places than
 * using the raw/underlying view data such as camera position.
 */
export interface ViewPresentation {
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
}

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
export interface ViewPresentationSelector {
  slabThickness?: number;
  // Camera relative parameters
  rotation?: boolean;
  displayArea?: boolean;
  zoom?: boolean;
  pan?: boolean;
  // Transfer function relative parameters
  windowLevel?: boolean;
  paletteLut?: boolean;
}

export interface DataSetOptions {
  /**
   * The group id is a volume, display set or other identification for the
   * overall set of data.  If set, then two sets of images can be compared for
   * equality by comparing the group id.
   * For volumes, if set, the groupId must be the primary volumeId.
   */
  groupId?: string;
  viewSelector?: ViewPresentationSelector;
  viewReference?: ViewReferenceSpecifier;
}

type IViewport = Viewport;

/**
 * Public Interface for viewport input to get enabled/disabled or set
 */
interface PublicViewportInput {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions?: ViewportInputOptions;
}

interface NormalizedViewportInput {
  /** HTML element in the DOM */
  element: HTMLDivElement;
  /** unique id for the viewport in the renderingEngine */
  viewportId: string;
  /** type of the viewport */
  type: ViewportType;
  /** options for the viewport */
  defaultOptions: ViewportInputOptions;
}

interface InternalViewportInput {
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  viewportId: string;
  type: ViewportType;
  defaultOptions: ViewportInputOptions;
}

interface ViewportInput {
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
}

export type {
  IViewport,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
};
