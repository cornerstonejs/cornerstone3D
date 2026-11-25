import type { ViewFraming } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import {
  getCanvasPixelWorldSize,
  getPatchCanvasPan,
  toWorldPan,
} from '../viewportWorldPan';
import { normalizeVideoViewState } from './videoViewportCamera';
import type {
  VideoProjectionSnapshot,
  VideoResolvedViewLike,
} from './VideoProjectionTypes';
import VideoResolvedView from './VideoResolvedView';
import type { VideoViewState } from './VideoViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewFramingSelector, 'rotation' | 'zoom' | 'pan' | 'worldPan'>
> = {
  rotation: true,
  zoom: true,
  pan: true,
  worldPan: true,
};

/**
 * Narrows a framing patch to fields explicitly provided by the caller.
 */
function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Converts a Video projection snapshot to the public view-framing shape.
 * The pan is the pan of `getPan` of the viewport divided by the zoom: canvas
 * pixels on the screen at zoom 1, `[0, 0]` for the fitted view, at any
 * rotation. The world pan is the same shift in pixels of the video.
 */
export function getVideoProjectionFraming(
  snapshot: VideoProjectionSnapshot,
  selector: ViewFramingSelector | undefined
): ViewFraming {
  const target: ViewFraming = {};
  const videoSelector = selector ?? DEFAULT_SELECTOR;
  const zoom = snapshot.framing.zoom ?? 1;

  if (videoSelector.rotation) {
    target.rotation = snapshot.framing.rotation ?? 0;
  }

  if (videoSelector.zoom) {
    target.zoom = zoom;
  }

  if (videoSelector.pan) {
    const pan = snapshot.framing.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
  }

  if (videoSelector.worldPan && snapshot.transforms?.canvasToWorld) {
    target.worldPan = toWorldPan(
      snapshot.framing.rawPan,
      getCanvasPixelWorldSize(snapshot.transforms.canvasToWorld)
    );
  }

  return target;
}

/**
 * The resolved view turned to a rotation, so that the zoom and the pan of the
 * same patch are measured on the turned view. A resolved view that is not a
 * `VideoResolvedView` stays as it is.
 */
function withRotation(
  resolvedView: VideoResolvedViewLike,
  rotation: number
): VideoResolvedViewLike {
  if (!(resolvedView instanceof VideoResolvedView)) {
    return resolvedView;
  }

  return new VideoResolvedView({
    ...resolvedView.state,
    viewState: normalizeVideoViewState({
      ...resolvedView.state.viewState,
      rotation,
    }),
  });
}

/**
 * Converts a Video view-framing patch back into semantic Video view state.
 * A new rotation applies first, then the zoom, and the pan then at the new
 * rotation and zoom, on the screen. A `worldPan` is taken in place of `pan`.
 */
export function withVideoProjectionFraming(
  snapshot: VideoProjectionSnapshot,
  framing: Partial<ViewFraming>,
  options: ProjectionWriteOptions = {}
): VideoViewState {
  const viewState = snapshot.viewState ?? {};
  const hasZoom = hasOwn(framing, 'zoom');
  const hasPan = hasOwn(framing, 'pan') || hasOwn(framing, 'worldPan');
  const hasRotation = hasOwn(framing, 'rotation');
  const nextZoom = Math.max(
    framing.zoom ?? snapshot.framing.zoom ?? viewState.scale ?? 1,
    0.001
  );
  let resolvedView =
    hasRotation && snapshot.resolvedView
      ? withRotation(snapshot.resolvedView, framing.rotation ?? 0)
      : snapshot.resolvedView;
  let nextViewState: VideoViewState = normalizeVideoViewState({
    ...viewState,
    ...(hasRotation ? { rotation: framing.rotation ?? 0 } : {}),
  });

  if (hasZoom) {
    if (resolvedView) {
      resolvedView = resolvedView.withZoom(nextZoom, options.anchorCanvas);
      nextViewState = normalizeVideoViewState({
        ...resolvedView.state?.viewState,
        ...(hasRotation ? { rotation: framing.rotation ?? 0 } : {}),
      });
    } else {
      nextViewState = normalizeVideoViewState({
        ...nextViewState,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }
  }

  const targetPan =
    hasPan &&
    getPatchCanvasPan(
      framing,
      [nextZoom, nextZoom],
      framing.worldPan && resolvedView
        ? getCanvasPixelWorldSize((point) => resolvedView.canvasToWorld(point))
        : undefined
    );

  if (targetPan) {
    if (resolvedView) {
      const pannedView =
        resolvedView.withCanvasPan?.(targetPan) ??
        resolvedView.withPan(targetPan);

      nextViewState = normalizeVideoViewState({
        ...pannedView.state?.viewState,
        ...(hasRotation ? { rotation: framing.rotation ?? 0 } : {}),
      });
    }
  }

  return nextViewState;
}
