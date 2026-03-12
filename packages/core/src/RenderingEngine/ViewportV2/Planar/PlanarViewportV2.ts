import { OrientationAxis, ViewportType } from '../../../enums';
import type {
  ICamera,
  Point2,
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
import { getViewportV2ImageDataSet } from '../viewportV2DataSetAccess';
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
import { normalizePlanarRotation } from './planarCameraPresentation';
import {
  getPlanarCompatibilityCamera,
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
  isPlanarReferenceViewable,
} from './planarViewportCompatibility';
import type {
  PlanarCamera,
  PlanarDataPresentation,
  PlanarDataProvider,
  PlanarEffectiveRenderMode,
  PlanarPayload,
  PlanarRegisteredDataSet,
  PlanarRendering,
  PlanarSetDataOptions,
  PlanarViewportRenderContext,
  PlanarViewportV2Input,
} from './PlanarViewportV2Types';

defaultRenderPathResolver.register(new CpuImageSlicePath());
defaultRenderPathResolver.register(new CpuVolumeSlicePath());
defaultRenderPathResolver.register(new VtkImageMapperPath());
defaultRenderPathResolver.register(new VtkVolumeMapperPath());

class PlanarViewportV2 extends ViewportV2<
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

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op -- rendering engine calls this after completing a frame
  }

  constructor(args: PlanarViewportV2Input) {
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
        '[PlanarViewportV2] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
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

    if (viewportElement) {
      viewportElement.style.position =
        viewportElement.style.position || 'relative';
      viewportElement.style.zIndex = '1';
    }

    const cpuCanvasContext = cpuCanvas.getContext('2d');

    if (!cpuCanvasContext) {
      throw new Error('[PlanarViewportV2] Failed to initialize CPU canvas');
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
        activateRenderMode: (renderMode: PlanarEffectiveRenderMode) => {
          this.setRenderModeVisibility(renderMode, cpuCanvas, vtkCanvas);
        },
      },
      cpu: {
        canvas: cpuCanvas,
        context: cpuCanvasContext,
      },
      vtk: {
        renderer,
        canvas: vtkCanvas,
      },
    };
    this.camera = {
      imageIdIndex: 0,
      orientation: OrientationAxis.ACQUISITION,
      rotation: 0,
      zoom: 1,
      pan: [0, 0],
    };

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
    const { data, selectedPath } = await this.loadPlanarData(
      dataId,
      planarOptions
    );

    this.activeDataId = dataId;
    this.applyLoadedPlanarCamera(planarOptions, data, selectedPath);

    const renderingId = await this.addLoadedData(dataId, data, {
      renderMode: selectedPath.renderMode,
    });

    this.setDefaultDataPresentation(dataId, {
      visible: true,
      opacity: 1,
    });

    return renderingId;
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

  /**
   * Returns the current camera plus compatibility fields expected by legacy
   * camera consumers such as pan/zoom helpers and interaction tools.
   *
   * @returns The current planar camera in the compatibility camera shape.
   */
  getCamera(): PlanarCamera & ICamera {
    return this.getCompatibilityCamera();
  }

  /**
   * Applies camera updates using the planar compatibility contract.
   *
   * @param camera - Partial planar or compatibility camera values to merge into
   * the current viewport camera state.
   */
  setCamera(camera: Partial<PlanarCamera & ICamera>): void {
    const currentZoom = Math.max(this.camera.zoom ?? 1, 0.001);
    const compatibilityCamera = this.getCompatibilityCamera();
    const nextCamera: Partial<PlanarCamera> = {
      ...(typeof camera.imageIdIndex === 'number'
        ? { imageIdIndex: camera.imageIdIndex }
        : {}),
      ...(camera.orientation !== undefined
        ? { orientation: camera.orientation }
        : {}),
      ...(typeof camera.rotation === 'number'
        ? { rotation: normalizePlanarRotation(camera.rotation) }
        : {}),
      ...(typeof camera.zoom === 'number'
        ? { zoom: Math.max(camera.zoom, 0.001) }
        : {}),
    };

    if (
      typeof camera.parallelScale === 'number' &&
      camera.parallelScale > 0 &&
      typeof compatibilityCamera.parallelScale === 'number' &&
      compatibilityCamera.parallelScale > 0
    ) {
      nextCamera.zoom = Math.max(
        (currentZoom * compatibilityCamera.parallelScale) /
          camera.parallelScale,
        0.001
      );
    }

    const panFromFocalPoint = this.getPanFromFocalPoint({
      currentFocalPoint: compatibilityCamera.focalPoint,
      currentZoom,
      nextZoom: nextCamera.zoom ?? currentZoom,
      targetFocalPoint: camera.focalPoint,
    });

    if (panFromFocalPoint) {
      nextCamera.pan = panFromFocalPoint;
    } else if (camera.pan) {
      nextCamera.pan = [camera.pan[0], camera.pan[1]];
    }

    if (!Object.keys(nextCamera).length) {
      return;
    }

    super.setCamera(nextCamera);
  }

  /**
   * Returns the normalized planar rotation in degrees.
   *
   * @returns The normalized rotation angle.
   */
  getRotation(): number {
    return normalizePlanarRotation(this.camera.rotation);
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
    const { rotation, displayArea, zoom, pan } = viewPresSel;
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
    } = viewPres;

    this.setCamera({
      rotation,
      zoom,
      ...(pan
        ? {
            pan: [pan[0] * zoom, pan[1] * zoom] as Point2,
          }
        : {}),
    });
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
        new Error('[PlanarViewportV2] Cannot set image index on empty stack')
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
    this.setCamera({ imageIdIndex: undefined, orientation });
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
      rotation: 0,
      ...(resetPan ? { pan: [0, 0] as Point2 } : {}),
      ...(resetZoom ? { zoom: 1 } : {}),
    });

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
    const { clientHeight, clientWidth } = this.element;
    const { canvas } = this.renderContext.cpu;

    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width = clientWidth;
      canvas.height = clientHeight;
    }

    this.resizeBindings();
  }

  /**
   * Renders the active planar bindings or queues an engine-driven render.
   */
  render(): void {
    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
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

  private getPanFromFocalPoint(args: {
    currentFocalPoint?: ICamera['focalPoint'];
    currentZoom: number;
    nextZoom: number;
    targetFocalPoint?: ICamera['focalPoint'];
  }): Point2 | undefined {
    const { currentFocalPoint, currentZoom, nextZoom, targetFocalPoint } = args;

    if (!currentFocalPoint || !targetFocalPoint) {
      return;
    }

    const currentCanvasFocalPoint = this.worldToCanvas(currentFocalPoint);
    const targetCanvasFocalPoint = this.worldToCanvas(targetFocalPoint);
    const zoomRatio = nextZoom / Math.max(currentZoom, 0.001);
    const currentPan = this.getPan();

    return [
      currentPan[0] +
        (currentCanvasFocalPoint[0] - targetCanvasFocalPoint[0]) * zoomRatio,
      currentPan[1] +
        (currentCanvasFocalPoint[1] - targetCanvasFocalPoint[1]) * zoomRatio,
    ];
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
    const dataSet = getViewportV2ImageDataSet<PlanarRegisteredDataSet>(dataId);

    if (!dataSet?.imageIds) {
      return;
    }

    return dataSet;
  }

  private getCompatibilityCamera(): PlanarCamera & ICamera {
    return getPlanarCompatibilityCamera({
      camera: this.camera,
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.renderContext,
    });
  }

  private async loadPlanarData(
    dataId: string,
    options: PlanarSetDataOptions
  ): Promise<{
    data: LoadedData<PlanarPayload>;
    selectedPath: SelectedPlanarRenderPath;
  }> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewportV2] No registered planar dataset metadata for ${dataId}`
      );
    }

    const selectedPath = selectPlanarRenderPath(dataSet, options);
    const data = await (this.dataProvider as PlanarDataProvider).load(dataId, {
      acquisitionOrientation: selectedPath.acquisitionOrientation,
      orientation: options.orientation || OrientationAxis.ACQUISITION,
      renderMode: selectedPath.renderMode,
      volumeId: selectedPath.volumeId,
    });

    return {
      data,
      selectedPath,
    };
  }

  private applyLoadedPlanarCamera(
    options: PlanarSetDataOptions,
    planarData: PlanarPayload,
    selectedPath: SelectedPlanarRenderPath
  ): void {
    const isVolumeRenderMode =
      selectedPath.renderMode === 'cpuVolume' ||
      selectedPath.renderMode === 'vtkVolume';

    this.camera = {
      ...this.camera,
      imageIdIndex: isVolumeRenderMode
        ? undefined
        : planarData.initialImageIdIndex,
      orientation: normalizePlanarOrientation(
        options.orientation,
        selectedPath.acquisitionOrientation
      ),
    };
  }

  private getCurrentPlanarRendering(): PlanarRendering | undefined {
    return this.getCurrentBinding()?.rendering as PlanarRendering | undefined;
  }

  private getCurrentPlanarData(): LoadedData<PlanarPayload> | undefined {
    return this.getCurrentBinding()?.data as
      | LoadedData<PlanarPayload>
      | undefined;
  }
}

export default PlanarViewportV2;
