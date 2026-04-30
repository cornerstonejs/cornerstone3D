import { vec3 } from 'gl-matrix';
import { ViewportType } from '../../../enums';
import type {
  ActorEntry,
  ICamera,
  IImageData,
  Point3,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type ViewportInputOptions from '../../../types/ViewportInputOptions';
import renderingEngineCache from '../../renderingEngineCache';
import type {
  DataAddOptions,
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import ViewportNext from '../ViewportNext';
import {
  getDimensionGroupReferenceContext,
  type ViewportNextReferenceContext,
} from '../viewportNextReferenceCompatibility';
import {
  getViewportNextImageDataSet,
  isViewportNextImageDataSet,
} from '../viewportNextDataSetAccess';
import { DefaultVolume3DDataProvider } from './DefaultVolume3DDataProvider';
import { createVolume3DRenderPathResolver } from './Volume3DRenderPathResolver';
import Volume3DResolvedView from './Volume3DResolvedView';
import applyVolume3DCamera from './applyVolume3DCamera';
import type {
  Volume3DCamera,
  Volume3DPayload,
  Volume3DDataPresentation,
  Volume3DRegisteredDataSet,
  Volume3DRendering,
  Volume3DSetDataOptions,
  Volume3DViewportRenderContext,
  VolumeViewport3DV2Input,
} from './3dViewportTypes';

class VolumeViewport3DV2 extends ViewportNext<
  Volume3DCamera,
  Volume3DDataPresentation,
  Volume3DViewportRenderContext,
  { camera: Volume3DCamera & ICamera }
> {
  readonly type: ViewportType = ViewportType.VOLUME_3D_NEXT;
  readonly renderingEngineId: string;
  readonly canvas: HTMLCanvasElement;
  sWidth: number;
  sHeight: number;
  defaultOptions: ViewportInputOptions;
  suppressEvents = false;

  protected renderContext: Volume3DViewportRenderContext;

  private primaryDataId?: string;

  static get useCustomRenderingPipeline(): boolean {
    return false;
  }

  getUseCustomRenderingPipeline(): boolean {
    return false;
  }

  setRendered(): void {
    // no-op -- rendering engine calls this after completing a frame
  }

  constructor(args: VolumeViewport3DV2Input) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas;
    this.sWidth = args.sWidth;
    this.sHeight = args.sHeight;
    this.defaultOptions = args.defaultOptions || {};
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVolume3DDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createVolume3DRenderPathResolver();

    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);
    const renderer = renderingEngine?.getRenderer(this.id);

    if (!renderer) {
      throw new Error(
        '[VolumeViewport3DV2] No renderer available. Ensure WebGL is supported and the rendering engine has been properly initialized.'
      );
    }

    renderer
      .getActiveCamera()
      .setParallelProjection(this.defaultOptions.parallelProjection ?? true);

    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: '3d',
      viewport: {
        element: this.element,
        options: {
          orientation: this.defaultOptions.orientation,
          parallelProjection: this.defaultOptions.parallelProjection,
        },
      },
      display: {
        requestRender: () => {
          this.requestRenderingEngineRender();
        },
      },
      vtk: {
        canvas: this.canvas,
        renderer,
      },
    };
    this.viewState = {
      parallelProjection: this.defaultOptions.parallelProjection ?? true,
    } as Volume3DCamera;

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  /**
   * Adds one or more 3D datasets.
   *
   * @param entries - List of datasets to add, each with its own render-mode options.
   */
  async setDataList(
    entries: Array<{ dataId: string; options?: Volume3DSetDataOptions }>
  ): Promise<void> {
    for (const [index, { dataId, options = {} }] of entries.entries()) {
      await this.addData(dataId, {
        ...options,
        role: options.role ?? (index === 0 ? 'source' : 'overlay'),
      });
    }
  }

  /**
   * Adds a single 3D dataset and selects the effective 3D render mode.
   *
   * @param dataId - Logical dataset id to add.
   * @param options - Requested 3D render-mode options.
   */
  async addData(
    dataId: string,
    options: Volume3DSetDataOptions | DataAddOptions = {}
  ): Promise<void> {
    const volumeOptions = options as Volume3DSetDataOptions;
    const renderMode = this.resolveRenderMode(dataId, volumeOptions.renderMode);
    await super.addData(dataId, {
      renderMode,
      role: volumeOptions.role,
    });

    if (renderMode === 'vtkVolume3d' && volumeOptions.role === 'source') {
      this.primaryDataId = dataId;
    }

    this.setDefaultDataPresentation(dataId, {
      visible: true,
      opacity: 1,
    });
    this.viewState = this.getViewState();
  }

  /**
   * Replaces all mounted 3D datasets with a single logical 3D dataset.
   */
  async setData(
    dataId: string,
    options: Volume3DSetDataOptions | DataAddOptions = {}
  ): Promise<void> {
    this.removeAllData();
    await this.addData(dataId, {
      ...options,
      role: 'source',
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
   * Returns image ids for the primary volume dataset when present.
   *
   * @returns The image ids for the primary volume dataset, if available.
   */
  getImageIds(): string[] {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return [];
    }

    const data = this.getVolume3DPayload(binding);
    const rendering = this.getVolume3DRendering(binding);

    if (
      !data ||
      data.renderMode !== 'vtkVolume3d' ||
      rendering.renderMode !== 'vtkVolume3d'
    ) {
      return [];
    }

    return data.imageIds;
  }

  /**
   * Returns the underlying VTK renderer for direct integration points.
   *
   * @returns The VTK renderer used by this viewport.
   */
  getRenderer() {
    return this.renderContext.vtk.renderer;
  }

  /**
   * Returns the viewport canvas element.
   *
   * @returns The canvas owned by this viewport.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Returns the active VTK camera instance.
   *
   * @returns The active VTK camera object.
   */
  getVtkActiveCamera() {
    return this.getRenderer().getActiveCamera();
  }

  /**
   * Returns the current 3D camera state in the compatibility camera shape.
   *
   * @returns The current 3D camera state.
   */
  getViewState(): Volume3DCamera & ICamera {
    return this.getRuntimeCamera();
  }

  setViewState(viewStatePatch: Partial<Volume3DCamera>): void {
    if (this.isDestroyed) {
      return;
    }

    const previousCamera = this.getCameraForEvent();

    applyVolume3DCamera(this.renderContext, viewStatePatch, {
      resetClippingRange: true,
    });
    this.viewState = this.getRuntimeCamera();
    this.modified(previousCamera);
  }

  protected getRuntimeCamera(): Volume3DCamera & ICamera {
    const camera = this.getRenderer().getActiveCamera();

    return {
      clippingRange: camera.getClippingRange(),
      focalPoint: camera.getFocalPoint(),
      parallelProjection: camera.getParallelProjection(),
      parallelScale: camera.getParallelScale(),
      position: camera.getPosition(),
      rotation: 0,
      viewAngle: camera.getViewAngle(),
      viewPlaneNormal: camera.getViewPlaneNormal(),
      viewUp: camera.getViewUp(),
    } as Volume3DCamera & ICamera;
  }

  getResolvedView(): Volume3DResolvedView {
    return new Volume3DResolvedView({
      camera: this.getViewState(),
      canvas: this.canvas,
      frameOfReferenceUID: this.resolveFrameOfReferenceUID(),
      renderer: this.getRenderer(),
    });
  }

  // TrackballRotateTool preserves 3D view state across resize by round-tripping
  // through these view-presentation methods.
  /**
   * Returns the current 3D view-presentation payload.
   *
   * @returns The current 3D camera wrapped as a view-presentation payload.
   */
  getViewPresentation(): { camera: Volume3DCamera & ICamera } {
    return {
      camera: this.getViewState(),
    };
  }

  getViewReference(
    _viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const binding = this.getCurrentBinding();
    const data = binding ? this.getVolume3DPayload(binding) : undefined;
    const camera = this.getViewState();
    const FrameOfReferenceUID = this.getFrameOfReferenceUID();
    const cameraFocalPoint = camera.focalPoint as Point3 | undefined;
    const viewPlaneNormal = camera.viewPlaneNormal as Point3 | undefined;
    const viewUp = camera.viewUp as Point3 | undefined;
    const viewReference: ViewReference = {
      FrameOfReferenceUID,
      dataId: binding?.data.id,
      cameraFocalPoint,
      viewPlaneNormal,
      viewUp,
    };

    if (data?.renderMode === 'vtkVolume3d') {
      viewReference.volumeId = data.volumeId;
      Object.assign(
        viewReference,
        getDimensionGroupReferenceContext(data.imageVolume)
      );
    }

    if (cameraFocalPoint && viewPlaneNormal && viewUp) {
      viewReference.planeRestriction = {
        FrameOfReferenceUID,
        point: cameraFocalPoint,
        inPlaneVector1: viewUp,
        inPlaneVector2: vec3.cross(
          vec3.create(),
          viewUp as unknown as vec3,
          viewPlaneNormal as unknown as vec3
        ) as Point3,
      };
    }

    return viewReference;
  }

  /**
   * Applies a 3D camera payload or wrapped view-presentation payload.
   *
   * @param viewPresentation - Camera payload or wrapped view-presentation
   * object to apply.
   */
  setViewPresentation(
    viewPresentation?:
      | { camera?: Partial<Volume3DCamera> }
      | Partial<Volume3DCamera>
  ): void {
    if (!viewPresentation) {
      return;
    }

    if (isVolume3DViewPresentation(viewPresentation)) {
      if (viewPresentation.camera) {
        this.setViewState(viewPresentation.camera);
      }

      return;
    }

    this.setViewState(viewPresentation);
  }

  /**
   * Returns the primary volume id when the active rendering is volume-backed.
   *
   * @returns The primary volume id, if one is active.
   */
  getVolumeId(): string | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    const data = this.getVolume3DPayload(binding);
    const rendering = this.getVolume3DRendering(binding);

    if (
      !data ||
      data.renderMode !== 'vtkVolume3d' ||
      rendering.renderMode !== 'vtkVolume3d'
    ) {
      return;
    }

    return data.volumeId;
  }

  /**
   * Returns whether the viewport currently contains the given volume id.
   *
   * @param volumeId - Volume id to look up in the current actors.
   * @returns `true` when a matching volume actor is present.
   */
  hasVolumeId(volumeId: string): boolean {
    return this.getActors().some(
      (actorEntry) => actorEntry.referencedId === volumeId
    );
  }

  /**
   * Returns whether any actor reference id contains the given volume URI.
   *
   * @param volumeURI - Volume URI substring to test against actor references.
   * @returns `true` when a matching actor reference is present.
   */
  hasVolumeURI(volumeURI: string): boolean {
    return this.getActors().some((actorEntry) =>
      String(actorEntry.referencedId || '').includes(volumeURI)
    );
  }

  /**
   * Returns image data from the current binding when exposed by the render
   * path.
   *
   * @returns The current image-data object, if exposed by the render path.
   */
  getImageData(): IImageData | undefined {
    return this.getCurrentBinding()?.getImageData?.() as IImageData | undefined;
  }

  /**
   * Returns all actor entries contributed by the active 3D bindings.
   *
   * @returns Actor entries for all active 3D bindings.
   */
  getActors(): ActorEntry[] {
    const actors: ActorEntry[] = [];

    for (const binding of this.bindings.values()) {
      const data = this.getVolume3DPayload(binding);

      if (!data) {
        continue;
      }

      actors.push(
        ...this.getActorEntriesForRendering(
          this.getVolume3DRendering(binding),
          data
        )
      );
    }

    return actors;
  }

  /**
   * Returns the default actor for tool integration and legacy compatibility.
   *
   * @returns The primary actor entry, if one is available.
   */
  getDefaultActor(): ActorEntry | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return this.getActors()[0];
    }

    const data = this.getVolume3DPayload(binding);

    if (!data) {
      return undefined;
    }

    return this.getActorEntriesForRendering(
      this.getVolume3DRendering(binding),
      data
    )[0];
  }

  /**
   * Resets the VTK camera and clipping range.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCamera(): boolean {
    const previousCamera = this.getCameraForEvent();
    const renderer = this.getRenderer();

    renderer.resetCamera();
    renderer.resetCameraClippingRange();
    this.viewState = this.getViewState();
    this.render();
    this.triggerCameraModifiedEvent(previousCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Resets the 3D camera after resize using the same behavior as
   * `resetCamera`.
   *
   * @returns Always `true` for compatibility with legacy viewport contracts.
   */
  resetCameraForResize(): boolean {
    return this.resetCamera();
  }

  /**
   * Updates cached size state and notifies active render bindings.
   */
  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    this.sWidth = this.canvas.width;
    this.sHeight = this.canvas.height;

    this.resizeBindings();
  }

  /**
   * Renders active 3D bindings or queues an engine-driven render.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    if (!this.renderBindings()) {
      this.requestRenderingEngineRender();
    }
  }

  protected override onDestroy(): void {
    this.primaryDataId = undefined;
  }

  protected getCurrentBinding() {
    if (this.primaryDataId) {
      return this.getBinding(this.primaryDataId) ?? this.getFirstBinding();
    }

    return this.getFirstBinding();
  }

  protected getReferenceViewContexts(): ViewportNextReferenceContext[] {
    const contexts: ViewportNextReferenceContext[] = [];
    const camera = this.getViewState();

    for (const [dataId, binding] of this.bindings.entries()) {
      const data = this.getVolume3DPayload(binding);
      const volumeId =
        data?.renderMode === 'vtkVolume3d' ? data.volumeId : undefined;

      contexts.push({
        dataId,
        dataIds: [binding.data.id],
        frameOfReferenceUID:
          binding.getFrameOfReferenceUID() ?? this.getFrameOfReferenceUID(),
        imageIds:
          data?.renderMode === 'vtkVolume3d' ? data.imageIds : undefined,
        volumeId,
        volumeIds: volumeId ? [volumeId] : undefined,
        cameraFocalPoint: camera.focalPoint as Point3 | undefined,
        viewPlaneNormal: camera.viewPlaneNormal as Point3 | undefined,
        ...(data?.renderMode === 'vtkVolume3d'
          ? getDimensionGroupReferenceContext(data.imageVolume)
          : {}),
      });
    }

    return contexts.length ? contexts : super.getReferenceViewContexts();
  }

  private requestRenderingEngineRender(): void {
    const renderingEngine = renderingEngineCache.get(this.renderingEngineId);

    if (renderingEngine) {
      renderingEngine.renderViewport(this.id);
    }
  }

  private resolveRenderMode(
    dataId: string,
    requestedRenderMode: Volume3DSetDataOptions['renderMode'] = 'auto'
  ): 'vtkVolume3d' | 'vtkGeometry3d' {
    if (requestedRenderMode && requestedRenderMode !== 'auto') {
      return requestedRenderMode;
    }

    const dataSet = this.getDataSet(dataId);

    if (dataSet?.imageIds?.length) {
      return 'vtkVolume3d';
    }

    return 'vtkGeometry3d';
  }

  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    const dataSet = getViewportNextImageDataSet(dataId);

    if (!isVolume3DRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }

  private getVolume3DPayload(
    binding: ViewportDataBinding<Volume3DDataPresentation>
  ): LoadedData<Volume3DPayload> | undefined {
    if (!isVolume3DData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private resolveFrameOfReferenceUID(): string | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    const data = this.getVolume3DPayload(binding);
    const rendering = this.getVolume3DRendering(binding);

    if (!data) {
      return;
    }

    if (data.renderMode === 'vtkVolume3d') {
      return data.imageVolume.metadata?.FrameOfReferenceUID;
    }

    if (rendering.renderMode === 'vtkGeometry3d') {
      return rendering.frameOfReferenceUID;
    }
  }

  private getVolume3DRendering(
    binding: ViewportDataBinding<Volume3DDataPresentation>
  ): Volume3DRendering {
    if (!isVolume3DRendering(binding.rendering)) {
      throw new Error(
        '[VolumeViewport3DV2] Binding render mode is not a supported 3D rendering'
      );
    }

    return binding.rendering;
  }

  private getActorEntriesForRendering(
    rendering: Volume3DRendering,
    data: LoadedData<Volume3DPayload>
  ): ActorEntry[] {
    if (
      rendering.renderMode === 'vtkVolume3d' &&
      data.renderMode === 'vtkVolume3d'
    ) {
      return [
        {
          actor: rendering.actor,
          referencedId: data.volumeId,
          uid: rendering.actorEntryUID,
        },
      ];
    }

    if (rendering.renderMode === 'vtkGeometry3d') {
      return rendering.actors;
    }

    return [];
  }
}

export default VolumeViewport3DV2;

function isVolume3DViewPresentation(
  viewPresentation: unknown
): viewPresentation is { camera?: Partial<Volume3DCamera> } {
  return (
    Boolean(viewPresentation) &&
    typeof viewPresentation === 'object' &&
    'camera' in viewPresentation
  );
}

function isVolume3DData(data: LoadedData): data is LoadedData<Volume3DPayload> {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const payload = data as Record<string, unknown>;

  return (
    (payload.type === 'image' && payload.renderMode === 'vtkVolume3d') ||
    (payload.type === 'geometry' && payload.renderMode === 'vtkGeometry3d')
  );
}

function isVolume3DRendering(rendering: {
  renderMode: string;
}): rendering is Volume3DRendering {
  return (
    rendering.renderMode === 'vtkVolume3d' ||
    rendering.renderMode === 'vtkGeometry3d'
  );
}

function isVolume3DRegisteredDataSet(
  value: unknown
): value is Volume3DRegisteredDataSet {
  if (!isViewportNextImageDataSet(value)) {
    return false;
  }

  return (
    (value.geometryId === undefined || typeof value.geometryId === 'string') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string') &&
    (value.geometryLoadOptions === undefined ||
      (typeof value.geometryLoadOptions === 'object' &&
        !Array.isArray(value.geometryLoadOptions)))
  );
}
