import type { Point2, ViewPresentation } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { normalizeVideoViewState } from './videoViewportCamera';
import type { VideoProjectionSnapshot } from './VideoProjectionTypes';
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
 * Converts a Video view-presentation patch back into semantic Video view state.
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
  let resolvedView = snapshot.resolvedView;
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
      nextViewState = normalizeVideoViewState({
        ...resolvedView.withPan(targetPan).state?.viewState,
        ...(hasRotation ? { rotation: presentation.rotation ?? 0 } : {}),
      });
    }
  }

  return nextViewState;
}
