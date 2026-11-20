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
import { ActorRenderMode } from '../../../types';
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
  EventTypes,
  ICamera,
  IImage,
  IImageData,
  IStackInput,
  ImageActor,
  OrientationVectors,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  VOIRange,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { isImageActor } from '../../../utilities/actorCheck';
import cache from '../../../cache/cache';
import type { PlaneRestriction } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import { deepClone } from '../../../utilities/deepClone';
import imageIdToURI from '../../../utilities/imageIdToURI';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import { getNormalizedAspectRatio } from '../../../utilities/getNormalizedAspectRatio';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import triggerEvent from '../../../utilities/triggerEvent';
import eventTarget from '../../../eventTarget';
import getMinMax from '../../../utilities/getMinMax';
import renderingEngineCache from '../../renderingEngineCache';
import {
  calculateCameraPosition,
  getOrientationFromScanAxisNormal,
} from '../../helpers/getCameraVectors';
import * as metaData from '../../../metaData';
import type {
  LoadedData,
  ViewportDataBinding,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import GenericViewport from '../GenericViewport';
import { disableViewportWidgets } from '../viewportWidgets';
import type { ViewportWidget } from '../Volume3D/viewport3DTypes';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import {
  isGenericViewportReferenceViewableAsVolume,
  isPointNearImagePlane,
} from '../genericViewportReferenceCompatibility';
import {
  getGenericViewportImageDisplaySet,
  isGenericViewportImageDisplaySet,
} from '../genericViewportDisplaySetAccess';
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
import { normalizePlanarRotation } from './planarViewPresentation';
import {
  cloneDisplayArea,
  createDefaultPlanarViewState,
  normalizePlanarViewState,
} from './planarViewState';
import {
  normalizePlanarScale,
  type PlanarScaleInput,
} from './planarCameraScale';
import {
  fitPlanarCameraClippingRange,
  type DerivedPlanarPresentation,
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
  PlanarVolumeSliceRendering,
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
} from './planarViewReference';
import { applyCanvasSharpeningSmoothing } from './planarCanvasSharpeningSmoothing';
import { createSharpeningSmoothingRenderPasses } from '../../renderPasses/createSharpeningSmoothingRenderPasses';
export type { PlanarReferenceContext } from './PlanarViewReferenceController';
import type {
  PlanarViewState,
  PlanarDataPresentation,
  PlanarDataProvider,
  PlanarDisplayArea,
  PlanarEffectiveRenderMode,
  PlanarOrientation,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
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
  activeDataId?: string;
  canvasHeight: number;
  canvasWidth: number;
  data?: LoadedData<PlanarPayload>;
  frameOfReferenceUID: string;
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

type PlanarSlabPresentation = Pick<
  PlanarDataPresentation,
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
  binding: ViewportDataBinding<PlanarDataPresentation> | undefined
): unknown[] {
  if (!binding) {
    return [];
  }

  const entries =
    binding.getActorEntries?.(binding.data) ??
    [binding.getActorEntry?.(binding.data)].filter(Boolean);

  return entries.map((entry) => entry.actor);
}

/** The slab thickness and the blend mode of a presentation. */
function getSlabPresentation(
  props: PlanarDataPresentation | undefined
): PlanarSlabPresentation {
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
  dataSet: PlanarRegisteredDataSet;
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
 * from the source, and the slab of the stored presentation. The other inputs
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

class PlanarViewport extends GenericViewport<
  PlanarViewState,
  PlanarDataPresentation,
  PlanarViewportRenderContext
> {
  readonly type = ViewportType.PLANAR;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: PlanarViewportInputOptions;
  options: PlanarViewportInputOptions;
  suppressEvents = false;
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
  private cpuCanvas?: HTMLCanvasElement;
  private renderImageObjectDataId?: string;
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
  private readonly lastRenderPathErrorByDataId = new Map<string, string>();
  // Original mount options per display set, kept so a live render-backend
  // switch (updateRenderingPipeline) can re-run the render-path decision with
  // the same per-mount semantics (orientation, thresholds, backend pins).
  private readonly mountOptionsByDataId = new Map<
    string,
    PlanarSetDataOptions
  >();
  /**
   * The slab that a mounted binding draws while its display set waits for a
   * remount to the render mode of a new slab (`setDataPresentationState`).
   */
  private readonly withheldSlabByBinding = new WeakMap<
    object,
    PlanarSlabPresentation
  >();
  /** The reason of the decision behind the mounted render mode of each display set. */
  private readonly renderPlanReasonByDataId = new Map<
    string,
    RenderPlanReason
  >();
  /** The render plan entry of each display set that the last event gave. */
  private readonly renderPlanByDataId = new Map<string, RenderPlanLayer>();
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
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = cloneViewportOptions(args.defaultOptions || {});
    this.options = cloneViewportOptions(this.defaultOptions);
    this.suppressEvents = Boolean(this.defaultOptions.suppressEvents);
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createPlanarRenderPathResolver();
    this.mountedData = new PlanarMountedData({
      getBinding: (dataId) => this.getBinding(dataId),
      getFirstBinding: () => this.getFirstBinding(),
      getBindings: () => this.bindings.entries(),
      removeData: (dataId) => this.removeData(dataId),
    });
    this.viewReferences = new PlanarViewReferenceController({
      viewportId: this.id,
      viewportType: this.type,
      getActiveDataId: () => this.mountedData.getActiveDataId(),
      getBinding: (dataId) => this.getBinding(dataId),
      getBindings: () => this.bindings.entries(),
      getCurrentBinding: () => this.getCurrentBinding(),
      getDisplaySetPresentation: (dataId) =>
        this.getDisplaySetPresentation(dataId),
      getRenderContext: () => this.renderContext,
      getResolvedView: (viewArgs) => this.getResolvedView(viewArgs),
      getViewState: () => this.viewState,
      getVolumeSliceWorldPointForImageIdIndex: (imageIdIndex) =>
        this.getVolumeSliceWorldPointForImageIdIndex(imageIdIndex),
      promoteSourceDataId: (dataId) => {
        this.clearResolvedViewCache();
        this.mountedData.promoteSourceDataId(dataId);
      },
      render: () => this.render(),
      setImageIdIndex: (imageIdIndex) => this.setImageIdIndex(imageIdIndex),
      setViewState: (viewStatePatch) => this.setViewState(viewStatePatch),
      updateBindingsCameraState: () => this.updateBindingsCameraState(),
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

    const cpuCanvasContext = cpuCanvas.getContext('2d');

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
        getActiveDataId: () => this.mountedData.getActiveDataId(),
        invalidateResolvedView: () => this.clearResolvedViewCache(),
        getViewState: () => this.getViewState(),
        isCurrentDataId: (dataId) =>
          this.getCurrentBinding()?.data.id === dataId,
        getOverlayActors: () =>
          this.mountedData.getProjectedActorEntries('overlay'),
        canDrawAcquiredFrames: (dataId) => this.canDrawAcquiredFrames(dataId),
        refreshRenderPlan: (dataId) => this.updateRenderPlan(dataId),
      },
      renderPath: {
        renderMode: ActorRenderMode.VTK_IMAGE,
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
    this.viewState = normalizePlanarViewState({
      ...createDefaultPlanarViewState(),
      orientation: this.resolveRequestedOrientation(),
    });
    this.setRenderModeVisibility(
      ActorRenderMode.VTK_IMAGE,
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
    ...entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>
  ): Promise<void> {
    await this.mountDisplaySets(entries);
  }

  /**
   * Mounts display sets as `setDisplaySets` does, then fires the event of new
   * data that the legacy viewports fire: VOLUME_VIEWPORT_NEW_VOLUME when the
   * new source is a volume, as `setVolumes`, and VIEWPORT_NEW_IMAGE_SET when
   * it is a stack, as `setStack`.
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
   * A newer call stops an older one while the older one loads. Once a call
   * has loaded, its commit (the removal of the shown display sets and the
   * mounts) runs to its end, and a newer call waits for it before it removes
   * anything. So a listener of an event of the commit, as NEW_IMAGE, that
   * starts a call that rejects leaves the complete new scene, and the commit
   * fires its event of new data.
   */
  private async mountDisplaySets(
    entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>
  ): Promise<void> {
    const requestId = ++this.setDataRequestId;
    const isStale = () => requestId !== this.setDataRequestId;
    const mounts: Array<{
      displaySetId: string;
      options: PlanarSetDataOptions;
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

      const commit = this.commitDisplaySets(entries, mounts, loaded);

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

    this.triggerNewDataEvent(entries.map(({ displaySetId }) => displaySetId));
  }

  /**
   * The commit of `mountDisplaySets`: removes the shown display sets and
   * mounts the new ones with the data that the call loaded, a stack with the
   * best stage of its image that came meanwhile (`addDisplaySetInternal`).
   * A newer call does not stop it.
   */
  private async commitDisplaySets(
    entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>,
    mounts: Array<{ displaySetId: string; options: PlanarSetDataOptions }>,
    loaded: PlanarDataLoad[]
  ): Promise<void> {
    this.clearResolvedViewCache();
    this.removeReplaceableData(entries);

    for (const [index, { displaySetId, options }] of mounts.entries()) {
      await this.addDisplaySetInternal(displaySetId, options, loaded[index]);
    }
  }

  /**
   * Fires the event of new data for display sets that were just mounted,
   * when the source is one of them: VOLUME_VIEWPORT_NEW_VOLUME with the
   * actor entries of the volumes among them, or VIEWPORT_NEW_IMAGE_SET with
   * the image ids of the stack and its first index.
   */
  private triggerNewDataEvent(dataIds: string[]): void {
    const sourceDataId = this.getSourceDataId();

    if (!sourceDataId || !dataIds.includes(sourceDataId)) {
      return;
    }

    const mode = this.getCurrentMode();

    if (mode === 'volume') {
      this.triggerNewVolumeEvent(
        dataIds.flatMap((dataId) => {
          const binding = this.getBinding(dataId);
          const actorEntry = this.getDataSet(dataId)?.volumeId
            ? binding?.getActorEntry?.(binding.data)
            : undefined;

          return actorEntry ? [actorEntry] : [];
        })
      );
    } else if (mode === 'stack') {
      this.triggerNewImageSetEvent(
        this.getImageIds(),
        this.getDataSet(sourceDataId)?.initialImageIdIndex ?? 0
      );
    }
  }

  /**
   * Fires VOLUME_VIEWPORT_NEW_VOLUME with the detail of the legacy volume
   * viewport: the viewport id and the actor entries of the new volumes.
   */
  private triggerNewVolumeEvent(volumeActors: ActorEntry[]): void {
    triggerEvent(this.element, Events.VOLUME_VIEWPORT_NEW_VOLUME, {
      viewportId: this.id,
      volumeActors,
    });
  }

  /**
   * Fires VIEWPORT_NEW_IMAGE_SET with the detail of the legacy stack
   * viewport, once the first image of a new stack is shown.
   */
  protected triggerNewImageSetEvent(
    imageIds: string[],
    currentImageIdIndex: number
  ): void {
    const eventDetail: EventTypes.StackViewportNewStackEventDetail = {
      imageIds,
      viewportId: this.id,
      element: this.element,
      currentImageIdIndex,
    };

    triggerEvent(this.element, Events.VIEWPORT_NEW_IMAGE_SET, eventDetail);
  }

  /**
   * Adds a single logical planar display set.
   *
   * @param displaySetId - Logical display set id to add.
   * @param options - Semantic orientation and binding options. The render path
   * is inferred from the registered dataset and viewport configuration.
   */
  async addDisplaySet(
    displaySetId: string,
    options: PlanarSetDataOptions = {}
  ): Promise<void> {
    await this.addDisplaySetInternal(displaySetId, options);
    this.clearResolvedViewCache();
  }

  /**
   * Mounts a display set. With `loaded`, what `setDisplaySets` loaded for it,
   * it takes the best stage of the image of a stack that the cache has, after
   * its last wait and in the same task as the render path that listens for
   * the later stages, so no stage comes between the two.
   */
  private async addDisplaySetInternal(
    dataId: string,
    options: PlanarSetDataOptions = {},
    loaded?: PlanarDataLoad
  ): Promise<void> {
    const role = this.mountedData.resolveBindingRole(options);
    const resolvedOptions: PlanarSetDataOptions = {
      ...options,
      role,
    };
    const planarLoad = await this.loadPlanarData(
      dataId,
      resolvedOptions,
      loaded
    );
    const { data, resolvedOrientation, selectedPath } = loaded
      ? withBestCachedImage(planarLoad)
      : planarLoad;

    if (role === 'source') {
      this.mountedData.promoteSourceDataId(dataId);
      this.applyLoadedPlanarViewState(resolvedOrientation, data, selectedPath);
    }

    const added = await this.addLoadedData(dataId, data, {
      renderMode: selectedPath.renderMode,
      role,
    });

    if (!added) {
      return;
    }

    this.updateRenderPlan(dataId, selectedPath.reason);
    this.mountOptionsByDataId.set(dataId, resolvedOptions);
    this.clearResolvedViewCache();
    this.setDefaultDataPresentation(dataId, {
      visible: true,
    });

    // `setDefaultDataPresentation` -> `setDataPresentationState` does not emit
    // (only the public merge path notifies), so a freshly-mounted display set
    // never surfaced its default VOI. Legacy Stack/Volume viewports emit
    // VOI_MODIFIED at load; mirror that here so OHIF's window-level readout,
    // the colorbar, and VOI synchronizers update when the display set changes.
    // Runs per binding (source and each overlay) with that binding's own dataId,
    // and `notifyDataPresentationModified` resolves the matching volumeId/event
    // internally. Mirrors the `resetDisplaySetPresentation` precedent below.
    const mountedPresentation = this.getDisplaySetPresentation(dataId);
    const voiRange =
      mountedPresentation?.voiRange ?? this.getDefaultVOIRange(dataId);

    if (voiRange) {
      this.notifyDataPresentationModified(dataId, { voiRange });
    }

    if (role === 'source') {
      // Emit an initial CAMERA_MODIFIED for the source binding only, mirroring
      // legacy StackViewport's first-image triggerCameraEvent. Overlays and
      // orientation markers paint their first frame off this event. Trigger the
      // event directly rather than routing through modified() to avoid a
      // redundant render (addLoadedData already rendered).
      this.triggerCameraModifiedEvent(this.getCameraForEvent());
    }
  }

  /**
   * The render plan of this viewport: for each mounted layer (display set),
   * source first, how its slice is made, what draws it, the render mode and
   * the reason of the decision. It reads what the last decision stored, so
   * it gives the same answer at any time and costs nothing.
   * `Events.RENDER_PLAN_CHANGED` fires when an entry changes.
   *
   * @experimental
   */
  getRenderPlan(): RenderPlanLayer[] {
    const source = this.getCurrentBinding();
    const plan: RenderPlanLayer[] = [];

    for (const [dataId, binding] of this.bindings) {
      const layer = this.getRenderPlanLayer(dataId);

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
  private getRenderPlanLayer(dataId: string): RenderPlanLayer | undefined {
    const binding = this.bindings.get(dataId);
    const reason = this.renderPlanReasonByDataId.get(dataId);

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
      dataId,
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
  private updateRenderPlan(dataId: string, reason?: RenderPlanReason): void {
    if (reason) {
      this.renderPlanReasonByDataId.set(dataId, reason);
    }

    const previous = this.renderPlanByDataId.get(dataId);
    const current = this.getRenderPlanLayer(dataId);

    if (!current || isSameRenderPlanLayer(previous, current)) {
      return;
    }

    this.renderPlanByDataId.set(dataId, current);

    const detail: RenderPlanChangedEventDetail = {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
      dataId,
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
  removeData(dataId: string): void {
    this.clearResolvedViewCache();
    this.mountOptionsByDataId.delete(dataId);
    this.lastRenderPathErrorByDataId.delete(dataId);
    this.renderPlanReasonByDataId.delete(dataId);
    this.renderPlanByDataId.delete(dataId);
    super.removeData(dataId);
    this.mountedData.handleRemovedData(dataId);

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
      // identifies a layer by its display-set id (the presentation dataId, a bare
      // uid), which is not the referencedId. Fall back to resolving that dataId
      // through the binding so a fused viewport's per-layer colorbar reads the
      // correct actor (e.g. the PT layer) instead of defaulting to the source.
      actorEntry =
        actorEntries.find((a) => a.referencedId === volumeId) ??
        this.mountedData.getActorForDataId(volumeId);
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
   * `getDefaultImageData is not a function`. Returns undefined when no VTK image
   * actor is mounted (e.g. CPU render paths).
   */
  getDefaultImageData() {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering?.renderMode === ActorRenderMode.VTK_SAMPLED_SLICE) {
      return rendering.imageVolume.imageData;
    }

    return this.getImageActor()?.getMapper().getInputData();
  }

  /**
   * Renders a single image object by setting it as a one-image stack.
   */
  renderImageObject(image: IImage): Promise<void> {
    const dataId = `image-object:${this.id}:${imageIdToURI(image.imageId)}`;

    if (
      this.renderImageObjectDataId &&
      this.renderImageObjectDataId !== dataId
    ) {
      genericViewportDisplaySetMetadataProvider.remove(
        this.renderImageObjectDataId
      );
    }

    this.renderImageObjectDataId = dataId;
    genericViewportDisplaySetMetadataProvider.add(dataId, {
      image,
      imageIds: [image.imageId],
      initialImageIdIndex: 0,
      kind: 'planar',
    });

    return this.setDisplaySets({
      displaySetId: dataId,
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
        this.getDisplaySetPresentation(binding.data.id) || {}
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
   * Adds overlay images on top of the primary render path output.
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
      const dataId = this.resolveOverlayDataId(stackInput, image, reference);
      genericViewportDisplaySetMetadataProvider.add(dataId, {
        image,
        imageData: stackInput.imageData,
        imageIds: [stackInput.imageId],
        initialImageIdIndex: 0,
        kind: 'planar',
        reference,
        useWorldCoordinateImageData:
          stackInput.useWorldCoordinateImageData === true,
      });

      await this.addDisplaySet(dataId, {
        role: 'overlay',
      });

      const actorEntry = this.mountedData.getActorForDataId(dataId);

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

  getSourceDataId(): string | undefined {
    return this.mountedData.getActiveDataId();
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

    // VTK_VOLUME is not a mode the planar decision service selects (no
    // registered backend owns it) but compatibility layers can still mount it.
    if (
      renderMode === ActorRenderMode.VTK_VOLUME ||
      isVolumeRenderMode(renderMode)
    ) {
      return 'volume';
    }

    if (isImageRenderMode(renderMode)) {
      return 'stack';
    }

    // Render mode not yet resolved; fall back to bound-data inspection.
    return this.getVolumeId() ? 'volume' : 'stack';
  }

  /**
   * Emits the legacy-named presentation events (`VOI_MODIFIED`,
   * `COLORMAP_MODIFIED`) when a per-display-set presentation update changes the
   * VOI, invert, or colormap of a mounted dataset.
   *
   * The native presentation write path previously emitted no event, so OHIF's
   * VOI sliders, colorbar, window-level readout, and VOI/colormap
   * synchronizers went stale after any programmatic or tool-driven
   * `setDisplaySetPresentation` change on a direct `PLANAR` viewport.
   *
   * A change of the slab thickness fires `CAMERA_MODIFIED`, with the camera
   * as the previous camera, as the legacy volume viewport did when its slab
   * changed. The slab thickness synchronizer listens to it.
   */
  protected notifyDataPresentationModified(
    displaySetId: string,
    props: Partial<PlanarDataPresentation>
  ): void {
    if (this.suppressEvents) {
      return;
    }

    if ('slabThickness' in props) {
      this.triggerCameraModifiedEvent(this.getCameraForEvent());
    }

    const voiTouched =
      'voiRange' in props || 'invert' in props || 'voiLUTFunction' in props;
    const colormapTouched = 'colormap' in props;

    if (!voiTouched && !colormapTouched) {
      return;
    }

    const presentation = this.getDisplaySetPresentation(displaySetId);
    // Use the modified display set's own volume id so VOI/colormap changes on an
    // overlay/fusion display set do not emit the active source's volumeId (which
    // would make downstream synchronizers update the wrong actor). Fall back to
    // the active source volume id only when the modified set is the source.
    const volumeId =
      this.getDataSet(displaySetId)?.volumeId ??
      (displaySetId === this.getSourceDataId()
        ? this.getVolumeId()
        : undefined);

    if (voiTouched) {
      const range =
        props.voiRange ??
        presentation?.voiRange ??
        this.getDefaultVOIRange(displaySetId);

      if (range) {
        triggerEvent(this.element, Events.VOI_MODIFIED, {
          viewportId: this.id,
          range,
          volumeId,
          VOILUTFunction: props.voiLUTFunction ?? presentation?.voiLUTFunction,
          invert: props.invert ?? presentation?.invert,
          colormap: presentation?.colormap,
        });
      }
    }

    if (colormapTouched && props.colormap) {
      triggerEvent(this.element, Events.COLORMAP_MODIFIED, {
        viewportId: this.id,
        colormap: presentation?.colormap ?? props.colormap,
        volumeId,
      });
    }
  }

  /**
   * Merges a presentation change as the base class does, with `colormap`
   * merged one level deep: a colormap that names only some of its fields
   * keeps the stored others, so the name stays when only the opacity
   * changes.
   */
  protected override mergeDataPresentation(
    displaySetId: string,
    changes: Partial<PlanarDataPresentation>
  ): PlanarDataPresentation {
    const storedColormap =
      this.getDisplaySetPresentation(displaySetId)?.colormap;
    const props =
      changes.colormap && storedColormap
        ? { ...changes, colormap: { ...storedColormap, ...changes.colormap } }
        : changes;

    return super.mergeDataPresentation(displaySetId, props);
  }

  getDefaultVOIRange(dataId?: string): VOIRange | undefined {
    return this.mountedData.getDefaultVOIRange(dataId);
  }

  /**
   * Whether the image of a display set is drawn inverted when its
   * presentation does not set `invert`: true for a MONOCHROME1 image. It is
   * undefined for data that has no such default, as a volume.
   *
   * @param dataId - Optional display set id; defaults to the active source.
   */
  getDefaultInvert(dataId?: string): boolean | undefined {
    return this.mountedData.getDefaultInvert(dataId);
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
   */
  public override setViewState(viewStatePatch: Partial<PlanarViewState>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getResolvedCameraForEvent();

    if (Object.prototype.hasOwnProperty.call(viewStatePatch, 'displayArea')) {
      this.options = {
        ...this.options,
        displayArea: cloneDisplayArea(viewStatePatch.displayArea),
      };
    }

    const next = {
      ...this.viewState,
      ...viewStatePatch,
    };

    if (Object.prototype.hasOwnProperty.call(viewStatePatch, 'orientation')) {
      next.orientation = this.resolveNextOrientation(
        viewStatePatch.orientation
      );
    }

    this.clearResolvedViewCache();
    this.viewState = this.normalizeViewState(next);
    this.modified(previousCamera);
  }

  setDisplaySetPresentation(props: Partial<PlanarDataPresentation>): void;
  setDisplaySetPresentation(
    displaySetId: string,
    props: Partial<PlanarDataPresentation>
  ): void;
  setDisplaySetPresentation(
    displaySetIdOrProps: string | Partial<PlanarDataPresentation>,
    maybeProps?: Partial<PlanarDataPresentation>
  ): void {
    this.clearResolvedViewCache();

    if (typeof displaySetIdOrProps === 'string') {
      super.setDisplaySetPresentation(displaySetIdOrProps, maybeProps ?? {});
      return;
    }

    super.setDisplaySetPresentation(displaySetIdOrProps);
  }

  /**
   * Stores the presentation of a display set and gives it to the mounted
   * binding. When the new slab needs another render mode than the mounted one
   * (`getRenderModeForPresentation`), the mounted binding keeps the slab
   * thickness and the blend mode that it draws, so it does no work for a slab
   * that is about to move, and gets every other field at once. The stored
   * presentation is the new one, and the remounted binding gets it. When the
   * change starts a remount, the render that it asks for is held with the
   * renders of the remount (`applyRenderingPipelineUpdate`).
   */
  protected override setDataPresentationState(
    dataId: string,
    props: PlanarDataPresentation
  ): void {
    const previousProps = this.getDataPresentationState(dataId);
    const binding = this.bindings.get(dataId);
    const decision = this.getRenderModeForPresentation(
      dataId,
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

      super.setDataPresentationState(dataId, props);
    } else {
      const mountedSlab =
        this.withheldSlabByBinding.get(binding) ??
        getSlabPresentation(previousProps);

      this.withheldSlabByBinding.set(binding, mountedSlab);
      this.dataPresentation.set(dataId, props);
      binding.updateDataPresentation({ ...props, ...mountedSlab });
      this.render();
    }

    if (remounts) {
      this.startRenderingPipelineUpdate();
      this.releaseRemountRenderHold();
    } else if (decision && binding) {
      this.updateRenderPlan(dataId, decision.reason);
    }
  }

  /**
   * The render mode, and its reason, that a mounted volume display set needs
   * for a new presentation, when it may change: a slab moves a sampled slice
   * to the GPU volume path, and back. Only a change of the slab thickness or
   * the blend mode runs the decision, so a window level change costs nothing.
   * Returns undefined when the decision does not run. The caller starts the
   * remount (`applyRenderingPipelineUpdate`) when the mode differs from the
   * mounted one, and also while a pass is pending, because the pending pass
   * may mount the mode that an older presentation chose. Otherwise it stores
   * the reason in the render plan.
   */
  private getRenderModeForPresentation(
    dataId: string,
    previousProps: PlanarDataPresentation | undefined,
    props: PlanarDataPresentation | undefined
  ): PlanarRenderModeDecision | undefined {
    if (
      previousProps?.slabThickness === props?.slabThickness &&
      previousProps?.blendMode === props?.blendMode
    ) {
      return;
    }

    const binding = this.bindings.get(dataId);
    const dataSet = this.getDataSet(dataId);

    if (
      this.isDestroyed ||
      !binding ||
      !dataSet ||
      !isVolumeRenderMode(binding.rendering.renderMode)
    ) {
      return;
    }

    const options = {
      ...(this.mountOptionsByDataId.get(dataId) ?? {}),
      role: binding.role,
    };

    try {
      const { renderMode, reason } = selectPlanarRenderPath(
        dataSet,
        this.getRenderPathDecisionOptions(
          dataId,
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

  /**
   * Applies viewport-level options that affect the planar camera.
   */
  setOptions(options: ViewportInputOptions, immediate = false): void {
    this.options = cloneViewportOptions(options);

    if (this.options.displayArea) {
      this.setDisplayArea(
        this.options.displayArea,
        this.options.suppressEvents ?? false
      );
    }

    if (immediate) {
      this.render();
    }
  }

  /**
   * Resets viewport options to the construction defaults.
   */
  reset(immediate = false): void {
    this.options = cloneViewportOptions(this.defaultOptions);

    if (immediate) {
      this.render();
    }
  }

  /**
   * Returns the current display-area declaration, if any.
   */
  getDisplayArea(): PlanarDisplayArea | undefined {
    return cloneDisplayArea(
      this.viewState.displayArea ?? this.options.displayArea
    );
  }

  /**
   * Stores a display-area declaration on the semantic camera. The shared
   * planar camera resolver turns it into render-path-specific pan/zoom.
   */
  setDisplayArea(displayArea: PlanarDisplayArea, suppressEvents = false): void {
    const nextDisplayArea = cloneDisplayArea(displayArea);

    if (!nextDisplayArea) {
      return;
    }

    this.options = {
      ...this.options,
      displayArea: cloneDisplayArea(nextDisplayArea),
    };

    this.setViewState({
      anchorCanvas: [0.5, 0.5],
      anchorWorld: undefined,
      displayArea: nextDisplayArea,
      scale: [1, 1],
      scaleMode: nextDisplayArea.scaleMode ?? 'fit',
    });

    if (!suppressEvents && !this.suppressEvents) {
      triggerEvent(this.element, Events.DISPLAY_AREA_MODIFIED, {
        viewportId: this.id,
        displayArea: cloneDisplayArea(nextDisplayArea),
        storeAsInitialCamera: nextDisplayArea.storeAsInitialCamera,
      });
    }
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
   * Applies a view reference by activating the matching binding and
   * navigating to the referenced slice.
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
      const dataId = this.findDataIdByVolumeId(volumeId);
      const binding = dataId ? this.getBinding(dataId) : undefined;
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
    const dataId = this.findDataIdByVolumeId(volumeId);

    return (
      dataId !== undefined &&
      !isImageRenderMode(this.getBinding(dataId)?.rendering.renderMode)
    );
  }

  /**
   * Returns whether the active dataset references a volume whose id contains
   * the given URI fragment.
   *
   * @param volumeURI - Volume URI substring to compare against the active
   * dataset volume id.
   * @returns `true` when the active dataset references the given volume URI.
   */
  hasVolumeURI(volumeURI: string): boolean {
    return String(this.getVolumeId() || '').includes(volumeURI);
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
   * Returns whether a view reference is spatially compatible with this
   * viewport.
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
   * only as viewable when the point lies within half a slice spacing of the
   * image shown, as the legacy stack viewport does.
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
   * @param viewRef - View reference to test.
   * @param options - Optional compatibility flags for the spatial check.
   * @returns `true` when the reference can be viewed in this viewport state.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    const reference = getPlanarReferenceForViewableCheck(viewRef);
    const isStack = this.getCurrentMode() === 'stack';
    const checkOptions = isStack
      ? { ...options, withOrientation: options.asVolume }
      : options;
    const imageReference =
      isStack && options.withNavigation
        ? getPlanarImageReferenceForStack(reference)
        : undefined;
    const isViewable =
      super.isReferenceViewable(reference, checkOptions) ||
      Boolean(
        imageReference &&
          super.isReferenceViewable(imageReference, checkOptions)
      );

    if (!isViewable && options.asVolume && isStack) {
      return isGenericViewportReferenceViewableAsVolume(
        reference,
        this.getReferenceViewContexts()
      );
    }

    if (
      !isViewable ||
      !options.asNearbyProjection ||
      !viewRef.cameraFocalPoint ||
      viewRef.referencedImageId ||
      viewRef.volumeId ||
      viewRef.FrameOfReferenceUID ||
      this.getCurrentMode() !== 'stack'
    ) {
      return isViewable;
    }

    const imageData = this.getImageData() as CPUIImageData | undefined;

    return Boolean(
      imageData && isPointNearImagePlane(viewRef.cameraFocalPoint, imageData)
    );
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
   * Scrolls by a signed number of steps. A step is one image of a stack or
   * one slice of the source volume, and the scroll stops at the first and at
   * the last one. `utilities.scroll` has the options of a scroll: a loop, a
   * step of the slab thickness and a step of another volume.
   *
   * @param delta - Signed number of steps to move by.
   * @returns The resolved image id after scrolling.
   */
  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getActiveImageIdIndex() + delta);
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
   * @param dataId - Optional display set id; defaults to the active source.
   * @returns `true` when the orientation can be rendered for the data.
   */
  canRenderOrientation(
    orientation: PlanarOrientation,
    dataId?: string
  ): boolean {
    const targetDataId = dataId ?? this.getSourceDataId();

    if (!targetDataId) {
      return false;
    }

    const dataSet = this.getDataSet(targetDataId);

    if (!dataSet) {
      return false;
    }

    try {
      return this.canShowOrientation(
        targetDataId,
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
   * Resets view state presentation back to the viewport defaults.
   *
   * Navigation state such as the current slice remains unchanged.
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

  /**
   * Resets the stored per-display-set presentation (VOI / window level,
   * colormap and inversion) back to the computed defaults for a single display
   * set. This is the reset counterpart to `setDisplaySetPresentation` /
   * `getDisplaySetPresentation`; the next viewport intentionally has no
   * get/set Properties, so it does not use the legacy `*Properties` naming.
   *
   * Clearing the stored presentation override makes the render path fall back
   * to its defaults on the next apply (default VOI, no colormap, no inversion).
   * "Reset View" relies on it (view/camera state is reset separately by
   * `resetViewState`); without it, "Reset View" left the window level at the
   * user-modified value on direct generic viewports.
   *
   * @param dataId - Optional display set id; defaults to the active source.
   */
  resetDisplaySetPresentation(dataId?: string): void {
    if (this.isDestroyed) {
      return;
    }

    const targetDataId = dataId ?? this.getSourceDataId();

    if (!targetDataId) {
      return;
    }

    // Drop the stored override so the render path's `updateDataPresentation`
    // reapplies its defaults.
    this.setDataPresentationState(targetDataId, {} as PlanarDataPresentation);

    // `setDataPresentationState` does not emit (only the public merge path
    // notifies), so surface the now-default VOI to OHIF's window-level readout,
    // colorbar, sliders, and VOI synchronizers.
    const defaultVOIRange = this.getDefaultVOIRange(targetDataId);

    if (defaultVOIRange) {
      this.notifyDataPresentationModified(targetDataId, {
        voiRange: defaultVOIRange,
      });
    }
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
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    this.clearResolvedViewCache();
    // The canvas CSS size may have changed; drop the cached dimensions so the
    // next resolve/transform re-reads clientWidth/clientHeight exactly once.
    this.cachedCanvasDimensions = undefined;
    const { clientHeight, clientWidth } = this.element;
    const { canvas } = this.renderContext.cpu;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.round(clientWidth * devicePixelRatio);
    const targetHeight = Math.round(clientHeight * devicePixelRatio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    this.resizeBindingsWithActiveFirst();
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
        this.getDisplaySetPresentation(binding.data.id)
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
    const renderings: Partial<PlanarVolumeSliceRendering>[] = [];

    this.forEachBinding((binding) => {
      renderings.push(
        ...((binding.getRenderings?.() ?? [
          binding.rendering,
        ]) as Partial<PlanarVolumeSliceRendering>[])
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
    if (this.renderImageObjectDataId) {
      genericViewportDisplaySetMetadataProvider.remove(
        this.renderImageObjectDataId
      );
      this.renderImageObjectDataId = undefined;
    }

    this.cpuCanvas?.remove();
    this.cpuCanvas = undefined;
    this.renderContext.vtk.canvas.classList.add(CANVAS_CSS_CLASS);
    this.mountedData.clearActiveDataId();
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
      binding: ViewportDataBinding<PlanarDataPresentation>,
      dataId: string
    ) => {
      if (!binding.render) {
        return;
      }

      renderedByAdapter = true;

      try {
        binding.render();
        this.lastRenderPathErrorByDataId.delete(dataId);
      } catch (error) {
        this.reportRenderPathError(error, dataId);
      }
    };

    for (const [dataId, binding] of this.bindings.entries()) {
      if (binding === sourceBinding) {
        renderBinding(binding, dataId);
      }
    }

    for (const [dataId, binding] of this.bindings.entries()) {
      if (binding !== sourceBinding) {
        renderBinding(binding, dataId);
      }
    }

    return renderedByAdapter;
  }

  /**
   * Live render-backend switch: re-runs the render-path decision for every
   * mounted display set and remounts, in place, the ones whose effective
   * render mode changed. The viewport instance, its id, mounted data, view
   * state (slice/zoom/pan), per-display-set presentation, and tool
   * annotations all survive -- addLoadedData re-applies presentation and view
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
   * set before it awaits the data and mounts after, so a presentation change
   * while a pass is pending starts a new pass, which makes the pending one
   * stale and decides again for the final presentation.
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
   * keeps its render path and gets the stored presentation
   * (`releaseWithheldSlabAfterError`). From its start to its end it holds the renders of
   * this viewport (`holdsRenderForRemount`), so no frame shows the new source
   * with the old overlays while a mount waits for its data. An overlay that
   * has no backend of its own follows the backend of the render mode that the
   * pass chose for the source, as it follows the mounted source otherwise.
   * Each remounted binding keeps the place of the one it replaces in the draw
   * order (`keepViewPropPlace`). A binding whose render mode stays gets the
   * stored presentation when it drew a withheld slab.
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
    // promoteSourceDataId).
    const sourceBinding = this.getCurrentBinding();
    const bindingEntries = Array.from(this.bindings.entries());
    const orderedEntries = [
      ...bindingEntries.filter(([, binding]) => binding === sourceBinding),
      ...bindingEntries.filter(([, binding]) => binding !== sourceBinding),
    ];
    const mounts: Array<{
      dataId: string;
      binding: ViewportDataBinding<PlanarDataPresentation>;
      data: LoadedData<PlanarPayload>;
      renderMode: PlanarEffectiveRenderMode;
      reason: RenderPlanReason;
    }> = [];
    let sourceRenderBackend: EffectiveRenderBackend | undefined;

    for (const [dataId, binding] of orderedEntries) {
      if (isStale()) {
        return false;
      }

      // Skip bindings that were removed or replaced (e.g. by a concurrent
      // setDisplaySets) since this pass started.
      if (this.bindings.get(dataId) !== binding) {
        continue;
      }

      const options = this.mountOptionsByDataId.get(dataId) ?? {};

      try {
        const { data, selectedPath } = await this.loadPlanarData(dataId, {
          ...options,
          role: binding.role,
          renderBackend:
            binding === sourceBinding
              ? options.renderBackend
              : (options.renderBackend ?? sourceRenderBackend),
        });

        if (binding === sourceBinding) {
          sourceRenderBackend = getRenderBackendForRenderMode(
            selectedPath.renderMode
          );
        }

        if (isStale() || this.bindings.get(dataId) !== binding) {
          continue;
        }

        if (selectedPath.renderMode === binding.rendering.renderMode) {
          this.updateRenderPlan(dataId, selectedPath.reason);
          this.releaseWithheldSlab(dataId, binding);
          continue;
        }

        mounts.push({
          dataId,
          binding,
          data,
          renderMode: selectedPath.renderMode,
          reason: selectedPath.reason,
        });
      } catch (error) {
        this.reportRenderPathError(error, dataId);
        this.releaseWithheldSlabAfterError(dataId, binding);
      }
    }

    for (const { dataId, binding, data, renderMode, reason } of mounts) {
      if (isStale()) {
        return false;
      }

      if (this.bindings.get(dataId) !== binding) {
        continue;
      }

      try {
        const propsBefore = this.getViewProps();
        const added = await this.addLoadedData(
          dataId,
          data,
          { renderMode, role: binding.role },
          () => isStale() || this.bindings.get(dataId) !== binding
        );

        if (added) {
          this.keepViewPropPlace(propsBefore, this.bindings.get(dataId));
          this.updateRenderPlan(dataId, reason);
        }

        changed = changed || added;
      } catch (error) {
        this.reportRenderPathError(error, dataId);
        this.releaseWithheldSlabAfterError(dataId, binding);
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
   * Gives a binding the stored presentation when it drew a withheld slab
   * (`setDataPresentationState`) and keeps its render mode after all.
   */
  private releaseWithheldSlab(
    dataId: string,
    binding: ViewportDataBinding<PlanarDataPresentation>
  ): void {
    if (!this.withheldSlabByBinding.has(binding)) {
      return;
    }

    this.withheldSlabByBinding.delete(binding);

    const props = this.getDataPresentationState(dataId);

    if (props !== undefined) {
      binding.updateDataPresentation(props);
      this.render();
    }
  }

  /**
   * Gives the mounted binding of a display set the stored presentation after
   * its remount failed, so the render path that works draws the new slab and
   * no binding keeps a withheld slab.
   */
  private releaseWithheldSlabAfterError(
    dataId: string,
    binding: ViewportDataBinding<PlanarDataPresentation>
  ): void {
    if (!this.isDestroyed && this.bindings.get(dataId) === binding) {
      this.releaseWithheldSlab(dataId, binding);
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
    binding: ViewportDataBinding<PlanarDataPresentation> | undefined
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
      rendering?.renderMode !== ActorRenderMode.CPU_IMAGE ||
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
   * Whether the volume slice path of `dataId` may draw the acquired frames
   * (`PlanarRenderPathDecisionService.canDrawAcquiredFrames`). The render path
   * reads this at each change of the view or the presentation.
   */
  private canDrawAcquiredFrames(dataId: string): boolean {
    const binding = this.bindings.get(dataId);
    const dataSet = this.getDataSet(dataId);

    if (!binding || !dataSet) {
      return false;
    }

    return defaultPlanarRenderPathDecisionService.canDrawAcquiredFrames(
      dataSet,
      this.getRenderPathDecisionOptions(
        dataId,
        {
          ...(this.mountOptionsByDataId.get(dataId) ?? {}),
          role: binding.role,
        },
        this.viewState.orientation
      )
    );
  }

  /**
   * The inputs of the render-path decision for one display set, with the
   * stored presentation of the display set, or the given one.
   *
   * Only the source may draw the acquired frames of a reduced volume.
   */
  private getRenderPathDecisionOptions(
    dataId: string,
    options: PlanarSetDataOptions,
    orientation: PlanarViewState['orientation'],
    presentation = this.getDataPresentationState(dataId)
  ): PlanarRenderPathDecisionOptions {
    return {
      orientation,
      // Per-mount backend pin/override. Overlays without an explicit pin
      // follow the source binding's mounted backend rather than the global
      // configuration; only then does the global renderBackend decide.
      renderBackend:
        options.renderBackend ??
        this.getInheritedOverlayRenderBackend(options.role),
      preferAcquiredFrames: options.role === 'source',
      slabThickness: presentation?.slabThickness,
      blendMode: presentation?.blendMode,
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
  private reportRenderPathError(error: unknown, dataId?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const errorKey = dataId ?? '';

    if (this.lastRenderPathErrorByDataId.get(errorKey) === message) {
      return;
    }

    this.lastRenderPathErrorByDataId.set(errorKey, message);
    log.error('[PlanarViewport] Render path error', dataId ?? '', error);
    triggerEvent(eventTarget, Events.RENDER_PATH_ERROR, {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
      dataId,
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
   * re-set to the same display set.
   *
   * The segmentation display tool mounts labelmap overlays out-of-band (via
   * `addDisplaySet`), so a full teardown on every `setDisplaySets` would blank a
   * hydrated segmentation whenever the source is re-applied (e.g. when an
   * application re-runs its viewport-data sync). When the source changes (or no
   * source is being set), everything is removed so a stale segmentation cannot
   * leak across datasets.
   */
  private removeReplaceableData(
    entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>
  ): void {
    const nextSourceId = this.resolveNextSourceId(entries);
    const preserveSegmentationOverlays =
      nextSourceId !== undefined && nextSourceId === this.getSourceDataId();

    for (const dataId of Array.from(this.bindings.keys())) {
      if (
        preserveSegmentationOverlays &&
        this.isSegmentationOverlayBinding(dataId)
      ) {
        continue;
      }

      this.removeData(dataId);
    }
  }

  /**
   * Resolves which entry will become the source binding for a `setDisplaySets`
   * call: the entry explicitly flagged `role: 'source'`, otherwise the first.
   */
  private resolveNextSourceId(
    entries: Array<{ displaySetId: string; options?: PlanarSetDataOptions }>
  ): string | undefined {
    const explicitSource = entries.find(
      (entry) => entry.options?.role === 'source'
    );

    return explicitSource?.displaySetId ?? entries[0]?.displaySetId;
  }

  /**
   * Returns whether a mounted binding is an externally-managed segmentation
   * overlay (an overlay-role binding whose registered data references a
   * segmentation).
   */
  private isSegmentationOverlayBinding(dataId: string): boolean {
    if (this.getDisplaySetRole(dataId) !== 'overlay') {
      return false;
    }

    return this.getDataSet(dataId)?.reference?.kind === 'segmentation';
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getGenericViewportImageDisplaySet(dataId);

    if (!isPlanarRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
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
   * whether the display set takes the volume path depends on the display set
   * and the orientation alone. With `loaded` it reads the registration that
   * the load had, so a registration that goes or changes after the load does
   * not count.
   */
  private async loadPlanarData(
    dataId: string,
    options: PlanarSetDataOptions,
    loaded?: PlanarDataLoad
  ): Promise<PlanarDataLoad> {
    const dataSet = loaded?.dataSet ?? this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewport] No registered planar dataset metadata for ${dataId}`
      );
    }

    const resolvedOrientation = this.resolveRequestedOrientation(
      options.orientation,
      dataSet.imageIds
    );
    const decisionOptions = this.getRenderPathDecisionOptions(
      dataId,
      options,
      resolvedOrientation
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
      : await (this.dataProvider as PlanarDataProvider).load(dataId, {
          acquisitionOrientation: selectedPath.acquisitionOrientation,
          orientation: resolvedOrientation,
          renderMode: selectedPath.renderMode,
          volumeId: selectedPath.volumeId,
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
    role: PlanarSetDataOptions['role']
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
    // otherwise centers the volume, matching legacy and the reformatted
    // (sagittal/coronal) orientations. "No slice requested" now propagates as
    // undefined all the way from the data provider (it no longer defaults to 0),
    // so we can pass the index through directly: undefined -> center, while a
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
    orientation?: PlanarSetDataOptions['orientation'],
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
    const sourceDataId = this.getSourceDataId();
    const resolved = this.resolveOrientation(
      orientation,
      this.getImageIds(),
      this.getResolvedCameraForEvent()?.viewPlaneNormal
    );

    if (
      sourceDataId &&
      resolved !== OrientationAxis.ACQUISITION &&
      this.getCurrentMode() === 'stack' &&
      !this.canShowOrientation(sourceDataId, resolved)
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
    dataId: string,
    orientation: PlanarViewState['orientation']
  ): boolean {
    const dataSet = this.getDataSet(dataId);
    const binding = this.getBinding(dataId);

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
            dataId,
            {
              ...(this.mountOptionsByDataId.get(dataId) ?? {}),
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

  private resolveOverlayDataId(
    stackInput: IStackInput,
    image: IImage,
    reference: ViewportDataReference
  ): string {
    const explicitDataId = stackInput.dataId;

    if (typeof explicitDataId === 'string') {
      return explicitDataId;
    }

    if (
      reference.kind === 'segmentation' &&
      typeof reference.representationUID === 'string'
    ) {
      return reference.representationUID;
    }

    const baseDataId = image.imageId;

    if (!this.mountedData.hasBinding(baseDataId)) {
      return baseDataId;
    }

    return `overlay:${baseDataId}`;
  }

  protected findBindingDataIdByActorEntryUID(
    actorEntryUID: string
  ): string | undefined {
    return this.mountedData.findBindingDataIdByActorEntryUID(actorEntryUID);
  }

  /**
   * Maps a volume id to its bound display-set (data) id. Public because the
   * tools VOI synchronizer needs it across the tools<->core boundary; it was
   * previously reached through a structural cast against this protected member,
   * which leaked the type contract. Planar-family specific (volume-backed), so
   * it lives here rather than on IViewport.
   */
  public findDataIdByVolumeId(volumeId: string): string | undefined {
    return this.mountedData.findDataIdByVolumeId(volumeId);
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
      displayArea: this.getDisplayArea(),
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
   * invalidates this cache.
   */
  private getCachedPlanarCanvasDimensions(rendering: PlanarRendering): {
    canvasHeight: number;
    canvasWidth: number;
  } {
    const cached = this.cachedCanvasDimensions;
    if (cached) {
      return cached;
    }

    const dimensions = getPlanarViewStateCanvasDimensions({
      renderContext: this.renderContext,
      rendering,
    });

    // Don't cache a transient 0x0 read (canvas not laid out yet); recompute
    // until the element has real dimensions so a stale zero never sticks.
    if (dimensions.canvasHeight > 0 && dimensions.canvasWidth > 0) {
      this.cachedCanvasDimensions = dimensions;
    }

    return dimensions;
  }

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
    const activeDataId = this.mountedData.getActiveDataId();
    const frameOfReferenceUID = this.resolveFrameOfReferenceUID();
    const cache = this.resolvedViewCache;

    if (!rendering) {
      return this.resolveViewState(viewState, args);
    }

    const { canvasHeight, canvasWidth } =
      this.getCachedPlanarCanvasDimensions(rendering);

    if (
      cache &&
      cache.activeDataId === activeDataId &&
      cache.viewState === viewState &&
      cache.data === data &&
      cache.rendering === rendering &&
      cache.frameOfReferenceUID === frameOfReferenceUID &&
      cache.canvasHeight === canvasHeight &&
      cache.canvasWidth === canvasWidth &&
      cache.revision === this.resolvedViewCacheRevision
    ) {
      return cache.resolvedView;
    }

    const resolvedView = resolvePlanarViewportView({
      viewState,
      data,
      frameOfReferenceUID,
      renderContext: this.renderContext,
      rendering,
      canvasDimensions: {
        canvasHeight,
        canvasWidth,
      },
    });

    if (resolvedView) {
      this.resolvedViewCache = {
        activeDataId,
        canvasHeight,
        canvasWidth,
        data,
        frameOfReferenceUID,
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

  private getCurrentPresentation(): DerivedPlanarPresentation | undefined {
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
        this.getCachedPlanarCanvasDimensions(rendering);

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

  protected getReferenceViewContexts(): GenericViewportReferenceContext[] {
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

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isGenericViewportImageDisplaySet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}

export default PlanarViewport;
