import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type {
  BlendModes,
  InterpolationType,
  OrientationAxis,
  RenderBackendValue,
  VOILUTFunctionType,
} from '../../../enums';
import type {
  ActorEntry,
  ColormapPublic,
  IImage,
  IImageVolume,
  OrientationVectors,
  Point2,
  Point3,
  VOIRange,
} from '../../../types';
import type { ViewportInput } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import type { ViewFraming, ViewFramingSelector } from '../../../types';
import type {
  BaseViewportRenderContext,
  BaseAppearanceProps,
  BindingRole,
  DataProvider,
  LoadedData,
  RenderPathResolver,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import type { DisplaySetDescriptor } from '../../../types/DisplaySetDescriptor';
import type ICamera from '../../../types/ICamera';
import type { CameraScaleMode, ViewAnchor } from '../ViewportCameraTypes';
import type DisplayArea from '../../../types/displayArea';
import type { PlanarScaleInput } from './planarCameraScale';
import type { PlanarRenderModeId } from './planarRenderModeIds';
import type { EffectiveRenderBackend } from '../../../types/RenderBackendRegistry';

/**
 * A render mode a planar viewport can mount: the built-in modes plus any mode
 * declared by an extension backend registered via `registerRenderBackend()`
 * (the trailing `string & {}` keeps the union open without erasing the
 * built-in literals from completion).
 * @internal
 */
export type PlanarEffectiveRenderMode = PlanarRenderModeId | (string & {});
/**
 * Why a layer of a planar viewport is drawn the way it is, in one word:
 * - `frame`: the view is the acquisition plane, so the acquired frame is the
 *   image.
 * - `slice`: the view is a plain slice, cut on the CPU (slice first).
 * - `slab`: the view is a slab, drawn from the GPU volume texture.
 * - `sliceFirstOff`: slice first is off for this layer.
 * - `notSampled`: slice first is on, but the CPU sampler does not take this
 *   layer (a segmentation overlay, colour data, or a volume not loaded yet).
 * - `floatFilter`: the device cannot filter the 3D texture of this layer.
 * - `textureSize`: the 3D texture is larger than the device allows.
 * - `textureReduced`: the 3D texture would be reduced (GPU settings), and the
 *   application did not ask for reduced textures.
 * - `textureFailed`: the 3D texture of this layer failed on this page.
 * - `slabTooLarge`: the CPU slab cannot be made exact within the work limit,
 *   so the picture is not the slab yet.
 * - `pinned`: the application pinned the render backend.
 * - `noWebGL`: the device has no WebGL2, so the CPU draws.
 * - `contextLost`: the WebGL context was lost and did not come back, so the
 *   CPU draws.
 */
export type RenderPlanReason =
  | 'frame'
  | 'slice'
  | 'slab'
  | 'sliceFirstOff'
  | 'notSampled'
  | 'floatFilter'
  | 'textureSize'
  | 'textureReduced'
  | 'textureFailed'
  | 'slabTooLarge'
  | 'pinned'
  | 'noWebGL'
  | 'contextLost';

/**
 * How the slice of a layer is made: `frame` (the acquired frame is the
 * image), `cpu` (the CPU cuts the slice out of the volume) or `gpuVolume`
 * (the GPU cuts it out of a 3D texture of the volume). The same words name the
 * slots of `registerRenderBackend()`.
 */
export type RenderPlanSlice = 'frame' | 'cpu' | 'gpuVolume';

/** What draws the slice of a layer: the GPU, or the CPU on a 2D canvas. */
export type RenderPlanDraw = 'gpu' | 'cpu';

/**
 * How one layer (display set) of a planar viewport is drawn
 * (`PlanarViewport.getRenderPlan`). It is the one public description of a
 * render path: match an actor to its layer with `ActorEntry.displaySetId`.
 */
export type RenderPlanLayer = {
  /** The display set id of the layer. */
  displaySetId: string;
  role: BindingRole;
  /** How the slice is made. */
  slice: RenderPlanSlice;
  /** What draws the slice. */
  draw: RenderPlanDraw;
  /**
   * The render backend that draws the layer, as `registerRenderBackend()`
   * registered it and `setRenderBackend()` and the `renderBackend` option
   * take it: `'gpu'`, `'cpu'` or the id of an extension backend. Never
   * `'auto'`: the plan gives the backend that `'auto'` resolved to.
   */
  backend: EffectiveRenderBackend;
  reason: RenderPlanReason;
};

/**
 * The detail of `Events.RENDER_PLAN_CHANGED`: the entry of one layer before
 * and after the change. `previous` is undefined for a layer that was just
 * added.
 */
export type RenderPlanChangedEventDetail = {
  renderingEngineId: string;
  viewportId: string;
  displaySetId: string;
  previous?: RenderPlanLayer;
  current: RenderPlanLayer;
  reason: RenderPlanReason;
};

/**
 * An orientation of a planar view, as the orientation option of a display
 * set, `setOrientation` and `setViewState({ orientation })` take it:
 * - ACQUISITION: the plane of the images.
 * - AXIAL, CORONAL, SAGITTAL: the plane of that patient axis.
 * - AXIAL_REFORMAT, CORONAL_REFORMAT, SAGITTAL_REFORMAT: the axes of the
 *   images, matched to that patient axis. For images that are tilted against
 *   the patient axes the view follows the images.
 * - REFORMAT: the same, for the patient axis closest to the view on display,
 *   or closest to the acquisition when nothing is on display.
 * - View vectors: `viewPlaneNormal` and `viewUp`, orthogonal to each other.
 *   Without a `viewUp` the view takes the one of the acquisition.
 *
 * The view state keeps a reformat name as the view vectors that it stands
 * for, so `getViewState().orientation` never gives one.
 *
 * A stack shows its images in their acquisition plane: in stack mode the
 * orientation of the view state cannot change.
 */
export type PlanarOrientation =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | OrientationAxis.REFORMAT
  | OrientationAxis.AXIAL_REFORMAT
  | OrientationAxis.CORONAL_REFORMAT
  | OrientationAxis.SAGITTAL_REFORMAT
  | OrientationVectors;

/**
 * The descriptor of a display set as a planar viewport reads it.
 *
 * @internal
 */
export interface PlanarDisplaySetDescriptor extends DisplaySetDescriptor {
  imageIds: string[];
  initialImageIdIndex?: number;
  volumeId?: string;
  image?: IImage;
  imageData?: vtkImageData;
  useWorldCoordinateImageData?: boolean;
  reference?: ViewportDataReference;
}

export interface PlanarSetDataOptions {
  orientation?: PlanarOrientation;
  /**
   * Per-display-set render backend override, taking precedence over the
   * global `rendering.planar.renderBackend` configuration. 'cpu' pins this
   * display set to CPU rendering (e.g. to bound GPU memory for a thumbnail
   * viewport mounted next to GPU viewports); 'gpu' pins it to the GPU;
   * 'auto' resolves from capability detection even when the global backend
   * is pinned. Pinned display sets keep their backend across global
   * setRenderBackend() switches. When omitted, the global configuration
   * decides.
   */
  renderBackend?: RenderBackendValue;
  role?: BindingRole;
  /**
   * Slice first for this display set: cut the visible slice on the CPU and
   * draw it as a 2D image in place of a 3D texture, where the render path
   * decision allows it. Wins over the global `rendering.planar.sliceFirst`.
   * @experimental
   */
  sliceFirst?: boolean;
}

/**
 * A load of an image of a stack that failed for good: the error, and the
 * image by its id and its index in the stack.
 *
 * @internal
 */
export interface PlanarStackImageLoadFailure {
  error: unknown;
  imageIdIndex: number;
  imageId: string;
}

/** @internal */
export interface PlanarDataLoadOptions {
  acquisitionOrientation?: PlanarViewState['orientation'];
  orientation: PlanarOrientation;
  renderMode: PlanarEffectiveRenderMode;
  volumeId: string;
}

/** @internal */
export interface PlanarPayload {
  imageIds: string[];
  // Undefined means "no initial slice was requested" - the volume acquisition
  // view centers in that case (see createInitialVolumeSliceState). A concrete
  // number (including an explicit 0) is honored. Consumers that need a scalar
  // placeholder index default it locally with `?? 0`.
  initialImageIdIndex?: number;
  volumeId: string;
  renderMode: PlanarEffectiveRenderMode;
  acquisitionOrientation?: PlanarViewState['orientation'];
  imageVolume?: IImageVolume;
  image?: IImage;
  imageData?: vtkImageData;
  useWorldCoordinateImageData?: boolean;
  reference?: ViewportDataReference;
}

export interface PlanarAppearanceProps extends BaseAppearanceProps {
  colormap?: ColormapPublic;
  voiRange?: VOIRange;
  voiLUTFunction?: VOILUTFunctionType;
  invert?: boolean;
}

export type PlanarDisplayArea = Omit<DisplayArea, 'scale'> & {
  scale?: PlanarScaleInput;
  scaleMode?: CameraScaleMode;
};

export type PlanarViewportInputOptions = Omit<
  ViewportInputOptions,
  'displayArea' | 'renderMode'
> & {
  displayArea?: PlanarDisplayArea;
};

/**
 * The framing of a planar view. `zoom`, `scale` and `pan` describe the
 * picture on the screen against the plain fit of the slice, as tools read
 * and write them. `scaleMode` and `fitScale` describe how the view fits the
 * canvas, so that `setViewFraming(getViewFraming())` changes no pixel, and
 * on a viewport of another size gives the same fit.
 */
export interface PlanarViewFraming extends ViewFraming {
  displayArea?: PlanarDisplayArea;
  /** The scale of each canvas axis against the plain fit of the slice. */
  scale?: Point2;
  /** The scale mode of the view state. */
  scaleMode?: CameraScaleMode;
  /**
   * The scale of the view state: against the display area when there is
   * one, against the fit of the stretched slice for `scaleMode: 'fitAspect'`,
   * and against the plain fit otherwise. A patch with it takes it in place of
   * `scale` and `zoom`.
   */
  fitScale?: Point2;
}

export interface PlanarViewFramingSelector extends ViewFramingSelector {
  scale?: boolean;
  scaleMode?: boolean;
  fitScale?: boolean;
}

export type PlanarSliceState =
  | { kind: 'stackIndex'; imageIdIndex: number }
  | { kind: 'volumePoint'; sliceWorldPoint: Point3 };

export interface PlanarViewState {
  orientation?: PlanarOrientation;
  slice?: PlanarSliceState;
  anchorWorld?: Point3;
  anchorCanvas?: ViewAnchor;
  scale?: PlanarScaleInput;
  scaleMode?: CameraScaleMode;
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  displayArea?: PlanarDisplayArea;
}

export interface PlanarResolvedICamera extends ICamera<PlanarScaleInput> {
  framingScale?: Point2;
  scaleMode?: CameraScaleMode;
}

export interface PlanarProperties {
  blendMode?: BlendModes;
  interpolationType?: InterpolationType;
  slabThickness?: number;
  /**
   * The sharpening of the picture, as the legacy `setProperties({
   * sharpening })`: a render pass of the viewport on the GPU, the same
   * convolution of the canvas on the CPU. 0 is none. Read from the source
   * display set.
   */
  sharpening?: number;
  /**
   * The smoothing of the picture, as the legacy `setProperties({ smoothing
   * })`: a render pass of the viewport on the GPU, the same convolution of
   * the canvas on the CPU. 0 is none. Read from the source display set.
   */
  smoothing?: number;
}

export type PlanarDisplaySetAppearance = PlanarAppearanceProps &
  PlanarProperties;

/** @internal */
export interface PlanarRenderPathRuntime {
  renderMode: PlanarEffectiveRenderMode;
}

/** @internal */
export interface PlanarActiveViewRuntime {
  activeSourceICamera?: PlanarResolvedICamera;
}

/** @internal */
export interface PlanarDataProvider extends DataProvider {
  load(
    displaySetId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LoadedData<PlanarPayload>>;
}

export interface PlanarViewportInput
  extends Omit<ViewportInput, 'defaultOptions'> {
  defaultOptions: PlanarViewportInputOptions;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

/** @internal */
export interface PlanarViewportRenderContext extends BaseViewportRenderContext {
  renderingEngineId: string;
  type: 'planar';
  viewport: {
    element: HTMLDivElement;
    getSourceDisplaySetId(): string | undefined;
    invalidateResolvedView(): void;
    /**
     * Tells the viewport that a stack path shows a new image of `displaySetId`,
     * whose default window was `previousRange` before. The viewport fires
     * `DISPLAY_SET_APPEARANCE_CHANGED` with cause `'default'` when the
     * window on display changed with it.
     */
    notifyDefaultVOIRangeOfNewImage?(
      displaySetId: string,
      previousRange: VOIRange | undefined
    ): void;
    getViewState(): PlanarViewState;
    isCurrentDisplaySetId(displaySetId: string): boolean;
    getOverlayActors(): ActorEntry[];
    /**
     * Whether the volume slice path of `displaySetId` may draw the acquired frames in
     * place of a reduced slice. The render path adds the check of the
     * acquisition plane.
     */
    canDrawAcquiredFrames?(displaySetId: string): boolean;
    /**
     * Reads the render plan entry of `displaySetId` again after its render path
     * changed what the entry reads (`slabTooLarge`), and fires
     * `RENDER_PLAN_CHANGED` when it changed.
     */
    refreshRenderPlan?(displaySetId: string): void;
  };
  renderPath: PlanarRenderPathRuntime;
  view: PlanarActiveViewRuntime;
  display: {
    requestRender(): void;
    renderNow(): void;
    setNeedsRender(): void;
    markRendered(): void;
    activateRenderMode(renderMode: PlanarEffectiveRenderMode): void;
  };
  cpu: {
    canvas: HTMLCanvasElement;
    composition: {
      clearedRenderPassId: number;
      renderPassId: number;
    };
    context: CanvasRenderingContext2D;
    /**
     * The background colour the viewport was created with, as red, green and
     * blue from 0 to 1, or undefined for black. It is the colour the
     * rendering engine gives the renderer of the viewport, so the CPU draw
     * step clears its canvas to what the GPU draw step clears to.
     */
    getBackground?(): ArrayLike<number> | undefined;
  };
  vtk: {
    renderer: vtkRenderer;
    canvas: HTMLCanvasElement;
  };
}

type PlanarContextBase = Pick<
  PlanarViewportRenderContext,
  'viewportId' | 'renderingEngineId' | 'type'
>;

/** @internal */
export type PlanarCpuImageAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'view' | 'display' | 'cpu'
  >;

/** @internal */
export type PlanarCpuVolumeAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'view' | 'display' | 'cpu'
  >;

/** @internal */
export type PlanarVtkImageAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'view' | 'display' | 'vtk'
  >;

/** @internal */
export type PlanarVtkVolumeAdapterContext = PlanarContextBase &
  Pick<
    PlanarViewportRenderContext,
    'viewport' | 'renderPath' | 'view' | 'display' | 'vtk'
  >;
