import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderingAdapter,
} from '../ViewportArchitectureTypes';
import type {
  VideoCamera,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoPresentationProps,
  VideoStreamPayload,
  VideoProperties,
} from './VideoViewportV2Types';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';

export class HtmlVideoRenderingAdapter
  implements RenderingAdapter<VideoElementRenderContext>
{
  async attach(
    ctx: VideoElementRenderContext,
    data: LogicalDataObject,
    options: DataAttachmentOptions
  ): Promise<VideoElementRendering> {
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
      ctx.element.appendChild(element);
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
      renderMode: 'video2d',
      runtime: {
        element,
        payload: normalizedPayload,
      },
    };
  }

  updatePresentation(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering,
    props: unknown
  ): void {
    const videoProps = props as VideoPresentationProps | undefined;
    const { element } = (rendering as VideoElementRendering).runtime;

    element.style.display = videoProps?.visible === false ? 'none' : '';
    element.style.opacity = String(videoProps?.opacity ?? 1);
  }

  updateCamera(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering,
    camera: unknown
  ): void {
    const videoCamera = camera as VideoCamera;
    const { element } = (rendering as VideoElementRendering).runtime;
    const scale = videoCamera.zoom ?? 1;
    const [panX, panY] = videoCamera.pan ?? [0, 0];
    const rotation = videoCamera.rotation ?? 0;

    element.style.transform = `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rotation}deg)`;

    if (
      typeof videoCamera.currentTimeSeconds === 'number' &&
      Math.abs(element.currentTime - videoCamera.currentTimeSeconds) > 0.02
    ) {
      element.currentTime = videoCamera.currentTimeSeconds;
    }
  }

  updateProperties(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering,
    presentation: unknown
  ): void {
    const videoPres = presentation as VideoProperties | undefined;
    const { element } = (rendering as VideoElementRendering).runtime;

    element.loop = videoPres?.loop ?? true;
    element.muted = videoPres?.muted ?? true;
    element.playbackRate = videoPres?.playbackRate ?? 1;
    element.style.objectFit = videoPres?.objectFit ?? 'contain';
  }

  detach(_ctx: VideoElementRenderContext, rendering: MountedRendering): void {
    const { element } = (rendering as VideoElementRendering).runtime;
    element.pause();
    element.remove();
  }
}

export class HtmlVideoPath
  implements RenderPathDefinition<VideoElementRenderContext>
{
  readonly id = 'video:html-element';
  readonly type = 'video' as const;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'video' && options.renderMode === 'video2d';
  }

  createAdapter() {
    return new HtmlVideoRenderingAdapter();
  }
}
