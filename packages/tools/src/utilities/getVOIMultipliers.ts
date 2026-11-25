import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

const DEFAULT_MULTIPLIER = 4;

function getVOIMultipliers(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  volumeId?: string,
  options?: {
    fixedPTWindowWidth?: boolean;
  }
): [number, number] {
  // Single family-aware read for both the modality and the pre-scaled state,
  // instead of interrogating the viewport twice.
  const { modality, isPreScaled } =
    csUtils.getScalingDescriptor(viewport, volumeId) ?? {};

  if (modality === 'PT') {
    const { clientWidth, clientHeight } = viewport.element;
    const ptMultiplier = 5 / Math.max(clientWidth, clientHeight);
    const { fixedPTWindowWidth = true } = options ?? {};

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
