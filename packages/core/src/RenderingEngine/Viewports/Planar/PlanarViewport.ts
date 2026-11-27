import { vec3 } from 'gl-matrix';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { getEffectiveRenderBackend, isWebGLUnavailable } from '../../../init';
import {
  Events,
  MetadataModules,
  OrientationAxis,
  ViewportStatus,
  ViewportType,
  VOILUTFunctionType,
} from '../../../enums';
import { PlanarRenderModeId } from './planarRenderModeIds';
import { coreLog } from '../../../utilities/logger';
import {
  getRenderBackendForRenderMode,
  getRenderSurfaceForRenderMode,
  isImageRenderMode,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import type { EffectiveRenderBackend } from '../../../types/RenderBackendRegistry';
import type {
  ActorEntry,
  CPUIImageData,
  ICamera,
  IImage,
  IImageData,
  IStackInput,
  ImageActor,
  OrientationVectors,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  ReferenceViewableCheck,
  ScrollOptions,
  VOIRange,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { isImageActor } from '../../../utilities/actorCheck';
import { isAcquisitionPlaneNormal } from '../../../utilities/isAcquisitionPlaneNormal';
import cache from '../../../cache/cache';
import type { PlaneRestriction } from '../../../types/IViewport';
import { deepClone } from '../../../utilities/deepClone';
import { deepEqual } from '../../../utilities/deepEqual';
import imageIdToURI from '../../../utilities/imageIdToURI';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { getNormalizedAspectRatio } from '../../../utilities/getNormalizedAspectRatio';
import { displaySetRegistry } from '@cornerstonejs/metadata';
import triggerEvent from '../../../utilities/triggerEvent';
import eventTarget from '../../../eventTarget';
import getMinMax from '../../../utilities/getMinMax';
import renderingEngineCache from '../../renderingEngineCache';
import {
  calculateCameraPosition,
  getOrientationFromScanAxisNormal,
} from '../../helpers/getCameraVectors';
import getDevicePixelSize from '../../helpers/getDevicePixelSize';
import * as metaData from '../../../metaData';
import type {
  LoadedData,
  ViewportDataBinding,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import BaseViewport from '../BaseViewport';
import { disableViewportWidgets } from '../viewportWidgets';
import { isSegmentationOverlayData } from '../renderingFidelity';
import type { ViewportWidget } from '../Volume3D/viewport3DTypes';
import type {
  StackImageHalfSlices,
  ViewReferenceContext,
} from '../viewReferenceCompatibility';
import {
  getStackImageHalfSlices,
  isViewReferenceViewable,
  isViewReferenceViewableAsVolume,
  isPointNearImagePlane,
} from '../viewReferenceCompatibility';
import {
  displaySetShapeError,
  getVolumeOrImageDisplaySet,
  isImageDisplaySet,
} from '../displaySetAccess';
import scrollViewport from '../viewportScroll';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { getPlanarWorldToIndexMatrix } from './planarImageData';
import { createPlanarRenderPathResolver } from './PlanarRenderPathResolver';
import { defaultPlanarRenderPathDecisionService } from './PlanarRenderPathDecisionService';
import type {
  PlanarRenderModeDecision,
  PlanarRenderPathDecisionOptions,
} from './PlanarRenderPathDecisionService';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import type { SelectedPlanarRenderPath } from './planarRenderPathSelector';
import { clonePlanarOrientation } from './planarOrientationAndScaling';
import {
  getPlanarRotationAfterFlips,
  normalizePlanarRotation,
} from './planarViewFraming';
import {
  cloneDisplayArea,
  createDefaultPlanarViewState,
  normalizePlanarViewState,
  withDisplayAreaFraming,
} from './planarViewState';
import {
  normalizePlanarScale,
  normalizePlanarScaleMode,
  type PlanarScaleInput,
} from './planarCameraScale';
import {
  fitPlanarCameraClippingRange,
  type DerivedPlanarFraming,
} from './planarRenderCamera';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionSnapshot,
  getPlanarProjectionZoom,
  type PlanarProjectionSnapshot,
} from './planarProjectionAdapter';
import {
  getPlanarViewStateCanvasDimensions,
  resolvePlanarViewportView,
} from './PlanarResolvedView';
import {
  createPlanarCpuVolumeSliceBasis,
  createPlanarVolumeSliceBasis,
  getVolumeImageIdIndexWorldPoint,
} from './planarSliceBasis';
import type {
  PlanarRendering,
  PlanarVtkGpuVolumeSliceRendering,
} from './planarRuntimeTypes';
import type { FidelityDisplay } from '../../helpers/fidelityIndicator/displaySpacingOfViewport';
import {
  fidelityLinesFromBindings,
  imageQualityStatusOf,
} from '../../helpers/fidelityIndicator/collectFidelityLines';
import {
  type FidelityLine,
  isReduced,
  reductionFactorsOf,
} from '../../helpers/fidelityIndicator/fidelityIndicatorState';
import PlanarMountedData from './PlanarMountedData';
import {
  createRenderPlanLayer,
  isSameRenderPlanLayer,
} from './planarRenderPlan';
import PlanarViewReferenceController from './PlanarViewReferenceController';
import {
  getPlanarImageReferenceForStack,
  getPlanarReferenceForViewableCheck,
  hasNonFiniteViewReferenceGeometry,
  namesImageWithoutFrameOfReference,
  namesOnlyFrameOfReferencePlaneOrPoints,
} from './planarViewReference';
import { applyCanvasSharpeningSmoothing } from './planarCanvasSharpeningSmoothing';
import { createSharpeningSmoothingRenderPasses } from '../../renderPasses/createSharpeningSmoothingRenderPasses';
export type { PlanarReferenceContext } from './PlanarViewReferenceController';
import type {
  PlanarViewState,
  PlanarDisplaySetAppearance,
  PlanarDataProvider,
  PlanarDisplayArea,
  PlanarEffectiveRenderMode,
  PlanarOrientation,
  PlanarPayload,
  PlanarDisplaySetDescriptor,
  PlanarMountedDisplaySet,
  PlanarMountOptions,
  PlanarViewFraming,
  PlanarViewFramingSelector,
  PlanarViewportRenderContext,
  PlanarViewportInput,
  PlanarViewportInputOptions,
  RenderPlanChangedEventDetail,
  RenderPlanLayer,
  RenderPlanReason,
} from './PlanarViewportTypes';

type ResolvedPlanarViewportView = NonNullable<
  ReturnType<typeof resolvePlanarViewportView>
>;

type ResolvedViewCache = {
  sourceDisplaySetId?: string;
  canvasHeight: number;
  canvasWidth: number;
  data?: LoadedData<PlanarPayload>;
  rendering?: PlanarRendering;
  resolvedView: ResolvedPlanarViewportView;
  revision: number;
  viewState: PlanarViewState;
};

export type PlanarResetViewStateOptions = {
  resetPan?: boolean;
  resetZoom?: boolean;
  resetOrientation?: boolean;
  resetFlip?: boolean;
};

const log = coreLog.getLogger('RenderingEngine', 'PlanarViewport');

/**
 * The class of the canvas that shows the picture of a viewport. The rendering
 * engine gives it to the canvas it makes (`getOrCreateCanvas`); a planar
 * viewport moves it to its CPU canvas while it draws there, as the legacy CPU
 * stack viewport drew into the canvas of that class.
 */
const CANVAS_CSS_CLASS = 'cornerstone-canvas';

/**
 * The attributes of the 2D context of the CPU canvas. The CPU draw step reads
 * that canvas back on each draw that blends a translucent slice over what is
 * below it (`planarCpuSliceCanvas`), composes overlapping labelmaps
 * (`canvasLabelmapLayer`) or sharpens or smooths the picture
 * (`planarCanvasSharpeningSmoothing`). Chrome keeps a 2D canvas on the GPU
 * unless `willReadFrequently` is set, warns at the second `getImageData` of
 * such a canvas and then moves it to the CPU itself. With the attribute the
 * canvas is kept in CPU memory from the start: each read is a copy, and the
 * draws onto it and its upload for display are done on the CPU. A draw of a
 * stack took the same time with and without it (v6-open-issues row 225).
 */
const CPU_CANVAS_CONTEXT_ATTRIBUTES: CanvasRenderingContext2DSettings = {
  willReadFrequently: true,
};

type PlanarSlabAppearance = Pick<
  PlanarDisplaySetAppearance,
  'slabThickness' | 'blendMode'
>;

/**
 * @internal The order of the view props of a renderer after a remount, in
 * which the props that the new attachment added (`mountedProps` that are in
 * `propsAfter` but not in `propsBefore`) take the place of the first prop that
 * the remount removed (in `propsBefore`, not in `propsAfter`). Every other
 * prop keeps its order, and a prop that something else added during the
 * remount stays at the end. Returns undefined when the order does not change:
 * nothing was removed (the old attachment drew no vtk actor, or the remount
 * failed or went stale), or nothing was added.
 */
export function getRemountedViewPropOrder<T>(
  propsBefore: readonly T[],
  propsAfter: readonly T[],
  mountedProps: readonly T[]
): T[] | undefined {
  const before = new Set(propsBefore);
  const after = new Set(propsAfter);
  const added = mountedProps.filter(
    (prop) => after.has(prop) && !before.has(prop)
  );
  const addedSet = new Set(added);

  if (!added.length || propsBefore.every((prop) => after.has(prop))) {
    return;
  }

  const order: T[] = [];
  let placed = false;

  for (const prop of propsBefore) {
    if (after.has(prop)) {
      order.push(prop);
    } else if (!placed) {
      order.push(...added);
      placed = true;
    }
  }

  order.push(
    ...propsAfter.filter((prop) => !before.has(prop) && !addedSet.has(prop))
  );

  return order.every((prop, index) => prop === propsAfter[index])
    ? undefined
    : order;
}

/**
 * Puts the view props of a renderer in the given order. The props from the
 * first one out of place on are removed and added again, which keeps their
 * scene graph nodes. vtk.js 36.4.1 does not move an existing scene graph node
 * when the props change order (the `enforceOrder` move of
 * `vtkViewNode.addMissingNodes` passes the wrong arguments), and draws in the
 * order of the nodes. So the nodes of the props that were added again are
 * removed as well, and the next build pass makes them again, after the new
 * props, in the order of the props. A volume texture lives outside the node
 * and is not uploaded again.
 */
function applyViewPropOrder(
  renderer: PlanarViewportRenderContext['vtk']['renderer'],
  order: unknown[]
): void {
  const props = renderer.getViewProps() as unknown[];
  const first = order.findIndex((prop, index) => props[index] !== prop);

  if (first < 0) {
    return;
  }

  const moved = order.slice(first) as ReturnType<typeof renderer.getViewProps>;
  const rendererNode = renderer
    .getVTKWindow?.()
    ?.getViews?.()?.[0]
    ?.getViewNodeFor?.(renderer);

  moved.forEach((prop) => renderer.removeViewProp(prop));
  moved.forEach((prop) => {
    renderer.addViewProp(prop);

    const node = rendererNode?.getViewNodeFor(prop);

    if (node) {
      rendererNode.removeNode(node);
    }
  });
}

/** The vtk actors of the actor entries of a binding. */
function getBindingActors(
  binding: ViewportDataBinding<PlanarDisplaySetAppearance> | undefined
): unknown[] {
  if (!binding) {
    return [];
  }

  const entries =
    binding.getActorEntries?.(binding.data) ??
    [binding.getActorEntry?.(binding.data)].filter(Boolean);

  return entries.map((entry) => entry.actor);
}

/** The slab thickness and the blend mode of an appearance. */
function getSlabAppearance(
  props: PlanarDisplaySetAppearance | undefined
): PlanarSlabAppearance {
  return {
    slabThickness: props?.slabThickness,
    blendMode: props?.blendMode,
  };
}

/**
 * What `loadPlanarData` gives for a display set: its registration and its
 * loaded data, the render path decision, the inputs of that decision and the
 * backend that the configuration gave for it, and the orientation that the
 * options ask for.
 */
type PlanarDataLoad = {
  dataSet: PlanarDisplaySetDescriptor;
  data: LoadedData<PlanarPayload>;
  selectedPath: SelectedPlanarRenderPath;
  resolvedOrientation: PlanarViewState['orientation'];
  decisionOptions: PlanarRenderPathDecisionOptions;
  renderBackend: EffectiveRenderBackend;
};

/**
 * What `setDisplaySets` loaded for a display set, with the best image of the
 * stack that the cache has now. A progressive load can bring a better stage
 * of the first image after the load and before the mount, and the render
 * paths only take the stages that come after their mount.
 */
function withBestCachedImage(loaded: PlanarDataLoad): PlanarDataLoad {
  const { image } = loaded.data;
  const cachedImage = image ? cache.getImage(image.imageId) : undefined;

  if (
    !cachedImage ||
    imageQualityStatusOf(cachedImage) <= imageQualityStatusOf(image)
  ) {
    return loaded;
  }

  return { ...loaded, data: { ...loaded.data, image: cachedImage } };
}

/**
 * Whether the volume that `setDisplaySets` loaded for a display set left the
 * cache since: the cache deletes the image data of a volume that it removes,
 * so that volume can no longer be drawn.
 */
function isRemovedVolume({ data }: PlanarDataLoad): boolean {
  const { imageVolume } = data;

  return (
    Boolean(imageVolume) &&
    (!imageVolume.imageData || imageVolume.imageData.isDeleted())
  );
}

/**
 * Whether two render path decisions of one display set have the same inputs
 * from the display sets that are mounted: the backend that an overlay takes
 * from the source, and the slab of the stored appearance. The other inputs
 * come from the options and the orientation of the display set.
 */
function hasSameMountInputs(
  a: PlanarRenderPathDecisionOptions,
  b: PlanarRenderPathDecisionOptions
): boolean {
  return (
    a.renderBackend === b.renderBackend &&
    a.slabThickness === b.slabThickness &&
    a.blendMode === b.blendMode
  );
}

/** The fields of an image path rendering that track its image loads. */
type PlanarStackImageLoads = {
  loadRequestId?: number;
  lastRequestedImageIdIndex?: number;
  failedImageIdIndex?: number;
  imageLoad?: Promise<void>;
};

class PlanarViewport extends BaseViewport<
  PlanarViewState,
  PlanarDisplaySetAppearance,
  PlanarViewportRenderContext,
  PlanarViewFraming,
  PlanarViewFramingSelector
> {
  readonly type = ViewportType.PLANAR;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  /** The x offset of the viewport in the offscreen canvas of a tiled engine. */
  sx: number;
  /** The y offset of the viewport in the offscreen canvas of a tiled engine. */
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: PlanarViewportInputOptions;
  suppressEvents = false;
  /**
   * The display area that `resetViewState` goes back to: the last one given
   * with `storeAsInitialCamera: true`, in `defaultOptions` or in a view state
   * patch.
   */
  private initialDisplayArea?: PlanarDisplayArea;
  /** Set when a render path draws in `render()` instead of the engine. */
  private drewOutsideEngine = false;
  /**
   * The request of the mount of `mountDisplaySets` that holds a CPU draw now.
   * Only the newest mount holds it: a mount that a newer one replaced neither
   * holds nor releases it.
   */
  private mountCpuDrawHoldRequestId?: number;
  /** Set when a CPU draw was asked for while a mount held it. */
  private cpuDrawHeldByMount = false;
  /** The image load of a CPU stack that holds the draws of the viewport. */
  private cpuDrawHoldImageLoad?: Promise<void>;
  /** The image loads of a CPU stack that have ended and hold no draw. */
  private readonly endedImageLoads = new WeakSet<Promise<void>>();
  /** Set when a CPU draw was asked for while an image load held it. */
  private cpuDrawHeldByImageLoad = false;
  /**
   * Set once the viewport warned that the CPU path does not draw the props
   * that the application added to its vtk.js renderer. A draw on the GPU
   * clears it.
   */
  private warnedOfHiddenRendererContent = false;
  /** The widgets that tools keep on the viewport, by id. */
  protected readonly widgets = new Map<string, ViewportWidget>();
  protected renderContext: PlanarViewportRenderContext;

  private readonly mountedData: PlanarMountedData;
  private readonly viewReferences: PlanarViewReferenceController;
  /** The `initialViewReference` of the source that mounts now. */
  private pendingInitialViewReference?: {
    displaySetId: string;
    viewRef: ViewReference;
  };
  /** True while `applyInitialViewReference` runs. */
  private stagesInitialViewReference = false;
  private cpuCanvas?: HTMLCanvasElement;
  private renderImageObjectDisplaySetId?: string;
  private resolvedViewCache?: ResolvedViewCache;
  private resolvedViewCacheRevision = 0;
  // Canvas CSS dimensions, cached to avoid a forced layout reflow on every
  // resolveCachedViewState()/coordinate-transform call. Reading clientWidth/
  // clientHeight synchronously flushes layout; during annotation rendering (e.g.
  // many DICOM RT contours) the SVG annotation layer is written between those
  // reads, so each read becomes a reflow (layout thrash). The canvas CSS size
  // only changes on resize(), which clears this cache, so the hot resolve and
  // transform paths can safely reuse the cached value within a frame.
  private cachedCanvasDimensions?: {
    canvasHeight: number;
    canvasWidth: number;
  };
  private setDataRequestId = 0;
  /**
   * The commit of a `mountDisplaySets` call while it runs: the removal of
   * the shown display sets and the mount of the new ones. A newer call does
   * not stop it; it waits for its end before it removes anything.
   */
  private mountCommit?: Promise<void>;
  private renderPipelineSwapId = 0;
  private pendingRenderPipelineUpdate?: Promise<void>;
  // Last reported render-path error message per display set; a successful
  // render clears the entry so a genuine repeat failure after recovery is
  // reported again.
  private readonly lastRenderPathErrorByDisplaySetId = new Map<
    string,
    string
  >();
  /**
   * What the viewport keeps of each mounted display set: the descriptor that
   * the mount read, the mode that it chose and its options. Every read after
   * the mount (a live render backend switch, a slab, an orientation check,
   * the replacement of the source) reads this, not the registry.
   */
  private readonly mountedDisplaySets = new Map<
    string,
    PlanarMountedDisplaySet
  >();
  /**
   * The newest replacement of the image of each image overlay that
   * `addImages` mounted, so an older replacement that loads after a newer
   * one binds nothing.
   */
  private readonly overlayImageRequests = new Map<string, number>();
  /**
   * The slab that a mounted binding draws while its display set waits for a
   * remount to the render mode of a new slab (`setAppearanceState`).
   */
  private readonly withheldSlabByBinding = new WeakMap<
    object,
    PlanarSlabAppearance
  >();
  /** The reason of the decision behind the mounted render mode of each display set. */
  private readonly renderPlanReasonByDisplaySetId = new Map<
    string,
    RenderPlanReason
  >();
  /** The render plan entry of each display set that the last event gave. */
  private readonly renderPlanByDisplaySetId = new Map<
    string,
    RenderPlanLayer
  >();
  /** The passes of `applyRenderingPipelineUpdate` that hold the renders. */
  private remountRenderHolds = 0;
  /** Set when a render was asked for while a remount held the renders. */
  private renderHeldByRemount = false;

  // ── Static ───────────────────────────────────────────────────────────

  /**
   * True on a device without WebGL: the viewport then draws itself on the
   * CPU, and the rendering engine makes no WebGL context for it, as for the
   * 5.x stack viewport on such a device.
   */
  static get useCustomRenderingPipeline(): boolean {
    return isWebGLUnavailable();
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: PlanarViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sx = args.sx;
    this.sy = args.sy;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = cloneViewportOptions(args.defaultOptions || {});
    this.suppressEvents = Boolean(this.defaultOptions.suppressEvents);
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createPlanarRenderPathResolver();
    this.mountedData = new PlanarMountedData({
      getBinding: (displaySetId) => this.getBinding(displaySetId),
      getFirstBinding: () => this.getFirstBinding(),
      getBindings: () => this.bindings.entries(),
      removeDisplaySet: (displaySetId) =>
        this.removeDisplaySetBinding(displaySetId),
      promoteFirstDisplaySetToSource: () =>
        this.promoteFirstDisplaySetToSource(),
    });
    this.viewReferences = new PlanarViewReferenceController({
      viewportId: this.id,
      viewportType: this.type,
      getSourceDisplaySetId: () => this.mountedData.getSourceDisplaySetId(),
      getBinding: (displaySetId) => this.getBinding(displaySetId),
      getBindings: () => this.bindings.entries(),
      getCurrentBinding: () => this.getCurrentBinding(),
      getDisplaySetAppearance: (displaySetId) =>
        this.getDisplaySetAppearance(displaySetId),
      getRenderContext: () => this.renderContext,
      getResolvedView: (viewArgs) => this.getResolvedView(viewArgs),
      getViewState: () => this.viewState,
      getVolumeSliceWorldPointForImageIdIndex: (imageIdIndex) =>
        this.getVolumeSliceWorldPointForImageIdIndex(imageIdIndex),
      setImageIdIndex: (imageIdIndex) =>
        this.stagesInitialViewReference
          ? this.stageImageIdIndex(imageIdIndex)
          : this.setImageIdIndex(imageIdIndex),
      setViewState: (viewStatePatch) =>
        this.stagesInitialViewReference
          ? this.stageViewState(viewStatePatch)
          : this.setViewState(viewStatePatch),
    });
    const renderer = isWebGLUnavailable()
      ? vtkRenderer.newInstance()
      : renderingEngineCache.get(this.renderingEngineId)?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[PlanarViewport] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    // Establish a stacking context on the viewport element so the cpuCanvas /
    // viewport-element z-index layering applied below stays contained. Because
    // this element is position:relative with z-index:auto it is not a stacking
    // context on its own, so the viewport-element's z-index:1 would otherwise
    // leak into the host's stacking context and paint the rendered canvas above
    // any overlays the host renders as siblings of this element (e.g. OHIF's
    // corner overlays / orientation markers). isolation keeps the element at the
    // same stack level relative to its siblings while containing its children.
    this.element.style.isolation = 'isolate';

    const vtkCanvas = args.canvas;
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    const cpuCanvas = document.createElement('canvas');
    cpuCanvas.style.display = 'none';
    cpuCanvas.style.height = '100%';
    cpuCanvas.style.inset = '0';
    cpuCanvas.style.pointerEvents = 'none';
    cpuCanvas.style.position = 'absolute';
    cpuCanvas.style.width = '100%';
    cpuCanvas.style.zIndex = '0';
    this.element.appendChild(cpuCanvas);
    this.cpuCanvas = cpuCanvas;

    if (viewportElement) {
      viewportElement.style.position =
        viewportElement.style.position || 'relative';
      viewportElement.style.zIndex = '1';
    }

    const cpuCanvasContext = cpuCanvas.getContext(
      '2d',
      CPU_CANVAS_CONTEXT_ATTRIBUTES
    );

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewport] Failed to initialize CPU canvas');
    }

    renderer.getActiveCamera().setParallelProjection(true);

    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'planar',
      viewport: {
        element: this.element,
        getSourceDisplaySetId: () => this.mountedData.getSourceDisplaySetId(),
        invalidateResolvedView: () => this.clearResolvedViewCache(),
        notifyDefaultAppearanceOfNewImage: (displaySetId, previousDefaults) =>
          this.notifyDefaultAppearanceOfNewImage(
            displaySetId,
            previousDefaults
          ),
        getViewState: () => this.getViewState(),
        isCurrentDisplaySetId: (displaySetId) =>
          this.getCurrentBinding()?.data.id === displaySetId,
        getOverlayActors: () =>
          this.mountedData.getProjectedActorEntries('overlay'),
        canDrawAcquiredFrames: (displaySetId) =>
          this.canDrawAcquiredFrames(displaySetId),
        refreshRenderPlan: (displaySetId) =>
          this.updateRenderPlan(displaySetId),
      },
      renderPath: {
        renderMode: PlanarRenderModeId.VTK_FRAME,
      },
      view: {},
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
        renderNow: () => {
          this.render();
        },
        setNeedsRender: () => {
          this.setNeedsRender();
        },
        markRendered: () => {
          this.drewOutsideEngine = true;
          this.setRendered();
        },
        activateRenderMode: (renderMode: PlanarEffectiveRenderMode) => {
          this.renderContext.renderPath.renderMode = renderMode;
          this.setRenderModeVisibility(renderMode, cpuCanvas, vtkCanvas);
        },
      },
      cpu: {
        canvas: cpuCanvas,
        composition: {
          clearedRenderPassId: -1,
          renderPassId: 0,
        },
        getBackground: () => this.defaultOptions?.background,
        context: cpuCanvasContext,
      },
      vtk: {
        renderer,
        canvas: vtkCanvas,
      },
    };
    const { displayArea } = this.defaultOptions;

    this.initialDisplayArea = displayArea?.storeAsInitialCamera
      ? cloneDisplayArea(displayArea)
      : undefined;
    this.viewState = normalizePlanarViewState({
      ...createDefaultPlanarViewState(),
      ...withDisplayAreaFraming({ displayArea: cloneDisplayArea(displayArea) }),
      orientation: this.resolveRequestedOrientation(),
    });
    this.setRenderModeVisibility(
      PlanarRenderModeId.VTK_FRAME,
      cpuCanvas,
      vtkCanvas
    );

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Replaces all mounted planar display sets with the provided ones. The first
   * entry is mounted as the source binding; subsequent entries default to the
   * overlay role unless they specify one explicitly.
   *
   * @param entries - Display sets to mount, each with its own options for
   * orientation and binding role resolution.
   */
  async setDisplaySets(
    ...entries: Array<{ displaySetId: string; options?: PlanarMountOptions }>
  ): Promise<void> {
    await this.mountDisplaySets(entries);
  }

  /**
   * Mounts display sets as `setDisplaySets` does, then fires
   * DISPLAY_SETS_CHANGED. A call that a newer one stops, or that rejects,
   * fires nothing.
   *
   * The data of every entry is loaded before the shown display sets go, so an
   * entry without data rejects and leaves the shown scene as it was, as the
   * legacy `setVolumes` did for a volume that was not in the cache. A loaded
   * volume that leaves the cache before the shown display sets go rejects the
   * call there too, as the cache deletes its image data. The mount then takes
   * that data, and that render path decision when its inputs are the same,
   * so a stack loads its first image once. The newest call holds
   * the draws of a CPU path from its start to its end, also while the shown
   * scene waits for the loads, and a commit holds them while it runs. When
   * both have ended, also when a call rejects, the viewport draws once when
   * a draw was asked for meanwhile.
   *
   * A newer call, or a `destroy`, stops an older one while the older one
   * loads; a pending `addDisplaySet` ends at its start. Once a call
   * has loaded, its commit (the removal of the shown display sets and the
   * mounts) runs to its end, and a newer call waits for it before it removes
   * anything. So a listener of an event of the commit, as NEW_IMAGE, that
   * starts a call that rejects leaves the complete new scene, and the commit
   * fires DISPLAY_SETS_CHANGED.
   */
  private async mountDisplaySets(
    entries: Array<{ displaySetId: string; options?: PlanarMountOptions }>
  ): Promise<void> {
    const requestId = ++this.setDataRequestId;

    this.startSetDisplaySets();

    const signal = this.getSetDisplaySetsSignal();
    const isStale = () => requestId !== this.setDataRequestId || signal.aborted;
    const mounts: Array<{
      displaySetId: string;
      options: PlanarMountOptions;
    }> = entries.map(({ displaySetId, options = {} }, index) => ({
      displaySetId,
      options: {
        ...options,
        role: options.role ?? (index === 0 ? 'source' : 'overlay'),
      },
    }));

    this.mountCpuDrawHoldRequestId = requestId;

    try {
      const loaded: PlanarDataLoad[] = [];

      for (const { displaySetId, options } of mounts) {
        const load = await this.loadPlanarData(displaySetId, options);

        if (isStale()) {
          return;
        }

        loaded.push(load);
      }

      if (this.mountCommit) {
        await this.mountCommit.catch(() => undefined);

        if (isStale()) {
          return;
        }
      }

      const removedIndex = loaded.findIndex(isRemovedVolume);

      if (removedIndex !== -1) {
        throw new Error(
          `[PlanarViewport] The volume of ${mounts[removedIndex].displaySetId} left the cache while setDisplaySets loaded`
        );
      }

      const commit = this.commitDisplaySets(mounts, loaded);

      this.mountCommit = commit;

      try {
        await commit;
      } finally {
        if (this.mountCommit === commit) {
          this.mountCommit = undefined;
        }
      }
    } finally {
      this.releaseMountCpuDrawHold(requestId);
    }

    this.triggerDisplaySetsChanged(
      entries.map(({ displaySetId }) => displaySetId)
    );
  }

  /**
   * The commit of `mountDisplaySets`: removes the shown display sets and
   * mounts the new ones with the data that the call loaded, a stack with the
   * best stage of its image that came meanwhile (`addDisplaySetInternal`).
   * A newer call does not stop it.
   */
  private async commitDisplaySets(
    mounts: Array<{ displaySetId: string; options: PlanarMountOptions }>,
    loaded: PlanarDataLoad[]
  ): Promise<void> {
    this.clearResolvedViewCache();
    this.removeReplaceableData(mounts, loaded);

    for (const [index, { displaySetId, options }] of mounts.entries()) {
      await this.addDisplaySetInternal(displaySetId, options, loaded[index]);
    }
  }

  /**
   * Adds a single logical planar display set. Without a `role` it mounts
   * with the role of the base rule (`resolveAddRole`): the source on a
   * viewport that shows nothing, an overlay on any other. Calls that race
   * mount in call order; a `setDisplaySets` that starts while it loads ends
   * it, and it binds nothing (`queueAddDisplaySet`).
   *
   * @param displaySetId - Logical display set id to add.
   * @param options - Semantic orientation and binding options. The render path
   * is inferred from the registered dataset and viewport configuration.
   */
  async addDisplaySet(
    displaySetId: string,
    options: PlanarMountOptions = {}
  ): Promise<void> {
    return this.queueAddDisplaySet(async (isSuperseded) => {
      const added = await this.addDisplaySetInternal(
        displaySetId,
        {
          ...options,
          role: this.resolveAddRole(displaySetId, options.role),
        },
        undefined,
        isSuperseded
      );

      this.clearResolvedViewCache();

      if (added) {
        this.triggerDisplaySetsChanged([displaySetId]);
      }
    });
  }

  /**
   * Mounts a display set. With `loaded`, what `setDisplaySets` loaded for it,
   * it takes the best stage of the image of a stack that the cache has, after
   * its last wait and in the same task as the render path that listens for
   * the later stages, so no stage comes between the two. Gives whether the
   * display set was bound.
   *
   * What the mount read and chose (`PlanarMountedDisplaySet`) and the
   * appearance of the mount option `appearance` are in place before the
   * bind, so the first draw has them; the mount fires
   * `DISPLAY_SET_APPEARANCE_CHANGED` once, with cause `'mount'`. A source
   * that comes after its overlays in one `setDisplaySets` call gives them
   * its slice once it is bound. A mount that `shouldIgnore` tells, after its
   * load, is stale binds nothing and gives false.
   */
  private async addDisplaySetInternal(
    displaySetId: string,
    options: PlanarMountOptions = {},
    loaded?: PlanarDataLoad,
    shouldIgnore?: () => boolean
  ): Promise<boolean> {
    const role = this.mountedData.resolveBindingRole(options);
    const resolvedOptions: PlanarMountOptions = {
      ...options,
      role,
    };
    const planarLoad = await this.loadPlanarData(
      displaySetId,
      resolvedOptions,
      loaded
    );
    const { dataSet, data, resolvedOrientation, selectedPath } = loaded
      ? withBestCachedImage(planarLoad)
      : planarLoad;

    if (role === 'source') {
      this.mountedData.promoteSourceDisplaySetId(displaySetId);
      this.applyLoadedPlanarViewState(resolvedOrientation, data, selectedPath);
    }

    const mode = getMountMode(selectedPath.renderMode);
    const previousMount = this.mountedDisplaySets.get(displaySetId);
    const restoreAppearance = this.stageMountedAppearance(
      displaySetId,
      { visible: true },
      options.appearance
    );
    let added = false;

    this.mountedDisplaySets.set(displaySetId, {
      descriptor: dataSet,
      mode,
      options: getMountedOptions(resolvedOptions, mode, data.volumeId),
    });
    this.pendingInitialViewReference =
      role === 'source' && options.initialViewReference
        ? { displaySetId, viewRef: options.initialViewReference }
        : undefined;

    try {
      added = await this.addLoadedData(
        displaySetId,
        data,
        {
          renderMode: selectedPath.renderMode,
          role,
        },
        shouldIgnore
      );
    } finally {
      this.pendingInitialViewReference = undefined;

      if (!added) {
        restoreAppearance();
        this.restoreMountedDisplaySet(displaySetId, previousMount);
      }
    }

    if (!added) {
      return false;
    }

    this.updateRenderPlan(displaySetId, selectedPath.reason);
    this.clearResolvedViewCache();

    if (role === 'source' && this.bindings.size > 1) {
      this.updateBindingsCameraState();
    }

    this.applyMountedAppearance(displaySetId);

    if (role === 'source') {
      // Emit an initial CAMERA_MODIFIED for the source binding only, mirroring
      // legacy StackViewport's first-image triggerCameraEvent. Overlays and
      // orientation markers paint their first frame off this event. Trigger the
      // event directly rather than routing through modified() to avoid a
      // redundant render (addLoadedData already rendered).
      this.triggerCameraModifiedEvent(this.getCameraForEvent());
    }

    return true;
  }

  /**
   * Moves the source that mounts now to its `initialViewReference`, once its
   * binding is in place and before the binding gets the view state, so its
   * first draw and its first NEW_IMAGE are of that view.
   */
  protected override beforeFirstViewState(displaySetId: string): void {
    const pending = this.pendingInitialViewReference;

    if (pending?.displaySetId !== displaySetId) {
      return;
    }

    this.pendingInitialViewReference = undefined;
    this.applyInitialViewReference(pending.viewRef);
  }

  /**
   * Applies a view reference as `setViewReference` does, writing the view
   * state it gives without a draw or an event. A reference that the mount
   * cannot show with navigation is ignored with a warning.
   */
  private applyInitialViewReference(viewRef: ViewReference): void {
    if (!this.isReferenceViewable(viewRef, { withNavigation: true })) {
      log.warn(
        '[PlanarViewport] The initialViewReference of the mount is not viewable in this viewport, so the mount shows its default slice',
        viewRef
      );
      return;
    }

    this.stagesInitialViewReference = true;

    try {
      this.viewReferences.setViewReference(viewRef);
    } finally {
      this.stagesInitialViewReference = false;
    }
  }

  /** Writes a view state patch with no draw and no event. */
  private stageViewState(viewStatePatch: Partial<PlanarViewState>): void {
    this.clearResolvedViewCache();
    this.viewState = this.normalizeViewState({
      ...this.viewState,
      ...viewStatePatch,
    });
  }

  /** Writes the image of a stack into the view state, with no load. */
  private stageImageIdIndex(imageIdIndex: number): Promise<string> {
    this.stageViewState({ slice: { kind: 'stackIndex', imageIdIndex } });

    return Promise.resolve(this.getImageIds()[imageIdIndex]);
  }

  /**
   * The display sets that the viewport shows, in mount order, each with the
   * options of its mount: the options that it was given, without
   * `appearance` (applied once, at the mount), with the role that it has now,
   * the mode that the mount chose (`'stack'` or `'volume'`, never `'auto'`)
   * and, in volume mode, the id of the volume that it shows. Mounting them on
   * another planar viewport shows the same data the same way, so a stack and
   * a volume of one display set keep their modes, and a mount of another
   * volume of a display set keeps that volume.
   */
  override getDisplaySets(): Array<{
    displaySetId: string;
    options: PlanarMountOptions;
  }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => ({
        displaySetId,
        options: {
          ...(this.mountedDisplaySets.get(displaySetId)?.options ?? {}),
          role: binding.role,
        },
      })
    );
  }

  /**
   * The render plan of this viewport: for each mounted layer (display set),
   * source first, how its slice is made (`slice`), what draws it (`draw`),
   * the render backend that draws it (`backend`) and the reason of the
   * decision. It is the one public way to ask how a layer is drawn: the
   * entry of an actor is the layer whose `displaySetId` is the
   * `displaySetId` of its `ActorEntry`. It reads what the last decision
   * stored, so it gives the same answer at any time and costs nothing.
   * `Events.RENDER_PLAN_CHANGED` fires when an entry changes.
   */
  getRenderPlan(): RenderPlanLayer[] {
    const source = this.getCurrentBinding();
    const plan: RenderPlanLayer[] = [];

    for (const [displaySetId, binding] of this.bindings) {
      const layer = this.getRenderPlanLayer(displaySetId);

      if (!layer) {
        continue;
      }

      if (binding === source) {
        plan.unshift(layer);
      } else {
        plan.push(layer);
      }
    }

    return plan;
  }

  /** The render plan entry of one mounted display set. */
  private getRenderPlanLayer(
    displaySetId: string
  ): RenderPlanLayer | undefined {
    const binding = this.bindings.get(displaySetId);
    const reason = this.renderPlanReasonByDisplaySetId.get(displaySetId);

    if (!binding || !reason) {
      return;
    }

    const { rendering } = binding as {
      rendering: {
        renderMode: PlanarEffectiveRenderMode;
        slabTooLarge?: boolean;
      };
    };

    return createRenderPlanLayer(
      displaySetId,
      binding.role,
      rendering.renderMode,
      rendering.slabTooLarge ? 'slabTooLarge' : reason
    );
  }

  /**
   * Stores the reason of the decision behind the mounted render mode of a
   * display set, when one is given, and fires `RENDER_PLAN_CHANGED` on the
   * element and on the event target when its entry differs from the entry of
   * the last event.
   */
  private updateRenderPlan(
    displaySetId: string,
    reason?: RenderPlanReason
  ): void {
    if (reason) {
      this.renderPlanReasonByDisplaySetId.set(displaySetId, reason);
    }

    const previous = this.renderPlanByDisplaySetId.get(displaySetId);
    const current = this.getRenderPlanLayer(displaySetId);

    if (!current || isSameRenderPlanLayer(previous, current)) {
      return;
    }

    this.renderPlanByDisplaySetId.set(displaySetId, current);

    const detail: RenderPlanChangedEventDetail = {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
      displaySetId,
      previous,
      current,
      reason: current.reason,
    };

    triggerEvent(this.element, Events.RENDER_PLAN_CHANGED, detail);
    triggerEvent(eventTarget, Events.RENDER_PLAN_CHANGED, detail);
  }

  /**
   * Removes a dataset binding and clears the active data id when the
   * removed dataset was active.
   */
  protected override removeDisplaySetBinding(displaySetId: string): void {
    this.clearResolvedViewCache();
    this.mountedDisplaySets.delete(displaySetId);
    this.overlayImageRequests.delete(displaySetId);
    this.lastRenderPathErrorByDisplaySetId.delete(displaySetId);
    this.renderPlanReasonByDisplaySetId.delete(displaySetId);
    this.renderPlanByDisplaySetId.delete(displaySetId);
    super.removeDisplaySetBinding(displaySetId);
    this.mountedData.handleRemovedData(displaySetId);

    if (!this.isDestroyed && this.getCurrentBinding()) {
      this.updateBindingsCameraState();
    }
  }

  // ====================================================================
  // Public API -- actors (legacy interop)
  // ====================================================================

  /**
   * Returns all actor entries, with the source actor first and overlays after.
   */
  getActors(): ActorEntry[] {
    return this.mountedData.getActors();
  }

  /**
   * Returns the primary actor entry for the viewport.
   */
  getDefaultActor(): ActorEntry | undefined {
    return this.getDefaultActorEntry();
  }

  /**
   * The default actor entry of `getDefaultActor`, `getImageActor()` and
   * `getDefaultImageData`. It is the volume slice entry, also while the
   * acquired frame shows (`showsAcquiredFrame` of the source rendering): the
   * volume data is at full resolution, and only its GPU texture is reduced.
   */
  private getDefaultActorEntry(): ActorEntry | undefined {
    return this.mountedData.getDefaultActor();
  }

  /**
   * Retrieves an image actor from the viewport actors. Mirrors the legacy
   * Viewport.getImageActor so VOI/colorbar tooling that depends on it keeps
   * working on native PLANAR viewports. CPU render paths (e.g. CPU stack
   * slice rendering) have no VTK image actor, so this returns null there and
   * callers fall back to a default range instead of throwing.
   *
   * @param volumeId - Optional id of the volume whose image actor is wanted.
   * @returns The image actor if present, otherwise null.
   */
  getImageActor(volumeId?: string): ImageActor | null {
    const actorEntries = this.getActors();

    let actorEntry = this.getDefaultActorEntry();
    if (volumeId) {
      // Match by actor referencedId first (e.g. the prefixed volume id
      // "cornerstoneStreamingImageVolume:<uid>"). VOI/colorbar tooling, however,
      // identifies a layer by its display-set id (the appearance displaySetId, a bare
      // uid), which is not the referencedId. Fall back to resolving that displaySetId
      // through the binding so a fused viewport's per-layer colorbar reads the
      // correct actor (e.g. the PT layer) instead of defaulting to the source.
      actorEntry =
        actorEntries.find((a) => a.referencedId === volumeId) ??
        this.mountedData.getActorForDisplaySetId(volumeId);
    }

    if (!actorEntry || !isImageActor(actorEntry)) {
      return null;
    }

    return actorEntry.actor as ImageActor;
  }

  /**
   * Returns the vtk image data backing the default image actor, mirroring the
   * legacy `Viewport.getDefaultImageData`. Tools (e.g. the ONNX auto-pilot
   * segmentation controller) call this directly on the viewport; native
   * PLANAR viewports previously threw
   * `getDefaultImageData is not a function`.
   *
   * A volume sampled for the slice (`vtkCpuSlice`, or on the CPU) gives
   * the image data of the volume. A stack drawn on the CPU has no vtk image
   * data: it gives the image data of the image on display
   * (`getImageData().imageData`), which has `worldToIndex` and
   * `indexToWorld` as well. Undefined while nothing is shown.
   */
  getDefaultImageData() {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode === PlanarRenderModeId.VTK_CPU_SLICE ||
      rendering?.renderMode === PlanarRenderModeId.CANVAS_CPU_SLICE
    ) {
      return rendering.imageVolume.imageData;
    }

    if (rendering?.renderMode === PlanarRenderModeId.CANVAS_FRAME) {
      return this.getImageData()?.imageData;
    }

    return this.getImageActor()?.getMapper().getInputData();
  }

  /**
   * Renders a single image object by setting it as a one-image stack.
   */
  renderImageObject(image: IImage): Promise<void> {
    const displaySetId = `image-object:${this.id}:${imageIdToURI(image.imageId)}`;

    if (
      this.renderImageObjectDisplaySetId &&
      this.renderImageObjectDisplaySetId !== displaySetId
    ) {
      displaySetRegistry.remove(this.renderImageObjectDisplaySetId);
    }

    this.renderImageObjectDisplaySetId = displaySetId;
    displaySetRegistry.add(displaySetId, {
      image,
      imageIds: [image.imageId],
    });

    return this.setDisplaySets({
      displaySetId,
      options: {
        orientation: this.resolveRequestedOrientation(),
      },
    });
  }

  /**
   * The render passes of the sharpening and the smoothing of the source
   * display set, as the legacy viewport gives them for the same numbers. The
   * rendering engine draws the frame through them while the source draws on
   * the GPU. Null when both are 0, or while the source draws on the CPU,
   * where `render` applies them to the canvas instead.
   *
   * @returns The render passes, or null.
   */
  getRenderPasses(): ReturnType<typeof createSharpeningSmoothingRenderPasses> {
    const binding = this.getCurrentBinding();

    if (
      !binding ||
      getRenderSurfaceForRenderMode(
        this.getCurrentPlanarRendering()?.renderMode
      ) === 'cpu'
    ) {
      return null;
    }

    try {
      return createSharpeningSmoothingRenderPasses(
        this.getDisplaySetAppearance(binding.data.id) || {}
      );
    } catch (error) {
      log.warn('Failed to create custom render passes:', error);

      return null;
    }
  }

  /**
   * Returns the active canvas element (CPU or VTK) based on render mode.
   */
  getCanvas(): HTMLCanvasElement {
    const rendering = this.getCurrentPlanarRendering();

    if (getRenderSurfaceForRenderMode(rendering?.renderMode) === 'cpu') {
      return this.renderContext.cpu.canvas;
    }

    return this.renderContext.vtk.canvas;
  }

  /**
   * Returns the vtk.js renderer of the viewport, in stack mode and in volume
   * mode. A prop of the application goes in with
   * `getRenderer().addActor(actor)` and out with
   * `getRenderer().removeActor(actor)`, each followed by `render()`. The
   * application keeps the prop: `getActors()` does not list it. Where the
   * slice is drawn on the GPU, the prop is drawn with it, in world
   * coordinates, behind the slice where it stands behind it. The CPU path
   * does not draw the renderer, so a prop does not show there.
   *
   * @returns The vtk.js renderer of the viewport.
   */
  getRenderer(): vtkRenderer {
    return this.renderContext.vtk.renderer;
  }

  /**
   * Keeps a widget of a tool under an id, as the 3D viewport does: the
   * OrientationMarkerTool keeps its vtk.js orientation marker widget here.
   * The rendering engine draws the renderer of each widget with the
   * viewport. A widget that follows the camera of `getRenderer()`, as the
   * orientation marker does, turns with the orientation of the view. The CPU
   * path does not draw it.
   *
   * @param widgetId - The id of the widget, the tool name for a tool.
   * @param widget - The widget.
   */
  addWidget(widgetId: string, widget: ViewportWidget): void {
    this.widgets.set(widgetId, widget);
  }

  /** Every widget that the viewport keeps. The rendering engine reads it. */
  getWidgets(): ViewportWidget[] {
    return Array.from(this.widgets.values());
  }

  /**
   * Disables every widget and takes the actor of a widget out of its
   * renderer. The rendering engine calls it when it disables the viewport.
   */
  override removeWidgets(): void {
    disableViewportWidgets(this.widgets.values());
  }

  /**
   * Adds overlay images on top of the primary render path output, each as an
   * overlay display set. The id of an image is its `displaySetId`, else its
   * `representationUID`, else its image id. An image whose id is a display
   * set that the viewport shows replaces the image of that display set: the
   * display set stays, so `DISPLAY_SETS_CHANGED` does not fire. The labelmap
   * of a stack is drawn this way, one display set for each labelmap layer
   * whose image follows the slice; a new id fires the event once.
   */
  async addImages(stackInputs: IStackInput[]): Promise<void> {
    const rendering = this.getCurrentPlanarRendering();
    const renderMode = rendering?.renderMode;

    // Overlay images mount on any registered image mode, and on volume modes
    // whose surface composites actors (the CPU volume path draws its slice
    // pixels directly and cannot host overlay actors).
    const supportsImageOverlays =
      isImageRenderMode(renderMode) ||
      (isVolumeRenderMode(renderMode) &&
        getRenderSurfaceForRenderMode(renderMode) !== 'cpu');

    if (!supportsImageOverlays) {
      return;
    }

    for (const stackInput of stackInputs) {
      const image = this.resolveStackInputImage(stackInput);

      if (!image) {
        continue;
      }

      const reference = this.resolveOverlayReference(stackInput, image);
      const displaySetId = this.resolveOverlayDisplaySetId(
        stackInput,
        image,
        reference
      );
      const replacesImage = this.bindings.has(displaySetId);

      displaySetRegistry.add(displaySetId, {
        image,
        imageData: stackInput.imageData,
        imageIds: [stackInput.imageId],
        reference,
        useWorldCoordinateImageData:
          stackInput.useWorldCoordinateImageData === true,
      });

      if (replacesImage) {
        const request = (this.overlayImageRequests.get(displaySetId) ?? 0) + 1;

        this.overlayImageRequests.set(displaySetId, request);

        const replaced = await this.addDisplaySetInternal(
          displaySetId,
          { role: 'overlay' },
          undefined,
          () => this.overlayImageRequests.get(displaySetId) !== request
        );

        this.clearResolvedViewCache();

        if (!replaced) {
          continue;
        }
      } else {
        await this.addDisplaySet(displaySetId, {
          role: 'overlay',
        });
      }

      const actorEntry = this.mountedData.getActorForDisplaySetId(displaySetId);

      if (stackInput.callback && actorEntry) {
        stackInput.callback({
          imageActor: actorEntry.actor as never,
          imageId: stackInput.imageId,
        });
      }
    }

    this.render();
  }

  /**
   * Returns image metadata for a given image object.
   */
  getImageDataMetadata(image: IImage) {
    return getImageDataMetadata(image);
  }

  // ====================================================================
  // Public API -- queries
  // ====================================================================

  /**
   * Returns the current image ids for the active planar dataset.
   *
   * @returns The image ids exposed by the active image or volume dataset.
   */
  getImageIds(): string[] {
    const planarData = this.getPlanarData();

    if (!planarData) {
      return [];
    }

    return planarData.imageVolume?.imageIds || planarData.imageIds;
  }

  /**
   * Returns the current volume id when the active dataset is volume-backed.
   * With a `volumeId` in the specifier it is that volume id when a dataset of
   * the viewport shows that volume, and undefined otherwise, as the legacy
   * volume viewport. In stack mode it is undefined: no volume is mounted.
   *
   * @returns The volume id for the active dataset, if one exists.
   */
  getVolumeId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    return this.viewReferences.getVolumeId(viewRefSpecifier);
  }

  /**
   * The ids of the volumes that the viewport shows, each once: the volume of
   * the source first, then those of the overlays in mount order. A display
   * set drawn as images shows no volume, so in stack mode the list is empty.
   *
   * The labelmap of a segmentation, an overlay whose descriptor has a
   * `reference` of kind `'segmentation'`, is left out: the list holds the
   * image volumes, such as the CT and the PT of a fusion. Pass
   * `{ includeSegmentations: true }` to have the labelmaps too. A labelmap
   * that the tools draw as images, as beside a slice cut on the CPU, shows no
   * volume and is in neither list.
   *
   * @param options - `includeSegmentations`: list the labelmap volumes too.
   * @returns The volume ids, the source first.
   */
  getVolumeIds(options: { includeSegmentations?: boolean } = {}): string[] {
    return this.mountedData.getVolumeIds(Boolean(options.includeSegmentations));
  }

  /**
   * The range of the values of the data of a display set, `[min, max]`: of
   * the source when no display set is given. It is read from the data, so it
   * is the same on every render path (GPU or CPU, frame, CPU slice or GPU
   * volume slice).
   *
   * - A display set drawn as a volume: the range of the whole volume, as its
   *   voxel manager knows it (`voxelManager.getRange()`). While the volume
   *   loads it is the range of the images that have arrived, so it can
   *   grow: read it again at `IMAGE_VOLUME_MODIFIED`. A dynamic volume gives
   *   the range of its time point on display.
   * - A display set drawn as images (stack mode): the range of the image on
   *   display, its `minPixelValue` and `maxPixelValue`; read it again at
   *   `NEW_IMAGE`.
   *
   * The values are those that the image loader gave for each image. Undefined
   * when the display set is not mounted, before the image on display or the
   * first image of the volume has arrived, and when the data gives no range.
   *
   * @param displaySetId - The display set; the source when not given.
   * @returns The range, or undefined.
   */
  getScalarRange(displaySetId?: string): [number, number] | undefined {
    return this.mountedData.getScalarRange(displaySetId);
  }

  /**
   * Whether the view shows the data in the plane it was acquired in. A
   * stack shows its images: true. A volume: true when the view plane normal
   * shows the acquisition plane of the source volume, by
   * `utilities.isAcquisitionPlaneNormal`, the rule by which the viewport draws
   * the acquired frames; so an axial view of an axial series is in its
   * acquisition plane, a sagittal reformat or an oblique plane of it is not.
   * False with nothing mounted.
   *
   * @returns Whether the view is in the acquisition plane.
   */
  isInAcquisitionPlane(): boolean {
    const mode = this.getCurrentMode();

    if (mode !== 'volume') {
      return mode === 'stack';
    }

    const imageVolume = this.mountedData.getImageVolume();
    const { viewPlaneNormal } = this.getViewReference();

    return Boolean(
      imageVolume &&
        viewPlaneNormal &&
        isAcquisitionPlaneNormal(imageVolume, viewPlaneNormal)
    );
  }

  getSourceDisplaySetId(): string | undefined {
    return this.mountedData.getSourceDisplaySetId();
  }

  /**
   * The planar family can show a lossy stack image or reduced volume data
   * (GENVIEW-FIDELITY-8), so it reports fidelity before it mounts data.
   */
  override canReportFidelity(): boolean {
    return true;
  }

  /**
   * Content-true classification of the bound source data for a planar viewport.
   *
   * A `PLANAR` viewport renders both image-id stacks and volume slices, so
   * its content mode is derived from the active source binding's render mode
   * (and, as a fallback, from whether a source volume id is bound) rather than
   * from the viewport type. Returns `empty` when no source data is mounted.
   */
  getCurrentMode(): ViewportContentMode {
    const binding = this.getSourceBinding();

    if (!binding) {
      return 'empty';
    }

    const renderMode = binding.rendering.renderMode;

    if (isVolumeRenderMode(renderMode)) {
      return 'volume';
    }

    if (isImageRenderMode(renderMode)) {
      return 'stack';
    }

    // Render mode not yet resolved; fall back to bound-data inspection.
    return this.getVolumeId() ? 'volume' : 'stack';
  }

  /**
   * Whether a change of the appearance of a display set fires
   * `DISPLAY_SET_APPEARANCE_CHANGED`: not for the labelmap of a
   * segmentation, whose look the segmentation style owns. The legacy
   * viewports fired no VOI event for a labelmap either.
   */
  protected override firesAppearanceEvents(displaySetId: string): boolean {
    const binding = this.getBinding(displaySetId);

    return (
      !this.suppressEvents &&
      !!binding &&
      !isSegmentationOverlayData(binding.data as LoadedData<PlanarPayload>, {
        renderMode: binding.rendering.renderMode,
        role: binding.role,
      })
    );
  }

  /**
   * Fires `DISPLAY_SET_APPEARANCE_CHANGED` once with cause `'default'` when
   * a new image of a stack changed the window, the invert or the VOI LUT
   * function on display: the key is not set for the display set, and the
   * default of the new image is another than in `previousDefaults`, those
   * of the image before. A key that is set stays on display over a scroll,
   * so nothing fires for it, and nothing fires for the window of an image
   * without one (no range, or a range whose upper end is below its lower
   * end).
   */
  private notifyDefaultAppearanceOfNewImage(
    displaySetId: string,
    previousDefaults: Pick<
      PlanarDisplaySetAppearance,
      'voiRange' | 'invert' | 'voiLUTFunction'
    >
  ): void {
    const defaults = this.getDefaultDisplaySetAppearance(displaySetId);
    const overrides = this.getAppearanceState(displaySetId) ?? {};
    const previous = {
      ...previousDefaults,
      invert: previousDefaults.invert ?? false,
    };
    const range = defaults.voiRange;
    const changedKeys = (['voiRange', 'invert', 'voiLUTFunction'] as const)
      .filter(
        (key) =>
          overrides[key] === undefined &&
          !deepEqual(defaults[key], previous[key])
      )
      .filter(
        (key) => key !== 'voiRange' || (range && range.upper >= range.lower)
      );

    if (changedKeys.length) {
      this.notifyAppearanceChanged(displaySetId, 'default', [...changedKeys]);
    }
  }

  /**
   * The volume that the appearance event of a display set names: the
   * volume that its binding draws, and none when the binding draws images.
   * The binding keeps what the mount drew, so a registration that names
   * another volume after the load does not count.
   */
  protected override getAppearanceEventVolumeId(
    displaySetId: string
  ): string | undefined {
    const binding = this.getBinding(displaySetId);

    if (!binding || isImageRenderMode(binding.rendering.renderMode)) {
      return undefined;
    }

    return (binding.data as LoadedData<PlanarPayload>).volumeId;
  }

  /**
   * The defaults that the effective appearance shows under the overrides:
   * visible, an opacity of 1, the default window of the image or volume on
   * display, the default invert of the image (true for MONOCHROME1), and
   * the VOI LUT function of the metadata of the image, which a volume and
   * an image without one do not have.
   */
  protected override getDefaultDisplaySetAppearance(
    displaySetId: string
  ): Partial<PlanarDisplaySetAppearance> {
    return {
      opacity: 1,
      ...super.getDefaultDisplaySetAppearance(displaySetId),
      voiRange: this.getDefaultVOIRange(displaySetId),
      invert: this.getDefaultInvert(displaySetId) ?? false,
      voiLUTFunction: this.mountedData.getDefaultVOILUTFunction(displaySetId),
    };
  }

  getDefaultVOIRange(displaySetId?: string): VOIRange | undefined {
    return this.mountedData.getDefaultVOIRange(displaySetId);
  }

  /**
   * Whether the image of a display set is drawn inverted when its
   * appearance does not set `invert`: true for a MONOCHROME1 image. It is
   * undefined for data that has no such default, as a volume.
   *
   * @param displaySetId - Optional display set id; defaults to the active source.
   */
  getDefaultInvert(displaySetId?: string): boolean | undefined {
    return this.mountedData.getDefaultInvert(displaySetId);
  }

  /**
   * Returns the current slice index for stack-like and slice-like workflows.
   *
   * @returns The current zero-based image index.
   */
  getCurrentImageIdIndex(): number {
    return this.getActiveImageIdIndex();
  }

  /**
   * Resolves the currently referenced image id from the active camera state.
   *
   * @returns The current image id, if one can be resolved.
   */
  getCurrentImageId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    return this.viewReferences.getCurrentImageId(viewRefSpecifier);
  }

  /**
   * Alias for `getCurrentImageIdIndex` used by legacy stack-style callers.
   *
   * @returns The current zero-based image index.
   */
  getSliceIndex(): number {
    return this.getActiveImageIdIndex();
  }

  /**
   * Returns the number of navigable slices for the current source data.
   *
   * For image/stack content this is the number of image ids; for volume-slice
   * content it is the slice count along the current view direction. This is the
   * native equivalent of the legacy stack/volume `getNumberOfSlices()` and is
   * what `csUtils.jumpToSlice`, scroll, and image-slice synchronizers rely on
   * for a `PLANAR` viewport.
   *
   * @returns The total slice count for the active source data.
   */
  getNumberOfSlices(): number {
    const imageCount = this.getImageIds().length;

    // No source data mounted: report zero navigable slices. Without this guard
    // getMaxImageIdIndex() falls back to 0 and the Math.max below would report a
    // phantom single slice for an empty viewport.
    if (!imageCount) {
      return 0;
    }

    // getMaxImageIdIndex() returns the view-direction slice count - 1 when the
    // volume-slice render path provides it (so a reformatted/oblique plane
    // reports its own slice count), and falls back to imageCount - 1 otherwise.
    // Use it directly: maxing against the acquisition imageCount over-reported
    // reformatted directions whose slice count is smaller than the acquisition
    // image count, pushing scroll/cine/jump past the real slice range. The
    // fallback keeps the stack / pre-binding count equal to imageCount.
    return this.getMaxImageIdIndex() + 1;
  }

  /**
   * Re-applies the calibrated pixel spacing for an image (CS-12). The
   * counterpart of `calibrateSpacing` of the 5.x stack viewport.
   *
   * The caller (the tools `calibrateImageSpacing` utility) first adds the calibration
   * to the `calibratedPixelSpacingMetadataProvider`; this method then re-renders and
   * emits `IMAGE_SPACING_CALIBRATED` so annotation tools invalidate their cached stats
   * and recompute lengths against the new calibration. The native data path reads
   * `calibration` fresh from `getImageData()` on every access (see
   * `buildPlanarImageData` -> `getImageDataMetadata` -> `buildMetadata`), so there is
   * no cached spacing to rebuild — the event + render are the whole job.
   *
   * Defining this method is also what makes `viewportSupportsStackCalibration` return
   * true for a native viewport, so `calibrateImageSpacing` routes here instead of
   * skipping the viewport (it has no legacy `setStack` to fall back to).
   *
   * @param imageId - the imageId whose calibration changed
   */
  public calibrateSpacing(imageId: string): void {
    this.render();

    const cpuImageData = this.getImageData() as CPUIImageData | undefined;
    const userCalibration = metaData.get('calibratedPixelSpacing', imageId) as
      | { scale?: number }
      | undefined;

    triggerEvent(this.element, Events.IMAGE_SPACING_CALIBRATED, {
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      imageId,
      calibration: cpuImageData?.calibration,
      imageData: cpuImageData?.imageData,
      worldToIndex: cpuImageData
        ? getPlanarWorldToIndexMatrix(cpuImageData)
        : undefined,
      scale: userCalibration?.scale,
    });
  }

  // ====================================================================
  // Public API -- camera & navigation
  // ====================================================================

  protected normalizeViewState(viewState: PlanarViewState): PlanarViewState {
    return normalizePlanarViewState(viewState);
  }

  /**
   * Merges partial Planar view-state updates into the viewport state.
   *
   * The flips apply first and the rotation after, about the normal of the
   * flipped view, as on the 5.x viewports. A patch that changes a flip and
   * has no `rotation` mirrors the picture on the screen, as the 5.x flip and
   * `setCamera` did: the rotation becomes 360 minus the rotation for each
   * flip that changes.
   *
   * A patch with a defined `displayArea` and none of `scale`, `scaleMode`,
   * `anchorWorld` and `anchorCanvas` shows the area as it is: scale `[1, 1]`,
   * the scale mode of the area (`fit` without one), centred. An explicit
   * field of the patch wins. `{ displayArea: undefined }` clears the area. A
   * display area with `storeAsInitialCamera: true` becomes the one that
   * `resetViewState` goes back to.
   */
  public override setViewState(viewStatePatch: Partial<PlanarViewState>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getResolvedCameraForEvent();

    if (viewStatePatch.displayArea?.storeAsInitialCamera) {
      this.initialDisplayArea = cloneDisplayArea(viewStatePatch.displayArea);
    }

    const next = {
      ...this.viewState,
      ...withDisplayAreaFraming(viewStatePatch),
    };

    if (!Object.prototype.hasOwnProperty.call(viewStatePatch, 'rotation')) {
      next.rotation = getPlanarRotationAfterFlips(this.viewState, next);
    }

    if (Object.prototype.hasOwnProperty.call(viewStatePatch, 'orientation')) {
      next.orientation = this.resolveNextOrientation(
        viewStatePatch.orientation
      );
    }

    this.clearResolvedViewCache();
    this.viewState = this.normalizeViewState(next);
    this.modified(previousCamera);
  }

  setDisplaySetAppearance(props: Partial<PlanarDisplaySetAppearance>): void;
  setDisplaySetAppearance(
    displaySetId: string,
    props: Partial<PlanarDisplaySetAppearance>
  ): void;
  setDisplaySetAppearance(
    displaySetIdOrProps: string | Partial<PlanarDisplaySetAppearance>,
    maybeProps?: Partial<PlanarDisplaySetAppearance>
  ): void {
    this.clearResolvedViewCache();

    if (typeof displaySetIdOrProps === 'string') {
      super.setDisplaySetAppearance(displaySetIdOrProps, maybeProps ?? {});
      return;
    }

    super.setDisplaySetAppearance(displaySetIdOrProps);
  }

  /**
   * Stores the appearance of a display set and gives it to the mounted
   * binding. When the new slab needs another render mode than the mounted one
   * (`getRenderModeForAppearance`), the mounted binding keeps the slab
   * thickness and the blend mode that it draws, so it does no work for a slab
   * that is about to move, and gets every other field at once. The stored
   * appearance is the new one, and the remounted binding gets it. When the
   * change starts a remount, the render that it asks for is held with the
   * renders of the remount (`applyRenderingPipelineUpdate`).
   */
  protected override setAppearanceState(
    displaySetId: string,
    props: PlanarDisplaySetAppearance
  ): void {
    const previousProps = this.getAppearanceState(displaySetId);
    const binding = this.bindings.get(displaySetId);
    const decision = this.getRenderModeForAppearance(
      displaySetId,
      previousProps,
      props
    );
    const renderMode = decision?.renderMode;
    const movesAway =
      !!binding &&
      (renderMode === undefined
        ? this.withheldSlabByBinding.has(binding)
        : renderMode !== binding.rendering.renderMode);
    const remounts =
      renderMode !== undefined &&
      (renderMode !== binding?.rendering.renderMode ||
        !!this.pendingRenderPipelineUpdate);

    this.clearResolvedViewCache();

    if (remounts) {
      this.remountRenderHolds += 1;
    }

    if (!movesAway || this.isDestroyed) {
      if (binding) {
        this.withheldSlabByBinding.delete(binding);
      }

      super.setAppearanceState(displaySetId, props);
    } else {
      const mountedSlab =
        this.withheldSlabByBinding.get(binding) ??
        getSlabAppearance(previousProps);

      this.withheldSlabByBinding.set(binding, mountedSlab);
      this.displaySetAppearances.set(displaySetId, props);
      binding.updateAppearance({
        ...this.getAppliedAppearance(displaySetId),
        ...mountedSlab,
      });
      this.render();
    }

    if (remounts) {
      this.startRenderingPipelineUpdate();
      this.releaseRemountRenderHold();
    } else if (decision && binding) {
      this.updateRenderPlan(displaySetId, decision.reason);
    }
  }

  /**
   * The render mode, and its reason, that a mounted volume display set needs
   * for a new appearance, when it may change: a slab moves a sampled slice
   * to the GPU volume path, and back. Only a change of the slab thickness or
   * the blend mode runs the decision, so a window level change costs nothing.
   * Returns undefined when the decision does not run. The caller starts the
   * remount (`applyRenderingPipelineUpdate`) when the mode differs from the
   * mounted one, and also while a pass is pending, because the pending pass
   * may mount the mode that an older appearance chose. Otherwise it stores
   * the reason in the render plan.
   */
  private getRenderModeForAppearance(
    displaySetId: string,
    previousProps: PlanarDisplaySetAppearance | undefined,
    props: PlanarDisplaySetAppearance | undefined
  ): PlanarRenderModeDecision | undefined {
    if (
      previousProps?.slabThickness === props?.slabThickness &&
      previousProps?.blendMode === props?.blendMode
    ) {
      return;
    }

    const binding = this.bindings.get(displaySetId);
    const mounted = this.mountedDisplaySets.get(displaySetId);

    if (
      this.isDestroyed ||
      !binding ||
      !mounted ||
      !isVolumeRenderMode(binding.rendering.renderMode)
    ) {
      return;
    }

    const dataSet = mounted.descriptor;
    const options = {
      ...mounted.options,
      role: binding.role,
    };

    try {
      const { renderMode, reason } = selectPlanarRenderPath(
        dataSet,
        this.getRenderPathDecisionOptions(
          displaySetId,
          options,
          this.resolveRequestedOrientation(
            options.orientation,
            dataSet.imageIds
          ),
          props
        )
      );

      return { renderMode, reason };
    } catch {
      return;
    }
  }

  /**
   * Returns the current rotation angle in degrees.
   */
  getRotation(): number {
    return (
      this.getResolvedView()?.rotation ??
      normalizePlanarRotation(this.viewState.rotation)
    );
  }

  /**
   * Returns the current world-space anchor point when one is set.
   */
  getAnchorWorld(): Point3 | undefined {
    const anchorWorld = this.viewState.anchorWorld;

    return anchorWorld ? ([...anchorWorld] as Point3) : undefined;
  }

  /**
   * Sets or clears the world-space anchor point.
   */
  setAnchorWorld(point?: Point3): void {
    this.setViewState({
      anchorWorld: point ? ([...point] as Point3) : undefined,
    });
  }

  /** @deprecated Legacy shim for `getZoom()`. */
  getZoom(): number {
    return getPlanarProjectionZoom(this.getProjectionSnapshot());
  }

  /**
   * Returns the current native two-axis Planar scale.
   */
  getScale(): Point2 {
    return getPlanarProjectionScale(this.getProjectionSnapshot());
  }

  /**
   * The stretch of the axes: the scale pair of the view divided by its
   * smaller value, `[2, 1]` for a picture twice as wide as the fit, as the
   * legacy `getAspectRatio()` gave after `setAspectRatio([2, 1])`.
   */
  override getAspectRatio(): Point2 {
    return getNormalizedAspectRatio(this.getScale());
  }

  /** @deprecated Legacy shim for `setZoom(...)`. */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    this.setScale(zoom, canvasPoint);
  }

  /**
   * Sets the native two-axis Planar scale. A scalar keeps legacy uniform zoom
   * behavior; a tuple intentionally changes the displayed aspect ratio.
   */
  setScale(scale: PlanarScaleInput, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();
    const nextScale = normalizePlanarScale(scale);

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withScale(nextScale, canvasPoint).state.viewState
      );
      return;
    }

    if (canvasPoint) {
      this.setScaleAtCanvasPoint(nextScale, canvasPoint);
      return;
    }

    this.setViewState({
      displayArea: undefined,
      scale: nextScale,
      scaleMode: 'fit',
    });
  }

  /** @deprecated Legacy shim for `getPan()`. */
  getPan(): Point2 {
    return getPlanarProjectionPan(this.getProjectionSnapshot());
  }

  /** @deprecated Legacy shim for `setPan(...)`. */
  setPan(nextPan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withPan(nextPan).state.viewState
      );
      return;
    }

    this.applyResolvedViewState(
      this.getFallbackViewStateWithPan(this.viewState, nextPan)
    );
  }

  /**
   * Sets the zoom scale anchored to a specific canvas point.
   */
  setScaleAtCanvasPoint(scale: PlanarScaleInput, canvasPoint: Point2): void {
    const resolvedView = this.getResolvedView();
    const nextScale = normalizePlanarScale(scale);

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withScale(nextScale, canvasPoint).state.viewState
      );
      return;
    }

    const worldPoint = this.buildFallbackCanvasToWorld(canvasPoint);
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();

    this.setViewState({
      anchorWorld: worldPoint,
      anchorCanvas: [
        canvasPoint[0] / Math.max(canvasWidth, 1),
        canvasPoint[1] / Math.max(canvasHeight, 1),
      ],
      displayArea: undefined,
      scale: nextScale,
      scaleMode: 'fit',
    });
  }

  /**
   * Returns the raw planar view state.
   */
  getViewState(): PlanarViewState {
    return normalizePlanarViewState(this.viewState);
  }

  /**
   * Returns the resolved view snapshot that resolves the raw camera
   * state against the current render context and data geometry.
   */
  getResolvedView(
    args: {
      frameOfReferenceUID?: string;
      sliceIndex?: number;
    } = {}
  ) {
    return this.resolveCachedViewState(this.viewState, args);
  }

  // ====================================================================
  // Public API -- view reference & synchronization
  // ====================================================================

  /**
   * Returns the rendering engine that owns this viewport.
   *
   * @returns The parent rendering engine, if it is still registered.
   */
  getRenderingEngine() {
    return renderingEngineCache.get(this.renderingEngineId);
  }

  /**
   * Builds a spatial reference object for cross-viewport synchronization.
   *
   * @param viewRefSpecifier - Optional fields that refine the produced
   * reference object.
   * @returns A spatial view reference for the current planar state.
   */
  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    return this.viewReferences.getViewReference(viewRefSpecifier);
  }

  /**
   * Builds a stable id for the current view reference.
   *
   * @param viewRefSpecifier - Optional fields that refine the produced
   * reference id.
   * @returns A stable identifier for the current planar reference state.
   */
  getViewReferenceId(viewRefSpecifier: ViewReferenceSpecifier = {}): string {
    return this.viewReferences.getViewReferenceId(viewRefSpecifier);
  }

  /**
   * Moves the view to the slice, the plane and the time point of a view
   * reference. The source stays the source: a reference of an overlay moves
   * the source to the plane and the point of the reference, and no reference
   * makes another display set the source.
   */
  setViewReference(viewRef: ViewReference): void {
    this.viewReferences.setViewReference(viewRef);
  }

  /**
   * Returns the active image-data object when the current render path exposes
   * one.
   *
   * @param volumeId - Optional: when the viewport displays several volumes
   * (eg a fusion viewport), return the image data of the binding showing
   * this volume rather than of the active/default binding.  Mirrors the
   * `getImageData(volumeId?)` signature of the 5.x volume viewport, which
   * per-target consumers (eg annotation statistics) call.
   * @returns The image-data object, if exposed by the render path.
   */
  getImageData(volumeId?: string): IImageData | CPUIImageData | undefined {
    if (volumeId) {
      const displaySetId = this.getDisplaySetIdForVolumeId(volumeId);
      const binding = displaySetId ? this.getBinding(displaySetId) : undefined;
      return binding?.getImageData?.();
    }
    return this.getCurrentBinding()?.getImageData?.();
  }

  // ====================================================================
  // Public API -- coordinate transforms
  // ====================================================================

  /**
   * Converts canvas-space to world-space through the resolved semantic view.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return this.buildFallbackCanvasToWorld(canvasPos);
    }

    return resolvedView.canvasToWorld(canvasPos);
  }

  /**
   * Converts world-space to canvas-space through the resolved semantic view.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return this.buildFallbackWorldToCanvas(worldPos);
    }

    return resolvedView.worldToCanvas(worldPos);
  }

  /**
   * Returns the frame of reference UID from the resolved view,
   * resolving against the active binding's spatial metadata. Images without
   * one get one made from the set of the images, the same on every viewport
   * of those images; a viewport without data gets
   * `planarNext-viewport-<id>`.
   */
  override getFrameOfReferenceUID(): string {
    return this.viewReferences.getFrameOfReferenceUID();
  }

  /**
   * Returns whether the active dataset contains the given image id.
   *
   * @param imageId - Image id to look up in the active dataset.
   * @returns `true` when the image id is present in the active dataset.
   */
  hasImageId(imageId: string): boolean {
    return this.getImageIds().includes(imageId);
  }

  /**
   * Returns whether the active dataset contains an image with the given URI.
   *
   * @param imageURI - URI form of the image id to look up.
   * @returns `true` when a matching image URI exists in the active dataset.
   */
  hasImageURI(imageURI: string): boolean {
    return this.getImageIds().some(
      (imageId) => imageIdToURI(imageId) === imageURI
    );
  }

  /**
   * Returns whether any bound dataset shows the given volume id. A dataset
   * in stack mode shows no volume, so it does not count for the id that its
   * images would get as a volume.
   *
   * @param volumeId - Volume id to compare against the bound datasets.
   * @returns `true` when a source or overlay binding shows the volume id.
   */
  hasVolumeId(volumeId: string): boolean {
    const displaySetId = this.getDisplaySetIdForVolumeId(volumeId);

    return (
      displaySetId !== undefined &&
      !isImageRenderMode(this.getBinding(displaySetId)?.rendering.renderMode)
    );
  }

  /**
   * Returns whether a volume on display has an id that contains the given URI
   * fragment: the volume of the source or of any overlay, as the legacy volume
   * viewport looked through all its volumes. A display set drawn as images
   * shows no volume, so a viewport in stack mode or with no data has none.
   *
   * @param volumeURI - Volume URI substring to compare against the volume ids.
   * @returns `true` when a volume on display has the given volume URI.
   */
  hasVolumeURI(volumeURI: string): boolean {
    for (const binding of this.bindings.values()) {
      const { volumeId } = binding.data as LoadedData<PlanarPayload>;

      if (
        volumeId?.includes(volumeURI) &&
        !isImageRenderMode(binding.rendering.renderMode)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns whether a spatial plane is viewable in the current planar state.
   *
   * @param planeRestriction - Plane description to test against the current
   * viewport state.
   * @param options - Optional compatibility flags for the spatial check.
   * @returns `true` when the plane can be viewed in this viewport state.
   */
  isPlaneViewable(
    planeRestriction: PlaneRestriction,
    options?: ReferenceCompatibleOptions
  ): boolean {
    return this.viewReferences.isPlaneViewable(planeRestriction, options);
  }

  /**
   * A check that answers `isReferenceViewable` for many references against
   * the view as it is now, as on every viewport. It reads the reference
   * contexts of the view, its mode and the image on display once, so that a
   * filter of the annotations of a draw does not resolve the view and read
   * the metadata of the image on display for each annotation. Make a new one
   * after the view changes.
   *
   * `asOverlay` takes an image that is not in the stack but lies on the image
   * shown as viewable.
   *
   * A reference over a range of slices (`multiSliceReference`) is viewable on
   * every slice of the range, in stack mode and in volume mode in the
   * orientation of the images. Its plane restriction, which pins its first
   * slice, is not asked then.
   *
   * In stack mode `asNearbyProjection` takes a reference by a focal point
   * only as viewable when the point lies within half a slice of the image
   * shown: on each side of its plane, half the distance to the image next to
   * it in the stack on that side, or beyond the first or the last image half
   * the distance to its one neighbour (`getStackImageHalfSlices`), so that a
   * point belongs to the image of the stack nearest to it, as a slice of a
   * volume. The legacy stack viewport of 5.x took a point only within
   * 0.0005 mm of the image.
   *
   * In stack mode a reference that names only a frame of reference, a plane
   * or points (no image, volume, display set, slice index, range or plane
   * restriction; `namesOnlyFrameOfReferencePlaneOrPoints`), as a 3D point
   * annotation, is viewable only with `asVolume` or, when its point lies
   * within half a slice of the image shown, with `asNearbyProjection`, as on
   * the legacy stack viewport of 5.18.3. It does not show on every image of
   * the stack, also not with `withNavigation`.
   *
   * In stack mode `asVolume` takes a reference that names no image as
   * viewable when it names a volume or a frame of reference and is in the
   * frame of reference of the stack, whatever its plane and slice, as the
   * legacy stack viewport does: the stack could show it as a volume. A
   * reference that names an image by its URI only is taken so when the
   * stack has that image. In stack mode `withOrientation` is not read: a
   * reference of another plane needs `asVolume`, as on the legacy stack
   * viewport. In volume mode `asVolume` has no effect.
   *
   * In stack mode with `withNavigation` a reference that names an image of
   * the stack is viewable whatever plane it names, as on the legacy stack
   * viewport: the stack shows each image in its own plane, also in a stack
   * of images in several orientations.
   *
   * In stack mode a reference that names the image on display by its image
   * id is viewable with any options and whatever plane it names, as on the
   * legacy stack viewport.
   *
   * In volume mode a reference that names an image and no frame of reference
   * is not viewable with any option, as on the legacy volume viewport; only
   * `asOverlay`, which that viewport did not read, still takes an image that
   * lies on the slice on display.
   *
   * A reference with a point, a direction or a slice index that is not a
   * finite number is not viewable with any option, in both modes, and
   * `setViewReference` moves nothing for it.
   *
   * @returns The check: for a view reference and options, `true` when the
   * reference can be viewed in the view of the moment the check was made.
   */
  getReferenceViewableCheck(): ReferenceViewableCheck {
    const contexts = this.getReferenceViewContexts();
    const mode = this.getCurrentMode();
    const isStack = mode === 'stack';
    const currentImageId = isStack ? this.getCurrentImageId() : undefined;
    let imageData: CPUIImageData | undefined;
    let halfSlices: StackImageHalfSlices | undefined;
    const isNearImageOnDisplay = (point: Point3): boolean => {
      imageData ??= this.getImageData() as CPUIImageData | undefined;

      if (!imageData) {
        return false;
      }

      halfSlices ??= getStackImageHalfSlices(
        this.getImageIds(),
        this.getCurrentImageIdIndex(),
        imageData
      );

      return isPointNearImagePlane(point, imageData, halfSlices);
    };

    return (viewRef, options = {}) => {
      if (hasNonFiniteViewReferenceGeometry(viewRef)) {
        return false;
      }

      const reference = getPlanarReferenceForViewableCheck(viewRef);

      if (
        isStack &&
        viewRef?.referencedImageId &&
        viewRef.referencedImageId === currentImageId
      ) {
        return true;
      }

      if (
        mode === 'volume' &&
        !options.asOverlay &&
        namesImageWithoutFrameOfReference(viewRef)
      ) {
        return false;
      }

      if (isStack && namesOnlyFrameOfReferencePlaneOrPoints(viewRef)) {
        if (options.asVolume) {
          return isViewReferenceViewableAsVolume(reference, contexts);
        }

        if (
          !options.asNearbyProjection ||
          !viewRef.cameraFocalPoint ||
          !isViewReferenceViewable(reference, contexts, {})
        ) {
          return false;
        }

        return isNearImageOnDisplay(viewRef.cameraFocalPoint);
      }

      const checkOptions = isStack
        ? { ...options, withOrientation: options.asVolume }
        : options;
      const imageReference =
        isStack && options.withNavigation
          ? getPlanarImageReferenceForStack(reference)
          : undefined;
      const isViewable =
        isViewReferenceViewable(reference, contexts, checkOptions) ||
        Boolean(
          imageReference &&
            isViewReferenceViewable(imageReference, contexts, checkOptions)
        );

      if (!isViewable && options.asVolume && isStack) {
        return isViewReferenceViewableAsVolume(reference, contexts);
      }

      if (
        !isViewable ||
        !options.asNearbyProjection ||
        !viewRef.cameraFocalPoint ||
        viewRef.referencedImageId ||
        viewRef.volumeId ||
        viewRef.FrameOfReferenceUID ||
        !isStack
      ) {
        return isViewable;
      }

      return isNearImageOnDisplay(viewRef.cameraFocalPoint);
    };
  }

  /**
   * Sets the active image index and resolves the corresponding image id.
   *
   * On a stack `getCurrentImageIdIndex` gives the new index at once, and the
   * promise resolves once the image is shown or its load failed. Asking for
   * the index that is shown resolves at once. Asking again for an index whose
   * image failed to load loads it again.
   *
   * @param imageIdIndex - Requested zero-based image index.
   * @returns The resolved image id after clamping.
   */
  setImageIdIndex(imageIdIndex: number): Promise<string> {
    const imageIds = this.getImageIds();

    if (!imageIds.length) {
      return Promise.reject(
        new Error('[PlanarViewport] Cannot set image index on empty stack')
      );
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, imageIdIndex),
      this.getMaxImageIdIndex()
    );
    const resolvedImageId =
      imageIds[clampedImageIdIndex] || imageIds[imageIds.length - 1];
    const rendering = this.getCurrentPlanarRendering();

    if (isVolumeRenderMode(rendering?.renderMode)) {
      const sliceWorldPoint =
        this.getVolumeSliceWorldPointForImageIdIndex(clampedImageIdIndex);

      if (sliceWorldPoint) {
        this.setViewState({
          slice: {
            kind: 'volumePoint',
            sliceWorldPoint,
          },
        });
      }

      return Promise.resolve(resolvedImageId);
    }

    const imageLoads = rendering as PlanarStackImageLoads | undefined;

    if (
      this.getCurrentMode() === 'stack' &&
      imageLoads?.failedImageIdIndex === clampedImageIdIndex
    ) {
      imageLoads.lastRequestedImageIdIndex = undefined;
      imageLoads.failedImageIdIndex = undefined;
    }

    const loadRequestId = imageLoads?.loadRequestId;

    this.setViewState({
      slice: {
        kind: 'stackIndex',
        imageIdIndex: clampedImageIdIndex,
      },
    });

    if (imageLoads?.imageLoad && imageLoads.loadRequestId !== loadRequestId) {
      return imageLoads.imageLoad.then(() => resolvedImageId);
    }

    return Promise.resolve(resolvedImageId);
  }

  /**
   * Scrolls by a signed number of steps, with the scroll of
   * `utilities.scroll`: the same request gives the same position and the
   * same event by either. A step is one image of a stack or one slice of the
   * source volume along the view, in any orientation. Without `loop` the
   * scroll stops at the first and at the last one, and when it stops there
   * short of the step it asked for it fires SCROLL_OUT_OF_BOUNDS on the
   * element and on the eventTarget.
   *
   * @param delta - Signed number of steps to move by.
   * @param options - `loop` wraps at both ends; `scrollSlabs` makes a step
   * the slab thickness of the source in volume mode; `volumeId` names
   * another volume of the viewport whose spacing along the view gives the
   * step in volume mode.
   * @returns The resolved image id after scrolling; with a step of a slab or
   * of another volume, the image on display, undefined out of the
   * acquisition plane.
   */
  scroll(
    delta: number,
    options: Omit<ScrollOptions, 'delta'> = {}
  ): Promise<string | undefined> {
    return scrollViewport(this, { ...options, delta });
  }

  /**
   * Sets the orientation of the view. It is `setViewState({ orientation })`:
   * the same input gives the same view by either call.
   *
   * In stack mode an orientation cannot change: a stack shows its images in
   * their acquisition plane. The call then does nothing and does not throw.
   * `canRenderOrientation` says beforehand whether the view can take one.
   *
   * @param orientation - The orientation of the view (see `PlanarOrientation`).
   */
  setOrientation(orientation: PlanarOrientation): void {
    this.setViewState({ orientation });
  }

  /**
   * Reports whether the viewport could render the given orientation for the
   * current (or a specified) source data, without throwing.
   *
   * Acquisition-aligned orientations are always renderable; reformatted
   * orientations (AXIAL/SAGITTAL/CORONAL) require volume-backed data. Use this
   * to pre-check before `setOrientation()` / `setViewState({ orientation })`
   * (for example to enable/disable an MPR control) instead of relying on the
   * render-path decision service throwing on an unsupported request.
   *
   * For a display set that is mounted in stack mode the answer is false for
   * every orientation but the one of its images: a stack cannot change its
   * orientation. For a display set that is not mounted it says whether a
   * mount with that orientation would render.
   *
   * @param orientation - The orientation to test.
   * @param displaySetId - Optional display set id; defaults to the active source.
   * @returns `true` when the orientation can be rendered for the data.
   */
  canRenderOrientation(
    orientation: PlanarOrientation,
    displaySetId?: string
  ): boolean {
    const targetDisplaySetId = displaySetId ?? this.getSourceDisplaySetId();

    if (!targetDisplaySetId) {
      return false;
    }

    const dataSet = this.getDescriptor(targetDisplaySetId);

    if (!dataSet) {
      return false;
    }

    try {
      return this.canShowOrientation(
        targetDisplaySetId,
        this.resolveOrientation(
          orientation,
          dataSet.imageIds,
          this.getResolvedCameraForEvent()?.viewPlaneNormal
        )
      );
    } catch {
      return false;
    }
  }

  /**
   * Resets the view state back to the viewport defaults.
   *
   * Navigation state such as the current slice remains unchanged. A reset of
   * the pan and the zoom shows the display area that was last given with
   * `storeAsInitialCamera: true` (in `defaultOptions.displayArea` or in a
   * view state patch), and clears any other display area, as the legacy
   * `resetCamera` applied the display area of the options.
   *
   * @param options - Flags controlling which view-state fields are reset.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewState(options?: PlanarResetViewStateOptions): boolean {
    const {
      resetPan = true,
      resetZoom = true,
      resetOrientation = true,
      resetFlip = true,
    } = options || {};
    const nextCamera: Partial<PlanarViewState> = {
      rotation: 0,
    };

    if (resetPan) {
      nextCamera.anchorWorld = undefined;
      nextCamera.anchorCanvas = [0.5, 0.5];
    }

    if (resetZoom) {
      nextCamera.scale = [1, 1];
      nextCamera.scaleMode = 'fit';
    }

    if (resetOrientation) {
      nextCamera.orientation = this.resolveRequestedOrientation(
        undefined,
        this.getImageIds()
      );
    }

    if (resetFlip) {
      nextCamera.flipHorizontal = false;
      nextCamera.flipVertical = false;
    }

    if (resetPan && resetZoom) {
      nextCamera.displayArea = cloneDisplayArea(this.initialDisplayArea);
    }

    this.setViewState(nextCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Resets view state after a resize using the same behavior as
   * `resetViewState`.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetViewStateForResize(): boolean {
    return this.resetViewState();
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * Returns whether this viewport bypasses the shared rendering pipeline:
   * only on a device without WebGL, where it draws itself on the CPU.
   */
  getUseCustomRenderingPipeline(): boolean {
    return isWebGLUnavailable();
  }

  /**
   * No-op called by the rendering engine after completing a frame.
   */
  setRendered(): void {
    super.setRendered();
  }

  /**
   * Resizes the internal CPU canvas and notifies active render bindings.
   * The CPU canvas takes the size that the rendering engine gives the canvas
   * of the pane (`getDevicePixelSize` of the box that holds that canvas), so
   * a pane has one canvas size on the CPU and on the GPU.
   * The display sets drawn on the CPU are drawn again at once on the
   * resized canvas (`drawClearedCpuCanvas`). The view keeps its camera
   * through the new size, as the legacy viewports did
   * (`keepCameraThroughResize`). A resize while the element has no size
   * keeps the size that the view is framed at, so the view stays. A framing
   * written while the element had no size is set again at the new size, see
   * `setViewFraming`.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const pending = this.takePendingViewFraming();
    const previousView = this.getResolvedView();

    this.clearResolvedViewCache();
    // The canvas CSS size may have changed; drop the cached dimensions so the
    // next resolve/transform re-reads clientWidth/clientHeight exactly once.
    this.cachedCanvasDimensions = undefined;
    const { canvas } = this.renderContext.cpu;
    const { width: targetWidth, height: targetHeight } = getDevicePixelSize(
      this.renderContext.vtk.canvas?.parentElement ?? this.element
    );

    const cpuCanvasCleared =
      canvas.width !== targetWidth || canvas.height !== targetHeight;
    const { composition } = this.renderContext.cpu;
    const renderPassOfClear = composition.renderPassId;

    if (cpuCanvasCleared) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const previousCamera = this.keepCameraThroughResize(previousView);

    this.resizeBindingsWithActiveFirst();

    if (previousCamera) {
      this.triggerCameraModifiedEvent(previousCamera);
    }

    this.applyPendingViewFraming(pending);

    if (
      cpuCanvasCleared &&
      targetWidth > 0 &&
      targetHeight > 0 &&
      composition.renderPassId === renderPassOfClear
    ) {
      this.drawClearedCpuCanvas();
    }
  }

  /**
   * Draws the display sets on the CPU canvas that a resize cleared (a new
   * size of a canvas clears it), in the task of the resize, so that no frame
   * shows the cleared canvas. On a device with WebGL the rendering engine
   * does not draw a planar viewport whose display sets are drawn on the CPU,
   * and the canvas stayed blank until the next draw of the view. On a device
   * without WebGL the engine draws the viewport in its next frame, so it does
   * not draw here. The resize calls it only when nothing drew the view since
   * the clear (a listener of the CAMERA_MODIFIED of the resize, as the sync
   * of a stack labelmap, or a framing written while the element had no
   * size), so a resize draws once.
   */
  private drawClearedCpuCanvas(): void {
    if (
      this.getUseCustomRenderingPipeline() ||
      getRenderSurfaceForRenderMode(
        this.renderContext.renderPath.renderMode
      ) !== 'cpu'
    ) {
      return;
    }

    this.render();
  }

  /**
   * Keeps the camera of the view through a change of the size of the canvas,
   * as the legacy stack and volume viewports kept theirs: the parallel scale
   * and the focal point stay. Across a change of the width the image keeps
   * its size in pixels and its distance from the centre; across a change of
   * the height it scales with the canvas. The zoom and the pan read after it
   * are against the fit of the new size, as on 5.x. A view with a display
   * area, or with a scale mode other than `fit`, fits the new size as before,
   * as the legacy viewports applied the display area again.
   *
   * @param previousView - The view resolved at the size before the resize.
   * @returns The camera before the resize when the view state changed, so
   *   that the caller fires `CAMERA_MODIFIED` as the legacy `setCamera` did.
   */
  private keepCameraThroughResize(
    previousView: ReturnType<PlanarViewport['getResolvedView']>
  ): ICamera | undefined {
    const { viewState } = this;

    if (
      !previousView ||
      viewState.displayArea ||
      normalizePlanarScaleMode(viewState.scaleMode) !== 'fit'
    ) {
      return;
    }

    const nextView = this.getResolvedView();

    if (!nextView) {
      return;
    }

    const previousHeight = previousView.state.canvasHeight;
    const nextHeight = nextView.state.canvasHeight;

    if (
      previousView.state.canvasWidth === nextView.state.canvasWidth &&
      previousHeight === nextHeight
    ) {
      return;
    }

    const previousParallelScale = previousView.toICamera().parallelScale;
    const nextParallelScale = nextView.toICamera().parallelScale;

    if (
      !(previousParallelScale > 0) ||
      !(nextParallelScale > 0) ||
      !(previousHeight > 0) ||
      !(nextHeight > 0)
    ) {
      return;
    }

    const scaleRatio = nextParallelScale / previousParallelScale;
    const panRatio = nextHeight / previousHeight;
    const [scaleX, scaleY] = nextView.scale;
    const [panX, panY] = previousView.pan;
    const keptView = nextView
      .withScale([scaleX * scaleRatio, scaleY * scaleRatio])
      .withPan([panX * panRatio, panY * panRatio]);

    this.viewState = this.normalizeViewState(keptView.state.viewState);
    this.clearResolvedViewCache();

    return previousView.toICamera() as unknown as ICamera;
  }

  /**
   * Renders the active planar bindings or queues an engine-driven render. A
   * path that draws on the CPU canvas draws here, except while `setDisplaySets`
   * mounts: the draws asked for meanwhile wait, and the viewport draws once
   * when the mount ends, so a mount gives one draw and one IMAGE_RENDERED, as
   * the legacy CPU stack viewport drew once in the frame of the rendering
   * engine. The same holds while a CPU stack loads the image of a scroll: the
   * draws wait for the image, so a scroll gives one draw with the new image.
   * A GPU path renders through the rendering engine, which draws once in a
   * frame.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    if (!this.bindings.size) {
      this.viewportStatus = ViewportStatus.NO_DATA;
      return;
    }

    if (
      this.holdsRenderForRemount() ||
      this.holdsCpuDrawForMount() ||
      this.holdsCpuDrawForImageLoad()
    ) {
      return;
    }

    this.cpuDrawHeldByImageLoad = false;
    this.setNeedsRender();
    this.renderContext.cpu.composition.renderPassId += 1;
    this.drewOutsideEngine = false;

    const drawnByBindings = this.renderBindings();

    this.answerForRendererContent();

    if (!drawnByBindings) {
      this.requestRenderingEngineRender();
    }

    // A CPU path draws here and fires IMAGE_RENDERED itself; the engine does
    // not draw this frame, so the viewport reports the fidelity
    // (FIDELITY-EVENT-7). A VTK path draws in the engine, which reports.
    if (this.drewOutsideEngine) {
      this.drewOutsideEngine = false;
      this.applyCpuSharpeningSmoothing();
      this.notifyFidelityStateChanged();
    }
  }

  // ====================================================================
  // Protected & private
  // ====================================================================

  /**
   * Applies the sharpening or the smoothing of the source display set to the
   * CPU canvas after the CPU draw step drew the frame with every layer, so
   * the canvas shows what the render passes show on the GPU.
   */
  private applyCpuSharpeningSmoothing(): void {
    const binding = this.getCurrentBinding();
    const { canvas, context } = this.renderContext.cpu;

    if (binding) {
      applyCanvasSharpeningSmoothing(
        canvas,
        context,
        this.getDisplaySetAppearance(binding.data.id)
      );
    }
  }

  /**
   * Answers for the props that the application added to the vtk.js renderer
   * of the viewport, and for its widgets. On the GPU the clipping range of
   * the camera holds every visible prop, so a prop is not cut by the depth
   * of the slice. The CPU path does not draw the renderer nor the widgets:
   * the viewport warns once that they do not show, and draws on.
   */
  private answerForRendererContent(): void {
    const { renderer } = this.renderContext.vtk;
    const { renderMode } = this.renderContext.renderPath;

    if (getRenderSurfaceForRenderMode(renderMode) !== 'cpu') {
      this.warnedOfHiddenRendererContent = false;
      fitPlanarCameraClippingRange(renderer);
      return;
    }

    if (this.warnedOfHiddenRendererContent) {
      return;
    }

    const ownActors = new Set<unknown>(
      this.getActors().map(({ actor }) => actor)
    );
    const props = renderer
      .getViewProps()
      .filter((prop) => !ownActors.has(prop)).length;
    const widgets = this.getWidgets().filter((widget) =>
      widget.getEnabled?.()
    ).length;

    if (!props && !widgets) {
      return;
    }

    this.warnedOfHiddenRendererContent = true;
    log.warn(
      `[PlanarViewport] Viewport ${this.id} draws its slice on the CPU, and the CPU path does not draw the vtk.js renderer: ${props} prop(s) added with getRenderer() and ${widgets} widget(s) added with addWidget() do not show. Draw the slice on the GPU to show them.`
    );
  }

  /**
   * Adds a line for each reduced labelmap while the acquired frame shows
   * (FIDELITY-STATE-9). The frame draws the source at full resolution, and a
   * labelmap with a reduced texture can then draw a contour of a nearby slice
   * on it. Over the reduced volume slice, the source line already reports the
   * reduction, so a labelmap adds no line there.
   */
  protected override collectFidelityLines(
    display?: FidelityDisplay
  ): FidelityLine[] {
    const lines = super.collectFidelityLines(display);
    const renderings: Partial<PlanarVtkGpuVolumeSliceRendering>[] = [];

    this.forEachBinding((binding) => {
      renderings.push(
        ...((binding.getRenderings?.() ?? [
          binding.rendering,
        ]) as Partial<PlanarVtkGpuVolumeSliceRendering>[])
      );
    });

    if (!renderings.some((rendering) => rendering.showsAcquiredFrame)) {
      return lines;
    }

    const labelmaps = renderings.filter(
      ({ isSegmentationOverlay, voxelQuality, fullGrid }) =>
        isSegmentationOverlay &&
        voxelQuality &&
        fullGrid &&
        isReduced(reductionFactorsOf(voxelQuality.grid, fullGrid))
    );

    return lines.concat(
      fidelityLinesFromBindings(
        display,
        labelmaps.map((rendering) => ({
          record: rendering.voxelQuality,
          fullGrid: rendering.fullGrid,
          reductionCause: rendering.reductionCause,
          label: 'Labelmap',
        }))
      )
    );
  }

  protected override onDestroy(): void {
    this.clearResolvedViewCache();
    if (this.renderImageObjectDisplaySetId) {
      displaySetRegistry.remove(this.renderImageObjectDisplaySetId);
      this.renderImageObjectDisplaySetId = undefined;
    }

    this.cpuCanvas?.remove();
    this.cpuCanvas = undefined;
    this.renderContext.vtk.canvas.classList.add(CANVAS_CSS_CLASS);
    this.mountedData.clearSourceDisplaySetId();
    this.renderContext.view.activeSourceICamera = undefined;
  }

  protected override modified(previousCamera?: ICamera): void {
    if (this.isDestroyed) {
      return;
    }

    this.updateBindingsCameraState();
    this.render();

    if (previousCamera) {
      this.triggerCameraModifiedEvent(previousCamera);
    }
  }

  protected override renderBindings(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    let renderedByAdapter = false;
    const sourceBinding = this.getCurrentBinding();
    const renderBinding = (
      binding: ViewportDataBinding<PlanarDisplaySetAppearance>,
      displaySetId: string
    ) => {
      if (!binding.render) {
        return;
      }

      renderedByAdapter = true;

      try {
        binding.render();
        this.lastRenderPathErrorByDisplaySetId.delete(displaySetId);
      } catch (error) {
        this.reportRenderPathError(error, displaySetId);
      }
    };

    for (const [displaySetId, binding] of this.bindings.entries()) {
      if (binding === sourceBinding) {
        renderBinding(binding, displaySetId);
      }
    }

    for (const [displaySetId, binding] of this.bindings.entries()) {
      if (binding !== sourceBinding) {
        renderBinding(binding, displaySetId);
      }
    }

    return renderedByAdapter;
  }

  /**
   * Live render-backend switch: re-runs the render-path decision for every
   * mounted display set and remounts, in place, the ones whose effective
   * render mode changed. The viewport instance, its id, mounted data, view
   * state (slice/zoom/pan), per-display-set appearance, and tool
   * annotations all survive -- addLoadedData re-applies appearance and view
   * state to the rebuilt binding. Display sets pinned via a per-mount
   * renderBackend re-resolve to the same path and are effectively skipped.
   *
   * Called by the global setRenderBackend() fan-out; the
   * rebuild is async but the hook itself is fire-and-forget by contract.
   */
  override updateRenderingPipeline(): void {
    this.startRenderingPipelineUpdate();
  }

  /**
   * Starts a pass of `applyRenderingPipelineUpdate` and keeps it as the
   * pending pass (`pendingRenderPipelineUpdate`, the pass that has not settled
   * yet) until it settles. A pass decides the render mode of a display
   * set before it awaits the data and mounts after, so an appearance change
   * while a pass is pending starts a new pass, which makes the pending one
   * stale and decides again for the final appearance.
   */
  private startRenderingPipelineUpdate(): void {
    const update = this.applyRenderingPipelineUpdate();

    this.pendingRenderPipelineUpdate = update;
    void update.finally(() => {
      if (this.pendingRenderPipelineUpdate === update) {
        this.pendingRenderPipelineUpdate = undefined;
      }
    });
  }

  /**
   * One pass of the live remount. The pass first decides and loads the data
   * of every binding, then mounts the bindings whose render mode changes,
   * one after the other. A binding whose decision, load or mount throws
   * keeps its render path and gets the stored appearance
   * (`releaseWithheldSlabAfterError`). From its start to its end it holds the renders of
   * this viewport (`holdsRenderForRemount`), so no frame shows the new source
   * with the old overlays while a mount waits for its data. An overlay that
   * has no backend of its own follows the backend of the render mode that the
   * pass chose for the source, as it follows the mounted source otherwise.
   * Each remounted binding keeps the place of the one it replaces in the draw
   * order (`keepViewPropPlace`). A binding whose render mode stays gets the
   * stored appearance when it drew a withheld slab.
   */
  private async applyRenderingPipelineUpdate(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const swapId = ++this.renderPipelineSwapId;
    let changed = false;

    this.remountRenderHolds += 1;

    try {
      changed = await this.remountBindings(swapId);

      if (changed) {
        this.finishRemount();
      }
    } finally {
      this.releaseRemountRenderHold();
    }

    if (!changed) {
      return;
    }

    // The rebuilt render paths replaced this viewport's actors. Announce it so
    // consumers that decorate actors (segmentation representations restyle
    // their labelmap overlays through this) can re-reconcile against the new
    // instances; the swap itself cannot know about them.
    triggerEvent(eventTarget, Events.RENDERING_PIPELINE_CHANGED, {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
    });
  }

  /**
   * Decides, loads and mounts the bindings of one pass of
   * `applyRenderingPipelineUpdate`. Returns whether the pass is still the
   * current one and changed a binding.
   */
  private async remountBindings(swapId: number): Promise<boolean> {
    const isStale = () =>
      swapId !== this.renderPipelineSwapId || this.isDestroyed;
    let changed = false;

    // Remount the source binding first: overlays without an explicit
    // renderBackend inherit the source's mounted backend, so the source must
    // resolve to the new backend before the overlays re-run their decisions
    // (the source is not guaranteed to be first in insertion order after a
    // promoteSourceDisplaySetId).
    const sourceBinding = this.getCurrentBinding();
    const bindingEntries = Array.from(this.bindings.entries());
    const orderedEntries = [
      ...bindingEntries.filter(([, binding]) => binding === sourceBinding),
      ...bindingEntries.filter(([, binding]) => binding !== sourceBinding),
    ];
    const mounts: Array<{
      displaySetId: string;
      binding: ViewportDataBinding<PlanarDisplaySetAppearance>;
      data: LoadedData<PlanarPayload>;
      renderMode: PlanarEffectiveRenderMode;
      reason: RenderPlanReason;
    }> = [];
    let sourceRenderBackend: EffectiveRenderBackend | undefined;

    for (const [displaySetId, binding] of orderedEntries) {
      if (isStale()) {
        return false;
      }

      // Skip bindings that were removed or replaced (e.g. by a concurrent
      // setDisplaySets) since this pass started.
      if (this.bindings.get(displaySetId) !== binding) {
        continue;
      }

      const mounted = this.mountedDisplaySets.get(displaySetId);

      if (!mounted) {
        continue;
      }

      const { options } = mounted;

      try {
        const { data, selectedPath } = await this.loadPlanarData(
          displaySetId,
          {
            ...options,
            role: binding.role,
            renderBackend:
              binding === sourceBinding
                ? options.renderBackend
                : (options.renderBackend ?? sourceRenderBackend),
          },
          undefined,
          mounted.descriptor
        );

        if (binding === sourceBinding) {
          sourceRenderBackend = getRenderBackendForRenderMode(
            selectedPath.renderMode
          );
        }

        if (isStale() || this.bindings.get(displaySetId) !== binding) {
          continue;
        }

        if (selectedPath.renderMode === binding.rendering.renderMode) {
          this.updateRenderPlan(displaySetId, selectedPath.reason);
          this.releaseWithheldSlab(displaySetId, binding);
          continue;
        }

        mounts.push({
          displaySetId,
          binding,
          data,
          renderMode: selectedPath.renderMode,
          reason: selectedPath.reason,
        });
      } catch (error) {
        this.reportRenderPathError(error, displaySetId);
        this.releaseWithheldSlabAfterError(displaySetId, binding);
      }
    }

    for (const { displaySetId, binding, data, renderMode, reason } of mounts) {
      if (isStale()) {
        return false;
      }

      if (this.bindings.get(displaySetId) !== binding) {
        continue;
      }

      try {
        const propsBefore = this.getViewProps();
        const appearanceBefore = this.getAppearanceSnapshot(displaySetId);
        const added = await this.addLoadedData(
          displaySetId,
          data,
          { renderMode, role: binding.role },
          () => isStale() || this.bindings.get(displaySetId) !== binding
        );

        if (added) {
          this.keepViewPropPlace(propsBefore, this.bindings.get(displaySetId));
          this.updateRenderPlan(displaySetId, reason);
          this.notifyAppearanceChangedSince(
            displaySetId,
            'default',
            appearanceBefore
          );
        }

        changed = changed || added;
      } catch (error) {
        this.reportRenderPathError(error, displaySetId);
        this.releaseWithheldSlabAfterError(displaySetId, binding);
      }
    }

    return changed && !isStale();
  }

  /**
   * Brings the viewport up to date after a pass changed its bindings. The
   * render that it asks for is held until the pass releases its hold.
   */
  private finishRemount(): void {
    // Re-assert the source binding's render mode: every remounted path
    // activated its own mode while mounting, so with mixed CPU/GPU bindings
    // the last mount, not the source, may have won the canvas-visibility
    // toggle.
    const sourceRenderMode = this.getCurrentPlanarRendering()?.renderMode;

    if (sourceRenderMode) {
      this.renderContext.display.activateRenderMode(sourceRenderMode);
    }

    this.clearResolvedViewCache();
    this.updateBindingsCameraState();
    this.render();
  }

  /**
   * Gives a binding the stored appearance when it drew a withheld slab
   * (`setAppearanceState`) and keeps its render mode after all.
   */
  private releaseWithheldSlab(
    displaySetId: string,
    binding: ViewportDataBinding<PlanarDisplaySetAppearance>
  ): void {
    if (!this.withheldSlabByBinding.has(binding)) {
      return;
    }

    this.withheldSlabByBinding.delete(binding);

    const props = this.getAppliedAppearance(displaySetId);

    if (props !== undefined) {
      binding.updateAppearance(props);
      this.render();
    }
  }

  /**
   * Gives the mounted binding of a display set the stored appearance after
   * its remount failed, so the render path that works draws the new slab and
   * no binding keeps a withheld slab.
   */
  private releaseWithheldSlabAfterError(
    displaySetId: string,
    binding: ViewportDataBinding<PlanarDisplaySetAppearance>
  ): void {
    if (!this.isDestroyed && this.bindings.get(displaySetId) === binding) {
      this.releaseWithheldSlab(displaySetId, binding);
    }
  }

  /** The view props of the vtk renderer of this viewport, as a copy. */
  private getViewProps(): unknown[] {
    const renderer = this.renderContext.vtk.renderer;

    return typeof renderer?.getViewProps === 'function'
      ? [...renderer.getViewProps()]
      : [];
  }

  /**
   * Puts the vtk actors of a remounted binding in the place that the actors
   * of the binding it replaced had in the renderer (`getRemountedViewPropOrder`).
   * Without this the new actors are drawn last, and an overlay drawn before
   * them hides them where it writes depth.
   */
  private keepViewPropPlace(
    propsBefore: unknown[],
    binding: ViewportDataBinding<PlanarDisplaySetAppearance> | undefined
  ): void {
    const order = getRemountedViewPropOrder(
      propsBefore,
      this.getViewProps(),
      getBindingActors(binding)
    );

    if (order) {
      applyViewPropOrder(this.renderContext.vtk.renderer, order);
    }
  }

  /**
   * Ends the render hold of one remount pass. The last pass to end renders
   * once when a render was asked for meanwhile.
   */
  private releaseRemountRenderHold(): void {
    this.remountRenderHolds = Math.max(0, this.remountRenderHolds - 1);

    if (this.remountRenderHolds || !this.renderHeldByRemount) {
      return;
    }

    this.renderHeldByRemount = false;
    this.render();
  }

  /**
   * @internal Whether a remount pass holds the renders of this viewport. A
   * rendering engine asks this before it draws a frame, because a frame it
   * draws on its own (`renderViewports`, a resize) does not pass through
   * `render`. A held viewport is left out of that frame and renders once by
   * itself when the hold ends.
   */
  deferRenderWhileHeld(): boolean {
    if (!this.remountRenderHolds) {
      return false;
    }

    this.renderHeldByRemount = true;

    return true;
  }

  /**
   * Whether a remount pass holds the renders of this viewport. A render asked
   * for meanwhile is marked and done when the hold ends.
   */
  private holdsRenderForRemount(): boolean {
    if (!this.remountRenderHolds) {
      return false;
    }

    this.renderHeldByRemount = true;
    this.setNeedsRender();

    return true;
  }

  /**
   * Whether a mount holds the draw of a CPU path: the newest mount, and the
   * commit that runs, which a newer mount does not stop. A draw asked for
   * meanwhile is marked and done once when both have ended.
   */
  private holdsCpuDrawForMount(): boolean {
    if (
      (this.mountCpuDrawHoldRequestId === undefined && !this.mountCommit) ||
      getRenderSurfaceForRenderMode(
        this.renderContext.renderPath.renderMode
      ) !== 'cpu'
    ) {
      return false;
    }

    this.cpuDrawHeldByMount = true;
    this.setNeedsRender();

    return true;
  }

  /**
   * Ends the CPU draw hold of the mount of `requestId`, when that mount still
   * holds it, and draws once when a draw was asked for meanwhile and neither
   * a newer mount nor a commit holds the draw. A mount that a newer one
   * replaced ends without a change. The mount of a commit calls this after
   * its commit, so the draw comes when the last hold ends.
   */
  private releaseMountCpuDrawHold(requestId: number): void {
    if (requestId === this.mountCpuDrawHoldRequestId) {
      this.mountCpuDrawHoldRequestId = undefined;
    }

    if (
      this.mountCpuDrawHoldRequestId !== undefined ||
      this.mountCommit ||
      !this.cpuDrawHeldByMount
    ) {
      return;
    }

    this.cpuDrawHeldByMount = false;
    this.render();
  }

  /**
   * Whether the CPU stack path of the source waits for the image of a new
   * slice, as after a scroll. A draw asked for meanwhile would draw the image
   * shown before; it is marked and done when the load ends. The new image
   * draws when it comes, and when its load fails the viewport draws once. A
   * load that has ended holds nothing, whatever it delivered.
   */
  private holdsCpuDrawForImageLoad(): boolean {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode !== PlanarRenderModeId.CANVAS_FRAME ||
      !rendering.imageLoad ||
      this.endedImageLoads.has(rendering.imageLoad) ||
      rendering.lastRequestedImageIdIndex === undefined ||
      rendering.lastRequestedImageIdIndex === rendering.currentImageIdIndex ||
      rendering.lastRequestedImageIdIndex === rendering.failedImageIdIndex
    ) {
      return false;
    }

    const { imageLoad } = rendering;

    if (this.cpuDrawHoldImageLoad !== imageLoad) {
      this.cpuDrawHoldImageLoad = imageLoad;
      void imageLoad.then(() => this.releaseImageLoadCpuDrawHold(imageLoad));
    }

    this.cpuDrawHeldByImageLoad = true;
    this.setNeedsRender();

    return true;
  }

  /**
   * Ends the CPU draw hold of an image load. The viewport draws once when a
   * draw was asked for meanwhile and the image did not draw it.
   */
  private releaseImageLoadCpuDrawHold(imageLoad: Promise<void>): void {
    this.endedImageLoads.add(imageLoad);

    if (this.cpuDrawHoldImageLoad !== imageLoad) {
      return;
    }

    this.cpuDrawHoldImageLoad = undefined;

    if (!this.cpuDrawHeldByImageLoad) {
      return;
    }

    this.cpuDrawHeldByImageLoad = false;
    this.render();
  }

  /**
   * Whether the volume slice path of `displaySetId` may draw the acquired frames
   * (`PlanarRenderPathDecisionService.canDrawAcquiredFrames`). The render path
   * reads this at each change of the view or the appearance.
   */
  private canDrawAcquiredFrames(displaySetId: string): boolean {
    const binding = this.bindings.get(displaySetId);
    const mounted = this.mountedDisplaySets.get(displaySetId);

    if (!binding || !mounted) {
      return false;
    }

    return defaultPlanarRenderPathDecisionService.canDrawAcquiredFrames(
      mounted.descriptor,
      this.getRenderPathDecisionOptions(
        displaySetId,
        {
          ...mounted.options,
          role: binding.role,
        },
        this.viewState.orientation
      )
    );
  }

  /**
   * The inputs of the render-path decision for one display set, with the
   * stored appearance of the display set, or the given one. A mount gives
   * the stored appearance with its option `appearance` over it, so a slab
   * that the mount asks for chooses the path of the first draw.
   *
   * Only the source may draw the acquired frames of a reduced volume.
   */
  private getRenderPathDecisionOptions(
    displaySetId: string,
    options: PlanarMountOptions,
    orientation: PlanarViewState['orientation'],
    appearance = this.getAppearanceState(displaySetId)
  ): PlanarRenderPathDecisionOptions {
    return {
      orientation,
      mode: options.mode,
      volumeId: options.volumeId,
      // Per-mount backend pin/override. Overlays without an explicit pin
      // follow the source binding's mounted backend rather than the global
      // configuration; only then does the global renderBackend decide.
      renderBackend:
        options.renderBackend ??
        this.getInheritedOverlayRenderBackend(options.role),
      preferAcquiredFrames: options.role === 'source',
      slabThickness: appearance?.slabThickness,
      blendMode: appearance?.blendMode,
      sliceFirst: options.sliceFirst,
      role: options.role,
    };
  }

  /**
   * Emits the RENDER_PATH_ERROR degradation signal (and logs) for a render
   * path that threw while mounting or rendering. Repeated identical failures
   * for a display set are reported once so a per-frame render error does not
   * flood the event bus; a successful render of that display set clears the
   * record, so a genuine failure after a recovery is reported again.
   * Applications listen for this to offer a backend switch.
   */
  private reportRenderPathError(error: unknown, displaySetId?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const errorKey = displaySetId ?? '';

    if (this.lastRenderPathErrorByDisplaySetId.get(errorKey) === message) {
      return;
    }

    this.lastRenderPathErrorByDisplaySetId.set(errorKey, message);
    log.error('[PlanarViewport] Render path error', displaySetId ?? '', error);
    triggerEvent(eventTarget, Events.RENDER_PATH_ERROR, {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
      displaySetId,
      error,
    });
  }

  private requestRenderingEngineRender(): void {
    if (this.holdsRenderForRemount()) {
      return;
    }

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private setRenderModeVisibility(
    renderMode: PlanarEffectiveRenderMode,
    cpuCanvas: HTMLCanvasElement,
    vtkCanvas: HTMLCanvasElement
  ): void {
    const useCPUCanvas = getRenderSurfaceForRenderMode(renderMode) === 'cpu';
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
    cpuCanvas.style.pointerEvents = useCPUCanvas ? 'auto' : 'none';
    vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
    cpuCanvas.classList.toggle(CANVAS_CSS_CLASS, useCPUCanvas);
    vtkCanvas.classList.toggle(CANVAS_CSS_CLASS, !useCPUCanvas);

    if (viewportElement) {
      viewportElement.style.pointerEvents = useCPUCanvas ? 'none' : '';
    }
  }

  protected updateBindingsCameraState(): void {
    const currentBinding = this.getCurrentBinding();

    if (currentBinding) {
      currentBinding.applyViewState(this.viewState);
    } else {
      this.renderContext.view.activeSourceICamera = undefined;
    }

    this.forEachBinding((binding) => {
      if (binding !== currentBinding) {
        binding.applyViewState(this.viewState);
      }
    });
  }

  private resizeBindingsWithActiveFirst(): void {
    const currentBinding = this.getCurrentBinding();

    currentBinding?.resize?.();

    this.forEachBinding((binding) => {
      if (binding !== currentBinding) {
        binding.resize?.();
      }
    });
  }

  private getActiveImageIdIndex(): number {
    const binding = this.getCurrentBinding();

    // For volume-slice content, derive the index from the resolved view (the
    // current camera/projection) rather than the stored scalar — mirroring
    // legacy VolumeViewport.getSliceIndex, which reads the camera focal point as
    // the single source of truth. rendering.currentImageIdIndex tracks the
    // camera on each render but can lag a post-mount camera carry (e.g. the
    // layout-selector MPR restoring the prior stack slice via setViewReference),
    // which would decouple the scrollbar/scroll index from the rendered slice.
    // Falls back to the stored scalar when no resolved view is available.
    if (this.getCurrentMode() === 'volume') {
      const resolvedImageIdIndex =
        this.getResolvedView()?.state?.currentImageIdIndex;
      if (typeof resolvedImageIdIndex === 'number') {
        return resolvedImageIdIndex;
      }
    }

    if (
      this.getCurrentMode() === 'stack' &&
      this.viewState.slice?.kind === 'stackIndex'
    ) {
      return this.viewState.slice.imageIdIndex;
    }

    const currentImageIdIndex = (
      binding?.rendering as { currentImageIdIndex?: number } | undefined
    )?.currentImageIdIndex;

    if (typeof currentImageIdIndex === 'number') {
      return currentImageIdIndex;
    }

    return this.viewState.slice?.kind === 'stackIndex'
      ? this.viewState.slice.imageIdIndex
      : 0;
  }

  protected getMaxImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const maxImageIdIndex = (
      binding?.rendering as { maxImageIdIndex?: number } | undefined
    )?.maxImageIdIndex;

    if (typeof maxImageIdIndex === 'number') {
      return maxImageIdIndex;
    }

    return Math.max(0, this.getImageIds().length - 1);
  }

  private getVolumeSliceWorldPointForImageIdIndex(
    imageIdIndex: number
  ): Point3 | undefined {
    const sliceBasis = this.getResolvedView({
      sliceIndex: imageIdIndex,
    })?.getSliceBasis();
    const sliceWorldPoint = sliceBasis?.sliceCenterWorld;

    return sliceWorldPoint ? ([...sliceWorldPoint] as Point3) : undefined;
  }

  private getPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentPlanarData();
  }

  protected getCurrentBinding() {
    return this.mountedData.getCurrentBinding();
  }

  /**
   * Tears down currently-mounted data ahead of a `setDisplaySets` replace, but
   * preserves externally-managed segmentation overlays when the source is being
   * re-set to the same display set in the same mode.
   *
   * The segmentation display tool mounts labelmap overlays out-of-band (via
   * `addDisplaySet`), so a full teardown on every `setDisplaySets` would blank a
   * hydrated segmentation whenever the source is re-applied (e.g. when an
   * application re-runs its viewport-data sync). When the source changes (or no
   * source is being set), everything is removed so a stale segmentation cannot
   * leak across datasets. The mode counts too: one display set shows as a
   * stack or as a volume under the same id, and the labelmap of a stack is
   * drawn as images, that of a volume as a volume, so a source that changes
   * its mode drops them as well. The overlays to keep are found before any
   * binding goes: the removal of the source makes the first binding left the
   * source, which would then no longer count as an overlay.
   */
  private removeReplaceableData(
    mounts: Array<{ displaySetId: string; options: PlanarMountOptions }>,
    loaded: PlanarDataLoad[]
  ): void {
    const nextSourceIndex = Math.max(
      0,
      mounts.findIndex(({ options }) => options.role === 'source')
    );
    const nextSourceId = mounts[nextSourceIndex]?.displaySetId;
    const nextSourceRenderMode =
      loaded[nextSourceIndex]?.selectedPath.renderMode;
    const sourceDisplaySetId = this.getSourceDisplaySetId();
    const preserveSegmentationOverlays =
      nextSourceId !== undefined &&
      nextSourceId === sourceDisplaySetId &&
      nextSourceRenderMode !== undefined &&
      getMountMode(nextSourceRenderMode) ===
        this.mountedDisplaySets.get(sourceDisplaySetId)?.mode;

    const displaySetIds = Array.from(this.bindings.keys());
    const kept = new Set(
      preserveSegmentationOverlays
        ? displaySetIds.filter((displaySetId) =>
            this.isSegmentationOverlayBinding(displaySetId)
          )
        : []
    );

    for (const displaySetId of displaySetIds) {
      if (!kept.has(displaySetId)) {
        this.removeDisplaySetBinding(displaySetId);
      }
    }
  }

  /**
   * Returns whether a mounted binding is an externally-managed segmentation
   * overlay: an overlay-role binding whose descriptor, as its mount read it,
   * references a segmentation.
   */
  private isSegmentationOverlayBinding(displaySetId: string): boolean {
    if (this.getDisplaySetRole(displaySetId) !== 'overlay') {
      return false;
    }

    return (
      this.mountedDisplaySets.get(displaySetId)?.descriptor.reference?.kind ===
      'segmentation'
    );
  }

  /**
   * The descriptor of a display set: as its mount read it when it is
   * mounted, else as it is registered now (for a question about a mount
   * that has not happened).
   */
  private getDescriptor(
    displaySetId: string
  ): PlanarDisplaySetDescriptor | undefined {
    const mounted = this.mountedDisplaySets.get(displaySetId);

    if (mounted) {
      return mounted.descriptor;
    }

    const dataSet = getVolumeOrImageDisplaySet(displaySetId);

    return isPlanarDisplaySetDescriptor(dataSet) ? dataSet : undefined;
  }

  /**
   * Reads the registration of a display set for a mount, once, and gives a
   * copy that the mount keeps. A display set that is not registered, or
   * whose descriptor a planar viewport cannot show, fails the mount with the
   * message of `displaySetShapeError`. A descriptor that still carries
   * `initialImageIdIndex` fails it too: that index is a mount option.
   */
  private readRegisteredDescriptor(
    displaySetId: string
  ): PlanarDisplaySetDescriptor {
    const dataSet = getVolumeOrImageDisplaySet(displaySetId);

    if (!isPlanarDisplaySetDescriptor(dataSet)) {
      throw displaySetShapeError(
        'PlanarViewport',
        displaySetId,
        'imageIds or volumeId of a cached volume'
      );
    }

    if (dataSet.initialImageIdIndex !== undefined) {
      throw new Error(
        `[PlanarViewport] The display set "${displaySetId}" is registered with ` +
          `initialImageIdIndex, which is a mount option: remove it from the ` +
          `descriptor and pass it on the mount, ` +
          `setDisplaySets({ displaySetId, options: { initialImageIdIndex } })`
      );
    }

    return { ...dataSet, imageIds: [...dataSet.imageIds] };
  }

  /** Puts back the mount record that a mount which did not bind replaced. */
  private restoreMountedDisplaySet(
    displaySetId: string,
    mounted: PlanarMountedDisplaySet | undefined
  ): void {
    if (mounted) {
      this.mountedDisplaySets.set(displaySetId, mounted);
    } else {
      this.mountedDisplaySets.delete(displaySetId);
    }
  }

  /**
   * Decides the render path of a display set and loads its data. On the
   * volume path the choice between the volume modes runs once more after the
   * load: the data provider may create and cache the volume during the load,
   * and slice first needs the cached volume to accept a data set. Both volume
   * modes take the same payload, so only its render mode changes. With slice
   * first off that second choice ends at the configuration check.
   *
   * With `loaded`, what this gave for the display set before `setDisplaySets`
   * removed the shown display sets, it gives that again when the inputs from
   * the mounted display sets are the same (`hasSameMountInputs`) and the
   * configuration gives the same backend as at that decision (a
   * `setRenderBackend` meanwhile changes it), so the decision runs once.
   * Else it decides again and takes the loaded data with the render mode of
   * the new decision in place of a load: only the render mode can change, as
   * whether the display set takes the volume path is kept: the decision
   * runs in the mode of the loaded data. With `loaded` it reads the
   * registration that the load had, so a registration that goes or changes
   * after the load does not count.
   *
   * Without `loaded` it reads the registration once (`descriptor`, which a
   * remount of a mounted display set gives in its place) and gives it to the
   * data provider with the `initialImageIdIndex` of the options. The
   * decision takes the mount option `appearance` over the stored
   * appearance, so a slab that the mount asks for chooses the path.
   */
  private async loadPlanarData(
    displaySetId: string,
    options: PlanarMountOptions,
    loaded?: PlanarDataLoad,
    descriptor?: PlanarDisplaySetDescriptor
  ): Promise<PlanarDataLoad> {
    const dataSet =
      loaded?.dataSet ??
      descriptor ??
      this.readRegisteredDescriptor(displaySetId);
    const decisionMountOptions = loaded
      ? {
          ...options,
          mode: getMountMode(loaded.selectedPath.renderMode),
        }
      : options;
    const resolvedOrientation = this.resolveRequestedOrientation(
      options.orientation,
      dataSet.imageIds
    );
    const storedAppearance = this.getAppearanceState(displaySetId);
    const decisionOptions = this.getRenderPathDecisionOptions(
      displaySetId,
      decisionMountOptions,
      resolvedOrientation,
      options.appearance
        ? { ...(storedAppearance ?? {}), ...options.appearance }
        : storedAppearance
    );

    const renderBackend = getEffectiveRenderBackend(
      decisionOptions.renderBackend
    );

    if (
      loaded &&
      loaded.renderBackend === renderBackend &&
      hasSameMountInputs(loaded.decisionOptions, decisionOptions)
    ) {
      return loaded;
    }

    const selectedPath = selectPlanarRenderPath(dataSet, decisionOptions);
    const data = loaded
      ? { ...loaded.data, renderMode: selectedPath.renderMode }
      : await (this.dataProvider as PlanarDataProvider).load(displaySetId, {
          acquisitionOrientation: selectedPath.acquisitionOrientation,
          orientation: resolvedOrientation,
          renderMode: selectedPath.renderMode,
          volumeId: selectedPath.volumeId,
          initialImageIdIndex:
            options.initialImageIdIndex ??
            getImageIdIndexOfInitialViewReference(dataSet.imageIds, options),
          descriptor: dataSet,
        });
    const { renderMode, reason } = isVolumeRenderMode(selectedPath.renderMode)
      ? defaultPlanarRenderPathDecisionService.selectVolumeRenderModeForDataSet(
          dataSet,
          decisionOptions
        )
      : selectedPath;

    if (renderMode === selectedPath.renderMode) {
      return {
        dataSet,
        data,
        selectedPath: { ...selectedPath, reason },
        resolvedOrientation,
        decisionOptions,
        renderBackend,
      };
    }

    return {
      dataSet,
      data: { ...data, renderMode },
      selectedPath: { ...selectedPath, renderMode, reason },
      resolvedOrientation,
      decisionOptions,
      renderBackend,
    };
  }

  /**
   * Backend an overlay mount inherits when it carries no explicit
   * renderBackend: the source binding's mounted backend. Source and overlays
   * must render through the same backend -- each backend draws to its own
   * canvas and skips the other's actors -- and the source may be pinned
   * per-mount to a backend that differs from the global configuration.
   * Returns undefined for source mounts (they resolve on their own) and when
   * no source is mounted yet, leaving the global configuration to decide.
   */
  private getInheritedOverlayRenderBackend(
    role: PlanarMountOptions['role']
  ): EffectiveRenderBackend | undefined {
    if (role === 'source') {
      return undefined;
    }

    return getRenderBackendForRenderMode(
      this.getCurrentPlanarRendering()?.renderMode
    );
  }

  private applyLoadedPlanarViewState(
    resolvedOrientation: PlanarViewState['orientation'],
    planarData: PlanarPayload,
    selectedPath: SelectedPlanarRenderPath
  ): void {
    const isVolumePath = isVolumeRenderMode(selectedPath.renderMode);
    const orientation = normalizePlanarOrientation(
      resolvedOrientation,
      selectedPath.acquisitionOrientation,
      isVolumePath ? planarData.imageVolume : undefined
    );
    const slice = isVolumePath
      ? this.createInitialVolumeSliceState(
          planarData,
          selectedPath.renderMode,
          orientation
        )
      : {
          kind: 'stackIndex' as const,
          // A stack opens at slice 0 when no initial index was requested.
          imageIdIndex: planarData.initialImageIdIndex ?? 0,
        };

    this.clearResolvedViewCache();
    this.viewState = this.normalizeViewState({
      ...this.viewState,
      slice,
      orientation,
    });
  }

  private createInitialVolumeSliceState(
    planarData: PlanarPayload,
    renderMode: PlanarEffectiveRenderMode,
    orientation: PlanarViewState['orientation']
  ): PlanarViewState['slice'] {
    if (!planarData.imageVolume) {
      return;
    }

    const { height, width } = this.getCurrentCanvasDimensions();
    const createSliceBasis =
      getRenderSurfaceForRenderMode(renderMode) === 'cpu'
        ? createPlanarCpuVolumeSliceBasis
        : createPlanarVolumeSliceBasis;
    // The acquisition orientation honors an explicitly carried initial slice but
    // otherwise opens on the legacy middle slice, like the reformatted
    // (sagittal/coronal) orientations. "No slice requested" now propagates as
    // undefined all the way from the data provider (it no longer defaults to 0),
    // so we can pass the index through directly: undefined -> middle, while a
    // real carried slice - including an explicit 0 - is honored instead of being
    // collapsed to center.
    const initialImageIdIndex =
      orientation === OrientationAxis.ACQUISITION
        ? planarData.initialImageIdIndex
        : undefined;

    // An explicit initial slice indexes payload.imageIds (= the volume's
    // imageId list), so anchor it at that slice's exact IJK center. Feeding the
    // index into the slice basis instead would count it in camera order — the
    // acquisition normal is the negated scan axis — and open on the mirrored
    // slice.
    if (typeof initialImageIdIndex === 'number') {
      const sliceWorldPoint = getVolumeImageIdIndexWorldPoint(
        planarData.imageVolume,
        initialImageIdIndex
      );

      if (sliceWorldPoint) {
        return {
          kind: 'volumePoint',
          sliceWorldPoint,
        };
      }
    }

    const { sliceBasis } = createSliceBasis({
      canvasHeight: height,
      canvasWidth: width,
      imageIdIndex: initialImageIdIndex,
      imageVolume: planarData.imageVolume,
      orientation,
    });

    return {
      kind: 'volumePoint',
      sliceWorldPoint: [...sliceBasis.sliceCenterWorld] as Point3,
    };
  }

  /**
   * The orientation that the data set options or the viewport options ask
   * for, or the acquisition plane, by the one rule of `resolveOrientation`.
   * With the images of the data, a reformat name becomes their view vectors.
   */
  private resolveRequestedOrientation(
    orientation?: PlanarMountOptions['orientation'],
    imageIds?: string[]
  ): PlanarViewState['orientation'] {
    return this.resolveOrientation(
      (orientation ?? (this.defaultOptions.orientation as PlanarOrientation)) ||
        OrientationAxis.ACQUISITION,
      imageIds
    );
  }

  /**
   * The orientation that the view state keeps for an orientation that a
   * caller asks for. It is the one rule for the orientation option of a
   * display set and of the viewport, for `setOrientation` and for
   * `setViewState({ orientation })`.
   *
   * ACQUISITION, AXIAL, CORONAL, SAGITTAL and view vectors stay as given. A
   * reformat name becomes the view vectors of the images: their axes matched
   * to the patient axis of the name. REFORMAT takes the patient axis closest
   * to `viewPlaneNormal`, the view on display, and without one the axis
   * closest to the acquisition. For images without an image orientation a
   * name becomes its patient axis, and REFORMAT the acquisition plane.
   */
  private resolveOrientation(
    orientation: PlanarOrientation | undefined,
    imageIds?: string[],
    viewPlaneNormal?: Point3
  ): PlanarViewState['orientation'] {
    if (
      typeof orientation !== 'string' ||
      !isReformatOrientation(orientation)
    ) {
      return clonePlanarOrientation(orientation) || OrientationAxis.ACQUISITION;
    }

    return (
      getReformatVectorsOfImages(orientation, imageIds, viewPlaneNormal) ??
      getBaseReformatOrientation(orientation) ??
      OrientationAxis.ACQUISITION
    );
  }

  /**
   * The orientation of the view state after `setViewState` or
   * `setOrientation` gave one. In stack mode an orientation that the stack
   * cannot show changes nothing: the state keeps the orientation that it
   * has. Otherwise it is the orientation by the rule of
   * `resolveOrientation`, with the view on display for REFORMAT.
   */
  private resolveNextOrientation(
    orientation: PlanarOrientation | undefined
  ): PlanarViewState['orientation'] {
    const sourceDisplaySetId = this.getSourceDisplaySetId();
    const resolved = this.resolveOrientation(
      orientation,
      this.getImageIds(),
      this.getResolvedCameraForEvent()?.viewPlaneNormal
    );

    if (
      sourceDisplaySetId &&
      resolved !== OrientationAxis.ACQUISITION &&
      this.getCurrentMode() === 'stack' &&
      !this.canShowOrientation(sourceDisplaySetId, resolved)
    ) {
      return this.viewState.orientation;
    }

    return resolved;
  }

  /**
   * Whether a display set can show an orientation as it is mounted. A volume
   * shows every orientation that its data can render. A stack shows its
   * images in their acquisition plane, so it shows an orientation only when
   * that keeps the image path that draws it. A display set that is not
   * mounted answers for a mount with that orientation.
   */
  private canShowOrientation(
    displaySetId: string,
    orientation: PlanarViewState['orientation']
  ): boolean {
    const dataSet = this.getDescriptor(displaySetId);
    const binding = this.getBinding(displaySetId);

    if (
      !dataSet ||
      !defaultPlanarRenderPathDecisionService.canRender(dataSet, {
        orientation,
      })
    ) {
      return false;
    }

    if (!binding || !isImageRenderMode(binding.rendering.renderMode)) {
      return true;
    }

    try {
      return isImageRenderMode(
        selectPlanarRenderPath(
          dataSet,
          this.getRenderPathDecisionOptions(
            displaySetId,
            {
              ...(this.mountedDisplaySets.get(displaySetId)?.options ?? {}),
              role: binding.role,
            },
            orientation
          )
        ).renderMode
      );
    } catch {
      return false;
    }
  }

  private resolveStackInputImage(stackInput: IStackInput): IImage | undefined {
    const cachedImage = cache.getImage(stackInput.imageId);

    if (cachedImage) {
      return cachedImage;
    }

    if (!stackInput.imageData) {
      return;
    }

    return createPlanarImageFromVTKImageData(
      stackInput.imageId,
      stackInput.imageData as PlanarStackInputImageData
    );
  }

  private resolveOverlayReference(
    stackInput: IStackInput,
    image: IImage
  ): ViewportDataReference {
    const reference = stackInput.reference as ViewportDataReference | undefined;

    if (reference && typeof reference.kind === 'string') {
      return reference;
    }

    return {
      kind: 'image',
      imageId: image.imageId,
    };
  }

  private resolveOverlayDisplaySetId(
    stackInput: IStackInput,
    image: IImage,
    reference: ViewportDataReference
  ): string {
    const explicitDisplaySetId = stackInput.displaySetId;

    if (typeof explicitDisplaySetId === 'string') {
      return explicitDisplaySetId;
    }

    if (
      reference.kind === 'segmentation' &&
      typeof reference.representationUID === 'string'
    ) {
      return reference.representationUID;
    }

    const baseDisplaySetId = image.imageId;

    if (!this.mountedData.hasBinding(baseDisplaySetId)) {
      return baseDisplaySetId;
    }

    return `overlay:${baseDisplaySetId}`;
  }

  protected findBindingDisplaySetIdByActorEntryUID(
    actorEntryUID: string
  ): string | undefined {
    return this.mountedData.findBindingDisplaySetIdByActorEntryUID(
      actorEntryUID
    );
  }

  /**
   * The id of the mounted display set whose data is the volume of this id,
   * as an event or `getVolumeIds()` names it. In stack mode a display set
   * keeps the volume id that it has as a volume, so the answer is the same.
   * When two mounted display sets share the volume: the source when it is
   * one of them, else the first in mount order, the order in which
   * `getVolumeIds()` meets them. Undefined for a volume that no display set
   * has.
   *
   * @param volumeId - The volume id.
   * @returns The display set id, or undefined.
   */
  public getDisplaySetIdForVolumeId(volumeId: string): string | undefined {
    return this.mountedData.findDisplaySetIdByVolumeId(volumeId);
  }

  protected getCurrentPlanarRendering(): PlanarRendering | undefined {
    return this.getCurrentBinding()?.rendering as PlanarRendering | undefined;
  }

  private resolveViewState(
    viewState: PlanarViewState,
    args: {
      frameOfReferenceUID?: string;
      sliceIndex?: number;
    } = {}
  ) {
    const data = this.getPlanarData();
    const rendering = this.getCurrentPlanarRendering();
    return resolvePlanarViewportView({
      viewState,
      data,
      frameOfReferenceUID:
        args.frameOfReferenceUID ?? this.resolveFrameOfReferenceUID(),
      renderContext: this.renderContext,
      rendering,
      canvasDimensions: rendering
        ? this.getCachedPlanarCanvasDimensions()
        : undefined,
      sliceIndex: args.sliceIndex,
    });
  }

  /**
   * Resolves the current viewport state through the Planar projection adapter
   * without exposing projection construction as part of the viewport API.
   */
  private getProjectionSnapshot(): PlanarProjectionSnapshot {
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();
    const snapshot = getPlanarProjectionSnapshot({
      viewport: this,
      canvasHeight,
      canvasWidth,
      frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      resolvedView: this.getResolvedView(),
      resolveViewState: (viewState) => this.resolveViewState(viewState),
      viewState: this.viewState,
    });

    if (!snapshot) {
      throw new Error('[PlanarViewport] Unable to resolve projection snapshot');
    }

    return snapshot;
  }

  /**
   * Returns the canvas CSS dimensions, reading clientWidth/clientHeight at most
   * once per resize() rather than on every call. clientWidth/clientHeight force
   * a synchronous layout reflow when layout is dirty; the annotation rendering
   * loop (worldToCanvas per contour point, interleaved with SVG writes) would
   * otherwise thrash layout. Canvas CSS size only changes on resize(), which
   * invalidates this cache. While the element has no size they are the last
   * size that the canvas had (`getFramingCanvasSize`), which is not cached,
   * so the size of the element is read again once it has one.
   */
  private getCachedPlanarCanvasDimensions(): {
    canvasHeight: number;
    canvasWidth: number;
  } {
    const cached = this.cachedCanvasDimensions;
    if (cached) {
      return cached;
    }

    const measured = this.keepCanvasSize();
    const { width, height } = measured ?? this.getFramingCanvasSize();
    const dimensions = { canvasHeight: height, canvasWidth: width };

    // Don't cache a transient 0x0 read (canvas not laid out yet); recompute
    // until the element has real dimensions so a stale zero never sticks.
    if (measured) {
      this.cachedCanvasDimensions = dimensions;
    }

    return dimensions;
  }

  /**
   * The CSS size of the canvas that shows the view: the CPU canvas while the
   * CPU draws, else the canvas of vtk.js. 0 by 0 while the element has no
   * size.
   */
  protected override measureCanvasSize(): { width: number; height: number } {
    const rendering = this.getCurrentPlanarRendering();
    const { clientWidth, clientHeight } = this.element;

    if (!clientWidth || !clientHeight || !rendering) {
      return { width: clientWidth, height: clientHeight };
    }

    const { canvasWidth, canvasHeight } = getPlanarViewStateCanvasDimensions({
      renderContext: this.renderContext,
      rendering,
    });

    return { width: canvasWidth, height: canvasHeight };
  }

  /**
   * The resolved view of the view state, kept until the view state, the
   * source, its data or rendering, the canvas size or the revision changes.
   * A render path bumps the revision (`invalidateResolvedView`) when it draws
   * another image or slice, so the frame of reference of the drawn image,
   * which comes from its metadata, is read when the view is resolved and not
   * on each lookup: a coordinate transform, which a tool makes for each point
   * that it draws, reads no metadata.
   */
  private resolveCachedViewState(
    viewState: PlanarViewState,
    args: {
      frameOfReferenceUID?: string;
      sliceIndex?: number;
    } = {}
  ) {
    if (args.frameOfReferenceUID || typeof args.sliceIndex === 'number') {
      return this.resolveViewState(viewState, args);
    }

    const data = this.getPlanarData();
    const rendering = this.getCurrentPlanarRendering();
    const sourceDisplaySetId = this.mountedData.getSourceDisplaySetId();
    const cache = this.resolvedViewCache;

    if (!rendering) {
      return this.resolveViewState(viewState, args);
    }

    const { canvasHeight, canvasWidth } =
      this.getCachedPlanarCanvasDimensions();

    if (
      cache &&
      cache.sourceDisplaySetId === sourceDisplaySetId &&
      cache.viewState === viewState &&
      cache.data === data &&
      cache.rendering === rendering &&
      cache.canvasHeight === canvasHeight &&
      cache.canvasWidth === canvasWidth &&
      cache.revision === this.resolvedViewCacheRevision
    ) {
      return cache.resolvedView;
    }

    const resolvedView = resolvePlanarViewportView({
      viewState,
      data,
      frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      renderContext: this.renderContext,
      rendering,
      canvasDimensions: {
        canvasHeight,
        canvasWidth,
      },
    });

    if (resolvedView) {
      this.resolvedViewCache = {
        sourceDisplaySetId,
        canvasHeight,
        canvasWidth,
        data,
        rendering,
        resolvedView,
        revision: this.resolvedViewCacheRevision,
        viewState,
      };
    }

    return resolvedView;
  }

  private clearResolvedViewCache(): void {
    this.resolvedViewCache = undefined;
    this.resolvedViewCacheRevision += 1;
  }

  private resolveFrameOfReferenceUID(): string {
    return this.viewReferences.resolveFrameOfReferenceUID();
  }

  private getFallbackPan(viewState = this.viewState): Point2 {
    const anchorCanvas = viewState.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = viewState.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const [scaleX, scaleY] = normalizePlanarScale(viewState.scale);

    return [
      (0 - anchorWorld[0]) * scaleX + (anchorCanvas[0] - 0.5) * width,
      (0 - anchorWorld[1]) * scaleY + (anchorCanvas[1] - 0.5) * height,
    ];
  }

  private getFallbackViewStateWithPan(
    viewState: PlanarViewState,
    nextPan: Point2
  ): PlanarViewState {
    const currentPan = this.getFallbackPan(viewState);
    const [ax, ay] = viewState.anchorCanvas ?? [0.5, 0.5];
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();
    const deltaX = nextPan[0] - currentPan[0];
    const deltaY = nextPan[1] - currentPan[1];

    return this.normalizeViewState({
      ...viewState,
      anchorCanvas: [
        ax + deltaX / Math.max(canvasWidth, 1),
        ay + deltaY / Math.max(canvasHeight, 1),
      ],
      displayArea: undefined,
    });
  }

  private buildFallbackCanvasToWorld(canvasPos: Point2): Point3 {
    const anchorCanvas = this.viewState.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.viewState.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const [scaleX, scaleY] = normalizePlanarScale(this.viewState.scale);

    return [
      anchorWorld[0] + (canvasPos[0] - anchorCanvas[0] * width) / scaleX,
      anchorWorld[1] + (canvasPos[1] - anchorCanvas[1] * height) / scaleY,
      anchorWorld[2],
    ];
  }

  private buildFallbackWorldToCanvas(worldPos: Point3): Point2 {
    const anchorCanvas = this.viewState.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.viewState.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const [scaleX, scaleY] = normalizePlanarScale(this.viewState.scale);

    return [
      (worldPos[0] - anchorWorld[0]) * scaleX + anchorCanvas[0] * width,
      (worldPos[1] - anchorWorld[1]) * scaleY + anchorCanvas[1] * height,
    ];
  }

  private applyResolvedViewState(nextCamera: PlanarViewState): void {
    const previousCamera = this.getResolvedCameraForEvent();

    this.clearResolvedViewCache();
    this.viewState = this.normalizeViewState(nextCamera);
    this.modified(previousCamera);
  }

  private getResolvedCameraForEvent(): ICamera | undefined {
    return this.getResolvedView()?.toICamera() as unknown as
      | ICamera
      | undefined;
  }

  protected getCameraForEvent(): ICamera {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      return resolvedView.toICamera() as unknown as ICamera;
    }

    return this.getViewState() as unknown as ICamera;
  }

  private getCurrentFraming(): DerivedPlanarFraming | undefined {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    return {
      flipHorizontal: resolvedView.state.viewState.flipHorizontal === true,
      flipVertical: resolvedView.state.viewState.flipVertical === true,
      pan: resolvedView.pan,
      rotation: resolvedView.rotation,
      scale: resolvedView.scale,
      zoom: resolvedView.zoom,
    };
  }

  private getCurrentCanvasDimensions(): { width: number; height: number } {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering) {
      const { canvasHeight, canvasWidth } =
        this.getCachedPlanarCanvasDimensions();

      return {
        width: canvasWidth || this.element.clientWidth,
        height: canvasHeight || this.element.clientHeight,
      };
    }

    return {
      width: this.element.clientWidth,
      height: this.element.clientHeight,
    };
  }

  private getCurrentPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentBinding()?.data as
      | LoadedData<PlanarPayload>
      | undefined;
  }

  protected getReferenceViewContexts(): ViewReferenceContext[] {
    return this.viewReferences.getReferenceViewContexts(
      super.getReferenceViewContexts()
    );
  }
}

