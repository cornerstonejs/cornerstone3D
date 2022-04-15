import {
  StackViewport,
  Types,
  VolumeViewport,
  utilities as csUtils,
} from '@cornerstonejs/core';
import clip from '../clip';
import getSliceRange from './getSliceRange';
import snapFocalPointToSlice from './snapFocalPointToSlice';

type ScrollOptions = {
  direction: number;
  invert: boolean;
  volumeId?: string;
};

/**
 * It scrolls one slice in the Stack or Volume Viewport, it uses the options provided
 * to determine the slice to scroll to. For Stack Viewport, it scrolls in the 1 or -1
 * direction, for Volume Viewport, it uses the camera and focal point to determine the
 * slice to scroll to based on the spacings.
 * @param viewport - The viewport in which to scroll
 * @param options - Options to use for scrolling, including direction, invert, and volumeId
 * @returns
 */
export default function scrollThroughStack(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  options: ScrollOptions
): void {
  const { type: viewportType } = viewport;
  const { volumeId, direction, invert } = options;

  const delta = invert ? -direction : direction;

  if (viewport instanceof StackViewport) {
    // stack viewport
    const currentImageIdIndex = viewport.getCurrentImageIdIndex();
    const numberOfFrames = viewport.getImageIds().length;
    let newImageIdIndex = currentImageIdIndex + delta;
    newImageIdIndex = clip(newImageIdIndex, 0, numberOfFrames - 1);

    viewport.setImageIdIndex(newImageIdIndex);
  } else if (viewport instanceof VolumeViewport) {
    const camera = viewport.getCamera();
    const { focalPoint, viewPlaneNormal, position } = camera;
    const { spacingInNormalDirection, imageVolume } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera, volumeId);

    if (!imageVolume) {
      return;
    }

    const actor = viewport.getActor(imageVolume.volumeId);

    if (!actor) {
      console.warn('No actor found for with actorUID of', imageVolume.volumeId);
    }

    const { volumeActor } = actor;
    const scrollRange = getSliceRange(volumeActor, viewPlaneNormal, focalPoint);

    const { newFocalPoint, newPosition } = snapFocalPointToSlice(
      focalPoint,
      position,
      scrollRange,
      viewPlaneNormal,
      spacingInNormalDirection,
      delta
    );

    viewport.setCamera({
      focalPoint: newFocalPoint,
      position: newPosition,
    });
    viewport.render();
  } else {
    throw new Error(`Not implemented for Viewport Type: ${viewportType}`);
  }
}
