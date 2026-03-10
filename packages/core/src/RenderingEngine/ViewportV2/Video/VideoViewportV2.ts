import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import { HtmlVideoPath } from './HtmlVideoRenderingAdapter';
import type {
  VideoCamera,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoPresentationProps,
  VideoStreamPayload,
  VideoProperties,
  VideoViewportV2Input,
} from './VideoViewportV2Types';

defaultRenderPathResolver.register(new HtmlVideoPath());

class VideoViewportV2 extends ViewportV2<
  VideoCamera,
  VideoProperties,
  VideoPresentationProps,
  VideoElementRenderContext
> {
  readonly kind = 'video' as const;
  readonly id: string;
  readonly element: HTMLDivElement;

  protected renderContext: VideoElementRenderContext;

  constructor(args: VideoViewportV2Input) {
    super();
    this.id = args.id;
    this.element = args.element;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.overflow = 'hidden';
    this.element.style.background = this.element.style.background || '#000';
    this.dataProvider = args.dataProvider || new DefaultVideoDataProvider();
    this.renderPathResolver =
      args.renderPathResolver || defaultRenderPathResolver;
    this.renderContext = {
      viewportId: this.id,
      viewportKind: 'video',
      element: this.element,
    };
    this.camera = {
      zoom: 1,
      pan: [0, 0],
      rotation: 0,
      currentTimeSeconds: 0,
    };
    this.viewportPresentation = {
      playbackRate: 1,
      loop: true,
      muted: true,
      objectFit: 'contain',
    };

    this.element.setAttribute('data-viewport-uid', this.id);
  }

  async setVideo(dataId: string): Promise<string> {
    const [renderingId] = await this.setDataIds([dataId]);

    return renderingId;
  }

  async setDataIds(dataIds: string[]): Promise<string[]> {
    const renderingIds: string[] = [];

    for (const dataId of dataIds) {
      const renderingId = await this.setDataId(dataId, {
        role: 'video',
        renderMode: 'video2d',
      });
      const binding = this.getBinding(dataId);

      if (!binding) {
        renderingIds.push(renderingId);
        continue;
      }

      this.setPresentation(dataId, {
        visible: true,
        opacity: 1,
      });

      const payload = (binding.rendering as VideoElementRendering).backendHandle
        .payload;
      this.camera = {
        zoom: 1,
        pan: [0, 0],
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
    this.setViewportPresentation({ playbackRate });
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
    // DOM updates are applied immediately in updateCamera/updateViewportPresentation
  }

  private getVideoElement(): HTMLVideoElement | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as VideoElementRendering).backendHandle
      .element;
  }

  private getPayload(): VideoStreamPayload | undefined {
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    return (firstBinding.rendering as VideoElementRendering).backendHandle
      .payload;
  }
}

export default VideoViewportV2;
