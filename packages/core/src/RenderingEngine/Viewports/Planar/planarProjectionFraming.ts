import type { Point2 } from '../../../types';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type { ProjectionWriteOptions } from '../ViewportProjectionTypes';
import type { CameraScaleMode } from '../ViewportCameraTypes';
import {
  normalizePlanarScale,
  normalizePlanarScaleMode,
} from './planarCameraScale';
import { getPlanarProjectionFallbackViewStateWithPan } from './planarProjectionFallback';
import { derivePlanarFraming } from './planarRenderCamera';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionZoom,
} from './planarProjectionSnapshot';
import type { PlanarProjectionSnapshot } from './PlanarProjectionTypes';
import { getStretchedFitRatio } from './planarSliceBasis';
import { getPlanarRotationAfterFlips } from './planarViewFraming';
import {
  cloneDisplayArea,
  normalizePlanarViewState,
  withDisplayAreaFraming,
} from './planarViewState';
import type {
  PlanarViewFraming,
  PlanarViewFramingSelector,
  PlanarViewState,
} from './PlanarViewportTypes';

const DEFAULT_SELECTOR: Required<
  Pick<
    PlanarViewFramingSelector,
    | 'rotation'
    | 'displayArea'
    | 'zoom'
    | 'scale'
    | 'scaleMode'
    | 'fitScale'
    | 'pan'
    | 'flipHorizontal'
    | 'flipVertical'
  >
