import * as utils from '.';
import { IViewport } from '../types';

const DEFAULT_MULTIPLIER = 4;

function getVOIMultipliers(
  viewport: IViewport,
  volumeId?: string,
  options?: {
    fixedPTWindowWidth?: boolean;
  }
): [number, number] {
  const modality = utils.getViewportModality(viewport, volumeId);
  const isPreScaled = utils.isViewportPreScaled(viewport, volumeId);
  const { fixedPTWindowWidth = true } = options ?? {};

  if (modality === 'PT') {
    const { clientWidth, clientHeight } = viewport.element;
    const ptMultiplier = 5 / Math.max(clientWidth, clientHeight);

    // Set the "X" multiplier equal to zero in order to do not allow
    // any change to the window width (0 * cursorDeltaX = 0)
    const xMultiplier = fixedPTWindowWidth ? 0 : ptMultiplier;

    return isPreScaled
      ? [xMultiplier, ptMultiplier]
      : [xMultiplier, DEFAULT_MULTIPLIER];
  }

  return [DEFAULT_MULTIPLIER, DEFAULT_MULTIPLIER];
}

export { getVOIMultipliers as default, getVOIMultipliers };
