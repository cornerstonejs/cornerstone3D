import {
  StackViewport,
  VolumeViewport,
  Types,
  utilities as csUtils,
} from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import { Annotations } from '../../types';

/**
 * Given the viewport and the annotations, it filters the annotations array and only
 * return those annotation that should be displayed on the viewport
 * @param annotations - Annotations
 * @returns A filtered version of the annotations.
 */
export default function filterAnnotationsForDisplay(
  viewport: Types.IViewport,
  annotations: Annotations
): Annotations {
  if (viewport instanceof StackViewport) {
    // 1. Get the currently displayed imageId from the StackViewport
    const imageId = viewport.getCurrentImageId();

    // 2. remove the dataLoader scheme since it might be an annotation that was
    // created on the volumeViewport initially and has the volumeLoader scheme
    // but shares the same imageId
    const colonIndex = imageId.indexOf(':');
    const imageURI = imageId.substring(colonIndex + 1);

    // 3. Filter annotation in the frame of reference by the referenced image ID property
    // Note: With the current implementation drawing on the stack (PT stack) will not
    // show the annotation on a volume that does not share the same imageURIs (CT Volume),
    // and we don't have a proper way to check distance either since a stack can be
    // composed of multiple unrelated images
    return annotations.filter((annotation) => {
      if (!annotation.isVisible) {
        return false;
      }

      const imageId = annotation.metadata.referencedImageId;

      if (imageId === undefined) {
        // This annotation was not drawn on a non-coplanar reformat, and such does
        // note have a referenced imageId.
        return false;
      }

      const colonIndex = imageId.indexOf(':');
      const referenceImageURI = imageId.substring(colonIndex + 1);
      return referenceImageURI === imageURI;
    });
  } else if (viewport instanceof VolumeViewport) {
    const camera = viewport.getCamera();

    const { spacingInNormalDirection } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(viewport, camera);

    // Get data with same normal and within the same slice
    return filterAnnotationsWithinSlice(
      annotations,
      camera,
      spacingInNormalDirection
    );
  } else {
    throw new Error(`Viewport Type ${viewport.type} not supported`);
  }
}
