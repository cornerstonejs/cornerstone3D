import type {
  DataAddOptions,
  LoadedData,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPath,
} from '../ViewportArchitectureTypes';
import type { Point2, Point3 } from '../../../types';
import ViewportType from '../../../enums/ViewportType';
import type {
  VideoCamera,
  VideoDataPresentation,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoStreamPayload,
} from './VideoViewportV2Types';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';

export class HtmlVideoRenderPath
  implements RenderPath<VideoElementRenderContext>
{
  async addData(
    ctx: VideoElementRenderContext,
    data: LoadedData,
    options: DataAddOptions
  ): Promise<RenderPathAttachment<VideoDataPresentation>> {
    const videoData = data as unknown as LoadedData<VideoStreamPayload>;
    const payload: VideoStreamPayload = videoData;
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
    Object.assign(videoData, normalizedPayload);

    const rendering: VideoElementRendering = {
      id: `rendering:${data.id}:${options.renderMode}`,
      renderMode: 'video2d',
      element,
    };

    return {
      rendering,
      updateDataPresentation: (props) => {
        this.updateDataPresentation(rendering, props);
      },
      updateCamera: (camera) => {
        this.updateCamera(rendering, camera, videoData);
      },
      canvasToWorld: (canvasPos) => {
        return this.canvasToWorld(rendering, canvasPos);
      },
      worldToCanvas: (worldPos) => {
        return this.worldToCanvas(rendering, worldPos);
      },
      getFrameOfReferenceUID: () => {
        return this.getFrameOfReferenceUID(rendering);
      },
      removeData: () => {
        this.removeData(rendering);
      },
    };
  }

  private updateDataPresentation(
    rendering: VideoElementRendering,
    props: unknown
  ): void {
    const videoProps = props as VideoDataPresentation | undefined;
    const { element } = rendering;

    element.style.display = videoProps?.visible === false ? 'none' : '';
    element.style.opacity = String(videoProps?.opacity ?? 1);
    element.loop = videoProps?.loop ?? true;
    element.muted = videoProps?.muted ?? true;
    element.playbackRate = videoProps?.playbackRate ?? 1;
    element.style.objectFit = videoProps?.objectFit ?? 'contain';
  }

  private updateCamera(
    rendering: VideoElementRendering,
    camera: unknown,
    data: VideoStreamPayload
  ): void {
    const videoCamera = camera as VideoCamera;
    const { element } = rendering;
    const rotation = videoCamera.rotation ?? 0;
    const layout = getVideoLayout(element, videoCamera);

    rendering.currentCamera = videoCamera;

    if (layout) {
      element.style.width = `${layout.width}px`;
      element.style.height = `${layout.height}px`;
      element.style.left = `${layout.left}px`;
      element.style.top = `${layout.top}px`;
    }

    element.style.transform = `rotate(${rotation}deg)`;

    if (
      typeof videoCamera.currentTimeSeconds === 'number' &&
      Math.abs(element.currentTime - videoCamera.currentTimeSeconds) >
        0.5 / Math.max(1, data.fps)
    ) {
      element.currentTime = videoCamera.currentTimeSeconds;
    }
  }

  private canvasToWorld(
    rendering: VideoElementRendering,
    canvasPos: Point2
  ): Point3 {
    const layout = getVideoLayout(rendering.element, rendering.currentCamera);

    if (!layout) {
      return [0, 0, 0];
    }

    return [
      canvasPos[0] / layout.worldToCanvasRatio - layout.panWorld[0],
      canvasPos[1] / layout.worldToCanvasRatio - layout.panWorld[1],
      0,
    ];
  }

  private worldToCanvas(
    rendering: VideoElementRendering,
    worldPos: Point3
  ): Point2 {
    const layout = getVideoLayout(rendering.element, rendering.currentCamera);

    if (!layout) {
      return [0, 0];
    }

    return [
      (worldPos[0] + layout.panWorld[0]) * layout.worldToCanvasRatio,
      (worldPos[1] + layout.panWorld[1]) * layout.worldToCanvasRatio,
    ];
  }

  private getFrameOfReferenceUID(
    rendering: VideoElementRendering
  ): string | undefined {
    const { element } = rendering;

    return element.currentSrc || element.src;
  }

  private removeData(rendering: VideoElementRendering): void {
    const { element } = rendering;
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
  readonly type = ViewportType.VIDEO_V2;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'video' && options.renderMode === 'video2d';
  }

  createRenderPath() {
    return new HtmlVideoRenderPath();
  }
}
