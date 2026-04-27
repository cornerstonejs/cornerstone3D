import { ViewportType } from '../../../enums';
import type {
  CPUIImageData,
  Point2,
  Point3,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type {
  WSIMapLike,
  WSIMapViewLike,
  WSIViewerLike,
} from '../../../utilities/WSIUtilities';
import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type {
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import ViewportNext from '../ViewportNext';
import type { ViewportNextReferenceContext } from '../viewportNextReferenceCompatibility';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderPath';
import type {
  WSIDataPresentation,
  WSIPayload,
  WSIViewState,
  WSIViewportRenderContext,
  WSIViewportInput,
  WSIRendering,
} from './WSIViewportTypes';
import {
  buildWSIColorTransform,
  buildWSIImageData,
  computeWSITransforms,
  indexToWorldWSIMetadata,
  worldToIndexWSIMetadata,
} from './wsiTransformUtils';
import WSIResolvedView from './WSIResolvedView';

defaultRenderPathResolver.register(new DicomMicroscopyPath());

export default class WSIViewport extends ViewportNext<
  WSIViewState,
  WSIDataPresentation,
  WSIViewportRenderContext
> {
  readonly type = ViewportType.WHOLE_SLIDE_NEXT;
  readonly renderingEngineId: string;
  modality = 'SM';

  protected renderContext: WSIViewportRenderContext;

  private activeDataId?: string;

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: WSIViewportInput) {
    super(args);
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
    this.viewState = {
      zoom: 1,
      rotation: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  protected override normalizeViewState(camera: WSIViewState): WSIViewState {
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

  async setDataList(entries: Array<{ dataId: string }>): Promise<void> {
    for (const [index, { dataId }] of entries.entries()) {
      await this.addData(dataId, {
        renderMode: 'wsi2d',
        role: index === 0 ? 'source' : 'overlay',
      });

      this.setDefaultDataPresentation(dataId, {
        visible: true,
        opacity: 1,
      });
      this.activeDataId = dataId;
    }

    this.syncCameraFromView();
    this.applyVOIToRendering();
  }

  setDataPresentation(
    dataId: string,
    props: Partial<WSIDataPresentation>
  ): void {
    super.setDataPresentation(dataId, props);

    if (dataId === this.getActiveDataId()) {
      this.applyVOIToRendering();
    }
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

  setViewState(cameraPatch: Partial<WSIViewState>): void {
    this.syncCameraFromView();

    const view = this.getView();
    if (!view) {
      super.setViewState(cameraPatch);
      return;
    }

    const nextPatch: Partial<WSIViewState> = {};

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

    if (typeof cameraPatch.resolution === 'number') {
      nextPatch.resolution = Math.max(cameraPatch.resolution, 0.000001);
    }

    super.setViewState(nextPatch);
  }

  getResolvedView(): WSIResolvedView | undefined {
    const view = this.getView();
    const data = this.getWSIData();

    if (!view || !data) {
      return;
    }

    return new WSIResolvedView({
      viewState: this.viewState,
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

  getViewPresentation(
    viewPresSel: ViewPresentationSelector = {
      zoom: true,
      rotation: true,
    }
  ): ViewPresentation {
    const target: ViewPresentation = {};

    if (viewPresSel.zoom) {
      target.zoom = this.getZoom();
    }

    if (viewPresSel.rotation) {
      target.rotation = this.getRotation();
    }

    return target;
  }

  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const cameraPatch: Partial<WSIViewState> = {};

    if (typeof viewPres.zoom === 'number') {
      cameraPatch.zoom = viewPres.zoom;
    }

    if (typeof viewPres.rotation === 'number') {
      cameraPatch.rotation = viewPres.rotation;
    }

    if (Object.keys(cameraPatch).length) {
      this.setViewState(cameraPatch);
    }
  }

  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    const dataId = this.getCurrentBinding()?.data.id;

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      dataId,
      referencedImageId: this.getCurrentImageId(),
      sliceIndex: 0,
    };
  }

  setViewReference(_viewRef: ViewReference): void {
    // No-op for current single-image whole-slide workflows.
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
        `[WSIViewport] Cannot convert world to index for viewport ${this.id} because the WSI transform runtime is not ready.`
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
        `[WSIViewport] Cannot convert index to world for viewport ${this.id} because the WSI transform runtime is not ready.`
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
    const resolution =
      this.getView()?.getResolution?.() ?? this.viewState.resolution ?? 1;

    this.setViewState({
      resolution: Math.max(resolution * (1 + 0.1 * delta), 0.000001),
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
      wsi?: WSIViewport;
    };

    anyWindow.map = rendering?.map;
    anyWindow.viewer = rendering?.viewer;
    anyWindow.view = view;
    anyWindow.wsi = this;

    return view;
  }

  getZoom(): number {
    return Math.max(
      this.getView()?.getZoom?.() ?? this.viewState.zoom ?? 1,
      0.001
    );
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withZoom(zoom, canvasPoint).state.viewState
      );
      return;
    }

    this.setViewState({
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

  private applyResolvedViewState(nextCamera: WSIViewState): void {
    const previousCamera = this.getCameraForEvent();

    this.viewState = this.normalizeViewState(nextCamera);
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
      this.applyVOIToRendering();
    }
  }

  protected getCurrentBinding():
    | ViewportDataBinding<WSIDataPresentation>
    | undefined {
    return (
      (this.activeDataId ? this.getBinding(this.activeDataId) : undefined) ??
      this.getFirstBinding()
    );
  }

  protected getActiveDataId(): string | undefined {
    return this.activeDataId;
  }

  protected getReferenceViewContexts(): ViewportNextReferenceContext[] {
    const binding = this.getCurrentBinding();
    const data = this.getWSIData();

    if (!binding || !data) {
      return super.getReferenceViewContexts();
    }

    return [
      {
        dataId: binding.data.id,
        dataIds: [binding.data.id],
        frameOfReferenceUID: data.frameOfReferenceUID ?? undefined,
        imageIds: data.imageIds,
        imageURIs: Array.from(data.imageURISet),
        allowAnyImageReference: true,
        currentImageIdIndex: 0,
      },
    ];
  }

  private applyVOIToRendering(): void {
    const activeDataId = this.getActiveDataId();
    const dataPresentation = activeDataId
      ? this.getDataPresentation(activeDataId)
      : undefined;
    const filter = buildWSIColorTransform(
      dataPresentation?.voiRange || {
        lower: 0,
        upper: 255,
      },
      dataPresentation?.averageWhite
    );
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

    this.viewState = this.normalizeViewState({
      ...this.viewState,
      zoom: view.getZoom(),
      rotation: view.getRotation(),
      resolution: view.getResolution(),
      centerIndex: centerIndex ? [centerIndex[0], centerIndex[1]] : undefined,
    });
  }

  private getMap(): WSIMapLike | undefined {
    return this.getWSIRendering()?.map;
  }

  protected getWSIData(): WSIPayload | undefined {
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
      wsi?: WSIViewport;
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
