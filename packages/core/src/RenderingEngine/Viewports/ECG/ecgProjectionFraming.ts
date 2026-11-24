import type { Point2, ViewFraming } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { normalizeECGViewState } from './ecgViewportCamera';
import type { ECGProjectionSnapshot } from './ECGProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

const DEFAULT_SELECTOR: Required<Pick<ViewFramingSelector, 'zoom' | 'pan'>> = {
  zoom: true,
  pan: true,
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
 * Converts an ECG projection snapshot to the public view-framing shape.
 */
export function getECGProjectionFraming(
  snapshot: ECGProjectionSnapshot,
  selector: ViewFramingSelector | undefined
): ViewFraming {
  const target: ViewFraming = {};
  const ecgSelector = selector ?? DEFAULT_SELECTOR;
  const zoom = snapshot.framing.zoom ?? 1;

  if (ecgSelector.zoom) {
    target.zoom = zoom;
  }

  if (ecgSelector.pan) {
    const pan = snapshot.framing.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
  }

  return target;
}

/**
 * Converts an ECG view-framing patch back into semantic ECG view state.
 */
export function withECGProjectionFraming(
  snapshot: ECGProjectionSnapshot,
  framing: Partial<ViewFraming>,
  options: ProjectionWriteOptions = {}
): ECGViewState {
  const viewState = snapshot.viewState;
  const hasZoom = hasOwn(framing, 'zoom');
  const hasPan = hasOwn(framing, 'pan');
  const nextZoom = Math.max(
    framing.zoom ?? snapshot.framing.zoom ?? viewState.scale ?? 1,
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

  if (hasPan && framing.pan) {
    const targetPan: Point2 = [
      framing.pan[0] * nextZoom,
      framing.pan[1] * nextZoom,
    ];

    if (resolvedView) {
      nextViewState = normalizeECGViewState(
        resolvedView.withPan(targetPan).state.viewState
      );
    }
  }

  return nextViewState;
}