type PlanarStackInputImageData = {
  getDimensions: () => ArrayLike<number>;
  getSpacing: () => ArrayLike<number>;
  getPointData: () => {
    getScalars: () => {
      getData: () => ArrayLike<number>;
      getNumberOfComponents?: () => number;
    };
  };
};

function cloneViewportOptions(
  options: PlanarViewportInputOptions = {}
): PlanarViewportInputOptions {
  return deepClone(options);
}

function getBaseReformatOrientation(
  orientation: PlanarOrientation
):
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | undefined {
  switch (orientation) {
    case OrientationAxis.AXIAL_REFORMAT:
      return OrientationAxis.AXIAL;
    case OrientationAxis.CORONAL_REFORMAT:
      return OrientationAxis.CORONAL;
    case OrientationAxis.SAGITTAL_REFORMAT:
      return OrientationAxis.SAGITTAL;
    default:
      return;
  }
}

/**
 * The view vectors of a reformat name for a series of images, as the legacy
 * volume viewport gives them: the axes of the acquisition matched to the base
 * axis of the name. REFORMAT takes the axis closest to `viewPlaneNormal`, or
 * to the acquisition without one. Undefined when the first image has no image
 * orientation.
 */
function getReformatVectorsOfImages(
  orientation: PlanarOrientation,
  imageIds: string[] | undefined,
  viewPlaneNormal?: Point3
): OrientationVectors | undefined {
  const imageOrientationPatient = imageIds?.[0]
    ? metaData.get(MetadataModules.IMAGE_PLANE, imageIds[0])
        ?.imageOrientationPatient
    : undefined;

  if (!imageOrientationPatient || imageOrientationPatient.length !== 6) {
    return;
  }

  const rowCosine = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const columnCosine = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );
  const scanAxis = vec3.cross(vec3.create(), rowCosine, columnCosine);
  const cameraVectors = calculateCameraPosition(
    rowCosine,
    columnCosine,
    scanAxis,
    getBaseReformatOrientation(orientation) ??
      getOrientationFromScanAxisNormal(
        viewPlaneNormal ? vec3.clone(viewPlaneNormal as vec3) : scanAxis
      )
  );

  return {
    viewPlaneNormal: cameraVectors.viewPlaneNormal,
    viewUp: cameraVectors.viewUp,
  };
}

