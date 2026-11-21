import type { Types, PlanarViewport } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import filterAnnotationsWithinSlice from './filterAnnotationsWithinSlice';
import getViewportICamera from '../getViewportICamera';
import type { Annotation, Annotations } from '../../types';

/**
 * Given the viewport and the annotations, it filters the annotations array and only
 * return those annotation that should be displayed on the viewport.
 * A viewport that checks references by `isReferenceViewable` also gets the
 * handle points of each annotation in the `points` option.
 *
 * An annotation with a range of slices (a `multiSliceReference` in its
 * metadata, which `AnnotationMultiSlice` sets) shows on the slices of the
 * range and not on the others, in volume mode as in stack mode: the viewport
 * decides it by its reference. A range of images shows on the slices that
 * show those images. A range of slices of a volume in another plane counts in
 * the slices of that plane of that volume: it shows on those slices of a
 * viewport that shows the volume in that plane, and not in another plane.
 * @param annotations - Annotations
 * @returns A filtered version of the annotations.
 */
export default function filterAnnotationsForDisplay(
  viewport: Types.IViewport,
  annotations: Annotations,
  filterOptions: Types.ReferenceCompatibleOptions = {}
): Annotations {
  // Volume-backed viewports project annotations GEOMETRICALLY: an annotation
  // drawn on any viewport sharing the volume / frame of reference renders onto
  // this slice when it lies within it (parallel plane + world-space proximity).
  // This covers PLANAR viewports in volume mode (MPR), which MUST use this
  // geometric path rather than the index-based isReferenceViewable below: a
  // measurement drawn in vtkImage/stack mode carries a STACK sliceIndex that
  // never matches the MPR volume's currentImageIdIndex, so the index check rejects it -- but the
  // world-space slice proximity still holds, so the geometric path renders it
  // across to MPR exactly as legacy did. (ohifohifnextapi-23b)
  if (csUtils.getViewportContentMode(viewport) === 'volume') {
    // Native PLANAR viewports do not implement getCamera(); the ICamera
    // bridge derives the equivalent { viewPlaneNormal, focalPoint, ... } from the
    // resolved view / view reference.
    const camera = getViewportICamera(viewport) as Types.ICamera;

    const { spacingInNormalDirection } =
      csUtils.getTargetVolumeAndSpacingInNormalDir(
        viewport as PlanarViewport,
        camera
      );

    // Get data with same normal and within the same slice
    const annotationsWithinSlice = new Set(
      filterAnnotationsWithinSlice(
        annotations.filter((annotation) => !hasSliceRange(annotation)),
        camera,
        spacingInNormalDirection
      )
    );

    return annotations.filter((annotation) =>
      hasSliceRange(annotation)
        ? isAnnotationViewable(viewport, annotation, filterOptions)
        : annotationsWithinSlice.has(annotation)
    );
  }
  return annotations.filter((annotation) =>
    isAnnotationViewable(viewport, annotation, filterOptions)
  );
}

/**
 * Whether an annotation has a range of slices: the end of the range in the
 * `multiSliceReference` of its metadata.
 */
function hasSliceRange(annotation: Annotation): boolean {
  return Boolean(annotation.metadata?.multiSliceReference);
}

/**
 * Whether the viewport shows an annotation by its reference, with the handle
 * points of the annotation in the `points` option.
 */
function isAnnotationViewable(
  viewport: Types.IViewport,
  annotation: Annotation,
  filterOptions: Types.ReferenceCompatibleOptions
): boolean {
  if (!annotation.isVisible) {
    return false;
  }
  if (annotation.data.isCanvasAnnotation) {
    return true;
  }
  const points = annotation.data?.handles?.points;

  return viewport.isReferenceViewable(
    annotation.metadata,
    points?.length ? { ...filterOptions, points } : filterOptions
  );
}
