import type {
  DataAttachmentOptions,
  LogicalDataObject,
  MountedRendering,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type { Point2, Point3 } from '../../../types';
import ViewportType from '../../../enums/ViewportType';
import type {
  VideoCamera,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoPresentationProps,
  VideoStreamPayload,
  VideoProperties,
} from './VideoViewportV2Types';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';

export class HtmlVideoRenderPath
  implements RenderPath<VideoElementRenderContext>
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
    element.style.left = '0';
    element.style.top = '0';
    element.style.transformOrigin = 'top left';
    element.style.objectFit = 'fill';

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
    const videoRendering = rendering as VideoElementRendering;
    const { element } = videoRendering.runtime;
    const rotation = videoCamera.rotation ?? 0;
    const layout = getVideoLayout(element, videoCamera);

    videoRendering.runtime.currentCamera = videoCamera;

    if (layout) {
      element.style.width = `${layout.width}px`;
      element.style.height = `${layout.height}px`;
      element.style.left = `${layout.left}px`;
      element.style.top = `${layout.top}px`;
    }

    element.style.transform = `rotate(${rotation}deg)`;

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

  canvasToWorld(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering,
    canvasPos: Point2
  ): Point3 {
    const layout = getVideoLayout(
      (rendering as VideoElementRendering).runtime.element,
      (rendering as VideoElementRendering).runtime.currentCamera
    );

    if (!layout) {
      return [0, 0, 0];
    }

    return [
      canvasPos[0] / layout.worldToCanvasRatio - layout.panWorld[0],
      canvasPos[1] / layout.worldToCanvasRatio - layout.panWorld[1],
      0,
    ];
  }

  worldToCanvas(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering,
    worldPos: Point3
  ): Point2 {
    const layout = getVideoLayout(
      (rendering as VideoElementRendering).runtime.element,
      (rendering as VideoElementRendering).runtime.currentCamera
    );

    if (!layout) {
      return [0, 0];
    }

    return [
      (worldPos[0] + layout.panWorld[0]) * layout.worldToCanvasRatio,
      (worldPos[1] + layout.panWorld[1]) * layout.worldToCanvasRatio,
    ];
  }

  getFrameOfReferenceUID(
    _ctx: VideoElementRenderContext,
    rendering: MountedRendering
  ): string | undefined {
    const element = (rendering as VideoElementRendering).runtime.element;

    return element.currentSrc || element.src;
  }

  detach(_ctx: VideoElementRenderContext, rendering: MountedRendering): void {
    const { element } = (rendering as VideoElementRendering).runtime;
    element.pause();
    element.remove();
  }
}

function getVideoLayout(
  element: HTMLVideoElement,
  camera?: VideoCamera
):
  | {
      left: number;
      top: number;
      width: number;
      height: number;
      panWorld: [number, number];
      worldToCanvasRatio: number;
    }
  | undefined {
  const container = element.parentElement;
  const containerWidth = container?.clientWidth ?? 0;
  const containerHeight = container?.clientHeight ?? 0;
  const intrinsicWidth = element.videoWidth || containerWidth;
  const intrinsicHeight = element.videoHeight || containerHeight;

  if (
    !containerWidth ||
    !containerHeight ||
    !intrinsicWidth ||
    !intrinsicHeight
  ) {
    return;
  }

  const zoom = Math.max(camera.zoom ?? 1, 0.001);
  const baseScale = Math.min(
    containerWidth / intrinsicWidth,
    containerHeight / intrinsicHeight
  );
  const xOffsetWorld =
    (containerWidth - intrinsicWidth * baseScale) / 2 / baseScale;
  const yOffsetWorld =
    (containerHeight - intrinsicHeight * baseScale) / 2 / baseScale;
  const [panX, panY] = camera.pan ?? [xOffsetWorld, yOffsetWorld];
  const worldToCanvasRatio = baseScale * zoom;

  return {
    left: panX * worldToCanvasRatio,
    top: panY * worldToCanvasRatio,
    width: intrinsicWidth * worldToCanvasRatio,
    height: intrinsicHeight * worldToCanvasRatio,
    panWorld: [panX, panY],
    worldToCanvasRatio,
  };
}

export class HtmlVideoPath
  implements RenderPathDefinition<VideoElementRenderContext>
{
  readonly id = 'video:html-element';
  readonly type = ViewportType.VIDEO;

  matches(data: LogicalDataObject, options: DataAttachmentOptions): boolean {
    return data.type === 'video' && options.renderMode === 'video2d';
  }

  createRenderPath() {
    return new HtmlVideoRenderPath();
  }
}
