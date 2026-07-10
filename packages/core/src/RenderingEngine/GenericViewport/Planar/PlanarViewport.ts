import {
  Events,
  OrientationAxis,
  RenderBackend,
  ViewportStatus,
  ViewportType,
  VOILUTFunctionType,
} from '../../../enums';
import { ActorRenderMode } from '../../../types';
import type {
  ActorEntry,
  ICamera,
  IImage,
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
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import triggerEvent from '../../../utilities/triggerEvent';
import eventTarget from '../../../eventTarget';
import getMinMax from '../../../utilities/getMinMax';
import renderingEngineCache from '../../renderingEngineCache';
import { getCameraVectors } from '../../helpers/getCameraVectors';
import type {
  LoadedData,
  ViewportDataBinding,
  ViewportDataReference,
} from '../ViewportArchitectureTypes';
import GenericViewport from '../GenericViewport';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import {
  getGenericViewportImageDisplaySet,
  isGenericViewportImageDisplaySet,
} from '../genericViewportDisplaySetAccess';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { createPlanarRenderPathResolver } from './PlanarRenderPathResolver';
import { defaultPlanarRenderPathDecisionService } from './PlanarRenderPathDecisionService';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import type { SelectedPlanarRenderPath } from './planarRenderPathSelector';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
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
import type { DerivedPlanarPresentation } from './planarRenderCamera';
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
} from './planarSliceBasis';
import type { PlanarRendering } from './planarRuntimeTypes';
import PlanarMountedData from './PlanarMountedData';
import PlanarViewReferenceController from './PlanarViewReferenceController';
export type { PlanarReferenceContext } from './PlanarViewReferenceController';
import type {
  PlanarViewState,
  PlanarDataPresentation,
  PlanarDataProvider,
  PlanarDisplayArea,
  PlanarEffectiveRenderMode,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
  PlanarViewportRenderContext,
  PlanarViewportInput,
  PlanarViewportInputOptions,
} from './PlanarViewportTypes';

type PlanarSetOrientationInput =
  | OrientationAxis.ACQUISITION
  | OrientationAxis.AXIAL
  | OrientationAxis.CORONAL
  | OrientationAxis.SAGITTAL
  | OrientationAxis.REFORMAT
  | OrientationAxis.AXIAL_REFORMAT
  | OrientationAxis.CORONAL_REFORMAT
  | OrientationAxis.SAGITTAL_REFORMAT
  | OrientationVectors;

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

type PlanarResetViewStateOptions = {
  resetPan?: boolean;
  resetZoom?: boolean;
  resetOrientation?: boolean;
  resetFlip?: boolean;
};

class PlanarViewport extends GenericViewport<
  PlanarViewState,
  PlanarDataPresentation,
  PlanarViewportRenderContext
