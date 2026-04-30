import ViewportNext from '../ViewportNext';
import type {
  Point2,
  ViewPresentation,
  ViewPresentationSelector,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import { ViewportType } from '../../../enums';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import type {
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import { getViewportNextSourceDataId } from '../viewportNextDataSetAccess';
import type { ViewportNextReferenceContext } from '../viewportNextReferenceCompatibility';
import type {
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoStreamPayload,
  VideoViewportInput,
} from './VideoViewportTypes';
import {
  createDefaultVideoCamera,
  normalizeVideoCamera,
} from './videoViewportCamera';
import { createVideoRenderPathResolver } from './VideoRenderPathResolver';
import VideoResolvedView from './VideoResolvedView';

class VideoViewport extends ViewportNext<
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext
> {
  // ── Fields ───────────────────────────────────────────────────────────

  readonly type = ViewportType.VIDEO_NEXT;
  readonly renderingEngineId: string;

  protected renderContext: VideoElementRenderContext;
  private trackedVideoElement?: HTMLVideoElement;
  private cleanupTrackedVideoElement?: () => void;

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: VideoViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVideoDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || createVideoRenderPathResolver();
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'video',
      element: this.element,
    };
    this.viewState = createDefaultVideoCamera();

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  // ====================================================================
  // Public API -- data
  // ====================================================================

  /**
   * Adds one or more video datasets using the HTML video render path.
   *
   * @param entries - List of datasets to add.
   */
  async setDataList(entries: Array<{ dataId: string }>): Promise<void> {
    for (const [index, { dataId }] of entries.entries()) {
      await this.addData(dataId, {
        renderMode: 'video2d',
        role: index === 0 ? 'source' : 'overlay',
      });
      const binding = this.getBinding(dataId);

      if (!binding) {
        continue;
      }

      this.setDefaultDataPresentation(dataId, {
        visible: true,
        opacity: 1,
        playbackRate: 1,
        loop: true,
        muted: true,
        objectFit: 'contain',
      });

      const videoData = this.getVideoDataFromBinding(binding);

      if (!videoData) {
        throw new Error(
          `[VideoViewport] Loaded data for ${dataId} is not a valid video stream`
        );
      }

      this.viewState = createDefaultVideoCamera();

      if (videoData.frameRange[0] > 1) {
        this.viewState.currentTimeSeconds = frameNumberToTimeSeconds(
          videoData.frameRange[0],
          videoData.fps
        );
      }

      this.modified();
      this.trackVideoElement();
      await this.primeInitialFrame(videoData);
    }
  }

  /**
   * Removes a video dataset and rebinds tracking if the primary video changed.
   *
   * @param dataId - Logical dataset id to remove.
   */
  removeData(dataId: string): void {
    const firstDataId = this.getFirstBinding()?.data.id;

    super.removeData(dataId);

    if (firstDataId === dataId) {
      this.untrackVideoElement();
      this.trackVideoElement();
    }
  }

  getViewPresentation(
    viewPresSel: ViewPresentationSelector = {
      rotation: true,
      zoom: true,
      pan: true,
    }
  ): ViewPresentation {
    const target: ViewPresentation = {};
    const { rotation, zoom, pan } = viewPresSel;
    const currentZoom = this.getZoom();

    if (rotation) {
      target.rotation = this.getResolvedView()?.rotation ?? 0;
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

  setViewPresentation(viewPres?: ViewPresentation): void {
    if (!viewPres) {
      return;
    }

    const nextZoom = Math.max(viewPres.zoom ?? this.getZoom(), 0.001);
    this.setViewState({
      rotation: viewPres.rotation ?? this.getResolvedView()?.rotation ?? 0,
      scale: nextZoom,
      scaleMode: 'fit',
    });

    if (viewPres.pan) {
      this.setPan([viewPres.pan[0] * nextZoom, viewPres.pan[1] * nextZoom]);
    }
  }

  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const frameNumber =
      viewRefSpecifier.frameNumber ??
      (typeof viewRefSpecifier.sliceIndex === 'number'
        ? viewRefSpecifier.sliceIndex + 1
        : this.getFrameNumber());
    const sliceIndex =
      typeof viewRefSpecifier.sliceIndex === 'number'
        ? viewRefSpecifier.sliceIndex
        : frameNumber - 1;
    const referencedImageId =
      typeof sliceIndex === 'number'
        ? this.getCurrentImageId(sliceIndex)
        : this.getCurrentImageId();
    const dataId = this.getFirstBinding()?.data.id;

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      dataId,
      dimensionGroupNumber: frameNumber,
      referencedImageId,
      sliceIndex,
    };
  }

  getCurrentImageId(index = this.getCurrentImageIdIndex()): string | undefined {
    const sourceDataId = getViewportNextSourceDataId(
      this.getFirstBinding()?.data.id || ''
    );

    if (!sourceDataId) {
      return;
    }

    return generateFrameImageId(sourceDataId, index + 1);
  }

  getViewReferenceId(specifier: ViewReferenceSpecifier = {}): string {
    const sliceIndex = specifier.sliceIndex;

    if (sliceIndex === undefined) {
      return `videoId:${this.getCurrentImageId()}`;
    }

    return `videoId:${this.getCurrentImageId(sliceIndex)}`;
  }

  setViewReference(viewRef: ViewReference): void {
    if (typeof viewRef.dimensionGroupNumber === 'number') {
      this.setFrameNumber(viewRef.dimensionGroupNumber);
      return;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      this.setFrameNumber(viewRef.sliceIndex + 1);
    }
  }

  getSliceIndex(): number {
    return this.getCurrentImageIdIndex();
  }

  // ====================================================================
  // Public API -- camera & navigation
  // ====================================================================

  /**
   * Returns the current zoom level derived from camera scale.
   */
  getZoom(): number {
    return (
      this.getResolvedView()?.zoom ?? Math.max(this.viewState.scale ?? 1, 0.001)
    );
  }

  /**
   * Sets the zoom level, optionally anchored to a canvas point.
   */
  setZoom(zoom: number, canvasPoint?: Point2): void {
    const resolvedView = this.getResolvedView();

    if (resolvedView) {
      this.applyResolvedViewState(
        resolvedView.withZoom(zoom, canvasPoint).state.viewState
      );
      return;
    }

    this.setViewState({
      scale: Math.max(zoom, 0.001),
      scaleMode: 'fit',
    });
  }

  /**
   * Returns the current pan offset in canvas coordinates.
   */
  getPan(): Point2 {
    return this.getResolvedView()?.pan ?? [0, 0];
  }

  /**
   * Sets the pan offset in canvas coordinates.
   */
  setPan(pan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    this.applyResolvedViewState(resolvedView.withPan(pan).state.viewState);
  }

  /**
   * Returns the computed camera that resolves layout, zoom, and pan
   * from the raw camera state and the current video element dimensions.
   */
  getResolvedView(): VideoResolvedView | undefined {
    const videoElement = this.getVideoElement();
    const videoData = this.getVideoData();

    if (!videoElement || !videoData) {
      return;
    }

    return new VideoResolvedView({
      viewState: this.viewState,
      containerHeight: this.element.clientHeight,
      containerWidth: this.element.clientWidth,
      frameOfReferenceUID:
        (
          videoData.metadata.imagePlaneModule as
            | { frameOfReferenceUID?: string }
            | undefined
        )?.frameOfReferenceUID || videoData.renderedUrl,
      intrinsicHeight: videoElement.videoHeight || this.element.clientHeight,
      intrinsicWidth: videoElement.videoWidth || this.element.clientWidth,
      objectFit: this.getDataPresentation(videoData.id)?.objectFit,
      payload: videoData,
    });
  }

  protected getReferenceViewContexts(): ViewportNextReferenceContext[] {
    const binding = this.getFirstBinding();
    const videoData = this.getVideoData();

    if (!binding || !videoData) {
      return super.getReferenceViewContexts();
    }

    const sourceDataId = getViewportNextSourceDataId(binding.data.id);
    const frameNumber = this.getFrameNumber();

    return [
      {
        dataId: binding.data.id,
        dataIds: [binding.data.id, sourceDataId],
        frameOfReferenceUID: this.getFrameOfReferenceUID(),
        imageIds: this.getImageIds(),
        currentImageIdIndex: frameNumber - 1,
        dimensionGroupNumber: frameNumber,
        numDimensionGroups: videoData.numberOfFrames,
      },
    ];
  }

  // ====================================================================
  // Public API -- playback
  // ====================================================================

  /**
   * Starts playback on the active video element.
   *
   * @returns A promise that resolves after the play request settles.
   */
  play(): Promise<void> {
    const element = this.getVideoElement();

    if (!element) {
      return Promise.resolve();
    }

    return element
      .play()
      .then(() => undefined)
      .catch(() => undefined);
  }

  /**
   * Pauses playback and synchronizes the cached current time.
   */
  pause(): void {
    this.getVideoElement()?.pause();
    this.syncCameraCurrentTimeFromElement();
  }

  /**
   * Seeks the active video to the requested time in seconds.
   *
   * @param timeSeconds - Target playback time in seconds.
   */
  seek(timeSeconds: number): void {
    const videoData = this.getVideoData();
    const maxTimeSeconds = videoData?.durationSeconds
      ? Math.max(videoData.durationSeconds, 0)
      : Number.POSITIVE_INFINITY;

    this.setViewState({
      currentTimeSeconds: Math.max(0, Math.min(timeSeconds, maxTimeSeconds)),
    });
  }

  /**
   * Seeks to the requested frame number using the dataset frame rate.
   *
   * @param frameNumber - Target frame number in dataset coordinates.
   */
  setFrameNumber(frameNumber: number): void {
    const videoData = this.getVideoData();

    if (!videoData) {
      return;
    }

    this.seek(frameNumberToTimeSeconds(frameNumber, videoData.fps));
  }

  /**
   * Updates playback rate through per-data presentation state.
   *
   * @param playbackRate - Playback rate to apply to the active dataset.
   */
  setPlaybackRate(playbackRate: number): void {
    const dataId = this.getFirstBinding()?.data.id;

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      playbackRate,
    });
  }

  /**
   * Scrolls through frames using a signed delta.
   *
   * @param delta - Signed number of frames to move by.
   * @param _debounceLoading - Unused compatibility argument kept for stack-like
   * callers.
   * @param loop - Whether to wrap when scrolling past either end.
   */
  scroll(delta = 1, _debounceLoading = true, loop = false): void {
    const videoData = this.getVideoData();

    if (!videoData?.fps) {
      return;
    }

    this.pause();

    const minTimeSeconds = frameNumberToTimeSeconds(
      videoData.frameRange[0],
      videoData.fps
    );
    const maxTimeSeconds =
      videoData.durationSeconds ??
      frameNumberToTimeSeconds(videoData.frameRange[1], videoData.fps);
    let nextTimeSeconds = this.getCurrentTime() + delta / videoData.fps;

    if (loop) {
      const durationSeconds = Math.max(
        maxTimeSeconds - minTimeSeconds,
        1 / videoData.fps
      );

      while (nextTimeSeconds < minTimeSeconds) {
        nextTimeSeconds += durationSeconds;
      }

      while (nextTimeSeconds > maxTimeSeconds) {
        nextTimeSeconds -= durationSeconds;
      }
    } else {
      nextTimeSeconds = Math.max(
        minTimeSeconds,
        Math.min(nextTimeSeconds, maxTimeSeconds)
      );
    }

    this.seek(nextTimeSeconds);
  }

  // ====================================================================
  // Public API -- queries
  // ====================================================================

  /**
   * Returns the active dataset frame rate.
   */
  getFrameRate(): number {
    return this.getVideoData()?.fps ?? 0;
  }

  /**
   * Returns the total number of frames in the active dataset.
   */
  getNumberOfFrames(): number {
    return this.getVideoData()?.numberOfFrames ?? 0;
  }

  /**
   * Returns the stack-like slice count used by tool compatibility layers.
   */
  getNumberOfSlices(): number {
    return this.getImageIds().length || this.getNumberOfFrames();
  }

  /**
   * Returns the current playback time in seconds.
   */
  getCurrentTime(): number {
    this.syncCameraCurrentTimeFromElement();
    return this.viewState.currentTimeSeconds ?? 0;
  }

  /**
   * Returns the current frame number derived from playback time.
   */
  getFrameNumber(): number {
    const videoData = this.getVideoData();

    if (!videoData) {
      return 1;
    }

    const frameNumber = timeSecondsToFrameNumber(
      this.getCurrentTime(),
      videoData.fps
    );

    return Math.max(
      videoData.frameRange[0],
      Math.min(frameNumber, videoData.frameRange[1])
    );
  }

  /**
   * Returns the current frame index in zero-based stack form.
   */
  getCurrentImageIdIndex(): number {
    return Math.max(0, this.getFrameNumber() - 1);
  }

  /**
   * Returns generated frame image ids for the active video dataset.
   */
  getImageIds(): string[] {
    const dataId = this.getFirstBinding()?.data.id;
    const videoData = this.getVideoData();

    if (!dataId || !videoData) {
      return [];
    }

    const sourceDataId = getViewportNextSourceDataId(dataId);
    const imageIds = Array<string>(videoData.numberOfFrames);

    for (
      let frameNumber = 1;
      frameNumber <= videoData.numberOfFrames;
      frameNumber++
    ) {
      try {
        imageIds[frameNumber - 1] = generateFrameImageId(
          sourceDataId,
          frameNumber
        );
      } catch {
        return [sourceDataId];
      }
    }

    return imageIds;
  }

  // ====================================================================
  // Public API -- lifecycle
  // ====================================================================

  /**
   * No-op render because DOM updates happen eagerly in the render path.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    // DOM updates are applied immediately in applyViewState/updateDataPresentation
  }

  /**
   * Resets layout navigation while preserving the current video time.
   */
  resetCamera(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    const previousCamera = this.getCameraForEvent();
    const { currentTimeSeconds } = this.viewState;

    this.viewState = this.normalizeViewState({
      ...createDefaultVideoCamera(),
      currentTimeSeconds,
    });
    this.modified(previousCamera);
    this.triggerCameraResetEvent();

    return true;
  }

  /**
   * Alias for {@link destroy}. Provided for compatibility with disposable
   * resource conventions.
   */
  public override dispose(): void {
    this.destroy();
  }

  /**
   * Returns whether this viewport bypasses the shared rendering pipeline.
   */
  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  // ====================================================================
  // Protected
  // ====================================================================

  /**
   * Clamps and normalizes video camera values before storage.
   */
  protected override normalizeViewState(viewState: VideoCamera): VideoCamera {
    return normalizeVideoCamera(viewState);
  }

  /**
   * Releases the tracked video element listener during destroy.
   */
  protected override onDestroy(): void {
    this.untrackVideoElement();
  }

  // ====================================================================
  // Private
  // ====================================================================

  private getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.element;
  }

  private getVideoData(): LoadedData<VideoStreamPayload> | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    return this.getVideoDataFromBinding(binding);
  }

  private getVideoDataFromBinding(
    binding: ViewportDataBinding<VideoDataPresentation>
  ): LoadedData<VideoStreamPayload> | undefined {
    if (!isVideoStreamData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private getVideoRendering(): VideoElementRendering | undefined {
    const binding = this.getFirstBinding();

    if (!binding || !isVideoElementRendering(binding.rendering)) {
      return;
    }

    return binding.rendering;
  }

  private syncCameraCurrentTimeFromElement(): void {
    const element = this.getVideoElement();

    if (!element) {
      return;
    }

    const currentTimeSeconds = Math.max(0, element.currentTime || 0);

    if (currentTimeSeconds === (this.viewState.currentTimeSeconds ?? 0)) {
      return;
    }

    this.viewState = {
      ...this.viewState,
      currentTimeSeconds,
    };
  }

  private trackVideoElement(): void {
    const element = this.getVideoElement();

    if (!element || this.trackedVideoElement === element) {
      return;
    }

    this.untrackVideoElement();

    const syncCurrentTime = () => {
      this.syncCameraCurrentTimeFromElement();
    };

    element.addEventListener('loadedmetadata', syncCurrentTime);
    element.addEventListener('seeked', syncCurrentTime);
    element.addEventListener('timeupdate', syncCurrentTime);

    this.trackedVideoElement = element;
    this.cleanupTrackedVideoElement = () => {
      element.removeEventListener('loadedmetadata', syncCurrentTime);
      element.removeEventListener('seeked', syncCurrentTime);
      element.removeEventListener('timeupdate', syncCurrentTime);
    };

    syncCurrentTime();
  }

  private untrackVideoElement(): void {
    this.cleanupTrackedVideoElement?.();
    this.cleanupTrackedVideoElement = undefined;
    this.trackedVideoElement = undefined;
  }

  private applyResolvedViewState(nextCamera: VideoCamera): void {
    const previousCamera = this.getCameraForEvent();

    this.viewState = this.normalizeViewState(nextCamera);
    this.modified(previousCamera);
  }

  private async primeInitialFrame(
    videoData: LoadedData<VideoStreamPayload>
  ): Promise<void> {
    const element = this.getVideoElement();

    if (!element) {
      return;
    }

    await waitForVideoReady(element);

    const targetTimeSeconds =
      videoData.frameRange[0] > 1
        ? frameNumberToTimeSeconds(videoData.frameRange[0], videoData.fps)
        : 0;

    try {
      await element.play().catch(() => undefined);
    } catch {
      // Some environments reject the initial play request; seeking still helps.
    }

    await seekVideoElement(element, targetTimeSeconds);
    await waitForVideoFramePaint(element);
    element.pause();
    this.syncCameraCurrentTimeFromElement();
  }
}

export default VideoViewport;

async function waitForVideoReady(element: HTMLVideoElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      element.removeEventListener('loadeddata', onReady);
      element.removeEventListener('canplay', onReady);
    };

    element.addEventListener('loadeddata', onReady, { once: true });
    element.addEventListener('canplay', onReady, { once: true });
  });
}

