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
  VideoProperties,
  VideoStreamPayload,
} from './VideoViewportTypes';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';
import { resolveVideoCanvasMapping } from './videoViewportCamera';

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
      applyViewState: (camera) => {
        this.applyViewState(rendering, camera, videoData);
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

  private applyViewState(
    rendering: VideoElementRendering,
    camera: unknown,
    data: VideoStreamPayload
  ): void {
    const videoCamera = camera as VideoCamera;
    const { element } = rendering;
    const rotation = videoCamera.rotation ?? 0;
    const mapping = this.getCanvasMapping(element, videoCamera);

    rendering.currentCamera = videoCamera;

    if (mapping) {
      element.style.width = `${mapping.width}px`;
      element.style.height = `${mapping.height}px`;
      element.style.left = `${mapping.left}px`;
      element.style.top = `${mapping.top}px`;
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
    const mapping = this.getCanvasMapping(
      rendering.element,
      rendering.currentCamera
    );

    if (!mapping) {
      return [0, 0, 0];
    }

    return [
      (canvasPos[0] - mapping.left) / mapping.worldToCanvasRatio,
      (canvasPos[1] - mapping.top) / mapping.worldToCanvasRatio,
      0,
    ];
  }

  private worldToCanvas(
    rendering: VideoElementRendering,
    worldPos: Point3
  ): Point2 {
    const mapping = this.getCanvasMapping(
      rendering.element,
      rendering.currentCamera
    );

    if (!mapping) {
      return [0, 0];
    }

    return [
      mapping.left + worldPos[0] * mapping.worldToCanvasRatio,
      mapping.top + worldPos[1] * mapping.worldToCanvasRatio,
    ];
  }

  private getCanvasMapping(element: HTMLVideoElement, camera?: VideoCamera) {
    const container = element.parentElement;

    return resolveVideoCanvasMapping({
      containerWidth: container?.clientWidth ?? 0,
      containerHeight: container?.clientHeight ?? 0,
      intrinsicWidth: element.videoWidth || container?.clientWidth || 0,
      intrinsicHeight: element.videoHeight || container?.clientHeight || 0,
      objectFit: element.style.objectFit as VideoProperties['objectFit'],
      camera,
    });
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

export class HtmlVideoPath
  implements RenderPathDefinition<VideoElementRenderContext>
{
  readonly id = 'video:html-element';
  readonly type = ViewportType.VIDEO_NEXT;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'video' && options.renderMode === 'video2d';
  }

  createRenderPath() {
    return new HtmlVideoRenderPath();
  }
}
