import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  ViewportBackendContext,
} from '../ViewportArchitectureTypes';
import type {
  VideoElementBackendContext,
  VideoElementRendering,
  VideoPresentationProps,
  VideoStreamPayload,
  VideoViewState,
} from './VideoViewportV2Types';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';

export class HtmlVideoRenderingAdapter {
  async attach(
    ctx: ViewportBackendContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<VideoElementRendering> {
    const videoCtx = ctx as VideoElementBackendContext;
    const payload = data.payload as VideoStreamPayload;
    const element = document.createElement('video');

    element.src = payload.renderedUrl;
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    element.playsInline = true;
    element.style.position = 'absolute';
    element.style.inset = '0';
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.transformOrigin = 'center center';
    element.style.objectFit = 'contain';

    await new Promise<void>((resolve) => {
      const onLoadedMetadata = () => {
        element.removeEventListener('loadedmetadata', onLoadedMetadata);
        resolve();
      };

      element.addEventListener('loadedmetadata', onLoadedMetadata);
      videoCtx.element.appendChild(element);
    });

    const playbackInfo = normalizeVideoPlaybackInfo({
      durationSeconds: element.duration,
      cineRate: payload.fps,
      numberOfFrames: payload.numberOfFrames,
    });
    const normalizedPayload: VideoStreamPayload = {
      ...payload,
      durationSeconds: element.duration,
      fps: playbackInfo.fps,
      numberOfFrames: playbackInfo.numberOfFrames,
      frameRange: playbackInfo.frameRange,
    };

    return {
      id: `rendering:${data.id}:${options.renderMode}`,
      dataId: data.id,
      role: 'video',
      renderMode: 'video2d',
      backendHandle: {
        element,
        payload: normalizedPayload,
      },
    };
  }

  updatePresentation(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const videoProps = props as VideoPresentationProps | undefined;
    const { element } = (rendering as VideoElementRendering).backendHandle;

    element.style.display = videoProps?.visible === false ? 'none' : '';
    element.style.opacity = String(videoProps?.opacity ?? 1);
    element.loop = videoProps?.loop ?? true;
    element.muted = videoProps?.muted ?? true;
    element.playbackRate = videoProps?.playbackRate ?? 1;
    element.style.objectFit = videoProps?.objectFit ?? 'contain';
  }

  updateViewState(
    _ctx: ViewportBackendContext,
    rendering: MountedRendering,
    viewState: unknown
  ): void {
    const videoViewState = viewState as VideoViewState;
    const { element } = (rendering as VideoElementRendering).backendHandle;
    const scale = videoViewState.zoom ?? 1;
    const [panX, panY] = videoViewState.pan ?? [0, 0];
    const rotation = videoViewState.rotation ?? 0;

    element.style.transform = `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rotation}deg)`;

    if (
      typeof videoViewState.currentTimeSeconds === 'number' &&
      Math.abs(element.currentTime - videoViewState.currentTimeSeconds) > 0.02
    ) {
      element.currentTime = videoViewState.currentTimeSeconds;
    }
  }

  detach(_ctx: ViewportBackendContext, rendering: MountedRendering): void {
    const { element } = (rendering as VideoElementRendering).backendHandle;
    element.pause();
    element.remove();
  }
}

export class HtmlVideoPath implements RenderPathDefinition {
  readonly id = 'video:html-element';
  readonly viewportKind = 'video' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return (
      data.kind === 'videoStream' &&
      options.role === 'video' &&
      options.renderMode === 'video2d'
    );
  }

  createAdapter() {
    return new HtmlVideoRenderingAdapter();
  }
}
