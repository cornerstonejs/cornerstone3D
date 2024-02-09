import {
  StackViewport,
  VolumeViewport,
  WSIViewport,
  VideoViewport,
  Types,
  utilities as csUtils,
} from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import type { Annotations } from '../../types';
import annotationFrameRange from '../annotationFrameRange';

const baseUrlExtractor = /(videoId:|imageId:|volumeId:)([a-zA-Z]*:)/;

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
  if (viewport instanceof StackViewport || viewport instanceof WSIViewport) {
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

      // The referenced image id can be a targetId, so handle removing the
      // imageId portion to make the base comparison work.
      const imageId = annotation.metadata.referencedImageId?.replace(
        'imageId:',
        ''
      );

      if (imageId === undefined) {
        // This annotation was not drawn on a non-coplanar reformat, and such does
        // not have a referenced imageId.
        return false;
      }

      const colonIndex = imageId.indexOf(':');
      const referenceImageURI = imageId.substring(colonIndex + 1);
      return referenceImageURI === imageURI;
    });
  } else if (viewport instanceof VideoViewport) {
    const frameOfReferenceUID: string = viewport.getFrameOfReferenceUID();

    return annotations.filter((annotation) => {
      if (!annotation.isVisible) {
        return false;
      }
      if (annotation.metadata.FrameOfReferenceUID !== frameOfReferenceUID) {
        return false;
      }
      const testURI = annotation.metadata.referencedImageId.replace(
        baseUrlExtractor,
        ''
      );

      if (!viewport.hasImageURI(testURI)) {
        return false;
      }
      const range = annotationFrameRange.getFrameRange(annotation);
      const frameNumber = viewport.getFrameNumber();
      if (Array.isArray(range)) {
        return frameNumber >= range[0] && frameNumber <= range[1];
      }
      return Math.abs(frameNumber - range) < 1;
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
