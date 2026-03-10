import { defaultRenderPathResolver } from '../DefaultRenderPathResolver';
import ViewportV2 from '../ViewportV2';
import {
  frameNumberToTimeSeconds,
  timeSecondsToFrameNumber,
} from '../../../utilities/VideoUtilities';
import { DefaultVideoDataProvider } from './DefaultVideoDataProvider';
import { HtmlVideoPath } from './HtmlVideoRenderingAdapter';
import type {
  VideoElementBackendContext,
  VideoElementRendering,
  VideoPresentationProps,
  VideoStreamPayload,
  VideoViewportV2Input,
  VideoViewState,
} from './VideoViewportV2Types';

defaultRenderPathResolver.register(new HtmlVideoPath());

class VideoViewportV2 extends ViewportV2<
  VideoViewState,
  VideoPresentationProps
> {
  readonly kind = 'video' as const;
  readonly id: string;
  readonly element: HTMLDivElement;

  protected backendContext: VideoElementBackendContext;

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
    this.backendContext = {
      viewportId: this.id,
      viewportKind: 'video',
      element: this.element,
    };
    this.viewState = {
      zoom: 1,
      pan: [0, 0],
      rotation: 0,
      currentTimeSeconds: 0,
    };

    this.element.setAttribute('data-viewport-uid', this.id);
  }

  async setVideo(dataId: string): Promise<string> {
    const renderingId = await this.setDataId(dataId, {
      role: 'video',
      renderMode: 'video2d',
    });
    const binding = this.getBinding(dataId);

    if (!binding) {
      return renderingId;
    }

    this.setPresentation(dataId, {
      visible: true,
      opacity: 1,
      loop: true,
      muted: true,
      playbackRate: 1,
      objectFit: 'contain',
    });

    const payload = (binding.rendering as VideoElementRendering).backendHandle
      .payload;
    this.setViewState({
      zoom: 1,
      pan: [0, 0],
      rotation: 0,
      currentTimeSeconds: 0,
    });

    if (payload.frameRange[0] > 1) {
      this.seek(frameNumberToTimeSeconds(payload.frameRange[0], payload.fps));
    }

    return renderingId;
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
    this.setViewState({
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
    const firstBinding = this.bindings.values().next().value;

    if (!firstBinding) {
      return;
    }

    this.setPresentation(firstBinding.data.id, {
      ...(this.getPresentation(firstBinding.data.id) || {}),
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
    this.redrawBindings();
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
