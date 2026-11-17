import GenericViewport from '../GenericViewport';
import type {
  CPUIImageData,
  IVoxelManager,
  Point2,
  Point3,
  ReferenceCompatibleOptions,
  RGB,
  ViewReference,
  ViewReferenceSpecifier,
  ViewportContentMode,
} from '../../../types';
import { Events, ViewportType } from '../../../enums';
import triggerEvent from '../../../utilities/triggerEvent';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import FrameRange from '../../../utilities/FrameRange';
import VoxelManager from '../../../utilities/VoxelManager';
import getOrCreateCanvas from '../../helpers/getOrCreateCanvas';
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import imageIdToURI from '../../../utilities/imageIdToURI';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import type {
  LoadedData,
  ViewportDataBinding,
} from '../ViewportArchitectureTypes';
import { getGenericViewportSourceDataId } from '../genericViewportDisplaySetAccess';
import type { GenericViewportReferenceContext } from '../genericViewportReferenceCompatibility';
import type {
  VideoViewState,
  VideoDataPresentation,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoStreamPayload,
  VideoViewportInput,
} from './VideoViewportTypes';
import {
  createDefaultVideoViewState,
  normalizeVideoViewState,
} from './videoViewportCamera';
import { createVideoRenderPathResolver } from './VideoRenderPathResolver';
import VideoResolvedView from './VideoResolvedView';

/** The RGBA pixels of one video frame, with the frame number they show. */
type FrameScalarData = Uint8ClampedArray & {
  frameNumber?: number;
  getRange?: () => [number, number];
};

class VideoViewport extends GenericViewport<
  VideoViewState,
  VideoDataPresentation,
  VideoElementRenderContext