> = {
  rotation: true,
  displayArea: true,
  zoom: true,
  scale: true,
  scaleMode: true,
  fitScale: true,
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

  const [areaScaleX, areaScaleY] = derivePlanarFraming({
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
 * PlanarViewFraming compatibility shape.
 */
export function getPlanarProjectionFraming(
  snapshot: PlanarProjectionSnapshot,
  selector: ViewFramingSelector | undefined
): PlanarViewFraming {
  const target: PlanarViewFraming = {};
  const planarSelector =
    (selector as PlanarViewFramingSelector | undefined) ?? DEFAULT_SELECTOR;

  if (planarSelector.rotation) {
    target.rotation = snapshot.framing.rotation;
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

  if (planarSelector.scaleMode) {
    target.scaleMode = normalizePlanarScaleMode(snapshot.viewState?.scaleMode);
  }

  if (planarSelector.fitScale) {
    target.fitScale = normalizePlanarScale(snapshot.viewState?.scale);
  }

  if (planarSelector.pan) {
    const scale = getPlanarProjectionScale(snapshot);
    const pan = getPlanarProjectionPan(snapshot);

    target.pan = [pan[0] / scale[0], pan[1] / scale[1]];
  }

  if (planarSelector.flipHorizontal) {
    target.flipHorizontal = snapshot.framing.flipHorizontal ?? false;
  }

  if (planarSelector.flipVertical) {
    target.flipVertical = snapshot.framing.flipVertical ?? false;
  }

  return target;
}

/**
 * The vertical scale, against the plain fit, at which the slice of a view
 * state, stretched by the ratio of the two axes of `scale`, fits the canvas
 * of the snapshot: the factor between the scale of a `fitAspect` view state
 * and the scale of its picture. 1 when no slice resolves.
 */
function getFitAspectRatio(
  snapshot: PlanarProjectionSnapshot,
  viewState: PlanarViewState,
  scale: Point2
): number {
  const sliceBasis = (
    snapshot.resolveViewState?.(viewState) ?? snapshot.resolvedView
  )?.getSliceBasis?.();

  if (!sliceBasis) {
    return 1;
  }

  return getStretchedFitRatio({
    canvasWidth: snapshot.canvasWidth,
    canvasHeight: snapshot.canvasHeight,
    widthWorld: sliceBasis.sliceWidthWorld,
    heightWorld: sliceBasis.sliceHeightWorld,
    stretch: scale[0] / scale[1],
  });
}

/**
 * A view state without a display area whose scale is the scale of its
 * picture against the plain fit, written in `scaleMode`. Only `fitAspect`
 * reads the scale against another fit (the fit of the stretched slice), so
 * only then the scale changes. With `fitScale` the scale is that one.
 */
function withScaleMode(
  snapshot: PlanarProjectionSnapshot,
  viewState: PlanarViewState,
  scaleMode: CameraScaleMode,
  fitScale?: Point2
): PlanarViewState {
  if (scaleMode !== 'fitAspect') {
    return { ...viewState, scaleMode };
  }

  const scale = normalizePlanarScale(viewState.scale);
  const ratio = getFitAspectRatio(snapshot, viewState, scale);

  return {
    ...viewState,
    scale: fitScale ?? [scale[0] / ratio, scale[1] / ratio],
    scaleMode,
  };
}

/**
 * Converts a Planar view-framing patch back into normalized semantic
 * PlanarViewState.
 *
 * A zoom in the patch is the new vertical scale against the fit and keeps
 * the ratio of the two axes, so a stretched view stays stretched. A scale in
 * the patch is taken as it is, and wins over a zoom. A `fitScale` wins over
 * both: it is the scale of the view state in the scale mode of the patch,
 * so a framing that was read gives the same fit on a canvas of another size.
 * A `scaleMode` in the patch is the scale mode of the view state; without
 * one, a patch that sets the scale gives `fit`.
 *
 * A rotation and flips in one patch flip the view first and turn it after,
 * as the view setter of 5.x did. A patch that changes a flip and has
 * no rotation mirrors the picture on the screen, as 5.x did too: the
 * rotation becomes 360 minus the rotation for each flip that changes.
 *
 * A pan in the patch is the place of the centre of the slice. The view
 * state it gives holds no world anchor, so a pan after a zoom at a canvas
 * point is right at the new scale and rotation.
 *
 * A display area in the patch decides where the picture is: the pan of the
 * same patch is not used. It shows the area as `setViewState({ displayArea
 * })` does, at the `fitScale` of the patch, or at its zoom or scale against
 * the fit, or else as the area is. A world anchor of the view state is
 * cleared as an own undefined property, because `setViewState` merges
 * patches.
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
 */
export function withPlanarProjectionFraming(
  snapshot: PlanarProjectionSnapshot,
  framing: Partial<PlanarViewFraming>,
  options: ProjectionWriteOptions = {}
): PlanarViewState {
  const {
    pan,
    flipHorizontal = snapshot.viewState?.flipHorizontal ?? false,
    flipVertical = snapshot.viewState?.flipVertical ?? false,
  } = framing;
  const rotation = hasOwn(framing, 'rotation')
    ? (framing.rotation ?? snapshot.framing.rotation)
    : getPlanarRotationAfterFlips(
        {
          rotation: snapshot.framing.rotation,
          flipHorizontal: snapshot.viewState?.flipHorizontal,
          flipVertical: snapshot.viewState?.flipVertical,
        },
        { flipHorizontal, flipVertical }
      );
  const viewState = snapshot.viewState ?? {};
  const hasZoom = hasOwn(framing, 'zoom');
  const hasScale = hasOwn(framing, 'scale');
  const fitScale = framing.fitScale
    ? normalizePlanarScale(framing.fitScale)
    : undefined;
  const scaleMode = framing.scaleMode
    ? normalizePlanarScaleMode(framing.scaleMode)
    : undefined;
  const changesScale = hasZoom || hasScale || Boolean(fitScale);
  const currentScale = snapshot.framing.scaleVector;
  const nextCamera: Partial<PlanarViewState> = {
    flipHorizontal,
    flipVertical,
    rotation,
  };

  if (framing.displayArea) {
    Object.assign(
      nextCamera,
      withDisplayAreaFraming({
        displayArea: cloneDisplayArea(framing.displayArea),
      }),
      scaleMode ? { scaleMode } : {}
    );

    if (fitScale) {
      nextCamera.scale = fitScale;
    } else if (hasZoom || hasScale) {
      nextCamera.scale = getScaleNextToDisplayArea(
        snapshot,
        { ...viewState, ...nextCamera },
        normalizePlanarScale(
          hasScale ? framing.scale : (framing.zoom ?? currentScale)
        ),
        hasScale
      );
    }

    return preserveClears(
      normalizePlanarViewState({ ...viewState, ...nextCamera }),
      { anchorWorld: true }
    );
  }

  const clearsDisplayArea = hasOwn(framing, 'displayArea');

  if (clearsDisplayArea && !pan && !changesScale) {
    return preserveClears(
      normalizePlanarViewState({
        ...viewState,
        ...nextCamera,
        anchorCanvas: [0.5, 0.5],
        anchorWorld: undefined,
        displayArea: undefined,
        scale: [1, 1],
        scaleMode: scaleMode ?? 'fit',
      }),
      { displayArea: true, anchorWorld: true }
    );
  }

  const dropsDisplayArea =
    (Boolean(viewState.displayArea) || clearsDisplayArea) &&
    (Boolean(pan) || changesScale);
  const setsScale = changesScale || dropsDisplayArea || !viewState.displayArea;
  const nextScaleMode = scaleMode ?? 'fit';
  let nextScale = currentScale;

  if (fitScale) {
    const ratio =
      nextScaleMode === 'fitAspect'
        ? getFitAspectRatio(
            snapshot,
            normalizePlanarViewState({ ...viewState, ...nextCamera }),
            fitScale
          )
        : 1;

    nextScale = [fitScale[0] * ratio, fitScale[1] * ratio];
  } else if (hasScale) {
    nextScale = normalizePlanarScale(framing.scale);
  } else if (typeof framing.zoom === 'number') {
    nextScale = getPlanarScaleForZoom(framing.zoom, currentScale);
  }

  if (setsScale) {
    nextCamera.scale = nextScale;
    nextCamera.scaleMode = 'fit';
  } else if (scaleMode) {
    nextCamera.scaleMode = scaleMode;
  }

  if (dropsDisplayArea) {
    nextCamera.displayArea = undefined;
  }

  const inScaleMode = (state: PlanarViewState): PlanarViewState =>
    setsScale
      ? normalizePlanarViewState(
          withScaleMode(snapshot, state, nextScaleMode, fitScale)
        )
      : state;

  if (pan) {
    const baseViewState = normalizePlanarViewState({
      ...viewState,
      ...nextCamera,
    });
    const resolvedView =
      snapshot.resolveViewState?.(baseViewState) ??
      (baseViewState === snapshot.viewState
        ? snapshot.resolvedView
        : undefined);
    const panScale = resolvedView?.scale ?? nextScale;
    const targetPan: Point2 = [pan[0] * panScale[0], pan[1] * panScale[1]];

    const getViewStateWithPan = snapshot.resolvedView
      ? getPlanarViewStateWithPanFromSliceCentre
      : getPlanarProjectionFallbackViewStateWithPan;
    const nextViewState = inScaleMode(
      resolvedView?.withPan(targetPan).state.viewState ??
        getViewStateWithPan(
          baseViewState,
          targetPan,
          snapshot.canvasWidth,
          snapshot.canvasHeight
        )
    );

    return preserveClears(nextViewState, {
      displayArea: dropsDisplayArea,
      anchorWorld: !nextViewState.anchorWorld,
    });
  }

  const anchoredView = changesScale
    ? snapshot.resolvedView?.withScale?.(nextScale, options.anchorCanvas)
    : undefined;

  if (anchoredView) {
    const nextViewState = inScaleMode(
      normalizePlanarViewState({
        ...anchoredView.state.viewState,
        flipHorizontal,
        flipVertical,
        rotation,
      })
    );

    return preserveClears(nextViewState, {
      displayArea: dropsDisplayArea,
      anchorWorld: !nextViewState.anchorWorld,
    });
  }

  return preserveClears(
    inScaleMode(normalizePlanarViewState({ ...viewState, ...nextCamera })),
    { displayArea: dropsDisplayArea }
  );
}
