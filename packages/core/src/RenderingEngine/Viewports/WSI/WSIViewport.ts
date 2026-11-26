import { ViewportType } from '../../../enums';
import type {
  CPUIImageData,
  Point2,
  Point3,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import type {
  WSIMapLike,
  WSIMapViewLike,
  WSIViewerLike,
} from '../../../utilities/WSIUtilities';
import type { BindingRole, LoadedData } from '../ViewportArchitectureTypes';
import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import BaseViewport from '../BaseViewport';
import type { ViewReferenceContext } from '../viewReferenceCompatibility';
import { DefaultWSIDataProvider } from './DefaultWSIDataProvider';
import { createWSIRenderPathResolver } from './WSIRenderPathResolver';
import type {
  WSIDisplaySetAppearance,
  WSIMountOptions,
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

export default class WSIViewport extends BaseViewport<
  WSIViewState,
  WSIDisplaySetAppearance,
  WSIViewportRenderContext
> {
  readonly type = ViewportType.WHOLE_SLIDE;
  readonly renderingEngineId: string;
  modality = 'SM';

  /**
   * The canvas of the viewport element, as on the legacy viewport, for the
   * tools that read its size. The microscopy viewer draws the slide, so this
   * canvas holds no pixels of it.
   */
  readonly canvas: HTMLCanvasElement;

  protected renderContext: WSIViewportRenderContext;

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: WSIViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas || getOrCreateCanvas(this.element);
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultWSIDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createWSIRenderPathResolver();
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'wsi',
      element: this.element,
      markRendered: () => this.markMapRendered(),
    };
    this.viewState = {
      rotation: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  /**
   * Clamps the zoom and the resolution. A view state without a zoom keeps
   * none, so that a mount keeps the view that the microscopy viewer fits to
   * the canvas, as the legacy viewport does.
   */
  protected override normalizeViewState(camera: WSIViewState): WSIViewState {
    return {
      ...camera,
      zoom:
        typeof camera.zoom === 'number'
          ? Math.max(camera.zoom, 0.001)
          : undefined,
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

  /**
   * Mounts the slides. The microscopy viewer fits each slide to the canvas,
   * as on the legacy viewport: a slide mounted in place of another one drops
   * the zoom, the resolution and the centre of the view, and keeps the
   * rotation. DISPLAY_SETS_CHANGED fires once the slides are mounted; a
   * newer call stops this one, which then fires nothing. The option
   * `appearance` of an entry is the appearance of the slide from its first
   * draw (its window, average white and opacity), merged over the overrides
   * set before the mount; DISPLAY_SET_APPEARANCE_CHANGED fires once for it,
   * with cause `'mount'`. The first entry is the source and the others are
   * overlays, unless an entry names its `role`. Each slide has a microscopy
   * viewer of its own, over the slides before it, and every slide shows the
   * view state of the viewport; the view and the calls without a display
   * set id are those of the source.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: WSIMountOptions;
    }>
  ): Promise<void> {
    const isSuperseded = this.startSetDisplaySets();
    const hadSlide = Boolean(this.getWSIData());

    this.removeAllData();

    if (hadSlide) {
      this.viewState = { rotation: this.viewState.rotation ?? 0 };
    }

    for (const [index, { displaySetId, options }] of entries.entries()) {
      const bound = await this.mountSlide(
        displaySetId,
        options,
        options?.role ?? (index === 0 ? 'source' : 'overlay'),
        isSuperseded
      );

      if (!bound) {
        return;
      }
    }

    this.syncCameraFromView();
    this.applyVOIToRendering();
    this.triggerDisplaySetsChanged(
      entries.map(({ displaySetId }) => displaySetId)
    );
  }

  /**
   * Mounts one more slide as `setDisplaySets` mounts that entry, and leaves
   * the slides on display as they are. Without a `role` it is the source on
   * a viewport that shows nothing, else an overlay over the slides on
   * display, with the view of the source. DISPLAY_SETS_CHANGED fires once
   * it is mounted. The calls take effect in call order: an add made while a
   * `setDisplaySets` or another add is pending waits for it, and a
   * `setDisplaySets` that starts later ends it (`queueAddDisplaySet`).
   *
   * @param displaySetId - The slide display set to mount.
   * @param options - The options of its mount, as for an entry of
   * `setDisplaySets`.
   */
  async addDisplaySet(
    displaySetId: string,
    options: WSIMountOptions = {}
  ): Promise<void> {
    return this.queueAddDisplaySet(async (isSuperseded) => {
      this.syncCameraFromView();

      const bound = await this.mountSlide(
        displaySetId,
        options,
        this.resolveAddRole(displaySetId, options.role),
        isSuperseded
      );

      if (!bound) {
        return;
      }

      this.syncCameraFromView();
      this.applyVOIToRendering();
      this.triggerDisplaySetsChanged([displaySetId]);
    });
  }

  /**
   * Mounts one slide with the microscopy render path and the appearance of
   * its mount, the one mount of `setDisplaySets` and `addDisplaySet`. Gives
   * false, and puts the overrides from before the call back, when the slide
   * is not bound.
   */
  private async mountSlide(
    displaySetId: string,
    options: WSIMountOptions | undefined,
    role: BindingRole,
    isSuperseded?: () => boolean
  ): Promise<boolean> {
    const restoreAppearance = this.stageMountedAppearance(
      displaySetId,
      { visible: true, opacity: 1 },
      options?.appearance
    );
    let bound = false;

    try {
      bound = await this.bindDisplaySet(
        displaySetId,
        { renderMode: 'wsi2d', role },
        isSuperseded
      );
    } finally {
      if (!bound) {
        restoreAppearance();
      }
    }

    if (bound) {
      this.applyMountedAppearance(displaySetId);
    }

    return bound;
  }

  /**
   * The display sets that the viewport shows, in mount order, each with the
   * options of its mount: the role that it has now. `appearance` is not
   * among them: it was applied once, at the mount, and
   * `getDisplaySetAppearance(displaySetId)` gives the look.
   * `other.setDisplaySets(...viewport.getDisplaySets())` on another whole
   * slide viewport therefore shows the same slides in the same roles.
   */
  override getDisplaySets(): Array<{
    displaySetId: string;
    options: WSIMountOptions;
  }> {
    return Array.from(this.bindings.entries()).map(
      ([displaySetId, binding]) => ({
        displaySetId,
        options: { role: binding.role },
      })
    );
  }

  /**
   * Stores the overrides of a display set as the base class does, and
   * applies its window to its slide, after a change or a reset of its
   * appearance.
   */
  protected override setAppearanceState(
    displaySetId: string,
    props: WSIDisplaySetAppearance
  ): void {
    super.setAppearanceState(displaySetId, props);
    this.applySlideWindow(displaySetId);
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

  /**
   * Writes a patch of the view state to the map view. A patch with a
   * resolution and no zoom drops the zoom, so that the map does not set the
   * old zoom again over the new resolution.
   */
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

      if (typeof cameraPatch.zoom !== 'number') {
        nextPatch.zoom = undefined;
      }
    }

    super.setViewState(nextPatch);
  }

  getResolvedView(): WSIResolvedView | undefined {
    const view = this.getView();
    const data = this.getWSIData();

    if (!view || !data) {
      return;
    }

    const { width, height } = this.getFramingCanvasSize();

    return new WSIResolvedView({
      viewState: this.viewState,
      canvasHeight: height,
      canvasWidth: width,
      frameOfReferenceUID: data.frameOfReferenceUID,
      metadata: data.metadata,
      view,
      fitResolution: this.getFitResolution(view),
    });
  }

  /**
   * The map resolution at which the microscopy viewer fits the slide to the
   * canvas when it mounts it, as `View.fit` computes it: the extent of the
   * map projection, turned by the rotation that the viewer gives the slide,
   * fills the canvas, and a view that snaps resolutions snaps it towards the
   * larger one. It is computed, not kept from the mount: the viewer fits the
   * view again after the mount, when its map has a size. The rotation of the
   * view state does not change it. The canvas is the size that the view is
   * framed at, the last size that it had while the element has none (see
   * `getFramingCanvasSize`).
   *
   * @param view - The map view.
   * @returns The resolution, or undefined without a canvas or an extent.
   */
  private getFitResolution(view: WSIMapViewLike): number | undefined {
    const extent = view.getProjection?.()?.getExtent?.();
    const { width: canvasWidth, height: canvasHeight } =
      this.getFramingCanvasSize();

    if (!extent || !canvasWidth || !canvasHeight) {
      return;
    }

    const slideRotation = this.getWSIRendering()?.slideRotation ?? 0;
    const cos = Math.abs(Math.cos(slideRotation));
    const sin = Math.abs(Math.sin(slideRotation));
    const width = extent[2] - extent[0];
    const height = extent[3] - extent[1];
    const resolution = Math.max(
      (width * cos + height * sin) / canvasWidth,
      (width * sin + height * cos) / canvasHeight
    );

    return view.getConstrainedResolution?.(resolution, 1) ?? resolution;
  }

  getCurrentImageId(): string | undefined {
    return this.getWSIData()?.imageIds[0];
  }

  /**
   * The content mode of the whole slide family: `wholeSlide` once a slide is
   * mounted, `empty` before. `utilities.getViewportContentMode` gives
   * `wholeSlide` for the legacy whole slide viewport too.
   */
  getCurrentMode(): ViewportContentMode {
    return this.getSourceBinding() ? 'wholeSlide' : 'empty';
  }

  getViewReference(_specifier: ViewReferenceSpecifier = {}): ViewReference {
    const displaySetId = this.getCurrentBinding()?.data.id;

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      displaySetId,
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

  /**
   * Turns the view back to the orientation that the microscopy viewer gives
   * the slide and fires CAMERA_RESET. The zoom and the centre stay as they
   * are.
   */
  resetViewState(): boolean {
    this.syncCameraFromView();

    if (this.viewState.rotation) {
      this.setViewState({ rotation: 0 });
    }

    this.triggerCameraResetEvent();

    return true;
  }

  getNumberOfSlices(): number {
    return 1;
  }

  resize(): void {
    if (this.isDestroyed) {
      return;
    }

    const pending = this.takePendingViewFraming();

    this.resizeBindings();
    this.render();
    this.applyPendingViewFraming(pending);
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

  /**
   * The rotation of the view in degrees on top of the orientation of the
   * slide, as the view state gives it. It is 0 until the view is turned.
   */
  getRotation(): number {
    this.syncCameraFromView();

    return this.viewState.rotation ?? 0;
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

  /**
   * Applies a resolved WSI view state through the canonical mutation path.
   */
  private applyResolvedViewState(nextViewState: WSIViewState): void {
    this.setViewState(nextViewState);
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

  customRenderViewportToCanvas(): void {
    this.render();
  }

  /**
   * The rendering engine calls this after its pass, in which a whole slide
   * viewport only asks the map to draw (`customRenderViewportToCanvas`): the
   * map draws in a frame of its own and loads the tiles of the view after it.
   * So the pass does not make the viewport rendered; the map does, when it
   * has drawn the tiles of its view (`markMapRendered`).
   */
  setRendered(): void {}

  /**
   * The map has drawn the tiles of its view at the current resolution (its
   * `rendercomplete`): the viewport is rendered, and keeps the canvas size of
   * its framing, as the rendering engine marks the other families after it
   * drew them. It runs again each time the map completes a draw, after the
   * tiles of a new view arrive; `IMAGE_RENDERED` fires for every frame of the
   * map (`postrender`), also while tiles still load.
   */
  private markMapRendered(): void {
    super.setRendered();
  }

  /**
   * The reference context of the slide. The focal point and the normal
   * `[0, 0, 1]` of the legacy camera let a reference saved on a legacy WSI
   * viewport, which carries a view plane normal and a plane restriction,
   * show here.
   */
  protected getReferenceViewContexts(): ViewReferenceContext[] {
    const binding = this.getCurrentBinding();
    const data = this.getWSIData();

    if (!binding || !data) {
      return super.getReferenceViewContexts();
    }

    const camera = this.getResolvedView()?.toICamera();

    return [
      {
        cameraFocalPoint: camera?.focalPoint,
        viewPlaneNormal: camera?.viewPlaneNormal,
        displaySetId: binding.data.id,
        displaySetIds: [binding.data.id],
        frameOfReferenceUID: data.frameOfReferenceUID ?? undefined,
        imageIds: data.imageIds,
        imageURIs: Array.from(data.imageURISet),
        allowAnyImageReference: true,
        currentImageIdIndex: 0,
      },
    ];
  }

  /** Applies the window of each slide on display to its slide. */
  private applyVOIToRendering(): void {
    for (const displaySetId of this.bindings.keys()) {
      this.applySlideWindow(displaySetId);
    }
  }

  /**
   * Applies the window and the average white of a slide to the layers of
   * the map that draws it. Each slide has a map of its own, so a slide that
   * is not the source keeps its own window.
   */
  private applySlideWindow(displaySetId: string): void {
    const rendering = this.getBinding(displaySetId)?.rendering;

    if (!rendering || !isWSIRendering(rendering)) {
      return;
    }

    const appearance = this.getEffectiveDisplaySetAppearance(displaySetId);
    const filter = buildWSIColorTransform(
      appearance?.voiRange || {
        lower: 0,
        upper: 255,
      },
      appearance?.averageWhite
    );
    const viewport = rendering.map?.getViewport();

    if (!viewport) {
      return;
    }

    viewport.querySelectorAll('.ol-layers canvas').forEach((canvas) => {
      (canvas as HTMLCanvasElement).style.filter = filter || '';
    });
  }

  /**
   * Reads the view state back from the map view. The rotation is the one of
   * the map less the rotation of the slide, in degrees.
   */
  private syncCameraFromView(): void {
    const view = this.getView();

    if (!view) {
      return;
    }

    const centerIndex = view.getCenter();

    this.viewState = this.normalizeViewState({
      ...this.viewState,
      zoom: view.getZoom(),
      rotation:
        ((view.getRotation() - (this.getWSIRendering()?.slideRotation ?? 0)) *
          180) /
        Math.PI,
      resolution: view.getResolution(),
      centerIndex: centerIndex ? [centerIndex[0], centerIndex[1]] : undefined,
    });
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
