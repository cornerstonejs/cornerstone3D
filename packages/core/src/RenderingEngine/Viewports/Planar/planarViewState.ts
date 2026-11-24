import { OrientationAxis } from '../../../enums';
import type DisplayArea from '../../../types/displayArea';
import { deepClone } from '../../../utilities/deepClone';
import { clonePlanarOrientation } from './planarOrientationAndScaling';
import type {
  PlanarDisplayArea,
  PlanarSliceState,
  PlanarViewState,
} from './PlanarViewportTypes';
import { normalizePlanarRotation } from './planarViewFraming';
import {
  clonePlanarScale,
  normalizePlanarScaleMode,
} from './planarCameraScale';

export function cloneDisplayArea<T extends DisplayArea | PlanarDisplayArea>(
  displayArea?: T
): T | undefined {
  return deepClone(displayArea);
}

/**
 * A view state patch with the framing that its display area implies. A patch
 * with a defined `displayArea` and none of `scale`, `scaleMode`,
 * `anchorWorld` and `anchorCanvas` shows the area as it is: scale `[1, 1]`,
 * the scale mode of the area (`fit` without one), no world anchor and the
 * canvas anchor in the centre. Any other patch is returned as it is, so an
 * explicit field wins and `{ displayArea: undefined }` only clears the area.
 */
export function withDisplayAreaFraming(
  patch: Partial<PlanarViewState>
): Partial<PlanarViewState> {
  const { displayArea } = patch;

  if (
    !displayArea ||
    ['scale', 'scaleMode', 'anchorWorld', 'anchorCanvas'].some((key) =>
      Object.prototype.hasOwnProperty.call(patch, key)
    )
  ) {
    return patch;
  }

  return {
    ...patch,
    scale: [1, 1],
    scaleMode: displayArea.scaleMode ?? 'fit',
    anchorWorld: undefined,
    anchorCanvas: [0.5, 0.5],
  };
}

export function createDefaultPlanarViewState(): PlanarViewState {
  return {
    slice: {
      kind: 'stackIndex',
      imageIdIndex: 0,
    },
    orientation: OrientationAxis.ACQUISITION,
    flipHorizontal: false,
    flipVertical: false,
    anchorCanvas: [0.5, 0.5],
    scale: [1, 1],
    scaleMode: 'fit',
    rotation: 0,
  };
}

function cloneSlice(slice?: PlanarSliceState): PlanarSliceState | undefined {
  if (!slice) {
    return;
  }

  if (slice.kind === 'stackIndex') {
    return {
      kind: 'stackIndex',
      imageIdIndex: Math.max(0, Math.round(slice.imageIdIndex)),
    };
  }

  return {
    kind: 'volumePoint',
    sliceWorldPoint: [...slice.sliceWorldPoint],
  };
}

export function normalizePlanarViewState(
  viewState: PlanarViewState
): PlanarViewState {
  return {
    ...(viewState.slice ? { slice: cloneSlice(viewState.slice) } : {}),
    orientation:
      clonePlanarOrientation(viewState.orientation) ??
      OrientationAxis.ACQUISITION,
    flipHorizontal: viewState.flipHorizontal === true,
    flipVertical: viewState.flipVertical === true,
    anchorCanvas: viewState.anchorCanvas
      ? [...viewState.anchorCanvas]
      : [0.5, 0.5],
    scale: clonePlanarScale(viewState.scale),
    scaleMode: normalizePlanarScaleMode(
      viewState.displayArea?.scaleMode ?? viewState.scaleMode
    ),
    rotation: normalizePlanarRotation(viewState.rotation ?? 0),
    ...(viewState.displayArea
      ? { displayArea: cloneDisplayArea(viewState.displayArea) }
      : {}),
    ...(viewState.anchorWorld
      ? { anchorWorld: [...viewState.anchorWorld] }
      : {}),
  };
}
