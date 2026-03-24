import { OrientationAxis, ViewportType } from '../../../enums';
import type BlendModes from '../../../enums/BlendModes';
import type {
  ICamera,
  IVolumeInput,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import imageIdToURI from '../../../utilities/imageIdToURI';
import renderingEngineCache from '../../renderingEngineCache';
import type { DataAddOptions, LoadedData } from '../ViewportArchitectureTypes';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import {
  getViewportV2ImageDataSet,
  isViewportV2ImageDataSet,
} from '../viewportV2DataSetAccess';
import PlanarLegacyCompatibleViewport from './PlanarLegacyCompatibleViewport';
import { CpuImageSlicePath } from './CpuImageSliceRenderPath';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderPath';
import { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
import { VtkImageMapperPath } from './VtkImageMapperRenderPath';
import { VtkVolumeMapperPath } from './VtkVolumeMapperRenderPath';
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

defaultRenderPathResolver.register(new CpuImageSlicePath());
defaultRenderPathResolver.register(new CpuVolumeSlicePath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeMapperPath());

class PlanarViewport extends ViewportV2<
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
  private cpuCanvas?: HTMLCanvasElement;
  private readonly legacyCompatibleViewport =
    new PlanarLegacyCompatibleViewport(this, {
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
      setDataId: (dataId, options) => this.setDataId(dataId, options),
      setDataIds: (dataIds, options) => this.setDataIds(dataIds, options),
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
      getBindingActor: (dataId) =>
        (this.getBinding(dataId)?.rendering as { actor?: unknown } | undefined)
          ?.actor,
      getImageCount: () => this.getImageIds().length,
      getMaxImageIdIndex: () => this.getMaxImageIdIndex(),
    });

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op -- rendering engine calls this after completing a frame
  }

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
    this.dataProvider = args.dataProvider || new DefaultPlanarDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;

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

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
    this.resize();
  }

  /**
   * Adds one or more logical planar datasets to the viewport.
   *
   * @param dataIds - Logical dataset ids to add to the viewport.
   * @param options - Render-mode and orientation options used while resolving
   * the effective planar render path.
   * @returns Rendering ids in the same order as the provided data ids.
   */
  async setDataIds(
    dataIds: string[],
    options: PlanarSetDataOptions = {}
  ): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, options);
      renderingIds.push(renderingId);
    }

    if (dataIds[0]) {
      this.activeDataId = dataIds[0];
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
  async setDataId(
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

  getLegacyCompatibleViewport(): PlanarLegacyCompatibleViewport {
    return this.legacyCompatibleViewport;
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setStack(...)`. */
  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    return this.legacyCompatibleViewport.setStack(
      imageIds,
      currentImageIdIndex
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setVolumes(...)`. */
  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibleViewport.setVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().addVolumes(...)`. */
  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibleViewport.addVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setProperties(...)`. */
  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    this.legacyCompatibleViewport.setProperties(
      properties,
      volumeIdOrSuppressEvents,
      suppressEvents
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().getProperties(...)`. */
  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    return this.legacyCompatibleViewport.getProperties(volumeId);
  }

  /** @deprecated Use `getLegacyCompatibleViewport().resetProperties(...)`. */
  resetProperties(volumeId?: string): void {
    this.legacyCompatibleViewport.resetProperties(volumeId);
  }

  /** @deprecated Use `getLegacyCompatibleViewport().getBlendMode(...)`. */
  getBlendMode(filterActorUIDs?: string[]): BlendModes | undefined {
    return this.legacyCompatibleViewport.getBlendMode(filterActorUIDs);
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setBlendMode(...)`. */
  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate = false
  ): void {
    this.legacyCompatibleViewport.setBlendMode(
      blendMode,
      filterActorUIDs,
      immediate
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().getNumberOfSlices()`. */
  getNumberOfSlices(): number {
    return this.legacyCompatibleViewport.getNumberOfSlices();
  }

  removeDataId(dataId: string): void {
    super.removeDataId(dataId);

    if (this.activeDataId === dataId) {
      this.activeDataId = undefined;
    }

    this.legacyCompatibleViewport.removeDataId(dataId);
  }

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
  getVolumeId(): string | undefined {
    return this.getPlanarData()?.volumeId;
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
  getCurrentImageId(): string | undefined {
    return getPlanarReferencedImageId({
      camera: this.camera,
      data: this.getPlanarData(),
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
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

  protected normalizeCamera(camera: PlanarCamera): PlanarCamera {
    return normalizePlanarCamera(camera);
  }

  getRotation(): number {
    return (
      this.getComputedCamera()?.rotation ??
      normalizePlanarRotation(this.camera.rotation)
    );
  }

  getAnchorWorld(): Point3 | undefined {
    const anchorWorld = this.camera.anchorWorld;

    return anchorWorld ? ([...anchorWorld] as Point3) : undefined;
  }

  setAnchorWorld(point?: Point3): void {
    this.setCamera({
      anchorWorld: point ? ([...point] as Point3) : undefined,
    });
  }

  /** @deprecated Use `getLegacyCompatibleViewport().getZoom()`. */
  getZoom(): number {
    return (
      this.getComputedCamera()?.zoom ?? Math.max(this.camera.scale ?? 1, 0.001)
    );
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setZoom(...)`. */
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

  /** @deprecated Use `getLegacyCompatibleViewport().getPan()`. */
  getPan(): Point2 {
    const computedCamera = this.getComputedCamera();

    return computedCamera ? computedCamera.pan : [0, 0];
  }

  /** @deprecated Use `getLegacyCompatibleViewport().setPan(...)`. */
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

  getCameraState(): PlanarCamera {
    return this.getCamera();
  }

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
    return getPlanarViewReference({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      data: this.getPlanarData(),
      rendering: this.getCurrentPlanarRendering(),
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
    return getPlanarViewReferenceId({
      camera: this.camera,
      data: this.getPlanarData(),
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
      viewRefSpecifier,
    });
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

  canvasToWorld(canvasPos: Point2): Point3 {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      throw new Error(
        `[PlanarViewport] Cannot convert canvas to world for viewport ${this.id} because no planar rendering is mounted.`
      );
    }

    return computedCamera.canvasToWorld(canvasPos);
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      throw new Error(
        `[PlanarViewport] Cannot convert world to canvas for viewport ${this.id} because no planar rendering is mounted.`
      );
    }

    return computedCamera.worldToCanvas(worldPos);
  }

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
    return isPlanarReferenceViewable({
      camera: this.camera,
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      imageIds: this.getImageIds(),
      options,
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
      viewRef,
    });
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

    this.resizeBindings();
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

  protected override onDestroy(): void {
    this.legacyCompatibleViewport.destroy();
    this.cpuCanvas?.remove();
    this.cpuCanvas = undefined;
    this.activeDataId = undefined;
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
    cpuCanvas.style.display = useCPUCanvas ? '' : 'none';
    vtkCanvas.style.display = useCPUCanvas ? 'none' : '';
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
    const dataSet = getViewportV2ImageDataSet(dataId);

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
    const selectedPath = selectPlanarRenderPath(dataSet, {
      ...options,
      orientation: resolvedOrientation,
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
      selectedPath.renderMode === 'vtkVolume';
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
        this.removeDataId(dataId);
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

  private buildCurrentPlanarSliceBasis() {
    return this.getComputedCamera()?.getSliceBasis();
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

  private getCurrentCanvasWidth(): number {
    return this.getCurrentCanvasDimensions().width;
  }

  private getCurrentCanvasHeight(): number {
    return this.getCurrentCanvasDimensions().height;
  }

  private getCurrentPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentBinding()?.data as
      | LoadedData<PlanarPayload>
      | undefined;
  }
}

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isViewportV2ImageDataSet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}

export default PlanarViewport;
