import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import type { Point2 } from '../../../types';
import { ViewportType } from '../../../enums';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { generateFrameImageId } from '../../../utilities/splitImageIdsBy4DTags';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import { HtmlVideoPath } from './HtmlVideoRenderPath';
import { getViewportV2SourceDataId } from '../viewportV2DataSetAccess';
import type {
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoStreamPayload,
  VideoViewportV2Input,
} from './VideoViewportV2Types';

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
      type: 'video',
      element: this.element,
    };
    this.camera = {
      zoom: 1,
      pan: [0, 0],
      rotation: 0,
      currentTimeSeconds: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
    this.element.setAttribute(
      'data-rendering-engine-uid',
      this.renderingEngineId
    );
  }

  async setVideo(dataId: string): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

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

      const payload = (binding.rendering as VideoElementRendering).payload;
      const pan = this.getDefaultPanWorld();
      this.camera = {
        zoom: 1,
        pan,
        rotation: 0,
        currentTimeSeconds: 0,
      };

      if (payload.frameRange[0] > 1) {
        this.camera.currentTimeSeconds = frameNumberToTimeSeconds(
          payload.frameRange[0],
          payload.fps
        );
      }

      this.trackVideoElement();
      this.modified();
      renderingIds.push(renderingId);
    }

    return renderingIds;
  }

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

  pause(): void {
    this.getVideoElement()?.pause();
    this.syncCameraCurrentTimeFromElement();
  }

  seek(timeSeconds: number): void {
    const payload = this.getPayload();
    const maxTimeSeconds = payload?.durationSeconds
      ? Math.max(payload.durationSeconds, 0)
      : Number.POSITIVE_INFINITY;

    this.setCamera({
      currentTimeSeconds: Math.max(0, Math.min(timeSeconds, maxTimeSeconds)),
    });
  }

  setFrameNumber(frameNumber: number): void {
    const payload = this.getPayload();

    if (!payload) {
      return;
    }

    this.seek(frameNumberToTimeSeconds(frameNumber, payload.fps));
  }

  setPlaybackRate(playbackRate: number): void {
    const dataId = this.getFirstBinding()?.dataId;

    if (!dataId) {
      return;
    }

    this.setDataPresentation(dataId, {
      playbackRate,
    });
  }

  getFrameRate(): number {
    return this.getPayload()?.fps ?? 0;
  }

  getNumberOfFrames(): number {
    return this.getPayload()?.numberOfFrames ?? 0;
  }

  getNumberOfSlices(): number {
    return this.getImageIds().length || this.getNumberOfFrames();
  }

  getCurrentTime(): number {
    this.syncCameraCurrentTimeFromElement();
    return this.camera.currentTimeSeconds ?? 0;
  }

  getFrameNumber(): number {
    const payload = this.getPayload();

    if (!payload) {
      return 1;
    }

    const frameNumber = timeSecondsToFrameNumber(
      this.getCurrentTime(),
      payload.fps
    );

    return Math.max(
      payload.frameRange[0],
      Math.min(frameNumber, payload.frameRange[1])
    );
  }

  getCurrentImageIdIndex(): number {
    return Math.max(0, this.getFrameNumber() - 1);
  }

  getImageIds(): string[] {
    const dataId = this.getFirstBinding()?.dataId;
    const payload = this.getPayload();

    if (!dataId || !payload) {
      return [];
    }

    const sourceDataId = getViewportV2SourceDataId(dataId);
    const imageIds = Array<string>(payload.numberOfFrames);

    for (
      let frameNumber = 1;
      frameNumber <= payload.numberOfFrames;
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

  scroll(delta = 1, _debounceLoading = true, loop = false): void {
    const payload = this.getPayload();

    if (!payload?.fps) {
      return;
    }

    this.pause();

    const minTimeSeconds = frameNumberToTimeSeconds(
      payload.frameRange[0],
      payload.fps
    );
    const maxTimeSeconds =
      payload.durationSeconds ??
      frameNumberToTimeSeconds(payload.frameRange[1], payload.fps);
    let nextTimeSeconds = this.getCurrentTime() + delta / payload.fps;

    if (loop) {
      const durationSeconds = Math.max(
        maxTimeSeconds - minTimeSeconds,
        1 / payload.fps
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

  removeDataId(dataId: string): void {
    const firstDataId = this.getFirstBinding()?.dataId;

    super.removeDataId(dataId);

    if (firstDataId === dataId) {
      this.untrackVideoElement();
      this.trackVideoElement();
    }
  }

  render(): void {
    // DOM updates are applied immediately in updateCamera/updateDataPresentation
  }

  private getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.element;
  }

  private getPayload(): VideoStreamPayload | undefined {
    return this.getVideoRendering()?.payload;
  }

  private getDisplayMetrics():
    | {
        offsetX: number;
        offsetY: number;
        scaleX: number;
        scaleY: number;
        zoom: number;
        panX: number;
        panY: number;
      }
    | undefined {
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

    const dataId = this.getFirstBinding()?.dataId;
    const objectFit =
      (dataId ? this.getDataPresentation(dataId)?.objectFit : undefined) ??
      'contain';
    const containScale = Math.min(
      containerWidth / intrinsicWidth,
      containerHeight / intrinsicHeight
    );
    const coverScale = Math.max(
      containerWidth / intrinsicWidth,
      containerHeight / intrinsicHeight
    );
    let scaleX = containScale;
    let scaleY = containScale;

    switch (objectFit) {
      case 'cover':
        scaleX = coverScale;
        scaleY = coverScale;
        break;
      case 'fill':
        scaleX = containerWidth / intrinsicWidth;
        scaleY = containerHeight / intrinsicHeight;
        break;
      case 'none':
        scaleX = 1;
        scaleY = 1;
        break;
      case 'scale-down': {
        const scaleDown = Math.min(1, containScale);
        scaleX = scaleDown;
        scaleY = scaleDown;
        break;
      }
      case 'contain':
      default:
        break;
    }

    const displayWidth = intrinsicWidth * scaleX;
    const displayHeight = intrinsicHeight * scaleY;
    const [panX, panY] = this.camera.pan ?? [0, 0];
    const zoom = Math.max(this.camera.zoom ?? 1, 0.001);

    return {
      offsetX: (containerWidth - displayWidth) / 2,
      offsetY: (containerHeight - displayHeight) / 2,
      scaleX: scaleX * zoom,
      scaleY: scaleY * zoom,
      zoom,
      panX,
      panY,
    };
  }

  private getDefaultPanWorld(): Point2 {
    const metrics = this.getDisplayMetrics();

    if (!metrics || !metrics.zoom) {
      return [0, 0];
    }

    return [
      metrics.offsetX / (metrics.scaleX / metrics.zoom),
      metrics.offsetY / (metrics.scaleY / metrics.zoom),
    ];
  }

  private getVideoRendering(): VideoElementRendering | undefined {
    return this.getFirstBinding()?.rendering as
      | VideoElementRendering
      | undefined;
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
