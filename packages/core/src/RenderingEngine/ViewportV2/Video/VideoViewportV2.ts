import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import type { Point2 } from '../../../types';
import { ViewportType } from '../../../enums';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import { HtmlVideoPath } from './HtmlVideoRenderPath';
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
  readonly type = ViewportType.VIDEO;
  readonly id: string;
  readonly element: HTMLDivElement;
  readonly renderingEngineId: string;

  protected renderContext: VideoElementRenderContext;

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

      const payload = (binding.rendering as VideoElementRendering).runtime
        .payload;
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
  }

  seek(timeSeconds: number): void {
    this.setCamera({
      currentTimeSeconds: Math.max(0, timeSeconds),
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
    const dataId = this.getFirstBinding()?.data.id;

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

  getCurrentTime(): number {
    return this.getVideoElement()?.currentTime ?? 0;
  }

  getFrameNumber(): number {
    const payload = this.getPayload();
    const element = this.getVideoElement();

    if (!payload || !element) {
      return 1;
    }

    return timeSecondsToFrameNumber(element.currentTime, payload.fps);
  }

  render(): void {
    // DOM updates are applied immediately in updateCamera/updateDataPresentation
  }

  private getVideoElement(): HTMLVideoElement | undefined {
    return this.getVideoRendering()?.runtime.element;
  }

  private getPayload(): VideoStreamPayload | undefined {
    return this.getVideoRendering()?.runtime.payload;
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

    const dataId = this.getFirstBinding()?.data.id;
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
}

export default VideoViewportV2;
