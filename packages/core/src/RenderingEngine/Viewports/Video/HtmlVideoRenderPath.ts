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
  VideoViewState,
  VideoDisplaySetAppearance,
  VideoElementRenderContext,
  VideoElementRendering,
  VideoProperties,
  VideoStreamPayload,
} from './VideoViewportTypes';
import { normalizeVideoPlaybackInfo } from '../../../utilities/VideoUtilities';
import {
  getVideoRotationPivot,
  resolveVideoCanvasMapping,
} from './videoViewportCamera';
import { buildWSIColorTransform } from '../WSI/wsiTransformUtils';
import { videoLoadError } from './videoLoadError';

/** @internal */
export class HtmlVideoRenderPath
  implements RenderPath<VideoElementRenderContext>
{
  /**
   * Puts a video element of the data in the layer of the viewport and waits
   * for its metadata. Rejects with `videoLoadError` when the element fails
   * first. When `signal` aborts first (a newer `setDisplaySets` superseded
   * the mount), the element stops its load, goes with its listeners, and
   * the call rejects with the reason of the signal.
   */
  async addData(
    ctx: VideoElementRenderContext,
    data: LoadedData,
    options: DataAddOptions,
    signal?: AbortSignal
  ): Promise<RenderPathAttachment<VideoDisplaySetAppearance>> {
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

    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        const error = videoLoadError(videoData.id, element);

        cleanup();
        dropVideoElement(element);
        reject(error);
      };
      const onAbort = () => {
        cleanup();
        dropVideoElement(element);
        reject(signal.reason);
      };
      const cleanup = () => {
        element.removeEventListener('loadedmetadata', onLoadedMetadata);
        element.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }

      element.addEventListener('loadedmetadata', onLoadedMetadata);
      element.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort);
      mountVideoElement(ctx, element);
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
      renderMode: 'video2d',
      element,
    };

    return {
      rendering,
      updateAppearance: (props) => {
        this.updateAppearance(rendering, props);
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

  private updateAppearance(
    rendering: VideoElementRendering,
    props: unknown
  ): void {
    const videoProps = props as VideoDisplaySetAppearance | undefined;
    const { element } = rendering;

    element.style.display = videoProps?.visible === false ? 'none' : '';
    element.style.opacity = String(videoProps?.opacity ?? 1);
    element.loop = videoProps?.loop ?? true;
    element.muted = videoProps?.muted ?? true;
    element.playbackRate = videoProps?.playbackRate ?? 1;
    element.style.objectFit = videoProps?.objectFit ?? 'contain';
    element.style.filter = [
      buildWSIColorTransform(videoProps?.voiRange, videoProps?.averageWhite),
      videoProps?.invert ? 'invert(1)' : undefined,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private applyViewState(
    rendering: VideoElementRendering,
    camera: unknown,
    data: VideoStreamPayload
  ): void {
    const videoCamera = camera as VideoViewState;
    const { element } = rendering;
    const rotation = videoCamera.rotation ?? 0;
    const mapping = this.getCanvasMapping(element, videoCamera);

    rendering.currentCamera = videoCamera;

    if (mapping) {
      const [pivotX, pivotY] = getVideoRotationPivot(mapping);

      element.style.width = `${mapping.width}px`;
      element.style.height = `${mapping.height}px`;
      element.style.left = `${mapping.left}px`;
      element.style.top = `${mapping.top}px`;
      element.style.transformOrigin = `${pivotX - mapping.left}px ${pivotY - mapping.top}px`;
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
      (canvasPos[1] - mapping.top) / mapping.worldToCanvasRatioY,
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
      mapping.top + worldPos[1] * mapping.worldToCanvasRatioY,
    ];
  }

  private getCanvasMapping(element: HTMLVideoElement, camera?: VideoViewState) {
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
    dropVideoElement(element);
  }
}

/**
 * Takes a video element out of the viewport and ends its load: without its
 * source and after `load()` the browser drops the request of the media, which
 * a removed element otherwise keeps open until it ends.
 */
function dropVideoElement(element: HTMLVideoElement): void {
  element.remove();
  element.removeAttribute('src');
  element.load();
}

/**
 * Puts a video element in the layer of the viewport canvas, after the canvas
 * and the videos mounted before it, and under the layers that come after
 * them: the labelmap layer of the viewport and the SVG layer of the tools.
 * Without a canvas in a layer the video goes at the end of the element.
 */
function mountVideoElement(
  ctx: VideoElementRenderContext,
  element: HTMLVideoElement
): void {
  const layer = ctx.canvas?.parentElement;

  if (!layer) {
    ctx.element.appendChild(element);
    return;
  }

  let before = ctx.canvas.nextSibling;

  while (before instanceof HTMLVideoElement) {
    before = before.nextSibling;
  }

  layer.insertBefore(element, before);
}

/** @internal */
export class HtmlVideoPath
  implements RenderPathDefinition<VideoElementRenderContext>
{
  readonly id = 'video:html-element';
  readonly type = ViewportType.VIDEO;

  matches(data: LoadedData, options: DataAddOptions): boolean {
    return data.type === 'video' && options.renderMode === 'video2d';
  }

  createRenderPath() {
    return new HtmlVideoRenderPath();
  }
}
