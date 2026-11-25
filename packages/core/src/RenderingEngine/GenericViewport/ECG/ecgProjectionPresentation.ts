import type { Point2, ViewPresentation } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { normalizeECGViewState } from './ecgViewportCamera';
import type { ECGProjectionSnapshot } from './ECGProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewPresentationSelector, 'zoom' | 'pan'>
> = {
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
 * Converts an ECG projection snapshot to the public view-presentation shape.
 */
export function getECGProjectionPresentation(
  snapshot: ECGProjectionSnapshot,
  selector: ViewPresentationSelector | undefined
): ViewPresentation {
  const target: ViewPresentation = {};
  const ecgSelector = selector ?? DEFAULT_SELECTOR;
  const zoom = snapshot.presentation.zoom ?? 1;

  if (ecgSelector.zoom) {
    target.zoom = zoom;
  }

  if (ecgSelector.pan) {
    const pan = snapshot.presentation.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
  }

  return target;
}

/**
 * Converts an ECG view-presentation patch back into semantic ECG view state.
 */
export function withECGProjectionPresentation(
  snapshot: ECGProjectionSnapshot,
  presentation: Partial<ViewPresentation>,
  options: ProjectionWriteOptions = {}
): ECGViewState {
  const viewState = snapshot.viewState;
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasPan = hasOwn(presentation, 'pan');
  const nextZoom = Math.max(
    presentation.zoom ?? snapshot.presentation.zoom ?? viewState.scale ?? 1,
    0.001
  );
  let resolvedView = snapshot.resolvedView;
  let nextViewState = normalizeECGViewState(viewState);

  if (hasZoom) {
    if (resolvedView) {
      resolvedView = resolvedView.withZoom(nextZoom, options.anchorCanvas);
      nextViewState = normalizeECGViewState(resolvedView.state.viewState);
    } else {
      nextViewState = normalizeECGViewState({
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
      nextViewState = normalizeECGViewState(
        resolvedView.withPan(targetPan).state.viewState
      );
    }
  }

  return nextViewState;
}
