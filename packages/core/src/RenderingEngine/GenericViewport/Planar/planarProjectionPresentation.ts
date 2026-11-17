import type { Point2 } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
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
 * The scale of each axis for a zoom of a view whose scale now is
 * `currentScale`. The zoom of a planar view is its vertical scale, so the
 * zoom is the new vertical scale and the horizontal scale keeps its ratio to
 * it: a view that is stretched stays stretched by the same amount.
 */
function getPlanarScaleForZoom(zoom: number, currentScale: Point2): Point2 {
  const [scaleX, scaleY] = normalizePlanarScale(currentScale);
  const [nextScaleY] = normalizePlanarScale(zoom);

  return normalizePlanarScale([(nextScaleY * scaleX) / scaleY, nextScaleY]);
}

/**
 * The view state that shows the centre of the slice `pan` canvas pixels from
 * the centre of the canvas. It holds no world anchor: the pan of such a view
 * is the place of its canvas anchor at any scale, rotation and flip, so the
 * new state needs no resolved view of its own. The cleared world anchor stays
 * as an own undefined property, because `setViewState` merges patches.
 */
function getPlanarViewStateWithPanFromSliceCentre(
  viewState: PlanarViewState,
  pan: Point2,
  canvasWidth: number,
  canvasHeight: number
): PlanarViewState {
  return {
    ...normalizePlanarViewState({
      ...viewState,
      anchorCanvas: [
        0.5 + pan[0] / Math.max(canvasWidth, 1),
        0.5 + pan[1] / Math.max(canvasHeight, 1),
      ],
      anchorWorld: undefined,
      displayArea: undefined,
    }),
    anchorWorld: undefined,
  };
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
 *
 * A zoom in the patch is the new vertical scale and keeps the ratio of the
 * two axes, so a stretched view stays stretched. A scale in the patch is
 * taken as it is, and wins over a zoom. With a display area in the patch, a
 * zoom is the scale of both axes against that area.
 *
 * A pan in the patch is the place of the centre of the slice. The view
 * state it gives holds no world anchor, so a pan after a zoom at a canvas
 * point is right at the new scale and rotation.
 *
 * With `options.anchorCanvas`, a patch that has a zoom or a scale keeps the
 * world point under that canvas point under it, in one view state. A pan or
 * a display area in the patch decides where the picture is, so the anchor is
 * not used then, and not for a view that shows no data.
 */
export function withPlanarProjectionPresentation(
  snapshot: PlanarProjectionSnapshot,
  presentation: Partial<PlanarViewPresentation>,
  options: ProjectionWriteOptions = {}
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
  const currentScale = snapshot.presentation.scaleVector;
  const nextScale = hasScale
    ? normalizePlanarScale(presentation.scale)
    : typeof presentation.zoom === 'number' && !hasDisplayArea
      ? getPlanarScaleForZoom(presentation.zoom, currentScale)
      : normalizePlanarScale(presentation.zoom ?? currentScale);
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

    const getViewStateWithPan = snapshot.resolvedView
      ? getPlanarViewStateWithPanFromSliceCentre
      : getPlanarProjectionFallbackViewStateWithPan;
    const nextViewState =
      resolvedView?.withPan(targetPan).state.viewState ??
      getViewStateWithPan(
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

  const anchoredView =
    options.anchorCanvas && !hasDisplayArea && (hasZoom || hasScale)
      ? snapshot.resolvedView?.withScale?.(nextScale, options.anchorCanvas)
      : undefined;

  if (anchoredView) {
    return normalizePlanarViewState({
      ...anchoredView.state.viewState,
      flipHorizontal,
      flipVertical,
      rotation,
    });
  }

  return preserveDisplayAreaClear(
    normalizePlanarViewState({
      ...viewState,
      ...nextCamera,
    }),
    hasDisplayArea && presentation.displayArea === undefined
  );
}
