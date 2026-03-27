import { vec3 } from 'gl-matrix';
import { OrientationAxis, ViewportType } from '../../../enums';
import type BlendModes from '../../../enums/BlendModes';
import type {
  ActorEntry,
  CPUIImageData,
  ICamera,
  IImage,
  IStackInput,
  IVolumeInput,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import cache from '../../../cache/cache';
import type { PlaneRestriction } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import getClosestImageId from '../../../utilities/getClosestImageId';
import imageIdToURI from '../../../utilities/imageIdToURI';
import isEqual from '../../../utilities/isEqual';
import { getImageDataMetadata } from '../../../utilities/getImageDataMetadata';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAddOptions, LoadedData } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportNext from '../ViewportNext';
import {
  getViewportNextImageDataSet,
  isViewportNextImageDataSet,
} from '../viewportNextDataSetAccess';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import { CpuImageSlicePath } from './CpuImageSliceRenderPath';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderPath';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderPath';
import { VtkVolumeSlicePath } from './VtkVolumeSliceRenderPath';
import {
  normalizePlanarOrientation,
  selectPlanarRenderPath,
} from './planarRenderPathSelector';
import type { SelectedPlanarRenderPath } from './planarRenderPathSelector';
import {
  clonePlanarOrientation,
  type PlanarLegacyViewportProperties,
} from './planarLegacyCompatibility';
import { normalizePlanarRotation } from './planarViewPresentation';
import {
  createDefaultPlanarCamera,
  normalizePlanarCamera,
} from './planarViewportCamera';
import {
  createPlanarCpuImageOverlayActorEntry,
  createPlanarImageOverlayActorEntry,
} from './planarActorCompatibility';
import {
  canvasToWorldPlanarCpuImage,
  worldToCanvasPlanarCpuImage,
} from './planarCpuImageTransforms';
import type { DerivedPlanarPresentation } from './planarRenderCamera';
import {
  getPlanarCameraCanvasDimensions,
  computePlanarViewportCamera,
} from './PlanarComputedCamera';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
  isPlanarReferenceViewable,
} from './planarViewReference';
import type { PlanarRendering } from './planarRuntimeTypes';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarDataProvider,
  PlanarEffectiveRenderMode,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
  PlanarViewportRenderContext,
  PlanarViewportInput,
} from './PlanarViewportTypes';
import { resolvePlanarViewportRenderMode } from './resolvePlanarViewportRenderMode';

defaultRenderPathResolver.register(new CpuImageSlicePath());
defaultRenderPathResolver.register(new CpuVolumeSlicePath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeSlicePath());

type PlanarReferenceContext = {
  dataId: string;
  data: LoadedData<PlanarPayload>;
  frameOfReferenceUID: string;
  rendering: PlanarRendering;
};

class PlanarViewport extends ViewportNext<
  PlanarCamera,
  PlanarDataPresentation,
  PlanarViewportRenderContext
