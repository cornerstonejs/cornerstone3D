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
  ActorRenderMode,
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
import type {
  ViewPresentation,
  ViewPresentationSelector,
} from '../../../types';
import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  BindingRole,
  DataProvider,
  LoadedData,
  RenderPathResolver,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import type ICamera from '../../../types/ICamera';
import type { CameraScaleMode, ViewAnchor } from '../ViewportCameraTypes';
import type DisplayArea from '../../../types/displayArea';
import type { PlanarScaleInput } from './planarCameraScale';

export type PlanarRenderMode =
  | ActorRenderMode.CPU_IMAGE
  | 'webgl2d'
  | ActorRenderMode.VTK_IMAGE
  | ActorRenderMode.VTK_VOLUME_SLICE;
/**
 * A render mode a planar viewport can mount: the built-in modes plus any mode
 * declared by an extension backend registered via `registerRenderBackend()`
 * (the trailing `string & {}` keeps the union open without erasing the
 * built-in literals from completion).
 * @internal
 */
export type PlanarEffectiveRenderMode =
  | ActorRenderMode.CPU_IMAGE
  | 'webgl2d'
  | ActorRenderMode.VTK_IMAGE
  | ActorRenderMode.VTK_VOLUME_SLICE
  | ActorRenderMode.VTK_SAMPLED_SLICE
  | ActorRenderMode.CPU_VOLUME
  | (string & {});
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
 *
 * @experimental
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
 * How one layer (display set) of a planar viewport is drawn
 * (`PlanarViewport.getRenderPlan`).
 *
 * @experimental
 */
export type RenderPlanLayer = {
  /** The display set id of the layer. */
  dataId: string;
  role: BindingRole;
  /**
   * How the slice is made: `frame` (the acquired frame is the image), `cpu`
   * (the CPU sampler) or `gpuVolume` (the GPU volume texture).
   */
  slice: 'frame' | 'cpu' | 'gpuVolume';
  /** What draws the slice: the GPU or the CPU (a 2D canvas). */
  draw: 'gpu' | 'cpu';
  /** The render mode behind the two. */
  renderMode: PlanarEffectiveRenderMode;
  reason: RenderPlanReason;
};

/**
 * The detail of `Events.RENDER_PLAN_CHANGED`: the entry of one layer before
 * and after the change. `previous` is undefined for a layer that was just
 * added.
 *
 * @experimental
 */
export type RenderPlanChangedEventDetail = {
  renderingEngineId: string;
  viewportId: string;
  dataId: string;
  previous?: RenderPlanLayer;
  current: RenderPlanLayer;
  reason: RenderPlanReason;
};

export type PlanarOrientation =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | OrientationVectors;

/** @internal */
export interface PlanarRegisteredDataSet {
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

export interface PlanarPresentationProps extends BasePresentationProps {
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

export interface PlanarViewPresentation
  extends Omit<ViewPresentation, 'displayArea'> {
  displayArea?: PlanarDisplayArea;
  scale?: Point2;
}

export interface PlanarViewPresentationSelector
  extends ViewPresentationSelector {
  scale?: boolean;
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
  presentationScale?: Point2;
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

export type PlanarDataPresentation = PlanarPresentationProps & PlanarProperties;

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
    dataId: string,
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
    getActiveDataId(): string | undefined;
    invalidateResolvedView(): void;
    getViewState(): PlanarViewState;
    isCurrentDataId(dataId: string): boolean;
    getOverlayActors(): ActorEntry[];
    /**
     * Whether the volume slice path of `dataId` may draw the acquired frames in
     * place of a reduced slice. The render path adds the check of the
     * acquisition plane.
     */
    canDrawAcquiredFrames?(dataId: string): boolean;
    /**
     * Whether the CPU image path samples a LINEAR image once more on the
     * screen grid when the view rests, and draws it with one more render.
     */
    drawsFinerImageAtRest?(): boolean;
    /**
     * Reads the render plan entry of `dataId` again after its render path
     * changed what the entry reads (`slabTooLarge`), and fires
     * `RENDER_PLAN_CHANGED` when it changed.
     */
    refreshRenderPlan?(dataId: string): void;
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
