import type Point2 from './Point2';
import type Point3 from './Point3';
import type ViewportInputOptions from './ViewportInputOptions';
import type ViewportType from '../enums/ViewportType';
import type DisplayArea from './displayArea';
import type { BoundsLPS } from './BoundsLPS';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type { mat4 } from 'gl-matrix';
import type ViewportStatus from '../enums/ViewportStatus';
import type ICamera from './ICamera';
import type { SetAspectRatioOptions } from './ICamera';
import type { ActorEntry, ImageActor } from './IActor';
import type IRenderingEngine from './IRenderingEngine';
import type { ViewportProperties } from './ViewportProperties';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type { FidelityLine } from '../RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import type { ViewportFidelityState } from './ViewportFidelity';
/**
 * Specifies what view to get a reference for.
 * This set of options allows a Viewport to return a reference for an image
 * not currently in view, such as for a different slice, or containing a given
 * set of points.
 */
export type ViewReferenceSpecifier = {
  /**
   * The slice index within the current viewport camera to get a reference for.
   * Note that slice indexes are dependent on the data in a viewport, and will
   * be used to generate a view reference or referenced image, but are not the
   * reference itself.
   */
  sliceIndex?: number;
  /**
   * The end index - this requires sliceIndex to be specified.
   * This will result in a view reference containing a range, specified
   * by the starting and ending images or by a thickness for a volume.
   *
   * Note that in the view reference, this gets created as a multiSliceReference
   * containing a ReferencedImageRange object referencing the final image in the range.
   * The specifier is done this way because it is a logical way for users of the specifier
   * to choose an end range, while the use of the range internally is handled as a multi slice
   * specifier.
   */
  rangeEndSliceIndex?: number;

  /**
   * The frame number for a multiframe
   */
  frameNumber?: number;

  /**
   * Specifies to get a view reference that refers to the generic frame of
   * reference rather than to a specific volume or stack.  Thus, the view
   * reference would be compatible with any view showing the same frame of
   * reference UID.
   *
   * This controls whether the returned view reference carries a `volumeId`:
   * - `true` - a frame-of-reference reference: it is NOT volume specific, so
   *   the `volumeId` is omitted (the reference stays compatible with any view
   *   of the same `FrameOfReferenceUID`).
   * - `false` or `undefined` (the default) - the reference is bound to the
   *   viewport's volume and includes its `volumeId`.
   *
   * In other words the `volumeId` is included whenever
   * `forFrameOfReference !== true`.  All viewport implementations
   * (`BaseVolumeViewport.getViewReference`, `planarViewReference`) must follow
   * this same rule so the flag has one meaning everywhere.
   */
  forFrameOfReference?: boolean;
  /**
   * Set of points to get a reference for, in world space
   */
  points?: Point3[];
  /**
   * Compute the in-plane vectors of the plane restriction from the points,
   * even when the restriction already holds a pair.
   *
   * This flag applies to three points or more, which is the only case where
   * `updatePlaneRestriction` keeps an existing pair. A camera gives an exact
   * pair from its cross products, and that pair describes the same plane that
   * three points pin, so the function keeps the pair by default. Set this flag
   * when the points are the authority, for example when the code rebuilds a
   * reference from stored annotation data.
   */
  forceInPlaneVectors?: boolean;
  /**
   * The volumeId to reference
   */
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
export interface ReferenceCompatibleOptions {
  /**
   * Test whether the view could be shown if the viewport were navigated.
   * That is, test is just changing the slice position and zoom/pan would
   * allow showing the view.
   * This will not return a match if the normal of the measurement and the viewport
   * aren't the same (or opposite), but only if the slice index/focal point were changed.
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
   * if the camera was changed to a different viewNormal orientation.
   */
  withOrientation?: boolean;

  /**
   * Use this imageURI for testing - may or may not be the current one.
   * Should be a straight contains URI for the set of imageIds in any of
   * the volumes or set of image ids.
   * This is an optimization setting only that makes the test faster, and does
   * not need to be provided.
   *
   * @deprecated Going away in the next release as this is no longer required
   */
  imageURI?: string;
  /**
   * As nearby projection
   */
  asNearbyProjection?: boolean;

  /**
   * To see if the reference could be overlaid (labelmap, fusion) on the viewport, set this to true.
   */
  asOverlay?: boolean;
}

/**
 * A referenced image range is used for specifying that an annotation applies
 * to a range of images.  The content value references the last image included,
 * while the top level view reference specifies the first image included.
 * It is itself a view reference, allowing it to be used for setViewReference.
 */
export type ReferencedImageRange = ViewReference & {
  referencedImageId: string;
};

/**
 * A plane restriction is an object that restricts which camera views are
 * compatible with the restriction.  Currently the restriction only
 * allows being specified via the frame of reference and a point in the
 * view and up to two in plane vectors.
 *
 * If only the FOR and a point is specified, any camera view containing that point
 * is viewable.
 *
 * If a inPlaneVector(s) are specified, they must also be orthogonal to the view plane normal.
 *
 * Other types of plane restrictions may be defined at a later point.
 *
 * ## Compatibility, and NOT restoration
 *
 * A plane restriction answers one question: which camera views CAN show this
 * data. A plane restriction never answers the other question: which camera
 * view the application SHOULD go back to. The two jobs belong to two different
 * parts of a `ViewReference`:
 *
 * - `planeRestriction` states compatibility. Each field of a plane restriction
 *   removes views that cannot show the data. A restriction that says less
 *   allows more views, and that is correct whenever the data itself says less.
 * - `viewPlaneNormal` and `viewUp` at the top level of the `ViewReference`
 *   state the view to restore. They record the camera that the user had, and
 *   an application uses both to set an orientation back. The
 *   `viewPlaneNormal` alone decides which view matches, and which viewport an
 *   application prefers, because two views of one plane that differ only in
 *   rotation are rare enough to ignore.
 *
 * Never fill an in-plane vector from the camera to make a view restore
 * correctly. A camera pair added to a one point restriction claims that the
 * point lies in one plane only, so every viewport of another orientation
 * reports that the viewport cannot show the point, which is false.
 * `updatePlaneRestriction` therefore records exactly what the points support:
 * no in-plane vector for one point, `inPlaneVector1` alone for two points, and
 * both vectors for three or more points.
 *
 * A viewport applies the restriction and the top level orientation together. A
 * restriction that pins no orientation does not make every view compatible: a
 * `viewPlaneNormal` at the top level still has to match, unless the caller
 * passes `withOrientation`.
 */
export type PlaneRestriction = {
  FrameOfReferenceUID: string;

  /**
   * A single point within the reference plane is required for all references
   */
  point: Point3;

  /**
   * An inPlaneVector1 is required for all colinear referenced planes.
   * Shall not be undefined if inPlaneVector2 is defined.
   *
   * Set this vector only from the data. Two points give the direction between
   * the two points. One point gives no direction, so one point leaves this
   * vector undefined.
   */
  inPlaneVector1?: Point3;

  /**
   * An inPlaneVector2 is required for all full planar definitions.
   * Shall have a non-zero dot product with inPlaneVector1, that is, shall be
   * non-colinear with inPlaneVector1.
   *
   * Set this vector only when the data pins a plane, which needs three points
   * or more. Fewer points leave this vector undefined.
   */
  inPlaneVector2?: Point3;

  /**
   * The thickness of the referenced plane: a **full** geometric thickness in
   * mm, not a half thickness.
   *
   * This value states compatibility, like the rest of the restriction: it
   * widens the set of focal planes that can show the data. The name pairs with
   * `viewportSlabThickness`, which is the other quantity of the depth test.
   *
   * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
   */
  referencePlaneThickness?: number;
};

/**
 * A view reference references the image/location of an image.  Typical use
 * cases include remembering the current position of a viewport to allow returning
 * to it later, as well as determining whether specific views should show annotations
 * or other overlay information.
 *
 * Note this is an interface as it is designed to allow extension/customization
 * by additional Viewport modules.
 */
export interface ViewReference {
  /**
   * The FrameOfReferenceUID
   */
  FrameOfReferenceUID?: string;

  /**
   * Logical dataset id for the referenced data.
   */
  dataId?: string;

  /**
   * A referenced plane identifies one or more planes.
   * Currently this has a point within the plane to identify the focal depth
   * (but NOT the focal point), and up to two coplanar vectors.
   *
   * The referenced plane is visible depth wise if the point minus the focal point of hte
   * current view is orthogonal to the view plane normal of the viewport.
   * This is sufficient for a single-point identifier.
   * For a line, the inPlaneVector must be orthogonal to the view plane normal of the viewport.
   * For a planar annotation, both inPlaneVectors must be orthogonal to the view plane normal of the viewport.
   *
   * This extension from the least specific to the most specific types of views allows
   * determining whether a view can be seen in a variety of conditions.  It does not
   * allow recovering the original view reference.
   */
  planeRestriction?: PlaneRestriction;

  /**
   * An optional property used to specify the particular image that this view includes.
   * For volumes, that will specify which image is closest to the requested
   * point(s) in some fashion, or will be undefined when the reference applies
   * to any volume with the same frame of reference.
   *
   * The naming of this particular attribute matches the DICOM SR naming for the
   * referenced image, as well as historical naming in CS3D.
   *
   * For range/selection, this must be the starting range referenced image id
   */
  referencedImageId?: string;

  /**
   * This is an internal copy of referencedImageId without the volume loader
   * specification included.  It is used for equality and fast lookup checks
   * to find whether and how this view reference can be displayed on a viewport.
   */
  referencedImageURI?: string;

  /**
   * The multi-slice selection is some sort of specifier for additional
   * view references which extend this selection to additional slices.
   * The only allowed current value is the referenced image range, to select
   * a range of slices, but the intent is to allow other types of references
   * to be included in the future.
   */
  multiSliceReference?: ReferencedImageRange;

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
   * This value is primarily an informational slice index as it isn't a reliable
   * way to navigate to a specified slice.  HOwever, if it is the only value
   * provided, then it can be used to navigate to a specific slice index.  As
   * well, it can be used as informational display information.
   *
   * The slice index for the image of interest
   * <b>NOTE</b> The slice index is relative to the volume or video image.
   * You cannot apply a slice index from one volume or stack to another as they do NOT
   * apply.   The referencedImageId should belong to the volume you are trying
   * to apply to, the viewPlane normal should be identical, and then you can
   * apply the sliceIndex.
   *
   *
   * <b>Warning</b>The slice index is not deterministic between different sets
   * of images containing the same image id.  It is intended more as information
   * useful for display about a given view reference with a given context.
   * The intent is to move this to the statistics data to specify the stats for
   * a given slice object.
   *
   */
  sliceIndex?: number;

  /**
   * 1-based dimension group number for dynamic/dimensional data.
   */
  dimensionGroupNumber?: number;

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

  /**
   * The flip horizontal value is true if the view is flipped horizontally.
   */
  flipHorizontal?: boolean;

  /**
   * The flip vertical value is true if the view is flipped vertically.
   */
  flipVertical?: boolean;

  /**
   * The aspect ratio is how the viewport image is stretched and the default is [1,1].
   */
  aspectRatio?: Point2;
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
  aspectRatio?: boolean;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  // Transfer function relative parameters
  windowLevel?: boolean;
  paletteLut?: boolean;
}

export type DataSetOptions = {
  /**
   * The group id is a volume, display set or other identification for the
   * overall set of data.  If set, then two sets of images can be compared for
   * equality by comparing the group id.
   * For volumes, if set, the groupId must be the primary volumeId.
   */
  groupId?: string;
  viewSelector?: ViewPresentationSelector;
  viewReference?: ViewReferenceSpecifier;
};

/**
 * Enabled viewport handle used by the rendering engine.
 *
 * It lists the public members of the legacy `Viewport` class, which
 * implements it. Fidelity reporting (`canReportFidelity`, `getFidelityState`,
 * `notifyFidelityStateChanged`) is also declared on `IViewportFidelity`.
 * Generic ("next") viewports implement the same surface and are stored in the
 * engine map through a cast to this type.
 */
interface IViewport {
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
   * The viewport type originally requested by the caller, before any internal
   * compatibility remap (e.g. STACK/ORTHOGRAPHIC requested as PLANAR_NEXT when
   * `rendering.useGenericViewport` is enabled). Equals `type` when not remapped.
   * Set by the rendering engine at creation. Use this when branching on the
   * legacy viewport type so the branch is transparent across compat adapters.
   */
  requestedType?: ViewportType;
  isDisabled: boolean;
  /** Record the rendering status, mostly for testing purposes, but can also
   * be useful for knowing things like whether the viewport is initialized
   */
  viewportStatus: ViewportStatus;
  /** sx of viewport on the offscreen canvas */
  sx: number;
  /** sy of viewport on the offscreen canvas */
  sy: number;
  /** sWidth of viewport on the offscreen canvas */
  sWidth: number;
  /** sHeight of viewport on the offscreen canvas */
  sHeight: number;
  /** a Map containing the actor uid and actors */
  _actors: Map<string, ActorEntry>;
  /** Default options for the viewport which includes orientation, viewPlaneNormal and backgroundColor */
  readonly defaultOptions: ViewportInputOptions;
  /** options for the viewport which includes orientation axis, backgroundColor and displayArea */
  options: ViewportInputOptions;
  /** A flag representing if viewport methods should fire events or not */
  readonly suppressEvents: boolean;
  getRotation: () => number;
  getFrameOfReferenceUID: () => string;
  canvasToWorld: (canvasPos: Point2) => Point3;
  worldToCanvas: (worldPos: Point3) => Point2;
  customRenderViewportToCanvas: () => unknown;
  resize: () => void;
  getProperties: () => ViewportProperties;
  updateRenderingPipeline: () => void;
  getNumberOfSlices: () => number;
  getUseCustomRenderingPipeline(): boolean;
  /**
   * RenderingEngine-owned resize hook for custom-pipeline viewports. Legacy
   * viewports keep the previous camera-preserving behavior by default.
   */
  resizeForRenderingEngine(options?: RenderingEngineResizeOptions): void;
  /**
   * Returns whether the viewport supports changing orientation (e.g. via setCamera
   * with viewPlaneNormal/viewUp). Used by tools like OrientationControllerTool to
   * decide where to show interactive orientation markers.
   */
  isOrientationChangeable(): boolean;
  addWidget: (widgetId: unknown, widget: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getWidget: (id: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getWidgets: () => any[];
  /**
   * Get render passes for this viewport.
   * Viewports can override this to provide custom render passes (e.g., for sharpening).
   * @returns Array of VTK render passes or null if no custom passes are needed
   */
  getRenderPasses: () => unknown[] | null;
  removeWidgets: () => void;
  dispose(): void;
  destroy(): void;
  /**
   * Indicate that the image has been rendered.
   * This will set the viewportStatus to RENDERED if there is image data
   * available to actually be rendered - otherwise, the rendering simply showed
   * the background image.
   */
  setRendered(): void;
  /**
   * Mark the viewport as needing a render pass (e.g. after external display-set / segmentation updates).
   * Does not queue a render; the rendering engine’s normal RAF cycle will pick this up.
   */
  setNeedsRender(): void;
  /**
   * Returns the rendering engine driving the `Viewport`.
   *
   * @returns The RenderingEngine instance.
   */
  getRenderingEngine(): IRenderingEngine;
  /**
   * Returns the `vtkRenderer` responsible for rendering the `Viewport`.
   *
   * @returns The `vtkRenderer` for the `Viewport`.
   */
  getRenderer(): vtkRenderer;
  /**
   * Renders the `Viewport` using the `RenderingEngine`.
   */
  render(): void;
  /**
   * Whether this viewport can report fidelity (GENVIEW-FIDELITY-8). Subclasses
   * that show degraded data override this. The built-in indicator attaches
   * only when this returns true.
   */
  canReportFidelity(): boolean;
  /**
   * Absolute per-viewport fidelity record (FIDELITY-EVENT-5).
   * Does not fire `VIEWPORT_FIDELITY_CHANGED`. Does not include a reader
   * verdict — use {@link compareVoxelQuality} for that.
   */
  getFidelityState(): ViewportFidelityState;
  /**
   * Fidelity lines for the built-in indicator UI. Applications should use
   * {@link getFidelityState} instead.
   */
  getFidelityLines(): FidelityLine[];
  /**
   * Fires `VIEWPORT_FIDELITY_CHANGED` when the derived fidelity state changes
   * (FIDELITY-EVENT-2..4). The rendering engines call this after each render.
   * A viewport that cannot report fidelity does nothing.
   *
   * @internal
   */
  notifyFidelityStateChanged(): void;
  /**
   * Sets new options and (TODO) applies them.
   *
   * @param options - The viewport options to set.
   * @param immediate - If `true`, renders the viewport after the options are set.
   */
  setOptions(options: ViewportInputOptions, immediate?: boolean): void;
  /**
   * Resets the options the `Viewport`'s `defaultOptions`
   *
   * @param immediate - If `true`, renders the viewport after the options are reset.
   */
  reset(immediate?: boolean): void;
  getSliceViewInfo(): {
    width: number;
    height: number;
    sliceIndex: number;
    slicePlane: number;
    sliceToIndexMatrix: mat4;
    indexToSliceMatrix: mat4;
  };
  /**
   * Get the default actor
   * @returns An actor entry.
   */
  getDefaultActor(): ActorEntry;
  /**
   * Get all the actors in the viewport
   * @returns An array of ActorEntry objects.
   */
  getActors(): ActorEntry[];
  /**
   * Returns an array of unique identifiers for all the actors in the viewport.
   * @returns An array of strings
   */
  getActorUIDs(): string[];
  /**
   * Get an actor by its UID
   * @param actorUID - The unique ID of the actor.
   * @returns An ActorEntry object.
   */
  getActor(actorUID: string): ActorEntry;
  /**
   * Retrieves an image actor from the viewport actors.
   *
   * @param volumeId - Optional. The ID of the volume to find the corresponding image actor.
   * @returns The image actor if found, otherwise null.
   */
  getImageActor(volumeId?: string): ImageActor | null;
  /**
   * Get an actor UID by its index
   * @param index - array index.
   * @returns actorUID
   */
  getActorUIDByIndex(index: number): string;
  /**
   * Get an actor by its index
   * @param index - array index.
   * @returns actorUID
   */
  getActorByIndex(index: number): ActorEntry;
  /**
   * It removes all actors from the viewport and then adds the actors from the array.
   * @param actors - An array of ActorEntry objects.
   */
  setActors(actors: ActorEntry[]): void;
  /**
   * Remove the actors with the given UIDs from the viewport
   * @param actorUIDs - An array of actor UIDs to remove.
   */
  removeActors(actorUIDs: string[]): void;
  /**
   * Add a list of actors (actor entries) to the viewport
   * @param resetCamera - force reset pan and zoom of the camera,
   *        default value is false.
   * @param actors - An array of ActorEntry objects.
   */
  addActors(actors: ActorEntry[], options?: { resetCamera?: boolean }): void;
  /**
   * Add an actor to the viewport including its id, its actor and slabThickness
   * if defined
   * @param actorEntry - ActorEntry
   *    * actorEntry.uid - The unique identifier for the actor.
   *    * actorEntry.actor - The volume actor.
   *    * actorEntry.slabThickness - The slab thickness.
   */
  addActor(actorEntry: ActorEntry): void;
  /**
   * Remove all actors from the renderer
   */
  removeAllActors(): void;
  /**
   * Sets the camera to an initial bounds. If
   * resetPan and resetZoom are true it places the focal point at the center of
   * the volume (or slice); otherwise, only the camera zoom and camera Pan or Zoom
   * is reset for the current view.
   * @param displayArea - The display area of interest.
   * @param suppressEvents - If true, don't fire displayArea event.
   */
  setDisplayArea(displayArea: DisplayArea, suppressEvents?: boolean): void;
  getDisplayArea(): DisplayArea | undefined;
  /**
   * Resets the camera based on the rendering volume(s) bounds. If
   * resetPan and resetZoom are true it places the focal point at the center of
   * the volume (or slice); otherwise, only the camera zoom and camera Pan or Zoom
   * is reset for the current view.
   * @param options - The reset options
   * @param options.resetPan - If true, the camera focal point is reset to the center of the volume (slice)
   * @param options.resetZoom - If true, the camera zoom is reset to the default zoom
   * @param options.resetToCenter - If true, the camera is reset to the center of the volume (slice)
   * @param options.storeAsInitialCamera - If true, reset camera is stored as the initial camera (to allow differences to
   *   be detected for pan/zoom values)
   * @param options.resetAspectRatio - If true, the aspect ratio of the viewport options is applied, otherwise the
   *   current aspect ratio of the camera is kept. The zoom calculation uses that aspect ratio, so `resetZoom: true`
   *   fits a stretched image into the viewport.
   * @returns boolean
   */
  resetCamera(options?: {
    resetPan?: boolean;
    resetZoom?: boolean;
    resetToCenter?: boolean;
    storeAsInitialCamera?: boolean;
    resetAspectRatio?: boolean;
  }): boolean;
  /**
   * Helper function to return the current canvas pan value.
   *
   * @returns a Point2 containing the current pan values
   * on the canvas,
   * computed from the current camera, where the initial pan
   * value is [0,0].
   */
  getPan(initialCamera?: ICamera<number>): Point2;
  getCurrentImageIdIndex(): number;
  getSliceIndex(): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getImageData(): any;
  /**
   * Gets a referenced image url of some sort - could be a real image id, or
   * could be a URL with parameters. Regardless it refers to the currently displaying
   * image as a string value.
   */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  /**
   * Sets the canvas pan value relative to the initial view position of 0,0
   * Modifies the camera to perform the pan.
   */
  setPan(pan: Point2, storeAsInitialCamera?: boolean): void;
  /**
   * Returns a current zoom level relative to the initial parallel scale
   * originally applied to the image.  That is, on initial display,
   * the zoom level is 1.  Computed as a function of the camera.
   *
   * The zoom is relative to the fit of the aspect ratio that the camera holds,
   * so a zoom of 1 fits the image at every aspect ratio.
   */
  getZoom(compareCamera?: ICamera<number>): number;
  /** Zooms the image using parallel scale by updating the camera value.
   * @param value - The relative parallel scale to apply.  It is relative
   * to the initial offsets value, at the aspect ratio that the camera holds.
   * @param storeAsInitialCamera - can be set to true to reset the camera
   *   after applying this zoom as the initial camera.  A subsequent getZoom
   *   call will return "1", but the zoom will have been applied.
   * @param compareCamera - the camera the zoom is relative to, as for
   *   `getZoom`; defaults to the initial camera.
   */
  setZoom(
    value: number,
    storeAsInitialCamera?: boolean,
    compareCamera?: ICamera<number>
  ): void;
  /**
   * Returns the current aspect ratio of the viewport as a 2D point `[widthRatio, heightRatio]`.
   *
   * @returns The current aspect ratio `[widthRatio, heightRatio]`
   *          based on the active camera settings.
   */
  getAspectRatio(): Point2;
  /**
   * Sets the aspect ratio of the viewport (canvas) using the provided 2D point
   * `[widthRatio, heightRatio]`.
   *
   * This updates the VTK camera's **projection matrix** to apply axis-based
   * stretching during rendering.
   *
   * As a result:
   * - World-to-canvas mapping is updated via the camera projection.
   * - Canvas-to-world mapping is also updated and remains consistent, as
   * VTK utilizes the inverse of the same projection matrix for picking and
   * coordinate transformations.
   *
   * Note:
   * - The camera pose and orientation (position, focal point, and viewPlaneNormal)
   * remain unchanged.
   * - Image data, spacing, and world coordinates are not modified.
   * - The parallel scale remains unchanged, unless the caller gives the `fit`
   * option. Each aspect ratio has a different fit, and `getZoom` reports the
   * zoom against the fit of the aspect ratio that the camera holds.
   *
   * @param value - The aspect ratio to set as `[widthRatio, heightRatio]`.
   * @param options - fit the stretched image, and keep the aspect ratio as the
   *   default. Both default to `false`.
   */
  setAspectRatio(value: Point2, options?: SetAspectRatioOptions): void;
  /**
   * Gets the target output canvas for the `Viewport`.
   *
   * @returns an HTMLCanvasElement.
   */
  getCanvas(): HTMLCanvasElement;
  /**
   * Get the camera's current state
   * @returns The camera object.
   */
  getCamera(): ICamera;
  /**
   * Set the camera parameters
   * @param cameraInterface - ICamera
   * @param storeAsInitialCamera - to set the provided camera as the initial one,
   *    used to compute differences for things like pan and zoom.
   */
  setCamera(cameraInterface: ICamera, storeAsInitialCamera?: boolean): void;
  /**
   * Updates the camera's clipping planes and range.
   */
  updateCameraClippingPlanesAndRange(): void;
  setOrientationOfClippingPlanes(
    vtkPlanes: vtkPlane[],
    slabThickness: number,
    viewPlaneNormal: Point3,
    focalPoint: Point3
  ): void;
  /**
   * Method to get the clipping planes of a given actor
   * @param actorEntry - The actor entry (a specific type you'll define dependent on your code)
   * @returns vtkPlanes - An array of vtkPlane objects associated with the given actor
   */
  getClippingPlanesForActor(actorEntry?: ActorEntry): vtkPlane[];
  /**
   * Gets a view target specifying WHAT a view is displaying,
   * allowing for checking if a given image is displayed or could be displayed
   * in a given viewport.
   * See getViewPresentation for HOW a view is displayed.
   *
   *
   * @param viewRefSpecifier - choose an alternate view to be specified, typically
   *      a different slice index in the same set of images.
   */
  getViewReference(viewRefSpecifier?: ViewReferenceSpecifier): ViewReference;
  isPlaneViewable(
    planeRestriction: PlaneRestriction,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /**
   * Find out if this viewport does or could show this view reference.
   *
   * The plane restriction and the top level orientation are two separate
   * limits, and the viewport applies both. A restriction that pins no
   * orientation, which is what one point gives, therefore does not make every
   * view compatible: the `viewPlaneNormal` of the reference still has to match
   * the camera, unless the caller passes `withOrientation`.
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
   * what all the attributes are.  That differs from methods like getCamera which
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
   * Navigates to the image specified by the viewRef.
   */
  setViewReference(viewRef: ViewReference): void;
  /**
   * Applies the display area, zoom, pan and rotation from the view presentation.
   * No-op is viewPres isn't defined.
   */
  setViewPresentation(viewPres: ViewPresentation): void;
  /**
   * Sets one or more datasets on the viewport. Legacy viewports should
   * override this to delegate to their specific data setter.
   */
  setDataList(
    entries: Array<{ dataId: string; options?: DataSetOptions }>
  ): void;
  /**
   * Records the display sets currently shown on the viewport. The base
   * implementation only stores the entries so that {@link getDisplaySets} can
   * report them; type-specific viewports override this to actually load the data
   * (via their native setter such as `setStack`/`setVolumes`/`setVideo`),
   * delegating to {@link mountDisplaySets} so the clear-then-record ordering is
   * applied consistently.
   *
   * Because the native data setters clear the recorded list (see
   * {@link clearDisplaySets}), driving a viewport with a raw data setter -
   * without going through `setDisplaySets` - leaves `getDisplaySets()` empty,
   * correctly reflecting that the viewport is not display-set driven.
   *
   * @param entries - the display set entries that were mounted; the first entry
   *   is the source and any subsequent entries are overlays.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): void | Promise<void>;
  /**
   * Returns the display sets currently recorded as mounted on the viewport.
   * Empty when the viewport was driven by a raw data setter instead of
   * {@link setDisplaySets}.
   */
  getDisplaySets(): Array<{ displaySetId: string; options?: unknown }>;
}

interface RenderingEngineResizeOptions {
  keepCamera?: boolean;
}

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
  /** original requested type before any internal remapping */
  requestedType?: ViewportType;
  /** options for the viewport */
  defaultOptions: ViewportInputOptions;
}

interface InternalViewportInput {
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  viewportId: string;
  type: ViewportType;
  requestedType?: ViewportType;
  defaultOptions: ViewportInputOptions;
}

interface ViewportInput {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  requestedType?: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  canvas: HTMLCanvasElement;
}

export type {
  IViewport,
  RenderingEngineResizeOptions,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
};
