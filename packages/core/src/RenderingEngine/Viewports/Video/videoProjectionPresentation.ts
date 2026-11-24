import type { Point2, ViewPresentation } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { normalizeVideoViewState } from './videoViewportCamera';
import type {
  VideoProjectionSnapshot,
  VideoResolvedViewLike,
} from './VideoProjectionTypes';
import VideoResolvedView from './VideoResolvedView';
import type { VideoViewState } from './VideoViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewPresentationSelector, 'rotation' | 'zoom' | 'pan'>
> = {
  rotation: true,
  zoom: true,
  pan: true,
};

/**
 * Narrows a presentation patch to fields explicitly provided by the caller.
 */
function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Converts a Video projection snapshot to the public view-presentation shape.
 * The pan is the pan of `getPan` of the viewport divided by the zoom: canvas
 * pixels on the screen at zoom 1, `[0, 0]` for the fitted view, at any
 * rotation.
 */
export function getVideoProjectionPresentation(
  snapshot: VideoProjectionSnapshot,
  selector: ViewPresentationSelector | undefined
): ViewPresentation {
  const target: ViewPresentation = {};
  const videoSelector = selector ?? DEFAULT_SELECTOR;
  const zoom = snapshot.presentation.zoom ?? 1;

  if (videoSelector.rotation) {
    target.rotation = snapshot.presentation.rotation ?? 0;
  }

  if (videoSelector.zoom) {
    target.zoom = zoom;
  }

  if (videoSelector.pan) {
    const pan = snapshot.presentation.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
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
 * Converts a Video view-presentation patch back into semantic Video view state.
 * A new rotation applies first, then the zoom, and the pan then at the new
 * rotation and zoom, on the screen.
 */
export function withVideoProjectionPresentation(
  snapshot: VideoProjectionSnapshot,
  presentation: Partial<ViewPresentation>,
  options: ProjectionWriteOptions = {}
): VideoViewState {
  const viewState = snapshot.viewState ?? {};
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasPan = hasOwn(presentation, 'pan');
  const hasRotation = hasOwn(presentation, 'rotation');
  const nextZoom = Math.max(
    presentation.zoom ?? snapshot.presentation.zoom ?? viewState.scale ?? 1,
    0.001
  );
  let resolvedView =
    hasRotation && snapshot.resolvedView
      ? withRotation(snapshot.resolvedView, presentation.rotation ?? 0)
      : snapshot.resolvedView;
  let nextViewState: VideoViewState = normalizeVideoViewState({
    ...viewState,
    ...(hasRotation ? { rotation: presentation.rotation ?? 0 } : {}),
  });

  if (hasZoom) {
    if (resolvedView) {
      resolvedView = resolvedView.withZoom(nextZoom, options.anchorCanvas);
      nextViewState = normalizeVideoViewState({
        ...resolvedView.state?.viewState,
        ...(hasRotation ? { rotation: presentation.rotation ?? 0 } : {}),
      });
    } else {
      nextViewState = normalizeVideoViewState({
        ...nextViewState,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }
  }

  if (hasPan && presentation.pan) {
    const targetPan: Point2 = [
      presentation.pan[0] * nextZoom,
      presentation.pan[1] * nextZoom,
    ];

    if (resolvedView) {
      const pannedView =
        resolvedView.withCanvasPan?.(targetPan) ??
        resolvedView.withPan(targetPan);

      nextViewState = normalizeVideoViewState({
        ...pannedView.state?.viewState,
        ...(hasRotation ? { rotation: presentation.rotation ?? 0 } : {}),
      });
    }
  }

  return nextViewState;
}
