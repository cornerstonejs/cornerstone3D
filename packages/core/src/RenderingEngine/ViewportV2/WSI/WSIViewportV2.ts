import { ViewportType } from '../../../enums';
import type {
  CPUIImageData,
  ICamera,
  Point2,
  Point3,
  ViewReferenceSpecifier,
  VOIRange,
  WSIViewportProperties,
} from '../../../types';
import type {
  WSIMapLike,
  WSIMapViewLike,
  WSIViewerLike,
} from '../../../utilities/WSIUtilities';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type {
  LoadedData,
  RenderingBinding,
} from '../ViewportArchitectureTypes';
import ViewportV2 from '../ViewportV2';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderPath';
import type {
  WSICamera,
  WSIDataPresentation,
  WSIPayload,
  WSIViewportRenderContext,
  WSIViewportV2Input,
  WSIRendering,
} from './WSIViewportV2Types';
import {
  buildWSIColorTransform,
  buildWSIImageData,
  canvasToIndexForWSI,
  computeWSITransforms,
  indexToWorldWSIMetadata,
  worldToIndexWSIMetadata,
} from './wsiTransformUtils';
import WSIComputedCamera from './WSIComputedCamera';

defaultRenderPathResolver.register(new DicomMicroscopyPath());

class WSIViewportV2 extends ViewportV2<
  WSICamera,
  WSIDataPresentation,
  WSIViewportRenderContext