function isReformatOrientation(orientation: PlanarOrientation): boolean {
  return (
    orientation === OrientationAxis.REFORMAT ||
    orientation === OrientationAxis.AXIAL_REFORMAT ||
    orientation === OrientationAxis.CORONAL_REFORMAT ||
    orientation === OrientationAxis.SAGITTAL_REFORMAT
  );
}

function createPlanarImageFromVTKImageData(
  imageId: string,
  imageData: PlanarStackInputImageData
): IImage {
  const dimensions = imageData.getDimensions();
  const spacing = imageData.getSpacing();
  const columns = dimensions[0] ?? 1;
  const rows = dimensions[1] ?? 1;
  const columnPixelSpacing = spacing[0] ?? 1;
  const rowPixelSpacing = spacing[1] ?? 1;
  const scalars = imageData.getPointData().getScalars();
  const scalarData = scalars.getData() as ReturnType<IImage['getPixelData']>;
  const scalarRange = scalarData.length
    ? getMinMax(scalarData)
    : { min: 0, max: 1 };
  const { min, max } =
    Number.isFinite(scalarRange.min) && Number.isFinite(scalarRange.max)
      ? scalarRange
      : { min: 0, max: 1 };
  const windowWidth = Math.max(max - min, 1);
  const dataType = scalarData.constructor?.name || 'Uint8Array';

  return {
    imageId,
    minPixelValue: min,
    maxPixelValue: max,
    slope: 1,
    intercept: 0,
    windowCenter: min + windowWidth / 2,
    windowWidth,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
    getPixelData: () => scalarData,
    getCanvas: () => {
      const canvas = document.createElement('canvas');

      canvas.width = columns;
      canvas.height = rows;

      return canvas;
    },
    rows,
    columns,
    height: rows,
    width: columns,
    color: false,
    rgba: false,
    numberOfComponents: scalars.getNumberOfComponents?.() ?? 1,
    columnPixelSpacing,
    rowPixelSpacing,
    invert: false,
    photometricInterpretation: 'MONOCHROME2',
    sizeInBytes:
      (scalarData as { byteLength?: number }).byteLength ??
      scalarData.length * 4,
    dataType: dataType as IImage['dataType'],
  };
}

