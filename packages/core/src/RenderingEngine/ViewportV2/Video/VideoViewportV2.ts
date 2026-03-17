import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import type { ICamera, Point2 } from '../../../types';
import { ViewportType } from '../../../enums';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import { HtmlVideoPath } from './HtmlVideoRenderPath';
import type {
  LoadedData,
  RenderingBinding,
} from '../ViewportArchitectureTypes';
import { getViewportV2SourceDataId } from '../viewportV2DataSetAccess';
import type {
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoProperties,
  VideoStreamPayload,
  VideoViewportV2Input,
} from './VideoViewportV2Types';
import {
  createDefaultVideoCamera,
  getAnchorWorldForPan,
  getPanForVideoLayout,
  getVideoLayout,
  normalizeVideoCamera,
} from './videoViewportCamera';

defaultRenderPathResolver.register(new HtmlVideoPath());

class VideoViewportV2 extends ViewportV2<
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext
> {
  readonly type = ViewportType.VIDEO_V2;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;

  protected renderContext: VideoElementRenderContext;
  private trackedVideoElement?: HTMLVideoElement;
  private cleanupTrackedVideoElement?: () => void;

  static get useCustomRenderingPipeline(): boolean {
    return true;
  }

  getUseCustomRenderingPipeline(): boolean {
    return true;
  }

  constructor(args: VideoViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.renderingEngineId = args.renderingEngineId;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVideoDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      renderingEngineId: this.renderingEngineId,
      type: 'video',
      element: this.element,
    };
    this.camera = createDefaultVideoCamera();

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  /**
   * Adds a single video dataset and returns its rendering id.
   *
   * @param dataId - Logical dataset id to add.
   * @returns The rendering id created for the mounted dataset.
   */
  async setVideo(dataId: string): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

  /**
   * Adds one or more video datasets using the HTML video render path.
   *
   * @param dataIds - Logical dataset ids to add.
   * @returns Rendering ids in the same order as the input dataset ids.
   */
  async setDataIds(dataIds: string[]): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, {
        renderMode: 'video2d',
      });
      const binding = this.getBinding(dataId);

      if (!binding) {
        renderingIds.push(renderingId);
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
          `[VideoViewportV2] Loaded data for ${dataId} is not a valid video stream`
        );
      }

      this.camera = createDefaultVideoCamera();

      if (videoData.frameRange[0] > 1) {
        this.camera.currentTimeSeconds = frameNumberToTimeSeconds(
          videoData.frameRange[0],
          videoData.fps
        );
      }

      this.trackVideoElement();
      this.modified();
      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

  protected normalizeCamera(camera: VideoCamera): VideoCamera {
    return normalizeVideoCamera(camera);
  }

  getZoom(): number {
    return this.getScale();
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    if (canvasPoint) {
      this.setScaleAtCanvasPoint(zoom, canvasPoint);
      return;
    }

    this.setScale(zoom);
  }

  getPan(): Point2 {
    const layout = this.getCurrentVideoLayout();

    return layout ? getPanForVideoLayout(layout) : [0, 0];
  }

  setPan(pan: Point2): void {
    const layout = this.getCurrentVideoLayout();

    if (!layout) {
      return;
    }

    this.setCamera({
      frame: {
        anchorWorld: getAnchorWorldForPan([pan[0], pan[1]], layout),
      },
    });
  }

  private setScaleAtCanvasPoint(scale: number, canvasPoint: Point2): void {
    const worldPoint = this.canvasToWorld(canvasPoint);
    const canvasWidth = this.element.clientWidth;
    const canvasHeight = this.element.clientHeight;

    this.setCamera({
      frame: {
        ...(this.getCamera().frame || {}),
        anchorWorld: [worldPoint[0], worldPoint[1]],
        anchorCanvas: [
          canvasPoint[0] / Math.max(canvasWidth, 1),
          canvasPoint[1] / Math.max(canvasHeight, 1),
        ],
        scale: Math.max(scale, 0.001),
        scaleMode: 'fit',
      },
    });
  }

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

    this.setCamera({
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
   * Returns the active dataset frame rate.
   *
   * @returns The active video frame rate, or `0` if no video is loaded.
   */
  getFrameRate(): number {
    return this.getVideoData()?.fps ?? 0;
  }

  /**
   * Returns the total number of frames in the active dataset.
   *
   * @returns The total frame count, or `0` if no video is loaded.
   */
  getNumberOfFrames(): number {
    return this.getVideoData()?.numberOfFrames ?? 0;
  }

  /**
   * Returns the stack-like slice count used by tool compatibility layers.
   *
   * @returns The total number of generated frame image ids.
   */
  getNumberOfSlices(): number {
    return this.getImageIds().length || this.getNumberOfFrames();
  }

  /**
   * Returns the current playback time in seconds.
   *
   * @returns The current playback time in seconds.
   */
  getCurrentTime(): number {
    this.syncCameraCurrentTimeFromElement();
    return this.camera.currentTimeSeconds ?? 0;
  }

  /**
   * Returns the current frame number derived from playback time.
   *
   * @returns The current frame number in dataset coordinates.
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
   *
   * @returns The current zero-based frame index.
   */
  getCurrentImageIdIndex(): number {
    return Math.max(0, this.getFrameNumber() - 1);
  }

  /**
   * Returns generated frame image ids for the active video dataset.
   *
   * @returns Generated frame image ids for the active dataset.
   */
  getImageIds(): string[] {
    const dataId = this.getFirstBinding()?.data.id;
    const videoData = this.getVideoData();

    if (!dataId || !videoData) {
      return [];
    }

    const sourceDataId = getViewportV2SourceDataId(dataId);
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

  /**
   * Removes a video dataset and rebinds tracking if the primary video changed.
   *
   * @param dataId - Logical dataset id to remove.
   */
  removeDataId(dataId: string): void {
    const firstDataId = this.getFirstBinding()?.data.id;

    super.removeDataId(dataId);

    if (firstDataId === dataId) {
      this.untrackVideoElement();
      this.trackVideoElement();
    }
  }

  /**
   * No-op render hook because DOM updates happen eagerly in the render path.
   */
  render(): void {
    if (this.isDestroyed) {
      return;
    }

    // DOM updates are applied immediately in updateCamera/updateDataPresentation
  }

  protected override onDestroy(): void {
    this.untrackVideoElement();
  }

  public override dispose(): void {
    this.destroy();
  }

  private getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.element;
  }

  protected getCameraForEvent(): ICamera {
    const layout = this.getCurrentVideoLayout();
    const worldToCanvasRatio = Math.max(layout?.worldToCanvasRatio ?? 1, 0.001);
    const focalPoint = this.canvasToWorld([
      this.element.clientWidth / 2,
      this.element.clientHeight / 2,
    ]);

    return {
      parallelProjection: true,
      focalPoint,
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale: this.element.clientHeight / 2 / worldToCanvasRatio,
      viewPlaneNormal: [0, 0, 1],
      rotation: this.camera.frame?.rotation ?? 0,
    };
  }

  private getVideoData(): LoadedData<VideoStreamPayload> | undefined {
    const binding = this.getCurrentBinding();

    if (!binding) {
      return;
    }

    return this.getVideoDataFromBinding(binding);
  }

  private getVideoDataFromBinding(
    binding: RenderingBinding<VideoDataPresentation>
  ): LoadedData<VideoStreamPayload> | undefined {
    if (!isVideoStreamData(binding.data)) {
      return;
    }

    return binding.data;
  }

  private getCurrentVideoLayout() {
    const videoElement = this.getVideoElement();

    if (!videoElement) {
      return;
    }

    const containerWidth = this.element.clientWidth;
    const containerHeight = this.element.clientHeight;
    const intrinsicWidth = videoElement.videoWidth || containerWidth;
    const intrinsicHeight = videoElement.videoHeight || containerHeight;

    if (
      !containerWidth ||
      !containerHeight ||
      !intrinsicWidth ||
      !intrinsicHeight
    ) {
      return;
    }

    const dataId = this.getFirstBinding()?.data.id;
    const objectFit =
      (dataId ? this.getDataPresentation(dataId)?.objectFit : undefined) ??
      'contain';

    return getVideoLayout({
      containerWidth,
      containerHeight,
      intrinsicWidth,
      intrinsicHeight,
      objectFit,
      camera: this.camera,
    });
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

    if (currentTimeSeconds === (this.camera.currentTimeSeconds ?? 0)) {
      return;
    }

    this.camera = {
      ...this.camera,
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
}

export default VideoViewportV2;

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
