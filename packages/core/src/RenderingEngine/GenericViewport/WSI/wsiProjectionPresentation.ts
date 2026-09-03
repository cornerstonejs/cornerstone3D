import type { ViewPresentation } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import type { WSIProjectionSnapshot } from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewPresentationSelector, 'rotation' | 'zoom'>
> = {
  rotation: true,
  zoom: true,
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

  return target;
}

/**
 * Converts a WSI view-presentation patch back into semantic WSI view state.
 */
export function withWSIProjectionPresentation(
  snapshot: WSIProjectionSnapshot,
  presentation: Partial<ViewPresentation>,
  options: ProjectionWriteOptions = {}
): WSIViewState {
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasRotation = hasOwn(presentation, 'rotation');
  const nextZoom = Math.max(
    presentation.zoom ??
      snapshot.presentation.zoom ??
      snapshot.viewState.zoom ??
      1,
    0.001
  );
  let nextViewState: WSIViewState = {
    ...snapshot.viewState,
    centerIndex: snapshot.viewState.centerIndex
      ? [snapshot.viewState.centerIndex[0], snapshot.viewState.centerIndex[1]]
      : undefined,
  };

  if (hasZoom) {
    if (snapshot.resolvedView) {
      nextViewState = {
        ...snapshot.resolvedView.withZoom(nextZoom, options.anchorCanvas).state
          .viewState,
      };
    } else {
      nextViewState.zoom = nextZoom;
    }
  }

  if (hasRotation) {
    nextViewState.rotation = presentation.rotation ?? 0;
  }

  return nextViewState;
}
