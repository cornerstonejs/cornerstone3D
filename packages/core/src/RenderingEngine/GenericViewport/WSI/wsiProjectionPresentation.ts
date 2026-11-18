import type { Point2, ViewPresentation } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import type { WSIProjectionSnapshot } from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

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
 * Converts a WSI projection snapshot to the public view-presentation shape.
 * The zoom is a factor against the fit of the microscopy viewer, and the pan
 * is in canvas pixels divided by the zoom, as on the other families.
 */
export function getWSIProjectionPresentation(
  snapshot: WSIProjectionSnapshot,
  selector: ViewPresentationSelector | undefined
): ViewPresentation {
  const target: ViewPresentation = {};
  const wsiSelector = selector ?? DEFAULT_SELECTOR;

  if (wsiSelector.zoom) {
    target.zoom = snapshot.presentation.zoom;
  }

  if (wsiSelector.rotation) {
    target.rotation = snapshot.presentation.rotation;
  }

  if (wsiSelector.pan) {
    const zoom = snapshot.presentation.zoom ?? 1;
    const pan = snapshot.presentation.rawPan;

    target.pan = [pan[0] / zoom, pan[1] / zoom];
  }

  return target;
}

/**
 * Converts a WSI view-presentation patch back into semantic WSI view state.
 * The zoom applies first, and the pan then at the new zoom. A zoom is a
 * factor against the fit: the map gets the resolution of the fit divided by
 * the zoom, about `options.anchorCanvas` when given. A zoom does nothing
 * when the viewport shows nothing to fit.
 */
export function withWSIProjectionPresentation(
  snapshot: WSIProjectionSnapshot,
  presentation: Partial<ViewPresentation>,
  options: ProjectionWriteOptions = {}
): WSIViewState {
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasRotation = hasOwn(presentation, 'rotation');
  const hasPan = hasOwn(presentation, 'pan');
  const nextZoom = Math.max(
    presentation.zoom ?? snapshot.presentation.zoom ?? 1,
    0.001
  );
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

  if (hasPan && presentation.pan && resolvedView?.withPan) {
    const targetPan: Point2 = [
      presentation.pan[0] * nextZoom,
      presentation.pan[1] * nextZoom,
    ];

    nextViewState = { ...resolvedView.withPan(targetPan).state.viewState };
  }

  if (hasRotation) {
    nextViewState.rotation = presentation.rotation ?? 0;
  }

  return nextViewState;
}