> {
  // ── Fields ───────────────────────────────────────────────────────────

  readonly type = ViewportType.VIDEO_NEXT;
  readonly renderingEngineId: string;

  /**
   * The canvas of the viewport element, for the rendering engine and for the
   * tools that read its size. The video element draws the frame, so this
   * canvas holds no pixels of the video.
   */
  readonly canvas: HTMLCanvasElement;

  protected renderContext: VideoElementRenderContext;
  private trackedVideoElement?: HTMLVideoElement;
  private cleanupTrackedVideoElement?: () => void;

  /** Whether the check that follows the frames of playback is running. */
  private isWatchingPlayback = false;

  /** The frame number of the last frame event. */
  private lastFrameEventNumber?: number;

  /** The animation frame that fires the next IMAGE_RENDERED, while one waits. */
  private imageRenderedFrame?: number;

  /** The pixels of the frame that `getImageData` read last. */
  private frameScalarData?: FrameScalarData;

  // ── Static ───────────────────────────────────────────────────────────

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(args: VideoViewportInput) {
    super(args);
    this.renderingEngineId = args.renderingEngineId;
    this.canvas = args.canvas || getOrCreateCanvas(this.element);
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
    this.viewState = createDefaultVideoViewState();

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
   * Replaces all mounted video display sets with the provided ones using the
   * HTML video render path. The first entry is mounted as the source binding,
   * and the video then shows the 1-based `frameNumber` of its options.
   *
   * @param entries - Video display sets to mount.
   */
  async setDisplaySets(
    ...entries: Array<{
      displaySetId: string;
      options?: { frameNumber?: number };
    }>
  ): Promise<void> {
    this.removeAllData();
    this.frameScalarData = undefined;

    for (const [index, { displaySetId }] of entries.entries()) {
      await this.addDisplaySet(displaySetId, {
        renderMode: 'video2d',
        role: index === 0 ? 'source' : 'overlay',
      });
      const binding = this.getBinding(displaySetId);

      if (!binding) {
        continue;
      }

      this.setDefaultDataPresentation(displaySetId, {
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
          `[VideoViewport] Loaded data for ${displaySetId} is not a valid video stream`
        );
      }

      this.viewState = createDefaultVideoViewState();

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

    const frameNumber = entries[0]?.options?.frameNumber;

    if (typeof frameNumber === 'number') {
      this.setFrameNumber(frameNumber);
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

  /**
   * The content mode of the video family: `video` once a video is mounted,
   * `empty` before. `utilities.getViewportContentMode` gives `video` for the
   * legacy video viewport too.
   */
  getCurrentMode(): ViewportContentMode {
    return this.getSourceBinding() ? 'video' : 'empty';
  }

  /**
   * The view reference of a frame, with the camera of the view: the focal
   * point, the view plane normal and the view up. The area tools read the
   * normal of an annotation to measure the frame. A `rangeEndSliceIndex`, or
   * the frame range of the view state while the video plays, gives a
   * reference over a range of frames, with the last frame in
   * `multiSliceReference`.
   */
  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const isPlayingRange =
      viewRefSpecifier.sliceIndex === undefined &&
      viewRefSpecifier.frameNumber === undefined &&
      this.getVideoElement()?.paused === false;
    const frameRange = this.getPlaybackFrameRange();
    const frameNumber = isPlayingRange
      ? frameRange[0]
      : (viewRefSpecifier.frameNumber ??
        (typeof viewRefSpecifier.sliceIndex === 'number'
          ? viewRefSpecifier.sliceIndex + 1
          : this.getFrameNumber()));
    const sliceIndex =
      typeof viewRefSpecifier.sliceIndex === 'number'
        ? viewRefSpecifier.sliceIndex
        : frameNumber - 1;
    const rangeEndSliceIndex =
      viewRefSpecifier.rangeEndSliceIndex ??
      (isPlayingRange ? frameRange[1] - 1 : undefined);
    const referencedImageId =
      typeof sliceIndex === 'number'
        ? this.getCurrentImageId(sliceIndex)
        : this.getCurrentImageId();
    const dataId = this.getFirstBinding()?.data.id;
    const camera = this.getResolvedView()?.toICamera();

    return {
      FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      dataId,
      dimensionGroupNumber: frameNumber,
      referencedImageId,
      sliceIndex,
      multiSliceReference:
        rangeEndSliceIndex > sliceIndex
          ? {
              sliceIndex: rangeEndSliceIndex,
              dimensionGroupNumber: rangeEndSliceIndex + 1,
              referencedImageId: this.getCurrentImageId(rangeEndSliceIndex),
            }
          : undefined,
      cameraFocalPoint: camera?.focalPoint,
      viewPlaneNormal: camera?.viewPlaneNormal,
      viewUp: camera?.viewUp,
    };
  }

  getCurrentImageId(index = this.getCurrentImageIdIndex()): string | undefined {
    const sourceDataId = getGenericViewportSourceDataId(
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

  /**
   * Whether the viewport shows a reference. A reference to an image of one
   * frame shows on that frame. A reference whose image names a range of
   * frames (`.../frames/3-9`) shows on each frame of the range. A reference
   * to the video without a frame shows on every frame. With `withNavigation`
   * the answer is whether the video has the frame at all.
   */
  override isReferenceViewable(
    viewRef: ViewReference,
    options: ReferenceCompatibleOptions = {}
  ): boolean {
    return super.isReferenceViewable(asFrameRangeReference(viewRef), options);
  }

  /**
   * The image data of the frame on display, as the legacy video viewport
   * builds it: the geometry of the video, the RGBA pixels of the frame and a
   * voxel manager over them. A world point of a video is its index point.
   *
   * @returns undefined while no video is mounted.
   */
  getImageData(): CPUIImageData {
    const videoData = this.getVideoData();

    if (!videoData) {
      return;
    }

    const { metadata } = videoData;
    const scalarData = this.getFrameScalarData();
    const worldToIndex = (point: Point3): Point3 => [point[0], point[1], 0];

    return {
      dimensions: metadata.dimensions,
      spacing: metadata.spacing,
      origin: metadata.origin,
      direction: metadata.direction as CPUIImageData['direction'],
      metadata: {
        Modality: videoData.modality,
        FrameOfReferenceUID: this.getFrameOfReferenceUID(),
      },
      scalarData,
      imageData: {
        getDirection: () => metadata.direction as CPUIImageData['direction'],
        getDimensions: () => metadata.dimensions,
        getRange: () => [0, 255],
        getScalarData: () => this.getFrameScalarData(),
        getSpacing: () => metadata.spacing,
        worldToIndex,
        indexToWorld: worldToIndex,
      },
      voxelManager: this.getFrameVoxelManager(scalarData),
      hasPixelSpacing: metadata.hasPixelSpacing,
      preScale: {
        scaled: false,
      },
    };
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
   * Returns the pan in canvas pixels on the screen, as on the planar
   * viewport: `[0, 0]` for the fitted view, and the move of the picture on
   * the screen after that, at any rotation and zoom.
   */
  getPan(): Point2 {
    return this.getResolvedView()?.canvasPan ?? [0, 0];
  }

  /**
   * Moves the picture so that `getPan` gives this pan. A canvas delta added
   * to `getPan` moves the picture by that delta on the screen, as PanTool
   * expects.
   */
  setPan(pan: Point2): void {
    const resolvedView = this.getResolvedView();

    if (!resolvedView) {
      return;
    }

    this.applyResolvedViewState(
      resolvedView.withCanvasPan(pan).state.viewState
    );
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
      objectFit: this.getDisplaySetPresentation(videoData.id)?.objectFit,
      payload: videoData,
    });
  }

  /**
   * The reference context of the video, with the focal point and the view
   * plane normal of the view, so that a reference with a view plane normal
   * is viewable here.
   */
  protected getReferenceViewContexts(): GenericViewportReferenceContext[] {
    const binding = this.getFirstBinding();
    const videoData = this.getVideoData();

    if (!binding || !videoData) {
      return super.getReferenceViewContexts();
    }

    const sourceDataId = getGenericViewportSourceDataId(binding.data.id);
    const frameNumber = this.getFrameNumber();
    const camera = this.getResolvedView()?.toICamera();

    return [
      {
        dataId: binding.data.id,
        dataIds: [binding.data.id, sourceDataId],
        frameOfReferenceUID: this.getFrameOfReferenceUID(),
        imageIds: this.getImageIds(),
        imageURIs: [withoutFrames(imageIdToURI(sourceDataId))],
        currentImageIdIndex: frameNumber - 1,
        dimensionGroupNumber: frameNumber,
        numDimensionGroups: videoData.numberOfFrames,
        cameraFocalPoint: camera?.focalPoint,
        viewPlaneNormal: camera?.viewPlaneNormal,
      },
    ];
  }

  // ====================================================================
  // Public API -- playback
  // ====================================================================

  /**
   * Starts playback on the active video element. While it plays, each new
   * frame fires STACK_NEW_IMAGE.
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
      .then(() => this.watchPlayback())
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
   * The 1-based first and last frame that playback stays in: the frame range
   * of the view state, or else every frame of the video.
   */
  protected getPlaybackFrameRange(): [number, number] {
    const frameRange = this.viewState.frameRange ??
      this.getVideoData()?.frameRange ?? [0, 0];

    return [frameRange[0], frameRange[1]];
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

    this.setDisplaySetPresentation(dataId, {
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

    const sourceDataId = getGenericViewportSourceDataId(dataId);
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
   * Fires IMAGE_RENDERED on the next animation frame, once for all the
   * changes until then. The render path applies a change to the video element
   * when it is made, so the event only tells the tools to draw again over
   * the frame on display.
   */
  render(): void {
    if (this.isDestroyed || this.imageRenderedFrame !== undefined) {
      return;
    }

    this.imageRenderedFrame = requestAnimationFrame(() => {
      this.imageRenderedFrame = undefined;
      this.triggerImageRendered();
    });
  }

  /**
   * Called by the rendering engine render loop for custom-pipeline viewports
   * (getUseCustomRenderingPipeline returns true). DOM updates happen eagerly in
   * the render path, so this defers to render(); without it the engine threw
   * `customRenderViewportToCanvas is not a function` for the next video viewport.
   * Mirrors the ECG and WSI native viewports.
   */
  customRenderViewportToCanvas(): void {
    this.render();
  }

  /**
   * Resets layout navigation while preserving the current video time.
   */
  resetViewState(): boolean {
    if (this.isDestroyed) {
      return false;
    }

    const previousCamera = this.getCameraForEvent();
    const { currentTimeSeconds } = this.viewState;

    this.viewState = this.normalizeViewState({
      ...createDefaultVideoViewState(),
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
  protected override normalizeViewState(
    viewState: VideoViewState
  ): VideoViewState {
    return normalizeVideoViewState(viewState);
  }

  /**
   * Releases the tracked video element listener during destroy.
   */
  protected override onDestroy(): void {
    if (this.imageRenderedFrame !== undefined) {
      cancelAnimationFrame(this.imageRenderedFrame);
      this.imageRenderedFrame = undefined;
    }

    this.untrackVideoElement();
  }

  /**
   * Called on each animation frame while the video plays. Keeps playback in
   * the frame range of the view state, as the legacy video viewport keeps
   * it in the range of `setFrameRange`: a frame out of the range goes back
   * to its first frame. Another frame fires the frame events.
   */
  protected onPlaybackFrame(): void {
    const frameNumber = this.getFrameNumber();
    const { frameRange } = this.viewState;

    if (
      frameRange &&
      (frameNumber < frameRange[0] || frameNumber > frameRange[1])
    ) {
      this.setFrameNumber(frameRange[0]);

      return;
    }

    if (frameNumber !== this.lastFrameEventNumber) {
      this.triggerFrameEvents();
    }
  }

  /**
   * Fires STACK_NEW_IMAGE for the frame on display, as the next planar
   * viewport fires it for a new image: the image id and the 0-based index of
   * the frame, with the time and the duration of the video in seconds. Then
   * asks for the IMAGE_RENDERED of the frame.
   */
  protected triggerFrameEvents(): void {
    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    const imageIdIndex = this.getCurrentImageIdIndex();

    this.lastFrameEventNumber = imageIdIndex + 1;
    triggerEvent(this.element, Events.STACK_NEW_IMAGE, {
      element: this.element,
      imageId: this.getCurrentImageId(imageIdIndex),
      imageIdIndex,
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      time: element.currentTime,
      duration: element.duration,
    });
    this.render();
  }

  /**
   * Fires IMAGE_RENDERED for the frame on display, with the detail of the
   * legacy video viewport: the 0-based frame index, the number of frames, and
   * the time and the duration of the video in seconds.
   */
  protected triggerImageRendered(): void {
    const element = this.getVideoElement();

    if (this.isDestroyed || !element) {
      return;
    }

    this.setRendered();
    triggerEvent(this.element, Events.IMAGE_RENDERED, {
      element: this.element,
      viewportId: this.id,
      viewport: this,
      imageIndex: this.getCurrentImageIdIndex(),
      numberOfSlices: this.getNumberOfFrames(),
      renderingEngineId: this.renderingEngineId,
      time: element.currentTime,
      duration: element.duration,
    });
  }

  // ====================================================================
  // Private
  // ====================================================================

  protected getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.element;
  }

  protected getVideoData(): LoadedData<VideoStreamPayload> | undefined {
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
    const onSeeked = () => {
      this.triggerFrameEvents();
    };

    element.addEventListener('loadedmetadata', syncCurrentTime);
    element.addEventListener('seeked', syncCurrentTime);
    element.addEventListener('seeked', onSeeked);
    element.addEventListener('timeupdate', syncCurrentTime);

    this.trackedVideoElement = element;
    this.cleanupTrackedVideoElement = () => {
      element.removeEventListener('loadedmetadata', syncCurrentTime);
      element.removeEventListener('seeked', syncCurrentTime);
      element.removeEventListener('seeked', onSeeked);
      element.removeEventListener('timeupdate', syncCurrentTime);
    };

    syncCurrentTime();
  }

  private untrackVideoElement(): void {
    this.cleanupTrackedVideoElement?.();
    this.cleanupTrackedVideoElement = undefined;
    this.trackedVideoElement = undefined;
  }

  /**
   * Reads the pixels of the frame on display through a canvas, once per
   * frame number. Before the video has a frame the data is empty.
   */
  private getFrameScalarData(): FrameScalarData {
    const frameNumber = this.getFrameNumber();

    if (this.frameScalarData?.frameNumber === frameNumber) {
      return this.frameScalarData;
    }

    const element = this.getVideoElement();

    if (!element?.videoWidth || !element.videoHeight) {
      const emptyData = new Uint8ClampedArray() as FrameScalarData;

      emptyData.getRange = () => [0, 255];
      emptyData.frameNumber = -1;

      return emptyData;
    }

    const canvas = document.createElement('canvas');

    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;

    const context = canvas.getContext('2d');

    context.drawImage(element, 0, 0);

    const scalarData = context.getImageData(0, 0, canvas.width, canvas.height)
      .data as FrameScalarData;

    scalarData.getRange = () => [0, 255];
    scalarData.frameNumber = frameNumber;
    this.frameScalarData = scalarData;

    return scalarData;
  }

  /**
   * A voxel manager over the RGBA pixels of the frame, whose value at a pixel
   * is its `[r, g, b]` triple, as on the legacy video viewport.
   *
   * @returns undefined when the pixels do not fill the frame, so that the
   * tools report no statistics and never a wrong value.
   */
  private getFrameVoxelManager(
    scalarData: FrameScalarData
  ): IVoxelManager<number> | IVoxelManager<RGB> | undefined {
    const element = this.getVideoElement();
    const width = element?.videoWidth;
    const height = element?.videoHeight;

    if (!width || !height || scalarData.length !== width * height * 4) {
      return undefined;
    }

    return VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData,
      numberOfComponents: 4,
      id: `videoFrame:${this.id}:${scalarData.frameNumber}`,
    });
  }

  /**
   * Checks the frame on every animation frame while the video plays, with
   * `onPlaybackFrame`, until it pauses.
   */
  private watchPlayback(): void {
    if (this.isWatchingPlayback) {
      return;
    }

    const check = () => {
      const element = this.getVideoElement();

      if (this.isDestroyed || !element || element.paused) {
        this.isWatchingPlayback = false;

        return;
      }

      this.onPlaybackFrame();
      requestAnimationFrame(check);
    };

    this.isWatchingPlayback = true;
    check();
  }

  /**
   * Applies a resolved Video view state through the canonical mutation path.
   */
  private applyResolvedViewState(nextViewState: VideoViewState): void {
    this.setViewState(nextViewState);
  }

  /**
   * Shows the first frame of the range, paused, as the legacy viewport does:
   * the video does not play, it only seeks to that frame when it shows
   * another one, and waits until the frame is painted.
   */
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

    element.pause();
    await seekVideoElement(element, targetTimeSeconds);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    this.syncCameraCurrentTimeFromElement();
  }
}

export default VideoViewport;

/** An image id or an image URI of a video without its frame part. */
function withoutFrames(image: string): string {
  const framesMatch = image.match(FrameRange.frameRangeExtractor);

  return framesMatch ? image.substring(0, framesMatch.index) : image;
}

/**
 * Gives a reference whose image names a range of frames (`.../frames/3-9`)
 * as a reference to the first frame with the last frame in
 * `multiSliceReference`, which is how the reference check reads a range.
 * Any other reference comes back as it is.
 */
function asFrameRangeReference(viewRef: ViewReference): ViewReference {
  const image = viewRef?.referencedImageURI ?? viewRef?.referencedImageId;

  if (!image || viewRef.multiSliceReference) {
    return viewRef;
  }

  const firstFrame = FrameRange.imageIdToFrameStart(image);
  const lastFrame = FrameRange.imageIdToFrameEnd(image);

  if (!(lastFrame > firstFrame)) {
    return viewRef;
  }

  const atFrame = (value: string | undefined, frame: number) =>
    value?.replace(
      FrameRange.frameRangeExtractor,
      (_match, prefix: string) => `${prefix}${frame}`
    );

  return {
    ...viewRef,
    referencedImageId: atFrame(viewRef.referencedImageId, firstFrame),
    referencedImageURI: atFrame(viewRef.referencedImageURI, firstFrame),
    multiSliceReference: {
      referencedImageId: atFrame(viewRef.referencedImageId ?? image, lastFrame),
      referencedImageURI: atFrame(viewRef.referencedImageURI, lastFrame),
    },
  };
}

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