> {
  readonly type = ViewportType.PLANAR_NEXT;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: PlanarViewportInputOptions;
  options: PlanarViewportInputOptions;
  suppressEvents = false;

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
  private renderPipelineSwapId = 0;
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

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return false;
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
    this.canvasToWorld = this.canvasToWorld.bind(this);
    this.worldToCanvas = this.worldToCanvas.bind(this);
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
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

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
    const requestId = ++this.setDataRequestId;
    const isStale = () => requestId !== this.setDataRequestId;

    this.clearResolvedViewCache();
    this.removeReplaceableData(entries);

    for (const [index, { displaySetId, options = {} }] of entries.entries()) {
      if (isStale()) {
        return;
      }

      const role = options.role ?? (index === 0 ? 'source' : 'overlay');
      await this.addDisplaySetInternal(
        displaySetId,
        {
          ...options,
          role,
        },
        isStale
      );
    }
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

  private async addDisplaySetInternal(
    dataId: string,
    options: PlanarSetDataOptions = {},
    shouldIgnore?: () => boolean
  ): Promise<void> {
    const role = this.mountedData.resolveBindingRole(options);
    const resolvedOptions: PlanarSetDataOptions = {
      ...options,
      role,
    };
    const { data, resolvedOrientation, selectedPath } =
      await this.loadPlanarData(dataId, resolvedOptions);

    if (shouldIgnore?.()) {
      return;
    }

    if (role === 'source') {
      this.mountedData.promoteSourceDataId(dataId);
      this.applyLoadedPlanarViewState(resolvedOrientation, data, selectedPath);
    }

    const added = await this.addLoadedData(
      dataId,
      data,
      {
        renderMode: selectedPath.renderMode,
        role,
      },
      shouldIgnore
    );

    if (!added) {
      return;
    }

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
   * Removes a dataset binding and clears the active data id when the
   * removed dataset was active.
   */
  removeData(dataId: string): void {
    this.clearResolvedViewCache();
    this.mountOptionsByDataId.delete(dataId);
    this.lastRenderPathErrorByDataId.delete(dataId);
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
    return this.mountedData.getDefaultActor();
  }

  /**
   * Retrieves an image actor from the viewport actors. Mirrors the legacy
   * Viewport.getImageActor so VOI/colorbar tooling that depends on it keeps
   * working on native PLANAR_NEXT viewports. CPU render paths (e.g. CPU stack
   * slice rendering) have no VTK image actor, so this returns null there and
   * callers fall back to a default range instead of throwing.
   *
   * @param volumeId - Optional id of the volume whose image actor is wanted.
   * @returns The image actor if present, otherwise null.
   */
  getImageActor(volumeId?: string): ImageActor | null {
    const actorEntries = this.getActors();

    let actorEntry = actorEntries[0];
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
   * PLANAR_NEXT viewports previously threw
   * `getDefaultImageData is not a function`. Returns undefined when no VTK image
   * actor is mounted (e.g. CPU render paths).
   */
  getDefaultImageData() {
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
   * Returns the active canvas element (CPU or VTK) based on render mode.
   */
  getCanvas(): HTMLCanvasElement {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode === ActorRenderMode.CPU_IMAGE ||
      rendering?.renderMode === ActorRenderMode.CPU_VOLUME
    ) {
      return this.renderContext.cpu.canvas;
    }

    return this.renderContext.vtk.canvas;
  }

  /**
   * Adds overlay images on top of the primary render path output.
   */
  async addImages(stackInputs: IStackInput[]): Promise<void> {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode !== ActorRenderMode.VTK_IMAGE &&
      rendering?.renderMode !== ActorRenderMode.VTK_VOLUME_SLICE &&
      rendering?.renderMode !== ActorRenderMode.CPU_IMAGE
    ) {
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
   *
   * @returns The volume id for the active dataset, if one exists.
   */
  getVolumeId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    return (
      this.viewReferences.getVolumeId(viewRefSpecifier) ??
      this.getPlanarData()?.volumeId
    );
  }

  getSourceDataId(): string | undefined {
    return this.mountedData.getActiveDataId();
  }

  /**
   * Content-true classification of the bound source data for a planar viewport.
   *
   * A `PLANAR_NEXT` viewport renders both image-id stacks and volume slices, so
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

    if (
      renderMode === ActorRenderMode.VTK_VOLUME ||
      renderMode === ActorRenderMode.VTK_VOLUME_SLICE ||
      renderMode === ActorRenderMode.CPU_VOLUME
    ) {
      return 'volume';
    }

    if (
      renderMode === ActorRenderMode.VTK_IMAGE ||
      renderMode === ActorRenderMode.CPU_IMAGE
    ) {
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
   * `setDisplaySetPresentation` change on a direct `PLANAR_NEXT` viewport. The
   * legacy compatibility adapter keeps emitting `COLORMAP_MODIFIED` through its
   * own path (which applies presentation via `setDataPresentationState`
   * directly, not through `mergeDataPresentation`), so this hook does not
   * double-fire for compatibility viewports.
   */
  protected notifyDataPresentationModified(
    displaySetId: string,
    props: Partial<PlanarDataPresentation>
  ): void {
    if (this.suppressEvents) {
      return;
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
      const range = props.voiRange ?? presentation?.voiRange;

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
        colormap: props.colormap,
        volumeId,
      });
    }
  }

  getDefaultVOIRange(dataId?: string): VOIRange | undefined {
    return this.mountedData.getDefaultVOIRange(dataId);
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
    return this.getCurrentImageIdIndex();
  }

  /**
   * Returns the number of navigable slices for the current source data.
   *
   * For image/stack content this is the number of image ids; for volume-slice
   * content it is the slice count along the current view direction. This is the
   * native equivalent of the legacy stack/volume `getNumberOfSlices()` and is
   * what `csUtils.jumpToSlice`, scroll, and image-slice synchronizers rely on
   * for a `PLANAR_NEXT` viewport (which is not a `StackViewport`, so it takes
   * the slice-count navigation branch).
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
   * Re-applies the calibrated pixel spacing for an image (CS-12). The native
   * counterpart of `StackViewport.calibrateSpacing`.
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

    const cpuImageData = this.getImageData() as
      | { calibration?: unknown; imageData?: unknown }
      | undefined;

    triggerEvent(this.element, Events.IMAGE_SPACING_CALIBRATED, {
      element: this.element,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      imageId,
      calibration: cpuImageData?.calibration,
      imageData: cpuImageData?.imageData,
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

  protected override setDataPresentationState(
    dataId: string,
    props: PlanarDataPresentation
  ): void {
    this.clearResolvedViewCache();
    super.setDataPresentationState(dataId, props);
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
   * legacy `BaseVolumeViewport.getImageData(volumeId?)` signature so
   * per-target consumers (eg annotation statistics) work on both.
   * @returns The image-data object, if exposed by the render path.
   */
  getImageData(volumeId?: string) {
    if (volumeId) {
      const dataId = this.findDataIdByVolumeId(volumeId);
      const binding = dataId ? this.getBinding(dataId) : undefined;
      const imageData = binding?.getImageData?.();
      if (imageData) {
        return imageData;
      }
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
   * resolving against the active binding's spatial metadata.
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
   * Returns whether the active dataset references the given volume id.
   *
   * @param volumeId - Volume id to compare against the active dataset.
   * @returns `true` when the active dataset references the given volume id.
   */
  hasVolumeId(volumeId: string): boolean {
    return this.getVolumeId() === volumeId;
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
   * @param viewRef - View reference to test.
   * @param options - Optional compatibility flags for the spatial check.
   * @returns `true` when the reference can be viewed in this viewport state.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return super.isReferenceViewable(viewRef, options);
  }

  /**
   * Sets the active image index and resolves the corresponding image id.
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

    if (
      rendering?.renderMode === ActorRenderMode.CPU_VOLUME ||
      rendering?.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
    ) {
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

    this.setViewState({
      slice: {
        kind: 'stackIndex',
        imageIdIndex: clampedImageIdIndex,
      },
    });

    return Promise.resolve(resolvedImageId);
  }

  /**
   * Scrolls by a signed image-index delta.
   *
   * @param delta - Signed number of images to move by.
   * @returns The resolved image id after scrolling.
   */
  scroll(delta: number): Promise<string> {
    return this.setImageIdIndex(this.getActiveImageIdIndex() + delta);
  }

  /**
   * Sets the planar orientation for volume-backed render modes.
   *
   * @param orientation - Target acquisition-aligned orientation.
   */
  setOrientation(orientation: PlanarSetOrientationInput): void {
    this.setViewState({ orientation: this.resolveSetOrientation(orientation) });
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
   * @param orientation - The orientation to test.
   * @param dataId - Optional display set id; defaults to the active source.
   * @returns `true` when the orientation can be rendered for the data.
   */
  canRenderOrientation(
    orientation: PlanarSetOrientationInput,
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

    return defaultPlanarRenderPathDecisionService.canRender(dataSet, {
      orientation: this.resolveSetOrientation(orientation),
    });
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
      nextCamera.orientation = this.resolveRequestedOrientation();
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
    // reapplies its defaults (mirrors PlanarLegacyCompatibilityController).
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
   * Returns whether this viewport bypasses the shared rendering pipeline.
   */
  getUseCustomRenderingPipeline(): boolean {
    return false;
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
   * Renders the active planar bindings or queues an engine-driven render.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    if (!this.bindings.size) {
      this.viewportStatus = ViewportStatus.NO_DATA;
      return;
    }

    this.setNeedsRender();
    this.renderContext.cpu.composition.renderPassId += 1;

    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  // ====================================================================
  // Protected & private
  // ====================================================================

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
   * Called by the global setRenderBackend()/setUseCPURendering() fan-out; the
   * rebuild is async but the hook itself is fire-and-forget by contract.
   */
  override updateRenderingPipeline(): void {
    void this.applyRenderingPipelineUpdate();
  }

  private async applyRenderingPipelineUpdate(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    const swapId = ++this.renderPipelineSwapId;
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

    for (const [dataId, binding] of orderedEntries) {
      if (isStale()) {
        return;
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
        });

        if (isStale() || this.bindings.get(dataId) !== binding) {
          continue;
        }

        if (selectedPath.renderMode === binding.rendering.renderMode) {
          continue;
        }

        const added = await this.addLoadedData(
          dataId,
          data,
          {
            renderMode: selectedPath.renderMode,
            role: binding.role,
          },
          () => isStale() || this.bindings.get(dataId) !== binding
        );

        changed = changed || added;
      } catch (error) {
        this.reportRenderPathError(error, dataId);
      }
    }

    if (isStale() || !changed) {
      return;
    }

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
    console.error('[PlanarViewport] Render path error', dataId ?? '', error);
    triggerEvent(eventTarget, Events.RENDER_PATH_ERROR, {
      renderingEngineId: this.renderingEngineId,
      viewportId: this.id,
      dataId,
      error,
    });
  }

  private requestRenderingEngineRender(): void {
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
    const useCPUCanvas =
      renderMode === ActorRenderMode.CPU_IMAGE ||
      renderMode === ActorRenderMode.CPU_VOLUME;
    const viewportElement = this.element.querySelector(
      '.viewport-element'
    ) as HTMLDivElement | null;

    cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
    cpuCanvas.style.pointerEvents = useCPUCanvas ? 'auto' : 'none';
    vtkCanvas.style.display = useCPUCanvas ? 'none' : '';

    if (viewportElement) {
      viewportElement.style.pointerEvents = useCPUCanvas ? 'none' : '';
    }
  }

  protected createLegacyCompatibilityHost() {
    return {
      getElement: () => this.element,
      getViewportId: () => this.id,
      getRequestedOrientation: () => this.resolveRequestedOrientation(),
      prepareVolumeCompatibilityCamera: () => {
        this.viewState = this.normalizeViewState({
          ...this.viewState,
          orientation: this.resolveRequestedOrientation(),
        });
      },
      setDisplaySets: (...entries) => this.setDisplaySets(...entries),
      setImageIdIndex: (imageIdIndex) => this.setImageIdIndex(imageIdIndex),
      getCurrentImageId: () => this.getCurrentImageId(),
      render: () => this.render(),
      removeBindingsExcept: (keepDataIds) =>
        this.removeBindingsExcept(keepDataIds),
      setCameraOrientation: (orientation) => {
        this.setViewState({
          orientation: this.resolveSetOrientation(
            orientation as PlanarSetOrientationInput
          ),
        });
      },
      setDataPresentationState: (dataId, presentation) => {
        this.setDataPresentationState(dataId, presentation);
      },
      setDisplaySetPresentation: (displaySetId, presentation) => {
        this.setDisplaySetPresentation(displaySetId, presentation);
      },
      getDisplaySetPresentation: (dataId) =>
        this.getDisplaySetPresentation(dataId),
      getCameraOrientation: () => this.viewState.orientation,
      getCurrentPlanarRendering: () => this.getCurrentPlanarRendering(),
      getActiveDataId: () => this.mountedData.getActiveDataId(),
      getFirstBoundDataId: () => this.mountedData.getFirstBoundDataId(),
      findDataIdByVolumeId: (volumeId) =>
        this.mountedData.findDataIdByVolumeId(volumeId),
      getBindingActor: (dataId) => this.mountedData.getBindingActor(dataId),
      getDefaultVOIRange: (dataId) => this.getDefaultVOIRange(dataId),
      getImageCount: () => this.getImageIds().length,
      getMaxImageIdIndex: () => this.getMaxImageIdIndex(),
    };
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

  private async loadPlanarData(
    dataId: string,
    options: PlanarSetDataOptions
  ): Promise<{
    data: LoadedData<PlanarPayload>;
    selectedPath: SelectedPlanarRenderPath;
    resolvedOrientation: PlanarViewState['orientation'];
  }> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewport] No registered planar dataset metadata for ${dataId}`
      );
    }

    const resolvedOrientation = this.resolveRequestedOrientation(
      options.orientation
    );
    const selectedPath = selectPlanarRenderPath(dataSet, {
      orientation: resolvedOrientation,
      // Per-mount backend pin/override. Overlays without an explicit pin
      // follow the source binding's mounted backend rather than the global
      // configuration; only then does the global renderBackend decide.
      renderBackend:
        options.renderBackend ??
        this.getInheritedOverlayRenderBackend(options.role),
    });
    const data = await (this.dataProvider as PlanarDataProvider).load(dataId, {
      acquisitionOrientation: selectedPath.acquisitionOrientation,
      orientation: resolvedOrientation,
      renderMode: selectedPath.renderMode,
      volumeId: selectedPath.volumeId,
    });

    return {
      data,
      selectedPath,
      resolvedOrientation,
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
  ): RenderBackend.GPU | RenderBackend.CPU | undefined {
    if (role === 'source') {
      return undefined;
    }

    switch (this.getCurrentPlanarRendering()?.renderMode) {
      case ActorRenderMode.CPU_IMAGE:
      case ActorRenderMode.CPU_VOLUME:
        return RenderBackend.CPU;
      case ActorRenderMode.VTK_IMAGE:
      case ActorRenderMode.VTK_VOLUME_SLICE:
        return RenderBackend.GPU;
      default:
        return undefined;
    }
  }

  private applyLoadedPlanarViewState(
    resolvedOrientation: PlanarViewState['orientation'],
    planarData: PlanarPayload,
    selectedPath: SelectedPlanarRenderPath
  ): void {
    const isVolumePath =
      selectedPath.renderMode === ActorRenderMode.CPU_VOLUME ||
      selectedPath.renderMode === ActorRenderMode.VTK_VOLUME_SLICE;
    const orientation = normalizePlanarOrientation(
      resolvedOrientation,
      selectedPath.acquisitionOrientation
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
      renderMode === ActorRenderMode.CPU_VOLUME
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

  private resolveRequestedOrientation(
    orientation?: PlanarSetDataOptions['orientation']
  ): PlanarViewState['orientation'] {
    return (
      clonePlanarOrientation(
        (orientation ??
          (this.defaultOptions
            .orientation as PlanarViewState['orientation'])) ||
          OrientationAxis.ACQUISITION
      ) || OrientationAxis.ACQUISITION
    );
  }

  private resolveSetOrientation(
    orientation: PlanarSetOrientationInput
  ): PlanarViewState['orientation'] {
    if (typeof orientation !== 'string') {
      return clonePlanarOrientation(orientation) || OrientationAxis.ACQUISITION;
    }

    if (!isReformatOrientation(orientation)) {
      return orientation as PlanarViewState['orientation'];
    }

    const baseOrientation = getBaseReformatOrientation(orientation);
    const cameraVectors = getCameraVectors(
      {
        getActors: () => this.getActors(),
        getCamera: () => this.getCameraForEvent(),
        getCurrentImageId: () => this.getCurrentImageId(),
        getImageIds: () => this.getImageIds(),
        type: ViewportType.ORTHOGRAPHIC,
      },
      {
        useViewportNormal: true,
        ...(baseOrientation ? { orientation: baseOrientation } : {}),
      }
    );

    if (cameraVectors) {
      return {
        viewPlaneNormal: cameraVectors.viewPlaneNormal,
        viewUp: cameraVectors.viewUp,
      };
    }

    return baseOrientation || this.viewState.orientation;
  }

  protected removeBindingsExcept(keepDataIds: Set<string>): void {
    this.mountedData.removeBindingsExcept(keepDataIds);
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
   * it lives here rather than on IGenericViewport.
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
  orientation: PlanarSetOrientationInput
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

function isReformatOrientation(
  orientation: PlanarSetOrientationInput
): boolean {
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