> {
  readonly type = ViewportType.PLANAR_V2;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  suppressEvents = false;

  protected renderContext: PlanarViewportRenderContext;

  private activeDataId?: string;
  private readonly lockedRenderMode: PlanarEffectiveRenderMode;
  private readonly compatibilityOverlayActors = new Map<string, ActorEntry>();
  private cpuCanvas?: HTMLCanvasElement;
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController({
      getElement: () => this.element,
      getViewportId: () => this.id,
      getRequestedOrientation: () => this.resolveRequestedOrientation(),
      prepareVolumeCompatibilityCamera: () => {
        this.camera = this.normalizeCamera({
          ...this.camera,
          imageIdIndex: undefined,
          orientation: this.resolveRequestedOrientation(),
        });
      },
      setData: (dataId, options) => this.setData(dataId, options),
      setDataList: (entries) => this.setDataList(entries),
      setImageIdIndex: (imageIdIndex) => this.setImageIdIndex(imageIdIndex),
      getCurrentImageId: () => this.getCurrentImageId(),
      render: () => this.render(),
      removeBindingsExcept: (keepDataIds) =>
        this.removeBindingsExcept(keepDataIds),
      setCameraOrientation: (orientation) => {
        this.setCamera({ orientation });
      },
      setDataPresentationState: (dataId, presentation) => {
        this.setDataPresentationState(dataId, presentation);
      },
      setDataPresentation: (dataId, presentation) => {
        this.setDataPresentation(dataId, presentation);
      },
      getDataPresentation: (dataId) => this.getDataPresentation(dataId),
      getCameraOrientation: () => this.camera.orientation,
      getCurrentPlanarRendering: () => this.getCurrentPlanarRendering(),
      getActiveDataId: () => this.activeDataId,
      getFirstBoundDataId: () => this.bindings.keys().next().value,
      findDataIdByVolumeId: (volumeId) => this.findDataIdByVolumeId(volumeId),
      getBindingActor: (dataId) => {
        const rendering = this.getBinding(dataId)?.rendering as
          | { actor?: unknown; compatibilityActor?: unknown }
          | undefined;

        return rendering?.actor ?? rendering?.compatibilityActor;
      },
      getImageCount: () => this.getImageIds().length,
      getMaxImageIdIndex: () => this.getMaxImageIdIndex(),
    });

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: PlanarViewportInput) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = args.defaultOptions || {};
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.canvasToWorld = this.canvasToWorld.bind(this);
    this.worldToCanvas = this.worldToCanvas.bind(this);
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.lockedRenderMode = resolvePlanarViewportRenderMode({
      orientation: this.defaultOptions.orientation as
        | PlanarSetDataOptions['orientation']
        | null,
      renderMode: this.defaultOptions.renderMode,
    });

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[PlanarViewport] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

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
        getActiveDataId: () => this.activeDataId,
        getCameraState: () => this.getCameraState(),
        isCurrentDataId: (dataId) =>
          this.getCurrentBinding()?.data.id === dataId,
        getOverlayActors: () =>
          Array.from(this.compatibilityOverlayActors.values()),
      },
      renderPath: {
        renderMode: this.lockedRenderMode,
      },
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
        renderNow: () => {
          this.render();
        },
        activateRenderMode: (renderMode: PlanarEffectiveRenderMode) => {
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
    this.camera = normalizePlanarCamera({
      ...createDefaultPlanarCamera(),
      orientation: this.resolveRequestedOrientation(),
    });
    this.setRenderModeVisibility(this.lockedRenderMode, cpuCanvas, vtkCanvas);

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
   * Adds one or more logical planar datasets to the viewport.
   *
   * @param entries - List of datasets to add, each with its own options for
   * render-mode and orientation resolution.
   * @returns Rendering ids in the same order as the provided entries.
   */
  async setDataList(
    entries: Array<{ dataId: string; options?: PlanarSetDataOptions }>
  ): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const { dataId, options = {} } of entries) {
      const renderingId = await this.setData(dataId, options);
      renderingIds.push(renderingId);
    }

    if (entries[0]) {
      this.activeDataId = entries[0].dataId;
      this.updateBindingsCameraState();
    }

    return renderingIds;
  }

  /**
   * Adds a single logical planar dataset.
   *
   * @param dataId - Logical dataset id to add.
   * @param options - Render-mode and orientation options used while resolving
   * the effective planar render path.
   * @returns The rendering id created for the mounted dataset.
   */
  async setData(
    dataId: string,
    options: PlanarSetDataOptions | DataAddOptions = {}
  ): Promise<string> {
    const planarOptions = options as PlanarSetDataOptions;
    const { data, resolvedOrientation, selectedPath } =
      await this.loadPlanarData(dataId, planarOptions);

    this.activeDataId = dataId;
    this.applyLoadedPlanarCamera(resolvedOrientation, data, selectedPath);

    const renderingId = await this.addLoadedData(dataId, data, {
      renderMode: selectedPath.renderMode,
    });

    this.setDefaultDataPresentation(dataId, {
      visible: true,
    });

    return renderingId;
  }

  /**
   * Removes a dataset binding and clears the active data id when the
   * removed dataset was active.
   */
  removeData(dataId: string): void {
    super.removeData(dataId);

    if (this.activeDataId === dataId) {
      this.activeDataId = undefined;
    }

    if (!this.isDestroyed && this.getCurrentBinding()) {
      this.updateBindingsCameraState();
    }

    this.legacyCompatibility.removeData(dataId);
  }

  // ====================================================================
  // Public API -- legacy compatibility (deprecated)
  // ====================================================================

  /** @deprecated Legacy shim for `setStack(...)`. */
  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    return this.legacyCompatibility.setStack(imageIds, currentImageIdIndex);
  }

  /** @deprecated Legacy shim for `setVolumes(...)`. */
  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.setVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /** @deprecated Legacy shim for `addVolumes(...)`. */
  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.addVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /** @deprecated Legacy shim for `setProperties(...)`. */
  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    this.legacyCompatibility.setProperties(
      properties,
      volumeIdOrSuppressEvents,
      suppressEvents
    );
  }

  /** @deprecated Legacy shim for `getProperties(...)`. */
  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    return this.legacyCompatibility.getProperties(volumeId);
  }

  /** @deprecated Legacy shim for `resetProperties(...)`. */
  resetProperties(volumeId?: string): void {
    this.legacyCompatibility.resetProperties(volumeId);
  }

  /** @deprecated Legacy shim for `getBlendMode(...)`. */
  getBlendMode(filterActorUIDs?: string[]): BlendModes | undefined {
    return this.legacyCompatibility.getBlendMode(filterActorUIDs);
  }

  /** @deprecated Legacy shim for `setBlendMode(...)`. */
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate = false
  ): void {
    this.legacyCompatibility.setBlendMode(
      blendMode,
      filterActorUIDs,
      immediate
    );
  }

  /** @deprecated Legacy shim for `getNumberOfSlices()`. */
  getNumberOfSlices(): number {
    return this.legacyCompatibility.getNumberOfSlices();
  }

  // ====================================================================
  // Public API -- actors (legacy interop)
  // ====================================================================

  /**
   * Returns all actor entries from both bindings and overlay actors.
   */
  getActors(): ActorEntry[] {
    return [
      ...this.getProjectedBindingActorEntries(),
      ...this.compatibilityOverlayActors.values(),
    ];
  }

  /**
   * Returns the primary actor entry for the viewport.
   */
  getDefaultActor(): ActorEntry | undefined {
    const bindingActors = this.getProjectedBindingActorEntries();
    const primaryBindingActor = bindingActors.find(
      (actorEntry) => typeof actorEntry.representationUID !== 'string'
    );

    if (primaryBindingActor) {
      return primaryBindingActor;
    }

    if (bindingActors[0]) {
      return bindingActors[0];
    }

    return this.compatibilityOverlayActors.values().next().value;
  }

  /**
   * Returns a specific actor entry by its UID.
   */
  getActor(actorUID: string): ActorEntry | undefined {
    return this.getActors().find((actorEntry) => actorEntry.uid === actorUID);
  }

  /**
   * Renders a single image object by setting it as a one-image stack.
   */
  renderImageObject(image: IImage): Promise<string> {
    return this.setStack([image.imageId], 0);
  }

  /**
   * Returns the active canvas element (CPU or VTK) based on render mode.
   */
  getCanvas(): HTMLCanvasElement {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode === 'cpu2d' ||
      rendering?.renderMode === 'cpuVolume'
    ) {
      return this.renderContext.cpu.canvas;
    }

    return this.renderContext.vtk.canvas;
  }

  /**
   * Removes actors by UID from both overlay actors and data bindings.
   */
  removeActors(actorUIDs: string[]): void {
    let didRemoveActor = false;

    actorUIDs
      .filter((actorUID): actorUID is string => typeof actorUID === 'string')
      .forEach((actorUID) => {
        const overlayActorEntry = this.compatibilityOverlayActors.get(actorUID);

        if (overlayActorEntry) {
          if (overlayActorEntry.actorMapper?.renderMode === 'vtkImage') {
            this.renderContext.vtk.renderer.removeActor(
              overlayActorEntry.actor as never
            );
          }
          this.compatibilityOverlayActors.delete(actorUID);
          didRemoveActor = true;
          return;
        }

        const bindingDataId = this.findBindingDataIdByActorUID(actorUID);

        if (bindingDataId) {
          this.removeData(bindingDataId);
          didRemoveActor = true;
        }
      });

    if (didRemoveActor) {
      this.render();
    }
  }

  /**
   * Adds overlay images on top of the primary render path output.
   */
  addImages(stackInputs: IStackInput[]): void {
    const rendering = this.getCurrentPlanarRendering();

    if (
      rendering?.renderMode !== 'vtkImage' &&
      rendering?.renderMode !== 'cpu2d'
    ) {
      return;
    }

    stackInputs.forEach((stackInput) => {
      const image = cache.getImage(stackInput.imageId);

      if (!image) {
        return;
      }

      const actorEntry =
        rendering.renderMode === 'cpu2d'
          ? createPlanarCpuImageOverlayActorEntry(
              this as never,
              image,
              stackInput
            )
          : createPlanarImageOverlayActorEntry(image, stackInput);
      const existingActorEntry = this.compatibilityOverlayActors.get(
        actorEntry.uid
      );

      if (existingActorEntry?.actorMapper?.renderMode === 'vtkImage') {
        this.renderContext.vtk.renderer.removeActor(
          existingActorEntry.actor as never
        );
      }

      if (stackInput.callback) {
        stackInput.callback({
          imageActor: actorEntry.actor as never,
          imageId: stackInput.imageId,
        });
      }

      if (actorEntry.actorMapper?.renderMode === 'vtkImage') {
        this.renderContext.vtk.renderer.addActor(actorEntry.actor as never);
      }
      this.compatibilityOverlayActors.set(actorEntry.uid, actorEntry);
    });

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
      this.getPlanarReferenceContext(viewRefSpecifier)?.data.volumeId ??
      this.getPlanarData()?.volumeId
    );
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
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarReferencedImageId({
      camera: this.camera,
      data: referenceContext?.data,
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Alias for `getCurrentImageIdIndex` used by legacy stack-style callers.
   *
   * @returns The current zero-based image index.
   */
  getSliceIndex(): number {
    return this.getCurrentImageIdIndex();
  }

  // ====================================================================
  // Public API -- camera & navigation
  // ====================================================================

  protected normalizeCamera(camera: PlanarCamera): PlanarCamera {
    return normalizePlanarCamera(camera);
  }

  /**
   * Returns the current rotation angle in degrees.
   */
  getRotation(): number {
    return (
      this.getComputedCamera()?.rotation ??
      normalizePlanarRotation(this.camera.rotation)
    );
  }

  /**
   * Returns the current world-space anchor point when one is set.
   */
  getAnchorWorld(): Point3 | undefined {
    const anchorWorld = this.camera.anchorWorld;

    return anchorWorld ? ([...anchorWorld] as Point3) : undefined;
  }

  /**
   * Sets or clears the world-space anchor point.
   */
  setAnchorWorld(point?: Point3): void {
    this.setCamera({
      anchorWorld: point ? ([...point] as Point3) : undefined,
    });
  }

  /** @deprecated Legacy shim for `getZoom()`. */
  getZoom(): number {
    return (
      this.getComputedCamera()?.zoom ?? Math.max(this.camera.scale ?? 1, 0.001)
    );
  }

  /** @deprecated Legacy shim for `setZoom(...)`. */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      this.applyComputedCameraState(
        computedCamera.withZoom(zoom, canvasPoint).state.camera
      );
      return;
    }

    if (canvasPoint) {
      this.setScaleAtCanvasPoint(zoom, canvasPoint);
      return;
    }

    this.setCamera({
      scale: Math.max(zoom, 0.001),
      scaleMode: 'fit',
    });
  }

  /** @deprecated Legacy shim for `getPan()`. */
  getPan(): Point2 {
    const computedCamera = this.getComputedCamera();

    return computedCamera ? computedCamera.pan : [0, 0];
  }

  /** @deprecated Legacy shim for `setPan(...)`. */
  setPan(nextPan: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      this.applyComputedCameraState(
        computedCamera.withPan(nextPan).state.camera
      );
      return;
    }

    const currentPan = this.getPan();
    const [ax, ay] = this.camera.anchorCanvas ?? [0.5, 0.5];
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();
    const deltaX = nextPan[0] - currentPan[0];
    const deltaY = nextPan[1] - currentPan[1];

    this.setCamera({
      anchorCanvas: [
        ax + deltaX / Math.max(canvasWidth, 1),
        ay + deltaY / Math.max(canvasHeight, 1),
      ],
    });
  }

  /**
   * Sets the zoom scale anchored to a specific canvas point.
   */
  setScaleAtCanvasPoint(scale: number, canvasPoint: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      this.applyComputedCameraState(
        computedCamera.withZoom(scale, canvasPoint).state.camera
      );
      return;
    }

    const worldPoint = this.buildFallbackCanvasToWorld(canvasPoint);
    const { height: canvasHeight, width: canvasWidth } =
      this.getCurrentCanvasDimensions();

    this.setCamera({
      anchorWorld: worldPoint,
      anchorCanvas: [
        canvasPoint[0] / Math.max(canvasWidth, 1),
        canvasPoint[1] / Math.max(canvasHeight, 1),
      ],
      scale: Math.max(scale, 0.001),
      scaleMode: 'fit',
    });
  }

  /**
   * Returns the current camera state merged with the legacy ICamera
   * projection for interop.
   */
  getCamera(): PlanarCamera & ICamera {
    return {
      ...this.camera,
      ...this.getCameraForEvent(),
    };
  }

  /**
   * Returns the raw planar camera state without the legacy ICamera merge.
   */
  getCameraState(): PlanarCamera {
    return {
      ...this.camera,
    };
  }

  /**
   * Returns the computed camera snapshot that resolves the raw camera
   * state against the current render context and data geometry.
   */
  getComputedCamera(
    args: {
      frameOfReferenceUID?: string;
      sliceIndex?: number;
    } = {}
  ) {
    return computePlanarViewportCamera({
      camera: this.camera,
      data: this.getPlanarData(),
      frameOfReferenceUID:
        args.frameOfReferenceUID ?? this.resolveFrameOfReferenceUID(),
      renderContext: this.renderContext,
      rendering: this.getCurrentPlanarRendering(),
      sliceIndex: args.sliceIndex,
    });
  }

  /**
   * Returns the current planar view-presentation snapshot.
   *
   * @param viewPresSel - Selector describing which presentation fields to
   * populate in the returned object.
   * @returns The selected planar view-presentation fields.
   */
  getViewPresentation(
    viewPresSel: ViewPresentationSelector = {
      rotation: true,
      displayArea: true,
      zoom: true,
      pan: true,
      flipHorizontal: true,
      flipVertical: true,
    }
  ): ViewPresentation {
    const target: ViewPresentation = {};
    const { rotation, displayArea, zoom, pan, flipHorizontal, flipVertical } =
      viewPresSel;
    const currentZoom = this.getZoom();

    if (rotation) {
      target.rotation = this.getRotation();
    }

    if (displayArea) {
      target.displayArea = undefined;
    }

    if (zoom) {
      target.zoom = currentZoom;
    }

    if (pan) {
      const currentPan = this.getPan();

      target.pan = [currentPan[0] / currentZoom, currentPan[1] / currentZoom];
    }

    if (flipHorizontal) {
      target.flipHorizontal = this.camera.flipHorizontal ?? false;
    }

    if (flipVertical) {
      target.flipVertical = this.camera.flipVertical ?? false;
    }

    return target;
  }

  /**
   * Applies view-presentation values such as pan, zoom, and rotation.
   *
   * @param viewPres - View-presentation values to apply to the viewport.
   */
  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const {
      pan,
      rotation = this.getRotation(),
      zoom = this.getZoom(),
      flipHorizontal = this.camera.flipHorizontal ?? false,
      flipVertical = this.camera.flipVertical ?? false,
    } = viewPres;
    const nextZoom = Math.max(zoom, 0.001);

    this.setCamera({
      flipHorizontal,
      flipVertical,
      rotation,
      scale: nextZoom,
      scaleMode: 'fit',
    });

    if (pan) {
      this.setPan([pan[0] * nextZoom, pan[1] * nextZoom]);
    }
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
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReference({
      camera: this.camera,
      frameOfReferenceUID:
        referenceContext?.frameOfReferenceUID ?? this.getFrameOfReferenceUID(),
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Builds a stable id for the current view reference.
   *
   * @param viewRefSpecifier - Optional fields that refine the produced
   * reference id.
   * @returns A stable identifier for the current planar reference state.
   */
  getViewReferenceId(viewRefSpecifier: ViewReferenceSpecifier = {}): string {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReferenceId({
      camera: this.camera,
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
  }

  /**
   * Applies a view reference by activating the matching binding and
   * navigating to the referenced slice.
   */
  setViewReference(viewRef: ViewReference): void {
    if (!viewRef) {
      return;
    }

    const targetContext = this.resolveViewReferenceContext(viewRef);

    if (!targetContext) {
      return;
    }

    const didActivateBinding = this.activatePlanarReferenceContext(
      targetContext.dataId
    );
    const didApplyReference = this.applyViewReferenceToCurrentBinding(viewRef);

    if (didActivateBinding && !didApplyReference) {
      this.render();
    }
  }

  /**
   * Returns the active image-data object when the current render path exposes
   * one.
   *
   * @returns The active image-data object, if exposed by the render path.
   */
  getImageData() {
    return this.getCurrentBinding()?.getImageData?.();
  }

  // ====================================================================
  // Public API -- coordinate transforms
  // ====================================================================

  /**
   * Converts canvas-space to world-space. Uses the CPU image transform
   * when in CPU render mode, otherwise delegates to the computed camera.
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering?.renderMode === 'cpu2d') {
      const imageData = this.getImageData() as CPUIImageData | undefined;

      if (imageData) {
        return canvasToWorldPlanarCpuImage(
          rendering.enabledElement,
          imageData,
          canvasPos
        );
      }
    }

    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      return this.buildFallbackCanvasToWorld(canvasPos);
    }

    return computedCamera.canvasToWorld(canvasPos);
  }

  /**
   * Converts world-space to canvas-space. Uses the CPU image transform
   * when in CPU render mode, otherwise delegates to the computed camera.
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering?.renderMode === 'cpu2d') {
      const imageData = this.getImageData() as CPUIImageData | undefined;

      if (imageData) {
        return worldToCanvasPlanarCpuImage(
          rendering.enabledElement,
          imageData,
          worldPos
        );
      }
    }

    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      return this.buildFallbackWorldToCanvas(worldPos);
    }

    return computedCamera.worldToCanvas(worldPos);
  }

  /**
   * Returns the frame of reference UID from the computed camera,
   * resolving against the active binding's spatial metadata.
   */
  override getFrameOfReferenceUID(): string {
    return (
      this.getComputedCamera({
        frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      })?.getFrameOfReferenceUID() ?? this.resolveFrameOfReferenceUID()
    );
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
    return isPlanarPlaneViewable({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      options,
      planeRestriction,
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
    });
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
    const currentReferenceContext = this.getCurrentPlanarReferenceContext();

    if (
      currentReferenceContext &&
      this.isReferenceViewableInContext(
        currentReferenceContext,
        viewRef,
        options
      )
    ) {
      return true;
    }

    for (const referenceContext of this.getAllPlanarReferenceContexts()) {
      if (referenceContext.dataId === currentReferenceContext?.dataId) {
        continue;
      }

      if (
        this.isReferenceViewableInContext(referenceContext, viewRef, options)
      ) {
        return true;
      }
    }

    return false;
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

    this.setCamera({
      imageIdIndex: clampedImageIdIndex,
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
  setOrientation(
    orientation:
      | OrientationAxis.AXIAL
      | OrientationAxis.CORONAL
      | OrientationAxis.SAGITTAL
  ): void {
    this.setCamera({ orientation });
  }

  /**
   * Resets rotation and optionally resets pan and zoom.
   *
   * @param options - Flags controlling whether pan and zoom are reset.
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCamera(options?: { resetPan?: boolean; resetZoom?: boolean }): boolean {
    const { resetPan = true, resetZoom = true } = options || {};
    this.setCamera({
      ...(resetPan
        ? {
            anchorWorld: undefined,
            anchorCanvas: [0.5, 0.5] as [number, number],
          }
        : {}),
      ...(resetZoom ? { scale: 1, scaleMode: 'fit' as const } : {}),
      rotation: 0,
    });
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Resets camera state after a resize using the same behavior as
   * `resetCamera`.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCameraForResize(): boolean {
    return this.resetCamera();
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
    // no-op
  }

  /**
   * Resizes the internal CPU canvas and notifies active render bindings.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

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

    this.renderContext.cpu.composition.renderPassId += 1;

    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  // ====================================================================
  // Protected & private
  // ====================================================================

  protected override onDestroy(): void {
    this.legacyCompatibility.destroy();
    this.compatibilityOverlayActors.forEach((actorEntry) => {
      if (actorEntry.actorMapper?.renderMode === 'vtkImage') {
        this.renderContext.vtk.renderer.removeActor(actorEntry.actor as never);
      }
    });
    this.compatibilityOverlayActors.clear();
    this.cpuCanvas?.remove();
    this.cpuCanvas = undefined;
    this.activeDataId = undefined;
    this.renderContext.renderPath.renderCamera = undefined;
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
    const useCPUCanvas = renderMode === 'cpu2d' || renderMode === 'cpuVolume';
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

  private updateBindingsCameraState(): void {
    const currentBinding = this.getCurrentBinding();

    if (currentBinding) {
      currentBinding.updateCamera(this.camera);
    } else {
      this.renderContext.renderPath.renderCamera = undefined;
    }

    this.forEachBinding((binding) => {
      if (binding !== currentBinding) {
        binding.updateCamera(this.camera);
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
    const currentImageIdIndex = (
      binding?.rendering as { currentImageIdIndex?: number } | undefined
    )?.currentImageIdIndex;

    if (typeof currentImageIdIndex === 'number') {
      return currentImageIdIndex;
    }

    return this.camera.imageIdIndex ?? 0;
  }

  private getMaxImageIdIndex(): number {
    const binding = this.getCurrentBinding();
    const maxImageIdIndex = (
      binding?.rendering as { maxImageIdIndex?: number } | undefined
    )?.maxImageIdIndex;

    if (typeof maxImageIdIndex === 'number') {
      return maxImageIdIndex;
    }

    return Math.max(0, this.getImageIds().length - 1);
  }

  private getPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentPlanarData();
  }

  protected getCurrentBinding() {
    if (this.activeDataId) {
      return this.getBinding(this.activeDataId) ?? this.getFirstBinding();
    }

    return this.getFirstBinding();
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getViewportNextImageDataSet(dataId);

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
    resolvedOrientation: PlanarCamera['orientation'];
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
    if (
      options.renderMode !== undefined &&
      options.renderMode !== this.lockedRenderMode
    ) {
      throw new Error(
        `[PlanarViewport] Viewport ${this.id} is locked to ${this.lockedRenderMode}; cannot add ${dataId} as ${options.renderMode}`
      );
    }
    const selectedPath = selectPlanarRenderPath(dataSet, {
      orientation: resolvedOrientation,
      renderMode: this.lockedRenderMode,
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

  private applyLoadedPlanarCamera(
    resolvedOrientation: PlanarCamera['orientation'],
    planarData: PlanarPayload,
    selectedPath: SelectedPlanarRenderPath
  ): void {
    const isVolumePath =
      selectedPath.renderMode === 'cpuVolume' ||
      selectedPath.renderMode === 'vtkVolumeSlice';
    const imageIdIndex = isVolumePath
      ? undefined
      : planarData.initialImageIdIndex;

    this.camera = this.normalizeCamera({
      ...this.camera,
      imageIdIndex,
      orientation: normalizePlanarOrientation(
        resolvedOrientation,
        selectedPath.acquisitionOrientation
      ),
    });
  }

  private resolveRequestedOrientation(
    orientation?: PlanarSetDataOptions['orientation']
  ): PlanarCamera['orientation'] {
    return (
      clonePlanarOrientation(
        (orientation ??
          (this.defaultOptions.orientation as PlanarCamera['orientation'])) ||
          OrientationAxis.ACQUISITION
      ) || OrientationAxis.ACQUISITION
    );
  }

  private removeBindingsExcept(keepDataIds: Set<string>): void {
    for (const dataId of Array.from(this.bindings.keys())) {
      if (!keepDataIds.has(dataId)) {
        this.removeData(dataId);
      }
    }
  }

  private getProjectedBindingActorEntries(): ActorEntry[] {
    const actorEntries: ActorEntry[] = [];

    for (const binding of this.bindings.values()) {
      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry) {
        actorEntries.push(actorEntry);
      }
    }

    return actorEntries;
  }

  private findBindingDataIdByActorUID(actorUID: string): string | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const actorEntry = binding.getActorEntry?.(binding.data);

      if (actorEntry?.uid === actorUID) {
        return dataId;
      }
    }
  }

  private findDataIdByVolumeId(volumeId: string): string | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const bindingVolumeId = (
        binding.data as LoadedData<PlanarPayload> | undefined
      )?.volumeId;

      if (bindingVolumeId === volumeId) {
        return dataId;
      }
    }
  }

  private getCurrentPlanarRendering(): PlanarRendering | undefined {
    return this.getCurrentBinding()?.rendering as PlanarRendering | undefined;
  }

  private resolveFrameOfReferenceUID(): string {
    const binding = this.getCurrentBinding();

    return (
      binding?.getFrameOfReferenceUID() ?? `${this.type}-viewport-${this.id}`
    );
  }

  private buildFallbackCanvasToWorld(canvasPos: Point2): Point3 {
    const anchorCanvas = this.camera.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.camera.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const scale = Math.max(this.camera.scale ?? 1, 0.001);

    return [
      anchorWorld[0] + (canvasPos[0] - anchorCanvas[0] * width) / scale,
      anchorWorld[1] + (canvasPos[1] - anchorCanvas[1] * height) / scale,
      anchorWorld[2],
    ];
  }

  private buildFallbackWorldToCanvas(worldPos: Point3): Point2 {
    const anchorCanvas = this.camera.anchorCanvas ?? [0.5, 0.5];
    const anchorWorld = this.camera.anchorWorld ?? [0, 0, 0];
    const { height, width } = this.getCurrentCanvasDimensions();
    const scale = Math.max(this.camera.scale ?? 1, 0.001);

    return [
      (worldPos[0] - anchorWorld[0]) * scale + anchorCanvas[0] * width,
      (worldPos[1] - anchorWorld[1]) * scale + anchorCanvas[1] * height,
    ];
  }

  private applyComputedCameraState(nextCamera: PlanarCamera): void {
    const previousCamera = this.getCameraForEvent();

    this.camera = this.normalizeCamera(nextCamera);
    this.modified(previousCamera);
  }

  protected getCameraForEvent(): ICamera {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      return computedCamera.toICamera();
    }

    return {
      parallelProjection: true,
      focalPoint: [0, 0, 0],
      position: [0, 0, 1],
      parallelScale: 1,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
    };
  }

  private getCurrentPresentation(): DerivedPlanarPresentation | undefined {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      return;
    }

    return {
      flipHorizontal: computedCamera.state.camera.flipHorizontal === true,
      flipVertical: computedCamera.state.camera.flipVertical === true,
      pan: computedCamera.pan,
      rotation: computedCamera.rotation,
      zoom: computedCamera.zoom,
    };
  }

  private getCurrentCanvasDimensions(): { width: number; height: number } {
    const rendering = this.getCurrentPlanarRendering();

    if (rendering) {
      const { canvasHeight, canvasWidth } = getPlanarCameraCanvasDimensions({
        renderContext: this.renderContext,
        rendering,
      });

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

  private getCurrentPlanarReferenceContext():
    | PlanarReferenceContext
    | undefined {
    if (this.activeDataId) {
      const activeContext = this.getPlanarReferenceContextByDataId(
        this.activeDataId
      );

      if (activeContext) {
        return activeContext;
      }
    }

    for (const [dataId] of this.bindings.entries()) {
      return this.getPlanarReferenceContextByDataId(dataId);
    }
  }

  private getPlanarReferenceContext(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): PlanarReferenceContext | undefined {
    if (viewRefSpecifier.volumeId) {
      return (
        this.findPlanarReferenceContextByVolumeId(viewRefSpecifier.volumeId) ??
        this.getCurrentPlanarReferenceContext()
      );
    }

    return this.getCurrentPlanarReferenceContext();
  }

  private getPlanarReferenceContextByDataId(
    dataId: string
  ): PlanarReferenceContext | undefined {
    const binding = this.getBinding(dataId);

    if (!binding) {
      return;
    }

    return {
      dataId,
      data: binding.data as LoadedData<PlanarPayload>,
      frameOfReferenceUID:
        binding.getFrameOfReferenceUID() ?? `${this.type}-viewport-${this.id}`,
      rendering: binding.rendering as PlanarRendering,
    };
  }

  private getAllPlanarReferenceContexts(): PlanarReferenceContext[] {
    const contexts: PlanarReferenceContext[] = [];

    for (const [dataId] of this.bindings.entries()) {
      const referenceContext = this.getPlanarReferenceContextByDataId(dataId);

      if (referenceContext) {
        contexts.push(referenceContext);
      }
    }

    return contexts;
  }

  private findPlanarReferenceContextByVolumeId(
    volumeId: string
  ): PlanarReferenceContext | undefined {
    for (const [dataId, binding] of this.bindings.entries()) {
      const bindingData = binding.data as LoadedData<PlanarPayload>;

      if (bindingData.volumeId === volumeId) {
        return this.getPlanarReferenceContextByDataId(dataId);
      }
    }
  }

  private findPlanarReferenceContextByImageReference(
    referencedImageId?: string,
    referencedImageURI?: string
  ): PlanarReferenceContext | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    for (const referenceContext of this.getAllPlanarReferenceContexts()) {
      if (
        this.getImageIdsForReferenceContext(referenceContext).some(
          (imageId) => imageIdToURI(imageId) === targetImageURI
        )
      ) {
        return referenceContext;
      }
    }
  }

  private resolveViewReferenceContext(
    viewRef: ViewReference
  ): PlanarReferenceContext | undefined {
    if (viewRef.volumeId) {
      const volumeContext = this.findPlanarReferenceContextByVolumeId(
        viewRef.volumeId
      );

      if (volumeContext) {
        return volumeContext;
      }
    }

    const imageContext = this.findPlanarReferenceContextByImageReference(
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (imageContext) {
      return imageContext;
    }

    const currentReferenceContext = this.getCurrentPlanarReferenceContext();

    if (
      viewRef.FrameOfReferenceUID &&
      currentReferenceContext?.frameOfReferenceUID !==
        viewRef.FrameOfReferenceUID
    ) {
      return;
    }

    return currentReferenceContext;
  }

  private activatePlanarReferenceContext(dataId: string): boolean {
    if (this.activeDataId === dataId) {
      return false;
    }

    this.activeDataId = dataId;
    this.updateBindingsCameraState();

    return true;
  }

  private applyViewReferenceToCurrentBinding(viewRef: ViewReference): boolean {
    const referenceContext = this.getCurrentPlanarReferenceContext();

    if (
      !referenceContext ||
      (viewRef.FrameOfReferenceUID &&
        referenceContext.frameOfReferenceUID !== viewRef.FrameOfReferenceUID)
    ) {
      return false;
    }

    const { rendering } = referenceContext;

    if (
      rendering.renderMode === 'cpu2d' ||
      rendering.renderMode === 'vtkImage'
    ) {
      return this.applyImageViewReference(referenceContext, viewRef);
    }

    return this.applyVolumeViewReference(referenceContext, viewRef);
  }

  private applyImageViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      this.setImageIdIndex(referencedImageIndex);
      return true;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      this.setImageIdIndex(viewRef.sliceIndex);
      return true;
    }

    return false;
  }

  private applyVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const normalizedViewRef = this.normalizeVolumeViewReference(
      referenceContext,
      viewRef
    );
    const computedCamera = this.getComputedCamera({
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
    })?.toICamera();

    if (!computedCamera?.viewPlaneNormal) {
      return false;
    }

    const currentViewPlaneNormal = computedCamera.viewPlaneNormal;
    const refViewPlaneNormal = normalizedViewRef.viewPlaneNormal;
    const shouldReorient =
      refViewPlaneNormal &&
      !this.areNormalsEqual(currentViewPlaneNormal, refViewPlaneNormal) &&
      !this.areNormalsOpposite(currentViewPlaneNormal, refViewPlaneNormal);
    const effectiveViewPlaneNormal =
      refViewPlaneNormal ?? currentViewPlaneNormal;
    const isOppositeNormal =
      !shouldReorient &&
      this.areNormalsOpposite(currentViewPlaneNormal, effectiveViewPlaneNormal);
    const nextImageIdIndex = this.resolveVolumeReferenceImageIdIndex(
      referenceContext,
      normalizedViewRef,
      effectiveViewPlaneNormal,
      isOppositeNormal
    );
    const cameraPatch: Partial<PlanarCamera> = {};

    if (shouldReorient && refViewPlaneNormal) {
      cameraPatch.orientation = {
        viewPlaneNormal: [...refViewPlaneNormal] as Point3,
        ...(normalizedViewRef.viewUp
          ? {
              viewUp: [...normalizedViewRef.viewUp] as Point3,
            }
          : {}),
      };
    }

    if (typeof nextImageIdIndex === 'number') {
      cameraPatch.imageIdIndex = nextImageIdIndex;
    }

    if (!Object.keys(cameraPatch).length) {
      return false;
    }

    this.setCamera(cameraPatch);

    return true;
  }

  private normalizeVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): ViewReference {
    if (!viewRef.planeRestriction || viewRef.viewPlaneNormal) {
      return viewRef;
    }

    const orientation = this.deriveOrientationFromPlaneRestriction(
      referenceContext,
      viewRef.planeRestriction
    );

    return {
      ...viewRef,
      cameraFocalPoint:
        viewRef.cameraFocalPoint ?? viewRef.planeRestriction.point,
      ...orientation,
    };
  }

  private deriveOrientationFromPlaneRestriction(
    referenceContext: PlanarReferenceContext,
    planeRestriction: PlaneRestriction
  ): Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> {
    const computedCamera = this.getComputedCamera({
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
    })?.toICamera();
    const currentViewPlaneNormal = computedCamera?.viewPlaneNormal;
    const currentViewUp = computedCamera?.viewUp;
    const { inPlaneVector1, inPlaneVector2 } = planeRestriction;
    const result: Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> = {};

    if (
      currentViewPlaneNormal &&
      this.isPlaneRestrictionCompatibleWithNormal(
        planeRestriction,
        currentViewPlaneNormal
      )
    ) {
      result.viewPlaneNormal = [...currentViewPlaneNormal] as Point3;
      if (inPlaneVector1) {
        result.viewUp = [...inPlaneVector1] as Point3;
      } else if (currentViewUp) {
        result.viewUp = [...currentViewUp] as Point3;
      }

      return result;
    }

    let derivedViewPlaneNormal: Point3 | undefined;

    if (inPlaneVector1 && inPlaneVector2) {
      const cross = vec3.cross(
        vec3.create(),
        inPlaneVector2 as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    } else if (inPlaneVector1 && currentViewPlaneNormal) {
      const cross = vec3.cross(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    }

    if (derivedViewPlaneNormal) {
      result.viewPlaneNormal = derivedViewPlaneNormal;
    }

    if (inPlaneVector1) {
      result.viewUp = [...inPlaneVector1] as Point3;
    } else if (currentViewUp) {
      result.viewUp = [...currentViewUp] as Point3;
    }

    return result;
  }

  private isPlaneRestrictionCompatibleWithNormal(
    planeRestriction: PlaneRestriction,
    viewPlaneNormal: Point3
  ): boolean {
    return (
      (!planeRestriction.inPlaneVector1 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector1 as unknown as vec3
          )
        )) &&
      (!planeRestriction.inPlaneVector2 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector2 as unknown as vec3
          )
        ))
    );
  }

  private resolveVolumeReferenceImageIdIndex(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    effectiveViewPlaneNormal: Point3,
    isOppositeNormal: boolean
  ): number | undefined {
    const { rendering } = referenceContext;

    if (
      rendering.renderMode !== 'cpuVolume' &&
      rendering.renderMode !== 'vtkVolumeSlice'
    ) {
      return;
    }

    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const maxImageIdIndex = rendering.maxImageIdIndex;

    if (
      typeof viewRef.sliceIndex === 'number' &&
      viewRef.volumeId === referenceContext.data.volumeId &&
      viewRef.viewPlaneNormal
    ) {
      const targetSliceIndex = isOppositeNormal
        ? maxImageIdIndex - viewRef.sliceIndex
        : viewRef.sliceIndex;

      return Math.min(Math.max(0, targetSliceIndex), maxImageIdIndex);
    }

    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      return referencedImageIndex;
    }

    const targetPoint =
      viewRef.cameraFocalPoint ?? viewRef.planeRestriction?.point;

    if (targetPoint) {
      const referencedImageId = getClosestImageId(
        rendering.imageVolume,
        targetPoint,
        effectiveViewPlaneNormal
      );

      return this.findImageIdIndexByReference(imageIds, referencedImageId);
    }

    if (typeof viewRef.sliceIndex === 'number') {
      return Math.min(Math.max(0, viewRef.sliceIndex), maxImageIdIndex);
    }
  }

  private isReferenceViewableInContext(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions
  ): boolean {
    return isPlanarReferenceViewable({
      camera: this.camera,
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      imageIds: this.getImageIdsForReferenceContext(referenceContext),
      options,
      rendering: referenceContext.rendering,
      renderContext: this.renderContext,
      viewRef,
    });
  }

  private getImageIdsForReferenceContext(
    referenceContext: PlanarReferenceContext
  ): string[] {
    return (
      referenceContext.data.imageVolume?.imageIds ||
      referenceContext.data.imageIds
    );
  }

  private findImageIdIndexByReference(
    imageIds: string[],
    referencedImageId?: string,
    referencedImageURI?: string
  ): number | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    const foundImageIdIndex = imageIds.findIndex(
      (imageId) => imageIdToURI(imageId) === targetImageURI
    );

    return foundImageIdIndex >= 0 ? foundImageIdIndex : undefined;
  }

  private areNormalsEqual(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    return Boolean(
      currentViewPlaneNormal &&
        targetViewPlaneNormal &&
        isEqual(currentViewPlaneNormal, targetViewPlaneNormal)
    );
  }

  private areNormalsOpposite(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    if (!currentViewPlaneNormal || !targetViewPlaneNormal) {
      return false;
    }

    return isEqual(
      vec3.negate(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3
      ) as unknown as Point3,
      targetViewPlaneNormal
    );
  }
}

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isViewportNextImageDataSet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}

export default PlanarViewport;
