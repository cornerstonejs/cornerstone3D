import type Point2 from './Point2';
import type Point3 from './Point3';
import type ViewportInputOptions from './ViewportInputOptions';
import type ViewportType from '../enums/ViewportType';
import type DisplayArea from './displayArea';
import type { BoundsLPS } from './BoundsLPS';
import type ViewportStatus from '../enums/ViewportStatus';
import type ICamera from './ICamera';
import type IRenderingEngine from './IRenderingEngine';
import type { FidelityLine } from '../RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import type { ViewportFidelityState } from './ViewportFidelity';
import type { BaseViewportOptions } from '../RenderingEngine/Viewports/BaseViewport';
import type ResolvedViewportView from '../RenderingEngine/Viewports/ResolvedViewportView';
import type { ProjectionWriteOptions } from '../RenderingEngine/Viewports/ViewportProjectionTypes';
import type { PlanarDisplayArea } from '../RenderingEngine/Viewports/Planar/PlanarViewportTypes';
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
   * (`planarViewReference` and the other families) must follow
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
   * In stack mode, return true if this viewport could show the given
   * view if it showed its display set as a volume.  Has no effect in volume
   * mode.
   */
  asVolume?: boolean;

  /**
   * In volume mode, return true if this viewport could show the given view
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

  /**
   * The world points of the annotation that the reference belongs to. A
   * viewport that shows a part of its world in several places, such as an ECG
   * trace layout with several columns, uses them to check that one place
   * shows the whole annotation.
   */
  points?: Point3[];
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
  displaySetId?: string;

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
   * zoom/pan (which is defined by the view framing
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
 * A view framing stores information about how the view is presented to the
 * user, such as rotation, the displayed area, pan/zoom etc.  This is represented
 * as values which are independent of the view type or size as much as possible,
 * by normalizing the values to the type of view presented.  This allows
 * remember or synchronizing values in a much wider variety of places than
 * using the raw/underlying view data such as camera position.
 */
export interface ViewFraming {
  /**
   * The rotation of the view - this is related to cameraViewUp, but is relative
   * to the viewNormal and the default viewUp for that viewNormal.
   */
  rotation?: number;

  /**
   * The display area being shown.  This is more consistent than applying a set
   * of boundary areas. On a planar viewport it is a `PlanarDisplayArea`,
   * whose scale can be a point.
   */
  displayArea?: DisplayArea | PlanarDisplayArea;

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
   * The pan in world units: where the centre of the fitted picture shows,
   * less the centre of the canvas, along the canvas axes, in the units of
   * the world of the viewport (millimetres on a planar or a 3D viewport).
   * It is `pan` times the size of a canvas pixel at zoom 1, so it does not
   * depend on the size of the canvas: a resize, which keeps the camera,
   * keeps it, and a framing written to a viewport of another size shows the
   * same world point at the centre of the canvas. A patch with it takes it
   * in place of `pan`.
   */
  worldPan?: Point2;

  /**
   * The flip horizontal value is true if the view is flipped horizontally.
   */
  flipHorizontal?: boolean;

  /**
   * The flip vertical value is true if the view is flipped vertically.
   */
  flipVertical?: boolean;
}

/**
 * A view framing selector allows choosing what view attributes should be
 * returned by `viewportProjection.getFraming(viewport, { selector })`.  This allows a shared selection
 * object to be used to specify which framing attributes are to be used.
 *
 * For example, a synchronizer might choose to use a framing selector
 * so that multiple viewports could specify to synchronizer, say rotation
 * across one set, while a different synchronizer would choose to apply zoom
 * and pan.
 * Then, a resize operation might choose to synchronize display area, zoom and pan, but
 * not rotation. The slab thickness and the window are not part of the
 * framing: they are the appearance of a display set.
 * A store/remember state of viewport might choose to synchronize everything
 * Individual tools might choose to use synchronization of the specific attribute
 * which they are modifying (such as rotation) for history undo/redo, but use the
 * same re-apply function to undo the remembered history.
 *
 * It is certainly possible to implement each of these with their own selectors
 * which call the particular get/set functions, but that makes it more work to
 * share particular sets for different uses.
 */
export interface ViewFramingSelector {
  rotation?: boolean;
  displayArea?: boolean;
  zoom?: boolean;
  pan?: boolean;
  worldPan?: boolean;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

/**
 * The content a viewport is currently rendering.
 *
 * A planar viewport's content shape (stack vs volume) is decided by the data
 * it is bound to, not by its viewport type. The duck-typing capability guards
 * (`viewportSupportsImageSlices`, `viewportSupportsVolumeId`, ...) only report
 * which methods a viewport exposes, so a single `PlanarViewport` reports
 * support for both stack and volume operations regardless of what it is
 * actually showing.
 *
 * `getCurrentMode()` answers the content question that the capability guards
 * cannot: it reflects the currently bound source data.
 *
 * - `stack`      — image-id stack content (image render path)
 * - `volume`     — volume-backed slice content (volume slice render path)
 * - `volume3d`   — 3D volume rendering
 * - `geometry3d` — a 3D viewport whose source is a surface, with no volume
 * - `video`      — video frames
 * - `wholeSlide` — whole-slide tiles
 * - `ecg`        — ECG waveform
 * - `empty`      — no source data is bound yet
 * - `unknown`    — a viewport family that does not classify its content
 */
type ViewportContentMode =
  | 'stack'
  | 'volume'
  | 'volume3d'
  | 'geometry3d'
  | 'video'
  | 'wholeSlide'
  | 'ecg'
  | 'empty'
  | 'unknown';

/**
 * The interface of a viewport: the public members that every viewport family
 * has (planar, 3D, video, whole slide and ECG), which are those of the base
 * class `BaseViewport`.
 *
 * The class of a family has more members (`PlanarViewport`,
 * `VolumeViewport3D`, `VideoViewport`, `WSIViewport`, `ECGViewport`): type
 * the variable with the class when the family is
 * known, for instance with
 * `renderingEngine.getViewport<PlanarViewport>(viewportId)`, or narrow with
 * `utilities.viewportSupportsDisplaySetAppearance` and
 * `utilities.getViewportContentMode(viewport) === 'stack'`.
 *
 * @typeParam TViewState - The view state of the family. The bare name takes
 * any object.
 * @typeParam TAppearance - The appearance of a display set of the
 * family.
 * @typeParam TFraming - The framing of the family, `PlanarViewFraming` on a
 * planar viewport. The bare name takes the general `ViewFraming`.
 * @typeParam TFramingSelector - The selector of the framing of the family.
 */
interface IViewport<
  TViewState extends object = object,
  TAppearance = unknown,
  TFraming extends ViewFraming = ViewFraming,
  TFramingSelector extends ViewFramingSelector = ViewFramingSelector,
> {
  /** The id of the viewport in its rendering engine. */
  readonly id: string;
  /** The element that the viewport draws in. */
  readonly element: HTMLDivElement;
  /** The type that the viewport was enabled with. */
  readonly type: ViewportType;
  /** The id of the rendering engine that owns the viewport. */
  readonly renderingEngineId: string;
  /** Whether the viewport has data, waits for a draw or is drawn. */
  viewportStatus: ViewportStatus;
  /** The options that the viewport was made with. They do not change. */
  readonly defaultOptions: BaseViewportOptions;
  /**
   * True once the viewport is destroyed, which the rendering engine does when
   * it disables the element. Read only.
   */
  readonly isDestroyed: boolean;

  /**
   * Replaces the mounted display sets. The first entry is the source, the
   * others are overlays unless their options say otherwise.
   */
  setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: unknown }>
  ): Promise<void>;
  /**
   * Mounts one more display set. The options are those of the family, as in
   * `setDisplaySets`: `PlanarMountOptions` on a planar viewport, a render
   * mode and a role on the base class.
   */
  addDisplaySet(displaySetId: string, options: unknown): Promise<void>;
  /** The mounted display sets, the source first. */
  getDisplaySets(): Array<{ displaySetId: string; options?: unknown }>;
  /** Removes a display set and its appearance, and draws again. */
  removeDisplaySet(displaySetId: string): void;
  /** Changes the appearance of the source display set. */
  setDisplaySetAppearance(props: Partial<TAppearance>): void;
  /** Changes the appearance of one display set, for overlays and fusion. */
  setDisplaySetAppearance(
    displaySetId: string,
    props: Partial<TAppearance>
  ): void;
  /**
   * The explicit overrides of the appearance of one display set (the current
   * one when not given): what callers set, none of the defaults. Copy or
   * store this; `setDisplaySetAppearance(id, getDisplaySetAppearance(id))`
   * changes nothing.
   */
  getDisplaySetAppearance(displaySetId?: string): TAppearance | undefined;
  /**
   * The appearance that one display set is drawn with (the current one when
   * not given): its overrides over the defaults, or undefined when it is not
   * mounted. Show or compare this.
   */
  getEffectiveDisplaySetAppearance(
    displaySetId?: string
  ): TAppearance | undefined;
  /**
   * Removes the overrides of one display set (the current one when not
   * given), all of them or the named keys.
   */
  resetDisplaySetAppearance(
    displaySetId?: string,
    keys?: ReadonlyArray<keyof TAppearance & string>
  ): void;
  /** What the viewport shows now. See {@link ViewportContentMode}. */
  getCurrentMode(): ViewportContentMode;

  /** Merges a patch into the view state and draws again. */
  setViewState(viewStatePatch: Partial<TViewState>): void;
  /** The view state. */
  getViewState(): TViewState;
  /** Changes the view state with a patch, or with a function that returns one. */
  updateViewState(
    updater:
      | Partial<TViewState>
      | ((viewState: TViewState) => Partial<TViewState> | void)
  ): void;
  /** Resets the navigation. False when the family has nothing to reset. */
  resetViewState(options?: unknown): boolean;
  /**
   * The framing of the view: zoom, pan, rotation, flips and display area
   * against the fit, which another viewport can take. Undefined while the
   * viewport shows nothing.
   */
  getViewFraming(selector?: TFramingSelector): TFraming | undefined;
  /** Sets the framing of the view as one change of the view state. */
  setViewFraming(
    framing: Partial<TFraming>,
    options?: ProjectionWriteOptions
  ): void;

  /** A reference to what the viewport shows now. */
  getViewReference(specifier?: ViewReferenceSpecifier): ViewReference;
  /** A string that names the view reference. */
  getViewReferenceId(specifier?: ViewReferenceSpecifier): string;
  /** Shows what a reference points to. */
  setViewReference(viewReference: ViewReference): void;
  /** Whether the viewport can show what a reference points to. */
  isReferenceViewable(
    viewReference: ViewReference,
    options?: ReferenceCompatibleOptions
  ): boolean;
  /** The frame of reference of the view, or an id of the viewport itself. */
  getFrameOfReferenceUID(): string;

  /**
   * The resolved view that the viewport derives from its data and its view
   * state: the coordinate transforms and, through `toICamera()`, a camera for
   * reading. Undefined while no data is mounted.
   */
  getResolvedView():
    | ResolvedViewportView<unknown, ICamera<unknown>>
    | undefined;
  /** A canvas point in world coordinates. It throws while no data is mounted. */
  canvasToWorld(canvasPos: Point2): Point3;
  /** A world point in canvas coordinates. It throws while no data is mounted. */
  worldToCanvas(worldPos: Point3): Point2;
  /**
   * The stretch of the axes, divided by the smaller one: `[2, 1]` for a
   * planar view twice as wide as the fit, `[1, 1]` for a view that is not
   * stretched and for the families that do not stretch.
   */
  getAspectRatio(): Point2;

  /** The rendering engine that owns the viewport. */
  getRenderingEngine(): IRenderingEngine;
  /** Draws the viewport. */
  render(): void;
  /** Called by the rendering engine after it drew a frame. */
  setRendered(): void;
  /** Marks the viewport as waiting for a draw, without asking for one. */
  setNeedsRender(): void;
  /** Chooses the render paths again after the render backend changed. */
  updateRenderingPipeline(): void;
  /** Takes the new size of the element. */
  resize(): void;
  /** The resize that the rendering engine calls. */
  resizeForRenderingEngine(options?: RenderingEngineResizeOptions): void;
  /** Does nothing on a family without vtk.js widgets. */
  removeWidgets(): void;
  /** Releases the display sets and the resources of the viewport. */
  destroy(): void;
  /** The same as `destroy`. */
  dispose(): void;

  /** Whether the viewport can report fidelity. */
  canReportFidelity(): boolean;
  /** The fidelity record of the viewport. */
  getFidelityState(): ViewportFidelityState;
  /** The fidelity lines for the built-in indicator. */
  getFidelityLines(): FidelityLine[];
  /**
   * Fires `VIEWPORT_FIDELITY_CHANGED` when the fidelity state changed.
   *
   * @internal
   */
  notifyFidelityStateChanged(): void;
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
  renderingEngineId: string;
  type: ViewportType;
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
  ViewportContentMode,
  RenderingEngineResizeOptions,
  ViewportInput,
  PublicViewportInput,
  InternalViewportInput,
  NormalizedViewportInput,
};