function isPlanarDisplaySetDescriptor(
  value: unknown
): value is PlanarDisplaySetDescriptor {
  if (!isImageDisplaySet(value) || value.imageIds.length === 0) {
    return false;
  }

  return value.volumeId === undefined || typeof value.volumeId === 'string';
}

/** The mode of a mount whose display set draws in `renderMode`. */
function getMountMode(
  renderMode: PlanarEffectiveRenderMode
): PlanarMountedDisplaySet['mode'] {
  return isVolumeRenderMode(renderMode) ? 'volume' : 'stack';
}

/**
 * The options that a mount keeps: the options that it was given, without
 * the appearance (applied once, at the mount), with the mode that it chose
 * and, in volume mode, the id of the volume that it shows in place of the
 * `volumeId` that it was given (a stack shows no volume).
 */
/**
 * The index of the image that the `initialViewReference` of a source names,
 * when it is one of the images of the display set, so the first image that a
 * stack loads is that image, as `setViewReference` shows it.
 */
function getImageIdIndexOfInitialViewReference(
  imageIds: string[],
  options: PlanarMountOptions
): number | undefined {
  const referencedImageId = options.initialViewReference?.referencedImageId;

  if (options.role !== 'source' || !referencedImageId) {
    return;
  }

  const index = imageIds.indexOf(referencedImageId);

  return index >= 0 ? index : undefined;
}

function getMountedOptions(
  options: PlanarMountOptions,
  mode: PlanarMountedDisplaySet['mode'],
  volumeId: string | undefined
): PlanarMountedDisplaySet['options'] {
  const mounted: PlanarMountOptions = { ...options, mode };

  delete mounted.appearance;
  delete mounted.volumeId;

  if (mode === 'volume' && volumeId) {
    mounted.volumeId = volumeId;
  }

  return mounted;
}

export default PlanarViewport;
