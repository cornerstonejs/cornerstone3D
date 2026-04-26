import { OrientationAxis } from '../../../enums';
import type DisplayArea from '../../../types/displayArea';
import { deepClone } from '../../../utilities/deepClone';
import { clonePlanarOrientation } from './planarLegacyCompatibility';
import type {
  PlanarDisplayArea,
  PlanarSliceState,
  PlanarViewState,
} from './PlanarViewportTypes';
import { normalizePlanarRotation } from './planarViewPresentation';
import {
  clonePlanarScale,
  normalizePlanarScaleMode,
} from './planarCameraScale';

export function cloneDisplayArea<T extends DisplayArea | PlanarDisplayArea>(
  displayArea?: T
): T | undefined {
  return deepClone(displayArea);
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
    anchorCanvas: viewState.anchorCanvas ?? [0.5, 0.5],
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
