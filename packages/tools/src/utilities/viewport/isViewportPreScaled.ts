import type { Types } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';

/**
 * Whether the voxels backing `targetId` in `viewport` are already pre-scaled
 * into modality units (e.g. SUV). Thin wrapper over the family-aware
 * {@link utilities.getScalingDescriptor} so stack / volume / generic ("next")
 * viewports share one detection path; returns false for families with no
 * scaling concept.
 */
function isViewportPreScaled(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  targetId: string
): boolean {
  return !!utilities.getScalingDescriptor(viewport, targetId)?.isPreScaled;
}

export { isViewportPreScaled };
