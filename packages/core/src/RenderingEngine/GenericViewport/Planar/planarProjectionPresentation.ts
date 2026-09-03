import type { Point2 } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import { normalizePlanarScale } from './planarCameraScale';
import { getPlanarProjectionFallbackViewStateWithPan } from './planarProjectionFallback';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionZoom,
} from './planarProjectionSnapshot';
import type { PlanarProjectionSnapshot } from './PlanarProjectionTypes';
import { cloneDisplayArea, normalizePlanarViewState } from './planarViewState';
import type {
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarViewState,
} from './PlanarViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<
    PlanarViewPresentationSelector,
    | 'rotation'
    | 'displayArea'
    | 'zoom'
    | 'scale'
    | 'pan'
    | 'flipHorizontal'
    | 'flipVertical'
  >
> = {
  rotation: true,
  displayArea: true,
  zoom: true,
  scale: true,
  pan: true,
  flipHorizontal: true,
  flipVertical: true,
};

function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Preserves explicit display-area clears after normalization, because
 * `setViewState` merges patches and therefore needs an own undefined property.
 */
function preserveDisplayAreaClear(
  viewState: PlanarViewState,
  shouldPreserveClear: boolean
): PlanarViewState {
  return shouldPreserveClear
    ? { ...viewState, displayArea: undefined }
    : viewState;
}

/**
 * Converts a Planar projection snapshot to the existing public
 * PlanarViewPresentation compatibility shape.
 */
export function getPlanarProjectionPresentation(
  snapshot: PlanarProjectionSnapshot,
  selector: ViewPresentationSelector | undefined
): PlanarViewPresentation {
  const target: PlanarViewPresentation = {};
  const planarSelector =
    (selector as PlanarViewPresentationSelector | undefined) ??
    DEFAULT_SELECTOR;

  if (planarSelector.rotation) {
    target.rotation = snapshot.presentation.rotation;
  }

  if (planarSelector.displayArea) {
    target.displayArea = cloneDisplayArea(snapshot.displayArea);
  }

  if (planarSelector.zoom) {
    target.zoom = getPlanarProjectionZoom(snapshot);
  }

  if (planarSelector.scale) {
    target.scale = getPlanarProjectionScale(snapshot);
  }

  if (planarSelector.pan) {
    const scale = getPlanarProjectionScale(snapshot);
    const pan = getPlanarProjectionPan(snapshot);

    target.pan = [pan[0] / scale[0], pan[1] / scale[1]];
  }

  if (planarSelector.flipHorizontal) {
    target.flipHorizontal = snapshot.presentation.flipHorizontal ?? false;
  }

  if (planarSelector.flipVertical) {
    target.flipVertical = snapshot.presentation.flipVertical ?? false;
  }

  return target;
}

/**
 * Converts a Planar view-presentation patch back into normalized semantic
 * PlanarViewState.
 */
export function withPlanarProjectionPresentation(
  snapshot: PlanarProjectionSnapshot,
  presentation: Partial<PlanarViewPresentation>
): PlanarViewState {
  const {
    pan,
    rotation = snapshot.presentation.rotation,
    flipHorizontal = snapshot.viewState?.flipHorizontal ?? false,
    flipVertical = snapshot.viewState?.flipVertical ?? false,
  } = presentation;
  const viewState = snapshot.viewState ?? {};
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasScale = hasOwn(presentation, 'scale');
  const hasDisplayArea = hasOwn(presentation, 'displayArea');
  const nextScale = hasScale
    ? normalizePlanarScale(presentation.scale)
    : normalizePlanarScale(
        presentation.zoom ?? snapshot.presentation.scaleVector
      );
  const nextCamera: Partial<PlanarViewState> = {
    flipHorizontal,
    flipVertical,
    rotation,
  };

  if (hasDisplayArea) {
    const displayArea = cloneDisplayArea(presentation.displayArea);

    nextCamera.anchorCanvas = [0.5, 0.5];
    nextCamera.anchorWorld = undefined;
    nextCamera.displayArea = displayArea;
    nextCamera.scale = hasZoom || hasScale ? nextScale : [1, 1];
    nextCamera.scaleMode = displayArea?.scaleMode ?? 'fit';
  } else if (hasZoom || hasScale || !viewState.displayArea) {
    nextCamera.scale = nextScale;
    nextCamera.scaleMode = 'fit';
  }

  if (pan) {
    const targetPan: Point2 = [pan[0] * nextScale[0], pan[1] * nextScale[1]];
    const baseViewState = normalizePlanarViewState({
      ...viewState,
      ...nextCamera,
    });
    const resolvedView =
      snapshot.resolveViewState?.(baseViewState) ??
      (baseViewState === snapshot.viewState
        ? snapshot.resolvedView
        : undefined);

    const nextViewState =
      resolvedView?.withPan(targetPan).state.viewState ??
      getPlanarProjectionFallbackViewStateWithPan(
        baseViewState,
        targetPan,
        snapshot.canvasWidth,
        snapshot.canvasHeight
      );

    return preserveDisplayAreaClear(
      nextViewState,
      hasDisplayArea && presentation.displayArea === undefined
    );
  }

  return preserveDisplayAreaClear(
    normalizePlanarViewState({
      ...viewState,
      ...nextCamera,
    }),
    hasDisplayArea && presentation.displayArea === undefined
  );
}
