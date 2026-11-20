import type { Point2 } from '../../../types';
import type { ViewPresentationSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import { normalizePlanarScale } from './planarCameraScale';
import { getPlanarProjectionFallbackViewStateWithPan } from './planarProjectionFallback';
import { derivePlanarPresentation } from './planarRenderCamera';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionZoom,
} from './planarProjectionSnapshot';
import type { PlanarProjectionSnapshot } from './PlanarProjectionTypes';
import { getPlanarRotationAfterFlips } from './planarViewPresentation';
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
 * Keeps what a patch clears as own undefined properties after the
 * normalization, because `setViewState` merges patches: the display area
 * that the patch takes away, and the world anchor that a display area of the
 * patch replaces, or that a view resolved without one leaves out.
 */
function preserveClears(
  viewState: PlanarViewState,
  clears: { displayArea?: boolean; anchorWorld?: boolean }
): PlanarViewState {
  return {
    ...viewState,
    ...(clears.displayArea ? { displayArea: undefined } : {}),
    ...(clears.anchorWorld ? { anchorWorld: undefined } : {}),
  };
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
 * The scale of a view state that shows its display area at `scale` against
 * the fit. A display area resolves to a scale of its own on the slice, and
 * the scale of the view state multiplies it. A scale (`perAxis`) is divided
 * axis by axis; a zoom keeps the ratio of the two axes that the display area
 * gives. Without a display area, or without a slice to resolve it on, the
 * scale is taken as it is.
 */
function getScaleNextToDisplayArea(
  snapshot: PlanarProjectionSnapshot,
  viewState: PlanarViewState,
  scale: Point2,
  perAxis: boolean
): Point2 {
  const sliceBasis = snapshot.resolvedView?.getSliceBasis?.();

  if (!viewState.displayArea || !sliceBasis) {
    return scale;
  }

  const [areaScaleX, areaScaleY] = derivePlanarPresentation({
    sliceBasis,
    camera: { ...viewState, scale: [1, 1] },
    canvasWidth: snapshot.canvasWidth,
    canvasHeight: snapshot.canvasHeight,
  }).scale;

  return normalizePlanarScale([
    scale[0] / (perAxis ? areaScaleX : areaScaleY),
    scale[1] / areaScaleY,
  ]);
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
 * A zoom in the patch is the new vertical scale against the fit and keeps
 * the ratio of the two axes, so a stretched view stays stretched. A scale in
 * the patch is taken as it is, and wins over a zoom. Next to a display area
 * in the patch, a zoom and a scale are against the fit too, as
 * `getPlanarProjectionPresentation` reads them, so writing back a
 * presentation that was read gives the same view.
 *
 * A rotation and flips in one patch flip the view first and turn it after,
 * as the 5.x `setViewPresentation` did. A patch that changes a flip and has
 * no rotation mirrors the picture on the screen, as 5.x did too: the
 * rotation becomes 360 minus the rotation for each flip that changes.
 *
 * A pan in the patch is the place of the centre of the slice. The view
 * state it gives holds no world anchor, so a pan after a zoom at a canvas
 * point is right at the new scale and rotation. A pan decides where the
 * picture is, so a display area in the same patch gives way to it.
 *
 * With `options.anchorCanvas`, a patch that has a zoom or a scale keeps the
 * world point under that canvas point under it, in one view state. A pan or
 * a display area in the patch decides where the picture is, so the anchor is
 * not used then, and not for a view that shows no data. With no anchor and
 * no pan, a zoom or a scale is about the centre of the canvas, as the legacy
 * viewports zoomed about the focal point. A world anchor of the view state
 * stays, at its canvas point moved by the zoom.
 *
 * A display area in the view state decides the zoom and the pan while it is
 * there. A patch with a pan, a zoom or a scale and no display area takes it
 * away, and starts from the picture that it gave: a pan moves the picture at
 * the scale that the display area resolved to, and a zoom or a scale grows it
 * from that scale, about the anchor or, with no anchor, about the centre of
 * the canvas. The display area is cleared as an own undefined property,
 * because `setViewState` merges patches.
 *
 * A display area in the patch replaces a world anchor of the view state,
 * which is cleared as an own undefined property too.
 */
export function withPlanarProjectionPresentation(
  snapshot: PlanarProjectionSnapshot,
  presentation: Partial<PlanarViewPresentation>,
  options: ProjectionWriteOptions = {}
): PlanarViewState {
  const {
    pan,
    flipHorizontal = snapshot.viewState?.flipHorizontal ?? false,
    flipVertical = snapshot.viewState?.flipVertical ?? false,
  } = presentation;
  const rotation = hasOwn(presentation, 'rotation')
    ? (presentation.rotation ?? snapshot.presentation.rotation)
    : getPlanarRotationAfterFlips(
        {
          rotation: snapshot.presentation.rotation,
          flipHorizontal: snapshot.viewState?.flipHorizontal,
          flipVertical: snapshot.viewState?.flipVertical,
        },
        { flipHorizontal, flipVertical }
      );
  const viewState = snapshot.viewState ?? {};
  const hasZoom = hasOwn(presentation, 'zoom');
  const hasScale = hasOwn(presentation, 'scale');
  const hasDisplayArea = hasOwn(presentation, 'displayArea') && !pan;
  const dropsDisplayArea =
    !hasDisplayArea &&
    (Boolean(viewState.displayArea) || hasOwn(presentation, 'displayArea')) &&
    (Boolean(pan) || hasZoom || hasScale);
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
    nextCamera.scaleMode = displayArea?.scaleMode ?? 'fit';
    nextCamera.scale =
      hasZoom || hasScale
        ? getScaleNextToDisplayArea(
            snapshot,
            { ...viewState, ...nextCamera },
            nextScale,
            hasScale
          )
        : [1, 1];
  } else if (
    hasZoom ||
    hasScale ||
    dropsDisplayArea ||
    !viewState.displayArea
  ) {
    nextCamera.scale = nextScale;
    nextCamera.scaleMode = 'fit';
  }

  if (dropsDisplayArea) {
    nextCamera.displayArea = undefined;
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

    return preserveClears(nextViewState, {
      displayArea: dropsDisplayArea,
      anchorWorld: !nextViewState.anchorWorld,
    });
  }

  const anchoredView =
    !hasDisplayArea && (hasZoom || hasScale)
      ? snapshot.resolvedView?.withScale?.(nextScale, options.anchorCanvas)
      : undefined;

  if (anchoredView) {
    return preserveClears(
      normalizePlanarViewState({
        ...anchoredView.state.viewState,
        flipHorizontal,
        flipVertical,
        rotation,
      }),
      {
        displayArea: dropsDisplayArea,
        anchorWorld: !anchoredView.state.viewState.anchorWorld,
      }
    );
  }

  return preserveClears(
    normalizePlanarViewState({
      ...viewState,
      ...nextCamera,
    }),
    {
      displayArea:
        dropsDisplayArea ||
        (hasDisplayArea && presentation.displayArea === undefined),
      anchorWorld: hasDisplayArea,
    }
  );
}
