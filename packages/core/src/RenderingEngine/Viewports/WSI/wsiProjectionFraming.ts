import type { Point2, ViewFraming } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import type { WSIProjectionSnapshot } from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewFramingSelector, 'rotation' | 'zoom' | 'pan'>
> = {
  rotation: true,
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
 * Converts a WSI projection snapshot to the public view-framing shape.
 * The zoom is a factor against the fit of the microscopy viewer, and the pan
 * is in canvas pixels divided by the zoom, as on the other families.
 */
export function getWSIProjectionFraming(
  snapshot: WSIProjectionSnapshot,
  selector: ViewFramingSelector | undefined
): ViewFraming {
  const target: ViewFraming = {};
  const wsiSelector = selector ?? DEFAULT_SELECTOR;

  if (wsiSelector.zoom) {
    target.zoom = snapshot.framing.zoom;
  }

  if (wsiSelector.rotation) {
    target.rotation = snapshot.framing.rotation;
  }

  if (wsiSelector.pan) {
    const zoom = snapshot.framing.zoom ?? 1;
    const pan = snapshot.framing.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
  }

  return target;
}

/**
 * Converts a WSI view-framing patch back into semantic WSI view state.
 * The zoom applies first, and the pan then at the new zoom. A zoom is a
 * factor against the fit: the map gets the resolution of the fit divided by
 * the zoom, about `options.anchorCanvas` when given. A zoom does nothing
 * when the viewport shows nothing to fit.
 */
export function withWSIProjectionFraming(
  snapshot: WSIProjectionSnapshot,
  framing: Partial<ViewFraming>,
  options: ProjectionWriteOptions = {}
): WSIViewState {
  const hasZoom = hasOwn(framing, 'zoom');
  const hasRotation = hasOwn(framing, 'rotation');
  const hasPan = hasOwn(framing, 'pan');
  const nextZoom = Math.max(framing.zoom ?? snapshot.framing.zoom ?? 1, 0.001);
  let nextViewState: WSIViewState = {
    ...snapshot.viewState,
    centerIndex: snapshot.viewState.centerIndex
      ? [snapshot.viewState.centerIndex[0], snapshot.viewState.centerIndex[1]]
      : undefined,
  };

  let resolvedView = snapshot.resolvedView;
  const fitResolution = resolvedView?.state?.fitResolution;

  if (hasZoom && fitResolution && resolvedView?.withResolution) {
    resolvedView = resolvedView.withResolution(
      fitResolution / nextZoom,
      options.anchorCanvas
    );
    nextViewState = { ...resolvedView.state.viewState };
  }

  if (hasPan && framing.pan && resolvedView?.withPan) {
    const targetPan: Point2 = [
      framing.pan[0] * nextZoom,
      framing.pan[1] * nextZoom,
    ];

    nextViewState = { ...resolvedView.withPan(targetPan).state.viewState };
  }

  if (hasRotation) {
    nextViewState.rotation = framing.rotation ?? 0;
  }

  return nextViewState;
}