> {
  readonly type = ViewportType.WHOLE_SLIDE;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;
  modality = 'SM';

  protected renderContext: WSIViewportRenderContext;

  private activeDataId?: string;
  private voiRange: VOIRange = {
    lower: 0,
    upper: 255,
  };
  private averageWhite?: [number, number, number];

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: WSIViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultWSIDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'wsi',
      element: this.element,
    };
    this.camera = {
      zoom: 1,
      rotation: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  protected normalizeCamera(camera: WSICamera): WSICamera {
    return {
      ...camera,
      zoom: Math.max(camera.zoom ?? 1, 0.001),
      centerIndex: camera.centerIndex
        ? [camera.centerIndex[0], camera.centerIndex[1]]
        : camera.centerIndex,
      resolution:
        typeof camera.resolution === 'number'
          ? Math.max(camera.resolution, 0.000001)
          : camera.resolution,
      rotation: camera.rotation ?? 0,
    };
  }

  async setDataList(entries: Array<{ dataId: string }>): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const { dataId } of entries) {
      const renderingId = await this.setData(dataId, {
        renderMode: 'wsi2d',
      });

      this.setDefaultDataPresentation(dataId, {
        visible: true,
        opacity: 1,
      });
      this.activeDataId = dataId;
      renderingIds.push(renderingId);
    }

    this.syncCameraFromView();
    this.applyVOIToRendering();

    return renderingIds;
  }

  setProperties(props: WSIViewportProperties): void {
    if (props.voiRange) {
      this.setVOI(props.voiRange);
    }
  }

  getProperties = (): WSIViewportProperties => {
    return {
      voiRange: { ...this.voiRange },
    };
  };

  resetProperties(): void {
    this.setProperties({
      voiRange: {
        lower: 0,
        upper: 255,
      },
    });
  }

  setVOI(voiRange: VOIRange): void {
    this.voiRange = { ...voiRange };
    this.applyVOIToRendering();
  }

  setAverageWhite(averageWhite: [number, number, number]): void {
    this.averageWhite = [...averageWhite] as [number, number, number];
    this.applyVOIToRendering();
  }

  computeTransforms() {
    return computeWSITransforms(this.getWSIData()?.metadata);
  }

  getImageData(): CPUIImageData | null {
    const data = this.getWSIData();

    return buildWSIImageData({
      metadata: data?.metadata,
      modality: this.modality,
      frameOfReferenceUID: data?.frameOfReferenceUID,
    });
  }

  hasImageURI(imageURI: string): boolean {
    if (!imageURI) {
      return false;
    }

    return this.getWSIData()?.imageURISet.has(imageURI) || false;
  }

  setCamera(cameraPatch: Partial<WSICamera>): void {
    this.syncCameraFromView();

    const view = this.getView();
    const data = this.getWSIData();

    if (!view) {
      super.setCamera(cameraPatch);
      return;
    }

    const nextPatch: Partial<WSICamera> = {};

    if (typeof cameraPatch.zoom === 'number') {
      nextPatch.zoom = Math.max(cameraPatch.zoom, 0.001);
    }

    if (cameraPatch.centerIndex) {
      nextPatch.centerIndex = [
        cameraPatch.centerIndex[0],
        cameraPatch.centerIndex[1],
      ];
    }

    if (typeof cameraPatch.rotation === 'number') {
      nextPatch.rotation = cameraPatch.rotation;
    }

    if (
      typeof cameraPatch.parallelScale === 'number' &&
      typeof data?.metadata?.spacing?.[0] === 'number' &&
      data.metadata.spacing[0] > 0
    ) {
      const worldToCanvasRatio =
        this.element.clientHeight / Math.max(cameraPatch.parallelScale, 0.001);

      nextPatch.resolution = 1 / data.metadata.spacing[0] / worldToCanvasRatio;
    }

    if (cameraPatch.focalPoint && data) {
      const newCanvas = this.worldToCanvas(cameraPatch.focalPoint);
      const newIndex = canvasToIndexForWSI({
        canvasPos: newCanvas,
        canvasWidth: this.element.clientWidth,
        canvasHeight: this.element.clientHeight,
        view,
      });

      nextPatch.centerIndex = [newIndex[0], newIndex[1]];
    }

    super.setCamera(nextPatch);
  }

  getCamera(): WSICamera & ICamera {
    return {
      ...this.camera,
      ...this.getCameraForEvent(),
    };
  }

  getComputedCamera(): WSIComputedCamera | undefined {
    const view = this.getView();
    const data = this.getWSIData();

    if (!view || !data) {
      return;
    }

    return new WSIComputedCamera({
      camera: this.camera,
      canvasHeight: this.element.clientHeight,
      canvasWidth: this.element.clientWidth,
      frameOfReferenceUID: data.frameOfReferenceUID,
      metadata: data.metadata,
      view,
    });
  }

  getCurrentImageId(): string | undefined {
    return this.getWSIData()?.imageIds[0];
  }

  getFrameNumber(): number {
    return 1;
  }

  async setFrameNumber(_frameNumber: number): Promise<void> {
    // No-op for current whole-slide workflows.
  }

  resetCamera(): boolean {
    return true;
  }

  getNumberOfSlices(): number {
    return 1;
  }

  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    this.resizeBindings();
    this.render();
  }

  worldToIndexWSI(point: Point3): Point2 {
    const rendering = this.getWSIRendering();
    const affine = rendering?.viewer.getAffine();
    const transformUtils = rendering?.transformUtils;

    if (!transformUtils || !affine) {
      throw new Error(
        `[WSIViewportV2] Cannot convert world to index for viewport ${this.id} because the WSI transform runtime is not ready.`
      );
    }

    const pixelCoords = transformUtils.applyInverseTransform({
      coordinate: [point[0], point[1]],
      affine,
    });

    return [pixelCoords[0], pixelCoords[1]];
  }

  indexToWorldWSI(point: Point2): Point3 {
    const rendering = this.getWSIRendering();
    const affine = rendering?.viewer.getAffine();
    const transformUtils = rendering?.transformUtils;

    if (!transformUtils || !affine) {
      throw new Error(
        `[WSIViewportV2] Cannot convert index to world for viewport ${this.id} because the WSI transform runtime is not ready.`
      );
    }

    const sliceCoords = transformUtils.applyTransform({
      coordinate: [point[0], point[1]],
      affine,
    });

    return [sliceCoords[0], sliceCoords[1], 0];
  }

  worldToIndex(point: Point3): Point3 {
    return worldToIndexWSIMetadata(this.getWSIData()?.metadata, point);
  }

  indexToWorld(point: Point3): Point3 {
    return indexToWorldWSIMetadata(this.getWSIData()?.metadata, point);
  }

  scroll(delta: number): void {
    const camera = this.getComputedCamera()?.toICamera();

    this.setCamera({
      parallelScale:
        Math.max(camera.parallelScale || 1, 0.001) * (1 + 0.1 * delta),
    });
  }

  getRotation(): number {
    return 0;
  }

  getSliceIndex(): number {
    return 0;
  }

  getView(): WSIMapViewLike | undefined {
    const rendering = this.getWSIRendering();
    const view = rendering?.map.getView();

    if (!view || typeof window === 'undefined') {
      return view;
    }

    const anyWindow = window as Window & {
      map?: WSIMapLike;
      viewer?: WSIViewerLike;
      view?: WSIMapViewLike;
      wsi?: WSIViewportV2;
    };

    anyWindow.map = rendering?.map;
    anyWindow.viewer = rendering?.viewer;
    anyWindow.view = view;
    anyWindow.wsi = this;

    return view;
  }

  getZoom(): number {
    return Math.max(
      this.getView()?.getZoom?.() ?? this.camera.zoom ?? 1,
      0.001
    );
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    const computedCamera = this.getComputedCamera();

    if (computedCamera) {
      this.applyComputedCameraState(
        computedCamera.withZoom(zoom, canvasPoint).state.camera
      );
      return;
    }

    this.setCamera({
      zoom: Math.max(zoom, 0.001),
    });
  }

  getImageIds(): string[] {
    const imageId = this.getCurrentImageId();

    return imageId ? [imageId] : [];
  }

  getViewReferenceId(_specifier: ViewReferenceSpecifier = {}): string {
    return `imageId:${this.getCurrentImageId()}`;
  }

  getCurrentImageIdIndex(): number {
    return 0;
  }

  canvasToWorld(canvasPos: Point2): Point3 {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      throw new Error(
        `[WSIViewportV2] Cannot convert canvas to world for viewport ${this.id} because the WSI view is not ready.`
      );
    }

    return computedCamera.canvasToWorld(canvasPos);
  }

  worldToCanvas(worldPos: Point3): Point2 {
    const computedCamera = this.getComputedCamera();

    if (!computedCamera) {
      throw new Error(
        `[WSIViewportV2] Cannot convert world to canvas for viewport ${this.id} because the WSI view is not ready.`
      );
    }

    return computedCamera.worldToCanvas(worldPos);
  }

  override getFrameOfReferenceUID(): string {
    return (
      this.getComputedCamera()?.getFrameOfReferenceUID() ??
      `${this.type}-viewport-${this.id}`
    );
  }

  protected getCameraForEvent(): ICamera {
    return (
      this.getComputedCamera()?.toICamera() ?? {
        parallelProjection: true,
        focalPoint: [0, 0, 0],
        position: [0, 0, 0],
        viewUp: [0, -1, 0],
        parallelScale: 1,
        viewPlaneNormal: [0, 0, 1],
        rotation: this.camera.rotation ?? 0,
      }
    );
  }

  private applyComputedCameraState(nextCamera: WSICamera): void {
    const previousCamera = this.getCameraForEvent();

    this.camera = this.normalizeCamera(nextCamera);
    this.modified(previousCamera);
  }

  render(): void {
    if (this.isDestroyed) {
      return;
    }

    this.renderBindings();
  }

  public override destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    const rendering = this.getWSIRendering();
    const map = rendering?.map;
    const viewer = rendering?.viewer;
    const view = map?.getView?.();

    super.destroy();
    this.clearGlobalDebugRefs({ map, viewer, view });
  }

  protected override onDestroy(): void {
    this.activeDataId = undefined;
  }

  customRenderViewportToCanvas(): void {
    this.render();
  }

  setRendered(): void {
    // No-op for DOM-driven WSI rendering.
  }

  removeData(dataId: string): void {
    super.removeData(dataId);

    if (this.activeDataId === dataId) {
      this.activeDataId = this.bindings.keys().next().value;
    }
  }

  protected getCurrentBinding():
    | RenderingBinding<WSIDataPresentation>
    | undefined {
    return (
      (this.activeDataId ? this.getBinding(this.activeDataId) : undefined) ??
      this.getFirstBinding()
    );
  }

  private applyVOIToRendering(): void {
    const filter = buildWSIColorTransform(this.voiRange, this.averageWhite);
    const viewport = this.getMap()?.getViewport();

    if (!viewport) {
      return;
    }

    viewport.querySelectorAll('.ol-layers canvas').forEach((canvas) => {
      (canvas as HTMLCanvasElement).style.filter = filter || '';
    });
  }

  private syncCameraFromView(): void {
    const view = this.getView();

    if (!view) {
      return;
    }

    const centerIndex = view.getCenter();

    this.camera = this.normalizeCamera({
      ...this.camera,
      zoom: view.getZoom(),
      rotation: view.getRotation(),
      resolution: view.getResolution(),
      centerIndex: centerIndex ? [centerIndex[0], centerIndex[1]] : undefined,
    });
  }

  private getMap(): WSIMapLike | undefined {
    return this.getWSIRendering()?.map;
  }

  private getWSIData(): WSIPayload | undefined {
    const binding = this.getCurrentBinding();

    if (!binding || !isWSIPayload(binding.data)) {
      return;
    }

    return binding.data;
  }

  private getWSIRendering(): WSIRendering | undefined {
    const binding = this.getCurrentBinding();

    if (!binding || !isWSIRendering(binding.rendering)) {
      return;
    }

    return binding.rendering;
  }

  private clearGlobalDebugRefs(args: {
    map?: WSIMapLike;
    viewer?: WSIViewerLike;
    view?: WSIMapViewLike;
  }): void {
    if (typeof window === 'undefined') {
      return;
    }

    const anyWindow = window as Window & {
      map?: WSIMapLike;
      viewer?: WSIViewerLike;
      view?: WSIMapViewLike;
      wsi?: WSIViewportV2;
    };

    if (anyWindow.wsi !== this) {
      return;
    }

    if (args.map && anyWindow.map === args.map) {
      delete anyWindow.map;
    }

    if (args.viewer && anyWindow.viewer === args.viewer) {
      delete anyWindow.viewer;
    }

    if (args.view && anyWindow.view === args.view) {
      delete anyWindow.view;
    }

    delete anyWindow.wsi;
  }
}

export default WSIViewportV2;

function isWSIPayload(data: LoadedData): data is LoadedData<WSIPayload> {
  if (typeof data !== 'object' || data === null || data.type !== 'wsi') {
    return false;
  }

  const payload = data as Record<string, unknown>;

  return (
    Array.isArray(payload.imageIds) &&
    typeof payload.client === 'object' &&
    payload.client !== null &&
    typeof payload.metadata === 'object' &&
    payload.metadata !== null &&
    typeof payload.frameOfReferenceUID !== 'undefined' &&
    payload.imageURISet instanceof Set
  );
}

function isWSIRendering(rendering: {
  renderMode: string;
}): rendering is WSIRendering {
  return rendering.renderMode === 'wsi2d';
}
