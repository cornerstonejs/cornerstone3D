import type { Point2, ViewFraming } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { getPatchCanvasPan, toWorldPan } from '../viewportWorldPan';
import { normalizeECGViewState } from './ecgViewportCamera';
import type { ECGProjectionSnapshot } from './ECGProjectionTypes';
import type { ECGViewState } from './ECGViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<ViewFramingSelector, 'zoom' | 'pan' | 'worldPan'>
> = {
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
 * The size of a canvas pixel in units of the world of the trace layout, by
 * the canvas pixels of one such unit. Undefined without a ratio.
 */
function getPixelSize(ratio: number | undefined): Point2 | undefined {
  return ratio > 0 ? [1 / ratio, 1 / ratio] : undefined;
}

/**
 * Converts an ECG projection snapshot to the public view-framing shape. The
 * world pan is the pan in units of the world of the trace layout, the space
 * of the `anchorWorld` of the view state.
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

  const pixelSize = getPixelSize(snapshot.resolvedView?.worldToCanvasRatio);

  if (ecgSelector.worldPan && pixelSize) {
    target.worldPan = toWorldPan(snapshot.framing.rawPan, pixelSize);
  }

  return target;
}

/**
 * Converts an ECG view-framing patch back into semantic ECG view state. The
 * zoom applies first, and the pan then at the new zoom. A `worldPan` is
 * taken in place of `pan`.
 */
export function withECGProjectionFraming(
  snapshot: ECGProjectionSnapshot,
  framing: Partial<ViewFraming>,
  options: ProjectionWriteOptions = {}
): ECGViewState {
  const viewState = snapshot.viewState;
  const hasZoom = hasOwn(framing, 'zoom');
  const hasPan = hasOwn(framing, 'pan') || hasOwn(framing, 'worldPan');
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

  const targetPan =
    hasPan &&
    getPatchCanvasPan(
      framing,
      [nextZoom, nextZoom],
      getPixelSize(resolvedView?.worldToCanvasRatio)
    );

  if (targetPan && resolvedView) {
    nextViewState = normalizeECGViewState(
      resolvedView.withPan(targetPan).state.viewState
    );
  }

  return nextViewState;
}
