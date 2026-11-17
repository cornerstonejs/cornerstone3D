import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import {
  getRenderSurfaceForRenderMode,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import type {
  ActorEntry,
  CPUIImageData,
  ICamera,
  IImage,
  IImageData,
  IVolumeInput,
  IVolumeViewport,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  Scaling,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import { ActorRenderMode } from '../../../types';
import type BlendModes from '../../../enums/BlendModes';
import InterpolationType from '../../../enums/InterpolationType';
import MetadataModules from '../../../enums/MetadataModules';
import { getShouldUseCPURendering } from '../../../init';
import * as metaData from '../../../metaData';
import { getValidVOILUTFunction } from '../../../utilities/buildMetadata';
import clonePoint3 from '../../../utilities/clonePoint3';
import getClosestImageId from '../../../utilities/getClosestImageId';
import hasOwn from '../../../utilities/hasOwn';
import imageIdToURI from '../../../utilities/imageIdToURI';
import transformWorldToIndex from '../../../utilities/transformWorldToIndex';
import genericViewportDisplaySetMetadataProvider from '../../../utilities/genericViewportDisplaySetMetadataProvider';
import { viewportProjection } from '../viewportProjection';
import { isPointNearImagePlane } from '../genericViewportReferenceCompatibility';
import {
  getPlanarLegacyScaling,
  getPlanarLegacySliceViewInfo,
  type PlanarLegacyViewportProperties,
} from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import PlanarViewport, {
  type PlanarResetViewStateOptions,
  type PlanarScrollOptions,
} from './PlanarViewport';
import type { PlanarScaleInput } from './planarCameraScale';
import { getPlanarViewStateCanvasDimensions } from './PlanarResolvedView';
import { getFitParallelScaleFromWorldSize } from './planarSliceBasis';
import { cloneDisplayArea } from './planarViewState';
import { coreLog } from '../../../utilities/logger';
import type {
  PlanarResolvedICamera,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewState,
} from './PlanarViewportTypes';

const log = coreLog.getLogger('RenderingEngine', 'PlanarViewportLegacyAdapter');

class PlanarViewportLegacyAdapter extends PlanarViewport {
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController(
      this.createLegacyCompatibilityHost()
    );

  /**
   * False until the rendering engine disables the viewport, as on the legacy
   * viewports. The engine sets it to true.
   */
  isDisabled = false;

  /** The animation frame of the CPU draw that `render` asked for. */
  private cpuRenderFrame: number | undefined;

  /** The legacy viewports keep their 4.x display, so no acquired frames. */
  protected override prefersAcquiredFrames(): boolean {
    return false;
  }

  /**
   * With the legacy CPU switch on (`rendering.useCPURendering`) the adapter
   * draws a LINEAR image once for each change, as the legacy CPU stack
   * viewport does. Without the switch the CPU draws because the GPU cannot,
   * so the image is drawn once more at rest and shows what the GPU draws.
   */
  protected override prefersFinerImageAtRest(): boolean {
    return !getShouldUseCPURendering();
  }

  private cloneTuple<T extends ArrayLike<number> | undefined>(
    tuple: T
  ): T extends undefined ? undefined : [number, number, number] {
    if (!tuple) {
      return undefined as T extends undefined
        ? undefined
        : [number, number, number];
    }

    return Array.from(tuple) as T extends undefined
      ? undefined
      : [number, number, number];
  }

  getCamera(): PlanarViewState & ICamera<PlanarScaleInput> {
    const viewState = this.getViewState();
    const camera = {
      ...viewState,
      ...this.getCameraForEvent(),
    } as PlanarViewState & ICamera<PlanarScaleInput>;
    const orientation =
      viewState.orientation && typeof viewState.orientation === 'object'
        ? {
            ...viewState.orientation,
            viewUp: this.cloneTuple(viewState.orientation.viewUp),
            viewPlaneNormal: this.cloneTuple(
              viewState.orientation.viewPlaneNormal
            ),
          }
        : viewState.orientation;

    return {
      ...camera,
      focalPoint: this.cloneTuple(camera.focalPoint),
      position: this.cloneTuple(camera.position),
      viewUp: this.cloneTuple(camera.viewUp),
      viewPlaneNormal: this.cloneTuple(camera.viewPlaneNormal),
      orientation,
    };
  }

  setCamera(
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    const viewStatePatch: Partial<PlanarViewState> = {};

    this.applyLegacyPlanarPresentationPatch(viewStatePatch, cameraPatch);
    this.applyLegacyParallelScalePatch(viewStatePatch, cameraPatch);
    this.applyLegacyOrientationPatch(viewStatePatch, cameraPatch);
    this.applyLegacyFocalPointPatch(viewStatePatch, cameraPatch);

    if (
      cameraPatch.position &&
      !cameraPatch.focalPoint &&
      !Object.keys(viewStatePatch).length
    ) {
      this.warnUnsupportedPositionOnlyCameraPatch();
      return;
    }

    if (!Object.keys(viewStatePatch).length) {
      return;
    }

    this.setViewState(viewStatePatch);
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should read
   * presentation through `viewportProjection.getPresentation`.
   */
  getViewPresentation(
    selector?: PlanarViewPresentationSelector
  ): PlanarViewPresentation | undefined {
    return viewportProjection.getPresentation<PlanarViewPresentation>(this, {
      selector,
    });
  }

  /**
   * Compatibility wrapper for legacy callers. Next viewports should use
   * viewport projection to derive view state, then call `setViewState`.
   */
  setViewPresentation(viewPres?: PlanarViewPresentation): void {
    if (!viewPres) {
      return;
    }

    if (hasOwn(viewPres, 'displayArea')) {
      this.options = {
        ...this.options,
        displayArea: cloneDisplayArea(viewPres.displayArea),
      };
    }

    const nextViewState = viewportProjection.withPresentation<
      PlanarViewState,
      PlanarViewPresentation
    >(this, viewPres);

    if (nextViewState) {
      this.setViewState(nextViewState);
    }
  }

  /**
   * Compatibility wrapper for legacy callers. Direct Next viewports should use
   * `resetViewState`.
   */
  resetCamera(
    options?: Parameters<PlanarViewport['resetViewState']>[0]
  ): boolean {
    return this.resetViewState(options);
  }

  /**
   * Compatibility wrapper for rendering engines and legacy callers that still
   * use the resize-specific camera reset hook.
   */
  resetCameraForResize(): boolean {
    return this.resetViewStateForResize();
  }

  /**
   * The stretch of the view as `[widthRatio, heightRatio]`, as the legacy
   * `getAspectRatio`: the ratio of the horizontal to the vertical scale of
   * the view state, so `[1, 1]` when the view is not stretched.
   */
  override getAspectRatio(): Point2 {
    const [scaleX, scaleY] = this.getScale();

    return scaleY ? [scaleX / scaleY, 1] : [1, 1];
  }

  /**
   * Stretches the view by an aspect ratio `[widthRatio, heightRatio]`, as the
   * legacy `setAspectRatio`: the horizontal scale stays, unless `fit` is set,
   * which fits the stretched image into the canvas. `storeAsInitialCamera`
   * keeps the aspect ratio in the options, so that a reset applies it again.
   */
  setAspectRatio(
    aspectRatio: Point2,
    options: { fit?: boolean; storeAsInitialCamera?: boolean } = {}
  ): void {
    const scale = this.getAspectRatioScale(aspectRatio, Boolean(options.fit));

    if (!scale) {
      return;
    }

    if (options.storeAsInitialCamera) {
      this.options = {
        ...this.options,
        aspectRatio: [...aspectRatio] as Point2,
      };
    }

    this.setViewState({ scale });
  }

  /**
   * The scale of the view state for an aspect ratio: the horizontal scale is
   * the vertical one times `widthRatio / heightRatio`. Without `fit` the
   * horizontal scale of the view stays, as the legacy viewports keep it;
   * with `fit` the scale fits the stretched image, as the legacy viewports
   * fit an image with an aspect ratio.
   */
  private getAspectRatioScale(
    aspectRatio: Point2,
    fit: boolean
  ): Point2 | undefined {
    const [widthRatio, heightRatio] = aspectRatio ?? [];

    if (!(widthRatio > 0 && heightRatio > 0)) {
      return;
    }

    const stretch = widthRatio / heightRatio;

    if (!fit) {
      const [scaleX] = this.getScale();

      return [scaleX, scaleX / stretch];
    }

    const scaleY = this.getStretchedFitScale(stretch);

    return [scaleY * stretch, scaleY];
  }

  /**
   * The vertical scale, against the fit of the image, at which the image
   * stretched horizontally by `stretch` fits into the canvas.
   */
  private getStretchedFitScale(stretch: number): number {
    const sliceBasis = this.getResolvedView()?.getSliceBasis();

    if (!sliceBasis) {
      return 1;
    }

    const rendering = this.getCurrentPlanarRendering();
    const { canvasWidth, canvasHeight } = rendering
      ? getPlanarViewStateCanvasDimensions({
          renderContext: this.renderContext,
          rendering,
        })
      : { canvasWidth: 0, canvasHeight: 0 };
    const getFit = (widthStretch: number) =>
      getFitParallelScaleFromWorldSize({
        canvasWidth: canvasWidth || this.element.clientWidth,
        canvasHeight: canvasHeight || this.element.clientHeight,
        widthWorld: sliceBasis.sliceWidthWorld * widthStretch,
        heightWorld: sliceBasis.sliceHeightWorld,
      });

    return getFit(1) / getFit(stretch);
  }

  /**
   * The view state of the `aspectRatio` and `displayArea` options, as the
   * legacy `resetCamera` applies them: the fitted stretch of the aspect
   * ratio, and with `withDisplayArea` the display area.
   */
  private getOptionsViewState(
    withDisplayArea: boolean
  ): Partial<PlanarViewState> {
    const { aspectRatio, displayArea } = this.options;
    const viewState: Partial<PlanarViewState> = {};
    const scale = aspectRatio
      ? this.getAspectRatioScale(aspectRatio, true)
      : undefined;

    if (withDisplayArea && displayArea) {
      viewState.anchorCanvas = [0.5, 0.5];
      viewState.anchorWorld = undefined;
      viewState.displayArea = cloneDisplayArea(displayArea);
      viewState.scale = scale ?? [1, 1];
      viewState.scaleMode = displayArea.scaleMode ?? 'fit';
    } else if (scale) {
      viewState.scale = scale;
    }

    return viewState;
  }

  /**
   * Puts the `aspectRatio` and `displayArea` options into the view state, as
   * the legacy viewports apply them when they show their first image and
   * again at a reset of the zoom. Once the source is mounted it fires no
   * camera event: the mount fires one. A reset that keeps the pan leaves the
   * display area out.
   */
  protected override applyLegacyOptionsViewState(
    reset?: PlanarResetViewStateOptions
  ): void {
    if (reset && !reset.resetZoom) {
      return;
    }

    const optionsViewState = this.getOptionsViewState(
      reset ? reset.resetPan : true
    );

    if (!Object.keys(optionsViewState).length) {
      return;
    }

    if (reset) {
      this.setViewState(optionsViewState);

      return;
    }

    this.viewState = this.normalizeViewState({
      ...this.viewState,
      ...optionsViewState,
    });
    this.modified();
  }

  get volumeIds(): Set<string> {
    const ids = new Set<string>();

    for (const actorEntry of this.getActors()) {
      const candidates = [actorEntry.referencedId, actorEntry.uid];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && cache.getVolume(candidate)) {
          ids.add(candidate);
        }
      }
    }

    return ids;
  }

  get csImage(): IImage | undefined {
    return this.getCornerstoneImage();
  }

  getCornerstoneImage(): IImage | undefined {
    const planarData = this.getCurrentBinding()?.data as
      | { image?: IImage }
      | undefined;

    return planarData?.image;
  }

  getAllVolumeIds(): string[] {
    return Array.from(this.volumeIds);
  }

  /**
   * The modality of the image that the viewport shows, from the general
   * series module of that image, as the legacy stack viewport keeps it. In
   * volume mode off the acquisition plane it is the modality of the first
   * image of the volume. Null when the viewport shows no image.
   */
  get modality(): string {
    const imageId = this.getLegacyImageId();

    return (
      (imageId
        ? metaData.get(MetadataModules.GENERAL_SERIES, imageId)?.modality
        : undefined) ?? null
    );
  }

  /**
   * The PT scaling of the image that the viewport shows, as the legacy stack
   * viewport keeps it. The legacy viewport keeps the first PT scaling it sees
   * for later stacks too; the adapter reads the current image.
   */
  get scaling(): Scaling {
    return getPlanarLegacyScaling(this.getLegacyImageId());
  }

  /**
   * Whether the viewport draws its current data on the CPU canvas. The legacy
   * viewports fix this when they are made; the next viewport chooses the
   * render path per display set, so the adapter reads the path that draws.
   */
  get useCPURendering(): boolean {
    return (
      getRenderSurfaceForRenderMode(
        this.getCurrentPlanarRendering()?.renderMode
      ) === 'cpu'
    );
  }

  /**
   * Whether the image shown last needed new image data on the GPU image path,
   * because it is the first image or its size, data type or number of
   * components differs from the image before it, as `stackActorReInitialized`
   * of the legacy stack viewport. A tool then makes again what it built for
   * the old image data. False on the CPU path and in volume mode, where the
   * legacy viewports do not set it.
   */
  get stackActorReInitialized(): boolean {
    const rendering = this.getCurrentPlanarRendering();

    return (
      rendering?.renderMode === ActorRenderMode.VTK_IMAGE &&
      rendering.newImageData
    );
  }

  /**
   * The image id that the viewport shows, or the one of a view reference
   * specifier. A number is a slice index, as the legacy viewports take it: in
   * stack mode it gives the image id at that index, as the legacy stack
   * viewport does, and in volume mode it is ignored, as the legacy volume
   * viewport ignores it.
   */
  getCurrentImageId(
    viewRefSpecifierOrIndex: ViewReferenceSpecifier | number = {}
  ): string | undefined {
    if (typeof viewRefSpecifierOrIndex !== 'number') {
      return super.getCurrentImageId(viewRefSpecifierOrIndex);
    }

    if (this.getCurrentMode() === 'stack') {
      return this.getImageIds()[viewRefSpecifierOrIndex];
    }

    return super.getCurrentImageId();
  }

  /**
   * The image index that the viewport goes to. In stack mode this is the
   * index of the last request, which can be ahead of the image that is drawn
   * while that image loads, as `getTargetImageIdIndex` of the legacy stack
   * viewport. Otherwise it is the current image index.
   */
  getTargetImageIdIndex(): number {
    const { slice } = this.getViewState();

    if (this.getCurrentMode() === 'stack' && slice?.kind === 'stackIndex') {
      return slice.imageIdIndex;
    }

    return super.getCurrentImageIdIndex();
  }

  /**
   * Whether a view reference can be shown, as the next viewport answers. In
   * stack mode `asNearbyProjection` takes a reference by a focal point only
   * as viewable when the point lies within half a slice spacing of the image
   * shown, as the legacy stack viewport does.
   */
  isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    const isViewable = super.isReferenceViewable(viewRef, options);

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
   * The index in the image ids of an image id, an image URI or the referenced
   * image of a view reference, as the legacy stack viewport finds it.
   * Undefined when the viewport does not have that image.
   */
  getSliceIndexForImage(reference: string | ViewReference): number {
    const imageKey =
      typeof reference === 'string' ? reference : reference?.referencedImageId;

    if (!imageKey) {
      return;
    }

    const imageIds = this.getImageIds();

    for (let index = imageIds.length - 1; index >= 0; index--) {
      if (
        imageIds[index] === imageKey ||
        imageIdToURI(imageIds[index]) === imageKey
      ) {
        return index;
      }
    }
  }

  /**
   * Shows the slice that holds a world point. In stack mode it goes to the
   * image closest to the point, as the legacy stack viewport does, and gives
   * false when no image is in the view direction. In volume mode it moves the
   * slice to the plane through the point, clamped to the bounds of the
   * volume, as the legacy volume viewport does, and keeps pan and zoom.
   */
  jumpToWorld(worldPos: Point3): boolean {
    if (this.getCurrentMode() === 'volume') {
      const bounds = (
        this.getImageData() as IImageData | undefined
      )?.imageData?.getBounds();
      const sliceWorldPoint = bounds
        ? ([
            Math.max(bounds[0], Math.min(bounds[1], worldPos[0])),
            Math.max(bounds[2], Math.min(bounds[3], worldPos[1])),
            Math.max(bounds[4], Math.min(bounds[5], worldPos[2])),
          ] as Point3)
        : ([...worldPos] as Point3);

      this.setViewState({ slice: { kind: 'volumePoint', sliceWorldPoint } });
      this.render();

      return true;
    }

    const imageIds = this.getImageIds();
    const imageData = this.getImageData() as CPUIImageData | undefined;

    if (!imageData) {
      return false;
    }

    const imageId = getClosestImageId(
      { direction: imageData.direction, spacing: imageData.spacing, imageIds },
      worldPos,
      this.getCameraForEvent().viewPlaneNormal,
      { ignoreSpacing: true }
    );
    const index = imageIds.indexOf(imageId);

    if (index === -1) {
      return false;
    }

    this.setImageIdIndex(index);
    this.render();

    return true;
  }

  /**
   * Whether the view looks along the acquisition direction. Always true in
   * stack mode, as on the legacy stack viewport. In volume mode the view
   * plane normal must lie within 0.99 of the slice direction of the volume,
   * as on the legacy volume viewport.
   */
  isInAcquisitionPlane(): boolean {
    if (this.getCurrentMode() === 'stack') {
      return true;
    }

    const imageData = this.getImageData() as IImageData | undefined;

    if (!imageData) {
      return false;
    }

    const { direction } = imageData;
    const { viewPlaneNormal } = this.getCameraForEvent();

    return (
      Math.abs(
        vec3.dot(viewPlaneNormal, [direction[6], direction[7], direction[8]])
      ) > 0.99
    );
  }

  /**
   * False. The orientation marker tool, the one caller, puts its own vtk.js
   * actors into the renderer and turns the vtk.js camera, which the adapter
   * does not give (`getRenderer`). A volume-mode adapter changes orientation
   * through `setOrientation` and `setViewState`.
   */
  isOrientationChangeable(): boolean {
    return false;
  }

  /**
   * The value of the volume at a world point, as the legacy volume viewport
   * reads it: the voxel nearest the point in the volume that the viewport
   * shows. Undefined in stack mode.
   */
  getIntensityFromWorld(point: Point3): number {
    const volume =
      this.getCurrentMode() === 'volume'
        ? cache.getVolume(this.getVolumeId())
        : undefined;

    if (!volume?.imageData) {
      return;
    }

    const index = transformWorldToIndex(volume.imageData, point);

    return volume.voxelManager.getAtIJKPoint(index) as number;
  }

  /**
   * The world bounds of the volumes of the viewport. The legacy volume
   * viewport gives the bounds of every visible prop of its renderer, which
   * for a volume viewport are its volumes. Undefined in stack mode.
   */
  getBounds(): number[] {
    return this.legacyCompatibility.getVolumeBounds();
  }

  /**
   * The slice view info of a volume-mode viewport, as the legacy volume
   * viewport gives it (see `getPlanarLegacySliceViewInfo`). Throws in stack
   * mode, as the legacy stack viewport does, and for an oblique view.
   */
  getSliceViewInfo(): ReturnType<IVolumeViewport['getSliceViewInfo']> {
    if (this.getCurrentMode() !== 'volume') {
      throw new Error('Method not implemented.');
    }

    return getPlanarLegacySliceViewInfo(
      this as unknown as IVolumeViewport,
      this.getCameraForEvent().viewPlaneNormal,
      this.getSliceIndex()
    );
  }

  /**
   * Scrolls by a number of slices.
   *
   * In stack mode it scrolls as the legacy stack viewport: from the target
   * index, clamped to the stack or wrapped when `loop` is set, and the
   * planar viewport fires STACK_VIEWPORT_SCROLL when the index changes. The
   * next viewport has no debounce, so the second argument has no effect.
   *
   * In volume mode the planar viewport scrolls with the options, as the
   * legacy volume viewport. Without options, as a direct call of the legacy
   * `scroll` method, it steps by the slab thickness when a slab is set.
   */
  scroll(
    delta: number,
    _debounce = true,
    loop = false,
    options?: PlanarScrollOptions
  ): Promise<string> {
    const mode = this.getCurrentMode();

    if (mode === 'volume') {
      return super.scroll(delta, _debounce, loop, {
        scrollSlabs: true,
        ...options,
      });
    }

    const imageIds = this.getImageIds();

    if (mode !== 'stack' || !imageIds.length) {
      return super.scroll(delta);
    }

    const currentIndex = this.getTargetImageIdIndex();
    const nextIndex = loop
      ? (currentIndex + delta + imageIds.length) % imageIds.length
      : currentIndex + delta;

    return this.scrollToImageIdIndex(nextIndex, delta);
  }

  /**
   * The current image index, or in volume mode the step index of a scroll,
   * which counts steps of the slab thickness by default when a slab is set,
   * as the legacy volume viewport counts them.
   */
  override getCurrentImageIdIndex(
    volumeId?: string,
    useSlabThickness = true
  ): number {
    return super.getCurrentImageIdIndex(volumeId, useSlabThickness);
  }

  private getLegacyImageId(): string | undefined {
    return this.getCurrentImageId() ?? this.getImageIds()[0];
  }

  private applyLegacyPlanarPresentationPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (hasOwn(cameraPatch, 'orientation')) {
      viewStatePatch.orientation = cameraPatch.orientation;
    }
    if (hasOwn(cameraPatch, 'anchorWorld')) {
      viewStatePatch.anchorWorld = clonePoint3(cameraPatch.anchorWorld);
    }
    if (hasOwn(cameraPatch, 'anchorCanvas')) {
      viewStatePatch.anchorCanvas = cameraPatch.anchorCanvas
        ? ([...cameraPatch.anchorCanvas] as Point2)
        : undefined;
    }
    if (hasOwn(cameraPatch, 'scale')) {
      viewStatePatch.scale = cameraPatch.scale;
    }
    if (hasOwn(cameraPatch, 'scaleMode')) {
      viewStatePatch.scaleMode = cameraPatch.scaleMode;
    }
    if (hasOwn(cameraPatch, 'rotation')) {
      viewStatePatch.rotation = cameraPatch.rotation;
    }
    if (hasOwn(cameraPatch, 'flipHorizontal')) {
      viewStatePatch.flipHorizontal = cameraPatch.flipHorizontal;
    }
    if (hasOwn(cameraPatch, 'flipVertical')) {
      viewStatePatch.flipVertical = cameraPatch.flipVertical;
    }
    if (hasOwn(cameraPatch, 'displayArea')) {
      viewStatePatch.displayArea = cameraPatch.displayArea;
    }
    if (hasOwn(cameraPatch, 'slice')) {
      viewStatePatch.slice = cameraPatch.slice;
    }
  }

  private applyLegacyParallelScalePatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (typeof cameraPatch.parallelScale !== 'number') {
      return;
    }

    const resolvedICamera = this.getResolvedView()?.toICamera() as
      | PlanarResolvedICamera
      | undefined;

    if (!resolvedICamera || typeof resolvedICamera.parallelScale !== 'number') {
      return;
    }

    const currentScale = this.getScale();
    const currentScaleY = Math.max(
      resolvedICamera.presentationScale?.[1] ?? currentScale[1] ?? 1,
      1e-6
    );
    const currentScaleX = Math.max(
      resolvedICamera.presentationScale?.[0] ??
        currentScale[0] ??
        currentScaleY,
      1e-6
    );
    const fitParallelScale = resolvedICamera.parallelScale * currentScaleY;
    const nextScaleY =
      fitParallelScale / Math.max(cameraPatch.parallelScale, 1e-6);
    const aspectScale = currentScaleX / currentScaleY;

    viewStatePatch.displayArea = undefined;
    viewStatePatch.scale = [nextScaleY * aspectScale, nextScaleY];
    viewStatePatch.scaleMode = 'fit';
  }

  private applyLegacyOrientationPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (!cameraPatch.viewPlaneNormal) {
      return;
    }

    const currentICamera = this.getResolvedView()?.toICamera();

    viewStatePatch.orientation = {
      viewPlaneNormal: [...cameraPatch.viewPlaneNormal] as Point3,
      viewUp: cameraPatch.viewUp
        ? ([...cameraPatch.viewUp] as Point3)
        : currentICamera?.viewUp
          ? ([...currentICamera.viewUp] as Point3)
          : undefined,
    };
  }

  private applyLegacyFocalPointPatch(
    viewStatePatch: Partial<PlanarViewState>,
    cameraPatch: Partial<ICamera<PlanarScaleInput> & PlanarViewState>
  ): void {
    if (!cameraPatch.focalPoint) {
      return;
    }

    const focalPoint = [...cameraPatch.focalPoint] as Point3;

    viewStatePatch.anchorCanvas = [0.5, 0.5];
    viewStatePatch.anchorWorld = focalPoint;
    viewStatePatch.displayArea = undefined;

    if (this.isVolumeSliceRenderingActive()) {
      viewStatePatch.slice = {
        kind: 'volumePoint',
        sliceWorldPoint: focalPoint,
      };
    }
  }

  private isVolumeSliceRenderingActive(): boolean {
    const rendering = this.getCurrentPlanarRendering();

    return isVolumeRenderMode(rendering?.renderMode);
  }

  private warnUnsupportedPositionOnlyCameraPatch(): void {
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'production'
    ) {
      return;
    }

    log.warn(
      '[PlanarViewportLegacyAdapter] Position-only planar camera patches are unsupported. Use focalPoint, parallelScale, or view state APIs.'
    );
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.legacyCompatibility.removeData(dataId);
  }

  /**
   * Legacy actor lookup by internal actor UID.
   */
  getActor(actorEntryUID: string): ActorEntry | undefined {
    return this.getActors().find(
      (actorEntry) => actorEntry.uid === actorEntryUID
    );
  }

  /**
   * Legacy actor removal by internal actor UID.
   */
  removeActors(actorEntryUIDs: string[]): void {
    let didRemoveActor = false;

    actorEntryUIDs
      .filter(
        (actorEntryUID): actorEntryUID is string =>
          typeof actorEntryUID === 'string'
      )
      .forEach((actorEntryUID) => {
        const bindingDataId =
          this.findBindingDataIdByActorEntryUID(actorEntryUID);

        if (bindingDataId) {
          if (this.getDisplaySetRole(bindingDataId) === 'overlay') {
            genericViewportDisplaySetMetadataProvider.remove(bindingDataId);
          }
          this.removeData(bindingDataId);
          didRemoveActor = true;
        }
      });

    if (didRemoveActor) {
      this.render();
    }
  }

  /**
   * Removes volumes, as the legacy volume viewport does. An entry is the
   * actor UID of a volume or its volume id, which is the actor UID of a legacy
   * volume unless the caller gave another. Renders when `immediate` is set.
   */
  removeVolumeActors(actorUIDs: string[], immediate = false): void {
    actorUIDs.forEach((actorUID) => {
      const dataId =
        this.findBindingDataIdByActorEntryUID(actorUID) ??
        this.findDataIdByVolumeId(actorUID);

      if (!dataId) {
        return;
      }

      if (this.getDisplaySetRole(dataId) === 'overlay') {
        genericViewportDisplaySetMetadataProvider.remove(dataId);
      }

      this.removeData(dataId);
    });

    if (immediate) {
      this.render();
    }
  }

  /**
   * Shows a stack of images. As the legacy stack viewport, it fires
   * PRE_STACK_NEW_IMAGE before the first image loads, through the mount of
   * the planar viewport, and VIEWPORT_NEW_IMAGE_SET once the first image is
   * shown.
   */
  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    const imageId = await this.legacyCompatibility.setStack(
      imageIds,
      currentImageIdIndex
    );

    this.triggerNewImageSetEvent(imageIds, currentImageIdIndex);

    return imageId;
  }

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

  /**
   * The properties of the data that the viewport shows. In stack mode the
   * interpolation type, the invert flag and the VOI LUT function are always
   * given, as the legacy stack viewport gives them also after
   * `resetProperties`: LINEAR, the default invert flag of the image (true for
   * a MONOCHROME1 image) and the VOI LUT function of the image when nothing
   * set them. Those are the values that the image paths draw with.
   */
  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    const properties = this.legacyCompatibility.getProperties(volumeId);

    if (this.getCurrentMode() !== 'stack') {
      return properties;
    }

    return {
      ...properties,
      interpolationType:
        properties.interpolationType ?? InterpolationType.LINEAR,
      invert: properties.invert ?? false,
      VOILUTFunction:
        properties.VOILUTFunction ??
        getValidVOILUTFunction(this.getCornerstoneImage()?.voiLUTFunction),
    };
  }

  resetProperties(volumeId?: string): void {
    this.legacyCompatibility.resetProperties(volumeId);
  }

  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    this.legacyCompatibility.setDefaultProperties(properties, imageId);
  }

  clearDefaultProperties(imageId?: string): void {
    this.legacyCompatibility.clearDefaultProperties(imageId);
  }

  resetToDefaultProperties(): void {
    this.legacyCompatibility.resetToDefaultProperties();
  }

  getBlendMode(filterActorUIDs?: string[]): BlendModes | undefined {
    return this.legacyCompatibility.getBlendMode(filterActorUIDs);
  }

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

  getSlabThickness(): number {
    return this.legacyCompatibility.getSlabThickness();
  }

  /**
   * Compatibility wrapper for the slab thickness setter of the legacy volume
   * viewport. The thickness is kept in the presentation of each volume.
   *
   * @experimental
   */
  setSlabThickness(slabThickness: number, filterActorUIDs?: string[]): void {
    this.legacyCompatibility.setSlabThickness(slabThickness, filterActorUIDs);
  }

  /**
   * Compatibility wrapper for the slab thickness reset of the legacy volume
   * viewport.
   *
   * @experimental
   */
  resetSlabThickness(): void {
    this.legacyCompatibility.resetSlabThickness();
  }

  /**
   * Renders as the legacy viewports do. A path that draws on the CPU canvas
   * draws once in the next animation frame, however often a render is asked
   * for before it, as the legacy CPU stack viewport draws in the frame of the
   * rendering engine. So one change gives one IMAGE_RENDERED, also when the
   * mount of a stack renders several times. A GPU path renders as on the
   * next viewport, through the rendering engine.
   */
  render(): void {
    if (!this.useCPURendering) {
      super.render();

      return;
    }

    if (this.cpuRenderFrame !== undefined) {
      return;
    }

    this.cpuRenderFrame = requestAnimationFrame(() => {
      this.cpuRenderFrame = undefined;
      super.render();
    });
  }

  protected override onDestroy(): void {
    if (this.cpuRenderFrame !== undefined) {
      cancelAnimationFrame(this.cpuRenderFrame);
      this.cpuRenderFrame = undefined;
    }

    this.legacyCompatibility.destroy();
    super.onDestroy();
  }
}

export default PlanarViewportLegacyAdapter;
