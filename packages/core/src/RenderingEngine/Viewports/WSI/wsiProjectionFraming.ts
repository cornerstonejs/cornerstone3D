import type { ViewFraming } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { getPatchCanvasPan, toWorldPan } from '../viewportWorldPan';
import type { WSIProjectionSnapshot } from './WSIProjectionTypes';
import type { WSIViewState } from './WSIViewportTypes';

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
 * Converts a WSI projection snapshot to the public view-framing shape.
 * The zoom is a factor against the fit of the microscopy viewer, and the pan
 * is in canvas pixels divided by the zoom, as on the other families. The
 * world pan is the same shift in the world units of the slide.
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

  const pixelSize = snapshot.resolvedView?.canvasPixelSize;

  if (wsiSelector.worldPan && pixelSize) {
    target.worldPan = toWorldPan(snapshot.framing.rawPan, pixelSize);
  }

  return target;
}

/**
 * Converts a WSI view-framing patch back into semantic WSI view state.
 * The zoom applies first, and the pan then at the new zoom. A zoom is a
 * factor against the fit: the map gets the resolution of the fit divided by
 * the zoom, about `options.anchorCanvas` when given. A zoom does nothing
 * when the viewport shows nothing to fit. A `worldPan` is taken in place of
 * `pan`: a canvas pixel of the map, measured in the world, grows as the zoom
 * shrinks.
 */
export function withWSIProjectionFraming(
  snapshot: WSIProjectionSnapshot,
  framing: Partial<ViewFraming>,
  options: ProjectionWriteOptions = {}
): WSIViewState {
  const hasZoom = hasOwn(framing, 'zoom');
  const hasRotation = hasOwn(framing, 'rotation');
  const hasPan = hasOwn(framing, 'pan') || hasOwn(framing, 'worldPan');
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

  const currentZoom = snapshot.framing.zoom ?? 1;
  const pixelSize = snapshot.resolvedView?.canvasPixelSize;
  const targetPan =
    hasPan &&
    getPatchCanvasPan(
      framing,
      [nextZoom, nextZoom],
      pixelSize && [
        (pixelSize[0] * currentZoom) / nextZoom,
        (pixelSize[1] * currentZoom) / nextZoom,
      ]
    );

  if (targetPan && resolvedView?.withPan) {
    nextViewState = { ...resolvedView.withPan(targetPan).state.viewState };
  }

  if (hasRotation) {
    nextViewState.rotation = framing.rotation ?? 0;
  }

  return nextViewState;
}