async function seekVideoElement(
  element: HTMLVideoElement,
  timeSeconds: number
): Promise<void> {
  if (Math.abs((element.currentTime || 0) - timeSeconds) <= 0.001) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      element.removeEventListener('seeked', onSeeked);
      resolve();
    };

    element.addEventListener('seeked', onSeeked, { once: true });
    element.currentTime = timeSeconds;
  });
}

async function waitForVideoFramePaint(
  element: HTMLVideoElement
): Promise<void> {
  const requestFrameCallback = (
    element as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    }
  ).requestVideoFrameCallback;

  if (requestFrameCallback) {
    await new Promise<void>((resolve) => {
      requestFrameCallback.call(element, () => resolve());
    });
    return;
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function isVideoStreamData(
  data: LoadedData
): data is LoadedData<VideoStreamPayload> {
  if (typeof data !== 'object' || data === null || data.type !== 'video') {
    return false;
  }

  const payload = data as Record<string, unknown>;

  return (
    typeof payload.renderedUrl === 'string' &&
    typeof payload.fps === 'number' &&
    typeof payload.numberOfFrames === 'number' &&
    Array.isArray(payload.frameRange) &&
    payload.frameRange.length === 2 &&
    typeof payload.frameRange[0] === 'number' &&
    typeof payload.frameRange[1] === 'number'
  );
}

function isVideoElementRendering(rendering: {
  renderMode: string;
}): rendering is VideoElementRendering {
  return rendering.renderMode === 'video2d';
}
