import {
  StackViewport,
  VolumeViewport,
  Types,
  utilities as csUtils,
} from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import filterAnnotationsWithinSamePlan from './filterAnnotationsWithinPlan';
import type { Annotations } from '../../types';

/**
 * Given the viewport and the annotations, it filters the annotations array and only
 * return those annotation that should be displayed on the viewport
 * @param annotations - Annotations
 * @param onSamePlan - Check if the annotation is on the same plan and not only on the same slice
 * @returns A filtered version of the annotations.
 */
export default function filterAnnotationsForDisplay(
  viewport: Types.IViewport,
  annotations: Annotations,
  filterOptions: Types.ReferenceCompatibleOptions = {},
  onSamePlan?: boolean
): Annotations {
  if (viewport instanceof VolumeViewport) {
    const camera = viewport.getCamera();

    const { spacingInNormalDirection } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera);

    if (!onSamePlan) {
      // Get data with same normal and within the same slice
      return filterAnnotationsWithinSlice(
        annotations,
        camera,
        spacingInNormalDirection
      );
    } else {
      return filterAnnotationsWithinSamePlan(
        annotations,
        camera,
        spacingInNormalDirection
      );
    }
  }
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId();

    // 2. remove the dataLoader scheme since it might be an annotation that was
    // created on the volumeViewport initially and has the volumeLoader scheme
    // but shares the same imageId
    const colonIndex = imageId.indexOf(':');

    filterOptions.imageURI = imageId.substring(colonIndex + 1);
  }
  return annotations.filter((annotation) => {
    if (!annotation.isVisible) {
      return false;
    }
    return viewport.isReferenceViewable(annotation.metadata, filterOptions);
  });
}
